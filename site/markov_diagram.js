// ============================================================================
// markov_diagram.js - v1.0 - the Markov state diagram (IEC 61165).
// 13 Oct 2026 (v1.0, fix3-M): new. Every Markov model (projectConfig.markovModels) is drawn as a
// state-transition diagram on the one diagram editor (diagram_editor.js), above its state and
// transition tables. The diagram and the tables are two views of the SAME data: an edit in either is
// written to the model and the other redraws from it.
//
// NOTATION (IEC 61165 state-transition diagram)
//   - Operational state (circle): the system works.
//   - Degraded state (dashed circle, amber): works with reduced capability; counted as working.
//   - Failed state (double circle, red): counted in P(failed). A failed state with no way out is
//     absorbing (listed under Checks).
//   - Start (filled dot) with start arrows: the state the system starts in, or a starting
//     distribution (several arrows, each with its probability; they add up to 1).
//   - Failure transition (solid arrow, labeled λ) and repair transition (dashed arrow, labeled μ),
//     rates per hour. A transition from a state back into itself is not allowed (not a CTMC
//     transition; the solver refuses it by name).
//   - Phased missions (ARP4761A App I §I.2.9, markov_ctmc.js): the phase plan is edited under the
//     diagram, and the diagram can be shown per phase (rates scaled by the phase multiplier, or the
//     model the phase switches to), read only.
//
// DATA (what is stored; nothing else changes)
//   state:      { id, name, isFailed, degraded?, x?, y?, size?, sysmlRef? }
//   transition: { id, from (state name), to (state name), rate, kind ('failure' | 'repair'), sysmlRef? }
//   model:      initialState (one start arrow) or initialProbs { name: p } (start arrows with p),
//               startPos { x, y }
//   A model saved before this build has no ids or positions: it is drawn with a stable automatic
//   layout and ids st-<index> / tr-<index>, and nothing is written until somebody edits it.
//   Solving (steady state, transient, phased) is unchanged; markov_ctmc.js v1.2 reads initialProbs.
//
// Performance: an editor is mounted only when its card scrolls into view (IntersectionObserver),
// and kept (with its undo history) across table redraws.
// Tests: tests/regression_rbd_markov_diagrams_20261013b.test.js (pure mapping + browser checks).
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var D = 96;                      // default state diameter
    var STATE_KINDS = { operational: 1, degraded: 1, failed: 1 };
    var hasOwn = Object.prototype.hasOwnProperty;

    function S(v) { return v == null ? '' : String(v); }
    function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
    function num(v) { var n = Number(v); return v === '' || v == null || !isFinite(n) ? null : n; }
    function fmtRate(v) { var n = num(v); if (n == null) return null; if (n === 0) return '0'; var a = Math.abs(n); return (a >= 0.01 && a < 1000) ? String(+n.toPrecision(4)) : n.toExponential(2).replace('.00e', 'e'); }

    // ------------------------------------------------------------ pure mapping
    function stateId(s, i) { return (s && s.id) || ('st-' + i); }
    function transId(t, i) { return (t && t.id) || ('tr-' + i); }
    function kindOfState(s) { return s && s.isFailed ? 'failed' : (s && s.degraded ? 'degraded' : 'operational'); }
    // Failure or repair, for a transition that does not say: out of a failed state into a working one
    // is a repair (as the phased multiplier reads it), and so is a step back toward the start (fewer
    // transitions away from the starting state), the way restorations are drawn.
    function stepsFromStart(m) {
        var d = {}, q = [];
        startTargets(m).forEach(function (st) { if (d[st.name] == null) { d[st.name] = 0; q.push(st.name); } });
        while (q.length) { var nm = q.shift(); (m.transitions || []).forEach(function (t) { if (t && t.from === nm && d[t.to] == null) { d[t.to] = d[nm] + 1; q.push(t.to); } }); }
        return d;
    }
    function transKind(m, t, steps) {
        if (t && (t.kind === 'failure' || t.kind === 'repair')) return t.kind;
        var f = (m.states || []).filter(function (s) { return s && s.name === t.from; })[0], to = (m.states || []).filter(function (s) { return s && s.name === t.to; })[0];
        if (f && f.isFailed && to && !to.isFailed) return 'repair';
        steps = steps || stepsFromStart(m);
        return steps[t.from] != null && steps[t.to] != null && steps[t.to] < steps[t.from] ? 'repair' : 'failure';
    }
    function startTargets(m) {
        var states = m.states || [];
        if (m.initialProbs && typeof m.initialProbs === 'object' && !Array.isArray(m.initialProbs)) {
            var out = [];
            states.forEach(function (s) { if (s && hasOwn.call(m.initialProbs, s.name)) out.push({ name: s.name, p: m.initialProbs[s.name] }); });
            Object.keys(m.initialProbs).forEach(function (k) { if (!states.some(function (s) { return s && s.name === k; })) out.push({ name: k, p: m.initialProbs[k], missing: true }); });
            return out;
        }
        if (!states.length) return [];
        var nm = m.initialState != null && states.some(function (s) { return s && s.name === m.initialState; }) ? m.initialState : (m.initialState != null ? m.initialState : states[0].name);
        return [{ name: nm, p: null, missing: !states.some(function (s) { return s && s.name === nm; }) }];
    }
    // Deterministic automatic layout for a model without stored positions: columns by the number of
    // steps from the start, in table order inside a column.
    function autoLayout(m) {
        var states = m.states || [], pos = {}, layer = {}, q = [];
        var idOf = {}; states.forEach(function (s, i) { if (s && idOf[s.name] == null) idOf[s.name] = stateId(s, i); });
        startTargets(m).forEach(function (st) { var id = idOf[st.name]; if (id != null && layer[id] == null) { layer[id] = 0; q.push(st.name); } });
        if (!q.length && states.length) { layer[stateId(states[0], 0)] = 0; q.push(states[0].name); }
        while (q.length) {
            var nm = q.shift(), L = layer[idOf[nm]];
            (m.transitions || []).forEach(function (t) { if (t && t.from === nm && idOf[t.to] != null && layer[idOf[t.to]] == null) { layer[idOf[t.to]] = L + 1; q.push(t.to); } });
        }
        var maxL = 0; Object.keys(layer).forEach(function (k) { maxL = Math.max(maxL, layer[k]); });
        var rows = {};
        states.forEach(function (s, i) {
            var id = stateId(s, i), L = layer[id] != null ? layer[id] : maxL + 1;
            var r = rows[L] = (rows[L] || 0);
            pos[id] = { x: 90 + L * 200, y: 30 + r * 150 };
            rows[L] = r + 1;
        });
        return pos;
    }
    // model -> editor model
    function toDiagram(m) {
        m = m || {};
        var states = Array.isArray(m.states) ? m.states : [], trs = Array.isArray(m.transitions) ? m.transitions : [];
        var auto = null, need = states.some(function (s) { return !(s && isFinite(s.x) && isFinite(s.y)); });
        if (need) auto = autoLayout(m);
        var idByName = {};
        var elements = [];
        states.forEach(function (s, i) {
            if (!s) return;
            var id = stateId(s, i);
            if (idByName[s.name] == null) idByName[s.name] = id;
            var p = (isFinite(s.x) && isFinite(s.y)) ? { x: +s.x, y: +s.y } : auto[id];
            var sz = num(s.size) || D;
            var e = { id: id, kind: kindOfState(s), x: p.x, y: p.y, w: sz, h: sz, label: S(s.name), props: {} };
            if (s.sysmlRef) e.sysmlRef = s.sysmlRef;
            elements.push(e);
        });
        var connectors = [];
        var targets = startTargets(m);
        var first = targets[0] && idByName[targets[0].name] ? elements.filter(function (e) { return e.id === idByName[targets[0].name]; })[0] : elements[0];
        var sp = m.startPos && isFinite(m.startPos.x) && isFinite(m.startPos.y) ? { x: +m.startPos.x, y: +m.startPos.y } : (first ? { x: first.x - 70, y: first.y + first.h / 2 - 9 } : { x: 0, y: 40 });
        if (states.length || m.startPos) {
            elements.unshift({ id: 'mk-start', kind: 'start', x: sp.x, y: sp.y, w: 18, h: 18, label: '', props: {} });
            targets.forEach(function (tg) {
                var to = idByName[tg.name] || ('missing:' + tg.name);
                connectors.push({ id: 'mk-init-' + to, kind: 'initial', from: 'mk-start', to: to, fromPort: null, toPort: null, label: '', props: tg.p == null ? {} : { p: tg.p } });
            });
        }
        var steps = stepsFromStart(m);
        trs.forEach(function (t, i) {
            if (!t) return;
            var c = { id: transId(t, i), kind: transKind(m, t, steps), from: idByName[t.from] || ('missing:' + S(t.from)), to: idByName[t.to] || ('missing:' + S(t.to)), fromPort: null, toPort: null, label: '', props: { rate: t.rate } };
            if (t.sysmlRef) c.sysmlRef = t.sysmlRef;
            connectors.push(c);
        });
        return { elements: elements, connectors: connectors };
    }
    // editor model -> written into the stored model (in place; every other field is kept)
    function applyDiagram(m, dm) {
        var prevS = {}, prevT = {};
        (m.states || []).forEach(function (s, i) { if (s) prevS[stateId(s, i)] = s; });
        (m.transitions || []).forEach(function (t, i) { if (t) prevT[transId(t, i)] = t; });
        var els = dm.elements || [], cns = dm.connectors || [];
        var nameOf = {};
        var stateEls = els.filter(function (e) { return STATE_KINDS[e.kind]; });
        stateEls.forEach(function (e) { nameOf[e.id] = S(e.label).trim(); });
        var endName = function (id) { if (nameOf[id] != null) return nameOf[id]; return S(id).indexOf('missing:') === 0 ? S(id).slice(8) : ''; };
        m.states = stateEls.map(function (e) {
            var o = Object.assign({}, prevS[e.id] || {});
            o.id = e.id; o.name = nameOf[e.id]; o.isFailed = e.kind === 'failed';
            if (e.kind === 'degraded') o.degraded = true; else delete o.degraded;
            o.x = Math.round(e.x); o.y = Math.round(e.y);
            if (Math.round(e.w) !== D) o.size = Math.round(e.w); else delete o.size;
            if (e.sysmlRef) o.sysmlRef = e.sysmlRef; else delete o.sysmlRef;
            return o;
        });
        m.transitions = cns.filter(function (c) { return c.kind === 'failure' || c.kind === 'repair'; }).map(function (c) {
            var o = Object.assign({}, prevT[c.id] || {});
            o.id = c.id; o.from = endName(c.from); o.to = endName(c.to);
            var r = num(c.props && c.props.rate); o.rate = r == null ? 0 : r;
            o.kind = c.kind;
            if (c.sysmlRef) o.sysmlRef = c.sysmlRef; else delete o.sysmlRef;
            return o;
        });
        var start = els.filter(function (e) { return e.kind === 'start'; })[0];
        if (start) m.startPos = { x: Math.round(start.x), y: Math.round(start.y) }; else delete m.startPos;
        var inits = cns.filter(function (c) { return c.kind === 'initial'; });
        var explicit = inits.some(function (c) { return c.props && c.props.p != null && c.props.p !== ''; });
        if (!inits.length) { delete m.initialState; delete m.initialProbs; }
        else if (!explicit && inits.length === 1) { m.initialState = endName(inits[0].to); delete m.initialProbs; }
        else {
            var ip = {};
            inits.forEach(function (c) { var nm = endName(c.to); var p = num(c.props && c.props.p); ip[nm] = p == null ? (inits.length === 1 ? 1 : 0) : p; });
            m.initialProbs = ip; delete m.initialState;
        }
        return m;
    }
    function layoutPositions(model) {
        var m = applyDiagram({ states: [], transitions: [] }, clone(model));
        m.states.forEach(function (s) { delete s.x; delete s.y; });
        var pos = autoLayout(m), out = {};
        Object.keys(pos).forEach(function (id) { out[id] = { x: pos[id].x, y: pos[id].y }; });
        var start = (model.elements || []).filter(function (e) { return e.kind === 'start'; })[0];
        var first = startTargets(m)[0], fid = null;
        m.states.forEach(function (s) { if (first && s.name === first.name && fid == null) fid = s.id; });
        if (start && fid && out[fid]) out[start.id] = { x: out[fid].x - 70, y: out[fid].y + D / 2 - 9 };
        return out;
    }
    // The checks shown under the diagram (the solver's own refusals, in its words, plus the start).
    function checks(m) {
        var out = [];
        var v = (root.validateMarkovModel || (root.MARKOV_CTMC && root.MARKOV_CTMC.validateMarkovModel));
        if (typeof v === 'function') { var r = v(m); r.errors.forEach(function (e) { out.push(e.charAt(0).toUpperCase() + e.slice(1) + '.'); }); r.warnings.forEach(function (w) { out.push('Note: ' + w + '.'); }); }
        var absorbing = (m.states || []).filter(function (s) { return s && s.isFailed && !(m.transitions || []).some(function (t) { return t && t.from === s.name && t.to !== s.name; }); }).map(function (s) { return s.name; });
        if (absorbing.length) out.push('Note: absorbing (no way out): ' + absorbing.join(', ') + '.');
        return out;
    }

    // ------------------------------------------------------------ the notation
    function register() {
        var E = root.SLDiagramEditor;
        if (!E || E.getDiagram('markov')) return;
        var states = ['operational', 'degraded', 'failed'];
        var failedStyle = { fill: 'var(--mk-failed-fill, rgba(192,57,43,.09))', stroke: 'var(--sde-stroke)' };
        E.register({
            type: 'markov', title: 'Markov state diagram', grid: 10,
            elementKinds: {
                start: { label: 'Start', description: 'Where the system starts. Draw a start arrow to the starting state (several arrows with probabilities for a starting distribution)', shape: 'point', w: 18, h: 18, aspect: 'lock', resizable: false, maxCount: 1, renderLabel: false, labelEditable: false, defaultLabel: '' },
                operational: { label: 'Operational state', description: 'A state in which the system works', shape: 'ellipse', w: D, h: D, aspect: 'lock', minW: 50, minH: 50, defaultLabel: 'Operational', sysmlType: 'SafetyLab::MarkovState' },
                degraded: { label: 'Degraded state', description: 'Works with reduced capability (counted as working)', shape: 'ellipse', style: { dash: '6 3', stroke: 'var(--mk-degraded, #B45309)', fill: 'var(--mk-degraded-fill, rgba(180,83,9,.08))' }, w: D, h: D, aspect: 'lock', minW: 50, minH: 50, defaultLabel: 'Degraded', sysmlType: 'SafetyLab::MarkovState' },
                failed: { label: 'Failed state', description: 'The system has failed: counted in P(failed). With no way out it is absorbing', shape: 'doubleEllipse', style: failedStyle, w: D, h: D, aspect: 'lock', minW: 50, minH: 50, defaultLabel: 'Failed', sysmlType: 'SafetyLab::MarkovState' }
            },
            connectorKinds: {
                failure: { label: 'Failure (λ)', description: 'A failure moving the system to another state, with its failure rate per hour', defaultProps: { rate: 0 }, from: states, to: states, route: 'curved', arrow: 'triangle', allowSelfLoop: false, labelEditable: false, labelText: function (c) { var r = fmtRate(c.props && c.props.rate); return r == null || Number(r) === 0 ? 'λ = ?' : 'λ = ' + r; } },
                repair: { label: 'Repair (μ)', description: 'A repair or restoration, with its repair rate per hour', defaultProps: { rate: 0 }, from: states, to: states, route: 'curved', arrow: 'triangle', style: { dash: '6 4' }, allowSelfLoop: false, labelEditable: false, labelText: function (c) { var r = fmtRate(c.props && c.props.rate); return r == null || Number(r) === 0 ? 'μ = ?' : 'μ = ' + r; } },
                initial: { label: 'Start arrow', description: 'From the start to a starting state', from: ['start'], to: states, arrow: 'triangle', labelEditable: false, labelText: function (c) { return c.props && c.props.p != null && c.props.p !== '' ? 'p = ' + c.props.p : ''; } }
            },
            canConnect: function (a, b, kind) {
                if (kind !== 'initial' && a.kind === 'start') return 'From the start, draw a start arrow (the state the system starts in).';
                return true;
            },
            fields: function (item, ctx) {
                if (ctx.isElement) {
                    if (!STATE_KINDS[item.kind]) return [];
                    return [{ key: 'kind', label: 'State type', type: 'select', options: [{ value: 'operational', label: 'Operational (works)' }, { value: 'degraded', label: 'Degraded (works, reduced)' }, { value: 'failed', label: 'Failed (counted in P(failed))' }] }];
                }
                var pos = function (what) { return function (v) { return v === undefined ? null : (!(v > 0) ? 'A ' + what + ' rate is a number above 0 (per hour).' : null); }; };
                if (item.kind === 'failure') return [{ key: 'props.rate', label: 'Failure rate (per hour)', type: 'number', help: 'λ, for example 1e-5.', validate: pos('failure') }];
                if (item.kind === 'repair') return [{ key: 'props.rate', label: 'Repair rate (per hour)', type: 'number', help: 'μ = 1 / mean time to repair, for example 0.1 for 10 hours.', validate: pos('repair') }];
                if (item.kind === 'initial') return [{ key: 'props.p', label: 'Starting probability', type: 'number', help: 'Blank means 1 when this is the only start arrow. With several start arrows the probabilities add up to 1.', validate: function (v) { return v === undefined ? null : (!(v >= 0 && v <= 1) ? 'A probability is between 0 and 1.' : null); } }];
                return [];
            },
            validate: function (model) {
                var m = applyDiagram({ states: [], transitions: [] }, clone(model));
                var out = checks(m).map(function (t) { return { message: t }; });
                if (!model.elements.some(function (e) { return e.kind === 'start'; })) out.push({ message: 'Add the start and draw a start arrow to the state the system starts in (without it, the first state is the start).' });
                else if (!model.connectors.some(function (c) { return c.kind === 'initial'; }) && model.elements.some(function (e) { return STATE_KINDS[e.kind]; })) out.push({ message: 'Draw a start arrow from the start to the state the system starts in (until then the first state is the start).' });
                model.connectors.forEach(function (c) { if (S(c.from).indexOf('missing:') === 0 || S(c.to).indexOf('missing:') === 0) out.push({ id: c.id, message: 'A transition points at a state that does not exist ("' + S(c.from).replace('missing:', '') + '" to "' + S(c.to).replace('missing:', '') + '").' }); });
                return out;
            },
            panel: function (item, ctx) {
                var ed = ctx.editor; if (!ed || !item || !STATE_KINDS[item.kind]) return '';
                var m = applyDiagram({ states: [], transitions: [] }, ed.model());
                var src = ed.opts && ed.opts._mkModel ? ed.opts._mkModel() : null;
                if (src && src.phasePlan) m.phasePlan = src.phasePlan;
                var i = m.states.map(function (s) { return s.id; }).indexOf(item.id), out = '';
                if (i < 0) return '';
                try {
                    var ss = typeof root.solveMarkovModel === 'function' ? root.solveMarkovModel(m) : null;
                    var T = (typeof ftaConfig === 'object' && ftaConfig && parseFloat(ftaConfig.exposureTime)) || 1;
                    var tr = typeof root.solveMarkovTransient === 'function' ? root.solveMarkovTransient(m, T) : null;
                    out += '<label>Probability of being in this state</label><div class="sde-ro-val">' +
                        (tr && tr.ok ? 'at T = ' + T + ' h: ' + tr.pi[i].toExponential(4) + '<br>' : (tr ? 'at T: ' + SLDiagramEditor.esc(tr.reason) + '<br>' : '')) +
                        (ss && ss.ok ? 'steady state: ' + ss.pi[i].toExponential(4) : '') + '</div>';
                } catch (_) {}
                return out;
            },
            // Auto layout: states in columns by the number of steps from the start, the start to their left
            layout: function (model) { return layoutPositions(model); },
            canDelete: function (item) { return item && item.kind === 'start' ? 'Every Markov model has a start. Move its start arrow to another state instead.' : true; }
        });
    }

    function orderLike(dm, ref) {
        if (!ref) return dm;
        var sortBy = function (list, refList) {
            var pos = {}; refList.forEach(function (x, i) { pos[x.id] = i; });
            return list.map(function (x, i) { return { x: x, k: pos[x.id] != null ? pos[x.id] : refList.length + i }; }).sort(function (a, b) { return a.k - b.k; }).map(function (o) { return o.x; });
        };
        return { elements: sortBy(dm.elements, ref.elements || []), connectors: sortBy(dm.connectors, ref.connectors || []) };
    }

    // ------------------------------------------------------------ mounting in the cards
    var _eds = {};      // model id -> { ed, wrap, viewer, phase }
    var _io = null;
    function model(id) { var list = (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.markovModels) || []; return list.filter(function (m) { return m && m.id === id; })[0] || null; }
    function ensureProvider() { try { if (root.SLDiagramEditor && !SLDiagramEditor.getSysmlProvider() && root.SLSysML && SLSysML.editorProvider) SLDiagramEditor.setSysmlProvider(typeof SLSysML.editorProvider === 'function' ? SLSysML.editorProvider() : SLSysML.editorProvider); } catch (_) {} }
    function readOnlyReason() {
        try { if (typeof root.slProjectReadOnly === 'function') { var r = root.slProjectReadOnly(); if (r) return typeof r === 'string' ? r : 'Read only.'; } } catch (_) {}
        return false;
    }
    function redrawTables(rec) {
        var ae = document.activeElement, inside = rec && rec.wrap && ae && rec.wrap.contains(ae);
        try { if (typeof root.renderMarkovModels === 'function') root.renderMarkovModels(); } catch (_) {}
        if (inside && ae && document.contains(ae)) { try { ae.focus({ preventScroll: true }); } catch (_) {} }
    }
    function mount(id, host) {
        register(); ensureProvider();
        var rec = _eds[id] = _eds[id] || { phase: '' };
        rec.wrap = document.createElement('div'); rec.wrap.className = 'mk-diagram';
        host.appendChild(rec.wrap);
        rec.ed = SLDiagramEditor.mount(rec.wrap, {
            type: 'markov', height: 'fill', minimap: 'auto',
            _mkModel: function () { return model(id); },
            adapter: {
                // the editor's own order wins for items it already shows, so an edit never looks like an
                // outside change (which would clear the diagram's undo history)
                load: function () { var m = model(id); return m ? orderLike(toDiagram(m), rec.ed ? rec.ed.store.m : null) : { elements: [], connectors: [] }; },
                save: function (dm) { var m = model(id); if (m) applyDiagram(m, dm); }
            },
            readOnly: readOnlyReason,
            lockKey: 'markov:' + id,
            afterChange: function (change) {
                try { if (root.SLChangeAck && change.source !== 'undo' && change.source !== 'redo') { var t = SLChangeAck.begin(change.label, { onRevert: function () { try { rec.ed.reload(); } catch (_) {} } }); SLChangeAck.describe({ summary: 'Markov model "' + ((model(id) || {}).name || id) + '": ' + change.label }); SLChangeAck.end(t); } } catch (_) {}
                redrawTables(rec);
            }
        });
        return rec;
    }
    function phaseTabsHtml(m, rec) {
        var plan = m.phasePlan || {}, ov = plan.overrides || {}, names = Object.keys(ov).filter(function (k) { var o = ov[k] || {}; return o.model || o.modelId || (parseFloat(o.mult) > 0 && parseFloat(o.mult) !== 1); });
        if (!names.length) return '';
        var esc = SLDiagramEditor.esc;
        return '<div class="mk-phase-tabs" role="tablist" aria-label="Show the diagram for a phase" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin:0 0 6px; font-size:12px;"><span style="color:var(--text-secondary);">Show:</span>' +
            ['', ].concat(names).map(function (nm) { var on = (rec.phase || '') === nm; return '<button type="button" role="tab" aria-selected="' + on + '" class="sde-btn" data-mk-phase="' + esc(nm) + '" style="' + (on ? 'border-color:var(--sde-accent); box-shadow:inset 0 -2px 0 var(--sde-accent);' : '') + '">' + (nm ? esc(nm) : 'Model (all phases)') + '</button>'; }).join('') + '</div>';
    }
    // A read-only drawing of what the model is in one phase: the phase's own model, or the rates scaled.
    function phaseModel(m, name) {
        var ov = ((m.phasePlan || {}).overrides || {})[name] || {}, base = m, note = '';
        if (ov.model) { base = ov.model; note = 'In "' + name + '" the system follows its own model (set in the phase plan).'; }
        else if (ov.modelId) { var alt = model(ov.modelId); if (alt) { base = alt; note = 'In "' + name + '" the system follows the model "' + (alt.name || alt.id) + '". Edit it in its own card.'; } else note = 'The model named for "' + name + '" no longer exists.'; }
        var mult = parseFloat(ov.mult) > 0 ? parseFloat(ov.mult) : 1, view = clone(base);
        if (mult !== 1) {
            var failed = {}; (view.states || []).forEach(function (s) { if (s && s.isFailed) failed[s.name] = 1; });
            (view.transitions || []).forEach(function (t) { if (!(failed[t.from] && !failed[t.to])) t.rate = (parseFloat(t.rate) || 0) * mult; });
            note += (note ? ' ' : '') + 'Failure rates are multiplied by ' + mult + ' in this phase (repairs out of a failed state are not).';
        }
        return { model: view, note: note };
    }
    function showPhase(id, name) {
        var rec = _eds[id], m = model(id); if (!rec || !m) return;
        rec.phase = name || '';
        var host = rec.wrap && rec.wrap.parentNode; if (!host) return;
        var bar = host.querySelector('.mk-phase-tabs'); if (bar) bar.outerHTML = phaseTabsHtml(m, rec);
        if (rec.viewer) { try { rec.viewer.destroy(); } catch (_) {} rec.viewer = null; }
        var vh = host.querySelector('.mk-phase-view');
        if (!rec.phase) { rec.wrap.style.display = ''; if (vh) vh.remove(); return; }
        rec.wrap.style.display = 'none';
        if (!vh) { vh = document.createElement('div'); vh.className = 'mk-phase-view'; host.appendChild(vh); }
        var pm = phaseModel(m, rec.phase);
        vh.innerHTML = '<div style="font-size:12px; color:var(--text-secondary); margin:0 0 4px;">' + SLDiagramEditor.esc(pm.note) + '</div><div class="mk-phase-ed"></div>';
        rec.viewer = SLDiagramEditor.mount(vh.querySelector('.mk-phase-ed'), { type: 'markov', height: 'fill', model: toDiagram(pm.model), readOnly: 'Read only: the diagram of "' + rec.phase + '". Choose "Model (all phases)" to edit.' });
    }
    // the phase plan editor under the tables (writes model.phasePlan; the phased solve reads it)
    function phasePlanHtml(m) {
        var C = root.MARKOV_CTMC; if (!C) return '';
        var esc = SLDiagramEditor.esc, plan = m.phasePlan || {}, ov = plan.overrides || {}, ps = C.phaseSequence();
        var others = ((typeof projectConfig !== 'undefined' && projectConfig.markovModels) || []).filter(function (x) { return x && x.id !== m.id; });
        var html = '<details class="mk-phases"' + (plan.enabled || Object.keys(ov).length ? ' open' : '') + ' style="margin-top:12px;"><summary style="cursor:pointer; font-weight:600; font-size:13px;">Mission phases</summary>' +
            '<label style="display:flex; gap:8px; align-items:center; font-size:12.5px; margin:8px 0;"><input type="checkbox" data-mk-plan="enabled"' + (plan.enabled ? ' checked' : '') + ' style="width:auto; margin:0;"> Solve phase by phase over the flight phase table (ARP4761A App I §I.2.9). Basic events using this model then take the phased answer.</label>';
        if (ps.refuse) return html + '<div style="font-size:12px; color:#B91C1C;">' + esc(ps.refuse) + '</div></details>';
        if (!ps.seq.length) return html + '<div style="font-size:12px; color:var(--text-secondary);">No flight phases with a duration yet. Add them in the flight phase table.</div></details>';
        var solved = null;
        try { if (plan.enabled) solved = C.solveMarkovPhased(m); } catch (_) {}
        var legs = {}; if (solved && solved.ok) solved.legs.forEach(function (l) { legs[l.phase] = l; });
        html += '<table style="width:100%; font-size:0.85em;"><thead><tr><th class="u-text-left">Phase</th><th>Hours</th><th title="Failure rates in this phase are multiplied by this (environmental stress). Repairs out of a failed state are not.">Rate multiplier</th><th class="u-text-left">Model in this phase</th><th>P(failed) at end</th><th></th></tr></thead><tbody>' +
            ps.seq.map(function (p) {
                var o = ov[p.name] || {}, l = legs[p.name];
                var sel = '<select data-mk-plan="model" data-phase="' + esc(p.name) + '" class="u-mb0" aria-label="Model in ' + esc(p.name) + '"><option value="">This model</option>' + others.map(function (x) { return '<option value="' + esc(x.id) + '"' + (o.modelId === x.id ? ' selected' : '') + '>' + esc(x.name || x.id) + '</option>'; }).join('') + (o.model ? '<option value="__inline" selected>Its own model (imported)</option>' : '') + '</select>';
                var hasView = o.model || o.modelId || (parseFloat(o.mult) > 0 && parseFloat(o.mult) !== 1);
                return '<tr><td>' + esc(p.name) + '</td><td class="u-mono" style="text-align:right;">' + (+p.duration.toPrecision(6)) + '</td>' +
                    '<td><input type="text" inputmode="decimal" data-mk-plan="mult" data-phase="' + esc(p.name) + '" value="' + esc(o.mult != null ? o.mult : '') + '" placeholder="1" class="u-mb0" style="width:70px;" aria-label="Rate multiplier in ' + esc(p.name) + '"></td>' +
                    '<td>' + sel + '</td><td class="u-mono" style="text-align:right;">' + (l ? l.pFailedAtEnd.toExponential(3) : '') + '</td>' +
                    '<td>' + (hasView ? '<button type="button" class="sde-btn" data-mk-phase="' + esc(p.name) + '">Show</button>' : '') + '</td></tr>';
            }).join('') + '</tbody></table>';
        if (ps.excluded.length) html += '<div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">Not in the chain: ' + esc(ps.excluded.join(' · ')) + '</div>';
        if (plan.enabled && solved && !solved.ok) html += '<div style="font-size:12px; color:#B91C1C; margin-top:4px;">Phased solve refused: ' + esc(solved.reason) + '</div>';
        return html + '</details>';
    }
    function setPlan(id, what, phase, value) {
        var m = model(id); if (!m) return;
        try { if (typeof root.pushUndo === 'function') root.pushUndo('Markov mission phases'); } catch (_) {}
        var plan = m.phasePlan = m.phasePlan || {};
        if (what === 'enabled') plan.enabled = !!value;
        else {
            var ov = plan.overrides = plan.overrides || {}, o = ov[phase] = ov[phase] || {};
            if (what === 'mult') {
                var raw = S(value).trim(), v = raw === '' ? null : Number(raw);
                if (raw !== '' && !(v > 0)) { try { root.showToast('A rate multiplier is a number above 0.', 'warning'); } catch (_) {} }
                else if (v == null || v === 1) delete o.mult; else o.mult = v;
            } else if (what === 'model') {
                if (value === '__inline') return;
                if (value) { o.modelId = value; delete o.model; } else { delete o.modelId; delete o.model; }
            }
            if (!Object.keys(o).length) delete ov[phase];
            if (!Object.keys(ov).length) delete plan.overrides;
        }
        if (!plan.enabled && !plan.overrides) delete m.phasePlan;
        try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {}
        try { if (root.SLChangeAck) SLChangeAck.describe({ summary: 'Markov model "' + m.name + '": mission phases changed' }); } catch (_) {}
        root.renderMarkovModels();
    }
    function wireCard(card, id) {
        if (card._mkWired) return; card._mkWired = true;
        card.addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('[data-mk-phase]'); if (!b || !card.contains(b)) return;
            e.preventDefault();
            showPhase(id, b.getAttribute('data-mk-phase'));
            try { var h = card.querySelector('.mk-diagram-host'); if (h && h.scrollIntoView && b.closest('.mk-phases')) h.scrollIntoView({ block: 'nearest' }); } catch (_) {}
        });
        card.addEventListener('change', function (e) {
            var t = e.target, w = t && t.getAttribute && t.getAttribute('data-mk-plan'); if (!w) return;
            setPlan(id, w, t.getAttribute('data-phase'), w === 'enabled' ? t.checked : t.value);
        });
    }
    function fill(host) {
        var id = host.getAttribute('data-mk-id'), m = model(id); if (!m) return;
        var rec = _eds[id];
        host.innerHTML = '';
        var tabs = document.createElement('div'); host.appendChild(tabs);
        if (rec && rec.ed && !rec.ed._destroyed) { host.appendChild(rec.wrap); rec.ed.reload(); }
        else rec = mount(id, host);
        tabs.outerHTML = phaseTabsHtml(m, rec) || '<span hidden></span>';
        if (rec.ed.refreshShapes) rec.ed.refreshShapes();
        if (rec.phase) {
            var ov = ((m.phasePlan || {}).overrides || {})[rec.phase];
            if (ov) showPhase(id, rec.phase); else rec.phase = '';
        }
        rec.wrap.style.display = rec.phase ? 'none' : '';
    }
    function attach(container) {
        if (!container || !root.SLDiagramEditor) return;
        var live = {};
        Array.prototype.forEach.call(container.querySelectorAll('.mk-card'), function (card) {
            var id = card.getAttribute('data-mk-id'); live[id] = 1;
            wireCard(card, id);
            var ph = card.querySelector('.mk-phase-host'), m = model(id);
            if (ph && m) ph.innerHTML = phasePlanHtml(m);
            var host = card.querySelector('.mk-diagram-host'); if (!host) return;
            host.style.minHeight = '440px';
            if (_eds[id] && _eds[id].ed && !_eds[id].ed._destroyed) { fill(host); host.style.minHeight = ''; return; }
            if (typeof IntersectionObserver === 'function') {
                if (!_io) _io = new IntersectionObserver(function (entries) {
                    entries.forEach(function (en) { if (en.isIntersecting && en.target.isConnected) { _io.unobserve(en.target); fill(en.target); en.target.style.minHeight = ''; } });
                }, { rootMargin: '300px 0px' });
                _io.observe(host);
            } else { fill(host); host.style.minHeight = ''; }
        });
        // models that are gone: free their editors
        Object.keys(_eds).forEach(function (id) {
            if (live[id]) return;
            try { _eds[id].ed && _eds[id].ed.destroy(); } catch (_) {}
            try { _eds[id].viewer && _eds[id].viewer.destroy(); } catch (_) {}
            delete _eds[id];
        });
    }

    var API = { version: VERSION, layoutPositions: layoutPositions, orderLike: orderLike, stepsFromStart: stepsFromStart, toDiagram: toDiagram, applyDiagram: applyDiagram, autoLayout: autoLayout, checks: checks, startTargets: startTargets, transKind: transKind, register: register, attach: attach, phaseModel: phaseModel, editor: function (id) { return _eds[id] ? _eds[id].ed : null; }, showPhase: showPhase };
    root.SLMarkovDiagram = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

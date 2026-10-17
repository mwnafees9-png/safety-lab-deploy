// 13 Oct 2026 (fix3-M, v2.0): the reliability block diagram is a real diagram drawn by hand on the one diagram editor (IEC 61078 notation: start, end, blocks, junctions, k-out-of-n nodes, standby groups, one-way and two-way links, repeated blocks marked), evaluated exactly as a network by rbd_net.js (bridges and general networks included). Deriving from a fault tree and importing a formula stay as shortcuts that produce an editable diagram; a derived diagram keeps its link to the fault tree and is checked against it. Diagrams saved before this build open unchanged (shown read only, computed as before) until "Edit by hand". See tests/regression_rbd_markov_diagrams_20261013b.test.js
// 13 Oct 2026 (fix G): a SEQ gate maps to parallel blocks like the other AND-family gates. See tests/regression_fta_handbuild_20261013b.test.js
// 13 Sep 2026 (R19 step 3): native alert/confirm/prompt replaced by the app's own dialogs (slAlert/slConfirm/slPrompt) and typed toasts; see tests/regression_native_dialogs.test.js
// rbd_module.js — Phase F7: Reliability Block Diagrams.
// BORN MODULAR: new file, zero monolith edits; store under projectConfig.rbd.
//
// Store: projectConfig.rbd.models = [{ id, name, dsl, fromPage, blockRefs?, diagram?, derivedAt? }]
//   diagram (13 Oct 2026): { elements, connectors } on the diagram editor. When present it IS the
//     model: what you see is what is computed. fromPage stays as the link to the fault tree it was
//     derived from (checked against it on every view); dsl stays as the formula it was imported from.
//   A model WITHOUT diagram (saved before 13 Oct 2026) keeps its old meaning exactly:
//   AUTOMATED — derive the RBD from any fault tree: the RBD is the structural
//     dual (failure OR → success SERIES, failure AND → success PARALLEL,
//     VOTING k-of-n failure → (n−k+1)-of-n success). Mission reliability
//     R(t) = 1 − P_top(t) with per-event q = 1−e^(−λt); recomputed live, so
//     the RBD can never drift from the tree.
//   MANUAL — a text DSL for architectures that have no tree:
//     series( block(Engine, 1e-4), parallel( block(PumpA, 2e-5),
//     block(PumpB, 2e-5) ), koon(2, block(G1,1e-4), block(G2,1e-4),
//     block(G3,1e-4) ) )
//
// Metrics: R(t) at mission points, system MTBF by Simpson integration of
// R(t) (exact identities verified in tests: 2-parallel MTBF = 1.5/λ,
// 2oo3 MTBF = (5/6)/λ, series R = e^(−Σλt)).

(function () {
    'use strict';

    function _store() {
        if (!projectConfig.rbd) projectConfig.rbd = { models: [] };
        if (!Array.isArray(projectConfig.rbd.models)) projectConfig.rbd.models = [];
        return projectConfig.rbd;
    }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _undo(label) { try { if (typeof pushUndo === 'function') pushUndo(label); } catch (_) {} }
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    function _ask(msg, dflt) { return slPrompt(msg, dflt || ''); }
    let _idSeq = 0;
    function _uuid() { try { if (window.SLDiagramEditor) return SLDiagramEditor.uuid(); } catch (_) {} return 'id-' + Date.now().toString(36) + '-' + (++_idSeq); }
    function _ack(summary) { try { if (window.SLChangeAck && typeof SLChangeAck.describe === 'function') SLChangeAck.describe({ summary: summary }); } catch (_) {} }
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _access() { return (typeof window._ramHasAccess === 'function') ? window._ramHasAccess() : true; }
    const _chip = (l, v, warn) => '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">' + l + ' <b style="margin-left:6px;' + (warn ? ' color:#B45309;' : '') + '">' + v + '</b></div>';
    function _missionT() { return (typeof ftaConfig === 'object' && ftaConfig && parseFloat(ftaConfig.exposureTime)) || 1; }
    const _fmtP = v => (v >= 0.999999 && v < 1) ? v.toPrecision(10) : v.toPrecision(6);

    // ============================================================ structure
    // node: { kind:'block', name, lambda } | { kind:'series'|'parallel', children }
    //     | { kind:'koon', k, children }   (k = required SURVIVORS)
    // Failure probability of the structure at time t (independent, exponential):
    function qOf(node, t) {
        if (node.kind === 'block') return -Math.expm1(-(node.lambda || 0) * t);
        const qs = node.children.map(c => qOf(c, t));
        if (node.kind === 'series') return 1 - qs.reduce((a, q) => a * (1 - q), 1);   // any block fails
        if (node.kind === 'parallel') return qs.reduce((a, q) => a * q, 1);           // all blocks fail
        if (node.kind === 'koon') {
            // fails when survivors < k  ⇔  failures ≥ n−k+1 (exact Poisson-binomial)
            const need = node.children.length - node.k + 1;
            let dist = [1];
            qs.forEach(q => {
                const next = new Array(dist.length + 1).fill(0);
                for (let j = 0; j < dist.length; j++) { next[j] += dist[j] * (1 - q); next[j + 1] += dist[j] * q; }
                dist = next;
            });
            let s = 0;
            for (let j = need; j < dist.length; j++) s += dist[j];
            return s;
        }
        return 0;
    }
    const rOf = (node, t) => 1 - qOf(node, t);

    // System MTBF = ∫₀^∞ R(t) dt — composite Simpson with a doubling horizon.
    function rbdMtbf(node) {
        let T = 1;
        let guard = 0;
        while (rOf(node, T) > 1e-9 && guard++ < 60) T *= 2;
        const n = 4096;                       // even
        const h = T / n;
        let s = rOf(node, 0) + rOf(node, T);
        for (let i = 1; i < n; i++) s += rOf(node, i * h) * (i % 2 ? 4 : 2);
        return s * h / 3;
    }

    // ------------------------------------------------------------- DSL
    // series(...) parallel(...) koon(k, ...) block(name, lambda)
    function parseDsl(src) {
        let i = 0;
        const err = m => { throw new Error(m + ' at position ' + i); };
        function ws() { while (i < src.length && /\s/.test(src[i])) i++; }
        function ident() {
            ws();
            const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
            if (!m) err('expected a keyword (series/parallel/koon/block)');
            i += m[0].length;
            return m[0].toLowerCase();
        }
        function expect(ch) { ws(); if (src[i] !== ch) err('expected "' + ch + '"'); i++; }
        function nodeExpr() {
            const kw = ident();
            expect('(');
            if (kw === 'block') {
                ws();
                const nm = /^[^,()]+/.exec(src.slice(i)); if (!nm) err('block name');
                i += nm[0].length;
                expect(',');
                ws();
                const lm = /^[0-9.eE+\-]+/.exec(src.slice(i)); if (!lm) err('block λ');
                i += lm[0].length;
                const lambda = parseFloat(lm[0]);
                if (!(lambda >= 0)) err('λ must be ≥ 0');
                expect(')');
                return { kind: 'block', name: nm[0].trim(), lambda };
            }
            let k = null;
            if (kw === 'koon') {
                ws();
                const km = /^\d+/.exec(src.slice(i)); if (!km) err('koon needs k (required survivors)');
                i += km[0].length; k = parseInt(km[0]);
                expect(',');
            }
            if (kw !== 'series' && kw !== 'parallel' && kw !== 'koon') err('unknown construct "' + kw + '"');
            const children = [nodeExpr()];
            ws();
            while (src[i] === ',') { i++; children.push(nodeExpr()); ws(); }
            expect(')');
            if (kw === 'koon') {
                if (!(k >= 1 && k <= children.length)) err('koon k out of range');
                return { kind: 'koon', k, children };
            }
            return { kind: kw, children };
        }
        const root = nodeExpr();
        ws();
        if (i < src.length) err('unexpected trailing input');
        return root;
    }

    // -------------------------------------------- AUTOMATED: FTA → RBD dual
    function _lam(n) {
        try { if (typeof getEffectiveLambda === 'function') return getEffectiveLambda(n) || 0; } catch (_) {}
        return (n && n.lambda) || 0;
    }
    function treeToRbd(node) {
        if (!node) return null;
        if (node.type !== 'gate') return { kind: 'block', name: node.displayId || node.name || ('E' + node.id), lambda: _lam(node), label: node.name || undefined };   // 13 Oct 2026: label = the event's name on the drawing (name stays the component key)
        const kids = (node.children || node._children || []).map(treeToRbd).filter(Boolean);
        if (!kids.length) return null;
        if (kids.length === 1) return kids[0];
        const gt = node.gateType;
        if (gt === 'AND' || gt === 'INHIBIT' || gt === 'PAND' || gt === 'SPARE' || gt === 'SEQ') return { kind: 'parallel', children: kids };   // 13 Oct 2026 (fix G): SEQ
        if (gt === 'VOTING') {
            const kFail = parseInt(node.k || node.voteK || 2) || 2;              // gate: fails when ≥ kFail fail
            return { kind: 'koon', k: kids.length - kFail + 1, children: kids }; // survives with n−kFail+1 alive
        }
        if (gt === 'TRANSFER') return kids[0] || null;
        return { kind: 'series', children: kids };                               // OR family
    }
    function rbdFromPage(pageId) {
        const p = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).find(x => String(x.id) === String(pageId));
        if (!p || !p.root) return null;
        // TRANSFER leaves have no λ locally; they resolve through the linked page.
        const resolveTransfers = (n) => {
            if (!n) return null;
            if (n.gateType === 'TRANSFER' && n.linkedPageId) {
                const lp = ftaPages.find(x => String(x.id) === String(n.linkedPageId));
                return lp && lp.root ? resolveTransfersDeep(lp.root) : null;
            }
            return n;
        };
        function resolveTransfersDeep(n) {
            const r = resolveTransfers(n);
            if (!r) return null;
            if (r.type === 'gate') {
                const clone = Object.assign({}, r);
                clone.children = (r.children || r._children || []).map(resolveTransfersDeep).filter(Boolean);
                return clone;
            }
            return r;
        }
        return { structure: treeToRbd(resolveTransfersDeep(p.root)), page: p };
    }

    // ================================================================ 13 Oct 2026: the drawn diagram
    const NET = () => window.RBD_NET;
    // The structure behind a model saved BEFORE the drawn diagram (formula or live fault tree dual).
    function legacyStructure(m) {
        if (!m) return { structure: null, note: '' };
        if (m.fromPage) {
            const d = rbdFromPage(m.fromPage);
            return d ? { structure: d.structure, note: 'derived live from the fault tree "' + (d.page.name || m.fromPage) + '"', page: d.page } : { structure: null, note: 'the fault tree it was derived from is missing' };
        }
        if (m.dsl) { try { return { structure: parseDsl(m.dsl), note: 'typed as a formula' }; } catch (e) { return { structure: null, note: 'formula error: ' + e.message }; } }
        return { structure: null, note: 'empty' };
    }
    // What the editor shows for a model: its own drawing, or (legacy) a drawing of its structure
    // with ids that stay the same from one view to the next.
    function diagramOf(m) {
        if (m && m.diagram && Array.isArray(m.diagram.elements)) return m.diagram;
        const ls = legacyStructure(m);
        if (!ls.structure || !NET()) return { elements: [], connectors: [] };
        let n = 0;
        return NET().fromStructure(ls.structure, () => 'v' + (++n));
    }
    const isLegacy = m => !!m && !(m.diagram && Array.isArray(m.diagram.elements));

    // --------------------------------------------------------------- the notation (IEC 61078)
    const _repeats = (model, e) => {
        if (!model || !NET()) return 1;
        const k = NET().compKey(e);
        return model.elements.filter(x => (x.kind === 'block' || x.kind === 'standby') && NET().compKey(x) === k).length;
    };
    const _fmtRate = v => (v === '' || v == null || !isFinite(Number(v))) ? null : (Number(v) === 0 ? '0' : Number(v).toExponential(2).replace('e-', 'e-').replace('.00e', 'e'));
    function _textLines(text, w, fs, max) {
        try { return SLDiagramEditor.core.wrapLines(text, w, fs, max); } catch (_) { return [String(text || '')]; }
    }
    function _blockShape(e, ctx) {
        const esc = SLDiagramEditor.esc, w = e.w, h = e.h, rep = _repeats(ctx && ctx.model, e);
        const lam = _fmtRate(e.props && e.props.lambda);
        const lines = _textLines(e.label || '', w - 14, 12, 2);
        let s = '<rect class="sde-shape" x="0" y="0" width="' + w + '" height="' + h + '" fill="var(--sde-fill)" stroke="var(--sde-stroke)" stroke-width="1.5"/>';
        if (rep > 1) s += '<rect x="3" y="3" width="' + (w - 6) + '" height="' + (h - 6) + '" fill="none" stroke="var(--sde-stroke)" stroke-width="0.9" stroke-dasharray="3 2"/>' +
            '<g class="rbd-rep"><rect x="' + (w - 30) + '" y="-9" width="30" height="16" rx="8" fill="var(--sde-accent)"/><text x="' + (w - 15) + '" y="3" font-size="10" text-anchor="middle" fill="#fff">×' + rep + '</text></g>';
        const top = h / 2 - (lines.length - 1) * 7 - (lam != null || true ? 5 : 0);
        s += '<text class="sde-label" x="' + w / 2 + '" y="' + top + '" font-size="12" text-anchor="middle">' + lines.map((l, i) => '<tspan x="' + w / 2 + '" dy="' + (i ? 14 : 0) + '">' + esc(l) + '</tspan>').join('') + '</text>';
        s += '<text x="' + w / 2 + '" y="' + (h - 7) + '" font-size="10" text-anchor="middle" style="fill:' + (lam == null ? 'var(--sde-bad)' : 'var(--sde-muted)') + '">' + (lam == null ? 'set λ' : 'λ ' + esc(lam) + ' /h') + '</text>';
        return s;
    }
    function _standbyShape(e, ctx) {
        const esc = SLDiagramEditor.esc, w = e.w, h = e.h, p = e.props || {}, rep = _repeats(ctx && ctx.model, e);
        const units = p.units != null && p.units !== '' ? p.units : '?';
        const wk = Number(p.warmK || 0), mode = wk === 0 ? 'cold' : wk >= 1 ? 'hot' : 'warm ' + wk;
        const sw = p.switchP == null || p.switchP === '' ? 1 : p.switchP;
        let s = '<rect class="sde-shape" x="0" y="0" width="' + w + '" height="' + h + '" fill="var(--sde-fill)" stroke="var(--sde-stroke)" stroke-width="1.5"/>' +
            '<rect x="8" y="7" width="14" height="10" fill="none" stroke="var(--sde-stroke)" stroke-width="1"/><rect x="11" y="10" width="14" height="10" fill="var(--sde-fill)" stroke="var(--sde-stroke)" stroke-width="1"/>' +
            '<circle cx="12" cy="' + (h - 12) + '" r="2.5" fill="var(--sde-stroke)"/><path d="M12,' + (h - 12) + ' L24,' + (h - 19) + '" stroke="var(--sde-stroke)" stroke-width="1.4"/><circle cx="26" cy="' + (h - 12) + '" r="2.5" fill="none" stroke="var(--sde-stroke)"/>';
        if (rep > 1) s += '<g class="rbd-rep"><rect x="' + (w - 30) + '" y="-9" width="30" height="16" rx="8" fill="var(--sde-accent)"/><text x="' + (w - 15) + '" y="3" font-size="10" text-anchor="middle" fill="#fff">×' + rep + '</text></g>';
        s += '<text class="sde-label" x="' + (w / 2 + 10) + '" y="' + (h / 2 - 8) + '" font-size="12" text-anchor="middle">' + esc(_textLines(e.label || '', w - 44, 12, 1)[0] || '') + '</text>';
        const lam = _fmtRate(p.lambda);
        s += '<text x="' + (w / 2 + 10) + '" y="' + (h / 2 + 7) + '" font-size="10" text-anchor="middle" style="fill:var(--sde-muted)">' + esc(units + ' units · ' + mode + ' · switch ' + sw) + '</text>';
        s += '<text x="' + (w / 2 + 10) + '" y="' + (h - 6) + '" font-size="10" text-anchor="middle" style="fill:' + (lam == null ? 'var(--sde-bad)' : 'var(--sde-muted)') + '">' + (lam == null ? 'set λ' : 'λ ' + esc(lam) + ' /h each') + '</text>';
        return s;
    }
    function _voteShape(e, ctx) {
        const m = ctx && ctx.model, n = m ? m.connectors.filter(c => c.to === e.id).length : null;
        const k = e.props && e.props.k != null && e.props.k !== '' ? e.props.k : '?';
        const r = Math.min(e.w, e.h) / 2;
        return '<circle class="sde-shape" cx="' + e.w / 2 + '" cy="' + e.h / 2 + '" r="' + r + '" fill="var(--sde-fill)" stroke="var(--sde-stroke)" stroke-width="1.5"/>' +
            '<text x="' + e.w / 2 + '" y="' + (e.h / 2 + 4) + '" font-size="12" font-weight="600" text-anchor="middle" style="fill:currentColor">' + SLDiagramEditor.esc(k + '/' + (n == null ? 'n' : n)) + '</text>';
    }
    function _terminalShape(kind) {
        return function (e) {
            const r = Math.min(e.w, e.h) / 2, c = e.w / 2;
            return '<circle class="sde-shape" cx="' + c + '" cy="' + e.h / 2 + '" r="' + r + '" fill="var(--sde-fill)" stroke="var(--sde-stroke)" stroke-width="' + (kind === 'end' ? 3 : 1.5) + '"/>' +
                (kind === 'start' ? '<circle cx="' + c + '" cy="' + e.h / 2 + '" r="' + (r * 0.45) + '" fill="var(--sde-stroke)"/>' : '<circle cx="' + c + '" cy="' + e.h / 2 + '" r="' + (r * 0.45) + '" fill="none" stroke="var(--sde-stroke)" stroke-width="1.5"/>');
        };
    }
    const _numCheck = (lo, hi, what, int) => v => (v === undefined ? null : (!isFinite(v) || v < lo || (hi != null && v > hi) || (int && Math.round(v) !== v)) ? what : null);
    // A property shared by every copy of a repeated block: one edit, every place, one undo step.
    const _shared = (key) => function (tx, v, it) {
        const k = NET().compKey(it);
        tx.model.elements.filter(x => (x.kind === 'block' || x.kind === 'standby') && NET().compKey(x) === k).forEach(x => { const p = {}; p[key] = v; tx.updateElement(x.id, { props: p }); });
    };
    function _fields(item, ctx) {
        if (!ctx.isElement) return null;
        const ed = ctx.editor, model = ed ? ed.store.m : { elements: [] };
        if (item.kind === 'block' || item.kind === 'standby') {
            const seen = {};
            const opts = [{ value: '', label: '(its own component)' }];
            model.elements.forEach(x => {
                if (x.id === item.id || x.kind !== item.kind) return;
                const k = NET().compKey(x); if (seen[k]) return; seen[k] = 1;
                opts.push({ value: k, label: 'Same as: ' + (x.label || 'unnamed') });
            });
            const comp = {
                key: 'props.component', label: 'Repeated block', type: 'select', options: opts,
                help: 'IEC 61078: the same component drawn in several places is one component. Pick the block this one repeats; its values are copied and stay shared.',
                apply: function (tx, v, it) {
                    const p = { component: v || undefined };
                    if (v) {
                        const src = tx.model.elements.find(x => x.id !== it.id && NET().compKey(x) === v);
                        if (src) ['lambda', 'mu', 'units', 'warmK', 'switchP'].forEach(f => { p[f] = src.props ? src.props[f] : undefined; });
                    }
                    tx.updateElement(it.id, { props: p });
                }
            };
            const f = [];
            f.push({ key: 'props.lambda', label: 'Failure rate (per hour)', type: 'number', help: 'λ, for example 1e-5. Mission reliability uses e^(−λt).', validate: _numCheck(0, null, 'A failure rate is a number of 0 or more (per hour).'), apply: _shared('lambda') });
            if (item.kind === 'block') f.push({ key: 'props.mu', label: 'Repair rate (per hour, optional)', type: 'number', help: 'μ = 1 / mean time to repair, used only for availability. Leave blank for a block that is not repaired.', validate: _numCheck(0, null, 'A repair rate is a number of 0 or more (per hour).'), apply: _shared('mu') });
            if (item.kind === 'standby') {
                f.push({ key: 'props.units', label: 'Units (one active, the rest waiting)', type: 'number', validate: _numCheck(2, 50, 'A standby group has 2 to 50 units.', true), apply: _shared('units') });
                f.push({ key: 'props.warmK', label: 'Dormancy factor (0 cold, 1 hot)', type: 'number', help: 'A waiting unit fails at this fraction of λ. 0 = cold standby, between 0 and 1 = warm, 1 = hot.', validate: _numCheck(0, 1, 'The dormancy factor is between 0 and 1.'), apply: _shared('warmK') });
                f.push({ key: 'props.switchP', label: 'Switch success probability', type: 'number', help: 'The chance each switch-over to a waiting unit works (1 = perfect switch).', validate: _numCheck(0, 1, 'A probability is between 0 and 1.'), apply: _shared('switchP') });
            }
            f.push(comp);
            return f;
        }
        if (item.kind === 'vote') return [{ key: 'props.k', label: 'k (routes needed)', type: 'number', help: 'The route continues when at least k of the links coming in work (k-out-of-n).', validate: _numCheck(1, 64, 'k is a whole number of 1 or more.', true) }];
        return [];
    }
    function _register() {
        if (!window.SLDiagramEditor || SLDiagramEditor.getDiagram('rbd')) return;
        SLDiagramEditor.register({
            type: 'rbd', title: 'Reliability block diagram', grid: 10,
            elementKinds: {
                start: { label: 'Start', description: 'Where the success path begins (IEC 61078 input)', shape: _terminalShape('start'), boundary: 'ellipse', w: 34, h: 34, aspect: 'lock', resizable: false, maxCount: 1, labelPos: 'below', defaultLabel: 'Start' },
                end: { label: 'End', description: 'Where the success path finishes (IEC 61078 output)', shape: _terminalShape('end'), boundary: 'ellipse', w: 34, h: 34, aspect: 'lock', resizable: false, maxCount: 1, labelPos: 'below', defaultLabel: 'End' },
                block: { label: 'Block', description: 'A component that must work for the path to pass through it', shape: _blockShape, boundary: 'rect', w: 130, h: 52, minW: 70, minH: 40, renderLabel: false, defaultLabel: 'Block', sysmlType: 'SafetyLab::RbdBlock' },
                standby: { label: 'Standby group', description: 'One unit working, the others waiting to take over through a switch (cold, warm or hot standby)', shape: _standbyShape, boundary: 'rect', w: 190, h: 58, minW: 150, minH: 50, renderLabel: false, defaultLabel: 'Standby group', defaultProps: { units: 2, warmK: 0, switchP: 1 }, sysmlType: 'SafetyLab::StandbyGroup' },
                vote: { label: 'k-out-of-n', description: 'The path continues when at least k of the n links coming in work', shape: _voteShape, boundary: 'ellipse', w: 44, h: 44, aspect: 'lock', renderLabel: false, labelEditable: false, defaultLabel: '', defaultProps: { k: 2 }, sysmlType: 'SafetyLab::RbdNode' },
                node: { label: 'Junction', description: 'A point where links split or join (parallel paths)', shape: 'point', w: 14, h: 14, aspect: 'lock', resizable: false, renderLabel: false, labelEditable: false, defaultLabel: '', sysmlType: 'SafetyLab::RbdNode' }
            },
            connectorKinds: {
                link: { label: 'Link', description: 'The success path, in the drawn direction', route: 'orthogonal', arrow: 'open', from: ['start', 'block', 'standby', 'vote', 'node'], to: ['end', 'block', 'standby', 'vote', 'node'] },
                link2: { label: 'Two-way link', description: 'A link the success path can use both ways (the middle of a bridge). Draw it with this tool, or change a link to two-way in its properties', offerOnDrag: false, route: 'orthogonal', arrow: { start: 'open', end: 'open' }, from: ['block', 'standby', 'node'], to: ['block', 'standby', 'node'], directed: false }
            },
            canConnect(a, b, kind, ctx) {
                const m = ctx.model;
                const dup = m.connectors.some(c => c.id !== ctx.ignoreId && ((c.from === a.id && c.to === b.id) || (c.from === b.id && c.to === a.id)));
                if (dup) return 'These two shapes are already linked. Change the link to a two-way link in its properties if the path goes both ways.';
                return true;
            },
            fields: _fields,
            validate(model) {
                if (!NET()) return [];
                const A = NET().analyze(model);
                return A.errors.map(m => ({ message: m })).concat(A.warnings.map(m => ({ message: 'Note: ' + m })));
            },
            layout: 'layered', layoutOptions: { direction: 'right' },
            canDelete(item) { return true; }
        });
    }

    // --------------------------------------------------------------- the page
    let _ed = null, _edId = null, _sel = null, _note = null;
    function _model(id) { return _store().models.find(m => m.id === id) || null; }
    function _selected() {
        const S = _store();
        if (!_sel || !_model(_sel)) _sel = S.models.length ? S.models[0].id : null;
        return _sel ? _model(_sel) : null;
    }
    function _ensureProvider() {
        try { if (window.SLDiagramEditor && !SLDiagramEditor.getSysmlProvider() && window.SLSysML && SLSysML.editorProvider) SLDiagramEditor.setSysmlProvider(typeof SLSysML.editorProvider === 'function' ? SLSysML.editorProvider() : SLSysML.editorProvider); } catch (_) {}
    }
    function _mountEditor(host, m) {
        if (_ed && _edId === m.id && host.contains(_ed.root)) { _ed.reload(); try { _ed._resolveReadOnly(); } catch (_) {} if (_ed.refreshShapes) _ed.refreshShapes(); return; }   // read only follows Edit by hand
        if (_ed) { try { _ed.destroy(); } catch (_) {} _ed = null; }
        host.innerHTML = '';
        _register(); _ensureProvider();
        const id = m.id;
        _ed = SLDiagramEditor.mount(host, {
            type: 'rbd', height: 'fill',
            adapter: {
                load: () => { const mm = _model(id); return mm ? JSON.parse(JSON.stringify(diagramOf(mm))) : { elements: [], connectors: [] }; },
                save: (model) => { const mm = _model(id); if (!mm || isLegacy(mm)) return; mm.diagram = { elements: model.elements, connectors: model.connectors }; }
            },
            readOnly: () => {
                if (!_access()) return 'Read only: reliability block diagrams are a Pro+ capability.';
                const mm = _model(id);
                if (mm && isLegacy(mm)) return mm.fromPage ? 'Read only: this diagram is computed live from its fault tree. Choose "Edit by hand" above to make an editable copy.' : 'Read only: this diagram is computed from its formula. Choose "Edit by hand" above to make an editable copy.';
                return false;
            },
            lockKey: 'rbd:' + id,
            afterChange: (change) => {
                try { if (window.SLChangeAck && change.source !== 'undo' && change.source !== 'redo') { const t = SLChangeAck.begin(change.label, { onRevert: () => { try { _ed && _ed.reload(); _refreshResults(); } catch (_) {} } }); _ack('Reliability block diagram "' + ((_model(id) || {}).name || id) + '": ' + change.label); SLChangeAck.end(t); } } catch (_) {}
                if (_ed && _ed.refreshShapes) _ed.refreshShapes();
                _refreshResults();
            }
        });
        _edId = id;
        _ed.on('reload', () => { if (_ed && _ed.refreshShapes) _ed.refreshShapes(); _refreshResults(); });
    }

    // results under the diagram
    function _resultsHtml(m) {
        const t = _missionT();
        if (isLegacy(m)) {
            const ls = legacyStructure(m);
            if (!ls.structure) return '<p style="font-size:12px; color:#8E2A2A;">' + _esc(ls.note) + '</p>';
            let html = _metricsHtml(ls.structure);
            // honesty: the same structure drawn as a network treats a repeated name as one component
            try {
                const A = NET() && NET().analyze(diagramOf(m));
                if (A && A.ok) {
                    const rNet = NET().reliability(A, t), rOld = rOf(ls.structure, t);
                    if (Math.abs(rNet - rOld) > 1e-12) html += '<p style="font-size:11.5px; color:#9A6200; margin:8px 0 0;">Some blocks appear in more than one place under the same name. This view counts each place as a separate component (R = ' + _fmtP(rOld) + '). Drawn by hand, a repeated block is one component (IEC 61078), which gives R = ' + _fmtP(rNet) + '.</p>';
                }
            } catch (_) {}
            return html;
        }
        const A = NET().analyze(m.diagram);
        if (!A.ok) return '<div style="border:1px solid #E7B6B6; background:var(--color-surface-1); padding:10px 12px; font-size:12.5px;"><b>Not computed yet.</b> ' + A.errors.slice(0, 5).map(_esc).join(' ') + '</div>';
        const R = NET().reliability(A, t), mt = NET().mttf(A), av = NET().availability(A);
        const pointsT = [t, 10, 100, 1000].filter((v, ix, a) => a.indexOf(v) === ix).sort((a, b) => a - b);
        const pc = c => NET().compR(c, t);
        const bf = NET().bruteForce(A, pc);
        let html = '<div style="display:flex; gap:10px; flex-wrap:wrap; margin:10px 0;">' +
            _chip('R(mission ' + t + ' h)', _fmtP(R)) +
            _chip('MTTF (∫R dt)', isFinite(mt) ? Math.round(mt).toLocaleString() + ' h' : 'unbounded') +
            (av.ok ? _chip('Availability (steady)', av.value.toPrecision(8)) : '') + '</div>';
        if (!av.ok) html += '<p style="font-size:11.5px; color:var(--color-text-tertiary); margin:0 0 8px;">' + _esc(av.reason) + '</p>';
        html += '<table class="data-table" style="width:100%; max-width:480px; font-size:12px;"><thead><tr><th>t (h)</th><th>R(t)</th><th>Q(t)</th></tr></thead><tbody>' +
            pointsT.map(x => { const r = NET().reliability(A, x); return '<tr><td class="u-mono">' + x + '</td><td class="u-mono">' + _fmtP(r) + '</td><td class="u-mono">' + (1 - r).toExponential(3) + '</td></tr>'; }).join('') + '</tbody></table>';
        const method = A.method === 'flow' ? 'built in the direction of flow' : 'built from all ' + A.routes + ' routes from start to end, as the network has a loop';
        const check = bf.ok ? ('Checked by enumerating all ' + bf.states.toLocaleString() + ' up and down combinations of the components: ' + (Math.abs(bf.value - R) <= 1e-12 ? 'agrees' : 'DIFFERS (' + bf.value + ')') + '.') : bf.reason;
        html += '<p class="u-mono" style="font-size:11px; color:var(--color-text-tertiary); margin:8px 0 0;">Exact: a decision diagram over ' + A.comps.length + ' component' + (A.comps.length === 1 ? '' : 's') + ' (' + method + '), q = 1−e^(−λt) per block; repeated blocks count once. ' + _esc(check) + '</p>';
        try {
            const ps = NET().pathSets(A), cs = NET().cutSets(A), nm = s => s.map(c => c.name).join(' + ');
            const show = (arr) => arr.slice(0, 8).map(s => '{' + _esc(nm(s)) + '}').join(' ') + (arr.length > 8 ? ' and ' + (arr.length - 8) + ' more' : '');
            html += '<p style="font-size:11.5px; margin:6px 0 0;"><b>Minimal path sets (' + ps.length + '):</b> ' + show(ps) + '<br><b>Minimal cut sets (' + cs.length + '):</b> ' + show(cs) + '</p>';
        } catch (e) { html += '<p style="font-size:11.5px; color:var(--color-text-tertiary);">Path and cut sets not listed: ' + _esc(e.message) + '</p>'; }
        if (A.warnings.length) html += '<p style="font-size:11.5px; color:#9A6200; margin:6px 0 0;">' + A.warnings.slice(0, 4).map(_esc).join(' ') + '</p>';
        return html;
    }
    // the line above the diagram: where it came from, and the fault tree check
    function _noteHtml(m) {
        if (!m) return '';
        const t = _missionT();
        if (isLegacy(m)) {
            const ls = legacyStructure(m);
            return '<div class="rbd-note" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; font-size:12.5px;"><span>' + _esc(ls.note.charAt(0).toUpperCase() + ls.note.slice(1)) + (m.fromPage ? '. It follows every change to the tree.' : '.') + '</span>' +
                (ls.structure && _access() ? '<button type="button" class="btn-cyan" data-rbd-act="edit-by-hand" style="font-size:12px; padding:5px 12px;">Edit by hand</button>' : '') + '</div>';
        }
        let html = '';
        if (m.fromPage) {
            const d = rbdFromPage(m.fromPage);
            if (!d) html += '<span style="color:#8E2A2A;">Derived from a fault tree that no longer exists (' + _esc(m.fromPage) + ').</span>';
            else {
                let cmp = null;
                try { cmp = d.structure ? NET().compareWithStructure(m.diagram, d.structure, t) : null; } catch (_) {}
                const nm = '"' + _esc(d.page.name || m.fromPage) + '"';
                if (!cmp || !cmp.ok) html += '<span>Derived from the fault tree ' + nm + '. Fault tree check: not possible until the diagram is complete' + (cmp && cmp.reason ? ' (' + _esc(cmp.reason) + ')' : '') + '.</span>';
                else if (cmp.sameStructure && !cmp.rateDiffs.length) html += '<span>Derived from the fault tree ' + nm + '. Fault tree check: <b style="color:#166534;">matches</b> (same success logic and failure rates; R = ' + _fmtP(cmp.rDiagram) + ', 1 − P(top) from the tree = ' + _fmtP(cmp.rTree) + ').</span>';
                else html += '<span>Derived from the fault tree ' + nm + '. Fault tree check: <b style="color:#B45309;">differs</b>: ' +
                    [cmp.sameStructure ? '' : 'the success logic is not the same as the tree' + (cmp.missing.length ? ' (the tree has ' + cmp.missing.slice(0, 3).map(_esc).join(', ') + (cmp.missing.length > 3 ? ', ...' : '') + ' that the diagram does not)' : ''),
                     cmp.rateDiffs.length ? 'failure rates differ for ' + cmp.rateDiffs.slice(0, 3).map(r => _esc(r.name) + ' (' + r.here + ' here, ' + r.tree + ' in the tree)').join(', ') : ''].filter(Boolean).join('; ') +
                    '. R here ' + _fmtP(cmp.rDiagram) + ', from the tree ' + _fmtP(cmp.rTree) + '.</span>' +
                    (_access() ? ' <button type="button" class="btn-cyan" data-rbd-act="refresh-from-tree" style="font-size:12px; padding:5px 12px;">Redraw from the fault tree</button>' : '');
            }
        } else if (m.dsl) html += '<span>Imported from the formula <code style="font-size:11px;">' + _esc(m.dsl.length > 90 ? m.dsl.slice(0, 90) + '…' : m.dsl) + '</code>, then editable here.</span>';
        else html += '<span>Drawn by hand.</span>';
        return '<div class="rbd-note" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; font-size:12.5px;">' + html + '</div>';
    }
    function _metricsHtml(structure) {
        const tMission = _missionT();
        const points = [tMission, 10, 100, 1000].filter((v, ix, a) => a.indexOf(v) === ix).sort((a, b) => a - b);
        const mtbf = rbdMtbf(structure);
        return '<div style="display:flex; gap:10px; flex-wrap:wrap; margin:10px 0;">' +
            _chip('R(mission ' + tMission + ' h)', rOf(structure, tMission).toPrecision(6)) +
            _chip('System MTBF (∫R dt)', Math.round(mtbf).toLocaleString() + ' h') + '</div>' +
            '<table class="data-table" style="width:100%; max-width:480px; font-size:12px;"><thead><tr><th>t (h)</th><th>R(t)</th><th>Q(t)</th></tr></thead><tbody>' +
            points.map(t => '<tr><td class="u-mono">' + t + '</td><td class="u-mono">' + rOf(structure, t).toPrecision(6) + '</td><td class="u-mono">' + qOf(structure, t).toExponential(3) + '</td></tr>').join('') +
            '</tbody></table>';
    }
    function _refreshResults() {
        const m = _selected();
        const r = document.getElementById('rbd-results'), n = document.getElementById('rbd-note-host');
        if (r) r.innerHTML = m ? _resultsHtml(m) : '';
        if (n) n.innerHTML = m ? _noteHtml(m) : '';
        try { if (window.RBD_XCHECK && typeof RBD_XCHECK.renderXcheck === 'function') RBD_XCHECK.renderXcheck(); } catch (_) {}
    }

    // ------------------------------------------------------------ actions
    function _newId() { let id = 'RBD-' + Date.now(); while (_model(id)) id += 'x'; return id; }
    function _add(m, label) {
        _undo(label);
        _store().models.push(m);
        _sel = m.id;
        _ack(label + ': "' + m.name + '"');
        _save(); renderRamRbdPage();
    }
    function _blank() {
        return { elements: [
            { id: _uuid(), kind: 'start', x: 0, y: 100, w: 34, h: 34, label: 'Start', props: {} },
            { id: _uuid(), kind: 'end', x: 480, y: 100, w: 34, h: 34, label: 'End', props: {} }], connectors: [] };
    }
    async function rbdAddBlank() {
        if (!_access()) return;
        const name = await _ask('Name of the new reliability block diagram:', 'Reliability block diagram ' + (_store().models.length + 1));
        if (!name || !name.trim()) return;
        _add({ id: _newId(), name: name.trim(), dsl: null, fromPage: null, diagram: _blank() }, 'New reliability block diagram');
    }
    async function rbdAddManual() {
        if (!_access()) return;
        const name = await _ask('RBD name:'); if (!name || !name.trim()) return;
        const dsl = await _ask('Structure formula: series(...), parallel(...), koon(k, ...), block(name, λ). It becomes a diagram you can edit:',
            'series( block(Engine, 1e-4), parallel( block(Pump A, 2e-5), block(Pump B, 2e-5) ) )');
        if (!dsl || !dsl.trim()) return;
        let st;
        try { st = parseDsl(dsl.trim()); } catch (e) { _toast('Formula error: ' + e.message, 'error', 5000); return; }
        _add({ id: _newId(), name: name.trim(), dsl: dsl.trim(), fromPage: null, diagram: NET().fromStructure(st, _uuid) }, 'Import a reliability block diagram formula');
    }
    async function rbdAddFromTree(pageId) {
        if (!_access()) return;
        const pages = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).filter(p => p.root);
        if (!pages.length) { _toast('No fault trees to derive from.', 'warning'); return; }
        let pick = pageId;
        if (pick == null) { const sel = document.getElementById('rbd-tree-pick'); pick = sel && sel.value; }
        if (pick == null || pick === '') pick = (await _ask('Derive the reliability block diagram of which fault tree?\n' + pages.slice(0, 15).map(p => '  ' + p.id + ': ' + (p.name || '')).join('\n') + '\n\nEnter the page id:', pages[0].id)) || '';
        const d = rbdFromPage(String(pick).trim());
        if (!d || !d.structure) { _toast('No fault tree with that id (or it is empty).', 'warning'); return; }
        _add({ id: _newId(), name: 'RBD of ' + (d.page.name || d.page.id), dsl: null, fromPage: String(d.page.id), derivedAt: new Date().toISOString(), diagram: NET().fromStructure(d.structure, _uuid) }, 'Derive a reliability block diagram from a fault tree');
    }
    async function rbdEditByHand(id) {
        const m = _model(id || _sel); if (!m || !isLegacy(m) || !_access()) return;
        const ls = legacyStructure(m); if (!ls.structure) return;
        const t = _missionT(), rOld = rOf(ls.structure, t);
        _undo('Edit a reliability block diagram by hand');
        m.diagram = NET().fromStructure(ls.structure, _uuid);
        if (m.fromPage) m.derivedAt = new Date().toISOString();
        _ack('Reliability block diagram "' + m.name + '" is now drawn by hand');
        _save(); renderRamRbdPage();
        try {
            const A = NET().analyze(m.diagram), rNew = A.ok ? NET().reliability(A, t) : rOld;
            if (Math.abs(rNew - rOld) > 1e-12) slAlert('This diagram is now editable. Some blocks appear in more than one place under the same name; as a drawing they are one component each (IEC 61078 repeated block), so R(' + t + ' h) changes from ' + _fmtP(rOld) + ' to ' + _fmtP(rNew) + '. If they are really different components, give them different names.', { title: 'Repeated blocks' });
        } catch (_) {}
    }
    async function rbdRefreshFromTree(id) {
        const m = _model(id || _sel); if (!m || !m.fromPage || !_access()) return;
        const d = rbdFromPage(m.fromPage); if (!d || !d.structure) { _toast('The fault tree is missing or empty.', 'warning'); return; }
        if (!(await slConfirm('Redraw "' + m.name + '" from the fault tree "' + (d.page.name || m.fromPage) + '"? Changes made by hand to this diagram are replaced (Undo brings them back).', { okText: 'Redraw' }))) return;
        _undo('Redraw a reliability block diagram from its fault tree');
        m.diagram = NET().fromStructure(d.structure, _uuid);
        m.derivedAt = new Date().toISOString();
        _ack('Reliability block diagram "' + m.name + '" redrawn from its fault tree');
        _save(); renderRamRbdPage();
    }
    async function rbdRename(id) {
        const m = _model(id || _sel); if (!m || !_access()) return;
        const name = await _ask('Rename the reliability block diagram:', m.name);
        if (!name || !name.trim() || name.trim() === m.name) return;
        _undo('Rename a reliability block diagram');
        m.name = name.trim(); _ack('Renamed a reliability block diagram to "' + m.name + '"');
        _save(); renderRamRbdPage();
    }
    async function rbdDelete(id) {
        const s = _store();
        const i = s.models.findIndex(x => x.id === (id || _sel));
        if (i < 0) return;
        if (!(await slConfirm('Remove the reliability block diagram "' + s.models[i].name + '"?', { danger: true, okText: 'Remove' }))) return;
        _undo('Remove a reliability block diagram');
        s.models.splice(i, 1); _save(); renderRamRbdPage();
    }
    function rbdSelect(id) { _sel = id; renderRamRbdPage(); }

    function renderRamRbdPage() {
        const host = document.getElementById('ram-rbd-host');
        if (!host) return;
        if (!_access()) { if (_ed) { try { _ed.destroy(); } catch (_) {} _ed = null; } host.innerHTML = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:26px 30px; "><h3 style="margin:0 0 10px; border:none; padding:0;">Reliability Block Diagrams are a Pro+ capability</h3></div>'; return; }
        const S = _store(), m = _selected();
        let shell = document.getElementById('rbd-shell');
        if (!shell || !host.contains(shell)) {
            if (_ed) { try { _ed.destroy(); } catch (_) {} _ed = null; }
            host.innerHTML = '<div id="rbd-shell">' +
                '<div id="rbd-bar" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:0 0 10px;"></div>' +
                '<div id="rbd-note-host" style="margin:0 0 8px;"></div>' +
                '<div id="rbd-editor-host"></div>' +
                '<div id="rbd-results"></div>' +
                '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Mission reliability: q = 1−e^(−λt) per block, standby groups solved exactly as small Markov chains; the network (series, parallel, k-out-of-n, bridges, repeated blocks) evaluated exactly by a decision diagram and checked by enumeration. Availability uses each block\'s repair rate. Markov models cover shared repair and degraded states.</p>' +
                '</div>';
            shell = document.getElementById('rbd-shell');
            shell.addEventListener('click', e => {
                const b = e.target.closest('[data-rbd-act]'); if (!b) return;
                const act = b.getAttribute('data-rbd-act');
                if (act === 'new') rbdAddBlank();
                else if (act === 'derive') rbdAddFromTree();
                else if (act === 'formula') rbdAddManual();
                else if (act === 'rename') rbdRename();
                else if (act === 'delete') rbdDelete();
                else if (act === 'edit-by-hand') rbdEditByHand();
                else if (act === 'refresh-from-tree') rbdRefreshFromTree();
            });
            shell.addEventListener('change', e => { if (e.target && e.target.id === 'rbd-pick') (window.rbdSelect || rbdSelect)(e.target.value); });   // 16 Oct 2026: through window, so changes waiting are confirmed before another diagram opens
        }
        const pages = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).filter(p => p.root);
        const bar = document.getElementById('rbd-bar');
        const btn = (act, label, title) => '<button type="button" class="btn-cyan" data-rbd-act="' + act + '" title="' + _esc(title) + '" style="font-size:12.5px; padding:6px 12px;">' + label + '</button>';
        bar.innerHTML =
            (S.models.length ? '<label for="rbd-pick" style="font-size:12px; font-weight:600; margin:0;">Diagram</label><select id="rbd-pick" style="width:auto; min-width:200px; margin:0;">' + S.models.map(x => '<option value="' + _esc(x.id) + '"' + (m && x.id === m.id ? ' selected' : '') + '>' + _esc(x.name) + '</option>').join('') + '</select>' : '') +
            btn('new', '+ New diagram', 'Start a blank diagram with a start and an end, then draw blocks and links') +
            (pages.length ? '<span style="display:inline-flex; gap:6px; align-items:center;"><select id="rbd-tree-pick" aria-label="Fault tree to derive from" style="width:auto; max-width:240px; margin:0;">' + pages.map(p => '<option value="' + _esc(p.id) + '">' + _esc(p.name || p.id) + '</option>').join('') + '</select>' + btn('derive', 'Derive from fault tree', 'Draw the success view of the chosen fault tree (OR becomes series, AND becomes parallel, voting becomes k-out-of-n); you can edit it afterwards') + '</span>' : '') +
            btn('formula', 'Import formula', 'Type series(...), parallel(...), koon(k, ...), block(name, λ) and get a diagram you can edit') +
            (m ? btn('rename', 'Rename', 'Rename this diagram') + btn('delete', 'Delete', 'Remove this diagram') : '');
        const eh = document.getElementById('rbd-editor-host');
        if (!m) {
            if (_ed) { try { _ed.destroy(); } catch (_) {} _ed = null; }
            eh.innerHTML = '<p style="color:var(--color-text-tertiary); font-size:13px;">No block diagrams yet. Start a new diagram and draw it from the toolbox, derive one from a fault tree (the success view of the same architecture: series where the tree has OR, parallel where it has AND), or import a formula.</p>';
            _refreshResults();
            return;
        }
        if (!window.SLDiagramEditor || !NET()) { eh.innerHTML = '<p style="color:#8E2A2A;">The diagram editor did not load.</p>'; return; }
        _mountEditor(eh, m);
        _refreshResults();
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._rbdWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-ram-rbd');
                if (v) v.style.display = (tabId === 'ram-rbd') ? 'block' : 'none';
                const s = document.getElementById('snav-ram-rbd');
                if (s) s.classList.toggle('snav-active', tabId === 'ram-rbd');
                if (tabId === 'ram-rbd') renderRamRbdPage();
            } catch (_) {}
            return r;
        };
        wrapped._rbdWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.renderRamRbdPage = renderRamRbdPage;
    window.rbdAddManual = rbdAddManual;
    window.rbdAddFromTree = rbdAddFromTree;
    window.rbdAddBlank = rbdAddBlank;
    window.rbdEditByHand = rbdEditByHand;
    window.rbdRefreshFromTree = rbdRefreshFromTree;
    window.rbdRename = rbdRename;
    window.rbdDelete = rbdDelete;
    window.rbdSelect = rbdSelect;
    window._rbdParseDsl = parseDsl;
    window._rbdQ = qOf;
    window._rbdR = rOf;
    window._rbdMtbf = rbdMtbf;
    window._rbdFromPage = rbdFromPage;
    window._rbdTreeToRbd = treeToRbd;
    window._rbdDiagramOf = diagramOf;
    window._rbdIsLegacy = isLegacy;
    window._rbdEditor = () => _ed;
    window._rbdRegister = _register;
})();

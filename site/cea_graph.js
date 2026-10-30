// ============================================================================
// cea_graph.js — v1.3 — Phase P5 (gap A11): Cascading Effects Analysis on the
// system-dependency graph the project already carries.
//
// v1.3 (13 Oct 2026, hand-build round): the graph is now EDITABLE BY HAND on
// the one diagram editor core (SLDiagramEditor): add or remove a resource, a
// system, a provides or feeds link or an interface on the canvas, rename,
// retype, move, undo, full screen. Every edit writes the SAME rows the tables
// use (resourcesData, systemsData, projectConfig.interfaces); the graph still
// keeps no analysis state of its own, only box positions
// (projectConfig.ceaLayout). Clicking a node still traces its cascade.
//
// The model holds three kinds of dependency edges nobody has assembled into
// one structure: resource provision/consumption (Resources store), declared
// system interfaces (projectConfig.interfaces), and the interdependence
// table's asserted contribution cells. This module compiles them into a
// single directed graph, runs deterministic cascade closures over it, and —
// the audit-grade part — RECONCILES the graph against the interdependence
// table: a cascade path that reaches a system whose failure conditions the
// source has never been reviewed against is a finding; a path that
// contradicts a manually CLEARED cell is a conflict.
//
// Two lanes: the graph and its cascades are computed; the interdependence
// cells are elicited. Neither overwrites the other — disagreement renders as
// findings, exactly like the CoFFE dual-lane discipline.
//
// Born modular: classic script, zero monolith edits, wraps switchTab for the
// 'cea' tab, pushes one auto item onto the PASA checklist. No stored state —
// the whole analysis derives from the live model on every render.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ------------------------------------------------------------- graph
    // Nodes: systems and resources. Edges (directed, "failure flows along"):
    //   system --provides--> resource      (provider fails, resource degrades)
    //   resource --feeds--> system         (resource lost, consumer degrades)
    //   system --interface--> system       (declared lateral reliance)
    function ceaGraph() {
        const nodes = new Map();   // id -> { id, kind, name }
        const edges = [];
        ((typeof systemsData !== 'undefined' && systemsData) || []).forEach(s =>
            nodes.set(s.id, { id: s.id, kind: 'system', name: s.name || s.id }));
        ((typeof resourcesData !== 'undefined' && resourcesData) || []).forEach(r => {
            const rid = 'res:' + (r.resId || r.internalId);
            nodes.set(rid, { id: rid, kind: 'resource', name: r.name || r.resId });
            (r.providedBy || []).forEach(p => { if (nodes.has(p)) edges.push({ from: p, to: rid, kind: 'provides', label: r.resId }); });
            (r.consumedBySystems || []).forEach(c => { if (nodes.has(c)) edges.push({ from: rid, to: c, kind: 'feeds', label: r.resId }); });
            // consumedBy holds aircraft sub-function ids — resolve to the systems
            // whose functions trace to them, so function-level consumption still
            // lands on a system node.
            (r.consumedBy || []).forEach(subId => {
                ((typeof systemsData !== 'undefined' && systemsData) || []).forEach(s => {
                    const owns = (s.functions || []).some(f =>
                        (Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : [])).includes(subId));
                    if (owns && !edges.some(e => e.from === rid && e.to === s.id))
                        edges.push({ from: rid, to: s.id, kind: 'feeds', label: r.resId + ' (via ' + subId + ')' });
                });
            });
        });
        const ifaces = (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.interfaces)) ? projectConfig.interfaces : [];
        ifaces.forEach(i => {
            const a = String(i.fromSystemId), b = String(i.toSystemId);
            if (!nodes.has(a) || !nodes.has(b)) return;
            const lbl = i.medium || i.kind || 'interface';
            // Failure propagates against the direction of reliance: if A feeds B,
            // A's failure cascades to B. Declared direction is taken as the flow
            // of the dependency itself.
            if (i.direction !== 'b_to_a') edges.push({ from: a, to: b, kind: 'interface', label: lbl });
            if (i.direction === 'b_to_a' || i.direction === 'bidirectional') edges.push({ from: b, to: a, kind: 'interface', label: lbl });
        });
        return { nodes, edges };
    }

    // ------------------------------------------------------------ cascade
    // BFS from a failed node; every reached node carries its shortest path.
    function ceaCascade(sourceId, graph) {
        const g = graph || ceaGraph();
        const out = [];   // { id, kind, name, hops, path: 'A —feeds→ B —…' }
        if (!g.nodes.has(sourceId)) return out;
        const seen = new Set([sourceId]);
        let frontier = [{ id: sourceId, path: [] }];
        let hops = 0;
        while (frontier.length && hops < 8) {
            hops++;
            const next = [];
            frontier.forEach(cur => {
                g.edges.filter(e => e.from === cur.id).forEach(e => {
                    if (seen.has(e.to)) return;
                    seen.add(e.to);
                    const n = g.nodes.get(e.to);
                    const path = cur.path.concat([(g.nodes.get(e.from) || {}).name + ' —' + e.kind + (e.label ? '(' + e.label + ')' : '') + '→ ' + (n || {}).name]);
                    out.push({ id: e.to, kind: n.kind, name: n.name, hops, path: path.join(' ; ') });
                    next.push({ id: e.to, path });
                });
            });
            frontier = next;
        }
        return out;
    }

    // ----------------------------------------- reconciliation vs the table
    // For every system X: cascade from X; for every REACHED system S, X can
    // influence the failure conditions S owns. The interdependence table must
    // have reviewed X against those FCs. Three outcomes per (FC, X) pair:
    //   corroborated — cell contributes (table already knows)
    //   unreviewed   — cascade path exists, cell never reviewed  → FINDING
    //   conflict     — cascade path exists, cell manually CLEARED → CONFLICT
    function _fcsOwnedBy(s) {
        const out = [];
        const acFha = (typeof acFhaData !== 'undefined' && acFhaData) || [];
        const subIds = new Set();
        (s.functions || []).forEach(f =>
            (Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : [])).forEach(t => subIds.add(t)));
        // 23 Sep 2026 — AC FHA rows trace through subIds[] (legacy subId still honored);
        // reading subId alone missed every row linked to more than one function.
        acFha.forEach(f => {
            const ids = (Array.isArray(f.subIds) && f.subIds.length) ? f.subIds : (f.subId ? [f.subId] : []);
            if (ids.some(id => subIds.has(id))) out.push(f);
        });
        (s.fha || []).forEach(f => {
            if (!f.acTrace) return;
            const ac = acFha.find(x => String(x.internalId) === String(f.acTrace));
            if (ac && !out.includes(ac)) out.push(ac);
        });
        return out;
    }

    function ceaFindings() {
        const g = ceaGraph();
        const systems = ((typeof systemsData !== 'undefined' && systemsData) || []);
        const rows = [];
        let corroborated = 0;
        if (typeof idpCell !== 'function') return { rows, corroborated, pairs: 0 };
        let pairs = 0;
        systems.forEach(x => {
            const reached = ceaCascade(x.id, g).filter(n => n.kind === 'system');
            reached.forEach(r => {
                const s = systems.find(z => z.id === r.id);
                if (!s) return;
                _fcsOwnedBy(s).forEach(fc => {
                    pairs++;
                    const cell = idpCell(fc, x.id);
                    if (cell.state === 'contributes') { corroborated++; return; }
                    rows.push({
                        kind: cell.state === 'cleared' ? 'conflict' : 'unreviewed',
                        source: x.name || x.id, sourceId: x.id,
                        fc: fc.fcId, severity: fc.severity,
                        via: r.path, hops: r.hops,
                        detail: cell.state === 'cleared'
                            ? 'cell manually cleared by ' + (cell.by || '?') + ' — a dependency path contradicts the clearance'
                            : 'dependency path exists but the interdependence cell was never reviewed',
                    });
                });
            });
        });
        rows.sort((a, b) => (a.kind === 'conflict' ? 0 : 1) - (b.kind === 'conflict' ? 0 : 1) || a.hops - b.hops);
        return { rows, corroborated, pairs };
    }

    // ---------------------------------------------------------------- SVG
    window._ceaSelected = window._ceaSelected || '';
    window.ceaSelect = function (id) {
        window._ceaSelected = (window._ceaSelected === id) ? '' : id;
        if (_ceaEd && _ceaEd.root && _ceaEd.root.isConnected) {   // v1.3: the editor shows the selection
            const eid = _elIdOfGraph(window._ceaSelected);
            const keep = window._ceaSelected;
            _ceaEd.select(eid ? [eid] : []);
            window._ceaSelected = keep; _ceaSyncReach(); _ceaEd.refresh(); _renderCeaBelow();
            return;
        }
        renderCeaPage();
    };

    function _svgGraph(g) {
        const systems = [...g.nodes.values()].filter(n => n.kind === 'system');
        const resources = [...g.nodes.values()].filter(n => n.kind === 'resource');
        // W=1000 with the resource column pushed right: the graph owns the whole
        // panel instead of huddling in the left 700 units with dead space beside.
        const rowH = 46, boxW = 230, boxH = 34, colSys = 46, W = 1000, colRes = W - boxW - 46;
        const H = Math.max(systems.length, resources.length) * rowH + 40;
        const pos = new Map();
        systems.forEach((n, i) => pos.set(n.id, { x: colSys, y: 24 + i * rowH }));
        resources.forEach((n, i) => pos.set(n.id, { x: colRes, y: 24 + i * rowH * Math.max(1, systems.length / Math.max(1, resources.length)) }));
        const sel = window._ceaSelected;
        const reach = sel ? new Set(ceaCascade(sel, g).map(r => r.id)) : null;
        const active = id => !sel || id === sel || (reach && reach.has(id));

        // pan/zoom: the viewBox is the camera. Persisted across re-renders in
        // window._ceaView; _ceaBindPanZoom drives it (wheel = zoom at cursor,
        // drag = pan, double-click = reset). Node clicks survive because a
        // drag beyond 4px suppresses the click in the capture phase.
        window._ceaDefView = { w: W, h: H };
        const v = window._ceaView || { x: 0, y: 0, w: W, h: H };
        let s = '<svg id="cea-svg" viewBox="' + v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h + '" style="width:100%; font-family:var(--font-mono); cursor:grab; touch-action:none;" xmlns="http://www.w3.org/2000/svg">';
        s += '<defs><marker id="cea-arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="currentColor"/></marker></defs>';
        g.edges.forEach(e => {
            const a = pos.get(e.from), b = pos.get(e.to);
            if (!a || !b) return;
            const onPath = sel && (e.from === sel || (reach && reach.has(e.from))) && reach && reach.has(e.to);
            const color = onPath ? '#8E2A2A' : (e.kind === 'interface' ? '#4E63D8' : e.kind === 'provides' ? '#9A6200' : '#4A6741');
            const op = sel && !onPath ? 0.14 : 0.75;
            let x1, y1, x2, y2;
            if (e.kind === 'interface') {   // sys→sys: arc left of the column
                x1 = a.x; y1 = a.y + boxH / 2; x2 = b.x; y2 = b.y + boxH / 2;
                const bend = 34 + Math.abs(y2 - y1) / 8;
                s += '<path d="M' + x1 + ',' + y1 + ' C' + (x1 - bend) + ',' + y1 + ' ' + (x2 - bend) + ',' + y2 + ' ' + x2 + ',' + y2 +
                    '" fill="none" stroke="' + color + '" stroke-width="1.4" opacity="' + op + '" marker-end="url(#cea-arr)" style="color:' + color + '"/>';
            } else {
                const fromRes = e.kind === 'feeds';
                x1 = fromRes ? a.x : a.x + boxW; y1 = a.y + boxH / 2;
                x2 = fromRes ? b.x + boxW : b.x; y2 = b.y + boxH / 2;
                const mx = (x1 + x2) / 2;
                s += '<path d="M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2 +
                    '" fill="none" stroke="' + color + '" stroke-width="1.4" opacity="' + op + '" marker-end="url(#cea-arr)" style="color:' + color + '"/>';
            }
        });
        [...g.nodes.values()].forEach(n => {
            const p = pos.get(n.id);
            if (!p) return;
            const isSel = n.id === sel;
            const on = active(n.id);
            const fill = n.kind === 'resource' ? 'var(--color-surface-2)' : 'var(--color-surface-1)';
            const stroke = isSel ? '#8E2A2A' : (sel && reach && reach.has(n.id) ? '#8E2A2A' : 'var(--color-border-strong)');
            s += '<g style="cursor:pointer;" opacity="' + (on ? 1 : 0.3) + '" onclick="ceaSelect(\'' + _esc(n.id) + '\')">' +
                '<rect x="' + p.x + '" y="' + p.y + '" width="' + boxW + '" height="' + boxH + '" rx="4" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (isSel ? 2.5 : 1.2) + '"/>' +
                '<text x="' + (p.x + 10) + '" y="' + (p.y + 21) + '" font-size="11.5" fill="var(--color-text-primary)">' + _esc((n.name || n.id).slice(0, 28)) + '</text></g>';
        });
        s += '</svg>';
        return s;
    }

    // ------------------------------------------------------------ pan/zoom
    function _ceaBindPanZoom() {
        const svg = document.getElementById('cea-svg');
        if (!svg || svg._pzBound) return;
        svg._pzBound = true;
        const def = () => window._ceaDefView || { w: 700, h: 400 };
        const vb = () => window._ceaView || { x: 0, y: 0, w: def().w, h: def().h };
        const apply = v => { window._ceaView = v; svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h); };
        let drag = null, moved = false;
        svg.addEventListener('pointerdown', e => {
            drag = { px: e.clientX, py: e.clientY, v: vb() }; moved = false;
            try { svg.setPointerCapture(e.pointerId); } catch (_) {}
            svg.style.cursor = 'grabbing';
        });
        svg.addEventListener('pointermove', e => {
            if (!drag) return;
            const r = svg.getBoundingClientRect();
            if (!r.width || !r.height) return;
            if (Math.abs(e.clientX - drag.px) + Math.abs(e.clientY - drag.py) > 4) moved = true;
            apply({
                x: drag.v.x - (e.clientX - drag.px) * drag.v.w / r.width,
                y: drag.v.y - (e.clientY - drag.py) * drag.v.h / r.height,
                w: drag.v.w, h: drag.v.h
            });
        });
        const end = () => { drag = null; svg.style.cursor = 'grab'; };
        svg.addEventListener('pointerup', end);
        svg.addEventListener('pointercancel', end);
        svg.addEventListener('pointerleave', end);
        // a drag is not a click: suppress node selection after real movement
        svg.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
        svg.addEventListener('wheel', e => {
            // ⌘/Ctrl + scroll zooms (trackpad pinch arrives as ctrl+wheel);
            // plain scroll stays what it always was — the page scrolling.
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            const v = vb(), r = svg.getBoundingClientRect();
            if (!r.width || !r.height) return;
            const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
            const nw = v.w * k;
            if (nw > def().w * 4 || nw < def().w / 10) return;   // zoom bounds: ×0.25 … ×10
            const mx = v.x + (e.clientX - r.left) * v.w / r.width;
            const my = v.y + (e.clientY - r.top) * v.h / r.height;
            apply({ x: mx - (mx - v.x) * k, y: my - (my - v.y) * k, w: nw, h: v.h * k });
        }, { passive: false });
        svg.addEventListener('dblclick', e => { e.preventDefault(); apply({ x: 0, y: 0, w: def().w, h: def().h }); });
    }


    // ======================================================================
    // v1.3 (13 Oct 2026): THE GRAPH, EDITABLE BY HAND.
    // The dependency graph is an SLDiagramEditor (diagram_editor.js). It still
    // has NO store of its own: every shape and arrow IS a row of the model.
    //   system            = a systemsData row (new ones are added the way the
    //                       System Directory adds them; only an EMPTY system can
    //                       be removed here)
    //   resource          = a resourcesData row
    //   provides          = the system id in resource.providedBy
    //   feeds             = the system id in resource.consumedBySystems
    //   feeds (function)  = derived from resource.consumedBy through the system's
    //                       function traces: shown, never edited here
    //   interface         = a projectConfig.interfaces row (one way, or both ways)
    // An edit writes those rows (one source of truth: the Resources table, the
    // interface lists, the golden thread and the cascade all read them). Only
    // the positions are diagram data: projectConfig.ceaLayout { shapeId: box }.
    // Clicking a system or resource still traces its cascade (selection is the
    // failure source), with the path drawn in dark red.
    // ======================================================================
    const _arr = v => Array.isArray(v) ? v : [];
    const _sys = () => _arr(typeof systemsData !== 'undefined' ? systemsData : null);
    const _res = () => _arr(typeof resourcesData !== 'undefined' ? resourcesData : null);
    const _pcfg = () => (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : null;
    const _ifs = () => { const pc = _pcfg(); return pc && Array.isArray(pc.interfaces) ? pc.interfaces : []; };
    const _resKey = r => { const v = r.internalId; return String(v != null && String(v) !== '' ? v : r.resId); };
    const _resGraphId = r => 'res:' + (r.resId || r.internalId);
    // identity of an interface row without its own id (older projects): stable per pair
    function _ifKey(f, i, list) {
        if (f && f.id) return String(f.id);
        let n = 0; for (let j = 0; j < i; j++) if (list[j] && !list[j].id && list[j].fromSystemId === f.fromSystemId && list[j].toSystemId === f.toSystemId) n++;
        return '~' + f.fromSystemId + '>' + f.toSystemId + '#' + (n + 1);
    }
    function _ownsSub(s, subId) {
        return _arr(s.functions).some(f => (Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : [])).includes(subId));
    }
    // The model rows -> the editor model. Pure over the globals; writes nothing.
    function ceaEditorModel() {
        const pc = _pcfg(), lay = (pc && pc.ceaLayout) || {};
        const elements = [], connectors = [], sysIds = new Set();
        const S = _sys(), R = _res(), I = _ifs();
        const box = (id, kind, i) => {
            const L = lay[id];
            if (L && isFinite(L.x) && isFinite(L.y)) return { x: +L.x, y: +L.y, w: isFinite(L.w) && L.w > 0 ? +L.w : 230, h: isFinite(L.h) && L.h > 0 ? +L.h : 40 };
            return null;
        };
        const pend = [];
        S.forEach((s, i) => {
            if (!s || s.id == null) return;
            sysIds.add(String(s.id));
            const id = 'sys:' + s.id, b = box(id);
            const el = { id: id, kind: 'system', x: 0, y: 0, w: 230, h: 40, label: s.name || String(s.id), props: { role: s.role || 'function' }, sysmlRef: 'sys:' + s.id };
            if (b) Object.assign(el, b); else pend.push(el);
            elements.push(el);
        });
        R.forEach(r => {
            if (!r) return;
            const id = 'res:' + _resKey(r), b = box(id);
            const el = { id: id, kind: 'resource', x: 0, y: 0, w: 230, h: 40, label: r.name || r.resId || '', props: { resId: r.resId || '', type: r.type || 'Other', description: r.description || '' }, sysmlRef: 'res:' + _resKey(r) };
            if (b) Object.assign(el, b); else pend.push(el);
            elements.push(el);
        });
        if (pend.length) {
            // Default picture (until someone moves a box): the systems that provide a resource on
            // the left, the resources in the middle, every other system on the right, so failure
            // flows left to right. Rows alternate a little sideways so an interface between two
            // neighbours in one column stays visible. Placed below anything already positioned.
            const providers = new Set();
            R.forEach(r => _arr(r && r.providedBy).forEach(p => providers.add('sys:' + p)));
            const placed = elements.filter(e => pend.indexOf(e) < 0);
            const y0 = placed.length ? Math.max(...placed.map(e => e.y + e.h)) + 60 : 0;
            const col = { 0: y0, 1: y0, 2: y0 }, n = { 0: 0, 1: 0, 2: 0 }, X = { 0: 0, 1: 420, 2: 840 };
            pend.forEach(e => {
                const c = e.kind === 'resource' ? 1 : (providers.has(e.id) || (e.props && (e.props.role === 'resource' || e.props.role === 'both')) ? 0 : 2);
                e.x = X[c] + (n[c] % 2 ? 60 : 0); e.y = col[c]; col[c] += 70; n[c]++;
            });
        }
        R.forEach(r => {
            if (!r) return;
            const rid = 'res:' + _resKey(r), k = _resKey(r);
            _arr(r.providedBy).forEach(p => { if (sysIds.has(String(p))) connectors.push({ id: 'prov:' + k + '>' + p, kind: 'provides', from: 'sys:' + p, to: rid, label: '', props: {} }); });
            const fed = new Set();
            _arr(r.consumedBySystems).forEach(c => { if (sysIds.has(String(c))) { fed.add(String(c)); connectors.push({ id: 'feed:' + k + '>' + c, kind: 'feeds', from: rid, to: 'sys:' + c, label: '', props: {} }); } });
            _arr(r.consumedBy).forEach(subId => S.forEach(s => {
                if (!s || fed.has(String(s.id)) || !_ownsSub(s, subId)) return;
                fed.add(String(s.id));
                connectors.push({ id: 'fnfeed:' + k + '>' + s.id + '>' + subId, kind: 'feedsFn', from: rid, to: 'sys:' + s.id, label: 'via ' + subId, props: { subId: String(subId) } });
            }));
        });
        I.forEach((f, i) => {
            if (!f) return;
            const a = String(f.fromSystemId), b = String(f.toSystemId);
            if (!sysIds.has(a) || !sysIds.has(b) || a === b) return;   // a dangling row stays in the store, untouched (gt_integrity reports it)
            const key = _ifKey(f, i, I), both = f.direction === 'bidirectional', rev = f.direction === 'b_to_a';
            const c = { id: 'if:' + key, kind: both ? 'interface2' : 'interface', from: 'sys:' + (rev ? b : a), to: 'sys:' + (rev ? a : b),
                label: f.medium || '', props: { ifKind: f.kind || 'interface', icdRef: f.icdRef || '', rowKey: key, origin: f.origin || '' } };
            if (f.id) c.sysmlRef = 'iface:' + f.id; else if (f.icdRef && I.filter(x => x && x.icdRef === f.icdRef).length === 1) c.sysmlRef = 'iface:' + f.icdRef;
            connectors.push(c);
        });
        return { elements: elements, connectors: connectors };
    }
    // Apply ONE diagram change to the model rows (works the same for undo and redo:
    // the ops carry their before and after).
    function ceaApplyChange(model, change) {
        const pc = _pcfg();
        const S = _sys(), R = _res();
        const sysOf = id => String(id).replace(/^sys:/, '');
        const resRow = id => R.find(r => r && ('res:' + _resKey(r)) === id) || null;
        const addU = (arr, v) => { if (arr.indexOf(v) < 0) arr.push(v); };
        const rmV = (arr, v) => { const i = arr.findIndex(x => String(x) === String(v)); if (i >= 0) arr.splice(i, 1); };
        let sysTouched = false;
        (change.ops || []).forEach(op => {
            const b = op.before, a = op.after;
            if (op.t === 'el') {
                const kind = (a || b).kind;
                if (kind === 'system') {
                    const sid = sysOf((a || b).id);
                    if (!b && a) {
                        const _ndC = window.SLNoDupes, _sameC = _ndC ? _ndC.findSystemByName(a.label || 'New system', S) : null;   // 30 Oct 2026 (no duplicates)
                        if (_sameC && String(_sameC.id) !== sid) { try { if (window.showToast) window.showToast('A system called "' + _sameC.name + '" already exists, so no second one was made. Rename the new box, or use the existing system.', 'warning', 7000); } catch (_) {} }
                        else if (!S.some(s => s && String(s.id) === sid)) {
                            const s = { id: sid, name: a.label || 'New system', role: (a.props && a.props.role) || 'function', asmCounter: 1, functions: [], fcim: [], extractedFCs: [], fha: [], req: [], asm: [] };
                            systemsData.push(s);
                            try { if (window.PROGRAM_PLAN && PROGRAM_PLAN.initSystemPlan) PROGRAM_PLAN.initSystemPlan(sid, null); } catch (_) {}
                        }
                        sysTouched = true;
                    } else if (b && !a) {
                        const i = S.findIndex(s => s && String(s.id) === sid);
                        if (i >= 0) systemsData.splice(i, 1);
                        try { const sp = pc && pc.safetyProgramPlan && pc.safetyProgramPlan.systemPlans; if (sp) delete sp[sid]; } catch (_) {}
                        sysTouched = true;
                    } else if (a && b) {
                        const s = S.find(x => x && String(x.id) === sid);
                        if (s) { if (a.label !== b.label) { s.name = a.label; sysTouched = true; } const r0 = (b.props || {}).role, r1 = (a.props || {}).role; if (r1 && r1 !== r0) { s.role = r1; sysTouched = true; } }
                    }
                } else if (kind === 'resource') {
                    if (!b && a) {
                        if (!resRow(a.id)) {
                            const used = new Set(R.map(r => r && r.resId));
                            let n = R.length + 1, rid; do { rid = 'RES-' + String(n++).padStart(3, '0'); } while (used.has(rid));
                            const p = a.props || {};
                            resourcesData.push({ internalId: String(a.id).replace(/^res:/, ''), resId: p.resId || rid, name: a.label || 'New resource', type: p.type || 'Other', providedBy: [], consumedBy: [], consumedBySystems: [], description: p.description || '' });
                        }
                    } else if (b && !a) {
                        const i = R.findIndex(r => r && ('res:' + _resKey(r)) === b.id);
                        if (i >= 0) resourcesData.splice(i, 1);
                    } else {
                        const r = resRow(a.id);
                        if (r) { r.name = a.label; const p = a.props || {}; if (p.type) r.type = p.type; r.description = p.description || ''; if (p.resId && p.resId !== r.resId) r.resId = p.resId; }
                    }
                }
            } else {
                const kind = (a || b).kind;
                if (kind === 'provides' || kind === 'feeds') {
                    const add = !b && a, rem = b && !a;
                    if (!add && !rem) return;
                    const c = a || b, r = resRow(kind === 'provides' ? c.to : c.from), sid = sysOf(kind === 'provides' ? c.from : c.to);
                    if (!r) return;
                    const key = kind === 'provides' ? 'providedBy' : 'consumedBySystems';
                    if (!Array.isArray(r[key])) r[key] = [];
                    if (add) addU(r[key], sid); else rmV(r[key], sid);
                }
                // interface / interface2: read-only here (24 Oct 2026, IFACE_RO); the guard refuses the change before
                // it reaches this point, and nothing below writes projectConfig.interfaces from the diagram
            }
        });
        // positions: the only diagram data
        if (pc) {
            const lay = {};
            (model.elements || []).forEach(e => { lay[e.id] = { x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), h: Math.round(e.h) }; });
            pc.ceaLayout = lay;
        }
        return { sysTouched: sysTouched };
    }
    // What a diagram change may not do, in plain words (null = fine).
    const IFACE_RO = 'Interfaces come from Sys Lab or your SysML model import and are read here, not drawn or edited. Change the interface there and import it again.';
    function ceaGuard(change) {
        const items = _arr(typeof itemsData !== 'undefined' ? itemsData : null);
        for (const op of change.ops || []) {
            if (op.t === 'el' && op.before && !op.after && op.before.kind === 'system') {
                const sid = String(op.before.id).replace(/^sys:/, '');
                const s = _sys().find(x => x && String(x.id) === sid);
                const busy = s && (_arr(s.functions).length || _arr(s.fha).length || _arr(s.req).length || _arr(s.asm).length || items.some(it => it && String(it.owningSystemId) === sid));
                if (busy) return '"' + (op.before.label || sid) + '" carries functions, hazards, requirements or items. Remove a system in the System Directory, where everything it owns is shown.';
            }
            // 24 Oct 2026 (Waqas): interfaces are defined in Sys Lab or the customer's SysML model and come into
            // Safety Lab by import. The cascade graph shows them and uses them; it never adds, edits or removes one.
            if (op.t === 'cn' && ((op.before && (op.before.kind === 'interface' || op.before.kind === 'interface2')) || (op.after && (op.after.kind === 'interface' || op.after.kind === 'interface2'))))
                return IFACE_RO;
            if (op.t === 'cn' && op.before && !op.after && op.before.kind === 'feedsFn')
                return 'This link comes from the resource being consumed by function ' + ((op.before.props && op.before.props.subId) || '') + ', which this system performs. Change it in the Resources table (consumed by functions).';
        }
        return null;
    }
    function _ceaNewId(what, kind, ctx) {
        const m = (ctx && ctx.model) || { elements: [], connectors: [] };
        const rnd = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        if (what === 'element') return kind === 'system' ? 'sys:sys-' + rnd() : 'res:' + ((typeof newRowId === 'function') ? newRowId() : 'res-' + rnd());
        if (kind === 'provides' && ctx.from && ctx.to) return 'prov:' + String(ctx.to).replace(/^res:/, '') + '>' + String(ctx.from).replace(/^sys:/, '');
        if (kind === 'feeds' && ctx.from && ctx.to) return 'feed:' + String(ctx.from).replace(/^res:/, '') + '>' + String(ctx.to).replace(/^sys:/, '');
        return 'if:iface-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    }

    // ---- cascade highlight (selection = failure source) -------------------
    let _ceaEd = null, _ceaHost = null, _ceaTrace = true, _ceaReach = null;
    // the cascade engine's node id for a shape (no lookups: it renders for every visible shape)
    const _graphIdOfEl = el => {
        if (!el) return '';
        if (el.kind === 'system') return String(el.id).replace(/^sys:/, '');
        return 'res:' + ((el.props && el.props.resId) || String(el.id).replace(/^res:/, ''));
    };
    function _ceaSyncReach() {
        const sel = window._ceaSelected;
        _ceaReach = sel ? new Set(ceaCascade(sel).map(r => r.id)) : null;
    }
    function _ceaOnPath(c) {
        const sel = window._ceaSelected; if (!sel || !_ceaReach || !_ceaEd) return false;
        const gid = id => _graphIdOfEl(_ceaEd.store.getEl(id));
        const f = gid(c.from), t = gid(c.to), S = x => x === sel || _ceaReach.has(x);
        return (S(f) && _ceaReach.has(t)) || (c.kind === 'interface2' && S(t) && _ceaReach.has(f));
    }
    let _ceaRegistered = false;
    function _registerCeaDiagram() {
        if (_ceaRegistered || !window.SLDiagramEditor) return;
        _ceaRegistered = true;
        if (!document.getElementById('cea-diagram-css')) {
            const st = document.createElement('style'); st.id = 'cea-diagram-css';
            st.textContent = '.sde[data-diagram="cea"] .cea-dim{opacity:.18}' +
                '.sde[data-diagram="cea"] .cea-path .sde-line{stroke:#8E2A2A!important;stroke-width:2.4}' +
                '.sde[data-diagram="cea"] .cea-src .sde-shape{stroke:#8E2A2A;stroke-width:3}' +
                '.sde[data-diagram="cea"] .cea-reach .sde-shape{stroke:#8E2A2A;stroke-width:2}';
            document.head.appendChild(st);
        }
        const types = (typeof RESOURCE_TYPES !== 'undefined' && Array.isArray(RESOURCE_TYPES)) ? RESOURCE_TYPES : ['Electrical', 'Hydraulic', 'Pneumatic', 'Fuel', 'Mechanical', 'Data/Signal', 'Thermal', 'Other'];
        SLDiagramEditor.register({
            type: 'cea',
            title: 'Cascading effects graph',
            grid: 10,
            elementKinds: {
                system: { label: 'System', description: 'A system of the aircraft (it appears in the System Directory too)', shape: 'rect', w: 230, h: 40, minW: 120, minH: 30, defaultLabel: 'New system', defaultProps: { role: 'function' }, sysmlLinkable: false, sysmlType: 'SafetyLab::System', style: { fill: 'var(--color-surface-1,#fff)', stroke: 'var(--color-border-strong,#9aa3af)', strokeWidth: 1.3 } },
                resource: { label: 'Resource', description: 'A shared resource: electrical power, hydraulics, data, air, fuel', shape: 'roundRect', w: 230, h: 40, minW: 120, minH: 30, defaultLabel: 'New resource', defaultProps: { type: 'Electrical', description: '' }, sysmlLinkable: false, sysmlType: 'SafetyLab::SharedResource', style: { fill: 'var(--color-surface-2,#f5f6f8)', stroke: '#9A6200', strokeWidth: 1.3 } }
            },
            connectorKinds: {
                provides: { label: 'Provides', description: 'A system provides a resource (its failure degrades the resource)', from: ['system'], to: ['resource'], route: 'curved', style: { stroke: '#9A6200', width: 1.5 }, labelEditable: false, sysmlLinkable: false },
                feeds: { label: 'Feeds', description: 'A resource feeds a system (losing it degrades the system)', from: ['resource'], to: ['system'], route: 'curved', style: { stroke: '#4A6741', width: 1.5 }, labelEditable: false, sysmlLinkable: false },
                feedsFn: { label: 'Feeds (through a function)', description: 'Derived: the resource is consumed by a function this system performs', from: ['resource'], to: ['system'], route: 'curved', style: { stroke: '#4A6741', width: 1.3, dash: '5 4' }, hidden: true, labelEditable: false, sysmlLinkable: false },
                interface: { hidden: true, labelEditable: false, label: 'Interface (one way)', description: 'Declared reliance between two systems: a failure flows along the arrow', from: ['system'], to: ['system'], route: 'curved', allowDuplicate: true, style: { stroke: '#4E63D8', width: 1.5 }, sysmlLinkable: false },
                interface2: { hidden: true, labelEditable: false, label: 'Interface (both ways)', description: 'Mutual reliance: a failure flows both ways', from: ['system'], to: ['system'], route: 'curved', allowDuplicate: true, directed: false, arrow: 'both', style: { stroke: '#4E63D8', width: 1.5 }, sysmlLinkable: false }
            },
            newId: _ceaNewId,
            canConnect: function (a, b, kind) { return kind === 'feedsFn' ? 'This kind of link comes from function traces; it is not drawn by hand.' : ((kind === 'interface' || kind === 'interface2') ? IFACE_RO : true); },
            layout: 'layered', layoutOptions: { direction: 'right' },
            fields: function (item, ctx) {
                if (ctx.isElement && item.kind === 'system') return [{ key: 'props.role', label: 'Role', type: 'select', options: [{ value: 'function', label: 'Implements functions' }, { value: 'resource', label: 'Provides a resource' }, { value: 'both', label: 'Both' }] }];
                if (ctx.isElement) return [{ key: 'props.resId', label: 'Resource ID', type: 'text', validate: v => !String(v || '').trim() ? 'A resource needs an ID.' : (_res().some(r => r && r.resId === String(v).trim() && ('res:' + _resKey(r)) !== item.id) ? 'Another resource already uses that ID.' : null) },
                    { key: 'props.type', label: 'Type', type: 'select', options: types },
                    { key: 'props.description', label: 'Description', type: 'textarea' }];
                if (item.kind === 'interface' || item.kind === 'interface2') {
                    const opts = [{ value: 'interface', label: 'Physical or data dependency' }, { value: 'resource', label: 'Shared resource (common cause candidate)' }, { value: 'functional', label: 'Functional reliance' }];
                    const imported = (item.props || {}).origin === 'sysml-import';
                    const from = imported ? 'From your architecture model import. Change it there and import again.'
                        : 'Entered in Safety Lab before interfaces moved to the architecture model. It is still used by the analyses; bring it in from Sys Lab or your SysML model to keep it current.';
                    return [{ key: 'props.ifKind', label: 'Interface type', type: 'select', options: opts, readOnly: true, help: from },
                        { key: 'props.icdRef', label: 'ICD reference', type: 'text', readOnly: true }];
                }
                if (item.kind === 'feedsFn') return [{ key: 'props.subId', label: 'Through function', readOnly: true, help: 'Change it in the Resources table (consumed by functions).' }];
                return [];
            },
            canDelete: function (item) {
                return ceaGuard({ ops: [{ t: item.from != null ? 'cn' : 'el', before: item, after: null }] }) || true;
            },
            beforeChange: function (change) {
                const why = ceaGuard(change);
                if (why) { try { if (typeof showToast === 'function') showToast(why, 'error', 5200); } catch (_) {} return false; }
                return true;
            },
            elementClass: function (el) {
                const sel = window._ceaSelected; if (!sel) return '';
                const g = _graphIdOfEl(el);
                return g === sel ? 'cea-src' : (_ceaReach && _ceaReach.has(g) ? 'cea-reach' : 'cea-dim');
            },
            connectorClass: function (c) {
                if (!window._ceaSelected) return '';
                return _ceaOnPath(c) ? 'cea-path' : 'cea-dim';
            },
            panel: function (item) {
                if (!item) return '<label>Cascade</label><div class="sde-help">Click a system or a resource to trace what its failure reaches. The path turns dark red; everything it cannot reach fades.</div>';
                if (item.from == null) {
                    const g = _graphIdOfEl(item);
                    const n = g ? ceaCascade(g).length : 0;
                    return '<label>Cascade</label><div class="sde-help">' + (n ? 'Its failure reaches ' + n + ' system' + (n === 1 ? '' : 's') + ' and resource' + (n === 1 ? '' : 's') + '.' : 'Its failure reaches nothing else in the graph.') + '</div>';
                }
                return '';
            }
        });
    }
    function _ceaSetSelected(gid) {
        window._ceaSelected = gid || '';
        _ceaSyncReach();
        if (_ceaEd) _ceaEd.refresh();
        _renderCeaBelow();
    }
    function _ceaToggleTrace(ed) {
        _ceaTrace = !_ceaTrace;
        const b = ed && ed.root && ed.root.querySelector('[data-act="custom-0"]');
        if (b) { b.setAttribute('aria-pressed', _ceaTrace ? 'true' : 'false'); b.textContent = _ceaTrace ? 'Trace cascade: on' : 'Trace cascade: off'; }
        if (!_ceaTrace) _ceaSetSelected('');
        else { const s = ed.selection(); if (s.length === 1 && ed.store.getEl(s[0])) _ceaSetSelected(_graphIdOfEl(ed.store.getEl(s[0]))); }
    }
    function _mountCeaDiagram() {
        const slot = document.getElementById('cea-graph-slot');
        if (!slot) return false;
        if (!window.SLDiagramEditor) return false;
        _registerCeaDiagram();
        if (!_ceaHost) { _ceaHost = document.createElement('div'); _ceaHost.className = 'cea-editor'; }
        if (_ceaHost.parentNode !== slot) slot.appendChild(_ceaHost);
        if (!_ceaEd) {
            _ceaEd = SLDiagramEditor.mount(_ceaHost, {
                type: 'cea', height: 'fill', lockKey: 'cea:graph',
                adapter: {
                    load: ceaEditorModel,
                    save: function (model, change) {
                        const r = ceaApplyChange(model, change);
                        try { if (typeof window.renderResources === 'function') window.renderResources(); } catch (_) {}
                        if (r.sysTouched) { try { if (typeof renderSystemDirectory === 'function') renderSystemDirectory(); } catch (_) {} }
                        setTimeout(() => { try { renderCeaPage(); } catch (_) {} }, 0);
                    }
                },
                actions: [{ label: 'Trace cascade: on', title: 'When on, clicking a system or resource traces what its failure reaches', run: _ceaToggleTrace }]
            });
            const b = _ceaEd.root.querySelector('[data-act="custom-0"]'); if (b) b.setAttribute('aria-pressed', 'true');
            _ceaEd.on('select', function (ids) {
                if (!_ceaTrace) return;
                const el = ids.length === 1 ? _ceaEd.store.getEl(ids[0]) : null;
                if (el) { const g = _graphIdOfEl(el); if (g !== window._ceaSelected) _ceaSetSelected(g); }
                else if (!ids.length && window._ceaSelected) _ceaSetSelected('');
            });
            // a selection made before the editor existed (ceaSelect from elsewhere) shows on open
            if (window._ceaSelected) { const eid = _elIdOfGraph(window._ceaSelected); if (eid) _ceaEd.select([eid]); }
        } else {
            _ceaEd.reload();
            _ceaSyncReach();
            _ceaEd.refresh();
        }
        return true;
    }
    function _elIdOfGraph(gid) {
        if (!gid) return null;
        if (String(gid).indexOf('res:') === 0) { const r = _res().find(x => x && _resGraphId(x) === gid); return r ? 'res:' + _resKey(r) : null; }
        return 'sys:' + gid;
    }

    // ---------------------------------------------------------------- page
    function renderCeaPage() {
        const host = document.getElementById('cea-host');
        if (!host) return;
        const g = ceaGraph();
        const f = ceaFindings();
        const sel = window._ceaSelected;

        const conflicts = f.rows.filter(r => r.kind === 'conflict');
        const unreviewed = f.rows.filter(r => r.kind === 'unreviewed');
        const tile = (lbl, val, sub, warn) => '<div style="border:1px solid var(--color-border-hair); border-radius:10px; padding:12px 14px; background:var(--color-surface-1);">' +
            '<div style="font-size:11px; color:var(--color-text-tertiary); text-transform:uppercase; letter-spacing:0.05em;">' + lbl + '</div>' +
            '<div style="font-size:24px; font-weight:700; margin-top:2px;' + (warn ? ' color:#8E2A2A;' : '') + '">' + val + '</div>' +
            (sub ? '<div style="font-size:11px; color:var(--color-text-tertiary);">' + sub + '</div>' : '') + '</div>';

        let html = '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px;">' +
            tile('Graph', g.nodes.size + ' nodes', g.edges.length + ' dependency edges') +
            tile('Pairs reconciled', f.pairs, f.corroborated + ' corroborated by the table') +
            tile('Unreviewed paths', unreviewed.length, 'cascade exists, cell never reviewed', unreviewed.length > 0) +
            tile('Conflicts', conflicts.length, 'cleared cell vs live dependency path', conflicts.length > 0) + '</div>';

        const editable = !!window.SLDiagramEditor;
        html += '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:12px 14px; margin-bottom:16px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:12px; flex-wrap:wrap;"><b>Dependency graph</b>' +
            '<span id="cea-graph-hint" style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">' + _esc(_ceaHint(g, editable)) + '</span></div>' +
            (editable ? '<div id="cea-graph-slot"></div>' : _svgGraph(g)) +
            '<div style="font-size:10.5px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:4px;">' +
            '<span style="color:#9A6200;">━</span> provides · <span style="color:#4A6741;">━</span> feeds · <span style="color:#4A6741;">┅</span> feeds through a function · <span style="color:#4E63D8;">━</span> interface · <span style="color:#8E2A2A;">━</span> selected cascade</div></div>' +
            '<div id="cea-below"></div>';
        host.innerHTML = html;
        if (editable) { try { _mountCeaDiagram(); } catch (e) { try { console.warn('[cea] editor', e); } catch (_) {} } }
        else { try { _ceaBindPanZoom(); } catch (_) {} }
        _renderCeaBelow(g, f);
    }
    function _ceaHint(g, editable) {
        const sel = window._ceaSelected;
        if (!editable) return (sel ? 'cascade from ' + ((g.nodes.get(sel) || {}).name || sel) + ' — click again to clear' : 'click a node to trace its cascade') + ' · drag to pan · ⌘/Ctrl+scroll to zoom · double-click to reset';
        return sel ? 'Cascade from ' + ((g.nodes.get(sel) || {}).name || sel) + '. Click empty space to clear.' : 'Click a system or resource to trace its cascade. Drag from the toolbox to add; drag a blue dot to connect.';
    }
    // The cascade closure and the reconciliation findings, under the graph (re-rendered on
    // their own, so a selection never rebuilds the editor).
    function _renderCeaBelow(g, f) {
        const below = document.getElementById('cea-below');
        if (!below) return;
        g = g || ceaGraph(); f = f || ceaFindings();
        const sel = window._ceaSelected;
        const hint = document.getElementById('cea-graph-hint'); if (hint) hint.textContent = _ceaHint(g, !!window.SLDiagramEditor);
        let html = '';
        if (sel) {
            const casc = ceaCascade(sel, g);
            html += '<div style="margin-bottom:16px;"><b style="font-size:13px;">Cascade closure (' + casc.length + ' reached)</b>' +
                '<table class="data-table" style="width:100%; font-size:12px; margin-top:6px;"><thead><tr><th>Hops</th><th>Reached</th><th>Path</th></tr></thead><tbody>' +
                casc.map(c => '<tr><td class="u-mono">' + c.hops + '</td><td><b>' + _esc(c.name) + '</b> <span style="font-size:10px; color:var(--color-text-tertiary);">' + c.kind + '</span></td>' +
                    '<td class="u-mono" style="font-size:10.5px;">' + _esc(c.path) + '</td></tr>').join('') +
                '</tbody></table></div>';
        }

        if (f.rows.length) {
            html += '<b style="font-size:13px;">Reconciliation findings — graph vs interdependence table</b>' +
                '<table class="data-table" style="width:100%; font-size:12px; margin-top:6px;"><thead><tr><th>Kind</th><th>Source system</th><th>FC at risk</th><th>Severity</th><th>Dependency path</th><th>Detail</th></tr></thead><tbody>' +
                f.rows.slice(0, 40).map(r => '<tr><td>' +
                    '<span style="display:inline-block; padding:2px 8px; font-size:10px; font-weight:600; text-transform:uppercase; border-radius:var(--r-full); ' +
                    (r.kind === 'conflict' ? 'color:#8E2A2A; background:rgba(255,59,48,0.12);' : 'color:#9A6200; background:rgba(255,149,0,0.12);') + '">' + r.kind + '</span></td>' +
                    '<td>' + _esc(r.source) + '</td><td class="u-mono">' + _esc(r.fc) + '</td><td>' + _esc(r.severity || '—') + '</td>' +
                    '<td class="u-mono" style="font-size:10.5px;">' + _esc(r.via) + '</td><td style="font-size:11px; color:var(--color-text-secondary);">' + _esc(r.detail) + '</td></tr>').join('') +
                '</tbody></table>' +
                (f.rows.length > 40 ? '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">… ' + (f.rows.length - 40) + ' more</p>' : '');
        } else {
            html += '<p style="color:var(--color-text-tertiary); font-size:13px;">Every cascade path is corroborated by the interdependence table — no findings.</p>';
        }
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">The graph is the model\'s own dependency structure: Resources (provides / feeds), declared interfaces, and nothing else. Editing it edits those rows, the same ones the tables show. ' +
            'Findings are disagreements between the computed lane (cascade closure) and the elicited lane (interdependence cells). Resolve a finding by reviewing its cell; change the graph only when the dependency model itself is wrong.</p>';
        below.innerHTML = html;
    }

    // ---------------------------------------- runtime graft: the PASA gate
    (function graftGate() {
        try {
            if (typeof CKPT_CHECKLISTS === 'undefined' || !Array.isArray(CKPT_CHECKLISTS.PASA)) return;
            if (CKPT_CHECKLISTS.PASA.some(i => i.id === 'cea')) return;
            CKPT_CHECKLISTS.PASA.push({
                id: 'cea', kind: 'auto', ref: 'B.3',
                label: 'Cascade paths reconciled with the interdependence table',
                eval: () => {
                    const f = ceaFindings();
                    if (!f.pairs) return { pass: true, detail: 'no dependency paths in the model' };
                    return { pass: f.rows.length === 0,
                        detail: f.rows.length ? f.rows.filter(r => r.kind === 'conflict').length + ' conflict(s) · ' + f.rows.filter(r => r.kind === 'unreviewed').length + ' unreviewed path(s)' : f.corroborated + ' path(s), all corroborated' };
                },
            });
        } catch (_) {}
    })();

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._ceaWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-cea');
                if (v) v.style.display = (tabId === 'cea') ? 'block' : 'none';
                const s = document.getElementById('snav-cea');
                if (s) s.classList.toggle('snav-active', tabId === 'cea');
                if (tabId === 'cea') renderCeaPage();
            } catch (_) {}
            return r;
        };
        wrapped._ceaWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.ceaGraph = ceaGraph;
    window.ceaCascade = ceaCascade;
    window.ceaFindings = ceaFindings;
    window.renderCeaPage = renderCeaPage;
    window.CEA_EDIT = { model: ceaEditorModel, apply: ceaApplyChange, guard: ceaGuard, newId: _ceaNewId, editor: function () { return _ceaEd; } };
    // a canceled change (change acknowledgement) put the project back: repaint when on screen
    if (typeof window.addEventListener === 'function') window.addEventListener('sl:change-ack', function (ev) { try { if (ev && ev.detail && ev.detail.decision === 'canceled' && document.getElementById('cea-host') && document.getElementById('cea-host').isConnected && document.getElementById('cea-host').offsetParent) renderCeaPage(); } catch (_) {} });
})();

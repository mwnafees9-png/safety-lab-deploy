// ============================================================================
// cad_review.js, v1.0: what the team shares about a CAD model (window.SLCadReview, 13 Oct 2026, cad-C).
//
// Saved views, 3D notes and markups, color by attribute and revision compare: the data and the
// rules, no drawing (cad_viewer.js draws). Everything stored here goes into projectConfig, which
// syncs with the project, so it is METADATA ONLY: a camera, plane positions, part ids, a point
// relative to a part, text, who and when. Every write passes the same guard as the CAD import
// (SLCadImport.containsGeometry): anything that looks like geometry is refused.
//
//   projectConfig.cadViews   = [{ id:'cv-<n>', name, fileName, cadId, camera:{ eye, target,
//                                 up, fov }, sections:{ planes:[...], box, caps }, explode, ghost,
//                                 hidden:[pid...]|null, isolate:[pid...]|null, colorBy, by, at }]
//   projectConfig.cadMarkups = [{ id:'cm-<n>', fileName, cadId, pid, local:[dx,dy,dz], kind:
//                                 'note'|'arrow'|'circle', text, size, dir, by, at, status:
//                                 'open'|'closed', closedBy?, closedAt? }]
// A markup is pinned to a part: local = the picked point minus the part's centroid (the centroid
// is in the project's part list, so every computer places it the same), and it follows the part
// into a later revision that keeps the part's id.
// Deterministic: lists sorted by id; colors from a fixed palette in sorted value order.
// No DOM, no eval, no network. Node tests: tests/regression_cad_review_20261013.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';
    function _pc() {
        try { if (root.SLEnv && typeof root.SLEnv.get === 'function') { var v = root.SLEnv.get('projectConfig'); if (v) return v; } } catch (_) {}
        try { if (typeof projectConfig !== 'undefined' && projectConfig) return projectConfig; } catch (_) {}   // eslint-disable-line no-undef
        root.projectConfig = root.projectConfig || {};
        return root.projectConfig;
    }
    function _save() { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} }
    function _arr(pc, k) { if (!Array.isArray(pc[k])) pc[k] = []; return pc[k]; }
    function _now(o) { return (o && o.at) || new Date().toISOString(); }
    function _clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
    function _num3(a) { return Array.isArray(a) && a.length === 3 && a.every(function (x) { return typeof x === 'number' && isFinite(x); }); }
    function _r(v) { return Math.round(v * 1e4) / 1e4; }
    function _r3(a) { return [_r(a[0]), _r(a[1]), _r(a[2])]; }
    function _nextId(list, prefix) { var n = 0; list.forEach(function (x) { var m = new RegExp('^' + prefix + '-(\\d+)$').exec(x && x.id || ''); if (m) n = Math.max(n, +m[1]); }); return prefix + '-' + (n + 1); }
    function _geomFree(obj) { var I = root.SLCadImport; if (I && typeof I.containsGeometry === 'function') return !I.containsGeometry(obj); return true; }
    var MAX_PIDS = 20000;   // a view stores at most this many hidden / isolated part ids

    // ------------------------------------------------------------ saved views
    function views(filter) {
        var list = _arr(_pc(), 'cadViews').slice();
        if (filter && filter.fileName) list = list.filter(function (v) { return !v.fileName || v.fileName === filter.fileName; });
        return list.sort(function (a, b) { return _nat(a.id, b.id); });
    }
    function _nat(a, b) { var x = /-(\d+)$/.exec(a || ''), y = /-(\d+)$/.exec(b || ''); return x && y ? (+x[1] - +y[1]) : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; }
    function _cleanPlane(p) { return { dir: _r3(p.dir), offset: _r(+p.offset || 0), on: p.on !== false }; }
    // state: { camera:{eye,target,up,fov}, sections:{ planes:[{dir,offset,on}], box:{min,max}|null, caps }, explode, ghost, hidden, isolate, colorBy }
    // (a plane is its unit direction and its offset along it: the words 'normal' and 'position'
    // are kept for geometry by the import's guard, so the shared records do not use them for keys)
    function saveView(state, meta) {
        meta = meta || {};
        var name = String(meta.name || '').trim();
        if (!name) return { ok: false, err: 'A saved view needs a name.' };
        if (!meta.by) return { ok: false, err: 'A saved view is recorded with who saved it.' };
        var c = state && state.camera;
        if (!c || !_num3(c.eye) || !_num3(c.target)) return { ok: false, err: 'No camera to save.' };
        var sec = state.sections || {};
        var hidden = Array.isArray(state.hidden) ? state.hidden.slice().sort() : null;
        var isolate = Array.isArray(state.isolate) ? state.isolate.slice().sort() : null;
        if ((hidden && hidden.length > MAX_PIDS) || (isolate && isolate.length > MAX_PIDS)) return { ok: false, err: 'Too many hidden parts to keep in a shared view (' + MAX_PIDS + ' at most); isolate fewer parts.' };
        var v = {
            id: null, name: name, fileName: meta.fileName || null, cadId: meta.cadId || null,
            camera: { eye: _r3(c.eye), target: _r3(c.target), up: _num3(c.up) ? _r3(c.up) : [0, 0, 1], fov: +c.fov || 45 },
            sections: { planes: (sec.planes || []).filter(function (p) { return p && _num3(p.dir); }).map(_cleanPlane), box: sec.box && _num3(sec.box.min) && _num3(sec.box.max) ? { min: _r3(sec.box.min), max: _r3(sec.box.max) } : null, caps: sec.caps !== false },
            explode: _r(+state.explode || 0), ghost: !!state.ghost, hidden: hidden, isolate: isolate,
            colorBy: state.colorBy ? String(state.colorBy) : null, by: String(meta.by), at: _now(meta)
        };
        if (!_geomFree(v)) return { ok: false, err: 'Refused: a saved view may not carry geometry.' };
        var list = _arr(_pc(), 'cadViews');
        if (meta.replaceId) {
            var i = list.findIndex(function (x) { return x && x.id === meta.replaceId; });
            if (i < 0) return { ok: false, err: 'No saved view ' + meta.replaceId + '.' };
            v.id = meta.replaceId; list[i] = v;
        } else { v.id = _nextId(list, 'cv'); list.push(v); }
        _save();
        return { ok: true, view: _clone(v) };
    }
    function renameView(id, name, by) {
        var v = _arr(_pc(), 'cadViews').find(function (x) { return x && x.id === id; });
        if (!v) return { ok: false, err: 'No saved view ' + id + '.' };
        name = String(name || '').trim(); if (!name) return { ok: false, err: 'A saved view needs a name.' };
        v.name = name; v.renamedBy = by || null; _save(); return { ok: true };
    }
    function removeView(id) {
        var list = _arr(_pc(), 'cadViews'), i = list.findIndex(function (x) { return x && x.id === id; });
        if (i < 0) return { ok: false, err: 'No saved view ' + id + '.' };
        list.splice(i, 1); _save(); return { ok: true };
    }
    function getView(id) { var v = _arr(_pc(), 'cadViews').find(function (x) { return x && x.id === id; }); return v ? _clone(v) : null; }

    // ------------------------------------------------------------ notes and markups
    var KINDS = ['note', 'arrow', 'circle'];
    function markups(filter) {
        var list = _arr(_pc(), 'cadMarkups').slice();
        if (filter && filter.fileName) list = list.filter(function (m) { return m.fileName === filter.fileName; });
        if (filter && filter.status) list = list.filter(function (m) { return (m.status || 'open') === filter.status; });
        return list.sort(function (a, b) { return _nat(a.id, b.id); });
    }
    // m: { pid, point (world mm, picked on the part), part (its metadata: centroid), kind, text,
    //      size?, dir?, by, fileName, cadId }
    function addMarkup(m) {
        m = m || {};
        if (!m.pid || !m.part || !_num3(m.part.centroid)) return { ok: false, err: 'A note is pinned to a part: pick a part first.' };
        if (!_num3(m.point)) return { ok: false, err: 'No point on the part.' };
        if (!m.by) return { ok: false, err: 'A note is recorded with who wrote it.' };
        var kind = KINDS.indexOf(m.kind) >= 0 ? m.kind : 'note';
        var text = String(m.text || '').trim();
        if (kind === 'note' && !text) return { ok: false, err: 'A note needs text.' };
        var c = m.part.centroid;
        var rec = { id: null, fileName: m.fileName || null, cadId: m.cadId || null, pid: String(m.pid), local: _r3([m.point[0] - c[0], m.point[1] - c[1], m.point[2] - c[2]]), kind: kind, text: text, by: String(m.by), at: _now(m), status: 'open' };
        if (m.size > 0) rec.size = _r(+m.size);
        if (_num3(m.dir)) rec.dir = _r3(m.dir);
        if (!_geomFree(rec)) return { ok: false, err: 'Refused: a note may not carry geometry.' };
        var list = _arr(_pc(), 'cadMarkups');
        rec.id = _nextId(list, 'cm'); list.push(rec); _save();
        return { ok: true, markup: _clone(rec) };
    }
    function setMarkupStatus(id, status, by, o) {
        var r = _arr(_pc(), 'cadMarkups').find(function (x) { return x && x.id === id; });
        if (!r) return { ok: false, err: 'No note ' + id + '.' };
        if (status === 'closed') { if (!by) return { ok: false, err: 'Closing a note is recorded with who closed it.' }; r.status = 'closed'; r.closedBy = String(by); r.closedAt = _now(o); }
        else { r.status = 'open'; delete r.closedBy; delete r.closedAt; }
        _save(); return { ok: true };
    }
    function removeMarkup(id) { var list = _arr(_pc(), 'cadMarkups'), i = list.findIndex(function (x) { return x && x.id === id; }); if (i < 0) return { ok: false, err: 'No note ' + id + '.' }; list.splice(i, 1); _save(); return { ok: true }; }
    // World position of a markup on a model's part list (null when the part is not in it).
    function markupPoint(m, partsByPid) {
        var p = partsByPid && partsByPid[m.pid]; if (!p || !_num3(p.centroid)) return null;
        return [p.centroid[0] + m.local[0], p.centroid[1] + m.local[1], p.centroid[2] + m.local[2]];
    }

    // ------------------------------------------------------------ color by attribute
    // A fixed qualitative palette (readable on the light canvas), used in sorted value order.
    var PALETTE = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#393b79', '#e6550d', '#31a354', '#756bb1', '#843c39', '#3182bd', '#637939', '#de9ed6', '#7b4173', '#fd8d3c', '#6baed6'];
    var NONE_COLOR = '#b9bec7';
    function hexToRgb(h) { var n = parseInt(String(h).slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
    var ATTRS = { system: 'Equipment (system)', zone: 'Zone', dal: 'DAL', partNumber: 'Part number', assembly: 'Assembly', designator: 'Designator', material: 'Material', custom: 'Custom field' };
    var SEV_DAL = { 'Catastrophic': 'A', 'Hazardous': 'B', 'Major': 'C', 'Minor': 'D', 'No Safety Effect': 'E', 'Negligible': 'E' };
    var SEV_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'No Safety Effect': 1, 'Negligible': 1 };
    // The DAL a system carries: its own field when set, else from its worst failure condition
    // (through the project's certification basis when the app provides it).
    function systemDal(sys) {
        if (!sys) return null;
        var own = sys.dal || sys.fdal || sys.DAL; if (own) return String(own).replace(/^DAL\s*/i, '').toUpperCase();
        var worst = null;
        (sys.fha || []).forEach(function (r) { if (r && SEV_RANK[r.severity] != null && (!worst || SEV_RANK[r.severity] > SEV_RANK[worst])) worst = r.severity; });
        if (!worst) return null;
        try { if (typeof root.getSafetyTarget === 'function') { var t = root.getSafetyTarget(worst); if (t && t.dal) return String(t.dal); } } catch (_) {}
        return SEV_DAL[worst] || null;
    }
    // ctx: { links: { pid: sysId }, systems: [..], zoneOf: { pid: zoneLabel }, attrs: { pid: {...} }, field }
    function attrValue(attr, part, ctx) {
        ctx = ctx || {};
        var sysId = ctx.links && ctx.links[part.pid], sys = sysId != null ? (ctx.systems || []).find(function (s) { return s && String(s.id) === String(sysId); }) : null;
        switch (attr) {
            case 'system': return sys ? (sys.name || String(sys.id)) : null;
            case 'zone': return (ctx.zoneOf && ctx.zoneOf[part.pid]) || null;
            case 'dal': return sys ? (systemDal(sys) ? 'DAL ' + systemDal(sys) : null) : null;
            case 'partNumber': return part.partNumber || null;
            case 'assembly': return (part.path && part.path.length) ? part.path[Math.min(1, part.path.length - 1)] : null;
            case 'designator': return part.designator || null;
            case 'material': return (ctx.attrs && ctx.attrs[part.pid] && ctx.attrs[part.pid].material) || null;
            case 'custom': {
                var f = String(ctx.field || '').trim(); if (!f) return null;
                var v = part[f]; if (v == null && ctx.attrs && ctx.attrs[part.pid]) v = ctx.attrs[part.pid][f];
                if (v == null && sys) v = sys[f];
                return v == null || v === '' ? null : String(v);
            }
        }
        return null;
    }
    // -> { byPid: { pid: [r,g,b] }, legend: [{ value, color, count, pids }] } (value null = "(none)")
    function colorBy(attr, parts, ctx) {
        var groups = {}, none = [];
        (parts || []).forEach(function (p) { var v = attrValue(attr, p, ctx); if (v == null) none.push(p.pid); else (groups[v] = groups[v] || []).push(p.pid); });
        var keys = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'en', { numeric: true }); });
        if (attr === 'dal') keys.sort();
        var legend = keys.map(function (k, i) { return { value: k, color: PALETTE[i % PALETTE.length], count: groups[k].length, pids: groups[k].slice().sort() }; });
        if (none.length) legend.push({ value: null, color: NONE_COLOR, count: none.length, pids: none.slice().sort() });
        var byPid = {};
        legend.forEach(function (l) { var rgb = hexToRgb(l.color); l.pids.forEach(function (pid) { byPid[pid] = rgb; }); });
        return { attr: attr, byPid: byPid, legend: legend, reused: keys.length > PALETTE.length };
    }

    // ------------------------------------------------------------ revision compare
    // From the engine's diffRevision (cad_zonal.js): what each part of the two revisions is.
    // -> { status: { pid: 'added'|'removed'|'moved'|'resized'|'renamed'|'same' }, counts, lists }
    function compareStatus(oldEntry, newEntry, diff) {
        var st = {}, counts = { added: 0, removed: 0, moved: 0, resized: 0, renamed: 0, same: 0 };
        var E = root.SLCadZonal, P = function (e) { return e ? (E && E.partsOf ? E.partsOf(e) : (e.parts || [])) : []; };
        var oldP = {}; P(oldEntry).forEach(function (p) { oldP[p.pid] = p; });
        P(newEntry).forEach(function (p) { st[p.pid] = oldP[p.pid] ? 'same' : 'added'; });
        Object.keys(oldP).forEach(function (pid) { if (!(pid in st)) st[pid] = 'removed'; });
        if (diff) {
            (diff.renamed || []).forEach(function (r) { if (st[r.pid] === 'same') st[r.pid] = 'renamed'; });
            (diff.resized || []).forEach(function (r) { if (st[r.pid] !== 'added' && st[r.pid] !== 'removed') st[r.pid] = 'resized'; });
            (diff.moved || []).forEach(function (r) { if (st[r.pid] !== 'added' && st[r.pid] !== 'removed') st[r.pid] = 'moved'; });
        }
        var lists = { added: [], removed: [], moved: [], resized: [], renamed: [], same: [] };
        Object.keys(st).sort().forEach(function (pid) { counts[st[pid]]++; lists[st[pid]].push(pid); });
        return { status: st, counts: counts, lists: lists };
    }
    var COMPARE_COLORS = { added: [0.18, 0.62, 0.25], removed: [0.84, 0.15, 0.16], moved: [1.0, 0.5, 0.05], resized: [0.58, 0.40, 0.74], renamed: [0.09, 0.75, 0.81], same: [0.78, 0.80, 0.84] };

    // ------------------------------------------------------------ snapshots
    // Where each label lands on an image of w x h: project(point) -> {x,y,z} in normalized device
    // coordinates (the viewer passes the camera's projection). Labels behind the camera or off
    // the image are dropped. Pure, for the PNG export.
    function placeLabels(labels, project, w, h) {
        var out = [];
        (labels || []).forEach(function (l) {
            if (!l || !_num3(l.point)) return;
            var p = project(l.point); if (!p || !(p.z > -1 && p.z < 1)) return;
            var x = (p.x + 1) / 2 * w, y = (1 - p.y) / 2 * h;
            if (x < -50 || y < -50 || x > w + 50 || y > h + 50) return;
            out.push({ x: x, y: y, text: String(l.text || ''), color: l.color || '#14171c', kind: l.kind || 'label' });
        });
        return out;
    }

    var api = {
        VERSION: VERSION, PALETTE: PALETTE, NONE_COLOR: NONE_COLOR, ATTRS: ATTRS, KINDS: KINDS, COMPARE_COLORS: COMPARE_COLORS, MAX_PIDS: MAX_PIDS,
        views: views, saveView: saveView, renameView: renameView, removeView: removeView, getView: getView,
        markups: markups, addMarkup: addMarkup, setMarkupStatus: setMarkupStatus, removeMarkup: removeMarkup, markupPoint: markupPoint,
        systemDal: systemDal, attrValue: attrValue, colorBy: colorBy, hexToRgb: hexToRgb,
        compareStatus: compareStatus, placeLabels: placeLabels
    };
    root.SLCadReview = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

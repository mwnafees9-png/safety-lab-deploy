// ============================================================================
// cad_exact.js, v1.0: exact geometry on the CAD Model page (window.SLCadExact, 13 Oct 2026, cad-C).
//
// The page side of the B-rep session that lives in cad_import_worker.js (cad_brep.js on the full
// OpenCascade build). Measurements and PMI come from the TRUE geometry: OpenCascade's
// BRepExtrema_DistShapeShape, BRepGProp and BRepAdaptor on the STEP file's own faces and edges,
// not on the triangles drawn on screen. Every answer carries exact:true; anything worked out from
// the display mesh is labeled approximate by the viewer.
//
// Where the session comes from, in order:
//   1. the import that just ran with the full build hands over its worker (no second read);
//   2. the STEP file kept in this browser (IndexedDB 'sl-cad' / 'steps', key sha256);
//   3. otherwise the engineer is asked to open the STEP file (checked against the fingerprint).
// The file never leaves this computer. No eval, no network beyond our own worker files.
//
// API: attach(worker, entry), open(entry, { file, onProgress }) -> Promise, ready(cadId),
//      query(op, args) -> Promise, pick(pid, point, faceHint), distance(pidA, pidB),
//      properties(pid), interference(pidA, pidB), pmi(), state(), onState(cb), close().
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var S = { worker: null, cadId: null, sha: null, status: 'none', phase: null, frac: null, error: null, pids: null, seq: 0, wait: {}, listeners: [] };
    function _emit() { var st = state(); S.listeners.slice().forEach(function (cb) { try { cb(st); } catch (_) {} }); }
    function state() { return { status: S.status, cadId: S.cadId, phase: S.phase, frac: S.frac, error: S.error, parts: S.pids ? S.pids.length : 0 }; }
    function onState(cb) { S.listeners.push(cb); return function () { S.listeners = S.listeners.filter(function (x) { return x !== cb; }); }; }
    function _set(status, extra) { S.status = status; Object.assign(S, extra || {}); _emit(); }
    function _bind(w) {
        w.onmessage = function (ev) {
            var d = ev.data || {};
            if (d.type === 'progress') { S.phase = d.phase; S.frac = d.frac; _emit(); return; }
            if (d.type === 'answer') { var p = S.wait[d.id]; if (!p) return; delete S.wait[d.id]; if (d.error) p.reject(new Error(d.error)); else p.resolve(d.result); return; }
            if (d.type === 'session') { S.pids = d.pids; _set('ready', { phase: null, frac: null }); if (S._openResolve) { S._openResolve(true); S._openResolve = null; } return; }
            if (d.type === 'error') { _set('error', { error: d.message }); if (S._openReject) { var e = new Error(d.message); e.code = d.code; S._openReject(e); S._openReject = null; } }
        };
        w.onerror = function (ev) { _set('error', { error: (ev && ev.message) || 'The exact geometry worker stopped.' }); Object.keys(S.wait).forEach(function (k) { S.wait[k].reject(new Error('worker stopped')); }); S.wait = {}; };
    }
    function close() {
        if (S.worker) { try { S.worker.postMessage({ type: 'close' }); S.worker.terminate(); } catch (_) {} }
        Object.keys(S.wait).forEach(function (k) { S.wait[k].reject(new Error('closed')); });
        S.worker = null; S.wait = {}; S.pids = null; S.cadId = null; S.sha = null;
        _set('none', { phase: null, frac: null, error: null });
    }
    // An import worker that kept its session.
    function attach(worker, entry) {
        if (!worker || !entry) return false;
        if (S.worker && S.worker !== worker) close();
        S.worker = worker; S.cadId = entry.id; S.sha = entry.sha256;
        _bind(worker);
        var E = root.SLCadZonal, all = E && E.partsOf ? E.partsOf(entry) : (entry.parts || []);
        S.pids = all.map(function (p) { return p.pid; }); S.pidSet = new Set(S.pids);
        _set('ready', { phase: null, frac: null, error: null });
        return true;
    }
    function ready(cadId) { return S.status === 'ready' && (!cadId || S.cadId === cadId); }
    function _workerUrl() { var I = root.SLCadImport; return I ? I.workerUrl() : 'cad_import_worker.js'; }
    // Open the exact geometry for a model entry. opts.file: a File the engineer picked (checked
    // against the fingerprint). Without it, the copy kept in this browser.
    function open(entry, opts) {
        opts = opts || {};
        var I = root.SLCadImport;
        if (!entry) return Promise.reject(new Error('No CAD model.'));
        if (ready(entry.id)) return Promise.resolve(true);
        if (S.status === 'loading' && S.cadId === entry.id && S._openP) return S._openP;
        close();
        S.cadId = entry.id; S.sha = entry.sha256;
        _set('loading', { phase: 'file', frac: null, error: null });
        var src = opts.file ? Promise.resolve(opts.file) : (I && I.stepGet ? I.stepGet(entry.sha256).catch(function () { return null; }) : Promise.resolve(null));
        S._openP = src.then(function (blob) {
            if (!blob) { var e = new Error('The STEP file for ' + entry.fileName + ' is not kept on this computer. Open it to measure on the exact geometry.'); e.code = 'need-file'; throw e; }
            return blob.arrayBuffer ? blob.arrayBuffer() : blob;
        }).then(function (buf) {
            return new Promise(function (resolve, reject) {
                var w;
                try { w = new Worker(_workerUrl()); } catch (e0) { reject(new Error('The exact geometry reader could not start (' + ((e0 && e0.message) || e0) + ').')); return; }
                S.worker = w; _bind(w);
                S._openResolve = resolve; S._openReject = reject;
                w.postMessage({ type: 'open', buffer: buf, expectSha: entry.sha256 }, [buf]);
            });
        }).then(function (v) { S._openP = null; return v; }, function (e) {
            S._openP = null;
            _set(e && e.code === 'need-file' ? 'need-file' : 'error', { error: (e && e.message) || String(e) });
            if (S.worker) { try { S.worker.terminate(); } catch (_) {} S.worker = null; }
            throw e;
        });
        return S._openP;
    }
    function query(op, args) {
        if (S.status !== 'ready' || !S.worker) return Promise.reject(new Error('The exact geometry is not open.'));
        var id = ++S.seq;
        return new Promise(function (resolve, reject) { S.wait[id] = { resolve: resolve, reject: reject }; S.worker.postMessage({ type: 'query', id: id, op: op, args: args || [] }); });
    }
    function has(pid) { if (!S.pids) return false; if (!S.pidSet || S.pidSet.size !== S.pids.length) S.pidSet = new Set(S.pids); return S.pidSet.has(pid); }

    // ---- pure helpers shared with the viewer and the tests
    // Angle in degrees between two directions; lines and plane normals ignore their sense.
    function angleDeg(u, v, unsigned) {
        var lu = Math.hypot(u[0], u[1], u[2]), lv = Math.hypot(v[0], v[1], v[2]);
        if (!(lu > 0 && lv > 0)) return null;
        var c = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv);
        c = Math.max(-1, Math.min(1, c));
        var a = Math.acos(c) * 180 / Math.PI;
        return unsigned ? Math.min(a, 180 - a) : a;
    }
    // The direction a pick contributes to an angle: a straight edge's direction, a plane's
    // normal, a cylinder's or circle's axis.
    function directionOf(pick, prefer) {
        if (!pick) return null;
        var e = pick.edge, f = pick.face;
        if (prefer !== 'face' && e && e.type === 'line' && e.direction) return { dir: e.direction, what: 'edge', exact: true };
        if (f && f.type === 'plane' && f.normal) return { dir: f.normal, what: 'plane normal', exact: true };
        if (f && f.axis) return { dir: f.axis, what: f.type + ' axis', exact: true };
        if (e && e.axis) return { dir: e.axis, what: 'circle axis', exact: true };
        return null;
    }
    // A dimension as a drawing shows it. OpenCascade gives angles in degrees and the lower
    // tolerance as a size (the sign is the drawing's convention: minus).
    function fmtDim(item) {
        var v = item.value, s = '', ang = /Angular/i.test(item.type);
        var sym = /Diameter/i.test(item.type) ? '\u2300' : /Radius/i.test(item.type) ? 'R' : '';
        var n = function (x) { return ang ? x.toFixed(2) + '\u00b0' : x.toFixed(3); };
        if (typeof v === 'number') s = sym + n(v);
        if (typeof item.upperTol === 'number' && typeof item.lowerTol === 'number') {
            var u = Math.abs(item.upperTol), l = Math.abs(item.lowerTol);
            s += Math.abs(u - l) < 1e-12 ? ' \u00b1' + (ang ? u.toFixed(2) : u.toFixed(3)) : ' +' + (ang ? u.toFixed(2) : u.toFixed(3)) + ' / -' + (ang ? l.toFixed(2) : l.toFixed(3));
        }
        if (typeof item.upper === 'number' && typeof item.lower === 'number') s = sym + n(item.lower) + ' to ' + n(item.upper);
        if (item.fromModel) s = '[' + s + ']';   // no nominal in the file: the model's value, boxed like a basic dimension
        return s || item.type;
    }
    var TOL_SYMBOL = { Straightness: '⏤', Flatness: '⏥', Circularity: '○', Cylindricity: '⌭', ProfileOfLine: '⌒', ProfileOfSurface: '⌓', Angularity: '∠', Perpendicularity: '⟂', Parallelism: '∥', Position: '⌖', Concentricity: '◎', Coaxiality: '◎', Symmetry: '⌯', CircularRunout: '↗', TotalRunout: '⌰' };
    function fmtTol(item) {
        var sym = TOL_SYMBOL[item.type] || item.type;
        return sym + ' ' + (typeof item.value === 'number' ? item.value.toFixed(3) : '') + (item.datums && item.datums.length ? ' | ' + item.datums.join(' | ') : '');
    }
    function pmiText(item) { return item.kind === 'dimension' ? fmtDim(item) : item.kind === 'tolerance' ? fmtTol(item) : (item.name || 'Datum'); }

    function angleBetween(a, b) {
        var da = directionOf(a), db = directionOf(b);
        if (!da || !db) return null;
        return { degrees: angleDeg(da.dir, db.dir, true), a: da.what, b: db.what, exact: true };
    }
    // What a single exact pick says, in words (radius, length, plane).
    function describePick(pk) {
        if (!pk) return '';
        var e = pk.edge, f = pk.face, out = [];
        if (e && e.distance < 1e-6 + (pk.edgeTol || 0)) {
            if (e.type === 'circle') out.push((e.closed ? 'circle' : 'arc') + ' R ' + fmt(e.radius) + ', ⌀ ' + fmt(e.diameter) + (e.closed ? '' : ', arc length ' + fmt(e.length)));
            else out.push(e.type + ' edge, length ' + fmt(e.length));
        }
        if (f) {
            if (f.type === 'cylinder') out.push('cylinder R ' + fmt(f.radius) + ', ⌀ ' + fmt(2 * f.radius));
            else if (f.type === 'sphere') out.push('sphere R ' + fmt(f.radius));
            else if (f.type === 'cone') out.push('cone, half angle ' + f.semiAngleDeg.toFixed(3) + '°');
            else if (f.type === 'torus') out.push('torus R ' + fmt(f.majorRadius) + ' r ' + fmt(f.minorRadius));
            else out.push(f.type + ' face');
            if (f.area != null) out.push('area ' + fmtArea(f.area));
        }
        return out.join(' · ');
    }
    function fmt(v) { if (v == null || !isFinite(v)) return '-'; var a = Math.abs(v); return (a >= 1000 ? v.toFixed(1) : a >= 1 ? v.toFixed(3) : v.toFixed(4)) + ' mm'; }
    function fmtArea(v) { return (v >= 1e6 ? (v / 1e6).toFixed(4) + ' m²' : v.toFixed(2) + ' mm²'); }
    function fmtVol(v) { return (v >= 1e9 ? (v / 1e9).toFixed(5) + ' m³' : v >= 1e3 ? (v / 1e3).toFixed(3) + ' cm³' : v.toFixed(3) + ' mm³'); }

    var api = {
        VERSION: VERSION, attach: attach, open: open, ready: ready, query: query, has: has, close: close, state: state, onState: onState,
        pick: function (pid, point, faceHint) { return query('pick', [pid, point, { faceHint: faceHint }]); },
        distance: function (a, b) { return query('distance', [a, b]); },
        properties: function (pid) { return query('properties', [pid]); },
        interference: function (a, b) { return query('interference', [a, b]); },
        pmi: function () { return query('pmi', []); },
        angleBetween: angleBetween, describePick: describePick, fmt: fmt, fmtArea: fmtArea, fmtVol: fmtVol,
        angleDeg: angleDeg, directionOf: directionOf, fmtDim: fmtDim, fmtTol: fmtTol, pmiText: pmiText
    };
    root.SLCadExact = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

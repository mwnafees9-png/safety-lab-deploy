// ============================================================================
// cad_import_worker.js, v3.0: the Web Worker that reads a STEP file (13 to 14 Oct 2026).
//
// Runs off the page's main thread so a large aircraft never freezes the UI.
// The file bytes arrive from the page (transferred, never copied to a server),
// are fingerprinted (sha256), parsed and meshed by OpenCascade, and the geometry
// goes back to the page as transferable buffers. Nothing in this file talks to
// the network except the browser fetching our own vendor files.
//
// Two OpenCascade builds, both unmodified LGPL-2.1 libraries loaded as their own files:
//   * vendor/occt-fast (Safety Lab's own build of OCCT 7.8.1, tools/occt/build_occt.sh): the
//     reader. Small files are read whole (progress inside the read, each repeated part meshed
//     once, the document kept for EXACT measurement and AP242 PMI, cad_brep.js). Assemblies of
//     FAST_MIN components or more go through the JavaScript structure reader
//     (cad_step_struct.js): a box per part at once, each distinct part then read from its own
//     small file by a pool of workers (this same script), exact queries part by part.
//   * vendor/occt (occt-import-js 0.0.23): the fallback when our build cannot load.
//
// Messages in : { type:'import', buffer, expectSha, opts:{ reader:'auto'|'fast'|'occt', keepSession } }
//               { type:'open', buffer, expectSha }      exact session from a local STEP file
//               { type:'query', id, op, args }          exact query on the open session
//               { type:'close' }
//               { type:'pool-init' | 'part' }           a part reader of the pool
//               { type:'clash-init' | 'clash-pairs' }   the clash narrow phase
// Messages out: { type:'progress', phase, frac } ... then
//               { type:'result', sha256, model, session:bool, streaming? } or { type:'error', code, message }
//               { type:'detail', protos } ... { type:'detail-done' } (large assemblies)
//               { type:'session', pids, stats } (after 'open')
//               { type:'answer', id, result } / { type:'answer', id, error }
// ============================================================================
/* global importScripts, SLCadImport, SLCadBrep */
'use strict';
var _q = self.location && self.location.search ? self.location.search : '';
importScripts('cad_import.js' + _q, 'cad_brep.js' + _q, 'cad_step_struct.js' + _q);

var _occtReady = null, _session = null, _stream = null;
// Assemblies with at least this many components open through the JavaScript structure reader:
// a box per part at once, then each distinct part read on its own and streamed in.
var FAST_MIN = 300, SPLIT_MIN_BYTES = 20e6, PART_CAP_MS = 300000, _importOpts = {};   // a body still being read after PART_CAP_MS: its reader is replaced and the body listed as not meshed   // below 300 components: split one part by body only for a big file
function progress(phase, frac) { self.postMessage({ type: 'progress', phase: phase, frac: frac == null ? null : frac }); }
function occt() {
    if (!_occtReady) {
        importScripts(SLCadImport.OCCT_DIR + 'occt-import-js.js');
        _occtReady = self.occtimportjs({ locateFile: function (p) { return SLCadImport.OCCT_DIR + p; } });
    }
    return _occtReady;
}
// Our own files only. From file:// (the desktop app) fetch is refused, so a synchronous request
// reads them, as the Emscripten glue does there.
function getBytes(url, onBytes) {
    if (self.location && self.location.protocol === 'file:') {
        return new Promise(function (resolve, reject) {
            try { var x = new XMLHttpRequest(); x.open('GET', url, false); x.responseType = 'arraybuffer'; x.send(null); if (x.response && x.response.byteLength) { if (onBytes) onBytes(x.response.byteLength); resolve(x.response); } else reject(new Error('Could not read ' + url)); } catch (e) { reject(e); }
        });
    }
    return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('Could not load ' + url + ' (' + r.status + ')');
        if (!r.body || !r.body.getReader || !onBytes) return r.arrayBuffer().then(function (b) { if (onBytes) onBytes(b.byteLength); return b; });
        var rd = r.body.getReader(), chunks = [], n = 0;
        return (function pump() { return rd.read().then(function (s) { if (s.done) { var out = new Uint8Array(n), o = 0; chunks.forEach(function (c) { out.set(c, o); o += c.length; }); return out.buffer; } chunks.push(s.value); n += s.value.length; onBytes(s.value.length); return pump(); }); })();
    });
}
function closeSession() { if (_session) { try { _session.close(); } catch (_) {} _session = null; } }
function transferOf(model) {
    var t = [];
    (model.protos || []).forEach(function (p) { t.push(p.position.buffer, p.index.buffer); if (p.normal) t.push(p.normal.buffer); });
    (model.meshes || []).forEach(function (m) { if (m.matrix) t.push(m.matrix.buffer); });
    return t;
}
function hashThen(bytes, expectSha, fn) {
    progress('hash', 0);
    return SLCadImport.sha256Hex(bytes).then(function (sha) {
        if (expectSha && expectSha !== sha) {
            self.postMessage({ type: 'error', code: 'mismatch', message: 'This file is not the one the model was imported from (fingerprints differ).' });
            return null;
        }
        return fn(sha);
    });
}
function viaOcct(bytes, d) {
    progress('load', 0);
    return occt().then(function (oc) {
        var opts = Object.assign({}, d.opts || {}, { onProgress: progress });
        return SLCadImport.convertStep(bytes, oc, opts);
    });
}
// small and medium files: the whole file on our own build (vendor/occt-fast)
function viaFast(bytes, d, keep) {
    return fastInstance().then(function (M) {
        var opts = Object.assign({}, d.opts || {}, { onProgress: progress, keep: keep });
        var r = SLCadBrep.convertFast(M, bytes, opts);
        if (keep) { closeSession(); _session = r.session; }
        return r.model;
    });
}

// ---- large assemblies: structure first, boxes at once, detail streamed behind
function viaStructure(bytes) {
    var S = self.SLCadStep;
    if (!S) return null;
    progress('structure', 0);
    var t0 = Date.now(), ix, st;
    try { ix = S.index(bytes, function (f) { progress('structure', 0.6 * f); }); st = S.structure(ix); }
    catch (e) { return null; }
    if (st.unsupported) return null;
    // a few components but one part holding many bodies (the NASA CRM: one product, 35 bodies,
    // 265 MB): read body by body instead of the whole file in one OpenCascade call (out of memory)
    var split = null;
    if (st.components < FAST_MIN) {
        if (bytes.length < (_importOpts.splitMinBytes != null ? _importOpts.splitMinBytes : SPLIT_MIN_BYTES) || !S.bodies) return null;
        var lvs = []; S.occurrences(st, function (o) { if (lvs.indexOf(o.leaf) < 0) lvs.push(o.leaf); });
        // split only a part whose bodies are the solids the structure reader lists (a surface model of many shells, like the
        // CRM wing-body file, is not split: its shells are not solids, so it would stay a box; it goes to the whole-file read)
        split = {}; lvs.forEach(function (pd) { var B = S.bodies(ix, st, pd); if (!B || B.bodies.length < 2) return; var sol = S.leafInfo(ix, st, pd).solids.map(function (x) { return x.id; }); if (sol.length === B.bodies.length && B.bodies.every(function (b) { return sol.indexOf(b) >= 0; })) split[pd] = B; });
        if (!Object.keys(split).length) return null;
    }
    progress('structure', 0.7);
    var res = S.boxRes(ix, st);
    if (split) res.leaves.forEach(function (L) { var B = split[L.pd]; if (!B) return; L.split = B;
        // a box per body from its own points, so the first view shows each body where it is
        L.info.solids.forEach(function (sd, i) { var k = B.bodies.indexOf(sd.id); if (k < 0 || i >= L.protos.length) return; var bx = S.boxOfIds(ix, B.desc[k], st.fileMm); if (bx) res.protos[L.protos[i]] = S.boxGeometry(bx); }); });
    var pidx = {};
    Object.keys(st.products).forEach(function (k) { var p = st.products[k]; if (p && p.name && p.id && !pidx[p.name]) pidx[p.name] = p.id; });
    var model = SLCadImport.buildModel(res, { productIndex: pidx, maxTrianglesTotal: 0 });
    model.schema = SLCadImport.stepSchema(SLCadImport.bytesToText(bytes.subarray(0, 4000)));
    model.sourceUnit = st.fileMm === 25.4 ? 'inch' : st.fileMm === 1 ? 'mm' : st.fileMm === 1000 ? 'm' : String(st.fileMm) + ' mm';
    model.units = 'mm'; model.reader = 'structure';
    model.streaming = { leaves: res.leaves.length, done: 0, components: st.components };
    model.stats.readMs = { structure: Date.now() - t0 };
    // the order detail is read in: the parts that fill the most of the view first (box size
    // times copies), so the aircraft sharpens from the big structure down to the fasteners
    var copies = res.leaves.map(function () { return 0; });
    res.meshes.forEach(function (m) { copies[m.leaf]++; });
    var order = res.leaves.map(function (L, k) { return { L: L, k: k }; }).filter(function (o) { return !o.L.done; }).map(function (o) { var L = o.L, k = o.k, b = L.info.box, d = b ? Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) : 0; return { k: k, w: d * d * copies[k] }; })
        .sort(function (a, b) { return b.w - a.w || a.k - b.k; }).map(function (o) { return o.k; });
    model.streaming.leaves = order.length; model.streaming.tessellated = res.leaves.length - order.length;
    var leaves = res.leaves.map(function (L) { return { pd: L.pd, protos: L.protos }; });
    if (split) {   // one work item per body, smallest first so most of the aircraft shows early
        var items = []; res.leaves.forEach(function (L, li) { if (!L.split) { items.push({ k: li }); return; } L.info.solids.forEach(function (sd, i) { var k = L.split.bodies.indexOf(sd.id); if (k >= 0 && i < L.protos.length) items.push({ pd: L.pd, protos: [L.protos[i]], B: L.split, body: k, size: L.split.desc[k].length, name: (sd.name || 'body') + ' ' + (i + 1) }); }); });
        items.sort(function (a, b) { return (a.size || 0) - (b.size || 0); });
        leaves = items.map(function (it) { return it.B ? it : leaves[it.k]; }); order = leaves.map(function (_, i) { return i; });
        model.streaming.leaves = order.length; model.streaming.bodies = order.length; model.reader = 'structure-bodies';
    }
    _stream = { ix: ix, st: st, res: res, leaves: leaves, order: order, next: 0, stopped: false };
    return model;
}
function isIdent(m) { for (var i = 0; i < 16; i++) if (Math.abs(m[i] - ((i % 5) === 0 ? 1 : 0)) > 1e-12) return false; return true; }

// ---- Safety Lab's own OpenCascade build (vendor/occt-fast: unmodified OCCT 7.8.1, LGPL-2.1,
// native wasm exceptions, 10 MB): reads one part's file and meshes it, about 3 times faster than
// the general build and ready in milliseconds. tools/occt/build_occt.sh rebuilds it.
var FAST_DIR = 'vendor/occt-fast/';
var _fastModule = null, _fastReady = null;
function fastModule() {
    if (_fastReady) return _fastReady;
    _fastReady = getBytes(FAST_DIR + 'slcad_occt.wasm').then(function (b) { return WebAssembly.compile(b); }).then(function (mod) { _fastModule = mod; return mod; });
    _fastReady.catch(function () { _fastReady = null; });
    return _fastReady;
}
function startFast(mod) {
    if (!self.slcadOcct) importScripts(FAST_DIR + 'slcad_occt.js');
    return self.slcadOcct({ print: function () {}, printErr: function () {}, instantiateWasm: function (imports, ok) { WebAssembly.instantiate(mod, imports).then(function (inst) { ok(inst, mod); }).catch(function () { self.postMessage({ type: 'part-done', k: -1, geo: null }); }); return {}; } });
}
// one part's STEP bytes -> [{ position, index, faces, name }] per solid, in the part's frame
function fastPartGeometry(M, u8) {
    var p = M._malloc(u8.length); M.HEAPU8.set(u8, p);
    var lp = M._malloc(4), out = M._sl_read(p, u8.length, 0.001, 0.5, lp), len = M.HEAP32[lp >> 2];
    M._free(p); M._free(lp);
    if (!out || !len) return null;
    var buf = M.HEAPU8.slice(out, out + len).buffer; M._sl_free(out);
    var dv = new DataView(buf), jl = dv.getUint32(0, true);
    var meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
    var o = 4 + jl; o += (4 - o % 4) % 4;
    var protos = meta.protos.map(function (q) {
        var pos = new Float32Array(buf, o, q.v * 3); o += q.v * 12;
        var idx = new Uint32Array(buf, o, q.t * 3); o += q.t * 12;
        var fr = new Int32Array(buf, o, q.f * 2); o += q.f * 8;
        var faces = []; for (var i = 0; i < q.f; i++) faces.push({ first: fr[i * 2], last: fr[i * 2 + 1] });
        return { position: pos, index: idx, faces: faces };
    });
    return meta.meshes.map(function (m) {
        var g = protos[m.proto], M4 = m.matrix, pos = new Float32Array(g.position);
        if (M4 && !isIdent(M4)) for (var j = 0; j < pos.length; j += 3) { var x = pos[j], y = pos[j + 1], z = pos[j + 2]; pos[j] = M4[0] * x + M4[4] * y + M4[8] * z + M4[12]; pos[j + 1] = M4[1] * x + M4[5] * y + M4[9] * z + M4[13]; pos[j + 2] = M4[2] * x + M4[6] * y + M4[10] * z + M4[14]; }
        return { position: pos, index: new Uint32Array(g.index), faces: g.faces, name: m.name };
    });
}

// The exact session of a large assembly: the structure is read in JavaScript, and each part a
// query names is read from its own small file (SLCadBrep.PartSession).
var _fastInst = null;
function fastInstance() {
    if (!_fastInst) { _fastInst = fastModule().then(function (mod) { return startFast(mod); }); _fastInst.catch(function () { _fastInst = null; }); }
    return _fastInst;
}
// the exact engine for part-by-part sessions: our own build, the general one if it cannot load
function partEngine() {
    return fastInstance().then(function (M) { return { fast: M }; });
}
function makePartSession(eng, pids, where) {
    return new SLCadBrep.FastPartSession(eng.fast, pids, where);
}
function streamPartSession(eng) {
    var S = self.SLCadStep, T = _stream, res = T.res, pids = new Array(res.meshes.length), at = {}, minis = {};
    SLCadImport.walkParts(res, function (mi, w) { pids[mi] = w.pid; at[w.pid] = mi; });
    var ps = makePartSession(eng, pids, function (pid) {
        var mi = at[pid]; if (mi == null) return null;
        var m = res.meshes[mi], L = res.leaves[m.leaf];
        if (L.split) {   // a part read body by body: only this body's own file is opened, never the whole part (kept in memory per body)
            var sd = L.info.solids[m.solid], k = sd ? L.split.bodies.indexOf(sd.id) : -1;
            if (k >= 0) { var key = m.leaf + ':' + k; return { key: key, mini: minis[key] || (minis[key] = S.extractBody(T.ix, L.split, k)), solid: 0, matrix: m.matrix }; }
        }
        var mini = minis[m.leaf] || (minis[m.leaf] = S.extract(T.ix, T.st, L.pd));
        return { key: m.leaf, mini: mini, solid: m.solid, matrix: m.matrix };
    });
    ps.setFileUnit(T.st.fileMm === 25.4 ? 'inch' : 'mm');
    return withMeshFallback(ps, function (pid) {
        var mi = at[pid]; if (mi == null) return null;
        var m = res.meshes[mi], L = res.leaves[m.leaf];
        return L.done ? { geo: res.protos[L.protos[m.solid] != null ? L.protos[m.solid] : L.protos[0]], matrix: m.matrix } : null;
    });
}
// Parts that carry only triangles (AP242 tessellation, no B-rep) are measured on those
// triangles, and every answer says so (exact: false, approximate: true).
function withMeshFallback(ps, meshOf) {
    var R = function () { if (!self.SLCadRender) importScripts('cad_render.js' + _q); return self.SLCadRender; };
    function xf(M, x, y, z) { return [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]; }
    function meshProps(pid, t) {
        var P = t.geo.position, I = t.geo.index, M = t.matrix || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        var vol = 0, area = 0, cx = 0, cy = 0, cz = 0, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        for (var k = 0; k < I.length; k += 3) {
            var a = xf(M, P[I[k] * 3], P[I[k] * 3 + 1], P[I[k] * 3 + 2]), b = xf(M, P[I[k + 1] * 3], P[I[k + 1] * 3 + 1], P[I[k + 1] * 3 + 2]), c = xf(M, P[I[k + 2] * 3], P[I[k + 2] * 3 + 1], P[I[k + 2] * 3 + 2]);
            var v = (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
            vol += v; cx += v * (a[0] + b[0] + c[0]) / 4; cy += v * (a[1] + b[1] + c[1]) / 4; cz += v * (a[2] + b[2] + c[2]) / 4;
            var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
            area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
            [a, b, c].forEach(function (q) { for (var j = 0; j < 3; j++) { if (q[j] < mn[j]) mn[j] = q[j]; if (q[j] > mx[j]) mx[j] = q[j]; } });
        }
        var out = { pid: pid, kind: 'mesh', exact: false, approximate: true, area: area, bbox: { min: mn, max: mx }, note: 'This part has no exact geometry in the file (triangles only): measured on its triangles.' };
        if (Math.abs(vol) > 0) { out.volume = Math.abs(vol); out.centerOfVolume = [cx / vol, cy / vol, cz / vol]; }
        return out;
    }
    function meshOfPid(pid) { var t = meshOf(pid); if (!t) return null; var Rr = R(); t.bvh = t.bvh || new Rr.Bvh(t.geo.position, t.geo.index); return { bvh: t.bvh, matrix: t.matrix }; }
    var base = { properties: ps.properties, distance: ps.distance, pick: ps.pick, faceInfo: ps.faceInfo, edgeInfo: ps.edgeInfo, interference: ps.interference };
    ps.properties = function (pid) { var t = meshOf(pid); return t ? meshProps(pid, t) : base.properties.call(ps, pid); };
    ps.distance = function (a, b) {
        if (!meshOf(a) && !meshOf(b)) return base.distance.call(ps, a, b);
        var ma = meshOfPid(a), mb = meshOfPid(b);
        if (!ma || !mb) throw new Error('One part has exact geometry and the other only triangles: measure them on the display meshes.');
        var r = R().fastMeshDistance(ma, mb, null);
        return { distance: r.d, a: r.a, b: r.b, exact: false, approximate: true, pidA: a, pidB: b };
    };
    ['pick', 'faceInfo', 'edgeInfo', 'interference'].forEach(function (k) {
        ps[k] = function (pid) { if (meshOf(pid) || (k === 'interference' && meshOf(arguments[1]))) throw new Error('This part has no exact geometry in the file (triangles only): measured on the display mesh.'); return base[k].apply(ps, arguments); };
    });
    return ps;
}
function partSessionFor(eng, bytes) {
    var S = self.SLCadStep; if (!S) return null;
    var ix, st;
    try { ix = S.index(bytes); st = S.structure(ix); } catch (e) { return null; }
    if (st.unsupported || st.components < FAST_MIN) return null;
    var res = S.boxRes(ix, st), pids = new Array(res.meshes.length), at = {};
    SLCadImport.walkParts(res, function (mi, w) { pids[mi] = w.pid; at[w.pid] = mi; });
    var minis = {};
    var ps = makePartSession(eng, pids, function (pid) {
        var mi = at[pid]; if (mi == null) return null;
        var m = res.meshes[mi], L = res.leaves[m.leaf];
        var mini = minis[m.leaf] || (minis[m.leaf] = S.extract(ix, st, L.pd));
        return { key: m.leaf, mini: mini, solid: m.solid, matrix: m.matrix };
    });
    ps.setFileUnit(st.fileMm === 25.4 ? 'inch' : 'mm');
    return ps;
}

// ---- the part reader pool: one OpenCascade per worker, as many workers as the computer has
// cores (at most 8, and fewer on a computer with little memory), each reading whole parts.
var POOL_MAX = 8;
function poolSize() {
    var hc = (self.navigator && self.navigator.hardwareConcurrency) || 2;
    var mem = self.navigator && self.navigator.deviceMemory;   // GB, when the browser says
    var n = Math.max(1, Math.min(POOL_MAX, hc));
    if (mem && mem <= 4) n = Math.min(n, 2);
    return n;
}
function makePool(n) {
    if (typeof Worker === 'undefined' || !_fastModule) return null;
    var url = (self.location && self.location.href) || 'cad_import_worker.js';
    var ws = [], i;
    try { for (i = 0; i < n; i++) { var w = new Worker(url); w.postMessage({ type: 'pool-init', fast: _fastModule }); ws.push({ w: w, busy: 0 }); } }
    catch (e) { ws.forEach(function (x) { try { x.w.terminate(); } catch (_) {} }); return null; }
    return ws;
}
function streamDetailPool(pool) {
    var S = _stream; if (!S) return;
    var inflight = 0, batch = [], transfer = [], lastPost = Date.now(), done = 0;
    function flush(force) {
        if (!batch.length) return;
        if (!force && Date.now() - lastPost < 150) return;
        self.postMessage({ type: 'detail', protos: batch, done: done, total: S.order.length }, transfer);
        batch = []; transfer = []; lastPost = Date.now();
    }
    var cap = _importOpts.partCapMs || PART_CAP_MS, url = (self.location && self.location.href) || 'cad_import_worker.js';
    var watch = setInterval(function () {
        pool.forEach(function (x) {
            var ks = Object.keys(x.jobs || {}); if (!ks.some(function (k) { return Date.now() - x.jobs[k] > cap; })) return;
            try { x.w.terminate(); } catch (_) {}
            ks.forEach(function (k) { k = +k; var L = S.leaves[k], over = Date.now() - x.jobs[k] > cap; inflight--;
                if (over) { done++; self.postMessage({ type: 'detail-failed', protos: L.protos, name: L.name || L.pd, reason: 'still being read after ' + Math.round(cap / 1000) + ' s (the reader was stopped)', capped: true }); }
                else S.order.push(k); });   // a body queued behind it is read again by the new reader
            x.jobs = {}; x.busy = 0; x.w = new Worker(url); x.w.postMessage({ type: 'pool-init', fast: _fastModule }); attach(x); feed(x);
            if (!inflight && S.next >= S.order.length) finish();
        });
    }, Math.min(5000, cap / 4));
    function finish() {
        clearInterval(watch);
        flush(true); pool.forEach(function (x) { try { x.w.terminate(); } catch (_) {} });
        self.postMessage({ type: 'detail-done', total: S.order.length, workers: pool.length });
        // the exact geometry engine loads now, while nobody waits, so the first measurement is quick
        setTimeout(function () { fastInstance().catch(function () {}); }, 0);
    }
    function feed(x) {
        while (x.busy < 2 && S.next < S.order.length && !S.stopped) {
            var k = S.order[S.next++], L = S.leaves[k];
            var mini = L.B ? self.SLCadStep.extractBody(S.ix, L.B, L.body) : self.SLCadStep.extract(S.ix, S.st, L.pd);
            if (L.B && _importOpts.testFailBody === L.body) mini = new TextEncoder().encode('ISO-10303-21;\nnot a step file (test)\n');   // test hook: a body that cannot be read
            x.busy++; inflight++; x.jobs = x.jobs || {}; x.jobs[k] = Date.now();
            x.w.postMessage({ type: 'part', k: k, bytes: mini }, [mini.buffer]);
        }
    }
    function attach(x) {
        x.w.onmessage = function (ev) {
            var d = ev.data || {};
            if (d.type !== 'part-done') return;
            if (d.k < 0) { x.busy = 99; return; }   // this reader could not start: it gets no more parts
            x.busy--; inflight--; done++; if (x.jobs) delete x.jobs[d.k];
            var L = S.leaves[d.k];
            if (!d.geo || !d.geo.length) self.postMessage({ type: 'detail-failed', protos: L.protos, name: L.name || L.pd, reason: d.err || 'OpenCascade returned no shape' });
            (d.geo || []).forEach(function (g, i) { if (i < L.protos.length) { batch.push({ proto: L.protos[i], position: g.position, index: g.index, faces: g.faces }); transfer.push(g.position.buffer, g.index.buffer); } });
            flush(false);
            if (S.stopped) { if (!inflight) finish(); return; }
            feed(x);
            if (!inflight && S.next >= S.order.length) finish();
        };
        x.w.onerror = function () { x.busy = 99; };
    }
    pool.forEach(attach);
    pool.forEach(feed);
}
function streamDetail() {
    if (!_stream || _stream.stopped) return;
    if (!_stream.order.length) { self.postMessage({ type: 'detail-done', total: 0, workers: 0 }); return; }   // every part carried its own triangles
    if (!_stream.triedFast) {
        _stream.triedFast = true;
        fastModule().then(function () {
            var pool = makePool(poolSize());
            if (pool && _stream) { _stream.pool = pool; streamDetailPool(pool); return; }
            streamDetail();
        }, function (e) { self.postMessage({ type: 'detail-error', message: 'OpenCascade could not start: ' + ((e && e.message) || e) }); });
        return;
    }
    // no part reader pool here (no nested workers): read the parts in this worker, a slice at a time
    fastInstance().then(function (M) {
        var S = _stream; if (!S || S.stopped) return;
        var t0 = Date.now(), batch = [], transfer = [];
        while (S.next < S.order.length && Date.now() - t0 < 120) {
            var k = S.order[S.next++], L = S.leaves[k], geo;
            try { geo = fastPartGeometry(M, L.B ? self.SLCadStep.extractBody(S.ix, L.B, L.body) : self.SLCadStep.extract(S.ix, S.st, L.pd)); } catch (e) { geo = null; }
            if (!geo) { self.postMessage({ type: 'detail-failed', protos: L.protos, name: L.name || L.pd, reason: 'OpenCascade returned no shape' }); continue; }
            for (var i = 0; i < L.protos.length && i < geo.length; i++) { batch.push({ proto: L.protos[i], position: geo[i].position, index: geo[i].index, faces: geo[i].faces }); transfer.push(geo[i].position.buffer, geo[i].index.buffer); }
        }
        if (batch.length) self.postMessage({ type: 'detail', protos: batch, done: S.next, total: S.order.length }, transfer);
        if (S.next < S.order.length) setTimeout(streamDetail, 0);
        else self.postMessage({ type: 'detail-done', total: S.order.length });
    }).catch(function (e) { self.postMessage({ type: 'detail-error', message: (e && e.message) || String(e), stack: e && e.stack }); });
}

var _partOc = null;
function partReader(d) {
    if (d.type === 'pool-init') { _partOc = startFast(d.fast); return true; }
    if (d.type === 'part') {
        _partOc.then(function (oc) {
            var geo = null;
            try { geo = fastPartGeometry(oc, d.bytes); } catch (e) { geo = null; }
            var t = []; (geo || []).forEach(function (g) { t.push(g.position.buffer, g.index.buffer); });
            self.postMessage({ type: 'part-done', k: d.k, geo: geo }, t);
        }).catch(function () { self.postMessage({ type: 'part-done', k: d.k, geo: null }); });
        return true;
    }
    return false;
}
var _clash = null;
self.onmessage = function (ev) {
    var d = ev.data || {};
    if (partReader(d)) return;
    // full-aircraft clash: this worker runs the narrow phase on batches of pairs
    if (d.type === 'clash-init' || d.type === 'clash-pairs') {
        if (!self.SLCadRender) importScripts('cad_render.js' + _q);
        _clash = _clash || {};
        self.SLCadRender.clashWorkerMessage(_clash, d, function (m) { self.postMessage(m); });
        return;
    }
    if (d.type === 'import') {
        var bytes = new Uint8Array(d.buffer), o = d.opts || {}, reader = o.reader || 'auto'; _importOpts = o;
        hashThen(bytes, d.expectSha, function (sha) {
            var fast = (reader === 'auto' || reader === 'structure') ? viaStructure(bytes) : null;
            if (fast) {
                progress('done', 1);
                // 200,000 parts travel as a few flat arrays: one transferable per part would cost
                // the browser minutes
                var packed = SLCadImport.packMeshes(fast.meshes), pp = SLCadImport.packParts(fast.parts, fast.meshes);
                var slim = Object.assign({}, fast, { meshes: null, parts: null, packed: packed, partsPacked: pp });
                var tl = [];
                [packed, pp].forEach(function (o) { Object.keys(o).forEach(function (k) { var v = o[k]; if (v && v.buffer instanceof ArrayBuffer && tl.indexOf(v.buffer) < 0) tl.push(v.buffer); }); });
                (fast.protos || []).forEach(function (p) { tl.push(p.position.buffer, p.index.buffer); });
                self.postMessage({ type: 'result', sha256: sha, model: slim, session: false, streaming: true }, tl);
                if (o.detail !== false) streamDetail();
                return;
            }
            var p = reader === 'occt' ? viaOcct(bytes, d)
                : viaFast(bytes, d, !!o.keepSession).catch(function (e) {
                    if (reader === 'fast') throw e;
                    progress('fallback', null);   // the full build could not load or read it: the smaller reader
                    return viaOcct(bytes, d).then(function (m) { m.fallbackReason = (e && e.message) || String(e); return m; });
                });
            return p.then(function (model) {
                progress('done', 1);
                var kept = !!_session && model.reader === 'occt-fast' && !!o.keepSession;
                self.postMessage({ type: 'result', sha256: sha, model: model, session: kept }, transferOf(model));
            });
        }).catch(function (e) {
            self.postMessage({ type: 'error', code: 'failed', message: (e && e.message) || String(e) });
        });
        return;
    }
    if (d.type === 'open') {
        var b2 = new Uint8Array(d.buffer);
        hashThen(b2, d.expectSha, function () {
            return partEngine().then(function (eng) {
                closeSession();
                // a large assembly: exact shapes part by part, from each part's own file
                var lazy = partSessionFor(eng, b2);
                if (lazy) { _session = lazy; progress('done', 1); self.postMessage({ type: 'session', pids: lazy.pids(), stats: { partByPart: true, engine: 'occt-fast' } }); return; }
                var fsn = SLCadBrep.openSessionFast(eng.fast, b2); _session = fsn; progress('done', 1);
                self.postMessage({ type: 'session', pids: fsn.pids(), stats: { engine: 'occt-fast' } });
            });
        }).catch(function (e) { self.postMessage({ type: 'error', code: 'failed', message: (e && e.message) || String(e) }); });
        return;
    }
    if (d.type === 'query' && !_session && _stream && _stream.res) {
        // the import that read this model's structure answers exact queries itself: each part's
        // shape is read from its own file when a query names it (no second read of the STEP file)
        partEngine().then(function (eng) {
            if (!_session) _session = streamPartSession(eng);
            self.onmessage(ev);
        }, function (e) { self.postMessage({ type: 'answer', id: d.id, error: (e && e.message) || String(e) }); });
        return;
    }
    if (d.type === 'query') {
        var out;
        try {
            if (!_session) throw new Error('No exact geometry is open.');
            var fn = _session[d.op];
            if (typeof fn !== 'function' || d.op.charAt(0) === '_' || d.op === 'close') throw new Error('Unknown query ' + d.op);
            out = { type: 'answer', id: d.id, result: fn.apply(_session, d.args || []) };
        } catch (e) { out = { type: 'answer', id: d.id, error: (e && e.message) || String(e) }; }
        self.postMessage(out);
        return;
    }
    if (d.type === 'retry' && _stream) {   // read a body or part again (it could not be meshed or was stopped by the time cap)
        var S0 = _stream, L0 = S0.leaves.filter(function (L) { return L.protos && d.protos && L.protos[0] === d.protos[0]; })[0];
        if (!L0) { self.postMessage({ type: 'detail-failed', protos: d.protos, name: '', reason: 'not found for retry' }); return; }
        fastInstance().then(function (M) {
            var geo = null; try { geo = fastPartGeometry(M, L0.B ? self.SLCadStep.extractBody(S0.ix, L0.B, L0.body) : self.SLCadStep.extract(S0.ix, S0.st, L0.pd)); } catch (e) { geo = null; }
            if (!geo || !geo.length) { self.postMessage({ type: 'detail-failed', protos: L0.protos, name: L0.name || L0.pd, reason: 'OpenCascade returned no shape (retry)' }); return; }
            var b = [], t = []; geo.forEach(function (g, i) { if (i < L0.protos.length) { b.push({ proto: L0.protos[i], position: g.position, index: g.index, faces: g.faces }); t.push(g.position.buffer, g.index.buffer); } });
            self.postMessage({ type: 'detail', protos: b, retry: true }, t);
        }).catch(function (e) { self.postMessage({ type: 'detail-failed', protos: L0.protos, name: L0.name || L0.pd, reason: 'OpenCascade could not start for the retry: ' + ((e && e.message) || String(e)) }); });
        return;
    }
    if (d.type === 'close') { closeSession(); if (_stream) _stream.stopped = true; }
};

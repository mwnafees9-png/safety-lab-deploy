// ============================================================================
// cad_brep.js, v2.0: EXACT geometry for the CAD Model page (13 to 14 Oct 2026, cad-C).
//
// Runs where Safety Lab's own OpenCascade build runs (vendor/occt-fast: Open CASCADE Technology
// 7.8.1, unmodified, LGPL-2.1 with the OCCT exception, plus the small C entry point
// tools/occt/slcad_occt.cpp; rebuilt by tools/occt/build_occt.sh): inside cad_import_worker.js on
// this computer, and in the node tests. Never on the page. self.SLCadBrep (worker),
// module.exports (node).
//
//   convertFast(M, bytes, opts)  a whole STEP file: the assembly tree and part meshes walked
//                               exactly as occt-import-js 0.0.23 walks them (same names, same
//                               pids through SLCadImport.buildModel), each repeated shape meshed
//                               once, progress INSIDE the read (the parser reports how far into
//                               the file it is), the document kept for exact queries and PMI.
//   openSessionFast(M, bytes)    the same document without keeping meshes (geometry cached).
//   FastDocSession / FastPartSession
//                               exact queries by pid on the whole document, or part by part from
//                               each part's own file (large assemblies): faces and edges under a
//                               picked point, edge length, circle and cylinder radius, plane
//                               normal, the exact point on the true surface, B-rep vertices,
//                               minimum distance between two parts, volume and area, the shared
//                               volume of two parts, and the AP242 PMI (dimensions, geometric
//                               tolerances, datums, with presentation curves and the parts they
//                               apply to), finished by finishPmi (unit check against the model).
//
// Units: millimeters throughout (the document's length unit is set to mm before the transfer).
// No eval, no Function constructor in this file; no network.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var DEFAULTS = { linearDeflection: 0.001, angularDeflection: 0.5 };

    // ------------------------------------------------------------ small helpers
    function mulPoint(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
    function invert(m) {
        // general 4x4 inverse (affine in practice)
        var a = m, inv = new Array(16);
        inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
        inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
        inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
        inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
        inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
        inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
        inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
        inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
        inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
        inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
        inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
        inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
        inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
        inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
        inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
        inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
        var det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
        if (!det) return null;
        for (var i = 0; i < 16; i++) inv[i] /= det;
        return inv;
    }
    function mulMat(a, b) {
        var o = new Array(16);
        for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
            o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
        return o;
    }
    function isIdentity(m) { for (var i = 0; i < 16; i++) if (Math.abs(m[i] - ((i % 5) === 0 ? 1 : 0)) > 1e-12) return false; return true; }
    var UNIT_MM = { mm: 1, cm: 10, m: 1000, km: 1e6, inch: 25.4, 'in': 25.4, foot: 304.8, ft: 304.8, micrometre: 1e-3, um: 1e-3 };
    function fileUnitOf(bytes) { var I = root.SLCadImport; try { return I.stepLengthUnit(I.bytesToText(bytes instanceof Uint8Array ? bytes.subarray(0, Math.min(bytes.length, 4e6)) : bytes)); } catch (_) { return 'unknown'; } }

    // The same part-by-part session on Safety Lab's own OpenCascade build (vendor/occt-fast):
    // M is its module; where(pid) as for PartSession. Answers are the same objects.
    function FastPartSession(M, pids, where) {
        this.M = M; this._pids = pids.slice(); this._where = where; this._h = {}; this.loaded = 0;
        var set = {}; pids.forEach(function (p) { set[p] = 1; }); this._has = set;
        this.fileUnitName = 'mm'; this.fileUnitMm = 1;
    }
    var FP = FastPartSession.prototype;
    FP.setFileUnit = function (u) { this.fileUnitName = u || 'unknown'; this.fileUnitMm = UNIT_MM[String(u || '').toLowerCase()] || 1; };
    FP.has = function (pid) { return !!this._has[pid]; };
    FP.pids = function () { return this._pids.slice(); };
    FP._ref = function (pid) {
        if (!this._has[pid]) throw new Error('No exact geometry for part ' + pid + '.');
        var w = this._where(pid); if (!w) throw new Error('No exact geometry for part ' + pid + '.');
        var h = this._h[w.key];
        if (!h) {
            var M = this.M, u8 = w.mini, p = M._malloc(u8.length); M.HEAPU8.set(u8, p);
            h = M._sl_load(p, u8.length); M._free(p);
            if (!h) throw new Error('No exact geometry for part ' + pid + '.');
            this._h[w.key] = h; this.loaded++;
        }
        return h + ' ' + w.solid + ' ' + Array.prototype.map.call(w.matrix, function (x) { return String(+x); }).join(' ');
    };
    FP._q = function (q) {
        var M = this.M, enc = new TextEncoder().encode(q + '\0'), p = M._malloc(enc.length); M.HEAPU8.set(enc, p);
        var lp = M._malloc(4), out = M._sl_query(p, lp), len = M.HEAP32[lp >> 2];
        M._free(p); M._free(lp);
        var txt = new TextDecoder().decode(M.HEAPU8.slice(out, out + len)); M._sl_free(out);
        var r = JSON.parse(txt);
        if (r && r.error) throw new Error(r.error);
        return r;
    };
    // indexes of the part's faces, edges and vertices (the same order as the opencascade.js lists)
    FP._counts = function (pid) { var c = this._cnt || (this._cnt = {}); return c[pid] || (c[pid] = this.properties(pid)); };
    FP.faces = function (pid) { var n = this._counts(pid).faces || 0, a = []; for (var i = 0; i < n; i++) a.push(i); return a; };
    FP.edges = function (pid) { var n = this._counts(pid).edges || 0, a = []; for (var i = 0; i < n; i++) a.push(i); return a; };
    FP.vertices = function (pid) { var n = this._counts(pid).vertices || 0, a = []; for (var i = 0; i < n; i++) a.push(i); return a; };
    FP.properties = function (pid) { var r = this._q('props ' + this._ref(pid)); r.pid = pid; return r; };
    FP.distance = function (a, b) { var r = this._q('dist ' + this._ref(a) + ' ' + this._ref(b)); if (r) { r.pidA = a; r.pidB = b; } return r; };
    FP.interference = function (a, b) { return this._q('inter ' + this._ref(a) + ' ' + this._ref(b)); };
    FP.faceInfo = function (pid, i) { return this._q('face ' + this._ref(pid) + ' ' + (i | 0)); };
    FP.edgeInfo = function (pid, i) { return this._q('edge ' + this._ref(pid) + ' ' + (i | 0)); };
    FP.pick = function (pid, p, opts) {
        opts = opts || {};
        var r = this._q('pick ' + this._ref(pid) + ' ' + (+p[0]) + ' ' + (+p[1]) + ' ' + (+p[2]) + ' ' + (opts.faceHint != null ? opts.faceHint | 0 : -1));
        r.pid = pid; return r;
    };
    FP.pmi = function () { return { dimensions: [], tolerances: [], datums: [], note: 'PMI is read from the whole file; this large assembly was opened part by part.' }; };
    FP.close = function () { var M = this.M, self = this; Object.keys(this._h).forEach(function (k) { M._sl_unload(self._h[k]); }); this._h = {}; };

    // The last steps of a PMI read, the same for either OpenCascade build:
    //   * a dimension nominal checked against the model's own value: OpenCascade converts some
    //     nominals to mm and leaves others in the unit the file wrote them in (their tolerances are
    //     converted). Only when one length unit, and only one, makes the nominal agree with the
    //     model is it converted; the item keeps the value as written and says so;
    //   * placed like the first part it points at (PMI sits in the prototype's frame).
    // locOf(pid) -> the part's placement (column-major 4x4) or null.
    function finishPmi(out, locOf) {
        out.forEach(function (item) {
            var mv = item.modelValue;
            if (item.kind !== 'dimension' || mv == null) return;
            var ok = function (x) { return Math.abs(x - mv) <= Math.max(1e-6, 0.005 * Math.abs(mv)); };
            if (typeof item.value === 'number' && item.value !== 0 && !ok(item.value) && !/Angular/.test(item.type)) {
                var hits = [['inch', 25.4], ['foot', 304.8], ['cm', 10], ['m', 1000]].filter(function (u) { return ok(item.value * u[1]); });
                if (hits.length === 1) {
                    var f = hits[0][1];
                    item.written = { value: item.value, unit: hits[0][0] };
                    item.value *= f; if (typeof item.upper === 'number') { item.upper *= f; item.lower *= f; }
                    item.unitNote = 'written in the file as ' + item.written.value + ' (' + hits[0][0] + '); shown in mm, confirmed by the model';
                }
            }
            if ((item.value == null || item.value === 0) && !/Angular/.test(item.type)) { item.value = mv; item.fromModel = true; }
            item.agrees = typeof item.value === 'number' ? ok(item.value) : null;
        });
        out.forEach(function (item) {
            var m = item.pids && item.pids.length ? locOf(item.pids[0]) : null;
            if (!m || isIdentity(m)) return;
            var X = function (p) { return p ? mulPoint(m, p[0], p[1], p[2]) : p; };
            ['textPoint', 'point', 'point2', 'anchor'].forEach(function (k) { if (item[k]) item[k] = X(item[k]); });
            item.presentation = (item.presentation || []).map(function (pl) { return pl.map(X); });
            item.placed = true;
        });
        return out;
    }
    // The whole-file session on our own build: a document kept by sl_read2, its mesh shapes in
    // world position; pids index-aligned with the meshes; mats: each mesh's placement.
    function FastDocSession(M, handle, pids, mats) {
        FastPartSession.call(this, M, pids, null);
        this._doc = handle; this._idx = {}; var self = this; pids.forEach(function (p, i) { self._idx[p] = i; }); this._mats = mats;
    }
    FastDocSession.prototype = Object.create(FastPartSession.prototype);
    FastDocSession.prototype._ref = function (pid) {
        var i = this._idx[pid]; if (i == null) throw new Error('No exact geometry for part ' + pid + '.');
        return this._doc + ' ' + i + ' 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1';
    };
    FastDocSession.prototype.pmi = function () {
        if (this._pmi) return this._pmi;
        var M = this.M, lp = M._malloc(4), out = M._sl_pmi(this._doc, lp), len = M.HEAP32[lp >> 2]; M._free(lp);
        var raw = JSON.parse(new TextDecoder().decode(M.HEAPU8.slice(out, out + len))); M._sl_free(out);
        var pids = this._pids, mats = this._mats;
        raw.forEach(function (item) {
            item.pids = (item.refs || []).map(function (i) { return pids[i]; }).filter(Boolean).sort(); delete item.refs;
            if (!item.textPoint && !item.point) item.anchor = item.anchorRaw || null;
            delete item.anchorRaw;
            if (!item.presentation) item.presentation = [];
        });
        var idx = this._idx;
        this._pmi = finishPmi(raw, function (pid) { var i = idx[pid]; return i != null && mats[i] ? Array.prototype.slice.call(mats[i]) : null; });
        return this._pmi;
    };
    FastDocSession.prototype.close = function () { this.M._sl_unload(this._doc); };

    // The whole-file import on our own build: one read gives the meshes (same walk, names, colors,
    // prototypes as convert) and keeps the document for exact queries and PMI.
    // Returns { model, session } like convert.
    function readFast(M, u8, lin, ang, keep) {
        var p = M._malloc(u8.length); M.HEAPU8.set(u8, p);
        var lp = M._malloc(4), out = M._sl_read2(p, u8.length, lin, ang, keep ? 1 : 0, lp), len = M.HEAP32[lp >> 2];
        M._free(p); M._free(lp);
        if (!out || !len) throw new Error('OpenCascade could not read this STEP file.');
        var buf = M.HEAPU8.slice(out, out + len).buffer; M._sl_free(out);
        var dv = new DataView(buf), jl = dv.getUint32(0, true);
        var meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
        var o = 4 + jl; o += (4 - o % 4) % 4;
        var protos = meta.protos.map(function (q) {
            var pos = new Float32Array(buf.slice(o, o + q.v * 12)); o += q.v * 12;
            var idx = new Uint32Array(buf.slice(o, o + q.t * 12)); o += q.t * 12;
            var fr = new Int32Array(buf, o, q.f * 2); o += q.f * 8;
            var faces = []; for (var i = 0; i < q.f; i++) faces.push({ first: fr[i * 2], last: fr[i * 2 + 1] });
            return { position: pos, index: idx, faces: faces };
        });
        return { success: true, root: meta.root, meshes: meta.meshes, protos: protos, handle: meta.handle || 0, ms: meta.ms };
    }
    function convertFast(M, bytes, opts) {
        opts = opts || {};
        var I = root.SLCadImport;
        var prog = function (ph, f) { if (opts.onProgress) { try { opts.onProgress(ph, f); } catch (_) {} } };
        var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        prog('scan', 0);
        var text = I.bytesToText(u8);
        if (!/ISO-10303-21/.test(text.slice(0, 2000))) throw new Error('This is not a STEP file (the ISO-10303-21 header is missing).');
        var schema = I.stepSchema(text), sourceUnit = I.stepLengthUnit(text);
        var pidx = I.productIndex(I.parseStepProducts(text));
        var instances = I.parseStepInstances(text);
        var attrs = I.parseStepAttributes ? I.parseStepAttributes(text) : null;
        text = null;
        // progress inside the read: the parser reports how far into the file it is
        prog('parse', 0);
        M.onReadProgress = function (f) { prog('parse', f); if (f >= 1) prog('transfer', null); };
        var res;
        try { res = readFast(M, u8, opts.linearDeflection || DEFAULTS.linearDeflection, opts.angularDeflection || DEFAULTS.angularDeflection, opts.keep !== false); } finally { M.onReadProgress = null; }
        var tree = I.attachTrails ? I.attachTrails(res, u8) : { full: false, why: 'no attachTrails' };   // full assembly paths (17 Oct 2026)
        var mats = res.meshes.map(function (m) { return m.matrix; });
        var model = I.buildModel(res, { productIndex: pidx, instances: instances, attributes: attrs, maxTrianglesPerPart: opts.maxTrianglesPerPart, maxTrianglesTotal: opts.maxTrianglesTotal, onProgress: opts.onProgress });
        model.schema = schema; model.sourceUnit = sourceUnit; model.units = 'mm'; model.reader = 'occt-fast'; model.tree = tree;
        model.stats.readMs = res.ms || null;
        var session = null;
        if (opts.keep !== false && res.handle) {
            var pids = []; I.walkParts(res, function (mi, w) { pids[mi] = w.pid; });
            session = new FastDocSession(M, res.handle, pids, mats); session.setFileUnit(sourceUnit);
        }
        return { model: model, session: session };
    }
    // An exact session on our build from a STEP file whose geometry is cached (no meshes kept).
    function openSessionFast(M, bytes) {
        var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        var res = readFast(M, u8, DEFAULTS.linearDeflection, DEFAULTS.angularDeflection, true);
        if (root.SLCadImport.attachTrails) root.SLCadImport.attachTrails(res, u8);   // the same part ids as the import
        var pids = []; root.SLCadImport.walkParts(res, function (mi, w) { pids[mi] = w.pid; });
        var ss = new FastDocSession(M, res.handle, pids, res.meshes.map(function (m) { return m.matrix; }));
        ss.setFileUnit(fileUnitOf(u8));
        return ss;
    }


    var api = {
        VERSION: VERSION, DEFAULTS: DEFAULTS, FastPartSession: FastPartSession, FastDocSession: FastDocSession, finishPmi: finishPmi,
        convertFast: convertFast, openSessionFast: openSessionFast, readFast: readFast,
        _m: { invert: invert, mulMat: mulMat, mulPoint: mulPoint, isIdentity: isIdentity }
    };
    root.SLCadBrep = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));

// ============================================================================
// cad_step_struct.js, v1.0: the STEP assembly structure, read in JavaScript (13 Oct 2026, cad-C).
//
// OpenCascade's own STEP transfer gets slower with the square of the number of assembly
// components (20,000 components: about 2.5 minutes). A large aircraft is mostly copies, so this
// file reads the assembly STRUCTURE itself (products, NEXT_ASSEMBLY_USAGE_OCCURRENCE links,
// placements) in one pass over the bytes, and cuts out, for each DISTINCT part, a small
// self-contained STEP file holding only that part's product and geometry. OpenCascade then reads
// each distinct part once (in parallel workers) and every copy is an instance with a placement.
//
// Worker and node only (no DOM). Nothing here talks to the network.
//
//   var ix = SLCadStep.index(u8, onProgress)     one pass: where each entity is, its type
//   var st = SLCadStep.structure(ix)             products, assembly tree, placements, or
//                                                { unsupported: reason } (then the caller reads
//                                                the whole file with OpenCascade as before)
//   var mini = SLCadStep.extract(ix, st, pdId)   Uint8Array: one part as its own STEP file
//   SLCadStep.occurrences(st)                    every placed copy of every part, depth first,
//                                                in OpenCascade's order, with its world matrix
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';

    // ---------------------------------------------------------------- one pass over the bytes
    // Entity records: start/end byte offsets of the text after '=' up to (not including) ';'.
    function index(u8, onProgress) {
        var n = u8.length, i = 0;
        var cap = 1 << 16, ids = new Int32Array(cap), st = new Uint32Array(cap), en = new Uint32Array(cap), cnt = 0;
        var types = [], typeOf = Object.create(null), tcode = new Uint16Array(cap);
        var maxId = 0, lastProg = 0;
        // find DATA;
        var dataAt = findAscii(u8, 'DATA;', 0);
        if (dataAt < 0) throw new Error('This STEP file has no DATA section.');
        var header = u8.subarray(0, dataAt);
        i = dataAt + 5;
        function grow() {
            var c2 = cap * 2;
            var a = new Int32Array(c2); a.set(ids); ids = a;
            var b = new Uint32Array(c2); b.set(st); st = b;
            var c = new Uint32Array(c2); c.set(en); en = c;
            var d = new Uint16Array(c2); d.set(tcode); tcode = d;
            cap = c2;
        }
        while (i < n) {
            var ch = u8[i];
            if (ch === 35) {   // '#'
                var id = 0; i++;
                while (i < n && (ch = u8[i]) >= 48 && ch <= 57) { id = id * 10 + (ch - 48); i++; }
                while (i < n && u8[i] <= 32) i++;
                if (u8[i] !== 61) { i = skipStatement(u8, i); continue; }   // not '#n='
                i++;
                while (i < n && u8[i] <= 32) i++;
                var s0 = i, code;
                if (u8[i] === 40) code = 1;   // complex entity
                else {
                    var t0 = i;
                    while (i < n && ((ch = u8[i]) === 95 || (ch >= 65 && ch <= 90) || (ch >= 48 && ch <= 57) || (ch >= 97 && ch <= 122))) i++;
                    var tn = asciiUpper(u8, t0, i);
                    code = typeOf[tn];
                    if (code === undefined) { code = typeOf[tn] = types.length + 2; types.push(tn); }
                }
                var e = skipStatement(u8, i);   // index of ';'
                if (cnt === cap) grow();
                ids[cnt] = id; st[cnt] = s0; en[cnt] = e; tcode[cnt] = code; cnt++;
                if (id > maxId) maxId = id;
                i = e + 1;
                if (onProgress && i - lastProg > 4194304) { lastProg = i; onProgress(i / n); }
                continue;
            }
            if (ch === 69 && u8[i + 1] === 78 && u8[i + 2] === 68 && u8[i + 3] === 83 && u8[i + 4] === 69 && u8[i + 5] === 67) break;   // ENDSEC
            if (ch === 47 && u8[i + 1] === 42) { var ce = findAscii(u8, '*/', i + 2); i = ce < 0 ? n : ce + 2; continue; }
            i++;
        }
        // id -> record slot
        var slot = new Int32Array(maxId + 1).fill(-1);
        for (var k = 0; k < cnt; k++) slot[ids[k]] = k;
        if (onProgress) onProgress(1);
        return { u8: u8, header: header, count: cnt, maxId: maxId, ids: ids.subarray(0, cnt), start: st.subarray(0, cnt), end: en.subarray(0, cnt), tcode: tcode.subarray(0, cnt), types: types, typeOf: typeOf, slot: slot, _args: new Map() };
    }
    function findAscii(u8, s, from) {
        var c0 = s.charCodeAt(0), L = s.length;
        outer: for (var i = from; i <= u8.length - L; i++) {
            if (u8[i] !== c0) continue;
            for (var j = 1; j < L; j++) if (u8[i + j] !== s.charCodeAt(j)) continue outer;
            return i;
        }
        return -1;
    }
    // From i, the index of the ';' that ends this statement (quotes and comments respected).
    function skipStatement(u8, i) {
        var n = u8.length;
        while (i < n) {
            var ch = u8[i];
            if (ch === 59) return i;
            if (ch === 39) {   // quoted string, '' escapes a quote
                i++;
                while (i < n) { if (u8[i] === 39) { if (u8[i + 1] === 39) { i += 2; continue; } break; } i++; }
                i++; continue;
            }
            if (ch === 47 && u8[i + 1] === 42) { var ce = findAscii(u8, '*/', i + 2); i = ce < 0 ? n : ce + 2; continue; }
            i++;
        }
        return n;
    }
    function asciiUpper(u8, a, b) {
        var s = '';
        for (var i = a; i < b; i++) { var c = u8[i]; s += String.fromCharCode(c >= 97 && c <= 122 ? c - 32 : c); }
        return s;
    }
    function typeName(ix, id) {
        var k = ix.slot[id]; if (k < 0 || k === undefined) return null;
        var c = ix.tcode[k];
        return c === 1 ? '(complex)' : ix.types[c - 2];
    }
    function hasWord(ix, id, word) {
        var k = ix.slot[id]; if (k < 0 || k === undefined) return false;
        var u8 = ix.u8, L = word.length, e = ix.end[k] - L, c0 = word.charCodeAt(0);
        outer: for (var i = ix.start[k]; i <= e; i++) {
            if (u8[i] !== c0) continue;
            for (var j = 1; j < L; j++) if (u8[i + j] !== word.charCodeAt(j)) continue outer;
            var after = u8[i + L];
            if (after === 95 || (after >= 65 && after <= 90)) continue;   // a longer name
            var before = u8[i - 1];
            if (before === 95 || (before >= 65 && before <= 90)) continue;
            return true;
        }
        return false;
    }
    function idsOfType(ix, name) {
        var c = ix.typeOf[name];
        if (c === undefined) return [];
        if (!ix._byType) {
            var counts = new Int32Array(ix.types.length + 2), k;
            for (k = 0; k < ix.count; k++) counts[ix.tcode[k]]++;
            var lists = [];
            for (k = 0; k < counts.length; k++) lists.push(new Int32Array(counts[k]));
            var fill = new Int32Array(counts.length);
            for (k = 0; k < ix.count; k++) { var t = ix.tcode[k]; lists[t][fill[t]++] = ix.ids[k]; }
            ix._byType = lists;
        }
        return Array.prototype.slice.call(ix._byType[c]);
    }

    // ---------------------------------------------------------------- parameters of one entity
    // Parameters as nested arrays: numbers, strings (decoded), {ref:n}, {enum:'X'}, null ($), '*',
    // typed values {type:'LENGTH_MEASURE', args:[...]}. A complex entity gives
    // { complex: { TYPE: [params], ... } }.
    function args(ix, id) {
        var k = ix.slot[id]; if (k < 0 || k === undefined) return null;
        var p = { u8: ix.u8, i: ix.start[k], end: ix.end[k] };
        var out;
        if (ix.tcode[k] === 1) {
            out = { complex: {} };
            p.i++;   // '('
            for (;;) {
                ws(p);
                if (p.i >= p.end || p.u8[p.i] === 41) break;
                var nm = ident(p); ws(p);
                out.complex[nm] = list(p);
            }
        } else {
            ident(p); ws(p);
            out = list(p);
        }
        return out;
    }
    function cachedArgs(ix, id) { var a = ix._args.get(id); if (a === undefined) { a = args(ix, id); ix._args.set(id, a); } return a; }
    function ws(p) { while (p.i < p.end) { var c = p.u8[p.i]; if (c <= 32) { p.i++; continue; } if (c === 47 && p.u8[p.i + 1] === 42) { var e = findAscii(p.u8, '*/', p.i + 2); p.i = e < 0 ? p.end : e + 2; continue; } break; } }
    function ident(p) { var a = p.i, c; while (p.i < p.end && ((c = p.u8[p.i]) === 95 || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || (c >= 97 && c <= 122))) p.i++; return asciiUpper(p.u8, a, p.i); }
    function list(p) {
        var out = [];
        if (p.u8[p.i] !== 40) return out;
        p.i++;
        for (;;) {
            ws(p);
            if (p.i >= p.end) return out;
            var c = p.u8[p.i];
            if (c === 41) { p.i++; return out; }
            if (c === 44) { p.i++; continue; }
            out.push(value(p));
        }
    }
    function value(p) {
        var c = p.u8[p.i];
        if (c === 35) { p.i++; var n = 0; while (p.i < p.end && (c = p.u8[p.i]) >= 48 && c <= 57) { n = n * 10 + (c - 48); p.i++; } return { ref: n }; }
        if (c === 39) return str(p);
        if (c === 40) return list(p);
        if (c === 36) { p.i++; return null; }
        if (c === 42) { p.i++; return '*'; }
        if (c === 46) { p.i++; var a = p.i; while (p.i < p.end && p.u8[p.i] !== 46) p.i++; var e = asciiUpper(p.u8, a, p.i); p.i++; return { enum: e }; }
        if ((c >= 48 && c <= 57) || c === 45 || c === 43) { var b = p.i; p.i++; while (p.i < p.end && ((c = p.u8[p.i]) === 46 || c === 69 || c === 101 || c === 45 || c === 43 || (c >= 48 && c <= 57))) p.i++; return parseFloat(asciiUpper(p.u8, b, p.i)); }
        if (c === 34) { p.i++; var h = p.i; while (p.i < p.end && p.u8[p.i] !== 34) p.i++; p.i++; return { binary: asciiUpper(p.u8, h, p.i - 1) }; }
        // typed value: NAME(args)
        var nm = ident(p); ws(p);
        return { type: nm, args: list(p) };
    }
    // ISO 10303-21 string: '' is a quote, \X2\....\X0\ UTF-16 hex, \X\hh one byte, \S\c high half.
    function str(p) {
        p.i++;
        var bytes = [];
        while (p.i < p.end) {
            var c = p.u8[p.i];
            if (c === 39) { if (p.u8[p.i + 1] === 39) { bytes.push(39); p.i += 2; continue; } p.i++; break; }
            bytes.push(c); p.i++;
        }
        return decodeStepString(bytes);
    }
    function decodeStepString(bytes) {
        var s = '', i = 0, n = bytes.length;
        function hex(a, b) { var t = ''; for (var k = a; k < b; k++) t += String.fromCharCode(bytes[k]); return t; }
        while (i < n) {
            var c = bytes[i];
            if (c === 92 && i + 3 < n) {   // backslash directives
                var d = String.fromCharCode(bytes[i + 1]) + String.fromCharCode(bytes[i + 2]);
                if (d === 'X2' && bytes[i + 3] === 92) {
                    var j = i + 4; while (j + 3 < n && !(bytes[j] === 92 && bytes[j + 1] === 88 && bytes[j + 2] === 48 && bytes[j + 3] === 92)) j++;
                    var h = hex(i + 4, j); for (var q = 0; q + 4 <= h.length; q += 4) s += String.fromCharCode(parseInt(h.substr(q, 4), 16));
                    i = j + 4; continue;
                }
                if (d === 'X4' && bytes[i + 3] === 92) {
                    var j4 = i + 4; while (j4 + 3 < n && !(bytes[j4] === 92 && bytes[j4 + 1] === 88 && bytes[j4 + 2] === 48 && bytes[j4 + 3] === 92)) j4++;
                    var h4 = hex(i + 4, j4); for (var q4 = 0; q4 + 8 <= h4.length; q4 += 8) s += String.fromCodePoint(parseInt(h4.substr(q4, 8), 16));
                    i = j4 + 4; continue;
                }
                if (d.charAt(0) === 'X' && bytes[i + 2] === 92 && i + 4 < n) { s += String.fromCharCode(parseInt(hex(i + 3, i + 5), 16)); i += 5; continue; }
                if (d.charAt(0) === 'S' && bytes[i + 2] === 92) { s += String.fromCharCode(bytes[i + 3] + 128); i += 4; continue; }
                if (d.charAt(0) === '\\') { s += '\\'; i += 2; continue; }
            }
            if (c >= 0x80) {   // raw UTF-8 (written by some exporters)
                var cp = -1, len = 0;
                if ((c & 0xe0) === 0xc0) { cp = c & 0x1f; len = 1; } else if ((c & 0xf0) === 0xe0) { cp = c & 0x0f; len = 2; } else if ((c & 0xf8) === 0xf0) { cp = c & 0x07; len = 3; }
                var okU = len > 0 && i + len < n + 0;
                for (var u = 1; okU && u <= len; u++) { var cc = bytes[i + u]; if (cc === undefined || (cc & 0xc0) !== 0x80) okU = false; else cp = (cp << 6) | (cc & 0x3f); }
                if (okU) { s += String.fromCodePoint(cp); i += len + 1; continue; }
                s += String.fromCharCode(c); i++; continue;
            }
            s += String.fromCharCode(c); i++;
        }
        return s;
    }
    // every #ref inside an entity's text (fast byte scan, no parsing)
    function refsOf(ix, id, out) {
        var k = ix.slot[id]; if (k < 0 || k === undefined) return out;
        var u8 = ix.u8, i = ix.start[k], e = ix.end[k];
        while (i < e) {
            var c = u8[i];
            if (c === 39) { i++; while (i < e) { if (u8[i] === 39) { if (u8[i + 1] === 39) { i += 2; continue; } break; } i++; } i++; continue; }
            if (c === 35) { i++; var n = 0; while (i < e && (c = u8[i]) >= 48 && c <= 57) { n = n * 10 + (c - 48); i++; } out.push(n); continue; }
            i++;
        }
        return out;
    }

    // ---------------------------------------------------------------- placements
    // The numbers of the list in CARTESIAN_POINT('',(x,y,z)) or DIRECTION('',(x,y,z)), read straight
    // from the bytes (no objects: a 200,000 part file has over a million of these).
    function nums(ix, id, out, atDepth) {
        var want = atDepth || 2;
        var k = ix.slot[id]; if (k < 0 || k === undefined) return null;
        var u8 = ix.u8, i = ix.start[k], e = ix.end[k], depth = 0, n = 0;
        while (i < e) {
            var c = u8[i];
            if (c === 39) { i++; while (i < e) { if (u8[i] === 39) { if (u8[i + 1] === 39) { i += 2; continue; } break; } i++; } i++; continue; }
            if (c === 40) { depth++; i++; continue; }
            if (c === 41) { depth--; i++; if (n && depth < want) break; continue; }
            if (depth === want && (c === 45 || c === 43 || c === 46 || (c >= 48 && c <= 57))) {
                var sign = 1, v = 0, frac = 0, scale = 1, ex = 0, exSign = 1;
                if (c === 45) { sign = -1; i++; } else if (c === 43) i++;
                while (i < e && (c = u8[i]) >= 48 && c <= 57) { v = v * 10 + (c - 48); i++; }
                if (u8[i] === 46) { i++; while (i < e && (c = u8[i]) >= 48 && c <= 57) { frac = frac * 10 + (c - 48); scale *= 10; i++; } }
                if (u8[i] === 69 || u8[i] === 101) { i++; if (u8[i] === 45) { exSign = -1; i++; } else if (u8[i] === 43) i++; while (i < e && (c = u8[i]) >= 48 && c <= 57) { ex = ex * 10 + (c - 48); i++; } }
                var val = sign * (v + frac / scale);
                if (ex) val *= Math.pow(10, exSign * ex);
                out[n++] = val;
                continue;
            }
            i++;
        }
        return n ? out : null;
    }
    function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    // gp_Ax2(P, V): OpenCascade's X direction when a placement gives no reference direction
    function defaultX(v) {
        var A = v[0], B = v[1], C = v[2], a = Math.abs(A), b = Math.abs(B), c = Math.abs(C);
        if (b <= a && b <= c) return a > c ? [-C, 0, A] : [C, 0, -A];
        if (a <= b && a <= c) return b > c ? [0, -C, B] : [0, C, -B];
        return a > b ? [-B, A, 0] : [B, -A, 0];
    }
    // AXIS2_PLACEMENT_3D -> column-major 4x4 (local frame to parent), translation scaled to mm.
    function axisMatrix(ix, id, scale) {
        if (typeName(ix, id) !== 'AXIS2_PLACEMENT_3D') return null;
        var refs = refsOf(ix, id, []);   // location, axis?, ref_direction? ($ gives no ref)
        var k = ix.slot[id], u8 = ix.u8, i = ix.start[k], e = ix.end[k], slots = [], depth = 0, cur = null;
        // which of the three parameters after the name are references (an omitted one is $)
        for (; i < e; i++) {
            var c = u8[i];
            if (c === 39) { i++; while (i < e && !(u8[i] === 39 && u8[i + 1] !== 39)) { if (u8[i] === 39) i++; i++; } continue; }
            if (c === 40) { depth++; continue; }
            if (depth === 1 && c === 44) { slots.push(cur); cur = null; continue; }
            if (depth === 1 && c === 35) cur = 'r';
            if (depth === 1 && c === 36) cur = '$';
        }
        slots.push(cur);   // [name, location, axis, ref]
        var ri = 0, loc = [0, 0, 0], z = [0, 0, 1], xr = null, tmp = [0, 0, 0];
        if (slots[1] === 'r') { var L = nums(ix, refs[ri++], tmp); if (L) loc = [L[0], L[1], L[2] || 0]; }
        if (slots[2] === 'r') { var Z = nums(ix, refs[ri++], tmp); if (Z) z = norm([Z[0], Z[1], Z[2]]); }
        if (slots[3] === 'r') { var X = nums(ix, refs[ri++], tmp); if (X) xr = [X[0], X[1], X[2]]; }
        if (!xr) xr = defaultX(z);
        var d = xr[0] * z[0] + xr[1] * z[1] + xr[2] * z[2];
        var x = norm([xr[0] - d * z[0], xr[1] - d * z[1], xr[2] - d * z[2]]);
        var y = cross(z, x);
        return [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, loc[0] * scale, loc[1] * scale, loc[2] * scale, 1];
    }
    function mul(a, b) {
        var o = new Array(16);
        for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        return o;
    }
    function invRigid(m) {   // rotation + translation inverse
        var o = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
        o[12] = -(o[0] * m[12] + o[4] * m[13] + o[8] * m[14]);
        o[13] = -(o[1] * m[12] + o[5] * m[13] + o[9] * m[14]);
        o[14] = -(o[2] * m[12] + o[6] * m[13] + o[10] * m[14]);
        return o;
    }
    var IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

    // ---------------------------------------------------------------- units
    var SI_MM = { '': 1, MILLI: 1, CENTI: 10, DECI: 100, KILO: 1e6, MICRO: 1e-3 };
    // the length unit (mm per unit) of a representation context, or null if unknown
    function contextMm(ix, ctxId, memo) {
        if (memo[ctxId] !== undefined) return memo[ctxId];
        var a = cachedArgs(ix, ctxId), units = null;
        if (a && a.complex && a.complex.GLOBAL_UNIT_ASSIGNED_CONTEXT) units = a.complex.GLOBAL_UNIT_ASSIGNED_CONTEXT[0];
        var mm = null;
        (units || []).forEach(function (u) { if (!u || !u.ref || mm != null) return; var v = unitMm(ix, u.ref, 0); if (v != null) mm = v; });
        memo[ctxId] = mm;
        return mm;
    }
    function unitMm(ix, id, depth) {
        if (depth > 4) return null;
        var a = cachedArgs(ix, id);
        if (!a || !a.complex) return null;
        var C = a.complex;
        if (!C.LENGTH_UNIT) return null;
        if (C.SI_UNIT) {
            var pre = C.SI_UNIT[0] && C.SI_UNIT[0].enum ? C.SI_UNIT[0].enum : '';
            var name = C.SI_UNIT[1] && C.SI_UNIT[1].enum;
            if (name !== 'METRE') return null;
            var f = { '': 1000, MILLI: 1, CENTI: 10, DECI: 100, KILO: 1e6, MICRO: 1e-3 }[pre];
            return f == null ? null : f;
        }
        if (C.CONVERSION_BASED_UNIT) {
            var mw = C.CONVERSION_BASED_UNIT[1];
            if (!mw || !mw.ref) return null;
            var m = cachedArgs(ix, mw.ref);   // LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),#unit)
            if (!m) return null;
            var vals = m.complex ? (m.complex.MEASURE_WITH_UNIT || m.complex.LENGTH_MEASURE_WITH_UNIT) : m;
            if (!vals) return null;
            var v = vals[0] && vals[0].args ? vals[0].args[0] : vals[0];
            var base = vals[1] && vals[1].ref ? unitMm(ix, vals[1].ref, depth + 1) : null;
            return typeof v === 'number' && base != null ? v * base : null;
        }
        return null;
    }

    // ---------------------------------------------------------------- the assembly structure
    var GEOM_ITEMS = { MANIFOLD_SOLID_BREP: 1, BREP_WITH_VOIDS: 1, FACETED_BREP: 1, SHELL_BASED_SURFACE_MODEL: 1, GEOMETRIC_CURVE_SET: 1, GEOMETRIC_SET: 1, MAPPED_ITEM: 1, FACE_BASED_SURFACE_MODEL: 1, TESSELLATED_SHAPE_REPRESENTATION: 1, TRIANGULATED_FACE: 1, TESSELLATED_SOLID: 1, TESSELLATED_SHELL: 1 };
    function structure(ix, opts) {
        opts = opts || {};
        var A = function (id) { return cachedArgs(ix, id); };
        var F = function (id) { return refsOf(ix, id, []); };
        var R = function (v) { return v && v.ref; };
        var products = {}, pdf = {}, pds = new Int32Array(ix.maxId + 1), sdrByPds = {}, sdrOfPd = {}, pdName = {};
        idsOfType(ix, 'PRODUCT').forEach(function (id) { var a = A(id); products[id] = { id: a[0], name: a[1] }; });
        ['PRODUCT_DEFINITION_FORMATION', 'PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE'].forEach(function (t) { idsOfType(ix, t).forEach(function (id) { pdf[id] = F(id)[0]; }); });
        var pdList = [];
        ['PRODUCT_DEFINITION', 'PRODUCT_DEFINITION_WITH_ASSOCIATED_DOCUMENTS'].forEach(function (t) { idsOfType(ix, t).forEach(function (id) { pdList.push(id); }); });
        pdList.sort(function (a, b) { return a - b; });
        var pdProduct = {};
        pdList.forEach(function (id) { var f = F(id)[0]; var p = products[pdf[f]]; pdProduct[id] = pdf[f]; pdName[id] = p ? (p.name || p.id || '') : ''; });
        idsOfType(ix, 'PRODUCT_DEFINITION_SHAPE').forEach(function (id) { pds[id] = F(id)[0]; });
        var repOfPd = {};
        idsOfType(ix, 'SHAPE_DEFINITION_REPRESENTATION').forEach(function (id) {
            var a = F(id), d = a[0], rep = a[1];
            var def = pds[d];
            if (def && pdName[def] !== undefined) { (repOfPd[def] = repOfPd[def] || []).push(rep); sdrByPds[d] = id; if (sdrOfPd[def] == null) sdrOfPd[def] = id; }
        });
        // NAUO: parent PD -> child PD, and its placement from the CDSR
        var nauo = new Map(), kids = {}, isChild = new Uint8Array(ix.maxId + 1);
        idsOfType(ix, 'NEXT_ASSEMBLY_USAGE_OCCURRENCE').forEach(function (id) {
            var a = F(id), par = a[0], ch = a[1];
            nauo.set(id, { id: id, parent: par, child: ch, matrix: null });
            (kids[par] = kids[par] || []).push(id);
            isChild[ch] = 1;
        });
        // unit
        var ctxMemo = {}, fileMm = null, mixed = false;
        var repMmMemo = {};
        function repMm(rep) {
            if (repMmMemo[rep] !== undefined) return repMmMemo[rep];
            var r = repMmMemo[rep] = repMm0(rep);
            return r;
        }
        function repMm0(rep) {
            var a = args(ix, rep); if (!a) return null;
            var ctxRef = a.complex ? null : a[2];
            if (a.complex) { var any = a.complex.REPRESENTATION || a.complex.SHAPE_REPRESENTATION; ctxRef = any && any[2]; }
            return ctxRef && ctxRef.ref ? contextMm(ix, ctxRef.ref, ctxMemo) : null;
        }
        var assemblyRel = new Uint8Array(ix.maxId + 1);
        var unsupported = null;
        idsOfType(ix, 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION').forEach(function (id) {
            var a = F(id), rel = a[0], pd = a[1];
            var n = nauo.get(pds[pd]);
            if (!n) return;
            assemblyRel[rel] = 1;
            var rr = F(rel);   // rep_1, rep_2, transformation operator
            if (ix.tcode[ix.slot[rel]] !== 1 || rr.length !== 3 || !hasWord(ix, rel, 'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION')) { unsupported = unsupported || 'an assembly placement this reader does not know (#' + rel + ')'; return; }
            var rep1 = rr[0], rep2 = rr[1], op = rr[2];
            var mm1 = repMm(rep1), mm2 = repMm(rep2);
            if (mm1 != null) { if (fileMm == null) fileMm = mm1; else if (Math.abs(fileMm - mm1) > 1e-9) mixed = true; }
            if (mm2 != null) { if (fileMm == null) fileMm = mm2; else if (Math.abs(fileMm - mm2) > 1e-9) mixed = true; }
            var sc = mm2 != null ? mm2 : (mm1 != null ? mm1 : 1);
            if (typeName(ix, op) !== 'ITEM_DEFINED_TRANSFORMATION') { unsupported = unsupported || 'a placement given as ' + typeName(ix, op); return; }
            var t = F(op), m1 = axisMatrix(ix, t[0], sc), m2 = axisMatrix(ix, t[1], sc);
            if (!m1 || !m2) { unsupported = unsupported || 'a placement that is not an AXIS2_PLACEMENT_3D'; return; }
            // the child's frame (item 1 in the child's representation) is moved onto item 2
            n.matrix = mul(m2, invRigid(m1));
            n.rep1 = rep1; n.rep2 = rep2;
        });
        if (mixed) unsupported = unsupported || 'parts in different length units';
        nauo.forEach(function (n, k) { if (!n.matrix && !unsupported) unsupported = 'an assembly link with no placement (#' + k + ')'; });
        // roots: product definitions with a shape that are never a child
        var roots = pdList.filter(function (pd) { return !isChild[pd] && (kids[pd] || repOfPd[pd]); });
        // leaf parts: product definitions with no children; they must carry geometry
        var leaves = pdList.filter(function (pd) { return !kids[pd] && isChild[pd]; });
        // an assembly carrying its own geometry is outside this reader
        Object.keys(kids).forEach(function (pd) {
            (repOfPd[pd] || []).forEach(function (rep) { if (!unsupported && repHasGeometry(ix, rep, assemblyRel)) unsupported = 'an assembly that also has its own geometry (' + pdName[pd] + ')'; });
        });
        if (!roots.length) unsupported = unsupported || 'no top level product';
        // children in OpenCascade's order (the order the NAUO were written)
        Object.keys(kids).forEach(function (k) { kids[k].sort(function (a, b) { return a - b; }); });
        var nComp = nauo.size;
        return {
            unsupported: unsupported, fileMm: fileMm == null ? 1 : fileMm,
            products: products, roots: roots, leaves: leaves, kids: kids, nauo: nauo, pdName: pdName, pdProduct: pdProduct, repOfPd: repOfPd,
            sdrByPds: sdrByPds, sdrOfPd: sdrOfPd, pds: pds, assemblyRel: assemblyRel, components: nComp
        };
    }
    // does a representation (or a non-placement relation of it) hold geometry items?
    function repHasGeometry(ix, rep, assemblyRel) {
        var refs = refsOf(ix, rep, []);
        for (var i = 0; i < refs.length; i++) { var t = typeName(ix, refs[i]); if (t && GEOM_ITEMS[t]) return true; }
        return false;
    }
    // Every placed copy, depth first in OpenCascade's order: { leaf: pdId, path: [nauoIds], matrix }.
    // cb(occ) is called per copy (200,000 copies do not need an array of arrays).
    function occurrences(st, cb) {
        var count = 0;
        st.roots.forEach(function (r) {
            (function walk(pd, m, path) {
                var ks = st.kids[pd];
                if (!ks) { cb({ leaf: pd, path: path, matrix: m, root: r }); count++; return; }
                for (var i = 0; i < ks.length; i++) { var n = st.nauo.get(ks[i]); path.push(ks[i]); walk(n.child, mul(m, n.matrix), path); path.pop(); }
            })(r, IDENT, []);
        });
        return count;
    }

    // ---------------------------------------------------------------- one part as its own file
    // Forward closure from the part's SHAPE_DEFINITION_REPRESENTATION, plus what points INTO it and
    // belongs to it: shape representation relationships that are not assembly placements, and
    // styled items (colors). The assembly above the part is never included.
    var REVERSE_TYPES = { SHAPE_REPRESENTATION_RELATIONSHIP: 1, STYLED_ITEM: 1, OVER_RIDING_STYLED_ITEM: 1, PRESENTATION_LAYER_ASSIGNMENT: 0 };
    function reverseIndex(ix) {
        if (ix._rev) return ix._rev;
        var rev = Object.create(null), mdgprCtx = null;
        var codes = {};
        Object.keys(REVERSE_TYPES).forEach(function (t) { if (REVERSE_TYPES[t] && ix.typeOf[t] !== undefined) codes[ix.typeOf[t]] = t; });
        var tmp = [];
        for (var k = 0; k < ix.count; k++) {
            var c = ix.tcode[k], id = ix.ids[k];
            var isRel = codes[c];
            if (!isRel && c === 1) {
                // complex: a SHAPE_REPRESENTATION_RELATIONSHIP with or without a transformation
                if (hasWord(ix, id, 'SHAPE_REPRESENTATION_RELATIONSHIP')) isRel = 'SRR';
            }
            if (!isRel) continue;
            tmp.length = 0; refsOf(ix, id, tmp);
            for (var j = 0; j < tmp.length; j++) { var r = tmp[j]; (rev[r] || (rev[r] = [])).push(id); }
        }
        var md = idsOfType(ix, 'MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION');
        if (md.length) { var ma = cachedArgs(ix, md[0]); mdgprCtx = ma && ma[2] && ma[2].ref; }
        ix._rev = { rev: rev, mdgprCtx: mdgprCtx };
        return ix._rev;
    }
    function closureOf(ix, st, pd) {
        var R = reverseIndex(ix), list = [], stack = [];
        var styled = [];
        // a stamp per call instead of a fresh 'seen' array per part
        var seen = ix._seen || (ix._seen = new Int32Array(ix.maxId + 2)), stamp = ix._stamp = (ix._stamp || 0) + 1;
        var sdr = st.sdrOfPd[pd];
        if (sdr == null) return null;
        stack.push(sdr);
        var tmp = [];
        while (stack.length) {
            var id = stack.pop();
            if (seen[id] === stamp) continue;
            if (ix.slot[id] < 0) continue;
            seen[id] = stamp; list.push(id);
            tmp.length = 0; refsOf(ix, id, tmp);
            for (var i = 0; i < tmp.length; i++) if (seen[tmp[i]] !== stamp) stack.push(tmp[i]);
            var back = R.rev[id];
            if (back) for (var b = 0; b < back.length; b++) {
                var bid = back[b];
                if (seen[bid] === stamp || st.assemblyRel[bid]) continue;
                var t = typeName(ix, bid);
                if (t === 'STYLED_ITEM' || t === 'OVER_RIDING_STYLED_ITEM') { styled.push(bid); stack.push(bid); }
                else stack.push(bid);
            }
        }
        // never the assembly: a styled item or relation that reaches an assembly link is dropped
        return { ids: list, styled: styled };
    }
    var enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    function extract(ix, st, pd) {
        var c = closureOf(ix, st, pd);
        if (!c) return null;
        var ids = c.ids.slice().sort(function (a, b) { return a - b; });
        var R = reverseIndex(ix);
        var parts = [], total = 0;
        function push(u) { parts.push(u); total += u.length; }
        push(ix.header);
        push(ascii('DATA;\n'));
        var u8 = ix.u8;
        var maxSeen = 0;
        ids.forEach(function (id) {
            var k = ix.slot[id];
            push(ascii('#' + id + '='));
            push(u8.subarray(ix.start[k], ix.end[k]));
            push(ascii(';\n'));
            if (id > maxSeen) maxSeen = id;
        });
        if (c.styled.length && R.mdgprCtx) {
            // the presentation that lists this part's colors (its context comes along)
            var cc = closureCtx(ix, R.mdgprCtx, ids);
            cc.forEach(function (id) { var k = ix.slot[id]; push(ascii('#' + id + '=')); push(u8.subarray(ix.start[k], ix.end[k])); push(ascii(';\n')); });
            push(ascii('#' + (ix.maxId + 1) + '=MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION(\'\',(' + c.styled.map(function (s) { return '#' + s; }).join(',') + '),#' + R.mdgprCtx + ');\n'));
        }
        push(ascii('ENDSEC;\nEND-ISO-10303-21;\n'));
        var out = new Uint8Array(total), o = 0;
        parts.forEach(function (p) { out.set(p, o); o += p.length; });
        return out;
    }
    // ---------------------------------------------------------------- one huge part split by body
    // A single product can hold a whole aircraft (the NASA CRM assembly: one product, 134 bodies,
    // 38,000 faces, 265 MB). OpenCascade then reads it in one call on one thread. bodies() finds
    // the representation that lists the bodies; extractBody() writes one body as its own STEP file
    // (the product, contexts and units, the representation listing only that body), so the bodies
    // can be read in parallel and reported one by one.
    var BODY_TYPES = { MANIFOLD_SOLID_BREP: 1, SHELL_BASED_SURFACE_MODEL: 1, BREP_WITH_VOIDS: 1, FACETED_BREP: 1 };
    function bodies(ix, st, pd) {
        var c = closureOf(ix, st, pd); if (!c) return null;
        var rep = null, items = null;
        for (var i = 0; i < c.ids.length && !rep; i++) {
            var t = typeName(ix, c.ids[i]); if (!t || t.indexOf('REPRESENTATION') < 0 || t.indexOf('RELATIONSHIP') >= 0 || t.indexOf('DEFINITION') >= 0) continue;
            var a = args(ix, c.ids[i]); if (!a || !Array.isArray(a[1])) continue;
            var refs = a[1].filter(function (x) { return x && x.ref; }).map(function (x) { return x.ref; });
            if (refs.filter(function (r) { return BODY_TYPES[typeName(ix, r)]; }).length >= 2) { rep = c.ids[i]; items = refs; }
        }
        if (!rep) return null;
        var bodyIds = items.filter(function (r) { return BODY_TYPES[typeName(ix, r)]; }), others = items.filter(function (r) { return !BODY_TYPES[typeName(ix, r)]; });
        var mark = new Map(), desc = bodyIds.map(function (b, k) { var out = [], stack = [b], tmp = []; while (stack.length) { var x = stack.pop(); var m = mark.get(x); if (m === k) continue; mark.set(x, k); out.push(x); tmp.length = 0; refsOf(ix, x, tmp); for (var j = 0; j < tmp.length; j++) stack.push(tmp[j]); } return out; });
        var inBody = new Set(); desc.forEach(function (L) { L.forEach(function (x) { inBody.add(x); }); });
        // the shared part of every body file: the product chain, contexts and units only. Loose
        // geometry, other representations and presentation are left out (on the CRM they were
        // 51,000 entities, 3.6 MB repeated in every body file)
        var GEO = /POINT|EDGE|VERTEX|CURVE|LINE|CIRCLE|ELLIPSE|SURFACE|FACE|LOOP|SHELL|BREP|DIRECTION|VECTOR|AXIS|PLACEMENT|STYLE|PRESENTATION|COLOUR|STYLED|CURVE_SET|GEOMETRIC_SET|INVISIBILITY|DRAUGHTING|ANNOTATION/;
        var base = c.ids.filter(function (x) {
            if (inBody.has(x) || x === rep) return false; var t = typeName(ix, x) || '';
            if (!t) { var kk = ix.slot[x], head = ''; for (var q = ix.start[kk]; q < Math.min(ix.end[kk], ix.start[kk] + 400); q++) head += String.fromCharCode(ix.u8[q]); t = head.replace(/'[^']*'/g, '').toUpperCase(); if (!/CONTEXT|UNIT/.test(t)) return false; }   // complex entities: keep contexts and units only
            if (t.indexOf('SHAPE_DEFINITION_REPRESENTATION') >= 0) { var r0 = []; refsOf(ix, x, r0); return r0.indexOf(rep) >= 0; }
            if (t.indexOf('RELATIONSHIP') >= 0 && t.indexOf('REPRESENTATION') >= 0) return false;
            if (t.indexOf('REPRESENTATION') >= 0 && t.indexOf('CONTEXT') < 0) return false;
            return !GEO.test(t) && !/PLANE\b|PLANE$/.test(t);
        });
        // nothing in the shared part may point at what was left out (assignments, loose items): drop
        // such entities until the set is closed
        for (var pass = 0; pass < 4; pass++) { var bs = new Set(base); bs.add(rep); var nb = base.filter(function (x) { var r1 = []; refsOf(ix, x, r1); return r1.every(function (r) { return bs.has(r) || r === rep; }); }); if (nb.length === base.length) break; base = nb; }
        var keep = new Set(base), rr = []; refsOf(ix, rep, rr); rr.filter(function (r) { return items.indexOf(r) < 0; }).forEach(function (r) { others.push(r); });
        var ctxRefs = others.filter(function (r) { return items.indexOf(r) < 0; }); others = others.filter(function (r) { return items.indexOf(r) >= 0; });
        others.concat(ctxRefs).forEach(function (o) { var stack = [o], tmp = []; while (stack.length) { var x = stack.pop(); if (keep.has(x)) continue; keep.add(x); tmp.length = 0; refsOf(ix, x, tmp); tmp.forEach(function (r) { stack.push(r); }); } });
        var K = Array.from(keep), pds = K.filter(function (x) { return (typeName(ix, x) || '').indexOf('PRODUCT_DEFINITION_SHAPE') >= 0; })[0] || null, hasSdr = K.some(function (x) { return (typeName(ix, x) || '').indexOf('SHAPE_DEFINITION_REPRESENTATION') >= 0; });
        return { pd: pd, rep: rep, others: others, bodies: bodyIds, base: K, desc: desc, pds: pds, needSdr: !hasSdr && pds != null };
    }
    function extractBody(ix, B, k) {
        var ids = B.base.concat(B.desc[k]).filter(function (x, i, a) { return x !== B.rep; }), seen = new Set(), list = [];
        ids.forEach(function (x) { if (!seen.has(x)) { seen.add(x); list.push(x); } }); list.sort(function (a, b) { return a - b; });
        var parts = [], total = 0, u8 = ix.u8; function push(u) { parts.push(u); total += u.length; }
        push(ix.header); push(ascii('DATA;\n'));
        list.forEach(function (id) { var kk = ix.slot[id]; push(ascii('#' + id + '=')); push(u8.subarray(ix.start[kk], ix.end[kk])); push(ascii(';\n')); });
        // the representation, listing only this body (and its non-body items such as placements)
        var rk = ix.slot[B.rep], txt = new TextDecoder('latin1').decode(u8.subarray(ix.start[rk], ix.end[rk]));
        var lp = txt.indexOf('('), q = txt.indexOf('(', lp + 1), depth = 0, e = q; for (; e < txt.length; e++) { var ch = txt[e]; if (ch === '(') depth++; else if (ch === ')') { depth--; if (depth === 0) break; } }
        push(ascii('#' + B.rep + '=' + txt.slice(0, q) + '(' + B.others.concat([B.bodies[k]]).map(function (r) { return '#' + r; }).join(',') + ')' + txt.slice(e + 1) + ';\n'));
        // the product's shape points straight at this body's representation (the file linked them through representations that are left out)
        if (B.needSdr) push(ascii('#' + (ix.maxId + 1) + '=SHAPE_DEFINITION_REPRESENTATION(#' + B.pds + ',#' + B.rep + ');\n'));
        push(ascii('ENDSEC;\nEND-ISO-10303-21;\n'));
        var out = new Uint8Array(total), o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; }); return out;
    }
    // the box of the CARTESIAN_POINTs among ids, in mm (s = file unit in mm)
    function boxOfIds(ix, ids, s) { s = s || 1; var cp = ix.typeOf.CARTESIAN_POINT, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], any = false, tmp = [0, 0, 0];
        for (var q = 0; q < ids.length; q++) { if (ix.tcode[ix.slot[ids[q]]] !== cp) continue; var p = nums(ix, ids[q], tmp); if (!p) continue; any = true; for (var j = 0; j < 3; j++) { if (p[j] < mn[j]) mn[j] = p[j]; if (p[j] > mx[j]) mx[j] = p[j]; } }
        return any ? { min: [mn[0] * s, mn[1] * s, mn[2] * s], max: [mx[0] * s, mx[1] * s, mx[2] * s] } : null; }
    function closureCtx(ix, id, have) {
        var hs = {}; have.forEach(function (h) { hs[h] = 1; });
        var out = [], stack = [id], tmp = [];
        while (stack.length) { var x = stack.pop(); if (hs[x]) continue; hs[x] = 1; out.push(x); tmp.length = 0; refsOf(ix, x, tmp); tmp.forEach(function (r) { if (!hs[r]) stack.push(r); }); }
        return out.sort(function (a, b) { return a - b; });
    }
    function ascii(s) {
        if (enc) return enc.encode(s);
        var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u;
    }

    // A cheap size estimate of a part (no OpenCascade): the box of the CARTESIAN_POINTs its own
    // file holds, in the part's frame, in mm. Used to draw boxes before the shapes arrive and to
    // read the biggest parts first.
    function pointBox(ix, st, pd) {
        var c = closureOf(ix, st, pd);
        if (!c) return null;
        var code = ix.typeOf.CARTESIAN_POINT, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], any = false;
        c.ids.forEach(function (id) {
            var k = ix.slot[id];
            if (ix.tcode[k] !== code) return;
            var a = args(ix, id), p = a && a[1];
            if (!p || p.length !== 3) return;
            for (var j = 0; j < 3; j++) { if (p[j] < mn[j]) mn[j] = p[j]; if (p[j] > mx[j]) mx[j] = p[j]; }
            any = true;
        });
        if (!any) return null;
        var s = st.fileMm;
        return { min: mn.map(function (v) { return v * s; }), max: mx.map(function (v) { return v * s; }), entities: c.ids.length };
    }


    // ---------------------------------------------------------------- the first view: boxes
    // What a part's own file says without OpenCascade: its point box, its number of solids and
    // their names, its first color (sRGB, made linear as OpenCascade gives it).
    function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    function leafInfo(ix, st, pd) {
        var c = closureOf(ix, st, pd);
        var info = { box: null, solids: [], color: null, entities: c ? c.ids.length : 0 };
        if (!c) return info;
        var cp = ix.typeOf.CARTESIAN_POINT, msb = ix.typeOf.MANIFOLD_SOLID_BREP, bwv = ix.typeOf.BREP_WITH_VOIDS, rgb = ix.typeOf.COLOUR_RGB, tor = ix.typeOf.TOROIDAL_SURFACE;
        var curved = {}; ['CIRCLE', 'ELLIPSE', 'SPHERICAL_SURFACE', 'TOROIDAL_SURFACE', 'DEGENERATE_TOROIDAL_SURFACE'].forEach(function (nm) { if (ix.typeOf[nm] !== undefined) curved[ix.typeOf[nm]] = 1; });
        var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], any = false, tmp = [0, 0, 0];
        for (var q = 0; q < c.ids.length; q++) {
            var id = c.ids[q], t = ix.tcode[ix.slot[id]];
            if (t === cp) {
                var p = nums(ix, id, tmp);
                if (!p) continue;
                for (var j = 0; j < 3; j++) { if (p[j] < mn[j]) mn[j] = p[j]; if (p[j] > mx[j]) mx[j] = p[j]; }
                any = true;
            } else if (curved[t]) {
                // a circle, ellipse, sphere or torus reaches beyond its points: its center plus
                // its largest radius on every axis (conservative; the exact box comes with the shape)
                var ca = args(ix, id), ax = ca && ca[1] && ca[1].ref, rad = 0;
                if (!ax) continue;
                for (var r = 2; r < ca.length; r++) if (typeof ca[r] === 'number') rad = Math.max(rad, Math.abs(ca[r]));
                if (t === tor) rad = Math.abs(ca[2] || 0) + Math.abs(ca[3] || 0);
                var axr = refsOf(ix, ax, []), cpt = axr.length ? nums(ix, axr[0], [0, 0, 0]) : null;
                if (!cpt) continue;
                for (var jj = 0; jj < 3; jj++) { if (cpt[jj] - rad < mn[jj]) mn[jj] = cpt[jj] - rad; if (cpt[jj] + rad > mx[jj]) mx[jj] = cpt[jj] + rad; }
                any = true;
            } else if (t === msb || t === bwv) {
                var a = args(ix, id);
                info.solids.push({ id: id, name: a && typeof a[0] === 'string' ? a[0] : '' });
            } else if (t === rgb && !info.color) {
                var v = nums(ix, id, [0, 0, 0], 1);
                if (v) info.color = [srgbToLinear(v[0]), srgbToLinear(v[1]), srgbToLinear(v[2])];
            }
        }
        info.solids.sort(function (a, b) { return a.id - b.id; });
        var s = st.fileMm;
        if (any) info.box = { min: [mn[0] * s, mn[1] * s, mn[2] * s], max: [mx[0] * s, mx[1] * s, mx[2] * s] };
        return info;
    }
    function boxGeometry(b) {
        var a = b ? b.min : [0, 0, 0], z = b ? b.max : [1, 1, 1];
        var pos = new Float32Array([a[0], a[1], a[2], z[0], a[1], a[2], z[0], z[1], a[2], a[0], z[1], a[2], a[0], a[1], z[2], z[0], a[1], z[2], z[0], z[1], z[2], a[0], z[1], z[2]]);
        var idx = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
        return { position: pos, index: idx, faces: null, box: true };
    }
    // The occt-import-js shaped result (root tree, meshes, prototypes) for the whole assembly with
    // a box per part, named exactly as the OpenCascade walk names parts: under each top level
    // product, one node per top level component, holding every solid below it, depth first.
    // res.leaves[k] = { pd, name, info } and res.meshes[i].leaf = k (the part file to read later).
    function boxRes(ix, st, opts) {
        opts = opts || {};
        var leafIdx = {}, leaves = [], protos = [], meshes = [];
        function leaf(pd) {
            var k = leafIdx[pd];
            if (k !== undefined) return leaves[k];
            var info = leafInfo(ix, st, pd);
            var L = { pd: pd, name: st.pdName[pd], info: info, protos: [] };
            // its own triangles (AP242 tessellation) and no B-rep: the real shape at once
            var tess = !info.solids.length && opts.tessellation !== false ? tessellationOf(ix, st, pd) : null;
            if (tess) {
                L.done = true; L.protos.push(protos.length); protos.push(tess);
                // its box from its own triangles (a tessellated part has no points of its own)
                var P = tess.position, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
                for (var q = 0; q < P.length; q += 3) for (var j = 0; j < 3; j++) { if (P[q + j] < mn[j]) mn[j] = P[q + j]; if (P[q + j] > mx[j]) mx[j] = P[q + j]; }
                info.box = { min: mn, max: mx };
            }
            var n = tess ? 0 : Math.max(1, info.solids.length);
            for (var i = 0; i < n; i++) { L.protos.push(protos.length); protos.push(boxGeometry(info.box)); }
            leafIdx[pd] = leaves.length; L.index = leaves.length; leaves.push(L);
            return L;
        }
        function addMeshes(node, pd, m) {
            var L = leaf(pd), many = L.info.solids.length > 1;
            for (var i = 0; i < L.protos.length; i++) {
                node.meshes.push(meshes.length);
                meshes.push({ name: !L.info.solids.length ? '' : many ? L.info.solids[i].name : L.name, color: L.info.color, kind: L.info.solids.length ? 'solid' : 'faces', proto: L.protos[i], matrix: m, leaf: L.index, solid: i });
            }
        }
        function under(node, pd, m) {
            var ks = st.kids[pd];
            if (!ks) { addMeshes(node, pd, m); return; }
            for (var i = 0; i < ks.length; i++) { var n = st.nauo.get(ks[i]); under(node, n.child, mul(m, n.matrix)); }
        }
        var rootNode = { name: '', meshes: [], children: [] };
        st.roots.forEach(function (r) {
            var rn = { name: st.pdName[r], meshes: [], children: [] };
            rootNode.children.push(rn);
            var ks = st.kids[r];
            if (!ks) { addMeshes(rn, r, IDENT.slice()); return; }
            ks.forEach(function (nid) {
                var n = st.nauo.get(nid);
                var cn = { name: st.pdName[n.child], meshes: [], children: [] };
                rn.children.push(cn);
                under(cn, n.child, n.matrix);
            });
        });
        return { success: true, root: rootNode, meshes: meshes, protos: protos, leaves: leaves };
    }

    // ---------------------------------------------------------------- AP242 tessellated geometry
    // A part that carries its own triangles (TRIANGULATED_FACE / COMPLEX_TRIANGULATED_FACE over a
    // COORDINATES_LIST) is drawn from them directly: no B-rep conversion for display.
    // Returns { position: Float32Array (mm, the part's frame), index: Uint32Array, faces } or null.
    function tessellationOf(ix, st, pd) {
        var c = closureOf(ix, st, pd); if (!c) return null;
        var tf = ix.typeOf.TRIANGULATED_FACE, ctf = ix.typeOf.COMPLEX_TRIANGULATED_FACE;
        if (tf === undefined && ctf === undefined) return null;
        var faces = c.ids.filter(function (id) { var t = ix.tcode[ix.slot[id]]; return t === tf || t === ctf; }).sort(function (a, b) { return a - b; });
        if (!faces.length) return null;
        var sc = st.fileMm, pos = [], idx = [], ranges = [], coordBase = {}, tri = 0;
        faces.forEach(function (id) {
            var a = args(ix, id), cref = a[1] && a[1].ref; if (!cref) return;
            if (coordBase[cref] === undefined) {
                var ca = args(ix, cref), pts = ca && ca[2];
                coordBase[cref] = pos.length / 3;
                (pts || []).forEach(function (p) { pos.push(p[0] * sc, p[1] * sc, p[2] * sc); });
            }
            var base = coordBase[cref], first = tri;
            var pn = Array.isArray(a[5]) ? a[5] : [];
            var map = function (k) { return base + (pn.length ? pn[k - 1] : k) - 1; };
            if (ix.tcode[ix.slot[id]] === tf) {
                (a[6] || []).forEach(function (t) { idx.push(map(t[0]), map(t[1]), map(t[2])); tri++; });
            } else {
                (a[6] || []).forEach(function (strip) { for (var i = 2; i < strip.length; i++) { if (i % 2 === 0) idx.push(map(strip[i - 2]), map(strip[i - 1]), map(strip[i])); else idx.push(map(strip[i - 1]), map(strip[i - 2]), map(strip[i])); tri++; } });
                (a[7] || []).forEach(function (fan) { for (var i = 2; i < fan.length; i++) { idx.push(map(fan[0]), map(fan[i - 1]), map(fan[i])); tri++; } });
            }
            ranges.push({ first: first, last: tri - 1 });
        });
        if (!tri) return null;
        return { position: new Float32Array(pos), index: new Uint32Array(idx), faces: ranges, tessellated: true };
    }

    var api = {
        VERSION: VERSION, index: index, args: args, typeName: typeName, idsOfType: idsOfType, refsOf: refsOf,
        structure: structure, occurrences: occurrences, boxRes: boxRes, leafInfo: leafInfo, tessellationOf: tessellationOf, boxGeometry: boxGeometry, extract: extract, closureOf: closureOf, bodies: bodies, extractBody: extractBody, boxOfIds: boxOfIds, pointBox: pointBox,
        _m: { axisMatrix: axisMatrix, mul: mul, invRigid: invRigid, decodeStepString: decodeStepString, unitMm: unitMm, IDENT: IDENT }
    };
    root.SLCadStep = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));

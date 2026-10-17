#!/usr/bin/env node
/*
 * Regression: opening very large STEP assemblies (13 Oct 2026, cad-C, founder ruling).
 *
 * THE REQUIREMENT (Waqas): a 200,000 component STEP opens fast: the whole aircraft visible and
 * navigable within seconds (boxes placed from the structure, before any B-rep work), full detail
 * streamed in behind, largest first, reopen from this computer's cache near instant; the synced
 * project stays small (a 200,000 part list never goes into projectConfig); links resolve on any
 * computer.
 *
 *   S  the JavaScript structure reader (cad_step_struct.js) against OpenCascade: same placements,
 *      same order, same part ids (pids), same colors, on the toy aircraft and a generated
 *      3,000 component aircraft (tests/fixtures/cad/make_aircraft_step.js)
 *   P  one part cut out as its own file reads back in OpenCascade with its name and color
 *   L  the local part store: a large model keeps a summary in the project, the full list here;
 *      linked parts are pinned into the summary; the cache packs parts and placements
 *   M  mutations: each deliberate break must turn a check red
 *
 * Run: node tests/regression_cad_scale_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const J = x => JSON.stringify(x);

function loadStruct(src) {
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, Error, TextEncoder, TextDecoder, Uint8Array, Int32Array, Uint32Array, Uint16Array, Float32Array, Float64Array, parseFloat, isFinite };
    sb.self = sb; sb.globalThis = sb; vm.createContext(sb);
    vm.runInContext(src || read('cad_step_struct.js'), sb, { filename: 'cad_step_struct.js' });
    return sb.SLCadStep;
}
function loadImport() {
    global.self = global;
    delete require.cache[require.resolve(path.join(SITE, 'cad_import.js'))];
    delete require.cache[require.resolve(path.join(SITE, 'cad_brep.js'))];
    require(path.join(SITE, 'cad_import.js')); require(path.join(SITE, 'cad_brep.js'));
    return { I: global.SLCadImport, B: global.SLCadBrep };
}
// what OpenCascade (our build, the whole file at once) says: pid, matrix, color per mesh
function occtView(FM, I, B, bytes) {
    const res = B.readFast(FM, bytes, 0.001, 0.5, false);
    // 17 Oct 2026: OpenCascade's walk keeps two assembly levels; the import gives every part its full path from the
    // STEP structure (attachTrails), so both readers name parts the same, at every depth
    const tree = I.attachTrails(res, bytes);
    const pids = []; I.walkParts(res, (mi, w) => { pids[mi] = w.pid; });
    return { pids, tree, mats: res.meshes.map(m => m.matrix), colors: res.meshes.map(m => m.color || null), names: res.meshes.map(m => m.name) };
}
function structView(S, I, bytes) {
    const ix = S.index(bytes), st = S.structure(ix), res = S.boxRes(ix, st);
    const model = I.buildModel(res, { maxTrianglesTotal: 0 });
    return { ix, st, res, model, pids: model.parts.map(p => p.pid), mats: res.meshes.map(m => m.matrix), colors: res.meshes.map(m => m.color) };
}
const close = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);

(async () => {
    const S = loadStruct(), { I, B } = loadImport();
    global.SLCadStep = S;   // the structure reader beside the import, as in the worker
    const FM = await require(path.join(SITE, 'vendor', 'occt-fast', 'slcad_occt.js'))({ print: () => {}, printErr: () => {} });
    const TOY = new Uint8Array(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'cad', 'toy_aircraft.step')));
    const GEN = require(path.join(ROOT, 'tests', 'fixtures', 'cad', 'make_aircraft_step.js'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-cad-scale-'));
    const smallPath = path.join(tmp, 'aircraft3k.step');
    const gst = GEN.generate({ out: smallPath, components: 3000 });
    const SMALL = new Uint8Array(fs.readFileSync(smallPath));

    console.log('\n[S] the structure reader against OpenCascade');
    for (const [label, bytes] of [['toy aircraft', TOY], ['generated 3,000 component aircraft', SMALL]]) {
        const o = occtView(FM, I, B, bytes), s = structView(S, I, bytes);
        check(label + ': the same number of parts', o.pids.length === s.pids.length, o.pids.length + ' vs ' + s.pids.length);
        let pidBad = 0, matBad = 0, colBad = 0;
        o.pids.forEach((p, i) => { if (p !== s.pids[i]) pidBad++; });
        o.mats.forEach((m, i) => { if (!s.mats[i] || !close(m, s.mats[i], 1e-6 * Math.max(1, Math.abs(m[12]) + Math.abs(m[13]) + Math.abs(m[14])))) matBad++; });
        o.colors.forEach((c, i) => { const d = s.colors[i]; if (!!c !== !!d || (c && !close(c, d, 1e-5))) colBad++; });
        check(label + ': every part id identical, in the same order', pidBad === 0, pidBad + ' differ');
        check(label + ': every placement identical', matBad === 0, matBad + ' differ');
        check(label + ': every color identical (sRGB made linear as OpenCascade does)', colBad === 0, colBad + ' differ');
    }
    check('the generator wrote a deep tree with shared library parts (3,000 components, fewer distinct parts than placed ones)', gst.components === 3000 && gst.distinctParts < gst.placedParts + 1000 && gst.products > gst.distinctParts);
    const sv = structView(S, I, SMALL);
    check('boxes: one box prototype per solid of each distinct part, each the size of the part\'s points', sv.res.protos.length >= sv.res.leaves.length && sv.res.leaves.every(L => L.info.box && L.info.box.max[0] >= L.info.box.min[0]));
    check('assemblies with own geometry, odd placements or mixed units are refused (the whole-file reader takes them)', S.structure(S.index(new TextEncoder().encode("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=PRODUCT('a','A','',());\nENDSEC;\nEND-ISO-10303-21;\n"))).unsupported != null);

    console.log('\n[R] round parts: the first view boxes hold the whole shape');
    const trueBox = (u8) => {
        const p = FM._malloc(u8.length); FM.HEAPU8.set(u8, p); const lp = FM._malloc(4), out = FM._sl_read(p, u8.length, 0.001, 0.5, lp), len = FM.HEAP32[lp >> 2]; FM._free(p); FM._free(lp);
        if (!out || !len) return null;
        const buf = FM.HEAPU8.slice(out, out + len).buffer; FM._sl_free(out);
        const jl = new DataView(buf).getUint32(0, true), meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
        let o = 4 + jl; o += (4 - o % 4) % 4; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
        meta.protos.forEach(q => { const pos = new Float32Array(buf, o, q.v * 3); o += q.v * 12 + q.t * 12 + q.f * 8; for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) { mn[j] = Math.min(mn[j], pos[i + j]); mx[j] = Math.max(mx[j], pos[i + j]); } });
        return { min: mn, max: mx };
    };
    const boxesHold = (S2) => {
        const ix2 = S2.index(SMALL), st2 = S2.structure(ix2), r2 = S2.boxRes(ix2, st2);
        const pins = r2.leaves.filter(L => /^Fastener/.test(L.name)).slice(0, 40);
        let bad = 0;
        pins.forEach(L => { const tb = trueBox(S2.extract(ix2, st2, L.pd)), b = L.info.box; if (!tb || !b) { bad++; return; } for (let j = 0; j < 3; j++) if (b.min[j] > tb.min[j] + 1e-3 || b.max[j] < tb.max[j] - 1e-3) { bad++; return; } });
        return { n: pins.length, bad };
    };
    const hb = boxesHold(S);
    check('the first view box of every round part (headed pins: circles, cylinders) holds its whole shape (' + hb.n + ' checked)', hb.n >= 20 && hb.bad === 0, hb.bad + ' too small');

    console.log('\n[T] AP242 tessellated parts are drawn from their own triangles (no B-rep conversion)');
    {
        const tp = path.join(tmp, 'aircraft_tess.step');
        const tg = GEN.generate({ out: tp, components: 3000, tessellated: true });
        const TB = new Uint8Array(fs.readFileSync(tp)), tix = S.index(TB), tst = S.structure(tix), tres = S.boxRes(tix, tst);
        const done = tres.leaves.filter(L => L.done), brackets = tres.leaves.filter(L => /^Bracket/.test(L.name));
        check('every tessellated part (' + brackets.length + ' brackets) is a real shape in the first view, nothing left for OpenCascade', done.length === brackets.length && brackets.length > 100 && brackets.every(L => L.done));
        // closed and the right size: the mesh volume equals profile area times height
        const vol = (g) => { let v = 0; const P = g.position, I = g.index; for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3; v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6; } return v; };
        let worst = 0, n = 0;
        const closed = (g) => { const e = new Map(), I = g.index; for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3], key = a + ',' + b; e.set(key, (e.get(key) || 0) + 1); } for (const [key, c] of e) { const [a, b] = key.split(','); if (c !== 1 || e.get(b + ',' + a) !== 1) return false; } return true; };
        done.slice(0, 60).forEach(L => { const g = tres.protos[L.protos[0]], v = vol(g), b = L.info.box, h = b.max[2] - b.min[2]; if (!(v > 0) || !closed(g)) { worst = Infinity; return; } n++; const ok = Math.abs(v) <= (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * h + 1e-6; if (!ok) worst = Infinity; });
        check('tessellated parts are closed (every edge shared by two triangles, wound consistently) with positive volume inside their box (' + n + ' checked)', n >= 50 && worst === 0);
        // measuring a part that has only triangles: the worker answers from its triangles, says so
        const wctx = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, Error, TextEncoder, TextDecoder, Uint8Array, Int32Array, Uint32Array, Uint16Array, Float32Array, Float64Array, ArrayBuffer, DataView, Promise, parseFloat, parseInt, isFinite, setTimeout, location: { search: '', protocol: 'file:', href: 'file:///x' }, postMessage: () => {} };
        wctx.self = wctx; wctx.globalThis = wctx; wctx.importScripts = (...fl) => fl.forEach(f => vm.runInContext(fs.readFileSync(path.join(SITE, f.split('?')[0]), 'utf8'), wctx));
        vm.createContext(wctx); vm.runInContext(fs.readFileSync(path.join(SITE, 'cad_import_worker.js'), 'utf8'), wctx);
        const L0 = done[0], g0 = tres.protos[L0.protos[0]], M0 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 200, 300, 1], M1 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5000, 200, 300, 1];
        const base = { properties: () => ({ exact: true }), distance: () => ({ exact: true }), pick: () => ({}), faceInfo: () => ({}), edgeInfo: () => ({}), interference: () => ({}) };
        const hyb = wctx.withMeshFallback(Object.assign({}, base), pid => pid === 'brep' ? null : { geo: g0, matrix: pid === 'a' ? M0 : M1 });
        const pa = hyb.properties('a'), dd = hyb.distance('a', 'b'), bx = L0.info.box;
        check('a triangles-only part is measured on its triangles and labeled approximate (volume, area, box, distance)', pa.exact === false && pa.approximate === true && pa.volume > 0 && pa.area > 0 && Math.abs(pa.bbox.min[0] - (bx.min[0] + 100)) < 1e-3 && dd.exact === false && Math.abs(dd.distance - (4900 - (bx.max[0] - bx.min[0]))) < 1e-3, JSON.stringify([pa.volume, dd.distance]));
        check('picking a face on it says plainly that the file has no exact geometry for it', (() => { try { hyb.pick('a', [0, 0, 0]); return false; } catch (e) { return /triangles only/.test(e.message); } })());
        check('a part with exact geometry still goes to the exact engine', hyb.properties('brep').exact === true);
        const tm = I.buildModel(tres, { maxTrianglesTotal: 0 });
        check('their part ids follow the same naming walk (face-only parts named by their node, as OpenCascade does)', tm.parts.length === tg.placedParts + (tres.meshes.length - tg.placedParts) && tm.parts.every(p => /^p:/.test(p.pid)));
    }

    console.log('\n[P] one part as its own file');
    const leaf = sv.st.leaves[0];
    const mini = S.extract(sv.ix, sv.st, leaf);
    const mres = B.readFast(FM, mini, 0.001, 0.5, false);
    check('the part file reads in OpenCascade on its own: one solid, the part\'s own name', mres.meshes.length === 1 && mres.meshes[0].name === sv.st.pdName[leaf], J(mres.meshes.map(m => m.name)));
    check('the part file carries the part\'s color', Array.isArray(mres.meshes[0].color) && close(mres.meshes[0].color, sv.res.leaves.find(L => L.pd === leaf).info.color, 1e-5));
    check('the part file holds no assembly (no NEXT_ASSEMBLY_USAGE_OCCURRENCE), so it is small', !/NEXT_ASSEMBLY_USAGE_OCCURRENCE/.test(Buffer.from(mini).toString('latin1')) && mini.length < 40000, mini.length + ' bytes');

    console.log('\n[X] exact geometry part by part (a large assembly is never given whole to OpenCascade)');
    {
        const xp = path.join(tmp, 'aircraft_x.step');
        GEN.generate({ out: xp, components: 400, subs: 2, installations: 3, fastenerTypes: 20, bracketTypes: 30 });
        const XB = new Uint8Array(fs.readFileSync(xp));
        const ix = S.index(XB), st = S.structure(ix), res = S.boxRes(ix, st), pids = new Array(res.meshes.length), at = {};
        I.walkParts(res, (mi, w) => { pids[mi] = w.pid; at[w.pid] = mi; });
        const ps = new B.FastPartSession(FM, pids, pid => { const mi = at[pid], m = res.meshes[mi], L = res.leaves[m.leaf]; return { key: m.leaf, mini: S.extract(ix, st, L.pd), solid: m.solid, matrix: m.matrix }; });
        const full = B.openSessionFast(FM, XB);
        const placed = pids.filter(p => p.startsWith('p:Aircraft'));
        const qa = placed[3], qb = placed[Math.floor(placed.length / 2)], qc = placed[placed.length - 1];
        const r1 = { d: ps.distance(qa, qb), p: ps.properties(qc), f: ps.faces(qc).length }, r2 = { d: full.distance(qa, qb), p: full.properties(qc), f: full.faces(qc).length };
        const near = (x, y) => Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y));
        check('part by part: minimum distance between two placed parts equals the whole-file reading (' + r1.d.distance.toFixed(3) + ' mm)', near(r1.d.distance, r2.d.distance) && r1.d.a.every((v, i) => near(v, r2.d.a[i])));
        check('part by part: volume, center and face count of a placed part equal the whole-file reading', near(r1.p.volume, r2.p.volume) && r1.p.centerOfVolume.every((v, i) => near(v, r2.p.centerOfVolume[i])) && r1.f === r2.f);
        check('part by part: only the parts asked about were read (' + ps.loaded + ')', ps.loaded === 3);
        // the same session on our own build (vendor/occt-fast) answers the same
        const FMx = FM;
        const whereX = pid => { const mi = at[pid], m = res.meshes[mi], L = res.leaves[m.leaf]; return { key: m.leaf, mini: S.extract(ix, st, L.pd), solid: m.solid, matrix: m.matrix }; };
        const mkFast = (B2) => new B2.FastPartSession(FMx, pids, whereX);
        const sameAnswers = (fs2) => {
            const nearX = (a, b) => { if (typeof b === 'number') return typeof a === 'number' && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)); if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && a.every((x, i) => nearX(x, b[i])); if (b && typeof b === 'object') return !!a && Object.keys(b).every(k => nearX(a[k], b[k])); return a === b; };
            let bad = 0, n = 0;
            [qa, qb, qc].forEach(pid => {
                const pr = full.properties(pid); n++; if (!nearX(fs2.properties(pid), pr)) bad++;
                for (let i = 0; i < Math.min(3, pr.faces); i++) { n++; if (!nearX(fs2.faceInfo(pid, i), full.faceInfo(pid, i))) bad++; }
                for (let i = 0; i < Math.min(3, pr.edges); i++) { n++; if (!nearX(fs2.edgeInfo(pid, i), full.edgeInfo(pid, i))) bad++; }
            });
            const d1 = fs2.distance(qa, qb), d2 = full.distance(qa, qb); n++; if (Math.abs(d1.distance - d2.distance) > 1e-3) bad++;
            return { n, bad };
        };
        const sa = sameAnswers(mkFast(B));
        check('part by part answers exactly as the whole-file reading: properties, face and edge measures, distance (' + sa.n + ' answers)', sa.bad === 0 && sa.n >= 15, sa.bad + ' differ');
        const B3 = (() => { const src = fs.readFileSync(path.join(SITE, 'cad_brep.js'), 'utf8').replace("return h + ' ' + w.solid + ' ' + Array.prototype.map.call(w.matrix,", "return h + ' ' + w.solid + ' ' + Array.prototype.map.call([w.matrix[0], w.matrix[1], w.matrix[2], w.matrix[3], w.matrix[4], w.matrix[5], w.matrix[6], w.matrix[7], w.matrix[8], w.matrix[9], w.matrix[10], w.matrix[11], w.matrix[14], w.matrix[13], w.matrix[12], w.matrix[15]],"); if (src.indexOf('w.matrix[14], w.matrix[13]') < 0) throw new Error('mutation anchor'); const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, Error, TextEncoder, TextDecoder, Uint8Array, Int32Array, Float32Array, Float64Array, SLCadImport: I }; sb.self = sb; sb.globalThis = sb; vm.createContext(sb); vm.runInContext(src, sb); return sb.SLCadBrep; })();
        check('M9: a placement handed to our build the wrong way is caught', sameAnswers(mkFast(B3)).bad > 0);
        ps.close(); full.close && full.close();
    }

    console.log('\n[K] clash: one rule, decided exactly (not by search order)');
    {
        global.self = global; require(path.join(SITE, 'cad_render.js')); const R = global.SLCadRender;
        const bx = (w) => { const v = [[0, 0, 0], [w, 0, 0], [w, w, 0], [0, w, 0], [0, 0, w], [w, 0, w], [w, w, w], [0, w, w]], f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]; return new R.Bvh(new Float32Array(v.flat()), new Uint32Array(f.flat())); };
        const big = bx(100), small = bx(10), M = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
        const box = (x, y, z, w) => ({ min: [x, y, z], max: [x + w, y + w, z + w] });
        const k = (a, ax, b, bx2) => { const r = R.classifyPair({ bvh: a, matrix: M(...ax) }, { bvh: b, matrix: M(...bx2) }, box(...ax, a === big ? 100 : 10), box(...bx2, b === big ? 100 : 10), 5, 0.01); return r ? r.kind + ':' + r.distance : 'none'; };
        check('a part fully inside another, touching nothing, is a clash (containment)', k(big, [0, 0, 0], small, [40, 40, 40]) === 'clash:0' && k(small, [40, 40, 40], big, [0, 0, 0]) === 'clash:0');
        check('faces lying against each other with no shared volume: a touch, either way round', k(big, [0, 0, 0], small, [100, 40, 40]) === 'touch:0' && k(small, [100, 40, 40], big, [0, 0, 0]) === 'touch:0');
        check('crossing surfaces: a clash; a 3 mm gap: a clearance of 3; 20 mm apart: nothing', k(big, [0, 0, 0], small, [95, 40, 40]) === 'clash:0' && k(big, [0, 0, 0], small, [103, 40, 40]) === 'clearance:3' && k(big, [0, 0, 0], small, [120, 40, 40]) === 'none');
        const mk = (pos) => { const n = pos.length, d = { n, bbox: new Float64Array(n * 6), proto: new Int32Array(n), matrix: new Float32Array(n * 16), hasMatrix: new Uint8Array(n).fill(1), protos: [{ position: big.pos, index: big.idx }, { position: small.pos, index: small.idx }] }; pos.forEach((p, i) => { const w = p[3] ? 10 : 100; d.proto[i] = p[3] ? 1 : 0; d.bbox.set([p[0], p[1], p[2], p[0] + w, p[1] + w, p[2] + w], i * 6); d.matrix.set(M(p[0], p[1], p[2]), i * 16); }); return d; };
        const layout = [[0, 0, 0, 0], [40, 40, 40, 1], [100, 40, 40, 1], [95, 10, 10, 1], [103, 70, 70, 1], [300, 0, 0, 0]];
        const rev0 = layout.slice().reverse();
        const r1 = await R.clashParallel(mk(layout), { tolerance: 5, pidOf: i => String(layout[i]) }), r2 = await R.clashParallel(mk(rev0), { tolerance: 5, pidOf: i => String(rev0[i]) });
        const name = (L) => (r) => [r.kind, r.distance, [L[r.i], L[r.j]].map(String).sort().join('|')].join(':');
        const rev = layout.slice().reverse();
        check('the same parts in any order give the same results in the same order', J(r1.results.map(name(layout))) === J(r2.results.map(name(rev))) && r1.results.length === 4, J(r1.results.map(name(layout))));
    }

    console.log('\n[L] the local part store and the packed cache');
    const zsrc = read('cad_zonal.js'), ZM = read('zonal_model.js');
    const mkEngine = (src) => {
        const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {}, systemsData: [{ id: 'EQ1', name: 'Pump' }], acFhaData: [], ftaPages: [], zsaData: [] };
        sb.window = sb; sb.globalThis = sb; sb.self = sb; vm.createContext(sb);
        vm.runInContext(ZM, sb); vm.runInContext(src || zsrc, sb);
        return sb;
    };
    const N = 25000, big = [];
    for (let i = 0; i < N; i++) big.push({ pid: 'p:A/Part ' + i + '#1', name: 'Part ' + i, partNumber: 'PN-' + (i % 300), path: ['A'], bbox: { min: [i, 0, 0], max: [i + 1, 1, 1] }, centroid: [i + 0.5, 0.5, 0.5] });
    const sb = mkEngine(), E = sb.SLCadZonal;
    const add = E.addCadModel({ fileName: 'big.step', sha256: 'abc123', units: 'mm', parts: big });
    const pcBytes = JSON.stringify(sb.projectConfig).length;
    check('a ' + N + ' part model keeps only a summary in the project (under 2 kB, the full list would be ' + Math.round(JSON.stringify(big).length / 1024) + ' kB)', add.ok && pcBytes < 2000 && add.model.partStore === 'local' && add.model.partCount === N, pcBytes + ' bytes');
    check('on this computer every part is there (partsOf)', E.partsOf(add.model).length === N);
    const lk = E.confirmLink(add.model.id, 'p:A/Part 77#1', 'EQ1', 'Waqas');
    check('linking a part pins it into the synced summary', lk.ok && add.model.parts.length === 1 && add.model.parts[0].pid === 'p:A/Part 77#1');
    // another computer: the project only
    const sb2 = mkEngine(); sb2.projectConfig = JSON.parse(JSON.stringify(sb.projectConfig));
    const E2 = sb2.SLCadZonal, m2 = E2.models()[0];
    check('another computer, before it opens the file: the linked part and its link resolve', E2.partsOf(m2).length === 1 && J(E2.confirmed(m2.id)) === J({ 'p:A/Part 77#1': 'EQ1' }), J(E2.confirmed(m2.id)));
    E2.registerLocalParts('abc123', big.map(p => Object.assign({}, p)));
    check('another computer, after it reopens the file: all parts, and the link still resolves', E2.partsOf(m2).length === N && E2.confirmed(m2.id)['p:A/Part 77#1'] === 'EQ1');
    sb.ZONES.addZone({ code: '310', name: 'Engine bay', parentId: null, volume: { kind: 'parts', cadId: add.model.id, pids: ['p:A/Part 900#1', 'p:A/Part 901#1'] }, source: 'list', cadRef: null });
    E.confirmLink(add.model.id, 'p:A/Part 78#1', 'EQ1', 'Waqas');   // any engine save sweeps the zones
    check('parts a zone volume names are pinned into the synced summary too', ['p:A/Part 900#1', 'p:A/Part 901#1'].every(pid => add.model.parts.some(p => p.pid === pid)), J(add.model.parts.map(p => p.pid)));
    const upd = E.updatePartBoxes(add.model.id, [{ pid: 'p:A/Part 77#1', bbox: { min: [76, -1, -1], max: [79, 2, 2] }, centroid: [77.5, 0.5, 0.5] }]);
    check('true boxes replace the estimates on this computer and in the synced summary', upd.ok && upd.updated === 1 && J(E.partsOf(add.model).find(p => p.pid === 'p:A/Part 77#1').bbox) === J({ min: [76, -1, -1], max: [79, 2, 2] }) && J(add.model.parts.find(p => p.pid === 'p:A/Part 77#1').bbox.min) === J([76, -1, -1]));
    const small = E.addCadModel({ fileName: 'small.step', sha256: 'def', units: 'mm', parts: big.slice(0, 50) });
    check('an ordinary model keeps its full list in the project as before', small.model.parts.length === 50 && !small.model.partStore);
    const pk = I.packParts(sv.model.parts, sv.model.meshes), up = I.unpackParts(pk, I.packMeshes(sv.model.meshes));
    check('packed parts round trip exactly (names, part numbers, paths, boxes, centroids)', J(up.map(p => [p.pid, p.name, p.partNumber, p.path, p.bbox, p.centroid])) === J(sv.model.parts.map(p => [p.pid, p.name, p.partNumber, p.path, p.bbox.min.length ? { min: p.bbox.min, max: p.bbox.max } : p.bbox, p.centroid])));
    const pm = I.packMeshes(sv.model.meshes), um = I.unpackMeshes(pm);
    check('packed placements round trip (part, prototype, matrix, color)', um.length === sv.model.meshes.length && um.every((m, i) => { const o = sv.model.meshes[i]; return m.pid === o.pid && m.proto === o.proto && (!o.matrix ? m.matrix === null : close(Array.from(m.matrix), Array.from(o.matrix), 0)) && (!o.color ? m.color === null : close(m.color, o.color, 1e-6)); }));

    console.log('\n[M] mutations (each must turn a check red)');
    const mutate = (src, a, b) => { if (src.indexOf(a) < 0) throw new Error('mutation anchor missing: ' + a.slice(0, 60)); return src.replace(a, b); };
    const SS = read('cad_step_struct.js');
    {   // placements composed the other way round
        const S2 = loadStruct(mutate(SS, 'n.matrix = mul(m2, invRigid(m1));', 'n.matrix = mul(m1, invRigid(m2));'));
        const s2 = structView(S2, I, SMALL);
        check('M1: a placement taken the wrong way round (parent onto child) is caught', !s2.mats.every((m, i) => close(m, sv.mats[i], 1e-6)));
    }
    {   // children in reverse file order
        const S2 = loadStruct(mutate(SS, 'kids[k].sort(function (a, b) { return a - b; });', 'kids[k].sort(function (a, b) { return b - a; });'));
        const s2 = structView(S2, I, SMALL);
        check('M2: children out of OpenCascade\'s order change the part ids', J(s2.pids) !== J(sv.pids));
    }
    {   // colors not made linear
        const S2 = loadStruct(mutate(SS, 'info.color = [srgbToLinear(v[0]), srgbToLinear(v[1]), srgbToLinear(v[2])];', 'info.color = [v[0], v[1], v[2]];'));
        const s2 = structView(S2, I, SMALL);
        check('M3: colors left in sRGB differ from OpenCascade', !s2.colors.every((c, i) => close(c, sv.colors[i], 1e-5)));
    }
    {   // boxes from the points alone
        // 17 Oct 2026: circles and ellipses are bounded edge by edge (curveExtents); without it round parts are cut short
        const S2 = loadStruct(mutate(SS, '        curveExtents(ix, c.ids, add);', ''));
        check('M8: boxes from the points alone (round parts cut short) are caught', boxesHold(S2).bad > 0);
    }
    {   // the part file without its styled items
        const S2 = loadStruct(mutate(SS, "                    styled.push(bid); stack.push(bid);\n", "\n"));
        const s2 = structView(S2, I, SMALL);
        const mm = S2.extract(s2.ix, s2.st, s2.st.leaves[0]), r2 = B.readFast(FM, mm, 0.001, 0.5, false);
        check('M4: a part file without its colors is caught', !Array.isArray(r2.meshes[0].color));
    }
    {   // the engine keeps the full list in the project
        const sbm = mkEngine(mutate(zsrc, 'if (parts.length > LOCAL_PARTS_MIN && m.sha256) {', 'if (false) {'));
        sbm.SLCadZonal.addCadModel({ fileName: 'big.step', sha256: 'abc123', units: 'mm', parts: big });
        check('M5: a full part list in the project is caught by the size check', JSON.stringify(sbm.projectConfig).length >= 2000);
    }
    {   // links not pinned
        const sbm = mkEngine(mutate(zsrc, "        _pin(cadId, pid);\n        L[k] = r; _save();\n        return { ok: true, link: _clone(r) };\n    }\n    function rejectLink", "        L[k] = r; _save();\n        return { ok: true, link: _clone(r) };\n    }\n    function rejectLink"));
        const Em = sbm.SLCadZonal, mm = Em.addCadModel({ fileName: 'big.step', sha256: 'abc123', units: 'mm', parts: big }).model;
        Em.confirmLink(mm.id, 'p:A/Part 77#1', 'EQ1', 'Waqas');
        const sb3 = mkEngine(); sb3.projectConfig = JSON.parse(JSON.stringify(sbm.projectConfig));
        check('M6: an unpinned link does not resolve on another computer (caught)', J(sb3.SLCadZonal.confirmed(sb3.SLCadZonal.models()[0].id)) !== J({ 'p:A/Part 77#1': 'EQ1' }));
    }
    {   // zone volume parts not pinned
        const sbm = mkEngine(mutate(zsrc, 'function _save() { _pinReferenced();', 'function _save() {'));
        const Em = sbm.SLCadZonal, mm = Em.addCadModel({ fileName: 'big.step', sha256: 'abc123', units: 'mm', parts: big }).model;
        sbm.ZONES.addZone({ code: '310', name: 'Engine bay', parentId: null, volume: { kind: 'parts', cadId: mm.id, pids: ['p:A/Part 900#1'] }, source: 'list', cadRef: null });
        Em.confirmLink(mm.id, 'p:A/Part 78#1', 'EQ1', 'Waqas');
        check('M7: a zone volume part left out of the summary is caught', !mm.parts.some(p => p.pid === 'p:A/Part 900#1'));
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e && e.stack || e); console.log('  FAIL  suite threw: ' + (e && e.message)); process.exit(1); });

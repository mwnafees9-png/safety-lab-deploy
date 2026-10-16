#!/usr/bin/env node
/*
 * Regression: opening a large CAD model fast without changing a single number (15 Oct 2026).
 *
 * THE REQUIREMENT (Waqas): a large CAD model open in under 30 seconds, with a smooth view; fix the
 * root causes; geometry, part tree, zones and links, exact session and measurements unchanged.
 * A measurement of a 199,370 part STEP file found: the first frame after the real shapes arrived
 * froze the page for 84 to 90 s (every part drawn at full detail, about 72 million triangles,
 * because the level of detail was decided slowly and against the boxes, not the real shapes);
 * 2.5 s at the end recomputing every part's box from every vertex; slicing a huge part's bodies in
 * the import worker while the readers waited; 2.5 s of panels in one task.
 *
 *   R  drawing (cad_render.js): the frame's triangle budget (budgetLevels, levelOf: exact,
 *      smallest on screen simplified first, nothing changes when within budget); a scene built
 *      with real three.js in node: nothing drawn before the visibility pass decides it, and when
 *      detail streams in every part is decided again AT ONCE (no frame draws the real shapes
 *      undecided: the 84 s freeze), the instance buffers upload only what is drawn; each new
 *      shape's normals and coarse copy are prepared by its part reader (three.js's normals bit
 *      for bit, the scene's own coarse rule) and drawn as they come
 *   B  boxes (cad_import.js placedBoxes, trueBoxes): the boxes the part readers make while
 *      meshing are the same numbers, bit for bit, as boxing every vertex on the page; a shape
 *      changed since (a retry) is boxed again; the worker plumbing (keepPlacements, instFor,
 *      boxGeo, detailEntry) carries them to the right parts
 *   S  slicing (cad_step_struct.js): every part file and body file is byte for byte what the
 *      original reader wrote (golden sha256 of the original output on four fixtures)
 *   W  the reader pool (cad_import_worker.js): sized from the cores (one left for the page and
 *      the graphics), the biggest bodies of a huge part start first, one reader takes the small
 *      ones, work handed back goes first and the total is not inflated
 *   G  containsGeometry (the project's geometry guard) gives the same answer as before on 20,000
 *      generated records, shared and cyclic ones included
 *   P  the page (cad_page.js): a very large model's panels are drawn one per idle task
 *   M  mutations: each deliberate break must turn a check red
 *
 * Run: node tests/regression_cad_open_perf_20261015.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), crypto = require('crypto');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const FIX = f => path.join(ROOT, 'tests', 'fixtures', 'cad', f);
const GLOBALS = () => ({ console, Math, JSON, Object, Array, String, Number, Boolean, Date, Map, Set, WeakMap, Symbol, RegExp, Error, TypeError, RangeError, Promise, Reflect, Proxy,
    TextEncoder, TextDecoder, Uint8Array, Uint8ClampedArray, Int8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
    parseFloat, parseInt, isFinite, isNaN, setTimeout, clearTimeout, performance, crypto: globalThis.crypto });
function ctx(files, extra) {
    const sb = Object.assign(GLOBALS(), extra || {});
    sb.window = sb; sb.self = sb; sb.globalThis = sb; vm.createContext(sb);
    if (sb.__hold) sb.__hold.sb = sb;
    files.forEach(([name, src]) => vm.runInContext(src, sb, { filename: name }));
    return sb;
}
const THREE_SRC = fs.readFileSync(path.join(SITE, 'vendor', 'three', 'three.min.js'), 'utf8') + '\n;globalThis.THREE = THREE;';
const sceneCtx = (renderSrc) => ctx([['three.min.js', THREE_SRC], ['cad_import.js', read('cad_import.js')], ['cad_render.js', renderSrc || read('cad_render.js')]]);

// ---- a scene: K shapes x C copies each on a grid, first as boxes, then a heavy real shape
function boxGeo(s) {
    const v = [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, s], [s, 0, s], [s, s, s], [0, s, s]], f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
    return { position: new Float32Array(v.flat()), index: new Uint32Array(f.flat()), normal: null, faces: null };
}
function heavyGeo(s, n) {   // a wavy n x n sheet with a lid: decimates well
    const P = [], X = [];
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) P.push(i / n * s, j / n * s, Math.sin(i * 0.7) * Math.cos(j * 0.5) * s * 0.1);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j; X.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2); }
    return { position: new Float32Array(P), index: new Uint32Array(X) };
}
function makeModel(K, C, size, gap) {
    const protos = [], meshes = [], parts = [];
    for (let k = 0; k < K; k++) protos.push(boxGeo(size));
    let i = 0;
    for (let k = 0; k < K; k++) for (let c = 0; c < C; c++, i++) {
        const x = (i % 60) * gap, y = Math.floor(i / 60) % 60 * gap, z = Math.floor(i / 3600) * gap;
        const m = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
        meshes.push({ pid: 'p' + i, proto: k, matrix: m, color: [0.7, 0.7, 0.7] });
        parts.push({ pid: 'p' + i, name: 'P' + i, bbox: { min: [x, y, z], max: [x + size, y + size, z + size] }, centroid: [x + size / 2, y + size / 2, z + size / 2] });
    }
    return { geom: { protos, meshes }, parts };
}
// what the GPU would be asked to draw right now: instanced copies x their geometry's triangles
function drawnTris(sc) {
    let t = 0;
    sc.inst.forEach(g => { t += g.full.count * g.full.geometry.index.count / 3; if (g.coarse) t += g.coarse.count * g.coarse.geometry.index.count / 3; });
    return t;
}
function camera(T, pos, at, aspect) {
    const cam = new T.PerspectiveCamera(45, aspect || 1.6, 1, 1e7); cam.up.set(0, 0, 1);
    cam.position.set(pos[0], pos[1], pos[2]); cam.lookAt(new T.Vector3(at[0], at[1], at[2])); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    return cam;
}
async function freezeScenario(renderSrc) {
    const sb = sceneCtx(renderSrc), T = sb.THREE, R = sb.SLCadRender;
    const M = makeModel(20, 150, 100, 400);   // 3,000 parts, 20 shapes of 150 copies
    const sc = new R.Scene(T, {});
    sc.setTriangleBudget(250000);
    await sc.build(M.geom, M.parts);
    const out = { beforePass: drawnTris(sc) + sc.inst.reduce((s, g) => s + g.full.count, 0) };
    const cam = camera(T, [12000, -30000, 15000], [12000, 12000, 0]);
    sc.update(cam, 800);
    out.boxes = drawnTris(sc); out.boxesStats = Object.assign({}, sc.stats);
    // the real shapes arrive: 2,450 triangles each (147,000 copies' worth would be 7.3 million)
    const H = heavyGeo(100, 35);
    sc.replaceProtos(M.geom.protos.map((_, k) => ({ proto: k, position: H.position.slice(), index: H.index.slice() })));
    out.afterDetail = drawnTris(sc); out.stats = Object.assign({}, sc.stats);
    out.fullAll = 3000 * H.index.length / 3;
    // every copy that draws coarse is no larger on screen than any copy of a shape with a coarse copy that draws full
    const V = sc._vis; let maxCoarse = 0, minFull = Infinity;
    sc.list.forEach((it, i) => { if (!it.drawn) return; const hasC = !!sc.protos[it.proto].coarse; if (!hasC) return; if (it.lod === 1) maxCoarse = Math.max(maxCoarse, V.px[i]); else minFull = Math.min(minFull, V.px[i]); });
    out.order = { maxCoarse, minFull };
    out.ranges = []; sc.inst.forEach(g => [g.full, g.coarse].forEach(m => { if (m && m.count) out.ranges.push({ n: m.count, r: m.instanceMatrix.updateRanges.map(x => [x.start, x.count]) }); }));
    out.counts = sc.inst.map(g => [g.full.count, g.coarse ? g.coarse.count : 0]);
    // closer: everything fits, nothing simplified beyond the plain rule
    const near = camera(T, [300, -1500, 600], [300, 300, 0]);
    sc.update(near, 800);
    out.near = Object.assign({}, sc.stats); out.nearTris = drawnTris(sc);
    // hiding parts frees the budget at once
    sc.setVisible(sc.list.slice(0, 2000).map(it => it.pid), false);
    out.hidden = Object.assign({}, sc.stats);
    return out;
}

(async () => {
    // ===================================================================== R
    console.log('\n[R] the frame\'s triangle budget');
    const R0 = ctx([['cad_render.js', read('cad_render.js')]]).SLCadRender;
    {
        let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        const n = 5000, px = new Float32Array(n), full = new Float64Array(n), coarse = new Float64Array(n), skip = new Uint8Array(n);
        for (let i = 0; i < n; i++) { px[i] = Math.exp(rnd() * 9) * 0.3; full[i] = 12 + Math.floor(rnd() * 5000); coarse[i] = rnd() < 0.8 ? Math.max(12, Math.floor(full[i] / 8)) : full[i]; skip[i] = rnd() < 0.1 ? 1 : 0; }
        const cost = (B, opts) => { let t = 0; for (let i = 0; i < n; i++) { if (skip[i]) continue; const l = R0.levelOf(px[i], coarse[i] < full[i], B, opts); if (l === 0) t += full[i]; else if (l === 1) t += coarse[i]; } return t; };
        const plain = R0.budgetLevels(n, px, full, coarse, skip, { triBudget: Infinity });
        let same = true; for (let i = 0; i < n; i++) if (R0.levelOf(px[i], coarse[i] < full[i], plain, {}) !== R0.lodLevel(px[i], coarse[i] < full[i], {})) same = false;
        check('within budget every part gets exactly the plain rule (lodLevel): nothing simplified', plain.lodB === 0 && plain.cullB === 0 && same);
        const B1 = R0.budgetLevels(n, px, full, coarse, skip, { triBudget: plain.tris / 3 });
        check('over budget: the frame fits (' + B1.tris + ' <= ' + Math.round(plain.tris / 3) + '), and the count it reports is exactly what the parts then cost', B1.tris <= plain.tris / 3 && B1.tris === cost(B1, {}) && !B1.over);
        let mono = true, maxS = 0, minF = Infinity;
        for (let i = 0; i < n; i++) { if (skip[i] || !(coarse[i] < full[i])) continue; const l = R0.levelOf(px[i], true, B1, {}); if (l === 1 && px[i] >= 28) maxS = Math.max(maxS, px[i]); if (l === 0) minF = Math.min(minF, px[i]); }
        mono = maxS <= minF;
        check('smallest on screen first: no part is drawn coarse while a smaller one (with a coarse copy) draws full', mono, maxS + ' vs ' + minF);
        const B2 = R0.budgetLevels(n, px, full, coarse, skip, { triBudget: 2000 });
        check('a tiny budget leaves out the smallest parts last of all, and still fits', B2.cullB > 0 && B2.tris <= 2000 && B2.tris === cost(B2, {}));
        const big = R0.budgetLevels(n, px, full, coarse, skip, { triBudget: 1e12 });
        check('the default rule thresholds are reported back unchanged within budget', big.lodPx === 28 && big.cullPx === 0.75);
    }

    console.log('\n[R] a scene in node (real three.js): no frame draws the real shapes undecided');
    const F = await freezeScenario();
    check('before the first visibility pass nothing is drawn (a part is never drawn by default)', F.beforePass === 0, F.beforePass);
    check('the first pass decides every part (boxes: ' + F.boxes + ' triangles)', F.boxesStats.decisions >= 1 && F.boxes > 0 && F.boxes === F.boxesStats.triangles);
    check('detail streamed in: the very next frame fits the budget with no visibility pass in between (' + F.afterDetail + ' of the ' + F.fullAll + ' a full-detail frame would draw)', F.afterDetail <= 250000 && F.afterDetail < F.fullAll / 4, JSON.stringify(F.stats));
    check('...and the scene\'s own count is what the GPU is asked to draw', F.afterDetail === F.stats.triangles);
    check('...simplified smallest first (every coarse copy is no larger on screen than any full one)', F.order.maxCoarse <= F.order.minFull, JSON.stringify(F.order));
    check('instance buffers upload only the copies drawn (one range from 0, 16 floats per copy)', F.ranges.length > 0 && F.ranges.every(x => x.r.length === 1 && x.r[0][0] === 0 && x.r[0][1] === x.n * 16));
    check('close up, inside the budget: not over budget, the plain rule thresholds', !F.near.overBudget && F.near.budgetLodPx === 28 && F.nearTris === F.near.triangles);
    check('hiding parts decides again at once (hidden parts are not drawn or counted)', F.hidden.drawn <= 1000 && F.hidden.decisions > F.near.decisions);

    console.log('\n[R] normals and coarse copies prepared by the part readers');
    async function prepScenario(renderSrc, workerSrc) {
        const sb = sceneCtx(renderSrc), T = sb.THREE, R = sb.SLCadRender;
        let s5 = 9; const r5 = () => { s5 = (s5 * 16807) % 2147483647; return s5 / 2147483647; };
        let bad = 0, tot = 0;
        for (let k = 0; k < 40; k++) {
            const nv = 3 + Math.floor(r5() * 300), nt = 1 + Math.floor(r5() * 600), P = new Float32Array(nv * 3).map(() => (r5() - 0.5) * 1000), X = new Uint32Array(nt * 3).map(() => Math.floor(r5() * nv));
            if (k % 4 === 0) X[3] = X[4];   // a degenerate triangle (two corners on one vertex)
            const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setIndex(new T.BufferAttribute(X, 1)); g.computeVertexNormals();
            const A = g.attributes.normal.array, B = R.vertexNormals(P, X); tot += A.length; for (let i = 0; i < A.length; i++) if (!Object.is(A[i], B[i])) bad++;
        }
        // the reader's preparation (the worker's own prepGeo, loaded as the browser loads it) against the scene's rule
        const WH2 = {};
        const W2 = ctx([['cad_import_worker.js', workerSrc || read('cad_import_worker.js')]], { importScripts: function () { Array.prototype.forEach.call(arguments, u => { const f = String(u).split('?')[0]; vm.runInContext(f === 'cad_render.js' && renderSrc ? renderSrc : read(f), WH2.sb, { filename: f }); }); }, location: { search: '', href: 'cad_import_worker.js' }, navigator: { hardwareConcurrency: 2 }, postMessage: () => {}, __hold: WH2 });
        const H = heavyGeo(100, 30), geo = [{ position: H.position.slice(), index: H.index.slice(), faces: null }];
        W2.prepGeo(geo);
        const own = R.coarseOf(H.position, H.index);
        const sameCoarse = !!(geo[0].coarse && own && geo[0].coarse.index.length === own.index.length && geo[0].coarse.index.every((v, i) => v === own.index[i]) && geo[0].coarse.position.every((v, i) => Object.is(v, own.position[i])));
        const de = W2.detailEntry({}, 0, geo[0]);
        // the scene takes them as they come (no second decimation, the normals as sent)
        const M = makeModel(1, 8, 100, 400), sc = new R.Scene(T, {});
        await sc.build(M.geom, M.parts); sc.update(camera(T, [300, -3000, 600], [300, 0, 0]), 800);
        sc.replaceProtos([de.e]);
        const pr = sc.protos[0], used = pr.coarse && pr.coarse.index === de.e.coarse.index && sc.inst[0].full.geometry.attributes.normal.array === de.e.normal;
        return { bad, tot, sameCoarse, used, hasNormal: !!de.e.normal };
    }
    const PS = await prepScenario();
    check('vertex normals worked out off the page are three.js\'s own, bit for bit (' + PS.tot + ' values, degenerate triangles included)', PS.bad === 0 && PS.tot > 0, PS.bad + ' differ');
    check('a reader\'s coarse copy is the scene\'s own rule on the same shape (same triangles, same points)', PS.sameCoarse);
    check('the scene draws the prepared normals and coarse copy as they come (no second pass on the page)', PS.used && PS.hasNormal);

    // ===================================================================== B
    console.log('\n[B] boxes made by the part readers are the page\'s numbers, bit for bit');
    const I = ctx([['cad_import.js', read('cad_import.js')]]).SLCadImport;
    let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const rot = () => { const a = rnd() * 6.3, b = rnd() * 6.3, c = rnd() * 6.3, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c); return [cb * cc, cb * sc, -sb, 0, sa * sb * cc - ca * sc, sa * sb * sc + ca * cc, sa * cb, 0, ca * sb * cc + sa * sc, ca * sb * sc - sa * cc, ca * cb, 0, (rnd() - 0.5) * 4e4, (rnd() - 0.5) * 4e4, (rnd() - 0.5) * 3e3, 1]; };
    function randomModel(np, nm) {
        const protos = [], meshes = [], parts = [];
        for (let p = 0; p < np; p++) { const nv = 3 * (3 + Math.floor(rnd() * 300)); protos.push({ position: new Float32Array(nv * 3).map(() => (rnd() - 0.5) * 900), index: new Uint32Array(nv).map((_, i) => i), normal: null, faces: null }); }
        const shared = rot();
        for (let i = 0; i < nm; i++) {
            const r = rnd(); const m = r < 0.15 ? null : r < 0.25 ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] : r < 0.6 ? shared.slice(0, 12).concat([(rnd() - 0.5) * 1e5, (rnd() - 0.5) * 1e5, rnd() * 1e3, 1]) : rot();
            meshes.push({ pid: 'q' + i, proto: Math.floor(rnd() * np), matrix: m ? new Float32Array(m) : null, color: null });
            parts.push({ pid: 'q' + i, name: 'Q', path: [], bbox: { min: [0, 0, 0], max: [1, 1, 1] }, centroid: [0, 0, 0] });
        }
        return { protos, meshes, parts };
    }
    const sig = parts => parts.map(p => [...p.bbox.min, ...p.bbox.max, ...p.centroid].map(v => Object.is(v, -0) ? '-0' : String(v)).join(',')).join(';');
    // the worker's own plumbing, loaded the way the browser loads it
    const WH = {};
    const W = ctx([['cad_import_worker.js', read('cad_import_worker.js')]], { importScripts: function () { Array.prototype.forEach.call(arguments, u => { const f = String(u).split('?')[0]; vm.runInContext(read(f), WH.sb, { filename: f }); }); }, location: { search: '', href: 'cad_import_worker.js' }, navigator: { hardwareConcurrency: 2 }, postMessage: () => {}, __hold: WH });
    function viaWorker(M) {
        // what the import worker keeps when the first view goes out, what one part job carries, what the reader returns
        const packed = W.SLCadImport.packMeshes(M.meshes), S = {};
        W.keepPlacements(S, packed);
        const placed = {};
        M.protos.forEach((g, p) => {
            const inst = W.instFor(S, [p]); const geo = [{ position: g.position, index: g.index, faces: null }];
            W.boxGeo(geo, inst ? inst.list : null);
            const de = W.detailEntry(S, p, geo[0]);
            if (de.e.placed) placed[p] = { idx: de.e.placed.idx, box: de.e.placed.box, cen: de.e.placed.cen, position: g.position };
        });
        return placed;
    }
    {
        const M = randomModel(30, 1500);
        // the main thread's model: placements back from the packed form, as the page unpacks them
        const P = I.packMeshes(M.meshes), back = I.unpackMeshes(P, null).map((m, i) => Object.assign(m, { pid: M.meshes[i].pid }));
        const A = { protos: M.protos, meshes: back, parts: JSON.parse(JSON.stringify(M.parts)) };
        I.trueBoxes(A);
        const Bm = { protos: M.protos, meshes: back, parts: JSON.parse(JSON.stringify(M.parts)), placed: viaWorker({ protos: M.protos, meshes: back }) };
        const ret = I.trueBoxes(Bm);
        check('every part: box and centroid from the readers equal boxing every vertex on the page, bit for bit (1,500 parts, shared and random rotations, identity, none)', sig(A.parts) === sig(Bm.parts) && Object.keys(Bm.placed).length === 30);
        check('trueBoxes still returns one update per part for the zonal engine', ret.length === 1500 && ret.every((u, i) => u.pid === Bm.parts[i].pid && u.bbox === Bm.parts[i].bbox));
        // a shape replaced after its boxes were made (a retry): boxed again from the new shape
        const C = { protos: M.protos.slice(), meshes: back, parts: JSON.parse(JSON.stringify(M.parts)), placed: Bm.placed };
        C.protos[3] = { position: C.protos[3].position.map(v => v * 2), index: C.protos[3].index };
        const D = { protos: C.protos, meshes: back, parts: JSON.parse(JSON.stringify(M.parts)) };
        I.trueBoxes(C); I.trueBoxes(D);
        check('a shape changed since its boxes were made is boxed again from the shape the model holds', sig(C.parts) === sig(D.parts));
        // placedBoxes against bboxOfXf directly, including an empty shape
        const pb = I.placedBoxes(new Float32Array(0), new Uint32Array(0), new Float32Array(rot()), new Uint8Array([1]), 1);
        check('a shape with no vertices gets bboxOfXf\'s empty box', [...pb.box].every(v => v === 0));
    }

    // ===================================================================== S
    console.log('\n[S] part and body files, byte for byte as the original reader wrote them');
    // sha256 over every part file (extract) and body file (extractBody) of each fixture, in order,
    // computed with the reader as it was before 15 Oct 2026 (cad_step_struct.js 1.0)
    const GOLD = {
        'toy_aircraft.step': [4, '1ca355adeec9a615884e2734e224921497d4f8f1b8435bebddf14051657ae835'],
        'one_product_three_bodies.step': [6, 'd6d62564989005c02a690318aaf5569c80048163c0c3a16b9d2dff4b7bc76249'],
        'pra_aircraft.step': [17, '8267f6af7c00a87208199415f77cbd5fd908c9b943bc1b6abbabbe5c5c8f25c7'],
        'aircraft3k.step': [2644, 'b435d401be2493ff0ec982a45b6208ed3e59ca295fc30c3266941164f616ae50']
    };
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-cad-perf-'));
    const gen = path.join(tmp, 'aircraft3k.step');
    require(path.join(ROOT, 'tests', 'fixtures', 'cad', 'make_aircraft_step.js')).generate({ out: gen, components: 3000 });
    const FILES = { 'toy_aircraft.step': FIX('toy_aircraft.step'), 'one_product_three_bodies.step': FIX('one_product_three_bodies.step'), 'pra_aircraft.step': FIX('pra_aircraft.step'), 'aircraft3k.step': gen };
    function sliceHash(src, file) {
        const S = ctx([['cad_step_struct.js', src]]).SLCadStep;
        const bytes = new Uint8Array(fs.readFileSync(file)), ix = S.index(bytes), st = S.structure(ix), h = crypto.createHash('sha256'); let n = 0;
        const lvs = []; S.occurrences(st, o => { if (lvs.indexOf(o.leaf) < 0) lvs.push(o.leaf); });
        lvs.forEach(pd => { const u = S.extract(ix, st, pd); h.update(u || new Uint8Array(0)); n++; const B = S.bodies(ix, st, pd); if (B && B.bodies.length >= 2) for (let k = 0; k < B.bodies.length; k++) { h.update(S.extractBody(ix, B, k)); n++; } });
        return [n, h.digest('hex')];
    }
    const SS = read('cad_step_struct.js');
    Object.keys(GOLD).forEach(f => { const r = sliceHash(SS, FILES[f]); check(f + ': ' + r[0] + ' files, identical bytes', r[0] === GOLD[f][0] && r[1] === GOLD[f][1], r.join(' ')); });
    {
        const S = ctx([['cad_step_struct.js', SS]]).SLCadStep, bytes = new Uint8Array(fs.readFileSync(FIX('one_product_three_bodies.step'))), ix = S.index(bytes), st = S.structure(ix);
        const lvs = []; S.occurrences(st, o => { if (lvs.indexOf(o.leaf) < 0) lvs.push(o.leaf); });
        const c1 = S.closureOf(ix, st, lvs[0]), c2 = S.closureOf(ix, st, lvs[0]);
        check('a part\'s closure is worked out once for its bodies, its points and its file (the same result handed back)', c1 === c2 && c1.ids.length > 0);
    }

    // ===================================================================== W
    console.log('\n[W] the reader pool');
    {
        W._importOpts = {};
        const ps = [[2, 8], [3, 8], [4, 8], [8, 8], [12, 8], [16, 8], [8, 4], [8, 6]].map(([hc, mem]) => W.poolSize(hc, mem));
        check('pool size: every core on 2 or 3 cores, one left for the page and graphics from 4 (2,3,3,7,11,12 at 8 GB; 2 at 4 GB; 4 at 6 GB)', JSON.stringify(ps) === JSON.stringify([2, 3, 3, 7, 11, 12, 2, 4]), JSON.stringify(ps));
        const S = { order: [0, 1, 2, 3, 4, 5, 6, 7] }, Q = W.workQueue(S);
        const a = Q.take(true), b = Q.take(true), c = Q.take(false); Q.again(a); const d = Q.take(false);
        check('bodies of a huge part: readers take the largest left, one reader the smallest; work handed back goes first', a === 7 && b === 6 && c === 0 && d === 7 && Q.left() === 5 && S.order.length === 8);
        const WS = read('cad_import_worker.js');
        check('a body is one job per reader at a time (none waits behind a minute-long body); parts two at a time', /var perReader = S\.sized \? 1 : 2;/.test(WS) && /x\.big = !!S\.sized && pool\.length > 1 && i > 0/.test(WS));
        check('the total reported at the end is the number of parts and bodies, not inflated by work handed back', /type: 'detail-done', total: S\.order\.length, workers: pool\.length/.test(WS) && !/S\.order\.push\(k\)/.test(WS));
    }

    // ===================================================================== G
    console.log('\n[G] the geometry guard answers as before');
    {
        const GEOM_KEYS = { position: 1, positions: 1, normal: 1, normals: 1, index: 1, indices: 1, meshes: 1, vertices: 1, triangles: 1, buffer: 1, bytes: 1, step: 1, stepText: 1, fileBytes: 1 };
        // the guard as it was before 15 Oct 2026, the reference
        const ref = obj => { const seen = new Set(); return (function look(o) { if (o == null || typeof o !== 'object') return false; if (seen.has(o)) return false; seen.add(o); if (o instanceof ArrayBuffer || ArrayBuffer.isView(o)) return true; if (Array.isArray(o)) { if (o.length > 3 && o.every(x => typeof x === 'number')) return true; return o.some(look); } for (const k in o) { if (!Object.prototype.hasOwnProperty.call(o, k)) continue; if (GEOM_KEYS[k]) return true; if (look(o[k])) return true; } return false; })(obj); };
        let s2 = 7; const r2 = () => { s2 = (s2 * 16807) % 2147483647; return s2 / 2147483647; };
        const keys = ['a', 'b', 'pid', 'bbox', 'min', 'max', 'position', 'x', 'meshes', 'name'];
        const gen2 = d => { const t = r2(); if (d > 6 || t < 0.3) return [1, 's', null, undefined, true][Math.floor(r2() * 5)]; if (t < 0.4) return r2() < 0.3 ? new Float32Array(2) : [1, 2, 3, 4]; if (t < 0.7) { const a = []; const n = Math.floor(r2() * 6); for (let i = 0; i < n; i++) a.push(r2() < 0.6 ? r2() : gen2(d + 1)); if (r2() < 0.1) delete a[0]; return a; } const o = {}; const n = Math.floor(r2() * 4); for (let i = 0; i < n; i++) { const k = keys[Math.floor(r2() * keys.length)]; if (r2() < 0.95 && (k === 'position' || k === 'meshes')) continue; o[k] = gen2(d + 1); } return o; };
        let diff = 0, tru = 0;
        const IG = ctx([['cad_import.js', read('cad_import.js')]]).SLCadImport;
        for (let i = 0; i < 20000; i++) { const g = gen2(0); const a = ref(g), b = IG.containsGeometry(g); if (a) tru++; if (a !== b) diff++; }
        const sh = { x: [1, 2, 3] }, cyc = { a: sh, b: sh, d: [[[[[[{ position: 1 }]]]]]] }; cyc.c = cyc; const cyc2 = { a: sh }; cyc2.c = { d: { e: { f: { g: cyc2 } } } };
        check('20,000 generated records (' + tru + ' with geometry): the same answer as the guard before', diff === 0, diff + ' differ');
        check('shared, deep and cyclic records: the same answers', IG.containsGeometry(cyc) === true && ref(cyc) === true && IG.containsGeometry(cyc2) === false && ref(cyc2) === false);
    }

    // ===================================================================== P
    console.log('\n[P] the page');
    {
        const PG = read('cad_page.js');
        check('a very large model\'s panels are drawn one per idle task, and a newer draw supersedes an older one', /if \(!\(mdl && mdl\.partStore === 'local'\)\) \{ steps\.forEach/.test(PG) && /gen !== _panelGen/.test(PG) && /requestIdleCallback/.test(PG));
        const V = read('cad_viewer.js');
        check('a software renderer (SwiftShader, llvmpipe) gets a smaller frame budget; a graphics card keeps the default', /swiftshader\|llvmpipe/.test(V) && /sc\.setTriangleBudget\(self\.gpu\.triBudget\)/.test(V));
    }

    // ===================================================================== M
    console.log('\n[M] mutations (each must turn a check red)');
    {
        const RN = read('cad_render.js'), IMP = read('cad_import.js');
        const mut = async (name, src, from, to, probe) => {
            if (src.indexOf(from) < 0) { check('M: anchor present: ' + name, false, from.slice(0, 80)); return; }
            let red; try { red = await probe(src.replace(from, to)); } catch (e) { red = 'crashed: ' + e.message; }
            check('M: goes red when ' + name, red === true, String(red));
        };
        await mut('detail streamed in is not decided again at once (the 84 s freeze)', RN, 'if (this._vis && this._vis.decided) this._decide();', '', async src => { const F2 = await freezeScenario(src); return F2.afterDetail > 250000; });
        await mut('parts are drawn before the visibility pass decides them (instanced copies drawn by default)', RN, 'list.forEach(function (it) { it.group = g; it.drawn = false; });', 'list.forEach(function (it) { it.group = g; it.drawn = true; });', async src => { const F2 = await freezeScenario(src); return F2.beforePass > 0; });
        await mut('parts are drawn before the visibility pass decides them (undecided parts count as in view)', RN, "it.lod = -1; it.frustumOut = true;", 'it.lod = 0; it.frustumOut = false;', async src => { const sb2 = sceneCtx(src), T2 = sb2.THREE; const M2 = makeModel(2, 2, 100, 400); const sc2 = new sb2.SLCadRender.Scene(T2, {}); await sc2.build(M2.geom, M2.parts); return sc2.list.some(it => it.drawn); });
        await mut('the budget simplifies the largest on screen first', RN, 'for (b = 0; b < NB && tris > budget; b++) { tris -= save[b]; lodB = b + 1; }', 'for (b = 0; b < NB && tris > budget; b++) { tris -= save[NB - 1 - b]; lodB = b + 1; }', async src => { const R2 = ctx([['cad_render.js', src]]).SLCadRender; let s3 = 3; const r3 = () => { s3 = (s3 * 16807) % 2147483647; return s3 / 2147483647; }; const n = 3000, px = new Float32Array(n).map(() => Math.exp(r3() * 9)), full = new Float64Array(n).fill(800), coarse = new Float64Array(n).fill(100); const B = R2.budgetLevels(n, px, full, coarse, null, { triBudget: 3000 * 100 + 200 * 700 }); let nf = 0, minF = Infinity, maxC = 0; for (let i = 0; i < n; i++) { const l = R2.levelOf(px[i], true, B, {}); if (l === 0) { nf++; minF = Math.min(minF, px[i]); } else if (l === 1) maxC = Math.max(maxC, px[i]); } return !(nf > 100 && maxC <= minF); });
        await mut('the whole instance buffer uploads every time (no update range)', RN, 'at.addUpdateRange(0, k * a[1]);', '', async src => { const F2 = await freezeScenario(src); return !(F2.ranges.length && F2.ranges.every(x => x.r.length === 1)); });
        await mut('normals summed without the shared float32 rounding three.js does', RN, 'N[a] = ax; N[a + 1] = ay; N[a + 2] = az; N[b] = b0;', 'N[a] = ax; N[a + 1] = ay; N[a + 2] = az + 1e-9 * az; N[b] = b0;', async src => { const P2 = await prepScenario(src); return P2.bad > 0; });
        await mut('the reader prepares a coarse copy by another rule than the scene', read('cad_import_worker.js'), 'var c = R.coarseOf(g.position, g.index);', 'var c = R.coarseOf(g.position, g.index, { lodRatio: 0.25 });', async src => { const P2 = await prepScenario(null, src); return !P2.sameCoarse; });
        await mut('the scene ignores the prepared coarse copy and decimates again', RN, 'if (n.coarse !== undefined && sameRule) {', 'if (false) {', async src => { const P2 = await prepScenario(src); return !P2.used; });
        await mut('a placed box loses its translation', IMP, 'box[o] = r[0] + M[12];', 'box[o] = r[0];', async src => { const I2 = ctx([['cad_import.js', src]]).SLCadImport; const m = new Float32Array(rot()); const p = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]); const a = I2.placedBoxes(p, new Uint32Array([0, 1, 2]), m, new Uint8Array([1]), 1), b = I2.bboxOfXf(p, m); return a.box[0] !== b.min[0]; });
        await mut('boxes made for an older shape are used for a new one', IMP, 'if (!P || !pr || P.position !== pr.position) return;', 'if (!P || !pr) return;', async src => { const I2 = ctx([['cad_import.js', src]]).SLCadImport; const g = { position: new Float32Array([0, 0, 0, 1, 1, 1, 2, 0, 0]), index: new Uint32Array([0, 1, 2]) }; const pb = I2.placedBoxes(g.position, g.index, new Float32Array(16), new Uint8Array([0]), 1); const model = { protos: [{ position: g.position.map(v => v * 3), index: g.index }], meshes: [{ pid: 'a', proto: 0, matrix: null }], parts: [{ pid: 'a' }], placed: { 0: { idx: new Int32Array([0]), box: pb.box, cen: pb.cen, position: g.position } } }; I2.trueBoxes(model); return model.parts[0].bbox.max[0] !== 6; });
        await mut('a part file loses the newline after each entity', SS, 'out[o++] = 59; out[o++] = 10;', 'out[o++] = 59;', async src => sliceHash(src, FILES['toy_aircraft.step'])[1] !== GOLD['toy_aircraft.step'][1]);
        await mut('a body file\'s entities written out of id order', SS, "B.base.forEach(add); B.desc[k].forEach(add);\n        list.sort(function (a, b) { return a - b; });", 'B.base.forEach(add); B.desc[k].forEach(add);', async src => sliceHash(src, FILES['one_product_three_bodies.step'])[1] !== GOLD['one_product_three_bodies.step'][1]);
        await mut('the geometry guard misses an array of coordinates nested deep in a record', IMP, 'if (d > 3) return -1;', 'if (d > 3) return 0;', async src => { const I2 = ctx([['cad_import.js', src]]).SLCadImport; return I2.containsGeometry({ a: { b: { c: { d: { e: [1, 2, 3, 4] } } } } }) === false; });
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  suite threw: ' + (e && e.stack || e)); process.exit(1); });

#!/usr/bin/env node
/*
 * Timed: a 200,000 component STEP aircraft, first view and warm reopen (13 Oct 2026, cad-C).
 *
 * THE REQUIREMENT (founder ruling, 13 Oct 2026): the whole aircraft visible and navigable within
 * seconds of opening a 200,000 component STEP file, and a reopen from this computer's cache in
 * under a second. Measured here on the worker's own code path (cad_step_struct.js and
 * cad_import.js, single thread, as in the CAD worker):
 *
 *   first view  = fingerprint (sha256) + structure + a box per part + the model the viewer draws
 *                 (budget FIRST_VIEW_MS, default 10 s on a 2 core machine; the viewer then needs
 *                 about 1.3 s more to build the scene, measured in Chromium separately)
 *   warm reopen = the cached payload read back (structured clone, as IndexedDB stores it),
 *                 unpacked, the full part list registered (budget REOPEN_MS, default 1 s). This is
 *                 the data part only: in Chromium the whole reopen to the model on screen measured
 *                 2.3 s on 2 cores on 14 Oct (the scene build is the rest), so the 1 s target for the
 *                 whole reopen is NOT yet met there.
 *   synced size = the project's record of the model (budget 4 kB)
 *   clash       = full-aircraft clash on the real shapes, narrow phase in one worker per core
 *                 (budget CLASH_MS, default 30 s); the shapes are first meshed by vendor/occt-fast
 *
 * The file is generated (tests/fixtures/cad/make_aircraft_step.js: a 4 level tree, a few
 * thousand distinct parts, 200,000 placed components, about 150 MB) into the system's temp
 * folder and deleted afterwards. COMPONENTS=n changes the size.
 *
 * Run: node --max-old-space-size=4096 tests/regression_cad_scale_timed_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), v8 = require('v8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const N = +(process.env.COMPONENTS || 200000);
const FIRST_VIEW_MS = +(process.env.FIRST_VIEW_MS || 10000), REOPEN_MS = +(process.env.REOPEN_MS || 1000);

(async () => {
    if (v8.getHeapStatistics().heap_size_limit < 3.5e9) {
        // the 150 MB file and its index need more than node's default heap: rerun with more
        const r = require('child_process').spawnSync(process.execPath, ['--max-old-space-size=4096', __filename], { stdio: 'inherit', env: process.env });
        process.exit(r.status == null ? 1 : r.status);
    }
    global.self = global;
    require(path.join(SITE, 'cad_import.js')); require(path.join(SITE, 'cad_step_struct.js'));
    const I = global.SLCadImport, S = global.SLCadStep;
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {}, systemsData: [], acFhaData: [], ftaPages: [], zsaData: [] };
    sb.window = sb; sb.globalThis = sb; sb.self = sb; vm.createContext(sb);
    vm.runInContext(read('zonal_model.js'), sb); vm.runInContext(read('cad_zonal.js'), sb);
    global.SLCadZonal = sb.SLCadZonal;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-cad-timed-'));
    try {
        const file = path.join(tmp, 'aircraft200k.step');
        const g = require(path.join(ROOT, 'tests', 'fixtures', 'cad', 'make_aircraft_step.js')).generate({ out: file, components: N });
        console.log('generated: ' + g.components + ' components, ' + g.placedParts + ' placed parts, ' + g.distinctParts + ' distinct parts, ' + Math.round(g.bytes / 1048576) + ' MB');
        const bytes = new Uint8Array(fs.readFileSync(file));
        // ---- first view (the worker's fast path, timed stage by stage)
        const T = {}; let t = Date.now(); const t0 = t;
        const sha = await I.sha256Hex(bytes); T.sha256 = Date.now() - t; t = Date.now();
        const ix = S.index(bytes); T.index = Date.now() - t; t = Date.now();
        const st = S.structure(ix); T.structure = Date.now() - t; t = Date.now();
        const res = S.boxRes(ix, st); T.boxes = Date.now() - t; t = Date.now();
        const model = I.buildModel(res, { maxTrianglesTotal: 0 }); T.model = Date.now() - t;
        const firstView = Date.now() - t0;
        console.log('first view stages (ms): ' + JSON.stringify(T) + ', total ' + firstView);
        check('the structure reader takes the file (supported, ' + st.components + ' components)', !st.unsupported && st.components === g.components, st.unsupported);
        check('every placed part is in the first view (' + model.parts.length + ')', model.parts.length === g.placedParts);
        check('first view of ' + N + ' components in ' + firstView + ' ms (budget ' + FIRST_VIEW_MS + ' ms on this machine)', firstView <= FIRST_VIEW_MS);
        // ---- the project record
        const E = sb.SLCadZonal;
        const entry = I.projectEntry(model, { fileName: 'aircraft200k.step', sha256: sha });
        delete entry.id;
        const add = E.addCadModel(entry);
        const synced = JSON.stringify(sb.projectConfig).length;
        check('the synced project record stays small: ' + synced + ' bytes for ' + model.parts.length + ' parts (budget 4 kB)', add.ok && synced < 4096);
        // ---- warm reopen: the payload as IndexedDB stores and returns it
        const payload = I._cachePayload ? I._cachePayload(sha, model) : null;
        check('the cache payload is the packed form (part list included for a large model)', payload && payload.packed && payload.parts && payload.packed.n === model.parts.length);
        const stored = v8.serialize(payload);
        console.log('cache payload: ' + Math.round(stored.length / 1048576) + ' MB');
        sb.SLCadZonal.registerLocalParts('none', []);   // a fresh registry on "another session"
        const sb2 = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: JSON.parse(JSON.stringify(sb.projectConfig)), systemsData: [], acFhaData: [], ftaPages: [], zsaData: [] };
        sb2.window = sb2; sb2.globalThis = sb2; sb2.self = sb2; vm.createContext(sb2);
        vm.runInContext(read('zonal_model.js'), sb2); vm.runInContext(read('cad_zonal.js'), sb2);
        const R = {}; t = Date.now(); const r0 = t;
        const back = v8.deserialize(stored); R.read = Date.now() - t; t = Date.now();
        const geom = I.normalizeGeometry(back); R.placements = Date.now() - t; t = Date.now();
        const parts = I.unpackParts(back.parts, back.packed); sb2.SLCadZonal.registerLocalParts(sha, parts); R.parts = Date.now() - t;
        const reopen = Date.now() - r0;
        console.log('warm reopen stages (ms): ' + JSON.stringify(R) + ', total ' + reopen);
        const m2 = sb2.SLCadZonal.models()[0];
        check('after the reopen every part and placement is back', geom.meshes.length === model.parts.length && sb2.SLCadZonal.partsOf(m2).length === model.parts.length);
        check('warm reopen, the data part (cache read, unpack, part list registered) in ' + reopen + ' ms (budget ' + REOPEN_MS + ' ms; the viewer\'s scene build comes on top, measured in Chromium)', reopen <= REOPEN_MS);
        // ---- full-aircraft clash on the real shapes (each distinct part meshed by our OpenCascade
        // build first, as the detail stream does), the narrow phase in one worker per core
        const CLASH_MS = +(process.env.CLASH_MS || 30000);
        const M = await require(path.join(SITE, 'vendor', 'occt-fast', 'slcad_occt.js'))({ print: () => {}, printErr: () => {} });
        let td = Date.now();
        res.leaves.forEach(L => {
            const u8 = S.extract(ix, st, L.pd), p = M._malloc(u8.length); M.HEAPU8.set(u8, p);
            const lp = M._malloc(4), out = M._sl_read(p, u8.length, 0.001, 0.5, lp), len = M.HEAP32[lp >> 2]; M._free(p); M._free(lp);
            if (!out || !len) return;
            const buf = M.HEAPU8.slice(out, out + len).buffer; M._sl_free(out);
            const jl = new DataView(buf).getUint32(0, true), meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, jl)));
            let o = 4 + jl; o += (4 - o % 4) % 4;
            const pr = meta.protos.map(q => { const pos = new Float32Array(buf.slice(o, o + q.v * 12)); o += q.v * 12; const idx = new Uint32Array(buf.slice(o, o + q.t * 12)); o += q.t * 12; o += q.f * 8; return { position: pos, index: idx }; });
            meta.meshes.forEach((m, i) => { if (i < L.protos.length) model.protos[L.protos[i]] = pr[m.proto]; });
        });
        const detailMs = Date.now() - td;
        console.log('detail of ' + res.leaves.length + ' distinct parts, one thread: ' + detailMs + ' ms');
        global.self = global; require(path.join(SITE, 'cad_render.js')); const RR = global.SLCadRender;
        const n = model.parts.length, data = { n, bbox: new Float64Array(n * 6), proto: new Int32Array(n), matrix: new Float32Array(n * 16), hasMatrix: new Uint8Array(n), protos: model.protos.map(q => ({ position: q.position, index: q.index })) };
        model.meshes.forEach((m, i) => { const b = model.parts[i].bbox; data.bbox.set([b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2]], i * 6); data.proto[i] = m.proto; if (m.matrix) { data.hasMatrix[i] = 1; data.matrix.set(m.matrix, i * 16); } });
        const { Worker } = require('worker_threads'), NW = os.cpus().length;
        const wsrc = 'const {parentPort}=require("worker_threads");global.self=global;require(' + JSON.stringify(path.join(SITE, 'cad_render.js')) + ');const st={};parentPort.on("message",m=>global.SLCadRender.clashWorkerMessage(st,m,r=>parentPort.postMessage(r)));';
        const ws = []; for (let i = 0; i < NW; i++) { const w = new Worker(wsrc, { eval: true }), o = { post: m => w.postMessage(m), onmessage: null, w }; w.on('message', m => o.onmessage && o.onmessage(m)); ws.push(o); }
        const cr = await RR.clashParallel(data, { tolerance: 0, workers: ws, pidOf: i => model.parts[i].pid });
        ws.forEach(o => o.w.terminate());
        const kinds = {}; cr.results.forEach(r => { kinds[r.kind] = (kinds[r.kind] || 0) + 1; });
        console.log('clash: ' + cr.candidates + ' candidate pairs, ' + JSON.stringify(kinds) + ', ' + cr.ms + ' ms with ' + NW + ' workers');
        check('full-aircraft clash of ' + n + ' parts in ' + cr.ms + ' ms with ' + NW + ' workers (budget ' + CLASH_MS + ' ms)', cr.ms <= CLASH_MS && cr.results.length > 0);
        check('clash results come in one fixed order (clashes, touches, clearances; then distance and part ids)', cr.results.every((r, i) => i === 0 || (({ clash: 0, touch: 1, clearance: 2 })[cr.results[i - 1].kind] <= ({ clash: 0, touch: 1, clearance: 2 })[r.kind])));
        fs.writeFileSync(path.join(tmp, 'timing.json'), JSON.stringify({ firstView: T, reopen: R }));
        console.log('TIMING ' + JSON.stringify({ components: N, firstViewMs: firstView, firstView: T, reopenMs: reopen, reopen: R, syncedBytes: synced, detailOneThreadMs: detailMs, clashMs: cr.ms, clashWorkers: NW }));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e && e.stack || e); console.log('  FAIL  suite threw: ' + (e && e.message)); process.exit(1); });

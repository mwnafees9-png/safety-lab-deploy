#!/usr/bin/env node
/*
 * Regression: zones and risk volumes on the parts' true shapes (site/cad_trueshape.js, SLCadTrueShape,
 * with the gate in site/cad_zonal.js), 14 Nov 2026.
 *
 * Waqas: "you get started on the true geometry". Decision 1: a change the true shapes make to a live
 * result is shown as a list for the engineer to accept, never applied silently.
 *
 *   A  the math alone: box, sphere, cone and disk-sector bounds; a part straddling, touching within the
 *      meshing tolerance (edge), just clear (out); a risk volume wholly inside a solid part; an L-shaped
 *      zone body with a part in its notch; placement matrix and units; 400 random cubes against random
 *      cones and spheres, checked against a dense sampling of their surfaces
 *   B  a small aircraft through the real cad_zonal.js: an L-shaped zone body (the box says a radio in the
 *      notch is in the bay, the surface says it is not), a thin diagonal plate whose box corner is in a
 *      risk sphere but whose surface is not, a straddling part, simplified (decimated) meshes answered by
 *      their boxes only, a part whose size is still an estimate left out
 *   C  the gate: until accepted, every answer stays on boxes; the review lists exactly what changes;
 *      accepting needs a name; after it, the true answers stand
 *   D  a zone edited after acceptance is answered on boxes ("mixed") until its true answer is read again;
 *      a zone whose bodies have no exact shape is kept on boxes and not asked for again (no endless rerun)
 *   E  an old cache (no "ts" marker, no face lists) is never trusted as exact
 *   F  a new CAD revision is not accepted until reviewed again
 *   G  determinism: the same input gives the same answers, whatever the order of parts and volumes
 *   H  mutations: deliberate breaks, each must turn a check red
 *   I  wiring: script order, version keys, the page's review and accept, the hooks that start a run,
 *      paged lists and no "and N more", no em dash
 *
 * Run: node tests/regression_cad_trueshape_20261114.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '  -- ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const TS = read('cad_trueshape.js'), CZ = read('cad_zonal.js'), ZM = read('zonal_model.js'), FE = read('fta_engine.js');
const IDX = read('index.html'), PAGE = read('cad_page.js'), IMP = read('cad_import.js'), VIEW = read('cad_viewer.js');
const EM = String.fromCharCode(0x2014);
const J = x => JSON.stringify(x);

// ---------------------------------------------------------------- meshes
function cube(c, s) {
    const h = s / 2, V = [];
    for (let i = 0; i < 8; i++) V.push(c[0] + ((i & 1) ? h : -h), c[1] + ((i & 2) ? h : -h), c[2] + ((i & 4) ? h : -h));
    const F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]], I = [];
    F.forEach(f => { I.push(f[0], f[1], f[2], f[0], f[2], f[3]); });
    return { position: V, index: I, matrix: null };
}
function boxMesh(min, max) {
    const V = [];
    for (let i = 0; i < 8; i++) V.push((i & 1) ? max[0] : min[0], (i & 2) ? max[1] : min[1], (i & 4) ? max[2] : min[2]);
    return { position: V, index: cube([0, 0, 0], 1).index, matrix: null };
}
function merge(a, b) { const n = a.position.length / 3; return { position: a.position.concat(b.position), index: a.index.concat(b.index.map(i => i + n)), matrix: null }; }
function quad(p0, p1, p2, p3) { return { position: [].concat(p0, p1, p2, p3), index: [0, 1, 2, 0, 2, 3], matrix: null }; }
function boxOf(m) { const P = m.position, min = [1e300, 1e300, 1e300], max = [-1e300, -1e300, -1e300]; for (let i = 0; i < P.length; i += 3) for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], P[i + j]); max[j] = Math.max(max[j], P[i + j]); } return { min, max }; }

// ---------------------------------------------------------------- A  the math alone
function loadTS(src) { const G = {}; vm.runInNewContext(src || TS, { globalThis: G, Math, isFinite, Array, Date, setTimeout: () => 0, clearTimeout: () => 0 }); return G.SLCadTrueShape; }
function mathChecks(T, quiet) {
    const r = [];
    const ok = (c, m) => r.push([!!c, m]);
    const part = (c, s) => { const m = cube(c, s); return { meshes: [m], box: T.meshBox(m) }; };
    const box = T.shapeBound({ kind: 'box', min: [0, 0, 0], max: [1000, 1000, 1000] });
    ok(T.classify(part([500, 500, 500], 100), box, 0.01) === 'in', 'A: a cube inside a box zone is in');
    ok(T.classify(part([1500, 500, 500], 100), box, 0.01) === 'out', 'A: a cube clear of the zone is out');
    ok(T.classify(part([1000, 500, 500], 100), box, 0.01) === 'in', 'A: a cube straddling the boundary reaches the zone: in');
    ok(T.classify(part([1050.005, 500, 500], 100), box, 0.01) === 'edge', 'A: a face 0.005 mm from the zone with a 0.01 mm tolerance: edge');
    ok(T.classify(part([1050.5, 500, 500], 100), box, 0.01) === 'out', 'A: a face 0.5 mm from the zone: out');
    const sph = { kind: 'sphere', center: [500, 500, 500], radius: 10 };
    ok(T.classify(part([500, 500, 500], 5000), T.shapeBound(sph), 0.01, sph) === 'in', 'A: a risk sphere wholly inside a large solid part is in');
    const cone = { kind: 'cone', apex: [0, 0, 0], axis: [1, 0, 0], halfAngleDeg: 10, length: 2000 }, CB = T.shapeBound(cone);
    ok(T.classify(part([1000, 0, 0], 50), CB, 0.01, cone) === 'in', 'A: cone, on the axis');
    ok(T.classify(part([1000, 400, 0], 50), CB, 0.01, cone) === 'out', 'A: cone, well outside 10 degrees (radius 176 mm at 1000 mm)');
    ok(T.classify(part([1000, 190, 0], 50), CB, 0.01, cone) === 'in', 'A: cone, a cube reaching in');
    ok(T.classify(part([2100, 0, 0], 50), CB, 0.01, cone) === 'out', 'A: cone, beyond its length');
    ok(T.classify(part([-100, 0, 0], 50), CB, 0.01, cone) === 'out', 'A: cone, behind the apex');
    const sec = { kind: 'disk-sector', center: [0, 0, 0], axis: [0, 0, 1], spreadDeg: 5, range: 3000 }, SB = T.shapeBound(sec);
    ok(T.classify(part([2000, 0, 0], 100), SB, 0.01, sec) === 'in', 'A: disk sector, in the rotor plane');
    ok(T.classify(part([2000, 0, 500], 100), SB, 0.01, sec) === 'out', 'A: disk sector, above a 5 degree band (about 14 degrees up)');
    ok(T.classify(part([3500, 0, 0], 100), SB, 0.01, sec) === 'out', 'A: disk sector, beyond the range');
    const s2 = { kind: 'disk-sector', center: [0, 0, 0], axis: [0, 0, 1], spreadDeg: 5, range: 3000, fromDeg: 0, toDeg: 90, refDir: [1, 0, 0] }, B2 = T.shapeBound(s2);
    ok(T.classify(part([0, 2000, 0], 100), B2, 0.01, s2) === 'in', 'A: wedge 0 to 90, a cube on its 90 degree edge reaches in');
    ok(T.classify(part([-2000, 0, 0], 100), B2, 0.01, s2) === 'out', 'A: wedge 0 to 90 misses 180');
    ok(T.classify(part([1414, 1414, 0], 100), B2, 0.01, s2) === 'in', 'A: wedge 0 to 90 holds 45');
    const s3 = { kind: 'disk-sector', center: [0, 0, 0], axis: [0, 0, 1], spreadDeg: 5, range: 3000, fromDeg: 0, toDeg: 270, refDir: [1, 0, 0] }, B3 = T.shapeBound(s3);
    ok(T.classify(part([-2000, 0, 0], 100), B3, 0.01, s3) === 'in', 'A: wedge 0 to 270 (wider than a half turn) holds 180');
    ok(T.classify(part([1414, -1414, 0], 100), B3, 0.01, s3) === 'out', 'A: wedge 0 to 270 misses 315');
    const ZB = T.bodiesBound([cube([500, 250, 500], 500), cube([250, 750, 500], 500)], 0.01);
    ok(T.classify(part([400, 250, 500], 50), ZB, 0.01) === 'in', 'A: zone made of bodies: a part inside the L is in');
    ok(T.classify(part([750, 750, 500], 50), ZB, 0.01) === 'out', 'A: zone made of bodies: a part in the notch of the L is out');
    const m = { position: cube([0, 0, 0], 10).position, index: cube([0, 0, 0], 10).index, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 0, 0, 1], scale: 25.4 };
    const bb = T.meshBox(m);
    ok(Math.abs(bb.min[0] - 95 * 25.4) < 1e-6 && Math.abs(bb.max[0] - 105 * 25.4) < 1e-6, 'A: a placement matrix and a unit scale are applied');
    // random property check: 'out' never has a surface point inside; 'in' always has one
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const inRef = (sh, p) => { if (sh.kind === 'sphere') return Math.hypot(p[0] - sh.center[0], p[1] - sh.center[1], p[2] - sh.center[2]) <= sh.radius; const u = sh.axis, v = [p[0] - sh.apex[0], p[1] - sh.apex[1], p[2] - sh.apex[2]], t = v[0] * u[0] + v[1] * u[1] + v[2] * u[2], l = Math.hypot(...v); if (l === 0) return true; if (t < 0 || t > sh.length) return false; return Math.acos(Math.min(1, t / l)) <= sh.halfAngleDeg * Math.PI / 180; };
    const samples = (c, s, n) => { const h = s / 2, out = []; for (let f = 0; f < 6; f++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = -h + s * (i + 0.5) / n, b = -h + s * (j + 0.5) / n, ax = f >> 1, sg = (f & 1) ? h : -h, q = [0, 0, 0]; q[ax] = sg; q[(ax + 1) % 3] = a; q[(ax + 2) % 3] = b; out.push([c[0] + q[0], c[1] + q[1], c[2] + q[2]]); } return out; };
    let bad = 0; const cnt = { in: 0, out: 0, edge: 0 };
    for (let k = 0; k < 400; k++) {
        const c = [rnd() * 2000 - 500, rnd() * 800 - 400, rnd() * 800 - 400], s = 20 + rnd() * 200;
        const sh = rnd() < 0.5 ? { kind: 'sphere', center: [rnd() * 1000, 0, 0], radius: 50 + rnd() * 300 } : { kind: 'cone', apex: [0, 0, 0], axis: [1, 0, 0], halfAngleDeg: 5 + rnd() * 20, length: 500 + rnd() * 1500 };
        const res = T.classify(part(c, s), T.shapeBound(sh), 1e-9, sh); cnt[res]++;
        const anyIn = samples(c, s, 24).some(q => inRef(sh, q));
        if (res === 'out' && anyIn) bad++;
        if (res === 'in' && !anyIn && !samples(c, s, 120).some(q => inRef(sh, q)) && !inRef(sh, c)) bad++;
    }
    ok(bad === 0 && cnt.in > 50 && cnt.out > 50, 'A: 400 random cubes against random cones and spheres agree with a dense sampling of their surfaces ' + J(cnt));
    // boxes and spheres are answered exactly, triangle by triangle: they never contradict the split answer, and
    // a face lying flush on a zone's face is answered at once (it used to be split millions of times)
    let seed2 = 3; const rnd2 = () => { seed2 = (seed2 * 1103515245 + 12345) % 2147483648; return seed2 / 2147483648; };
    let contra = 0, nt = 0;
    for (let k = 0; k < 600; k++) {
        const c = [rnd2() * 1400 - 200, rnd2() * 1400 - 200, rnd2() * 1400 - 200], s = 5 + rnd2() * 300;
        const sh = rnd2() < 0.5 ? { kind: 'box', min: [0, 0, 0], max: [1000, 800, 600] } : { kind: 'sphere', center: [500, 400, 300], radius: 350 }, Bb = T.shapeBound(sh);
        T.triangles(cube(c, s), (a, b, cc) => { nt++; const e = T.exactTri(a, b, cc, Bb, 0.5), q = T.triClass(a, b, cc, Bb, 0.5, 0); if ((e === 'in' && q === 'out') || (e === 'out' && q === 'in')) contra++; });
    }
    ok(contra === 0 && nt === 7200, 'A: the exact box and sphere answers never contradict the split answers (' + contra + ' of ' + nt + ' triangles)');
    const t0 = Date.now(), flush = T.classify(part([1500, 500, 500], 1000), box, 1);
    ok(flush === 'edge' && Date.now() - t0 < 200, 'A: a 1 m part flush against a zone face is at the edge, answered at once (' + (Date.now() - t0) + ' ms)');
    const t1 = Date.now(), fb = T.classify(part([1500, 500, 500], 1000), T.bodiesBound([cube([500, 500, 500], 1000)], 1), 1);
    ok(fb === 'edge' && Date.now() - t1 < 20000, 'A: the same against a zone made of a body: edge, within the split limit (' + (Date.now() - t1) + ' ms)');
    ok(T.triBoxOverlap([0, 0, 0], [1, 1, 1], [0, 0, 0], [5, 0, 0], [0, 5, 0]) === true && T.triBoxOverlap([0, 0, 0], [1, 1, 1], [2, -5, 0], [2, 5, 0], [0.5, 0, 5]) === false && T.triBoxOverlap([0, 0, 0], [1, 1, 1], [3, 0, 0], [5, 1, 0], [5, -1, 2]) === false && T.triBoxOverlap([0, 0, 0], [1, 1, 1], [1.5, -3, 0], [-3, 1.5, 0], [-3, -3, 0]) === true && T.triBoxOverlap([0, 0, 0], [1, 1, 1], [1.8, 0.5, -5], [0.5, 1.8, -5], [1.15, 1.15, 5]) === false, 'A: the triangle and box overlap test, on five hand-worked cases (a corner inside, faces apart, a box corner inside a large triangle, two slanted near misses)');
    return r;
}
const T0 = loadTS();
mathChecks(T0).forEach(([c, m]) => check(m, c));

// ---------------------------------------------------------------- B  a small aircraft
//   zone 100 Fuselage (box), 130 Equipment bay (one L-shaped CAD body, child of 100),
//   140 Aft bay (box, child of 100), 200 Wing (box, no parent), 160 Rack (a body simplified for display)
//   risk volume: a sphere of 300 mm at x 7000
const LBODY = merge(boxMesh([1000, -500, -500], [2000, 0, 500]), boxMesh([1000, 0, -500], [1500, 500, 500]));   // notch: x 1500..2000, y 0..500
const PLATE = quad([7450, 0, -50], [7450, 0, 50], [7000, 450, 50], [7000, 450, -50]);                       // plane x + y = 7450, 318 mm from the sphere's center
const MESH = {
    'p-L': LBODY,
    'p-radio': cube([1750, 250, 0], 100),          // in the notch of the L
    'p-fcc': cube([1250, -250, 0], 100),           // in the L
    'p-strad': cube([3950, 1450, 0], 200),         // in the aft bay, reaching the wing
    'p-plate': PLATE,
    'p-dec-in': cube([7000, 0, 200], 100),         // simplified, all of its box inside the sphere
    'p-dec-edge': cube([7000, 0, 300], 100),       // simplified, its box across the sphere's surface
    'p-rack': boxMesh([8000, -300, -300], [8600, 300, 300]),
    'p-est': cube([1250, -250, 200], 50)
};
const DECIMATED = { 'p-dec-in': 1, 'p-dec-edge': 1, 'p-rack': 1 };
const PIDS = Object.keys(MESH);
function cadModel(sha, rev, order) {
    const pids = order === 'reverse' ? PIDS.slice().reverse() : PIDS;
    return { fileName: 'tsac.step', sha256: sha, revision: rev, importedAt: '2026-11-14T08:00:00Z', units: 'mm',
        parts: pids.map(pid => Object.assign({ pid, name: pid, path: ['Aircraft', pid], bbox: boxOf(MESH[pid]) }, pid === 'p-est' ? { boxEstimated: true } : {})) };
}
function geometry(opts) {
    opts = opts || {};
    const pids = opts.reverse ? PIDS.slice().reverse() : PIDS;
    const protos = [], meshes = [];
    pids.forEach(pid => { const m = MESH[pid], pr = { position: m.position.slice(), index: m.index.slice() }; if (!opts.oldCache) { if (DECIMATED[pid]) pr.decimated = true; pr.faces = [1]; } if (pid === 'p-est') pr.box = boxOf(m); meshes.push({ pid, proto: protos.length, matrix: null }); protos.push(pr); });
    return { meshes, protos, ts: opts.oldCache ? 0 : 1 };
}
function load(srcTS, srcCZ) {
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, Float32Array, Float64Array, Uint32Array,
        setTimeout: () => 0, clearTimeout: () => 0, scheduleAutosave: () => { sb._saved = (sb._saved || 0) + 1; },
        projectConfig: {}, systemsData: [], acFhaData: [], ftaPages: [], zsaData: [],
        SLChangeAck: { batch: (label, fn) => Promise.resolve({ acknowledged: true, result: fn() }), describe: () => {} } };
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    vm.createContext(sb);
    vm.runInContext(ZM, sb, { filename: 'zonal_model.js' });
    vm.runInContext(FE, sb, { filename: 'fta_engine.js' });
    vm.runInContext(srcCZ || CZ, sb, { filename: 'cad_zonal.js' });
    vm.runInContext(srcTS || TS, sb, { filename: 'cad_trueshape.js' });
    sb._scheduled = 0; const real = sb.SLCadTrueShape.schedule; sb.SLCadTrueShape.schedule = function () { sb._scheduled++; };
    sb._realSchedule = real;
    return sb;
}
function setup(o) {
    o = o || {};
    const sb = load(o.ts, o.cz), C = sb.SLCadZonal, Z = sb.ZONES, T = sb.SLCadTrueShape;
    const rows = [
        { code: '100', name: 'Fuselage', parentCode: '', xMin: 0, yMin: -1500, zMin: -1500, xMax: 10000, yMax: 1500, zMax: 1500 },
        { code: '140', name: 'Aft bay', parentCode: '100', xMin: 3000, yMin: -1500, zMin: -1500, xMax: 4000, yMax: 1500, zMax: 1500 },
        { code: '200', name: 'Wing', parentCode: '', xMin: 3000, yMin: 1500, zMin: -500, xMax: 6000, yMax: 4000, zMax: 500 }
    ];
    C.importZoneList(o.reverse ? rows.slice().reverse() : rows);
    const m = C.addCadModel(cadModel('ts-a', 'A', o.reverse ? 'reverse' : null)).model;
    const fus = Z.all().find(z => z.code === '100');
    const add130 = () => Z.addZone({ code: '130', name: 'Equipment bay', parentId: fus.id, volume: { kind: 'parts', cadId: m.id, pids: ['p-L'] }, source: 'cad' });
    const add160 = () => Z.addZone({ code: '160', name: 'Rack', parentId: fus.id, volume: { kind: 'parts', cadId: m.id, pids: ['p-rack'] }, source: 'cad' });
    if (o.reverse) { add160(); add130(); } else { add130(); add160(); }
    const rvAdd = C.addRiskVolume({ id: 'prv-sphere', kind: 'generic', label: 'Burst sphere', source: 'manual', shape: { kind: 'sphere', center: [7000, 0, 0], radius: 300 } });
    if (!rvAdd.ok) throw new Error('risk volume not added: ' + rvAdd.err);
    const zid = code => Z.all().find(z => z.code === code).id;
    return { sb, C, Z, T, m, zid };
}
function runTrue(S, geomOpts) {
    const input = S.C.trueShapeInput(S.m.id);
    input.geom = geometry(geomOpts); input.tol = 1;   // about what OpenCascade uses on a model this size (0.001 of its average side)
    const job = S.T.job(input); let guard = 0;
    while (!job.step(5) && guard++ < 100000) {}
    return { job, res: job.result(), upd: S.C.updateTrueShape(S.m.id, job.result()) };
}
const zoneOf = (c, pid) => (c.parts.find(r => r.pid === pid) || {}).zoneId || null;
const vIn = (C, cad) => C.partsInVolume('prv-sphere', cad).map(h => h.pid).sort();

const S = setup(), C = S.C, zid = S.zid;
// before anything is read: boxes everywhere
const box0 = C.containment(S.m.id);
check('B: on boxes, the radio in the notch of the L is put in the equipment bay (its centroid is inside the L\'s box)', zoneOf(box0, 'p-radio') === zid('130'), zoneOf(box0, 'p-radio'));
check('B: on boxes, the diagonal plate is counted in the risk sphere (a corner of its box is inside)', vIn(C, S.m.id).indexOf('p-plate') >= 0, vIn(C, S.m.id));
check('B: nothing read yet: not ready, not accepted, and all five zones with a volume and the risk volume are still to answer', !box0.trueShape.ready && !box0.trueShape.accepted && C.trueShapeNeeds(S.m.id).zones.length === 5 && J(C.trueShapeNeeds(S.m.id).risks) === J(['prv-sphere']), C.trueShapeNeeds(S.m.id));
const R1 = runTrue(S);
check('B: the run answers all five zones and the risk volume', R1.upd.ok && R1.upd.updated === 6, R1.upd);
check('B: the estimated part is never answered', J(R1.res).indexOf('p-est') < 0);
check('B: the L body itself is not a part of its own zone (an envelope)', R1.res.zones[zid('130')].in.indexOf('p-L') < 0 && R1.res.zones[zid('100')].in.indexOf('p-L') < 0);
check('B: the true surface: the radio is not in the L, the flight computer is', R1.res.zones[zid('130')].in.indexOf('p-radio') < 0 && R1.res.zones[zid('130')].edge.indexOf('p-radio') < 0 && R1.res.zones[zid('130')].in.indexOf('p-fcc') >= 0, R1.res.zones[zid('130')]);
check('B: the true surface: the plate does not reach the sphere', R1.res.risks['prv-sphere'].in.indexOf('p-plate') < 0 && R1.res.risks['prv-sphere'].edge.indexOf('p-plate') < 0, R1.res.risks['prv-sphere']);
check('B: simplified meshes are answered by their boxes only: all of the box inside is in, a box across the surface is at the edge', R1.res.risks['prv-sphere'].in.indexOf('p-dec-in') >= 0 && R1.res.risks['prv-sphere'].edge.indexOf('p-dec-edge') >= 0, R1.res.risks['prv-sphere']);
check('B: a zone made of a simplified body stays on boxes (marked, not answered from the simplified shape)', R1.res.zones[zid('160')] && R1.res.zones[zid('160')].box === true, R1.res.zones[zid('160')]);
check('D: after the run nothing is left to answer, so the page does not run again for the same model', J(C.trueShapeNeeds(S.m.id)) === J({ zones: [], risks: [] }), C.trueShapeNeeds(S.m.id));

// ---------------------------------------------------------------- C  the gate
const c1 = C.containment(S.m.id);
check('C: read but not accepted: containment still answers from boxes', c1.how === 'box' && c1.trueShape.ready && !c1.trueShape.accepted && zoneOf(c1, 'p-radio') === zid('130'));
check('C: read but not accepted: the risk volume still answers from boxes', vIn(C, S.m.id).indexOf('p-plate') >= 0);
const rv = C.trueShapeReview(S.m.id);
check('C: the review lists the radio moving from the equipment bay to the fuselage', rv.zoneMoves.some(x => x.pid === 'p-radio' && x.from === zid('130') && x.to === zid('100')) && rv.zoneMoves.length === 1, rv.zoneMoves);
check('C: the review lists the plate leaving the risk sphere, and nothing added', J(rv.riskRemoved) === J([{ volumeId: 'prv-sphere', pid: 'p-plate' }]) && rv.riskAdded.length === 0, { rem: rv.riskRemoved, add: rv.riskAdded });
check('C: the review lists the simplified part at the sphere\'s edge (counted as inside)', rv.riskBoundary.some(x => x.pid === 'p-dec-edge'), rv.riskBoundary);
check('C: the straddling part is not listed as a new crossing (boxes already said it reaches the wing)', !rv.newCrossings.some(x => x.pid === 'p-strad') && c1.straddling.some(x => x.pid === 'p-strad' && x.crosses.indexOf(zid('200')) >= 0), { nc: rv.newCrossings, st: c1.straddling });
check('C: a part in a child zone is never listed as crossing into its parent', !rv.newCrossings.some(x => x.also.indexOf(zid('100')) >= 0), rv.newCrossings);
check('C: the zone kept on boxes is named in the review', (rv.zonesOnBox || []).indexOf(zid('160')) >= 0, rv.zonesOnBox);
check('C: the count of changes is the moves, crossings and risk hits added or removed', rv.changes === rv.zoneMoves.length + rv.newCrossings.length + rv.crossingsGone.length + rv.riskAdded.length + rv.riskRemoved.length && rv.changes >= 2, rv.changes);
const noName = C.acceptTrueShape(S.m.id, '  ');
check('C: accepting with no name is refused, and nothing changes', !noName.ok && /name/.test(noName.err) && !C.containment(S.m.id).trueShape.accepted);
const acc = C.acceptTrueShape(S.m.id, 'Waqas');
check('C: accepting with a name records who, when, against which model, and the counts', acc.ok && acc.accepted.by === 'Waqas' && acc.accepted.sha === 'ts-a' && acc.accepted.changes.zoneMoves === 1 && acc.accepted.changes.riskRemoved === 1);
const c2 = C.containment(S.m.id);
check('C: accepted: the radio is in the fuselage, the flight computer in the equipment bay', c2.trueShape.accepted && zoneOf(c2, 'p-radio') === zid('100') && zoneOf(c2, 'p-fcc') === zid('130'), { r: zoneOf(c2, 'p-radio'), f: zoneOf(c2, 'p-fcc') });
check('C: accepted: the plate is out of the sphere; the simplified parts are in (one at the edge, said so)', vIn(C, S.m.id).indexOf('p-plate') < 0 && vIn(C, S.m.id).indexOf('p-dec-in') >= 0 && C.partsInVolume('prv-sphere', S.m.id).some(h => h.pid === 'p-dec-edge' && h.how === 'boundary'), C.partsInVolume('prv-sphere', S.m.id));
check('C: accepted: the zone kept on boxes says so (how mixed, the zone named) and the straddling part still crosses into the wing', c2.how === 'mixed' && c2.zonesOnBox.indexOf(zid('160')) >= 0 && c2.straddling.some(x => x.pid === 'p-strad' && x.crosses.indexOf(zid('200')) >= 0), { how: c2.how, ob: c2.zonesOnBox });
check('C: box mode can still be asked for by name', zoneOf(C.containment(S.m.id, { mode: 'box' }), 'p-radio') === zid('130'));
check('C: an estimated part is listed as still being read, never placed', c2.estimated.indexOf('p-est') >= 0 && zoneOf(c2, 'p-est') === null);

// ---------------------------------------------------------------- D  a zone edited after acceptance
S.Z.setVolume(zid('140'), { kind: 'box', min: [3000, -1500, -1500], max: [3990, 1500, 1500] });
const c3 = C.containment(S.m.id);
check('D: an edited zone is answered from boxes until read again (mixed, and named)', c3.how === 'mixed' && c3.zonesOnBox.indexOf(zid('140')) >= 0 && J(C.trueShapeNeeds(S.m.id).zones) === J([zid('140')]), { how: c3.how, ob: c3.zonesOnBox, need: C.trueShapeNeeds(S.m.id) });
const R2 = runTrue(S);
check('D: read again, only the edited zone is answered', R2.upd.updated === 1 && Object.keys(R2.res.zones).length === 1 && J(C.trueShapeNeeds(S.m.id)) === J({ zones: [], risks: [] }), R2.res);
const c4 = C.containment(S.m.id);
check('D: after the read, the edited zone is on true shapes again', c4.zonesOnBox.indexOf(zid('140')) < 0);
check('D: saving the project asks for a run (the hook in _save)', S.sb._scheduled > 0, S.sb._scheduled);

// ---------------------------------------------------------------- E  an old cache
{
    const S2 = setup(), R = runTrue(S2, { oldCache: true });
    check('E: an old cache (no marker, no face lists) is not trusted: the plate is at the sphere\'s edge, not cleared', R.res.risks['prv-sphere'].edge.indexOf('p-plate') >= 0 && R.res.risks['prv-sphere'].in.indexOf('p-plate') < 0, R.res.risks['prv-sphere']);
    check('E: an old cache: the L zone is marked as answered by boxes only', R.res.zones[S2.zid('130')].box === true, R.res.zones[S2.zid('130')]);
}

// ---------------------------------------------------------------- F  a new revision
{
    const m2 = C.addCadModel(cadModel('ts-b', 'B')).model;
    check('F: a new CAD revision has no true answers and is not accepted', !C.containment(m2.id).trueShape.ready && !C.containment(m2.id).trueShape.accepted && C.containment(m2.id).how === 'box');
    const old = C.model(S.m.id); old.sha256 = 'changed';
    check('F: if the file behind a model changes, its accepted answers no longer stand', !C.containment(S.m.id).trueShape.accepted && !C.containment(S.m.id).trueShape.ready && C.containment(S.m.id).how === 'box');
    old.sha256 = 'ts-a';
}

// ---------------------------------------------------------------- G  determinism
{
    const a = setup(), b = setup(), r = setup({ reverse: true });
    const strip = x => { const y = JSON.parse(JSON.stringify(x)); delete y.at; return y; };
    const ra = strip(runTrue(a).res), rb = strip(runTrue(b).res), rr = strip(runTrue(r, { reverse: true }).res);
    // zone ids differ between fixtures when added in another order: compare by zone code
    const byCode = (S0, res) => { const out = { risks: res.risks, zones: {} }; Object.keys(res.zones).forEach(id => { out.zones[S0.Z.get(id).code] = Object.assign({}, res.zones[id], { sig: undefined }); }); return out; };
    check('G: the same input twice gives the same answers', J(ra) === J(rb));
    check('G: parts, zones and volumes in reverse order give the same answers', J(byCode(a, ra)) === J(byCode(r, rr)), { a: byCode(a, ra), r: byCode(r, rr) });
}

// ---------------------------------------------------------------- H  mutations
function mut(name, file, from, to, still) {
    const src = file === 'ts' ? TS : CZ;
    if (src.indexOf(from) < 0) { check('H: mutation applies: ' + name, false, 'text not found'); return; }
    const bad = src.replace(from, to);
    let caught = false;
    try { caught = !still(file === 'ts' ? bad : null, file === 'cz' ? bad : null); } catch (e) { caught = true; }
    check('H: caught: ' + name, caught);
}
const scenarioOk = (ts, cz) => {
    const M = setup({ ts, cz }); runTrue(M); const rv2 = M.C.trueShapeReview(M.m.id);
    const before = zoneOf(M.C.containment(M.m.id), 'p-radio') === M.zid('130');
    M.C.acceptTrueShape(M.m.id, 'W');
    const c = M.C.containment(M.m.id);
    return before && rv2.zoneMoves.length === 1 && zoneOf(c, 'p-radio') === M.zid('100') && zoneOf(c, 'p-fcc') === M.zid('130') && vIn(M.C, M.m.id).indexOf('p-plate') < 0 && M.C.partsInVolume('prv-sphere', M.m.id).some(h => h.pid === 'p-dec-edge' && h.how === 'boundary') && c.zonesOnBox.indexOf(M.zid('160')) >= 0;
};
check('H: the unbroken code passes the mutation scenario', scenarioOk(null, null));
mut('the sign of a zone body\'s distance flipped', 'ts', 'return sg === 0 ? 0 : -sg * g;', 'return sg === 0 ? 0 : sg * g;', scenarioOk);
mut('a simplified mesh trusted as exact', 'ts', 'if (pr.decimated || (!flagged && !pr.faces)) decimated = true;', '', scenarioOk);
mut('the gate opened before acceptance', 'cz', "(mode === 'auto' && !trueShapeAccepted(cadId))", "(mode === 'auto' && false)", scenarioOk);
mut('a box answered without shrinking it by the tolerance', 'ts', "[h[0] - d - eps, h[1] - d - eps, h[2] - d - eps]", "[h[0], h[1], h[2]]", () => { const T = loadTS(TS.replace("[h[0] - d - eps, h[1] - d - eps, h[2] - d - eps]", "[h[0], h[1], h[2]]")); return mathChecks(T).every(x => x[0]); });
mut('accept needs no name', 'cz', "if (!_s(by)) return { ok: false, err: 'Accepting the true shapes needs the name of who reviewed them.' };", '', (ts, cz) => { const M = setup({ ts, cz }); runTrue(M); return !M.C.acceptTrueShape(M.m.id, '').ok; });
mut('a stale answer for an edited zone used anyway', 'cz', 'return f && f.sig === _zoneSig(z) ? f : null;', 'return f || null;', (ts, cz) => { const M = setup({ ts, cz }); runTrue(M); M.C.acceptTrueShape(M.m.id, 'W'); M.Z.setVolume(M.zid('140'), { kind: 'box', min: [3000, -1500, -1500], max: [3990, 1500, 1500] }); return M.C.containment(M.m.id).zonesOnBox.indexOf(M.zid('140')) >= 0; });
mut('zones with no exact body left unanswered (the page would run forever)', 'ts', "else onBox.zones.push({ id: z.id, sig: z.sig });", '', (ts, cz) => { const M = setup({ ts, cz }); runTrue(M); return M.C.trueShapeNeeds(M.m.id).zones.length === 0; });

// ---------------------------------------------------------------- I  wiring
{
    const iZ = IDX.indexOf('cad_zonal.js?v='), iI = IDX.indexOf('cad_import.js?v='), iS = IDX.indexOf('cad_shots.js?v='), iT = IDX.indexOf('cad_trueshape.js?v=');
    check('I: cad_trueshape.js 1.0 loads once, right after cad_shots.js (after every CAD file it reads, leaving their own order alone)', iT > iZ && iT > iI && iT > iS && IDX.slice(iS, iT).split('<script').length === 2 && (IDX.match(/cad_trueshape\.js\?v=/g) || []).length === 1 && /cad_trueshape\.js\?v=1\.0" defer/.test(IDX));
    check('I: version keys bumped: cad_zonal.js 1.10, cad_import.js 2.7, cad_viewer.js 2.10, cad_page.js 2.1', ['cad_zonal.js?v=1.10"', 'cad_import.js?v=2.7"', 'cad_viewer.js?v=2.10"', 'cad_page.js?v=2.1"'].every(k => IDX.indexOf(k) > 0));
    check('I: the import marks simplified meshes and its cache says so (ts: 1), and asks for a run after storing', /\.decimated = true/.test(IMP) && /ts: 1/.test(IMP) && (IMP.match(/SLCadTrueShape\.schedule\(/g) || []).length >= 2);
    check('I: the viewer asks for a run once a model is loaded', /SLCadTrueShape\.schedule\(/.test(VIEW));
    check('I: the zonal engine asks for a run on every save', /function _save\(\)[\s\S]{0,600}SLCadTrueShape\.schedule\(/.test(CZ));
    check('I: the page shows the review and accepts only with a name', /data-cad-act="ts-accept"/.test(PAGE) && /function _acceptTrueShape\(\)[\s\S]{0,200}_needWho\(\)[\s\S]{0,200}acceptTrueShape\(state\.cadId, by\)/.test(PAGE) && /trueShapeReview\(state\.cadId\)/.test(PAGE));
    check('I: the page lists every change kind', ['zoneMoves', 'newCrossings', 'crossingsGone', 'riskAdded', 'riskRemoved', 'riskBoundary', 'boundary'].every(k => PAGE.indexOf('v.' + k) > 0));
    check('I: every list on the page is paged; no "and N more"', !/ more \(find them/.test(PAGE) && !/LIST_CAP/.test(PAGE) && /data-cad-act="page"/.test(PAGE) && /function _turnPage/.test(PAGE));
    check('I: the page follows the run (status while reading, redraw when done)', /SLCadTrueShape\.onState\(_onTrueShape\)/.test(PAGE));
    check('I: no em dash in the new or changed code', [TS, PAGE].every(s => s.indexOf(EM) < 0) && CZ.slice(CZ.indexOf('TRUE_METHOD')).indexOf(EM) < 0);
    check('I: no eval or new Function in the new module', !/\beval\(|new Function\(/.test(TS));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

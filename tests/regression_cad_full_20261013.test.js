#!/usr/bin/env node
/*
 * Regression: the CAD Model page brought to full review capability (13 Oct 2026, cad-C).
 *
 * THE REQUIREMENT (Waqas): the CAD Model page matches the full 3DEXPERIENCE viewing and review
 * experience, view only: large assemblies (hundreds of thousands of parts), capped multi-plane
 * and box sections, EXACT measurement on the B-rep (not the display mesh), clash and clearance,
 * a product tree with search / filter / multi-select / properties / color by attribute, explode,
 * ghost, shared saved views, a view cube, 3D notes pinned to parts, AP242 PMI on the model,
 * revision compare linked to the review list, walk with gravity and collision, PNG snapshots.
 * CAD files and geometry never leave the customer's machine and never go into projectConfig;
 * only metadata, saved views and notes do.
 *
 * This runs Safety Lab's own OpenCascade build (site/vendor/occt-fast: OCCT 7.8.1, unmodified,
 * LGPL-2.1, native wasm exceptions; tools/occt/build_occt.sh), formerly opencascade.js 2.0.0-beta.b5ff984,
 * LGPL-2.1, joined from its parts exactly as the worker does) on:
 *   tests/fixtures/cad/toy_aircraft.step               (the 13 Oct toy aircraft, AP214)
 *   tests/fixtures/cad/nist_stc_06_asme1_ap242-e3.stp  (NIST MBE PMI test model STC-06, AP242
 *       edition 3, semantic PMI with presentation; a U.S. Government work from the NIST "MBE PMI
 *       Validation and Conformance Testing" set, nist.gov/document/nist-pmi-step-files)
 * and the occt-import-js 0.0.23 build for the reader parity check.
 *
 *   A  the vendored full build: parts under 25 MiB, joined sha256 = manifest, licenses, glue
 *   B  instancing: rigid copies share a prototype; stretched, mirrored or different shapes do not
 *   C  the two readers name every part the same (pids), and the full reader reports progress
 *      inside the STEP read
 *   D  exact queries on the B-rep: radius, lengths, volume, minimum distance, interference, picks
 *   E  AP242 PMI: dimensions, tolerances, datums, checked against the model geometry
 *   F  drawing at scale (cad_render.js): chunk plan, level of detail, BVH and box hierarchy rays,
 *      triangle distance, mesh distance, clash scan, explode
 *   G  shared records (cad_review.js): saved views, notes, color by, compare, snapshot labels
 *   H  wiring
 *   M  mutations: each deliberate break must turn a check red
 *
 * Run: node tests/regression_cad_full_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const J = JSON.stringify;
const near = (a, b, t) => Math.abs(a - b) <= t;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const EM = String.fromCharCode(0x2014);
const I = require(path.join(SITE, 'cad_import.js'));
globalThis.SLCadImport = I;
const B = require(path.join(SITE, 'cad_brep.js'));
const R = require(path.join(SITE, 'cad_render.js'));
const RV = require(path.join(SITE, 'cad_review.js'));
const X = require(path.join(SITE, 'cad_exact.js'));
const FIX = path.join(__dirname, 'fixtures', 'cad', 'toy_aircraft.step');
const PMIF = path.join(__dirname, 'fixtures', 'cad', 'nist_stc_06_asme1_ap242-e3.stp');
const subtleSha = u8 => crypto.webcrypto.subtle.digest('SHA-256', u8).then(h => Buffer.from(h).toString('hex'));
// A module evaluated from (possibly mutated) source, with the given globals.
function load(src, file, extra) {
    const sb = Object.assign({ TextEncoder, TextDecoder, console, Math, Date, JSON, Float32Array, Float64Array, Uint32Array, Uint8Array, Int32Array, ArrayBuffer, Map, Set, Promise, Error, Object, Array, String, Number, isFinite, parseInt, parseFloat, RegExp, Infinity, NaN, performance: { now: () => Date.now() }, TextDecoder }, extra || {});
    sb.self = sb; sb.globalThis = sb; sb.window = undefined;
    vm.runInNewContext(src, sb, { filename: file });
    return sb;
}

(async () => {
  // ===================================================================== A
  console.log('[A] our own OpenCascade build, vendored');
  const FAST = path.join(SITE, 'vendor', 'occt-fast');
  {
    const w = fs.readFileSync(path.join(FAST, 'slcad_occt.wasm')), glue = fs.readFileSync(path.join(FAST, 'slcad_occt.js'), 'utf8');
    check('one wasm file under 25 MiB (Cloudflare asset limit), a quarter of the general build', w.length < 25 * 1024 * 1024 && w.length < 16 * 1024 * 1024, String(w.length));
    check('a real WebAssembly module', w[0] === 0 && w[1] === 0x61 && w[2] === 0x73 && w[3] === 0x6d);
    check('its loader builds no code at run time (no eval, no Function constructor)', !/\beval\s*\(|new Function\s*\(/.test(glue));
    check('licenses travel with it (OCCT: LGPL 2.1 text and the OCCT exception)', /LESSER GENERAL PUBLIC LICENSE/i.test(fs.readFileSync(path.join(FAST, 'LICENSE_LGPL_21.txt'), 'utf8')) && /Open CASCADE Exception/i.test(fs.readFileSync(path.join(FAST, 'OCCT_LGPL_EXCEPTION.txt'), 'utf8')));
    const BS = fs.readFileSync(path.join(ROOT, 'tools', 'occt', 'build_occt.sh'), 'utf8');
    check('the build script reproduces it: OCCT 7.8.1 unmodified, native wasm exceptions, no signal setjmp, no eval', /V7_8_1/.test(BS) && /-fwasm-exceptions/.test(BS) && /-UOCC_CONVERT_SIGNALS/.test(BS) && /DYNAMIC_EXECUTION=0/.test(BS) && /slcad_occt\.cpp/.test(BS));
    check('the old 50 MB general build is gone from the site', !fs.existsSync(path.join(SITE, 'vendor', 'ocjs')));
  }
  const FM = await require(path.join(SITE, 'vendor', 'occt-fast', 'slcad_occt.js'))({ print: () => {}, printErr: () => {} });
  const occt = await require(path.join(SITE, 'vendor', 'occt', 'occt-import-js.js'))();

  // ===================================================================== B
  console.log('\n[B] instancing: one prototype per repeated shape, a placement per copy');
  {
    const box = (w, d, h) => { const P = [], X2 = []; const v = [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0], [0, 0, h], [w, 0, h], [w, d, h], [0, d, h]]; const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]; f.forEach(t => { const b = P.length / 3; t.forEach(i => P.push(...v[i])); X2.push(b, b + 1, b + 2); }); return { position: new Float32Array(P), index: new Uint32Array(X2) }; };
    const place = (g, m) => ({ position: Float32Array.from(Array.from({ length: g.position.length / 3 }, (_, i) => { const x = g.position[i * 3], y = g.position[i * 3 + 1], z = g.position[i * 3 + 2]; return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }).flat()), index: g.index });
    const rot = (a, tx, ty, tz) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1]; };
    const b0 = box(60, 40, 5);
    const items = [b0, place(b0, rot(0.7, 1000, 2000, 300)), place(b0, rot(-2.1, -4000, 15000, 900)), place(box(20, 20, 30), rot(0, 0, 0, 0)), place(b0, [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 50, 0, 0, 1]), place(b0, [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])];
    const fi = I.findInstances(items);
    check('two rotated, translated copies share the first box\'s prototype', fi.refs[1].proto === 0 && fi.refs[2].proto === 0 && fi.refs[0].matrix === null);
    check('the placement maps every vertex onto the copy (float32 noise only)', (() => { const m = fi.refs[2].matrix, P = items[0].position, Q = items[2].position; for (let i = 0; i < P.length; i += 3) { const w = [m[0] * P[i] + m[4] * P[i + 1] + m[8] * P[i + 2] + m[12], m[1] * P[i] + m[5] * P[i + 1] + m[9] * P[i + 2] + m[13], m[2] * P[i] + m[6] * P[i + 1] + m[10] * P[i + 2] + m[14]]; if (Math.hypot(w[0] - Q[i], w[1] - Q[i + 1], w[2] - Q[i + 2]) > 0.05) return false; } return true; })());
    check('a different box (same triangle list) is its own prototype', fi.refs[3].proto !== 0);
    check('a mirrored copy is refused (its triangles would face the wrong way)', fi.refs[4].proto !== 0);
    check('a stretched copy is refused (a different part)', fi.refs[5].proto !== 0);
    check('deterministic: the same input gives the same prototypes', J(I.findInstances(items).refs.map(r => r.proto)) === J(fi.refs.map(r => r.proto)));
    const v1 = { meshes: [{ pid: 'a', position: b0.position, index: b0.index, color: [1, 0, 0] }] };
    const v2 = I.normalizeGeometry(v1);
    check('a cache from before instancing (v1) reads as v2', v2.protos.length === 1 && v2.meshes[0].proto === 0 && v2.meshes[0].matrix === null && v2.meshes[0].color[0] === 1);
  }

  // ===================================================================== C
  console.log('\n[C] the two readers name every part the same; progress inside the read');
  const toyBytes = new Uint8Array(fs.readFileSync(FIX));
  const prog = [];
  const toy = B.convertFast(FM, toyBytes, { keep: true, onProgress: (ph, f) => prog.push([ph, f]) });
  const m1 = I.convertStep(toyBytes, occt);
  {
    const a = m1.parts, b = toy.model.parts;
    check('same pids in the same order', J(a.map(p => p.pid)) === J(b.map(p => p.pid)), J(b.map(p => p.pid)));
    check('same names, part numbers and designators', J(a.map(p => [p.name, p.partNumber, p.designator || null])) === J(b.map(p => [p.name, p.partNumber, p.designator || null])));
    check('same boxes to 0.01 mm', a.every((p, i) => [0, 1, 2].every(j => near(p.bbox.min[j], b[i].bbox.min[j], 0.01) && near(p.bbox.max[j], b[i].bbox.max[j], 0.01))));
    check('the full reader meshes each shape once: 4 prototypes, the copies placed', toy.model.protos.length === 4 && toy.model.meshes.filter(m => m.matrix).length >= 4);
    check('every prototype keeps its B-rep face ranges (a picked triangle names its face)', toy.model.protos.every(p => Array.isArray(p.faces) && p.faces.length >= 3 && p.faces[p.faces.length - 1].last === p.index.length / 3 - 1));
    const parse = prog.filter(x => x[0] === 'parse').map(x => x[1]);
    check('progress inside the read: the parse phase reports a rising fraction of the file to 1', parse.length >= 10 && parse.every((f, i) => i === 0 || f >= parse[i - 1]) && parse[0] === 0 && parse[parse.length - 1] === 1, J(parse.slice(0, 6)));
    check('then the transfer (one OpenCascade call, no fraction) and the meshing', prog.some(x => x[0] === 'transfer' && x[1] === null) && prog.some(x => x[0] === 'mesh'));
    check('the parser reached the end of the file (the fraction is counted against the whole file)', parse[parse.length - 1] === 1);
    const mm = new Uint8Array(Buffer.from(Buffer.from(toyBytes).toString('latin1').replace(/SI_UNIT\(\.MILLI\.,\.METRE\.\)/g, 'SI_UNIT($,.METRE.)'), 'latin1'));
    const inM = B.convertFast(FM, mm, { keep: false }).model, f1 = inM.parts.find(p => p.name === 'Fuselage');
    check('a file in meters comes out in mm from the full reader too', f1 && near(f1.bbox.max[0], 10000 * 1000, 1));
    const ss = B.openSessionFast(FM, toyBytes);
    check('a session opened later (geometry already cached) names the parts the same, without meshing', J(ss.pids()) === J(a.map(p => p.pid)));
    ss.close();
  }

  // ===================================================================== D
  console.log('\n[D] exact queries on the B-rep');
  const s = toy.session;
  {
    const FUS = 'p:Toy Aircraft/Fuselage#1', E1 = 'p:Toy Aircraft/Propulsion/Engine Nacelle#1', E2 = 'p:Toy Aircraft/Propulsion/Engine Nacelle#2', F1 = 'p:Toy Aircraft/Avionics/Flight Control Computer#1', F2 = 'p:Toy Aircraft/Avionics/Flight Control Computer#2', H = 'p:Toy Aircraft/Harness W1#1';
    const fus = s.faces(FUS).map((_, i) => s.faceInfo(FUS, i));
    const cyl = fus.find(f => f.type === 'cylinder');
    check('fuselage: a cylinder of radius exactly 1000 along X', cyl && cyl.radius === 1000 && Math.abs(Math.abs(cyl.axis[0]) - 1) < 1e-12);
    const eds = s.edges(FUS).map((_, i) => s.edgeInfo(FUS, i));
    check('its circular edges: radius 1000, length 2 pi 1000 (to 1e-9)', eds.filter(e => e.type === 'circle').length === 2 && eds.filter(e => e.type === 'circle').every(e => e.radius === 1000 && near(e.length, 2 * Math.PI * 1000, 1e-9) && e.closed));
    check('its seam: a straight edge of exactly 10000', eds.some(e => e.type === 'line' && near(e.length, 10000, 1e-9)));
    const pr = s.properties(F1);
    check('computer box: volume 400 x 300 x 200 = 24,000,000 mm3 exactly, 6 faces, 12 edges, 8 vertices', near(pr.volume, 24e6, 1e-6) && pr.faces === 6 && pr.edges === 12 && pr.vertices === 8, J(pr));
    const d = s.distance(E1, E2);
    check('minimum distance between the nacelles (BRepExtrema): exactly 4300', d && near(d.distance, 4300, 1e-9) && d.exact === true);
    const dFF = s.distance(F1, F2);
    check('between the two computers: exactly 300', dFF && near(dFF.distance, 300, 1e-9));
    const iv = s.interference(FUS, F1), ih = s.interference(FUS, H), hv = s.properties(H).volume;
    check('interference of a computer inside the solid fuselage: its whole volume, 24,000,000 mm3 (exact boolean)', iv.ok && near(iv.volume, 24e6, 1e-3), iv.volume);
    check('the harness leaves the fuselage: only part of it is shared', ih.ok && ih.volume > 0 && ih.volume < hv - 1, ih.volume + ' of ' + hv);
    const pk = s.pick(F1, [2000, -440, -400], {});
    check('a pick on the computer\'s top face: plane, normal +Z, nearest edge a 400 mm line 10 mm away, point on the true surface', pk.face.type === 'plane' && J(pk.face.normal.map(Math.round)) === '[0,0,1]' && pk.edge.type === 'line' && near(pk.edge.length, 400, 1e-9) && near(pk.edge.distance, 10, 1e-9) && near(pk.point[2], -400, 1e-9));
    const pk2 = s.pick(F1, [1800, -450, -400], {});
    check('a pick at a corner finds the B-rep vertex there', pk2.vertex && near(pk2.vertex.distance, 0, 1e-9));
    const ang = X.angleBetween(s.pick(F1, [2000, -300, -400], {}), s.pick(F1, [1800, -300, -500], {}));
    check('angle between the top and an end face: exactly 90 degrees', ang && near(ang.degrees, 90, 1e-9));
    check('angle helper: lines and normals ignore their sense', near(X.angleDeg([1, 0, 0], [-1, 1, 0], true), 45, 1e-9) && near(X.angleDeg([1, 0, 0], [-1, 1, 0]), 135, 1e-9));
    check('describePick says it in words', /cylinder R 1000\.0 mm/.test(X.describePick(s.pick(FUS, [5000, 0, 1000], {}))), X.describePick(s.pick(FUS, [5000, 0, 1000], {})));
  }

  // ===================================================================== E
  console.log('\n[E] AP242 PMI');
  {
    const ps = B.openSessionFast(FM, new Uint8Array(fs.readFileSync(PMIF)));
    const pm = ps.pmi();
    const k = t => pm.filter(x => x.kind === t);
    check('STC-06 carries 19 dimensions, 25 geometric tolerances, 51 datums', k('dimension').length === 19 && k('tolerance').length === 25 && k('datum').length === 51, J([k('dimension').length, k('tolerance').length, k('datum').length]));
    check('items carry their presentation (graphical PMI) and a text position', pm.filter(x => x.presentation && x.presentation.length).length >= 90 && pm.filter(x => x.textPoint).length >= 90);
    check('items point at the part they annotate', pm.filter(x => x.pids.length).length >= 90);
    const dims = k('dimension'), checked = dims.filter(x => x.modelValue != null);
    check('dimension nominals are checked against the model\'s own geometry: 12 agree, the one that does not is flagged, not hidden', checked.length === 13 && checked.filter(x => x.agrees === true).length === 12 && checked.filter(x => x.agrees === false).length === 1, J(checked.map(x => [x.value, x.modelValue, x.agrees])));
    const hole = dims.find(x => x.written && x.written.value === 0.8125);
    check('a nominal written in inches (0.8125) is shown in mm (20.6375) only because the model confirms it, and says so', hole && near(hole.value, 20.6375, 1e-9) && /inch/.test(hole.unitNote));
    check('drawing text: diameter with tolerance, tolerance frame with its datums', X.pmiText(hole) === '\u2300' + '20.637 \u00b10.508' && /^\u2316 0\.381( \| [A-Z])+$/.test(X.pmiText(k('tolerance').find(t => t.type === 'Position'))), X.pmiText(hole) + ' / ' + X.pmiText(k('tolerance').find(t => t.type === 'Position')));
    check('a toy without PMI says none', s.pmi().length === 0);
    ps.close();
  }

  // ===================================================================== F
  console.log('\n[F] drawing at scale (cad_render.js)');
  {
    let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const its = Array.from({ length: 5000 }, (_, i) => ({ center: [rnd() * 1000, rnd() * 1000, rnd() * 1000], proto: i % 7, verts: 100 + (i % 7) * 10 }));
    const box = { min: [0, 0, 0], max: [1000, 1000, 1000] };
    const pl = R.planChunks(its, box, { maxInstances: 512, maxVertices: 50000 });
    check('chunk plan: every part in exactly one chunk, none over its caps', pl.reduce((s2, c) => s2 + c.items.length, 0) === 5000 && new Set(pl.flatMap(c => c.items)).size === 5000 && pl.every(c => c.items.length <= 512 && c.verts <= 50000));
    check('chunk plan: deterministic', J(R.planChunks(its, box, { maxInstances: 512 })) === J(R.planChunks(its, box, { maxInstances: 512 })));
    const vol = idx => { const p = idx.map(i => its[i].center); return [0, 1, 2].reduce((v2, j) => v2 * (Math.max(...p.map(q => q[j])) - Math.min(...p.map(q => q[j]))) / 1000, 1); };
    const mortonVol = pl.reduce((a, c) => a + vol(c.items), 0) / pl.length, sliceVol = [0, 1, 2, 3, 4].reduce((a, k) => a + vol(Array.from({ length: 512 }, (_, i) => k * 512 + i)), 0) / 5;
    check('chunk plan: chunks are compact in space (Morton order): far smaller boxes than slices in input order', mortonVol < 0.35 && sliceVol > 0.8, mortonVol.toFixed(3) + ' vs ' + sliceVol.toFixed(3));
    check('level of detail: below a pixel not drawn, small coarse, near full', R.lodLevel(0.5, true) === -1 && R.lodLevel(10, true) === 1 && R.lodLevel(10, false) === 0 && R.lodLevel(100, true) === 0);
    check('pixel size of a sphere falls with distance', R.pixelRadius(10, 1000, 45, 1000) > R.pixelRadius(10, 2000, 45, 1000) && near(R.pixelRadius(10, 1000, 90, 1000), 5, 1e-9));
    // BVH rays equal brute force
    const N = 30, P = [], X2 = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { const u = i / N * Math.PI, v = j / N * 2 * Math.PI; P.push(500 * Math.sin(u) * Math.cos(v), 300 * Math.sin(u) * Math.sin(v), 200 * Math.cos(u)); }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = i * (N + 1) + j, b = a + 1, c = a + N + 1, dd = c + 1; X2.push(a, c, b, b, c, dd); }
    const PP = new Float32Array(P), XX = new Uint32Array(X2), bvh = new R.Bvh(PP, XX);
    let same = 0, total = 0, hits = 0;
    for (let k = 0; k < 300; k++) {
      const o = [(rnd() - 0.5) * 3000, (rnd() - 0.5) * 3000, (rnd() - 0.5) * 3000], tgt = [(rnd() - 0.5) * 400, (rnd() - 0.5) * 300, (rnd() - 0.5) * 200], dir = tgt.map((x, i) => x - o[i]), L = Math.hypot(...dir), dn = dir.map(x => x / L);
      let bt = Infinity; for (let t = 0; t < XX.length / 3; t++) { const h = R.rayTri(o[0], o[1], o[2], dn[0], dn[1], dn[2], PP, XX[t * 3] * 3, XX[t * 3 + 1] * 3, XX[t * 3 + 2] * 3); if (h < bt) bt = h; }
      const r = bvh.raycast(o, dn); total++;
      if ((r === null && bt === Infinity) || (r && near(r.t, bt, 1e-6))) same++;
      if (r) hits++;
    }
    check('BVH rays give the same nearest hit as testing every triangle (300 rays)', same === total && hits > 100, same + '/' + total + ', ' + hits + ' hits');
    const boxes = new Float64Array(6000 * 6); for (let i = 0; i < 6000; i++) { const c = [rnd() * 10000, rnd() * 10000, rnd() * 10000], r2 = 5 + rnd() * 50; for (let j = 0; j < 3; j++) { boxes[i * 6 + j] = c[j] - r2; boxes[i * 6 + 3 + j] = c[j] + r2; } }
    const tl = new R.Tlas(boxes, 6000);
    let okT = true;
    for (let k = 0; k < 50; k++) {
      const o = [rnd() * 10000, rnd() * 10000, -100], dn = [rnd() - 0.5, rnd() - 0.5, 1]; const L = Math.hypot(...dn); dn.forEach((x, i) => { dn[i] = x / L; });
      const brute = [];
      const got = tl.rayItems(o, dn).map(x => x.i).sort((a, b) => a - b);
      const ix = 1 / dn[0], iy = 1 / dn[1], iz = 1 / dn[2];
      for (let i = 0; i < 6000; i++) { let t1 = (boxes[i * 6] - o[0]) * ix, t2 = (boxes[i * 6 + 3] - o[0]) * ix, tmin = Math.min(t1, t2), tmax = Math.max(t1, t2); t1 = (boxes[i * 6 + 1] - o[1]) * iy; t2 = (boxes[i * 6 + 4] - o[1]) * iy; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2)); t1 = (boxes[i * 6 + 2] - o[2]) * iz; t2 = (boxes[i * 6 + 5] - o[2]) * iz; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2)); if (tmax >= Math.max(tmin, 0)) brute.push(i); }
      if (J(got) !== J(brute)) okT = false;
    }
    check('the box hierarchy finds exactly the boxes a ray crosses (50 rays, 6000 boxes)', okT);
    check('box query: only overlapping boxes', J(tl.boxItems([0, 0, 0], [10000, 10000, 10000]).length) === '6000' && tl.boxItems([-1e6, -1e6, -1e6], [-1e5, -1e5, -1e5]).length === 0);
    const A = [[0, 0, 0], [10, 0, 0], [0, 10, 0]];
    check('triangle distance: parallel 7 apart', near(R.triTriDistance(A, [[0, 0, 7], [10, 0, 7], [0, 10, 7]]).d, 7, 1e-12));
    check('triangle distance: crossing triangles are 0 and flagged', R.triTriDistance(A, [[2, 2, -5], [2, 2, 5], [3, 1, 0]]).cross === true);
    check('triangle distance: edge to edge', near(R.triTriDistance(A, [[20, -5, 3], [20, 5, 3], [30, 0, 3]]).d, Math.hypot(10, 3), 1e-12));
    // two boxes 25 apart, as placed meshes
    const bx = (w) => { const v = [[0, 0, 0], [w, 0, 0], [w, w, 0], [0, w, 0], [0, 0, w], [w, 0, w], [w, w, w], [0, w, w]], f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]; return { p: new Float32Array(v.flat()), i: new Uint32Array(f.flat()) }; };
    const b1 = bx(100), bv = new R.Bvh(b1.p, b1.i), M = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
    check('mesh distance: boxes 25 apart', near(R.meshDistance({ bvh: bv, matrix: null }, { bvh: bv, matrix: M(125, 0, 0) }).d, 25, 1e-9));
    check('mesh distance: overlapping boxes cross', R.meshDistance({ bvh: bv, matrix: null }, { bvh: bv, matrix: M(50, 50, 50) }).cross === true);
    // clash scan
    const parts = [['a', 0, 0, 0], ['b', 125, 0, 0], ['c', 50, 50, 50], ['d', 400, 0, 0], ['e', 100, 0, 0]].map(([pid, x, y, z]) => ({ pid, bbox: { min: [x, y, z], max: [x + 100, y + 100, z + 100] }, m: M(x, y, z) }));
    const mesh = pid => { const p = parts.find(q => q.pid === pid); return { bvh: bv, matrix: p.m }; };
    const cj = R.runClash(parts, mesh, { tolerance: 30 });
    const res = cj.results.map(r => r.kind + ':' + r.pidA + r.pidB + ':' + r.distance);
    check('clash scan: clashes first (overlapping volume, faces lying on each other included), touching next, clearances by distance; far parts left out', J(res) === J(['clash:ac:0', 'clash:bc:0', 'clash:be:0', 'clash:ce:0', 'touch:ae:0', 'clearance:ab:25']), J(res));
    check('clash scan: the same list from reversed input', J(R.runClash(parts.slice().reverse(), mesh, { tolerance: 30 }).results.map(r => r.kind + ':' + r.pidA + r.pidB)) === J(cj.results.map(r => r.kind + ':' + r.pidA + r.pidB)));
    check('clash scan: set A against set B pairs only across the sets', R.runClash(parts, mesh, { tolerance: 30, setA: ['a'], setB: ['b', 'e'] }).results.every(r => (r.pidA === 'a') !== (r.pidB === 'a')) && R.runClash(parts, mesh, { tolerance: 30, setA: ['a'], setB: ['b', 'e'] }).results.length === 2);
    check('clash scan: results say they come from the display mesh (approximate)', cj.results.every(r => r.approximate === true && r.exact === false));
    check('clash scan: no tolerance, only clashes and touches', R.runClash(parts, mesh, {}).results.every(r => r.kind !== 'clearance'));
    const ex = R.explodeOffsets([{ pid: 'p', centroid: [10, 0, 0], bbox: {} }, { pid: 'q', centroid: [0, -5, 0], bbox: {} }], 2, [0, 0, 0]);
    check('explode: away from the center by the factor', J(ex.p) === '[20,0,0]' && J(ex.q) === '[0,-10,0]');
  }

  // ===================================================================== G
  console.log('\n[G] shared records (cad_review.js)');
  {
    const pc = globalThis.projectConfig = {};
    let saves = 0; globalThis.scheduleAutosave = () => { saves++; };
    const st = { camera: { eye: [1, 2, 3], target: [0, 0, 0], up: [0, 0, 1], fov: 45 }, sections: { planes: [{ dir: [1, 0, 0], offset: 4200, on: true }], box: null, caps: true }, explode: 0.5, ghost: true, hidden: ['p2', 'p1'], isolate: null, colorBy: 'zone' };
    check('a view needs a name and who saved it', !RV.saveView(st, { by: 'A' }).ok && !RV.saveView(st, { name: 'x' }).ok);
    const v = RV.saveView(st, { name: 'Bay', by: 'Ana', fileName: 'f.step', cadId: 'cad-1', at: '2026-10-13T10:00:00Z' });
    check('saved: cv-1 in projectConfig.cadViews, sorted hidden ids, and an autosave', v.ok && pc.cadViews.length === 1 && pc.cadViews[0].id === 'cv-1' && J(pc.cadViews[0].hidden) === '["p1","p2"]' && saves === 1);
    check('a saved view carries no geometry (the import\'s own guard agrees)', !I.containsGeometry(pc.cadViews[0]));
    check('reopened as saved', RV.getView('cv-1').camera.eye[2] === 3 && RV.getView('cv-1').sections.planes[0].offset === 4200 && RV.getView('cv-1').explode === 0.5);
    check('anything with geometry is refused', !RV.saveView(st, { name: 'g', by: 'A', cadId: new Float32Array(9) }).ok && RV.views().length === 1);
    check('rename and delete', RV.renameView('cv-1', 'Bay 2', 'Ana').ok && RV.getView('cv-1').name === 'Bay 2' && RV.removeView('cv-1').ok && RV.views().length === 0);
    const big = Array.from({ length: RV.MAX_PIDS + 1 }, (_, i) => 'p' + i);
    check('too many hidden parts for a shared view is refused, not truncated', !RV.saveView(Object.assign({}, st, { hidden: big }), { name: 'big', by: 'A' }).ok);
    const part = { pid: 'p:A/Pump#1', centroid: [100, 200, 300] };
    check('a note needs a part, text and who wrote it', !RV.addMarkup({ point: [1, 1, 1], by: 'A', text: 't' }).ok && !RV.addMarkup({ pid: part.pid, part, point: [1, 1, 1], by: 'A', text: '' }).ok && !RV.addMarkup({ pid: part.pid, part, point: [1, 1, 1], text: 't' }).ok);
    const n1 = RV.addMarkup({ pid: part.pid, part, point: [110, 190, 300], kind: 'arrow', text: 'Check seal', size: 50, dir: [0, 0, 1], by: 'Ana', fileName: 'f.step', cadId: 'cad-1', at: '2026-10-13T10:00:00Z' });
    check('a note is stored as pid plus a point relative to the part, with author and time', n1.ok && J(pc.cadMarkups[0].local) === '[10,-10,0]' && pc.cadMarkups[0].by === 'Ana' && pc.cadMarkups[0].at === '2026-10-13T10:00:00Z' && !I.containsGeometry(pc.cadMarkups[0]));
    check('in a later revision where the part moved, the note moves with it', J(RV.markupPoint(pc.cadMarkups[0], { 'p:A/Pump#1': { centroid: [1100, 200, 300] } })) === '[1110,190,300]');
    check('a part not in the revision: the note has no place (not guessed)', RV.markupPoint(pc.cadMarkups[0], {}) === null);
    check('closing a note is recorded by name; reopening clears it', !RV.setMarkupStatus('cm-1', 'closed').ok && RV.setMarkupStatus('cm-1', 'closed', 'Bo').ok && pc.cadMarkups[0].closedBy === 'Bo' && RV.setMarkupStatus('cm-1', 'open').ok && !pc.cadMarkups[0].closedBy);
    const parts = [{ pid: 'a', partNumber: 'PN-2', path: ['X', 'Wing'] }, { pid: 'b', partNumber: 'PN-1', path: ['X', 'Fus'] }, { pid: 'c', partNumber: null, path: ['X', 'Fus'] }, { pid: 'd', partNumber: 'PN-1', path: ['X', 'Fus'] }];
    const cb = RV.colorBy('partNumber', parts, {});
    check('color by: values in sorted order, counts, (none) last in grey', J(cb.legend.map(l => [l.value, l.count])) === J([['PN-1', 2], ['PN-2', 1], [null, 1]]) && cb.legend[2].color === RV.NONE_COLOR);
    check('color by: the same colors whatever the input order', J(RV.colorBy('partNumber', parts.slice().reverse(), {}).byPid) === J(cb.byPid));
    const sys = [{ id: 's1', name: 'Hydraulics', fha: [{ severity: 'Major' }, { severity: 'Hazardous' }] }, { id: 's2', name: 'Lights', dal: 'D' }];
    const ctx = { links: { a: 's1', b: 's2' }, systems: sys, zoneOf: { a: '110 Bay' }, attrs: { c: { material: 'Ti-6Al-4V' } }, field: 'material' };
    check('color by DAL: the system\'s own DAL, else its worst failure condition', RV.attrValue('dal', { pid: 'a' }, ctx) === 'DAL B' && RV.attrValue('dal', { pid: 'b' }, ctx) === 'DAL D' && RV.attrValue('dal', { pid: 'c' }, ctx) === null);
    check('color by system, zone, assembly, a custom field', RV.attrValue('system', { pid: 'a' }, ctx) === 'Hydraulics' && RV.attrValue('zone', { pid: 'a' }, ctx) === '110 Bay' && RV.attrValue('assembly', parts[0], ctx) === 'Wing' && RV.attrValue('custom', { pid: 'c' }, ctx) === 'Ti-6Al-4V');
    const oldE = { parts: [{ pid: 'p1' }, { pid: 'p2' }, { pid: 'p3' }] }, newE = { parts: [{ pid: 'p1' }, { pid: 'p3' }, { pid: 'p4' }] };
    const cs = RV.compareStatus(oldE, newE, { moved: [{ pid: 'p3' }], resized: [], renamed: [] });
    check('compare: added, removed, moved, same', J(cs.status) === J({ p1: 'same', p3: 'moved', p4: 'added', p2: 'removed' }) && cs.counts.added === 1 && cs.counts.removed === 1);
    const lab = RV.placeLabels([{ point: [0, 0, 0], text: 'a' }, { point: [0, 0, 0], text: 'behind' }], p => p ? ({ x: 0, y: 0, z: 0.5 }) : null, 200, 100);
    check('snapshot labels: placed in image pixels', lab.length === 2 && lab[0].x === 100 && lab[0].y === 50);
    check('snapshot labels: behind the camera dropped', RV.placeLabels([{ point: [0, 0, 0], text: 'b' }], () => ({ x: 0, y: 0, z: 1.2 }), 200, 100).length === 0);
    delete globalThis.projectConfig;
  }

  // ===================================================================== H
  console.log('\n[H] wiring');
  {
    const IDX = S('index.html'), W = S('cad_import_worker.js'), V = S('cad_viewer.js'), VP = S('cad_viewer_panels.js'), PG = S('cad_page.js');
    const files = ['cad_brep.js', 'cad_step_struct.js', 'cad_render.js', 'cad_exact.js', 'cad_review.js', 'cad_viewer.js', 'cad_viewer_panels.js', 'cad_import.js', 'cad_import_worker.js', 'cad_page.js'];
    check('no eval and no Function constructor in any CAD module', files.every(f => !/\beval\s*\(|new Function\s*\(/.test(S(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''))));
    check('no em dash in the CAD modules, this test or the build script', files.every(f => S(f).indexOf(EM) < 0) && fs.readFileSync(__filename, 'utf8').indexOf(EM) < 0 && fs.readFileSync(path.join(ROOT, 'tools', 'occt', 'build_occt.sh'), 'utf8').indexOf(EM) < 0 && fs.readFileSync(path.join(ROOT, 'tools', 'occt', 'slcad_occt.cpp'), 'utf8').indexOf(EM) < 0);
    check('the worker answers only the session\'s public queries (no _private, no close)', /d\.op\.charAt\(0\) === '_' \|\| d\.op === 'close'/.test(W));
    check('the worker compiles our build once and hands the compiled module to its part readers', /WebAssembly\.compile\(b\)/.test(W) && /type: 'pool-init', fast: _fastModule/.test(W));
    check('the import keeps the exact session and the page adopts it', /keepSession: true/.test(PG) && /SLCadExact\.attach\(r\.worker, r\.entry\)/.test(PG));
    check('the STEP file is kept in this browser (IndexedDB steps store), never sent', /putStep: stepPut/.test(S('cad_import.js')) && I.DB_STEPS === 'steps');
    check('the viewer only draws through SLCadRender (no per-part meshes)', /new R\.Scene\(T, \{\}\)/.test(V) && !/new T\.Mesh\(g, mat\)/.test(V));
    check('measurements say approximate when they are not exact', /\(approximate\)/.test(V) && /scv-approx/.test(V));
    check('panels extend the viewer and load after it', /var P = V\.Viewer\.prototype/.test(VP) && IDX.indexOf('cad_viewer_panels.js') > IDX.indexOf('cad_viewer.js'));
    check('saved views and notes write through SLCadReview only (the one guard)', /_R\(\)\.addMarkup\(/.test(VP) && /R\.saveView\(/.test(VP) && !/cadViews\s*(=|\.push)|cadMarkups\s*(=|\.push)/.test(VP + V + PG));
    check('the revision compare signs review items through the engine', /E\.closeReviewItem\(a, t\.getAttribute\('data-kind'\), t\.getAttribute\('data-ref'\), by\)/.test(VP) && /E\.diffRevision\(older\.id, newer\.id\)/.test(VP));
    const SC = require(path.join(SITE, 'cad_viewer.js'));
    check('viewer API keeps its names', ['mount', 'loadModel', 'showModel', 'highlightZone', 'highlightParts', 'highlightVolume', 'onSelect', 'dispose'].every(k => typeof SC[k] === 'function'));
  }

  // ===================================================================== M
  console.log('\n[M] mutations (each must turn a check red)');
  {
    const IMP = S('cad_import.js'), BR = S('cad_brep.js'), RN = S('cad_render.js'), RVS = S('cad_review.js'), EX = S('cad_exact.js');
    const mut = async (name, src, from, to, probe) => {
      if (src.indexOf(from) < 0) { check('M: anchor present: ' + name, false, from.slice(0, 80)); return; }
      let red; try { red = await probe(src.replace(from, to)); } catch (e) { red = 'crashed: ' + e.message; }
      check('M: goes red when ' + name, red === true, String(red));
    };
    const box = (w, d, h) => { const v = [[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0], [0, 0, h], [w, 0, h], [w, d, h], [0, d, h]], f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]; const P = [], X2 = []; f.forEach(t => { const b = P.length / 3; t.forEach(i => P.push(...v[i])); X2.push(b, b + 1, b + 2); }); return { position: new Float32Array(P), index: new Uint32Array(X2) }; };
    const stretched = () => { const b = box(60, 40, 5); const s2 = { position: b.position.map((x, i) => i % 3 === 0 ? x * 2 : x), index: b.index }; return [b, s2]; };
    // the same triangle list, rigidly placed, but one vertex (not one of the four the placement is
    // solved from) moved 10 mm: only the vertex check catches it
    const other = () => { const b = box(60, 40, 5), an = I._anchors(b.position), v = [...Array(b.position.length / 3).keys()].find(i => an.indexOf(i) < 0); const c = { position: b.position.slice(), index: b.index }; c.position[v * 3 + 2] += 10; return [b, c]; };
    const impMod = src => load(src, 'cad_import.js').SLCadImport;
    // the probe on the real module is green
    check('M: probes are green on the real modules', impMod(IMP).findInstances(stretched()).refs[1].proto === 1 && impMod(IMP).findInstances(other()).refs[1].proto === 1);
    await mut('a stretched copy is accepted as the same part (no rigid check)', IMP, 'if (m && _rigid(m) && _mapsAll(m, pr.position, pos, tol))', 'if (m && _mapsAll(m, pr.position, pos, tol))', src => impMod(src).findInstances(stretched()).refs[1].proto === 0);
    await mut('copies are matched on the triangle list alone (no vertex check)', IMP, 'function _mapsAll(m, P, Q, tol) {', 'function _mapsAll(m, P, Q, tol) { return true;', src => impMod(src).findInstances(other()).refs[1].proto === 0);
    // the full reader, mutated, on the real OpenCascade
    const brepWith = (srcB, imp) => load(srcB, 'cad_brep.js', { SLCadImport: imp || I }).SLCadBrep;
    const pidsOcct = J(m1.parts.map(p => p.pid));
    await mut('a copy hung on its parent assembly is named by the assembly path rule wrongly (flattened copies lose their names)', IMP, 'var partPath = (leaf && (!m.name || name === nm)) ? path : childPath;', 'var partPath = childPath;', src => { const I2 = impMod(src); const r = brepWith(BR, I2).convertFast(FM, toyBytes, { keep: false }); return J(r.model.parts.map(p => p.pid)) !== pidsOcct; });
    await mut('the parser\'s progress is not passed on (no progress inside the read)', BR, "M.onReadProgress = function (f) { prog('parse', f);", "M.onReadProgress = function (f) {", src => { const ev = []; brepWith(src).convertFast(FM, toyBytes, { keep: false, onProgress: (ph, f) => { if (ph === 'parse') ev.push(f); } }); return ev.length < 10; });
    await mut('a placement handed to our build the wrong way round', BR, "return h + ' ' + w.solid + ' ' + Array.prototype.map.call(w.matrix,", "return h + ' ' + w.solid + ' ' + Array.prototype.map.call([w.matrix[0], w.matrix[4], w.matrix[8], w.matrix[12], w.matrix[1], w.matrix[5], w.matrix[9], w.matrix[13], w.matrix[2], w.matrix[6], w.matrix[10], w.matrix[14], w.matrix[3], w.matrix[7], w.matrix[11], w.matrix[15]],", src => { const B2 = brepWith(src); const ses = new B2.FastPartSession(FM, ['a', 'b'], pid => ({ key: pid, mini: toyBytes, solid: 0, matrix: pid === 'a' ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 50000, 0, 0, 1] })); const d = ses.distance('a', 'b'); ses.close(); return !(d && near(d.distance, 40000, 1e-6)); });
    await mut('PMI nominals left in the file\'s unit', BR, "if (typeof item.value === 'number' && item.value !== 0 && !ok(item.value) && !/Angular/.test(item.type)) {", 'if (false) {', src => { const ps = brepWith(src).openSessionFast(FM, new Uint8Array(fs.readFileSync(PMIF))); const h = ps.pmi().find(x => x.written && x.written.value === 0.8125); ps.close(); return !h; });
    const rnMod = src => load(src, 'cad_render.js').SLCadRender;
    await mut('BVH traversal drops a child', RN, 'if (tl < tr) { if (tr !== Infinity) stack.push(r); if (tl !== Infinity) stack.push(l); }', 'if (tl < tr) { if (tl !== Infinity) stack.push(l); }', src => { const M2 = rnMod(src); const N = 20, P = [], X2 = []; for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) P.push(i * 10, j * 10, Math.sin(i + j) * 5); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const a = i * (N + 1) + j; X2.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); } const bv = new M2.Bvh(new Float32Array(P), new Uint32Array(X2)); let miss = 0; for (let k = 0; k < 200; k++) { const o = [(k * 37) % 200, (k * 53) % 200, 50]; const r = bv.raycast(o, [0, 0, -1]); if (!r) miss++; } return miss > 0; });
    await mut('clash results left in scan order', RN, "results.sort(function (a, b) { return (rank[a.kind] - rank[b.kind])", "results.slice(function (a, b) { return (rank[a.kind] - rank[b.kind])", src => { const M2 = rnMod(src); const b1 = new M2.Bvh(new Float32Array([0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100]), new Uint32Array([0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3])); const ps = [['a', 0], ['b', 105], ['c', 40]].map(([p, x]) => ({ pid: p, bbox: { min: [x, 0, 0], max: [x + 100, 100, 100] }, x })); const r = M2.runClash(ps, pid => ({ bvh: b1, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ps.find(q => q.pid === pid).x, 0, 0, 1] }), { tolerance: 20 }).results; return !(r.length && r[0].kind === 'clash'); });
    await mut('touching parts reported as clearance', RN, "return { kind: r.d <= touch ? 'touch' : 'clearance',", "return { kind: 'clearance',", src => { const M2 = rnMod(src); const b1 = new M2.Bvh(new Float32Array([0, 0, 0, 100, 0, 0, 100, 100, 0, 0, 100, 0, 0, 0, 100, 100, 0, 100, 100, 100, 100, 0, 100, 100]), new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7])); const ps = [['a', 0], ['e', 100]].map(([p, x]) => ({ pid: p, bbox: { min: [x, 0, 0], max: [x + 100, 100, 100] }, x })); const r = M2.runClash(ps, pid => ({ bvh: b1, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ps.find(q => q.pid === pid).x, 0, 0, 1] }), {}).results; return !r.some(x => x.kind === 'touch'); });
    await mut('parts sharing volume through coplanar faces reported as touching', RN, 'r.d <= touch && sharedVolume(ma, mb, ba, bb, touch)', 'false', src => { const M2 = rnMod(src); const v = [[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0], [0, 0, 100], [100, 0, 100], [100, 100, 100], [0, 100, 100]], f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]; const b1 = new M2.Bvh(new Float32Array(v.flat()), new Uint32Array(f.flat())); const ps = [['b', 125], ['e', 100]].map(([p, x]) => ({ pid: p, bbox: { min: [x, 0, 0], max: [x + 100, 100, 100] }, x })); const r = M2.runClash(ps, pid => ({ bvh: b1, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ps.find(q => q.pid === pid).x, 0, 0, 1] }), {}).results; return r.length === 1 && r[0].kind === 'touch'; });
    const rvMod = src => { const sb = load(src, 'cad_review.js', { SLCadImport: I }); sb.projectConfig = {}; return sb; };
    await mut('a saved view skips the geometry guard', RVS, "if (!_geomFree(v)) return { ok: false, err: 'Refused: a saved view may not carry geometry.' };", '', src => { const sb = rvMod(src); return sb.SLCadReview.saveView({ camera: { eye: [1, 2, 3], target: [0, 0, 0] }, hidden: null, isolate: null, colorBy: null, sections: { planes: [{ dir: [1, 0, 0], offset: 1 }] } }, { name: 'n', by: 'b', cadId: new Float32Array(9) }).ok === true; });
    await mut('a note stored at its absolute point (it would not follow its part)', RVS, 'local: _r3([m.point[0] - c[0], m.point[1] - c[1], m.point[2] - c[2]])', 'local: _r3([m.point[0], m.point[1], m.point[2]])', src => { const sb = rvMod(src), R2 = sb.SLCadReview; R2.addMarkup({ pid: 'p', part: { centroid: [100, 0, 0] }, point: [110, 0, 0], text: 't', by: 'b' }); return J(R2.markupPoint(sb.projectConfig.cadMarkups[0], { p: { centroid: [1100, 0, 0] } })) !== '[1110,0,0]'; });
    await mut('color by values in input order', RVS, "var keys = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'en', { numeric: true }); });", 'var keys = Object.keys(groups);', src => { const R2 = rvMod(src).SLCadReview; const ps = [{ pid: 'a', partNumber: 'Z' }, { pid: 'b', partNumber: 'A' }]; return J(R2.colorBy('partNumber', ps, {}).byPid) !== J(R2.colorBy('partNumber', ps.slice().reverse(), {}).byPid); });
    await mut('dimension lower tolerance shown with the wrong sign convention', EX, "' / -' + (ang ? l.toFixed(2) : l.toFixed(3))", "' / ' + (ang ? l.toFixed(2) : l.toFixed(3))", src => load(src, 'cad_exact.js').SLCadExact.fmtDim({ type: 'Size_Diameter', value: 35, upperTol: 0, lowerTol: 0.2 }) !== '⌀' + '35.000 +0.000 / -0.200');
  }

  s.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  suite threw: ' + (e && e.stack || e)); process.exit(1); });

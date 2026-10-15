#!/usr/bin/env node
/* Regression: bird footprint and depth by rays against the part triangles, and connected clusters of a
 * product's faces (14 Oct 2026, NASA CRM findings). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('pra_models.js');
const box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
function boxTris(b) { const c = k => [k & 1 ? b.max[0] : b.min[0], k & 2 ? b.max[1] : b.min[1], k & 4 ? b.max[2] : b.min[2]]; const F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]], out = []; F.forEach(f => { [[f[0], f[1], f[2]], [f[0], f[2], f[3]]].forEach(t => t.forEach(k => out.push(...c(k)))); }); return new Float32Array(out); }
function scenario(src) {
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, Float32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {}, systemsData: [], acFhaData: [], ftaPages: [] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
    ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb));
    vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels, R = {};
    // clusters: five faces of one product, two touching near the nose, three touching aft
    const F = (n, b) => ({ pid: 'p:A/SKIN#' + n, name: 'SKIN', bbox: b });
    const fp = [F(1, box(0, 1000, 0, 1000, 0, 1000)), F(2, box(1000, 2000, 0, 1000, 0, 1000)), F(3, box(5000, 6000, 0, 1000, 0, 1000)), F(4, box(6000, 7000, 0, 1000, 0, 1000)), F(5, box(7000, 8000, 0, 1000, 0, 1000))];
    R.cl = M.describeParts(fp, fp.map(p => p.pid), 'mm');
    const parts = [{ pid: 'nose', name: 'NOSE', path: ['A'], bbox: box(2300, 3400, -1000, 1000, 4000, 6000) },
        { pid: 'fccH', name: 'FCC_HIGH', path: ['A'], bbox: box(6000, 6500, -300, 300, 4500, 5000) },
        { pid: 'fccL', name: 'FCC_LOW', path: ['A'], bbox: box(6000, 6500, -300, 300, 3000, 3500) },
        { pid: 'far', name: 'FAR', path: ['A'], bbox: box(20000, 20500, -300, 300, 4500, 5000) }];
    const m = C.addCadModel({ fileName: 'r.step', sha256: 'r', revision: 'A', units: 'mm', parts }).model;
    const T = {}; parts.forEach(p => { T[p.pid] = boxTris(p.bbox); }); M.setTriangleSource(pid => T[pid] || null);
    M.saveBird({ id: 'b1', cadId: m.id, basis: 'Part 25', speedMs: 128.6, depthMm: 6000, direction: [1, 0, 0] }, 'W. Engineer');
    ['basis', 'speed', 'depth'].forEach(f => M.confirmField('bird', 'b1', f, 'W. Engineer'));
    M.setBirdDiameter('b1', 100, 'W. Engineer');
    const props = M.proposeBirdZones('b1'); M.confirmBirdZones('b1', props.filter(p => p.pid === 'nose'), 'W. Engineer', { at: '2026-10-14T00:00:00Z' });
    R.rep = M.birdReport('b1', 'nose'); R.vol = M.birdVolume('b1', 'nose'); R.rays = M.birdRays('b1', 'nose');
    return { M, R };
}
const { R } = scenario();
check('clusters: a product\'s faces split into connected groups, one location range each', R.cl.length === 1 && R.cl[0].clusters.length === 2 && /^SKIN, 2 surfaces at x 0\.0 to 2\.0 m.*; 3 surfaces at x 5\.0 to 8\.0 m/.test(R.cl[0].label), R.cl[0] && R.cl[0].label);
// D3: the nose face 2000 x 2000 grown by D/2 = 50 on each side, positions at D / sqrt 2 = 70.7107 mm: ceil(2100 / 70.7107) = 30 per side,
// every one of the 900 positions reaches the nose (its disc overlaps the grown face); the drawn footprint is the two front triangles
check('bird swept as a cylinder (D3): 30 x 30 positions at D / sqrt 2 over the nose grown by D/2, all reach it; footprint = the two front triangles', R.rays && R.rays.footRays === 900 && R.rays.rays === 900 && Math.abs(R.rays.spacingMm - 70.710678) < 1e-6 && R.rays.footTriangles === 2, JSON.stringify(R.rays && { f: R.rays.footRays, t: R.rays.footTriangles }));
check('bird by rays: behind = parts met within the depth from the footprint (FCC_HIGH at 3700 mm); not FCC_LOW (outside the frontal area) nor FAR (beyond 6000 mm)', R.rep.ok && R.rep.behind.map(x => x.pid).join() === 'fccH' && Math.abs(R.rep.behind[0].depthMm - 3700) < 1, JSON.stringify(R.rep.behind));
check('bird report states the cylinder method', /swept as a cylinder of diameter 100 mm/.test(R.rep.method) && /measured from the footprint/.test(R.rep.method) && /exact triangle against cylinder/.test(R.rep.method), R.rep.method);
check('bird region drawn = the footprint swept back by exactly the depth (6000 mm)', R.vol.method === 'footprint' && Math.abs((R.vol.box.max[0] - R.vol.box.min[0]) - 6000) < 1e-6 && R.vol.box.min[0] === 2300, JSON.stringify(R.vol.box));
// ---- B3 / B4 / B5: a windshield nested inside the fuselage box. Fuselage surface: lower front panel (x = 0, z 0..1000), top
// and sides (parallel to the flight direction); the windshield plate at x = 500, y -500..500, z 1200..1800 sits inside the
// fuselage box, so the box method never proposes it. Rays from ahead over the whole frontal area (y -1000..1000, z 0..2000)
// at the confirmed bird diameter 250 mm (D3: positions at D / sqrt 2 = 176.777 mm, 12 x 12 = 144, centers y +/-88.4, 265.2, 441.9, 618.7,
// 795.5, 972.3 and z 27.7 + 176.777 k): a position reaches the windshield when its disc (r 125) overlaps the windshield outline y +/-500,
// z 1200..1800 and its center line does not first hit the lower front panel (z <= 1000): |y| <= 618.7 (8 values) x z 1088.4 .. 1795.5
// (5 values) = 40, less the two corners (|y| 618.7, z 1088.4: distance hypot(118.7, 111.6) = 162.9 > 125): 38 positions.
// F2: positions only where the bird can reach geometry (center within 125 of the projected parts): of the 144, the centers at
// |y| 795.5 with z 1265.2 .. 1795.5 (2 x 4 = 8) are 204.5 from the side walls, 295.5 from the windshield and more than 125 from
// the top and the lower panel: 136 positions.
function nested(src, basis, level4, diam) {
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, Float32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {}, systemsData: [], acFhaData: [], ftaPages: [] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb); ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb)); vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels;
    const parts = [{ pid: 'fus', name: 'FUSELAGE', path: ['A'], bbox: box(0, 10000, -1000, 1000, 0, 2000) }, { pid: 'ws', name: 'WINDSHIELD_LH', path: ['A'], bbox: box(500, 510, -500, 500, 1200, 1800) }];
    const m = C.addCadModel({ fileName: 'n.step', sha256: 'n', revision: 'A', units: 'mm', parts }).model;
    const q = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
    const FT = new Float32Array([].concat(q([0, -1000, 0], [0, 1000, 0], [0, 1000, 1000], [0, -1000, 1000]), q([0, -1000, 2000], [10000, -1000, 2000], [10000, 1000, 2000], [0, 1000, 2000]), q([0, -1000, 0], [10000, -1000, 0], [10000, -1000, 2000], [0, -1000, 2000]), q([0, 1000, 0], [10000, 1000, 0], [10000, 1000, 2000], [0, 1000, 2000])));
    const T = { fus: FT, ws: boxTris(parts[1].bbox) }; M.setTriangleSource(pid => T[pid] || null);
    M.saveBird({ id: 'b2', cadId: m.id, basis: basis, speedMs: 100, depthMm: 500, direction: [1, 0, 0] }, 'W. Engineer');
    if (diam) M.setBirdDiameter('b2', diam, 'W. Engineer'); if (level4) M.setBirdLevel4('b2', true, 'W. Engineer');
    return { M, P: M.birdZoneProposal('b2') };
}
{ const n25 = nested(null, 'Part 25', false, 250), n23 = nested(null, 'Part 23', false, 250), n23L4 = nested(null, 'Part 23', true, 250), nd = nested(null, 'Part 25', false, 0);
  const ws = r => r.P.zones.find(z => z.pid === 'ws');
  check('B3: the windshield nested in the fuselage box is proposed by rays over the whole frontal area, with the windshield case (25.775(b)); 8 of 64 rays', ws(n25) && ws(n25).caseId === 'windshield' && ws(n25).rays === 38 && n25.P.rays === 136 && n25.P.resolutionMm === 2, JSON.stringify(n25.P));
  check('B4 / D3: spacing set by the confirmed bird diameter (250 mm, labeled engineer input): D / sqrt 2 = 176.777 mm, stated; no diameter: refused, not a fixed grid', Math.abs(n25.P.spacingMm - 176.776695) < 1e-6 && n25.P.diameter.source === 'engineer' && /not from the rule text, engineer input/.test(n25.P.diameter.note) && /176\.776695 mm spacing/.test(n25.P.note) && /cylinder of the confirmed diameter 250 mm/.test(n25.P.note) && !nd.P.ok && /bird diameter/.test(nd.P.err), JSON.stringify([n25.P.note, nd.P.err]));
  const refuse = n23.M.confirmBirdZones('b2', [{ pid: 'ws', name: 'WS', caseId: 'windshield' }], 'W. Engineer');
  check('B5: Part 23 windshield case only with level 4 confirmed (proposed as structure without it, refused if forced; windshield with it); case list follows', ws(n23).caseId === 'structure' && !refuse.ok && ws(n23L4).caseId === 'windshield' && !n23.M.birdCases('Part 23', {}).cases.some(c => c.id === 'windshield') && n23.M.birdCases('Part 23', {}, { level4: true }).cases.some(c => c.id === 'windshield'), JSON.stringify([ws(n23), refuse, ws(n23L4)])); }
// ---- D3 auditor bird2.js: a 20 mm pitot probe 500 mm ahead of the nose (x -500..0, y 1990..2010, z -1510..-1490), fuselage shell
// with a windshield hole: the pitot must be proposed at D = 100, 150 and 200 mm (a point-ray grid at spacing D can miss it)
function pitot(src, D) {
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, Float32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {}, systemsData: [], acFhaData: [], ftaPages: [] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb); ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb)); vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels, fb = box(0, 60000, -3000, 3000, -3000, 3000), ws = box(2000, 2500, -1000, 0, 1000, 1800), pit = box(-500, 0, 1990, 2010, -1510, -1490);
    let ft = Array.from(boxTris(fb)), keep = []; for (let k = 0; k < ft.length; k += 9) { const t = ft.slice(k, k + 9); if (!(t[0] === 0 && t[3] === 0 && t[6] === 0)) keep.push(...t); }
    const rect = (y0, y1, z0, z1) => [0, y0, z0, 0, y1, z0, 0, y1, z1, 0, y0, z0, 0, y1, z1, 0, y0, z1]; keep.push(...rect(-3000, -1000, -3000, 3000), ...rect(0, 3000, -3000, 3000), ...rect(-1000, 0, -3000, 1000), ...rect(-1000, 0, 1800, 3000));
    const TRI = { fus: Float32Array.from(keep), ws: boxTris(ws), pit: boxTris(pit) }; M.setTriangleSource(pid => TRI[pid] || null);
    const m = C.addCadModel({ fileName: 'b.step', sha256: 'b', revision: 'A', units: 'mm', parts: [{ pid: 'fus', name: 'Fuselage', path: ['A'], bbox: fb }, { pid: 'ws', name: 'Windshield L', path: ['A'], bbox: ws }, { pid: 'pit', name: 'Pitot probe', path: ['A'], bbox: pit }] }).model;
    M.saveBird({ id: 'b1', cadId: m.id, basis: 'Part 25', speedMs: 150, depthMm: 500, direction: [1, 0, 0] }, 'W'); M.setBirdDiameter('b1', D, 'W');
    return M.birdZoneProposal('b1').zones.some(z => z.pid === 'pit');
}
check('D3 auditor: the 20 mm pitot 500 mm ahead of the nose is proposed at D = 100, 150 and 200 mm', [100, 150, 200].every(D => pitot(null, D)), JSON.stringify([100, 150, 200].map(D => pitot(null, D))));
// ---- D4 for the bird: a credited plate between the nose and FCC_HIGH does not remove FCC_HIGH (sampling proves no blocking): marked
{ const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, Float32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {}, systemsData: [], acFhaData: [], ftaPages: [] };
  sb.window = sb; sb.globalThis = sb; vm.createContext(sb); ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb)); vm.runInContext(SRC, sb);
  const C = sb.SLCadZonal, M = sb.SLPraModels, parts = [{ pid: 'nose', name: 'NOSE', path: ['A'], bbox: box(2300, 3400, -1000, 1000, 4000, 6000) }, { pid: 'plate', name: 'PLATE', path: ['A'], bbox: box(4000, 4010, -1000, 1000, 4000, 6000) }, { pid: 'fccH', name: 'FCC_HIGH', path: ['A'], bbox: box(6000, 6500, -300, 300, 4500, 5000) }];
  const m = C.addCadModel({ fileName: 's.step', sha256: 's', revision: 'A', units: 'mm', parts }).model; const T = {}; parts.forEach(p => { T[p.pid] = boxTris(p.bbox); }); M.setTriangleSource(pid => T[pid] || null);
  M.saveBird({ id: 'b3', cadId: m.id, basis: 'Part 25', speedMs: 128.6, depthMm: 6000, direction: [1, 0, 0] }, 'W'); M.setBirdDiameter('b3', 100, 'W'); M.creditBirdShield('b3', 'plate', 'Pressure bulkhead web, substantiated by test.', 'W');
  const r = M.birdRays('b3', 'nose'), f = r.behind.find(x => x.pid === 'fccH');
  check('D4 (bird): a credited shield does not remove the part behind it; marked behind a credited shield (not proven blocked)', f && f.exposure === 'behind a credited shield (not proven blocked)' && r.behind.some(x => x.pid === 'plate'), JSON.stringify(r.behind)); }
// ---- F2 / F3 (fourth audit): generic scene loader for the auditor's cases
function scene(src, parts, D) {
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, Float32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {}, systemsData: [], acFhaData: [], ftaPages: [] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb); ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb)); vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels, T = {}; parts.forEach(p => { T[p.pid] = boxTris(p.bbox); }); M.setTriangleSource(pid => T[pid] || null);
    const m = C.addCadModel({ fileName: 's.step', sha256: 's' + Math.random(), revision: 'A', units: 'mm', parts }).model;
    M.saveBird({ id: 'b', cadId: m.id, basis: 'Part 25', speedMs: 150, depthMm: 500, direction: [1, 0, 0] }, 'W'); M.setBirdDiameter('b', D, 'W'); return M.birdZoneProposal('b');
}
// F2 auditor bird4.js: 80 m wing span, fuselage, fin, D = 114 mm, a 6 mm pitot at five offsets: spacing stays D / sqrt 2 = 80.61 mm
// (positions only near geometry, never widened) and the pitot is proposed every time
const air = (src, s) => { const y0 = s * 17.3; return scene(src, [{ pid: 'fus', name: 'Fuselage', path: ['A'], bbox: box(0, 60000, -3000, 3000, -3000, 3000) }, { pid: 'wing', name: 'Wing', path: ['A'], bbox: box(25000, 32000, -40000, 40000, -500, 500) }, { pid: 'fin', name: 'Fin', path: ['A'], bbox: box(55000, 60000, -200, 200, 3000, 21000) }, { pid: 'pit', name: 'Pitot probe', path: ['A'], bbox: box(-500, 0, y0 + 1997, y0 + 2003, -1503, -1497) }], 114); };
{ const R5 = [0, 4, 9, 13, 19].map(s => air(null, s));
  check('F2 auditor: 80 m span, D 114: spacing D / sqrt 2 = 80.61 mm (never widened), the 6 mm pitot proposed at all five offsets', R5.every(P => P.ok && Math.abs(P.spacingMm - 114 / Math.SQRT2) < 1e-6 && P.zones.some(z => z.pid === 'pit')), JSON.stringify(R5.map(P => [P.spacingMm, P.rays, P.zones.map(z => z.pid)]))); }
{ const P = scene(null, [{ pid: 'big', name: 'Plate', path: ['A'], bbox: box(0, 10, -20000, 20000, -20000, 20000) }], 10);
  check('F2: over the position budget the proposal is refused "Not evaluated: bird sweep needs more than 120000 positions" (no wider spacing)', !P.ok && P.refused && /^Not evaluated: bird sweep needs more than 120000 positions/.test(P.err), JSON.stringify(P).slice(0, 300)); }
// F3 auditor bird3.js: a plate with a 220 mm square hole, D = 200, a 10 mm knob 500 mm behind near the hole's +z rim, 48 placements:
// a bird centered 5 mm off the hole center passes the hole and strikes the knob, so it must be proposed every time
const hole = (src, sx, sy) => { const D = 200, dl = 10, H = D / 2 + dl, ox = sx * 13.7, oy = sy * 21.3;
    const Q = [box(0, 20, -3000, oy - H, -3000, 3000), box(0, 20, oy + H, 3000, -3000, 3000), box(0, 20, oy - H, oy + H, -3000, ox - H), box(0, 20, oy - H, oy + H, ox + H, 3000)];
    return scene(src, Q.map((b, i) => ({ pid: 'q' + i, name: 'plate ' + i, path: ['A'], bbox: b })).concat([{ pid: 'p', name: 'Probe P', path: ['A'], bbox: box(500, 520, oy - 5, oy + 5, ox + H - dl / 2 - 5, ox + H - dl / 2 + 5) }]), D); };
const holeAll = src => { let n = 0, f = 0; for (let sx = 0; sx < 12; sx++) for (let sy = 0; sy < 4; sy++) { n++; const P = hole(src, sx, sy); if (P.zones.some(z => z.pid === 'p')) f++; } return [f, n]; };
{ const [f, n] = holeAll(null), P0 = hole(null, 0, 0);
  check('F3 auditor: the knob behind the 220 mm hole is proposed in all 48 placements; refinement to 2 mm is stated with the guarantee', f === 48 && n === 48 && P0.resolutionMm === 2 && /refined to 2 mm/.test(P0.note) && /Guarantee:/.test(P0.note), JSON.stringify([f, n])); }
// ---- timebox 50: the same refinement behind the impact. The struck part is a 2 mm wire (z -1..1 plus offset), the 2 mm knob is
// 300 mm behind at z 199..201: a bird (D 200, r 100) reaches both only when its center is within 100 of the wire and within 100 of
// the knob, a lens about z 99..101 and |y| < 20 (some 80 mm^2), far smaller than the 141 mm grid: found only by the refinement
function wire(src, i) { const oy = i * 7.3, oz = i * 3.1;
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, Float32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {}, systemsData: [], acFhaData: [], ftaPages: [] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb); ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb)); vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels, parts = [{ pid: 'w', name: 'WIRE', path: ['A'], bbox: box(0, 2, -1000, 1000, oz - 1, oz + 1) }, { pid: 'k', name: 'KNOB', path: ['A'], bbox: box(300, 302, oy - 1, oy + 1, oz + 199, oz + 201) }];
    const T = {}; parts.forEach(p => { T[p.pid] = boxTris(p.bbox); }); M.setTriangleSource(pid => T[pid] || null); const m = C.addCadModel({ fileName: 'w.step', sha256: 'w' + i, revision: 'A', units: 'mm', parts }).model;
    M.saveBird({ id: 'b', cadId: m.id, basis: 'Part 25', speedMs: 150, depthMm: 1000, direction: [1, 0, 0] }, 'W'); M.setBirdDiameter('b', 200, 'W'); return M.birdRays('b', 'w'); }
const wireAll = src => { let f = 0; for (let i = 0; i < 12; i++) if (wire(src, i).behind.some(x => x.pid === 'k')) f++; return f; };
{ const f = wireAll(null), r0 = wire(null, 0);
  check('behind the impact, refined: the knob reachable only from an 80 mm^2 lens is found behind the wire in 12 of 12 placements; resolution 2 mm stated', f === 12 && r0.resolutionMm === 2 && /down to squares of 2\.209709 mm/.test(r0.method) && r0.refinementPoints > 0, JSON.stringify([f, r0.refinementPoints])); }
// ---- fifth audit: equal corners prove nothing. bird5: a single-part plate with a 120 mm square hole (half 60), D 200 (r 100), a 5 mm
// sensor 500 mm behind the hole center. Every grid corner reaches the plate only, but a bird centered on the hole center (center line
// through the hole, the sensor within D/2) reaches the sensor: it must be proposed in all 48 placements
function scene2(src, parts, TRI, D, depth) {
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, Float32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {}, systemsData: [], acFhaData: [], ftaPages: [] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb); ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb)); vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels; M.setTriangleSource(pid => TRI[pid] ? Float32Array.from(TRI[pid]) : null);
    const m = C.addCadModel({ fileName: 'h.step', sha256: 'h' + Math.random(), revision: 'A', units: 'mm', parts }).model;
    M.saveBird({ id: 'b', cadId: m.id, basis: 'Part 25', speedMs: 150, depthMm: depth, direction: [1, 0, 0] }, 'W'); M.setBirdDiameter('b', D, 'W'); return M; }
const holeQ = (ox, oy, s2) => [box(0, 20, -3000, oy - s2, -3000, 3000), box(0, 20, oy + s2, 3000, -3000, 3000), box(0, 20, oy - s2, oy + s2, -3000, ox - s2), box(0, 20, oy - s2, oy + s2, ox + s2, 3000)];
const flat = bs => [].concat(...bs.map(b => Array.from(boxTris(b))));
const bird5 = src => { let f = 0; for (let sx = 0; sx < 8; sx++) for (let sy = 0; sy < 6; sy++) { const ox = sx * 17.7, oy = sy * 23.1, Pb = box(500, 520, oy - 2.5, oy + 2.5, ox - 2.5, ox + 2.5);
    const M = scene2(src, [{ pid: 'q', name: 'plate', path: ['A'], bbox: box(0, 20, -3000, 3000, -3000, 3000) }, { pid: 'p', name: 'Sensor P', path: ['A'], bbox: Pb }], { q: flat(holeQ(ox, oy, 60)), p: Array.from(boxTris(Pb)) }, 200, 500);
    if (M.birdZoneProposal('b').zones.some(z => z.pid === 'p')) f++; } return f; };
// behind the impact: the same plate with a recess (a back plate of the same part at x 300..320 behind the 120 mm hole), D 100 (r 50),
// depth 320, a 5 mm sensor at x 610: a bird inside the 20 x 20 mm clean window (|c| <= 10) passes the hole, first touches the
// struck part at x 300 and reaches the sensor at 610 <= 300 + 320; every grid corner touches the front face (contact at 0, reach 320)
const recess = src => { let f = 0; for (let sx = 0; sx < 8; sx++) for (let sy = 0; sy < 6; sy++) { const ox = sx * 17.7, oy = sy * 23.1, Pb = box(610, 615, oy - 2.5, oy + 2.5, ox - 2.5, ox + 2.5);
    const M = scene2(src, [{ pid: 'q', name: 'Panel with recess', path: ['A'], bbox: box(0, 320, -3000, 3000, -3000, 3000) }, { pid: 'p', name: 'Sensor', path: ['A'], bbox: Pb }], { q: flat(holeQ(ox, oy, 60).concat([box(300, 320, oy - 60, oy + 60, ox - 60, ox + 60)])), p: Array.from(boxTris(Pb)) }, 100, 320);
    if (M.birdRays('b', 'q').behind.some(x => x.pid === 'p')) f++; } return f; };
{ const a = bird5(null), b2 = recess(null);
  check('fifth audit bird5: the 5 mm sensor behind the 120 mm hole of a single-part plate is proposed in 48 of 48 placements (equal corners do not stop the refinement)', a === 48, String(a));
  check('fifth audit behind the impact: the sensor behind the recess is found behind the struck panel in 48 of 48 placements', b2 === 48, String(b2)); }
{ const M = scene2(null, [{ pid: 'q', name: 'plate', path: ['A'], bbox: box(0, 20, -3000, 3000, -3000, 3000) }, { pid: 'p', name: 'S', path: ['A'], bbox: box(500, 520, -2.5, 2.5, -2.5, 2.5) }], { q: flat(holeQ(0, 0, 60)), p: Array.from(boxTris(box(500, 520, -2.5, 2.5, -2.5, 2.5))) }, 200, 500), P = M.birdZoneProposal('b');
  check('the report states the guarantee precisely: final squares 2.209709 mm, every part reachable from a set of positions containing a 3.125 mm disc is found', P.finalSquareMm === 2.209709 && /contains a disc of diameter 3\.125 mm is found/.test(P.note) && /safe superset/.test(P.note), P.note); }
// ---- timebox 52: explicit compute, stored result, stale detection. A triangle changed in place (same buffer, same count)
// changes the input hash: the stored proposal is flagged stale and zones cannot be confirmed against it until recomputed
{ const M = scene2(null, [{ pid: 'q', name: 'plate', path: ['A'], bbox: box(0, 20, -3000, 3000, -3000, 3000) }, { pid: 'p', name: 'S', path: ['A'], bbox: box(500, 520, -2.5, 2.5, -2.5, 2.5) }], { q: flat(holeQ(0, 0, 60)), p: Array.from(boxTris(box(500, 520, -2.5, 2.5, -2.5, 2.5))) }, 200, 500);
  const st0 = M.birdProposalState('b'); M.computeBirdZones('b', 'W'); const st1 = M.birdProposalState('b');
  // the triangle source returns a fresh Float32Array each call from the same backing array: change one coordinate in place
  const buf = []; M.setTriangleSource(pid => { if (!buf[pid]) buf[pid] = pid === 'p' ? Float32Array.from(boxTris(box(500, 520, -2.5, 2.5, -2.5, 2.5))) : Float32Array.from(flat(holeQ(0, 0, 60))); return buf[pid]; });
  M.computeBirdZones('b', 'W'); const st2 = M.birdProposalState('b'); buf.p[0] += 1; const st3 = M.birdProposalState('b');
  const z = st2.stored.result.zones.map(x => ({ pid: x.pid, name: x.name, caseId: x.caseId })), refused = M.confirmBirdZones('b', z, 'W');
  M.computeBirdZones('b', 'W'); const st4 = M.birdProposalState('b'), okc = M.confirmBirdZones('b', z, 'W');
  check('proposal on explicit action only, stored with its input hash; a triangle changed in place (same count) is detected as stale; confirming against it is refused until recomputed', !st0.computed && st1.computed && !st1.stale && !st2.stale && st3.stale && st3.hash !== st2.stored.hash && !refused.ok && /stale/.test(refused.err) && !st4.stale && okc.ok, JSON.stringify([st0.computed, st1.stale, st2.stale, st3.stale, refused.err, st4.stale, okc.ok]));
  check('the panel shows the stored proposal (no compute on render) with a stale banner and a recompute button', /birdProposalState\(b\.id\)/.test(read('pra_panel.js')) && !/m\.birdZoneProposal\(b\.id\)/.test(read('pra_panel.js')) && /data-pra-bstale/.test(read('pra_panel.js')) && /bzones-propose/.test(read('pra_panel.js'))); }
// ---- sixth audit: airtight seeding. A lone 2 mm part (D 200, h = 141.42 mm; a far part widens the grid so the lone part sits off the grid centers): bird positions within D/2 of it
// can lie in lattice squares none of whose corners is within D/2 of any geometry (corners up to sqrt 2 x D/2 away), so seeding
// only next to kept positions misses them. Every square whose center is within D/2 + half its diagonal of the part must be seeded.
function lone(src) { const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, Float32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {}, systemsData: [], acFhaData: [], ftaPages: [] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb); ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb)); vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels, b0 = box(0, 2, 30, 32, 40, 42), bf = box(0, 2, 2000, 2002, 2000, 2002), T = { k: boxTris(b0), f: boxTris(bf) }; M.setTriangleSource(pid => T[pid] || null);
    const m = C.addCadModel({ fileName: 'l.step', sha256: 'l', revision: 'A', units: 'mm', parts: [{ pid: 'k', name: 'K', path: ['A'], bbox: b0 }, { pid: 'f', name: 'F', path: ['A'], bbox: bf }] }).model;
    M.saveBird({ id: 'b', cadId: m.id, basis: 'Part 25', speedMs: 150, depthMm: 500, direction: [1, 0, 0] }, 'W'); M.setBirdDiameter('b', 200, 'W');
    const S = M._internal.birdScene(M.bird('b'), { parts: [{ pid: 'k', bbox: b0 }, { pid: 'f', bbox: bf }] }, T, null), r = S.r, h = S.h;
    // the part projected to (u, v) = (q . e1, q . e2): e1 = (0, -1, 0), e2 = (0, 0, -1) for flight +x: u in [-32, -30], v in [-42, -40]
    const dRect = (p) => Math.hypot(Math.max(-32 - p[0], 0, p[0] + 30), Math.max(-42 - p[1], 0, p[1] + 40)); let need = 0, miss = 0, oldMiss = 0;
    for (let a = -2; a <= S.nu; a++) for (let c = -2; c <= S.nv; c++) { const ctr = [S.cu + (a + 1) * h, S.cv + (c + 1) * h]; if (dRect(ctr) > r + h / Math.SQRT2) continue; need++;
        if (!S.seedSq[a + ',' + c]) miss++;
        const adj = [[a, c], [a + 1, c], [a, c + 1], [a + 1, c + 1]].some(q => S.kept[q[0] + ',' + q[1]]); if (!adj) oldMiss++; }
    return { need, miss, oldMiss }; }
{ const L1 = lone();
  check('sixth audit: every lattice square that can hold a bird position within D/2 of a lone small part is seeded for refinement (' + L1.need + ' squares; ' + L1.oldMiss + ' of them have no kept corner and were not seeded before)', L1.need > 0 && L1.miss === 0 && L1.oldMiss > 0, JSON.stringify(L1)); }
// ---- sixth audit: a partial saveBird changes only the fields given and drops only the confirmations of changed fields
{ const M = scene2(null, [{ pid: 'q', name: 'plate', path: ['A'], bbox: box(0, 20, -3000, 3000, -3000, 3000) }], { q: Array.from(boxTris(box(0, 20, -3000, 3000, -3000, 3000))) }, 200, 500);
  ['basis', 'speed', 'depth'].forEach(f => M.confirmField('bird', 'b', f, 'W'));
  M.saveBird({ id: 'b', depthMm: 800 }, 'W'); const b1 = M.bird('b');
  M.saveBird({ id: 'b', depthMm: 800 }, 'W'); const b2 = M.bird('b');
  check('sixth audit: saving only the depth keeps the basis, speed and their confirmations; only the depth confirmation is dropped (and only when it changed)', b1.basis === 'part25' && b1.basisText === 'Part 25' && b1.speedMs === 150 && b1.depthMm === 800 && b1.confirms.basis && b1.confirms.speed && !b1.confirms.depth && b2.confirms.basis && !b2.confirms.depth, JSON.stringify(b1));
  M.confirmField('bird', 'b', 'depth', 'W'); M.saveBird({ id: 'b', depthMm: 800 }, 'W');
  check('sixth audit: re-saving an unchanged value keeps its confirmation', !!M.bird('b').confirms.depth, JSON.stringify(M.bird('b').confirms)); }
const mutN = (name, from, to, test) => { if (SRC.indexOf(from) < 0) { check('anchor present: ' + name, false); return; } let red = false; try { red = !test(SRC.replace(from, to)); } catch (e) { red = true; } check('mutation goes red: ' + name, red); };
mutN('proposal by part boxes (not rays)', "if (!Object.keys(tris).length) {", "if (true) {", src => { const r = nested(src, 'Part 25', false, 250); return r.P.zones.some(z => z.pid === 'ws'); });
mutN('fixed spacing instead of the bird diameter', "var h = D.value / Math.SQRT2, nu =", "var h = 100, nu =", src => nested(src, 'Part 25', false, 250).P.rays === 136);
mutN('point rays instead of the cylinder (radius 0)', "var D = _birdDiam(b); if (!D) return null; var r = D.value / 2,", "var D = _birdDiam(b); if (!D) return null; var r = 0,", src => nested(src, 'Part 25', false, 250).P.zones.find(z => z.pid === 'ws').rays === 38);
mutN('spacing D (gaps between the discs)', "var h = D.value / Math.SQRT2, nu =", "var h = D.value, nu =", src => nested(src, 'Part 25', false, 250).P.rays === 136 && nested(src, 'Part 25', false, 250).P.zones.find(z => z.pid === 'ws').rays === 38);
mutN('cylinder test without the ellipse minimum', "{ var ct = K > 0 ? -k1 / K : 1,", "if (false) { var ct = K > 0 ? -k1 / K : 1,", src => nested(src, 'Part 25', false, 250).P.zones.find(z => z.pid === 'ws').rays === 38);
mutN('F3: refinement disabled', "if (!unfoundNear(u, v, side)) return; if (side / 2 < BIRD_RES - 1e-9 || evals > BIRD_REFINE_BUDGET) return;", "return;", src => holeAll(src)[0] === 48);
mutN('F3: refinement never triggered (superset check always empty)', "var tw = _cylT(it.tri, o, S.d, S.e1, S.e2, rad); if (isFinite(tw) && tw <= cap + 1e-9) return true; } }", "} }", src => holeAll(src)[0] === 48);
mutN('F2: positions over the whole frontal box (not only near geometry)', "kept = {}, nk = 0, over = false;", "kept = (function () { var K = {}; for (var a = 0; a < nu; a++) for (var c = 0; c < nv; c++) K[a + ',' + c] = 1; return K; })(), nk = 0, over = false;", src => nested(src, 'Part 25', false, 250).P.rays === 136);
mutN('behind the impact: refinement disabled', "if (!unfound(u, v, side)) return; if (side / 2 < BIRD_RES - 1e-9 || evals > BIRD_REFINE_BUDGET) return;", "return;", src => wireAll(src) === 12);
mutN('fifth audit: corner equality first in the proposal refinement', "var refine = function (u, v, side, cs) { if (!unfoundNear(u, v, side)) return;", "var refine = function (u, v, side, cs) { if (cs[0] === cs[1] && cs[1] === cs[2] && cs[2] === cs[3]) return; if (!unfoundNear(u, v, side)) return;", src => bird5(src) === 48);
mutN('fifth audit: corner equality first behind the impact', "var refine = function (u, v, side, cs) { if (!unfound(u, v, side)) return;", "var refine = function (u, v, side, cs) { if (cs[0] === cs[1] && cs[1] === cs[2] && cs[2] === cs[3]) return; if (!unfound(u, v, side)) return;", src => recess(src) === 48);
mutN('behind the impact: depth bound of the superset too tight', "if (isFinite(tw) && tw <= tCapSq + 1e-9) return true;", "if (isFinite(tw) && tw <= tCapSq - 400) return true;", src => recess(src) === 48);
mutN('behind the impact: per-square cap from a radius that is not inside every path (unsafe)', "var tCapSq = Math.min(tCap, innerT(o, S.r - side / Math.SQRT2) + L);", "var tCapSq = Math.min(tCap, innerT(o, S.r + side / Math.SQRT2) + L);", src => recess(src) === 48);
mutN('timebox 52: depth cap without the covering check (unsafe)', "if (!C4.every(function (c) { return _d2PtTri(c, T2[0], T2[1], T2[2]) === 0; })) return Infinity;", "", src => bird5(src) === 48);
mutN('sixth audit: no proximity seeding (only squares next to kept positions)', "if (_d2PtTri([cu + (a + 1) * h, cv + (c + 1) * h], P2[0], P2[1], P2[2]) <= rs + 1e-9) seedSq[key] = 1;", "", src => lone(src).miss === 0);
mutN('sixth audit: a partial save clears the basis', "var basis = has('basis') ? (basisKey(b.basis) || null) : (old.basis || null)", "var basis = basisKey(b.basis) || null", src => { const M = scene2(src, [{ pid: 'q', name: 'plate', path: ['A'], bbox: box(0, 20, -3000, 3000, -3000, 3000) }], { q: Array.from(boxTris(box(0, 20, -3000, 3000, -3000, 3000))) }, 200, 500); M.saveBird({ id: 'b', depthMm: 800 }, 'W'); return M.bird('b').basis === 'part25'; });
mutN('Part 23 windshield without level 4', "if (/windshield|windscreen/i.test(nm) && !(k === 'part23' && !level4)) return 'windshield';", "if (/windshield|windscreen/i.test(nm)) return 'windshield';", src => nested(src, 'Part 23', false, 250).P.zones.find(z => z.pid === 'ws').caseId === 'structure');
const mut = (name, from, to, test) => { if (SRC.indexOf(from) < 0) { check('anchor present: ' + name, false); return; } let red = false; try { red = !test(scenario(SRC.replace(from, to)).R); } catch (e) { red = true; } check('mutation goes red: ' + name, red); };
mut('depth limit ignored', "var t0 = R0.reach[pid].t, R = _birdRay(S, o, t0 + L);", "var t0 = R0.reach[pid].t, R = _birdRay(S, o, t0 + 1e9);", r => r.rep.behind.map(x => x.pid).join() === 'fccH');
mut('depth measured from the back of the struck part instead of the footprint', "var dd = Math.max(0, h2.t - t0);", "var dd = Math.max(0, h2.t - t0 - 1100);", r => Math.abs(r.rep.behind[0].depthMm - 3700) < 1);
mut('clusters ignored', "if (adj) par[find(i)] = find(j);", "par[find(i)] = find(j);", r => r.cl[0].clusters.length === 2);
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);

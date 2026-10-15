#!/usr/bin/env node
/* Regression: shared colorblind-safe palette (Okabe-Ito) and tire burst math audit items, 14 Oct 2026. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('pra_models.js');
const box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
function load(src, parts) {
    const leaf = (id, s) => ({ id, type: 'basic', displayId: id, name: id, probability: 1e-5, identity: { kind: 'item', systemId: s } });
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {},
        systemsData: [{ id: 'HYD', name: 'Hyd' }], acFhaData: [{ internalId: 1, fcId: 'FC-001', fcDesc: 'x', severity: 'Catastrophic' }],
        ftaPages: [{ id: 'T1', name: 'x', linkedFhaIds: [1], root: { id: 'G1', type: 'gate', gateType: 'OR', displayId: 'FC-001', name: 'x', children: [leaf('B1', 'HYD')] } }] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
    ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb)); vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels;
    const m = C.addCadModel({ fileName: 't.step', sha256: 't', revision: 'A', units: 'mm', parts: [{ pid: 'tire', name: 'TIRE', path: ['A'], bbox: box(-600, 600, -200, 200, -600, 600) }].concat(parts || []) }).model;
    if (parts && parts.length) C.confirmLink(m.id, parts[0].pid, 'HYD', 'W');
    M.confirmTire({ id: 'tt', label: 'T', cadId: m.id, pid: 'tire', center: [0, 0, 0], axis: [0, 1, 0], grownDiameter: 1200, sectionWidth: 400, massKg: 100, speedRatingMs: 104, ratedPressureKpa: 1365 }, 'W', { at: 'x' });
    ['location', 'size', 'pressure', 'speed'].forEach(f => M.confirmField('tire', 'tt', f, 'W', true, { at: 'x' }));
    return { M, C, id: m.id };
}
// ---- colors: deltaE 1976 in CIELAB (D65) between every two types shown in the same view, and against the hit part colors
function lab(hex) { const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const X = (v[0] * 0.4124 + v[1] * 0.3576 + v[2] * 0.1805) / 0.95047, Y = v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722, Z = (v[0] * 0.0193 + v[1] * 0.1192 + v[2] * 0.9505) / 1.08883;
    const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116; return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; }
const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
const L0 = load(null, []), PAL = L0.M.PALETTE;
['rotor', 'tire'].forEach(g => { const cols = Object.entries(PAL[g]).concat([['hit fill', PAL.hitFill], ['hit edge', PAL.hitEdge]]); let min = Infinity, worst = '';
    for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) { const d = dE(cols[i][1], cols[j][1]); if (d < min) { min = d; worst = cols[i][0] + '/' + cols[j][0]; } }
    check('palette ' + g + ': every two types (and the hit part colors) at least deltaE76 25 apart (closest ' + worst + ' ' + min.toFixed(1) + ')', min > 25, worst + ' ' + min);
    const styles = Object.values(PAL[g + 'Edge']); check('palette ' + g + ': a distinct edge style per type (' + styles.join(', ') + ')', new Set(styles).size === styles.length); });
check('palette: Okabe-Ito values as specified (one-third disc vermillion #D55E00, intermediate blue #0072B2, small bluish green #009E73, alternate reddish purple #CC79A7, fan blade orange-gold #E69F00)', PAL.rotor.oneThirdDisc === '#D55E00' && PAL.rotor.intermediate === '#0072B2' && PAL.rotor.small === '#009E73' && PAL.rotor.alternate === '#CC79A7' && PAL.rotor.fanBlade === '#E69F00' && PAL.tire.m1Large === '#D55E00' && PAL.tire.m3Strip === '#009E73');
check('panel and export take the shared palette (no local color tables)', /TYPE_COLORS = window\.SLPraModels\.PALETTE\.rotor/.test(read('pra_panel.js')) && /TIRE_COLORS = window\.SLPraModels\.PALETTE\.tire/.test(read('pra_panel.js')) && /LineDashedMaterial/.test(read('pra_report.js')) && /LineDashedMaterial/.test(read('cad_viewer.js')));
// ---- tire: a hydraulic line 2 m out that crosses the wheel plane, with its center and every corner outside the +/-15 deg band
// line along the axle direction y from -3000 to +1000 at x = 2000: center (2000, -1000, 0) is atan(1000/2000) = 26.6 deg off the
// plane, corners 26.6 and 56.3 deg; it crosses the plane (y = 0) at (2000, 0, 0), 2000 mm away, elevation 0: inside Model 1 (15 deg)
const HYD = [{ pid: 'hyd', name: 'HYD_LINE', path: ['A'], bbox: box(1990, 2010, -3000, 1000, -10, 10) }];
const run = src => { const L = load(src, HYD); return L.M.tireReport('tt', 'm1Large'); };
const r1 = run();
check('tire: a line crossing the wheel plane 2 m away is hit by Model 1 large (center and corners all outside 15 deg); method says triangles exact', r1.ok && r1.partsHit.indexOf('hyd') >= 0 && /tested exactly/.test(r1.method), JSON.stringify(r1.partsHit) + ' ' + r1.method);
// ---- Model 4 burst pressure per the verbatim AMC text and its example: (rated / 1.07) as absolute pressure x 1.3:
// 1365 / 1.07 = 1275.70 kPa gauge, + 101.325 = 1377.03 kPa absolute, x 1.3 = 1790.13 kPa absolute (AMC: "1 790 kPa absolute")
const L4 = load(null, []); L4.M.confirmTire(Object.assign({}, L4.M.tire('tt'), { braked: true }), 'W', { at: 'y' }); ['location', 'size', 'pressure', 'speed'].forEach(f => L4.M.confirmField('tire', 'tt', f, 'W', true, { at: 'y' }));
L4.M.setTireStowed('tt', { center: [0, 0, 500], axis: [0, 1, 0] }, 'W');
const m4 = L4.M.tireReport('tt', 'retracted|m4Burst');
check('Model 4 burst pressure (1365 / 1.07 + 101.325) x 1.3 = 1790.13 kPa absolute, as the AMC example (1 790 kPa absolute)', m4.ok && Math.abs(m4.params.burstPressureKpaAbs.value - 1790.134) < 0.01 && /absolute/.test(m4.params.burstPressureKpaAbs.note), JSON.stringify(m4.params && m4.params.burstPressureKpaAbs));
// ---- small debris area: 1.5 % of pi DG x tread width; with no tread width entered WSG is used and said so:
// 0.015 x pi x 1200 x 400 = 22,619.5 mm2
const ms = load(null, []).M.tireReport('tt', 'm1Small');
check('small debris area = 1.5 % of the total tread area pi DG WSG as the AMC defines it (quoted): 0.015 x pi x 1200 x 400 = 22,619.5 mm2; no tread width input', Math.abs(ms.params.impactAreaMm2.value - 22619.47) < 0.1 && ms.params.impactAreaMm2.ref === 'amc25-734-defs' && !/tread width/.test(ms.params.impactAreaMm2.note), JSON.stringify(ms.params.impactAreaMm2));
// ---- drawing = tested region for the tire: half angle theta from the wheel plane at the tire center, no axial width, reach = the hit test's reach
const LD = load(null, HYD), tv = LD.M.tireVolume('tt', 'm1Large', 12000), trc = LD.M.tireReach('tt');
check('tire drawing = tested region: half angle 15 deg, no axial width, outer radius = the reach used by the hit test', tv.halfAngleDeg === 15 && tv.widthMm === 0 && tv.outerRadius === trc.value, JSON.stringify(tv));
// ---- lightning zones: 1A, 1B, 1C, 2A, 2B, 3 all at least deltaE76 25 apart
{ const L = Object.entries(PAL.lightning); let min = Infinity, w = ''; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const d = dE(L[i][1], L[j][1]); if (d < min) { min = d; w = L[i][0] + '/' + L[j][0]; } }
  check('palette lightning: every two zones at least deltaE76 25 apart (closest ' + w + ' ' + min.toFixed(1) + '); the panel takes it', min >= 25 && /LZ_COLORS = window\.SLPraModels\.PALETTE\.lightning/.test(read('pra_panel.js')), w + ' ' + min); }
// ---- first hit and credited shields: a plate at x 900..1000 (y, z +/-300) stands between the tire and a box at x 2000..2050 (y, z +/-50),
// both in the wheel plane: the plate is directly exposed, the box is behind the plate; credited as a shield, the box is not counted
const SHP = [{ pid: 'box', name: 'BOX', path: ['A'], bbox: box(2000, 2050, -50, 50, -50, 50) }, { pid: 'plate', name: 'PLATE', path: ['A'], bbox: box(900, 1000, -300, 300, -300, 300) }];
const LS = load(null, SHP), e0 = LS.M.tireReport('tt', 'm1Large');
const noWhyS = LS.M.creditTireShield('tt', 'plate', '', 'W'); LS.M.creditTireShield('tt', 'plate', 'Frame 12 web, 4 mm titanium, stops tire debris per the test report.', 'W'); const e1 = LS.M.tireReport('tt', 'm1Large');
check('first hit: the plate is directly exposed, the box behind the plate; credited as a shield (with a reason, refused without), the box stays a hit marked behind a credited shield, not proven blocked (D4)', e0.exposure.plate === 'directly exposed' && e0.exposure.box === 'behind plate' && !noWhyS.ok && e1.partsHit.indexOf('box') >= 0 && e1.exposure.box === 'behind a credited shield (not proven blocked)' && e1.partsHit.indexOf('plate') >= 0 && e1.shielded.some(x => x.pid === 'box' && x.provenBlocked === false), JSON.stringify([e0.exposure, e1.partsHit, e1.shielded]));
// ---- drawing clipped to the airframe: the hydraulic line's wheel-plane crossing (2000, 0, 0) is a hit and lies inside the drawn
// region (its direction's drawn radius >= 2000 and it is in the band); a direction with no aircraft (az 180 deg here: -x) is not drawn
// (drawn radius = the tire radius 600); nowhere is the drawing beyond the reach
{ const LC = load(null, HYD), sp = LC.M.tireVolume('tt', 'm1Large', 12000), rr = sp.outerRadii, seg = rr.length, q = [2000, 0, 0];
  const az = (Math.atan2(q[0] * sp.e2[0] + q[1] * sp.e2[1] + q[2] * sp.e2[2], q[0] * sp.e1[0] + q[1] * sp.e1[1] + q[2] * sp.e1[2]) + 2 * Math.PI) % (2 * Math.PI), i = Math.floor(az / (2 * Math.PI) * seg) % seg;
  const back = [(az + Math.PI) % (2 * Math.PI)].map(a => Math.floor(a / (2 * Math.PI) * seg) % seg)[0];
  check('drawing clipped to the airframe: the hit point (2000, 0, 0) is inside the drawn region, the empty opposite direction is not drawn, nothing beyond the reach', rr[i] >= 2000 - 1e-6 && rr[back] === sp.innerRadius && Math.max(...rr) <= sp.outerRadius + 1e-9, JSON.stringify({ i, r: rr[i], back, rb: rr[back], reach: sp.outerRadius })); }
// ---- T2 (auditor): a line from (1000, 2000, 0) to (9000, -1000, 0), tire at the origin, axle y, Model 1 large (15 deg), reach reduced to 5000 mm.
// Neither end is inside both the band and the reach, and its wheel-plane crossing (6333, 0, 0) is beyond the reach, but the point at y = 900,
// x = 1000 + 8000 x 1100/3000 = 3933.3: k rho = tan 15 x 3933.3 = 1053.9 >= 900 and |q| = 4035 <= 5000: a hit.
function seg(src) { const L = load(src, [{ pid: 'ln', name: 'LINE', path: ['A'], bbox: box(1000, 9000, -1000, 2000, -1, 1) }]);
  L.M.setTriangleSource(pid => pid === 'ln' ? new Float32Array([1000, 2000, 0, 9000, -1000, 0, 9000, -1000, 0.001]) : null);
  L.M.setTireReach('tt', 5000, 'Debris beyond 5 m judged spent for the auditor case.', 'W'); return L.M.tireReport('tt', 'm1Large'); }
check('T2: the auditor\'s segment is hit with the band, the 5000 mm reach and no arc limit together (exact, not corner checks)', seg().partsHit.indexOf('ln') >= 0, JSON.stringify(seg().partsHit));
// ---- T3: Model 2 cone 20 deg about the outboard direction (0, -1, 0): a line from (-3000, -3000, 0) to (3000, -3000, 0) crosses the cone axis
// 3 m outboard; both ends are 45 deg off the axis (outside the cone): a hit
function cone(src, wpl, yy, frad) { yy = yy == null ? -3000 : yy; const L = load(src, [{ pid: 'cl', name: 'CROSS', path: ['A'], bbox: box(-3000, 3000, yy - 1, yy + 1, -1, 1) }]);
  L.M.confirmTire(Object.assign({}, L.M.tire('tt'), { flangeHalfAngleDeg: 20 }), 'W', { at: 'z' }); ['location', 'size', 'pressure', 'speed'].forEach(f => L.M.confirmField('tire', 'tt', f, 'W', true));
  L.M.setTireOutboard('tt', [0, -1, 0], 'W'); L.M.setTireWheelsPerLeg('tt', wpl || 2, 'W'); if (frad !== 0) L.M.setTireFlangeRadius('tt', frad || 450, 'W'); L.M.setTriangleSource(pid => pid === 'cl' ? new Float32Array([-3000, yy, 0, 3000, yy, 0, 3000, yy, 0.001]) : null); return L.M.tireReport('tt', 'm2Flange'); }
check('T3: a line crossing the Model 2 cone axis 3 m outboard is hit (exact triangle against cone and reach)', cone().partsHit.indexOf('cl') >= 0, JSON.stringify(cone().partsHit));
// ---- T4: the same line mirrored 3 m inboard (y = +3000): with 2 wheels on the leg only the outer half flange (outboard cone) is
// released, so it is not hit; with a single wheel either flange is, so the inboard cone hits it. The report quotes the AMC sentence.
{ const two = cone(null, 2, 3000), one = cone(null, 1, 3000);
  check('T4: single-wheel leg: the inboard line is hit (both flange cones); two wheels: not hit (outer flange only); the AMC sentence is quoted', two.partsHit.indexOf('cl') < 0 && one.partsHit.indexOf('cl') >= 0 && one.refs.some(r => /If only a single wheel is installed on a landing gear leg, then the lateral release of either flange shall be considered\./.test(r.quote)) && /both flanges/.test(one.params.flanges.value), JSON.stringify([two.partsHit, one.partsHit])); }
// ---- T5 (auditor): an FCC box 2 m above the tire under a wing skin plate at z = 1500; the skin credited as a shield (with a reason):
// every tread ray to the FCC passes through the skin, so the FCC is shielded and not counted; the skin stays a hit. A wheel hub inside
// the tread radius credited as a shield removes nothing: the rays start on the tread, outside the hub.
function wing(src) { const L = load(src, [{ pid: 'fcc', name: 'FCC', path: ['A'], bbox: box(-100, 100, -50, 50, 2000, 2100) }, { pid: 'skin', name: 'WING_SKIN', path: ['A'], bbox: box(-3000, 3000, -2000, 2000, 1500, 1510) }]);
  L.M.creditTireShield('tt', 'skin', 'Wing lower skin, 3 mm aluminium, stops Model 1 debris per the test report.', 'W'); return L.M.tireReport('tt', 'm1Large'); }
function hub(src) { const L = load(src, HYD.concat([{ pid: 'hub', name: 'WHEEL_HUB', path: ['A'], bbox: box(-300, 300, -100, 100, -300, 300) }]));
  L.M.creditTireShield('tt', 'hub', 'Hub credited for the auditor case.', 'W'); return L.M.tireReport('tt', 'm1Large'); }
{ const w = wing(), hb = hub();
  check('T5 / D4: wing skin credited: every tread ray to the FCC meets it, but sampling proves nothing: the FCC stays a hit marked behind a credited shield (not proven blocked); ray count stated', w.partsHit.indexOf('fcc') >= 0 && w.exposure.fcc === 'behind a credited shield (not proven blocked)' && w.partsHit.indexOf('skin') >= 0 && w.shielded.some(x => x.pid === 'fcc' && x.rays > 24) && /at most 256 per part/.test(w.rayNote), JSON.stringify([w.partsHit, w.shielded, w.rayCount]));
  check('T5: crediting the hub does not remove all hits (the hydraulic line stays directly exposed)', hb.partsHit.indexOf('hyd') >= 0 && hb.exposure.hyd === 'directly exposed', JSON.stringify([hb.partsHit, hb.exposure, hb.shielded])); }
// ---- timebox 46: flange rim radius (engineer input). Without it Model 2 is refused. Hand calc of the ray origin: outboard (0, -1, 0),
// WSG 400, radius 450, target point (0, -3000, 1000): w . cd = 3000, radial part (0, 0, 1000), origin = (0, -200, 0) + 450 (0, 0, 1) = (0, -200, 450).
// A blocker plate at y = -150..-100 between the hub and the flange face does not block a ray starting on the flange rim at y = -200.
{ const no = cone(null, 2, -3000, 0);
  check('Model 2 refused without the flange rim radius (no approximation); with it the radius is in the report, labeled engineer input', no.incomplete && /flange rim radius/.test(no.note) && cone().params.flangeRadiusMm.value === 450 && /not from the AMC text, engineer input/.test(cone().params.flangeRadiusMm.note), JSON.stringify(no.note));
  const L = load(null, [{ pid: 'cl', name: 'CROSS', path: ['A'], bbox: box(-3000, 3000, -3001, -2999, -1, 1) }, { pid: 'disc', name: 'WHEEL_DISC', path: ['A'], bbox: box(-400, 400, -150, -100, -400, 400) }]);
  L.M.confirmTire(Object.assign({}, L.M.tire('tt'), { flangeHalfAngleDeg: 20 }), 'W', { at: 'z' }); ['location', 'size', 'pressure', 'speed'].forEach(f => L.M.confirmField('tire', 'tt', f, 'W', true));
  L.M.setTireOutboard('tt', [0, -1, 0], 'W'); L.M.setTireWheelsPerLeg('tt', 2, 'W'); L.M.setTireFlangeRadius('tt', 450, 'W');
  L.M.setTriangleSource(pid => pid === 'cl' ? new Float32Array([-3000, -3000, 0, 3000, -3000, 0, 3000, -3000, 0.001]) : null);
  const r = L.M.tireReport('tt', 'm2Flange');
  check('Model 2 rays start on the flange rim on the released side: a wheel disc inboard of the flange face does not block the line 3 m outboard', r.exposure.cl === 'directly exposed', JSON.stringify([r.partsHit, r.exposure])); }
// ---- timebox 46 speed: the BVH gives exactly the brute-force answer (deterministic pseudo-random triangles and segments)
{ const I = load(null, []).M._internal; let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const items = []; for (let i = 0; i < 600; i++) { const c = [rnd() * 10000, rnd() * 10000, rnd() * 10000], tri = [0, 1, 2].map(() => c.map(v => v + (rnd() - 0.5) * 800)); items.push({ tri, pid: 'p' + (i % 37) }); }
  const B = I.bvh(items); let same = true, nz = 0;
  for (let k = 0; k < 400 && same; k++) { const o = [rnd() * 10000, rnd() * 10000, rnd() * 10000], q = [rnd() * 10000, rnd() * 10000, rnd() * 10000], d = q.map((v, i) => v - o[i]), L = Math.hypot(...d), u = d.map(v => v / L), skip = 'p' + (k % 37);
    const brute = {}; items.forEach(it => { if (it.pid === skip) return; const t = I.rayTri(o, u, it.tri[0], it.tri[1], it.tri[2]); if (t > 1e-6 && t < L - 1e-6 && !(brute[it.pid] <= t)) brute[it.pid] = t; });
    const fast = I.bvhSegment(B, o, u, L, skip); if (Object.keys(brute).length) nz++; same = JSON.stringify(Object.keys(brute).sort().map(k2 => [k2, brute[k2]])) === JSON.stringify(Object.keys(fast).sort().map(k2 => [k2, fast[k2]])); }
  check('BVH first-hit query equals the brute force on 400 segments against 600 triangles (' + nz + ' segments with hits)', same && nz > 20); }
{ const I = load(null, []).M._internal; let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; let same = true, inW = 0, inC = 0;
  const arc = { fromDeg: 300, toDeg: 60, ref: [0, 0, 1] };
  for (let k = 0; k < 3000 && same; k++) { const q = [(rnd() - 0.5) * 12000, (rnd() - 0.5) * 12000, (rnd() - 0.5) * 12000], T = [[q, q, q]];
    const a = I.ptInWedge(q, [0, 0, 0], [0, 1, 0], 15, 5000, k % 2 ? arc : null), b = I.wedgeHitTris(T, [0, 0, 0], [0, 1, 0], 15, 5000, k % 2 ? arc : null);
    const c = I.ptInCone(q, [0, 0, 0], [0, -1, 0], 20, 5000), d = I.coneHitTris(T, [0, 0, 0], [0, -1, 0], 20, 5000); if (a) inW++; if (c) inC++; same = a === b && c === d; }
  check('point zone tests equal the triangle tests on a single point (3000 points, ' + inW + ' in the wedge, ' + inC + ' in the cone)', same && inW > 30 && inC > 30); }
{ // the speed rejects never change an answer: triangle tests with and without them on 3000 random triangles
  const R1 = "if (aM - rB > k * (rhoM + rB) + 1e-6 || _len(mC) - rB > R) continue;", R2 = "if (lm > rB2 * 1.001 && (lm - rB2 > R || Math.acos(Math.max(-1, Math.min(1, _dot(mC2, o) / lm))) - Math.asin(rB2 / lm) > thetaDeg * D2R + 1e-6)) continue;";
  const I = load(null, []).M._internal, J = load(SRC.replace(R1, '').replace(R2, ''), []).M._internal; let seed = 5; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let same = SRC.indexOf(R1) > 0 && SRC.indexOf(R2) > 0, hw = 0, hc = 0; const arc = { fromDeg: 300, toDeg: 60, ref: [0, 0, 1] };
  for (let k = 0; k < 3000 && same; k++) { const c = [(rnd() - 0.5) * 12000, (rnd() - 0.5) * 12000, (rnd() - 0.5) * 12000], sz = rnd() < 0.5 ? 300 : 4000, T = [[0, 1, 2].map(() => c.map(v => v + (rnd() - 0.5) * sz))];
    const a = I.wedgeHitTris(T, [0, 0, 0], [0, 1, 0], 15, 5000, k % 2 ? arc : null), b = J.wedgeHitTris(T, [0, 0, 0], [0, 1, 0], 15, 5000, k % 2 ? arc : null), x = I.coneHitTris(T, [0, 0, 0], [0, -1, 0], 20, 5000), y = J.coneHitTris(T, [0, 0, 0], [0, -1, 0], 20, 5000);
    if (a) hw++; if (x) hc++; same = a === b && x === y; }
  check('speed rejects change no answer: wedge and cone triangle tests with and without them agree on 3000 random triangles (' + hw + ' wedge hits, ' + hc + ' cone hits)', same && hw > 30 && hc > 30); }
// ---- D4 (auditor shield2.js): two credited plates at z = 3000 with a gap; an FCC plate above. Straight lines from the tread pass
// the gap (gap wider than WSG), so the FCC must stay a hit for every gap position the auditor tried
{ const res = [[1000, 600], [1234, 600], [2000, 700], [-1777, 800], [3111, 900]].map(([x0, w]) => { const L = load(null, [{ pid: 'fcc', name: 'FCC-1', path: ['A'], bbox: box(-20000, 20000, -20000, 20000, 3100, 3200) }, { pid: 'sh1', name: 'plate A', path: ['A'], bbox: box(-30000, x0, -30000, 30000, 3000, 3020) }, { pid: 'sh2', name: 'plate B', path: ['A'], bbox: box(x0 + w, 30000, -30000, 30000, 3000, 3020) }]);
    L.M.creditTireShield('tt', 'sh1', 'Plate A substantiated against large debris.', 'W'); L.M.creditTireShield('tt', 'sh2', 'Plate B substantiated against large debris.', 'W'); return L.M.tireThreats('tt').models.find(x => x.model === 'm1Large').hits.indexOf('fcc') >= 0; });
  check('D4 auditor shield gap: the FCC behind two credited plates with a gap stays a hit at all five gap positions', res.every(Boolean), JSON.stringify(res)); }
// ---- D5 hand case: a large triangle in the plane n . q = 4900, n = unit(1, 0.25, 0) (tire at the origin, axle y, Model 1 15 deg, reach 5000).
// The reach sphere cuts the plane in a circle of center 4900 n = (4753.5, 1188.4, 0) and radius sqrt(5000^2 - 4900^2) = 994.99; the
// triangle (vertices 20 m out) contains it. On the circle y runs 1188.4 +/- 965.3 = 223.1 .. 2153.7: it never meets the wheel plane, and
// no edge or vertex is within the reach; on the sphere the band is |y| <= 5000 sin 15 = 1294.1, met on the circle (y 223 .. 1294): a hit,
// found only by the exact circle ends (the 360 samples are gone)
function circ(src) { const n = [0.9701425, 0.2425356, 0], c = n.map(v => v * 4900), u = [-0.2425356, 0.9701425, 0], w = [0, 0, 1], V = [90, 210, 330].map(a => c.map((v, i) => v + 20000 * (Math.cos(a * Math.PI / 180) * u[i] + Math.sin(a * Math.PI / 180) * w[i])));
  const L = load(src, [{ pid: 'pl', name: 'PLANE', path: ['A'], bbox: { min: [0, 1, 2].map(i => Math.min(...V.map(q => q[i]))), max: [0, 1, 2].map(i => Math.max(...V.map(q => q[i]))) } }]);
  L.M.setTriangleSource(pid => pid === 'pl' ? new Float32Array([].concat(...V)) : null); L.M.setTireReach('tt', 5000, 'Debris beyond 5 m judged spent for the hand case.', 'W'); return L.M.tireReport('tt', 'm1Large'); }
check('D5: the band met only on the reach circle, off the wheel plane, inside the triangle, is found exactly', circ().partsHit.indexOf('pl') >= 0, JSON.stringify(circ().partsHit));
const mut = (name, from, to, test) => { if (SRC.indexOf(from) < 0) { check('anchor present: ' + name, false); return; } let red = false; try { red = !test(from, to); } catch (e) { red = true; } check('mutation goes red: ' + name, red); };
mut('plane crossing not tested', "if ((a0 <= 0 && a1 >= 0) || (a0 >= 0 && a1 <= 0)) return true;", "", (f, t) => run(SRC.replace(f, t)).partsHit.indexOf('hyd') >= 0);
mut('ambient pressure dropped (gauge only)', "P(_r6(1.3 * (t.ratedPressureKpa / 1.07 + 101.325))", "P(_r6(1.3 * t.ratedPressureKpa / 1.07)", (f, t) => { const X = load(SRC.replace(f, t), []); X.M.confirmTire(Object.assign({}, X.M.tire('tt'), { braked: true }), 'W', { at: 'y' }); ['location', 'size', 'pressure', 'speed'].forEach(g => X.M.confirmField('tire', 'tt', g, 'W', true, { at: 'y' })); X.M.setTireStowed('tt', { center: [0, 0, 500], axis: [0, 1, 0] }, 'W'); var q = X.M.tireReport('tt', 'retracted|m4Burst').params.burstPressureKpaAbs; return Math.abs(q.value - 1790.134) < 0.01; });
mut('band test by triangle ends only (no exact edge search, no reach-circle candidates)', "if (g(pAt(t0)) <= 1e-9 || g(pAt(t1)) <= 1e-9) return true; }", "}", (f, t) => seg(SRC.replace(f, t).replace("for (var cN = 0; cN < cand.length; cN++)", "for (var cN = 0; cN < 0; cN++)")).partsHit.indexOf('ln') >= 0);
mut('D5: reach circle tested at its wheel-plane crossings only (no exact band ends)', "for (var cN = 0; cN < cand.length; cN++)", "for (var cN = 0; cN < 0; cN++)", (f, t) => circ(SRC.replace(f, t)).partsHit.indexOf('pl') >= 0);
mut('cone tested at the vertices only', "if (inner((lo + hi) / 2) <= 1e-6 * Math.max(1, _len(A))) return true;", "if ([A, B, C3].some(q => F(q) <= 0)) return true;", (f, t) => cone(SRC.replace(f, t)).partsHit.indexOf('cl') >= 0);
mut('single wheel: inboard flange cone dropped', "(t.wheelsPerLeg.value === 1 ? [t.outboard.dir, t.outboard.dir.map(function (v) { return -v; })] : [t.outboard.dir])", "[t.outboard.dir]", (f, t) => cone(SRC.replace(f, t), 1, 3000).partsHit.indexOf('cl') >= 0);
mut('rays from the tire center (not the tread)', "var sc = Math.max(-W / 2, Math.min(W / 2, sa)); return", "return ctr.slice(); var sc = 0; return", (f, t) => hub(SRC.replace(f, t)).exposure.hyd === 'directly exposed');
// half rib (x < 0 only) credited, uncredited skin over everything: some FCC rays meet only uncredited parts, so the FCC is not shielded
const halfRib = src => { const L = load(src, [{ pid: 'fcc', name: 'FCC', path: ['A'], bbox: box(-100, 100, -50, 50, 2000, 2100) }, { pid: 'skin', name: 'WING_SKIN', path: ['A'], bbox: box(-3000, 3000, -2000, 2000, 1500, 1510) }, { pid: 'rib', name: 'RIB', path: ['A'], bbox: box(-3000, 0, -2000, 2000, 1700, 1710) }]); L.M.creditTireShield('tt', 'rib', 'rib credited', 'W'); const r = L.M.tireReport('tt', 'm1Large'); return r.partsHit.indexOf('fcc') >= 0 && /behind skin/.test(r.exposure.fcc); };
check('T5: shield credit semantics: a credited rib covering only part of the rays does not shield the FCC (it stays a hit, behind the skin)', halfRib(null));
mut('shielded when any ray is shield-blocked (not every ray)', "if (!cr.length) allShielded = false; else", "if (!cr.length) {} else", (f, t) => halfRib(SRC.replace(f, t)));
mut('24-point cap restored', "if (pts.length > RAY_BUDGET)", "pts = pts.slice(0, 24); if (pts.length > RAY_BUDGET)", (f, t) => wing(SRC.replace(f, t)).shielded.some(x => x.rays > 24));
mut('Model 2 without the flange radius falls back to an approximation', "if (tm.lateral && !(t.flangeRadius && t.flangeRadius.value > 0)) return", "if (false) return", (f, t) => { try { return cone(SRC.replace(f, t), 2, -3000, 0).incomplete; } catch (e) { return false; } });
mut('BVH node test skips a branch it must visit', "while (stack.length) { var nd = stack.pop(); if (!_slab(o, u, nd, L)) continue;\n            if (nd.l) { stack.push(nd.l, nd.r); continue; }", "while (stack.length) { var nd = stack.pop(); if (!_slab(o, u, nd, L)) continue;\n            if (nd.l) { stack.push(nd.l); continue; }", (f, t) => run(SRC.replace(f, t)).partsHit.indexOf('hyd') >= 0 && (() => { const X = load(SRC.replace(f, t), []).M._internal, it = []; for (let i = 0; i < 40; i++) it.push({ tri: [[i * 100, 0, -50], [i * 100, 0, 50], [i * 100 + 1, 50, 0]], pid: 'q' + i }); const r = X.bvhSegment(X.bvh(it), [-10, 10, 0], [1, 0, 0], 5000, null); return Object.keys(r).length === 40; })());
mut('D4: sampled shielding removes the hit', "            // (D4) no hit is removed on sampling", "            hits = hits.filter(function (pid) { return !shielded.some(function (x) { return x.pid === pid; }); });", (f, t) => wing(SRC.replace(f, t)).partsHit.indexOf('fcc') >= 0);
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);

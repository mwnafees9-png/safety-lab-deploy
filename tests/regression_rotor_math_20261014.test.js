#!/usr/bin/env node
/* Regression: rotor burst math against AC 20-128A (para 9a, Appendix 1 4.1(a), 5.5, 6.4, 6.5),
 * 14 Oct 2026. Every expected value is a hand calculation written out here. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('pra_models.js');
const box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
const near = (a, b, tol) => Math.abs(a - b) <= tol;
let FAWT = 0, ENGST = 2;   // engineer inputs for the fixtures: zero fragment axial width (the older hand calcs), engine E1 with two stages
function scenario(src, targets) {
    const leaf = (id, s) => ({ id, type: 'basic', displayId: id, name: id, probability: 1e-5, identity: { kind: 'item', systemId: s } });
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {},
        systemsData: [{ id: 'FCC1', name: 'FCC 1' }], acFhaData: [{ internalId: 1, fcId: 'FC-001', fcDesc: 'x', severity: 'Catastrophic' }],
        ftaPages: [{ id: 'T1', name: 'x', linkedFhaIds: [1], root: { id: 'G1', type: 'gate', gateType: 'OR', displayId: 'FC-001', name: 'x', children: [leaf('B1', 'FCC1')] } }] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
    ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb)); vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels;
    const m = C.addCadModel({ fileName: 'a.step', sha256: 'a', revision: 'A', units: 'mm', parts: [{ pid: 'disc', name: 'HPT rotor disc', path: ['A'], bbox: box(-500, 500, -500, 500, -20, 20) }].concat(targets) }).model;
    C.confirmLink(m.id, 't', 'FCC1', 'W');
    M.confirmRotor({ id: 'r1', label: 'r', cadId: m.id, pid: 'disc', center: [0, 0, 0], axis: [0, 0, 1], refDir: [1, 0, 0], rotation: 1, discRadius: 400, bladeLength: 100, bladedDiscMassKg: 30, rpm: 12000, fragmentAxialWidthMm: FAWT, confirms: { axialWidth: { by: 'W' } }, engine: 'E1', engineStages: ENGST }, 'W', { at: 'x' });
    return { M, r: M.rotor('r1'), sw: M.sweep('r1', { step: 1, models: ['oneThirdDisc', 'small'] }) };
}
// ---- hand calculation, one-third disc, R = 400 mm, b = 100 mm, 30 kg bladed disc, 12000 rpm
// para 9a: sector of the disc with one-third blade height: r = R + b/3 = 433.333 mm
// sector centroid (120 deg, half angle a = pi/3): rc = 2 r sin(a) / (3 a) = r sqrt(3) / pi = 433.333 x 0.5513289 = 238.909 mm
// greatest radius from the centroid to the periphery: to an arc end, sqrt(r^2 + rc^2 - 2 r rc cos 60) = sqrt(187777.8 + 57077.6 - 103525.9) = 375.94 mm (apex: 238.9)
// maximum dimension: chord sqrt(3) r = 750.56 mm; mass 30 / 3 = 10 kg; omega = 12000 x 2 pi / 60 = 1256.637 rad/s
// speed of the c.g.: 1256.637 x 0.238909 = 300.222 m/s; translational energy 1/2 x 10 x 300.222^2 = 450,667 J
// rotational share (not included per 9a): about the centroid k^2 = r^2/2 - rc^2 = 93,888.9 - 57,077.6 = 36,811 mm^2; rotational / translational = k^2 / rc^2 = 0.645 ("about 0.65x")
const r3 = 400 + 100 / 3, rc = r3 * Math.sqrt(3) / Math.PI, hwEnd = Math.sqrt(r3 * r3 + rc * rc - 2 * r3 * rc * Math.cos(Math.PI / 3));
const S = scenario(null, [{ pid: 't', name: 'FCC-1', path: ['A'], bbox: box(19999.999, 20000.001, -0.001, 0.001, -0.001, 0.001) }]);
const m1 = S.sw.models.find(x => x.model === 'oneThirdDisc'), ms = S.sw.models.find(x => x.model === 'small');
check('one-third disc c.g. radius = centroid of the 120 deg sector of radius R + b/3 (238.909 mm)', near(m1.rCgMm.value, 238.909, 0.001) && near(m1.rCgMm.value, rc, 1e-3), m1.rCgMm.value);
check('one-third disc path half-width = greatest radius centroid to periphery (375.94 mm)', near(m1.halfWidthMm.value, 375.94, 0.01) && near(m1.halfWidthMm.value, hwEnd, 1e-3), m1.halfWidthMm.value);
check('one-third disc maximum dimension = sqrt(3) (R + b/3) (750.56 mm)', near(m1.maxDimensionMm.value, 750.56, 0.01), m1.maxDimensionMm.value);
const E = S.M.fragmentEnergy(S.r, 'oneThirdDisc');
check('one-third disc: mass 10 kg, c.g. speed 300.22 m/s, translational energy 450,667 J (+/- 5 J), labeled translational only per 9a with the rotational share stated', near(E.massKg.value, 10, 1e-9) && near(E.speedMs.value, 300.22, 0.01) && near(E.energyJ.value, 450667, 5) && /translational energy per AC 20-128A 9a; rotational energy \(about 0\.65x for a uniform 120 deg sector\) not included/.test(E.energyJ.note), JSON.stringify([E.speedMs.value, E.energyJ.value, E.energyJ.note]));
// ---- exact translational risk angle, small fragment, target 20 m away (a 0.002 mm cube on the x axis)
// small fragment: rc = R + 3/4 b = 475 mm; half-width = (b/2)/2 = 25 mm. Path at release angle th hits the point (D, 0) when
// |D cos th - rc| <= hw (lateral) and the point is ahead: rot (q . t) >= 0 with t = (-sin th, cos th), so sin th <= 0.
// cos th in [450/20000, 500/20000]: width = acos(0.0225) - acos(0.025) = 0.0025005 rad = 0.143268 deg (one branch, sin th < 0)
const want = (Math.acos(450 / 20000) - Math.acos(500 / 20000)) * 180 / Math.PI;
check('exact risk angle: a target narrower than any step is not missed; 20 m target, small fragment: ' + want.toFixed(6) + ' deg', near(ms.catastrophicDeg, want, 2e-4), ms.catastrophicDeg);
// brute force, independent of the code: 3.6 million release angles
let n = 0; const N = 3600000; for (let i = 0; i < N; i++) { const th = 2 * Math.PI * (i + 0.5) / N, lat = 20000 * Math.cos(th) - 475; if (Math.abs(lat) <= 25.001 && Math.sin(th) <= 0) n++; }
check('exact risk angle agrees with an independent 0.0001 deg brute force (within 0.0002 deg)', near(ms.catastrophicDeg, n / N * 360, 2e-4), ms.catastrophicDeg + ' vs ' + (n / N * 360));
check('one-third disc at the same target: exact width = 2 hw / D (rad) region, both from the hand calc: acos((rc - hw)/D) - acos((rc + hw)/D)', near(m1.catastrophicDeg, (Math.acos((rc - hwEnd) / 20000) - Math.acos((rc + hwEnd) / 20000)) * 180 / Math.PI, 2e-4), m1.catastrophicDeg);
check('ranges come from the exact intervals (one Catastrophic range of that width)', ms.ranges.filter(x => x.severity === 'Catastrophic').length === 1 && near(ms.ranges[0].widthDeg, want, 2e-4), JSON.stringify(ms.ranges));
// ---- drawing = tested region: wedge of +/- spread from the plane at the shaft centerline, no axial width
// one-third disc: half angle 3 deg, inner radius max(0, rc - hw) = max(0, 238.909 - 375.94) = 0
const sp = S.M.spreadVolume('r1', 'oneThirdDisc', 30000);
check('drawn one-third disc region: half angle 3 deg, no axial width, from radius 0 (rc - hw < 0)', sp.halfAngleDeg === 3 && sp.widthMm === 0 && sp.innerRadius === 0, JSON.stringify(sp));
// a part at 3000 mm in the plane direction, raised 150 mm (elevation atan(150/3000.5) = 2.86 deg < 3) is inside the drawn wedge and is hit;
// raised 160 mm (3.05 deg > 3) is outside the wedge and is not hit
const up = z => scenario(null, [{ pid: 't', name: 'FCC-1', path: ['A'], bbox: box(2999.5, 3000.5, -0.5, 0.5, z - 0.5, z + 0.5) }]).sw.models[0].catastrophicDeg;
const inW = (z) => Math.atan2(z - 0.5, 3000.5) * 180 / Math.PI <= sp.halfAngleDeg;
check('hit iff inside the drawn wedge: 150 mm up (2.85 deg) hit and drawn, 160 mm up (3.04 deg) neither', up(150) > 0 && inW(150) && up(160) === 0 && !inW(160), up(150) + ' / ' + up(160));
// ---- Appendix 1 6.6 spread factor: a part hit only over part of the +/- 3 deg spread
// target at 3000 mm (box 2999.5..3000.5), axially from 0 to 2999.5 tan(1.5 deg) = 78.535 mm: elevations 0..1.5 deg of -3..+3
// factor = (1.5 - 0) / 6 = 0.25; hazard ratio = translational risk angle x 0.25 / 360 (phase and risk factors 1.0 by default)
const hz = 2999.5 * Math.tan(1.5 * Math.PI / 180);
const SF = scenario(null, [{ pid: 't', name: 'FCC-1', path: ['A'], bbox: box(2999.5, 3000.5, -0.5, 0.5, 0, hz) }]).sw.models[0];
check('spread factor (6.6): hit over 1.5 of the 6 degrees of spread: factor 0.25, ratio = angle x 0.25 / 360', SF.catastrophicDeg > 0 && Math.abs(SF.spreadWeightedDeg - SF.catastrophicDeg * 0.25) < 1e-4 && Math.abs(SF.hazardRatio - SF.catastrophicDeg * 0.25 / 360) < 2e-6 && SF.phaseFactor.value === 1 && SF.riskFactor.value === 1, JSON.stringify([SF.catastrophicDeg, SF.spreadWeightedDeg, SF.hazardRatio]));
// ---- para 10c(3)(iii) multiple fragments and 10e averaging, two channels FCC1 AND FCC2 (Catastrophic only when both are lost)
function scenario2(src, D) { D = D || 20000;
    const leaf = (id, s2) => ({ id, type: 'basic', displayId: id, name: id, probability: 1e-5, identity: { kind: 'item', systemId: s2 } });
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {},
        systemsData: [{ id: 'FCC1', name: 'FCC 1' }, { id: 'FCC2', name: 'FCC 2' }], acFhaData: [{ internalId: 1, fcId: 'FC-001', fcDesc: 'x', severity: 'Catastrophic' }],
        ftaPages: [{ id: 'T1', name: 'x', linkedFhaIds: [1], root: { id: 'G1', type: 'gate', gateType: 'AND', displayId: 'FC-001', name: 'x', children: [leaf('B1', 'FCC1'), leaf('B2', 'FCC2')] } }] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
    ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb)); vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels, Z = D * 0.055;   // axial +/- 0.055 D covers the whole +/-3 deg spread (tan 3 deg = 0.0524)
    const m = C.addCadModel({ fileName: 'b.step', sha256: 'b', revision: 'A', units: 'mm', parts: [{ pid: 'disc', name: 'HPT rotor disc', path: ['A'], bbox: box(-500, 500, -500, 500, -20, 20) },
        { pid: 'a', name: 'FCC-1', path: ['A'], bbox: box(D - 0.001, D + 0.001, -0.001, 0.001, -Z, Z) }, { pid: 'b', name: 'FCC-2', path: ['A'], bbox: box(-0.001, 0.001, D - 0.001, D + 0.001, -Z, Z) }] }).model;
    C.confirmLink(m.id, 'a', 'FCC1', 'W'); C.confirmLink(m.id, 'b', 'FCC2', 'W');
    M.confirmRotor({ id: 'r1', label: 'r', cadId: m.id, pid: 'disc', center: [0, 0, 0], axis: [0, 0, 1], refDir: [1, 0, 0], rotation: 1, discRadius: 400, bladeLength: 100, bladedDiscMassKg: 30, rpm: 12000, fragmentAxialWidthMm: FAWT, confirms: { axialWidth: { by: 'W' } }, engine: 'E1', engineStages: ENGST }, 'W', { at: 'x' });
    M.confirmRotor({ id: 'r2', label: 'r2', cadId: m.id, pid: 'disc', center: [0, 0, 0], axis: [0, 0, 1], refDir: [1, 0, 0], rotation: 1, discRadius: 400, bladeLength: 100, bladedDiscMassKg: 30, rpm: 12000, fragmentAxialWidthMm: FAWT, confirms: { axialWidth: { by: 'W' } }, engine: 'E1', engineStages: ENGST }, 'W', { at: 'x' });
    return { M, mf: M.multipleFragments('r1'), av: M.averageRisk({ engineOf: { r1: 'E1', r2: 'E1' } }), single: M.sweep('r1', { models: ['oneThirdDisc'] }).models[0] };
}
// each channel is a point-like target at 20 m (full elevation cover): angle width w = acos((rc - hw)/D) - acos((rc + hw)/D) deg, p = w / 360
// three independent fragments; catastrophic when A and B are each hit by at least one:
// P = 1 - P(no A) - P(no B) + P(neither) = 1 - (1 - pA)^3 - (1 - pB)^3 + (1 - pA - pB)^3
// applicability: the largest bladed rotor diameter is 2 (400 + 100) = 1000 mm; channels at 20 m are outside it, so the
// multiple fragment criterion does not apply to them (P counted 0, both listed); channels at 900 mm are inside.
const S2 = scenario2();
check('multiple fragments: channels 20 m from the engine centerline are outside one rotor diameter (1000 mm): not applicable, listed, P 0', S2.mf.ok && S2.mf.probability === 0 && S2.mf.largestRotorDiameterMm === 1000 && S2.mf.notApplicable.map(x => x.equipment).join() === 'FCC1,FCC2', JSON.stringify(S2.mf).slice(0, 300));
// channels at D = 900 mm: w = acos((rc - hw)/900) - acos((rc + hw)/900) = acos(-0.15226) - acos(0.68317) = 51.84 deg; regions 90 deg apart do not overlap
const D9 = 900, w9 = (Math.acos((rc - hwEnd) / D9) - Math.acos((rc + hwEnd) / D9)) * 180 / Math.PI, pA = w9 / 360;
const Pm = 1 - 2 * Math.pow(1 - pA, 3) + Math.pow(1 - 2 * pA, 3);
const S9 = scenario2(null, D9);
check('multiple fragments (10c(3)(iii)) within one rotor diameter: P = 1 - 2(1 - p)^3 + (1 - 2p)^3 with p = ' + pA.toFixed(5) + ': ' + Pm.toFixed(5) + ', criterion 1 in 10', S9.mf.ok && Math.abs(S9.mf.probability - Pm) / Pm < 1e-4 && S9.mf.criterion.text === '1 in 10' && S9.mf.notApplicable.length === 0 && S9.mf.meets === (Pm <= 0.1), JSON.stringify(S9.mf).slice(0, 300));
check('single one-third disc on the AND gate: never Catastrophic alone (no single path hits both channels 90 deg apart): ratio 0', S2.single.hazardRatio === 0, S2.single.hazardRatio);
check('averaging (Appendix 1 6.11): two stages on one engine, average = mean of the stage ratios; Table 1 criteria 1 in 20 and 1 in 40; any single stage <= 2 x', S2.av.models.length === 2 && S2.av.models[0].engines.length === 1 && S2.av.models[0].engines[0].stages === 2 && S2.av.models[0].criterion.text === '1 in 20' && S2.av.models[1].criterion.text === '1 in 40' && S2.av.models[0].meetsEverySingle === true, JSON.stringify(S2.av.models.map(x => [x.airplaneAverage, x.criterion.text])));
// ---- real triangles: a part made of two tiny squares 90 deg apart (20 m out). Its box (and any convex hull) spans
// the gap between them; with its triangles the angle set is the union of each triangle's exact intervals:
// 2 x (acos(450/20000) - acos(500/20000)) = 2 x 0.143268 = 0.286536 deg (small fragment), the box would give far more.
function sq(cx, cy, h) { return [cx - h, cy - h, 0, cx + h, cy - h, 0, cx + h, cy + h, 0, cx - h, cy - h, 0, cx + h, cy + h, 0, cx - h, cy + h, 0]; }
function scenarioTri(src) {
    const S0 = scenario(src, [{ pid: 't', name: 'FCC-1', path: ['A'], bbox: box(-0.001, 20000.001, -0.001, 20000.001, -0.001, 0.001) }]);
    S0.M.setTriangleSource(pid => pid === 't' ? new Float32Array(sq(20000, 0, 0.001).concat(sq(0, 20000, 0.001))) : null);
    return S0.M.sweep('r1', { models: ['small'] });
}
const TR = scenarioTri(), BX = scenario(null, [{ pid: 't', name: 'FCC-1', path: ['A'], bbox: box(-0.001, 20000.001, -0.001, 20000.001, -0.001, 0.001) }]).sw.models[1];
check('real triangles: two squares 90 deg apart give 2 x 0.143268 deg exactly (box outline: ' + BX.catastrophicDeg.toFixed(2) + ' deg); method names the triangles', Math.abs(TR.models[0].catastrophicDeg - 2 * want) < 4e-4 && BX.catastrophicDeg > 10 && /own triangles/.test(TR.method), TR.models[0].catastrophicDeg);
// ---- certification basis: the part number only as the whole token after Part / CS- / FAR / 14 CFR Part; amendments ignored
const PB = t => S.M.parseBasis(t);
check('basis "Part 25 Amdt 25-129" is Part 25 (not 29)', PB('Part 25 Amdt 25-129').key === 'part25');
check('basis "CS-25 Amendment 23" is Part 25 (not 23)', PB('CS-25 Amendment 23').key === 'part25');
check('basis "14 CFR Part 125" is not Part 25: no key, the engineer is asked', PB('14 CFR Part 125').key === null && /Part 125/.test(PB('14 CFR Part 125').err));
check('basis naming two parts is ambiguous: no key, the engineer is asked', PB('Part 25 and Part 23').key === null && PB('Part 25 and Part 23').ambiguous === true);
check('basis "14 CFR Part 23 commuter" is Part 23 commuter; "Part 23 non-commuter" is not commuter (criteria x 2 per 10c(4))', PB('14 CFR Part 23 commuter').commuter === true && PB('Part 23 non-commuter').key === 'part23' && PB('Part 23 non-commuter').commuter === false);
// ---- Appendix 1 6.8 flight phase factor per failure condition: FC-001 catastrophic only in climb and cruise:
// 6.8.1 shares 22% + 14% = 0.36; hazard ratio = angle x spread factor 0.25 x 0.36 / 360
const SFP = scenario(null, [{ pid: 't', name: 'FCC-1', path: ['A'], bbox: box(2999.5, 3000.5, -0.5, 0.5, 0, hz) }]);
const noWhy = SFP.M.setPhaseFactor('FC-001', ['Climb', 'Cruise'], '', 'W');
const setPF = SFP.M.setPhaseFactor('FC-001', ['Climb', 'Cruise'], 'Loss of this function is recoverable on the ground and in approach.', 'W');
const PF = SFP.M.sweep('r1', { models: ['oneThirdDisc'] }).models[0];
check('flight phase factor per failure condition (6.8): climb + cruise = 0.36 from the 6.8.1 table; ratio = angle x 0.25 x 0.36 / 360; no reason refused', !noWhy.ok && setPF.ok && setPF.value === 0.36 && Math.abs(PF.hazardRatio - PF.catastrophicDeg * 0.25 * 0.36 / 360) < 2e-6 && /FC-001 0\.36/.test(PF.phaseFactor.note), JSON.stringify([PF.catastrophicDeg, PF.hazardRatio, PF.phaseFactor]));
// ---- R9 fragment axial width: a 1 mm thick target in the plane, 3000 mm out (box 2999.5..3000.5, axial -0.5..+0.5), fragment axial width 100 mm:
// the elevation interval grows by atan(50 / 2999.5) = 0.95500 deg each side; its own half thickness is atan(0.5 / 2999.5) = 0.00955 deg;
// spread factor = (2 x 0.95500 + 2 x 0.00955) / 6 = 0.321517, capped at 1; ratio = full translational angle x factor / 360
FAWT = 100; const R9 = scenario(null, [{ pid: 't', name: 'FCC-1', path: ['A'], bbox: box(2999.5, 3000.5, -0.5, 0.5, -0.5, 0.5) }]).sw.models[0]; FAWT = 0;
const sf9 = (2 * Math.atan(50 / 2999.5) + 2 * Math.atan(0.5 / 2999.5)) * 180 / Math.PI / 6;
check('R9: 1 mm target in the plane, fragment 100 mm wide: spread factor (2 atan(50/2999.5) + thickness angle) / 6 = ' + sf9.toFixed(6) + '; axial width labeled engineer input', Math.abs(R9.spreadWeightedDeg / R9.catastrophicDeg - sf9) < 1e-5 && R9.fragmentAxialWidthMm.value === 100 && /not from the AC, engineer input/.test(R9.fragmentAxialWidthMm.note), JSON.stringify([R9.catastrophicDeg, R9.spreadWeightedDeg, R9.fragmentAxialWidthMm]));
// ---- R10 risk factor (6.9) with a reason: ratio scales by it
{ const X = scenario(null, [{ pid: 't', name: 'FCC-1', path: ['A'], bbox: box(2999.5, 3000.5, -0.5, 0.5, -200, 200) }]); const base = X.sw.models[0].hazardRatio;
  const no = X.M.setRiskFactor('r1', 0.5, '', 'W'), ok = X.M.setRiskFactor('r1', 0.5, 'Fire risk only: half of the cases are survivable per the zone analysis.', 'W'); const h = X.M.sweep('r1', { models: ['oneThirdDisc'] }).models[0];
  check('R10: risk factor 0.5 with a reason halves the ratio; refused without a reason; labeled 6.9 engineer input', !no.ok && ok.ok && Math.abs(h.hazardRatio - base * 0.5) < 2e-6 && /Appendix 1 6\.9/.test(h.riskFactor.note), JSON.stringify([base, h.hazardRatio])); }
// ---- R16 (the auditor's case): channels A and B (AND) at 0 and 180 deg, 800 mm out (inside the 1000 mm diameter), plus a harmless
// item XTRA collinear behind A at 5000 mm (outside). P must equal the two-channel value 0.13976: a far harmless item never cancels.
function scenario3(src, withX) {
    const leaf = (id, s2) => ({ id, type: 'basic', displayId: id, name: id, probability: 1e-5, identity: { kind: 'item', systemId: s2 } });
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {},
        systemsData: ['A', 'B', 'XTRA'].map(x => ({ id: x, name: x })), acFhaData: [{ internalId: 1, fcId: 'FC-001', fcDesc: 'x', severity: 'Catastrophic' }],
        ftaPages: [{ id: 'T1', name: 'x', linkedFhaIds: [1], root: { id: 'G1', type: 'gate', gateType: 'AND', displayId: 'FC-001', name: 'x', children: [leaf('B0', 'A'), leaf('B1', 'B')] } }] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
    ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb)); vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels, T = (id, ang, r) => { const x = r * Math.cos(ang * Math.PI / 180), y = r * Math.sin(ang * Math.PI / 180); return { pid: id, name: id, path: ['A'], bbox: box(x - 0.5, x + 0.5, y - 0.5, y + 0.5, -1000, 1000) }; };
    const parts = [{ pid: 'disc', name: 'HPT rotor disc', path: ['A'], bbox: box(-500, 500, -500, 500, -20, 20) }, T('a', 0, 800), T('b', 180, 800)].concat(withX ? [T('x', 0, 5000)] : []);
    const m = C.addCadModel({ fileName: 'c.step', sha256: 'c' + (withX ? 'x' : ''), revision: 'A', units: 'mm', parts }).model;
    C.confirmLink(m.id, 'a', 'A', 'W'); C.confirmLink(m.id, 'b', 'B', 'W'); if (withX) C.confirmLink(m.id, 'x', 'XTRA', 'W');
    M.confirmRotor({ id: 'r1', label: 'r', cadId: m.id, pid: 'disc', center: [0, 0, 0], axis: [0, 0, 1], refDir: [1, 0, 0], discRadius: 400, bladeLength: 100, bladedDiscMassKg: 30, rpm: 12000, fragmentAxialWidthMm: 0, confirms: { axialWidth: { by: 'W' } }, engine: 'E1', engineStages: 1 }, 'W', { at: 'x' });
    return M.multipleFragments('r1');
}
{ const P2 = scenario3(null, false), PX = scenario3(null, true);
  check('R16: a far harmless item (XTRA at 5000 mm) does not cancel the two-channel case: P = 0.13976 with and without it', Math.abs(P2.probability - 0.13976) < 1e-5 && Math.abs(PX.probability - P2.probability) < 1e-9, P2.probability + ' / ' + PX.probability); }
// ---- R11 averaging (Appendix 1 6.11 (d), (e)): engine E1 has 2 stages (a, b), engine E2 has 1 stage (c): average = ((a + b) / 2 + c) / 2;
// an engine without its stage count, or with unmodeled stages not confirmed harmless, is refused (no average)
{ FAWT = 0; ENGST = 2; const X = scenario(null, [{ pid: 't', name: 'FCC-1', path: ['A'], bbox: box(2999.5, 3000.5, -0.5, 0.5, -200, 200) }]), M = X.M, R1 = M.rotor('r1');
  M.confirmRotor(Object.assign({}, R1, { id: 'r2', label: 'r2', discRadius: 300 }), 'W', { at: 'x' });
  M.confirmRotor(Object.assign({}, R1, { id: 'r3', label: 'r3', discRadius: 200, engine: 'E2', engineStages: 1 }), 'W', { at: 'x' });
  const h = id => M.sweep(id, { models: ['oneThirdDisc'] }).models[0].hazardRatio, a = h('r1'), b = h('r2'), c = h('r3');
  const av = M.averageRisk({}).models[0], want3 = ((a + b) / 2 + c) / 2;
  M.confirmRotor(Object.assign({}, M.rotor('r3'), { engineStages: 3 }), 'W', { at: 'y' }); const refused = M.averageRisk({}).models[0];
  check('R11: airplane average = ((a + b)/2 + c)/2 with engine E1 2 stages and E2 1 stage; E2 with 3 stages of which 2 unmodeled and unconfirmed is refused', Math.abs(av.airplaneAverage - want3) < 2e-6 && av.engines.length === 2 && refused.airplaneAverage === null && refused.problems.some(x => /not modeled/.test(x)), JSON.stringify([a, b, c, av.airplaneAverage, want3, refused.problems])); }
// ---- labels (R2/R3/R5/R6): the Figure 3 chord reading beside the centroid energy: c.g. at (R + b/3)/2 = 216.667 mm,
// speed 1256.637 x 0.216667 = 272.271 m/s, energy 1/2 x 10 x 272.271^2 = 370,657 J (lower; the centroid 450,667 J is used)
{ const Ec = E.energyChordJ; check('9a energy: centroid reading used and labeled conservative; chord reading 370,657 J shown beside it', Ec && Math.abs(Ec.value - 0.5 * 10 * Math.pow(1256.6370614 * (400 + 100 / 3) / 2 / 1000, 2)) < 1 && /centroid is used as the conservative reading/.test(E.energyJ.note) && E.energyJ.value > Ec.value, JSON.stringify(Ec)); }
{ const Ei = S.M.fragmentEnergy(S.r, 'intermediate'); check('intermediate: rim speed (Figure 4) 1256.637 x 0.4 = 502.65 m/s, labeled', Math.abs(Ei.speedMs.value - 502.6548) < 0.001 && /rim speed/.test(Ei.speedMs.note) && Ei.speedMs.ref === 'ac20128a-fig4', JSON.stringify(Ei.speedMs)); }
{ const Rf = Object.assign({}, S.r, { fanBladeFragmentMassKg: 2 }), Ef = S.M.fragmentEnergy(Rf, 'fanBlade'); check('fan blade: Figure 5 (c.g. at the centerline of the 1/3 fragment, mass 1/3 of the airfoil mass) cited on speed and mass', /Figure 5/.test(Ef.speedMs.note) && Ef.massKg.ref === 'ac20128a-fig5' && /1\/3 of the airfoil mass/.test(Ef.massKg.note), JSON.stringify([Ef.speedMs, Ef.massKg])); }
{ const Ra = Object.assign({}, S.r, { kind: 'apu', stageRotationalEnergyJ: 1e6 }), Ea = S.M.fragmentEnergy(Ra, 'small'), Rb = Object.assign({}, S.r, { kind: 'apu' }), Eb = S.M.fragmentEnergy(Rb, 'small');
  check('APU small fragments (9d): 1 % of the stage rotational energy: 1,000,000 J -> 10,000 J; missing until the stage energy is entered', Ea.energyJ.value === 10000 && Ea.energyJ.ref === 'ac20128a-9d-apu' && Eb.energyJ.value === null, JSON.stringify([Ea.energyJ, Eb.energyJ.note])); }
const mut = (name, from, to, test) => { if (SRC.indexOf(from) < 0) { check('anchor present: ' + name, false); return; } let red = false; try { red = !test(scenario(SRC.replace(from, to), [{ pid: 't', name: 'FCC-1', path: ['A'], bbox: box(19999.999, 20000.001, -0.001, 0.001, -0.001, 0.001) }])); } catch (e) { red = true; } check('mutation goes red: ' + name, red); };
mut('full blade height in the sector', "var Rb = R + b / 3, rc = _sectorCentroid(Rb);", "var Rb = R + b, rc = _sectorCentroid(Rb);", s => near(s.sw.models[0].rCgMm.value, 238.909, 0.001));
{ const from = "widthMm: (fragmentAxialWidth(r).source === 'engineer' ? fragmentAxialWidth(r).value : 0) || 0,"; let red = false; if (SRC.indexOf(from) < 0) check('anchor present: axial width drawn', false); else { try { FAWT = 100; const X = scenario(SRC.replace(from, "widthMm: 0,"), []); red = X.M.spreadVolume('r1', 'oneThirdDisc', 30000).widthMm !== 100; } catch (e) { red = true; } FAWT = 0; check('mutation goes red: fragment axial width not drawn', red); } }
{ const from = "spreadFactor: sv > 0 ? catPsi / (2 * sv) : 0"; let red = false; if (SRC.indexOf(from) < 0) check('anchor present: spread factor', false); else { try { const X = scenario(SRC.replace(from, "spreadFactor: catPsi > 0 ? 1 : 0"), [{ pid: 't', name: 'FCC-1', path: ['A'], bbox: box(2999.5, 3000.5, -0.5, 0.5, 0, hz) }]).sw.models[0]; red = !(Math.abs(X.spreadWeightedDeg - X.catastrophicDeg * 0.25) < 1e-4); } catch (e) { red = true; } check('mutation goes red: spread factor all or nothing', red); } }
{ const from = "if (cat[key]) P += dist[keys[i]] * dist[keys[j]] * dist[keys[k2]]; }"; let red = false; if (SRC.indexOf(from) < 0) check('anchor present: three fragments', false); else { try { const X = scenario2(SRC.replace(from, "if (cat[key] && i === j && j === k2) P += dist[keys[i]]; }"), D9); red = !(Math.abs(X.mf.probability - Pm) / Pm < 1e-4); } catch (e) { red = true; } check('mutation goes red: one fragment instead of three independent ones', red); } }
{ const from = "var inW = eq.filter(within); cat[key] = inW.length ? ((C.impactOfEquipment(inW).worst || null) === 'Catastrophic') : false;"; let red = false; if (SRC.indexOf(from) < 0) check('anchor present: applicability', false); else { try { const X = scenario2(SRC.replace(from, "var inW = eq; cat[key] = eq.length ? ((C.impactOfEquipment(eq).worst || null) === 'Catastrophic') : false;")); red = !(X.mf.probability === 0); } catch (e) { red = true; } check('mutation goes red: applicability rule ignored', red); } }
{ const from = "if (p.tris) { var L = [];"; let red = false; if (SRC.indexOf(from) < 0) check('anchor present: triangles', false); else { try { const X = scenarioTri(SRC.replace(from, "if (false) { var L = [];")); red = !(Math.abs(X.models[0].catastrophicDeg - 2 * want) < 4e-4); } catch (e) { red = true; } check('mutation goes red: triangles ignored (hull used)', red); } }
{ const from = "(?![\\d-])/g"; let red = false; if (SRC.indexOf(from) < 0) check('anchor present: basis token', false); else { try { const X = scenario(SRC.replace(from, "/g"), []); red = X.M.parseBasis('Part 25 Amdt 25-129').key !== 'part25' || X.M.parseBasis('Part 25-129').key === 'part25'; } catch (e) { red = true; } check('mutation goes red: basis number not a whole token', red); } }
{ const from = "cat[key] = inW.length ? ((C.impactOfEquipment(inW).worst"; let red = false; if (SRC.indexOf(from) < 0) check('anchor present: R16', false); else { try { const X = scenario3(SRC.replace("if (!(key in cat)) { var inW = eq.filter(within);", "if (!(key in cat)) { var inW = eq.every(within) ? eq : [];"), true); red = !(Math.abs(X.probability - 0.13976) < 1e-5); } catch (e) { red = true; } check('mutation goes red: a far harmless item cancels the combination', red); } }
mut('sampled angles instead of exact intervals', "var catDeg = _r6(EX.filter(function (a) { return a.worst === 'Catastrophic'; }).reduce(function (s2, a) { return s2 + a.width; }, 0));", "var catDeg = angles.filter(function (a) { return a.worst === 'Catastrophic'; }).length * step;", s => s.sw.models[1].catastrophicDeg > 0.1);
mut('strip edge events dropped', "[rCg - hw, rCg + hw].forEach(function (c) { var x = c / rq;", "[].forEach(function (c) { var x = c / rq;", s => near(s.sw.models[1].catastrophicDeg, want, 2e-4));
// ---- D2 (third audit, auditor faw.js): the fragment axial width is a Step 1 confirmed field; the CAD proposal (40 mm
// along the axis for this disc box) only pre-fills the input; while it is missing or unconfirmed meets, averages and the
// multiple-fragment risk are refused
function d2(src) { const T = [{ pid: 't', name: 'cable', path: ['A'], bbox: box(2999.5, 3000.5, -0.5, 0.5, -0.5, 0.5) }]; const X = scenario(src, T), M = X.M, r0 = M.rotor('r1');
  const out = {}; M.confirmRotor(Object.assign({}, r0, { fragmentAxialWidthMm: null, confirms: Object.assign({}, r0.confirms, { axialWidth: undefined }) }), 'W', { at: 'x' });
  let s1 = M.sweep('r1', { models: ['oneThirdDisc'] }).models[0]; out.miss = { meets: s1.meets, src: s1.fragmentAxialWidthMm.source, note: s1.fragmentAxialWidthMm.note, refused: s1.refusedNote, mf: M.multipleFragments('r1').ok, av: M.averageRisk({}).models[0].airplaneAverage, prop: M.fawProposal(M.rotor('r1')).value };
  M.confirmRotor(Object.assign({}, M.rotor('r1'), { fragmentAxialWidthMm: 100 }), 'W', { at: 'x' }); s1 = M.sweep('r1', { models: ['oneThirdDisc'] }).models[0]; out.unc = { meets: s1.meets, src: s1.fragmentAxialWidthMm.source, mf: M.multipleFragments('r1').ok };
  out.noName = M.confirmRotorField('r1', 'axialWidth', '').ok; M.confirmRotorField('r1', 'axialWidth', 'W. Engineer', true);
  s1 = M.sweep('r1', { models: ['oneThirdDisc'] }).models[0]; out.ok = { meets: s1.meets, src: s1.fragmentAxialWidthMm.source, v: s1.fragmentAxialWidthMm.value, mf: M.multipleFragments('r1').ok }; return out; }
{ const D = d2();
  check('D2: width missing: CAD proposal 40 mm only pre-fills (not used); meets, multiple fragments and the average refused', D.miss.prop === 40 && D.miss.src === 'missing' && /pre-fills the Step 1 input only/.test(D.miss.note) && D.miss.meets === null && /fragment axial width/.test(D.miss.refused) && D.miss.mf === false && D.miss.av === null, JSON.stringify(D.miss));
  check('D2: entered but unconfirmed: still refused; confirmation needs a name; confirmed: assessed with 100 mm', D.unc.meets === null && D.unc.src === 'unconfirmed' && D.unc.mf === false && D.noName === false && typeof D.ok.meets === 'boolean' && D.ok.src === 'engineer' && D.ok.v === 100 && D.ok.mf === true, JSON.stringify([D.unc, D.noName, D.ok])); }
mut('D2: unconfirmed width accepted', "fawOk = FAW.source === 'engineer';", "fawOk = true;", s => true && (() => { const D = d2(SRC.replace("fawOk = FAW.source === 'engineer';", "fawOk = true;")); return D.miss.meets === null && D.unc.meets === null; })());
// ---- D6 (auditor apu.js): APU disc 5 kg, tip radius 150 + 30 = 180 mm, 40000 rpm: w = 4188.79 rad/s; uniform disc E = 1/4 m R^2 w^2
// = 0.25 x 5 x 0.0324 x 17546107 = 710611.52 J. Entered 500000 J: ratio 0.70362, no warning; entered 100000 J: ratio 0.14072, warned.
function apu(src, E) { const X = scenario(src, []), M = X.M; M.confirmRotor({ id: 'ra', label: 'APU', cadId: M.rotor('r1').cadId, pid: 'disc', kind: 'apu', center: [0, 0, 0], axis: [0, 0, 1], refDir: [1, 0, 0], discRadius: 150, bladeLength: 30, bladedDiscMassKg: 5, rpm: 40000, stageRotationalEnergyJ: E }, 'W', { at: 'x' }); return M.fragmentEnergy(M.rotor('ra'), 'small').stageEnergyCheck; }
{ const a = apu(null, 500000), b = apu(null, 100000);
  check('D6: APU stage energy shown beside the uniform disc sanity bound 710611.52 J (labeled not from the AC); warned only beyond 2x', Math.abs(a.estimateJ.value - 710611.516878) < 1e-3 && /sanity bound, not from the AC/.test(a.estimateJ.note) && Math.abs(a.ratio - 0.703619) < 1e-5 && a.warning === null && /more than 2x/.test(b.warning), JSON.stringify([a, b.warning])); }
{ const fb = scenario(null, []).M.FRAGMENT_MODELS.fanBlade, g = fb.geom(400, 300);
  check('D6: fan blade c.g. and mass per Figure 5 (quoted ref, no "not legible" note): c.g. at R + 5b/6 = 650 mm', g.rCg.value === 650 && g.rCg.ref === 'ac20128a-fig5' && !/not legible/.test(g.rCg.note) && fb.massFraction.ref === 'ac20128a-fig5', JSON.stringify([g.rCg, fb.massFraction])); }
mut('D6: sanity bound with 1/2 instead of 1/4', "eU = 0.25 * r.bladedDiscMassKg * Rt * Rt * omega * omega;", "eU = 0.5 * r.bladedDiscMassKg * Rt * Rt * omega * omega;", s => true && Math.abs(apu(SRC.replace("eU = 0.25 * r.bladedDiscMassKg * Rt * Rt * omega * omega;", "eU = 0.5 * r.bladedDiscMassKg * Rt * Rt * omega * omega;"), 500000).estimateJ.value - 710611.516878) < 1e-3);
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);

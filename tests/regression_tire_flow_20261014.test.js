#!/usr/bin/env node
/*
 * Regression: tire burst as a guided flow (site/pra_models.js), 14 Oct 2026.
 *   A  Step 1: location, size (DG, WSG), pressure and speed rating each need a named tick
 *   B  Step 2 cases: AMC 25.734 Models 1 large, 1 small, 3 on; Models 2 and 4 opt in
 *   C  one report per model, cited, with parts, equipment and conditions; unverified models say so
 *   D  mutation: step 2 unlocked early is caught
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('pra_models.js');
const box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
const leaf = (id, s) => ({ id, type: 'basic', displayId: id, name: id, probability: 1e-5, identity: { kind: 'item', systemId: s } });
function scenario(src) {
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, setTimeout: () => 0, scheduleAutosave: () => {},
        projectConfig: {}, systemsData: [{ id: 'HYDL', name: 'Left hydraulic line', fha: [{ internalId: 5, fcId: 'HYD-FC', fcDesc: 'Loss of left hydraulics', severity: 'Major' }] }], acFhaData: [],
        ftaPages: [{ id: 'T2', name: 'Loss of left hydraulics', linkedFhaIds: ['SYS_5'], root: { id: 'G9', type: 'gate', gateType: 'OR', displayId: 'HYD-FC', name: 'x', children: [leaf('BE9', 'HYDL')] } }] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
    ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb));
    vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels, R = {};
    const m = C.addCadModel({ fileName: 't.step', sha256: 't', revision: 'A', units: 'mm', parts: [
        { pid: 'tire', name: 'Main gear tire L', path: ['A'], bbox: box(11000, 12200, -2200, -1800, -2400, -1200) },
        { pid: 'hyd', name: 'Hydraulic line', path: ['A'], bbox: box(11300, 11900, -2100, -1900, -1100, -1000) }] }).model;
    C.confirmLink(m.id, 'hyd', 'HYDL', 'W. Engineer');
    M.confirmTire({ id: 'tL', label: 'Main gear left', cadId: m.id, pid: 'tire', center: [11600, -2000, -1800], axis: [0, 1, 0], grownDiameter: 1200, sectionWidth: 400, massKg: 100, speedRatingMs: 104, ratedPressureKpa: 1365 }, 'W. Engineer', { at: '2026-10-14T00:00:00Z' });
    R.locked = M.tireReport('tL', 'm1Large');
    R.noName = M.confirmField('tire', 'tL', 'size', '');
    ['location', 'size', 'pressure'].forEach(f => M.confirmField('tire', 'tL', f, 'W. Engineer', true, { at: '2026-10-14T00:01:00Z' }));
    R.s3 = M.stepStatus('tire', 'tL');
    M.confirmField('tire', 'tL', 'speed', 'W. Engineer', true, { at: '2026-10-14T00:02:00Z' });
    R.s4 = M.stepStatus('tire', 'tL');
    R.reps = {}; ['m1Large', 'm1Small', 'm2Flange', 'm3Strip'].forEach(k => { R.reps[k] = M.tireReport('tL', k); });
    R.m4ext = M.tireReport('tL', 'extended|m4Burst');
    R.gearBad = M.setTireGear('tL', ['extended', 'retracted'], '');
    M.setTireGear('tL', ['extended', 'retracted'], 'W. Engineer');
    R.cases = M.tireCases('tL').map(c => c.key + (c.isDefault ? '*' : ''));
    R.noStow = M.tireReport('tL', 'retracted|m3Strip');   // refused until the stowed position is given and confirmed
    R.volNoStow = M.tireVolume('tL', 'm3Strip', 9000, 'retracted');
    R.stowNoName = M.setTireStowed('tL', { center: [11600, -2000, -600], axis: [0, 1, 0] }, '');
    M.setTireStowed('tL', { center: [11600, -2000, -600], axis: [0, 1, 0] }, 'W. Engineer', { at: '2026-10-14T00:03:00Z' });
    R.reps.m4Burst = M.tireReport('tL', 'retracted|m4Burst'); R.m3R = M.tireReport('tL', 'retracted|m3Strip');
    R.volStow = M.tireVolume('tL', 'm3Strip', 9000, 'retracted'); R.volExt = M.tireVolume('tL', 'm3Strip', 9000, 'extended');
    R.volStowBack = R.volStow ? M.readBackSpread(M.spreadMeshPoints(R.volStow).positions, R.volStow) : null;
    R.vols360 = M.tireVolume('tL', 'm1Large', 9000);
    R.limNoWhy = M.setTireArcLimit('tL', { fromDeg: -90, toDeg: 90, justification: '' }, 'W. Engineer');
    R.limOk = M.setTireArcLimit('tL', { fromDeg: -90, toDeg: 90, justification: 'Ground below the tire on the extended gear; only the upper half faces the aircraft.' }, 'W. Engineer', { at: '2026-10-14T00:05:00Z' });
    R.limRep = M.tireReport('tL', 'm1Large'); R.limVol = M.tireVolume('tL', 'm1Large', 9000);
    M.setTireArcLimit('tL', null, 'W. Engineer');
    R.vols = {}; ['m1Large', 'm1Small', 'm2Flange', 'm3Strip'].forEach(k => { const sp = M.tireVolume('tL', k, 9000); R.vols[k] = sp ? { sp, back: M.readBackSpread(M.spreadMeshPoints(sp).positions, sp) } : null; });
    return { M, R };
}
const { M, R } = scenario();
check('A: a report refuses before Step 1; ticking needs a name', !R.locked.ok && R.locked.missing.length === 4 && !R.noName.ok);
check('A: three ticks: locked (speed missing); four: open', !R.s3.unlocked && R.s3.missing.join() === 'speed' && R.s4.unlocked);
check('B: cases by gear position (AMC 25.734 3.1): extended 1 large*, 1 small*, 2, 3E*; retracted 3R*, 4* (* default)', R.cases.join() === 'extended|m1Large*,extended|m1Small*,extended|m2Flange,extended|m3Strip*,retracted|m3Strip*,retracted|m4Burst*' && R.reps.m2Flange.optional && !R.reps.m1Large.optional && !R.gearBad.ok, R.cases.join());
check('E: retracted 3R drawn about the stowed tire center and axle (as tested), nothing drawn before it is confirmed; extended about the wheel center; same half angle 30 deg read back', R.volNoStow === null && R.volStow.origin.join() === '11600,-2000,-600' && R.volStow.axis.join() === '0,1,0' && R.volExt.origin.join() === '11600,-2000,-1800' && Math.abs(R.volStowBack.halfAngleDeg - 30) < 1e-6, JSON.stringify([R.volStow && R.volStow.origin, R.volExt && R.volExt.origin, R.volStowBack]));
check('B: retracted cases refused until the stowed tire center and axle are entered and confirmed by name (Models 3R and 4)', !R.noStow.ok && /stowed tire center and axle/.test(R.noStow.err) && !R.stowNoName.ok);
check('B: Model 4 does not apply with the gear extended; Model 3 retracted is its own case', !R.m4ext.ok && R.m3R.ok && /3R, retracted/.test(R.m3R.label));
const L = R.reps.m1Large;
check('C: Model 1 large: 15 degrees cited to AMC 25.734 Model 1, the hydraulic line hit, Major', L.ok && L.theta.value === 15 && L.theta.ref === 'amc25-734-m1' && L.partsHit.indexOf('hyd') >= 0 && L.worst === 'Major', JSON.stringify(L).slice(0, 300));
check('C: each report quotes CS 25.734 and its model paragraph', L.refs.some(r => r.section === 'CS 25.734') && L.refs.some(r => r.section === 'AMC 25.734 Model 1'));
check('C: Model 2 (zone only in a figure) says it is not computed, unverified', R.reps.m2Flange.ok && R.reps.m2Flange.incomplete && /unverified/.test(R.reps.m2Flange.note));
{ // Model 2 with an engineer half angle: refused until the outboard direction is confirmed; then a cone about it, drawn = tested
  const T0 = M.tire('tL'); M.confirmTire(Object.assign({}, T0, { flangeHalfAngleDeg: 20 }), 'W. Engineer', { at: '2026-10-14T00:04:00Z' }); ['location', 'size', 'pressure', 'speed'].forEach(f => M.confirmField('tire', 'tL', f, 'W. Engineer', true));
  const noOut = M.tireReport('tL', 'm2Flange'); const okOut = M.setTireOutboard('tL', [0, -1, 0], 'W. Engineer'); const noWpl = M.tireReport('tL', 'm2Flange'); const wNo = M.setTireWheelsPerLeg('tL', 2, ''); M.setTireWheelsPerLeg('tL', 2, 'W. Engineer'); M.setTireFlangeRadius('tL', 450, 'W. Engineer'); const withOut = M.tireReport('tL', 'm2Flange'); const cone = M.tireConeMesh('tL');
  // cone: apex at the tire center, half angle 20 deg about (0,-1,0): every rim point makes acos(rim . axis / |rim|) = 20 deg with the axis
  const ap = cone.apex, rim = [cone.positions[3] - ap[0], cone.positions[4] - ap[1], cone.positions[5] - ap[2]], ang = Math.acos(-rim[1] / Math.hypot(...rim)) * 180 / Math.PI;
  check('C: Model 2 refused until the outboard direction is confirmed; then computed; drawn as a cone of the same 20 deg about that direction', noOut.incomplete && /outboard direction/.test(noOut.note) && okOut.ok && noWpl.incomplete && /wheels on this landing gear leg/.test(noWpl.note) && !wNo.ok && !withOut.incomplete && Math.abs(ang - 20) < 1e-6 && Math.abs(Math.hypot(...rim) - M.tireReach('tL').value) < 1e-6, JSON.stringify([noOut.note, ang])); }
check('C: Model 4 on an unbraked wheel says it does not apply', R.reps.m4Burst.ok && R.reps.m4Burst.applies === false);
check('C: small debris energy from 1 per cent of the tire mass at the speed rating', Math.abs(R.reps.m1Small.params.energyJ.value - 0.5 * 1 * 104 * 104) < 1e-6);
check('E: drawn tire zones equal the cited angles (15, 30, 30) read back from the vertices; Model 3 drawn out to DG/2 + 2.5 WSG or to the airframe if nearer (clipped per direction); drawn from the tire center (T10)', Math.abs(R.vols.m1Large.back.halfAngleDeg - 15) < 1e-6 && Math.abs(R.vols.m1Small.back.halfAngleDeg - 30) < 1e-6 && Math.abs(R.vols.m3Strip.back.outerRadius - Math.min(1600, Math.max(...R.vols.m3Strip.sp.outerRadii))) < 1e-6 && Math.max(...R.vols.m3Strip.sp.outerRadii) <= 1600 + 1e-9 && R.vols.m1Large.back.innerRadius === 0, JSON.stringify([R.vols.m1Large.back, R.vols.m3Strip.back]));
check('E: Model 2 has no drawn zone until the engineer enters it (the AMC gives it only as a figure)', R.vols.m2Flange === null);
check('E: by default the zone goes all the way round the axle (the AMC sets no direction)', R.vols360.arcDeg === 360 && R.vols.m1Large.sp.arcDeg === 360);
check('E: an arc limit needs a written justification and a name; the report shows it as an engineer limitation and the drawn arc follows it', !R.limNoWhy.ok && R.limOk.ok && /^engineer limitation: directions -90 to 90 degrees/.test(R.limRep.limitation) && /Ground below the tire/.test(R.limRep.limitation) && R.limVol.arcDeg === 180 && R.limVol.arcStartDeg === -90);
const RPT = read('pra_report.js');
check('E: shared report module: no eval, no em dash, exports page / collectParts / volume', !/\beval\s*\(|new Function/.test(RPT) && RPT.indexOf(String.fromCharCode(0x2014)) < 0 && /page: page/.test(RPT) && /collectParts: collectParts/.test(RPT));
const mut = (name, from, to, test) => { if (SRC.indexOf(from) < 0) { check('D: anchor present: ' + name, false); return; } let red = false; try { red = !test(scenario(SRC.replace(from, to)).R); } catch (e) { red = true; } check('D: mutation goes red: ' + name, red); };
mut('tire zone angle drawn doubled', 'var pos = [], idx = [], t = Math.tan(sp.halfAngleDeg * D2R)', 'var pos = [], idx = [], t = Math.tan(2 * sp.halfAngleDeg * D2R)', r => Math.abs(r.vols.m1Large.back.halfAngleDeg - 15) < 1e-6);
mut('tire Step 2 unlocked with one tick missing', "var c = r.confirms || {}, missing = F.filter(function (f) { return !c[f]; });\n        return { ok: true, unlocked: missing.length === 0,", "var c = r.confirms || {}, missing = F.filter(function (f) { return !c[f]; });\n        return { ok: true, unlocked: missing.length <= 1,", r => !r.s3.unlocked);
check('D: no em dash', SRC.indexOf(String.fromCharCode(0x2014)) < 0);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

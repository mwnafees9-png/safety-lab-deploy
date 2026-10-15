#!/usr/bin/env node
/*
 * Regression: rotor burst as a guided three-step flow with one report per fragment type
 * (site/pra_models.js), 14 Oct 2026.
 *   A  Step 1: location, disc diameter, disc mass, redline speed each need a named tick; Step 2
 *      stays locked until all four are ticked; a report refuses before that
 *   B  energy at redline per type: one-third disc mass/3 at the 120 degree sector centroid,
 *      intermediate 1/30 at the rim (AC 9b), small fragments only from an engineer entry
 *      labeled not from the AC; shield capacity compared
 *   C  default types 9a, 9b, 9d on; 9c, 9e optional
 *   D  the drawn volume matches the calculation: half angle, origin, radii read back from the
 *      vertices for every type; a broken half angle is caught
 *   E  reports per type: parts, equipment, conditions, ranges, limit check, citations
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('pra_models.js');
const box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
const part = (pid, name, b) => ({ pid, name, partNumber: null, path: ['A', name], bbox: b });
const leaf = (id, s) => ({ id, type: 'basic', displayId: id, name: id, probability: 1e-5, identity: { kind: 'item', systemId: s } });
function load(src) {
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, setTimeout: () => 0, scheduleAutosave: () => {},
        projectConfig: {}, systemsData: [{ id: 'FCC1', name: 'FCC 1' }, { id: 'FCC2', name: 'FCC 2' }], acFhaData: [{ internalId: 1, fcId: 'FC-001', fcDesc: 'Loss of pitch control', severity: 'Catastrophic' }],
        ftaPages: [{ id: 'T1', name: 'Loss of pitch', linkedFhaIds: [1], root: { id: 'G1', type: 'gate', gateType: 'AND', displayId: 'FC-001', name: 'Loss of pitch', children: [leaf('B1', 'FCC1'), leaf('B2', 'FCC2')] } }] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
    ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb));
    vm.runInContext(src || SRC, sb);
    return sb;
}
function scenario(src) {
    const sb = load(src), C = sb.SLCadZonal, M = sb.SLPraModels, R = {};
    const m = C.addCadModel({ fileName: 'f.step', sha256: 'x', revision: 'A', units: 'mm', parts: [
        part('disc', 'ENG1 HPT rotor disc', box(9800, 9900, -4500, -3500, -500, 500)), part('fcc1', 'FCC-1', box(9700, 10000, -600, -300, -100, 100)), part('fcc2', 'FCC-2', box(9700, 10000, 300, 600, -100, 100))] }).model;
    C.confirmLink(m.id, 'fcc1', 'FCC1', 'W. Engineer'); C.confirmLink(m.id, 'fcc2', 'FCC2', 'W. Engineer');
    M.confirmRotor({ id: 'r1', label: 'Engine 1 HPT', cadId: m.id, pid: 'disc', center: [9850, -4000, 0], axis: [1, 0, 0], refDir: [0, 0, 1], discRadius: 400, bladeLength: 100, bladedDiscMassKg: 30, rpm: 12000, shieldCapacityJ: 200000, fragmentAxialWidthMm: 0 }, 'W. Engineer', { at: '2026-10-14T00:00:00Z' });
    R.lockedReport = M.rotorReport('r1', 'oneThirdDisc');
    R.st0 = M.step1Status('r1');
    R.noName = M.confirmRotorField('r1', 'mass', '');
    ['location', 'diameter', 'mass'].forEach(f => M.confirmRotorField('r1', f, 'W. Engineer', true, { at: '2026-10-14T00:01:00Z' }));
    R.st3 = M.step1Status('r1');
    M.confirmRotorField('r1', 'rpm', 'W. Engineer', true, { at: '2026-10-14T00:02:00Z' }); M.confirmRotorField('r1', 'axialWidth', 'W. Engineer', true, { at: '2026-10-14T00:02:00Z' });
    R.st4 = M.step1Status('r1');
    R.reports = {}; ['oneThirdDisc', 'intermediate', 'small', 'alternate'].forEach(k => { R.reports[k] = M.rotorReport('r1', k, { reach: 8000 }); });
    R.fan0 = M.rotorReport('r1', 'fanBlade', { reach: 8000 });
    M.confirmRotor(Object.assign({}, M.rotor('r1'), { fanBladeFragmentMassKg: 2 }), 'W. Engineer', { at: '2026-10-14T00:03:00Z' });
    R.fan1 = M.rotorReport('r1', 'fanBlade', { reach: 8000 });
    R.vols = {}; ['oneThirdDisc', 'intermediate', 'small', 'alternate'].forEach(k => { const sp = M.spreadVolume('r1', k, 8000); R.vols[k] = { sp, back: M.readBackSpread(M.spreadMeshPoints(sp).positions, sp) }; });
    return { sb, M, R };
}
const { M, R } = scenario();
console.log('\n[A] step 1');
check('A: a report refuses before step 1 is complete', !R.lockedReport.ok && R.lockedReport.missing.length === 4);
check('A: ticking needs a name', !R.noName.ok);
check('A: three of four ticks: still locked (rpm missing); four: unlocked', !R.st3.unlocked && R.st3.missing.join() === 'rpm' && R.st4.unlocked);
console.log('\n[B] energy at redline');
const w = 12000 * 2 * Math.PI / 60, e3 = R.reports.oneThirdDisc.energy, ei = R.reports.intermediate.energy, es = R.reports.small.energy;
const rc = 2 * (400 + 100 / 3) * Math.sin(Math.PI / 3) / (3 * Math.PI / 3);   // para 9a: the sector of the disc with one-third blade height, R + b/3
check('B: one-third disc: 10 kg (30/3) at the centroid of the 120 degree sector of radius R + b/3', Math.abs(e3.massKg.value - 10) < 1e-6 && Math.abs(e3.rCgMm.value - rc) < 1e-5 && Math.abs(e3.energyJ.value / (0.5 * 10 * Math.pow(w * rc / 1000, 2)) - 1) < 1e-6, JSON.stringify(e3));
check('B: intermediate: 1/30 of the disc mass at the rim (AC 9b)', Math.abs(ei.massKg.value - 1) < 1e-6 && ei.rCgMm.value === 400 && Math.abs(ei.energyJ.value / (0.5 * Math.pow(w * 0.4, 2)) - 1) < 1e-6);
check('B: small fragments: no AC mass, so missing and labeled engineer input', es.massKg.value === null && /not from the AC/.test(es.massKg.note) && es.energyJ.value === null);
check('B: shield capacity compared with the energy', e3.shield && e3.shield.holds === false && ei.shield.holds === true);
console.log('\n[C] types');
check('C: default 9a, 9b, 9d; alternative and fan blade optional', M.DEFAULT_TYPES.join() === 'oneThirdDisc,intermediate,small' && R.reports.alternate.optional === true);
check('C: fan blade (9e) runs when asked for, cited spread 15 degrees, optional', R.fan0.ok && R.fan0.spreadDeg.value === 15 && R.fan0.spreadDeg.ref === 'ac20128a-9e' && R.fan0.optional === true, JSON.stringify(R.fan0).slice(0, 200));
check('C: fan blade mass not in the AC: missing until entered, then labeled not from the AC, engineer input', R.fan0.energy.massKg.value === null && /not from the AC/.test(R.fan0.energy.massKg.note) && R.fan1.energy.massKg.value === 2 && /not from the AC, engineer input/.test(R.fan1.energy.massKg.note) && R.fan1.energy.energyJ.value > 0);
console.log('\n[D] drawing matches calculation');
// drawn inner radius = where a path can first reach: max(0, c.g. radius - path half-width), R = 400, b = 100:
// one-third disc and alternate: 238.909 - 375.94 < 0 -> 0; intermediate: 400 - (500/3)/2 = 316.667; small: 475 - 25 = 450
const INNER = { oneThirdDisc: 0, alternate: 0, intermediate: 400 - 500 / 6, small: 450 };
['oneThirdDisc', 'intermediate', 'small', 'alternate'].forEach(k => { const v = R.vols[k];
    check('D: ' + k + ': drawn half angle, inner radius (max(0, rc - hw)) and outer radius equal the engine', Math.abs(v.back.halfAngleDeg - R.reports[k].spreadDeg.value) < 1e-6 && Math.abs(v.back.innerRadius - INNER[k]) < 1e-5 && Math.abs(v.back.outerRadius - 8000) < 1e-6, JSON.stringify(v.back)); });
check('D: the volume sits on the rotor center and axis', R.vols.small.sp.origin.join() === '9850,-4000,0' && R.vols.small.sp.axis.join() === '1,0,0');
console.log('\n[E] reports');
const r3 = R.reports.oneThirdDisc;
check('E: one-third disc report: both computers hit, Catastrophic, ranges, 1 in 20 check', r3.ok && r3.equipment.join() === 'FCC1,FCC2' && r3.worst === 'Catastrophic' && r3.ranges.some(x => x.severity === 'Catastrophic') && r3.criterion.text === '1 in 20' && typeof r3.meets === 'boolean');
check('E: intermediate report checks 1 in 40; small fragments carry no numerical limit', R.reports.intermediate.criterion.text === '1 in 40' && R.reports.small.criterion === null);
check('E: citations to the AC paragraphs', r3.refs.some(x => x.section === 'para 9a') && r3.refs.some(x => /10c\(3\)\(i\)/.test(x.section)));
console.log('\n[F] the AI gate');
{
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, setTimeout: () => 0, document: { addEventListener() {} }, projectConfig: {} };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
    vm.runInContext(read('zonal_ai.js'), sb);
    const Z = sb.SLZonalAI, lane = Object.keys(Z.SOURCE_MAP)[0];
    check('F: SLZonalAI.ENABLED is false by default and buttonHtml draws nothing', Z.ENABLED === false && Z.buttonHtml(lane, {}) === '');
    Z.ENABLED = true;
    check('F: with the gate on the AI button appears', /data-zai-lane=/.test(Z.buttonHtml(lane, {})));
    const P = read('pra_panel.js'), U = read('zonal_ui.js');
    check('F: the rotor suggest button uses the same gate (no separate flag); zonal UI and the panel draw AI buttons only through buttonHtml', /SLZonalAI\.ENABLED === true/.test(P) && !/ROTOR_SUGGEST_ENABLED/.test(P) && !/data-zai-lane/.test(P) && !/data-zai-lane/.test(U));
}
console.log('\n[M] mutations');
const mut = (name, from, to, test) => { if (SRC.indexOf(from) < 0) { check('M: anchor present: ' + name, false); return; } let red = false; try { red = !test(scenario(SRC.replace(from, to)).R); } catch (e) { red = true; } check('M: mutation goes red: ' + name, red); };
mut('drawn half angle doubled', 'var pos = [], idx = [], t = Math.tan(sp.halfAngleDeg * D2R)', 'var pos = [], idx = [], t = Math.tan(2 * sp.halfAngleDeg * D2R)', r => ['oneThirdDisc', 'small'].every(k => Math.abs(r.vols[k].back.halfAngleDeg - r.reports[k].spreadDeg.value) < 1e-6));
mut('step 2 unlocked without the speed tick', 'unlocked: missing.length === 0', 'unlocked: missing.length <= 1', r => !r.st3.unlocked);
mut('energy at blade tip instead of c.g.', "P(_r6(omega * g.rCg.value / 1000)", "P(_r6(omega * (r.discRadius + (r.bladeLength || 0)) / 1000)", r => Math.abs(r.reports.oneThirdDisc.energy.energyJ.value / (0.5 * 10 * Math.pow(w * rc / 1000, 2)) - 1) < 1e-6);
check('M: no eval, no em dash', !/\beval\s*\(|new Function/.test(SRC) && SRC.indexOf(String.fromCharCode(0x2014)) < 0);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

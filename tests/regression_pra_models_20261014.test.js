#!/usr/bin/env node
/*
 * Regression: particular risk models (site/pra_models.js, SLPraModels), 14 Oct 2026 (p3-pra).
 * Fixture aircraft: two wing engines (rotor discs) beside a fuselage holding two redundant flight
 * computers; an AND gate over the two computers reaches a Catastrophic condition.
 *   A  cited parameters: AC 20-128A spreads 3 / 5 / 15 / 15, mass fractions, criteria 1 in 20 / 40
 *   B  rotor proposal from CAD, nothing written; confirmation needs a name
 *   C  sweep: the release angles whose path crosses both computers are Catastrophic, ranges and
 *      hazard ratio; a credited shield stops the path; energy only with a shield
 *   D  bird strike cases by basis with the rule cited; missing speed says missing
 *   E  determinism and mutations
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const REFSRC = read('pra_refs_data.js'), SRC = read('pra_models.js'), CZ = read('cad_zonal.js'), ZM = read('zonal_model.js'), FE = read('fta_engine.js');
const box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
const part = (pid, name, b, extra) => Object.assign({ pid, name, partNumber: null, path: ['Aircraft', name], bbox: b }, extra || {});
// x forward is negative (nose at x = 0, tail at x = 20000); y to the right wing; z up.
function cad() { return { fileName: 'fx.step', sha256: 'f1', revision: 'A', units: 'mm', parts: [
    part('p-eng1-disc', 'ENG1 HPT rotor disc', box(9800, 9900, -4500, -3500, -500, 500)),     // left engine disc, axis x
    part('p-eng2-disc', 'ENG2 HPT rotor disc', box(9800, 9900, 3500, 4500, -500, 500)),       // right engine disc
    part('p-fcc1', 'FCC-1', box(9700, 10000, -600, -300, -100, 100), { designator: 'FCC-1' }),
    part('p-fcc2', 'FCC-2', box(9700, 10000, 300, 600, -100, 100), { designator: 'FCC-2' }),
    part('p-shield', 'Rotor shield plate', box(9600, 10100, -2000, -1900, -800, 800)),
    part('p-nose', 'Nose radome', box(0, 1500, -1000, 1000, -1000, 1000)),
    part('p-tail', 'Fin tip', box(19000, 20000, -100, 100, 3000, 5000)),
    part('p-ws', 'Windshield', box(1500, 1700, -600, 600, 1000, 1500)),
    part('p-tire-l', 'Main gear tire L', box(11000, 12200, -2200, -1800, -2400, -1200)),
    part('p-hydline', 'Hydraulic line', box(11300, 11900, -2100, -1900, -1100, -1000), { designator: 'HYD-L' }),
    part('p-wtip', 'Wing tip', box(10500, 11500, -8000, -7800, -50, 50))
] }; }
const leaf = (id, sysId) => ({ id, type: 'basic', displayId: id, name: id, probability: 1e-5, identity: { kind: 'item', systemId: sysId } });
function load(src) {
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, setTimeout: () => 0, scheduleAutosave: () => {},
        projectConfig: {}, systemsData: [{ id: 'FCC1', name: 'Flight control computer 1', designator: 'FCC-1', functions: [{ funcId: 'F-PITCH', funcName: 'Pitch control' }] }, { id: 'FCC2', name: 'Flight control computer 2', designator: 'FCC-2', functions: [{ funcId: 'F-PITCH', funcName: 'Pitch control' }] }, { id: 'HYDL', name: 'Left hydraulic line', designator: 'HYD-L', functions: [{ funcId: 'F-BRAKE', funcName: 'Wheel braking' }], fha: [{ internalId: 5, fcId: 'HYD-FC', fcDesc: 'Loss of left hydraulics', severity: 'Major' }] }],
        acFhaData: [{ internalId: 1, fcId: 'FC-001', fcDesc: 'Loss of pitch control', severity: 'Catastrophic' }],
        ftaPages: [{ id: 'T2', name: 'Loss of left hydraulics', linkedFhaIds: ['SYS_5'], root: { id: 'G9', type: 'gate', gateType: 'OR', displayId: 'HYD-FC', name: 'Loss of left hydraulics', children: [leaf('BE9', 'HYDL')] } }, { id: 'T1', name: 'Loss of pitch control', linkedFhaIds: [1], root: { id: 'G1', type: 'gate', gateType: 'AND', displayId: 'FC-001', name: 'Loss of pitch control', children: [leaf('BE1', 'FCC1'), leaf('BE2', 'FCC2')] } }] };
    sb.window = sb; sb.globalThis = sb; sb.self = sb; vm.createContext(sb);
    vm.runInContext(ZM, sb); vm.runInContext(FE, sb); vm.runInContext(CZ, sb); vm.runInContext(REFSRC, sb); vm.runInContext(src || SRC, sb);
    return sb;
}
function scenario(src) {
    const sb = load(src), C = sb.SLCadZonal, M = sb.SLPraModels;
    const m = C.addCadModel(cad()).model;
    C.applyExactLinks(m.id, 'exact identifier match', { at: '2026-10-14T00:00:00Z' });
    const R = { cadId: m.id };
    R.proposals = M.proposeRotors(m.id);
    R.noName = M.confirmRotor(Object.assign({}, R.proposals[0], { discRadius: 400, bladeLength: 100 }), '');
    const p1 = R.proposals.find(p => p.pid === 'p-eng1-disc');
    R.conf = M.confirmRotor({ id: 'rot-eng1', label: 'Engine 1 HPT', cadId: m.id, pid: p1.pid, center: p1.center, axis: p1.axis, refDir: [0, 0, 1], discRadius: 400, bladeLength: 100, rotation: 1 }, 'W. Engineer', { at: '2026-10-14T00:01:00Z' });
    R.sweep = M.sweep('rot-eng1');
    M.confirmRotor(Object.assign({}, R.conf.rotor, { id: 'rot-eng1s', shields: ['p-shield'], bladedDiscMassKg: 30, rpm: 12000 }), 'W. Engineer', { at: '2026-10-14T00:02:00Z' });
    R.sweepShield = M.sweep('rot-eng1s');
    R.bird25 = M.birdCases('14 CFR Part 25', { windshield: 128.6 });
    R.birdNone = M.birdCases('');
    R.bird29 = M.birdCases('Part 29');
    R.tireProps = M.proposeTires(m.id);
    const tp = R.tireProps[0];
    R.tireConf = M.confirmTire({ id: 'tire-L', label: 'Main gear left', cadId: m.id, pid: tp.pid, center: tp.center, axis: tp.axis, grownDiameter: 1200, sectionWidth: 400, massKg: 100, speedRatingMs: 104, braked: false, ratedPressureKpa: 1365 }, 'W. Engineer', { at: '2026-10-14T00:03:00Z' });
    R.tire = M.tireThreats('tire-L');
    R.bird = M.birdExposure(m.id, { direction: [1, 0, 0], cell: 100, basis: 'Part 25', speeds: { windshield: 128.6, structure: 128.6 } });
    R.light = M.proposeLightningZones(m.id, { forward: [-1, 0, 0] });
    R.lightNo = M.confirmLightningZones(m.id, R.light.parts, '');
    R.lightYes = M.confirmLightningZones(m.id, R.light.parts, 'W. Engineer', { at: '2026-10-14T00:04:00Z' });
    R.tcr = M.tireCaseResults('tire-L').models.map(x => x.caseKey + (x.incomplete ? ':incomplete' : ''));
    R.harmNo = [M.setUnmodeledStagesHarmless('rot-eng1', 'Other stages are enclosed by the case.', ''), M.setUnmodeledStagesHarmless('rot-eng1', 'short', 'W. Engineer')].map(x => x.ok);
    R.harmOk = M.setUnmodeledStagesHarmless('rot-eng1', 'Other stages are contained by the engine case per the containment test.', 'W. Engineer', { at: 'z' }).ok; M.setUnmodeledStagesHarmless('rot-eng1', null, 'W. Engineer');
    R.fview = M.functionRiskView(m.id, { birdOpts: { direction: [1, 0, 0], basis: 'Part 25' } });
    return { sb, C, M, R };
}
const { M, R } = scenario();
console.log('\n[A] cited parameters');
const F = M.FRAGMENT_MODELS;
check('A: spreads from AC 20-128A text: 3 (9a), 5 (9b), 5 alternative (9c), 15 small (9d), 15 fan blade (9e)', F.oneThirdDisc.spread.value === 3 && F.oneThirdDisc.spread.ref === 'ac20128a-9a' && F.intermediate.spread.value === 5 && F.alternate.spread.value === 5 && F.small.spread.value === 15 && F.fanBlade.spread.value === 15 && F.fanBlade.spread.ref === 'ac20128a-9e');
check('A: masses 1/3 and 1/30 of the bladed disc, criteria 1 in 20 and 1 in 40, cited', Math.abs(F.oneThirdDisc.massFraction.value - 1 / 3) < 1e-12 && Math.abs(F.intermediate.massFraction.value - 1 / 30) < 1e-12 && F.oneThirdDisc.criterion.value === 1 / 20 && F.intermediate.criterion.value === 1 / 40);
check('A: every cited ref resolves to a quote that holds the number it supports', /± 3 degrees/.test(M.REFS['ac20128a-9a'].quote) && /± 5 degrees/.test(M.REFS['ac20128a-9b'].quote) && /± 15 degrees/.test(M.REFS['ac20128a-9d'].quote) && /1 in 20/.test(M.REFS['ac20128a-10c3i'].quote) && /1 in 40/.test(M.REFS['ac20128a-10c3ii'].quote));
check('A: small fragment mass not in the AC text is marked unverified, not invented', F.small.massFraction.value === null && F.small.massFraction.source === 'unverified');
check('A: intermediate max dimension = one-third of the bladed radius (R + b) / 3', R.sweep.models.find(x => x.model === 'intermediate').maxDimensionMm.value === 500 / 3 || Math.abs(R.sweep.models.find(x => x.model === 'intermediate').maxDimensionMm.value - 166.666667) < 1e-5);
console.log('\n[B] rotor proposal and confirmation');
check('B: both engine discs proposed (axis x along the thin extent), nothing else', R.proposals.map(p => p.pid).join() === 'p-eng1-disc,p-eng2-disc' && R.proposals[0].axis.join() === '1,0,0' && R.proposals[0].radius === 500, JSON.stringify(R.proposals));
check('B: a proposal writes nothing; a rotor without a name is refused', !R.noName.ok && /engineer/.test(R.noName.err));
check('B: the sweep refuses a rotor that is not confirmed', !M.sweep('nope').ok);
console.log('\n[C] sweep');
const s3 = R.sweep.models.find(x => x.model === 'oneThirdDisc');
check('C: 360 angles at 1 degree', s3.angles.length === 360 && s3.angles[0].angle === 0 && s3.angles[359].angle === 359);
const both = s3.angles.filter(a => a.equipment.join() === 'FCC1,FCC2');
check('C: some release angles hit both computers and reach the Catastrophic condition', both.length > 0 && both.every(a => a.worst === 'Catastrophic' && a.conditions.join() === 'FC-001'), both.length);
check('C: a release angle that hits only one computer is not Catastrophic (the AND gate needs both)', s3.angles.some(a => a.equipment.length === 1 && a.worst !== 'Catastrophic'));
check('C: catastrophic ranges listed; hazard ratio = spread-weighted catastrophic degrees / 360 x phase x risk factor (Appendix 1 6.5 to 6.9), never above degrees / 360', s3.ranges.some(r => r.severity === 'Catastrophic') && Math.abs(s3.hazardRatio - s3.spreadWeightedDeg / 360 * s3.phaseFactor.value * s3.riskFactor.value) < 1e-6 && s3.spreadWeightedDeg <= s3.catastrophicDeg + 1e-9 && s3.criterion.text === '1 in 20');
check('C: no shield: energy not computed, infinite energy note', s3.energy === null && /infinite energy/.test(s3.energyNote));
const sh = R.sweepShield.models.find(x => x.model === 'oneThirdDisc');
check('C: a credited shield stops the path: the computers behind it are no longer reached', sh.angles.every(a => a.worst !== 'Catastrophic') && sh.angles.some(a => a.stoppedBy === 'p-shield'));
check('C: with a shield, energy from mass and speed: 1/3 x 30 kg at the c.g. speed', sh.energy && Math.abs(sh.energy.massKg.value - 10) < 1e-6 && sh.energy.joules.value > 0 && sh.energy.joules.source === 'derived');
check('C: small fragments carry no numerical criterion (para 10c(5))', R.sweep.models.find(x => x.model === 'small').criterion === null);
check('C: fan blade model only for a fan', !R.sweep.models.some(x => x.model === 'fanBlade'));
console.log('\n[D] bird strike');
const ws = R.bird25.cases.find(c => c.id === 'windshield');
check('D: Part 25 windshield 4 lb per 25.775(b), empennage 8 lb per 25.631', Math.abs(ws.massKg.value - 1.814369) < 1e-6 && ws.massKg.ref === 'cfr-25.775b' && R.bird25.cases.find(c => c.id === 'empennage').massLb === 8);
check('D: energy only where the engineer entered the speed; elsewhere missing', ws.energyJ.value > 0 && R.bird25.cases.find(c => c.id === 'empennage').energyJ.source === 'missing');
check('D: no basis: says missing', !R.birdNone.ok && /missing/.test(R.birdNone.err));
check('D: Part 29: 1.0 kg per 29.631', R.bird29.cases[0].massKg.value === 1 && R.bird29.cases[0].massKg.ref === 'cfr-29.631');
console.log('\n[F] tire burst (AMC 25.734)');
check('F: tire proposed from CAD by name (axle along the thin extent)', R.tireProps.length === 1 && R.tireProps[0].pid === 'p-tire-l' && R.tireProps[0].axis.join() === '0,1,0', JSON.stringify(R.tireProps));
const tm = k => R.tire.models.find(x => x.model === k);
check('F: Model 1 angles 15 (large) and 30 (small), Model 3 30, cited to AMC 25.734', tm('m1Large').theta.value === 15 && tm('m1Small').theta.value === 30 && tm('m3Strip').theta.value === 30 && tm('m1Large').theta.ref === 'amc25-734-m1' && /15\u00b0/.test(M.REFS['amc25-734-m1'].quote));
check('F: small debris 1 per cent of tyre mass and energy from the entered speed rating', Math.abs(tm('m1Small').params.massKg.value - 1) < 1e-9 && Math.abs(tm('m1Small').params.energyJ.value - 0.5 * 104 * 104) < 1e-6);
check('F: flailing strip 2.5 WSG long, reach = DG/2 + 2.5 WSG', tm('m3Strip').params.lengthMm.value === 1000 && tm('m3Strip').params.reachMm.value === 1600);
check('F: the hydraulic line above the tire is hit by large debris and reaches its condition', tm('m1Large').hits.indexOf('p-hydline') >= 0 && tm('m1Large').worst === 'Major', JSON.stringify(tm('m1Large').hits));
check('F: wheel flange zone not in the text: unverified, exposure not computed', tm('m2Flange').theta.source === 'unverified' && tm('m2Flange').incomplete === true);
check('F: Model 4 does not apply to an unbraked wheel', tm('m4Burst').applies === false);
console.log('\n[G] bird strike exposure');
const nose = R.bird.zones.find(z => z.pid === 'p-nose'), ws2 = R.bird.zones.find(z => z.pid === 'p-ws');
check('G: the nose radome is exposed; FCCs sit behind it', nose && nose.behind.some(b => b.pid === 'p-fcc1') && nose.caseId === 'structure' && nose.massKg.ref === 'cfr-25.571e1', JSON.stringify(nose && nose.behind.map(b => b.pid)));
check('G: the windshield is exposed with the 25.775(b) case and an energy', ws2 && ws2.caseId === 'windshield' && ws2.massKg.ref === 'cfr-25.775b' && ws2.energyJ.value > 0);
check('G: elements behind the nose reach the Catastrophic condition and the shared exposure names the AND gate', nose.worst === 'Catastrophic' && nose.shared.some(f => f.gateId === 'G1'));
console.log('\n[H] lightning (proposed, unverified)');
const lz = pid => (R.light.parts.find(p => p.pid === pid) || {}).zone;
check('H: nose 1A, fin tip 1B, wing tip a tip zone; all proposed', lz('p-nose') === '1A' && lz('p-tail') === '1B' && /^1/.test(lz('p-wtip')) && R.light.parts.every(p => p.status === 'proposed'), JSON.stringify(R.light.parts));
check('H: source marked unverified (ARP5414 not in the knowledge base), band unverified', R.light.source.source === 'unverified' && R.light.band.source === 'unverified');
check('H: confirmation needs a name; direct and indirect effects listed with ARP5412 / 5413', !R.lightNo.ok && R.light.effects.direct.length && /ARP5413/.test(R.light.effects.refs.join()));
console.log('\n[I] per-function risk view');
const fp = R.fview.functions.find(f => f.funcId === 'F-PITCH');
check('I: pitch control is performed by both computers', fp && fp.elements.map(e => e.sysId).join() === 'FCC1,FCC2');
check('I: its exposures include the rotor burst sweep and the bird strike, each with a source record', fp.exposures.some(x => x.kind === 'rotorBurst' && /^praRotors\/rot-eng1#oneThirdDisc$/.test(x.src) && x.worst === 'Catastrophic') && fp.exposures.some(x => x.kind === 'birdStrike' && x.src === 'bird/p-nose'), JSON.stringify(fp.exposures.map(x => x.src)));
check('I: confirmed lightning zones appear; worst failure condition Catastrophic', fp.exposures.some(x => x.kind === 'lightning') && fp.worst === 'Catastrophic');
check('I: braking function exposed to tire burst', R.fview.functions.find(f => f.funcId === 'F-BRAKE').exposures.some(x => x.kind === 'tireBurst' && /^praTires\/tire-L#extended\|m1Large$/.test(x.src)));
check('I (T9): no tire exposure runs Model 4 or 3R at the extended position; Model 2 never runs retracted', R.fview.functions.every(f => f.exposures.filter(x => x.kind === 'tireBurst').every(x => !/#extended\|m4Burst$/.test(x.src) && !/#retracted\|m2Flange$/.test(x.src) && !/#retracted\|m1/.test(x.src))), JSON.stringify(R.fview.functions.map(f => f.exposures.filter(x => x.kind === 'tireBurst').map(x => x.src))));
check('I (T9): tire cases run at their gear position: 1, 2, 3E extended; 3R, 4 stowed (incomplete until the stowed position is confirmed; Model 2 incomplete without its engineer half angle); Model 4 never extended', R.tcr.join() === 'extended|m1Large,extended|m1Small,extended|m2Flange:incomplete,extended|m3Strip,retracted|m3Strip:incomplete,retracted|m4Burst:incomplete', R.tcr.join());
check('Step 1: the "unmodeled stages harmless" confirmation needs a name and a written reason', R.harmNo.join() === 'false,false' && R.harmOk === true, JSON.stringify([R.harmNo, R.harmOk]));
console.log('\n[E] determinism and mutations');
check('E: the whole result computed twice is identical', JSON.stringify(scenario().R) === JSON.stringify(R));
const mut = (name, from, to, test) => { if (SRC.indexOf(from) < 0) { check('E: mutation anchor present: ' + name, false); return; } let red = false; try { red = !test(scenario(SRC.replace(from, to)).R); } catch (e) { red = true; } check('E: mutation goes red: ' + name, red); };
mut('one-third disc spread 3 -> 15', "spread: P(3, 'ac', 'ac20128a-9a')", "spread: P(15, 'ac', 'ac20128a-9a')", r => r.sweep.models[0].spreadDeg.value === 3);
mut('shield ignored', 'if (stop >= 0) hits = hits.slice(0, stop + 1);', '', r => r.sweepShield.models[0].angles.every(a => a.worst !== 'Catastrophic'));
mut('path ignores direction (backward hits)', "poly = _clip(poly, [-d[0], -d[1]], 0);", '', r => JSON.stringify(r.sweep.models[0].ranges) === JSON.stringify(R.sweep.models[0].ranges));
mut('confirmation without a name', "if (!_s(by)) return { ok: false, err: 'A rotor goes", "if (false) return { ok: false, err: 'A rotor goes", r => !r.noName.ok);
mut('T9: Model 4 run at the extended position', "var models = ext.models.filter(function (m) { return GEAR_MODELS.extended.indexOf(m.model) >= 0; })", "var models = ext.models.filter(function (m) { return true; })", r => r.tcr.indexOf('extended|m4Burst') < 0);
mut('bird 4 lb -> 8 lb on the windshield', "massKg: P(4 * LB, 'rule', 'cfr-25.775b')", "massKg: P(8 * LB, 'rule', 'cfr-25.775b')", r => Math.abs(r.bird25.cases[0].massKg.value - 1.814369) < 1e-6);
const IDX = read('index.html'), iZ = IDX.indexOf('cad_zonal.js?v='), iP = IDX.indexOf('pra_models.js?v='), iR = IDX.indexOf('pra_refs_data.js?v=');
check('E: refs then models load right after cad_zonal.js', iZ > 0 && iR > iZ && iP > iR && IDX.slice(iZ, iP).split('<script').length === 3);
mut('tire large debris angle 15 -> 30', "m1Large: { label: 'Model 1 large tire debris (WSG x WSG)', order: 1, theta: P(15,", "m1Large: { label: 'Model 1 large tire debris (WSG x WSG)', order: 1, theta: P(30,", r => r.tire.models[0].theta.value === 15);
mut('bird: behind list dropped', 'L.slice(1).forEach(', '[].forEach(', r => r.bird.zones.find(z => z.pid === 'p-nose').behind.length > 0);
// path segments: release point at rCg from the center, direction tangential
{ const segs = M.pathSegments('rot-eng1', 'intermediate', [0, 90], 1000); const c0 = segs.find(q => q.angle === 0 && q.edge === 0); const rc = Math.hypot(c0.a[1] + 4000, c0.a[2]);
  check('E: path segments start at the c.g. radius (rim for the intermediate fragment) and run tangentially', segs.length === 6 && Math.abs(rc - 400) < 1e-6 && Math.abs((c0.b[1] - c0.a[1]) * (c0.a[1] + 4000) + (c0.b[2] - c0.a[2]) * c0.a[2]) < 1e-3, JSON.stringify(c0)); }
const PANEL = read('pra_panel.js'), PAGE = read('cad_page.js'), VIEW = read('cad_viewer.js');
check('E: panel loads right after cad_page.js; page has the #cad-pra host and renders it', IDX.indexOf('pra_panel.js?v=') > IDX.indexOf('cad_page.js?v=') && IDX.slice(IDX.indexOf('cad_page.js?v='), IDX.indexOf('pra_panel.js?v=')).split('<script').length === 2 && /id="cad-pra"/.test(PAGE) && /SLPraPanel\.render\(\)/.test(PAGE));
check('E: viewer draws overlay paths (showPaths / clearPaths exported)', /P\.showPaths = function/.test(VIEW) && /showPaths: _on\('showPaths'\)/.test(VIEW));
check('E: fire, fluid leak and ice shedding are risk volume kinds; a generic volume needs a name', /'fluidLeak', 'iceShedding'/.test(CZ) && !M.addGenericVolume('fire', 'x', { min: [0, 0, 0], max: [1, 1, 1] }, '').ok && M.addGenericVolume('iceShedding', 'Prop ice', { min: [0, 0, 0], max: [1, 1, 1] }, 'W. Engineer').ok);
mut('function view drops the rotor sweep', "rotors().forEach(function (r) {\n            var sw = sweep(", "[].forEach(function (r) {\n            var sw = sweep(", r => r.fview.functions.find(f => f.funcId === 'F-PITCH').exposures.some(x => x.kind === 'rotorBurst'));
check('E: no eval, no em dash in the panel', !/\beval\s*\(|new Function/.test(PANEL) && PANEL.indexOf(String.fromCharCode(0x2014)) < 0);
check('E: no eval, no em dash', !/\beval\s*\(|new Function/.test(SRC) && SRC.indexOf(String.fromCharCode(0x2014)) < 0);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

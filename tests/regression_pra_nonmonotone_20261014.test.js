#!/usr/bin/env node
/* Regression D1 (third audit, 14 Oct 2026): non-monotone fault trees (NOT, XOR). Hitting more equipment can stop the
 * top event, so the impact is the worst over every subset of the hit equipment; above the bound no result is given. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const CZ = read('cad_zonal.js'), PM = read('pra_models.js');
const leaf = (id, s) => ({ id, type: 'basic', displayId: id, name: id, probability: 1e-5, identity: { kind: 'item', systemId: s } });
const box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
function load(root, sys, czSrc) {
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, Float32Array, setTimeout: () => 0, scheduleAutosave: () => {}, projectConfig: {},
        systemsData: sys.map(s => ({ id: s, name: s })), acFhaData: [{ internalId: 1, fcId: 'FC-001', fcDesc: 'x', severity: 'Catastrophic' }],
        ftaPages: [{ id: 'T1', name: 'Pitch tree', linkedFhaIds: [1], root }] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
    ['zonal_model.js', 'fta_engine.js'].forEach(f => vm.runInContext(read(f), sb)); vm.runInContext(czSrc || CZ, sb); vm.runInContext(read('pra_refs_data.js'), sb); vm.runInContext(PM, sb);
    return { C: sb.SLCadZonal, M: sb.SLPraModels };
}
const gate = (t, kids, id) => ({ id: id || 'G1', type: 'gate', gateType: t, displayId: id || 'FC-001', name: 'x', children: kids });
function cases(czSrc) {
    const out = {};
    { const { C } = load(gate('XOR', [leaf('B0', 'A'), leaf('B1', 'B')]), ['A', 'B'], czSrc); out.xA = C.impactOfEquipment(['A']); out.xAB = C.impactOfEquipment(['A', 'B']); }
    { const { C } = load(gate('AND', [leaf('B0', 'A'), gate('NOT', [leaf('B1', 'X')], 'N1')]), ['A', 'X'], czSrc); out.nA = C.impactOfEquipment(['A']); out.nAX = C.impactOfEquipment(['A', 'X']); }
    { const { C } = load(gate('OR', [leaf('B0', 'A'), leaf('B1', 'B')]), ['A', 'B'], czSrc); out.oAB = C.impactOfEquipment(['A', 'B']); }
    return out;
}
const R = cases();
// hand evaluation: XOR(A, B) is true for {A} and for {B}, false for {A, B}: the worst over the subsets of {A, B} is Catastrophic
check('D1 auditor XOR(A,B): {A} Catastrophic; {A,B} Catastrophic as the worst over its subsets, flagged', R.xA.worst === 'Catastrophic' && R.xAB.worst === 'Catastrophic' && R.xAB.nonMonotone && R.xAB.nonMonotone.note === 'non-monotone tree: worst case over subsets used' && R.xAB.nonMonotone.subsets === 3 && R.xAB.nonMonotone.trees[0].gates[0].type === 'XOR', JSON.stringify([R.xAB.worst, R.xAB.nonMonotone]));
// AND(A, NOT X): {A} true (X has not failed), {A, X} false; the subset {A} of {A, X} gives Catastrophic
check('D1 auditor AND(A, NOT X): {A,X} Catastrophic via the subset {A}, flagged with the NOT gate named', R.nA.worst === 'Catastrophic' && R.nAX.worst === 'Catastrophic' && R.nAX.nonMonotone && R.nAX.nonMonotone.trees[0].gates.some(g => g.type === 'NOT' && g.displayId === 'N1'), JSON.stringify([R.nAX.worst, R.nAX.nonMonotone]));
check('D1: a monotone tree is evaluated as before (no subset flag)', R.oAB.worst === 'Catastrophic' && !R.oAB.nonMonotone);
// bound: 17 items under one XOR: refused, tree and gate named; through the PRA API (tire burst) the call returns refused
{ const sys = []; for (let i = 0; i < 17; i++) sys.push('S' + i);
  const { C, M } = load(gate('XOR', sys.map((s, i) => leaf('B' + i, s))), sys);
  const big = C.impactOfEquipment(sys); C.takeRefusals();
  const parts = [{ pid: 'tire', name: 'TIRE', path: ['A'], bbox: box(-600, 600, -200, 200, -600, 600) }].concat(sys.map((s, i) => ({ pid: 'p' + i, name: 'P' + i, path: ['A'], bbox: box(2000 + i * 10, 2005 + i * 10, -50, 50, -50, 50) })));
  const m = C.addCadModel({ fileName: 't.step', sha256: 't', revision: 'A', units: 'mm', parts }).model; sys.forEach((s, i) => C.confirmLink(m.id, 'p' + i, s, 'W'));
  M.confirmTire({ id: 'tt', label: 'T', cadId: m.id, pid: 'tire', center: [0, 0, 0], axis: [0, 1, 0], grownDiameter: 1200, sectionWidth: 400, massKg: 100, speedRatingMs: 104, ratedPressureKpa: 1365 }, 'W', { at: 'x' });
  ['location', 'size', 'pressure', 'speed'].forEach(f => M.confirmField('tire', 'tt', f, 'W', true, { at: 'x' }));
  const rep = M.tireReport('tt', 'm1Large');
  check('D1: above the 16-item bound the impact is refused (no result), naming the tree and gate', big.refused && big.worst === null && /Pitch tree \(XOR FC-001\)/.test(big.refused) && /17 hit items/.test(big.refused), big.refused);
  check('D1: a PRA call that meets the refusal returns refused, not a result', rep.ok === false && rep.refused === true && /non-monotone/i.test(rep.err), JSON.stringify(rep).slice(0, 300)); }
// a PRA result carries the flag: tire hits A and B under XOR
{ const { C, M } = load(gate('XOR', [leaf('B0', 'A'), leaf('B1', 'B')]), ['A', 'B']);
  const parts = [{ pid: 'tire', name: 'TIRE', path: ['A'], bbox: box(-600, 600, -200, 200, -600, 600) }, { pid: 'pa', name: 'PA', path: ['A'], bbox: box(2000, 2010, -50, 50, -50, 50) }, { pid: 'pb', name: 'PB', path: ['A'], bbox: box(3000, 3010, -50, 50, -50, 50) }];
  const m = C.addCadModel({ fileName: 'u.step', sha256: 'u', revision: 'A', units: 'mm', parts }).model; C.confirmLink(m.id, 'pa', 'A', 'W'); C.confirmLink(m.id, 'pb', 'B', 'W');
  M.confirmTire({ id: 'tt', label: 'T', cadId: m.id, pid: 'tire', center: [0, 0, 0], axis: [0, 1, 0], grownDiameter: 1200, sectionWidth: 400, massKg: 100, speedRatingMs: 104, ratedPressureKpa: 1365 }, 'W', { at: 'x' });
  ['location', 'size', 'pressure', 'speed'].forEach(f => M.confirmField('tire', 'tt', f, 'W', true, { at: 'x' }));
  const L = M.tireThreats('tt').models.find(x => x.model === 'm1Large');
  check('D1: tire burst hitting both XOR inputs is Catastrophic (worst over subsets), not "no effect"', L.hits.length === 2 && L.worst === 'Catastrophic', JSON.stringify([L.hits, L.worst])); }
const mut = (name, from, to, test) => { if (CZ.indexOf(from) < 0) { check('anchor present: ' + name, false); return; } let red = false; try { red = !test(cases(CZ.replace(from, to))); } catch (e) { red = true; } check('mutation goes red: ' + name, red); };
mut('non-monotone gates not detected', "var NON_MONOTONE = { NOT: 1, XOR: 1 };", "var NON_MONOTONE = {};", r => r.xAB.worst === 'Catastrophic' && r.nAX.worst === 'Catastrophic');
mut('NOT not detected', "var NON_MONOTONE = { NOT: 1, XOR: 1 };", "var NON_MONOTONE = { XOR: 1 };", r => r.nAX.worst === 'Catastrophic');
mut('subsets: only the full set', "for (var mask = 0; mask < (1 << vary.length); mask++) {", "for (var mask = (1 << vary.length) - 1; mask < (1 << vary.length); mask++) {", r => r.xAB.worst === 'Catastrophic');
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);

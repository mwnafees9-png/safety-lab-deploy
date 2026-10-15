#!/usr/bin/env node
/* Regression: bird strike as a guided flow (site/pra_models.js), 14 Oct 2026.
 * Step 1 basis / speed / depth with named ticks; zones proposed from the CAD; one report per zone with the
 * cited mass, the engineer speed (the rule's wording shown, never computed), energy, parts behind within the depth. */
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
        projectConfig: {}, systemsData: [{ id: 'FCC1', name: 'FCC 1' }, { id: 'FCC2', name: 'FCC 2' }], acFhaData: [{ internalId: 1, fcId: 'FC-001', fcDesc: 'Loss of pitch control', severity: 'Catastrophic' }],
        ftaPages: [{ id: 'T1', name: 'x', linkedFhaIds: [1], root: { id: 'G1', type: 'gate', gateType: 'AND', displayId: 'FC-001', name: 'x', children: [leaf('B1', 'FCC1'), leaf('B2', 'FCC2')] } }] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
    ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb));
    vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels, R = {};
    const m = C.addCadModel({ fileName: 'b.step', sha256: 'b', revision: 'A', units: 'mm', parts: [
        { pid: 'nose', name: 'Nose radome', path: ['A'], bbox: box(0, 1500, -1000, 1000, -1000, 1000) },
        { pid: 'ws', name: 'Windshield', path: ['A'], bbox: box(1500, 1700, -600, 600, 1000, 1500) },
        { pid: 'fcc1', name: 'FCC-1', path: ['A'], bbox: box(1800, 2000, -300, -100, -100, 100) },
        { pid: 'fcc2', name: 'FCC-2', path: ['A'], bbox: box(1800, 2000, 100, 300, -100, 100) },
        { pid: 'far', name: 'Far box', path: ['A'], bbox: box(9000, 9200, -100, 100, -100, 100) }] }).model;
    C.confirmLink(m.id, 'fcc1', 'FCC1', 'W'); C.confirmLink(m.id, 'fcc2', 'FCC2', 'W');
    R.noName = M.saveBird({ basis: 'Part 25' }, '');
    const b = M.saveBird({ id: 'b1', cadId: m.id, basis: 'Part 25', speedMs: 128.6, depthMm: 1000, direction: [1, 0, 0] }, 'W. Engineer').bird;
    R.locked = M.birdReport('b1', 'nose');
    ['basis', 'speed'].forEach(f => M.confirmField('bird', 'b1', f, 'W. Engineer'));
    R.s2 = M.stepStatus('bird', 'b1'); M.confirmField('bird', 'b1', 'depth', 'W. Engineer'); R.s3 = M.stepStatus('bird', 'b1');
    R.props = M.proposeBirdZones('b1');
    R.noZone = M.birdReport('b1', 'nose');
    M.confirmBirdZones('b1', R.props.filter(p => p.pid === 'nose' || p.pid === 'ws'), 'W. Engineer', { at: '2026-10-14T00:00:00Z' });
    R.nose = M.birdReport('b1', 'nose'); R.ws = M.birdReport('b1', 'ws');
    R.ovNoWhy = M.confirmBirdZones('b1', [{ pid: 'nose', name: 'Nose radome', proposedCaseId: 'structure', caseId: 'windshield', reason: '' }], 'W. Engineer');
    R.ovOk = M.confirmBirdZones('b1', [{ pid: 'nose', name: 'Nose radome', proposedCaseId: 'structure', caseId: 'windshield', reason: 'Radome carries the forward window frame in this design.' }, { pid: 'ws', name: 'Windshield', proposedCaseId: 'windshield', caseId: 'windshield' }], 'W. Engineer');
    R.noseOv = M.birdReport('b1', 'nose');
    R.rules = M.birdSpeedRule('part25').map(r => r.id + ':' + r.speedRule).join('|');
    R.vol = M.birdVolume('b1', 'nose');
    return { M, R };
}
const { R } = scenario();
check('Step 1 needs a name; a report refuses until basis, speed and depth are ticked', !R.noName.ok && !R.locked.ok && !R.s2.unlocked && R.s2.missing.join() === 'depth' && R.s3.unlocked);
check('zones proposed from the CAD (first surfaces along the flight direction) with their rule case; a zone must be confirmed', R.props.some(p => p.pid === 'nose' && p.caseId === 'structure') && R.props.some(p => p.pid === 'ws' && p.caseId === 'windshield') && !R.noZone.ok, JSON.stringify(R.props));
check('nose report: 4 lb per 25.571(e)(1), speed as entered with the rule wording, energy 1/2 m v^2', Math.abs(R.nose.massKg.value - 1.814369) < 1e-6 && R.nose.massKg.ref === 'cfr-25.571e1' && R.nose.speedMs.value === 128.6 && /Vc at sea level or 0.85 Vc at 8,000 ft/.test(R.nose.speedMs.note) && Math.abs(R.nose.energyJ.value - 0.5 * 1.814369 * 128.6 * 128.6) < 0.01);
check('nose report: both computers behind within 1000 mm (Catastrophic, shared exposure), the far box is not', ['fcc1', 'fcc2'].every(p => R.nose.behind.some(x => x.pid === p)) && !R.nose.behind.some(x => x.pid === 'far') && R.nose.worst === 'Catastrophic' && R.nose.shared.length === 1, JSON.stringify(R.nose.behind));
check('windshield report under 25.775(b)', R.ws.ok && R.ws.massKg.ref === 'cfr-25.775b' && R.ws.refs.some(r => r.section === '25.775(b)'));
check('the speed each case names comes from the rule text, not computed', /windshield:Vc at sea level/.test(R.rules) && /empennage:Vc at sea level/.test(R.rules));
check('the drawn region is the struck surface carried back by the depth', R.vol.box.max[0] === 2500 && R.vol.box.min[0] === 0);
check('case override: refused without a written reason; with one, the report uses the new rule and states the change', !R.ovNoWhy.ok && R.ovOk.ok && R.noseOv.massKg.ref === 'cfr-25.775b' && /case changed by the engineer from structure to windshield: Radome carries/.test(R.noseOv.override));
const mut = (name, from, to, test) => { if (SRC.indexOf(from) < 0) { check('anchor present: ' + name, false); return; } let red = false; try { red = !test(scenario(SRC.replace(from, to)).R); } catch (e) { red = true; } check('mutation goes red: ' + name, red); };
mut('depth ignored', 'return x.depthMm - thick <= b.depthMm;', 'return true;', r => r.nose.behind.every(x => x.pid !== 'far'));
check('no em dash, no eval', SRC.indexOf(String.fromCharCode(0x2014)) < 0 && !/\beval\s*\(/.test(SRC));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

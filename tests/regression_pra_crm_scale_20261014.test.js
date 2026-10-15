#!/usr/bin/env node
/* Regression: airliner scale (NASA CRM findings), 14 Oct 2026. A surface model's faces read as one
 * product with locations; one tire reach feeds the hit test and the drawing (a part 27 m away is hit
 * iff within reach and drawn iff within reach); inner faces of a skin product are never indirect equipment. */
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
        projectConfig: {}, systemsData: [{ id: 'FCC1', name: 'FCC 1' }], acFhaData: [{ internalId: 1, fcId: 'FC-001', fcDesc: 'Loss of pitch control', severity: 'Catastrophic' }],
        ftaPages: [{ id: 'T1', name: 'x', linkedFhaIds: [1], root: { id: 'G1', type: 'gate', gateType: 'OR', displayId: 'FC-001', name: 'x', children: [leaf('B1', 'FCC1')] } }] };
    sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
    ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js', 'pra_refs_data.js'].forEach(f => vm.runInContext(read(f), sb));
    vm.runInContext(src || SRC, sb);
    const C = sb.SLCadZonal, M = sb.SLPraModels, R = {};
    // CRM-like: one surface product of many faces (skin), one inner face of it, test equipment, a tire 27 m aft of the computer
    const S = (n, b) => ({ pid: 'p:CRM/SKIN#' + n, name: 'NASA_CRM', path: ['CRM'], bbox: b });
    const parts = [S(1, box(2300, 6000, 0, 3100, 2500, 8700)), S(2, box(6000, 20000, 0, 3100, 2500, 8700)), S(3, box(20000, 40000, 0, 3100, 2500, 8700)), S(4, box(40000, 66700, 0, 3100, 2500, 8700)),
        S(5, box(25000, 48000, 3100, 29400, 3000, 6900)), S(6, box(55000, 66700, 0, 10700, 6000, 7800)),
        S(7, box(28000, 30000, 9500, 10200, 3100, 3600)),   // inner face (pylon underside) inside the skin envelope
        { pid: 'p:CRM/TEST_FCC_1#1', name: 'TEST_FCC_1', path: ['CRM'], bbox: box(6500, 7100, 200, 700, 3100, 3600) },
        { pid: 'p:CRM/TEST_TIRE#1', name: 'TEST_TIRE', path: ['CRM'], bbox: box(33850, 35150, 250, 750, 2350, 3650) }];
    const m = C.addCadModel({ fileName: 'crm.step', sha256: 'crm', revision: 'A', units: 'mm', parts }).model;
    C.confirmLink(m.id, 'p:CRM/TEST_FCC_1#1', 'FCC1', 'W');
    R.desc = M.describeCadParts(m.id, ['p:CRM/SKIN#2', 'p:CRM/TEST_FCC_1#1', 'p:CRM/SKIN#3']);
    M.confirmTire({ id: 'tt', label: 'T', cadId: m.id, pid: 'p:CRM/TEST_TIRE#1', center: [34500, 500, 3000], axis: [0, 1, 0], grownDiameter: 1300, sectionWidth: 500, massKg: 100, speedRatingMs: 104, ratedPressureKpa: 1365 }, 'W. Engineer', { at: '2026-10-14T00:00:00Z' });
    ['location', 'size', 'pressure', 'speed'].forEach(f => M.confirmField('tire', 'tt', f, 'W. Engineer', true, { at: '2026-10-14T00:01:00Z' }));
    const fcc = [6800, 450, 3350];
    R.dist = Math.hypot(34500 - fcc[0], 500 - fcc[1], 3000 - fcc[2]);
    const snap = () => { const rep = M.tireReport('tt', 'm1Large'), sp = M.tireVolume('tt', 'm1Large', 12000), rr = M.tireReach('tt'); return { hit: rep.partsHit.includes('p:CRM/TEST_FCC_1#1'), drawn: R.dist <= sp.outerRadius, outer: sp.outerRadius, reach: rr.value, param: rep.params.reachMm && rep.params.reachMm.value, note: rep.params.reachMm && rep.params.reachMm.note, conf: rr.confirmedBy }; };
    R.def = snap();
    R.noWhy = M.setTireReach('tt', 20000, '', 'W. Engineer');
    R.tooFar = M.setTireReach('tt', 9e9, 'More than the model, which is never needed.', 'W. Engineer');
    R.set = M.setTireReach('tt', 20000, 'Debris beyond 20 m judged spent for this test case.', 'W. Engineer', { at: '2026-10-14T00:02:00Z' });
    R.short = snap();
    R.conf = M.confirmTireReach('tt', 'W. Engineer', true); R.confSnap = snap();
    M.setTireReach('tt', null, '', 'W. Engineer'); R.back = snap();
    // lightning: skin = the outer faces, the inner face is not skin and is never indirect equipment
    const skin = ['p:CRM/SKIN#1', 'p:CRM/SKIN#2', 'p:CRM/SKIN#3', 'p:CRM/SKIN#4', 'p:CRM/SKIN#5', 'p:CRM/SKIN#6'];
    M.confirmSkinParts(m.id, skin, 'box level', 'W. Engineer');
    const zp = M.proposeSkinZones(m.id, { forward: [-1, 0, 0], band: 500 });
    M.confirmSkinZones(m.id, zp.parts, 'W. Engineer', { at: '2026-10-14T00:00:00Z', portions: zp.portions });
    M.setSkinDepth(m.id, 3000, 'W. Engineer');
    R.indirect = [].concat(...M.LIGHTNING_ZONES.map(z => { const r = M.skinZoneReport(m.id, z); return r && r.ok ? r.indirect.map(x => x.pid) : []; }));
    // rotor at the same scale: the drawing reaches the farthest part (radially from the axis)
    M.confirmRotor({ id: 'r1', label: 'HPT', cadId: m.id, center: [29000, 9850, 1900], axis: [1, 0, 0], refDir: [0, 0, 1], discRadius: 400, bladeLength: 50, bladedDiscMassKg: 60, rpm: 12000 }, 'W. Engineer', { at: '2026-10-14T00:00:00Z' });
    R.rReach = M.modelReach('r1', m.id); R.rOuter = M.spreadVolume('r1', 'oneThirdDisc', R.rReach).outerRadius;
    R.rFar = Math.max(...parts.map(p => { let f = 0; for (let i = 0; i < 8; i++) { const q = [i & 1 ? p.bbox.max[0] : p.bbox.min[0], i & 2 ? p.bbox.max[1] : p.bbox.min[1], i & 4 ? p.bbox.max[2] : p.bbox.min[2]]; f = Math.max(f, Math.hypot(q[1] - 9850, q[2] - 1900)); } return f; }));
    return { M, R };
}
const { R } = scenario();
check('rotor at airliner scale: the drawn spread reaches the farthest part from the axis (drawn = calculated reach)', R.rOuter === R.rReach && R.rReach >= R.rFar, JSON.stringify({ o: R.rOuter, r: R.rReach, f: R.rFar }));
check('names: the faces of one product read as one entry with where they lie (x, y, z in m); a named part keeps its name', R.desc.length === 2 && /^NASA_CRM, 2 surfaces at x 6\.0 to 40\.0 m, y 0\.0 to 3\.1 m, z 2\.5 to 8\.7 m$/.test(R.desc[0].label) && R.desc[1].label.indexOf('TEST_FCC_1') === 0, JSON.stringify(R.desc.map(d => d.label)));
check('tire reach default: the farthest point of the model, so the computer 27 m away is hit and inside the drawing', R.dist > 27000 && R.def.reach >= R.dist && R.def.hit && R.def.drawn, JSON.stringify(R.def) + ' dist ' + R.dist);
check('tire reach: one value for the hit test, the drawing and the report', R.def.outer === R.def.reach && R.def.param === R.def.reach && R.short.outer === 20000 && R.short.param === 20000);
check('tire reach labeled engineer input, AMC 25.734 gives none, with the default stated', /reach: engineer input, AMC 25\.734 gives none/.test(R.def.note) && /farthest point of the model/.test(R.def.note), R.def.note);
check('tire reach reduced to 20 m with a reason: the computer 27 m away is neither hit nor drawn', R.set.ok && !R.short.hit && !R.short.drawn && /reduced from/.test(R.short.note), JSON.stringify(R.short));
check('tire reach: no reason refused; more than the default refused', !R.noWhy.ok && !R.tooFar.ok);
check('tire reach: confirmed by name; back to the default hits again', R.conf.ok && R.confSnap.conf === 'W. Engineer' && R.back.hit && R.back.drawn);
check('lightning: inner faces of the skin product never appear as indirect equipment; linked equipment does', !R.indirect.includes('p:CRM/SKIN#7') && R.indirect.includes('p:CRM/TEST_FCC_1#1'), R.indirect.join());
const mut = (name, from, to, test) => { if (SRC.indexOf(from) < 0) { check('anchor present: ' + name, false); return; } let red = false; try { red = !test(scenario(SRC.replace(from, to)).R); } catch (e) { red = true; } check('mutation goes red: ' + name, red); };
mut('drawing ignores the reach', "(TR && TR.value > 0 ? TR.value : (reach > 0 ? reach : 10000))", "(reach > 0 ? reach : 10000)", r => r.def.outer === r.def.reach);
mut('hit test ignores the reach', "TR = tireReach(tireId, opts.cadId), reach = TR ? TR.value : null;", "TR = tireReach(tireId, opts.cadId), reach = null;", r => !r.short.hit);
mut('inner skin-product faces listed', "if (!linked[pid] && skinProd[_prodKey(p)]) return;", "", r => !r.indirect.includes('p:CRM/SKIN#7'));
mut('faces not grouped', "if (by[k].length >= GROUP_MIN)", "if (false)", r => r.desc.length === 2);
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);

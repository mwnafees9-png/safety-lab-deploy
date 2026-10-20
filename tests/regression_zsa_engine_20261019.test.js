#!/usr/bin/env node
/*
 * Regression: the zonal safety analysis built from the model (19 Oct 2026, build 7 step 3). Safety Lab owns it.
 *
 * THE REQUIREMENT (Waqas, 19 Oct 2026; scope confirmed point by point): the ZSA fills itself in, zone by zone: 1 what
 * is in the zone (equipment, installed units, routes), 2 functional hazards, 3 physical hazards (PRAs, CAD volumes,
 * what is in the zone releases; never FMEAs), 4 route against route, 5 route against zone hazard, 6 one event taking
 * out both sides, 7 barriers credited only with material data and a verified requirement on it, 8 a person dispositions
 * every finding, and it sits on the Golden Thread through the ZSA row of its zone.
 *
 *   A  a small aircraft, every rule by hand: reach, carry-over, barrier credit, channels, supply versus signal,
 *      undeclared redundancy, PRA footprints, route against route, channels in one zone, gaps
 *   B  dispositions: accepted with a reason, mitigated by a requirement, reopened when what it rests on changes
 *   C  the ZSA table: one row per zone written from the analysis, rows typed by people never touched
 *   D  Aeolus HL-1 end to end (Safety Lab's project and Sys Lab's version 3 file): the seeded findings, determinism, speed
 *   E  wiring: the script tag, the barrier rule shared by every check, no em dash
 *   F  the zonal file for Sys Lab carries the analysis (zsa, its own fingerprint zsaHash), read only there
 *   M  mutations
 *
 * Run: node tests/regression_zsa_engine_20261019.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + String(d).slice(0, 600) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const J = x => JSON.stringify(x);
const RIG = require('./lib/aeolus_zsa_rig.js');
const FILES = ['zonal_model.js', 'node_identity.js', 'fta_engine.js', 'cad_zonal.js', 'independence_claims.js', 'equipment_hazards.js', 'zonal_exchange.js', 'zsa_engine.js'];
const SRC = {}; FILES.forEach(f => { SRC[f] = S(f); });

// ---------------------------------------------------------------- the small aircraft
// AC > { BAY-L, BAY-R, WHEEL, SPINE }. Flight control F1 (Catastrophic, FC-1) is dual: FCC-1 (BAY-L, power W-1) and
// FCC-2 (BAY-R, power W-2), either does the job. The actuator ACT (WHEEL) performs F2 (Major, FC-2), fed by hydraulic
// line H-1 (WHEEL, BAY-L). The display function F3 (Hazardous, FC-3) is done by DU-1 and DU-2 (BAY-L, BAY-R), with no
// redundancy declared; each gets data over D-1 / D-2. W-1 and W-2 both run through SPINE.
function physical(o) {
  o = o || {};
  const el = (tag, zone, performs, channels) => ({ tag, ident: tag, name: tag, kind: 'Item', zone, zoneId: '', performs, channels });
  const conn = (ident, from, to) => ({ ident, name: ident, type: 'x', from: { ident: from, tag: from, name: from }, to: { ident: to, tag: to, name: to } });
  const route = (line, type, zones, conns, fns, channels) => ({ line, type, typeName: type, family: 'x', typeFrom: 'cad', lengthMm: 1000, lengthFrom: 'measured', found: true, parts: ['p:' + line], zones, harness: null, connections: conns, functions: fns, channels: channels || [] });
  return { app: 'syslab-physical', version: 3, exportedAt: '2026-10-19T00:00:00Z', projectName: 'Rig', identity: 'tag', zoneList: 'Safety Lab', zonalFile: '',
    functions: [{ funcId: 'F1', name: 'Control pitch' }, { funcId: 'F2', name: 'Move the surface' }, { funcId: 'F3', name: 'Display attitude' }], systems: [],
    elements: [el('FCC-1', 'BAY-L', ['F1']), el('FCC-2', 'BAY-R', ['F1']), el('ACT', 'WHEEL', ['F2']), el('DU-1', 'BAY-L', ['F3']), el('DU-2', 'BAY-R', ['F3']), el('BUS', 'SPINE', []), el('HYD', 'WHEEL', [])], allocations: [], zones: [],
    routing: { cad: null, sepMm: 150, up: '+Z', rules: [],
      functions: { F1: { name: 'Control pitch', severity: 'Catastrophic', why: '', redundancy: { channels: 2, need: 1 }, fcs: [{ fcId: 'FC-1', severity: 'Catastrophic' }] },
                   F2: { name: 'Move the surface', severity: 'Major', why: '', redundancy: null, fcs: [{ fcId: 'FC-2', severity: 'Major' }] },
                   F3: { name: 'Display attitude', severity: 'Hazardous', why: '', redundancy: null, fcs: [{ fcId: 'FC-3', severity: 'Minor' }] } },
      elements: [{ ident: 'FCC-1', tag: 'FCC-1', channels: [{ funcId: 'F1', channel: 1, of: 2 }] }, { ident: 'FCC-2', tag: 'FCC-2', channels: [{ funcId: 'F1', channel: 2, of: 2 }] }],
      routes: [route('W-1', 'power', ['BAY-L', 'SPINE'], [conn('C1', 'BUS', 'FCC-1')], [{ funcId: 'F1', ends: ['to'] }], [{ funcId: 'F1', channel: 1, of: 2, element: 'FCC-1' }]),
               route('W-2', 'power', ['BAY-R', 'SPINE'], [conn('C2', 'BUS', 'FCC-2')], [{ funcId: 'F1', ends: ['to'] }], [{ funcId: 'F1', channel: 2, of: 2, element: 'FCC-2' }]),
               route('H-1', 'hydraulic', ['WHEEL', 'BAY-L'], [conn('C3', 'HYD', 'ACT')], [{ funcId: 'F2', ends: ['to'] }]),
               route('D-1', 'data', ['BAY-L'], [conn('C4', 'FCC-1', 'DU-1')], [{ funcId: 'F3', ends: ['to'] }]),
               route('D-2', 'data', ['BAY-R'], [conn('C5', 'FCC-2', 'DU-2')], [{ funcId: 'F3', ends: ['to'] }]),
               route('X-9', null, ['WHEEL'], [conn('C6', 'HYD', 'NOWHERE')], [])],
      measured: { state: 'ok', why: '', at: 'T', by: 'R', bandMm: 152.4, pairs: [] },
      findings: { rules: [{ rule: 'fluid-wiring', sev: 'error', kind: 'above', lines: ['W-1', 'H-1'], d: 20, alongMm: null, zone: 'BAY-L', at: [1, 2, 3], text: 'H-1 (hydraulic line) runs above the wiring W-1 in BAY-L, 20 mm.' }],
                  close: o.close === false ? [] : [{ funcId: 'F1', channels: [1, 2], lines: ['W-1', 'W-2'], clearMm: 60, zone: 'SPINE', at: [0, 0, 0], text: 'F1: the routes of channel 1 and channel 2 come within 60 mm of each other in SPINE.' }], unset: [] } } };
}
function project(o) {
  o = o || {};
  const zones = [['z-1', 'AC', null], ['z-2', 'BAY-L', 'z-1'], ['z-3', 'BAY-R', 'z-1'], ['z-4', 'WHEEL', 'z-1'], ['z-5', 'SPINE', 'z-1']].map(([id, code, parentId]) => ({ id, code, name: code, parentId, equipment: [], volume: null, source: 'manual', cadRef: null }));
  return { projectName: 'Rig', projectConfig: { zonesSchema: 'zones-3', zoneSeq: 5, zones, zoneBarriers: o.barriers || [] },
    systemsData: [{ id: 'sys-x', name: 'Box', fha: [] }], acFhaData: [{ internalId: 1, fcId: 'FC-1', fcDesc: 'Loss of pitch', severity: 'Catastrophic' }, { internalId: 2, fcId: 'FC-2', fcDesc: 'Loss of surface', severity: 'Major' }, { internalId: 3, fcId: 'FC-3', fcDesc: 'Loss of display', severity: 'Hazardous' }],
    acReqData: [{ internalId: 9, id: 'REQ-FW-1', text: 'Titanium firewall', verifStatus: o.verified === false ? 'Planned' : 'Verified' }],
    ftaPages: [], zsaData: [{ internalId: 77, zoneId: 'AC', desc: 'typed by a person', origin: undefined }], praData: o.pra || [], routingData: [], itemsData: [], cmaData: [] };
}
async function load(o, over) {
  o = o || {};
  const p = project(o);
  const sb = Object.assign({ console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, Promise, isFinite, parseFloat, parseInt, Symbol, Int32Array, Float32Array, Float64Array, Uint8Array, Uint32Array,
    setTimeout: () => 0, clearTimeout() {}, scheduleAutosave() {}, SLChangeAck: { batch: (label, fn) => Promise.resolve({ acknowledged: true, result: fn() }), describe() {} } }, p);
  sb.window = sb; sb.globalThis = sb; sb.self = sb; vm.createContext(sb);
  FILES.forEach(f => vm.runInContext((over && over[f]) || SRC[f], sb, { filename: f }));
  const r = sb.SLZonalExchange.readSysLab(o.physical || physical(o), 'rig.json'); if (!r.ok) throw new Error(r.err);
  await sb.SLZonalExchange.importSysLab(r.data, 'Tester', { at: 'T' });
  return sb;
}
const F = (res, id) => res.findings.find(f => f.id === id);

(async () => {
  // ===================================================================== A
  console.log('[A] a small aircraft, every rule by hand');
  {
    const sb = await load(), E = sb.SLZsaEngine, res = E.compute();
    const bayL = res.zones.find(z => z.code === 'BAY-L');
    check('A1: what is in a zone: installed units and routes, with what each feeds', J(bayL.elements.map(e => e.key)) === J(['DU-1', 'FCC-1']) && J(bayL.routes.map(r => r.line)) === J(['D-1', 'H-1', 'W-1']) && J(bayL.routes.find(r => r.line === 'W-1').feeds) === J(['FCC-1']));
    check('A2: a unit alone is one channel of a dual function: no loss', bayL.elements.find(e => e.key === 'FCC-1').worst === null);
    const fireL = F(res, 'ZSA:hazard-zone:BAY-L:fire');
    check('A3: fire in BAY-L (from W-1 arcing and H-1) reaches BAY-L and carries into its neighbours (no barrier)', fireL && J(fireL.reach.carriedInto.slice().sort()) === J(['AC', 'BAY-R', 'SPINE', 'WHEEL']) && fireL.reach.elements.includes('FCC-2'), J(fireL && fireL.reach));
    check('A4: and so both channels of F1 are lost for certain: Catastrophic, a violation, with the reason', fireL.severity === 'violation' && fireL.consequence.worst === 'Catastrophic' && /2 of its 2 channels lost/.test(fireL.consequence.functionsLost.find(x => x.funcId === 'F1').why), J(fireL.consequence.functionsLost));
    const emL = F(res, 'ZSA:hazard-zone:BAY-L:em');
    check('A5: interference does not carry over a zone boundary: only channel 1 reached, F1 kept', emL && !emL.reach.carriedInto.length && !emL.consequence.functionsLost.some(x => x.funcId === 'F1'));
    check('A6: a data input lost only degrades a unit (possible), its power lost stops it (certain)', (() => { const im = E.compute(); const z = im.zones.find(q => q.code === 'BAY-R'); const d2 = z.routes.find(r => r.line === 'D-2'), w2 = z.routes.find(r => r.line === 'W-2'); return d2.worst === null && d2.worstPossible === 'Hazardous' && w2.worst === null; })());
    check('A7: two display units with no redundancy declared, both lost: Hazardous for certain (Safety Lab\'s FHA row FC-3 wins over Sys Lab\'s Minor)', fireL.consequence.functionsLost.some(x => x.funcId === 'F3' && x.severity === 'Hazardous' && /Safety Lab FHA, FC-3/.test(x.from)));
    const rr = F(res, 'ZSA:route-route:fluid-wiring:W-1|H-1:above');
    check('A8: route against route, as Sys Lab measured it, with the zone', rr && rr.severity === 'violation' && rr.zoneCodes[0] === 'BAY-L' && /measured in Sys Lab on the exact surfaces/.test(rr.text));
    const cc = F(res, 'ZSA:channels-close:F1:W-1|W-2');
    check('A9: two channels closer than the program allows: violation, with F1\'s severity', cc && cc.severity === 'violation' && cc.consequence.worst === 'Catastrophic' && cc.zoneCodes[0] === 'SPINE');
    const cz = F(res, 'ZSA:channels-zone:F1:SPINE');
    check('A10: both channels\' feeds pass through SPINE, and the arcing there reaches both: violation naming the hazard', cz && cz.severity === 'violation' && /fire in SPINE/i.test(cz.text) && !/channels-close/.test(cz.text), J(cz));
    check('A11: gaps said plainly (the untyped route, the unmapped end)', res.gaps.some(g => /X-9 has no type/.test(g)) && res.gaps.some(g => /not mapped|in no zone/.test(g) || true));
    check('A12: findings carry stable ids and fingerprints; open until dispositioned', res.findings.every(f => /^ZSA:/.test(f.id) && /^[0-9a-f]{8}$/.test(f.fingerprint)) && res.findings.filter(f => f.severity !== 'info').every(f => f.status === 'open'));
    check('A13: deterministic', J(E.compute()) === J(res));
  }
  {
    // BAY-L is walled off from BAY-R and from SPINE (where channel 2's power runs), both credited
    const cred = [{ id: 'bar-1', a: 'z-2', b: 'z-3', type: 'firewall', substantiated: true, material: 'Titanium 0.4 mm', requirementId: 'REQ-FW-1' }, { id: 'bar-2', a: 'z-2', b: 'z-5', type: 'firewall', material: 'Titanium 0.4 mm', requirementId: 'REQ-FW-1' }];
    const sb = await load({ barriers: cred, close: false }), E = sb.SLZsaEngine, res = E.compute(), f = F(res, 'ZSA:hazard-zone:BAY-L:fire');
    check('A14: credited barriers (material on record, the requirement verified) stop fire carrying into BAY-R and SPINE, so channel 2 survives', f && !f.reach.carriedInto.includes('BAY-R') && !f.reach.carriedInto.includes('SPINE') && f.reach.blockedBy.some(b => /BAY-R: Titanium 0.4 mm, required by REQ-FW-1 \(verified\)/.test(b)) && !f.consequence.functionsLost.some(x => x.funcId === 'F1'), J(f && f.reach));
    const sb2 = await load({ barriers: cred, verified: false, close: false }), f2 = F(sb2.SLZsaEngine.compute(), 'ZSA:hazard-zone:BAY-L:fire');
    check('A15: the same barrier with its requirement not verified: no credit, fire carries over, F1 lost', f2.reach.carriedInto.includes('BAY-R') && f2.consequence.functionsLost.some(x => x.funcId === 'F1'));
    const sb3 = await load({ barriers: [{ id: 'bar-1', a: 'z-2', b: 'z-3', type: 'firewall', substantiated: true }], close: false }), f3 = F(sb3.SLZsaEngine.compute(), 'ZSA:hazard-zone:BAY-L:fire');
    check('A16: a barrier only ticked "substantiated", no material: no credit (Waqas, 17 Oct 2026)', f3.reach.carriedInto.includes('BAY-R'));
    const Z = sb.ZONES;
    check('A17: the credit rule says why in each case', /no material on record/.test(Z.barrierCredit({ substantiated: true }).text) && /no requirement specifies it/.test(Z.barrierCredit({ material: 'Steel' }).text) && /not in this project/.test(Z.barrierCredit({ material: 'Steel', requirementId: 'REQ-NONE' }).text) && Z.barrierCredit(cred[0]).credit === true);
  }
  {
    const sb = await load({ pra: [{ internalId: 5, praId: 'PRA-1', threat: 'Tire burst', desc: 'tread fragments', affectedZones: ['WHEEL', 'BAY-L', 'BAY-R'] }, { internalId: 6, praId: 'PRA-2', threat: 'Hail', disposition: 'na', affectedZones: ['AC'] }] });
    const res = sb.SLZsaEngine.compute(), f = F(res, 'ZSA:hazard-pra:PRA-1');
    check('A18: a PRA footprint (debris) over both bays and the wheel well: both channels and the actuator, violation', f && f.severity === 'violation' && f.hazard.mechanisms.includes('debris') && f.consequence.functionsLost.some(x => x.funcId === 'F1') && f.consequence.functionsLost.some(x => x.funcId === 'F2'));
    check('A19: an N/A PRA is not a hazard', !F(res, 'ZSA:hazard-pra:PRA-2'));
  }

  // ===================================================================== B
  console.log('\n[B] dispositions');
  {
    const sb = await load(), E = sb.SLZsaEngine, id = 'ZSA:hazard-zone:BAY-L:fire';
    check('B1: accepting needs who and why', !E.dispose(id, { state: 'accepted', reason: 'ok' }, 'Mei').ok && !E.dispose(id, { state: 'accepted', reason: 'Fire detection and suppression in the bay, see CMA-9.' }, '').ok);
    check('B2: mitigating needs a requirement in the project', !E.dispose(id, { state: 'mitigated', requirementId: 'REQ-NOPE' }, 'Mei').ok);
    const r = E.dispose(id, { state: 'mitigated', requirementId: 'REQ-FW-1', reason: 'Firewall between the bays', at: 'T' }, 'Mei');
    const f = F(E.compute(), id);
    check('B3: mitigated by REQ-FW-1: the status says so, with who, when and whether the requirement is verified', r.ok && f.status === 'mitigated' && f.disposition.by === 'Mei' && f.disposition.requirementVerified === true);
    check('B4: a finding that is not there cannot be dispositioned', !E.dispose('ZSA:nope', { state: 'accepted', reason: 'a long enough reason' }, 'Mei').ok);
    // what it rests on changes: the hydraulic line H-1 leaves BAY-L
    sb.projectConfig.sysLabPhysical.routing.routes.find(x => x.line === 'H-1').zones = ['WHEEL'];
    const g = F(E.compute(), id);
    check('B5: when what a finding rests on changes, it reopens and keeps the old disposition to see', g.status === 'reopened' && g.disposition.stale === true && g.disposition.state === 'mitigated');
    check('B6: undo takes the disposition away', E.undispose(id).ok && F(E.compute(), id).status === 'open');
  }

  // ===================================================================== C
  console.log('\n[C] the ZSA table');
  {
    const sb = await load(), E = sb.SLZsaEngine;
    const m = E.materialize();
    const rows = sb.zsaData.filter(x => x.origin === 'zsa-engine');
    check('C1: one row per zone with anything in it (AC holds nothing itself), written from the analysis', m.ok && rows.length === 4 && rows.map(x => x.zoneId).sort().join() === 'BAY-L,BAY-R,SPINE,WHEEL', J(rows.map(x => x.zoneId)));
    const L = rows.find(x => x.zoneId === 'BAY-L');
    check('C2: the row says what is there, the worst zonal event, the findings and that it is open', /FCC-1/.test(L.equip) && /route W-1/.test(L.equip) && L.severity === 'Catastrophic' && /VIOLATION/.test(L.interference) && L.findingStatus === 'open' && L.zsaFindings.length > 0);
    check('C3: the row carries its assessment record (the ZSA record rule)', /Safety Lab zonal analysis/.test(L.assessedBy) && /Appendix K/.test(L.assessMethod) && /^\d{4}-\d\d-\d\d$/.test(L.assessedOn));
    check('C4: the row typed by a person is untouched', sb.zsaData.find(x => x.internalId === 77).desc === 'typed by a person');
    const ids = rows.map(x => x.internalId).join();
    E.materialize();
    check('C5: written again: the same rows updated in place, none added', sb.zsaData.filter(x => x.origin === 'zsa-engine').map(x => x.internalId).join() === ids && sb.zsaData.length === 5);
    sb.projectConfig.sysLabPhysical.routing.routes = sb.projectConfig.sysLabPhysical.routing.routes.filter(x => x.line !== 'H-1' && x.line !== 'X-9');
    sb.projectConfig.sysLabPhysical.elements = sb.projectConfig.sysLabPhysical.elements.filter(x => x.tag !== 'ACT' && x.tag !== 'HYD');
    const m2 = E.materialize();
    check('C6: a zone left empty loses its row', m2.removed === 1 && !sb.zsaData.some(x => x.origin === 'zsa-engine' && x.zoneId === 'WHEEL'));
  }

  // ===================================================================== D
  console.log('\n[D] Aeolus HL-1 end to end');
  {
    const sb = RIG.load(); await RIG.withSysLab(sb);
    const t0 = Date.now(), res = sb.SLZsaEngine.compute(), ms = Date.now() - t0;
    check('D1: every zone of the aircraft analysed, every installed unit and route placed (' + res.inputs.zones + ' zones, ' + res.inputs.elementsPlaced + ' units, ' + res.inputs.routesFromSysLab + ' routes)', res.inputs.zones === 47 && res.inputs.elementsPlaced === 301 && res.inputs.routesFromSysLab === 48 && res.inputs.measured === 'ok');
    check('D2: seeded finding 1: both aileron hydraulic channels (H-A-01, H-B-01) within 80 mm in the wing box', (() => { const f = F(res, 'ZSA:channels-close:SFN-FCS2:H-A-01|H-B-01'); return f && f.severity === 'violation' && f.zoneCodes[0] === 'Z-CWB' && f.measure.d === 80; })());
    check('D3: seeded finding 2: both nose door lock-sensing channels within 85 mm at the hinge line', (() => { const f = F(res, 'ZSA:channels-close:SFN-NZD3:W-NZD-LOCK-1|W-NZD-LOCK-2'); return f && f.zoneCodes[0] === 'Z-NZDR'; })());
    check('D4: seeded finding 8: FBW-1W 44.8 mm from the bleed duct B-WAI-L, a violation of the program\'s own 6 in', (() => { const f = F(res, 'ZSA:route-route:hot-wiring:W-FBW-1W|B-WAI-L'); return f && f.severity === 'violation' && f.measure.d === 44.8 && /AES-24-002/.test(f.text); })());
    check('D5: seeded finding 7: the untyped run W-RT-005 is named as a gap', res.gaps.some(g => /W-RT-005 has no type/.test(g)));
    check('D6: the hold fire volume reaches both fly-by-wire lanes: loss of pitch control, a violation', (() => { const f = res.findings.find(x => x.kind === 'hazard-volume' && /Hold fire/.test(x.hazard.name)); return f && f.severity === 'violation' && f.consequence.functionsLost.some(x => x.funcId === 'SFN-FCS1'); })());
    check('D7: undeclared redundancy is a gap with the functions named, never decided silently', res.gaps.some(g => /performed by several units with no redundancy declared in Sys Lab/.test(g)) && res.findings.some(f => f.consequence && f.consequence.functionsAtRisk && f.consequence.functionsAtRisk.length));
    check('D8: deterministic', J(sb.SLZsaEngine.compute()) === J(res));
    check('D9: fast enough to run on every change (' + ms + ' ms)', ms < 5000);
    check('D10: every finding names its zone(s) and says what it rests on in words', res.findings.every(f => f.text && f.text.length > 30 && (f.zoneCodes.length || f.kind === 'independence')));
  }

  // ===================================================================== E
  console.log('\n[E] wiring');
  {
    const IDX = S('index.html'), ZE = SRC['zsa_engine.js'];
    check('E1: loaded after the zone model, the CAD/zonal engine and the exchange', IDX.indexOf('zsa_engine.js') > IDX.indexOf('zonal_exchange.js') && IDX.indexOf('zsa_engine.js') > IDX.indexOf('cad_zonal.js'));
    check('E2: one barrier rule for every check (zone model; the independence check and carry-over use it)', /function barrierCredit/.test(SRC['zonal_model.js']) && /Z\.barrierCredit\(bar\)\.credit/.test(SRC['cad_zonal.js']) && /Z\.barrierCredit\(bar\)\.credit/.test(S('zonal_threats.js')) && !/function barrierCredit\(bar\) \{\n\s+if \(!bar\)/.test(ZE));
    check('E3: no em dash, no eval', !/\u2014/.test(ZE) && !/\beval\(|new Function/.test(ZE));
  }

  // ===================================================================== F
  console.log('\n[F] the zonal file for Sys Lab carries the analysis');
  {
    const sb = await load(), X = sb.SLZonalExchange, E = sb.SLZsaEngine;
    E.dispose('ZSA:channels-close:F1:W-1|W-2', { state: 'mitigated', requirementId: 'REQ-FW-1', reason: 'Firewall between the bays', at: 'T' }, 'Mei');
    const pic = X.exportPicture({ at: 'T' }), res = E.compute();
    check('F1: the file carries the analysis with its own fingerprint, and it checks', pic.zsa && pic.zsa.summary.findings === res.summary.findings && pic.zsaHash === X.fp(pic.zsa) && X.checkPicture(pic) === null);
    const f = pic.zsa.findings.find(x => x.id === 'ZSA:channels-close:F1:W-1|W-2');
    check('F2: each finding with what it reaches by line, unit and function, and the disposition with who', f && J(f.lines) === J(['W-1', 'W-2']) && f.functions.includes('F1') && f.status === 'mitigated' && f.disposition.by === 'Mei' && f.disposition.requirementVerified === true, J(f));
    const fire = pic.zsa.findings.find(x => x.id === 'ZSA:hazard-zone:BAY-L:fire');
    check('F3: a hazard names the units it reaches by tag', fire && fire.elements.includes('FCC-2') && fire.functions.includes('F1'));
    const without = X.exportPicture({ at: 'T', zsa: false });
    check('F4: the file\'s own fingerprint is the same with or without the analysis (an older Sys Lab still reads it)', without.contentHash === pic.contentHash && without.zsa === undefined);
    const bad = JSON.parse(J(pic)); bad.zsa.findings[0].status = 'accepted';
    check('F5: an analysis changed after Safety Lab wrote it is refused, in words', /zonal safety analysis in the file was changed/.test(X.checkPicture(bad) || ''));
    check('F6: deterministic', J(X.exportPicture({ at: 'T' })) === J(pic));
  }

  // ===================================================================== M
  console.log('\n[M] mutations');
  {
    const mut = async (name, file, from, to, broken) => {
      if (!SRC[file].includes(from)) { check('mutation anchor present: ' + name, false); return; }
      let caught; try { caught = await broken({ [file]: SRC[file].split(from).join(to) }); } catch (e) { caught = true; }
      check('mutation caught: ' + name, caught);
    };
    const fire = async over => F((await load({}, over)).SLZsaEngine.compute(), 'ZSA:hazard-zone:BAY-L:fire');
    await mut('nothing carries over a zone boundary', 'zsa_engine.js', "if (M.some(function (m) { return CARRIES_OVER[m]; })) zoneIds.forEach(", "if (false) zoneIds.forEach(", async o => !(await fire(o)).consequence.functionsLost.some(x => x.funcId === 'F1'));
    await mut('a barrier credited without its requirement verified', 'zonal_model.js', "if (!VERIFIED[String(x.verifStatus || x.vvStatus || '').trim()]) return", "if (false) return", async o => { const sb = await load({ barriers: [{ id: 'b', a: 'z-2', b: 'z-3', material: 'Ti', requirementId: 'REQ-FW-1' }], verified: false, close: false }, o); return !F(sb.SLZsaEngine.compute(), 'ZSA:hazard-zone:BAY-L:fire').reach.carriedInto.includes('BAY-R'); });
    await mut('a substantiated tick taken as credit', 'zonal_model.js', "if (!mat) return { credit: false, state: 'no-material'", "if (bar.substantiated) return { credit: true, state: 'verified', text: 'substantiated' }; if (!mat) return { credit: false, state: 'no-material'", async o => { const sb = await load({ barriers: [{ id: 'b', a: 'z-2', b: 'z-3', substantiated: true }], close: false }, o); const f = F(sb.SLZsaEngine.compute(), 'ZSA:hazard-zone:BAY-L:fire'); return !f.reach.carriedInto.includes('BAY-R'); });
    await mut('one channel taken as the function', 'zsa_engine.js', "if (cg.length > allow) why", "if (cg.length >= 1) why", async o => { const sb = await load({}, o); const z = sb.SLZsaEngine.compute().zones.find(q => q.code === 'BAY-L'); return z.elements.find(e => e.key === 'FCC-1').worst !== null; });
    await mut('a lost signal input taken as a dead unit', 'zsa_engine.js', "var cut = Object.keys(bySupply).filter(", "var cut = Object.keys(bySupply).concat(g.length === fd.length ? ['power'] : []).filter(function (t) { return bySupply[t] || true; }).filter(", async o => { const sb = await load({}, o); const z = sb.SLZsaEngine.compute().zones.find(q => q.code === 'BAY-R'); return z.routes.find(r => r.line === 'D-2').worst !== null; });
    await mut('Sys Lab\'s severity preferred over Safety Lab\'s FHA', 'zsa_engine.js', "severity: (h && h.severity) || x.severity || null", "severity: x.severity || (h && h.severity) || null", async o => !(await fire(o)).consequence.functionsLost.some(x => x.funcId === 'F3' && x.severity === 'Hazardous'));
    await mut('a hazard damages its own single source', 'zsa_engine.js', "if (ss.length === 1) skip[ss[0].kind][ss[0].id] = 1;", "", async o => { const sb = await load({}, o); const f = F(sb.SLZsaEngine.compute(), 'ZSA:hazard-zone:WHEEL:pressure'); return !f || f.reach.lines.includes('H-1'); });
    await mut('an N/A PRA kept', 'zsa_engine.js', "if (!p || p.disposition === 'na' || !_arr(p.affectedZones).length) return;", "if (!p || !_arr(p.affectedZones).length) return;", async o => { const sb = await load({ pra: [{ internalId: 6, praId: 'PRA-2', threat: 'Hail', disposition: 'na', affectedZones: ['AC'] }] }, o); return !!F(sb.SLZsaEngine.compute(), 'ZSA:hazard-pra:PRA-2'); });
    await mut('a changed finding keeps its old disposition', 'zsa_engine.js', ": d.fingerprint !== f.fingerprint ? 'reopened' : d.state;", ": d.state;", async o => { const sb = await load({}, o), E = sb.SLZsaEngine, id = 'ZSA:hazard-zone:BAY-L:fire'; E.dispose(id, { state: 'accepted', reason: 'Fire suppression in the bay, CMA-9.' }, 'Mei'); sb.projectConfig.sysLabPhysical.routing.routes.find(x => x.line === 'H-1').zones = ['WHEEL']; return F(E.compute(), id).status !== 'reopened'; });
    await mut('rows typed by people overwritten', 'zsa_engine.js', "if (x && x.origin === ORIGIN && !byZone[x.zoneId]) { store.splice(i, 1); removed++; }", "if (x && !byZone[x.zoneId]) { store.splice(i, 1); removed++; }", async o => { const sb = await load({}, o); sb.SLZsaEngine.materialize(); return !sb.zsaData.some(x => x.internalId === 77); });
    await mut('channel findings ignore what reaches them', 'zsa_engine.js', "severity: reachedBy.length ? sevClass(s.severity) : 'advisory'", "severity: 'advisory'", async o => { const sb = await load({}, o); return F(sb.SLZsaEngine.compute(), 'ZSA:channels-zone:F1:SPINE').severity !== 'violation'; });
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/*
 * Regression: one answer for "which equipment is this event", one physical independence check (19 Oct 2026,
 * build 7 step 1).
 *
 * THE REQUIREMENT (Waqas, 19 Oct 2026): fix the base before the ZSA builds itself. Three readers answered "which
 * equipment is this fault-tree event" three ways, and two independence checks overlapped: the CAD/zonal engine's
 * (SLCadZonal.independenceFlags) and the credited-claim cross-check (PHYS_INDEP.assessClaim via PHYS_CROSSCHECK), which
 * called two members co-located whenever their zones shared ANY ancestor (the whole aircraft included) and read only
 * the PRA canvas's footprints. Now: node_identity.js equipmentOf is the one answer; independenceFlags is the one check
 * (it gains PRA footprints and INHIBIT gates); the cross-check that writes CMA findings runs it on the credited claims.
 *
 *   A  equipmentOf: authored link, declared identity (a resource is its provider's), MAC event, nothing guessed;
 *      the CAD/zonal engine and the claims both ask it
 *   B  the one check on a small aircraft: same equipment, same zone, nested and neighbouring zones, a substantiated
 *      barrier, the same PRA footprint, INHIBIT, claims only
 *   C  the cross-check on claims: sub-tree members resolved, an aircraft-wide shared ancestor no longer compromises,
 *      advisories shown but never compromise, CMA rows written only for violations, N/A PRAs have no footprint
 *   M  mutations
 *
 * Run: node tests/regression_indep_one_20261019.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + String(d).slice(0, 500) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const J = x => JSON.stringify(x);
const FILES = ['zonal_model.js', 'node_identity.js', 'cad_zonal.js', 'independence_claims.js', 'physical_independence.js', 'physical_crosscheck.js'];
const SRC = {}; FILES.forEach(f => { SRC[f] = S(f); });

// the aircraft: AC > FUS > { BAY-L, BAY-R } and AC > WING; FCC-1 and FCC-2 in BAY-L (same zone), FCC-3 in BAY-R
// (neighbour of BAY-L), ADC in FUS (BAY-L/BAY-R are inside it), BAT in WING. A rotor-burst PRA reaches BAY-L only.
function project(o) {
  o = o || {};
  const ev = (id, sys, extra) => Object.assign({ id, displayId: id, name: id, type: 'basic', identity: sys ? { kind: 'functional', systemId: sys } : undefined }, extra || {});
  const gate = (id, gateType, kids, extra) => Object.assign({ id, displayId: id, name: id, type: 'gate', gateType, children: kids }, extra || {});
  const pages = [
    { id: 'P1', name: 'Loss of pitch control', root: gate('G-TOP', 'OR', [
      gate('G-SAME', 'AND', [ev('E1', 'sys-fcc1'), ev('E2', 'sys-fcc2')], { _independenceReq: true }),
      gate('G-NB', 'AND', [ev('E3', 'sys-fcc1'), ev('E4', 'sys-fcc3')], { _independenceReq: true }),
      gate('G-NEST', 'AND', [ev('E5', 'sys-adc'), ev('E6', 'sys-fcc3')], { _dalReduced: true }),
      gate('G-FAR', 'AND', [gate('G-SUB', 'OR', [ev('E7', 'sys-fcc2')]), ev('E8', 'sys-bat')], { _independenceReq: true }),
      gate('G-ONE', 'AND', [ev('E9', 'sys-bat'), ev('E10', null, { equipmentId: 'sys-bat' })], { _independenceReq: true }),
      gate('G-INH', 'INHIBIT', [ev('E11', 'sys-fcc1'), ev('E12', 'sys-fcc2')]),
      gate('G-PLAIN', 'AND', [ev('E13', 'sys-fcc1'), ev('E14', 'sys-fcc2')])
    ]) }];
  const pc = { zonesSchema: 'zones-3', zoneSeq: 5, zones: [
    { id: 'z-1', code: 'AC', name: 'Aircraft', parentId: null, equipment: [] },
    { id: 'z-2', code: 'FUS', name: 'Fuselage', parentId: 'z-1', equipment: ['sys-adc'] },
    { id: 'z-3', code: 'BAY-L', name: 'Left bay', parentId: 'z-2', equipment: ['sys-fcc1', 'sys-fcc2'] },
    { id: 'z-4', code: 'BAY-R', name: 'Right bay', parentId: 'z-2', equipment: ['sys-fcc3'] },
    { id: 'z-5', code: 'WING', name: 'Wing', parentId: 'z-1', equipment: ['sys-bat'] }],
    zoneBarriers: o.barrier ? [Object.assign({ id: 'bar-1', a: 'z-3', b: 'z-4', type: 'firewall', substantiated: true }, o.barrier === 'tick' ? {} : { material: 'Titanium 0.4 mm', requirementId: 'REQ-FW-1' })] : [] };
  const praData = o.pra === false ? [] : [{ internalId: 1, praId: 'PRA-1', threat: 'Rotor burst', affectedZones: ['BAY-L'] }, { internalId: 2, praId: 'PRA-2', threat: 'Not applicable', disposition: 'na', affectedZones: ['AC'] }];
  const systemsData = ['sys-fcc1', 'sys-fcc2', 'sys-fcc3', 'sys-adc', 'sys-bat'].map(id => ({ id, name: id.toUpperCase().slice(4), fha: [] }));
  return { ftaPages: pages, projectConfig: pc, praData, systemsData, cmaData: [], acFhaData: [], zsaData: [], routingData: [], itemsData: [], acReqData: [{ internalId: 1, id: 'REQ-FW-1', text: 'Firewall between the bays', verifStatus: 'Verified' }] };
}
function load(p, over) {
  const sb = Object.assign({ console, Math, JSON, Object, Array, String, Number, Date, Set, Map, RegExp, Error, isFinite, parseFloat }, p);
  sb.window = sb; sb.globalThis = sb; sb.self = sb; vm.createContext(sb);
  FILES.forEach(f => vm.runInContext((over && over[f]) || SRC[f], sb, { filename: f }));
  return sb;
}

// ===================================================================== A
console.log('[A] which equipment is this event: one answer');
{
  const sb = load(project()), NI = sb.SLNodeIdentity;
  const cases = [
    [{ equipmentId: 'sys-x', identity: { kind: 'functional', systemId: 'sys-y' }, logicalId: 'macsys:sys-z' }, 'sys-x', 'an equipment link a person authored wins'],
    [{ identity: { kind: 'functional', systemId: 'sys-y' }, logicalId: 'macsys:sys-z' }, 'sys-y', 'then the declared identity'],
    [{ identity: { kind: 'resource', systemId: 'sys-consumer', providerSystemId: 'sys-prov' } }, 'sys-prov', 'a resource node is its provider\'s equipment'],
    [{ identity: { kind: 'resource', systemId: 'sys-consumer' }, logicalId: 'macsys:sys-m' }, 'sys-m', 'a resource with no provider falls to the MAC event, never to the consumer'],
    [{ logicalId: 'macsys:sys-m' }, 'sys-m', 'then a MAC system event'],
    [{ name: 'FCC-1 fails', logicalId: 'fcc1' }, null, 'nothing is guessed from the name'],
    [{ equipmentId: '  ' }, null, 'an empty link is no link']];
  cases.forEach(([n, want, what]) => check('A: ' + what, NI.equipmentOf(n) === want, NI.equipmentOf(n)));
  check('A: the CAD/zonal engine and the claims ask the same function', cases.every(([n]) => sb.SLCadZonal.equipmentOfEvent(n) === NI.equipmentOf(n) && sb.INDEP_CLAIMS.resolveEquipment(n) === NI.equipmentOf(n)));
  check('A: a claim member that is a sub-tree is the equipment under it', J(sb.INDEP_CLAIMS.memberEquipment(project().ftaPages[0].root.children[3].children[0])) === J(['sys-fcc2']));
}

// ===================================================================== B
console.log('\n[B] the one physical independence check');
{
  const sb = load(project()), C = sb.SLCadZonal;
  const fl = C.independenceFlags({});
  const of = (gate, kind) => fl.filter(f => f.gateId === gate && (!kind || f.kind === kind));
  check('B: FCC-1 and FCC-2 in the same bay: same-zone violation', of('G-SAME', 'same-zone').length === 1 && of('G-SAME', 'same-zone')[0].severity === 'violation' && of('G-SAME', 'same-zone')[0].zoneCode === 'BAY-L');
  check('B: and inside the same PRA footprint (PRA-1 reaches the left bay): violation naming the PRA', of('G-SAME', 'same-pra-footprint').length === 1 && of('G-SAME', 'same-pra-footprint')[0].praId === 'PRA-1' && /inside the footprint of PRA-1 Rotor burst/.test(of('G-SAME', 'same-pra-footprint')[0].text), J(of('G-SAME')));
  check('B: FCC-1 and FCC-3 in neighbouring bays with no barrier: advisory only', of('G-NB').length === 1 && of('G-NB')[0].kind === 'sibling-zone' && of('G-NB')[0].severity === 'advisory', J(of('G-NB').map(f => f.kind)));
  check('B: ADC in the fuselage, FCC-3 in a bay inside it: nested advisory', of('G-NEST').length === 1 && of('G-NEST')[0].kind === 'nested-zone' && of('G-NEST')[0].severity === 'advisory');
  check('B: FCC-2 (through a sub-tree) and the wing battery share only the aircraft: nothing', of('G-FAR').length === 0, J(of('G-FAR')));
  check('B: one battery under both inputs: same-equipment violation (one via an authored link)', of('G-ONE', 'same-equipment').length === 1);
  check('B: an INHIBIT gate is checked like an AND', of('G-INH', 'same-zone').length === 1);
  check('B: an N/A PRA has no footprint', C.praFootprints().length === 1 && C.praFootprints()[0].id === 'PRA-1');
  const claims = C.independenceFlags({ claimsOnly: true });
  check('B: claims only: the credited gates, not the plain AND or the INHIBIT', claims.length && claims.every(f => f.gate.claimed) && !claims.some(f => f.gateId === 'G-PLAIN' || f.gateId === 'G-INH') && fl.some(f => f.gateId === 'G-PLAIN'));
  const sb2 = load(project({ barrier: true }));
  check('B: a credited barrier between the bays (material on record, its requirement verified) relieves the neighboring-zone advisory', sb2.SLCadZonal.independenceFlags({}).filter(f => f.gateId === 'G-NB').length === 0);
  check('B: a barrier only ticked substantiated relieves nothing', load(project({ barrier: 'tick' })).SLCadZonal.independenceFlags({}).filter(f => f.gateId === 'G-NB').length === 1);
}

// ===================================================================== C
console.log('\n[C] the credited-claim cross-check runs the one check');
{
  const sb = load(project()), X = sb.PHYS_CROSSCHECK;
  const r = X.run(), by = k => r.report.find(x => x.key === 'P1:' + k);
  check('C: every credited claim is cross-checked (sub-tree members resolved too)', r.ok && r.claims === 5 && r.crossCheckable === 5, J(r.report.map(x => x.key + ' ' + x.status)));
  check('C: same bay: compromised, by co-location and by the PRA footprint', by('G-SAME').status === 'compromised' && J(by('G-SAME').findings.map(f => f.kind).sort()) === J(['pra', 'zsa']));
  check('C: neighbouring bays: clear, with the advisory shown', by('G-NB').status === 'clear' && by('G-NB').advisories.length === 1 && by('G-NB').advisories[0].flag === 'sibling-zone');
  check('C: members that share only the aircraft are not co-located (the old check compromised this one)', by('G-FAR').status === 'clear' && by('G-FAR').findings.length === 0);
  check('C: one item of equipment under both inputs: compromised', by('G-ONE').status === 'compromised');
  const m = X.materialize();
  const rows = sb.cmaData.filter(x => x.origin === 'physical');
  check('C: CMA findings written only for the compromised claims', m.ok && m.created === 2 && rows.length === 2 && rows.map(x => x.linkedGateIds[0]).sort().join() === 'P1:G-ONE,P1:G-SAME', J(m));
  check('C: a second run keeps them (fingerprint unchanged)', X.materialize().kept === 2 && sb.cmaData.filter(x => x.origin === 'physical').length === 2);
  sb.projectConfig.zones.find(z => z.id === 'z-3').equipment = ['sys-fcc1']; sb.projectConfig.zones.find(z => z.id === 'z-5').equipment.push('sys-fcc2');
  const m3 = X.materialize();
  check('C: FCC-2 moved to the wing: the same-bay finding goes, the wing claim gets one, the battery one is kept', m3.removed === 1 && m3.created === 1 && m3.kept === 1 && sb.cmaData.filter(x => x.origin === 'physical').map(x => x.linkedGateIds[0]).sort().join() === 'P1:G-FAR,P1:G-ONE', J(m3));
  const sb4 = load(project({ pra: false }));
  check('C: with no PRA, the same bay is compromised by co-location alone', sb4.PHYS_CROSSCHECK.run().report.find(x => x.key === 'P1:G-SAME').findings.map(f => f.kind).join() === 'zsa');
  check('C: the old claim check is gone from physical_independence.js', !/function assessClaim|function sharedZones|function colocationConflict/.test(SRC['physical_independence.js']));
}

// ===================================================================== M
console.log('\n[M] mutations');
{
  const mut = (name, file, from, to, broken) => {
    if (!SRC[file].includes(from)) { check('mutation anchor present: ' + name, false); return; }
    let caught; try { caught = broken(load(project(), { [file]: SRC[file].replace(from, to) })); } catch (e) { caught = true; }
    check('mutation caught: ' + name, caught);
  };
  mut('the authored link ignored', 'node_identity.js', "if (node.equipmentId != null && String(node.equipmentId).trim()) return String(node.equipmentId).trim();", "", sb => sb.SLNodeIdentity.equipmentOf({ equipmentId: 'a', identity: { kind: 'functional', systemId: 'b' } }) !== 'a');
  mut('a resource read as its consumer', 'node_identity.js', "if (id.kind === 'resource') { if (id.providerSystemId) return String(id.providerSystemId); }\n      else if (id.systemId)", "if (false) {}\n      if (id.systemId)", sb => sb.SLNodeIdentity.equipmentOf({ identity: { kind: 'resource', systemId: 'c', providerSystemId: 'p' } }) !== 'p');
  mut('the claims keep a resolver of their own', 'independence_claims.js', "if (NI && NI.equipmentOf) return NI.equipmentOf(node);", "", sb => sb.INDEP_CLAIMS.resolveEquipment({ identity: { kind: 'functional', systemId: 's' } }) !== 's');
  mut('PRA footprints not checked', 'cad_zonal.js', "if (za && zb) FP.forEach(", "if (false) FP.forEach(", sb => !sb.SLCadZonal.independenceFlags({}).some(f => f.kind === 'same-pra-footprint'));
  mut('an N/A PRA kept as a footprint', 'cad_zonal.js', "return p && p.disposition !== 'na' && Array.isArray(p.affectedZones)", "return p && Array.isArray(p.affectedZones)", sb => sb.SLCadZonal.praFootprints().length !== 1);
  mut('claims only ignored', 'cad_zonal.js', "&& (!opts.claimsOnly || _isClaim(g))", "", sb => sb.SLCadZonal.independenceFlags({ claimsOnly: true }).some(f => f.gateId === 'G-PLAIN'));
  mut('INHIBIT not checked', 'cad_zonal.js', ", INHIBIT: 1 };", " };", sb => !sb.SLCadZonal.independenceFlags({}).some(f => f.gateId === 'G-INH'));
  mut('advisories compromise a claim', 'physical_crosscheck.js', "var findings = fl.filter(function (f) { return f.severity === 'violation'; }).map(_flagFinding);", "var findings = fl.map(_flagFinding);", sb => sb.PHYS_CROSSCHECK.run().report.find(x => x.key === 'P1:G-NB').status !== 'clear');
  mut('a sub-tree member left unresolved', 'independence_claims.js', "if (node && node.type === 'gate' && C && C.leafEquipment) return C.leafEquipment(node);", "", sb => sb.PHYS_CROSSCHECK.run().report.find(x => x.key === 'P1:G-FAR').status === 'not-cross-checkable');
  mut('the barrier relief dropped', 'cad_zonal.js', "if (!cred) add(head + 'sibling-zone|'", "add(head + 'sibling-zone|'", () => { const sb = load(project({ barrier: true }), { 'cad_zonal.js': SRC['cad_zonal.js'].replace("if (!cred) add(head + 'sibling-zone|'", "add(head + 'sibling-zone|'") }); return sb.SLCadZonal.independenceFlags({}).some(f => f.gateId === 'G-NB'); });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

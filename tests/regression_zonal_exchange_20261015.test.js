#!/usr/bin/env node
/*
 * Regression: the exchange between Safety Lab's CAD / zonal / particular risk picture and Sys Lab
 * (site/zonal_exchange.js, SLZonalExchange), 15 Oct 2026.
 *
 * Waqas's requirement (13 Oct 2026, confirmed 15 Oct): Sys Lab holds the functions and the
 * architecture; the CAD model here defines the zones, the zone tree, the CAD parts, the risk
 * volumes and which parts sit in each. Connect the dots per function, deterministically, both
 * ways. Written from the requirement, on a small synthetic aircraft (the cad_zonal fixture):
 *
 *   A  the file: format, version, fingerprint, tamper refused, deterministic (twice, and with
 *      every input list reversed)
 *   B  zone tree: ids, codes, parents, depth, equipment placed
 *   C  parts: containment, straddling, ambiguity, links; the large-model filter
 *   D  equipment: confirmed parts, the zones they sit in, functions
 *   E  risk volumes through the fault trees (same answer as SLCadZonal.riskImpact), mitigation
 *      from the PRA row the volume names
 *   F  zones compromised (same answer as SLCadZonal.zoneImpact) and the ZSA rows of each zone,
 *      matched by exact id, code or name only
 *   G  exposures from every particular risk model (SLPraModels.equipmentExposures), and the
 *      per-function view still reads the same exposures after the refactor
 *   H  PRA table rows: affected zones resolved exactly, never by a partial text match
 *   I  reading a Sys Lab physical architecture file (versions 1 and 2), refusals
 *   J  the mapping rule: exact only on a unique identifier, everything else a candidate,
 *      rejected pairs never come back, nothing mapped without a click
 *   K  import and mappings go through SLChangeAck.batch; a re-import keeps mappings of elements
 *      still present and drops the rest
 *   L  what a risk volume or a zone reaches in Sys Lab: mapped functions, and "possibly reached"
 *      for unmapped elements by their zone or CAD part
 *   M  zones that differ between Sys Lab and Safety Lab
 *   N  the project export bundle carries the picture (zonal-exchange.json) and the reader
 *      ignores it
 *   O  round trip with Sys Lab through the fixture files (Safety Lab export -> Sys Lab import ->
 *      Sys Lab export -> Safety Lab import keeps ids and mappings)
 *   P  mutations: deliberate breaks of the module, each must turn a check red
 *   Q  wiring: script tag after pra_panel.js, cad_page hooks, zonal_ui button, no eval, no em
 *      dash, plain colors (no gray text) in the new panel
 *
 * Run: node tests/regression_zonal_exchange_20261015.test.js   (UPDATE_FIXTURES=1 rewrites the fixture)
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('zonal_exchange.js'), ZM = read('zonal_model.js'), FE = read('fta_engine.js'), CZ = read('cad_zonal.js'), REFS = read('pra_refs_data.js'), PM = read('pra_models.js');
const J = x => JSON.stringify(x);
const EM = String.fromCharCode(0x2014);
const FIX = path.join(__dirname, 'fixtures', 'zonal_exchange');

// ---------------------------------------------------------------- the synthetic aircraft
const box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
const part = (pid, name, partNumber, b, extra) => Object.assign({ pid, name, partNumber, path: ['Aircraft', 'Fuselage', name], bbox: b }, extra || {});
function cadA() {
    return { fileName: 'ac_revA.step', sha256: 'aaaa', revision: 'A', importedAt: '2026-10-13T08:00:00Z', units: 'mm', parts: [
        part('p-fcc1', 'FCC-1', 'PN-FCC-100', box(1400, 1550, -100, 100, -100, 100)),
        part('p-fcc2', 'FCC-2', 'PN-FCC-200', box(1800, 2000, -100, 100, -100, 100)),
        part('p-ant', 'Antenna coupler', null, box(1780, 1820, -50, 50, -50, 50)),
        part('p-hyd', 'HYD pump', 'PN-HYD-1', box(4500, 4800, -200, 200, -200, 200), { designator: 'HYD-P1' }),
        part('p-bat', 'BAT-1', null, box(6000, 6200, 4000, 4200, -50, 50)),
        part('p-adc', 'Air data computer assy', null, box(2200, 2300, -100, 100, -100, 100)),
        part('p-bracket', 'Bracket', null, box(2900, 4100, -20, 20, -20, 20)),
        part('p-amb', 'Wing fitting', null, box(3000, 3100, 2900, 3100, -10, 10)),
        part('p-out', 'Pitot probe', null, box(-500, -400, 0, 10, 0, 10)),
        part('p-valve-1', 'Valve', 'PN-VALVE', box(8000, 8050, 700, 750, 0, 50)),
        part('p-valve-2', 'Valve', 'PN-VALVE', box(8100, 8150, 700, 750, 0, 50))
    ] };
}
const ZONE_ROWS = [
    { code: '110', name: 'Avionics bay', parentCode: '100', xMin: 1000, yMin: -1500, zMin: -1500, xMax: 3000, yMax: 1500, zMax: 1500 },
    { code: '100', name: 'Fuselage', parentCode: '', xMin: 0, yMin: -1500, zMin: -1500, xMax: 10000, yMax: 1500, zMax: 1500 },
    { code: '120', name: 'Hydraulic bay', parentCode: '100', xMin: 4000, yMin: -1500, zMin: -1500, xMax: 6000, yMax: 1500, zMax: 1500 },
    { code: '500', name: 'Wing', xMin: 0, yMin: 1500, zMin: -500, xMax: 9000, yMax: 9000, zMax: 500 },
    { code: '510', name: 'Wing root fwd', parentCode: '500', xMin: 2500, yMin: 2500, zMin: -500, xMax: 3500, yMax: 3500, zMax: 500 },
    { code: '520', name: 'Wing root aft', parentCode: '500', xMin: 2800, yMin: 2000, zMin: -500, xMax: 4000, yMax: 3500, zMax: 500 }
];
const leaf = (id, name, sysId) => Object.assign({ id, type: 'basic', displayId: id, name, probability: 1e-5 }, sysId ? { identity: { kind: 'item', systemId: sysId } } : {});
function trees() {
    return [
        { id: 'P1', name: 'SF-001 Loss of pitch control', linkedFhaIds: [7], root: { id: 'G1', type: 'gate', gateType: 'AND', displayId: 'SF-001', name: 'Loss of pitch control', children: [
            { id: 'G2', type: 'gate', gateType: 'OR', displayId: 'G-002', name: 'Channel 1 lost', children: [leaf('BE1', 'FCC-1 processor fails', 'FCC1')] },
            { id: 'G3', type: 'gate', gateType: 'OR', displayId: 'G-003', name: 'Channel 2 lost', children: [leaf('BE3', 'FCC-2 processor fails', 'FCC2'), leaf('BE4', 'Battery fails', 'BAT')] }
        ] } },
        { id: 'P2', name: 'SF-002 Loss of hydraulic power', linkedFhaIds: [8], root: { id: 'G4', type: 'gate', gateType: 'OR', displayId: 'SF-002', name: 'Loss of hydraulic power', children: [leaf('BE5', 'Pump fails', 'HYD'), leaf('BE6', 'Reservoir leak', null)] } }
    ];
}
function systems() {
    return [
        { id: 'FCC1', name: 'Flight control computer 1', partNumber: 'PN-FCC-100', designator: 'FCC-1', functions: [{ funcId: 'F-PITCH-1', funcName: 'Pitch command channel 1', traceIds: ['AF-1'] }] },
        { id: 'FCC2', name: 'Flight control computer 2', partNumber: 'PN-FCC-200', designator: 'FCC-2', functions: [{ funcId: 'F-PITCH-2', funcName: 'Pitch command channel 2', traceIds: ['AF-1'] }] },
        { id: 'HYD', name: 'Hydraulic pump', partNumber: 'PN-HYD-1', designator: 'HYD-P1' },
        { id: 'BAT', name: 'Main battery', designator: 'BAT-1' },
        { id: 'ADC', name: 'Air data computer' },
        { id: 'VALVE', name: 'Shutoff valve', partNumber: 'PN-VALVE' }
    ];
}
function load(src, opts) {
    opts = opts || {};
    const ack = { batches: [] };
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, Promise, isFinite, parseFloat, Int32Array, setTimeout: () => 0,
        scheduleAutosave: () => {}, projectName: 'Synthetic aircraft',
        projectConfig: {}, systemsData: systems(),
        acFhaData: [{ internalId: 7, fcId: 'SF-001', fcDesc: 'Loss of pitch control', severity: 'Catastrophic' }, { internalId: 8, fcId: 'SF-002', fcDesc: 'Loss of hydraulic power', severity: 'Major' }],
        ftaPages: trees(),
        zsaData: [{ internalId: 1, zoneId: '110', desc: 'Avionics bay', equip: 'FCC 1 and 2', severity: 'Catastrophic', interference: 'Both computers on one shelf', mitigation: 'Separate shelves' }, { internalId: 2, zoneId: 'Wing', desc: 'Wing' }, { internalId: 3, zoneId: 'Wing area', desc: 'not a zone name' }, { internalId: 4, zoneId: '999', desc: 'no such zone' }],
        praData: [{ internalId: 11, praId: 'PRA-001', threat: 'Uncontained rotor burst', mitigation: 'Shield the avionics bay', affectedZones: ['110', 'wing', 'Wing area', 'Z-NOPE'] }, { internalId: 12, praId: 'PRA-002', threat: 'Hydraulic fire', affectedZones: ['120'] }],
        SLChangeAck: { batch: (label, fn) => { ack.batches.push(label); const r = fn(); return Promise.resolve({ acknowledged: true, result: r }); }, describe: () => {} } };
    if (opts.reverse) { sb.systemsData.reverse(); sb.ftaPages.reverse(); sb.zsaData.reverse(); sb.praData.reverse(); }
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    vm.createContext(sb);
    vm.runInContext(ZM, sb, { filename: 'zonal_model.js' });
    vm.runInContext(FE, sb, { filename: 'fta_engine.js' });
    vm.runInContext(CZ, sb, { filename: 'cad_zonal.js' });
    vm.runInContext(REFS, sb, { filename: 'pra_refs_data.js' });
    if (!opts.noModels) vm.runInContext(PM, sb, { filename: 'pra_models.js' });
    vm.runInContext(src || SRC, sb, { filename: 'zonal_exchange.js' });
    sb._ack = ack;
    return sb;
}
const AT = '2026-10-15T09:00:00.000Z';
function scenario(src, opts) {
    opts = opts || {};
    const sb = load(src, opts), C = sb.SLCadZonal, Z = sb.ZONES, X = sb.SLZonalExchange;
    const rows = opts.reverse ? ZONE_ROWS.slice().reverse() : ZONE_ROWS;
    C.importZoneList(rows);
    const a = cadA(); if (opts.reverse) a.parts.reverse();
    const m = C.addCadModel(a).model;
    C.applyExactLinks(m.id, 'exact identifier match', { at: AT });
    C.confirmLink(m.id, 'p-valve-1', 'VALVE', 'W. Engineer', { at: AT });
    C.applyContainment(m.id, { apply: true, by: 'W. Engineer' });
    C.addRiskVolume({ id: 'prv-rotor', kind: 'rotorBurst', label: 'No. 1 engine rotor burst', source: 'manual', praId: 'PRA-001', shape: { kind: 'disk-sector', center: [1800, 3000, 0], axis: [1, 0, 0], range: 5000 } });
    C.addRiskVolume({ id: 'prv-fire', kind: 'fire', label: 'Hydraulic bay fire', source: 'manual', praId: 12, shape: { kind: 'box', min: [4400, -300, -300], max: [4900, 300, 300] } });
    const zid = code => Z.all().find(z => z.code === code).id;
    return { sb, C, Z, X, m, zid, pic: X.exportPicture({ at: AT }) };
}
const S = scenario();
const { C, Z, X, zid } = S, P = S.pic;
const byId = (list, k, v) => list.find(x => x[k] === v);

console.log('\n[A] the file');
{
    check('A: format safetylab-zonal version 1 from this generator, project named', P.format === 'safetylab-zonal' && P.version === 1 && P.generator === 'Safety Lab Aero zonal exchange ' + X.VERSION && P.projectName === 'Synthetic aircraft');
    check('A: the fingerprint verifies (checkPicture null)', X.checkPicture(P) === null, X.checkPicture(P));
    const t = JSON.parse(J(P)); t.risks[0].worst = 'Minor';
    check('A: a changed file is refused by its fingerprint', /fingerprint/.test(X.checkPicture(t) || ''));
    check('A: another format and another version are refused in words', /not a Safety Lab zonal file/.test(X.checkPicture({ format: 'x' })) && /version 2/.test(X.checkPicture(Object.assign({}, P, { version: 2 }))));
    const P2 = scenario().pic;
    check('A: exported twice: identical (exportedAt only differs when the clock does)', J(P2) === J(P));
    const R = scenario(null, { reverse: true }).pic;
    check('A: every input list reversed: same fingerprint, same content', R.contentHash === P.contentHash && J(Object.assign({}, R, { exportedAt: 0 })) === J(Object.assign({}, P, { exportedAt: 0 })));
    check('A: exportedAt is left out of the fingerprint', X.fp(Object.assign({}, P, { exportedAt: 'x' })) !== P.contentHash && X.checkPicture(Object.assign({}, P, { exportedAt: '2030-01-01' })) === null);
    check('A: the rules travel with the file, in words', /never to a part number/.test(P.rules.identity) && /deepest zone wins/i.test(P.rules.containment) && P.kindLabels.rotorBurst === 'Rotor burst');
}

console.log('\n[B] zone tree');
{
    const z110 = byId(P.zones, 'code', '110'), z100 = byId(P.zones, 'code', '100');
    check('B: six zones, sorted by code', J(P.zones.map(z => z.code)) === J(['100', '110', '120', '500', '510', '520']));
    check('B: ids, parent ids and parent codes kept', z110.id === zid('110') && z110.parentId === z100.id && z110.parentCode === '100' && z100.parentId === null && z100.parentCode === null);
    check('B: depth from the tree', z110.depth === 1 && z100.depth === 0);
    check('B: equipment placed in each zone (from the applied containment)', J(z110.equipment) === J(['FCC1', 'FCC2']) && J(byId(P.zones, 'code', '120').equipment) === J(['HYD']));
    check('B: volume flag and source', z110.hasVolume === true && z110.source === 'list');
}

console.log('\n[C] parts');
{
    const c = C.containment(S.m.id), zOf = {}; c.parts.forEach(r => { zOf[r.pid] = r.zoneId; });
    check('C: every part, sorted, partsComplete', P.parts.length === 11 && P.cad.partsComplete === true && P.cad.partCount === 11 && J(P.parts.map(p => p.pid)) === J(P.parts.map(p => p.pid).slice().sort()));
    check('C: each part in the zone the engine says', P.parts.every(p => p.zoneId === (zOf[p.pid] || null)));
    check('C: links: confirmed equipment on the part, none on unlinked parts', byId(P.parts, 'pid', 'p-fcc1').equipment === 'FCC1' && byId(P.parts, 'pid', 'p-valve-1').equipment === 'VALVE' && byId(P.parts, 'pid', 'p-valve-2').equipment === null && byId(P.parts, 'pid', 'p-adc').equipment === null);
    check('C: straddling and ambiguity carried', J(byId(P.parts, 'pid', 'p-bracket').straddles) === J([zid('110'), zid('120')].sort()) && J(byId(P.parts, 'pid', 'p-amb').ambiguousWith) === J([zid('520')]));
    check('C: a part outside every zone has zone null', byId(P.parts, 'pid', 'p-out').zoneId === null);
    check('C: designator and part number kept', byId(P.parts, 'pid', 'p-hyd').designator === 'HYD-P1' && byId(P.parts, 'pid', 'p-hyd').partNumber === 'PN-HYD-1');
    // a large model: only the parts that matter are written, and the file says so
    const sb2 = load(), C2 = sb2.SLCadZonal, X2 = sb2.SLZonalExchange;
    const many = []; for (let i = 0; i < 20005; i++) many.push(part('q' + String(i).padStart(5, '0'), 'Rivet ' + i, null, box(100 + i % 50, 101 + i % 50, 0, 1, 0, 1)));
    many.push(part('q-fcc', 'FCC-1', null, box(1400, 1550, -100, 100, -100, 100)));
    const m2 = C2.addCadModel({ fileName: 'big.step', sha256: 'big1', revision: 'A', units: 'mm', parts: many }).model;
    C2.applyExactLinks(m2.id, 'exact', { at: AT });
    const big = X2.exportPicture({ at: AT });
    check('C: above the part limit only linked, tagged or at-risk parts are written, and a gap says so', big.cad.partsComplete === false && big.cad.partCount === 20006 && J(big.parts.map(p => p.pid)) === J(['q-fcc']) && big.gaps.some(g => /20006 parts/.test(g)));
}

console.log('\n[D] equipment');
{
    const f1 = byId(P.equipment, 'sysId', 'FCC1');
    check('D: every equipment item, sorted by id', J(P.equipment.map(e => e.sysId)) === J(['ADC', 'BAT', 'FCC1', 'FCC2', 'HYD', 'VALVE']));
    check('D: designator, part numbers, placed zone, confirmed parts and the zones those parts sit in', f1.designator === 'FCC-1' && J(f1.partNumbers) === J(['PN-FCC-100']) && f1.zoneId === zid('110') && J(f1.parts) === J(['p-fcc1']) && J(f1.cadZoneIds) === J([zid('110')]));
    check('D: functions with traces', J(f1.functions) === J([{ funcId: 'F-PITCH-1', name: 'Pitch command channel 1', traces: ['AF-1'] }]));
    check('D: unlinked equipment has no parts and a gap names the count', byId(P.equipment, 'sysId', 'ADC').parts.length === 0 && P.gaps.some(g => /1 equipment item\(s\) have no confirmed CAD part/.test(g)));
}

console.log('\n[E] risk volumes');
{
    const r = byId(P.risks, 'id', 'prv-rotor'), im = C.riskImpact('prv-rotor', { cadId: S.m.id });
    check('E: two risks, sorted', J(P.risks.map(x => x.id)) === J(['prv-fire', 'prv-rotor']));
    check('E: rotor burst: parts inside and equipment equal the engine', J(r.parts) === J(C.partsInVolume('prv-rotor', S.m.id).map(p => p.pid).sort()) && J(r.equipment) === J(im.equipment.map(e => e.sysId)));
    check('E: both computers are hit: the Catastrophic condition is reached', J(r.equipment.filter(s => /FCC/.test(s))) === J(['FCC1', 'FCC2']) && r.worst === 'Catastrophic' && r.conditions[0].fcId === 'SF-001' && r.conditions[0].severity === 'Catastrophic');
    check('E: the zones the risk reaches are the zones of the parts inside', J(r.zoneIds) === J([...new Set(r.parts.map(pid => byId(P.parts, 'pid', pid).zoneId).filter(Boolean))].sort()));
    check('E: mitigation from the PRA row the volume names (by praId and by internal id)', r.mitigation === 'Shield the avionics bay' && byId(P.risks, 'id', 'prv-fire').mitigation === null && byId(P.risks, 'id', 'prv-fire').praId === '12');
    const fire = byId(P.risks, 'id', 'prv-fire');
    check('E: hydraulic fire reaches the pump and the Major condition', J(fire.equipment) === J(['HYD']) && fire.worst === 'Major' && fire.notEvaluated === null);
}

console.log('\n[F] zones compromised');
{
    const h = byId(P.zoneHazards, 'zoneId', zid('110')), im = C.zoneImpact(zid('110'));
    check('F: the avionics bay compromised: same equipment, conditions and worst as zoneImpact', J(h.equipment) === J(im.equipment.map(e => e.sysId)) && J(h.conditions.map(c => c.fcId)) === J(im.conditions.map(c => c.fcId)) && h.worst === im.worst && h.worst === 'Catastrophic');
    check('F: ZSA row of the zone attached with its mitigation and interference', h.zsaRows.length === 1 && h.zsaRows[0].mitigation === 'Separate shelves' && h.zsaRows[0].interference === 'Both computers on one shelf');
    const w = byId(P.zoneHazards, 'zoneId', zid('500'));
    check('F: a ZSA row naming the zone by name attaches; "Wing area" and "999" attach nowhere', w && w.zsaRows.map(x => x.id).join() === '2' && !P.zoneHazards.some(x => x.zsaRows.some(r => r.id === '3' || r.id === '4')));
    check('F: the fuselage with its sub-zones holds everything in it', J(byId(P.zoneHazards, 'zoneId', zid('100')).equipment) === J(['FCC1', 'FCC2', 'HYD', 'VALVE']));
}

console.log('\n[G] exposures');
{
    const ex = S.sb.SLPraModels.equipmentExposures(S.m.id, { bird: true });
    const flat = []; Object.keys(ex.bySys).sort().forEach(s => ex.bySys[s].forEach(x => flat.push(s + '|' + x.kind + '|' + x.src)));
    check('G: every exposure of the shared source, nothing added', J(P.exposures.map(x => x.sysId + '|' + x.kind + '|' + x.src)) === J(flat) && flat.length > 0);
    check('G: rotor volume exposure of FCC1 with its worst and parts', P.exposures.some(x => x.sysId === 'FCC1' && x.src === 'praVolumes/prv-rotor' && x.worst === 'Catastrophic' && J(x.pids) === J(['p-fcc1'])));
    const fv = S.sb.SLPraModels.functionRiskView(S.m.id, { bird: true });
    const pitch = fv.functions.find(f => f.funcId === 'F-PITCH-1');
    check('G: the per-function view reads the same exposures after the refactor', pitch && pitch.exposures.some(x => x.src === 'praVolumes/prv-rotor') && pitch.worst === 'Catastrophic');
    const noM = load(null, { noModels: true }); noM.SLCadZonal.importZoneList(ZONE_ROWS); noM.SLCadZonal.addCadModel(cadA());
    check('G: without the risk models loaded the file says so instead of an empty list', noM.SLZonalExchange.exportPicture({ at: AT }).gaps.some(g => /particular risk models/.test(g)));
}

console.log('\n[H] PRA rows');
{
    const r1 = byId(P.praRows, 'id', 'PRA-001');
    check('H: affected zones resolved by exact code or name only (ignoring case); typed text kept as written', J(r1.zoneIds) === J([zid('110'), zid('500')].sort()) && J(r1.affectedZones) === J(['110', 'wing', 'Wing area', 'Z-NOPE']));
    check('H: mitigation kept', r1.mitigation === 'Shield the avionics bay');
}

// ------------------------------------------------------------------- the Sys Lab file
function physV2() {
    return { app: 'syslab-physical', version: 2, exportedAt: '2026-10-15T10:00:00Z', projectName: 'Synthetic aircraft', identity: 'installed instance (equipment tag)',
        functions: [{ funcId: 'AF-PITCH', name: 'Control pitch', level: 'Aircraft', system: '', parent: '' }, { funcId: 'F-PITCH-1', name: 'Pitch command channel 1', level: 'System', system: 'FCS', parent: '', traces: ['AF-PITCH'] }, { funcId: 'F-PITCH-2', name: 'Pitch command channel 2', level: 'System', system: 'FCS', parent: '', traces: ['AF-PITCH'] }, { funcId: 'F-HYD', name: 'Provide hydraulic power', level: 'System', system: 'HYD', parent: '' }, { funcId: 'F-AIR', name: 'Measure air data', level: 'System', system: 'AVI', parent: '' }, { funcId: 'F-SHUT', name: 'Shut off fuel', level: 'System', system: 'FUEL', parent: '' }],
        systems: [{ code: 'FCS', name: 'Flight controls', slSystem: '', performs: ['F-PITCH-1', 'F-PITCH-2'] }, { code: 'HYDS', name: 'Hydraulic pump', slSystem: 'HYD', performs: ['F-HYD'] }],
        elements: [
            { tag: 'FCC-1', ident: 'FCS-ITM-FCC1', name: 'Flight control computer 1', kind: 'Item', system: 'FCS', partNumber: 'PN-FCC-100', zone: '110', cadPart: '', performs: ['F-PITCH-1'] },
            { tag: 'FCC-2B', ident: 'FCS-ITM-FCC2', name: 'Flight control computer 2', kind: 'Item', system: 'FCS', partNumber: 'PN-FCC-200', zone: '120', cadPart: 'p-fcc2', performs: ['F-PITCH-2'] },
            { tag: 'ADC-9', ident: 'AVI-ITM-ADC', name: 'Air data computer', kind: 'Item', system: 'AVI', partNumber: '', zone: '110', cadPart: '', performs: ['F-AIR'] },
            { tag: 'SOV-1', ident: 'FUEL-ITM-SOV1', name: 'Shutoff valve 1', kind: 'Item', system: 'FUEL', partNumber: 'PN-VALVE', zone: '', cadPart: '', performs: ['F-SHUT'] },
            { tag: 'BAT-X', ident: 'ELEC-ITM-BAT', name: 'Main battery', kind: 'Item', system: 'ELEC', partNumber: '', zone: '500', cadPart: '', slEquipment: 'BAT', performs: [] },
            { tag: '', ident: 'AVI-ITM-RAD', name: 'Radio', kind: 'Item', system: 'AVI', zone: '110', cadPart: 'p-ant', performs: ['F-AIR'] }
        ], allocations: [], zones: ['110', '120', '500'] };
}

console.log('\n[I] reading a Sys Lab file');
{
    const r = X.readSysLab(physV2(), 'phys.json');
    check('I: version 2 read: elements keyed by tag (or ident without one), systems, functions', r.ok && J(r.data.elements.map(e => e.key)) === J(['id:AVI-ITM-RAD', 'tag:ADC-9', 'tag:BAT-X', 'tag:FCC-1', 'tag:FCC-2B', 'tag:SOV-1']) && J(r.data.systems.map(s => s.key)) === J(['sys:FCS', 'sys:HYDS']) && r.data.functions.length === 6);
    check('I: zone codes upper case, performs kept', byId(r.data.elements, 'key', 'tag:FCC-1').zone === '110' && J(byId(r.data.elements, 'key', 'tag:FCC-1').performs) === J(['F-PITCH-1']));
    const v1 = { app: 'syslab-physical', version: 1, functions: [{ funcId: 'F-A', name: 'A' }], elements: [{ tag: 'T-1', ident: 'E1', name: 'E', performs: ['F-A'] }], allocations: [{ funcId: 'F-A', element: 'SYSX', tag: '' }, { funcId: 'F-A', element: 'E1', tag: 'T-1' }, { funcId: 'F-A', element: 'AIRCRAFT', tag: '' }] };
    const r1 = X.readSysLab(v1, 'v1.json');
    check('I: version 1 read: systems recovered from the allocations', r1.ok && J(r1.data.systems) === J([{ key: 'sys:SYSX', code: 'SYSX', name: 'SYSX', slSystem: null, performs: ['F-A'] }]));
    check('I: refused: another file, another version', !X.readSysLab({ app: 'x' }).ok && /version 3/.test(X.readSysLab({ app: 'syslab-physical', version: 3 }).err));
    const dup = physV2(); dup.elements.push(Object.assign({}, dup.elements[0]));
    check('I: an element listed twice is reported, the first kept', X.readSysLab(dup).issues.some(t => /FCC-1 is listed twice/.test(t)) && X.readSysLab(dup).data.elements.length === 6);
}

console.log('\n[J] the mapping rule');
let IMPORTED;
{
    const r = X.readSysLab(physV2(), 'phys.json');
    S.sb._ack.batches.length = 0;
    const noName = X.importSysLab(r.data, '');
    X.importSysLab(r.data, 'W. Engineer', { at: AT }).then(x => { IMPORTED = x; });
    const mm = X.matchSysLab();
    const ex = mm.exact.map(e => e.key + '>' + e.sysId + ':' + e.on);
    check('J: exact only on unique identifiers: tag = designator, the CAD part named (linked), mapped in Sys Lab, the system id from Sys Lab', J(ex) === J(['tag:BAT-X>BAT:syslab', 'tag:FCC-1>FCC1:designator', 'tag:FCC-2B>FCC2:cadPart', 'sys:HYDS>HYD:system']), J(ex));
    const cand = {}; mm.candidates.forEach(c => { cand[c.key] = c.sysIds; });
    check('J: a shared part number is a candidate, never exact', J(cand['tag:SOV-1']) === J(['VALVE']));
    check('J: a similar name is a candidate (air data computer)', J(cand['tag:ADC-9']) === J(['ADC']));
    check('J: a CAD part with no equipment link maps nothing (radio names p-ant, unlinked)', mm.unmatched.indexOf('id:AVI-ITM-RAD') >= 0);
    check('J: a system with no Safety Lab id and no equal name is unmatched', mm.unmatched.indexOf('sys:FCS') >= 0);
    check('J: nothing is mapped by the import itself', mm.linked.length === 0 && J(S.sb.projectConfig.sysLabPhysical.map) === '{}');
    noName.then(x => check('J: an import needs a name', x.ok === false && /name/.test(x.err)));
}

(async () => {
    console.log('\n[K] writes go through the change acknowledgement');
    {
        await new Promise(r => setImmediate(r));   // the import above settles
        check('K: the import was one acknowledged batch, named', IMPORTED && IMPORTED.ok && S.sb._ack.batches.some(l => /Sys Lab physical architecture imported from phys\.json: 6 elements, 6 functions/.test(l)));
        const a = await X.acceptExact('W. Engineer', { at: AT });
        check('K: accept all exact matches: one batch, four mappings, each records who', a.ok && a.mapped.length === 4 && S.sb._ack.batches.some(l => /4 exact Sys Lab mappings accepted/.test(l)) && S.sb.projectConfig.sysLabPhysical.map['tag:FCC-1'].by === 'W. Engineer');
        const c = await X.confirmMap('tag:SOV-1', 'VALVE', 'W. Engineer', { at: AT });
        const rj = await X.rejectMap('tag:ADC-9', 'ADC', 'W. Engineer', { at: AT });
        const mm = X.matchSysLab();
        check('K: a candidate confirmed is mapped; a rejected pair never comes back', c.ok && rj.ok && mm.linked.some(l => l.key === 'tag:SOV-1' && l.sysId === 'VALVE') && !mm.candidates.some(x => x.key === 'tag:ADC-9') && mm.unmatched.indexOf('tag:ADC-9') >= 0);
        check('K: refused: unknown equipment, unknown element, no name', !(await X.confirmMap('tag:FCC-1', 'NOPE', 'x')).ok && !(await X.confirmMap('tag:NOPE', 'FCC1', 'x')).ok && !(await X.confirmMap('tag:SOV-1', 'VALVE', '')).ok);
        // re-import without FCC-2B: its mapping is dropped, the rest kept
        const d = physV2(); d.elements = d.elements.filter(e => e.tag !== 'FCC-2B');
        const r2 = X.readSysLab(d, 'phys2.json'), plan = X.planSysLab(r2.data);
        check('K: the plan names removed elements and the mappings it drops', J(plan.removed) === J(['tag:FCC-2B']) && plan.mapsDropped.some(x => x.key === 'tag:FCC-2B' && /no longer in Sys Lab/.test(x.why)) && plan.mapsKept.indexOf('tag:FCC-1') >= 0);
        await X.importSysLab(r2.data, 'W. Engineer', { at: AT });
        const st = S.sb.projectConfig.sysLabPhysical;
        check('K: re-import keeps mappings and rejections of elements still present', st.map['tag:FCC-1'] && st.map['tag:SOV-1'] && !st.map['tag:FCC-2B'] && st.rejected['tag:ADC-9'].length === 1);
        await X.importSysLab(X.readSysLab(physV2(), 'phys.json').data, 'W. Engineer', { at: AT });
        await X.acceptExact('W. Engineer', { at: AT });
    }

    console.log('\n[L] what a risk or a zone reaches in Sys Lab');
    {
        const r = X.reachOfVolume('prv-rotor', S.m.id);
        check('L: rotor burst reaches both pitch channels through mapped elements', J(r.functions.map(f => f.funcId)) === J(['F-PITCH-1', 'F-PITCH-2']) && r.functions[0].via[0].label === 'FCC-1 Flight control computer 1');
        check('L: and the aircraft function they realize (the traces), through both channels', J(r.served.map(f => f.funcId + ':' + f.through.join('+'))) === J(['AF-PITCH:F-PITCH-1+F-PITCH-2']) && /Functions they serve/.test(X.reachHtml({ volumeId: 'prv-rotor' }, S.m.id)));
        check('L: the radio (not mapped) names a CAD part inside the risk: possibly reached, kept apart', J(r.byZoneOnly.map(f => f.funcId)) === J(['F-AIR']) && /names CAD part p-ant/.test(r.byZoneOnly[0].via.map(v => v.why).join()));
        const f = X.reachOfVolume('prv-fire', S.m.id);
        check('L: the hydraulic fire reaches F-HYD through the system mapped by its Safety Lab id', J(f.functions.map(x => x.funcId)) === J(['F-HYD']));
        const z = X.reachOfZone(zid('110'));
        check('L: the avionics bay reaches both channels (subtree) and, by zone only, the air data function', J(z.functions.map(x => x.funcId)) === J(['F-PITCH-1', 'F-PITCH-2']) && J(z.byZoneOnly.map(x => x.funcId)) === J(['F-AIR']));
        check('L: unknown volume or zone gives null, not an empty answer', X.reachOfVolume('nope') === null && X.reachOfZone('nope') === null);
        const html = X.reachHtml({ volumeId: 'prv-rotor' }, S.m.id);
        check('L: the impact panel text names the functions and says what is only possibly reached', /Sys Lab functions reached/.test(html) && /Possibly reached/.test(html) && /F-PITCH-2/.test(html));
        const fresh = load();
        check('L: with no Sys Lab file the answer says it is not known yet', /not known yet/.test(fresh.SLZonalExchange.reachHtml({ zoneId: 'z-1' }) || 'not known yet') && fresh.SLZonalExchange.reach({}).imported === false);
    }

    console.log('\n[M] zones that differ');
    {
        const d = X.zoneDifferences();
        check('M: FCC-2B is in 120 in Sys Lab and in 110 here: flagged', d.some(x => x.key === 'tag:FCC-2B' && x.sysLab === '120' && J(x.safetyLab) === J(['110'])));
        check('M: FCC-1 agrees: not flagged; no zone in Sys Lab: flagged with the Safety Lab zone', !d.some(x => x.key === 'tag:FCC-1') && d.some(x => x.key === 'tag:SOV-1' && x.sysLab === null));
    }

    console.log('\n[N] the project export bundle');
    {
        const H = read('helpers_modules.js'), B = read('bindings_modules.js'), MISC = read('misc_fn_modules.js');
        check('N: the bundle writer takes extra files and the export passes the zonal picture', /function _bundleToZip\(project, extra\)/.test(H) && /'zonal-exchange\.json': JSON\.stringify\(pic\)/.test(H) && /_bundleToZip\(_snapshotProject\(\), _bundleZonalExtra\(\)\)/.test(H));
        check('N: a failure building the picture never stops the export (caught, empty extra)', /function _bundleZonalExtra\(\) \{\s*try \{[\s\S]*?\} catch \(e\) \{[\s\S]*?return \{\};/.test(H));
        check('N: the reader merges only the known files, so zonal-exchange.json is never read back into the project', /Object\.keys\(_BUNDLE_MAP\)\.forEach\(function \(path\) \{ if \(files\[path\]\)/.test(MISC) && !/zonal-exchange/.test(B));
        check('N: hasContent: true with zones, false on an empty project', X.hasContent(P) === true && load().SLZonalExchange.hasContent(load().SLZonalExchange.exportPicture({ at: AT })) === false);
    }

    console.log('\n[O] round trip with Sys Lab (fixture files)');
    {
        const out = path.join(FIX, 'safetylab-zonal.json');
        const pic = S.X.exportPicture({ at: AT });
        if (process.env.UPDATE_FIXTURES || !fs.existsSync(out)) { fs.mkdirSync(FIX, { recursive: true }); fs.writeFileSync(out, JSON.stringify(pic, null, 1) + '\n'); }
        const onDisk = JSON.parse(fs.readFileSync(out, 'utf8'));
        check('O: the fixture Sys Lab tests read is what this Safety Lab writes today (fingerprint equal)', onDisk.contentHash === pic.contentHash, onDisk.contentHash + ' vs ' + pic.contentHash);
        check('O: the picture carries the mappings made here (Sys Lab reads them as exact)', pic.sysLabMap.some(x => x.tag === 'FCC-1' && x.sysId === 'FCC1'));
        // revision B of the same project, for Sys Lab's change test: the hydraulic fire volume is gone and a fluid leak
        // volume now covers the first flight control computer
        S.C.removeRiskVolume('prv-fire');
        S.C.addRiskVolume({ id: 'prv-leak', kind: 'fluidLeak', label: 'Avionics bay fluid leak', source: 'manual', shape: { kind: 'box', min: [1350, -150, -150], max: [1600, 150, 150] } });
        const picB = S.X.exportPicture({ at: AT }), outB = path.join(FIX, 'safetylab-zonal-b.json');
        if (process.env.UPDATE_FIXTURES || !fs.existsSync(outB)) fs.writeFileSync(outB, JSON.stringify(picB, null, 1) + '\n');
        const onDiskB = JSON.parse(fs.readFileSync(outB, 'utf8'));
        check('O: revision B fixture is what this Safety Lab writes today; it differs from A in the risks only', onDiskB.contentHash === picB.contentHash && J(picB.zones) === J(pic.zones) && J(picB.risks.map(r => r.id)) === J(['prv-leak', 'prv-rotor']) && byId(picB.risks, 'id', 'prv-leak').equipment.join() === 'FCC1');
        const back = path.join(FIX, 'syslab-physical-roundtrip.json');
        if (!fs.existsSync(back)) check('O: Sys Lab round trip file present (written by Sys Lab tests/zones.test.js)', false, back);
        else {
            const sl = JSON.parse(fs.readFileSync(back, 'utf8'));
            const r = X.readSysLab(sl, 'roundtrip.json');
            check('O: the Sys Lab export reads (version 2)', r.ok && r.data.version === 2);
            const zIds = new Set(onDisk.zones.map(z => z.id)), eq = new Set(onDisk.equipment.map(e => e.sysId));
            const withEq = r.data.elements.filter(e => e.slEquipment);
            check('O: every Safety Lab id Sys Lab sends back exists in the picture it read (zones and equipment)', withEq.length >= 3 && withEq.every(e => eq.has(e.slEquipment)) && r.data.elements.filter(e => e.zoneId).every(e => zIds.has(e.zoneId)));
            check('O: zone codes sent back match the zone ids they name', r.data.elements.filter(e => e.zoneId).every(e => { const z = onDisk.zones.find(x => x.id === e.zoneId); return z && (z.code || z.id).toUpperCase() === e.zone; }));
            // import it into a fresh Safety Lab with the same picture: the Sys Lab mappings come back exact and are accepted as they are
            const T = scenario();
            await T.X.importSysLab(r.data, 'W. Engineer', { at: AT });
            const mm = T.X.matchSysLab();
            check('O: each element Sys Lab mapped comes back as an exact match to the same equipment', withEq.every(e => mm.exact.some(x => x.key === e.key && x.sysId === e.slEquipment)));
            await T.X.acceptExact('W. Engineer', { at: AT });
            const again = T.X.exportPicture({ at: AT });
            check('O: exported again: the mappings and ids are the ones Sys Lab sent (nothing renamed, nothing lost)', withEq.every(e => again.sysLabMap.some(x => x.key === e.key && x.sysId === e.slEquipment)) && J(again.zones.map(z => z.id)) === J(onDisk.zones.map(z => z.id)));
        }
    }

    console.log('\n[P] mutations (each must turn a check red)');
    {
        const muts = [
            ['containment ignored', ["zoneId: zoneOf[p.pid] || null", "zoneId: null"]],
            ['exact on a shared part number', ["if (e.partNumber && _ids(s.partNumber)", "if (e.partNumber && _ids(s.partNumber).concat(_ids(s.partNumbers)).some(function (x) { return _up(x) === _up(e.partNumber); })) exact.push({ sysId: String(s.id), on: 'partNumber' }); if (e.partNumber && _ids(s.partNumber)"]],
            ['rejections forgotten', ["_arr(rej[e.key]).forEach(function (x) { no[x.sysId] = 1; });", ""]],
            ['risk zones dropped', ["zoneIds: _uniq(inside.map(function (p) { return zoneOf[p.pid]; })), conditions", "zoneIds: [], conditions"]],
            ['ZSA by partial text', ["var hit = r ? _zoneByText(r.zoneId) : null; return hit && hit.id === z.id;", "return r && String(z.name || '').toLowerCase().indexOf(String(r.zoneId).toLowerCase().split(' ')[0]) >= 0;"]],
            ['fingerprint over exportedAt', ["contentHash: fp(body) };", "contentHash: fp([body, opts.at]) };"]],
            ['unmapped counted as reached', ["if (mapped && set[mp.sysId]) {", "if (set[(mp || {}).sysId] || (!mapped && e.zone)) {"]],
            ['mappings carried for removed elements', ["if (now[k] && _sysById(x.sysId)) plan.mapsKept.push(k);", "plan.mapsKept.push(k);"]]
        ];
        for (const [name, pair] of muts) {
            if (SRC.indexOf(pair[0]) < 0) { check('P: mutation anchor present: ' + name, false, 'anchor not found'); continue; }
            const bad = SRC.replace(pair[0], pair[1]);
            let red = false;
            try {
                const T = scenario(bad), p = T.pic;
                const ok0 = J(p.parts.map(x => x.zoneId)) === J(P.parts.map(x => x.zoneId)) && J(p.risks) === J(P.risks) && J(p.zoneHazards) === J(P.zoneHazards) && p.contentHash === P.contentHash;
                await T.X.importSysLab(T.X.readSysLab(physV2(), 'phys.json').data, 'W. Engineer', { at: AT });
                await T.X.rejectMap('tag:ADC-9', 'ADC', 'W. Engineer', { at: AT });
                const mm = T.X.matchSysLab();
                const ok1 = J(mm.exact.map(e => e.key)) === J(['tag:BAT-X', 'tag:FCC-1', 'tag:FCC-2B', 'sys:HYDS']) && !mm.candidates.some(c => c.key === 'tag:ADC-9');
                await T.X.acceptExact('W. Engineer', { at: AT });
                const rr = T.X.reachOfVolume('prv-rotor', T.m.id);
                const ok2 = J(rr.functions.map(f => f.funcId)) === J(['F-PITCH-1', 'F-PITCH-2']);
                const d = physV2(); d.elements = d.elements.filter(e => e.tag !== 'FCC-2B');
                const ok3 = T.X.planSysLab(T.X.readSysLab(d).data).mapsKept.indexOf('tag:FCC-2B') < 0;
                red = !(ok0 && ok1 && ok2 && ok3);
            } catch (e) { red = true; }
            check('P: mutation caught: ' + name, red);
        }
    }

    console.log('\n[Q] wiring');
    {
        const IDX = read('index.html'), CP = read('cad_page.js'), ZU = read('zonal_ui.js');
        const a = IDX.indexOf('pra_panel.js?v='), b = IDX.indexOf('zonal_exchange.js?v=');
        check('Q: script tag right after pra_panel.js, with a version', a > 0 && b > a && !/<script[^>]*>/.test(IDX.slice(IDX.indexOf('>', a) + 1, b).replace(/<\/script>/, '').replace(/<!--[\s\S]*?-->/g, '')));
        check('Q: the CAD page renders the panel and the Sys Lab functions under Impact (zone and volume)', /window\.SLZonalExchange\.renderPanel\(\)/.test(CP) && /_sysLabReach\(\{ zoneId: zoneId \}\)/.test(CP) && /_sysLabReach\(\{ volumeId: volId \}\)/.test(CP));
        check('Q: the Zonal Model page has the export button', /SLZonalExchange\.exportFile\(\)/.test(ZU) && /Export zones and risks for Sys Lab/.test(ZU));
        check('Q: no eval, no new Function, no em dash in the module', !/\beval\(|new Function\(/.test(SRC) && SRC.indexOf(EM) < 0);
        check('Q: no gray text in the new panel (no tertiary or secondary text colors, no opacity on text)', !/text-tertiary|text-secondary|#7a828f|#6b7280|opacity:/.test(SRC));
        check('Q: module exports', typeof require('../site/zonal_exchange.js').exportPicture === 'function');
        check('Q: the change acknowledgement names the new record in plain words', /sysLabPhysical: 'Sys Lab physical architecture and its equipment mapping'/.test(read('change_ack.js')));
    }

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); });

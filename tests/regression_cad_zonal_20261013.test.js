#!/usr/bin/env node
/*
 * Regression: the CAD / zonal / particular-risk engine (site/cad_zonal.js, SLCadZonal), 13 Oct 2026.
 *
 * Waqas's ruling: each source owns one thing. CAD owns the zones and which equipment sits in
 * each; the fault trees own which equipment drives which failure condition; the model owns the
 * equipment identity (the systemsData id). Chain: zone -> equipment -> basic events -> failure
 * conditions reached -> severity. Written from the requirement, on a small synthetic aircraft:
 *
 *   A  zonal_model zones-2: zones-1 data stays valid, migrate() is explicit and idempotent,
 *      volume shapes are checked
 *   B  zone list import (ATA codes as the key, parents in any order, box volumes, loops refused,
 *      re-import updates and never deletes)
 *   C  CAD model metadata: ids, unit conversion, bad parts refused
 *   D  identity: only exact identifier equality is "exact"; loose matches are candidates;
 *      ambiguous exact matches are candidates; rejected pairs never come back; nothing is
 *      placed in a zone without a confirmed link
 *   E  containment: deepest zone wins, ties broken by smaller volume and reported, envelope
 *      bodies of a parts-defined zone, straddling parts, parts outside every zone
 *   F  clearances between different equipment, threshold, same equipment left out
 *   G  zone impact through the REAL fault tree engine: two redundant flight computers in the
 *      same bay reach the Catastrophic condition; a battery alone does not (one failure short);
 *      the fuselage with its sub-zones reaches three conditions, sorted by severity
 *   H  particular risk: a rotor burst disk sector catches both computers; a narrower fragment
 *      band excludes one; impact from the risk volume
 *   I  independence flags on AND gates: same zone = violation, sibling zones = advisory
 *      (relieved by a substantiated barrier), same risk volume = violation; each flag names
 *      parts, zone or risk, and the gate
 *   J  a new CAD revision: added, removed, moved, renamed parts; zone volume changed; affected
 *      zones, ZSA rows, flags and risk volumes; review record through SLChangeAck; links carried
 *   K  aiPayload carries nothing but the whitelisted fields (no centroid, no file name, hash,
 *      dates, people, or any field added to the stored model later)
 *   L  determinism: the whole result set computed twice, and on a fixture with every input
 *      list reversed, is deep-equal
 *   M  mutations: eight deliberate breaks of the engine, each must turn a check red
 *   N  wiring: script tag after zonal_model.js, fta_engine.js and change_ack.js; no eval; no em
 *      dash in the new module; module exports
 *
 * Run: node tests/regression_cad_zonal_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const SRC = read('cad_zonal.js'), ZM = read('zonal_model.js'), FE = read('fta_engine.js'), IDX = read('index.html');
const J = x => JSON.stringify(x);
const EM = String.fromCharCode(0x2014);

// ---------------------------------------------------------------- the synthetic aircraft
const box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
const part = (pid, name, partNumber, b, extra) => Object.assign({ pid, name, partNumber, path: ['Aircraft', 'Fuselage', name], bbox: b }, extra || {});
function cadA() {
    return { fileName: 'ac_revA.step', sha256: 'aaaa', revision: 'A', importedAt: '2026-10-13T08:00:00Z', units: 'mm', parts: [
        part('p-fcc1', 'FCC-1', 'PN-FCC-100', box(1400, 1550, -100, 100, -100, 100)),
        part('p-fcc1-conn', 'FCC-1 connector', null, box(1560, 1600, -50, 50, -50, 50)),
        part('p-fcc2', 'FCC-2', 'PN-FCC-200', box(1800, 2000, -100, 100, -100, 100)),
        part('p-hyd', 'HYD pump', 'PN-HYD-1', box(4500, 4800, -200, 200, -200, 200), { designator: 'HYD-P1' }),
        part('p-bat', 'BAT-1', null, box(6000, 6200, 4000, 4200, -50, 50)),
        part('p-adc', 'Air data computer assy', null, box(2200, 2300, -100, 100, -100, 100)),
        part('p-sens', 'Sensor', 'PN-COMMON', box(7000, 7050, 2000, 2050, 0, 50)),
        part('p-bracket', 'Bracket', null, box(2900, 4100, -20, 20, -20, 20)),
        part('p-env-rack', 'Rack envelope', null, box(2400, 2600, -300, 300, -300, 300)),
        part('p-radio', 'Radio', null, box(2450, 2550, -50, 50, -50, 50)),
        part('p-amb', 'Wing fitting', null, box(3000, 3100, 2900, 3100, -10, 10)),
        part('p-out', 'Pitot probe', null, box(-500, -400, 0, 10, 0, 10)),
        // Founder ruling (13 Oct 2026): a link is to one installed copy, never to a part number.
        part('p-valve-1', 'Valve', 'PN-VALVE', box(8000, 8050, 7000, 7050, 0, 50)),                       // one part number,
        part('p-valve-2', 'Valve', 'PN-VALVE', box(8100, 8150, 7000, 7050, 0, 50)),                       // installed twice
        part('p-pmp-a', 'Boost pump', null, box(8200, 8250, 7000, 7050, 0, 50), { designator: 'PMP-2' }),  // a designator carried
        part('p-pmp-b', 'Boost pump', null, box(8300, 8350, 7000, 7050, 0, 50), { designator: 'PMP-2' }),  // by two CAD parts
        part('p-ata', 'Light unit', null, box(8400, 8450, 7000, 7050, 0, 50), { ata: '33-41' })           // ATA code only
    ] };
}
function cadB() {
    const a = cadA();
    const parts = a.parts.filter(p => p.pid !== 'p-bat').map(p => {
        if (p.pid === 'p-fcc2') return Object.assign({}, p, { bbox: box(4300, 4400, -100, 100, -100, 100) });   // moved into the hydraulic bay
        if (p.pid === 'p-hyd') return Object.assign({}, p, { name: 'Hydraulic pump' });                       // renamed, same part number
        if (p.pid === 'p-env-rack') return Object.assign({}, p, { bbox: box(2400, 2700, -300, 300, -300, 300) });
        return p;
    });
    parts.push(part('p-new', 'Fire bottle', 'PN-FB-1', box(8000, 8100, 0, 100, 0, 100)));
    return { fileName: 'ac_revB.step', sha256: 'bbbb', revision: 'B', importedAt: '2026-10-14T08:00:00Z', units: 'mm', parts };
}
const ZONE_ROWS = [
    { code: '110', name: 'Avionics bay', parentCode: '100', xMin: 1000, yMin: -1500, zMin: -1500, xMax: 3000, yMax: 1500, zMax: 1500 },
    { code: '100', name: 'Fuselage', parentCode: '', xMin: 0, yMin: -1500, zMin: -1500, xMax: 10000, yMax: 1500, zMax: 1500 },
    { code: '120', name: 'Hydraulic bay', parentCode: '100', xMin: 4000, yMin: -1500, zMin: -1500, xMax: 6000, yMax: 1500, zMax: 1500 },
    { code: '500', name: 'Wing', xMin: 0, yMin: 1500, zMin: -500, xMax: 9000, yMax: 9000, zMax: 500 },
    { code: '510', name: 'Wing root fwd', parentCode: '500', xMin: 2500, yMin: 2500, zMin: -500, xMax: 3500, yMax: 3500, zMax: 500 },
    { code: '520', name: 'Wing root aft', parentCode: '500', xMin: 2800, yMin: 2000, zMin: -500, xMax: 4000, yMax: 3500, zMax: 500 }
];
const leaf = (id, name, sysId, lid) => Object.assign({ id, type: 'basic', displayId: id, name, probability: 1e-5 }, lid ? { logicalId: lid } : {}, sysId ? { identity: { kind: 'item', systemId: sysId } } : {});
function trees() {
    return [
        { id: 'P1', name: 'SF-001 Loss of pitch control', linkedFhaIds: [7], root: { id: 'G1', type: 'gate', gateType: 'AND', displayId: 'SF-001', name: 'Loss of pitch control', children: [
            { id: 'G2', type: 'gate', gateType: 'OR', displayId: 'G-002', name: 'Channel 1 lost', children: [leaf('BE1', 'FCC-1 processor fails', 'FCC1'), leaf('BE2', 'FCC-1 loses power', 'FCC1')] },
            { id: 'G3', type: 'gate', gateType: 'OR', displayId: 'G-003', name: 'Channel 2 lost', children: [leaf('BE3', 'FCC-2 processor fails', 'FCC2', 'L-FCC2'), leaf('BE4', 'Battery fails', 'BAT')] }
        ] } },
        { id: 'P2', name: 'SF-002 Loss of hydraulic power', linkedFhaIds: [8], root: { id: 'G4', type: 'gate', gateType: 'OR', displayId: 'SF-002', name: 'Loss of hydraulic power', children: [leaf('BE5', 'Pump fails', 'HYD', 'L-HYD'), leaf('BE6', 'Reservoir leak', null)] } },
        { id: 'P3', name: 'HYD-FC-1', linkedFhaIds: [9], root: { id: 'G5', type: 'gate', gateType: 'AND', displayId: 'HYD-FC-1', name: 'Pitch hydraulic and channel 2 lost', children: [leaf('BE7', 'Pump fails', 'HYD', 'L-HYD'), leaf('BE8', 'FCC-2 processor fails', 'FCC2', 'L-FCC2')] } }
    ];
}
function systems() {
    return [
        { id: 'FCC1', name: 'Flight control computer 1', partNumber: 'PN-FCC-100', designator: 'FCC-1', functions: [{ funcId: 'F-PITCH-1', funcName: 'Pitch command channel 1', traceIds: ['AF-1'] }] },
        { id: 'FCC2', name: 'Flight control computer 2', partNumber: 'PN-FCC-200', designator: 'FCC-2', functions: [{ funcId: 'F-PITCH-2', funcName: 'Pitch command channel 2', traceIds: ['AF-1'] }] },
        { id: 'HYD', name: 'Hydraulic pump', partNumber: 'PN-HYD-1', designator: 'HYD-P1', fha: [{ internalId: 9, fcId: 'HYD-FC-1', fcDesc: 'Loss of hydraulic pitch and channel 2', severity: 'Hazardous' }] },
        { id: 'BAT', name: 'Main battery', designator: 'BAT-1' },
        { id: 'ADC', name: 'Air data computer' },
        { id: 'SENS-A', name: 'Sensor A', partNumbers: ['PN-COMMON'] },
        { id: 'SENS-B', name: 'Sensor B', partNumber: 'PN-COMMON' },
        { id: 'VALVE', name: 'Shutoff valve', partNumber: 'PN-VALVE' },
        { id: 'PMP2', name: 'Fuel boost pump 2', designator: 'PMP-2' },
        { id: 'LIGHT', name: 'Navigation light', ata: '33-41' }
    ];
}
function load(src, opts) {
    opts = opts || {};
    const ack = { batches: [], notes: [] };
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, isFinite, parseFloat, Int32Array, setTimeout: () => 0,
        scheduleAutosave: () => { sb._saved = (sb._saved || 0) + 1; },
        projectConfig: {}, systemsData: systems(), acFhaData: [{ internalId: 7, fcId: 'SF-001', fcDesc: 'Loss of pitch control', severity: 'Catastrophic' }, { internalId: 8, fcId: 'SF-002', fcDesc: 'Loss of hydraulic power', severity: 'Major' }],
        ftaPages: trees(), zsaData: [{ internalId: 1, zoneId: '110' }, { internalId: 2, zoneId: 'Wing' }, { internalId: 3, zoneId: '999' }, { internalId: 4, zoneId: 'x', modelLinks: { zone: [] } }],
        SLChangeAck: { batch: (label, fn) => { ack.batches.push(label); const r = fn(); return Promise.resolve({ acknowledged: true, result: r }); }, describe: (info) => { ack.notes.push(info); } } };
    if (opts.reverse) { sb.systemsData.reverse(); sb.ftaPages.reverse(); sb.zsaData.reverse(); }
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    vm.createContext(sb);
    vm.runInContext(ZM, sb, { filename: 'zonal_model.js' });
    vm.runInContext(FE, sb, { filename: 'fta_engine.js' });
    vm.runInContext(src || SRC, sb, { filename: 'cad_zonal.js' });
    sb._ack = ack;
    return sb;
}
// Build the whole scenario and return every computed result (pure data) plus the sandbox.
function scenario(src, opts) {
    opts = opts || {};
    const sb = load(src, opts), C = sb.SLCadZonal, Z = sb.ZONES;
    const rows = opts.reverse ? ZONE_ROWS.slice().reverse() : ZONE_ROWS;
    const imp = C.importZoneList(rows);
    const a = cadA(); if (opts.reverse) a.parts.reverse();
    const ma = C.addCadModel(a).model;
    // zone 130: an equipment rack defined by a CAD body (zones-2 'parts' volume), inside the avionics bay
    const z130 = Z.addZone({ code: '130', name: 'Equipment rack', parentId: Z.all().find(z => z.code === '110').id, volume: { kind: 'parts', cadId: ma.id, pids: ['p-env-rack'] }, source: 'cad', cadRef: { cadId: ma.id, revision: 'A' } }).zone;
    const R = { imp };
    R.matchBefore = C.matchEquipment(ma.id);
    R.containBefore = C.applyContainment(ma.id);       // no links yet: nothing may be proposed
    R.exact = C.applyExactLinks(ma.id, 'exact identifier match', { at: '2026-10-13T09:00:00Z' });
    R.confirmConn = C.confirmLink(ma.id, 'p-fcc1-conn', 'FCC1', 'W. Engineer', { at: '2026-10-13T09:01:00Z' });
    R.rejectAdc = C.rejectLink(ma.id, 'p-adc', 'ADC', 'W. Engineer', { at: '2026-10-13T09:02:00Z' });
    R.matchAfter = C.matchEquipment(ma.id);
    R.containment = C.containment(ma.id);
    R.proposal = C.applyContainment(ma.id);
    R.applied = C.applyContainment(ma.id, { apply: true, by: 'W. Engineer' });
    R.zoneEquip = Z.all().map(z => [z.code, (z.equipment || []).slice().sort()]).sort();
    R.clear300 = C.clearances(ma.id, { threshold: 300 });
    R.clear50 = C.clearances(ma.id, { threshold: 50 });
    const zid = code => Z.all().find(z => z.code === code).id;
    R.impact110 = C.zoneImpact(zid('110'));
    R.impact100 = C.zoneImpact(zid('100'));
    R.impact500 = C.zoneImpact(zid('500'));
    R.rotor = C.addRiskVolume({ id: 'prv-rotor', kind: 'rotorBurst', label: 'No. 1 engine rotor burst', source: 'manual', shape: { kind: 'disk-sector', center: [1800, 3000, 0], axis: [1, 0, 0], range: 5000 } }).volume;
    R.rotorNarrow = C.addRiskVolume({ id: 'prv-rotor3', kind: 'rotorBurst', label: 'One-third disc band', shape: { kind: 'disk-sector', center: [1800, 3000, 0], axis: [1, 0, 0], fragment: 'oneThirdDisc', range: 5000 } }).volume;
    R.inRotor = C.partsInVolume('prv-rotor', ma.id);
    R.inRotor3 = C.partsInVolume('prv-rotor3', ma.id);
    R.riskImpact = C.riskImpact('prv-rotor', { cadId: ma.id });
    C.removeRiskVolume('prv-rotor3');
    R.flags = C.independenceFlags({ cadId: ma.id });
    // a substantiated barrier between the avionics and hydraulic bays relieves the sibling advisory
    Z.addBarrier(zid('110'), zid('120'), 'firewall', true);
    R.flagsBarrier = C.independenceFlags({ cadId: ma.id });
    Z.removeBarrier(Z.barriers()[0].id);
    // revision B
    const b = cadB(); if (opts.reverse) b.parts.reverse();
    const mb = C.addCadModel(b).model;
    R.carry = C.carryLinks(ma.id, mb.id, 'carried', { at: '2026-10-14T09:00:00Z' });
    R.diff = C.diffRevision(ma.id, mb.id);
    R.review = C.markForReview(R.diff, 'W. Engineer', { at: '2026-10-14T09:05:00Z' });
    R.payload = C.aiPayload(ma.id, { threshold: 300 });
    R.ids = { a: ma.id, b: mb.id, z130: z130.id, zid };
    return { sb, C, Z, R };
}
const strip = R => { const o = Object.assign({}, R); delete o.ids; delete o.review; return JSON.parse(JSON.stringify(o)); };

// ===================================================================== A  zones-2
console.log('\n[A] zonal_model zones-2');
{
    const sb = load();
    const Z = sb.ZONES;
    const z1 = Z.addZone({ code: '100', name: 'Fuselage' }).zone;
    check('A: a zones-1 zone (no volume fields) is valid and reads as schema zones-1', Z.validate().ok && Z.schemaOf() === 'zones-1' && !('volume' in z1) && Z.SCHEMA === 'zones-2');
    const m1 = Z.migrate(), snap = J(sb.projectConfig.zones), m2 = Z.migrate();
    check('A: migrate() stamps zones-2, fills neutral fields, and a second run changes nothing', m1.upgraded === 1 && m2.upgraded === 0 && J(sb.projectConfig.zones) === snap && z1.volume === null && z1.source === 'manual' && z1.cadRef === null && Z.schemaOf() === 'zones-2');
    check('A: ids, codes, parents and equipment untouched by migrate', z1.id === 'z-1' && z1.code === '100' && z1.parentId === null && Array.isArray(z1.equipment));
    check('A: bad volumes are refused (min above max, unknown kind, parts without ids)', !!Z.volumeIssue({ kind: 'box', min: [1, 0, 0], max: [0, 1, 1] }) && !!Z.volumeIssue({ kind: 'blob' }) && !!Z.volumeIssue({ kind: 'parts', cadId: 'cad-1', pids: [] }) && Z.volumeIssue(null) === null && !Z.setVolume(z1.id, { kind: 'box', min: [0], max: [1] }).ok);
    z1.volume = { kind: 'box', min: [5, 0, 0], max: [1, 1, 1] };
    check('A: validate() reports a malformed stored volume', !Z.validate().ok && Z.validate().issues.some(t => /min above max/.test(t)));
}

// ===================================================================== B..L on the full scenario
const S = scenario();
const { C, Z, R } = S;
const zid = R.ids.zid;
const code = id => { const z = Z.get(id); return z ? z.code : null; };

console.log('\n[B] zone list import');
{
    check('B: six zones created from the list, keyed by ATA code, nothing updated', J(R.imp.created) === J(['100', '110', '120', '500', '510', '520']) && R.imp.updated.length === 0 && R.imp.issues.length === 0);
    check('B: parents resolved even when the child row comes first', code(Z.get(zid('110')).parentId) === '100' && code(Z.get(zid('520')).parentId) === '500' && Z.get(zid('100')).parentId === null);
    check('B: box volumes and source "list" stored, schema now zones-2', J(Z.get(zid('120')).volume) === J({ kind: 'box', min: [4000, -1500, -1500], max: [6000, 1500, 1500] }) && Z.get(zid('120')).source === 'list' && S.sb.projectConfig.zonesSchema === 'zones-2');
    const re = C.importZoneList([{ code: '110', name: 'Avionics bay (main)', parentCode: '100' }, { code: '100', name: 'Fuselage', parentCode: '110' }, { code: '120', name: 'Hydraulic bay', parentCode: 'NOPE' }]);
    check('B: re-import updates by code, refuses a loop and a missing parent, never deletes', J(re.created) === '[]' && re.updated.indexOf('110') >= 0 && re.issues.some(t => /loop/.test(t)) && re.issues.some(t => /NOPE/.test(t)) && Z.get(zid('100')).parentId === null && code(Z.get(zid('120')).parentId) === '100' && Z.all().length === 7 && J(re.notInList) === J(['500', '510', '520']));
    check('B: a row with no box keeps the stored volume', J(Z.get(zid('110')).volume) === J({ kind: 'box', min: [1000, -1500, -1500], max: [3000, 1500, 1500] }));
    Z.get(zid('110')).name = 'Avionics bay';
}

console.log('\n[C] CAD model metadata');
{
    const sb = load(); const c = sb.SLCadZonal;
    const r = c.addCadModel({ revision: 'X', units: 'm', parts: [{ pid: 'a', name: 'A', bbox: { min: [0, 0, 0], max: [1, 2, 3] } }, { pid: 'a', name: 'dup', bbox: { min: [0, 0, 0], max: [1, 1, 1] } }, { name: 'no pid', bbox: { min: [0, 0, 0], max: [1, 1, 1] } }, { pid: 'b', name: 'B' }] }, { at: '2026-10-13T00:00:00Z' });
    check('C: id cad-1, metres converted to mm, centroid defaults to the box center', r.ok && r.model.id === 'cad-1' && J(r.model.parts[0].bbox.max) === J([1000, 2000, 3000]) && J(r.model.parts[0].centroid) === J([500, 1000, 1500]) && r.model.units === 'mm' && r.model.sourceUnits === 'm');
    check('C: duplicate pid, missing pid and missing box are refused with a reason', r.model.parts.length === 1 && r.issues.length === 3);
    check('C: unknown units refused; second model gets cad-2', !c.addCadModel({ units: 'furlong', parts: [] }).ok && c.addCadModel({ parts: [] }, { at: 'x' }).model.id === 'cad-2' && c.latestCadId() === 'cad-2');
}

console.log('\n[D] equipment identity');
{
    const ex = R.matchBefore.exact.map(e => e.pid + '>' + e.sysId + ':' + e.on);
    check('D: exact links only on a reference designator unique on both sides', J(ex) === J(['p-bat>BAT:designator', 'p-fcc1>FCC1:designator', 'p-fcc2>FCC2:designator', 'p-hyd>HYD:designator']));
    const candD = {}; R.matchBefore.candidates.forEach(c => { candD[c.pid] = c.sysIds; });
    check('D: one part number installed twice: both copies are candidates, never exact', J(candD['p-valve-1']) === J(['VALVE']) && J(candD['p-valve-2']) === J(['VALVE']) && !R.matchBefore.exact.some(e => /p-valve/.test(e.pid)));
    check('D: a designator carried by two CAD parts is a candidate for each, never exact', J(candD['p-pmp-a']) === J(['PMP2']) && J(candD['p-pmp-b']) === J(['PMP2']) && !R.matchBefore.exact.some(e => /p-pmp/.test(e.pid)));
    check('D: an ATA code match is a candidate, never exact', J(candD['p-ata']) === J(['LIGHT']) && !R.matchBefore.exact.some(e => e.pid === 'p-ata'));
    check('D: a part number alone (single equipment item, single part) is still a candidate', (() => { const sb2 = load(); const C2 = sb2.SLCadZonal; sb2.systemsData = [{ id: 'X', name: 'X', partNumber: 'PN-X' }]; const m = C2.addCadModel({ fileName: 'x', parts: [part('q1', 'Thing', 'PN-X', box(0, 1, 0, 1, 0, 1))] }).model; const r = C2.matchEquipment(m.id); return r.exact.length === 0 && J(r.candidates) === J([{ pid: 'q1', sysIds: ['X'] }]); })());
    check('D: a unique designator links even when another item shares the part number (that item is not linked)', (() => { const sb2 = load(); const C2 = sb2.SLCadZonal; sb2.systemsData = [{ id: 'L', name: 'Left', designator: 'ENG-L', partNumber: 'PN-E' }, { id: 'R', name: 'Right', designator: 'ENG-R', partNumber: 'PN-E' }]; const m = C2.addCadModel({ fileName: 'x', parts: [part('e1', 'Engine', 'PN-E', box(0, 1, 0, 1, 0, 1), { designator: 'ENG-L' }), part('e2', 'Engine', 'PN-E', box(5, 6, 0, 1, 0, 1), { designator: 'ENG-R' })] }).model; const r = C2.matchEquipment(m.id); return J(r.exact) === J([{ pid: 'e1', sysId: 'L', on: 'designator' }, { pid: 'e2', sysId: 'R', on: 'designator' }]) && r.candidates.length === 0; })());
    check('D: the rule says so in words', /never to a part number/.test(C.RULES.identity) && /unique on both sides/.test(C.RULES.identity));
    const cand = {}; R.matchBefore.candidates.forEach(c => { cand[c.pid] = c.sysIds; });
    check('D: loose matches are candidates, never exact (connector -> FCC1, assy name -> ADC)', J(cand['p-fcc1-conn']) === J(['FCC1']) && J(cand['p-adc']) === J(['ADC']));
    check('D: an identifier shared by two items is a candidate for both, not an exact link', J(cand['p-sens']) === J(['SENS-A', 'SENS-B']) && !R.matchBefore.exact.some(e => e.pid === 'p-sens'));
    check('D: a part with nothing in common is unmatched', R.matchBefore.unmatched.indexOf('p-bracket') >= 0 && R.matchBefore.unmatched.indexOf('p-radio') >= 0);
    check('D: no confirmed link, no zone assignment (proposal empty before linking)', R.containBefore.assign.length === 0 && R.containBefore.unchanged.length === 0);
    check('D: confirmLink records who and when; links keyed by cadId|pid', R.confirmConn.ok && J(C.link(R.ids.a, 'p-fcc1-conn')) === J({ cadId: 'cad-1', pid: 'p-fcc1-conn', sysId: 'FCC1', on: 'confirmed', by: 'W. Engineer', at: '2026-10-13T09:01:00Z', rejected: [] }) && !!S.sb.projectConfig.cadLinks['cad-1|p-fcc1-conn']);
    check('D: a rejected pair never comes back as a candidate', R.rejectAdc.ok && !R.matchAfter.candidates.some(c => c.pid === 'p-adc') && R.matchAfter.unmatched.indexOf('p-adc') >= 0);
    check('D: linked parts are listed as linked, not matched again', R.matchAfter.linked.length === 5 && R.matchAfter.exact.length === 0);
    check('D: links need a real part, real equipment and a name', !C.confirmLink(R.ids.a, 'nope', 'FCC1', 'x').ok && !C.confirmLink(R.ids.a, 'p-adc', 'NOPE', 'x').ok && !C.confirmLink(R.ids.a, 'p-adc', 'ADC', '').ok);
}

console.log('\n[E] containment');
{
    const zOf = {}; R.containment.parts.forEach(p => { zOf[p.pid] = code(p.zoneId); });
    check('E: deepest zone wins (computers in 110, not 100; pump in 120; battery in 500)', zOf['p-fcc1'] === '110' && zOf['p-fcc2'] === '110' && zOf['p-hyd'] === '120' && zOf['p-bat'] === '500');
    check('E: a parts-defined zone holds the radio; its envelope body is not a contained part', zOf['p-radio'] === '130' && J(R.containment.envelopes) === J(['p-env-rack']) && !('p-env-rack' in zOf));
    check('E: overlapping siblings: the smaller volume wins and the part is reported ambiguous', zOf['p-amb'] === '510' && R.containment.ambiguous.length === 1 && R.containment.ambiguous[0].pid === 'p-amb' && J(R.containment.ambiguous[0].zoneIds.map(code)) === J(['510', '520']));
    const st = R.containment.straddling.find(s => s.pid === 'p-bracket');
    check('E: a bracket crossing the avionics and hydraulic bays is straddling, in 100, crossing 110 and 120', st && code(st.zoneId) === '100' && J(st.crosses.map(code)) === J(['110', '120']));
    check('E: a part outside every zone is reported outside', J(R.containment.outside) === J(['p-out']));
    check('E: applyContainment proposes from confirmed links only, applying is explicit', R.proposal.applied === false && J(R.proposal.assign.map(a => a.sysId + '>' + code(a.toZoneId))) === J(['BAT>500', 'FCC1>110', 'FCC2>110', 'HYD>120']) && R.applied.applied === true);
    check('E: after apply the zonal model holds the assignments', J(R.zoneEquip.filter(x => x[1].length)) === J([['110', ['FCC1', 'FCC2']], ['120', ['HYD']], ['500', ['BAT']]]));
    check('E: the apply is described to the change acknowledgement', S.sb._ack.notes.some(n => /Placed 4 equipment items in zones/.test(n.summary)));
}

console.log('\n[F] clearances');
{
    const p = R.clear300.pairs.map(x => x.pidA + '|' + x.pidB + '=' + x.distance);
    check('F: FCC-1 parts to FCC-2 within 300 mm, nearest first; same-equipment pairs left out', J(p) === J(['p-fcc1-conn|p-fcc2=200', 'p-fcc1|p-fcc2=250']) && !R.clear300.pairs.some(x => x.sysA === x.sysB));
    check('F: nothing within 50 mm', R.clear50.pairs.length === 0);
    check('F: box distance is 0 when boxes overlap, Euclidean across a corner', C.boxDistance(box(0, 1, 0, 1, 0, 1), box(0.5, 2, 0, 1, 0, 1)) === 0 && C.boxDistance(box(0, 1, 0, 1, 0, 1), box(4, 5, 5, 6, 0, 1)) === 5);
}

console.log('\n[G] zone impact through the real fault tree engine');
{
    const i110 = R.impact110;
    check('G: avionics bay compromised: both computers fail, SF-001 Catastrophic reached', i110.engine && J(i110.equipment.map(e => e.sysId)) === J(['FCC1', 'FCC2']) && J(i110.conditions.map(c => c.fcId + ':' + c.severity)) === J(['SF-001:Catastrophic']) && i110.worst === 'Catastrophic');
    check('G: the basic events forced are exactly the computers\' events', J(i110.events.map(e => e.lid)) === J(['BE1', 'BE2', 'L-FCC2']));
    const p3 = i110.trees.find(t => t.pageId === 'P3');
    check('G: a tree the zone only half reaches is reported one failure short, not reached', p3 && !p3.reached && p3.additional === 1);
    check('G: systems and functions touched come from the model, with SysML refs', J(i110.systems.map(s => s.ref)) === J(['sys:FCC1', 'sys:FCC2']) && J(i110.functions.map(f => f.ref)) === J(['sfn:FCC1/F-PITCH-1', 'sfn:FCC2/F-PITCH-2']));
    check('G: fuselage with its sub-zones reaches three conditions, sorted by severity', J(R.impact100.conditions.map(c => c.fcId)) === J(['SF-001', 'HYD-FC-1', 'SF-002']) && R.impact100.conditions[1].domain === 'SYS');
    check('G: the wing (battery only) reaches nothing: channel 1 still works', R.impact500.conditions.length === 0 && R.impact500.trees.find(t => t.pageId === 'P1').additional === 1);
    check('G: coverage reports basic events with no equipment identity', R.impact110.coverage.eventsWithoutEquipment === 1);
}

console.log('\n[H] particular risk volumes');
{
    check('H: rotor burst default spread is the configurable 5 degree band', R.rotor.shape.spreadDeg === 5 && C.spreadOf({ fragment: 'oneThirdDisc' }) === 3 && C.spreadOf({ fragment: 'small' }) === 15 && C.spreadOf({ spreadDeg: 7 }) === 7);
    check('H: the 5 degree band catches both computers and the connector, not the pump', J(R.inRotor.map(p => p.pid)) === J(['p-fcc1', 'p-fcc1-conn', 'p-fcc2']));
    check('H: a 3 degree one-third disc band loses FCC-1 (4.8 degrees off the plane)', R.inRotor3.map(p => p.pid).indexOf('p-fcc1') < 0 && R.inRotor3.map(p => p.pid).indexOf('p-fcc2') >= 0);
    check('H: risk impact reaches SF-001 Catastrophic through the confirmed links', J(R.riskImpact.conditions.map(c => c.fcId)) === J(['SF-001']) && J(R.riskImpact.equipment.map(e => e.sysId)) === J(['FCC1', 'FCC2']) && R.riskImpact.unlinkedParts.length === 0);
    check('H: shapes: sphere, cone, box and bad shapes', C.inShape({ kind: 'sphere', center: [0, 0, 0], radius: 10 }, [6, 8, 0]) && !C.inShape({ kind: 'sphere', center: [0, 0, 0], radius: 10 }, [6, 8, 1]) && C.inShape({ kind: 'cone', apex: [0, 0, 0], axis: [0, 0, 1], halfAngleDeg: 45 }, [1, 0, 2]) && !C.inShape({ kind: 'cone', apex: [0, 0, 0], axis: [0, 0, 1], halfAngleDeg: 45 }, [3, 0, 2]) && !C.inShape({ kind: 'cone', apex: [0, 0, 0], axis: [0, 0, 1], halfAngleDeg: 45, length: 1 }, [0, 0, 2]) && !!C.shapeIssue({ kind: 'cone', apex: [0, 0, 0], axis: [0, 0, 0], halfAngleDeg: 10 }) && !C.addRiskVolume({ kind: 'meteor', shape: { kind: 'box', min: [0, 0, 0], max: [1, 1, 1] } }).ok);
    check('H: a disk sector limited in azimuth', C.inShape({ kind: 'disk-sector', center: [0, 0, 0], axis: [1, 0, 0], spreadDeg: 5, refDir: [0, 1, 0], fromDeg: 0, toDeg: 90 }, [0, 1, 1]) && !C.inShape({ kind: 'disk-sector', center: [0, 0, 0], axis: [1, 0, 0], spreadDeg: 5, refDir: [0, 1, 0], fromDeg: 0, toDeg: 90 }, [0, -1, -1]));
}

console.log('\n[I] independence flags (AND gate rule)');
{
    const f = R.flags;
    const sz = f.find(x => x.kind === 'same-zone');
    check('I: the two pitch channels in the avionics bay: same-zone violation on gate SF-001', sz && sz.severity === 'violation' && sz.treeId === 'P1' && sz.gateId === 'G1' && code(sz.zoneId) === '110' && J(sz.equipment) === J(['FCC1', 'FCC2']) && J(sz.inputs.map(i => i.id)) === J(['G2', 'G3']));
    check('I: the flag names parts, zone and gate in words', sz && J(sz.parts.map(p => p.name)) === J(['FCC-1', 'FCC-1 connector', 'FCC-2']) && /SF-001/.test(sz.text) && /110 Avionics bay/.test(sz.text) && /FCC-1 connector/.test(sz.text));
    const rv = f.find(x => x.kind === 'same-risk-volume');
    check('I: both channels inside the rotor burst volume: risk violation naming the risk', rv && rv.volumeId === 'prv-rotor' && rv.gateId === 'G1' && /No\. 1 engine rotor burst/.test(rv.text));
    const sib = f.find(x => x.kind === 'sibling-zone');
    check('I: pump (120) and channel 2 (110) under the HYD-FC-1 AND: sibling advisory under 100', sib && sib.severity === 'advisory' && sib.gateId === 'G5' && code(sib.zoneId) === '100' && J(sib.equipment) === J(['FCC2', 'HYD']));
    check('I: battery (500) and channel 1 (110) are not flagged: different top zones', !f.some(x => x.equipment.indexOf('BAT') >= 0));
    check('I: violations listed before advisories; ids unique', f.length === 3 && f[f.length - 1].severity === 'advisory' && new Set(f.map(x => x.id)).size === f.length);
    check('I: a substantiated barrier between the bays relieves the sibling advisory only', !R.flagsBarrier.some(x => x.kind === 'sibling-zone') && R.flagsBarrier.some(x => x.kind === 'same-zone'));
}

console.log('\n[J] a new CAD revision');
{
    const d = R.diff;
    check('J: added, removed, moved, renamed parts', J(d.added) === J(['p-new']) && J(d.removed) === J(['p-bat']) && J(d.moved.map(m => m.pid)) === J(['p-env-rack', 'p-fcc2']) && J(d.renamed.map(m => m.pid)) === J(['p-hyd']));
    check('J: the rack zone (defined by a CAD body that moved) has its volume changed', d.zoneVolumesChanged.length === 1 && d.zoneVolumesChanged[0].zoneId === R.ids.z130);
    check('J: FCC-2 changed zone 110 -> 120; the battery left 500', d.partsChangedZone.some(x => x.pid === 'p-fcc2' && code(x.fromZoneId) === '110' && code(x.toZoneId) === '120') && d.partsChangedZone.some(x => x.pid === 'p-bat' && code(x.fromZoneId) === '500' && x.toZoneId === null));
    check('J: affected zones include the ancestors', J(d.affected.zones.map(code)) === J(['100', '110', '120', '130', '500']));
    check('J: affected ZSA rows matched by zone code and name, others untouched', J(d.affected.zsaRows) === J(['1', '2']));
    check('J: affected equipment and the same-zone flag that involves FCC-2', J(d.affected.equipment) === J(['BAT', 'FCC2', 'HYD']) && d.affected.flags.some(id => /same-zone/.test(id)));
    check('J: the rotor volume is affected (FCC-2 left it)', J(d.affected.riskVolumes) === J(['prv-rotor']));
    check('J: review record written inside one change-acknowledgement group with a note', R.review.ok && S.sb._ack.batches.length === 1 && /CAD revision B imported/.test(S.sb._ack.batches[0]) && S.sb._ack.notes.some(n => /CAD revision B replaces A/.test(n.summary)) && C.openReviews().length === 1 && C.openReviews()[0].items.length === d.review.length && d.review.length > 0);
    check('J: a review item is closed by name; the review closes when every item is', C.closeReviewItem(R.review.review.id, 'zsa', '1', 'W. Engineer', { at: 't' }).ok && !C.closeReviewItem(R.review.review.id, 'zsa', '1', '').ok && C.openReviews().length === 1);
    check('J: links carried only where pid and part number survived', J(R.carry.carried.map(x => x.pid)) === J(['p-fcc1', 'p-fcc1-conn', 'p-fcc2', 'p-hyd']) && J(R.carry.dropped.map(x => x.pid + ':' + x.why)) === J(['p-bat:part removed']));
}

console.log('\n[K] what an AI lane may receive');
{
    const P = R.payload;
    const ALLOWED = { schema: 1, revision: 1, units: 1, parts: 1, zones: 1, containment: 1, straddling: 1, clearances: 1, impacts: 1,
        pid: 1, name: 1, partNumber: 1, path: 1, bbox: 1, min: 1, max: 1, equipment: 1, code: 1, parentCode: 1, zone: 1, crosses: 1, pidA: 1, pidB: 1, distance: 1, conditions: 1, fcId: 1, description: 1, severity: 1 };
    const bad = [];
    (function walk(v, p) { if (Array.isArray(v)) v.forEach((x, i) => walk(x, p + '[' + i + ']')); else if (v && typeof v === 'object') Object.keys(v).forEach(k => { if (!ALLOWED[k]) bad.push(p + '.' + k); walk(v[k], p + '.' + k); }); })(P, '');
    check('K: only whitelisted keys anywhere in the payload', bad.length === 0, bad.slice(0, 5).join(' '));
    const txt = J(P);
    check('K: no file name, hash, import date, people or link timestamps', !/ac_revA|aaaa|2026-10-13|W\. Engineer|exact identifier match/.test(txt));
    check('K: carries names, paths, part numbers, zone codes, containment, clearances, impacts', P.parts.length === 17 && P.parts.some(p => p.partNumber === 'PN-FCC-100' && p.path[0] === 'Aircraft') && P.zones.some(z => z.code === '110' && z.parentCode === '100') && P.containment.some(c => c.pid === 'p-fcc1' && c.zone === '110') && P.clearances.length === 2 && P.impacts.some(i => i.zone === '110' && i.conditions[0].fcId === 'SF-001'));
    // a field added to the stored model later must not leak
    S.sb.projectConfig.cadModels[0].parts[0].meshUrl = 'file:///secret.step'; S.sb.projectConfig.cadModels[0].fileContent = 'ISO-10303-21;';
    const P2 = C.aiPayload(R.ids.a, { threshold: 300 });
    check('K: fields added to the stored model later do not reach the payload', !/secret|ISO-10303|meshUrl|fileContent/.test(J(P2)));
}

console.log('\n[L] determinism');
{
    const again = scenario();
    check('L: the whole result set computed twice is deep-equal', J(strip(again.R)) === J(strip(R)));
    const rev = scenario(null, { reverse: true });
    const proj = r => J({ flags: r.flags.map(f => [f.kind, f.gateId, f.equipment, f.parts.map(p => p.pid)]), i100: r.impact100.conditions.map(c => c.fcId), cont: r.containment.parts, clear: r.clear300, inRotor: r.inRotor, diff: [r.diff.added, r.diff.removed, r.diff.moved, r.diff.affected.equipment, r.diff.affected.zsaRows], match: [r.matchBefore.exact, r.matchBefore.candidates, r.matchBefore.unmatched] });
    check('L: every input list reversed (parts, zones, trees, systems, ZSA): same results, same order', proj(rev.R) === proj(R), proj(rev.R).slice(0, 200));
}

// ===================================================================== M  mutations
console.log('\n[M] mutations (each must turn a check red)');
function probe(src) {
    try {
        const sc = scenario(src), s = sc.R;
        const sz = s.flags.find(x => x.kind === 'same-zone');
        return {
            reachedOnlyWhenNoFurtherFailure: s.impact500.conditions.length === 0,
            sameZoneIsViolation: !!sz && sz.severity === 'violation',
            deepestWins: (sc.Z.get(s.containment.parts.find(p => p.pid === 'p-fcc1').zoneId) || {}).code === '110',
            payloadClean: !/centroid/.test(J(s.payload)),
            looseNeverExact: !s.matchBefore.exact.some(e => e.pid === 'p-adc' || e.pid === 'p-fcc1-conn'),
            noAssignWithoutLink: s.containBefore.assign.length === 0,
            orderedFlags: J(scenario(src, { reverse: true }).R.flags.map(f => f.id)) === J(s.flags.map(f => f.id)),
            spreadDefault5: s.rotor.shape.spreadDeg === 5,
            // Founder ruling: a link is to one installed copy, never to a part number.
            partNumberNeverExact: !s.matchBefore.exact.some(e => /p-valve|p-sens/.test(e.pid)) && !s.matchBefore.exact.some(e => e.on !== 'designator'),
            ataNeverExact: !s.matchBefore.exact.some(e => e.pid === 'p-ata'),
            dupDesignatorNeverExact: !s.matchBefore.exact.some(e => /p-pmp/.test(e.pid)),
            designatorStillExact: s.matchBefore.exact.length === 4
        };
    } catch (e) { return { crashed: String(e && e.message) }; }
}
{
    const base = probe(SRC);
    check('M: the probe is green on the real module', Object.keys(base).length === 12 && Object.keys(base).every(k => base[k] === true), J(base));
    const muts = [
        ['a tree one failure short counted as reached', 'reached: after === 0 && base > 0', 'reached: after <= 1 && base > 0', 'reachedOnlyWhenNoFurtherFailure'],
        ['same zone downgraded to advisory', "mk('same-zone', 'violation'", "mk('same-zone', 'advisory'", 'sameZoneIsViolation'],
        ['shallowest zone wins', 'return (b.depth - a.depth) ||', 'return (a.depth - b.depth) ||', 'deepestWins'],
        ['centroid leaks into the AI payload', 'bbox: b6(p.bbox), equipment:', 'bbox: b6(p.bbox), centroid: p.centroid, equipment:', 'payloadClean'],
        ['loose name match treated as exact', "if (tag && desigCount[tag] === 1) out.exact.push({ pid: p.pid, sysId: dh[0].sysId, on: 'designator' });", "if (!hits.length && Object.keys(loose).length === 1) out.exact.push({ pid: p.pid, sysId: Object.keys(loose)[0], on: 'designator' }); else " + "if (tag && desigCount[tag] === 1) out.exact.push({ pid: p.pid, sysId: dh[0].sysId, on: 'designator' });", 'looseNeverExact'],
        ['a part number links by itself again (the old rule)', "if (tag && desigCount[tag] === 1) out.exact.push({ pid: p.pid, sysId: dh[0].sysId, on: 'designator' });", "if (hits.length === 1) out.exact.push({ pid: p.pid, sysId: hits[0].sysId, on: hits[0].on });", 'partNumberNeverExact'],
        ['an ATA code links by itself', "if (tag && desigCount[tag] === 1) out.exact.push({ pid: p.pid, sysId: dh[0].sysId, on: 'designator' });", "if ((tag && desigCount[tag] === 1) || (hits.length === 1 && hits[0].on === 'ata')) out.exact.push({ pid: p.pid, sysId: tag ? dh[0].sysId : hits[0].sysId, on: 'designator' });", 'ataNeverExact'],
        ['a designator carried by two CAD parts links by itself', 'if (tag && desigCount[tag] === 1)', 'if (tag && desigCount[tag] >= 1)', 'dupDesignatorNeverExact'],
        ['the designator loses precedence to the part number', "if (_ids(s.designator).some(function (d) { return d === p.name || d === p.designator; })) on = 'designator';\n                else if (p.partNumber && _ids(s.partNumber).concat(_ids(s.partNumbers)).indexOf(p.partNumber) >= 0) on = 'partNumber';", "if (p.partNumber && _ids(s.partNumber).concat(_ids(s.partNumbers)).indexOf(p.partNumber) >= 0) on = 'partNumber';\n                else if (_ids(s.designator).some(function (d) { return d === p.name || d === p.designator; })) on = 'designator';", 'designatorStillExact'],
        ['containment proposes from every match, not confirmed links', 'var eq = equipmentParts(cadId);\n        Object.keys(eq)', 'var eq = {}; matchEquipment(cadId).exact.forEach(function (e) { (eq[e.sysId] = eq[e.sysId] || []).push(e.pid); }); Object.keys(eq).forEach(function (k) { eq[k].sort(); });\n        Object.keys(eq)', 'noAssignWithoutLink'],
        ['flag order left to input order (tree walk and final sort)', [["_pages().slice().sort(function (a, b) { return _cmp(a.id, b.id); }).forEach(function (pg) {\n            (function walk(g, seen)", "_pages().forEach(function (pg) {\n            (function walk(g, seen)"], ["out.sort(function (a, b) { return (sevO[a.severity] - sevO[b.severity])", "out.slice(function (a, b) { return (sevO[a.severity] - sevO[b.severity])"]], null, 'orderedFlags'],
        ['rotor burst default spread changed', "var DEFAULT_FRAGMENT = 'intermediate';", "var DEFAULT_FRAGMENT = 'small';", 'spreadDefault5']
    ];
    muts.forEach(([name, from, to, key]) => {
        const pairs = Array.isArray(from) ? from : [[from, to]];
        if (pairs.some(([f]) => SRC.indexOf(f) < 0)) { check('M: mutation anchor present: ' + name, false, 'anchor not found'); return; }
        const r = probe(pairs.reduce((src, [f, t]) => src.replace(f, t), SRC));
        check('M: goes red when ' + name + ' (the engine still runs; the guarded property fails)', !r.crashed && r[key] === false, J(r));
    });
}

// ===================================================================== N  wiring
console.log('\n[N] wiring');
{
    const at = f => IDX.indexOf('<script src="' + f + '?v=');
    check('N: cad_zonal.js is in the page after zonal_model.js, fta_engine.js, change_ack.js and sl_env.js', at('cad_zonal.js') > at('zonal_model.js') && at('zonal_model.js') > 0 && at('cad_zonal.js') > at('fta_engine.js') && at('cad_zonal.js') > at('change_ack.js') && at('cad_zonal.js') > at('sl_env.js'));
    check('N: loads right after zonal_model.js', /zonal_model\.js\?v=1\.2" defer><\/script>\s*\n\s*<script src="cad_zonal\.js\?v=[\d.]+" defer><\/script>/.test(IDX));
    check('N: no eval, no new Function, no DOM in the engine', !/\beval\s*\(|new Function|document\./.test(SRC));
    check('N: no em dash in the new module or this test', SRC.indexOf(EM) < 0 && fs.readFileSync(__filename, 'utf8').indexOf(EM) < 0);
    const mod = require(path.join(__dirname, '..', 'site', 'cad_zonal.js'));
    check('N: module.exports carries the contract', ['importZoneList', 'containment', 'matchEquipment', 'confirmLink', 'rejectLink', 'applyContainment', 'clearances', 'partsInVolume', 'zoneImpact', 'riskImpact', 'independenceFlags', 'diffRevision', 'aiPayload'].every(k => typeof mod[k] === 'function'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/*
 * Regression: each risk area's 3D shape goes to Sys Lab in the zonal exchange (17 Oct 2026).
 *
 * THE REQUIREMENT (Waqas, 17 Oct 2026): Safety Lab's zonal export (site/zonal_exchange.js, the
 * "safetylab-zonal" file) sends each risk area with its parts, zones, conditions and mitigation
 * but not its shape. Send the shape, with its units, in a way Sys Lab can read and draw. Keep the
 * format at version 1 (an added field: older files still import, nothing changes meaning). Sys
 * Lab never edits a shape; an import never silently drops or moves one. On the Safety Lab side,
 * importing Sys Lab's file never touches the risk areas.
 *
 *   S1  every kind (box, sphere, cone, disk-sector with all its settings) goes out exactly as
 *       stored, with shapeUnits 'mm' and no shapeIssue
 *   S2  the shape in the file is a copy: changing the file never changes the project
 *   S3  a stored shape the engine refuses still goes out, with shapeIssue saying why (never
 *       dropped, never drawn as if fine)
 *   S4  a risk area stored with no shape: no shape fields (nothing invented)
 *   S5  the fingerprint covers the shape: a shape moved by 1 mm in the file is refused
 *   S6  format still version 1; a file written before shapes (no shape fields) still reads
 *   S7  deterministic: the same project gives the same bytes, also with every list reversed
 *   S8  the shape in the file holds exactly the parts the file lists for that risk (the engine's
 *       own inShape on the exported numbers), so a reader drawing it draws the same volume
 *   S9  importing Sys Lab's file (and accepting its mappings) leaves every risk area byte for byte
 *   S10 the fixtures Sys Lab's tests read carry the shapes
 *   S11 mutations: each deliberate break turns a check red
 *   S12 wiring: script tag version, no em dash
 *
 * Run: node tests/regression_zonal_shape_20261017.test.js
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
const AT = '2026-10-17T09:00:00.000Z';

// ---------------------------------------------------------------- a small aircraft
const box = (x0, x1, y0, y1, z0, z1) => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
const part = (pid, name, b, extra) => Object.assign({ pid, name, partNumber: null, path: ['Aircraft', name], bbox: b }, extra || {});
const PARTS = () => [
    part('p-fcc1', 'FCC-1', box(1400, 1550, -100, 100, -100, 100), { designator: 'FCC-1' }),
    part('p-fcc2', 'FCC-2', box(1800, 2000, -100, 100, -100, 100), { designator: 'FCC-2' }),
    part('p-hyd', 'HYD pump', box(4500, 4800, -200, 200, -200, 200), { designator: 'HYD-P1' }),
    part('p-wing', 'Wing spar', box(3000, 3100, 2900, 3100, -10, 10)),
    part('p-nose', 'Pitot probe', box(-500, -400, 0, 10, 0, 10))
];
const ZONES = [
    { code: '100', name: 'Fuselage', parentCode: '', xMin: -1000, yMin: -1500, zMin: -1500, xMax: 10000, yMax: 1500, zMax: 1500 },
    { code: '110', name: 'Avionics bay', parentCode: '100', xMin: 1000, yMin: -1500, zMin: -1500, xMax: 3000, yMax: 1500, zMax: 1500 },
    { code: '500', name: 'Wing', parentCode: '', xMin: 0, yMin: 1500, zMin: -500, xMax: 9000, yMax: 9000, zMax: 500 }
];
const SYS = () => [{ id: 'FCC1', name: 'Flight control computer 1', designator: 'FCC-1' }, { id: 'FCC2', name: 'Flight control computer 2', designator: 'FCC-2' }, { id: 'HYD', name: 'Hydraulic pump', designator: 'HYD-P1' }];
const TREES = () => [{ id: 'P1', name: 'SF-001', linkedFhaIds: [7], root: { id: 'G1', type: 'gate', gateType: 'AND', displayId: 'SF-001', name: 'Loss of pitch control', children: [
    { id: 'BE1', type: 'basic', displayId: 'BE1', name: 'FCC-1 fails', probability: 1e-5, identity: { kind: 'item', systemId: 'FCC1' } },
    { id: 'BE2', type: 'basic', displayId: 'BE2', name: 'FCC-2 fails', probability: 1e-5, identity: { kind: 'item', systemId: 'FCC2' } }] } }];
// the four kinds, with every setting each one takes
const VOLS = () => [
    { id: 'prv-box', kind: 'fire', label: 'Hydraulic bay fire', shape: { kind: 'box', min: [4400, -300, -300], max: [4900, 300, 300] } },
    { id: 'prv-sphere', kind: 'tireBurst', label: 'Tire burst', shape: { kind: 'sphere', center: [1500, 0, 0], radius: 250.5 } },
    { id: 'prv-cone', kind: 'birdStrike', label: 'Bird strike', shape: { kind: 'cone', apex: [-1500, 0, 0], axis: [1, 0, 0], halfAngleDeg: 30, length: 3200 } },
    { id: 'prv-disk', kind: 'rotorBurst', label: 'No. 1 engine rotor burst', praId: 'PRA-001', shape: { kind: 'disk-sector', center: [1800, 3000, 0], axis: [1, 0, 0], range: 5000, fragment: 'oneThirdDisc', spreadDeg: 3, fromDeg: 10, toDeg: 200, refDir: [0, 0, 1] } },
    { id: 'prv-disk-r', kind: 'rotorBurst', label: 'APU rotor burst (reach named radius)', shape: { kind: 'disk-sector', center: [9000, 0, 0], axis: [1, 0, 0], radius: 1200 } }
];

function load(src, opts) {
    opts = opts || {};
    const sb = { console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, Promise, isFinite, parseFloat, Int32Array, setTimeout: () => 0,
        scheduleAutosave: () => {}, projectName: 'Shape aircraft', projectConfig: {}, systemsData: SYS(),
        acFhaData: [{ internalId: 7, fcId: 'SF-001', fcDesc: 'Loss of pitch control', severity: 'Catastrophic' }], ftaPages: TREES(), zsaData: [],
        praData: [{ internalId: 11, praId: 'PRA-001', threat: 'Uncontained rotor burst', mitigation: 'Shield the avionics bay', affectedZones: ['110'] }],
        SLChangeAck: { batch: (label, fn) => Promise.resolve({ acknowledged: true, result: fn() }), describe: () => {} } };
    if (opts.reverse) sb.systemsData.reverse();
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    vm.createContext(sb);
    vm.runInContext(ZM, sb, { filename: 'zonal_model.js' });
    vm.runInContext(FE, sb, { filename: 'fta_engine.js' });
    vm.runInContext(CZ, sb, { filename: 'cad_zonal.js' });
    vm.runInContext(REFS, sb, { filename: 'pra_refs_data.js' });
    vm.runInContext(PM, sb, { filename: 'pra_models.js' });
    vm.runInContext(src || SRC, sb, { filename: 'zonal_exchange.js' });
    return sb;
}
function scenario(src, opts) {
    opts = opts || {};
    const sb = load(src, opts), C = sb.SLCadZonal, X = sb.SLZonalExchange;
    C.importZoneList(opts.reverse ? ZONES.slice().reverse() : ZONES);
    const parts = PARTS(); if (opts.reverse) parts.reverse();
    const m = C.addCadModel({ fileName: 'shape.step', sha256: 'ssss', revision: 'A', importedAt: AT, units: 'mm', parts }).model;
    C.applyExactLinks(m.id, 'exact identifier match', { at: AT });
    C.applyContainment(m.id, { apply: true, by: 'W. Engineer' });
    const vols = VOLS(); if (opts.reverse) vols.reverse();
    vols.forEach(v => { const r = C.addRiskVolume(Object.assign({ source: 'manual' }, v)); if (!r.ok) throw new Error('volume ' + v.id + ': ' + r.err); });
    return { sb, C, X, m, pic: () => X.exportPicture({ at: AT }) };
}
const physV2 = () => ({ app: 'syslab-physical', version: 2, exportedAt: AT, projectName: 'Shape aircraft',
    functions: [{ funcId: 'F-1', name: 'Pitch command', level: 'system', system: 'FCS' }],
    systems: [{ code: 'FCS', name: 'Flight controls', performs: ['F-1'] }],
    elements: [{ tag: 'FCC-1', ident: 'E1', name: 'Flight control computer 1', kind: 'unit', system: 'FCS', zone: '110', cadPart: 'FCC-1', performs: ['F-1'], slEquipment: 'FCC1' },
               { tag: 'FCC-2', ident: 'E2', name: 'Flight control computer 2', kind: 'unit', system: 'FCS', zone: '110', performs: ['F-1'] }],
    allocations: [], zones: [] });

// the checks, as a function of one scenario, so the mutations run the same checks
async function run(src, quiet) {
    const res = [];
    const ck = (n, c, d) => res.push([n, !!c, d]);
    const S = scenario(src), P = S.pic(), byId = id => P.risks.find(r => r.id === id);
    // S1
    for (const v of VOLS()) {
        const r = byId(v.id), stored = S.C.riskVolume(v.id);
        ck('S1: ' + v.shape.kind + ' (' + v.id + ') goes out exactly as stored, in mm, no issue', r && J(r.shape) === J(stored.shape) && r.shapeUnits === 'mm' && !('shapeIssue' in r), r && J(r.shape));
    }
    ck('S1: a rotor burst stored without a spread gets the engine default when stored, and that is what goes out', J(byId('prv-disk-r').shape) === J(S.C.riskVolume('prv-disk-r').shape) && typeof byId('prv-disk-r').shape.spreadDeg === 'number');
    // S2
    { const before = J(S.sb.projectConfig.praVolumes); const p2 = S.pic(); p2.risks.forEach(r => { r.shape.kind = 'box'; if (r.shape.center) r.shape.center[0] = -1; });
      ck('S2: changing the shapes in an exported file never changes the project', J(S.sb.projectConfig.praVolumes) === before); }
    // S3
    { const T = scenario(src); T.sb.projectConfig.praVolumes.push({ id: 'prv-bad', kind: 'generic', label: 'Damaged', source: 'manual', shape: { kind: 'sphere', center: [0, 0, 0], radius: -5 } });
      const r = T.pic().risks.find(x => x.id === 'prv-bad');
      ck('S3: a shape the engine refuses still goes out, exactly as stored, with the engine\'s reason', r && J(r.shape) === J({ kind: 'sphere', center: [0, 0, 0], radius: -5 }) && r.shapeUnits === 'mm' && r.shapeIssue === T.C.shapeIssue(r.shape) && /positive radius/.test(r.shapeIssue), r && r.shapeIssue); }
    // S4
    { const T = scenario(src); T.sb.projectConfig.praVolumes.push({ id: 'prv-none', kind: 'generic', label: 'No shape stored', source: 'manual' });
      const r = T.pic().risks.find(x => x.id === 'prv-none');
      ck('S4: a risk area with no stored shape is sent with no shape fields', r && !('shape' in r) && !('shapeUnits' in r) && !('shapeIssue' in r)); }
    // S5
    { const t = JSON.parse(J(P)); t.risks.find(r => r.id === 'prv-sphere').shape.center[0] += 1;
      ck('S5: a shape moved by 1 mm in the file is refused by the fingerprint', /fingerprint/.test(S.X.checkPicture(t) || ''));
      const u = JSON.parse(J(P)); delete u.risks.find(r => r.id === 'prv-cone').shape;
      ck('S5: a shape removed from the file is refused by the fingerprint', /fingerprint/.test(S.X.checkPicture(u) || '')); }
    // S6
    { ck('S6: still format safetylab-zonal version 1, from this generator', P.format === 'safetylab-zonal' && P.version === 1 && P.generator === 'Safety Lab Aero zonal exchange ' + S.X.VERSION && S.X.FORMAT_VERSION === 1);
      ck('S6: the file verifies', S.X.checkPicture(P) === null, S.X.checkPicture(P));
      const old = JSON.parse(J(P)); old.risks.forEach(r => { delete r.shape; delete r.shapeUnits; delete r.shapeIssue; });
      const body = {}; ['cad', 'rules', 'kindLabels', 'zones', 'equipment', 'parts', 'risks', 'zoneHazards', 'exposures', 'praRows', 'sysLabMap', 'gaps'].forEach(k => { body[k] = old[k]; });
      old.contentHash = S.X.fp(body);
      ck('S6: a file written before shapes (no shape fields) still reads', S.X.checkPicture(old) === null); }
    // S7
    { const a = J(S.pic()), b = J(S.pic()), R = scenario(src, { reverse: true }).pic();
      ck('S7: the same project gives the same bytes twice', a === b);
      ck('S7: and the same risks and fingerprint with every input list reversed', J(R.risks) === J(P.risks) && R.contentHash === P.contentHash); }
    // S8
    { const C = S.C, m = S.m, parts = C.partsOf(C.model(m.id));
      const samples = b => { const o = []; for (const x of [b.min[0], (b.min[0] + b.max[0]) / 2, b.max[0]]) for (const y of [b.min[1], (b.min[1] + b.max[1]) / 2, b.max[1]]) for (const z of [b.min[2], (b.min[2] + b.max[2]) / 2, b.max[2]]) o.push([x, y, z]); return o; };
      let all = true, any = 0;
      for (const r of P.risks) {
        const sh = JSON.parse(J(r.shape)), inside = parts.filter(p => C.inShape(sh, p.centroid) || samples(p.bbox).some(q => C.inShape(sh, q))).map(p => p.pid).sort();
        if (J(inside) !== J(r.parts)) all = false; any += r.parts.length;
      }
      ck('S8: each exported shape, read back from the file, holds exactly the parts the file lists for it', all && any > 0); }
    // S9
    { const T = scenario(src), before = J(T.sb.projectConfig.praVolumes), seq = T.sb.projectConfig.praVolumeSeq;
      const rd = T.X.readSysLab(physV2(), 'phys.json');
      await T.X.importSysLab(rd.data, 'W. Engineer', { at: AT });
      await T.X.acceptExact('W. Engineer', { at: AT });
      const k = T.X.matchSysLab().candidates[0]; if (k) await T.X.confirmMap(k.key, k.sysIds[0], 'W. Engineer', { at: AT });
      await T.X.importSysLab(rd.data, 'W. Engineer', { at: AT });
      ck('S9: importing Sys Lab\'s file twice and mapping leaves every risk area byte for byte', rd.ok && J(T.sb.projectConfig.praVolumes) === before && T.sb.projectConfig.praVolumeSeq === seq && !!T.sb.projectConfig.sysLabPhysical);
      ck('S9: and the shapes exported after are the shapes exported before', J(T.pic().risks.map(r => [r.id, r.shape, r.shapeUnits])) === J(P.risks.map(r => [r.id, r.shape, r.shapeUnits]))); }
    if (!quiet) res.forEach(([n, c, d]) => check(n, c, d));
    return res;
}

(async () => {
    console.log('\n[S1 to S9] the shape in the file');
    const base = await run(SRC, false);

    console.log('\n[S10] the fixtures Sys Lab reads');
    for (const f of ['safetylab-zonal.json', 'safetylab-zonal-b.json']) {
        const p = path.join(FIX, f), d = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
        check('S10: ' + f + ' carries a shape in mm on every risk, and verifies', d && d.risks.length > 0 && d.risks.every(r => r.shape && r.shape.kind && r.shapeUnits === 'mm' && !r.shapeIssue) && load().SLZonalExchange.checkPicture(d) === null);
    }

    console.log('\n[S11] mutations (each must turn a check red)');
    const muts = [
        ['shape not sent', ['_withShape(risks[risks.length - 1], v, C);', '']],
        ['units not sent', ['r.shapeUnits = SHAPE_UNITS;', '']],
        ['units in meters', ["SHAPE_UNITS = 'mm'", "SHAPE_UNITS = 'm'"]],
        ['shape shared with the project, not copied', ['r.shape = _clone(v.shape);', 'r.shape = v.shape;']],
        ['refused shape dropped', ["if (!v || !v.shape || typeof v.shape !== 'object' || Array.isArray(v.shape)) return r;", "if (!v || !v.shape || typeof v.shape !== 'object' || Array.isArray(v.shape) || (C && C.shapeIssue(v.shape))) return r;"]],
        ['refused shape sent without its reason', ['if (bad) r.shapeIssue = String(bad);', '']],
        ['shape rounded on the way out', ['r.shape = _clone(v.shape);', 'r.shape = JSON.parse(JSON.stringify(v.shape, function (k, x) { return typeof x === "number" ? Math.round(x) : x; }));']],
        ['shape left out of the fingerprint', ['contentHash: fp(body) };', "contentHash: fp(JSON.parse(JSON.stringify(body, function (k, x) { return k === 'shape' ? undefined : x; }))) };"]],
        ['empty shape invented for a risk with none', ["if (!v || !v.shape || typeof v.shape !== 'object' || Array.isArray(v.shape)) return r;", "if (!v || !v.shape || typeof v.shape !== 'object' || Array.isArray(v.shape)) { r.shape = {}; r.shapeUnits = SHAPE_UNITS; return r; }"]]
    ];
    for (const [name, pair] of muts) {
        if (SRC.indexOf(pair[0]) < 0) { check('S11: mutation anchor present: ' + name, false, 'anchor not found'); continue; }
        let red = false;
        try { const r = await run(SRC.replace(pair[0], pair[1]), true); red = r.some(x => !x[1]); } catch (e) { red = true; }
        check('S11: mutation caught: ' + name, red);
    }

    console.log('\n[S12] wiring');
    {
        const IDX = read('index.html'), X = require('../site/zonal_exchange.js');
        check('S12: index.html loads zonal_exchange.js at the module\'s own version', IDX.indexOf('zonal_exchange.js?v=' + X.VERSION + '"') > 0, X.VERSION);
        check('S12: no em dash, no eval in the module', SRC.indexOf(EM) < 0 && !/\beval\(|new Function\(/.test(SRC));
        check('S12: the header documents the shape fields and the unit', /shape\?, shapeUnits\?, shapeIssue\?/.test(SRC) && /millimeters/.test(SRC));
    }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail || !base.length ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); });

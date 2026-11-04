#!/usr/bin/env node
/* The Aeolus HL-1 demo's CAD model, zones and risk volumes, made by Safety Lab's own code (4 Nov 2026).
     node tools/demo/hl1_cad/make_step.js site/demo/aeolus_hl1.step
     node tools/demo/hl1_cad/build_demo_cad.js
   Reads site/demo/aeolus_hl1.step with Safety Lab's STEP reader and OpenCascade build (site/cad_*.js, vendor/occt-fast),
   then, on the HL-1 project from demo_showcase_hl1.js, runs the CAD page's own engine (cad_zonal.js, zonal_model.js):
   the CAD model added, the zone list imported (47 zones with boxes), parts linked to equipment by designator, every
   part placed in its zone (containment), and the particular-risk volumes added. Writes:
     site/demo/hl1_cad_data.js   window.SL_HL1_CAD = { sha256, fileName, projectConfig keys the demo adds }
     site/demo/hl1_cad_step.js   window.SL_HL1_STEP = the STEP text (the viewer reads it when the geometry is not cached
                                 yet; checked against the fingerprint like any re-opened file)
   Deterministic: the same STEP gives the same files. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const REPO = path.join(__dirname, '..', '..', '..'), SITE = path.join(REPO, 'site');
const GEO = require('./geometry');
const ITEMS = require('./items'), ITEM_BY_ID = {}; for (const it of ITEMS) ITEM_BY_ID[it.id] = it;
const STEP = process.argv[2] || path.join(SITE, 'demo', 'aeolus_hl1.step');
const AT = '2026-10-15T09:00:00.000Z', BY = 'Aisha Okonkwo', MM = 1000;
const CAD_KEYS = ['cadModels', 'cadLinks', 'cadSeq', 'zones', 'zonesSchema', 'zoneSeq', 'zoneBarriers', 'praVolumes', 'praVolumeSeq'];

function sandbox(extra) {
  const sb = Object.assign({ console, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, Promise, isFinite, parseFloat, parseInt, TextEncoder, TextDecoder,
    Uint8Array, Int8Array, Int32Array, Uint32Array, Uint16Array, Float32Array, Float64Array, ArrayBuffer, DataView, setTimeout: () => 0 }, extra || {});
  sb.window = sb; sb.globalThis = sb; sb.self = sb;
  vm.createContext(sb);
  return sb;
}
const run = (sb, f) => vm.runInContext(fs.readFileSync(path.join(SITE, f), 'utf8'), sb, { filename: f });

(async () => {
  const t0 = Date.now();
  // 1. the parts, exactly as the CAD page reads them
  const rd = sandbox();
  for (const f of ['cad_step_struct.js', 'cad_import.js', 'cad_brep.js']) run(rd, f);
  const FM = await require(path.join(SITE, 'vendor', 'occt-fast', 'slcad_occt.js'))({ print: () => {}, printErr: () => {}, locateFile: (p) => path.join(SITE, 'vendor', 'occt-fast', p) });
  const bytes = new Uint8Array(fs.readFileSync(STEP));
  const cf = rd.SLCadBrep.convertFast(FM, bytes, { keep: false });
  if (!cf.model.tree || !cf.model.tree.full) throw new Error('The STEP structure was not read in full.');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const parts = rd.SLCadImport.projectEntry(cf.model, {}).parts;

  // 2. the HL-1 project and the CAD page's engine
  const { build } = require(path.join(SITE, 'demo_showcase_hl1.js'));
  const sl = build();
  const sb = sandbox({ scheduleAutosave: () => {}, projectName: sl.projectName, projectConfig: sl.projectConfig, systemsData: sl.systemsData, acFhaData: sl.acFhaData, ftaPages: sl.ftaPages, zsaData: sl.zsaData, praData: sl.praData,
    SLChangeAck: { batch: (label, fn) => Promise.resolve({ acknowledged: true, result: fn() }), describe: () => {} } });
  for (const f of ['zonal_model.js', 'fta_engine.js', 'cad_zonal.js']) run(sb, f);
  const C = sb.SLCadZonal;
  const box = (b) => ({ xMin: b[0] * MM, xMax: b[1] * MM, yMin: b[2] * MM, yMax: b[3] * MM, zMin: b[4] * MM, zMax: b[5] * MM });
  const rows = GEO.ZONES.map(([code, name, b]) => Object.assign({ code, name, parentCode: '' }, box(b))).concat(GEO.CHILDREN.map(([code, name, b, parent]) => Object.assign({ code, name, parentCode: parent }, box(b))));
  const zr = C.importZoneList(rows);
  if (zr.issues && zr.issues.length) throw new Error('Zone list: ' + zr.issues.join('; '));
  const added = C.addCadModel({ fileName: path.basename(STEP), sha256, revision: 'A', importedAt: AT, units: 'mm', parts });
  if (!added.ok) throw new Error('addCadModel: ' + JSON.stringify(added.issues));
  const m = added.model;
  C.applyExactLinks(m.id, 'exact identifier match', { at: AT });
  // every installed unit linked to the HL-1 system it belongs to (by its designator, the unit's ident in items.js); the
  // systems Safety Lab's HL-1 does not analyze (navigation, communications, ...) stay unlinked, as in a real program
  const SYSMAP = { FCS: 'sys-fcs', PROP: 'sys-prp', PP1: 'sys-prp1', PP2: 'sys-prp2', PP3: 'sys-prp3', PP4: 'sys-prp4', EPS: 'sys-eps', HYD: 'sys-hyd', HYDA: 'sys-hyd-a', HYDB: 'sys-hyd-b', HYDC: 'sys-hyd-c',
    FUEL: 'sys-fue', LDG: 'sys-ldg', AVI: 'sys-avi', IPS: 'sys-ips', ECS: 'sys-ecs', CRG: 'sys-crg', NZD: 'sys-nzd', EWIS: 'sys-ews', FPR: 'sys-fpr', OXY: 'sys-oxy' };
  const ENGINE_SUB = ['EFC', 'IGN', 'EAIR', 'EIND', 'OIL', 'STRT', 'TRV', 'ECTL'];
  let sysLinked = 0;
  for (const p of m.parts) {
    const it = ITEM_BY_ID[p.designator];
    if (!it) continue;
    const code = it.sys;
    let sysId = SYSMAP[code] || null;
    if (!sysId && ENGINE_SUB.indexOf(code) >= 0) { const n = /-(\d)\b/.exec(p.designator || p.name || ''); sysId = n ? 'sys-prp' + n[1] : 'sys-prp'; }
    if (!sysId || !sl.systemsData.some((s) => s.id === sysId)) continue;
    const r = C.confirmLink(m.id, p.pid, sysId, BY, { on: 'system', at: AT });
    if (r && r.ok) sysLinked++;
  }
  const ct = C.applyContainment(m.id, { apply: true, by: BY });
  // 3. the particular-risk volumes, each tied to its PRA row in the HL-1 project
  const vols = [];
  for (const e of GEO.ENG) vols.push({ kind: 'rotorBurst', label: 'Engine ' + e.n + ' rotor burst', praId: 'PRA-001', shape: { kind: 'disk-sector', center: [(GEO.ENG_X[0] + 0.7) * MM, e.y * MM, GEO.ENG_Z * MM], axis: [1, 0, 0], range: 30 * MM, spreadDeg: 15 } });
  for (const [x, y] of [[49, -4.8], [56, -4.8], [49, 4.8], [56, 4.8]]) vols.push({ kind: 'tireBurst', label: 'Tire burst, main bogie ' + (y < 0 ? 'left' : 'right') + (x < 52 ? ' forward' : ' aft'), praId: 'PRA-003', shape: { kind: 'sphere', center: [x * MM, y * MM, 1.3 * MM], radius: 2.5 * MM } });
  vols.push({ kind: 'fire', label: 'Wheel-well fire after a rejected take-off', praId: 'PRA-012', shape: { kind: 'box', min: [45 * MM, -6.8 * MM, 0], max: [61 * MM, 6.8 * MM, 3.4 * MM] } });
  vols.push({ kind: 'fire', label: 'Hold fire', praId: 'PRA-008', shape: { kind: 'box', min: [8.5 * MM, -4.3 * MM, 3.4 * MM], max: [95 * MM, 4.3 * MM, 11 * MM] } });
  for (const v of vols) { const r = C.addRiskVolume(Object.assign({ source: 'manual' }, v)); if (!r.ok) throw new Error(v.label + ': ' + r.err); }

  // 4. what the demo adds to the project
  const pc = sb.projectConfig, add = {};
  for (const k of CAD_KEYS) if (pc[k] !== undefined) add[k] = pc[k];
  const data = { v: 1, fileName: path.basename(STEP), sha256, stepScript: 'demo/hl1_cad_step.js', projectConfig: add };
  const OUTD = process.env.SL_HL1_CAD_OUT || path.join(SITE, 'demo');   // a test rebuilds into a folder of its own
  const header = '// Generated by tools/demo/hl1_cad/build_demo_cad.js from ' + path.basename(STEP) + ' (sha256 ' + sha256 + '). Do not edit by hand.\n';
  fs.writeFileSync(path.join(OUTD, 'hl1_cad_data.js'), header + 'window.SL_HL1_CAD = ' + JSON.stringify(data) + ';\n');
  fs.writeFileSync(path.join(OUTD, 'hl1_cad_step.js'), header + 'window.SL_HL1_STEP = ' + JSON.stringify({ sha256, text: Buffer.from(bytes).toString('latin1') }) + ';\n');
  const linked = sysLinked;
  const placed = (pc.zones || []).reduce((n, z) => n + ((z.equipment || []).length), 0);
  console.log(JSON.stringify({ parts: parts.length, sha256: sha256.slice(0, 12), zones: (pc.zones || []).length, zonesWithBox: (pc.zones || []).filter((z) => z.volume).length, linked, equipmentPlaced: placed, volumes: (pc.praVolumes || []).length, containment: ct && ct.summary, ms: Date.now() - t0 }));
})().catch((e) => { console.error(e.stack || e); process.exit(1); });

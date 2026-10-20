'use strict';
/* The Aeolus HL-1 demo on Safety Lab's side, headless (19 Oct 2026, build 7): Safety Lab's project as the demo build
   leaves it (zones from CAD, parts placed, risk volumes), with Sys Lab's physical architecture file (version 3, the
   routes) imported, for the ZSA tests. Fixtures: tests/fixtures/zonal_exchange/aeolus-safetylab.json and
   aeolus-syslab-physical.json (written by Sys Lab's Aeolus demo build). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', '..', 'site');
const FIX = path.join(__dirname, '..', 'fixtures', 'zonal_exchange');
const FILES = ['zonal_model.js', 'node_identity.js', 'fta_engine.js', 'cad_zonal.js', 'independence_claims.js', 'physical_independence.js', 'physical_crosscheck.js', 'equipment_hazards.js', 'zonal_exchange.js', 'zsa_engine.js'];
function load(over, files) {
  const sl = JSON.parse(fs.readFileSync(path.join(FIX, (files && files.safetylab) || 'aeolus-safetylab.json'), 'utf8'));
  const sb = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, Promise, isFinite, parseFloat, parseInt, Symbol, Int32Array, Float32Array, Float64Array, Uint8Array, Uint32Array,
    setTimeout: () => 0, clearTimeout() {}, scheduleAutosave() {}, SLChangeAck: { batch: (label, fn) => Promise.resolve({ acknowledged: true, result: fn() }), describe() {} } };
  ['projectName', 'projectConfig', 'systemsData', 'acFhaData', 'ftaPages', 'zsaData', 'praData', 'routingData', 'acReqData', 'itemsData', 'cmaData'].forEach(k => { sb[k] = sl[k] !== undefined ? sl[k] : (k === 'projectName' ? '' : k === 'projectConfig' ? {} : []); });
  sb.window = sb; sb.globalThis = sb; sb.self = sb; vm.createContext(sb);
  FILES.forEach(f => vm.runInContext((over && over[f]) || fs.readFileSync(path.join(SITE, f), 'utf8'), sb, { filename: f }));
  if (sb.ZONES.upgrade) sb.ZONES.upgrade({ at: '2026-10-19T12:00:00Z' });
  return sb;
}
async function withSysLab(sb, file) {
  const obj = JSON.parse(fs.readFileSync(path.join(FIX, file || 'aeolus-syslab-physical.json'), 'utf8'));
  const r = sb.SLZonalExchange.readSysLab(obj, 'aeolus-syslab-physical.json');
  if (!r.ok) throw new Error(r.err);
  const res = await sb.SLZonalExchange.importSysLab(r.data, 'Mei Lin Tan', { at: '2026-10-19T12:00:00Z' });
  return res;
}
module.exports = { load, withSysLab, FILES, SITE, FIX };

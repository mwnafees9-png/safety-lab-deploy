'use strict';
/* Every demo project Safety Lab ships, built headless (19 Oct 2026), for tests that must hold on all of them
   (the zones-3 upgrade first). Returns [{ key, name, data }] with data a plain project object (a fresh copy). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', '..', 'site');
function sandbox() {
  const sb = { console: { log() {}, warn() {}, error() {}, info() {} }, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, Promise, isFinite, parseFloat, parseInt, Symbol, Int32Array, Float64Array, Uint8Array,
    setTimeout: () => 0, clearTimeout() {}, document: undefined, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } };
  sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.module = { exports: {} };
  vm.createContext(sb); return sb;
}
function fromFile(file, pick, pre) {
  const sb = sandbox();
  (pre || []).forEach(f => vm.runInContext(fs.readFileSync(path.join(SITE, f), 'utf8'), sb, { filename: f }));
  vm.runInContext(fs.readFileSync(path.join(SITE, file), 'utf8'), sb, { filename: file });
  return pick(sb);
}
const clone = o => JSON.parse(JSON.stringify(o));
function all() {
  const out = [];
  const add = (key, fn) => { try { const d = fn(); if (d && typeof d === 'object') out.push({ key, name: d.projectName || key, data: clone(d) }); else out.push({ key, error: 'no project' }); } catch (e) { out.push({ key, error: String(e && e.message || e) }); } };
  const demos = fromFile('demo_projects.js', sb => sb.SL_DEMOS || {});
  Object.keys(demos).forEach(k => add('demo:' + k, () => demos[k]));
  add('showcase:kestrel', () => fromFile('demo_showcase.js', sb => sb.SL_SHOWCASE.build(), ['demo_kit.js']));
  add('showcase:halcyon', () => fromFile('demo_showcase_halcyon.js', sb => (sb.SL_SHOWCASE_HALCYON || sb.module.exports).build()));
  add('showcase:vayu', () => fromFile('demo_showcase_vayu.js', sb => (sb.SL_SHOWCASE_VAYU || sb.module.exports).build(), ['demo_kit.js']));
  add('showcase:sora', () => fromFile('demo_showcase_sora.js', sb => sb.SL_SHOWCASE_SORA.build(), ['demo_kit.js']));
  add('showcase:hl1', () => require(path.join(SITE, 'demo_showcase_hl1.js')).build());
  add('showcase:kestrel25', () => fromFile('demo_showcase_kestrel25.js', sb => { const k = Object.keys(sb).find(n => /^SL_SHOWCASE/.test(n)); return (k ? sb[k] : sb.module.exports).build(); }));
  return out;
}
module.exports = { all, SITE };

#!/usr/bin/env node
/*
 * Regression — ONE save rail, and a watcher so forgetting it cannot lose data (13 Sep 2026, R18).
 *
 * WHAT THE SWEEP FOUND. Three save rails: scheduleAutosave() (the only one that reached
 * the live sync), commitSaveChanges() (local + cloud, never the sync — ~40 modules), and
 * saveState() — a name that did not exist, so ten modules silently never saved. Plus a
 * long list of writers that called nothing at all (auto-requirements Accept, fault-tree
 * node editing, page delete, assumption edits, CSV/SysML/Jama imports, create system,
 * MAC recompile, Markov models, file open, undo/redo).
 *
 * PINNED:
 *   S1  saveState is gone from site/*.js (no call, no typeof probe)
 *   S2  scheduleAutosave returns true when accepted and false while suspended; it settles the watcher
 *   S3  commitSaveChanges announces the change through scheduleAutosave BEFORE it writes
 *   S4  every writer the sweep named now calls scheduleAutosave inside its own body
 *   S5  save_watch.js: a silent change is saved within one tick; an announced change is not saved
 *       twice; a refused call (autosave suspended) is retried; a hidden tab is left alone
 *   S6  wiring: save_watch.js is loaded after crdt_sync.js; __crdtFingerprint is exported
 *   S7  mutations go red (settle removed -> double save; acceptance check removed -> refused path lost)
 *
 * Run: node tests/regression_save_rails.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

console.log('[S1] the dead rail is gone');
{
  const offenders = fs.readdirSync(SITE).filter(f => f.endsWith('.js')).filter(f => /\bsaveState\s*\(|typeof\s+(window\.)?saveState\b/.test(read(f)));
  check('no site script calls or probes saveState()', offenders.length === 0, offenders.join(','));
}

// extract `function name(` ... brace-matched body
function fnBody(src, name, nth) {
  let from = 0, at = -1; nth = nth || 1;
  for (let k = 0; k < nth; k++) { at = src.indexOf('function ' + name + '(', from); if (at < 0) return null; from = at + 1; }
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) { const c = src[i]; if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) return src.slice(at, i + 1); } }
  return null;
}
const MISC = read('misc_fn_modules.js'), HELPERS = read('helpers_modules.js');

console.log('\n[S2] scheduleAutosave: accepted / suspended, settles the watcher');
{
  const src = fnBody(MISC, 'scheduleAutosave');
  const ctx = { _autosaveSuspended: false, _dirtySinceSave: false, _autosavePending: false, _autosaveFlushQueued: false, settled: 0,
    _quantClearCache() {}, _wsTrackActivity() {}, _updateSaveIndicator() {}, _writeAutosave() {}, queueMicrotask: () => {},
    window: { SafetyLabCRDT: { onLocalChange() { ctx.pushed = (ctx.pushed || 0) + 1; } }, SLSaveWatch: { settle() { ctx.settled++; } } } };
  vm.createContext(ctx); vm.runInContext(src + '; globalThis.__sa = scheduleAutosave;', ctx);
  check('returns true when the change is accepted', ctx.__sa() === true && ctx._dirtySinceSave === true && ctx.pushed === 1);
  check('settles the watcher once per accepted burst', ctx.settled === 1);
  ctx._autosaveSuspended = true;
  check('returns false while a load/merge has autosave suspended (nothing pushed, nothing settled)', ctx.__sa() === false && ctx.pushed === 1 && ctx.settled === 1);
}

console.log('\n[S3] the explicit Save rides the one rail');
{
  const src = fnBody(HELPERS, 'commitSaveChanges');
  const a = src.indexOf('scheduleAutosave()'), b = src.indexOf('_writeAutosave()');
  check('commitSaveChanges calls scheduleAutosave before it writes', a > 0 && b > a);
}

console.log('\n[S4] every writer the sweep named now announces its change');
{
  const SA = /scheduleAutosave\(\)/;
  const cases = [
    ['helpers_modules.js', 'autoReqAccept'], ['helpers_modules.js', 'updateNodeDataInline'], ['helpers_modules.js', 'updateACAsmState'],
    ['helpers_modules.js', 'updateACAsmText'], ['helpers_modules.js', 'updateACAsmRoute'], ['helpers_modules.js', 'promptCreateSystem'],
    ['helpers_modules.js', '_restoreSnap'], ['helpers_modules.js', 'loadProject'],
    ['support_modules.js', 'updateNodeData'], ['safety_lab.js', 'changeNodeType'],
    ['data_ops_modules.js', 'createNewAssumption'], ['data_ops_modules.js', 'importTabularCSV'], ['data_ops_modules.js', 'importFaultTreeCSV'],
    ['fta_quant_modules.js', 'deleteMarkovModel'],
  ];
  cases.forEach(([f, name]) => { const body = fnBody(read(f), name); check(f + ' ' + name + ' calls scheduleAutosave', !!body && SA.test(body), body ? 'missing' : 'function not found'); });
  // writers that are not top-level named functions: anchor on their distinctive text
  const anchored = [
    ['helpers_modules.js', "if (existing !== -1) ftaPages[existing] = page; else ftaPages.push(page);", 'MAC recompile'],
    ['fta_view_modules.js', "ftaPages = ftaPages.filter(p => p.id !== page.id);", 'fault-tree page delete'],
    ['importers.js', "showToast('Imported ' + added + ' requirement'", 'Jama commit'],
    ['importers.js', "// Refresh whatever tab is open so the new records show up.", 'SysML commit'],
    ['fta_quant_modules.js', "(projectConfig.markovModels = projectConfig.markovModels || []).push(m);", 'add Markov model'],
    ['toolchain_plan.js', "systemsData.push({ id: 'sys-' + Date.now()", 'toolchain create system'],
  ];
  anchored.forEach(([f, anchor, label]) => {
    const s = read(f), at = s.indexOf(anchor);
    const window = at >= 0 ? s.slice(Math.max(0, at - 400), at + anchor.length + 400) : '';
    check(f + ' ' + label + ' calls scheduleAutosave next to the write', at >= 0 && SA.test(window), at < 0 ? 'anchor not found' : 'no call within 400 chars');
  });
  // the ten modules that used the dead name now use the rail
  ['gt_integrity.js', 'lcc_module.js', 'msg3_ext.js', 'ram_settings.js', 'rbd_mc.js', 'rel_frameworks.js', 'sneak_module.js', 'swrel_module.js', 'vv_validation.js', 'reqif_import.js']
    .forEach(f => check(f + ' saves through scheduleAutosave', SA.test(read(f))));
}

console.log('\n[S5] save_watch.js behaviour');
const WATCH = read('save_watch.js');
function bootWatch(src) {
  const env = { fp: 'A', saves: 0, accept: true, hidden: false, micro: [] };
  const ctx = { window: null, document: { get visibilityState() { return env.hidden ? 'hidden' : 'visible'; } }, Date, setTimeout: () => 0,
    queueMicrotask: (f) => env.micro.push(f) };
  ctx.window = ctx;
  ctx.__crdtFingerprint = () => env.fp;
  ctx.scheduleAutosave = () => { if (!env.accept) return false; env.saves++; return true; };
  ctx.addEventListener = () => {};
  vm.createContext(ctx); vm.runInContext(src || WATCH, ctx);
  env.W = ctx.SLSaveWatch; env.flushMicro = () => { const q = env.micro.splice(0); q.forEach(f => f()); };
  return env;
}
{
  const e = bootWatch();
  check('first tick only takes a baseline', e.W.tick() === 'first' && e.saves === 0);
  check('no change -> nothing', e.W.tick() === 'same' && e.saves === 0);
  e.fp = 'B';
  check('a silent change is saved on the next tick', e.W.tick() === 'saved' && e.saves === 1);
  check('and only once', e.W.tick() === 'same' && e.saves === 1);
  // an announced change: the writer called scheduleAutosave (which calls settle); the watcher must not save it again
  e.fp = 'C'; e.saves++; e.W.settle(); e.flushMicro();
  check('an announced change (settled at burst end) is not saved a second time', e.W.tick() === 'same' && e.saves === 2);
  // an edit AFTER the settle is still caught
  e.fp = 'D';
  check('an edit after the announcement is still caught', e.W.tick() === 'saved' && e.saves === 3);
  // refused while suspended -> retried
  e.fp = 'E'; e.accept = false;
  check('refused while autosave is suspended', e.W.tick() === 'refused' && e.saves === 3);
  e.accept = true;
  check('retried and saved once the suspension lifts', e.W.tick() === 'saved' && e.saves === 4);
  e.fp = 'F'; e.hidden = true;
  check('a hidden tab is left alone', e.W.tick() === 'hidden' && e.saves === 4);
  e.hidden = false;
  check('and caught up when visible again', e.W.tick() === 'saved' && e.saves === 5);
  check('status reports the counts', e.W.status().caught === 4 && e.W.status().refused === 1);
}

console.log('\n[S6] wiring');
{
  const html = read('index.html');
  const a = html.indexOf('<script src="crdt_sync.js?v='), b = html.indexOf('<script src="save_watch.js?v=');
  check('save_watch.js is loaded, after crdt_sync.js', a > 0 && b > a);
  check('the fingerprint is exported for the watcher', /window\.__crdtFingerprint = __crdtFingerprint/.test(read('safety_lab.js')));
  check('scheduleAutosave settles the watcher', /SLSaveWatch\.settle\(\)/.test(fnBody(MISC, 'scheduleAutosave')));
}

console.log('\n[S7] mutations');
{
  const m1 = WATCH.replace("var run = function () { _settleQueued = false; var fp = _fp(); if (fp != null) _last = fp; };", "var run = function () { _settleQueued = false; };");
  check('mutation 1 applied (settle does nothing)', m1 !== WATCH);
  const e = bootWatch(m1); e.W.tick(); e.fp = 'C'; e.saves++; e.W.settle(); e.flushMicro();
  check('mutation 1: the announced change is saved twice (goes red)', e.W.tick() === 'saved' && e.saves === 2);
  const m2 = WATCH.replace("(window.scheduleAutosave() === true)", "(window.scheduleAutosave(), true)");
  check('mutation 2 applied (acceptance ignored)', m2 !== WATCH);
  const e2 = bootWatch(m2); e2.W.tick(); e2.fp = 'B'; e2.accept = false; const r = e2.W.tick(); e2.accept = true;
  check('mutation 2: a refused save is treated as done and the change is never retried (goes red)', r === 'saved' && e2.W.tick() === 'same' && e2.saves === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

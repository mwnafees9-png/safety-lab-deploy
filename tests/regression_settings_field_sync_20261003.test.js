#!/usr/bin/env node
/*
 * Regression: project settings sync field by field; the two safety switches only turn off
 * deliberately; the AI logs are append-only (3 Oct 2026, security batch 5).
 *
 * Before: projectConfig travelled as ONE last-writer-wins value. Any change (even one new AI
 * log line) resent the whole bundle, so two people changing different settings overwrote each
 * other, a stale copy could flip "export-controlled" or "AI off" back off, and one person's AI
 * log entries could wipe another's.
 *
 * THIS SUITE RUNS THE REAL crdt_sync.js WITH THE REAL BUNDLED YJS in vm "tabs" wired through a
 * fake broadcast channel (the same harness as regression_live_undo_per_user):
 *   F1  different settings changed at the same time: both survive, on both tabs
 *   F2  a stale copy cannot turn export control off; the switch stays on everywhere
 *   F3  a stale AI settings save keeps AI off on, but its other change goes through
 *   F4  unticking (a newer deliberate-off stamp) does turn them off, everywhere
 *   F5  a deliberate-off stamp OLDER than the last "on" does not
 *   F6  a tab joining with an old snapshot cannot turn export control off
 *   F7  AI audit log: entries from both tabs merge; a tab that drops entries locally does not
 *       delete them anywhere
 *   F8  AI draft log: same id from two tabs, both kept; the draft counter never goes backward
 *   F9  an OLDER BUILD (the pre-batch-5 crdt_sync, as on the 0.18 desktop) in the same project:
 *       its setting changes arrive, ours reach it, and its stale copy cannot turn export
 *       control off
 *   F10 undo still reverts a setting change, and an AI log entry is never an undo step
 *   F11 mutation: the same scenarios against the pre-batch-5 file go red (proves the suite
 *       measures the fix)
 *   F12 the toggles stamp deliberate changes; pins
 *   F15 no bouncing between tabs or builds (the settings are applied in place, key order kept)
 *   F16 the same setting in another key order is not a change (never re-sent, never answered)
 *   F16b an AI log entry in another key order is the same entry (no duplicates, nothing re-sent)
 *   F17 an older build's ON survives another older build's stale copy
 *   F18 two tabs tidying a long list of switch views at the same moment keep it ON
 *   F19 undo works on the two switches
 *   F20 a deliberate untick wins over a machine whose clock runs ahead
 *   F21 a lost message never starts a storm with an older build in the project
 *   F22 two older builds and one new tab: an older build's change is kept (the mirror keeps their key order)
 *   F23 restoring an older version in the tab that ticked export control does not turn it off
 *   F14 two switches stamped at once on two tabs: both stamps kept
 *   F13 an old (v1.0) AIC- entry in the cost log is shown in the draft log and never lost
 *
 * Run: node tests/regression_settings_field_sync_20261003.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = process.env.SLAB_SITE || path.join(__dirname, '..', 'site');
const SRC = fs.readFileSync(path.join(SITE, 'crdt_sync.js'), 'utf8');
const OLD = fs.readFileSync(path.join(__dirname, 'fixtures', 'crdt_sync_pre_batch5.js'), 'utf8');
const YJS = fs.readFileSync(path.join(SITE, 'vendor', 'yjs.min.js'), 'utf8');
const BND = fs.readFileSync(path.join(SITE, 'bindings_modules.js'), 'utf8');
const IDX = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const PIN = require('./lib/pinfloor.js');

function realY() {
  const ctx = { console, setTimeout, clearTimeout, Uint8Array, Map, Set, Promise, TextEncoder, TextDecoder, crypto: require('crypto').webcrypto };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(YJS + ';globalThis.Y = Y;', ctx);
  return ctx.Y;
}
const Yfull = realY();
const Y = Object.assign({}, Yfull, { IndexeddbPersistence: undefined });
let rooms = {};
// Delivery is never re-entrant: a message sent while another is being handled waits until that
// handler returns (a real socket delivers asynchronously; it never runs a peer's handler inside
// the sender's own Yjs transaction).
let _q = [], _delivering = false;
let HOLD = false;   // while true, messages wait (two tabs act at the same moment, then hear each other)
function _deliver() { if (_delivering || HOLD) return; _delivering = true; try { while (_q.length) _q.shift()(); } finally { _delivering = false; } }
function release() { HOLD = false; _deliver(); }
function fakeClient() {
  return {
    channel(name) {
      const ch = { name, handlers: {}, on(type, filter, cb) { ch.handlers[filter.event] = cb; return ch; },
        subscribe(cb) { (rooms[name] = rooms[name] || []).push(ch); try { cb('SUBSCRIBED'); } catch (_) {} return ch; },
        send(m) { MSGS++; if (++SENT > 4000) { STORM = true; return; } if (DROP > 0 && m.event === 'yupdate') { DROP--; return; } (rooms[name] || []).forEach(o => { if (o !== ch && o.handlers[m.event]) _q.push(() => o.handlers[m.event](m)); }); _deliver(); },
        unsubscribe() { rooms[name] = (rooms[name] || []).filter(o => o !== ch); } };
      return ch;
    },
    from() { return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }), upsert: () => Promise.resolve({}) }; }
  };
}
const COLS = { acFunctionsData: [], acFhaData: [], acReqData: [], acAssumptionsData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [], acFcimData: [], routingData: [], resourcesData: [], itemsData: [], flightPhasesData: [], systemsData: [], ftaPages: [], mlData: {}, stpaData: {}, typeCounters: {} };
const clone = o => JSON.parse(JSON.stringify(o));
// The app applies pulled settings IN PLACE (helpers_modules _assignDeepInPlace), which keeps this
// tab's key order: the real function is loaded, so a copy that differs only in key order is
// exercised exactly as in the browser.
const HELPERS = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
const _inPlace = (function () {
  const i = HELPERS.indexOf('function _isPlainObj('), j = HELPERS.indexOf('\n}', i) + 2;
  const k = HELPERS.indexOf('function _assignDeepInPlace('), l = HELPERS.indexOf('\n// Keyed rows', k);
  const ctx = {}; vm.createContext(ctx); vm.runInContext(HELPERS.slice(i, j) + '\n' + HELPERS.slice(k, l) + '\nglobalThis.__f = _assignDeepInPlace;', ctx);
  return ctx.__f;
})();
let MSGS = 0, SENT = 0, STORM = false, DROP = 0;   // SENT/STORM: a runaway exchange is cut off and reported instead of hanging the suite; DROP: lose the next N updates (a real socket can)
const BASE_PC = { regulation: 'Part 25', missionDuration: 3, isITARControlled: false, aiSettings: { topK: 5, projectAiOff: false }, aiAuditLog: [], aiDraftLog: [], aiDraftCounter: 0 };

function tab(name, pc, src) {
  const env = { name, timers: [], model: Object.assign(clone(COLS), { projectConfig: clone(pc) }) };
  const win = {
    Y, navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    console: { info() {}, warn() {}, error() {}, log() {} },
    getActiveCloudProjectId: () => 'proj-s', getActiveWorkspaceId: () => 'ws-1', isSupabaseSignedIn: () => true,
    getSupabaseClient: fakeClient,
    SLConfig: { mode: 'self-hosted', ownServer: true, fatal: null },
    __crdtCapture: () => clone(env.model),
    __crdtApply: (p) => { Object.keys(p).forEach(k => {
      if (k === 'projectConfig' && p[k] && typeof p[k] === 'object') { env.model.projectConfig = _inPlace(env.model.projectConfig, clone(p[k])); return; }
      if (Array.isArray(p[k]) || (p[k] && typeof p[k] === 'object' && !/^__/.test(k))) env.model[k] = clone(p[k]); }); },
    addEventListener() {}, projectConfig: {}, SL_CRDT_AUTHORITATIVE: true, _activeCloudDocVersion: 3
  };
  win.window = win;
  const doc = { getElementById: () => null, createElement: () => ({ style: {}, set src(v) {}, appendChild() {} }), head: { appendChild() {} }, documentElement: { appendChild() {} }, body: { appendChild() {} }, visibilityState: 'visible' };
  const ctx = Object.assign(win, { document: doc,
    setTimeout: (f, ms) => { env.timers.push({ f, ms }); return env.timers.length; }, clearTimeout: (id) => { if (env.timers[id - 1]) env.timers[id - 1].f = null; }, setInterval: () => 0,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: b => Buffer.from(b, 'base64').toString('binary'),
    Date, JSON, Math, Uint8Array, Promise, Array, Object, String, Map, Set,
    crypto: require('crypto').webcrypto });   // a real per-tab token (without it two tabs made in the same millisecond share one and ignore each other)
  vm.createContext(ctx); vm.runInContext(src || SRC, ctx);
  env.api = ctx.SafetyLabCRDT;
  env.flush = () => { let n = 0; env.timers.forEach(t => { if (t.f) { const f = t.f; t.f = null; f(); n++; } }); return n; };
  env.pc = () => env.model.projectConfig;
  env.edit = (mut) => { mut(env.model.projectConfig); env.api.onLocalChange(); env.flush(); const m = env.api._undoMgr && env.api._undoMgr(); if (m) m.stopCapturing(); };
  env.silent = (mut) => { mut(env.model.projectConfig); };   // a change this tab has made but not yet sent
  env.advance = (ms) => { const base = Date.now() + ms; class D extends Date { static now() { return base; } } ctx.Date = D; };
  env.api.refresh();
  return env;
}
const settle = () => new Promise(r => setImmediate(r));
async function pair(srcA, srcB, pcA, pcB) {
  rooms = {};
  const A = tab('A', pcA || BASE_PC, srcA);
  await settle(); await settle(); A.flush();
  const B = tab('B', pcB || BASE_PC, srcB);
  await settle(); await settle(); B.flush(); A.flush();
  A.advance(20000); B.advance(20000);
  return { A, B };
}
const T0 = Date.now();

async function scenarios(src, label, quiet) {
  const r = {};
  // F1
  { const { A, B } = await pair(src, src);
    B.silent(pc => { pc.missionDuration = 7; });
    A.edit(pc => { pc.regulation = 'Part 23'; });
    B.flush(); A.flush();
    r.F1 = A.pc().regulation === 'Part 23' && A.pc().missionDuration === 7 && B.pc().regulation === 'Part 23' && B.pc().missionDuration === 7;
    r.F1d = 'A ' + A.pc().regulation + '/' + A.pc().missionDuration + ' B ' + B.pc().regulation + '/' + B.pc().missionDuration; }
  // F2
  { const { A, B } = await pair(src, src);
    A.edit(pc => { pc.isITARControlled = true; pc.controlStamps = { isITARControlled: { on: true, at: T0 + 1000 } }; });
    B.flush();
    const sawOn = B.pc().isITARControlled === true;
    B.edit(pc => { pc.isITARControlled = false; delete pc.controlStamps; pc.regulation = 'CS-23'; });   // a stale copy put back (an old snapshot, a paste)
    A.flush(); B.flush();
    r.F2 = sawOn && A.pc().isITARControlled === true && B.pc().isITARControlled === true;
    r.F2d = 'A ' + A.pc().isITARControlled + ' B ' + B.pc().isITARControlled;
    r.F2b = A.pc().regulation === 'CS-23' && B.pc().regulation === 'CS-23'; }
  // F3
  { const { A, B } = await pair(src, src);
    B.silent(pc => { pc.aiSettings.topK = 9; });                       // B's settings save, made before it heard about AI off
    A.edit(pc => { pc.aiSettings.projectAiOff = true; pc.controlStamps = { projectAiOff: { on: true, at: T0 + 1000 } }; });
    B.flush(); A.flush(); B.flush();
    r.F3 = A.pc().aiSettings.projectAiOff === true && B.pc().aiSettings.projectAiOff === true;
    r.F3d = 'A ' + JSON.stringify(A.pc().aiSettings) + ' B ' + JSON.stringify(B.pc().aiSettings);
    r.F3b = A.pc().aiSettings.topK === 9 && B.pc().aiSettings.topK === 9; }
  // F4 + F5
  { const { A, B } = await pair(src, src);
    A.edit(pc => { pc.isITARControlled = true; pc.aiSettings.projectAiOff = true; pc.controlStamps = { isITARControlled: { on: true, at: T0 + 1000 }, projectAiOff: { on: true, at: T0 + 1000 } }; });
    B.flush();
    B.edit(pc => { pc.isITARControlled = false; pc.controlStamps.isITARControlled = { on: false, at: T0 + 500 }; });   // older than the "on"
    A.flush(); B.flush();
    r.F5 = A.pc().isITARControlled === true && B.pc().isITARControlled === true;
    B.edit(pc => { pc.isITARControlled = false; pc.aiSettings.projectAiOff = false; pc.controlStamps.isITARControlled = { on: false, at: T0 + 5000 }; pc.controlStamps.projectAiOff = { on: false, at: T0 + 5000 }; });
    A.flush(); B.flush();
    r.F4 = A.pc().isITARControlled === false && B.pc().isITARControlled === false && A.pc().aiSettings.projectAiOff === false && B.pc().aiSettings.projectAiOff === false;
    r.F4d = 'A ' + A.pc().isITARControlled + '/' + A.pc().aiSettings.projectAiOff + ' B ' + B.pc().isITARControlled + '/' + B.pc().aiSettings.projectAiOff; }
  // F6
  { const { A, B } = await pair(src, src);
    A.edit(pc => { pc.isITARControlled = true; pc.controlStamps = { isITARControlled: { on: true, at: T0 + 1000 } }; });
    B.flush();
    const C = tab('C', BASE_PC, src);                                   // opens from an old snapshot
    await settle(); await settle(); C.flush(); A.flush(); B.flush(); C.flush();
    r.F6 = A.pc().isITARControlled === true && B.pc().isITARControlled === true && C.pc().isITARControlled === true;
    r.F6d = 'A ' + A.pc().isITARControlled + ' B ' + B.pc().isITARControlled + ' C ' + C.pc().isITARControlled; }
  // F7
  { const { A, B } = await pair(src, src);
    B.silent(pc => { pc.aiAuditLog.push({ ts: T0 + 2, feature: 'b', ok: true }); });
    A.edit(pc => { pc.aiAuditLog.push({ ts: T0 + 1, feature: 'a', ok: true }); });
    B.flush(); A.flush(); B.flush();
    const feats = e => e.pc().aiAuditLog.map(x => x.feature).join(',');
    r.F7 = feats(A) === 'a,b' && feats(B) === 'a,b';
    r.F7d = 'A ' + feats(A) + ' B ' + feats(B);
    B.edit(pc => { pc.aiAuditLog = pc.aiAuditLog.filter(x => x.feature !== 'a'); });   // B drops an entry locally
    A.flush(); B.flush();
    r.F7b = feats(A) === 'a,b'; r.F7bd = 'A ' + feats(A) + ' B ' + feats(B); }
  // F8
  { const { A, B } = await pair(src, src);
    B.silent(pc => { pc.aiDraftCounter = 1; pc.aiDraftLog.push({ id: 'AIC-000001', at: new Date(T0 + 2).toISOString(), inputHash: 'bb', feature: 'b', outcome: 'ok' }); });
    A.edit(pc => { pc.aiDraftCounter = 4; pc.aiDraftLog.push({ id: 'AIC-000001', at: new Date(T0 + 1).toISOString(), inputHash: 'aa', feature: 'a', outcome: 'ok' }); });
    B.flush(); A.flush(); B.flush();
    const feats = e => e.pc().aiDraftLog.map(x => x.feature).join(',');
    r.F8 = feats(A) === 'a,b' && feats(B) === 'a,b'; r.F8d = 'A ' + feats(A) + ' B ' + feats(B);
    r.F8b = A.pc().aiDraftCounter === 4 && B.pc().aiDraftCounter === 4; r.F8bd = 'A ' + A.pc().aiDraftCounter + ' B ' + B.pc().aiDraftCounter; }
  // F10
  { const { A, B } = await pair(src, src);
    A.edit(pc => { pc.regulation = 'Part 27'; });
    B.flush();
    const und = A.api.undo(); A.flush(); B.flush();
    r.F10 = und && A.pc().regulation === 'Part 25' && B.pc().regulation === 'Part 25';
    r.F10d = 'A ' + A.pc().regulation + ' B ' + B.pc().regulation;
    const { A: A2, B: B2 } = await pair(src, src);
    A2.edit(pc => { pc.aiAuditLog.push({ ts: T0 + 9, feature: 'x', ok: true }); });
    B2.flush();
    r.F10b = A2.api.canUndo() === false && B2.pc().aiAuditLog.length === 1; }
  // F14
  { const { A, B } = await pair(src, src);
    B.silent(pc => { pc.aiSettings.projectAiOff = true; pc.controlStamps = { projectAiOff: { on: true, at: T0 + 2000 } }; });
    A.edit(pc => { pc.isITARControlled = true; pc.controlStamps = { isITARControlled: { on: true, at: T0 + 1000 } }; });
    B.flush(); A.flush(); B.flush();
    const st = e => Object.keys(e.pc().controlStamps || {}).sort().join(',');
    r.F14 = st(A) === 'isITARControlled,projectAiOff' && st(B) === 'isITARControlled,projectAiOff';
    r.F14d = 'A ' + st(A) + ' B ' + st(B); }
  // F13
  { const { A, B } = await pair(src, src);
    A.edit(pc => { pc.aiAuditLog.push({ id: 'AIC-000009', at: new Date(T0 + 7).toISOString(), inputHash: 'cc', feature: 'v10', outcome: 'ok' }); pc.aiAuditLog.push({ ts: T0 + 8, feature: 'cost', ok: true }); });
    B.flush(); A.flush();
    const ids = e => (e.pc().aiDraftLog || []).map(x => x.id).join(','), cost = e => (e.pc().aiAuditLog || []).map(x => x.feature).join(',');
    r.F13 = ids(A) === 'AIC-000009' && ids(B) === 'AIC-000009' && cost(A) === 'cost' && cost(B) === 'cost';
    r.F13d = 'draft A ' + ids(A) + ' B ' + ids(B) + ' | cost A ' + cost(A) + ' B ' + cost(B); }
  return r;
}

(async () => {
  console.log('[new build] the scenarios, real Yjs, two (or three) tabs');
  const r = await scenarios(SRC);
  check('F1 different settings changed at the same time: both survive on both tabs', r.F1, r.F1d);
  check('F2 a stale copy cannot turn export control off (stays on, both tabs)', r.F2, r.F2d);
  check('F2 ...while the rest of that save still goes through', r.F2b);
  check('F3 a stale AI settings save keeps AI off ON', r.F3, r.F3d);
  check('F3 ...and its other change (topK) still goes through', r.F3b, r.F3d);
  check('F5 a deliberate off OLDER than the last "on" is refused', r.F5);
  check('F4 unticking (a newer deliberate-off stamp) turns both off, everywhere', r.F4, r.F4d);
  check('F6 a tab opening an old snapshot cannot turn export control off', r.F6, r.F6d);
  check('F7 AI audit log: both tabs\' entries merge, in time order', r.F7, r.F7d);
  check('F7 a tab dropping entries locally deletes nothing anywhere else', r.F7b, r.F7bd);
  check('F8 AI draft log: the same id from two tabs, both kept', r.F8, r.F8d);
  check('F8 the draft counter never goes backward', r.F8b, r.F8bd);
  check('F10 undo still reverts a setting change, on both tabs', r.F10, r.F10d);
  check('F10 an AI log entry is never an undo step (and still reaches the other tab)', r.F10b);
  check('F14 two switches stamped at the same time on two tabs: both stamps kept', r.F14, r.F14d);
  check('F13 an old AIC- entry in the cost log shows in the draft log, on both tabs, and is never lost', r.F13, r.F13d);

  console.log('\n[F9] an OLDER BUILD in the same project (pre-batch-5 crdt_sync, as on the 0.18 desktop)');
  {
    const { A: N, B: O } = await pair(SRC, OLD);
    O.edit(pc => { pc.regulation = 'Part 29'; });
    N.flush(); O.flush();
    check('F9 the older build\'s setting change arrives', N.pc().regulation === 'Part 29', N.pc().regulation);
    N.edit(pc => { pc.missionDuration = 11; });
    O.flush(); N.flush();
    check('F9 our setting change reaches the older build', O.pc().missionDuration === 11 && O.pc().regulation === 'Part 29', JSON.stringify([O.pc().regulation, O.pc().missionDuration]));
    N.edit(pc => { pc.isITARControlled = true; pc.controlStamps = { isITARControlled: { on: true, at: T0 + 1000 } }; });
    O.flush(); N.flush();
    const oSaw = O.pc().isITARControlled === true;
    O.edit(pc => { pc.isITARControlled = false; pc.regulation = 'Part 33'; });
    N.flush(); O.flush(); N.flush();
    check('F9 the older build saw export control go on', oSaw);
    check('F9 its stale off is refused: on, on both', N.pc().isITARControlled === true && O.pc().isITARControlled === true, 'N ' + N.pc().isITARControlled + ' O ' + O.pc().isITARControlled);
    check('F9 ...and the rest of its change still arrives', N.pc().regulation === 'Part 33', N.pc().regulation);
    O.edit(pc => { pc.aiAuditLog.push({ ts: T0 + 3, feature: 'old', ok: true }); });
    N.edit(pc => { pc.aiAuditLog.push({ ts: T0 + 4, feature: 'new', ok: true }); });
    O.flush(); N.flush(); O.flush();
    const f = e => e.pc().aiAuditLog.map(x => x.feature).join(',');
    check('F9 AI log entries from both builds merge', f(N) === 'old,new' && f(O) === 'old,new', 'N ' + f(N) + ' O ' + f(O));
  }

  console.log('\n[F15] no bouncing: a settings change costs a handful of messages, not a storm');
  {
    const { A, B } = await pair(SRC, SRC, Object.assign(clone(BASE_PC), { zeta: { b: 1, a: 2 } }), Object.assign(clone(BASE_PC), { zeta: { a: 2, b: 1 } }));
    MSGS = 0;
    for (let i = 0; i < 5; i++) { A.edit(pc => { pc.regulation = 'R' + i; }); B.flush(); A.flush(); }
    console.log('     new builds: ' + MSGS + ' messages');
    check('F15 new builds: 5 setting changes, at most 20 messages', MSGS <= 20 && B.pc().regulation === 'R4', MSGS + ' messages');
    const { A: N, B: O } = await pair(SRC, OLD, Object.assign(clone(BASE_PC), { zeta: { b: 1, a: 2 } }), Object.assign(clone(BASE_PC), { zeta: { a: 2, b: 1 } }));
    MSGS = 0;
    for (let i = 0; i < 5; i++) { N.edit(pc => { pc.regulation = 'R' + i; }); O.flush(); N.flush(); }
    for (let i = 0; i < 5; i++) { O.edit(pc => { pc.missionDuration = 20 + i; }); N.flush(); O.flush(); }
    console.log('     with an older build: ' + MSGS + ' messages');
    check('F15 with an older build: 10 setting changes, at most 40 messages', MSGS <= 40 && O.pc().regulation === 'R4' && N.pc().missionDuration === 24, MSGS + ' messages');
  }

  console.log('\n[F16] the same setting in another key order is not a change');
  {
    const { A, B } = await pair(SRC, SRC, Object.assign(clone(BASE_PC), { zeta: { b: 1, a: 2 } }), Object.assign(clone(BASE_PC), { zeta: { a: 2, b: 1 } }));
    let zetaWrites = 0, mirrorWrites = 0;
    // whatever order the doc holds, give A's model the other one (what an in-place apply can leave behind)
    const rev = o => { const r = {}; Object.keys(o).reverse().forEach(k => { r[k] = o[k]; }); return r; };
    A.silent(pc => { pc.zeta = rev(JSON.parse(A.api._doc().getMap('pc').get('zeta'))); });
    A.api._doc().getMap('pc').observe(e => { if (e.keysChanged.has('zeta')) zetaWrites++; });
    for (let i = 0; i < 3; i++) { B.edit(pc => { pc.regulation = 'S' + i; }); A.flush(); A.edit(pc => { pc.missionDuration = 30 + i; }); B.flush(); }
    check('F16 re-ordered copies of an unchanged setting are never re-sent', zetaWrites === 0, zetaWrites + ' writes of an unchanged setting');
    const { A: N, B: O } = await pair(SRC, OLD, Object.assign(clone(BASE_PC), { zeta: { b: 1, a: 2 } }), Object.assign(clone(BASE_PC), { zeta: { a: 2, b: 1 } }));
    O.silent(pc => { pc.zeta = rev(pc.zeta); });                      // the older build holds its copy in another key order
    N.api._doc().getMap('whole').observe(e => { if (e.keysChanged.has('projectConfig') && e.transaction.local) mirrorWrites++; });
    for (let i = 0; i < 3; i++) { O.edit(pc => { pc.fmeaNote = 'x' + i; }); N.flush(); O.flush(); N.flush(); }
    console.log('     mirror rewrites answering the older build: ' + mirrorWrites);
    check('F16 an older build\'s copy that matches the doc is accepted, never answered', mirrorWrites === 0, mirrorWrites + ' mirror rewrites for 3 changes');
  }

  console.log('\n[F16b] an AI log entry in another key order is the same entry');
  {
    const pcA = clone(BASE_PC); pcA.aiAuditLog = [{ ts: T0 + 1, feature: 'a', model: 'm', ok: true }, { ts: T0 + 2, feature: 'b', model: 'm', ok: true }];
    const { A, B } = await pair(SRC, SRC, pcA, pcA);
    const size0 = A.api._doc().getMap('log:aiAuditLog').size;
    let logWrites = 0;
    A.api._doc().getMap('log:aiAuditLog').observe(() => { logWrites++; });
    A.silent(pc => { pc.aiAuditLog = pc.aiAuditLog.map(e => { const r = {}; Object.keys(e).reverse().forEach(k => { r[k] = e[k]; }); return r; }); });
    for (let i = 0; i < 3; i++) { A.edit(pc => { pc.regulation = 'L' + i; }); B.flush(); }
    check('F16b no duplicate log entries from a re-ordered copy', A.api._doc().getMap('log:aiAuditLog').size === size0 && A.pc().aiAuditLog.length === 2 && B.pc().aiAuditLog.length === 2,
          'map ' + A.api._doc().getMap('log:aiAuditLog').size + ' A ' + A.pc().aiAuditLog.length + ' B ' + B.pc().aiAuditLog.length);
    check('F16b and nothing re-sent', logWrites === 0, logWrites + ' log writes');
  }

  console.log('\n[F17] an older build turned export control ON; another older build sends a stale copy');
  {
    rooms = {};
    const N = tab('N', BASE_PC, SRC); await settle(); await settle(); N.flush();
    const O1 = tab('O1', BASE_PC, OLD); await settle(); await settle(); O1.flush(); N.flush();
    const O2 = tab('O2', BASE_PC, OLD); await settle(); await settle(); O2.flush(); N.flush(); O1.flush();
    [N, O1, O2].forEach(t => t.advance(20000));
    O2.silent(pc => { pc.regulation = 'Part 31'; });                 // O2 holds a change it has not sent
    O1.edit(pc => { pc.isITARControlled = true; });                  // an older build ticks it (no stamp)
    N.flush(); O2.flush(); O1.flush(); N.flush(); O2.flush();
    O2.edit(pc => { pc.isITARControlled = false; pc.regulation = 'Part 31'; });   // and O2's stale copy goes out
    N.flush(); O1.flush(); O2.flush(); N.flush(); O1.flush(); O2.flush();
    check('F17 an older build\'s ON survives another older build\'s stale copy (all three tabs)',
          N.pc().isITARControlled === true && O1.pc().isITARControlled === true && O2.pc().isITARControlled === true,
          'N ' + N.pc().isITARControlled + ' O1 ' + O1.pc().isITARControlled + ' O2 ' + O2.pc().isITARControlled);
  }

  console.log('\n[F18] two tabs tidy a long list of switch views at the same moment');
  {
    const { A, B } = await pair(SRC, SRC);
    A.edit(pc => { pc.isITARControlled = true; pc.controlStamps = { isITARControlled: { on: true, at: T0 + 1000 } }; });
    B.flush();
    const put = (env, from, to) => { const d = env.api._doc(); d.transact(() => { for (let i = from; i < to; i++) d.getMap('ctl').set('v' + String(i).padStart(2, '0') + ':isITARControlled', JSON.stringify({ on: true, at: T0 + 2000 })); }, 'seed'); };   // newer than A's own view, all tied
    A.api._doc().transact(() => { A.api._doc().getMap('ctl').set('w0:isITARControlled', JSON.stringify({ on: false, at: T0 + 500, d: true })); }, 'seed');   // an older deliberate off (unticked once, ticked again since)
    HOLD = true; put(A, 0, 21); put(B, 21, 42); release();            // same views, written in a different order on each tab
    A.flush(); B.flush();
    HOLD = true;
    A.edit(pc => { pc.regulation = 'T1'; }); B.edit(pc => { pc.missionDuration = 12; });   // both push, both tidy, neither hears the other yet
    release(); A.flush(); B.flush(); A.flush(); B.flush();
    const views = A.api._doc().getMap('ctl').size;
    check('F18 export control stays ON after both tabs tidied at once', A.pc().isITARControlled === true && B.pc().isITARControlled === true,
          'A ' + A.pc().isITARControlled + ' B ' + B.pc().isITARControlled + ', ' + views + ' views left');
    check('F18 the list was actually tidied, and an ON view survived it', views < 40 && Array.from(A.api._doc().getMap('ctl').values()).some(v => JSON.parse(v).on === true), views + ' views');
  }

  console.log('\n[F19] undo works on the two switches');
  {
    const { A, B } = await pair(SRC, SRC);
    A.edit(pc => { pc.isITARControlled = true; pc.controlStamps = { isITARControlled: { on: true, at: T0 + 1000 } }; });
    B.flush();
    A.edit(pc => { pc.isITARControlled = false; pc.controlStamps.isITARControlled = { on: false, at: T0 + 2000 }; });
    B.flush();
    const offBoth = A.pc().isITARControlled === false && B.pc().isITARControlled === false;
    const u1 = A.api.undo(); A.flush(); B.flush();
    check('F19 untick export control, then undo: back ON on both tabs', offBoth && u1 && A.pc().isITARControlled === true && B.pc().isITARControlled === true,
          'A ' + A.pc().isITARControlled + ' B ' + B.pc().isITARControlled);
    A.edit(pc => { pc.aiSettings.projectAiOff = true; pc.controlStamps.projectAiOff = { on: true, at: T0 + 3000 }; });
    B.flush();
    const onBoth = A.pc().aiSettings.projectAiOff === true && B.pc().aiSettings.projectAiOff === true;
    const u2 = A.api.undo(); A.flush(); B.flush();
    check('F19 tick AI off, then undo: back OFF on both tabs', onBoth && u2 && A.pc().aiSettings.projectAiOff === false && B.pc().aiSettings.projectAiOff === false,
          'A ' + A.pc().aiSettings.projectAiOff + ' B ' + B.pc().aiSettings.projectAiOff);
  }

  console.log('\n[F20] a deliberate untick wins over a fast clock');
  {
    const { A, B } = await pair(SRC, SRC);
    A.edit(pc => { pc.isITARControlled = true; pc.controlStamps = { isITARControlled: { on: true, at: Date.now() + 3600e3 } }; });   // A's clock is an hour ahead
    B.flush();
    const floor = B.api.controlFloor('isITARControlled');
    B.edit(pc => { pc.isITARControlled = false; pc.controlStamps.isITARControlled = { on: false, at: Math.max(Date.now(), floor + 1) }; });   // as _slStampControl stamps it
    A.flush(); B.flush();
    check('F20 controlFloor reports the newest view', floor >= Date.now() + 3500e3);
    check('F20 the untick wins on both tabs', A.pc().isITARControlled === false && B.pc().isITARControlled === false, 'A ' + A.pc().isITARControlled + ' B ' + B.pc().isITARControlled);
  }

  console.log('\n[F21] a lost message never starts a storm (an older build in the project)');
  {
    const { A: N, B: O } = await pair(SRC, OLD);
    SENT = 0; STORM = false; MSGS = 0;
    DROP = 1; O.edit(pc => { pc.regulation = 'Lost'; });            // this update never reaches N
    for (let i = 0; i < 3; i++) { O.edit(pc => { pc.missionDuration = 40 + i; }); N.flush(); O.flush(); }   // later ones depend on it: N holds them back
    N.edit(pc => { pc.fmeaNote = 'n'; }); O.flush(); N.flush();
    check('F21 no storm while a message is missing', !STORM && MSGS < 60, MSGS + ' messages' + (STORM ? ' (STORM cut off)' : ''));
    SENT = 0; STORM = false;
  }

  console.log('\n[F22] two older builds and one new tab: an older build\'s change is kept');
  {
    rooms = {};
    const N = tab('N', BASE_PC, SRC); await settle(); await settle(); N.flush();
    const O = tab('O', BASE_PC, OLD); await settle(); await settle(); O.flush(); N.flush();
    const O2 = tab('O2', BASE_PC, OLD); await settle(); await settle(); O2.flush(); N.flush(); O.flush();
    [N, O, O2].forEach(t => t.advance(20000));
    N.edit(pc => { pc.controlStamps = { projectAiOff: { on: false, at: T0 } }; });   // stamps exist, as after anyone ticks a switch
    O.flush(); O2.flush(); N.flush(); O.flush(); O2.flush();
    O2.edit(pc => { pc.missionDuration = 9; });
    for (let i = 0; i < 3; i++) { N.flush(); O.flush(); O2.flush(); }
    check('F22 the older build\'s change survives on all three tabs', N.pc().missionDuration === 9 && O.pc().missionDuration === 9 && O2.pc().missionDuration === 9,
          'N ' + N.pc().missionDuration + ' O ' + O.pc().missionDuration + ' O2 ' + O2.pc().missionDuration);
  }

  console.log('\n[F23] the tab that ticked export control restores an older version');
  {
    const { A, B } = await pair(SRC, SRC);
    A.edit(pc => { pc.isITARControlled = true; pc.controlStamps = { isITARControlled: { on: true, at: T0 + 1000 } }; });
    B.flush();
    A.model.projectConfig = clone(BASE_PC);                          // the older version: off, no stamp
    A.api.adoptModel({ force: true }); A.flush(); B.flush(); A.flush(); B.flush();
    check('F23 restoring an older version does not turn export control off (both tabs)', A.pc().isITARControlled === true && B.pc().isITARControlled === true,
          'A ' + A.pc().isITARControlled + ' B ' + B.pc().isITARControlled);
  }

  console.log('\n[F11] mutation: the pre-batch-5 file fails the same scenarios');
  {
    const o = await scenarios(OLD);
    const red = ['F1', 'F2', 'F3', 'F6', 'F7', 'F7b', 'F8'].filter(k => o[k] === false);
    check('F11 the old file loses a concurrent setting change (F1 red)', o.F1 === false, o.F1d);
    check('F11 the old file lets a stale copy turn export control off (F2 red)', o.F2 === false, o.F2d);
    check('F11 the old file lets a stale save turn AI off back off (F3 red)', o.F3 === false, o.F3d);
    check('F11 the old file loses AI log entries (F7 or F8 red)', o.F7 === false || o.F7b === false || o.F8 === false);
    check('F11 overall: at least five scenarios red on the old file', red.length >= 5, red.join(','));
    console.log('     red on the old file: ' + red.join(', '));
  }

  console.log('\n[F12] the toggles stamp deliberate changes');
  {
    const tog = BND.slice(BND.indexOf('window.toggleAiITAR = function(){'), BND.indexOf('window.saveAiSettings'));
    check('the ITAR toggle stamps only a real change', /if \(_wasItar !== projectConfig\.isITARControlled\) _slStampControl\('isITARControlled', projectConfig\.isITARControlled\);/.test(tog));
    check('the AI-off checkbox stamps only a real change', /_slStampControl\('projectAiOff', projectConfig\.aiSettings\.projectAiOff === true\)/.test(BND) && /const _wasAiOff = projectConfig\.aiSettings\.projectAiOff === true;/.test(BND));
    const fnSrc = BND.slice(BND.indexOf('function _slStampControl('));
    const body = fnSrc.slice(0, fnSrc.indexOf('\n}') + 2);
    const ctx = { projectConfig: {}, window: { _supabaseSession: { user: { id: 'u1' } } }, Date };
    vm.createContext(ctx); vm.runInContext(body + '\n_slStampControl("isITARControlled", false);', ctx);
    const s = ctx.projectConfig.controlStamps && ctx.projectConfig.controlStamps.isITARControlled;
    check('EXECUTED: a stamp records on/off, when, and who', s && s.on === false && typeof s.at === 'number' && s.by === 'u1');
    const ctx2 = { projectConfig: { controlStamps: { isITARControlled: { on: true, at: 5 } } }, window: { SafetyLabCRDT: { controlFloor: () => Date.now() + 3600e3 } }, Date, Math };
    vm.createContext(ctx2); vm.runInContext(body + '\n_slStampControl("isITARControlled", false);', ctx2);
    check('EXECUTED: a stamp lands after the newest known view, whatever this clock says', ctx2.projectConfig.controlStamps.isITARControlled.at > Date.now() + 3500e3);
    const save = BND.slice(BND.indexOf('window.saveAiSettings = function(){'));
    check('saving settings changes AI off only when the box was changed since it was painted',
          /const _boxTouched = !!_offEl && \(typeof window\.__slAiOffPainted !== 'boolean' \|\| _offEl\.checked !== window\.__slAiOffPainted\);/.test(save) && /if \(_offEl && _boxTouched\) projectConfig\.aiSettings\.projectAiOff = !!_offEl\.checked;/.test(save));
    {
      const H = HELPERS;
      const rs = H.slice(H.indexOf('function _slRepaintSafetySwitches(){')); const rsBody = rs.slice(0, rs.indexOf('\n}') + 2);
      const els = { 'ai-itar-toggle': { checked: false }, 'ai-project-off': { checked: false } };
      const ctx3 = { document: { getElementById: id => els[id] || null }, projectConfig: { isITARControlled: true, aiSettings: { projectAiOff: true } }, window: {}, _refreshAiITARStatus: () => {} };
      vm.createContext(ctx3); vm.runInContext(rsBody + '\n_slRepaintSafetySwitches();', ctx3);
      check('EXECUTED: a teammate\'s change repaints both boxes and the painted value', els['ai-itar-toggle'].checked === true && els['ai-project-off'].checked === true && ctx3.window.__slAiOffPainted === true);
      check('...and it runs whenever settings arrive from the sync', /if \(partial\.projectConfig\) _slRepaintSafetySwitches\(\);/.test(H));
    }
    check('crdt_sync >= 2.5', PIN.atLeast(IDX, 'crdt_sync.js', '2.5'));
    check('bindings_modules >= 1.52', PIN.atLeast(IDX, 'bindings_modules.js', '1.52'));
    check('helpers_modules >= 3.20', PIN.atLeast(IDX, 'helpers_modules.js', '3.20'));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  suite crashed — ' + (e && e.stack || e)); process.exit(1); });

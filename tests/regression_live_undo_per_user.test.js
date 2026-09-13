#!/usr/bin/env node
/*
 * Regression — PER-USER UNDO while co-editing (13 Sep 2026).
 *
 * Waqas: "if I hit undo I want it to restore mine but not impact teammates' work ...
 * exactly how it is in Microsoft documents" (Word/Excel co-authoring on SharePoint).
 *
 * The snapshot undo restores the whole project as this tab last saw it, which rolls a
 * teammate's newer rows back. While co-editing is live, undo/redo now go through a Yjs
 * UndoManager scoped to the synced tables and tracking only this tab's own transactions.
 *
 * THIS SUITE RUNS THE REAL crdt_sync.js WITH THE REAL BUNDLED YJS (site/vendor/yjs.min.js)
 * in two vm "tabs" wired to each other through a fake broadcast channel:
 *   U1  a seed is not an undo step (nothing to undo right after opening)
 *   U2  A adds a row, B adds a row, A undoes: A's row goes, B's row stays — on BOTH tabs
 *   U3  redo brings A's row back on both tabs
 *   U4  same row: A edits r1, then B edits r1, A undoes: B's later edit WINS (Word semantics)
 *   U5  B's undo reverts only B's own change
 *   U6  helpers_modules routes undo()/redo() to the live manager when co-editing is live,
 *       and to the snapshot stack otherwise
 *   U7  mutations: tracking every origin makes B's edit undoable by A (goes red);
 *       routing removed -> helpers falls back to the snapshot undo while live (goes red)
 *
 * Run: node tests/regression_live_undo_per_user.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const SRC = fs.readFileSync(path.join(SITE, 'crdt_sync.js'), 'utf8');
const YJS = fs.readFileSync(path.join(SITE, 'vendor', 'yjs.min.js'), 'utf8');
const HELPERS = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');

// one real Yjs per tab (the bundle exports a global `Y`)
function realY() {
  const ctx = { console, setTimeout, clearTimeout, Uint8Array, Map, Set, Promise, TextEncoder, TextDecoder, crypto: require('crypto').webcrypto };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(YJS + ';globalThis.Y = Y;', ctx);
  return ctx.Y;
}
const Yfull = realY();   // both tabs share one library instance (like two tabs of one build); docs are separate
const Y = Object.assign({}, Yfull, { IndexeddbPersistence: undefined });   // no IndexedDB in node: the module's local-persistence branch is skipped, as it is offline

// a fake Supabase realtime: every channel with the same name is a peer of the others
const rooms = {};
function fakeClient() {
  return {
    channel(name) {
      const ch = { name, handlers: {}, on(type, filter, cb) { ch.handlers[filter.event] = cb; return ch; },
        subscribe(cb) { (rooms[name] = rooms[name] || []).push(ch); try { cb('SUBSCRIBED'); } catch (_) {} return ch; },
        send(m) { (rooms[name] || []).forEach(o => { if (o !== ch && o.handlers[m.event]) o.handlers[m.event](m); }); },
        unsubscribe() { rooms[name] = (rooms[name] || []).filter(o => o !== ch); } };
      return ch;
    },
    from() { return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }), upsert: () => Promise.resolve({}) }; }
  };
}
const COLS = { acFunctionsData: [], acReqData: [], acAssumptionsData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [], acFcimData: [], routingData: [], resourcesData: [], itemsData: [], flightPhasesData: [], systemsData: [], ftaPages: [], projectConfig: {}, mlData: {}, stpaData: {}, typeCounters: {} };

function tab(name, fha, src) {
  const env = { name, timers: [], model: Object.assign({ acFhaData: fha }, JSON.parse(JSON.stringify(COLS))), pulls: 0 };
  const win = {
    Y, navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    console: { info() {}, warn() {}, error() {}, log() {} },
    getActiveCloudProjectId: () => 'proj-u', getActiveWorkspaceId: () => 'ws-1', isSupabaseSignedIn: () => true,
    getSupabaseClient: fakeClient,
    __crdtCapture: () => JSON.parse(JSON.stringify(env.model)),
    __crdtApply: (p) => { env.pulls++; Object.keys(p).forEach(k => { if (Array.isArray(p[k]) || (p[k] && typeof p[k] === 'object' && !/^__/.test(k))) env.model[k] = p[k]; }); },
    addEventListener() {}, projectConfig: {}, SL_CRDT_AUTHORITATIVE: true, _activeCloudDocVersion: 3
  };
  win.window = win;
  const doc = { getElementById: () => null, createElement: () => ({ style: {}, set src(v) {}, appendChild() {} }), head: { appendChild() {} }, documentElement: { appendChild() {} }, body: { appendChild() {} }, visibilityState: 'visible' };
  const ctx = Object.assign(win, { document: doc,
    setTimeout: (f, ms) => { env.timers.push({ f, ms }); return env.timers.length; }, clearTimeout: (id) => { if (env.timers[id - 1]) env.timers[id - 1].f = null; }, setInterval: () => 0,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: b => Buffer.from(b, 'base64').toString('binary'),
    Date, JSON, Math, Uint8Array, Promise, Array, Object, String, Map, Set });
  vm.createContext(ctx); vm.runInContext(src || SRC, ctx);
  env.api = ctx.SafetyLabCRDT;
  env.flush = () => { let n = 0; env.timers.forEach(t => { if (t.f) { const f = t.f; t.f = null; f(); n++; } }); return n; };   // fire every pending timer (push debounce, handshakes)
  env.rows = () => env.model.acFhaData.map(r => r.internalId + (r.severity ? ':' + r.severity : '')).join(',');
  // a human pauses between steps; the manager groups edits within 500 ms into one step, so close the step explicitly here
  env.edit = (mut) => { mut(env.model.acFhaData); env.api.onLocalChange(); env.flush(); const m = env.api._undoMgr(); if (m) m.stopCapturing(); };
  // the adopt window (15 s after a seed) turns pulls into pushes by design; co-editing
  // under test happens in steady state, so step each tab's clock past it after boot
  env.advance = (ms) => { const base = Date.now() + ms; class D extends Date { static now() { return base; } } ctx.Date = D; };
  env.api.refresh();
  return env;
}
const settle = () => new Promise(r => setImmediate(r));
async function boot(src) {
  const A = tab('A', [{ internalId: 'r1', severity: 'Major' }], src);
  await settle(); await settle(); A.flush();
  const B = tab('B', [{ internalId: 'r1', severity: 'Major' }], src);
  await settle(); await settle(); B.flush(); A.flush();
  A.advance(20000); B.advance(20000);
  return { A, B };
}

(async () => {
  console.log('[U1] a seed is not an undo step');
  const { A, B } = await boot();
  check('both tabs are live with per-user undo available', A.api.liveUndo() && B.api.liveUndo());
  check('nothing to undo right after opening (the seed is not a step)', A.api.canUndo() === false && A.api.undo() === false);

  console.log('\n[U2] A adds a row, B adds a row, A undoes');
  A.edit(rows => rows.push({ internalId: 'r2', severity: 'Minor' }));
  B.flush();
  check('B received A\'s row (r2)', B.rows().includes('r2'), B.rows());
  B.edit(rows => rows.push({ internalId: 'r3', severity: 'Hazardous' }));
  A.flush();
  check('A received B\'s row (r3)', A.rows().includes('r3'), A.rows());
  check('A can undo, and only A\'s own step exists on A', A.api.canUndo() === true);
  const ok = A.api.undo(); A.flush(); B.flush();
  check('A undo: A\'s r2 is gone on A', ok && !A.rows().includes('r2'), A.rows());
  check('A undo: B\'s r3 is untouched on A', A.rows().includes('r3'), A.rows());
  check('A undo reached B: r2 gone, r3 kept on B', !B.rows().includes('r2') && B.rows().includes('r3'), B.rows());
  check('r1 untouched on both', A.rows().includes('r1') && B.rows().includes('r1'));

  console.log('\n[U3] redo');
  const rd = A.api.redo(); A.flush(); B.flush();
  check('A redo brings r2 back on A', rd && A.rows().includes('r2'), A.rows());
  check('...and on B, r3 still there', B.rows().includes('r2') && B.rows().includes('r3'), B.rows());

  console.log('\n[U4] same row: A edits, then B edits, A undoes — B\'s later edit wins (fresh pair)');
  const P = await boot();
  P.A.edit(rows => { rows.find(r => r.internalId === 'r1').severity = 'Catastrophic'; });
  P.B.flush();
  check('B sees A\'s edit (r1:Catastrophic)', P.B.rows().includes('r1:Catastrophic'), P.B.rows());
  P.B.edit(rows => { rows.find(r => r.internalId === 'r1').severity = 'Minor'; });
  P.A.flush();
  check('A sees B\'s later edit (r1:Minor)', P.A.rows().includes('r1:Minor'), P.A.rows());
  P.A.api.undo(); P.A.flush(); P.B.flush();
  check('A undo does NOT override B\'s later edit: r1 stays Minor on A', P.A.rows().includes('r1:Minor'), P.A.rows());
  check('...and on B', P.B.rows().includes('r1:Minor'), P.B.rows());
  // Word semantics: a step a co-author has since overwritten cannot be taken back; the
  // manager walks on to this tab's PREVIOUS own step (here there is none) — nothing else moves
  check('A has nothing further of its own to undo', P.A.api.canUndo() === false);

  console.log('\n[U5] B\'s undo reverts only B\'s own change');
  P.B.api.undo(); P.B.flush(); P.A.flush();
  check('B undo: r1 back to what stood before B\'s edit (Catastrophic, A\'s)', P.B.rows() === 'r1:Catastrophic', P.B.rows());
  check('...same on A', P.A.rows() === 'r1:Catastrophic', P.A.rows());

  console.log('\n[U6] helpers_modules routing');
  {
    const fn = (name) => { const at = HELPERS.indexOf('function ' + name + '('); let i = HELPERS.indexOf('{', at), d = 0; for (; i < HELPERS.length; i++) { if (HELPERS[i] === '{') d++; else if (HELPERS[i] === '}') { d--; if (!d) return HELPERS.slice(at, i + 1); } } };
    const ctx = { window: { SafetyLabCRDT: { liveUndo: () => ctx.live, undo: () => { ctx.calls.push('crdt-undo'); return true; }, redo: () => { ctx.calls.push('crdt-redo'); return true; } } }, live: true, calls: [],
      showToast: (m) => ctx.calls.push('toast:' + m.slice(0, 12)), _undoStack: [], _redoStack: [], _snapshotProject: () => ({}), _restoreSnap: () => ctx.calls.push('snapshot'), JSON, String };
    vm.createContext(ctx); vm.runInContext(fn('_liveUndo') + fn('undo') + fn('redo') + '; globalThis.__u = undo; globalThis.__r = redo;', ctx);
    ctx.__u(); ctx.__r();
    check('live: undo()/redo() go to the sync manager, never the snapshot', ctx.calls.filter(c => c === 'crdt-undo').length === 1 && ctx.calls.filter(c => c === 'crdt-redo').length === 1 && !ctx.calls.includes('snapshot'), ctx.calls.join(','));
    ctx.live = false; ctx.calls.length = 0; ctx._undoStack.push({ label: 'x', snap: '{}' });
    ctx.__u();
    check('solo/offline: undo() uses the snapshot stack as before', ctx.calls.includes('snapshot') && !ctx.calls.includes('crdt-undo'), ctx.calls.join(','));
  }

  console.log('\n[U7] mutations');
  {
    const m1 = SRC.replace("trackedOrigins: new Set(['local'])", "trackedOrigins: new Set(['local', 'remote'])");
    check('mutation 1 applied (track every origin)', m1 !== SRC);
    const t = await boot(m1);
    t.B.edit(rows => rows.push({ internalId: 'rb', severity: 'Minor' })); t.A.flush();
    const before = t.A.rows(); t.A.api.undo(); t.A.flush(); t.B.flush();
    check('mutation 1: A\'s undo removes B\'s row (goes red)', before.includes('rb') && !t.A.rows().includes('rb'), t.A.rows());
    const m2 = HELPERS.replace("    if (_liveUndo()) {\n        if (!window.SafetyLabCRDT.undo())", "    if (false) {\n        if (!window.SafetyLabCRDT.undo())");
    check('mutation 2 applied (routing removed)', m2 !== HELPERS);
    const fn2 = (name) => { const at = m2.indexOf('function ' + name + '('); let i = m2.indexOf('{', at), d = 0; for (; i < m2.length; i++) { if (m2[i] === '{') d++; else if (m2[i] === '}') { d--; if (!d) return m2.slice(at, i + 1); } } };
    const ctx = { window: { SafetyLabCRDT: { liveUndo: () => true, undo: () => { ctx.calls.push('crdt-undo'); return true; } } }, calls: [], showToast: () => {}, _undoStack: [{ label: 'x', snap: '{}' }], _redoStack: [], _snapshotProject: () => ({}), _restoreSnap: () => ctx.calls.push('snapshot'), JSON, String };
    vm.createContext(ctx); vm.runInContext(fn2('_liveUndo') + fn2('undo') + '; globalThis.__u = undo;', ctx); ctx.__u();
    check('mutation 2: the snapshot undo runs while live (goes red)', ctx.calls.includes('snapshot') && !ctx.calls.includes('crdt-undo'));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  suite threw — ' + (e && e.stack || e)); process.exit(1); });

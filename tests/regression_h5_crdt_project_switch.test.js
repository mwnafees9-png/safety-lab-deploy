#!/usr/bin/env node
/*
 * Regression — H-5: the CRDT project-switch window.
 *
 * THE DEFECT. crdt_sync polls refresh() every 6 seconds. Between the moment the
 * app adopts a different project and the next tick, _started is still true and
 * ydoc is still bound to the PREVIOUS project's IndexedDB store
 * (slab-crdt-<oldId>) and its Realtime channel. Two things cross the streams in
 * that window:
 *   · a debounced pushLocal writes the NEW project's rows into the OLD
 *     project's doc — and broadcasts them to whoever else is editing it;
 *   · a peer update arriving on the old channel calls pullToModel, which
 *     applies the OLD project's rows onto the NEW model.
 * The first is the doc pollution the register named. The second is worse and
 * was not named: it is silent data corruption of the project now on screen.
 *
 * THE FIX, two layers. adoptModel() calls refresh() synchronously when the
 * project changed, collapsing the window to zero for the paths that open it;
 * and _docStale() guards both functions that move data, so a window opened by
 * any future caller still cannot cross the streams.
 *
 * THESE CHECKS EXECUTE. crdt_sync.js is run as the real IIFE in a sandbox with
 * a fake Yjs and a fake Supabase client, offline (which is the simplest honest
 * start path: no channel, no server state). The project is then switched
 * WITHOUT ticking the poll — reproducing the window exactly — and the checks
 * assert what actually lands in the old doc and in the model.
 *
 * Run: node tests/regression_h5_crdt_project_switch.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'crdt_sync.js'), 'utf8');

// ---------------------------------------------------------------------------
// Fake Yjs: enough of Y.Doc for pushLocal/pullToModel/_docHasContent to run for
// real. Maps are real Maps so `size`, keys() and delete() behave.
// ---------------------------------------------------------------------------
function makeY(env) {
  function Doc() {
    this._maps = new Map();
    this._handlers = [];
    env.docs.push(this);
    this.destroyed = false;
  }
  Doc.prototype.getMap = function (n) {
    if (!this._maps.has(n)) this._maps.set(n, new Map());
    return this._maps.get(n);
  };
  Doc.prototype.transact = function (f) { f(); };
  Doc.prototype.on = function (ev, cb) { if (ev === 'update') this._handlers.push(cb); };
  Doc.prototype.destroy = function () { this.destroyed = true; };
  return {
    Doc: Doc,
    applyUpdate: function () {},
    encodeStateVector: function () { return new Uint8Array(0); },
    encodeStateAsUpdate: function () { return new Uint8Array(0); }
    // IndexeddbPersistence deliberately absent → _idb stays null, afterLocal runs sync
  };
}

function boot(model, projectId) {
  const env = { docs: [], timers: [], applied: [], listeners: {} };
  const win = {
    Y: null,
    navigator: { onLine: false },                    // offline: no channel, no server state
    localStorage: { getItem: k => (k === 'SLA_CRDT' ? '1' : null), setItem() {}, removeItem() {} },
    console: { info() {}, warn() {}, error() {}, log() {} },
    getActiveCloudProjectId: () => env.project,
    getActiveWorkspaceId:    () => 'ws-1',
    isSupabaseSignedIn:      () => true,
    getSupabaseClient:       () => ({ channel: () => ({ on() { return this; }, subscribe() { return this; }, send() {}, unsubscribe() {} }),
                                      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
                                                     upsert: () => Promise.resolve({}) }) }),
    __crdtCapture: () => JSON.parse(JSON.stringify(env.model)),
    __crdtApply:   (p) => { env.applied.push(p); },
    addEventListener: (ev, cb) => { (env.listeners[ev] = env.listeners[ev] || []).push(cb); },
    projectConfig: {}
  };
  win.window = win;
  env.model = model; env.project = projectId;
  const doc = { getElementById: () => null,
                createElement: () => ({ style: {}, set src(v) {}, appendChild() {} }),
                head: { appendChild() {} }, documentElement: { appendChild() {} }, body: { appendChild() {} } };
  const ctx = Object.assign(win, {
    document: doc,
    setTimeout: (f, ms) => { env.timers.push({ f, ms }); return env.timers.length; },
    clearTimeout: (id) => { if (env.timers[id - 1]) env.timers[id - 1].f = null; },
    setInterval: () => 0,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: b => Buffer.from(b, 'base64').toString('binary'),
    Date: Date, JSON: JSON, Math: Math, Uint8Array: Uint8Array, Promise: Promise, Array: Array, Object: Object, String: String
  });
  ctx.Y = makeY(env);
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  env.api = ctx.SafetyLabCRDT;
  env.fireTimers = () => { const t = env.timers.slice(); env.timers.length = 0; t.forEach(x => { if (x.f) x.f(); }); };
  env.api.refresh();                                  // boot the session for `projectId`
  return env;
}

const rows = (doc, col) => Array.from(doc.getMap('col:' + col).values()).map(v => JSON.parse(v));
const P1 = { acFhaData: [{ internalId: 'p1-a' }, { internalId: 'p1-b' }], acFunctionsData: [], acReqData: [], acAssumptionsData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [], systemsData: [], ftaPages: [] };
const P2 = { acFhaData: [{ internalId: 'p2-x' }], acFunctionsData: [], acReqData: [], acAssumptionsData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [], systemsData: [], ftaPages: [] };

// ---------------------------------------------------------------------------
console.log('[h5] 0 — the harness really runs the real module');
const e0 = boot(JSON.parse(JSON.stringify(P1)), 'proj-1');
check('a session started on proj-1', e0.api.status().started === true && e0.api.status().project === 'proj-1');
check('the doc was seeded from the model', rows(e0.docs[0], 'acFhaData').map(r => r.internalId).join(',') === 'p1-a,p1-b');

// ---------------------------------------------------------------------------
console.log('[h5] 1 — pushLocal inside the window does not write into the old doc');
{
  const e = boot(JSON.parse(JSON.stringify(P1)), 'proj-1');
  const oldDoc = e.docs[0];
  e.model = JSON.parse(JSON.stringify(P2));     // the app switched…
  e.project = 'proj-2';                          // …and the poll has NOT ticked
  e.api.onLocalChange();                         // an edit lands in the window
  e.fireTimers();                                // the 350ms debounce fires
  const ids = rows(oldDoc, 'acFhaData').map(r => r.internalId).sort().join(',');
  check('proj-1 doc still holds ONLY proj-1 rows', ids === 'p1-a,p1-b', 'got [' + ids + ']');
  check("proj-2's row never reached proj-1's doc", !ids.includes('p2-x'));
}

// ---------------------------------------------------------------------------
console.log('[h5] 2 — a peer update inside the window does not overwrite the new model');
{
  const e = boot(JSON.parse(JSON.stringify(P1)), 'proj-1');
  const oldDoc = e.docs[0];
  e.project = 'proj-2';
  e.model = JSON.parse(JSON.stringify(P2));
  e.applied.length = 0;
  oldDoc._handlers.forEach(h => h(new Uint8Array(0), 'remote'));   // peer broadcast on the OLD channel
  check('__crdtApply was NOT called — proj-1 rows never touched the proj-2 model',
        e.applied.length === 0, 'applied ' + e.applied.length + ' partial(s)');
}

// ---------------------------------------------------------------------------
console.log('[h5] 3 — closing the cloud project is treated as stale, not as "push everything"');
{
  const e = boot(JSON.parse(JSON.stringify(P1)), 'proj-1');
  const oldDoc = e.docs[0];
  e.project = null;                              // went local / signed out of the project
  e.model = JSON.parse(JSON.stringify(P2));
  e.api.onLocalChange(); e.fireTimers();
  const ids = rows(oldDoc, 'acFhaData').map(r => r.internalId).sort().join(',');
  check('the doc it just left is untouched', ids === 'p1-a,p1-b', 'got [' + ids + ']');
}

// ---------------------------------------------------------------------------
console.log('[h5] 4 — adoptModel collapses the window instead of waiting for the poll');
{
  const e = boot(JSON.parse(JSON.stringify(P1)), 'proj-1');
  const oldDoc = e.docs[0];
  e.project = 'proj-2';
  e.model = JSON.parse(JSON.stringify(P2));
  e.api.adoptModel();                            // what _loadCloudProject calls
  check('the stale doc was torn down synchronously', oldDoc.destroyed === true);
  check('a session is live on proj-2 immediately, not up to 6s later',
        e.api.status().project === 'proj-2' && e.api.status().started === true,
        JSON.stringify({ p: e.api.status().project, s: e.api.status().started }));
  const newDoc = e.docs[e.docs.length - 1];
  check('the new doc mirrors the NEW model', rows(newDoc, 'acFhaData').map(r => r.internalId).join(',') === 'p2-x');
  check('and it is a different doc object', newDoc !== oldDoc);
}

// ---------------------------------------------------------------------------
console.log('[h5] 5 — the normal path is unaffected: same project still pushes');
{
  const e = boot(JSON.parse(JSON.stringify(P1)), 'proj-1');
  const doc = e.docs[0];
  e.model.acFhaData.push({ internalId: 'p1-c' });   // an ordinary edit, no switch
  e.api.onLocalChange(); e.fireTimers();
  const ids = rows(doc, 'acFhaData').map(r => r.internalId).sort().join(',');
  check('an edit on the SAME project still reaches the doc', ids === 'p1-a,p1-b,p1-c', 'got [' + ids + ']');
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

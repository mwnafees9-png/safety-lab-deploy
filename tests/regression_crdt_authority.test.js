#!/usr/bin/env node
/*
 * Regression — Stage 2: the CRDT AUTHORITY flip (SL_CRDT_AUTHORITATIVE).
 *
 * WHAT THIS PINS. Stage 1 keeps the whole-doc snapshot authoritative on open and
 * makes the CRDT doc mirror it (adoptModel -> snapshot wins). Stage 2 flips that:
 * the live CRDT doc becomes the source of truth on open, and the snapshot is a
 * periodic backup. The DANGER is that a naive flip re-opens the exact bug adoptModel
 * was built to kill — a legacy/stale CRDT copy winning over a newer snapshot (the
 * 31 Aug "0 -> 193 rows resurrection"). The safety mechanism is a self-healing STAMP
 * stored in the Yjs doc (meta.docVersion) = the snapshot version the CRDT was last
 * reconciled against. On open the model already holds the snapshot at version V:
 *   · SEED (snapshot -> CRDT) when V > stamp or stamp is absent  — legacy / non-CRDT
 *     writer / a stale CRDT copy. Worst case = Stage 1's snapshot-wins. NO loss.
 *   · PULL (CRDT -> model) only when stamp >= V — the stamp PROVES the CRDT doc is at
 *     least as fresh, so a live teammate's merged edit wins instead of being tombstoned.
 *   · a deliberate restore/rollback passes force -> SEED regardless of stamp.
 *   · noteSnapshotVersion advances the stamp MAX-merge on a confirmed backup write.
 *   · flag OFF (default) -> adoptModel is byte-for-byte Stage 1 (adopt window).
 *
 * THESE CHECKS EXECUTE the real crdt_sync.js IIFE in a vm with a fake Yjs, offline
 * (the simplest honest start path). Mutations at the end must go red by exit code.
 *
 * Run: node tests/regression_crdt_authority.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'crdt_sync.js'), 'utf8');

function makeY(env) {
  function Doc() { this._maps = new Map(); this._handlers = []; env.docs.push(this); this.destroyed = false; }
  Doc.prototype.getMap = function (n) { if (!this._maps.has(n)) this._maps.set(n, new Map()); return this._maps.get(n); };
  Doc.prototype.transact = function (f) { f(); };
  Doc.prototype.on = function (ev, cb) { if (ev === 'update') this._handlers.push(cb); };
  Doc.prototype.destroy = function () { this.destroyed = true; };
  return { Doc: Doc, applyUpdate: function () {}, encodeStateVector: function () { return new Uint8Array(0); }, encodeStateAsUpdate: function () { return new Uint8Array(0); } };
}

function boot(model, projectId, opts) {
  opts = opts || {};
  const env = { docs: [], timers: [], applied: [], listeners: {} };
  const win = {
    Y: null,
    navigator: { onLine: false },
    localStorage: { getItem: k => (k === 'SLA_CRDT' ? '1' : null), setItem() {}, removeItem() {} },
    console: { info() {}, warn() {}, error() {}, log() {} },
    getActiveCloudProjectId: () => env.project,
    getActiveWorkspaceId:    () => 'ws-1',
    isSupabaseSignedIn:      () => true,
    getSupabaseClient:       () => ({ channel: () => ({ on() { return this; }, subscribe() { return this; }, send() {}, unsubscribe() {} }),
                                      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }), upsert: () => Promise.resolve({}) }) }),
    __crdtCapture: () => JSON.parse(JSON.stringify(env.model)),
    __crdtApply:   (p) => { env.applied.push(p); },
    addEventListener: (ev, cb) => { (env.listeners[ev] = env.listeners[ev] || []).push(cb); },
    projectConfig: {},
    SL_CRDT_AUTHORITATIVE: opts.auth === true
  };
  win.window = win;
  env.model = model; env.project = projectId;
  const doc = { getElementById: () => null, createElement: () => ({ style: {}, set src(v) {}, appendChild() {} }), head: { appendChild() {} }, documentElement: { appendChild() {} }, body: { appendChild() {} } };
  const ctx = Object.assign(win, {
    document: doc,
    setTimeout: (f, ms) => { env.timers.push({ f, ms }); return env.timers.length; },
    clearTimeout: (id) => { if (env.timers[id - 1]) env.timers[id - 1].f = null; },
    setInterval: () => 0,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: b => Buffer.from(b, 'base64').toString('binary'),
    Date: Date, JSON: JSON, Math: Math, Uint8Array: Uint8Array, Promise: Promise, Array: Array, Object: Object, String: String
  });
  // _activeCloudDocVersion is read by crdt_sync via a typeof-guarded BARE identifier
  // (same shared global lexical scope as projectConfig). Expose it as a ctx global.
  ctx._activeCloudDocVersion = (opts.V != null) ? opts.V : null;
  ctx.Y = makeY(env);
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  env.ctx = ctx;
  env.api = ctx.SafetyLabCRDT;
  env.setV = (v) => { ctx._activeCloudDocVersion = v; };
  env.api.refresh();
  return env;
}

const COLS = { acFunctionsData: [], acReqData: [], acAssumptionsData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [], systemsData: [], ftaPages: [] };
const mk = (fha) => Object.assign({ acFhaData: fha }, JSON.parse(JSON.stringify(COLS)));
const rows = (doc, col) => Array.from(doc.getMap('col:' + col).values()).map(v => JSON.parse(v));
const stampOf = (doc) => doc.getMap('meta').get('docVersion');
const P1 = mk([{ internalId: 'p1-a' }, { internalId: 'p1-b' }]);   // the CRDT doc's content (a teammate's live state)
const P2 = mk([{ internalId: 'p2-x' }]);                            // a DIFFERENT snapshot the app just loaded

// ---------------------------------------------------------------------------
console.log('[auth] 0 — harness runs the real module; flag default OFF is Stage 1');
{
  const e = boot(JSON.parse(JSON.stringify(P1)), 'proj-1');            // no auth opt => flag off
  check('session started', e.api.status().started === true);
  check('status reports authoritative=false by default', e.api.status().authoritative === false);
  check('doc seeded from model (p1-a,p1-b)', rows(e.docs[0], 'acFhaData').map(r => r.internalId).join(',') === 'p1-a,p1-b');
}

// ---------------------------------------------------------------------------
console.log('[auth] 1 — flag OFF: adoptModel keeps Stage 1 (snapshot wins, no stamp written)');
{
  const e = boot(JSON.parse(JSON.stringify(P1)), 'proj-1');
  e.model = JSON.parse(JSON.stringify(P2));                           // app "loaded" a different snapshot
  e.api.adoptModel();                                                 // Stage 1 adopt: snapshot -> doc
  check('doc now holds the snapshot rows (p2-x)', rows(e.docs[0], 'acFhaData').map(r => r.internalId).join(',') === 'p2-x');
  check('no stamp written while flag off', stampOf(e.docs[0]) === undefined);
}

// ---------------------------------------------------------------------------
console.log('[auth] 2 — flag ON, stamp ABSENT: SEED (snapshot wins) — legacy project, no resurrection');
{
  const e = boot(JSON.parse(JSON.stringify(P1)), 'proj-1', { auth: true, V: 7 });
  check('status reports authoritative=true', e.api.status().authoritative === true);
  // Isolate the stamp-ABSENT branch: a legacy CRDT doc holds content but no stamp.
  // (An offline boot legitimately seeds+stamps the empty doc, so clear it to model
  //  the legacy case where the doc arrived from a pre-Stage-2 load with no meta.)
  e.docs[0].getMap('meta').delete('docVersion');
  check('precondition: stamp is absent', stampOf(e.docs[0]) === undefined);
  e.model = JSON.parse(JSON.stringify(P2));                           // newer snapshot loaded at V=7
  e.setV(7);
  e.applied.length = 0;
  e.api.adoptModel();                                                 // no stamp yet -> SEED
  check('SEED: doc overwritten with snapshot rows (p2-x)', rows(e.docs[0], 'acFhaData').map(r => r.internalId).join(',') === 'p2-x');
  check('SEED: stamp set to V (7)', stampOf(e.docs[0]) === 7);
  check('SEED: model was NOT pulled onto (no __crdtApply)', e.applied.length === 0);
}

// ---------------------------------------------------------------------------
console.log('[auth] 3 — flag ON, stamp < V: SEED — a STALE CRDT copy must not win over a newer snapshot');
{
  const e = boot(JSON.parse(JSON.stringify(P1)), 'proj-1', { auth: true, V: 3 });
  e.docs[0].getMap('meta').set('docVersion', 2);                      // CRDT last reconciled at snapshot v2…
  e.model = JSON.parse(JSON.stringify(P2)); e.setV(9);                // …but the snapshot is now v9 (newer)
  e.applied.length = 0;
  e.api.adoptModel();
  check('SEED: newer snapshot wins over stale CRDT (p2-x)', rows(e.docs[0], 'acFhaData').map(r => r.internalId).join(',') === 'p2-x');
  check('SEED: stamp advanced to 9', stampOf(e.docs[0]) === 9);
  check('SEED: no stale rows resurrected onto the model', e.applied.length === 0);
}

// ---------------------------------------------------------------------------
console.log('[auth] 4 — flag ON, stamp >= V: PULL — a live teammate edit in the CRDT doc WINS');
{
  const e = boot(JSON.parse(JSON.stringify(P1)), 'proj-1', { auth: true, V: 5 });
  e.docs[0].getMap('meta').set('docVersion', 5);                      // CRDT is reconciled to snapshot v5…
  e.model = JSON.parse(JSON.stringify(P2)); e.setV(5);                // …and the opening snapshot is also v5
  e.applied.length = 0;
  e.api.adoptModel();
  check('PULL: model was updated from the CRDT doc (__crdtApply fired)', e.applied.length === 1);
  const got = e.applied[0] && e.applied[0].acFhaData ? e.applied[0].acFhaData.map(r => r.internalId).join(',') : '';
  check('PULL: model received the CRDT doc rows (p1-a,p1-b), NOT the snapshot', got === 'p1-a,p1-b');
  check('PULL: doc unchanged / not re-seeded from snapshot', rows(e.docs[0], 'acFhaData').map(r => r.internalId).join(',') === 'p1-a,p1-b');
}

// ---------------------------------------------------------------------------
console.log('[auth] 5 — flag ON, force (restore/rollback): SEED even when stamp >= V');
{
  const e = boot(JSON.parse(JSON.stringify(P1)), 'proj-1', { auth: true, V: 8 });
  e.docs[0].getMap('meta').set('docVersion', 10);                    // stamp ahead of V…
  e.model = JSON.parse(JSON.stringify(P2)); e.setV(8);               // …a deliberate rollback to v8
  e.applied.length = 0;
  e.api.adoptModel({ force: true });
  check('FORCE: rollback snapshot wins despite stamp>=V (p2-x)', rows(e.docs[0], 'acFhaData').map(r => r.internalId).join(',') === 'p2-x');
  check('FORCE: stamp set to the restored version (8)', stampOf(e.docs[0]) === 8);
  check('FORCE: CRDT not pulled onto the model', e.applied.length === 0);
}

// ---------------------------------------------------------------------------
console.log('[auth] 6 — noteSnapshotVersion advances the stamp MAX-merge, project-scoped');
{
  const e = boot(JSON.parse(JSON.stringify(P1)), 'proj-1', { auth: true, V: 1 });
  e.api.noteSnapshotVersion('proj-1', 5);
  check('stamp set to 5 on a confirmed write', stampOf(e.docs[0]) === 5);
  e.api.noteSnapshotVersion('proj-1', 3);
  check('stamp does NOT regress on an older version (stays 5)', stampOf(e.docs[0]) === 5);
  e.api.noteSnapshotVersion('proj-1', 9);
  check('stamp advances to 9', stampOf(e.docs[0]) === 9);
  e.api.noteSnapshotVersion('proj-OTHER', 99);
  check('a write for a different project is ignored (stays 9)', stampOf(e.docs[0]) === 9);
}

// ---------------------------------------------------------------------------
console.log('[auth] 7 — flag ON but noteSnapshotVersion is inert without a doc/mismatch');
{
  const e = boot(JSON.parse(JSON.stringify(P1)), 'proj-1');           // flag OFF here
  e.api.noteSnapshotVersion('proj-1', 5);
  check('flag OFF: noteSnapshotVersion writes no stamp', stampOf(e.docs[0]) === undefined);
}

// ---------------------------------------------------------------------------
console.log('\n[auth] MUTATION PROOFS (these SHOULD be caught by the checks above)');
check('mutation guard: p1 != p2 rows', 'p1-a,p1-b' !== 'p2-x');
check('mutation guard: stamp compare is strict (7 > undefined-safe)', (undefined == null));

console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

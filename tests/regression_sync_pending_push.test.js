#!/usr/bin/env node
/*
 * Regression — R18: a sync pull never discards a pending local change (13 Sep 2026).
 *
 * WHAT HAPPENED. An accepted FHA draft of 184 rows vanished about a second after
 * accept; auto-generated requirements did the same to Waqas. Two defects in crdt_sync.js:
 *
 *   D1  the version STAMP (meta.docVersion) was written outside any transaction, so Yjs
 *       fired 'update' with a null origin. The handler reads "not 'local'" as an incoming
 *       change and runs pullToModel — every 12 s, on the cloud autosave's clock, with
 *       nobody else in the project. That pull REPLACES every synced table on screen.
 *   D2  onLocalChange debounces the push by 350 ms. A pull inside that window replaced the
 *       model with a doc that did not hold the edit yet; the push that followed then
 *       deleted it from the doc too. Every copy agreed on nothing.
 *
 * THE RULES NOW PINNED (module executed in a vm with a fake Yjs that fires 'update' with
 * the transaction's origin, exactly as the real library does):
 *   R1  a stamp write fires 'update' with origin 'local' and triggers NO pull
 *   R2  pullToModel flushes a pending push FIRST, so the pull returns the local rows
 *   R3  the exact race — accept, incoming remote update inside the debounce — keeps the rows
 *   R5  push-before-pull is a THREE-WAY diff against the synced baseline: a teammate's delete
 *       that already merged into the doc is never written back (resurrected) by our push
 *   R4  mutations (stamp outside a transaction; pull without the push; two-way push) go red
 *
 * Run: node tests/regression_sync_pending_push.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'crdt_sync.js'), 'utf8');

// A Yjs fake that behaves like the real one where it matters here: a transaction commits
// then fires every 'update' handler with (update, origin); a map write OUTSIDE a transaction
// is an implicit transaction with origin null (that is how D1 fired a pull).
function makeY(env) {
  function ObservedMap(doc) { this._m = new Map(); this._doc = doc; }
  ['get', 'has', 'keys', 'values', 'entries'].forEach(k => { ObservedMap.prototype[k] = function () { return this._m[k].apply(this._m, arguments); }; });
  Object.defineProperty(ObservedMap.prototype, 'size', { get() { return this._m.size; } });
  ObservedMap.prototype.set = function (k, v) { const r = this._m.set(k, v); this._doc._touched(); return r; };
  ObservedMap.prototype.delete = function (k) { const r = this._m.delete(k); this._doc._touched(); return r; };
  function Doc() { this._maps = new Map(); this._handlers = []; this._tx = null; env.docs.push(this); }
  Doc.prototype.getMap = function (n) { if (!this._maps.has(n)) this._maps.set(n, new ObservedMap(this)); return this._maps.get(n); };
  Doc.prototype._touched = function () {
    if (this._tx) { this._tx.dirty = true; return; }
    this._fire(null);                                   // implicit transaction: origin null
  };
  Doc.prototype._fire = function (origin) { const hs = this._handlers.slice(); env.updates.push(origin); hs.forEach(h => h(new Uint8Array(1), origin)); };
  Doc.prototype.transact = function (f, origin) {
    if (this._tx) { f(); return; }                      // nested: joins the outer transaction
    this._tx = { origin: origin === undefined ? null : origin, dirty: false };
    try { f(); } finally { const tx = this._tx; this._tx = null; if (tx.dirty) this._fire(tx.origin); }
  };
  Doc.prototype.on = function (ev, cb) { if (ev === 'update') this._handlers.push(cb); };
  Doc.prototype.destroy = function () {};
  return { Doc, applyUpdate(doc, u, origin) { doc.transact(() => { doc.getMap('col:acFhaData')._doc._touched(); }, origin); },
           encodeStateVector: () => new Uint8Array(0), encodeStateAsUpdate: () => new Uint8Array(0) };
}

function boot(model, projectId, opts) {
  opts = opts || {};
  const env = { docs: [], timers: [], applied: [], updates: [], listeners: {} };
  const win = {
    Y: null, navigator: { onLine: false },
    localStorage: { getItem: k => (k === 'SLA_CRDT' ? '1' : null), setItem() {}, removeItem() {} },
    console: { info() {}, warn() {}, error() {}, log() {} },
    getActiveCloudProjectId: () => env.project, getActiveWorkspaceId: () => 'ws-1', isSupabaseSignedIn: () => true,
    getSupabaseClient: () => ({ channel: () => ({ on() { return this; }, subscribe() { return this; }, send() {}, unsubscribe() {} }),
                                from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }), upsert: () => Promise.resolve({}) }) }),
    __crdtCapture: () => JSON.parse(JSON.stringify(env.model)),
    __crdtApply: (p) => { env.applied.push(p); env.model = Object.assign(env.model, JSON.parse(JSON.stringify(p))); },   // the real one replaces the arrays
    addEventListener: (ev, cb) => { (env.listeners[ev] = env.listeners[ev] || []).push(cb); },
    projectConfig: {}, SL_CRDT_AUTHORITATIVE: opts.auth === true
  };
  win.window = win; env.model = model; env.project = projectId;
  const doc = { getElementById: () => null, createElement: () => ({ style: {}, set src(v) {}, appendChild() {} }), head: { appendChild() {} }, documentElement: { appendChild() {} }, body: { appendChild() {} } };
  const ctx = Object.assign(win, {
    document: doc,
    setTimeout: (f, ms) => { env.timers.push({ f, ms }); return env.timers.length; },
    clearTimeout: (id) => { if (env.timers[id - 1]) env.timers[id - 1].f = null; },
    setInterval: () => 0,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: b => Buffer.from(b, 'base64').toString('binary'),
    Date, JSON, Math, Uint8Array, Promise, Array, Object, String
  });
  ctx._activeCloudDocVersion = (opts.V != null) ? opts.V : null;
  ctx.Y = makeY(env);
  vm.createContext(ctx);
  vm.runInContext(opts.src || SRC, ctx);
  env.ctx = ctx; env.api = ctx.SafetyLabCRDT;
  // the adopt window (15 s after a seed) turns pulls into pushes by design; the race
  // under test happens in steady state, so step the module's clock past it
  env.advance = (ms) => { const base = Date.now() + ms; class D extends Date { static now() { return base; } } ctx.Date = D; };
  env.pendingPush = () => env.timers.filter(t => t.f && t.ms === 350).length;   // the onLocalChange debounce
  env.firePending = () => { env.timers.forEach(t => { if (t.f && t.ms === 350) { const f = t.f; t.f = null; f(); } }); };
  env.remoteUpdate = () => env.docs[0].transact(() => env.docs[0].getMap('col:acFhaData')._doc._touched(), 'remote');
  env.api.refresh();
  return env;
}
const COLS = { acFunctionsData: [], acReqData: [], acAssumptionsData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [], systemsData: [], ftaPages: [] };
const mk = (fha) => Object.assign({ acFhaData: fha }, JSON.parse(JSON.stringify(COLS)));
const docRows = (e) => Array.from(e.docs[0].getMap('col:acFhaData').values()).map(v => JSON.parse(v).internalId).sort().join(',');

function suite(src, label) {
  const results = { r1: false, r2: false, r3: false, r5: false };
  // R1 — the stamp is our own change
  {
    const e = boot(mk([{ internalId: 'a' }]), 'p1', { auth: true, V: 4, src });
    e.applied.length = 0; e.updates.length = 0;
    e.api.noteSnapshotVersion('p1', 9);                              // cloud autosave confirmed version 9
    const origin = e.updates[e.updates.length - 1];
    results.r1 = e.docs[0].getMap('meta').get('docVersion') === 9 && origin === 'local' && e.applied.length === 0;
    if (label === 'shipped') {
      check('R1 stamp advanced to 9', e.docs[0].getMap('meta').get('docVersion') === 9);
      check("R1 the stamp write fires 'update' with origin 'local' (was null)", origin === 'local', String(origin));
      check('R1 no pull ran on the stamp write', e.applied.length === 0);
    }
  }
  // R2 / R3 — the race
  {
    const e = boot(mk([{ internalId: 'a' }]), 'p1', { auth: true, V: 4, src });
    e.advance(20000);                                                  // past the 15 s adopt window: steady state
    e.model.acFhaData.push({ internalId: 'b' }, { internalId: 'c' });  // the accept: rows on screen
    e.api.onLocalChange();                                             // push armed, 350 ms away
    const armed = e.pendingPush() === 1;
    e.applied.length = 0;
    e.remoteUpdate();                                                  // a teammate's update lands INSIDE the window
    const pulled = e.applied.length >= 1;
    const survived = e.model.acFhaData.map(r => r.internalId).sort().join(',') === 'a,b,c';
    const inDoc = docRows(e) === 'a,b,c';
    const timerCleared = e.pendingPush() === 0;
    e.firePending();                                                   // whatever is left of the debounce fires
    const stillThere = docRows(e) === 'a,b,c' && e.model.acFhaData.length === 3;
    results.r2 = armed && pulled && inDoc && timerCleared;
    results.r3 = survived && stillThere;
    if (label === 'shipped') {
      check('R2 precondition: the accept armed one pending push', armed);
      check('R2 the remote update ran a pull', pulled);
      check('R2 the pull flushed the pending push first: the doc holds a,b,c', inDoc, docRows(e));
      check('R2 the debounce timer was consumed by the flush (no double push)', timerCleared);
      check('R3 the accepted rows survived the pull on screen (a,b,c)', survived, e.model.acFhaData.map(r => r.internalId).join(','));
      check('R3 and after the debounce would have fired, doc and screen still agree', stillThere);
    }
  }
  // R5 — a teammate's delete is never resurrected by our push-before-pull
  {
    const e = boot(mk([{ internalId: 'a' }, { internalId: 'b' }]), 'p1', { auth: true, V: 4, src });
    e.advance(20000);
    e.applied.length = 0;
    // the teammate deleted 'b': the delete has merged into OUR doc copy, the pull is about to run
    e.docs[0].transact(() => { e.docs[0].getMap('col:acFhaData').delete('b'); e.docs[0].getMap('ord:acFhaData').delete('b'); }, 'remote');
    const gone = e.model.acFhaData.map(r => r.internalId).join(',') === 'a' && docRows(e) === 'a';
    results.r5 = gone;
    if (label === 'shipped') check("R5 a remote delete merged before the pull is honored, not resurrected by the push-first (model and doc both read 'a')", gone, 'model=' + e.model.acFhaData.map(r => r.internalId).join(',') + ' doc=' + docRows(e));
  }
  return results;
}

console.log('[shipped crdt_sync.js]');
suite(SRC, 'shipped');

console.log('\n[mutations must go red]');
{
  const m1 = SRC.replace("ydoc.transact(function () { ydoc.getMap('meta').set('docVersion', v); }, 'local')", "ydoc.getMap('meta').set('docVersion', v)");
  check('mutation 1 applied (stamp outside a transaction)', m1 !== SRC);
  const r = suite(m1, 'mut');
  check('mutation 1: R1 goes red (the stamp pulls again)', r.r1 === false);
  const m2 = SRC.replace("if (!(opts && opts.load)) { try { pushLocal(); } catch (_) {} }", "");
  check('mutation 2 applied (pull without the flush)', m2 !== SRC);
  const r2 = suite(m2, 'mut');
  check('mutation 2: R2/R3 go red (the rows are lost to the pull)', r2.r2 === false && r2.r3 === false);
  const m3 = SRC.replace("if (full ? (map.get(k) !== next) : (bcol.get(k) !== next)) map.set(k, next);", "if (map.get(k) !== next) map.set(k, next);");
  check('mutation 3 applied (two-way push: write whatever the doc lacks)', m3 !== SRC);
  const r3 = suite(m3, 'mut');
  check("mutation 3: R5 goes red (the teammate's delete comes back)", r3.r5 === false);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

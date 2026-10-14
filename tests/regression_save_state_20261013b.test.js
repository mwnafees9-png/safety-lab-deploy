#!/usr/bin/env node
/*
 * Regression (unit): AUTOSAVE with live co-editing. 13 Oct 2026 (late).
 * Waqas, 13 Oct: "when a user saves a choice/change it should be autosaving". The moment a change
 * is acknowledged it is saved, at once and durably (this device, the live sync, the cloud copy),
 * with no separate Save step. Replaces the Office-style Save / Don't Save / Cancel of earlier the
 * same day (save_state.js v1.x), which this suite used to test.
 *
 * FIX: site/save_state.js v2.0. Acknowledge (change_ack.js) runs one save of the ACCEPTED project.
 * Only what waits for an acknowledgement is unsaved: a change in progress and the collected moves
 * and undos (acknowledged on leaving the view). While moves wait, an acknowledged content change is
 * written to this device and the cloud WITHOUT the moves (SLChangeAck.acceptedSnapshot()). Offline
 * or a failed upload: kept on this device, retried (on 'online', and after 3, 10, 30, 60 s, then
 * every 2 min); the pending upload rides in the autosave meta, so a crash retries it. Leaving with
 * something accepted not yet saved asks Stay / Continue anyway. A crash with changes still waiting
 * asks about them again on the next open, measured from the accepted copy kept for that.
 *
 * EXECUTED: the real crdt_sync.js, change_ack.js and save_state.js, with the REAL bundled Yjs, in
 * two vm "tabs" wired through a fake realtime channel; a fake cloud push with switchable outcomes;
 * a fake IndexedDB shared by tabs of one "device".
 *   S1  acknowledged = saved: on this device, to the cloud (once), and teammates see it at once
 *   S2  a change still waiting for its acknowledgement is not shared and not uploaded
 *   S3  Cancel change: nothing saved, nothing shared
 *   S4  moves collected: a content change acknowledged meanwhile is saved (device, cloud, teammates
 *       live) WITHOUT the moves; the
 *       moves save when acknowledged; Cancel on them leaves the content change saved and shared
 *   S5  offline: Not saved (offline), kept, flagged in the autosave meta; back online it uploads
 *   S6  a server error: retried on a timer until it lands; refused with the live sync running is saved
 *   S7  a change acknowledged while a save runs is saved by one more save right after (none lost)
 *   S8  guard(): nothing pending goes at once; a waiting move is asked first then saved; an upload
 *       still pending asks Stay / Continue anyway (Continue banks a copy)
 *   S9  a crash: a pending upload is retried on the next open; changes still waiting are asked
 *       about again (Acknowledge saves them, Cancel returns to what was accepted)
 *   S10 this device cannot store it: Not saved, said, and guard() asks
 *   M1-M5 mutation proofs: no save on Acknowledge (S1 red); the accepted snapshot ignored (S4 red);
 *       no retry timer (S6 red); guard() ignores a pending upload (S8 red); no live send of the
 *       accepted change while moves wait (S4 red: B does not see it)
 *
 * Run: node tests/regression_save_state_20261013b.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0, quiet = false;   // quiet: a mutated copy runs; its red checks are the proof, not failures of this suite
const check = (n, c, d) => { if (c) { pass++; if (!quiet) console.log('  PASS  ' + n); } else { fail++; if (!quiet) console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const CRDT = fs.readFileSync(path.join(SITE, 'crdt_sync.js'), 'utf8');
const ACK = fs.readFileSync(path.join(SITE, 'change_ack.js'), 'utf8');
const SAVE = fs.readFileSync(path.join(SITE, 'save_state.js'), 'utf8');
const YJS = fs.readFileSync(path.join(SITE, 'vendor', 'yjs.min.js'), 'utf8');
const J = v => JSON.parse(JSON.stringify(v));
function mutate(src, a, b, name) { if (src.indexOf(a) < 0) { console.log('  FAIL  mutation ' + name + ' could not be built (the guarded line changed)'); fail++; return src; } return src.replace(a, b); }

function realY() {
  const ctx = { console, setTimeout, clearTimeout, Uint8Array, Map, Set, Promise, TextEncoder, TextDecoder, crypto: require('crypto').webcrypto };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(YJS + ';globalThis.Y = Y;', ctx);
  return ctx.Y;
}
const Y = Object.assign({}, realY(), { IndexeddbPersistence: undefined });
let rooms = {};
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
const STORES = { acFunctionsData: [], acReqData: [], acAssumptionsData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [], acFcimData: [], routingData: [], resourcesData: [], itemsData: [], flightPhasesData: [], systemsData: [], ftaPages: [], projectConfig: { journal: { entries: [] } }, mlData: {}, stpaData: {}, typeCounters: {} };

function fakeDb() { const m = new Map(); return { m, available: () => true, get: k => Promise.resolve(m.has(k) ? J(m.get(k)) : undefined), set: (k, v) => { m.set(k, J(v)); return Promise.resolve(); }, del: k => { m.delete(k); return Promise.resolve(); } }; }
function tab(name, fha, srcs, opts) {
  srcs = srcs || {}; opts = opts || {};
  const env = { name, timers: [], journal: [], model: Object.assign({ acFhaData: J(fha) }, J(STORES), { projectName: 'P' }), writes: 0, choice: null,
    localOk: true, cloud: { mode: 'ok', calls: [], hold: null }, listeners: {}, banked: 0, nav: { onLine: true }, db: opts.db || fakeDb(), metas: [] };
  const win = {
    Y, navigator: env.nav,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    console: { info() {}, warn() {}, error() {}, log() {} },
    getActiveCloudProjectId: () => 'proj-s', getActiveWorkspaceId: () => 'ws-1', isSupabaseSignedIn: () => true,
    getSupabaseClient: fakeClient,
    __crdtCapture: () => J(env.model),
    addEventListener(t, f) { (env.listeners[t] = env.listeners[t] || []).push(f); }, dispatchEvent() { return true; }, _activeCloudDocVersion: 3,
    _supabaseSession: { user: { id: 'u-' + name, email: name.toLowerCase() + '@example.com' } }, SLDB: env.db,
    _bankWorkingState: () => { env.banked++; }
  };
  win.window = win;
  const doc = { getElementById: () => null, createElement: () => ({ style: {}, set src(v) {}, appendChild() {} }), head: { appendChild() {} }, documentElement: { appendChild() {} }, body: null, visibilityState: 'visible' };
  const ctx = Object.assign(win, { document: doc,
    setTimeout: (f, ms) => { env.timers.push({ f, ms }); return env.timers.length; }, clearTimeout: (id) => { if (env.timers[id - 1]) env.timers[id - 1].f = null; }, setInterval: () => 0,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: b => Buffer.from(b, 'base64').toString('binary'),
    Date, JSON, Math, Uint8Array, Promise, Array, Object, String, Map, Set, Number, Boolean, Error });
  // the stores are globals, as in the app (one lexical scope)
  Object.keys(env.model).forEach(k => Object.defineProperty(ctx, k, { get: () => env.model[k], set: v => { env.model[k] = v; }, configurable: true }));
  // the app's own coupling, reduced to what these modules use
  ctx.__crdtApply = (p) => { Object.keys(p).forEach(k => { if (!/^__/.test(k)) env.model[k] = J(p[k]); }); ctx.SLChangeAck.system(() => ctx.scheduleAutosave()); };
  ctx._snapshotProject = () => J(env.model);
  ctx._applyProjectData = d => { Object.keys(d).forEach(k => { env.model[k] = J(d[k]); }); };
  ctx._writeAutosave = () => {
    env.writes++; ctx.SLChangeAck.stash(JSON.stringify(env.model));
    if (ctx.SLSaveState) env.metas.push(Object.assign({ model: JSON.stringify(env.model) }, ctx.SLSaveState.autosaveMeta()));
    ctx.__slAutosaveLs = env.localOk; ctx.__slAutosaveIdb = Promise.resolve(env.localOk);
    return env.localOk;
  };
  // the cloud push (cloud_sync.js __slCloudSyncPushNow): records what it was handed, answers as told
  ctx.__slCloudSyncPushNow = (o) => {
    env.cloud.calls.push(o && o.snapshot ? JSON.parse(o.snapshot) : J(env.model));
    const m = env.cloud.mode;
    if (m === 'hold') return new Promise(r => { env.cloud.hold = () => r({ ok: true, reason: 'ok' }); });
    return Promise.resolve(m === 'ok' ? { ok: true, reason: 'ok' } : { ok: false, reason: m, error: m === 'error' ? new Error('HTTP 503') : undefined });
  };
  ctx.scheduleAutosave = () => { ctx.SLChangeAck.noteChange(); ctx.SafetyLabCRDT.onLocalChange(); ctx._writeAutosave(); return true; };
  ctx.jrnl = (k, s) => env.journal.push(k + ': ' + s);
  vm.createContext(ctx);
  vm.runInContext(srcs.crdt || CRDT, ctx);
  vm.runInContext(srcs.ack || ACK, ctx);
  vm.runInContext(srcs.save || SAVE, ctx);
  ctx.SLChangeAck._setTestAnswer('keep');
  env.ctx = ctx; env.api = ctx.SafetyLabCRDT; env.ack = ctx.SLChangeAck; env.save = ctx.SLSaveState;
  // timers of 2.5 s and longer (retries, recovery, the local-write timeout) run only when asked for
  env.flush = (long) => { let n = 0; for (let pass = 0; pass < 6; pass++) { const list = env.timers.filter(t => t.f && (long || t.ms == null || t.ms < 2500)); list.forEach(t => { if (t.f) { const f = t.f; t.f = null; f(); n++; } }); if (!env.timers.some(t => t.f && (long || t.ms == null || t.ms < 2500))) break; } return n; };
  env.longTimers = () => env.timers.filter(t => t.f && [3000, 10000, 30000, 60000, 120000].indexOf(t.ms) >= 0).map(t => t.ms);   // save_state's retry timers (the live sync's 5 s server write is its own)
  env.fire = (type) => (env.listeners[type] || []).forEach(f => f({ type }));
  env.rows = () => env.model.acFhaData.map(r => r.internalId + ':' + r.severity).join(',');
  env.advance = (ms) => { const b = Date.now() + ms; class D extends Date { static now() { return b; } } ctx.Date = D; };
  ctx._writeAutosave();
  env.api.refresh();
  return env;
}
const settle = () => new Promise(r => setImmediate(r));
async function run(env, p, long) { let out, done = false; Promise.resolve(p).then(v => { out = v; done = true; }, e => { out = e; done = true; }); for (let i = 0; i < 40 && !done; i++) { env.flush(long); await settle(); } return out; }
async function idle(env, long) { for (let i = 0; i < 12; i++) { env.flush(long); await settle(); } }
// a person's edit: input, the write, the announcement, and the acknowledgement (answered Keep)
async function edit(env, mut) { env.ack._markInput(); mut(env.model.acFhaData); env.ctx.scheduleAutosave(); const r = await run(env, env.ack.flush({ changeOnly: true })); await idle(env); return r; }
async function boot(srcs) {
  rooms = {};
  const seed = [{ internalId: 'r1', severity: 'Major' }, { internalId: 'r2', severity: 'Minor' }];
  const A = tab('A', seed, srcs); await settle(); await settle(); A.flush();
  const B = tab('B', seed); await settle(); await settle(); B.flush(); A.flush();
  A.advance(20000); B.advance(20000);
  return { A, B };
}
const both = (A, B) => { for (let i = 0; i < 4; i++) { A.flush(); B.flush(); } };


const last = env => env.cloud.calls[env.cloud.calls.length - 1];
const sevOnly = (snap, id) => { const r = ((snap || {}).acFhaData || []).find(x => x.internalId === id); return r ? r.severity : '-'; };
const sev = (snap, id) => { const r = ((snap || {}).acFhaData || []).find(x => x.internalId === id); return r ? r.severity + (r.x != null ? '@' + r.x : '') : '-'; };

async function suite(SRC, tag) {
  const P = {};
  try { await suiteBody(SRC, tag, P); } catch (e) { check('the suite' + tag + ' ran to the end', false, String(e && e.stack || e).split('\n').slice(0, 4).join(' ')); }
  return P;
}
async function suiteBody(SRC, tag, P) {
  // ---------------------------------------------------------------------- S1
  if (!quiet) console.log('\n[S1' + tag + '] acknowledged = saved');
  let { A, B } = await boot({ save: SRC });
  check('both tabs live, nothing waiting, nothing unsaved', A.api.status().started && B.api.status().started && !A.save.isDirty() && !B.save.isDirty());
  const w0 = A.writes;
  await edit(A, rows => { rows[0].severity = 'Catastrophic'; });
  both(A, B);
  let st = A.save.status();
  P.s1 = st.state === 'saved' && st.where === 'cloud' && A.cloud.calls.length === 1 && B.rows() === 'r1:Catastrophic,r2:Minor';
  check('Acknowledge saved it: "Saved", to the cloud, at a time', st.state === 'saved' && st.where === 'cloud' && st.savedAt > 0, JSON.stringify(st));
  check('the cloud got exactly one push, holding the change', A.cloud.calls.length === 1 && sev(last(A), 'r1') === 'Catastrophic', A.cloud.calls.length + ' pushes');
  check('this device was written for the save', A.writes > w0);
  check('teammates see it at once (no Save step)', B.rows() === 'r1:Catastrophic,r2:Minor', B.rows());
  check('nothing unsaved, nothing waiting, nothing pending upload', !A.save.isDirty() && !st.cloudPending && !A.save.holdsSync());
  check('the acknowledgement is in the journal', A.journal.some(j => /^change-ack: a@example\.com acknowledged/.test(j)), A.journal.join(' | '));

  // ---------------------------------------------------------------------- S2
  if (!quiet) console.log('\n[S2' + tag + '] a change still waiting for its acknowledgement is not shared or uploaded');
  const c2 = A.cloud.calls.length;
  A.ack._markInput(); A.model.acFhaData[1].severity = 'Hazardous'; A.ctx.scheduleAutosave();
  both(A, B);
  check('it waits (held from the sync), and the tab says something is not saved', A.save.holdsSync() && A.save.isDirty() && A.ack.pendingUser(), JSON.stringify(A.save.status()));
  check('B does not see it and nothing was uploaded', B.rows() === 'r1:Catastrophic,r2:Minor' && A.cloud.calls.length === c2, B.rows());
  await run(A, A.ack.flush()); await idle(A); both(A, B);
  check('once acknowledged: uploaded and shared', A.cloud.calls.length === c2 + 1 && B.rows() === 'r1:Catastrophic,r2:Hazardous', B.rows());

  // ---------------------------------------------------------------------- S3
  if (!quiet) console.log('\n[S3' + tag + '] Cancel change: nothing saved, nothing shared');
  const c3 = A.cloud.calls.length;
  A.ack._setTestAnswer('cancel');
  await edit(A, rows => { rows[0].severity = 'Minor'; });
  A.ack._setTestAnswer('keep'); both(A, B);
  check('the value is back, no upload, B never saw it', A.rows() === 'r1:Catastrophic,r2:Hazardous' && A.cloud.calls.length === c3 && B.rows() === 'r1:Catastrophic,r2:Hazardous', A.rows() + ' / ' + B.rows());
  check('and nothing is left waiting or unsaved', !A.save.isDirty());

  // ---------------------------------------------------------------------- S4
  if (!quiet) console.log('\n[S4' + tag + '] moves collected: a content change acknowledged meanwhile is saved without them');
  A.ack._markInput();
  A.ack.deferred({ kind: 'move', label: 'Move r2' }, () => { A.model.acFhaData[1].x = 77; A.ctx.scheduleAutosave(); });
  await idle(A); both(A, B);
  check('the move waits (collected), and the indicator count says so', A.ack.collected().length === 1 && A.save.status().collected === 1 && A.save.holdsSync());
  const c4 = A.cloud.calls.length;
  await edit(A, rows => { rows[0].severity = 'Major'; });
  both(A, B);
  P.s4 = A.cloud.calls.length === c4 + 1 && sev(last(A), 'r1') === 'Major' && sev(last(A), 'r2') === 'Hazardous';
  check('the content change was uploaded at once', A.cloud.calls.length === c4 + 1 && sev(last(A), 'r1') === 'Major', A.cloud.calls.length - c4 + ' pushes');
  check('WITHOUT the waiting move (r2 has no position in the upload)', sev(last(A), 'r2') === 'Hazardous', sev(last(A), 'r2'));
  check('it is "Saved", with the move still waiting', A.save.status().state === 'saved' && A.save.waiting() && !A.save.unsaved());
  check('the accepted copy is kept on this device for a crash (its id rides in the meta)', !!A.save.status().acceptedId && A.db.m.has(A.save.ACCEPTED_KEY) && A.metas[A.metas.length - 1].unacked === true && A.metas[A.metas.length - 1].acceptedId === A.db.m.get(A.save.ACCEPTED_KEY).id);
  P.s4b = B.rows() === 'r1:Major,r2:Hazardous' && B.model.acFhaData[1].x === undefined;
  check('B sees the content change live, on its own, and not the waiting move', P.s4b, B.rows() + ' x=' + B.model.acFhaData[1].x);
  check('A still has the move on screen, waiting', A.model.acFhaData[1].x === 77 && A.ack.collected().length === 1);
  await run(A, A.ack.flushDeferred()); await idle(A); both(A, B);
  check('the move acknowledged: uploaded with it, and B has both', sev(last(A), 'r2') === 'Hazardous@77' && sev(last(A), 'r1') === 'Major' && B.rows() === 'r1:Major,r2:Hazardous' && B.model.acFhaData[1].x === 77, sev(last(A), 'r2') + ' / ' + B.rows());
  // Cancel on the collection
  A.ack._markInput();
  A.ack.deferred({ kind: 'move', label: 'Move r1' }, () => { A.model.acFhaData[0].x = 5; A.ctx.scheduleAutosave(); });
  await idle(A);
  await edit(A, rows => { rows[1].severity = 'Minor'; });
  A.ack._setTestAnswer('cancel');
  await run(A, A.ack.flushDeferred()); await idle(A); both(A, B);
  A.ack._setTestAnswer('keep');
  check('Cancel on the moves: the move is gone, the content change stays, saved and shared', A.model.acFhaData[0].x === undefined && A.rows() === 'r1:Major,r2:Minor' && B.rows() === 'r1:Major,r2:Minor' && !A.save.isDirty(), A.rows() + ' / ' + B.rows() + ' x=' + A.model.acFhaData[0].x);

  // ---------------------------------------------------------------------- S5
  if (!quiet) console.log('\n[S5' + tag + '] offline');
  A.nav.onLine = false; A.cloud.mode = 'offline';
  await edit(A, rows => { rows[0].severity = 'Hazardous'; });
  st = A.save.status();
  check('"Not saved: offline", the upload pending, the tab not closable', st.state === 'offline' && st.cloudPending && A.save.unsaved() && A.ctx.__slabCanClose() === false, JSON.stringify(st));
  check('the pending upload is in the autosave meta (a crash retries it)', A.metas[A.metas.length - 1].cloudPending === true);
  check('no timer burns retries while offline (the online event retries)', A.longTimers().length === 0, A.longTimers().join(','));
  both(A, B);
  check('the live sync still carried it to B (it queues on its own)', B.rows() === 'r1:Hazardous,r2:Minor', B.rows());
  A.nav.onLine = true; A.cloud.mode = 'ok';
  const c5 = A.cloud.calls.length;
  A.fire('online'); await idle(A);
  st = A.save.status();
  check('back online: uploaded the latest, Saved, closable', st.state === 'saved' && !st.cloudPending && A.cloud.calls.length === c5 + 1 && sev(last(A), 'r1') === 'Hazardous' && A.ctx.__slabCanClose() === true, JSON.stringify(st));

  // ---------------------------------------------------------------------- S6
  if (!quiet) console.log('\n[S6' + tag + '] a server error is retried until it lands');
  A.cloud.mode = 'error';
  await edit(A, rows => { rows[1].severity = 'Major'; });
  st = A.save.status();
  check('"Not saved", with the reason', st.state === 'error' && st.cloudPending && /cloud could not be reached/.test(st.reason) && /503/.test(st.reason), JSON.stringify(st));
  P.s6a = A.longTimers().indexOf(3000) >= 0;
  check('a retry is scheduled (3 s first)', A.longTimers().indexOf(3000) >= 0, A.longTimers().join(','));
  const c6 = A.cloud.calls.length;
  await idle(A, true);
  check('it retried and backed off while the error lasted', A.cloud.calls.length > c6 && A.save.status().stats.retries >= 1 && A.longTimers().some(ms => ms > 3000), A.longTimers().join(','));
  A.cloud.mode = 'ok';
  await idle(A, true); await idle(A, true);
  st = A.save.status();
  P.s6 = st.state === 'saved' && !st.cloudPending;
  check('the retry landed: Saved, nothing pending, no timers left', st.state === 'saved' && !st.cloudPending && A.longTimers().length === 0 && sevOnly(last(A), 'r2') === 'Major', JSON.stringify(st));
  A.cloud.mode = 'refused';
  await edit(A, rows => { rows[1].severity = 'Minor'; });
  check('the cloud copy refused while the live sync carries it: saved (shared with the team)', A.save.status().state === 'saved' && A.save.status().where === 'team', JSON.stringify(A.save.status()));
  A.cloud.mode = 'ok';

  // ---------------------------------------------------------------------- S7
  if (!quiet) console.log('\n[S7' + tag + '] a change acknowledged while a save runs is not lost');
  A.cloud.mode = 'hold';
  await edit(A, rows => { rows[0].severity = 'Minor'; });
  check('the first save is running', A.save.status().saving === true && !!A.cloud.hold);
  const h1 = A.cloud.hold; A.cloud.mode = 'ok';
  await edit(A, rows => { rows[1].severity = 'Catastrophic'; });
  const c7 = A.cloud.calls.length;
  h1(); await idle(A);
  check('one more save ran after it, with both changes', A.cloud.calls.length === c7 + 1 && sevOnly(last(A), 'r1') === 'Minor' && sevOnly(last(A), 'r2') === 'Catastrophic' && A.save.status().state === 'saved', A.cloud.calls.length - c7 + ' / ' + JSON.stringify(last(A).acFhaData));

  // ---------------------------------------------------------------------- S8
  if (!quiet) console.log('\n[S8' + tag + '] guard()');
  let asked = A.save.status().stats.asked;
  check('nothing waiting or pending: go at once, nothing asked', (await run(A, A.save.guard('open another project'))) === true && A.save.status().stats.asked === asked);
  A.ack._markInput();
  A.ack.deferred({ kind: 'move', label: 'Move r1' }, () => { A.model.acFhaData[0].x = 9; A.ctx.scheduleAutosave(); });
  await idle(A);
  const c8 = A.cloud.calls.length;
  check('a waiting move: acknowledged first (Acknowledge), saved, then go', (await run(A, A.save.guard('sign out'))) === true && A.ack.collected().length === 0 && A.cloud.calls.length === c8 + 1 && sev(last(A), 'r1') === 'Minor@9' && A.save.status().stats.asked === asked);
  A.nav.onLine = false; A.cloud.mode = 'offline';
  await edit(A, rows => { rows[0].severity = 'Major'; });
  A.ctx.SLChoice._setTestAnswer('stay');
  P.s8 = (await run(A, A.save.guard('open another project'))) === false;
  check('an upload still pending: asked, and Stay keeps the person here', P.s8 && A.save.status().stats.asked === asked + 1);
  A.ctx.SLChoice._setTestAnswer('leave');
  const b8 = A.banked;
  check('Continue anyway: allowed, a copy banked first, the reason journaled', (await run(A, A.save.guard('open another project'))) === true && A.banked === b8 + 1 && A.journal.some(j => /^save-pending: /.test(j)));
  A.ctx.SLChoice._setTestAnswer(null);
  A.nav.onLine = true; A.cloud.mode = 'ok'; A.fire('online'); await idle(A);

  // ---------------------------------------------------------------------- S9
  if (!quiet) console.log('\n[S9' + tag + '] a crash');
  A.save.replaced();
  check('opening a project: nothing pending, "All changes saved"', !A.save.isDirty() && A.save.status().state === 'idle');
  const c9 = A.cloud.calls.length;
  A.save.recovered({ cloudPending: true });
  check('a recovered pending upload says so', A.save.status().cloudPending === true);
  await idle(A, true);
  check('and is retried on its own: uploaded, Saved', A.cloud.calls.length === c9 + 1 && A.save.status().state === 'saved' && !A.save.status().cloudPending, JSON.stringify(A.save.status()));
  // changes still waiting at the crash: a second tab on the same device opens the crashed state
  A.ack._markInput();
  A.ack.deferred({ kind: 'move', label: 'Move r2' }, () => { A.model.acFhaData[1].x = 31; A.ctx.scheduleAutosave(); });
  await idle(A);
  const meta = A.metas[A.metas.length - 1], crashed = JSON.parse(meta.model);
  check('the crash state: the move is in the autosave, marked unacknowledged', meta.unacked === true && crashed.acFhaData[1].x === 31 && !!meta.acceptedId);
  for (const ans of ['keep', 'cancel']) {
    const keepRooms = rooms; rooms = {};        // the reopened tab on its own (the live doc is not under test here)
    const crashDb = fakeDb(); A.db.m.forEach((v, k) => crashDb.m.set(k, J(v)));   // the device as the crash left it, for each answer
    const C = tab('C' + ans, crashed.acFhaData, { save: SRC }, { db: crashDb });
    await settle(); C.flush();
    rooms = keepRooms;
    C.ack._setTestAnswer(ans);
    const cc = C.cloud.calls.length;
    C.save.recovered(meta); await idle(C, true);
    const reopened = C.ack.status().open;
    await run(C, C.ack.flush({ changeOnly: true })); await idle(C);
    check('next open (' + ans + '): the change the crash left unacknowledged is open for its acknowledgement', reopened === true);
    if (ans === 'keep') check('next open: the waiting move is asked about again; Acknowledge saves it', C.model.acFhaData[1].x === 31 && C.cloud.calls.length === cc + 1 && /@31$/.test(sev(last(C), 'r2')) && C.ack.status().stats.kept >= 1, JSON.stringify(C.model.acFhaData) + ' pushes ' + (C.cloud.calls.length - cc));
    else check('next open, Cancel change: back to what was accepted (the move undone), nothing uploaded', C.model.acFhaData[1].x === 77 && C.cloud.calls.length === cc && !C.save.isDirty(), JSON.stringify(C.model.acFhaData));
    C.api.stop && C.api.stop();
  }
  await run(A, A.ack.flushDeferred()); await idle(A);

  // ---------------------------------------------------------------------- S10
  if (!quiet) console.log('\n[S10' + tag + '] this device cannot store it');
  A.localOk = false;
  await edit(A, rows => { rows[1].severity = 'Hazardous'; });
  st = A.save.status();
  check('"Not saved", this device named as the reason', st.state === 'error' && st.localFail && /this device could not store it/.test(st.reason), JSON.stringify(st));
  A.ctx.SLChoice._setTestAnswer('stay');
  check('guard() asks before leaving', (await run(A, A.save.guard('close the window'))) === false);
  A.localOk = true; A.ctx.SLChoice._setTestAnswer(null);
  await run(A, A.save.save()); await idle(A);
  check('Save now (Ctrl+S, the header) retries: Saved', A.save.status().state === 'saved' && !A.save.status().localFail, JSON.stringify(A.save.status()));
  A.api.stop(); B.api.stop();
}

(async () => {
  const real = await suite(SAVE, '');
  const keep = { pass, fail };
  console.log('\n[M] mutation proofs (each mutated copy runs the whole suite quietly; the guarded check must go red)');
  quiet = true;
  const m1 = await suite(mutate(SAVE, "if (decision === 'kept') { _requestSave(); return; }", "if (decision === 'kept') { return; }", 'M1'), ' M1');
  const m2 = await suite(mutate(SAVE, "acc = (A && A.acceptedSnapshot) ? A.acceptedSnapshot() : null;", "acc = null;", 'M2'), ' M2');
  const m3 = await suite(mutate(SAVE, "        if (_retryTimer) return;\n        if (!_online()) return;", "        return;", 'M3'), ' M3');
  const m5 = await suite(mutate(SAVE, "else if (C && acc && C.pushAccepted)", "else if (false)", 'M5'), ' M5');
  const m4 = await suite(mutate(SAVE, "        if (!_cloudPending && !_localFail) return true;\n        _stats.asked++;", "        return true;", 'M4'), ' M4');
  quiet = false; pass = keep.pass; fail = keep.fail;
  check('M1 no save on Acknowledge: S1 goes red', !m1.s1);
  check('M2 accepted snapshot ignored: S4 goes red (the move rides the upload)', !m2.s4);
  check('M3 no retry timer: S6 goes red', !m3.s6a || !m3.s6);
  check('M4 guard() ignores a pending upload: S8 goes red', !m4.s8);
  check('M5 no live send while moves wait: S4 goes red (B does not see the acknowledged change)', !m5.s4b);
  check('the real suite is green on every guarded point', real.s1 && real.s4 && real.s4b && real.s6 && real.s8);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  the suite ran to the end — ' + (e && e.stack || e)); process.exit(1); });

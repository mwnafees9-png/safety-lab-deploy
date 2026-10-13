#!/usr/bin/env node
/*
 * Regression (unit) — Office-style saving with live co-editing. 13 Oct 2026.
 * Waqas, 12 Oct ruling 3: unsaved changes work like Microsoft Office: Save / Don't Save /
 * Cancel on closing, opening another project, leaving the page and the like.
 *
 * FOUND: every edit was saved and broadcast to teammates the instant it was made (crdt_sync
 * onLocalChange, cloud_sync every 12 s), so there was no unsaved state to save or discard, and
 * a teammate could see an edit its author had not finished or meant to keep.
 *
 * FIX: site/save_state.js. An acknowledged change is unsaved work: kept on this device (the
 * local autosave, marked unsaved, with the saved version it started from), held back from the
 * live sync (crdt_sync.js holds pushes and pulls while SLSaveState.holdsSync()) and from the
 * cloud autosave. A teammate's saved work still arrives: it merges into the shared doc and this
 * tab REBASES (the doc, plus this person's records since the saved version). Save sends the work
 * in one transaction; Don't Save returns to the saved version and takes the doc as it is.
 *
 * EXECUTED: the real crdt_sync.js, change_ack.js and save_state.js, with the REAL bundled Yjs,
 * in two vm "tabs" wired through a fake realtime channel (the live-undo suite's harness).
 *   S1  the state machine: Keep -> unsaved (saved version kept); Save -> saved; journal lines
 *   S2  teammates never see unsaved work: A's acknowledged edit does not reach B until A saves
 *   S3  B's saved work reaches A while A has unsaved work: A shows both (rebase); nothing lost
 *   S4  A saves: B gets A's edit, A keeps B's row, both tabs agree
 *   S5  Don't Save: A returns to the saved version and keeps B's newer work; acknowledgements stay
 *       in the journal as not saved
 *   S6  the sync restarts while A has unsaved work (reload, sign-in): Save measures A's work
 *       against the shared copy first and never overwrites B's newer row with A's stale copy
 *   S7  guard(): Save / Don't Save / Cancel answer what the caller may do
 *   S8  a crash: recovered(meta.unsaved) keeps the work unsaved
 *   M1-M2 mutation proofs: no hold in onLocalChange (B sees unsaved work: S2 red); no rebase
 *       before a Save after a restart (B's newer row is overwritten: S6 red)
 *
 * Run: node tests/regression_save_state_20261013b.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const CRDT = fs.readFileSync(path.join(SITE, 'crdt_sync.js'), 'utf8');
const ACK = fs.readFileSync(path.join(SITE, 'change_ack.js'), 'utf8');
const SAVE = fs.readFileSync(path.join(SITE, 'save_state.js'), 'utf8');
const YJS = fs.readFileSync(path.join(SITE, 'vendor', 'yjs.min.js'), 'utf8');
const J = v => JSON.parse(JSON.stringify(v));
const NO_REMOTE_REBASE = SAVE.replace("        if (_pending) _scheduleRebase();\n    }", "    }");
if (NO_REMOTE_REBASE === SAVE) { console.log('  FAIL  the suite could not build its isolation variant (remoteArrived changed)'); process.exit(1); }

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

function tab(name, fha, srcs) {
  srcs = srcs || {};
  const env = { name, timers: [], journal: [], model: Object.assign({ acFhaData: J(fha) }, J(STORES), { projectName: 'P' }), writes: 0, choice: null };
  const win = {
    Y, navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    console: { info() {}, warn() {}, error() {}, log() {} },
    getActiveCloudProjectId: () => 'proj-s', getActiveWorkspaceId: () => 'ws-1', isSupabaseSignedIn: () => true,
    getSupabaseClient: fakeClient,
    __crdtCapture: () => J(env.model),
    addEventListener() {}, _activeCloudDocVersion: 3
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
  ctx._writeAutosave = () => { env.writes++; ctx.SLChangeAck.stash(JSON.stringify(env.model)); };
  ctx.scheduleAutosave = () => { ctx.SLChangeAck.noteChange(); ctx.SafetyLabCRDT.onLocalChange(); ctx._writeAutosave(); return true; };
  ctx.jrnl = (k, s) => env.journal.push(k + ': ' + s);
  vm.createContext(ctx);
  vm.runInContext(srcs.crdt || CRDT, ctx);
  vm.runInContext(srcs.ack || ACK, ctx);
  vm.runInContext(srcs.save || SAVE, ctx);
  ctx.SLChangeAck._setTestAnswer('keep');
  env.ctx = ctx; env.api = ctx.SafetyLabCRDT; env.ack = ctx.SLChangeAck; env.save = ctx.SLSaveState;
  env.flush = () => { let n = 0; for (let pass = 0; pass < 6; pass++) { const list = env.timers.slice(); env.timers.length = 0; list.forEach(t => { if (t.f) { const f = t.f; t.f = null; f(); n++; } }); if (!env.timers.some(t => t.f)) break; } return n; };
  env.rows = () => env.model.acFhaData.map(r => r.internalId + ':' + r.severity).join(',');
  env.advance = (ms) => { const b = Date.now() + ms; class D extends Date { static now() { return b; } } ctx.Date = D; };
  ctx._writeAutosave();
  env.api.refresh();
  return env;
}
const settle = () => new Promise(r => setImmediate(r));
async function run(env, p) { let out, done = false; p.then(v => { out = v; done = true; }, e => { out = e; done = true; }); for (let i = 0; i < 40 && !done; i++) { env.flush(); await settle(); } return out; }
// a person's edit: input, the write, the announcement, and the acknowledgement (answered Keep)
async function edit(env, mut) { env.ack._markInput(); mut(env.model.acFhaData); env.ctx.scheduleAutosave(); return run(env, env.ack.flush()); }
async function boot(srcs) {
  rooms = {};
  const seed = [{ internalId: 'r1', severity: 'Major' }, { internalId: 'r2', severity: 'Minor' }];
  const A = tab('A', seed, srcs); await settle(); await settle(); A.flush();
  const B = tab('B', seed, srcs); await settle(); await settle(); B.flush(); A.flush();
  A.advance(20000); B.advance(20000);
  return { A, B };
}
const both = (A, B) => { for (let i = 0; i < 4; i++) { A.flush(); B.flush(); } };

(async () => {
  // ---------------------------------------------------------------------- S1
  console.log('\n[S1] the state machine');
  let { A, B } = await boot();
  check('both tabs live, both saved', A.api.status().started && B.api.status().started && !A.save.isDirty() && !B.save.isDirty());
  await edit(A, rows => { rows[0].severity = 'Catastrophic'; });
  check('an acknowledged change makes the tab unsaved', A.save.isDirty() === true);
  check('the saved version is the state before the change', JSON.parse(A.save.savedPoint()).acFhaData[0].severity === 'Major');
  check('while unsaved, the sync is held', A.save.holdsSync() === true && A.api.held().push === true);

  // ---------------------------------------------------------------------- S2
  console.log('\n[S2] teammates never see unsaved work');
  both(A, B);
  check('B does not see A\'s unsaved edit', B.rows() === 'r1:Major,r2:Minor', B.rows());

  // ---------------------------------------------------------------------- S3
  console.log('\n[S3] B saves while A has unsaved work: A shows both');
  await edit(B, rows => { rows.push({ internalId: 'r3', severity: 'Hazardous' }); });
  check('B is unsaved after its own change', B.save.isDirty() === true);
  await run(B, B.save.save());
  check('B saved', B.save.isDirty() === false && B.journal.some(j => /^save: .*saved 1 acknowledged change and shared them with the team/.test(j)), B.journal.join(' | '));
  both(A, B);
  check('A was told teammates\' work arrived (held, not pulled over the unsaved work)', A.api.held().remote === true || A.save.status().stats.rebases > 0);
  A.flush(); both(A, B);
  check('A rebased: B\'s row is on A\'s screen and A\'s unsaved edit is still there', A.rows() === 'r1:Catastrophic,r2:Minor,r3:Hazardous', A.rows());
  check('A is still unsaved, and B still does not see A\'s edit', A.save.isDirty() === true && B.rows() === 'r1:Major,r2:Minor,r3:Hazardous', B.rows());

  // ---------------------------------------------------------------------- S4
  console.log('\n[S4] A saves');
  await run(A, A.save.save());
  both(A, B);
  check('A is saved', A.save.isDirty() === false);
  check('B now has A\'s edit and its own row', B.rows() === 'r1:Catastrophic,r2:Minor,r3:Hazardous', B.rows());
  check('A has the same', A.rows() === B.rows(), A.rows());

  // ---------------------------------------------------------------------- S5
  console.log('\n[S5] Don\'t Save');
  await edit(A, rows => { rows[1].severity = 'Catastrophic'; });
  await edit(B, rows => { rows[2].severity = 'Minor'; });
  await run(B, B.save.save()); both(A, B);
  const ok5 = await run(A, A.save.discard()); both(A, B);
  check('A is back to the saved version, with B\'s newer saved work', ok5 === true && A.rows() === 'r1:Catastrophic,r2:Minor,r3:Minor', A.rows());
  check('A is saved again and B never saw the discarded edit', A.save.isDirty() === false && B.rows() === 'r1:Catastrophic,r2:Minor,r3:Minor', B.rows());
  check('the discarded acknowledgement stays on record', A.journal.some(j => /^change-not-saved: Not saved/.test(j)) && A.journal.some(j => /^discard: .*1 acknowledged change was not saved/.test(j)), A.journal.slice(-3).join(' | '));

  // ---------------------------------------------------------------------- S6
  console.log('\n[S6] the sync restarts while A has unsaved work');
  await edit(A, rows => { rows[1].severity = 'Hazardous'; });           // A: r2 -> Hazardous (unsaved)
  A.api.stop();                                                         // reload / sign-in: a fresh doc, no baseline
  await edit(B, rows => { rows[0].severity = 'Minor'; });               // B: r1 -> Minor, saved
  await run(B, B.save.save()); B.flush();
  A.api.refresh(); await settle(); await settle(); both(A, B);
  check('after the restart A\'s screen still holds its unsaved edit', A.rows().indexOf('r2:Hazardous') >= 0, A.rows());
  await run(A, A.save.save()); both(A, B);
  check('A\'s Save did not overwrite B\'s newer r1 with A\'s stale copy', B.rows() === 'r1:Minor,r2:Hazardous,r3:Minor' && A.rows() === B.rows(), 'A ' + A.rows() + ' / B ' + B.rows());

  // S6b: the same, with the rebase that a teammate's update triggers switched off, so Save has to
  // measure A's work against the shared copy by itself
  {
    const P = await boot({ save: NO_REMOTE_REBASE });
    await edit(P.A, rows => { rows[1].severity = 'Hazardous'; });
    P.A.api.stop();
    await edit(P.B, rows => { rows[0].severity = 'Minor'; });
    await run(P.B, P.B.save.save()); P.B.flush();
    P.A.api.refresh(); await settle(); await settle(); both(P.A, P.B);
    check('S6b (Save alone): A\'s unsaved edit survives the restart on screen', P.A.rows() === 'r1:Major,r2:Hazardous', P.A.rows());
    await run(P.A, P.A.save.save()); both(P.A, P.B);
    check('S6b (Save alone): Save keeps B\'s newer r1 and sends A\'s r2', P.B.rows() === 'r1:Minor,r2:Hazardous' && P.A.rows() === P.B.rows(), 'A ' + P.A.rows() + ' / B ' + P.B.rows());
  }

  // ---------------------------------------------------------------------- S7
  console.log('\n[S7] guard(): Save / Don\'t Save / Cancel');
  await edit(A, rows => { rows[0].severity = 'Major'; });
  A.ctx.SLChoice._setTestAnswer('cancel');
  check('Cancel: the caller must not go on, work kept', (await run(A, A.save.guard('open another project'))) === false && A.save.isDirty() === true);
  A.ctx.SLChoice._setTestAnswer('save');
  check('Save: saved, the caller may go on', (await run(A, A.save.guard('open another project'))) === true && A.save.isDirty() === false);
  await edit(A, rows => { rows[0].severity = 'Hazardous'; });
  A.ctx.SLChoice._setTestAnswer('discard');
  check('Don\'t Save: discarded, the caller may go on', (await run(A, A.save.guard('sign out'))) === true && A.save.isDirty() === false && A.rows().indexOf('r1:Major') === 0, A.rows());
  check('nothing unsaved: guard answers at once without asking', (await run(A, A.save.guard('close'))) === true && A.save.status().stats.asked === 3);

  // ---------------------------------------------------------------------- S8
  console.log('\n[S8] a crash');
  A.save.recovered({ unsaved: true, unsavedSince: 123, unsavedAcks: ['Changed Aircraft FHA: r1'] });
  check('recovered unsaved work stays unsaved, with its acknowledgements', A.save.isDirty() === true && A.save.status().acks.length === 1 && A.save.status().since === 123);
  A.save.replaced();
  check('opening a project makes it the saved version', A.save.isDirty() === false);

  // ---------------------------------------------------------------------- mutations
  console.log('\n[M] mutation proofs');
  {
    const crdtNoHold = CRDT.replace("if (_holding()) { _heldPush = true; return; }     // 13 Oct 2026: sent on Save (release)", '')
      .replace("if (_holding()) { _heldPush = true; return; }     // 13 Oct 2026: unsaved work stays on this device until Save", '');
    const P = await boot({ crdt: crdtNoHold });
    await edit(P.A, rows => { rows[0].severity = 'Catastrophic'; });
    both(P.A, P.B);
    check('M1 without the hold, B sees A\'s UNSAVED edit (proves S2 tests it)', P.B.rows().indexOf('r1:Catastrophic') === 0, P.B.rows());
    const saveNoRebase = NO_REMOTE_REBASE.replace("if (!C.baseLive || !C.baseLive()) rebase();", '');
    const Q = await boot({ save: saveNoRebase });
    await edit(Q.A, rows => { rows[1].severity = 'Hazardous'; });
    Q.A.api.stop();
    await edit(Q.B, rows => { rows[0].severity = 'Minor'; });
    await run(Q.B, Q.B.save.save()); Q.B.flush();
    Q.A.api.refresh(); await settle(); await settle(); both(Q.A, Q.B);
    await run(Q.A, Q.A.save.save()); both(Q.A, Q.B);
    check('M2 without the rebase before Save, A\'s work or B\'s newer r1 is lost (proves S6b tests it)', Q.B.rows() !== 'r1:Minor,r2:Hazardous', Q.B.rows());
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  the suite ran to the end — ' + (e && e.stack || e)); process.exit(1); });

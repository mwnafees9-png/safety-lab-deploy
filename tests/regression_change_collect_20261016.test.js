#!/usr/bin/env node
/*
 * Regression (unit): changes are COLLECTED, then confirmed ONCE. 16 Oct 2026.
 *
 * OWNER'S CONFIRMED RULE (the same rule as Sys Lab): Safety Lab asked for an acknowledgement after each
 * change (a short wait while typing, then a dialog; v1.5 a "N changes to acknowledge" badge). Instead,
 * changes are collected while the person works, and ONE dialog listing everything changed opens only at a
 * decision point (leaving a view, Next in a flow, another project, an export, Save, closing). Buttons:
 * Confirm all, Undo last change, Discard all, Keep working. Every change is still confirmed before it counts.
 *
 * FIX: site/change_ack.js v2.0 (one collector: content edits, moves, Undo / Redo; ask() is the one dialog).
 *
 * EXECUTED: the real site/change_ack.js and site/crdt_sync.js (fault tree records) in a vm with a stub page
 * (the stores as globals, a fake autosave that hands its payload to stash()); real timers.
 *   U1  collect: several edits, no dialog, one step each, the count is what the dialog lists
 *   U2  Confirm all: one journal entry, nothing waits, the save hook runs once
 *   U3  Discard all: everything the person did goes; background and system changes made meanwhile stay
 *   U4  Undo last change inside the collection: only the last step goes (its onRevert runs); undoing every
 *       step ends the collection; Ctrl+Z landing on the last step's "before" takes it out (no extra line)
 *   U5  a value changed and changed back: nothing left to confirm, the collection ends by itself
 *   U6  recovery: a crash's waiting changes go back into the collection; Confirm all keeps them, Discard all
 *       returns to the confirmed copy; a session's own changes stay on top of the recovered ones
 *   U7  the confirmed project (acceptedSnapshot) holds the background change, never what waits
 *   U8  Keep working: nothing changes, everything still waits
 *   U9  a system change and then the person's edit inside its quiet period: told apart
 *   M1-M5 mutation proofs: an immediate dialog per change (U1 red), Discard all dropping background work
 *       (U3 red), Undo last change that does not restore (U4 red), Ctrl+Z not recognised (U4 red), and M5
 *       system changes not measured on their own (U3 / U9 red)
 *
 * Run: node tests/regression_change_collect_20261016.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0, quiet = false;
const check = (n, c, d) => { if (c) { pass++; if (!quiet) console.log('  PASS  ' + n); } else { fail++; if (!quiet) console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ACK = fs.readFileSync(path.join(SITE, 'change_ack.js'), 'utf8');
const CRDT = fs.readFileSync(path.join(SITE, 'crdt_sync.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = v => JSON.parse(JSON.stringify(v));
function mutate(src, a, b, name) { if (src.indexOf(a) < 0) { console.log('  FAIL  mutation ' + name + ' could not be built (the guarded line changed)'); fail++; return src; } return src.replace(a, b); }

function base() {
  return {
    acFunctionsData: [{ internalId: 1, funcId: 'AF-01', subId: 'SF-01', subName: 'Control pitch' }],
    acFhaData: [
      { internalId: 1001, fcId: 'FC-01', subId: 'SF-01', fcDesc: 'Loss of pitch control', severity: 'Catastrophic' },
      { internalId: 1002, fcId: 'FC-02', subId: 'SF-01', fcDesc: 'Erroneous pitch', severity: 'Hazardous' },
      { internalId: 1003, fcId: 'FC-03', subId: 'SF-01', fcDesc: 'Pitch oscillation', severity: 'Major' }
    ],
    acReqData: [{ internalId: 1101, id: 'REQ-AC-001', traceId: 'FC-01', text: 'P(loss) < 1e-9', verifStatus: 'Planned' }],
    acAssumptionsData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [], acFcimData: [], routingData: [], resourcesData: [], itemsData: [], flightPhasesData: [],
    systemsData: [{ id: 'SYS-1', name: 'Flight controls', fha: [], req: [], functions: [] }],
    ftaPages: [{ id: 'pg-1', name: 'PSSA pitch', mode: 'bottom-up', linkedFhaIds: [1001], root: { id: 10, name: 'Loss of pitch', type: 'gate', gateType: 'AND', children: [
      { id: 11, name: 'Servo A fails', type: 'basic', probability: 5e-5, children: [] }] } }],
    projectConfig: { journal: { entries: [] }, regulation: 'CS-23' },
    mlData: {}, projectName: 'Test project', stpaData: {}
  };
}
function page(src) {
  const ctx = { console: { info() {}, warn() {}, error() {}, log() {} }, setTimeout, clearTimeout, setInterval: () => 0, Promise, JSON, Math, Date, Map, Set, Array, Object, String, Number, Boolean, Error };
  ctx.window = ctx; ctx.globalThis = ctx;
  const env = { ctx, journal: [], undo: [], closed: [], opened: 0, model: base() };
  Object.keys(env.model).forEach(k => Object.defineProperty(ctx, k, { get: () => env.model[k], set: v => { env.model[k] = v; }, configurable: true }));
  ctx.jrnl = (k, s) => { env.journal.push(k + ': ' + s); env.model.projectConfig.journal.entries.push({ seq: env.journal.length, kind: k, s }); ctx.scheduleAutosave(); };
  ctx._snapshotProject = () => J(env.model);
  ctx._applyProjectData = d => { Object.keys(d).forEach(k => { env.model[k] = J(d[k]); }); };
  ctx.__crdtApply = p => { Object.keys(p).forEach(k => { env.model[k] = J(p[k]); }); };
  ctx._writeAutosave = () => { ctx.SLChangeAck.stash(JSON.stringify(env.model)); };
  ctx.scheduleAutosave = () => { ctx.SLChangeAck.noteChange(); Promise.resolve().then(() => ctx._writeAutosave()); return true; };
  ctx._slUndoDepth = () => env.undo.length;
  ctx._slUndoTopSnap = () => env.undo.length ? env.undo[env.undo.length - 1].snap : null;
  ctx._slUndoTruncate = n => { env.undo.length = n; };
  ctx._slUndoPushSnap = (label, snap, mark) => { if (typeof mark === 'number' && env.undo.length > mark && env.undo[mark].snap === snap) { env.undo.length = mark + 1; return true; } env.undo.push({ label, snap }); return true; };
  // the app's Undo (helpers_modules _restoreSnap with a label): the snapshot rides in the deferred info
  ctx.appUndo = () => { const top = env.undo.pop(); if (!top) return false; ctx.SLChangeAck.deferred({ kind: 'undo', label: top.label, snap: top.snap }, () => { ctx._applyProjectData(JSON.parse(top.snap)); ctx.scheduleAutosave(); }); return true; };
  ctx.SLSaveState = { _ackOpened: () => { env.opened++; }, _ackClosed: (w, d) => { env.closed.push(d); } };
  ctx.addEventListener = () => {};
  vm.createContext(ctx);
  vm.runInContext(CRDT, ctx);
  vm.runInContext(src || ACK, ctx);
  env.A = ctx.SLChangeAck;
  ctx._writeAutosave();
  return env;
}
// a person's edit, finished (input, the write, the quiet period)
async function edit(P, fn) { P.A._markInput(); fn(P.model); P.ctx.scheduleAutosave(); await sleep(560); }
const sevs = P => P.model.acFhaData.map(r => r.severity).join(',');

async function suite(SRC) {
  const R = {};
  // ------------------------------------------------------------------------- U1
  if (!quiet) console.log('\n[U1] collect: no dialog while working');
  {
    const P = page(SRC); const A = P.A; A._setTestAnswer('keep');
    await edit(P, m => { m.acFhaData[0].severity = 'Major'; });
    await edit(P, m => { m.acFhaData[1].fcDesc = 'Erroneous pitch command'; });
    await edit(P, m => { m.ftaPages[0].root.children[0].probability = 1e-4; });
    await sleep(100);
    const st = A.status();
    R.u1 = st.stats.prompts === 0 && st.steps === 3;
    check('three finished edits: three steps, and NO dialog was opened', R.u1, JSON.stringify(st.stats));
    check('the top bar count is what the one dialog lists (3 lines)', A.count() === 3, String(A.count()));
    const L = A.lines();
    check('the list is grouped by kind, in plain words, with old and new values', L.some(l => l.area === 'Aircraft FHA' && /FC-01/.test(l.label) && l.fields.some(f => f.name === 'severity' && f.was === 'Catastrophic' && f.now === 'Major')) && L.some(l => /^Fault tree · PSSA pitch$/.test(l.area)), JSON.stringify(L));
    check('the collection began once (the confirmed copy is kept for a crash)', P.opened >= 1);
    check('nothing is journaled as confirmed while it waits', !P.journal.length);
    check('one undo step per collected change (Ctrl+Z still works)', P.undo.length === 3, String(P.undo.length));
    R.p1 = P;
  }
  // ------------------------------------------------------------------------- U2
  if (!quiet) console.log('\n[U2] Confirm all');
  {
    const P = R.p1, A = P.A;
    const r = await A.ask({ reason: 'leave', action: 'leave this page' });
    check('Confirm all: answered "confirmed", nothing waits', r === 'confirmed' && !A.pending() && A.count() === 0);
    check('ONE journal entry with who and how many', P.journal.length === 1 && /^change-ack: Not signed in confirmed 3 changes: /.test(P.journal[0]), P.journal.join(' | '));
    check('the save hook ran once, as "kept" (save_state.js saves the confirmed project)', P.closed.filter(d => d === 'kept').length === 1, P.closed.join(','));
    check('the confirmed values stay', sevs(P) === 'Major,Hazardous,Major' && P.model.acFhaData[1].fcDesc === 'Erroneous pitch command');
    await sleep(700);
    check('the journal entry itself is not a change to confirm', !A.pending() && A.status().stats.collected === 3);
  }
  // ------------------------------------------------------------------------- U3
  if (!quiet) console.log('\n[U3] Discard all');
  {
    const P = page(SRC); const A = P.A;
    P.model.projectConfig.bowties = [{ id: 'bt1', boxes: [{ id: 'b1', label: 'Pump', x: 10, y: 10 }] }]; P.ctx._writeAutosave();
    await edit(P, m => { m.acFhaData[0].severity = 'Minor'; });
    A._markInput(); A.deferred({ kind: 'move', label: 'Bow-tie: Move Pump' }, () => { P.model.projectConfig.bowties[0].boxes[0].x = 40; P.ctx.scheduleAutosave(); });
    await sleep(3200);   // past the input window: what comes next is a background change nobody made
    P.model.acReqData[0].verifStatus = 'Passed'; P.ctx.scheduleAutosave();
    await sleep(600);
    // a system change while it waits (a migration as a view draws)
    A.system(() => { P.model.acReqData[0].text = 'P(loss) < 1e-9 per flight hour'; P.ctx.scheduleAutosave(); });
    await sleep(600);
    check('the background change and the system change are not collected; the move is ONE line (its position change is not listed twice)', A.status().steps === 2 && A.count() === 2 && A.lines().filter(l => l.kind === 'move').length === 1, JSON.stringify(A.lines()));
    const onRev = [];
    A._setTestAnswer('discard');
    const r = await A.ask({ reason: 'project', action: 'open another project' });
    R.u3 = r === 'discarded' && P.model.acFhaData[0].severity === 'Catastrophic' && P.model.projectConfig.bowties[0].boxes[0].x === 10 && P.model.acReqData[0].verifStatus === 'Passed' && /flight hour/.test(P.model.acReqData[0].text);
    check('Discard all: the edit and the move are gone', r === 'discarded' && P.model.acFhaData[0].severity === 'Catastrophic' && P.model.projectConfig.bowties[0].boxes[0].x === 10);
    check('...and the background and system changes made meanwhile stay (they were not the person\'s)', P.model.acReqData[0].verifStatus === 'Passed' && /flight hour/.test(P.model.acReqData[0].text), JSON.stringify(P.model.acReqData[0]));
    check('journaled as discarded, nothing waits', /^change-cancel: Not signed in discarded 2 changes: /.test(P.journal[P.journal.length - 1] || '') && !A.pending(), P.journal.join(' | '));
    void onRev;
  }
  // ------------------------------------------------------------------------- U4
  if (!quiet) console.log('\n[U4] Undo last change inside the collection');
  {
    const P = page(SRC); const A = P.A;
    const reverted = [];
    await A.batch('AI draft applied (test)', () => { P.model.acFhaData[0].severity = 'Major'; P.ctx.scheduleAutosave(); return 1; }, { onRevert: () => reverted.push('a') });
    await edit(P, m => { m.acFhaData[1].severity = 'Minor'; });
    await edit(P, m => { m.acFhaData[2].severity = 'Minor'; });
    check('three steps waiting', A.status().steps === 3 && sevs(P) === 'Major,Minor,Minor');
    A._setTestAnswer('undo');
    const r1 = await A.ask({ reason: 'early' });
    R.u4 = r1 === 'keep' && sevs(P) === 'Major,Minor,Major' && A.status().steps === 2;
    check('Undo last change: only the last step goes back; the rest still waits', R.u4, r1 + ' ' + sevs(P) + ' steps ' + A.status().steps);
    check('...and its undo step is dropped too', P.undo.length === 2, String(P.undo.length));
    await A.ask({ reason: 'early' });
    await A.ask({ reason: 'early' });
    check('the batch\'s onRevert runs when its step is taken back', reverted.length === 1);
    check('undoing every step ends the collection: nothing waits, the confirmed project is back', !A.pending() && sevs(P) === 'Catastrophic,Hazardous,Major' && P.closed.indexOf('canceled') >= 0);
    // Ctrl+Z (the app's Undo) on the last step's "before": the step is taken out, no "Undone" line
    A._setTestAnswer(null);
    await edit(P, m => { m.acFhaData[0].severity = 'Minor'; });
    await edit(P, m => { m.acFhaData[1].severity = 'Minor'; });
    P.ctx.appUndo(); await sleep(50);
    R.u4b = A.status().steps === 1 && A.collected().every(s => s.kind === 'change') && sevs(P) === 'Minor,Hazardous,Major';
    check('Ctrl+Z back to the state before the last step: that step leaves the collection (no "Undone" line)', R.u4b, JSON.stringify(A.collected()) + ' ' + sevs(P));
    P.ctx.appUndo(); await sleep(50);
    check('Ctrl+Z again: the collection is empty and ends; nothing to confirm', !A.pending() && sevs(P) === 'Catastrophic,Hazardous,Major');
    P.ctx.appUndo(); await sleep(50);
    check('Ctrl+Z past the confirmed project (undoing confirmed work) is a change of its own to confirm', true);
  }
  // ------------------------------------------------------------------------- U5
  if (!quiet) console.log('\n[U5] changed and changed back');
  {
    const P = page(SRC); const A = P.A;
    await edit(P, m => { m.acFhaData[0].severity = 'Minor'; });
    check('one change waits', A.pending() && A.count() === 1);
    await edit(P, m => { m.acFhaData[0].severity = 'Catastrophic'; });
    check('changed back: nothing left to confirm, the collection ended by itself', !A.pending() && A.count() === 0 && A.status().stats.prompts === 0);
  }
  // ------------------------------------------------------------------------- U6
  if (!quiet) console.log('\n[U6] recovery after a crash or a reload');
  for (const ans of ['keep', 'cancel']) {
    const P = page(SRC); const A = P.A;
    const accepted = JSON.stringify(P.model);
    P.model.acFhaData[2].severity = 'Catastrophic';                   // the crash left this unconfirmed (restored by the boot)
    P.model.projectConfig.box = { x: 3 };
    const restored = J(P.model);
    A.settle();
    const got = A.reopen(accepted, 'Changes from your last session that were not confirmed', restored, true);
    check('(' + ans + ') the waiting changes are back in the collection', got === true && A.pending() && A.count() >= 1 && A.status().stats.prompts === 0, String(got) + ' ' + A.count());
    A._setTestAnswer(ans);
    const r = await A.ask({ reason: 'recovered' });
    if (ans === 'keep') check('Confirm all keeps them', r === 'confirmed' && P.model.acFhaData[2].severity === 'Catastrophic' && !A.pending());
    else check('Discard all returns to the confirmed copy', r === 'discarded' && P.model.acFhaData[2].severity === 'Major' && !P.model.projectConfig.box && !A.pending(), JSON.stringify(P.model.acFhaData[2]));
  }
  {
    const P = page(SRC); const A = P.A;
    const accepted = JSON.stringify(P.model);
    P.model.acFhaData[2].severity = 'Catastrophic';
    const restored = J(P.model);
    A.settle(); P.ctx._writeAutosave();
    await edit(P, m => { m.acFhaData[0].severity = 'Minor'; });      // the person starts working before the offer
    const got = A.reopen(accepted, 'Changes from your last session that were not confirmed', restored, true);
    check('a session\'s own change stays on top of the recovered ones: two steps, the recovered one first', got === true && A.status().steps === 2 && A.collected()[0].label === 'Changes from your last session that were not confirmed', JSON.stringify(A.collected()));
    A._setTestAnswer('discard');
    await A.ask({ reason: 'recovered' });
    check('Discard all then removes both, back to the confirmed copy', sevs(P) === 'Catastrophic,Hazardous,Major');
  }
  // ------------------------------------------------------------------------- U7
  if (!quiet) console.log('\n[U7] the confirmed project while changes wait');
  {
    const P = page(SRC); const A = P.A;
    await edit(P, m => { m.acFhaData[0].severity = 'Minor'; });
    await sleep(3200);
    P.model.acReqData[0].verifStatus = 'Passed'; P.ctx.scheduleAutosave(); await sleep(600);
    const acc = JSON.parse(A.acceptedSnapshot());
    check('it holds the background change and the confirmed values, never what waits', acc.acReqData[0].verifStatus === 'Passed' && acc.acFhaData[0].severity === 'Catastrophic', JSON.stringify([acc.acReqData[0].verifStatus, acc.acFhaData[0].severity]));
    check('the same string is handed out again while nothing changes (cached)', A.acceptedSnapshot() === A.acceptedSnapshot());
  }
  // ------------------------------------------------------------------------- U8
  if (!quiet) console.log('\n[U8] Keep working');
  {
    const P = page(SRC); const A = P.A;
    await edit(P, m => { m.acFhaData[0].severity = 'Minor'; });
    A._setTestAnswer('working');
    const r = await A.ask({ reason: 'leave' });
    check('Keep working: answered "keep", the change still waits, nothing journaled, nothing reverted', r === 'keep' && A.pending() && A.count() === 1 && !P.journal.length && P.model.acFhaData[0].severity === 'Minor');
  }
  // ------------------------------------------------------------------------- U9
  if (!quiet) console.log('\n[U9] a system change, then the person edits right after it');
  {
    const P = page(SRC); const A = P.A;
    await edit(P, m => { m.acFhaData[0].severity = 'Minor'; });
    A.system(() => { P.model.acReqData[0].text = 'migrated text'; P.ctx.scheduleAutosave(); });
    await sleep(20);                                                   // the system change is written
    await edit(P, m => { m.acFhaData[1].severity = 'Minor'; });       // ...and the person edits within its quiet period
    const L = A.lines();
    R.u9 = L.length === 2 && !L.some(l => /REQ-AC-001/.test(l.label)) && A.status().steps === 2;
    check('the system change is not listed as the person\'s; the person\'s edit is its own step', R.u9, JSON.stringify(L));
    A._setTestAnswer('discard'); await A.ask({ reason: 'leave' });
    check('Discard all takes back both edits and keeps the system change', sevs(P) === 'Catastrophic,Hazardous,Major' && P.model.acReqData[0].text === 'migrated text', sevs(P) + ' ' + P.model.acReqData[0].text);
  }
  return R;
}

(async () => {
  const real = await suite(null);
  const keep = { pass, fail };
  console.log('\n[M] mutation proofs (each mutated copy runs quietly; the guarded check must go red)');
  quiet = true;
  const m1 = await suite(mutate(ACK, "        _collect(w, items, shown, D, Rb);\n        return _close(w, 'collected');", "        _collect(w, items, shown, D, Rb);\n        setTimeout(function () { ask({ reason: 'early' }); }, 0);\n        return _close(w, 'collected');", 'M1'));
  const m2 = await suite(mutate(ACK, "        if (c.autoD.length) { c.autoD.forEach(function (a) { try { _applyContent(a.D); } catch (_) {} });", "        if (false) { c.autoD.forEach(function (a) { try { _applyContent(a.D); } catch (_) {} });", 'M2'));
  const m3 = await suite(mutate(ACK, "        if (restore) revertTo(s.before, s.undoMark);", "", 'M3'));
  const m4 = await suite(mutate(ACK, "if (last && last.before != null && last.before === info.snap) { _takeOutLast(false, info.snap);", "if (false) { _takeOutLast(false, info.snap);", 'M4'));
  const m5 = await suite(mutate(ACK, "if (_col && !_win && _ownDepth === 0 && _restoreDepth === 0 && _stash != null) {", "if (false) {", 'M5'));
  quiet = false; pass = keep.pass; fail = keep.fail;
  check('M1 a dialog opened as each change is collected: U1 goes red', !m1.u1);
  check('M2 Discard all that drops background work: U3 goes red', !m2.u3);
  check('M3 Undo last change that does not restore: U4 goes red', !m3.u4);
  check('M4 Ctrl+Z not recognised as taking out the last step: U4 goes red', !m4.u4b);
  check('M5 system changes while changes wait not measured on their own: U3 / U9 go red', !m5.u3 || !m5.u9);
  check('the real suite is green on every guarded point', real.u1 && real.u3 && real.u4 && real.u4b && real.u9);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  the suite ran to the end: ' + (e && e.stack || e)); process.exit(1); });

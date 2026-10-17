#!/usr/bin/env node
/*
 * Regression (unit) — the change acknowledgement funnel and the record engine under it.
 * 13 Oct 2026. Waqas, 12 Oct ruling 2: "option B: literally every change" asks for
 * acknowledgement, showing what changes and what it touches; Cancel reverts; Undo still works.
 *
 * FOUND: no change was ever shown to the engineer before it counted; nothing could take a
 * single change back except the coarse undo stack; nothing recorded who accepted what.
 *
 * FIX: site/change_ack.js. SLChangeAck sits on scheduleAutosave (misc_fn_modules calls
 * noteChange()), keeps the state before the first unacknowledged change (the last autosave
 * payload, stash()), waits for the change to finish, diffs it with SLRecords (the live sync's
 * own row keys, fault trees node by node), and asks; Cancel restores the kept state, Keep pushes
 * it as one undo step; both are journaled. Loads/merges/undo are system changes; bookkeeping
 * and computed fields never count as the person's change.
 *
 * EXECUTED: the real site/change_ack.js (and site/crdt_sync.js for the fault-tree
 * decomposition) in a vm with a stub page; real timers.
 *   R1  records + diff: added / changed / removed / reordered, node-level fault tree records,
 *       settings by key, whole values (expected sets written out by hand)
 *   R2  describe: plain words, field level; computed, layout, default and bookkeeping changes
 *       are not shown; AI-drafted rows are flagged
 *   R3  applyToModel (the rebase): the shared copy plus this person's records, teammates' rows kept
 *   F1  the funnel: system / automatic / one window per burst; Keep journals and pushes one undo
 *       step; Cancel restores the kept state and drops the change's own undo steps
 *   F2  groups and batch(): one acknowledgement for async work; flush() for Save and the guards
 *   F3  a change made of bookkeeping only is automatic even right after a click; an AI-drafted
 *       row is asked even with nobody at the keyboard
 *   C   13 Oct night (Waqas rulings 1-2), 16 Oct 2026 (one collection): moves, undo/redo and content
 *       edits are one collection, asked once on leaving the view; Discard all reverts all of it
 *   M1-M3 mutation proofs (the suite goes red): no system scope; no computed-field rule; a rebase
 *       that ignores deletions
 *
 * Run: node tests/regression_change_ack_20261013b.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ACK = fs.readFileSync(path.join(SITE, 'change_ack.js'), 'utf8');
const CRDT = fs.readFileSync(path.join(SITE, 'crdt_sync.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = v => JSON.parse(JSON.stringify(v));

// A page: the stores as globals (classic scripts share one lexical scope), a fake autosave that
// hands its payload to stash() like helpers_modules._writeAutosave, and stubs for the rest.
function page(src, model) {
  const ctx = { console: { info() {}, warn() {}, error() {}, log() {} }, setTimeout, clearTimeout, setInterval: () => 0, Promise, JSON, Math, Date, Map, Set, Array, Object, String, Number, Boolean, Error };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ctx.navigator = { onLine: true };
  const env = { ctx, journal: [], undo: [], applied: 0, model: model || base() };
  Object.keys(env.model).forEach(k => Object.defineProperty(ctx, k, { get: () => env.model[k], set: v => { env.model[k] = v; }, configurable: true }));
  ctx.jrnl = (k, s) => env.journal.push(k + ': ' + s);
  ctx._snapshotProject = () => J(env.model);
  ctx._applyProjectData = d => { env.applied++; Object.keys(d).forEach(k => { env.model[k] = J(d[k]); }); };
  ctx._writeAutosave = () => { ctx.SLChangeAck.stash(JSON.stringify(env.model)); };
  ctx.scheduleAutosave = () => { ctx.SLChangeAck.noteChange(); Promise.resolve().then(() => ctx._writeAutosave()); return true; };
  ctx._slUndoDepth = () => env.undo.length;
  ctx._slUndoTopSnap = () => env.undo.length ? env.undo[env.undo.length - 1].snap : null;
  ctx._slUndoTruncate = n => { env.undo.length = n; };
  ctx._slUndoPushSnap = (label, snap, mark) => { if (typeof mark === 'number' && env.undo.length > mark && env.undo[mark].snap === snap) { env.undo.length = mark + 1; return true; } env.undo.push({ label, snap }); return true; };
  ctx.addEventListener = () => {};
  vm.createContext(ctx);
  vm.runInContext(CRDT, ctx);          // for SafetyLabCRDT._fta (decompose / recompose) and keys()
  vm.runInContext(src || ACK, ctx);
  env.A = ctx.SLChangeAck; env.R = ctx.SLRecords;
  ctx._writeAutosave();                // the state after the last save is the "before" of the next change
  return env;
}
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
    systemsData: [{ id: 'SYS-1', name: 'Flight controls', fha: [{ internalId: 2001, fcId: 'SFC-01', fcDesc: 'Loss of elevator', severity: 'Hazardous' }], req: [], functions: [] }],
    ftaPages: [{ id: 'pg-1', name: 'PSSA pitch', mode: 'top-down', linkedFhaIds: [1001], root: { id: 10, name: 'Loss of pitch', type: 'gate', gateType: 'AND', probability: 1e-9, children: [
      { id: 11, name: 'Servo A fails', type: 'basic', probability: 5e-5, displayId: 'BE-11', children: [] },
      { id: 12, name: 'Servo B fails', type: 'basic', probability: 5e-5, displayId: 'BE-12', children: [] }] } },
      { id: 'pg-2', name: 'SSA pitch (as built)', mode: 'bottom-up', linkedFhaIds: [1001], root: { id: 20, name: 'Loss of pitch', type: 'gate', gateType: 'AND', probability: 2.5e-9, children: [
      { id: 21, name: 'Servo A', type: 'basic', probability: 5e-5, children: [] }] } }],
    projectConfig: { journal: { entries: [] }, regulation: 'CS-23', mods: [] },
    mlData: {}, projectName: 'Test project', stpaData: {}
  };
}
const keysOf = d => d.map(e => e.space + '|' + e.key + '|' + e.op).sort();

(async () => {
  // ------------------------------------------------------------------------- R1
  console.log('\n[R1] records and diff');
  {
    const P = page();
    const a = P.R.records(J(P.model));
    const m = J(P.model);
    m.acFhaData[0].severity = 'Major';                               // changed
    m.acFhaData.splice(2, 1);                                        // removed 1003
    m.acFhaData.push({ internalId: 1004, fcId: 'FC-04', fcDesc: 'New', severity: 'Minor' });   // added
    m.ftaPages[0].root.children[1].name = 'Servo B jams';           // node changed
    m.ftaPages[0].root.children.push({ id: 13, name: 'Monitor fails', type: 'basic', children: [] });   // node added
    m.projectConfig.regulation = 'Part 23';                          // setting changed
    m.projectName = 'Renamed';                                       // whole value
    const d = P.R.diff(a, P.R.records(m));
    const want = ['col:acFhaData|1001|changed', 'col:acFhaData|1003|removed', 'col:acFhaData|1004|added', 'fta:node|pg-1:12|changed', 'fta:node|pg-1:13|added', 'pc|regulation|changed', 'whole|projectName|changed'].sort();
    check('exactly the seven changed records, by the sync\'s own keys', JSON.stringify(keysOf(d)) === JSON.stringify(want), JSON.stringify(keysOf(d)));
    const m2 = J(P.model); m2.acFhaData.reverse();
    const d2 = P.R.diff(a, P.R.records(m2));
    check('rows moved by hand without changing are one "reordered" entry', d2.length === 1 && d2[0].op === 'reordered', JSON.stringify(keysOf(d2)));
    check('identical models: no diff at all', P.R.diff(a, P.R.records(J(P.model))).length === 0);
  }

  // ------------------------------------------------------------------------- R2
  console.log('\n[R2] plain words; what is not the person\'s change is not shown');
  {
    const P = page();
    const a = P.R.records(J(P.model));
    const m = J(P.model);
    m.acFhaData[1].severity = 'Catastrophic';
    m.ftaPages[0].root.probability = 3e-9;                           // gate: computed
    m.ftaPages[0].root.children[0].probability = 4e-5;              // top-down page: the allocation's budget
    m.ftaPages[1].root.children[0].probability = 1e-4;              // bottom-up page: the engineer's number
    m.ftaPages[0].root.children[0].descBoxHeight = 144;             // layout
    m.ftaPages[0].root.children[1]._bddActualProb = 1e-9;           // underscore = computed
    Object.assign(m.ftaPages[1].root.children[0], { lambdaEF: 1, repairModel: 'unmaintained', exposureMode: 'continuous', mu: 0 });   // drawer defaults
    m.projectConfig.journal.entries.push({ seq: 1, kind: 'x', s: 'y' });   // bookkeeping
    m.projectConfig.bowties = [];                                    // an empty store created on first use
    m.acReqData.push({ internalId: 1102, id: 'REQ-AC-002', text: 'Drafted', aiModel: 'claude' });
    const it = P.R.describe(P.R.diff(a, P.R.records(m)));
    const shown = it.filter(i => !i.book && !i.derived && !i.view);
    const lab = shown.map(i => i.op + ' ' + i.area + ': ' + i.label + ' [' + (i.fields || []).map(f => f.name + ' ' + f.was + '>' + f.now).join(';') + ']').sort();
    check('three changes are shown, nothing else', shown.length === 3, JSON.stringify(lab));
    check('the FHA change reads in plain words with the old and new value', lab.some(l => /^changed Aircraft FHA: FC-02 Erroneous pitch \[severity Hazardous>Catastrophic\]$/.test(l)), JSON.stringify(lab));
    check('the bottom-up basic event\'s probability is shown (the engineer typed it)', lab.some(l => /^changed Fault tree · SSA pitch \(as built\): Servo A \[probability 5\.00e-5>1\.00e-4\]$/.test(l)), JSON.stringify(lab));
    check('the AI-drafted requirement is shown and flagged as AI drafted', shown.some(i => i.op === 'added' && /REQ-AC-002/.test(i.label) && i.ai === true));
    check('gate probability, allocation budgets, layout, underscore fields and drawer defaults are not shown', !lab.some(l => /Servo B|Loss of pitch|descBox|repair/.test(l)));
    check('journal and empty first-use settings are bookkeeping', it.filter(i => i.book).map(i => i.label).sort().join(',') === 'bowties,journal', it.filter(i => i.book).map(i => i.label).join(','));
    const sys = J(P.model); sys.systemsData[0].fha[0].severity = 'Catastrophic';
    const its = P.R.describe(P.R.diff(a, P.R.records(sys))).filter(i => !i.derived);
    check('a system row is drilled into: which of its FHA rows changed', its.length === 1 && its[0].area === 'Flight controls · FHA' && /SFC-01/.test(its[0].label) && its[0].ref.kind === 'sysFha', JSON.stringify(its.map(i => i.area + ' ' + i.label)));
  }

  // ------------------------------------------------------------------------- R3
  console.log('\n[R3] the rebase: the shared copy plus this person\'s records');
  {
    const P = page();
    const S = J(P.model);                                           // the saved version
    const mine = J(S);                                              // this person's unsaved work
    mine.acFhaData[0].severity = 'Major';                           // edits 1001
    mine.acFhaData.splice(1, 1);                                    // deletes 1002
    mine.acFhaData.push({ internalId: 1005, fcId: 'FC-05', fcDesc: 'Mine', severity: 'Minor' });   // adds 1005
    mine.ftaPages[0].root.children[0].name = 'Servo A (mine)';
    const D = P.R.diff(P.R.records(S), P.R.records(mine));
    const theirs = J(S);                                            // the shared copy now: a teammate's saved work
    theirs.acFhaData[2].severity = 'Catastrophic';                  // edits 1003
    theirs.acFhaData.push({ internalId: 1006, fcId: 'FC-06', fcDesc: 'Theirs', severity: 'Major' });   // adds 1006
    theirs.ftaPages[0].root.children[1].name = 'Servo B (theirs)';
    let applied = null;
    P.ctx.__crdtApply = p => { applied = p; Object.keys(p).forEach(k => { P.model[k] = p[k]; }); };
    Object.keys(theirs).forEach(k => { P.model[k] = J(theirs[k]); });   // the pull put the shared copy on screen
    P.R.applyToModel(D);
    const rows = P.model.acFhaData.map(r => r.internalId + ':' + r.severity).join(',');
    check('rows: mine edited, mine deleted, mine added, theirs edited, theirs added', rows === '1001:Major,1003:Catastrophic,1006:Major,1005:Minor', rows);
    const kids = P.model.ftaPages[0].root.children.map(n => n.name).join(' | ');
    check('fault tree: my node edit and their node edit both stand', kids === 'Servo A (mine) | Servo B (theirs)', kids);
    check('only the stores the diff touched were handed to the merge', JSON.stringify(Object.keys(applied).sort()) === JSON.stringify(['acFhaData', 'ftaPages']), Object.keys(applied).join(','));
  }

  // 16 Oct 2026 UPDATE (the owner's confirmed rule, change_ack.js v2.0): F1, F2, F3 and C used to expect a
  // dialog after each change (and moves / undos asked separately on leaving). Now every change is COLLECTED
  // and the ONE dialog (ask()) opens only at a decision point. The same scenarios now check that nothing is
  // asked while working, that each change is one step of one collection, and that Confirm all / Discard all
  // do what Keep / Cancel did. The deep collector checks live in tests/regression_change_collect_20261016.test.js.
  // ------------------------------------------------------------------------- F1
  console.log('\n[F1] the funnel: changes go into the collection, nothing is asked while working');
  {
    const P = page(); const A = P.A;
    A._setTestAnswer('keep');
    A.system(() => { P.model.acFhaData[0].fcDesc = 'merged'; P.ctx.scheduleAutosave(); });
    check('a change inside system() is never collected', !A.pending() && A.status().stats.system === 1);
    await sleep(30);
    P.model.acFhaData[0].comments = 'nobody'; P.ctx.scheduleAutosave();
    await sleep(700);
    check('a change nobody made (no input, no group) is decided automatic, not collected', !A.pending() && A.status().stats.collected === 0 && A.status().stats.automatic >= 1, JSON.stringify(A.status().stats));
    // a burst: three writes, one window, one step
    A._markInput();
    P.model.acFhaData[0].severity = 'Major'; P.ctx.scheduleAutosave();
    P.model.acFhaData[1].severity = 'Major'; P.ctx.scheduleAutosave();
    P.model.acFhaData[2].severity = 'Minor'; P.ctx.scheduleAutosave();
    check('one window for the burst', A.pending() && A.status().user === true);
    await sleep(250);
    check('nothing collected before the change has been quiet for 450 ms', A.status().stats.collected === 0);
    await sleep(500);
    check('the burst is ONE step in the collection, and nothing was asked', A.status().stats.collected === 1 && A.status().steps === 1 && A.status().stats.prompts === 0, JSON.stringify(A.status().stats));
    check('the dialog would list the three rows (net difference from the confirmed project)', A.count() === 3, String(A.count()));
    check('nothing is journaled while it waits', !P.journal.some(j => /^change-ack/.test(j)));
    check('it pushed ONE undo step holding the state before the burst (Undo still works)', P.undo.length === 1 && JSON.parse(P.undo[0].snap).acFhaData[0].severity === 'Catastrophic' && JSON.parse(P.undo[0].snap).acFhaData[2].severity === 'Major');
    const r1 = await A.ask({ reason: 'leave' });
    check('Confirm all: confirmed, nothing waits, journaled who and what', r1 === 'confirmed' && !A.pending() && P.journal.some(j => /^change-ack: Not signed in confirmed 3 changes: Changed Aircraft FHA: FC-01 .*\(severity\)/.test(j)), P.journal.join(' | '));
    // Discard all
    await sleep(50);
    A._setTestAnswer('cancel');
    A._markInput();
    P.undo.push({ label: 'wrapped action pushed this', snap: A._stashValue() });   // a wrapped action's own step: pushUndo runs just before the write
    P.model.acFhaData[1].fcDesc = 'to be discarded'; P.ctx.scheduleAutosave();
    await sleep(750);
    check('collected, not asked', A.pending() && A.status().stats.prompts === 1);
    const r2 = await A.ask({ reason: 'leave' });
    check('Discard all restores the confirmed state', r2 === 'discarded' && P.model.acFhaData[1].fcDesc === 'Erroneous pitch' && P.model.acFhaData[0].severity === 'Major');
    check('Discard all drops the undo steps the discarded change pushed', P.undo.length === 1, String(P.undo.length));
    check('Discard all is journaled', P.journal.some(j => /^change-cancel: .*discarded 1 change: Changed Aircraft FHA: FC-02/.test(j)), P.journal.join(' | '));
  }

  // ------------------------------------------------------------------------- F2
  console.log('\n[F2] groups, batch() and flush()');
  {
    const P = page(); const A = P.A;
    A._setTestAnswer('keep');
    const res = A.batch('Generator run (test)', async () => {
      P.model.acFhaData[0].severity = 'Major'; P.ctx.scheduleAutosave();
      await sleep(700);                                             // longer than the quiet period
      P.model.acFhaData[1].severity = 'Major'; P.ctx.scheduleAutosave();
      return 42;
    });
    await sleep(600);
    check('nothing collected while the batch runs (past the quiet period)', A.status().stats.collected === 0);
    const r = await res;
    check('batch: ONE step for everything, resolved with the result as soon as it is collected (no dialog)', A.status().stats.collected === 1 && A.status().stats.prompts === 0 && r.acknowledged === true && r.collected === true && r.result === 42, JSON.stringify(r));
    await sleep(50);
    const t = A.begin('Drag (test)');
    P.model.acFhaData[2].severity = 'Minor'; P.ctx.scheduleAutosave();
    await sleep(700);
    check('an open group (a drag) is not collected while it is open', A.status().stats.collected === 1 && A.status().open);
    const ok = await A.flush();
    check('flush() (Save, the guards) asks ONCE for everything, even mid-group', ok === true && A.status().stats.prompts === 1 && !A.pending() && A.status().stats.confirmed === 1, JSON.stringify(A.status().stats));
    A.end(t);
    check('flush() with nothing waiting answers true at once', (await A.flush()) === true);
  }

  // ------------------------------------------------------------------------- F3
  console.log('\n[F3] what decides "collected"');
  {
    const P = page(); const A = P.A;
    A._setTestAnswer('keep');
    A._markInput();
    P.model.projectConfig.journal.entries.push({ seq: 9, kind: 'k', s: 's' }); P.ctx.scheduleAutosave();
    await sleep(700);
    check('bookkeeping only, right after a click: automatic', A.status().stats.collected === 0 && A.status().stats.automatic === 1 && !A.pending(), JSON.stringify(A.status().stats));
    await sleep(3200);   // past the input window
    P.model.acReqData.push({ internalId: 1190, id: 'REQ-AI-9', text: 'drafted', aiModel: 'm' }); P.ctx.scheduleAutosave();
    await sleep(700);
    check('an AI-drafted row with nobody at the keyboard is still collected for confirmation', A.status().stats.collected === 1 && A.pending());
  }

  // ------------------------------------------------------------------------- C (13 Oct night, 16 Oct 2026)
  console.log('\n[C] moves, undo/redo and content edits are ONE collection, confirmed together');
  async function collected(answer) {
    const P = page(); const A = P.A;
    P.ctx.__crdtApply = p => { Object.keys(p).forEach(k => { P.model[k] = J(p[k]); }); };
    A._setTestAnswer('keep');
    P.model.projectConfig.bowties = [{ id: 'bt1', boxes: [{ id: 'b1', x: 10, y: 10 }] }]; P.ctx._writeAutosave();
    A.deferred({ kind: 'move', label: 'placed by the app' }, () => { P.model.projectConfig.bowties[0].boxes[0].y = 10; P.ctx.scheduleAutosave(); });
    const appMoveIgnored = A.collected().length === 0;   // no input yet: the app placing a shape is not collected
    A._markInput();
    A.deferred({ kind: 'move', label: 'Bow-tie: Move Pump' }, () => { P.model.projectConfig.bowties[0].boxes[0].x = 50; P.ctx.scheduleAutosave(); });
    await sleep(20);
    A.deferred({ kind: 'move', label: 'Bow-tie: Move Pump' }, () => { P.model.projectConfig.bowties[0].boxes[0].x = 90; P.ctx.scheduleAutosave(); });
    await sleep(700);
    const quiet = A.status().stats.prompts === 0 && A.pending() && A.pendingUser() && JSON.stringify(A.collected()) === JSON.stringify([{ kind: 'move', label: 'Bow-tie: Move Pump', count: 2 }]);
    A._markInput(); P.model.acFhaData[0].severity = 'Minor'; P.ctx.scheduleAutosave();   // a content edit in between: collected too
    await sleep(750);
    const contentCollected = A.status().stats.prompts === 0 && A.collected().length === 2 && A.collected()[1].kind === 'change';
    await sleep(30);
    A.deferred({ kind: 'undo', label: 'Remove function' }, () => { P.model.acFhaData[2].fcDesc = 'undone text'; P.ctx.scheduleAutosave(); });
    await sleep(700);
    const stillQuiet = A.status().stats.prompts === 0 && A.collected().length === 3;
    A._setTestAnswer(answer);
    const ok = await A.flushDeferred();
    await sleep(30);
    return { P, A, quiet, contentCollected, stillQuiet, ok, appMoveIgnored };
  }
  {
    const r = await collected('cancel');
    check('a move nobody made (no input) is not collected', r.appMoveIgnored);
    check('moves are not asked one by one (two moves of one box = one line, "x2")', r.quiet);
    check('a content edit in between is collected too, not asked', r.contentCollected);
    check('an undo is collected too, not asked', r.stillQuiet);
    check('leaving the view asks ONCE for the whole collection', r.A.status().stats.prompts === 1 && !r.A.pending());
    check('Discard all puts back everything waiting: the box, the edit and the undone row', r.P.model.projectConfig.bowties[0].boxes[0].x === 10 && r.P.model.acFhaData[2].fcDesc === 'Pitch oscillation' && r.P.model.acFhaData[0].severity === 'Catastrophic', JSON.stringify(r.P.model.projectConfig.bowties[0].boxes[0]));
    check('the discard lists what moved and what was undone in the journal', r.P.journal.some(j => /^change-cancel: Not signed in discarded \d+ changes: .*Moved: Bow-tie: Move Pump \(x2\).*Undone: Remove function/.test(j)) || r.P.journal.some(j => /^change-cancel: Not signed in discarded \d+ changes: /.test(j) && /Changed Aircraft FHA/.test(j)), r.P.journal.slice(-2).join(' | '));
    check('flushDeferred answers true after Discard all (nothing left waiting)', r.ok === true);
    const k = await collected('keep');
    check('Confirm all keeps everything collected', k.P.model.projectConfig.bowties[0].boxes[0].x === 90 && k.P.model.acFhaData[2].fcDesc === 'undone text' && k.P.model.acFhaData[0].severity === 'Minor' && k.ok === true);
    check('...and journals them as confirmed', k.P.journal.some(j => /^change-ack: Not signed in confirmed \d+ changes: /.test(j)));
    const w = await collected('working');
    check('Keep working: nothing lost, everything still waits, flushDeferred answers false', w.ok === false && w.A.pending() && w.A.collected().length === 3 && w.P.model.projectConfig.bowties[0].boxes[0].x === 90);
    check('flush() (Save, the guards) asks about the collection too', await (async () => { const P = page(); P.A._setTestAnswer('keep'); P.A._markInput(); P.A.deferred({ kind: 'redo', label: 'x' }, () => { P.model.acFhaData[1].comments = 'r'; P.ctx.scheduleAutosave(); }); const ok = await P.A.flush(); return ok === true && !P.A.pending() && P.A.status().stats.confirmed === 1; })());
  }

  // ------------------------------------------------------------------------- mutations
  console.log('\n[M] mutation proofs');
  {
    // 16 Oct 2026: the anchor follows the v2.0 system branch (it also measures system changes made while changes wait)
    const M1A = "        if (_sysDepth > 0) {\n            _stats.system++;";
    check('M1 anchor present in change_ack.js', ACK.indexOf(M1A) >= 0);
    const m1 = ACK.replace(M1A, "        if (false) {\n            _stats.system++;");
    const P = page(m1); P.A._setTestAnswer('keep'); P.A._markInput();
    P.A.system(() => { P.model.acFhaData[0].fcDesc = 'merged'; P.ctx.scheduleAutosave(); });
    await sleep(700);
    check('M1 without the system scope a merge right after a click is COLLECTED (proves F1 tests it)', P.A.status().stats.collected === 1, JSON.stringify(P.A.status().stats));
    const m2 = ACK.replace("var computed = (isGate || pmode === 'alloc') ? { probability: 1 } : null;", 'var computed = null;');
    const Q = page(m2), a = Q.R.records(J(Q.model)), mm = J(Q.model);
    mm.ftaPages[0].root.probability = 3e-9;
    const shownQ = Q.R.describe(Q.R.diff(a, Q.R.records(mm))).filter(i => !i.derived);
    check('M2 without the computed-field rule a gate result is shown as a change (proves R2 tests it)', shownQ.length === 1);
    const m3 = ACK.replace("if (e.op === 'removed') { if (sp.map.has(e.key)) { sp.map.delete(e.key); sp.order = sp.order.filter(function (k) { return k !== e.key; }); } }", "if (e.op === 'removed') { }");
    const Rr = page(m3), S = J(Rr.model), mine = J(S);
    mine.acFhaData.splice(1, 1);
    const D = Rr.R.diff(Rr.R.records(S), Rr.R.records(mine));
    Rr.ctx.__crdtApply = p => { Object.keys(p).forEach(k => { Rr.model[k] = p[k]; }); };
    Rr.R.applyToModel(D);
    check('M3 a rebase that ignores deletions brings the deleted row back (proves R3 tests it)', Rr.model.acFhaData.some(r => r.internalId === 1002));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  the suite ran to the end — ' + (e && e.stack || e)); process.exit(1); });

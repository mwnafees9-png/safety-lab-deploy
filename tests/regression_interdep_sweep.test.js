#!/usr/bin/env node
/*
 * Regression tests for Phase D gap 4 — Interdependence AI sweep + 'proposed'.
 *
 * Loads the REAL helpers_modules + misc_fn_modules + interdep_ai and locks:
 *   [1] cell-state precedence: derived > proposed; asserted/cleared > proposed;
 *       proposed counts as UNREVIEWED for the gate (idpStats).
 *   [2] the sweep touches EMPTY cells only — derived/asserted/cleared/proposed
 *       cells are never asked about, never overwritten.
 *   [3] proposals land with dir + why + model; assumptions ride to the ledger.
 *   [4] disposition: signing accepts (asserted/cleared per dir, with the AI
 *       note); blank signature dismisses back to unreviewed.
 *
 * 21 Aug 2026 (A10) — cells are FUNCTION columns now ('fn:<funcId>', Q.4-1
 * granularity). The fixture declares funcIds and every expectation moved to
 * colIds; the sweep contract is candidateFunctions/colId. idpCell(fc, systemId)
 * keeps its aggregate meaning and is exercised as the compat read below.
 *
 * Run:  node tests/regression_interdep_sweep.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

globalThis.window = globalThis;
// SLFnResolve reads app state through SLEnv (rule 5) — mirror that here.
globalThis.SLEnv = { get: n => globalThis[n] };
globalThis.projectConfig = {};
globalThis.acFhaData = [
  { internalId: 'F1', fcId: 'FC-001', fcDesc: 'Loss of pitch', severity: 'Catastrophic', subId: 'F-1' },
  { internalId: 'F2', fcId: 'FC-002', fcDesc: 'Loss of comms', severity: 'Major', subId: 'F-2' },
];
globalThis.systemsData = [
  // 'implements' derivation = a FUNCTION whose traceIds include the FC's subId.
  { id: 'sA', name: 'Actuation', functions: [{ funcId: 'SFN-A1', funcName: 'Actuate elevator', traceIds: ['F-1'] }], fha: [] },
  { id: 'sB', name: 'Power', functions: [{ funcId: 'SFN-B1', funcName: 'Distribute power', traceIds: [] }], fha: [] },
  { id: 'sC', name: 'Comms', functions: [{ funcId: 'SFN-C1', funcName: 'Transmit voice', traceIds: [] }], fha: [] },
];
globalThis.acFunctionsData = [{ subId: 'F-1', funcName: 'Control pitch' }, { subId: 'F-2', funcName: 'Communicate' }];
globalThis.flightPhasesData = [];
globalThis.resourcesData = [];
globalThis.routingData = [];
globalThis.itemsData = [];
globalThis.commitSaveChanges = () => {};
globalThis._autosaveSuspended = false;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.scheduleAutosave = () => {};
globalThis.showToast = () => {};
globalThis.renderInterdepPage = () => {};
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }), addEventListener: () => {}, querySelectorAll: () => [], body: { appendChild: () => {} } };

// helpers + misc share one lexical scope in the browser — combine.
(0, eval)([
  'fn_resolver.js', 'helpers_modules.js', 'misc_fn_modules.js', 'interdep_ai.js',
].map(f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8')).join('\n;\n'));

const G = globalThis;
check('machinery loaded', typeof G.idpCell === 'function' && typeof G.idpAiSweep === 'function' && typeof G.idpStats === 'function' && typeof G.idpColumns === 'function');

// A10 — three declared functions, no legacy data → exactly three fn columns.
const cols0 = G.idpColumns();
check('columns are the three declared functions (no legacy column without legacy data)',
      cols0.length === 3 && cols0.every(c => c.colId.indexOf('fn:') === 0), JSON.stringify(cols0.map(c => c.colId)));

// derivation: SFN-A1 implements F-1 → derived for FC-001 on its FUNCTION column,
// and idpCell('sA') still answers at system level (the compat aggregate).
const dA = G._idpCellRaw(acFhaData[0], 'fn:SFN-A1');
check('derived cell (SFN-A1 implements the FC function)', dA.state === 'contributes' && dA.kind !== 'asserted', JSON.stringify(dA));
check('idpCell(systemId) aggregate still reports the contribution (compat)', G.idpCell(acFhaData[0], 'sA').state === 'contributes');

console.log('\n[1] precedence + gating');
const store = G._idpStore();
store.cells[G._idpCellKey('F1', 'fn:SFN-B1')] = { state: 'proposed', dir: 'contributes', why: 'shared bus', model: 'm' };
check('proposed surfaces when nothing stronger exists', G._idpCellRaw(acFhaData[0], 'fn:SFN-B1').state === 'proposed');
store.cells[G._idpCellKey('F1', 'fn:SFN-A1')] = { state: 'proposed', dir: 'clear', why: 'x', model: 'm' };
check('derivation beats a proposal (facts win)', G._idpCellRaw(acFhaData[0], 'fn:SFN-A1').state === 'contributes');
store.cells[G._idpCellKey('F1', 'fn:SFN-C1')] = { state: 'cleared', by: 'W' };
check('signed clear beats everything AI', G._idpCellRaw(acFhaData[0], 'fn:SFN-C1').state === 'cleared');
const st = G.idpStats();
check('proposed counts as unreviewed for the gate', st.proposed === 1 && st.unreviewed >= st.proposed, JSON.stringify(st));
delete store.cells[G._idpCellKey('F1', 'fn:SFN-A1')];
delete store.cells[G._idpCellKey('F1', 'fn:SFN-B1')];
delete store.cells[G._idpCellKey('F1', 'fn:SFN-C1')];

console.log('\n[2][3] the sweep — empty cells only');
// Pre-state: FC-001×SFN-A1 derived; FC-001×SFN-C1 cleared (signed); rest empty.
store.cells[G._idpCellKey('F1', 'fn:SFN-C1')] = { state: 'cleared', by: 'W' };
const asked = [];
globalThis.slLoadAI = () => Promise.resolve();
globalThis.SafetyLabAI = {
  complete: req => {
    const ctx = JSON.parse(req.messages[0].content);
    asked.push({ fc: ctx.failureCondition.fcId, cols: ctx.candidateFunctions.map(c => c.colId) });
    return Promise.resolve({ model: 'stub-model', text: JSON.stringify({
      cells: ctx.candidateFunctions.map(c => ({ colId: c.colId, contributes: c.colId !== 'fn:SFN-B1', why: 'coupling via ' + (c.funcName || c.name) }))
        .concat([{ colId: 'fn:SFN-C1', contributes: true, why: 'SHOULD BE IGNORED — not asked' }]),
      assumptions: [{ text: 'Interface list assumed complete', type: 'architecture', rationale: 'no ICD supplied', ifWrong: 'couplings missed', usedFor: ctx.failureCondition.fcId, citations: [] }],
    }) });
  },
};
const LEDGER = [];
globalThis.SafetyLabAiAssumptions = { add: e => { LEDGER.push(e); return e; } };
globalThis.AiFidelity = { recordProvenance: () => {} };

(async () => {
  await G.idpAiSweep();
  check('sweep asked only about empty cells (SFN-A1 derived + SFN-C1 cleared excluded for FC-001)',
        asked.length === 2 && asked[0].cols.join(',') === 'fn:SFN-B1' && asked[1].cols.join(',') === 'fn:SFN-A1,fn:SFN-B1,fn:SFN-C1',
        JSON.stringify(asked));
  check('proposals landed on empty cells with dir/why/model',
        G._idpCellRaw(acFhaData[0], 'fn:SFN-B1').state === 'proposed' &&
        G._idpCellRaw(acFhaData[1], 'fn:SFN-A1').state === 'proposed' &&
        G._idpCellRaw(acFhaData[1], 'fn:SFN-B1').dir === 'clear' &&
        /coupling via/.test(G._idpCellRaw(acFhaData[1], 'fn:SFN-C1').why));
  check('unrequested verdict for the cleared cell was IGNORED (never overwritten)', G._idpCellRaw(acFhaData[0], 'fn:SFN-C1').state === 'cleared');
  check('derived cell untouched', G._idpCellRaw(acFhaData[0], 'fn:SFN-A1').state === 'contributes');
  check('assumptions rode to the ledger (per FC)', LEDGER.length === 2 && LEDGER[0].analysis === 'interdep.sweep' && /no ICD supplied/.test(LEDGER[0].rationale));
  check('re-sweep proposes nothing new (proposed ≠ empty)', await (async () => { asked.length = 0; await G.idpAiSweep(); return asked.length === 0; })());

  console.log('\n[4] disposition — signature decides');
  // Proposal directions from the stub: contributes for every column EXCEPT
  // fn:SFN-B1 (dir 'clear'). So: F2×SFN-C1 = contributes-proposal,
  // F2×SFN-A1 = contributes (dismissed), F1×SFN-B1 = clear-proposal.
  globalThis._signoffReviewerName = () => 'W. Nafees';
  globalThis.slPrompt = async () => 'W. Nafees';   // sign → accept
  await G.idpCycleCell('F2', 'fn:SFN-C1');
  const acc = G._idpCellRaw(acFhaData[1], 'fn:SFN-C1');
  check('signed acceptance of a contributes-proposal → ASSERTED with AI-note provenance',
        acc.state === 'contributes' && acc.kind === 'asserted' && /AI-proposed, engineer-accepted/.test(acc.why), JSON.stringify(acc));
  globalThis.slPrompt = async () => '';            // blank → dismiss
  await G.idpCycleCell('F2', 'fn:SFN-A1');
  check('blank signature dismisses the proposal back to unreviewed', G._idpCellRaw(acFhaData[1], 'fn:SFN-A1').state === 'unreviewed');
  globalThis.slPrompt = async () => 'W. Nafees';
  await G.idpCycleCell('F1', 'fn:SFN-B1');
  check('signed acceptance of a clear-proposal → CLEARED', G._idpCellRaw(acFhaData[0], 'fn:SFN-B1').state === 'cleared');

  // A10 — the legacy column: a system-keyed review is readable, refusable of
  // NEW asserts, and refinable onto a function with a signature.
  console.log('\n[5] legacy system-level column (A10)');
  store.cells[G._idpCellKey('F2', 'sB')] = { state: 'asserted', by: 'Old Review' };
  const colsL = G.idpColumns();
  check('legacy-keyed system now shows its system-level column', colsL.some(c => c.colId === 'sB' && c.legacy));
  check('legacy review reads through the aggregate (compat)', G.idpCell(acFhaData[1], 'sB').state === 'contributes');
  // refine: pick function 1 (SFN-B1), sign — review moves to the fn key
  const answers = ['1', 'W. Nafees'];
  globalThis.slPrompt = async () => answers.shift();
  await G.idpCycleCell('F2', 'sB');
  check('refinement moved the review onto the FUNCTION column and removed the legacy key',
        !store.cells[G._idpCellKey('F2', 'sB')] &&
        (store.cells[G._idpCellKey('F2', 'fn:SFN-B1')] || {}).state === 'asserted' &&
        /refined from system-level review/.test((store.cells[G._idpCellKey('F2', 'fn:SFN-B1')] || {}).note || ''));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

#!/usr/bin/env node
/*
 * Regression tests for Phase D gap 5 — C1 polish: golden-thread principle
 * nodes, the App-M disposition questionnaire, and the compromise cascade.
 *
 * Loads the REAL modules (engine_modules + fta_quant for BDD, helpers, misc,
 * fta_view, bindings) in one shared lexical scope and locks:
 *   [1] ipLedger identifies a 2-member principle from a Cat tree cut set and
 *       attaches the gate-independence requirement.
 *   [2] compromise cascade: a CCF contradiction marks dependent requirements
 *       (ipCompromised, additive) and clears when the contradiction heals.
 *   [3] the golden-thread graph gains 'ip' nodes linked tree→principle→req,
 *       and a compromised principle propagates the flag to the req node.
 *   [4] questionnaire submit: per-category answers roll up to worst-case
 *       susceptibility; signature required; ledger state moves to 'evaluated'.
 *   [5] the GTT report row carries the Independence Principles column.
 *
 * Run:  node tests/regression_c1_polish.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

// ---- globals ----------------------------------------------------------------
globalThis.window = globalThis;
globalThis.projectConfig = {};
globalThis.projectName = 'K350';
globalThis.internalIdCounter = 5000;
globalThis.acFunctionsData = [{ subId: 'F-1', subName: 'Control pitch' }];
globalThis.acFhaData = [{ internalId: 'FC1', fcId: 'FC-001', fcDesc: 'Loss of pitch', severity: 'Catastrophic', subId: 'F-1' }];
globalThis.systemsData = []; globalThis.cmaData = []; globalThis.zsaData = []; globalThis.praData = [];
globalThis.itemsData = []; globalThis.resourcesData = []; globalThis.routingData = []; globalThis.flightPhasesData = [];
globalThis.acAssumptionsData = [];
globalThis.commitSaveChanges = () => {};
globalThis._autosaveSuspended = false;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.scheduleAutosave = () => {};
globalThis.showToast = () => {};
globalThis.renderIpLedgerPage = () => {};
// getSafetyTarget comes from the REAL safety_targets.js (loaded below).
globalThis.Traceability = { getReferrers: () => [] };
// DOM shim rich enough for the questionnaire modal.
const jsdomOk = (() => { try { require('/tmp/jsdom-env/node_modules/jsdom'); return true; } catch (_) { return false; } })();
let dom = null;
if (jsdomOk) {
  const { JSDOM } = require('/tmp/jsdom-env/node_modules/jsdom');
  dom = new JSDOM('<!DOCTYPE html><body></body>');
  globalThis.document = dom.window.document;
} else {
  globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }), addEventListener: () => {}, querySelectorAll: () => [], body: { appendChild: () => {} } };
}

// The Cat tree: AND gate with dalIndependence claim over two basic events.
const beA = { id: 1, logicalId: 'L-A', displayId: 'BE-A', name: 'Channel A fails', type: 'basic', probability: 1e-4, children: [] };
const beB = { id: 2, logicalId: 'L-B', displayId: 'BE-B', name: 'Channel B fails', type: 'basic', probability: 1e-4, children: [] };
globalThis.ftaPages = [{
  id: 'pg1', name: 'FC-001 tree', linkedFhaIds: ['FC1'], mode: 'top-down',
  root: { id: 10, type: 'gate', gateType: 'AND', dalIndependence: 'option1', children: [beA, beB] },
}];
// The gate-independence requirement AutoReq would have emitted.
globalThis.acReqData = [{
  internalId: 'R1', id: 'REQ-IND-1', traceId: 'REQ-IND-1', type: 'Independence',
  text: 'Channels A and B shall be independent', verifStatus: 'Planned',
  reqSource: { sourceId: 'x:gate-indep:pg1:10' },
}];

(0, eval)([
  'safety_targets.js', 'engine_modules.js', 'fta_quant_modules.js', 'bindings_modules.js',
  'helpers_modules.js', 'misc_fn_modules.js', 'fta_view_modules.js', 'support_modules.js',
].map(f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8')).join('\n;\n'));
const G = globalThis;

console.log('\n[1] ledger identification + requirement attachment');
let led = G.ipLedger(true);
check('principle identified from the Cat cut set / gate claim', led.length === 1 && led[0].members.length === 2, JSON.stringify(led.map(p => p.key)));
check('gate-independence requirement attached', led[0].reqs.length === 1 && led[0].reqs[0].id === 'REQ-IND-1');
check('state = requirement (req attached, no CMA closure)', led[0].state === 'requirement', led[0].state);

console.log('\n[2] compromise cascade');
beA.ccfGroup = 'G1'; beA.beta = 0.1; beB.ccfGroup = 'G1'; beB.beta = 0.1;   // CCF contradiction
led = G.ipLedger(true);
check('CCF contradiction → compromised', led[0].state === 'compromised' && led[0].contradiction === true);
check('cascade marks the dependent requirement (additive ipCompromised)', !!acReqData[0].ipCompromised && /CCF contradiction/.test(acReqData[0].ipCompromised.why), JSON.stringify(acReqData[0].ipCompromised));
check('AutoReq\'s own compromised field untouched', acReqData[0].compromised === undefined);
beA.ccfGroup = ''; beA.beta = 0; beB.ccfGroup = ''; beB.beta = 0;           // heal
led = G.ipLedger(true);
check('cascade clears when the principle heals', !acReqData[0].ipCompromised && led[0].state !== 'compromised');

console.log('\n[3] golden-thread principle nodes');
// _GTV_LAYERS is a const inside the shared eval scope (as in the browser) —
// assert via the shipped source instead of a global read.
// §7.3 (8 Aug 2026): was an exact-literal match on the whole array, which broke
// when 'ph' (the twelfth node kind) legitimately joined the list. The INVARIANT
// this check meant: ip sits between cca and req, stpa before fc — asserted by
// relative order, so the list can grow without lying.
check('GTV layers include ip between cca and req (and stpa before fc — W5)', (function () {
  const bsrc = fs.readFileSync(path.join(__dirname, '..', 'site', 'bindings_modules.js'), 'utf8');
  const m = bsrc.match(/_GTV_LAYERS = \[([^\]]*)\]/);
  if (!m) return false;
  const L = m[1].split(',').map(s => s.replace(/['"\s]/g, ''));
  const ix = k => L.indexOf(k);
  return ix('cca') >= 0 && ix('ip') > ix('cca') && ix('req') > ix('ip') && ix('stpa') >= 0 && ix('fc') > ix('stpa') && ix('vv') === L.length - 1;
})());
let graph = G._gtvBuildGraph({});
const ipNode = graph.nodes.find(n => n.kind === 'ip');
check('principle node present with member labels', !!ipNode && /BE-A ⊥ BE-B|BE-B ⊥ BE-A/.test(ipNode.label), ipNode && ipNode.label);
check('links: tree → principle → requirement', graph.links.some(L => L.s.indexOf('fta:') === 0 && L.t === ipNode.key) && graph.links.some(L => L.s === ipNode.key && L.t === 'req:acReq:R1'));
beA.ccfGroup = 'G1'; beA.beta = 0.1; beB.ccfGroup = 'G1'; beB.beta = 0.1;
G.ipLedger(true);
graph = G._gtvBuildGraph({});
const ipC = graph.nodes.find(n => n.kind === 'ip');
const reqN = graph.nodes.find(n => n.key === 'req:acReq:R1');
check('compromised principle node flagged in the thread', ipC.flag === 'compromised' && /CCF/.test(ipC.flagReason));
check('flag propagates to the requirement node', reqN.flag === 'compromised' && /Independence principle compromised/.test(reqN.flagReason), JSON.stringify(reqN));

console.log('\n[4] disposition questionnaire');
if (jsdomOk) {
  beA.ccfGroup = ''; beA.beta = 0; beB.ccfGroup = ''; beB.beta = 0;
  const led2 = G.ipLedger(true);
  const key = led2[0].key;
  globalThis._signoffReviewerName = () => 'W. Nafees';
  G._ipDispModal(key);
  const modal = document.getElementById('ip-disp-modal');
  check('questionnaire modal opens with per-category selects', !!modal && modal.querySelectorAll('select[data-ipq]').length >= 5, modal && String(modal.querySelectorAll('select[data-ipq]').length));
  // Answer: environment susceptible-failure, maintenance susceptible-error → worst 'both'.
  const sel = c => modal.querySelector('select[data-ipq="' + c + '"]');
  if (sel('environment')) sel('environment').value = 'susceptible-failure';
  if (sel('maintenance')) sel('maintenance').value = 'susceptible-error';
  document.getElementById('ip-disp-mit').value = 'Physical separation LH/RH; independent maintenance procedures.';
  document.getElementById('ip-disp-by').value = 'W. Nafees';
  G.ipDispSubmit(key);
  // bindings_modules declares `let projectConfig` in the shared eval scope (as
  // in the browser) — read the store through the ledger, not the test global.
  const d = G.ipLedger(true)[0].disposition;
  check('disposition stored with answers + mitigation + signature', !!d && d.by === 'W. Nafees' && /separation/.test(d.mitigation) && d.answers.environment === 'susceptible-failure', JSON.stringify(d));
  check('worst-case rollup failure+error → both', d && d.susceptible === 'both', d && d.susceptible);
  check('ledger state respects lifecycle (requirement attached beats evaluated)', ['evaluated', 'requirement'].indexOf(G.ipLedger(true)[0].state) !== -1);
  check('blank signature refuses', (() => { G._ipDispModal(key); document.getElementById('ip-disp-by').value = ''; const before = JSON.stringify(G.ipLedger(true)[0].disposition); G.ipDispSubmit(key); const m = document.getElementById('ip-disp-modal'); if (m) m.remove(); return JSON.stringify(G.ipLedger(true)[0].disposition) === before; })());
} else console.log('  SKIP  jsdom unavailable for the modal flow');

console.log('\n[5] GTT report column');
const rows = G._gtvReportRows();
check('Independence Principles column present with state', rows.length === 1 && /⊥/.test(rows[0]['Independence Principles']) && /\[(COMPROMISED|REQUIREMENT|EVALUATED|VERIFIED|IDENTIFIED)\]/.test(rows[0]['Independence Principles']), rows[0] && rows[0]['Independence Principles']);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

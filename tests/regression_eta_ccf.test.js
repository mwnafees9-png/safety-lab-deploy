#!/usr/bin/env node
/*
 * Regression tests for Backlog #5 — event-tree common-cause coupling into the
 * CCA model (event_trees.js v1.2 + ipLedger source 'eta').
 *
 * Loads the REAL modules (engine + fta_quant, helpers, misc, fta_view,
 * support, event_trees) in one shared lexical scope and locks:
 *   [1] barrier→tree links: elicited, validated, journaled; unlink works.
 *   [2] coupling detector: shared CCF group across linked trees → coupled,
 *       unmodeled; INV-28 names it and demands a USER value.
 *   [3] entering pCcf (user value) models the coupling; INV-28 clears.
 *   [4] IP ledger: coupled pair becomes an 'eta' principle (etaCC); unmodeled
 *       coupling is a CONTRADICTED claim (compromised); modeled clears it.
 *   [5] same-page links → trivially coupled.
 *   [6] shared logical event (no groups) → coupled.
 *   [7] the audited arithmetic is untouched: Σp = 1 with coupling on.
 *   [8] two-lane discipline: P(top) annotation lane present in source, never
 *       writes; the detector originates no numbers.
 *
 * Run:  node tests/regression_eta_ccf.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const SITE = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- globals ----------------------------------------------------------------
globalThis.window = globalThis;
globalThis.projectConfig = {};
globalThis.projectName = 'K350';
globalThis.internalIdCounter = 9500;
globalThis.acFunctionsData = []; globalThis.acFhaData = [];
globalThis.systemsData = []; globalThis.cmaData = []; globalThis.zsaData = []; globalThis.praData = [];
globalThis.itemsData = []; globalThis.resourcesData = []; globalThis.routingData = []; globalThis.flightPhasesData = [];
globalThis.acAssumptionsData = []; globalThis.acReqData = [];
globalThis.commitSaveChanges = () => {};
globalThis._autosaveSuspended = false;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.scheduleAutosave = () => {};
globalThis.showToast = () => {};
globalThis.renderIpLedgerPage = () => {};
globalThis.Traceability = { getReferrers: () => [] };
globalThis.jrnl = () => {};
// Invariant registry stub — capture registrations so INV-28 can be invoked.
const INV = {};
globalThis.invRegister = def => { INV[def.id] = def; };
// Reports stub so event_trees' REG extension resolves without retries.
globalThis.Reports = { DEFAULT_TEMPLATES: { REG: '## 11. RAM suite outputs' }, extractData: function () { return {}; } };
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }), addEventListener: () => {}, querySelectorAll: () => [], body: { appendChild: () => {} } };

// Fault trees. pgA and pgB share CCF group G1 (declared, user β).
// pgC and pgD share a logical event L-SH (no groups).
const mkLeaf = (id, lid, disp, name, opts) => Object.assign({ id, logicalId: lid, displayId: disp, name, type: 'basic', probability: 1e-4, lambda: 1e-4, children: [] }, opts || {});
globalThis.ftaPages = [
  { id: 'pgA', name: 'Sys A tree', linkedFhaIds: [], mode: 'top-down', root: { id: 100, type: 'gate', gateType: 'OR', children: [
      mkLeaf(101, 'L-A1', 'BE-A1', 'Pump A fails', { ccfGroup: 'G1', beta: 0.1 }), mkLeaf(102, 'L-A2', 'BE-A2', 'Valve A fails') ] } },
  { id: 'pgB', name: 'Sys B tree', linkedFhaIds: [], mode: 'top-down', root: { id: 200, type: 'gate', gateType: 'OR', children: [
      mkLeaf(201, 'L-B1', 'BE-B1', 'Pump B fails', { ccfGroup: 'G1', beta: 0.05 }), mkLeaf(202, 'L-B2', 'BE-B2', 'Valve B fails') ] } },
  { id: 'pgC', name: 'Sys C tree', linkedFhaIds: [], mode: 'top-down', root: { id: 300, type: 'gate', gateType: 'OR', children: [
      mkLeaf(301, 'L-SH', 'BE-SH', 'Shared controller fails'), mkLeaf(302, 'L-C2', 'BE-C2', 'Sensor C fails') ] } },
  { id: 'pgD', name: 'Sys D tree', linkedFhaIds: [], mode: 'top-down', root: { id: 400, type: 'gate', gateType: 'OR', children: [
      mkLeaf(401, 'L-SH', 'BE-SH', 'Shared controller fails'), mkLeaf(402, 'L-D2', 'BE-D2', 'Sensor D fails') ] } },
];

(0, eval)([
  'safety_targets.js', 'engine_modules.js', 'fta_quant_modules.js', 'bindings_modules.js',
  'helpers_modules.js', 'misc_fn_modules.js', 'fta_view_modules.js', 'support_modules.js',
  'event_trees.js',
].map(SITE).join('\n;\n'));
const G = globalThis;

console.log('\n[1] barrier→tree links (elicited)');
let r = G.etaCreate('Fuel leak sequence', 'Fuel leak in zone 410', 1e-4, 'W. Nafees');
check('tree created', r.ok && r.id === 'ET-001', JSON.stringify(r));
const T = r.id;
check('barrier 1 added', G.etaAddBarrier(T, 'Detection & isolation', 0.1, '').ok);
check('barrier 2 added', G.etaAddBarrier(T, 'Fire suppression', 0.01, '').ok);
check('link to unknown page refused', G.etaLinkBarrier(T, 0, 'nope').ok === false);
check('links recorded', G.etaLinkBarrier(T, 0, 'pgA').ok && G.etaLinkBarrier(T, 1, 'pgB').ok
      && G.etaStore()[0].barriers[0].linkedPageId === 'pgA' && G.etaStore()[0].barriers[1].linkedPageId === 'pgB');
check('unlink works', (() => { G.etaLinkBarrier(T, 1, ''); const gone = G.etaStore()[0].barriers[1].linkedPageId === undefined; G.etaLinkBarrier(T, 1, 'pgB'); return gone; })());

console.log('\n[2] coupling detector — shared CCF group, unmodeled');
let cps = G.etaCoupling(G.etaStore()[0]);
check('one coupled pair via shared group G1', cps.length === 1 && cps[0].sharedGroups.length === 1 && cps[0].sharedGroups[0] === 'G1', JSON.stringify(cps));
check('unmodeled (no pCcf on downstream barrier)', cps[0].modeled === false);
check('why names the group, not a number', /share CCF group\(s\) G1/.test(cps[0].why));
let inv = INV['INV-28'] && INV['INV-28'].run();
check('INV-28 registered and failing', !!inv && inv.fails.length === 1 && /Enter a conditional pFail \(your value\)/.test(inv.fails[0]), inv && JSON.stringify(inv.fails));
check('finding demands a value, never supplies one', !/pCcf\s*=\s*[\d.]/.test(inv.fails[0]));

console.log('\n[3] user models the coupling → clears');
G.etaStore()[0].barriers[1].pCcf = 0.5;   // USER value
cps = G.etaCoupling(G.etaStore()[0]);
check('pair now modeled', cps.length === 1 && cps[0].modeled === true);
inv = INV['INV-28'].run();
check('INV-28 clears', inv.fails.length === 0, JSON.stringify(inv.fails));

console.log('\n[4] IP ledger — eta principle, contradiction lifecycle');
delete G.etaStore()[0].barriers[1].pCcf;   // back to unmodeled
let led = G.ipLedger(true);
let pr = led.find(p => p.etaCC);
check('eta principle in the ledger with ⛨ barrier members', !!pr && pr.members.length === 2 && pr.members.every(m => /⛨ .*\(ET barrier\)/.test(m.label)), JSON.stringify(led.map(p => p.key)));
check('unmodeled coupling = contradicted claim → compromised', !!pr && pr.contradiction === true && pr.state === 'compromised', pr && pr.state);
check('source carries tree + why', !!pr && pr.sources[0].type === 'eta' && pr.sources[0].treeId === T && /G1/.test(pr.sources[0].why));
G.etaStore()[0].barriers[1].pCcf = 0.5;    // model it again
led = G.ipLedger(true);
pr = led.find(p => p.etaCC);
check('modeled coupling → principle no longer contradicted', !!pr && pr.contradiction === false && pr.state !== 'compromised', pr && pr.state);

console.log('\n[5] same-page links → trivially coupled');
r = G.etaCreate('Engine surge sequence', 'Surge', 1e-5, 'W. Nafees');
const T2 = r.id;
G.etaAddBarrier(T2, 'FADEC response', 0.05, '');
G.etaAddBarrier(T2, 'Crew shutdown', 0.1, '');
G.etaLinkBarrier(T2, 0, 'pgA'); G.etaLinkBarrier(T2, 1, 'pgA');
cps = G.etaCoupling(G.etaStore()[1]);
check('same implementing tree → coupled', cps.length === 1 && cps[0].samePage === true && /same fault tree/.test(cps[0].why), JSON.stringify(cps));

console.log('\n[6] shared logical event (no groups) → coupled');
r = G.etaCreate('Bleed overtemp sequence', 'Overtemp', 1e-5, 'W. Nafees');
const T3 = r.id;
G.etaAddBarrier(T3, 'Overtemp detect', 0.02, '');
G.etaAddBarrier(T3, 'Precooler bypass', 0.03, '');
G.etaLinkBarrier(T3, 0, 'pgC'); G.etaLinkBarrier(T3, 1, 'pgD');
cps = G.etaCoupling(G.etaStore()[2]);
check('shared event L-SH detected', cps.length === 1 && cps[0].sharedEvents.length === 1 && cps[0].sharedEvents[0] === 'L-SH', JSON.stringify(cps));

console.log('\n[7] audited arithmetic untouched');
const ev = G.etaEvaluate(G.etaStore()[0]);
check('Σp = 1 with coupling on', ev.closed === true && ev.coupled === true, String(ev.sum));
check('coupled path uses the conditional (0.1·0.5 for FF path)', Math.abs(ev.outcomes.find(o => o.key === '11').prob - 0.1 * 0.5) < 1e-12, String(ev.outcomes.find(o => o.key === '11').prob));

console.log('\n[8] two-lane discipline (source-level)');
const src = SITE('event_trees.js');
check('P(top) annotation lane present, read-only wording', src.indexOf('annotation only') !== -1 && /never overwrites the elicited value/.test(src));
check('detector originates no numbers (intersections over declared facts)', /set intersections over user-declared facts; no numbers/.test(src));
check('ledger hook present in helpers (source e-block)', /type: 'eta', treeId: h\.treeId/.test(SITE('helpers_modules.js')));
check('index.html carries versioned event_trees (≥1.2) + helpers tags', /event_trees\.js\?v=(1\.[2-9]\d*|[2-9][\d.]*)/.test(SITE('index.html')) && /helpers_modules\.js\?v=\d/.test(SITE('index.html')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

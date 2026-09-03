#!/usr/bin/env node
/*
 * Regression — CMA per-IP passes (ARP4761A Appendix M deep-read build, 4 Aug
 * 2026; Waqas's rulings in HANDOFF §1b "CMA per-IP passes"):
 *
 *  · M.3.2.1.3 — the questionnaire runs PER Independence Principle
 *    (ctx 'ip:<key>'); concern rows carry the principle tag, and the ledger's
 *    NEW tag join lets principles from EVERY source (cutset / bow-tie /
 *    monitor / ETA — which have no gateGids and could never receive CMA
 *    evidence before) be acted on by the state machine.
 *  · M.3.2.2 / M.3.3.2 — phase axis: development vs verification (ASA
 *    checklist). Top-level `disp` REMAINS the development pass; `verDisp` is
 *    new; cmaData rows carry cmaPhase with ABSENT = legacy development.
 *  · M.3.1 — tailoring: generic ∪ added − removed with required rationale.
 *  · RULING: 'verified' keeps its meaning; missing as-built examination is an
 *    ADVISORY marker (asaAdvisory), never a demotion.
 *
 * Harness: the REAL modules in one shared lexical scope (the
 * regression_c1_polish pattern), walkthrough save paths and ipLedger EXECUTED.
 * Modal checks run only when jsdom is available (same guard as c1_polish).
 *
 * Run: node tests/regression_cma_per_ip.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');

// ---- [0] wiring floors (§7.3 — floors from birth) ---------------------------
console.log('\n[cma-ip] wiring');
const idx = S('index.html');
const pinOf = re => parseFloat((idx.match(re) || [])[1]);
check('index.html floors: cma_walkthrough ≥ 1.1, helpers ≥ 2.27, misc_fn ≥ 66.23',
  pinOf(/cma_walkthrough\.js\?v=([0-9.]+)/) >= 1.1 &&
  pinOf(/helpers_modules\.js\?v=([0-9.]+)/) >= 2.27 &&
  pinOf(/misc_fn_modules\.js\?v=([0-9.]+)/) >= 66.23);
const mf = S('misc_fn_modules.js');
check('the ledger page launches per-principle passes, system-level passes, and shows the ASA marker',
  mf.includes("cmaWalkthroughIp('") === false /* key is interpolated, not literal */ &&
  mf.includes('cmaWalkthroughIp(') && mf.includes('cmaWalkthroughSys(') &&
  mf.includes('development evidence only — ASA pass not run'));
const hp = S('helpers_modules.js');
check('ipLedger has the per-principle tag join AND the double-attach guard on the gate join',
  hp.includes("indexOf('ip:') === 0) return;") && hp.includes('perIp: true'));

// ---- globals (c1_polish harness) -------------------------------------------
globalThis.window = globalThis;
globalThis.projectConfig = {};
globalThis.projectName = 'K350';
globalThis.internalIdCounter = 7000;
globalThis.acFunctionsData = [{ subId: 'F-1', subName: 'Control pitch' }];
globalThis.acFhaData = [{ internalId: 'FC1', fcId: 'FC-001', fcDesc: 'Loss of pitch', severity: 'Catastrophic', subId: 'F-1' }];
globalThis.systemsData = [{ id: 'hyd', name: 'Hydraulics', fha: [], req: [], fcim: [], functions: [] }];
globalThis.cmaData = []; globalThis.zsaData = []; globalThis.praData = [];
globalThis.itemsData = []; globalThis.resourcesData = []; globalThis.routingData = []; globalThis.flightPhasesData = [];
globalThis.acAssumptionsData = [];
globalThis.commitSaveChanges = () => {};
globalThis._autosaveSuspended = false;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.scheduleAutosave = () => {};
globalThis.showToast = () => {};
globalThis.renderIpLedgerPage = () => {};
globalThis.renderCMA = () => {};
globalThis.Traceability = { getReferrers: () => [] };
const jsdomOk = (() => { try { require('/tmp/jsdom-env/node_modules/jsdom'); return true; } catch (_) { return false; } })();
if (jsdomOk) {
  const { JSDOM } = require('/tmp/jsdom-env/node_modules/jsdom');
  globalThis.document = new JSDOM('<!DOCTYPE html><body></body>').window.document;
} else {
  globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }), addEventListener: () => {}, querySelectorAll: () => [], body: { appendChild: () => {} } };
}

// Two Cat trees:
//  pg1 — AND gate WITH a DALgebra claim  → gate + cutset sources (has gateGids)
//  pg2 — AND gate WITHOUT a claim        → CUTSET-ONLY principle (no gateGids)
const beA = { id: 1, logicalId: 'L-A', displayId: 'BE-A', name: 'Channel A fails', type: 'basic', probability: 1e-4, children: [] };
const beB = { id: 2, logicalId: 'L-B', displayId: 'BE-B', name: 'Channel B fails', type: 'basic', probability: 1e-4, children: [] };
const beC = { id: 3, logicalId: 'L-C', displayId: 'BE-C', name: 'Pump C fails', type: 'basic', probability: 1e-4, children: [] };
const beD = { id: 4, logicalId: 'L-D', displayId: 'BE-D', name: 'Pump D fails', type: 'basic', probability: 1e-4, children: [] };
globalThis.ftaPages = [
  { id: 'pg1', name: 'FC-001 tree', linkedFhaIds: ['FC1'], mode: 'top-down',
    root: { id: 10, type: 'gate', gateType: 'AND', dalIndependence: 'option1', children: [beA, beB] } },
  { id: 'pg2', name: 'FC-001 hyd tree', linkedFhaIds: ['FC1'], mode: 'top-down',
    root: { id: 20, type: 'gate', gateType: 'AND', children: [beC, beD] } }
];
globalThis.acReqData = [{
  internalId: 'R1', id: 'REQ-IND-1', traceId: 'REQ-IND-1', type: 'Independence',
  text: 'Channels A and B shall be independent', verifStatus: 'Planned',
  reqSource: { sourceId: 'x:gate-indep:pg1:10' },
}];

// HARNESS LESSON (4 Aug — the a11 bare-identifier lesson met from the other
// side): bindings_modules declares `let projectConfig` at top level. In the
// BROWSER that is the shared global lexical binding; inside a single indirect
// eval, `let` bindings are PRIVATE to that eval script — invisible to later
// evals and to globalThis. Seeding globalThis.projectConfig therefore seeds an
// object the modules never read. Fix: expose accessors FROM INSIDE the same
// eval script (they close over the private bindings), and do every store
// read/seed through them.
(0, eval)([
  'safety_targets.js', 'engine_modules.js', 'fta_quant_modules.js', 'bindings_modules.js',
  'helpers_modules.js', 'misc_fn_modules.js', 'fta_view_modules.js', 'support_modules.js',
  'beta_scoring.js', 'cma_walkthrough.js',
].map(f => fs.readFileSync(path.join(SITE, f), 'utf8')).join('\n;\n') +
  '\n;globalThis.__S = {' +
  ' get cd() { return (typeof cmaData !== "undefined") ? cmaData : null; },' +
  ' get pc() { return (typeof projectConfig !== "undefined") ? projectConfig : null; },' +
  ' get pages() { return (typeof ftaPages !== "undefined") ? ftaPages : null; },' +
  ' get req() { return (typeof acReqData !== "undefined") ? acReqData : null; } };');
const G = globalThis;
const CD = G.__S.cd || G.cmaData;
const PC = G.__S.pc || G.projectConfig;
check('harness sees the modules\' REAL store bindings (accessors from inside the eval script)',
  Array.isArray(CD) && PC && typeof PC === 'object' && G.__S.pages === G.ftaPages,
  'if this fails, the store identities drifted — every later check would lie');

// ---- [1] the fixture principles exist as expected ---------------------------
console.log('\n[cma-ip] fixture ledger');
let led = G.ipLedger(true);
const gateP = led.find(p => p.gateGids.length && p.members.some(m => m.lid === 'L-A'));
const cutP = led.find(p => !p.gateGids.length && p.members.some(m => m.lid === 'L-C'));
check('gate-sourced principle (with gateGids) and CUTSET-ONLY principle (no gateGids) both identified',
  !!gateP && !!cutP, JSON.stringify(led.map(p => ({ k: p.key, g: p.gateGids.length }))));

// ---- [2] per-IP save path (M.3.2.1.3) ---------------------------------------
console.log('\n[cma-ip] per-principle save path, executed');
const sGate = PC.cmaWalk ? null : null;
// development-phase concern against the GATE principle
PC.cmaWalk = PC.cmaWalk || {};
PC.cmaWalk['ip:' + gateP.key] = { disp: { 'cr-hgen': 'concern' }, verDisp: {}, phase: 'dev', defenses: {}, deviceType: 'field', beta: null };
G._cmaSaveWalk('ip:' + gateP.key);
const rowGate = CD.find(r => r.cmaContext === 'ip:' + gateP.key);
check('a concern row lands tagged with the principle key + development phase',
  !!rowGate && rowGate.cmaPhase === 'development' && rowGate.origin === 'cma-walkthrough');
check('…claiming against THE PRINCIPLE (Table M2 shape), members named',
  rowGate.claim.includes('may defeat the Independence Principle') && rowGate.claim.includes('BE-A') && rowGate.claim.includes('⊥'));
check('…and carrying the principle\'s gate ids so the ORIGINAL join also sees it',
  JSON.stringify(rowGate.linkedGateIds) === JSON.stringify(gateP.gateGids));
// concern against the CUTSET-ONLY principle
PC.cmaWalk['ip:' + cutP.key] = { disp: { 'cr-hdist': 'concern' }, verDisp: {}, phase: 'dev', defenses: {}, deviceType: 'field', beta: null };
G._cmaSaveWalk('ip:' + cutP.key);
const rowCut = CD.find(r => r.cmaContext === 'ip:' + cutP.key);
check('a cutset-only principle gets its row with EMPTY linkedGateIds (nothing to link)',
  !!rowCut && rowCut.linkedGateIds.length === 0);

// ---- [3] the ledger acts on per-IP evidence (the headline capability) -------
console.log('\n[cma-ip] ledger tag join + state machine');
led = G.ipLedger(true);
const gate2 = led.find(p => p.key === gateP.key);
const cut2 = led.find(p => p.key === cutP.key);
check('the gate principle attached the row EXACTLY ONCE (double-attach guard: tag join owns ip:-tagged rows)',
  gate2.cma.filter(c => c.cmaId === rowGate.cmaId).length === 1 && gate2.cma[0].perIp === true,
  JSON.stringify(gate2.cma));
check('open per-IP concern → the principle is COMPROMISED (M.3.2.1.3(c): captured and acted on)',
  gate2.state === 'compromised');
check('the CUTSET-ONLY principle received CMA evidence and reacted — impossible before this build',
  cut2.cma.length === 1 && cut2.state === 'compromised',
  'the old join required gateGids; cutset/bow-tie/monitor/ETA principles could never attach evidence');

// ---- [4] verified + the ASA advisory marker (ruling: flag, never demote) ----
console.log('\n[cma-ip] ASA advisory marker');
rowGate.status = 'Closed — Accepted';
led = G.ipLedger(true);
const gate3 = led.find(p => p.key === gateP.key);
check('closed CMA + attached requirement → verified (semantics UNCHANGED)', gate3.state === 'verified');
check('…but with development evidence only, the ASA advisory flags it — state stands',
  gate3.asaAdvisory === true && gate3.state === 'verified');
check('coverage reads the per-IP walkthrough (dev run, one concern, no ASA run)',
  gate3.walk.devRun === true && gate3.walk.devConcerns === 1 && gate3.walk.verRun === false);
// run the verification pass → the advisory clears
PC.cmaWalk['ip:' + gateP.key].verDisp = { 'cr-hgen': 'mitigated' };
led = G.ipLedger(true);
const gate4 = led.find(p => p.key === gateP.key);
check('an ASA checklist pass clears the advisory without touching the state',
  gate4.asaAdvisory === false && gate4.state === 'verified' && gate4.walk.verRun === true);

// ---- [5] phase axis (M.3.2.2): separate records, legacy = development -------
console.log('\n[cma-ip] phase axis, executed');
// LEGACY row (no cmaPhase) must be matched by a development-phase save — no dupe.
CD.push({ internalId: 'LEG1', cmaId: 'CMA-LEG', origin: 'cma-walkthrough', cmaCategory: 'cr-net', cmaContext: 'aircraft',
  subject: 'legacy', claim: 'legacy', findings: 'x', mitigation: '', status: 'Open', scope: 'aircraft', owningSystemId: '', linkedGateIds: [], computed: false });
PC.cmaWalk['aircraft'] = { disp: { 'cr-net': 'concern' }, verDisp: {}, phase: 'dev', defenses: {}, deviceType: 'field', beta: null };
G._cmaSaveWalk('aircraft');
check('a legacy row (no cmaPhase) is treated as development — the dev save creates NO duplicate',
  CD.filter(r => r.cmaCategory === 'cr-net' && r.cmaContext === 'aircraft').length === 1);
// verification save for the same category creates its OWN row
const air = PC.cmaWalk['aircraft'];
air.phase = 'ver'; air.verDisp = { 'cr-net': 'concern' };
G._cmaSaveWalk('aircraft');
const netRows = CD.filter(r => r.cmaCategory === 'cr-net' && r.cmaContext === 'aircraft');
check('the verification pass files its OWN row beside the development one',
  netRows.length === 2 && netRows.some(r => r.cmaPhase === 'verification') &&
  netRows.some(r => (r.cmaPhase || 'development') === 'development'));
check('…named as the ASA checklist in its findings',
  netRows.find(r => r.cmaPhase === 'verification').findings.includes('verification-phase (ASA checklist)'));
// downgrading in ver phase removes ONLY the ver row
air.verDisp['cr-net'] = 'mitigated';
G._cmaSaveWalk('aircraft');
const netRows2 = CD.filter(r => r.cmaCategory === 'cr-net' && r.cmaContext === 'aircraft');
check('downgrading a verification concern removes only the verification row (dev record survives)',
  netRows2.length === 1 && (netRows2[0].cmaPhase || 'development') === 'development');
check('the development disposition store was never touched by verification edits',
  air.disp['cr-net'] === 'concern');

// ---- [6] system level (M.3.3) rides the same path ---------------------------
console.log('\n[cma-ip] system level');
PC.cmaWalk['sys-hyd'] = { disp: { 'mt-proc': 'concern' }, verDisp: {}, phase: 'dev', defenses: {}, deviceType: 'field', beta: null };
G._cmaSaveWalk('sys-hyd');
const sysRow = CD.find(r => r.cmaContext === 'sys-hyd');
check('a system-context save lands scoped to the system',
  !!sysRow && sysRow.scope === 'system' && sysRow.owningSystemId === 'hyd');

// ---- [7] tailoring (M.3.1), executed ----------------------------------------
console.log('\n[cma-ip] tailoring');
PC.cmaTailor = {
  added: [{ id: 'pj-lithium-ion', group: 'Environment', label: 'Lithium-ion thermal events', rationale: 'battery aircraft', at: 'x' }],
  removed: { 'op-staff': { rationale: 'single-operator program', at: 'x' } }
};
PC.cmaWalk['aircraft'].phase = 'dev';
PC.cmaWalk['aircraft'].disp['pj-lithium-ion'] = 'concern';
G._cmaSaveWalk('aircraft');
const pjRow = CD.find(r => r.cmaCategory === 'pj-lithium-ion');
check('a PROJECT-SPECIFIC category flows through save with its label resolved',
  !!pjRow && pjRow.subject.includes('Lithium-ion thermal events'));
if (jsdomOk) {
  G.cmaWalkthrough('aircraft', 'Aircraft-level');
  const body = G.document.getElementById('cma-wt-body').innerHTML;
  check('[jsdom] the rendered questionnaire = generic ∪ added − removed',
    body.includes('Lithium-ion thermal events') && !body.includes('Operations staff'));
  check('[jsdom] the phase toggle renders both modes',
    body.includes('Development (PASA/PSSA)') && body.includes('Verification — ASA checklist'));
  G._cmaSetPhase('aircraft', 'ver');
  const body2 = G.document.getElementById('cma-wt-body').innerHTML;
  check('[jsdom] verification mode shows the development answers beside the items (M.3.2.2.3)',
    body2.includes('dev:'));
  G.cmaWalkthroughIp(gateP.key);
  const body3 = G.document.getElementById('cma-wt-body').innerHTML;
  check('[jsdom] the per-principle banner names the principle under analysis (Table M2)',
    body3.includes('Independence Principle under analysis') && body3.includes('⊥'));
  G._cmaCloseWalk();
} else {
  console.log('  SKIP  [jsdom unavailable — modal render checks skipped, save paths covered above]');
}
check('removal of a GENERIC category is recorded with its rationale (auditable, restorable)',
  PC.cmaTailor.removed['op-staff'].rationale === 'single-operator program');

// ---- [8] doctrine pins ------------------------------------------------------
console.log('\n[cma-ip] doctrine');
const cw = S('cma_walkthrough.js');
check('legacy store shape untouched: top-level disp REMAINS the development pass',
  cw.includes("s.phase === 'ver' ? s.verDisp : s.disp"));
check('tailoring rationale is REQUIRED in both directions',
  cw.includes('needs a label AND a tailoring rationale') && cw.includes('needs a tailoring rationale (M.3.1)'));
check('the ledger ruling is written at the flag site: advisory, never a demotion',
  hp.includes('is FLAGGED, never') && hp.includes("p.asaAdvisory = (p.state === 'verified'"));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

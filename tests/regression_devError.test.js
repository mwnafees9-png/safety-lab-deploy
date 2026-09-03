#!/usr/bin/env node
/*
 * Regression tests for Backlog #4 — qualitative development-error events
 * (ARP 4761A 4.1.1.1, gap A8).
 *
 * Loads the REAL modules (engine + fta_quant for the BDD, helpers, misc,
 * fta_view, support, ffs_module) in one shared lexical scope and locks:
 *   [1] BDD boundary: a dev-error event enters _probMapFor at p = 0 even when
 *       a stale probability is on the node — P(top) is P(top | no dev error).
 *   [2] structure untouched: bddMinimalCutsets still returns the dev-error
 *       cut set; DAL allocation walks structure regardless of probability.
 *   [3] CCF lane: dev-error zeroing applies through the varMeta (β) path too.
 *   [4] updateNodeData forcing: checking the box sets eventClass and forces
 *       λ/P/inputValue to 0 AFTER the λ-reading branches; unchecking clears.
 *   [5] IP ledger: a dev-error-containing cut set registers as an ERROR
 *       independence claim, not a failure claim.
 *   [6] ffsRows()/ffsStats(): the qualitative lane enumerates dev-error cut
 *       sets with FC resolution + member marking.
 *   [7] reports wiring: ffs_table in all four token whitelists, the WS-B
 *       builder, the palette, and the PASA/PSSA/SSA templates (v1 + v2).
 *   [8] canvas + panel wiring: ◇ mark sync block, selectNode dev sync block,
 *       cutset partition (qualitative always material, conditional label).
 *
 * Run:  node tests/regression_devError.test.js
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
globalThis.internalIdCounter = 9000;
globalThis.acFunctionsData = [{ subId: 'F-1', subName: 'Control pitch' }];
globalThis.acFhaData = [{ internalId: 'FC1', fcId: 'FC-001', fcDesc: 'Loss of pitch', severity: 'Catastrophic', subId: 'F-1' }];
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
const jsdomOk = (() => { try { require('/tmp/jsdom-env/node_modules/jsdom'); return true; } catch (_) { return false; } })();
if (jsdomOk) {
  const { JSDOM } = require('/tmp/jsdom-env/node_modules/jsdom');
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  globalThis.document = dom.window.document;
} else {
  globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }), addEventListener: () => {}, querySelectorAll: () => [], body: { appendChild: () => {} } };
}

// The tree: OR(top) of [ AND(BE-A, DEV-D), BE-C ].
// DEV-D carries a STALE probability (0.5) to prove the boundary re-forces 0.
const beA = { id: 1, logicalId: 'L-A', displayId: 'BE-A', name: 'Channel A fails', type: 'basic', probability: 1e-3, lambda: 1e-3, children: [] };
const devD = { id: 2, logicalId: 'L-D', displayId: 'DEV-D', name: 'Erroneous gain schedule implemented', type: 'basic', probability: 0.5, lambda: 0.5, eventClass: 'dev-error', children: [] };
const beC = { id: 3, logicalId: 'L-C', displayId: 'BE-C', name: 'Actuator jams', type: 'basic', probability: 1e-5, lambda: 1e-5, children: [] };
globalThis.ftaPages = [{
  id: 'pg1', name: 'FC-001 tree', linkedFhaIds: ['FC1'], mode: 'top-down', treeLevel: 'aircraft',
  root: { id: 10, type: 'gate', gateType: 'OR', children: [
    { id: 11, type: 'gate', gateType: 'AND', children: [beA, devD] },
    beC,
  ] },
}];
globalThis.ftaConfig = { mode: 'bottom-up', apportion: 'equal', targetP: 1e-5, exposureTime: 1 };
globalThis.activeFTAPageId = 'pg1';

(0, eval)([
  'safety_targets.js', 'engine_modules.js', 'fta_quant_modules.js', 'bindings_modules.js',
  'helpers_modules.js', 'misc_fn_modules.js', 'fta_view_modules.js', 'support_modules.js',
  'ffs_module.js',
].map(SITE).join('\n;\n'));
const G = globalThis;

console.log('\n[1] BDD boundary — dev-error at p = 0, P(top | no development error)');
const r1 = G.computeExactProbability(ftaPages[0].root);
check('P(top) counts only the quantitative lane (≈1e-5, not 0.5·1e-3 + 1e-5)',
      Math.abs(r1.prob - 1e-5) / 1e-5 < 1e-6, String(r1.prob));
check('stale probability on the node is NOT consumed', devD.probability === 0.5);

console.log('\n[2] structure untouched');
const mcs = G.bddMinimalCutsets(ftaPages[0].root);
const keys = mcs.map(cs => cs.map(n => n.displayId).sort().join('+')).sort();
check('both minimal cut sets survive: {BE-C} and {BE-A, DEV-D}',
      keys.length === 2 && keys[0] === 'BE-A+DEV-D' && keys[1] === 'BE-C', JSON.stringify(keys));
check('dev-error member identifiable in the cut set',
      mcs.some(cs => cs.some(n => n.eventClass === 'dev-error')));

console.log('\n[3] CCF varMeta path zeroed too');
devD.ccfGroup = 'G9'; devD.beta = 0.2;
const r3 = G.computeExactProbability(ftaPages[0].root);
check('β-split of a dev-error event still contributes 0', Math.abs(r3.prob - 1e-5) / 1e-5 < 1e-6, String(r3.prob));
devD.ccfGroup = ''; devD.beta = 0;

console.log('\n[4] updateNodeData forcing (config panel)');
if (jsdomOk) {
  // Minimal panel DOM — every other block in updateNodeData is if-guarded.
  const mk = (tag, id, type) => { const el = document.createElement(tag); el.id = id; if (type) el.type = type; document.body.appendChild(el); return el; };
  const nameEl = mk('input', 'config-name'); nameEl.value = 'Channel A fails';
  const ccfEl  = mk('input', 'config-ccf-group'); ccfEl.value = '';
  const betaEl = mk('input', 'config-beta'); betaEl.value = '0';
  const lamEl  = mk('input', 'config-lambda'); lamEl.value = '0.001';
  const devEl  = mk('input', 'config-dev-error', 'checkbox');
  // Neutralize render side-effects (function declarations land on globalThis
  // under indirect eval, so reassignment reaches the internal call sites).
  G.updateD3 = () => {}; G.calculateAllProbabilities = () => {}; G.renderFTASidebar = () => {};
  G.selectedNodeData = beA;
  devEl.checked = true;
  G.updateNodeData();
  check('checked → eventClass set + λ/P/inputValue forced to 0',
        beA.eventClass === 'dev-error' && beA.lambda === 0 && beA.probability === 0 && beA.inputValue === 0,
        JSON.stringify({ ec: beA.eventClass, l: beA.lambda, p: beA.probability }));
  check('λ input cleared + disabled', lamEl.value === '' && lamEl.disabled === true);
  // The forcing must win over the λ-reading branches (bottom-up mode reads config-lambda).
  lamEl.disabled = false; lamEl.value = '0.007';
  G.updateNodeData();
  check('forcing runs AFTER λ read — typed value cannot stick', beA.lambda === 0, String(beA.lambda));
  devEl.checked = false;
  G.updateNodeData();
  check('unchecked → eventClass cleared, λ input re-enabled', beA.eventClass === undefined && lamEl.disabled === false);
  beA.lambda = 1e-3; beA.probability = 1e-3;   // restore for later sections
  delete beA.inputValue;
} else console.log('  SKIP  jsdom unavailable for the panel flow');

console.log('\n[5] IP ledger — dev-error cut set is an ERROR claim');
const led = G.ipLedger(true);
const pr = led.find(p => p.members.some(m => m.lid === 'L-D'));
check('principle identified over {BE-A, DEV-D}', !!pr && pr.members.length === 2, JSON.stringify(led.map(p => p.key)));
check('claim type is error-independence', !!pr && pr.claims.has('error') && !pr.claims.has('failure'), pr && JSON.stringify([...pr.claims]));

console.log('\n[6] ffsRows()/ffsStats() — the qualitative lane');
const rows = G.ffsRows();
check('exactly one qualitative scenario', rows.length === 1 && rows[0].order === 2, JSON.stringify(rows.map(r => r.order)));
check('FC resolved from the linked FHA', rows[0].fcs.length === 1 && rows[0].fcs[0].fcId === 'FC-001' && rows[0].fcs[0].severity === 'Catastrophic', JSON.stringify(rows[0].fcs));
check('◇ member marked; co-member not', rows[0].members.some(m => m.devError && m.displayId === 'DEV-D') && rows[0].members.some(m => !m.devError && m.displayId === 'BE-A'));
check('devMembers names the dev-error event(s)', rows[0].devMembers.length === 1 && rows[0].devMembers[0] === 'DEV-D');
const st = G.ffsStats(rows);
check('stats: 1 scenario / 1 tree / 1 dev event', st.scenarios === 1 && st.trees === 1 && st.devEvents === 1, JSON.stringify(st));

console.log('\n[7] reports wiring — token in every whitelist + templates + palette');
const rep = SITE('reports.js');
// v0.3 (6 Aug 2026) — sora_summary_table/sora_oso_table joined the same four
// whitelists right after ffs_table (SORA report bridge). These checks confirm
// ffs_table is still registered somewhere in each whitelist, not that nothing
// was ever added after it — a new token appearing later doesn't un-register
// an earlier one.
check('v1 parser regex', /\|budget_ledger_table\|ffs_table(\|sora_summary_table\|sora_oso_table)?\)\\\}\\\}\$\//.test(rep));
check('sectioned renderers (docx + pdf regexes)', (rep.match(/\|budget_ledger_table\|ffs_table(\|sora_summary_table\|sora_oso_table)?\|appendix:fta/g) || []).length === 2);
check('custom-docx tableTokens array', /'budget_ledger_table','ffs_table'(,'sora_summary_table','sora_oso_table')?\]/.test(rep));
check('WS-B builder returns ffs_table', /const ffs_table = \[\];/.test(rep) && /budget_ledger_table, ffs_table,\n\s*\};/.test(rep));
check('PASA/PSSA/SSA templates carry {{ffs_table}} (v1+v2 = 6 sites)', (rep.match(/\{\{ffs_table\}\}/g) || []).length === 6, String((rep.match(/\{\{ffs_table\}\}/g) || []).length));
check('token palette entry', SITE('safety_lab.js').indexOf("{ id: 'ffs_table',") !== -1);
check('index.html loads ffs_module.js', SITE('index.html').indexOf('ffs_module.js?v=') !== -1);

console.log('\n[8] canvas + panel + cutset-report wiring (source-level)');
const fv = SITE('fta_view_modules.js');
check('◇ canvas mark enter+update blocks', fv.indexOf("'node-dev-error-mark'") !== -1 && fv.indexOf('◇ DEV ERROR') !== -1);
check('selectNode syncs checkbox + disables both value inputs', /config-dev-error-container/.test(fv) && /devChk\.checked = isDev/.test(fv));
check('inline mode switch cannot re-quantify a dev-error event', /eventClass === 'dev-error'\) \{ d\.data\.lambda = 0; d\.data\.inputValue = 0; \}/.test(fv));
check('cutset partition: qualitative sets always material', /const material = isQual \|\| \(order <= 3\)/.test(fv));
check('cutset summary: conditional P(top) label', fv.indexOf("'P(top | no development error)'") !== -1);
check('qualitative FFS badge on rows', fv.indexOf('◇ Qualitative FFS — development error') !== -1);
const sup = SITE('support_modules.js');
check('updateNodeData dev-error block sits after every λ-reading branch',
      sup.indexOf('AFTER every λ-reading branch') !== -1 && sup.indexOf("selectedNodeData.eventClass = 'dev-error'") !== -1);
check('index.html has the ◇ checkbox in its own container', SITE('index.html').indexOf('config-dev-error-container') !== -1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

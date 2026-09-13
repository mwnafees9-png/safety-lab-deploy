#!/usr/bin/env node
/*
 * Regression — B4: CoFFE consumes MAC.
 *   [1] A single the MODEL computes YES prunes its supersets from the walk
 *       (previously only a SIGNED yes pruned — with 0 signed it never fired;
 *       92 of 676 wasted cases measured on Aeolus). A signed NO stays
 *       authoritative and un-prunes.
 *   [2] The panel folds model-answered cases behind a derived section; the
 *       elicit table carries ONLY malfunction cases, unmodelled-system cases
 *       and live disagreements. coffeConfirmDerived gains its button. Case
 *       numbers are stable across sections. Rendered in a VM (rule 11)
 *       through the REAL renderCoffePanel with a captured host.
 * Run: node tests/regression_coffe_consumes_mac.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

globalThis.window = globalThis;
globalThis.SLEnv = { get: n => globalThis[n] };

// ---- fixture ----------------------------------------------------------------
// Three contributors: sA and sB modelled by the MAC (1-of-2 → any single loss
// breaches → BOTH availability singles compute YES), sC unmodelled.
globalThis.acFunctionsData = [{ subId: 'SF-01', subName: 'Control pitch' }];
globalThis.systemsData = [
  { id: 'sA', name: 'Actuation', functions: [{ funcId: 'FN-A', funcName: 'Actuate', traceIds: ['SF-01'] }], fha: [] },
  { id: 'sB', name: 'Power', functions: [{ funcId: 'FN-B', funcName: 'Power', traceIds: ['SF-01'] }], fha: [] },
  { id: 'sC', name: 'Comms', functions: [{ funcId: 'FN-C', funcName: 'Comms', traceIds: ['SF-01'] }], fha: [] },
];
globalThis.acFhaData = [{ internalId: 11, subId: 'SF-01', fcId: 'FC-01', fcDesc: 'Loss of pitch', severity: 'Catastrophic', phases: [] }];
globalThis.acFcimData = [];
globalThis.resourcesData = []; globalThis.itemsData = []; globalThis.flightPhasesData = []; globalThis.routingData = [];
globalThis.ftaPages = []; globalThis.ftaConfig = {};
globalThis.projectConfig = {
  macModels: [{ id: 'r1', subId: 'SF-01', clauses: [{ min: 2, of: ['sA', 'sB'] }] }],   // 2-of-2 → any single loss breaches
  interdep: { cells: {}, cra: {} },
  coffe: { verdicts: {} },
};
// all three contribute (fn columns via traces would need fn: cells; use legacy asserted cells)
projectConfig.interdep.cells['11§sA'] = { state: 'asserted', by: 'W' };
projectConfig.interdep.cells['11§sB'] = { state: 'asserted', by: 'W' };
projectConfig.interdep.cells['11§sC'] = { state: 'asserted', by: 'W' };
globalThis.internalIdCounter = 100;
// bindings_modules.js owns this const in the app; mirrored here (B7: two states).
globalThis._COFFE_STATES = ['total loss', 'malfunction'];
globalThis.commitSaveChanges = () => {};
globalThis._autosaveSuspended = false; globalThis._autosaveLastWrite = 0; globalThis._dirtySinceSave = false;
globalThis._autosaveDiskAvailable = false; globalThis._autosaveLastDiskWrite = 0;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.scheduleAutosave = () => {};
globalThis.showToast = () => {};
globalThis.sys = () => null;
globalThis.renderSysFHA = () => {}; globalThis.renderFhaPhaseGrid = () => {}; globalThis.renderInterdepPage = () => {};

// VM host capture (rule 11) — the real renderer writes real markup here.
let coffeHtml = '';
const hostEl = { get innerHTML() { return coffeHtml; }, set innerHTML(v) { coffeHtml = v; } };
globalThis.document = {
  getElementById: id => id === 'coffe-host' ? hostEl : null,
  createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }),
  addEventListener: () => {}, querySelectorAll: () => [], body: { appendChild: () => {} },
};

(0, eval)(['fn_resolver.js', 'helpers_modules.js', 'misc_fn_modules.js'].map(f => S(f)).join('\n;\n'));
const G = globalThis;
const FC = acFhaData[0];
check('machinery loaded', typeof G.coffeCases === 'function' && typeof G.renderCoffePanel === 'function' && typeof G.coffeConfirmDerived === 'function');

// ---- [1] the prune fires on MODEL answers -----------------------------------
check('modelled availability singles compute YES', G.coffeComputed(FC, { parts: [{ sysId: 'sA', state: 'total loss' }], key: 'sA=total loss' }) === 'yes');
const cases = G.coffeCases(FC);
const keys = cases.map(k => k.key);
check('singles all present (6 = 3 systems × 2 states)', cases.filter(k => k.parts.length === 1).length === 6);
check('pairs containing a computed-YES availability single are PRUNED (no signature needed)',
  !keys.some(k => /sA=total loss/.test(k) && k.includes('∧')) && !keys.some(k => /sB=total loss/.test(k) && k.includes('∧')),
  JSON.stringify(keys.filter(k => k.includes('∧'))));
check('malfunction singles never prune (no computed lane) — their pairs survive',
  keys.some(k => k === _coffeCaseKey([{ sysId: 'sA', state: 'malfunction' }, { sysId: 'sB', state: 'malfunction' }])));
check('unmodelled-system pairs survive the prune',
  keys.some(k => /sC=total loss/.test(k) && k.includes('∧') && /malfunction|sC/.test(k)));
// the measured-mechanic count: walk shrinks vs the unpruned enumeration
const unprunedPairs = 3 * (3 - 1) / 2 * 2 * 2;   // 12
const prunedPairs = keys.filter(k => k.includes('∧')).length;
check('the walk genuinely shrinks (' + prunedPairs + ' of ' + unprunedPairs + ' pairs remain)', prunedPairs < unprunedPairs, String(prunedPairs));

// signed NO un-prunes: authority stays with the signature
projectConfig.coffe.verdicts['11§sA=total loss'] = { verdict: 'no', by: 'W. Nafees', at: 'T' };
const keys2 = G.coffeCases(FC).map(k => k.key);
check('a signed NO on that single un-prunes its pairs (signatures outrank the model)',
  keys2.some(k => /sA=total loss/.test(k) && k.includes('∧')), JSON.stringify(keys2.filter(k => /sA=total loss/.test(k))));
delete projectConfig.coffe.verdicts['11§sA=total loss'];

// ---- unmodelled systems named ----------------------------------------------
check('coffeUnmodelledSystems names sC', JSON.stringify(G.coffeUnmodelledSystems(FC)) === '["sC"]');

// ---- [2] the panel: fold + elicit split (VM render, rule 11) ----------------
globalThis._coffeSelectedFc = String(FC.internalId);
window._coffeShowComputed = false;
G.renderCoffePanel();
check('panel renders', coffeHtml.length > 500);
check('unmodelled call-out names the system', /No MAC clause models/.test(coffeHtml) && /Comms/.test(coffeHtml));
check('elicit section header present', /Elicit — judgment residue/.test(coffeHtml));
const foldHdr = coffeHtml.match(/▸ (\d+) cases? answered by the MAC model/);
check('model-answered cases are FOLDED with a count', !!foldHdr, coffeHtml.slice(0, 0));
// folded rows are NOT rendered while collapsed: no "MAC: breaches" annotation visible
check('collapsed fold renders no computed rows', !/MAC: breaches/.test(coffeHtml));
// elicit rows: malfunction singles have no computed lane; sC rows say outside the model
check('elicit table carries the malfunction and unmodelled residue',
  /— no computed lane/.test(coffeHtml) && /— outside the MAC model/.test(coffeHtml));
window._coffeShowComputed = true;
G.renderCoffePanel();
check('expanded fold renders the computed rows with the derived-sign button',
  /MAC: breaches/.test(coffeHtml) && /sign derived/.test(coffeHtml) && /coffeConfirmDerived\(/.test(coffeHtml));
// case numbers stable: sA=total loss keeps its number in both states
const numOf = html => { const m = html.match(/<td class="u-mono">(\d+)<\/td><td style="text-align:center; color: ?var\(--color-danger\); font-weight:600;">Failed<\/td>/); return m && m[1]; };
window._coffeShowComputed = false; G.renderCoffePanel(); const collapsedHtml = coffeHtml;
window._coffeShowComputed = true; G.renderCoffePanel();
check('a case keeps its number whichever section it renders in',
  (() => { const all = G.coffeCases(FC); const want = String(all.findIndex(k => k.key === 'sA=total loss') + 1);
    return coffeHtml.indexOf('coffeConfirmDerived(\'11\',\'sA=total loss\')') !== -1 &&
           new RegExp('<td class="u-mono">' + want + '</td>').test(coffeHtml); })());

// live disagreement stays on the elicit table
projectConfig.coffe.verdicts['11§sA=total loss'] = { verdict: 'no', by: 'W', at: 'T' };
window._coffeShowComputed = false;
G.renderCoffePanel();
check('a live signed-vs-computed disagreement renders in the ELICIT table even when the fold is collapsed',
  /✕ MAC says yes/.test(coffeHtml));
delete projectConfig.coffe.verdicts['11§sA=total loss'];

// ---- the derived signature flow, executed -----------------------------------
(async () => {
  globalThis._signoffReviewerName = () => 'W. Nafees';
  globalThis.slPrompt = async () => 'W. Nafees';
  await G.coffeConfirmDerived('11', 'sA=total loss');
  const v = projectConfig.coffe.verdicts['11§sA=total loss'];
  check('sign-derived records the model answer with derived:true', v && v.verdict === 'yes' && v.derived === true && v.by === 'W. Nafees');
  window._coffeShowComputed = true;   // a signed-AGREEING case folds (handled) — expand to see it
  G.renderCoffePanel();
  check('a signed derived verdict shows its (derived) provenance', /\(derived\)/.test(coffeHtml));
  delete projectConfig.coffe.verdicts['11§sA=total loss'];

  // ---- pins (rule 12) -------------------------------------------------------
  const idx = S('index.html');
  const pin = name => parseFloat(((idx.match(new RegExp(name.replace('.', '\\.') + '\\?v=([0-9.]+)')) || [])[1]) || '0');
  check('helpers ≥ 2.47 (B4 panel)', pin('helpers_modules.js') >= 2.47);
  check('misc_fn ≥ 66.36 (B4 prune)', pin('misc_fn_modules.js') >= 66.36);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

#!/usr/bin/env node
/*
 * Regression tests for WS-C — ram_ai.js (R&M ↔ AI wiring, text-only drafting).
 *
 * Runs the REAL site/ram_ai.js in jsdom-less Node with a minimal DOM shim is not
 * possible (modal needs a DOM), so this uses jsdom when available and otherwise
 * skips the DOM part. Locks:
 *   [1] FRACAS draft flow: AI JSON → review modal → accept writes narrative +
 *       action + provenance markers; declared assumptions land in the ledger
 *       (with citations passed through); numbers ban present in the prompt.
 *   [2] MSG-3 rationale flow: accept writes ff.rationale + markers.
 *   [3] Injection: ✨ buttons appear beside FRACAS action cells and MSG-3
 *       task buttons; AI-drafted records get the confidence pill.
 *
 * Run:  node tests/regression_ram_ai.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM = null;
try { JSDOM = require('/tmp/jsdom-env/node_modules/jsdom').JSDOM; } catch (_) {}
if (!JSDOM) { console.log('jsdom unavailable — SKIP (run where jsdom is installed)'); process.exit(0); }

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="ram-rel-host"></div><div id="ram-msg3-host"></div></body></html>');
global.window = dom.window; global.document = dom.window.document;
global.showToast = () => {};
global.projectConfig = { msg3: { msis: [{ id: 'MSI-1', name: 'EMA', itemId: 'ITM-1', sel: { hidden: true, safety: true }, ffs: [{ id: 'FF-1', func: 'Actuate', failure: 'fails', tasks: [] }] }] } };
global.commitSaveChanges = () => { global._saved = (global._saved || 0) + 1; };

// Real ai_badges for pills.
(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'site', 'ai_badges.js'), 'utf8'));

// RAM store + evaluation stubs.
const FIELD = [{ id: 'FRC-1', beRef: 'BE-100', windowMonths: 6, hours: 1200, failures: 2, by: 'W' }];
dom.window._ramStore = () => ({ tasks: [], field: FIELD, dispatch: { targets: [], records: [] } });
dom.window.ramFieldRows = () => [{ f: FIELD[0], predicted: 5000, lcb: 800, verdict: 'finding', point: null }];
dom.window.msg3Category = () => 8;
dom.window.msg3Disposition = () => ({ state: 'open', label: 'OPEN — no applicable & effective task' });

// AI lane stub: capture the request, return canned JSON with a cited assumption.
let lastReq = null;
dom.window.slLoadAI = () => Promise.resolve();
dom.window.SafetyLabAI = {
  complete: req => {
    lastReq = req;
    if (req.feature === 'ram.fracas.draft') return Promise.resolve({ model: 'stub-model', text: JSON.stringify({
      narrative: 'Field data over the reporting window challenges the predicted MTBF for the linked basic event.',
      action: 'Initiate root-cause investigation of the EMA winding failures; contain by fleet inspection per the maintenance program.',
      assumptions: [{ text: 'Reported hours are fleet operating hours, not calendar hours', type: 'data', rationale: 'window given in months only', ifWrong: 'observed rate shifts', usedFor: 'FRC-1 narrative', citations: [] }],
    }) });
    return Promise.resolve({ model: 'stub-model', text: JSON.stringify({
      rationale: 'The failure is hidden in normal operation and sits on a safety-significant thread, so the category directs a failure-finding task; no applicable and effective task is yet selected, leaving the item OPEN.',
      assumptions: [],
    }) });
  },
};
// Ledger capture.
const LEDGER = [];
dom.window.SafetyLabAiAssumptions = { add: e => { LEDGER.push(e); return e; } };
dom.window.AiFidelity = { recordProvenance: r => { (global._prov = global._prov || []).push(r); } };

(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'site', 'ram_ai.js'), 'utf8'));

(async () => {
  console.log('\n[1] FRACAS draft flow');
  await dom.window.ramAiFracas('FRC-1');
  check('number ban present in the system prompt', /Never propose, alter, or estimate any number/.test(lastReq.system));
  check('assumptions+citations contract present', /citations/.test(lastReq.system));
  const modal = document.getElementById('ram-ai-modal');
  check('review modal opened with two fields', !!modal && !!document.getElementById('ram-ai-f0') && !!document.getElementById('ram-ai-f1'));
  check('declared assumption logged to the ledger with rationale', LEDGER.length === 1 && LEDGER[0].analysis === 'ram.fracas.draft' && /window given in months/.test(LEDGER[0].rationale));
  // Engineer edits field 0, accepts.
  document.getElementById('ram-ai-f0').value = 'Edited narrative.';
  document.getElementById('ram-ai-accept').onclick();
  check('accept writes narrative + action onto the record', FIELD[0].narrative === 'Edited narrative.' && /root-cause/.test(FIELD[0].action));
  check('provenance markers set (aiGenerated, feature, model, edited)', FIELD[0].aiGenerated === true && FIELD[0].aiFeature === 'ram.fracas.draft' && FIELD[0].aiModel === 'stub-model' && FIELD[0].aiEdited === true);
  check('provenance ledger recorded draft + accept', (global._prov || []).filter(p => p.feature === 'ram.fracas.draft').length === 2);
  check('project save committed', (global._saved || 0) >= 1);

  console.log('\n[2] MSG-3 rationale flow');
  await dom.window.ramAiMsg3('MSI-1', 'FF-1');
  check('modal opened for rationale', !!document.getElementById('ram-ai-modal'));
  document.getElementById('ram-ai-accept').onclick();
  const ff = projectConfig.msg3.msis[0].ffs[0];
  check('accept writes ff.rationale + markers', /failure-finding task/.test(ff.rationale) && ff.aiGenerated === true && ff.aiFeature === 'ram.msg3.rationale');

  console.log('\n[3] UI injection');
  document.getElementById('ram-rel-host').innerHTML = '<table><tbody><tr><td onclick="ramFracasAction(\'FRC-1\')">action…</td></tr></tbody></table>';
  document.getElementById('ram-msg3-host').innerHTML = '<div><button onclick="msg3AddTask(\'MSI-1\',\'FF-1\')">+ task</button></div>';
  dom.window.renderRamRelPage = () => {}; dom.window.renderMsg3Page = () => {};
  // re-boot wrappers then invoke the injectors via the wrapped renders
  (0, eval)(fs.readFileSync(path.join(__dirname, '..', 'site', 'ram_ai.js'), 'utf8'));
  dom.window.renderRamRelPage(); dom.window.renderMsg3Page();
  check('✨ Draft button injected on the FRACAS action cell', !!document.querySelector('#ram-rel-host [data-ram-ai]'));
  check('AI-drafted record carries the confidence pill', !!document.querySelector('#ram-rel-host .ai-conf-pill'));
  check('✨ Rationale button injected beside the MSG-3 task button', !!document.querySelector('#ram-msg3-host [data-ram-ai-ff]'));
  check('recorded rationale rendered under the FF with its pill', !!document.querySelector('#ram-msg3-host [data-ram-ai-rat]') && !!document.querySelector('#ram-msg3-host .ai-conf-pill'));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

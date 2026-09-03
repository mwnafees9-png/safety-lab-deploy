#!/usr/bin/env node
/*
 * regression_hf_import.test.js — CSV import parity for the HF lanes.
 * Every HF lane that exports can now import. Verifies the Import buttons are wired on
 * every lane, importTabularCSV carries an HF branch per target, and — EXECUTED against
 * the real importTabularCSV (evaluated in a sandbox) — a CSV round-trips into the store
 * for a free-form lane (Controls & Displays) and the section-format lane (MFC).
 * Run: node tests/regression_hf_import.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const dops = R('data_ops_modules.js');
const hfa = R('hf_analyses.js');

console.log('1. Import buttons on every HF lane');
const TARGETS = ['HF_HEA','HF_Alerts','HF_Tasks','HF_Ergo','HF_ControlsDisplays','HF_SituationAwareness','HF_MFC'];
TARGETS.forEach(t => check('render wires an Import CSV button for ' + t, hfa.indexOf("triggerCSVImport(\\'" + t + "\\')") >= 0));
check('Task Identification carries an Import CSV button', /triggerCSVImport\(\\'HF_TaskIdentification\\'\)/.test(hfa));
// Eight since Task Identification shipped (1 Sep 2026): tid/hea/alerts/tasks/ergo/cd/sa/mfc.
check('Function Allocation carries an Import CSV button', /triggerCSVImport\(\\'HF_FunctionAllocation\\'\)/.test(hfa));
// Nine since Function Allocation got its data actions (2 Sep 2026) — it was the one
// shipped lane with no export and no import at all.
check('exactly nine Import CSV buttons across the HF lanes', (hfa.match(/triggerCSVImport\(\\'/g) || []).length === 9);

console.log('2. importTabularCSV carries an HF branch per target');
TARGETS.forEach(t => check("importTabularCSV handles " + t, new RegExp("moduleName === '" + t + "'").test(dops)));

console.log('3. EXECUTED round-trip through the real importTabularCSV');
// Evaluate data_ops_modules.js (pure function declarations) in a sandbox, expose the
// two functions we need, and drive them like the app would.
const MFC_FUNCTIONS = [
  { key: 'fpc', label: 'Flight path control' }, { key: 'ca', label: 'Collision avoidance' },
  { key: 'nav', label: 'Navigation' }, { key: 'comm', label: 'Communications' },
  { key: 'sys', label: 'Operation and monitoring of aircraft engines and systems' }, { key: 'cmd', label: 'Command decisions' }
];
const sandbox = {
  window: { HF_ANALYSES: { MFC_FUNCTIONS } },
  projectConfig: { hf: {} },
  document: undefined, alert: () => {}, console,
  Date, Math, JSON, parseInt, parseFloat, isNaN, String, Array, Object, RegExp, Number,
  // stubs for importTabularCSV's post-loop AC/Sys sync + renderers (not exercised by HF imports)
  _pushExtractedFCs: function(){}, acFcimData: [], acExtractedFCs: [], activeSystemId: null, sys: function(){ return {}; }
};
vm.createContext(sandbox);
let loaded = false;
try {
  vm.runInContext(dops + '\n; this.__csvToArray = csvToArray; this.__importTabularCSV = importTabularCSV;', sandbox);
  loaded = typeof sandbox.__importTabularCSV === 'function' && typeof sandbox.__csvToArray === 'function';
} catch (e) { console.log('  (eval error: ' + e.message + ')'); }
check('importTabularCSV + csvToArray evaluate cleanly (no load-time code)', loaded);

if (loaded) {
  // free-form lane: Controls & Displays
  const cdCsv = [
    'ID,Item,Kind,§25.1302 consideration,Supports,Finding,Status,Notes',
    'CD-001,PFD airspeed tape,Display,(a) information to perform the task,airspeed awareness,legible in all light,Closed,ok',
    ',Gear lever,Control,(b) usable by the qualified crew,gear,reachable,Open,'
  ].join('\n');
  sandbox.projectConfig.hf = {};
  sandbox.__importTabularCSV(cdCsv, 'HF_ControlsDisplays');
  const cd = (sandbox.projectConfig.hf.cd && sandbox.projectConfig.hf.cd.rows) || [];
  check('CD import: two rows land in the cd store', cd.length === 2);
  check('CD import: columns map to fields (item/kind/consideration/status)',
    cd[0].item === 'PFD airspeed tape' && cd[0].kind === 'Display' && /^\(a\)/.test(cd[0].consideration) && cd[0].status === 'Closed');
  check('CD import: preserves a provided ID, generates one when blank', cd[0].cdId === 'CD-001' && /^CD-\d{3}$/.test(cd[1].cdId));

  // section-format lane: MFC
  const mfcCsv = [
    'Section,Item,Assignment / disposition,Bedford / note / rationale',
    'Basic workload function,Flight path control,PF,Bedford 6 — hand-flown approach',
    'Workload factor,(10) Incapacitation of a flight crewmember (when the operating rule requires two or more pilots),dispositioned: 2-crew,',
    'Determination,Minimum flight crew (§25.1523),2 pilots,workload supports two'
  ].join('\n');
  sandbox.projectConfig.hf = {};
  sandbox.__importTabularCSV(mfcCsv, 'HF_MFC');
  const mfc = sandbox.projectConfig.hf.mfc || {};
  const fpc = (mfc.rows || []).find(r => r.key === 'fpc');
  check('MFC import: a basic-function row maps label→key with role + Bedford + note',
    !!fpc && fpc.role === 'PF' && fpc.bedford === '6' && /hand-flown/.test(fpc.note || ''), JSON.stringify(fpc));
  check('MFC import: factor (10) disposition lands at index 9', (mfc.factors || {})['9'] === 'dispositioned: 2-crew');
  check('MFC import: determination maps minCrew + rationale',
    mfc.conclusion && mfc.conclusion.minCrew === '2 pilots' && /workload supports two/.test(mfc.conclusion.rationale || ''));
}

console.log('\n' + (fail ? ('FAIL — ' + fail + ' failed, ' + pass + ' passed') : ('OK — all ' + pass + ' checks pass')));
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/*
 * Regression — hf_severity_badge.js v1.1 (the REBUILT INV-HFW row surface).
 *   [1] evalRow agrees with the engine's run() row-for-row on the same data —
 *       the badge and the invariant can never tell different stories.
 *   [2] evalRow: null when consistent, null when no workload signal, finding
 *       (band, source, implied severity, gap) when the ≥2-band gap stands;
 *       HFA band beats text; awareness carried as context.
 *   [3] badge(): renders only WITH a finding, carries the tooltip and the
 *       click-through; the ladder is IMPORTED from the engine, not duplicated.
 *   [4] actions: severity/effect route to the row's own editor; hfa routes to
 *       the HFA tab; the badge module never mutates a store.
 *   [5] wiring: index.html loads the file; helpers call sites intact
 *       (evalRow guard + HFW_UI.badge in both AC and SYS renderers).
 * Run: node tests/regression_hfw_badge.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- stub world --------------------------------------------------------------
global.window = global;
global.acFhaData = [
    { internalId: 'r1', fcId: 'FC-01', severity: 'Catastrophic', effCrew: 'slight increase in crew workload', assumptionIds: [] },       // text: slight vs Cat → gap 3
    { internalId: 'r2', fcId: 'FC-02', severity: 'Major', effCrew: 'significant increase in crew workload', assumptionIds: [] },          // consistent
    { internalId: 'r3', fcId: 'FC-03', severity: 'Catastrophic', effCrew: 'structural failure', assumptionIds: [] },                      // no signal
    { internalId: 'r4', fcId: 'FC-04', severity: 'Hazardous', effCrew: 'excessive workload text here', assumptionIds: ['AS-9'] }          // HFA slight beats text → gap
];
global.systemsData = [];
global.acFcimData = [{ tlId: 'FC-01', awareness: 'Unaware' }];
// Built through the REAL projection rather than a hand-rolled asmAll() stub.
// The old stub returned `type` and `hf`, which the real asmAll() does not — so
// _bandForFc silently never matched in production and always fell back to
// guessing a band from the crew-effect prose, with an authored band sitting
// unread in the file. See the note in tests/regression_hf_evidence.test.js.
global.acAssumptionsData = [
    { asmId: 'AS-9', text: 'Go-around workload', state: 'Proposed', type: 'Human Factors', hf: { workloadBand: 'slight' } }
];
global.aiAssumptions = [];
global.flightPhasesData = [];
require('../site/assumption_moat.js');
require('../site/hf_assumptions.js');

// engine first (real one), then the badge module extends it
require('../site/hf_severity_check.js');
const BADGE = require('../site/hf_severity_badge.js');
const E = global.HFSeverityCheck;

// ---- [1] engine parity -------------------------------------------------------
const engineFails = E.run().fails;
const rowFinds = acFhaData.map(r => BADGE.evalRow(r));
check('evalRow flags EXACTLY the rows the engine flags (no drift possible unnoticed)',
    engineFails.length === rowFinds.filter(Boolean).length &&
    rowFinds[0] !== null && rowFinds[1] === null && rowFinds[2] === null && rowFinds[3] !== null);
check('engine object gained evalRow (the helpers guard finds it)', typeof E.evalRow === 'function');

// ---- [2] evalRow semantics ---------------------------------------------------
const f1 = rowFinds[0];
check('finding carries band, source, implied severity and the material gap',
    f1.band === 'slight' && /crew-effect text/.test(f1.src) && f1.impliedSev === 'Minor' && f1.gap >= 2);
check('awareness carried as context (FCIM Unaware on FC-01)', f1.aware === 'Unaware');
check('HFA workload band takes precedence over the crew-effect text',
    rowFinds[3].band === 'slight' && /HFA AS-9/.test(rowFinds[3].src) && rowFinds[3].asmId === 'AS-9');
check('workload HIGHER than severity implies is never flagged (conservative direction only)',
    BADGE.evalRow({ internalId: 'x', fcId: 'X', severity: 'Minor', effCrew: 'excessive workload', assumptionIds: [] }) === null);

// ---- [3] badge rendering -----------------------------------------------------
const html = global.HFW_UI.badge(acFhaData[0], 'AC', f1);
check('badge renders with tooltip, click-through and the amber house chip',
    /hfw-badge/.test(html) && /HFW_UI\.open\('AC','r1'\)/.test(html) && /Workload versus severity/.test(html) && /#B7791F/.test(html));   // 3 Sep: named in words, not INV-HFW
check('no finding → no badge (empty string, not an invisible element)',
    global.HFW_UI.badge(acFhaData[1], 'AC', null) === '');
const src = S('hf_severity_badge.js');
check('the severity ladder is IMPORTED from the engine, never duplicated',
    /HFSeverityCheck\.BAND_TO_SEV/.test(src) && !/BAND_TO_SEV\s*=\s*\{/.test(src));
check('mirrored row logic is declared as a mirror and the honest history is stated',
    /mirrored from the engine/i.test(src) && /never committed to the repo/.test(src));

// ---- [4] actions -------------------------------------------------------------
let opened = null;
global.editACFHA = id => { opened = 'ac:' + id; };
global.editSysFHA = id => { opened = 'sys:' + id; };
global.switchTab = t => { opened = 'tab:' + t; };
global.document = { getElementById: () => null };
global.HFW_UI.act('AC', 'r1', 'severity');
check('severity action opens the AC row editor', opened === 'ac:r1');
global.HFW_UI.act('SYS', 's7', 'effect');
check('effect action opens the SYS row editor', opened === 'sys:s7');
global.HFW_UI.act('AC', 'r4', 'hfa');
check('hfa action routes to the HFA tab', opened === 'tab:hfa');
check('the badge module never writes a store (no assignments to *_Data, no autosave writes)',
    !/acFhaData\s*=|systemsData\s*=|\.push\(/.test(src.replace(/rows = rows\.concat/g, '')));

// ---- [5] wiring --------------------------------------------------------------
const idx = S('index.html'), help = S('helpers_modules.js');
check('index.html loads hf_severity_badge.js (the tag that 404ed now resolves)',
    /hf_severity_badge\.js\?v=/.test(idx));
check('helpers call sites intact — evalRow guard + HFW_UI.badge in BOTH scopes',
    help.split("HFSeverityCheck.evalRow) ? HFSeverityCheck.evalRow(row)").length === 3 &&
    help.split("HFW_UI.badge(row, 'AC'").length === 2 && help.split("HFW_UI.badge(row, 'SYS'").length === 2);

// ---- the authored band must actually reach the engine -----------------------
{
  const chk = fs.readFileSync(path.join(__dirname, '..', 'site', 'hf_severity_check.js'), 'utf8');
  const bdg = fs.readFileSync(path.join(__dirname, '..', 'site', 'hf_severity_badge.js'), 'utf8');
  check('the engine reads the TYPED projection, not asmAll',
    /asmAllTyped/.test(chk) && !/window\.asmAll\b/.test(chk));
  check('the badge does too', /asmAllTyped/.test(bdg) && !/window\.asmAll\b/.test(bdg));
  check('an AUTHORED band outranks the crew-effect text',
    (function () {
      const f = { internalId: 'rX', fcId: 'FC-09', severity: 'Hazardous',
                  effCrew: 'excessive workload text here', assumptionIds: ['AS-9'] };
      const got = BADGE.evalRow(f);
      return !!got && /HFA AS-9/.test(JSON.stringify(got));
    })(),
    'the whole point of authoring a band is that it beats a regex over prose');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

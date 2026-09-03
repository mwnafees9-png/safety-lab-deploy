#!/usr/bin/env node
/*
 * Regression — A10: interdependence at SYSTEM-FUNCTION granularity.
 *   Q.4-1 columns are system functions ('fn:<funcId>' cells); legacy
 *   system-keyed cells stay readable in a coarse system-level column and can
 *   only be refined (signed) or lifted — never silently expanded. Derivations
 *   land on a function ONLY when the data names it (trace on the function,
 *   providedByFunctions, sysFuncId); system-only facts stay visibly coarse.
 *   The idp LOGIC is executed here against a fixture — extracted from
 *   helpers_modules.js and run with injected state, so these are behavioural
 *   checks, not greps. The renderer, cycle flow, and sweep are pinned
 *   statically on top.
 * Run: node tests/regression_idp_functions.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const H = S('helpers_modules.js');
const M = S('misc_fn_modules.js');
const AI = S('interdep_ai.js');
const idx = S('index.html');

// ---- executable harness: run the idp logic with injected state --------------
const a = H.indexOf('function _idpCellKey');
const b = H.indexOf('function renderInterdepPage');
check('idp logic region extracts cleanly', a > 0 && b > a);
const logic = H.slice(a, b);
function makeIdp(state) {
  const factory = new Function('projectConfig', 'systemsData', 'resourcesData', 'acFhaData',
    logic + '\n return { _idpCellKey, _idpStore, _idpDerivedFn, _idpDerivedSysOnly, _idpCellRaw, idpColumns, idpCell, idpContributors, idpContributorFns, idpStats };');
  return factory(state.projectConfig, state.systemsData, state.resourcesData, state.acFhaData);
}
const FC = { internalId: 1, subId: 'SF-01', fcId: 'FC-AC01', severity: 'Catastrophic' };
function fixture(cells) {
  return {
    projectConfig: { interdep: { cells: cells || {}, cra: {} } },
    systemsData: [
      { id: 'sys-fcs', name: 'Flight control', functions: [
          { funcId: 'SFN-FCS1', funcName: 'Command surfaces', traceIds: ['SF-01'] },
          { funcId: 'SFN-FCS2', funcName: 'Provide feel', traceIds: [] }], fha: [] },
      { id: 'sys-eps', name: 'Electrical power', functions: [{ funcId: 'SFN-EPS1', funcName: 'Distribute power', traceIds: [] }],
        fha: [{ internalId: 9, fcId: 'FC-EPS1', acTrace: 'FC-AC01' }] },                       // UNKEYED sfha row → system-only
      { id: 'sys-bare', name: 'Bare system', functions: [], fha: [] },
      { id: 'sys-hyd', name: 'Hydraulics', functions: [{ funcId: 'SFN-HYD1', funcName: 'Provide pressure', traceIds: [] }],
        fha: [{ internalId: 8, fcId: 'FC-HYD1', acTrace: 'FC-AC01', sysFuncId: 'SFN-HYD1' }] }, // KEYED sfha row → function-level
    ],
    resourcesData: [
      { internalId: 'r1', resId: 'RES-1', name: '28VDC', providedBy: ['sys-eps'], providedByFunctions: ['SFN-EPS1'], consumedBy: [], consumedBySystems: ['sys-fcs'] },
      { internalId: 'r2', resId: 'RES-2', name: 'Bleed', providedBy: ['sys-bare'], consumedBy: ['SF-01'], consumedBySystems: [] },
    ],
    acFhaData: [FC],
  };
}

const I = makeIdp(fixture({ '1§sys-eps': { state: 'asserted', by: 'W' } }));
const cols = I.idpColumns();
const colIds = cols.map(c => c.colId);
check('columns are the declared system functions', ['fn:SFN-FCS1', 'fn:SFN-FCS2', 'fn:SFN-EPS1', 'fn:SFN-HYD1'].every(c => colIds.includes(c)));
check('a legacy-keyed system gets a system-level column', colIds.includes('sys-eps') && cols.find(c => c.colId === 'sys-eps').legacy === true);
check('a functionless system gets a system-level column', colIds.includes('sys-bare'));
check('a clean fn-covered system gets NO system-level column', !colIds.includes('sys-fcs') && !colIds.includes('sys-hyd'));

check('implements lands on THE tracing function', I._idpCellRaw(FC, 'fn:SFN-FCS1').kind === 'implements' && I._idpCellRaw(FC, 'fn:SFN-FCS1').state === 'contributes');
check('a sibling function of the same system stays unreviewed', I._idpCellRaw(FC, 'fn:SFN-FCS2').state === 'unreviewed');
check('a DECLARED provider function derives the resource fact', I._idpCellRaw(FC, 'fn:SFN-EPS1').kind === 'resource');
check('an UNDECLARED provider stays a coarse system-level fact', (I._idpCellRaw(FC, 'sys-bare') || {}).kind === 'resource' && I._idpCellRaw(FC, 'sys-bare').coarse === true);
check('a sysFuncId-KEYED SFHA row derives on its function', I._idpCellRaw(FC, 'fn:SFN-HYD1').kind === 'sfha');
check('an UNKEYED SFHA row stays system-level, never guessed onto a function',
  I._idpCellRaw(FC, 'fn:SFN-EPS1').kind !== 'sfha' && (I._idpDerivedSysOnly(FC, 'sys-eps') || {}).kind === 'sfha');
check('legacy manual assert wins its column and is flagged legacy',
  I._idpCellRaw(FC, 'sys-eps').kind === 'asserted' && I._idpCellRaw(FC, 'sys-eps').legacy === true);

check('idpCell(system id) keeps its PRE-A10 aggregate meaning for old callers',
  I.idpCell(FC, 'sys-fcs').state === 'contributes' && I.idpCell(FC, 'sys-eps').state === 'contributes');
check('idpContributors still answers in SYSTEMS (CRA/MF&MS compat)',
  JSON.stringify(I.idpContributors(FC).sort()) === JSON.stringify(['sys-bare', 'sys-eps', 'sys-fcs', 'sys-hyd']));
check('idpContributorFns answers the Q.4-1 question in FUNCTIONS',
  JSON.stringify(I.idpContributorFns(FC).sort()) === JSON.stringify(['SFN-EPS1', 'SFN-FCS1', 'SFN-HYD1']));
const st = I.idpStats();
check('stats count FC × COLUMN cells with a coarse tally', st.columns === 6 && st.cells === 6 && st.contributes === 5 && st.unreviewed === 1 && st.coarse >= 2);
check('multi counts DISTINCT SYSTEMS ≥ 2 (the MF&MS/MAC trigger)', st.multi === 1);

const I2 = makeIdp(fixture({ '1§fn:SFN-FCS1': { state: 'cleared', by: 'W' } }));
check('cleared cannot suppress a derived fact on a function column (conflict flagged)',
  I2._idpCellRaw(FC, 'fn:SFN-FCS1').state === 'contributes' && I2._idpCellRaw(FC, 'fn:SFN-FCS1').conflict === true);
const I3 = makeIdp(fixture({}));
check('with no legacy keys, sys-eps still gets its column from the unkeyed SFHA fact',
  I3.idpColumns().some(c => c.colId === 'sys-eps' && c.legacy));

// ---- renderer statics (rule 11 lives in the executed logic above) -----------
const rvi = (H.match(/function renderInterdepPage[\s\S]*?\n}\n/) || [''])[0];
check('renderer draws the two-row grouped header (systems over function columns)',
  /rowspan="2"/.test(rvi) && /colspan="' \+ g\.cols\.length/.test(rvi));
check('renderer marks the system-level column ▣ sys and shades its cells',
  /▣ sys/.test(rvi) && /col\.legacy \? ' background:var\(--color-surface-2\);'/.test(rvi));
check('cells pass the COLUMN id to idpCycleCell', /idpCycleCell\(\\'' \+ esc\(String\(fc\.internalId\)\) \+ '\\',\\'' \+ esc\(String\(col\.colId\)\)/.test(rvi));
check('CRA columns are the contributing COLUMNS with fn labels', /craCols/.test(rvi) && /col\.sysName \+ ' · ' \+ col\.fnName/.test(rvi));
check('resource P cells carry the provider-function ᶠ chip', /idpDeclareResProviderFn/.test(rvi) && /providedByFunctions/.test(rvi));
check('legend explains the coarse system-level state', /system-level \(coarse — refine to a function\)/.test(rvi));

// ---- cycle flow statics -----------------------------------------------------
const cyc = (M.match(/async function idpCycleCell[\s\S]*?\n}/) || [''])[0];
check('legacy column never takes a NEW review', /assert on one of/.test(cyc) && /FUNCTION columns instead/.test(cyc));
check('legacy refine moves the review onto a fn: key and deletes the legacy key',
  /'fn:' \+ fns\[n - 1\]\.funcId/.test(cyc) && /refined from system-level review/.test(cyc) && /delete store\.cells\[key\]/.test(cyc));
check('refinement is signed', /Sign the refinement/.test(cyc));
check('idpDeclareResProviderFn toggles providedByFunctions', /providedByFunctions\.push\(fid\)/.test(M) && /providedByFunctions\.splice\(at, 1\)/.test(M));

// ---- AI sweep statics -------------------------------------------------------
check('sweep candidates are non-legacy FUNCTION columns via the raw resolver',
  /idpColumns\(\)\.filter\(c => !c\.legacy\)/.test(AI) && /_idpCellRaw\(fc, col\.colId\)\.state === 'unreviewed'/.test(AI));
check('sweep contract and write path are keyed by colId', /"cells":\[\{"colId"/.test(AI) && /_idpCellKey\(fc\.internalId, c\.colId\)/.test(AI));
check('sweep never overwrites — raw-state guard survives', /_idpCellRaw\(fc, c\.colId\)\.state !== 'unreviewed'/.test(AI));

// ---- pins (rule 12) ---------------------------------------------------------
const pin = name => parseFloat(((idx.match(new RegExp(name.replace('.', '\\.') + '\\?v=([0-9.]+)')) || [])[1]) || '0');
check('helpers ≥ 2.45', pin('helpers_modules.js') >= 2.45);
check('misc_fn ≥ 66.35', pin('misc_fn_modules.js') >= 66.35);
check('interdep_ai ≥ 1.1', pin('interdep_ai.js') >= 1.1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

#!/usr/bin/env node
/*
 * regression_hf_mfc.test.js — Minimum Flight Crew workload analysis (§25.1523 / Appendix D).
 * New HF lane (hf_analyses.js). Verifies the Appendix D content is verbatim and complete,
 * the findings JOIN live data (Function Allocation) and fire on the real conditions, and the
 * nav/view/plan wiring is in place. Executes the REAL module (module.exports API).
 * Run: node tests/regression_hf_mfc.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const API = require(path.join(SITE, 'hf_analyses.js'));
const src = R('hf_analyses.js');

// ---- Appendix D content, verbatim + complete ----
check('six Appendix D basic workload functions, exact labels', (function () {
  const want = ['Flight path control','Collision avoidance','Navigation','Communications','Operation and monitoring of aircraft engines and systems','Command decisions'];
  const got = API.MFC_FUNCTIONS.map(f => f.label);
  return got.length === 6 && want.every((w, i) => got[i] === w);
})(), JSON.stringify(API.MFC_FUNCTIONS.map(f=>f.label)));
check('ten Appendix D workload factors present', API.MFC_FACTORS.length === 10);
check('factor (10) is crewmember incapacitation', /[Ii]ncapacitation/.test(API.MFC_FACTORS[9]));
check('module cites §25.1523 and Appendix D', /§25\.1523/.test(src) && /Appendix D/.test(src));

// helper to reset a project
function proj(hf) { global.projectConfig = { hf: hf || {} }; }

// ---- findings: empty project ----
proj({});
{
  const f = API.mfcFindings();
  check('empty project: all six functions unassigned, ten factors open', f.unassigned.length === 6 && f.openFactors.length === 10);
  check('empty project: no incapacitation flag (no determination yet)', f.incap === false);
}

// ---- findings: assign roles + Bedford + factors + conclusion via the real setters ----
proj({});
API.MFC_FUNCTIONS.forEach(fn => { API.setMfcFn(fn.key, 'role', 'PF'); });
API.setMfcFn('fpc', 'bedford', '8');                 // high-workload trip
for (let i = 0; i < 10; i++) API.setMfcFactor(i, 'considered — OK');
API.setMfcConclusion('minCrew', '2 pilots');
{
  const f = API.mfcFindings();
  check('all assigned + all factors dispositioned: no unassigned, no open factors', f.unassigned.length === 0 && f.openFactors.length === 0);
  check('Bedford 8 raises the HIGH WORKLOAD finding', f.high.indexOf('Flight path control') !== -1);
  check('two-crew determination with factor (10) dispositioned: no incap flag', f.incap === false);
}

// ---- incapacitation must be dispositioned once determination is >=2 ----
proj({});
API.setMfcConclusion('minCrew', '2 pilots');
for (let i = 0; i < 9; i++) API.setMfcFactor(i, 'ok');   // factor (10) [index 9] left blank
{
  const f = API.mfcFindings();
  check('two-crew determination with factor (10) BLANK trips the incapacitation finding', f.incap === true);
}

// ---- crew-heavy vs single-pilot: joins the live Function Allocation lane ----
proj({ alloc: { rows: Array.from({ length: 9 }, (_, i) => ({ key: 'F' + i, allocation: 'Crew' })) } });
API.setMfcConclusion('minCrew', '1 pilot');
{
  const f = API.mfcFindings();
  check('9 Crew allocations + single-pilot determination trips CREW-HEAVY (joins alloc lane)', f.crewHeavy === true && f.crewCount === 9);
}

// ---- wiring ----
check('renderMfc joined the switchTab VIEWS map (hfa-mfc)', /'hfa-mfc':\s*renderMfc/.test(src));
check('index.html has the MFC nav, view and host', (function () {
  const h = R('index.html');
  return /snav-hfa-mfc/.test(h) && /view-hfa-mfc/.test(h) && /hfa-mfc-host/.test(h);
})());
check('program_plan carries the hfa-mfc sub-lane', /id: 'hfa-mfc'/.test(R('program_plan.js')));

// ---- CSV export (fast-follow) ----
check('renderMfc exposes an Export CSV button', /exportData\(\\?'HF_MFC\\?'/.test(src));
check('MFC_FUNCTIONS and MFC_FACTORS are exported for the CSV builder', Array.isArray(API.MFC_FUNCTIONS) && Array.isArray(API.MFC_FACTORS));
{
  const d = R('data_ops_modules.js');
  check('data_ops: HF_MFC case reads the mfc store', /case 'HF_MFC'/.test(d) && /_read\('mfc'\)/.test(d));
  check('HF_MFC export covers functions, factors AND the determination', /Basic workload function/.test(d) && /Workload factor/.test(d) && /Minimum flight crew/.test(d));
  check('HF_MFC export refuses an empty determination', /No minimum-flight-crew determination authored yet/.test(d));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/*
 * regression_hf_cd.test.js — §25.1302 Controls & Displays lane (hf_analyses.js).
 * New HF sub-lane with FULL CRUD. Executes the REAL module (module.exports API):
 * add/edit(validated)/delete, the coverage findings across the four §25.1302
 * considerations, and every wiring pin (API, VIEWS, index.html nav/view/host/recbar,
 * program_plan, CSV export, and the hf.improve recommender lane).
 * Run: node tests/regression_hf_cd.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const API = require(path.join(SITE, 'hf_analyses.js'));
const src = R('hf_analyses.js');
const idx = R('index.html');
const pp = R('program_plan.js');
const dops = R('data_ops_modules.js');
const ai = R('ai_assistant.js');

console.log('1. constants & grounding');
check('five control/display kinds', API.CD_KINDS && API.CD_KINDS.length === 5);
check('four §25.1302 considerations (a)-(d)', (function () {
  const c = API.CD_CONSIDERATIONS || [];
  return c.length === 4 && /^\(a\)/.test(c[0]) && /^\(b\)/.test(c[1]) && /^\(c\)/.test(c[2]) && /^\(d\)/.test(c[3]);
})(), JSON.stringify(API.CD_CONSIDERATIONS));
check('module cites §25.1302 and AC 25.1302-1', /§25\.1302/.test(src) && /AC 25\.1302-1/.test(src));

function proj(hf) { global.projectConfig = { hf: hf || {} }; }

console.log('2. CRUD — executed against the real store');
proj({});
API.addCd();
let rows = API._read('cd').rows;
check('CREATE: addCd appends one row with an id, default kind Control, status Open',
  rows.length === 1 && /^CD-0*1$/.test(rows[0].cdId) && rows[0].kind === 'Control' && rows[0].status === 'Open');
API.setCd(0, 'item', 'PFD airspeed tape');
check('UPDATE: setCd writes a free-text field', API._read('cd').rows[0].item === 'PFD airspeed tape');
API.setCd(0, 'kind', 'Display');
API.setCd(0, 'kind', 'Bogus');
check('UPDATE guard: an off-list kind is rejected, the valid one stands', API._read('cd').rows[0].kind === 'Display');
API.setCd(0, 'consideration', API.CD_CONSIDERATIONS[3]);
API.setCd(0, 'consideration', 'not a real consideration');
check('UPDATE guard: an off-list consideration is rejected', API._read('cd').rows[0].consideration === API.CD_CONSIDERATIONS[3]);
API.setCd(0, 'status', 'Closed');
API.setCd(0, 'status', 'Weird');
check('UPDATE guard: an off-list status is rejected', API._read('cd').rows[0].status === 'Closed');
API.addCd();
check('CREATE: second row id increments to CD-2', API._read('cd').rows[1].cdId === 'CD-002');
API.removeCd(0);
rows = API._read('cd').rows;
check('DELETE: removeCd drops the row, the other survives', rows.length === 1 && rows[0].cdId === 'CD-002');

console.log('3. coverage findings across the four considerations');
proj({});
let f = API.cdFindings();
check('empty lane: all four considerations are gaps, count 0, none open', f.gaps.length === 4 && f.count === 0 && f.open.length === 0);
// author rows covering two distinct considerations, one left Open
API.addCd(); API.setCd(0, 'consideration', API.CD_CONSIDERATIONS[0]); API.setCd(0, 'status', 'Closed');
API.addCd(); API.setCd(1, 'consideration', API.CD_CONSIDERATIONS[2]);
f = API.cdFindings();
check('two considerations covered => two gaps remain (mutation-sensitive)', f.gaps.length === 2,
  'gaps=' + JSON.stringify(f.gaps));
check('the remaining gaps are exactly (b) and (d)',
  f.gaps.indexOf(API.CD_CONSIDERATIONS[1]) >= 0 && f.gaps.indexOf(API.CD_CONSIDERATIONS[3]) >= 0);
check('open count reflects the not-Closed row', f.open.length === 1 && f.count === 2);
API.addCd(); API.setCd(2, 'consideration', '');
check('a row with no consideration is unconsidered, not a phantom coverage', API.cdFindings().unconsidered.length === 1);

console.log('4. wiring pins');
check('API exports full CRUD + findings', ['addCd','setCd','removeCd','renderCd','cdFindings'].every(k => typeof API[k] === 'function'));
check('VIEWS map routes hfa-cd to renderCd', /'hfa-cd': renderCd/.test(src));
check('index.html: nav entry', /id="snav-hfa-cd"/.test(idx) && /switchTab\('hfa-cd'\)/.test(idx));
check('index.html: view container + host', /id="view-hfa-cd"/.test(idx) && /id="hfa-cd-host"/.test(idx));
// 2 Sep 2026 — the in-lane recommender button is no longer hand-placed in index.html.
// lane_ai_bar.js mounts one from a registry so all nine HF lanes and every safety lane
// share ONE mechanism instead of nine copies. The invariant is unchanged — this lane has
// a reachable AI action — so the check moved to the surface that now provides it.
check('the cd lane is wired for an in-lane AI button', /'Controls & Displays':\s*'hfa-cd'/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'site/lane_ai_bar.js'), 'utf8')));
check('program_plan: hfa-cd sub-lane entry', /id: 'hfa-cd'/.test(pp) && /snav-hfa-cd/.test(pp));
check('data_ops: HF_ControlsDisplays CSV export reads the cd store', /case 'HF_ControlsDisplays'/.test(dops) && /_read\('cd'\)/.test(dops));
check('ai_assistant: cd recommender lane reads the cd store via cdFindings',
  /cd:     \{ name: 'Controls & Displays'[\s\S]*?readKey: 'cd'[\s\S]*?findings: 'cdFindings'/.test(ai));

console.log('\n' + (fail ? ('FAIL — ' + fail + ' failed, ' + pass + ' passed') : ('OK — all ' + pass + ' checks pass')));
process.exit(fail ? 1 : 0);

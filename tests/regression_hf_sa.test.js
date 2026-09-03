#!/usr/bin/env node
/*
 * regression_hf_sa.test.js — Situation-Awareness lane (hf_analyses.js).
 * New HF sub-lane, FULL CRUD, executed against the REAL module (module.exports):
 * add/edit(validated)/delete, findings (SA-level coverage + elements with no cue),
 * and every wiring pin (API, VIEWS, index.html, program_plan, CSV export, hf.improve lane).
 * Run: node tests/regression_hf_sa.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const API = require(path.join(SITE, 'hf_analyses.js'));
const src = R('hf_analyses.js'), idx = R('index.html'), pp = R('program_plan.js'), dops = R('data_ops_modules.js'), ai = R('ai_assistant.js');

console.log('1. constants & grounding');
check('three SA levels (perception / comprehension / projection)', (function () {
  const l = API.SA_LEVELS || [];
  return l.length === 3 && /Perception/.test(l[0]) && /Comprehension/.test(l[1]) && /Projection/.test(l[2]);
})(), JSON.stringify(API.SA_LEVELS));
check('module grounds in §25.1302(a) / AC 25.1302-1', /§25\.1302\(a\)/.test(src) && /AC 25\.1302-1/.test(src));

function proj(hf) { global.projectConfig = { hf: hf || {} }; }

console.log('2. CRUD — executed against the real store');
proj({});
API.addSa();
let rows = API._read('sa').rows;
check('CREATE: addSa appends a row with id, default level L1 Perception, status Open',
  rows.length === 1 && /^SA-0*1$/.test(rows[0].saId) && rows[0].level === 'L1 Perception' && rows[0].status === 'Open');
API.setSa(0, 'element', 'airspeed trend');
check('UPDATE: setSa writes a free-text field', API._read('sa').rows[0].element === 'airspeed trend');
API.setSa(0, 'level', 'L3 Projection');
API.setSa(0, 'level', 'L9 Nonsense');
check('UPDATE guard: an off-list level is rejected', API._read('sa').rows[0].level === 'L3 Projection');
API.setSa(0, 'status', 'Closed');
API.setSa(0, 'status', 'Bogus');
check('UPDATE guard: an off-list status is rejected', API._read('sa').rows[0].status === 'Closed');
API.addSa();
API.removeSa(0);
rows = API._read('sa').rows;
check('DELETE: removeSa drops the row, the other survives', rows.length === 1 && rows[0].saId === 'SA-002');

console.log('3. findings — level coverage + no-cue risk');
proj({});
let f = API.saFindings();
check('empty lane: all three levels are gaps, count 0', f.levelGaps.length === 3 && f.count === 0 && f.noCue.length === 0);
API.addSa(); API.setSa(0, 'element', 'engine-out annunciation'); API.setSa(0, 'level', 'L1 Perception'); API.setSa(0, 'cue', 'MASTER WARNING'); API.setSa(0, 'status', 'Closed');
API.addSa(); API.setSa(1, 'element', 'terrain closure rate'); API.setSa(1, 'level', 'L3 Projection'); // no cue on purpose
f = API.saFindings();
check('two levels covered => one gap remains (L2), mutation-sensitive', f.levelGaps.length === 1 && /Comprehension/.test(f.levelGaps[0]),
  'gaps=' + JSON.stringify(f.levelGaps));
check('an element naming no cue is flagged (info with no means to perceive it)', f.noCue.length === 1 && /terrain/.test(f.noCue[0].element));
check('open count reflects the not-Closed row', f.open.length === 1 && f.count === 2);

console.log('4. wiring pins');
check('API exports full CRUD + findings', ['addSa','setSa','removeSa','renderSa','saFindings'].every(k => typeof API[k] === 'function'));
check('VIEWS map routes hfa-sa to renderSa', /'hfa-sa': renderSa/.test(src));
check('index.html: nav + view + host', /id="snav-hfa-sa"/.test(idx) && /id="view-hfa-sa"/.test(idx) && /id="hfa-sa-host"/.test(idx));
// 2 Sep 2026 — the in-lane recommender button is no longer hand-placed in index.html.
// lane_ai_bar.js mounts one from a registry so all nine HF lanes and every safety lane
// share ONE mechanism instead of nine copies. The invariant is unchanged — this lane has
// a reachable AI action — so the check moved to the surface that now provides it.
check('the sa lane is wired for an in-lane AI button', /'Situation Awareness':\s*'hfa-sa'/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'site/lane_ai_bar.js'), 'utf8')));
check('program_plan: hfa-sa sub-lane entry', /id: 'hfa-sa'/.test(pp) && /snav-hfa-sa/.test(pp));
check('data_ops: HF_SituationAwareness CSV export reads the sa store', /case 'HF_SituationAwareness'/.test(dops) && /_read\('sa'\)/.test(dops));
check('ai_assistant: sa recommender lane reads the sa store via saFindings',
  /sa:     \{ name: 'Situation Awareness'[\s\S]*?readKey: 'sa'[\s\S]*?findings: 'saFindings'/.test(ai));

console.log('\n' + (fail ? ('FAIL — ' + fail + ' failed, ' + pass + ' passed') : ('OK — all ' + pass + ' checks pass')));
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/*
 * Regression — vv_validation.js v2.0 (ARP-G2: the §5.4.3/§5.4.4 split).
 *
 * Loads the REAL module with stub globals and locks the G-2 contract:
 *   [1] §5.4.3 is AUTHORED, not auto-ticked: six aspects, yes/no/n-a; a
 *       'no' or 'n-a' without a note is REFUSED; withdraw works.
 *   [2] the conclusion ladder has teeth: at high rigor, passing lints +
 *       a SIGNATURE alone is still AWAITING (the signature cannot stand
 *       in for the judgment); authored 6/6 + signature (+independence
 *       for Cat/Haz) → VALID; an authored NO → FLAGGED whatever else
 *       is signed; lint failures still FLAG a signed row (v1 rule kept).
 *   [3] basic rigor unchanged: lints pass → valid, no checklist demanded.
 *   [4] §5.4.4: the authored set-level completeness judgment — check #6
 *       fails until judged; a short basis is REFUSED; withdraw works;
 *       computed checks 1–5 remain.
 *   [5] INV-40 (advisory): Verified-but-not-VALID requirements are named;
 *       posture carries authored/judgedSets counts; PSSA gate reads them.
 *   [6] wiring: index.html buster ≥2.0, store rides projectConfig.reqVal
 *       only (no new persistence sites), back-compat with v1 records.
 *
 * Run:  node tests/regression_vv_split.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- stub world --------------------------------------------------------------
globalThis.window = globalThis;
globalThis.projectConfig = {};
globalThis.acFhaData = [
  { internalId: 'FC1', fcId: 'FC-001', severity: 'Catastrophic' },
  { internalId: 'FC2', fcId: 'FC-002', severity: 'Major' },
  { internalId: 'FC3', fcId: 'FC-003', severity: 'Minor' },
];
globalThis.acReqData = [
  { internalId: 'R1', id: 'REQ-1', traceIds: ['FC-001'], text: 'The system shall limit pitch rate to 5 deg/s.', verifMethod: 'Test' },
  { internalId: 'R2', id: 'REQ-2', traceIds: ['FC-002'], text: 'The display shall annunciate failure within 2 s.', verifMethod: 'Test' },
  { internalId: 'R3', id: 'REQ-3', traceIds: ['FC-003'], text: 'The lamp shall use 28 V supply.', verifMethod: 'Inspection' },
];
globalThis.systemsData = [];
globalThis.acAssumptionsData = [];
globalThis.CKPT_CHECKLISTS = { PSSA: [] };
const _invs = [];
globalThis.invRegister = inv => _invs.push(inv);
globalThis.saveState = () => {};
globalThis.showToast = () => {};
globalThis.document = undefined;   // no DOM — engine lanes must not care

(0, eval)(S('vv_validation.js'));
const G = globalThis;
const setAC = () => G.vvSets()[0];
const R1 = acReqData[0], R2 = acReqData[1], R3 = acReqData[2];

console.log('\n[1] §5.4.3 authored checklist — six aspects, notes demanded');
check('six aspects, original wording (correct/complete/unambig/feasible/consistent/level)',
  G.VV_ASPECTS.length === 6 && ['correct','complete','unambig','feasible','consistent','level'].every(id => G.VV_ASPECTS.some(a => a.id === id)));
check('fresh requirement: 0/6 authored, not complete',
  G.vvChecklistState(R1).answered === 0 && !G.vvChecklistState(R1).complete);
check('a NO without a note is REFUSED (a bare NO is a complaint, not a finding)',
  G.vvAnswer('aircraft', 'R1', 'correct', 'no', '') === false && G.vvChecklistState(R1).answered === 0);
check('an N-A without a note is REFUSED',
  G.vvAnswer('aircraft', 'R1', 'correct', 'na', ' ') === false);
check('a YES records; a NO with a note records',
  G.vvAnswer('aircraft', 'R1', 'correct', 'yes') === true &&
  G.vvAnswer('aircraft', 'R1', 'feasible', 'no', 'demands 0.1 ms latency the bus cannot give') === true &&
  G.vvChecklistState(R1).answered === 2 && G.vvChecklistState(R1).noes.length === 1);
check('withdraw (ans=null) removes the answer',
  G.vvAnswer('aircraft', 'R1', 'feasible', null) === true && G.vvChecklistState(R1).answered === 1);
check('unknown aspect refused', G.vvAnswer('aircraft', 'R1', 'vibes', 'yes') === false);

console.log('\n[2] the conclusion ladder has teeth');
// R1 traces to Catastrophic → rigor 'independent'
check('Cat trace → rigor demands authored checklist + independent attestation',
  G.vvRigor(R1).level === 'independent' && /authored checklist/.test(G.vvRigor(R1).label));
// signature alone (v1-style record), checklist incomplete → awaiting
projectConfig.reqVal['R1'] = Object.assign(projectConfig.reqVal['R1'] || {}, { by: 'M. Signer', at: '2026-07-26T09:00:00Z', independent: true });
let c = G.reqValConclusion(R1, setAC());
check('signature + incomplete checklist → AWAITING (signature cannot stand in for the judgment)',
  c.conclusion === 'awaiting' && /cannot stand in/.test(c.detail), c.conclusion + ' — ' + c.detail);
// author the remaining five
['complete','unambig','feasible','consistent','level'].forEach(id => G.vvAnswer('aircraft', 'R1', id, 'yes'));
c = G.reqValConclusion(R1, setAC());
check('authored 6/6 + signed + independent → VALID', c.conclusion === 'valid' && /authored 6\/6/.test(c.detail), c.detail);
// an authored NO flags even a fully signed row
G.vvAnswer('aircraft', 'R1', 'consistent', 'no', 'conflicts with REQ-7 hold-time');
c = G.reqValConclusion(R1, setAC());
check('authored NO → FLAGGED regardless of signature', c.conclusion === 'flagged' && /NO on Consistent/.test(c.detail));
G.vvAnswer('aircraft', 'R1', 'consistent', 'yes');
// independence demanded but not claimed
projectConfig.reqVal['R1'].independent = false;
c = G.reqValConclusion(R1, setAC());
check('Cat/Haz without the independence claim → AWAITING', c.conclusion === 'awaiting' && /independence not claimed/.test(c.detail));
projectConfig.reqVal['R1'].independent = true;
// v1 rule kept: signature over a failing lint
const bad = { internalId: 'RB', id: 'REQ-B', traceIds: ['FC-002'], text: 'Should be robust as appropriate', verifMethod: '' };
acReqData.push(bad);
projectConfig.reqVal['RB'] = { by: 'S. Hasty', at: '2026-07-26T09:00:00Z' };
c = G.reqValConclusion(bad, setAC());
check('signature over failing lints stays FLAGGED (v1 rule kept)', c.conclusion === 'flagged' && /failing check/.test(c.detail));
acReqData.pop(); delete projectConfig.reqVal['RB'];

console.log('\n[3] basic rigor unchanged');
c = G.reqValConclusion(R3, setAC());
check('Minor trace → automatic checks suffice, VALID with no checklist',
  G.vvRigor(R3).level === 'basic' && c.conclusion === 'valid' && G.vvChecklistState(R3).answered === 0);

console.log('\n[4] §5.4.4 authored set judgment');
let comp = G.vvSetCompleteness(setAC());
const jRow = comp.checks.find(x => x.id === 'judgment');
check('check #6 exists and FAILS until judged', comp.checks.length === 6 && jRow && !jRow.pass && /SAYS so/.test(jRow.detail));
check('a short basis is REFUSED', G.vvJudgeSet('aircraft', 'W. Lead', 'looks fine') === false && !G.vvSetJudgment('aircraft'));
check('signature required', G.vvJudgeSet('aircraft', '', 'reviewed FHA coverage, derived rationale, parent decomposition') === false);
check('a proper judgment records with basis and signer',
  G.vvJudgeSet('aircraft', 'W. Lead', 'reviewed FHA coverage, derived rationale, parent decomposition against the function list') === true &&
  G.vvSetJudgment('aircraft').by === 'W. Lead');
comp = G.vvSetCompleteness(setAC());
check('judged → check #6 passes and carries the basis',
  comp.checks.find(x => x.id === 'judgment').pass && /reviewed FHA coverage/.test(comp.checks.find(x => x.id === 'judgment').detail));
check('computed checks 1–5 still present (coverage/derived/assumptions/correctness/rigor)',
  ['coverage','derived','assumptions','correctness','rigor'].every(id => comp.checks.some(x => x.id === id)));
check('withdraw removes the judgment', G.vvJudgeSet('aircraft') === true && !G.vvSetJudgment('aircraft'));
G.vvJudgeSet('aircraft', 'W. Lead', 'reviewed FHA coverage, derived rationale, parent decomposition against the function list');

console.log('\n[5] INV-40 + posture + gate');
const inv40 = _invs.find(i => i.id === 'INV-40');
check('INV-40 registered as advisory', !!inv40 && inv40.sev === 'advisory');
R2.verifStatus = 'Verified';   // R2 is Major-rigor, checklist not authored → not valid
let res = inv40.run();
check('Verified-but-not-VALID requirement is NAMED by INV-40',
  res.fails.length === 1 && /REQ-2/.test(res.fails[0]) && /confirming the wrong thing well/.test(res.fails[0]));
// make R2 valid: author + attest
['correct','complete','unambig','feasible','consistent','level'].forEach(id => G.vvAnswer('aircraft', 'R2', id, 'yes'));
projectConfig.reqVal['R2'] = Object.assign(projectConfig.reqVal['R2'] || {}, { by: 'A. Other', at: '2026-07-26T10:00:00Z' });
res = inv40.run();
check('valid + Verified → INV-40 silent', res.fails.length === 0 && res.checked === 3);
const p = G.vvProgramPosture();
check('posture carries authored + judgedSets counts', p.authored === 2 && p.judgedSets === 1 && p.valid === 3, JSON.stringify({ a: p.authored, j: p.judgedSets, v: p.valid }));
const gate = CKPT_CHECKLISTS.PSSA.find(i => i.id === 'val');
const g = gate.eval();
check('PSSA gate item reads the full posture (valid/authored/sets/judged)',
  !!gate && /3\/3 valid/.test(g.detail) && /2\/3 authored/.test(g.detail) && /1 judged/.test(g.detail), g.detail);
check('gate passes only when nothing is owed', g.pass === true);

console.log('\n[6] wiring + honesty');
const src = S('vv_validation.js');
check('index.html buster advanced to v2', /vv_validation\.js\?v=2\./.test(S('index.html')));
check('state rides projectConfig.reqVal only — no new persistence sites',
  /projectConfig\.reqVal/.test(src) && !/localStorage\.setItem/.test(src));
check('the two lanes are declared: lints SEED, checklist AUTHORED, signature covers not replaces',
  /AUTHORED, not auto-ticked/.test(src) && /advisory seeds/i.test(src) && /cannot stand in for the judgment/.test(src));
check('back-compat: a bare v1 record {by,at} still counts as attested',
  (() => { projectConfig.reqVal['R3'] = { by: 'Old Style', at: '2026-01-01T00:00:00Z' };
           const cc = G.reqValConclusion(R3, setAC()); delete projectConfig.reqVal['R3'];
           return cc.attested === true; })());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

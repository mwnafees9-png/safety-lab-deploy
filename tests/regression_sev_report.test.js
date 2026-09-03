#!/usr/bin/env node
/*
 * Regression — eval/sev_report.mjs, the severity-commitment disagreement
 * instrument (31 Aug 2026). First run on the clean pair decomposed THE AXIS:
 * only 6/107 matched pairs were exact-text (condition WORDING variance is
 * dominant and upstream), commitment flips 52 vs committed class
 * disagreements 3 (all ±1 class, all anchored). These checks execute the real
 * tool on synthetic runs with KNOWN flips and assert every bucket, including
 * the text/signature match-quality tagging the interpretation depends on.
 * Run: node tests/regression_sev_report.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const mkRun = (rows) => ({ meta: {}, functions: [{ subId: 'SF-001', funcName: 'Provide thrust', subFunction: 'Provide thrust' }], fcim: [], assumptions: [],
  fha: rows.map((r, i) => ({ internalId: i + 1, subId: 'SF-001', ...r })) });
const A = mkRun([
  { fcId: 'FC-1', fcDesc: 'Complete loss of thrust', severity: 'Catastrophic', sevBasis: 'CAT-1' },   // exact-text pair, agree
  { fcId: 'FC-2', fcDesc: 'Partial loss of thrust', severity: 'Major', sevBasis: 'MAJ-1' },           // exact-text pair, class disagreement
  { fcId: 'FC-3', fcDesc: 'Uncommanded thrust increase', severity: 'Catastrophic', sevBasis: 'CAT-1' }, // exact-text, CAT flip (B abstains)
  { fcId: 'FC-4', fcDesc: 'Thrust asymmetry on approach', severity: '' },                              // exact-text, both abstain
  { fcId: 'FC-9', fcDesc: 'A condition only run A has', severity: 'Minor', sevBasis: 'MIN-1' },        // unmatched
]);
const B = mkRun([
  { fcId: 'FC-1', fcDesc: 'Complete loss of thrust', severity: 'Catastrophic', sevBasis: 'CAT-1' },
  { fcId: 'FC-2', fcDesc: 'Partial loss of thrust', severity: 'Hazardous', sevBasis: 'HAZ-1' },
  { fcId: 'FC-3', fcDesc: 'Uncommanded thrust increase', severity: '' },
  { fcId: 'FC-4', fcDesc: 'Thrust asymmetry on approach', severity: '' },
]);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sevrep-'));
fs.writeFileSync(path.join(tmp, 'a.json'), JSON.stringify(A));
fs.writeFileSync(path.join(tmp, 'b.json'), JSON.stringify(B));
const out = cp.spawnSync('node', [path.join(__dirname, '..', 'eval', 'sev_report.mjs'), path.join(tmp, 'a.json'), path.join(tmp, 'b.json'), '--json'], { encoding: 'utf8' });
check('the tool runs and exits 0 (a report, not a gate)', out.status === 0, String(out.status) + ' ' + (out.stderr || '').slice(0, 200));
let r = null; try { r = JSON.parse(out.stdout); } catch (_) {}
check('emits JSON', !!r);
if (r) {
  const t = r.totals;
  check('matches the four shared conditions', t.matched === 4, JSON.stringify(t));
  check('exact-text pairs counted (the clean judgment signal)', t.textPairs === 4);
  check('one committed class disagreement (Major <> Hazardous)', t.committedDisagreements === 1 &&
    r.committedDisagreements[0].a.severity === 'Major' && r.committedDisagreements[0].b.severity === 'Hazardous');
  check('one commitment flip (Catastrophic <> abstained)', t.commitmentFlips === 1);
  check('the flip is ALSO a CAT membership flip (the FTA-scope driver)', t.catMembershipFlips === 1);
  check('agree buckets: 1 committed + 1 abstained', t.agreeCommitted === 1 && t.agreeAbstained === 1);
  check('unmatched rows surfaced per side', t.unmatchedA === 1 && t.unmatchedB === 0 && r.unmatchedA[0].fcId === 'FC-9');
  check('every disagreement entry carries its match quality (how)', ['committedDisagreements','commitmentFlips','catMembershipFlips'].every(k => r[k].every(e => e.how === 'text' || e.how === 'signature')));
  check('per-bucket byMatch splits present (text vs signature)', t.disagreementsByMatch && t.disagreementsByMatch.text === 1 && t.flipsByMatch.text === 1);
}
const human = cp.spawnSync('node', [path.join(__dirname, '..', 'eval', 'sev_report.mjs'), path.join(tmp, 'a.json'), path.join(tmp, 'b.json')], { encoding: 'utf8' });
check('human output names the conflation caveat', /conflate condition-identity variance/.test(human.stdout));
check('human output tags lines TEXT vs sig', /\[TEXT\]/.test(human.stdout));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

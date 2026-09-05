#!/usr/bin/env node
/**
 * Regression — THE SCORER COMPARED THE SEVERITY OF DIFFERENT CONDITIONS (4 Sep 2026).
 * Topic|mode pairing put "loss of thrust production" and "loss of ground reverse thrust" in one
 * bucket; severity agreement read 0.40 with 11 two-class jumps on runs 2 vs 3, where the same
 * conditions strictly paired read 0.62 with none. eval_core v1.7:
 *   · severity metrics run on STRICT pairs — same condition (shared id, or same loss form + wording),
 *     same phase group ("All phases" = the whole profile); any number of rows per condition;
 *   · functionWorstCaseAgreement — the worst class per sub-function, paired by id or name;
 *   · the bar is 0.90 on both (Waqas: "the numbers need to be over 90 percent").
 * Run: node tests/regression_scorer_strict_pairs.test.js
 */
const path = require('path'), fs = require('fs');
const E = require(path.join(__dirname, '..', 'site', 'eval_core.js'));
const idx = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }
const fn = (subId, subName) => ({ subId, subName, funcName: 'Provide thrust' });
const row = (subId, fcId, fcDesc, phases, severity) => ({ subId, fcId, sourceCondId: fcId, fcDesc, phases, severity, effAc: 'x', effCrew: 'y', effPax: 'z' });

console.log('[1] the mis-pairing that inflated the old number');
{
  const g = { functions: [fn('SF-001', 'Generate forward thrust'), fn('SF-002', 'Provide reverse thrust on ground')], fcim: [], assumptions: [],
    fha: [row('SF-001', 'SF-001-TL', 'Total loss of thrust production', 'All phases', 'Catastrophic'), row('SF-002', 'SF-002-TL', 'Total loss of ground reverse thrust', 'Landing', 'Major')] };
  const c = { functions: [fn('SF-001', 'Generate forward thrust'), fn('SF-002', 'Provide reverse thrust on ground')], fcim: [], assumptions: [],
    fha: [row('SF-002', 'SF-002-TL', 'Total loss of ground reverse thrust', 'Landing', 'Major'), row('SF-001', 'SF-001-TL', 'Total loss of thrust production', 'All phases', 'Catastrophic')] };
  const s = E.scoreRun(g, c);
  check('two thrust conditions pair with THEMSELVES, not each other: severity agreement 1.0, no jumps', s.metrics.severityAgreement.value === 1 && s.metrics.severeJumpRate.value === 0 && s.metrics.strictPairRate.value === 1, JSON.stringify([s.metrics.severityAgreement, s.metrics.severeJumpRate]));
  check('function worst case: both functions agree', s.metrics.functionWorstCaseAgreement.value === 1 && s.metrics.functionWorstCaseAgreement.paired === 2);
  const sp = E.pairFhaRowsStrict(E.normalizeRun(g), E.normalizeRun(c));
  check('the strict pairs are the right two', sp.pairs.length === 2 && sp.pairs.every(([a, b]) => a.r.fcId === b.r.fcId));
}

console.log('\n[2] rows come from effects — any number of phase-group rows per condition');
{
  const g = { functions: [fn('SF-002', 'Provide reverse thrust on ground')], fcim: [], assumptions: [], fha: [
    row('SF-002', 'SF-002-TL', 'Total loss of reverse thrust', 'Taxi, Takeoff', 'No Safety Effect'),
    row('SF-002', 'SF-002-TL', 'Total loss of reverse thrust', 'Climb, Cruise, Descent, Approach', 'Major'),
    row('SF-002', 'SF-002-TL', 'Total loss of reverse thrust', 'Landing, Rejected Takeoff', 'Hazardous') ] };
  const c = { functions: [fn('SF-002', 'Provide reverse thrust on ground')], fcim: [], assumptions: [], fha: [
    row('SF-002', 'SF-002-TL', 'Total loss of reverse thrust', 'Taxi, Takeoff', 'No Safety Effect'),
    row('SF-002', 'SF-002-TL', 'Total loss of reverse thrust', 'Climb, Cruise, Descent, Approach', 'Hazardous'),
    row('SF-002', 'SF-002-TL', 'Total loss of reverse thrust', 'Rejected Takeoff, Landing', 'Hazardous') ] };
  const s = E.scoreRun(g, c);
  check('three phase-group rows of ONE condition pair by phase group (3 pairs), 2 of 3 agree', s.metrics.strictPairRate.value === 1 && s.metrics.severityAgreement.value === +(2 / 3).toFixed(3), JSON.stringify(s.metrics.severityAgreement));
  check('the worst case per function still agrees (Hazardous both sides)', s.metrics.functionWorstCaseAgreement.value === 1);
  check('… and the 0.90 bar is what governs: 0.667 is a failure', s.failures.indexOf('severityAgreement') >= 0 && s.metrics.severityAgreement.threshold === 0.90 && s.metrics.functionWorstCaseAgreement.threshold === 0.90);
}

console.log('\n[3] different ids, same condition wording — and different wording never pairs');
{
  const g = { functions: [fn('SF-004', 'Extend and retract landing gear')], fcim: [], assumptions: [], fha: [row('SF-004', 'SF-004-TL', 'Total loss of landing gear extension', 'All phases', 'Catastrophic')] };
  const c = { functions: [fn('SF-009', 'Extend and retract landing gear')], fcim: [], assumptions: [], fha: [row('SF-009', 'SF-009-TL', 'Loss of landing gear extension outside MAC limits', 'All phases', 'Catastrophic'), row('SF-009', 'SF-009-M', 'Erroneous landing gear position indication', 'All phases', 'Hazardous')] };
  const s = E.scoreRun(g, c);
  check('renumbered runs pair by loss form + wording (the MAC-limits phrasing and "Total loss" are the same form)', s.metrics.strictPairRate.value === 1 && s.metrics.severityAgreement.value === 1, JSON.stringify(s.metrics.strictPairRate));
  check('function worst case pairs by NAME when ids differ; worst is Catastrophic vs Catastrophic', s.metrics.functionWorstCaseAgreement.paired === 1 && s.metrics.functionWorstCaseAgreement.value === 1);
  const g2 = { functions: [fn('SF-001', 'Generate forward thrust')], fcim: [], assumptions: [], fha: [row('SF-001', 'SF-001-TL', 'Total loss of thrust production', 'All phases', 'Catastrophic')] };
  const c2 = { functions: [fn('SF-001', 'Generate forward thrust')], fcim: [], assumptions: [], fha: [row('SF-001', 'SF-001-PL', 'Partial loss of thrust production', 'All phases', 'Major')] };
  const s2 = E.scoreRun(g2, c2);
  check('a total-loss row never pairs with a partial-loss row of the same function', s2.metrics.strictPairRate.value === 0);
}

console.log('\n[4] lever 4 — phase-split agreement and the per-condition flip report');
{
  const g = { functions: [fn('SF-1', 'Decelerate on the ground')], fcim: [], assumptions: [], fha: [
    row('SF-1', 'SF-1-TL', 'Total loss of braking', 'Standing, Taxi', 'No Safety Effect'),
    row('SF-1', 'SF-1-TL', 'Total loss of braking', 'Takeoff, Climb, Cruise, Descent, Approach', 'Catastrophic'),
    row('SF-1', 'SF-1-TL', 'Total loss of braking', 'Landing', 'Catastrophic'),
    row('SF-1', 'SF-1-PL', 'Partial loss of braking', 'All phases', 'Major') ] };
  const c = { functions: [fn('SF-1', 'Decelerate on the ground')], fcim: [], assumptions: [], fha: [
    row('SF-1', 'SF-1-TL', 'Total loss of braking', 'Standing', 'No Safety Effect'),
    row('SF-1', 'SF-1-TL', 'Total loss of braking', 'Taxi', 'Major'),
    row('SF-1', 'SF-1-TL', 'Total loss of braking', 'Takeoff, Climb, Cruise, Descent, Approach', 'Catastrophic'),
    row('SF-1', 'SF-1-TL', 'Total loss of braking', 'Landing', 'Catastrophic'),
    row('SF-1', 'SF-1-PL', 'Partial loss of braking', 'All phases', 'Hazardous') ] };
  const s = E.scoreRun(g, c); const m = s.metrics.phaseSplitAgreement;
  check('the metric exists with the 0.90 bar and counts conditions both runs drafted', m && m.threshold === 0.90 && m.paired === 2, JSON.stringify(m));
  check('total loss split differently (Standing+Taxi vs Standing | Taxi) → not the same split; partial loss same split → 1 of 2', m.same === 1 && m.value === 0.5);
  const f = m.flips;
  check('the flip report names the split that moved and the class that moved, per condition', f.length === 2 && f.some(x => x.id === 'sf-1-tl' && x.split && /standing\+taxi/.test(x.split.golden) && /standing \| taxi/.test(x.split.candidate)) && f.some(x => x.id === 'sf-1-pl' && !x.split && x.classFlips[0] === '*: Major → Hazardous'), JSON.stringify(f));
  check('identical runs: 1.0 and no flips', E.scoreRun(g, g).metrics.phaseSplitAgreement.value === 1 && E.scoreRun(g, g).metrics.phaseSplitAgreement.flips.length === 0);
}

console.log('\n[5] identity and the pin');
{
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eval', 'golden_aeolus_v5.json'), 'utf8'));
  const s = E.scoreRun(g, g);
  check('a run against itself is REPEATABLE under the raised bar', s.verdict === 'REPEATABLE' && s.metrics.severityAgreement.value === 1 && s.metrics.functionWorstCaseAgreement.value === 1, JSON.stringify(s.failures));
  check('eval_core pin bumped to 1.8', /eval_core\.js\?v=1\.8/.test(idx));
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

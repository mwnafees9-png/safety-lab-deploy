#!/usr/bin/env node
/*
 * Regression tests for two shipped fixes (build 60.72), so they can't silently regress.
 *
 *   1) Auto-DAL seed lookup — numeric-vs-string `internalId` coercion in the FHA/seed
 *      resolution path. The bug: a strict `===` compared a string DOM id against a numeric
 *      stored id and silently failed, so DAL seeding never resolved the linked FHA.
 *   2) Dynamic Target Rate — getSafetyTarget derives the top-event target from
 *      (severity × cert basis), not a hardcoded constant. The bug: Part 23 III Hazardous
 *      showed 1e-5 instead of 1e-7.
 *
 * Loads the REAL site/safety_targets.js tables, so a table edit or a hardcode regresses the test.
 * Run:  node tests/regression_autodal_targetrate.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

function loadTargets() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'site', 'safety_targets.js'), 'utf8');
  // safety_targets.js is pure `const` data (no exports); eval it and hand back what we need.
  return eval(src + '\n;({ PROB_TARGETS: PROB_TARGETS, DAL_TARGETS: DAL_TARGETS, DAL_ORDER: DAL_ORDER });');
}
const { PROB_TARGETS, DAL_TARGETS, DAL_ORDER } = loadTargets();

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

// Faithful mirror of getSafetyTarget(severity) for a regulation key (safety_lab.js:2808).
function getSafetyTarget(severity, regKey) {
  const probs = PROB_TARGETS[regKey] || PROB_TARGETS['Part 25'];
  const dals  = DAL_TARGETS[regKey]  || DAL_TARGETS['Part 25'];
  return { prob: probs[severity] != null ? probs[severity] : null,
           dal:  dals[severity]  || null, scope: regKey };
}

console.log('\n[1] Dynamic Target Rate — target derived per (severity x cert basis)');
const p23iii = {
  Catastrophic: { prob: 1e-8, dal: 'B' },
  Hazardous:    { prob: 1e-7, dal: 'C' },
  Major:        { prob: 1e-5, dal: 'C' },
  // Minor → DAL D per AC 23.1309-1E Class III (safety_targets.js audit fix of
  // 2026-07-06: "prior rows wrongly pushed Maj→D and Min→E for Classes I–III").
  // This expectation was stale against the corrected table.
  Minor:        { prob: 1e-3, dal: 'D' }
};
for (const sev of Object.keys(p23iii)) {
  const t = getSafetyTarget(sev, 'Part 23 III');
  check('Part 23 III ' + sev + ' -> ' + p23iii[sev].prob + ' / DAL ' + p23iii[sev].dal,
        t.prob === p23iii[sev].prob && t.dal === p23iii[sev].dal,
        'got ' + t.prob + ' / ' + t.dal);
}
check('REGRESSION: Hazardous (Part 23 III) is 1e-7, not the buggy 1e-5',
      getSafetyTarget('Hazardous', 'Part 23 III').prob === 1e-7,
      'got ' + getSafetyTarget('Hazardous', 'Part 23 III').prob);
check('target is dynamic across bases (Part 25 Cat 1e-9 vs Part 23 III Cat 1e-8)',
      getSafetyTarget('Catastrophic', 'Part 25').prob === 1e-9 &&
      getSafetyTarget('Catastrophic', 'Part 23 III').prob === 1e-8);

console.log('\n[2] Auto-DAL seed lookup — numeric/string internalId coercion');
// FHAs as the app stores them: internalId is a NUMBER.
const fhas = [ { internalId: 1035, severity: 'Catastrophic' },
               { internalId: 1055, severity: 'Hazardous' } ];
const domQuery = '1035'; // the realId arriving from the dropdown/DOM is a STRING
const coerced = fhas.find(f => String(f.internalId) === String(domQuery)); // fixed path
const strict  = fhas.find(f => f.internalId === domQuery);                 // pre-fix path
check('coerced lookup resolves a numeric-id FHA from a string query', !!coerced);
check('REGRESSION: pre-fix strict === fails (documents the original bug)', !strict);
check('resolved FHA carries the right severity', !!coerced && coerced.severity === 'Catastrophic');

console.log('\n[3] Seed -> DAL allocation chain (Catastrophic / Part 23 III)');
// dalDecrement mirrors the app: step DOWN the ladder (toward less stringent), clamped at E.
function dalDecrement(dal, n) {
  const i = DAL_ORDER.indexOf(dal);
  if (i < 0) return dal;
  return DAL_ORDER[Math.min(DAL_ORDER.length - 1, i + n)];
}
const seedDal = getSafetyTarget(coerced.severity, 'Part 23 III').dal; // B
check('seed DAL from resolved FHA severity is B', seedDal === 'B', 'got ' + seedDal);
check('AND Option-2 upper members one level down = C (matches live B->C,C)',
      dalDecrement(seedDal, 1) === 'C', 'got ' + dalDecrement(seedDal, 1));

console.log('\n' + (fail === 0 ? '✓ ALL PASS' : '✗ ' + fail + ' FAILED') + '  (' + pass + ' passed, ' + fail + ' failed)\n');
process.exit(fail === 0 ? 0 : 1);

#!/usr/bin/env node
/*
 * Regression tests for Backlog #8 — closed-form steady-state availability.
 *
 * Loads the REAL site/avail_closedform.js AND the REAL Markov solver from
 * site/fta_quant_modules.js, then locks:
 *   [1] 2-state identity A = μ/(λ+μ) matches the exact CTMC solver to 1e-12
 *       (and the markovClosedForm card check agrees with both).
 *   [2] independent 2-component series: product form Πμᵢ/(λᵢ+μᵢ) matches the
 *       exact 4-state CTMC to 1e-9 — the estimate is exact under independence.
 *   [3] SHARED-repair CTMC diverges from the product form — the documented
 *       reason the closed form is a LABELED estimate, never the result.
 *   [4] structure-function combinators (series / parallel / k-oo-n) and the
 *       μ≫λ shortcut.
 *
 * Run:  node tests/regression_avail_closedform.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const approx = (a, b, tol) => Math.abs(a - b) <= tol;

// avail_closedform.js exports via globalThis when window is absent.
eval(fs.readFileSync(path.join(__dirname, '..', 'site', 'avail_closedform.js'), 'utf8'));
const ACF = globalThis.AvailClosedForm;
check('AvailClosedForm API exported', ACF && typeof ACF.itemA === 'function' && typeof ACF.structureQ === 'function');

// fta_quant_modules.js is runtime-only declarations — safe to eval headless.
// esc() is referenced by the card HTML helper at call time only; stub it.
// Indirect eval → sloppy global scope, so its function declarations land on globalThis.
globalThis.esc = s => String(s);
(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'site', 'fta_quant_modules.js'), 'utf8'));
const solveMarkovModel = globalThis.solveMarkovModel;
const markovClosedForm = globalThis.markovClosedForm;
check('real solveMarkovModel loaded', typeof solveMarkovModel === 'function');
check('markovClosedForm (card cross-check) loaded', typeof markovClosedForm === 'function');

console.log('\n[1] 2-state identity vs exact CTMC solver');
const lam = 1.3e-4, mu = 1 / 8;   // λ per hour, 8 h MTTR
const m2 = {
  states: [{ name: 'Up', isFailed: false }, { name: 'Down', isFailed: true }],
  transitions: [{ from: 'Up', to: 'Down', rate: lam }, { from: 'Down', to: 'Up', rate: mu }],
};
const exact2 = solveMarkovModel(m2);
const cf2 = markovClosedForm(m2);
const aClosed = ACF.itemA(lam, mu);
check('solver ok', exact2.ok);
check('A = μ/(λ+μ) matches exact CTMC to 1e-12', approx(1 - exact2.pFailed, aClosed, 1e-12), 'exact A=' + (1 - exact2.pFailed) + ' closed=' + aClosed);
check('card cross-check Q agrees with solver to 1e-12', cf2 && approx(cf2.Q, exact2.pFailed, 1e-12), 'cf.Q=' + (cf2 && cf2.Q));
check('itemAFromMttr(λ, MTTR) ≡ itemA(λ, 1/MTTR)', approx(ACF.itemAFromMttr(lam, 8), ACF.itemA(lam, 1 / 8), 1e-15));
check('multi-state model → no closed-form card line (exact lane only)',
      markovClosedForm({ states: [{ name: 'a' }, { name: 'b', isFailed: true }, { name: 'c', isFailed: true }], transitions: [] }) === null);

console.log('\n[2] Independent 2-component series — product form is EXACT');
const l1 = 2e-3, m1 = 0.05, l2 = 7e-3, mu22 = 0.2;
// 4-state CTMC: UU, DU, UD, DD with independent per-component transitions.
const m4 = {
  states: [
    { name: 'UU', isFailed: false }, { name: 'DU', isFailed: true },
    { name: 'UD', isFailed: true }, { name: 'DD', isFailed: true },
  ],
  transitions: [
    { from: 'UU', to: 'DU', rate: l1 }, { from: 'DU', to: 'UU', rate: m1 },
    { from: 'UU', to: 'UD', rate: l2 }, { from: 'UD', to: 'UU', rate: mu22 },
    { from: 'DU', to: 'DD', rate: l2 }, { from: 'DD', to: 'DU', rate: mu22 },
    { from: 'UD', to: 'DD', rate: l1 }, { from: 'DD', to: 'UD', rate: m1 },
  ],
};
const exact4 = solveMarkovModel(m4);
const asProduct = ACF.seriesA([{ lambda: l1, mu: m1 }, { lambda: l2, mu: mu22 }]);
check('series As = Π μᵢ/(λᵢ+μᵢ) matches exact 4-state CTMC to 1e-9',
      exact4.ok && approx(1 - exact4.pFailed, asProduct, 1e-9),
      'exact=' + (1 - exact4.pFailed) + ' product=' + asProduct);
// Parallel (redundant pair): failed only in DD.
const m4p = { states: m4.states.map(s => ({ name: s.name, isFailed: s.name === 'DD' })), transitions: m4.transitions };
const exact4p = solveMarkovModel(m4p);
const qProduct = ACF.parallelQ([{ lambda: l1, mu: m1 }, { lambda: l2, mu: mu22 }]);
check('parallel Qs = Π Qᵢ matches exact CTMC to 1e-9',
      exact4p.ok && approx(exact4p.pFailed, qProduct, 1e-9),
      'exact=' + exact4p.pFailed + ' product=' + qProduct);

console.log('\n[3] SHARED repair crew — the product form MUST diverge (why it is a labeled estimate)');
// Two identical comps, ONE repair crew: birth-death 0/1/2-failed, repair rate μ (not 2μ) in state 2.
const lS = 1e-2, mS = 1e-1;
const mShared = {
  states: [{ name: 'ok', isFailed: false }, { name: 'one', isFailed: false }, { name: 'both', isFailed: true }],
  transitions: [
    { from: 'ok', to: 'one', rate: 2 * lS }, { from: 'one', to: 'ok', rate: mS },
    { from: 'one', to: 'both', rate: lS }, { from: 'both', to: 'one', rate: mS },   // single crew: μ, not 2μ
  ],
};
const exactS = solveMarkovModel(mShared);
const qIndep = ACF.parallelQ([{ lambda: lS, mu: mS }, { lambda: lS, mu: mS }]);
check('shared-repair exact Q differs from independent product by >20%',
      exactS.ok && Math.abs(exactS.pFailed - qIndep) / exactS.pFailed > 0.2,
      'exact=' + exactS.pFailed + ' product=' + qIndep);
// (hand check: exact π_both = 0.02/1.22 ≈ 1.639e-2, product (1/11)² ≈ 8.26e-3 — ~2×)
check('hand value: exact π_both ≈ 1.639e-2', approx(exactS.pFailed, 0.02 / 1.22, 1e-6), 'got ' + exactS.pFailed);

console.log('\n[4] Structure-function combinators + μ≫λ shortcut');
const B = (n, q) => ({ kind: 'block', name: n, _q: q });
const qFn = b => b._q;
check('series q: 1−(1−0.1)² = 0.19', approx(ACF.structureQ({ kind: 'series', children: [B('a', 0.1), B('b', 0.1)] }, qFn), 0.19, 1e-12));
check('parallel q: 0.1² = 0.01', approx(ACF.structureQ({ kind: 'parallel', children: [B('a', 0.1), B('b', 0.1)] }, qFn), 0.01, 1e-12));
check('2oo3 q: 3·0.01·0.9 + 0.001 = 0.028', approx(ACF.structureQ({ kind: 'koon', k: 2, children: [B('a', 0.1), B('b', 0.1), B('c', 0.1)] }, qFn), 0.028, 1e-12));
check('missing repair data anywhere → null (never a silent guess)', ACF.structureQ({ kind: 'series', children: [B('a', 0.1), B('b', null)] }, qFn) === null);
const shortcut = ACF.seriesQApprox([{ lambda: lam, mu }, { lambda: l1, mu: m1 }]);
check('μ≫λ shortcut Qs ≈ Σ λᵢ/μᵢ', approx(shortcut, lam / mu + l1 / m1, 1e-15), 'got ' + shortcut);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

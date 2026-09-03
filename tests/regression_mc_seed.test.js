#!/usr/bin/env node
/*
 * Regression — MC-SEED (task #91): every Monte Carlo in fta_quant_modules.js is
 * SEEDED. A safety figure that changes on refresh is not evidence.
 *   [1] the ban: Math.random() appears NOWHERE in fta_quant_modules.js; the
 *       shared mulberry32 (_mcMulberry) is present; _normSample takes an rng.
 *   [2] simulateDFT determinism: same seed ⇒ identical p (bit-for-bit);
 *       no seed ⇒ default 42 (identical to explicit 42); different seed ⇒
 *       different empirical count on a resolvable tree; seed echoed in result.
 *   [3] runUncertaintyAnalysis determinism: same seed ⇒ identical mean/median;
 *       different seed ⇒ different mean (EF > 1 so sampling is real); seed
 *       echoed; stderr arithmetic exact on the DFT result.
 *   [4] receipts: both result cards print the seed; the bindings replay
 *       verifier detail carries the seed; busters bumped (fta_quant 66.9,
 *       bindings 1.4).
 * (Test-side eval is fine — the NO-EVAL rule is for shipped site code under
 *  the live CSP; node has no CSP. Same pattern as regression_avail_closedform.)
 * Run: node tests/regression_mc_seed.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const src = S('fta_quant_modules.js');
const idx = S('index.html');

// ---- [1] the ban ---------------------------------------------------------------
const randLines = src.split('\n').filter(l => l.indexOf('Math.random') >= 0);
check('Math.random() BANNED from fta_quant_modules.js code (comment mentions of the ban only)',
  randLines.length > 0 && randLines.every(l => /^\s*\/\//.test(l)));
check('shared seeded PRNG present (_mcMulberry / mulberry32 discipline)', /_mcMulberry/.test(src) && /0x6D2B79F5/.test(src));
check('_normSample requires an rng argument (no ambient randomness)', /function _normSample\(rng\)/.test(src));

// ---- load the real module headless ---------------------------------------------
globalThis.esc = s => String(s);
globalThis.ftaConfig = { exposureTime: 1 };
globalThis.ftaPages = [];
globalThis.window = globalThis;
// BDD lives in the engine layer — load the real ones, same as regression_bdd_budget.
(0, eval)(['fta_engine.js', 'engine_modules.js', 'fta_quant_modules.js'].map(S).join('\n;\n'));
const simulateDFT = globalThis.simulateDFT;
const runUnc = globalThis.runUncertaintyAnalysis;
check('real simulateDFT + runUncertaintyAnalysis loaded', typeof simulateDFT === 'function' && typeof runUnc === 'function');

const L = (id, lambda, extra) => Object.assign({ id, logicalId: 'L' + id, type: 'basic', lambda, children: [] }, extra || {});
const G = (id, gateType, children) => ({ id, type: 'gate', gateType, children });

// ---- [2] simulateDFT determinism -----------------------------------------------
const tree = G(1, 'PAND', [L(2, 0.9), L(3, 0.9)]);
const a = simulateDFT(tree, 1, 20000, 7);
const b = simulateDFT(tree, 1, 20000, 7);
check('same seed, same tree ⇒ identical p (bit-for-bit)', a.p === b.p && a.p > 0, 'a=' + a.p + ' b=' + b.p);
const d0 = simulateDFT(tree, 1, 20000);
const d42 = simulateDFT(tree, 1, 20000, 42);
check('no seed ⇒ default 42, identical to explicit 42', d0.seed === 42 && d0.p === d42.p);
const c = simulateDFT(tree, 1, 20000, 8);
check('different seed ⇒ different empirical count (seeds 7 vs 8)', a.p !== c.p, 'both=' + a.p);
check('seed echoed in the result object', a.seed === 7 && c.seed === 8);
check('stderr arithmetic exact: sqrt(p(1-p)/N)', Math.abs(a.stderr - Math.sqrt(a.p * (1 - a.p) / a.N)) < 1e-15);
check('empty root still carries the seed (refusal keeps its receipt)', simulateDFT(null, 1, 100, 5).seed === 5);

// ---- [3] runUncertaintyAnalysis determinism ------------------------------------
const utree = G(10, 'OR', [G(11, 'AND', [L(12, 1e-4, { lambdaEF: 3 }), L(13, 2e-4, { lambdaEF: 10 })]), L(14, 1e-5, { lambdaEF: 3 })]);
const u1 = runUnc(JSON.parse(JSON.stringify(utree)), 2000, 11);
const u2 = runUnc(JSON.parse(JSON.stringify(utree)), 2000, 11);
const u3 = runUnc(JSON.parse(JSON.stringify(utree)), 2000, 12);
check('uncertainty: same seed ⇒ identical mean AND median', u1.mean === u2.mean && u1.median === u2.median && u1.mean > 0);
check('uncertainty: different seed ⇒ different mean (EF>1, sampling is real)', u1.mean !== u3.mean);
check('uncertainty: seed echoed', u1.seed === 11 && u3.seed === 12);

// ---- [4] receipts ---------------------------------------------------------------
check('DFT result card prints the seed', /Seed \$\{r\.seed\} \(mulberry32\)/.test(src) && /same seed, same tree/.test(src));
check('uncertainty result card prints the seed', (src.match(/Seed \$\{r\.seed\} \(mulberry32\)/g) || []).length >= 2);
check('bindings replay verifier detail carries the seed', /seed ' \+ out\.seed \+ ' \(reproducible\)/.test(S('bindings_modules.js')));
check('cache busters bumped (fta_quant ≥66.9, bindings ≥1.4 — locks float forward)', (function () {
  const q = idx.match(/fta_quant_modules\.js\?v=66\.(\d+)/), b = idx.match(/bindings_modules\.js\?v=1\.(\d+)/);
  return !!q && parseInt(q[1], 10) >= 9 && !!b && parseInt(b[1], 10) >= 4; })());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

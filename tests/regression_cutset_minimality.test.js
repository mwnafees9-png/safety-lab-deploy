#!/usr/bin/env node
/*
 * Regression — minimal cut sets and the Vesely–Goldberg frequency (5 Aug 2026).
 *
 * getCutsets() enumerates CUT SETS, not MINIMAL cut sets: the OR branch
 * concatenates its children's results, so OR(AND(a,b), AND(a,b,c)) yields both
 * {a,b} and its superset {a,b,c}. That is harmless for P(top), which comes from
 * the BDD — and it was NOT harmless for computeFailureFrequency, whose own
 * header cites ARP4761A App G Eq G32–G34 and says "for each minimal cut set"
 * while summing over every set it was handed. Measured before the fix: w_TE
 * 3.0e-5 against a correct 2.0e-5, a 1.5x over-count, rendered in the FTA
 * quantification panel.
 *
 * These checks EXECUTE the engine. The probability side is included because the
 * fix must not disturb it — P(top) is exact and must stay exact.
 *
 * Run: node tests/regression_cutset_minimality.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');

const ctx = { window: {}, console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat };
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(SITE, 'fta_engine.js'), 'utf8'), ctx, { filename: 'fta_engine.js' });
const E = ctx.SLFTAEngine || ctx.window.SLFTAEngine;

let _i = 1;
const be = (lid, p, lam) => ({ id: _i++, logicalId: lid, name: 'E' + lid, type: 'basic', probability: p, lambda: lam || 0, children: [] });
const g = (t, kids) => ({ id: _i++, type: 'gate', gateType: t, probability: 0, children: kids });
const keys = sets => sets.map(s => s.map(n => String(n.logicalId)).sort().join('+')).sort();

console.log('\n[cutsets] the engine exposes a single minimality rule');
check('SLFTAEngine.minimalCutsets is exported', typeof E.minimalCutsets === 'function',
  'three inline copies of this rule existed before it had a home — the export is what stops a fourth');
check('empty input is handled', E.minimalCutsets([]).length === 0 && E.minimalCutsets(null).length === 0);
check('disjoint sets are all kept', E.minimalCutsets([[be(90, .1)], [be(91, .1)]]).length === 2);
check('a strict superset is dropped',
  keys(E.minimalCutsets([[be(1, .1), be(2, .1)], [be(1, .1), be(2, .1), be(3, .1)]])).join(' ') === '1+2');
check('equal-size sets that differ are both kept',
  E.minimalCutsets([[be(4, .1), be(5, .1)], [be(4, .1), be(6, .1)]]).length === 2);
check('minimality keys on logicalId, not node id',
  (() => { const a = be(7, .1), b = be(7, .1);   // same logical event, two nodes
           return E.minimalCutsets([[a], [b, be(8, .1)]]).length === 1; })(),
  'a repeated event under two node ids is one element; keying on id would keep a superset');

console.log('\n[cutsets] Vesely–Goldberg sums over MINIMAL cut sets');
{
  const LA = 2.0e-4, PB = 0.10, PC = 0.50;
  const root = g('OR', [g('AND', [be(1, 0, LA), be(2, PB)]),
                        g('AND', [be(1, 0, LA), be(2, PB), be(3, PC)])]);
  check('the raw enumeration still returns the superset (unchanged behaviour)',
    keys(E.getCutsets(root)).join(' ') === '1+2 1+2+3');
  const ff = E.computeFailureFrequency(root);
  check('w_TE counts the minimal cut set ONLY',
    Math.abs(ff.wTE - LA * PB) < 1e-18,
    'got ' + ff.wTE + ', correct ' + (LA * PB) + ', pre-fix value was ' + (LA * PB + LA * PB * PC));
  check('…and cutsetCount reports the minimal count', ff.cutsetCount === 1);
  check('a tree with no supersets is unaffected',
    (() => { const r = g('OR', [g('AND', [be(10, 0, LA), be(11, PB)]), be(12, 0, LA)]);
             const f = E.computeFailureFrequency(r);
             return Math.abs(f.wTE - (LA * PB + LA)) < 1e-18 && f.cutsetCount === 2; })());
}

console.log('\n[cutsets] the probability lane is exact and must stay exact');
{
  const P = r => E.computeExactProbability(r).prob;
  check('OR(x, x) = x — idempotent, not 2x - x²', Math.abs(P(g('OR', [be(20, .3), be(20, .3)])) - 0.3) < 1e-12);
  check('AND(x, x) = x', Math.abs(P(g('AND', [be(21, .3), be(21, .3)])) - 0.3) < 1e-12);
  check('OR(AND(a,b), AND(a,c)) uses the shared event, not an independence assumption',
    Math.abs(P(g('OR', [g('AND', [be(22, .5), be(23, .4)]), g('AND', [be(22, .5), be(24, .3)])])) - 0.29) < 1e-12,
    'the independent-branch answer is 0.32 — a 10% error');
  check('absorption: OR(a, AND(a,b)) = P(a)',
    Math.abs(P(g('OR', [be(25, .2), g('AND', [be(25, .2), be(26, .5)])])) - 0.2) < 1e-12);
  check('independent OR is 1 - ∏(1-p)',
    Math.abs(P(g('OR', [be(27, .1), be(28, .2), be(29, .3)])) - (1 - 0.9 * 0.8 * 0.7)) < 1e-12);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

#!/usr/bin/env node
/*
 * Regression — AIF-1, closed end to end (31 Aug 2026).
 *
 * History: the v5 captures lost 11-40 FHA rows at accept while the coverage
 * banner stayed green. 75.4 shipped the first half (per-card _applyError kept;
 * accept-all retains failed items + both-numbers toast). This suite pins the
 * WHOLE chain, including the second half shipped tonight:
 *
 *   P1  _preflightAction exemptions hold: Table A6 anchor vocabulary and
 *       tokens verbatim in the engineer's source documents never block.
 *   P2  A genuinely ungrounded id token STILL blocks — the guard's job.
 *   P3  accept-all retains failed items and toasts BOTH numbers (source pin
 *       on the shipped handler — behavior halves executed in P4/P5).
 *   P4  EXECUTED: _applySummaryHtml states applied-of-total, the blocked
 *       count, and that the banner counts drafts, not rows.
 *   P5  EXECUTED: zero blocked -> no strip at all (never a green-noise div).
 *   P6  The strip is wired into the failed branch ABOVE the panel body, and
 *       de-duplicated on repeat accepts.
 *
 * Run: node tests/regression_aif1_apply_truth.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ai = fs.readFileSync(path.join(__dirname, '..', 'site', 'ai_assistant.js'), 'utf8');

// ---- P1/P2: the real _preflightAction in a vm ----
const pf = ai.match(/function _preflightAction\(a\) \{[\s\S]*?\n        \}/)[0];
const mk = (docText) => {
  const ctx = vm.createContext({
    _validateArtifact: () => [],
    _SEV_ANCHORS: { 'CAT-1': 1 },
    _pfGet: () => ({ data: {}, docText: docText }),
    window: { AiFidelity: { checkClaims: (txt) => {
      // flag every ALLCAPS-ish token as an unknown id, like the real checker did on AIF-1
      return (txt.match(/[A-Z]{3,4}-?\d*/g) || []).map(t => ({ kind: 'id', token: t, why: 'identifier not found in the project model' }));
    } } }
  });
  vm.runInContext('var __pf = (' + pf.replace('function _preflightAction', 'function ') + ');', ctx);
  return vm.runInContext('__pf', ctx);
};
const pfA = mk('');
check('P1a anchor vocabulary never blocks', pfA({ fcDesc: 'per CAT-1 entailment' }).length === 0);
const pfB = mk('the HYD2 subsystem provides...');
check('P1b document-grounded token never blocks', pfB({ fcDesc: 'loss of HYD2 pressure' }).length === 0);
const pfC = mk('unrelated text');
check('P2 ungrounded id still blocks', pfC({ fcDesc: 'references XQJ9 unit' }).length === 1);

// ---- P3: the shipped accept-all branch (source pin) ----
check('P3 accept-all keeps failures and toasts both numbers',
  /items = failed; render\(\);/.test(ai) &&
  /NOT applied — kept in the panel with the reason on each card\./.test(ai));

// ---- P4/P5: the strip, executed ----
const strip = ai.match(/function _applySummaryHtml\(applied, blocked\) \{[\s\S]*?\n    \}/)[0];
const ctx2 = vm.createContext({});
vm.runInContext('var __st = (' + strip.replace('function _applySummaryHtml', 'function ') + ');', ctx2);
const st = vm.runInContext('__st', ctx2);
const html = st(82, 13);
check('P4a strip states applied-of-total and the blocked count',
  html.indexOf('Applied 82 of 95') >= 0 && html.indexOf('13 row(s) BLOCKED') >= 0);
check('P4b strip names the banner\'s limitation outright',
  /counts what was drafted, not what landed/.test(html));
check('P5 zero blocked -> empty string, no div', st(95, 0) === '');

// ---- P6: wiring ----
check('P6 strip renders above the body in the failed branch, de-duplicated',
  /rv-apply-summary'\)\.forEach\(function \(el\) \{ el\.remove\(\); \}\);/.test(ai) &&
  /insertAdjacentHTML\('beforebegin', _applySummaryHtml\(n, failed\.length\)\)/.test(ai));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

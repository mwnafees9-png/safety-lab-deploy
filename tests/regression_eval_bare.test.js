#!/usr/bin/env node
/*
 * Regression — EVAL-BARE: eval captures measure the shipped product, not the
 * capturing device (31 Aug 2026).
 *
 * Golden v6's capture carried a 1,251-char A14 house-style block from one
 * engineer's machine — recorded then as a permanent comparability caveat.
 * This closes it:
 *   P1  SafetyLabAI.evalBare === true keeps the A14 block OUT of the
 *       assembled context; false/absent keeps today's behavior.
 *   P2  _repeatabilitySnapshot meta.a14 DECLARES the posture: 'suppressed
 *       (evalBare)' under the switch; 'none retrieved' when the store is
 *       empty; 'rode prompts — <n> chars #<hash>' when memory rode.
 *   P3  The switch touches ONLY the A14 block — spec/docs/zonal etc. are
 *       unaffected by evalBare.
 *
 * Executed against the REAL extracted assembler + the real meta.a14 IIFE in a
 * vm sandbox — never a re-implementation.
 *
 * Run: node tests/regression_eval_bare.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ai = fs.readFileSync(path.join(__dirname, '..', 'site', 'ai_assistant.js'), 'utf8');

// ---- P1/P3: the assembler under both switch states ----
const fnSrc = ai.match(/async function _assembleAnalysisContext\(feature, system, opts\) \{[\s\S]*?\n    \}/)[0];
function sandbox(evalBare) {
  const ctx = vm.createContext({
    _skillBodyFor: () => 'SPEC', _FEATURE_SPECS: {},
    _goldenThreadContext: () => '', _projectDocContext: () => 'DOCS',
    _memoryExemplars: () => 'MEMBLOCK', _ZONAL_FEATURES: {}, _zonalContext: () => '',
    _withAssumptionsClause: s => s, _withBasisClause: s => s, _withInsufficiencyClause: s => s,
    _CONTROLLED_CLASS: /x^/,
    window: { SafetyLabAI: { evalBare: evalBare }, AiFidelity: { exemplarsFor: () => '' } }
  });
  vm.runInContext('var __fn = (' + fnSrc.replace('async function _assembleAnalysisContext', 'async function ') + ');', ctx);
  return vm.runInContext('__fn', ctx)('fha.draft', 'BASE', {});
}
(async () => {
  const bare = await sandbox(true);
  const normal = await sandbox(false);
  check('P1a evalBare=true keeps the A14 block out', bare.indexOf('MEMBLOCK') === -1);
  check('P1b evalBare absent/false keeps it in', normal.indexOf('MEMBLOCK') >= 0);
  check('P3 only A14 is switched — spec and docs ride in both states',
    bare.indexOf('SPEC') >= 0 && bare.indexOf('DOCS') >= 0 && normal.indexOf('SPEC') >= 0);

  // ---- P2: the meta.a14 declaration, executed ----
  const iife = ai.match(/a14: \(function \(\) \{[\s\S]*?\}\)\(\),/)[0].replace(/^a14: /, '(').replace(/,\s*$/, ')');
  const run = (evalBare, mem) => {
    const ctx = vm.createContext({ window: { SafetyLabAI: { evalBare } }, _memoryExemplars: () => mem });
    return vm.runInContext(iife, ctx);
  };
  check('P2a suppressed posture declared', run(true, 'MEMBLOCK') === 'suppressed (evalBare)');
  check('P2b empty store declared', run(false, '') === 'none retrieved');
  const rode = run(false, 'MEMBLOCK');
  check('P2c riding block declared with length + stable hash',
    /^rode prompts — 8 chars #[0-9a-f]{8}$/.test(rode) && rode === run(false, 'MEMBLOCK'));
  check('P2d different block, different hash', run(false, 'OTHERBLOCK') !== rode);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

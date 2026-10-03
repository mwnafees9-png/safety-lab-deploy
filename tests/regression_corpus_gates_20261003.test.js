#!/usr/bin/env node
/*
 * Regression: the regulatory corpus lookup respects the AI off switch and controlled content
 * (3 Oct 2026, security review of 2 Oct, batch 4).
 *
 * The lookup's query is project text (the first 300 characters of the drafting request). It
 * already refused ITAR projects. But the batch drafting engine (_anemBatch) assembles its
 * context, this lookup included, BEFORE it calls Provider.complete, where the per-project AI
 * off switch was checked; and controlled content (a controlled data classification, or a
 * system declared export-controlled named in the request) was only caught at complete time.
 * So the query reached the corpus service in both cases even though the drafting call was then
 * refused or routed locally. Now: AI off and controlled content send nothing to the corpus.
 *
 * Run: node tests/regression_corpus_gates_20261003.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const SRC = read('site/corpus_retrieve.js'), AI = read('site/ai_assistant.js');

function load(pc, source) {
  const calls = [];
  const sb = { window: { SLConfig: { corpusEndpoint: 'https://corpus.example' } }, console, JSON, String, Math, Array, encodeURIComponent,
    fetch: async (u) => { calls.push(u); return { ok: true, json: async () => ({ results: [{ id: '14CFR-25.1309', title: 't', text: 'x' }], issueDate: '2026-01-01' }) }; } };
  vm.createContext(sb);
  vm.runInContext('var projectConfig = ' + JSON.stringify(pc) + ';', sb);
  vm.runInContext(source || SRC, sb);
  return { C: sb.window.A15_CORPUS, calls };
}

(async function () {
  console.log('\n[corpus] what may leave');
  { const t = load({}); const b = await t.C.groundingBlock('25.1309 hazard classification', 4);
    check('a normal project: the lookup runs and grounds the request', t.calls.length === 1 && /25\.1309/.test(b)); }
  { const t = load({ aiSettings: { projectAiOff: true } }); const b = await t.C.groundingBlock('25.1309', 4); const s = await t.C.search('x', 4); const l = await t.C.lookup('25.1309');
    check('AI switched off for the project: nothing sent (block, search, lookup)', t.calls.length === 0 && b === '' && s.length === 0 && l.length === 0); }
  { const t = load({ isITARControlled: true }); await t.C.groundingBlock('25.1309', 4);
    check('ITAR project: nothing sent (as before)', t.calls.length === 0); }
  { const t = load({}); const b = await t.C.groundingBlock('25.1309', 4, { controlled: true });
    check('controlled content in the request: nothing sent', t.calls.length === 0 && b === ''); }
  { const mut = SRC.replace('if (_itarBlocked() || _aiOffBlocked()) return [];\n        q =', 'if (_itarBlocked()) return [];\n        q =');
    check('mutation site present', mut !== SRC);
    const t = load({ aiSettings: { projectAiOff: true } }, mut); await t.C.groundingBlock('25.1309', 4);
    check('MUTATION: without the AI-off check the query leaves an AI-off project', t.calls.length === 1); }
  { const mut = SRC.replace('if (ctx && ctx.controlled) return \'\';', '');
    check('mutation site present (controlled)', mut !== SRC);
    const t = load({}, mut); await t.C.groundingBlock('25.1309', 4, { controlled: true });
    check('MUTATION: without the controlled check the query leaves', t.calls.length === 1); }

  console.log('\n[engine] the batch engine checks before it assembles');
  const i = AI.indexOf('async function _anemBatch(taskDirective, cfg) {');
  const body = AI.slice(i, i + 8000);
  const off = body.indexOf('_projectAiOff()'), asm = body.indexOf('await _assembleAnalysisContext(');
  check('_anemBatch refuses an AI-off project before assembling any context', off > 0 && asm > 0 && off < asm);
  check('the grounding block is skipped for AI-off and told about controlled content', /typeof window\.A15_CORPUS\.groundingBlock === 'function' && !_projectAiOff\(\)/.test(AI) && /groundingBlock\(_qc, 4, \{ controlled: _ctl \}\)/.test(AI));
  check('controlled = the classification rule or a declared export-controlled system named', /const _ctl = _CONTROLLED_CLASS\.test\(String\(opts\.data_classification \|\| ''\)\) \|\| !!_payloadTaint\(/.test(AI));

  console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

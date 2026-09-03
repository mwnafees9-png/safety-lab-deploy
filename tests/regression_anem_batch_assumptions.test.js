#!/usr/bin/env node
/*
 * Regression — the unified engine's review panel SHOWS the model's assumptions
 * (25 Aug 2026, Waqas: "AI assumptions for FHA dont show").
 *
 * Third occurrence of the 1 Aug reachability lesson: every classic lane passed
 * `assumptions: _assumptions` into its review panel, and #272 routed the
 * aircraft FHA onto the unified batch path (_anemBatch) — which persisted the
 * model's assumptions to the F6 ledger and never handed them to
 * _makeReviewPanel. The "Assumptions (confirm)" block therefore did not exist
 * on the PRIMARY path, only on the classic paths _useUnifiedFeatures() routes
 * around.
 *
 * Pins:
 *   · _anemBatch normalizes parsed.assumptions into _batchAsms;
 *   · the batch panel is called with `assumptions: _batchAsms`;
 *   · the ledger persistence (SafetyLabAiAssumptions.add) survives alongside —
 *     the fix is additive, panel display AND ledger, not either/or;
 *   · the FHA lane still routes through the unified path (the bug's reach);
 *   · loader cache pin bumped so the fix actually loads.
 * Run: node tests/regression_anem_batch_assumptions.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const src = S('ai_assistant.js');
const loader = S('ai_loader.js');

// 26 Aug 2026 — pins updated in place. The normalization moved INSIDE the chunk
// loop (_anemBatch drafts in slices sized to the output budget now), so the
// per-turn result is `_norm` and `_batchAsms` accumulates across turns, de-duped by
// normalized text. The invariant is unchanged and now stronger: normalized, handed
// to the panel, ledger write surviving — plus accumulation, since keeping only the
// LAST turn's assumptions is the natural bug to introduce when adding a loop.
// the batch body, bounded: from _anemBatch's parse to the panel call
const i0 = src.indexOf("_norm = asmp.filter");
const iPanel = src.indexOf("id: 'ai-rev-anem-batch'");
check('the unified batch normalizes the model\'s assumptions (_batchAsms)',
  i0 > 0 && /let _batchAsms = \[\];/.test(src) &&
  /_norm = asmp\.filter\(function \(as\) \{ return as && as\.text; \}\)/.test(src));
check('…and ACCUMULATES across a chunked draft instead of keeping only the last turn',
  /_norm\.forEach\(function \(x\) \{[\s\S]{0,200}_batchAsms\.push\(x\);/.test(src),
  'each turn overwriting _batchAsms would silently drop every earlier turn\'s assumptions');
// 29 Aug 2026 — superseded in place (Skills V1.1): the panel cfg gained
// `analysis: cfg.analysis` between id and assumptions (the skill-stamp line
// needs it). The INTENT is unchanged — the batch panel receives the
// accumulated assumptions — so the pin tolerates intervening cfg lines.
check('…and the batch panel is called WITH them — the classic-lane contract',
  iPanel > 0 && /id: 'ai-rev-anem-batch',[\s\S]{0,700}assumptions: _batchAsms,/.test(src));
check('the F6 ledger persistence survives alongside the panel display', (() => {
  const seg = src.slice(Math.max(0, i0 - 2000), iPanel);
  return /SafetyLabAiAssumptions\.add === 'function'\) asmp\.forEach/.test(seg);
})());
check('normalized entries carry the walkthrough payload the panel renders',
  /rationale: as\.rationale, ifWrong: as\.ifWrong, usedFor: as\.usedFor,\s*\n\s*citations: Array\.isArray\(as\.citations\) \? as\.citations : \[\]/.test(src));
// the reach: this is the panel the aircraft FHA actually opens
check('the aircraft FHA routes through the unified path (so this panel is the FHA panel)',
  // window widened 700→3000 on 26 Aug (evening): the scope-picker ruling put
  // _openScopePicker and its condition-picker cfg between the route guard and
  // the _anemBatch call. The invariant — the aircraft FHA reaches _anemBatch —
  // is what matters, not the distance.
  /_useUnifiedFeatures\(\) && !opts\.systemId[\s\S]{0,3000}_anemBatch\(_FEATURE_DIRECTIVE\.fha/.test(src));
check('the panel renderer shows a block only when assumptions are supplied',
  /_assumptionsSectionHtml\(cfg\.assumptions\)/.test(src) &&
  /if \(!assumptions \|\| !assumptions\.length\) return '';/.test(src));
check('loader cache pin bumped past the fix (ai_assistant.js >= 72.6)', (() => {
  const m = loader.match(/ai_assistant\.js\?v=([\d.]+)/);
  return m && parseFloat(m[1]) >= 72.6;
})());

// ---- behavior: the normalization itself, executed --------------------------
{
  // extract the mapper and run it against a raw parsed.assumptions payload
  const m = src.match(/_norm = (asmp\.filter[\s\S]*?\}\);)\n/);
  check('the normalizer is extractable and runs', !!m);
  if (m) {
    const fn = new Function('asmp', 'return ' + m[1]);
    const out = fn([
      { text: 'Hold is unoccupied in flight', type: 'operational', rationale: 'SDD 1.1', citations: [{ doc: 'AEO-SDD-0001', quote: 'The hold is not occupied in flight' }] },
      { text: '', type: 'other' },                       // dropped: no text
      null,                                              // dropped: null
      { text: 'Engine IFSD rate from a mature type' },   // minimal shape
    ]);
    check('it keeps textful entries and drops empty/null ones', out.length === 2);
    check('it defaults type/status and preserves citations',
      out[0].type === 'operational' && out[0].status === 'Open' &&
      out[0].citations.length === 1 &&
      out[1].type === 'other' && Array.isArray(out[1].citations) && out[1].citations.length === 0);
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

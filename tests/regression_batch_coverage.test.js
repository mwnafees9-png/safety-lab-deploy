#!/usr/bin/env node
/*
 * Regression — a drafting lane covers the WHOLE unit list, and says so.
 * (26 Aug 2026, Waqas on an AFHA of 7 rows against 75 identified failure
 * conditions: "why did it stop, it cannot be doing that.")
 *
 * WHAT HAPPENED, read back from the live session rather than guessed:
 *   11 functions · 21 FCIM rows · 75 extracted failure conditions · 7 FHA rows.
 *   Covered SF-001…SF-004; SF-005…SF-011 had no row at all. stop_reason was
 *   end_turn, NOT max_tokens — the model was not cut off. Its closing line:
 *   "I emitted the highest-consequence rows first; say the word and I'll
 *   continue SF-005 through SF-011."
 *
 * NOTHING TOLD IT TO STOP. The FHA directive asks for a row per condition with
 * severity blank where it cannot be grounded; no spec, directive or prompt
 * string contains a cap. What stopped it was arithmetic: ~350 output tokens a
 * row, ~26,000 needed, maxTokens 8000 granted. It rationed, announced it, and
 * the app presented 9% of an FHA as an FHA.
 *
 * So the APP sizes the work now: slice the unit list, one call per slice inside
 * budget, accumulate, then ASSERT coverage from the actions that came back —
 * never from the model's own account of what it did.
 *
 * Run: node tests/regression_batch_coverage.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const loader = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8');

// Brace matcher that also skips COMMENTS. Without that, an apostrophe in a prose
// comment ("the model's own claim") opens a phantom string and the match runs off
// the end — which is exactly what it did on first run here.
function block(src, startMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) return null;
  let j = src.indexOf('{', i), depth = 0, inS = null, esc = false, line = false, blk = false;
  for (let k = j; k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { line = true; k++; continue; }
    if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('\n[budget] the ceiling that caused the rationing');
// Scoped to _anemComplete — other, classic lanes legitimately run at 8000 and are
// not what rationed the AFHA.
check('the batch engine DEFAULTS to 16,000 output tokens, matching doc.review',
  /feature: 'chat\.edit', model: MODELS\.reason, system: sys, messages: messages, maxTokens: \(typeof maxTokens === 'number' \? maxTokens : 16000\)/.test(ai),
  '8000 could not hold a full sweep for an unchunked lane, so the model rationed and announced it');

console.log('\n[chunking] the app sizes the work, not the model');
check('_anemBatch slices a supplied unit list',
  /const _chunk = \(cfg\.chunk && Array\.isArray\(cfg\.chunk\.units\) && cfg\.chunk\.units\.length\) \? cfg\.chunk : null;/.test(ai) &&
  /for \(let i = 0; i < _chunk\.units\.length; i \+= _sz\)/.test(ai));
check('…and runs one call per slice, accumulating actions',
  /for \(let _ci = 0; _ci < _slices\.length; _ci\+\+\)/.test(ai) &&
  /Array\.prototype\.push\.apply\(actions, pp\.actions\)/.test(ai));
check('each turn is told to cover its slice and NOT to stop early',
  /never omit the row, never summarise, and never stop early/.test(ai));
check('…and told not to offer to continue (that offer is what the app now owns)',
  /do NOT offer to continue/.test(ai));
check('an unchunked caller still runs exactly one turn (no behaviour change)',
  /else _slices\.push\(null\);/.test(ai));
// 30 Aug 2026 (per-system narrowing): both cfgs now carry a specSecs line
// between the analysis fields and the chunk — the pins allow it (the unit-list
// requirement is unchanged; regression_spec_targeting owns the specSecs checks).
check('the aircraft FHA supplies its unit list — the functions',
  /analysis: 'fha', verifyKind: 'fha',[\s\S]{0,160}chunk: \{/.test(ai) &&
  /coveredBy: function \(a\) \{ return a && a\.subId; \}/.test(ai));
check('the FCIM lane does too (same ceiling, same unit list)',
  /analysis: 'fcim\.populate',[\s\S]{0,160}chunk: \{/.test(ai));

console.log('\n[latency] the slices run concurrently, not one after another');
// 26 Aug 2026 — the first cut of the chunk loop awaited each slice in turn. Waqas,
// mid-run: "it has taken about 10 mins on the FCIM now" — the busy label showed it
// had actually been going 25. The slices are disjoint by construction, so serial
// execution multiplied wall-clock by the slice count for nothing.
check('slices are dispatched concurrently through a worker pool',
  /const _POOL = \d+;/.test(ai) &&
  /await Promise\.all\(Array\.from\(\{ length: Math\.min\(_POOL, _slices\.length\) \}, _worker\)\)/.test(ai),
  'awaiting slices one by one multiplies wall-clock by the slice count');
check('…but bounded, so a long unit list cannot fire every request at once',
  /const _worker = async function \(\) \{ while \(_next < _slices\.length\) \{ const i = _next\+\+; await _runSlice\(i\); \} \};/.test(ai));
check('results are consumed in SLICE order, not completion order',
  /for \(let _ci = 0; _ci < _slices\.length; _ci\+\+\) \{\s*\n\s*const _r = _results\[_ci\];/.test(ai),
  'consuming in completion order would make row order and assumption de-dup non-deterministic');
check('a chunked turn asks for a smaller budget than a one-shot lane',
  /const _CHUNK_TURN_TOKENS = (\d+);/.test(ai) &&
  parseInt(ai.match(/const _CHUNK_TURN_TOKENS = (\d+);/)[1], 10) < 16000,
  'asking a reasoning model for 16,000 tokens per small turn is most of the latency');
check('…and that budget is actually threaded to the provider call',
  /_anemRun\(_mkMessages\(_extra\), _sysExtra, _chunk \? _CHUNK_TURN_TOKENS : undefined\)/.test(ai) &&
  /async function _anemRun\(messages, systemExtra, maxTokens\)/.test(ai) &&
  /async function _anemComplete\(messages, systemExtra, maxTokens\)/.test(ai) &&
  /maxTokens: \(typeof maxTokens === 'number' \? maxTokens : 16000\)/.test(ai),
  'a budget computed and not passed would look identical to a grep');
check('…including on the parse-fail retry, which would otherwise jump back to 16,000',
  /no prose, no markdown fences\.', maxTokens\);/.test(ai));
check('the busy indicator is begun ONCE for the whole chunked run and ended once',
  (ai.match(/window\.slabAiBusyBegin\('drafting '/g) || []).length === 1 &&
  /if \(_chunk && window\.slabAiBusyEnd\) window\.slabAiBusyEnd\(\);/.test(ai),
  'begin-per-turn with a single end leaked labels — the live run showed "+2 more"');

console.log('\n[coverage] asserted from the actions, executed');
const batchSrc = block(ai, 'async function _anemBatch(');
check('the batch body is extractable', !!batchSrc);
// Lift the coverage computation out of the body and run it against real shapes.
const covSrc = (batchSrc || '').match(/let _coverage = null;[\s\S]*?\n        \}/);
check('the coverage computation is extractable', !!covSrc);
if (covSrc) {
  const run = (units, actions) => {
    const _chunk = {
      units: units, noun: 'aircraft function',
      keyOf: f => f.subId, label: f => f.subId + ' — ' + f.subName,
      coveredBy: a => a && a.subId
    };
    const _keyOf = u => String(_chunk.keyOf(u));
    const fn = new Function('_chunk', '_keyOf', 'actions', covSrc[0] + '\nreturn _coverage;');
    return fn(_chunk, _keyOf, actions);
  };
  const units = Array.from({ length: 11 }, (_, i) => ({ subId: 'SF-0' + String(i + 1).padStart(2, '0'), subName: 'fn' + i }));

  // the exact live shape: rows for SF-001..SF-004 only
  const partial = run(units, ['SF-001', 'SF-001', 'SF-002', 'SF-003', 'SF-004'].map(s => ({ subId: s })));
  check('the live failure is now counted: 4 of 11 covered',
    partial.covered === 4 && partial.total === 11);
  check('…and the seven uncovered functions are NAMED',
    partial.missing.length === 7 && partial.missing[0].indexOf('SF-005') === 0 &&
    partial.missing[6].indexOf('SF-011') === 0);
  check('duplicate rows for one function do not inflate coverage',
    partial.covered === 4, 'two SF-001 rows must count once');

  const full = run(units, units.map(u => ({ subId: u.subId })));
  check('a complete sweep reports complete', full.covered === 11 && full.missing.length === 0);

  const none = run(units, []);
  check('zero actions reports zero covered, all named', none.covered === 0 && none.missing.length === 11);

  const junk = run(units, [{ subId: 'SF-999' }, { noSubId: true }, null]);
  check('rows that match no unit never count as coverage', junk.covered === 0);
}

console.log('\n[coverage] the banner, executed');
const banSrc = block(ai, 'function _coverageBanner(');
check('the banner is extractable', !!banSrc);
if (banSrc) {
  const mk = cov => new Function('_esc', banSrc + '\nreturn _coverageBanner;')(
    s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])))(cov);
  check('no coverage info renders nothing (unchunked lanes are unaffected)',
    mk(null) === '' && mk({ total: 0 }) === '');
  const inc = mk({ total: 11, covered: 4, noun: 'aircraft function', missing: ['SF-005 — a', 'SF-006 — b'] });
  check('an incomplete draft says so, with both numbers',
    inc.indexOf('4 of 11') >= 0 && inc.indexOf('7 NOT drafted') >= 0);
  check('…and says plainly that accepting does not close the rest',
    /does not close the remaining/.test(inc));
  check('…and names what was missed', inc.indexOf('SF-005 — a') >= 0);
  check('…and is NOT styled as success', inc.indexOf('✓') < 0 && /#8A6D00/.test(inc));
  const cmp = mk({ total: 11, covered: 11, noun: 'aircraft function', missing: [] });
  check('a complete draft reads as complete', /Coverage complete/.test(cmp) && cmp.indexOf('✓') >= 0);
  check('…and never claims completeness while naming misses',
    !/NOT drafted/.test(cmp));
  const many = mk({ total: 40, covered: 1, noun: 'zone', missing: Array.from({ length: 39 }, (_, i) => 'Z' + i) });
  check('a long miss list is truncated but the true count still shown',
    /and 27 more/.test(many) && many.indexOf('1 of 40') >= 0);
  check('the miss list is HTML-escaped',
    mk({ total: 2, covered: 1, noun: 'x', missing: ['<img src=x>'] }).indexOf('&lt;img') >= 0);
}

console.log('\n[panel] the decision stays above the narration');
// 26 Aug 2026 — Waqas, on a five-turn FHA panel: "where do I accept/reject
// anything". The rows and their Accept buttons were rendered; they sat under ~5,000
// characters of prose, because every chunk writes its own paragraph and all of them
// were pasted into the disclaimer.
check('the disclaimer is a fixed one-liner, not the model\'s concatenated replies',
  /disclaimer: 'Advisory drafts from the unified AI engine\./.test(ai) &&
  !/disclaimer: \(parsed\.reply \? _esc\(String\(parsed\.reply\)\)/.test(ai),
  'one paragraph per turn in the disclaimer pushes the first row off the screen');
check('…and the narration is passed separately, collapsed',
  /notes: _replies,/.test(ai) && /_modelNotesBlock\(cfg\.notes\)/.test(ai));
const notesSrc = block(ai, 'function _modelNotesBlock(');
check('the notes block is extractable', !!notesSrc);
if (notesSrc) {
  const mk = notes => new Function('_esc', notesSrc + '\nreturn _modelNotesBlock;')(
    s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])))(notes);
  check('no notes renders nothing', mk([]) === '' && mk(null) === '' && mk(['', '  ']) === '');
  const five = mk(['a'.repeat(900), 'b', 'c', 'd', 'e']);
  check('notes render COLLAPSED so they cannot bury the rows',
    five.indexOf('<details') === 0 && five.indexOf('<summary') > 0 &&
    five.indexOf(' open') < 0,
    'an expanded block reproduces the exact bug this fixes');
  check('the summary says how many turns there were', /5 turns/.test(five));
  check('each turn is labelled when there is more than one', /<b>Turn 1<\/b>/.test(five) && /<b>Turn 5<\/b>/.test(five));
  check('a single turn is not labelled', !/<b>Turn 1<\/b>/.test(mk(['only one'])) && /1 turn\b/.test(mk(['only one'])));
  check('notes are HTML-escaped (they are model output)',
    mk(['<img src=x onerror=1>']).indexOf('&lt;img') >= 0);
}

console.log('\n[coverage] it reaches the panel');
check('_makeReviewPanel renders the banner',
  /_coverageBanner\(cfg\.coverage\)/.test(ai));
check('…and _anemBatch passes the computed coverage into it',
  /coverage: _coverage,/.test(ai));

console.log('\n[resilience] one bad slice must not lose the good ones');
check('a declining slice is remembered, not fatal',
  /if \(!_declined\) _declined = \{ parsed: e\.parsed, insufficient: e\.insufficient \};/.test(ai));
check('a hard error on one slice is remembered, not fatal',
  /if \(!_hardErr\) _hardErr = e;/.test(ai));
check('…and a partly-completed draft warns instead of silently shrinking',
  /turn\(s\) did not complete after .* attempts/.test(ai) && /see the coverage note on the panel/.test(ai));   // 3 Sep 2026: the warning now names the retry budget the turns exhausted

console.log('\n[chunking] it actually loads');
check('loader cache pin bumped past the fix (ai_assistant.js >= 72.9)', (() => {
  const m = loader.match(/ai_assistant\.js\?v=([\d.]+)/);
  return m && parseFloat(m[1]) >= 72.9;
})());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/*
 * Regression — A2/A3, the assistant-autonomy readout.
 *
 * The A-series target is 85–90% of drafted sections accepted without edit. This
 * module is the only thing that can observe that number, so its arithmetic has
 * to be right and its honesty has to be structural rather than a comment.
 *
 * Three properties this suite defends above all:
 *
 *   1. THE HEADLINE COUNTS THE RIGHT DENOMINATOR. accepted / (accepted + edited).
 *      Dismissed drafts are excluded on purpose — a discarded draft is a
 *      different failure with its own column. Folding them in would let the
 *      number improve by discarding more.
 *
 *   2. THE METRIC IS PAIRED WITH COVERAGE. Acceptance rises if the assistant
 *      simply drafts less; a two-line entry is accepted unchanged more often
 *      than a thorough one. Steering on acceptance alone optimises into an
 *      assistant that says almost nothing very reliably.
 *
 *   3. WHAT IS NOT MEASURED IS NAMED, NOT ESTIMATED. Abstention precision has no
 *      denominator until A10 ships. The module must keep saying so rather than
 *      quietly producing a plausible figure.
 *
 * Run: node tests/regression_autonomy_metrics.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const A = require(path.join(SITE, 'autonomy_metrics.js'));
const src = fs.readFileSync(path.join(SITE, 'autonomy_metrics.js'), 'utf8');
const ai  = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const close = (a, b) => a != null && Math.abs(a - b) < 1e-9;

// Instrumented by default — that is what the product writes post-1-Aug. A test
// that wants a PRE-gate record says so explicitly with { offered: null }, so the
// distinction is visible in the fixture instead of hiding in an omission.
const D = (feature, action, extra) => {
  const r = Object.assign({ kind: 'delta', feature: feature, action: action }, extra || {});
  if (!('offered' in r)) r.offered = 1;
  if (r.offered === null) delete r.offered;          // explicit legacy
  return r;
};

// ---- the headline ----------------------------------------------------------
console.log('\n[A3] accepted-without-edit');
{
  const r = A.compute([
    D('f', 'accept', { offered: 2, populated: 2 }),
    D('f', 'accept', { offered: 2, populated: 2 }),
    D('f', 'accept', { offered: 2, populated: 2 }),
    D('f', 'edit',   { offered: 2, populated: 2, item: { diff: [{ field: 'x', from: 'aaaa', to: 'aaab' }] } }),
  ]);
  check('3 clean of 4 kept → 75%', close(r.overall.acceptClean, 0.75), JSON.stringify(r.overall));
  check('the per-feature figure agrees with the overall one', close(r.features[0].acceptClean, 0.75));
}
{
  const r = A.compute([D('f', 'accept'), D('f', 'dismiss'), D('f', 'dismiss'), D('f', 'dismiss')]);
  check('dismissals do NOT flatter the headline', close(r.overall.acceptClean, 1),
    'accepted/(accepted+edited) — otherwise discarding more would improve the score');
  check('but they are reported as a discard rate', close(r.features[0].discardRate, 0.75),
    JSON.stringify(r.features[0]));
}
check('no dispositions → null, never 0 or 100%', A.compute([]).overall.acceptClean === null,
  'an invented figure on an empty register is worse than no figure');
check('non-delta records are ignored', A.compute([{ kind: 'other', action: 'accept' }]).sampleSize === 0);

// ---- coverage, the anti-gaming pair ---------------------------------------
console.log('\n[A3] coverage guard');
{
  const thin = A.compute([D('f', 'accept', { offered: 3, populated: 1 }), D('f', 'accept', { offered: 3, populated: 1 })]);
  check('an assistant that drafts thin scores 100% clean...', close(thin.overall.acceptClean, 1));
  check('...but its coverage exposes it', close(thin.features[0].coverage, 1 / 3),
    'this pair is the whole defence against optimising into uselessness');
  const full = A.compute([D('f', 'accept', { offered: 3, populated: 3 })]);
  check('a thorough draft shows full coverage', close(full.features[0].coverage, 1));
}
check('coverage is null when a lane offers no editable fields',
  A.compute([D('f', 'accept', { offered: 0, populated: 0 })]).features[0].coverage === null,
  'zero offered is not zero coverage — it is not applicable');

// ---- surviving text --------------------------------------------------------
console.log('\n[A3] surviving text');
{
  const r = A.compute([D('f', 'edit', { item: { diff: [{ field: 'x', from: 'abcd', to: 'abcd' }] } })]);
  check('an identical pair survives fully', close(r.features[0].survivingText, 1));
}
{
  const r = A.compute([D('f', 'edit', { item: { diff: [{ field: 'x', from: 'aaaa', to: 'bbbb' }] } })]);
  check('a total rewrite survives not at all', close(r.features[0].survivingText, 0));
}
{
  const r = A.compute([D('f', 'edit', { item: { diff: [
    { field: 'x', from: 'Loss of thrust', to: 'Loss of all thrust' }] } })]);
  check('a small correction scores high but under 1',
    r.features[0].survivingText > 0.7 && r.features[0].survivingText < 1,
    String(r.features[0].survivingText));
}
check('survivingText is null with no edits', A.compute([D('f', 'accept')]).features[0].survivingText === null);
check('similarity is symmetric', close(A._similarity('kitten', 'sitting').sim, A._similarity('sitting', 'kitten').sim));
check('both empty counts as identical', A._similarity('', '').sim === 1);
check('one empty counts as nothing surviving', A._similarity('abc', '').sim === 0);
{
  const long = 'x'.repeat(900), long2 = 'y'.repeat(900);
  const r = A.compute([D('f', 'edit', { item: { diff: [{ field: 'x', from: long, to: long2 }] } })]);
  check('very long prose is capped rather than hanging the panel', r.similarityTruncated === true,
    'Levenshtein is O(n·m) — an uncapped register would freeze the settings view');
  check('and the truncation is disclosed in the rendered output',
    /comparison cap/.test(A.html(r)), 'a silently truncated measure is a lie by omission');
}

// ---- fields per edit, drafts per keep -------------------------------------
console.log('\n[A3] supporting figures');
{
  const r = A.compute([
    D('f', 'draft', { n: 5 }),
    D('f', 'accept'), D('f', 'accept'),
    D('f', 'edit', { item: { diff: [{ field: 'a', from: '1', to: '2' }, { field: 'b', from: '3', to: '4' }] } }),
  ]);
  check('fields changed per edit', close(r.features[0].fieldsChangedPerEdit, 2));
  check('drafts offered per draft kept', close(r.features[0].draftsPerKeep, 5 / 3));
  check('a draft record does not count as a disposition', close(r.overall.acceptClean, 2 / 3));
}

// ---- honesty ---------------------------------------------------------------
console.log('\n[A3] stated limits');
{
  const r = A.compute([D('f', 'accept')]);
  const names = r.notMeasured.map(m => m.metric);
  check('abstention precision is declared unmeasured', names.indexOf('abstention precision') >= 0);
  // A10 shipped, so the blocker MOVED rather than cleared. The rate is measured
  // now; whether each abstention was RIGHT still needs A4's reference answers.
  // Reporting a rate as though it were precision would be the same category of
  // error as the severity default it replaced.
  check('and it names the task that unblocks it',
    r.notMeasured.some(m => m.blockedBy === 'A4'));
  check('the abstention RATE is now measured, unlike the precision',
    A.compute([D('f', 'accept', { offered: 4, populated: 3, abstained: 1 })]).features[0].abstentionRate === 0.25);
  check('turns-to-accept is declared a proxy, not the real quantity',
    names.indexOf('turns-to-accept') >= 0);
  check('the pending list is rendered to the user, not just returned',
    /not measured/.test(A.html(r)));
  check('no abstention figure is invented anywhere',
    !/abstentionPrecision\s*:/.test(src) || /notMeasured/.test(src));
}
check('the empty state explains itself rather than showing 0%',
  /No dispositions recorded/.test(A.html(A.compute([]))));
check('the readout states the target it is being judged against',
  /85/.test(A.html(A.compute([D('f', 'accept')]))));
check('the UI says clean and coverage must be read together',
  /read together/i.test(A.html(A.compute([D('f', 'accept')]))));

// ---- the producer side -----------------------------------------------------
console.log('\n[A2] telemetry wiring');
check('_logDelta accepts the coverage payload', /function _logDelta\(feature, action, item, extra\)/.test(ai));
check('extra cannot clobber the record identity',
  /Object\.assign\(\{\}, extra \|\| \{\}, \{ kind: 'delta'/.test(ai),
  'kind/feature/action/ts are written last so a stray extra key cannot rewrite them');
check('a draft record is emitted when a panel opens', /_logDelta\(cfg\.id, 'draft', null, \{ n: items\.length/.test(ai));
check('coverage is computed from the declared editable fields', /function _cov\(it\)/.test(ai));
check('coverage counts only fields with something actually in them',
  /trim\(\)\.length > 0/.test(ai));
check('accept, edit and accept-all all carry coverage',
  (ai.match(/_cov\(it\)|_cov\(items\[idx\]\)/g) || []).length >= 3);

console.log('\n[A2] surfacing');
check('index.html hosts the readout', /id="autonomy-metrics"/.test(idx));
check('index.html loads the module', /src="autonomy_metrics\.js/.test(idx));
check('the module loads after ai_badges.js',
  idx.indexOf('autonomy_metrics.js') > idx.indexOf('ai_badges.js'));
check('the UI states the numbers never leave the device',
  /never transmitted/.test(idx) && /nothing here is sent anywhere/.test(idx));
check('nothing in the module transmits anything',
  !/\bfetch\s*\(|XMLHttpRequest|sendBeacon/.test(src),
  'aggregating across accounts is permitted under EULA §8 but is a separate decision');

// ---- legacy exclusion ------------------------------------------------------
// Found live on 1 Aug: the panel read 100.0% from 334 clean accepts and 0
// corrections. Not because the drafts were right — because before the edit gate
// shipped, correcting one was impossible, so every historical record is an
// accept or a dismiss by construction. The most flattering number available,
// for a reason unrelated to draft quality, on a fresh install.
console.log('\n[A3] records that predate the edit gate');
{
  const L = (f, a) => D(f, a, { offered: null });
  const legacyOnly = A.compute([L('x', 'accept'), L('x', 'accept'), L('x', 'dismiss')]);
  check('a register of only pre-gate records yields NO headline',
    legacyOnly.overall.acceptClean === null,
    'counting them gives exactly 100% every time');
  check('they are counted and reported rather than silently dropped',
    legacyOnly.overall.legacy === 3);
  check('sampleSize reflects what the figures are BASED on, not the row count',
    legacyOnly.sampleSize === 0,
    'otherwise the panel renders a table of dashes as though it had data');
  check('the exclusion is stated on screen', /earlier disposition[s]? excluded/.test(A.html(legacyOnly)));
  check('and it explains why', /predate the edit gate/.test(A.html(legacyOnly)));
  check('no percentage is shown at all in that state', !/\d\.\d%/.test(A.html(legacyOnly)));
}
{
  const mixed = A.compute([
    D('x', 'accept', { offered: null }), D('x', 'accept', { offered: null }),   // legacy
    D('y', 'accept', { offered: 2, populated: 2 }),                      // instrumented
    D('y', 'edit',   { offered: 2, populated: 2, item: { diff: [{ field: 't', from: 'a', to: 'b' }] } })
  ]);
  check('a mixed register scores only the instrumented records',
    close(mixed.overall.acceptClean, 0.5),
    'the two pre-gate accepts must not lift the rate to 75%');
  check('and still reports the excluded ones', mixed.overall.legacy === 2);
}
{
  const legacyDismiss = A.compute([D('x', 'dismiss', { offered: null }), D('x', 'accept', { offered: 1, populated: 1 })]);
  check('a pre-gate DISMISS is excluded too, not just accepts',
    legacyDismiss.overall.legacy === 1 && legacyDismiss.features[0].dismissed === 0,
    'leaving dismisses in would distort the discard rate the same way');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

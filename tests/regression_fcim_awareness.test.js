#!/usr/bin/env node
/*
 * Regression — FCIM crew-awareness semantics, and what traces into the FHA.
 *
 * THE BUG THIS PINS (confirmed 1 Aug 2026). "N/A" on an FCIM row means the
 * crew-UNAWARE case is inapplicable: the failure is intrinsically evident — the
 * prompt's own examples are yaw, roll, asymmetry, deceleration — so the crew
 * cannot fail to notice it. It does NOT mean the sub-function has no failure
 * conditions.
 *
 * It had been implemented as the latter, consistently, in four places at once:
 *
 *   · the FCIM prompt told the model an N/A entry was "DOCUMENTATION ONLY" and
 *     to leave totalLoss / partialLoss / malfunction EMPTY;
 *   · _pushExtractedFCs skipped N/A rows when building extractedFCs;
 *   · the Excel import path skipped them too, explicitly "consistent with
 *     _pushExtractedFCs";
 *   · _fcimRenderCells blanked the TL/PL/M columns, so the row read on screen as
 *     though nothing had been drafted.
 *
 * The effect: every intrinsically evident failure lost its total-loss,
 * partial-loss and malfunction conditions before the FHA ever saw them. They
 * were absent from the FC dropdown and invisible to the AI drafting the FHA —
 * and those conditions skew severe, because a failure violent enough to be
 * self-evident is usually a failure that matters.
 *
 * Being consistent across four sites is what made it survive: nothing
 * contradicted anything else, and the FCIM tab showed a tidy row with empty
 * columns rather than a gap.
 *
 * WHAT AWARENESS ACTUALLY MEANS, per the three cases:
 *   Both    — severity is unaffected by awareness; ONE consolidated row.
 *   Aware /
 *   Unaware — severity IS affected; TWO rows for the sub-function, evaluated
 *             separately in the FHA, and the engineer then chooses which risk
 *             governs. Choosing the lower (aware) risk takes credit for the
 *             annunciation and owes a monitoring requirement.
 *   N/A     — no crew-unaware variant exists. The failure conditions are real.
 *
 * Run: node tests/regression_fcim_awareness.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const mfn = S('misc_fn_modules.js'), ai = S('ai_assistant.js'), imp = S('importers.js');

// ---- the trace, executed -----------------------------------------------------
console.log('\n[fcim] N/A rows trace their failure conditions forward');
{
  const m = mfn.match(/function _pushExtractedFCs\(fcimArr, out\)[\s\S]*?\n\}/);
  const sb = { console }; vm.createContext(sb);
  vm.runInContext(m[0] + '\n; globalThis._p = _pushExtractedFCs;', sb);

  const out = [];
  sb._p([
    { subId: 'SF-01', awareness: 'N/A',     tlId: 'FC-01', tlDesc: 'Total loss of pitch trim',
      plId: 'FC-02', plDesc: 'Degraded pitch trim', mId: 'FC-03', mDesc: 'Uncommanded pitch trim' },
    { subId: 'SF-02', awareness: 'Aware',   tlId: 'FC-04', tlDesc: 'Total loss of braking' },
    { subId: 'SF-03', awareness: 'Unaware', tlId: 'FC-05', tlDesc: 'Undetected fuel leak' },
    { subId: 'SF-04', awareness: 'Both',    tlId: 'FC-06', tlDesc: 'Loss of cabin pressure' }
  ], out);
  const ids = out.map(o => o.id);

  check('an N/A row contributes ALL THREE of its failure conditions',
    ids.indexOf('FC-01') >= 0 && ids.indexOf('FC-02') >= 0 && ids.indexOf('FC-03') >= 0,
    'these were dropped entirely before the fix — got: ' + ids.join(', '));
  check('Aware, Unaware and Both still trace',
    ids.indexOf('FC-04') >= 0 && ids.indexOf('FC-05') >= 0 && ids.indexOf('FC-06') >= 0);
  check('nothing is invented for a row that genuinely has no conditions',
    (function () { const o = []; sb._p([{ subId: 'SF-09', awareness: 'N/A' }], o); return o.length === 0; })(),
    'an empty row still contributes nothing — the fix removes a filter, it does not fabricate');
  check('the awareness value itself is no longer a filter',
    !/awareness === 'N\/A'\) return;/.test(mfn),
    'the skip is gone from the trace builder');
}

// ---- the other three sites ---------------------------------------------------
console.log('\n[fcim] the same doctrine, corrected everywhere it was stated');
check('the prompt no longer tells the model to leave the conditions empty',
  !/leave its totalLoss \/ partialLoss \/ malfunction EMPTY/.test(ai),
  'this was the upstream cause — the fields really were empty because the model was told to empty them');
check('…and now says N/A describes the awareness, not the conditions',
  /N\/A describes the AWARENESS, not the failure conditions/.test(ai) &&
  /Never leave the failure conditions empty on an N\/A row/.test(ai));
check('the importer no longer skips N/A rows',
  !/non-tracing: documentation only/.test(imp),
  'it mirrored _pushExtractedFCs and had to move with it');
check('the FCIM render shows the conditions rather than blanking them',
  !/if \(false/.test(mfn) && !/\(non-tracing\)/.test(mfn),
  'no dead branch left behind, and the misleading label is gone');
check('…while keeping the N/A rationale visible, in the awareness column',
  /no unaware case/.test(mfn) && /row\.rationale/.test(mfn),
  'the marker is about awareness, so it belongs in that cell — losing the rationale would trade one gap for another');
check('the quality grader now scores N/A rows like any other',
  !/if \(row\.awareness !== 'N\/A'\) \{ cell\('TL'/.test(ai),
  'they were exempt only because the fields were expected to be empty');

// ---- the semantics that must not drift --------------------------------------
console.log('\n[fcim] the three cases stay distinguishable');
check('the four awareness values are still the vocabulary',
  /"Aware", "Unaware", "Both", or "N\/A"/.test(ai));
check('Both is still the consolidated case — severity unaffected',
  /outcome is identical whether or not the crew is aware, emit a SINGLE row marked "awareness":"Both"/.test(ai));
check('the two-row split is still required where severity CHANGES',
  /If awareness CHANGES the severity, emit TWO rows for that sub-function/.test(ai),
  'this is what makes an aware/unaware severity delta expressible at all');
check('N/A is still reserved for intrinsically evident failures',
  /intrinsically EVIDENT/.test(ai) && /so the crew can never be unaware/.test(ai));
check('the correction is explained where the next reader will be',
  /Corrected 1 Aug 2026/.test(mfn) && /intrinsically evident failure/.test(mfn));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

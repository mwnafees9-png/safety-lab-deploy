#!/usr/bin/env node
/*
 * Regression — the golden thread must colour links by flag SEVERITY.
 *
 * gt_thread.js defines three flag colours: compromised (red), stale (amber),
 * obsolete (grey). The safety-lane link painter ignored all of that and tested
 * only for presence:
 *
 *     const flagged = tN.flag || sN.flag;
 *     const col = flagged ? RED : '...';
 *
 * so a merely stale or obsolete node shouted the same alarm as a genuinely
 * compromised one — on the flagship visual, whose entire job is telling those
 * apart at a glance. The feeder connector a few lines below had always narrowed
 * correctly to `=== 'compromised'`; this branch never got the same treatment.
 *
 * The defect sat on the board for weeks behind a note saying it needed a
 * "patch.py" rebuild that no longer exists — gt_thread.js is a plain script tag
 * in both site/ and dist/. It was always a one-line fix.
 *
 * Run: node tests/regression_gt_thread_severity.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const gt = fs.readFileSync(path.join(__dirname, '..', 'site', 'gt_thread.js'), 'utf8');

check('the three flag colours are still declared',
  /FLAG = \{ compromised: RED, stale: AMBER, obsolete: INK3 \}/.test(gt),
  'if the palette changed, this test needs rewriting, not deleting');

check('the link painter no longer colours on mere presence',
  !/const flagged = tN\.flag \|\| sN\.flag;[\s\S]{0,120}flagged \? RED/.test(gt),
  'any truthy flag painting red is the exact defect');

check('the link painter resolves a worst-severity flag',
  /worst = \(tN\.flag === 'compromised' \|\| sN\.flag === 'compromised'\)/.test(gt));

check('the colour comes from the FLAG severity map',
  /FLAG\[worst\]/.test(gt), 'stale must render amber and obsolete grey, not red');

check('an unrecognised flag still falls back to red',
  /FLAG\[worst\] \|\| RED/.test(gt), 'unknown severity must fail loud, not silent');

check('only compromised gets the heavy stroke',
  /wd = worst === 'compromised' \? 2/.test(gt));

// The feeder path was always right — it is the reference implementation.
check('the feeder connector still narrows to compromised',
  /f\.flag === 'compromised' \|\| \(tN && tN\.flag === 'compromised'\)/.test(gt),
  'this is the behaviour the link painter was brought into line with');

// The stale blocker: gt_thread.js must remain a plain script tag, not inlined.
const index = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
check('gt_thread.js ships as a normal script tag',
  /<script src="gt_thread\.js\?v=[\d.]+" defer><\/script>/.test(index),
  'the "needs patch.py re-inlining" note was obsolete — keep it that way');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

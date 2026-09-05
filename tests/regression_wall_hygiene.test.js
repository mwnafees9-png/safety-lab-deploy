// =============================================================================
// regression_wall_hygiene — the wall polices its own reporting format.
//
// WHY THIS EXISTS (5 Sep 2026). ship.sh decides whether a suite failed by
// grepping for a line beginning with exactly two spaces, FAIL, two spaces
// (`^  FAIL  `). That anchoring is deliberate: the bare word FAIL also appears
// inside check NAMES ("...-> still FAIL (agreement guard bites)"), so an
// unanchored grep would report failures that are not failures.
//
// The cost of the anchor is that a suite writing `'  FAIL ' + name` — one space
// instead of two — is invisible to the gate. Two suites were doing exactly that:
// regression_e2_commitment and regression_invitations, both fixed in the same
// commit as this file.
//
// Measured before fixing, by breaking one on purpose (rule 9): a failing check
// in those suites still exited non-zero, so ship.sh's crash detector caught it
// and the wall DID go red. The defect was therefore mis-reporting, not silence —
// a real assertion failure was announced as "suite did not run to completion",
// which sends the reader hunting for a load error that does not exist. Waqas,
// asked whether to fix the two suites or also mechanise the rule: "Both".
//
// WHAT THIS PROVES
//   1. every suite that reports a failure does so in the canonical form
//   2. no suite emits the one-space form the gate cannot see
//   3. every suite can actually fail the process (exit code or a throwing assert)
//   4. every suite emits at least one PASS/FAIL line, so a silent file is caught
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// Both directories ship.sh runs. eval/ joined the wall on 5 Sep 2026; its one
// suite holds the scorer's own mutation proofs and had never run on a deploy.
const dir = path.join(__dirname);
const evalDir = path.join(__dirname, '..', 'eval');
const suites = [
  ...fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).map(f => ({ f, base: dir })),
  ...(fs.existsSync(evalDir) ? fs.readdirSync(evalDir).filter(f => f.endsWith('.test.js')).map(f => ({ f, base: evalDir })) : [])
].sort((a, b) => a.f.localeCompare(b.f));

console.log('\n[wall] every suite reports in the form ship.sh can see');
check('there are suites to police', suites.length > 100, suites.length + ' found');
check('the eval suite is policed too', suites.some(s => s.f === 'regression_ai_repeatability.test.js'));

// 1 + 2. Find the BAD form precisely: a string literal that opens with two
//    spaces, then FAIL, NOT followed by two more spaces. Anchoring on the quote
//    character is what keeps this honest — it ignores prose in comments (a line
//    reading "  FAILURES of independence are GLOBAL" is not a reporter), which
//    a bare substring search does not.
//
//    This file is excluded from its own scan: it quotes the bad form on purpose,
//    in the pinned checks below and in this comment.
//    (?![A-Z]) keeps the word FAILURE out of it — a literal that opens
//    "  FAILURE ..." is prose in a message, not a reporter line.
const BAD  = /(['"`])  FAIL(?![A-Z])(?!  )/;
const GOOD = /(['"`])  FAIL  /;

const badForm = [];
const noEmitter = [];
const noExit = [];
for (const { f, base } of suites) {
  if (f === 'regression_wall_hygiene.test.js') continue;
  const src = fs.readFileSync(path.join(base, f), 'utf8');

  if (BAD.test(src)) badForm.push(f);
  if (!GOOD.test(src)) noEmitter.push(f);

  // 3. It must be able to fail the process. Four legitimate shapes are in use
  //    across this wall: process.exit(), process.exitCode =, a throwing assert,
  //    and a bare throw. An earlier draft of this check knew only the first and
  //    accused 69 healthy suites — the check was wrong, not the suites.
  const canFail = /process\.exit\(/.test(src)
               || /process\.exitCode/.test(src)
               || /\bassert\b/.test(src)
               || /\bthrow\b/.test(src);
  if (!canFail) noExit.push(f);
}

check('no suite uses the one-space FAIL form the gate cannot see', badForm.length === 0, badForm.join(', '));
check('every suite emits a FAIL line of its own', noEmitter.length === 0, noEmitter.join(', '));
check('every suite can fail the process (exit code, assert or throw)', noExit.length === 0, noExit.join(', '));

// 4. The two suites this file was written for, pinned by name so a regression
//    in either is named rather than merely counted.
for (const f of ['regression_e2_commitment.test.js', 'regression_invitations.test.js']) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  check(f + ' emits the canonical form', /console\.log\('  FAIL  ' \+ name\)/.test(src));
  check(f + ' no longer emits the one-space form', !/console\.log\('  FAIL ' \+ name\)/.test(src));
}

// 5. ship.sh must still be anchoring the way this file assumes. If someone
//    loosens the grep, these checks stop meaning what they say.
const ship = fs.readFileSync(path.join(dir, '..', 'ship.sh'), 'utf8');
// ship.sh anchors TWICE and both matter: `grep -cE` counts real failures, and
// `grep -qE` decides whether a non-zero exit was a failure or a crash. An
// earlier draft asserted only that the anchor appeared SOMEWHERE, and a
// mutation that loosened the counting grep still passed because the crash
// detector's copy satisfied it. Pin both call sites.
check('ship.sh counts failures with the anchored form',
      /grep -cE '\^  FAIL  '/.test(ship));
check('ship.sh distinguishes a crash from a failure with the anchored form',
      /grep -qE '\^  FAIL  '/.test(ship));
check('ship.sh still treats a non-zero exit with no FAIL line as a crash', /CRASHES=\$\(\(CRASHES \+ 1\)\)/.test(ship));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

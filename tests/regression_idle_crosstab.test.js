#!/usr/bin/env node
/*
 * Regression: inactivity timeout (build 66.12).
 *
 * REPORT, 18 Aug 2026: "it keeps signing me out mid demos while I am actually
 * using the tool", and the ruling that followed — "if someone is actively using
 * the app they should never be timed out."
 *
 * THREE DEFECTS, all in auth_gate.js:
 *   1. The idle clock was a PER-TAB variable while signOut() is GLOBAL. A second
 *      tab left open reached 20 minutes on its own clock and signed out the tab
 *      the user was working in. Activity in one tab never touched the other's.
 *   2. The 18-minute warning rendered in whichever tab expired — the idle one,
 *      which nobody is looking at. The sign-out arrived with no visible warning.
 *   3. signOut() ran at supabase-js v2's DEFAULT scope, which is 'global': an idle
 *      laptop tab also signed the user out on their phone and every other device.
 *   4. Long local compute did not hold the clock. The busy hook counted AI fetches
 *      only, and nothing else in the codebase ever called SafetyLabActivity.begin(),
 *      so a 20-minute Monte-Carlo run the user was WATCHING counted as inactivity.
 *
 * Run:  node tests/regression_idle_crosstab.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'auth_gate.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');


// House rule (SL §7.3): pins are FLOORS, never literals — a literal breaks on the
// next legitimate bump, which is exactly what happened to this suite one batch
// after it was written. Compare major.minor as INTEGERS: parseFloat('72.10') is
// 72.1, which would silently read as older than 72.5.
function pinAtLeast(src, file, wantMajor, wantMinor) {
  const m = src.match(new RegExp(file.replace('.', '\\.') + '\\?v=(\\d+)\\.(\\d+)'));
  if (!m) return false;
  const maj = parseInt(m[1], 10), min = parseInt(m[2], 10);
  return maj > wantMajor || (maj === wantMajor && min >= wantMinor);
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

console.log('\n[1] The idle clock is shared across tabs');
check('a shared storage key exists', /IDLE_LS_KEY\s*=\s*'safetyLab\.idle\.lastActivity'/.test(SRC));
check('every bump writes the timestamp out', /function _idleBump\(\)[\s\S]{0,240}_idleWriteShared\(now\)/.test(SRC));
check('the writes are throttled (no localStorage write per mousemove)',
  /IDLE_LS_THROTTLE_MS/.test(SRC) && /\(now - _idleLastWrite\) < IDLE_LS_THROTTLE_MS/.test(SRC));
check('the check reads the NEWEST activity across tabs, not this tab only',
  /const idleFor = Date\.now\(\) - _idleNewest\(\)/.test(SRC));
check('_idleNewest takes the max of local and shared',
  /function _idleNewest\(\)[\s\S]{0,160}shared > _idleLast \? shared : _idleLast/.test(SRC));
check('a storage event from another tab bumps this one live',
  /function _idleStorageEvent\(/.test(SRC) && /addEventListener\('storage', _idleStorageEvent\)/.test(SRC));
check('the storage listener is removed on disarm',
  /removeEventListener\('storage', _idleStorageEvent\)/.test(SRC));
check('the per-tab-only comparison is gone', !/Date\.now\(\) - _idleLast;/.test(SRC));

console.log('\n[2] The warning is shown where somebody can read it');
check('warning requires a visible tab',
  /IDLE_MS - IDLE_WARN_MS\)[\s\S]{0,120}visibilityState === 'visible'[\s\S]{0,40}showIdleWarning\(\)/.test(SRC));

console.log('\n[3] Sign-out is local to this browser');
check("signOut is called with scope 'local'", /signOut\(\{ scope: 'local' \}\)/.test(SRC));
check('there is a fallback for clients that reject the argument',
  /signOut\(\{ scope: 'local' \}\); \} catch \(_\) \{ sb\.auth\.signOut\(\); \}/.test(SRC));

console.log('\n[4] Long user-initiated compute holds the session open');
['runUncertaintyDisplay', 'runDFTMonteCarlo', 'generateCutsetReport', 'exportProjectAsPDF', 'exportTabAsPDF', 'calculateAllProbabilities']
  .forEach(fn => check('held: ' + fn, new RegExp("'" + fn + "'").test(SRC)));
check('the wrapper counts a begin for every op', /_wrapHeavyOps[\s\S]{0,900}_activityBegin\(\)/.test(SRC));
check('it releases on throw as well as on return',
  /catch \(e\) \{ _activityEnd\(\); throw e; \}/.test(SRC));
check('it releases when a promise settles either way',
  /out\.then\(function \(\) \{ _activityEnd\(\); \}, function \(\) \{ _activityEnd\(\); \}\)/.test(SRC));
check('double-wrapping is impossible', /__slIdleWrapped/.test(SRC));
check('BUSY_MAX_MS still caps a hung op so the lock cannot be disabled forever',
  /BUSY_MAX_MS = 15 \* 60 \* 1000/.test(SRC) && /\(Date\.now\(\) - _busySince\) >= BUSY_MAX_MS/.test(SRC));

console.log('\n[5] Policy unchanged, pin bumped');
check('still a 20-minute window', /IDLE_MS = 20 \* 60 \* 1000/.test(SRC));
check('still a 2-minute warning', /IDLE_WARN_MS = 2 \* 60 \* 1000/.test(SRC));
check('auth_gate pin at or past this batch', pinAtLeast(HTML, 'auth_gate.js', 62, 65));

console.log('\n' + (fail === 0 ? 'ALL GREEN — ' + pass + ' checks' : fail + ' FAILED, ' + pass + ' passed'));
process.exit(fail === 0 ? 0 : 1);

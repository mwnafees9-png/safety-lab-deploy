#!/usr/bin/env node
/*
 * Regression — a restored login must answer for the time it was away. (6 Sep 2026)
 *
 * Waqas: "I signed in 7 hours later and it didn't ask me for my user name and
 * password." The 20-minute idle timeout only ran while a tab was OPEN. Close the
 * laptop first and the timer stops; the stored login stays valid indefinitely;
 * on the next open the gate lifts and armIdleTimeout()'s first act was to
 * overwrite the stale activity timestamp with "now" — destroying the one piece
 * of evidence that the user had been away, before anyone read it.
 *
 * The fix: on the RESTORED-login path only, read that timestamp BEFORE the arm
 * overwrites it; if it exists and is stale, sign out LOCALLY, say why, show the
 * gate. A SIGNED_IN event (a typed password) is untouched — a fresh credential is
 * the thing that legitimately resets the clock.
 *
 * Run: node tests/regression_idle_restore_gate.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const src = S('auth_gate.js'), idx = S('index.html');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function fnBody(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  return '';
}
function before(hay, a, b) { const i = hay.indexOf(a), j = hay.indexOf(b); return i >= 0 && j >= 0 && i < j; }

console.log('\n[idle] the decision, EXECUTED against the real code');
const decider = fnBody('_idleAbandonedSince');
check('_idleAbandonedSince exists', decider.length > 0);
{
  // Run the real function with a controllable clock, storage and desktop flag.
  const IDLE_MS = 20 * 60 * 1000;
  function run(lastActivityMs, nowMs, desktop) {
    const store = {};
    if (lastActivityMs != null) store['safetyLab.idle.lastActivity'] = String(lastActivityMs);
    const ctx = {
      IDLE_MS,
      window: desktop ? { __SLAB_DESKTOP__: true } : {},
      localStorage: { getItem: k => (k in store ? store[k] : null) },
      Date: { now: () => nowMs },
      isFinite, parseInt
    };
    vm.createContext(ctx);
    vm.runInContext(
      'function _idleReadShared(){ try { const v = parseInt(localStorage.getItem("safetyLab.idle.lastActivity") || "0", 10); return isFinite(v) ? v : 0; } catch (_) { return 0; } }\n'
      + decider + '\nglobalThis.__r = _idleAbandonedSince();', ctx);
    return ctx.__r;
  }
  const NOW = 10_000_000_000;
  check('away 7 hours -> BOUNCE (returns the time away)', run(NOW - 7 * 3600e3, NOW, false) === 7 * 3600e3);
  check('away exactly 20 minutes -> BOUNCE (limit is inclusive)', run(NOW - IDLE_MS, NOW, false) === IDLE_MS);
  check('away 19 minutes -> ALLOW', run(NOW - 19 * 60e3, NOW, false) === 0);
  check('active 5 seconds ago -> ALLOW', run(NOW - 5000, NOW, false) === 0);
  check('NO timestamp at all -> ALLOW (a bounce here would loop a storage-less browser forever)',
        run(null, NOW, false) === 0,
        '_idleWriteShared fails silently when storage is unavailable; 0 must mean unknown, not stale');
  check('desktop -> ALLOW (it has its own lock, S23)', run(NOW - 7 * 3600e3, NOW, true) === 0);
}

console.log('\n[idle] the restored-login path consults it, and only that path');
{
  const i = src.indexOf('const { data: { session } } = await sb.auth.getSession();');
  const restored = strip(src.slice(i, i + 2200));
  check('the getSession() branch calls _idleAbandonedSince', /_idleAbandonedSince\(\)/.test(restored));
  check('it decides BEFORE the MFA step-up and the lift',
        before(restored, '_idleAbandonedSince()', '_mfaGateThenLift('),
        'an abandoned session must not be asked for a second factor on top of a first it no longer holds');
  check('a stale session is signed out LOCALLY, never globally',
        /signOut\(\{ scope: 'local' \}\)/.test(restored),
        'global scope revokes the refresh token on every device — the phone too');
  check('it tells the user why, in plain words',
        /You were away for/.test(restored) && /Please sign in again/.test(restored));
  check('and it returns without lifting', /renderGate\(\);\s*return;/.test(restored));
  // The typed-password path must be untouched.
  const signedIn = strip(src.slice(src.indexOf("if (event === 'SIGNED_IN'"), src.indexOf("if (event === 'SIGNED_IN'") + 1600));
  check('the SIGNED_IN (typed password) path does NOT consult it',
        !/_idleAbandonedSince/.test(signedIn),
        'a fresh credential is the thing that legitimately resets the clock');
}

console.log('\n[idle] the arm still bumps — this fix reads BEFORE it, it does not remove it');
{
  const arm = fnBody('armIdleTimeout');
  check('armIdleTimeout still bumps on arm (a fresh sign-in must reset the clock)', /_idleArmed = true; _idleBump\(\);/.test(arm));
}

console.log('\n[idle] the gate shows the reason');
check('renderGate displays _idleLockMessage', /showMessage\(_idleLockMessage/.test(src));

{
  const m = /auth_gate\.js\?v=([0-9.]+)/.exec(idx);
  check('auth_gate.js re-pinned so browsers fetch it', !!m && parseFloat(m[1]) >= 1.1, m ? m[1] : 'no pin');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

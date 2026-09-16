#!/usr/bin/env node
/*
 * Regression — the second factor had never once been used (16 Sep 2026).
 *
 * The sign-in step-up shipped 6 Sep (4f7679f): an account with a verified TOTP factor
 * is supposed to be challenged to AAL2 before the app opens. It was on by default. It
 * never ran. Not once, for anyone, in the life of the product.
 *
 * PRODUCTION EVIDENCE at the time of the fix: 40 users, 34 of whom had signed in; two
 * verified TOTP factors, one enrolled on 10 Sep by a user who then signed in on 14 Sep
 * — four days after enrolling and eight days after the step-up shipped. His session came
 * back AAL1. auth.mfa_amr_claims, which records how every session was authenticated,
 * held 20 `password` + 10 `email/signup` and ZERO `totp`.
 *
 * THE MECHANISM. needsChallenge() asked the client library:
 *     var d = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data;
 *     return d.currentLevel === 'aal1' && d.nextLevel === 'aal2';
 * In supabase-js the no-argument form of that call derives nextLevel from the CACHED
 * session — `(session.user.factors ?? []).filter(f => f.status === 'verified')` — and the
 * session persisted by a password sign-in carries no `factors` array. Factors are attached
 * by the /user endpoint, which only mfa.listFactors() calls. So nextLevel always equalled
 * currentLevel, needsChallenge() always returned false, and promptChallenge() — which is
 * correct, and does ask the network — was never reached.
 *
 * This suite drives the REAL needsChallenge() from site/mfa.js against a stub client
 * shaped exactly like supabase-js behaves. Case 1 is the bug: it fails against the old
 * body and passes against the new one.
 *
 * Run: node tests/regression_mfa_step_up.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

// ---------------------------------------------------------------- harness
// A minimal window/document/localStorage so mfa.js's IIFE can run in Node, plus a stub
// Supabase client whose two MFA calls behave the way the real library behaves:
//   getAuthenticatorAssuranceLevel()  -> reads the CACHED session (no `factors`)
//   listFactors()                     -> goes to /user, so it HAS the factors
function loadMFA(opts) {
  const store = Object.assign({}, opts.storage || {});
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { email: opts.email || 'x@y.z' } } } }),
      mfa: {
        // The real one returns nextLevel from the cached session, which never carries factors.
        getAuthenticatorAssuranceLevel: async () => {
          if (opts.aalThrows) throw new Error('network');
          if (opts.aalError) return { data: null, error: { message: 'boom' } };
          return { data: { currentLevel: opts.currentLevel, nextLevel: opts.currentLevel, currentAuthenticationMethods: [] }, error: null };
        },
        listFactors: async () => {
          if (opts.listError) return { data: null, error: { message: 'offline' } };
          return { data: { totp: opts.factors || [], all: opts.factors || [] }, error: null };
        }
      }
    }
  };
  const win = {
    getSupabaseClient: () => (opts.noClient ? null : client),
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    }
  };
  if (opts.noMfaApi) delete client.auth.mfa;
  const sandbox = {
    window: win, localStorage: win.localStorage, document: { createElement: () => ({ style: {}, appendChild(){}, setAttribute(){} }), body: { appendChild(){} } },
    console, setTimeout, clearTimeout, Promise, JSON, Date, String, Object, Array
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('site/mfa.js'), sandbox, { filename: 'mfa.js' });
  return { mfa: win.SafetyLabMFA, store };
}
const VERIFIED = [{ factor_type: 'totp', status: 'verified', id: 'f1' }];

(async function () {

console.log('\n[step-up] the bug: an enrolled account on an AAL1 session must be challenged');
{
  const { mfa } = loadMFA({ currentLevel: 'aal1', factors: VERIFIED });
  const need = await mfa.needsChallenge();
  check('a verified factor + an aal1 session asks for a challenge', need === true,
    'this is the exact production case: enrolled 10 Sep, signed in 14 Sep, never challenged');
}

console.log('\n[step-up] and the cases that must NOT change');
{
  const { mfa } = loadMFA({ currentLevel: 'aal1', factors: [] });
  check('no factor on the account -> no challenge, sign-in proceeds', (await mfa.needsChallenge()) === false,
    'people who never turned 2FA on must never be stopped');
}
{
  const { mfa } = loadMFA({ currentLevel: 'aal2', factors: VERIFIED });
  check('already stepped up to aal2 -> not challenged twice', (await mfa.needsChallenge()) === false);
}
{
  const { mfa } = loadMFA({ currentLevel: 'aal1', factors: [{ factor_type: 'totp', status: 'unverified', id: 'f9' }] });
  check('a half-finished enrollment is not a factor', (await mfa.needsChallenge()) === false);
}

console.log('\n[step-up] it reads the factor list from the network-backed source');
{
  const src = read('site/mfa.js');
  const body = src.slice(src.indexOf('async function needsChallenge'), src.indexOf('async function needsChallenge') + 1400);
  check('needsChallenge no longer decides on nextLevel', !/nextLevel/.test(body),
    'nextLevel comes from a cached session that never carries the factor list');
  check('needsChallenge calls _factors(), which goes through listFactors()', /_factors\(\)/.test(body));
  check('currentLevel is still read from the token', /currentLevel/.test(body));
  check('the mechanism is written down, not just fixed', /cached session|CACHED session/i.test(src));
}

console.log('\n[step-up] it fails CLOSED — the old code failed open in four places');
{
  const { mfa } = loadMFA({ currentLevel: 'aal1', factors: VERIFIED, aalError: true });
  check('cannot read the assurance level, but a factor exists -> challenge', (await mfa.needsChallenge()) === true);
}
{
  const { mfa } = loadMFA({ currentLevel: 'aal1', factors: VERIFIED, aalThrows: true });
  check('the assurance call throws, but a factor exists -> challenge', (await mfa.needsChallenge()) === true);
}
{
  const { mfa } = loadMFA({ currentLevel: 'aal1', factors: VERIFIED, noMfaApi: true });
  check('client has no MFA api at all -> no false confidence', (await mfa.needsChallenge()) === false,
    'nothing can be verified and nothing can be enrolled, so this is not a 2FA account');
}
{
  // The account enrolled earlier (hint present) and the factor list now fails to load.
  const { mfa } = loadMFA({ currentLevel: 'aal1', listError: true, email: 'dan@example.com',
                            storage: { 'safetyLab.mfa.enrolled.dan@example.com': '1' } });
  check('factor list offline + known-enrolled account -> still challenged', (await mfa.needsChallenge()) === true,
    'a network failure must not be a way to turn someone else\'s 2FA off');
  check('...and the challenge refuses rather than waving them through',
    (await mfa.promptChallenge({ mandatory: true })) === false);
}
{
  const { mfa } = loadMFA({ currentLevel: 'aal1', listError: true, email: 'new@example.com' });
  check('factor list offline + never-enrolled account -> not locked out', (await mfa.needsChallenge()) === false,
    'failing closed must not strand the 32 people who never enrolled');
}

console.log('\n[step-up] the enrollment hint is maintained, not just read');
{
  const { mfa, store } = loadMFA({ currentLevel: 'aal1', factors: VERIFIED, email: 'a@b.c' });
  await mfa.needsChallenge();
  check('a positive factor check records the hint', store['safetyLab.mfa.enrolled.a@b.c'] === '1');
}
{
  const { mfa, store } = loadMFA({ currentLevel: 'aal1', factors: [], email: 'a@b.c',
                                   storage: { 'safetyLab.mfa.enrolled.a@b.c': '1' } });
  await mfa.needsChallenge();
  check('removing the factor clears the hint', !('safetyLab.mfa.enrolled.a@b.c' in store),
    'a stale hint would lock out someone who deliberately turned 2FA off');
}

console.log('\n[gate] auth_gate must not open the app when the step-up cannot run');
{
  const g = read('site/auth_gate.js');
  check('a missing mfa.js with step-up on is refused, not ignored',
    /_stepUpOn && !window\.SafetyLabMFA[\s\S]{0,400}?_signOutToGate/.test(g),
    'the old condition fell straight through to onLift() and challenged nobody');
  check('the catch around the step-up no longer lifts the gate unconditionally',
    !/catch \(_\) \{ \/\* fail open to prior behavior \*\/ \}/.test(g));
  check('on an error it only opens for an account with no verified factor',
    /hasVerifiedFactor\(\)[\s\S]{0,300}?if \(_known\) \{ await _signOutToGate\(\); return; \}/.test(g));
  check('the failure is reported, not swallowed', /SLErrorWatch\.report\(e, 'auth_gate'\)/.test(g));
}

console.log('\n[gate] mfa.js loads before the gate that depends on it');
{
  const idx = read('site/index.html');
  check('mfa.js comes before auth_gate.js', idx.indexOf('mfa.js?v=') < idx.indexOf('auth_gate.js?v='),
    'the gate reads window.SafetyLabMFA during its own init');
  const pin = (n) => { const m = idx.match(new RegExp(n + '\\.js\\?v=([0-9.]+)')); return m && m[1]; };
  check('mfa pin moved past the broken build', pin('mfa') !== '1.2', pin('mfa'));
  check('auth_gate pin moved past the broken build', pin('auth_gate') !== '62.73', pin('auth_gate'));
}

console.log('\n[docs] nothing claims MFA is enforced for everyone while it is opt-in');
{
  const g = read('site/auth_gate.js');
  const forced = /window\.SL_MFA_MANDATORY === true/.test(g);
  check('forced enrollment is still gated behind SL_MFA_MANDATORY', forced);
  const setAnywhere = ['site', 'customer-install'].some(dir => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
      const f = path.join(d, e.name);
      if (e.isDirectory()) return e.name === 'vendor' ? [] : walk(f);
      return /\.(js|html)$/.test(e.name) ? [f] : [];
    });
    let hit = false;
    try {
      for (const f of walk(path.join(REPO, dir))) {
        if (f.endsWith('auth_gate.js')) continue;
        if (/SL_MFA_MANDATORY\s*=\s*true/.test(fs.readFileSync(f, 'utf8'))) { hit = true; break; }
      }
    } catch (_) {}
    return hit;
  });
  const trust = read('site/trust.html');
  const claimsEnforced = /enforced for every account|must enroll before/i.test(trust);
  check('the trust page does not claim enforcement unless the switch is actually on',
    setAnywhere === claimsEnforced,
    setAnywhere ? 'MFA is mandatory in the build but the trust page does not say so'
                : 'the trust page claims MFA is enforced, but nothing sets SL_MFA_MANDATORY');
}

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);
})();

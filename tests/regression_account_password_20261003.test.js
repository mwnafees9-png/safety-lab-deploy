#!/usr/bin/env node
/*
 * Regression: Change password, and the plain message when sign-up is off (3 Oct 2026).
 *
 * A customer server with no mail server now has open sign-up off; the administrator creates
 * accounts with a temporary password (customer-install/selfhost/add-user.sh). The app had no
 * way to change a password except an emailed reset link, so this adds one, behind the current
 * password and the second step (SafetyLabMFA.reauthenticate). Proven on the self-hosted stack
 * on 3 Oct 2026: temporary password signs in, updateUser changes it, the old one is refused,
 * open sign-up answers "Signups not allowed for this instance" (signup_disabled, 422).
 *
 * Run: node tests/regression_account_password_20261003.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const SRC = read('site/account_password.js');

function load(opts, source) {
  const calls = { reauth: [], update: [] };
  const client = { auth: {
    getSession: async () => ({ data: { session: { user: opts.user } } }),
    updateUser: async (u) => { calls.update.push(u); return opts.updateError ? { error: { message: opts.updateError } } : { data: {}, error: null }; },
    signInWithPassword: async () => ({ error: null })
  } };
  const win = { getSupabaseClient: () => client, showToast: () => {},
    SafetyLabMFA: { reauthenticate: async (e, p) => { calls.reauth.push([e, p]); return p === 'Right-Pass-1' ? { ok: true } : (p === 'TwoStep-Pass-1' ? { ok: false, reason: 'second-step' } : { ok: false, reason: 'password' }); } } };
  const sb = { window: win, document: { getElementById: () => null }, console, Promise, JSON, String, Object, Array };
  vm.createContext(sb); vm.runInContext(source || SRC, sb);
  return { P: win.SafetyLabPassword, calls };
}

(async function () {
  console.log('\n[rules] the new password');
  const { P } = load({});
  check('acceptable password passes', P.passwordProblem('Right-Pass-1', 'New-Pass-22', 'New-Pass-22') === '');
  check('current password required', P.passwordProblem('', 'New-Pass-22', 'New-Pass-22') !== '');
  check('too short refused', P.passwordProblem('a', 'Ab1', 'Ab1') !== '');
  check('needs lower, capital and number (the sign-up rule)', P.passwordProblem('a', 'alllowercase1', 'alllowercase1') !== '' && P.passwordProblem('a', 'NoNumbersHere', 'NoNumbersHere') !== '');
  check('the two new passwords must match', P.passwordProblem('a', 'New-Pass-22', 'New-Pass-23') !== '');
  check('the same password again is refused', P.passwordProblem('New-Pass-22', 'New-Pass-22', 'New-Pass-22') !== '');
  check('shown for password accounts', P.usesPassword({ app_metadata: { provider: 'email' } }) && P.usesPassword({ app_metadata: { provider: 'azure' }, identities: [{ provider: 'email' }] }));
  check('hidden for Microsoft sign-in accounts', !P.usesPassword({ app_metadata: { provider: 'azure' }, identities: [{ provider: 'azure' }] }) && !P.usesPassword(null));

  console.log('\n[flow] the current password first, then the change');
  { const t = load({}); const r = await t.P.change('w@co.test', 'Right-Pass-1', 'New-Pass-22', 'New-Pass-22');
    check('right current password: changed', r.ok && t.calls.reauth.length === 1 && t.calls.update.length === 1 && t.calls.update[0].password === 'New-Pass-22'); }
  { const t = load({}); const r = await t.P.change('w@co.test', 'Wrong-Pass-1', 'New-Pass-22', 'New-Pass-22');
    check('wrong current password: refused, nothing changed', !r.ok && /current password/.test(r.error) && t.calls.update.length === 0); }
  { const t = load({}); const r = await t.P.change('w@co.test', 'TwoStep-Pass-1', 'New-Pass-22', 'New-Pass-22');
    check('second step not completed: refused, nothing changed', !r.ok && /second step/.test(r.error) && t.calls.update.length === 0); }
  { const t = load({}); const r = await t.P.change('w@co.test', 'Right-Pass-1', 'weak', 'weak');
    check('a weak new password never reaches the server', !r.ok && t.calls.reauth.length === 0 && t.calls.update.length === 0); }
  { const t = load({ updateError: 'boom' }); const r = await t.P.change('w@co.test', 'Right-Pass-1', 'New-Pass-22', 'New-Pass-22');
    check('a server refusal is reported, not hidden', !r.ok && /boom/.test(r.error)); }
  { const mut = SRC.replace("if (!re || !re.ok) return", "if (false) return");
    check('mutation site present', mut !== SRC);
    const t = load({}, mut); await t.P.change('w@co.test', 'Wrong-Pass-1', 'New-Pass-22', 'New-Pass-22');
    check('MUTATION: without the current-password check a wrong password changes it', t.calls.update.length === 1); }
  check('the re-check is the one in mfa.js (second factor included)', /window\.SafetyLabMFA\.reauthenticate\(email, current\)/.test(SRC));

  console.log('\n[wiring]');
  const helpers = read('site/helpers_modules.js'), gate = read('site/auth_gate.js'), idx = read('site/index.html');
  check('the account panel has the mount and calls it', /id="acct-password-mount"/.test(helpers) && /SafetyLabPassword\.mount\('acct-password-mount'\)/.test(helpers));
  check('index.html loads account_password.js after mfa.js', idx.indexOf('account_password.js?v=') > idx.indexOf('mfa.js?v='));
  check('sign-up off says who creates accounts', /signups not allowed\|signup_disabled/.test(gate) && /created by your administrator/.test(gate));

  console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

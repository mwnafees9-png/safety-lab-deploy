/* signin_options.js (SLSignInOptions v1.0, 10 Nov 2026): what the sign-in screen offers, decided once per install.
 *
 * Waqas's brief, 10 Nov 2026: "The customer server sign-in screen shows hosted text ('Start a 10-day trial. No credit
 * card required', 'Sign in with Microsoft' when not set up). On a self-hosted install it should say accounts come from
 * the administrator, drop the trial wording, and show Microsoft sign-in only when that server has it configured."
 *
 * One place answers, and auth_gate.js and ms_sso.js both read it:
 *   ownServer()  the install signs in against the customer's own server (SLConfig.mode 'self-hosted')
 *   microsoft()  show "Sign in with Microsoft": on our hosted service, the page switch SL_MS_SSO_ENABLED as before; on a
 *                customer's own server, only once that server has said it has Microsoft sign-in turned on (its public
 *                auth settings, external.azure); until it answers, and if it cannot be asked, the button stays hidden
 *   signup()     the "Create account" tab: our hosted service only (a customer's administrator adds the accounts)
 *   text         the words the screen uses, without trial wording on a customer's own server
 *   probe()      asks the customer's own server once; fires 'slab-signin-options' when the answer is in
 * Files only never shows the sign-in at all (local_start.js).
 */
(function (root) {
  'use strict';
  var VERSION = '1.0';
  function cfg() { return root.SLConfig || null; }
  function ownServer() { var c = cfg(); return !!(c && c.mode === 'self-hosted' && !c.fatal && c.supabaseUrl); }
  var _ms = null, _probe = null;
  function microsoft() {
    var c = cfg();
    if (c && (c.browserOnly || c.fatal)) return false;
    if (ownServer()) return _ms === true;
    try { return root.SL_MS_SSO_ENABLED === true; } catch (_) { return false; }
  }
  function signup() { var c = cfg(); return !ownServer() && !(c && c.browserOnly); }
  function probe() {
    if (_probe) return _probe;
    if (!ownServer() || typeof root.fetch !== 'function') { _probe = Promise.resolve(microsoft()); return _probe; }
    var c = cfg();
    _probe = (async function () {
      try {
        var r = await root.fetch(String(c.supabaseUrl).replace(/\/+$/, '') + '/auth/v1/settings', { headers: { apikey: String(c.supabaseKey || '') }, cache: 'no-store' });
        if (!r || !r.ok) { _ms = false; }
        else { var j = await r.json(); _ms = !!(j && j.external && j.external.azure === true); }
      } catch (_) { _ms = false; }
      try { root.dispatchEvent(new Event('slab-signin-options')); } catch (_) {}
      return _ms;
    })();
    return _probe;
  }
  var HOSTED_TEXT = {
    signinSub: 'Sign in to continue with Safety Lab Aero.',
    signupSub: 'Start a 10-day trial. No credit card required. Email verification is required to activate the trial.',
    verifySent: 'Click it to activate your account and start your 10-day trial.',
    wrongPassword: 'Email or password is incorrect. If you have not signed up yet, switch to "Create account" above.',
    accountsFrom: ''
  };
  var OWN_TEXT = {
    signinSub: 'Sign in to continue with Safety Lab Aero on your organization\'s server.',
    signupSub: '',
    verifySent: 'Click it to activate your account.',
    wrongPassword: 'Email or password is incorrect. If you do not have an account on this server yet, ask your administrator to add you.',
    accountsFrom: 'Accounts on this server come from your administrator. To get one, or to reset a lost password, ask them.'
  };
  function text() { return ownServer() ? OWN_TEXT : HOSTED_TEXT; }
  var api = { VERSION: VERSION, ownServer: ownServer, microsoft: microsoft, signup: signup, probe: probe, text: text };
  try { root.SLSignInOptions = api; } catch (_) {}
  try { if (ownServer()) probe(); } catch (_) {}
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

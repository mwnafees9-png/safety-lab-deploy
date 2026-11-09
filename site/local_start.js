/* local_start.js (SLLocalStart v1.0, 10 Nov 2026): how a Files only install opens. No sign-in, no server.
 *
 * Waqas's brief, 10 Nov 2026: "Files only desktop installs can't get past the sign-in screen." auth_gate.js always
 * needed a backend session, and in Files only safety_lab.js fell back to Safety Lab's hosted address, which the
 * desktop's network fence blocks, so the sign-in could never finish. Wanted: "Files only opens with no sign-in, on a
 * valid license plus the accepted agreement. The user types a local profile name once, for the audit trail. No
 * backend client at all in that mode, and no fallback to our hosted address on any customer install."
 *
 * What it does (only when SLConfig.browserOnly; every other mode is untouched and keeps the sign-in):
 *   1. the license: the signed license verdict (slab_license.js) must be valid. If not, the screen says why in plain
 *      words and how to load one (on the desktop: Settings, License; in a browser: the license screen slab_license.js shows).
 *   2. the agreement: on the desktop the app's own start screen will not open the app until the agreement is accepted,
 *      so it is already accepted here; in a browser the agreement is shown here and accepted once (the version is kept
 *      in this browser, as the signed-in path keeps it too).
 *   3. the name: on the desktop, the computer account's name (no question); in a browser, asked once ("Your name, for the audit trail"), kept on this computer, and used wherever the
 *      app records who did something (sign-offs, answers, the journal). It is a label, not an account: there is no
 *      password and nothing leaves the computer.
 * auth_gate.js hands over to run() before it ever asks for a backend client, and safety_lab.js creates none: with
 * SLConfig present its address is SLConfig's, and in this mode that address is empty.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0';
  var LS_PROFILE = 'safetyLab.localProfile';          // { name, at }
  var LS_EULA = 'safetyLab.eula.acceptedVersion';     // the same key eula_modal.js keeps
  var GATE_ID = 'sl-auth-gate';

  function S(v) { return String(v == null ? '' : v); }
  function E(s) { return S(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cfg() { return root.SLConfig || null; }
  function active() { var c = cfg(); return !!(c && c.browserOnly && !c.fatal); }
  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (_) { return false; } }

  // ---- the profile name -----------------------------------------------------------------------------------------
  // 10 Nov 2026 (Waqas: "we should be getting this information from their login details"): on the desktop the name
  // comes from the account the person logged in to the computer with (the shell reads it, __SLAB_COMPUTER_ACCOUNT__), and
  // nothing is asked. Only a plain browser, where that name cannot be read, asks once.
  function computerAccount() { try { var a = root.__SLAB_COMPUTER_ACCOUNT__; var n = a && S(a.name).replace(/\s+/g, ' ').trim(); return n && !nameProblem(n) ? { name: n, at: '', from: 'computer', user: S(a.user) } : null; } catch (_) { return null; } }
  function profile() { var ca = computerAccount(); if (ca) return ca; return storedProfile(); }
  function storedProfile() { try { var p = JSON.parse(lsGet(LS_PROFILE) || 'null'); return p && p.name ? { name: S(p.name), at: S(p.at) } : null; } catch (_) { return null; } }
  function nameProblem(n) {
    n = S(n).replace(/\s+/g, ' ').trim();
    if (n.length < 2) return 'Type your name, at least two letters.';
    if (n.length > 80) return 'Keep the name under 80 characters.';
    if (/[<>]/.test(n)) return 'The name cannot contain < or >.';
    return '';
  }
  function setProfile(n) {
    n = S(n).replace(/\s+/g, ' ').trim();
    var bad = nameProblem(n); if (bad) return { ok: false, why: bad };
    if (!lsSet(LS_PROFILE, JSON.stringify({ name: n, at: new Date().toISOString() }))) return { ok: false, why: 'This computer would not keep the name. Free some space and try again.' };
    return { ok: true, name: n };
  }
  // the name is who did it, everywhere the app records a person (SLAutopilotUI.who, sign-offs, the journal)
  function applyIdentity(p) {
    if (!p) return;
    try { root.__slUser = { name: p.name, email: '', local: true }; } catch (_) {}
    try { if (typeof root.Review !== 'undefined' && root.Review.setReviewerName && !root.Review.getReviewerName()) root.Review.setReviewerName(p.name); } catch (_) {}
    try { if (typeof Review !== 'undefined' && Review.setReviewerName && !Review.getReviewerName()) Review.setReviewerName(p.name); } catch (_) {}   // eslint-disable-line no-undef
  }

  // ---- the license and the agreement ----------------------------------------------------------------------------------
  async function license() {
    try { if (root.__slabSignedLicenseReady && typeof root.__slabSignedLicenseReady.then === 'function') await root.__slabSignedLicenseReady; } catch (_) {}
    var r = root.SLLicense || { valid: false, reason: 'not checked' };
    var plain = typeof root.SLLicensePlainReason === 'function' ? root.SLLicensePlainReason(r.reason) : S(r.reason);
    return { valid: !!r.valid, plain: plain || 'No valid license on this computer.', customer: r.customer, expiresAt: r.expiresAt };
  }
  function agreementVersion() { return (root.SL_EULA && root.SL_EULA.version) || ''; }
  // on the desktop the app's own start screen has the agreement accepted before this page ever opens
  function agreementAccepted() { var c = cfg(); if (c && c.isDesktop) return true; var v = agreementVersion(); return !!v && lsGet(LS_EULA) === v; }

  // ---- the screen -----------------------------------------------------------------------------------------------------
  var CSS = '#' + GATE_ID + '.sl-local{position:fixed;inset:0;z-index:2147482000;background:#f6f8fc;color:#0f172a;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:8vh 16px}'
    + '#' + GATE_ID + '.sl-local .sll-card{background:#fff;border:1px solid #e4e8f1;border-radius:14px;box-shadow:0 12px 40px rgba(10,31,68,.12);width:100%;max-width:560px;padding:26px 28px}'
    + '#' + GATE_ID + '.sl-local h1{font-size:20px;margin:0 0 6px;color:#0a1f44}#' + GATE_ID + '.sl-local p{margin:0 0 12px;color:#0f172a}'
    + '#' + GATE_ID + '.sl-local label{display:block;font-weight:600;font-size:13px;margin:14px 0 6px}'
    + '#' + GATE_ID + '.sl-local input[type=text]{width:100%;box-sizing:border-box;font:inherit;padding:10px 12px;border:1px solid #c7cbd1;border-radius:9px;color:#0f172a;background:#fff}'
    + '#' + GATE_ID + '.sl-local .sll-agree{max-height:240px;overflow:auto;border:1px solid #e4e8f1;border-radius:10px;padding:12px 14px;font-size:12.5px;margin:6px 0 10px;color:#0f172a}'
    + '#' + GATE_ID + '.sl-local .sll-chk{display:flex;gap:9px;align-items:flex-start;font-weight:400;font-size:13px}'
    + '#' + GATE_ID + '.sl-local button{font:inherit;font-weight:600;border-radius:9px;padding:10px 18px;cursor:pointer;border:none;color:#fff;background:linear-gradient(135deg,#007aff,#af52de);margin-top:16px}'
    + '#' + GATE_ID + '.sl-local button.sll-plain{background:#fff;color:#0f172a;border:1px solid #c7cbd1}'
    + '#' + GATE_ID + '.sl-local .sll-err{color:#b42318;font-weight:600;margin-top:10px}#' + GATE_ID + '.sl-local .sll-ok{color:#14532d;font-weight:600}'
    + 'body.theme-dark #' + GATE_ID + '.sl-local{background:#0f1218;color:#e8eaed}body.theme-dark #' + GATE_ID + '.sl-local .sll-card{background:#161a22;border-color:#2e333c}'
    + 'body.theme-dark #' + GATE_ID + '.sl-local h1,body.theme-dark #' + GATE_ID + '.sl-local p,body.theme-dark #' + GATE_ID + '.sl-local .sll-agree{color:#e8eaed}body.theme-dark #' + GATE_ID + '.sl-local input[type=text]{background:#1e232b;color:#e8eaed;border-color:#3a414c}'
    + 'body.theme-dark #' + GATE_ID + '.sl-local .sll-err{color:#ff8a80}body.theme-dark #' + GATE_ID + '.sl-local .sll-ok{color:#86efac}body.theme-dark #' + GATE_ID + '.sl-local button.sll-plain{background:#1e232b;color:#e8eaed;border-color:#3a414c}';
  function screen(html) {
    var d = root.document; if (!d) return null;
    if (!d.getElementById('sl-local-css')) { var st = d.createElement('style'); st.id = 'sl-local-css'; st.textContent = CSS; (d.head || d.documentElement).appendChild(st); }
    var g = d.getElementById(GATE_ID);
    if (!g) { g = d.createElement('div'); g.id = GATE_ID; (d.body || d.documentElement).appendChild(g); }
    g.className = 'sl-local';
    g.innerHTML = '<div class="sll-card" data-sll="1">' + html + '</div>';
    try { d.documentElement.classList.add('sl-auth-gate-blocked'); } catch (_) {}
    try { if (typeof root.__slDismissBootSplash === 'function') root.__slDismissBootSplash(); } catch (_) {}
    return g;
  }
  function lift() {
    var d = root.document; if (!d) return;
    var g = d.getElementById(GATE_ID); if (g && g.parentNode) g.parentNode.removeChild(g);
    try { d.documentElement.classList.remove('sl-auth-gate-blocked'); } catch (_) {}
    try { if (typeof root.__slDismissBootSplash === 'function') root.__slDismissBootSplash(); } catch (_) {}
  }

  // auth_gate.js calls run() while the deferred scripts are still loading (eula_modal.js comes after it), so wait for
  // the page to finish loading before reading the agreement.
  var _ready = new Promise(function (res) {
    var d = root.document; if (!d || d.readyState === 'complete') { res(); return; }
    var done = false, go = function () { if (!done) { done = true; res(); } };
    try { d.addEventListener('DOMContentLoaded', go); root.addEventListener('load', go); } catch (_) { go(); }
  });
  var _state = { step: '', lic: null };
  async function run() {
    if (!active()) return false;
    await _ready;
    var lic = _state.lic = await license();
    if (!lic.valid) { showLicense(lic); return true; }
    if (!agreementAccepted()) { showAgreement(); return true; }
    var p = profile();
    if (!p) { showName(); return true; }
    applyIdentity(p); lift(); _state.step = 'open';
    try { root.dispatchEvent(new CustomEvent('slab-local-start', { detail: { name: p.name } })); } catch (_) {}
    return true;
  }
  // slab_license.js shows the screen that loads a license on every customer install (one installer, one place); this
  // screen sits under it and says why the app has not opened, so nothing opens around it.
  function showLicense(lic) {
    _state.step = 'license';
    var c = cfg(), desk = !!(c && c.isDesktop);
    screen('<h1>This install needs a valid license</h1><p>This install keeps your projects as files on this computer, with no server and no sign-in. It opens once a valid license is loaded.</p>'
      + '<p class="sll-err" data-sll-reason="1">' + E(lic.plain) + '</p>'
      + (desk ? '<p>Load the license in Settings, under License (the menu Safety Lab Aero, Settings), then the app reloads.</p>'
              : '<p>Load the license file on the license screen; the app reloads when it is accepted.</p>'));
  }
  function showAgreement() {
    _state.step = 'agreement';
    var html = (root.SL_EULA && root.SL_EULA.html) || '';
    screen('<h1>Accept the agreement</h1><p>Read the agreement once before you start. It is kept on this computer that you accepted it.</p>'
      + '<div class="sll-agree">' + html + '</div>'
      + '<label class="sll-chk"><input type="checkbox" id="sll-agree-cb"><span>I have read and agree to the Safety Lab Aero End User License and Subscription Agreement.</span></label>'
      + '<button type="button" id="sll-agree-go" disabled>Agree and continue</button>');
    var cb = root.document.getElementById('sll-agree-cb'), go = root.document.getElementById('sll-agree-go');
    cb.addEventListener('change', function () { go.disabled = !cb.checked; });
    go.addEventListener('click', function () { if (!cb.checked) return; acceptAgreement(); run(); });
  }
  function acceptAgreement() { var v = agreementVersion(); return !!v && lsSet(LS_EULA, v); }
  function showName() {
    _state.step = 'name';
    screen('<h1>Who is working on this computer?</h1><p>This install keeps your projects as files on this computer, with no server and no sign-in. Type your name once: the app records it with what you do (sign-offs, answers, decisions), for the audit trail. It stays on this computer.</p>'
      + '<label for="sll-name">Your name, for the audit trail</label><input type="text" id="sll-name" maxlength="80" autocomplete="name" placeholder="For example, Alex Morgan">'
      + '<div class="sll-err" id="sll-name-err"></div><button type="button" id="sll-name-go">Start</button>');
    var inp = root.document.getElementById('sll-name'), go = root.document.getElementById('sll-name-go');
    var submit = function () { var r = setProfile(inp.value); if (!r.ok) { root.document.getElementById('sll-name-err').textContent = r.why; return; } run(); };
    go.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    try { inp.focus(); } catch (_) {}
  }

  var api = { VERSION: VERSION, active: active, run: run, profile: profile, computerAccount: computerAccount, setProfile: setProfile, nameProblem: nameProblem, agreementAccepted: agreementAccepted, acceptAgreement: acceptAgreement, state: function () { return _state.step; }, LS_PROFILE: LS_PROFILE };
  try { root.SLLocalStart = api; } catch (_) {}
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

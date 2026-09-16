// 13 Sep 2026 (R19 step 2): every fire-and-forget promise chain in this file now ends in .catch → SLErrorWatch.report(e, module), so a failure is recorded and told to the person instead of dying in the console.
// mfa.js — v1.0 — Two-factor authentication (TOTP / authenticator app) for Safety Lab Aero.
// BORN MODULAR: new file, minimal monolith seams. Uses Supabase's built-in MFA
// (auth.mfa.*) so the secret and verification live server-side; the app only drives
// the enrollment + challenge UI.
//
// Two responsibilities:
//   1) Account panel section  — window.SafetyLabMFA.mount(containerId)
//        Enroll (QR + 6-digit verify), show status, and remove a TOTP factor.
//   2) Sign-in step-up        — window.SafetyLabMFA.needsChallenge()/promptChallenge()
//        After a password sign-in, if the account has a verified factor the session
//        is only AAL1; auth_gate.js calls promptChallenge() to reach AAL2 before it
//        lifts the gate. Accounts with NO factor are unaffected (they stay AAL1/AAL1).
//
// Non-disruptive by design: 2FA is opt-in per user. Enforcement (e.g. requiring it
// org-wide) is a policy decision layered on top of this — see MFA_NOTES in /trust.
//
// 16 Sep 2026 — v1.3. needsChallenge() was asking the client library a question it
// answers from a cached session that never carries the factor list, so it returned
// false for every account and the step-up built on 6 Sep had never run once. See the
// comment on needsChallenge for the mechanism and the production evidence.
(function () {
    'use strict';

    function _sb() {
        try {
            if (typeof window.getSupabaseClient === 'function') { var c = window.getSupabaseClient(); if (c) return c; }
            if (typeof window._initSupabaseClient === 'function') { var d = window._initSupabaseClient(); if (d) return d; }
        } catch (_) {}
        return null;
    }
    function _toast(m, k) { try { if (typeof window.showToast === 'function') window.showToast(m, k || 'info'); } catch (_) {} }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

    // ------------------------------------------------------------------ status
    // Returns { supported, verified:[factors], unverified:[factors] }.
    async function _factors() {
        var sb = _sb();
        if (!sb || !sb.auth || !sb.auth.mfa || typeof sb.auth.mfa.listFactors !== 'function') {
            return { supported: false, verified: [], unverified: [] };
        }
        try {
            var res = await sb.auth.mfa.listFactors();
            if (res && res.error) throw res.error;
            var totp = (res && res.data && (res.data.totp || res.data.all)) || [];
            var verified = [], unverified = [];
            totp.forEach(function (f) {
                if ((f.factor_type || f.factorType || 'totp') !== 'totp') return;
                if (f.status === 'verified') verified.push(f); else unverified.push(f);
            });
            return { supported: true, verified: verified, unverified: unverified };
        } catch (e) {
            return { supported: true, verified: [], unverified: [], error: (e && e.message) || String(e) };
        }
    }

    // A local note that this account HAS enrolled a factor. Not a security control -- a
    // hint, so that a network failure cannot silently turn 2FA off. It is written
    // whenever we positively determine the factor state, and read only when we cannot.
    // Someone signing in with a stolen password on their OWN machine has no hint, which
    // is exactly the case 2FA exists to stop.
    function _enrolledKey(email) { return 'safetyLab.mfa.enrolled.' + String(email || '').toLowerCase(); }
    async function _sessionEmail() {
        try {
            var sb = _sb();
            var r = await sb.auth.getSession();
            return (r && r.data && r.data.session && r.data.session.user && r.data.session.user.email) || '';
        } catch (_) { return ''; }
    }
    function _rememberEnrolled(email, yes) {
        if (!email) return;
        try {
            if (yes) localStorage.setItem(_enrolledKey(email), '1');
            else localStorage.removeItem(_enrolledKey(email));
        } catch (_) {}
    }
    function _wasEnrolled(email) {
        if (!email) return false;
        try { return localStorage.getItem(_enrolledKey(email)) === '1'; } catch (_) { return false; }
    }

    // Is a step-up challenge required to reach AAL2 for the current session?
    //
    // 16 Sep 2026 -- REWRITTEN, because the old body returned false for everyone, always.
    // It read:
    //     var d = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data;
    //     return d.currentLevel === 'aal1' && d.nextLevel === 'aal2';
    // In supabase-js the NO-ARGUMENT form of getAuthenticatorAssuranceLevel derives
    // nextLevel from the CACHED session:
    //     (session.user.factors ?? []).filter(f => f.status === 'verified').length > 0 && (next = 'aal2')
    // The session persisted by a password sign-in carries no `factors` array -- factors
    // are attached by the /user endpoint, which only mfa.listFactors() calls. So nextLevel
    // stayed equal to currentLevel and this returned false even for an account with a
    // working authenticator. The step-up shipped 6 Sep and was never once reached.
    // EVIDENCE on production before this fix: two verified TOTP factors (one enrolled
    // 10 Sep, that user signed in 14 Sep), 30 sessions, and auth.mfa_amr_claims holding
    // 20 `password` + 10 `email/signup` and ZERO `totp`. Not one second factor had ever
    // been used in the life of the product.
    // currentLevel is sound -- it reads the `aal` claim out of the token. Only the factor
    // list has to come from the network-backed source, which _factors() already is.
    async function needsChallenge() {
        var email = await _sessionEmail();
        var st = await _factors();
        if (!st.supported) return false;                 // no MFA API on this client at all

        if (st.error) {
            // We could not determine the factor state. FAIL CLOSED if we have ever seen a
            // factor on this account, rather than repeat the bug this function just had.
            return _wasEnrolled(email);
        }
        _rememberEnrolled(email, st.verified.length > 0);
        if (!st.verified.length) return false;           // no factor -> nothing to step up to

        // The account HAS a factor from here on, so every remaining path fails CLOSED.
        var sb = _sb();
        try {
            if (!sb || !sb.auth || !sb.auth.mfa || typeof sb.auth.mfa.getAuthenticatorAssuranceLevel !== 'function') return true;
            var res = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
            if (res && res.error) return true;
            var d = (res && res.data) || {};
            return d.currentLevel !== 'aal2';
        } catch (_) { return true; }
    }

    // ----------------------------------------------------------- small helpers
    function _overlay() {
        var ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;' +
            'background:rgba(8,12,20,.6);backdrop-filter:blur(2px);padding:24px;' +
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;';
        return ov;
    }
    function _card(width) {
        var c = document.createElement('div');
        c.style.cssText = 'background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);' +
            'border:1px solid var(--color-border-hair,rgba(0,0,0,.12));border-radius:14px;width:min(' + (width || 440) + 'px,96vw);' +
            'box-shadow:0 24px 64px rgba(0,0,0,.35);overflow:hidden;';
        return c;
    }
    var BTN_PRIMARY = 'border:none;border-radius:9px;background:var(--color-accent,#4E63D8);color:#fff;font:inherit;font-weight:600;padding:9px 16px;cursor:pointer;font-size:13.5px;';
    var BTN_GHOST = 'border:1px solid var(--color-border-hair,rgba(0,0,0,.15));background:transparent;color:var(--color-text-secondary,#667085);border-radius:9px;padding:9px 14px;font:inherit;font-size:13.5px;cursor:pointer;';
    var CODE_INPUT = 'width:100%;box-sizing:border-box;margin-top:8px;padding:11px 13px;border:1px solid var(--color-border-hair,rgba(0,0,0,.18));border-radius:9px;font:inherit;font-size:20px;letter-spacing:6px;text-align:center;background:var(--color-surface-2,#fff);color:inherit;';

    // ------------------------------------------------------- account panel UI
    async function mount(containerId) {
        var el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = '<div style="font-size:12px;font-weight:600;color:var(--color-text-secondary,#667085);">Two-factor authentication</div>' +
            '<div style="font-size:11.5px;color:var(--color-text-tertiary,#8a93a6);margin-top:4px;">Checking…</div>';
        var st = await _factors();
        if (!st.supported) { el.innerHTML = ''; return; }

        var enabled = st.verified.length > 0;
        var head = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
            '<div style="font-size:12px;font-weight:600;color:var(--color-text-secondary,#667085);">Two-factor authentication</div>' +
            (enabled
                ? '<span style="font-size:10.5px;font-weight:700;color:#15803d;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.35);border-radius:999px;padding:2px 9px;">● ENABLED</span>'
                : '<span style="font-size:10.5px;font-weight:700;color:#92660a;background:rgba(217,138,43,.12);border:1px solid rgba(217,138,43,.35);border-radius:999px;padding:2px 9px;">OFF</span>') +
            '</div>';

        if (enabled) {
            el.innerHTML = head +
                '<div style="font-size:11.5px;color:var(--color-text-secondary,#667085);margin:8px 0 10px;line-height:1.45;">' +
                'An authenticator app is required at sign-in. Keep your recovery method safe — losing the app means contacting support to reset.</div>' +
                '<button type="button" id="mfa-remove" style="' + BTN_GHOST + 'color:#b91c1c;border-color:#fca5a5;">Remove 2FA…</button>';
            var rm = document.getElementById('mfa-remove');
            if (rm) rm.onclick = function () { _confirmRemove(st.verified[0], containerId); };
        } else {
            el.innerHTML = head +
                '<div style="font-size:11.5px;color:var(--color-text-secondary,#667085);margin:8px 0 10px;line-height:1.45;">' +
                'Add a time-based code from an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password, Authy) as a second step at sign-in.</div>' +
                '<button type="button" id="mfa-enable" style="' + BTN_PRIMARY + '">Enable 2FA</button>';
            var en = document.getElementById('mfa-enable');
            if (en) en.onclick = function () { _enrollFlow(containerId); };
        }
    }

    // Is there a verified TOTP factor on this account?
    async function hasVerifiedFactor() {
        var s = await _factors();
        return !!(s.supported && s.verified.length);
    }

    // Enrollment modal → resolves TRUE when a factor is verified (or when MFA infra
    // can't even start, so enforcement can never brick all logins — fail open),
    // FALSE only if the user deliberately cancels. opts.mandatory hardens the modal:
    // no backdrop-dismiss, and the cancel button reads "Cancel & sign out".
    function promptEnroll(opts) {
        opts = opts || {};
        return new Promise(async function (resolve) {
            var sb = _sb();
            if (!sb || !sb.auth || !sb.auth.mfa || typeof sb.auth.mfa.enroll !== 'function') {
                _toast('2FA is unavailable right now.', 'error');
                resolve(true); return;   // fail open — never trap the user out of the app
            }
            // Clean up any stale unverified factor so enroll doesn't collide.
            try {
                var pre = await _factors();
                for (var i = 0; i < pre.unverified.length; i++) {
                    try { await sb.auth.mfa.unenroll({ factorId: pre.unverified[i].id }); } catch (_) {}
                }
            } catch (_) {}

            var enroll;
            try {
                enroll = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator (' + new Date().toISOString().slice(0, 10) + ')' });
                if (enroll && enroll.error) throw enroll.error;
            } catch (e) {
                _toast('Could not start 2FA setup: ' + ((e && e.message) || e), 'error');
                resolve(true); return;   // fail open
            }
            var factorId = enroll.data.id;
            var qr = (enroll.data.totp && enroll.data.totp.qr_code) || '';
            var secret = (enroll.data.totp && enroll.data.totp.secret) || '';

            var ov = _overlay(), card = _card(460);
            card.innerHTML =
                '<div style="padding:16px 18px 10px;border-bottom:1px solid var(--color-border-hair,rgba(0,0,0,.1));">' +
                '  <div style="font-size:16px;font-weight:800;">' + (opts.mandatory ? 'Two-factor authentication required' : 'Set up two-factor authentication') + '</div>' +
                '  <div style="font-size:12px;color:var(--color-text-secondary,#667085);margin-top:2px;">' +
                (opts.mandatory ? 'Your organization requires 2FA. Scan the code with an authenticator app, then enter the 6-digit code to finish.' : 'Scan the code, then enter the 6-digit code your app shows.') +
                '</div>' +
                '</div>' +
                '<div style="padding:16px 18px;">' +
                '  <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">' +
                '    <div style="flex:0 0 auto;background:#fff;border:1px solid var(--color-border-hair,rgba(0,0,0,.12));border-radius:10px;padding:8px;">' +
                (qr ? '<img alt="2FA QR code" src="' + _esc(qr) + '" style="width:150px;height:150px;display:block;">' : '<div style="width:150px;height:150px;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;">No QR</div>') +
                '    </div>' +
                '    <div style="flex:1;min-width:160px;">' +
                '      <div style="font-size:11.5px;color:var(--color-text-secondary,#667085);">Can\'t scan? Enter this key manually:</div>' +
                '      <div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;word-break:break-all;background:var(--color-surface-3,rgba(0,0,0,.04));border-radius:8px;padding:8px;margin-top:6px;">' + _esc(secret) + '</div>' +
                '    </div>' +
                '  </div>' +
                '  <label style="display:block;font-size:12px;font-weight:600;color:var(--color-text-secondary,#667085);margin-top:14px;">6-digit code' +
                '    <input id="mfa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="' + CODE_INPUT + '"></label>' +
                '  <div id="mfa-msg" style="font-size:12px;min-height:14px;margin-top:8px;color:#b91c1c;"></div>' +
                '</div>' +
                '<div style="display:flex;justify-content:flex-end;gap:10px;padding:12px 18px;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.1));">' +
                '  <button type="button" id="mfa-cancel" style="' + BTN_GHOST + '">' + (opts.mandatory ? 'Cancel &amp; sign out' : 'Cancel') + '</button>' +
                '  <button type="button" id="mfa-verify" style="' + BTN_PRIMARY + '">Verify &amp; turn on</button>' +
                '</div>';
            ov.appendChild(card);
            document.body.appendChild(ov);

            var done = false;
            var finish = async function (val) {
                if (done) return; done = true;
                if (!val) { try { await sb.auth.mfa.unenroll({ factorId: factorId }); } catch (_) {} }  // drop dangling unverified factor
                try { ov.remove(); } catch (_) {}
                resolve(val);
            };
            if (!opts.mandatory) ov.addEventListener('mousedown', function (e) { if (e.target === ov) finish(false); });
            document.getElementById('mfa-cancel').onclick = function () { finish(false); };
            var input = document.getElementById('mfa-code');
            var msg = document.getElementById('mfa-msg');
            try { input.focus(); } catch (_) {}
            input.oninput = function () { input.value = input.value.replace(/\D/g, '').slice(0, 6); };

            document.getElementById('mfa-verify').onclick = async function () {
                var code = (input.value || '').replace(/\D/g, '');
                if (code.length !== 6) { msg.textContent = 'Enter the 6-digit code from your app.'; return; }
                var vbtn = this; vbtn.disabled = true; var orig = vbtn.textContent; vbtn.textContent = 'Verifying…'; msg.textContent = '';
                try {
                    var v = await sb.auth.mfa.challengeAndVerify({ factorId: factorId, code: code });
                    if (v && v.error) throw v.error;
                    _toast('Two-factor authentication is on.', 'success', 3000);
                    finish(true);
                } catch (e) {
                    msg.textContent = 'That code didn\'t match. Check your app and try again.';
                    vbtn.disabled = false; vbtn.textContent = orig;
                }
            };
        });
    }

    // Account-panel entry point: enroll (non-mandatory), then refresh the section.
    function _enrollFlow(containerId) {
        promptEnroll({ mandatory: false }).then(function () { try { mount(containerId); } catch (_) {} }).catch(function (e) { if (window.SLErrorWatch) SLErrorWatch.report(e, 'mfa'); });
    }

    function _confirmRemove(factor, containerId) {
        var sb = _sb();
        var ov = _overlay(), card = _card(420);
        card.innerHTML =
            '<div style="padding:18px 20px 10px;">' +
            '  <div style="font-size:16px;font-weight:800;color:#b91c1c;">Remove two-factor authentication?</div>' +
            '  <div style="font-size:12.5px;color:var(--color-text-secondary,#667085);margin-top:8px;line-height:1.5;">' +
            'Your account will no longer require a second step at sign-in. You can re-enable it any time.</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:flex-end;gap:10px;padding:12px 20px;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.1));">' +
            '  <button type="button" id="mfa-rm-cancel" style="' + BTN_GHOST + '">Keep 2FA</button>' +
            '  <button type="button" id="mfa-rm-go" style="' + BTN_PRIMARY + 'background:#dc2626;">Remove</button>' +
            '</div>';
        ov.appendChild(card);
        document.body.appendChild(ov);
        var close = function () { try { ov.remove(); } catch (_) {} };
        ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
        document.getElementById('mfa-rm-cancel').onclick = close;
        document.getElementById('mfa-rm-go').onclick = async function () {
            this.disabled = true; this.textContent = 'Removing…';
            try {
                var r = await sb.auth.mfa.unenroll({ factorId: factor.id });
                if (r && r.error) throw r.error;
                _toast('Two-factor authentication removed.', 'info', 2500);
            } catch (e) {
                _toast('Could not remove 2FA: ' + ((e && e.message) || e), 'error');
            }
            close();
            try { await mount(containerId); } catch (_) {}
        };
    }

    // ------------------------------------------------------- sign-in step-up
    // Shows a blocking modal that verifies a TOTP code to raise the session to
    // AAL2. Resolves true on success; false if the user cancels. auth_gate.js
    // signs the user out on false so an un-stepped-up session never proceeds.
    function promptChallenge(opts) {
        opts = opts || {};
        return new Promise(async function (resolve) {
            var sb = _sb();
            var st = await _factors();
            // 16 Sep 2026 -- "could not tell" is no longer treated as "no factor". If the
            // factor list failed to load and this account is known to have enrolled one,
            // we cannot verify a second factor, so the sign-in does not proceed; auth_gate
            // signs out on false. An account with no factor still passes straight through,
            // so a network blip never locks out the people who never turned 2FA on.
            if (st.error && _wasEnrolled(await _sessionEmail())) { resolve(false); return; }
            if (!st.supported || !st.verified.length) { resolve(true); return; }   // nothing to challenge
            var factor = st.verified[0];

            var ov = _overlay(), card = _card(400);
            card.innerHTML =
                '<div style="padding:18px 20px 10px;text-align:center;">' +
                '  <div style="width:44px;height:44px;border-radius:11px;margin:0 auto 10px;background:linear-gradient(135deg,#007aff 0%,#af52de 100%);position:relative;">' +
                '    <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;">🔐</span></div>' +
                '  <div style="font-size:17px;font-weight:800;">Two-step verification</div>' +
                '  <div style="font-size:12.5px;color:var(--color-text-secondary,#667085);margin-top:4px;">Enter the 6-digit code from your authenticator app to finish signing in.</div>' +
                '  <input id="mfa-ch-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="' + CODE_INPUT + '">' +
                '  <div id="mfa-ch-msg" style="font-size:12px;min-height:14px;margin-top:8px;color:#b91c1c;"></div>' +
                '</div>' +
                '<div style="display:flex;justify-content:' + (opts.mandatory ? 'space-between' : 'flex-end') + ';gap:10px;padding:12px 20px;border-top:1px solid var(--color-border-hair,rgba(0,0,0,.1));">' +
                '  <button type="button" id="mfa-ch-cancel" style="' + BTN_GHOST + '">' + (opts.mandatory ? 'Cancel &amp; sign out' : 'Cancel') + '</button>' +
                '  <button type="button" id="mfa-ch-go" style="' + BTN_PRIMARY + '">Verify</button>' +
                '</div>';
            ov.appendChild(card);
            document.body.appendChild(ov);

            var done = false;
            var finish = function (val) { if (done) return; done = true; try { ov.remove(); } catch (_) {} resolve(val); };
            var input = document.getElementById('mfa-ch-code');
            var msg = document.getElementById('mfa-ch-msg');
            try { input.focus(); } catch (_) {}
            input.oninput = function () { input.value = input.value.replace(/\D/g, '').slice(0, 6); };
            document.getElementById('mfa-ch-cancel').onclick = function () { finish(false); };
            document.getElementById('mfa-ch-go').onclick = async function () {
                var code = (input.value || '').replace(/\D/g, '');
                if (code.length !== 6) { msg.textContent = 'Enter the 6-digit code.'; return; }
                this.disabled = true; var orig = this.textContent; this.textContent = 'Verifying…'; msg.textContent = '';
                try {
                    var v = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code });
                    if (v && v.error) throw v.error;
                    finish(true);
                } catch (e) {
                    msg.textContent = 'That code didn\'t match. Try again.';
                    this.disabled = false; this.textContent = orig;
                }
            };
        });
    }

    window.SafetyLabMFA = {
        mount: mount,
        needsChallenge: needsChallenge,
        promptChallenge: promptChallenge,
        hasVerifiedFactor: hasVerifiedFactor,
        promptEnroll: promptEnroll,
        _factors: _factors,
        _wasEnrolled: _wasEnrolled,
        _rememberEnrolled: _rememberEnrolled
    };
})();

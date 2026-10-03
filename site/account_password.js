// account_password.js: v1.0. "Change password" in the account panel. NEW 3 Oct 2026.
// BORN MODULAR: one mount point in the account panel (helpers_modules.js, #acct-password-mount).
//
// WHY. On a customer's own server with no mail server, open sign-up is off and the administrator
// creates each account with a temporary password (customer-install/selfhost/add-user.sh). The
// app had no way to change a password except the emailed reset link, which such a server cannot
// send, so a temporary password would have stayed forever. This is the way to replace it, and it
// works the same on every server.
//
// RULES. The current password is checked first through SafetyLabMFA.reauthenticate, the one
// password re-check in the app, so an account with a second factor takes that step too and the
// session stays two-factor. The new password follows the sign-up rule (8 or more characters, a
// lowercase letter, a capital, a number). Shown only for accounts that sign in with a password;
// an account that signs in through Microsoft has no password here to change.
(function () {
    'use strict';
    function _sb() {
        try {
            if (typeof window.getSupabaseClient === 'function') { var c = window.getSupabaseClient(); if (c) return c; }
        } catch (_) {}
        return null;
    }
    function _toast(m, k) { try { if (typeof window.showToast === 'function') window.showToast(m, k || 'info'); } catch (_) {} }

    // Pure, so the wall can execute it: '' when acceptable, otherwise the reason in plain words.
    function passwordProblem(current, next, confirm) {
        if (!current) return 'Enter your current password.';
        if (!next || next.length < 8) return 'The new password must be at least 8 characters.';
        if (!/[a-z]/.test(next) || !/[A-Z]/.test(next) || !/[0-9]/.test(next)) return 'The new password needs a lowercase letter, a capital letter and a number.';
        if (next !== confirm) return 'The two new passwords do not match.';
        if (next === current) return 'The new password is the same as the current one.';
        return '';
    }
    function usesPassword(user) {
        if (!user) return false;
        var p = user.app_metadata && user.app_metadata.provider;
        if (p === 'email') return true;
        var ids = user.identities || [];
        for (var i = 0; i < ids.length; i++) if (ids[i] && ids[i].provider === 'email') return true;
        return false;
    }

    async function change(email, current, next, confirm) {
        var prob = passwordProblem(current, next, confirm);
        if (prob) return { ok: false, error: prob };
        var sb = _sb();
        if (!sb || !sb.auth) return { ok: false, error: 'Not connected to a server.' };
        var re;
        if (window.SafetyLabMFA && typeof window.SafetyLabMFA.reauthenticate === 'function') re = await window.SafetyLabMFA.reauthenticate(email, current);
        else { var r0 = await sb.auth.signInWithPassword({ email: email, password: current }); re = { ok: !(r0 && r0.error), reason: 'password' }; }
        if (!re || !re.ok) return { ok: false, error: re && re.reason === 'second-step' ? 'Not changed: the second step was not completed.' : 'Your current password is not correct.' };
        var u;
        try { u = await sb.auth.updateUser({ password: next }); } catch (e) { return { ok: false, error: 'Could not change the password: ' + ((e && e.message) || e) }; }
        if (u && u.error) return { ok: false, error: 'Could not change the password: ' + (u.error.message || 'refused by the server') };
        return { ok: true };
    }

    async function mount(containerId) {
        var el = document.getElementById(containerId);
        if (!el) return;
        var sb = _sb(), user = null;
        try { var s = sb && await sb.auth.getSession(); user = s && s.data && s.data.session && s.data.session.user; } catch (_) {}
        if (!usesPassword(user)) { el.innerHTML = ''; el.style.display = 'none'; return; }
        var inp = 'width:100%;box-sizing:border-box;margin-top:4px;padding:7px 9px;border:1px solid var(--color-border-hair,rgba(0,0,0,.15));border-radius:8px;font:inherit;font-size:13px;background:var(--color-surface-1,#fff);color:inherit;';
        var lbl = 'display:block;font-size:11.5px;color:var(--color-text-secondary,#667085);margin-top:8px;';
        el.innerHTML = '<details><summary style="font-size:12px;font-weight:600;color:var(--color-text-secondary,#667085);cursor:pointer;">Change password</summary>' +
            '<label style="' + lbl + '">Current password<input id="pw-cur" type="password" autocomplete="current-password" style="' + inp + '"></label>' +
            '<label style="' + lbl + '">New password<input id="pw-new" type="password" autocomplete="new-password" style="' + inp + '"></label>' +
            '<label style="' + lbl + '">New password again<input id="pw-new2" type="password" autocomplete="new-password" style="' + inp + '"></label>' +
            '<div id="pw-msg" style="font-size:12px;min-height:14px;margin-top:6px;"></div>' +
            '<button type="button" id="pw-go" style="margin-top:4px;border:none;border-radius:9px;background:var(--color-accent,#4E63D8);color:#fff;font:inherit;font-weight:600;font-size:12.5px;padding:7px 14px;cursor:pointer;">Change password</button>' +
            '</details>';
        var go = document.getElementById('pw-go'), msg = document.getElementById('pw-msg');
        go.onclick = async function () {
            var cur = document.getElementById('pw-cur').value, n1 = document.getElementById('pw-new').value, n2 = document.getElementById('pw-new2').value;
            go.disabled = true; msg.style.color = 'var(--color-text-secondary,#667085)'; msg.textContent = 'Checking…';
            var r;
            try { r = await change(user.email, cur, n1, n2); } catch (e) { r = { ok: false, error: String((e && e.message) || e) }; }
            go.disabled = false;
            if (r.ok) {
                msg.style.color = '#15803d'; msg.textContent = 'Password changed.';
                ['pw-cur', 'pw-new', 'pw-new2'].forEach(function (id) { var x = document.getElementById(id); if (x) x.value = ''; });
                _toast('Password changed.', 'success');
            } else { msg.style.color = '#b91c1c'; msg.textContent = r.error; }
        };
    }

    window.SafetyLabPassword = { mount: mount, change: change, passwordProblem: passwordProblem, usesPassword: usesPassword };
})();

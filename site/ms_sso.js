// ms_sso.js — v1.0 — Microsoft 365 / Entra ID single sign-on ("SharePoint-style" login).
// BORN MODULAR: new file, zero monolith edits. Injects a "Sign in with Microsoft"
// button into the existing #signup-modal and drives Supabase's Azure OAuth provider.
//
// How it fits the existing auth:
//   · The Supabase client is already created with flowType:'pkce' + detectSessionInUrl:true
//     (see _initSupabaseClient). That is exactly what OAuth needs — after Microsoft
//     redirects back, supabase-js exchanges the code and fires onAuthStateChange
//     ('SIGNED_IN'), which the app already handles via _onSupabaseSignedIn(). So this
//     module only has to KICK OFF the OAuth flow; the return path is already wired.
//
// Tenant restriction ("approved customer tenants only") is enforced SERVER-SIDE
//   (Supabase before-user-created auth hook against public.approved_tenants — see
//   MS_SSO_SETUP.md). The client cannot be the gate; this button just starts the flow.
//
// Config surfaced from the page (set by safety_lab.js), with safe fallbacks:
//   window.SUPABASE_PROJECT_URL, window.getSupabaseClient()
(function () {
    'use strict';

    // ── PROVIDER GATE — added 13 Aug 2026 ──────────────────────────────────
    // The Azure provider is NOT enabled on the Supabase project, so every click
    // returned 400 "provider is not enabled". Auth logs for 13 Aug show 5 such
    // failures from 4 distinct visitors — every Microsoft attempt on the site.
    // A visible button that always fails is worse than no button.
    // TURN IT ON: Supabase → Authentication → Providers → Azure (client id +
    // secret, callback https://<ref>.supabase.co/auth/v1/callback), then either
    // flip the default below to true or set window.SL_MS_SSO_ENABLED = true.
    // Read the flag at call time, not load time — auth_gate.js reads the very
    // same global, so one switch turns both buttons on together.
    function MS_SSO_ENABLED() { try { return window.SL_MS_SSO_ENABLED === true; } catch (_) { return false; } }

    var MS_LOGO =
        '<svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true" style="flex:0 0 auto;">' +
        '<rect x="1" y="1" width="9" height="9" fill="#f25022"/>' +
        '<rect x="11" y="1" width="9" height="9" fill="#7fba00"/>' +
        '<rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>' +
        '<rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>';

    function _sb() {
        try {
            if (typeof window.getSupabaseClient === 'function') { var c = window.getSupabaseClient(); if (c) return c; }
            if (typeof window._initSupabaseClient === 'function') { var d = window._initSupabaseClient(); if (d) return d; }
        } catch (_) {}
        return null;
    }
    function _toast(m, k) { try { if (typeof window.showToast === 'function') window.showToast(m, k || 'info'); } catch (_) {} }

    // Desktop (Electron, file://) can't complete a browser redirect in-window. We detect it
    // and, if a native bridge is present, hand the OAuth URL to the system browser + deep-link
    // back (see MS_SSO_SETUP.md → desktop). On web we use the normal redirect.
    function _isDesktop() {
        try { return location.protocol === 'file:' || !!(window.safetyLabDesktop || (window.process && window.process.versions && window.process.versions.electron)); }
        catch (_) { return false; }
    }
    function _redirectTo() {
        try {
            // Desktop (6 Sep 2026): the shell registers a safetylab:// handler and tells us
            // where the provider should send the user back (a file:// page cannot receive it).
            if (window.slabDesktop && window.slabDesktop.ssoRedirect) return String(window.slabDesktop.ssoRedirect);
            // Return to the app shell; supabase detectSessionInUrl finishes the exchange.
            return location.origin + (location.pathname.indexOf('/app') === 0 ? location.pathname : '/app');
        } catch (_) { return undefined; }
    }

    async function signInWithMicrosoft() {
        var sb = _sb();
        if (!sb || !sb.auth || typeof sb.auth.signInWithOAuth !== 'function') {
            _toast('Sign-in service unavailable. Please try the email option.', 'error');
            return;
        }
        var opts = {
            provider: 'azure',
            options: {
                scopes: 'openid profile email',
                redirectTo: _redirectTo()
            }
        };
        // On desktop, ask supabase for the URL instead of auto-redirecting, then open it
        // in the system browser via the native bridge (deep-links back to the app).
        if (_isDesktop() && window.safetyLabDesktop && typeof window.safetyLabDesktop.openOAuth === 'function') {
            opts.options.skipBrowserRedirect = true;
        }
        try {
            var res = await sb.auth.signInWithOAuth(opts);
            if (res && res.error) {
                var m = String(res.error.message || '');
                _toast(/not enabled|unsupported provider/i.test(m)
                    ? 'Microsoft sign-in is not switched on yet — please use the email option below.'
                    : 'Microsoft sign-in failed: ' + m, 'error');
                return;
            }
            if (opts.options.skipBrowserRedirect && res && res.data && res.data.url) {
                window.safetyLabDesktop.openOAuth(res.data.url); // native handler completes the loop
            }
            // Web: the browser is now navigating to Microsoft; nothing else to do.
        } catch (e) {
            _toast('Microsoft sign-in error: ' + String((e && e.message) || e), 'error');
        }
    }

    // -------------------------------------------------------------- injection
    function _injectButton() {
        var modalBody = document.querySelector('#signup-modal .signup-modal-body');
        var intro = document.getElementById('signup-intro');
        if (!MS_SSO_ENABLED()) return;   // provider gate — see top of file
        if (!modalBody || !intro || document.getElementById('ms-sso-btn')) return;

        var wrap = document.createElement('div');
        wrap.id = 'ms-sso-wrap';
        wrap.style.cssText = 'margin:4px 0 14px;';
        wrap.innerHTML =
            '<button type="button" id="ms-sso-btn" ' +
            'style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;' +
            'padding:10px 14px;border:1px solid var(--color-border-hair,rgba(0,0,0,.2));' +
            'border-radius:var(--r-md,8px);background:var(--color-surface,#fff);color:inherit;' +
            'font-weight:600;font-size:14px;cursor:pointer;">' +
            MS_LOGO + '<span>Sign in with Microsoft</span></button>' +
            '<div id="ms-sso-divider" style="display:flex;align-items:center;gap:10px;margin:14px 0 2px;' +
            'color:var(--color-text-tertiary,#888);font-size:12px;">' +
            '<span style="flex:1;height:1px;background:var(--color-border-hair,rgba(0,0,0,.12));"></span>' +
            'or use email' +
            '<span style="flex:1;height:1px;background:var(--color-border-hair,rgba(0,0,0,.12));"></span></div>';

        // Insert above the email intro so SSO is the primary, obvious path.
        intro.parentNode.insertBefore(wrap, intro);
        document.getElementById('ms-sso-btn').addEventListener('click', signInWithMicrosoft);
    }

    // The signup modal exists in index.html at load, but is populated/opened later.
    // Inject once on DOMContentLoaded, and also right before the modal opens (in case
    // a re-render replaced the body).
    function _ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }
    _ready(_injectButton);

    // Re-assert the button whenever the signup modal is opened (idempotent).
    if (typeof window.openSignupModal === 'function' && !window.openSignupModal._msWrapped) {
        var orig = window.openSignupModal;
        var wrapped = function () { var r = orig.apply(this, arguments); try { _injectButton(); } catch (_) {} return r; };
        wrapped._msWrapped = true;
        window.openSignupModal = wrapped;
    }

    // exports (for the desktop bridge + tests)
    window.signInWithMicrosoft = signInWithMicrosoft;
    window._msSsoInject = _injectButton;
})();

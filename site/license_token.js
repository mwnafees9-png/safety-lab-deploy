// ============================================================================
// license_token.js — v1.0 — SEC-1 (29 Sep 2026). The licence bearer lives in
// memory, not on disk.
//
// WHAT WAS WRONG. The credential the app sends to the AI proxy sat in
// localStorage under 'safetyLab.license.token'. localStorage is persistent and
// readable by any script that runs on the page, so one injected script walks off
// with a credential that spends AI against the account. Every OTHER user secret
// moved behind the vault on 20 Sep (secret_store.js); this one was left because
// it is not a user secret, it is issued to the account. It is still a bearer
// credential and it still should not be on disk.
//
// WHY MEMORY IS ENOUGH, RATHER THAN A SAFER SLOT IN THE BROWSER. Nothing needs
// this value to survive a reload. auth_gate re-reads it from license_tokens on
// every sign-in, and it already gates the UI on that read finishing
// (window.__slabLicenseReady, 6 s bound) precisely so the first AI click after
// sign-in never lands in the gap. Storage was never earning its keep. So the
// value lives in a closure for the life of the page: gone when the tab closes,
// never shared between tabs, never written anywhere a later script can read it.
//
// AND ON A CUSTOMER INSTALL nothing changes in substance. There, the real bearer
// is the SIGNED LICENCE BLOB, which getLicenseToken() reads through SLLicenseBlob
// and which never went through this slot. All that ever lived here was a
// 'signed:<id>' marker telling the rest of the app that a licence is present.
// The marker now lives here in memory too.
//
// This file must load before slab_license.js and auth_gate.js. index.html loads
// it immediately after slab_config.js, and tests/regression_license_token pins
// that order so it cannot drift.
// ============================================================================
(function (W) {
    'use strict';
    if (!W) return;

    var LEGACY = 'safetyLab.license.token';
    var _token = '';

    // Anything an earlier version of the app left on disk is REMOVED on sight, not
    // read. Carrying it forward would defeat the point, and there is no need: a
    // signed-in user re-syncs the real token, and a customer install's bearer is the
    // signed blob. One line, once, at load.
    try { if (W.localStorage) W.localStorage.removeItem(LEGACY); } catch (_) {}

    W.SLLicenseToken = {
        get:   function () { return _token; },
        set:   function (t) { _token = (t === null || t === undefined) ? '' : String(t); },
        clear: function () { _token = ''; },
        has:   function () { return !!_token; }
    };
})(typeof window !== 'undefined' ? window : null);

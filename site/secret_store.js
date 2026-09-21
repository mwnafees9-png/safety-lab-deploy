// ============================================================================
// secret_store.js — v1.1 — S8 (20 Sep 2026). THE one place the page puts a secret.
//
// A user's own credentials — their Anthropic key, their Voyage key, their Jama token — used
// to sit in localStorage, which is persistent and readable by any script that runs on the
// page. And the browser then USED them itself: it called api.anthropic.com directly with the
// key (outside the ITAR fence, which lives on the proxy), and it built the Jama Basic header
// itself and handed it to a relay. This module ends both.
//
// Three doors, decided once at load from SLConfig, never guessed per call:
//
//   desktop      The OS keychain, via the shell (window.slabSecrets). Only the Jama token
//                lives there; on the desktop a per-user AI key is not a thing by design —
//                AI goes through the customer's proxy, and the egress fence stops anything
//                else. Unchanged from 16 Sep; this module just routes to it.
//
//   vault        Any door with a backend (Safety Lab's trial cloud, or a customer's own
//                Supabase). The page SAVES through save_secret(), which is pinned to
//                auth.uid() and is the only client write path; it can ask WHICH kinds are
//                saved through my_secrets_status(), which never returns a value; and it can
//                never read a value back, not even its own. The proxy reads them server-side.
//                The page's AI and Jama calls go to the proxy carrying the user's session JWT.
//
//   session      Browser-only (files on the machine, no backend). There is nowhere else for
//                the secret to live, so it lives in sessionStorage: gone when the tab closes,
//                not shared across tabs, never written to disk by the browser. The page still
//                calls Anthropic directly here, as it must. This door is told so, in words.
//
// The synchronous question "is a key saved?" is answered from a status cache that is
// refreshed at load, on every save/remove, and on every sign-in. The cache holds kinds,
// never values.
// ============================================================================
(function () {
    'use strict';

    var KINDS = { anthropic_key: 1, voyage_key: 1, jama_token: 1 };
    var SS_PREFIX = 'safetyLab.secret.';
    var LEGACY = {                      // pre-S8 localStorage keys, moved once then cleared
        anthropic_key: 'safetyLab.ai.anthropicKey',
        voyage_key:    'safetyLab.ai.voyageKey'
    };

    var _status = {};                   // kind -> { meta, updatedAt }   (vault + session)
    var _jwt = '';                      // the signed-in user's access token, for the proxy
    var _ready = false;
    var _listeners = [];

    function _cfg() { try { return window.SLConfig || {}; } catch (_) { return {}; } }
    function _isDesktop() {
        try { return !!(_cfg().isDesktop || window.__slabDesktop || (navigator.userAgent || '').indexOf('Electron') >= 0); } catch (_) { return false; }
    }
    function _sb() { try { return (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : null; } catch (_) { return null; } }

    // Decided from configuration, not from what happens to be reachable right now.
    function door() {
        if (_isDesktop()) return 'desktop';
        if (_cfg().browserOnly) return 'session';
        return _sb() ? 'vault' : 'session';
    }

    // ---- session door ----------------------------------------------------------------
    function _ssGet(kind) { try { return sessionStorage.getItem(SS_PREFIX + kind) || ''; } catch (_) { return ''; } }
    function _ssSet(kind, v) { try { if (v) sessionStorage.setItem(SS_PREFIX + kind, v); else sessionStorage.removeItem(SS_PREFIX + kind); } catch (_) {} }

    // ---- vault door ------------------------------------------------------------------
    async function _refreshJwt() {
        var sb = _sb(); if (!sb) { _jwt = ''; return ''; }
        try {
            var r = await sb.auth.getSession();
            _jwt = (r && r.data && r.data.session && r.data.session.access_token) || '';
        } catch (_) { _jwt = ''; }
        return _jwt;
    }
    async function _refreshVaultStatus() {
        var sb = _sb(); if (!sb) return;
        try {
            var r = await sb.rpc('my_secrets_status');
            if (r && !r.error && Array.isArray(r.data)) {
                var next = {};
                r.data.forEach(function (row) { if (row && KINDS[row.kind]) next[row.kind] = { meta: row.meta || {}, updatedAt: row.updated_at || null }; });
                _status = next;
            }
        } catch (_) {}
    }

    // ---- public ---------------------------------------------------------------------
    function has(kind) {
        if (!KINDS[kind]) return false;
        var d = door();
        if (d === 'session') return !!_ssGet(kind);
        if (d === 'desktop') return false;           // AI keys are not a desktop thing; Jama has its own path
        return !!_status[kind];
    }
    function meta(kind) { var s = _status[kind]; return (s && s.meta) || {}; }

    // The VALUE. Only the session door can answer; the others return '' by design.
    function get(kind) { return door() === 'session' ? _ssGet(kind) : ''; }

    async function save(kind, value, m) {
        if (!KINDS[kind]) return { ok: false, error: 'unknown secret kind' };
        value = String(value || '');
        var d = door();
        if (d === 'session') { _ssSet(kind, value); _status[kind] = value ? { meta: m || {}, updatedAt: new Date().toISOString() } : undefined; _emit(); return { ok: true, door: d }; }
        if (d === 'desktop') return { ok: false, error: 'not stored on the desktop by this path' };
        var sb = _sb(); if (!sb) return { ok: false, error: 'no backend' };
        if (!value) return remove(kind);
        try {
            var r = await sb.rpc('save_secret', { p_kind: kind, p_secret: value, p_meta: m || {} });
            if (r && r.error) return { ok: false, error: (r.error.message || 'the vault refused the save') };
        } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
        await _refreshVaultStatus(); _emit();
        return { ok: true, door: d };
    }
    async function remove(kind) {
        if (!KINDS[kind]) return { ok: false };
        var d = door();
        if (d === 'session') { _ssSet(kind, ''); delete _status[kind]; _emit(); return { ok: true, door: d }; }
        if (d === 'desktop') return { ok: false };
        var sb = _sb(); if (!sb) return { ok: false, error: 'no backend' };
        try { var r = await sb.rpc('delete_secret', { p_kind: kind }); if (r && r.error) return { ok: false, error: r.error.message }; }
        catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
        await _refreshVaultStatus(); _emit();
        return { ok: true, door: d };
    }

    function sessionJwt() { return _jwt; }
    function onChange(fn) { if (typeof fn === 'function') _listeners.push(fn); }
    function _emit() { _listeners.forEach(function (fn) { try { fn(); } catch (_) {} }); }

    // One-time move of anything a pre-S8 install left in localStorage. On the vault door the
    // value goes to the vault; on the session door it goes to sessionStorage. Either way the
    // persistent copy is cleared, so it does not simply sit there forever.
    async function _migrateLegacy() {
        var moved = [];
        for (var kind in LEGACY) {
            var v = ''; try { v = localStorage.getItem(LEGACY[kind]) || ''; } catch (_) {}
            if (!v) continue;
            var r = await save(kind, v, { last4: v.slice(-4) });
            if (r && r.ok) { try { localStorage.removeItem(LEGACY[kind]); } catch (_) {} moved.push(kind); }
        }
        if (moved.length) { try { console.info('[secrets] moved out of localStorage: ' + moved.join(', ') + ' (' + door() + ')'); } catch (_) {} }
    }

    var _initP = null;
    function init() {
        // Idempotent even when called again while the first call is still awaiting: the
        // load hook and an explicit caller must not both run the legacy migration.
        if (_initP) return _initP;
        _initP = _init();
        return _initP;
    }
    async function _init() {
        if (_ready) return;
        if (door() === 'vault') {
            await _refreshJwt();
            await _refreshVaultStatus();
            var sb = _sb();
            try {
                sb.auth.onAuthStateChange(function () {
                    _refreshJwt().then(_refreshVaultStatus).then(_emit)
                        .catch(function (e) { try { console.warn('[secrets] refresh after auth change failed', e); } catch (_) {} });
                });
            } catch (_) {}
        }
        await _migrateLegacy();
        _ready = true; _emit();
    }

    window.SecretStore = { door: door, has: has, get: get, meta: meta, save: save, remove: remove, sessionJwt: sessionJwt, onChange: onChange, refresh: function () { return _refreshJwt().then(_refreshVaultStatus).then(_emit).catch(function (e) { try { console.warn('[secrets] refresh failed', e); } catch (_) {} }); }, init: init, KINDS: Object.keys(KINDS) };

    // Boot after the Supabase client exists. bindings_modules defines getSupabaseClient at
    // load and helpers wires the client on DOMContentLoaded; going after that is enough.
    try {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
        else setTimeout(init, 0);
    } catch (_) {}
})();

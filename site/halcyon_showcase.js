// halcyon_showcase.js — loader for the Halcyon HA-10 demo project.
//
// Mirrors hl1_showcase.js: lazy-loads demo_showcase_halcyon.js on demand and
// exposes window.loadHalcyonDemo.
//
// The Halcyon HA-10 is a FICTIONAL hybrid-electric amphibian, like the other
// showcase aircraft, so it is visible to every account. isVisible() is kept
// because the demo picker calls it through the generic `gate` mechanism; set
// HALCYON_PUBLIC to false to put it back behind ?demo=halcyon and the
// allow-listed domains.
// ---------------------------------------------------------------------------
(function () {
    'use strict';
    // NOTE: the ?v= on the lazy-loaded source below is the CACHE KEY. Editing
    // demo_showcase_halcyon.js WITHOUT bumping it leaves the edge serving the
    // previous build under the same URL — which happened twice on 4 Aug before
    // anyone noticed the numbers had not moved. Bump it with every content change.

    var HALCYON_PUBLIC = true;   // 4 Aug: list it with the other demos.
    var HALCYON_DOMAINS = ['safetylabaero.com'];

    function _email() {
        try {
            var e = (localStorage.getItem('safetyLab.signup.email') || '').toLowerCase().trim();
            if (e) return e;
        } catch (_) {}
        try {
            var u = window.__slUser && window.__slUser.email;
            return (u || '').toLowerCase().trim();
        } catch (_) { return ''; }
    }

    function isVisible() {
        if (HALCYON_PUBLIC) return true;
        try { if (/[?&]demo=halcyon/.test((window.location && window.location.search) || '')) return true; } catch (_) {}
        var e = _email();
        if (!e) return false;
        var dom = e.split('@')[1] || '';
        return HALCYON_DOMAINS.indexOf(dom) >= 0;
    }

    function _ensureLoaded() {
        return new Promise(function (resolve, reject) {
            if (window.SL_SHOWCASE_HALCYON && typeof window.SL_SHOWCASE_HALCYON.build === 'function') return resolve();
            var existing = document.getElementById('sl-halcyon-lazy');
            if (existing) {
                existing.addEventListener('load', function () { resolve(); });
                existing.addEventListener('error', function () { reject(new Error('Halcyon showcase load failed')); });
                return;
            }
            var s = document.createElement('script');
            s.id = 'sl-halcyon-lazy';
            s.src = window.SL_SHOWCASE_HALCYON_SRC || 'demo_showcase_halcyon.js?v=6';
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('Halcyon showcase load failed')); };
            document.head.appendChild(s);
        });
    }

    async function loadHalcyonDemo() {
        if (!isVisible()) {
            try { if (typeof showToast === 'function') showToast('That demo is not available on this account.', 'error', 3500); } catch (_) {}
            return;
        }
        try { await _ensureLoaded(); } catch (_) {}
        if (!(window.SL_SHOWCASE_HALCYON && typeof window.SL_SHOWCASE_HALCYON.build === 'function')) {
            try { showToast('The Halcyon demo is unavailable in this build.', 'error', 3500); } catch (_) {}
            return;
        }
        var data;
        try { data = window.SL_SHOWCASE_HALCYON.build(); }
        catch (err) { try { showToast('Could not build the demo: ' + ((err && err.message) || err), 'error', 4500); } catch (_) {} return; }
        try {
            if (typeof _applyProjectData === 'function') _applyProjectData(data);
            else if (typeof window._applyProjectData === 'function') window._applyProjectData(data);
            else throw new Error('project applier unavailable');
        }
        catch (err) { try { showToast('Could not load the demo: ' + ((err && err.message) || err), 'error', 4500); } catch (_) {} return; }
        try { window.SL_SHOWCASE_HALCYON.postLoad(); } catch (_) {}
        try { localStorage.setItem('safetyLab.onrampState.v1', 'dismissed'); if (window._refreshOnramp) window._refreshOnramp(); } catch (_) {}
        try {
            showToast('Halcyon HA-10 demonstration loaded. A fictional hybrid-electric amphibian — open Assumptions to see what is specification and what we assumed. Start at Define → Certification basis, then Analyze → Aircraft analyses.', 'success', 9000);
        } catch (_) {}
    }

    window.loadHalcyonDemo = loadHalcyonDemo;
    window.slHalcyonVisible = isVisible;
})();

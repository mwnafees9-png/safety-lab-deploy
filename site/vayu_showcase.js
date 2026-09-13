// vayu_showcase.js — loader for the Vayu V-1 eVTOL demo project.
//
// Mirrors hl1_showcase.js: lazy-loads demo_showcase_vayu.js on demand and
// exposes window.loadVayuDemo. The Vayu is a fictional eVTOL air taxi, like the
// other showcase aircraft, so it is visible to every account.
// ---------------------------------------------------------------------------
(function () {
    'use strict';
    // NOTE: the ?v= on the lazy-loaded source below is the CACHE KEY. Editing
    // demo_showcase_vayu.js WITHOUT bumping it leaves the edge serving the
    // previous build under the same URL. Bump it, and index.html's pin, with
    // every change.

    var VAYU_PUBLIC = true;
    var VAYU_DOMAINS = ['safetylabaero.com'];

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
        if (VAYU_PUBLIC) return true;
        try { if (/[?&]demo=vayu/.test((window.location && window.location.search) || '')) return true; } catch (_) {}
        var e = _email();
        if (!e) return false;
        var dom = e.split('@')[1] || '';
        return VAYU_DOMAINS.indexOf(dom) >= 0;
    }

    function _ensureLoaded() {
        return new Promise(function (resolve, reject) {
            if (window.SL_SHOWCASE_VAYU && typeof window.SL_SHOWCASE_VAYU.build === 'function') return resolve();
            var existing = document.getElementById('sl-vayu-lazy');
            if (existing) {
                existing.addEventListener('load', function () { resolve(); });
                existing.addEventListener('error', function () { reject(new Error('Vayu showcase load failed')); });
                return;
            }
            var s = document.createElement('script');
            s.id = 'sl-vayu-lazy';
            s.src = window.SL_SHOWCASE_VAYU_SRC || 'demo_showcase_vayu.js?v=2';
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('Vayu showcase load failed')); };
            document.head.appendChild(s);
        });
    }

    async function loadVayuDemo() {
        if (!isVisible()) {
            try { if (typeof showToast === 'function') showToast('That demo is not available on this account.', 'error', 3500); } catch (_) {}
            return;
        }
        try { await _ensureLoaded(); } catch (_) {}
        if (!(window.SL_SHOWCASE_VAYU && typeof window.SL_SHOWCASE_VAYU.build === 'function')) {
            try { showToast('The Vayu demo is unavailable in this build.', 'error', 3500); } catch (_) {}
            return;
        }
        var data;
        try { data = window.SL_SHOWCASE_VAYU.build(); }
        catch (err) { try { showToast('Could not build the demo: ' + ((err && err.message) || err), 'error', 4500); } catch (_) {} return; }
        try {
            if (typeof _applyProjectData === 'function') _applyProjectData(data);
            else if (typeof window._applyProjectData === 'function') window._applyProjectData(data);
            else throw new Error('project applier unavailable');
        }
        catch (err) { try { showToast('Could not load the demo: ' + ((err && err.message) || err), 'error', 4500); } catch (_) {} return; }
        try { window.SL_SHOWCASE_VAYU.postLoad(); } catch (_) {}
        try { localStorage.setItem('safetyLab.onrampState.v1', 'dismissed'); if (window._refreshOnramp) window._refreshOnramp(); } catch (_) {}
        try {
            showToast('Vayu V-1 eVTOL demonstration loaded. Built from public eVTOL practice only — open Assumptions to see what is specification and what we assumed. Start at Define → Certification basis, then Analyze → Aircraft analyses.', 'success', 9000);
        } catch (_) {}
    }

    window.loadVayuDemo = loadVayuDemo;
    window.slVayuVisible = isVisible;
})();

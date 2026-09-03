// hl1_showcase.js — loader for the Aeolus HL-1 demo project.
//
// Mirrors kestrel_showcase.js: lazy-loads demo_showcase_hl1.js on demand and
// exposes window.loadHL1Demo.
//
// The HL-1 is a fictional outsized freighter, like the other showcase
// aircraft, so it is visible to every account. isVisible() is kept because the
// demo picker calls it through the generic `gate` mechanism; set HL1_PUBLIC to
// false to put it back behind ?demo=hl1 and the allow-listed domains.
// ---------------------------------------------------------------------------
(function () {
    'use strict';
    // NOTE: the ?v= on the lazy-loaded source below is the CACHE KEY. Editing
    // demo_showcase_hl1.js WITHOUT bumping it leaves the edge serving the
    // previous build under the same URL — which cost two deploy cycles on the
    // Halcyon demo on 4 Aug. Bump it, and index.html's pin, with every change.

    var HL1_PUBLIC = true;   // 31 Jul: Waqas — list it with the other demos on the live site.
    var HL1_DOMAINS = ['safetylabaero.com'];

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

    // Visible in the demo picker?
    function isVisible() {
        if (HL1_PUBLIC) return true;
        try { if (/[?&]demo=hl1/.test((window.location && window.location.search) || '')) return true; } catch (_) {}
        var e = _email();
        if (!e) return false;
        var dom = e.split('@')[1] || '';
        return HL1_DOMAINS.indexOf(dom) >= 0;
    }

    function _ensureLoaded() {
        return new Promise(function (resolve, reject) {
            if (window.SL_SHOWCASE_HL1 && typeof window.SL_SHOWCASE_HL1.build === 'function') return resolve();
            var existing = document.getElementById('sl-hl1-lazy');
            if (existing) {
                existing.addEventListener('load', function () { resolve(); });
                existing.addEventListener('error', function () { reject(new Error('HL-1 showcase load failed')); });
                return;
            }
            var s = document.createElement('script');
            s.id = 'sl-hl1-lazy';
            s.src = window.SL_SHOWCASE_HL1_SRC || 'demo_showcase_hl1.js?v=6';
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('HL-1 showcase load failed')); };
            document.head.appendChild(s);
        });
    }

    async function loadHL1Demo() {
        if (!isVisible()) {
            try { if (typeof showToast === 'function') showToast('That demo is not available on this account.', 'error', 3500); } catch (_) {}
            return;
        }
        try { await _ensureLoaded(); } catch (_) {}
        if (!(window.SL_SHOWCASE_HL1 && typeof window.SL_SHOWCASE_HL1.build === 'function')) {
            try { showToast('The HL-1 demo is unavailable in this build.', 'error', 3500); } catch (_) {}
            return;
        }
        var data;
        try { data = window.SL_SHOWCASE_HL1.build(); }
        catch (err) { try { showToast('Could not build the demo: ' + ((err && err.message) || err), 'error', 4500); } catch (_) {} return; }
        try {
            if (typeof _applyProjectData === 'function') _applyProjectData(data);
            else if (typeof window._applyProjectData === 'function') window._applyProjectData(data);
            else throw new Error('project applier unavailable');
        }
        catch (err) { try { showToast('Could not load the demo: ' + ((err && err.message) || err), 'error', 4500); } catch (_) {} return; }
        try { window.SL_SHOWCASE_HL1.postLoad(); } catch (_) {}
        try { localStorage.setItem('safetyLab.onrampState.v1', 'dismissed'); if (window._refreshOnramp) window._refreshOnramp(); } catch (_) {}
        try {
            showToast('Aeolus HL-1 demonstration loaded. Built from public information only — open Assumptions to see what is public and what we assumed. Start at Define → Certification basis, then Analyze → Aircraft analyses.', 'success', 9000);
        } catch (_) {}
    }

    window.loadHL1Demo = loadHL1Demo;
    window.slHL1Visible = isVisible;
})();

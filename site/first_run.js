// ============================================================================
// first_run.js — put a worked example in front of a brand-new account.
//
// THE PROBLEM THIS FIXES. On 31 Jul 2026, 30 of 38 accounts had never created
// a single project. They signed up, looked, and left the same day. Every
// account that did engage — Sarla, Max Chopart, Tatiana, Sajjad — loaded a demo
// first. The demo is the activation event, and nothing was reliably showing it.
//
// There WAS an offer: maybeShowWelcomeOnLoad() opens a modal 350 ms after
// window.onload whose first card loads the K350 sample. But window.onload fires
// while the auth gate is still up, and the gate sits at z-index 2147483600
// against the modal's 2000. So on a genuinely new account the offer is painted
// underneath the gate, then liftGate() immediately stacks the EULA on top, and
// the signup modal can queue 600 ms after that. The one automatic worked-example
// offer in the product arrives buried under two or three overlays, on the single
// load where it matters most. The richer five-demo chooser, openDemoPicker(),
// is reachable only from a dropdown menu item and is never shown proactively.
//
// WHAT THIS DOES. Waits for the overlay stack to actually clear, re-checks that
// the session is still empty, and then opens the demo picker — once, ever.
//
// WHY A SEPARATE MODULE. Born modular, like cloud_sync.js: it observes and
// waits rather than editing auth_gate.js or the welcome path. Nothing in the
// sign-in flow changes, so nothing in the sign-in flow can break.
//
// DELIBERATELY CONSERVATIVE. It offers nothing if the user has any content, if
// it has run before, if any overlay is still up, or if the picker never loads.
// Failing to offer is a missed opportunity; interrupting somebody's real work
// with a demo chooser is a defect.
//
// Kill switch: window.SL_FIRST_RUN_OFFER = false.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    if (window.__slFirstRunWired) return;
    window.__slFirstRunWired = true;

    var FLAG   = 'safetyLab.firstRun.v1';   // 'offered' once we have shown it
    var POLL_MS = 400;
    var MAX_WAIT_MS = 45000;                // gate + EULA + signup, generously

    function _on() { return window.SL_FIRST_RUN_OFFER !== false; }
    function _ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
    function _set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

    // ---- is this session actually empty? -----------------------------------
    // Mirrors the on-ramp's corrected predicate: a fault-tree page is not a tree
    // until it has a top event, because initNewProjectState() always seeds one
    // blank page. Counting pages here would make every new session look occupied
    // and suppress the offer entirely — the exact bug this file exists to undo.
    function _isEmpty() {
        function len(x) { try { return (x && x.length) || 0; } catch (_) { return 0; } }
        try {
            if (len(typeof acFunctionsData !== 'undefined' && acFunctionsData)) return false;
            if (len(typeof acFhaData       !== 'undefined' && acFhaData))       return false;
            if (len(typeof systemsData     !== 'undefined' && systemsData))     return false;
            if (len(typeof acReqData       !== 'undefined' && acReqData))       return false;
            if (len(typeof itemsData       !== 'undefined' && itemsData))       return false;
            var pages = (typeof ftaPages !== 'undefined' && ftaPages) || [];
            for (var i = 0; i < pages.length; i++) if (pages[i] && pages[i].root) return false;
            var nm = (typeof projectName !== 'undefined' && projectName) || '';
            if (nm && nm !== 'Untitled Project') return false;
        } catch (_) { return false; }   // can't tell → don't interrupt
        return true;
    }

    // ---- is anything still covering the screen? ----------------------------
    // Checked by what is actually in the DOM rather than by timing, because the
    // timing is exactly what was unreliable.
    function _overlayUp() {
        try {
            if (document.getElementById('sl-auth-gate')) return true;
            if (document.getElementById('sl-eula-overlay')) return true;
            if (document.documentElement.classList.contains('sl-auth-gate-blocked')) return true;
            var mods = document.querySelectorAll('.modal-overlay, .signup-modal-overlay');
            for (var i = 0; i < mods.length; i++) {
                var m = mods[i];
                var vis = m.offsetParent !== null || (m.style && m.style.display === 'flex');
                if (vis && m.id !== 'sl-demo-picker') return true;
            }
        } catch (_) { return true; }     // can't tell → wait rather than barge in
        return false;
    }

    function _signedIn() {
        try { if (typeof isSupabaseSignedIn === 'function') return !!isSupabaseSignedIn(); } catch (_) {}
        try { return !!(localStorage.getItem('safetyLab.signup.email') || '').trim(); } catch (_) { return false; }
    }

    function _pickerReady() { return typeof window.openDemoPicker === 'function'; }

    // ---- the offer ---------------------------------------------------------
    function _offer() {
        _set(FLAG, 'offered');           // set BEFORE opening: if the picker throws,
                                         // we still never pester them twice.
        try {
            if (typeof showToast === 'function') {
                showToast('Start with a worked example — every screen already filled in. You can build your own from the Project menu at any time.', 'info', 7000);
            }
        } catch (_) {}
        try { window.openDemoPicker(); } catch (_) {}
    }

    function _start() {
        if (!_on()) return;
        if (_ls(FLAG)) return;               // already offered, ever
        if (!_isEmpty()) { _set(FLAG, 'skipped-has-work'); return; }

        var waited = 0;
        var iv = setInterval(function () {
            waited += POLL_MS;
            try {
                if (_ls(FLAG)) { clearInterval(iv); return; }

                if (waited >= MAX_WAIT_MS) {
                    // Give up silently and leave the flag UNSET, so the offer can
                    // still arrive on their next visit rather than being burned by
                    // one slow load.
                    clearInterval(iv);
                    return;
                }
                if (!_signedIn())  return;   // gate still deciding
                if (_overlayUp())  return;   // gate / EULA / signup still stacked
                if (!_pickerReady()) return; // demo_picker.js is deferred

                // Re-check emptiness at the last moment: checkAutosaveRecovery()
                // restores a returning user's session asynchronously, and it may
                // land after we started waiting.
                if (!_isEmpty()) { clearInterval(iv); _set(FLAG, 'skipped-has-work'); return; }

                clearInterval(iv);
                _offer();
            } catch (_) { clearInterval(iv); }
        }, POLL_MS);
    }

    // ---- keep the chooser reachable after the on-ramp is dismissed ----------
    // openDemoPicker() otherwise lives only in a dropdown menu item. Mirrors the
    // injection onboarding_tour.js already does, so the two sit together.
    function _injectRampButton() {
        try {
            var ramp = document.getElementById('sl-onramp');
            if (!ramp || ramp.querySelector('#sl-demo-launch')) return;
            var body = ramp.querySelector('.sl-onramp-body');
            if (!body || !_pickerReady()) return;
            var btn = document.createElement('button');
            btn.id = 'sl-demo-launch';
            btn.type = 'button';
            btn.textContent = '★ Load a demo project — five worked programmes';
            btn.style.cssText = 'display:block; width:100%; margin-top:6px; font-size:11.5px; font-weight:700; padding:7px 10px; cursor:pointer; border:1px solid var(--color-border-strong,#B9C2D0); background:var(--color-surface-2,#F3F5F9); color:var(--color-accent,#4E63D8);';
            btn.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                try { window.openDemoPicker(); } catch (_) {}
            });
            body.appendChild(btn);
        } catch (_) {}
    }

    function _ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }

    _ready(function () {
        try { _start(); } catch (_) {}
        try {
            _injectRampButton();
            if (typeof MutationObserver === 'function' && document.body) {
                new MutationObserver(function () { try { _injectRampButton(); } catch (_) {} })
                    .observe(document.body, { childList: true, subtree: true });
            }
        } catch (_) {}
    });

    // Exposed for tests and for a manual re-offer ("show me that chooser again").
    window.__slFirstRun = {
        isEmpty: _isEmpty,
        overlayUp: _overlayUp,
        reset: function () { try { localStorage.removeItem(FLAG); } catch (_) {} },
        offerNow: function () { try { window.openDemoPicker(); } catch (_) {} },
    };
})();

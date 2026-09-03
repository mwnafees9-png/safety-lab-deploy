// ============================================================================
// prove_tabs.js — v1.5 — CCA CONSOLIDATION: ZSA and CMA become areas (26 Aug
// 2026, Waqas — see the AREAS entries for the rulings verbatim). The folded
// pages' rail rows leave the rail: index.html drops routing + ipledger, and
// zonal_ui / phys_hazards / cra_matrix stop mounting theirs.
// prove_tabs.js — v1.4 — the bar HOLDS ITS POSITION (25 Aug 2026, Waqas: "when
// you click on assumptions the horizontal nav dissapears"). It never
// disappeared — a later-mounting panel was jumping in front of it. See the
// _keepFirst / _observe block below for the mechanism and why the fix lives
// here rather than in the module that displaced it.
// prove_tabs.js — v1.2 — AREA TABS: Prove + AFHA + Fault trees (23 Aug 2026,
// Waqas: "plus I want bowtie, event trees and other tree options under the
// fault trees and everything as tab options instead of left nav menu
// options"). Lane-gated tabs (gateLane) hide at render time, per lane.
// prove_tabs.js — v1.1 — AREA TABS: Prove + AFHA (23 Aug 2026, Waqas: "same
// thing for both the FHAs, empty out the drop down and they show as a
// horizontal menu option"). One mechanism, N areas: each area's rail entry is
// a single row, and its pages carry this tab bar. The SFHA half of "both the
// FHAs" is already tabbed — the system workspace's own sub-tabs.
// (v1.0 header follows, kept for the story:)
// prove_tabs.js — v1.0 — the Prove area as TABS (23 Aug 2026, Waqas: "under
// prove there should be separate tabs for the previous drop down menu options
// rather than shoving everything in one page").
//
// The shape that survived the day's iterations: the vertical rail is THE
// navigation; Prove sits there as a single row (no dropdown); clicking it
// lands on Traceability, and every Prove page carries this tab bar at the
// top — ten tabs, one per former dropdown option, each tab still its own
// full page underneath. Nothing merged, nothing shoved together: the tab bar
// is presentation over the existing views.
//
//   Traceability · Thread Integrity · Evidence Package · Objectives (App A) ·
//   Math validation · Baselines & config · Reviews & Approvals ·
//   Problem Reports · Modification Impact · [SORA Thread — basis-tied]
//
// SORA keeps its gate: the tab renders only while the plan lane is on
// (PROGRAM_PLAN.laneOn('sora')) — same render-time rule its strip pill and
// rail row carried before it, so no re-render can resurrect it off-basis.
//
// BORN MODULAR: new file, zero monolith edits; wraps switchTab the moat way.
// Kill switch: window.SL_PROVE_TABS_OFF = true.
// ============================================================================
(function () {
    'use strict';

    var AREAS = [
        { label: '✅ Prove', tabs: [
            { t: 'trace',        k: 'Traceability' },
            { t: 'gt-integrity', k: 'Thread Integrity' },
            { t: 'evpkg',        k: 'Evidence Package' },
            { t: 'appa',         k: 'Objectives (App A)' },
            { t: 'validation',   k: 'Math validation' },
            { t: 'cm',           k: 'Baselines & config' },
            { t: 'review',       k: 'Reviews & Approvals' },
            { t: 'pr',           k: 'Problem Reports' },
            { t: 'mod',          k: 'Modification Impact' },
            { t: 'sora-thread',  k: 'SORA Thread', gateLane: 'sora' }
        ] },
        // 23 Aug 2026 (v1.1) — the AFHA dropdown emptied into these.
        { label: 'AFHA', tabs: [
            { t: 'ac-func', k: '1 · Functions' },
            { t: 'ac-fcim', k: '2 · FCIM' },
            { t: 'ac-fha',  k: '3 · Hazard assessment' },
            { t: 'ac-asm',  k: 'Assumptions' },
            { t: 'ac-req',  k: 'Requirements' }
        ] },
        // 23 Aug 2026 (v1.2) — the tree family, out of the left nav for good.
        { label: 'Fault trees', tabs: [
            { t: 'fta',    k: 'Fault Tree Analysis' },
            { t: 'bowtie', k: 'Bow-Tie', gateLane: 'bowtie' },
            { t: 'eta',    k: 'Event Trees', gateLane: 'eta' },
            { t: 'markov', k: 'Markov Models', gateLane: 'markov' },
            // 23 Aug 2026 (v1.3) — "these can be tabs under fault trees too",
            // labels clean of clause numbers per the same ruling.
            { t: 'monitors', k: 'Monitors & Coverage' },
            { t: 'expcase',  k: 'Exposure cases' },
            { t: 'freq',     k: 'Frequency' }
        ] },
        // 26 Aug 2026 (v1.5) — the CCA bucket consolidates the AFHA way (Waqas:
        // "ZSA, Zonal Model, routing/spanning should be under the ZSA … similar
        // to what we did for the AFHA (selectable from the left hand nav) and
        // then everything else shows as a horizontal selectable pill", "should
        // the principle ledger be under the CMA", then ruled Physical Hazards →
        // ZSA and CRA → CMA). Rail: three CCA analysis rows (ZSA · PRA · CMA)
        // instead of eight — ARP4761A's own three-analysis structure. The pages
        // themselves are untouched; this bar is presentation over them, exactly
        // like every area above. Routing and the Principle Ledger keep their
        // program-plan lane gates (their rail rows used to carry them).
        { label: 'ZSA', tabs: [
            { t: 'zonal',   k: 'Zonal Model' },
            { t: 'zsa',     k: 'Zonal Safety (ZSA)' },
            { t: 'routing', k: 'Routing / Zone-Spanning', gateLane: 'routing' },
            { t: 'phys',    k: 'Physical Hazards' }
        ] },
        { label: 'CMA', tabs: [
            { t: 'cma',      k: 'Common Modes (CMA)' },
            { t: 'ipledger', k: 'Principle Ledger', gateLane: 'ipledger' },
            { t: 'cra',      k: 'Common Resources (CRA)' }
        ] }
    ];
    var SET = {};
    AREAS.forEach(function (ar) { ar.tabs.forEach(function (x) { SET[x.t] = ar; }); });

    var _esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };

    // ---- v1.4: THE BAR DEFENDS ITS OWN POSITION -----------------------------
    // 25 Aug 2026 — Waqas: "when you click on assumptions the horizontal nav
    // dissapears". It never disappeared. assumption_moat.js schedules its
    // register 120ms AFTER the tab switch and mounts it with
    // `view.insertBefore(host, view.firstChild)`, jumping in front of a tab bar
    // that was already mounted. The register is a full-width table, so the tabs
    // were shoved off the top of the viewport — present in the DOM, invisible.
    //
    // The wrong fix is to patch assumption_moat, because the next module that
    // mounts at firstChild re-breaks it — and there is already a second one
    // (fta_tree_picker does exactly this on view-fta). So the bar defends
    // itself: it re-asserts the top slot whenever the view's children change.
    // Moving the bar is itself a childList mutation, which re-enters the guard
    // once, finds the bar already first, and stops. It terminates.
    var _obs = null, _obsView = null, _obsBar = null;

    function _keepFirst(view, bar) {
        view = view || _obsView; bar = bar || _obsBar;
        if (!view || !bar) return false;
        if (view.firstChild !== bar) { view.insertBefore(bar, view.firstChild); return true; }
        return false;
    }

    function _observe(view, bar) {
        _obsView = view; _obsBar = bar;
        try {
            if (_obs) { _obs.disconnect(); _obs = null; }
            if (typeof MutationObserver !== 'function') return;
            _obs = new MutationObserver(function () { _keepFirst(view, bar); });
            _obs.observe(view, { childList: true });
        } catch (_) {}
    }

    function render(activeTab) {
        if (typeof window !== 'undefined' && window.SL_PROVE_TABS_OFF) return;
        var area = SET[activeTab];
        if (!area) return;
        var view = document.getElementById('view-' + activeTab);
        if (!view) return;
        var bar = view.querySelector(':scope > .prove-tabbar');
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'prove-tabbar';
            bar.setAttribute('role', 'tablist');
            bar.setAttribute('aria-label', 'Prove');
            view.insertBefore(bar, view.firstChild);
        }
        bar.innerHTML = '<span class="prove-tabbar-lbl">' + _esc(area.label) + '</span>' + area.tabs.map(function (x) {
            if (x.gateLane) {
                try {
                    if (window.PROGRAM_PLAN && typeof PROGRAM_PLAN.laneOn === 'function' && !PROGRAM_PLAN.laneOn(x.gateLane)) return '';
                } catch (_) {}
            }
            var on = x.t === activeTab;
            return '<button type="button" role="tab" class="prove-tab' + (on ? ' active' : '') + '"' +
                (on ? ' aria-selected="true"' : '') + ' data-prove-tab="' + _esc(x.t) + '">' + _esc(x.k) + '</button>';
        }).join('');
        Array.prototype.forEach.call(bar.querySelectorAll('[data-prove-tab]'), function (btn) {
            btn.addEventListener('click', function () {
                try { if (typeof switchTab === 'function') switchTab(btn.getAttribute('data-prove-tab')); } catch (_) {}
            });
        });
        // v1.4 — hold the top slot against anything that mounts later.
        _keepFirst(view, bar);
        _observe(view, bar);
    }

    if (typeof window !== 'undefined') {
        window.SL_PROVE_TABS = { render: render, AREAS: AREAS, _keepFirst: _keepFirst };
        (function wrapNav() {
            if (typeof window.switchTab !== 'function' || window.switchTab._proveTabsWrapped) return;
            var orig = window.switchTab;
            var wrapped = function (tabId) {
                var r = orig.apply(this, arguments);
                try { if (SET[tabId]) render(tabId); } catch (_) {}
                return r;
            };
            wrapped._proveTabsWrapped = true;
            Object.keys(orig).forEach(function (k) { try { wrapped[k] = orig[k]; } catch (_) {} });
            window.switchTab = wrapped;
        })();
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { render: render, AREAS: AREAS, _keepFirst: _keepFirst };
})();

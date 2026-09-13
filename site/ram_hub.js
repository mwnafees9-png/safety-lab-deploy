// ============================================================================
// ram_hub.js — v1.0 — the R&M lane's front door (30 Aug 2026, Waqas: "we need
// to make the RAM and HF interface far more intuitive").
//
// THE PROBLEM THIS SOLVES. The R&M category is ~20 sub-pages whose nav labels
// are pure discipline jargon — "Parts Count (217F)", "Growth · Crow-AMSAA",
// "LORA" — with nothing saying what each one is FOR, when in a program you
// would reach for it, or where THIS project currently stands. A prospect
// opening the lane cold saw a wall of tabs; a working analyst saw no status.
//
// WHAT IT IS. One overview page ("Start Here") that groups every R&M analysis
// under the four questions an engineer actually asks, in program order:
//   1. How often will each piece fail?        (predict)
//   2. Does the architecture tolerate it?     (model)
//   3. What does real experience show?        (demonstrate)
//   4. Can it be maintained affordably?       (maintain)
// Each card: plain-language one-liner + live status read from the project's
// own stores + one click through to the page. Teach on empty, get out of the
// way once data exists — the same card shows "not started" to a newcomer and
// "14 part categories" to the analyst.
//
// RULES OF THIS FILE.
// - READ-ONLY. The hub renders status; it never writes a store.
// - Status counts appear ONLY for stores whose names are verified in the
//   codebase (the vocabulary rule — never guess a store name). A lane whose
//   store this file does not know shows its description with no badge:
//   honest silence beats an invented "empty".
// - Tier gating mirrors the nav: pages carried by .ram-proplus nav items show
//   a Pro+ chip when window._ramHasAccess() says no — the hub itself is
//   always available, because explaining the lane IS the demo.
// - Styling: site tokens + data-table conventions, classes under rmh-*,
//   no stylesheet of its own.
// ============================================================================
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pc() { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : null; }
    function _len(v) { return Array.isArray(v) ? v.length : 0; }
    function _access() { return (typeof window !== 'undefined' && typeof window._ramHasAccess === 'function') ? !!window._ramHasAccess() : true; }

    // ---- verified status readers (store names confirmed in their modules) --
    // Each returns { n, noun } or null (null = "this hub does not know" — no
    // badge is rendered, and the card never claims the lane is empty).
    var STATUS = {
        'ram-predict': function () { var p = _pc(); return { n: _len(p && p.ram && p.ram.predict && p.ram.predict.rows), noun: 'part categor|y|ies' }; },
        'ram-rel':     function () { var p = _pc(); return { n: _len(p && p.ram && p.ram.fieldRows), noun: 'field record|s' }; },
        'ram-mx':      function () { var p = _pc(); return { n: _len(p && p.ram && p.ram.tasks), noun: 'maintenance task|s' }; },
        'ram-rbd':     function () { var p = _pc(); return { n: _len(p && p.rbd && p.rbd.models), noun: 'diagram|s' }; },
        'rbd-mc':      function () { var p = _pc(); return { n: _len(p && p.rbdMc && p.rbdMc.cases), noun: 'case|s' }; },
        'markov':      function () { var p = _pc(); return { n: _len(p && p.markovModels), noun: 'model|s' }; },
        'ram-msg3':    function () { var p = _pc(); return { n: _len(p && p.msg3 && p.msg3.msis), noun: 'significant item|s' }; },
        'swrel':       function () { var p = _pc(); return { n: _len(p && p.swrel && p.swrel.cscis), noun: 'CSCI|s' }; },
        'lcc':         function () { var p = _pc(); return { n: _len(p && p.lcc && p.lcc.items), noun: 'cost item|s' }; },
        'sneak':       function () { var p = _pc(); return { n: _len(p && p.sneak && p.sneak.dispositions), noun: 'disposition|s' }; },
    };
    function _statusFor(tab) {
        var f = STATUS[tab];
        if (!f) return null;
        try { return f(); } catch (_) { return null; }
    }
    function _nounFmt(n, noun) {
        var parts = noun.split('|');
        if (parts.length === 3) return n + ' ' + parts[0] + (n === 1 ? parts[1] : parts[2]);
        return n + ' ' + parts[0] + (n === 1 ? '' : parts[1] || 's');
    }

    // ---- the map: four questions, program order ----------------------------
    // gated: carried by a .ram-proplus nav item (tier-hidden there; the hub
    // shows the card WITH a Pro+ chip instead of hiding knowledge).
    var STAGES = [
        {
            q: '1 · How often will each piece fail?',
            why: 'Predicted failure rates — before any field data exists. This is where a new program starts.',
            cards: [
                { tab: 'ram-predict', gated: true, title: 'Parts Count (217F)',
                  what: 'Your first failure-rate estimate: pick part categories, get λ and MTBF with a handbook citation on every number.',
                  start: 'Start here when all you have is a parts list.' },
                { tab: 'library', title: 'Component Library',
                  what: 'The failure-rate catalog your fault trees and rollups draw from.',
                  start: 'Feed it as supplier data arrives.' },
                { tab: 'ram-tol', gated: true, title: 'Tolerance · Derating',
                  what: 'Are parts operated inside their electrical and thermal ratings? Stress beyond rating quietly invalidates every prediction above.' },
                { tab: 'swrel', gated: true, title: 'Software Reliability',
                  what: 'The reliability posture of the software CSCIs — growth-model-based, stated with its limits.' },
            ],
        },
        {
            q: '2 · Does the architecture tolerate failures?',
            why: 'Single parts fail at the rates above — these pages show whether the SYSTEM survives that.',
            cards: [
                { tab: 'ram-rbd', gated: true, title: 'Block Diagrams (RBD)',
                  what: 'The success-domain view. Derived automatically from your fault trees — series where the tree ORs, parallel where it ANDs — so diagram and tree cannot drift apart.' },
                { tab: 'markov', title: 'Markov Models', where: 'lives under Safety Labs',
                  what: 'Repairable systems with degraded states — dual pumps, periodic checks, standby spares.' },
                { tab: 'rbd-mc', gated: true, title: 'Monte Carlo',
                  what: 'Standby logic, mission phases and repair policies too tangled for a closed-form answer.' },
                { tab: 'sneak', gated: true, title: 'Sneak Circuit',
                  what: 'Unintended current paths that make a system do something nobody designed.' },
            ],
        },
        {
            q: '3 · What does real experience show?',
            why: 'Predictions are the claimed lane. Field data is the demonstrated lane — and the drift between them is shown, never hidden.',
            cards: [
                { tab: 'ram-rel', gated: true, title: 'Prediction & FRACAS',
                  what: 'Predicted λ next to the field record: observed MTBF with confidence bounds. Where the claim meets the evidence.',
                  start: 'Open this the day the first unit ships.' },
                { tab: 'ram-weibull', gated: true, title: 'Weibull · Life Data',
                  what: 'Fit the life data: is it infant mortality, random, or wear-out? The shape decides the maintenance answer.' },
                { tab: 'ram-growth', gated: true, title: 'Growth · Crow-AMSAA',
                  what: 'Is reliability actually improving across test phases, and fast enough to hit the requirement?' },
                { tab: 'rel-frameworks', gated: true, title: 'Frameworks · Test Factors',
                  what: 'The standards arithmetic: test-time factors, environmental conversion, demonstration statistics.' },
            ],
        },
        {
            q: '4 · Can it be maintained affordably?',
            why: 'Reliability decides how often you fix it; these pages decide how, where, and at what cost.',
            cards: [
                { tab: 'ram-mx', title: 'MTTR / MDT Task Ledger',
                  what: 'How long each repair actually takes — the task-by-task ledger behind every maintainability number.' },
                { tab: 'ram-msg3', title: 'MSG-3 Analysis',
                  what: 'The scheduled-maintenance logic: which failures deserve a task, which are safe to leave to failure.' },
                { tab: 'msg3x', title: 'MSG-3 Structures · Zonal · L/HIRF',
                  what: 'The same logic for structures, zones, and lightning/HIRF protection.' },
                { tab: 'ram-pmopt', title: 'PM Interval Optimizer',
                  what: 'The cost-vs-risk sweet spot for each preventive-maintenance interval.' },
                { tab: 'ram-test', title: 'Testability & Diagnostics',
                  what: 'Can the failure be detected and isolated — fault coverage and ambiguity groups.' },
                { tab: 'ram-lora', title: 'LORA — Level of Repair',
                  what: 'Fix it on the aircraft, in the shop, or at the depot? The economics per item.' },
                { tab: 'lcc', gated: true, title: 'Life-Cycle Cost',
                  what: 'What the fleet costs to own — acquisition through retirement.' },
                { tab: 'ram-alloc', gated: true, title: 'Allocation · Spares · Demo',
                  what: 'Split the system requirement down to items, size the spares, plan the demonstration.' },
            ],
        },
    ];

    function go(tab) {
        try { if (typeof window.switchTab === 'function') window.switchTab(tab); } catch (_) {}
    }

    function _card(c, access) {
        var st = _statusFor(c.tab);
        var badge = '';
        if (st) {
            badge = st.n > 0
                ? '<span class="rmh-badge u-mono" style="font-size:10px; font-weight:700; color:#1D9E75; border:1px solid #1D9E7533; background:#1D9E7514; border-radius:5px; padding:2px 7px;">' + esc(_nounFmt(st.n, st.noun)) + '</span>'
                : '<span class="rmh-badge u-mono" style="font-size:10px; color:var(--color-text-tertiary); border:1px solid var(--color-border); border-radius:5px; padding:2px 7px;">not started</span>';
        }
        var lock = (c.gated && !access)
            ? '<span class="rmh-lock u-mono" style="font-size:10px; font-weight:700; color:#B7791F; border:1px solid #B7791F55; border-radius:5px; padding:2px 7px;">Pro+</span>'
            : '';
        var where = c.where ? '<span class="u-mono" style="font-size:9.5px; color:var(--color-text-tertiary);"> · ' + esc(c.where) + '</span>' : '';
        return '<div class="rmh-card" role="button" tabindex="0" onclick="RAM_HUB.go(\'' + c.tab + '\')" ' +
            'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();RAM_HUB.go(\'' + c.tab + '\')}" ' +
            'style="flex:1 1 240px; max-width:330px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); border-radius:6px; padding:12px 14px; cursor:pointer;">' +
            '<div style="display:flex; justify-content:space-between; align-items:start; gap:8px; margin-bottom:5px;">' +
            '<b style="font-size:12.5px;">' + esc(c.title) + '</b><span style="display:flex; gap:5px; flex-shrink:0;">' + lock + badge + '</span></div>' +
            '<div style="font-size:11.5px; color:var(--color-text-secondary); line-height:1.45;">' + c.what + where + '</div>' +
            (c.start ? '<div class="u-mono" style="font-size:10px; color:#0E5A8A; margin-top:6px;">▸ ' + esc(c.start) + '</div>' : '') +
            '</div>';
    }

    function renderPage() {
        if (typeof document === 'undefined') return;
        var host = document.getElementById('ram-hub-host');
        if (!host) return;
        var access = _access();
        var withData = 0, counted = 0;
        Object.keys(STATUS).forEach(function (t) {
            var st = _statusFor(t);
            if (st) { counted++; if (st.n > 0) withData++; }
        });
        var html =
            '<div class="rmh-strip u-mono" style="font-size:11px; color:var(--color-text-secondary); border:1px solid var(--color-border); border-radius:6px; padding:8px 12px; margin-bottom:16px; display:flex; gap:14px; flex-wrap:wrap; align-items:center;">' +
            '<span><b style="color:var(--color-text-primary);">' + withData + '</b> of ' + counted + ' tracked analyses carry data in this project</span>' +
            (access ? '' : '<span style="color:#B7791F; font-weight:700;">Pro+ pages are marked — visible here so you can see what the lane covers.</span>') +
            '<a href="#" onclick="RAM_HUB.go(\'ram-settings\'); return false;" style="margin-left:auto; font-size:10.5px;">RAM Settings</a></div>';
        STAGES.forEach(function (s) {
            html +=
                '<div class="rmh-stage" style="margin-bottom:20px;">' +
                '<div style="border-bottom:2px solid var(--color-text-primary); padding-bottom:4px; margin-bottom:4px;">' +
                '<b style="font-size:13.5px;">' + esc(s.q) + '</b></div>' +
                '<p style="font-size:12px; color:var(--color-text-secondary); margin:2px 0 10px; ">' + esc(s.why) + '</p>' +
                '<div style="display:flex; gap:10px; flex-wrap:wrap; align-items:stretch;">' +
                s.cards.map(function (c) { return _card(c, access); }).join('') +
                '</div></div>';
        });
        host.innerHTML = html;
    }

    var API = { renderPage: renderPage, go: go, _STAGES: STAGES, _STATUS: STATUS };

    // ------------------------------------------------------------- wiring
    // Same wrap pattern as ram_predict: 'ram-hub' is a lane added after the
    // core switchTab tabs array, so the wrap must toggle its own view.
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        (function wire() {
            if (typeof window.switchTab === 'function' && !window.switchTab._rmhWrapped) {
                var orig = window.switchTab;
                var wrapped = function (tabId) {
                    var r = orig.apply(this, arguments);
                    try {
                        var v = document.getElementById('view-ram-hub');
                        if (v) v.style.display = (tabId === 'ram-hub') ? 'block' : 'none';
                        if (tabId === 'ram-hub') renderPage();
                    } catch (_) {}
                    return r;
                };
                wrapped._rmhWrapped = true;
                window.switchTab = wrapped;
            } else if (typeof window.switchTab !== 'function' && typeof window.addEventListener === 'function') {
                window.addEventListener('DOMContentLoaded', function () { setTimeout(wire, 700); });
            }
        })();
    }

    if (typeof window !== 'undefined') window.RAM_HUB = API;
    if (typeof module !== 'undefined') module.exports = API;
})();

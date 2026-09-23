/* ============================================================================
 * lazy_render.js — v1.0 — render only what is on screen (the rule the fault
 * trees already follow, applied to every table and page in the app).
 * ----------------------------------------------------------------------------
 * WHY. 8 Sep 2026, Waqas: "project sizes will be enormous ... only the analysis
 * in front of you gets computed." Rendering was already per tab (switchTab shows
 * one view and calls its renderer), but COMPUTE was not: an edit on the FHA tab
 * fanned out to updateD3 (85 call sites), renderFTASidebar (44), renderMacPage
 * (19), renderACFHA (22) ... every one rebuilding HTML or laying out a tree into
 * a view with display:none. On a small project that is waste; on a large one it
 * is the lag the user feels on every keystroke commit.
 *
 * THE RULE. A renderer's FIRST statement asks SLLazy.defer(hostId, ownName,
 * arguments). If the host element is not on screen the call is recorded as
 * pending for that host and the renderer returns at once. When the host comes
 * on screen the pending render runs — once, with the LAST arguments — so the
 * view is never stale when seen and never rebuilt when unseen. On-screen hosts
 * render exactly as before (defer returns false).
 *
 * "On screen" is decided by the DOM (Element.checkVisibility, falling back to
 * getClientRects), not by a table of tab names: a host inside a hidden sub-tab,
 * a collapsed PASA lane or a System Folder tab is handled the same way, and a new
 * view needs no registration. Anything that cannot be decided (no host, no
 * document, a sandboxed test with a stub element) falls through and renders.
 *
 * WHEN DOES A PENDING RENDER RUN.
 *   1. switchTab() and pasaSub() call SLLazy.flush() after they show a view.
 *   2. A ResizeObserver on the host's nearest view container fires when that
 *      container gets a size (display:none -> shown), even for a sub-tab
 *      switcher this file has never heard of.
 *   3. Any click, on the next animation frame, if something is pending (a
 *      last-resort net that costs one rAF only while there IS pending work).
 *   4. SLLazy.settle(hostId) forces a pending render regardless of visibility:
 *      the two fault-tree exports call it so a PDF never photographs a stale
 *      canvas.
 *
 * WHAT THIS IS NOT. Not a cache and not a dirty flag on data: a renderer that
 * is never called while hidden has nothing to show that it has not shown.
 * Renderers with side effects other views read must NOT be gated; the sixteen
 * gated on 23 Sep 2026 were each read for that (tests/regression_lazy_render
 * pins the list and the host ids).
 *
 * Kill switch for diagnosis: window.SL_LAZY_OFF = true makes defer() always
 * return false. SLLazy.stats() reports deferred / ran / direct counts.
 * ==========================================================================*/
(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    var pending = Object.create(null);    // hostId -> { name, args }
    var observed = Object.create(null);   // containerKey -> ResizeObserver
    var stats = { deferred: 0, ran: 0, direct: 0 };
    function raf(f) { (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function (g) { setTimeout(g, 16); })(f); }

    function report(e, where) {
        try { if (window.SLErrorWatch && SLErrorWatch.report) SLErrorWatch.report(e, 'lazy_render:' + where); } catch (_) {}
    }

    // true ONLY when the element is positively known to be off screen.
    function hiddenNow(el) {
        try {
            if (!el || !el.ownerDocument) return false;
            if (typeof el.checkVisibility === 'function') return !el.checkVisibility();
            if (typeof el.getClientRects === 'function') return el.getClientRects().length === 0;
            return false;
        } catch (_) { return false; }
    }
    // checkVisibility forces a style/layout pass. A burst of 13 renderers x 20 edits asked
    // 260 times in one frame and paid ~2.5 ms each (measured 23 Sep: 742 ms of the 1,898 ms an
    // ungated burst cost). Within one frame nothing on screen changes unless code changes it, so
    // the answer is cached per host until the next animation frame, and dropped explicitly by
    // flush() / settle() (the arrival points, which run right after a view is shown).
    var visCache = Object.create(null), visCacheArmed = false;
    function dropCache() { visCache = Object.create(null); visCacheArmed = false; }
    function hidden(el) {
        var key = el && el.id;
        if (!key) return hiddenNow(el);
        if (key in visCache) return visCache[key];
        var h = hiddenNow(el);
        visCache[key] = h;
        if (!visCacheArmed) { visCacheArmed = true; try { raf(dropCache); } catch (_) { dropCache(); } }
        return h;
    }

    // The element whose size changes when the host's view is shown: the nearest
    // ancestor whose id starts with "view-", else the host's parent, else the host.
    function container(el) {
        try {
            var c = el.closest ? el.closest('[id^="view-"]') : null;
            return c || el.parentElement || el;
        } catch (_) { return el; }
    }

    function observe(el) {
        if (typeof ResizeObserver !== 'function') return;
        var c = container(el);
        if (!c) return;
        var key = c.id || '';
        if (!key) { key = '__anon' + (c.__slLazyKey || (c.__slLazyKey = String(Math.random()).slice(2))); }
        if (observed[key]) return;
        try {
            var ro = new ResizeObserver(function () { if (Object.keys(pending).length) flush(); });
            ro.observe(c);
            observed[key] = ro;
        } catch (e) { report(e, 'observe'); }
    }

    function defer(hostId, name, args) {
        try {
            if (window.SL_LAZY_OFF) return false;
            if (typeof document === 'undefined' || !document.getElementById) return false;
            var el = document.getElementById(hostId);
            if (!el || !hidden(el)) { delete pending[hostId]; stats.direct++; return false; }
            pending[hostId] = { name: String(name), args: Array.prototype.slice.call(args || []) };
            stats.deferred++;
            observe(el);
            return true;
        } catch (e) { report(e, 'defer'); return false; }
    }

    function run(hostId) {
        var p = pending[hostId];
        if (!p) return false;
        delete pending[hostId];                     // before the call: a re-entrant defer sees a clean slate
        var fn = window[p.name];
        if (typeof fn !== 'function') return false;  // resolved by NAME so a wrapper installed later still runs
        stats.ran++;
        try { fn.apply(null, p.args); } catch (e) { report(e, 'run:' + p.name); }
        return true;
    }

    // Run every pending render whose host is now on screen.
    function flush() {
        var ran = 0;
        dropCache();
        try {
            Object.keys(pending).forEach(function (id) {
                var el = document.getElementById(id);
                if (el && !hidden(el)) { if (run(id)) ran++; }
            });
        } catch (e) { report(e, 'flush'); }
        return ran;
    }

    // Force: run pending render(s) whether or not the host is visible.
    function settle(hostId) {
        dropCache();
        if (hostId) return run(hostId);
        var ran = 0; Object.keys(pending).forEach(function (id) { if (run(id)) ran++; }); return ran;
    }

    var _rafQueued = false;
    function onAnyClick() {
        if (_rafQueued || !Object.keys(pending).length) return;
        _rafQueued = true;
        raf(function () { _rafQueued = false; flush(); });
    }
    try { document.addEventListener('click', onAnyClick, true); } catch (_) {}

    // For the modules that wrap a gated renderer to draw a companion panel afterwards
    // (mac_modes/mac_fcim/mac_flows on renderMacPage, fc_variants and fha_a5 on
    // renderACFHA, lane_trees on renderMfmsPanel, markov_ctmc on renderMarkovModels,
    // lod_zoom/importance_heat/the empty-state toggle on updateD3, thread_bridge on
    // the assumptions): after `orig.apply`, ask skipped(hostId) and return if the
    // original was deferred. The companion then draws on arrival with the original.
    function skipped(hostId) { return !!pending[hostId]; }

    window.SLLazy = {
        defer: defer,
        skipped: skipped,
        flush: flush,
        settle: settle,
        pending: function () { return Object.keys(pending); },
        stats: function () { return { deferred: stats.deferred, ran: stats.ran, direct: stats.direct, pending: Object.keys(pending).length }; },
        _hidden: hidden,
        _dropCache: dropCache,
        _reset: function () { pending = Object.create(null); stats = { deferred: 0, ran: 0, direct: 0 }; }
    };
})();

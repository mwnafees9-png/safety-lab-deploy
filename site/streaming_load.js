// ============================================================================
// streaming_load.js — v1.0 — ENG-5: staged project load (SLStream).
//
// _applyProjectData used to rebuild EVERY module table inline at load — ten
// DOM renders for tabs the user isn't looking at, all on the critical path
// between "file parsed" and "app responsive". Staged loading keeps the
// critical path to what the user actually sees (stores, migrations, derived
// allocations, the recovery tab, the FTA canvas) and streams the off-tab
// renders through SLIdle.
//
// CORRECTNESS GUARANTEE — flush-on-entry: several tables render only at load
// (switchTab repopulates their dropdowns, not the table). So every deferred
// render is registered by tab id, and the switchTab wrap FLUSHES a pending
// render synchronously before the tab shows. Either the idle frame got there
// first, or the tab entry does the work — the user can never see an empty
// table. Same data, same renders, different scheduling.
//
// Degrades cleanly: without SLIdle (or this module), _applyProjectData falls
// back to the legacy inline renders.
//
// BORN MODULAR: new file; wraps switchTab additively (_slsWrapped marker).
// Exports window.SLStream { stageLoadRenders, flushFor, pendingCount }.
// ============================================================================
(function () {
    'use strict';

    // tab id → the load-time renders that tab depends on.
    const RENDERS = {
        'ac-func':  ['renderACFunctions'],
        'ac-fcim':  ['renderACFCIM'],
        'ac-fha':   ['renderACFHA'],
        'ac-req':   ['renderACReq'],
        'ac-asm':   ['renderACAssumptions'],
        'pra':      ['renderPRA'],
        'zsa':      ['renderZSA'],
        'fmea':     ['renderFMEA'],
        'phases':   ['renderFlightPhases'],
    };
    const _job = tab => 'load-render:' + tab;

    function _runRenders(tab) {
        (RENDERS[tab] || []).forEach(fn => {
            try { if (typeof window[fn] === 'function') window[fn](); } catch (_) {}
        });
    }

    // Called by _applyProjectData in place of the inline render block.
    // activeTab renders synchronously (it's what the user is about to see);
    // everything else streams through idle slices.
    function stageLoadRenders(activeTab) {
        const tabs = Object.keys(RENDERS);
        if (typeof SLIdle === 'undefined' || !SLIdle) { tabs.forEach(_runRenders); return; }
        tabs.forEach(tab => {
            if (tab === activeTab) { _runRenders(tab); return; }
            SLIdle.schedule(_job(tab), function () { _runRenders(tab); }, { timeout: 2500 });
        });
    }

    // Flush-on-entry: a pending deferred render runs NOW, before the tab shows.
    function flushFor(tab) {
        try { if (typeof SLIdle !== 'undefined' && SLIdle && RENDERS[tab]) SLIdle.flush(_job(tab)); } catch (_) {}
    }
    function pendingCount() {
        if (typeof SLIdle === 'undefined' || !SLIdle) return 0;
        return Object.keys(RENDERS).filter(t => SLIdle.pending(_job(t))).length;
    }

    (function wrapSwitchTab() {
        if (typeof window.switchTab !== 'function' || window.switchTab._slsWrapped) { setTimeout(wrapSwitchTab, 300); return; }
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            flushFor(tabId);                       // table exists BEFORE the tab shows
            return orig.apply(this, arguments);
        };
        wrapped._slsWrapped = true;
        window.switchTab = wrapped;
    })();

    const api = { stageLoadRenders, flushFor, pendingCount, RENDERS };
    if (typeof window !== 'undefined') window.SLStream = api;
    if (typeof globalThis !== 'undefined') globalThis.SLStream = api;
})();

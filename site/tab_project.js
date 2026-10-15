// ============================================================================
// tab_project.js (15 Oct 2026): a reload reopens the project THIS tab was showing.
//
// The bug: the browser keeps ONE autosave copy for every tab. With two tabs open, the copy is
// whatever the tab holding the write lease saved last, so reloading the other tab brought up
// the wrong project (the AI test tab reloaded into the Halcyon demo from another tab).
//
// The fix: each tab remembers its own cloud project in sessionStorage, which belongs to one tab
// and survives a reload of that tab (a new tab starts empty and behaves as before). After the
// reload has restored the shared autosave and the sign-in is back, if that copy is a different
// project from the one this tab had open, the tab's own project is opened from the cloud with
// the app's normal open path (openCloudProjectById), so every guard on opening still applies
// (unsaved work in the restored copy is asked about and kept in the recovery list).
// Only cloud projects are pinned: a project that only lives on this device has nothing to reopen.
// A link with ?project= wins, and a pin from another account is ignored.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    if (window.SLTabProject) return;
    var KEY = 'safetyLab.tabProject.v1';
    var ss = null; try { ss = window.sessionStorage; } catch (_) { ss = null; }
    var boot = null; try { boot = ss ? JSON.parse(ss.getItem(KEY) || 'null') : null; } catch (_) { boot = null; }
    if (boot && (typeof boot.id !== 'string' || boot.id.length < 8)) boot = null;
    var linked = false; try { linked = /[?&]project=/.test(location.search || ''); } catch (_) {}
    var settled = !boot || linked;          // until the boot copy is reconciled, the pin is not overwritten
    var outcome = settled ? (linked ? 'link' : 'no-pin') : 'waiting';

    function uid() { try { return (typeof _supabaseSession !== 'undefined' && _supabaseSession && _supabaseSession.user) ? _supabaseSession.user.id : null; } catch (_) { return null; } }
    function cur() { try { return (typeof _activeCloudProjectId !== 'undefined') ? _activeCloudProjectId : null; } catch (_) { return null; } }
    function recoveryDone() { try { return (typeof _bootRecoveryHasRun === 'undefined') || _bootRecoveryHasRun === true; } catch (_) { return true; } }

    function remember() {
        if (!settled || !ss) return;
        var id = cur(), u = uid();
        if (!id || !u) return;
        var v = JSON.stringify({ id: String(id), uid: u });
        try { if (ss.getItem(KEY) !== v) ss.setItem(KEY, v); } catch (_) {}
    }
    function reconcile() {
        if (settled) return true;
        var u = uid();
        if (!u || !recoveryDone()) return false;
        settled = true;
        if (boot.uid !== u) { outcome = 'other-account'; return true; }
        if (String(cur() || '').toLowerCase() === boot.id.toLowerCase()) { outcome = 'same'; return true; }
        outcome = 'reopened';
        try { if (typeof window.openCloudProjectById === 'function') window.openCloudProjectById(boot.id); else outcome = 'no-opener'; } catch (_) { outcome = 'error'; }
        return true;
    }
    var tries = 0;
    var iv = setInterval(function () {
        tries++;
        // signed out for 30 s: nothing can be opened from the cloud; stop waiting (the pin stays for the next reload)
        if (reconcile() || tries > 60) { if (!settled) { outcome = 'timeout'; } clearInterval(iv); settled = true; }
    }, 500);
    setInterval(remember, 2000);
    try { window.addEventListener('pagehide', remember); } catch (_) {}

    window.SLTabProject = { KEY: KEY, boot: function () { return boot; }, outcome: function () { return outcome; }, settled: function () { return settled; }, _reconcile: reconcile, _remember: remember };
})();

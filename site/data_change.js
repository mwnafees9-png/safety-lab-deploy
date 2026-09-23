// ============================================================================
// data_change.js — v1.0 — ONE answer to "has the project data changed since I
// last looked?" (23 Sep 2026, perf round 2).
//
// WHY: background sweeps (the MF&MS seed sweep, the FTA proposals sweep) ran on
// blind timers and re-derived everything each time; on a large project each
// run was seconds of frozen UI, repeated every 8-10 s while the user did
// nothing. Each sweep only needs to run when its inputs changed. Rather than
// every sweep growing its own detector, they share this one.
//
// HOW (two signals that together cover every write path):
//   · an EDIT — every edit reaches scheduleAutosave (commitSaveChanges is built
//     on it, R18; save_watch.js catches writers that forget and calls it for
//     them). A wrapper bumps the generation.
//   · a REPLACEMENT — project load, sync pull, undo and demo loads ASSIGN new
//     store objects without necessarily saving. gen() compares the identity of
//     every synced store (the same list __crdtFingerprint reads) and bumps on a
//     difference.
//
// USE: const g = SLDataChange.gen(); if (g === myLast) skip; ...run...;
//      myLast = SLDataChange.gen();   // read AFTER the run, so a save the run
//                                     // itself made does not trigger a re-run.
// See tests/regression_data_change.test.js.
// ============================================================================
(function () {
    'use strict';
    var _gen = 1, _lastIds = null, _hooked = false;

    function _stores() {
        // Direct references only (the production CSP forbids dynamic lookup).
        var pc = (typeof projectConfig !== 'undefined') ? projectConfig : null;
        return [
            typeof acFunctionsData !== 'undefined' ? acFunctionsData : null,
            typeof acFhaData !== 'undefined' ? acFhaData : null,
            typeof acReqData !== 'undefined' ? acReqData : null,
            typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : null,
            typeof praData !== 'undefined' ? praData : null,
            typeof zsaData !== 'undefined' ? zsaData : null,
            typeof cmaData !== 'undefined' ? cmaData : null,
            typeof fmeaData !== 'undefined' ? fmeaData : null,
            typeof acFcimData !== 'undefined' ? acFcimData : null,
            typeof routingData !== 'undefined' ? routingData : null,
            typeof resourcesData !== 'undefined' ? resourcesData : null,
            typeof itemsData !== 'undefined' ? itemsData : null,
            typeof flightPhasesData !== 'undefined' ? flightPhasesData : null,
            typeof systemsData !== 'undefined' ? systemsData : null,
            typeof ftaPages !== 'undefined' ? ftaPages : null,
            pc, pc ? pc.interdep : null,
            typeof mlData !== 'undefined' ? mlData : null,
            typeof stpaData !== 'undefined' ? stpaData : null
        ];
    }
    function bump() { _gen++; return _gen; }
    function _hookSave() {
        // Once only: other modules wrap scheduleAutosave over ours later (the chain
        // still reaches us), so the outermost function never carries our mark.
        if (_hooked || typeof window === 'undefined' || typeof window.scheduleAutosave !== 'function') return;
        _hooked = true;
        var orig = window.scheduleAutosave;
        var wrapped = function () { _gen++; return orig.apply(this, arguments); };
        wrapped._dcWrapped = true;
        Object.keys(orig).forEach(function (k) { try { if (!(k in wrapped)) wrapped[k] = orig[k]; } catch (_) {} });
        window.scheduleAutosave = wrapped;
    }
    // The current generation. Cheap: one identity comparison per store.
    function gen() {
        _hookSave();
        var now = _stores();
        if (!_lastIds || now.some(function (x, i) { return x !== _lastIds[i]; })) { if (_lastIds) _gen++; _lastIds = now; }
        return _gen;
    }

    var api = { gen: gen, bump: bump };
    if (typeof window !== 'undefined') {
        window.SLDataChange = api;
        _hookSave();
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

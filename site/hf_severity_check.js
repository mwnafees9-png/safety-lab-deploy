// ============================================================================
// hf_severity_check.js — INV-HFW: crew-workload ↔ FHA-severity consistency.
//
// When an HFA functional assessment rates the crew workload for a failure
// condition materially LOWER than the FHA severity implies, that's a signal to
// re-check the severity (or the crew effect). AC 25.1309 writes severity in
// workload language — a Minor condition is "a slight increase in crew workload,"
// Major "a significant increase," Hazardous "excessive workload such that the
// crew cannot be relied upon." So the workload band maps to a minimum plausible
// severity; a big gap between that and the assigned FHA severity is a divergence
// worth verifying.
//
// The workload band is set per HF task on the HF register (hf.workloadBand); if
// none is set the module makes a CONSERVATIVE read of the FHA crew-effect text
// (only clear qualifiers). The FCIM crew-awareness flag is surfaced as context —
// an "Unaware" crew makes a severe-but-low-workload pairing especially worth a
// second look. Advisory only: it asks you to reconcile, it never hard-fails.
//
// Born modular: registers itself into the existing invariants sweep via
// window.invRegister, so it appears in the Thread Integrity panel and the
// evidence package with zero new plumbing. Fully defensive.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    // Workload band → the minimum severity that workload alone implies (25.1309).
    var BAND_TO_SEV = { none: 'Negligible', slight: 'Minor', significant: 'Major', excessive: 'Hazardous', incapacitating: 'Catastrophic' };
    var RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1, 'No Safety Effect': 1 };
    var BANDS = ['none', 'slight', 'significant', 'excessive', 'incapacitating'];
    var GAP = 2;   // flag only a material gap (≥2 severity bands) to stay low-noise

    function _rank(sev) {
        if (sev == null) return 0;
        if (RANK[sev] != null) return RANK[sev];
        try { if (typeof SEVERITY_RANK !== 'undefined' && SEVERITY_RANK[sev] != null) return SEVERITY_RANK[sev]; } catch (_) {}
        return 0;
    }
    // Conservative band read from a free-text crew effect — only unambiguous words.
    function _bandFromText(t) {
        t = String(t || '').toLowerCase();
        if (!/workload|crew|task/.test(t)) return null;
        if (/incapacit|overwhelm|unmanageable|cannot cope/.test(t)) return 'incapacitating';
        if (/excessive|heavy workload|high workload/.test(t)) return 'excessive';
        if (/significant|considerable|substantial/.test(t)) return 'significant';
        if (/slight|minimal|small increase|slightly/.test(t)) return 'slight';
        return null;   // "increased / cross-check / added" etc. are too vague to score
    }

    function _allFha() {
        var out = [];
        try { (typeof acFhaData !== 'undefined' ? acFhaData : []).forEach(function (f) { if (f) out.push({ f: f, scope: 'Aircraft' }); }); } catch (_) {}
        try { (typeof systemsData !== 'undefined' ? systemsData : []).forEach(function (s) { (s.fha || []).forEach(function (f) { if (f) out.push({ f: f, scope: s.name || s.id || 'System' }); }); }); } catch (_) {}
        return out;
    }
    // asmAll() returns {asmId,text,state,scope,origin} — no `type`, no `hf`. Every
    // read below tests exactly those two fields, so against asmAll() the answer was
    // always "no": the authored workload band was never seen and the evidence lane
    // refused every record in production. asmAllTyped() is the projection that
    // carries them. No fallback to asmAll() on purpose — falling back to a source
    // that cannot answer the question is what made this silent for so long.
    function _typedAsms() {
        try {
            const A = (typeof window !== 'undefined') ? window.HF_ASSUMPTIONS : null;
            return (A && typeof A.asmAllTyped === 'function') ? (A.asmAllTyped() || []) : [];
        } catch (_) { return []; }
    }
    function _asmById() {
        var m = {};
        try { _typedAsms().forEach(function (a) { if (a && a.asmId != null) m[a.asmId] = a; }); } catch (_) {}
        return m;
    }
    // The highest (worst) workload band any linked HF assessment gives this FC.
    function _bandForFc(f, byId) {
        var best = null, src = null;
        (f.assumptionIds || []).forEach(function (id) {
            var a = byId[id];
            if (a && a.type === 'hf' && a.hf && a.hf.workloadBand && BANDS.indexOf(a.hf.workloadBand) >= 0) {
                if (best == null || BANDS.indexOf(a.hf.workloadBand) > BANDS.indexOf(best)) { best = a.hf.workloadBand; src = id; }
            }
        });
        if (best) return { band: best, src: 'HFA ' + src };
        var tb = _bandFromText(f.effCrew);   // fallback: read the crew-effect text
        return tb ? { band: tb, src: 'crew-effect text' } : null;
    }
    // Awareness for a failure condition, from the FCIM (context for the finding).
    function _awarenessForFc(fcId) {
        if (fcId == null) return null;
        var rows = [];
        try { if (typeof acFcimData !== 'undefined') rows = rows.concat(acFcimData); } catch (_) {}
        try { if (typeof systemsData !== 'undefined') systemsData.forEach(function (s) { rows = rows.concat(s.fcim || []); }); } catch (_) {}
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (r && (String(r.tlId) === String(fcId) || String(r.plId) === String(fcId) || String(r.mId) === String(fcId))) return r.awareness || null;
        }
        return null;
    }

    function run() {
        var byId = _asmById();
        var rows = _allFha();
        var fails = [];
        rows.forEach(function (r) {
            var f = r.f;
            var sev = f.severity;
            if (!sev) return;
            var b = _bandForFc(f, byId);
            if (!b) return;                                  // no workload signal → nothing to check
            var impliedSev = BAND_TO_SEV[b.band];
            var gap = _rank(sev) - _rank(impliedSev);
            if (gap < GAP) return;                           // consistent (or workload higher) → fine
            var aware = _awarenessForFc(f.fcId);
            fails.push(r.scope + ' · ' + (f.fcId || '?') + ' [' + sev + ']: crew workload reads "' + b.band + '" (' + b.src +
                ') — implies at most ' + impliedSev + (aware ? ' · crew ' + aware : '') +
                '. Verify the severity is right, or update the crew effect.');
        });
        return { checked: rows.length, fails: fails };
    }

    function _register() {
        try {
            if (typeof window.invRegister === 'function') {
                window.invRegister({ id: 'INV-HFW', name: 'Crew workload consistent with FHA severity', sev: 'advisory', run: run });
                return true;
            }
        } catch (_) {}
        return false;
    }
    // invariants.js may load after us — retry briefly until invRegister exists.
    if (!_register()) {
        var n = 0, iv = setInterval(function () { if (_register() || ++n >= 40) clearInterval(iv); }, 250);
    }
    // expose for tests / other surfaces (e.g. a future FHA-row badge)
    window.HFSeverityCheck = { run: run, BAND_TO_SEV: BAND_TO_SEV };
})();

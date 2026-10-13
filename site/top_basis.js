// ============================================================================
// top_basis.js, v1.0, 13 Oct 2026 (fault tree math audit F1 + F8): ONE
// top-event number and ONE time basis for every pass/fail statement.
//
// WHY THIS FILE EXISTS
// The 12 Oct 2026 math audit found two ways the screens that say PASS or FAIL
// on a failure condition could disagree with each other on the SAME tree:
//
//   F1  Several screens read root.probability. That field is filled by the
//       gate-by-gate roll-up (calcBottomUp), which assumes every input is
//       independent. It leaves out the common cause (beta) term on every page
//       and leaves out shared events on every page except the one that is open.
//       The requirement check said "PASS 1.00e-8/hr" while the Budget Ledger
//       said "EXCEEDS 5.0e-6" on the same tree.
//   F8  The Budget Ledger and the critical gates test compared the per-flight
//       probability straight against the per-flight-hour objective, while the
//       requirement check first converted it to a per-flight-hour rate. On a
//       0.5 h eVTOL flight, 8e-10 per flight (1.6e-9 per flight hour) passed a
//       1e-9/FH objective in the ledger and failed it in the requirement check.
//
// WHAT IT PROVIDES (window.SLTopBasis, plus module.exports for node tests)
//   exactTop(root)              the exact top-event probability per flight: the
//                               BDD engine, which includes common cause groups
//                               and shared events, on any page, open or not.
//                               Cached (exactTopProbability). Returns null when
//                               the engine refuses (diagram too large): a pass or
//                               fail verdict is then withheld, never guessed from
//                               the independent roll-up.
//   missionHours(page)          the flight time used to turn a per-flight
//                               probability into a per-flight-hour rate:
//                                 1. the project mission duration, else
//                                 2. the sum of the NOMINAL flight phases of the
//                                    tree's own mission profile (contingency
//                                    phases such as rejected take-off are flown
//                                    on a small fraction of departures, so they
//                                    are not mission time; same rule as
//                                    getTotalFlightDuration and the exposure
//                                    ratio), else
//                                 3. the tree's exposure time (no mission model).
//                               Returns { hours, source }.
//   perFlightHour(P, page)      per-flight probability -> average rate per flight
//                               hour, rate = -ln(1 - P) / t_flight
//                               (AC 25.1309-1B average probability per flight hour).
//   perFlightBudget(rate, page) the inverse, P = 1 - exp(-rate x t_flight): the
//                               per-flight budget a per-flight-hour objective
//                               allows. The top-down allocator distributes this.
//   meets(P, objective, page)   the one comparison: per-flight-hour rate of P
//                               against the per-flight-hour objective, with one
//                               floating-point tolerance (1e-6 relative).
//
// Consumers (13 Oct 2026): requirement verification lane, Budget Ledger,
// critical gates, invariants INV-03, SSA page, Golden Thread budget check, ASA
// measured lane, uncertainty bands, CCMR not-to-exceed search, MMEL dispatch
// check, safety-significant events export, the top-down allocator context.
// See tests/regression_top_basis_20261013.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var TOL = 1e-6;   // relative tolerance for every objective comparison

    function _num(v) { var n = Number(v); return (isFinite(n) && n > 0) ? n : null; }
    function _activeId() { try { return (typeof activeFTAPageId !== 'undefined') ? activeFTAPageId : root.activeFTAPageId; } catch (_) { return null; } }
    function _ftaConfig() { try { return (typeof ftaConfig !== 'undefined') ? ftaConfig : root.ftaConfig; } catch (_) { return null; } }
    function _projectConfig() { try { return (typeof projectConfig !== 'undefined') ? projectConfig : root.projectConfig; } catch (_) { return null; } }
    function _flightPhases() { try { return (typeof flightPhasesData !== 'undefined') ? flightPhasesData : root.flightPhasesData; } catch (_) { return null; } }

    // ---- the exact top-event probability ---------------------------------------
    function exactTop(rootNode) {
        if (!rootNode) return null;
        try {
            var p;
            if (typeof exactTopProbability === 'function') p = exactTopProbability(rootNode);
            else if (typeof computeExactProbability === 'function') p = computeExactProbability(rootNode).prob;
            else if (root.SLFTAEngine && typeof root.SLFTAEngine.computeExactProbability === 'function') p = root.SLFTAEngine.computeExactProbability(rootNode).prob;
            else return null;
            return (typeof p === 'number' && isFinite(p) && p >= 0) ? p : null;
        } catch (_) { return null; }   // BDD refusal: no number, so no verdict
    }

    // ---- the mission (flight) time ------------------------------------------------
    function _phasesFor(page) {
        var isActive = !page || (page && page.id != null && page.id === _activeId());
        try {
            if (isActive && typeof _activeTreeMissionPhases === 'function') return _activeTreeMissionPhases() || [];
            if (page && typeof _missionProfilePhases === 'function') return _missionProfilePhases(page.missionProfileId || '') || [];
        } catch (_) {}
        return _flightPhases() || [];
    }
    function _isSpecial(p) {
        try { if (typeof _phaseIsSpecial === 'function') return !!_phaseIsSpecial(p); } catch (_) {}
        try { if (typeof isSpecialPhase === 'function') return !!isSpecialPhase(p); } catch (_) {}
        return !!(p && p.special === true);
    }
    function _hours(p) {
        try { if (typeof parseDurationToHours === 'function') return parseDurationToHours(p.duration, p.durationUnit) || 0; } catch (_) {}
        return 0;
    }
    function missionHours(page) {
        var pc = _projectConfig();
        var md = pc ? _num(pc.missionDuration) : null;
        if (md) return { hours: md, source: 'project-defined' };
        var sum = 0;
        (_phasesFor(page) || []).forEach(function (p) { if (p && !_isSpecial(p)) { var h = _hours(p); if (h > 0) sum += h; } });
        if (sum > 0) return { hours: sum, source: 'sum-of-flight-phases' };
        var fc = _ftaConfig();
        return { hours: (fc && _num(fc.exposureTime)) || 1, source: 'no-mission-defined' };
    }
    var SOURCE_LABEL = {
        'project-defined': 'project mission duration',
        'sum-of-flight-phases': 'sum of the nominal flight phases',
        'no-mission-defined': 'no mission model, the tree exposure time is used as the flight time'
    };

    // ---- per flight <-> per flight hour -------------------------------------------
    function perFlightHour(pFlight, page) {
        var p = Number(pFlight);
        if (!isFinite(p) || p < 0) return null;
        var m = missionHours(page);
        var rate = -Math.log1p(-Math.min(p, 1 - 1e-15)) / m.hours;
        return { rate: rate, pFlight: p, hours: m.hours, source: m.source };
    }
    function perFlightBudget(ratePerFH, page) {
        var r = Number(ratePerFH);
        if (!isFinite(r) || r < 0) return null;
        var m = missionHours(page);
        return { pFlight: -Math.expm1(-r * m.hours), rate: r, hours: m.hours, source: m.source };
    }
    function meets(pFlight, objectivePerFH, page) {
        var o = Number(objectivePerFH);
        var n = perFlightHour(pFlight, page);
        if (!n || !isFinite(o) || !(o > 0)) return null;
        return { pass: n.rate <= o * (1 + TOL), rate: n.rate, pFlight: n.pFlight, objective: o, hours: n.hours, source: n.source };
    }
    function describe(n) {
        if (!n) return '';
        return 'P = ' + Number(n.pFlight).toExponential(2) + ' per flight over a ' + Number(n.hours).toFixed(3) + ' h flight (' + (SOURCE_LABEL[n.source] || n.source) + ') = ' + Number(n.rate).toExponential(2) + ' per flight hour';
    }

    var api = { exactTop: exactTop, missionHours: missionHours, perFlightHour: perFlightHour, perFlightBudget: perFlightBudget, meets: meets, describe: describe, SOURCE_LABEL: SOURCE_LABEL, TOL: TOL };
    try { root.SLTopBasis = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

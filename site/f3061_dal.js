// ============================================================================
// f3061_dal.js — v1.0 — Part 23 software / airborne-electronic-hardware DALs
// from ASTM F3061/F3061M-22b §4.2.5, Table 1 (23 Sep 2026, standards gap G4).
//
// WHY: F3061 §4.2.5 allows TWO ways to set SW/AEH DALs on a Part 23 aeroplane:
// its Table 1 (a primary "P" and a secondary "S" DAL per Assessment Level and
// failure-condition class), OR the ARP4754 DAL-assignment method. The app used
// to MIX them: the top DAL came from Table 1's P column, then ARP4754's
// reductions (two levels down, or one) were applied to that already-lowered
// top — so a backup could land below what EITHER method allows (e.g. DAL E
// behind a Catastrophic condition on a Level I aeroplane, where both methods
// require C).
//
// WHAT (Waqas's ruling, 23 Sep 2026: "Table 1 default + ARP4754 option"):
//   projectConfig.part23DalMethod
//     'f3061'   (default)  top = Table 1 P; at an AND gate with independence,
//                          one member keeps the incoming DAL and the others
//                          get Table 1 S — never lower. Table 1 has no third
//                          level, so nothing inside that failure condition's
//                          tree goes below S. Minor has no S (no reduction).
//     'arp4754'            ARP4754 end to end: top by severity (Cat A, Haz B,
//                          Maj C, Min D) and ARP4754B Options 1/2 as for Part 25.
//                          Probability targets stay F3230 Table 5 either way.
// Other bases are untouched (contextFor returns null → ARP4754B as before).
// Table values are facts from the owned 22b copy (a lookup, not its text).
// See tests/regression_f3061_dal.test.js.
// ============================================================================
(function (root) {
    'use strict';

    // Table 1: per Assessment Level, per class: P (primary) and S (secondary).
    // Negligible: no SW/AEH DAL requirement (E). Minor: P only.
    var TABLE1 = {
        I:   { Negligible: { P: 'E' }, Minor: { P: 'D' }, Major: { P: 'C', S: 'D' }, Hazardous: { P: 'C', S: 'D' }, Catastrophic: { P: 'C', S: 'C' } },
        II:  { Negligible: { P: 'E' }, Minor: { P: 'D' }, Major: { P: 'C', S: 'D' }, Hazardous: { P: 'C', S: 'C' }, Catastrophic: { P: 'C', S: 'C' } },
        III: { Negligible: { P: 'E' }, Minor: { P: 'D' }, Major: { P: 'C', S: 'D' }, Hazardous: { P: 'C', S: 'C' }, Catastrophic: { P: 'B', S: 'C' } },
        IV:  { Negligible: { P: 'E' }, Minor: { P: 'D' }, Major: { P: 'C', S: 'D' }, Hazardous: { P: 'B', S: 'C' }, Catastrophic: { P: 'A', S: 'B' } }
    };
    // ARP4754B severity → top DAL (Table 2), used by the 'arp4754' method.
    var ARP_LADDER = { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' };
    var METHODS = [
        { v: 'f3061',   label: 'ASTM F3061 Table 1 (primary + secondary DAL) — default' },
        { v: 'arp4754', label: 'ARP4754 DAL assignment (top A/B/C/D by severity, Options 1 and 2)' }
    ];
    var ORDER = ['A', 'B', 'C', 'D', 'E'];

    function _isPart23(cfg) {
        var r = String((cfg && cfg.regulation) || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return r === 'part23';
    }
    function _level(cfg) { var c = cfg && cfg.part23Class; return TABLE1[c] ? c : null; }
    function method(cfg) {
        if (!_isPart23(cfg)) return null;
        return (cfg && cfg.part23DalMethod === 'arp4754') ? 'arp4754' : 'f3061';
    }
    function cell(level, severity) { var row = TABLE1[level]; return (row && row[severity]) || null; }

    // The top (primary) DAL for a severity, or null when this module does not decide it.
    function topDal(severity, cfg) {
        var m = method(cfg); if (!m) return null;
        if (m === 'arp4754') return ARP_LADDER[severity] || null;
        var c = cell(_level(cfg), severity); return c ? c.P : null;
    }
    // Context the allocator carries down one failure condition's tree, or null
    // (→ ARP4754B options as before). Only the Table 1 method needs one.
    function contextFor(severity, cfg) {
        if (method(cfg) !== 'f3061') return null;
        var lvl = _level(cfg), c = cell(lvl, severity);
        if (!c) return null;
        return { method: 'f3061', level: lvl, severity: severity, primary: c.P, secondary: c.S || null };
    }
    // Less stringent of two DALs (the reduced member can never be stricter than
    // what it inherits, nor lower than S).
    function lessStrict(a, b) { if (!a) return b || null; if (!b) return a; return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b; }
    // The DAL a non-carrier member of an independent AND gets under Table 1.
    function secondaryFor(incoming, ctx) {
        if (!ctx || ctx.method !== 'f3061' || !ctx.secondary) return incoming;   // Minor: no secondary → no reduction
        return lessStrict(incoming, ctx.secondary);
    }

    var api = { TABLE1: TABLE1, ARP_LADDER: ARP_LADDER, METHODS: METHODS, method: method, cell: cell,
        topDal: topDal, contextFor: contextFor, secondaryFor: secondaryFor, lessStrict: lessStrict };
    try { root.SLF3061 = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

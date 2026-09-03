// ============================================================================
// mbsa_schema.js — v1.0 — the MBSA backend contract (architecture for
// M1 typed lanes · M2 modes · M5 XMI import · A1 assumption binding).
//
// M1, M2, and M5 all extend the SAME store (projectConfig.macModels) and
// the same provenance conventions. Building them ad hoc would mean three
// schema migrations; this module fixes the contract FIRST, so each build
// lands on a stable shape and existing L0–L2 models remain valid forever.
//
// THE CONTRACT (schema version 'mbsa-3.draft-1'):
//
//   rule (today, L0–L2 — unchanged and forever valid):
//     { id, level, subId, phase, clauses:[{min, of:[sysId]}],
//       substantiation:{kind:'assumption'|'sdd'|..., ref, by, at} }
//
//   L3 additions (M1 — all OPTIONAL; absence ⇒ exact L0–L2 behavior):
//     rule.lanes: subset of ['loss','erroneous','inadvertent']
//       — which deviation lanes this rule's clauses constrain (default
//         ['loss'], today's availability semantics).
//     rule.flows: [{ id, from:sysId, to:sysId, lane, transfer:
//         'pass'|'block'|'transform', note }]
//       — typed propagation edges; 'pass' is the compile-neutral default.
//
//   Mode additions (M2 — OPTIONAL):
//     rule.modes: [{ id, name, active:[sysId], entry, exit }]
//       — availability reconfiguration; compiles to the verified
//         standby/Markov machinery, cross-checked by the seeded MC engine.
//
//   Provenance (M5 / Q10 conventions, identical to reqSource/reqifSource):
//     <row>.xmiSource: { tool, xmiId, at }        — architecture imports
//     <row>.reqSource / .reqifSource              — existing, unchanged
//
//   Assumption binding (A1 — applies to EVERY claim-bearing element):
//     <element>.assumptionRefs: [asmId]
//       — machine-held replacement for prose mentions; the assumption
//         register resolves these first, text mentions second.
//
// validate() enforces the contract with NAMED issues (never booleans) and
// is registered into the invariants sweep (INV-16, hard): a model that
// drifts from the schema fails the sweep before it can mis-compile.
// ============================================================================
(function () {
    'use strict';

    const SCHEMA_VERSION = 'mbsa-3.draft-1';
    const LANES = ['loss', 'erroneous', 'inadvertent'];
    const TRANSFERS = ['pass', 'block', 'transform'];

    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _sysIds() {
        const s = new Set();
        ((typeof systemsData !== 'undefined' ? systemsData : []) || []).forEach(x => x && s.add(x.id));
        return s;
    }

    // ---------------------------------------------------------- validation
    function validateRule(rule, sysIds) {
        const issues = [];
        const where = 'MAC rule ' + (rule && rule.id || '(no id)');
        if (!rule || typeof rule !== 'object') return [where + ': not an object'];
        if (!rule.id) issues.push(where + ': missing id');
        if (!rule.subId) issues.push(where + ': missing subId (the function it protects)');
        if (!Array.isArray(rule.clauses) || !rule.clauses.length) issues.push(where + ': no clauses');
        (rule.clauses || []).forEach((cl, i) => {
            if (!cl || !Array.isArray(cl.of) || !cl.of.length) { issues.push(where + ' clause ' + i + ': empty member list'); return; }
            if (!(cl.min >= 1) || cl.min > cl.of.length) issues.push(where + ' clause ' + i + ': min ' + cl.min + ' outside 1..' + cl.of.length);
            cl.of.forEach(m => { if (sysIds.size && !sysIds.has(m)) issues.push(where + ' clause ' + i + ': member "' + m + '" is not a live system'); });
            // D2 L1/L2 additions (all OPTIONAL; absence ⇒ exact L0 behavior)
            if (cl.weights !== undefined) {
                if (!cl.weights || typeof cl.weights !== 'object' || Array.isArray(cl.weights)) issues.push(where + ' clause ' + i + ': weights must be an object {sysId: number}');
                else Object.keys(cl.weights).forEach(k => {
                    if (!(+cl.weights[k] > 0)) issues.push(where + ' clause ' + i + ': weight for "' + k + '" must be > 0');
                    if (cl.of.indexOf(k) === -1) issues.push(where + ' clause ' + i + ': weight for "' + k + '" which is not a clause member');
                });
            }
            if (cl.floor !== undefined && cl.floor !== null) {
                const wsum = cl.of.reduce((a, m) => a + ((cl.weights && +cl.weights[m] > 0) ? +cl.weights[m] : 1), 0);
                if (!(+cl.floor > 0)) issues.push(where + ' clause ' + i + ': floor must be > 0');
                else if (+cl.floor > wsum + 1e-12) issues.push(where + ' clause ' + i + ': floor ' + cl.floor + ' exceeds total capacity ' + wsum + ' — unsatisfiable even with everything intact');
            }
        });
        // D2 degraded states (OPTIONAL)
        (rule.degraded || []).forEach((d, i) => {
            const dw = where + ' degraded ' + i;
            if (!d || !d.sysId) { issues.push(dw + ': missing sysId'); return; }
            if (!String(d.label || '').trim()) issues.push(dw + ': missing label');
            if (!(+d.weight >= 0)) issues.push(dw + ': retained weight must be ≥ 0');
            const inAnyClause = (rule.clauses || []).some(c => c && Array.isArray(c.of) && c.of.indexOf(d.sysId) !== -1);
            if (!inAnyClause) issues.push(dw + ': "' + d.sysId + '" is not a member of any clause');
            (rule.clauses || []).forEach((c, ci) => {
                if (!c || !Array.isArray(c.of) || c.of.indexOf(d.sysId) === -1) return;
                const w = (c.weights && +c.weights[d.sysId] > 0) ? +c.weights[d.sysId] : 1;
                if (+d.weight >= w) issues.push(dw + ': retained weight ' + d.weight + ' must be < the member\'s full capacity ' + w + ' (clause ' + ci + ')');
            });
        });
        // L3 lanes (optional)
        if (rule.lanes !== undefined) {
            if (!Array.isArray(rule.lanes) || !rule.lanes.length) issues.push(where + ': lanes must be a non-empty array when present');
            else rule.lanes.forEach(l => { if (LANES.indexOf(l) < 0) issues.push(where + ': unknown lane "' + l + '" (allowed: ' + LANES.join(', ') + ')'); });
        }
        (rule.flows || []).forEach((f, i) => {
            const fw = where + ' flow ' + (f && f.id || i);
            if (!f || !f.from || !f.to) issues.push(fw + ': missing from/to');
            if (f && f.lane && LANES.indexOf(f.lane) < 0) issues.push(fw + ': unknown lane "' + f.lane + '"');
            if (f && f.transfer && TRANSFERS.indexOf(f.transfer) < 0) issues.push(fw + ': unknown transfer "' + f.transfer + '" (allowed: ' + TRANSFERS.join(', ') + ')');
            if (f && f.from && sysIds.size && !sysIds.has(f.from)) issues.push(fw + ': from "' + f.from + '" is not a live system');
            if (f && f.to && sysIds.size && !sysIds.has(f.to)) issues.push(fw + ': to "' + f.to + '" is not a live system');
        });
        // M2 modes (optional)
        (rule.modes || []).forEach((m, i) => {
            const mw = where + ' mode ' + (m && m.id || i);
            if (!m || !m.id) issues.push(mw + ': missing id');
            if (!m || !Array.isArray(m.active) || !m.active.length) issues.push(mw + ': empty active-set');
            (m && m.active || []).forEach(a => { if (sysIds.size && !sysIds.has(a)) issues.push(mw + ': active member "' + a + '" is not a live system'); });
        });
        // A1 assumption refs (optional) — must resolve to live assumptions
        if (rule.assumptionRefs !== undefined) {
            const live = new Set((typeof window !== 'undefined' && typeof window.asmAll === 'function') ? window.asmAll().map(a => a.asmId) : []);
            (Array.isArray(rule.assumptionRefs) ? rule.assumptionRefs : []).forEach(id => {
                if (live.size && !live.has(id)) issues.push(where + ': assumptionRef "' + id + '" resolves to no live assumption');
            });
        }
        return issues;
    }

    function mbsaValidate() {
        const sysIds = _sysIds();
        const rules = (_pc().macModels || []).filter(Boolean);
        let issues = [];
        rules.forEach(r => { issues = issues.concat(validateRule(r, sysIds)); });
        return { version: SCHEMA_VERSION, rules: rules.length, issues, ok: issues.length === 0 };
    }

    // Register into the sweep: schema drift is a hard failure BEFORE compile.
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-16', name: 'MBSA model conforms to the schema contract (' + SCHEMA_VERSION + ')', sev: 'hard',
                run: () => {
                    const v = mbsaValidate();
                    return { checked: v.rules, fails: v.issues.slice(0, 15) };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // ------------------------------------------------------------- exports
    window.MBSA_SCHEMA = {
        version: SCHEMA_VERSION,
        lanes: LANES.slice(),
        transfers: TRANSFERS.slice(),
        validate: mbsaValidate,
        validateRule: r => validateRule(r, _sysIds()),
    };
})();

/* requirement_states.js: the live state of every generated requirement, for Sys Lab (18 Oct 2026).
 *
 * Ruled 18 Oct 2026 (Sys Lab build 1, independence from one source): Sys Lab never judges what Safety Lab owns.
 * The independence requirements AutoReq writes for each AND-family gate (functional, physical, development,
 * common cause) are the single source of every independence claim, and the credit a fault tree event earns
 * is read from the state of the requirements Safety Lab already generates for it:
 *   - probability: the allocated budget against the verification tree's computed value (the same evidence
 *     the requirements page shows, getAutoReqVerificationEvidence in fta_view_modules.js);
 *   - independence: compromised or not, and for a DAL reduction, whether the CMA has substantiated it;
 *   - crew: whether the human factors assumption behind the task is validated (HF_ASSUMPTIONS.isValidated).
 * The states are computed here, by Safety Lab's own code, at export time, and written beside the project as
 * requirement-states.json (the same way zonal-exchange.json carries the zonal picture). Nothing is re-derived
 * on the Sys Lab side. A failure here never stops an export.
 */
(function (root) {
    'use strict';
    var FORMAT = 'safety-lab-requirement-states', VERSION = 1;

    // the gate a gate-independence requirement belongs to, from its sourceId ("scope:gen:page:node[:...]")
    function gateOf(gen, sourceId) {
        if (!/^gate-indep/.test(gen || '')) return null;
        var p = String(sourceId || '').split(':');
        return p.length >= 4 ? { page: p[2], node: p[3] } : null;
    }
    function kindOf(gen) {
        return ({ 'gate-indep-and': 'functional', 'gate-indep-or': 'single-failure', 'gate-indep-phys': 'physical', 'gate-indep-dev': 'development',
            'gate-indep-ccf-lib': 'common-design', 'gate-indep-ccf-group': 'common-cause', 'gate-indep-cma': 'common-mode' })[gen] || '';
    }
    function plain(v) { try { return v == null ? null : JSON.parse(JSON.stringify(v)); } catch (e) { return null; } }
    function evidenceOf(r, deps) {
        if (!deps.evidence) return null;
        try {
            var e = deps.evidence(r);
            return e ? { state: String(e.state || ''), label: String(e.label || ''), detail: String(e.detail || ''), actual: typeof e.actual === 'number' ? e.actual : null, target: typeof e.target === 'number' ? e.target : null } : null;
        } catch (err) { return { state: 'error', label: 'Could not be evaluated', detail: String((err && err.message) || err) }; }
    }
    function rowOf(r, scope, deps) {
        var src = r.reqSource || {}, gen = src.generator || '', ctx = src.context || {};
        // the ID Safety Lab shows for a generated requirement: its own if set, else REQ-<internalId> (assurance_modules.js)
        var out = { scope: scope, internalId: r.internalId, id: r.id || r.reqId || ('REQ-' + r.internalId), generator: gen, sourceId: src.sourceId || '', traceId: r.traceId || '',
            text: String(r.text || ''), compromised: !!r.compromised,
            // AutoReq's own reasons ({kind, detail, structural}); a structural note travels with them but never compromises
            reasons: (r.compromiseReasons || []).map(function (x) { return typeof x === 'string' ? { kind: '', detail: x, structural: false } : { kind: String((x && x.kind) || ''), detail: String((x && x.detail) || ''), structural: !!(x && x.structural) }; }).filter(function (x) { return x.detail; }),
            stale: !!src.stale, context: plain(ctx) || {}, evidence: evidenceOf(r, deps) };
        var g = gateOf(gen, out.sourceId);
        if (g) { out.gate = g; out.kind = kindOf(gen); }
        if (gen === 'gate-indep-dev') out.substantiated = ctx.cmaStatus === 'substantiated';
        if (gen === 'fta-event') { var p = String(out.sourceId).split(':'); out.eventLid = p[p.length - 1]; }
        if (/^hf-op/.test(gen) && ctx.asmId) out.asmId = String(ctx.asmId);
        return out;
    }
    // exportStates(project, deps): pure over its inputs. deps.evidence(row) is Safety Lab's evidence function and
    // deps.isValidated(state) the human factors rule; both are optional (a missing one leaves the field empty).
    function exportStates(project, deps) {
        deps = deps || {};
        var P = project || {}, reqs = [], asm = [];
        var auto = function (r) { return r && !r.deleted && r.reqSource && r.reqSource.generator && !r.reqSource.obsolete; };
        (P.acReqData || []).forEach(function (r) { if (auto(r)) reqs.push(rowOf(r, 'ac', deps)); });
        (P.systemsData || []).forEach(function (s) { (s.req || []).forEach(function (r) { if (auto(r)) reqs.push(rowOf(r, String(s.id), deps)); }); });
        (P.acAssumptionsData || []).forEach(function (a) {
            var id = String((a && (a.asmId || a.id)) || ''); if (!id) return;
            var st = String(a.state || a.status || '');
            asm.push({ asmId: id, state: st, validated: deps.isValidated ? !!deps.isValidated(st) : null, crew: !!(a.hf && typeof a.hf === 'object') });
        });
        return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), requirements: reqs, assumptions: asm };
    }
    function hasContent(x) { return !!(x && ((x.requirements && x.requirements.length) || (x.assumptions && x.assumptions.length))); }
    // From the running app: the live project globals, Safety Lab's evidence and validation rules.
    function exportFromApp() {
        var g = root;
        var P = { acReqData: typeof acReqData !== 'undefined' ? acReqData : g.acReqData, systemsData: typeof systemsData !== 'undefined' ? systemsData : g.systemsData,
            acAssumptionsData: typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : g.acAssumptionsData };
        var ev = typeof getAutoReqVerificationEvidence === 'function' ? getAutoReqVerificationEvidence : (typeof g.getAutoReqVerificationEvidence === 'function' ? g.getAutoReqVerificationEvidence : null);
        var hfa = g.HF_ASSUMPTIONS && typeof g.HF_ASSUMPTIONS.isValidated === 'function' ? g.HF_ASSUMPTIONS : null;
        return exportStates(P, { evidence: ev, isValidated: hfa ? function (s) { return hfa.isValidated(s); } : null });
    }
    var api = { FORMAT: FORMAT, VERSION: VERSION, exportStates: exportStates, exportFromApp: exportFromApp, hasContent: hasContent, gateOf: gateOf, kindOf: kindOf };
    root.SLReqStates = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

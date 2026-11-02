// fta_latent.js: SLFtaLatent 1.0
//
// 1 Nov 2026 (customer checklist item 41, Waqas: "41 is correct"): LATENT PLUS ONE. A latent failure is one nobody
// notices when it happens (it is found only by a check, a test or an inspection). If a latent failure and one other
// failure together reach a catastrophic failure condition, the aircraft can fly for a long time one failure away from
// it. AC 25.1309-1B asks that such a pair be avoided, and where it cannot be, that the latent failure is checked often
// enough for the pair to stay within the condition's objective.
//
// For every latent event in a tree this module lists every single active failure that, with it, reaches the top (the
// two-event minimal cut sets that hold it), and checks each pair:
//   - the latent event needs a check interval (periodic test tau, or a latent dormancy interval);
//   - the interval needs a requirement that covers it (the check interval requirement AutoReq writes, accepted into
//     the requirements, not out of date);
//   - the pair's probability, latent times active, per flight hour, must be within the failure condition's objective.
// Judged for catastrophic, hazardous and major failure conditions (Waqas, 2 Nov 2026: "hazardous and major both should
// get latent plus 1 check"); on a tree whose worst condition is minor, or has no condition, the pairs are listed only.
//
// Shown: the node's warning pill and properties box (ftaNodeWarnings reads node._lp1, stamped on the open tree by
// calculateAllProbabilities), the report table latent_plus_one_table, and the Golden Thread (a latent-plus-one card in
// the common cause column, linked to the covering requirement, or flagged open).
//
// API (window.SLFtaLatent): isLatent(node), intervalOf(node), pairs(page) -> { rows, refused }, stamp(page),
// coveringRequirement(lid) -> { req, kind, systemId, stale } | null, tableRows(pages), STATUS_TEXT.
(function () {
    'use strict';
    var VERSION = '1.0';
    var STATUS_TEXT = {
        'open-no-interval': 'Open: the latent event has no check interval',
        'open-no-requirement': 'Open: no requirement covers the check interval',
        'open-stale-requirement': 'Open: the check interval requirement is out of date',
        'exceeds': 'Exceeds the objective',
        'meets': 'Meets the objective, interval covered',
        'not-judged': 'Listed only (judged for catastrophic, hazardous and major conditions)'
    };
    function _pages() { try { if (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) return ftaPages; } catch (_) {} return []; }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _lid(n) { return String(n.logicalId != null ? n.logicalId : n.id); }
    function _byId(id) { var ps = _pages(); for (var i = 0; i < ps.length; i++) if (ps[i] && String(ps[i].id) === String(id)) return ps[i]; return null; }
    function _isTransfer(n) { return !!n && (n.gateType === 'TRANSFER' || !!n.transferOutTo); }

    function isLatent(n) { return !!n && n.type !== 'gate' && (n.repairModel === 'periodic' || n.exposureMode === 'latent' || n.latent === true); }
    function intervalOf(n) {
        if (!n) return null;
        var tau = parseFloat(n.tau);
        if (n.repairModel === 'periodic' && tau > 0) return { hours: tau, kind: 'periodic test' };
        var d = parseFloat(n.dormancyInterval);
        if (n.exposureMode === 'latent' && d > 0) return { hours: d, kind: 'latent dormancy' };
        return null;
    }
    // every event a tree reaches, transfers followed, by logical id
    function _events(page) {
        var m = new Map(), seen = new Set();
        (function w(n) {
            if (!n || seen.has(n)) return; seen.add(n);
            if (_isTransfer(n)) { var tp = _byId(n.transferOutTo || n.linkedPageId); if (tp && tp.root) w(tp.root); }
            if (n.type !== 'gate' && !m.has(_lid(n))) m.set(_lid(n), n);
            _kids(n).forEach(w);
        })(page && page.root);
        return m;
    }
    function _hasLatent(page) { var hit = false; _events(page).forEach(function (n) { if (isLatent(n)) hit = true; }); return hit; }
    // the worst failure condition this tree serves, and its objective per flight hour
    var SEV = { Catastrophic: 5, Hazardous: 4, Major: 3, Minor: 2, 'No Safety Effect': 1 };
    function _condition(page) {
        var ids = (Array.isArray(page.linkedFhaIds) && page.linkedFhaIds.length) ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
        if (page.integrated) { var src = _byId(page.integrated.sourcePageId); if (src) return _condition(src); }
        var all = [];
        try { (typeof acFhaData !== 'undefined' ? acFhaData : []).forEach(function (f) { all.push(f); }); } catch (_) {}
        try { (typeof systemsData !== 'undefined' ? systemsData : []).forEach(function (s) { (s.fha || []).forEach(function (f) { all.push(f); }); }); } catch (_) {}
        var best = null;
        ids.forEach(function (id) { var f = all.find(function (x) { return x && String(x.internalId) === String(id); }); if (f && (!best || (SEV[f.severity] || 0) > (SEV[best.severity] || 0))) best = f; });
        var obj = null;
        try { if (best && typeof getSafetyTarget === 'function') { var t = getSafetyTarget(best.severity); if (t && t.prob != null) obj = Number(t.prob); } } catch (_) {}
        return { fc: best, severity: best ? best.severity : null, objective: obj };
    }
    // the check interval requirement for an event, as AutoReq writes it (sourceId <scope>:fta-interval:<lid>)
    function coveringRequirement(lid) {
        var hit = null, want = ':fta-interval:' + String(lid);
        function look(list, kind, sysId) { (list || []).forEach(function (r) { if (hit || !r || !r.reqSource) return; var sid = String(r.reqSource.sourceId || ''); if (r.reqSource.generator === 'fta-interval' && sid.slice(-want.length) === want) hit = { req: r, kind: kind, systemId: sysId, stale: !!(r.reqSource.stale || r.reqSource.obsolete) }; }); }
        try { look(typeof acReqData !== 'undefined' ? acReqData : [], 'acReq', null); } catch (_) {}
        try { (typeof systemsData !== 'undefined' ? systemsData : []).forEach(function (s) { look(s.req, 'sysReq', s.id); }); } catch (_) {}
        return hit;
    }
    function pairs(page) {
        var out = { rows: [], refused: null, condition: null };
        if (!page || !page.root) return out;
        var ev = _events(page), latents = [];
        ev.forEach(function (n, lid) { if (isLatent(n)) latents.push(lid); });
        if (!latents.length) return out;
        var cs;
        try { cs = (typeof minimalCutsetSnapshots === 'function') ? minimalCutsetSnapshots(page.root) : bddMinimalCutsets(page.root); }
        catch (e) { out.refused = (e && e.message) || 'the cut sets could not be computed'; return out; }
        var cond = _condition(page); out.condition = cond;
        var judged = cond.severity === 'Catastrophic' || cond.severity === 'Hazardous' || cond.severity === 'Major';
        (cs || []).forEach(function (set) {
            if (!set || set.length !== 2) return;
            if (set.some(function (m) { return m && m.isCCF; })) return;
            var a = ev.get(String(set[0].logicalId != null ? set[0].logicalId : set[0].id)), b = ev.get(String(set[1].logicalId != null ? set[1].logicalId : set[1].id));
            if (!a || !b) return;
            var la = isLatent(a), lb = isLatent(b);
            if (la === lb) return;   // two active failures, or two latent ones: not latent plus one
            var L = la ? a : b, A = la ? b : a;
            var pL = Number(L.probability), pA = Number(A.probability);
            var pPair = (pL > 0 && pA > 0) ? pL * pA : null;
            var n = (pPair != null && typeof SLTopBasis !== 'undefined' && SLTopBasis) ? SLTopBasis.perFlightHour(pPair, page) : null;
            var iv = intervalOf(L), cov = coveringRequirement(_lid(L));
            var status;
            if (!judged) status = 'not-judged';
            else if (!iv) status = 'open-no-interval';
            else if (!cov) status = 'open-no-requirement';
            else if (cov.stale) status = 'open-stale-requirement';
            else if (n && cond.objective != null && n.rate > cond.objective * (1 + 1e-6)) status = 'exceeds';
            else status = 'meets';
            out.rows.push({ page: page, latent: L, active: A, latentLid: _lid(L), interval: iv, pPair: pPair, rate: n ? n.rate : null, objective: cond.objective, severity: cond.severity, requirement: cov, status: status });
        });
        return out;
    }
    function _bad(s) { return s === 'open-no-interval' || s === 'open-no-requirement' || s === 'open-stale-requirement' || s === 'exceeds'; }
    // node._lp1 on every latent event of the tree on screen: its pairs (read by ftaNodeWarnings)
    function stamp(page) {
        if (!page || !page.root) return null;
        var ev = _events(page);
        ev.forEach(function (n) { if (n._lp1) delete n._lp1; });
        if (!_hasLatent(page)) return null;
        var res = pairs(page);
        res.rows.forEach(function (r) { (r.latent._lp1 = r.latent._lp1 || []).push({ active: (r.active.displayId || '') + ' ' + (r.active.name || ''), rate: r.rate, objective: r.objective, status: r.status, req: r.requirement ? (r.requirement.req.traceId || r.requirement.req.id || ('REQ-' + r.requirement.req.internalId)) : null, interval: r.interval }); });
        return res;
    }
    function _fmt(v) { return (v != null && isFinite(v)) ? Number(v).toExponential(2).toUpperCase() : 'no value'; }
    // the report table: one row per pair, every tree in scope (an integrated tree repeats its sources, so it is left out)
    function tableRows(pagesIn) {
        var rows = [];
        (pagesIn || _pages()).forEach(function (p) {
            if (!p || !p.root || p.integrated || !_hasLatent(p)) return;
            var res = pairs(p);
            res.rows.forEach(function (r) {
                rows.push({
                    'Tree': p.name || p.id,
                    'Latent event': (r.latent.displayId ? r.latent.displayId + ' ' : '') + (r.latent.name || ''),
                    'Check interval': r.interval ? (r.interval.hours + ' h (' + r.interval.kind + ')') : 'none',
                    'Active failure': (r.active.displayId ? r.active.displayId + ' ' : '') + (r.active.name || ''),
                    'Pair per flight hour': _fmt(r.rate),
                    'Objective per flight hour': r.objective != null ? _fmt(r.objective) : 'none',
                    'Requirement': r.requirement ? (r.requirement.req.traceId || r.requirement.req.id || ('REQ-' + r.requirement.req.internalId)) : 'none',
                    'Status': STATUS_TEXT[r.status] || r.status
                });
            });
        });
        return rows;
    }

    var api = { VERSION: VERSION, STATUS_TEXT: STATUS_TEXT, isLatent: isLatent, intervalOf: intervalOf, pairs: pairs, stamp: stamp, coveringRequirement: coveringRequirement, tableRows: tableRows, isOpen: _bad };
    try { if (typeof window !== 'undefined') window.SLFtaLatent = api; } catch (_) {}
    try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (_) {}
})();

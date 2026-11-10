// ssa_autopilot.js (SLSsaAuto v1.0, 10 Nov 2026): the SSA Autopilot. One System Safety Assessment per system, in the system's
// SSA tab: the front of the report (what it verifies, the PSSA baseline it rests on, the method, the budgets against the design,
// the requirements the aircraft placed on the system) and one appendix per function, the same functions as the PSSA's, each
// holding every failure condition of that function rated Minor or above.
//
// Waqas, 10 Nov 2026: "get it all done please, along with the ssa and asa"; "the SSAs stay locked till at least the first version
// has been baselined for the respective PSSAs, and ASA stays locked till all SSAs and PASA has been baselined".
//   Baselined (not defined by Waqas; the proposal made to him, used and stated here): the report has an issued revision (Revision
//   A or later, Document control "Issue revision") and every one of its outputs is accepted. Once a system's SSA has opened it
//   stays open: a later PSSA revision does not lock it again, and its numbers follow the newer PSSA (they are read live).
//   What the SSA holds (the brief): the trees worked out again with the real rates (the verification trees, bottom-up, from the
//   FMEA and the equipment rates); the budget against the design; every requirement with its verification method, evidence and
//   status; the path to compliance as the requirements being closed.
//   Questions (the proposal, used and stated): only what the data cannot settle, which is the evidence that closes each
//   requirement, picked from what is already linked to it (its verification tree, its common mode analysis, the system FMEA, the
//   evidence already recorded). Everything else is generated. A requirement already marked Passed is filled in and named.
//   Scope, system and method come from the PSSA's own answers; they are not asked again.
// Same frame as the PASA and PSSA (cca_report.js 2.1, appendices and parts), same AI drafting and live comments.
//
// Kept here: projectConfig.ssaAuto = { opened: { <sysId>: { rev, at } }, close: { <sysId>|<reqInternalId>: { ev, by, at } } }
// Written where it lives: the requirement's own verifEvidence and verifStatus (the register). window.SLSsaAuto.
(function (root) {
    'use strict';
    var VERSION = '1.0';
    function g(n) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(n); if (v !== undefined) return v; } } catch (_) {} try { return root[n]; } catch (_) { return undefined; } }
    function L() { return root.SLPasaAuto && root.SLPasaAuto.lib; }
    function P2() { return root.SLPssaAuto || null; }
    function S(v) { return v == null ? '' : String(v); }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function safe(f, d) { try { var v = f(); return v === undefined ? d : v; } catch (_) { return d; } }
    function pc() { var p = g('projectConfig'); return p && typeof p === 'object' ? p : null; }
    function now() { return new Date().toISOString(); }
    function who() { return root.SLAutopilotUI ? root.SLAutopilotUI.who() : 'Engineer'; }
    function save() { try { if (root.SLDataChange && root.SLDataChange.bump) root.SLDataChange.bump(); } catch (_) {} if (root.SLAutopilotUI) root.SLAutopilotUI.save(); }
    function memoGen() { var dc = root.SLDataChange; return dc && dc.gen ? dc.gen() : -1; }
    function H(level, text, extra) { return Object.assign({ k: 'h', level: level, text: text }, extra || {}); }
    function P(text, q) { return q ? { k: 'p', text: text, q: q } : { k: 'p', text: text }; }

    // ---- baselines (shared with the ASA) -------------------------------------------------------------------------------
    // a report is baselined when it has an issued revision and every output is accepted (its fingerprint unchanged)
    function baseline(key, rep) {
        var CR = root.SLCcaReport, R = CR && CR.get ? CR.get(key) : null, p = pc();
        var st = p && p.ccaReports && p.ccaReports[key], d = st && st.docs && st.docs[rep], iss = d && arr(d.issues);
        var out = { key: key, rep: rep, issued: !!(iss && iss.length), rev: iss && iss.length ? S(iss[iss.length - 1].rev) : null, date: iss && iss.length ? S(iss[iss.length - 1].date) : null, open: [], ok: false };
        if (!R) { out.open.push('The report is not loaded'); return out; }
        var acc = safe(function () { return R.withRep(rep, function () { return R.acceptance(); }); }, []) || [];
        out.open = acc.filter(function (o) { return o.state !== 'accepted'; }).map(function (o) { return S(o.what); });
        out.ok = out.issued && acc.length > 0 && !out.open.length;
        return out;
    }
    function sstore() {
        var p = pc(); if (!p) return { opened: {}, close: {} };
        if (!p.ssaAuto || typeof p.ssaAuto !== 'object') p.ssaAuto = {};
        var s0 = p.ssaAuto; if (!s0.opened || typeof s0.opened !== 'object') s0.opened = {}; if (!s0.close || typeof s0.close !== 'object') s0.close = {};
        return s0;
    }
    // a system's SSA is open once its PSSA has been baselined; it stays open after that
    function lockOf(sy) {
        var s0 = sstore(), k = S(sy.id);
        if (s0.opened[k]) return { locked: false, opened: s0.opened[k], pssa: null };
        var b = baseline('pssa', 'sys:' + k);
        if (b.ok) { s0.opened[k] = { rev: b.rev, at: now() }; try { if (root.SLAutopilotUI) root.SLAutopilotUI.save(); } catch (_) {} return { locked: false, opened: s0.opened[k], pssa: b }; }
        return { locked: true, pssa: b };
    }
    function lockWhy(b) {
        var a = [];
        if (!b.issued) a.push('The PSSA has not been issued yet: issue Revision A in its Document control.');
        if (b.open.length) a.push('Outputs of the PSSA not accepted yet: ' + L().listJoin(b.open.map(L().lc)) + '.');
        return a;
    }

    // ---- the system, its functions and failure conditions (the PSSA's) ----------------------------------------------------
    function sysNow() { return P2() ? P2().sysNow() : null; }
    function sysById(id) { return arr(g('systemsData')).filter(function (s) { return s && S(s.id) === S(id); })[0] || null; }
    function apx(sy) { return P2() ? P2().appendices(sy) : []; }
    function fnGroups(sy, key) { return P2() ? P2().fnGroups(sy, key) : []; }
    function fnInfo(sy, key) { return P2().fnInfo(sy, key); }
    function fnTitle(f) { return f ? f.id + (f.name ? ' ' + f.name : '') : ''; }
    function groups(sy) { return sy && root.SLFcTrees ? (safe(function () { return root.SLFcTrees.groups(sy); }, []) || []) : []; }
    function groupOf(sy, fcId) { return groups(sy).filter(function (gr) { return gr.fcId === S(fcId); })[0] || null; }
    function treeOf(gr) { return gr && root.SLFcTrees ? safe(function () { return root.SLFcTrees.treeFor(gr); }, null) : null; }
    function isQuant(gr) { return P2() ? P2().isQuant(gr) : true; }
    function routeWords(gr) { return isQuant(gr) ? 'quantitative' : 'qualitative'; }
    function fcName(gr) { return gr ? gr.fcId + ' ' + L().T(gr.gov.fcDesc || '') : ''; }
    function sid(key) { return 'fn:' + key; }
    function fnOfSid(s) { return S(s).indexOf('fn:') === 0 ? S(s).slice(3) : null; }
    function letter(i) { var R0 = root.SLCcaReport && root.SLCcaReport.get('ssa'); return R0 && R0.appxLetter ? R0.appxLetter(i) : String.fromCharCode(65 + i); }

    // ---- the trees worked out again: the verification tree of each PSSA tree, and the budget ledger's numbers --------------
    var _led = { gen: -2, rows: null };
    function ledger() { var G = memoGen(); if (_led.gen !== G || G === -1 || !_led.rows) _led = { gen: G, rows: typeof root.budgetLedgerRows === 'function' ? (safe(function () { return root.budgetLedgerRows(); }, []) || []) : [] }; return _led.rows; }
    function pages() { return arr(g('ftaPages')); }
    function mirrorOf(page) { return page ? pages().filter(function (p) { return p && p.root && S(p.verifies) === S(page.id); })[0] || null : null; }
    function populated(page) { if (!page) return false; if (typeof root.slMirrorIsPopulated === 'function') return !!safe(function () { return root.slMirrorIsPopulated(page); }, false); return false; }
    function verified(sy, gr) {
        var page = treeOf(gr), mir = mirrorOf(page), rows = ledger().filter(function (r) { return S(r.systemId) === S(sy.id) && S(r.fcId) === gr.fcId; });
        var row = rows.filter(function (r) { return page && r.allocPage && S(r.allocPage.id) === S(page.id); })[0] || rows[0] || null;
        var pass = row && row.achieved != null && row.allocated != null && root.SLTopBasis ? row.achieved <= row.allocated * (1 + (root.SLTopBasis.TOL || 1e-6)) : null;
        var obj = row && row.achieved != null && row.objective != null ? row.achieved <= row.objective * (1 + ((root.SLTopBasis && root.SLTopBasis.TOL) || 1e-6)) : null;
        return { page: page, mirror: mir, filled: populated(mir), row: row, withinBudget: pass, withinObjective: obj };
    }

    // ---- the requirements: each with its method, evidence and status ------------------------------------------------------
    function live(r) { return r && !r.deleted; }
    var CLOSED = ['Passed', 'N/A'];
    function closed(r) { return CLOSED.indexOf(S(r.verifStatus)) >= 0; }
    // which failure condition of this system a requirement belongs to: the one it is driven from, or the one whose tree it is in
    var _rmap = { gen: -2, map: {} };
    function reqMap(sy) {
        var G = memoGen(), k = S(sy.id);
        if (_rmap.gen !== G || G === -1) _rmap = { gen: G, map: {} };
        if (_rmap.map[k]) return _rmap.map[k];
        var RT = root.SLReqTrace, m = { byFc: {}, other: [] }, trees = {};
        groups(sy).forEach(function (gr) { var p = treeOf(gr); if (p) trees[S(p.id)] = gr.fcId; m.byFc[gr.fcId] = []; });
        arr(sy.req).filter(live).forEach(function (r) {
            var d = RT ? safe(function () { return RT.drivenFrom(r); }, []) : [], hit = null;
            d.some(function (e) { if (/^fta:/.test(e.tab || '') && trees[e.tab.split(':')[1]]) { hit = trees[e.tab.split(':')[1]]; return true; } return false; });
            if (!hit) d.some(function (e) { if (/failure condition$/.test(e.what) && m.byFc[e.id]) { hit = e.id; return true; } return false; });
            if (!hit && m.byFc[S(r.traceId)]) hit = S(r.traceId);   // a row written by hand, traced to the failure condition
            if (hit) m.byFc[hit].push(r); else m.other.push(r);
        });
        return (_rmap.map[k] = m);
    }
    function reqsOf(sy, gr) { return reqMap(sy).byFc[gr.fcId] || []; }
    function rid(r) { return r.id ? S(r.id) : 'REQ-' + S(r.internalId); }
    // the evidence already linked to a requirement: what the engineer picks from
    function evidenceFor(sy, r) {
        var l = L(), RT = root.SLReqTrace, out = [], t = RT ? RT.typeOf(r) : null, d = RT ? safe(function () { return RT.drivenFrom(r); }, []) : [];
        var rec = sstore().close[S(sy.id) + '|' + S(r.internalId)];
        if (S(r.verifEvidence).trim() && !(rec && rec.label === S(r.verifEvidence))) out.push({ id: 'rec', label: 'The evidence already recorded: ' + l.T(r.verifEvidence) });
        // the verification tree of the tree it is driven from (or of its failure condition's tree)
        var pids = d.filter(function (e) { return /^fta:/.test(e.tab || ''); }).map(function (e) { return e.tab.split(':')[1]; });
        groups(sy).forEach(function (gr) { if (reqsOf(sy, gr).indexOf(r) >= 0) { var p = treeOf(gr); if (p && pids.indexOf(S(p.id)) < 0) pids.push(S(p.id)); } });
        pids.forEach(function (pid) {
            var pg = pages().filter(function (p) { return p && S(p.id) === pid; })[0], mir = mirrorOf(pg);
            if (mir && populated(mir)) out.push({ id: 'ver:' + mir.id, label: 'The verification tree ' + l.T(mir.name || mir.id) + ', worked out with the real failure rates' });
        });
        var cm = d.filter(function (e) { return e.what === 'Common mode analysis'; }).map(function (e) { return e.id; });
        l.cmas().forEach(function (c) { var ids = arr(c.linkedGateIds).map(S); if (cm.indexOf(S(c.cmaId)) < 0 && d.some(function (e) { return (e.what === 'Gate' || e.what === 'Event') && ids.indexOf(S(e.key || e.nodeId || '')) >= 0; })) cm.push(S(c.cmaId)); });
        cm.forEach(function (id) { var c = l.cmas().filter(function (x) { return S(x.cmaId) === S(id); })[0]; out.push({ id: 'cma:' + id, label: 'The common mode analysis ' + id + (c && c.subject ? ' ' + l.T(c.subject) : '') }); });
        if (arr(g('fmeaData')).some(function (f) { return f && (S(f.owningSystemId) === S(sy.id) || S(f.systemId) === S(sy.id)); })) out.push({ id: 'fmea', label: 'The ' + l.T(sy.name || sy.id) + ' FMEA' });
        if (t === 'dal') out.push({ id: 'dal', label: 'The development assurance records of the item (plans, reviews and the accomplishment summary)' });
        if (t === 'inst') out.push({ id: 'zsa', label: 'The zonal safety analysis and the particular risk assessment' });
        if (t === 'crew') out.push({ id: 'hf', label: 'The human factors evaluation and the crew procedures' });
        if (t === 'hid') out.push({ id: 'mrb', label: 'The maintenance program (the scheduled check of the hidden failure)' });
        if (!out.length) out.push({ id: 'test', label: 'A test or analysis report for this requirement' });
        return out;
    }
    function closeRec(sy, r) { return sstore().close[S(sy.id) + '|' + S(r.internalId)] || null; }
    function evWords(sy, r) { return S(r.verifEvidence).trim() ? L().T(r.verifEvidence) : 'Not picked yet'; }

    // ---- what is still open ---------------------------------------------------------------------------------------------------
    function reqLeft(sy, list) { return list.filter(function (r) { return !closed(r); }).map(function (r) { return 'Which evidence closes ' + rid(r) + '?'; }); }
    function fcLeft(sy, gr) { return reqLeft(sy, reqsOf(sy, gr)); }
    function fnLeft(sy, key) { var out = []; fnGroups(sy, key).forEach(function (gr) { out = out.concat(fcLeft(sy, gr)); }); return out; }
    function frontLeft(sy) { return reqLeft(sy, reqMap(sy).other); }
    function openItems(sy, gr) {
        var out = [], l = L();
        if (!isQuant(gr)) return out;
        var v = verified(sy, gr);
        if (!v.page) out.push('No fault tree is generated for ' + gr.fcId + ' in the PSSA, so there is nothing to verify yet.');
        else if (!v.mirror) out.push('No verification tree for ' + gr.fcId + ' yet: build it in Verification trees from the PSSA tree.');
        else if (!v.filled) out.push('The verification tree for ' + gr.fcId + ' does not have a failure rate on every event yet.');
        else if (v.withinBudget === false) out.push('Worked out with the real rates, ' + gr.fcId + ' is above its budget: ' + l.sci(v.row.achieved) + ' per flight hour against ' + l.sci(v.row.allocated) + '.');
        if (v.withinObjective === false) out.push(gr.fcId + ' is above its safety objective with the real rates.');
        return out;
    }

    // ---- the report -------------------------------------------------------------------------------------------------------------
    function front(ctx) {
        var sy = sysNow(), l = L(); if (!sy || !l) return [P('Open a system to see its SSA.')];
        var lk = lockOf(sy), pf = (pc() && pc().pssaAuto && pc().pssaAuto.front && pc().pssaAuto.front[S(sy.id)]) || {}, b = [];
        b.push(H(1, 'Purpose and scope'));
        b.push(P('This System Safety Assessment (SSA) of the ' + l.T(sy.name || sy.id) + ' shows that the system as designed meets what its PSSA asked of it: each fault tree is worked out again with the real failure rates, each budget is checked against the design, and each requirement is closed with its evidence.'));
        b.push(P(pf.scope === 'part' ? 'It covers the same part of the system as the PSSA. ' + l.T(pf.scopeNote || '') : 'It covers every function and failure condition the PSSA covers.'));
        b.push(H(1, 'The PSSA it verifies'));
        var br = lk.opened && lk.opened.rev ? lk.opened.rev : null, cur = baseline('pssa', 'sys:' + S(sy.id));
        b.push(P('This SSA verifies the PSSA of the ' + l.T(sy.name || sy.id) + (cur.rev ? ' at Revision ' + cur.rev + (cur.date ? ' (' + cur.date + ')' : '') : '') + '. ' + (br && cur.rev && br !== cur.rev ? 'It opened at Revision ' + br + '; the numbers here follow the latest revision.' : 'The SSA opened once that PSSA was baselined.')));
        b.push(H(1, 'Method'));
        b.push(P('The assessment follows ARP4761A and ARP4754B, with the objectives of ' + l.acRef() + ' (' + l.regulation() + '). Each fault tree of the PSSA has a verification tree built from it, bottom-up, with the failure rates from the system FMEA and the equipment data; its result is checked against the budget the PSSA set and against the safety objective. Each requirement of the system is closed by the evidence named for it. A failure condition assessed qualitatively in the PSSA is shown by its requirements being closed.'));
        b.push(H(1, 'Budgets against the design'));
        var rows = [];
        apx(sy).forEach(function (k, i) { fnGroups(sy, k).forEach(function (gr) { if (!isQuant(gr)) return; var v = verified(sy, gr); rows.push({ 'Failure condition': fcName(gr), Appendix: letter(i), Budget: v.row && v.row.allocated != null ? l.sci(v.row.allocated) + ' per flight hour' : 'Not set', 'With the real rates': v.row && v.row.achieved != null ? l.sci(v.row.achieved) + ' per flight hour' : !v.mirror ? 'No verification tree yet' : 'Not worked out yet', Objective: v.row && v.row.objective != null ? l.sci(v.row.objective) + ' per flight hour' : 'Not set', Result: v.withinBudget == null ? 'Not shown yet' : v.withinBudget ? 'Within the budget' : 'Above the budget' }); }); });
        b.push(rows.length ? { k: 'table', name: 'budgets', title: 'Each budget of the PSSA against the design', rows: rows, lead: '{N} sets each budget the PSSA gave against the same tree worked out with the real failure rates.' } : P('No failure condition of this system is assessed quantitatively.'));
        var oth = reqMap(sy).other;
        if (oth.length) {
            b.push(H(1, 'Requirements of the system not tied to one of its failure conditions'));
            b.push({ k: 'table', name: 'other-req', title: 'Requirements of the ' + l.T(sy.name || sy.id) + ' not tied to one of its failure conditions', q: 'ssa.other', rows: oth.map(function (r) { return { ID: rid(r), Requirement: l.T(r.text), 'Driven from': root.SLReqTrace ? root.SLReqTrace.drivenText(r) : '', Method: l.T(r.verifMethod) || 'Not set', Evidence: evWords(sy, r), Status: S(r.verifStatus) || 'Pending' }; }), lead: '{N} lists the requirements placed on the system from elsewhere (the aircraft, imported, written by hand), each with its method, evidence and status.' });
        }
        b.push(H(1, 'The failure conditions'));
        var ap = apx(sy);
        b.push({ k: 'table', name: 'register', title: 'System failure conditions and where each is verified', rows: groups(sy).map(function (gr) { var i = ap.indexOf(P2().fnKey(sy, gr)), on = l.rank(gr.gov.severity) >= l.SEV_RANK.Minor; return { 'Failure condition': fcName(gr), Severity: S(gr.gov.severity), 'Verified in': on && i >= 0 ? 'Appendix ' + letter(i) + ', ' + routeWords(gr) : 'No appendix: no safety effect' }; }), lead: '{N} lists every failure condition in the system FHA and where it is verified.' });
        return b;
    }
    function after(ctx) {
        var sy = sysNow(), l = L(); if (!sy || !l) return [];
        var b = [H(1, 'What the appendices found')], rows = [];
        apx(sy).forEach(function (k, i) { fnGroups(sy, k).forEach(function (gr) { var q = isQuant(gr), v = q ? verified(sy, gr) : null, rq = reqsOf(sy, gr), op = rq.filter(function (r) { return !closed(r); }); rows.push({ Appendix: letter(i), 'Failure condition': fcName(gr), 'The design': !q ? 'Qualitative: shown by its requirements' : v.withinBudget == null ? 'Not shown yet' : v.withinBudget ? 'Within the budget with the real rates' : 'Above the budget with the real rates', Requirements: !rq.length ? 'None' : op.length ? 'Still open: ' + op.map(rid).join(', ') : 'Every one closed' }); }); });
        b.push(rows.length ? { k: 'table', name: 'found', title: 'What each appendix found', rows: rows, lead: '{N} sums up each failure condition in each appendix.' } : P('No failure condition of this system is rated Minor or above.'));
        b.push({ k: 'rauth', asHeading: 1 });
        return b;
    }
    function fcPart(sy, gr, ctx) {
        var l = L(), fc = gr.gov, f = fc.fcId, b = [], q = isQuant(gr), RT = root.SLReqTrace;
        b.push(H(2, fcName(gr) + ' (' + routeWords(gr) + ')'));
        b.push(H(3, 'What is being verified'));
        b.push(P(f + ' is ' + l.lc(l.T(fc.fcDesc)) + ' in the ' + l.T(sy.name || sy.id) + ', rated ' + S(fc.severity) + ' in the system FHA. ' + (q ? 'The PSSA assessed it quantitatively: this part works its tree out again with the real failure rates and checks the result against the budget, then closes its requirements.' : 'The PSSA assessed it qualitatively: it is shown by its requirements being closed.')));
        if (q) {
            var v = verified(sy, gr);
            b.push(H(3, 'The tree worked out again'));
            if (!v.page) b.push(P('No fault tree is generated for ' + f + ' in the PSSA yet, so there is no tree to work out again.'));
            else if (!v.mirror) b.push(P('No verification tree is built from the PSSA tree ' + l.T(v.page.name || v.page.id) + ' yet. Once it is, with the failure rates from the system FMEA and the equipment data, it appears here.'));
            else {
                var K = root.SLCmaClaims, figs = [];
                if (K && K.figure) { var res = safe(function () { return K.figure(v.mirror.id + ':' + v.mirror.root.id, { page: v.mirror, noMarks: true, C: ctx.C, dark: ctx.dark, metrics: l.metricsOf(v.mirror), anchor: 'ssa-' + f, nodeG: function (id, inner, title) { return root.SLCcaReport.nodeG('ssa', id, inner, title); } }); }, null); if (res && res.parts) { var many = res.parts.length > 1; figs = res.parts.map(function (pt) { return { k: 'fig', name: 'ver-' + f + (many ? '-' + pt.letter : ''), title: fcName(gr) + ', verification tree with the real failure rates' + (many ? ', part ' + pt.letter : ''), svg: pt.svg, w: pt.w, h: pt.h }; }); } }
                b.push(P('The verification tree ' + l.T(v.mirror.name || v.mirror.id) + ' is built from the PSSA tree ' + l.T(v.page.name || v.page.id) + ', bottom-up, with the failure rates from the system FMEA and the equipment data.' + (v.filled ? '' : ' Not every event carries a failure rate yet, so the result below is not final.')));
                figs.forEach(function (x) { b.push(x); });
            }
            b.push(H(3, 'The budget against the design'));
            var row = v.row;
            b.push({ k: 'table', name: 'bud-' + f, title: 'The budget for ' + f + ' against the design', rows: [
                { Quantity: 'Safety objective', Value: row && row.objective != null ? l.sci(row.objective) + ' per flight hour' : 'Not set' },
                { Quantity: 'Budget from the PSSA tree', Value: row && row.allocated != null ? l.sci(row.allocated) + ' per flight hour' : 'Not set' },
                { Quantity: 'With the real failure rates', Value: row && row.achieved != null ? l.sci(row.achieved) + ' per flight hour' : 'Not worked out yet' },
                { Quantity: 'Result', Value: v.withinBudget == null ? 'Not shown yet' : (v.withinBudget ? 'Within the budget' : 'Above the budget') + (v.withinObjective === false ? ', and above the objective' : '') }], lead: '{N} sets the budget the PSSA gave ' + f + ' against its tree worked out with the real rates.' });
        }
        b.push(H(3, 'Requirements and their verification'));
        var rq = reqsOf(sy, gr);
        b.push(rq.length ? { k: 'table', name: 'req-' + f, title: 'Requirements for ' + f + ', with their verification', q: 'fc.' + f + '.req', rows: rq.map(function (r) { return { ID: rid(r), Requirement: l.T(r.text), Method: l.T(r.verifMethod) || 'Not set', Evidence: evWords(sy, r), Status: S(r.verifStatus) || 'Pending' }; }), lead: '{N} lists every requirement of the system for ' + f + ', with how it is verified, the evidence that closes it and where it stands.' } : P('The system has no requirement for ' + f + ' in its register. Accept them in the PSSA first.'));
        b.push(H(3, 'Path to compliance'));
        b.push(rq.length ? { k: 'table', name: 'path-' + f, title: 'How ' + f + ' is shown', rows: rq.map(function (r) { var t0 = l.T(r.text); return { Requirement: rid(r) + ' ' + t0.slice(0, 90) + (t0.length > 90 ? '...' : ''), 'Closed by': S(r.verifEvidence).trim() ? l.T(r.verifEvidence) : 'Not picked yet', Closed: closed(r) ? 'Yes' : 'Not yet' }; }), lead: '{N} is the path to compliance: ' + f + ' is shown when every requirement is closed.' } : P('The path to compliance is built from the requirements, and there are none yet.'));
        return b;
    }
    var _secMemo = { gen: -2, map: {} };
    function fnSection(sy, key, ctx) {
        var l = L(), G = memoGen(), k = S(sy.id) + '|' + key + '|' + (ctx.dark ? 1 : 0) + (ctx.forExport ? 1 : 0);
        if (_secMemo.gen !== G || G === -1) _secMemo = { gen: G, map: {} };
        if (_secMemo.map[k]) return _secMemo.map[k];
        var fi = fnInfo(sy, key), grs = fnGroups(sy, key), b = [H(2, 'The function')];
        b.push(P(fnTitle(fi) + (fi.def ? ': ' + l.lc(fi.def).replace(/\.$/, '') + '.' : '.') + ' Its failure conditions with a safety effect, as the PSSA assessed them: ' + l.listJoin(grs.map(function (gr) { return fcName(gr) + ' (' + S(gr.gov.severity) + ', ' + routeWords(gr) + ')'; })) + '.'));
        grs.forEach(function (gr) { b = b.concat(fcPart(sy, gr, ctx)); });
        return (_secMemo.map[k] = b);
    }
    function sections(ctx) {
        var sy = sysNow(); if (!sy || !L() || !P2() || lockOf(sy).locked) return [];
        return apx(sy).map(function (key) {
            var fi = fnInfo(sy, key), o = { id: sid(key), title: fnTitle(fi), tabLabel: { id: key, name: fi.name }, edit: false }, cache = null;
            Object.defineProperty(o, 'blocks', { enumerable: true, get: function () { if (!cache) cache = fnSection(sy, key, ctx); return cache; } });
            return o;
        });
    }

    // ---- the left pane ----------------------------------------------------------------------------------------------------------
    function Q(q) { return root.SLAutopilotUI ? root.SLAutopilotUI.question(q, 'SLSsaAuto.ui.pick') : ''; }
    function card(qid, body, done) { return '<div class="paq-card' + (done ? ' done' : '') + '" data-paq="' + L().E(qid) + '">' + body + '</div>'; }
    function reqCard(sy, r) {
        var l = L(), ev = evidenceFor(sy, r), rec = closeRec(sy, r), qid = 'req.' + S(r.internalId);
        var picked = rec ? rec.ev : closed(r) ? 'rec0' : null;
        var opts = ev.map(function (e) { return { id: e.id, label: 'Closed by ' + l.lc(e.label), impact: 'The register records this as its evidence and the requirement as Passed, by the engineer.' }; });
        if (picked === 'rec0') opts.unshift({ id: 'rec0', label: 'Already closed: ' + (S(r.verifEvidence).trim() ? l.T(r.verifEvidence) : 'marked ' + S(r.verifStatus)), impact: 'Filled in from the register.' });
        opts.push({ id: 'open', label: 'Not closed yet', impact: 'The requirement stays open; the path to compliance shows it.' });
        return card(qid, Q({ id: qid, text: 'Which evidence closes ' + rid(r) + '?', why: l.E(l.T(r.text)) + (r.verifMethod ? '<br>Method: ' + l.E(l.T(r.verifMethod)) : ''), picked: picked, options: opts }), closed(r));
    }
    function lockCard(sy, lk) {
        var l = L(), E = l.E;
        return '<div class="paq-open" data-ssa-lock="1"><b>The SSA of the ' + E(l.T(sy.name || sy.id)) + ' opens once its PSSA is baselined</b><br>Baselined means the PSSA has an issued revision (Revision A or later) and every one of its outputs is accepted. Once open, the SSA stays open.<br>' + lockWhy(lk.pssa).map(E).join('<br>') + '</div><button type="button" class="paq-b on" onclick="SLSsaAuto.ui.toPssa()">Open the PSSA</button>';
    }
    function leftFront(sy) {
        var l = L(), E = l.E, h = '', lk = lockOf(sy);
        h += '<div class="paq-h">The front of the report: ' + E(l.T(sy.name || sy.id)) + '</div><div class="paq-x">The SSA is generated from the PSSA, the verification trees and the requirements. The only questions are which evidence closes each requirement, picked from what is already linked to it.</div>';
        h += card('ssa.lock', '<div class="slap-q">The PSSA this verifies</div><div class="paq-x">Open since the PSSA was baselined' + (lk.opened && lk.opened.rev ? ' at Revision ' + E(lk.opened.rev) : '') + '. A later PSSA revision does not lock it again; the numbers follow it.</div>', true);
        var oth = reqMap(sy).other;
        if (oth.length) { h += '<div class="paq-h">Requirements not tied to one failure condition</div>'; oth.forEach(function (r) { h += reqCard(sy, r); }); }
        return h;
    }
    function leftFn(sy, key) {
        var l = L(), E = l.E, J = l.J, fi = fnInfo(sy, key), h = '<div class="paq-h">' + E(fnTitle(fi)) + '</div>';
        fnGroups(sy, key).forEach(function (gr) {
            h += '<div class="paq-fcblock" data-ssa-fcblock="' + E(gr.fcId) + '"><div class="paq-h">' + E(fcName(gr)) + ' (' + E(gr.gov.severity) + ', ' + routeWords(gr) + ')</div>';
            var oi = openItems(sy, gr); if (oi.length) h += '<div class="paq-open" data-paq-openitems="1"><b>Open items</b><br>' + oi.map(E).join('<br>') + '</div>';
            var v = isQuant(gr) ? verified(sy, gr) : null;
            if (v && v.page) h += card('fc.' + gr.fcId + '.gen', '<div class="slap-q">The tree worked out again, the budget against the design</div><div class="paq-x">Generated from the verification tree. Nothing to answer.</div><button type="button" class="paq-b" onclick="SLSsaAuto.ui.openTree(' + J((v.mirror || v.page).id) + ')">' + (v.mirror ? 'Open the verification tree' : 'Open the PSSA tree') + '</button>', !!(v.mirror && v.filled));
            var rq = reqsOf(sy, gr);
            if (!rq.length) h += '<div class="paq-x">No requirement for ' + E(gr.fcId) + ' is in the register yet. Accept them in the PSSA.</div>';
            rq.forEach(function (r) { h += reqCard(sy, r); });
            h += '</div>';
        });
        return h;
    }
    function renderQuestions(R, tabv) {
        var l = L(); if (!l) return ''; l.style();
        var sy = sysNow(); if (!sy) return '<div class="paq-x">Open a system to see its SSA.</div>';
        var lk = lockOf(sy); if (lk.locked) return lockCard(sy, lk);
        var key = fnOfSid(R && R.partOf ? R.partOf(tabv) : null);
        if (key) return fnGroups(sy, key).length ? leftFn(sy, key) : '<div class="paq-x">This function has no failure condition with a safety effect now.</div>';
        return leftFront(sy);
    }

    // ---- answering ----------------------------------------------------------------------------------------------------------------
    function R0() { return root.SLCcaReport ? root.SLCcaReport.get('ssa') : null; }
    function done(qid) { var R = R0(); if (R) R.answered(qid); }
    function pick(qid, opt) {
        var sy = sysNow(), m = /^req\.(.+)$/.exec(S(qid)); if (!sy || !m) return;
        var r = arr(sy.req).filter(function (x) { return live(x) && S(x.internalId) === m[1]; })[0]; if (!r) return;
        var k = S(sy.id) + '|' + S(r.internalId), s0 = sstore();
        if (opt === 'rec0') return;
        if (opt === 'open') { delete s0.close[k]; if (r.verifStatus === 'Passed') r.verifStatus = 'In Progress'; }
        else {
            var e = evidenceFor(sy, r).filter(function (x) { return x.id === opt; })[0]; if (!e) return;
            var label = e.id === 'rec' ? S(r.verifEvidence) : e.label.charAt(0).toUpperCase() + e.label.slice(1);
            s0.close[k] = { ev: e.id, label: label, by: who(), at: now() };
            r.verifEvidence = label; r.verifStatus = 'Passed';
        }
        save(); done(qid);
    }
    function openTree(pid) { try { if (typeof root.switchFTAPage === 'function') root.switchFTAPage(pid); } catch (_) {} }
    function toPssa() { try { if (typeof root.switchWorkspaceTab === 'function') root.switchWorkspaceTab('pssa'); } catch (_) {} }

    // ---- outputs and acceptance ---------------------------------------------------------------------------------------------------
    function fpOf(o) { try { return JSON.stringify(o); } catch (_) { return String(Math.random()); } }
    function sysOfRep(rep) { return rep && /^sys:/.test(S(rep)) ? sysById(S(rep).slice(4)) : sysNow(); }
    function outputs(rep) {
        var sy = sysOfRep(rep); if (!sy || !P2()) return [];
        var grs = P2().candidates(sy);
        return [
            { id: 'trees', what: 'Each fault tree worked out again with the real failure rates', accept: 'Every quantitative failure condition has its verification tree, with a rate on every event, within its budget and its objective', role: 'System safety engineer', fp: function () { return fpOf(grs.filter(isQuant).map(function (gr) { var v = verified(sy, gr); return [gr.fcId, v.row && v.row.achieved, v.filled]; })); } },
            { id: 'req', what: 'Every requirement closed with its evidence', accept: 'Each requirement of the system names the evidence that closes it and is marked Passed', role: 'Chief safety engineer', fp: function () { return fpOf(arr(sy.req).filter(live).map(function (r) { return [r.internalId, r.verifStatus, r.verifEvidence]; })); } },
            { id: 'concl', what: 'The conclusions', accept: 'Each appendix and the report as a whole concluded, by the engineer or from an accepted AI draft', role: 'Chief safety engineer', fp: function () { return fpOf((pc() && pc().ccaReports && pc().ccaReports.ssa && pc().ccaReports.ssa.authored) || {}); } }
        ];
    }

    // ---- the frame ------------------------------------------------------------------------------------------------------------------
    function lockPage(R, sy, lk) {
        var v = typeof document !== 'undefined' ? document.getElementById('ws-view-ssa') : null; if (!v) return;
        var h = document.getElementById('ccr-host-ssa'); if (h) h.style.display = lk.locked ? 'none' : '';
        var c = document.getElementById('ssa-lock-page');
        if (!lk.locked) { if (c) c.remove(); return; }
        if (!c) { c = document.createElement('div'); c.id = 'ssa-lock-page'; v.appendChild(c); }
        L().style();
        c.innerHTML = '<div class="header-with-export"><h3>SSA: System Safety Assessment</h3></div>' + lockCard(sy, lk);
    }
    function define() {
        var CR = root.SLCcaReport; if (!CR || !L() || !P2() || typeof document === 'undefined' || !document.getElementById('ws-view-ssa')) return null;
        var R = CR.define({
            key: 'ssa', viewId: 'ws-view-ssa', leftId: 'ssa-auto-host', title: 'System Safety Assessment', code: 'SSA',
            lead: 'One report per system, verifying its PSSA: the front says what it verifies and how the budgets stand against the design; each function has its own appendix, the same as the PSSA\'s. The only questions are which evidence closes each requirement.',
            appendices: true,
            tabs: { allLabel: false, parts: true, pickLabel: 'Part', frontLabel: 'Front of the report', noun: 'function', partLabel: function (s) { var sy = sysNow(), k = fnOfSid(s); return sy && k ? fnTitle(fnInfo(sy, k)) : S(s); } },
            reports: function () { var sy = sysNow(); if (!sy) return []; var code = root.SLReqTrace ? root.SLReqTrace.sysCode(sy) : S(sy.id); return [{ id: 'sys:' + S(sy.id), code: code, label: L().T(sy.name || sy.id), title: L().T(sy.name || sy.id), sections: lockOf(sy).locked ? [] : apx(sy).map(sid) }]; },
            front: front, after: after, sections: sections, renderQuestions: renderQuestions, outputs: outputs,
            authored: [{ id: 'conclusion', title: 'Conclusion', purpose: 'Whether the design meets what the PSSA asked of each failure condition of this function, on what evidence, and what is still open.' }],
            reportAuthored: [{ id: 'conclusion', title: 'Conclusion', purpose: 'Whether the system as designed meets what its PSSA asked of it, on what evidence, and what is still open.' }],
            aiType: 'SSA',
            aiReady: function (s) { var sy = sysNow(); if (!sy) return { ready: false, left: ['Open a system'] }; var k = fnOfSid(s); if (k) { var l0 = fnLeft(sy, k); return { ready: !l0.length, left: l0 }; } var l2 = frontLeft(sy).concat(apx(sy).filter(function (x) { return fnLeft(sy, x).length; }).map(function (x) { return 'The questions of the appendix for ' + fnTitle(fnInfo(sy, x)); })); return { ready: !l2.length, left: l2 }; },
            io: { does: 'Shows that the system as designed meets what its PSSA asked of it: each fault tree worked out again with the real failure rates, each budget against the design, each requirement closed with its evidence.',
                inputs: [{ id: 'pssa', what: 'The baselined PSSA: its trees, budgets and requirements', from: 'PSSA', tab: 'sys-workspace' }, { id: 'ver', what: 'The verification trees with the real failure rates', from: 'Verification trees', tab: 'fta' }, { id: 'fmea', what: 'The system FMEA', from: 'FMEA', tab: 'sys-workspace' }],
                outputs: [{ id: 'closure', what: 'Each requirement closed with its evidence', to: 'System requirements', tab: 'sys-workspace' }, { id: 'measured', what: 'The measured result of each tree', to: 'ASA', tab: 'asa' }] }
        });
        if (R && !R._ssaLock) {
            var r0 = R.render;
            R.render = function () { var sy = sysNow(); var lk = sy && L() ? lockOf(sy) : { locked: false }; if (sy && lk.locked) { lockPage(R, sy, lk); return; } if (sy) lockPage(R, sy, lk); return r0.apply(this, arguments); };
            R._ssaLock = true;
        }
        return R;
    }
    (function boot(tries) { if (define()) return; if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { boot(tries - 1); }, 250); })(80);

    var api = { VERSION: VERSION, baseline: baseline, lockOf: lockOf, sysNow: sysNow, verified: verified, reqsOf: reqsOf, reqMap: reqMap, evidenceFor: evidenceFor, closed: closed, fcLeft: fcLeft, fnLeft: fnLeft, frontLeft: frontLeft, openItems: openItems, fnSection: fnSection, front: front, outputs: outputs, store: sstore, mirrorOf: mirrorOf,
        ui: { pick: pick, openTree: openTree, toPssa: toPssa } };
    try { root.SLSsaAuto = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

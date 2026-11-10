// asa_autopilot.js (SLAsaAuto v1.1, 11 Nov 2026): the ASA Autopilot. One Aircraft Safety Assessment, on the ASA page: the front of
// the report (what it closes, the baselines it rests on, the method, how every aircraft failure condition is closed) and one
// appendix per aircraft function, the same functions as the PASA's, each holding every failure condition of that function rated
// Minor or above.
//
// Waqas, 10 Nov 2026: "ASA stays locked till all SSAs and PASA has been baselined". Baselined, as for the SSA (ssa_autopilot.js):
//   an issued revision with every output accepted. "All SSAs" (used and stated here): the SSA of every system with a failure
//   condition rated Minor or above; a system with none has no SSA to wait for. Once the ASA opens it stays open.
//   What the ASA holds (the brief): every aircraft failure condition sorted into closed by an SSA, needs aircraft-level work, or
//   open (asa_triage.js); the trees that span several systems worked out again with the systems' measured numbers
//   (asaMeasuredRun); the common causes closed (the CMA, PRA and ZSA); assurance; a compliance summary accepted by role (the
//   frame's outputs and acceptance).
//   Questions (the proposal, used and stated): which evidence closes each aircraft requirement, picked from what is already linked
//   to it, and the acceptance of each failure condition that needs aircraft-level work. Everything else is generated.
// Same frame as the other Autopilots (cca_report.js 2.1), same AI drafting and live comments. The old ASA checkpoint list is hidden.
//
// Kept here: projectConfig.asaAuto = { opened: { at, pasa, ssa: { <sysId>: rev } }, acl: { <fcId>: { ok, by, at } },
//   close: { <reqInternalId>: { ev, label, by, at } } }
// Written where it lives: each aircraft requirement's verifEvidence and verifStatus. window.SLAsaAuto.
(function (root) {
    'use strict';
    var VERSION = '1.1';   // 1.1 11 Nov 2026: a PASA tree with nothing built under its top is not worked out again (it has not been created yet)
    function g(n) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(n); if (v !== undefined) return v; } } catch (_) {} try { return root[n]; } catch (_) { return undefined; } }
    function L() { return root.SLPasaAuto && root.SLPasaAuto.lib; }
    function A() { return root.SLPasaAuto || null; }
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

    function astore() {
        var p = pc(); if (!p) return { opened: null, acl: {}, close: {} };
        if (!p.asaAuto || typeof p.asaAuto !== 'object') p.asaAuto = {};
        var s0 = p.asaAuto; if (!s0.acl || typeof s0.acl !== 'object') s0.acl = {}; if (!s0.close || typeof s0.close !== 'object') s0.close = {};
        return s0;
    }
    // ---- the lock: the PASA and the SSA of every system with a failure condition rated Minor or above ---------------------
    function systems() { return arr(g('systemsData')).filter(function (s) { return s && s.id != null; }); }
    function needsSsa(sy) { var P2 = root.SLPssaAuto; return !!(P2 && P2.candidates(sy).length); }
    function lockOf() {
        var s0 = astore(), B = root.SLSsaAuto;
        if (s0.opened) return { locked: false, opened: s0.opened };
        if (!B) return { locked: true, pasa: { ok: false, open: [], issued: false }, ssa: [] };
        var pa = B.baseline('pasa', 'aircraft');
        var ss = systems().filter(needsSsa).map(function (sy) { return { sy: sy, b: B.baseline('ssa', 'sys:' + S(sy.id)) }; });
        if (pa.ok && ss.every(function (x) { return x.b.ok; })) {
            var m = {}; ss.forEach(function (x) { m[S(x.sy.id)] = x.b.rev; });
            s0.opened = { at: now(), pasa: pa.rev, ssa: m }; try { if (root.SLAutopilotUI) root.SLAutopilotUI.save(); } catch (_) {}
            return { locked: false, opened: s0.opened };
        }
        return { locked: true, pasa: pa, ssa: ss };
    }
    function lockWhy(lk) {
        var l = L(), out = [];
        if (!lk.pasa.ok) out.push(!lk.pasa.issued ? 'The PASA has not been issued yet.' : 'Outputs of the PASA not accepted yet: ' + l.listJoin(lk.pasa.open.map(l.lc)) + '.');
        arr(lk.ssa).filter(function (x) { return !x.b.ok; }).forEach(function (x) { out.push('The SSA of the ' + l.T(x.sy.name || x.sy.id) + ': ' + (!x.b.issued ? 'not issued yet' : 'outputs not accepted yet (' + l.listJoin(x.b.open.map(l.lc)) + ')') + '.'); });
        return out;
    }

    // ---- the aircraft functions and failure conditions (the PASA's) -----------------------------------------------------
    function apx() { return A() ? A().appendices() : []; }
    function fnGroups(id) { return A() ? A().fnGroups(id) : []; }
    function fnTitle(id) { var f = A().fnOf(id); return f ? A().fnTitle(f) : S(id); }
    function fcName(gr) { return gr ? gr.fcId + ' ' + L().T(gr.gov.fcDesc || '') : ''; }
    function isQuant(gr) { return A() ? A().isQuant(gr) : true; }
    function routeWords(gr) { return isQuant(gr) ? 'quantitative' : 'qualitative'; }
    function sid(id) { return 'fn:' + id; }
    function fnOfSid(s) { return S(s).indexOf('fn:') === 0 ? S(s).slice(3) : null; }
    function letter(i) { var R0 = root.SLCcaReport && root.SLCcaReport.get('asa'); return R0 && R0.appxLetter ? R0.appxLetter(i) : String.fromCharCode(65 + i); }
    var _tri = { gen: -2, rows: null };
    function triage() { var G = memoGen(); if (_tri.gen !== G || G === -1 || !_tri.rows) _tri = { gen: G, rows: typeof root.asaTriage === 'function' ? (safe(function () { return root.asaTriage(); }, []) || []) : [] }; return _tri.rows; }
    function triOf(gr) { return triage().filter(function (t) { return S(t.fcId) === gr.fcId; })[0] || null; }
    var CLS = { 'closed-by-ssa': 'Closed by an SSA', 'aircraft-level': 'Needs aircraft-level work', open: 'Open' };
    function clsWhy(t) {
        var l = L(); if (!t) return 'Not sorted yet.';
        if (t.cls === 'aircraft-level') return 'Several systems feed it (' + l.listJoin(t.systems) + '): their combined effect is shown at the aircraft level.';
        if (t.cls === 'closed-by-ssa') return 'One system feeds it, and that system\'s verification tree meets the objective.';
        var lr = safe(function () { return root.budgetLedgerRows().filter(function (r) { return r.scope === 'aircraft' && S(r.fcId) === S(t.fcId); }); }, []) || [];
        if (lr.some(function (r) { return r.status === 'EXCEEDS-objective'; })) return 'One system feeds it, but with the real rates it is above the objective.';
        if (lr.some(function (r) { return r.status === 'unverified'; })) return 'One system feeds it; its tree has no verification tree with real rates yet.';
        return 'No tree with real rates closes it yet.';
    }
    function aclOk(gr) { var t = triOf(gr), a = astore().acl[gr.fcId]; return !t || t.cls !== 'aircraft-level' || !!(a && a.ok); }
    // the trees worked out again with the systems' measured numbers: the PASA tree and any MF&MS tree for the failure condition
    var _run = { gen: -2, map: {} };
    function runs(gr) {
        var G = memoGen(); if (_run.gen !== G || G === -1) _run = { gen: G, map: {} };
        if (_run.map[gr.fcId]) return _run.map[gr.fcId];
        var ids = [], t = triOf(gr), page = A().treeOf(gr);
        if (page && (!A().built || A().built(gr))) ids.push(S(page.id));
        if (t) arr(t.mfms).forEach(function (m) { if (ids.indexOf(S(m.id)) < 0) ids.push(S(m.id)); });
        var obj = L().target(gr.gov.severity).prob;
        var out = ids.map(function (id) { var r = typeof root.asaMeasuredRun === 'function' ? safe(function () { return root.asaMeasuredRun(id); }, null) : null; return r ? Object.assign({ objective: obj, pass: r.measuredPerFH != null && obj != null ? r.measuredPerFH <= obj * (1 + ((root.SLTopBasis && root.SLTopBasis.TOL) || 1e-6)) : null }, r) : null; }).filter(function (x) { return x && x.totalLeaves > 0; });   // a tree with no events of its own (transfers only) has nothing to put a measured number in
        return (_run.map[gr.fcId] = out);
    }
    // ---- the aircraft requirements ---------------------------------------------------------------------------------------
    function live(r) { return r && !r.deleted; }
    function closed(r) { return ['Passed', 'N/A'].indexOf(S(r.verifStatus)) >= 0; }
    function rid(r) { return r.id ? S(r.id) : 'REQ-' + S(r.internalId); }
    var _rq = { gen: -2, map: null };
    function reqMap() {
        var G = memoGen(); if (_rq.gen === G && G !== -1 && _rq.map) return _rq.map;
        var RT = root.SLReqTrace, m = { byFc: {}, other: [] };
        arr(g('acReqData')).filter(live).forEach(function (r) {
            var d = RT ? safe(function () { return RT.drivenFrom(r); }, []) : [], hit = null;
            d.some(function (e) { if (e.what === 'Aircraft failure condition' && e.id) { hit = e.id; return true; } return false; });
            if (!hit && r.traceId && /^FC/.test(S(r.traceId))) hit = S(r.traceId);
            if (hit) (m.byFc[hit] = m.byFc[hit] || []).push(r); else m.other.push(r);
        });
        _rq = { gen: G, map: m }; return m;
    }
    function reqsOf(gr) { return reqMap().byFc[gr.fcId] || []; }
    function evidenceFor(r) {
        var l = L(), out = [], RT = root.SLReqTrace, t = RT ? RT.typeOf(r) : null, B = root.SLSsaAuto, rec = astore().close[S(r.internalId)];
        if (S(r.verifEvidence).trim() && !(rec && rec.label === S(r.verifEvidence))) out.push({ id: 'rec', label: 'The evidence already recorded: ' + l.T(r.verifEvidence) });
        var d = RT ? safe(function () { return RT.drivenFrom(r); }, []) : [], fcId = (d.filter(function (e) { return e.what === 'Aircraft failure condition'; })[0] || {}).id || S(r.traceId);
        var gr = A() ? A().groupOf(fcId) : null;
        if (gr) {
            runs(gr).forEach(function (x) { out.push({ id: 'run:' + x.pageId, label: 'The tree ' + l.T(x.pageName) + ' worked out again with the systems\' measured numbers' }); });
            var page = A().treeOf(gr), mir = page && B ? B.mirrorOf(page) : null;
            if (mir) out.push({ id: 'ver:' + mir.id, label: 'The verification tree ' + l.T(mir.name || mir.id) });
            A().feeders(gr).forEach(function (sysId) { var sy = l.sysById(sysId), b = B ? B.baseline('ssa', 'sys:' + S(sysId)) : null; if (sy) out.push({ id: 'ssa:' + sysId, label: 'The SSA of the ' + l.T(sy.name || sy.id) + (b && b.rev ? ', Revision ' + b.rev : '') }); });
            A().critGates(gr).forEach(function (x) { l.cmas().filter(function (c) { return arr(c.linkedGateIds).map(S).indexOf(S(x.key)) >= 0; }).forEach(function (c) { if (!out.some(function (o) { return o.id === 'cma:' + c.cmaId; })) out.push({ id: 'cma:' + c.cmaId, label: 'The common mode analysis ' + S(c.cmaId) + (c.subject ? ' ' + l.T(c.subject) : '') }); }); });
        }
        if (t === 'inst') out.push({ id: 'zsa', label: 'The zonal safety analysis and the particular risk assessment' });
        if (t === 'crew') out.push({ id: 'hf', label: 'The human factors evaluation and the crew procedures' });
        if (t === 'dal') out.push({ id: 'dal', label: 'The development assurance records of the systems that carry it' });
        if (!out.length) out.push({ id: 'test', label: 'A test or analysis report for this requirement' });
        return out;
    }
    function evWords(r) { return S(r.verifEvidence).trim() ? L().T(r.verifEvidence) : 'Not picked yet'; }

    // ---- what is still open ---------------------------------------------------------------------------------------------
    function fcLeft(gr) {
        var out = [], t = triOf(gr);
        if (t && t.cls === 'aircraft-level' && !aclOk(gr)) out.push('Is the aircraft-level work for ' + gr.fcId + ' done?');
        reqsOf(gr).filter(function (r) { return !closed(r); }).forEach(function (r) { out.push('Which evidence closes ' + rid(r) + '?'); });
        return out;
    }
    function fnLeft(id) { var out = []; fnGroups(id).forEach(function (gr) { out = out.concat(fcLeft(gr)); }); return out; }
    function frontLeft() { return reqMap().other.filter(function (r) { return !closed(r); }).map(function (r) { return 'Which evidence closes ' + rid(r) + '?'; }); }
    function openItems(gr) {
        var l = L(), out = [], t = triOf(gr);
        if (t && t.cls === 'open') out.push(gr.fcId + ' is open: ' + l.lc(clsWhy(t)));
        runs(gr).forEach(function (x) { if (x.substituted < x.totalLeaves) out.push('In ' + l.T(x.pageName) + ', some events have no measured number from an SSA yet and keep their budget.'); if (x.pass === false) out.push('With the measured numbers, ' + l.T(x.pageName) + ' is above the objective of ' + gr.fcId + '.'); });
        A().critGates(gr).forEach(function (x) { if (!l.cmas().some(function (c) { return arr(c.linkedGateIds).map(S).indexOf(S(x.key)) >= 0; })) out.push('Gate ' + x.displayId + (x.name ? ' ' + l.T(x.name) : '') + ' carries the budget and has no common mode analysis.'); });
        return out;
    }

    // ---- the report -------------------------------------------------------------------------------------------------------
    function front(ctx) {
        var l = L(); if (!l || !A()) return [P('The ASA is loading.')];
        var lk = lockOf(), B = root.SLSsaAuto, b = [];
        b.push(H(1, 'Purpose and scope'));
        b.push(P('This Aircraft Safety Assessment (ASA) shows that the aircraft as designed meets the safety objective of every failure condition its PASA assessed: each is closed by the SSA of the system that carries it, or by work at the aircraft level where several systems combine, with the common causes closed and the requirements verified.'));
        b.push(H(1, 'The baselines it rests on'));
        var pa = B ? B.baseline('pasa', 'aircraft') : null;
        b.push(P('It rests on the PASA' + (pa && pa.rev ? ' at Revision ' + pa.rev : '') + ' and on the SSA of each system, as listed below. ' + (lk.opened ? 'The ASA opened once all of them were baselined; the numbers here follow their latest revisions.' : '')));
        b.push({ k: 'table', name: 'baselines', title: 'The SSA of each system', rows: systems().filter(needsSsa).map(function (sy) { var x = B ? B.baseline('ssa', 'sys:' + S(sy.id)) : {}; return { System: l.T(sy.name || sy.id), SSA: x.rev ? 'Revision ' + x.rev + (x.date ? ' (' + x.date + ')' : '') : 'Not issued' }; }), lead: '{N} lists the SSA of each system the ASA rests on.' });
        b.push(H(1, 'Method'));
        b.push(P('The assessment follows ARP4761A and ARP4754B, with the objectives of ' + l.acRef() + ' (' + l.regulation() + '). Each aircraft failure condition rated Minor or above is sorted: closed by the SSA of the one system that feeds it, needing aircraft-level work where several systems feed it, or open. Where several systems feed it, its trees are worked out again with each system\'s measured number from its SSA in place of the budget. The common causes are closed by the common mode analyses, the particular risk assessment and the zonal safety analysis. Each aircraft requirement is closed by the evidence named for it.'));
        b.push(H(1, 'How each failure condition is closed'));
        var ap = apx();
        b.push({ k: 'table', name: 'triage', title: 'Every aircraft failure condition and how it is closed', rows: (A().candidates() || []).map(function (gr) { var t = triOf(gr), i = ap.indexOf(S(gr.gov.subId)); return { 'Failure condition': fcName(gr), Severity: S(gr.gov.severity), Appendix: i >= 0 ? letter(i) : '', 'How it is closed': t ? CLS[t.cls] || t.cls : 'Not sorted yet', Why: clsWhy(t) }; }), lead: '{N} sorts every aircraft failure condition rated Minor or above.' });
        var oth = reqMap().other;
        if (oth.length) b.push({ k: 'table', name: 'other-req', title: 'Aircraft requirements not tied to one failure condition', q: 'asa.other', rows: oth.map(function (r) { return { ID: rid(r), Requirement: l.T(r.text), Method: l.T(r.verifMethod) || 'Not set', Evidence: evWords(r), Status: S(r.verifStatus) || 'Pending' }; }), lead: '{N} lists the aircraft requirements not tied to one failure condition, with their verification.' });
        return b;
    }
    function after(ctx) {
        var l = L(); if (!l || !A()) return [];
        var b = [H(1, 'What the appendices found')], rows = [];
        apx().forEach(function (id, i) { fnGroups(id).forEach(function (gr) { var t = triOf(gr), op = reqsOf(gr).filter(function (r) { return !closed(r); }); rows.push({ Appendix: letter(i), 'Failure condition': fcName(gr), Closed: t ? (t.cls === 'aircraft-level' ? (aclOk(gr) ? 'At the aircraft level, accepted' : 'Aircraft-level work not accepted yet') : CLS[t.cls]) : 'Not sorted yet', Requirements: !reqsOf(gr).length ? 'None' : op.length ? 'Still open: ' + op.map(rid).join(', ') : 'Every one closed' }); }); });
        b.push(rows.length ? { k: 'table', name: 'found', title: 'What each appendix found', rows: rows, lead: '{N} sums up each failure condition in each appendix.' } : P('No aircraft failure condition is rated Minor or above.'));
        b.push({ k: 'rauth', asHeading: 1 });
        return b;
    }
    function fcPart(gr, ctx) {
        var l = L(), f = gr.fcId, b = [], t = triOf(gr), B = root.SLSsaAuto;
        b.push(H(2, fcName(gr) + ' (' + routeWords(gr) + ')'));
        b.push(H(3, 'How it is closed'));
        b.push(P(f + ' is ' + l.lc(l.T(gr.gov.fcDesc)) + ', rated ' + S(gr.gov.severity) + '. ' + (t ? CLS[t.cls] + ': ' + l.lc(clsWhy(t)) : 'It is not sorted yet.') + (t && t.cls === 'aircraft-level' ? ' ' + (aclOk(gr) ? 'The aircraft-level work is accepted (' + S((astore().acl[f] || {}).by || '') + ').' : 'The aircraft-level work is not accepted yet.') : ''), 'fc.' + f + '.acl'));
        var fs = A().feeders(gr);
        if (fs.length) b.push({ k: 'table', name: 'sys-' + f, title: 'The systems that feed ' + f + ' and their SSA', rows: fs.map(function (id) { var x = B ? B.baseline('ssa', 'sys:' + id) : {}; return { System: l.sysName(id), SSA: x.rev ? 'Revision ' + x.rev : 'Not issued' }; }), lead: '{N} lists the systems that feed ' + f + ' and the SSA each closes its part with.' });
        if (isQuant(gr)) {
            b.push(H(3, 'The trees with the measured numbers'));
            var rs = runs(gr);
            b.push(A().built && !A().built(gr) && !rs.length ? P('The fault tree for ' + f + ' has not been created yet in the PASA, so there is nothing to work out again.') : rs.length ? { k: 'table', name: 'run-' + f, title: f + ' worked out again with the systems\' measured numbers', rows: rs.map(function (x) { return { Tree: l.T(x.pageName), Budget: x.budgetPerFH ? l.sci(x.budgetPerFH) + ' per flight hour' : 'Not worked out (no rates on its own events)', Measured: x.measuredPerFH != null ? l.sci(x.measuredPerFH) + ' per flight hour' : 'Not worked out', Objective: x.objective != null ? l.sci(x.objective) + ' per flight hour' : 'Not set', 'Measured numbers used': x.substituted >= x.totalLeaves ? 'Every event' : x.substituted ? 'Some events (the rest keep their budget)' : 'None yet', Result: x.pass == null ? 'Not shown yet' : x.pass ? 'Within the objective' : 'Above the objective' }; }), lead: '{N} puts each system\'s measured number from its SSA in place of its budget and works the tree out again.' } : P('No tree for ' + f + ' can be worked out again yet.'));
        }
        b.push(H(3, 'Common causes'));
        var cg = A().critGates(gr);
        b.push(P(cg.length ? cg.map(function (x) { var rv = l.cmas().filter(function (c) { return arr(c.linkedGateIds).map(S).indexOf(S(x.key)) >= 0; }); return 'Gate ' + x.displayId + (x.name ? ' ' + l.T(x.name) : '') + ' carries the budget: ' + (rv.length ? 'its independence is shown in ' + rv.map(function (c) { return S(c.cmaId) + (c.subject ? ' ' + l.T(c.subject) : ''); }).join(', ') : 'no common mode analysis shows its independence yet') + '.'; }).join(' ') : 'No gate of its tree carries the budget, so no independence claim rests on a common mode analysis.'));
        b.push(P('The particular risks and the zonal hazards that could defeat these independences are closed in the particular risk assessment and the zonal safety analysis.'));
        b.push(H(3, 'Assurance'));
        var dal = l.target(gr.gov.severity).dal;
        b.push(P(dal ? 'The functions that feed ' + f + ' carry FDAL ' + dal + ' from its ' + S(gr.gov.severity) + ' severity; each system\'s SSA shows the item levels its tree allocated.' : 'No development assurance level is set for ' + f + '.'));
        b.push(H(3, 'Aircraft requirements and their verification'));
        var rq = reqsOf(gr);
        b.push(rq.length ? { k: 'table', name: 'req-' + f, title: 'Aircraft requirements for ' + f + ', with their verification', q: 'fc.' + f + '.req', rows: rq.map(function (r) { return { ID: rid(r), Requirement: l.T(r.text), Method: l.T(r.verifMethod) || 'Not set', Evidence: evWords(r), Status: S(r.verifStatus) || 'Pending' }; }), lead: '{N} lists every aircraft requirement for ' + f + ', with how it is verified and the evidence that closes it.' } : P('No aircraft requirement for ' + f + ' is in the register.'));
        b.push(H(3, 'Path to compliance'));
        b.push(rq.length ? { k: 'table', name: 'path-' + f, title: 'How ' + f + ' is shown', rows: rq.map(function (r) { var t0 = l.T(r.text); return { Requirement: rid(r) + ' ' + t0.slice(0, 90) + (t0.length > 90 ? '...' : ''), 'Closed by': evWords(r), Closed: closed(r) ? 'Yes' : 'Not yet' }; }), lead: '{N} is the path to compliance: ' + f + ' is shown when it is closed as above and every requirement is closed.' } : P('The path to compliance is built from the requirements, and there are none yet.'));
        return b;
    }
    var _secMemo = { gen: -2, map: {} };
    function fnSection(id, ctx) {
        var l = L(), G = memoGen(), k = id + '|' + (ctx.dark ? 1 : 0) + (ctx.forExport ? 1 : 0);
        if (_secMemo.gen !== G || G === -1) _secMemo = { gen: G, map: {} };
        if (_secMemo.map[k]) return _secMemo.map[k];
        var grs = fnGroups(id), b = [H(2, 'The function')];
        b.push(P(fnTitle(id) + '. Its failure conditions with a safety effect, as the PASA assessed them: ' + l.listJoin(grs.map(function (gr) { return fcName(gr) + ' (' + S(gr.gov.severity) + ', ' + routeWords(gr) + ')'; })) + '.'));
        grs.forEach(function (gr) { b = b.concat(fcPart(gr, ctx)); });
        return (_secMemo.map[k] = b);
    }
    function sections(ctx) {
        if (!L() || !A() || lockOf().locked) return [];
        return apx().map(function (id) {
            var f = A().fnOf(id), o = { id: sid(id), title: fnTitle(id), tabLabel: { id: id, name: f ? f.name : '' }, edit: false }, cache = null;
            Object.defineProperty(o, 'blocks', { enumerable: true, get: function () { if (!cache) cache = fnSection(id, ctx); return cache; } });
            return o;
        });
    }

    // ---- the left pane ------------------------------------------------------------------------------------------------------
    function Q(q) { return root.SLAutopilotUI ? root.SLAutopilotUI.question(q, 'SLAsaAuto.ui.pick') : ''; }
    function card(qid, body, done) { return '<div class="paq-card' + (done ? ' done' : '') + '" data-paq="' + L().E(qid) + '">' + body + '</div>'; }
    function reqCard(r) {
        var l = L(), rec = astore().close[S(r.internalId)], qid = 'req.' + S(r.internalId), picked = rec ? rec.ev : closed(r) ? 'rec0' : null;
        var opts = evidenceFor(r).map(function (e) { return { id: e.id, label: 'Closed by ' + l.lc(e.label), impact: 'The register records this as its evidence and the requirement as Passed, by the engineer.' }; });
        if (picked === 'rec0') opts.unshift({ id: 'rec0', label: 'Already closed: ' + (S(r.verifEvidence).trim() ? l.T(r.verifEvidence) : 'marked ' + S(r.verifStatus)), impact: 'Filled in from the register.' });
        opts.push({ id: 'open', label: 'Not closed yet', impact: 'The requirement stays open; the path to compliance shows it.' });
        return card(qid, Q({ id: qid, text: 'Which evidence closes ' + rid(r) + '?', why: l.E(l.T(r.text)), picked: picked, options: opts }), closed(r));
    }
    function lockCard(lk) {
        var E = L().E;
        return '<div class="paq-open" data-asa-lock="1"><b>The ASA opens once the PASA and the SSA of every system are baselined</b><br>Baselined means the report has an issued revision (Revision A or later) and every one of its outputs is accepted. A system with no failure condition rated Minor or above has no SSA to wait for. Once open, the ASA stays open.<br>' + lockWhy(lk).map(E).join('<br>') + '</div>';
    }
    function leftFront() {
        var l = L(), E = l.E, h = '<div class="paq-h">The front of the report</div><div class="paq-x">The ASA is generated from the PASA, the SSAs, the common cause analyses and the requirements. The questions are which evidence closes each aircraft requirement, and whether the aircraft-level work for each failure condition that needs it is done.</div>';
        var oth = reqMap().other; if (oth.length) { h += '<div class="paq-h">Aircraft requirements not tied to one failure condition</div>'; oth.forEach(function (r) { h += reqCard(r); }); }
        return h;
    }
    function leftFn(id) {
        var l = L(), E = l.E, h = '<div class="paq-h">' + E(fnTitle(id)) + '</div>';
        fnGroups(id).forEach(function (gr) {
            var t = triOf(gr), f = gr.fcId;
            h += '<div class="paq-fcblock" data-asa-fcblock="' + E(f) + '"><div class="paq-h">' + E(fcName(gr)) + ' (' + E(gr.gov.severity) + ', ' + (t ? E(CLS[t.cls] || t.cls).toLowerCase() : 'not sorted') + ')</div>';
            var oi = openItems(gr); if (oi.length) h += '<div class="paq-open" data-paq-openitems="1"><b>Open items</b><br>' + oi.map(E).join('<br>') + '</div>';
            if (t && t.cls === 'aircraft-level') { var a = astore().acl[f]; h += card('fc.' + f + '.acl', Q({ id: 'fc.' + f + '.acl', text: 'Is the aircraft-level work for ' + f + ' done?', why: E('Several systems feed it (' + l.listJoin(t.systems) + '). The tree worked out again with their measured numbers and the common mode analyses of its gates are on the right.'), picked: a ? (a.ok ? 'yes' : 'no') : null, options: [{ id: 'yes', label: 'Yes: the measured numbers and the common cause reviews show it', impact: 'The appendix records it as closed at the aircraft level, accepted by the engineer.' }, { id: 'no', label: 'Not yet', impact: 'It stays open in the report.' }] }), !!(a && a.ok)); }
            reqsOf(gr).forEach(function (r) { h += reqCard(r); });
            h += '</div>';
        });
        return h;
    }
    function renderQuestions(R, tabv) {
        var l = L(); if (!l || !A()) return ''; l.style();
        var lk = lockOf(); if (lk.locked) return lockCard(lk);
        var id = fnOfSid(R && R.partOf ? R.partOf(tabv) : null);
        if (id) return fnGroups(id).length ? leftFn(id) : '<div class="paq-x">This function has no failure condition with a safety effect now.</div>';
        return leftFront();
    }

    // ---- answering ----------------------------------------------------------------------------------------------------------
    function R0() { return root.SLCcaReport ? root.SLCcaReport.get('asa') : null; }
    function done(qid) { var R = R0(); if (R) R.answered(qid); }
    function pick(qid, opt) {
        var s0 = astore(), m;
        if ((m = /^fc\.(.+)\.acl$/.exec(S(qid)))) { s0.acl[m[1]] = { ok: opt === 'yes', by: who(), at: now() }; save(); return done(qid); }
        if (!(m = /^req\.(.+)$/.exec(S(qid)))) return;
        var r = arr(g('acReqData')).filter(function (x) { return live(x) && S(x.internalId) === m[1]; })[0]; if (!r || opt === 'rec0') return;
        if (opt === 'open') { delete s0.close[S(r.internalId)]; if (r.verifStatus === 'Passed') r.verifStatus = 'In Progress'; }
        else {
            var e = evidenceFor(r).filter(function (x) { return x.id === opt; })[0]; if (!e) return;
            var label = e.id === 'rec' ? S(r.verifEvidence) : e.label.charAt(0).toUpperCase() + e.label.slice(1);
            s0.close[S(r.internalId)] = { ev: e.id, label: label, by: who(), at: now() };
            r.verifEvidence = label; r.verifStatus = 'Passed';
        }
        save(); done(qid);
    }

    // ---- outputs and acceptance: the compliance summary, accepted by role ------------------------------------------------------
    function fpOf(o) { try { return JSON.stringify(o); } catch (_) { return String(Math.random()); } }
    function outputs() {
        var grs = A() ? A().candidates() : [];
        return [
            { id: 'triage', what: 'Every aircraft failure condition closed', accept: 'Each one closed by an SSA or at the aircraft level; none open', role: 'Aircraft safety lead', fp: function () { return fpOf(grs.map(function (gr) { var t = triOf(gr); return [gr.fcId, t && t.cls]; })); } },
            { id: 'acl', what: 'The aircraft-level work', accept: 'Each failure condition several systems feed is worked out again with their measured numbers, within its objective, and accepted', role: 'Chief safety engineer', fp: function () { return fpOf(grs.map(function (gr) { return [gr.fcId, aclOk(gr), runs(gr).map(function (x) { return x.measuredPerFH; })]; })); } },
            { id: 'cc', what: 'The common causes closed', accept: 'Every gate a budget rests on has its common mode analysis; the particular risks and zonal hazards are closed', role: 'Chief safety engineer', fp: function () { return fpOf(grs.map(function (gr) { return A().critGates(gr).map(function (x) { return x.key; }); })); } },
            { id: 'req', what: 'Every aircraft requirement closed with its evidence', accept: 'Each aircraft requirement names the evidence that closes it and is marked Passed', role: 'Certification manager', fp: function () { return fpOf(arr(g('acReqData')).filter(live).map(function (r) { return [r.internalId, r.verifStatus, r.verifEvidence]; })); } },
            { id: 'concl', what: 'The compliance summary', accept: 'Each appendix and the report as a whole concluded, by the engineer or from an accepted AI draft', role: 'Head of airworthiness', fp: function () { return fpOf((pc() && pc().ccaReports && pc().ccaReports.asa && pc().ccaReports.asa.authored) || {}); } }
        ];
    }

    // ---- the frame -------------------------------------------------------------------------------------------------------------
    function lockPage(lk) {
        var v = typeof document !== 'undefined' ? document.getElementById('view-asa') : null; if (!v) return;
        var h = document.getElementById('ccr-host-asa'); if (h) h.style.display = lk.locked ? 'none' : '';
        var c = document.getElementById('asa-lock-page');
        if (!lk.locked) { if (c) c.remove(); return; }
        if (!c) { c = document.createElement('div'); c.id = 'asa-lock-page'; var head = v.querySelector(':scope > .header-with-export'); if (head && head.nextSibling) v.insertBefore(c, head.nextSibling); else v.appendChild(c); }
        L().style(); c.innerHTML = lockCard(lk);
    }
    function define() {
        var CR = root.SLCcaReport; if (!CR || !L() || !A() || typeof document === 'undefined' || !document.getElementById('view-asa')) return null;
        // the old checkpoint list gives way to the Autopilot
        if (!document.getElementById('asa-auto-style')) { var st = document.createElement('style'); st.id = 'asa-auto-style'; st.textContent = '#view-asa > #ckpt-page-asa{display:none!important}#view-asa > p{display:none}'; document.head.appendChild(st); }
        var R = CR.define({
            key: 'asa', viewId: 'view-asa', leftId: 'asa-auto-host', title: 'Aircraft Safety Assessment', code: 'ASA',
            lead: 'One report for the aircraft, closing its PASA: the front says what it rests on and how every failure condition is closed; each function has its own appendix, the same as the PASA\'s. The questions are which evidence closes each aircraft requirement and whether the aircraft-level work is done.',
            appendices: true,
            tabs: { allLabel: false, parts: true, pickLabel: 'Part', frontLabel: 'Front of the report', noun: 'function', partLabel: function (s) { var id = fnOfSid(s); return id ? fnTitle(id) : S(s); } },
            reports: function () { return [{ id: 'aircraft', code: '001', label: 'Aircraft', title: 'Aircraft', sections: lockOf().locked ? [] : apx().map(sid) }]; },
            front: front, after: after, sections: sections, renderQuestions: renderQuestions, outputs: outputs,
            authored: [{ id: 'conclusion', title: 'Conclusion', purpose: 'Whether each failure condition of this function is closed for the aircraft as designed, on what evidence, and what is still open.' }],
            reportAuthored: [{ id: 'conclusion', title: 'Compliance summary', purpose: 'Whether the aircraft as designed meets the safety objectives of its failure conditions, on what evidence, and what is still open.' }],
            aiType: 'ASA',
            aiReady: function (s) { var id = fnOfSid(s); if (id) { var l0 = fnLeft(id); return { ready: !l0.length, left: l0 }; } var l2 = frontLeft().concat(apx().filter(function (x) { return fnLeft(x).length; }).map(function (x) { return 'The questions of the appendix for ' + fnTitle(x); })); return { ready: !l2.length, left: l2 }; },
            io: { does: 'Shows that the aircraft as designed meets the safety objective of every failure condition its PASA assessed: each closed by an SSA or at the aircraft level, with the common causes closed and the requirements verified.',
                inputs: [{ id: 'pasa', what: 'The baselined PASA', from: 'PASA', tab: 'pasa' }, { id: 'ssa', what: 'The baselined SSA of each system', from: 'SSA', tab: 'sys-workspace' }, { id: 'cca', what: 'The common mode analyses, the particular risk assessment and the zonal safety analysis', from: 'Common cause', tab: 'cma' }],
                outputs: [{ id: 'summary', what: 'The compliance summary, accepted by role', to: 'Certification', tab: 'asa' }] }
        });
        if (R && !R._asaLock) {
            var r0 = R.render;
            R.render = function () { var lk = lockOf(); lockPage(lk); if (lk.locked) return; return r0.apply(this, arguments); };
            R._asaLock = true;
        }
        return R;
    }
    (function boot(tries) { if (define()) return; if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { boot(tries - 1); }, 250); })(80);

    var api = { VERSION: VERSION, lockOf: lockOf, triage: triage, triOf: triOf, runs: runs, reqsOf: reqsOf, evidenceFor: evidenceFor, fcLeft: fcLeft, fnLeft: fnLeft, frontLeft: frontLeft, openItems: openItems, fnSection: fnSection, front: front, outputs: outputs, store: astore, aclOk: aclOk,
        ui: { pick: pick } };
    try { root.SLAsaAuto = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

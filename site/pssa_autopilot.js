// pssa_autopilot.js (SLPssaAuto v2.2, 11 Nov 2026): the PSSA Autopilot. One Preliminary System Safety Assessment per system:
// the front of the report for the system (scope, the system, the method, its failure conditions, its requirement levels, what
// the appendices found, the conclusion) and one appendix per function, holding every failure condition of that function rated
// Minor or above.
//
// Waqas, 10 Nov 2026: "the PSSA one per system level cover page meat in the per failure condition report"; "the PSSA page is
// already pretty trimmed down": the Autopilot goes into the system's PSSA tab. Each failure condition starts from the system
// FHA entry and what the aircraft hands down ("if two aircraft failure conditions set a budget, the stricter applies, worked
// out"); no interdependence, no common resources, no CoFFE. The tree goes down to items, then what it says, the numbers, item
// assurance levels, hidden failures and their checks (candidate maintenance requirements), independence claims handed to the
// CMA Autopilot, the AutoReq requirements, the path to compliance and the conclusion. Questions: whether to claim independence
// to set item assurance levels lower; check intervals for hidden failures; the requirement levels.
//
// v2.0 (Waqas, 10 Nov 2026, after v1): "same for PSSA, function not failure condtion, each appendix containing all its
// applicable failure conditions". No picking: every function of the system with a failure condition rated Minor or above has an
// appendix; No Safety Effect is in the register only. Minor is qualitative; the 1309 chart routes Major and above; a chart not
// answered stays quantitative and is an open item. The function of a system FHA row is the system function whose ID it carries;
// where it carries an aircraft function instead, the appendix is that aircraft function as this system carries it.
// "requirements can be driven at multiple levels": the levels here are systems and/or items, ticked for the system with an
// override per function. AutoReq already writes both: rows for the system, and rows for one item of the tree (req_trace.js
// atItem); the ticks decide which are taken, and each item row is traced to its system row. The front shows the front only;
// each appendix is built when opened and memoized per data generation.
//
// v2.1 (Waqas, 11 Nov 2026): the tool no longer builds a tree's inputs (fc_auto_trees.js v2.0). A system tree with nothing built
// under its top reads "has not been created yet" (no picture, numbers, item levels or hidden failure questions). What the
// aircraft hands down is the share each aircraft tree gives this failure condition's ONE shared node (or a transfer to its
// tree), each tree's own share, the strictest applying: the same numbers the tree's target is set from (SLFcTrees.shares).
//
// Kept here: projectConfig.pssaAuto = { front: { <sysId>: { scope, scopeNote, desc, descText, method } },
//   fc: { <sysId>|<fcId>: { indep: 'yes'|'no', hid: { <lid>: 'evident'|'hidden' } } } }
// Written where it lives: the tree's own gates (dalIndependence, then the DAL allocation of that tree) and events (repairModel
// 'periodic' and tau for a check), the requirement levels (projectConfig.reqLevels, req_trace.js), the registers
// (AutoReq.applyMerge). Numbers from SLTopBasis and the trees. window.SLPssaAuto.
(function (root) {
    'use strict';
    var VERSION = '2.2';   // 2.2 11 Nov 2026: a gate whose inputs are all held tighter than their shares says what they use of its budget
    function g(n) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(n); if (v !== undefined) return v; } } catch (_) {} try { return root[n]; } catch (_) { return undefined; } }
    function L() { return root.SLPasaAuto && root.SLPasaAuto.lib; }
    function S(v) { return v == null ? '' : String(v); }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function safe(f, d) { try { var v = f(); return v === undefined ? d : v; } catch (_) { return d; } }
    function pc() { var p = g('projectConfig'); return p && typeof p === 'object' ? p : null; }
    function now() { return new Date().toISOString(); }
    function who() { return root.SLAutopilotUI ? root.SLAutopilotUI.who() : 'Engineer'; }
    function save() { try { if (root.SLDataChange && root.SLDataChange.bump) root.SLDataChange.bump(); } catch (_) {} if (root.SLAutopilotUI) root.SLAutopilotUI.save(); }
    function H(level, text, extra) { return Object.assign({ k: 'h', level: level, text: text }, extra || {}); }
    function P(text, q) { return q ? { k: 'p', text: text, q: q } : { k: 'p', text: text }; }

    // ---- the system on screen and its failure conditions ---------------------------------------------------------------
    function sysNow() { var id = g('activeSystemId'), list = arr(g('systemsData')); return list.filter(function (s) { return s && S(s.id) === S(id); })[0] || null; }
    function store() { var p = pc(); if (!p) return { picks: {}, front: {}, fc: {} }; if (!p.pssaAuto || typeof p.pssaAuto !== 'object') p.pssaAuto = {}; var s0 = p.pssaAuto; ['picks', 'front', 'fc'].forEach(function (k) { if (!s0[k] || typeof s0[k] !== 'object') s0[k] = {}; }); return s0; }
    function frontOf(sy) { var s0 = store(); return s0.front[S(sy.id)] || (s0.front[S(sy.id)] = {}); }
    function fcRec(sy, fcId) { var s0 = store(), k = S(sy.id) + '|' + fcId; var m = s0.fc[k] || (s0.fc[k] = {}); if (!m.hid) m.hid = {}; return m; }
    function F() { return root.SLFcTrees || null; }
    function groups(sy) { return sy && F() ? (safe(function () { return F().groups(sy); }, []) || []) : []; }
    function treeOf(gr) { return gr && F() ? safe(function () { return F().treeFor(gr); }, null) : null; }
    // v2.0: every failure condition rated Minor or above is applicable (its governing row, the worst case), with or without a tree
    function candidates(sy) { var l = L(); return groups(sy).filter(function (gr) { return gr && gr.fcId && l.rank(gr.gov.severity) >= l.SEV_RANK.Minor; }); }
    function groupOf(sy, fcId) { return groups(sy).filter(function (gr) { return gr.fcId === S(fcId); })[0] || null; }
    function picks(sy) { return candidates(sy).map(function (x) { return x.fcId; }); }
    // the function of a system FHA row: the system function whose ID it carries, else the aircraft function it carries
    function fnKey(sy, gr) { var k = S(gr.gov.subId || arr(gr.gov.subIds)[0] || ''); return k || '(no function)'; }
    function fnInfo(sy, key) {
        var l = L(), sf = arr(sy.functions).filter(function (x) { return x && S(x.funcId) === S(key); })[0];
        if (sf) return { id: S(key), name: l.T(sf.funcName || ''), def: l.T(sf.funcDef || ''), kind: 'system', carriers: [] };
        var af = arr(g('acFunctionsData')).filter(function (x) { return x && S(x.subId) === S(key); })[0];
        var car = arr(sy.functions).filter(function (x) { return x && arr(x.traceIds).map(S).indexOf(S(key)) >= 0; });
        if (af) return { id: S(key), name: l.T(af.subName || af.funcName || ''), def: l.T(af.subDef || af.funcDef || ''), kind: 'aircraft', carriers: car };
        return { id: S(key), name: '', def: '', kind: 'none', carriers: car };
    }
    function fnTitle(f) { return f ? f.id + (f.name ? ' ' + f.name : '') : ''; }
    function fnGroups(sy, key) { return candidates(sy).filter(function (gr) { return fnKey(sy, gr) === S(key); }); }
    // the appendices: the system's own functions first, in its order, then any other function its failure conditions carry
    function appendices(sy) {
        var keys = [], c = candidates(sy);
        arr(sy.functions).forEach(function (f) { var k = S(f && f.funcId); if (k && keys.indexOf(k) < 0 && c.some(function (gr) { return fnKey(sy, gr) === k; })) keys.push(k); });
        c.forEach(function (gr) { var k = fnKey(sy, gr); if (keys.indexOf(k) < 0) keys.push(k); });
        return keys;
    }
    function appendixOf(sy, gr) { return appendices(sy).indexOf(fnKey(sy, gr)); }
    // quantitative or qualitative, from the 1309 chart: Minor is always qualitative; a chart not answered stays quantitative
    function routeOf(gr) {
        var l = L(); if (l.rank(gr.gov.severity) < l.SEV_RANK.Major) return 'qual';
        var r = F() ? safe(function () { return F().route(gr.gov); }, 'quant') : 'quant';
        return r === 'similarity' ? 'similarity' : r === 'qual' ? 'qual' : r === 'unanswered' ? 'unanswered' : 'quant';
    }
    function isQuant(gr) { var r = routeOf(gr); return r === 'quant' || r === 'unanswered'; }
    function routeWords(gr) { return isQuant(gr) ? 'quantitative' : 'qualitative'; }
    function memoGen() { var dc = root.SLDataChange; return dc && dc.gen ? dc.gen() : -1; }
    function sid(key) { return 'fn:' + key; }
    function fnOfSid(s) { return S(s).indexOf('fn:') === 0 ? S(s).slice(3) : null; }
    function fcName(gr) { return gr ? gr.fcId + ' ' + L().T(gr.gov.fcDesc || '') : ''; }
    function TB() { return root.SLTopBasis || null; }
    // true when something is built under the top of the failure condition's tree (a tree made by the tool is its top only)
    function built(gr) { var p = treeOf(gr); return !!(p && p.root && (F() && F().built ? F().built(p) : L().kids(p.root).length > 0)); }
    function gateFlags(gr) { var p = treeOf(gr), out = { rebalanced: [], over: [], spare: [] }, l = L(); if (!p || !p.root) return out; l.walk(p.root, function (n) { var m = n._budgetMargin; if (!m) return; if (m.state === 'rebalanced') out.rebalanced.push(l.nodeName(n)); else if (m.state === 'over-committed') out.over.push(l.nodeName(n)); else if (m.state === 'spare-held' || m.state === 'reserve') out.spare.push({ name: l.nodeName(n), used: m.achieved, budget: m.target, reserve: m.state === 'reserve' }); }); return out; }

    // ---- what the aircraft hands down: every aircraft budget for this system failure condition, the stricter applying ------
    function acRowsTraced(gr) {
        var keys = [], l = L(), out = [];
        gr.rows.forEach(function (r) { l.traceList(r.acTrace).concat(arr(r.acTraces).map(S)).forEach(function (t) { if (keys.indexOf(t) < 0) keys.push(t); }); });
        arr(g('acFhaData')).forEach(function (a) { if (a && (keys.indexOf(S(a.fcId)) >= 0 || keys.indexOf(S(a.internalId)) >= 0) && !out.some(function (x) { return S(x.fcId) === S(a.fcId); })) out.push(a); });
        return out;
    }
    function handedDown(gr) {
        var page = treeOf(gr), B = TB(), l = L(), out = [];
        if (!page) return out;
        var ids = gr.rows.map(function (r) { return 'SYS_' + r.internalId; });
        // the aircraft failure conditions it is traced to, at their class objective
        acRowsTraced(gr).forEach(function (a) { var t = l.target(a.severity); if (t.prob != null) out.push({ from: 'PASA ' + S(a.fcId) + ' ' + l.T(a.fcDesc || ''), rate: t.prob, how: 'Its objective (' + S(a.severity) + ')' }); });
        // the aircraft trees it is linked into, at the share each gives it (its shared node, or a transfer to this tree), each
        // tree allocated as the tool allocates it (SLFcTrees.shares: the same numbers the tree's own target is set from)
        arr(safe(function () { return F().shares(page); }, [])).forEach(function (x) {
            out.push({ from: 'Aircraft fault tree ' + l.T(x.pageName || x.pageId).replace(/^PASA\s*\u00B7\s*/, '') + ', ' + l.T((x.displayId ? x.displayId + ' ' : '') + (x.nodeName || '')), rate: x.rate, how: 'The share its fault tree gives it (' + l.sci(x.pFlight) + ' per flight)' }); });
        return out;
    }
    function applies(gr) { var h = handedDown(gr); return h.length ? h.reduce(function (m, x) { return x.rate < m.rate ? x : m; }, h[0]) : null; }

    // ---- the tree's facts ----------------------------------------------------------------------------------------------
    function leaves(page) { var out = [], seen = {}, l = L(); l.walk(page.root, function (n) { if (n.type !== 'gate' && !seen[n.id]) { seen[n.id] = 1; out.push(n); } }); return out; }
    function lidOf(n) { return S(n.logicalId != null ? n.logicalId : n.id); }
    function hiddenOf(sy, gr) { var page = treeOf(gr), rec = fcRec(sy, gr.fcId); if (!page) return []; return leaves(page).filter(function (n) { return rec.hid[lidOf(n)] === 'hidden' || n.repairModel === 'periodic' || n.exposureMode === 'latent'; }); }
    function andGates(page) { var out = [], l = L(); l.walk(page.root, function (n) { if (n.type === 'gate' && /^(AND|INHIBIT|PAND|SPARE|SEQ|VOTING)$/.test(S(n.gateType)) && l.kids(n).length > 1) out.push(n); }); return out; }
    var _fx = { gen: -2, map: {} };
    function facts(sy, gr) {
        var G = memoGen(), k = S(sy.id) + '|' + gr.fcId;
        if (_fx.gen !== G || G === -1) _fx = { gen: G, map: {} };
        if (Object.prototype.hasOwnProperty.call(_fx.map, k)) return _fx.map[k];
        return (_fx.map[k] = factsRaw(sy, gr));
    }
    function factsRaw(sy, gr) {
        var page = treeOf(gr), l = L(), B = TB(); if (!page) return null;
        if (l.allocated) l.allocated();   // every tree at its budget, every shared node at its strictest (pasa_autopilot.js)
        var cs = l.cutsets(page), out = { page: page };
        out.singles = cs ? cs.filter(function (c) { return c.length === 1; }).map(function (c) { return l.nodeName(c[0]); }) : null;
        out.shortest = cs && cs.length ? cs.reduce(function (m, c) { return Math.min(m, c.length); }, 1e9) : null;
        out.shortestEx = cs ? (cs.filter(function (c) { return c.length === out.shortest; })[0] || []).map(l.nodeName) : [];
        out.ands = andGates(page).map(l.nodeName);
        out.hours = B ? safe(function () { return B.missionHours(page).hours; }, null) : null;
        out.pTop = B ? safe(function () { return B.exactTop(page.root); }, null) : null;
        out.rate = out.pTop != null && B ? safe(function () { return B.perFlightHour(out.pTop, page).rate; }, null) : null;
        var ap = applies(gr), cls = l.target(gr.gov.severity).prob;
        out.budget = ap ? Math.min(ap.rate, cls != null ? cls : Infinity) : cls;
        out.meets = out.pTop != null && out.budget != null && B ? safe(function () { return B.meets(out.pTop, out.budget, page); }, null) : null;
        out.cg = l.cgOf(page);
        out.fdal = l.target(gr.gov.severity).dal;
        return out;
    }

    // ---- item assurance levels: the tree's own allocation, with or without the independence claims -----------------------
    var STRIP = ['allocatedDAL', 'isDALCarrier', '_dalReduced', '_dalProvisional', '_dalCompromised', '_dalCompromiseReason', '_probCompromised', '_probCompromiseReason', '_independenceReq', '_dalDerivation', '_cmaCompromised', '_dalIfSubstantiated', '_dalPending', '_dalIfReverted', '_dalRestsOn'];
    function reallocate(page, topDal) {
        var l = L(); if (!page || !topDal || typeof root.allocateDAL !== 'function') return false;
        l.walk(page.root, function (n) { STRIP.forEach(function (k) { if (k === 'allocatedDAL') n[k] = null; else if (k === 'isDALCarrier' || /^_dal(Reduced|Provisional|Compromised|Pending)$|^_probCompromised$|^_cmaCompromised$/.test(k)) n[k] = false; else n[k] = null; }); });
        var ctx = null; try { ctx = root.SLF3061 && root.SLF3061.contextFor ? root.SLF3061.contextFor(null, pc()) : null; } catch (_) { ctx = null; }
        try { root.allocateDAL(page.root, topDal, new Set(), undefined, ctx || undefined); return true; } catch (_) { return false; }
    }
    function setIndep(sy, gr, yes) {
        var page = treeOf(gr); if (!page) return;
        andGates(page).forEach(function (n) {
            if (yes) { if (n.dalIndependence === 'none' && n._pssaWas) { n.dalIndependence = n._pssaWas; delete n._pssaWas; } }
            else if (n.dalIndependence !== 'none' && n.dalIndependence !== 'compromised') { n._pssaWas = n.dalIndependence || 'claimed'; n.dalIndependence = 'none'; }
        });
        fcRec(sy, gr.fcId).indep = yes ? 'yes' : 'no';
        reallocate(page, L().target(gr.gov.severity).dal);
    }
    function items(page) {
        var l = L(), out = [];
        l.walk(page.root, function (n) { if (n.allocatedDAL && (n.type !== 'gate' || /^(AND|INHIBIT|PAND|SPARE|SEQ|VOTING)$/.test(S(n.gateType)))) out.push(n); });
        return out;
    }

    // ---- requirements: AutoReq for this system failure condition -----------------------------------------------------------
    var _rq = { k: '', merge: null };
    function merge(sy) {
        var dc = root.SLDataChange, G = dc && dc.gen ? dc.gen() : -1, k = G + '|' + S(sy.id);
        if (_rq.k === k && G !== -1 && _rq.merge) return _rq.merge;
        var AR = g('AutoReq'); var m = AR ? safe(function () { return AR.generate(undefined, 'sys-' + sy.id); }, null) : null;
        _rq = { k: k, merge: m }; return m;
    }
    function stored(sy, sourceId) { return arr(sy.req).filter(function (r) { return r && r.reqSource && S(r.reqSource.sourceId) === S(sourceId) && !r.deleted; })[0] || null; }
    // the requirement levels of one system function, and what each requirement becomes at them: the system row (ticked
    // "systems", or nothing decided yet) and, ticked "items", the rows flowed down to each item in the tree
    // AutoReq writes both levels for a system: rows for the system (from the system FHA and the tree's gates) and rows for one
    // item of the tree (a basic event's probability, check or assurance level; req_trace.js atItem). The levels ticked decide
    // which are taken (nothing decided yet: both are shown); each item row is traced to the system row of its type.
    function reqsFor(sy, gr) {
        var m = merge(sy), RT = root.SLReqTrace, page = treeOf(gr); if (!m || !RT) return [];
        var list = [], key = fnKey(sy, gr);
        arr(m.isNew).forEach(function (c) { list.push({ cand: c, row: null, state: 'new' }); });
        arr(m.isUpdated).forEach(function (u) { list.push({ cand: u.next, row: stored(sy, u.next.reqSource.sourceId), state: 'changed' }); });
        arr(m.unchanged).forEach(function (u) { list.push({ cand: u.next, row: stored(sy, u.next.reqSource.sourceId), state: 'in' }); });
        var pid = S(page && page.id);
        var mine = list.filter(function (x) {
            var d = RT.drivenFrom(x.row || x.cand);
            var own = d.some(function (e) { return /failure condition$/.test(e.what) && e.id === gr.fcId; });
            var trees = d.filter(function (e) { return /^fta:/.test(e.tab || '') && (e.what === 'Gate' || e.what === 'Event'); });
            if (trees.length) return trees.some(function (e) { return e.tab.split(':')[1] === pid; });
            return own;
        }).map(function (x) {
            var r = x.row || x.cand, t = RT.typeOf(r), lv = RT.pssaLevels(t, sy.id, key).levels, it = RT.atItem(x.cand);
            return { r: r, cand: x.cand, state: x.state, type: t, levels: lv, at: it ? 'item' : 'system', on: !lv.length || lv.indexOf(it ? 'item' : 'system') >= 0 };
        });
        // the system row an item row is traced to: the one of its type written from the system FHA, else the first of its type
        mine.forEach(function (x) { if (x.at !== 'item') return; var ps = mine.filter(function (y) { return y.at === 'system' && y.type === x.type; }); x.parent = ps.filter(function (y) { return /^fha-/.test(S(y.cand.reqSource.generator)); })[0] || ps[0] || null; });
        var o = RT.TYPES.map(function (t) { return t.id; });
        return mine.sort(function (a, b) { return (o.indexOf(a.type) - o.indexOf(b.type)) || ((a.at === 'item') - (b.at === 'item')); });
    }
    function reqEntries(rq) {
        return rq.filter(function (x) { return x.on; }).map(function (x) {
            var id = x.r.id ? S(x.r.id) : 'New';
            return { x: x, r: x.r, label: x.at === 'item' && x.parent && x.parent.on ? '↳ ' + id : id, item: x.at === 'item', state: x.state };
        });
    }
    function levelWords(lv) { return lv && lv.length ? L().listJoin(lv.map(function (x) { return x === 'system' ? 'the system' : 'each item'; })) : 'Not decided yet'; }
    // what the PASA flowed down into this system for the aircraft failure conditions this one is traced to
    function flowedIn(sy, gr) {
        var ac = acRowsTraced(gr).map(function (a) { return S(a.fcId); });
        return arr(sy.req).filter(function (r) { return r && !r.deleted && r.reqSource && r.reqSource.generator === 'flow-down' && ac.indexOf(S(r.reqSource.context && r.reqSource.context.fcId)) >= 0; });
    }

    // ---- what is still open --------------------------------------------------------------------------------------------
    function frontLeft(sy) {
        var f = frontOf(sy), left = [], RT = root.SLReqTrace;
        if (!f.scope) left.push('What does this PSSA cover?');
        if (!f.desc) left.push('Is this the system the PSSA assesses?');
        if (!f.method) left.push('Which method and numbers does the PSSA use?');
        if (RT) RT.TYPES.forEach(function (t) { if (!RT.pssaLevels(t.id, sy.id, null).levels.length) left.push('At what level are ' + L().lc(t.name) + ' requirements derived in this system?'); });
        return left;
    }
    function fcLeft(sy, gr) {
        var left = [], rec = fcRec(sy, gr.fcId), page = treeOf(gr);
        if (!isQuant(gr) || !page || !built(gr)) return left;
        if (andGates(page).length && !rec.indep) left.push('Use independence to set the item assurance levels for ' + gr.fcId + '?');
        leaves(page).forEach(function (n) { var k = lidOf(n), st = rec.hid[k]; if (!st && !(n.repairModel === 'periodic' || n.exposureMode === 'latent')) left.push('Would ' + L().nodeName(n) + ' show itself when it fails?'); else if (st === 'hidden' && !(n.repairModel === 'periodic' && n.tau)) left.push('How often is ' + L().nodeName(n) + ' checked?'); });
        return left;
    }
    function fnLeft(sy, key) { var out = []; fnGroups(sy, key).forEach(function (gr) { out = out.concat(fcLeft(sy, gr)); }); return out; }
    function openItems(sy, gr) {
        var out = [], l = L(), r0 = routeOf(gr), page = treeOf(gr);
        if (r0 === 'unanswered') out.push('The 1309 chart for ' + gr.fcId + ' is not answered in the system FHA yet, so it is assessed quantitatively until it is.');
        if (isQuant(gr) && !page) { out.push('No fault tree is generated for ' + gr.fcId + ' yet: generate it in the Fault trees tab.'); return out; }
        if (!isQuant(gr)) return out;
        if (!built(gr)) { out.push('The fault tree for ' + gr.fcId + ' has not been created yet: build it in the Fault trees tab.'); return out; }
        var gf = gateFlags(gr);
        gf.over.forEach(function (x) { out.push('The inputs of ' + x + ' take more than its budget. Change what holds them, or the target.'); });
        gf.rebalanced.forEach(function (x) { out.push(x + ' was rebalanced by the tool (an input under it is held tighter than its share): accept it, or keep the tighter budgets, in the Budget Ledger.'); });
        var fx = facts(sy, gr);
        if (fx && fx.meets && !fx.meets.pass) out.push('The fault tree is above its budget: ' + l.sci(fx.rate) + ' per flight hour against ' + l.sci(fx.budget) + '.');
        if (fx && fx.cg) fx.cg.gates.filter(function (x) { return x.critical; }).forEach(function (x) { if (!l.cmas().some(function (c) { return arr(c.linkedGateIds).map(S).indexOf(S(x.key)) >= 0; })) out.push('Gate ' + x.displayId + (x.name ? ' ' + l.T(x.name) : '') + ' carries the budget and has no common mode review yet.'); });
        var ap = applies(gr);
        if (ap && page && page.targetP != null && Number(page.targetP) > ap.rate * (1 + 1e-6)) out.push('The tree\'s target (' + l.sci(Number(page.targetP)) + ' per flight hour) is looser than the stricter budget handed down (' + l.sci(ap.rate) + ').');
        return out;
    }

    // ---- the report --------------------------------------------------------------------------------------------------------
    function front(ctx) {
        var sy = sysNow(), l = L(); if (!sy || !l) return [P('Open a system to see its PSSA.')];
        var f = frontOf(sy), b = [], fns = arr(sy.functions).filter(function (x) { return x && x.funcId; });
        b.push(H(1, 'Purpose and scope'));
        b.push(P('This Preliminary System Safety Assessment (PSSA) of the ' + l.T(sy.name || sy.id) + ' shows how the system is built to meet what the aircraft asks of it, what each item must promise, and what has to be checked so the backups are really there when needed. It takes the budgets the PASA hands down and works them through the system\'s own fault trees down to its items.'));
        b.push(P(f.scope === 'part' ? 'This issue covers part of the system only. ' + l.T(f.scopeNote || 'What is left out, and why, is not written yet.') : f.scope === 'all' ? 'It covers every function and failure condition in the system FHA.' : 'Not decided yet: what this PSSA covers.', 'pssa.scope'));
        b.push(H(1, 'The system'));
        b.push(P(f.desc === 'own' && f.descText ? l.T(f.descText) : f.desc === 'project' ? 'The ' + l.T(sy.name || sy.id) + (fns.length ? ' performs ' + l.listJoin(fns.map(function (x) { return l.lc(l.T(x.funcName || x.funcId)); })) + '.' : '.') : 'Not decided yet: the description of the system.', 'pssa.desc'));
        b.push(H(1, 'Method'));
        b.push(P(f.method === 'std' ? 'The assessment follows ARP4761A and ARP4754B, with the objectives of ' + l.acRef() + ' (' + l.regulation() + '). Each function of the system with a failure condition rated Minor or above has its own appendix. The 1309 chart in the system FHA decides whether each failure condition is assessed quantitatively or qualitatively; a Minor one is qualitative. Each quantitative one takes the stricter of the budgets the aircraft hands down and its own class objective; the tree goes down to items, and the item assurance levels come from the tree.' : f.method === 'own' && f.methodText ? l.T(f.methodText) : 'Not decided yet: the method.', 'pssa.method'));
        var RT = root.SLReqTrace;
        if (RT) b.push({ k: 'table', name: 'levels', title: 'The levels each type of requirement is written at in this system', q: 'pssa.lvl', rows: RT.TYPES.map(function (t) { var x = RT.pssaLevels(t.id, sy.id, null); return { 'Requirement type': t.name, 'Written at': levelWords(x.levels), From: x.from === 'system' ? 'Set for this system' : x.from === 'pasa' ? 'The PASA (systems ticked)' : '' }; }), lead: '{N} lists where each type of requirement is written in this system: the system, its items, or both. A function may set its own.' });
        b.push(H(1, 'The failure conditions'));
        var apx = appendices(sy);
        b.push({ k: 'table', name: 'register', title: 'System failure conditions and where each is assessed', q: 'pssa.fcs', rows: groups(sy).map(function (gr) { var i = apx.indexOf(fnKey(sy, gr)); var on = l.rank(gr.gov.severity) >= l.SEV_RANK.Minor; return { 'Failure condition': fcName(gr), Function: fnTitle(fnInfo(sy, fnKey(sy, gr))), Severity: S(gr.gov.severity), 'Assessed in': on && i >= 0 ? 'Appendix ' + letter(i) + ', ' + routeWords(gr) + (routeOf(gr) === 'unanswered' ? ' (1309 chart not answered)' : '') : 'No appendix: no safety effect' }; }), lead: '{N} lists every failure condition in the system FHA, its function and where it is assessed.' });
        return b;
    }
    function letter(i) { var R0 = root.SLCcaReport && root.SLCcaReport.get('pssa'); return R0 && R0.appxLetter ? R0.appxLetter(i) : String.fromCharCode(65 + i); }
    function after(ctx) {
        var sy = sysNow(), l = L(); if (!sy || !l) return [];
        var b = [H(1, 'What the appendices found')], apx = appendices(sy), rows = [];
        apx.forEach(function (k, i) { fnGroups(sy, k).forEach(function (gr) { var q = isQuant(gr), bt = q && built(gr), fx = bt ? facts(sy, gr) : null, o = openItems(sy, gr); rows.push({ Appendix: letter(i), 'Failure condition': fcName(gr), Assessment: routeWords(gr), 'Against the budget': !q ? 'Qualitative: no number' : !bt ? 'Fault tree not created yet' : fx && fx.meets ? (fx.meets.pass ? 'Within' : 'Above') + ' (' + l.sci(fx.rate) + ' against ' + l.sci(fx.budget) + ' per flight hour)' : 'Not worked out', Findings: o.length ? o.join(' ') : 'None' }); }); });
        if (!rows.length) b.push(P('No failure condition of this system is rated Minor or above.'));
        else b.push({ k: 'table', name: 'found', title: 'What each appendix found', rows: rows, lead: '{N} sums up each failure condition in each appendix.' });
        b.push({ k: 'rauth', asHeading: 1 });
        return b;
    }
    function fcPart(sy, gr, ctx) {
        var l = L(), fc = gr.gov, f = fc.fcId, q = function (x) { return 'fc.' + f + '.' + x; }, b = [], t = l.target(fc.severity), fx = isQuant(gr) ? (facts(sy, gr) || {}) : {}, page = treeOf(gr), rec = fcRec(sy, f);
        var acs = acRowsTraced(gr);
        b.push(H(2, fcName(gr) + ' (' + routeWords(gr) + ')'));
        b.push(H(3, 'What is being evaluated'));
        b.push(P(f + ' is ' + l.lc(l.T(fc.fcDesc)) + ' in the ' + l.T(sy.name || sy.id) + '. The system FHA rates it ' + S(fc.severity) + (acs.length ? ', and it feeds ' + l.listJoin(acs.map(function (a) { return S(a.fcId) + ' ' + l.T(a.fcDesc || ''); })) + ' at the aircraft level' : '') + '.'));
        b.push(P('This appendix shows how the system is built to keep that from happening, what each item must promise, and what has to be checked so the backups are really there when needed.'));
        b.push(H(3, 'The system FHA entry'));
        b.push({ k: 'table', name: 'sfha-' + f, title: f + ' as the system FHA records it', rows: [{ Item: 'Failure condition', Entry: fcName(gr) }, { Item: 'Flight phases', Entry: l.T(fc.phases || 'Every phase') }, { Item: 'Effect', Entry: l.T(fc.effAc || 'Not recorded') }, { Item: 'Severity', Entry: S(fc.severity) }, { Item: 'Feeds aircraft failure conditions', Entry: acs.length ? acs.map(function (a) { return S(a.fcId) + ' ' + l.T(a.fcDesc || ''); }).join('; ') : 'None traced' }], lead: '{N} is the system FHA entry for the worst case of ' + f + '.' });
        b.push(H(3, 'What the aircraft hands down'));
        var hd = handedDown(gr), ap = applies(gr);
        if (!hd.length) b.push(P('Nothing is handed down from the aircraft yet: ' + f + ' is not traced to an aircraft failure condition, so its own class objective applies (' + (t.prob != null ? l.sci(t.prob) + ' per flight hour' : 'not set') + ').'));
        else {
            b.push({ k: 'table', name: 'hand-' + f, title: 'The budgets the aircraft sets for ' + f, rows: hd.map(function (x) { return { From: x.from, Budget: l.sci(x.rate) + ' per flight hour', How: x.how }; }).concat([{ From: 'Applies (the stricter)', Budget: l.sci(ap.rate) + ' per flight hour', How: 'The strictest of the above' }]), lead: '{N} lists each budget handed down and the one that applies.' });
            if (hd.length > 1) b.push(P('More than one budget is set for the same system failure. The system has to meet the stricter one; this is worked out, not chosen.'));
        }
        var fin = flowedIn(sy, gr);
        if (fin.length) b.push({ k: 'table', name: 'in-' + f, title: 'Requirements the PASA flowed down to the ' + l.T(sy.name || sy.id) + ' for ' + f, rows: fin.map(function (r) { return { ID: r.id ? S(r.id) : 'New', Requirement: l.T(r.text), 'From the aircraft failure condition': S(r.reqSource.context.fcId) }; }), lead: '{N} lists what the aircraft asks of this system, as the PASA wrote it into the system requirements.' });
        if (isQuant(gr) && !page) b.push(P(f + ' is assessed quantitatively, but no fault tree is generated for it yet. Its tree, numbers and item assurance levels appear here once it is.'));
        else if (isQuant(gr) && !built(gr)) { b.push(H(3, 'The fault tree')); b.push(P('The fault tree for ' + f + ' has not been created yet. It has its top event' + (ap ? ' and its budget (' + l.sci(ap.rate) + ' per flight hour)' : '') + ' and nothing under it. Build it in the Fault trees tab; what the tree says, its numbers, the item assurance levels and the hidden failures appear here once it is.')); }
        else if (!isQuant(gr)) b = b.concat(qualBlocks(sy, gr, page));
        else {
        b.push(H(3, 'The fault tree'));
        var K = root.SLCmaClaims, figs = [];
        if (page && K && K.figure) { var res = safe(function () { return K.figure(page.id + ':' + page.root.id, { page: page, noMarks: true, C: ctx.C, dark: ctx.dark, metrics: l.metricsOf(page), anchor: 'pssa-' + f, nodeG: function (id, inner, title) { return root.SLCcaReport.nodeG('pssa', id, inner, title); } }); }, null); if (res && res.parts) { var many = res.parts.length > 1; figs = res.parts.map(function (pt) { return { k: 'fig', name: 'tree-' + f + (many ? '-' + pt.letter : ''), title: fcName(gr) + ', fault tree as it stands in the tool, down to items' + (many ? ', part ' + pt.letter : ''), svg: pt.svg, w: pt.w, h: pt.h }; }); } }
        if (figs.length) { b.push(P((figs.length > 1 ? 'The figures below are' : 'The figure below is') + ' the fault tree for ' + f + ' as it stands in the tool, down to items, with the probability per flight (P), the rate per flight hour (λ) and the assurance level the tool allocated to each.')); figs.forEach(function (x) { b.push(x); }); }
        else b.push(P('The fault tree for ' + f + ' could not be drawn just now.'));
        b.push(H(3, 'What the tree says'));
        if (fx.singles) b.push(P(fx.singles.length ? 'A single failure can cause ' + f + ': ' + l.listJoin(fx.singles) + '.' : 'No single failure causes ' + f + '. It takes ' + fx.shortest + ' things together' + (fx.shortestEx.length ? ': ' + l.listJoin(fx.shortestEx) : '') + '.'));
        b.push(P(fx.ands && fx.ands.length ? 'The design rests on independence at ' + l.listJoin(fx.ands) + ': the result is only as good as the claim that what sits under each cannot fail together.' : 'The tree has no AND gate: no independence claim carries ' + f + '.'));
        var hid = hiddenOf(sy, gr);
        b.push(P(hid.length ? 'Some inputs sit unused until they are needed: ' + l.listJoin(hid.map(l.nodeName)) + '. If one has failed silently, the tree is thinner than it appears; how often each is checked decides how much it protects.' : 'No input of the tree is marked as a failure that could stay hidden.', q('hid')));
        b.push(H(3, 'The numbers'));
        b.push({ k: 'table', name: 'num-' + f, title: 'The numbers for ' + f, rows: [
            { Quantity: 'Budget', Value: fx.budget != null ? l.sci(fx.budget) + ' per flight hour' : 'Not set' },
            { Quantity: 'Hidden failures', Value: hid.length ? hid.map(function (n) { return l.nodeName(n) + (n.tau ? ': checked every ' + n.tau + ' hours' : ': check not set'); }).join('; ') : 'None marked' },
            { Quantity: 'Top event', Value: fx.rate != null ? l.sci(fx.rate) + ' per flight hour (' + l.sci(fx.pTop) + ' per flight)' : 'Not worked out' },
            { Quantity: 'Result', Value: fx.meets ? (fx.meets.pass ? 'Within the budget' : 'Above the budget') : 'Not worked out' }], lead: '{N} checks the tree against the budget.' });
        gateFlags(gr).spare.forEach(function (x) { b.push(P(x.name + ' uses ' + l.sci(x.used) + ' of its budget of ' + l.sci(x.budget) + ' per flight. ' + (x.reserve ? 'The rest is held as an allowance, by the engineer\'s decision.' : 'Every input under it is held tighter than its share (another tree needs it tighter, or its own class does), so nothing under it can use the rest.'))); });
        b.push(H(3, 'Items and their assurance levels'));
        var its = page ? items(page) : [];
        b.push(its.length ? { k: 'table', name: 'items-' + f, title: 'Items and their assurance levels for ' + f, q: q('dal'), rows: its.map(function (n) { var lvl = (n.type === 'gate' ? 'FDAL ' : 'IDAL ') + n.allocatedDAL; return { Item: l.T(n.name || ''), 'In the tree': S(n.displayId || n.id), Level: lvl, Why: n._dalPending ? 'Lower than the function\'s level because of independence: rests on a common mode analysis showing it (pending)' : rec.indep === 'no' ? 'No independence claim used: the function\'s level' : 'From the tree' }; }), lead: '{N} lists the assurance level the tool allocated to each item.' } : P('No assurance level is allocated in the tree for ' + f + ' yet.', q('dal')));
        b.push(H(3, 'Hidden failures and their checks'));
        b.push(hid.length ? { k: 'table', name: 'hid-' + f, title: 'Hidden failures and their checks for ' + f, q: q('hid'), rows: hid.map(function (n) { var every = n.tau && fx.hours && Math.abs(Number(n.tau) - fx.hours) < 1e-6; return { Item: l.nodeName(n), Check: n.tau ? (every ? 'Tested before every flight' : 'Checked every ' + n.tau + ' flight hours') : 'Not set yet', 'Candidate maintenance requirement': n.tau && !every ? 'Yes: a scheduled task' : n.tau ? 'No: a test before each flight' : 'To be decided' }; }), lead: '{N} lists each failure that could stay hidden and how often it is checked.' } : P('No failure in the tree for ' + f + ' could stay hidden.', q('hid')));
        b.push(H(3, 'Independence claims sent to the CMA'));
        var crit = fx.cg ? fx.cg.gates.filter(function (x) { return x.critical; }) : [];
        b.push(P(crit.length ? crit.map(function (x) { var rv = l.cmas().filter(function (c) { return arr(c.linkedGateIds).map(S).indexOf(S(x.key)) >= 0; }); return 'Gate ' + x.displayId + (x.name ? ' ' + l.T(x.name) : '') + ' carries the budget: ' + (rv.length ? 'its independence is shown in ' + rv.map(function (c) { return S(c.cmaId) + (c.subject ? ' ' + l.T(c.subject) : ''); }).join(', ') : 'it goes to the CMA Autopilot as a claim to show') + '.'; }).join(' ') : 'No gate of the tree carries the budget, so no independence claim goes to the CMA.'));
        }
        b.push(H(3, 'Requirements'));
        var rq = reqsFor(sy, gr), RT = root.SLReqTrace;
        if (!rq.length) b.push(P('AutoReq has no requirement for ' + f + ' yet.'));
        else {
            b.push(P('Generated by AutoReq from this analysis. These are the mitigations.'));
            var ents = reqEntries(rq);
            b.push({ k: 'table', name: 'req-' + f, title: 'Requirements for ' + f, q: q('req'), rows: ents.map(function (e) { return { ID: e.label, Requirement: l.T(e.r.text), Rationale: l.T(e.r.rat) || 'Rationale missing', 'Driven from': RT.drivenText(e.r), 'Written at': e.item ? 'Item' : 'System', 'Levels ticked': levelWords(e.x.levels) }; }), lead: '{N} lists every requirement for ' + f + ' at the levels ticked: for each type, the system requirement first, then those for each item, traced to it.' });
            if (reqEntries(rq).some(function (e) { return e.state !== 'in'; })) b.push(P('Requirements shown as New are not in the system requirements yet; they go in when accepted.'));
        }
        b.push(H(3, 'Path to compliance'));
        b.push(rq.length ? { k: 'table', name: 'path-' + f, title: 'How each requirement for ' + f + ' will be closed', rows: reqEntries(rq).map(function (e) { var x = e.x, c = l.CLOSE[x.type] || l.CLOSE.prob, cm = x.type === 'ind' ? (RT.drivenFrom(x.r).filter(function (d) { return d.what === 'Common mode analysis'; }).map(function (d) { return d.id; })[0] || 'A common mode analysis') : ''; var t0 = l.T(e.r.text); return { Requirement: e.label + ' ' + t0.slice(0, 90) + (t0.length > 90 ? '...' : ''), 'Closed by': c.how, In: cm || (x.type === 'crew' ? 'Human factors evaluation' : x.type === 'inst' ? 'ZSA and PRA' : 'SSA ' + l.T(sy.name || sy.id)) }; }), lead: '{N} is built from the requirements: ' + f + ' is shown when each is closed.' } : P('The path to compliance is built from the requirements, and there are none yet.'));
        return b;
    }
    function qualBlocks(sy, gr, page) {
        var l = L(), fc = gr.gov, f = fc.fcId, cp = fc.chartProps || {}, r0 = routeOf(gr), b = [];
        var why = l.rank(fc.severity) < l.SEV_RANK.Major ? 'it is Minor, and a Minor failure condition is assessed qualitatively'
            : r0 === 'similarity' ? 'the 1309 chart records it as similar to a design already shown in service'
            : cp.isSimpleConventional ? 'the 1309 chart records the design as simple and conventional'
            : (cp.isSimple && cp.isRedundant) ? 'the 1309 chart records the design as simple and redundant'
            : 'the 1309 chart sets a qualitative assessment for it';
        b.push(H(3, 'The qualitative assessment'));
        b.push(P(f + ' is assessed qualitatively because ' + why + '. No number is worked out for it; the argument below and the requirements after it carry the case.'));
        var cs = page ? l.cutsets(page) : null;
        if (cs) { var one = cs.filter(function (c) { return c.length === 1; }).map(function (c) { return l.nodeName(c[0]); }); b.push(P(one.length ? 'Its fault tree shows a single failure can cause it: ' + l.listJoin(one) + '.' : 'Its fault tree shows no single failure causes it.')); }
        b.push(P(r0 === 'similarity' ? 'It is shown by the service experience of the similar design and by showing the differences do not change the effect.' : 'It is shown by a design and installation appraisal of the ' + l.T(sy.name || sy.id) + ', its failure modes and effects, and the requirements below.'));
        return b;
    }
    // one appendix per function: the function, then each of its applicable failure conditions (worked out once per change)
    var _secMemo = { gen: -2, map: {} };
    function fnSection(sy, key, ctx) {
        var l = L(), G = memoGen(), k = S(sy.id) + '|' + key + '|' + (ctx.dark ? 1 : 0) + (ctx.forExport ? 1 : 0);
        if (_secMemo.gen !== G || G === -1) _secMemo = { gen: G, map: {} };
        if (_secMemo.map[k]) return _secMemo.map[k];
        var fi = fnInfo(sy, key), grs = fnGroups(sy, key), b = [H(2, 'The function')];
        b.push(P(fnTitle(fi) + (fi.def ? ': ' + l.lc(fi.def).replace(/\.$/, '') + '.' : '.') + (fi.kind === 'aircraft' ? ' It is an aircraft function, as the ' + l.T(sy.name || sy.id) + ' carries it' + (fi.carriers.length ? ' through ' + l.listJoin(fi.carriers.map(function (c) { return S(c.funcId) + ' ' + l.T(c.funcName || ''); })) : '') + '.' : '') + ' Its failure conditions with a safety effect: ' + l.listJoin(grs.map(function (gr) { return fcName(gr) + ' (' + S(gr.gov.severity) + ', ' + routeWords(gr) + ')'; })) + '.'));
        grs.forEach(function (gr) { b = b.concat(fcPart(sy, gr, ctx)); });
        _secMemo.map[k] = b;
        return b;
    }
    function section(sy, gr, ctx) { return fcPart(sy, gr, ctx); }
    // the section's blocks are a getter: worked out only when its appendix is drawn (the front lists the appendices only)
    function sections(ctx) {
        var sy = sysNow(); if (!sy || !L()) return [];
        return appendices(sy).map(function (key) {
            var fi = fnInfo(sy, key), o = { id: sid(key), title: fnTitle(fi), tabLabel: { id: key, name: fi.name }, edit: false }, cache = null;
            Object.defineProperty(o, 'blocks', { enumerable: true, get: function () { if (!cache) cache = fnSection(sy, key, ctx); return cache; } });
            return o;
        });
    }

    // ---- the left pane --------------------------------------------------------------------------------------------------
    var ui = { open: {} };
    function Q(q) { return root.SLAutopilotUI ? root.SLAutopilotUI.question(q, 'SLPssaAuto.ui.pick') : ''; }
    function card(qid, body, done) { return '<div class="paq-card' + (done ? ' done' : '') + '" data-paq="' + L().E(qid) + '">' + body + '</div>'; }
    function textBox(qid, label, val) { var E = L().E, id = 'psq-ta-' + qid.replace(/[^A-Za-z0-9_-]/g, '_'); return '<div class="paq-x">' + E(label) + '</div><textarea class="paq-ta" id="' + E(id) + '">' + E(val || '') + '</textarea><button type="button" class="paq-b on" onclick="SLPssaAuto.ui.text(' + L().J(qid) + ',' + L().J(id) + ')">Save</button>'; }
    function lvlButtons(t, cur, fnArg) {
        var l = L(), E = l.E, J = l.J, RT = root.SLReqTrace;
        return RT.PSSA_LEVELS.map(function (x) { var on = cur.indexOf(x) >= 0; return '<button type="button" role="checkbox" aria-checked="' + on + '" class="paq-b' + (on ? ' on' : '') + '" data-psq-lvl="' + E(t.id + ':' + x) + '" onclick="SLPssaAuto.ui.level(' + J(t.id) + ',' + J(x) + (fnArg != null ? ',' + J(fnArg) : '') + ')">' + (on ? '✓ ' : '') + E(x === 'system' ? 'Systems' : 'Items') + '</button>'; }).join('');
    }
    function leftFront(sy) {
        var l = L(), E = l.E, f = frontOf(sy), h = '', RT = root.SLReqTrace;
        h += '<div class="paq-h">The front of the report: ' + E(l.T(sy.name || sy.id)) + '</div><div class="paq-x">What the aircraft asks of this system arrives from the PASA. These answers write the front of the system\'s PSSA. Every function with a failure condition rated Minor or above has its own appendix; the 1309 chart decides quantitative or qualitative.</div>';
        h += card('pssa.scope', Q({ id: 'pssa.scope', text: 'What does this PSSA cover?', picked: f.scope || null, options: [{ id: 'all', label: 'Every function and failure condition in the system FHA', impact: 'The report says it covers the whole system FHA.' }, { id: 'part', label: 'Only part of it', impact: 'You say what is left out and why.' }] }) + (f.scope === 'part' ? textBox('pssa.scopeNote', 'What is left out, and why', f.scopeNote) : ''), !!f.scope);
        h += card('pssa.desc', Q({ id: 'pssa.desc', text: 'Is this the system the PSSA assesses?', why: 'From the project: ' + l.T(sy.name || sy.id) + ' and its functions.', picked: f.desc || null, options: [{ id: 'project', label: 'Yes, describe it from its functions', impact: 'The report names the system and what it does.' }, { id: 'own', label: 'I will write the description', impact: 'The report uses your words.' }] }) + (f.desc === 'own' ? textBox('pssa.descText', 'The system, in a few sentences', f.descText) : ''), !!f.desc);
        h += card('pssa.method', Q({ id: 'pssa.method', text: 'Which method and numbers does the PSSA use?', why: l.regulation() + ', objectives from ' + l.acRef() + '.', picked: f.method || null, options: [{ id: 'std', label: 'ARP4761A and ARP4754B, with the budgets the PASA hands down', impact: 'The report states the method.' }, { id: 'own', label: 'I will write the method', impact: 'The report uses your words.' }] }) + (f.method === 'own' ? textBox('pssa.methodText', 'The method', f.methodText) : ''), !!f.method);
        if (RT) {
            var lv = '<div class="slap-q">Where is each type of requirement written in this system?</div><div class="paq-x">Tick systems, items, or both: a requirement can be written at more than one level. A systems tick in the PASA starts this at systems. Systems takes the requirements written for the system; items takes those written for each item in the tree (its probability, check and assurance level), each traced to its system requirement.</div><table class="paq-t"><tbody>';
            RT.TYPES.forEach(function (t) { var cur = RT.pssaLevels(t.id, sy.id, null); lv += '<tr data-ccq-row="pssa.lvl.' + E(t.id) + '"><td><b>' + E(t.name) + '</b>' + (cur.from === 'pasa' ? '<div class="paq-x" style="margin:2px 0 0">From the PASA</div>' : '') + '</td><td style="white-space:nowrap">' + lvlButtons(t, cur.levels, null) + '</td></tr>'; });
            h += card('pssa.lvl', lv + '</tbody></table>', RT.TYPES.every(function (t) { return RT.pssaLevels(t.id, sy.id, null).levels.length > 0; }));
        }
        return h;
    }
    function leftFc(sy, gr) {
        var l = L(), E = l.E, J = l.J, f = gr.fcId, h = '', page = treeOf(gr), rec = fcRec(sy, f), q0 = isQuant(gr);
        h += '<div class="paq-h">' + E(fcName(gr)) + ' (' + E(gr.gov.severity) + ', ' + routeWords(gr) + ')</div>';
        var oi = openItems(sy, gr); if (oi.length) h += '<div class="paq-open" data-paq-openitems="1"><b>Open items</b><br>' + oi.map(E).join('<br>') + '</div>';
        if (!q0) { h += card('fc.' + f + '.gen', '<div class="slap-q">The qualitative assessment</div><div class="paq-x">Generated from the system FHA and its 1309 chart. Nothing to answer here.</div>', true); return h; }
        if (!page) return h;
        if (!built(gr)) { h += card('fc.' + f + '.gen', '<div class="slap-q">The fault tree</div><div class="paq-x">The fault tree for ' + E(f) + ' has not been created yet: it has its top event and nothing under it. Build it in the Fault trees tab; its questions appear here once it is.</div><button type="button" class="paq-b" onclick="SLPasaAuto.ui.openTree(' + J(page.id) + ')">Open the fault tree</button>', false); return h; }
        var fx = facts(sy, gr) || {};
        h += card('fc.' + f + '.gen', '<div class="slap-q">What the aircraft hands down, the tree, the numbers</div><div class="paq-x">Generated. Nothing to answer.</div><button type="button" class="paq-b" onclick="SLPasaAuto.ui.openTree(' + J(page.id) + ')">Open the fault tree</button>', true);
        if (andGates(page).length) {
            var lo = items(page).filter(function (n) { return n._dalPending; }).map(function (n) { return S(n.displayId) + ' at ' + (n.type === 'gate' ? 'FDAL ' : 'IDAL ') + n.allocatedDAL; });
            h += card('fc.' + f + '.dal', Q({ id: 'fc.' + f + '.dal', text: 'Use independence to set the item assurance levels?', why: 'The system function is FDAL ' + (fx.fdal || '?') + ' because ' + f + ' is ' + gr.gov.severity + '. ARP4754B allows the items under an AND gate to sit lower when they are shown to be independent.', picked: rec.indep || null, options: [{ id: 'yes', label: 'Yes: use the levels the tool allocated down the tree', impact: (lo.length ? 'Lower levels: ' + l.listJoin(lo) + '. ' : '') + 'Each lower level relies on a common mode analysis showing the inputs independent; the table marks them pending until it does.' }, { id: 'no', label: 'No: keep every item at FDAL ' + (fx.fdal || ''), impact: 'No independence claim used for the assurance levels: more development effort on every item. The common mode analysis is still needed for the probability.' }] }), !!rec.indep);
        }
        leaves(page).forEach(function (n) {
            var k = lidOf(n), st = rec.hid[k] || ((n.repairModel === 'periodic' || n.exposureMode === 'latent') ? 'hidden' : null), qid = 'fc.' + f + '.hid.' + k;
            h += card(qid, Q({ id: qid, text: 'Would ' + l.nodeName(n) + ' show itself when it fails?', why: 'A failure nobody would notice stays hidden until it matters; the tree then counts on a check to find it.', picked: st, options: [{ id: 'evident', label: 'Yes, it shows itself', impact: 'Nothing to check: its failure is noticed when it happens.' }, { id: 'hidden', label: 'No, it could stay hidden', impact: 'You set how often it is checked; the check becomes a requirement.' }] })
                + (st === 'hidden' ? '<div class="paq-x" style="margin-top:8px"><b>How often is it checked?</b></div><button type="button" class="paq-b' + (n.tau && fx.hours && Math.abs(Number(n.tau) - fx.hours) < 1e-6 ? ' on' : '') + '" onclick="SLPssaAuto.ui.check(' + J(f) + ',' + J(k) + ',\'flight\')">Tested before every flight</button>'
                    + '<span class="paq-x"> or every </span><input type="number" min="1" step="1" class="paq-sel" style="width:90px" id="psq-tau-' + E(f + '-' + k) + '" value="' + E(n.tau && !(fx.hours && Math.abs(Number(n.tau) - fx.hours) < 1e-6) ? n.tau : '') + '"> <span class="paq-x">flight hours</span> <button type="button" class="paq-b" onclick="SLPssaAuto.ui.check(' + J(f) + ',' + J(k) + ',\'hours\')">Save</button>' : ''), !!st && (st !== 'hidden' || !!n.tau));
        });
        return h;
    }
    function leftFn(sy, key) {
        var l = L(), E = l.E, J = l.J, fi = fnInfo(sy, key), grs = fnGroups(sy, key), RT = root.SLReqTrace, h = '';
        h += '<div class="paq-h">' + E(fnTitle(fi)) + '</div><div class="paq-x">' + E(grs.length === 1 ? 'One failure condition of this function has a safety effect.' : grs.length + ' failure conditions of this function have a safety effect.') + ' Each has its own questions below; what the project already holds is filled in and named.</div>';
        grs.forEach(function (gr) { h += '<div class="paq-fcblock" data-psq-fcblock="' + E(gr.fcId) + '">' + leftFc(sy, gr) + '</div>'; });
        if (RT) {
            var lv = '<div class="slap-q">Requirement levels for ' + E(key) + '</div><div class="paq-x">Ticked on the front of the report. Change one here only if this function needs it.</div><table class="paq-t"><tbody>';
            RT.TYPES.forEach(function (t) { var cur = RT.pssaLevels(t.id, sy.id, key), own = cur.from === 'function'; lv += '<tr><td>' + E(t.name) + (own ? ' (this function)' : '') + '</td><td style="white-space:nowrap">' + lvlButtons(t, cur.levels, key) + (own ? '<button type="button" class="paq-b" onclick="SLPssaAuto.ui.levelReset(' + J(t.id) + ',' + J(key) + ')">As the report</button>' : '') + '</td></tr>'; });
            var nNew = 0; grs.forEach(function (gr) { reqEntries(reqsFor(sy, gr)).forEach(function (e) { if (e.state !== 'in') nNew++; }); });
            lv += '</tbody></table>' + (nNew ? '<div style="margin-top:8px"><button type="button" class="paq-b on" data-psq-acceptreq="' + E(key) + '" onclick="SLPssaAuto.ui.acceptReqs(' + J(key) + ')">Put the new and changed requirements for ' + E(key) + ' in the system requirements</button></div>' : '<div class="paq-x" style="margin-top:6px">Every requirement for ' + E(key) + ' is in the system requirements.</div>');
            h += card('fn.' + key + '.req', lv, !nNew);
        }
        return h;
    }
    function renderQuestions(R, tabv) {
        var l = L(); if (!l) return ''; l.style();
        var sy = sysNow(); if (!sy) return '<div class="paq-x">Open a system to see its PSSA.</div>';
        var key = fnOfSid(R && R.partOf ? R.partOf(tabv) : null);
        if (key) return fnGroups(sy, key).length ? leftFn(sy, key) : '<div class="paq-x">This function has no failure condition with a safety effect now.</div>';
        return leftFront(sy);
    }

    // ---- answering --------------------------------------------------------------------------------------------------------
    function R0() { return root.SLCcaReport ? root.SLCcaReport.get('pssa') : null; }
    function done(qid) { var R = R0(); if (R) R.answered(qid); }
    function msg(t) { var R = R0(); if (R) { R.state.msg = { text: t, err: true }; R.render(); } }
    function pick(qid, opt) {
        var sy = sysNow(); if (!sy) return; var f0 = frontOf(sy), m;
        if (qid === 'pssa.scope') f0.scope = opt;
        else if (qid === 'pssa.desc') f0.desc = opt;
        else if (qid === 'pssa.method') f0.method = opt;
        else if ((m = /^fc\.([^.]+)\.dal$/.exec(qid))) { var gr = groupOf(sy, m[1]); if (gr) setIndep(sy, gr, opt === 'yes'); }
        else if ((m = /^fc\.([^.]+)\.hid\.(.+)$/.exec(qid))) {
            var gr2 = groupOf(sy, m[1]); if (!gr2) return; fcRec(sy, m[1]).hid[m[2]] = opt;
            if (opt === 'evident') { var page = treeOf(gr2); leaves(page).forEach(function (n) { if (lidOf(n) === m[2] && n.repairModel === 'periodic') { delete n.repairModel; delete n.tau; } }); }
        } else return;
        save(); done(qid);
    }
    function check(fcId, lid, how) {
        var sy = sysNow(), gr = sy ? groupOf(sy, fcId) : null; if (!gr) return;
        var fx = facts(sy, gr) || {}, page = treeOf(gr), tau = null;
        if (how === 'flight') tau = fx.hours || null;
        else { var el = typeof document !== 'undefined' ? document.getElementById('psq-tau-' + fcId + '-' + lid) : null; tau = el ? Number(el.value) : NaN; if (!(tau > 0)) return msg('Give the check interval in flight hours.'); }
        if (!tau) return msg('The average flight length is not known, so "before every flight" cannot be set. Give the interval in hours.');
        leaves(page).forEach(function (n) { if (lidOf(n) === lid) { n.repairModel = 'periodic'; n.tau = tau; } });
        fcRec(sy, fcId).hid[lid] = 'hidden';
        save(); done('fc.' + fcId + '.hid.' + lid);
    }
    function text(qid, elId) {
        var sy = sysNow(); if (!sy) return; var el = typeof document !== 'undefined' ? document.getElementById(elId) : null, v = el ? String(el.value || '').trim() : '', f0 = frontOf(sy);
        if (qid === 'pssa.scopeNote') f0.scopeNote = v; else if (qid === 'pssa.descText') f0.descText = v; else if (qid === 'pssa.methodText') f0.methodText = v; else return;
        save(); done(qid.replace(/Note$|Text$/, ''));
    }
    function level(type, lv, key) {
        var sy = sysNow(), RT = root.SLReqTrace; if (!sy || !RT) return;
        try { RT.toggleLevel(type, lv, key != null ? { sys: sy.id, fn: key } : { sys: sy.id }); } catch (e) { return msg(e.message); }
        save(); done(key != null ? 'fn.' + key + '.req' : 'pssa.lvl');
    }
    function levelReset(type, key) { var sy = sysNow(), RT = root.SLReqTrace; if (!sy || !RT) return; RT.setLevels(type, null, { sys: sy.id, fn: key }); save(); done('fn.' + key + '.req'); }
    // the system rows (ticked systems, or nothing decided yet) through AutoReq; the item rows after them, each traced to its
    // system requirement (parentReqId), updated in place when it is already in the register
    // the rows at the levels ticked, through AutoReq; then each item row traced to its system row (parentReqId)
    // a row can depend on another accepted in the same go (a check requirement names the row it checks): a second pass settles it
    function acceptReqs(key, again) {
        var sy = sysNow(), AR = g('AutoReq'), m = sy ? merge(sy) : null, RT = root.SLReqTrace; if (!sy || !AR || !m || !RT) return;
        var keep = [], kids = [];
        fnGroups(sy, key).forEach(function (gr) { reqsFor(sy, gr).forEach(function (x) { if (!x.on) return; keep.push(S(x.cand.reqSource.sourceId)); if (x.at === 'item' && x.parent) kids.push(x); }); });
        var sub = { scope: m.scope || ('sys-' + sy.id), isNew: arr(m.isNew).filter(function (c) { return keep.indexOf(S(c.reqSource.sourceId)) >= 0; }), isUpdated: arr(m.isUpdated).filter(function (u) { return keep.indexOf(S(u.next.reqSource.sourceId)) >= 0; }), unchanged: [], orphaned: [], migrations: [], migrationUnresolved: [] };
        try { if (sub.isNew.length || sub.isUpdated.length) AR.applyMerge(sub, { acceptNew: true, acceptUpdates: true, acceptOrphanRemoval: false }); } catch (e) { return msg('Not added: ' + (e && e.message || e)); }
        kids.forEach(function (x) { var c = stored(sy, x.cand.reqSource.sourceId), p = stored(sy, x.parent.cand.reqSource.sourceId); if (c && p) c.parentReqId = S(p.internalId); });
        _rq.k = ''; RT.ensureIds(); RT.syncLevels();
        if (!again && fnGroups(sy, key).some(function (gr) { return reqsFor(sy, gr).some(function (x) { return x.on && x.state !== 'in'; }); })) return acceptReqs(key, true);
        save(); done('fn.' + key + '.req');
    }

    // ---- outputs and acceptance (the old PSSA checklist) --------------------------------------------------------------------
    function fpOf(o) { try { return JSON.stringify(o); } catch (_) { return String(Math.random()); } }
    // rep: the report asked about ('sys:<id>'; the SSA reads a PSSA's acceptance this way), else the system on screen
    function outputs(rep) {
        var sy = rep && /^sys:/.test(S(rep)) ? L().sysById(S(rep).slice(4)) : sysNow(); if (!sy) return [];
        var pk = picks(sy);
        return [
            { id: 'trees', what: 'Each fault tree within the budget the aircraft hands down', accept: 'No appendix above its budget; the stricter budget applied where two are handed down', role: 'Safety analyst', fp: function () { return fpOf(pk.map(function (id) { var gr = groupOf(sy, id), fx = gr ? facts(sy, gr) : null; return fx ? [fx.rate, fx.budget] : null; })); } },
            { id: 'idal', what: 'Item assurance levels', accept: 'Every item in each tree has its level, with the independence each lower level rests on named', role: 'Development assurance lead', fp: function () { return fpOf(pk.map(function (id) { var gr = groupOf(sy, id), p = gr ? treeOf(gr) : null; return p ? items(p).map(function (n) { return n.id + n.allocatedDAL; }) : null; })); } },
            { id: 'latent', what: 'Hidden failures and their checks', accept: 'Every input answered; every hidden failure has its check, a candidate maintenance requirement where it is a scheduled task', role: 'Maintainability lead', fp: function () { return fpOf(pk.map(function (id) { return fcRec(sy, id).hid; })); } },
            { id: 'cma', what: 'Independence claims sent to the CMA', accept: 'Every gate the budget rests on has a common mode analysis', role: 'Chief safety engineer', fp: function () { return fpOf(pk); } },
            { id: 'req', what: 'The system requirements for each failure condition', accept: 'Every requirement AutoReq generates for an appendix is in the system requirements with its rationale and source', role: 'Requirements lead', fp: function () { return fpOf(pk.map(function (id) { var gr = groupOf(sy, id); return gr ? reqsFor(sy, gr).map(function (x) { return x.state + x.cand.reqSource.fingerprint; }) : null; })); } },
            { id: 'concl', what: 'The conclusions', accept: 'Each appendix and the report as a whole concluded, by the engineer or from an accepted AI draft', role: 'Chief safety engineer', fp: function () { return fpOf((pc() && pc().ccaReports && pc().ccaReports.pssa && pc().ccaReports.pssa.authored) || {}); } }
        ];
    }

    // ---- the frame ----------------------------------------------------------------------------------------------------------
    function define() {
        var CR = root.SLCcaReport; if (!CR || !L() || typeof document === 'undefined' || !document.getElementById('ws-view-pssa')) return null;
        return CR.define({
            key: 'pssa', viewId: 'ws-view-pssa', leftId: 'pssa-auto-host', title: 'Preliminary System Safety Assessment', code: 'PSSA',
            lead: 'One report per system: the front says what it covers, how it is done and what it found; each function of the system with a failure condition rated Minor or above has its own appendix holding all of those failure conditions. What the aircraft asks of this system arrives from the PASA.',
            appendices: true,
            tabs: { allLabel: false, parts: true, pickLabel: 'Part', frontLabel: 'Front of the report', noun: 'function', partLabel: function (s) { var sy = sysNow(), k = fnOfSid(s); return sy && k ? fnTitle(fnInfo(sy, k)) : S(s); } },
            reports: function () { var sy = sysNow(); if (!sy) return []; var code = root.SLReqTrace ? root.SLReqTrace.sysCode(sy) : S(sy.id); return [{ id: 'sys:' + S(sy.id), code: code, label: L().T(sy.name || sy.id), title: L().T(sy.name || sy.id), sections: appendices(sy).map(sid) }]; },
            front: front, after: after, sections: sections, renderQuestions: renderQuestions, outputs: outputs,
            authored: [{ id: 'conclusion', title: 'Conclusion', purpose: 'Whether the system as planned meets what is asked of each failure condition of this function, what that rests on, and what is still open.' }],
            reportAuthored: [{ id: 'conclusion', title: 'Conclusion', purpose: 'Whether the system as planned meets what the aircraft asks of it, what that rests on, and what is still open.' }],
            aiType: 'PSSA',
            aiReady: function (s) { var sy = sysNow(); if (!sy) return { ready: false, left: ['Open a system'] }; var k = fnOfSid(s); if (k) { var l0 = fnLeft(sy, k); return { ready: !l0.length, left: l0 }; } var l2 = frontLeft(sy).concat(appendices(sy).filter(function (x) { return fnLeft(sy, x).length; }).map(function (x) { return 'The questions of the appendix for ' + fnTitle(fnInfo(sy, x)); })); return { ready: !l2.length, left: l2 }; },
            io: { does: 'Works the budgets the aircraft hands down through the system\'s own fault trees to its items: what each item must promise, what must be checked, and which independence claims the CMA has to show.',
                inputs: [{ id: 'pasa', what: 'The budgets the PASA hands down', from: 'PASA', tab: 'pasa' }, { id: 'sfha', what: 'The system functional hazard assessment', from: 'SFHA', tab: 'sys-workspace' }, { id: 'trees', what: 'The system fault trees', from: 'Fault trees', tab: 'fta' }],
                outputs: [{ id: 'reqs', what: 'System requirements with their rationale and source', to: 'System requirements', tab: 'sys-workspace' }, { id: 'idal', what: 'Item assurance levels', to: 'Development assurance', tab: 'dal-ref' }, { id: 'claims', what: 'Independence claims to show', to: 'CMA', tab: 'cma' }] }
        });
    }
    (function boot(tries) { if (define()) return; if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { boot(tries - 1); }, 250); })(80);

    var api = { VERSION: VERSION, sysNow: sysNow, candidates: candidates, picks: picks, appendices: appendices, fnGroups: fnGroups, fnInfo: fnInfo, fnKey: fnKey, fnSection: fnSection, fnLeft: fnLeft, routeOf: routeOf, isQuant: isQuant, built: built, flowedIn: flowedIn, groupOf: groupOf, handedDown: handedDown, applies: applies, facts: facts, items: items, hiddenOf: hiddenOf, reqsFor: reqsFor, frontLeft: frontLeft, fcLeft: fcLeft, openItems: openItems, section: section, outputs: outputs, store: store,
        ui: { pick: pick, check: check, text: text, level: level, levelReset: levelReset, acceptReqs: acceptReqs } };
    try { root.SLPssaAuto = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

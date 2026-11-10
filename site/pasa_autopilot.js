// pasa_autopilot.js (SLPasaAuto v2.2, 11 Nov 2026): the PASA Autopilot. One Preliminary Aircraft Safety Assessment for the
// aircraft: the front of the report (scope, the aircraft, the method, the failure conditions, the requirement levels, what
// the appendices found, the conclusion) and one appendix per aircraft function, holding every failure condition of that
// function rated Minor or above.
//
// v2.1 (Waqas, 11 Nov 2026): "why are building the fault trees rather than just saying fault trees have not been created yet?";
//   "we should ask the user if that failure condition's fault tree ready to be linked or not in the auto pilot". The tool no
//   longer builds a tree's inputs (fc_auto_trees.js v2.0). For each system failure condition traced to an aircraft one the
//   Autopilot asks "Is its fault tree ready to be linked into this tree?": Yes links it as the ONE shared node of that system
//   failure condition (SLFcTrees.link), so the fault tree module's own rule keeps its strictest allocation in every tree; Not
//   yet leaves it out and the report says so. A tree with nothing built under its top reads "has not been created yet": no
//   picture, no numbers. The interdependence table and the tree are checked against each other both ways, and a gate the
//   tool rebalanced, or one whose inputs take more than its budget, is an open item.
//
// v2.0 (Waqas, 10 Nov 2026, after v1):
//   "instead of each failure condition getting an appendix we should go with each function getting an appendix too", "each
//    appendix containing all its applicable failure conditions". No picking: every function with a failure condition rated
//    Minor or above gets an appendix; No Safety Effect failure conditions are in the register only.
//   "I need every failure condition major and above we have the charting AFHA can determine where we need qualitative vs
//    quantitative assessments, even minor ones need qualitative assessment". Minor is qualitative; the 1309 chart routes Major
//    and above; a chart not answered stays quantitative and is an open item.
//   "requirements can be driven at multiple levels, why are we only allowing them to select one"; "at the aircraft level the
//    options should only be aircraft, and/or systems". Levels are ticked per requirement type, with an override per function;
//    a "systems" tick flows the requirement down into the register of each system that feeds the failure condition, linked
//    to its parent (req_trace.js flowDown).
//   "the performance is very slow": the report pane shows the front only, with a list of the appendices; each appendix is
//    built when its tab is opened, and memoized per data generation.
//
// Waqas, 10 Nov 2026 (the brief, the mockups and the rulings after them):
//   "Drop downs to select failure conditions for the PASA one report for the aircraft with each failure condition feeding in
//    as an appendix (aircraft level cover page then meat in the appendices)"; "we need to ask them questions to fill out the
//    front of the reports too"; "appendices for Major and above, and the worst case scenario for each condition for which the
//    fault tree was generated" (the governing row: fc_auto_trees.js picks the worst severity, then the longest exposure).
//   Each appendix, in order: what is being evaluated; the AFHA entry; how the systems feed it (interdependence); the resources
//   they share (common resources); CoFFE only if the engineer does one; the fault tree as the tool draws it (the integrated
//   tree, editor chrome stripped); what the tree says; the numbers; the requirements AutoReq generates (these are the
//   mitigations: no mitigations box); the path to compliance built from those requirements; the conclusion.
//   "PASA interdependence cant be pre-fed if we are not using AI, the user will have to use an interdependence table it will
//    just be a part of the PASA questionaire for that failure condition"; "existing work should auto populate, new work
//    should be hand checked or AI drafted with architectural inputs"; "shared resources will be treated the same way".
//   A system that feeds a failure condition with nothing traced is a question: trace one of its failure conditions, or exclude
//   it with a reason. Each shared resource is a question about where it is dispositioned. CoFFE is "do one?", then its cases.
//   Requirement levels are asked once per requirement type (req_trace.js), with an override per function (v2.0).
//   Do not ask about architecture, protections or budget splits: they come from the model and the trees.
//   The old completion checklist becomes the Autopilot's progress and its Outputs and acceptance; over-committed budgets and
//   unreviewed items show as open questions. Same AI drafting (only once the questions are answered) and live comments.
//
// The frame is cca_report.js 2.1 (spec.appendices, tabs.parts, spec.reportAuthored). What this module keeps:
//   projectConfig.pasaAuto = { front: { scope, scopeNote, desc, descText, method, methodText, units },
//     fc: { <fcId>: { ex: { <sysId>: { why, by, at } }, res: { <resKey>: { where, why, by, at } } } } }
// Everything else is written where it already lives: the interdependence cells (projectConfig.interdep), the SFHA rows'
// acTrace, the CoFFE verdicts (projectConfig.coffe), the CoFFE choice (safetyProgramPlan.slots.combinedEffects), the
// requirement levels (projectConfig.reqLevels, req_trace.js) and the registers (AutoReq.applyMerge). No duplicate rows.
// Every number comes from SLTopBasis and the trees. window.SLPasaAuto.
(function (root) {
    'use strict';
    var VERSION = '2.2';   // 2.2 11 Nov 2026: a gate whose inputs are all held tighter than their shares says what they use of its budget
    function g(n) { try { if (root.SLEnv && root.SLEnv.get) { var v = root.SLEnv.get(n); if (v !== undefined) return v; } } catch (_) {} try { return root[n]; } catch (_) { return undefined; } }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function S(v) { return v == null ? '' : String(v); }
    function T(v) { return S(v).replace(/\s*\u2014\s*/g, '; ').replace(/\s+/g, ' ').trim(); }
    function E(s) { return S(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function J(v) { return E(JSON.stringify(v)); }
    function safe(f, d) { try { var v = f(); return v === undefined ? d : v; } catch (_) { return d; } }
    function pc() { var p = g('projectConfig'); return p && typeof p === 'object' ? p : null; }
    function now() { return new Date().toISOString(); }
    function who() { return root.SLAutopilotUI ? root.SLAutopilotUI.who() : 'Engineer'; }
    function save() { try { if (root.SLDataChange && root.SLDataChange.bump) root.SLDataChange.bump(); } catch (_) {} if (root.SLAutopilotUI) root.SLAutopilotUI.save(); else { try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {} } }
    function fail(m) { var e = new Error(m); e.userFacing = true; return e; }
    function listJoin(a) { a = a.filter(Boolean); return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    function lc(s) { s = S(s); return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); }
    function call(name) { var f = root[name]; if (typeof f !== 'function') return undefined; var a = Array.prototype.slice.call(arguments, 1); try { return f.apply(root, a); } catch (_) { return undefined; } }
    var SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    function sci(v) {
        v = Number(v); if (!isFinite(v)) return 'not worked out';
        if (v === 0) return '0';
        if (v >= 0.01 && v < 1000) return String(Number(v.toPrecision(2)));
        var e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e); if (Number(m.toFixed(1)) >= 10) { m /= 10; e += 1; }
        return m.toFixed(1) + ' × 10' + String(e).split('').map(function (c) { return SUP[c] || c; }).join('');
    }
    var SEV_RANK = { 'No Safety Effect': 0, Minor: 1, Major: 2, Hazardous: 3, Catastrophic: 4 };
    function rank(s) { return SEV_RANK[S(s)] != null ? SEV_RANK[S(s)] : -1; }
    var SEV_WORDS = { Catastrophic: 'extremely improbable', Hazardous: 'extremely remote', Major: 'remote', Minor: 'probable' };

    // ---- the store --------------------------------------------------------------------------------------------------
    function store() {
        var p = pc(); if (!p) return { front: {}, fc: {} };
        if (!p.pasaAuto || typeof p.pasaAuto !== 'object') p.pasaAuto = {};
        var s0 = p.pasaAuto; if (!s0.front || typeof s0.front !== 'object') s0.front = {}; if (!s0.fc || typeof s0.fc !== 'object') s0.fc = {};
        return s0;
    }
    function fcStore(fcId) { var s0 = store(); var m = s0.fc[fcId]; if (!m || typeof m !== 'object') m = s0.fc[fcId] = {}; if (!m.ex) m.ex = {}; if (!m.res) m.res = {}; return m; }

    // ---- the failure conditions: the governing row of each, Major and above, with its generated tree ---------------------
    function Tr() { return root.SLFcTrees || null; }
    function groups() { var F = Tr(); return F ? (safe(function () { return F.groups('ac'); }, []) || []) : []; }
    function treeOf(gr) { var F = Tr(); return F && gr ? safe(function () { return F.treeFor(gr); }, null) : null; }
    // v2.0 (10 Nov 2026): Waqas: "instead of each failure condition getting an appendix we should go with each function getting
    // an appendix", "each appendix containing all its applicable failure conditions"; every failure condition rated Minor or
    // above (the governing row, its worst case) is applicable, with no picking; the 1309 chart decides qualitative or
    // quantitative ("we have the charting AFHA can determine where we need qualitative vs quantitative assessments, even minor
    // ones need qualitative assessment"). A function whose failure conditions are all No Safety Effect is in the register only.
    function applicable(gr) { return !!(gr && gr.fcId && rank(gr.gov.severity) >= SEV_RANK.Minor); }
    function candidates() { return groups().filter(applicable); }
    function groupOf(fcId) { return groups().filter(function (gr) { return gr.fcId === S(fcId); })[0] || null; }
    function functions() {
        var seen = {}, out = [], fns = arr(g('acFunctionsData'));
        fns.forEach(function (f) { if (!f || f.subId == null || seen[S(f.subId)]) return; seen[S(f.subId)] = 1; out.push({ id: S(f.subId), name: T(f.subName || f.funcName || ''), def: T(f.subDef || f.funcDef || ''), parent: T(f.funcName || '') }); });
        groups().forEach(function (gr) { var k = S(gr.gov.subId); if (k && !seen[k]) { seen[k] = 1; out.push({ id: k, name: '', def: '', parent: '' }); } });
        return out;
    }
    function fnOf(id) { return functions().filter(function (f) { return f.id === S(id); })[0] || null; }
    function fnGroups(id) { return candidates().filter(function (gr) { return S(gr.gov.subId) === S(id); }); }
    // the appendices: every function with an applicable failure condition, in the AFHA's own order
    function appendices() { return functions().filter(function (f) { return fnGroups(f.id).length > 0; }).map(function (f) { return f.id; }); }
    function picks() { return candidates().map(function (gr) { return gr.fcId; }); }
    function sid(fnId) { return 'fn:' + fnId; }
    function fnOfSid(x) { return S(x).indexOf('fn:') === 0 ? S(x).slice(3) : null; }
    function fnTitle(f) { return f ? f.id + (f.name ? ' ' + f.name : '') : ''; }
    // quantitative or qualitative, from the 1309 chart (fc_auto_trees route): Minor is always qualitative; a chart not answered
    // stays quantitative and is an open item
    function routeOf(gr) {
        if (rank(gr.gov.severity) < SEV_RANK.Major) return 'qual';
        var r = Tr() ? safe(function () { return Tr().route(gr.gov); }, 'quant') : 'quant';
        return r === 'qual' || r === 'similarity' ? (r === 'similarity' ? 'similarity' : 'qual') : r === 'unanswered' ? 'unanswered' : 'quant';
    }
    function isQuant(gr) { var r = routeOf(gr); return r === 'quant' || r === 'unanswered'; }
    function fcName(gr) { return gr ? gr.fcId + ' ' + T(gr.gov.fcDesc || '') : ''; }
    function systems() { return arr(g('systemsData')).filter(function (s) { return s && s.id != null; }); }
    function sysById(id) { return systems().filter(function (s) { return S(s.id) === S(id); })[0] || null; }
    function sysName(id) { var s = sysById(id); return s ? T(s.name || s.id) : S(id); }
    function target(sev) { var t = call('getSafetyTarget', sev); return t && typeof t === 'object' ? t : { prob: null, dal: null }; }
    function fnName(subId) { var f = arr(g('acFunctionsData')).filter(function (x) { return x && S(x.subId) === S(subId); })[0]; return f ? T(f.subName || f.funcName || '') : ''; }

    // ---- interdependence: one failure condition against every system function --------------------------------------
    function cols() { return safe(function () { return root.idpColumns ? root.idpColumns() : (typeof idpColumns === 'function' ? idpColumns() : []); }, []) || []; }   // eslint-disable-line no-undef
    function cellRaw(fc, colId) { return safe(function () { return (root._idpCellRaw || _idpCellRaw)(fc, colId); }, { state: 'unreviewed' }); }   // eslint-disable-line no-undef
    function cellKey(fc, colId) { return S(fc.internalId) + '§' + S(colId); }
    function idpStore() { var p = pc(); if (!p.interdep) p.interdep = { cells: {}, cra: {} }; if (!p.interdep.cells) p.interdep.cells = {}; return p.interdep; }
    // one row per system: its function columns (the system-level column only where the tool keeps one), each cell resolved
    function idpRows(gr) {
        var fc = gr.gov, by = {}, out = [];
        cols().filter(function (c) { return !c.legacy || cellRaw(fc, c.colId).state !== 'unreviewed'; }).forEach(function (c) {
            var r = by[c.sysId]; if (!r) { r = by[c.sysId] = { sysId: c.sysId, sysName: T(c.sysName || sysName(c.sysId)), cells: [] }; out.push(r); }
            r.cells.push({ colId: c.colId, fn: T(c.fnName || ''), legacy: !!c.legacy, cell: cellRaw(fc, c.colId) });
        });
        out.forEach(function (r) {
            var st = r.cells.map(function (x) { return x.cell.state; });
            r.state = st.indexOf('contributes') >= 0 ? 'feeds' : st.indexOf('proposed') >= 0 ? 'proposed' : st.indexOf('unreviewed') >= 0 ? 'open' : 'clear';
            r.feeds = r.cells.filter(function (x) { return x.cell.state === 'contributes'; });
        });
        return out;
    }
    function howWords(x) {
        var c = x.cell || {};
        if (c.kind === 'asserted') return c.why && c.why !== 'asserted' ? T(c.why) : 'Its function ' + x.fn + ' feeds it (confirmed by the engineer)';
        if (c.kind === 'implements') return 'Its function ' + x.fn + ' carries out the aircraft function';
        if (c.kind === 'resource') return T(String(c.why || '').replace(/\s*\u2014\s*declare the provider FUNCTION to refine.*$/i, '')).replace(/^provides /, 'It provides ');
        if (c.kind === 'sfha') return 'One of its failure conditions is traced to it';
        return T(c.why || '');
    }
    function basisWords(x) {
        var c = x.cell || {};
        if (c.kind === 'asserted') return 'Confirmed by the engineer';
        if (c.kind === 'implements' || c.kind === 'resource' || c.kind === 'sfha') return 'From the architecture';
        return '';
    }
    // the SFHA failure conditions of a system traced to this aircraft failure condition (by FC ID or internal ID)
    function traceList(v) { return S(v).split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean); }
    function tracedFrom(gr, sysId) {
        var keys = [gr.fcId].concat(gr.rows.map(function (r) { return S(r.internalId); })), sy = sysById(sysId), F = Tr();
        if (!sy || !F) return [];
        return (safe(function () { return F.groups(sy); }, []) || []).filter(function (sg) { return sg.rows.some(function (r) { return traceList(r.acTrace).concat(arr(r.acTraces).map(S)).some(function (t) { return keys.indexOf(t) >= 0; }); }); });
    }
    function sysGroups(sysId) { var sy = sysById(sysId), F = Tr(); return sy && F ? (safe(function () { return F.groups(sy); }, []) || []) : []; }
    // the systems that feed it with nothing traced and no reason recorded: the open findings
    function untraced(gr) {
        var ex = fcStore(gr.fcId).ex;
        return idpRows(gr).filter(function (r) { return r.state === 'feeds' && !tracedFrom(gr, r.sysId).length; }).map(function (r) { return { row: r, ex: ex[r.sysId] || null }; });
    }

    // ---- linking the system trees in (v2.1) ---------------------------------------------------------------------------
    // true when something is built under the top of the failure condition's tree (a tree made by the tool is its top only)
    function built(gr) { var p = treeOf(gr), F = Tr(); return !!(p && p.root && (F && F.built ? F.built(p) : kids(p.root).length > 0)); }
    function linkKey(c) { return S(c.sysId) + '\u00A7' + S(c.fcId); }
    // every system failure condition traced to this one, from a system that feeds it: linked or not, and how
    function linkCands(gr) {
        var page = treeOf(gr), F = Tr(), out = [], st = fcStore(gr.fcId), ex = st.ex; if (!st.link) st.link = {};
        idpRows(gr).filter(function (r) { return r.state === 'feeds' && !ex[r.sysId]; }).forEach(function (r) {
            tracedFrom(gr, r.sysId).forEach(function (sg) {
                var c = { sysId: S(r.sysId), fcId: sg.fcId, sg: sg, name: r.sysName + ': ' + T(sg.gov.fcDesc || sg.fcId), label: sg.fcId + ' ' + T(sg.gov.fcDesc || '') + ' (' + r.sysName + ')' };
                c.key = linkKey(c); c.tree = treeOf(sg); c.treeBuilt = !!(c.tree && F && F.built && F.built(c.tree));
                var viaNode = !!(page && F && F.linked && F.linked(page, { sysId: c.sysId, fcId: c.fcId })), viaXfer = false;
                if (page && c.tree) walk(page.root, function (n) { if (S(n.transferOutTo || n.linkedPageId || '') === S(c.tree.id)) viaXfer = true; });
                c.via = viaNode ? 'node' : viaXfer ? 'transfer' : null; c.linked = !!c.via;
                c.answer = c.linked ? 'yes' : (st.link[c.key] === 'no' ? 'no' : null);
                out.push(c);
            });
        });
        return out;
    }
    // gates of the tree the tool rebalanced and nobody has accepted yet, and gates whose inputs take more than their budget
    function gateFlags(gr) {
        var page = treeOf(gr), out = { rebalanced: [], over: [], spare: [] }; if (!page || !page.root) return out;
        walk(page.root, function (n) { var m = n._budgetMargin; if (!m) return; if (m.state === 'rebalanced') out.rebalanced.push(nodeName(n)); else if (m.state === 'over-committed') out.over.push(nodeName(n)); else if (m.state === 'spare-held' || m.state === 'reserve') out.spare.push({ name: nodeName(n), used: m.achieved, budget: m.target, reserve: m.state === 'reserve' }); });
        return out;
    }

    // ---- shared resources ---------------------------------------------------------------------------------------------
    var COMMON = [
        { key: 'env', name: 'Environment', what: 'Lightning, ice, bird strike, fire, fluids and heat in the same place' },
        { key: 'mx', name: 'Maintenance', what: 'The same task done on several items in one visit, by the same people' },
        { key: 'des', name: 'Design', what: 'The same equipment type, the same software, the same requirement error' }
    ];
    function feeders(gr) { return idpRows(gr).filter(function (r) { return r.state === 'feeds'; }).map(function (r) { return S(r.sysId); }); }
    function resources(gr) {
        var fs = feeders(gr), sub = S(gr.gov.subId), out = [];
        arr(g('resourcesData')).forEach(function (r) {
            if (!r) return;
            var users = arr(r.consumedBySystems).map(S).concat(arr(r.providedBy).map(S)).filter(function (x, i, a) { return a.indexOf(x) === i; });
            var hits = users.filter(function (x) { return fs.indexOf(x) >= 0; });
            if (!hits.length && arr(r.consumedBy).map(S).indexOf(sub) < 0) return;
            out.push({ key: 'res:' + S(r.internalId || r.resId), id: S(r.resId || ''), name: T(r.name || r.resId), shared: users.map(sysName), kind: 'resource' });
        });
        var andGates = critGates(gr).length > 0 || fs.length > 1;
        if (andGates) COMMON.forEach(function (c) { out.push({ key: 'cc:' + c.key, id: '', name: c.name + ': ' + lc(c.what), shared: fs.map(sysName), kind: 'common' }); });
        return out;
    }
    function cmas() { return arr(g('cmaData')).filter(function (c) { return c && !c.suggested; }); }
    function cmaLabel(c) { return S(c.cmaId || ('CMA ' + c.internalId)) + (c.subject ? ' ' + T(c.subject) : ''); }
    function resWhere(gr, r) { return fcStore(gr.fcId).res[r.key] || null; }
    function whereWords(w) {
        if (!w) return 'Not decided yet';
        if (/^cma:/.test(w.where)) { var c = cmas().filter(function (x) { return S(x.internalId) === w.where.slice(4); })[0]; return c ? cmaLabel(c) : 'A common mode analysis no longer in the project'; }
        if (w.where === 'pra') return 'The particular risk assessment';
        if (w.where === 'zsa') return 'The zonal safety analysis';
        if (w.where === 'new') return 'A new common mode review (to be opened)';
        if (w.where === 'none') return 'Cannot defeat an independence here: ' + T(w.why || '');
        return 'Not decided yet';
    }
    // the CMA that already reviews a gate of this tree (a suggestion only: the engineer confirms)
    function suggestCma(gr) {
        var keys = critGates(gr).map(function (x) { return x.key; });
        return cmas().filter(function (c) { return arr(c.linkedGateIds).map(S).some(function (k) { return keys.indexOf(k) >= 0; }); })[0] || null;
    }

    // ---- CoFFE ----------------------------------------------------------------------------------------------------------
    function coffeOn() { var p = pc(), sl = p && p.safetyProgramPlan && p.safetyProgramPlan.slots; var v = sl ? sl.combinedEffects : null; return v === 1 || v === 2 ? true : v === 0 ? false : null; }
    function coffeCasesOf(gr) { return safe(function () { return (root.coffeCases || coffeCases)(gr.gov) || []; }, []) || []; }   // eslint-disable-line no-undef
    function coffeVerdictOf(gr, k) { var p = pc(), v = p && p.coffe && p.coffe.verdicts ? p.coffe.verdicts[S(gr.gov.internalId) + '§' + k.key] : null; if (v) return { v: v.verdict, src: 'person' }; var cmp = safe(function () { return (root.coffeComputed || coffeComputed)(gr.gov, k); }, null); if (cmp && (cmp === 'yes' || cmp === 'no' || cmp.verdict)) return { v: cmp.verdict || cmp, src: 'mac' }; return null; }   // eslint-disable-line no-undef
    var STATE_WORD = { 'total loss': 'total loss', malfunction: 'malfunction' };
    function caseWords(k) { return k.parts.map(function (p) { return sysName(p.sysId) + ' ' + (STATE_WORD[p.state] || p.state); }).join(' together with '); }

    // ---- the tree, its picture, its numbers ---------------------------------------------------------------------------
    function TB() { return root.SLTopBasis || null; }
    function pageOf(gr) { return treeOf(gr); }
    function integrated(page) {
        var I = root.SLFtaIntegrated; if (!page || !I || typeof I.build !== 'function') return page;
        var tmp = { id: 'pasa-int-' + page.id, name: page.name, integrated: { sourcePageId: page.id }, root: null };
        safe(function () { I.build(tmp); }, null);
        return tmp.root ? tmp : page;
    }
    function kids(n) { return n ? (n.children || n._children || []) : []; }
    function walk(n, f, d) { if (!n) return; f(n, d || 0); kids(n).forEach(function (k) { walk(k, f, (d || 0) + 1); }); }
    function nodeName(n) { return T((n.displayId || ('#' + n.id)) + (n.name ? ' ' + n.name : '')); }
    var _cg = { gen: -2, map: {} };
    function memoGen() { var dc = root.SLDataChange; return dc && dc.gen ? dc.gen() : -1; }
    function cgOf(page) {
        var G = memoGen(); if (_cg.gen !== G || G === -1) { _cg = { gen: G, map: {} }; }
        if (!_cg.map[page.id]) _cg.map[page.id] = safe(function () { return root.SLCriticalGates.analyzePage(page); }, null);
        return _cg.map[page.id];
    }
    function critGates(gr) { var p = pageOf(gr); var r = p ? cgOf(p) : null; return r ? r.gates.filter(function (x) { return x.critical; }) : []; }
    function cutsets(page) {
        var Eng = root.SLFTAEngine; if (!Eng || !page || !page.root) return null;
        return safe(function () { return Eng.minimalCutsets(Eng.getCutsets(page.root)); }, null);
    }
    // 11 Nov 2026: the numbers in a tree are whatever its last allocation left there. Before any tree is read for a report the
    // project-wide allocation runs once per change (every tree its budget over the flight, every shared node at its strictest),
    // so the report never shows a tree as it stood before a link, or as whichever tree was opened last left it.
    var _al = { gen: -2 };
    function allocated() { var G = memoGen(); if (_al.gen === G && G !== -1) return; _al.gen = G; try { if (root.SLFcTrees && root.SLFcTrees.sweep) root.SLFcTrees.sweep({ quiet: true, noAsk: true }); } catch (_) {} try { if (typeof root._slSharedStrictestRound === 'function') root._slSharedStrictestRound(); } catch (_) {} _al.gen = memoGen(); }
    function treeFacts(gr) {
        allocated();
        var page = pageOf(gr); if (!page) return null;
        var full = integrated(page), cs = cutsets(page), out = { page: page, full: full };
        out.singles = cs ? cs.filter(function (c) { return c.length === 1; }).map(function (c) { return nodeName(c[0]); }) : null;
        out.shortest = cs && cs.length ? cs.reduce(function (m, c) { return Math.min(m, c.length); }, 1e9) : null;
        out.shortestEx = cs ? (cs.filter(function (c) { return c.length === out.shortest; })[0] || []).map(nodeName) : [];
        var ands = [], hidden = [], seen = {}, rep = {};
        walk(full.root, function (n) {
            if (n.type === 'gate' && /^(AND|INHIBIT|PAND|SPARE|SEQ|VOTING)$/.test(S(n.gateType)) && kids(n).length > 1) ands.push(nodeName(n));
            if (n.type !== 'gate') {
                if (n.exposureMode === 'latent' || n.repairModel === 'periodic' || n.dormancyInterval) hidden.push({ name: nodeName(n), tau: n.tau || n.dormancyInterval || null });
                var lid = S(n.logicalId != null ? n.logicalId : '');
                if (lid) { rep[lid] = rep[lid] || { name: nodeName(n), n: 0 }; rep[lid].n++; }
            }
        });
        out.ands = ands.filter(function (x, i, a) { return a.indexOf(x) === i; });
        out.hidden = hidden.filter(function (x) { if (seen[x.name]) return false; seen[x.name] = 1; return true; });
        out.repeated = Object.keys(rep).filter(function (k) { return rep[k].n > 1; }).map(function (k) { return rep[k].name; });
        var B = TB();
        out.hours = B ? safe(function () { return B.missionHours(page).hours; }, null) : null;
        out.pTop = B ? safe(function () { return B.exactTop(page.root); }, null) : null;
        out.rate = out.pTop != null && B ? safe(function () { return B.perFlightHour(out.pTop, page).rate; }, null) : null;
        var t = target(gr.gov.severity); out.objective = t.prob; out.fdal = t.dal;
        out.meets = out.pTop != null && t.prob != null && B ? safe(function () { return B.meets(out.pTop, t.prob, page); }, null) : null;
        out.handed = kids(page.root).map(function (k) { var p = Number(k.probability); return { name: nodeName(k), p: isFinite(p) ? p : null, rate: isFinite(p) && B ? safe(function () { return B.perFlightHour(p, page).rate; }, null) : null }; });
        out.cg = cgOf(page);
        return out;
    }
    function metricsOf(page) {
        var B = TB();
        return function (n) { var p = Number(n.probability); if (!isFinite(p) || p <= 0) return ''; var r = B ? safe(function () { return B.perFlightHour(p, page).rate; }, null) : null; return 'P ' + p.toExponential(1) + (r != null ? '  λ ' + r.toExponential(1) : ''); };
    }
    function treeFigures(gr, ctx) {
        var page = pageOf(gr), K = root.SLCmaClaims; if (!page || !K || typeof K.figure !== 'function') return [];
        var full = integrated(page);
        var res = safe(function () { return K.figure(full.id + ':' + full.root.id, { page: full, noMarks: true, C: ctx.C, dark: ctx.dark, metrics: metricsOf(page), anchor: 'pasa-' + gr.fcId, nodeG: function (id, inner, title) { return root.SLCcaReport.nodeG('pasa', id, inner, title); } }); }, null);
        if (!res || !res.parts || !res.parts.length) return [];
        var many = res.parts.length > 1;
        return res.parts.map(function (pt) { return { k: 'fig', name: 'tree-' + gr.fcId + (many ? '-' + pt.letter : ''), title: fcName(gr) + ', fault tree as it stands in the tool' + (full !== page ? ' with the system trees drawn in' : '') + (many ? ', part ' + pt.letter : ''), svg: pt.svg, w: pt.w, h: pt.h }; });
    }

    // ---- requirements: AutoReq for this failure condition ----------------------------------------------------------------
    var _rq = { gen: -2, merge: null };
    function merge() {
        var G = memoGen(); if (_rq.gen === G && G !== -1 && _rq.merge) return _rq.merge;
        var AR = g('AutoReq'); var m = AR ? safe(function () { return AR.generate(undefined, 'ac'); }, null) : null;
        _rq = { gen: G, merge: m }; return m;
    }
    function stored(sourceId) { return arr(g('acReqData')).filter(function (r) { return r && r.reqSource && S(r.reqSource.sourceId) === S(sourceId) && !r.deleted; })[0] || null; }
    function reqsFor(gr) {
        var m = merge(), RT = root.SLReqTrace; if (!m || !RT) return [];
        var list = [];
        arr(m.isNew).forEach(function (c) { list.push({ cand: c, row: null, state: 'new' }); });
        arr(m.isUpdated).forEach(function (u) { list.push({ cand: u.next, row: stored(u.next.reqSource.sourceId), state: 'changed' }); });
        arr(m.unchanged).forEach(function (u) { list.push({ cand: u.next, row: stored(u.next.reqSource.sourceId), state: 'in' }); });
        // only what this failure condition's own generated tree drives (another tree linked to the same failure condition, such as
        // an MF&MS tree seeded from the interdependence table, has its own place: the appendix never lists the same promise twice)
        var pid = S((pageOf(gr) || {}).id);
        return list.filter(function (x) { var d = RT.drivenFrom(x.row || x.cand); if (!d.some(function (e) { return /^Aircraft failure condition$/.test(e.what) && e.id === gr.fcId; })) return false; var trees = d.filter(function (e) { return /^fta:/.test(e.tab || '') && (e.what === 'Gate' || e.what === 'Event'); }); return !trees.length || trees.some(function (e) { return e.tab.split(':')[1] === pid; }); })
            .map(function (x) { var r = x.row || x.cand, t = RT.typeOf(r), lv = RT.pasaLevels(t, gr.gov.subId).levels; return { r: r, cand: x.cand, state: x.state, type: t, levels: lv, aircraft: lv.indexOf('aircraft') >= 0, flows: lv.indexOf('system') >= 0 ? flowsFor(gr, x.cand) : [] }; })
            .sort(function (a, b) { var o = RT.TYPES.map(function (t) { return t.id; }); return o.indexOf(a.type) - o.indexOf(b.type); });
    }
    function reqLabel(x) { return x.r.id ? S(x.r.id) : 'New'; }
    // v2.0: a requirement ticked "systems" is restated for each system that feeds the failure condition, in that system's
    // requirements, traced to the aircraft one (req_trace.js flowDown); the probability one carries the system tree's budget
    function sysBudget(gr, sysId) {
        var sg = tracedFrom(gr, sysId)[0], tp = sg ? treeOf(sg) : null;
        var e = tp && Tr() ? safe(function () { return Tr().effectiveTarget(tp); }, null) : null;
        return e && e.rate != null ? e.rate : null;
    }
    function storedSys(sysId, sourceId) { var sy = sysById(sysId); return sy ? arr(sy.req).filter(function (r) { return r && r.reqSource && S(r.reqSource.sourceId) === S(sourceId) && !r.deleted; })[0] || null : null; }
    function flowsFor(gr, cand) {
        var RT = root.SLReqTrace; if (!RT) return [];
        var ex = fcStore(gr.fcId).ex, rows = idpRows(gr);
        var sys = rows.filter(function (r) { return r.state === 'feeds' && !ex[r.sysId]; }).map(function (r) { return { sysId: r.sysId, name: r.sysName, how: listJoin(r.feeds.map(howWords)), budget: sysBudget(gr, r.sysId) }; });
        return RT.flowDown(cand, { fcId: gr.fcId, fcDesc: T(gr.gov.fcDesc), systems: sys }).map(function (f) {
            var st = storedSys(f.sysId, f.cand.reqSource.sourceId);
            return { sysId: f.sysId, cand: f.cand, row: st, r: st || f.cand, state: !st ? 'new' : st.reqSource.fingerprint === f.cand.reqSource.fingerprint ? 'in' : 'changed' };
        });
    }
    function levelWords(lv) { return lv && lv.length ? listJoin(lv.map(function (l) { return l === 'aircraft' ? 'the aircraft' : 'each system'; })) : 'Not decided yet'; }
    var CLOSE = {
        prob: { how: 'Analysis: the fault tree worked out again with the real failure rates', where: 'ssa' },
        spf: { how: 'Analysis: no single failure in the minimal cut sets', where: 'asa' },
        ind: { how: 'Common mode analysis', where: 'cma' },
        dal: { how: 'Review of the development assurance evidence', where: 'ssa' },
        hid: { how: 'Analysis and the maintenance program', where: 'ssa' },
        inst: { how: 'Zonal safety analysis and particular risk assessment', where: 'zsa' },
        crew: { how: 'Crew procedures and the human factors evaluation', where: 'hf' },
        ifc: { how: 'Interface agreement and analysis', where: 'ssa' }
    };
    function closedIn(gr, x) {
        var c = CLOSE[x.type] || { where: 'ssa' }, fs = feeders(gr).map(function (id) { return 'SSA ' + sysName(id); });
        if (c.where === 'cma') { var d = root.SLReqTrace.drivenFrom(x.r).filter(function (e) { return e.what === 'Common mode analysis'; }).map(function (e) { return e.id; }); var sc = suggestCma(gr); return d.length ? d.join(', ') : sc ? S(sc.cmaId) : 'A common mode analysis'; }
        if (c.where === 'asa') return 'ASA';
        if (c.where === 'zsa') return 'ZSA and PRA';
        if (c.where === 'hf') return 'Human factors evaluation';
        return listJoin(fs.length ? fs.concat(x.type === 'prob' ? ['ASA'] : []) : ['SSA', 'ASA']);
    }

    // ---- questions: what is still open --------------------------------------------------------------------------------
    var F_QS = [
        { id: 'scope', text: 'What does this PASA cover?' },
        { id: 'desc', text: 'Is this the aircraft the PASA assesses?' },
        { id: 'method', text: 'Which method and numbers does the PASA use?' },
        { id: 'coffe', text: 'Do a combined functional failure effects (CoFFE) analysis?' }
    ];
    function frontLeft() {
        var f = store().front, left = [];
        if (!f.scope) left.push(F_QS[0].text);
        if (!f.desc) left.push(F_QS[1].text);
        if (!f.method) left.push(F_QS[2].text);
        if (coffeOn() === null) left.push(F_QS[3].text);
        var RT = root.SLReqTrace; if (RT) RT.TYPES.forEach(function (t) { if (!RT.pasaLevels(t.id, null).levels.length) left.push('At what level are ' + lc(t.name) + ' requirements derived?'); });
        return left;
    }
    function fcLeft(gr) {
        var left = [], rows = idpRows(gr);
        if (rows.some(function (r) { return r.state === 'open' || r.state === 'proposed'; })) left.push('Which systems feed ' + gr.fcId + '? (the interdependence table)');
        untraced(gr).forEach(function (u) { if (!u.ex) left.push(u.row.sysName + ' feeds ' + gr.fcId + ' with nothing traced: trace one of its failure conditions, or say why it does not'); });
        if (isQuant(gr) && treeOf(gr)) linkCands(gr).forEach(function (c) { if (!c.answer) left.push('Is the fault tree for ' + c.label + ' ready to be linked into the ' + gr.fcId + ' tree?'); });
        resources(gr).forEach(function (r) { if (!resWhere(gr, r)) left.push('Where is ' + lc(r.name) + ' dispositioned?'); });
        if (coffeOn()) coffeCasesOf(gr).forEach(function (k) { if (!coffeVerdictOf(gr, k)) left.push('Does ' + caseWords(k) + ' produce ' + gr.fcId + '?'); });
        return left;
    }
    // over-committed budgets and unreviewed items: open questions the left pane shows
    function fnLeft(fnId) { var out = []; fnGroups(fnId).forEach(function (gr) { out = out.concat(fcLeft(gr)); }); return out; }
    function openItems(gr) {
        var out = [], tf = isQuant(gr) && built(gr) ? treeFacts(gr) : null;
        if (routeOf(gr) === 'unanswered') out.push('The 1309 chart for ' + gr.fcId + ' is not answered in the AFHA yet, so it is assessed quantitatively until it is.');
        if (isQuant(gr) && !pageOf(gr)) out.push('No fault tree is generated for ' + gr.fcId + ' yet.');
        else if (isQuant(gr) && !built(gr)) out.push('The fault tree for ' + gr.fcId + ' has not been created yet: link the system trees that are ready, or build it in the Fault trees tab.');
        var gf = isQuant(gr) ? gateFlags(gr) : { rebalanced: [], over: [], spare: [] };
        gf.over.forEach(function (x) { out.push('The inputs of ' + x + ' take more than its budget. Change what holds them, or the target.'); });
        gf.rebalanced.forEach(function (x) { out.push(x + ' was rebalanced by the tool (an input under it is held tighter than its share): accept it, or keep the tighter budgets, in the Budget Ledger.'); });
        if (tf && tf.meets && !tf.meets.pass) out.push('The fault tree is above its objective: ' + sci(tf.rate) + ' per flight hour against ' + sci(tf.objective) + '.');
        if (tf && tf.cg) tf.cg.gates.filter(function (x) { return x.critical; }).forEach(function (x) { var rv = cmas().filter(function (c) { return arr(c.linkedGateIds).map(S).indexOf(S(x.key)) >= 0; }); if (!rv.length) out.push('Gate ' + x.displayId + (x.name ? ' ' + T(x.name) : '') + ' carries the budget and has no common mode review yet.'); });
        untraced(gr).forEach(function (u) { if (u.ex) return; out.push(u.row.sysName + ' feeds ' + gr.fcId + ' but none of its failure conditions is traced to it.'); });
        if (isQuant(gr)) tracedNotInTree(gr).forEach(function (t) { out.push(t + ' is traced to ' + gr.fcId + ' but is not linked into its fault tree yet.'); });
        treeNotInTable(gr).forEach(function (t) { out.push('The fault tree carries ' + t.sys + ' (through ' + t.via + '), but the interdependence table does not show it feeding ' + gr.fcId + '.'); });
        return out;
    }
    // the systems the tree itself carries (a transfer to a system's tree, or an event standing for a system failure condition)
    // that the interdependence table does not show feeding the failure condition: the two must tell one story
    function treeNotInTable(gr) {
        var page = pageOf(gr); if (!page) return [];
        var fs = feeders(gr), seen = {}, out = [], pages = arr(g('ftaPages'));
        (function w(n) {
            if (!n) return;
            var to = n.transferOutTo || n.linkedPageId, sy = null;
            if (to) { var tp = pages.filter(function (x) { return x && S(x.id) === S(to); })[0]; if (tp && tp.systemId) sy = S(tp.systemId); }
            if (!sy && n.sysNode && n.sysNode.sysId != null) sy = S(n.sysNode.sysId);
            if (!sy && n.externalSource && /^SYS_/.test(S(n.externalSource.targetId))) { var iid = S(n.externalSource.targetId).slice(4); systems().forEach(function (s0) { if (arr(s0.fha).some(function (r) { return S(r.internalId) === iid; })) sy = S(s0.id); }); }
            if (sy && fs.indexOf(sy) < 0 && !seen[sy]) { seen[sy] = 1; out.push({ sys: sysName(sy), sysId: sy, via: nodeName(n) }); }
            kids(n).forEach(w);
        })(page.root);
        return out;
    }
    function tracedNotInTree(gr) { return treeOf(gr) ? linkCands(gr).filter(function (c) { return !c.linked; }).map(function (c) { return c.label; }) : []; }

    // ---- the report: front ---------------------------------------------------------------------------------------------
    function H(level, text, extra) { return Object.assign({ k: 'h', level: level, text: text }, extra || {}); }
    function P(text, q) { return q ? { k: 'p', text: text, q: q } : { k: 'p', text: text }; }
    function regulation() { var p = pc(); return S(p && p.regulation) || 'Part 25'; }
    function acRef() { return /23/.test(regulation()) ? 'ASTM F3230 and AC 23.1309-1E' : 'AC 25.1309-1B'; }
    function hoursWord() { var B = TB(), pg = arr(g('ftaPages')).filter(function (p) { return p && p.treeLevel === 'aircraft' && p.root; })[0]; var h = B && pg ? safe(function () { return B.missionHours(pg).hours; }, null) : null; return h ? (Math.round(h * 100) / 100) + ' hour' + (h === 1 ? '' : 's') : 'the average flight'; }
    function front(ctx) {
        var f = store().front, b = [], prog = S(safe(function () { return g('projectName'); }, '')) || 'the aircraft';
        b.push(H(1, 'Purpose and scope'));
        b.push(P('This Preliminary Aircraft Safety Assessment (PASA) asks whether the aircraft as planned can meet the safety objective of every failure condition the aircraft functional hazard assessment (AFHA) rates Major or worse, and what each system must promise for that to hold. It is done early, from the architecture and the fault trees, so the requirements it raises shape the design rather than follow it.'));
        b.push(P(f.scope === 'part' ? 'This issue covers part of the aircraft only. ' + T(f.scopeNote || 'What is left out, and why, is not written yet.') : f.scope === 'all' ? 'It covers every configuration and flight phase in the AFHA.' : 'Not decided yet: what this PASA covers.', 'pasa.scope'));
        b.push(H(1, 'The aircraft'));
        var sys = systems();
        b.push(P(f.desc === 'own' && f.descText ? T(f.descText) : f.desc === 'project' ? prog + ', with ' + listJoin(sys.map(function (s) { return T(s.name || s.id); })) + '.' : 'Not decided yet: the description of the aircraft.', 'pasa.desc'));
        b.push(H(1, 'Method'));
        b.push(P(f.method === 'own' && f.methodText ? T(f.methodText) : f.method === 'std' ? 'The assessment follows ARP4761A for the safety assessment process and ARP4754B for development assurance, with the objectives of ' + acRef() + ' (' + regulation() + '). Probabilities are per flight hour, worked out over an average flight of ' + hoursWord() + '.' : 'Not decided yet: the method and the numbers.', 'pasa.method'));
        b.push(P('Each appendix takes each failure condition of one function at its worst case (the most severe flight phase, and the longest exposure where two are equally severe). It first sets out how the systems feed it and what they share, then shows its fault tree as it stands in the tool (the system trees are linked in by the engineer; a tree nobody has built yet says so), says what the tree means, checks the numbers against the objective, and ends with the requirements that make it so and how each will be closed. The requirements are generated by AutoReq from the analysis; they are the mitigations.'));
        var RT = root.SLReqTrace;
        if (RT) b.push({ k: 'table', name: 'levels', title: 'The level each type of requirement is derived at', q: 'pasa.lvl', rows: RT.TYPES.map(function (t) { var l = RT.levelFor(t.id, {}).level; return { 'Requirement type': t.name, 'What it covers': t.what, 'Derived at': l ? RT.levelLabel(l) : 'Not decided yet' }; }), lead: '{N} lists the level chosen for each type; an appendix says where a failure condition differs.' });
        b.push(H(1, 'The failure conditions'));
        var apx = appendices(), all = groups();
        b.push({ k: 'table', name: 'register', title: 'Aircraft failure conditions and where each is assessed', q: 'pasa.fcs', rows: all.map(function (gr) {
            var i = apx.indexOf(S(gr.gov.subId));
            return { 'Failure condition': fcName(gr), Function: fnTitle(fnOf(gr.gov.subId)), Severity: S(gr.gov.severity), 'Assessed in': applicable(gr) && i >= 0 ? 'Appendix ' + letter(i) + ', ' + (isQuant(gr) ? 'quantitatively' : 'qualitatively') + (routeOf(gr) === 'unanswered' ? ' (1309 chart not answered)' : '') : 'No appendix: no safety effect' };
        }), lead: '{N} lists every aircraft failure condition in the AFHA, the function whose appendix assesses it, and how. The 1309 chart in the AFHA decides whether each is assessed quantitatively or qualitatively; a Minor one is assessed qualitatively.' });
        b.push(P(coffeOn() === true ? 'A combined functional failure effects (CoFFE) analysis is done: each appendix lists which system failures, alone or together, produce its failure condition.' : coffeOn() === false ? 'No CoFFE analysis is done: interdependence and common resources carry the argument.' : 'Not decided yet: whether a CoFFE analysis is done.', 'pasa.coffe'));
        return b;
    }
    function letter(i) { var R0 = root.SLCcaReport && root.SLCcaReport.get('pasa'); return R0 && R0.appxLetter ? R0.appxLetter(i) : String.fromCharCode(65 + i); }
    function after(ctx) {
        var b = [H(1, 'What the appendices found')], apx = appendices(), rows = [];
        apx.forEach(function (fid, i) {
            fnGroups(fid).forEach(function (gr) {
                var q = isQuant(gr), bt = q && built(gr), tf = bt ? treeFacts(gr) : null, cg = tf && tf.cg ? tf.cg.gates.filter(function (x) { return x.critical; }) : [], o = openItems(gr);
                rows.push({ Appendix: letter(i), 'Failure condition': fcName(gr), Assessment: q ? 'Quantitative' : 'Qualitative', 'Against the objective': q ? (!bt ? 'Fault tree not created yet' : tf && tf.meets ? (tf.meets.pass ? 'Within' : 'Above') + ' (' + sci(tf.rate) + ' against ' + sci(tf.objective) + ' per flight hour)' : 'Not worked out') : 'Assessed in words', 'The budget rests on': cg.length ? 'Gates ' + listJoin(cg.map(function (x) { return x.displayId; })) : !q ? 'Not applicable' : bt ? 'No independence claim' : 'Not known yet', Findings: o.length ? o.join(' ') : 'None' });
            });
        });
        if (!rows.length) b.push(P('No aircraft failure condition has a safety effect yet.'));
        else b.push({ k: 'table', name: 'found', title: 'What each appendix found', rows: rows, lead: '{N} sums up each failure condition in its appendix.' });
        b.push({ k: 'rauth', asHeading: 1 });
        return b;
    }

    // ---- the report: one appendix per failure condition ------------------------------------------------------------------
    function asmText(ids) { var all = arr(g('acAssumptionsData')); return arr(ids).map(function (id) { var a = all.filter(function (x) { return x && S(x.asmId) === S(id); })[0]; return S(id) + (a && (a.text || a.statement) ? ' ' + T(a.text || a.statement) : ''); }).join('; '); }
    function fcPart(gr, ctx) {
        var fc = gr.gov, f = fc.fcId, q = function (x) { return 'fc.' + f + '.' + x; }, b = [], t = target(fc.severity), tf = treeFacts(gr) || {};
        var phases = T(fc.phases || 'every phase'), phasesLc = phases.toLowerCase();
        b.push(H(2, fcName(gr) + ' (' + (isQuant(gr) ? 'quantitative' : 'qualitative') + ')', { q: q('idp') }));
        b.push(H(3, 'What is being evaluated'));
        b.push(P(f + ' is ' + lc(T(fc.fcDesc)) + ', in ' + phasesLc + '. The AFHA rates it ' + S(fc.severity) + (t.prob != null ? ', so it must be ' + (SEV_WORDS[fc.severity] || 'kept below its objective') + ': below ' + sci(t.prob) + ' per flight hour' : '') + (rank(fc.severity) >= SEV_RANK.Hazardous ? ', and no single failure may cause it' : '') + '.' + (fc.effAc ? ' Its effect on the aircraft: ' + lc(T(fc.effAc)).replace(/\.$/, '') + '.' : '')));
        b.push(P('This appendix asks whether the architecture as planned keeps ' + f + ' within that objective, and what each system must promise for that to hold. It looks first at how the systems feed it and what they share, then at the fault tree and the numbers, and ends with the requirements that make it so.'));
        b.push(H(3, 'The AFHA entry'));
        b.push({ k: 'table', name: 'afha-' + f, title: f + ' as the AFHA records it', rows: [
            { Item: 'Failure condition', Entry: fcName(gr) }, { Item: 'Aircraft function', Entry: S(fc.subId) + (fnName(fc.subId) ? ' ' + fnName(fc.subId) : '') },
            { Item: 'Flight phases', Entry: phases }, { Item: 'Effect on the aircraft', Entry: T(fc.effAc || 'Not recorded') }, { Item: 'Effect on the crew', Entry: T(fc.effCrew || 'Not recorded') },
            { Item: 'Effect on occupants', Entry: T(fc.effPax || 'Not recorded') }, { Item: 'Severity', Entry: S(fc.severity) },
            { Item: 'Objective', Entry: t.prob != null ? sci(t.prob) + ' per flight hour' + (rank(fc.severity) >= SEV_RANK.Hazardous ? ', no single failure' : '') + ' (' + acRef() + ')' : 'Not set' },
            { Item: 'Assumptions', Entry: asmText(fc.assumptionIds) || 'None recorded' }
        ], lead: '{N} is the AFHA entry for the worst case of ' + f + (gr.rows.length > 1 ? ' (the most severe of its ' + 'flight phase rows)' : '') + '.' });
        // interdependence
        b.push(H(3, 'How the systems feed ' + f));
        var rows = idpRows(gr), feeds = rows.filter(function (r) { return r.state === 'feeds'; }), ex = fcStore(f).ex;
        if (!feeds.length) b.push(P('No system is shown to feed ' + f + ' yet: the interdependence questions for it are still open.', q('idp')));
        else b.push({ k: 'table', name: 'idp-' + f, title: 'The systems that feed ' + f, q: q('idp'), rowQ: feeds.map(function (r) { return ex[r.sysId] || !tracedFrom(gr, r.sysId).length ? q('trace.' + r.sysId) : q('idp'); }), rows: feeds.map(function (r) {
            var tr = tracedFrom(gr, r.sysId), e0 = ex[r.sysId];
            return { System: r.sysName, 'Its failure condition traced here': tr.length ? tr.map(function (sg) { return sg.fcId + ' ' + T(sg.gov.fcDesc || ''); }).join('; ') : e0 ? 'None: excluded' : 'None traced', ['How it feeds ' + f]: r.feeds.map(howWords).join('; '), Basis: e0 ? 'Not a contributor: ' + T(e0.why) : listJoin(r.feeds.map(basisWords).filter(function (x, i, a) { return x && a.indexOf(x) === i; })) };
        }), lead: '{N} lists every system the interdependence table shows feeding ' + f + ', and the basis for each.' });
        var un = untraced(gr).filter(function (u) { return !u.ex; });
        if (un.length) b.push(P('Finding: ' + listJoin(un.map(function (u) { return u.row.sysName; })) + (un.length > 1 ? ' feed ' : ' feeds ') + f + ', but none of ' + (un.length > 1 ? 'their' : 'its') + ' failure conditions is traced to it. Until one is traced, or the reason it does not contribute is recorded, ' + f + ' may be missing a cause.', q('trace.' + un[0].row.sysId)));
        var tnt = treeNotInTable(gr); if (tnt.length) b.push(P('Finding: the fault tree carries ' + listJoin(tnt.map(function (t) { return t.sys + ' (through ' + t.via + ')'; })) + ', but the interdependence table does not show ' + (tnt.length > 1 ? 'them' : 'it') + ' feeding ' + f + '. The table and the tree must tell one story: answer ' + (tnt.length > 1 ? 'those rows' : 'that row') + ' on the left.', q('idp')));
        var lks = isQuant(gr) && pageOf(gr) ? linkCands(gr) : [];
        if (lks.length) b.push({ k: 'table', name: 'link-' + f, title: 'The system trees linked into the ' + f + ' tree', q: q('link'), rowQ: lks.map(function (c) { return q('link.' + c.key); }), rows: lks.map(function (c) {
            return { 'System failure condition': c.label, 'Its fault tree': !c.tree ? 'None yet' : c.treeBuilt ? 'Built' : 'Its top only, nothing built under it', ['Linked into the ' + f + ' tree']: c.via === 'transfer' ? 'Yes, by a transfer' : c.linked ? 'Yes' : c.answer === 'no' ? 'Not yet (the engineer\'s answer)' : 'Not answered yet' };
        }), lead: '{N} lists each system failure condition traced to ' + f + ' and whether it is linked into its fault tree. A linked one is the same node in every tree it is in, so it keeps the strictest budget any of them gives it, and its own tree takes that budget as its target.' });
        var nit = tracedNotInTree(gr); if (nit.length) b.push(P('Finding: ' + listJoin(nit) + (nit.length > 1 ? ' are' : ' is') + ' traced to ' + f + ' but not linked into its fault tree yet. Until ' + (nit.length > 1 ? 'they are' : 'it is') + ', the tree does not count ' + (nit.length > 1 ? 'them' : 'it') + ' and ' + (nit.length > 1 ? 'their trees have' : 'its tree has') + ' no budget from ' + f + '.', q('link')));
        // common resources
        b.push(H(3, 'Resources the systems share'));
        var rs = resources(gr);
        if (!rs.length) b.push(P('No resource or common cause is shared by the systems that feed ' + f + '.'));
        else {
            var cgs = critGates(gr);
            b.push({ k: 'table', name: 'cr-' + f, title: 'Shared resources and common causes for ' + f, q: q('res'), rowQ: rs.map(function (r) { return q('res.' + r.key); }), rows: rs.map(function (r) {
                return { 'Shared resource': (r.id ? r.id + ' ' : '') + r.name, 'Shared by': listJoin(r.shared) || 'Not recorded', 'Could defeat': cgs.length ? listJoin(cgs.map(function (x) { return x.displayId + (x.name ? ' ' + T(x.name) : ''); })) : 'No independence claim in the tree', 'Dispositioned in': whereWords(resWhere(gr, r)) };
            }), lead: '{N} lists what the systems that feed ' + f + ' share, which independence each could defeat, and where it is looked at.' });
            b.push(P('Every independence the tree relies on can be defeated by something shared here. None is dismissed in this appendix without a reason; each goes to the review named, and the requirements it raises come back into this appendix.'));
        }
        // CoFFE
        if (coffeOn()) {
            b.push(H(3, 'Combined functional failure effects (CoFFE)'));
            var ks = coffeCasesOf(gr);
            b.push(ks.length ? { k: 'table', name: 'coffe-' + f, title: 'Which system failures, alone or together, produce ' + f, q: q('coffe'), rowQ: ks.map(function (k) { return q('coffe.' + k.key); }), rows: ks.map(function (k) {
                var v = coffeVerdictOf(gr, k), inTree = (function () { var hit = false, page = pageOf(gr); if (!page) return false; var ids = k.parts.map(function (p) { return S(p.sysId); }); walk(integrated(page).root, function (n) { if (n.sysNode && ids.indexOf(S(n.sysNode.sysId)) >= 0) hit = true; var s0 = n.externalSource ? S(n.externalSource.targetId) : ''; systems().forEach(function (sy) { if (ids.indexOf(S(sy.id)) >= 0 && arr(sy.fha).some(function (r) { return ('SYS_' + String(r.internalId)) === s0; })) hit = true; }); }); return hit; })();
                return { 'System failure(s)': caseWords(k), ['Produce ' + f]: v ? (v.v === 'yes' ? 'Yes' : 'No') + (v.src === 'mac' ? ' (from the MAC model)' : '') : 'Not decided yet', 'Covered by the tree': inTree ? 'Yes' : 'No' };
            }), lead: '{N} lists each case: a row with one system is that system alone able to cause it.' } : P('The CoFFE has no cases for ' + f + ': no system is shown to feed it yet.'));
        }
        if (isQuant(gr) && !built(gr)) {
            // v2.1: nothing built under the top is no analysis: no picture, no numbers
            b.push(H(3, 'The fault tree'));
            b.push(P(pageOf(gr) ? 'The fault tree for ' + f + ' has not been created yet. It has its top event and nothing under it. Link the system trees that are ready (the questions beside this report), or build it in the Fault trees tab; what the tree says and its numbers appear here once it is.' : 'No fault tree is generated for ' + f + ' yet.', q('link')));
            b.push(P('Development assurance: ' + (t.dal ? 'FDAL ' + t.dal + ' for the functions that feed ' + f + ', from its ' + S(fc.severity) + ' severity.' : 'not set.')));
        } else if (isQuant(gr)) {
        // the tree
        b.push(H(3, 'The fault tree'));
        var figs = treeFigures(gr, ctx);
        if (figs.length) { b.push(P((figs.length > 1 ? 'The figures below are' : 'The figure below is') + ' the fault tree for ' + f + ' as it stands in the tool' + (tf.full && tf.full !== tf.page ? ', with the system trees it transfers to drawn in' : '') + (figs.length > 1 ? ', cut into parts so each stays readable' : '') + '. Each box shows its probability per flight (P) and its rate per flight hour (\u03BB).')); figs.forEach(function (x) { b.push(x); }); }
        else b.push(P('The fault tree for ' + f + ' could not be drawn just now.'));
        // what the tree says
        b.push(H(3, 'What the tree says'));
        if (tf.singles) b.push(P(tf.singles.length ? 'A single failure can cause ' + f + ': ' + listJoin(tf.singles) + '. A failure condition rated ' + S(fc.severity) + (rank(fc.severity) >= SEV_RANK.Hazardous ? ' must not follow from one failure, so this has to be designed out.' : ' may, if its probability allows it.') : 'No single failure causes ' + f + '. The shortest way to it takes ' + tf.shortest + ' failures together' + (tf.shortestEx.length ? ': ' + listJoin(tf.shortestEx) : '') + '.'));
        if (tf.ands && tf.ands.length) b.push(P('The design rests on independence. ' + (tf.singles && !tf.singles.length ? 'Every path to the top passes through an AND gate (' + listJoin(tf.ands.slice(0, 8)) + ')' : 'The tree has AND gates (' + listJoin(tf.ands.slice(0, 8)) + ')') + ', so the result is only as good as the claim that what sits under each gate cannot fail together. The resources they share are listed above.'));
        else b.push(P('The tree has no AND gate: no independence claim carries ' + f + '.'));
        if (tf.hidden && tf.hidden.length) b.push(P('Some failures would not be noticed when they happen: ' + listJoin(tf.hidden.map(function (h) { return h.name + (h.tau ? ' (checked every ' + h.tau + ' hours)' : ''); })) + '. How often they are checked decides how much they really protect.'));
        else b.push(P('No input of the tree is marked as a failure that could stay hidden.'));
        if (tf.repeated && tf.repeated.length) b.push(P('The branches are linked: ' + listJoin(tf.repeated.slice(0, 6)) + (tf.repeated.length > 1 ? ' appear' : ' appears') + ' in more than one place, so those branches are not as separate as they are drawn.'));
        // the numbers
        b.push(H(3, 'The numbers'));
        var numRows = [{ Quantity: 'Objective', Value: t.prob != null ? sci(t.prob) + ' per flight hour' : 'Not set', Basis: S(fc.severity) + ', ' + acRef() },
            { Quantity: 'Top event', Value: tf.rate != null ? sci(tf.rate) + ' per flight hour' : 'Not worked out', Basis: tf.pTop != null ? sci(tf.pTop) + ' per flight of ' + (tf.hours ? Math.round(tf.hours * 100) / 100 + ' hours' : 'the average length') + ', from the tree' : '' }]
            .concat((tf.handed || []).map(function (h) { return { Quantity: 'Handed to ' + h.name, Value: h.p != null ? sci(h.p) + ' per flight' : 'Not allocated', Basis: 'From the tree' }; }))
            .concat([{ Quantity: 'Result', Value: tf.meets ? (tf.meets.pass ? 'Within the objective' : 'Above the objective') : 'Not worked out', Basis: 'Confirmed or not in the SSA with real failure rates' }]);
        b.push({ k: 'table', name: 'num-' + f, title: 'The numbers for ' + f, rows: numRows, lead: '{N} checks the tree against the objective.' });
        // v2.2: a gate whose inputs do not use its whole budget says so (its inputs never read as if they added up to it)
        gateFlags(gr).spare.forEach(function (x) { b.push(P(x.name + ' uses ' + sci(x.used) + ' of its budget of ' + sci(x.budget) + ' per flight. ' + (x.reserve ? 'The rest is held as an allowance, by the engineer\'s decision.' : 'Every input under it is held tighter than its share (another tree needs it tighter, or its own class does), so nothing under it can use the rest.'))); });
        var cgr = tf.cg ? tf.cg.gates : [];
        if (cgr.length) {
            var CG = root.SLCriticalGates;
            var rw = function (x, every) { return every ? 'on every flight' : x != null ? (CG && CG.num ? CG.num(x) : sci(x)) + ' per flight hour' : 'not worked out'; };
            b.push({ k: 'table', name: 'cg-' + f, title: 'The gates the budget depends on', rows: cgr.map(function (x) {
                var rv = cmas().filter(function (c) { return arr(c.linkedGateIds).map(S).indexOf(S(x.key)) >= 0; });
                return { Gate: x.displayId + (x.name ? ' ' + T(x.name) : ''), 'If its inputs were not independent': rw(x.rateAsOr, x.orEveryFlight), 'If one shared cause took out all its inputs': rw(x.rateShared, x.sharedEveryFlight), Verdict: x.critical ? 'Critical' + (rv.length ? ': ' + rv.map(function (c) { return S(c.cmaId); }).join(', ') : ': no common mode review yet') : 'Not critical' };
            }), lead: '{N} shows what happens to ' + f + ' if each AND gate\'s independence fails, in two ways: if any one input alone were enough, and if one shared cause took out all of them at once (the gate then fails as often as its least likely input).' });
        }
        b.push(P('Development assurance: ' + (t.dal ? 'FDAL ' + t.dal + ' for the functions that feed ' + f + ', from its ' + S(fc.severity) + ' severity.' : 'not set.')));
        } else qualBlocks(gr).forEach(function (x) { b.push(x); });
        // requirements
        b.push(H(3, 'Requirements'));
        var rq = reqsFor(gr), RT = root.SLReqTrace;
        if (!rq.length) b.push(P('AutoReq has no requirement for ' + f + ' yet.'));
        else {
            b.push(P('Generated by AutoReq from this analysis. These are the mitigations: each closes something the parts above leave open.'));
            b.push({ k: 'table', name: 'req-' + f, title: 'Requirements for ' + f, q: q('req'), rows: reqRows(rq, RT), lead: '{N} lists every requirement for ' + f + ', why, where it is driven from and the levels it is written at: an aircraft requirement first, then the one flowed down to each system that feeds ' + f + ', traced to it.' });
            if (rq.some(function (x) { return x.state !== 'in'; })) b.push(P('Requirements shown as New are not in the aircraft requirements yet; they go in when accepted.'));
        }
        b.push(H(3, 'Path to compliance'));
        if (!rq.length) b.push(P('The path to compliance is built from the requirements, and there are none yet.'));
        else {
            b.push(P(f + ' is shown when every requirement above is closed. This table is built from the requirements; it is not written by hand.'));
            b.push({ k: 'table', name: 'path-' + f, title: 'How each requirement for ' + f + ' will be closed', rows: pathRows(gr, rq), lead: '{N} lists how and where each requirement is closed.' });
        }
        return b;
    }
    // the requirement rows of a failure condition: each at the levels ticked (the aircraft row, then one per system flowed down)
    function reqEntries(rq) {
        var out = [];
        rq.forEach(function (x) {
            // levels not decided yet: the requirement is still shown once, as AutoReq writes it, so nothing is hidden
            if (x.aircraft || !x.levels.length) out.push({ x: x, r: x.r, label: reqLabel(x), sys: null });
            x.flows.forEach(function (fl) { out.push({ x: x, r: fl.r, label: (x.aircraft ? '\u21B3 ' : '') + (fl.row && fl.row.id ? S(fl.row.id) : 'New') + ' (' + sysName(fl.sysId) + ')', sys: fl.sysId, flow: fl }); });
        });
        return out;
    }
    function reqRows(rq, RT) { return reqEntries(rq).map(function (e) { return { ID: e.label, Requirement: T(e.r.text), Rationale: T(e.r.rat) || 'Rationale missing', 'Driven from': RT ? RT.drivenText(e.r) : '', 'Written at': e.sys ? 'System' : 'Aircraft', 'Levels ticked': levelWords(e.x.levels) }; }); }
    function pathRows(gr, rq) { return reqEntries(rq).map(function (e) { var t0 = T(e.r.text); return { Requirement: e.label + ' ' + t0.slice(0, 90) + (t0.length > 90 ? '...' : ''), 'Closed by': (CLOSE[e.x.type] || CLOSE.prob).how, In: e.sys ? 'SSA ' + sysName(e.sys) : closedIn(gr, e.x) }; }); }
    // a failure condition the 1309 chart sends to a qualitative assessment: the argument in words
    function qualBlocks(gr) {
        var fc = gr.gov, f = fc.fcId, cp = fc.chartProps || {}, r0 = routeOf(gr), b = [], fs = feeders(gr).map(sysName);
        var why = rank(fc.severity) < SEV_RANK.Major ? 'it is Minor, and a Minor failure condition is assessed qualitatively'
            : r0 === 'similarity' ? 'the 1309 chart records it as similar to a design already shown in service'
            : cp.isSimpleConventional ? 'the 1309 chart records the design as simple and conventional'
            : (cp.isSimple && cp.isRedundant) ? 'the 1309 chart records the design as simple and redundant'
            : 'the 1309 chart sets a qualitative assessment for it';
        b.push(H(3, 'The qualitative assessment'));
        b.push(P(f + ' is assessed qualitatively because ' + why + '. No number is worked out for it; the argument below and the requirements after it carry the case.'));
        b.push(P(fs.length ? 'It rests on ' + listJoin(fs) + ', the systems the interdependence answers show feeding it.' : 'No system is shown to feed it yet: the interdependence questions for it are still open.'));
        var page = pageOf(gr), cs = page ? cutsets(page) : null;
        if (cs) { var one = cs.filter(function (c) { return c.length === 1; }).map(function (c) { return nodeName(c[0]); }); b.push(P(one.length ? 'Its fault tree shows a single failure can cause it: ' + listJoin(one) + '.' : 'Its fault tree shows no single failure causes it.')); }
        b.push(P(r0 === 'similarity' ? 'It is shown by the service experience of the similar design and by showing the differences do not change the effect.' : 'It is shown by a design and installation appraisal of the systems that feed it, their own functional hazard assessments, and the requirements below.'));
        return b;
    }
    // one appendix per function: the function, then each of its applicable failure conditions (worked out once per change)
    var _secMemo = { gen: -2, map: {} };
    function fnSection(fnId, ctx) {
        var G = memoGen(), k = fnId + '|' + (ctx.dark ? 1 : 0) + (ctx.forExport ? 1 : 0);
        if (_secMemo.gen !== G || G === -1) _secMemo = { gen: G, map: {} };
        if (_secMemo.map[k]) return _secMemo.map[k];
        var f0 = fnOf(fnId) || { id: fnId, name: '' }, grs = fnGroups(fnId), b = [];
        b.push(H(2, 'The function'));
        var sysFeed = {}; grs.forEach(function (gr) { feeders(gr).forEach(function (x) { sysFeed[x] = 1; }); });
        b.push(P(fnTitle(f0) + (f0.def ? ': ' + lc(f0.def).replace(/\.$/, '') + '.' : '.') + (f0.parent && f0.parent !== f0.name ? ' It is part of ' + f0.parent + '.' : '') + ' Its failure conditions with a safety effect: ' + listJoin(grs.map(function (gr) { return fcName(gr) + ' (' + S(gr.gov.severity) + ', ' + (isQuant(gr) ? 'quantitative' : 'qualitative') + ')'; })) + '.' + (Object.keys(sysFeed).length ? ' The systems that carry it: ' + listJoin(Object.keys(sysFeed).map(sysName)) + '.' : '')));
        grs.forEach(function (gr) { b = b.concat(fcPart(gr, ctx)); });
        _secMemo.map[k] = b;
        return b;
    }
    function section(gr, ctx) { return fcPart(gr, ctx); }
    // the section's blocks are a getter: worked out only when its appendix is drawn (the front lists the appendices only)
    function sections(ctx) {
        return appendices().map(function (fid) {
            var f0 = fnOf(fid), o = { id: sid(fid), title: fnTitle(f0), tabLabel: { id: fid, name: f0 ? f0.name : '' }, edit: false }, cache = null;
            Object.defineProperty(o, 'blocks', { enumerable: true, get: function () { if (!cache) cache = fnSection(fid, ctx); return cache; } });
            return o;
        });
    }

    // ---- the left pane -------------------------------------------------------------------------------------------------
    var ui = { open: {} };
    function style() {
        if (typeof document === 'undefined' || document.getElementById('pasa-style')) return;
        var st = document.createElement('style'); st.id = 'pasa-style';
        st.textContent = '.paq-h{font-size:13px;font-weight:700;margin:16px 0 6px;color:var(--color-text-primary,#101216)}.paq-x{font-size:13px;line-height:1.45;margin:0 0 8px;color:var(--color-text-primary,#101216)}'
            + '.paq-card{border:1px solid var(--color-border,#d4d7dc);border-left:4px solid #1A6EF2;border-radius:10px;padding:12px 14px;margin:10px 0;background:var(--color-surface-1,#fff)}.paq-card.done{border-left-color:#1F7A33}'
            + '.paq-t{width:100%;border-collapse:collapse;font-size:12.5px}.paq-t th,.paq-t td{border-bottom:1px solid var(--color-border,#e3e5e8);padding:5px 6px;text-align:left;vertical-align:top;color:var(--color-text-primary,#101216)}'
            + '.paq-b{font:inherit;font-size:12px;padding:3px 9px;border-radius:6px;border:1px solid var(--color-border-strong,#9aa1ab);background:var(--color-surface-1,#fff);color:var(--color-text-primary,#101216);cursor:pointer;margin:0 4px 4px 0}'
            + '.paq-b.on{background:#1A6EF2;border-color:#1A6EF2;color:#fff}.paq-src{font-size:11.5px;font-weight:600}.paq-prop{font-size:11.5px;font-weight:600;color:#7A4B00}body.theme-dark .paq-prop{color:#F4C77A}'
            + '.paq-ta{width:100%;box-sizing:border-box;font:inherit;font-size:13px;min-height:64px;margin:4px 0;padding:6px;border-radius:6px;border:1px solid var(--color-border-strong,#9aa1ab);background:var(--color-surface-1,#fff);color:var(--color-text-primary,#101216)}'
            + '.paq-open{border:1px solid #E7B4B4;background:#FCECEC;color:#5C1414;border-radius:8px;padding:8px 10px;font-size:12.5px;margin:8px 0}body.theme-dark .paq-open{background:#3A1E1E;color:#F5D6D6;border-color:#6B3434}'
            + '.paq-sel{font:inherit;font-size:13px;padding:5px;border-radius:6px;max-width:100%;border:1px solid var(--color-border-strong,#9aa1ab);background:var(--color-surface-1,#fff);color:var(--color-text-primary,#101216)}';
        document.head.appendChild(st);
    }
    function Q(q) { return root.SLAutopilotUI ? root.SLAutopilotUI.question(q, 'SLPasaAuto.ui.pick') : ''; }
    function card(qid, body, done) { return '<div class="paq-card' + (done ? ' done' : '') + '" data-paq="' + E(qid) + '">' + body + '</div>'; }
    function textBox(qid, label, val, placeholder) { var id = 'paq-ta-' + qid.replace(/[^A-Za-z0-9_-]/g, '_'); return '<div class="paq-x">' + E(label) + '</div><textarea class="paq-ta" id="' + E(id) + '" placeholder="' + E(placeholder || '') + '">' + E(val || '') + '</textarea><button type="button" class="paq-b on" data-paq-save="' + E(qid) + '" onclick="SLPasaAuto.ui.text(' + J(qid) + ',' + J(id) + ')">Save</button>'; }
    function leftFront() {
        var f = store().front, h = '', RT = root.SLReqTrace, left = frontLeft();
        h += '<div class="paq-h">The front of the report</div><div class="paq-x">These answers write the front of the PASA: what it covers, the aircraft, the method and where each type of requirement is written. Every function with a failure condition rated Minor or above gets its own appendix, and the 1309 chart decides quantitative or qualitative: nothing to pick. Nothing about the architecture, the protections or the budget splits is asked: they come from the model and the trees.</div>';
        if (root.SLAutopilotUI) h += root.SLAutopilotUI.progress(F_QS.length + (RT ? RT.TYPES.length : 0) - left.length, F_QS.length + (RT ? RT.TYPES.length : 0));
        h += card('pasa.scope', Q({ id: 'pasa.scope', text: 'What does this PASA cover?', why: 'The scope goes in the first part of the report.', picked: f.scope || null, options: [{ id: 'all', label: 'Every configuration and flight phase in the AFHA', impact: 'The report says it covers the whole AFHA.' }, { id: 'part', label: 'Only part of it', impact: 'You say what is left out and why; the report says so.' }] }) + (f.scope === 'part' ? textBox('pasa.scopeNote', 'What is left out, and why', f.scopeNote, 'For example: the ground handling configurations, assessed in a later issue.') : ''), !!f.scope);
        var sysN = systems().length;
        h += card('pasa.desc', Q({ id: 'pasa.desc', text: 'Is this the aircraft the PASA assesses?', why: 'From the project: ' + (S(safe(function () { return g('projectName'); }, '')) || 'this project') + ', with ' + sysN + ' systems in the architecture.', picked: f.desc || null, options: [{ id: 'project', label: 'Yes, describe it from the project', impact: 'The report names the aircraft and lists its systems from the architecture.' }, { id: 'own', label: 'I will write the description', impact: 'The report uses your words.' }] }) + (f.desc === 'own' ? textBox('pasa.descText', 'The aircraft, in a few sentences', f.descText, '') : ''), !!f.desc);
        h += card('pasa.method', Q({ id: 'pasa.method', text: 'Which method and numbers does the PASA use?', why: 'From the project: ' + regulation() + ', objectives from ' + acRef() + ', an average flight of ' + hoursWord() + '.', picked: f.method || null, options: [{ id: 'std', label: 'ARP4761A and ARP4754B, per flight hour over the average flight', impact: 'The report states the method and the numbers from the project.' }, { id: 'own', label: 'I will write the method', impact: 'The report uses your words.' }] }) + (f.method === 'own' ? textBox('pasa.methodText', 'The method', f.methodText, '') : ''), !!f.method);
        var co = coffeOn();
        h += card('pasa.coffe', Q({ id: 'pasa.coffe', text: 'Do a combined functional failure effects (CoFFE) analysis?', why: 'A CoFFE lists which system failures, alone or together, produce each failure condition. It catches combinations a tree built top down can miss. The same choice as the Plan Autopilot\'s.', picked: co === true ? 'yes' : co === false ? 'no' : null, options: [{ id: 'yes', label: 'Yes', impact: 'Each appendix gets a CoFFE part before its fault tree, with its cases to answer.' }, { id: 'no', label: 'No', impact: 'Interdependence and common resources carry the argument.' }] }), co !== null);
        if (RT) {
            var lv = '<div class="slap-q">At what levels is each type of requirement written?</div><div class="paq-x">AutoReq writes every requirement from the analysis. For each type, tick where it is written: at the aircraft, flowed down to each system that carries it, or both. A system requirement is traced to the aircraft one above it. It applies to every function in this report; an appendix can change it for its own function.</div><table class="paq-t"><tbody>';
            RT.TYPES.forEach(function (t) { var cur = RT.pasaLevels(t.id, null).levels; lv += '<tr data-ccq-row="pasa.lvl.' + E(t.id) + '"><td><b>' + E(t.name) + '</b><div class="paq-x" style="margin:2px 0 0">' + E(t.what) + '</div></td><td style="white-space:nowrap">' + RT.PASA_LEVELS.map(function (l) { var on = cur.indexOf(l) >= 0; return '<button type="button" role="checkbox" aria-checked="' + on + '" class="paq-b' + (on ? ' on' : '') + '" data-paq-lvl="' + E(t.id + ':' + l) + '" onclick="SLPasaAuto.ui.level(' + J(t.id) + ',' + J(l) + ')">' + (on ? '\u2713 ' : '') + E(l === 'aircraft' ? 'Aircraft' : 'Systems') + '</button>'; }).join('') + '</td></tr>'; });
            h += card('pasa.lvl', lv + '</tbody></table>', RT.TYPES.every(function (t) { return RT.pasaLevels(t.id, null).levels.length > 0; }));
        }
        return h;
    }
    function leftFc(gr) {
        var f = gr.fcId, h = '', left = fcLeft(gr), rows = idpRows(gr), RT = root.SLReqTrace;
        h += '<div class="paq-h" data-paq-fc="' + E(f) + '">' + E(fcName(gr)) + ' (' + E(gr.gov.severity) + ', ' + (isQuant(gr) ? 'quantitative' : 'qualitative') + ')</div><div class="paq-x">Answer these and its part of the appendix writes itself. What the project already holds is filled in and named; what is new is checked by you or drafted by the AI from the architecture, then confirmed.</div>';
        var items = openItems(gr); if (items.length) h += '<div class="paq-open" data-paq-openitems="1"><b>Open items</b><br>' + items.map(E).join('<br>') + '</div>';
        // 1. interdependence table
        var open = rows.filter(function (r) { return r.state === 'open' || r.state === 'proposed'; });
        var tb = '<div class="slap-q">Which systems feed ' + E(f) + '?</div><div class="paq-x">The interdependence table for ' + E(f) + ' only: one row per system function. Rows the project already settles (from the architecture, or answered before) are filled in. Answer the rest by hand, or let the AI draft them from the architecture and confirm each one.</div>'
            + '<div style="margin:4px 0 8px"><button type="button" class="paq-b" data-paq-idpai="' + E(f) + '" onclick="SLPasaAuto.ui.idpAi(' + J(f) + ')"' + (ui.busy === f ? ' disabled' : '') + '>' + (ui.busy === f ? 'Drafting with the AI...' : 'Draft the unanswered rows with AI') + '</button><button type="button" class="paq-b" data-paq-idpnone="' + E(f) + '" onclick="SLPasaAuto.ui.idpNone(' + J(f) + ')">None of the unanswered rows feed it</button></div>'
            + '<table class="paq-t" data-paq-idp="' + E(f) + '"><thead><tr><th>System and function</th><th>Feeds ' + E(f) + '?</th></tr></thead><tbody>';
        rows.forEach(function (r) {
            r.cells.forEach(function (x) {
                var c = x.cell, k = r.sysId + '|' + x.colId, lab = r.sysName + (x.legacy ? '' : ': ' + x.fn);
                var src = c.state === 'contributes' ? '<span class="paq-src">' + E(basisWords(x) || 'Feeds it') + ': ' + E(howWords(x)) + '</span>' : c.state === 'cleared' ? '<span class="paq-src">Does not feed it (answered)</span>' : c.state === 'proposed' ? '<span class="paq-prop">AI draft: ' + (c.dir === 'contributes' ? 'feeds it' : 'does not') + (c.why ? ', because ' + E(T(c.why)) : '') + '. Confirm or correct.</span>' : '';
                var fixed = c.state === 'contributes' && c.kind !== 'asserted';
                tb += '<tr data-paq-cell="' + E(k) + '"><td>' + E(lab) + (src ? '<div>' + src + '</div>' : '') + '</td><td style="white-space:nowrap">' + (fixed ? 'Yes' : '<button type="button" class="paq-b' + (c.kind === 'asserted' ? ' on' : '') + '" onclick="SLPasaAuto.ui.cell(' + J(f) + ',' + J(x.colId) + ',\'yes\')">Yes</button><button type="button" class="paq-b' + (c.state === 'cleared' ? ' on' : '') + '" onclick="SLPasaAuto.ui.cell(' + J(f) + ',' + J(x.colId) + ',\'no\')">No</button>') + '</td></tr>';
            });
        });
        h += card('fc.' + f + '.idp', tb + '</tbody></table>', !open.length);
        // 1b. a system that feeds it with nothing traced
        untraced(gr).forEach(function (u) {
            var qid = 'fc.' + f + '.trace.' + u.row.sysId, opts = sysGroups(u.row.sysId).map(function (sg) { return { id: 'tr:' + sg.fcId, label: 'Trace ' + sg.fcId + ' ' + T(sg.gov.fcDesc || '') + ' (' + sg.gov.severity + ')', impact: 'Its SFHA entry is traced to ' + f + '; the appendix lists it, and its fault tree must carry it.' }; });
            opts.push({ id: 'ex', label: 'Not a contributor', impact: 'You say why; the report records the reason and shows ' + u.row.sysName + ' as excluded.' });
            h += card(qid, Q({ id: qid, text: u.row.sysName + ' feeds ' + f + ', but none of its failure conditions is traced to it. What is it?', why: 'Found from the interdependence table: ' + listJoin(u.row.feeds.map(howWords)) + '.', picked: u.ex ? 'ex' : null, options: opts }) + (ui.open[qid] === 'ex' || u.ex ? textBox(qid + '.why', 'Why it does not contribute to ' + f, u.ex ? u.ex.why : '', 'For example: each engine has its own tank and feed that nothing else shares.') : ''), !!u.ex);
        });
        // 2. shared resources
        var sug = suggestCma(gr);
        resources(gr).forEach(function (r) {
            var qid = 'fc.' + f + '.res.' + r.key, w = resWhere(gr, r), opts = [];
            cmas().forEach(function (c) { opts.push({ id: 'cma:' + c.internalId, label: 'In ' + cmaLabel(c) + (sug && sug === c && !w ? ' (suggested: it reviews a gate of this tree)' : ''), impact: 'The shared resource table points to ' + S(c.cmaId) + '; its requirements come from there.' }); });
            opts.push({ id: 'pra', label: 'In the particular risk assessment', impact: 'The table points to the PRA.' }, { id: 'zsa', label: 'In the zonal safety analysis', impact: 'The table points to the ZSA.' }, { id: 'new', label: 'Needs its own common mode review', impact: 'The table lists it as a new review to open; the CMA Autopilot picks up the gates it could defeat.' }, { id: 'none', label: 'It cannot defeat an independence here', impact: 'You say why; the report records the reason.' });
            h += card(qid, Q({ id: qid, text: 'Where is ' + lc(r.name) + ' dispositioned?', why: 'Shared by ' + (listJoin(r.shared) || 'the systems that feed ' + f) + '. A shared resource can fail several inputs at once and bypass an AND gate that says they are independent.', picked: w ? w.where : null, options: opts }) + ((w && w.where === 'none') || ui.open[qid] === 'none' ? textBox(qid + '.why', 'Why it cannot defeat an independence for ' + f, w ? w.why : '', '') : ''), !!w);
        });
        // 3. CoFFE cases
        if (coffeOn()) coffeCasesOf(gr).forEach(function (k) {
            var qid = 'fc.' + f + '.coffe.' + k.key, v = coffeVerdictOf(gr, k);
            h += card(qid, Q({ id: qid, text: 'Does ' + caseWords(k) + ' produce ' + f + '?', why: v && v.src === 'mac' ? 'Filled in from the MAC model. Answer to record your own.' : 'A CoFFE case: say whether this combination produces the failure condition.', picked: v ? v.v : null, options: [{ id: 'yes', label: 'Yes', impact: 'The CoFFE table shows it produces ' + f + '.' }, { id: 'no', label: 'No', impact: 'The CoFFE table shows it does not.' }] }), !!v);
        });
        // 4. the tree: nothing to answer
        var pg = pageOf(gr);
        // v2.1: each system failure condition traced here: is its tree ready to be linked into this one?
        if (isQuant(gr) && pg) linkCands(gr).forEach(function (c) {
            var qid = 'fc.' + f + '.link.' + c.key;
            var state = !c.tree ? 'It has no fault tree yet.' : c.treeBuilt ? 'Its fault tree (' + T(c.tree.name || c.tree.id) + ') has inputs built.' : 'Its fault tree (' + T(c.tree.name || c.tree.id) + ') has its top only so far.';
            h += card(qid, Q({ id: qid, text: 'Is the fault tree for ' + c.label + ' ready to be linked into the ' + f + ' tree?', why: E(state + ' Linked, it is one node, the same in every aircraft tree it feeds: it keeps the strictest budget any of them gives it, and its own tree takes that budget as its target.') + (c.via === 'transfer' ? '<br>' + E('It is already in the ' + f + ' tree, by a transfer to its tree.') : ''), picked: c.answer,
                options: [{ id: 'yes', label: 'Yes, link it', impact: 'It goes into the ' + f + ' tree under the top, with its share of the budget. Move it inside the tree in the Fault trees tab if it belongs lower down.' }, { id: 'no', label: 'Not yet', impact: 'It stays out of the ' + f + ' tree. The report says it is not linked yet.' }] }), !!c.answer);
        });
        if (isQuant(gr)) h += card('fc.' + f + '.tree', '<div class="slap-q">The fault tree, what it says, the numbers</div><div class="paq-x">' + (built(gr) ? 'Read from the tree. Nothing to answer.' : 'The fault tree for ' + E(f) + ' has not been created yet: link the system trees that are ready, or build it in the Fault trees tab.') + '</div>' + (pg ? '<button type="button" class="paq-b" onclick="SLPasaAuto.ui.openTree(' + J(pg.id) + ')">Open the fault tree</button>' : ''), built(gr));
        return h;
    }
    // one function's questions: each failure condition's, then the function's requirement levels and the register
    function leftFn(fnId) {
        var f0 = fnOf(fnId), grs = fnGroups(fnId), RT = root.SLReqTrace, h = '';
        h += '<div class="paq-h">' + E(fnTitle(f0)) + '</div><div class="paq-x">' + E(grs.length === 1 ? 'One failure condition of this function has a safety effect.' : grs.length + ' failure conditions of this function have a safety effect.') + ' Each has its own questions below; what the project already holds is filled in and named.</div>';
        grs.forEach(function (gr) { h += '<div class="paq-fcblock" data-paq-fcblock="' + E(gr.fcId) + '">' + leftFc(gr) + '</div>'; });
        if (RT) {
            var lv = '<div class="slap-q">Requirement levels for ' + E(fnId) + '</div><div class="paq-x">Ticked on the front of the report. Change one here only if this function needs it.</div><table class="paq-t"><tbody>';
            RT.TYPES.forEach(function (t) {
                var cur = RT.pasaLevels(t.id, fnId), own = cur.from === 'function';
                lv += '<tr><td>' + E(t.name) + (own ? ' (this function)' : '') + '</td><td style="white-space:nowrap">' + RT.PASA_LEVELS.map(function (l) { var on = cur.levels.indexOf(l) >= 0; return '<button type="button" role="checkbox" aria-checked="' + on + '" class="paq-b' + (on ? ' on' : '') + '" onclick="SLPasaAuto.ui.level(' + J(t.id) + ',' + J(l) + ',' + J(fnId) + ')">' + (on ? '\u2713 ' : '') + E(l === 'aircraft' ? 'Aircraft' : 'Systems') + '</button>'; }).join('') + (own ? '<button type="button" class="paq-b" onclick="SLPasaAuto.ui.levelReset(' + J(t.id) + ',' + J(fnId) + ')">As the report</button>' : '') + '</td></tr>';
            });
            var nNew = 0; grs.forEach(function (gr) { reqEntries(reqsFor(gr)).forEach(function (e) { if (!(e.flow ? e.flow.state === 'in' : e.x.state === 'in')) nNew++; }); });
            lv += '</tbody></table>' + (nNew ? '<div style="margin-top:8px"><button type="button" class="paq-b on" data-paq-acceptreq="' + E(fnId) + '" onclick="SLPasaAuto.ui.acceptReqs(' + J(fnId) + ')">Put the new and changed requirements for ' + E(fnId) + ' in the registers (aircraft and systems)</button></div>' : '<div class="paq-x" style="margin-top:6px">Every requirement for ' + E(fnId) + ' is in the registers.</div>');
            h += card('fn.' + fnId + '.req', lv, !nNew);
        }
        return h;
    }
    function renderQuestions(R, tabv) {
        style();
        var part = R && R.partOf ? R.partOf(tabv) : null, fid = fnOfSid(part);
        if (fid) return fnGroups(fid).length ? leftFn(fid) : '<div class="paq-x">This function has no failure condition with a safety effect now.</div>';
        return leftFront();
    }

    // ---- answering --------------------------------------------------------------------------------------------------------
    function R0() { return root.SLCcaReport ? root.SLCcaReport.get('pasa') : null; }
    function done(qid) { var R = R0(); if (R) R.answered(qid); }
    function msg(t, err) { var R = R0(); if (R) { R.state.msg = { text: t, err: !!err }; R.render(); } }
    function setSlot(v) {
        var p = pc(); if (!p) return;
        if (!p.safetyProgramPlan || typeof p.safetyProgramPlan !== 'object') p.safetyProgramPlan = {};
        if (!p.safetyProgramPlan.slots || typeof p.safetyProgramPlan.slots !== 'object') p.safetyProgramPlan.slots = {};
        p.safetyProgramPlan.slots.combinedEffects = v;
    }
    function pick(qid, opt) {
        try {
            var s0 = store(), m;
            if (qid === 'pasa.scope') s0.front.scope = opt;
            else if (qid === 'pasa.desc') s0.front.desc = opt;
            else if (qid === 'pasa.method') s0.front.method = opt;
            else if (qid === 'pasa.coffe') setSlot(opt === 'yes' ? 2 : 0);   // yes: the hybrid (MAC model and CoFFE), the Plan Autopilot's mapping
            else if ((m = /^fc\.([^.]+)\.trace\.(.+)$/.exec(qid))) {
                var gr = groupOf(m[1]); if (!gr) throw fail('This failure condition is no longer offered.');
                if (opt === 'ex') { ui.open[qid] = 'ex'; var R = R0(); if (R) R.render(); return; }
                var sg = sysGroups(m[2]).filter(function (x) { return 'tr:' + x.fcId === opt; })[0]; if (!sg) throw fail('That failure condition is no longer in the system.');
                sg.rows.forEach(function (r) { var l = traceList(r.acTrace); if (l.indexOf(gr.fcId) < 0 && !l.some(function (t) { return gr.rows.some(function (x) { return S(x.internalId) === t; }); })) { l.push(gr.fcId); r.acTrace = l.join(', '); } });
                delete fcStore(gr.fcId).ex[m[2]];
            } else if ((m = /^fc\.(.+)\.link\.([^\u00A7]+)\u00A7(.+)$/.exec(qid))) {
                var grL = groupOf(m[1]), pgL = grL ? treeOf(grL) : null, FL = Tr(); if (!grL || !pgL || !FL || !FL.link) throw fail('This failure condition has no fault tree to link into.');
                var cL = linkCands(grL).filter(function (x) { return x.key === m[2] + '\u00A7' + m[3]; })[0]; if (!cL) throw fail('That system failure condition is no longer traced here.');
                var stL = fcStore(grL.fcId); if (!stL.link) stL.link = {};
                if (opt === 'yes') { if (!cL.linked) { var rL = FL.link(pgL, { sysId: cL.sysId, fcId: cL.fcId }); if (!rL.ok) throw fail(rL.why || 'Not linked.'); } delete stL.link[cL.key]; }
                else {
                    if (cL.via === 'transfer') throw fail('It is in the ' + grL.fcId + ' tree by a transfer. Take the transfer out in the Fault trees tab.');
                    if (cL.via === 'node') { var uL = FL.unlink(pgL, { sysId: cL.sysId, fcId: cL.fcId }); if (!uL.ok) throw fail(uL.why || 'Not taken out.'); }
                    stL.link[cL.key] = 'no';
                }
                try { if (FL.sweep) FL.sweep({ quiet: true, noAsk: true }); } catch (_) {}
                try { if (typeof root._slSharedStrictestRound === 'function') root._slSharedStrictestRound(); } catch (_) {}
            } else if ((m = /^fc\.([^.]+)\.res\.(.+)$/.exec(qid))) {
                if (opt === 'none') { ui.open[qid] = 'none'; var R1 = R0(); if (R1) R1.render(); return; }
                fcStore(m[1]).res[m[2]] = { where: opt, by: who(), at: now() };
            } else if ((m = /^fc\.([^.]+)\.coffe\.(.+)$/.exec(qid))) {
                var gr2 = groupOf(m[1]); if (!gr2) return;
                var p = pc(); if (!p.coffe) p.coffe = { verdicts: {} }; if (!p.coffe.verdicts) p.coffe.verdicts = {};
                p.coffe.verdicts[S(gr2.gov.internalId) + '§' + m[2]] = { verdict: opt === 'yes' ? 'yes' : 'no', by: who(), at: now() };
            } else return;
            save(); done(qid);
        } catch (e) { msg(e && e.userFacing ? e.message : 'Not saved: ' + (e && e.message || e), true); }
    }
    function text(qid, elId) {
        var el = typeof document !== 'undefined' ? document.getElementById(elId) : null, v = el ? String(el.value || '').trim() : '';
        var s0 = store(), m;
        if (qid === 'pasa.scopeNote') { s0.front.scopeNote = v; save(); return done('pasa.scope'); }
        if (qid === 'pasa.descText') { s0.front.descText = v; save(); return done('pasa.desc'); }
        if (qid === 'pasa.methodText') { s0.front.methodText = v; save(); return done('pasa.method'); }
        if (!v) return msg('Say why before saving: the report records the reason.', true);
        if ((m = /^fc\.([^.]+)\.trace\.(.+)\.why$/.exec(qid))) { fcStore(m[1]).ex[m[2]] = { why: v, by: who(), at: now() }; delete ui.open['fc.' + m[1] + '.trace.' + m[2]]; save(); return done('fc.' + m[1] + '.trace.' + m[2]); }
        if ((m = /^fc\.([^.]+)\.res\.(.+)\.why$/.exec(qid))) { fcStore(m[1]).res[m[2]] = { where: 'none', why: v, by: who(), at: now() }; delete ui.open['fc.' + m[1] + '.res.' + m[2]]; save(); return done('fc.' + m[1] + '.res.' + m[2]); }
    }
    function cell(fcId, colId, yn) {
        var gr = groupOf(fcId); if (!gr) return;
        idpStore().cells[cellKey(gr.gov, colId)] = { state: yn === 'yes' ? 'asserted' : 'cleared', by: who(), at: now() };
        save(); done('fc.' + fcId + '.idp');
    }
    function idpNone(fcId) {
        var gr = groupOf(fcId); if (!gr) return;
        var st = idpStore(), n = 0;
        idpRows(gr).forEach(function (r) { r.cells.forEach(function (x) { if (x.cell.state === 'unreviewed') { st.cells[cellKey(gr.gov, x.colId)] = { state: 'cleared', by: who(), at: now() }; n++; } }); });
        save(); done('fc.' + fcId + '.idp');
        return n;
    }
    async function idpAi(fcId) {
        var gr = groupOf(fcId); if (!gr) return;
        if (typeof root.idpAiSweep !== 'function') return msg('The AI is not set up in this project. Answer the rows by hand, or set the AI up in Settings.', true);
        ui.busy = fcId; var R = R0(); if (R) R.render();
        try { await root.idpAiSweep({ fcIds: gr.rows.map(function (r) { return S(r.internalId); }) }); }
        catch (e) { msg('The AI could not draft the rows: ' + (e && e.message || e), true); }
        finally { ui.busy = null; save(); done('fc.' + fcId + '.idp'); }
    }
    // a tick on or off: the report's level for a type, or one function's (its own list starts from the report's)
    function level(type, lv, fnId) {
        var RT = root.SLReqTrace; if (!RT) return;
        try { RT.toggleLevel(type, lv, fnId ? { fn: fnId } : 'types'); } catch (e) { return msg(e.message, true); }
        save(); done(fnId ? 'fn.' + fnId + '.req' : 'pasa.lvl');
    }
    function levelReset(type, fnId) { var RT = root.SLReqTrace; if (!RT) return; RT.setLevels(type, null, { fn: fnId }); save(); done('fn.' + fnId + '.req'); }
    // put one function's requirements in the registers: each aircraft row ticked "aircraft" (AutoReq's own merge, by source),
    // then each flowed-down row in its system's requirements, traced to the aircraft row; one row per source, never two
    function acceptReqs(fnId) {
        var AR = g('AutoReq'), m = merge(), RT = root.SLReqTrace; if (!AR || !m || !RT) return;
        var grs = fnGroups(fnId), keepAc = [], flows = [];
        grs.forEach(function (gr) { reqsFor(gr).forEach(function (x) { if (x.aircraft || !x.levels.length) keepAc.push(S(x.cand.reqSource.sourceId)); x.flows.forEach(function (fl) { if (fl.state !== 'in') flows.push({ x: x, fl: fl }); }); }); });
        var sub = { scope: m.scope || 'ac', isNew: arr(m.isNew).filter(function (c) { return keepAc.indexOf(S(c.reqSource.sourceId)) >= 0; }), isUpdated: arr(m.isUpdated).filter(function (u) { return keepAc.indexOf(S(u.next.reqSource.sourceId)) >= 0; }), unchanged: [], orphaned: [], migrations: [], migrationUnresolved: [] };
        try { if (sub.isNew.length || sub.isUpdated.length) AR.applyMerge(sub, { acceptNew: true, acceptUpdates: true, acceptOrphanRemoval: false }); } catch (e) { return msg('Not added: ' + (e && e.message || e), true); }
        // the flowed-down rows, per system
        var bySys = {};
        flows.forEach(function (o) { (bySys[o.fl.sysId] = bySys[o.fl.sysId] || []).push(o); });
        Object.keys(bySys).forEach(function (sysId) {
            var news = [];
            bySys[sysId].forEach(function (o) {
                var parent = stored(o.x.cand.reqSource.sourceId), c = o.fl.cand;
                c.parentReqId = parent ? S(parent.internalId) : '';
                var st = storedSys(sysId, c.reqSource.sourceId);
                if (st) { st.text = c.text; st.rat = c.rat; st.reqSource = c.reqSource; st.parentReqId = c.parentReqId; }
                else news.push(c);
            });
            if (news.length) { try { AR.applyMerge({ scope: 'sys-' + sysId, isNew: news, isUpdated: [], unchanged: [], orphaned: [], migrations: [], migrationUnresolved: [] }, { acceptNew: true, acceptUpdates: false, acceptOrphanRemoval: false }); } catch (e) { return msg('Not added to the ' + sysName(sysId) + ' requirements: ' + (e && e.message || e), true); } }
        });
        _rq.gen = -3; RT.ensureIds(); RT.syncLevels();
        save(); done('fn.' + fnId + '.req');
    }
    // 11 Nov 2026: opens THAT tree (it opened the list of trees: the function it called does not exist)
    function openTree(pid) { try { if (typeof root.switchTab === 'function') root.switchTab('fta'); if (typeof root.openFTAPageById === 'function') root.openFTAPageById(pid); else if (root.SLTreeHomes) root.SLTreeHomes.open('pasa'); } catch (_) {} }

    // ---- outputs and acceptance (the old completion checklist) -----------------------------------------------------------
    function fpOf(o) { try { return JSON.stringify(o); } catch (_) { return String(Math.random()); } }
    function outputs() {
        var pk = picks();   // every applicable failure condition, across all the appendices
        return [
            { id: 'idp', what: 'How the systems feed each failure condition, confirmed', accept: 'Every system function answered for every appendix; every system that feeds a failure condition traced, or excluded with a reason', role: 'Chief safety engineer', fp: function () { return fpOf(pk.map(function (id) { var gr = groupOf(id); return gr ? idpRows(gr).map(function (r) { return r.sysId + r.state; }).join(',') + JSON.stringify(fcStore(id).ex) : ''; })); } },
            { id: 'cr', what: 'Shared resources and common causes dispositioned', accept: 'Each one points to the review that looks at it, or says why it cannot defeat an independence', role: 'Chief safety engineer', fp: function () { return fpOf(pk.map(function (id) { return fcStore(id).res; })); } },
            { id: 'budget', what: 'Each fault tree within its objective', accept: 'No appendix above its objective; each critical gate sent to a common mode review', role: 'Safety analyst', fp: function () { return fpOf(pk.map(function (id) { var gr = groupOf(id), tf = gr && built(gr) ? treeFacts(gr) : null; return tf ? [tf.rate, tf.meets && tf.meets.pass] : null; })); } },
            { id: 'fdal', what: 'Aircraft development assurance levels', accept: 'Each failure condition\'s FDAL set from its severity and carried by its requirements', role: 'Development assurance lead', fp: function () { return fpOf(pk.map(function (id) { var gr = groupOf(id); return gr ? target(gr.gov.severity).dal : null; })); } },
            { id: 'req', what: 'The requirements for each failure condition, in the aircraft requirements', accept: 'Every requirement AutoReq generates for an appendix is in the register, with its rationale and where it is driven from', role: 'Requirements lead', fp: function () { return fpOf(pk.map(function (id) { var gr = groupOf(id); return gr ? reqsFor(gr).map(function (x) { return x.state + x.cand.reqSource.fingerprint; }) : null; })); } },
            { id: 'recon', what: 'System severities agree with the aircraft', accept: 'No system failure condition traced to an aircraft one is rated less severe than its consequence allows', role: 'Chief safety engineer', fp: function () { return fpOf(pk); } },
            { id: 'concl', what: 'The conclusions', accept: 'Each appendix and the report as a whole concluded, by the engineer or from an accepted AI draft', role: 'Chief safety engineer', fp: function () { return fpOf((pc() && pc().ccaReports && pc().ccaReports.pasa && pc().ccaReports.pasa.authored) || {}); } }
        ];
    }

    // ---- the frame ---------------------------------------------------------------------------------------------------------
    var _R = null;
    function define() {
        var CR = root.SLCcaReport; if (!CR || typeof CR.define !== 'function') return null;
        if (typeof document === 'undefined' || !document.getElementById('view-pasa')) return null;
        _R = CR.define({
            key: 'pasa', viewId: 'view-pasa', leftId: 'pasa-auto-host', title: 'Preliminary Aircraft Safety Assessment', code: 'PASA',
            lead: 'One report for the aircraft: the front of the report says what it covers, how it is done and what it found; each function with a failure condition rated Minor or above has its own appendix holding all of those failure conditions. Answer the questions on the left; the report on the right writes itself.',
            appendices: true,
            tabs: { allLabel: false, parts: true, pickLabel: 'Part', frontLabel: 'Front of the report', noun: 'function', partLabel: function (s) { var f = fnOf(fnOfSid(s)); return f ? fnTitle(f) : S(s); } },
            reports: function () { return [{ id: 'aircraft', code: '001', label: 'Aircraft', title: 'Aircraft', sections: appendices().map(sid) }]; },
            front: front, after: after, sections: sections, renderQuestions: renderQuestions, outputs: outputs,
            authored: [{ id: 'conclusion', title: 'Conclusion', purpose: 'Whether the architecture as planned keeps each failure condition of this function within its objective, what that rests on, and what is still open.' }],
            reportAuthored: [{ id: 'conclusion', title: 'Conclusion', purpose: 'Whether the aircraft as planned meets the safety objectives of the failure conditions assessed, what that rests on, and what is still open.' }],
            reportFacts: function () { return 'The front of the report: ' + front({}).filter(function (b) { return b.k === 'p'; }).map(function (b) { return b.text; }).join(' '); },
            aiType: 'PASA',
            aiReady: function (s) { var f = fnOfSid(s); if (f) { var l = fnLeft(f); return { ready: !l.length, left: l }; } var l2 = frontLeft().concat(appendices().filter(function (id) { return fnLeft(id).length; }).map(function (id) { return 'The questions of the appendix for ' + fnTitle(fnOf(id)); })); return { ready: !l2.length, left: l2 }; },
            io: { does: 'Works out, early and from the architecture, whether the aircraft can meet the safety objective of each failure condition it assesses, and what each system must promise for that to hold.',
                inputs: [{ id: 'afha', what: 'The aircraft functional hazard assessment', from: 'AFHA', tab: 'ac-fha' }, { id: 'arch', what: 'The architecture: systems, functions and shared resources', from: 'Architecture', tab: 'arch' }, { id: 'trees', what: 'The generated fault trees', from: 'Fault trees', tab: 'fta' }, { id: 'sfha', what: 'The system functional hazard assessments', from: 'SFHA', tab: 'pssa' }],
                outputs: [{ id: 'reqs', what: 'Aircraft requirements with their rationale and source', to: 'Aircraft requirements', tab: 'ac-req' }, { id: 'budgets', what: 'Budgets handed down to the systems', to: 'PSSA', tab: 'pssa' }, { id: 'claims', what: 'Independence claims to show', to: 'CMA', tab: 'cma' }] }
        });
        return _R;
    }
    (function boot(tries) {
        if (define()) return;
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { boot(tries - 1); }, 250);
    })(80);

    // ---- the pages beside the fault trees -----------------------------------------------------------------------------
    // Waqas, 10 Nov 2026: the MAC model, MF&MS and CEA move into the Fault trees tab beside the trees; they are not Autopilot
    // questions (the Autopilot uses what they produce and shows their open items). One bar across the top of each of those
    // pages (and of the PASA's fault trees) joins them; the shared resource list (the architecture's) is there too.
    var BESIDE = [{ id: 'fta', label: 'Fault trees' }, { id: 'mac', label: 'MAC model' }, { id: 'mfms', label: 'MF&MS' }, { id: 'cea', label: 'Cascading effects' }, { id: 'resources', label: 'Shared resources' }];
    function besideBar(cur) { return '<div class="sys-workspace-nav" data-pasa-beside="1">' + BESIDE.map(function (b) { return '<button type="button" class="' + (b.id === cur ? 'active' : '') + '" data-pasa-beside-to="' + E(b.id) + '" onclick="SLPasaAuto.besideGo(' + J(b.id) + ')">' + E(b.label) + '</button>'; }).join('') + '</div>'; }
    function besideGo(id) { try { if (id === 'fta' && root.SLTreeHomes) root.SLTreeHomes.open('pasa'); else if (typeof root.switchTab === 'function') root.switchTab(id); } catch (_) {} }
    function pasaHome() { var H0 = root.SLTreeHomes; var c = H0 && H0.current ? safe(function () { return H0.current(); }, null) : null; return !c || c.home === 'pasa'; }
    function placeBeside(tabId) {
        if (typeof document === 'undefined') return;
        BESIDE.forEach(function (b) {
            var v = document.getElementById('view-' + b.id); if (!v) return;
            var old = v.querySelector(':scope > [data-pasa-beside]'); if (old) old.remove();
            if (b.id !== tabId || (b.id === 'fta' && !pasaHome())) return;
            var head = v.querySelector(':scope > .header-with-export');
            var wrap = document.createElement('div'); wrap.innerHTML = besideBar(b.id);
            var bar = wrap.firstChild; if (head && head.nextSibling) v.insertBefore(bar, head.nextSibling); else v.insertBefore(bar, v.firstChild);
        });
    }
    (function wrapNav(tries) {
        if (typeof root.switchTab !== 'function') { if (tries > 0) setTimeout(function () { wrapNav(tries - 1); }, 100); return; }
        if (root.switchTab._pasaBeside) return;
        var orig = root.switchTab, w = function (tabId) { var r = orig.apply(this, arguments); try { placeBeside(tabId); } catch (_) {} return r; };
        w._pasaBeside = true; Object.keys(orig).forEach(function (k) { try { w[k] = orig[k]; } catch (_) {} });
        root.switchTab = w;
    })(80);

    // what the PSSA Autopilot shares with this one (pssa_autopilot.js): the same words, numbers and tree pictures
    var lib = { sci: sci, T: T, E: E, S: S, J: J, arr: arr, safe: safe, listJoin: listJoin, lc: lc, rank: rank, SEV_RANK: SEV_RANK, SEV_WORDS: SEV_WORDS, target: target, kids: kids, walk: walk, nodeName: nodeName,
        cutsets: cutsets, metricsOf: metricsOf, allocated: allocated, cgOf: cgOf, cmas: cmas, CLOSE: CLOSE, acRef: acRef, regulation: regulation, style: style, sysName: sysName, sysById: sysById, systems: systems, traceList: traceList };
    var api = { VERSION: VERSION, lib: lib, besideGo: besideGo, placeBeside: placeBeside, candidates: candidates, picks: picks, appendices: appendices, functions: functions, fnGroups: fnGroups, fnSection: fnSection, routeOf: routeOf, isQuant: isQuant, fnLeft: fnLeft, linkCands: linkCands, built: built, gateFlags: gateFlags, fnOf: fnOf, fnTitle: fnTitle, feeders: feeders, critGates: critGates, treeOf: treeOf, groupOf: groupOf, idpRows: idpRows, untraced: untraced, resources: resources, treeFacts: treeFacts, reqsFor: reqsFor,
        frontLeft: frontLeft, fcLeft: fcLeft, openItems: openItems, tracedNotInTree: tracedNotInTree, treeNotInTable: treeNotInTable, section: section, front: front, coffeOn: coffeOn, store: store, outputs: outputs,
        ui: { pick: pick, text: text, cell: cell, idpNone: idpNone, idpAi: idpAi, level: level, levelReset: levelReset, acceptReqs: acceptReqs, openTree: openTree } };
    try { root.SLPasaAuto = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

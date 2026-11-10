// ============================================================================
// fc_auto_trees.js, v1.0, 24 Oct 2026: every failure condition that needs a fault tree has one, its top event
// filled in, and a system tree's target passed down from the aircraft tree above it.
//
// Waqas, 24 Oct 2026: "when you have the AFHA failure conditions all the top down trees must have their top gets
// pre-fed to the PASA trees (keeping the allocation you will have for the most conservative phase/s and the
// respective exposure time), once we have a SFHA those failure conditions get same treatment at the PSSA level,
// for SFHA top level allocations we need them to be linked to the aircraft level trees ideally their bottom
// events, if the system level failure condition has a more stringent allocation from the aircraft level then it
// needs to keep its allocation for the PSSA top gate from the aircraft otherwise it gets it from SFHA
// classification if that is more conservative"; "only major and above get a tree"; the 1309 chart "should be the
// one triggering need for trees"; an unanswered chart gets a tree (Part 25 assumes quantitative until shown
// otherwise) and "those failure conditions must be flagged to be charted" on the worst-severity row only;
// "whichever gives us the most conservative one" (several phases sharing the worst classification: their
// exposure is added together).
//
// A FAILURE CONDITION is the AFHA's (or one system's SFHA's) rows that share an FC ID (a row without one stands
// alone). Its GOVERNING row is the worst severity (ties: the longest exposure).
//   needsTree: governing severity Major or worse, and its 1309 chart says quantitative, or is not answered yet.
//   its tree:  any top-down tree at its level linked to any of its rows (a hand-made tree, a MAC page, an MF&MS
//              seed, the chart's "Create fault tree"): never a second one. Otherwise one is made: PASA for the
//              AFHA, the system's PSSA for an SFHA, linked to its rows (governing first), its top event named for
//              it. A PASA tree made here carries one bottom event for every SFHA failure condition that traces to
//              it (acTrace), each linked to it (externalSource SYS_<row>), the way the MF&MS seeds do; one traced
//              later is added to it. Its verification tree follows (verify_sync.js).
//   no longer needs one (reclassified, the chart answered qualitative or similarity, the row deleted): a tree
//              made here that nobody built on goes; one somebody built on is asked about.
//   its target: the classification's (getSafetyTarget); for a system tree, the aircraft tree's allocation at the
//              bottom event linked to it when that is stricter (that event's budget is already the stricter of
//              the aircraft's share and the SFHA class: allocateTopDown caps it with _getExternalSourceTarget).
//              Written to page.targetP (what allocateTopDown runs on) with its basis (page.targetBasis), unless
//              the tree's target was set by hand (page.targetManual).
//   exposure:  slGoverningPhases(page) = every phase of the linked rows that carry the worst classification
//              (assurance_modules.js, helpers _fhaExposureContext and the exposure panel read it).
//
// v2.0, 11 Nov 2026 (Waqas, on a generated FC-01 tree whose three inputs added up to 1e-3 under a 1e-9 top: "this math is
// incorrect"; "why are we doing the linking here, rather than linking them in the fault tree module, where the rule already
// exists that each node keep its most conservative instances allocation?"; "why are building the fault trees rather than just
// saying fault trees have not been created yet? the shared node mechanism already exists too"; "we should ask the user if that
// failure condition's fault tree ready to be linked or not in the auto pilot"):
//   THE TOOL NO LONGER BUILDS A TREE'S INPUTS. A tree made here is its top event, pre-fed, and nothing else (the placeholder
//   "Decompose" event stays until something is built). No event is added for a traced SFHA failure condition, at making or later.
//   A SYSTEM FAILURE CONDITION IS ONE SHARED NODE. link(page, key) puts it in an aircraft tree, under the top: a basic event with
//   the SAME logical ID in every tree it is in (projectConfig.sysNodes keeps the ID per system and failure condition; a system
//   function the interdependence table shows feeding it, with no SFHA failure condition matched yet, has one too, and keeps it
//   when its failure condition is matched). Only the engineer links: the PASA Autopilot's "ready to be linked?" answer, or the
//   fault tree module's reuse menu (event_reuse.js lists these nodes). Its number is the fault tree module's own rule: each tree's
//   share, the strictest held everywhere (slSharedStrictestPass, which now covers transfers to a tree too). ceiling(node) keeps it
//   no looser than its own class objective (a limit, never the answer: allocateTopDown).
//   THE SYSTEM TREE'S TARGET IS THAT SAME NUMBER: shares(page) lists what every aircraft tree gives the node (and every transfer
//   to the tree), each aircraft tree allocated on a copy; effectiveTarget takes the strictest, or the SFHA class if tighter.
//   The private "stricter applies" path through FHA links is gone. EXISTING PROJECTS: an event this file added to a tree
//   (an FHA link to an SFHA row) is taken out of a tree nobody built on, and turned into the shared node where somebody did
//   (migrate(), once per load and after every merge; MF&MS seed trees are idp_seed_trees.js's own and are left alone).
//
// API (window.SLFcTrees): groups(scope), route(row), characterized(row), needsChart(row), sweep(opts),
// effectiveTarget(page), governingPhases(page), treeFor(group). Kill switch: window.SL_FC_TREES_OFF = true.
// Load: after helpers_modules.js, assurance_modules.js (AutoReq), fc_tree_flow.js, tree_homes.js and before
// verify_sync.js. Tests: tests/regression_fc_auto_trees_20261024.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '2.0';   // 2.0 11 Nov 2026: no inputs built here, a system failure condition is one shared node linked by the engineer;   // 1.9 10 Nov 2026: an SFHA row feeding several aircraft failure conditions gets its branch on each; 1.8 8 Nov 2026: one tree per failure condition, in any state (see "ONE TREE" below).
    // 1.5 30 Oct 2026: makeTree in the API (fc_link.js opens a picked condition's tree).
    // 1.4 26 Oct 2026: a tree whose failure condition was marked not applicable in the FCIM is asked about in those words
    var MAJOR = 3;

    // 26 Oct 2026 (v1.3): the project stores are top-level `let`s, not window properties, and the app's CSP forbids
    // eval, so v1.2's eval read threw on every install and the sweep saw an empty project (customer report: no trees made, the
    // tree selector empty). Read through SLEnv (sl_env.js, rule 5); window only for what really is on it.
    function _g(n) {
        try { var E = root.SLEnv; if (E && typeof E.get === 'function') { var v = E.get(n); if (v !== undefined) return v; } } catch (_) {}
        try { return root[n]; } catch (_) { return undefined; }
    }
    function _pages() { var p = _g('ftaPages'); return Array.isArray(p) ? p : (root.ftaPages || []); }
    function _ac() { var a = _g('acFhaData'); return Array.isArray(a) ? a : []; }
    function _systems() { var s = _g('systemsData'); return Array.isArray(s) ? s : []; }
    function _rank(sev) { var R = _g('SEVERITY_RANK') || { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1 }; return R[sev] || 0; }
    function _call(name) { var f = root[name]; if (typeof f !== 'function') f = _g(name); if (typeof f !== 'function') return; try { return f.apply(root, Array.prototype.slice.call(arguments, 1)); } catch (e) { try { console.warn('[fc_auto_trees] ' + name, e); } catch (_) {} } }
    function _toast(m, k, ms) { _call('showToast', m, k || 'info', ms || 5000); }
    // the app's one id counter: a top-level `let` every classic script shares by name (no eval needed to write it)
    function _nid() { try { return internalIdCounter++; } catch (_) { return Date.now() + Math.floor(Math.random() * 1000); } }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _lid(n) { return String(n.logicalId != null ? n.logicalId : n.id); }
    function _links(p) { return (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds.map(String) : (p.linkedFhaId != null && p.linkedFhaId !== '' ? [String(p.linkedFhaId)] : []); }
    function _exposure(row) { try { var e = _call('getPhaseExposureRatio', row && row.phases); return (e && e.exposedHours) || 0; } catch (_) { return 0; } }

    // ---- the 1309 chart ----------------------------------------------------------------------------------
    // answered: the same test the row's Chart button uses (helpers _fhaChartTriggerHtml)
    function characterized(row) {
        var cp = (row && row.chartProps) || {}, sev = row && row.severity;
        var set = function (v) { return v !== null && v !== undefined; };
        if (cp.similarPrior === true) return true;
        if (sev === 'Major') return set(cp.isSimple) && set(cp.isRedundant);
        if (sev === 'Hazardous' || sev === 'Catastrophic') return set(cp.isSimpleConventional);
        return true;
    }
    // 'none' (below Major), 'unanswered', 'quant', 'qual', 'similarity'
    function route(row) {
        if (!row || _rank(row.severity) < MAJOR) return 'none';
        if (!characterized(row)) return 'unanswered';
        var d = null;
        try { var AR = _g('AutoReq'); if (AR && AR.decideAnalysisDepth) d = AR.decideAnalysisDepth(row); } catch (_) {}
        if (!d) return 'quant';
        if (d.skip) return 'none';
        if (d.mode === 'similarity') return 'similarity';
        if (d.mode === 'qualitative') return 'qual';
        return 'quant';
    }
    var ROUTE_WORDS = { unanswered: 'Chart not answered', quant: 'Quantitative, tree needed', qual: 'Qualitative', similarity: 'Similarity' };

    // ---- failure conditions ---------------------------------------------------------------------------------
    function _governing(rows) {
        var g = null;
        rows.forEach(function (r) {
            if (!g) { g = r; return; }
            var a = _rank(r.severity), b = _rank(g.severity);
            if (a > b || (a === b && _exposure(r) > _exposure(g))) g = r;
        });
        return g;
    }
    // scope: 'ac' or a system object. Kept for as long as nothing in the project changes (SLDataChange): the FHA
    // rows ask for it once each when they draw (needsChart)
    var _memo = { gen: -1, map: new Map() };
    function groups(scope) {
        var dc = root.SLDataChange, gen = dc ? dc.gen() : null;
        if (gen == null) return _groupsNow(scope);
        if (_memo.gen !== gen) { _memo.gen = gen; _memo.map = new Map(); }
        var k = scope === 'ac' ? 'ac' : scope;
        if (!_memo.map.has(k)) _memo.map.set(k, _groupsNow(scope));
        return _memo.map.get(k);
    }
    function _groupsNow(scope) {
        var rows = scope === 'ac' ? _ac() : ((scope && scope.fha) || []);
        var by = {}, out = [];
        rows.forEach(function (r) {
            if (!r) return;
            var k = r.fcId ? 'fc:' + String(r.fcId).trim() : 'row:' + r.internalId;
            if (!by[k]) { by[k] = { key: k, fcId: r.fcId ? String(r.fcId).trim() : '', rows: [], scope: scope === 'ac' ? 'ac' : 'sys', sys: scope === 'ac' ? null : scope }; out.push(by[k]); }
            by[k].rows.push(r);
        });
        out.forEach(function (g) {
            g.gov = _governing(g.rows);
            g.route = route(g.gov);
            g.needsTree = _rank(g.gov.severity) >= MAJOR && (g.route === 'quant' || g.route === 'unanswered');
            // the worst-severity rows, governing first (their phases add up for the exposure)
            var w = _rank(g.gov.severity);
            g.worst = [g.gov].concat(g.rows.filter(function (r) { return r !== g.gov && _rank(r.severity) === w; }));
        });
        return out;
    }
    // the row whose chart decides: flagged when its chart is not answered (only that row of the condition)
    function needsChart(row) {
        if (!row || _rank(row.severity) < MAJOR || characterized(row)) return false;
        var scope = _ac().indexOf(row) >= 0 ? 'ac' : _systems().find(function (s) { return s && (s.fha || []).indexOf(row) >= 0; });
        if (!scope) return false;
        var g = groups(scope).find(function (x) { return x.rows.indexOf(row) >= 0; });
        // 25 Oct 2026: a row the remembered groups do not hold means the rows were replaced without a data change being
        // seen (a project opened in place): the groups are worked out again, never answered from the old ones
        if (!g) g = _groupsNow(scope).find(function (x) { return x.rows.indexOf(row) >= 0; });
        return !!g && g.gov === row;
    }

    // 25 Oct 2026 (found testing the live app): the FHA table drawn as a project opens can come before this file has
    // loaded, or before the groups are known, and then the rows that need the chart wear no dot until something else
    // redraws the table. Every few seconds the rows on screen are compared with what they should show; a table that
    // disagrees is drawn again (only on screen, never while the person types or a dialog is open).
    var FHA_TABLES = [{ body: 'ac-fha-body', render: 'renderACFHA', rows: function () { return _ac(); } },
                      { body: 'sys-fha-body', render: 'renderSysFHA', rows: function () { var id = _g('activeSystemId'); var sy = _systems().find(function (x) { return x && String(x.id) === String(id); }); return (sy && sy.fha) || []; } }];
    function flagsOutOfStep() {
        if (typeof document === 'undefined') return [];
        var out = [];
        FHA_TABLES.forEach(function (T) {
            var tb = document.getElementById(T.body); if (!tb || tb.offsetParent === null) return;
            var rows = T.rows(), byId = {};
            rows.forEach(function (r) { if (r) byId[String(r.internalId)] = r; });
            var wrong = 0;
            Array.prototype.forEach.call(tb.querySelectorAll('.fha-chart-trigger'), function (b) {
                var m = /openFhaChartModal\('([^']*)'/.exec(b.getAttribute('onclick') || ''); if (!m) return;
                var r = byId[m[1]]; if (!r) return;
                if (needsChart(r) !== b.hasAttribute('data-needs-chart')) wrong++;
            });
            if (wrong) out.push(T);
        });
        return out;
    }
    function syncFlags() {
        var CA = root.SLChangeAck;
        try {
            if (CA && CA.status && CA.status().prompting) return 0;
            if (CA && ((CA.typing && CA.typing()) || (CA.busy && CA.busy()))) return 0;
            if (typeof document !== 'undefined' && Array.prototype.some.call(document.querySelectorAll('.modal-overlay.show, .sl-dialog-overlay.show'), function (o) { return o.offsetParent !== null || (root.getComputedStyle && root.getComputedStyle(o).display !== 'none' && root.getComputedStyle(o).position === 'fixed'); })) return 0;
        } catch (_) {}
        var bad = flagsOutOfStep();
        bad.forEach(function (T) { try { var f = root[T.render]; if (typeof f === 'function') f(); } catch (_) {} });
        return bad.length;
    }
    // ---- ONE TREE (8 Nov 2026, live student data) -----------------------------------------------------------
    // A collaborator's screen built the tree pages from their shells before the nodes arrived (crdt_sync.js
    // _ftaRecompose: root null until then). The old treeFor skipped a page with no root, so the sweep made a second
    // tree for each of the 11 failure conditions, and make() gave each one a new id with a time suffix
    // (fc-auto-ac-FC-01-mw88sosh). A tree's identity is its FAILURE CONDITION, not its page id or its state:
    //   treeFor(g) finds the condition's tree in ANY state: nodes not arrived yet (root null), obsolete, made here
    //   (autoFcTree scope + system + key) or made by hand and linked to its rows. A copy waiting for review
    //   (duplicateOf, fta_dedupe.js) is never the tree. Preference: the page with the condition's own id, then one
    //   made here for it, then one linked to its rows.
    //   The sweep WAITS on a condition whose tree has no root yet (does nothing for it this tick).
    //   make() never suffixes an id: the condition's tree, or a page already holding its id, is adopted.
    function baseId(g) { return 'fc-auto-' + (g.scope === 'ac' ? 'ac' : g.sys.id) + '-' + String(g.fcId || g.gov.internalId).replace(/[^A-Za-z0-9_-]+/g, '_'); }
    function _atLevel(p, g) { return g.scope === 'ac' ? p.treeLevel === 'aircraft' : (p.treeLevel === 'system' && String(p.systemId) === String(g.sys.id)); }
    function _madeFor(p, g) {
        var a = p && p.autoFcTree; if (!a || a.key !== g.key) return false;
        return g.scope === 'ac' ? a.scope === 'ac' : (a.scope !== 'ac' && String(a.systemId) === String(g.sys.id));
    }
    function treeFor(g) {
        if (!g) return null;
        var ids = g.rows.map(function (r) { return String(r.internalId); }), bid = baseId(g);
        var cands = _pages().filter(function (p) {
            if (!p || p.verifies || p.duplicateOf || (p.mode || 'top-down') !== 'top-down') return false;
            if (_madeFor(p, g)) return true;
            if (!_atLevel(p, g)) return false;
            return p.id === bid || _links(p).some(function (l) { return ids.indexOf(l.replace(/^(AC_|SYS_)/, '')) >= 0; });
        });
        return cands.find(function (p) { return p.id === bid; }) || cands.find(function (p) { return _madeFor(p, g); }) || cands[0] || null;
    }

    // ---- the trees ----------------------------------------------------------------------------------------
    function shapeFp(n) { var o = []; (function w(x, d) { if (!x) return; o.push(d + ':' + x.type + ':' + (x.gateType || '') + ':' + (x.name || '') + ':' + JSON.stringify(x.externalSource || null) + (x.sysNode ? ':sn:' + x.sysNode.sysId + ':' + (x.sysNode.fcId || x.sysNode.col || '') : '')); _kids(x).forEach(function (c) { w(c, d + 1); }); })(n, 0); return o.join('|'); }
    function _node(type, name, extra) {
        var id = _nid(), n = { id: id, logicalId: id, type: type, name: name, probability: 0, children: [] };
        // 27 Oct 2026: no failure rate on an allocation leaf (probability only, Phase 61). A lambda of 0 here was deleted by
        // the next recompute, and when that was the person's change it listed every auto tree for them to confirm.
        if (type === 'gate') { n.gateType = 'OR'; n.displayId = 'G-' + id; } else { n.inputMode = 'probability'; n.displayId = (type === 'undeveloped' ? 'UD-' : 'BE-') + id; }
        return Object.assign(n, extra || {});
    }
    // 10 Nov 2026 (v1.9): an SFHA row may feed several aircraft failure conditions ("FC-05, FC-26"), as the rest of the
    // tool reads it (findAllAcFhasForSysFc splits on commas); an exact match missed it, so a traced system had no branch.
    // A trace may name the aircraft row by its FC ID (the SFHA form) or by its internal ID (imported and demo data): both count
    function _traceList(v) { return String(v == null ? '' : v).split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean); }
    // the SFHA failure conditions that trace to an AFHA one (their rows' acTrace), one per system and FC ID
    function _traced(acGroup) {
        var out = [];
        if (!acGroup.fcId) return out;
        _systems().forEach(function (s) {
            var keys = [String(acGroup.fcId).trim()].concat(acGroup.rows.map(function (r) { return String(r.internalId); }));
            groups(s).forEach(function (sg) { if (sg.rows.some(function (r) { return _traceList(r.acTrace).concat(Array.isArray(r.acTraces) ? r.acTraces.map(String) : []).some(function (t) { return keys.indexOf(t) >= 0; }); })) out.push(sg); });
        });
        return out;
    }
    // ---- a system failure condition is one shared node (v2.0) ---------------------------------------------------------
    var PLACEHOLDER = /^Decompose: causes of /;
    function _pc() { var p = _g('projectConfig'); return p && typeof p === 'object' ? p : null; }
    function _reg() { var p = _pc(); if (!p) return []; if (!Array.isArray(p.sysNodes)) p.sysNodes = []; return p.sysNodes; }
    function _sysById(id) { return _systems().find(function (x) { return x && String(x.id) === String(id); }) || null; }
    function _sysGroup(sysId, fcId) { var sy = _sysById(sysId); return sy && fcId ? groups(sy).find(function (x) { return x.fcId === String(fcId); }) || null : null; }
    // the registry entry for a system failure condition (key.fcId) or, with none matched yet, a system function column of the
    // interdependence table (key.col). One entry, one logical ID, for good: a function's entry takes its failure condition
    // when one is matched to it (no second node for the same thing)
    function nodeKey(key, make0) {
        var L = _reg(), sysId = String(key.sysId), fc = key.fcId ? String(key.fcId) : '', col = key.col ? String(key.col) : '';
        var e = fc ? L.find(function (x) { return String(x.sysId) === sysId && String(x.fcId || '') === fc; }) : null;
        if (!e && col) e = L.find(function (x) { return String(x.sysId) === sysId && !x.fcId && String(x.col || '') === col; });
        if (e && fc && !e.fcId) e.fcId = fc;
        if (!e && make0) { e = { lid: _nid(), sysId: sysId, fcId: fc || null, col: col || null }; L.push(e); }
        return e || null;
    }
    function entryOfLid(lid) { return _reg().find(function (x) { return String(x.lid) === String(lid); }) || null; }
    function nodeName(e) {
        var sy = _sysById(e.sysId), sn = sy ? (sy.name || sy.id) : e.sysId;
        if (e.fcId) { var sg = _sysGroup(e.sysId, e.fcId); return sn + ': ' + (sg ? (sg.gov.fcDesc || e.fcId) : e.fcId); }
        var c = (_call('idpColumns') || []).find(function (x) { return String(x.colId) === String(e.col); });
        return sn + ': ' + (c && c.fnName ? c.fnName + ' fails' : 'fails');
    }
    function isSysNode(n) { return !!(n && n.sysNode && n.sysNode.sysId != null); }
    function _stamp(n, e) {
        n.logicalId = e.lid; n.sysNode = { sysId: String(e.sysId), fcId: e.fcId || null, col: e.col || null }; n.name = nodeName(e);
        delete n.externalSource; delete n._externalAllocation; delete n._inheritedAt; delete n._externalSourceStale; delete n.lambda;
        if (!n.inputMode) n.inputMode = 'probability';
        return n;
    }
    function _find(page, lid) { var hit = null, par = null; (function w(n, p) { if (!n || hit) return; if (n.type !== 'gate' && _lid(n) === String(lid)) { hit = n; par = p; return; } _kids(n).forEach(function (c) { w(c, n); }); })(page && page.root, null); return hit ? { node: hit, parent: par } : null; }
    function linked(page, key) { var e = nodeKey(key, false); return !!(e && page && page.root && _find(page, e.lid)); }
    // true when something is built under the top (the placeholder alone is not)
    function built(page) { return !!(page && page.root && _kids(page.root).some(function (c) { return !(c.type === 'undeveloped' && PLACEHOLDER.test(c.name || '')); })); }
    function link(page, key) {
        if (!page || !page.root || page.root.type !== 'gate') return { ok: false, why: 'This fault tree has no top gate to link under.' };
        var e = nodeKey(key, true), have = _find(page, e.lid);
        if (have) { _stamp(have.node, e); return { ok: true, node: have.node, was: true }; }
        var pristine = !!(page.autoFcTree && shapeFp(page.root) === page.autoFcTree.fp);
        page.root.children = _kids(page.root).filter(function (c) { return !(c.type === 'undeveloped' && PLACEHOLDER.test(c.name || '')); });
        var n = _stamp(_node('basic', ''), e);
        page.root.children.push(n);
        if (pristine) page.autoFcTree.fp = shapeFp(page.root);   // still nothing but what the tool and the link put there
        try { if (typeof root.jrnl === 'function') root.jrnl('tree-linked', n.name + ' linked into ' + (page.name || page.id)); } catch (_) {}
        _touch();
        return { ok: true, node: n };
    }
    function unlink(page, key) {
        var e = nodeKey(key, false), f = e ? _find(page, e.lid) : null;
        if (!f) return { ok: true, was: false };
        if (f.parent !== page.root) return { ok: false, why: 'It has been moved inside the tree. Take it out in the Fault trees tab.' };
        var pristine = !!(page.autoFcTree && shapeFp(page.root) === page.autoFcTree.fp);
        page.root.children = _kids(page.root).filter(function (c) { return c !== f.node; });
        if (!page.root.children.length) page.root.children.push(_node('undeveloped', 'Decompose: causes of ' + (page.root.name || 'the failure condition')));
        if (pristine) page.autoFcTree.fp = shapeFp(page.root);
        _touch();
        return { ok: true, was: true };
    }
    function _touch() { try { _allocMemo.gen = -1; _allocMemo.map = {}; } catch (_) {} try { if (root.SLDataChange && root.SLDataChange.bump) root.SLDataChange.bump(); } catch (_) {} _call('scheduleAutosave'); }
    // what may be linked into an aircraft tree: every SFHA failure condition traced to its failure condition, and, for a
    // system the interdependence table shows feeding it with nothing traced, each of its feeding functions
    function candidates(page) {
        var out = [];
        if (!page || page.treeLevel !== 'aircraft') return out;
        var rows = _rowsOf(page).filter(function (r) { return _ac().indexOf(r) >= 0; }); if (!rows.length) return out;
        var g = groups('ac').find(function (x) { return x.rows.indexOf(rows[0]) >= 0; }); if (!g) return out;
        var tracedSys = {};
        var tr = _traced(g), perSys = {}; tr.forEach(function (sg) { perSys[String(sg.sys.id)] = (perSys[String(sg.sys.id)] || 0) + 1; });
        tr.forEach(function (sg) {
            // a function's node, linked before any SFHA failure condition was matched to it, IS this failure condition's node
            // when it is the only one on each side (one function node of that system, one traced failure condition)
            var sid = String(sg.sys.id), open = _reg().filter(function (x) { return String(x.sysId) === sid && !x.fcId; });
            if (sg.fcId && perSys[sid] === 1 && open.length === 1 && !nodeKey({ sysId: sid, fcId: sg.fcId }, false)) open[0].fcId = String(sg.fcId);
        });
        tr.forEach(function (sg) { tracedSys[String(sg.sys.id)] = 1; out.push({ sysId: String(sg.sys.id), fcId: sg.fcId, col: null, name: (sg.sys.name || sg.sys.id) + ': ' + (sg.gov.fcDesc || sg.fcId), matched: true }); });
        (_call('idpColumns') || []).forEach(function (c) {
            if (!c || tracedSys[String(c.sysId)]) return;
            var cell = _call('_idpCellRaw', g.gov, c.colId);
            if (!cell || cell.state !== 'contributes') return;
            var e = nodeKey({ sysId: c.sysId, col: c.colId }, false);
            if (e && e.fcId) return;   // its failure condition was matched since
            out.push({ sysId: String(c.sysId), fcId: null, col: String(c.colId), name: (c.sysName || c.sysId) + ': ' + (c.fnName ? c.fnName + ' fails' : 'fails'), matched: false });
        });
        return out;
    }
    // no looser than its own class allows: the SFHA class objective of a system failure condition's node, or of the system
    // tree a transfer points at, as a budget over the flight (the unit a node's probability is in). A limit only.
    function ceiling(n) {
        if (!n) return null;
        var cls = null;
        if (isSysNode(n) && n.sysNode.fcId) { var sg = _sysGroup(n.sysNode.sysId, n.sysNode.fcId); if (sg) cls = (_call('getSafetyTarget', sg.gov.severity) || {}).prob; }
        else if (n.type === 'gate' && (n.transferOutTo || (n.gateType === 'TRANSFER' && n.linkedPageId))) {
            var to = String(n.transferOutTo || n.linkedPageId), tp = _pages().find(function (p) { return p && String(p.id) === to; });
            if (tp && tp.treeLevel === 'system') { var rows = _rowsOf(tp); if (rows.length) cls = (_call('getSafetyTarget', _governing(rows).severity) || {}).prob; }
        }
        if (!(typeof cls === 'number' && isFinite(cls) && cls > 0)) return null;
        var TB = root.SLTopBasis, b = TB && TB.perFlightBudget ? TB.perFlightBudget(cls, null) : null;
        return b && b.pFlight > 0 ? b.pFlight : cls;
    }
    try { root.slLinkCeiling = ceiling; } catch (_) {}
    // ONE key for everything that stands for the same system failure condition in a tree: its shared node, a transfer to its
    // own tree, and an FHA link to one of its rows (a seed tree's event). The strictest pass (event_reuse.js) groups on it, so
    // all of them hold one number. null: not a system failure condition's stand-in.
    var _keyMemo = { gen: -2, rows: null, pages: null };
    function _keyMaps() {
        var dc = root.SLDataChange, gen = dc ? dc.gen() : -1;
        if (_keyMemo.gen === gen && gen !== -1 && _keyMemo.rows) return _keyMemo;
        var rows = {}, pages = {};
        _systems().forEach(function (sy) { (sy.fha || []).forEach(function (r) { if (r && r.fcId) rows[String(r.internalId)] = 'sysfc:' + sy.id + ':' + String(r.fcId).trim(); }); });
        _pages().forEach(function (p) { if (!p || p.verifies || p.treeLevel !== 'system') return; var rs = _rowsOf(p); if (!rs.length) return; var gv = _governing(rs); if (gv && gv.fcId) pages[String(p.id)] = 'sysfc:' + p.systemId + ':' + String(gv.fcId).trim(); });
        _keyMemo = { gen: gen, rows: rows, pages: pages }; return _keyMemo;
    }
    function keyOf(n) {
        if (!n) return null;
        if (isSysNode(n)) return n.sysNode.fcId ? 'sysfc:' + n.sysNode.sysId + ':' + n.sysNode.fcId : null;
        var m = _keyMaps();
        if (n.type === 'gate') { var to = n.transferOutTo || (n.gateType === 'TRANSFER' ? n.linkedPageId : null); return to ? (m.pages[String(to)] || null) : null; }
        if (n.externalSource && (n.externalSource.kind || 'fha') === 'fha' && /^SYS_/.test(String(n.externalSource.targetId || ''))) return m.rows[String(n.externalSource.targetId).slice(4)] || null;
        return null;
    }
    // the fault tree module's reuse menu adopting one of these nodes into an event the engineer placed (event_reuse.js)
    function adoptInto(node, lid) { var e = entryOfLid(lid); if (!e || !node || node.type === 'gate') return false; _stamp(node, e); _touch(); return true; }
    // existing projects: an event this file added (an FHA link to an SFHA row, on an aircraft failure condition's own tree).
    // A tree nobody built on goes back to its top; where somebody built, the event becomes the shared node, in place.
    function migrate() {
        var n = 0;
        _pages().forEach(function (p) {
            if (!p || !p.root || p.verifies || p.duplicateOf || p.treeLevel !== 'aircraft' || (p.mode || 'top-down') !== 'top-down') return;
            if (/^(idp-pg-|mac-pg-)/.test(String(p.id)) || /MF&MS/.test(p.name || '')) return;   // the seed trees are idp_seed_trees.js's own
            var hits = [];
            (function w(x, par) { if (!x) return; if (x.type !== 'gate' && x.externalSource && /^SYS_/.test(String(x.externalSource.targetId || '')) && (x.externalSource.kind || 'fha') === 'fha') hits.push({ node: x, parent: par }); _kids(x).forEach(function (c) { w(c, x); }); })(p.root, null);
            if (!hits.length) return;
            var pristine = !!(p.autoFcTree && shapeFp(p.root) === p.autoFcTree.fp);
            hits.forEach(function (h) {
                var iid = String(h.node.externalSource.targetId).slice(4), sy = _systems().find(function (s0) { return s0 && (s0.fha || []).some(function (r) { return String(r.internalId) === iid; }); });
                var row = sy ? sy.fha.find(function (r) { return String(r.internalId) === iid; }) : null;
                var drop = pristine || !sy || !row || !h.parent;
                var e = drop ? null : nodeKey({ sysId: sy.id, fcId: row.fcId ? String(row.fcId).trim() : '', col: null }, !!row.fcId);
                if (!drop && e && _find(p, e.lid) && _find(p, e.lid).node !== h.node) drop = true;   // already in this tree: never twice
                if (drop || !e) { if (h.parent) h.parent.children = _kids(h.parent).filter(function (c) { return c !== h.node; }); }
                else _stamp(h.node, e);
                n++;
            });
            if (!_kids(p.root).length) p.root.children = [_node('undeveloped', 'Decompose: causes of ' + (p.root.name || 'the failure condition'))];
            if (pristine) p.autoFcTree.fp = shapeFp(p.root);
        });
        if (n) { try { _allocMemo.gen = -1; _allocMemo.map = {}; } catch (_) {} }
        return n;
    }
    function make(g) {
        // never a second tree for one failure condition (every caller: the sweep, fc_link.js, the API)
        var have = treeFor(g);
        if (have) return have;
        var bid = baseId(g), taken = _pages().find(function (p) { return p && p.id === bid; });
        if (taken) return _adopt(taken, g);
        var desc = g.gov.fcDesc || g.fcId || 'Failure condition';
        var rootN = _node('gate', desc, { displayId: g.fcId || undefined });
        if (!rootN.displayId) rootN.displayId = 'G-' + rootN.id;
        // v2.0: the top event, pre-fed, and the placeholder. Its inputs are the engineer's to build or to link.
        rootN.children.push(_node('undeveloped', 'Decompose: causes of ' + desc));
        var ids = _orderedIds(g);
        var page = {
            id: bid,
            name: (g.scope === 'ac' ? 'PASA' : 'PSSA') + ' · ' + (g.fcId ? g.fcId + ' ' : '') + desc.slice(0, 50),
            treeLevel: g.scope === 'ac' ? 'aircraft' : 'system', systemId: g.scope === 'ac' ? '' : g.sys.id, mode: 'top-down',
            linkedFhaIds: ids, root: rootN,
            autoFcTree: { scope: g.scope, key: g.key, systemId: g.scope === 'ac' ? null : g.sys.id, at: new Date().toISOString() }
        };
        page.autoFcTree.fp = shapeFp(rootN);
        _pages().push(page);
        try { if (typeof root.jrnl === 'function') root.jrnl('tree-created', page.name + ' made for the failure condition (1309 chart: ' + (ROUTE_WORDS[g.route] || g.route) + ')'); } catch (_) {}
        return page;
    }
    function _orderedIds(g) { return g.worst.concat(g.rows.filter(function (r) { return g.worst.indexOf(r) < 0; })).map(function (r) { return r.internalId; }); }
    // a page that already holds the condition's id is its tree: it takes the condition's identity and links, keeps its
    // nodes (a page whose nodes have not arrived keeps waiting for them)
    function _adopt(p, g) {
        p.treeLevel = g.scope === 'ac' ? 'aircraft' : 'system'; p.systemId = g.scope === 'ac' ? '' : g.sys.id; p.mode = 'top-down';
        p.linkedFhaIds = _orderedIds(g);
        if (!p.autoFcTree) p.autoFcTree = { scope: g.scope, key: g.key, systemId: g.scope === 'ac' ? null : g.sys.id, at: new Date().toISOString(), fp: p.root ? shapeFp(p.root) : '' };
        try { if (typeof root.jrnl === 'function') root.jrnl('tree-adopted', (p.name || p.id) + ' is the tree for ' + (g.fcId || 'its failure condition') + ' (it already held the condition\'s id)'); } catch (_) {}
        return p;
    }

    // ---- targets ---------------------------------------------------------------------------------------------
    function _rowsOf(page) {
        var out = [];
        _links(page).forEach(function (l) { var r = _call('_resolveLinkedFha', l); if (r && out.indexOf(r) < 0) out.push(r); });
        return out;
    }
    // every phase of the linked rows that carry the worst classification (several such rows: their phases add up)
    function governingPhases(page) {
        if (!page) return '';
        var rows = _rowsOf(page); if (!rows.length) return '';
        var w = 0; rows.forEach(function (r) { w = Math.max(w, _rank(r.severity)); });
        var seen = {}, list = [];
        rows.filter(function (r) { return _rank(r.severity) === w; }).forEach(function (r) {
            String(r.phases || '').split(/[,;\n]+/).forEach(function (t) { var s = t.trim(); if (s && !seen[s.toLowerCase()]) { seen[s.toLowerCase()] = 1; list.push(s); } });
        });
        return list.join(', ');
    }
    // an aircraft tree allocated on a copy (memoised while nothing changes): its transfers are not followed, so no
    // other tree is written to.
    var _allocMemo = { gen: -1, map: {} };
    function _allocated(p, ids) {
        var dc = root.SLDataChange, gen = dc ? dc.gen() : null;
        var mk = p.id + '|' + p.targetP + '|' + (function () { var c = _g('ftaConfig'); return (c && c.apportion) || ''; })() + '|' + (ids || []).join(',');
        if (gen != null) { if (_allocMemo.gen !== gen) { _allocMemo.gen = gen; _allocMemo.map = {}; } if (_allocMemo.map[mk] !== undefined) return _allocMemo.map[mk]; }
        var res = null;
        try {
            var t = parseFloat(p.targetP);
            var fn = (typeof root.allocateTopDown === 'function') ? root.allocateTopDown : null;
            if (fn && isFinite(t) && t > 0) {
                var TB = root.SLTopBasis, top = TB ? TB.perFlightBudget(t, p).pFlight : t;
                var copy = JSON.parse(JSON.stringify(p.root));
                // v2.0: each tree answers with its OWN share (no cap from another tree on the copy); the strictest across trees
                // is taken by the caller, the same way slSharedStrictestPass reads the uncapped allocations
                (function free(n) { if (!n) return; delete n._sharedStrictest; delete n._sharedStrictestConflict; _kids(n).forEach(free); })(copy);
                var all = new Set(_pages().map(function (x) { return x && x.id; }));
                var ap = (function () { var c = _g('ftaConfig'); return (c && c.apportion) || 'equal'; })();
                fn(copy, top, ap, all);
                res = copy;
            }
        } catch (_) { res = null; }
        if (gen != null) _allocMemo.map[mk] = res;
        return res;
    }
    function effectiveTarget(page) {
        var rows = _rowsOf(page); if (!rows.length) return null;
        var gov = _governing(rows);
        var t = _call('getSafetyTarget', gov.severity) || {};
        var cls = (typeof t.prob === 'number' && isFinite(t.prob) && t.prob > 0) ? t.prob : null;
        var out = { rate: cls, used: cls != null ? 'class' : 'none', classTarget: cls, severity: gov.severity, fcId: gov.fcId || '', aircraft: null };
        if (page.treeLevel !== 'system') return out;
        // the aircraft trees' bottom events linked to this system failure condition, at the budget the aircraft tree
        // gives them: the tree allocated on a copy (allocateTopDown, from its own target over the flight, the way the
        // open tree is), so a tree nobody has open still answers; per flight, then per flight hour like the class target
        var best = null;
        shares(page).forEach(function (x) { if (!best || x.rate < best.rate) best = x; });
        if (best) {
            out.aircraft = best;
            if (cls == null || best.rate < cls) { out.rate = best.rate; out.used = 'aircraft'; }
        }
        return out;
    }
    // 10 Nov 2026 (v1.9): every budget the aircraft trees hand this system tree (one per linked event or transfer), for the PSSA
    // Autopilot's "what the aircraft hands down" (the stricter applies; effectiveTarget takes the strictest)
    function shares(page) {
        var rows = _rowsOf(page), list = [];
        if (!rows.length || page.treeLevel !== 'system') return list;
        var ids = rows.map(function (r) { return 'SYS_' + r.internalId; });
        var sysId = String(page.systemId), fcIds = rows.map(function (r) { return r.fcId ? String(r.fcId).trim() : ''; }).filter(Boolean);
        // is this node this system failure condition? its shared node (v2.0), a transfer to this very tree, or an FHA link
        // to one of its rows (a seed tree's event, idp_seed_trees.js)
        var mine = function (n) {
            if (!n) return false;
            if (isSysNode(n)) return String(n.sysNode.sysId) === sysId && !!n.sysNode.fcId && fcIds.indexOf(String(n.sysNode.fcId)) >= 0;
            if (n.type === 'gate') return String(n.transferOutTo || (n.gateType === 'TRANSFER' ? n.linkedPageId : '') || '') === String(page.id);
            return !!(n.externalSource && ids.indexOf(String(n.externalSource.targetId)) >= 0);
        };
        _pages().forEach(function (p) {
            if (!p || !p.root || p.verifies || p.dupReview || p.duplicateOf || p.treeLevel !== 'aircraft' || (p.mode || 'top-down') !== 'top-down') return;
            var has = false; (function w(n) { if (!n || has) return; if (mine(n)) has = true; else _kids(n).forEach(w); })(p.root);
            if (!has) return;
            var alloc = _allocated(p, ids); if (!alloc) return;
            (function w(n) {
                if (!n) return;
                var share = n.probability;   // this aircraft tree's own share for it
                if (mine(n) && typeof share === 'number' && isFinite(share) && share > 0) {
                    var TB = root.SLTopBasis, ph = TB ? TB.perFlightHour(share, p) : null, rate = ph ? ph.rate : share;
                    list.push({ rate: rate, pFlight: share, pageId: p.id, pageName: p.name || p.id, nodeName: n.name || n.displayId || _lid(n), lid: _lid(n), displayId: n.displayId || '', via: n.type === 'gate' ? 'transfer' : (isSysNode(n) ? 'node' : 'link') });
                    return;
                }
                _kids(n).forEach(w);
            })(alloc);
        });
        return list;
    }
    function _applyTargets() {
        var n = 0;
        _pages().forEach(function (p) {
            if (!p || !p.root || p.verifies || p.dupReview || (p.mode || 'top-down') !== 'top-down' || p.targetManual) return;
            if (!_links(p).length) return;
            var e = effectiveTarget(p); if (!e || e.rate == null) return;
            var basis = { used: e.used, classTarget: e.classTarget, severity: e.severity, aircraft: e.aircraft };
            if (p.targetP !== e.rate || JSON.stringify(p.targetBasis || null) !== JSON.stringify(basis)) { p.targetP = e.rate; p.targetBasis = basis; n++; }
        });
        return n;
    }

    // ---- the sweep ------------------------------------------------------------------------------------------
    // 26 Oct 2026 (fcim_na.js): the FHA rows of a failure condition whose FCIM cell was marked not applicable were set
    // aside with that cell; its tree is asked about in those words
    function _setAside(key) {
        var id = String(key || '').indexOf('fc:') === 0 ? String(key).slice(3).trim() : '';
        if (!id) return false;
        var rows = [].concat(_g('acFcimData') || []);
        _systems().forEach(function (s) { rows = rows.concat((s && s.fcim) || []); });
        return rows.some(function (r) { return r && ['tl', 'pl', 'm'].some(function (k) { return String(r[k + 'NaPrevId'] || '').trim() === id && String(r[k + 'Na'] || '').trim() !== ''; }); });
    }
    var _asking = false;
    // 27 Oct 2026: one sweep leaves everything settled. A tree made in a pass gets its system events, and a system tree
    // its aircraft-based target, only in the NEXT pass, so the old single pass left work for later ticks; repeat
    // (quietly, at most 4 passes) until a pass changes nothing.
    function sweep(opts) {
        opts = opts || {};
        if (root.SL_FC_TREES_OFF) return { off: true };
        var acc = null;
        for (var pass = 0; pass < 4; pass++) {
            var r = _sweepOnce(pass === 0 ? opts : { quiet: true, noAsk: true });
            if (!acc) acc = r; else { acc.made = acc.made.concat(r.made); acc.added += r.added; acc.gone = acc.gone.concat(r.gone); acc.targets += r.targets; }
            if (!(r.made.length || r.added || r.gone.length || r.targets)) break;
            try { _allocMemo.gen = -1; _allocMemo.map = {}; } catch (_) {}
        }
        return acc;
    }
    function _sweepOnce(opts) {
        opts = opts || {};
        var made = [], added = 0, gone = [], ask = [], waiting = 0;
        var all = groups('ac'); _systems().forEach(function (s) { all = all.concat(groups(s)); });
        all.forEach(function (g) {
            if (!g.needsTree) return;
            var t = treeFor(g);
            if (!t) { made.push(make(g)); return; }
            if (!t.root) { waiting++; return; }   // its nodes have not arrived yet: wait, never make another
            // v2.0: nothing is added to a tree here. A traced SFHA failure condition is linked by the engineer (link()).
        });
        added += migrate();
        // a shared node keeps the name of what it stands for (its failure condition renamed, or matched to a function's node)
        _pages().forEach(function (p) { if (!p || !p.root) return; (function w(n) { if (!n) return; if (isSysNode(n)) { var e = entryOfLid(_lid(n)); if (e) { var nm = nodeName(e); if (n.name !== nm || (e.fcId && n.sysNode.fcId !== e.fcId)) { n.name = nm; n.sysNode.fcId = e.fcId || null; } } } _kids(n).forEach(w); })(p.root); });
        // trees made here whose failure condition no longer needs one
        _pages().slice().forEach(function (p) {
            if (!p || !p.autoFcTree || p.autoFcTree.kept || !p.root || p.duplicateOf) return;   // nodes pending, or a copy under review
            var a = p.autoFcTree, scope = a.scope === 'ac' ? 'ac' : _systems().find(function (s) { return s && String(s.id) === String(a.systemId); });
            var g = scope ? groups(scope).find(function (x) { return x.key === a.key; }) : null;
            if (g && g.needsTree) return;
            if (shapeFp(p.root) === a.fp) gone.push(p.id); else ask.push({ p: p, why: !g ? (_setAside(a.key) ? 'its failure condition was marked not applicable in the FCIM' : 'its failure condition is gone') : (_rank(g.gov.severity) < MAJOR ? 'its failure condition is ' + g.gov.severity + ' now' : 'the 1309 chart now routes it to ' + (ROUTE_WORDS[g.route] || g.route).toLowerCase()) });
        });
        if (gone.length) { var keep = _pages().filter(function (p) { return gone.indexOf(p.id) < 0; }); try { ftaPages = keep; } catch (_) { root.ftaPages = keep; } }
        var targets = _applyTargets();
        if (made.length || added || gone.length || targets) {
            _call('scheduleAutosave');
            if (made.length || added || gone.length) { try { if (root.SL_FTA_PICKER) root.SL_FTA_PICKER.render(true); } catch (_) {} }
            if (!opts.quiet && made.length) _toast(made.length === 1 ? 'Made the fault tree for ' + made[0].name.replace(/^P[S]?SA · /, '') + ' (its failure condition needs one).' : 'Made ' + made.length + ' fault trees, one for each failure condition that needs one.', 'info', 6000);
        }
        if (!opts.noAsk && !_asking && ask.length) {
            _asking = true;
            (async function () {
                try { for (var i = 0; i < ask.length; i++) await _askGone(ask[i].p, ask[i].why); } finally { _asking = false; }
            })();
        }
        return { made: made.map(function (p) { return p.id; }), added: added, gone: gone, ask: ask.map(function (x) { return x.p.id; }), targets: targets, waiting: waiting };
    }
    async function _askGone(p, why) {
        var choose = root.slChoose; if (typeof choose !== 'function') return;
        var v = await choose('The fault tree "' + (p.name || p.id) + '" was made because its failure condition needed one, and ' + why + '. It has work in it. Delete it, or keep it?', [
            { value: 'delete', label: 'Delete the tree', hint: 'Its verification tree is asked about next.' },
            { value: 'keep', label: 'Keep it', hint: 'It stays where it is, linked to its failure condition.' }], { title: 'A tree its failure condition no longer needs', cancelText: 'Ask me later' });
        if (!v) return;
        if (v === 'keep') { p.autoFcTree.kept = true; _call('scheduleAutosave'); return; }
        if (root.SLVerifySync && typeof root.SLVerifySync.deleteTree === 'function') await root.SLVerifySync.deleteTree(p.id);
    }
    var _seenGen = -1, _first = true;
    function tick() {
        var dc = root.SLDataChange;
        if (dc && !_first && dc.gen() === _seenGen) return { skipped: true };
        if (_first && !_ac().length && !_systems().length) return { skipped: true };
        _first = false;
        // the change collection (change_ack.js): this is background work nobody made, so it waits while a change
        // of the person's is still open (decided within half a second) and runs as a SYSTEM change: it is not
        // listed for the person to confirm, and Discard all keeps it
        var CA = root.SLChangeAck;
        try {
            if (CA && typeof CA.status === 'function') { var st = CA.status(); if (st.open || st.timer || st.prompting) return { skipped: 'a change is open' }; }
            if (CA && ((typeof CA.typing === 'function' && CA.typing()) || (typeof CA.busy === 'function' && CA.busy()))) return { skipped: 'the person is typing' };
        } catch (_) {}
        // copies left from before 8 Nov 2026 whose nodes had not arrived at load are cleaned up first (fta_dedupe.js)
        try { var DD = root.SLFtaDedupe; if (DD && typeof DD.pending === 'function' && DD.pending()) DD.run({ quiet: true }); } catch (_) {}
        try {
            if (!(CA && typeof CA.system === 'function')) return sweep();
            var res = (typeof CA.background === 'function') ? CA.background(function () { return sweep(); }) : CA.system(function () { return sweep(); });
            return res;
        } finally { if (dc) _seenGen = dc.gen(); }
    }
    if (typeof root.addEventListener === 'function' && typeof document !== 'undefined') {
        root.addEventListener('load', function () { setTimeout(function () { try { tick(); } catch (_) {} }, 1500); setInterval(function () { try { tick(); } catch (_) {} try { syncFlags(); } catch (_) {} }, 2500); });
    }
    try { root.slGoverningPhases = governingPhases; } catch (_) {}

    // ---- the most conservative instance (26 Oct 2026, Waqas: "fault trees should be generated for the most
    // conservative severity classification only ... same with CoFFEE and other analyses we just need the most
    // conservative instances") ------------------------------------------------------------------------------------
    // A failure condition shown in several rows (one per phase) is offered ONCE wherever someone picks or views
    // failure conditions: its governing row (worst severity, ties: the longest exposure), labelled with how many rows
    // it stands for. The FHA tables still show every row: that is where the phase copies are written.
    function _scopeOfRow(row) {
        if (_ac().indexOf(row) >= 0) return 'ac';
        return _systems().find(function (s) { return s && (s.fha || []).indexOf(row) >= 0; }) || null;
    }
    // the groups of one scope ('ac', a system object or a system id) or of all ('all')
    function _groupsOf(scope) {
        if (scope === 'all') { var all = groups('ac'); _systems().forEach(function (s) { all = all.concat(groups(s)); }); return all; }
        if (scope === 'ac' || scope === 'aircraft') return groups('ac');
        var sy = (scope && typeof scope === 'object') ? scope : _systems().find(function (s) { return s && String(s.id) === String(scope); });
        return sy ? groups(sy) : [];
    }
    function _fresh(scope, row) {
        var gs = _groupsOf(scope), g = gs.find(function (x) { return x.rows.indexOf(row) >= 0; });
        if (!g) { var s = scope === 'all' || scope === 'aircraft' ? _scopeOfRow(row) : scope; if (s) g = _groupsNow(s === 'aircraft' ? 'ac' : s).find(function (x) { return x.rows.indexOf(row) >= 0; }); }
        return g || null;
    }
    // the governing rows of a scope, in the order their failure conditions first appear
    function governingRows(scope) { return _groupsOf(scope == null ? 'all' : scope).map(function (g) { return g.gov; }); }
    function groupOf(row) { var s = _scopeOfRow(row); return s ? _fresh(s, row) : null; }
    function governingOf(row) { var g = groupOf(row); return g ? g.gov : row; }
    function isGoverning(row) { var g = groupOf(row); return !g || g.gov === row; }
    // the governing row for an FC ID in a scope (replaces "the first row with that ID")
    function byFcId(fcId, scope) {
        var id = String(fcId == null ? '' : fcId).trim(); if (!id) return null;
        var g = _groupsOf(scope == null ? 'all' : scope).find(function (x) { return x.fcId === id; });
        return g ? g.gov : null;
    }
    // " (most conservative of 3)" when the failure condition has several rows, else ''
    function copiesNote(row) { var g = groupOf(row); return g && g.rows.length > 1 ? ' (most conservative of ' + g.rows.length + ')' : ''; }

    var api = { VERSION: VERSION, groups: groups, route: route,
        governingRows: governingRows, governingOf: governingOf, isGoverning: isGoverning, groupOf: groupOf, byFcId: byFcId, copiesNote: copiesNote, ROUTE_WORDS: ROUTE_WORDS, characterized: characterized, needsChart: needsChart, treeFor: treeFor,
        sweep: sweep, tick: tick, baseId: baseId, syncFlags: syncFlags, flagsOutOfStep: flagsOutOfStep, effectiveTarget: effectiveTarget, shares: shares, governingPhases: governingPhases, shapeFp: shapeFp,
        // v2.0: the shared node of a system failure condition
        link: link, unlink: unlink, linked: linked, built: built, candidates: candidates, ceiling: ceiling, isSysNode: isSysNode, nodeKey: nodeKey, entryOfLid: entryOfLid, nodeName: nodeName, migrate: migrate, traced: _traced, adoptInto: adoptInto, keyOf: keyOf,
        // 30 Oct 2026 (fc_link.js): the tree for a condition picked by hand that has none yet
        makeTree: make };
    try { root.SLFcTrees = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

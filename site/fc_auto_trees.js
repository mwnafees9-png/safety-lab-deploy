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
// API (window.SLFcTrees): groups(scope), route(row), characterized(row), needsChart(row), sweep(opts),
// effectiveTarget(page), governingPhases(page), treeFor(group). Kill switch: window.SL_FC_TREES_OFF = true.
// Load: after helpers_modules.js, assurance_modules.js (AutoReq), fc_tree_flow.js, tree_homes.js and before
// verify_sync.js. Tests: tests/regression_fc_auto_trees_20261024.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.4';   // 1.4 26 Oct 2026: a tree whose failure condition was marked not applicable in the FCIM is asked about in those words
    var MAJOR = 3;

    // 26 Oct 2026 (v1.3): the project stores are top-level `let`s, not window properties, and the app's CSP forbids
    // eval, so v1.2's eval read threw on every install and the sweep saw an empty project (Radia: no trees made, the
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
    function treeFor(g) {
        var ids = g.rows.map(function (r) { return String(r.internalId); });
        return _pages().find(function (p) {
            if (!p || !p.root || p.verifies || (p.mode || 'top-down') !== 'top-down') return false;
            if (g.scope === 'ac' ? p.treeLevel !== 'aircraft' : (p.treeLevel !== 'system' || String(p.systemId) !== String(g.sys.id))) return false;
            return _links(p).some(function (l) { return ids.indexOf(l.replace(/^(AC_|SYS_)/, '')) >= 0; });
        }) || null;
    }

    // ---- the trees ----------------------------------------------------------------------------------------
    function shapeFp(n) { var o = []; (function w(x, d) { if (!x) return; o.push(d + ':' + x.type + ':' + (x.gateType || '') + ':' + (x.name || '') + ':' + JSON.stringify(x.externalSource || null)); _kids(x).forEach(function (c) { w(c, d + 1); }); })(n, 0); return o.join('|'); }
    function _node(type, name, extra) {
        var id = _nid(), n = { id: id, logicalId: id, type: type, name: name, probability: 0, children: [] };
        if (type === 'gate') { n.gateType = 'OR'; n.displayId = 'G-' + id; } else { n.lambda = 0; n.inputMode = 'probability'; n.displayId = (type === 'undeveloped' ? 'UD-' : 'BE-') + id; }
        return Object.assign(n, extra || {});
    }
    // the SFHA failure conditions that trace to an AFHA one (their rows' acTrace), one per system and FC ID
    function _traced(acGroup) {
        var out = [];
        if (!acGroup.fcId) return out;
        _systems().forEach(function (s) {
            groups(s).forEach(function (sg) { if (sg.rows.some(function (r) { return String(r.acTrace || '').trim() === acGroup.fcId; })) out.push(sg); });
        });
        return out;
    }
    function _hasEventFor(page, sg) {
        var ids = sg.rows.map(function (r) { return 'SYS_' + r.internalId; }), hit = false;
        (function w(n) { if (!n || hit) return; if (n.externalSource && ids.indexOf(String(n.externalSource.targetId)) >= 0) hit = true; _kids(n).forEach(w); })(page.root);
        return hit;
    }
    function _sysEvent(sg) {
        return _node('basic', (sg.sys.name || sg.sys.id) + ': ' + (sg.gov.fcDesc || sg.fcId || 'failure condition'), { externalSource: { kind: 'fha', targetId: 'SYS_' + sg.gov.internalId } });
    }
    function make(g) {
        var desc = g.gov.fcDesc || g.fcId || 'Failure condition';
        var rootN = _node('gate', desc, { displayId: g.fcId || undefined });
        if (!rootN.displayId) rootN.displayId = 'G-' + rootN.id;
        var traced = g.scope === 'ac' ? _traced(g) : [];
        if (traced.length) traced.forEach(function (sg) { rootN.children.push(_sysEvent(sg)); });
        else rootN.children.push(_node('undeveloped', 'Decompose: causes of ' + desc));
        var ids = g.worst.concat(g.rows.filter(function (r) { return g.worst.indexOf(r) < 0; })).map(function (r) { return r.internalId; });
        var page = {
            id: 'fc-auto-' + (g.scope === 'ac' ? 'ac' : g.sys.id) + '-' + String(g.fcId || g.gov.internalId).replace(/[^A-Za-z0-9_-]+/g, '_'),
            name: (g.scope === 'ac' ? 'PASA' : 'PSSA') + ' · ' + (g.fcId ? g.fcId + ' ' : '') + desc.slice(0, 50),
            treeLevel: g.scope === 'ac' ? 'aircraft' : 'system', systemId: g.scope === 'ac' ? '' : g.sys.id, mode: 'top-down',
            linkedFhaIds: ids, root: rootN,
            autoFcTree: { scope: g.scope, key: g.key, systemId: g.scope === 'ac' ? null : g.sys.id, at: new Date().toISOString() }
        };
        while (_pages().some(function (p) { return p && p.id === page.id; })) page.id += '-' + Date.now().toString(36);
        page.autoFcTree.fp = shapeFp(rootN);
        _pages().push(page);
        try { if (typeof root.jrnl === 'function') root.jrnl('tree-created', page.name + ' made for the failure condition (1309 chart: ' + (ROUTE_WORDS[g.route] || g.route) + ')'); } catch (_) {}
        return page;
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
    // other tree is written to. The events linked to THIS system failure condition are allocated as free events on
    // the copy: the engine pins a linked event at the system's class target (allocateTopDown's fixed children), and
    // what is asked here is the aircraft tree's own share for it, to be compared with that class target.
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
                (function free(n) { if (!n) return; if (n.externalSource && (ids || []).indexOf(String(n.externalSource.targetId)) >= 0) { n._wasLinked = n.externalSource; delete n.externalSource; delete n._externalAllocation; } _kids(n).forEach(free); })(copy);
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
        var ids = rows.map(function (r) { return 'SYS_' + r.internalId; }), best = null;
        _pages().forEach(function (p) {
            if (!p || !p.root || p.verifies || p.treeLevel !== 'aircraft' || (p.mode || 'top-down') !== 'top-down') return;
            var has = false; (function w(n) { if (!n || has) return; if (n.externalSource && ids.indexOf(String(n.externalSource.targetId)) >= 0) has = true; _kids(n).forEach(w); })(p.root);
            if (!has) return;
            var alloc = _allocated(p, ids); if (!alloc) return;
            (function w(n) {
                if (!n) return;
                var share = n.probability;   // the aircraft tree's own share for it (freed on the copy)
                if (n._wasLinked && ids.indexOf(String(n._wasLinked.targetId)) >= 0 && typeof share === 'number' && isFinite(share) && share > 0) {
                    var TB = root.SLTopBasis, ph = TB ? TB.perFlightHour(share, p) : null, rate = ph ? ph.rate : share;
                    if (!best || rate < best.rate) best = { rate: rate, pFlight: share, pageId: p.id, pageName: p.name || p.id, nodeName: n.name || n.displayId || _lid(n), lid: _lid(n) };
                }
                _kids(n).forEach(w);
            })(alloc);
        });
        if (best) {
            out.aircraft = best;
            if (cls == null || best.rate < cls) { out.rate = best.rate; out.used = 'aircraft'; }
        }
        return out;
    }
    function _applyTargets() {
        var n = 0;
        _pages().forEach(function (p) {
            if (!p || !p.root || p.verifies || (p.mode || 'top-down') !== 'top-down' || p.targetManual) return;
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
    function sweep(opts) {
        opts = opts || {};
        if (root.SL_FC_TREES_OFF) return { off: true };
        var made = [], added = 0, gone = [], ask = [];
        var all = groups('ac'); _systems().forEach(function (s) { all = all.concat(groups(s)); });
        all.forEach(function (g) {
            if (!g.needsTree) return;
            var t = treeFor(g);
            if (!t) { made.push(make(g)); return; }
            // a PASA tree made here carries every SFHA failure condition that traces to it
            if (g.scope === 'ac' && t.autoFcTree) {
                var untouched = shapeFp(t.root) === t.autoFcTree.fp;
                _traced(g).forEach(function (sg) {
                    if (_hasEventFor(t, sg)) return;
                    t.root.children = (t.root.children || []).filter(function (c) { return !(untouched && c.type === 'undeveloped' && /^Decompose: causes of /.test(c.name || '')); });
                    t.root.children.push(_sysEvent(sg)); added++;
                });
                if (untouched) t.autoFcTree.fp = shapeFp(t.root);
            }
        });
        // trees made here whose failure condition no longer needs one
        _pages().slice().forEach(function (p) {
            if (!p || !p.autoFcTree || p.autoFcTree.kept) return;
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
        return { made: made.map(function (p) { return p.id; }), added: added, gone: gone, ask: ask.map(function (x) { return x.p.id; }), targets: targets };
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
        sweep: sweep, tick: tick, syncFlags: syncFlags, flagsOutOfStep: flagsOutOfStep, effectiveTarget: effectiveTarget, governingPhases: governingPhases, shapeFp: shapeFp };
    try { root.SLFcTrees = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

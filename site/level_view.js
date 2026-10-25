// ============================================================================
// level_view.js v1.0 (25 Oct 2026): CMA, R&M and human factors at the level you are working on.
//
// Waqas, 24 Oct 2026: "CMA and R&M need to be at the system level too, maybe HFs too", "ZSA and PRAs remain
// at aircraft level", and for the aircraft pages: "it shows just aircraft level and says to view systems
// analysis with links where appropriate". The plan he confirmed (25 Oct 2026):
//   1. a system's plan offers CMA, R&M and HF (not ZSA, not PRA)
//   2. system CMA: independence inside that system; aircraft CMA: across systems
//   3. system R&M: its reliability prediction, maintainability, MSG-3 systems analysis and MMEL items;
//      aircraft R&M keeps the roll-ups, life-cycle cost and MSG-3 structures, zonal and L/HIRF
//   4. system HF: the crew interface that system provides (tasks, error analysis, alerts, controls and
//      displays); aircraft HF keeps the integrated flight deck (workload, alerting philosophy, situation
//      awareness, ergonomics)
//   5. an aircraft page shows aircraft rows only, with a line naming the systems that have their own
//      analysis, each with a "View <system> analysis" link
//   6. a row already tied to one system belongs to it; every other row stays at aircraft level; nothing
//      moves on a guess
//
// THE RULE FOR A ROW (sysOf):
//   * stamped: rows made here carry their level: { level: 'system', scope: 'system', owningSystemId } or
//     { level: 'aircraft' }. The CMA's and FMEA's own scope fields (scope 'system' + owningSystemId) count as
//     a system stamp.
//   * not stamped (made before this): it belongs to a system when everything it is linked to that has a
//     system belongs to that ONE system: model links (items by their owning system, system functions, system
//     failure conditions, systems), and for a CMA row the fault trees its gates are in (the tree home).
//     Links into two systems, or into none: aircraft.
//   A stamped row never moves when its links change later.
//
// THE LEVEL ON SCREEN (view): the level picked in the left navigation (SLNavAreas.scope()): 'aircraft' or a
// system id. The aircraft sections hold the aircraft pages; a system's sections hold its own (nav_areas.js).
//
// API (window.SLLevelView): KINDS, view(), sysOf(kind, row), shows(kind, row), rowsIn(kind, sysId), stamp(kind,
// row), headerHtml(kind), open(kind, sysId), kindOfTab(tab), isSystemTab(tab), systemsWith(kind).
// Tests: tests/regression_level_view_20261025.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.2';

    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _jsq(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
    function _pc() { try { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : (root.projectConfig || null); } catch (_) { return root.projectConfig || null; } }
    function _systems() { try { return (typeof systemsData !== 'undefined' && Array.isArray(systemsData)) ? systemsData : _arr(root.systemsData); } catch (_) { return _arr(root.systemsData); } }
    function _items() { try { return (typeof itemsData !== 'undefined' && Array.isArray(itemsData)) ? itemsData : _arr(root.itemsData); } catch (_) { return _arr(root.itemsData); } }
    function _pages() { try { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : _arr(root.ftaPages); } catch (_) { return _arr(root.ftaPages); } }
    function _cma() { try { return (typeof cmaData !== 'undefined' && Array.isArray(cmaData)) ? cmaData : _arr(root.cmaData); } catch (_) { return _arr(root.cmaData); } }
    function _sys(id) { if (id == null || id === '') return null; var s = _systems().find(function (x) { return x && String(x.id) === String(id); }); return s || null; }
    function _sysName(id) { var s = _sys(id); return s ? (s.name || String(s.id)) : String(id); }
    function _path(o, keys) { var cur = o; for (var i = 0; i < keys.length; i++) { if (!cur || typeof cur !== 'object') return []; cur = cur[keys[i]]; } return _arr(cur); }

    // ---- the kinds: which pages go to a system, their rows, their lane in a system's plan ----------------------
    //   tab: the page (switchTab id); lane: the plan lane a system needs on; sub: an HF sub-lane that must also be on
    //   for the aircraft; akey: the model-links table (SLModelLinks) the row's links are read from
    var KINDS = {
        cma:        { tab: 'cma',        lane: 'cma',             group: 'cca', label: 'Common mode analysis',      short: 'CMA',
                      rows: function () { return _cma(); } },
        ramPredict: { tab: 'ram-predict', lane: 'ram-reliability', group: 'ram', label: 'Reliability prediction',   short: 'reliability prediction',
                      rows: function () { return _path(_pc(), ['ram', 'predict', 'rows']); } },
        ramTask:    { tab: 'ram-mx',     lane: 'ram-mx',          group: 'ram', label: 'Maintainability',            short: 'maintainability analysis', akey: 'ramTask',
                      rows: function () { return _path(_pc(), ['ram', 'tasks']); } },
        msg3:       { tab: 'ram-msg3',   lane: 'ram-msg3',        group: 'ram', label: 'MSG-3 systems analysis',     short: 'MSG-3 systems analysis',
                      akey: function (row) { return _path(_pc(), ['msg3', 'screened']).indexOf(row) >= 0 ? 'msg3Screen' : 'msg3Msi'; },
                      rows: function () { return _path(_pc(), ['msg3', 'msis']).concat(_path(_pc(), ['msg3', 'screened'])); } },
        mmel:       { tab: 'mmel',       lane: 'ram-mmel',        group: 'ram', label: 'Dispatch relief (MMEL)',     short: 'MMEL items', akey: 'mmel',
                      rows: function () { return _path(_pc(), ['mmel', 'items']); } },
        hfTid:      { tab: 'hfa-tid',    lane: 'hfa', sub: 'hfa-tid',    group: 'hf', label: 'Task identification', short: 'task identification', akey: 'hfTid',
                      rows: function () { return _path(_pc(), ['hf', 'tid', 'rows']); } },
        hfTasks:    { tab: 'hfa-task',   lane: 'hfa', sub: 'hfa-task',   group: 'hf', label: 'Task analysis',       short: 'task analysis', akey: 'hfTasks',
                      rows: function () { return _path(_pc(), ['hf', 'tasks', 'rows']); } },
        hfHea:      { tab: 'hfa-hea',    lane: 'hfa', sub: 'hfa-hea',    group: 'hf', label: 'Human error analysis', short: 'human error analysis', akey: 'hfHea',
                      rows: function () { return _path(_pc(), ['hf', 'hea', 'rows']); } },
        hfAlerts:   { tab: 'hfa-alerts', lane: 'hfa', sub: 'hfa-alerts', group: 'hf', label: 'Crew alerting',       short: 'crew alerting', akey: 'hfAlerts',
                      rows: function () { return _path(_pc(), ['hf', 'alerts', 'rows']); } },
        hfCd:       { tab: 'hfa-cd',     lane: 'hfa', sub: 'hfa-cd',     group: 'hf', label: 'Controls and displays', short: 'controls and displays evaluation', akey: 'hfCd',
                      rows: function () { return _path(_pc(), ['hf', 'cd', 'rows']); } }
    };
    var BY_TAB = {};
    Object.keys(KINDS).forEach(function (k) { KINDS[k].key = k; BY_TAB[KINDS[k].tab] = k; });
    function kindOfTab(tab) { return BY_TAB[tab] || null; }
    function isSystemTab(tab) { return !!BY_TAB[tab]; }

    // ---- the level on screen ------------------------------------------------------------------------------------
    var _forced = null;   // tests and open(): a level set before the navigation knows it
    function view() {
        var s = null;
        try { if (root.SLNavAreas && typeof root.SLNavAreas.scope === 'function') s = root.SLNavAreas.scope(); } catch (_) {}
        if (s == null && _forced != null) s = _forced;
        if (s == null || s === 'aircraft') return null;
        return _sys(s) ? String(s) : null;
    }

    // ---- a row's level ------------------------------------------------------------------------------------------
    function _stamped(row) {
        if (!row || typeof row !== 'object') return { done: true, sys: null };
        if (row.level === 'aircraft') return { done: true, sys: null };
        if ((row.level === 'system' || row.scope === 'system') && row.owningSystemId != null && row.owningSystemId !== '') {
            return { done: true, sys: _sys(row.owningSystemId) ? String(row.owningSystemId) : null, orphan: !_sys(row.owningSystemId) };
        }
        return { done: false };
    }
    function _sysOfFunction(id) {
        var hit = null;
        _systems().some(function (s) { if (_arr(s && s.functions).some(function (f) { return f && String(f.internalId) === String(id); })) { hit = s.id; return true; } return false; });
        return hit;
    }
    function _sysOfSysFc(id, code) {
        var hit = null;
        _systems().some(function (s) { if (_arr(s && s.fha).some(function (f) { return f && (String(f.internalId) === String(id) || (code && f.fcId === code)); })) { hit = s.id; return true; } return false; });
        return hit;
    }
    // the system of a fault tree, by its home (tree_homes.js): a system's PSSA or SSA tree; null for the rest
    function _sysOfPage(p) {
        if (!p) return null;
        var lv = null;
        try { lv = root.SLTreeHomes && root.SLTreeHomes.homeOf ? root.SLTreeHomes.homeOf(p) : null; } catch (_) {}
        if (lv) return (lv.home === 'pssa' || lv.home === 'ssa') ? lv.systemId : null;
        return p.treeLevel === 'system' ? p.systemId : null;
    }
    function _findNodePage(nodeId) {
        var hit = null;
        _pages().some(function (p) {
            (function walk(n) { if (!n || hit) return; if (String(n.id) === String(nodeId)) { hit = p; return; } _arr(n.children).concat(_arr(n._children)).forEach(walk); })(p && p.root);
            return !!hit;
        });
        return hit;
    }
    function _sysOfNode(nodeId) { return _sysOfPage(_findNodePage(nodeId)); }
    function _tie(kind, row) {
        var K = KINDS[kind]; if (!K) return null;
        var found = {};
        var add = function (sid) { if (sid != null && sid !== '' && _sys(sid)) found[String(sid)] = 1; };
        if (kind === 'cma') {
            // the fault trees its gates are in
            _arr(row.linkedGateIds).forEach(function (key) {
                var pid = String(key).split(':')[0];
                add(_sysOfPage(_pages().find(function (x) { return x && String(x.id) === pid; })));
            });
        } else if (K.akey) {
            var ML = root.SLModelLinks;
            var akey = typeof K.akey === 'function' ? K.akey(row) : K.akey;
            var links = [];
            try { if (ML && typeof ML.linksOf === 'function') links = ML.linksOf(akey, row) || []; } catch (_) { links = []; }
            links.forEach(function (l) {
                if (!l || !l.ok || l.id == null) return;
                if (l.kind === 'item') { var it = _items().find(function (i) { return i && String(i.internalId) === String(l.id); }); if (it) add(it.owningSystemId); }
                else if (l.kind === 'system') add(l.id);
                else if (l.kind === 'sysFunction') add(_sysOfFunction(l.id));
                else if (l.kind === 'sysFc') add(_sysOfSysFc(l.id, l.code));
                else if (l.kind === 'be') add(_sysOfNode(l.id));
            });
        }
        var ks = Object.keys(found);
        return ks.length === 1 ? ks[0] : null;
    }
    // the system a row belongs to, or null for the aircraft
    // remembered per row for one data generation (SLDataChange.gen): a page and its header ask many times
    var _memo = { gen: null, map: null };
    function _memoMap() {
        var g = null;
        try { g = root.SLDataChange && typeof root.SLDataChange.gen === 'function' ? root.SLDataChange.gen() : null; } catch (_) {}
        if (g == null || typeof WeakMap !== 'function') return null;
        if (_memo.gen !== g || !_memo.map) { _memo.gen = g; _memo.map = new WeakMap(); }
        return _memo.map;
    }
    function sysOf(kind, row) {
        var st = _stamped(row);
        if (st.done) return st.sys;
        var m = (row && typeof row === 'object') ? _memoMap() : null;
        if (m && m.has(row)) return m.get(row);
        var s = _tie(kind, row);
        if (m) m.set(row, s);
        return s;
    }
    function shows(kind, row, sysId) {
        var v = arguments.length > 2 ? (sysId == null ? null : String(sysId)) : view();
        var s = sysOf(kind, row);
        return (s == null ? null : String(s)) === v;
    }
    function rowsIn(kind, sysId) {
        var K = KINDS[kind]; if (!K) return [];
        var v = sysId == null ? null : String(sysId);
        return K.rows().filter(function (r) { var s = sysOf(kind, r); return (s == null ? null : String(s)) === v; });
    }
    // a new row takes the level on screen
    function stamp(kind, row, sysId) {
        if (!row || typeof row !== 'object') return row;
        try { if (_memo.map) _memo.map.delete(row); } catch (_) {}
        var v = arguments.length > 2 ? (sysId == null ? null : String(sysId)) : view();
        if (v == null) {
            row.level = 'aircraft';
            if (kind === 'cma') { row.scope = 'aircraft'; row.owningSystemId = ''; }
        } else {
            row.level = 'system'; row.scope = 'system'; row.owningSystemId = v;
        }
        return row;
    }

    // ---- the systems that have their own analysis of a kind ----------------------------------------------------
    function _laneOnFor(sysId, K) {
        var PP = root.PROGRAM_PLAN;
        try {
            if (PP && typeof PP.systemLaneOn === 'function' && PP.systemLaneOn(sysId, K.lane) === false) return false;
            if (K.sub && PP && typeof PP.systemLaneOn === 'function' && PP.systemLaneOn(sysId, K.sub) === false) return false;
        } catch (_) {}
        return true;
    }
    function systemsWith(kind) {
        var K = KINDS[kind]; if (!K) return [];
        var all = K.rows(), out = [];
        _systems().forEach(function (s) {
            if (!s || s.id == null) return;
            var n = all.filter(function (r) { return String(sysOf(kind, r)) === String(s.id); }).length;
            if (n || _laneOnFor(s.id, K)) out.push({ id: String(s.id), name: s.name || String(s.id), rows: n, planned: _laneOnFor(s.id, K) });
        });
        return out;
    }

    // ---- the line at the top of the page --------------------------------------------------------------------------
    function headerHtml(kind) {
        var K = KINDS[kind]; if (!K) return '';
        var v = view();
        var box = 'display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:12px;padding:8px 12px;margin:0 0 12px;border:1px solid var(--color-border-thin);border-radius:var(--r-md);background:var(--color-surface-2)';
        // 25 Oct 2026: the app's own button rule paints every button's text white; these links say their own colors
        // (text, background, border), or they read as empty pills (white on white)
        var btn = 'font-size:11px;font-weight:600;padding:2px 10px;border:1px solid var(--color-border-strong);border-radius:var(--r-full);background:var(--color-surface-1);background-image:none;color:var(--color-text-primary);box-shadow:none;cursor:pointer';
        if (v != null) {
            var nAc = rowsIn(kind, null).length;
            return '<div class="sl-lv-head" data-lv-kind="' + _esc(kind) + '" data-lv-level="' + _esc(v) + '" style="' + box + '">' +
                '<b>' + _esc(_sysName(v)) + ' · ' + _esc(K.label) + '</b>' +
                '<span style="color:var(--color-text-secondary)">This system’s rows only. New rows belong to ' + _esc(_sysName(v)) + '.</span>' +
                '<button type="button" class="sl-lv-go" style="' + btn + '" data-lv-go="aircraft" onclick="SLLevelView.open(\'' + _jsq(kind) + '\', null)">View aircraft analysis' + (nAc ? ' (' + nAc + ')' : '') + '</button>' +
                '</div>';
        }
        // a link for each system that has rows of its own; the systems that only have it in their plan, counted
        var all = systemsWith(kind);
        var list = all.filter(function (s) { return s.rows > 0; });
        var planned = all.length - list.length;
        var more = planned ? '<span style="color:var(--color-text-tertiary)">' + (list.length ? planned + ' more system' + (planned === 1 ? ' has' : 's have') : planned + ' system' + (planned === 1 ? ' has' : 's have')) + ' it in ' + (planned === 1 ? 'its plan' : 'their plans') + ', with no rows yet (open one from Working on).</span>' : '';
        var links = list.map(function (s) {
            return '<button type="button" class="sl-lv-go" style="' + btn + '" data-lv-go="' + _esc(s.id) + '" onclick="SLLevelView.open(\'' + _jsq(kind) + '\', \'' + _jsq(s.id) + '\')">View ' + _esc(s.name) + ' analysis' + (s.rows ? ' (' + s.rows + ')' : '') + '</button>';
        }).join('');
        return '<div class="sl-lv-head" data-lv-kind="' + _esc(kind) + '" data-lv-level="aircraft" style="' + box + '">' +
            '<b>Aircraft level · ' + _esc(K.label) + '</b>' +
            (list.length
                ? '<span style="color:var(--color-text-secondary)">Aircraft rows only. Systems with their own ' + _esc(K.short) + ':</span>' + links + more
                : '<span style="color:var(--color-text-secondary)">Aircraft rows only. No system has rows of its own ' + _esc(K.short) + ' yet.</span>' + more) +
            '</div>';
    }
    // the header goes at the top of the page's view, above everything the page draws
    function mount(kind) {
        if (typeof document === 'undefined') return null;
        var K = KINDS[kind]; if (!K) return null;
        var vw = document.getElementById('view-' + K.tab); if (!vw) return null;
        var el = vw.querySelector(':scope > .sl-lv-mount');
        if (!el) { el = document.createElement('div'); el.className = 'sl-lv-mount'; vw.insertBefore(el, vw.firstChild); }
        var html = headerHtml(kind);
        if (el.innerHTML !== html) el.innerHTML = html;
        return el;
    }

    // ---- going to another level -----------------------------------------------------------------------------------
    function open(kind, sysId) {
        var K = KINDS[kind]; if (!K) return false;
        var N = root.SLNavAreas;
        if (N && typeof N.goto === 'function') return N.goto(sysId == null ? 'aircraft' : String(sysId), K.tab);
        _forced = sysId == null ? 'aircraft' : String(sysId);
        try { if (typeof root.switchTab === 'function') root.switchTab(K.tab); } catch (_) {}
        return true;
    }

    // ---- every page redraws its header when it draws ---------------------------------------------------------------
    // the pages call mount() themselves (cheap); this also keeps it right after a level change on the same page
    function refresh() { Object.keys(KINDS).forEach(function (k) { try { var vw = typeof document !== 'undefined' && document.getElementById('view-' + KINDS[k].tab); if (vw && vw.offsetParent !== null) mount(k); } catch (_) {} }); }

    var api = { VERSION: VERSION, KINDS: KINDS, view: view, sysOf: sysOf, shows: shows, rowsIn: rowsIn, stamp: stamp, headerHtml: headerHtml,
                mount: mount, open: open, kindOfTab: kindOfTab, isSystemTab: isSystemTab, systemsWith: systemsWith, refresh: refresh,
                // 25 Oct 2026: the system a fault tree belongs to (its PSSA or SSA), or null (the aircraft's, or Standalone)
                sysOfPage: function (p) { var s0 = _sysOfPage(p); return s0 == null || s0 === '' ? null : String(s0); },
                showsPage: function (p) { var s0 = _sysOfPage(p); return (s0 == null || s0 === '' ? null : String(s0)) === view(); },
                _setView: function (v) { _forced = v; } };
    try { root.SLLevelView = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

// ============================================================================
// content_guard.js — v1.0 — SLContentGuard (12 Nov 2026).
//
// WHY THIS FILE EXISTS. Live team data, 10 and 11 Nov 2026: one student's
// browser saved an old copy of a shared project over the team's newer work,
// twice. The saved copy went from 250 fault tree events to 108 (put back by a
// teammate's next save) and then from 250 to 135 (nobody noticed; the team kept
// building on the smaller copy). Nothing anywhere asked "is this save about to
// remove a large part of the project?". Every path that can write the shared
// project (the cloud copy, the live shared copy, a restore) now measures what a
// write would remove first, with this one rule, and holds a large removal back
// instead of letting it land silently.
//
// Pure: no DOM, no app state. Vm-testable. Exposed as window.SLContentGuard.
// ============================================================================
(function () {
    'use strict';
    var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
    if (G.SLContentGuard && G.SLContentGuard._v === '1.0') return;

    // The row collections of a project (the same list the live shared copy syncs).
    var ROWS = ['acFunctionsData', 'acFhaData', 'acReqData', 'acAssumptionsData', 'praData', 'zsaData', 'cmaData',
        'fmeaData', 'acFcimData', 'routingData', 'resourcesData', 'itemsData', 'flightPhasesData', 'systemsData'];

    function _countTree(n) {
        if (!n || typeof n !== 'object') return 0;
        var kids = Array.isArray(n.children) ? n.children : (Array.isArray(n._children) ? n._children : []);
        var c = 1;
        for (var i = 0; i < kids.length; i++) c += _countTree(kids[i]);
        return c;
    }
    // A project's size: rows across the row collections, fault tree pages, fault tree events (nodes).
    // System level FHA rows and functions are counted too (they live inside systemsData).
    function measure(snap) {
        var s = snap;
        if (typeof s === 'string') { try { s = JSON.parse(s); } catch (_) { s = null; } }
        var out = { rows: 0, pages: 0, nodes: 0 };
        if (!s || typeof s !== 'object') return out;
        ROWS.forEach(function (k) { if (Array.isArray(s[k])) out.rows += s[k].length; });
        if (Array.isArray(s.systemsData)) s.systemsData.forEach(function (sys) {
            if (!sys || typeof sys !== 'object') return;
            ['fha', 'functions', 'req', 'fcim', 'asm'].forEach(function (k) { if (Array.isArray(sys[k])) out.rows += sys[k].length; });
        });
        if (Array.isArray(s.ftaPages)) s.ftaPages.forEach(function (pg) {
            if (!pg) return;
            out.pages++;
            out.nodes += _countTree(pg.root);
        });
        return out;
    }

    // Thresholds. A removal is LARGE when it takes away at least MIN items of one kind AND at least
    // FRACTION of what was there, or any whole fault tree page with events in it is part of a large
    // event loss. Small everyday deletes (a row, a few events) never trip it.
    var MIN = 10, FRACTION = 0.10, MIN_PAGES = 2;
    function loss(before, after) {
        var b = before || {}, a = after || {};
        var l = {
            rows: Math.max(0, (b.rows || 0) - (a.rows || 0)),
            pages: Math.max(0, (b.pages || 0) - (a.pages || 0)),
            nodes: Math.max(0, (b.nodes || 0) - (a.nodes || 0))
        };
        var big = (l.nodes >= MIN && l.nodes >= FRACTION * (b.nodes || 0)) ||
                  (l.rows >= MIN && l.rows >= FRACTION * (b.rows || 0)) ||
                  (l.pages >= MIN_PAGES);
        l.big = !!big;
        l.text = describe(l);
        return l;
    }
    // Plain words for a removal: "35 fault tree events, 2 fault tree pages and 12 rows".
    function describe(l) {
        var parts = [];
        if (l.nodes) parts.push(l.nodes + ' fault tree event' + (l.nodes === 1 ? '' : 's'));
        if (l.pages) parts.push(l.pages + ' fault tree page' + (l.pages === 1 ? '' : 's'));
        if (l.rows) parts.push(l.rows + ' row' + (l.rows === 1 ? '' : 's'));
        if (!parts.length) return 'nothing';
        if (parts.length === 1) return parts[0];
        return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
    }
    // A planned removal measured directly (counts of keys a write would delete), against the size before.
    function isLarge(removed, before) {
        var r = removed || {}, b = before || {};
        return loss(b, { rows: (b.rows || 0) - (r.rows || 0), pages: (b.pages || 0) - (r.pages || 0), nodes: (b.nodes || 0) - (r.nodes || 0) });
    }

    G.SLContentGuard = { _v: '1.0', measure: measure, loss: loss, isLarge: isLarge, describe: describe, ROWS: ROWS.slice(), MIN: MIN, FRACTION: FRACTION, MIN_PAGES: MIN_PAGES };
})();

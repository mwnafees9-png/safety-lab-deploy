// fta_loops.js: SLFtaLoops 1.0
//
// 1 Nov 2026 (customer checklist item 45, Waqas: "no number is the way to go"): CIRCULAR TRANSFERS.
// A transfer gate hands its branch to another fault tree. When the trees hand on to each other in a circle
// (A -> B -> A, or A -> B -> C -> A), the circle has no bottom: no fault tree can be calculated around it.
// The engine used to stop following a tree it had already visited, so where the circle was cut depended on
// which tree you started from, and the same system could show two different numbers with nobody told.
//
// What the app does now:
//   - the engines refuse (fta_engine.js CircularTransferError: getCutsets, the exact diagram, the worker
//     flattening), so every pass or fail screen withholds its verdict (SLTopBasis.exactTop is null);
//   - every node whose result depends on a circle is stamped node._circular = { loop, inLoop } by stamp(),
//     which calculateAllProbabilities runs first: the canvas shows "No result: circular transfer" in place of
//     its number, the warning pill and the properties box name the circle (ftaNodeWarnings), and a transfer
//     gate ON the circle is drawn red;
//   - reports and tables print NO_RESULT for a tree on or above a circle (noResult(page));
//   - the Golden Thread draws the circle as a red broken link between the trees, the path spelled out;
//   - an integrated tree (item 42) can never be built through a circle (refuse(page)).
//
// A circle is found on the page graph: one edge per transfer, from the page the transfer sits on to the page
// it points at. Strongly connected components (Tarjan) give every circle once; a page that is not on a circle
// but transfers into one (at any depth) depends on it too, and is "tainted".
//
// API (window.SLFtaLoops):
//   analyze(pages?)        { loops: [[{id,name},...,first again]], onLoop: Set(pageId), tainted: Map(pageId -> loop) }
//   stamp(pages?)          analyze, then stamp node._circular on every node that depends on a circle, clear it
//                          everywhere else; returns the analysis (kept as last())
//   last()                 the analysis the last stamp() made
//   loopFor(pageOrId)      the circle this page is on or depends on, or null
//   noResult(pageOrRoot)   true when this tree's result depends on a circle
//   path(loop)             "A → B → A"
//   message(loop)          the one sentence every screen uses
//   refuse(pageOrRoot)     throws CircularTransferError when the tree depends on a circle
//   NO_RESULT              'No result: circular transfer'
(function () {
    'use strict';
    var VERSION = '1.0';
    var NO_RESULT = 'No result: circular transfer';
    var _last = { loops: [], onLoop: new Set(), tainted: new Map() };

    function _pages(pages) {
        if (Array.isArray(pages)) return pages;
        try { if (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) return ftaPages; } catch (_) {}
        return [];
    }
    function _isTransfer(n) { return !!n && (n.gateType === 'TRANSFER' || !!n.transferOutTo); }
    function _target(n) { var t = n.transferOutTo || n.linkedPageId; return t == null || t === '' ? null : String(t); }
    function _kids(n) { return (n && (n.children || n._children)) || []; }

    // page id -> [target page id] (only targets that exist and have a tree)
    function _graph(pages) {
        var byId = new Map(), edges = new Map();
        pages.forEach(function (p) { if (p && p.id != null) byId.set(String(p.id), p); });
        pages.forEach(function (p) {
            if (!p || p.id == null || !p.root) return;
            var out = [], seen = new Set();
            (function walk(n) {
                if (!n || seen.has(n)) return; seen.add(n);
                if (_isTransfer(n)) { var t = _target(n); if (t && byId.has(t) && byId.get(t).root && out.indexOf(t) === -1) out.push(t); }
                _kids(n).forEach(walk);
            })(p.root);
            edges.set(String(p.id), out);
        });
        return { byId: byId, edges: edges };
    }
    function _named(ids, byId) { return ids.map(function (id) { var p = byId.get(id); return { id: id, name: (p && (p.name || p.topEvent)) || id }; }); }

    // one circle inside a strongly connected component, starting and ending at `start`
    function _cycleFrom(start, members, edges) {
        var prev = new Map([[start, null]]), queue = [start], hit = null;
        while (queue.length && !hit) {
            var cur = queue.shift();
            var outs = edges.get(cur) || [];
            for (var i = 0; i < outs.length; i++) {
                var t = outs[i];
                if (!members.has(t)) continue;
                if (t === start) { hit = cur; break; }
                if (!prev.has(t)) { prev.set(t, cur); queue.push(t); }
            }
        }
        if (hit == null) return [start, start];   // a page that transfers to itself
        var back = []; for (var c = hit; c != null; c = prev.get(c)) back.push(c);
        back.reverse(); back.push(start);
        return back;
    }

    function analyze(pagesIn) {
        var pages = _pages(pagesIn), g = _graph(pages), edges = g.edges;
        // Tarjan, iterative (a project can hold hundreds of trees)
        var index = 0, idx = new Map(), low = new Map(), onStack = new Set(), stack = [], comps = [];
        edges.forEach(function (_, v0) {
            if (idx.has(v0)) return;
            var work = [{ v: v0, i: 0 }];
            idx.set(v0, index); low.set(v0, index); index++; stack.push(v0); onStack.add(v0);
            while (work.length) {
                var top = work[work.length - 1], outs = edges.get(top.v) || [];
                if (top.i < outs.length) {
                    var w = outs[top.i++];
                    if (!idx.has(w)) { idx.set(w, index); low.set(w, index); index++; stack.push(w); onStack.add(w); work.push({ v: w, i: 0 }); }
                    else if (onStack.has(w)) low.set(top.v, Math.min(low.get(top.v), idx.get(w)));
                } else {
                    work.pop();
                    if (work.length) { var up = work[work.length - 1].v; low.set(up, Math.min(low.get(up), low.get(top.v))); }
                    if (low.get(top.v) === idx.get(top.v)) {
                        var comp = [], x;
                        do { x = stack.pop(); onStack.delete(x); comp.push(x); } while (x !== top.v);
                        comps.push(comp);
                    }
                }
            }
        });
        var loops = [], onLoop = new Set(), loopOfPage = new Map();
        comps.forEach(function (comp) {
            var self = comp.length === 1 && (edges.get(comp[0]) || []).indexOf(comp[0]) !== -1;
            if (comp.length < 2 && !self) return;
            // start from the page that comes first in the project, so the path reads the same every time
            var order = pages.map(function (p) { return p && String(p.id); });
            comp.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
            var members = new Set(comp);
            var loop = _named(_cycleFrom(comp[0], members, edges), g.byId);
            loop.members = comp.slice();
            loops.push(loop);
            comp.forEach(function (pid) { onLoop.add(pid); loopOfPage.set(pid, loop); });
        });
        // a page that reaches a circle (at any depth) depends on it: the first circle met, depth first
        var tainted = new Map(loopOfPage), state = new Map();
        function reach(pid) {
            if (tainted.has(pid)) return tainted.get(pid);
            if (state.get(pid) === 1) return null;
            state.set(pid, 1);
            var outs = edges.get(pid) || [], found = null;
            for (var i = 0; i < outs.length && !found; i++) found = reach(outs[i]);
            if (found) tainted.set(pid, found);
            return found;
        }
        edges.forEach(function (_, pid) { reach(pid); });
        return { loops: loops, onLoop: onLoop, tainted: tainted, byId: g.byId, edges: edges };
    }

    // node._circular on every node whose result depends on a circle; cleared everywhere else
    function stamp(pagesIn) {
        var pages = _pages(pagesIn), a = analyze(pages);
        pages.forEach(function (p) {
            if (!p || !p.root) return;
            var pid = String(p.id), pageTainted = a.tainted.has(pid), seen = new Set();
            // an allocation tree hands its budget down from its top: on a tree that depends on a circle every budget
            // depends on where the circle would be cut, leaves included; a verification tree's leaves are its own inputs
            var alloc = pageTainted && (p.mode ? p.mode === 'top-down' : !p.verifies);
            (function walk(n) {
                if (!n || seen.has(n)) return null;
                seen.add(n);
                var hit = null;
                if (_isTransfer(n)) {
                    var t = _target(n);
                    if (t && a.tainted.has(t)) {
                        var inLoop = a.onLoop.has(pid) && a.onLoop.has(t) && a.tainted.get(t) === a.tainted.get(pid);
                        hit = { loop: a.tainted.get(t), inLoop: inLoop };
                    }
                }
                _kids(n).forEach(function (c) { var h = walk(c); if (h && !hit) hit = { loop: h.loop, inLoop: false }; });
                if (hit && pageTainted) n._circular = hit;
                else if (alloc) n._circular = { loop: a.tainted.get(pid), inLoop: false, budget: true };
                else if (n._circular) delete n._circular;
                return hit;
            })(p.root);
        });
        _last = a;
        return a;
    }
    function last() { return _last; }

    function _pageOf(x, pages) {
        if (x == null) return null;
        pages = _pages(pages);
        if (typeof x === 'object') {
            if (x.root !== undefined && x.id != null) return x;
            for (var i = 0; i < pages.length; i++) if (pages[i] && pages[i].root === x) return pages[i];
            return null;
        }
        for (var j = 0; j < pages.length; j++) if (pages[j] && String(pages[j].id) === String(x)) return pages[j];
        return null;
    }
    // live: always the project as it is now (a tree can be relinked between two calculations)
    function loopFor(x, pages) {
        var pg = _pageOf(x, pages);
        if (pg) { var a = analyze(pages); return a.tainted.get(String(pg.id)) || null; }
        // a node that is not a tree's top: the circle its own transfers reach
        if (x && typeof x === 'object') {
            var hit = null, a2 = null, seen = new Set();
            (function walk(n) {
                if (!n || hit || seen.has(n)) return; seen.add(n);
                if (_isTransfer(n)) { var t = _target(n); if (t) { a2 = a2 || analyze(pages); if (a2.tainted.has(t)) hit = a2.tainted.get(t); } }
                _kids(n).forEach(walk);
            })(x);
            return hit;
        }
        return null;
    }
    function noResult(x, pages) { return !!loopFor(x, pages); }
    function path(loop) { return (loop || []).map(function (p) { return p && (p.name || p.id) || '?'; }).join(' → '); }
    function message(loop) { return 'No result: this depends on a circular transfer (' + path(loop) + '). A fault tree cannot be calculated around a circle. Break the circle and the results come back.'; }
    function refuse(x, pages) {
        var loop = loopFor(x, pages);
        if (!loop) return;
        var E = (typeof window !== 'undefined' && window.CircularTransferError) || null;
        if (E) throw new E(loop);
        var e = new Error(message(loop)); e.name = 'CircularTransferError'; e.loop = loop; e.permanent = true; throw e;
    }

    var api = { VERSION: VERSION, NO_RESULT: NO_RESULT, analyze: analyze, stamp: stamp, last: last, loopFor: loopFor, noResult: noResult, path: path, message: message, refuse: refuse };
    try { if (typeof window !== 'undefined') window.SLFtaLoops = api; } catch (_) {}
    try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (_) {}
})();

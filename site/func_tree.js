// ============================================================================
// func_tree.js, v1.0, 21 Oct 2026: aircraft functions to any depth.
//
// Waqas's ruling (21 Oct 2026): full tree support. Customers keep
// a function decomposition that goes far deeper than "function, sub-function",
// and they keep it live in Jama. Safety Lab must hold the whole tree, not a
// flattened copy of it.
//
// THE SHAPE. acFunctionsData stays one row per node, so every existing reader
// (FHA, FCIM, traceability, MAC, routing, ZSA, model links, sync, exports)
// keeps working on the same rows it always read:
//   funcId / funcName / funcDef   the top-level aircraft function the node
//                                 belongs to (unchanged meaning)
//   subId / subName / subDef      the node itself (unchanged meaning)
//   parentSubId                   NEW, optional. The subId of the node this
//                                 one sits under, inside the same function.
//                                 Blank or absent means "directly under the
//                                 aircraft function", which is what every row
//                                 written before this file means.
// A row with no subId is a function with nothing under it yet (as before).
//
// No level number is stored. Depth is computed from the parent chain, so it
// can never disagree with the tree. Every reader below is defensive: a parent
// that does not exist, a parent in another function, or a loop is treated as
// "directly under the function" for display and reported by check(), never a
// throw.
//
// WHAT THIS FILE OFFERS (window.SLFuncTree):
//   index(arr)            lookup tables for one pass of work
//   parentOf(row, ix)     the parent node row, or null
//   depth(row, ix)        1 = directly under the function, 2 = one below, ...
//   ordered(arr)          rows in tree order: functions in first-seen order,
//                         each node followed by its children (depth first)
//   path(row, ix)         [function, ..., this node] as {id, name} pairs
//   pathText(row, ix)     "Control Flight Path > Pitch > Elevator authority"
//   childrenOf(subId, ix) direct children rows
//   descendants(subId,ix) every row below a node
//   pickList(arr)         [{value, label, depth, row}] for every picker,
//                         deduped by subId, in tree order, indented
//   check(row, arr)       '' if the row's parent is valid, else the reason
//   problems(arr)         every row whose parent is not valid, with reason
// ============================================================================
(function (root) {
    'use strict';

    function S(v) { return v == null ? '' : String(v).trim(); }
    function arrOf(a) { return Array.isArray(a) ? a : []; }

    // One pass over the store. bySub keeps the FIRST row for a subId (the
    // same rule every existing reader uses with .find()).
    function index(arr) {
        const rows = arrOf(arr);
        const bySub = new Map(), kids = new Map(), pos = new Map();
        rows.forEach(function (r, i) {
            if (!r) return;
            pos.set(r, i);
            const id = S(r.subId);
            if (id && !bySub.has(id)) bySub.set(id, r);
        });
        const ix = { rows: rows, bySub: bySub, kids: kids, pos: pos, _depth: new Map() };
        rows.forEach(function (r) {
            if (!r) return;
            const p = parentOf(r, ix);
            if (!p) return;
            const k = S(p.subId);
            if (!kids.has(k)) kids.set(k, []);
            kids.get(k).push(r);
        });
        return ix;
    }

    // The parent row, only when it is real: it exists, it is not the row
    // itself, it belongs to the same aircraft function, and following parents
    // up from it never comes back to this row.
    function parentOf(row, ix) {
        if (!row) return null;
        const pid = S(row.parentSubId);
        if (!pid || pid === S(row.subId)) return null;
        const p = ix.bySub.get(pid);
        if (!p || p === row) return null;
        if (S(p.funcId) !== S(row.funcId)) return null;
        // loop guard: walk up from p; if we meet row, the link is a cycle
        const seen = new Set([row]);
        let cur = p, guard = 0;
        while (cur && guard++ < 10000) {
            if (seen.has(cur)) return null;
            seen.add(cur);
            const up = S(cur.parentSubId);
            if (!up || up === S(cur.subId)) break;
            const nxt = ix.bySub.get(up);
            if (!nxt || S(nxt.funcId) !== S(cur.funcId)) break;
            cur = nxt;
        }
        return p;
    }

    function depth(row, ix) {
        if (!row) return 0;
        if (ix._depth.has(row)) return ix._depth.get(row);
        let d = 1, cur = row, guard = 0;
        while (guard++ < 10000) {
            const p = parentOf(cur, ix);
            if (!p) break;
            d++; cur = p;
        }
        ix._depth.set(row, d);
        return d;
    }

    function childrenOf(subId, ix) { return (ix.kids.get(S(subId)) || []).slice(); }

    function descendants(subId, ix) {
        const out = [], stack = childrenOf(subId, ix), seen = new Set();
        while (stack.length) {
            const r = stack.shift();
            if (!r || seen.has(r)) continue;
            seen.add(r); out.push(r);
            childrenOf(r.subId, ix).forEach(function (c) { stack.push(c); });
        }
        return out;
    }

    // Tree order. Functions keep the order they first appear in the store;
    // inside a function, the roots (rows with no valid parent) keep store
    // order and each is followed by its subtree, children in store order.
    function ordered(arr, ixIn) {
        const ix = ixIn || index(arr);
        const out = [], placed = new Set();
        const fnOrder = [], fnRoots = new Map();
        ix.rows.forEach(function (r) {
            if (!r) return;
            const f = S(r.funcId) || ('\u0000row:' + ix.pos.get(r));
            if (!fnRoots.has(f)) { fnRoots.set(f, []); fnOrder.push(f); }
            if (!parentOf(r, ix)) fnRoots.get(f).push(r);
        });
        function visit(r) {
            if (!r || placed.has(r)) return;
            placed.add(r); out.push(r);
            const id = S(r.subId);
            if (id && ix.bySub.get(id) === r) childrenOf(id, ix).forEach(visit);
        }
        fnOrder.forEach(function (f) { fnRoots.get(f).forEach(visit); });
        // anything not reached (duplicate subIds hanging under a twin) keeps store order at the end of its function
        ix.rows.forEach(function (r) { if (r && !placed.has(r)) { placed.add(r); out.push(r); } });
        return out;
    }

    function path(row, ix) {
        if (!row) return [];
        const chain = [];
        let cur = row, guard = 0;
        while (cur && guard++ < 10000) { chain.unshift(cur); cur = parentOf(cur, ix); }
        const out = [];
        if (S(row.funcId) || S(row.funcName)) out.push({ id: S(row.funcId), name: S(row.funcName) });
        chain.forEach(function (r) { if (S(r.subId) || S(r.subName)) out.push({ id: S(r.subId), name: S(r.subName) }); });
        return out;
    }

    function pathText(row, ix) {
        return path(row, ix).map(function (p) { return p.name || p.id; }).filter(Boolean).join(' > ');
    }

    // Picker label: indented by depth so a long list still reads as a tree.
    // Non-breaking spaces survive inside <option> and checkbox labels.
    function pickLabel(row, ix) {
        const d = depth(row, ix);
        const pad = d > 1 ? new Array(d).join('   ') + '↳ ' : '';
        return pad + S(row.subId) + (S(row.subName) ? '  ·  ' + S(row.subName) : '');
    }

    function pickList(arr) {
        const ix = index(arr), seen = new Set(), out = [];
        ordered(arr, ix).forEach(function (r) {
            const id = S(r.subId);
            if (!id || seen.has(id)) return;
            seen.add(id);
            out.push({ value: id, label: pickLabel(r, ix), depth: depth(r, ix), row: r });
        });
        return out;
    }

    // Validation for a row about to be saved. `arr` is the store as it will
    // be once the row is in it (or the current store; the row is looked up
    // by internalId so an edit validates against its own new values).
    function check(row, arr) {
        const pid = S(row && row.parentSubId);
        if (!pid) return '';
        if (pid === S(row.subId)) return 'A sub-function cannot sit under itself.';
        const others = arrOf(arr).filter(function (r) { return r && String(r.internalId) !== String(row.internalId); });
        const p = others.find(function (r) { return S(r.subId) === pid; });
        if (!p) return 'The parent sub-function ' + pid + ' does not exist.';
        if (S(p.funcId) !== S(row.funcId)) return 'The parent ' + pid + ' belongs to aircraft function ' + (S(p.funcId) || '(none)') + ', not ' + (S(row.funcId) || '(none)') + '. A sub-function and its parent must be in the same function.';
        // would the new link make a loop? walk up from the parent using the store with this row's new values
        const ix = index(others.concat([row]));
        let cur = p, guard = 0;
        while (cur && guard++ < 10000) {
            if (S(cur.subId) === S(row.subId) && S(row.subId)) return 'That parent sits under ' + S(row.subId) + ' already, so this would make a loop.';
            const up = S(cur.parentSubId);
            if (!up) break;
            cur = ix.bySub.get(up);
        }
        return '';
    }

    function problems(arr) {
        const rows = arrOf(arr), out = [];
        rows.forEach(function (r) {
            if (!r || !S(r.parentSubId)) return;
            const why = check(r, rows);
            if (why) out.push({ row: r, reason: why });
        });
        return out;
    }

    const API = { index: index, parentOf: parentOf, depth: depth, ordered: ordered, path: path, pathText: pathText,
                  childrenOf: childrenOf, descendants: descendants, pickLabel: pickLabel, pickList: pickList,
                  check: check, problems: problems };
    root.SLFuncTree = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

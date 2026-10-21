// ============================================================================
// jama_tree.js, v1.0, 21 Oct 2026: the Jama function tree, as Safety Lab rows.
//
// Waqas's ruling (21 Oct 2026): track a customer's aircraft functions live from
// Jama, the same way requirements are tracked, with the full decomposition
// (func_tree.js holds it to any depth). Nothing changes until someone signs.
//
// This file is PURE: no network, no DOM, no globals written. live_bridge.js
// fetches the items and draws the review; everything that decides what the
// tree is, what changed, and how the rows are written lives here, so it can be
// tested against recorded Jama payloads.
//
// HOW THE JAMA TREE MAPS (func_tree.js shape):
//   A function item with no function above it is a TOP function. It becomes
//   the aircraft function: funcId = its Jama key, funcName / funcDef = its name
//   and description. It has no row of its own while it has functions under it;
//   when it has none, it gets one function-only row (no subId), as a function
//   with nothing under it always has in Safety Lab.
//   Every other function item is a node row: subId = its Jama key, under the
//   top function it belongs to, with parentSubId = the key of the function
//   item directly above it (blank when that is the top function).
//   Folders, sets and other item types between functions are looked through:
//   a function inside a folder inside a function sits under that function.
//
// IDENTITY. Rows remember the Jama item they came from in row.fnSource:
//   { tool: 'jama-live', remoteId, key, funcRemoteId, parentRemoteId,
//     lastChange, by, at, funcOnly?, missingInSource? }
// Matching is by Jama's numeric item id, never by name or key. A key that
// changes in Jama (an item moved between sets) is reported and recorded, and
// the row keeps the subId it was created with, because FHA, FCIM, trace and
// model links all point at that subId.
//
// NEVER DELETES. An item that is gone from Jama is flagged missingInSource on
// its row. FHA rows, failure conditions and traceability hang off functions;
// only an engineer removes one.
// ============================================================================
(function (root) {
    'use strict';

    const TOOL = 'jama-live';
    function S(v) { return v == null ? '' : String(v).trim(); }
    function arrOf(a) { return Array.isArray(a) ? a : []; }

    // Jama descriptions are rich text (HTML). Safety Lab cells are plain text.
    function plain(html) {
        let t = String(html == null ? '' : html);
        t = t.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n').replace(/<[^>]*>/g, '');
        const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
        t = t.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, function (m, k) {
            const kl = k.toLowerCase();
            if (kl[0] === '#') { const n = kl[1] === 'x' ? parseInt(kl.slice(2), 16) : parseInt(kl.slice(1), 10); return isFinite(n) ? String.fromCodePoint(n) : m; }
            return Object.prototype.hasOwnProperty.call(ent, kl) ? ent[kl] : m;
        });
        return t.split('\n').map(function (l) { return l.replace(/[ \t ]+/g, ' ').trim(); }).filter(Boolean).join('\n');
    }

    // One Jama item (abstractitems / items payload) in the shape the rest uses.
    // Vendor payloads drift: anything missing degrades to empty, never a throw.
    function normalizeItem(it) {
        if (!it || it.id == null) return null;
        const f = it.fields || {}, loc = it.location || {}, par = loc.parent || {};
        return {
            id: Number(it.id),
            key: S(it.documentKey) || ('JAMA-' + it.id),
            type: it.itemType != null ? Number(it.itemType) : null,
            name: S(f.name || f.title),
            text: plain(f.description || f.text || ''),
            modified: S(it.modifiedDate || f.modifiedDate),
            parentItemId: par.item != null ? Number(par.item) : null,
            sort: loc.globalSortOrder != null ? Number(loc.globalSortOrder) : (loc.sortOrder != null ? Number(loc.sortOrder) : null),
            seq: S(loc.sequence),
        };
    }

    // For every function item, the function item directly above it (or null for a
    // top function), looking through folders, sets and other types. fetchItem(id)
    // is async and returns a raw Jama item (or null); results are cached and the
    // number of lookups is capped so a broken payload cannot loop or flood the server.
    async function resolveFunctionParents(items, fnTypes, fetchItem, opts) {
        const o = opts || {};
        const maxLookups = o.maxLookups || 400, maxHops = o.maxHops || 25;
        const fnSet = new Set(arrOf(fnTypes).map(Number));
        const byId = new Map();
        arrOf(items).forEach(function (n) { if (n) byId.set(n.id, n); });
        const cache = new Map(); let lookups = 0; const warnings = [];
        async function get(id) {
            if (byId.has(id)) return byId.get(id);
            if (cache.has(id)) return cache.get(id);
            if (!fetchItem || lookups >= maxLookups) { cache.set(id, null); return null; }
            lookups++;
            let raw = null;
            try { raw = await fetchItem(id); } catch (_) { raw = null; }
            const n = normalizeItem(raw && raw.data ? raw.data : raw);
            cache.set(id, n);
            return n;
        }
        const out = new Map();
        for (const n of arrOf(items)) {
            if (!n || !fnSet.has(n.type)) continue;
            let pid = n.parentItemId, hops = 0, found = null;
            const seen = new Set([n.id]);
            while (pid != null && hops++ < maxHops) {
                if (seen.has(pid)) { warnings.push('Item ' + n.key + ' has a loop in its Jama parents; treated as a top function.'); break; }
                seen.add(pid);
                const p = await get(pid);
                if (!p) break;
                if (fnSet.has(p.type)) { found = p.id; break; }
                pid = p.parentItemId;
            }
            out.set(n.id, found);
        }
        if (lookups >= maxLookups) warnings.push('Stopped looking up folders after ' + maxLookups + ' lookups; some functions may show as top-level.');
        return { parentOf: out, lookups: lookups, warnings: warnings };
    }

    // The Jama function tree: tops, children, depth. Pure.
    function buildTree(items, fnTypes, parentOf) {
        const fnSet = new Set(arrOf(fnTypes).map(Number));
        const fns = arrOf(items).filter(function (n) { return n && fnSet.has(n.type); });
        const byId = new Map(fns.map(function (n) { return [n.id, n]; }));
        const par = new Map(), kids = new Map();
        fns.forEach(function (n) {
            let p = parentOf instanceof Map ? parentOf.get(n.id) : null;
            if (p != null && !byId.has(p)) p = null;     // parent function not in the fetched set
            par.set(n.id, p == null ? null : p);
            if (p != null) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(n); }
        });
        const sortKey = function (n) { return n.sort != null ? n.sort : n.id; };
        kids.forEach(function (list) { list.sort(function (a, b) { return sortKey(a) - sortKey(b); }); });
        function topOf(n) { let cur = n, g = 0, seen = new Set(); while (cur && par.get(cur.id) != null && g++ < 10000) { if (seen.has(cur.id)) break; seen.add(cur.id); cur = byId.get(par.get(cur.id)); } return cur; }
        const tops = fns.filter(function (n) { return par.get(n.id) == null; }).sort(function (a, b) { return sortKey(a) - sortKey(b); });
        // depth-first order: each top, then its subtree
        const order = [], placed = new Set();
        (function walk(list) { list.forEach(function (n) { if (placed.has(n.id)) return; placed.add(n.id); order.push(n); walk(kids.get(n.id) || []); }); })(tops);
        fns.forEach(function (n) { if (!placed.has(n.id)) { placed.add(n.id); order.push(n); } });
        return { byId: byId, parentId: par, kids: kids, tops: tops, order: order, topOf: topOf };
    }

    function _jamaRows(rows) { return arrOf(rows).filter(function (r) { return r && r.fnSource && r.fnSource.tool === TOOL; }); }

    // What would change. Pure: tree + current acFunctionsData -> the staged review.
    //   fresh      Jama function items with no row yet (nodes and function-only tops)
    //   changed    rows whose name, description or Jama key changed (or that came back)
    //   moved      rows whose place in the tree changed (new parent or new top function)
    //   fnChanged  top functions whose name or description changed (applies to every row of it)
    //   missing    rows from Jama whose item is no longer there (flagged, never deleted)
    //   unchanged  count
    function diffFunctions(tree, rows) {
        const mine = _jamaRows(rows);
        const nodeByRemote = new Map(), onlyByRemote = new Map(), rowsByTop = new Map();
        mine.forEach(function (r) {
            const s = r.fnSource;
            if (s.funcOnly) onlyByRemote.set(Number(s.remoteId), r);
            else nodeByRemote.set(Number(s.remoteId), r);
            const t = Number(s.funcOnly ? s.remoteId : s.funcRemoteId);
            if (!rowsByTop.has(t)) rowsByTop.set(t, []);
            rowsByTop.get(t).push(r);
        });
        const fresh = [], changed = [], moved = [], fnChanged = [], missing = [];
        let unchanged = 0;
        const seenNode = new Set(), seenOnly = new Set();
        tree.order.forEach(function (n) {
            const top = tree.topOf(n);
            const isTop = tree.parentId.get(n.id) == null;
            if (isTop) {
                const hasKids = (tree.kids.get(n.id) || []).length > 0;
                const its = rowsByTop.get(n.id) || [];
                const ref = its[0];
                if (ref && (S(ref.funcName) !== n.name || S(ref.funcDef) !== n.text)) {
                    fnChanged.push({ item: n, rows: its, fields: [S(ref.funcName) !== n.name ? 'name' : null, S(ref.funcDef) !== n.text ? 'description' : null].filter(Boolean) });
                }
                const only = onlyByRemote.get(n.id);
                if (only) seenOnly.add(n.id);
                if (!hasKids && !only && !its.length) fresh.push({ item: n, top: n, parent: null, funcOnly: true, depth: 0 });
                else if (only && only.fnSource.missingInSource && !hasKids) changed.push({ row: only, item: n, fields: ['back in Jama'] });
                else if (only && hasKids && !only.fnSource.missingInSource) missing.push({ row: only, why: 'this function now has sub-functions in Jama, so its function-only row is no longer needed (flagged for you to remove)' });
                return;
            }
            const parentId = tree.parentId.get(n.id);
            const parentNode = tree.byId.get(parentId);
            const wantParent = (parentNode && parentNode.id !== top.id) ? parentNode.id : null;
            const ex = nodeByRemote.get(n.id);
            let depth = 0; { let c = n, g = 0; while (c && tree.parentId.get(c.id) != null && g++ < 10000) { depth++; c = tree.byId.get(tree.parentId.get(c.id)); } }
            if (!ex) { fresh.push({ item: n, top: top, parent: wantParent != null ? tree.byId.get(wantParent) : null, funcOnly: false, depth: depth }); return; }
            seenNode.add(n.id);
            const fields = [];
            if (S(ex.subName) !== n.name) fields.push('name');
            if (S(ex.subDef) !== n.text) fields.push('description');
            if (S(ex.fnSource.key) && S(ex.fnSource.key) !== n.key) fields.push('Jama key ' + S(ex.fnSource.key) + ' is now ' + n.key);
            if (ex.fnSource.missingInSource) fields.push('back in Jama');
            const wasParent = ex.fnSource.parentRemoteId == null ? null : Number(ex.fnSource.parentRemoteId);
            const wasTop = ex.fnSource.funcRemoteId == null ? null : Number(ex.fnSource.funcRemoteId);
            const isMoved = wasParent !== wantParent || wasTop !== top.id;
            if (fields.length) changed.push({ row: ex, item: n, fields: fields });
            if (isMoved) moved.push({ row: ex, item: n, top: top, parent: wantParent != null ? tree.byId.get(wantParent) : null, depth: depth,
                                      fromParent: wasParent, fromTop: wasTop });
            if (!fields.length && !isMoved) unchanged++;
        });
        mine.forEach(function (r) {
            const s = r.fnSource, id = Number(s.remoteId);
            if (s.missingInSource) return;                         // already flagged; not news
            if (s.funcOnly) {
                const n = tree.byId.get(id);
                if (!n) missing.push({ row: r, why: 'no longer in Jama' });
                else if (tree.parentId.get(id) != null) missing.push({ row: r, why: 'no longer a top-level function in Jama (it now sits under ' + tree.topOf(n).key + ')' });
                return;
            }
            if (!tree.byId.has(id)) missing.push({ row: r, why: 'no longer in Jama' });
            else if (tree.parentId.get(id) == null) missing.push({ row: r, why: 'now a top-level function in Jama; its own function row is staged as new' });
        });
        // a node that became a top function needs its function-only row (if it has no children)
        mine.forEach(function (r) {
            const s = r.fnSource; if (s.funcOnly) return;
            const id = Number(s.remoteId), n = tree.byId.get(id);
            if (n && tree.parentId.get(id) == null && !(tree.kids.get(id) || []).length && !onlyByRemote.has(id) && !fresh.some(function (f) { return f.item.id === id; })) {
                fresh.push({ item: n, top: n, parent: null, funcOnly: true, depth: 0 });
            }
        });
        fresh.sort(function (a, b) { return a.depth - b.depth; });
        moved.sort(function (a, b) { return a.depth - b.depth; });
        return { fresh: fresh, changed: changed, moved: moved, fnChanged: fnChanged, missing: missing, unchanged: unchanged };
    }

    function pending(d) { return d ? d.fresh.length + d.changed.length + d.moved.length + d.fnChanged.length + d.missing.length : 0; }

    // Write the staged review into the rows. Mutates `rows` (acFunctionsData) in place and
    // returns counts. opts.newId() gives an internalId; opts.signedBy is required.
    function applyFunctions(diff, rows, opts) {
        const o = opts || {};
        const by = S(o.signedBy);
        if (!by) return { ok: false, err: 'A signature is required. The bridge watches; you decide.' };
        if (!Array.isArray(rows)) return { ok: false, err: 'The function store is not available.' };
        const at = o.at || new Date().toISOString();
        const newId = typeof o.newId === 'function' ? o.newId : (function () { let n = Date.now(); return function () { return String(n++); }; })();
        const usedSub = new Set(rows.map(function (r) { return r ? S(r.subId) : ''; }).filter(Boolean));
        const usedFn = new Set(rows.map(function (r) { return r ? S(r.funcId) : ''; }).filter(Boolean));
        function uniq(id, used, remoteId) {
            let v = S(id) || ('JAMA-' + remoteId);
            if (!used.has(v)) { used.add(v); return v; }
            v = v + '#' + remoteId; let k = 2;
            while (used.has(v)) v = S(id) + '#' + remoteId + '-' + (k++);
            used.add(v); return v;
        }
        // remote id -> the row that stands for it (nodes), and top remote id -> function identity
        const nodeRow = new Map(), fnOf = new Map();
        _jamaRows(rows).forEach(function (r) {
            const s = r.fnSource;
            if (!s.funcOnly) nodeRow.set(Number(s.remoteId), r);
            const t = Number(s.funcOnly ? s.remoteId : s.funcRemoteId);
            if (!fnOf.has(t) && S(r.funcId)) fnOf.set(t, { funcId: S(r.funcId), funcName: r.funcName, funcDef: r.funcDef });
        });
        function fnFor(top) {
            if (!fnOf.has(top.id)) fnOf.set(top.id, { funcId: uniq(top.key, usedFn, top.id), funcName: top.name, funcDef: top.text });
            return fnOf.get(top.id);
        }
        function src(item, top, parent, extra) {
            return Object.assign({ tool: TOOL, remoteId: item.id, key: item.key, funcRemoteId: top ? top.id : null,
                                   parentRemoteId: parent ? parent.id : null, lastChange: item.modified, by: by, at: at }, extra || {});
        }
        let added = 0, updated = 0, movedN = 0, flagged = 0, fnUpdated = 0;
        // 1. top-function name / description first, so new rows below take the new text
        arrOf(diff.fnChanged).forEach(function (x) {
            const f = fnFor(x.item); f.funcName = x.item.name; f.funcDef = x.item.text;
            rows.forEach(function (r) {
                if (!r || !r.fnSource || r.fnSource.tool !== TOOL) return;
                const t = Number(r.fnSource.funcOnly ? r.fnSource.remoteId : r.fnSource.funcRemoteId);
                if (t !== x.item.id) return;
                r.funcName = x.item.name; r.funcDef = x.item.text; r.fnSource.by = by; r.fnSource.at = at;
                fnUpdated++;
            });
        });
        // 2. new rows, parents before children (diff.fresh is sorted by depth)
        arrOf(diff.fresh).forEach(function (x) {
            const f = fnFor(x.top);
            let row;
            if (x.funcOnly) {
                row = { internalId: newId(), funcId: f.funcId, funcName: f.funcName, funcDef: f.funcDef, subId: '', subName: '', subDef: '',
                        fnSource: src(x.item, x.item, null, { funcOnly: true }) };
            } else {
                const pRow = x.parent ? nodeRow.get(x.parent.id) : null;
                row = { internalId: newId(), funcId: f.funcId, funcName: f.funcName, funcDef: f.funcDef,
                        subId: uniq(x.item.key, usedSub, x.item.id), subName: x.item.name, subDef: x.item.text,
                        fnSource: src(x.item, x.top, x.parent) };
                if (pRow && S(pRow.subId)) row.parentSubId = S(pRow.subId);
                nodeRow.set(x.item.id, row);
            }
            rows.push(row); added++;
        });
        // 3. content changes
        arrOf(diff.changed).forEach(function (x) {
            const r = x.row, it = x.item;
            if (!r.fnSource.funcOnly) { r.subName = it.name; r.subDef = it.text; }
            r.fnSource.key = it.key; r.fnSource.lastChange = it.modified; r.fnSource.by = by; r.fnSource.at = at;
            delete r.fnSource.missingInSource;
            updated++;
        });
        // 4. moves, shallow first, so a parent's place is settled before its children
        arrOf(diff.moved).forEach(function (x) {
            const r = x.row, f = fnFor(x.top);
            const pRow = x.parent ? nodeRow.get(x.parent.id) : null;
            r.funcId = f.funcId; r.funcName = f.funcName; r.funcDef = f.funcDef;
            if (pRow && S(pRow.subId) && pRow !== r) r.parentSubId = S(pRow.subId); else delete r.parentSubId;
            r.fnSource.funcRemoteId = x.top.id; r.fnSource.parentRemoteId = x.parent ? x.parent.id : null;
            r.fnSource.lastChange = x.item.modified; r.fnSource.by = by; r.fnSource.at = at;
            movedN++;
        });
        // 5. gone from Jama: flagged, never deleted
        arrOf(diff.missing).forEach(function (x) {
            x.row.fnSource.missingInSource = true; x.row.fnSource.missingWhy = x.why || ''; x.row.fnSource.flaggedAt = at; x.row.fnSource.flaggedBy = by;
            flagged++;
        });
        return { ok: true, added: added, updated: updated, moved: movedN, flagged: flagged, fnUpdated: fnUpdated };
    }

    const API = { TOOL: TOOL, plain: plain, normalizeItem: normalizeItem, resolveFunctionParents: resolveFunctionParents,
                  buildTree: buildTree, diffFunctions: diffFunctions, applyFunctions: applyFunctions, pending: pending };
    root.SLJamaTree = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

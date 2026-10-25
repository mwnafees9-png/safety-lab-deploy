// ============================================================================
// verify_sync.js, v1.0, 24 Oct 2026: every top-down tree has its verification tree, kept in step with it.
//
// Waqas, 24 Oct 2026: "when a top down tree is created I want it to automatically create an ASA SSA instance for
// the verification tree"; "all top down trees must be creating a verification tree"; "every verification tree
// details should keep updating as more detail is added to the top down tree"; on a deleted top-down tree "what
// are we verifying when the top down tree is gone? (we should prompt the user if they want to remove the
// verification tree too)"; and he agreed that branches taken out of a top-down tree are asked about, never
// deleted from the verification tree without asking, because they may already hold real numbers.
//
// WHAT IT DOES (a change-driven sweep, the idp_seed_trees.js way: after a load, and after any change)
//   1. MADE: a top-down tree with a top event and no verification tree gets one: the same structure, every event's
//      failure rate empty (the app's own copy, _cloneSubtreeForVerification), mode bottom-up, verifies = the tree.
//      Where it lives follows from the tree (tree_homes.js): an aircraft tree's in ASA, a system tree's in that
//      system's SSA, a standalone tree's in Standalone. The first sweep makes the missing ones for an existing
//      project and says how many. The licence gate on verification trees (canUseVerificationTree) still applies.
//   2. KEPT IN STEP: the verification tree takes the top-down tree's structure: its gates and events, their place,
//      names, ids, gate types, transfers, the item that realizes an event and its link to a system failure
//      condition (STRUCT below); new branches arrive with their rates empty. It may be more detailed than the
//      top-down tree (an event developed further, a failure the real design adds): that detail is its own, never
//      moved, never asked about. What belongs to the real design stays
//      the verification tree's own: rates, probabilities, repair and exposure models, Markov models, common cause
//      factors, FMES modes and decompositions. Identity follows the twin (mirror_modes.js). The tree's level,
//      system, failure condition link, target and mission profile follow (_syncMirrorOwnershipFromSource). Its
//      name follows while it is still the made-up one.
//   3. ASKED, NEVER ASSUMED: a branch taken out of the top-down tree is asked about once: remove it from the
//      verification tree too, or keep it (it stays, flagged _notInAllocation). A verification tree whose
//      top-down tree is gone (or is no longer top-down) is asked about too: delete it, or keep it as a
//      standalone bottom-up tree. Deleting a top-down tree (deleteTree) asks whether its verification tree goes too.
//
// API (window.SLVerifySync): sweep(opts), syncMirror(mirror), ensureMirror(page), deleteTree(pageId),
// structFp(root), STRUCT, VALUE. Kill switch: window.SL_VERIFY_SYNC_OFF = true.
// Load: after helpers_modules.js, misc_fn_modules.js, mirror_modes.js and tree_homes.js.
// Tests: tests/regression_verify_sync_20261024.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';
    // the fields a verification event takes from its twin (what the tree IS); everything else is its own
    var STRUCT = ['name', 'desc', 'description', 'type', 'gateType', 'displayId', 'linkedPageId', 'realizedByItemId', 'externalSource', 'k', 'kOfN', 'voteK', 'voteN', 'transferTo', 'transferFrom', 'isTransfer'];
    // the fields that hold the real design's numbers (never copied over an existing verification event)
    var VALUE = ['lambda', 'probability', 'inputValue', 'inputMode', 'mtbf', 'libraryKey', 'markovModelId', 'repairModel', 'tau', 'dormancyInterval', 'exposureMode', 'beta', 'ccfGroup', 'g1113'];

    function _pages() { try { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : (root.ftaPages || []); } catch (_) { return []; } }
    function _setPages(arr) { try { ftaPages = arr; } catch (_) { root.ftaPages = arr; } }
    function _call(name) { var f = root[name]; if (typeof f !== 'function') return; try { return f.apply(root, Array.prototype.slice.call(arguments, 1)); } catch (e) { try { console.warn('[verify_sync] ' + name, e); } catch (_) {} } }
    function _toast(m, k, ms) { _call('showToast', m, k || 'info', ms || 4500); }
    function _lid(n) { return String(n.logicalId != null ? n.logicalId : n.id); }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _setKids(n, arr) { if (n._children && !n.children) n._children = arr; else n.children = arr; }
    function _isMirror(p) { return !!(p && p.verifies); }
    function _topDown(p) { return !!p && !p.verifies && (p.mode || 'top-down') === 'top-down'; }
    function _homes() { return root.SLTreeHomes || null; }
    function _allowed() { try { return typeof root.canUseVerificationTree !== 'function' || root.canUseVerificationTree(); } catch (_) { return true; } }
    function _homeWord(p) { var H = _homes(); if (!H) return 'top-down'; var h = H.homeOf(p).home; return h === 'pasa' ? 'PASA' : h === 'pssa' ? 'PSSA' : 'top-down'; }

    // the structure a verification tree must follow, as one string (re-syncing only when it moved)
    function structFp(n) {
        if (!n) return '';
        var parts = [];
        (function walk(x, d) {
            if (!x) return;
            parts.push(d + ':' + _lid(x) + ':' + STRUCT.map(function (k) { var v = x[k]; return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); }).join('\u0001'));
            _kids(x).forEach(function (c) { walk(c, d + 1); });
        })(n, 0);
        return parts.join('\u0002');
    }

    // ---- 1. made ---------------------------------------------------------------------------------------
    function ensureMirror(page) {
        if (!_topDown(page) || !page.root || !_allowed()) return null;
        var existing = _pages().find(function (p) { return p && p.verifies === page.id; });
        if (existing) return existing;
        if (typeof root._cloneSubtreeForVerification !== 'function') return null;
        var mroot = root._cloneSubtreeForVerification(page.root, true);
        var m = {
            id: 'ver-' + page.id + '-' + Date.now().toString(36),
            name: (page.name || 'Tree') + ' (Verification)', _nameFrom: page.name || 'Tree',
            root: mroot, mode: 'bottom-up', verifies: page.id,
            treeLevel: page.treeLevel || 'standalone', systemId: page.systemId,
            linkedFhaId: page.linkedFhaId, linkedFhaIds: Array.isArray(page.linkedFhaIds) ? page.linkedFhaIds.slice() : undefined,
            missionProfileId: page.missionProfileId || '',
            targetP: (typeof page.targetP === 'number') ? page.targetP : undefined,
            autoVerification: { at: new Date().toISOString() },
            _syncFp: structFp(page.root)
        };
        (function idx(n) { if (!n) return; (m._srcLids = m._srcLids || []).push(_lid(n)); _kids(n).forEach(idx); })(page.root);
        _pages().push(m);
        return m;
    }

    // ---- 2. kept in step -------------------------------------------------------------------------------
    // ADDITIVE, the way a verification tree is worked: it follows its top-down tree (every gate and event of it,
    // with the tree's names and links), and it may be MORE detailed: an event developed further on the verification
    // side (a sensing loss that, as built, is an AND with a dormant standby), or a failure the real design adds (a
    // shuttle valve leak), is the verification tree's own and is never moved or asked about. Only what came from
    // the top-down tree and has left it (m._srcLids: the ids last taken from it) is asked about.
    // returns { changed, removed: [top-most verification events whose top-down twin was taken out] }
    function syncMirror(m) {
        var out = { changed: false, removed: [] };
        if (!_isMirror(m) || !m.root) return out;
        var src = _pages().find(function (p) { return p && p.id === m.verifies; });
        if (!src || !src.root) return out;
        // the tree's own fields follow (level, system, failure condition, target, mission profile)
        try { if (typeof root._syncMirrorOwnershipFromSource === 'function') root._syncMirrorOwnershipFromSource(src); } catch (_) {}
        var expected = (m._nameFrom != null ? m._nameFrom : '') + ' (Verification)';
        if (m.name === expected && src.name && m._nameFrom !== src.name) { m.name = src.name + ' (Verification)'; m._nameFrom = src.name; out.changed = true; }
        var fp = structFp(src.root);
        if (fp === m._syncFp && !(m._pendingRemoved && m._pendingRemoved.length)) return out;
        var kept = {}; (m._keptRemoved || []).forEach(function (l) { kept[String(l)] = 1; });
        var prev = {}; (m._srcLids || []).forEach(function (l) { prev[String(l)] = 1; });
        // a verification tree that was here before this sync existed (no m._srcLids) was built, and maybe reviewed,
        // against its tree as it stands: what of the tree it already has is matched (and takes the tree's ids); what
        // it does not have was the engineer's choice and is not added now. From here on, what the tree gains flows in.
        var baseline = !Array.isArray(m._srcLids);
        // the verification tree, indexed: each event's parent, and its events by id (FMES modes have no twin)
        var parent = new Map(), byLid = {};
        (function idx(n, p) { if (!n) return; parent.set(n, p); if (p && !n._fmesMode) (byLid[_lid(n)] = byLid[_lid(n)] || []).push(n); _kids(n).forEach(function (c) { idx(c, n); }); })(m.root, null);
        var srcLids = {}; (function idx(n) { if (!n) return; srcLids[_lid(n)] = 1; _kids(n).forEach(idx); })(src.root);
        var used = new Set([m.root]), rekeyed = {};
        function within(n, anc) { var x = n; while (x) { if (x === anc) return true; x = parent.get(x); } return false; }
        function subtreeList(t) { var o = []; (function w(n) { _kids(n).forEach(function (c) { o.push(c); w(c); }); })(t); return o; }
        // its twin: by id (in the parent's twin first); for a verification tree made before ids were kept, the event
        // of the same kind and name (or display id) under the parent's twin, which then takes the twin's id
        function find(S, TP) {
            var l = (byLid[_lid(S)] || []).filter(function (x) { return !used.has(x); });
            var inP = l.filter(function (x) { return within(x, TP); });
            if (inP.length) return inP[0];
            if (l.length) return l[0];
            var gate = S.type === 'gate';
            var c = subtreeList(TP).filter(function (x) { return x && !x._fmesMode && !used.has(x) && !srcLids[_lid(x)] && !prev[_lid(x)] && (x.type === 'gate') === gate; });
            var hit = c.filter(function (x) { return S.name && x.name === S.name; })[0] || c.filter(function (x) { return S.displayId && x.displayId === S.displayId; })[0];
            if (!hit) return null;
            var was = _lid(hit); hit.logicalId = S.logicalId != null ? S.logicalId : S.id; rekeyed[was] = _lid(hit); out.changed = true;
            return hit;
        }
        var NAMES = { name: 1, desc: 1, description: 1 };
        function copyStruct(S, T) {
            STRUCT.forEach(function (k) {
                if (baseline && NAMES[k]) return;   // on the first sync the verification tree keeps its own wording
                if (S[k] === undefined) { if (T[k] !== undefined) { delete T[k]; out.changed = true; } }
                else if (JSON.stringify(T[k]) !== JSON.stringify(S[k])) { T[k] = (S[k] && typeof S[k] === 'object') ? JSON.parse(JSON.stringify(S[k])) : S[k]; out.changed = true; }
            });
        }
        function insertAfter(TP, T, after) {
            var k = _kids(TP).slice(); var i = after ? k.indexOf(after) : -1;
            if (i >= 0) k.splice(i + 1, 0, T); else k.push(T);
            _setKids(TP, k); parent.set(T, TP);
        }
        function place(S, T) {
            if (!_kids(S).length && T._fmesDecomposed) return;   // its FMES modes are verification-only
            var after = null;
            _kids(S).forEach(function (C) {
                var X = find(C, T);
                if (!X && baseline) return;
                if (!X) {   // new in the top-down tree: the app's own copy of it, its rate empty
                    var bare = {}; Object.keys(C).forEach(function (k) { if (k !== 'children' && k !== '_children') bare[k] = C[k]; });
                    X = root._cloneSubtreeForVerification(bare, true);
                    insertAfter(T, X, after && parent.get(after) === T ? after : null);
                    out.changed = true;
                } else if (!within(X, T)) {   // moved in the top-down tree: it moves with it, its rates with it
                    var op = parent.get(X); if (op) _setKids(op, _kids(op).filter(function (z) { return z !== X; }));
                    insertAfter(T, X, after && parent.get(after) === T ? after : null);
                    out.changed = true;
                }
                used.add(X);
                copyStruct(C, X);
                place(C, X);
                after = X;
            });
        }
        copyStruct(src.root, m.root);
        if (src.root.logicalId != null && m.root.logicalId !== src.root.logicalId) { rekeyed[_lid(m.root)] = String(src.root.logicalId); m.root.logicalId = src.root.logicalId; out.changed = true; }
        place(src.root, m.root);
        // what came from the top-down tree and has left it: asked about (top-most only), unless already decided
        var gone = [];
        (function w(n) {
            _kids(n).forEach(function (c) {
                if (!c || c._fmesMode) return;
                var l = _lid(c);
                if (prev[l] && !srcLids[l]) {
                    if (kept[l]) { if (!c._notInAllocation) { c._notInAllocation = true; out.changed = true; } }
                    else { gone.push(c); return; }   // its branch goes with it: not walked
                }
                w(c);
            });
        })(m.root);
        out.removed = gone; out.prev = prev;   // prev: every id that came from the top-down tree before this sync
        // the monitor specs written against a re-keyed verification event follow it
        if (Object.keys(rekeyed).length) {
            try {
                var pc = (typeof projectConfig !== 'undefined' && projectConfig) || {};
                (pc.monitorSpecs || []).forEach(function (sp) {
                    if (sp && sp.targetPageId === m.id && rekeyed[String(sp.targetLid)]) sp.targetLid = rekeyed[String(sp.targetLid)];
                    if (sp && sp.targetPageId === m.id && sp.monitorLid != null && rekeyed[String(sp.monitorLid)]) sp.monitorLid = rekeyed[String(sp.monitorLid)];
                });
            } catch (_) {}
            m._rekeyed = Object.assign(m._rekeyed || {}, rekeyed);
        }
        var pend = gone.map(_lid);
        m._srcLids = Object.keys(srcLids).concat(pend);
        m._pendingRemoved = pend.length ? pend : undefined;
        m._syncFp = fp;
        try { if (root.SLMirrorModes && typeof root.SLMirrorModes.syncMirrorIdentity === 'function') { if (root.SLMirrorModes.syncMirrorIdentity(m)) out.changed = true; } } catch (_) {}
        return out;
    }

    // ---- 3. asked, never assumed ---------------------------------------------------------------------------
    // the question is about the engineer's work: a branch, or a whole verification tree, that holds none (no rate,
    // no probability, no Markov model, no FMES group, nothing the verification side added) goes without asking, the
    // way an untouched MF&MS seed removes itself (idp_seed_trees.js) and takes its verification tree with it
    function holdsWork(n, srcSet) {
        var hit = false;
        (function w(x) {
            if (!x || hit) return;
            if (x.type !== 'gate' && ((x.lambda && x.lambda > 0) || (x.probability && x.probability > 0) || x.markovModelId || x._fmesGroup || x._fmesDecomposed)) hit = true;
            if (x._notInAllocation || (srcSet && !srcSet[_lid(x)])) hit = true;
            _kids(x).forEach(w);
        })(n);
        return hit;
    }
    var _asking = false;
    function _names(nodes) { return nodes.slice(0, 6).map(function (n) { return '"' + (n.name || n.displayId || _lid(n)) + '"'; }).join(', ') + (nodes.length > 6 ? ' and ' + (nodes.length - 6) + ' more' : ''); }
    async function _askRemoved(m, removed) {
        var src = _pages().find(function (p) { return p && p.id === m.verifies; });
        var word = _homeWord(src);
        var choose = root.slChoose;
        if (typeof choose !== 'function') return;
        var v = await choose(removed.length + ' part' + (removed.length === 1 ? ' was' : 's were') + ' taken out of the ' + word + ' tree "' + ((src && src.name) || m.verifies) + '": ' + _names(removed) +
            '. Remove ' + (removed.length === 1 ? 'it' : 'them') + ' from its verification tree too? The verification tree may already hold real failure rates for ' + (removed.length === 1 ? 'it' : 'them') + '.', [
            { value: 'remove', label: 'Remove from the verification tree', hint: 'The verification tree matches the ' + word + ' tree again.' },
            { value: 'keep', label: 'Keep in the verification tree', hint: 'They stay, marked as no longer in the ' + word + ' tree.' }], { title: 'Verification tree "' + (m.name || m.id) + '"', cancelText: 'Ask me later' });
        if (!v) return;   // asked again on the next change
        var lids = removed.map(_lid);
        if (v === 'remove') {
            _call('pushUndo', 'Remove from verification tree ' + (m.name || m.id));
            (function prune(n) { if (!n) return; var k = _kids(n); var f = k.filter(function (c) { return lids.indexOf(_lid(c)) < 0 || c._fmesMode; }); if (f.length !== k.length) _setKids(n, f); f.forEach(prune); })(m.root);
            m._srcLids = (m._srcLids || []).filter(function (l) { return lids.indexOf(String(l)) < 0; });
            _toast('Removed ' + removed.length + ' part' + (removed.length === 1 ? '' : 's') + ' from "' + (m.name || m.id) + '".', 'success');
        } else {
            m._keptRemoved = (m._keptRemoved || []).concat(lids);
            removed.forEach(function (n) { n._notInAllocation = true; });
            m._srcLids = (m._srcLids || []).filter(function (l) { return lids.indexOf(String(l)) < 0; });
            _toast('Kept in "' + (m.name || m.id) + '", marked as no longer in the ' + word + ' tree.', 'info');
        }
        m._pendingRemoved = undefined; m._syncFp = '';
        _after();
    }
    async function _askOrphan(m) {
        var choose = root.slChoose; if (typeof choose !== 'function') return;
        var gone = !_pages().some(function (p) { return p && p.id === m.verifies; });
        var v = await choose('The verification tree "' + (m.name || m.id) + '" checks a ' + (gone ? 'fault tree that has been deleted' : 'tree that is no longer worked top-down') + ', so there is nothing left for it to verify. Delete it, or keep it as a standalone bottom-up tree?', [
            { value: 'delete', label: 'Delete the verification tree' },
            { value: 'keep', label: 'Keep it in Standalone', hint: 'A bottom-up tree of its own, with its failure rates.' }], { title: 'Verification tree with nothing to verify', cancelText: 'Ask me later' });
        if (!v) return;
        if (v === 'delete') { _call('pushUndo', 'Delete verification tree ' + (m.name || m.id)); _remove([m.id]); _toast('Deleted "' + (m.name || m.id) + '".', 'success'); }
        else { _toStandalone(m); _toast('"' + (m.name || m.id) + '" is a standalone bottom-up tree now.', 'info'); }
        _after();
    }
    function _toStandalone(m) {
        m.formerlyVerified = { pageId: m.verifies, at: new Date().toISOString() };
        delete m.verifies; m.mode = 'bottom-up'; m.treeLevel = 'standalone'; m.systemId = '';
    }
    function _remove(ids) {
        var act = (function () { try { return activeFTAPageId; } catch (_) { return null; } })();
        _setPages(_pages().filter(function (p) { return ids.indexOf(p.id) < 0; }));
        if (ids.indexOf(act) >= 0) { try { activeFTAPageId = null; } catch (_) {} }
    }
    function _after() {
        _call('scheduleAutosave');
        _call('calculateAllProbabilities');
        try { if (root.SL_FTA_PICKER) root.SL_FTA_PICKER.render(true); } catch (_) {}
        _call('renderFTASidebar'); _call('updateD3');
    }

    // deleting a tree: its verification tree is asked about (Waqas: "we should prompt the user if they want to
    // remove the verification tree too"); a verification tree is not deleted on its own (it is remade at once)
    async function deleteTree(pageId) {
        var page = _pages().find(function (p) { return p && p.id === pageId; }); if (!page) return false;
        if (_isMirror(page) && _pages().some(function (p) { return p && p.id === page.verifies && _topDown(p); })) {
            _toast('"' + (page.name || page.id) + '" is the verification tree of a ' + _homeWord(_pages().find(function (p) { return p.id === page.verifies; })) + ' tree. Delete that tree to delete this one.', 'info', 6000);
            return false;
        }
        var ok = await (typeof root.slConfirm === 'function' ? root.slConfirm('Delete the fault tree "' + (page.name || page.id) + '"? Undo brings it back.', { danger: true, okText: 'Delete', title: 'Delete fault tree' }) : Promise.resolve(true));
        if (!ok) return false;
        var mirror = _topDown(page) ? _pages().find(function (p) { return p && p.verifies === page.id; }) : null;
        var alsoMirror = false;
        if (mirror) {
            var v = await root.slChoose('"' + (page.name || page.id) + '" has a verification tree, "' + (mirror.name || mirror.id) + '". With the tree gone there is nothing for it to verify. Delete it too?', [
                { value: 'delete', label: 'Delete the verification tree too' },
                { value: 'keep', label: 'Keep it in Standalone', hint: 'A bottom-up tree of its own, with its failure rates.' }], { title: 'Its verification tree' });
            if (!v) return false;
            alsoMirror = v === 'delete';
        }
        _call('pushUndo', 'Delete fault tree ' + (page.name || page.id));
        _remove(alsoMirror ? [page.id, mirror.id] : [page.id]);
        if (mirror && !alsoMirror) _toStandalone(mirror);
        _call('syncFtaConfigFromActivePage');
        _after();
        _toast('Deleted "' + (page.name || page.id) + '"' + (mirror ? (alsoMirror ? ' and its verification tree.' : '; its verification tree is in Standalone now.') : '.'), 'success');
        return true;
    }

    // ---- the sweep ---------------------------------------------------------------------------------------
    var _seenGen = -1, _first = true;
    function sweep(opts) {
        opts = opts || {};
        if (root.SL_VERIFY_SYNC_OFF) return { off: true };
        var made = 0, changed = 0, orphans = [], removedAsk = [], quietGone = [];
        _pages().slice().forEach(function (p) { if (_topDown(p) && p.root && !_pages().some(function (x) { return x && x.verifies === p.id; })) { if (ensureMirror(p)) made++; } });
        _pages().forEach(function (m) {
            if (!_isMirror(m)) return;
            var src = _pages().find(function (p) { return p && p.id === m.verifies; });
            if (!src || !_topDown(src)) {
                var mine = {}; (m._srcLids || []).forEach(function (l) { mine[String(l)] = 1; });
                if (m.autoVerification && !holdsWork(m.root, mine)) { quietGone.push(m.id); return; }
                orphans.push(m); return;
            }
            var r = syncMirror(m);
            if (r.changed) changed++;
            if (r.removed.length) {
                var work = r.removed.filter(function (n) { return holdsWork(n, r.prev || {}); });
                var idle = r.removed.filter(function (n) { return work.indexOf(n) < 0; }).map(_lid);
                if (idle.length) {
                    (function prune(n) { var k = _kids(n); var f = k.filter(function (c) { return idle.indexOf(_lid(c)) < 0 || c._fmesMode; }); if (f.length !== k.length) _setKids(n, f); f.forEach(prune); })(m.root);
                    m._srcLids = (m._srcLids || []).filter(function (l) { return idle.indexOf(String(l)) < 0; });
                    m._pendingRemoved = work.length ? work.map(_lid) : undefined;
                    changed++;
                }
                if (work.length) removedAsk.push({ m: m, removed: work });
            }
        });
        if (quietGone.length) { _remove(quietGone); changed++; }
        if (made || changed) {
            _after();
            if (made && !opts.quiet) _toast(made === 1 ? 'Made 1 verification tree, for a top-down tree that had none.' : 'Made ' + made + ' verification trees, one for each top-down tree that had none.', 'info', 6000);
        }
        if (!opts.noAsk && !_asking && (removedAsk.length || orphans.length)) {
            _asking = true;
            (async function () {
                try {
                    for (var i = 0; i < orphans.length; i++) await _askOrphan(orphans[i]);
                    for (var j = 0; j < removedAsk.length; j++) await _askRemoved(removedAsk[j].m, removedAsk[j].removed);
                } finally { _asking = false; }
            })();
        }
        return { made: made, changed: changed, gone: quietGone, orphans: orphans.map(function (m) { return m.id; }), removed: removedAsk.map(function (x) { return { mirror: x.m.id, lids: x.removed.map(_lid) }; }) };
    }
    function tick() {
        var dc = root.SLDataChange;
        if (dc && !_first && dc.gen() === _seenGen) return { skipped: true };
        if (!_pages().length && _first) return { skipped: true };   // no project yet
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
        root.addEventListener('load', function () { setTimeout(function () { try { tick(); } catch (_) {} }, 2000); setInterval(function () { try { tick(); } catch (_) {} }, 2500); });
    }

    var api = { VERSION: VERSION, STRUCT: STRUCT, VALUE: VALUE, sweep: sweep, tick: tick, syncMirror: syncMirror, ensureMirror: ensureMirror, deleteTree: deleteTree, structFp: structFp, _toStandalone: _toStandalone };
    try { root.SLVerifySync = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

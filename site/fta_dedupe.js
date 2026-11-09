// ============================================================================
// fta_dedupe.js, v1.0, 8 Nov 2026: one fault tree per failure condition, cleaned up when a project opens.
//
// Live student data, 8 to 9 Nov 2026: a collaborator's screen built the auto tree pages from their shells before
// their nodes arrived (crdt_sync.js _ftaRecompose, root null), the sweep (fc_auto_trees.js before v1.8) did not see
// them as trees and made 11 more in one millisecond, each id given a time suffix (fc-auto-ac-FC-01-mw88sosh). The
// sweep can no longer do that (fc_auto_trees.js v1.8, "ONE TREE"); this module cleans up the copies already saved.
// Built as its own module so the rules below are easy to adjust (Waqas was asked to OK the approach).
//
// When: once per project load, after the data is applied and before the first sweep (it wraps _applyProjectData);
// a condition whose pages are still waiting for their nodes is left for later (pending(); the sweep's tick calls
// run() again). Idempotent: a second run finds nothing to do.
//
// Rule. Auto trees (page.autoFcTree) are grouped by failure condition: scope + system + key. The ORIGINAL is the page
// with the condition's own id (fc-auto-<ac|system>-<FC ID>), else the oldest autoFcTree.at. Each other page is a COPY:
//   1. nothing the original lacks (every node has an equivalent in the original: same externalSource target, or
//      same type and name for an unlinked node; no value the original lacks; the empty "Decompose: causes of" step
//      the app makes counts as nothing): moved out of ftaPages into projectConfig.retiredDuplicateTrees[]
//      { page, duplicateOf, reason, at } and journaled. Never deleted: restore(copyId) puts it back.
//   2. events the original lacks, each a plain event under the copy's top gate, and the original's top gate is an
//      OR gate: those events are added under the original's top gate (fresh ids, mergedFrom: <copy id>), then the
//      copy is retired as in 1.
//   3. anything else (a structure of its own, a value that disagrees with the original or that the original does not
//      have): the copy stays, flagged duplicateOf + dupReview { reason, at }. The tree picker says "Duplicate of
//      <name>: holds work the original lacks, review and merge" and offers Merge into original / Keep as its own
//      tree. Until then the sweep and the allocation inputs leave it out (fc_auto_trees.js).
//   Values that count as work: a prescribed gate target, a weight, a failure rate, and on a bottom-up (verification)
//   tree a probability. On an allocation (top-down) tree the probabilities are the allocated budgets the engine
//   writes, so they are not work and never block a cleanup.
// Everything that pointed at a retired copy points at the original: the open tree (activeFTAPageId), a verification
// tree (p.verifies; when the original already has one, the copy's verification tree is cleaned up against it by the
// same rule), transfer gates (linkedPageId, transferOutTo), and page ids held in requirements and project settings.
//
// API (window.SLFtaDedupe): run(opts), pending(), classify(copy, original), restore(copyId), mergeIntoOriginal(copyId),
// keepSeparate(copyId), label(page), decorate(host, activeId). Kill switch: window.SL_FTA_DEDUPE_OFF = true.
// Load: after fc_auto_trees.js. Tests: tests/regression_duplicate_trees_20261108.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.0';

    function _g(n) {
        try { var E = root.SLEnv; if (E && typeof E.get === 'function') { var v = E.get(n); if (v !== undefined) return v; } } catch (_) {}
        try { return root[n]; } catch (_) { return undefined; }
    }
    function _pages() { var p = _g('ftaPages'); return Array.isArray(p) ? p : []; }
    function _pc() { var c = _g('projectConfig'); return (c && typeof c === 'object') ? c : null; }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _nid() { try { return internalIdCounter++; } catch (_) { return Date.now() + Math.floor(Math.random() * 100000); } }
    function _jr(kind, msg) { try { if (typeof root.jrnl === 'function') root.jrnl(kind, msg); } catch (_) {} }
    function _call(name) { var f = root[name]; if (typeof f !== 'function') f = _g(name); if (typeof f !== 'function') return; try { return f.apply(root, Array.prototype.slice.call(arguments, 1)); } catch (_) {} }
    function _now() { return new Date().toISOString(); }
    function _clone(x) { return JSON.parse(JSON.stringify(x)); }
    function _shapeFp(n) { var T = root.SLFcTrees; return (T && typeof T.shapeFp === 'function') ? T.shapeFp(n) : null; }

    // ---- identity --------------------------------------------------------------------------------------------
    function identity(p) {
        var a = p && p.autoFcTree; if (!a || !a.key) return null;
        return (a.scope === 'ac' ? 'ac' : 'sys:' + a.systemId) + '|' + a.key;
    }
    function _baseId(p) {
        var a = p.autoFcTree;
        return 'fc-auto-' + (a.scope === 'ac' ? 'ac' : a.systemId) + '-' + String(a.key).replace(/^(fc|row):/, '').trim().replace(/[^A-Za-z0-9_-]+/g, '_');
    }
    function _original(list) {
        var bid = _baseId(list[0]);
        var hit = list.find(function (p) { return p.id === bid; });
        if (hit) return hit;
        var best = list[0];
        list.forEach(function (p) { var a = String((p.autoFcTree && p.autoFcTree.at) || '9'), b = String((best.autoFcTree && best.autoFcTree.at) || '9'); if (a < b) best = p; });
        return best;
    }

    // ---- what a copy holds -------------------------------------------------------------------------------------
    function _norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
    function _key(n) {
        if (n.externalSource && n.externalSource.targetId != null) return 'x:' + (n.externalSource.kind || '') + ':' + String(n.externalSource.targetId);
        return 'n:' + (n.type || '') + ':' + _norm(n.name);
    }
    function _num(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
    // the values a person sets (see the header): probabilities only on a bottom-up tree
    function _work(n, page) {
        var v = {};
        if (n.prescribedRate && _num(n.prescribedProb)) v.prescribedProb = n.prescribedProb;
        if (_num(n.weight)) v.weight = n.weight;
        if (_num(n.lambda)) v.lambda = n.lambda;
        if ((page.mode || 'top-down') !== 'top-down' && _num(n.probability)) v.probability = n.probability;
        return v;
    }
    function _isStub(n, page) {
        return n.type === 'undeveloped' && !_kids(n).length && /^Decompose: causes of /.test(n.name || '') && !Object.keys(_work(n, page)).length;
    }
    function _same(a, b) { return Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b)); }
    // { kind: 'nothing' | 'merge' | 'review', extras: [nodes to add], reason }
    function classify(copy, orig) {
        var om = {};
        (function w(n, top) { if (!n) return; if (!top) { var k = _key(n); (om[k] = om[k] || []).push(n); } _kids(n).forEach(function (c) { w(c, false); }); })(orig.root, true);
        var extras = [], why = null;
        var cr = copy.root, or = orig.root;
        if (!cr) return { kind: 'nothing', extras: [], reason: 'the copy is empty' };
        (function w(n, parent) {
            if (!n || why) return;
            if (parent) {
                if (_isStub(n, copy)) return;
                var eq = (om[_key(n)] || [])[0];
                var cv = _work(n, copy);
                if (eq) {
                    var ov = _work(eq, orig);
                    Object.keys(cv).forEach(function (k) {
                        if (why) return;
                        if (ov[k] === undefined) why = '"' + (n.name || n.displayId || n.id) + '" has a ' + k + ' the original does not have';
                        else if (!_same(cv[k], ov[k])) why = '"' + (n.name || n.displayId || n.id) + '" has a different ' + k + ' from the original';
                    });
                } else {
                    var plain = !_kids(n).length && n.type !== 'gate' && n.type !== 'transfer' && !n.linkedPageId;
                    if (!plain) why = '"' + (n.name || n.displayId || n.id) + '" is a branch of its own';
                    else if (parent !== cr) why = '"' + (n.name || n.displayId || n.id) + '" sits under a gate of its own';
                    else extras.push(n);
                    if (!plain || parent !== cr) return;
                }
            }
            _kids(n).forEach(function (c) { w(c, n); });
        })(cr, null);
        var meaningful = _kids(cr).some(function (c) { return !_isStub(c, copy); });
        if (!why && meaningful && cr.type === 'gate' && or && or.type === 'gate' && (cr.gateType || 'OR') !== (or.gateType || 'OR')) why = 'its top gate is ' + (cr.gateType || 'OR') + ', the original\'s is ' + (or.gateType || 'OR');
        if (!why && cr.prescribedRate && _num(cr.prescribedProb) && !(or && or.prescribedRate && _same(cr.prescribedProb, or.prescribedProb || 0))) why = 'its top gate has a prescribed target the original does not have';
        if (!why && extras.length && !(or && or.type === 'gate' && (or.gateType || 'OR') === 'OR')) why = 'the original\'s top gate is not an OR gate, so its events cannot simply be added';
        if (why) return { kind: 'review', extras: [], reason: why };
        if (extras.length) return { kind: 'merge', extras: extras, reason: extras.length + ' event' + (extras.length === 1 ? '' : 's') + ' the original lacks' };
        var untouched = copy.autoFcTree && copy.autoFcTree.fp != null && _shapeFp(cr) === copy.autoFcTree.fp;
        return { kind: 'nothing', extras: [], reason: untouched ? 'an untouched copy the app made' : 'nothing the original lacks' };
    }

    // ---- acting on a copy --------------------------------------------------------------------------------------
    function _fresh(n, from) {
        var c = _clone(n);
        (function w(x) { var id = _nid(); x.mergedFromNode = x.logicalId != null ? x.logicalId : x.id; x.id = id; x.logicalId = id; if (x.displayId) x.displayId = String(x.displayId).replace(/\d+$/, String(id)); _kids(x).forEach(w); })(c);
        c.mergedFrom = from;
        return c;
    }
    function _graft(orig, nodes, copyId) {
        orig.root.children = orig.root.children || [];
        nodes.forEach(function (n) { orig.root.children.push(_fresh(n, copyId)); });
    }
    function _remove(page) { var pages = _pages(), i = pages.indexOf(page); if (i >= 0) pages.splice(i, 1); }
    function _retire(copy, orig, reason) {
        var pc = _pc(); if (!pc) return false;
        pc.retiredDuplicateTrees = pc.retiredDuplicateTrees || [];
        pc.retiredDuplicateTrees.push({ page: _clone(copy), duplicateOf: orig.id, reason: reason, at: _now() });
        _remove(copy);
        _jr('tree-duplicate-retired', (copy.name || copy.id) + ' (' + copy.id + ') was a copy of ' + (orig.name || orig.id) + ': ' + reason + '. Kept in the project\'s retired copies, nothing deleted.');
        _repoint(copy.id, orig.id);
        return true;
    }
    function _flag(copy, orig, reason) {
        if (copy.duplicateOf === orig.id && copy.dupReview) return false;
        copy.duplicateOf = orig.id;
        copy.dupReview = { reason: reason, at: _now() };
        _jr('tree-duplicate-review', (copy.name || copy.id) + ' (' + copy.id + ') is a copy of ' + (orig.name || orig.id) + ' that holds work the original lacks (' + reason + '). Left for review.');
        return true;
    }
    // one copy against its original; returns what was done
    function _settle(copy, orig, out) {
        var c = classify(copy, orig);
        if (c.kind === 'review') { if (_flag(copy, orig, c.reason)) out.review.push(copy.id); return; }
        if (c.kind === 'merge') { _graft(orig, c.extras, copy.id); out.merged.push({ copy: copy.id, into: orig.id, events: c.extras.length }); }
        if (_retire(copy, orig, c.kind === 'merge' ? 'its ' + c.reason + ' were added to the original' : c.reason)) out.retired.push(copy.id);
    }
    // everything that named the copy names the original
    var PAGE_KEY = /(^|[a-z_])(pageId|PageId|treeId|TreeId)$/;
    function _repoint(from, to) {
        var pages = _pages();
        try { if (typeof activeFTAPageId !== 'undefined' && String(activeFTAPageId) === String(from)) activeFTAPageId = to; } catch (_) {}
        try { if (root.activeFTAPageId !== undefined && String(root.activeFTAPageId) === String(from)) root.activeFTAPageId = to; } catch (_) {}
        // verification trees
        pages.filter(function (p) { return p && String(p.verifies) === String(from); }).forEach(function (v) {
            var ov = pages.find(function (p) { return p && p !== v && String(p.verifies) === String(to); });
            if (!ov) { v.verifies = to; return; }
            if (!v.root || !ov.root) { v.verifies = to; v.duplicateOf = ov.id; v.dupReview = { reason: 'the verification tree of a retired copy, its nodes had not arrived', at: _now() }; return; }
            _settle(v, ov, { retired: [], merged: [], review: [] });
        });
        // transfer gates
        pages.forEach(function (p) { (function w(n) { if (!n) return; if (String(n.linkedPageId || '') === String(from)) n.linkedPageId = to; if (String(n.transferOutTo || '') === String(from)) n.transferOutTo = to; _kids(n).forEach(w); })(p && p.root); });
        // page ids held in requirements and settings
        var seen = new Set();
        function walk(o, depth) {
            if (!o || typeof o !== 'object' || depth > 8 || seen.has(o)) return; seen.add(o);
            if (Array.isArray(o)) { o.forEach(function (x) { walk(x, depth + 1); }); return; }
            Object.keys(o).forEach(function (k) {
                if (k === 'retiredDuplicateTrees') return;
                var v = o[k];
                if (typeof v === 'string' && PAGE_KEY.test(k) && v === String(from)) o[k] = to;
                else if (v && typeof v === 'object') walk(v, depth + 1);
            });
        }
        walk(_g('acReqData'), 0);
        (_g('systemsData') || []).forEach(function (s) { walk(s && s.req, 0); });
        walk(_pc(), 0);
    }

    // ---- the run -----------------------------------------------------------------------------------------------
    var _pendingN = 0;
    function run(opts) {
        opts = opts || {};
        var out = { groups: 0, retired: [], merged: [], review: [], pending: 0 };
        if (root.SL_FTA_DEDUPE_OFF) { out.off = true; return out; }
        var by = {}, order = [];
        _pages().forEach(function (p) {
            if (!p || p.verifies || p.duplicateOf || !p.autoFcTree) return;
            var k = identity(p); if (!k) return;
            if (!by[k]) { by[k] = []; order.push(k); }
            by[k].push(p);
        });
        order.forEach(function (k) {
            var list = by[k]; if (list.length < 2) return;
            out.groups++;
            if (list.some(function (p) { return !p.root; })) { out.pending++; return; }   // nodes still arriving: later
            var orig = _original(list);
            list.forEach(function (copy) { if (copy !== orig) _settle(copy, orig, out); });
        });
        _pendingN = out.pending;
        if (out.retired.length || out.review.length || out.merged.length) {
            _call('scheduleAutosave');
            try { if (root.SL_FTA_PICKER) root.SL_FTA_PICKER.render(true); } catch (_) {}
            if (!opts.quiet) {
                var parts = [];
                if (out.retired.length) parts.push(out.retired.length + ' duplicate fault tree' + (out.retired.length === 1 ? '' : 's') + ' tidied away (kept in the project, nothing deleted)');
                if (out.review.length) parts.push(out.review.length + ' left for you to review');
                _call('showToast', parts.join('; ') + '.', 'info', 7000);
            }
        }
        return out;
    }
    function pending() { return _pendingN > 0; }

    // ---- the person's choices ------------------------------------------------------------------------------------
    function _byId(id) { return _pages().find(function (p) { return p && String(p.id) === String(id); }) || null; }
    // a copy under review: everything it holds that the original lacks goes under the original's top gate (values
    // that disagree keep the original's), then the copy is retired
    function mergeIntoOriginal(copyId) {
        var copy = _byId(copyId), orig = copy && _byId(copy.duplicateOf);
        if (!copy || !orig || !copy.root || !orig.root) return { ok: false };
        var om = {};
        (function w(n, top) { if (!n) return; if (!top) om[_key(n)] = 1; _kids(n).forEach(function (c) { w(c, false); }); })(orig.root, true);
        var add = _kids(copy.root).filter(function (c) { return !_isStub(c, copy) && !om[_key(c)]; });
        _graft(orig, add, copy.id);
        _retire(copy, orig, 'merged into the original by hand (' + add.length + ' branch' + (add.length === 1 ? '' : 'es') + ' added; where values disagreed the original\'s were kept)');
        _call('scheduleAutosave');
        try { if (root.SL_FTA_PICKER) root.SL_FTA_PICKER.render(true); } catch (_) {}
        return { ok: true, added: add.length };
    }
    function _unAuto(p) {
        delete p.duplicateOf; delete p.dupReview;
        if (p.autoFcTree) { p.autoFcTreeWas = p.autoFcTree; delete p.autoFcTree; }
        p.dupKept = { at: _now() };
    }
    function keepSeparate(copyId) {
        var copy = _byId(copyId); if (!copy) return { ok: false };
        var of = copy.duplicateOf;
        _unAuto(copy);
        _jr('tree-duplicate-kept', (copy.name || copy.id) + ' kept as its own tree (it was flagged as a copy of ' + of + ').');
        _call('scheduleAutosave');
        try { if (root.SL_FTA_PICKER) root.SL_FTA_PICKER.render(true); } catch (_) {}
        return { ok: true };
    }
    // a retired copy back in the project as its own tree; events merged from it leave the original
    function restore(copyId) {
        var pc = _pc(), list = (pc && pc.retiredDuplicateTrees) || [];
        var i = -1; for (var j = list.length - 1; j >= 0; j--) { if (list[j] && list[j].page && String(list[j].page.id) === String(copyId)) { i = j; break; } }
        if (i < 0) return { ok: false };
        var rec = list.splice(i, 1)[0], page = rec.page, orig = _byId(rec.duplicateOf);
        if (orig && orig.root) (function w(n) { if (!n) return; if (n.children) n.children = n.children.filter(function (c) { return c.mergedFrom !== page.id; }); _kids(n).forEach(w); })(orig.root);
        _unAuto(page);
        if (!_byId(page.id)) _pages().push(page);
        _jr('tree-duplicate-restored', (page.name || page.id) + ' restored as its own tree.');
        _call('scheduleAutosave');
        return { ok: true, page: page };
    }

    // ---- what the tree picker shows ------------------------------------------------------------------------------
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function label(p) {
        if (!p || !p.dupReview) return '';
        var o = _byId(p.duplicateOf);
        return ' (Duplicate of ' + ((o && o.name) || p.duplicateOf) + ': holds work the original lacks, review and merge)';
    }
    function decorate(host, activeId) {
        if (typeof document === 'undefined' || !host) return;
        var bar = document.getElementById('fta-dup-review');
        var p = _byId(activeId);
        if (!p || !p.dupReview) { if (bar) bar.remove(); return; }
        if (!bar) { bar = document.createElement('div'); bar.id = 'fta-dup-review'; bar.setAttribute('role', 'status'); host.appendChild(bar); }
        bar.style.cssText = 'flex-basis:100%; margin-top:6px; padding:8px 12px; border:1px solid var(--color-warning, #b45309); background:var(--color-surface-2); font-size:12px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;';
        bar.innerHTML = '<span><b>' + _esc(label(p).replace(/^ \(|\)$/g, '')) + '.</b> ' + _esc(p.dupReview.reason) + '.</span>' +
            '<button type="button" class="ckpt-m-btn" data-act="merge">Merge into original</button>' +
            '<button type="button" class="ckpt-m-btn" data-act="keep">Keep as its own tree</button>';
        bar.querySelector('[data-act="merge"]').onclick = function () { var r = mergeIntoOriginal(p.id); if (r.ok) { _call('openFTAPageById', p.duplicateOf); _call('showToast', 'Merged into the original tree.', 'success', 4000); } };
        bar.querySelector('[data-act="keep"]').onclick = function () { keepSeparate(p.id); _call('showToast', 'Kept as its own tree.', 'success', 4000); decorate(host, activeId); };
    }

    // ---- once per project load, after the data is applied ---------------------------------------------------------
    function _wrapLoad() {
        var f = root._applyProjectData;
        if (typeof f !== 'function' || f._ddWrapped) return !!(f && f._ddWrapped);
        var wrapped = function () {
            var r = f.apply(this, arguments);
            try { run(); } catch (e) { try { console.warn('[fta_dedupe]', e); } catch (_) {} }
            return r;
        };
        wrapped._ddWrapped = true;
        Object.keys(f).forEach(function (k) { try { if (!(k in wrapped)) wrapped[k] = f[k]; } catch (_) {} });
        root._applyProjectData = wrapped;
        return true;
    }
    if (!_wrapLoad() && typeof root.addEventListener === 'function') root.addEventListener('DOMContentLoaded', _wrapLoad);

    var api = { VERSION: VERSION, run: run, pending: pending, classify: classify, identity: identity, restore: restore,
        mergeIntoOriginal: mergeIntoOriginal, keepSeparate: keepSeparate, label: label, decorate: decorate, _repoint: _repoint };
    try { root.SLFtaDedupe = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

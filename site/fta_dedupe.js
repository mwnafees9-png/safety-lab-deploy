// ============================================================================
// fta_dedupe.js, v1.2, 8 Nov 2026: one fault tree per failure condition, cleaned up when a project opens.
// v1.1, 11 Nov 2026 (live team data): it never took effect on a shared cloud project. It now runs after every way a
// project arrives (load_repair.js: a file, open from the cloud, the live shared copy pulled in, a teammate's change),
// and is safe to run twice and on two screens at once: a copy already in the retired list is not listed again, and an
// event merged into the original keeps the id it had in the copy, so two screens that merge the same copy write the
// same node and the live shared copy holds it once.
// v1.2, 11 Nov 2026 (live team data): three copies stayed "for review" over a difference that was not one. A weight is
// a percent share among the inputs of ONE gate, and the tool keeps the shares adding up to 100, so the same event
// under a gate with 3 inputs and under one with 12 always has a different number. Weights are now compared as a
// SPLIT among the events both trees hold (and a weight a person locked still counts); a copy already left for review
// is looked at again on every run, so those three are tidied away on the next open. A pair that really does hold
// work on both sides is now said on BOTH pages and in the tree list, with a warning when the second version is opened.
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
    var VERSION = '1.2';

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
        if (n.weightLocked && _num(n.weight)) v.lockedWeight = 1;   // the number itself is a share: see _splitDiffers
        if (_num(n.lambda)) v.lambda = n.lambda;
        if ((page.mode || 'top-down') !== 'top-down' && _num(n.probability)) v.probability = n.probability;
        return v;
    }
    function _isStub(n, page) {
        return n.type === 'undeveloped' && !_kids(n).length && /^Decompose: causes of /.test(n.name || '') && !Object.keys(_work(n, page)).length;
    }
    function _same(a, b) { return Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b)); }
    // Weights as a split. pairs: [{ c: copy node, o: its match in the original }] for the inputs of one gate of the copy.
    // Each side's weights are scaled to add up to 1 over these same events (no weights at all on a side = an even
    // split, which is what the tool hands out). Returns the name of the first event whose share differs, or null.
    function _splitDiffers(pairs) {
        if (pairs.length < 2) return null;
        var side = function (k) {
            var w = pairs.map(function (x) { return _num(x[k].weight) ? x[k].weight : 0; });
            var sum = w.reduce(function (a, b) { return a + b; }, 0);
            if (!(sum > 0)) return pairs.map(function () { return 1 / pairs.length; });
            return w.map(function (x) { return x / sum; });
        };
        var cs = side('c'), os = side('o');
        for (var i = 0; i < pairs.length; i++) if (Math.abs(cs[i] - os[i]) > 1e-4) return pairs[i].c.name || pairs[i].c.displayId || pairs[i].c.id;
        return null;
    }
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
            // how this gate splits its budget among the inputs the original holds too
            if (!why) {
                var pairs = [];
                _kids(n).forEach(function (c) { if (_isStub(c, copy)) return; var m = (om[_key(c)] || [])[0]; if (m) pairs.push({ c: c, o: m }); });
                var diff = _splitDiffers(pairs);
                if (diff) why = 'it splits the budget among its inputs differently from the original (at "' + diff + '")';
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
    // An event merged into the original keeps the id it had in the copy (the copy is retired, so nothing else holds
    // it): two screens merging the same copy then write the same node, and the live shared copy holds it once. Only
    // an id the original already uses is replaced with a new one.
    function _fresh(n, from, taken) {
        var c = _clone(n);
        (function w(x) {
            x.mergedFromNode = x.logicalId != null ? x.logicalId : x.id;
            if (x.id == null || taken[String(x.id)]) { var id = _nid(); x.id = id; x.logicalId = id; if (x.displayId) x.displayId = String(x.displayId).replace(/\d+$/, String(id)); }
            taken[String(x.id)] = 1;
            _kids(x).forEach(w);
        })(c);
        c.mergedFrom = from;
        return c;
    }
    function _graft(orig, nodes, copyId) {
        orig.root.children = orig.root.children || [];
        var taken = {};
        (function w(x) { if (!x) return; if (x.id != null) taken[String(x.id)] = 1; _kids(x).forEach(w); })(orig.root);
        nodes.forEach(function (n) {
            // already merged from this copy (another screen did it, or this ran before): nothing to add
            if (orig.root.children.some(function (c) { return c && c.mergedFrom === copyId && String(c.mergedFromNode) === String(n.logicalId != null ? n.logicalId : n.id); })) return;
            orig.root.children.push(_fresh(n, copyId, taken));
        });
    }
    function _remove(page) { var pages = _pages(), i = pages.indexOf(page); if (i >= 0) pages.splice(i, 1); }
    function _retire(copy, orig, reason) {
        var pc = _pc(); if (!pc) return false;
        pc.retiredDuplicateTrees = pc.retiredDuplicateTrees || [];
        // a copy that came back (the live shared copy still held it) is listed once
        var listed = pc.retiredDuplicateTrees.some(function (r) { return r && r.page && String(r.page.id) === String(copy.id); });
        if (!listed) pc.retiredDuplicateTrees.push({ page: _clone(copy), duplicateOf: orig.id, reason: reason, at: _now() });
        _remove(copy);
        if (!listed) _jr('tree-duplicate-retired', (copy.name || copy.id) + ' (' + copy.id + ') was a copy of ' + (orig.name || orig.id) + ': ' + reason + '. Kept in the project\'s retired copies, nothing deleted.');
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
        // a copy left for review earlier is looked at again: a rule that has since been corrected, or work that has
        // since been brought into the original, lets it go; one a person chose to keep (dupKept) is never touched
        _pages().slice().forEach(function (copy) {
            if (!copy || !copy.duplicateOf || !copy.dupReview || !copy.autoFcTree || copy.verifies) return;
            var orig = _byId(copy.duplicateOf);
            if (!orig || !orig.root || !copy.root) return;
            var c = classify(copy, orig);
            if (c.kind === 'review') { if (copy.dupReview.reason !== c.reason) copy.dupReview.reason = c.reason; return; }
            delete copy.duplicateOf; delete copy.dupReview;
            _settle(copy, orig, out);
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

    var _warned = null;   // the second version last warned about (one warning per opening)
    // ---- what the tree picker shows ------------------------------------------------------------------------------
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _copiesOf(p) { return _pages().filter(function (c) { return c && c.dupReview && String(c.duplicateOf) === String(p.id); }); }
    function label(p) {
        if (!p) return '';
        if (p.dupReview) {
            var o = _byId(p.duplicateOf);
            return ' (Second version of ' + ((o && o.name) || p.duplicateOf) + ': holds work the original lacks, review and merge)';
        }
        // 11 Nov 2026: the original says so too
        var n = _copiesOf(p).length;
        return n ? ' (Has ' + (n === 1 ? 'a second version' : n + ' other versions') + ' to review and merge)' : '';
    }
    function decorate(host, activeId) {
        if (typeof document === 'undefined' || !host) return;
        var bar = document.getElementById('fta-dup-review');
        var p = _byId(activeId);
        var copies = (p && !p.dupReview) ? _copiesOf(p) : [];
        if (!p || (!p.dupReview && !copies.length)) { if (bar) bar.remove(); _warned = null; return; }
        if (!bar) { bar = document.createElement('div'); bar.id = 'fta-dup-review'; bar.setAttribute('role', 'status'); host.appendChild(bar); }
        bar.style.cssText = 'flex-basis:100%; margin-top:6px; padding:8px 12px; border:1px solid var(--color-warning, #b45309); background:var(--color-surface-2); color:var(--color-text-primary); font-size:12px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;';
        var copy = p.dupReview ? p : copies[0], orig = p.dupReview ? _byId(p.duplicateOf) : p;
        var oName = (orig && orig.name) || copy.duplicateOf, cName = copy.name || copy.id;
        if (p.dupReview) {
            // the second version: say where the work belongs, every time it is opened
            bar.setAttribute('data-side', 'copy');
            bar.innerHTML = '<span><b>This is a second version of "' + _esc(oName) + '".</b> Two trees exist for the same failure condition, and this one holds work the original lacks (' + _esc(p.dupReview.reason) + '). Work in the original so the two do not drift further apart.</span>' +
                '<button type="button" class="ckpt-m-btn" data-act="open">Open the original</button>' +
                '<button type="button" class="ckpt-m-btn" data-act="merge">Merge into original</button>' +
                '<button type="button" class="ckpt-m-btn" data-act="keep">Keep as its own tree</button>';
            if (_warned !== p.id) { _warned = p.id; _call('showToast', 'This is a second version of "' + oName + '". Work in the original, or merge this one into it.', 'warning', 8000); }
        } else {
            // 11 Nov 2026: the original says so too (it showed nothing, so nobody working here knew)
            bar.setAttribute('data-side', 'original');
            _warned = null;
            bar.innerHTML = '<span><b>This tree has a second version' + (copies.length > 1 ? ' (' + copies.length + ' of them)' : '') + '.</b> "' + _esc(cName) + '" was made for the same failure condition and holds work this one lacks (' + _esc(copy.dupReview.reason) + '). This is the one to work in.</span>' +
                '<button type="button" class="ckpt-m-btn" data-act="open">Open the second version</button>' +
                '<button type="button" class="ckpt-m-btn" data-act="merge">Merge it into this tree</button>' +
                '<button type="button" class="ckpt-m-btn" data-act="keep">Keep both as separate trees</button>';
        }
        bar.querySelector('[data-act="open"]').onclick = function () { _call('openFTAPageById', p.dupReview ? copy.duplicateOf : copy.id); };
        bar.querySelector('[data-act="merge"]').onclick = function () { var r = mergeIntoOriginal(copy.id); if (r.ok) { _call('openFTAPageById', orig ? orig.id : copy.duplicateOf); _call('showToast', 'Merged into the original tree. The second version is kept in the project\'s retired copies.', 'success', 5000); } };
        bar.querySelector('[data-act="keep"]').onclick = function () { keepSeparate(copy.id); _call('showToast', 'Kept as its own tree.', 'success', 4000); decorate(host, activeId); };
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
    // 11 Nov 2026: every way a project arrives (load_repair.js); the wrap above only where that module is absent
    function _onArrive() { var r = run(); return !!(r.retired.length || r.review.length || r.merged.length); }
    if (root.SLLoadRepair && typeof root.SLLoadRepair.on === 'function') root.SLLoadRepair.on('duplicate trees', _onArrive);
    else if (!_wrapLoad() && typeof root.addEventListener === 'function') root.addEventListener('DOMContentLoaded', _wrapLoad);

    var api = { VERSION: VERSION, run: run, pending: pending, classify: classify, identity: identity, restore: restore,
        mergeIntoOriginal: mergeIntoOriginal, keepSeparate: keepSeparate, label: label, decorate: decorate, copiesOf: _copiesOf, _repoint: _repoint };
    try { root.SLFtaDedupe = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

// ============================================================================
// project_recovery.js — v1.1 — SLProjectRecovery (12 Nov 2026).
//
// WHY THIS FILE EXISTS. Live team data, 11 Nov 2026: an old copy of a shared project, held in one teammate's browser,
// was saved over the team's newer work; 45 fault tree events were lost and the team kept working on the smaller copy.
// Putting the old saved version back would have thrown away everything done since, and every teammate's browser
// remembers the removals, so a plain restore would have been undone the next time one of them opened the project.
//
// A RECOVERY adds back what a saved version had and the project lost, as NEW changes on top of the project as it is
// now: nothing the team did since is removed or changed. Safety Lab prepares it (table project_recoveries: the saved
// version, kept where the history's pruning cannot take it) and approves it after reviewing the preview. The first
// editor who opens the project on this build, once the tab holds the team's live copy, applies it ONCE; it travels
// through the live shared copy to every screen and into the saved copy, is written to the change log, and is marked
// applied on the server. Safe on two screens at once: the events keep the ids they had, so two screens write the
// same events and the shared copy holds each once; a second run finds nothing to add.
//
// What is added back (plan, pure): for every fault tree page of the saved version,
//   - the page is still in the project: every event of the saved tree that the page no longer holds is put back
//     under the event it hung from (which is still there), at the place it had among its siblings;
//   - the page is no longer in the project: left alone when the project retired it as a duplicate
//     (projectConfig.retiredDuplicateTrees: it is kept there), otherwise the whole page comes back.
// An event already in the page (same id) is never touched: what the team has now always stands.
//
// v1.1 (12 Nov 2026, the same night): A RECOVERY CAN BE TAKEN BACK. The first recovery put back 45 events that were
// read as lost work; 43 of them were the tool's own "Decompose" placeholders and the repeat gates above them, which
// the team had cleared, and it doubled placeholders the trees already had. An UNDO is a recovery row whose snapshot
// is { undo: { from: <saved version>, pages: { <page id>: [event ids] } } }: it removes exactly the listed events
// that still stand as the recovery left them (the top of each branch carries recoveredFrom.from === from, and every
// event below it is on the list). A listed event the team has since built under is kept and counted, never removed.
// The removal is announced to the live sync first (SafetyLabCRDT.allowRemoval) so nobody is asked about it.
//
// API (window.SLProjectRecovery): plan(currentPages, savedPages, retiredIds), apply(currentPages, plan, stamp),
// undo(currentPages, undoSpec), check(), last(). Kill switch: window.SL_PROJECT_RECOVERY_OFF = true.
// Load: after crdt_sync.js and load_repair.js. Tests: tests/regression_stale_copy_overwrite_20261112.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.1';

    function _kidsKey(n) { return Array.isArray(n.children) ? 'children' : (Array.isArray(n._children) ? '_children' : null); }
    function _kids(n) { var k = n && _kidsKey(n); return k ? n[k] : []; }
    function _clone(x) { return JSON.parse(JSON.stringify(x)); }
    function _count(n) { if (!n || typeof n !== 'object') return 0; var c = 1; _kids(n).forEach(function (k) { c += _count(k); }); return c; }
    function _index(rootNode) {
        var m = {};
        (function w(n) { if (!n || typeof n !== 'object') return; if (n.id != null && n.id !== '') m[String(n.id)] = n; _kids(n).forEach(w); })(rootNode);
        return m;
    }

    // ---- the plan (pure) -------------------------------------------------------------------------------------------
    // -> { pages: [page copies to add], grafts: [{ pageId, pageName, parentId, index, node, events }], roots: [{ pageId, root, events }],
    //      perPage: [{ id, name, events }], events, pagesBack, text }
    function plan(currentPages, savedPages, retiredIds) {
        var out = { pages: [], grafts: [], roots: [], perPage: [], events: 0, pagesBack: 0, text: '' };
        var cur = {}, retired = {};
        (currentPages || []).forEach(function (p) { if (p && p.id != null && p.id !== '') cur[String(p.id)] = p; });
        (retiredIds || []).forEach(function (id) { retired[String(id)] = 1; });
        (savedPages || []).forEach(function (sp) {
            if (!sp || sp.id == null || sp.id === '') return;
            var id = String(sp.id), cp = cur[id], n = 0;
            if (!cp) {
                if (retired[id]) return;                              // retired as a duplicate: the project keeps it there
                n = _count(sp.root);
                if (!n) return;                                       // an empty page that is gone holds no work
                out.pages.push(_clone(sp)); out.pagesBack++;
            } else if (sp.root && typeof sp.root === 'object') {
                if (!cp.root) {
                    n = _count(sp.root);
                    out.roots.push({ pageId: id, root: _clone(sp.root), events: n });
                } else {
                    var have = _index(cp.root);
                    (function w(sn) {
                        _kids(sn).forEach(function (k, i) {
                            if (!k || typeof k !== 'object' || k.id == null || k.id === '') return;
                            if (have[String(k.id)]) { w(k); return; }
                            // the whole missing branch comes back under its parent, which the page still holds
                            var ev = _count(k);
                            out.grafts.push({ pageId: id, pageName: sp.name || id, parentId: String(sn.id), index: i, node: _clone(k), events: ev });
                            n += ev;
                        });
                    })(sp.root.id != null && have[String(sp.root.id)] ? sp.root : { id: cp.root.id, children: _kids(sp.root) });
                }
            }
            if (n) { out.perPage.push({ id: id, name: sp.name || id, events: n }); out.events += n; }
        });
        var parts = [];
        if (out.events) parts.push(out.events + ' fault tree event' + (out.events === 1 ? '' : 's') + ' in ' + out.perPage.length + ' tree' + (out.perPage.length === 1 ? '' : 's'));
        if (out.pagesBack) parts.push(out.pagesBack + ' whole page' + (out.pagesBack === 1 ? '' : 's') + ' among them');
        out.text = parts.length ? parts.join(', ') : 'nothing';
        return out;
    }

    // ---- apply to the pages in place -------------------------------------------------------------------------------
    // stamp: { from: <saved version>, at: <ISO time> } written on the top event of every branch put back (recoveredFrom).
    function apply(currentPages, pl, stamp) {
        var done = { events: 0, pages: 0, skipped: 0 };
        if (!Array.isArray(currentPages) || !pl) return done;
        var cur = {};
        currentPages.forEach(function (p) { if (p && p.id != null && p.id !== '') cur[String(p.id)] = p; });
        (pl.pages || []).forEach(function (p) {
            if (cur[String(p.id)]) { done.skipped++; return; }
            var c = _clone(p); if (stamp) c.recoveredFrom = stamp;
            currentPages.push(c); cur[String(c.id)] = c; done.pages++; done.events += _count(c.root);
        });
        (pl.roots || []).forEach(function (r) {
            var p = cur[r.pageId]; if (!p || p.root) { done.skipped++; return; }
            p.root = _clone(r.root); if (stamp) p.root.recoveredFrom = stamp;
            done.events += r.events;
        });
        (pl.grafts || []).forEach(function (g) {
            var p = cur[g.pageId]; if (!p || !p.root) { done.skipped++; return; }
            var have = _index(p.root);
            if (have[String(g.node.id)]) { done.skipped++; return; }           // already back (another screen, or a second run)
            var parent = have[g.parentId]; if (!parent) { done.skipped++; return; }
            var key = _kidsKey(parent) || 'children';
            if (!Array.isArray(parent[key])) parent[key] = [];
            var n = _clone(g.node);
            // an event inside the branch that the page has meanwhile gained elsewhere is not doubled
            (function prune(x) { var k = _kidsKey(x); if (!k) return; x[k] = x[k].filter(function (c) { return !(c && c.id != null && have[String(c.id)]); }); x[k].forEach(prune); })(n);
            if (stamp) n.recoveredFrom = stamp;
            parent[key].splice(Math.min(g.index, parent[key].length), 0, n);
            done.events += _count(n);
        });
        return done;
    }


    // ---- take a recovery back (pure on the pages it is given; changes them in place) --------------------------------
    // spec: { from: <saved version>, pages: { <page id>: [event ids] } }
    // -> { removed, kept, keys: ['<page id>:<event id>'], perPage: [{ id, name, removed, kept }] }
    function undo(currentPages, spec) {
        var out = { removed: 0, kept: 0, keys: [], perPage: [] };
        if (!Array.isArray(currentPages) || !spec || !spec.pages || spec.from == null) return out;
        currentPages.forEach(function (p) {
            if (!p || p.id == null || !p.root || typeof p.root !== 'object') return;
            var ids = spec.pages[String(p.id)]; if (!Array.isArray(ids) || !ids.length) return;
            var listed = {}; ids.forEach(function (i) { listed[String(i)] = 1; });
            var removed = 0, kept = 0;
            var allListed = function (n) { if (!n || n.id == null || !listed[String(n.id)]) return false; return _kids(n).every(allListed); };
            var stamped = function (n) { return !!(n && n.recoveredFrom && String(n.recoveredFrom.from) === String(spec.from)); };
            (function w(parent) {
                var k = _kidsKey(parent); if (!k) return;
                parent[k] = parent[k].filter(function (c) {
                    if (!c || typeof c !== 'object' || c.id == null || !listed[String(c.id)]) return true;
                    if (stamped(c) && allListed(c)) {
                        (function note(x) { out.keys.push(String(p.id) + ':' + String(x.id)); removed++; _kids(x).forEach(note); })(c);
                        return false;
                    }
                    kept++;                                             // not as the recovery left it: the team's, it stays
                    return true;
                });
                parent[k].forEach(w);
            })(p.root);
            if (removed || kept) out.perPage.push({ id: String(p.id), name: p.name || String(p.id), removed: removed, kept: kept });
            out.removed += removed; out.kept += kept;
        });
        return out;
    }

    // ---- the app side ----------------------------------------------------------------------------------------------
    function _g(name) {
        try { var E = root.SLEnv; if (E && typeof E.get === 'function') { var v = E.get(name); if (v !== undefined) return v; } } catch (_) {}
        try { return root[name]; } catch (_) { return undefined; }
    }
    function _call(name) {
        var f = _g(name); if (typeof f !== 'function') return undefined;
        try { return f.apply(null, Array.prototype.slice.call(arguments, 1)); } catch (_) { return undefined; }
    }
    function _pid() {
        try { if (typeof root.getActiveCloudProjectId === 'function') return root.getActiveCloudProjectId() || null; } catch (_) {}
        var v = _g('_activeCloudProjectId'); return v || null;
    }
    var _busy = false, _doneFor = {}, _last = null, _nothingAt = {};
    var RECHECK_MS = 10 * 60 * 1000;

    async function check() {
        if (root.SL_PROJECT_RECOVERY_OFF || _busy) return null;
        var pid = _pid(); if (!pid || _doneFor[pid]) return null;
        var C = root.SafetyLabCRDT; var st = null;
        try { st = C && C.status ? C.status() : null; } catch (_) { st = null; }
        // only on a tab that holds the team's live copy: the recovery goes on top of what the team has NOW
        if (!st || st.project !== pid || st.caughtUp !== true) return null;
        if (_nothingAt[pid] && Date.now() - _nothingAt[pid] < RECHECK_MS) return null;
        var client = null; try { client = root.getSupabaseClient && root.getSupabaseClient(); } catch (_) { client = null; }
        if (!client) return null;
        _busy = true;
        try {
            var q = await client.from('project_recoveries').select('id, from_version, reason').eq('project_id', pid).not('approved_at', 'is', null).is('applied_at', null).order('created_at', { ascending: true }).limit(1);
            if (q && q.error) return null;                              // a build or server without recoveries: nothing to do
            var row = q && q.data && q.data[0];
            if (!row) { _nothingAt[pid] = Date.now(); return null; }
            var full = await client.from('project_recoveries').select('snapshot').eq('id', row.id).maybeSingle();
            if (!full || full.error || !full.data || !full.data.snapshot) return null;
            if (_pid() !== pid) return null;                            // the project was switched while we read
            var pages = _g('ftaPages'); if (!Array.isArray(pages)) return null;
            var pc = _g('projectConfig');
            var retired = ((pc && pc.retiredDuplicateTrees) || []).map(function (r) { return r && r.page && r.page.id; }).filter(function (x) { return x != null; });
            if (full.data.snapshot.undo) {
                // v1.1: this row takes an earlier recovery back
                var spec = full.data.snapshot.undo;
                var u = undo(pages, spec);
                var ures = { undo: true, removed: u.removed, kept: u.kept, perPage: u.perPage, at: new Date().toISOString(), build: VERSION };
                if (u.removed) {
                    try { if (C && typeof C.allowRemoval === 'function') C.allowRemoval(pid, u.keys); } catch (_) {}
                    _call('jrnl', 'recovery-undo', 'Safety Lab took back its recovery of saved version ' + spec.from + ': ' + u.removed + ' placeholder event' + (u.removed === 1 ? '' : 's') + ' it had added were removed (' + u.perPage.filter(function (p) { return p.removed; }).map(function (p) { return p.name + ': ' + p.removed; }).join('; ') + '). Nothing the team built was changed.');
                    _call('scheduleAutosave'); setTimeout(function () { _call('scheduleAutosave'); }, 0);
                    try { if (root.SL_FTA_PICKER) root.SL_FTA_PICKER.render(true); } catch (_) {}
                    _call('renderFTA');
                    _call('showToast', 'Safety Lab removed ' + u.removed + ' placeholder event' + (u.removed === 1 ? '' : 's') + ' it had added to your fault trees by mistake. Nothing you built was changed. Details are in the change log.', 'info', 14000);
                }
                var mu = await client.rpc('mark_project_recovery_applied', { p_id: row.id, p_result: ures });
                _doneFor[pid] = !!(mu && !mu.error && mu.data === true) || !u.removed;
                _last = { id: row.id, result: ures, marked: !!(mu && !mu.error && mu.data === true) };
                try { console.info('[recovery] undo ' + row.id + ': ' + u.removed + ' removed, ' + u.kept + ' kept'); } catch (_) {}
                return _last;
            }
            var pl = plan(pages, full.data.snapshot.ftaPages || [], retired);
            var stamp = { from: row.from_version, at: new Date().toISOString() };
            var done = apply(pages, pl, stamp);
            var result = { events: done.events, pages: done.pages, skipped: done.skipped, perPage: pl.perPage, at: stamp.at, build: VERSION };
            if (done.events || done.pages) {
                _call('jrnl', 'recovery', 'Safety Lab recovery: ' + done.events + ' fault tree event' + (done.events === 1 ? '' : 's') + ' from saved version ' + row.from_version + ' put back (' + pl.perPage.map(function (p) { return p.name + ': ' + p.events; }).join('; ') + '). Nothing the team did since was changed or removed.');
                _call('scheduleAutosave'); setTimeout(function () { _call('scheduleAutosave'); }, 0);
                try { if (root.SL_FTA_PICKER) root.SL_FTA_PICKER.render(true); } catch (_) {}
                _call('renderFTA');
                _call('showToast', 'Safety Lab put back ' + done.events + ' fault tree event' + (done.events === 1 ? '' : 's') + ' that had been lost from this project. Nothing you did since was changed. Details are in the change log.', 'success', 14000);
            }
            var mk = await client.rpc('mark_project_recovery_applied', { p_id: row.id, p_result: result });
            _doneFor[pid] = true;
            _last = { id: row.id, result: result, marked: !!(mk && !mk.error && mk.data === true) };
            try { console.info('[recovery] applied ' + row.id + ': ' + done.events + ' events, ' + done.pages + ' pages'); } catch (_) {}
            return _last;
        } catch (e) {
            try { console.warn('[recovery] failed', e); } catch (_) {}
            return null;
        } finally { _busy = false; }
    }

    var api = { VERSION: VERSION, plan: plan, apply: apply, undo: undo, check: check, last: function () { return _last; }, _count: _count };
    try { root.SLProjectRecovery = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    try {
        if (typeof root.addEventListener === 'function' && typeof root.setInterval === 'function') {
            root.addEventListener('load', function () { root.setInterval(function () { check(); }, 8000); });
        }
    } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);

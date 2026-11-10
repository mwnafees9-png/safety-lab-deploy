// ============================================================================
// stale_revive.js, v1.1, 8 Nov 2026: a row marked stale because its parent was removed is relinked when that parent
// comes back, and an aircraft tree a system change wrongly flagged obsolete is cleared.
// v1.1, 11 Nov 2026 (live team data): the repair never took effect on a shared cloud project. It now runs after
// every way a project arrives (load_repair.js): a file, open from the cloud, the live shared copy pulled in, and a
// teammate's change (the tree repair only).
//
// Live student data, 8 to 9 Nov 2026. Two markers set stale flags and nothing ever cleared them: the function
// cascade (safety_lab.js, "Parent function <name> removed") and rename_guard.js rgMarkStale ("STALE - <label> <key>
// deleted", plus reqSource.obsolete/orphan and staleRefs entries). A function or failure condition put back left
// every row it had owned crossed out for good.
//
// THE REVIVE CHECK (revive(opts)), run on load and after every data change (a debounce on scheduleAutosave, the same
// hook rename_guard.js rides, only when SLDataChange says something changed):
//   Every stale mark names its parent: row.staleParent { kind, scope, systemId, key, name, at } (both markers write
//   it from 8 Nov 2026). A mark from before that is read from its reason, the row's link field and the table it is
//   in (parentOf()). The marks looked at: FCIM rows (aircraft and every system), FHA rows, requirements
//   (reqSource.obsolete), fault tree pages and their events, physical hazards, and staleRefs entries on zones,
//   PRAs, items and requirements.
//   When a live parent with the same key is back in the same scope, it is compared with the parent as it was (the
//   staleParent name; for an old mark, the name in its reason or the row's own stored description):
//     SAME (sameThing): the names are equal ignoring case, spacing and punctuation, or their words overlap strongly
//       (Jaccard similarity of the meaningful words at least SIMILAR = 0.6; "Process roll command" against "Aircraft
//       roll state" is 0.2): the mark is cleared and the link restored (requirements: orphan cleared; staleRefs: the
//       entry removed), the history kept (obsoleteHistory: { reason, obsoletedAt, clearedAt, why: '<kind> <key> came
//       back' }), a change entry journaled, the tables drawn again.
//     DIFFERENT, or the old name is not known: the person is asked (slChoose), naming the old and the new: Relink /
//       Keep it marked. One question per returning parent, however many rows it owned, asked one after another.
//       "Keep it marked" is remembered on each row for that parent (staleKeepMarked), so it is not asked again.
//       Nothing is ever relinked without a match or a yes.
// THE AIRCRAFT TREE REPAIR (repairAircraftTrees()), on load: an aircraft tree flagged obsolete by a SYSTEM function
// removal (safety_lab.js before 8 Nov 2026 flagged every tree with an event linked to a system FHA row) whose aircraft
// failure condition still exists has the flag cleared, the record kept in page.obsoleteHistory, a journal entry;
// the events in it linked to system FHA rows that really are gone or obsolete get a node-level stale mark instead.
//
// API (window.SLStaleRevive): revive(opts), repairAircraftTrees(), marks(), parentOf(mark), liveParent(parent, mark),
// sameThing(a, b), similarity(a, b), SIMILAR. Kill switch: window.SL_STALE_REVIVE_OFF = true.
// Load: after rename_guard.js, safety_lab.js and fta_dedupe.js. Tests: tests/regression_stale_revive_20261108.test.js
// and tests/regression_cascade_scope_20261108.test.js.
// ============================================================================
(function (root) {
    'use strict';
    var VERSION = '1.1';
    var SIMILAR = 0.6;
    var EMDASH = '\u2014';

    function _g(n) {
        try { var E = root.SLEnv; if (E && typeof E.get === 'function') { var v = E.get(n); if (v !== undefined) return v; } } catch (_) {}
        try { return root[n]; } catch (_) { return undefined; }
    }
    function _arr(n) { var a = _g(n); return Array.isArray(a) ? a : []; }
    function _systems() { return _arr('systemsData'); }
    function _pc() { var c = _g('projectConfig'); return (c && typeof c === 'object') ? c : null; }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _now() { return new Date().toISOString(); }
    function _jr(kind, msg) { try { if (typeof root.jrnl === 'function') root.jrnl(kind, msg); } catch (_) {} }
    function _call(name) { var f = root[name]; if (typeof f !== 'function') f = _g(name); if (typeof f !== 'function') return; try { return f.apply(root, Array.prototype.slice.call(arguments, 1)); } catch (_) {} }

    // ---- names: the same thing or not --------------------------------------------------------------------------
    var STOP = { a: 1, an: 1, the: 1, of: 1, and: 1, or: 1, to: 1, in: 1, on: 1, for: 1, by: 1, with: 1, at: 1, from: 1, is: 1 };
    function _norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
    function _words(s) { var o = {}; _norm(s).split(' ').forEach(function (w) { if (w && !STOP[w]) o[w] = 1; }); return Object.keys(o); }
    function similarity(a, b) {
        var A = _words(a), B = _words(b); if (!A.length || !B.length) return 0;
        var inter = A.filter(function (w) { return B.indexOf(w) >= 0; }).length;
        return inter / (A.length + B.length - inter);
    }
    function sameThing(a, b) {
        if (!_norm(a) || !_norm(b)) return false;
        return _norm(a) === _norm(b) || similarity(a, b) >= SIMILAR;
    }

    // ---- every stale mark --------------------------------------------------------------------------------------
    // { type: 'row' | 'req' | 'ref' | 'page' | 'node', obj, entry (ref), table, scope ('ac' | 'sys:<id>' | null), where }
    function marks() {
        var out = [];
        function rows(list, table, scope, where) {
            (list || []).forEach(function (r) {
                if (!r) return;
                if (r.obsolete) out.push({ type: 'row', obj: r, table: table, scope: scope, where: where });
                (Array.isArray(r.staleRefs) ? r.staleRefs : []).forEach(function (e) { if (e) out.push({ type: 'ref', obj: r, entry: e, table: table, scope: scope, where: where }); });
            });
        }
        function reqs(list, scope, where) {
            (list || []).forEach(function (r) {
                if (!r) return;
                if (r.reqSource && r.reqSource.obsolete) out.push({ type: 'req', obj: r, table: 'req', scope: scope, where: where });
                (Array.isArray(r.staleRefs) ? r.staleRefs : []).forEach(function (e) { if (e) out.push({ type: 'ref', obj: r, entry: e, table: 'req', scope: scope, where: where }); });
            });
        }
        rows(_arr('acFcimData'), 'fcim', 'ac', 'Aircraft FCIM');
        rows(_arr('acFhaData'), 'fha', 'ac', 'AFHA');
        reqs(_arr('acReqData'), 'ac', 'Aircraft requirements');
        _systems().forEach(function (s) {
            if (!s) return;
            var nm = s.name || s.id, sc = 'sys:' + s.id;
            rows(s.fcim, 'fcim', sc, nm + ' FCIM');
            rows(s.fha, 'fha', sc, nm + ' SFHA');
            reqs(s.req, sc, nm + ' requirements');
        });
        var pc = _pc();
        rows((pc && pc.physHazards) || [], 'physHazard', null, 'Physical hazards');
        rows(_arr('zsaData'), 'zone', null, 'Zones');
        rows(_arr('praData'), 'pra', null, 'Particular risks');
        rows(_arr('itemsData'), 'item', null, 'Items');
        _arr('ftaPages').forEach(function (p) {
            if (!p) return;
            var sc = p.treeLevel === 'system' && p.systemId != null && p.systemId !== '' ? 'sys:' + p.systemId : 'ac';
            if (p.obsolete) out.push({ type: 'page', obj: p, table: 'page', scope: sc, where: 'Fault tree ' + (p.name || p.id) });
            (function w(n) { if (!n) return; if (n.obsolete) out.push({ type: 'node', obj: n, page: p, table: 'node', scope: null, where: 'Fault tree ' + (p.name || p.id) }); _kids(n).forEach(w); })(p.root);
        });
        return out;
    }
    function _reasonOf(m) {
        if (m.type === 'req') return (m.obj.reqSource.obsolete && m.obj.reqSource.obsolete.reason) || '';
        if (m.type === 'ref') return m.entry.reason || '';
        return m.obj.obsoleteReason || '';
    }
    function _markedAt(m) {
        if (m.type === 'req') return (m.obj.reqSource.obsolete && m.obj.reqSource.obsolete.taggedAt) || null;
        if (m.type === 'ref') return m.entry.at || null;
        return m.obj.obsoletedAt || null;
    }
    var RG_KIND = { 'Function ID': 'function', 'Failure condition ID': 'fha', 'Zone ID': 'zone', 'Item / LRU ID': 'item', 'PRA ID': 'pra', 'Physical hazard ID': 'physHazard', 'Fault tree page': 'page' };
    var REF_KIND = { subId: 'function', fcId: 'fha', zoneId: 'zone', itemId: 'item', praId: 'pra', phId: 'physHazard', pageId: 'page' };
    function _scopeOf(sc) { return sc === 'ac' ? { scope: 'aircraft', systemId: null } : (sc ? { scope: 'system', systemId: sc.slice(4) } : { scope: null, systemId: null }); }
    // the parent of a mark: its staleParent, else read from an older mark's reason, link field and table
    function parentOf(m) {
        var sp = m.type === 'ref' ? m.entry.staleParent : m.obj.staleParent;
        if (sp && sp.kind && sp.key) return sp;
        var reason = _reasonOf(m), mm, o = m.obj, here = _scopeOf(m.scope);
        if ((mm = /^Parent function (.+) removed$/.exec(reason))) {
            var lbl = mm[1].trim();
            var key = m.table === 'req' ? (o.traceId || '') : (m.table === 'page' ? '' : (o.subId || ''));
            if (!key) key = lbl;
            return { kind: 'function', scope: here.scope, systemId: here.systemId, key: String(key).trim(), name: lbl !== String(key).trim() ? lbl : '', legacy: true, label: lbl };
        }
        var re = new RegExp('^STALE ' + EMDASH + ' (.+) (\\S+) deleted$');
        if ((mm = re.exec(reason))) {
            var kind = RG_KIND[mm[1]] || (m.type === 'ref' && REF_KIND[m.entry.kind]) || mm[1], k2 = mm[2], name = '';
            if (kind === 'fha' && m.table === 'fcim') ['tl', 'pl', 'm'].forEach(function (p) { if (!name && String(o[p + 'Id'] || '') === k2) name = o[p + 'Desc'] || ''; });
            var scoped = kind === 'function' || kind === 'fha';
            return { kind: kind, scope: scoped ? here.scope : null, systemId: scoped ? here.systemId : null, key: k2, name: name, legacy: true };
        }
        return null;
    }

    // ---- is the parent back? -----------------------------------------------------------------------------------
    function _sysById(id) { return _systems().find(function (s) { return s && String(s.id) === String(id); }) || null; }
    function _fnIn(list, key, sys) {
        var f = (list || []).find(function (x) { return x && String(sys ? (x.funcId || x.subId || '') : (x.subId || '')).trim() === key; });
        if (!f) f = (list || []).find(function (x) { return x && _norm(sys ? (x.funcName || x.subName) : (x.subName || x.funcName)) === _norm(key) && _norm(key); });
        return f ? { obj: f, key: key, name: String((sys ? (f.funcName || f.subName) : (f.subName || f.funcName)) || '') } : null;
    }
    function _fhaIn(list, key) { var f = (list || []).find(function (x) { return x && String(x.fcId || '').trim() === key; }); return f ? { obj: f, key: key, name: String(f.fcDesc || '') } : null; }
    function liveParent(sp, m) {
        if (!sp) return null;
        var key = String(sp.key || '').trim(); if (!key) return null;
        var scope = sp.scope, sysId = sp.systemId;
        if (!scope && m && m.scope) { var h = _scopeOf(m.scope); scope = h.scope; sysId = h.systemId; }
        if (sp.kind === 'function') {
            if (scope === 'system') { var s = _sysById(sysId); return s ? _fnIn(s.functions, key, true) : null; }
            if (scope === 'aircraft') return _fnIn(_arr('acFunctionsData'), key, false);
            // a project-wide list (a zone's housed functions): the aircraft's, else any system's
            var af = _fnIn(_arr('acFunctionsData'), key, false); if (af) return af;
            for (var k = 0; k < _systems().length; k++) { var sf = _fnIn((_systems()[k] || {}).functions, key, true); if (sf) return sf; }
            return null;
        }
        if (sp.kind === 'fha') {
            if (scope === 'system') { var s2 = _sysById(sysId); return s2 ? _fhaIn(s2.fha, key) : null; }
            if (scope === 'aircraft') return _fhaIn(_arr('acFhaData'), key);
            var a = _fhaIn(_arr('acFhaData'), key); if (a) return a;
            for (var i = 0; i < _systems().length; i++) { var b = _fhaIn((_systems()[i] || {}).fha, key); if (b) return b; }
            return null;
        }
        var find = function (list, kf, nf) { var x = (list || []).find(function (r) { return r && String(r[kf] || '') === key; }); return x ? { obj: x, key: key, name: String(nf(x) || '') } : null; };
        var pc = _pc();
        if (sp.kind === 'zone') return find(_arr('zsaData'), 'zoneId', function (z) { return z.zoneName || z.name || z.description; });
        if (sp.kind === 'item') return find(_arr('itemsData'), 'itemId', function (z) { return z.itemName || z.name || z.description; });
        if (sp.kind === 'pra') return find(_arr('praData'), 'praId', function (z) { return z.title || z.name || z.description; });
        if (sp.kind === 'physHazard') return find((pc && pc.physHazards) || [], 'phId', function (z) { return z.title || z.hazard || z.description; });
        if (sp.kind === 'page') return find(_arr('ftaPages'), 'id', function (z) { return z.name; });
        return null;
    }

    // ---- relinking ------------------------------------------------------------------------------------------------
    function _kindWord(k) { return { function: 'Function', fha: 'Failure condition', zone: 'Zone', item: 'Item', pra: 'Particular risk', physHazard: 'Physical hazard', page: 'Fault tree' }[k] || k; }
    function _sig(sp, live) { return [sp.kind, sp.scope || '', sp.systemId || '', sp.key, _norm(live.name)].join('|'); }
    function _history(obj, entry) { obj.obsoleteHistory = Array.isArray(obj.obsoleteHistory) ? obj.obsoleteHistory : []; obj.obsoleteHistory.push(entry); }
    function _relink(m, sp, why, live) {
        var o = m.obj, h = { reason: _reasonOf(m), obsoletedAt: _markedAt(m), clearedAt: _now(), why: why };
        // an event linked to a failure condition that came back as a new row: its link follows the row
        if (m.type === 'node' && sp.kind === 'fha' && live && live.obj && live.obj.internalId != null && o.externalSource) {
            var pre = live.obj && _arr('acFhaData').indexOf(live.obj) >= 0 ? 'AC_' : 'SYS_';
            if (String(o.externalSource.targetId) !== pre + live.obj.internalId) { h.linkWas = String(o.externalSource.targetId); o.externalSource.targetId = pre + live.obj.internalId; }
        }
        if (m.type === 'req') { delete o.reqSource.obsolete; delete o.reqSource.orphan; delete o.staleParent; }
        else if (m.type === 'ref') { o.staleRefs = (o.staleRefs || []).filter(function (e) { return e !== m.entry; }); if (!o.staleRefs.length) delete o.staleRefs; h.field = m.entry.field; h.ref = m.entry.ref; }
        else { delete o.obsolete; delete o.obsoleteReason; delete o.obsoletedAt; delete o.staleParent; }
        _history(o, h);
        _jr('stale-relinked', m.where + ': ' + (o.subId || o.fcId || o.traceId || o.reqId || o.name || o.displayId || o.id || o.internalId || '') + ' relinked, ' + why);
    }
    function _declined(m, sig) { var holder = m.type === 'ref' ? m.entry : m.obj; return !!(holder.staleKeepMarked && holder.staleKeepMarked[sig]); }
    function _decline(m, sig) { var holder = m.type === 'ref' ? m.entry : m.obj; holder.staleKeepMarked = holder.staleKeepMarked || {}; holder.staleKeepMarked[sig] = _now(); }

    var _asking = false, _queue = [];
    function _rerender() {
        ['renderACFCIM', 'renderSysFCIM', 'renderACFHA', 'renderSysFHA', 'renderACReq', 'renderSysReq', 'renderFTASidebar', 'updateD3'].forEach(function (f) { _call(f); });
        _call('scheduleAutosave');
    }
    // returns { relinked, asked (questions queued), waiting (marks whose parent is not back) }
    function revive(opts) {
        opts = opts || {};
        var out = { relinked: 0, asked: 0, waiting: 0, questions: [] };
        if (root.SL_STALE_REVIVE_OFF) { out.off = true; return out; }
        var doubt = {};
        marks().forEach(function (m) {
            var sp = parentOf(m); if (!sp) return;
            var live = liveParent(sp, m);
            if (!live) { out.waiting++; return; }
            var why = _kindWord(sp.kind) + ' ' + sp.key + ' came back';
            var oldName = sp.name || '';
            if (oldName && sameThing(oldName, live.name)) { _relink(m, sp, why, live); out.relinked++; return; }
            var sig = _sig(sp, live);
            if (_declined(m, sig)) return;
            if (!doubt[sig]) doubt[sig] = { sig: sig, parent: sp, live: live, oldName: oldName, marks: [] };
            doubt[sig].marks.push(m);
        });
        Object.keys(doubt).forEach(function (k) {
            var q = doubt[k];
            if (_queue.some(function (x) { return x.sig === q.sig; })) return;
            _queue.push(q); out.asked++; out.questions.push({ key: q.parent.key, kind: q.parent.kind, oldName: q.oldName, newName: q.live.name, rows: q.marks.length });
        });
        if (out.relinked) { _rerender(); if (!opts.quiet) _call('showToast', out.relinked + ' stale item' + (out.relinked === 1 ? '' : 's') + ' relinked: what they were linked to came back.', 'success', 5000); }
        if (!opts.noAsk) _drain();
        return out;
    }
    async function _drain() {
        if (_asking || !_queue.length) return;
        var choose = root.slChoose || _g('slChoose'); if (typeof choose !== 'function') return;
        _asking = true;
        try {
            while (_queue.length) {
                var q = _queue[0], word = _kindWord(q.parent.kind);
                var msg = word + ' ' + q.parent.key + ' is back' + (q.oldName ? ', but it was "' + q.oldName + '" and it is now "' + q.live.name + '"' : ' as "' + q.live.name + '" (what it was called before is not known)') +
                    '. ' + q.marks.length + ' item' + (q.marks.length === 1 ? ' was' : 's were') + ' marked stale when it was removed (' + q.marks.slice(0, 3).map(function (m) { return m.where; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + (q.marks.length > 3 ? ', ...' : '') + '). Relink ' + (q.marks.length === 1 ? 'it' : 'them') + ' to the new ' + word.toLowerCase() + '?';
                var v = await choose(msg, [
                    { value: 'relink', label: 'Relink', hint: 'The stale mark is cleared and the history kept.' },
                    { value: 'keep', label: 'Keep it marked', hint: 'Not asked again for this ' + word.toLowerCase() + '.' }], { title: 'Something that was removed is back', cancelText: 'Ask me later' });
                _queue.shift();
                if (v === 'relink') {
                    var n = 0;
                    q.marks.forEach(function (m) { if (_stillMarked(m)) { _relink(m, q.parent, word + ' ' + q.parent.key + ' came back (relinked by the person: it was "' + (q.oldName || 'not known') + '", now "' + q.live.name + '")', q.live); n++; } });
                    if (n) _rerender();
                } else if (v === 'keep') {
                    q.marks.forEach(function (m) { _decline(m, q.sig); });
                    _call('scheduleAutosave');
                }
            }
        } finally { _asking = false; }
    }
    function _stillMarked(m) {
        if (m.type === 'req') return !!(m.obj.reqSource && m.obj.reqSource.obsolete);
        if (m.type === 'ref') return (m.obj.staleRefs || []).indexOf(m.entry) >= 0;
        return !!m.obj.obsolete;
    }

    // ---- the aircraft tree repair -------------------------------------------------------------------------------
    var WHY_AC = 'aircraft failure condition still exists; a system change does not make an aircraft tree obsolete';
    function _acRow(id) { return _arr('acFhaData').find(function (r) { return r && String(r.internalId) === String(id).replace(/^AC_/, ''); }) || null; }
    function _sysRow(target) {
        var id = String(target).replace(/^SYS_/, '');
        for (var i = 0; i < _systems().length; i++) { var s = _systems()[i]; var r = s && (s.fha || []).find(function (x) { return x && String(x.internalId) === id; }); if (r) return { row: r, sys: s }; }
        return null;
    }
    function _acFcExists(rows) {
        if (rows.some(function (r) { return r && !r.obsolete; })) return true;
        var ex = _arr('acExtractedFCs');
        return rows.some(function (r) { return r && r.fcId && ex.some(function (e) { return e && String(e.fcId || e.id || e) === String(r.fcId); }); });
    }
    function repairAircraftTrees() {
        var out = { cleared: [], nodes: 0 };
        if (root.SL_STALE_REVIVE_OFF) return out;
        _arr('ftaPages').forEach(function (p) {
            if (!p || !p.obsolete || p.treeLevel !== 'aircraft') return;
            var reason = String(p.obsoleteReason || '');
            var m = /^Parent function (.+) removed$/.exec(reason); if (!m) return;
            var links = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId != null ? [p.linkedFhaId] : []);
            var rows = links.map(_acRow).filter(Boolean);
            if (!rows.length) return;
            var fromSystem;
            if (p.staleParent && p.staleParent.scope) fromSystem = p.staleParent.scope === 'system';
            // an older mark: the aircraft side made it only if the tree's own aircraft rows carry the same mark
            else fromSystem = !rows.some(function (r) { return r.obsolete && String(r.obsoleteReason || '') === reason; });
            if (!fromSystem || !_acFcExists(rows)) return;
            _history(p, { reason: reason, obsoletedAt: p.obsoletedAt || null, clearedAt: _now(), why: WHY_AC });
            delete p.obsolete; delete p.obsoleteReason; delete p.obsoletedAt; delete p.staleParent;
            out.cleared.push(p.id);
            _jr('tree-obsolete-cleared', (p.name || p.id) + ': obsolete flag cleared (' + reason + '); ' + WHY_AC + '.');
            // the events whose system rows really are gone or obsolete carry the mark instead
            (function w(n) {
                if (!n) return;
                var es = n.externalSource;
                if (es && es.kind === 'fha' && /^SYS_/.test(String(es.targetId || '')) && !n.obsolete) {
                    var hit = _sysRow(es.targetId);
                    if (!hit || hit.row.obsolete) {
                        n.obsolete = true; n.obsoletedAt = _now();
                        n.obsoleteReason = 'Linked FHA row ' + es.targetId + (hit ? ' obsolete: ' + (hit.row.obsoleteReason || 'obsolete') : ' removed');
                        n.staleParent = hit && hit.row.staleParent ? Object.assign({}, hit.row.staleParent, { via: { kind: 'fha', targetId: String(es.targetId) } }) : { kind: 'fha', scope: 'system', systemId: hit ? hit.sys.id : null, key: hit ? String(hit.row.fcId || '') : '', name: hit ? String(hit.row.fcDesc || '') : '', at: _now() };
                        out.nodes++;
                    }
                }
                _kids(n).forEach(w);
            })(p.root);
        });
        if (out.cleared.length) { _call('scheduleAutosave'); _call('renderFTASidebar'); }
        return out;
    }

    // ---- when it runs ---------------------------------------------------------------------------------------------
    function _onLoad() { try { repairAircraftTrees(); } catch (e) { try { console.warn('[stale_revive] repair', e); } catch (_) {} } try { revive({ quiet: true }); } catch (e) { try { console.warn('[stale_revive]', e); } catch (_) {} } }
    function _wrapLoad() {
        var f = root._applyProjectData;
        if (typeof f !== 'function' || f._srWrapped) return !!(f && f._srWrapped);
        var wrapped = function () { var r = f.apply(this, arguments); _onLoad(); return r; };
        wrapped._srWrapped = true;
        Object.keys(f).forEach(function (k) { try { if (!(k in wrapped)) wrapped[k] = f[k]; } catch (_) {} });
        root._applyProjectData = wrapped;
        return true;
    }
    var _timer = null, _seen = -1;
    function _soon() {
        if (_timer) clearTimeout(_timer);
        _timer = setTimeout(function () {
            _timer = null;
            var dc = root.SLDataChange, gen = dc ? dc.gen() : null;
            if (gen != null && gen === _seen) return;
            _seen = gen;
            try { revive(); } catch (_) {}
        }, 1200);
    }
    function _wrapSave() {
        var f = root.scheduleAutosave;
        if (typeof f !== 'function' || f._srWrapped) return;
        var wrapped = function () { var r = f.apply(this, arguments); try { _soon(); } catch (_) {} return r; };
        wrapped._srWrapped = true;
        Object.keys(f).forEach(function (k) { try { if (!(k in wrapped)) wrapped[k] = f[k]; } catch (_) {} });
        root.scheduleAutosave = wrapped;
    }
    if (typeof document !== 'undefined') {
        // 11 Nov 2026: every way a project arrives (load_repair.js); the wrap above only where that module is absent
        if (root.SLLoadRepair && typeof root.SLLoadRepair.on === 'function') {
            root.SLLoadRepair.on('aircraft tree flags', function (via) {
                var r = { cleared: [], nodes: 0 };
                try { r = repairAircraftTrees(); } catch (e) { try { console.warn('[stale_revive] repair', e); } catch (_) {} }
                if (via !== 'live-update') { try { revive({ quiet: true }); } catch (e) { try { console.warn('[stale_revive]', e); } catch (_) {} } }
                return !!(r && r.cleared && r.cleared.length);
            });
        } else if (!_wrapLoad() && typeof root.addEventListener === 'function') root.addEventListener('DOMContentLoaded', _wrapLoad);
        _wrapSave();
        if (typeof root.addEventListener === 'function') root.addEventListener('load', function () { _wrapSave(); });
    }

    var api = { VERSION: VERSION, SIMILAR: SIMILAR, revive: revive, repairAircraftTrees: repairAircraftTrees, marks: marks, parentOf: parentOf,
        liveParent: liveParent, sameThing: sameThing, similarity: similarity, _queue: function () { return _queue; }, _drain: _drain, _onLoad: _onLoad };
    try { root.SLStaleRevive = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

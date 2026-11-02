// fta_conditions.js: SLFtaConditions 1.0
//
// 1 Nov 2026 (customer items 37 and 43, our item 6, Waqas: "i agree with your item 6 proposal, these item need to show
// on the thread too"). CONDITIONS on fault trees: a fault tree calculated with some of its events set to "happened"
// (probability 1) or "did not happen" (probability 0), without touching the values stored on the tree.
//
//   - EVENT TREES. Each branch of an event tree heading can set events. When a tree is set to "calculate linked
//     headings from their fault trees", every sequence is quantified from the linked fault trees themselves: a heading's
//     probability on a sequence is its fault tree's failure (or success) probability GIVEN the outcomes of the headings
//     before it and the events their branches set, computed exactly (shared events and common cause between the
//     trees counted once, through one decision diagram over all of them). At each branch point the outcomes still sum
//     to one, so the sequences still sum to one (the event tree's self-check holds). A heading with more than two
//     outcomes, or with no fault tree, keeps its entered probabilities.
//   - DISPATCH CASES. A named configuration the aircraft may fly in (an MMEL item inoperative, plus anything its (m)
//     or (o) procedure changes): the events it sets, and every fault tree they reach, calculated with and without it,
//     against the failure condition objectives. The MMEL page's own check uses the same mechanism (it used to force
//     the event on the real tree and put it back).
//   - Never a real value overwritten: every calculation runs on a copy of the tree (transfers followed), so the stored
//     probabilities, the canvas and every other screen are untouched.
//   - On the Golden Thread: event tree sequences that end in a failure condition sit in an EVENT TREE column, linked to
//     the condition and to the fault trees under their headings; dispatch cases sit in a DISPATCH column, linked to
//     the fault trees they reach and to their MMEL item.
//
// API (window.SLFtaConditions): exactWith(pageOrRoot, sets) -> { p, why }, conjunction(parts, sets) -> { p, why },
// cases() (projectConfig.dispatchCases), addCase(name, mmelItemId), setEvent(caseId, lid, state), removeEvent,
// removeCase, evaluateCase(case) -> { rows, worst }, events() (every event in the project, for pickers),
// dispatchHtml() (the MMEL page section), openCase(caseId) (the editor).
(function () {
    'use strict';
    var VERSION = '1.0';
    function _pages() { try { if (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) return ftaPages; } catch (_) {} return []; }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _lid(n) { return String(n.logicalId != null ? n.logicalId : n.id); }
    function _byId(id) { var ps = _pages(); for (var i = 0; i < ps.length; i++) if (ps[i] && String(ps[i].id) === String(id)) return ps[i]; return null; }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _toast(m, k, ms) { try { if (typeof showToast === 'function') showToast(m, k || 'info', ms || 4000); } catch (_) {} }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); else if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _pc() { try { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : {}; } catch (_) { return {}; } }

    // ---- the calculation on a copy ------------------------------------------------------------------------
    function _rootOf(x) { return (x && x.root !== undefined && x.id != null && !x.type) ? x.root : x; }
    // a fresh copy of a tree with every transfer replaced by the tree it points at (fta_engine.js flattenTransfers:
    // refuses a circular transfer)
    function _copy(x) {
        var root = _rootOf(x);
        if (!root) return null;
        var E = (typeof window !== 'undefined' && window.SLFTAEngine) || null;
        if (E && typeof E.flattenTransfers === 'function') return E.flattenTransfers(root, _pages()).root;
        return JSON.parse(JSON.stringify(root));
    }
    var DYN = ['lambda', 'lambdaByPhase', 'repairModel', 'tau', 'mu', 'exposureMode', 'dormancyInterval', 'markovModelId'];
    function _apply(copy, sets) {
        if (!sets || !sets.size) return copy;
        (function w(n) {
            if (!n) return;
            if (n.type !== 'gate' && sets.has(_lid(n))) {
                n.probability = sets.get(_lid(n)) ? 1 : 0; n.inputMode = 'probability';
                DYN.forEach(function (k) { delete n[k]; });
            }
            _kids(n).forEach(w);
        })(copy);
        return copy;
    }
    function _setMap(list) {
        var m = new Map();
        (list || []).forEach(function (s) { if (s && s.lid != null) m.set(String(s.lid), s.state ? 1 : 0); });
        return m;
    }
    function _exact(root) {
        if (typeof exactTopProbability === 'function') return exactTopProbability(root);
        return computeExactProbability(root).prob;
    }
    function exactWith(pageOrRoot, sets) {
        try {
            var c = _copy(pageOrRoot); if (!c) return { p: null, why: 'no tree' };
            var p = _exact(_apply(c, sets instanceof Map ? sets : _setMap(sets)));
            return (typeof p === 'number' && isFinite(p)) ? { p: p } : { p: null, why: 'no value' };
        } catch (e) { return { p: null, why: (e && e.message) || 'the exact engine refused this tree' }; }
    }
    // P( every part true ), a part being a fault tree failing ({ page }) or not failing ({ page, neg: true }), in one
    // decision diagram, so events and common cause the trees share are counted once
    function conjunction(parts, sets) {
        var map = sets instanceof Map ? sets : _setMap(sets);
        if (!parts || !parts.length) return { p: 1 };
        try {
            var kids = parts.map(function (x) {
                var pg = _byId(x.page); if (!pg || !pg.root) throw new Error('heading tree ' + x.page + ' not found');
                var c = _apply(_copy(pg), map);
                return x.neg ? { id: 'cond-not-' + x.page, type: 'gate', gateType: 'NOT', name: 'not', children: [c] } : c;
            });
            var root = kids.length === 1 ? kids[0] : { id: 'cond-and', type: 'gate', gateType: 'AND', name: 'sequence', children: kids };
            var p = _exact(root);
            if (!(typeof p === 'number' && isFinite(p))) return { p: null, why: 'no value' };
            return { p: p };
        } catch (e) { return { p: null, why: (e && e.message) || 'the exact engine refused' }; }
    }

    // ---- every event in the project (for pickers) ---------------------------------------------------------
    function events() {
        var m = new Map();
        _pages().forEach(function (p) {
            if (!p || !p.root || p.integrated) return;
            (function w(n) { if (!n) return; if (n.type !== 'gate' && !m.has(_lid(n))) m.set(_lid(n), { lid: _lid(n), displayId: n.displayId || '', name: n.name || '', page: p.name || p.id }); _kids(n).forEach(w); })(p.root);
        });
        return Array.from(m.values());
    }
    function _eventLabel(lid) { var e = events().find(function (x) { return x.lid === String(lid); }); return e ? ((e.displayId ? e.displayId + ' ' : '') + e.name) : String(lid); }

    // ---- dispatch cases -------------------------------------------------------------------------------------
    function cases() { var pc = _pc(); if (!Array.isArray(pc.dispatchCases)) pc.dispatchCases = []; return pc.dispatchCases; }
    function _mmelItems() { try { var s = _pc().mmel; return (s && Array.isArray(s.items)) ? s.items : []; } catch (_) { return []; } }
    function _mmelEventLid(it) {
        if (!it || !it.beRef) return null;
        var hit = null;
        _pages().forEach(function (p) { if (hit || !p || !p.root) return; (function w(n) { if (!n || hit) return; if (n.type !== 'gate' && (String(n.displayId) === String(it.beRef) || String(n.id) === String(it.beRef) || _lid(n) === String(it.beRef))) hit = _lid(n); _kids(n).forEach(w); })(p.root); });
        return hit;
    }
    function addCase(name, mmelItemId) {
        var nm = String(name || '').trim(); if (!nm) return { ok: false, why: 'Name the dispatch case.' };
        if (cases().some(function (c) { return String(c.name).trim().toLowerCase() === nm.toLowerCase(); })) return { ok: false, why: 'A dispatch case called "' + nm + '" already exists.' };
        var pc = _pc(); pc.dispatchCaseCounter = (pc.dispatchCaseCounter || 0) + 1;
        var c = { id: 'DC-' + String(pc.dispatchCaseCounter).padStart(3, '0'), name: nm, mmelItemId: mmelItemId || '', sets: [] };
        var it = _mmelItems().find(function (x) { return x.id === mmelItemId; });
        var lid = _mmelEventLid(it); if (lid) c.sets.push({ lid: lid, state: 1 });   // the item inoperative: its event has happened
        cases().push(c); _save();
        return { ok: true, case: c };
    }
    function setEvent(caseId, lid, state) { var c = cases().find(function (x) { return x.id === caseId; }); if (!c) return false; var e = c.sets.find(function (s) { return String(s.lid) === String(lid); }); if (e) e.state = state ? 1 : 0; else c.sets.push({ lid: String(lid), state: state ? 1 : 0 }); _save(); return true; }
    function removeEvent(caseId, lid) { var c = cases().find(function (x) { return x.id === caseId; }); if (!c) return false; c.sets = c.sets.filter(function (s) { return String(s.lid) !== String(lid); }); _save(); return true; }
    function removeCase(caseId) { var pc = _pc(); pc.dispatchCases = cases().filter(function (x) { return x.id !== caseId; }); _save(); return true; }
    // every fault tree a set of events reaches (transfers followed), with its worst failure condition
    var SEVR = { Catastrophic: 5, Hazardous: 4, Major: 3, Minor: 2 };
    function _reach(lids) {
        var out = [];
        _pages().forEach(function (p) {
            if (!p || !p.root || p.integrated) return;
            var hit = false, seen = new Set();
            (function w(n) { if (!n || hit || seen.has(n)) return; seen.add(n); if (n.gateType === 'TRANSFER' || n.transferOutTo) { var tp = _byId(n.transferOutTo || n.linkedPageId); if (tp) w(tp.root); } if (n.type !== 'gate' && lids.has(_lid(n))) hit = true; _kids(n).forEach(w); })(p.root);
            if (hit) out.push(p);
        });
        return out;
    }
    function _worstFc(p) {
        var ids = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []), best = null, all = [];
        try { (typeof acFhaData !== 'undefined' ? acFhaData : []).forEach(function (f) { all.push(f); }); (typeof systemsData !== 'undefined' ? systemsData : []).forEach(function (s) { (s.fha || []).forEach(function (f) { all.push(f); }); }); } catch (_) {}
        ids.forEach(function (id) { var f = all.find(function (x) { return x && String(x.internalId) === String(id); }); if (f && (!best || (SEVR[f.severity] || 0) > (SEVR[best.severity] || 0))) best = f; });
        return best;
    }
    function evaluateCase(c) {
        var res = { rows: [], worst: null };
        if (!c || !c.sets || !c.sets.length) return res;
        var map = _setMap(c.sets), lids = new Set(Array.from(map.keys()));
        _reach(lids).forEach(function (p) {
            var fc = _worstFc(p);
            var base = (typeof SLTopBasis !== 'undefined' && SLTopBasis) ? SLTopBasis.exactTop(p.root) : null;
            var d = exactWith(p, map);
            var target = null; try { if (fc && typeof getSafetyTarget === 'function') { var t = getSafetyTarget(fc.severity); if (t && t.prob) target = Number(t.prob); } } catch (_) {}
            var fh = function (v) { return (v != null && typeof SLTopBasis !== 'undefined' && SLTopBasis) ? SLTopBasis.perFlightHour(v, p).rate : null; };
            var row = { page: p, fc: fc, severity: fc ? fc.severity : null, base: base, dispatched: d.p, why: d.why || null, baseRate: fh(base), dispatchedRate: fh(d.p), objective: target };
            row.within = (row.dispatchedRate != null && target != null) ? row.dispatchedRate <= target * (1 + 1e-6) : null;
            res.rows.push(row);
            if (!res.worst || (row.within === false && res.worst.within !== false) || ((row.within === res.worst.within) && (row.dispatchedRate || 0) > (res.worst.dispatchedRate || 0))) res.worst = row;
        });
        return res;
    }
    // the dispatch case for an MMEL item: its own named case if it has one, else its event alone
    function caseForMmel(it) {
        var c = cases().find(function (x) { return x.mmelItemId === it.id; });
        if (c && c.sets.length) return c.sets;
        var lid = _mmelEventLid(it);
        return lid ? [{ lid: lid, state: 1 }] : [];
    }

    // ---- the MMEL page section and the case editor ----------------------------------------------------------
    function _fmt(v) { return (v != null && isFinite(v)) ? Number(v).toExponential(2) : 'no result'; }
    function dispatchHtml() {
        var list = cases(), items = _mmelItems();
        var h = '<div class="sl-dc" data-dc-section style="margin-top:18px;"><h4 style="margin:0 0 6px;">Dispatch cases</h4>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); margin:0 0 8px;">A dispatch case is a configuration the aircraft may fly in: an MMEL item inoperative, and anything its (m) or (o) procedure changes. It sets events to happened or did not happen, and every fault tree they reach is calculated with them. The values stored on the trees are never changed.</p>' +
            '<button type="button" class="btn-cyan" data-dc-add onclick="SLFtaConditions.ui.add()">+ Dispatch case</button>';
        if (!list.length) return h + '<p style="font-size:12px; color:var(--color-text-tertiary);">No dispatch cases yet.</p></div>';
        h += '<table class="data-table" style="width:100%; font-size:12px; margin-top:8px;"><thead><tr><th>Case</th><th>MMEL item</th><th>Events set</th><th>Worst fault tree (per flight hour)</th><th>Objective</th><th></th></tr></thead><tbody>';
        list.forEach(function (c) {
            var it = items.find(function (x) { return x.id === c.mmelItemId; }), ev = evaluateCase(c), w = ev.worst;
            h += '<tr data-dc-row="' + _esc(c.id) + '"><td><b>' + _esc(c.id) + '</b> ' + _esc(c.name) + '</td><td>' + (it ? _esc(it.id + ' ' + it.title) : '<span style="color:var(--color-text-tertiary);">none</span>') + '</td>' +
                '<td style="font-size:11px;">' + (c.sets.length ? c.sets.map(function (s) { return _esc(_eventLabel(s.lid)) + ': <b>' + (s.state ? 'happened' : 'did not happen') + '</b>'; }).join('<br>') : '<span style="color:var(--color-text-tertiary);">none yet</span>') + '</td>' +
                '<td class="u-mono" style="font-size:11px;">' + (w ? _esc(w.page.name || w.page.id) + '<br>' + _fmt(w.baseRate) + ' to ' + (w.dispatched != null ? _fmt(w.dispatchedRate) : 'no result (' + _esc(w.why || '') + ')') : '<span style="color:var(--color-text-tertiary);">reaches no fault tree</span>') + '</td>' +
                '<td style="font-size:11px;">' + (w && w.objective != null ? _fmt(w.objective) + (w.within === true ? ' <span style="color:#1D6E3E;">within</span>' : w.within === false ? ' <span style="color:#8E2A2A; font-weight:700;">exceeds</span>' : '') : '') + '</td>' +
                '<td><button type="button" class="ckpt-m-btn" style="font-size:10.5px; padding:1px 6px;" onclick="SLFtaConditions.openCase(\'' + _esc(c.id) + '\')">Edit</button> <button type="button" class="node-delete-btn-inner" style="font-size:11px;" onclick="SLFtaConditions.ui.remove(\'' + _esc(c.id) + '\')">✕</button></td></tr>';
        });
        return h + '</tbody></table></div>';
    }
    function _rerender() { try { if (typeof renderMmelPage === 'function') renderMmelPage(); } catch (_) {} }
    function close() { var m = document.getElementById('sl-dc-modal'); if (m) m.remove(); }
    // the editor: one case, its MMEL item, its events
    function openCase(caseId) {
        close();
        var c = cases().find(function (x) { return x.id === caseId; }); if (!c) return null;
        var evs = events(), items = _mmelItems();
        var wrap = document.createElement('div');
        wrap.id = 'sl-dc-modal'; wrap.className = 'sl-int-modal';
        function body() {
            var ev = evaluateCase(c);
            return '<div class="sl-int-card sl-xchg-card" role="dialog" aria-modal="true" aria-labelledby="sl-dc-title"><h3 id="sl-dc-title">' + _esc(c.id) + ' ' + _esc(c.name) + '</h3>' +
                '<label class="sl-int-label">MMEL item</label><select data-dc-mmel><option value="">none</option>' + items.map(function (it) { return '<option value="' + _esc(it.id) + '"' + (it.id === c.mmelItemId ? ' selected' : '') + '>' + _esc(it.id + ' ' + it.title) + '</option>'; }).join('') + '</select>' +
                '<label class="sl-int-label">Events this case sets</label>' +
                (c.sets.length ? '<ul class="sl-dc-sets">' + c.sets.map(function (s) { return '<li>' + _esc(_eventLabel(s.lid)) + ': <select data-dc-state="' + _esc(s.lid) + '"><option value="1"' + (s.state ? ' selected' : '') + '>happened</option><option value="0"' + (!s.state ? ' selected' : '') + '>did not happen</option></select> <button type="button" class="action-btn" data-dc-del="' + _esc(s.lid) + '">Remove</button></li>'; }).join('') + '</ul>' : '<p class="sl-int-help">None yet.</p>') +
                '<div style="display:flex; gap:6px; align-items:center;"><input list="sl-dc-evlist" data-dc-pick placeholder="Event ID or name" style="flex:1"><datalist id="sl-dc-evlist">' + evs.map(function (e) { return '<option value="' + _esc(e.displayId || e.lid) + '">' + _esc(e.name + ' (' + e.page + ')') + '</option>'; }).join('') + '</datalist><select data-dc-newstate><option value="1">happened</option><option value="0">did not happen</option></select><button type="button" class="action-btn btn-cyan" data-dc-addev>Add</button></div>' +
                '<div class="sl-int-err" data-dc-err></div>' +
                (ev.rows.length ? '<table class="data-table" style="width:100%; font-size:11.5px; margin-top:8px;"><thead><tr><th>Fault tree</th><th>Condition</th><th>Now /FH</th><th>In this case /FH</th><th>Objective</th></tr></thead><tbody>' + ev.rows.map(function (r) { return '<tr><td>' + _esc(r.page.name || r.page.id) + '</td><td>' + _esc(r.fc ? (r.fc.fcId + ' ' + r.fc.severity) : 'none') + '</td><td class="u-mono">' + _fmt(r.baseRate) + '</td><td class="u-mono">' + (r.dispatched != null ? _fmt(r.dispatchedRate) : 'no result') + '</td><td class="u-mono">' + (r.objective != null ? _fmt(r.objective) + (r.within === false ? ' exceeds' : r.within ? ' within' : '') : '') + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
                '<div class="sl-int-actions"><button type="button" class="action-btn" data-dc-close>Done</button></div></div>';
        }
        function wire() {
            wrap.innerHTML = body();
            wrap.querySelector('[data-dc-close]').onclick = function () { close(); _rerender(); };
            wrap.querySelector('[data-dc-mmel]').onchange = function (e) { c.mmelItemId = e.target.value; _save(); wire(); };
            wrap.querySelectorAll('[data-dc-state]').forEach(function (s) { s.onchange = function () { setEvent(c.id, s.getAttribute('data-dc-state'), s.value === '1'); wire(); }; });
            wrap.querySelectorAll('[data-dc-del]').forEach(function (b) { b.onclick = function () { removeEvent(c.id, b.getAttribute('data-dc-del')); wire(); }; });
            wrap.querySelector('[data-dc-addev]').onclick = function () {
                var q = String(wrap.querySelector('[data-dc-pick]').value || '').trim().toLowerCase();
                var e = evs.find(function (x) { return String(x.displayId).toLowerCase() === q || x.lid.toLowerCase() === q; }) || evs.find(function (x) { return String(x.name).toLowerCase() === q; });
                if (!e) { wrap.querySelector('[data-dc-err]').textContent = 'No event "' + q + '" in this project.'; return; }
                setEvent(c.id, e.lid, wrap.querySelector('[data-dc-newstate]').value === '1'); wire();
            };
        }
        document.body.appendChild(wrap); wire();
        wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); _rerender(); } });
        return wrap;
    }
    var ui = {
        add: function () {
            var go = function (name) { if (name == null) return; var r = addCase(name, ''); if (!r.ok) { _toast(r.why, 'warning'); return; } _rerender(); openCase(r.case.id); };
            return slPrompt('Name the dispatch case (for example: Generator 1 inoperative):', '', { title: 'New dispatch case', okText: 'Create' }).then(go);
        },
        remove: function (id) {
            var go = function (ok) { if (!ok) return; removeCase(id); _rerender(); };
            return slConfirm('Remove this dispatch case?', { danger: true, okText: 'Remove' }).then(go);
        }
    };

    var api = { VERSION: VERSION, exactWith: exactWith, conjunction: conjunction, events: events, cases: cases, addCase: addCase, setEvent: setEvent, removeEvent: removeEvent, removeCase: removeCase, evaluateCase: evaluateCase, caseForMmel: caseForMmel, mmelEventLid: _mmelEventLid, dispatchHtml: dispatchHtml, openCase: openCase, close: close, ui: ui, eventLabel: _eventLabel };
    try { if (typeof window !== 'undefined') window.SLFtaConditions = api; } catch (_) {}
})();

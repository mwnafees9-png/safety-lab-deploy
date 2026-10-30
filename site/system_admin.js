// ============================================================================
// system_admin.js — v1.0 — RENAME, EDIT AND REMOVE A SYSTEM.
//
// Waqas, 30 Oct 2026: "we have add a system option in our drop down, we currently do not have a
// remove/rename/update the system option". His rulings:
//   · rename / edit: the system keeps its hidden id, so everything tied to it stays attached and only
//     the name changes, everywhere at once; a name another system already has is refused (no_dupes.js);
//   · remove: show everything inside it and everything elsewhere that links to it, confirm by typing the
//     system's name, and it can be undone (the apply functions are undo targets, data_ops_modules
//     _UNDO_TARGETS, so the change acknowledgement and Undo see them like any other edit).
//
// What a removal takes with it: the system and everything inside it (functions, FCIM, FHA, requirements,
// assumptions); the rows elsewhere that BELONG to it (items, FMEA rows and fault tree pages it owns);
// and every LINK to it from elsewhere (an interface or a resource link that names it, its id in a list).
// The rows that only pointed at it lose the pointer, not themselves. Everything is listed before the
// person confirms. impactOf / removeFrom are pure over a { storeName: value } map, so they are tested
// without a browser.
// ============================================================================
(function () {
    'use strict';

    function S(v) { return String(v == null ? '' : v).trim(); }
    // A key that says "this row belongs to that system": the row goes with the system.
    var OWNER_KEYS = { owningSystemId: 1, systemId: 1, sysId: 1, ownerSystemId: 1 };
    // A key that says "this row links to that system": the link goes, the row's other end is untouched.
    var LINK_KEYS = { fromSystemId: 1, toSystemId: 1, providerSystemId: 1, consumerSystemId: 1, targetSystemId: 1, sourceSystemId: 1 };
    var SKIP_STORES = { systemsData: 1, esc: 1, SEVERITY_RANK: 1, AutoReq: 1, activeSystemId: 1, selectedNodeData: 1, internalIdCounter: 1 };
    var LABELS = { itemsData: 'items', fmeaData: 'FMEA rows', ftaPages: 'fault tree pages', resourcesData: 'resource links', projectConfig: 'project settings',
                   praData: 'particular risk rows', zsaData: 'zonal rows', cmaData: 'common mode rows', routingData: 'routing rows', acFhaData: 'aircraft FHA rows',
                   acFunctionsData: 'aircraft functions', acReqData: 'aircraft requirements' };
    function labelOf(store, path) {
        var tail = path.length ? path[path.length - 1] : '';
        if (store === 'projectConfig' && tail) return 'project ' + String(tail).replace(/([A-Z])/g, ' $1').toLowerCase().trim();
        return LABELS[store] || store;
    }

    // Walk a store and report every place the system appears.
    function _walk(val, sysId, path, out, depth) {
        if (depth > 7 || val == null || typeof val !== 'object') return;
        if (Array.isArray(val)) {
            for (var i = 0; i < val.length; i++) {
                var el = val[i];
                if (typeof el === 'string') { if (el === sysId) out.push({ kind: 'listed', arr: val, value: el, path: path }); continue; }
                if (!el || typeof el !== 'object') continue;
                var own = Object.keys(el).find(function (k) { return OWNER_KEYS[k] && S(el[k]) === sysId; });
                var link = Object.keys(el).find(function (k) { return LINK_KEYS[k] && S(el[k]) === sysId; });
                // a fault tree page that is the system's own (its scope names it)
                var pageOwn = (el.scope && (S(el.scope) === 'sys-' + sysId || S(el.scope) === sysId)) ? 'scope' : null;
                if (own || pageOwn) { out.push({ kind: 'owned', arr: val, row: el, key: own || pageOwn, path: path }); continue; }
                if (link) { out.push({ kind: 'link', arr: val, row: el, key: link, path: path }); continue; }
                _walk(el, sysId, path, out, depth + 1);
            }
            return;
        }
        Object.keys(val).forEach(function (k) {
            var v = val[k];
            if (LINK_KEYS[k] && S(v) === sysId) { out.push({ kind: 'field', obj: val, key: k, path: path.concat([k]) }); return; }
            if (OWNER_KEYS[k] && S(v) === sysId) { out.push({ kind: 'field', obj: val, key: k, path: path.concat([k]) }); return; }
            // any other single field that names it by id (lastSystemId, defaultSystemId ...) is cleared, never left dangling
            if (/systemid$/i.test(k) && typeof v === 'string' && S(v) === sysId) { out.push({ kind: 'field', obj: val, key: k, path: path.concat([k]) }); return; }
            if (v && typeof v === 'object') _walk(v, sysId, path.concat([k]), out, depth + 1);
        });
    }
    function impactOf(sys, stores) {
        var sysId = S(sys && sys.id);
        var inside = {
            functions: ((sys && sys.functions) || []).length, fcim: ((sys && sys.fcim) || []).length, fha: ((sys && sys.fha) || []).length,
            requirements: ((sys && sys.req) || []).length, assumptions: ((sys && sys.asm) || []).length
        };
        var hits = [];
        Object.keys(stores || {}).forEach(function (name) {
            if (SKIP_STORES[name]) return;
            var v = stores[name];
            if (!v || typeof v !== 'object') return;
            var found = [];
            _walk(v, sysId, [], found, 0);
            found.forEach(function (h) { h.store = name; hits.push(h); });
        });
        // grouped for the person: what goes with it, what loses its link
        var groups = {};
        hits.forEach(function (h) {
            var g = (h.kind === 'owned') ? 'removed' : 'unlinked';
            var key = g + '|' + labelOf(h.store, h.path);
            (groups[key] = groups[key] || { what: g, label: labelOf(h.store, h.path), n: 0 }).n++;
        });
        return { inside: inside, hits: hits, groups: Object.keys(groups).map(function (k) { return groups[k]; }) };
    }
    function summaryText(sys, imp) {
        var lines = [], i = imp.inside;
        var inside = [['functions', i.functions], ['FCIM rows', i.fcim], ['FHA rows', i.fha], ['requirements', i.requirements], ['assumptions', i.assumptions]]
            .filter(function (x) { return x[1]; }).map(function (x) { return x[1] + ' ' + x[0]; });
        lines.push('Inside it: ' + (inside.length ? inside.join(', ') : 'nothing yet') + '.');
        var gone = imp.groups.filter(function (g) { return g.what === 'removed'; }).map(function (g) { return g.n + ' ' + g.label; });
        var unl = imp.groups.filter(function (g) { return g.what === 'unlinked'; }).map(function (g) { return g.n + ' ' + g.label; });
        if (gone.length) lines.push('Belongs to it elsewhere, removed with it: ' + gone.join(', ') + '.');
        if (unl.length) lines.push('Links to it from elsewhere, taken off (the other rows stay): ' + unl.join(', ') + '.');
        if (!gone.length && !unl.length) lines.push('Nothing elsewhere links to it.');
        return lines.join('\n');
    }
    // Take the system out of every store. Rows that belong to it go; links to it go; nothing else changes.
    function removeFrom(sys, stores, systems) {
        var imp = impactOf(sys, stores), n = { owned: 0, links: 0 };
        // owned rows and link rows leave their arrays (each array spliced once per row, last first)
        var byArr = new Map();
        imp.hits.forEach(function (h) {
            if (h.kind === 'owned' || h.kind === 'link') { if (!byArr.has(h.arr)) byArr.set(h.arr, []); byArr.get(h.arr).push(h); }
        });
        byArr.forEach(function (list, arr) {
            list.forEach(function (h) { var at = arr.indexOf(h.row); if (at >= 0) { arr.splice(at, 1); if (h.kind === 'owned') n.owned++; else n.links++; } });
        });
        imp.hits.forEach(function (h) {
            if (h.kind === 'listed') { var at = h.arr.indexOf(h.value); while (at >= 0) { h.arr.splice(at, 1); n.links++; at = h.arr.indexOf(h.value); } }
            else if (h.kind === 'field') { delete h.obj[h.key]; n.links++; }
        });
        var si = (systems || []).indexOf(sys);
        if (si >= 0) systems.splice(si, 1);
        return n;
    }

    // ------------------------------------------------------------------ the app
    function _env(name) { try { return (window.SLEnv && typeof window.SLEnv.get === 'function') ? window.SLEnv.get(name) : undefined; } catch (_) { return undefined; } }
    function _stores() {
        var out = {};
        try { (window.SLEnv && window.SLEnv.NAMES || []).forEach(function (n) { if (!SKIP_STORES[n]) { var v = _env(n); if (v && typeof v === 'object') out[n] = v; } }); } catch (_) {}
        return out;
    }
    function _sysById(id) { var list = _env('systemsData') || []; return list.find(function (s) { return s && String(s.id) === String(id); }) || null; }
    function _refresh() {
        try { if (typeof window.renderSystemDirectory === 'function') window.renderSystemDirectory(); } catch (_) {}
        try { if (typeof window._renderSidebarContext === 'function') window._renderSidebarContext(); } catch (_) {}
        try { if (window.SL_NAV && typeof window.SL_NAV.renderSystemDirs === 'function') window.SL_NAV.renderSystemDirs(); } catch (_) {}   // the live menu (nav_rail)
        try { var t = document.getElementById('ws-sys-title'), s = _sysById(_env('activeSystemId')); if (t && s) t.textContent = s.name + ' · SFHA'; } catch (_) {}
    }
    function _say(msg, kind) { try { if (typeof window.showToast === 'function') window.showToast(msg, kind || 'info', 4500); } catch (_) {} }

    // The undo targets: one synchronous change each, so Undo and the change acknowledgement see exactly it.
    function applySystemEdit(sysId, name, role) {
        var s = _sysById(sysId); if (!s) return { ok: false, reason: 'That system is no longer in the project.' };
        var nm = S(name);
        if (!nm) return { ok: false, reason: 'A system needs a name.' };
        var clash = window.SLNoDupes ? window.SLNoDupes.systemNameClash(nm, _env('systemsData') || [], s.id) : null;
        if (clash) return { ok: false, reason: clash.reason };
        var was = s.name;
        s.name = nm;
        if (role === 'function' || role === 'resource' || role === 'both') s.role = role;
        _refresh();
        return { ok: true, was: was };
    }
    function applySystemRemove(sysId) {
        var s = _sysById(sysId); if (!s) return { ok: false, reason: 'That system is no longer in the project.' };
        var n = removeFrom(s, _stores(), _env('systemsData'));
        try { if (String(_env('activeSystemId')) === String(sysId) && typeof window.switchTab === 'function') window.switchTab('sys-dir'); } catch (_) {}
        _refresh();
        return { ok: true, n: n, name: s.name };
    }

    // The dialogs.
    async function editSystem(sysId) {
        var s = _sysById(sysId); if (!s) return;
        var name = await window.slPrompt('Rename the system. Everything in it stays attached; only the name changes, everywhere it shows.', s.name, { title: 'Rename or edit system', okText: 'Next' });
        if (name == null) return;
        if (!S(name)) { await window.slAlert('A system needs a name. Nothing was changed.'); return; }
        var clash = window.SLNoDupes ? window.SLNoDupes.systemNameClash(name, _env('systemsData') || [], s.id) : null;
        if (clash) { await window.slAlert(clash.reason + ' Nothing was changed.'); return; }
        var cur = s.role || 'function';
        var roleIn = await window.slPrompt('System role: function, resource or both.\n\n• function: implements aircraft functions\n• resource: provides a common resource (electrical, hydraulic, IMA and the like)\n• both: does both', cur, { title: 'Rename or edit system', okText: 'Save' });
        if (roleIn == null) return;
        var role = /^r/i.test(roleIn) ? 'resource' : /^b/i.test(roleIn) ? 'both' : 'function';
        var r = window.applySystemEdit(s.id, name, role);
        if (!r.ok) { await window.slAlert(r.reason); return; }
        _say(r.was !== S(name) ? ('"' + r.was + '" is now "' + S(name) + '".') : ('Saved ' + S(name) + '.'), 'success');
    }
    async function removeSystem(sysId) {
        var s = _sysById(sysId); if (!s) return;
        var imp = impactOf(s, _stores());
        var typed = await window.slPrompt('Remove "' + s.name + '"?\n\n' + summaryText(s, imp) + '\n\nYou can undo this. To remove it, type the system\'s name:', '', { title: 'Remove system', okText: 'Remove system' });
        if (typed == null) return;
        var N = window.SLNoDupes;
        if ((N ? N.norm(typed) : S(typed).toLowerCase()) !== (N ? N.norm(s.name) : S(s.name).toLowerCase())) { await window.slAlert('The name did not match, so nothing was removed.'); return; }
        var r = window.applySystemRemove(s.id);
        if (!r.ok) { await window.slAlert(r.reason); return; }
        _say('"' + r.name + '" was removed. Undo brings it back.', 'success');
    }

    var API = { VERSION: '1.0', impactOf: impactOf, summaryText: summaryText, removeFrom: removeFrom, OWNER_KEYS: OWNER_KEYS, LINK_KEYS: LINK_KEYS };
    if (typeof window !== 'undefined') {
        window.SLSystemAdmin = API;
        window.applySystemEdit = applySystemEdit;
        window.applySystemRemove = applySystemRemove;
        window.editSystem = editSystem;
        window.removeSystem = removeSystem;
    }
    if (typeof module !== 'undefined') module.exports = API;
})();

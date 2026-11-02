/* type_codes.js v1.0 (2 Nov 2026): type codes, your own part types (customer checklist item 29).
 *
 * Waqas, 2 Nov 2026: "go ahead on item 50, and 29 and 48", on the agreed mockup: one table of the program's own part types
 * (FCC flight control computer, ACT-E electrohydraulic actuator, MON command monitor). Each type carries a failure rate and
 * a model (exposure, or latent with its inspection interval). Every basic event of a type takes its numbers from the table:
 * change the type once and every event of it follows. ANEM can point out events that look like the same part type; it never
 * types a rate.
 *
 *   projectConfig.typeCodes  [{ code, name, lambda, model: 'exposure'|'latent', interval, srcKind, srcRef, srcDate }]
 *   a basic event of a type: node.inputMode 'typecode', node.typeCode = the code; its lambda, inputValue, repairModel
 *   ('unmaintained' for exposure, 'periodic' with tau = interval for latent) are set from the type (apply/refresh).
 *   A type in use cannot be removed (its events would lose their numbers); a renamed code moves its events with it.
 *   The type's source (supplier, field data, calculated, library, judgment) is the source of every event of it
 *   (rate_sources.js), so a type with no source shows "no source" on each event, like any other rate.
 * Run the test: node tests/regression_type_codes_20261102.test.js
 */
(function (root) {
    'use strict';
    function S(v) { return String(v == null ? '' : v).trim(); }
    function E(v) { return S(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function JQ(v) { return E(JSON.stringify(String(v))); }
    var CODE_RE = /^[A-Z][A-Z0-9-]{0,15}$/;
    var KINDS = { supplier: 'Supplier guarantee', field: 'Field data', calculated: 'Calculated', library: 'Library entry', judgment: 'Engineering judgment' };
    function _cfg() { try { if (typeof projectConfig !== 'undefined') return projectConfig; } catch (_) {} return root.projectConfig || null; }
    function list() { var c = _cfg(); if (!c) return []; if (!Array.isArray(c.typeCodes)) c.typeCodes = []; return c.typeCodes; }
    function get(code) { code = S(code); return list().find(function (t) { return t.code === code; }) || null; }
    function _pages() { try { if (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) return ftaPages; } catch (_) {} return []; }
    function _walk(fn) { _pages().forEach(function (p) { (function w(n) { if (!n) return; fn(n, p); ((n.children || n._children) || []).forEach(w); })(p && p.root); }); }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _fmt(v) { var n = Number(v); return (n > 0 && isFinite(n)) ? n.toExponential(2).toUpperCase() : ''; }
    function used(code) { var n = 0; _walk(function (x) { if (x.inputMode === 'typecode' && x.typeCode === code) n++; }); return n; }

    function validate(rec, oldCode) {
        var code = S(rec.code).toUpperCase();
        if (!CODE_RE.test(code)) return { ok: false, why: 'a code starts with a capital letter and uses only capital letters, digits and hyphens (up to 16)' };
        if (code !== oldCode && get(code)) return { ok: false, why: 'the code ' + code + ' is already in the table' };
        var name = S(rec.name); if (!name) return { ok: false, why: 'say what part type the code stands for' };
        var lam = Number(rec.lambda);
        if (!(lam >= 0) || !isFinite(lam) || S(rec.lambda) === '') return { ok: false, why: 'the failure rate must be a number, 0 or more, per flight hour' };
        var model = rec.model === 'latent' ? 'latent' : 'exposure';
        var interval = Number(rec.interval);
        if (model === 'latent' && !(interval > 0)) return { ok: false, why: 'a latent type needs its inspection interval in flight hours' };
        var kind = S(rec.srcKind); if (kind && !KINDS[kind]) kind = '';
        return { ok: true, rec: { code: code, name: name, lambda: lam, model: model, interval: model === 'latent' ? interval : null, srcKind: kind, srcRef: S(rec.srcRef), srcDate: S(rec.srcDate) } };
    }
    function upsert(rec, oldCode) {
        oldCode = S(oldCode);
        var v = validate(rec, oldCode); if (!v.ok) return v;
        var L = list(), i = oldCode ? L.findIndex(function (t) { return t.code === oldCode; }) : -1;
        if (i >= 0) L[i] = v.rec; else L.push(v.rec);
        if (oldCode && oldCode !== v.rec.code) _walk(function (n) { if (n.typeCode === oldCode) n.typeCode = v.rec.code; });
        refresh(); _save();
        return { ok: true, rec: v.rec };
    }
    function remove(code) {
        var n = used(code); if (n) return { ok: false, why: n + ' basic event' + (n === 1 ? ' uses' : 's use') + ' this type: give ' + (n === 1 ? 'it' : 'them') + ' another type or another rate first' };
        var L = list(), i = L.findIndex(function (t) { return t.code === code; }); if (i >= 0) L.splice(i, 1);
        _save(); return { ok: true };
    }
    // a basic event takes its numbers from its type
    function apply(n) {
        var t = get(n && n.typeCode); if (!t) return false;
        n.lambda = Number(t.lambda) || 0; n.inputValue = n.lambda;
        if (t.model === 'latent') { n.repairModel = 'periodic'; n.tau = Number(t.interval) || 0; }
        else { n.repairModel = 'unmaintained'; }
        return true;
    }
    function lambdaFor(code) { var t = get(code); return t ? (Number(t.lambda) || 0) : 0; }
    function assign(n, code) {
        if (!n || n.type !== 'basic' || !get(code)) return false;
        n.inputMode = 'typecode'; n.typeCode = S(code); apply(n);
        return true;
    }
    function unassign(n) { if (!n) return; delete n.typeCode; n.inputMode = 'lambda'; n.inputValue = n.lambda || 0; }
    function refresh() {
        _walk(function (n) { if (n.inputMode === 'typecode') apply(n); });
        try { if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities(); } catch (_) {}
        try { if (typeof updateD3 === 'function') updateD3(); } catch (_) {}
    }
    // the source of an event of a type (rate_sources.js)
    function sourceFor(n) {
        var t = get(n && n.typeCode); if (!t || !t.srcKind || !KINDS[t.srcKind]) return null;
        return { kind: t.srcKind, ref: 'Type ' + t.code + (t.srcRef ? ': ' + t.srcRef : ''), date: t.srcDate || '' };
    }

    // ---- ANEM: events that look like the same part type (never a rate) ----
    function _itemName(n) {
        try { var l = (n.modelLinks || {}).item || n.itemRef || n.item; if (!l) return ''; var it = (typeof itemsData !== 'undefined' ? itemsData : []).find(function (x) { return x && (String(x.itemId) === String(l) || String(x.internalId) === String(l)); }); return it ? (it.name || '') : ''; } catch (_) { return ''; }
    }
    function factsForAnem() {
        var seen = {}, events = [];
        _walk(function (n, p) {
            if (n.type !== 'basic' || n.inputMode === 'typecode' || n.eventClass === 'dev-error' || n.devError || n.externalSource || n.transferIn) return;
            if (p && p.integrated && p.integrated.sourcePageId != null) return;
            var k = S(n.logicalId != null && n.logicalId !== '' ? n.logicalId : n.id); if (seen[k]) return; seen[k] = 1;
            events.push({ id: String(n.id), name: S(n.name), item: _itemName(n) || undefined });
        });
        return { events: events, codes: list().map(function (t) { return { code: t.code, type: t.name }; }) };
    }
    function _findNode(id) { var hit = null; _walk(function (n) { if (!hit && String(n.id) === String(id)) hit = n; }); return hit; }
    function checkGroup(g, asked) {
        if (!g) return { ok: false };
        var code = S(g.code).toUpperCase(); if (!CODE_RE.test(code)) return { ok: false, why: 'bad code' };
        var existing = !!get(code), type = S(g.type).slice(0, 80);
        if (!existing && !type) return { ok: false, why: 'no part type' };
        var ev = [], seen = {};
        (Array.isArray(g.events) ? g.events : []).forEach(function (id) { id = String(id); if (asked[id] && !seen[id] && _findNode(id)) { seen[id] = 1; ev.push(id); } });
        if (ev.length < (existing ? 1 : 2)) return { ok: false, why: 'too few events' };
        return { ok: true, group: { code: code, type: existing ? get(code).name : type, isNew: !existing, events: ev, why: S(g.why).slice(0, 200) } };
    }

    // ---- the dialog ----
    var _pending = [], _editing = null, _afterSave = null, _busy = false;
    function _modelText(t) { return t.model === 'latent' ? 'Latent, every ' + t.interval + ' FH' : 'Exposure'; }
    function _html() {
        var L = list();
        var h = '<div role="dialog" aria-label="Type codes" style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#101216);border-radius:12px;max-width:980px;width:calc(100% - 32px);max-height:90vh;overflow:auto;padding:18px 20px;">' +
            '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;"><h3 style="margin:0;font-size:16px;">Type codes: your own part types</h3><button type="button" class="action-btn" onclick="SLTypeCodes.ui.close()">Close</button></div>' +
            '<div style="font-size:12.5px;margin:6px 0 10px;">Events of one type share its failure rate and model. Change a type here and every event of it follows.</div>' +
            '<table class="data-table" style="width:100%;font-size:12.5px;"><thead><tr><th style="width:90px;">Code</th><th>Part type</th><th style="width:90px;">λ / h</th><th style="width:140px;">Model</th><th>Source</th><th style="width:50px;">Used</th><th style="width:130px;"></th></tr></thead><tbody>' +
            (L.length ? L.map(function (t) {
                return '<tr><td class="u-mono">' + E(t.code) + '</td><td>' + E(t.name) + '</td><td class="u-mono">' + E(_fmt(t.lambda) || '0') + '</td><td>' + E(_modelText(t)) + '</td><td>' + (t.srcKind ? E(KINDS[t.srcKind]) + (t.srcRef ? ': ' + E(t.srcRef) : '') : '<span style="color:#9A6200;font-weight:600;">No source</span>') + '</td><td>' + used(t.code) + '</td>' +
                    '<td><div style="display:flex;gap:4px;"><button type="button" class="action-btn" style="font-size:11px;" onclick="SLTypeCodes.ui.edit(' + JQ(t.code) + ')">Edit</button><button type="button" class="action-btn" style="font-size:11px;" onclick="SLTypeCodes.ui.remove(' + JQ(t.code) + ')">Remove</button></div></td></tr>';
            }).join('') : '<tr><td colspan="7">No type codes yet.</td></tr>') + '</tbody></table>';
        var t = _editing || {};
        h += '<div style="border:1px solid var(--color-border-hair);border-radius:8px;padding:10px 12px;margin-top:10px;"><div style="font-weight:600;font-size:13px;margin-bottom:6px;">' + (_editing && _editing._old ? 'Edit ' + E(_editing._old) : 'Add a type code') + (_afterSave ? ' (then ' + _afterSave.events.length + ' event' + (_afterSave.events.length === 1 ? '' : 's') + ' take it)' : '') + '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;">' +
            '<div><label style="font-size:12px;">Code</label><input type="text" id="tc-code" value="' + E(t.code) + '" placeholder="FCC" style="margin:0;"></div>' +
            '<div style="grid-column:span 2;"><label style="font-size:12px;">Part type</label><input type="text" id="tc-name" value="' + E(t.name) + '" placeholder="Flight control computer" style="margin:0;"></div>' +
            '<div><label style="font-size:12px;">λ per flight hour</label><input type="number" step="any" min="0" id="tc-lambda" value="' + E(t.lambda != null ? t.lambda : '') + '" placeholder="2.5e-5" style="margin:0;"></div>' +
            '<div><label style="font-size:12px;">Model</label><select id="tc-model" style="margin:0;" onchange="SLTypeCodes.ui.modelChanged()"><option value="exposure"' + (t.model !== 'latent' ? ' selected' : '') + '>Exposure</option><option value="latent"' + (t.model === 'latent' ? ' selected' : '') + '>Latent (inspected)</option></select></div>' +
            '<div id="tc-interval-wrap" style="' + (t.model === 'latent' ? '' : 'display:none;') + '"><label style="font-size:12px;">Interval (FH)</label><input type="number" min="0" step="any" id="tc-interval" value="' + E(t.interval || '') + '" style="margin:0;"></div>' +
            '<div><label style="font-size:12px;">Source</label><select id="tc-srckind" style="margin:0;"><option value="">No source yet</option>' + Object.keys(KINDS).map(function (k) { return '<option value="' + k + '"' + (t.srcKind === k ? ' selected' : '') + '>' + E(KINDS[k]) + '</option>'; }).join('') + '</select></div>' +
            '<div style="grid-column:span 2;"><label style="font-size:12px;">Reference</label><input type="text" id="tc-srcref" value="' + E(t.srcRef) + '" placeholder="Document, data set or library entry" style="margin:0;"></div>' +
            '<div><label style="font-size:12px;">Date of the data</label><input type="date" id="tc-srcdate" value="' + E(t.srcDate) + '" style="margin:0;"></div></div>' +
            '<div style="display:flex;justify-content:flex-end;gap:6px;margin-top:8px;">' + (_editing ? '<button type="button" class="action-btn" onclick="SLTypeCodes.ui.cancel()">Cancel</button>' : '') + '<button type="button" class="action-btn btn-cyan" onclick="SLTypeCodes.ui.save()">' + (_editing && _editing._old ? 'Save' : 'Add type code') + '</button></div></div>';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;"><div style="font-size:12.5px;">ANEM can find basic events that look like the same part type. It never types a rate.</div>' +
            '<button type="button" class="action-btn" onclick="SLTypeCodes.ui.group()"' + (_busy ? ' disabled' : '') + '>' + (_busy ? 'ANEM is looking…' : 'Group events into types with ANEM') + '</button></div>';
        if (_pending.length) {
            h += '<table class="data-table" style="width:100%;font-size:12.5px;margin-top:8px;"><thead><tr><th>Type</th><th>Events</th><th style="width:200px;"></th></tr></thead><tbody>' +
                _pending.map(function (g, i) {
                    var names = g.events.map(function (id) { var n = _findNode(id); return n ? (n.displayId ? n.displayId + ' ' : '') + (n.name || '') + (g.isNew ? '' : ' (' + (_fmt(n.lambda) || '0') + ' → ' + (_fmt(lambdaFor(g.code)) || '0') + ')') : id; });
                    return '<tr style="background:rgba(107,79,216,.05);outline:1.5px dashed rgba(107,79,216,.55);outline-offset:-2px;"><td><span style="display:inline-block;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;background:rgba(107,79,216,.12);color:#4B33B0;">ANEM</span> <span class="u-mono">' + E(g.code) + '</span> ' + E(g.type) + (g.isNew ? ' <span style="font-size:11px;">(new: needs its rate)</span>' : '') + (g.why ? '<div style="font-size:11px;margin-top:3px;">' + E(g.why) + '</div>' : '') + '</td><td>' + names.map(E).join('<br>') + '</td>' +
                        '<td><div style="display:flex;gap:6px;"><button type="button" class="action-btn btn-cyan" style="font-size:11px;" onclick="SLTypeCodes.ui.accept(' + i + ')">' + (g.isNew ? 'Add the type' : 'Give them this type') + '</button><button type="button" class="action-btn" style="font-size:11px;" onclick="SLTypeCodes.ui.discard(' + i + ')">Discard</button></div></td></tr>';
                }).join('') + '</tbody></table>';
        }
        return h + '</div>';
    }
    function _paint() {
        var d = root.document; if (!d) return;
        var ov = d.getElementById('type-codes-modal');
        if (!ov) { ov = d.createElement('div'); ov.id = 'type-codes-modal'; ov.setAttribute('style', 'position:fixed;inset:0;background:rgba(10,12,16,.45);z-index:10050;display:flex;align-items:center;justify-content:center;'); ov.addEventListener('mousedown', function (e) { if (e.target === ov) ov.remove(); }); d.body.appendChild(ov); }
        ov.innerHTML = _html();
    }
    function _toast(m, k, ms) { try { if (typeof showToast === 'function') showToast(m, k || 'info', ms || 5000); } catch (_) {} }
    function _form() { var d = root.document, v = function (id) { var el = d.getElementById(id); return el ? el.value : ''; };
        return { code: v('tc-code'), name: v('tc-name'), lambda: v('tc-lambda'), model: v('tc-model'), interval: v('tc-interval'), srcKind: v('tc-srckind'), srcRef: v('tc-srcref'), srcDate: v('tc-srcdate') }; }
    var ui = {
        open: function () { _paint(); },
        close: function () { var o = root.document && root.document.getElementById('type-codes-modal'); if (o) o.remove(); },
        edit: function (code) { var t = get(code); if (!t) return; _editing = Object.assign({ _old: code }, t); _afterSave = null; _paint(); },
        cancel: function () { _editing = null; _afterSave = null; _paint(); },
        modelChanged: function () { var d = root.document, w = d.getElementById('tc-interval-wrap'); if (w) w.style.display = d.getElementById('tc-model').value === 'latent' ? '' : 'none'; },
        save: function () {
            var r = upsert(_form(), _editing && _editing._old);
            if (!r.ok) { _toast('Not saved: ' + r.why + '.', 'warning', 6000); return; }
            if (_afterSave) { var code = r.rec.code; _afterSave.events.forEach(function (id) { var n = _findNode(id); if (n) assign(n, code); }); refresh(); _afterSave = null; }
            _editing = null; _paint();
        },
        remove: function (code) { var r = remove(code); if (!r.ok) _toast('Not removed: ' + r.why + '.', 'warning', 6000); _paint(); },
        group: async function () {
            if (_busy) return;
            var AI = root.SafetyLabAI;
            if (!AI || typeof AI.typeGroup !== 'function') { if (typeof root.slLoadAI === 'function') { try { await root.slLoadAI(); } catch (_) {} } AI = root.SafetyLabAI; }
            if (!AI || typeof AI.typeGroup !== 'function') { _toast('ANEM is not available here.', 'warning'); return; }
            _busy = true; _paint();
            var r; try { r = await AI.typeGroup(); } finally { _busy = false; }
            if (!r || !r.ok) { _toast((r && r.why) || 'ANEM did not answer.', 'info'); _paint(); return; }
            _pending = r.groups.slice(); _paint();
        },
        accept: function (i) {
            var g = _pending[i]; if (!g) return;
            if (g.isNew && !get(g.code)) { _editing = { code: g.code, name: g.type }; _afterSave = { events: g.events.slice() }; _pending.splice(i, 1); _paint(); return; }
            g.events.forEach(function (id) { var n = _findNode(id); if (n) assign(n, g.code); });
            refresh(); _save(); _pending.splice(i, 1); _paint();
        },
        discard: function (i) { _pending.splice(i, 1); _paint(); }
    };

    root.SLTypeCodes = { VERSION: '1.0', CODE_RE: CODE_RE, KINDS: KINDS, list: list, get: get, used: used, validate: validate, upsert: upsert, remove: remove,
        apply: apply, lambdaFor: lambdaFor, assign: assign, unassign: unassign, refresh: refresh, sourceFor: sourceFor, factsForAnem: factsForAnem, checkGroup: checkGroup,
        ui: ui, _pending: function () { return _pending; } };
})(typeof window !== 'undefined' ? window : globalThis);

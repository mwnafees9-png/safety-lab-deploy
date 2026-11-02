/* rate_sources.js v1.0 (31 Oct 2026): every failure rate names its source (customer checklist item 16).
 *
 * A basic event's failure rate (or probability) is a number the analysis rests on, so it says where it comes from:
 *   Supplier guarantee · Field data · Calculated (parts count or stress) · Library entry · Engineering judgment
 * with the reference (a document, a data set, the library entry) and the date of the data. An event set from the
 * component library cites its entry by itself. An event fed from another tree or a failure condition takes its number
 * from there, and so needs no source of its own.
 *   - the properties panel has a Source row for the selected event;
 *   - "Failure rate sources" lists every event with its rate, source and reference, and exports it;
 *   - an event with a rate and no source shows on the canvas warning pill (helpers_modules ftaNodeWarnings);
 *   - the SSA report carries the table (reports.js, rate_sources_table).
 * ANEM only finds a library entry that matches an event (SafetyLabAI.rateMatch); it never types a rate, and a match is
 * applied only when the engineer accepts it: "Cite it" keeps the typed rate and cites the entry as its basis, "Use the
 * library rate" sets the event from the entry.
 */
(function (root) {
    'use strict';
    var VERSION = '1.0';
    var KINDS = { supplier: 'Supplier guarantee', field: 'Field data', calculated: 'Calculated (parts count or stress)', library: 'Library entry', judgment: 'Engineering judgment' };
    function S(v) { return String(v == null ? '' : v); }
    function E(v) { return S(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _pages() { try { if (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) return ftaPages.filter(function (p) { return !(p && p.integrated && p.integrated.sourcePageId != null); }); } catch (_) {} return []; }   // 1 Nov 2026 (item 42): an integrated tree is a view of its sources, never counted again (fta_integrated.js)
    function _lib() { try { if (typeof COMPONENT_LIBRARY !== 'undefined') return COMPONENT_LIBRARY; } catch (_) {} return {}; }
    function _kids(n) { return (n && (n.children || n._children)) || []; }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _toast(m, k, ms) { try { if (typeof showToast === 'function') showToast(m, k || 'info', ms || 3500); } catch (_) {} }
    function _fmt(v) { var n = Number(v); return (n > 0 && isFinite(n)) ? n.toExponential(2).toUpperCase() : ''; }

    function isLeaf(n) { return !!n && n.type !== 'gate' && n.type !== 'transfer' && !n.transferOutTo; }
    function fedFromElsewhere(n) { return !!(n && (n.externalSource || n.transferIn || n.type === 'house' || n.devError || n.developmentError)); }
    // the number this event carries (a rate, an MTBF turned into a rate, or a probability), or 0
    function value(n) {
        if (!n) return 0;
        if (n.inputMode === 'library' && n.libraryKey && _lib()[n.libraryKey]) return Number(_lib()[n.libraryKey].lambda) || 0;
        if (n.inputMode === 'probability') return Number(n.inputValue != null ? n.inputValue : n.probability) || 0;
        if (n.inputMode === 'mtbf') { var m = Number(n.inputValue); return m > 0 ? 1 / m : 0; }
        return Number(n.lambda != null ? n.lambda : (n.inputValue != null ? n.inputValue : 0)) || 0;
    }
    function sourceOf(n) {
        if (!n) return null;
        if (n.inputMode === 'library' && n.libraryKey && _lib()[n.libraryKey]) { var e = _lib()[n.libraryKey]; return { kind: 'library', ref: S(e.name) + (e.source ? ' (' + e.source + ')' : ''), date: '', auto: true }; }
        var s = n.rateSource;
        return (s && KINDS[s.kind]) ? { kind: s.kind, ref: S(s.ref), date: S(s.date), cited: s.cited || undefined } : null;
    }
    function needsSource(n) { return isLeaf(n) && !fedFromElsewhere(n) && value(n) > 0; }
    function missing(n) { return needsSource(n) && !sourceOf(n); }
    // every basic event in the trees, once per logical event (a repeated event is one event)
    function rows() {
        var out = [], seen = {};
        _pages().forEach(function (p) {
            if (!p || !p.root || p.verifies) return;
            (function w(n) {
                if (!n) return;
                if (isLeaf(n) && !fedFromElsewhere(n)) {
                    var k = S(n.logicalId != null ? n.logicalId : n.id);
                    if (!seen[k]) { seen[k] = 1; out.push({ node: n, page: p, value: value(n), source: sourceOf(n), missing: missing(n) }); }
                }
                _kids(n).forEach(w);
            })(p.root);
        });
        return out;
    }
    function setSource(n, kind, ref, date) {
        if (!n) return { ok: false };
        if (kind && !KINDS[kind]) return { ok: false, why: 'unknown source kind' };
        if (!kind) { delete n.rateSource; }
        else n.rateSource = { kind: kind, ref: S(ref).trim(), date: S(date).trim() };
        _save(); _afterChange(); return { ok: true };
    }
    function _afterChange() {
        try { if (typeof renderNodeWarnings === 'function') renderNodeWarnings(); } catch (_) {}
        try { if (root.SLFtaWarn && typeof root.SLFtaWarn.render === 'function') root.SLFtaWarn.render(); } catch (_) {}
        try { if (root.SLDataChange && root.SLDataChange.bump) root.SLDataChange.bump(); } catch (_) {}
    }
    function _findNode(id) {
        var hit = null;
        _pages().some(function (p) { (function w(n) { if (!n || hit) return; if (S(n.id) === S(id)) hit = n; _kids(n).forEach(w); })(p && p.root); return !!hit; });
        return hit;
    }

    // ---- the properties panel ---------------------------------------------------------------------------------
    function renderPanel(n) {
        var host = root.document && root.document.getElementById('config-rate-source-container'); if (!host) return;
        if (!n || !isLeaf(n) || fedFromElsewhere(n)) { host.style.display = 'none'; host.innerHTML = ''; return; }
        var src = sourceOf(n), lib = n.inputMode === 'library';
        host.style.display = 'flex';
        host.innerHTML = '<div style="flex:1 1 180px;"><label>Source of the failure rate</label>' +
            (lib ? '<div style="font-size:12.5px;padding:7px 0;">Library entry: ' + E(src ? src.ref : '') + '</div>'
                 : '<select id="config-rate-source-kind" onchange="SLRateSources.ui.fromPanel()"><option value="">No source yet</option>' + Object.keys(KINDS).map(function (k) { return '<option value="' + k + '"' + (src && src.kind === k ? ' selected' : '') + '>' + E(KINDS[k]) + '</option>'; }).join('') + '</select>') + '</div>' +
            (lib ? '' : '<div style="flex:2 1 220px;"><label>Reference</label><input type="text" id="config-rate-source-ref" value="' + E(src ? src.ref : '') + '" placeholder="Document, data set or library entry" onchange="SLRateSources.ui.fromPanel()" style="margin-bottom:0;"></div>' +
                '<div style="flex:1 1 130px;"><label>Date of the data</label><input type="date" id="config-rate-source-date" value="' + E(src ? src.date : '') + '" onchange="SLRateSources.ui.fromPanel()" style="margin-bottom:0;"></div>') +
            (missing(n) ? '<div style="flex:1 1 100%;font-size:11.5px;color:#9A6200;">This rate has no source. The SSA needs one for every rate it uses.</div>' : '');
    }
    function _selected() { try { if (typeof selectedNodeData !== 'undefined') return selectedNodeData; } catch (_) {} return null; }

    // ---- the table ---------------------------------------------------------------------------------------------
    var _matches = {};   // node id -> { libraryKey, why } (ANEM's matches, waiting for Accept)
    function tableHtml() {
        var rs = rows(), nMiss = rs.filter(function (r) { return r.missing; }).length;
        var BTN = 'font:inherit;font-size:12px;font-weight:600;padding:4px 10px;border-radius:7px;border:1px solid var(--color-border-strong,#c7cbd1);background:var(--color-surface-1,#fff);color:inherit;cursor:pointer;';
        var html = '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;"><span style="font-size:12.5px;color:var(--color-text-secondary);">Every rate names its source. ' + rs.length + ' basic event' + (rs.length === 1 ? '' : 's') + (nMiss ? ', <b style="color:#9A6200;">' + nMiss + ' with no source</b>' : ', all sourced') + '. ANEM only finds a library entry that matches an event; it never types a rate.</span>' +
            '<span style="display:flex;gap:6px;"><button type="button" data-rs-ai="1" style="' + BTN + 'border-color:#6B4FD8;color:#4B33B0;" onclick="SLRateSources.ui.findMatches()">✨ Find library matches with ANEM</button><button type="button" style="' + BTN + '" onclick="SLRateSources.ui.exportCsv()">Export table</button></span></div>' +
            '<table class="data-table" style="width:100%;font-size:12.5px;"><thead><tr><th>Basic event</th><th>Tree</th><th style="text-align:right;">λ / h or P</th><th>Source</th><th>Reference</th><th></th></tr></thead><tbody>';
        rs.forEach(function (r) {
            var n = r.node, m = _matches[S(n.id)], e = m && _lib()[m.libraryKey];
            var srcTxt = r.source ? E(KINDS[r.source.kind]) + (r.source.cited ? ' (cited)' : '') : (r.value > 0 ? '<span style="color:#9A6200;font-weight:600;">No source</span>' : '<span style="color:var(--color-text-tertiary);">no rate yet</span>');
            html += '<tr data-rs-node="' + E(n.id) + '"' + (e ? ' style="background:rgba(107,79,216,.05);outline:1.5px dashed rgba(107,79,216,.55);outline-offset:-2px;"' : '') + '><td>' + E(n.name || n.displayId || n.id) + ' <span class="u-mono" style="font-size:11px;color:var(--color-text-tertiary);">' + E(n.displayId || '') + '</span></td>' +
                '<td>' + E(r.page.name || r.page.id) + '</td><td class="u-mono" style="text-align:right;">' + (_fmt(r.value) || '—') + '</td>' +
                '<td>' + (e ? '<span style="display:inline-block;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;background:rgba(107,79,216,.12);color:#4B33B0;">ANEM match</span> Library: ' + E(e.name) + ' (' + E(e.source || '') + '), λ ' + _fmt(e.lambda) + (r.value > 0 && Math.abs(Number(e.lambda) - r.value) / r.value > 0.01 ? '<div style="font-size:11px;color:#7A4800;">Differs from the typed ' + _fmt(r.value) + '. "Cite it" keeps your rate and cites this entry as its basis.</div>' : '') + (m.why ? '<div style="font-size:11px;color:var(--color-text-secondary);">' + E(m.why) + '</div>' : '') : srcTxt) + '</td>' +
                '<td>' + E(r.source ? r.source.ref : '') + (r.source && r.source.date ? ' <span style="color:var(--color-text-tertiary);">' + E(r.source.date) + '</span>' : '') + '</td>' +
                '<td style="white-space:nowrap;">' + (e ? '<button type="button" style="' + BTN + 'background:#1A6EF2;border-color:#1A6EF2;color:#fff;" onclick="SLRateSources.ui.cite(\'' + E(n.id) + '\')">Cite it</button> <button type="button" style="' + BTN + '" onclick="SLRateSources.ui.useLibrary(\'' + E(n.id) + '\')">Use ' + _fmt(e.lambda) + '</button> <button type="button" style="' + BTN + '" onclick="SLRateSources.ui.discard(\'' + E(n.id) + '\')">Discard</button>'
                    : '<button type="button" style="' + BTN + '" onclick="SLRateSources.ui.openEvent(\'' + E(n.id) + '\')">Open event</button>') + '</td></tr>';
        });
        if (!rs.length) html += '<tr><td colspan="6" style="color:var(--color-text-secondary);">No basic events in the trees yet.</td></tr>';
        return html + '</tbody></table>';
    }
    function open() {
        var d = root.document; if (!d) return;
        var old = d.getElementById('rate-sources-modal'); if (old) old.remove();
        var ov = d.createElement('div'); ov.id = 'rate-sources-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.5);padding:20px;';
        ov.innerHTML = '<div style="background:var(--color-surface-1,#fff);color:inherit;border-radius:14px;width:min(1100px,100%);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--color-border-hair,#eee);"><b style="font-size:15px;">Where each failure rate comes from</b><button type="button" onclick="SLRateSources.ui.close()" aria-label="Close" style="border:none;background:transparent;font-size:22px;cursor:pointer;color:#888;">&times;</button></div>' +
            '<div id="rate-sources-body" style="padding:12px 18px;overflow:auto;">' + tableHtml() + '</div></div>';
        ov.addEventListener('mousedown', function (e) { if (e.target === ov) ov.remove(); });
        d.body.appendChild(ov);
    }
    function _refresh() { var b = root.document && root.document.getElementById('rate-sources-body'); if (b) b.innerHTML = tableHtml(); }
    function csv() {
        var q = function (v) { v = S(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        var lines = [['Basic event', 'ID', 'Tree', 'Rate or probability', 'Source', 'Reference', 'Date'].join(',')];
        rows().forEach(function (r) { lines.push([r.node.name || '', r.node.displayId || '', r.page.name || r.page.id, _fmt(r.value), r.source ? KINDS[r.source.kind] + (r.source.cited ? ' (cited)' : '') : (r.value > 0 ? 'No source' : ''), r.source ? r.source.ref : '', r.source ? r.source.date : ''].map(q).join(',')); });
        return lines.join('\n');
    }
    // the SSA report's table
    function reportRows(sysId) { return rows().filter(function (r) { return r.value > 0 && (!sysId || S(r.page.systemId) === S(sysId)); }).map(function (r) { return { 'Basic event': (r.node.displayId ? r.node.displayId + ' ' : '') + S(r.node.name), 'Tree': S(r.page.name || r.page.id), 'Rate / P': _fmt(r.value), 'Source': r.source ? KINDS[r.source.kind] + (r.source.cited ? ' (cited)' : '') : 'No source', 'Reference': r.source ? (r.source.ref + (r.source.date ? ', ' + r.source.date : '')) : '' }; }); }

    var ui = {
        fromPanel: function () {
            var n = _selected(); if (!n) return;
            var d = root.document, k = (d.getElementById('config-rate-source-kind') || {}).value || '';
            setSource(n, k, (d.getElementById('config-rate-source-ref') || {}).value || '', (d.getElementById('config-rate-source-date') || {}).value || '');
            renderPanel(n);
        },
        open: open, close: function () { var o = root.document.getElementById('rate-sources-modal'); if (o) o.remove(); },
        exportCsv: function () {
            try { var b = new Blob([csv()], { type: 'text/csv' }), a = root.document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'failure_rate_sources.csv'; root.document.body.appendChild(a); a.click(); a.remove(); } catch (e) { _toast('Export failed: ' + e.message, 'warning'); }
        },
        openEvent: function (id) { ui.close(); if (typeof root.jumpToArtifact === 'function') root.jumpToArtifact({ kind: 'ftaNode', id: _findNode(id) ? _findNode(id).id : id, tab: 'fta' }); },
        cite: function (id) {
            var n = _findNode(id), m = _matches[S(id)], e = m && _lib()[m.libraryKey]; if (!n || !e) return;
            n.rateSource = { kind: 'library', ref: S(e.name) + (e.source ? ' (' + e.source + ')' : ''), date: '', cited: true, libraryKey: m.libraryKey };
            delete _matches[S(id)]; _save(); _afterChange(); _refresh();
        },
        useLibrary: function (id) {
            var n = _findNode(id), m = _matches[S(id)]; if (!n || !m || !_lib()[m.libraryKey]) return;
            n.inputMode = 'library'; n.libraryKey = m.libraryKey; n.lambda = Number(_lib()[m.libraryKey].lambda) || n.lambda; delete n.rateSource;
            delete _matches[S(id)];
            try { if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities(); } catch (_) {}
            _save(); _afterChange(); _refresh();
        },
        discard: function (id) { delete _matches[S(id)]; _refresh(); },
        findMatches: function () {
            var go = function () {
                return root.SafetyLabAI.rateMatch(rows().filter(function (r) { return r.missing; }).map(function (r) { return r.node.id; })).then(function (res) {
                    if (res && res.ok) { (res.matches || []).forEach(function (m) { _matches[S(m.nodeId)] = { libraryKey: m.libraryKey, why: m.why }; }); _refresh(); _toast(res.summary, 'info'); }
                    else if (res && res.why) _toast(res.why, 'warning', 6000);
                });
            };
            if (root.SafetyLabAI && root.SafetyLabAI.rateMatch) return go();
            if (typeof root.slLoadAI === 'function') return Promise.resolve(root.slLoadAI()).then(function () { if (root.SafetyLabAI && root.SafetyLabAI.rateMatch) return go(); _toast('ANEM is not available here.', 'warning'); }).catch(function (e) { _toast('ANEM could not run: ' + ((e && e.message) || e), 'warning', 6000); });
        }
    };
    // the panel follows the selected event (fta_view_modules selectNode)
    function _wire() {
        if (typeof root.selectNode === 'function' && !root.selectNode._rateSrc) {
            var sn = root.selectNode;
            root.selectNode = function (d) { var out = sn.apply(this, arguments); try { renderPanel(d); } catch (_) {} return out; };
            root.selectNode._rateSrc = true;
        }
        try {
            var d = root.document, bar = d && d.querySelector('#view-fta .fta-toolbar');
            if (bar && !d.getElementById('rate-sources-btn')) {
                var b = d.createElement('button'); b.type = 'button'; b.id = 'rate-sources-btn'; b.className = 'btn-ghost'; b.textContent = 'Failure rate sources';
                b.title = 'Where each failure rate comes from: every basic event, its rate, its source and reference';
                b.onclick = function () { open(); }; bar.appendChild(b);
            }
        } catch (_) {}
    }
    _wire();
    if (typeof root.addEventListener === 'function') root.addEventListener('load', _wire);

    var api = { VERSION: VERSION, KINDS: KINDS, value: value, sourceOf: sourceOf, needsSource: needsSource, missing: missing, rows: rows, setSource: setSource,
                renderPanel: renderPanel, tableHtml: tableHtml, open: open, csv: csv, reportRows: reportRows, ui: ui, _matches: _matches, findNode: _findNode };
    try { root.SLRateSources = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

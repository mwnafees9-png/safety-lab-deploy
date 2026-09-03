// ============================================================================
// fta_tree_picker.js — v1.1 — the picker REPLACES the pane (23 Aug 2026,
// Waqas, seeing the browser pane back on the page: "we dont need this when we
// have the selection menu up top"). The pane is hidden outright; + New Fault
// Tree moves up beside the select (same addNewFTAPage call). The pane's DOM
// stays in the page — hidden, not deleted — so nothing that reads it breaks.
// fta_tree_picker.js — v1.0 — the tree picker (23 Aug 2026, Waqas: "for the
// fault trees, we will do a drop down select similar to how we have it for
// the golden thread, and remove all the fault trees from the left nav").
//
// The left nav no longer lists a single fault tree: the rail's tree-browser
// group became a plain row, the per-system folder tree rows are gone, and
// the browser pane returned to the FTA page (the relocation's own fallback).
// This module adds the golden-thread-style <select> at the top of the FTA
// page — every root tree, grouped Aircraft / per-System / Standalone —
// switching exactly the way a browser row click does (config sync, target
// re-derivation, recompute, repaint). The pane stays for management (+ New,
// delete, promote); this select is the fast path.
//
// BORN MODULAR: new file, zero monolith edits; moat pattern on switchTab.
// Kill switch: window.SL_FTA_PICKER_OFF = true.
// ============================================================================
(function () {
    'use strict';

    function _pages() { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : []; }
    function _sys() { return (typeof systemsData !== 'undefined' && systemsData) || []; }
    var _esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };

    function _roots() {
        var byId = {};
        _pages().forEach(function (p) { if (p && p.id) byId[p.id] = 1; });
        return _pages().filter(function (p) {
            if (!p || !p.root) return false;
            var par = p.transferInFrom && p.transferInFrom.sourcePageId;
            return !(par && byId[par]);
        });
    }

    function _groups() {
        var roots = _roots();
        var out = [];
        // 23 Aug 2026 (v1.1) — Waqas: "MF&MS should also be in here" — the
        // MF&MS family (MAC-compiled, interdependence-seeded, authored) gets
        // its own group instead of blending into Aircraft.
        var isMfms = function (p) {
            return String(p.id).indexOf('mac-pg-') === 0 || String(p.id).indexOf('idp-pg-') === 0 || /MF&MS/.test(p.name || '');
        };
        var air = roots.filter(function (p) { return p.treeLevel === 'aircraft' && !isMfms(p); });
        if (air.length) out.push({ label: 'Aircraft', pages: air });
        var mfms = roots.filter(isMfms);
        if (mfms.length) out.push({ label: 'MF&MS', pages: mfms });
        var names = {};
        _sys().forEach(function (s) { names[s.id] = s.name || s.id; });
        var bySys = {};
        roots.filter(function (p) { return p.treeLevel === 'system'; }).forEach(function (p) {
            var k = p.systemId || '(unassigned)';
            (bySys[k] = bySys[k] || []).push(p);
        });
        Object.keys(bySys).sort(function (a, b) { return String(names[a] || a).localeCompare(String(names[b] || b)); })
            .forEach(function (k) { out.push({ label: 'System · ' + (names[k] || k), pages: bySys[k] }); });
        var rest = roots.filter(function (p) { return p.treeLevel !== 'aircraft' && p.treeLevel !== 'system'; });
        if (rest.length) out.push({ label: 'Standalone', pages: rest });
        return out;
    }

    // 26 Aug 2026 — Waqas: "even if you select a different tree it does not work".
    // This file read and wrote `window.activeFTAPageId`. The core declares
    // `let activeFTAPageId` at the top level of a classic script, which lives in the
    // GLOBAL LEXICAL environment — shared between scripts, but NOT a property of
    // window. So `window.activeFTAPageId` was a DIFFERENT, unrelated variable:
    //   · the write (change handler) set the decoy and left the real one alone, so
    //     updateD3() faithfully re-rendered the page you were already on;
    //   · the read in _sig() was undefined, so the re-render signature never
    //     reflected which tree was actually open;
    //   · the read for `cur` meant the dropdown never marked the true current tree
    //     as selected.
    // Every other assignment in the codebase (fta_view_modules, fta_quant_modules,
    // data_ops_modules, ai_assistant) uses the bare identifier. This one didn't.
    // Guarded, because a bare reference to an undeclared binding throws.
    function _activeId() {
        try { return (typeof activeFTAPageId !== 'undefined') ? activeFTAPageId : null; } catch (_) { return null; }
    }
    function _setActiveId(id) {
        try { activeFTAPageId = id; return _activeId() === id; } catch (_) { return false; }
    }

    function _sig() {
        return _roots().map(function (p) { return p.id + ':' + (p.name || ''); }).join('|') + '@' +
            String(_activeId() || '');
    }

    var _last = '';
    function render(force) {
        if (typeof window !== 'undefined' && window.SL_FTA_PICKER_OFF) return;
        if (typeof document === 'undefined') return;
        var view = document.getElementById('view-fta');
        if (!view) return;
        var sig = _sig();
        if (!force && sig === _last && document.getElementById('fta-tree-pick')) return;
        _last = sig;
        var host = document.getElementById('fta-tree-pick-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'fta-tree-pick-host';
            host.className = 'fta-tree-pick-host';
            var lbl = document.createElement('label');
            lbl.textContent = 'Fault tree';
            lbl.setAttribute('for', 'fta-tree-pick');
            var sel = document.createElement('select');
            sel.id = 'fta-tree-pick';
            var nb = document.createElement('button');
            nb.type = 'button'; nb.id = 'fta-tree-new'; nb.className = 'btn-cyan';
            nb.textContent = '+ New Fault Tree';
            nb.addEventListener('click', function () {
                try { if (typeof addNewFTAPage === 'function') addNewFTAPage(); } catch (_) {}
                try { render(true); } catch (_) {}
            });
            host.appendChild(lbl); host.appendChild(sel); host.appendChild(nb);
            view.insertBefore(host, view.firstChild);
            sel.addEventListener('change', function () {
                var id = sel.value;
                if (!id) return;
                try {
                    if (!_setActiveId(id)) {   // the switch is the whole feature — never fail it silently
                        try { if (typeof showToast === 'function') showToast('Could not switch fault tree — the page state is unavailable.', 'warning', 5000); } catch (_) {}
                        return;
                    }
                    if (typeof syncFtaConfigFromActivePage === 'function') syncFtaConfigFromActivePage();
                    if (typeof refreshFTARequiredTarget === 'function') refreshFTARequiredTarget();
                    if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities();
                    if (typeof renderFTASidebar === 'function') renderFTASidebar();
                    if (typeof updateD3 === 'function') updateD3();
                } catch (_) {}
            });
        }
        // The browser pane is redundant next to the select — keep it hidden
        // (hidden, not removed: search/management DOM stays intact underneath).
        try {
            var pane = document.querySelector('.fta-sidebar');
            if (pane && pane.style.display !== 'none') pane.style.display = 'none';
        } catch (_) {}
        var sel2 = document.getElementById('fta-tree-pick');
        var cur = _activeId();
        sel2.innerHTML = '<option value="">— pick a fault tree —</option>' + _groups().map(function (g) {
            return '<optgroup label="' + _esc(g.label) + '">' + g.pages.map(function (p) {
                return '<option value="' + _esc(p.id) + '"' + (String(p.id) === String(cur) ? ' selected' : '') + '>' +
                    _esc(p.name || p.id) + '</option>';
            }).join('') + '</optgroup>';
        }).join('');
    }

    if (typeof window !== 'undefined') {
        window.SL_FTA_PICKER = { render: render };
        (function wrapNav() {
            if (typeof window.switchTab !== 'function' || window.switchTab._ftaPickerWrapped) return;
            var orig = window.switchTab;
            var wrapped = function (tabId) {
                var r = orig.apply(this, arguments);
                try { if (tabId === 'fta') render(true); } catch (_) {}
                return r;
            };
            wrapped._ftaPickerWrapped = true;
            Object.keys(orig).forEach(function (k) { try { wrapped[k] = orig[k]; } catch (_) {} });
            window.switchTab = wrapped;
        })();
        setInterval(function () { try { render(false); } catch (_) {} }, 6000);
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { render: render, _groups: _groups, _roots: _roots };
})();

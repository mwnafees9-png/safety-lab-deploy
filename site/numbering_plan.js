// ============================================================================
// numbering_plan.js — v1.2 — ID schemes on the Program Planning page.
//
// Decided by Waqas, 2 Aug 2026: the programme declares its FUNCTION ID scheme
// and FAILURE CONDITION ID scheme, at aircraft and system level, and numbering
// derives from those schemes everywhere — manual form entry and AI accepts
// alike. The engine for this (numbering.js — template tokens, scoped counters,
// forward-only) already existed; this card surfaces the three templates that
// govern those artifacts where programme decisions live, with a live preview
// of BOTH levels: the {SYS} token is the system-level form, and the engine
// collapses it cleanly at aircraft level, so one template serves both.
//
// FORWARD-ONLY, stated on the card: a scheme change affects NEW ids only.
// Existing ids never renumber from here — renumbering is a separate, audited
// migration with cross-reference preview (FHA rows, trees and requirements
// reference FC ids), deliberately NOT this card's button.
//
// BORN MODULAR: wraps PROGRAM_PLAN.renderScopeSection; injects one card into
// #view-spp after the scope host. Writes through SafetyLabNumberingState
// (persisted with the project payload). "Full editor…" opens the existing
// numbering modal for the remaining kinds (trees, gates, events, requirements).
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    // 31 Aug 2026 (Waqas): "node identities can be prescribed in the program
    // planning by the user." The FTA node kinds join the card — gate and
    // basic-event id schemes are programme decisions, not buried-modal
    // settings; generateDisplayId already honors these templates on every
    // node minted anywhere (manual canvas + AI synthesis alike). The TOP
    // EVENT is deliberately NOT a template here: by the same-day ruling its
    // id IS the failure condition id carried from the FCIM / A/S FHA — the
    // card states that rule instead of offering to override it.
    var KINDS = [
        { kind: 'subFunction', label: 'Function IDs', hint: 'sub-functions — the ids FHA/FCIM rows hang off' },
        { kind: 'failureCond', label: 'Failure condition IDs', hint: 'FHA rows (aircraft + system)' },
        { kind: 'fcimMode',    label: 'FCIM cell IDs', hint: 'TL / PL / M per function; extras number PL2…, M2… (Table A3)' },
        { kind: 'gate',        label: 'FTA gate IDs', hint: 'gate nodes on every fault-tree page (manual + AI-synthesised)' },
        { kind: 'basicEvent',  label: 'FTA basic-event IDs', hint: 'leaf events; shared/common-cause events reuse one id via the engine' }
    ];
    function N() { return window.SafetyLabNumbering; }
    function State() { return window.SafetyLabNumberingState; }
    function _esc(s) { if (typeof esc === 'function') return esc(s); return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function _preview(scheme, kind) {
        try {
            var t = (scheme.templates || {})[kind]; if (!t) return { ac: '—', sys: '—' };
            var base = { PARENT: 'SF-02', MODE: 'PL', PROGRAM: 'AEOLUS', SEQ: 7 };
            var ex = function (SYS) {
                // The engine's own expand() renders the preview — previewId() would
                // fix SYS='NAV', but we want BOTH levels, so call expand directly.
                return N().expand(t.pattern, Object.assign({}, base, { SYS: SYS, TYPE: t.type }));
            };
            return { ac: ex(''), sys: ex('FCS') };
        } catch (_) { return { ac: '—', sys: '—' }; }
    }

    function _render() {
        var view = document.getElementById('view-spp'); if (!view) return;
        if (!N() || !State() || !State().getScheme()) return;
        var host = document.getElementById('pp-idscheme-host');
        if (!host) { host = document.createElement('div'); host.id = 'pp-idscheme-host'; view.appendChild(host); }
        var scheme = State().getScheme();
        var rows = KINDS.map(function (k) {
            var t = (scheme.templates || {})[k.kind] || { pattern: '', counterScope: 'global' };
            var p = _preview(scheme, k.kind);
            return '<tr>' +
                '<td style="white-space:nowrap;padding:6px 10px 6px 0;"><b>' + _esc(k.label) + '</b><br><span style="font-size:11px;color:var(--color-text-tertiary);">' + _esc(k.hint) + '</span></td>' +
                '<td style="padding:6px 10px 6px 0;"><input data-ppn-kind="' + k.kind + '" value="' + _esc(t.pattern) + '" style="width:100%;min-width:190px;font-family:var(--font-mono,monospace);font-size:12px;padding:4px 7px;"></td>' +
                '<td style="padding:6px 10px 6px 0;"><select data-ppn-scope="' + k.kind + '" style="font-size:12px;padding:3px 6px;">' +
                    ['global', 'system', 'parent'].map(function (sc) { return '<option value="' + sc + '"' + ((t.counterScope || 'global') === sc ? ' selected' : '') + '>' + sc + '</option>'; }).join('') + '</select></td>' +
                '<td data-ppn-prev="' + k.kind + '" style="padding:6px 0;font-family:var(--font-mono,monospace);font-size:11.5px;color:var(--color-text-secondary);white-space:nowrap;">AC: ' + _esc(p.ac) + ' · SYS: ' + _esc(p.sys) + '</td></tr>';
        }).join('');
        host.innerHTML =
            '<div style="border:1px solid var(--color-border-strong);margin-top:16px;">' +
              '<div style="padding:8px 13px;border-bottom:2px solid var(--color-text-primary);"><b>ID numbering — programme schemes</b> ' +
                '<span style="font-size:11px;color:var(--color-text-tertiary);">one template per artifact; {SYS} is the system-level form and collapses at aircraft level · tokens: {TYPE} {SEQ:000} {SYS} {PARENT} {MODE} {PROGRAM}</span></div>' +
              '<div style="padding:9px 13px;">' +
                '<table style="width:100%;border-collapse:collapse;font-size:12.5px;"><thead><tr>' +
                  '<th style="text-align:left;">Artifact</th><th style="text-align:left;">Pattern</th><th style="text-align:left;">Counter</th><th style="text-align:left;">Preview (aircraft · system)</th></tr></thead>' +
                '<tbody>' + rows + '</tbody></table>' +
                '<div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap;">' +
                  '<span style="font-size:11px;color:var(--color-text-tertiary);flex-basis:100%;">Top events carry no template: a tree linked to a failure condition wears THAT condition\'s id (FCIM / A&#8203;FHA / S&#8203;FHA) as its top-event id — fixed by programme rule, 31 Aug 2026.</span>' +
                  '<button class="ckpt-m-btn" id="ppn-save">Apply to new IDs</button>' +
                  '<button class="ckpt-m-btn" style="opacity:.85;" onclick="try{openNumberingEditor()}catch(e){}">Full editor…</button>' +
                  '<span style="font-size:11.5px;color:var(--color-text-tertiary);">Forward-only: existing ids never renumber from here. Manual entries are respected; blank ids — typed or AI-accepted — are minted from these schemes.</span>' +
                '</div></div></div>';
        host.querySelectorAll('input[data-ppn-kind], select[data-ppn-scope]').forEach(function (el) {
            el.addEventListener('input', function () {
                var w = N().cloneScheme(State().getScheme());
                KINDS.forEach(function (k) {
                    var pi = host.querySelector('input[data-ppn-kind="' + k.kind + '"]');
                    var si = host.querySelector('select[data-ppn-scope="' + k.kind + '"]');
                    if (w.templates[k.kind]) { w.templates[k.kind].pattern = pi.value; w.templates[k.kind].counterScope = si.value; }
                    var p = _preview(w, k.kind);
                    var pv = host.querySelector('[data-ppn-prev="' + k.kind + '"]');
                    if (pv) pv.textContent = 'AC: ' + p.ac + ' · SYS: ' + p.sys;
                });
                host._working = w;
            });
        });
        var save = host.querySelector('#ppn-save');
        if (save) save.onclick = function () {
            var w = host._working || N().cloneScheme(State().getScheme());
            KINDS.forEach(function (k) {
                var pi = host.querySelector('input[data-ppn-kind="' + k.kind + '"]');
                var si = host.querySelector('select[data-ppn-scope="' + k.kind + '"]');
                if (w.templates[k.kind] && pi && si) { w.templates[k.kind].pattern = pi.value; w.templates[k.kind].counterScope = si.value; }
            });
            State().setScheme(w);
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
            try { if (typeof showToast === 'function') showToast('ID schemes applied — new ids mint from these patterns (existing ids unchanged).', 'success', 4500); } catch (_) {}
            _render();
        };
    }

    if (window.PROGRAM_PLAN && typeof window.PROGRAM_PLAN.renderScopeSection === 'function' && !window.PROGRAM_PLAN.renderScopeSection._ppnWrapped) {
        var _orig = window.PROGRAM_PLAN.renderScopeSection;
        var wrapped = function () { var r = _orig.apply(this, arguments); try { _render(); } catch (_) {} return r; };
        wrapped._ppnWrapped = true;
        window.PROGRAM_PLAN.renderScopeSection = wrapped;
    }
    // v1.1 (2 Aug, caught live): the export wrap above never fires on a plain
    // Program Planning visit — program_plan's own switchTab wrapper calls its
    // internal CLOSURE renderScopeSection, not the exported name. Wrap
    // switchTab ourselves (this script loads after program_plan.js, so this
    // wrap sits outside its guard) and render once at load, so the card is
    // there whenever the page is.
    if (typeof window.switchTab === 'function' && !window.switchTab._ppnWrapped) {
        var _origTab = window.switchTab;
        var wrappedTab = function (tabId) {
            var r = _origTab.apply(this, arguments);
            try { if (tabId === 'spp') setTimeout(_render, 50); } catch (_) {}
            return r;
        };
        wrappedTab._ppnWrapped = true;
        window.switchTab = wrappedTab;
    }
    try { setTimeout(_render, 300); } catch (_) {}   // boot render — _render early-returns until the view + engine exist
    window.NUMBERING_PLAN = { render: _render };
})();

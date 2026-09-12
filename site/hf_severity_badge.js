// ============================================================================
// hf_severity_badge.js — v1.1 — INV-HFW's FHA-row surface (REBUILT).
//
// HISTORY, honestly: v1.0 was built in-session (#157 era), wired into
// index.html, and never committed to the repo — so production served the
// SPA fallback for it and the badge was silently dead on live. This v1.1
// is the rebuild from the surviving contract: helpers_modules.js calls
//   HFSeverityCheck.evalRow(row)          → per-row finding | null
//   HFW_UI.badge(row, 'AC'|'SYS', hfw)    → badge HTML in the severity cell
// and the engine (hf_severity_check.js) exposes { run, BAND_TO_SEV } "for a
// future FHA-row badge". This module EXTENDS that object with evalRow and
// supplies the badge + the two honest actions (#157): review the severity,
// or update the crew effect — both open the row's own editor; the badge
// never edits anything itself.
//
// ONE LADDER: BAND_TO_SEV comes from the engine export — never duplicated.
// The conservative crew-effect text reader and the ≥2-band gap rule are
// mirrored from the engine with the SAME regexes and constant, and the
// regression suite asserts evalRow() and the engine's run() agree row for
// row, so the two can never drift apart silently.
//
// Display-lane: computes and renders; the only mutations are navigations
// into existing editors (editACFHA / editSysFHA). Fully defensive — loads
// in any order, no-ops without its stores.
// ============================================================================
(function () {
    var _sevPill = function (s, o) { return (typeof sevPillHtml === 'function') ? sevPillHtml(s, o) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }; // severity pill (helpers_modules.js); safe when helpers is not loaded (test sandboxes)
    'use strict';

    // ---- mirrors of the engine's row logic (asserted in tests) --------------
    var BANDS = ['none', 'slight', 'significant', 'excessive', 'incapacitating'];
    var RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1, 'No Safety Effect': 1 };
    var GAP = 2;   // flag only a material gap (≥2 severity bands) — same as the engine
    function _ladder() {
        try { if (typeof HFSeverityCheck !== 'undefined' && HFSeverityCheck.BAND_TO_SEV) return HFSeverityCheck.BAND_TO_SEV; } catch (_) {}
        return null;   // no engine → no badge; never invent the ladder
    }
    function _rank(sev) {
        if (sev == null) return 0;
        if (RANK[sev] != null) return RANK[sev];
        try { if (typeof SEVERITY_RANK !== 'undefined' && SEVERITY_RANK[sev] != null) return SEVERITY_RANK[sev]; } catch (_) {}
        return 0;
    }
    function _bandFromText(t) {
        t = String(t || '').toLowerCase();
        if (!/workload|crew|task/.test(t)) return null;
        if (/incapacit|overwhelm|unmanageable|cannot cope/.test(t)) return 'incapacitating';
        if (/excessive|heavy workload|high workload/.test(t)) return 'excessive';
        if (/significant|considerable|substantial/.test(t)) return 'significant';
        if (/slight|minimal|small increase|slightly/.test(t)) return 'slight';
        return null;
    }
    // asmAll() returns {asmId,text,state,scope,origin} — no `type`, no `hf`. Every
    // read below tests exactly those two fields, so against asmAll() the answer was
    // always "no": the authored workload band was never seen and the evidence lane
    // refused every record in production. asmAllTyped() is the projection that
    // carries them. No fallback to asmAll() on purpose — falling back to a source
    // that cannot answer the question is what made this silent for so long.
    function _typedAsms() {
        try {
            const A = (typeof window !== 'undefined') ? window.HF_ASSUMPTIONS : null;
            return (A && typeof A.asmAllTyped === 'function') ? (A.asmAllTyped() || []) : [];
        } catch (_) { return []; }
    }
    function _asmById() {
        var m = {};
        try { _typedAsms().forEach(function (a) { if (a && a.asmId != null) m[a.asmId] = a; }); } catch (_) {}
        return m;
    }
    function _bandForRow(row, byId) {
        var best = null, src = null;
        (row.assumptionIds || []).forEach(function (id) {
            var a = byId[id];
            if (a && a.type === 'hf' && a.hf && a.hf.workloadBand && BANDS.indexOf(a.hf.workloadBand) >= 0) {
                if (best == null || BANDS.indexOf(a.hf.workloadBand) > BANDS.indexOf(best)) { best = a.hf.workloadBand; src = id; }
            }
        });
        if (best) return { band: best, src: 'HFA ' + src, asmId: src };
        var tb = _bandFromText(row.effCrew);
        return tb ? { band: tb, src: 'crew-effect text', asmId: null } : null;
    }
    function _awareness(fcId) {
        if (fcId == null) return null;
        var rows = [];
        try { if (typeof acFcimData !== 'undefined') rows = rows.concat(acFcimData); } catch (_) {}
        try { if (typeof systemsData !== 'undefined') systemsData.forEach(function (s) { rows = rows.concat(s.fcim || []); }); } catch (_) {}
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (r && (String(r.tlId) === String(fcId) || String(r.plId) === String(fcId) || String(r.mId) === String(fcId))) return r.awareness || null;
        }
        return null;
    }

    // ---- evalRow: the per-row finding the table render asks for -------------
    function evalRow(row) {
        try {
            var L = _ladder(); if (!L || !row || !row.severity) return null;
            var b = _bandForRow(row, _asmById());
            if (!b) return null;                                // no workload signal → nothing to check
            var impliedSev = L[b.band];
            var gap = _rank(row.severity) - _rank(impliedSev);
            if (gap < GAP) return null;                          // consistent (or workload higher) → fine
            return { band: b.band, src: b.src, asmId: b.asmId, impliedSev: impliedSev,
                     severity: row.severity, gap: gap, aware: _awareness(row.fcId) };
        } catch (_) { return null; }
    }
    // Attach onto the engine's export the moment it exists (load-order safe).
    (function attach() {
        try {
            if (typeof window.HFSeverityCheck !== 'undefined') { window.HFSeverityCheck.evalRow = evalRow; return; }
        } catch (_) {}
        var n = 0, iv = setInterval(function () {
            try { if (typeof window.HFSeverityCheck !== 'undefined') { window.HFSeverityCheck.evalRow = evalRow; clearInterval(iv); return; } } catch (_) {}
            if (++n >= 40) clearInterval(iv);
        }, 250);
    })();

    // ---- the badge + the two honest actions ---------------------------------
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    function badge(row, scope, hfw) {
        if (!row || !hfw) return '';
        var tip = 'Workload versus severity: crew workload reads "' + hfw.band + '" (' + hfw.src + ') — implies at most ' + hfw.impliedSev +
                  ', but the FHA says ' + hfw.severity + (hfw.aware ? ' · crew ' + hfw.aware : '') + '. Click to reconcile.';
        return ' <span class="u-mono hfw-badge" role="button" tabindex="0" title="' + esc(tip) + '"' +
            ' style="font-size:9px; font-weight:700; letter-spacing:.04em; color:#B7791F; border:1px solid #B7791F66; background:#B7791F12; border-radius:4px; padding:1px 6px; margin-left:6px; cursor:pointer; white-space:nowrap; vertical-align:1px;"' +
            ' onclick="event.stopPropagation(); HFW_UI.open(\'' + esc(scope) + '\',\'' + esc(String(row.internalId)) + '\')">HFW ↕</span>';
    }
    function _findRow(scope, internalId) {
        try {
            if (scope === 'AC') return (acFhaData || []).find(function (r) { return String(r.internalId) === String(internalId); }) || null;
            var out = null;
            (systemsData || []).forEach(function (s) { (s.fha || []).forEach(function (r) { if (String(r.internalId) === String(internalId)) out = r; }); });
            return out;
        } catch (_) { return null; }
    }
    function _closePop() { var el = document.getElementById('hfw-pop'); if (el && el.parentNode) el.parentNode.removeChild(el); }
    function open(scope, internalId) {
        _closePop();
        var row = _findRow(scope, internalId);
        var hfw = row ? evalRow(row) : null;
        if (!row || !hfw) return;
        var div = document.createElement('div');
        div.id = 'hfw-pop';
        div.style.cssText = 'position:fixed; inset:0; z-index:9000; background:rgba(20,26,36,.35); display:flex; align-items:center; justify-content:center;';
        div.innerHTML =
            '<div style="background:var(--color-surface-1,#fff); border:1px solid var(--color-border-strong,#c9d1dc); border-radius:10px; max-width:560px; width:92%; padding:16px 20px; box-shadow:0 12px 40px rgba(0,0,0,.25);">' +
            '<div style="display:flex; justify-content:space-between; align-items:center;">' +
            '<b style="font-size:13.5px;">Workload ↔ severity divergence</b>' +
            '<button style="font-size:12px; border:1px solid var(--color-border,#dde3ea); background:none; border-radius:4px; cursor:pointer; padding:2px 9px;" onclick="HFW_UI.close()">✕</button></div>' +
            '<div style="font-size:12.5px; margin-top:8px; line-height:1.55;">' +
            '<span class="u-mono" style="font-weight:700;">' + esc(row.fcId || '?') + '</span> is classified ' + _sevPill(hfw.severity) + ', ' +
            'but its crew workload reads <b>“' + esc(hfw.band) + '”</b> (' + esc(hfw.src) + ') — which by the AC 25.1309 workload ladder implies at most <b>' + esc(hfw.impliedSev) + '</b>.' +
            (hfw.aware ? ' The FCIM marks the crew <b>' + esc(hfw.aware) + '</b>' + (/unaware/i.test(hfw.aware) ? ' — a severe-but-low-workload pairing with an unaware crew is especially worth the second look.' : '.') : '') + '</div>' +
            '<div style="font-size:11px; color:var(--color-text-tertiary,#7c8797); margin-top:6px;">Advisory — it asks you to reconcile the two lanes; it never rewrites either. Two honest exits:</div>' +
            '<div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">' +
            '<button class="u-mono" style="font-size:11px; font-weight:700; cursor:pointer; border:1px solid #1F3A5F; color:#1F3A5F; background:#1F3A5F0D; border-radius:6px; padding:5px 12px;" onclick="HFW_UI.act(\'' + esc(scope) + '\',\'' + esc(String(internalId)) + '\',\'severity\')">Review the severity (open the FHA row)</button>' +
            '<button class="u-mono" style="font-size:11px; font-weight:700; cursor:pointer; border:1px solid #1D9E75; color:#1D9E75; background:#1D9E750D; border-radius:6px; padding:5px 12px;" onclick="HFW_UI.act(\'' + esc(scope) + '\',\'' + esc(String(internalId)) + '\',\'effect\')">Update the crew effect (open the FHA row)</button>' +
            (hfw.asmId ? '<button class="u-mono" style="font-size:11px; cursor:pointer; border:1px solid var(--color-border-strong,#c9d1dc); color:var(--color-text-secondary,#4a5568); background:var(--color-surface-2,#f4f6f8); border-radius:6px; padding:5px 12px;" onclick="HFW_UI.act(\'' + esc(scope) + '\',\'' + esc(String(internalId)) + '\',\'hfa\')">Open the HFA source (' + esc(hfw.asmId) + ')</button>' : '') +
            '</div></div>';
        div.addEventListener('click', function (e) { if (e.target === div) _closePop(); });
        document.body.appendChild(div);
    }
    function act(scope, internalId, what) {
        _closePop();
        try {
            if (what === 'hfa') { if (typeof switchTab === 'function') switchTab('hfa'); return; }
            if (scope === 'AC' && typeof editACFHA === 'function') editACFHA(internalId);
            else if (scope !== 'AC' && typeof editSysFHA === 'function') editSysFHA(internalId);
        } catch (_) {}
    }

    window.HFW_UI = { badge: badge, open: open, act: act, close: _closePop, evalRow: evalRow };
    if (typeof module !== 'undefined') module.exports = { evalRow: evalRow, badge: badge };
})();

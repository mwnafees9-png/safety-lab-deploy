// ============================================================================
// zsa_record.js — v1.0 — the record behind each zonal-safety finding
// (23 Sep 2026, standards gap G9; ARP4761A Q.14.4.6).
//
// WHY: a ZSA finding (a zsaData row, from the ZSA form or the per-zone
// walkthrough) carried WHAT was found and the mitigation, but not WHO assessed
// it, HOW (drawing / model review, mock-up, aircraft inspection, analysis),
// WHEN, or whether it is still OPEN. Without those the zonal query sheets
// cannot be audited or closed out.
//
// WHAT: four fields on every zsaData row —
//   assessedBy     free text (a name or role)
//   assessMethod   one of METHODS below (our own labels)
//   assessedOn     'YYYY-MM-DD'
//   findingStatus  'open' | 'closed'
// Closing a finding requires all three record fields and a mitigation /
// disposition (validate()). A finding born in the walkthrough starts 'open'
// and dated today; the analyst adds who and how. INV-51 (advisory) keeps
// incomplete records and open findings visible in the project check.
// Rows saved before this change have no record: they are reported as
// incomplete, never guessed or back-filled.
// See tests/regression_zsa_record.test.js.
// ============================================================================
(function (root) {
    'use strict';

    var METHODS = [
        { v: 'drawing-review', label: 'Drawing / 3D model review' },
        { v: 'mockup',         label: 'Mock-up inspection' },
        { v: 'aircraft',       label: 'Aircraft inspection' },
        { v: 'analysis',       label: 'Analysis' },
        { v: 'other',          label: 'Other (say which in the mitigation)' }
    ];
    var STATUSES = [{ v: 'open', label: 'Open' }, { v: 'closed', label: 'Closed' }];
    var FIELDS = ['assessedBy', 'assessMethod', 'assessedOn', 'findingStatus'];
    var FIELD_LABELS = { assessedBy: 'assessor', assessMethod: 'method', assessedOn: 'date', findingStatus: 'status' };

    function _s(v) { return v == null ? '' : String(v).trim(); }
    function _isDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(_s(v)) && !isNaN(Date.parse(_s(v) + 'T00:00:00Z')); }
    function _isMethod(v) { for (var i = 0; i < METHODS.length; i++) if (METHODS[i].v === v) return true; return false; }
    function _label(list, v) { for (var i = 0; i < list.length; i++) if (list[i].v === v) return list[i].label; return _s(v); }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    // Which record fields are missing or invalid on a row (labels, in order).
    function missing(row) {
        row = row || {};
        var out = [];
        if (!_s(row.assessedBy)) out.push('assessor');
        if (!_isMethod(row.assessMethod)) out.push('method');
        if (!_isDate(row.assessedOn)) out.push('date');
        if (row.findingStatus !== 'open' && row.findingStatus !== 'closed') out.push('status');
        return out;
    }
    function isClosed(row) { return !!row && row.findingStatus === 'closed'; }

    // The form's validation: null when fine, or the message to show.
    function validate(row) {
        row = row || {};
        if (_s(row.assessedOn) && !_isDate(row.assessedOn)) return 'The assessment date must be a real date (YYYY-MM-DD).';
        if (row.findingStatus === 'closed') {
            var m = missing(row).filter(function (f) { return f !== 'status'; });
            if (!_s(row.mitigation)) m.push('mitigation / disposition');
            if (m.length) return 'A zonal finding can only be closed with its full record. Missing: ' + m.join(', ') + '.';
        }
        return null;
    }

    function today() { var d = new Date(); var p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
    // What a new walkthrough finding starts with.
    function newFindingDefaults() { return { assessedBy: '', assessMethod: '', assessedOn: today(), findingStatus: 'open' }; }

    // Table cells: status, then "by · method · date" (missing parts named).
    function statusCellHTML(row) {
        var st = row && row.findingStatus;
        if (st === 'closed') return '<span class="zsa-rec-closed" style="color:var(--color-success,#15803d);font-weight:600;">Closed</span>';
        if (st === 'open') return '<span class="zsa-rec-open" style="color:var(--color-warning,#b45309);font-weight:600;">Open</span>';
        return '<span class="zsa-rec-unset" style="color:var(--color-text-tertiary);">Not set</span>';
    }
    function recordCellHTML(row) {
        row = row || {};
        var parts = [];
        if (_s(row.assessedBy)) parts.push(_esc(row.assessedBy));
        if (_isMethod(row.assessMethod)) parts.push(_esc(_label(METHODS, row.assessMethod)));
        if (_isDate(row.assessedOn)) parts.push(_esc(row.assessedOn));
        var miss = missing(row).filter(function (f) { return f !== 'status'; });
        return (parts.join(' · ') || '') + (miss.length ? '<div style="font-size:11px;color:var(--color-warning,#b45309);">Missing: ' + _esc(miss.join(', ')) + '</div>' : '');
    }
    // Plain-text versions for reports and CSV.
    function statusText(row) { return row && row.findingStatus === 'closed' ? 'Closed' : row && row.findingStatus === 'open' ? 'Open' : 'Not set'; }
    function methodText(row) { return row && _isMethod(row.assessMethod) ? _label(METHODS, row.assessMethod) : ''; }
    // Import: accept our value or its label, any case.
    function methodFrom(text) {
        var t = _s(text).toLowerCase(); if (!t) return '';
        for (var i = 0; i < METHODS.length; i++) if (METHODS[i].v === t || METHODS[i].label.toLowerCase() === t) return METHODS[i].v;
        return '';
    }
    function statusFrom(text) { var t = _s(text).toLowerCase(); return t === 'open' || t === 'closed' ? t : ''; }

    // Fields a zsaData row carries that the ZSA form does not show; an edit
    // through the form must keep them (the walkthrough tag was being lost).
    var CARRIED = ['zsaCheckpoint', 'origin'];
    function carryOver(prev, next) {
        if (!prev || !next) return next;
        CARRIED.forEach(function (k) { if (prev[k] !== undefined && next[k] === undefined) next[k] = prev[k]; });
        return next;
    }

    // Project-level summary for the check.
    function sweep(rows) {
        rows = Array.isArray(rows) ? rows : [];
        var incomplete = [], open = [];
        rows.forEach(function (r) {
            if (!r) return;
            var m = missing(r);
            if (m.length) incomplete.push({ row: r, missing: m });
            if (r.findingStatus !== 'closed') open.push(r);
        });
        return { checked: rows.length, incomplete: incomplete, open: open };
    }

    // ---- INV-51 (advisory) --------------------------------------------------------------
    function _zsa() { try { return (typeof zsaData !== 'undefined' && Array.isArray(zsaData)) ? zsaData : []; } catch (_) { return []; } }
    function _name(r) { return (r.zoneId || 'zone ?') + (r.zsaCheckpoint ? ' / ' + r.zsaCheckpoint : '') + ': ' + (_s(r.desc).slice(0, 60) || '(no description)'); }
    var INV = {
        id: 'INV-51', sev: 'advisory',
        name: 'Every zonal finding has its record — who assessed it, how, when — and a status; findings still open are listed',
        run: function () {
            var s = sweep(_zsa()), fails = [];
            s.incomplete.slice(0, 20).forEach(function (x) { fails.push(_name(x.row) + ' — missing ' + x.missing.join(', ')); });
            var openOnly = s.open.filter(function (r) { return !missing(r).length; });
            openOnly.slice(0, 20).forEach(function (r) { fails.push(_name(r) + ' — still open'); });
            return { checked: s.checked, fails: fails, failCount: s.incomplete.length + openOnly.length };
        }
    };
    (function reg(tries) {
        if (typeof root.invRegister === 'function') { try { root.invRegister(INV); } catch (_) {} return; }
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { reg(tries - 1); }, 50);
    })(40);

    var api = { METHODS: METHODS, STATUSES: STATUSES, FIELDS: FIELDS, FIELD_LABELS: FIELD_LABELS,
        missing: missing, isClosed: isClosed, validate: validate, today: today, newFindingDefaults: newFindingDefaults,
        statusCellHTML: statusCellHTML, recordCellHTML: recordCellHTML, statusText: statusText, methodText: methodText,
        methodFrom: methodFrom, statusFrom: statusFrom, carryOver: carryOver, sweep: sweep, INV: INV };
    try { root.SLZsaRecord = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

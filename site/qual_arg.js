// ============================================================================
// qual_arg.js — v1.0 — The qualitative argument behind a "qualitative only" call
// (23 Sep 2026, standards proposal P1; ASTM F3230-21a Appendix X2).
//
// THE PROBLEM IT CLOSES: the FHA chart walkthrough lets an engineer answer
// "simple and conventional: yes" (or, for Major, "simple" / "redundant"), and
// on Part 23 Class I/II a Catastrophic or Hazardous condition is qualitative by
// default. The analysis then goes qualitative-only, and nothing recorded WHY.
//
// THE ARGUMENT (X2's order, in our words — the standard's text is authoritative):
//   1. conventional — is the design like established designs with good service
//      history, and which ones;
//   2. simple — are its failure modes and effects fully understood, and how that
//      was shown (FMEA, inspection, test, analysis);
//   3. likelihood — why the failure condition is not expected (redundancy,
//      independence, margins, inspections), with evidence;
//   4. common cause (Catastrophic / Hazardous) — zonal, particular risks and
//      common mode considered, each with a reference, so no shared cause
//      defeats the argument above;
//   5. a signed conclusion: the argument supports qualitative-only, or it does
//      not (then the condition needs the quantitative path).
// Store: on the FHA row itself, fha.qualArg = { conventional 'yes'|'no'|'',
//   conventionalBasis, simple, simpleHow 'fmea'|'inspection'|'test'|'analysis'|'',
//   simpleBasis, likelihood, likelihoodEvidence, cca { zonal, pra, cmm } each
//   { done 'yes'|'no'|'na'|'', ref }, conclusion 'supported'|'not-supported'|'',
//   by, date }. The row travels with its argument (sync, export, import).
// Which rows need one: those AutoReq.decideAnalysisDepth puts on the
// 'qualitative' path. INV-57 (advisory, read-only) lists what is missing or
// contradictory. See tests/regression_qual_arg.test.js.
// ============================================================================
(function (root) {
    'use strict';

    var YN = [{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }];
    var HOW = [{ v: 'fmea', label: 'FMEA' }, { v: 'inspection', label: 'Inspection' }, { v: 'test', label: 'Test' }, { v: 'analysis', label: 'Analysis' }];
    var CCA = [
        { k: 'zonal', label: 'Zonal (installation, what sits next to what)' },
        { k: 'pra', label: 'Particular risks (fire, rotor burst, bird strike, lightning…)' },
        { k: 'cmm', label: 'Common mode (shared design, part, software, maintenance)' }
    ];
    var DONE = [{ v: 'yes', label: 'Considered: no shared cause defeats the argument' }, { v: 'no', label: 'Considered: a shared cause DOES defeat it' }, { v: 'na', label: 'Not applicable (say why in the reference)' }];
    var CONCL = [{ v: 'supported', label: 'Supports qualitative-only' }, { v: 'not-supported', label: 'Does not support it: needs the quantitative path' }];
    var SEVERE = { 'Catastrophic': 1, 'Hazardous': 1 };

    function _pc() { try { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : (root.projectConfig || null); } catch (_) { return root.projectConfig || null; } }
    function _arr(name) {
        var v;
        try {
            if (name === 'acFhaData') v = (typeof acFhaData !== 'undefined') ? acFhaData : undefined;
            else if (name === 'systemsData') v = (typeof systemsData !== 'undefined') ? systemsData : undefined;
        } catch (_) {}
        if (Array.isArray(v)) return v;
        return Array.isArray(root[name]) ? root[name] : [];
    }
    function _autoReq() { try { if (typeof AutoReq !== 'undefined') return AutoReq; } catch (_) {} return root.AutoReq || null; }
    function _t(s) { return String(s == null ? '' : s).trim(); }

    // Every FHA row in the project, with where it lives.
    function rows() {
        var out = _arr('acFhaData').filter(Boolean).map(function (f) { return { fha: f, sysId: null, sysName: 'Aircraft' }; });
        _arr('systemsData').forEach(function (s) { if (s && Array.isArray(s.fha)) s.fha.filter(Boolean).forEach(function (f) { out.push({ fha: f, sysId: s.id, sysName: s.name || String(s.id) }); }); });
        return out;
    }
    function find(internalId, sysId) {
        return rows().find(function (r) { return String(r.fha.internalId) === String(internalId) && String(r.sysId == null ? '' : r.sysId) === String(sysId == null ? '' : sysId); }) || null;
    }
    function depth(fha) { var A = _autoReq(); try { return (A && typeof A.decideAnalysisDepth === 'function') ? A.decideAnalysisDepth(fha) : null; } catch (_) { return null; } }
    function isQualitative(fha) { var d = depth(fha); return !!(d && !d.skip && d.mode === 'qualitative'); }
    function blank() { return { conventional: '', conventionalBasis: '', simple: '', simpleHow: '', simpleBasis: '', likelihood: '', likelihoodEvidence: '', cca: { zonal: { done: '', ref: '' }, pra: { done: '', ref: '' }, cmm: { done: '', ref: '' } }, conclusion: '', by: '', date: '' }; }
    function _isEmpty(a) {
        if (!a) return true;
        var c = a.cca || {};
        return !a.conventional && !a.simple && !_t(a.likelihood) && !a.conclusion && !CCA.some(function (x) { return c[x.k] && (c[x.k].done || _t(c[x.k].ref)); });
    }

    // ---- the checks (INV-57) --------------------------------------------------------------------
    function check(fha) {
        var out = [], a = fha.qualArg, sev = fha.severity, severe = !!SEVERE[sev], cp = fha.chartProps || {};
        if (_isEmpty(a)) { out.push({ kind: 'none', text: 'on the qualitative-only path with no recorded argument' }); return out; }
        if (!a.conventional) out.push({ kind: 'incomplete', text: 'conventional? not answered' });
        else if (a.conventional === 'yes' && !_t(a.conventionalBasis)) out.push({ kind: 'no-basis', text: 'conventional, but no basis (which designs, what service history)' });
        if (!a.simple) out.push({ kind: 'incomplete', text: 'simple? not answered' });
        else if (a.simple === 'yes' && (!a.simpleHow || !_t(a.simpleBasis))) out.push({ kind: 'no-basis', text: 'simple, but not how that was shown (method and reference)' });
        if (!_t(a.likelihood)) out.push({ kind: 'no-likelihood', text: 'no argument for why the failure is not expected' });
        else if (!_t(a.likelihoodEvidence)) out.push({ kind: 'no-likelihood-evidence', text: 'the likelihood argument has no evidence reference' });
        if (severe) {
            var c = a.cca || {};
            CCA.forEach(function (x) {
                var e = c[x.k] || {};
                if (!e.done) out.push({ kind: 'cca-open', text: 'common cause not considered: ' + x.k });
                else if (e.done === 'no') out.push({ kind: 'cca-defeats', text: 'a shared cause defeats the argument (' + x.k + ')' });
                else if (!_t(e.ref)) out.push({ kind: 'cca-no-ref', text: 'common cause ' + x.k + ' has no reference' });
            });
        }
        // contradictions with the chart answer that put it on this path
        if (cp.isSimpleConventional === true && (a.conventional === 'no' || a.simple === 'no')) out.push({ kind: 'contradiction', text: 'the chart says "simple and conventional", the argument says it is not ' + (a.conventional === 'no' ? 'conventional' : 'simple') });
        if (cp.isSimple === true && a.simple === 'no') out.push({ kind: 'contradiction', text: 'the chart says "simple", the argument says it is not' });
        if (severe && a.conclusion === 'supported' && (a.conventional === 'no' || a.simple === 'no')) out.push({ kind: 'contradiction', text: 'concluded "supported" for a ' + sev + ' condition that is not both simple and conventional' });
        if (a.conclusion === 'not-supported') out.push({ kind: 'not-supported', text: 'the argument does not support qualitative-only, but the condition is still on that path (answer the chart so it takes the quantitative path)' });
        else if (!a.conclusion) out.push({ kind: 'unsigned', text: 'no conclusion' });
        if (a.conclusion && (!_t(a.by) || !a.date)) out.push({ kind: 'unsigned', text: 'conclusion not signed (who and when)' });
        return out;
    }
    function _tag(r) { return (r.fha.fcId || ('FC#' + r.fha.internalId)) + ' (' + (r.fha.severity || '?') + (r.sysId != null ? ', ' + r.sysName : '') + ')'; }
    function findings() {
        var out = [];
        rows().forEach(function (r) {
            if (!isQualitative(r.fha)) return;
            check(r.fha).forEach(function (f) { out.push({ kind: f.kind, fha: r.fha, sysId: r.sysId, text: _tag(r) + ': ' + f.text }); });
        });
        return out;
    }
    var INV = {
        id: 'INV-57', sev: 'advisory',
        name: 'Every failure condition assessed qualitatively only has a signed argument behind it: conventional, simple, why the failure is not expected, and common cause (ASTM F3230 X2)',
        run: function () { var f = findings(); return { checked: rows().filter(function (r) { return isQualitative(r.fha); }).length, fails: f.slice(0, 20).map(function (x) { return x.text; }), failCount: f.length }; }
    };
    (function reg(tries) {
        if (typeof root.invRegister === 'function') { try { root.invRegister(INV); } catch (_) {} return; }
        if (tries > 0 && typeof setTimeout === 'function') setTimeout(function () { reg(tries - 1); }, 50);
    })(40);

    // ---- one line for reports -------------------------------------------------------------------
    function line(fha) {
        if (!fha) return '';
        var q = isQualitative(fha), a = fha.qualArg;
        if (_isEmpty(a)) return q ? 'Qualitative only: NO argument recorded' : '';
        var parts = [
            'conventional: ' + (a.conventional || '?') + (a.conventional === 'yes' && _t(a.conventionalBasis) ? ' (' + _t(a.conventionalBasis) + ')' : ''),
            'simple: ' + (a.simple || '?') + (a.simple === 'yes' && a.simpleHow ? ' by ' + a.simpleHow + (_t(a.simpleBasis) ? ' (' + _t(a.simpleBasis) + ')' : '') : ''),
            'likelihood: ' + (_t(a.likelihood) || 'not argued') + (_t(a.likelihoodEvidence) ? ' [' + _t(a.likelihoodEvidence) + ']' : '')
        ];
        if (SEVERE[fha.severity]) {
            var c = a.cca || {};
            parts.push('common cause: ' + CCA.map(function (x) { var e = c[x.k] || {}; return x.k + ' ' + (e.done || 'open') + (_t(e.ref) ? ' [' + _t(e.ref) + ']' : ''); }).join(', '));
        }
        var concl = a.conclusion === 'supported' ? 'Supports qualitative-only' : a.conclusion === 'not-supported' ? 'Does NOT support qualitative-only' : 'No conclusion';
        var n = q ? check(fha).length : 0;
        return concl + (a.by ? ' (' + a.by + (a.date ? ', ' + a.date : '') + ')' : '') + ': ' + parts.join('; ') + (n ? ' · ' + n + ' open point(s)' : '');
    }

    // ---- export ---------------------------------------------------------------------------------
    function exportCsv() {
        var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
        var head = ['FC', 'Where', 'Severity', 'Qualitative only?', 'Conventional', 'Basis', 'Simple', 'Shown by', 'Reference', 'Why not expected', 'Evidence',
            'Zonal', 'Zonal ref', 'Particular risks', 'PR ref', 'Common mode', 'CM ref', 'Conclusion', 'By', 'Date', 'Open points'];
        var out = [head.map(q).join(',')];
        rows().forEach(function (r) {
            var f = r.fha, qual = isQualitative(f);
            if (!qual && _isEmpty(f.qualArg)) return;
            var a = f.qualArg || blank(), c = a.cca || {};
            var g = function (k) { return c[k] || {}; };
            out.push([f.fcId, r.sysName, f.severity, qual ? 'yes' : 'no', a.conventional, a.conventionalBasis, a.simple, a.simpleHow, a.simpleBasis, a.likelihood, a.likelihoodEvidence,
                g('zonal').done, g('zonal').ref, g('pra').done, g('pra').ref, g('cmm').done, g('cmm').ref, a.conclusion, a.by, a.date,
                qual ? check(f).map(function (x) { return x.text; }).join('; ') : ''].map(q).join(','));
        });
        return out.join('\n');
    }
    function download() {
        try {
            var name = ((typeof projectName !== 'undefined' && projectName) || 'project').replace(/[^\w-]+/g, '_');
            var blob = new Blob(['﻿' + exportCsv()], { type: 'text/csv;charset=utf-8' });
            var el = root.document.createElement('a');
            el.href = URL.createObjectURL(blob); el.download = name + '_qualitative_arguments.csv';
            root.document.body.appendChild(el); el.click();
            setTimeout(function () { URL.revokeObjectURL(el.href); el.remove(); }, 800);
        } catch (e) { try { root.slAlert && root.slAlert('Export failed: ' + e.message, { title: 'Qualitative arguments' }); } catch (_) {} }
    }

    // ---- editor (a draft copy: Cancel changes nothing) ------------------------------------------
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _opts(list, sel, ph) { return (ph ? '<option value="">' + _esc(ph) + '</option>' : '') + list.map(function (o) { return '<option value="' + o.v + '"' + (o.v === sel ? ' selected' : '') + '>' + _esc(o.label) + '</option>'; }).join(''); }
    var _draft = null;   // { internalId, sysId, arg }
    function modalHtml() {
        var r = find(_draft.internalId, _draft.sysId); if (!r) return '';
        var f = r.fha, a = _draft.arg, severe = !!SEVERE[f.severity], d = depth(f);
        var inp = function (k, ph) { return '<input type="text" data-a="' + k + '" value="' + _esc(a[k]) + '" placeholder="' + _esc(ph) + '" style="width:100%;">'; };
        var sel = function (k, list) { return '<select data-a="' + k + '" style="width:100%;">' + _opts(list, a[k], 'Choose…') + '</select>'; };
        var probe = Object.assign({}, f, { qualArg: a }), open = check(probe);
        return '<div class="ckpt-modal" role="dialog" aria-modal="true" style="max-width:860px;">' +
            '<div class="ckpt-m-head"><span class="ckpt-designation">ASTM F3230 X2</span><span class="ckpt-m-name">Qualitative argument · ' + _esc(f.fcId || '') + '</span><button class="ckpt-m-close" onclick="SLQualArg.close()" aria-label="Close">×</button></div>' +
            '<div style="padding:14px 18px;max-height:70vh;overflow:auto;">' +
            '<p style="font-size:12px;color:var(--color-text-secondary);"><b>' + _esc(f.fcDesc || '') + '</b> · ' + _esc(f.severity || '') + (r.sysId != null ? ' · ' + _esc(r.sysName) : '') + '<br>' +
            (d && d.mode === 'qualitative' ? 'This condition is on the qualitative-only path' + (d.uncharacterized ? ' by default for this certification class' : '') + '. Record why that is enough.' : 'This condition is not on the qualitative-only path right now; an argument recorded here is kept but not required.') + '</p>' +
            '<div class="ckpt-m-sec">1. Conventional</div><div class="grid-3-col" style="gap:8px;"><div>' + sel('conventional', YN) + '</div><div style="grid-column:span 2;">' + inp('conventionalBasis', 'Which established designs it matches, and their service history') + '</div></div>' +
            '<div class="ckpt-m-sec" style="margin-top:10px;">2. Simple</div><div class="grid-3-col" style="gap:8px;"><div>' + sel('simple', YN) + '</div><div>' + sel('simpleHow', HOW) + '</div><div>' + inp('simpleBasis', 'Reference (FMEA id, report…)') + '</div></div>' +
            '<div class="ckpt-m-sec" style="margin-top:10px;">3. Why the failure is not expected</div><div class="grid-3-col" style="gap:8px;"><div style="grid-column:span 2;">' + inp('likelihood', 'Redundancy, independence, margins, inspections…') + '</div><div>' + inp('likelihoodEvidence', 'Evidence reference') + '</div></div>' +
            (severe ? '<div class="ckpt-m-sec" style="margin-top:10px;">4. Common cause</div>' + CCA.map(function (x) {
                var e = (a.cca || {})[x.k] || {};
                return '<div class="grid-3-col" style="gap:8px;margin-bottom:4px;"><div style="font-size:12px;">' + _esc(x.label) + '</div><div><select data-c="' + x.k + '.done" style="width:100%;">' + _opts(DONE, e.done, 'Choose…') + '</select></div>' +
                    '<div><input type="text" data-c="' + x.k + '.ref" value="' + _esc(e.ref) + '" placeholder="ZSA / PRA / CMA reference" style="width:100%;"></div></div>';
            }).join('') : '') +
            '<div class="ckpt-m-sec" style="margin-top:10px;">' + (severe ? '5' : '4') + '. Conclusion</div><div class="grid-3-col" style="gap:8px;"><div>' + sel('conclusion', CONCL) + '</div><div>' + inp('by', 'Signed by') + '</div><div><input type="date" data-a="date" value="' + _esc(a.date) + '" style="width:100%;"></div></div>' +
            (open.length ? '<div style="margin-top:10px;font-size:11.5px;color:#9A6200;">Open: ' + _esc(open.map(function (x) { return x.text; }).join(' · ')) + '</div>' : '') +
            '</div><div class="ckpt-m-foot"><span class="ckpt-m-outputs">Shown in the per-failure-condition evaluation of every report; gaps show in INV-57.</span>' +
            '<span class="ckpt-m-actions"><button class="ckpt-m-btn" onclick="SLQualArg.close()">Cancel</button><button class="ckpt-m-btn ckpt-m-btn-primary" onclick="SLQualArg._save()">Save</button></span></div></div>';
    }
    function open(internalId, sysId) {
        if (!root.document) return;
        var r = find(internalId, sysId); if (!r) return;
        close();
        var base = blank(), cur = r.fha.qualArg ? JSON.parse(JSON.stringify(r.fha.qualArg)) : {};
        var arg = Object.assign(base, cur); arg.cca = Object.assign(blank().cca, cur.cca || {});
        _draft = { internalId: internalId, sysId: sysId == null ? null : sysId, arg: arg };
        var ov = root.document.createElement('div'); ov.id = 'qarg-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:10050;';
        ov.innerHTML = modalHtml();
        root.document.body.appendChild(ov);
    }
    function close() { try { var o = root.document && root.document.getElementById('qarg-overlay'); if (o) o.remove(); } catch (_) {} _draft = null; }
    function _collect() {
        var ov = root.document && root.document.getElementById('qarg-overlay'); if (!ov || !_draft) return;
        Array.prototype.forEach.call(ov.querySelectorAll('[data-a]'), function (el) { _draft.arg[el.getAttribute('data-a')] = String(el.value || '').trim(); });
        Array.prototype.forEach.call(ov.querySelectorAll('[data-c]'), function (el) {
            var p = el.getAttribute('data-c').split('.'); _draft.arg.cca[p[0]] = _draft.arg.cca[p[0]] || { done: '', ref: '' }; _draft.arg.cca[p[0]][p[1]] = String(el.value || '').trim();
        });
    }
    // The chart walkthrough's own button: argue the row it is showing.
    function openFromChart() {
        var act = null; try { if (typeof _fhaChartActive !== 'undefined') act = _fhaChartActive; } catch (_) {}
        act = act || root._fhaChartActive; if (!act) return;
        var sysId = null;
        if (act.scope === 'sys') { try { var s = (typeof sys === 'function') ? sys() : null; sysId = s ? s.id : null; } catch (_) {} }
        open(act.internalId, sysId);
    }

    var api = {
        rows: rows, find: find, isQualitative: isQualitative, blank: blank, check: check, findings: findings, line: line, INV: INV,
        exportCsv: exportCsv, download: download, open: open, openFromChart: openFromChart, close: close, modalHtml: modalHtml,
        _save: function () {
            if (!_draft) return; _collect();
            var r = find(_draft.internalId, _draft.sysId);
            if (r) {
                r.fha.qualArg = _draft.arg;
                try { if (typeof root.scheduleAutosave === 'function') root.scheduleAutosave(); } catch (_) {}
                try { if (typeof root.showToast === 'function') root.showToast('Qualitative argument saved for ' + (r.fha.fcId || 'FC') + '.', 'success', 2500); } catch (_) {}
            }
            close();
        },
        _draftFor: function () { return _draft; }
    };
    try { root.SLQualArg = api; } catch (_) {}
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

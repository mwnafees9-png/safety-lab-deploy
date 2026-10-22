// ============================================================================
// afha_template.js, v1.0, 21 Oct 2026: a customer's own AFHA layout, for that customer's build only.
//
// Waqas (21 Oct 2026): a customer sent the AFHA template they work to and want it "for
// themselves in safetylabaero": the Aircraft FHA page and its export in their columns and
// wording. Rulings: only on their build (switched on by their signed license, the feature
// "afha-customer-template"); phases stay one list per failure condition, as now; Informal Review
// Comments stay out (Safety Lab's own review column does that job); and "safety lab fills
// deterministically where it can, JAMA ID and everything should be through live JAMA tracking".
//
// THEIR COLUMNS, AND WHERE EACH VALUE COMES FROM
//   Title       "<Jama key> <Jama function name>, Rev <n>": the sub-function's Jama item
//               (row.fnSource from live Jama tracking); its own id and name when it is not in Jama
//   Rev         the Jama item's version (fnSource.version, read by the live bridge)
//   Function    "a. <the Jama item's description>"
//   FDAL        A to E from the worst severity among that function's failure conditions
//   FFC         the failure condition, with "(crew aware)" / "(crew not aware)" from the FCIM
//   Flight Phase, Flight Phase Consolidated   the row's phases, and the same as whole runs of
//               the project's phase table ("All flight phases", "Taxi to Takeoff, Landing")
//   Failure Effect Description, A/C, Flight Crew, Supernumeraries effects   the row's effects
//               and the level chosen on each axis
//   Severity    CAT / HAZ / MAJ / MIN / NSE
//   Impact      typed if the engineer chose; else Availability for a loss (total or partial
//               slot in the FCIM, or the wording) and Integrity for a malfunction
//   Assumptions and Reference Material   the linked assumptions, the comments, the supporting
//               material (typed; else the certification basis's 1309 paragraph)
//   Validation  method, regulatory reference(s), justification: typed; blank method takes the
//               method their guidelines give for that severity; a No Safety Effect row with no
//               justification takes the statement their guidelines recommend
//   Verification  the fault trees that actually analyze this failure condition; else the
//               analysis the severity calls for, marked planned; or what the engineer typed
//   Revision History   every change to the row, recorded as it happens (who, when, what)
// Nothing here is drafted by AI. Every value is either read from the model or typed.
// ============================================================================
(function (root) {
    'use strict';
    var FEATURE = 'afha-customer-template';
    function S(v) { return v == null ? '' : String(v).trim(); }
    function arr(a) { return Array.isArray(a) ? a : []; }

    // ------------------------------------------------------------------ pure rules
    var SEV_CODE = { Catastrophic: 'CAT', Hazardous: 'HAZ', Major: 'MAJ', Minor: 'MIN', Negligible: 'NSE', 'No Safety Effect': 'NSE' };
    var SEV_RANK = { NSE: 0, MIN: 1, MAJ: 2, HAZ: 3, CAT: 4 };
    var FDAL_OF = { CAT: 'A', HAZ: 'B', MAJ: 'C', MIN: 'D', NSE: 'E' };
    function sevCode(sev) { var s = S(sev); return SEV_CODE[s] || (SEV_RANK[s.toUpperCase()] != null ? s.toUpperCase() : ''); }
    function fdalFor(rows) {
        var worst = -1, code = '';
        arr(rows).forEach(function (r) { var c = sevCode(r && r.severity); if (c && SEV_RANK[c] > worst) { worst = SEV_RANK[c]; code = c; } });
        return code ? FDAL_OF[code] : '';
    }
    function phaseList(row) {
        var p = row && row.phases;
        if (Array.isArray(p)) return p.map(S).filter(Boolean);
        return S(p).split(',').map(S).filter(Boolean);
    }
    // whole runs of the project's phase order; every phase -> "All flight phases"
    function phasesConsolidated(list, order) {
        list = arr(list); order = arr(order).map(S).filter(Boolean);
        if (!list.length) return '';
        if (list.some(function (p) { return /^all( flight)? phases$/i.test(p); })) return 'All flight phases';
        if (order.length && order.every(function (p) { return list.indexOf(p) >= 0; })) return 'All flight phases';
        var idx = list.map(function (p) { return order.indexOf(p); });
        if (!order.length || idx.some(function (i) { return i < 0; })) return list.join(', ');
        idx.sort(function (a, b) { return a - b; });
        var runs = [], start = idx[0], prev = idx[0];
        for (var i = 1; i <= idx.length; i++) {
            if (i < idx.length && idx[i] === prev + 1) { prev = idx[i]; continue; }
            runs.push(start === prev ? order[start] : order[start] + ' to ' + order[prev]);
            if (i < idx.length) { start = prev = idx[i]; }
        }
        return runs.join(', ');
    }
    function fcimSlot(fcId, fcim) {
        var id = S(fcId); if (!id) return null;
        var out = null;
        arr(fcim).some(function (r) {
            if (!r) return false;
            if (S(r.tlId) === id) out = { slot: 'TL', awareness: r.awareness };
            else if (S(r.plId) === id) out = { slot: 'PL', awareness: r.awareness };
            else if (S(r.mId) === id) out = { slot: 'M', awareness: r.awareness };
            return !!out;
        });
        return out;
    }
    function awarenessText(a) {
        var s = S(a).toLowerCase();
        if (!s || s === 'n/a' || s === 'na') return '';
        if (/\bun|not|unaware/.test(s)) return '(crew not aware)';
        if (/aware/.test(s)) return '(crew aware)';
        return '';
    }
    function ffcText(row, fcim) {
        var base = [S(row.fcId), S(row.fcDesc)].filter(Boolean).join(' ');
        if (/aware/i.test(base)) return base;
        var sl = fcimSlot(row.fcId, fcim), aw = sl ? awarenessText(sl.awareness) : '';
        return aw ? base + '\n' + aw : base;
    }
    var IMPACTS = ['Integrity', 'Availability', 'Continuity', 'Accuracy'];
    function impactFor(row, fcim) {
        var typed = arr(row && row.impact).filter(function (x) { return IMPACTS.indexOf(x) >= 0; });
        if (typed.length) return { values: typed, auto: false };
        var sl = fcimSlot(row && row.fcId, fcim);
        if (sl) return { values: [sl.slot === 'M' ? 'Integrity' : 'Availability'], auto: true };
        var t = S(row && row.fcDesc).toLowerCase();
        var v = [];
        if (/\b(loss|lost|loses|unavailable|inoperative|fails? to|no longer|inability|degraded|reduced)\b/.test(t)) v.push('Availability');
        if (/\b(erroneous|misleading|uncommanded|inadvertent|malfunction|incorrect|spurious|unintended|hazardously misleading|wrong)\b/.test(t)) v.push('Integrity');
        return { values: v, auto: true };
    }
    function effectsText(row) {
        return 'Aircraft: ' + (S(row.effAc) || 'N/A') + '\n\nFlight Crew: ' + (S(row.effCrew) || 'N/A') + '\n\nSupernumeraries: ' + (S(row.effPax) || 'N/A');
    }
    function cap(s) { s = S(s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
    function levelText(row, key) { return cap(row && row[key]); }
    // the certification basis's 1309 paragraph, when the basis is one we know
    function supportingDefault(regulation) {
        var r = S(regulation).toLowerCase();
        if (/part\s*25|cs-?25/.test(r)) return /cs/.test(r) ? 'CS 25.1309' : '14 CFR §25.1309';
        if (/part\s*23|cs-?23/.test(r)) return /cs/.test(r) ? 'CS 23.2510' : '14 CFR §23.2510';
        if (/part\s*27|cs-?27/.test(r)) return '14 CFR §27.1309';
        if (/part\s*29|cs-?29/.test(r)) return '14 CFR §29.1309';
        return '';
    }
    function assumptionsText(row, asmStore, regulation) {
        var ids = arr(row && row.assumptionIds);
        var lines = ids.map(function (id) {
            var a = arr(asmStore).find(function (x) { return x && S(x.asmId) === S(id); });
            return a && S(a.text) ? S(id) + ': ' + S(a.text) : S(id);
        });
        var sup = S(row && row.supporting) || supportingDefault(regulation) || 'N/A';
        return 'Assumptions:\n' + (lines.length ? lines.join('\n') : 'N/A') + '\n\nComments:\n' + (S(row && row.comments) || 'N/A') + '\n\nSupporting Material(s):\n' + sup;
    }
    // their guidelines (Guidelines tab, column M): the method each class is normally validated by
    var METHOD_BY_SEV = { CAT: 'Engineering review', HAZ: 'Test', MAJ: 'Test', MIN: 'Test', NSE: 'Engineering review' };
    var METHODS = ['Test', 'Analysis', 'Engineering review', 'Similarity'];
    var NSE_STATEMENT = 'The worst case effect is shown to have no safety effect to the aircraft, flight crew, or occupants.';
    function validationParts(row) {
        var c = sevCode(row && row.severity);
        var method = S(row && row.valMethod), auto = !method;
        if (!method) method = METHOD_BY_SEV[c] || '';
        var just = S(row && row.valJustification);
        if (!just && c === 'NSE') just = NSE_STATEMENT;
        return { method: method, methodAuto: auto, ref: S(row && row.valRegRef) || 'N/A', justification: just };
    }
    function validationText(row) {
        var v = validationParts(row);
        return 'Validation Method:\n' + (v.method || 'N/A') + '\n\nRegulatory Reference(s):\n' + v.ref + '\n\nJustification for Classification:\n' + (v.justification || 'N/A');
    }
    function treesFor(row, pages) {
        var id = S(row && row.internalId);
        return arr(pages).filter(function (p) {
            if (!p || p.verifies) return false;
            var ids = Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
            return ids.map(String).indexOf(id) >= 0;
        });
    }
    var PLAN_BY_SEV = { CAT: 'FTA (planned)', HAZ: 'FTA (planned)', MAJ: 'FTA (planned)', MIN: 'Qualitative (FHA and design review)', NSE: 'None required' };
    function verificationText(row, pages) {
        var typed = S(row && row.verification);
        if (typed) return typed;
        var t = treesFor(row, pages);
        if (t.length) return 'FTA: ' + t.map(function (p) { return S(p.name) || S(p.id); }).join(', ');
        return PLAN_BY_SEV[sevCode(row && row.severity)] || '';
    }
    function titleFor(fn, fallbackSubId) {
        if (!fn) return { title: S(fallbackSubId), rev: '', func: '' };
        var src = fn.fnSource && fn.fnSource.tool === 'jama-live' ? fn.fnSource : null;
        var key = src ? S(src.key) : S(fn.subId || fn.funcId);
        var name = S(fn.subName || fn.funcName);
        var rev = src && src.version != null ? String(src.version) : '';
        var def = S(fn.subDef || fn.funcDef);
        return { title: [key, name].filter(Boolean).join(' ') + (rev ? ', Rev ' + rev : ''), rev: rev, func: def ? 'a. ' + def : '', jama: !!src };
    }
    // ---- revision history: every change to a row, as it happens ----
    var TRACK = ['subId', 'fcId', 'fcDesc', 'phases', 'effAc', 'effCrew', 'effPax', 'effAcLevel', 'effCrewLevel', 'effPaxLevel', 'severity', 'assumptionIds', 'comments',
                 'impact', 'valMethod', 'valRegRef', 'valJustification', 'supporting', 'verification'];
    var TRACK_LABEL = { subId: 'sub-function', fcId: 'FC ID', fcDesc: 'failure condition', phases: 'flight phases', effAc: 'aircraft effect', effCrew: 'flight crew effect',
                        effPax: 'supernumeraries effect', effAcLevel: 'aircraft effect level', effCrewLevel: 'crew effect level', effPaxLevel: 'supernumeraries effect level',
                        severity: 'severity', assumptionIds: 'assumptions', comments: 'comments', impact: 'impact', valMethod: 'validation method',
                        valRegRef: 'regulatory reference', valJustification: 'justification', supporting: 'supporting material', verification: 'verification' };
    function snap(row) { var o = {}; TRACK.forEach(function (k) { var v = row ? row[k] : null; o[k] = Array.isArray(v) ? v.map(S).join('|') : S(v); }); return o; }
    // Compare each row with what was last recorded on it; record what changed. Returns the number
    // of rows that gained an entry. The record travels with the row (sync, save, export), so the
    // person who made a change records it and everyone else receives it already recorded.
    function recordChanges(rows, by, at) {
        var n = 0;
        arr(rows).forEach(function (r) {
            if (!r) return;
            var now = snap(r), was = r._afhaLast;
            if (!Array.isArray(r.revLog)) r.revLog = [];
            if (!was) {
                // a row seen for the first time: its history starts here. A row that already has a
                // history (made on another computer before this one recorded it) only takes the
                // starting point, so its first entry is never written twice.
                r._afhaLast = now;
                if (!r.revLog.length) r.revLog.push({ at: at, by: by, what: 'First recorded' });
                n++;
                return;
            }
            var changed = TRACK.filter(function (k) { return S(was[k]) !== S(now[k]); });
            if (!changed.length) return;
            var parts = changed.map(function (k) { return k === 'severity' ? 'severity ' + (sevCode(was[k]) || 'none') + ' to ' + (sevCode(now[k]) || 'none') : TRACK_LABEL[k]; });
            r.revLog.push({ at: at, by: by, what: parts.join(', ') + ' changed' });
            r._afhaLast = now; n++;
        });
        return n;
    }
    function revisionText(row) {
        return arr(row && row.revLog).map(function (e) { return S(e.at).slice(0, 10) + (S(e.by) ? ' ' + S(e.by) : '') + ': ' + S(e.what); }).join('\n');
    }

    // One AFHA row, every column, as text (the page and the export read the same thing).
    function rowValues(row, ctx) {
        var fn = arr(ctx.functions).find(function (f) { return f && S(f.subId) && S(f.subId) === S(row.subId); });
        var t = titleFor(fn, row.subId);
        var imp = impactFor(row, ctx.fcim);
        var ph = phaseList(row);
        return {
            title: t.title, rev: t.rev, func: t.func, jama: !!t.jama, fdal: '',
            ffc: ffcText(row, ctx.fcim), phase: ph.join(', '), phaseConsolidated: phasesConsolidated(ph, ctx.phaseOrder),
            effects: effectsText(row), acLevel: levelText(row, 'effAcLevel'), crewLevel: levelText(row, 'effCrewLevel'), paxLevel: levelText(row, 'effPaxLevel'),
            severity: sevCode(row.severity), impact: imp.values.join(' / '), impactAuto: imp.auto,
            assumptions: assumptionsText(row, ctx.assumptions, ctx.regulation), validation: validationText(row),
            verification: verificationText(row, ctx.pages), revision: revisionText(row)
        };
    }
    // Groups: one per sub-function (their merged Title / Rev / Function cells), in function-tree
    // order, inside one sheet per top-level aircraft function. FDAL is set per group.
    function buildGroups(ctx) {
        var fns = arr(ctx.functions);
        var order = (root.SLFuncTree && typeof root.SLFuncTree.ordered === 'function') ? root.SLFuncTree.ordered(fns) : fns.slice();
        var posOf = {}; order.forEach(function (f, i) { if (f && S(f.subId) && posOf[S(f.subId)] == null) posOf[S(f.subId)] = i; });
        var bySub = {};
        arr(ctx.rows).forEach(function (r) { if (!r || r.obsolete) return; var k = S(r.subId); (bySub[k] = bySub[k] || []).push(r); });
        var subs = Object.keys(bySub).sort(function (a, b) { var pa = posOf[a] == null ? 1e9 : posOf[a], pb = posOf[b] == null ? 1e9 : posOf[b]; return (pa - pb) || (a < b ? -1 : a > b ? 1 : 0); });
        var sheets = [], sheetOf = {};
        subs.forEach(function (sub) {
            var fn = fns.find(function (f) { return f && S(f.subId) === sub; });
            var topId = fn ? S(fn.funcId) : '', topName = fn ? S(fn.funcName) : '';
            var key = topId || '(no function)';
            if (!sheetOf[key]) { sheetOf[key] = { funcId: topId, funcName: topName || topId || 'Failure conditions not under a function', groups: [] }; sheets.push(sheetOf[key]); }
            var rows = bySub[sub].slice();   // in the worksheet's own order, as the engineer arranged them
            var fdal = fdalFor(rows);
            sheetOf[key].groups.push({ subId: sub, rows: rows.map(function (r) { var v = rowValues(r, ctx); v.fdal = fdal; v.internalId = r.internalId; return v; }) });
        });
        return sheets;
    }

    var core = { FEATURE: FEATURE, sevCode: sevCode, fdalFor: fdalFor, phasesConsolidated: phasesConsolidated, fcimSlot: fcimSlot, ffcText: ffcText,
                 impactFor: impactFor, effectsText: effectsText, assumptionsText: assumptionsText, supportingDefault: supportingDefault,
                 validationParts: validationParts, validationText: validationText, verificationText: verificationText, titleFor: titleFor,
                 recordChanges: recordChanges, revisionText: revisionText, rowValues: rowValues, buildGroups: buildGroups,
                 METHODS: METHODS, IMPACTS: IMPACTS, NSE_STATEMENT: NSE_STATEMENT };
    root.SLAfhaTplCore = core;
    if (typeof module !== 'undefined' && module.exports) module.exports = core;
})(typeof window !== 'undefined' ? window : globalThis);

// ============================================================================
// The page: their layout on the Aircraft FHA tab, their fields in the form. Browser only.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    var W = window, C = W.SLAfhaTplCore;
    function S(v) { return v == null ? '' : String(v).trim(); }
    // The app's stores are top-level script bindings, reachable by name from any classic script.
    function g(name) {
        try {
            switch (name) {
                case 'acFhaData':         return typeof acFhaData !== 'undefined' ? acFhaData : undefined;
                case 'acFunctionsData':   return typeof acFunctionsData !== 'undefined' ? acFunctionsData : undefined;
                case 'acFcimData':        return typeof acFcimData !== 'undefined' ? acFcimData : undefined;
                case 'acAssumptionsData': return typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : undefined;
                case 'ftaPages':          return typeof ftaPages !== 'undefined' ? ftaPages : undefined;
                case 'flightPhasesData':  return typeof flightPhasesData !== 'undefined' ? flightPhasesData : undefined;
                case 'projectConfig':     return typeof projectConfig !== 'undefined' ? projectConfig : undefined;
                case 'editStates':        return typeof editStates !== 'undefined' ? editStates : undefined;
            }
        } catch (_) {}
        return W[name];
    }
    function E(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function br(s) { return E(s).replace(/\n/g, '<br>'); }

    function active() {
        try { var L = W.SLLicense; return !!(L && L.valid && Array.isArray(L.features) && L.features.indexOf(C.FEATURE) >= 0); } catch (_) { return false; }
    }
    function me() {
        try { var s = W.getSupabaseSession && W.getSupabaseSession(); if (s && s.user && s.user.email) return String(s.user.email); } catch (_) {}
        try { return localStorage.getItem('safetyLab.signup.email') || ''; } catch (_) { return ''; }
    }
    function ctx() {
        var phases = (g('flightPhasesData') || []).map(function (r) { return S(r && r.phase); }).filter(Boolean);
        var pc = g('projectConfig') || {};
        return { rows: g('acFhaData') || [], functions: g('acFunctionsData') || [], fcim: g('acFcimData') || [], assumptions: g('acAssumptionsData') || [],
                 pages: g('ftaPages') || [], phaseOrder: phases.filter(function (p, i) { return phases.indexOf(p) === i; }), regulation: pc.regulation || '' };
    }

    // -------------------------------------------------- the table, in their columns
    var COLS = ['Title', 'Rev', 'Function', 'FDAL', 'Function Failure Condition (FFC)', 'Flight Phase', 'Flight Phase Consolidated', 'Failure Effect Description',
                'A/C Failure Effect', 'Flight Crew Effect', 'Supernumeraries Effect', 'Severity Classification', 'Impact', 'Assumptions and Reference Material',
                'Validation (Justification for Classification)', 'Verification (Depth of Analysis)', 'Revision History'];
    function renderTable() {
        var std = document.getElementById('ac-fha-table');
        var host = document.getElementById('afha-tpl-host');
        if (!active()) { if (host) host.style.display = 'none'; if (std) std.style.display = ''; return; }
        if (!std) return;
        if (!host) { host = document.createElement('div'); host.id = 'afha-tpl-host'; std.parentNode.insertBefore(host, std); }
        std.style.display = 'none'; host.style.display = '';
        var c = ctx();
        var by = me(), n = C.recordChanges(c.rows, by, new Date().toISOString());
        if (n) { try { if (typeof W.scheduleAutosave === 'function') W.scheduleAutosave(); } catch (_) {} }
        var sheets = C.buildGroups(c);
        var html = '<table id="afha-tpl-table" class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>Actions</th>' + COLS.map(function (h) { return '<th>' + E(h) + '</th>'; }).join('') + '<th>Review</th></tr></thead><tbody>';
        if (!sheets.length) html += '<tr><td colspan="' + (COLS.length + 2) + '" style="color:var(--color-text-tertiary);">No failure conditions yet.</td></tr>';
        sheets.forEach(function (sh) {
            html += '<tr><td colspan="' + (COLS.length + 2) + '" style="font-weight:700; background:var(--color-surface-2);">' + E((sh.funcId ? sh.funcId + ' ' : '') + sh.funcName) + '</td></tr>';
            sh.groups.forEach(function (gr) {
                gr.rows.forEach(function (v, i) {
                    var sevCls = { CAT: 'Catastrophic', HAZ: 'Hazardous', MAJ: 'Major', MIN: 'Minor', NSE: 'Negligible' }[v.severity] || '';
                    html += '<tr>' +
                        '<td>' + (typeof W.rowActionsHTML === 'function' ? W.rowActionsHTML('editACFHA', 'deleteACFHA', v.internalId, '') : '') + '</td>' +
                        (i === 0 ? '<td rowspan="' + gr.rows.length + '"><strong>' + E(v.title) + '</strong>' + (v.jama ? '' : '<div style="font-size:10.5px; color:var(--color-text-tertiary);">not tracked in Jama</div>') + '</td><td rowspan="' + gr.rows.length + '">' + E(v.rev) + '</td><td rowspan="' + gr.rows.length + '">' + br(v.func) + '</td>' : '') +
                        '<td>' + E(v.fdal) + '</td><td>' + br(v.ffc) + '</td><td>' + E(v.phase) + '</td><td>' + E(v.phaseConsolidated) + '</td><td style="min-width:220px;">' + br(v.effects) + '</td>' +
                        '<td>' + E(v.acLevel) + '</td><td>' + E(v.crewLevel) + '</td><td>' + E(v.paxLevel) + '</td>' +
                        '<td class="cell-' + sevCls + '"><strong>' + E(v.severity) + '</strong></td><td>' + E(v.impact) + (v.impactAuto && v.impact ? ' <span style="font-size:10px; color:var(--color-text-tertiary);">auto</span>' : '') + '</td>' +
                        '<td style="min-width:220px;">' + br(v.assumptions) + '</td><td style="min-width:220px;">' + br(v.validation) + '</td><td>' + br(v.verification) + '</td><td style="min-width:180px; font-size:11px;">' + br(v.revision) + '</td>' +
                        '<td>' + (typeof W.reviewCellHtml === 'function' ? W.reviewCellHtml('acFha', v.internalId, null) : '') + '</td></tr>';
                });
            });
        });
        html += '</tbody></table>';
        host.innerHTML = html;
    }

    // -------------------------------------------------- the form: their fields
    function ensureForm() {
        var pax = document.getElementById('ac-fha-eff-pax');
        if (pax) {
            var lab = pax.previousElementSibling;
            if (lab && lab.tagName === 'LABEL') {
                if (!lab.dataset.afhaStd) lab.dataset.afhaStd = lab.textContent;
                lab.textContent = active() ? 'Supernumeraries effect' : lab.dataset.afhaStd;
            }
        }
        var box = document.getElementById('afha-tpl-fields');
        if (!active()) { if (box) box.style.display = 'none'; return; }
        if (!box) {
            var anchor = document.getElementById('ac-fha-comments');
            var form = anchor && anchor.closest ? anchor.closest('.controls') : null;
            if (!form) return;
            box = document.createElement('div'); box.id = 'afha-tpl-fields';
            box.style.cssText = 'margin-top:14px; padding:10px 12px; border:1px solid var(--color-border-hair);';
            box.innerHTML = '<div style="font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:6px;">AFHA template columns</div>' +
                '<div style="font-size:11.5px; color:var(--color-text-tertiary); margin-bottom:8px;">Leave a field blank and Safety Lab fills it from the model by the template\'s guidelines (shown in gray). Title, Rev, Function and FDAL come from live Jama tracking and the severity.</div>' +
                '<div class="grid-2-col"><div><label>Impact</label><div id="afha-impact">' + C.IMPACTS.map(function (x) { return '<label style="display:inline-flex; gap:4px; margin-right:10px; font-weight:400;"><input type="checkbox" value="' + x + '"> ' + x + '</label>'; }).join('') + '</div><div id="afha-impact-auto" style="font-size:11px; color:var(--color-text-tertiary);"></div></div>' +
                '<div><label>Validation method</label><select id="afha-val-method"><option value="">By severity (template guidelines)</option>' + C.METHODS.map(function (m) { return '<option value="' + m + '">' + m + '</option>'; }).join('') + '</select></div>' +
                '<div><label>Regulatory reference(s)</label><input type="text" id="afha-val-ref" placeholder="N/A or 14 CFR §25.XXXX (Amdt. 25-xxx)"></div>' +
                '<div><label>Supporting material(s)</label><input type="text" id="afha-supporting" placeholder=""></div>' +
                '<div style="grid-column: 1 / -1;"><label>Justification for classification</label><textarea id="afha-val-just" rows="2" style="width:100%;"></textarea></div>' +
                '<div style="grid-column: 1 / -1;"><label>Verification (depth of analysis)</label><input type="text" id="afha-verification" placeholder=""></div></div>';
            form.appendChild(box);
        }
        box.style.display = '';
        var pc = g('projectConfig') || {};
        var sup = document.getElementById('afha-supporting'); if (sup) sup.placeholder = C.supportingDefault(pc.regulation) || 'e.g. 14 CFR §25.1309';
    }
    function fillForm(row) {
        ensureForm(); if (!active()) return;
        row = row || {};
        var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
        Array.prototype.forEach.call(document.querySelectorAll('#afha-impact input'), function (cb) { cb.checked = Array.isArray(row.impact) && row.impact.indexOf(cb.value) >= 0; });
        set('afha-val-method', row.valMethod || ''); set('afha-val-ref', row.valRegRef || ''); set('afha-supporting', row.supporting || '');
        set('afha-val-just', row.valJustification || ''); set('afha-verification', row.verification || '');
        var c = ctx(), auto = C.impactFor(Object.assign({}, row, { impact: [] }), c.fcim);
        var ai = document.getElementById('afha-impact-auto'); if (ai) ai.textContent = auto.values.length ? 'Left blank: ' + auto.values.join(' / ') : '';
        var ve = document.getElementById('afha-verification'); if (ve) ve.placeholder = C.verificationText(Object.assign({}, row, { verification: '' }), c.pages) || '';
    }
    function readForm() {
        var get = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
        return {
            impact: Array.prototype.filter.call(document.querySelectorAll('#afha-impact input'), function (cb) { return cb.checked; }).map(function (cb) { return cb.value; }),
            valMethod: get('afha-val-method'), valRegRef: get('afha-val-ref'), supporting: get('afha-supporting'),
            valJustification: get('afha-val-just'), verification: get('afha-verification')
        };
    }

    // -------------------------------------------------- wiring
    function wrapAll() {
        if (typeof W.renderACFHA === 'function' && !W.renderACFHA._afhaTpl) {
            var r0 = W.renderACFHA;
            var r1 = function () { var out = r0.apply(this, arguments); try { renderTable(); ensureForm(); } catch (e) { console.warn('[afha-template] render:', e); } return out; };
            Object.keys(r0).forEach(function (k) { try { r1[k] = r0[k]; } catch (_) {} });
            r1._afhaTpl = true; W.renderACFHA = r1;
        }
        if (typeof W.editACFHA === 'function' && !W.editACFHA._afhaTpl) {
            var e0 = W.editACFHA;
            var e1 = function (iId) {
                var out = e0.apply(this, arguments);
                var fill = function () { try { var row = (g('acFhaData') || []).find(function (x) { return String(x.internalId) === String(iId); }); fillForm(row); } catch (_) {} };
                if (out && typeof out.then === 'function') return out.then(function (v) { fill(); return v; });
                fill(); return out;
            };
            e1._afhaTpl = true; W.editACFHA = e1;
        }
        if (typeof W.submitACFHA === 'function' && !W.submitACFHA._afhaTpl) {
            var s0 = W.submitACFHA;
            var s1 = function () {
                if (!active()) return s0.apply(this, arguments);
                var extra = readForm();
                var es = g('editStates') || {};
                var editing = es.acFha, data = g('acFhaData') || [], before = data.length;
                var out = s0.apply(this, arguments);
                var row = editing ? data.find(function (x) { return String(x.internalId) === String(editing); }) : (data.length > before ? data[data.length - 1] : null);
                if (row) { Object.assign(row, extra); fillForm({}); try { W.renderACFHA(); } catch (_) {} try { if (typeof W.scheduleAutosave === 'function') W.scheduleAutosave(); } catch (_) {} }
                return out;
            };
            s1._afhaTpl = true; W.submitACFHA = s1;
        }
        // the export, in the FHA tab's Data Actions
        var std = document.querySelector('[onclick="exportData(\'AC_FHA\', \'excel\')"]');
        if (std && !document.getElementById('afha-tpl-export')) {
            var a = document.createElement('div'); a.id = 'afha-tpl-export'; a.textContent = 'Export AFHA (your template)';
            a.onclick = function () { if (W.SLAfhaTplExport) W.SLAfhaTplExport.run(); };
            var b = document.createElement('div'); b.id = 'afha-tpl-template'; b.textContent = 'Load your AFHA template file…';
            b.onclick = function () { if (W.SLAfhaTplExport) W.SLAfhaTplExport.pickTemplate(); };
            std.parentNode.insertBefore(b, std.nextSibling); std.parentNode.insertBefore(a, std.nextSibling);
        }
        ['afha-tpl-export', 'afha-tpl-template'].forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = active() ? '' : 'none'; });
    }
    function refresh() { try { wrapAll(); if (typeof W.renderACFHA === 'function') W.renderACFHA(); } catch (_) {} }
    W.SLAfhaTpl = { active: active, refresh: refresh, render: renderTable, fillForm: fillForm, readForm: readForm, ctx: ctx };
    function boot() {
        wrapAll();
        var ready = W.__slabSignedLicenseReady;
        if (ready && typeof ready.then === 'function') ready.then(function () { if (active()) refresh(); }, function () {});
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    // a license checked again after sign-in (SLLicenseCheckIdentity) can switch it on later
    setTimeout(function () { if (active()) refresh(); }, 4000);
})();

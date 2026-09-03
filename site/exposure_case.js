// ============================================================================
// exposure_case.js — v1.0 — ARP-EXP: the G.11.1.3 NAMED at-risk cases.
//
// The quantification math was already right — exposureMode (continuous /
// active / latent / manual), phase windows, dormancy intervals and monitor
// coverage all resolve correctly in fta_quant_modules. What was missing is
// the STANDARD'S NAME for each event's exposure basis: which G.11.1.3 case
// governs it, what that case's default rule derives, and whether the event's
// other attributes agree with the case it claims. This module adds exactly
// that naming-and-demonstration layer. NO NEW MATH — deriveT() reads the
// same fields the engine reads, so the named case and the computed number
// can never diverge.
//
//   · CASES — the named case catalogue (id, clause, rule, expectation).
//   · caseOf(node) — the authored selection (node.g1113 = {caseId, rationale?}).
//   · deriveT(node) — the case's default exposure + its SOURCE, from fields
//     the model already has. Never invents a number.
//   · consistency(node) — does the claimed case agree with the event's own
//     attributes (exposureMode, monitor coverage, dormancy interval)?
//     "An annunciated case with partial coverage is two different stories."
//   · INV-38 (advisory) — on Catastrophic/Hazardous trees: an event with no
//     case named, or a case its attributes contradict, flags in the sweep.
//     Three exits; no "mark as reviewed".
//   · Page — 'Exposure cases' under Trees & models (born-modular runtime
//     registration, mirrors monitor_spec.js): every basic event on a
//     Cat/Haz tree in one table, case selector + override rationale.
//
// Display-lane discipline: the ONLY store write is the author adapter
// setCase(), which sets node.g1113 on the tree node (rides ftaPages
// persistence — no new persistence sites). Override without a rationale is
// REFUSED: an unexplained exposure is a guess wearing a suit.
// ============================================================================
(function () {
    'use strict';

    // ---- the named cases ----------------------------------------------------
    // Original factual statements of the case classes (facts about the
    // standard's exposure taxonomy — clause pointers, never pasted text).
    const CASES = [
        { id: 'a', name: 'Active & annunciated', clause: 'G.11.1.3(a)',
          rule: 'at-risk is the flight — the failure is detected when it happens; default T = mission (or at-risk phase) exposure',
          expects: 'exposureMode continuous or active; detection annunciated (no partial-coverage monitor)' },
        { id: 'c', name: 'Latent between scheduled checks', clause: 'G.11.1.3(c)',
          rule: 'exposure is the interval of the check that detects it; default T = dormancy interval',
          expects: 'exposureMode latent with a dormancy interval > 0' },
        { id: 'd', name: 'Verified pre-flight', clause: 'G.11.1.3(d)',
          rule: 'exposure is the time since last verification; default T = one flight',
          expects: 'per-flight exposure — mode continuous with T = the mission, or manual T = one flight' },
        { id: 'ov', name: 'Override — stated exposure', clause: 'G.11.1.3 (documented deviation)',
          rule: 'any other exposure basis, with a WRITTEN rationale — an unexplained exposure is a guess wearing a suit',
          expects: 'rationale required; refused without one' }
    ];
    const _byId = {}; CASES.forEach(c => { _byId[c.id] = c; });

    function caseOf(node) {
        const g = node && node.g1113;
        if (!g || !_byId[g.caseId]) return null;
        return { caseId: g.caseId, rationale: g.rationale || null, def: _byId[g.caseId] };
    }

    // ---- derivation: the case's default T + its source ----------------------
    // Reads the SAME fields fta_quant reads (and _nodeExposureTime when it is
    // loaded), so the named number is the engine's number.
    function _globalT() {
        try { return (typeof ftaConfig === 'object' && ftaConfig && parseFloat(ftaConfig.exposureTime)) || 1; }
        catch (_) { return 1; }
    }
    function deriveT(node) {
        const sel = caseOf(node);
        if (!sel) return { T: null, source: 'no case selected', ok: false };
        const engineT = (typeof _nodeExposureTime === 'function') ? _nodeExposureTime(node, _globalT()) : null;
        switch (sel.caseId) {
            case 'a': {
                const mode = node.exposureMode || 'continuous';
                if (mode === 'active') return { T: engineT, source: 'Σ at-risk phase durations (mission profile)', ok: true };
                return { T: engineT != null ? engineT : _globalT(), source: 'global mission exposure (ftaConfig)', ok: true };
            }
            case 'c': {
                const t = parseFloat(node.dormancyInterval);
                if (isFinite(t) && t > 0) return { T: t, source: 'dormancy interval on the event (latent mode)', ok: true };
                return { T: null, source: 'Case C claimed but NO dormancy interval on the event', ok: false };
            }
            case 'd': return { T: _globalT(), source: 'one flight (global mission exposure)', ok: true };
            case 'ov': {
                const t = parseFloat(node.exposureTime);
                if (isFinite(t) && t > 0) return { T: t, source: 'stated exposure (manual) — rationale on file', ok: true };
                return { T: engineT != null ? engineT : _globalT(), source: 'engine exposure — rationale on file', ok: true };
            }
        }
        return { T: null, source: 'unknown case', ok: false };
    }

    // ---- consistency: does the claimed case match the event's attributes? ---
    function _coverageFor(node) {
        try {
            if (typeof monitorSpecFor !== 'function' || node.logicalId == null) return null;
            const spec = monitorSpecFor(node.logicalId);
            if (!spec) return null;
            const c = parseFloat(spec.coverage);
            return isFinite(c) ? c : null;
        } catch (_) { return null; }
    }
    function consistency(node) {
        const sel = caseOf(node);
        const issues = [];
        if (!sel) return { ok: false, issues: ['no G.11.1.3 case selected — exposure is being consumed by the quantification without a named basis'] };
        const mode = node.exposureMode || 'continuous';
        const cov = _coverageFor(node);
        if (sel.caseId === 'a') {
            if (mode === 'latent') issues.push('declares Case A (annunciated) but the event is in LATENT mode — two different stories; pick one');
            if (cov != null && cov < 100) issues.push('declares Case A (annunciated) but carries a monitor spec with ' + cov + '% coverage — an annunciated case with partial coverage is two different stories; pick one');
        }
        if (sel.caseId === 'c') {
            if (mode !== 'latent') issues.push('declares Case C (latent between checks) but exposureMode is "' + mode + '" — the engine is not using an inspection interval for this event');
            else if (!(parseFloat(node.dormancyInterval) > 0)) issues.push('declares Case C but has no dormancy interval — the case names an interval that does not exist');
        }
        if (sel.caseId === 'ov' && !(sel.rationale || '').trim())
            issues.push('override case with NO rationale on file — refused at authoring; if you are seeing this, the data was imported around the guard');
        return { ok: issues.length === 0, issues: issues };
    }

    // ---- tree walking (Cat/Haz trees only) ----------------------------------
    function _sevOfPage(p) {
        try {
            const ids = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
            let best = null;
            const rank = { 'Catastrophic': 2, 'Hazardous': 1 };
            const all = [].concat(
                (typeof acFhaData !== 'undefined' ? acFhaData : []) || [],
                (typeof getAllSysFha === 'function' ? getAllSysFha() : []));
            ids.forEach(id => {
                const f = all.find(x => x && String(x.internalId) === String(id).replace('AC_', '').replace('SYS_', ''));
                if (f && rank[f.severity] != null && (best == null || rank[f.severity] > rank[best])) best = f.severity;
            });
            return best;
        } catch (_) { return null; }
    }
    function _leaves(root, out) {
        out = out || [];
        (function walk(n) {
            if (!n) return;
            const kids = n.children || n._children || [];
            if (n.type !== 'gate' && (!kids || !kids.length)) out.push(n);
            (kids || []).forEach(walk);
        })(root);
        return out;
    }
    // Every basic event on a Catastrophic/Hazardous tree, with its verdicts.
    function sweep() {
        const rows = [];
        const pages = (typeof ftaPages !== 'undefined' ? ftaPages : []) || [];
        pages.forEach(p => {
            if (!p || !p.root) return;
            const sev = _sevOfPage(p);
            if (!sev) return;                                  // Cat/Haz trees only
            _leaves(p.root).forEach(n => {
                const d = deriveT(n), c = consistency(n);
                rows.push({ pageId: p.id, page: p.name || ('FT-' + p.id), severity: sev,
                            lid: n.logicalId != null ? n.logicalId : (n.id != null ? n.id : ''),
                            name: n.name || n.desc || '(unnamed event)',
                            node: n, sel: caseOf(n), T: d.T, source: d.source, derivedOk: d.ok,
                            consistent: c.ok, issues: c.issues });
            });
        });
        return rows;
    }

    // ---- INV-38 (advisory) --------------------------------------------------
    // (INV-33 rbd_xcheck · 34 mod_impact · 35/36 HF · 37 STPA — 38 is free.)
    if (typeof invRegister === 'function') {
        invRegister({ id: 'INV-38', sev: 'advisory',
            name: 'G.11.1.3 exposure cases — every Cat/Haz basic event names its at-risk case, and the case agrees with the event',
            run: function () {
                try {
                    const rows = sweep();
                    if (!rows.length) return { checked: 0, fails: [] };   // silent when no Cat/Haz trees
                    const fails = [];
                    rows.forEach(r => { if (!r.consistent) r.issues.forEach(i => fails.push(r.page + ' · ' + r.name + ': ' + i)); });
                    return { checked: rows.length, fails: fails };
                } catch (_) { return { checked: 0, fails: [] }; }
            } });
    }

    // ---- author adapter (the ONLY write) ------------------------------------
    function setCase(pageId, lid, caseId, rationale) {
        const pages = (typeof ftaPages !== 'undefined' ? ftaPages : []) || [];
        const p = pages.find(x => x && String(x.id) === String(pageId));
        if (!p || !p.root) return false;
        let target = null;
        _leaves(p.root).forEach(n => { if (String(n.logicalId != null ? n.logicalId : n.id) === String(lid)) target = n; });
        if (!target) return false;
        if (caseId == null) { delete target.g1113; }
        else {
            if (!_byId[caseId]) return false;
            if (caseId === 'ov' && !(rationale || '').trim()) {
                try { if (typeof showToast === 'function') showToast('Not set — the override case demands a written rationale. An unexplained exposure is a guess wearing a suit.', 'error', 4600); } catch (_) {}
                return false;
            }
            target.g1113 = caseId === 'ov' ? { caseId: 'ov', rationale: String(rationale).trim() } : { caseId: caseId };
        }
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        _render();
        return true;
    }

    // ---- page (born-modular runtime registration, mirrors monitor_spec) -----
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function _ensurePage() {
        if (typeof document === 'undefined') return false;
        if (!document.getElementById('view-expcase')) {
            const prev = document.getElementById('view-monitors') || document.getElementById('view-bowtie');
            if (!prev || !prev.parentNode) return false;
            const v = document.createElement('div'); v.id = 'view-expcase'; v.style.display = 'none';
            prev.parentNode.insertBefore(v, prev.nextSibling);
        }
        if (!document.getElementById('snav-expcase')) {
            const prevNav = document.getElementById('snav-monitors') || document.getElementById('snav-bowtie');
            // 23 Aug 2026 — no nav row: a Fault-trees TAB now (prove_tabs.js), label clean of clause numbers.
        }
        return true;
    }
    function _render() {
        if (typeof document === 'undefined') return;
        const host = document.getElementById('view-expcase'); if (!host) return;
        const rows = sweep();
        const opts = sel => '<option value="">— select case —</option>' + CASES.map(c =>
            '<option value="' + c.id + '"' + (sel && sel.caseId === c.id ? ' selected' : '') + '>' + esc(c.name + ' · ' + c.clause) + '</option>').join('');
        host.innerHTML =
            '<div class="header-with-export"><h3>Exposure cases — G.11.1.3 <span class="u-mono" style="font-size:10.5px; font-weight:700; color:#6D28D9; border:1px solid #6D28D955; background:#6D28D90D; border-radius:5px; padding:2px 8px; vertical-align:3px;">NAMED AT-RISK BASES</span></h3></div>' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); ">The quantification already computes each event’s exposure correctly — this page NAMES the G.11.1.3 case behind it, derives the default from fields the model already has, and flags a case the event’s own attributes contradict. Every Catastrophic/Hazardous basic event, one table, one auditable answer. No new math: the named number IS the engine’s number.</p>' +
            (!rows.length ? '<div style="font-size:12px; color:var(--color-text-tertiary); padding:14px;">No basic events on Catastrophic/Hazardous trees yet — the sweep populates when the classical lane does.</div>' :
            '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>Tree · severity</th><th>Basic event</th><th style="min-width:230px;">G.11.1.3 case</th><th>Derived T · source</th><th>Consistency</th></tr></thead><tbody>' +
            rows.map(r =>
                '<tr><td class="u-mono" style="font-size:10.5px;">' + esc(r.page) + '<br><span style="color:' + (r.severity === 'Catastrophic' ? '#B91C1C' : '#B7791F') + '; font-weight:700;">' + esc(r.severity.toUpperCase()) + '</span></td>' +
                '<td>' + esc(r.name) + ' <span class="u-mono" style="font-size:9.5px; color:var(--color-text-tertiary);">' + esc(String(r.lid)) + '</span></td>' +
                '<td><select style="font:inherit; font-size:11px; width:100%; padding:3px 6px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); border-radius:4px;" onchange="EXPOSURE_CASE.uiSet(\'' + esc(String(r.pageId)) + '\',\'' + esc(String(r.lid)) + '\', this.value)">' + opts(r.sel) + '</select>' +
                (r.sel && r.sel.rationale ? '<div style="font-size:10px; color:var(--color-text-tertiary); margin-top:2px;" title="' + esc(r.sel.rationale) + '">rationale on file</div>' : '') + '</td>' +
                '<td class="u-mono" style="font-size:10.5px;">' + (r.T != null ? esc(String(r.T)) + ' FH' : '—') + '<br><span style="color:var(--color-text-tertiary);">' + esc(r.source) + '</span></td>' +
                '<td>' + (r.consistent
                    ? '<span class="u-mono" style="font-size:9.5px; font-weight:700; color:#1D9E75; border:1px solid #1D9E7555; background:#1D9E750D; border-radius:4px; padding:1px 7px;">CONSISTENT</span>'
                    : '<span class="u-mono" style="font-size:9.5px; font-weight:700; color:#B7791F; border:1px solid #B7791F55; background:#B7791F0D; border-radius:4px; padding:1px 7px;" title="' + esc(r.issues.join(' · ')) + '">' + r.issues.length + ' ISSUE' + (r.issues.length === 1 ? '' : 'S') + '</span>' +
                      '<div style="font-size:10px; color:var(--color-text-secondary); margin-top:2px; max-width:260px;">' + r.issues.map(esc).join('<br>') + '</div>') + '</td></tr>').join('') +
            '</tbody></table>') +
            '<div style="font-size:10.5px; color:var(--color-text-tertiary); margin-top:8px;">INV-38 (advisory) carries these into the invariant sweep and the evidence package. Three exits per flag: select the case · fix the conflicting attribute · accept via the override case with a written rationale.</div>';
    }
    const API = { CASES: CASES, caseOf: caseOf, deriveT: deriveT, consistency: consistency, sweep: sweep, setCase: setCase,
        uiSet: function (pageId, lid, caseId) {
            if (caseId === 'ov') {
                const ask = (typeof slPrompt === 'function') ? slPrompt : (m, d) => Promise.resolve(typeof prompt === 'function' ? prompt(m, d) : null);
                ask('Override exposure basis — the documented rationale (required): WHY does this event’s at-risk time deviate from every named case?', '', { title: 'G.11.1.3 override', okText: 'Set' })
                    .then(r => { if (r != null) setCase(pageId, lid, 'ov', String(r)); else _render(); });
            } else setCase(pageId, lid, caseId || null);
        },
        render: _render };

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        (function wrapNav() {
            if (typeof window.switchTab !== 'function' || window.switchTab._expcaseWrapped) return;
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try {
                    const v = document.getElementById('view-expcase');
                    if (v) v.style.display = (tabId === 'expcase') ? 'block' : 'none';
                    const sn = document.getElementById('snav-expcase');
                    if (sn) sn.classList.toggle('snav-active', tabId === 'expcase');
                    if (tabId === 'expcase') _render();
                } catch (_) {}
                return r;
            };
            wrapped._expcaseWrapped = true;
            window.switchTab = wrapped;
        })();
        (function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); })(function () {
            let tries = 30; const t = setInterval(function () { if (_ensurePage() || --tries <= 0) clearInterval(t); }, 250);
        });
    }
    if (typeof window !== 'undefined') window.EXPOSURE_CASE = API;
    if (typeof module !== 'undefined') module.exports = API;
})();

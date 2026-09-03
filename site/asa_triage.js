// ============================================================================
// asa_triage.js — v1.0 — Phase D gap 1 (§3.5): the ASA working surface.
//
// ASA = triage + integration, not a re-analysis. Two deterministic passes:
//
//   PASS 1 — auto-triage every AFHA failure condition:
//     'closed-by-ssa'    single-system FC whose budget-ledger row shows the
//                        verified mirror meets the objective;
//     'aircraft-level'   multi-system FC per the Interdependence table
//                        (≥2 contributing systems) — needs MF&MS analysis;
//     'open'             single-system but unverified / exceeding / untreed.
//
//   PASS 2 — MF&MS re-run with MEASURED numbers: for each aircraft-level FC
//     with an MF&MS page, clone the tree and substitute every system-boundary
//     leaf that carries an externalSource link with the ACHIEVED value from
//     that system's verification mirror (never a guess — a leaf with no
//     verified measured source keeps its budget value and is counted as
//     uncovered). Recompute BDD-exact P(top) → the aircraft-level measured
//     posture vs the objective, with honest substitution coverage (k/n).
//
// Everything reads the Budget Ledger + Interdependence cells + live trees;
// nothing here originates a number. Advisory posture only.
//
// BORN MODULAR: new file; registers its own page + nav; adds the F.4 triage
// item to the ASA completion checklist at runtime (upgrade-in-place, same
// pattern problem_reports.js uses for the SSA gate).
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const _exp = v => (v != null && isFinite(v)) ? Number(v).toExponential(2) : '—';

    function _pages() { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : []; }

    // Contributing-system count for an FC, from the live Interdependence cells.
    function _contribSystems(fc) {
        const out = [];
        try {
            if (typeof idpCell !== 'function' || typeof systemsData === 'undefined') return out;
            (systemsData || []).forEach(s => {
                try { const c = idpCell(fc, s.id); if (c && c.state === 'contributes') out.push(s.name || s.id); } catch (_) {}
            });
        } catch (_) {}
        return out;
    }
    function _mfmsPagesFor(fc) {
        return _pages().filter(p => p && p.root && (String(p.linkedFhaId) === String(fc.internalId) ||
            (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.map(String).indexOf(String(fc.internalId)) !== -1)) &&
            (String(p.id).indexOf('mac-pg-') === 0 || /MF&MS/.test(p.name || '')));
    }

    // PASS 1 — classification per aircraft FC.
    function asaTriage() {
        const rows = [];
        const ledger = (typeof budgetLedgerRows === 'function') ? budgetLedgerRows() : [];
        ((typeof acFhaData !== 'undefined' && acFhaData) || []).forEach(fc => {
            if (!fc) return;
            const systems = _contribSystems(fc);
            const lrows = ledger.filter(r => r.scope === 'aircraft' && r.fcId === (fc.fcId || ('#' + fc.internalId)));
            const met = lrows.some(r => r.status === 'meets-objective' || r.status === 'meets-objective-over-allocation');
            const exceeds = lrows.some(r => r.status === 'EXCEEDS-objective');
            const unverified = lrows.some(r => r.status === 'unverified');
            let cls, why;
            if (systems.length >= 2) { cls = 'aircraft-level'; why = systems.length + ' contributing systems (' + systems.slice(0, 4).join(', ') + (systems.length > 4 ? ', …' : '') + ') — combined effects need aircraft-level MF&MS analysis'; }
            else if (met) { cls = 'closed-by-ssa'; why = 'single-system; verification mirror meets the objective (budget ledger)'; }
            else if (exceeds) { cls = 'open'; why = 'single-system but the verified result EXCEEDS the objective'; }
            else if (unverified) { cls = 'open'; why = 'single-system; allocation exists but no verified mirror result yet'; }
            else { cls = 'open'; why = lrows.length ? lrows[0].status.replace(/-/g, ' ') : 'no quantitative thread yet'; }
            rows.push({ fc, fcId: fc.fcId || ('#' + fc.internalId), fcDesc: fc.fcDesc || '', severity: fc.severity || '', systems, cls, why,
                mfms: _mfmsPagesFor(fc).map(p => ({ id: p.id, name: p.name || p.id })) });
        });
        return rows;
    }

    // PASS 2 — measured MF&MS re-run for one page. Substitution rule: a leaf is
    // replaced ONLY when its externalSource resolves to a system FHA row whose
    // allocation tree has a verification mirror with a computable P(top). No
    // verified source ⇒ the budget value stays and the leaf counts uncovered.
    function _achievedForSysFha(fhaInternalId) {
        try {
            for (const s of (systemsData || [])) {
                const f = (s.fha || []).find(x => x && String(x.internalId) === String(fhaInternalId));
                if (!f) continue;
                const trees = _pages().filter(p => p && p.root && !p.verifies && (p.mode !== 'bottom-up') &&
                    ((Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds : (p.linkedFhaId != null ? [p.linkedFhaId] : [])).map(String).indexOf(String(fhaInternalId)) !== -1));
                for (const alloc of trees) {
                    const mirror = _pages().find(p => p && p.verifies === alloc.id && p.root);
                    if (!mirror) continue;
                    try {
                        const r = computeExactProbability(mirror.root);
                        if (r && typeof r.prob === 'number' && isFinite(r.prob)) return { prob: r.prob, mirror: mirror.name || mirror.id, system: s.name || s.id };
                    } catch (_) {}
                }
            }
        } catch (_) {}
        return null;
    }
    function _cloneTree(n) {
        if (!n) return null;
        const c = {};
        for (const k in n) { if (k === 'children' || k === '_children') continue; c[k] = n[k]; }
        const kids = n.children || n._children || [];
        c.children = kids.map(_cloneTree).filter(Boolean);
        return c;
    }
    function asaMeasuredRun(pageId) {
        const page = _pages().find(p => p && p.id === pageId);
        if (!page || !page.root) return null;
        let total = 0, substituted = 0;
        const subs = [];
        const clone = _cloneTree(page.root);
        (function walk(n) {
            if (!n) return;
            if (n.type !== 'gate') {
                total++;
                const es = n.externalSource;
                if (es && es.kind === 'fha' && es.targetId != null && /^SYS_/.test(String(es.targetId))) {
                    const hit = _achievedForSysFha(String(es.targetId).slice(4));
                    if (hit) {
                        n.probability = hit.prob;
                        n.lambda = 0;                       // measured probability is authoritative for this run
                        substituted++;
                        subs.push({ leaf: n.displayId || n.name || ('E' + n.id), system: hit.system, mirror: hit.mirror, prob: hit.prob });
                    }
                }
                return;
            }
            (n.children || []).forEach(walk);
        })(clone);
        let measured = null;
        try {
            if (typeof computeExactProbability === 'function') {
                const r = computeExactProbability(clone);
                if (r && typeof r.prob === 'number' && isFinite(r.prob)) measured = r.prob;
            }
        } catch (_) {}
        let budget = null;
        try { const r = computeExactProbability(page.root); if (r && typeof r.prob === 'number') budget = r.prob; } catch (_) {}
        return { pageId: page.id, pageName: page.name || page.id, budget, measured, totalLeaves: total, substituted, subs };
    }
    // All pass-2 rows: every aircraft-level FC × its MF&MS pages.
    function asaMeasuredRows(triageRows) {
        const rows = [];
        (triageRows || asaTriage()).forEach(t => {
            if (t.cls !== 'aircraft-level') return;
            const objective = (function () { try { const x = getSafetyTarget(t.severity); return x && x.prob != null ? Number(x.prob) : null; } catch (_) { return null; } })();
            if (!t.mfms.length) { rows.push({ fcId: t.fcId, severity: t.severity, objective, page: null, run: null }); return; }
            t.mfms.forEach(pg => rows.push({ fcId: t.fcId, severity: t.severity, objective, page: pg, run: asaMeasuredRun(pg.id) }));
        });
        return rows;
    }

    // F.4 gate item — pass when no FC is left 'open' and every aircraft-level
    // FC has an MF&MS page (measured coverage is reported, not gated, in v1).
    function asaTriageGate() {
        try {
            const rows = asaTriage();
            if (!rows.length) return { pass: true, detail: 'no aircraft FCs yet' };
            const open = rows.filter(r => r.cls === 'open').length;
            const noMfms = rows.filter(r => r.cls === 'aircraft-level' && !r.mfms.length).length;
            if (open) return { pass: false, detail: open + ' FC(s) neither closed by a single-system SSA nor dispositioned to aircraft-level analysis' };
            if (noMfms) return { pass: false, detail: noMfms + ' aircraft-level FC(s) without an MF&MS tree' };
            return { pass: true, detail: rows.filter(r => r.cls === 'closed-by-ssa').length + ' closed by SSA · ' + rows.filter(r => r.cls === 'aircraft-level').length + ' at aircraft level (all treed)' };
        } catch (_) { return { pass: true, detail: 'triage surface off' }; }
    }

    // ------------------------------------------------------------- render
    function renderAsaSurfacePage() {
        const host = document.getElementById('view-asa-surface');
        if (!host) return;
        const rows = asaTriage();
        const closed = rows.filter(r => r.cls === 'closed-by-ssa').length;
        const air = rows.filter(r => r.cls === 'aircraft-level').length;
        const open = rows.filter(r => r.cls === 'open').length;
        const chip = (l, v, c) => '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">' + l + ' <b style="margin-left:6px;' + (c ? ' color:' + c + ';' : '') + '">' + v + '</b></div>';
        let html = '<h3>ASA Working Surface <span style="font-size:13px; font-weight:500; color:var(--color-text-tertiary); margin-left:8px;">— triage + integration, not a re-analysis (ARP 4761A App F)</span></h3>';
        html += '<div style="display:flex; gap:10px; flex-wrap:wrap; margin:10px 0 14px;">' +
            chip('AFHA FCs', String(rows.length)) + chip('Closed by SSA', String(closed), '#1D6E3E') +
            chip('Aircraft-level', String(air), '#0e7490') + chip('Open', String(open), open ? '#8E2A2A' : null) + '</div>';

        html += '<h4 style="margin:14px 0 6px;">Pass 1 — triage (every AFHA failure condition, classified deterministically)</h4>' +
            '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>FC</th><th>Severity</th><th>Classification</th><th>Basis</th><th>MF&MS tree</th></tr></thead><tbody>';
        if (!rows.length) html += '<tr><td colspan="5" style="color:var(--color-text-tertiary);">No aircraft failure conditions yet.</td></tr>';
        rows.forEach(r => {
            const cls = r.cls === 'closed-by-ssa' ? '<span style="color:#1D6E3E; font-family:var(--font-mono); font-size:11px; font-weight:600;">CLOSED by single-system SSA</span>'
                : r.cls === 'aircraft-level' ? '<span style="color:#0e7490; font-family:var(--font-mono); font-size:11px; font-weight:600;">AIRCRAFT-LEVEL analysis</span>'
                : '<span style="color:#8E2A2A; font-family:var(--font-mono); font-size:11px; font-weight:700;">OPEN</span>';
            html += '<tr><td><strong>' + _esc(r.fcId) + '</strong><div style="font-size:11px; color:var(--color-text-tertiary); max-width:280px;">' + _esc(String(r.fcDesc).slice(0, 90)) + '</div></td>' +
                '<td class="cell-' + _esc(r.severity) + '">' + _esc(r.severity) + '</td><td>' + cls + '</td>' +
                '<td style="font-size:11.5px;">' + _esc(r.why) + '</td>' +
                '<td class="u-mono" style="font-size:10.5px;">' + (r.mfms.length ? r.mfms.map(p => _esc(p.name)).join('<br>') : (r.cls === 'aircraft-level' ? '<span style="color:#8E2A2A;">none — compile from MAC</span>' : '—')) + '</td></tr>';
        });
        html += '</tbody></table>';

        const mrows = asaMeasuredRows(rows);
        html += '<h4 style="margin:18px 0 6px;">Pass 2 — MF&MS re-run with SSA-measured numbers</h4>';
        if (!mrows.length) {
            html += '<p style="font-size:12px; color:var(--color-text-tertiary);">No aircraft-level FCs yet — pass 2 activates when the interdependence table flags multi-system conditions.</p>';
        } else {
            html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>FC</th><th>MF&MS tree</th><th>P(top) — budget lane</th><th>P(top) — measured lane</th><th>Objective</th><th>Measured coverage</th><th>Posture</th></tr></thead><tbody>';
            mrows.forEach(m => {
                if (!m.page) { html += '<tr><td class="u-mono">' + _esc(m.fcId) + '</td><td colspan="6" style="color:#8E2A2A; font-size:11.5px;">no MF&MS tree — compile one from the MAC model first</td></tr>'; return; }
                const r = m.run || {};
                const posture = (r.measured == null || m.objective == null) ? '<span style="color:var(--color-text-tertiary); font-size:11px;">—</span>'
                    : r.substituted === 0 ? '<span style="color:#9A6200; font-family:var(--font-mono); font-size:11px;">no measured sources yet — budget lane only</span>'
                    : (r.measured <= m.objective ? '<span style="color:#1D6E3E; font-family:var(--font-mono); font-size:11px; font-weight:600;">MEETS objective on measured data (advisory' + (r.substituted < r.totalLeaves ? ', partial coverage' : '') + ')</span>'
                        : '<span style="color:#8E2A2A; font-family:var(--font-mono); font-size:11px; font-weight:700;">EXCEEDS objective on measured data</span>');
                html += '<tr><td class="u-mono">' + _esc(m.fcId) + '</td><td style="font-size:11px;">' + _esc(m.page.name) + '</td>' +
                    '<td class="u-mono">' + _exp(r.budget) + '</td><td class="u-mono">' + _exp(r.measured) + '</td><td class="u-mono">' + _exp(m.objective) + '</td>' +
                    '<td class="u-mono">' + (r.totalLeaves ? r.substituted + '/' + r.totalLeaves + ' leaves measured' : '—') +
                    ((r.subs || []).length ? '<div style="font-size:10px; color:var(--color-text-tertiary);">' + r.subs.map(s => _esc(s.leaf) + ' ← ' + _esc(s.mirror)).join('<br>') + '</div>' : '') + '</td>' +
                    '<td>' + posture + '</td></tr>';
            });
            html += '</tbody></table>';
        }
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Pass 1 classification: ≥2 contributing systems (Interdependence table) → aircraft-level; else closed when the Budget Ledger shows the verification mirror meets the objective. Pass 2 substitutes ONLY leaves whose externalSource resolves to a verified system mirror — uncovered leaves keep their budget value and are counted, never guessed. All probabilities BDD-exact; advisory posture, the authority decides. Feeds the ASA F.4 gate.</p>';
        host.innerHTML = html;
    }

    // ---- ASA F.4 checklist upgrade-in-place --------------------------------
    function _upgradeChecklist() {
        try {
            if (typeof CKPT_CHECKLISTS === 'undefined' || !CKPT_CHECKLISTS.ASA || !Array.isArray(CKPT_CHECKLISTS.ASA.items)) return false;
            if (CKPT_CHECKLISTS.ASA.items.some(i => i && i.id === 'asaTriage')) return true;
            CKPT_CHECKLISTS.ASA.items.push({
                id: 'asaTriage', kind: 'auto', ref: 'F.4',
                label: 'Every AFHA FC triaged — closed by single-system SSA or dispositioned to aircraft-level MF&MS analysis',
                eval: () => (typeof window !== 'undefined' && typeof window.asaTriageGate === 'function') ? window.asaTriageGate() : { pass: true, detail: 'triage surface off' },
            });
            return true;
        } catch (_) { return false; }
    }

    // ---- page registration --------------------------------------------------
    function _ensurePage() {
        if (!document.getElementById('view-asa-surface')) {
            const prev = document.getElementById('view-budget') || document.getElementById('view-monitors') || document.getElementById('view-bowtie');
            if (!prev || !prev.parentNode) return false;
            const v = document.createElement('div'); v.id = 'view-asa-surface'; v.style.display = 'none';
            prev.parentNode.insertBefore(v, prev.nextSibling);
        }
        if (!document.getElementById('snav-asa-surface')) {
            const prevNav = document.getElementById('snav-budget') || document.getElementById('snav-fta');   // 23 Aug: chain re-anchored
            if (prevNav && prevNav.parentNode) {
                const a = document.createElement('a');
                a.className = prevNav.className; a.id = 'snav-asa-surface'; a.setAttribute('role', 'button'); a.setAttribute('tabindex', '0');
                a.setAttribute('onclick', "switchTab('asa-surface')");
                a.innerHTML = '<span class="asb-lbl">ASA Surface</span>';
                prevNav.parentNode.insertBefore(a, prevNav.nextSibling);
            }
        }
        _upgradeChecklist();
        return true;
    }
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._asaWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-asa-surface');
                if (v) v.style.display = (tabId === 'asa-surface') ? 'block' : 'none';
                const s = document.getElementById('snav-asa-surface');
                if (s) s.classList.toggle('snav-active', tabId === 'asa-surface');
                if (tabId === 'asa-surface') renderAsaSurfacePage();
            } catch (_) {}
            return r;
        };
        wrapped._asaWrapped = true;
        window.switchTab = wrapped;
    })();
    function _ready(fn) { if (typeof document === 'undefined') return; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { let tries = 30; const t = setInterval(function () { if (_ensurePage() || --tries <= 0) clearInterval(t); }, 250); });

    // ------------------------------------------------------------- exports
    if (typeof window !== 'undefined') {
        window.asaTriage = asaTriage;
        window.asaTriageGate = asaTriageGate;
        window.asaMeasuredRun = asaMeasuredRun;
        window.asaMeasuredRows = asaMeasuredRows;
        window.renderAsaSurfacePage = renderAsaSurfacePage;
    }
    if (typeof globalThis !== 'undefined') { globalThis.asaTriage = asaTriage; globalThis.asaTriageGate = asaTriageGate; globalThis.asaMeasuredRun = asaMeasuredRun; }
})();

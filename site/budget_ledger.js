// ============================================================================
// budget_ledger.js — v1.3 — Phase D gap 3 (§3.6): the Budget Ledger,
// + A9 (21 Aug 2026): the budget-decision register (SLBudgetDecisions).
//
// ONE first-class table of every quantitative safety budget: for each failure
// condition — the certification objective (from severity × cert basis), the
// ALLOCATED value (P(top) of the top-down allocation tree), and the ACHIEVED
// value (P(top) of its bottom-up verification mirror), with a deterministic
// posture verdict. Until now this comparison existed only inside report
// builders (G.13 grid, bow-tie knot) — computed on the fly, never as an
// object other surfaces could read. The ledger is that object: the ASA triage
// surface, the SSA/ASA summary charts, and the reports all read ONE source.
//
// Every number is engine-computed (computeExactProbability) or user-entered
// (severity targets); nothing here originates a value. Advisory posture only —
// "meets objective (advisory)" — the authority decides compliance.
//
// BORN MODULAR: new file; registers its own page + nav (monitor_spec pattern);
// exports budgetLedgerRows()/budgetLedgerStats() for ASA, reports, tests.
// ============================================================================
(function () {
    var _sevPill = function (s, o) { return (typeof sevPillHtml === 'function') ? sevPillHtml(s, o) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }; // severity pill (helpers_modules.js); safe when helpers is not loaded (test sandboxes)
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const _exp = v => (v != null && isFinite(v)) ? Number(v).toExponential(2) : '—';

    function _pages() { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : []; }

    // ---------------------------------------------------------------- A9
    // The budget-decision register. Every offered rebalance ends in a RECORD:
    // accepted absorb, signed reserve, or an explicit "did nothing" dismissal —
    // each attributed, dated, carrying a sentence, and reversible (revert()
    // keeps the record and marks it, never deletes). The allocator consults
    // decisionFor(gateId) — an accepted absorb re-enables the pre-A9
    // redistribute for that gate; a reserve marks the margin deliberate;
    // dismissed and reverted decisions change nothing but stay on the books.
    function _bdStore() {
        if (typeof projectConfig === 'undefined' || !projectConfig) return [];
        if (!Array.isArray(projectConfig.budgetDecisions)) projectConfig.budgetDecisions = [];
        return projectConfig.budgetDecisions;
    }
    function bdList() { return _bdStore().slice(); }
    function bdDecisionFor(gateId) {
        const rows = _bdStore().filter(d => d && String(d.gateId) === String(gateId) && !d.reverted && d.kind !== 'dismissed');
        return rows.length ? rows[rows.length - 1] : null;
    }
    function bdRecord(rec) {
        if (!rec || rec.gateId == null || !rec.kind) return null;
        if (['absorb', 'reserve', 'dismissed'].indexOf(rec.kind) === -1) return null;
        if (!String(rec.by || '').trim()) return null;               // attributed, always
        const store = _bdStore();
        const row = {
            id: 'bd-' + (store.length + 1) + '-' + String(rec.gateId),
            gateId: rec.gateId, pageId: rec.pageId || null, kind: rec.kind,
            by: String(rec.by).trim(), at: new Date().toISOString(),
            sentence: String(rec.sentence || '').trim(),
            candidates: rec.candidates || null, chosen: rec.chosen || null,
        };
        store.push(row);
        try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
        return row;
    }
    function bdRevert(id, by) {
        const row = _bdStore().find(d => d && d.id === id && !d.reverted);
        if (!row || !String(by || '').trim()) return false;
        row.reverted = { by: String(by).trim(), at: new Date().toISOString() };
        try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
        return true;
    }

    function _treesFor(iid) {
        return _pages().filter(p => {
            const links = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId != null ? [p.linkedFhaId] : []);
            return links.map(String).indexOf(String(iid)) !== -1;
        });
    }
    function _pTop(page) {
        try {
            if (page && page.root && typeof computeExactProbability === 'function') {
                const r = computeExactProbability(page.root);
                if (r && typeof r.prob === 'number' && isFinite(r.prob)) return r.prob;
            }
        } catch (_) {}
        return null;
    }
    function _objective(sev) {
        try { if (typeof getSafetyTarget === 'function') { const t = getSafetyTarget(sev); if (t && t.prob != null) return Number(t.prob); } } catch (_) {}
        return null;
    }

    // One ledger row per (FC × allocation tree). scope: 'aircraft' | system name.
    function _rowsForFc(f, scopeLabel, systemId) {
        const out = [];
        const sev = f.severity || '';
        const objective = _objective(sev);
        const trees = _treesFor(f.internalId);
        // Allocation lane = top-down, non-mirror pages; each may have a mirror.
        const allocs = trees.filter(p => p.root && !p.verifies && (p.mode !== 'bottom-up'));
        if (!allocs.length) {
            out.push({ fcId: f.fcId || ('#' + f.internalId), fcDesc: f.fcDesc || '', scope: scopeLabel, systemId: systemId || null,
                severity: sev, objective, allocated: null, achieved: null, allocPage: null, mirrorPage: null,
                status: trees.length ? 'no-allocation-tree' : 'no-tree', margin: null });
            return out;
        }
        allocs.forEach(alloc => {
            const mirror = _pages().find(p => p && p.verifies === alloc.id && p.root) || null;
            const allocated = _pTop(alloc);
            const achieved = mirror ? _pTop(mirror) : null;
            let status;
            if (achieved == null) status = 'unverified';
            else if (objective == null) status = 'no-objective';
            else if (achieved <= objective) status = (allocated != null && achieved > allocated) ? 'meets-objective-over-allocation' : 'meets-objective';
            else status = 'EXCEEDS-objective';
            out.push({
                fcId: f.fcId || ('#' + f.internalId), fcDesc: f.fcDesc || '', scope: scopeLabel, systemId: systemId || null,
                severity: sev, objective, allocated, achieved,
                allocPage: { id: alloc.id, name: alloc.name || alloc.id }, mirrorPage: mirror ? { id: mirror.id, name: mirror.name || mirror.id } : null,
                status, margin: (achieved != null && objective != null && achieved > 0) ? objective / achieved : null,
                marginInfo: _marginFor(alloc),
            });
        });
        return out;
    }

    // ---- A9: margin info from the allocation tree ---------------------------
    // Worst-first: over-committed > under-allocated > reserve > absorbed > exact.
    const _MARGIN_RANK = { 'over-committed': 4, 'under-allocated': 3, 'reserve': 2, 'absorbed-by-decision': 1, 'exact': 0 };
    function _marginFor(allocPage) {
        const gates = [];
        if (allocPage && allocPage.root) (function walk(n) {
            if (!n) return;
            if (n._budgetMargin) gates.push({ gateId: n.id, gate: String(n.displayId || n.id), name: n.name || '',
                state: n._budgetMargin.state, mode: n._budgetMargin.mode,
                target: n._budgetMargin.target, achieved: n._budgetMargin.achieved,
                decisionId: n._budgetMargin.decisionId || null });
            (n.children || n._children || []).forEach(walk);
        })(allocPage.root);
        if (!gates.length) return null;
        gates.sort((a, b) => (_MARGIN_RANK[b.state] || 0) - (_MARGIN_RANK[a.state] || 0));
        return { state: gates[0].state, gates };
    }

    // budgetLedgerRows() — the ledger. Aircraft FCs + every system's FCs.
    function budgetLedgerRows() {
        const rows = [];
        try { ((typeof acFhaData !== 'undefined' && acFhaData) || []).forEach(f => { if (f) rows.push.apply(rows, _rowsForFc(f, 'aircraft', null)); }); } catch (_) {}
        try {
            ((typeof systemsData !== 'undefined' && systemsData) || []).forEach(s => {
                if (!s) return;
                (s.fha || []).forEach(f => { if (f) rows.push.apply(rows, _rowsForFc(f, s.name || s.id, s.id)); });
            });
        } catch (_) {}
        return rows;
    }
    function budgetLedgerStats(rows) {
        const r = rows || budgetLedgerRows();
        const by = k => r.filter(x => x.status === k).length;
        return {
            total: r.length,
            met: by('meets-objective') + by('meets-objective-over-allocation'),
            exceeds: by('EXCEEDS-objective'),
            unverified: by('unverified'),
            noTree: by('no-tree') + by('no-allocation-tree'),
            noObjective: by('no-objective'),
            // A9 — the budget tri-state, counted over rows (worst gate per row).
            overCommitted: r.filter(x => x.marginInfo && x.marginInfo.state === 'over-committed').length,
            underAllocated: r.filter(x => x.marginInfo && x.marginInfo.state === 'under-allocated').length,
            reserves: r.filter(x => x.marginInfo && x.marginInfo.state === 'reserve').length,
        };
    }

    // ---- A9: the offered rebalance ------------------------------------------
    function _findGate(pageId, gateId) {
        const p = _pages().find(x => x && x.id === pageId);
        let hit = null;
        if (p && p.root) (function walk(n) { if (!n || hit) return; if (String(n.id) === String(gateId)) { hit = n; return; } (n.children || n._children || []).forEach(walk); })(p.root);
        return { page: p, gate: hit };
    }
    function _reqStores() {
        const out = [];
        try { if (typeof acReqData !== 'undefined' && Array.isArray(acReqData)) out.push({ scope: 'aircraft', reqs: acReqData }); } catch (_) {}
        try { ((typeof systemsData !== 'undefined' && systemsData) || []).forEach(s => { if (s && Array.isArray(s.req)) out.push({ scope: s.name || s.id, reqs: s.req }); }); } catch (_) {}
        return out;
    }
    // Impact preview keyed on ALREADY-ISSUED and EVIDENCED requirements: the
    // requirements whose source names one of the free siblings that would move.
    function _impactReqs(children) {
        const lids = children.map(c => String(c.logicalId || '')).filter(Boolean);
        const hits = [];
        _reqStores().forEach(st => st.reqs.forEach(r => {
            if (!r || r.deleted || !r.reqSource || !r.reqSource.sourceId) return;
            const sid = String(r.reqSource.sourceId);
            if (!lids.some(l => sid.indexOf(l) !== -1)) return;
            hits.push({ traceId: r.traceId || r.id || ('REQ-' + r.internalId), scope: st.scope,
                evidenced: !!(r.verifStatus || r.verificationStatus || r.verifEvidence || (Array.isArray(r.evidence) && r.evidence.length)) });
        }));
        return hits;
    }
    async function slBudgetOffer(pageId, gateId) {
        const { page, gate } = _findGate(pageId, gateId);
        if (!page || !gate || !gate._budgetMargin) { if (typeof showToast === 'function') showToast('No margin recorded on that gate — re-open the tree to re-allocate first.', 'warning', 3500); return; }
        const m = gate._budgetMargin;
        const kids = (gate.children || gate._children || []);
        const free = kids.filter(c => !(c._externalAllocation));
        const factor = (m.achieved > 0 && m.target > 0) ? (m.target / m.achieved) : null;
        const impact = _impactReqs(free);
        const evid = impact.filter(i => i.evidenced);
        const ask = (typeof slPrompt === 'function') ? slPrompt : (msg, d) => Promise.resolve(window.prompt(msg, d));
        if (m.state === 'over-committed') {
            // No fake fix on offer: an over-commit is resolved by changing the
            // constraint or the target, not by arithmetic. The review is logged.
            const sentence = (await ask('OVER-COMMITTED — ' + (gate.displayId || gate.id) + ' on ' + page.name +
                '\nTarget ' + Number(m.target).toExponential(2) + ' vs committed ' + Number(m.achieved).toExponential(2) +
                '\n\nThe gate\u2019s constraints exceed its budget. Resolve by revisiting the constraint (prescribed value / external link) or the tree\u2019s target. ' +
                'This prompt only LOGS your review \u2014 one attributed sentence:', '')) || '';
            if (!String(sentence).trim()) return;
            const by = (await ask('Sign with your name:', (typeof _signoffReviewerName === 'function' && _signoffReviewerName()) || '')) || '';
            if (!String(by).trim()) return;
            bdRecord({ gateId: gate.id, pageId: page.id, kind: 'dismissed', by, sentence });
            if (typeof showToast === 'function') showToast('Review logged \u2014 the gate stays RED until the constraint or target moves.', 'info', 3500);
            renderBudgetLedgerPage();
            return;
        }
        const previewLines = free.slice(0, 4).map(c => {
            const p0 = Number(c.probability || 0);
            const p1 = (factor != null) ? (m.mode === 'AND' ? Math.pow(p0, Math.log(Math.max(m.target, 1e-300)) / Math.log(Math.max(m.achieved, 1e-300))) : p0 * factor) : null;
            return '  \u00b7 ' + (c.displayId || c.name || c.id) + ': ' + p0.toExponential(2) + (p1 != null ? ' \u2192 ~' + p1.toExponential(2) : '');
        }).join('\n');
        const impactLine = impact.length
            ? impact.length + ' issued requirement(s) reference the siblings that would move (' + evid.length + ' EVIDENCED' +
              (impact.length ? ' \u2014 e.g. ' + impact.slice(0, 3).map(i => i.traceId).join(', ') : '') + ')'
            : 'no issued requirements reference the siblings that would move';
        const pick = (await ask('MARGIN HELD \u2014 ' + (gate.displayId || gate.id) + ' on ' + page.name +
            '\nTarget ' + Number(m.target).toExponential(2) + ' \u00b7 allocated ' + Number(m.achieved).toExponential(2) +
            (factor != null ? ' \u00b7 freed \u00d7' + factor.toPrecision(2) : '') +
            '\n\nCandidates:' +
            '\n 1) ABSORB into the free siblings (proportional \u2014 preview):\n' + previewLines +
            '\n    Impact: ' + impactLine +
            '\n 2) HOLD as deliberate reserve (signed \u2014 the amber goes quiet)' +
            '\n 0) Do nothing (logged as reviewed)\n\nChoose 1 / 2 / 0:', '0')) || '';
        const choice = String(pick).trim();
        if (choice !== '1' && choice !== '2' && choice !== '0') return;
        const kind = choice === '1' ? 'absorb' : choice === '2' ? 'reserve' : 'dismissed';
        const sentence = (await ask('One attributed sentence for the record (why):', '')) || '';
        if (!String(sentence).trim()) return;
        const by = (await ask('Sign with your name:', (typeof _signoffReviewerName === 'function' && _signoffReviewerName()) || '')) || '';
        if (!String(by).trim()) return;
        bdRecord({ gateId: gate.id, pageId: page.id, kind, by, sentence,
            candidates: ['absorb-proportional', 'hold-reserve', 'dismiss'], chosen: kind });
        try { if (typeof window._slSharedStrictestRound === 'function') window._slSharedStrictestRound(); } catch (_) {}
        if (typeof showToast === 'function') showToast(kind === 'absorb' ? 'Absorb recorded \u2014 the gate closes on its target through the register (reversible).'
            : kind === 'reserve' ? 'Reserve signed \u2014 the margin is deliberate.' : '\u201cDid nothing\u201d logged.', 'success', 4000);
        renderBudgetLedgerPage();
    }
    async function slBudgetRevert(id) {
        const ask = (typeof slPrompt === 'function') ? slPrompt : (msg, d) => Promise.resolve(window.prompt(msg, d));
        const by = (await ask('Revert this budget decision \u2014 the record stays on the books, marked reverted. Sign with your name:',
            (typeof _signoffReviewerName === 'function' && _signoffReviewerName()) || '')) || '';
        if (!String(by).trim()) return;
        bdRevert(id, by);
        try { if (typeof window._slSharedStrictestRound === 'function') window._slSharedStrictestRound(); } catch (_) {}
        renderBudgetLedgerPage();
    }

    // ------------------------------------------------------------- render
    const _chip = (l, v, color) => '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">' + l + ' <b style="margin-left:6px;' + (color ? ' color:' + color + ';' : '') + '">' + v + '</b></div>';
    function _statusHtml(s) {
        if (s === 'meets-objective') return '<span style="color:#1D6E3E; font-family:var(--font-mono); font-size:11px; font-weight:600;">MEETS objective (advisory)</span>';
        if (s === 'meets-objective-over-allocation') return '<span style="color:#9A6200; font-family:var(--font-mono); font-size:11px; font-weight:600;">meets objective · over its allocation</span>';
        if (s === 'EXCEEDS-objective') return '<span style="color:#8E2A2A; font-family:var(--font-mono); font-size:11px; font-weight:700;">EXCEEDS objective</span>';
        if (s === 'unverified') return '<span style="color:#9A6200; font-family:var(--font-mono); font-size:11px;">unverified — no mirror result</span>';
        if (s === 'no-objective') return '<span style="color:var(--color-text-tertiary); font-size:11px;">no quantitative objective</span>';
        if (s === 'no-allocation-tree') return '<span style="color:var(--color-text-tertiary); font-size:11px;">trees linked, none top-down</span>';
        return '<span style="color:var(--color-text-tertiary); font-size:11px;">no tree linked</span>';
    }
    function renderBudgetLedgerPage() {
        const host = document.getElementById('view-budget');
        if (!host) return;
        // A9 — margins are allocation artifacts: refresh them before reading
        // (only pages with a declared target allocate; that is the honest scope).
        try { if (typeof window._slSharedStrictestRound === 'function') window._slSharedStrictestRound(); } catch (_) {}
        const rows = budgetLedgerRows();
        const st = budgetLedgerStats(rows);
        let html = '<h3>Budget Ledger <span style="font-size:13px; font-weight:500; color:var(--color-text-tertiary); margin-left:8px;">— every published allocation vs its verified result, one table (ARP 4761A G.13 / B.4.1 / D.4.2)</span></h3>';
        html += '<div style="display:flex; gap:10px; flex-wrap:wrap; margin:10px 0 14px;">' +
            _chip('Budgets', String(st.total)) +
            _chip('Meet objective', String(st.met), '#1D6E3E') +
            _chip('Exceed', String(st.exceeds), st.exceeds ? '#8E2A2A' : null) +
            _chip('Unverified', String(st.unverified), st.unverified ? '#9A6200' : null) +
            _chip('No tree', String(st.noTree + st.noObjective)) +
            _chip('Over-committed', String(st.overCommitted), st.overCommitted ? '#8E2A2A' : null) +
            _chip('Margin held', String(st.underAllocated), st.underAllocated ? '#9A6200' : null) +
            (st.reserves ? _chip('Reserves', String(st.reserves), '#1D6E3E') : '') + '</div>';
        if (st.overCommitted) {
            html += '<div style="border:1px solid #8E2A2A; padding:8px 12px; margin-bottom:var(--s-3); font-size:12px;">' +
                '<b style="color:#8E2A2A;">COMPLETION GATE:</b> ' + st.overCommitted + ' over-committed budget' + (st.overCommitted === 1 ? '' : 's') +
                ' \u2014 the PASA checklist item fails until the constraint or target moves (or the review is logged). Advisory posture: nothing is locked.</div>';
        }
        // ENG-2 phase 1 — paginated render (50/page default). The posture chips
        // above stay computed over ALL rows; the pager bar says so.
        html += '<div id="budget-pager"></div>';
        html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr>' +
            '<th>FC</th><th>Scope</th><th>Severity</th><th>Objective (/FH)</th><th>Allocated (top-down)</th><th>Achieved (mirror)</th><th>Margin</th><th>Budget state (A9)</th><th>Posture</th><th>Trees</th></tr></thead><tbody id="budget-tbody">';
        html += '</tbody></table>' +
            '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Objective from severity × certification basis (user-configured targets) · allocated = BDD-exact P(top) of the top-down allocation tree · achieved = BDD-exact P(top) of its bottom-up verification mirror · advisory posture, the authority decides. The ASA triage surface and the SSA/ASA report summary read THIS ledger.</p>';
        host.innerHTML = html;

        function _rowHtml(r) {
            return '<tr><td><strong>' + _esc(r.fcId) + '</strong><div style="font-size:11px; color:var(--color-text-tertiary); max-width:260px;">' + _esc(String(r.fcDesc).slice(0, 90)) + '</div></td>' +
                '<td>' + _esc(r.scope) + '</td>' +
                '<td class="cell-' + _esc(r.severity) + '">' + _sevPill(r.severity) + '</td>' +
                '<td class="u-mono">' + _exp(r.objective) + '</td>' +
                '<td class="u-mono">' + (r.allocPage ? _exp(r.allocated) + '<div style="font-size:10px; color:var(--color-text-tertiary);">' + _esc(r.allocPage.name) + '</div>' : '—') + '</td>' +
                '<td class="u-mono">' + (r.mirrorPage ? _exp(r.achieved) + '<div style="font-size:10px; color:var(--color-text-tertiary);">' + _esc(r.mirrorPage.name) + '</div>' : '—') + '</td>' +
                '<td class="u-mono">' + (r.margin != null ? (r.margin >= 1 ? '×' + r.margin.toPrecision(2) : '×' + r.margin.toPrecision(2) + ' (short)') : '—') + '</td>' +
                '<td>' + _marginCell(r) + '</td>' +
                '<td>' + _statusHtml(r.status) + '</td>' +
                '<td class="u-mono" style="font-size:10px;">' + (r.allocPage ? _esc(r.allocPage.id) : '') + (r.mirrorPage ? ' ⇄ ' + _esc(r.mirrorPage.id) : '') + '</td></tr>';
        }
        const tbody = document.getElementById('budget-tbody');
        const pagerHost = document.getElementById('budget-pager');
        const renderPage = (from, to) => {
            if (!tbody) return;
            if (!rows.length) { tbody.innerHTML = '<tr><td colspan="10" style="color:var(--color-text-tertiary);">No failure conditions yet — the ledger populates from the FHA + linked trees.</td></tr>'; return; }
            let h = '';
            for (let i = from; i < to; i++) h += _rowHtml(rows[i]);
            tbody.innerHTML = h;
        };
        // ---- A9: the decisions register -----------------------------------
        const decs = bdList();
        let reg = '<h4 style="margin: var(--s-5) 0 6px;">Budget decisions \u2014 the register</h4>';
        if (!decs.length) {
            reg += '<p style="color:var(--color-text-tertiary); font-size:13px;">No decisions yet. Every offered rebalance ends here: accepted absorbs, signed reserves, and logged \u201cdid nothing\u201d reviews \u2014 attributed, dated, reversible.</p>';
        } else {
            reg += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>Gate</th><th>Decision</th><th>Sentence</th><th>Signed</th><th></th></tr></thead><tbody>' +
                decs.slice().reverse().map(d =>
                    '<tr' + (d.reverted ? ' style="opacity:.55;"' : '') + '><td class="u-mono">' + _esc(String(d.gateId)) + (d.pageId ? '<div style="font-size:10px; color:var(--color-text-tertiary);">' + _esc(String(d.pageId)) + '</div>' : '') + '</td>' +
                    '<td class="u-mono">' + _esc(d.kind.toUpperCase()) + (d.reverted ? ' <span style="font-size:10px;">(reverted \u00b7 ' + _esc(d.reverted.by) + ')</span>' : '') + '</td>' +
                    '<td style="font-size:11.5px;">' + _esc(d.sentence || '') + '</td>' +
                    '<td class="u-mono" style="font-size:11px;">' + _esc(d.by) + ' \u00b7 ' + _esc(String(d.at || '').slice(0, 10)) + '</td>' +
                    '<td>' + (!d.reverted && d.kind !== 'dismissed' ? '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 8px;" onclick="slBudgetRevert(\'' + _esc(d.id) + '\')">Revert</button>' : '') + '</td></tr>'
                ).join('') + '</tbody></table>';
        }
        const regHost = document.createElement('div');
        regHost.innerHTML = reg;
        host.appendChild(regHost);

        if (typeof SLPaginate !== 'undefined' && pagerHost && rows.length) {
            SLPaginate.attach({
                key: 'budget', host: pagerHost, total: rows.length,
                label: (f, t, n) => 'budgets ' + f + '–' + t + ' of ' + n + ' — posture chips computed over the full set',
                renderPage,
            });
        } else {
            renderPage(0, rows.length);
        }
    }

    function _marginCell(r) {
        const mi = r.marginInfo;
        if (!mi) return '<span style="color:var(--color-text-tertiary); font-size:11px;">\u2014</span>';
        const g = mi.gates[0];
        const nums = (g.target != null && g.achieved != null)
            ? '<div style="font-size:10px; font-family:var(--font-mono); color:var(--color-text-tertiary);">' + Number(g.achieved).toExponential(1) + ' of ' + Number(g.target).toExponential(1) + ' \u00b7 ' + _esc(g.gate) + '</div>' : '';
        const btn = (kind) => ' <button class="ckpt-m-btn" style="font-size:10px; padding:1px 7px;" onclick="slBudgetOffer(\'' + _esc(r.allocPage.id) + '\',\'' + _esc(String(g.gateId)) + '\')">' + kind + '</button>';
        if (mi.state === 'over-committed')
            return '<span style="color:#8E2A2A; font-family:var(--font-mono); font-size:11px; font-weight:700;">OVER-COMMITTED</span>' + btn('log review \u2192') + nums;
        if (mi.state === 'under-allocated')
            return '<span style="color:#9A6200; font-family:var(--font-mono); font-size:11px; font-weight:600;">margin held</span>' + btn('decide \u2192') + nums;
        if (mi.state === 'reserve')
            return '<span style="color:#1D6E3E; font-family:var(--font-mono); font-size:11px;">deliberate reserve</span>' + nums;
        if (mi.state === 'absorbed-by-decision')
            return '<span style="color:var(--color-text-tertiary); font-family:var(--font-mono); font-size:11px;">absorbed \u00b7 by decision</span>' + nums;
        return '<span style="color:var(--color-text-tertiary); font-size:11px;">exact</span>';
    }

    // ---- page registration (born-modular; mirrors monitor_spec.js) ---------
    function _ensurePage() {
        if (!document.getElementById('view-budget')) {
            const prev = document.getElementById('view-monitors') || document.getElementById('view-bowtie') || document.getElementById('view-eta');
            if (!prev || !prev.parentNode) return false;
            const v = document.createElement('div'); v.id = 'view-budget'; v.style.display = 'none';
            prev.parentNode.insertBefore(v, prev.nextSibling);
        }
        if (!document.getElementById('snav-budget')) {
            const prevNav = document.getElementById('snav-fta');   // 23 Aug: monitors/bowtie/eta rows are tabs now — the FTA row is the stable anchor
            if (prevNav && prevNav.parentNode) {
                const a = document.createElement('a');
                a.className = prevNav.className; a.id = 'snav-budget'; a.setAttribute('role', 'button'); a.setAttribute('tabindex', '0');
                a.setAttribute('onclick', "switchTab('budget')");
                a.innerHTML = '<span class="asb-lbl">Budget Ledger</span>';
                prevNav.parentNode.insertBefore(a, prevNav.nextSibling);
            }
        }
        return true;
    }
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._budgetWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-budget');
                if (v) v.style.display = (tabId === 'budget') ? 'block' : 'none';
                const s = document.getElementById('snav-budget');
                if (s) s.classList.toggle('snav-active', tabId === 'budget');
                if (tabId === 'budget') renderBudgetLedgerPage();
            } catch (_) {}
            return r;
        };
        wrapped._budgetWrapped = true;
        window.switchTab = wrapped;
    })();
    function _ready(fn) { if (typeof document === 'undefined') return; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { let tries = 30; const t = setInterval(function () { if (_ensurePage() || --tries <= 0) clearInterval(t); }, 250); });

    // ------------------------------------------------------------- exports
    if (typeof window !== 'undefined') {
        window.SLBudgetDecisions = { decisionFor: bdDecisionFor, record: bdRecord, revert: bdRevert, list: bdList };
        window.slBudgetOffer = slBudgetOffer;
        window.slBudgetRevert = slBudgetRevert;
        window.budgetLedgerRows = budgetLedgerRows;
        window.budgetLedgerStats = budgetLedgerStats;
        window.renderBudgetLedgerPage = renderBudgetLedgerPage;
    }
    if (typeof globalThis !== 'undefined') { globalThis.budgetLedgerRows = budgetLedgerRows; globalThis.budgetLedgerStats = budgetLedgerStats; }
})();

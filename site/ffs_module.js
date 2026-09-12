// ============================================================================
// ffs_module.js — v1.0 — Backlog #4: qualitative Functional Failure Scenarios.
//
// ARP 4761A 4.1.1.1 — development errors are QUALITATIVE, never quantified.
// A basic/undeveloped event marked eventClass='dev-error' carries λ = P = 0
// (forced by the config panel; _probMapFor re-forces at the BDD boundary), so
// every quantified P(top) is explicitly P(top | no development error). The
// cut sets that CONTAIN a dev-error member are the qualitative lane: each is
// a Functional Failure Scenario — a combination that defeats the failure
// condition through an erroneous development process rather than random
// failure, addressed by process assurance (DAL) and derived requirements,
// never by the probability budget.
//
// This module is that lane's first-class surface: ffsRows() enumerates every
// dev-error-containing minimal cut set across every fault tree (engine-exact
// via bddMinimalCutsets — structure is deterministic; nothing here is AI),
// renders the FFS page, and feeds the {{ffs_table}} report token.
//
// BORN MODULAR: new file; registers its own page + nav (monitor_spec pattern);
// exports ffsRows()/ffsStats() for reports and tests. Zero monolith edits.
// ============================================================================
(function () {
    var _sevPill = function (s, o) { return (typeof sevPillHtml === 'function') ? sevPillHtml(s, o) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }; // severity pill (helpers_modules.js); safe when helpers is not loaded (test sandboxes)
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function _pages() { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : []; }

    // Resolve the failure condition(s) a page is linked to (aircraft FHA first,
    // then every system FHA) — same link fields the budget ledger walks.
    function _fcsFor(page) {
        const links = (Array.isArray(page.linkedFhaIds) && page.linkedFhaIds.length) ? page.linkedFhaIds
            : (page.linkedFhaId != null ? [page.linkedFhaId] : []);
        const ids = links.map(String);
        const out = [];
        try {
            ((typeof acFhaData !== 'undefined' && acFhaData) || []).forEach(f => {
                if (f && ids.indexOf(String(f.internalId)) !== -1) out.push({ fcId: f.fcId || ('#' + f.internalId), fcDesc: f.fcDesc || '', severity: f.severity || '', scope: 'aircraft' });
            });
        } catch (_) {}
        try {
            ((typeof systemsData !== 'undefined' && systemsData) || []).forEach(s => {
                if (!s) return;
                (s.fha || []).forEach(f => {
                    if (f && ids.indexOf(String(f.internalId)) !== -1) out.push({ fcId: f.fcId || ('#' + f.internalId), fcDesc: f.fcDesc || '', severity: f.severity || '', scope: s.name || s.id });
                });
            });
        } catch (_) {}
        return out;
    }

    // ffsRows() — one row per (tree × dev-error-containing minimal cut set).
    // Engine-exact: bddMinimalCutsets on each rooted page; the explosion guard
    // (CutsetExplosionError) skips that tree with a marker row rather than
    // approximating — the core refuses, it never guesses.
    function ffsRows() {
        const rows = [];
        _pages().forEach(page => {
            if (!page || !page.root) return;
            let mcs;
            try { mcs = (typeof bddMinimalCutsets === 'function') ? (bddMinimalCutsets(page.root) || []) : []; }
            catch (err) {
                if (err && err.name === 'CutsetExplosionError') {
                    rows.push({ pageId: page.id, pageName: page.name || page.id, fcs: _fcsFor(page), order: null, members: [], devMembers: [], tooComplex: true });
                }
                return;
            }
            mcs.forEach(cs => {
                const devMembers = cs.filter(n => n && n.eventClass === 'dev-error');
                if (!devMembers.length) return;
                rows.push({
                    pageId: page.id,
                    pageName: page.name || page.id,
                    fcs: _fcsFor(page),
                    order: cs.length,
                    members: cs.map(n => ({
                        displayId: n.displayId || n.logicalId || String(n.id),
                        name: n.name || '',
                        devError: n.eventClass === 'dev-error',
                        dal: n.dal || n.allocatedDal || null,
                    })),
                    devMembers: devMembers.map(n => n.displayId || n.logicalId || String(n.id)),
                    tooComplex: false,
                });
            });
        });
        // Deterministic order: severity-critical trees first is the reader's
        // instinct, but severity lives per-FC; sort by page name then order.
        rows.sort((a, b) => (a.pageName < b.pageName ? -1 : a.pageName > b.pageName ? 1 : (a.order || 0) - (b.order || 0)));
        return rows;
    }

    function ffsStats(rows) {
        const r = rows || ffsRows();
        const scen = r.filter(x => !x.tooComplex);
        const trees = new Set(scen.map(x => x.pageId));
        const devEvents = new Set();
        scen.forEach(x => x.devMembers.forEach(m => devEvents.add(x.pageId + ':' + m)));
        return { scenarios: scen.length, trees: trees.size, devEvents: devEvents.size, tooComplex: r.filter(x => x.tooComplex).length };
    }

    // ------------------------------------------------------------- render
    const _chip = (l, v, color) => '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">' + l + ' <b style="margin-left:6px;' + (color ? ' color:' + color + ';' : '') + '">' + v + '</b></div>';

    function renderFfsPage() {
        const host = document.getElementById('view-ffs');
        if (!host) return;
        const rows = ffsRows();
        const st = ffsStats(rows);
        let html = '<h3>Functional Failure Scenarios <span style="font-size:13px; font-weight:500; color:var(--color-text-tertiary); margin-left:8px;">— the qualitative lane: every minimal cut set containing a development error (ARP 4761A 4.1.1.1)</span></h3>';
        html += '<div style="display:flex; gap:10px; flex-wrap:wrap; margin:10px 0 14px;">' +
            _chip('Scenarios', String(st.scenarios), st.scenarios ? '#0E7490' : null) +
            _chip('Trees affected', String(st.trees)) +
            _chip('◇ Dev-error events', String(st.devEvents)) +
            (st.tooComplex ? _chip('Trees too complex', String(st.tooComplex), '#8E2A2A') : '') + '</div>';
        html += '<p style="font-size:12px; color:var(--color-text-secondary);  margin:0 0 12px;">Development errors are never given probabilities — these scenarios are excluded from every quantified P(top), which is therefore explicitly <em>P(top | no development error)</em>. Each scenario below is addressed by process assurance (the allocated DAL) and derived requirements, not by the probability budget. Mark an event as a development error via the ◇ checkbox in its fault-tree config panel.</p>';
        // ENG-2 phase 1 — paginated render (50/page default). The stats chips
        // above stay computed over ALL rows; the pager bar says so.
        html += '<div id="ffs-pager"></div>';
        html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr>' +
            '<th>#</th><th>Fault tree</th><th>Failure condition</th><th>Severity</th><th>Order</th><th>Scenario (minimal cut set)</th><th>◇ Development error(s)</th></tr></thead><tbody id="ffs-tbody">';
        html += '</tbody></table>' +
            '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Scenarios enumerated engine-exact (BDD minimal cut sets) · a scenario = any minimal cut set with ≥1 ◇ member · dev-error events enter the quantitative lane at p = 0, so structure is identical in both lanes · the {{ffs_table}} report token reads THIS surface.</p>';
        host.innerHTML = html;

        // Page renderer — one row per scenario (or refusal marker), 50/page.
        function _rowHtml(r, rowNo) {
            if (r.tooComplex) {
                return '<tr><td>—</td><td>' + _esc(r.pageName) + '</td><td colspan="5" style="color:#8E2A2A; font-size:11px;">Cut-set enumeration refused (explosion guard) — the qualitative lane for this tree could not be enumerated. Simplify or partition the tree.</td></tr>';
            }
            const fcTxt = r.fcs.length ? r.fcs.map(f => '<strong>' + _esc(f.fcId) + '</strong> <span style="color:var(--color-text-tertiary);">(' + _esc(f.scope) + ')</span>').join('<br>') : '<span style="color:var(--color-text-tertiary);">unlinked</span>';
            const sevTxt = r.fcs.length ? r.fcs.map(f => _sevPill(f.severity)).join('<br>') : '—';
            const memTxt = r.members.map(m => (m.devError ? '<span style="color:#0E7490; font-weight:700;">◇ ' : '<span>') + _esc(m.displayId) + '</span> <span style="color:var(--color-text-tertiary);">' + _esc(String(m.name).slice(0, 60)) + '</span>' + (m.dal ? ' <span style="font-family:var(--font-mono); font-size:10px; border:1px solid var(--color-border-strong); padding:0 4px;">DAL ' + _esc(m.dal) + '</span>' : '')).join('<br>');
            const devTxt = r.devMembers.map(_esc).join(', ');
            return '<tr style="border-left:3px solid #0E7490;"><td>' + rowNo + '</td><td>' + _esc(r.pageName) + '</td><td>' + fcTxt + '</td><td>' + sevTxt + '</td><td class="u-mono">' + r.order + '</td><td>' + memTxt + '</td><td style="color:#0E7490; font-weight:600;">' + devTxt + '</td></tr>';
        }
        const tbody = document.getElementById('ffs-tbody');
        const pagerHost = document.getElementById('ffs-pager');
        const renderPage = (from, to) => {
            if (!tbody) return;
            if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" style="color:var(--color-text-tertiary);">No qualitative scenarios — no fault-tree event is currently marked ◇ development error, or no marked event appears in a minimal cut set.</td></tr>'; return; }
            let h = '';
            for (let i = from; i < to; i++) h += _rowHtml(rows[i], i + 1);
            tbody.innerHTML = h;
        };
        if (typeof SLPaginate !== 'undefined' && pagerHost && rows.length) {
            SLPaginate.attach({
                key: 'ffs', host: pagerHost, total: rows.length,
                label: (f, t, n) => 'scenarios ' + f + '–' + t + ' of ' + n + ' — stats chips computed over the full set',
                renderPage,
            });
        } else {
            renderPage(0, rows.length);
        }
    }

    // ---- page registration (born-modular; mirrors monitor_spec.js) ---------
    function _ensurePage() {
        if (!document.getElementById('view-ffs')) {
            const prev = document.getElementById('view-budget') || document.getElementById('view-monitors') || document.getElementById('view-bowtie');
            if (!prev || !prev.parentNode) return false;
            const v = document.createElement('div'); v.id = 'view-ffs'; v.style.display = 'none';
            prev.parentNode.insertBefore(v, prev.nextSibling);
        }
        if (!document.getElementById('snav-ffs')) {
            const prevNav = document.getElementById('snav-budget') || document.getElementById('snav-fta');   // 23 Aug: chain re-anchored
            if (prevNav && prevNav.parentNode) {
                const a = document.createElement('a');
                a.className = prevNav.className; a.id = 'snav-ffs'; a.setAttribute('role', 'button'); a.setAttribute('tabindex', '0');
                a.setAttribute('onclick', "switchTab('ffs')");
                a.innerHTML = '<span class="asb-lbl">FFS (Qualitative)</span>';
                prevNav.parentNode.insertBefore(a, prevNav.nextSibling);
            }
        }
        return true;
    }
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._ffsWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-ffs');
                if (v) v.style.display = (tabId === 'ffs') ? 'block' : 'none';
                const s = document.getElementById('snav-ffs');
                if (s) s.classList.toggle('snav-active', tabId === 'ffs');
                if (tabId === 'ffs') renderFfsPage();
            } catch (_) {}
            return r;
        };
        wrapped._ffsWrapped = true;
        window.switchTab = wrapped;
    })();
    function _ready(fn) { if (typeof document === 'undefined') return; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { let tries = 30; const t = setInterval(function () { if (_ensurePage() || --tries <= 0) clearInterval(t); }, 250); });

    // ------------------------------------------------------------- exports
    if (typeof window !== 'undefined') {
        window.ffsRows = ffsRows;
        window.ffsStats = ffsStats;
        window.renderFfsPage = renderFfsPage;
    }
    if (typeof globalThis !== 'undefined') { globalThis.ffsRows = ffsRows; globalThis.ffsStats = ffsStats; }
})();

// ============================================================================
// paginate.js — v1.3 — ENG-2 phase 1: shared table pagination. (1.3, 6 Sep 2026: one aligned control style)
//
// One pager, every big table. 50 rows per page by default (one screen — the
// reviewer-friendly unit), selector to 100/250/500, jump-to-page, and an
// HONESTY LABEL on every bar: "rows X–Y of N — totals computed over the full
// set". In a safety tool a table is an artifact a reviewer scans for
// completeness — pagination must never create the impression that what's on
// screen is all there is. The pager therefore always states the full count,
// and callers keep every Σ / P(top) / posture figure computed over ALL rows
// (the pager only windows the DISPLAY — it never touches data).
//
// Page-size preference persists per table key in localStorage (display
// preference, machine-local — never project data).
//
// BORN MODULAR: new file, no monolith edits; tables opt in by calling
// SLPaginate.attach. Exports window.SLPaginate for pages and tests.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const SIZES = [50, 100, 250, 500];
    const LS_KEY = 'safetyLab.pageSize.v1';   // { tableKey: size }
    const _state = new Map();                  // tableKey → { page }

    function _prefSize(key) {
        try {
            const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
            const v = parseInt(all[key], 10);
            if (SIZES.indexOf(v) !== -1) return v;
        } catch (_) {}
        return 50;
    }
    function _savePrefSize(key, size) {
        try {
            const all = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
            all[key] = size;
            localStorage.setItem(LS_KEY, JSON.stringify(all));
        } catch (_) {}
    }

    // attach({ key, host, total, label, renderPage }) — wires a pager bar into
    // `host` (a container element) and immediately renders the current page.
    //   key        : stable table id ('cutsets', 'ffs', 'budget', …)
    //   host       : element the pager bar renders into (bar replaces content)
    //   total      : TOTAL row count (the full set, post-filter)
    //   label      : fn(from1, to1, total) → honesty text (or null for default)
    //   renderPage : fn(fromIdx, toIdxExcl, info) — caller renders rows [from,to)
    // Returns { page, pageSize, pages, refresh }.
    function attach(opts) {
        const key = String(opts.key || 'table');
        const host = opts.host;
        const total = Math.max(0, opts.total | 0);
        const renderPage = opts.renderPage;
        if (!host || typeof renderPage !== 'function') return null;
        const pageSize = _prefSize(key);
        const pages = Math.max(1, Math.ceil(total / pageSize));
        const st = _state.get(key) || { page: 1 };
        st.page = Math.min(Math.max(1, st.page), pages);
        _state.set(key, st);

        function _render() {
            const from = (st.page - 1) * pageSize;             // 0-based inclusive
            const to = Math.min(total, from + pageSize);       // 0-based exclusive
            const info = { page: st.page, pages, pageSize, from, to, total };
            // Bar first (so the label is present even if row render throws late).
            const from1 = total === 0 ? 0 : from + 1;
            const labelTxt = (typeof opts.label === 'function')
                ? opts.label(from1, to, total)
                : ('rows ' + from1.toLocaleString() + '–' + to.toLocaleString() + ' of ' + total.toLocaleString() + ' — totals computed over the full set');
            // Single page → the honesty label alone (it still carries real
            // information, e.g. materiality counts); navigation would be dead
            // chrome. Found in live browser testing on small K350 trees.
            if (pages === 1) {
                host.innerHTML = '<div class="slp-bar" style="display:flex; align-items:center; padding:8px 0; min-height:44px;"><span style="margin-left:auto; color:var(--color-text-secondary,#4A5568); font-size:12px; line-height:28px;">' + _esc(labelTxt) + '</span></div>';
                renderPage(0, total, { page: 1, pages: 1, pageSize, from: 0, to: total, total });
                return;
            }
            // 1.3 (6 Sep 2026, Waqas: "lined up and clean") — ONE control style for every
            // element in the bar. Same height, same corners, same type, same borders; the
            // page box and the size picker are sized like the buttons so nothing sits high or
            // low; disabled buttons dim but keep their size, so the row never shifts.
            const CTL = 'box-sizing:border-box; height:28px; line-height:26px; padding:0 10px; font:inherit; font-size:12px; ' +
                        'border:1px solid var(--color-border-hair,rgba(0,0,0,.18)); border-radius:6px; ' +
                        'background:var(--color-surface-2,#F3F5F9); color:var(--color-text-primary,#16213A); ' +
                        'vertical-align:middle; margin:0; appearance:none; -webkit-appearance:none;';
            const btn = CTL + ' cursor:pointer; white-space:nowrap;';
            const dis = ' opacity:0.4; cursor:default;';
            const inp = CTL + ' width:56px; text-align:center; font-variant-numeric:tabular-nums; padding:0 6px;';
            const sel = CTL + ' padding:0 26px 0 10px; cursor:pointer; background-image:url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22><path d=%22M0 0l5 6 5-6z%22 fill=%22%23667085%22/></svg>"); background-repeat:no-repeat; background-position:right 9px center;';
            const txt = 'font-size:12px; color:var(--color-text-secondary,#4A5568); white-space:nowrap; line-height:28px;';
            host.innerHTML =
                '<div class="slp-bar" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding:8px 0; min-height:44px;">' +
                '<button type="button" data-pg="first" title="First page" style="' + btn + (st.page <= 1 ? dis : '') + '" ' + (st.page <= 1 ? 'disabled' : '') + '>&laquo; First</button>' +
                '<button type="button" data-pg="prev" title="Previous page" style="' + btn + (st.page <= 1 ? dis : '') + '" ' + (st.page <= 1 ? 'disabled' : '') + '>&lsaquo; Prev</button>' +
                '<span style="' + txt + ' margin:0 2px 0 6px;">Page</span>' +
                '<input type="number" data-pg="jump" aria-label="Page number" min="1" max="' + pages + '" value="' + st.page + '" style="' + inp + '">' +
                '<span style="' + txt + ' margin:0 6px 0 2px;">of ' + pages.toLocaleString() + '</span>' +
                '<button type="button" data-pg="next" title="Next page" style="' + btn + (st.page >= pages ? dis : '') + '" ' + (st.page >= pages ? 'disabled' : '') + '>Next &rsaquo;</button>' +
                '<button type="button" data-pg="last" title="Last page" style="' + btn + (st.page >= pages ? dis : '') + '" ' + (st.page >= pages ? 'disabled' : '') + '>Last &raquo;</button>' +
                '<select data-pg="size" aria-label="Rows per page" style="' + sel + ' margin-left:10px;">' +
                SIZES.map(s => '<option value="' + s + '"' + (s === pageSize ? ' selected' : '') + '>' + s + ' per page</option>').join('') +
                '</select>' +
                '<span style="' + txt + ' margin-left:auto;">' + _esc(labelTxt) + '</span>' +
                '</div>';
            host.querySelectorAll('[data-pg]').forEach(el => {
                const act = el.getAttribute('data-pg');
                if (act === 'size') {
                    el.addEventListener('change', function () {
                        _savePrefSize(key, parseInt(this.value, 10) || 50);
                        st.page = 1;
                        attach(opts);   // re-attach picks up the new size
                    });
                } else if (act === 'jump') {
                    el.addEventListener('change', function () {
                        const p = parseInt(this.value, 10);
                        if (p >= 1 && p <= pages && p !== st.page) { st.page = p; _render(); }
                    });
                } else {
                    el.addEventListener('click', function () {
                        const next = act === 'first' ? 1 : act === 'prev' ? st.page - 1 : act === 'next' ? st.page + 1 : pages;
                        const p = Math.min(Math.max(1, next), pages);
                        if (p !== st.page) { st.page = p; _render(); }
                    });
                }
            });
            renderPage(from, to, info);
        }
        _render();
        return { get page() { return st.page; }, pageSize, pages, refresh: _render };
    }

    // reset(key) — jump a table back to page 1 (call when the underlying data
    // changes shape, e.g. a different tree's cut sets).
    function reset(key) { const st = _state.get(String(key)); if (st) st.page = 1; }

    // pageTbody({ key, tbody, rows, rowHtml, label }) — convenience for custom
    // table renders: manages a pager bar directly above the tbody's table,
    // pages the rows once they exceed one page (50), renders everything (and
    // retires any stale bar) below that. rowHtml(row, index) → '<tr>…</tr>'.
    function pageTbody(opts) {
        const tbody = opts.tbody;
        if (!tbody) return;
        const rows = opts.rows || [];
        const rowHtml = opts.rowHtml;
        const prefix = opts.prefixHtml || '';   // shown at the top of EVERY page (e.g. coverage banners)
        const renderRange = (from, to) => { let h = ''; for (let i = from; i < to; i++) h += rowHtml(rows[i], i); tbody.innerHTML = prefix + h; };
        let pager = null;
        try {
            const tbl = tbody.closest ? tbody.closest('table') : null;
            if (tbl && tbl.parentNode) {
                pager = document.getElementById('slp-' + opts.key);
                if (!pager) { pager = document.createElement('div'); pager.id = 'slp-' + opts.key; tbl.parentNode.insertBefore(pager, tbl); }
            }
        } catch (_) {}
        if (rows.length > 50 && pager) {
            attach({ key: opts.key, host: pager, total: rows.length, label: opts.label, renderPage: renderRange });
        } else {
            if (pager) pager.innerHTML = '';
            renderRange(0, rows.length);
        }
    }

    if (typeof window !== 'undefined') window.SLPaginate = { attach, reset, pageTbody, SIZES };
    if (typeof globalThis !== 'undefined') globalThis.SLPaginate = { attach, reset, pageTbody, SIZES };
})();

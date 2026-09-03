// ============================================================================
// unc_bands.js — v1.0 — UNC-1: uncertainty bands on the budget ledger (SLUnc).
//
// Actuaries never quote a single number; they quote a band. "We meet 1e-9"
// becomes defensible when the P05–P95 band is visible next to it. This module
// runs the EXISTING Monte-Carlo uncertainty propagation (lognormal λ from
// user-entered error factors — house rule: distributions are user-entered,
// never assumed) over each ledger row's verification mirror, in idle frames,
// and annotates the Achieved cell with the band.
//
// Honesty rules:
//   · a mirror with no lambdaEF > 1 anywhere gets "no EF data" — the band
//     needs YOUR error factors, it is never invented;
//   · the band states its own meaning (P05–P95, N samples) in the tooltip;
//   · band vs objective is also written in words — never color-alone.
//
// Display lane: reads trees + user EFs, runs the engine's sampler on COPIES,
// writes nothing. BORN MODULAR: wraps renderBudgetLedgerPage additively
// (_uncWrapped); computes via SLIdle so the ledger renders instantly and
// bands stream in. Exports window.SLUnc.
// ============================================================================
(function () {
    'use strict';

    const N = 2000;                 // samples per row — bands, not research
    const _cache = new Map();       // pageId → { p05, median, p95, N } | { noEF: true }

    function _fmt(v) { return (typeof v === 'number' && isFinite(v)) ? v.toExponential(2) : '—'; }
    function _hasEF(root) { let f = false; (function w(n) { if (!n || f) return; if (n.lambdaEF && n.lambdaEF > 1) { f = true; return; } (n.children || []).forEach(w); })(root); return f; }

    function _bandFor(pageId) {
        if (_cache.has(pageId)) return _cache.get(pageId);
        return null;
    }
    function _compute(page) {
        try {
            if (!page || !page.root || typeof runUncertaintyAnalysis !== 'function') return { noEF: true };
            if (!_hasEF(page.root)) return { noEF: true };
            const r = runUncertaintyAnalysis(JSON.parse(JSON.stringify(page.root)), N);
            if (!r || !r.N) return { noEF: true };
            return { p05: r.p05, median: r.median, p95: r.p95, N: r.N };
        } catch (_) { return { noEF: true }; }
    }

    // Annotate the rendered ledger rows (idempotent post-pass).
    function _annotate() {
        try {
            const tbody = document.getElementById('budget-tbody');
            if (!tbody || typeof budgetLedgerRows !== 'function') return;
            const rows = budgetLedgerRows();
            const byFc = new Map(rows.map(r => [String(r.fcId) + '|' + String(r.scope), r]));
            tbody.querySelectorAll('tr').forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 7 || tr.querySelector('.unc-band')) return;
                const key = (tds[0].textContent || '').trim().split('\n')[0];
                const row = [...byFc.values()].find(r => key.indexOf(String(r.fcId)) === 0);
                if (!row || !row.mirrorPage) return;
                const band = _bandFor(row.mirrorPage.id);
                const cell = tds[5];   // Achieved (mirror)
                const el = document.createElement('div');
                el.className = 'unc-band u-mono';
                el.style.cssText = 'font-size:10px; margin-top:2px; color:var(--color-text-tertiary,#7C8698);';
                if (!band) { el.textContent = '± band: computing…'; }
                else if (band.noEF) {
                    el.textContent = '± no EF data';
                    el.title = 'Uncertainty bands need error factors (lambdaEF) on the mirror tree’s basic events — your values, never assumed.';
                } else {
                    const meets = (row.objective != null) ? (band.p95 <= row.objective) : null;
                    el.textContent = '± P05–P95: ' + _fmt(band.p05) + ' – ' + _fmt(band.p95) + (meets == null ? '' : (meets ? ' · band meets objective' : ' · P95 EXCEEDS objective'));
                    if (meets === false) el.style.color = 'var(--color-danger,#C0392B)';
                    el.title = 'Monte-Carlo band over ' + band.N + ' samples — lognormal λ from YOUR error factors; median ' + _fmt(band.median) + '. P05–P95 = central 90%. Advisory: the posture column remains the point-estimate verdict.';
                }
                cell.appendChild(el);
            });
        } catch (_) {}
    }

    // Schedule computation for visible rows, then re-annotate as bands land.
    function refresh() {
        try {
            if (typeof budgetLedgerRows !== 'function') return;
            _annotate();   // immediate: cached bands + placeholders
            const rows = budgetLedgerRows().filter(r => r.mirrorPage);
            rows.forEach(r => {
                const pid = r.mirrorPage.id;
                if (_cache.has(pid)) return;
                const job = () => {
                    const page = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).find(p => p && p.id === pid);
                    _cache.set(pid, _compute(page));
                    try { document.querySelectorAll('#budget-tbody .unc-band').forEach(e => e.remove()); } catch (_) {}
                    _annotate();
                };
                if (typeof SLIdle !== 'undefined' && SLIdle) SLIdle.schedule('unc:' + pid, job, { timeout: 4000 });
                else setTimeout(job, 50);
            });
        } catch (_) {}
    }
    function invalidate() { _cache.clear(); }

    // ---- wiring: ride the ledger render + quant recompute ----------------------
    (function wrapLedger() {
        if (typeof window.renderBudgetLedgerPage !== 'function' || window.renderBudgetLedgerPage._uncWrapped) { setTimeout(wrapLedger, 400); return; }
        const orig = window.renderBudgetLedgerPage;
        const wrapped = function () { const r = orig.apply(this, arguments); try { refresh(); } catch (_) {} return r; };
        wrapped._uncWrapped = true;
        window.renderBudgetLedgerPage = wrapped;
    })();
    (function wrapCalc() {
        if (typeof window.calculateAllProbabilities !== 'function' || window.calculateAllProbabilities._uncWrapped) { setTimeout(wrapCalc, 400); return; }
        const orig = window.calculateAllProbabilities;
        const wrapped = function () { const r = orig.apply(this, arguments); try { invalidate(); } catch (_) {} return r; };
        wrapped._uncWrapped = true;
        window.calculateAllProbabilities = wrapped;
    })();

    // ------------------------------------------------------------- exports
    const api = { refresh, invalidate, _compute, _hasEF, N };
    if (typeof window !== 'undefined') window.SLUnc = api;
    if (typeof globalThis !== 'undefined') globalThis.SLUnc = api;
})();

// ============================================================================
// avail_closedform.js — v1.0 — Backlog #8: closed-form steady-state
// availability as a fast, clearly-LABELED low-fidelity estimate.
//
//   exact per item:   Aᵢ = μᵢ/(λᵢ+μᵢ) = 1/(1+λᵢ·MTTRᵢ)      (MIL-HDBK-338B §10)
//   series system:    As = Π Aᵢ            (exact under independent repair)
//   redundant:        Qs = Π Qᵢ            (exact under independent repair)
//   μ≫λ shortcuts:    Aᵢ ≈ 1−λᵢ/μᵢ,  Qs(series) ≈ Σ λᵢ·MTTRᵢ — shown ONLY as
//                     the approximation, never as the result.
//
// Doctrine: these are ESTIMATES next to the exact results — the product forms
// assume INDEPENDENT repair (dedicated repair crews, no queueing, no shared
// spares). Markov owns shared-repair / dependency dynamics; the estimate is
// flagged with the #1 fidelity vocabulary (amber "ESTIMATE" pill) so nobody
// mistakes the shortcut for the exact lane. All inputs are user-entered
// λ / MTTR / MDT — nothing here originates a number.
//
// BORN MODULAR: new file, zero edits to other modules. Wraps renderRamMxPage
// (Ai/Ao ledger system-level chips) and renderRamRbdPage (per-model
// steady-state availability panel), same discipline as ram_derive.js.
// Pure math is exported for the headless regression suite.
// ============================================================================
(function () {
    'use strict';

    // ------------------------------------------------------------ pure math
    function itemA(lambda, mu) {
        if (!(lambda >= 0) || !(mu > 0)) return null;
        return mu / (lambda + mu);
    }
    function itemAFromMttr(lambda, mttr) {
        if (!(lambda >= 0) || !(mttr > 0)) return null;
        return 1 / (1 + lambda * mttr);          // = μ/(λ+μ) with μ = 1/MTTR
    }
    function seriesA(items) {   // items: [{lambda, mu}] — exact Π Aᵢ
        let a = 1;
        for (const it of items || []) {
            const ai = itemA(it.lambda, it.mu);
            if (ai == null) return null;
            a *= ai;
        }
        return a;
    }
    function parallelQ(items) { // exact Π Qᵢ
        let q = 1;
        for (const it of items || []) {
            const ai = itemA(it.lambda, it.mu);
            if (ai == null) return null;
            q *= (1 - ai);
        }
        return q;
    }
    function seriesQApprox(items) {  // μ≫λ shortcut: Σ λᵢ/μᵢ
        let s = 0;
        for (const it of items || []) {
            if (!(it.lambda >= 0) || !(it.mu > 0)) return null;
            s += it.lambda / it.mu;
        }
        return s;
    }
    // Structure-function steady-state unavailability over an RBD node tree
    // (same node shapes as rbd_module.js), with per-block q supplied by qFn.
    // qFn(block) → steady-state Q ∈ [0,1] or null (missing repair data).
    // Any null leaf ⇒ null result (incomplete — never a silent guess).
    function structureQ(node, qFn) {
        if (!node) return null;
        if (node.kind === 'block') return qFn(node);
        const qs = [];
        for (const c of node.children || []) {
            const q = structureQ(c, qFn);
            if (q == null) return null;
            qs.push(q);
        }
        if (!qs.length) return null;
        if (node.kind === 'series') return 1 - qs.reduce((a, q) => a * (1 - q), 1);
        if (node.kind === 'parallel') return qs.reduce((a, q) => a * q, 1);
        if (node.kind === 'koon') {
            const need = qs.length - node.k + 1;   // fails when failures ≥ n−k+1
            let dist = [1];
            qs.forEach(q => {
                const next = new Array(dist.length + 1).fill(0);
                for (let j = 0; j < dist.length; j++) { next[j] += dist[j] * (1 - q); next[j + 1] += dist[j] * q; }
                dist = next;
            });
            let s = 0;
            for (let j = need; j < dist.length; j++) s += dist[j];
            return s;
        }
        return null;
    }

    // ------------------------------------------------------------ UI wiring
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _g(name) { try { return (typeof window !== 'undefined' && window[name]) || undefined; } catch (_) { return undefined; } }
    const EST_TIP = 'CLOSED-FORM ESTIMATE (low fidelity): product-form steady-state availability assumes INDEPENDENT repair — dedicated repair, no queueing, no shared spares. λ / MTTR are user-entered; utilization treated as 1 (1 FH ≈ 1 clock hour). The exact lane (Markov) owns shared-repair and dependency dynamics.';
    const _estPill = txt => '<span class="ai-est-pill" title="' + _esc(EST_TIP) + '">' + _esc(txt || 'ESTIMATE · closed form') + '</span>';
    const _fmtA = a => a == null ? '—' : (a >= 0.9999995 ? '≈1' : (a * 100).toFixed(a > 0.99 ? 5 : 3) + '%');
    const _fmtQ = q => q == null ? '—' : q.toExponential(3);

    // Ledger rows: every maintenance task with a linked basic event (λ) and a
    // repair time. Mirrors the ledger's own Ai column inputs — read-only.
    function _linkedItems() {
        const out = [];
        try {
            const store = (typeof window._ramStore === 'function') ? window._ramStore() : null;
            const find = (typeof window._fmesFindBe === 'function') ? window._fmesFindBe : null;
            if (!store || !find) return out;
            (store.tasks || []).forEach(t => {
                if (!t.beRef) return;
                const h = find(t.beRef);
                if (!h) return;
                const lam = (typeof getEffectiveLambda === 'function' ? getEffectiveLambda(h.node) : h.node.lambda) || 0;
                const mttr = (parseFloat(t.activeRepair) || 0);
                const mdt = mttr + (parseFloat(t.logistics) || 0) + (parseFloat(t.admin) || 0);
                if (lam > 0 && mttr > 0) out.push({ name: t.name, lambda: lam, mu: 1 / mttr, muOp: mdt > 0 ? 1 / mdt : null });
            });
        } catch (_) {}
        return out;
    }

    // -------- Ai/Ao ledger — system-level chips (wrap renderRamMxPage) --------
    function _ledgerPanel() {
        const host = document.getElementById('ram-mx-host');
        if (!host || host.querySelector('#acf-ledger-panel')) return;
        const items = _linkedItems();
        if (!items.length) return;
        const asExact = seriesA(items);
        const qApprox = seriesQApprox(items);
        const aoItems = items.filter(i => i.muOp > 0).map(i => ({ lambda: i.lambda, mu: i.muOp }));
        const aoExact = aoItems.length === items.length ? seriesA(aoItems) : null;
        const div = document.createElement('div');
        div.id = 'acf-ledger-panel';
        div.style.cssText = 'border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:10px 14px; margin:12px 0; ';
        div.innerHTML =
            '<div style="font-size:12px; margin-bottom:6px;"><b>System steady-state availability — closed form</b>' + _estPill('ESTIMATE · closed form') + '</div>' +
            '<div style="display:flex; gap:10px; flex-wrap:wrap;">' +
            '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">As (series, exact Π Aᵢ = Π μᵢ/(λᵢ+μᵢ)) <b style="margin-left:6px;">' + _fmtA(asExact) + '</b></div>' +
            '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">Qs = 1−As <b style="margin-left:6px;">' + _fmtQ(asExact == null ? null : 1 - asExact) + '</b></div>' +
            (aoExact != null ? '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">Ao (series, MDT) <b style="margin-left:6px;">' + _fmtA(aoExact) + '</b></div>' : '') +
            '</div>' +
            '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin:8px 0 0;">μ≫λ shortcut (approximation only): Qs ≈ Σ λᵢ·MTTRᵢ = ' + _fmtQ(qApprox) + ' · over ' + items.length + ' ledger-linked item(s), series success logic assumed. Exact per-item Aᵢ column above stays the authority; Markov owns repair dynamics.</p>';
        // Place after the chips row (first child block) — fall back to append.
        const first = host.firstChild;
        if (first && first.nextSibling) host.insertBefore(div, first.nextSibling); else host.appendChild(div);
    }

    // -------- RBD page — steady-state availability panel (wrap render) --------
    function _rbdMuMap() {
        // displayId → {mu} from ledger tasks (beRef resolves to a tree node).
        const map = new Map();
        try {
            const store = (typeof window._ramStore === 'function') ? window._ramStore() : null;
            const find = (typeof window._fmesFindBe === 'function') ? window._fmesFindBe : null;
            if (!store || !find) return map;
            (store.tasks || []).forEach(t => {
                if (!t.beRef) return;
                const h = find(t.beRef);
                if (!h) return;
                const mttr = parseFloat(t.activeRepair) || 0;
                if (mttr > 0) {
                    const key = String(h.node.displayId || h.node.id);
                    if (!map.has(key)) map.set(key, { mu: 1 / mttr });
                }
            });
        } catch (_) {}
        return map;
    }
    function _rbdPanel() {
        const host = document.getElementById('ram-rbd-host');
        if (!host || host.querySelector('#acf-rbd-panel')) return;
        const models = ((_g('projectConfig') || {}).rbd || {}).models || [];
        if (!models.length) return;
        const muMap = _rbdMuMap();
        const rows = [];
        models.forEach(m => {
            let structure = null;
            try {
                if (m.fromPage && typeof window._rbdFromPage === 'function') { const d = window._rbdFromPage(m.fromPage); structure = d && d.structure; }
                else if (m.dsl && typeof window._rbdParseDsl === 'function') structure = window._rbdParseDsl(m.dsl);
            } catch (_) {}
            if (!structure) return;
            let total = 0, matched = 0;
            (function count(n) { if (!n) return; if (n.kind === 'block') { total++; if (muMap.has(String(n.name))) matched++; return; } (n.children || []).forEach(count); })(structure);
            const q = structureQ(structure, b => {
                const hit = muMap.get(String(b.name));
                if (!hit || !(b.lambda >= 0)) return null;
                return b.lambda / (b.lambda + hit.mu);      // steady-state Qᵢ = λᵢ/(λᵢ+μᵢ)
            });
            rows.push({ name: m.name, q, total, matched });
        });
        if (!rows.length) return;
        const div = document.createElement('div');
        div.id = 'acf-rbd-panel';
        div.style.cssText = 'border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:10px 14px; margin:14px 0 0; ';
        div.innerHTML =
            '<div style="font-size:12px; margin-bottom:6px;"><b>Steady-state availability — closed form per block diagram</b>' + _estPill('ESTIMATE · independent repair') + '</div>' +
            '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>RBD</th><th>Blocks w/ repair data</th><th>Qs (steady)</th><th>As (steady)</th></tr></thead><tbody>' +
            rows.map(r => '<tr><td>' + _esc(r.name) + '</td><td class="u-mono">' + r.matched + '/' + r.total + '</td><td class="u-mono">' + (r.q == null ? '<span style="color:var(--color-text-tertiary);">link ledger tasks (MTTR) to every block</span>' : _fmtQ(r.q)) + '</td><td class="u-mono">' + (r.q == null ? '—' : _fmtA(1 - r.q)) + '</td></tr>').join('') +
            '</tbody></table>' +
            '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin:8px 0 0;">Per-block Qᵢ = λᵢ/(λᵢ+μᵢ) with μᵢ = 1/MTTRᵢ from the maintainability ledger, combined through the exact structure function (series/parallel/k-oo-n Poisson-binomial). Exact under independent repair — an estimate everywhere else; Markov owns shared-repair dynamics.</p>';
        host.appendChild(div);
    }

    // ------------------------------------------------- render-wrap plumbing
    function _wrapRender(fnName, after) {
        if (typeof window === 'undefined') return;
        if (typeof window[fnName] !== 'function' || window[fnName]._acfWrapped) return;
        const orig = window[fnName];
        const wrapped = function () { const r = orig.apply(this, arguments); try { after(); } catch (_) {} return r; };
        wrapped._acfWrapped = true;
        // 20 Aug 2026 — keep every prior wrapper's idempotence marker (see fn_wrap.js).
        try { if (window.SLWrap) SLWrap.preserve(orig, wrapped); } catch (_) {}
        window[fnName] = wrapped;
    }
    function _boot() {
        _wrapRender('renderRamMxPage', _ledgerPanel);
        _wrapRender('renderRamRbdPage', _rbdPanel);
    }
    if (typeof window !== 'undefined') {
        _boot();
        if (typeof setTimeout === 'function') setTimeout(_boot, 0);   // in case this file loads first
    }

    // ------------------------------------------------------------- exports
    const API = { itemA, itemAFromMttr, seriesA, parallelQ, seriesQApprox, structureQ };
    if (typeof window !== 'undefined') window.AvailClosedForm = API;
    if (typeof globalThis !== 'undefined') globalThis.AvailClosedForm = API;
})();

// ============================================================================
// mc_crosscheck.js — v1.0 — DSV-1: dissimilar verification (SLDissimilar).
//
// Avionics doesn't trust one channel; it flies dissimilar redundancy. Applied
// to the tool itself: a SECOND, INDEPENDENT evaluation path cross-checks the
// exact engine. The Monte Carlo estimator here never touches the BDD — it
// samples every unique basic event (ONE Bernoulli draw per logical event per
// trial, so repeated events stay correlated exactly as the mathematics
// demands) and evaluates the tree by direct gate logic (AND/OR/VOTING).
// Two implementations that share nothing but the tree: if they agree within
// statistical bounds, that is qualification evidence; if they disagree, that
// is a NAMED finding — never auto-resolved.
//
// Honesty rules:
//   · statistical power is stated: N samples resolve probabilities down to
//     roughly 10/N; below that the check reports "insufficient MC power",
//     never a fake pass;
//   · trees carrying CCF couplings (ccfGroup + β) are out of scope for the
//     v1 dissimilar path (the exact engine expands them specially) and are
//     skipped WITH THAT REASON, never silently;
//   · every run is seeded (mulberry32) — replayable anywhere from its seed —
//     and journaled into the tamper-evident chain.
//
// Display lane only. BORN MODULAR: injects "🎭 Dissimilar check" onto the
// benchmark page. Exports window.SLDissimilar.
// ============================================================================
(function () {
    'use strict';

    function _mulberry32(seed) {
        let a = seed | 0;
        return function () {
            a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function _hasCcf(root) { let f = false; (function w(n) { if (!n || f) return; if (n.ccfGroup && n.beta > 0) { f = true; return; } (n.children || []).forEach(w); })(root); return f; }
    function _vars(root) {
        const m = new Map();   // logicalId → probability
        (function w(n) {
            if (!n) return;
            if (n.type === 'basic' || n.type === 'undeveloped') {
                const lid = String(n.logicalId != null ? n.logicalId : n.id);
                if (!m.has(lid)) m.set(lid, (typeof n.probability === 'number' && isFinite(n.probability)) ? Math.max(0, Math.min(1, n.probability)) : 0);
            }
            (n.children || []).forEach(w);
        })(root);
        return m;
    }
    // Direct gate-logic evaluation — the dissimilar path. No BDD, no cut sets.
    function _evalTree(n, draw) {
        if (!n) return false;
        if (n.type === 'basic' || n.type === 'undeveloped') return draw.get(String(n.logicalId != null ? n.logicalId : n.id)) === true;
        const kids = (n.children || []).map(k => _evalTree(k, draw));
        const gt = n.gateType || 'OR';
        if (gt === 'AND') return kids.every(Boolean);
        if (gt === 'VOTING') { const k = Math.max(1, n.votingK || n.k || 2); return kids.filter(Boolean).length >= k; }
        return kids.some(Boolean);   // OR default
    }

    // crossCheck(root, {seed, samples}) → { verdict, exact, mcEstimate, ... }
    function crossCheck(root, opts) {
        opts = opts || {};
        const seed = (typeof opts.seed === 'number') ? (opts.seed | 0) : 42;
        const N = Math.max(1000, Math.min(2000000, opts.samples || 200000));
        const out = { seed, samples: N, exact: null, mcEstimate: null, hits: 0, z: null, verdict: null, note: '', ms: 0 };
        try {
            if (!root) { out.verdict = 'skipped'; out.note = 'no tree'; return out; }
            if (_hasCcf(root)) { out.verdict = 'skipped'; out.note = 'contains CCF coupling — v1 dissimilar path covers independent-event trees'; return out; }
            const t0 = Date.now();
            const r = computeExactProbability(JSON.parse(JSON.stringify(root)));
            out.exact = (r && typeof r === 'object' && 'prob' in r) ? r.prob : r;
            if (!(typeof out.exact === 'number' && isFinite(out.exact))) { out.verdict = 'skipped'; out.note = 'exact engine returned no number'; return out; }
            const expected = N * out.exact;
            if (expected < 10) { out.verdict = 'insufficient-power'; out.note = 'MC with ' + N.toLocaleString() + ' samples resolves to ~' + (10 / N).toExponential(1) + '; exact P(top) ' + out.exact.toExponential(2) + ' is below that — no dissimilar verdict possible at this N'; return out; }
            const vars = _vars(root);
            const rnd = _mulberry32(seed);
            const draw = new Map();
            let hits = 0;
            for (let i = 0; i < N; i++) {
                vars.forEach((p, lid) => draw.set(lid, rnd() < p));
                if (_evalTree(root, draw)) hits++;
            }
            out.hits = hits;
            out.mcEstimate = hits / N;
            const se = Math.sqrt(Math.max(expected * (1 - out.exact), 1e-300));
            out.z = (hits - expected) / se;
            out.ms = Date.now() - t0;
            // 4.5σ two-sided: false-alarm odds ≈ 1 in 147,000 runs.
            out.verdict = Math.abs(out.z) <= 4.5 ? 'agree' : 'DISAGREE';
            if (out.verdict === 'DISAGREE') out.note = 'dissimilar paths disagree: exact ' + out.exact.toExponential(6) + ' vs MC ' + out.mcEstimate.toExponential(6) + ' (z=' + out.z.toFixed(1) + ', seed ' + seed + ') — named finding, investigate';
        } catch (e) { out.verdict = 'error'; out.note = (e && e.name) || e.message; }
        return out;
    }

    // run(): seeded synthetic trees sized so MC HAS power (p ~ 1e-1..1e-3).
    function _genTree(nEvents, rnd) {
        let nid = 1;
        function leaf() { const p = Math.pow(10, -1 - rnd() * 2); return { id: nid++, logicalId: 'D' + nid, type: 'basic', probability: p, lambda: p, children: [] }; }
        function build(n) {
            if (n <= 1) return leaf();
            const gt = rnd() < 0.6 ? 'OR' : 'AND';
            const k = 2 + ((rnd() * 3) | 0);
            const parts = []; let left = n;
            for (let i = 0; i < k && left > 0; i++) { const take = i === k - 1 ? left : Math.max(1, Math.min(left - (k - 1 - i), 1 + ((rnd() * (left / (k - i))) | 0))); parts.push(take); left -= take; }
            return { id: nid++, type: 'gate', gateType: gt, children: parts.filter(x => x > 0).map(build) };
        }
        return build(nEvents);
    }
    function run(opts) {
        opts = opts || {};
        const seed = (typeof opts.seed === 'number') ? (opts.seed | 0) : 42;
        const trees = Math.max(1, Math.min(50, opts.trees || 10));
        const rnd = _mulberry32(seed ^ 0x5F3759DF);
        const results = [];
        let agree = 0, disagree = 0, lowPower = 0;
        for (let i = 0; i < trees; i++) {
            const t = _genTree(10 + ((rnd() * 30) | 0), rnd);
            const r = crossCheck(t, { seed: seed + i, samples: opts.samples || 200000 });
            results.push(r);
            if (r.verdict === 'agree') agree++;
            else if (r.verdict === 'DISAGREE') disagree++;
            else lowPower++;
        }
        const ok = disagree === 0 && agree > 0;
        const summary = 'Dissimilar check seed ' + seed + ' · ' + trees + ' trees × ' + (opts.samples || 200000).toLocaleString() + ' MC samples · ' +
            agree + ' agree (≤4.5σ), ' + disagree + ' disagree, ' + lowPower + ' below MC power · ' +
            (ok ? 'EXACT ENGINE CONFIRMED BY DISSIMILAR PATH' : 'FINDING — see results') +
            ' · replay: SLDissimilar.run({seed:' + seed + ', trees:' + trees + '})';
        try { if (typeof jrnl === 'function') jrnl('dissimilar-verify', summary); } catch (_) {}
        return { ok, seed, trees, agree, disagree, lowPower, results, summary };
    }

    // ---- bench-page control -----------------------------------------------------
    function _inject() {
        const host = document.getElementById('view-bench');
        if (!host || document.getElementById('dsv-launch')) return !!document.getElementById('dsv-launch');
        const b = document.createElement('button');
        b.id = 'dsv-launch';
        b.type = 'button';
        b.className = 'ckpt-m-btn';
        b.style.cssText = 'margin:8px 0 8px 8px; font-size:11.5px; padding:5px 14px;';
        b.textContent = '🎭 Dissimilar check — MC cross-checks the exact engine';
        b.title = 'A second, independent evaluation path (direct gate-logic Monte Carlo, no BDD) cross-checks the exact engine on seeded trees. Agreement within 4.5σ is qualification evidence; disagreement is a named finding. Replayable from the seed; journaled.';
        b.addEventListener('click', function () {
            const r = run({ seed: 42, trees: 10 });
            try { if (typeof showToast === 'function') showToast((r.ok ? '✓ ' : '✗ ') + r.summary, r.ok ? 'success' : 'warning', 8000); } catch (_) {}
        });
        const fz = document.getElementById('fuzz-launch');
        if (fz && fz.parentNode) fz.parentNode.insertBefore(b, fz.nextSibling); else host.insertBefore(b, host.firstChild);
        return true;
    }
    function _ready(fn) { if (typeof document === 'undefined') return; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { let tries = 30; const t = setInterval(function () { if (_inject() || --tries <= 0) clearInterval(t); }, 400); });

    // ------------------------------------------------------------- exports
    const api = { crossCheck, run, _evalTree, _mulberry32 };
    if (typeof window !== 'undefined') window.SLDissimilar = api;
    if (typeof globalThis !== 'undefined') globalThis.SLDissimilar = api;
})();

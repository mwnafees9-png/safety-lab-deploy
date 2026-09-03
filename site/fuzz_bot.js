// ============================================================================
// fuzz_bot.js — v1.0 — ASR-2: seeded fuzzing bot (SLFuzz).
//
// The robustness half of the qualification-evidence pair (ASR-1 replay is the
// reproducibility half). Deterministic trees from a seeded PRNG are thrown at
// the REAL engine and checked against mathematical properties that must hold
// for every coherent fault tree — not against expected values, against LAWS:
//
//   P1 RANGE        — P(top) is finite and in [0, 1].
//   P2 DETERMINISM  — the same tree computed twice on fresh arenas is
//                     bit-identical.
//   P3 MONOTONICITY — raising one basic event's probability never lowers
//                     P(top) (coherent AND/OR structure).
//   P4 CUTSET WITNESS — force any returned minimal cut set's events to 1:
//                     P(top) must become exactly 1 (the cut set really cuts).
//   P5 HONEST REFUSAL — engine failures are named refusals
//                     (BDDExplosionError / CutsetExplosionError), never a
//                     silently wrong number.
//
// REPLAYABLE: every run is fully determined by (seed, trials) — a reported
// failure replays anywhere, any day, from its seed. Results are journaled
// into the hash-chained journal ('fuzz' entries), so robustness evidence
// accumulates with tamper-evident lineage.
//
// Two-lane discipline: the bot originates NOTHING the project keeps — trees
// are synthetic, checks are engine-vs-mathematics, and the only write is the
// journal entry recording the run.
//
// BORN MODULAR: new file; injects a "🧪 Fuzz the engine" control onto the
// benchmark page when present. Exports window.SLFuzz.
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

    // Deterministic coherent tree: AND/OR gates, local repeats (REPEAT_WINDOW
    // discipline from perf_bench), sizes 20–120 events per trial.
    function genTree(nEvents, rnd) {
        let nid = 1;
        const recent = [];
        function leaf() {
            let node;
            if (recent.length >= 3 && rnd() < 0.15) {
                const src = recent[(rnd() * Math.min(recent.length, 12)) | 0];
                node = { id: nid++, logicalId: src.logicalId, type: 'basic', probability: src.probability, lambda: src.lambda, children: [] };
            } else {
                const p = Math.pow(10, -2 - rnd() * 4);
                node = { id: nid++, logicalId: 'F' + nid, type: 'basic', probability: p, lambda: p, children: [] };
                recent.push(node); if (recent.length > 12) recent.shift();
            }
            return node;
        }
        function build(n) {
            if (n <= 1) return leaf();
            const gt = rnd() < 0.6 ? 'OR' : 'AND';
            const k = 2 + ((rnd() * 3) | 0);
            const parts = []; let left = n;
            for (let i = 0; i < k && left > 0; i++) {
                const take = i === k - 1 ? left : Math.max(1, Math.min(left - (k - 1 - i), 1 + ((rnd() * (left / (k - i))) | 0)));
                parts.push(take); left -= take;
            }
            return { id: nid++, type: 'gate', gateType: gt, children: parts.filter(x => x > 0).map(build) };
        }
        return build(nEvents);
    }

    function _p(root) {
        const r = computeExactProbability(JSON.parse(JSON.stringify(root)));
        return (r && typeof r === 'object' && 'prob' in r) ? r.prob : r;
    }
    function _leaves(root, out) {
        out = out || [];
        (function walk(n) { if (!n) return; if (n.type === 'basic') out.push(n); (n.children || []).forEach(walk); })(root);
        return out;
    }

    // ---- one trial: all five properties on one deterministic tree -------------
    function _trial(rnd, trialNo) {
        const fails = [];
        const n = 20 + ((rnd() * 100) | 0);
        const tree = genTree(n, rnd);
        let p0 = null;
        try { p0 = _p(tree); } catch (e) {
            // P5 — a refusal must be NAMED; anything else is a robustness fail.
            if (!(e && /ExplosionError/.test(e.name || ''))) fails.push('P5 unnamed failure: ' + (e && e.name) + ' ' + String(e && e.message).slice(0, 60));
            return { fails, refused: true };
        }
        if (!(typeof p0 === 'number' && isFinite(p0) && p0 >= 0 && p0 <= 1)) fails.push('P1 range: ' + p0);
        try { if (_p(tree) !== p0) fails.push('P2 determinism'); } catch (e) { fails.push('P2 recompute threw: ' + (e && e.name)); }
        // P3 — bump one random leaf up; P(top) must not decrease.
        try {
            const copy = JSON.parse(JSON.stringify(tree));
            const ls = _leaves(copy);
            const pick = ls[(rnd() * ls.length) | 0];
            const bumped = Math.min(1, pick.probability * 3);
            ls.forEach(l => { if (l.logicalId === pick.logicalId) { l.probability = bumped; l.lambda = bumped; } });
            const p1 = _p(copy);
            if (!(p1 >= p0 - Math.abs(p0) * 1e-12)) fails.push('P3 monotonicity: ' + p0 + ' -> ' + p1);
        } catch (e) { fails.push('P3 threw: ' + (e && e.name)); }
        // P4 — the first minimal cut set, forced true, must fail the top.
        try {
            if (typeof getCutsets === 'function') {
                const cuts = getCutsets(JSON.parse(JSON.stringify(tree)));
                const first = Array.isArray(cuts) && cuts.length ? cuts[0] : null;
                if (first && first.length) {
                    const ids = new Set(first.map(e => String(e.logicalId != null ? e.logicalId : e.id)));
                    const forced = JSON.parse(JSON.stringify(tree));
                    _leaves(forced).forEach(l => { const hit = ids.has(String(l.logicalId != null ? l.logicalId : l.id)); l.probability = hit ? 1 : 0; l.lambda = l.probability; });
                    const pf = _p(forced);
                    if (pf !== 1) fails.push('P4 cutset witness: forced cut gives P=' + pf);
                }
            }
        } catch (e) { if (!/ExplosionError/.test((e && e.name) || '')) fails.push('P4 threw: ' + (e && e.name)); }
        return { fails, refused: false };
    }

    // ---- the run: fully determined by (seed, trials) ---------------------------
    function run(opts) {
        opts = opts || {};
        const seed = (typeof opts.seed === 'number') ? (opts.seed | 0) : 42;
        const trials = Math.max(1, Math.min(500, opts.trials || 50));
        const rnd = _mulberry32(seed);
        const failures = [];
        let refused = 0;
        const t0 = Date.now();
        for (let i = 1; i <= trials; i++) {
            const r = _trial(rnd, i);
            if (r.refused) refused++;
            r.fails.forEach(f => failures.push({ trial: i, what: f }));
        }
        const ms = Date.now() - t0;
        const ok = failures.length === 0;
        const summary = 'Fuzz seed ' + seed + ' · ' + trials + ' trials (' + refused + ' honest refusals) · ' +
            (ok ? 'ALL PROPERTIES HELD' : failures.length + ' property failure(s), first: trial ' + failures[0].trial + ' ' + failures[0].what) +
            ' · ' + ms + 'ms · replay: SLFuzz.run({seed:' + seed + ', trials:' + trials + '})';
        try { if (typeof jrnl === 'function') jrnl('fuzz', summary); } catch (_) {}
        return { ok, seed, trials, refused, failures, ms, summary };
    }

    // ---- surface: a control on the benchmark page ------------------------------
    function _inject() {
        const host = document.getElementById('view-bench');
        if (!host || document.getElementById('fuzz-launch')) return !!document.getElementById('fuzz-launch');
        const b = document.createElement('button');
        b.id = 'fuzz-launch';
        b.type = 'button';
        b.className = 'ckpt-m-btn';
        b.style.cssText = 'margin:8px 0; font-size:11.5px; padding:5px 14px;';
        b.textContent = '🧪 Fuzz the engine — 50 seeded trials, 5 properties';
        b.title = 'Deterministic robustness evidence: seeded random trees checked against mathematical laws (range, determinism, monotonicity, cut-set witness, honest refusal). Fully replayable from the seed; result is journaled.';
        b.addEventListener('click', function () {
            const r = run({ seed: 42, trials: 50 });
            try { if (typeof showToast === 'function') showToast((r.ok ? '✓ ' : '✗ ') + r.summary, r.ok ? 'success' : 'warning', 8000); } catch (_) {}
        });
        host.insertBefore(b, host.firstChild);
        return true;
    }
    function _ready(fn) { if (typeof document === 'undefined') return; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { let tries = 30; const t = setInterval(function () { if (_inject() || --tries <= 0) clearInterval(t); }, 400); });

    // ------------------------------------------------------------- exports
    const api = { run, genTree, _mulberry32 };
    if (typeof window !== 'undefined') window.SLFuzz = api;
    if (typeof globalThis !== 'undefined') globalThis.SLFuzz = api;
})();

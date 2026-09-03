// ============================================================================
// perf_bench.js — v1.0 — Backlog #7a: the Scale & Performance benchmark page.
//
// The scalability question ("does it survive industrial-size trees?") answered
// with EVIDENCE, not assertion: deterministic synthetic fault trees of
// escalating size are run through the REAL engine primitives — the very same
// buildBDDFromFT / computeExactProbability / bddMinimalCutsets /
// computeImportanceMeasures the app calls — and the wall-clock times, BDD node
// counts and cut-set counts are published with a machine/browser/date stamp,
// same epistemics as the engine-selftest stamp ("measured on THIS machine").
//
// HONESTY RULES:
//   · trees are SYNTHETIC and labeled so — structural benchmarks, no licensed
//     data, no pretense of a real aircraft;
//   · when the explosion guard refuses, the row SAYS refused (which cap, what
//     count) — refusal is a correct result, never hidden;
//   · timings run on the main thread today (that is the current product
//     truth); the worker offload is the next backlog item and will be
//     measured here when it lands.
//
// DETERMINISM: the generator uses a seeded PRNG (mulberry32) — same seed, same
// tree, byte for byte; no unseeded randomness anywhere. Benchmark results are
// machine-specific, so they persist to localStorage, never to project data.
//
// BORN MODULAR: new file; self-registering page + nav (monitor_spec pattern);
// exports benchGenTree/benchRun/benchTiers for tests. Zero engine edits.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const _now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const LS_KEY = 'safetyLab.benchResults.v1';

    // ------------------------------------------------------------- generator
    // mulberry32 — tiny deterministic PRNG. Seed in, identical stream out.
    function _mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // benchGenTree({events, fanout, repeatPct, seed}) → { root, stats }
    // EXACT-COUNT recursive split: build(n) always yields a subtree with
    // exactly n leaf slots, so a tier labeled "2,000 events" carries exactly
    // 2,000 — never a seed-dependent surprise. Gate types alternate OR/AND by
    // depth; repeatPct of leaves reuse an earlier leaf's logicalId (repeated
    // events — the thing that actually stresses a BDD). Values are synthetic
    // and deterministic from the seed.
    function benchGenTree(cfg) {
        cfg = cfg || {};
        const target = Math.max(2, cfg.events | 0 || 100);
        const fanout = Math.max(2, cfg.fanout | 0 || 3);
        const repeatPct = Math.min(0.5, Math.max(0, +cfg.repeatPct || 0));
        const rnd = _mulberry32((cfg.seed | 0) || 42);
        let nextId = 9000001;                      // far above app id ranges; tree never enters ftaPages
        const slots = [];                           // one gate ref per pending leaf, in build order
        let gates = 0;
        // build(n, gateType): a gate with exactly n leaf slots distributed over
        // 2..fanout children; a child share of 1 is a leaf slot, bigger shares
        // recurse with the alternated gate type.
        function build(n, gateType) {
            const g = { id: nextId++, type: 'gate', gateType, probability: 0, children: [], name: gateType + '-' + (nextId - 9000001) };
            gates++;
            const k = Math.max(2, Math.min(n, 2 + Math.floor(rnd() * (fanout - 1))));
            // Random composition of n into k parts, each ≥ 1 (deterministic).
            const parts = new Array(k).fill(1);
            for (let r = n - k; r > 0; r--) parts[Math.floor(rnd() * k)]++;
            parts.forEach(p => {
                if (p === 1) slots.push(g);
                else g.children.push(build(p, gateType === 'OR' ? 'AND' : 'OR'));
            });
            return g;
        }
        const root = build(target, 'OR');
        // Fill slots in build order: fresh leaf, or (repeatPct) a clone of a
        // RECENT leaf — same logicalId + probability = a true repeated event.
        // Recency matters: real repeated events are redundancy pairs that sit
        // near each other in the tree (channel A/B under adjacent gates), and
        // the BDD's tree-order variable ordering exploits that locality.
        // Scattering repeats globally is an adversarial worst case that blows
        // the BDD up exponentially — a true property of BDDs, but not a
        // representative benchmark of aircraft fault trees.
        const REPEAT_WINDOW = 12;
        const leaves = [];
        let repeated = 0;
        slots.forEach(g => {
            if (leaves.length > 3 && rnd() < repeatPct) {
                const lo = Math.max(0, leaves.length - REPEAT_WINDOW);
                const src = leaves[lo + Math.floor(rnd() * (leaves.length - lo))];
                g.children.push({ id: nextId++, logicalId: src.logicalId, displayId: src.displayId, name: src.name, type: 'basic', probability: src.probability, lambda: src.lambda, children: [] });
                repeated++;
            } else {
                const p = 1e-6 + rnd() * 9e-5;      // synthetic P in [1e-6, ~1e-4]
                const id = nextId++;
                const leaf = { id, logicalId: 'B-' + id, displayId: 'BE-' + id, name: 'Synthetic event ' + id, type: 'basic', probability: p, lambda: p, children: [] };
                leaves.push(leaf);
                g.children.push(leaf);
            }
        });
        return { root, stats: { leafSlots: slots.length, uniqueEvents: leaves.length, repeated, gates } };
    }

    // ------------------------------------------------------------------ tiers
    function benchTiers(heavy) {
        const t = [
            { label: 'S',  events: 100,  fanout: 3, repeatPct: 0.10, seed: 101 },
            { label: 'M',  events: 250,  fanout: 3, repeatPct: 0.10, seed: 102 },
            { label: 'L',  events: 500,  fanout: 3, repeatPct: 0.12, seed: 103 },
            { label: 'XL', events: 1000, fanout: 4, repeatPct: 0.12, seed: 104 },
            { label: '2K', events: 2000, fanout: 4, repeatPct: 0.15, seed: 105 },
        ];
        if (heavy) t.push({ label: '5K', events: 5000, fanout: 4, repeatPct: 0.15, seed: 106, heavy: true });
        return t;
    }

    // ------------------------------------------------------------------ runner
    // Runs one tier synchronously (that IS the product truth today) and returns
    // its row. benchRun() spaces tiers with setTimeout so progress can paint.
    function _runTier(cfg) {
        const gen = benchGenTree(cfg);
        const row = {
            label: cfg.label || String(cfg.events), events: cfg.events,
            uniqueEvents: gen.stats.uniqueEvents, repeated: gen.stats.repeated, gates: gen.stats.gates,
        };
        // Exact P(top) via BDD (includes BDD build).
        let t0 = _now();
        try {
            const r = computeExactProbability(gen.root);
            row.pTopMs = +(_now() - t0).toFixed(1);
            row.pTop = r.prob;
            row.bddSize = r.bddSize;
        } catch (err) {
            row.pTopMs = +(_now() - t0).toFixed(1);
            row.pTopError = (err && err.message) || String(err);
        }
        // Cut-set enumeration — the GUARDED path the app's cut-set report
        // actually runs (getCutsets, fta_engine.js). Refusals are a RESULT,
        // not a failure: the guard aborts rather than truncate or approximate.
        t0 = _now();
        try {
            const mcs = getCutsets(gen.root);
            row.mcsMs = +(_now() - t0).toFixed(1);
            row.mcsCount = mcs.length;
        } catch (err) {
            row.mcsMs = +(_now() - t0).toFixed(1);
            if (err && err.name === 'CutsetExplosionError') { row.mcsRefused = true; row.mcsDetail = err.message; }
            else if (err && (err instanceof RangeError || /call stack/i.test(err.message || ''))) {
                // The enumeration overflowed the JS call stack BEFORE reaching
                // the budget guard — infeasible at this scale, reported as such.
                row.mcsOverflow = true;
                row.mcsDetail = 'Enumeration exceeded the browser call stack before the budget guard could fire — cut-set enumeration is infeasible at this scale in one pass. Partition the tree with transfer gates. (Guard hardening is on the engineering plan.)';
            }
            else row.mcsError = (err && err.message) || String(err);
        }
        // Importance measures (six BDD-exact measures over every event).
        t0 = _now();
        try {
            const imp = computeImportanceMeasures(gen.root);
            row.impMs = +(_now() - t0).toFixed(1);
            row.impCount = (imp && imp.measures && imp.measures.length) || 0;
        } catch (err) {
            row.impMs = +(_now() - t0).toFixed(1);
            row.impError = (err && err.message) || String(err);
        }
        return row;
    }

    function benchRun(tiers, onProgress) {
        tiers = tiers || benchTiers(false);
        return new Promise(resolve => {
            const rows = [];
            let i = 0;
            function step() {
                if (i >= tiers.length) {
                    const result = {
                        at: new Date().toISOString(),
                        ua: (typeof navigator !== 'undefined' && navigator.userAgent) || 'node',
                        rows,
                    };
                    try { localStorage.setItem(LS_KEY, JSON.stringify(result)); } catch (_) {}
                    resolve(result);
                    return;
                }
                const cfg = tiers[i++];
                if (onProgress) { try { onProgress(cfg, i - 1, tiers.length); } catch (_) {} }
                // Yield to the event loop so the progress line paints before the
                // synchronous tier run occupies the thread.
                setTimeout(() => { rows.push(_runTier(cfg)); step(); }, 30);
            }
            step();
        });
    }

    // ------------------------------------------------------------- rendering
    const _ms = v => (v == null ? '—' : (v >= 1000 ? (v / 1000).toFixed(2) + ' s' : v + ' ms'));
    function _mcsCell(r) {
        if (r.mcsRefused) return '<span style="color:#9A6200; font-weight:700;" title="' + _esc(r.mcsDetail || '') + '">guard refused ✋</span> <span style="color:var(--color-text-tertiary); font-size:10.5px;">(' + _ms(r.mcsMs) + ' — refuses, never approximates)</span>';
        if (r.mcsOverflow) return '<span style="color:#9A6200; font-weight:700;" title="' + _esc(r.mcsDetail || '') + '">overflowed ✋</span> <span style="color:var(--color-text-tertiary); font-size:10.5px;">(' + _ms(r.mcsMs) + ' — infeasible in one pass; partition with transfer gates)</span>';
        if (r.mcsError) return '<span style="color:#8E2A2A;" title="' + _esc(r.mcsError) + '">error</span>';
        return '<b>' + _ms(r.mcsMs) + '</b> <span style="color:var(--color-text-tertiary); font-size:10.5px;">(' + (r.mcsCount != null ? r.mcsCount.toLocaleString() : '—') + ' sets)</span>';
    }
    function _copyMarkdown(result) {
        const h = '| Tier | Events (unique+rep) | Gates | P(top) exact | BDD nodes | Min cut sets | Importance |\n|---|---|---|---|---|---|---|';
        const lines = result.rows.map(r => '| ' + r.label + ' | ' + r.uniqueEvents + '+' + r.repeated + ' | ' + r.gates +
            ' | ' + _ms(r.pTopMs) + ' | ' + (r.bddSize != null ? r.bddSize.toLocaleString() : '—') +
            ' | ' + (r.mcsRefused ? 'guard refused (' + _ms(r.mcsMs) + ')' : r.mcsOverflow ? 'infeasible in one pass (' + _ms(r.mcsMs) + ')' : _ms(r.mcsMs) + ' (' + (r.mcsCount || 0) + ' sets)') +
            ' | ' + _ms(r.impMs) + ' |');
        return 'Safety Lab Aero — engine benchmarks (synthetic structural trees, measured on this machine)\n' +
            'Run: ' + result.at + ' · ' + result.ua + '\n\n' + h + '\n' + lines.join('\n');
    }

    function renderBenchPage() {
        const host = document.getElementById('view-bench');
        if (!host) return;
        let last = null;
        try { last = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (_) {}
        let html = '<h3>Scale &amp; Performance <span style="font-size:13px; font-weight:500; color:var(--color-text-tertiary); margin-left:8px;">— the real engine, timed on synthetic structural trees, on THIS machine</span></h3>';
        html += '<p style="font-size:12px; color:var(--color-text-secondary); ">Each tier generates a deterministic synthetic fault tree (seeded — same seed, same tree, on any machine) and runs the exact functions the app itself calls: BDD-exact P(top), minimal cut sets, and the six importance measures. Trees are structural benchmarks, not aircraft data. When the cut-set explosion guard refuses a tier, that refusal is shown — the engine never approximates past its budget. Timings currently run on the main thread; the page will be busy during a run.</p>';
        html += '<div style="display:flex; gap:8px; align-items:center; margin:12px 0;">' +
            '<button class="ckpt-m-btn ckpt-m-btn-primary" style="font-size:12px; padding:5px 16px;" onclick="benchRunUi(false)">Run standard tiers (100 → 2,000 events)</button>' +
            '<button class="ckpt-m-btn" style="font-size:12px; padding:5px 12px;" title="Adds a 5,000-event tier. Expect the page to be unresponsive for the duration of that tier." onclick="benchRunUi(true)">+ heavy tier (5,000)</button>' +
            (last ? '<button class="ckpt-m-btn" style="font-size:12px; padding:5px 12px;" onclick="benchCopyUi()">Copy as Markdown</button>' : '') +
            '<span id="bench-status" class="u-mono" style="font-size:11.5px; color:var(--color-text-secondary);"></span></div>';
        if (last && last.rows && last.rows.length) {
            html += '<div class="u-mono" style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:8px;">Last run: ' + _esc(String(last.at).replace('T', ' ').slice(0, 19)) + ' UTC · ' + _esc(String(last.ua).slice(0, 90)) + '</div>';
            html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr>' +
                '<th>Tier</th><th>Events (unique + repeated)</th><th>Gates</th><th>Exact P(top) via BDD</th><th>BDD nodes</th><th>Minimal cut sets</th><th>Importance (6 measures)</th></tr></thead><tbody>';
            last.rows.forEach(r => {
                html += '<tr><td><b>' + _esc(r.label) + '</b></td>' +
                    '<td class="u-mono">' + r.uniqueEvents.toLocaleString() + ' + ' + r.repeated.toLocaleString() + '</td>' +
                    '<td class="u-mono">' + r.gates.toLocaleString() + '</td>' +
                    '<td class="u-mono">' + (r.pTopError ? '<span style="color:#8E2A2A;" title="' + _esc(r.pTopError) + '">error</span>' : '<b>' + _ms(r.pTopMs) + '</b> <span style="color:var(--color-text-tertiary); font-size:10.5px;">P=' + (r.pTop != null ? r.pTop.toExponential(3) : '—') + '</span>') + '</td>' +
                    '<td class="u-mono">' + (r.bddSize != null ? r.bddSize.toLocaleString() : '—') + '</td>' +
                    '<td class="u-mono">' + _mcsCell(r) + '</td>' +
                    '<td class="u-mono">' + (r.impError ? '<span style="color:#8E2A2A;" title="' + _esc(r.impError) + '">error</span>' : '<b>' + _ms(r.impMs) + '</b>') + '</td></tr>';
            });
            html += '</tbody></table>';
        } else {
            html += '<p style="font-size:12px; color:var(--color-text-tertiary);">No results yet on this machine — run the standard tiers.</p>';
        }
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Deterministic generator (mulberry32, fixed seeds) · engine primitives identical to the app’s: computeExactProbability / bddMinimalCutsets / computeImportanceMeasures · results persist locally (machine-specific — never in project data) · cross-check the math itself in Math Validation (25 cited benchmarks).</p>';
        host.innerHTML = html;
    }

    window.benchRunUi = function (heavy) {
        const status = document.getElementById('bench-status');
        const tiers = benchTiers(!!heavy);
        benchRun(tiers, (cfg, i, n) => { if (status) status.textContent = 'running ' + cfg.label + ' (' + (i + 1) + '/' + n + ') — ' + cfg.events.toLocaleString() + ' events…'; })
            .then(() => { renderBenchPage(); try { showToast('Benchmarks complete.', 'success', 2600); } catch (_) {} });
    };
    window.benchCopyUi = function () {
        try {
            const last = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
            if (!last) return;
            const md = _copyMarkdown(last);
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(md);
            try { showToast('Benchmark table copied as Markdown.', 'success', 2600); } catch (_) {}
        } catch (_) {}
    };

    // ---- page registration (born-modular; mirrors monitor_spec.js) ---------
    function _ensurePage() {
        if (!document.getElementById('view-bench')) {
            const prev = document.getElementById('view-ffs') || document.getElementById('view-budget') || document.getElementById('view-monitors');
            if (!prev || !prev.parentNode) return false;
            const v = document.createElement('div'); v.id = 'view-bench'; v.style.display = 'none';
            prev.parentNode.insertBefore(v, prev.nextSibling);
        }
        if (!document.getElementById('snav-bench')) {
            const prevNav = document.getElementById('snav-ffs') || document.getElementById('snav-budget') || document.getElementById('snav-fta');   // 23 Aug: chain re-anchored
            if (prevNav && prevNav.parentNode) {
                const a = document.createElement('a');
                a.className = prevNav.className; a.id = 'snav-bench'; a.setAttribute('role', 'button'); a.setAttribute('tabindex', '0');
                a.setAttribute('onclick', "switchTab('bench')");
                a.innerHTML = '<span class="asb-lbl">Scale &amp; Performance</span>';
                prevNav.parentNode.insertBefore(a, prevNav.nextSibling);
            }
        }
        return true;
    }
    (function wrapNav() {
        if (typeof window === 'undefined' || typeof window.switchTab !== 'function' || window.switchTab._benchWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-bench');
                if (v) v.style.display = (tabId === 'bench') ? 'block' : 'none';
                const s = document.getElementById('snav-bench');
                if (s) s.classList.toggle('snav-active', tabId === 'bench');
                if (tabId === 'bench') renderBenchPage();
            } catch (_) {}
            return r;
        };
        wrapped._benchWrapped = true;
        window.switchTab = wrapped;
    })();
    function _ready(fn) { if (typeof document === 'undefined') return; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
    _ready(function () { let tries = 30; const t = setInterval(function () { if (_ensurePage() || --tries <= 0) clearInterval(t); }, 250); });

    // ------------------------------------------------------------- exports
    if (typeof window !== 'undefined') {
        window.benchGenTree = benchGenTree;
        window.benchRun = benchRun;
        window.benchTiers = benchTiers;
        window.renderBenchPage = renderBenchPage;
    }
    if (typeof globalThis !== 'undefined') { globalThis.benchGenTree = benchGenTree; globalThis.benchRun = benchRun; globalThis.benchTiers = benchTiers; }
})();

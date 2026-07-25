// ============================================================================
// markov_ctmc.js — v1.0 — ARP-G3: full CTMC — transient solution, refusals,
// cited benchmarks — on top of the editor + steady-state lane that already
// ship (fta_quant_modules: solveMarkovModel, model CRUD, closed-form card;
// markov_ndf.js: the 3-state N/D/F discrete template).
//
// THE GAP THIS CLOSES: a Markov-attached basic event was quantified at
// STEADY STATE (t → ∞), but the mission question is P(failed at t = T).
// For a repairable 2-state chain the steady figure λ/(λ+μ) OVERSTATES the
// mission unavailability λ/(λ+μ)·(1−e^{−(λ+μ)t}) — conservative, but not
// the answer. This module supplies the transient answer and wires it in:
//
//   · solveMarkovTransient(model, t, opts) — uniformization:
//         π(t) = Σ_k Pois(Λt; k) · π0·Pᵏ,   P = I + Q/Λ,  Λ = max|Q_ii|
//     with MODE-CENTRED Poisson weights (start at k = ⌊Λt⌋, recurse both
//     ways, normalize) so e^{−Λt} never underflows, truncation at a STATED
//     tolerance (default 1e-12, in the receipt), and a hard term cap that
//     REFUSES by name rather than degrade silently.
//   · validateMarkovModel(model) — refusals with names: unknown state refs,
//     non-positive/non-finite rates, duplicate/empty state names, < 2
//     states, self-loops (previously dropped silently). Advisory when no
//     state is marked failed.
//   · effectiveProb wrap — a VALID Markov-attached event now quantifies at
//     the event's own exposure time (per-event exposure model honored via
//     _nodeExposureTime). An INVALID model falls back to the previous
//     steady-state behavior — numbers never change silently under an error;
//     the panel names the errors instead.
//   · Cited benchmarks — runMarkovBenchmarks(): the two standard closed
//     forms every reliability text carries (pure-death 1−e^{−λt};
//     repairable λ/(λ+μ)·(1−e^{−(λ+μ)t})) plus the t→∞ agreement with the
//     existing steady-state solver. Closed forms are mathematics, not
//     licensed text — stated in original wording.
//   · Panel receipts — renderMarkovModels wrapped: each model gains a
//     transient line π(T) at the mission exposure with the uniformization
//     receipt (Λ, terms, tolerance) next to the steady column, and the
//     validation errors when they exist.
//
// The G.11 caveat this replaces: "Markov = steady state only". The NDF
// template keeps its own discrete-time lane untouched.
//
// Display-lane: computes, wraps, renders; writes NOTHING to stores. Loads
// after fta_quant_modules (defer order); no-ops without it.
// ============================================================================
(function () {
    'use strict';

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---- validation (refuse with names, never repair) -----------------------
    function validateMarkovModel(model) {
        const errors = [], warnings = [];
        if (!model || !Array.isArray(model.states)) return { ok: false, errors: ['no model / no states array'], warnings };
        if (model.states.length < 2) errors.push('fewer than 2 states — a chain with one state has no dynamics');
        const names = model.states.map(s => (s && s.name != null ? String(s.name) : ''));
        names.forEach((nm, i) => { if (!nm.trim()) errors.push('state #' + (i + 1) + ' has an empty name'); });
        const seen = new Set();
        names.forEach(nm => { if (nm.trim()) { if (seen.has(nm)) errors.push('duplicate state name "' + nm + '" — transitions become ambiguous'); seen.add(nm); } });
        (model.transitions || []).forEach((t, i) => {
            const tag = 'transition #' + (i + 1) + ' (' + (t && t.from) + '→' + (t && t.to) + ')';
            if (!t || !seen.has(String(t.from))) errors.push(tag + ': unknown FROM state');
            if (!t || !seen.has(String(t.to))) errors.push(tag + ': unknown TO state');
            if (t && String(t.from) === String(t.to)) errors.push(tag + ': self-loop — a rate back into the same state is not a CTMC transition (previously dropped silently; now named)');
            const r = parseFloat(t && t.rate);
            if (!isFinite(r) || r <= 0) errors.push(tag + ': rate ' + (t && t.rate) + ' is not a positive finite number');
        });
        if (!model.states.some(s => s && s.isFailed)) warnings.push('no state is marked Failed — P(failed) will be 0 by construction');
        return { ok: errors.length === 0, errors, warnings };
    }

    // ---- Q matrix (same construction as the steady solver) ------------------
    function _buildQ(model) {
        const n = model.states.length;
        const idx = new Map(model.states.map((s, i) => [s.name, i]));
        const Q = Array.from({ length: n }, () => Array(n).fill(0));
        (model.transitions || []).forEach(t => {
            const i = idx.get(t.from), j = idx.get(t.to);
            if (i == null || j == null || i === j) return;
            const r = parseFloat(t.rate) || 0;
            if (r > 0) Q[i][j] += r;
        });
        for (let i = 0; i < n; i++) {
            let off = 0;
            for (let j = 0; j < n; j++) if (j !== i) off += Q[i][j];
            Q[i][i] = -off;
        }
        return Q;
    }

    // ---- transient by uniformization ---------------------------------------
    // opts: { tol (default 1e-12), maxTerms (default 200000), initial (state
    // name; default model.initialState, else the first state) }
    function solveMarkovTransient(model, t, opts) {
        opts = opts || {};
        const tol = (opts.tol > 0) ? opts.tol : 1e-12;
        const maxTerms = opts.maxTerms || 200000;
        const v = validateMarkovModel(model);
        if (!v.ok) return { ok: false, reason: 'model refused: ' + v.errors[0] + (v.errors.length > 1 ? ' (+' + (v.errors.length - 1) + ' more)' : ''), errors: v.errors };
        if (!(isFinite(t) && t >= 0)) return { ok: false, reason: 'mission time t must be a finite number ≥ 0 (got ' + t + ')' };
        const n = model.states.length;
        // initial distribution
        let init = 0;
        const wanted = opts.initial != null ? opts.initial : model.initialState;
        if (wanted != null) {
            init = model.states.findIndex(s => s.name === wanted);
            if (init < 0) return { ok: false, reason: 'initial state "' + wanted + '" is not a state of this model' };
        }
        let pi0 = Array(n).fill(0); pi0[init] = 1;

        const Q = _buildQ(model);
        let Lambda = 0;
        for (let i = 0; i < n; i++) Lambda = Math.max(Lambda, -Q[i][i]);
        const failedMask = model.states.map(s => !!s.isFailed);
        const pFrom = pi => pi.reduce((a, p, i) => a + (failedMask[i] ? p : 0), 0);

        if (Lambda === 0 || t === 0) {
            return { ok: true, pi: pi0, pFailed: pFrom(pi0), t,
                     receipt: { method: 'uniformization', Lambda, t, terms: 0, tol, note: Lambda === 0 ? 'no transitions — π(t) = π(0)' : 't = 0' } };
        }
        const Lt = Lambda * t;
        // P = I + Q/Λ (row-stochastic DTMC)
        const P = Q.map((row, i) => row.map((q, j) => (i === j ? 1 + q / Lambda : q / Lambda)));

        // Mode-centred Poisson weights: w_m = 1 at m = ⌊Λt⌋, recurse both ways
        // until relative weight < tol·1e-4, then normalize. Never touches
        // e^{−Λt}, so no underflow at any Λt. Right edge R bounds the number
        // of vector–matrix products.
        const m = Math.floor(Lt);
        const cut = tol * 1e-4;
        const wRight = [1];                              // w[m], w[m+1], …
        for (let k = m; ; k++) {
            const next = wRight[wRight.length - 1] * Lt / (k + 1);
            if (k + 1 - m > 10 && next < cut) break;
            wRight.push(next);
            if (m + wRight.length > maxTerms) {
                return { ok: false, reason: 'uniformization needs more than ' + maxTerms.toLocaleString() + ' terms (Λt = ' + Lt.toExponential(2) + ') — beyond the stated envelope; REFUSED rather than truncated silently. Reduce the horizon, or read the steady-state lane for the long-run figure.' };
            }
        }
        const wLeft = [];                                // w[m−1], w[m−2], …
        for (let k = m; k > 0; k--) {
            const prev = (wLeft.length ? wLeft[wLeft.length - 1] : 1) * k / Lt;
            if (m - wLeft.length - 1 >= 0 && wLeft.length > 10 && prev < cut) break;
            wLeft.push(prev);
            if (wLeft.length >= m) break;
        }
        const L = m - wLeft.length, R = m + wRight.length - 1;
        let sum = 0;
        const w = Array(R - L + 1).fill(0);
        for (let i = 0; i < wLeft.length; i++) { w[m - 1 - i - L] = wLeft[i]; }
        for (let i = 0; i < wRight.length; i++) { w[m + i - L] = wRight[i]; }
        w.forEach(x => { sum += x; });
        for (let i = 0; i < w.length; i++) w[i] /= sum;   // Σw = 1 − (tail < tol)

        // π(t) = Σ_{k=L}^{R} w_k · π0·Pᵏ  — one running vector, accumulate in window
        let vk = pi0.slice();
        const acc = Array(n).fill(0);
        for (let k = 0; k <= R; k++) {
            if (k >= L) { const wk = w[k - L]; for (let i = 0; i < n; i++) acc[i] += wk * vk[i]; }
            if (k === R) break;
            const nv = Array(n).fill(0);
            for (let i = 0; i < n; i++) {
                const vi = vk[i];
                if (vi === 0) continue;
                const row = P[i];
                for (let j = 0; j < n; j++) nv[j] += vi * row[j];
            }
            vk = nv;
        }
        // normalize the tiny truncation residue honestly
        const tot = acc.reduce((a, x) => a + x, 0);
        const pi = tot > 0 ? acc.map(x => x / tot) : acc;
        return { ok: true, pi, pFailed: pFrom(pi), t,
                 receipt: { method: 'uniformization (mode-centred Poisson weights)', Lambda, t, terms: R - L + 1, kRange: [L, R], tol } };
    }

    // ---- cited benchmarks ---------------------------------------------------
    // Closed forms are mathematics; the wording is original. Cite-and-point:
    // any standard reliability text derives both (e.g., the constant-rate
    // Markov chapter of Trivedi, or SAE ARP4761A's own G.11 discussion of
    // time-dependent unavailability).
    const BENCHMARKS = [
        { id: 'pure-death', name: '2-state pure death: P(t) = 1 − e^{−λt}',
          cite: 'standard closed form — constant-rate single component, no repair',
          run: function () {
              const lam = 1.7e-4, t = 350;
              const m = { states: [{ name: 'Up' }, { name: 'Down', isFailed: true }], transitions: [{ from: 'Up', to: 'Down', rate: lam }] };
              const r = solveMarkovTransient(m, t);
              return { got: r.ok ? r.pFailed : NaN, want: 1 - Math.exp(-lam * t), tol: 1e-12 };
          } },
        { id: 'repairable', name: '2-state repairable: P(t) = λ/(λ+μ)·(1 − e^{−(λ+μ)t})',
          cite: 'standard closed form — constant-rate unit with constant-rate repair',
          run: function () {
              const lam = 4e-3, mu = 0.25, t = 18;
              const m = { states: [{ name: 'Up' }, { name: 'Down', isFailed: true }],
                          transitions: [{ from: 'Up', to: 'Down', rate: lam }, { from: 'Down', to: 'Up', rate: mu }] };
              const r = solveMarkovTransient(m, t);
              return { got: r.ok ? r.pFailed : NaN, want: (lam / (lam + mu)) * (1 - Math.exp(-(lam + mu) * t)), tol: 1e-12 };
          } },
        { id: 'steady-agreement', name: 't → ∞ agreement with the steady-state solver',
          cite: 'internal cross-check — two independent methods, one figure',
          run: function () {
              if (typeof solveMarkovModel !== 'function') return { got: NaN, want: 0, tol: 1e-9, skipped: 'steady solver not loaded' };
              const m = { states: [{ name: 'A' }, { name: 'B' }, { name: 'C', isFailed: true }],
                          transitions: [{ from: 'A', to: 'B', rate: 2e-3 }, { from: 'B', to: 'A', rate: 0.1 },
                                        { from: 'B', to: 'C', rate: 5e-4 }, { from: 'C', to: 'A', rate: 0.02 }] };
              const tr = solveMarkovTransient(m, 2e5, { maxTerms: 2000000 });
              const ss = solveMarkovModel(m);
              return { got: tr.ok ? tr.pFailed : NaN, want: ss.ok ? ss.pFailed : NaN, tol: 1e-9 };
          } },
    ];
    function runMarkovBenchmarks() {
        return BENCHMARKS.map(b => {
            try {
                const r = b.run();
                const err = Math.abs(r.got - r.want);
                return { id: b.id, name: b.name, cite: b.cite, got: r.got, want: r.want, err, tol: r.tol,
                         pass: r.skipped ? false : err <= r.tol, skipped: r.skipped || null };
            } catch (e) { return { id: b.id, name: b.name, cite: b.cite, pass: false, err: NaN, skipped: 'error: ' + e.message }; }
        });
    }

    // ---- the mission-time wire-in: effectiveProb ---------------------------
    // A VALID Markov-attached event quantifies TRANSIENT at its own exposure
    // time. An invalid model keeps the previous (steady) behavior — numbers
    // never change silently under an error; the panel names the errors.
    (function wrapEffectiveProb() {
        if (typeof window === 'undefined' || typeof window.effectiveProb !== 'function' || window.effectiveProb._ctmcWrapped) return;
        const orig = window.effectiveProb;
        const wrapped = function (node, exposureTime) {
            try {
                if (node && node.markovModelId && typeof getMarkovModel === 'function') {
                    const model = getMarkovModel(node.markovModelId);
                    if (model && validateMarkovModel(model).ok) {
                        let t = exposureTime;
                        try { if (typeof _nodeExposureTime === 'function') t = _nodeExposureTime(node, exposureTime); } catch (_) {}
                        if (!(isFinite(t) && t > 0)) t = (typeof ftaConfig === 'object' && ftaConfig && parseFloat(ftaConfig.exposureTime)) || 1;
                        const r = solveMarkovTransient(model, t);
                        if (r.ok) return r.pFailed;
                    }
                }
            } catch (_) {}
            return orig.apply(this, arguments);
        };
        wrapped._ctmcWrapped = true;
        window.effectiveProb = wrapped;
    })();

    // ---- panel receipts: wrap renderMarkovModels ---------------------------
    (function wrapRender() {
        if (typeof window === 'undefined' || typeof window.renderMarkovModels !== 'function' || window.renderMarkovModels._ctmcWrapped) return;
        const orig = window.renderMarkovModels;
        const wrapped = function () {
            const r = orig.apply(this, arguments);
            try {
                const container = document.getElementById('markov-models-container');
                const models = (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.markovModels) || [];
                if (!container || !models.length) return r;
                const T = (typeof ftaConfig === 'object' && ftaConfig && parseFloat(ftaConfig.exposureTime)) || 1;
                const bm = runMarkovBenchmarks();
                const rows = models.map(m => {
                    const v = validateMarkovModel(m);
                    if (!v.ok) return '<tr><td><b>' + esc(m.name) + '</b></td><td colspan="3" style="color:#B91C1C; font-size:11px;">REFUSED — ' + esc(v.errors.join(' · ')) + '</td></tr>';
                    const tr = solveMarkovTransient(m, T);
                    const ss = (typeof solveMarkovModel === 'function') ? solveMarkovModel(m) : { ok: false };
                    return '<tr><td><b>' + esc(m.name) + '</b>' + (v.warnings.length ? '<br><span style="font-size:10px; color:#9A6200;">' + esc(v.warnings.join(' · ')) + '</span>' : '') + '</td>' +
                        '<td class="u-mono">' + (tr.ok ? tr.pFailed.toExponential(4) : esc(tr.reason)) + '</td>' +
                        '<td class="u-mono">' + (ss.ok ? ss.pFailed.toExponential(4) : '—') + '</td>' +
                        '<td style="font-size:10px; color:var(--color-text-tertiary, var(--text-secondary));">' + (tr.ok ? esc(tr.receipt.method) + ' · Λ=' + tr.receipt.Lambda.toExponential(2) + ' · ' + tr.receipt.terms + ' terms · tol ' + tr.receipt.tol : '') + '</td></tr>';
                }).join('');
                const bmLine = bm.every(b => b.pass)
                    ? '✓ ' + bm.length + '/' + bm.length + ' cited benchmarks pass (' + bm.map(b => b.id).join(', ') + ')'
                    : '✗ BENCHMARK FAILING: ' + bm.filter(b => !b.pass).map(b => b.id + (b.skipped ? ' (' + b.skipped + ')' : '')).join(', ');
                const div = document.createElement('div');
                div.className = 'controls';
                div.style.cssText = 'border-left-color:#6D28D9; margin-top:10px;';
                div.innerHTML =
                    '<h5 style="margin:0 0 6px 0;">Mission-time answer — π(T) by uniformization <span class="u-mono" style="font-size:10px; font-weight:700; color:#6D28D9;">ARP4761A G.11 · transient CTMC</span></h5>' +
                    '<div style="font-size:11px; color:var(--text-secondary); margin-bottom:6px;">A Markov-attached event quantifies at P(failed at T = ' + T + ' FH), not at steady state — steady (t→∞) shown alongside for the long-run view. Invalid models are REFUSED by name and keep their previous behavior until fixed.</div>' +
                    '<table style="width:100%; font-size:0.85em;"><thead><tr><th class="u-text-left">Model</th><th>P(failed at T)</th><th>P(failed, steady)</th><th>Receipt</th></tr></thead><tbody>' + rows + '</tbody></table>' +
                    '<div class="u-mono" style="font-size:10px; margin-top:6px; color:' + (bm.every(b => b.pass) ? '#1D6E3E' : '#B91C1C') + ';">' + esc(bmLine) + '</div>';
                container.appendChild(div);
            } catch (_) {}
            return r;
        };
        wrapped._ctmcWrapped = true;
        window.renderMarkovModels = wrapped;
    })();

    // ------------------------------------------------------------ exports
    const API = { validateMarkovModel, solveMarkovTransient, runMarkovBenchmarks, BENCHMARKS };
    if (typeof window !== 'undefined') {
        window.MARKOV_CTMC = API;
        window.validateMarkovModel = validateMarkovModel;
        window.solveMarkovTransient = solveMarkovTransient;
        window.runMarkovBenchmarks = runMarkovBenchmarks;
    }
    if (typeof module !== 'undefined') module.exports = API;
})();

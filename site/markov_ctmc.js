// ============================================================================
// markov_ctmc.js — v1.1 — ARP-G3: full CTMC — transient solution, refusals,
// cited benchmarks — on top of the editor + steady-state lane that already
// ship (fta_quant_modules: solveMarkovModel, model CRUD, closed-form card;
// markov_ndf.js: the 3-state N/D/F discrete template).
//
// v1.1 (4 Aug 2026) — PHASED MISSIONS, ARP4761A App I §I.2.9 "Phased Mission
// Systems" (clause number + title only — SAE posture; the description below
// is our own). What that clause covers, in our words: a mission runs in
// distinct phases, the architecture answering a failure can differ between
// them, and failure rates can differ too because the environment does. The
// method is to solve each phase as its own transient problem and to start
// each phase from the state probabilities the previous phase ended with —
// integrating the same differential equations one segment at a time. Until
// now this lane did ONE (Q, t) solve for the whole mission: one
// configuration, one stress level, every phase of flight.
//
//   · solveMarkovPhased(model, opts) — the chain. Phase sequence comes from
//     the PROJECT PHASE TABLE (flightPhasesData, table order) — the same
//     single source the exposure engine reads — with contingency phases
//     EXCLUDED and named in the receipt (they hold r = 1 by the §4.1 ruling;
//     folding them into a mission chain would double-count them). Per-phase
//     overrides on the model: a failure-rate multiplier (the environmental
//     -stress case) and/or a different model (the reconfiguration case).
//   · Carry-over maps π across a phase boundary BY STATE NAME. Structural,
//     not numeric: the same pair of models always maps or always refuses,
//     independent of the rates, so a refusal can never appear only at some
//     numbers. Failed states carry into the next phase's failed set
//     automatically (§I.4.11.11: failed in a phase = failed for the whole
//     mission — absorbing across the boundary). Any OTHER unmapped state
//     REFUSES by name: probability mass that quietly vanishes understates
//     failure, and a wrong number wearing a green tick is the failure mode
//     this project keeps finding (INV-44's unlinked transfers, most recently).
//   · Cited benchmark — §I.4.11.11's two-equipment worked example, whose
//     closed form is exact: two units, both needed in phase 1, one needed in
//     phase 2, failure in phase 1 absorbing ⇒
//         P(fail) = 1 − e^{−2λT₁}·(2e^{−λT₂} − e^{−2λT₂}).
//     The example is the standard's; the algebra is mathematics, stated here
//     in original wording (clause number + title only, per the SAE posture).
//   · OPT-IN, per the module's own doctrine that numbers never change
//     silently: an event quantifies phased only when its model carries
//     phasePlan.enabled. Without it, every figure is byte-identical to v1.0,
//     and a phased solve that REFUSES falls back to the single-(Q,t) answer
//     with the refusal named in the panel.
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
        let pi0;
        if (opts.pi0 != null) {
            // v1.1 — an arbitrary initial DISTRIBUTION (what a phased chain
            // carries across a boundary). Refused, never repaired, when it is
            // not a distribution over exactly this model's states.
            if (!Array.isArray(opts.pi0) || opts.pi0.length !== n) return { ok: false, reason: 'initial distribution has ' + (Array.isArray(opts.pi0) ? opts.pi0.length : 'no') + ' entries for a ' + n + '-state model' };
            let tot = 0;
            for (const x of opts.pi0) {
                if (!isFinite(x) || x < 0) return { ok: false, reason: 'initial distribution holds a negative or non-finite entry (' + x + ')' };
                tot += x;
            }
            if (Math.abs(tot - 1) > 1e-9) return { ok: false, reason: 'initial distribution sums to ' + tot + ', not 1 — REFUSED rather than renormalized, because silently renormalizing hides lost probability mass' };
            pi0 = opts.pi0.slice();
        } else {
            let init = 0;
            const wanted = opts.initial != null ? opts.initial : model.initialState;
            if (wanted != null) {
                init = model.states.findIndex(s => s.name === wanted);
                if (init < 0) return { ok: false, reason: 'initial state "' + wanted + '" is not a state of this model' };
            }
            pi0 = Array(n).fill(0); pi0[init] = 1;
        }

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
                 receipt: { method: 'uniformization (mode-centered Poisson weights)', Lambda, t, terms: R - L + 1, kRange: [L, R], tol } };
    }

    // ========================================================================
    // v1.1 — PHASED MISSIONS (ARP4761A App I §I.2.9)
    // ========================================================================
    // The phase sequence is the PROJECT PHASE TABLE, in table order — the same
    // single source of truth the exposure engine reads (§4.1 unified three
    // disagreeing lists into it; a fourth would restart that disease).
    // Contingency phases (`special: true` — Go-around, Rejected Takeoff) are
    // EXCLUDED and named: they are held at r = 1 rather than sized to their
    // duration, so threading them into a mission chain would model them as a
    // guaranteed leg of every flight.
    // A phase row is { phase, duration, durationUnit, special?, … } — the NAME
    // field is `phase`, and durations are STRINGS in mixed units ('4'/'hours',
    // '15'/'mins'). This module therefore owns NO parsing and NO contingency
    // list of its own: it routes through `parseDurationToHours` and
    // `isSpecialPhase`, the same functions the exposure engine reads, so the
    // two surfaces cannot drift apart (HANDOFF §8 — one field, one vocabulary).
    // Absent helpers REFUSE rather than guess: a local unit table that fell out
    // of step would silently resize every mission.
    function _phaseTable() {
        // A tree's own mission profile drives its phase table where one is set
        // — the convention every FTA-side exposure read already follows.
        try { if (typeof _activeTreeMissionPhases === 'function') { const t = _activeTreeMissionPhases(); if (Array.isArray(t) && t.length) return t; } } catch (_) {}
        if (typeof flightPhasesData !== 'undefined' && Array.isArray(flightPhasesData)) return flightPhasesData;
        if (typeof window !== 'undefined' && Array.isArray(window.flightPhasesData)) return window.flightPhasesData;
        return [];
    }
    function phaseSequence() {
        const seq = [], excluded = [];
        if (typeof parseDurationToHours !== 'function' || typeof isSpecialPhase !== 'function') {
            return { seq, excluded, refuse: 'the shared phase helpers (parseDurationToHours / isSpecialPhase) are not loaded — REFUSED rather than parsing durations with a private unit table that could drift from the exposure engine' };
        }
        _phaseTable().forEach(p => {
            const nm = p && p.phase;
            if (!nm) return;
            if (isSpecialPhase(p)) { excluded.push(nm + ' (contingency — held at r = 1, never sized into the mission)'); return; }
            const h = parseDurationToHours(p.duration, p.durationUnit);
            if (!(h > 0)) { excluded.push(nm + ' (no positive duration)'); return; }
            seq.push({ name: nm, duration: h });
        });
        return { seq, excluded };
    }

    // A phase's failure-rate multiplier scales every transition EXCEPT repairs
    // (failed → non-failed). §I.2.9's stated cause is environmental STRESS,
    // which raises failure rates; restoration rate is a maintenance property,
    // not a stress one. Named in the receipt — an engineer who wants something
    // else authors a per-phase model, which the plan also supports.
    function _scaleModel(model, mult) {
        if (!(mult > 0) || mult === 1) return model;
        const failed = new Set((model.states || []).filter(s => s && s.isFailed).map(s => s.name));
        return Object.assign({}, model, {
            transitions: (model.transitions || []).map(t => {
                const isRepair = failed.has(String(t.from)) && !failed.has(String(t.to));
                return isRepair ? t : Object.assign({}, t, { rate: (parseFloat(t.rate) || 0) * mult });
            })
        });
    }

    // Carry π across a phase boundary BY STATE NAME. Structural: decided by the
    // two models' state names alone, never by the current numbers, so a given
    // pair always maps or always refuses.
    function mapDistribution(fromModel, toModel, pi) {
        const to = toModel.states.map(s => s.name);
        const toIdx = new Map(to.map((nm, i) => [nm, i]));
        const toFailed = toModel.states.map(s => !!s.isFailed);
        const firstFailed = toFailed.indexOf(true);
        const out = Array(to.length).fill(0);
        const notes = [];
        for (let i = 0; i < fromModel.states.length; i++) {
            const st = fromModel.states[i];
            const j = toIdx.get(st.name);
            if (j != null) { out[j] += pi[i]; continue; }
            if (st.isFailed) {
                // §I.4.11.11 — failed in a phase is failed for the whole mission.
                if (firstFailed < 0) return { ok: false, reason: 'phase carry-over: "' + st.name + '" is a failed state with no counterpart in the next phase, and the next phase declares NO failed state to absorb it' };
                out[firstFailed] += pi[i];
                notes.push('"' + st.name + '" → "' + to[firstFailed] + '" (failed carries forward, absorbing)');
                continue;
            }
            return { ok: false, reason: 'phase carry-over: state "' + st.name + '" has no counterpart in the next phase\'s model and is not a failed state — REFUSED rather than dropping its probability mass, which would understate failure. Give the next phase a state of the same name, or mark this one failed if that is what a reconfiguration means here.' };
        }
        return { ok: true, pi0: out, notes };
    }

    // solveMarkovPhased(model, opts)
    //   opts.plan     — { enabled, overrides: { '<phase name>': { mult, modelId | model } } }
    //                   (defaults to model.phasePlan)
    //   opts.phases   — explicit [{ name, duration }] instead of the phase table
    //                   (used by the cited benchmark; the product path uses the table)
    function solveMarkovPhased(model, opts) {
        opts = opts || {};
        const plan = opts.plan || (model && model.phasePlan) || {};
        const overrides = plan.overrides || {};
        const excluded = [];
        let seq;
        if (Array.isArray(opts.phases) && opts.phases.length) seq = opts.phases;
        else {
            const ps = phaseSequence();
            if (ps.refuse) return { ok: false, reason: ps.refuse, excluded };
            seq = ps.seq; excluded.push(...ps.excluded);
        }
        if (!seq.length) return { ok: false, reason: 'no flight phases with a positive duration to sequence (contingency phases are excluded by design) — the phase table drives the chain', excluded };

        const legs = [];
        let pi = null, prevModel = null, missionHours = 0;
        for (const ph of seq) {
            const ov = overrides[ph.name] || {};
            let m = model;
            if (ov.model) m = ov.model;
            else if (ov.modelId) {
                const alt = (typeof getMarkovModel === 'function') ? getMarkovModel(ov.modelId) : null;
                if (!alt) return { ok: false, reason: 'phase "' + ph.name + '" names a model that no longer exists (' + ov.modelId + ') — REFUSED rather than silently falling back to the base model', excluded };
                m = alt;
            }
            const v = validateMarkovModel(m);
            if (!v.ok) return { ok: false, reason: 'phase "' + ph.name + '": model refused — ' + v.errors[0], excluded };
            const mult = (parseFloat(ov.mult) > 0) ? parseFloat(ov.mult) : 1;
            const scaled = _scaleModel(m, mult);

            let pi0 = null, carryNotes = [];
            if (pi !== null) {
                const mapped = mapDistribution(prevModel, m, pi);
                if (!mapped.ok) return { ok: false, reason: 'entering phase "' + ph.name + '" — ' + mapped.reason, excluded };
                pi0 = mapped.pi0; carryNotes = mapped.notes;
            }
            const r = solveMarkovTransient(scaled, ph.duration, { tol: opts.tol, maxTerms: opts.maxTerms, pi0: pi0, initial: pi0 ? null : opts.initial });
            if (!r.ok) return { ok: false, reason: 'phase "' + ph.name + '": ' + r.reason, excluded };
            missionHours += ph.duration;
            legs.push({ phase: ph.name, hours: ph.duration, mult, model: m.name || '(base)',
                        reconfigured: m !== model, pFailedAtEnd: r.pFailed, carry: carryNotes, receipt: r.receipt });
            pi = r.pi; prevModel = m;
        }
        const last = legs[legs.length - 1];
        return { ok: true, pFailed: last.pFailedAtEnd, pi, legs, excluded, missionHours,
                 receipt: { method: 'phased mission — piecewise transient, initial condition carried across each boundary (App I §I.2.9)',
                            phases: legs.length, missionHours,
                            multipliers: 'failure-rate multipliers scale every transition except repairs (failed → non-failed)',
                            excluded } };
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
        // v1.1 — ARP4761A App I §I.4.11.11 "Phased Mission System". Two units:
        // both required in phase 1, one required in phase 2, and failure in
        // phase 1 is failure for the whole mission. The example is the
        // standard's; the algebra below is mathematics, in original wording.
        //   phase 1: p(both up, T₁) = e^{−2λT₁}
        //   phase 2 from that initial condition:
        //     p(fail) = 1 − e^{−2λT₁}·(2e^{−λT₂} − e^{−2λT₂})
        { id: 'phased-I.4.11.11', name: 'Phased mission, two equipment (App I §I.4.11.11): P = 1 − e^{−2λT₁}(2e^{−λT₂} − e^{−2λT₂})',
          cite: 'ARP4761A Appendix I §I.4.11.11 "Phased Mission System" — worked example; closed form is standard mathematics',
          run: function () {
              const lam = 2e-4, T1 = 1.2, T2 = 5.13;
              const ph1 = { name: 'Phase 1 — both required',
                            states: [{ name: 'Both up' }, { name: 'Failed', isFailed: true }],
                            transitions: [{ from: 'Both up', to: 'Failed', rate: 2 * lam }] };
              const ph2 = { name: 'Phase 2 — one sufficient',
                            states: [{ name: 'Both up' }, { name: 'One up' }, { name: 'Failed', isFailed: true }],
                            transitions: [{ from: 'Both up', to: 'One up', rate: 2 * lam }, { from: 'One up', to: 'Failed', rate: lam }] };
              const r = solveMarkovPhased(ph1, {
                  phases: [{ name: 'P1', duration: T1 }, { name: 'P2', duration: T2 }],
                  plan: { overrides: { P2: { model: ph2 } } }
              });
              return { got: r.ok ? r.pFailed : NaN,
                       want: 1 - Math.exp(-2 * lam * T1) * (2 * Math.exp(-lam * T2) - Math.exp(-2 * lam * T2)),
                       tol: 1e-12 };
          } },
        { id: 'phased-degenerate', name: 'one phase, no reconfiguration ⇒ the phased chain equals the plain transient',
          cite: 'internal cross-check — the chain must add nothing when there is nothing to chain',
          run: function () {
              const m = { states: [{ name: 'Up' }, { name: 'Down', isFailed: true }],
                          transitions: [{ from: 'Up', to: 'Down', rate: 3.1e-4 }, { from: 'Down', to: 'Up', rate: 0.08 }] };
              const one = solveMarkovPhased(m, { phases: [{ name: 'Only', duration: 6.33 }] });
              const flat = solveMarkovTransient(m, 6.33);
              return { got: one.ok ? one.pFailed : NaN, want: flat.ok ? flat.pFailed : NaN, tol: 1e-15 };
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
                    // v1.1 — OPT-IN phased mission (§I.2.9). Only a model that
                    // declares a plan quantifies phased; a refused chain falls
                    // through to the single-(Q,t) answer (named in the panel)
                    // so numbers never change silently under an error.
                    if (model && model.phasePlan && model.phasePlan.enabled && validateMarkovModel(model).ok) {
                        const ph = solveMarkovPhased(model);
                        if (ph.ok) return ph.pFailed;
                    }
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
            if (typeof SLLazy !== 'undefined' && SLLazy.skipped('markov-models-container')) return r;   // lazy_render.js: the original was deferred, so is this companion
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
                    // v1.1 — phased line, only for models that opted in (§I.2.9).
                    let phLine = '';
                    if (m.phasePlan && m.phasePlan.enabled) {
                        const ph = solveMarkovPhased(m);
                        phLine = ph.ok
                            ? '<br><span style="font-size:10px; color:#6D28D9;">phased (§I.2.9): <b class="u-mono">' + ph.pFailed.toExponential(4) + '</b> over ' + ph.legs.length + ' phases / ' + ph.missionHours.toFixed(2) + ' FH — ' +
                              esc(ph.legs.map(l => l.phase + ' ' + l.hours + 'h' + (l.mult !== 1 ? ' ×' + l.mult : '') + (l.reconfigured ? ' → ' + l.model : '')).join(' · ')) +
                              (ph.excluded.length ? '<br>excluded: ' + esc(ph.excluded.join(' · ')) : '') + '</span>'
                            : '<br><span style="font-size:10px; color:#B91C1C;">phased REFUSED — ' + esc(ph.reason) + ' (this model keeps its single-interval figure until fixed)</span>';
                    }
                    return '<tr><td><b>' + esc(m.name) + '</b>' + (v.warnings.length ? '<br><span style="font-size:10px; color:#9A6200;">' + esc(v.warnings.join(' · ')) + '</span>' : '') + phLine + '</td>' +
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
    const API = { validateMarkovModel, solveMarkovTransient, solveMarkovPhased, mapDistribution, phaseSequence, runMarkovBenchmarks, BENCHMARKS };
    if (typeof window !== 'undefined') {
        window.MARKOV_CTMC = API;
        window.validateMarkovModel = validateMarkovModel;
        window.solveMarkovTransient = solveMarkovTransient;
        window.solveMarkovPhased = solveMarkovPhased;
        window.runMarkovBenchmarks = runMarkovBenchmarks;
    }
    if (typeof module !== 'undefined') module.exports = API;
})();

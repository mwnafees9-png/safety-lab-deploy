# Fault Tree Math Audit — Safety Lab Aero v60.92

**Date:** 2026-07-02 · **Scope:** `safety_lab.js` (FTA quantification, top-down allocation, BDD engine, CCF/MGL, Markov, uncertainty) + `engine_modules.js` (BDD core)
**Method:** line-by-line code review; 33 independent Python recomputations against closed-form references; live in-browser round-trip tests against the deployed v60.92 engine (detached test trees — no project data touched); the app's own DO-330 benchmark suite.

## Verdict

The core math is sound. AND/OR apportionment, mission normalization, the BDD-exact engine, MGL splits, Markov steady-state, and the P↔λ conversions are all correct and close their round-trips exactly. The app's 22 built-in benchmarks pass live (11 categories). Three real defects found — one anti-conservative (F1), one budget-wasting inconsistency in the top-down path you asked about (F2), one that inflates uncertainty results on CCF trees (F3) — plus minor edge cases.

## What was verified correct

**Top-down allocation (the focus):**
- **Mission normalization** (`_computeTopAllocatorContext`): `r = t_exposure/t_mission`, `λ_op = headline/r`, distributed budget `P = 1−exp(−λ_op·t_exp) ≡ 1−exp(−headline·t_mission)`. Internally consistent, verified algebraically and live (demo project: headline 1e-9, t_exp 5, t_mission 5.083 → topP 5.083e-9 ✓). The Phase-36 fix (always deriving r from displayed t_exp/t_mission) prevents readout drift.
- **AND apportionment** `p_i = T^(w_i/Σw)`: product reconstructs to T exactly — verified for T ∈ {1e-9…0.1}, equal and weighted. Exact, no rare-event approximation.
- **OR apportionment** `p_i = 1−(1−T)^(w_i/Σw)`: reconstructs exactly. Exact.
- **VOTING k-of-N** `p = (T/C(N,k))^(1/k)`: closes to −0.04% at T=1e-6 (2-of-3), −0.5% at 3-of-4. Error is in the conservative direction (reconstruction slightly under target) and negligible at certification magnitudes. Only degrades at T≥1e-2 (−4…−10%), which is outside cert use.
- **XOR linear split**: closes to −0.0001% at T=1e-6. Fine.
- **P→λ conversion** at leaves uses per-event exposure (`_nodeExposureTime`) and `−ln(1−P)/t`; bottom-up reconstruction resolves the same t. Round-trip exact for unmaintained events (live: ratio 0.99999999999).
- **Shared-event handling**: `mcsAwareRebalance` bisection is monotone and converges (replicated in Python, converges <60 iters to 1e-4); the Birnbaum redistribution re-pins the target with a second bisection including an upward probe. The "preserve engineer's target at root, surface BDD-actual alongside" design is sound and cert-appropriate. Fallback `_propagateStrictestAcrossSharedEvents` is conservative-merge, correct.
- **External-source/prescribed redistribution**: AND-family `Π p_free = T/Π p_ext` and OR `Π(1−p_free) = (1−T)/Π(1−p_ext)` are the correct inverses.

**Bottom-up & engines:**
- Gate formulas standard and correct: AND/INHIBIT product, OR = 1−Π(1−p), VOTING/XOR via exact Poisson-binomial DP (no rare-event approx), voting default K=2 guard correct.
- **BDD** (`engine_modules.js`): textbook Bryant ROBDD — canonical unique-table reduction, Shannon-expansion apply with memoization, probability by cofactor recursion. Repeated `logicalId`s fold to one variable → exact under common-mode coupling. Verified against analytic (A∧B)∨(A∧C) live.
- **MGL/CCF splits** `q(1−β) / qβ(1−γ) / qβγ(1−δ) / qβγδ` sum to q exactly; BDD-exact matched the analytic CCF value to all displayed digits live (1.0081e-4).
- **Markov steady-state**: πQ=0 with normalization row, partial-pivot elimination — matches analytic 2-state λ/(λ+μ) and 3-state birth-death to 1e-10. (Steady-state is conservative vs transient for a mission starting from the up state.)
- **Repair models**: monitored λ/(λ+μ) and periodic λτ/2 are the standard mean-unavailability forms; λτ/2 is +1.7% conservative vs exact at λτ=0.05. Fine — but see F1.
- **Cutset guard** aborts rather than truncates (never silently under-reports), and P(top) comes from BDD, not cutsets — correct hierarchy. VOTING minimal cutsets as k-subsets: correct (larger sets are non-minimal). MCS sum correctly treated as an upper bound (benchmark B06).
- **Importance measures**: Birnbaum/FV/RAW/RRW/critical/DIM formulas standard.
- **Uncertainty σ = ln(EF)/1.645**: correct for EF at 90% CI — but see F3.
- PAND/SPARE ≈ AND static equivalent is conservative (P(ordered) ≤ P(AND)); FDEP handled by Monte Carlo — both correctly disclosed in the UI.

## Findings

### F1 — HIGH (anti-conservative): top-down allocation ignores repair models
`allocateTopDown` leaf branch (~line 17592) always inverts with the unmaintained formula `λ = −ln(1−P)/t`, but reconstruction (`effectiveProbFromLambda`) honors the repair model. **Live result:** a leaf allocated P=1e-5 with `continuous, μ=0.1` reconstructs to 2e-5 (2× over budget); with `periodic, τ=100` reconstructs to 1e-4 (**10× over budget**). In an allocation tree the gates display their targets, so the overshoot is invisible until someone builds a verification tree. Same issue for Markov-attached leaves (λ ignored entirely on reconstruction).
**Fix:** invert the actual model in the leaf branch — continuous: `λ = μ·P/(1−P)`; periodic: `λ = 2P/τ`; Markov-attached: flag as non-allocatable. Or block/badge repair-model leaves in allocation trees.

### F2 — MEDIUM (conservative, breaks round-trip): INHIBIT/PAND/SPARE linear fallback
In the default (no-external-constraint) path, only AND gets geometric apportionment; INHIBIT/PAND/SPARE fall to the linear `target·ratio` fallback (~line 17737), while bottom-up reconstructs them as a **product**. **Live result:** INHIBIT/PAND, T=1e-6, 2 children → each child gets 5e-7 → reconstructs to 2.5e-13, −100% vs target (budget under-used ×4e6; ×2.7e13 for 3 children). Doubly inconsistent: the external-constraint branch (~line 17645) *does* treat INHIBIT/PAND/SPARE as AND-family. Children get absurdly tight λ requirements that AutoReq will then emit.
**Fix:** move INHIBIT/PAND/SPARE into the AND `pow(target, ratio)` branch (matches their bottom-up product semantics; for PAND/SPARE it stays conservative vs the ordered probability).

### F3 — MEDIUM (inflates results on CCF trees): uncertainty sampler skips the β-split
`runUncertaintyAnalysis` (~line 19242) builds its probMap from `varOrder` alone, ignoring `varMeta` — so CCF group tier variables get the member's **full q** (instead of qβ(1−γ)…) and independent vars get q (instead of q(1−β)). **Live result:** 2-member AND, β=0.1, q=1e-3 → BDD-exact 1.0081e-4, uncertainty median 1.0005e-3 — **9.9× inflated**; the distribution doesn't even bracket the point estimate. Trees without CCF groups are unaffected (verified).
**Fix:** apply the `_probMapFor` tier factors to the sampled λ-derived q per variable.

### F4 — LOW: λ = Infinity edge on external-cap AND redistribute
When fixed (external/prescribed) AND-children already meet the target, `remaining` clamps to 1 → free children get childTarget=1 → leaf λ = −ln(0)/t = Infinity, which passes the `isNaN || < 0` guard (~line 17593) and can leak into display/AutoReq.
**Fix:** clamp childTarget to ≤0.9999 or add `isFinite` to the guard.

### F5 — LOW / notes
- `_computeBirnbaumPerVariable` uses p=0.9999 for the x=1 cofactor — ~0.01% bias in redistribution weights; harmless (final bisection re-pins the target).
- `c.weight || 1` coerces an explicit weight of 0 to 1 — a zero-weight child silently gets full share.
- `calcExposureFromFHA(fhaId)` ignores its argument (returns global exposure) — name is misleading; callers are fine.
- CCF tier-k BDD variables imply whole-group failure (tier-2 event fails ⇒ all members fail), a simplification vs full NUREG/CR-5485 MGL multiplicity combinatorics — conservative, acceptable, worth a note in the Math Validation page.
- Prescribed gates stop top-down recursion; their children retain stale allocations from prior runs (only bottom-up mode computes the divergence check). Consider greying out child budgets under a prescribed gate.

## Numerical evidence

| Check | Result |
|---|---|
| Independent Python recomputation (33 checks: AND/OR/VOTING/XOR round-trips, mission normalization, MGL sums, Markov 2/3-state, rebalance bisection) | 33/33 pass |
| App's built-in benchmark suite, live on v60.92 | 22/22 pass |
| Live round-trip AND / OR / XOR / VOTING (T=1e-6) | 0% / 0% / 0% / −0.04% |
| Live round-trip INHIBIT / PAND (T=1e-6, n=2) | −100% (F2) |
| Live repair-model round-trip continuous / periodic | ×2.0 / ×10 over budget (F1) |
| Live CCF uncertainty vs BDD-exact | ×9.9 inflated (F3) |

Verification script: `fta_verify.py` (alongside this report).

## Recommended priority

1. **F1** — the only anti-conservative defect; fix before anyone allocates against repairable/periodically-tested leaves.
2. **F2** — makes INHIBIT/PAND/SPARE allocation trees emit requirements millions of times tighter than needed.
3. **F3** — makes uncertainty output on CCF trees unusable (and it silently disagrees with the point estimate).
4. F4/F5 — cleanups.

Each fix is small and localized; all three majors have one-line-to-few-line remedies in `allocateTopDown` and `runUncertaintyAnalysis`. Adding three benchmarks to the DO-330 suite (repair-model round-trip, INHIBIT round-trip, CCF uncertainty-vs-exact) would lock them in permanently.

---

## Resolution — Phase 61 (implemented 2026-07-02, v61.00)

Design decision (Waqas): **top-down allocation is probability-only.** Allocation distributes probability budgets; λ is a verification-side, measured quantity. This resolves F1 structurally — the allocator no longer converts P→λ at all, so there is no clock or repair model to get wrong.

Implemented in `safety_lab.js` + `assurance_modules.js` (v61.00 / 1.5):

- **F1**: `allocateTopDown` and all rebalance paths (`mcsAwareRebalance`, `mcsAwareImportanceRedistribute`, `_propagateStrictestAcrossSharedEvents`) write probability only and delete any stale λ. `calcBottomUp` treats a leaf with no rate data as holding an authoritative stored probability (also fixes house events and latent-exposure display). Canvas shows P budgets on allocation trees. AutoReq `fta-event` requirements now carry `context.pAllocated` + `exposureBasisHours` and read the budget directly from `node.probability`; verification evidence compares the mirror node's *computed probability* (λ + repair/Markov model via `effectiveProb`) against the budget — model-agnostic boundary. Legacy λ-based requirements still verify via a fallback path until regenerated. Feasibility check converts achievable λ → achievable P over the event's exposure window and compares in probability space.
- **F2**: INHIBIT/PAND/SPARE use the AND product-inverse split (`target^(w/Σw)`) in the default path, matching their bottom-up product semantics and the external-constraint branch.
- **F3**: `runUncertaintyAnalysis` applies the `_probMapFor` MGL tier factors (q(1−β), qβ(1−γ), qβγ(1−δ), qβγδ) to sampled probabilities; leaves without λ contribute their stored budget.
- **Locking benchmarks** added to the DO-330 suite: B21 (INHIBIT allocation round-trip), B22 (probability-only allocation: no λ written, exact closure), B23 (CCF uncertainty median ≡ BDD-exact).

Verification (Node harness running the actual production files): AND/OR/VOTING/XOR/INHIBIT/PAND/SPARE round-trips all close (worst case VOTING −0.04%, conservative); weighted INHIBIT closes; repair-model leaf keeps its budget with no λ (was ×10 over); verification trees still honor repair models (λτ/2 unchanged); CCF uncertainty ratio = 1.000 vs BDD-exact for both β-only and β+γ MGL (was ×9.9); shared-event rebalance converges λ-free; **benchmark suite 25/25 PASS**.

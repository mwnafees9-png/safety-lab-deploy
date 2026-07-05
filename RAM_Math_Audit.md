# RAM Math & Standards Audit — ram_modules.js (Aero) + RAMS Lab engine
2026-07-02 · audited on request ("math pristine, grounded in standards") · all
findings RESOLVED in ram_modules.js v1.1 / rams-lab (smoke 71/71, harness green)

## Verified correct as built

- **τ bridge → CCMR**: task interval sets `node.repairModel='periodic'`,
  `node.tau=interval`; the monolith's engine computes periodic-test
  unavailability as q = min(1, λτ/2) — the standard average-unavailability
  model for periodically tested dormant failures. Bridge is sound end to end.
- **Dispatch reliability** = 1 − (technical delays >15 min + cancellations) /
  revenue departures — the industry TDR definition. Elicited lane only.
- **λ-weighted mean MTTR** = Σλᵢ·MTTRᵢ / Σλᵢ — MIL-HDBK-338B mean corrective
  maintenance time. Unlinked tasks fall back to equal weights (documented).
- **Structure evaluation (RAMS Lab engine)**: OR/AND exact under independence;
  k-of-n via exact Poisson-binomial dynamic programming (no approximation).
- **P↔λ conversions**: exact exponential forms (expm1/log1p, no 1−(1−x) loss).
- **Series availability** = ∏Aᵢ (independent, series). **Annual downtime** =
  λ·T_op·MTTR, valid first-order for λ·MTTR ≪ 1 (documented).

## Findings and resolutions

**F1 — Availability definition mislabeled (MIL-HDBK-338B §10).**
The Aero page computed "Ai" from MDT (active + logistics + admin). Inherent
availability is defined on ACTIVE repair time only: Ai = MTBF/(MTBF+MTTR);
including delays gives the operational estimate Ao = MTBF/(MTBF+MDT).
*Resolved:* both computed and labeled correctly (Ai and Ao columns); fleet
rollup uses Ai. Time-base assumption stated in code and UI: λ per FH, repair
in clock hours, 1 FH ≈ 1 operating hour (utilization 1).

**F2 — FRACAS verdict lacked statistical footing (MIL-HDBK-781A).**
A bare point-MTBF ≥ prediction was labeled "verified" — a lucky short window
could pass. *Resolved:* field records now carry (total hours T, failures r);
verdicts use the one-sided lower confidence bound at 60% (customary for
reliability demonstration): r=0 → T/(−ln(1−C)); r>0 → 2T/χ²(C; 2r+2).
χ² quantile via Wilson–Hilferty (exact closed form at k=2), normal quantile
via Beasley–Springer (|err| < 3e-4; WH error ~0.1% at k=4 — verified against
table values in tests). VERIFIED = LCB ≥ prediction; point < prediction =
FINDING; in between = INCONCLUSIVE (accumulate hours). Legacy point entries
render as "point ≥ prediction (no confidence bound)" — never "verified".

**F3 — SIL boundary misassignment (EN 50129 Table A.1).**
`silFromThr` used closed upper bounds (≤1e-8 → SIL 4). The standard's ranges
are closed below, open above: 1e-9 ≤ THR < 1e-8 → SIL 4, so THR = 1e-8 is
SIL 3. *Resolved:* strict `<` boundaries; THR below 1e-9 stays SIL 4 (no
process beyond SIL 4 — tighter targets are met by architecture). Sample
program corrected to match (HZ-002 → SIL 3, HZ-004 → SIL 2, HZ-005 → SIL 1).

**F4 — Risk matrix was a scoring heuristic, not a standard.**
`freqIdx + 1.4·sevIdx` produced a plausible-looking but ungrounded matrix.
*Resolved:* replaced with the explicit EN 50126-1 example calibration as a
6×4 data table (constitution rule: the standard is data). Comment records
that calibration is a project act under CSM-RA — projects replace the table,
never bend a formula. Sample hazard classifications corrected to the table.

**F5 — Parallel THR apportionment was dimensionally invalid.**
Splitting a RATE through an AND as rate^(w/Σw) yields /h² units — a product
of rates is not a rate. *Resolved:* engine documents the domain rule ('or'
valid for rates and probabilities — both add in series; 'and' probabilities
only); thr.js converts rate → probability over a stated exposure time T
(P = 1−e^(−λT)), splits in the probability domain, converts back
(λ = −ln(1−P)/T), and records T on the apportionment. Series ('or') splits
the rate directly — exact, first order.

**F6 — Invented default MTTR (RAMS Lab availability page).**
Items without a linked maintenance task were assigned 0.5 h. *Resolved:* no
invented repair times — unlinked items show '—' and are excluded from the
rollup, with the chip reading "link tasks".

## Test coverage added

- rams-lab smoke (71/71): SIL boundary discipline (1e-8→3, 9.9e-9→4,
  1e-7→2, 1e-5→0, 1e-12→4); EN 50126-1 matrix spot cells; χ² exact k=2 and
  WH k=4 vs table values; MTBF LCB zero-failure and r=1; parallel-split
  probability round trip.
- Aero harness (all green, 25/25 benchmarks): τ→CCMR sweep pickup; FRACAS
  three-verdict matrix (finding / point-above / statistically verified with
  LCB checked against χ²); dispatch arithmetic; Pro+ gate render; switchTab
  wrapped-not-replaced.

## Standing assumptions (stated, deliberate)

1. Exponential (constant-rate) failure model throughout — consistent with the
   platform; wear-out candidates are flagged (CCMR E.3.2.5 lane), not modeled.
2. Independence across items in series availability and structure evaluation;
   CCF is handled in the safety analyses, not the RAM rollups.
3. 1 FH ≈ 1 operating hour (utilization 1) in availability ratios; add a
   utilization factor when a program's data demands it.
4. 60% one-sided confidence for FRACAS demonstration verdicts (customary);
   constant `RAM_CONFIDENCE` — make it a program setting when contested.

## F5–F7 additions (analytics suite) — verification record

All expected values computed INDEPENDENTLY in python (math module only) and
asserted in the harness to 1e-9 (analytic) / 2e-3 (numeric integration):

- **Weibull MRR**: β=1.4127274819, η=620.56 h on the 5-failure fixture;
  suspension case (Johnson ranks) β=1.4364293045, η=813.36 h. Γ(1.5) vs
  known 0.8862269255 (Lanczos g=7). B10/B50/MTBF closed-form.
- **Crow-AMSAA**: β̂=0.5400658060, λ̂=0.157974, instantaneous MTBF=222.195 h,
  Cramér–von Mises C²=0.02496628 with unbiased β̄; large-sample 10% critical
  value 0.173 used and LABELED asymptotic (no fabricated small-N table).
- **Spares**: Poisson d=2.0, PL=95% → s=5, achieved 98.34%.
- **Demonstration**: r=0 at 90% → T = 2.302585×MTBF (the classic ×2.3 rule).
- **RBD**: series R = e^(−Σλt) exact; 2-parallel MTBF = 1.5/λ and 2oo3 =
  (5/6)/λ identities hit to <0.2% by Simpson ∫R dt; FTA→RBD dual verified
  structurally AND numerically (Q(dual) ≡ P(tree)); VOTING k-of-n-fail →
  (n−k+1)-of-n-survive dualization checked; DSL rejects malformed input.
- **Testability**: λ-weighted coverage 0.8 on the 8e-6/2e-6 fixture.
- **LORA**: demand 0.288/yr; level totals 5184/15720/41584 exact.

## Reference library consumed

- NASA/TP-2000-207428 "Reliability and Maintainability (RAM) Training"
  (Lalli/Malec/Packard) — extracted to outputs/nasa_ram_training.txt; suite
  cross-checked against its chapter catalog (prediction, derating,
  allocation, FRACAS, density functions, maintainability & availability
  design). Identified for the roadmap from it: tolerance/worst-case analysis,
  sneak circuit analysis, software reliability chapter material.
- ATA MSG-3 SHM WG Issue Paper 105 — task taxonomy folded into the MSG-3
  module verbatim in spirit: GVI/DET/SDI inspection sub-type definitions,
  S-SHM as a scheduled task type, the Q4 hidden+backup-failure wording, the
  safety/emergency-equipment no-redundancy ⇒ category 8 rule, and the
  "Category 5/8 GVI stays standalone, never absorbed into zonal" note.

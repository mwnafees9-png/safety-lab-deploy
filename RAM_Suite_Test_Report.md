# RAM Suite — Full-Scale Test Report

**Date:** 2026-07-03 · **Build under test:** live at safetylabaero.com/app (R-series v1.0, ram_modules v1.7) · **Method:** offline regression harness (Node, absorber DOM, real WebCrypto) + live browser verification against the K350 Kestrel showcase baseline.

## Verdict

The RAM suite passes the full campaign. One defect was found and fixed (MLE panel injection on the Weibull page — fix staged, needs one deploy). One documented approximation limit noted (Wilson–Hilferty chi-square, ~0.4% at 4 degrees of freedom, labeled in-app). No console errors, no cross-module state corruption, all math verified against independently computed references.

## 1 · Regression harness (offline, deterministic)

Every figure below was checked against fixtures computed independently in Python (bisection root-finding, numeric Hessians, exact-gamma chi-square quantiles) — never against the JavaScript being tested.

### R-series module tests — all PASS

| Test | What was proven |
|---|---|
| R1 Weibull MLE | β̂ = 1.7940379839, η̂ = 582.1189 on the 6-failure/2-suspension fixture (match to 1e-4); Fisher SEs and 90% log-normal CIs match to 2e-3; the fixture's β CI [1.015, 3.171] sits above 1 and the wear-out call fires correctly |
| R2 Monte Carlo | Cold standby, imperfect switch (p = 0.9), active parallel, and phased-mission runs all within 3.5σ of analytic solutions; bit-exact reproducibility on the same seed |
| R3/R5/R6 Frameworks | Telcordia-shape and FIDES-shape algebra exact; duty composition 2.09e-6 exact; Arrhenius AF 26.0338 (0.7 eV, 40→85 °C) to 1e-6; IPL 7.59375 exact; test-time compression verified |
| R4 LCC | Annuity factor 12.4622103425 (5%, 20 yr) to 1e-8; per-item cost decomposition (failures/yr, labor, material, downtime) exact; NPV identity holds |
| R7 Sneak | K350's dual-provider bleed resource mined as the reverse-flow candidate; every candidate carries pattern/why/clue; disposition round-trip |
| R8 SW reliability | Goel–Okumoto a = 13.0824, b = 3.5601e-3 (match to 1e-4); Jelinski–Moranda N̂ = 12.26; flat failure data correctly reports "growth not observable" instead of a number; low-confidence flag under n = 8 |
| R9 MSG-3 ext | SSI truth table (metallic/composite/safe-life) derives correct task sets; Z-MLGW triggers enhanced zonal; ledger push idempotent |
| R10 Settings | Default 0.6 confidence; override to 0.9 propagates; LCB provably drops when confidence rises (2394.7 → 1499.3 h) |

### Deep cross-method campaign — all PASS

| Test | What was proven |
|---|---|
| DEEP-1 Cross-method | 400-sample synthetic Weibull (β = 2, η = 1000): MLE and MRR both recover truth and agree with each other; MC vs exact BDD-based RBD engine on 2oo3 agree (0.97428 vs 0.9745558); hot standby (warmK = 1) reproduces active-parallel analytic; 3-unit cold standby matches e⁻ˣ(1+x+x²/2) |
| DEEP-2 Statistics | Chi-square quantiles vs exact-gamma references at 4 points; MTBF LCB at r = 3 and r = 0 exact; monotonicity in failures and confidence; Wilson interval sanity |
| DEEP-3 Edge cases | 13 degenerate inputs all refuse or degrade gracefully (single failure → null, k > n → R = 0, equal temps → AF = 1, empty FIDES → null, full MSG-3 category truth table, MC probability bounds under extreme λ) |
| DEEP-4 Integration | Golden thread resolves; K350 latents feed CCMR; annual-FH doubling exactly doubles inspections/yr in the PM optimizer; frameworks push lands in the same component library the trees read; MSG-3x tasks land in the same ledger ram_modules reads |
| DEEP-5 Determinism | Derivation sweep idempotent (run twice = same world); MC bit-exact across invocations; MLE is a pure function |

### Suite totals

Full harness (E-series, F-series, P-series, R-series, DEEP campaign): **zero failures**. Built-in benchmark suite: **25/25**. The K350 showcase loads as the baseline for every integration test, so the tests exercise the exact data a prospect sees.

## 2 · Live verification (browser, deployed build)

- **All 19 RAM pages render** with populated content and no thrown errors: Prediction, MTTR/MDT Ledger, RBD, Weibull, Growth, Allocation·Spares·Demo, Tolerance·Derating, MSG-3, MMEL/TLD, PM Optimizer, Testability, LORA, Monte Carlo, Frameworks, SW Reliability, Sneak, LCC, RAM Settings, MSG-3 Structures·Zonal·L/HIRF.
- **Live MC run** on a brake-accumulator standby case: R = 0.87907 vs analytic 0.8794695 — within tolerance, on the deployed engine.
- **Live derivation sweep**: 3 tasks derived from the K350 model with full provenance (CCMR latent dormancy on FC-FCS01, periodic test on FC-EPS01, NSWC-11 wear-out), idempotent on re-run.
- **Live sneak mining**: engine bleed air (dual provider) correctly flagged.
- **Live zonal derivation**: Z-NOSE, Z-MLGW, Z-NACL enhanced; Z-CWG standard — matching the wiring/combustible/density test.
- **Live settings flip**: FRACAS confidence 0.6 → 0.9 propagates through the hook.
- **Console**: no errors or warnings from any RAM module.

## 3 · Defect found and fixed

**rel_mle panel injection (R1).** The Weibull page's own nav wrapper calls its internal render reference, which a window-level function wrap cannot intercept — so the MLE panel never appeared in live navigation (harness passed because it calls the math directly; the live sweep caught it). Fix: rel_mle now also hooks `switchTab` (loading last puts it outermost in the wrapper chain, guaranteed to run after the internal render). Staged as rel_mle.js v1.1 — **needs one deploy**.

Lesson recorded: harness render-wrapping tests must assert against the nav path, not only the window reference. The live sweep exists precisely for this class of defect.

## 4 · Known approximation limits (by design, labeled in-app)

- Wilson–Hilferty chi-square: ~0.4% error at 4 DoF (exact closed form used at 2 DoF). Labeled "WH" wherever shown.
- Crow-AMSAA CvM critical value: asymptotic 0.173, labeled.
- Weibull MLE bounds: asymptotic (observed information, log-normal) — thin-data caution rendered next to every fit.
- MC phased missions: position-based component identity across phases; a component first touched mid-mission is charged only from that moment.

## 5 · Deploy

```
cd ~/Desktop/safety-lab-deploy && wrangler deploy
```

After deploy, the Weibull page shows the MLE panel beneath the regression table for any project with life-data sets.

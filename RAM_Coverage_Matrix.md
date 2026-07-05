# RAM Coverage Matrix — uploaded references vs Safety Lab Aero
2026-07-02 · sources: NASA/TP-2000-207428 (RAM Training, Lalli/Malec/Packard)
and ATA MSG-3 SHM WG Issue Paper 105. Status: ✅ covered · 🟡 partial · 📋 roadmap.

## NASA/TP-2000-207428 — chapter by chapter

| Ch | Topic | Status | Where |
|---|---|---|---|
| 1 | Risk management, safety & mission assurance roles | ✅ | SSPP method slots, tailoring register, cockpits (program-level risk posture) |
| 2 | Reliability mathematics, probability theorems, failure physics | ✅ | BDD-exact engine, P↔λ exact forms, Poisson-binomial k-oo-n |
| 3 | Exponential distribution, MTBF, Pc, reliability models (series/parallel) | ✅ | RBD module (incl. FTA auto-dual), prediction rollup, engine identities tested |
| 4 | Failure-rate data: sources, life/storage tests, variables | ✅ | Component library (217F + custom), source column in prediction rollup |
| 4 | **Derating & application factors** | ✅ NEW | Tolerance · Derating page — applied/rated vs guideline audit (typical values labeled as typical; program standard prevails) |
| 4 | Prediction from part data; rapid techniques (parts count) | ✅ | Reliability Prediction page (as-built λ rollup, per-system Σλ/MTBF, shares) |
| 4 | Allocation of failure rates | ✅ | Allocation page (series budget, feasibility weights) |
| 4 | Nonoperating/storage failure rates | 📋 | Roadmap — storage-mode λ multipliers on library entries |
| 4 | **FRACAS (reporting, analysis, corrective action, concurrence)** | ✅ NEW | FRACAS lane + statistical verdicts + corrective-action field with OPEN/CLOSED state; open findings without closed actions flagged |
| 4 | Case study (launch vehicle) | n/a | narrative |
| 5 | Normal distribution, one/two-limit problems | ✅ NEW | Tolerance page — exceedance probability via normal CDF (erf, accuracy stated) |
| 5 | **Tolerance accumulation / worst-case vs statistical** | ✅ NEW | Tolerance stacks: WC = Σ\|tol\|, RSS σ=√Σ(tol/3)², P(exceed), WC-violation verdict independent of probability |
| 6 | Testing for reliability: statistical confidence, time-terminated | ✅ | Demo planner T = m·χ²(C;2r+2)/2 |
| 6 | **Attribute test methods** | ✅ NEW | n = ln(1−C)/ln(R) zero-failure sample sizes on the demo planner |
| 6 | Test-to-failure / K-factors | 📋 | Roadmap — ties to Weibull module (data already fits) |
| 6 | Sneak circuit analysis (mentioned) | 📋 | Roadmap — candidate CCA-adjacent module |
| 7–9 | Software reliability / design / QA | 🟡 | Process-argument coverage via DAL Credit (DO-178C/254) page + E2 AI-fidelity discipline; quantitative SW-reliability models (Musa et al.) 📋 roadmap |
| 10 | Reliability management, organization | ✅ | SSPP, sign-off chains, baselines, review machinery |
| 11 | Designing for maintainability & system availability | ✅ | MTTR/MDT ledger (338B definitions), Ai/Ao, dispatch reliability, PM optimizer, testability coverage, LORA |

## ATA MSG-3 IP-105 (SHM) — item by item

| IP-105 element | Status | Where |
|---|---|---|
| SHM glossary definition; S-SHM as scheduled task type | ✅ | MSG-3 task types (S-SHM with the IP definition) |
| Scheduled maintenance content: scheduled + non-scheduled groups | ✅ | Scheduled = MSG-3→ledger; non-scheduled inflow = FRACAS lane + A-SHM guidance box |
| **MSI selection (2-3-1, four questions)** | ✅ NEW | msg3AddMsi runs the 4-question screen; any YES → MSI (basis badge on the card); all NO → auditable screened-out register |
| Structural items amenable to systems analysis; SWG coordination notes | ✅ | Selection prompts + SHM guidance box (SWG transfer/awareness notes) |
| Safety/emergency systems always included; no-redundancy ⇒ FEC 8 | ✅ | Selection question wording + Q4 tooltip carries the rule |
| Level-1 Q1–Q4 incl. exact Q4 hidden+backup wording | ✅ | Category derivation (never stored raw) |
| Level-2 task order; category 5/8 mandatory task-or-redesign | ✅ | Ordered picker; REDESIGN REQUIRED disposition |
| GVI / DET / SDI definitions | ✅ | Task types with the definitions as tooltips |
| Category 5/8 GVI stays standalone (not absorbed into zonal) | ✅ | Starred marker + note on qualifying tasks |
| A-SHM (automated, non-scheduled) distinction | ✅ | Guidance box: A-SHM reports flow through FRACAS/data analysis, not the scheduled logic |
| SHM classification: operation mode × technology type | 🟡 | Noted in guidance; structured fields 📋 when a structures module lands |
| Structures MSG-3 (SSI, damage tolerance, P16/D6, CPCP) | 📋 | Roadmap — structures analysis is its own MSG-3 section (with zonal & L/HIRF) |

## Net-new this pass (F8 + closers)

tol_derate_module.js (tolerance stacks + derating audit, python-verified:
σ=0.02357023, P(exceed)=1.1045e-5, WC-violation logic proven — including the
teaching case where WC violates while probability is 1e-5); MSI selection
questionnaire + screened-out register; FRACAS corrective-action loop with
open/closed states; attribute demonstration sample sizes (R=0.99@90% → n=230);
SHM guidance block. All harness-tested; suite fully green, 25/25 benchmarks.

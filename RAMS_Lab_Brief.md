# RAMS Lab — Vertical Brief (v1, 2026-07-02)

The rail instantiation of the Safety Lab platform. Naming decision: **RAMS Lab**
(not "Rail Lab") — RAMS (Reliability, Availability, Maintainability, Safety) is
the EN 50126 discipline title, the term rail buyers use in job titles and tender
documents, and it widens the surface beyond safety into availability and
maintainability analysis, where operators spend continuously rather than only
at authorization.

Note: an earlier Rail Lab mockup was created in a Claude.ai web chat and is not
recoverable from local sessions; the mockup accompanying this brief
(`rams_lab_mockup.html`) is a recreation in the current product identity.

## Standards spine

EN 50126 (RAMS process / lifecycle), EN 50129 (safety case for signalling —
the structure generalizes), EN 50128 / EN 50657 (software SIL), EN 50716
(successor merging 50128/50657), plus CSM-RA (EU 402/2013) — the common safety
method for risk evaluation: the rail analogue of the ARP process spine, with
explicit risk-acceptance principles (codes of practice / reference system /
explicit risk estimation).

Process mapping from the aerospace spine:

| Safety Lab Aero | RAMS Lab |
|---|---|
| AFHA / SFHA | System Definition + PHA, then SHA / IHA (system & interface hazard analyses) |
| FHA severity classes | Risk matrix per CSM-RA (frequency × severity, calibrated per project) |
| Probability budget (1E-9 etc.) | THR — Tolerable Hazard Rate apportionment |
| DAL allocation (DALgebra) | SIL allocation (SIL 0–4) — same algebra, different table |
| PASA/PSSA/SSA/ASA cockpits | Lifecycle phase gates (EN 50126 V-cycle phases 1–12) |
| Independence principles / CCA | Independence + CCF per 50129 Table E; common-cause in signalling |
| Assumptions register | Safety-Related Application Conditions (SRACs) — export is a first-class artifact |
| Completion checklists + hand-off | Phase reviews + Independent Safety Assessor (ISA) gates |
| Q-format reports | Safety Case per EN 50129 structure (quality mgmt / safety mgmt / technical safety report) |
| Golden thread | Hazard Log (the legally required living artifact — rail's system of record) |

## What carries over from the platform (~80%)

Deterministic core: BDD-exact FTA engine, FMEA/FMES machinery, probability
allocation (THR apportionment is the same top-down probability math, Phase 61),
Markov/CCF models, dual-lane discipline (computed lane checks elicited lane),
signed evidence chains (tamper-evident sign-offs, SHA-256 baselines,
fingerprint drift → reopened), cockpit pattern, tailoring register, method
slots, the full E2 AI-fidelity stack (closed-world context, claim checker,
provenance → assumptions, abstraction linter with a rail vocabulary), report
generation over live data, and the digital-paper identity.

New builds: hazard log as the central ledger (rail is hazard-log-centric the
way aero is FHA-centric), CSM-RA risk-acceptance workflow, SIL tables +
allocation rules, SRAC export/import between authorities and suppliers,
EN 50129 safety-case document structure, RAM side (availability/maintainability
targets, FRACAS-ish feedback) — the "RAM" in RAMS is greenfield and underserved.

## Engineering convention (locked)

Born modular: RAMS Lab is new files against the shared core, never additions to
the 36k-line monolith. The standards spine must be factored out of
safety_lab.js before or during the build (cheap now, brutal later).

## RAM analysis catalog (the "R", "A", "M" of RAMS Lab)

**Reliability Analysis**
- Reliability prediction — parts count + parts stress (MIL-HDBK-217F, FIDES,
  Telcordia SR-332, NSWC-11, NPRD/EPRD, vendor + field data). *Engine exists —
  the reliability library + πQ/πE stress machinery carries straight over.*
- Reliability allocation — top-down apportionment of MTBF/λ targets to
  subsystems. *Phase 61 allocation engine, reliability semantics.*
- Reliability block diagrams (RBD) — series/parallel/k-of-n mission models.
  *Dual of the FTA; BDD engine evaluates exactly; VOTING = k-of-n.*
- FMEA/FMECA with criticality ranking. *Exists; add criticality matrix.*
- Markov models for repairable/redundant architectures. *Exists.*
- Life-data / Weibull analysis — wear-out characterization, B10/B50 life;
  feeds the constant-rate-assumption check. *CCMR wear-out list is the seed.*
- Reliability growth — Crow-AMSAA / Duane tracking during test campaigns.
- FRACAS loop — field failure reporting feeding predictions back to reality
  (predicted-vs-field on every item, drift flags when field diverges).
- Derating / stress audit and reliability demonstration test planning
  (chi-square, fixed-duration test design).

**Availability Analysis**
- Inherent / achieved / operational availability (Ai, Aa, Ao) per item,
  subsystem, and service level.
- Steady-state availability modeling — Markov + RBD with repair rates.
- Service availability — MTBSAF (service-affecting failures), line-level
  models, fleet availability; Monte Carlo simulation for network effects.
- Downtime budget apportionment — the availability analogue of THR
  apportionment (top-down, same engine).
- Degraded-modes modeling — permitted fallback operation and its service
  impact (rail operators live in degraded modes).
- Spares optimization — Poisson-based sparing levels vs availability targets.
- Penalty exposure — tender availability regimes and liquidated-damages
  modeling against the achieved figures (money view of availability).

**Maintainability Analysis**
- MTTR estimation/prediction — task-time synthesis per MIL-HDBK-472
  procedures; MDT decomposition (active repair + logistics + admin delay).
- Maintainability allocation — MTTR budgets down the architecture.
- Maintenance task analysis — task steps, tools, skills, access, crew size.
- Testability / diagnostics coverage — fault detection %, fault isolation
  to n LRUs, BIT coverage (feeds latent-exposure intervals — the CCMR bridge).
- Level of repair analysis (LORA) — discard vs line vs shop economics.
- Preventive-maintenance derivation — RCM logic + interval optimization;
  *direct analogue of CCMR not-to-exceed intervals: the same bisection over
  the live model can optimize task intervals against availability + hazard
  targets simultaneously — that's a differentiator nobody in rail has.*
- Maintainability demonstration planning (MIL-STD-471-style sampling).

Two-lane discipline applies across all three: predictions are the computed
lane, field/demonstrated data is the elicited lane, and divergence is a
finding — the FRACAS loop is CoFFE for reliability.

## Market & channel

- Buyers: signalling suppliers (Alstom, Siemens Mobility, Hitachi Rail, Thales
  GTS→Hitachi, Wabtec, CAF, Stadler), rolling-stock OEMs, metro/mainline
  operators and infrastructure managers, and the consultancy layer.
- Channel analogue to DER firms: **ISAs** (independent safety assessors —
  Ricardo, SGS, TÜV, Ricardo Certification, Arup) and **AsBo/NoBo/DeBo**
  bodies under CSM-RA. Same motion as the Vertical Aerospace play: the
  assessor brings the tool to every program they assess.
- Rail is underserved by modern software (incumbent tooling: DOORS + Excel +
  Word safety cases; some CENELEC modules in Ansys medini / Isograph). Sticky,
  regulated, multi-decade programs.
- Tenders explicitly require RAMS deliverables — procurement pulls the category.

## Strategic position

RAMS Lab is vertical #2 of three (Aero → RAMS → FuSa), the concrete evidence
for the platform ceiling story (Tier 3, $500M–$1B+ path; Jama comp). Sequencing
ruling stands: aerospace first — paid conversions and the DER channel fund and
de-risk the rail build; launch RAMS Lab pulled by a design partner (an ISA firm
or a signalling supplier), not pushed.

Assets that carry into the pitch: 8 patent applications; live pilots (Electra
comped, Sarla Aviation, Anzen considering); DER consultancy using the platform
on the Vertical Aerospace program; production use on a Part 23 Class III
ultra-STOL certification program.

## Next actions (when activated)

1. Factor the standards spine (severity classes, targets, checklist defs,
   report templates) out of the monolith into a per-vertical config module.
2. Hazard Log ledger page + CSM-RA risk acceptance workflow (the demo).
3. SIL allocation module reusing DALgebra with EN 50128/50129 tables.
4. SRAC register (assumptions machinery, renamed semantics + export).
5. EN 50129 safety-case report family on the E1 generator.
6. One ISA design partner before any of the above ships.

# Safety Lab Aero vs ARP4761A / ARP4754B — Gap Analysis & Workflow Redesign

**Date:** 2026-07-02 · **Baseline:** Safety Lab v61.00
**Sources:** full-text analysis of SAE ARP4761A (692 pp, 2023) and SAE ARP4754B (172 pp, 2023); feature inventory of the deployed app.

> **Status note (2026-07-02, post-review with Waqas):** the analysis below stands, but several remedies were superseded by design decisions reached in review — the governing decisions now live at the top of `OPEN_ITEMS.md` (`ROADMAP_Process_Layer.md` was scrapped on 5 Sep 2026 — its phase list had gone stale enough to send someone to build things that already existed; its ten design decisions and its parked list were moved to the register first). Key supersessions: **(a)** CoFFE and hand-built MF&MS trees are now *optional method slots*; the primary implementation of the multi-system FC objective is a **MAC (minimum acceptable control) capability model + Interdependence table compiled to BDD** (MBSA per App N), with fidelity levels from L0 min-equipment Boolean rules to L2 scalar floors. **(b)** FMES is a *derived grouping*, not a maintained layer. **(c)** Independence Principles are a *deduped claim registry* that existing gate attributes/CMA rows/requirements attach to. **(d)** AI synthesizes readable trees and report narrative; the deterministic core proves tree equivalence (BDD) and owns every number. **(e)** The §3 cockpit pattern was refined into a dashboard of six cockpit cards with detail modals, plain-language statuses (In work / Ready to hand off / Handed off / Reopened), and a "Baseline & hand off" action. **(f)** Reports default to ARP4761A Appendix Q formats, generated from live data.

---

## 1. Where the app stands (honest coverage map)

### Strong — genuinely implements the standard
| Area | Standard ref | Status |
|---|---|---|
| AFHA/SFHA worksheets (FC ID, statement, phases, effects, severity, assumptions, comments) | 4761A App A/C, Tables A7/C5 | ✅ Matches the de facto record schema; FCIM covers loss/partial/malfunction taxonomy + crew awareness |
| FTA / DD-equivalent with BDD-exact quantification, cutsets, importance, Markov, DFT MC (PAND/ROF) | App G/H/I | ✅ Strong; math verified this week (25/25 benchmarks) |
| Top-down probability budgeting (now probability-only) + bottom-up verification mirrors | G.13, B.4.1, D.4.2 | ✅ Phase 61 made this cleanly conformant |
| DALgebra (Table P2 Options 1/2, floors, independence-gated reduction, CMA compromise reversion) | App P, 4754B §5.2 | ✅ Core arithmetic right |
| PRA / ZSA / CMA worksheets with zone/function exposure, threat catalog, linked gates | App K/L/M | ✅ Good working level |
| Requirements with V&V method/status/evidence, traceability matrix, golden thread | 4754B §5.4/5.5 | ✅ Structure present |
| Assumption lifecycle states, per-FC linkage | A.6/C.6, 4754B 5.4.2.4 | ✅ Better than most tools |
| Config baselines w/ SHA-256, review/approval sign-off chains, version history | 4754B §5.6 | ✅ |
| Exposure modes (continuous/active/latent/manual), phase tables, mission profiles, CMR-adjacent "not to exceed" thinking | G.11.1.3 | 🟡 Partial — see gaps A3/A6 |

### Partial — exists as a document, not an analysis
- **PASA / ASA** — report generators with boilerplate + a CoFFE *scaffold* table. The six-process spine is rendered as progress cards, but PASA and ASA have no working surface: no interdependence analysis, no MF&MS tree workflow, no completion gates. This is the center of your question and of the redesign in §3.
- **CoFFE** — scaffold only; no case enumeration, no "results in FC?" determination column, no reconciliation with SFHAs.
- **Resources view** — provide/consume mapping is a real head start on Common Resource Analysis (B.4.3.2), but there's no failure-mode × contributing-system matrix with per-cell effects, and no side-by-side comparison across FCs.
- **Independence** — CMA-linked gate claims + OOS module exist, but the standard's central object, the **Independence Principle** (identified in PASA/PSSA → questionnaire-evaluated → converted to requirement → verified in SSA/ASA), doesn't exist as an entity. Claims live scattered on gates.
- **FFS/DALgebra** — runs on quantitative trees. 4761A requires FFSs from trees where **development-error events are qualitative only** (never given numbers, 4.1.1.1). No way to add an unquantified error event today.

### Missing — no support
| # | Gap | Ref |
|---|---|---|
| M1 | Interdependence Analysis (system × aircraft-FC contribution table) | B.3 |
| M2 | Cascading Effects Analysis (CEA) — dependency-graph propagation to fixpoint | App O |
| M3 | FMES — grouping FMEA modes by identical effect+detection, summed rates, FC-reference column; FTA basic events should source from FMES | App J, §4.2 |
| M4 | CCMR/CMR derivation — significant-latent-failure sweep (>1 flight in Cat/Haz trees), wear-out list, not-to-exceed intervals → CCMR list linked to tree events | §5.1, E.3.2.4-6 |
| M5 | Completion checklists as gates: PASA B.5 (a–m), PSSA D.5 (a–j), SSA E.4, ASA F.4 | App B/D/E/F |
| M6 | ~~Combined FCs: related-function combinations, operational events (RTO, diversion), environmental events — as first-class FC variants~~ **CLOSED 2026-07-05** — `fc_variants.js`: combined-FC rows (`combinedOf`, staleness), operational/environmental tags, coupling-derived candidates via shared implementing systems, INV-29 (hard, severity dilution) + INV-30 (advisory) | A.3.1, A.8.3-5 |
| M7 | ~~Monitor/coverage modeling: monitor spec attributes (threshold, cycle time, scrub, coverage %, independence) + imperfect-coverage tree patterns~~ **CLOSED 2026-07-05** — `monitor_spec.js`: spec records on credit-taking events, Q_true split (G.11.1.3.4), independence verdicts feeding the IP ledger, AutoReq attribute emission, MBSA cockpit tile | D.4.3.1, G.11.1.3.4 |
| M8 | Failure-frequency methodology (G.12) alongside unavailability, with conversion — needed to integrate supplier trees | G.11/G.12 |
| M9 | Problem reports / OPRs as objects (CM ID, safety effect, deferral justification, interrelationships) feeding SSA/ASA | 4754B §4.7, E.2, F.3.5 |
| M10 | 4754B Appendix A objectives matrix as a live compliance checklist (25 objectives × FDAL, R*/R/A/N, SC1/SC2 per artifact) | 4754B App A |
| M11 | Validation as distinct from verification: 5.4.3 correctness checklist per requirement, 5.4.4 completeness per set, validation matrix | 4754B §5.4 |
| M12 | Modification impact analysis (New/Modified/Affected/Unmodified categories → Table 5 activity scoping) | 4754B §6.3 |
| M13 | MMEL/dispatch-risk calculation mode (distinct from fleet-average) + TLD | §6/§7 |
| M14 | Safety-significant events list export for in-service monitoring | §8 |
| M15 | ~~Assumption **routing** with owning-level confirmation loop~~ **CLOSED (verified 2026-07-05)** — routeTo/routeAt/routeBy live on all assumptions, A.6 + D.6.3 gates block on unrouted, free-text/imported routes preserved | C.6, D.4.3.2 |

---

## 2. Prioritized analytical gaps

**Tier 1 — blocks a credible "implements 4761A" claim (do these):**
A1. Independence Principles as first-class entities (feeds CMA, DALgebra, PASA, SSA — unlocks five features at once).
A2. PASA working surface: Interdependence table + MF&MS aircraft trees + budget allocation to systems (§3 below).
A3. CCMR/latent-failure sweep — the app already knows every latent event and its dormancy interval; this is a report + list away, and it's the single most DER-visible SSA output.
A4. Completion-checklist gates for all four assessments (M5) — cheap to build, transforms the workflow story.
A5. FMES layer between FMEA and FTA basic events (M3) — closes the rate-provenance chain the standard expects.

**Tier 2 — makes the tool defensible at audit:**
A6. At-risk vs exposure semantics per G.11.1.3 case rules (the app has the fields; it lacks the named cases and their defaults), plus monitor-coverage patterns (M7).
A7. Combined/operational-event FCs (M6) and crew-awareness FC pairing automation.
A8. Qualitative development-error events in trees → true FFS generation (decouples DALgebra from quantitative trees).
A9. Validation split from verification (M11) + 4754B Appendix A objectives matrix (M10).
A10. Problem reports/OPRs (M9) — also feeds your existing reviews/approvals system naturally.

**Tier 3 — differentiators:**
A11. CEA on a system-dependency graph (you already have Resources + Routing — the graph is half-built).
A12. Modification impact analysis wizard (M12).
A13. MMEL/TLD dispatch mode on the Markov engine (M13).
A14. Safety-significant events export (M14).

---

## 3. The redesign: PASA/PSSA/SSA/ASA as *cockpits*, not reports

**The core problem today:** the four assessments exist as report generators — you do work in a dozen scattered views, then a document is assembled. The standard treats each assessment as a *stateful process* with defined inputs, activities, a completion gate, and outputs that feed the next process. The intuitive fix is to make each one a **workspace with four panes: Inputs → Activities → Gate → Outputs**, where every pane is live data, not prose.

### 3.1 The shared pattern (one component, four instances)

```
┌────────────────────────────────────────────────────────────┐
│  PASA  ·  status: In work  ·  inputs current ✓/⚠            │
├──────────────┬──────────────────────────┬──────────────────┤
│ INPUT TRAY   │  ACTIVITY BOARD          │  COMPLETION GATE │
│ AFHA FCs 42✓ │  ▢ Interdependence  70%  │  B.5 checklist   │
│ Arch v3   ⚠  │  ▢ MF&MS trees      4/9  │  a ✓ b ✓ c ⚠ …   │
│ Assumptions  │  ▢ FDAL summary     ✓    │  9/13 satisfied  │
│  (3 open)    │  ▢ CoFFE            2/9  │                  │
│              │  ▢ Common Resource  ▢    │  [Baseline &     │
│              │  ▢ CCA round-trip   3 IP │   hand off ▸]    │
├──────────────┴──────────────────────────┴──────────────────┤
│ OUTPUTS LEDGER: budgets → 6 systems · FDALs → 14 fns · 12 reqs │
└────────────────────────────────────────────────────────────┘
```

- **Input tray**: live links to the upstream artifacts with staleness detection (you already have fingerprint/stale machinery in AutoReq — reuse it). If the AFHA gains an FC after PASA started, the tray shows ⚠ and the gate item "inputs current" un-ticks. This implements the standard's "any input change re-opens the assessment" rule mechanically.
- **Activity board**: each required activity is a card that deep-links into the actual working view, with computed progress (e.g., MF&MS: "4 of 9 multi-system FCs have trees").
- **Completion gate**: the literal B.5/D.5/E.4/F.4 checklist, each item auto-evaluated where possible (e.g., B.5.b "every AFHA FC allocated to PASA or an SFHA" is a query, not a judgment) and manually attestable where not — attestation ties into your existing sign-off chains.
- **Outputs ledger**: what this assessment has published downstream (budgets, FDALs, requirements, assumptions), each with its rationale link. "Baseline & hand off" captures a config baseline (existing feature) and marks the receiving assessments' input trays fresh.

This one pattern, instantiated four times, is the whole intuitiveness fix: an engineer opens "PASA" and sees *what goes in, what to do, how done it is, and what came out* — instead of guessing which of 20 sidebar views participates.

### 3.2 PASA specifics (the biggest build)
1. **Interdependence table** (new view, M1): rows = aircraft FCs, columns = systems; cell states: implements / contributes-by-malfunction / no-contribution. Auto-seed from existing function traces (sys function → AC sub-function) and FTA external-source links; engineer fills the rest. One FC row with ≥2 marked systems ⇒ auto-flags it "multi-system — needs MF&MS tree," which populates the activity board.
2. **MF&MS trees**: your existing aircraft-level FTA *is* this — just bind it: each multi-system FC gets a tree whose top gates decompose into per-system transfer stubs; the allocated probabilities at the system-boundary stubs *are* the published budgets, and they arrive in each system's PSSA input tray automatically (external-source links already do 80% of this).
3. **CoFFE**: upgrade the report scaffold to a working case table: pick an FC, enumerate system-state combinations (failed/degraded/operational) with a "results in FC?" yes/no per case; cases marked yes offer "seed FTA branch" and "create Independence Principle" actions. Reconciliation view against SFHAs once they exist.
4. **Common Resource Analysis**: generate the matrix from the existing Resources view (resource failure mode rows × consuming-system columns); the per-row aircraft-effect column links back to FCs. Comparison mode lays matrices for all FCs side by side.
5. **FDAL summary**: already computable — aggregate per function across FCs (highest wins), rendered with rationale per B.6.

### 3.3 PSSA specifics
Mostly re-binding existing pieces into the cockpit: input tray = PASA-allocated budget + FDAL + independence constraints + operational parameters (flight profile — add power-on time and check intervals as project config); activity board = FC→architecture mapping, per-FC FTA, latent sweep, monitor requirements, AutoReq run; gate = D.5. Two new items: **latent-failure worksheet** (D.4.2.1.1: every latent event, its FC, its detection means, its max interval — auto-harvested from trees) and **monitor requirement records** (M7 attributes) that AutoReq turns into requirements.

### 3.4 SSA specifics
The verification-mirror machinery you already built is the heart of SSA. Add: budget-vs-achieved **summary chart** (SFHA objective vs FTA result per FC, compliance yes/no, corrective-action column — G.13's data summary chart, one table); **significant-latent + wear-out lists** feeding the CCMR candidate list (A3/M4); problem-report pane (M9); gate = E.4 including "all safety-impacting PRs addressed," which is a query once PRs exist.

### 3.5 ASA specifics
ASA = triage + integration, not a re-analysis: pass 1 auto-classifies every AFHA FC as "closed by single-system SSA" (SSA result exists, budget met) vs "needs aircraft-level analysis" (multi-system per the Interdependence table); pass 2 is the MF&MS re-run with SSA-measured numbers instead of budgets — which your external-source links + verification mirrors nearly give you already. Gate = F.4; outputs include the safety-significant events export (M14).

### 3.6 Cross-cutting objects the cockpits need (build once)
- **Independence Principle ledger** (A1): entity = {source (gate/cutset/FFS/CoFFE case), claim type (failure vs error), mitigation, questionnaire disposition, requirement link, verification status}. Every existing CMA row, DALgebra independence claim, and OOS record becomes or links to one. Lifecycle: Identified → Evaluated (CMA/ZSA/PRA) → Requirement issued → Verified. The golden thread gets a new node type.
- **Assumption router** (M15): add `owningLevel` (aircraft / this-system / other-system:id) + routed-to + confirmation-evidence fields to existing assumptions; gates block on unrouted/unconfirmed assumptions.
- **Budget ledger**: single table of every published allocation (from PASA/PSSA) vs achieved value (from SSA mirrors) — powers the summary charts in SSA/ASA and the staleness flags in the trays.

### 3.7 Sequencing suggestion
1. Cockpit shell + completion gates (A4) wired to existing data — 4761A process view becomes clickable and honest. *Highest intuition-per-effort.*
2. Independence Principle ledger (A1) + latent/CCMR sweep (A3).
3. PASA Interdependence + MF&MS binding + budget ledger (A2).
4. FMES layer (A5), CoFFE working table, Common Resource matrix.
5. Tier 2 items; ASA triage view last (it needs everything else to exist).

---

## 4. One-line verdict
The quantitative core (FTA/BDD/Markov/DALgebra/budgets) is now standard-grade; what's missing is the **process layer** — the six assessments as live, gated workflows with the standard's connective tissue (Independence Principles, assumption routing, budget ledger, latent/CCMR sweep, FMES). The cockpit pattern in §3.1 delivers exactly the intuitiveness you asked about while closing the highest-value analytical gaps at the same time.


---

## Closure addendum — 2026-07-05

Shipped and live-verified on production this date (see DO-330 TVR v0.2 addendum for executed verification cases):

- **M6, M7, M15 closed** (rows struck above).
- **Bow-tie analysis** (beyond the original gap list): compiled FTA⇄ETA join per the unified framework — initiator sourced from BDD-exact P(top), cross-side common-cause via cut-set intersection registering defeated Independence Principles, allocation⇄verification two-lane knot, event-tree consequence render, auto-build from existing trees.
- **RM traceability round-trip**: FC push / relationship-graph pull (Jama live) and ReqIF exchange (DOORS / DOORS Next / Polarion / Codebeamer / Windchill), with provenance tiers (relationship / signed / candidate) on every barrier→requirement link.
- **SPP toolchain declarations**: the program plan now declares the analysis/RM/MBSE toolchain as signed live data; interfaces adapt to the declaration.

Remaining open from the original Tier lists: A6 at-risk/exposure named cases, A8 qualitative development-error events → FFS, M8 failure-frequency methodology, M9 OPRs, M13 MMEL/dispatch, M14 in-service export, M2/CEA graph propagation.

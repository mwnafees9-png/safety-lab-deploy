# Safety Lab Aero — Process Layer Roadmap
**Created:** 2026-07-02 · **Baseline:** v61.00 · **Companion:** `ARP4761A_4754B_Gap_Analysis.md`

## Governing design decisions

1. **Probability-only allocation** — allocation trees distribute P budgets; λ is verification-side. *(Shipped, v61.00.)*
2. **Artifacts are renderings** — the app maintains data relationships; standard-format documents (FMES, CoFFE tables, FDAL summaries, all six assessment reports) are generated on demand, never hand-maintained.
3. **Fixed objectives, pluggable methods, recorded tailoring** — completion gates check the standard's objectives; method choice (MAC vs manual CoFFE vs hybrid, FTA vs MBSA) is per-program config in a Safety Program Plan record; opt-outs carry signed rationale; severity drives depth defaults.
4. **MAC + Interdependence as the aircraft-level model (MBSA per App N)** — MAC floors are SDD inputs (assumptions until substantiated); threshold model compiles to BDD; trees/cut sets/CoFFE verdicts/budgets/FFSs are compiled outputs. Fidelity levels: L0 min-equipment Boolean rules → L1 degraded states/modifiers → L2 scalar floors, with machine-diffed upgrades. Unmodeled states default conservative.
5. **Two-lane discipline** — elicited evidence (human/AI-confirmed) and computed evidence never overwrite each other; the computed lane checks the elicited lane. Locked human verdicts form the model's regression suite (App N model verification).
6. **AI drafts, the core proves** — AI synthesizes readable tree hierarchies; the BDD engine proves Boolean equivalence against the compiled truth before acceptance. AI drafts report narrative on user templates around locked deterministic evidence regions; drafted prose is review-gated. AI never originates a number.
7. **Independence Principles as a deduped claim registry** — one record per unique member-set; gate attributes, CMA rows, and requirements attach to it; lifecycle Identified → Evaluated → Requirement → Verified; compromise cascades to all dependents.
8. **Cockpits, not report generators** — each of the six assessments (AFHA, PASA, SFHA, PSSA, SSA, ASA) is a stateful workspace: input tray (fingerprinted, staleness-flagged) → activity board (live-query progress) → completion checklist (standard's own criteria: A.9/C.9, B.5, D.5, E.4, F.4) → outputs ledger. Statuses: In work / Ready to hand off / Handed off / Reopened.
9. **Baseline & hand off** — gate-green–enabled action: SHA-256 baseline + versioned publish to downstream input trays + sign-off. Iterative, with visible deltas.
10. **Q-format reports** — default template family mirrors ARP4761A Appendix Q artifact formats (formats modeled, content original); contiguity guaranteed structurally because all reports render one database.

## Build phases

### Phase A — Dashboard shell *(shippable now, existing data only)*
- **A1** Six-cockpit dashboard: 3 lifecycle rows (AFHA→PASA / SFHA→PSSA / SSA→ASA) + CCA strip + 4 posture metrics + requirements V&V strip; replaces pie charts and analysis cards
- **A2** Cockpit detail modals (inputs + completion checklist | activities | outputs footer); unfinished features render as grey rows
- **A3** Status engine: In work / Ready to hand off / Handed off / Reopened, from checklist state + input fingerprints
- **A4** Completion checklists for all six assessments — auto-evaluated items as queries, attestations via existing sign-off chains
- **A5** Baseline & hand off action (baseline + publish + sign-off)

### Phase B — Deterministic engine wins *(small, high DER value; independent of A)*
- **B1** CCMR/latent sweep: harvest latent events from Cat/Haz trees, resolve FC + detection means, τ-bisection for not-to-exceed intervals, CCMR candidate + wear-out lists
- **B2** FMES derived grouping: categorical effects on FMEA, auto-group by (effect, detection), group-linked basic events with live summed λ, two lints (split-group link, mixed detection), generated FMES report
- **B3** Assumption routing: owningLevel / routed-to / confirmation evidence on existing assumptions; gates block on unrouted or unconfirmed

### Phase C — The claim registry
- **C1** Independence Principle ledger: auto-identify from min cut sets (order ≥2, Cat/Haz) + DALgebra reductions; dedupe by member-set; CCF contradiction check; disposition records (questionnaire + sign-off); compromise cascade; golden-thread node type

### Phase D — PASA working surface *(the differentiator)*
- **D1** Interdependence table: derived cells (traces, resources), cell states derived/asserted/proposed/cleared/unreviewed, AI sweep for empty cells only, multi-system → MAC flagging, single-system triage
- **D2** MAC model editor: L0 min-equipment chip builder → L1 degraded/modifier rows (mappings + multipliers) → L2 scalar floors; floors as SDD inputs w/ assumption fallback; conservative default banner
- **D3** Compiler: MAC + interdependence → BDD → breach combinations → generated FT pages, FFSs, budgets; single-point-failure findings; fidelity-upgrade diffs; regression suite of locked verdicts
- **D4** CoFFE as optional slot: deterministic case enumeration (FCIM states, superset pruning), dual-lane verdicts (computed vs elicited), locked-constraint registry
- **D5** MF&MS manual authoring as optional slot — cross-checked against constraints, not trusted
- **D6** AI tree synthesis + BDD equivalence verifier: AI drafts readable hierarchy from MAC/interdependence/CoFFE/SFHA; core proves equivalence to compiled truth, checks constraint containment + CCF contradictions; per-node provenance tags
- **D7** Malfunction/adverse-action residue: authored branches, tagged
- **D8** Method slots + tailoring in Safety Program Plan record

### Phase E — Reports
- **E1** ✅ Q-format template family for all six analyses (worksheet layouts, G.13 summary charts, M2 tables) — v65.00. Twelve deterministic builders over the Phase C/D stores (B1 interdependence, B3 CRA, MAC register, MF&MS status w/ equivalence verdicts, dual-lane CoFFE B2, principle ledger, CCMR + wear-out, FMES, live completion checklists, tailoring register, SPP methodology scalar); wired into all 18 default templates (v1 + v2), all 5 token whitelists, harness-proven.
- **E2** AI drafting fidelity layer — principle: AI is never a source of truth, only a source of drafts the deterministic core can check; everything it asserts is either verified or logged as an assumption. AI never fills a computed lane (verdicts, numbers, classifications stay elicited-or-computed).
  - **E2.1 Closed-world context contract** — per-section prompt scoping: only the section's model extract (same tokens the deterministic tables use) + a structured standard-clause reference library; instruction that every sentence traces to one or the other; truncation manifest when context must be cut (omissions shown, never silent).
  - **E2.2 Narrative-only drafting** — AI writes sentence skeletons with `{{token}}` references for every factual value (FC IDs, DALs, probabilities, system names); the engine resolves the facts. Schema-locked JSON responses (enums, referential-integrity check against the model before acceptance), as fta.restructure does.
  - **E2.3 Deterministic claim checker + tone lint** — post-draft pass parses every ID/number/severity/DAL/system name in returned prose and verifies each against the model; unmatched claim = inline hallucination flag. Compliance-asserting language flagged; advisory posture enforced.
  - **E2.4 Adversarial review pass (optional slot)** — second AI call whose only job is to list unsupported claims in the draft; findings land as open review items.
  - **E2.5 Provenance → assumptions machinery** — every AI act writes a provenance record (model, prompt hash, input fingerprint, extracted claims) routed into the existing assumptions register. Draft state machine: ai-drafted → reviewed → accepted; unaccepted prose watermarked "AI-assisted, unreviewed"; new completion-checklist item "all AI-drafted prose accepted" blocks hand-off. Fingerprint-scoped redrafting: input drift marks only affected sections stale; accepted prose never silently regenerated.
  - **E2.6 Function-extraction abstraction linter** — controlled verb vocabulary, verb-object form; implementation-noun rejection using the project's own systems/resources/component nouns ("control pitch" passes, "move elevator" fails); aircraft functions max two levels, every child traces to a parent, every function expressible as loss/malfunction/inadvertent FCs.
  - **E2.7 Golden-prompt regression suite** — fixture projects with expected extraction results, run on any model/prompt change; AI behavior gets the same regression protection as the math (25-benchmark culture).
- **E3** ✅ (v65.20 — "K350 Kestrel · Program Showcase", demo_showcase.js; SV-7/ES-9 chooser removed; MAC trees compiled + equivalence-proven by the live engine at load; full-program harness integration test added) Comprehensive showcase demo replacing SV-7 + ES9 — one sample project threading all six assessments and every new feature (cockpits, interdependence/CRA, MAC → compiled MF&MS, CoFFE dual-lane + grafts, principle ledger, CCMR, FMES, tailoring, SSPP intake, Q-format reports). Original content only; SAE formats modeled, never SAE text.

### Parked
Problem reports/OPRs · 4754B App A objectives matrix · validation-vs-verification split · CEA dependency graph · modification impact wizard (Tables 4/5) · MMEL/TLD dispatch mode · safety-significant events export

## Dependency notes
A, B, C are mutually independent. D1–D3 unlock D4–D6. E renders everything and lands last. Cockpit cards in A reference B/C/D features as grey rows until they exist — ship A first, fill in continuously.

# STANDARDS_MAP.md — the standards in Waqas's Downloads, mapped to Safety Lab Aero

**Date:** 23 Sep 2026 · **Repo baseline:** aa33d91 · **Written by:** Claude (Cowork session)

## 0. How to read this

- **Copyright rule.** SAE (ARP4761A, ARP4754B, J3307) and ASTM (F3230, F3061) are copyrighted. This file carries their clause numbers, their titles and one line per clause **in my own words**. It never quotes their text. J3307's front matter also forbids text and data mining and AI training without SAE permission. Nothing from J3307 may go into code, prompts, knowledge-base chunks or eval data; only clause numbers and titles appear here.
- **Who read what.** I read the following myself, cover to cover:
  - ARP4761A: main body and Appendices A–Q, including all of Appendix Q;
  - ARP4754B: main body and Appendices A, B and E;
  - ASTM F3230-21a and F3061/F3061M-22b;
  - SAE J3307.

  ARP4761A Appendices I and N were also mapped by a helper agent; I read both appendices after it did.

  **Helper agents read the rest:**
  - the EASA AI Concept Paper, Issue 02 and Proposed Issue 03;
  - the EASA AI Roadmap 2.0;
  - NIST AI RMF 1.0;
  - JARUS SORA v2.5 Annex E;
  - JARUS CS-UAS Annex B (MSO);
  - NASA-HDBK-8709.25;
  - the NASA HIDH;
  - EASA MOC-5 SC-VTOL.

  Section 4 marks every line that rests on an agent's reading. **Check those lines against the source before anything customer-facing relies on them.**
- **Implementation status.** "Implemented" means I found the module in `site/` and read its header. It does **not** mean I re-ran the module's tests today. The wall (326/0/0 at aa33d91) is the test evidence.
- **Full own-words notes, clause by clause, are in the session scratch.** Files: `notes_4761a.md` (377 lines), `notes_4754b.md` and `notes_astm_stpa.md`. I can commit them under `docs/standards_notes/` if you want them in the repo.

---

## 1. ARP4761A (Dec 2023): safety assessment process

### 1.1 Main body

| Clause | Title | What it asks, in brief | App status |
|---|---|---|---|
| 1 | Scope | Guidance, not mandatory. Used with ARP4754B, DO-178C, DO-254, DO-297 and the .1309/.2510 rules | — |
| 2.2 | Definitions | A failure condition includes flight phase, adverse conditions and external events. Development errors are not failures | Field definitions follow these |
| 3.1 | Safety assessment process overview | Six processes: AFHA, PASA, SFHA, PSSA, SSA, ASA. Iterative. Complete when the SSAs and the ASA show the objectives are met | Implemented: the six-process spine; PASA and ASA are full pages; `pssa_ssa_pages.js` |
| 3.2–3.7 | AFHA / PASA / SFHA / PSSA / SSA / ASA | What goes in and out of each process | See the appendices below |
| 3.8 | Depth of analysis | Rigor set by classification, with advisory-material flowcharts | Partial: the depth default is set by the certification basis |
| 3.9 | FDAL/IDAL assignment | Done in PASA/PSSA, per App P | Implemented: DALgebra, `ffs_module.js` |
| 3.10 | Human error | Crews assumed to follow procedures; human factors handled elsewhere | HF lane: `hf_*` |
| 4.1.1.1 | Development errors | Qualitative only. **Never** give them a number. Used to find FFS | Implemented: `ffs_module.js` (dev-error events forced to zero, FFS lane) |
| 4.1.1.2 | Average probability | Fleet average per flight hour, constant rates, average flight duration | Implemented: FTA engine |
| 4.2–4.6 | FMEA/FMES, CEA, ZSA, PRA, CMA | Summary of each method | See the appendices below |
| 5 / 5.1 | Safety-related maintenance; CCMR | Latent exposure drives probability. CCMRs limit exposure for Cat/Haz conditions | Implemented: CCMR harvest in `assurance_modules.js`; `msg3_module.js` |
| 6 | MMEL | Dispatch risk differs from average risk | Implemented: `mmel_module.js`, `mel_fha_crosscheck.js` |
| 7 | Time-limited dispatch | Fleet-average target with short- and long-time dispatch classes; Markov analysis | Partial: `mmel_module.js` covers TLD. **Verify** the short/long-time class maths against 7 |
| 8 | In-service | A list of safety-significant events for operators | Implemented: `sse_export.js` |

### 1.2 Appendices

| App | Title | Key content, own words | App status |
|---|---|---|---|
| A | AFHA | Functions stated as what, not how. Each FC is a loss or a malfunction, split crew aware / unaware. Classified per flight phase from the worst of aircraft, crew and occupant effects. Combined FCs only for related functions (A.3.1). Operational and environmental events become combined FCs kept alongside the original (A.8.3–A.8.5). Assumptions are routed and confirmed (A.6). Table A7 worksheet | Implemented: FHA worksheets, FCIM, `fcim_combined.js`, `fc_variants.js`, assumption routing |
| B | PASA | Interdependence analysis (B.3, Table B1); MF&MS trees (B.4.1); FDALs (B.4.2); CoFFE (B.4.3.1); common resources (B.4.3.2); Independence Principles (B.4.3.3); CEA and external events; completion list B.5 | Implemented: Interdependence plus `interdep_ai.js`; budget ledger; `independence_claims.js`; CoFFE case table. **Verify** that the CoFFE surface is now the working case table the July gap analysis asked for (`lane_trees.js`, `helpers_modules.js`) |
| C | SFHA | Same as App A at system level; two-way feed with the AFHA | Implemented |
| D | PSSA | Budgets and FDALs in; system and item requirements out; protective strategies; latent failures and check intervals (D.4.2); monitor requirements (D.4.3.1); completion list D.5 | Implemented: `monitor_spec.js`, latent sweep, PSSA page |
| E | SSA | Verify the implementation; latent and wear-out lists; problem reports addressed; completion checks | Implemented: verification mirrors, budget ledger, `problem_reports.js` |
| F | ASA | Triage each AFHA FC (single SSA vs aircraft-level); MF&MS re-run with achieved numbers; confirm assumptions, OPRs, procedures, FDALs, independence | Implemented: `asa_triage.js` |
| G | FTA | Worst-case vs average; ROF k/n!; latent formulas; exposure cases (G.11.1.3); the frequency method (G.12); allocation (G.13) | Implemented: engine, `exposure_case.js` (named cases), `fta_freq.js` (G.12) |
| H | DD | Series/parallel alternative to the FTA | Implemented via tree equivalence |
| I | Markov analysis | Open- and closed-loop models, CTMC | Implemented: `markov_ctmc.js`, `markov_ndf.js` |
| J | FMEA/FMES | Functional vs piece-part FMEA; FMES groups modes with the same effect, sums their rates and feeds the FTA | Implemented as a derived grouping (July decision b). **Verify** the FMES-to-basic-event rate provenance |
| K | ZSA | Zones, questionnaire, then checklist, inherent hazards (K.3.1), cross-zone checks, findings | Implemented: `zonal_model.js`, `zsa_walkthrough.js`, `equipment_hazards.js`, `phys_hazards.js` |
| L | PRA | Survivability, not probability. Top-down from Independence Principles and bottom-up by trajectory. Requirement cascade; verification matrix; assumptions with impact | Implemented: `pra_library.js`, `pra_canvas.js`, physical cross-check. Gap: see G3 |
| M | CMA | Table M1 questionnaire, becoming a checklist in SSA/ASA; independence requirements evaluated with evidence | Implemented: `cma_walkthrough.js`, `beta_scoring.js` |
| N | MBSA | Nominal and failure models; FFS and MCS from the model; iterations | Implemented: MAC/MBSA cockpit, `mac_*`, `mbsa_*` |
| O | CEA | Initiating events propagated to a fixpoint through dependencies | Implemented: `cea_graph.js` |
| P | FDAL/IDAL | Table P1 levels; Table P2 Options 1 and 2; FFS; Cases 1–4 | Implemented: DALgebra |
| Q | Contiguous S18 example | One aircraft, one wheel-brake system, carried through AFHA → ASA (Q.3–Q.17) | Used as the definition of "complete": `q_completeness.js` |

### 1.3 Appendix Q details that should shape the product (own words)

- **Q.9 (MBSA).** An "assumptions for confirmation" table goes to the design organisation. Unconfirmed assumptions invalidate the conclusions.
- **Q.10 (FMEA).** Functional FMEA first. A piece-part FMEA follows only when the conservative number misses the budget. Failure-effect codes. A lab test can settle an unknown effect.
- **Q.11 (CMA).** Each mitigation cites named evidence: the V&V summary, the HAS/SAS, the DO-160 report, the manufacturing plan, return-to-service tests, keyed connectors. There is also a list of signals that cross segregation zones, each with its justification.
- **Q.12–Q.13 (SSA).**
  - The top gates of the lower-level trees become undeveloped events in the higher tree, shown as an allocation-vs-result table.
  - That is valid only when the subtrees share no events.
  - Per-flight target = per-hour target × average flight time.
  - Each open problem report is assessed for safety impact.
- **Q.14 (ZSA).**
  - Query sheets record ID, issue, zonal consideration, proposed requirement and OPEN/closed status.
  - They also record who assessed, how (digital mockup or production aircraft) and when.
- **Q.15 (PRA).**
  - A requirement cascade records each requirement's origin (architecture, analysis, or derived from).
  - Each requirement carries its rationale and where it is allocated (system, installation, structure).
  - Assumptions are recorded with their impact on the analysis.
  - Interrelated requirements are flagged, so the cascade is re-examined whenever the design solution changes.
- **Q.17 (ASA).**
  - The inputs table records, for each input, how its correctness and completeness were checked.
  - A per-FC confirmation table gives the verification method and reference document.
  - The MF&MS tree comes with a gate list, an undeveloped-events table (with the source SSA for each event) and a cut-set report.

---

## 2. ARP4754B (Dec 2023): development assurance

| Clause | Title | Own words | App status |
|---|---|---|---|
| 3 / 3.1–3.3 | Development Assurance Planning | Seven planning elements (Table 1): transition criteria, deviations, authority coordination. 3.3 explicitly names AI as a possible regulatory gap | Implemented: SPP, `program_plan.js`, `toolchain_plan.js` |
| 4.1–4.5 | Development process | Top-down allocation from aircraft to system to item. Assumptions are part of the requirements package | Implemented: functions, allocation, items workspace |
| 4.6.1 | Information flow, system ↔ item | Lists of data passed each way: rates, exposure, constraints, derived requirements, coverage, latency | Partial: items workspace. **Verify** both lists are captured as fields |
| 4.6.4 | Aircraft/system integration and verification | A strategy to look for unintended behaviour, with a list of test stimuli | Gap G6 |
| 4.7 | Summary of DA outputs | Includes OPR fields: ID, safety effect, class, justification for deferral, limitations, links | Implemented: `problem_reports.js` |
| 5.1 | Safety assessment | Six processes; SPP topics (5.1.7); crew and maintenance tasks relied on (5.1.8); in-service (5.1.9) | Implemented |
| 5.2 | DAL assignment | General principles per severity. Table 2 (Cat A … NSE E). FFS. Only functional and item-development independence count toward DAL | Implemented: DALgebra |
| 5.3 | Requirements capture | Classes 5.3.1.1–5.3.1.11; safety requirements from the analyses; derived requirements evaluated upward (5.3.3); maintenance requirements go to the ICA (5.3.4) | Implemented: `req_taxonomy.js`, AutoReq |
| 5.4 | Requirements validation | Correctness (5.4.3) and completeness (5.4.4) checklists; methods (5.4.6); matrix and summary (5.4.7); assumption categories (5.4.2.4). Independence for A/B | Implemented: `vv_validation.js` v2.0 |
| 5.5 | Implementation verification | Methods; test-procedure and result fields (5.5.5.3); matrix and summary (5.5.6). Independence for all level-A requirements and level-B safety requirements | Implemented: requirement V&V; `do_credit.js` |
| 5.6 | Configuration management | Baselines, change control, archive; configuration index (5.6.3.1); SC1/SC2 (5.6.4) | Implemented: `config_management.js` (carries SC1/SC2), SHA-256 baselines |
| 5.7 | Process assurance | PA plan, reviews, data; issue/finding/action item (App E.7) | Partial. Gap G7 |
| 6 | Modifications | Impact analysis steps 1–3; change categories (Table 4); activities per category (Table 5); service history (6.4.1) | Implemented: `mod_impact.js` |
| App A | Process objectives (Table A1) | Objectives 1.1–7.2 with R*/R/A/N by FDAL and SC1/SC2 | Implemented: `objectives_matrix.js` (own-words objectives) |
| App B | Safety Program Plan example | Roles tables B1–B16; PRRT; volume teams; a common naming convention for FTA basic events (B.4.2.1); FHA manual | Implemented: SPP. Gap G8 (naming convention) |
| App E | Contiguous example (S18 WBS) | Requirement, validation and verification matrices; assumption registers with the origin as a prefix; configuration index; PR → ECN; PA audit | Mostly covered by the above |

---

## 3. ASTM small-aircraft standards and STPA

### 3.1 ASTM F3230-21a: Safety Assessment of Systems and Equipment in Small Aircraft

- **Contents:**
  - 1 Scope; 2 Referenced Documents; 3 Terminology (3.2.1–3.2.21, including "negligible", "simple", "conventional" and "single failure");
  - 4 Basic Information: 4.1 Failure Condition Classification (Table 2); 4.2 Classification-Based Analyses (Fig 1; Table 3 Assessment Level selection; 4.2.1–4.2.5); Table 4 (qualitative targets); Table 5 (quantitative targets by Assessment Level);
  - X1 revision history;
  - X2 qualitative analysis guidance: conventional, then simple, then likelihood, with the Model 100 brake example.
- **App status:**
  - Probability targets ("Part 23 I–IV" in `safety_targets.js`) match Table 5 for every class and severity. ✓
  - Primary DALs match F3061 Table 1. ✓
- **Gap G1 (class selection).** The new-project wizard offers Part 23 Class I–IV with AC 23.1309-1E wording (for example "single recip ≤6,000 lb"). F3230 Table 3 picks the Assessment Level from two inputs: aeroplane certification level 1–4, and propulsion (reciprocating/electric vs turbine, single vs multi).
  - For example, a Level 1 or Level 2 twin-piston lands on Assessment Level II.
  - Electric propulsion counts with reciprocating; hybrids and eVTOL are excluded.
  - The numbers are right; the way the class is chosen differs, so a user can pick the wrong row. Propose: ask for certification level and propulsion, and derive the class. Measure: the Table 3 grid as a regression.
- **Gap G2 (stale knowledge-base entry).** `cert_std_kb_data.js` chunk certstd-10 says F3230's internal sections are "not sourced in this tool". It also says the standard was "revised 2025", while your copy is 21a.
  - Now that the owned copy is read, the chunk can state clause numbers and titles (never text).
  - Checked 23 Sep: ASTM has published F3230-25; the FAA's accepted list (Part 23 MoC page; 90 FR 21392, 20 May 2025) names F3230-21a and F3061/F3061M-22b. The app follows 21a.
  - This is an AI-verbiage change, so it must be eval-gated (rule 29).
- **Not in the app yet:** the X2 qualitative argument template for simple and conventional systems (conventional, simple, likelihood, then CCA). Proposal P1.

### 3.2 ASTM F3061/F3061M-22b: Systems and Equipment in Aircraft

- **Your PDF is stamped superseded/withdrawn.** A newer revision exists. The app's comments cite 22b Table 1, so the current revision's Table 1 needs checking before we claim alignment.
- **Contents:**
  - 1–3 (terminology includes "continued safe flight and landing", "primary/secondary system" and "unsafe system operating condition");
  - 4 Basic Information:
    - 4.1 Function and Installation;
    - 4.2 System Safety Requirements (4.2.1 FC classification via F3230 or F3309; 4.2.2 targets; 4.2.3 exclusions for the engine, structure and landing gear, and brakes; 4.2.5 SW/AEH DAL per Table 1 with primary and secondary; 4.2.6 USOC);
  - 5–18 system chapters: electrical, environmental, flight controls, recorders, hazard mitigation (fire, shutoff, rotors), hydraulics (burst 2.5×, proof 1.5×), mechanical (gear, drop tests, brakes KE), lighting, oxygen, pneumatic, lightning, HIRF;
  - X1 revision history; X2 USOC identification and mitigation.
- **App status:** primary DALs match Table 1. ✓
- **Gap G4:** Table 1's **secondary-system** DALs (for example Level IV Catastrophic S=B) are not tabulated; the comment defers them to DALgebra. **Verify** that DALgebra produces the Table 1 S values for a Part 23 primary/secondary pair.
- **Gap G5:** there is no USOC workflow (X2). Grep found USOC only in the knowledge-base text. Proposal P2.

### 3.3 SAE J3307 (MAR2025): STPA Standard for All Industries

- **Clauses (numbers and titles only):**
  - 1 Scope; 2 References; 3 Definitions; 4 STPA Introduction; 5 STPA Implementation; 6 STPA Evaluation Prerequisites (6.1–6.5, including the STPA Implementation Plan);
  - 7 The Core STPA Steps:
    - 7.1 Define Purpose (1a–1c);
    - 7.2 Model Control Structure (2a–2f);
    - 7.3 Identify Unsafe Control Actions (3a–3b);
    - 7.4 Identify Loss Scenarios (4a–4c);
    - 7.5 Requirements Summary (Tables 1–2);
  - 8 STPA and Traceability; 9 Summary; 10 Notes;
  - Appendices A–E.
- **App status:** implemented. `stpa_core.js`, `stpa_panel.js` and `stpa_report.js` report 27 of 27 deliverables, with the UCA ↔ FTA/FMEA bridge.
- **Observations:**
  1. The standard's own Table 1 rows for 3a repeat the 4a text; the body clause 7.3.1.3 is the right definition. Check that our 27/27 uses the body definition.
  2. App D item (o) says a hazard tracking system should track STPA findings to closure. The STPA findings in our tool should appear in the same open-items/PR machinery as other findings. **Verify.**
  3. **Licence.** Our STPA knowledge base (`stpa_kb_data.js`) and any AI skill should be checked for wording lifted from J3307, because the standard prohibits AI use of its text.

---

## 4. Other sources (read by helper agents; confirm before relying on them)

| Source | What it is | Bearing on the product |
|---|---|---|
| EASA AI Concept Paper, Proposed Issue 03 (Jun 2026) | Proposed guidance for safety-related AI, Levels 0–3B; building blocks C.2–C.6 | **Applies to our own AI drafting** (see 5). For customers: AI constituents as items in FHA/PSSA; the Table 2 caps; the OOS (`oos_independence.js` already exists) |
| EASA AI Concept Paper, Issue 02 (Mar 2024) | The previous Level 1/2 ML guidance | Superseded in scope by Issue 03 |
| EASA AI Roadmap 2.0 (May 2023) | Strategy and timeline; Part-AI rules expected around 2026–2028 | Objective IDs may change. Track them |
| NIST AI RMF 1.0 | Voluntary framework: GOVERN, MAP, MEASURE, MANAGE | Mainly about our own AI: model and prompt provenance, golden eval suite, override logging, incident reporting, per-project AI off switch |
| JARUS SORA v2.5 Annex E | OSO integrity and assurance per SAIL | `sora_core.js` / `sora_annex_e_data.js` exist. **Verify** OSO #05 evidence-package output and the OSO #04 containment thresholds |
| JARUS CS-UAS Annex B (MSO) | Multiple simultaneous UA operations (swarms); a JARUS document, not EASA | A fleet-level FHA scope; inter-vehicle PRA/CMA. Not built. Low priority |
| NASA-HDBK-8709.25 (NASAHFACS v1.4) | Mishap human-factors taxonomy | Possible controlled vocabulary for human-error FMEA and STPA causal factors, used prospectively. Check licensing of the figures |
| NASA HIDH (SP-2010-3407 Rev 1) | Human integration design guidance (space) | Workload measures and task-analysis checklists for the HF lane |
| EASA MOC-5 SC-VTOL Issue 1 | **Public consultation draft** (Jul 2025), not final | Moves VTOL.2510 onto ARP4754B/4761A. The agent reports: FDAL with no architectural reduction except the App P additional-members rule; latent-failure MoC; air-data MoC template; **tool qualification (DO-330) for analysis tools that automate a process step.** **Verify** the SC-VTOL DAL rules in DALgebra; I did not find an explicit block |

---

## 5. What the AI sources imply for the product's own AI drafting

These rest on the agents' reading of EASA Issue 03, NIST AI RMF and MOC-5. They are proposals for your decision, not findings of non-compliance.

1. **We are probably in scope as a tool.** Issue 03 C.1 covers AI-based development and verification tools used by approved organisations. The expected route is a risk assessment (RA-01 to RA-11), then a TQL, then qualification via ED-215/DO-330. MOC-5 says the same about analysis tools that automate a process step.
2. **Limit on large off-the-shelf models:** AL5 / TQL5, contributing no worse than H4 (RU-03). The product needs:
   - pinned model and prompt versions;
   - an impact assessment of the chosen model;
   - a non-regression benchmark on every model update. The eval gate (rule 29) is most of this already.
3. **Stay at Level 1B:** the AI proposes and the engineer decides. No bulk-accept. Each item is reviewed individually. AI content stays labelled until accepted (EXP-05).
4. **Audit trail per draft:** model version, prompt version, inputs, raw output, the engineer's edits, the final text. *Corrected 23 Sep:* rows already carried the model (`aiModel`) and a versioned prompt stamp (`aiSkill`, id@vN#hash); what was missing was the input, the raw output, the original and the edit history. Built in `ai_audit.js` (G10).
5. **Mitigate over-reliance:** log how often reviewers override the AI; show confidence; answer "unknown" outside scope.
6. **No learning in operation.** Improvements go through frozen, eval-gated releases (already the practice).
7. **A per-project AI off switch** (NIST MANAGE 2.4). An AI-enabled flag exists (`slab_config.js`, `ai_assistant.js`), and the export-controlled fence blocks AI. Check that the flag is per project and not only per install.

---

## 6. Gaps and proposals

**Status, 23 Sep 2026:** G1, G2, G4, G8, G9 and G10 are done. G3, G5, G6, G7 are the feature builds still to do.

| # | Gap | Source | Size (my estimate) |
|---|---|---|---|
| G1 | Part 23 class chosen from AC 23.1309-1E wording instead of F3230 Table 3 (certification level × propulsion) | F3230 4.2, Table 3 | **Done 23 Sep.** `p23_assessment_level.js`; wizard and project settings ask certification level + propulsion; hybrid/eVTOL recorded as a level agreed with the authority. `regression_p23_assessment_level.test.js` |
| G2 | KB chunk certstd-10 says F3230 is unsourced, and cites a "2025" revision | F3230 | **Done 23 Sep.** Shipped on retrieval evidence (Waqas: no further AI spend): the golden FHA eval cannot see this lane (the FHA draft never reads the cert-standards KB); a run of the real retriever old vs new over 283 queries changed 22 top-6 lists, none of the realistic FTA/HF task prompts, and F3230 questions now pull the corrected entry first — confirmed on the live build. certstd-10/13 and the spine now say: FAA-accepted revision is 21a (90 FR 21392, 20 May 2025); F3230-25 exists but is not on the FAA list; clause numbers and titles held, text never. `regression_cert_std_kb.test.js` |
| G3 | PRA requirement cascade (origin, rationale, allocation, interrelation flag) and PRA assumptions with impact are not first-class | 4761A Q.15.2.7.2, L | Medium |
| G4 | F3061 Table 1 secondary-system DALs not checked end to end | F3061 4.2.5 | **Done 23 Sep — was a real defect.** The app mixed F3061's two allowed methods (Table 1 top, then ARP4754 reductions), so a backup could fall below both (e.g. DAL E behind a Level I Catastrophic; both methods require C). Now `f3061_dal.js`: Part 23 uses Table 1 (carrier = primary, others = secondary, never lower) by default, or ARP4754 end to end if the project chooses it. Changed DAL requirements surface in the AutoReq review as updates. `regression_f3061_dal.test.js` |
| G5 | No USOC workflow | F3061 4.2.6, X2 | Medium |
| G6 | No integration-level strategy for unintended behaviour (stimuli list, results in the verification summary) | 4754B 4.6.4 | Medium |
| G7 | No PA audit objects (issue / finding / action item, sampling) | 4754B 5.7, E.7 | Medium |
| G8 | Common naming convention for FTA basic events across groups | 4754B App B.4.2.1 | **Closed 23 Sep (covered).** Display IDs are unique project-wide unless the nodes share one logicalId (the same physical event), which the BDD counts once across every tree; `node_identity.js` declares ownership. Tests: `regression_node_identity*`. Soft spot noted: an imported supplier tree naming the same physical thing under a different ID is not flagged |
| G9 | ZSA query sheets lack assessor, method, date and OPEN/closed per finding. **Verify** against `phys_hazards.js`, which has status and method | 4761A Q.14.4.6 | **Done 23 Sep.** Verified real (phys_hazards records promoted hazards, not findings). `zsa_record.js`: every finding carries assessor, method, date, open/closed; closing needs the full record; INV-51 advisory. `regression_zsa_record.test.js` |
| G10 | Section 5 items for our own AI (audit trail, Level 1B, over-reliance, tool-qualification position) | Issue 03, NIST, MOC-5 | **Audit trail done 23 Sep.** Position (Waqas): the AI is ADVISORY ONLY — no certification credit is claimed for its output, so no tool qualification. `ai_audit.js`: every AI call logged (model, prompt version, input/output fingerprints, outcome; raw text for the last 30); every AI artifact keeps its original as drafted and each edit (who/what/from/to; sync-arrived edits unnamed); worksheet edits no longer strip AI provenance. `regression_ai_audit.test.js`. Finished same day: over-reliance measure (decisions counted per project at every review panel incl. Accept all / Dismiss all; override rate, bulk share, edited-after-accept, never-reviewed — shown in the AI provenance view) and a per-project AI off switch (AI Settings; enforced in Provider.complete and AiClient.messages, every backend). The v1.0 log shared a field with the cost log and was moved to its own (`aiDraftLog`) with migration |
| P1 | F3230 X2 qualitative argument template (conventional / simple / likelihood / CCA) | F3230 X2 | Medium |
| P2 | USOC workflow (see G5) | F3061 X2 | — |

Items still open from the July gap analysis, which I have not re-checked in depth:

- A6 at-risk cases: now `exposure_case.js`;
- A8 dev-error → FFS: now `ffs_module.js`;
- M8 frequency: now `fta_freq.js`;
- M9 OPRs: now `problem_reports.js`;
- M13 MMEL: now `mmel_module.js`;
- M14: now `sse_export.js`;
- M2 CEA: now `cea_graph.js`.

**All seven have modules now.** `ARP4761A_4754B_Gap_Analysis.md` still lists them as open, so its closure addendum is stale.

# HF MODEL IMPROVEMENT

**Tag:** `HF Model improvement`
**Date:** 2 Sep 2026
**Origin:** Mendonça, F.A.C. (2026), *Extending HFACS Beyond the Organizational Boundary: A State
Safety Governance and Oversight Analysis of the VoePass Flight 2283 Accident*, Collegiate Aviation
Review International 44(2), Art. 5 — read alongside the CENIPA final report on VoePass 2283
(ATR 72-500 PS-VPB, Vinhedo, 9 Aug 2024, 62 fatalities).
**Status:** SPEC ONLY. Nothing here is built. Nothing here is committed to a release.

---

## 0. The framing decision — read this before the specs

The paper adds a fifth HFACS level, **State Safety Governance and Oversight (SSGO)**, with five
categories: state safety governance; capability and resources; certification and regulatory control;
surveillance and risk management; safety intervention and resolution. Those five are, in substance,
ICAO's eight USOAP critical elements collapsed — legislation/regulation/state system, qualified
technical personnel and resources, certification and approval, surveillance, and resolution of
safety issues. **Verify the CE names against ICAO Annex 19 / Doc 9734 before citing them anywhere in
the product** — the ICAO USOAP page returned 403 on the research pass and the mapping below is not
yet source-verified.

**We are not building an SSGO level into the product.** HFACS and SSGO are *retrospective*
accident-classification instruments. Our product is *prospective* design-time assessment under
ARP4761A/ARP4754B. Shipping a "State" tab would be a category error and reviewers would say so.

What transfers is the paper's underlying argument, which is correct and which our tool currently
does not honour: **a safety argument that stops at the boundary of the analysed system is
incomplete, because the argument leans on behaviour outside that boundary.** VoePass is the worked
proof. The design assumed a serviceable airframe de-icing system, a crew that would respond to
severe icing, an operator that would log defects, and a regulator that would act on its own audit
findings. Every one of those assumptions was load-bearing, none was visible in any design safety
analysis, and all four failed together.

Five specs follow. HF-2 is the one to build first: it is engine-side, deterministic, provable by
exit code, and it closes the exact hole the accident fell through.

---

## HF-1 — Assumption custodian and validation state

**Type:** engine-side (deterministic). No AI. No eval gate required.
**Priority:** 2 (build after HF-2)

### Problem

`creditTask()` in `hf_analyses.js` promotes a crew task into an HF-typed assumption
(`ASM-AC-###`, metadata `{crewmember, responsePhase, taskTimeS, taskTimeBasis}`). The assumption
records *what* is assumed. It does not record **who must make it true**, or whether anyone has
confirmed they will. ARP4754B requires assumptions to be validated; today we let a user write an
assumption and never say by whom it is discharged.

### Evidence

CENIPA's 18 contributing factors split cleanly by custodian: crew (no icing response, pull-back at
stall warning, non-pertinent conversation in a critical phase), operator (defect reported verbally
and never logged, ten MEL items open, parts cannibalised, "informality predominated"), regulator
(ANAC audits found the non-conformities and never fed them into risk management). A design
assumption register with a custodian field makes each of those a visible, assignable open item at
design time instead of a finding after the fact.

### Design

Add to the assumption record two fields:

- `custodian` — closed vocabulary, one of:
  `design` · `flight-crew` · `operator` · `maintainer` · `regulator` · `installer`
  (Census the existing assumption store for field-name collisions before adding. Do **not** invent a
  vocabulary term that is not on this list without a standards citation for it.)
- `validation` — closed vocabulary: `unvalidated` · `evidenced` · `accepted-risk`, plus a free-text
  `validationBasis` that is **required and non-empty** whenever validation is not `unvalidated`.

`creditTask()` sets `custodian: 'flight-crew'` automatically — a promoted crew task is by definition
discharged by the crew. Every other path defaults to `unvalidated` with no custodian, so the gap is
visible rather than silently defaulted.

### UI

One column in the HF register and the assumption register: custodian chip + validation chip.
Filter by custodian. An "unvalidated assumptions by custodian" count on the R&M/HF Start-Here hub.
Do not add a new page.

### Invariants and tests

New suite `tests/regression_assumption_custodian.test.js`:

1. `creditTask()` sets `custodian === 'flight-crew'` and `validation === 'unvalidated'`.
2. An off-vocabulary custodian is refused at write, and does not create an empty row (this is the
   bug pattern that already bit the ergonomics lane).
3. `validation !== 'unvalidated'` with empty `validationBasis` is refused.
4. Round-trip: custodian and validation survive save → load → export.
5. Idempotency of `creditTask()` is preserved (existing behaviour must not regress).

Mutation-prove each by exit code with isolated fixtures: delete the vocabulary guard → test 2 must
go red; drop the basis requirement → test 3 must go red.

### Export

Extend the existing HF export cases in `data_ops_modules.js` to carry the two fields. Refuse-empty
behaviour unchanged.

### Eval join

The assumption store is already covered by the `hfa` lane in `eval_core.js`. Adding fields does not
add a lane. **But** if the AI is ever allowed to *populate* custodian, that becomes a graded
judgment and needs a lane metric — see HF-4.

### Standards hook

ARP4754B assumption-validation requirement. Cite the clause verbatim from the corpus; do not
paraphrase a clause number from memory.

### Effort

Small. One vocabulary, two fields, one suite, one export change, one hub counter.

---

## HF-2 — MEL ↔ FHA credited-mitigation cross-check

**Type:** engine-side (deterministic). No AI. **Build this first.**
**Priority:** 1

### Problem

An FHA row classifies a failure condition given the aircraft as analysed. If a mitigation credited
in that row is an item the MMEL permits to be dispatched inoperative, then **the dispatched
aircraft is not the aircraft we classified**, and the classification we published does not apply to
the flight that actually departs. Nothing in the product currently connects those two lanes.

### Evidence

VoePass 2283 departed with ten MEL items open, the airframe de-icing system among them, into an
area under an active SIGMET for severe icing between 12,000 and 21,000 ft. No safety analysis
anywhere said "if de-icing is relieved, this failure condition re-classifies." That sentence is the
product.

### Design

A cross-lane check in the deterministic engine, run as part of the existing invariant/quality
sweep:

```
for each FHA row R with a credited mitigation M:
    if M maps to an item the MMEL/MLAS lane marks as dispatch-relievable:
        emit finding: "R credits M; MMEL permits M inoperative under <relief ref>.
                       Classification <class> is not valid for the relieved configuration."
```

**Census first.** `site/mmel_module.js` exists but its store name, row shape and relief vocabulary
have not been censused. Read it before writing a line of this. Do not assume a field name.

The mapping from "credited mitigation" to "MMEL item" is the hard part and must not be guessed by
string matching. Options, in order of preference:

1. An explicit link field on the FHA row (user- or AI-proposed, human-confirmed).
2. A shared component/function id if both lanes already reference one.
3. Nothing. If neither exists, the check ships as *advisory only* — it lists MMEL-relievable items
   and asks the engineer to confirm which credited mitigations they touch. An advisory that names
   the question is worth more than a fuzzy match that answers it wrongly.

### Output

A finding in the existing findings/review surface, not a new page. Severity of the finding itself is
`Open` — the engine states the conflict; the engineer decides what it means. **The engine must not
re-classify the FHA row automatically.** Re-classification is engineering judgment.

### Invariants and tests

New suite `tests/regression_mel_fha_crosscheck.test.js`, executed against the real check (not a
reimplementation):

1. Credited mitigation linked to a relievable MMEL item → finding raised, with the relief reference
   in the text.
2. Credited mitigation linked to a non-relievable item → no finding.
3. No MMEL data present → check skips cleanly and says it skipped (never a silent pass).
4. Unlinked credited mitigations → advisory listing, not a false positive.
5. The check never mutates an FHA row.

Mutation-prove: invert the relievable test → 1 and 2 must go red; delete the skip notice → 3 red;
make the check write to the row → 5 red.

### Why this one first

It is the only spec here that needs no model, no golden, no paid run and no consistency campaign.
It is provable by exit code on the wall. It is also the most defensible thing in this document in
front of a certification audience, because it is a mechanical consequence of two documents the
applicant already owns.

### Effort

Medium — dominated by the MMEL census and the linking decision, not by the check itself.

---

## HF-3 — HFACS causal axis on the Human Error Analysis lane

**Type:** AI-adjacent (authored by default; AI-proposed only behind the gate in HF-4).
**Priority:** 3

### Problem

`ERROR_MODES` in `hf_analyses.js` is `['omission','commission','timing','sequence','selection']` —
a NUREG/CR-1278 error-mode taxonomy. It answers *what the human did wrong*. It does not answer
*why*, and certification reviewers and SMS auditors both ask why.

### Design

Add an **optional second axis** to each HEA row: an HFACS classification across the four classic
levels — unsafe acts, preconditions for unsafe acts, unsafe supervision, organizational influences.
Optional means optional: a row with an error mode and no HFACS code is complete and valid. This axis
never gates a row.

Two hard constraints:

- **Framing.** HFACS is retrospective. Used prospectively it is a *hazard-source prompt list*, not a
  causal claim. The UI must say so, once, on the panel — the same way the R&M hub teaches 217F. A
  tooltip claiming we have identified a cause would be wrong and a reviewer would catch it.
- **Do not ship the fifth (SSGO) level.** See §0.

### IP gate — blocking, do before any UI work

The Wiegmann–Shappell framework is published in public-domain FAA technical reports and the open
academic literature; the taxonomy is ordinary industry practice to use. Separately, hfacs.com
operates a commercial framework under copyright. Using the published four-level taxonomy is one
thing; shipping their detailed nanocode set, or branding a product feature "HFACS", is another.
**Get a written view on this before it appears in the UI.** If the answer is unclear, ship the axis
under a neutral name with a citation to the public FAA report and no nanocodes.

### Invariants and tests

- Optional means optional: a row without an HFACS code passes every validation.
- Off-vocabulary codes refused at write, no empty row created.
- The axis is orthogonal — setting it never alters the error mode, and vice versa.
- Export carries both axes.

### Eval join

If and only if the AI proposes these codes, the lane needs a metric. See HF-4. Authored-only
requires no eval change.

### Effort

Small if authored-only. Medium once AI-proposed, because of HF-4.

---

## HF-4 — Inter-coder agreement as a first-class eval metric

**Type:** measurement instrument.
**Priority:** 3 (paired with HF-3), but **the design work is free and should happen now**

### Problem

HFACS's best-documented weakness in the literature is inter-rater reliability: two trained analysts
routinely code the same event differently. Mendonça's own method is independent coding reconciled
*by consensus* — which manages the disagreement rather than measuring it. If we ship any
classification feature, we inherit that problem, and we are the only people in this market with an
instrument that can actually quantify it.

### Design

Add to `eval_core.js` an agreement metric family for categorical lanes, scored on **id-matched rows
only** — the ruler lesson from the severity work stands: comparing rows that are not the same row
produced the 0.474 figure we had to retract and correct to 0.947.

- `hfacsAgreement` — proportion of id-matched rows where both draws assign the same level, and the
  same category within that level. Report both, separately. Level agreement will be high; category
  agreement is the number that matters.
- Report **Cohen's kappa alongside raw agreement.** Raw agreement on a skewed taxonomy flatters
  itself; kappa corrects for chance and is what the HFACS literature reports, so it is the number a
  reviewer will ask for.
- `custodianAgreement` — same shape, if HF-1's custodian field is ever AI-populated.

Abstention is a valid code and must be counted as such, not as a disagreement. The E2 result stands
as product doctrine: the 60–70% severity abstention is load-bearing, not a defect — the model
declines exactly the rows its judgment is unstable on. Any HFACS drafter must inherit that
behaviour, and any candidate that "fills the column" faces the same pre-registered gate that
rejected fha.draft v3.

### Prerequisite — blocking

`hf.draftlane` and `hf.improve` are live feature ids in `_completeReproducible` but are **not
registered in `ai_skills.js` `_BODIES`/`_VERSIONS`**. Until they are registered, versioned, hashed
and stamped, no HF AI lane can carry a defensible consistency claim, and no metric computed on their
output means anything. **Register them before any of this is measured.** This is Phase 0 of the
consistency plan and it gates HF-3's AI mode and all of HF-4.

### Tests

Extend `tests/regression_eval_hooks.test.js`. Note the lane/skip count pins in that suite are
currently `FOURTEEN` and must be superseded in place with a dated comment, not edited silently.

Mutation-prove the metric itself: harmonise all disagreements → the metric must still fail its gate
if the flip rate moved; that is the shape that caught the E2 candidate.

### Effort

Small — the instrument already exists; this is one metric family in a codebase that has thirteen.

---

## HF-5 — VoePass 2283 as a worked-example project

**Type:** content/demo. No engine change.
**Priority:** 4 — but note Radia want the HF bits demoed Friday

### Problem

The HF lanes demo badly on synthetic data. Nine lanes of empty registers do not tell a story.

### Design

A seeded demo project built from the **public** CENIPA investigation, exercising every HF lane we
have in one coherent narrative:

| Lane | What the accident gives it |
|---|---|
| Task analysis | icing recognition, de-icing selection, stall recovery |
| Function allocation | crew vs. automation for ice protection |
| Human error analysis | omission (defect not logged), commission (pull-back at stall warning) |
| Crew alerting | stall warning; degraded-performance cues |
| Minimum flight crew (§25.1523) | workload under icing, factor-(10) incapacitation |
| Ergonomics | non-pertinent conversation, workload management |
| Assumption register (HF-1) | custodian split across crew / operator / maintainer / regulator |
| MEL cross-check (HF-2) | de-icing inoperative under MEL vs. credited in the icing FHA rows |

That last row is the demo. It is one screen, it is true, and it is the whole argument for the
product.

### Rules

- Public investigation material only, cited to CENIPA. No invented quotes, no invented findings.
- Report what the investigation reported. No editorialising about the operator, and no implication
  that our tool would have prevented the accident — say what it would have *made visible*, which is
  a claim we can defend.
- No competitor framing anywhere near it.
- 62 people died. The tone is an engineering case study, not marketing.

### Effort

Small-to-medium, mostly careful data entry. Depends on HF-1 and HF-2 for the last two rows.

---

## Sequencing

| # | Spec | Type | Gate | Order |
|---|---|---|---|---|
| HF-2 | MEL ↔ FHA cross-check | engine | wall green + mutations | **1st** |
| HF-1 | Assumption custodian | engine | wall green + mutations | 2nd |
| HF-4 | Agreement metric design | instrument | skill registry fixed first | 3rd (design now) |
| HF-3 | HFACS axis | authored → AI | IP view + HF-4 gate | 4th |
| HF-5 | VoePass worked example | content | HF-1 + HF-2 shipped | 5th |

**Blocking items, in order:**

1. Register `hf.draftlane` / `hf.improve` in the skill registry. Nothing AI-side in this document is
   defensible until that is done.
2. Census `mmel_module.js` before writing HF-2.
3. Get the HFACS IP view before HF-3 reaches the UI.
4. Verify the ICAO critical-element names against Annex 19 / Doc 9734 before any of the §0 mapping
   is repeated in product copy or a paper.

## Standing rules that apply to all of it

- A lane joins the eval family the day it is born.
- `./ship.sh` is the only deploy path and Waqas runs it.
- Live verification is runtime, on the served minified build. Pins are floors, never literals.
- Census the code before naming any store, field or vocabulary. Nothing in this document names a
  store that has not been read, and the three places where a census is still owed are marked.
- Every new check is mutation-proved by exit code with isolated fixtures.
- HANDOFF.md and eval/EXPORT_RUN.md get dated entries with declared misses.

## Sources

- Mendonça (2026), CARI 44(2) Art. 5 — https://ojs.library.okstate.edu/osu/index.php/CARI/article/view/10877
- CENIPA final report coverage — https://www.airnavradar.com/blog/voepass-flight-2283-final-report-reveals-chain-of-safety-failures-behind-fatal-crash
- CENIPA recommendations to ANAC — https://www.acidadeon.com/campinas/cotidiano/cenipa-recomenda-revisao-da-fiscalizacao-da-anac-apos-acidente-da-voepass/
- Accident summary — https://en.wikipedia.org/wiki/Voepass_Flight_2283
- HFACS framework — https://www.hfacs.com/hfacs-framework.html

**Note on the source paper:** the publisher blocked direct retrieval of the PDF, so this spec is
built on the abstract, keywords, framework structure and methodology statement from the article
landing page, plus the CENIPA reporting. The sub-category tables and any reliability statistics in
the paper have not been read. Read the PDF before citing the paper's numbers anywhere.

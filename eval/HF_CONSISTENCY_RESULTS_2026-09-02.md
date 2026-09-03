# HF lane consistency campaign — results (2–3 Sep 2026, Aeolus HL-1 on scratch project D1)

Protocol: per lane, clear → fresh draft (`SafetyLabAI.evalFresh = true`, replay cache bypassed) → Accept all → deep-copy the accepted rows to a stash (`localStorage['slab.campaign.v1']` in the campaign tab; raw rows retained there). Three draws per lane. Scoring per Waqas's ruling (2 Sep): **agreement over committed rows + where the abstentions land; blank rate is not the metric.** Identity of "the same row" across independent draws is a normalized name (free-named lanes) or the fixed key (alloc / mfc). κ = Cohen's kappa over rows both draws committed; Jaccard = overlap of row identities between two draws.

Builds: ai_assistant 76.30, hf_analyses 1.13 (the vocabulary fix 1.14 / 76.31 was built during the campaign and is NOT in these numbers).

## The numbers

| Lane | Rows per draw | Identity overlap (Jaccard, pairwise) | Classification agreement on matched rows | Second field | Notes |
|---|---|---|---|---|---|
| TID (task inventory) | 40 / 61 / 51 | 0.40 · 0.26 · 0.38 | **opsMode κ 1.00 / 1.00 / 1.00** (29 / 19 / 31 matched) | crew κ 0.94 / 0.91 / 0.78 | Ground 32/32/30 — Normal 8/29/21; **zero Non-normal / Emergency rows in any draw** although the HF document's Appendix B lists them |
| Task analysis | 55 / 35 / 37 | 0.20 · 0.20 · ~0.2 | crewmember agreement 1.00 where both committed (4 / 6 / 10 matched) | phase κ 0.84 / 0.84 / 1.00 | draw 1: 43 of 55 crewmember BLANK (78 %); draws 2–3: 0 % blank; draw 3 carries the free-text drift "PF (left seat)" |
| HEA (human error) | 14 / 14 / 12 | 1.00 · 0 · 0 | errorMode κ 1.00 on the 1–2 pair | — | **draws 1 and 2 are byte-identical → a replay-cache hit, drawn before `evalFresh` shipped; count them as ONE draw.** Against draw 3: zero name overlap, but the errorMode distribution is stable — selection 3 / commission 5→3 / omission 4 / timing 2 |
| Alerts | 20 / 17 / (no output) | 0.19 | **priority: BLANK on 100 % / 88 % of rows** — nothing to score | modality agreement 1.00 (6 matched) | draw 3: the model call went out, no rows came back (see finding F4) |
| Ergonomics | 13 / (lost) / 10 | 0 | no categorical field | — | draw 2 lost to the cloud-conflict dialog closing the panel; item+clause identities share nothing across draws |
| Crew-design considerations | 26 / 22 / 28 | — | kind κ 0.76 / 1.00 / 0.50 (6 / 5 / 5 matched) | consideration κ 0.54 / 0.67 / 1.00 | few matched rows: enumeration differs draw to draw |
| Situation awareness | 13 / 15 / 14 | **0 · 0 · 0** | nothing matched to score | — | level distribution L1 5/7/3 — L2 7/7/10 — L3 1/1/1: the model names the elements differently every time |
| Function allocation (24 fixed subsystems) | 23 / (no rows) / 23 filled | 1.0 by construction | **allocation κ 0.90, agreement 0.96 on 23** | — | one flip: SF-022 automation→shared; shared 16/17 · automation 3/2 · crew 4/4 · one subsystem left blank both times. First three draws were INVALID (driver's clear was a no-op on this lane's id field) and were discarded; re-drawn clean |
| Minimum flight crew (5 fixed keys) | 5 / 5 / 5 | 1.0 by construction | role κ 1.00 on the 2–3 pair (PF / PM / PM / PM) | — | draw 1 wrote free text ("Pilot Flying", "Pilot Monitoring", "Pilot Flying / Pilot Monitoring" for nav); `cmd` abstained in all three draws; nav = the one genuinely unstable call (Both / PM / abstain) |

Draw timing: 13 s (mfc) to 120 s (hea, alerts). Zero auth halts. Two draws lost to the cloud-conflict dialog (alerts#3 → actually no-output, ergo#2), one to the alloc driver defect, three alloc draws discarded as non-independent.

## What the numbers say

**Classification holds; enumeration wobbles.** Every field that is a closed judgement over a row both draws produced agrees at κ ≥ 0.84 (opsMode 1.00, alloc 0.90, phase 0.84–1.00, errorMode 1.00, modality 1.00, mfc role 1.00 once the vocabulary was respected). The same shape as the FHA campaign. Where the lane is *free-named* (which tasks, which SA elements, which ergonomics findings) the draws are drawn from different parts of the same document — overlap 0.2–0.4 for TID/Task/HEA, zero for SA and Ergo. The variance in row COUNT is entirely in the free-recall mode (TID Normal 8/29/21 vs Ground 32/32/30).

**Vocabulary that is listed but not defined is where agreement leaks.** TID opsMode (four defined-by-name modes) κ 1.00 on every pair; TID crew (five terms, never defined) 0.78–0.94. Task crewmember and mfc role were free text — "PF (left seat)", "Pilot Flying / Pilot Monitoring" — and those are not disagreements, they are the absence of a vocabulary. Built during the campaign as hf_analyses 1.14 / ai_assistant 76.31 (definitions from one map, downselects, dynamic project phases); the expected effect is crew κ → ~1.0 and mfc role scored, to be verified on the next draws after deploy.

**Silent drops hide information.** Alerts priority is blank on 100 %/88 % of rows. The lane's vocabulary is Warning | Caution | Advisory, accept is drop-never-coerce, and nothing reports a drop — so from the stored rows it is impossible to tell whether the model abstained on priority or wrote "warning" and lost it. Same for Task draw 1's 78 % blank crewmember.

**Abstention on a whole lane leaves no record.** When the drafter returns zero usable rows it shows a toast ("Nothing drafted — the documents may not describe this lane") and never opens the review gate. That is what "timeout/no panel" was in the driver: alerts#3 and alloc#2 were whole-lane abstentions, not failures — and the product keeps no trace of them.

## Findings → enhancements (proposed, in priority order)

- **F1 — Document-anchored identity for enumerating lanes.** For TID, Task, HEA, SA, Ergo, CD the drafter free-recalls rows from the document; that is why the same document yields 40 / 61 / 51 tasks. The FCIM-carry lesson applies: give the drafter the document's own enumeration (procedure names from Appendix A/B, the alert list, the display elements) as the row skeleton and ask it to CLASSIFY each, not to invent the list. Turns enumeration variance into coverage, which is checkable. Biggest single lever for HF consistency.
- **F2 — TID never reaches Non-normal / Emergency** although the source has them. A coverage check against the document's procedure headings (or one pass per opsMode) closes it; it is the same shape as "not in FCIM" on the FHA.
- **F3 — Report drops in the review gate.** The coverage line should say "N values not in the lane vocabulary were dropped: priority 'warning' ×12" — visible, not silent, and it tells us whether alerts priority is abstention or case.
- **F4 — Record whole-lane abstention.** Zero usable rows should open the gate with the abstention (and the model's stated reason) so it is journaled like every other abstention, instead of a toast.
- **F5 — Extend the crew vocabulary + definitions to mfc `role`** (PF / PM / Both / — with "Both" defined) so nav's Both-vs-PM becomes a scored disagreement rather than free text. Ten lines on top of 1.14.
- **F6 — Campaign hygiene (mine):** the driver must treat the "Nothing drafted" toast as an abstention record; fixed-row lanes must clear by the row's real key; the HEA 1–2 identical pair is proof the C2 replay cache works and that every campaign draw must set `evalFresh` — the runbook says so since 2 Sep.

Not testable on D1: RAM AI lanes — no FRACAS / MSG-3 seed records; the parts list is not AI-drafted. Needs a project with reliability data, or seed records agreed with Waqas.

## Addendum — after the vocabulary deploy (hf_analyses 1.14 / ai_assistant 76.31, 3 Sep 00:5x UTC)

Two fresh draws each of TID and Task on the new build, same protocol, same document.

| Lane | Rows | Identity overlap | Classification on matched rows | Before (1.13) |
|---|---|---|---|---|
| TID | 41 / 43 (spread 5 %) | 0.47 | **crew κ 0.94, agreement 0.96 on 27 matched** (one disagreement); opsMode κ 1.00; phase agreement 1.00 | crew κ 0.78–0.94; spread 34 %; overlap 0.26–0.40 |
| Task | 38 / 28 | **0.06** (4 matched) | crewmember 0 % blank in both draws (was 78 % in draw 1); on the 4 matched rows crew agreement 0.50, phase 1.00 — too few rows to score | crewmember free text, "PF (left seat)" |

Read: defined vocabulary + downselect did what it was built to do — every crew and phase value in 168 rows is a vocabulary term, none dropped, TID crew agreement at the top of its previous range with a tighter row count. Two things the addendum makes sharper than the main table:

- **TID coverage stops at engine start.** Every TID row in both draws carries phase "Standing" — the procedures drafted are pre-flight, before-start and APU/engine start (Appendix A's first sections). Taxi, takeoff, climb, cruise, approach, landing and all of Appendix B never appear. The drafter reads from the top of the document and stops at an output ceiling; the "enumeration variance" is partly truncation. F1/F2 are therefore not optional: draft per document section (or per opsMode / phase) and check coverage against the document's own procedure headings.
- **Task analysis has no stable population.** Identity overlap 0.06 and a crew distribution that swings (Either 23 → 7, PM 2 → 12) mean the two draws describe different task sets, not the same tasks classified differently. Task analysis should consume the TID as its skeleton — the inventory exists precisely to enumerate — rather than free-recalling tasks from the document. That is F1 applied lane-to-lane and it is the fix for this lane.

Cloud-save verification on the same build (D1): two rapid manual saves coalesced into one write (55→56), the background autosave landed behind it on the shared chain (56→57), no dialog, no refusal, nothing in the console. Zero conflict dialogs across the four post-deploy draws.

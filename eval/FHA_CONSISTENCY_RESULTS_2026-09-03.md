# FHA consistency campaign — results (3 Sep 2026, Aeolus on scratch project "HF Consistency · Aeolus · D1")

Protocol: capture-seam draws only. `SafetyLabAI.captureNextDraft(ms)` armed, the lane's own public entry point called, the draft awaited as data. **Nothing rendered, nothing accepted, the project never mutated** — so unlike the 2 Sep campaign these rows were never written anywhere and the project's own 253 rows are untouched by this run. `SafetyLabAI.evalFresh = true` before every draw. Raw store exported to `eval/runs/slab_campaign_v1_2026-09-03.json` (15 runs, 12 landed, 573 rows) and committed **before** scoring, per rule 26.

Builds: ai_assistant 76.38 (picker guards) for the draws; 76.39 (`_captureBail`) shipped after, in response to finding F3 below.

Scoring per Waqas's ruling (3 Sep): **the bar is that the intent of the effect is captured and the severity is correct. Identical wording is a bonus, not the metric.** Everything below that scores wording is therefore reported as a diagnostic, not as a pass/fail — see "What these numbers cannot tell you".

## The draws

| Tag | Lane | Model | Scope given | Rows | Seconds |
|---|---|---|---|---|---|
| `aeolus-fha-r1/2/3` | FHA conditions | Sonnet 4.6 | 3 conditions | 3 / 5 / 3 | 92 / 126 / 78 |
| `opus-fhaFULL-r1/2/3` | FHA conditions | Opus 4.8 | 85 conditions | 85 / 85 / 85 | 233 / 224 / 229 |
| `opus-hf-tid-r1/2/3` | HF task inventory | Opus 4.8 | lane key `tid` | 43 / 51 / 43 | 72 / 73 / 71 |
| `opus-hf-task-r1/2/3` | HF task analysis | Opus 4.8 | lane key `task` | 62 / 55 / 53 | 50 / 41 / 40 |
| `opus-fmea-r1/2/3` | FMEA | Opus 4.8 | — | **0, all three** | 901 each |

**Scope adherence.** Opus produced exactly 85 rows in all three runs, and every one of the 85 conditions received the identical number of rows in all three — zero mismatches. Sonnet, given three conditions, returned 3 / 5 / 3, drafting rows for `SF-001-PL2` and `SF-001-M2`, which exist in the project but were not in the requested scope. Out-of-scope, not invented; the earlier session note calling them invented is wrong and is corrected here.

**The FMEA runs cost 45 minutes and produced nothing.** Not a model failure: `Provider.available()` was false, `draftFmea` hit an early `_toast(...); return;` and bailed in milliseconds. The harness then waited out its full 900 s timeout three times. No credits were spent. See F3.

## FHA classification — Opus, 85 conditions, n=3

Pairwise (the like-for-like with the v2 E2 rig's 0.947):

| axis | agreement | mean both-committed | flip rate |
|---|---|---|---|
| effAcLevel | 0.827 | 39 of 85 | 0.243 |
| effCrewLevel | 0.792 | 39 | 0.251 |
| effPaxLevel | 0.932 | 59 | 0.220 |
| *severity (derived)* | *0.821* | *39* | *0.204* |

Three-way (all three runs on the same value): 0.765 / 0.706 / 0.907, severity 0.750.

**Severity is not an independent axis and must not be reported as one.** The directive tells the model the class is DERIVED from the three levels and the product recomputes it on accept; the class is the worst axis. Pooled over all three runs, all 51 Catastrophic rows carry `hull loss` and all 51 `hull loss` rows are Catastrophic — strictly one-to-one, in both directions. The 17/17, 16/16, 18/18 "joint top step holds" reading from earlier in the session is **tautological** and is withdrawn. Below the top step the aircraft axis is genuinely independent (`significant` spans Hazardous and Major, `slight` spans Major and Minor), which is why the field exists at all.

## Counts

| | r1 | r2 | r3 |
|---|---|---|---|
| Catastrophic | 17 | 16 | 18 |
| Hazardous | 9 | 9 | 6 |
| Major | 12 | 21 | 20 |
| Minor | 10 | 2 | 4 |
| severity blank | 37 | 37 | 37 |

**The top of the scale is reproducible; the middle is not.** Catastrophic holds to ±1 (~6%). Major nearly doubles r1→r2 and Minor swings five-fold. The number a certification authority asks for first — how many catastrophic failure conditions — is stable. The Major/Minor split is not usable as a count today.

**The abstention total is pinned and its membership is not.** Severity came back blank on exactly 37 rows in all three runs. Only 21 rows were blank in all three, out of 51 blank in at least one — stability 0.41. Genuine per-row uncertainty would abstain on roughly the same hard rows and let the total drift. A fixed total over a shifting membership looks like a quota. **Unverified**: the same test has not been run on the Sonnet set or the E2 data. Highest-value cheap check outstanding.

## Drift against the project's own accepted rows

The project carries 253 FHA rows accepted 2 Sep 19:34–20:05 UTC, 65 conditions classified. **All 253 are `aiGenerated: true`, model `claude-opus-4-8`, zero human-authored** (42 carry review comments). This is therefore Opus-2-Sep vs Opus-3-Sep — a fourth run through the accept path — **not accuracy**.

| run | comparable | agreement | AI more severe | AI less severe |
|---|---|---|---|---|
| r1 | 42 | 0.762 | 1 | 9 |
| r2 | 44 | 0.932 | 0 | 3 |
| r3 | 45 | 0.844 | 1 | 6 |

**Two findings, and the second is the important one.** Agreement against a *fixed* reference swings 0.762–0.932 — a 17-point spread across three runs of the same prompt on the same data, where the comparison target did not move. And disagreements break **18 less severe to 2 more severe**. Noise is symmetric; this is not noise. Where 2 Sep said Hazardous, 3 Sep says Major; where it said Major, 3 Sep says Minor. **Downward drift, concentrated in the middle band — the same place the counts churn and the same place the coherence rule stops applying.** Under-classification is the direction that removes DAL, verification rigour and independent means. This is the session's principal finding.

## The golden runs

Seven exist (`golden_aeolus_v1`–`v6`, `golden_halcyon_v1`), newest 31 Aug. **Every FHA row in all of them is `aiGenerated: true`** — they are frozen snapshots of the tool's own output, useful for detecting change, and they are not an answer key. Nothing in this repo is.

**A method error worth recording.** Comparing goldens by row id gives severity agreement 0.25–0.68 and `fcDesc` overlap 0.08–0.19. Those numbers are garbage: the ids are sequential slot numbers (`FC-002`, `FC-003`), the lists shift by one between runs, and the comparison lines up different failure conditions. Matched by content instead:

| pair | rows | matched | overlap | sev agree | effAc | effCrew | effPax |
|---|---|---|---|---|---|---|---|
| v1/v2 | 101 / 100 | 63 | 0.63 | 0.786 | 0.170 | 0.168 | 0.456 |
| v1/v4 | 101 / 100 | 50 | 0.50 | 0.500 | 0.231 | 0.214 | 0.429 |
| v2/v3 | 100 / 128 | 66 | 0.66 | 0.706 | 0.184 | 0.189 | 0.361 |
| v5/v6 | 122 / 92 | 35 | 0.38 | 0.529 | 0.174 | 0.172 | 0.391 |

(15 pairs scored; range shown.) **Matching counts hid a different analysis.** v1 and v4 both produced ~100 rows and share only 50 conditions, agreeing on severity half the time. Count similarity was the criterion these were selected on and it is not a criterion — a run can hit 100 every time by finding a different hundred things.

**But the comparison to 3 Sep is not like-for-like and must not be quoted as improvement.** In the golden runs the tool generated the failure conditions itself (FCIM: 35 / 30 / 35 rows). In the 3 Sep campaign the 85 conditions were **supplied as input** and the lane was asked to fill in effects. "Found all 85 every time" is the model echoing a list it was handed, not enumerating. The condition-wording figure (0.913) is inflated for the same reason. **The enumeration step — the hard half, and the half that matters — was not tested on 3 Sep.**

The one measure taken the same way on both sides is the effects reasoning, on wording: ~0.17 across golden pairs in late August, 0.18–0.27 on 3 Sep. Flat.

## What these numbers cannot tell you

- **Not accuracy.** No golden set, no human-authored reference. Everything here is the tool compared with itself.
- **Wording overlap is the wrong instrument for the stated bar.** Two effects can share almost no vocabulary and carry the same intent, or share most of it and differ. Per Waqas's ruling the bar is intent + correct severity; token overlap sees neither. The 0.18/0.27 figures mean "I did not check", not "the tool failed".
- **The condition-generation step was not exercised.** See above.
- **The six HF draws are unscored.** `tid` and `task` both landed three clean runs, but HF rows carry a different schema — no `srcCondId`, none of the severity axes — so the FHA scorer reads them as zero matched rows and must not be pointed at them. Their row counts alone (tid 43 / 51 / 43, task 62 / 55 / 53) repeat the 2 Sep free-recall enumeration variance, which is the one thing that can be said without a scorer. Needs the lane-identity scorer from the 2 Sep runbook, not this one.
- **Aircraft-level phrasing is a correctness question these metrics are blind to.** Waqas, 3 Sep, on `v1` vs `v2`: "complete loss of propulsive thrust" is the correct aircraft-level statement; "complete loss of thrust generation" hints at loss of engine, whereas loss of thrust at aircraft level may arise on the inceptor, computation or effector side, and those three are what feed interdependence. One is right and one has drifted into naming the implementation — which the skill's own IMPLEMENTATION-AGNOSTIC rule forbids. Word overlap scored them as a rephrase.

## Findings → enhancements (priority order)

- **F1 — The middle band is the whole problem.** Enumeration (when scoped), top-step classification and condition wording are all in good shape. Everything unstable — the count churn, the 0.41 abstention membership, the 18-to-2 downward drift — sits between Minor and Hazardous. Extend the axis-coherence rule below the top step (occupants downstream of aircraft, not only at the joint top) and require an explicit independent-means count on the aircraft axis, which is the evidence the rubric already asks for and the runs are not supplying.
- **F2 — Pin the abstention rule.** ~30 flips per axis are one run answering where another declined. That is not disagreement about the answer, it is disagreement about whether the question is answerable. Deterministic abstention converts those into either agreement or visible disagreement, and it is cheaper than moving the classification number directly. Confirm the quota hypothesis first.
- **F3 — DONE (76.39).** A refusal is a result. 99 toast-and-return guard clauses resolved no capture, so any lane refusing early hung a campaign for the full timeout — 45 minutes on FMEA for zero information the lane had already stated in a toast. `_captureBail` + `_captureGuard` on the 17 public lane entry points, plus a guard on `_fmeaSystemPicker` (the sixth picker; the 76.38 sweep matched `_open*Picker` and missed it). 30 checks in `regression_capture_bail`.
- **F4 — Score intent, not wording.** The current metric cannot answer the question Waqas actually asked. Needs a judge over meaning — a model-as-judge pass with the effects pair and a same/different ruling, spot-checked by hand — or it needs abandoning. Do not report token overlap as a consistency result again.
- **F5 — Re-run the enumeration test properly.** Let the tool find the conditions itself, three runs, same as the goldens, and compare content-matched. Until then there is no honest before/after on the part of the job that matters most.
- **F6 — A real answer key.** Twenty conditions classified by hand would make the word "accuracy" usable for the first time. Nothing else in the repo can substitute.
- **F7 — Wall hygiene (mine).** `regression_hf_lane_drafters` prints `FAIL` with one space; `ship.sh` greps `^  FAIL  ` with two, so a real failure was scored as a crash. Harmless here, mislabels a genuine defect in general.

## Corrections to earlier readings in this session

1. **Severity reported as a fourth independent axis.** It is `max()` of the other three. Withdrawn.
2. **"The joint top-step rule is working" (17/17, 16/16, 18/18).** Tautological — the class is derived from the axis. Withdrawn.
3. **Goldens scored by row id.** Invalid; ids are slot numbers. Re-scored by content.
4. **"Found all 85 every time" quoted as consistency.** The conditions were supplied. Withdrawn as evidence of enumeration.
5. **The 253 project rows called "the engineer's answer".** All 253 are AI-generated, none human-authored. Withdrawn as an accuracy reference.
6. **Sonnet's extra rows called "invented".** They are real project conditions, drafted out of scope. Corrected.

# HF LANE CONSISTENCY CAMPAIGN — runbook + first result (2 Sep 2026)

Waqas: "I want all lanes tested multiple times for consistency" (starting tomorrow).
This file is the pickup point.

## GOAL
For every HF lane, N>=3 genuinely independent draws from the SAME source document,
scored for run-to-run consistency: count band, topic Jaccard, and Cohen's kappa on
each lane's categorical field. Report per-lane stability + the variance axis.

## LANES (9) and their input dependency
Document-only (draftable from the HF SDD alone):
  tid (Task Identification), tasks (Task Analysis), hea (Human Error Analysis),
  alerts (Crew Alerting), ergo (Ergonomics), cd (Controls & Displays), sa (Situation Awareness)
KEYED to project structure (need the core pipeline present, NOT just the doc):
  alloc (needs sub-functions => acFunctionsData), mfc (Minimum Flight Crew; Appendix D funcs + determination)
=> To test alloc + mfc, run on a project that already has functions/FCIM/FHA
   (the Aeolus cloud project 60581a7e has 23 fn / 23 FCIM / 30 FHA) AND the HF doc loaded.
   The document-only lanes can run on either.

## SOURCE DOCUMENT
AEO-HF-0001_Aeolus_HL1_Flight_Deck_and_Human_Factors  (~82,662 chars; .md in ~/Downloads;
md5 of the .md ddbec6bd72a7fb0307c12362994d245e). The Chrome extension cannot upload from
~/Downloads (separate allowlist from the device bridge), so EITHER Waqas drags it into
AI Inputs (worked today), OR inject via SafetyLabSourceDocs.add({name,text}) — note a
programmatic gzip->DecompressionStream inject FAILED in-page today ("Failed to fetch"); the
manual upload is the reliable path.

## THE METHOD THAT WORKS (per lane, per draw)
1. Load the source doc into AI Inputs (once per project).
2. Draft draw #1 normally -> accept all -> deep-copy rows: JSON.parse(JSON.stringify(HF_ANALYSES._read(lane).rows)).
3. For each subsequent independent draw:
   a. Clear the lane (so existingRows is empty, matching draw-1's request hash).
   b. window.SafetyLabAI.evalFresh = true (finding #1, fixed) or the draw is a byte-identical echo.
   c. Draft -> accept all -> deep-copy.
4. Score with window.SLABEvalCore.scoreRun({meta,laneKeyRows}, {...}) for count+topicJaccard,
   and window.SLABEvalCore.agreementOn(d1,d2,{idOf,codeOf}) for kappa on the categorical field.
   Lane key names: tidRows, taskRows, heaRows, alertRows, ergoRows, cdRows, saRows,
   hfAllocRows, mfcRows (see _repeatabilitySnapshot in ai_assistant.js).

## FINDING #1 — FIXED 2 Sep 2026 (ai_assistant 76.30): set `window.SafetyLabAI.evalFresh = true` before a draw.
_completeReproducible then sends every HF/RAM reproducible draft with req.noCache=true, which the C2 wrap
honours for BOTH the local and the remote replay layer and never records over the golden. The export's
meta.fresh declares the posture. The neutralize-the-wrap workaround below is retired.
### (historical) the replay cache masks model variance
HF drafters route through _completeReproducible -> the wrapped window.SafetyLabAI.complete,
which has a LOCAL + REMOTE deterministic-replay cache (C2). An identical request returns the
recorded draft (today: draw 2 came back in 122ms, remoteHits:1, byte-identical to draw 1).
aiCacheClear() clears only the LOCAL layer; the remote layer still replays.
WORKAROUND USED TODAY: neutralize the wrap so _completeReproducible falls through to the raw
provider:  const c=window.SafetyLabAI.complete; c._acWrapped=false; c._afWrapped=false;  ...draft...
then restore c._acWrapped=true. The raw draw took real latency (>45s) and produced an
independent sample. Proper fix: give the repeatability harness a first-class cache-bypass.

## FINDING #2 — FIXED 2 Sep 2026 (ai_assistant 76.30): _repeatabilitySnapshot deep-clones every lane array.
### (historical) runRepeatabilityExport returned LIVE array references
The exported run object's lane arrays alias the live store; clearing a lane later empties the
stashed export. Deep-clone on export. (Today the golden's in-page rows were emptied when I
cleared the lane; recovered draw 1 from the remote replay cache.)

## FIRST RESULT — Task Identification (tid), 2 independent draws, temp 0.2, memory-on, cache bypassed
Project "HF Consistency . Aeolus . D1"; source AEO-HF-0001; requestModel claude-opus-4-8;
a14 "rode prompts - 1251 chars #5f17abe0".
  count            44 -> 44        (identical)
  opsMode kappa    1.000           (raw 1.000; 44/44 id-matched, both committed)
  topicJaccard     0.941 (scorer) / 0.754 (stricter token-bag)
  verbatim name    30/44           (the other 14 = same task, reworded)
Read: structure + classification effectively deterministic; only surface wording varies.
NOTE: scoreRun's overall verdict was DRIFT — a FALSE POSITIVE from severityAgreement (an FHA
metric) on an empty FHA lane in a TID-only run. Both TID metrics pass. Score lanes in isolation
or ignore non-populated-lane metrics.

## TOMORROW — plan
- Decide base project: Aeolus cloud (full pipeline, needed for alloc/mfc) + load HF doc; or a
  fresh project for the 7 document-only lanes and Aeolus for the 2 keyed ones.
- N draws per lane (>=3 for a variance floor, not just a pair).
- Spend: ~9 lanes x (N-1) fresh drafts + 1 seed each ~= 9*N drafts. At N=3 that's ~27 paid
  drafts. GET WAQAS'S SPEND APPROVAL for that scale before starting (today's ~$20 covered a pair).
- Consider fixing finding #1 (harness cache-bypass) and #2 (deep-clone export) FIRST so the
  campaign runs clean and repeatable without hand-neutralizing the wrap each time.
- Record every lane's numbers in eval/EXPORT_RUN.md under a dated heading (programme discipline).

## STATE LEFT TONIGHT
- Deployed build carries the durability + save-location fixes (data_ops 66.34 / helpers 2.72 /
  bindings 1.35 / core 1.2 / misc 66.53); backups at ~/sl_backup_2sep.
- Throwaway test projects exist in cloud: "HF Consistency . Aeolus . D1" (holds a tid draw),
  "Durability Test . HF/RAM". Clean up or reuse tomorrow.

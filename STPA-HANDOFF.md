> **HISTORICAL (20 Jul 2026):** the engine AND the walkthrough are SHIPPED and live
> (stpa_panel v0.3, INV-32 — note INV-18 belonged to zonal). Remaining STPA work is
> only the constraints→requirements drafting increment. Current truth lives in
> HANDOFF.md, addendum of 19–20 Jul. This file stays as build-era reference.

# STPA LANE — DEDICATED HANDOFF (Safety Lab Aero)

For any session picking up the STPA build. Owner: Waqas (bosh). Repo: `~/Desktop/safety-lab-deploy`
(LIVE tool — full 37-suite wall + boot QA before he deploys with `npx wrangler deploy`).

## Why (context)
INCOSE Yokohama 2026 poster (UL Solutions/msg Plaut/RMMV/Asatte, "STPA Enables Transition of Legacy
Automotive Safety & Cybersecurity to the SDV Era") validates the house thesis: component-failure
standards miss INTERACTION hazards; continuous feedback loops beat static processes. Safety Lab IS
the continuous-feedback tooling — STPA is the system lane above FHA/FTA ("FMEA is the bottom feed").
STPA COMPLEMENTS, never replaces. Marketing angle + author outreach are queued in HANDOFF.md addendum.

## State: what exists RIGHT NOW
- `site/stpa_core.js` v0.1 — ENGINE WRITTEN AND COMMITTED to the Mac repo, but NOT wired into
  index.html (no script tag, no nav, no view) and NOT yet covered by a test suite. It is inert —
  zero risk to the live tool. Syntax-checked pattern: IIFE, window.STPA + module.exports,
  display-lane (never writes stores).
- Engine API (all validated, refusal-over-repair):
  · validate(cs) — cs = {controllers[{id,name,kind:human|automation|organization}], processes[{id,
    name}], actions[{id,from,to,name}], feedbacks[{id,from,to,name}]}. Refuses dangling edges,
    dup ids, empty structures, zero actions.
  · inv18(cs) — MISSING-FEEDBACK advisory: any control action with no feedback edge (process→
    controller) flagged: "commanding without hearing is open-loop hope, not control". THREE exits
    (add feedback path / document equivalent route / accept open-loop EXPLICITLY as a typed
    two-posture assumption). No "mark as reviewed".
  · ucaSeeds(cs, dispositions) — every action × 4 guide phrases (not provided / provided causes
    hazard / wrong timing-order / stopped too soon-applied too long) → seed items, status open|
    assessed|dismissed. Dismissal WITHOUT rationale THROWS ("a silent dismissal is a hole").
    Seeds computed, never stored; dispositions are the data:
    dispositions['<actionId>:<phraseId>'] = {status, hazard?, fcIds?[], rationale?, scenarios?[
    {desc, causalFactors:[{factor, asmId?}]}]}.
  · lossScenarios(cs, dispositions, asmResolver) — scenarios from assessed UCAs; every causal
    factor SHOULD cite asmId; unlinked → flag "an unregistered mitigation is a hope, not a
    control"; asmResolver(asmId)→{state,effective} pulls live posture (wire to
    HF_ASSUMPTIONS.asmAllTyped()+effectivePosture).

## Remaining build (in order)
1. `tests/regression_stpa.test.js` (~20 checks, house style '  PASS  '/'  FAIL  ' + exitCode):
   validate refusals (dangling edge, dup id, no actions); inv18 catches an unheard action and is
   silent when feedback exists; exits contain the typed-assumption route; ucaSeeds = actions×4;
   dismissal-without-rationale throws; assessed UCA carries fcIds; lossScenarios flags unlinked
   causal factor + UNRESOLVED asmId; resolver populates posture; display-lane (stores byte-identical
   snapshot check); wiring checks (added in step 2).
2. Wire: index.html script tag `stpa_core.js?v=0.1` after hf_register_panel; STPA view module
   `stpa_panel.js` (moat pattern: own host, switchTab wrap guard `_stpaWrapped`, tab id 'stpa',
   nav under Analyze/Human factors area: "STPA (system lane)"; view-stpa div; support_modules tabs
   array gains 'stpa'; cache-busters bumped; rev_diff/ux-style version pins updated if touched).
   Panel: control-structure editor (nodes+edges tables, schema-driven feel), SVG graph render
   (paper skin, controllers top / processes bottom, actions down-arrows, feedbacks up-arrows,
   missing-feedback edges drawn dashed red), UCA table with disposition authoring (assess→link FC
   multiselect from acFhaData / dismiss→rationale required), scenarios card with asmId links +
   live posture chips, INV-18 findings block with the three exits.
3. Storage: `stpaData = { cs, dispositions }` global (bindings_modules let + project.json persist
   list + data_ops load path) — follow how flightPhasesData persists. Authoring writes ONLY via
   panel author adapter (hf_register_panel v0.4 pattern).
4. invRegister: register INV-18 (advisory) alongside INV-16/17 when invRegister exists.
5. Seed case (demo/showcase): AE-001 GLA control loop — controllers: FCS(automation), Crew(human);
   processes: GLA surfaces, Airframe loads; actions: FCS→surfaces "deflect", Crew→FCS "engage/
   inhibit"; feedbacks: loads→FCS "accel/rate sensing"; deliberately OMIT surfaces→Crew status
   feedback so INV-18 fires in the demo. UCAs: "deflect not provided during gust" → links to the
   GLA FHA FC; causal factor "sensor latency budget" cites AS-041-style assumption.
6. Wall (all 37+1 suites) + Playwright boot QA (port 8901 pattern, splash removal) + screenshot +
   commit ALL changed files to ~/Desktop/safety-lab-deploy + hand him the deploy command.

## Doctrines that bind this lane (non-negotiable)
- Complements FHA/FTA, never replaces. FMEA is the bottom feed; STPA is the system lane.
- Every mitigation/credit = typed two-posture assumption; credited ONLY when Validated/Verified.
- Refusal over repair; no nag engine; three exits; no "mark as reviewed"; dismissals need rationale.
- Display-lane engines; single author adapter for writes; digital paper skin; cache-bust everything.
- Wall before commit; user deploys, never the session.

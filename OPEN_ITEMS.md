# Open items register — requirements bucketing & fault trees

Standing register, not a dated entry. Update in place; do not let it scroll away in HANDOFF.md.
Opened 19 Aug 2026 at Waqas's request ("log these as open items in the handoff").

Rationale for the design decisions behind most of these lives in
`WORK_PACKAGE_MAC_CoFFE_Structured_Trees.md` (the full-context read — MAC, CoFFE, interdependence,
and the single ordered build list), `UPGRADES_Requirement_Bucketing.md` (U-1 … U-7) and
`BUILD_SPEC_Structured_Nodes_and_Bucketing.md`.

**28 Sep 2026: this register holds only LIVE work.** Everything completed, superseded or overcome
by later work moved to `CLOSED_ITEMS.md`, with the migration ids, test counts and live checks that
closed it. 137 entries became 52 open and 72 closed; the rest were duplicate or historical blocks.

## 28 Sep 2026 — ACTIVE SECURITY QUEUE (Waqas: "mark the security ones as items to do")

The open security work, in the order it should be done. Everything not listed here is closed and
lives in `CLOSED_ITEMS.md`, with the evidence that closed it. S13 to S18 are Enterprise builds,
not defects, and stay parked further down this file.

Checked against the code and the repo on 28 Sep 2026, not against this register — several entries
had drifted in both directions.

- [ ] **SEC-0d — the audit hash does not cover every field.** The seal covers prev_hash, user_id,
      feature, model, tokens_in, tokens_out and ts. It does NOT cover `itar`, `ok`, `error`,
      `weighted_cost` or `latency_ms`. Someone with database access could flip `itar` from true to
      false, erasing the record that a call was export-controlled, and the chain would still
      verify clean. Widening the hash invalidates every existing row.
      This USED to be a now-or-never decision that had to ride along with SEC-0. It is not any
      more: 20260929a gives the verifier registered segment boundaries, so a widening is just
      another registered break with a recorded reason, done whenever it is wanted. Left as its own
      decision. Cost if taken: one migration, one registered boundary, the chain reads
      "segments = 13" afterwards. NEEDS WAQAS.

- [ ] **SEC-0b — `workspace_audit` has zero rows.** The AI-call half of S7 writes (59 rows on
      production, newest 00:47 on 28 Sep). The workspace-events half — sign-ins, role changes,
      invitations, exports, erasures — has never written anything. S13's "unified activity log" is
      half built, and the trust page's activity claims should be read against that.
- [ ] **SEC-0c — the hosted app loads a third-party beacon that is not on its own egress list.**
      Verified live 28 Sep: every `/app/` page load fetches
      `static.cloudflareinsights.com/beacon.min.js`, injected by Cloudflare at the edge.
      `SLConfigEgress()` returns only Supabase and api.safetylabaero.com, so SL-DG-0001 section 7.2
      ("lists every address the application will contact") is false on the hosted product. Same
      defect class as the d3js finding in R7 that we thought was closed. Also: the live CSP still
      permits cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com and d3js.org in `script-src` and
      two of them in `connect-src`, although nothing loads from them since the 16 Sep vendoring —
      a reviewer reads the policy, not the source.
      **RESOLVED IN CODE 28 Sep 2026, per Waqas: "fix the code to match the paper, unless it will
      make the tool worse."** It does not make it worse. Checked first: zero references to any of
      the four hosts anywhere in site/ outside vendor/, zero runtime URL construction, and pdf.js
      already takes its worker from vendor/pdf.worker.min.js. So all four came out of script-src
      and the two out of connect-src; the CSP now names only Supabase, the proxy, Anthropic, Voyage
      and Jama. regression_app_headers gained H8 (30/30, three mutations proved red: a CDN put back
      in script-src, a stray host in connect-src, a vendored library removed). The paper keeps its
      strong claim and now earns it. NEEDS ./ship.sh to reach browsers.
      **ONE PIECE LEFT, AND IT IS A DASHBOARD TOGGLE, NOT CODE:** Cloudflare still injects the
      beacon tag into every app page at the edge. Measured live: it does NOT execute — transferSize
      0, encodedBodySize 0, no __cfBeacon global, no collector request — because the app's own CSP
      refuses it, so no analytics data leaves a customer's browser today. But the HTML carries a
      third-party script tag, and a reviewer reads the page. Turn auto-injection off in Cloudflare
      Web Analytics (cost: analytics on the marketing pages, which can be re-added to those pages
      explicitly if wanted). Waqas's call.
- [ ] **SEC-2 — rotate notify_hook_secret.** Due since 17 Sep. Needs Waqas; the value itself is his.
      Steps and the verification query (the failure here is silent) in SECURITY_ROTATION_RUNBOOK.md
      section 1.
- [ ] **SEC-3b (was part of S11) — the proxy is TOLD which feature each call is for and ignores
      it.** The browser sends `x-safetylab-feature` on every AI call; the worker accepts the header
      in CORS and never reads it. It never reads it because the BROWSER writes the audit_log row
      itself, which means the AI ledger records whatever the browser says it does. The honest fix
      is the proxy writing its own row from what it actually saw, which is S13's unified activity
      log, not a line in the worker. Deliberately left open on 29 Sep rather than ticked off with
      something cosmetic. Carries SEC-0b (workspace_audit has never written a row) with it.
- [x] **SEC-3c — DONE 2 Oct 2026 in SL-DG-0001 Rev 2.2** (section 4.2), together with the 7.2/7.3
      egress wording and the 6.2 Anthropic Workspace sentence. Rev 2.2 is Released and sitting in
      customer-install/, but it is ON HOLD FROM RADIA until config 1.4 is deployed: section 7.2
      describes the two-part egress listing, which does not exist on the live site until ./ship.sh
      runs. Send it after the deploy, not before.
      Original entry: **the deployment guide does not mention ALLOWED_ORIGINS.** SL-DG-0001 v2.0 is a
      released customer document and is under the R15 hold, so it was not edited on 29 Sep when the
      variable was added. `.env.example` in the proxy repo documents it in full. Fold into the next
      guide revision, with the customer-hosted stand-down stated plainly.
- [ ] **SEC-4 (S9) — erasure is narrower than the Data Security paper describes.** Self-service project
      erasure via RPC, certificate persisted in destruction_certificates and shown on the account
      page, local wipe on erase and sign-out, complete manifest, ai_org_cache stamped and cascaded.
      This one is a documentation-accuracy risk as much as a security one.
- [ ] **SEC-5 (R8) — legacy API keys.** CORRECTED 1 Oct 2026: the premise of this item was stale.
      The service_role JWT is NOT in any trigger definition. Verified against production: 23 triggers
      in `public`, none takes an argument, none contains a JWT, and the one function that calls out
      over HTTP (`private.notify_post`) reads a purpose-scoped secret from Supabase Vault. That
      changed on 17 Sep. There is no big-bang and no trigger surgery.
      What is actually left: the legacy anon and service_role JWT keys are still enabled. The app
      already uses the modern publishable key, but all seven edge functions still take the
      auto-injected `SUPABASE_SERVICE_ROLE_KEY`, so the legacy keys cannot be disabled until those
      move to a `sb_secret_` key. The service_role JWT was in the schema before 17 Sep and so is in
      every backup from before that date, which is why it should be retired rather than left.
      Staged, reversible procedure in SECURITY_ROTATION_RUNBOOK.md section 2. Note S28 still applies:
      the last change to this path killed every outbound email for three days, silently.
- [ ] **SEC-6 (S12, remaining half) — capture the production-only DDL into the repo** (`supabase db dump`)
      so the customer-install migrations stop drifting from production. S20 depends on it.
- [ ] **SEC-7 (S24) — desktop update signing, two steps that need Waqas.** (a) run
      `node tools/update-signing/sign-manifest.mjs keygen` and paste the printed PUBLIC key into
      update_verify.js, private key stays on his Mac; (b) buy the native code-signing certificate
      (Apple Developer ID plus notarization, Windows Authenticode). Claude cannot handle either.
- [ ] **SEC-8 (S25) — prove contextIsolation at runtime.** Code landed 17 Sep, never exercised on a
      running shell.
- [ ] **SEC-9 (R7 residual) — one human click-through of an FHA draft on the reference install.** The
      credential, transport and provider path is already proven headless; this is the last step
      before the R15 hold on the Data Security paper can lift.

## From the same sweep, still open:
- ROTATE notify_hook_secret. The value was visible in a screenshot pasted into the work session,
  so it is in a chat log. It is only a notification trigger, not the database key — which is the
  point of it not being the service-role key any more — but rotate it: one `openssl rand` piped
  to pbcopy, `supabase secrets set`, and vault.update_secret('18364382-1b63-4d6e-bab2-805748217ec1', ...).
- ai_usage has a writer (increment_ai_usage, service_role only) and NO CALLER anywhere in the
  three repos. An AI usage meter that has never been incremented. Not yet chased.
- audit_log is still 0 rows. The 16 Sep writers are called from helpers_modules.js on AI calls
  and sign-offs; no sign-off has ever happened, so 0 may be honest. Needs one real AI call to
  confirm audit_ai_call fires.
- customer-install/db/00_schema_baseline.sql created three triggers on a CUSTOMER's database
  pointing at OUR project URL, so a review action there POSTed the record to Safety Lab's cloud.
  Credential was redacted so every call 401'd, which is why nobody saw it. REMOVED 17 Sep. The
  file's own header had recorded the 6 Sep ruling to point them at the customer's endpoint; the
  URL was never changed. A written ruling is not a control until something enforces it.

**Desktop (safety-lab-desktop): all update/hardening infra is WIRED but inert —**
- S24 signed updates: INDEPENDENT signed-manifest lock BUILT 14 Sep (desktop 68d79e5, update_verify.js, wall 106/0); still needs Waqas keygen+paste and a native cert. See DESKTOP_SIGNING_CHECKLIST.md.
- S25 contextIsolation — CODE DONE 17 Sep (desktop d7804ca), NOT YET PROVEN AT RUNTIME. It is on for
  all three windows now. The recorded reason it had been off for months (230 classic scripts sharing
  window globals) was wrong: isolation separates the PRELOAD from the page, not the page's scripts
  from each other, and not one of the 230 had to change. The one thing that genuinely had to move was
  __slabAuthCallback, from the preload into the page. Still needs a Mac build that BOOTS.
- S25b (found 17 Sep, fixed same day, desktop c5b4df8) — moving that handler broke the desktop
  sign-in for one commit, and nothing caught it. The desktop ships a VENDORED copy of the web build;
  that copy was at a6655ed, one commit before the move, so the handler existed in neither the preload
  nor the bundle. main.js:267 calls it as `window.__slabAuthCallback ? ... : false`, so it failed
  silently: browser opens, user authenticates, returns, app does nothing. Both walls were green the
  whole time — each repo was internally consistent and nothing checked the seam. Bundle re-pulled at
  80057bc; new suite tests/regression_shell_page_contract.test.js (12) walks main.js for that guard
  pattern and requires every name it finds to be defined in exactly one of the preload or the bundle,
  plus a BUILD_INFO md5 check so a hand-patched app/ is caught. Mutation-tested three ways.
  NOTE: the same silent-guard pattern covers four other page functions (__slabGetProjectJSON,
  __slabLoadProjectJSON, __slabOpenCloudProject, openInWebLink). All five resolve today; the suite
  is what keeps that true.
- S26 config.json plaintext — CLOSED 23 Sep (see top: the key is publishable by design). Was: the backend key sits in plain text in the desktop's own
  config file. The Jama credential half of this was fixed 16 Sep (OS keychain via safeStorage).
  BUNDLE STALENESS half: CLOSED 17 Sep — app/ is now web 80057bc, current as of this session, which
  is the first time the desktop has carried R18/R19, the demo FCIM fix and the .sl picker.
- S27 no git remote — CLOSED 23 Sep (see top). Was: STILL OPEN AND WORSENING. Nothing is pushed anywhere, on ANY of the three repos (safety-lab-deploy 213, -proxy-deploy 17, -desktop 10 commits as of 17 Sep). The only copy of the company is one laptop. Waqas's action; needs his account.

## Governing design decisions (rescued 5 Sep 2026 from `ROADMAP_Process_Layer.md`, which was scrapped)

Written 2 Jul 2026 against v61.00. Waqas, 5 Sep: "scrap the road map." Its PHASE LIST was stale —
the interdependence table, MAC editor, compiler, CoFFE and equivalence verifier had all shipped
without it being updated, and a plan that lists built things as unbuilt sends the next person to
build them twice. These ten decisions are a different thing: they are still the operating doctrine
and that file was their only home, so they were moved here before it was deleted.

1. **Probability-only allocation** — allocation trees distribute probability budgets; failure rate
   is verification-side. (Shipped, v61.00.)
2. **Artifacts are renderings** — the app maintains data relationships; standard-format documents
   (FMES, CoFFE tables, FDAL summaries, all six assessment reports) are generated on demand, never
   hand-maintained.
3. **Fixed objectives, pluggable methods, recorded tailoring** — completion gates check the
   standard's objectives; method choice (MAC vs manual CoFFE vs hybrid, FTA vs MBSA) is per-program
   configuration; opt-outs carry signed rationale; severity drives depth defaults.
4. **MAC + Interdependence as the aircraft-level model** (MBSA per App N) — MAC floors are source-
   document inputs (assumptions until substantiated); the threshold model compiles; trees, cut sets,
   CoFFE verdicts, budgets and functional failure sets are compiled OUTPUTS. Unmodelled states
   default conservative.
5. **Two-lane discipline** — elicited evidence (human or AI-confirmed) and computed evidence never
   overwrite each other; the computed lane CHECKS the elicited lane. Locked human verdicts form the
   model's regression suite.
6. **AI drafts, the core proves** — the engine proves Boolean equivalence against the compiled truth
   before acceptance. **AI never originates a number.**
7. **Independence Principles as a deduped claim registry** — one record per unique member set;
   gate attributes, CMA rows and requirements attach to it; lifecycle Identified → Evaluated →
   Requirement → Verified; a compromise cascades to all dependents.
8. **Cockpits, not report generators** — each of the six assessments is a stateful workspace:
   input tray → activity board → completion checklist (the standard's own criteria) → outputs ledger.
9. **Baseline and hand off** — a gate-green action: hashed baseline, versioned publish to downstream
   input trays, sign-off. Iterative, with visible deltas.
10. **Q-format reports** — the default template family mirrors ARP4761A Appendix Q artifact formats
    (formats modelled, content original); contiguity is structural because every report renders one
    database.

**Three roadmap items looked ABSENT in a 5 Sep name search and were NOT confirmed:** the status
engine (In work / Ready to hand off / Handed off / Reopened), assumption routing (owning level,
routed-to, confirmation evidence), and the Independence Principle ledger of decision 7 — which the
standard leans on for proposing independence requirements. **Treat as leads, not findings.** A
name search proving absence is the exact trap rule 19 exists for (the "0 transfer gates" probe that
was wrong); confirm each by more than one name before building anything.

The roadmap's parked list, also rescued: problem reports / OPRs · ARP4754B Appendix A objectives
matrix · validation-vs-verification split · CEA dependency graph · modification impact wizard
(Tables 4/5) · MMEL/TLD dispatch mode · safety-significant events export.

---

**Live as of 19 Aug 2026, verified on the deployed build:** `mac_lanes.js` 1.1 ·
`node_identity.js` 1.0 · `node_identity_ui.js` 1.3 · `sl_env.js` 1.0 · `misc_fn_modules.js` 66.31 ·
`assurance_modules.js` 1.22 · `helpers_modules.js` 2.39 · `fta_view_modules.js` 66.30 ·
`safety_lab.css` 65.48 · `safety_lab.js` 65.41. **Wall 158 suites, 0 real fails.**

**Item 0 — SHIPPED AND VERIFIED LIVE 19 Aug 2026 (66.37).** The runtime smoke gate is in `ship.sh`, between the build
and the deploy, gating `./dist`. 14 checks. Zero dependencies — it drives a browser already on the
machine over the DevTools Protocol using Node's built-in WebSocket, and replays the production CSP
read live from `worker.js`. **Accepted on the stated criterion:** reintroducing each of the four
19 Aug escapes turns it red — `.is-modal` 2 · comment corruption 5 · `window[name]` 7 · malformed
attribute 4. It never skips silently: no browser or too-old Node is a hard failure with an
instruction; `SMOKE_SKIP=1` is a knowing override that announces the build is unverified.
`tests/regression_smoke_gate.test.js` (29 checks) guards the wiring, since execution cannot prove
the hook is still plumbed in. `./ship.sh --smoke` runs wall + build + gate without deploying.
**Ran green in the real pipeline on Waqas's Mac on its first ship**, finding Chrome on the first
candidate path with no install and no download.

---

## A · Requirements bucketing

### Ruling needed
- ~~**A12**~~ — **RULED 19 Aug 2026: write back to a RESOURCE-CONSUMPTION RECORD, App Q.4-2 shape.**
  Not into the FC's interdependence contributor row. ARP4761A keeps these in two tables on purpose:
  Q.4-1 maps an aircraft failure condition to contributing system *functions*; Q.4-2 maps common
  resources to system functions — "supports this system function" is a different relation from
  "contributes a functional failure to this aircraft FC". Writing EPS into the contributor row would
  collapse that distinction and would then feed the A11 dropdown as though EPS contributed a
  functional failure. The discovery loop still closes: B.4.3.2 says the common-resource analysis
  exists precisely to find relationships the Interdependence Analysis missed.
  *Supersedes the earlier leaning toward the contributor row.* **To build:** check what
  `resourcesData` already supports before assuming a new artefact is needed.

  **SCOPED 26 Aug 2026 — that check is now done, and the answer is: NO NEW ARTEFACT.**
  `resourcesData` rows already carry `{ resId, name, type, providedBy[], consumedBy[],
  consumedBySystems[], description }` (misc_fn_modules.js:1690), and `cra_matrix.js` already
  derives consuming systems from `consumedBy` (sub-function ids → implementing systems, its
  `consumersOf`) and the failure conditions those functions own (`fcsOf`). The Q.4-2 relation is
  substantially modelled today. Three narrower things are missing:

  1. **No write-back path.** `cra_matrix.js` READS `resourcesData` and never writes it. So
     B.4.3.2's discovery loop — the common-resource analysis exists precisely to find
     relationships the Interdependence Analysis missed — has nowhere to land: a newly discovered
     consumption can only be recorded by hand-editing the resource row. This is the actual build,
     and it is small: a signed, previewed "record this consumption" action on a CRA finding that
     appends to `consumedBy` with provenance, in the house style (attributed sentence, never
     silent) that A2's `reqSource.rebucketed[]` established.

  2. **A GRANULARITY RULING IS NEEDED FIRST, and it is the same distinction the 19 Aug ruling was
     protecting.** `consumedBy` holds AIRCRAFT sub-function ids — both the resources renderer
     (`safety_lab.js`, resolving through `acFunctionsData`) and `cra_matrix.js` read it that way.
     App Q.4-2 maps common resources to **system** functions. A10/B6 already moved interdependence
     to system-function granularity (`fc§fn:<funcId>`). So: does `consumedBy` gain a
     system-function-keyed sibling, or does the Q.4-2 mapping address system functions directly
     and leave `consumedBy` as the aircraft-level view? Writing back at the wrong granularity
     would collapse Q.4-1 into Q.4-2, which is exactly what the 19 Aug ruling refused.

  3. **`consumedBy` and `consumedBySystems` already disagree in real data.** `consumedBySystems`
     is written only by a hand checkbox (misc_fn_modules.js:1666–1672) and by demo seeds — and
     the Halcyon seed populates `consumedBySystems` while leaving `consumedBy` EMPTY
     (`demo_showcase_halcyon.js:713–716`). So `cra_matrix.consumersOf`, which reads only
     `consumedBy`, sees no consumers for those resources. Worth confirming on a real customer
     project before building on either field. *(Not verified against customer data tonight —
     flagged, not measured.)*

---

## B · MAC / CoFFE

### B8 — CoFFE UPGRADE TO THE STANDARD'S METHOD (Waqas, 5 Sep 2026: "add the CoFFE upgrade to the buildmap after the 3 urgent builds and rest of the builds discussed from tonight")

**SCHEDULED LAST.** Order: workspace membership → collaborative workspace → no customer data on our
cloud → MFA → desktop (S23–S27) → MAC UI → **this**.

Read against ARP4761A App B.4.3.1 (p.56, Table B2) and the worked example Q.4.4.1 (pp.382–387,
Tables Q.4-6/7/8) on 5 Sep 2026.

**What the standard asks.** Select an aircraft failure condition; take the contributing system
functions from the Interdependence Analysis; enumerate their states in combination; record the
resulting capability; answer whether each combination produces the condition. The braking example
runs 4 functions × 3 states (Failed / Degraded / Operational) = 81 cases, then **Table Q.4-7 reduces
them to the minimum contributors** — six lines, and THAT reduced set is the product. It becomes the
AND gate in the fault tree and is where Independence Principles get proposed. CoFFE itself carries
no independence requirements but indicates where they are needed.

**Two things the standard CONFIRMS about the current build.** (a) Malfunction correctly sits outside
the availability arithmetic: in the example, uncommanded high thrust (FF5.3) is not in the CoFFE
table at all — it is already a Catastrophic system-level condition, so it hangs off the top OR gate
and goes to the propulsion PSSA. `coffeComputed` returning null for malfunction cases is right.
(b) "Degraded" is a per-project ASSUMPTION, not a universal — the example declares it as half
capability (PASA-ASMP-02).

**NOT to be re-proposed: a third STATE token.** B7 measured it and it was withdrawn deliberately —
676 cases to ~1,500, with a computed lane for none of them, because partial loss is not a state, it
is a capability below full. That reasoning stands.

**But the standard does need "degraded"** — the whole summary table turns on it ("total loss of
wheel brake in addition to PARTIAL loss of any ground spoiler or thrust reverser or flap"). The
representation ALREADY EXISTS and is empty: `rule.degraded[].weight` plus a clause `floor`, used by
**0 of 22 rules**. So this is the same data-entry job as F23, not a new mechanism — once the weights
exist, CoFFE grades a degraded state from the weight without a new enum.

**Depth is not solved by brute force.** Table Q.4-7 is a minimum-contributor set, which is what a
minimal-cut-set computation over the MAC model produces (design decision 4 above). The 81-row table
is the standard illustrating its reasoning, not a requirement to enumerate everything.

**The work, in order:**
- **B8.1 Wire `coffeCoverage`** (`misc_fn_modules.js:2094`, zero callers). It reports what the sweep
  left out; today nothing tells a user that triples were never enumerated, and the house rule is
  that a bounded sweep says what it left out. Safe half, can go alone.
- **B8.2 `coffeShortestRoute` stays OFF** (`:2044`, zero callers) until Waqas rules. It raises a
  `hard` finding on an order-1 route to Catastrophic/Hazardous without a single-member clause — a
  genuine single-point failure, and the answer to his own question about the fastest route to the
  catastrophic effect. Wiring it introduces a new finding class that could open the demo showing
  unrehearsed findings. A demo-risk call, his.
- **B8.3 The AI residue lane must report its failures** — `ai_assistant.js:3576,3579` do
  `failures++; continue;` with no reason. Run 3: 101 calls, 44 failed, no per-call reason. Same fix
  shape as F16a / F16d.
- **B8.4 Cap the residue** — 1,389 cases on run 2; today the only bound is 40 conditions per
  invocation, which bounds the run, not the work.
- **B8.5 Populate the degraded weights** on the MAC rules (with F23's data work), which gives CoFFE
  its third state through the existing path.
- **B8.6 Cross-check CoFFE against the SFHAs** once they exist — the standard asks for this
  explicitly, and it is what turns assumed failure effects into confirmed ones.

### Landed
### Built but not wired
> **Audited against the code 26 Aug 2026** (Waqas: "everything gets done tonight"). Both entries
> had gone stale when B3 and B4 landed on 21 Aug and nobody came back to this section. A register
> that overstates what is unbuilt is as misleading as one that overstates what is done — it sends
> the next person to build something that already exists. Corrected in place, with the evidence.

- **B2** — **HALF STALE, and the remaining half is real.** Of the four functions:
  · `coffeUnmodelledSystems` — **WIRED** (helpers_modules.js:2872, B4's panel names unmodelled
    contributors above the elicit table).
  · `coffeConfirmDerived` — **WIRED** (helpers_modules.js:2947, the "✍ sign derived" button).
  · `coffeShortestRoute` — **STILL UNREACHABLE.** Zero callers; defined at
    misc_fn_modules.js:1969. This is the one worth having: it computes the lowest-order route to
    a breach and raises `hard` when an order-1 route exists on a Catastrophic or Hazardous
    condition *without* a single-member clause — i.e. a genuine single point of failure rather
    than unmodelled redundancy. It already carries the 19 Aug cry-wolf guard, kept deliberately
    in step with `SLMacLanes.lanes()`.
  · `coffeCoverage` — **STILL UNREACHABLE.** Zero callers; misc_fn_modules.js:2012. Returns the
    enumeration bounds (singles + pairs, `depth: 2`, `higherOrderNotEnumerated`). Its own comment
    states the house rule it is meant to satisfy — *"a bounded sweep says what it left out"* —
    and today nothing says it. Directly the same principle as the AI coverage banner built
    26 Aug: an analysis that silently stops short reads as complete.

  **Deliberately NOT wired on the night of 26 Aug, and this is a demo-risk call, not a scope
  call.** `coffeShortestRoute.hard` is a NEW finding class. Wiring it hours before the Radia demo
  means the demo project could open tomorrow morning showing order-1 findings nobody has looked
  at yet — accurate, possibly alarming, and unrehearsed. `coffeCoverage` is the safe half (one
  advisory line on a panel that already renders) and could go alone. Waqas to rule.

### Not built
- **B5** — Malfunction lane supports `voting` and `none` only. **Self-checking / cross-comparison
  pairs undecided** — a single erroneous unit is passivated, so the defeating combination differs.
- **B7** — `_COFFE_STATES` deliberately untouched. Adding a `partial loss` enum is **WITHDRAWN**:
  partial loss is a *capability weight below full*, which is MAC's existing
  `rule.degraded[].weight` + clause `floor`, i.e. the L1/L2 path — currently used by **0 of 22**
  rules.

### Measured state of Aeolus HL-1 (19 Aug) — SNAPSHOT ONLY
> Waqas, 19 Aug: *"aeolus will be reworked with demos overhaul."* These numbers describe the demo
> as it stands tonight and will not survive that rework. Keep them as the evidence that motivated
> B4/B6 and the cry-wolf guard, not as a to-do list against this project.
- 676 CoFFE cases · 211 with a computed lane · **0 signed**
- 17 of 22 MAC clauses are **single-member**; **0** rules have degraded levels; **0** clauses have a
  floor
- **63 of 90** interdependence contributors appear in **no** MAC clause, across all 29 FCs
- 20 of 29 CAT/HAZ conditions show an order-1 route — almost all "min 1 of 1", i.e. unmodelled
  architecture, not discovered SPFs
- 7 of 22 MAC rules sit on non-Catastrophic conditions and retire under the CAT-only rule

---

## C · Fault trees — structure & authoring

### Landed
- Drawer stacking, scroll containment, sticky header, viewport-pinned resize handle (66.22–66.26)
- Panel audit: 36 findings, 35 fixed, standing layout-invariants suite with a scanner self-test
  (66.25)
### Ruling needed
- **C4** — **When does the closure block switch on for legacy projects?** **RULED 19 Aug 2026:
  STAY PARKED until the demos rework is real.** Aeolus is being reworked and Halcyon may follow, so
  the migration burden this ruling prices will look different afterwards; deciding now would price
  the wrong thing. Do not re-ask before the rework lands. Options when it does: (a) on immediately,
  (b) grandfather nodes created before the feature, (c) a per-project switch, optionally with a
  readiness count. Measured 19 Aug: **0 of 182 Aeolus nodes carry `node.identity`** and there is no
  bulk-declare surface, so (a) is a migration burden with no tooling behind it.

---

## F · AI engine quality

Opened 26 Aug 2026, from a read of an "agentic AI concepts" infographic Waqas shared. Two of the
nine concepts named real gaps in how the AI engine is built and changed; the other seven map onto
things we already do (memory/state = `snapshot()` + the doc store; orchestration = the chunk
worker pool; skills = the versioned, dated `_SPEC_*` blocks; the multi-agent pattern = the
verify-with-second-model + repair loop) or are integration horizons we don't need yet (MCP, A2A —
a future interface for the Jama/ReqIF bridges, nothing more). Scoped, not built. Both are
post-Radia.

- **F1 — No evals on drafting quality, only on code.** We mutation-test code ruthlessly — every
  regression suite proves it fails when the guard is broken. Prompt and spec changes to
  `ai_assistant.js` get none of that: when `_SPEC_FCIM` was rewritten and the assumptions
  contract was added tonight, nothing measured whether drafting quality moved. The 22→11
  function-count change on Waqas's project was caught by his eye, not by a check — and I
  initially attributed it to the wrong cause (see the summary: "overstated the prompt
  difference") because there was no baseline to check against.

  **The engine already has the hooks** — `runEvalSuite`, `runQualityCheck`, `runRedTeamSuite` all
  exist in `ai_assistant.js` and are reachable from the console, per tonight's Tier 2 sweep of
  `SafetyLabAI`'s keys. What's missing is discipline, not plumbing: a fixed set of golden inputs
  (the K350 fixture, an SDD excerpt with a known extraction) run before and after any prompt/spec
  change, with drift reported the same way the 26 Aug coverage banner reports misses — named, not
  silent. **To scope:** what "drift" means per lane (FHA severity distribution? FCIM row count
  band? PRA applicability set exactly matching the deterministic engine?), where the golden
  fixtures live, and whether this runs in the wall (deterministic, cheap) or needs a live model
  call (real signal, costs tokens, can't run on every commit).

  **29 Aug (late) — SKILLS V1 LANDED (see HANDOFF entry).** Lane specs extracted to
  site/ai_skills.js (versioned, hashed, registry-first with byte-identical inline
  fallback); uses recorded; aiSkill on FHA/FCIM rows; skill on every ledger entry.
  Open: V1.1 retire inline fallback + extend aiSkill to remaining writers + Model
  notes UI; V2 projectConfig-triggered variants; V3 customer packs (controlled docs,
  injection surface). A skill-body edit now REQUIRES an eval-harness run first.

  **29 Aug — first cut LANDED (`eval/`).** The scoping questions above now have answers:
  - **Golden fixture:** `eval/golden_aeolus_v1.json` — the full accepted 28 Aug demo run
    (Aeolus SDD md5 d73e0ed7…, 18 functions / 35 FCIM rows / 101 FHA rows / 92 assumptions,
    64 abstained; the one engineer-set severity is declared in `meta.engineerClassified` so it
    never counts as model variance). Pulled from the cloud row, not localStorage.
  - **Drift, defined:** `eval/score_run.mjs` — semantic matching by normalized text (ids differ
    every run by construction), 13 metrics: counts, function/FCIM/FHA text-set Jaccards,
    severity agreement over matched rows, severity-distribution total-variation, **severeJumpRate**
    (≥2-class severity moves — added because the mutation suite proved all-Catastrophic→Minor
    slipped under the agreement and distribution thresholds together), abstention-set Jaccard
    (the honest-blank set must be STABLE, not just present), citation cited/verified rates.
    Verdict by exit code; `--lax` reports without failing.
  - **Wall vs live:** split. `eval/regression_ai_repeatability.test.js` runs in the wall free —
    scorer mutation-proofed (8 seeded defect classes each trip their own metric), golden pinned,
    and the deterministic half (snapshot/_extractedFCs/_validPhases) proven byte-stable and
    clock/RNG-free by execution. Live repeat-runs are manual and batched (~5 min opus per FHA
    repeat, capture per `eval/EXPORT_RUN.md`), scored against the golden.
  - **Variance measured (29 Aug 2026):** three full fable-5 runs, same SDD, accept-all
    untouched — 8/16/53/52, 16/30/100/92, 22/37/110/105 (fn/FCIM/FHA/assumptions) vs the opus
    golden's 18/35/101/92. Run 2 promoted to `eval/golden_aeolus_v2.json` (model
    claude-fable-5, no engineer edits). Findings in EXPORT_RUN.md: granularity is the dominant
    variance axis (8→22 sub-functions from one document); normalized-text Jaccards measure
    phrasing, not content (fhaMatchedRate 0.03–0.06 even run-to-run same-model); the stable,
    trustworthy metrics are counts, severity distribution, severeJumpRate (0 everywhere) and
    citation rates; abstention discipline is the most repeatable behavior (60–68% across both
    models). Thresholds deliberately NOT tightened on the text metrics.
  - **F1b BUILT (30 Aug 2026, same session):** scorer rebuilt on topic|failure-mode
    matching (canonical lexicon in score_run.mjs; text metrics demoted to informational);
    granularityBand [14,24] read from golden v2 meta; severityAgreementClassified added so
    agreement can't hide behind abstain-abstain pairs (wholesale reclassification scores 0 —
    mutation-proved). Calibration: v2↔run3 REPEATABLE (86/100 matched), v1↔v2 cross-model
    REPEATABLE (the models agree at content level — the drift story really is granularity),
    v2↔run1 fails on exactly its defect metrics. arch.decompose bumped to
    **v2#071b3092** (granularity band 15–25 + split rule + document anchoring, band signed
    off by Waqas 30 Aug); coarse-decompose guardrail warns on the review panel below 12
    aircraft-scope functions — warns, never blocks. VALIDATED live 30 Aug: 3 decompose-only
    runs gave 24/24/21 functions (all in band; pre-v2 spread 8/16/22), topic Jaccard
    0.81–0.90, 100% §-cited rows, v2 stamp on every panel, guardrail correctly silent.
    Residual: run 3 omitted nose-door entirely — topic COMPLETENESS at the edges.
    **F1c BUILT same day:** `_decompSectionChecklist` parses the document's own two-level
    section list (mirrored chapters grouped by system code, non-functional sections filtered),
    `_decompCoverage` checks which sections the drafted rows cite (guarded prefix match, only
    add_function ops credit, <3 groups → no banner rather than a wrong one) and hands misses
    to the SAME coverage banner the FHA lanes use — on the Aeolus SDD the denominator is
    exactly the 14 named systems, and the run-3 miss would have read "Nose Cargo Door (NZD)".
    Advisory: warns, never blocks. AWAITING deploy + a live decompose to see the banner on
    prod; **golden v3 CUT 30 Aug evening** under the banner-gated
    protocol (eval/golden_aeolus_v3.json — 22/43/128/108, REPEATABLE vs v2, band [14,24],
    routing-key caveat in meta). NEW top repeatability axis: severity-judgment stability —
    same-config pair showed severeJumpRate 0.07 (>0.05) and classified-pair agreement as low
    as 0.333 vs v2; candidate fix is severity anchoring in fha.draft (tie classes to Table A6
    exemplars) — methodology change, eval-gated. **Spec targeting BUILT 30 Aug late (awaiting deploy + eval A/B):** site/spec_index.js
    per-lane deterministic chapter selection (hazard lanes drop zonal chapters; declared in
    the prompt; fail-safe to whole text). The A/B vs golden v3 is the gate before calling it
    an improvement. Also: runRepeatabilityExport() meta.project
    reads the wrong projectConfig key (came out empty on first production use) — two-line fix
    next batch.
  - **Still open in F1 (in-app hooks WIRED 30 Aug):** scoring core extracted to
    site/eval_core.js (single source — the CLI thin-shells over it via createRequire, so the
    identity/mutation proofs exercise the shared file), runRepeatabilityExport() and
    runRepeatabilityCheck(golden[, candidate]) on the public AI object; no model calls.
    Remaining: deterministic batching of the multi-turn coverage loop and content-derived
    internalIds — scoped-only (the id change touches the batch-49 strict-id census — do NOT
    do it casually).
  - **Model-id lesson (30 Aug, reverted same day):** MODELS.reason's default is the PROXY'S
    ROUTING KEY, not a provenance label. Changing it to 'claude-fable-5' routed drafting to a
    measurably worse serving config (A/B: 7/14 vs 10/14+ document systems); reverted to
    'claude-opus-4-8', mutation-proved. OPEN: (a) proxy could echo the truly-served model in
    the response so aiModel can record reality instead of the routing key — Waqas-side proxy
    config; (b) treat any request-model change as eval-gated methodology (candidate rule 22);
    (c) FIXED 30 Aug: signed-out posture built — cloud panels short-circuit
    to a sign-in prompt, RLS errors translated everywhere they surfaced (cloud_sync was
    already silent on no-uid; the every-12s claim was wrong, corrected here).
  - **Two row-stamp observations from the batch — (a) FIXED, (b) understood differently, 30 Aug:** (a) the chat
    executor now declares its lane for the duration of an apply (`_chatExecFeature` set from
    `_chatRunActions`' feature arg, reset in a finally), and all four chat writers stamp via
    `_chatProv(model)` — batch-accepted rows carry the real lane + skill stamp, plain chat
    stays 'chat.edit'; (b) `MODELS.reason` default moved opus-4-8 → claude-fable-5 to match
    what the proxy serves (AI Settings dropdown still wins). Executed + mutation-proved in
    regression_f1c_decomp_coverage.test.js; writer census in regression_ai_skills updated for
    the _chatProv shape (literal floor 19 → 16 + 4 spread sites + no-literal-chat.edit check).

- **F2 — Context assembly forks, and each fork is a place to forget something.** The pattern this
  session's five separate "reachability" fixes all share: `Provider.complete` injects
  specs/docs/clauses only when `_ANALYSIS_FEATURES[opts.feature] === 1`; the unified engine
  `_anemBatch` completes as `feature: 'chat.edit'`, which is deliberately excluded (the free-form
  chat must not carry fifteen specs a turn — pinned by `regression_spec_reachability`), so
  `_anemBatch` self-injects each block instead. Every new context type — specs (2 Aug), source
  docs (26 Aug morning), zonal + PRA applicability (26 Aug evening) — has had to be added on BOTH
  paths, and twice tonight it was measured live and found present on only one. That is the same
  bug, discovered three times, because the fix each time was a compensation in `_sysExtra`
  (`_specBlock + _docBlock + _zonalBlock + …`) rather than a retirement of the fork itself.

  **The fix is structural:** one context-assembly function that both `Provider.complete` and
  `_anemBatch` call, parameterized by feature — not two code paths that must be kept in sync by
  memory. `chat.edit`'s exclusion becomes an explicit parameter to that function rather than an
  absence from a different one. **Risk if this is not done:** the sixth reachability bug is a
  when, not an if — the next new context type added to only one path. **To scope:** map every
  current caller of both `Provider.complete` and `_anemBatch`, confirm the unification doesn't
  regress `regression_spec_reachability`'s pinned exclusion, mutation-prove the merge before
  touching either call site.

- **F3 — noted, not scoped: retrieval as a horizon, not a need.** "There should be no cap" (26 Aug
  ruling) is correct for every document size seen so far and should stay the default. The day a
  customer's SDD doesn't fit any context window, uncapped injection stops being an option and
  retrieval becomes one. No action now — recorded so it isn't rediscovered from scratch when a
  real document forces the question.

**Opened 3 Sep 2026, from the FHA consistency campaign.** Full data and method in
`eval/FHA_CONSISTENCY_RESULTS_2026-09-03.md`; raw draws in `eval/runs/slab_campaign_v1_2026-09-03.json`
(15 runs, 12 landed, 573 rows). NOTE: that write-up numbers its OWN findings F1–F7 independently of
this register — the ids below are this register's, and do not correspond.

- **F4 — Downward drift in the middle band. The principal finding, and the one with a safety
  direction.** Across three Opus runs, disagreement with the project's own accepted rows breaks
  **18 less severe to 2 more severe**. Noise is symmetric; this is not noise. Catastrophic holds to
  ±1 (17/16/18) but Major swings 12/21/20 and Minor 10/2/4, and the drift sits entirely between
  Minor and Hazardous — the band where the joint-top-step rule (WORKING_RULES 23) stops applying.
  Under-classification is the direction that removes DAL, verification rigour and independent means,
  so this is not a tidiness problem. **Proposed:** extend axis coherence below the top step
  (occupants downstream of aircraft, not only at the joint top) and require the explicit
  independent-means count the rubric already asks for on the aircraft axis, which the runs are not
  supplying. Note also that `severity` is DERIVED (`max()` of the three levels) and must never be
  reported as an independent axis — the perfect Catastrophic↔hull-loss pairing is tautological.

- **F5 — The abstention total is pinned; its membership is not.** Severity came back blank on
  **exactly 37 rows in all three runs**, yet only 21 rows were blank in all three out of 51 blank in
  at least one (stability 0.41). Genuine per-row uncertainty would abstain on roughly the same hard
  rows and let the total drift; a fixed total over shifting membership looks like a quota. ~30 flips
  per axis are one run answering where another declined — disagreement about whether the question is
  answerable, not about the answer. Cheapest outstanding check: re-run the same test on the Sonnet
  set and the E2 data to confirm or kill the quota hypothesis, THEN pin the abstention rule.

- **F6 — Consistency is being scored on wording, which cannot answer the question asked.**
  Waqas's ruling (3 Sep): **the bar is that the intent of the effect is captured and the severity is
  correct; identical wording is a bonus, not the metric.** Token overlap sees neither — two effects
  can share almost no vocabulary and carry one intent, or share most of it and differ. The reported
  0.18–0.27 effect-prose figures therefore mean "not checked", not "failed". Needs a judge over
  meaning (model-as-judge on the effects pair, same/different, hand spot-checked) or the measure
  should be dropped. Do not quote token overlap as a consistency result again.

- **F7 — The enumeration step has never been tested under the current build.** The 3 Sep campaign
  SUPPLIED the 85 failure conditions and asked the lane to fill in effects, so "found all 85 every
  time" is echoing a list, not enumerating — and the condition-wording figure (0.913) is inflated
  the same way. The golden runs DID generate their own conditions (FCIM 35/30/35), which is why
  content-matched overlap between them is only 38–66%. The two are therefore not comparable and no
  improvement claim can rest on them. Re-run the way August ran: tool finds its own conditions,
  three runs, matched by content. Until then there is no honest before/after on the half of the job
  that matters most. Related ruling: conditions must be stated at aircraft level and stay
  implementation-agnostic — "complete loss of propulsive thrust" is correct where "complete loss of
  thrust generation" hints at loss of engine, when the loss may arise on the inceptor, computation
  or effector side, and those three are what feed interdependence.

- **F8 — There is no answer key, and nothing in the repo can substitute for one.** All seven golden
  files are `aiGenerated: true` throughout, as are all 253 accepted rows on the campaign project, so
  every number produced to date is the tool compared with itself — drift, never accuracy. Twenty
  conditions classified by hand would make the word usable for the first time. Needs a person; no
  model can stand in.

- **F9 — The wall can mislabel a real failure as a crash.** `ship.sh` greps `^  FAIL  ` (two
  spaces, house style) but `regression_hf_lane_drafters` prints `FAIL` with one, so a genuine
  failing check was reported as "suite did not run to completion". Both states block the deploy, so
  nothing shipped wrongly — but the operator is told the wrong thing about why. Either normalise the
  suite's output or widen the grep and keep the crash/fail distinction on the exit code.

- **F11 — Learn from review comments and edits on AI rows (Waqas, 4 Sep: "like if I comment on
  an AI generated row, or edit it I want it to learn from the comments — post campaign but needs
  to get done").** Today the model learns nothing; the app remembers EDITS as style-only exemplars
  (A14, Top-K, "style never substance") and reads review COMMENTS not at all — the only use of
  `reviewCommentsData` in ai_assistant.js is an open-count for a dashboard. Rejections leave no
  trace the AI sees, and a judgement call (v6) that the engineer overturns or confirms teaches it
  nothing about the judgement. WANTED: a feedback loop where a comment on an AI row and an edit to
  one shape SUBSTANCE on the next draft of the same kind — classification, not just phrasing — with
  the same ITAR filter A14 has, and provenance so a retrieved correction can be traced to the row
  it came from. Design question first: retrieval into the prompt (few-shot, like A14 but for
  substance) vs. a per-project rulebook the engineer can read and prune. **After the goldens are
  drawn**, because it changes what they measure; **not optional**.

- **F12 — Accept should take the engineer to where the rows landed (Waqas, 4 Sep: "when a user
  accepts AI inputs it should automatically take them to the page where the inputs landed").**
  Today Accept applies the rows and leaves the screen where it was. Wanted: after the review
  panel's Accept / Accept all, switch to the worksheet that received the rows (functions →
  Functions, FCIM → FCIM, FHA → the FHA table, trees → the tree, HF lane → that lane), scrolled to
  the first new row. Where one draft lands in more than one place, go to the first kind accepted
  and say where the rest went. Review-panel Accept ONLY — applyDraft (the harness) never moves the
  screen. Small; one deploy; do it between campaign passes so the campaign build is not disturbed.

- **F21 — SEVERITY LEVELS DERIVED FROM THE MAC AND FROM HUMAN FACTORS WORKLOAD (Waqas, 5 Sep 2026). BUILT 5 Sep (midday), `site/fha_derive.js` v1.0 + 76.59 — awaiting deploy and the three identical-input draws.**
  Built as stated below, plus lever 3 (escapes per phase on the mission profile, three structured
  answers per row, the 4 Sep ruling applied at accept). Follow-ups once the draws are read: the FHA
  CSV export does not yet carry `realized` / `escape` / `escapeDefeated` / `derived`; the classic
  SFHA path carries the escapes clause and the derived clause but still has no coverage re-ask (F19);
  the occupant axis and a malfunction's aircraft axis remain judged — if they carry the residual
  disagreement, that is the next derivation to design, not a prompt to tune.
  Original statement:
  Identical-input draws agree on a row's class 63% of the time and on a function's worst class
  82%; the aircraft/crew axis levels underneath agree ~62%. Judgement cannot be made consistent;
  derivation can. Build: (a) aircraft axis from the MAC — for a condition's phase row, how much
  configuration authority remains against the rule's floor → slight / significant / large; outside
  the MAC → the loss itself, with the phase logic (abortable → No Safety Effect; inescapable → end
  effect) on top; (b) crew axis from the Task Analysis — the workload increase a failure causes,
  read as occupancy against the 60% / 80% lines → slight / significant / large; (c) where the MAC
  or the task analysis is not populated, the AI's level lands as an ASSUMPTION ("assumed pending
  MAC" / "assumed pending HF workload") in the register, validated when they are; (d) the FHA
  drafter is told which levels are derived and only writes the rest. Then three fresh FHA draws on
  identical inputs, scored strictly, bar 0.90. Rejected on the way and not to be re-raised: a
  per-function worst-case anchor (the 2 Aug mistake again) and fixed phase groups (loss of braking
  is Standing NSE / Taxi Maj-Haz / airborne forward-looking CAT / Landing immediate CAT — groups
  come from each condition's effects).

- **F22 — "FELT YET" AS A PROPERTY OF THE FUNCTION (consistency lever A; Waqas, 5 Sep 2026: "yes"
  to A then B; not started).** After the three identical-input draws on the lever build (e1/e2/e3,
  5 Sep) the judged number — class per condition per phase (eval_core 1.9) — sat at 0.72 / 0.66 /
  0.64 against the 0.90 bar; function worst case 0.91–0.96 passes. About a third of the disagreeing
  cells are the drafter's "is the effect felt yet / can the flight escape" answer flipping between
  draws (two-class jumps, ground phases and malfunctions worst). Build: each aircraft function
  carries the phases it is demanded in (drafted once from the SDD, reviewed by Waqas, then held
  fixed like the functions and FCIM); not demanded in a phase → not realised there, by rule; the
  drafter answers only "does this failure defeat the escape". Prompt + accept + tests + one review
  pass over the 22 functions. Expected to move the per-phase number into the 80s on its own.

- **F23 — FEED THE DERIVATIONS (consistency lever B; after F22).** MAC rules for the 13 of 22
  functions that have none (today 9 rules → the aircraft axis derives on 10 partial losses only);
  the 6 crew tasks given phases, response times and the conditions they answer (today none → crew
  axis never derives; every row lands as "assumed pending HF workload"). Data entry, AI-drafted and
  reviewed; the machinery (`fha_derive.js`) is built. Targets the one-step swaps (Major↔Hazardous,
  Minor↔No Safety Effect). Cannot touch a malfunction's aircraft axis — the MAC says nothing about
  erroneous behaviour.

- **F24 — THREE FRESH DRAWS AFTER F22 + F23, THEN READ THE RESIDUAL.** Same protocol as e1/e2/e3
  (fresh reload, FHA cleared, cache bypassed, run 3's 22 functions / 43 FCIM / 107 conditions;
  ~9 min and ~$5 each), scored with eval_core 1.9 (`perPhaseClassAgreement` ≥ 0.90; row-level
  severity and phase split informational). Whatever is left is judgement on malfunctions and the
  occupant axis — Waqas: the drafter says "no passengers" consistently on Aeolus, so option C
  (occupant axis by rule) is OFF the table. If malfunctions carry the residual, that is the next
  derivation to design, not a prompt to tune.
  **DONE 5 Sep 2026 — the exports are out of the browser.** Pulled from the live site's IndexedDB
  (`slab.draw5.e1/.e2/.e3`), verified as valid JSON with row counts matching the log (199/200/197),
  and filed on Waqas's OneDrive at `Safety Lab Aero - measurement data/2026-09-05 FHA consistency
  draws (e1 e2 e3)` — md5-verified copies plus a README recording what they cost, what was measured
  from them, and the F25 temperature caveat. Rule 26 satisfied. STILL OPEN if wanted: a second copy
  under `eval/runs/goldens/` (~8 MB in git) — Waqas to say whether OneDrive alone is enough.

- **F19 — THE SFHA (classic path) HAS NO PHASE-COVERAGE RE-ASK (4 Sep 2026).** The AFHA's
  unified path now checks that a condition's rows together cover every phase of the mission
  profile and re-asks once for the gaps; the classic `_runPopulateFha` path the SFHA uses got the
  rewritten system-prompt rule 4 but no coverage check. Add `_fhaPhaseGaps` + one repair turn
  there too, and a checker rule on stored rows (advisory: "phases not assessed on N conditions").

- **F20 — TWO FAMILIES OF TREES FOR THE SAME CONDITIONS (run 3, 4 Sep 2026).** The interdependence
  step still seeds one "MF&MS · <condition> — seeded" skeleton page per multi-system condition
  (102 on run 3, `generatedFrom`/`_idpFp`), beside the 18 pages the lane compiler built from MAC +
  interdependence + CoFFE. Question for Waqas: retire the seeded skeletons now the compiler
  exists, or keep them as the "not yet floored" placeholder. Also from run 3: CoFFE 101 calls,
  44 failed — the lane records no per-call reason yet (same fix shape as F16a/F16d).

- **F18 — A RELOAD THAT FAILS TO RESTORE LOCALLY KEEPS THE CLOUD IDENTITY AND RENAMES THE ROW
  (live, 4 Sep 2026 ~19:08 UTC).** The run 2 tab reloaded after a deploy (its localStorage was at
  Chrome's ceiling), came up as an empty "Untitled Project" with `_activeCloudProjectId` still
  2f31f51e and `_dirtySinceSave` true, and autosave wrote the NAME "Untitled Project" over the
  run 2 project row. The anti-wipe guard refused the data (version stayed 237; 126 conditions,
  19 MAC rules, 142 trees intact); the name was put back by hand and the tab detached with
  `__slCloudSyncDetach`. Same family as de27b117 (31 Aug), different entry: not New Project but a
  failed local restore. Fix: on boot, if the local snapshot did not restore (or restored empty)
  while a cloud id is stored, DETACH before the first autosave — or adopt the server document
  instead of pushing; never let an empty document carry a stored identity. A duplicate near-empty
  row 417f4ea9 (SDD only, 05:48) also exists from the morning's "saved copy changed" dialog —
  export-then-delete when the cleanup list is agreed (rule 26).

- **F17 — NO HAND EDITOR FOR THE ARBITRATION SCHEME (found 4 Sep 2026 while fixing F16c).** `rule.arbitration`
  {scheme voting|none, k, of} is read by mac_lanes and reported by lane_trees, and the MAC drafter
  can now propose it from the document — but no panel lets the engineer DECLARE or SIGN it by
  hand (helpers only re-points members). Until the MAC page has an arbitration control (scheme,
  k, members, citation, signature), an AI-proposed scheme cannot be confirmed in the product and
  a document that is silent leaves the malfunction lane underivable with no way to fix it on
  screen. One panel change; the store shape already exists.

- **F13 — CMA "link" fails because adding a CMA returns no id (found on golden run 1, 4 Sep 2026;
  46 of the CMA draft's actions failed).** The AI's CMA draft is `add_cma` followed by `link`
  actions that point at the new CMA with a placeholder id; `add_cma` does not return the id it
  created, so every `link` fails with "no CMA with _id …". The human review panel's Accept-all
  applies items one at a time and has the SAME fault, so this is a product defect, not a harness
  one. Fix: `add_cma` returns the new id and the executor rewrites placeholder ids in the actions
  that follow (the same way functions → failure conditions already resolve). Two honesty gaps
  found alongside, same fix pass: `add_fta_tree failed` with no reason given (4 trees on run 1),
  and the FMEA lane declining with no reason when the project has no systems. One deploy, before
  run 2 if time allows — the CMA and tree numbers on the goldens are wrong until it lands.

- **F14 — Declared assumptions never name a failure condition (run 1: 0 of the AI's declared
  assumptions named a condition id, so `_assumptionsFor` linked none of them).** The engine now
  links an assumption to a row only when the assumption names the row's condition or sub-function
  (4 Sep — "we dont need to show all 97 assumptions on every failure condition"). For that to
  populate, the drafting instruction must ask the model to fill `appliesTo` with the condition
  ids the assumption governs. Skill-body change → eval-gated; do it with the next skills bump.

## H · Cloud persistence (opened 31 Aug 2026, data-loss fix session)

- **H-5 — LANDED 31 Aug 2026** (crdt_sync 1.6). BOTH candidates taken, deliberately:
  `adoptModel()` calls `refresh()` synchronously (window 0ms), AND `_docStale()` guards
  pushLocal and pullToModel so a window opened by any future caller still cannot cross
  the streams. The register named only the push direction; the PULL direction was worse —
  a peer update on the old channel applied the OLD project's rows onto the NEW model.
  `regression_h5_crdt_project_switch`, 11 executed checks, 5 mutations red.
  Original entry:
- ~~**H-5 — CRDT project-switch window:**~~ the 6s refresh poll leaves up to 6s where the ydoc still
  belongs to the PREVIOUS project after the model switched; pushLocal in that window writes the
  new project's rows into the old project's CRDT doc (doc-only pollution). Candidate: refresh()
  called synchronously from _loadCloudProject/adoptModel, or pushLocal guards _projId === _proj().
## S · Security and data residency (opened 5 Sep 2026, from the code audit — see `SECURITY_AUDIT_2026-09-05.md`)

Waqas's target: data security "at Microsoft Office levels … or even Jama Connect level, so they have
no arguments" — engineering only (independent audits and a government tier ruled OUT, 5 Sep). The
audit found the product does less than the Data Security paper (SL-WP-0003 Rev 2.4) and the trust
page say. Order: S1–S6 (defects), then S7–S12, then S13–S18 (Enterprise builds), then S19–S21
(residency), then S22 (paper + pages). Each build is stated back to Waqas before it starts.


### High

- **S8 — Credentials in plaintext localStorage. DONE 29 Sep 2026.** The entry said phases 3 to 6 were open; the code said otherwise, and the code was right. Phases 3 to 6 landed 20 Sep (secret_store.js, the proxy's server-side read, customer-install, tests): the Anthropic key, the Voyage key and the Jama credentials all go through the vault, the page cannot read a value back, and the proxy reads them server-side. What was genuinely still on disk was ONE thing, and it is a different animal: the LICENCE BEARER TOKEN in `safetyLab.license.token`. Not a user secret (it is issued to the account), which is probably why it was left behind, but a bearer credential all the same: one injected script and it spends AI against the account. FIXED 29 Sep (SEC-1): `site/license_token.js` holds it in a closure for the life of the page, nothing is written to disk, and a value an older build left there is DELETED at load rather than adopted. Memory is enough because auth_gate re-reads the token from `license_tokens` at every sign-in and already gates the UI on that read finishing (`__slabLicenseReady`, 6 s), so storage was never earning its keep; sessionStorage would still have put it somewhere a later script can read. On a customer install nothing changes in substance: the real bearer there is the signed licence blob, which never went through this slot. Five call sites moved (auth_gate, slab_license, misc_fn_modules, notify_agents, bindings_modules). `tests/regression_license_token.test.js` 25/25, five mutations red (holder adopts the on-disk leftover; getLicenseToken falls back to localStorage; notify_agents falls back; slab_license writes the marker to disk; the holder loads after slab_license). Wall 356/356.
- **S9 — Erasure narrower than described. HALF DONE, re-checked 28 Sep 2026.** The DATABASE half landed 16 Sep (`20260916_erasure_completeness.sql`, and it is thorough — it found the surviving feedback row, the uncattributed answer cache and the understated manifest). The CLIENT half did not: no local wipe on erase or sign-out, and no persisted certificate on the account page. Original entry: `erase_project` service-role only; certificate shown once, never persisted client-side; local copies (autosave, ring, last-good, disk `.sl`, AI memory, CRDT IndexedDB) never cleared; manifest counts three things while the cascade removes many more; `ai_org_cache` survives erasure. Fix: self-service project erasure via RPC, certificate stored in `destruction_certificates` and shown on the account page, local wipe on erase and sign-out, complete manifest, cache rows stamped with workspace/project and cascaded.
- **S11 — Proxy hygiene. DONE 29 Sep 2026 (SEC-3). NOT YET DEPLOYED (Waqas ships the proxy repo).** Three defects, all verified live on 28 Sep, all fixed and mutation-proved. (1) CORS was `"access-control-allow-origin": "*"`: the proxy told every browser on the internet that any page could read its replies. Now an allowlist — safetylabaero.com built in, `ALLOWED_ORIGINS` for a customer's own hostname — decided once at the edge of fetch() and applied to whatever the handlers returned, so there is no per-request state shared between concurrent requests in the same isolate. An unknown BROWSER origin is refused 403 before any licence lookup, upstream call or metering, so a hostile page cannot even burn an account's allowance. A request with no Origin at all (curl, a server, the desktop main process) is served as before and simply gets no CORS header back. TWO HONEST RESIDUALS, both in the code as comments: the desktop loads from `file://`, which browsers report as the origin "null", so "null" is accepted by default (`ALLOW_NULL_ORIGIN=0` closes it the day SEC-8 / S25 moves the desktop off file://); and a customer-hosted install with `ALLOWED_ORIGINS` unset stands the check down with a warning in the log, because 403ing a field install's entire AI feature on upgrade is worse than the exposure it closes, and that proxy sits inside the customer's own boundary billing their own AI. Setting the variable enforces immediately. (2) The request-rate cap FAILED OPEN — KV missing or erroring and every capped account went through unlimited, with a comment defending it. It now fails CLOSED with a 503 and an honest message, and only where a cap exists: founder, comped and every customer-hosted install have no cap and are untouched. A missing BINDING is treated as a deployment choice rather than a fault, unless `RATE_LIMIT_REQUIRED=1` says the deployment really has one — which wrangler.jsonc now sets, so on Cloudflare a binding that went missing is caught instead of silently reverting to unlimited, while a customer's standalone node proxy keeps working. (3) The KV counter key was the raw licence token; it is now a SHA-256 of it, under a per-lane prefix. `test/proxy_hygiene.test.mjs` 28/28, eight mutations red (wildcard restored; every origin allowed; refused origin still runs the request; fail-open on KV error; raw token back in the key; missing binding a free pass; the null-origin switch dead; the stand-down ignoring a configured list). `.env.example` written (the header had promised one that did not exist). Feature-header half carried forward as SEC-3b.
- **S12 — PARTLY DONE 5 Sep 2026.** Cleared: `site/.fuse_hidden*` and `site/MS_SSO_SETUP.md` are out of the served tree and `build.sh` now allowlists what ships (they were being published — one was a full copy of `ai_assistant.js` with every prompt and skill body); the stale `safety-lab-proxy_worker_SEC.js` is deleted and `regression_eula_terms` reads the real proxy from the sibling repo, loudly rather than skipping silently when it is absent; `20260831_version_monotonic_guard.sql`'s header no longer claims it is unapplied (it is applied — `PERSISTENCE_INVENTORY.md:65`). STILL OPEN below: the missing DDL, `0007`, and SSO.
- **S12 — Migration drift. RE-READ 28 Sep 2026 AND IT IS BIGGER THAN THIS ENTRY SAYS.** `supabase/schema_capture_2026-09-06/GAP_ANALYSIS.md`: **18 of the 24 production base tables have no CREATE TABLE anywhere in `supabase/migrations/`** — users, workspaces, workspace_members, projects and fourteen more were made in the Supabase dashboard and never written to a file, so `supabase db push` on a clean project FAILS. A customer cannot stand up their own database from this repo today, which is the foundation of "no customer data on our cloud", and S20 sits on top of it. Original entry: capture DDL for `users`, `workspaces`, `projects`, `project_documents`, `audit_log`, `license_tokens`, `approved_tenants`, `ai_org_cache`, `destruction_certificates`, `pending_comps`, the `private.erase_*` bodies and `private.audit_immutable` into the repo (`supabase db dump`); apply or retire `20260831_version_monotonic_guard.sql` and 0007; delete `site/.fuse_hidden*`, `site/MS_SSO_SETUP.md` from the served tree, and the stale `safety-lab-proxy_worker_SEC.js` copy; enable SSO (`SL_MS_SSO_ENABLED`) only once the Azure provider and the tenant hook are verified.

### Enterprise builds (Microsoft / Jama parity, engineering only)

- **S13 — Unified activity log** (= S7 done properly): every sign-in, role change, invitation, export, erasure and AI call, hash-chained, customer-exportable, with a workspace-admin view.
- **S14 — One classification label per project** (Public / Internal / Controlled-ITAR / Controlled-non-US) that every channel obeys: AI routing, answer cache, Teams/email notifications, exports, sharing, collaboration. Replaces the scattered flags (project toggle, document `controlled`, per-system taint, licence flag).
- **S15 — Retention and legal hold**: workspace retention rules on version history, a hold flag that blocks erasure, complete destruction certificate.
- **S16 — Workspace admin controls**: force sign-out / session revocation, session lifetime, re-auth for sensitive actions, MFA/SSO policy, AI on/off, cache on/off, access-review export.
- **S17 — AI data receipt per call**: which documents and sections left the browser, to which backend, how many bytes — on the row and in the evidence package.
- **S18 — Customer-managed encryption keys** (last): per-workspace key from the customer's vault wrapping the project blob before it reaches the database; changes backups and search.


### Desktop application (audited 5 Sep 2026; Waqas: "desktop app definitely needs to get fixed")

- **S24 — Update channel signing. INDEPENDENT LOCK BUILT 14 Sep 2026 (safety-lab-desktop 68d79e5); native cert still needed.** Was: auto-update verified only by a SHA-512 from the same R2 host, so whoever controls that host could push code. BUILT: an independent ECDSA P-256 signature over the update manifest, verified in-app (update_verify.js) against a baked-in public key before any manifest is believed — a compromised host cannot forge it. Fail-closed, domain-separated from the licence key, mutation-proven (tests/update_verify.test.js 20, desktop wall 106/0). publish-desktop.sh signs each manifest and refuses to publish unsigned. TWO THINGS LEFT: (a) Waqas runs `node tools/update-signing/sign-manifest.mjs keygen` and pastes the printed public key into update_verify.js (private key stays on his Mac) — same dance as the licence key; (b) a native code-signing CERTIFICATE (Apple Developer ID + notarization for mac; Windows Authenticode) to flip AUTO_UPDATE_SIGNED and enable silent auto-install with the OS verifying the payload too. Procurement steps in DESKTOP_SIGNING_CHECKLIST.md. Claude cannot handle either credential.
- **S25 — Electron shell posture.** `contextIsolation:false` on the main window (with a "harden
  before ship" comment carried since v1), `sandbox:false`, **no CSP anywhere**, DevTools in the
  production menu, and `will-navigate` handing any non-`file://` scheme to `shell.openExternal`.
  Never notarized; Windows builds unsigned.

## R · Redesign, severity system, and the September carry-overs (opened 12 Sep 2026)

Everything below is OPEN on 12 Sep 2026. The redesign itself is DONE and live (HANDOFF 12 Sep); these are what it left behind plus the 7–11 Sep items that never made it into this register.

- **R3 — Demo data regeneration.** Every demo SFHA row references a system function and FC that do not exist in that system (extractedFCs = 0 per system); the 9 Sep editor fix hides it but the data is wrong. Regenerate demos so SFHA → functions/FCs link.
- **R5 — MAC screen rework** (item 16 from 5 Sep; B-section here). Parked by Waqas: "needs more of my brain cells". The 11 Sep mockup put the minimum-configuration set and flight phases on one screen — a starting point only.
- **R6 — Sync Stage 4.** Delete the `SL_CRDT_AUTHORITATIVE` flag-off rollback branch once live co-editing has baked on real projects (Waqas: "after it bakes"). Nothing else in the old sync stack is deletable — cloud_sync autosave is the backup writer and the browser lock is the CM-lock substrate.
- **R7 — Customer-install live AI round-trip. RUN 16 Sep 2026, PROVEN, AND IT FOUND THE BUG IT EXISTED TO FIND.** Packaged proxy (server.mjs, LICENSE_MODE=offline, Safety Lab public key, Waqas's Anthropic key) + the web dist configured by customer-install/configure.js against the throwaway DB, driven by headless Chromium: license gate -> signed .lic accepted -> sign-in -> ONE agreement modal (SL-EULA-0004-A) -> AiClient.messages() through the proxy to Anthropic -> answer back (200). FOUND: every AI call on every customer install was a 401 "Token not recognized" — slab_license wrote a 'signed:<id>' MARKER into the token slot and getLicenseToken() sent that as the bearer, while the offline proxy verifies the signed BLOB. Fixed 4fedb7e (getLicenseToken returns the blob on a customer install; notify_agents goes through the same accessor; regression_customer_ai_bearer, mutation-proved). Export-control fence proven on the same path: project marked controlled -> client refuses, nothing leaves the browser. Also found: (a) Anthropic now refuses org-level keys without anthropic-workspace-id — proxy gained ANTHROPIC_WORKSPACE_ID (proxy fc0f9e1), guide section 6.2 must say "create the key inside a Workspace"; (b) the web app on a customer install still loads d3 from d3js.org and a lib from cdn.jsdelivr.net, and SLConfigEgress() does NOT list them, so guide section 7.2 ("lists every address the application will contact") is not true and an air-gapped install would break — vendor them into dist as pull-web.sh already does for the desktop; (c) guide section 4.3 never says WHERE to put the slab_env.js script tag (answer: before slab_config.js). NOT exercised this run: a UI-level feature draft (the AFHA/assistant controls were not reachable by the headless driver in the time spent) — the choke point every feature uses was, so the credential/transport/provider path is proven; a human click-through of one FHA draft on the reference install is the remaining step. Fix is committed AND shipped. **Re-checked 28 Sep 2026:** finding (b) is CLOSED — vendor-libs.sh vendored all nine libraries on 16 Sep and `site/index.html` now serves zero external https references (checked), so an air-gapped install no longer breaks and the guide's egress list is true again. ONLY RESIDUAL: a human click-through of one FHA draft on the reference install. That click is what lifts the R15 hold on the Data Security paper.
- **R8 — Service-key rotation.** The service_role JWT sits in five db-webhook trigger definitions. Big-bang (anon key + redeploy + edge env + recreate 5 triggers) — do it choreographed with Waqas.
- **R9 — Staff AI entitlement on the proxy.** @safetylabaero.com is comped Enterprise in the app but safety-lab-proxy-deploy meters by DB rate_limit_rpm, not domain.
- **R11 — Entra client secret** for Microsoft sign-in expires ~Feb 2027. Renew before.
- **R13 — Report exports (docx/pdf) still use the old severity colours.** Severity pills are app-only by choice; decide whether exports follow.
- **R14 — Golden run 2.** Three fresh FHA draws on identical inputs after the severity fixes, judged ≥90%, then the wider thread run (systems → interdependence → MAC → CoFFE → compiled trees). Measurement data is never deleted (rule 26).
- **R17 — Electra on the proxy (from Waqas's deals file, 12 Sep).** electra.aero is comped in the app but the proxy meters by license token, so an Electra account without its own AI key drafts on Safety Lab's Anthropic bill. Decision: a proxy rule refusing comped domains without a BYO key (pairs with R9).
- **R15 — SL-WP-0003 v3.0 hold.** Written as-built ahead of the build; do not send to Boom/ZeroAvia/Aero Vodochody/Boeing until customer-hosted (R7) and the packaged AI backends are live and Waqas has eyeballed them.

## Q · Common cause analysis hardening (opened 26 Sep 2026, from Waqas's read of an external CCA hands-on guide)

Source note: the ideas below were taken from a CC BY-NC guide that forbids use in training software. NOTHING from that
PDF is to be pasted into kb_data files, prompts, docs or tests. Every item here is written in our own words and the
method is cited to ED-135 / ARP4761A (App K ZSA, App L PRA, App M CMA) and the CS/AMC clauses, never to the guide.
Census 26 Sep: cma_walkthrough (M.3.1 tailoring with required rationale), pra_library (trajectory/proximity
footprints), zsa_walkthrough (hand/foothold, maintenance access) and assumption_moat already exist; the items below
are the gaps. All are engineering-only, none touch customer data paths.

### Marketing (company voice, our own words, no text from the guide)
- **Q15 — Accident series for LinkedIn:** TWA 800, Nimrod XV230, Austrian OF111 (2004), Air France 4590, Air India
  171. One post each: the common-cause analysis that would have caught it and the Safety Lab page that runs it.
  **PROGRESS: part 1 (TWA 800) is written, illustrated and scheduled from Waqas's personal profile for Mon 28 Sep 08:00 Mountain, with the NTSB reconstruction photograph as the cover. Four remain.** Standing rules for the rest are in the memory note `linkedin-accident-series`.

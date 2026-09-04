# Open items register — requirements bucketing & fault trees

Standing register, not a dated entry. Update in place; do not let it scroll away in HANDOFF.md.
Opened 19 Aug 2026 at Waqas's request ("log these as open items in the handoff").

Rationale for the design decisions behind most of these lives in
`WORK_PACKAGE_MAC_CoFFE_Structured_Trees.md` (the full-context read — MAC, CoFFE, interdependence,
and the single ordered build list), `UPGRADES_Requirement_Bucketing.md` (U-1 … U-7) and
`BUILD_SPEC_Structured_Nodes_and_Bucketing.md`.

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

## H-9 — CLOSED 31 Aug 2026: invitation email is delivered, end to end

Proven live, not asserted. First real invitation reached an external Gmail inbox:
Resend id 4f4ce081 to etchetoghetto@gmail.com, status **Delivered** on the Resend
dashboard, `notification_log` row kind='invite' status='sent'. A second copy to
waqas.nafees@safetylabaero.com delivered at the same moment. NOTIFY_FROM_EMAIL is
therefore a verified sender, and the onboarding@resend.dev trap the notify-signup
header warns about does NOT apply here.

Getting there took two edge-function defects that only running it could surface —
both now recorded in the notify-invite header:
  [v1] NO CORS. The browser preflights cross-origin; v1 answered OPTIONS with 405
       and set no Access-Control-Allow-Origin, so the request died in the browser
       before reaching any code. supabase-js calls that "Failed to send a request
       to the Edge Function", which reads like a missing function — it sent us
       auditing RLS and grants that were correct throughout. Worst property: the
       notification_log write is INSIDE the function, so a preflight failure
       leaves no trace anywhere at all.
  [v2] SUPABASE_ANON_KEY IS NOT INJECTED in this project. The caller-scoped client
       was built with an empty key, getUser() failed, and the function returned its
       own 401 — indistinguishable from the gateway rejecting the JWT. v3 validates
       the token with the service-role client (auth.getUser(jwt)) and checks
       membership explicitly; the anon key was never needed.

## H-10 — CLOSED 31 Aug 2026: edge function sources are in git, CORS is covered

All SEVEN deployed functions exported byte-for-byte from the live deployment into
`supabase/functions/<slug>/index.ts` with a provenance README (the deployed function
stays authoritative until someone redeploys from that directory).
`regression_edge_function_cors` (27 checks, 5 mutations red) DERIVES the browser-invoked
set from `site/` on every run — `functions.invoke('x')` and `functions/v1/x` — so a new
client-called function is covered the day it is added rather than the day someone
remembers to edit the suite. The sharpest check is ORDER: v1 did have a method guard, and
an OPTIONS branch placed below it is dead code with the headers still in the file looking
correct; mutation M3 is exactly that shape and goes red.
Census: only notify-feedback and notify-invite are browser-called, and they are precisely
the two that carry CORS. The other five are webhook/cron driven. Consistent, not accidental.

### Superseded original entry

notify-invite (and the notify-* family before it) exist only as deployed functions
in Supabase; supabase/functions/ holds no source. For a product that sells
auditability and deterministic regeneration, the code that emails customers should
be in the repo and diffable. There is also no regression coverage for the CORS
preflight, which is the defect that cost the most time tonight and would silently
return the moment someone redeploys from a fresh copy. Task: export the deployed
sources to supabase/functions/<slug>/index.ts, commit, and add a check that every
browser-invoked function answers OPTIONS and sets the CORS headers.

## A · Requirements bucketing

### Landed
- **A2 + A4** — **SHIPPED 19 Aug 2026 (66.36).** `genFTAEvents` files each NODE by
  `SLNodeIdentity.resolveOwner` instead of inheriting the page's bucket, and a row whose owner has
  moved is **migrated in place** — the row changes store AND its `reqSource.sourceId` prefix in one
  operation, keeping `internalId`, verification status, verification evidence and manual edits.
  The fail-safe from 66.27 is preserved: a `systemId` that resolves to no system falls back to the
  page's bucket, never to nothing. `fta-interval` migrates with its `fta-event`.
  **Posture, ruled by Waqas: previewed and confirmed, never silent** — `planBucketMigration()` is
  pure, `applyBucketMigration()` runs only from an explicit click on its own control (deliberately
  NOT part of "Accept all"), and the decision is recorded in `reqSource.rebucketed[]` as an
  attributed sentence in the active voice. `generate()` no longer double-reports a pending move as
  a new row plus an orphan.
  **VERIFIED LIVE on the deployed build, 19 Aug.** A2 is a no-op on Aeolus HL-1 as it stands —
  182 nodes, 0 with `node.identity`, 0 existing auto-reqs, and the 7 transfer gates it does have
  carry no children, so every requirement-bearing node still resolves through the page fallback.
  `generate()` returns exactly the pre-deploy counts (ac 5 · FCS 5 · PRP 12 · EPS 6, 0 orphaned,
  0 migrations). Rows begin to move only as the drawer is used. Max movers today: 5.
  Exercised end-to-end in the page against a temporary in-memory fixture: declaring a leaf to
  another system produced ONE pending move (not a new row plus an orphan), and applying it moved
  the row, rewrote the prefix, and preserved `internalId`, verification status, evidence and the
  manual-edit flag. Fixture restored in the same script; nothing saved.
  *Still to build on top: A3 (consumer-side L2 interface requirements) — a declared resource already
  buckets to its provider, but the consumer rows are not generated.*
- **A1** — **SHIPPED AND VERIFIED LIVE 19 Aug 2026 (66.38).** `unownedPages()` now reaches a person: **INV-49**
  (`sev: 'hard'`) in the cross-artifact invariants registry, so it renders in the integrity panel and
  is stamped into the evidence package. No new UI, no new data model. Each failure names the page,
  the reason it did not resolve, and that its requirements are filing into the aircraft bucket.
  Hard rather than advisory because the *handling* is deliberately forgiving — an unresolved page
  still generates requirements — so detection must be loud. **Deliberately does NOT flag undeclared
  NODES**: every node on every existing project is undeclared today (0 of 182 on Aeolus), so that
  would open with ~51 failures on a healthy project and train everyone to ignore the panel. An
  undeclared node is a migration state; a dangling `systemId` is a defect. U-4 is now closed.
  **Verified live:** 18 checked / 0 fails on Aeolus; with a dangling `systemId` injected in memory the
  panel renders a visible FAIL row naming the page and the bucket, then restores clean.
- **A0** — scope-filtered generators (66.27). Aircraft scope no longer emits an L3 for every event
  on every tree; system scopes no longer re-emit the same events. `unownedPages()` exported.

### Designed, not built
- **A3** — ~~One L3 in the provider's bucket at the strictest value; consumers get L2 interface
  requirements~~ — **LANDED 22 Aug 2026** (assurance 1.24, copy fix 1.25). `genFTAEvents` now
  collapses declared resources (identity.kind 'resource' with a resolving provider): ONE
  `fta-resource` L3 in the provider's bucket at the strictest allocated value across every
  consumer, rationale naming each consuming tree's allocation and the governing one; each
  resolving consumer system gets an `fta-resource-iface` L2 (Interface class, §5.3.1.8) pinning
  ITS OWN strictest assumption and cross-tracing the provider row. FAIL-SAFE kept: a resource
  whose provider does not resolve stays on the legacy per-node path — requirements never
  silently stop generating. Orphan sweep covers both new generator keys. Zero churn on real
  data (K350: 0 resource nodes — rows appear as identity gets declared). **Verified live:**
  read-only preview injection on the K350 (identity declared in memory, nothing saved) produced
  the provider row in the hyd bucket, the consumer contract in fcs, and the per-node row's
  replacement; restored clean. Live check also caught the verb-phrase copy flaw → 1.25
  ("probability THAT x fails" / "shall assume that … occurs"). Suite:
  `regression_resource_split` (24 checks, 4 mutations proven red). *Observed during the
  live check, unrelated: `ac:fha:prob:1003` shows pre-existing fingerprint drift vs the stored
  register — A8's watchers and the AutoReq updated-flag cover it on next regen.*
- **A5** — ~~DAL strictest across trees~~ — **LANDED 22 Aug 2026** (support 66.23 · misc 66.37 ·
  assurance 1.23). Two defects fell together. (1) The reactive DAL sweep cleared EVERY page and
  allocated only the ACTIVE family — measured live on the K350 before the fix: 34 pages, DALs on
  ONE (not even the active page's family). `propagateDalFromTrueRoot` is now a thin wrapper over
  `propagateDalAllRoots()`: every seeded root family allocates in one pass (5 families / 6 pages
  light up on the K350), legacy `ftaConfig.linkedFhaId` still seeds the active family only,
  no-seed-anywhere still leaves existing DALs untouched. (2) `genDALgebra`'s dedupe was
  first-seen-wins per logicalId — the register's DAL was an accident of page walk order. Now ONE
  row per shared event at the **max of the resulting DALs**; the governing tree's derivation is
  the rationale, disagreeing trees are NAMED ("reduction arguments are not merged across
  derivations — each tree's argument stands alone"), and `context.disagree` + fingerprint tokens
  appear ONLY on disagreement, so agreeing projects churn nothing (sourceId keeps the governing
  page; tie → first-walked). Suite: `regression_dal_strictest` (14 checks; 6 mutations across
  A5+A6 proven red). Durability's seed-resolution guard followed the logic into
  `propagateDalAllRoots` with a supersession note.
- **A6** — ~~Independence propagation~~ — **LANDED 22 Aug 2026** (same build). FAILURES ARE
  GLOBAL, CLAIMS ARE LOCAL. `_cmaCompromisedIndex()` (support) turns every open, signal-carrying
  CMA's linked gates into failed member PAIRS keyed by logicalId — returns `{ids, pairs}`;
  legacy bare-Set callers still work. `allocateDAL`: a gate whose children include a failed pair
  is compromised wherever the CMA was recorded — members revert to top DAL,
  `_dalCompromiseReason` names the CMA + recording gate + page and says the failure is global,
  `_probCompromised` demands the β term; a locally 'substantiated' claim does NOT survive;
  sharing only ONE member of the pair compromises nothing; Mitigated/Closed CMAs compromise
  nothing (closure restores); `suggested` rows drive nothing. `checkCMACompromise` (assurance)
  raises the matching `cma-global` AutoReq finding with a self-skip for the linked gate.
  **Verified live on the K350:** index builds `{ids:[5099], pairs:['5097|5098']}` from CMA-002;
  a detached AND gate carrying that pair (even claimed 'substantiated') comes out compromised
  with the global reason naming G-5099; a control sharing one member keeps its reduction.
  Suite: `regression_indep_global` (19 checks).
- **A11** — ~~Multi-FHA-linked pages never receive DAL seeds~~ — **LANDED 22 Aug 2026**
  (misc 66.38; unparked same day for the pre-NAV cleanup). The seed expression reads
  `linkedFhaIds[0]` first-class now (`|| linkedFhaId` fallback) — a page linked only the newer
  way seeds, the ARRAY governs when both fields exist, the legacy scalar still works alone.
  Three checks in `regression_dal_strictest` (now 17), the legacy-gate mutation proven red.
  PASA · FC-09's family lights on the K350 after deploy.
- **A7** — ~~Common resource ≠ common cause guard~~ — **LANDED 22 Aug 2026** (ccf_similarity
  1.3 · assurance 1.26; ruled: suppress + note). It was manufacturing a finding on the live
  K350: `ccfPairs()` demanded a signed disposition for `macsys:sys-prl` vs `sys-prr` — two
  MAC-COMPILED events whose coupling the model itself states. Now: the similarity detector
  SKIPS structural-vs-structural pairs (macsys:/macres: lids, MAC/lane provenance, resource
  identity — `_ccfIsStructural` exported); authored twins AND authored-vs-compiled mixes still
  flag. `checkANDCompromise`: a shared DECLARED-resource lid becomes an informational
  `shared-resource-structural` note ("modeled exactly … not a common-cause finding … the CRA
  and CMA lanes own this resource") that never compromises the independence requirement;
  undeclared shared lids keep the warning verbatim, declared CCF groups still surface. Suite:
  `regression_resource_not_ccf` (13 checks, 4 mutations proven red — including one against
  OVER-suppression of mixed pairs).
- **A8** — ~~Stale-flagging, built once~~ — **LANDED 21 Aug 2026** (`stale_watch.js` v1.0,
  SLStaleWatch). One mechanism, SIX watchers, each with its own honest consistency predicate:
  [ss] issued requirement quotes a budget the allocation has since TIGHTENED (reqSource.context
  vs the node's current value) · [asm] assumption text quotes a number looser than its FC's
  objective (heuristic quote-parse, and the flag says so) · [alpha] verification-side achieved
  P(top) moved in the HARDER direction since its baseline (first sight = baseline, never a
  flag; ack re-baselines) · [coffe] a grafted branch whose source verdict was re-classified or
  cleared · [mac] compiled MF&MS / lane trees stale against their rule, surfaced centrally ·
  [fmes] R2's FMES-adopt drift — `_fmesGroup` events whose adopted λ no longer equals the
  group's current Σλ. THE DIRECTION RULE (A9's) enforced everywhere: EASIER never flags.
  Acks are signed and value-pinned (projectConfig.staleFlags) — quiet only for the acknowledged
  value, returning the moment it moves again; never deleted. Predicates are stateless
  (recomputed per sweep) except [alpha]'s baseline (projectConfig.staleBaselines). Register
  rendered under the dashboard leading indicators (wraps updateDashboard, preserve-discipline,
  zero monolith edits). Suite: `regression_stale_watch` (22 checks, all six predicates
  behavioural; four mutations red). R2 closes with it.
- **A9** — ~~Margin as a third budget state~~ — **LANDED 21 Aug 2026** (fta_quant 66.14 ·
  budget_ledger 1.3 · ux_leading 1.2 · bindings 1.19). THE SILENT ABSORB STOPPED: constrained
  children take caps verbatim, free siblings keep their NATURAL apportionment, the gate records
  `_budgetMargin` (over-committed RED / exact / under-allocated AMBER / signed reserve /
  absorbed-by-decision) — VOTING gates included (live-found: every constrained gate on the K350
  is a MAC k-of-N; exact P(≥k) by DP, 1% band for the rare-event-inverse noise). The absorb is an
  OFFERED rebalance: `SLBudgetDecisions` records absorb / reserve / dismissed, attributed with a
  sentence, "did nothing" logged, revert keeps the record. The ledger surfaces the tri-state per
  row with the offer flow (candidates + impact preview keyed on issued-and-EVIDENCED requirements
  via reqSource/verifStatus); over-committed offers NO fake fix — it logs the review. RED fails
  the new PASA completion item (B.4.1 budget feasibility) and lands a dashboard leading
  indicator; advisory posture — nothing locks. Both suites locking the old behaviour updated
  deliberately with the supersession documented (incl. the 19 Aug quote the loosen was built
  from). Suite: `regression_budget_margin` (35 checks, real allocator + real register + VM
  render; six mutations red).
  Direction rule, kept: **a budget that got EASIER needs no action; a budget that got HARDER does.**
- **A10** — ~~Interdependence at FUNCTION granularity~~ — **LANDED 21 Aug 2026 (with B6).**
  Q.4-1 columns are now system functions (`fc§fn:<funcId>` cells, two-row grouped header); legacy
  system-keyed cells stay readable in a coarse ▣ sys column and are refined by a signed click, never
  auto-expanded. Derivations land on a function only where the data names it (trace on the function ·
  `providedByFunctions` · SFHA function key); system-only facts stay visibly coarse. `idpCell(fc,
  systemId)` keeps its aggregate meaning for every old caller; `idpContributorFns()` is the Q.4-1
  answer. AI sweep proposes on function columns only. Suites: `regression_idp_functions` (35,
  behavioural), `regression_interdep_sweep` (20, end-to-end incl. signed legacy refinement).
  **L1 closed with it (21 Aug):** SFHA rows key to their SYSTEM function — explicit `sysFuncId` on
  every form save (the form has offered functions since the pairing guard), signed re-key control on
  seed-era rows with the FCIM join as the suggestion, provenance on the row, `acTrace` untouched;
  the golden-thread SYSTEM lane names the function where the thread knows it
  (`regression_sfha_rekey`, 27 checks).
- **A11** — ~~System dropdown limited to that FC's interdependence contributors~~ — **LANDED** in
  C1: ordered contributors-already-used-first, with "+ another system…" as a permanent last list
  entry (a short list with a hidden escape is a funnel). A page with no linked FC, and a linked FC
  with no recorded contributors, both say so rather than silently listing all 20.

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

### Landed
- **B0** — `mac_lanes.js` 1.0: three lanes derived from one declaration, per function,
  Catastrophic-only, arbitration-driven malfunction lane, cry-wolf guard, `_NO_DEFAULTS` enforced by
  the wall. 51 checks.

### Built but not wired
> **Audited against the code 26 Aug 2026** (Waqas: "everything gets done tonight"). Both entries
> had gone stale when B3 and B4 landed on 21 Aug and nobody came back to this section. A register
> that overstates what is unbuilt is as misleading as one that overstates what is done — it sends
> the next person to build something that already exists. Corrected in place, with the evidence.

- ~~**B1** — Nothing consumes `mac_lanes.js`. No UI, no tree generation.~~ — **STALE, CLOSED
  26 Aug 2026.** Untrue since B3 landed 21 Aug. `lane_trees.js` (pinned `?v=1.2` in index.html)
  reads `SLMacLanes` at seven call sites and generates the three top-event trees from one MAC
  declaration; `stale_watch.js:185` reads `SLLaneTrees.status` for the [mac] watcher, so the
  wiring is surfaced centrally too. `mac_lanes` is additionally referenced from
  `misc_fn_modules.js`, `fn_resolver.js` and `helpers_modules.js`. There is UI (the desk on the
  MF&MS panel) and there is tree generation. **Nothing to build.**

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
- **B3** — ~~Tree generation from the lanes~~ — **LANDED 21 Aug 2026** (`lane_trees.js` v1.0,
  spec = ARP4761A Figure Q.4-1, supplied as screenshots). One MAC declaration generates THREE top
  events (total loss / partial loss / malfunction — three conditions, three severities, three
  pages), each bound to its own classified condition via the FCIM TL/PL/M ids, **worst-case row
  only** (Waqas: "fault trees will only be for the worst case"). The TL tree is the Q.4-1 shape:
  availability gate (MAC breach structure; members become FF branches of own-loss OR resource
  routes) + signed CoFFE malfunction residue OUTSIDE it (the FF5.3 position). CRA feeds
  structurally — one SHARED resource event per (resource, mode), same logicalId under every
  serving branch (the AGS.MF ×2 pattern), system-level linkage visibly coarse; interdependence
  contributors no clause covers are NAMED findings, never invented branches. Ids from the
  numbering engine (makeSharedId — stable across regenerates; hardcoded prefixes only when the
  engine is absent). Regenerate-as-diff on per-lane fingerprints over EVERY feeding lane.
  Verification, restated for the enriched tree: [1] skeleton cutsets ≡ lane sets (BDD, routes and
  residue stripped) and [2] every resource event sits under exactly the branches the declared
  data serves. Desk on the MF&MS panel (wraps `renderMfmsPanel`, zero monolith edits). Suite:
  `regression_lane_trees` (30 checks, executable against the real breach arithmetic, BDD and
  numbering engines, on the Appendix Q decelerate-on-ground fixture — the weighted clause
  WBS×3+{GSS,TRS,FLS}×1 floor 3 reproduces the Q.4-1 AND exactly).
- **B4** — ~~CoFFE consumes MAC~~ — **LANDED 21 Aug 2026** (helpers 2.47 · misc_fn 66.36).
  The prune now fires on MODEL-computed YES singles (was signed-only; with 0 signed it never
  fired) — a signed NO stays authoritative and un-prunes its pairs. The panel folds
  model-answered cases behind an expandable derived section ("n answered by the MAC model —
  x breach · y survive"); the elicit table carries ONLY malfunction cases, cases touching a
  system no MAC clause models (their computed "survives" is vacuous and annotated "outside the
  MAC model"), and live signed-vs-computed disagreements. `coffeConfirmDerived` (B2, shipped
  but unreachable) gained its "sign derived" button; derived signatures render their
  provenance. Unmodelled systems are called out by name above the table. Case numbers are
  positions in the full walk, stable across sections. Suite:
  `regression_coffe_consumes_mac` (22 checks — behavioural prune checks plus a VM render of
  the real panel; four mutations proven red).
- **B5** — Malfunction lane supports `voting` and `none` only. **Self-checking / cross-comparison
  pairs undecided** — a single erroneous unit is passivated, so the defeating combination differs.
- **B6** — ~~`clauses[].of` holds system ids~~ — **LANDED 21 Aug 2026 (with A10).** `fn_resolver.js`
  v1.0 (`SLFnResolve`) is the classifier `mac_lanes` was designed for; the MAC editor offers system
  FUNCTIONS grouped by system (no bare-system fallback); `validateMembers` is wired in the rules
  table, every bare-system member renders a finding with a signed, previewed re-point that migrates
  clause membership, weights, fidelity basis and the arbitration set, recorded in `rule.repointed[]`.
  Measured before building: all 98 real customer projects carried ZERO mac rules and ZERO idp cells —
  every legacy member lives in demo copies, which show their findings until the demos rework reseeds
  them (ruled 21 Aug: let them show). Suite: `regression_fn_granularity` (30 checks). Live-verified
  on K350 in the deployed tool, fixture-restored.
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
- **C1** — **Structured node creation. SHIPPED 19 Aug 2026 and verified on the deployed build.**
  `node.identity = { kind, systemId, functionId, fcId, itemId, effectId, modeIds, resourceId,
  providerSystemId, textOverride, declaredBy, declaredAt }`. Kinds: functional · item ·
  resource · human · external · devError (never quantified) · undeveloped. ONE `html(node)` builder,
  TWO mounts — the creation dialog (`#ni-modal-body`) and the properties drawer
  (`#config-identity-host`), which is also the migration surface for legacy free-text nodes. Gates
  are offered **Functional only** ("logic only, inherits from above") — a gate is how failures
  combine, never a thing that fails. Rules live in `node_identity.js` (`resolveOwner`,
  `crossesBoundary`, `sweepTree`); the editor never reimplements them. A **resource node carries two
  owners** (provider + consumer) and they are never collapsed. Boundary rule is asymmetric: an owner
  appearing where the parent had none **is** a crossing.
  Name field and display override removed per Waqas — *"the name would be the failure condition
  itself."*
  **Still to consume:** nothing downstream reads `node.identity` yet. That is A2.

### Not built
- **C2** — ~~Allocation leaf = item + effect; verification mirror decomposed into modes~~ —
  **LANDED 22 Aug 2026** (`mirror_modes.js` v1.0 · helpers 2.48 · stale_watch 1.1; three postures
  ruled by Waqas: OR gate + mode children · controls on the FMES page AND the node panel ·
  coordinate LOCKSTEP, twin wins). `SLMirrorModes`: `decompose()` turns an adopted mirror leaf
  into an OR gate with one basic event per contributing FMEA row at λ = the row's rate
  (α = its share of Σλ; α shown in the node panel), each child inheriting the twin coordinate
  plus its OWN modeIds — the one mirror-side identity field; `recompose()` folds back at the
  group's CURRENT Σλ (last-known + warning when the group is gone);
  `syncMirrorIdentity()` lockstep runs on node select, on every ownership sync, and at the
  moment of decomposition (mutation-caught: children must stamp the twin's CURRENT coordinate).
  NOT auto-FMEA: modes come only from the authored FMEA piece-part rows fmesGroups() already
  rolls up. C3 enforced: decompose REFUSES allocation pages even when fully adopted
  (mutation-proven after the first fixture masked a dead guard); the DAL sweep and AutoReq
  already skip verification pages — wiring-checked. CLONE FIX: `_cloneSubtreeForVerification`
  deep-copies identity — the twins were sharing ONE identity object by reference, so a
  verification-side modeIds edit would have contaminated the allocation twin and tripped its
  closure block. R2's [fmes] watcher learned the decomposed shape: Σ(mode children λ) vs the
  group's current Σλ, with GONE and re-decompose messages. Suite: `regression_mirror_modes`
  (31 checks, 5 mutations proven red). Durability tag count 208→209; stale_watch pin regex
  became a floor (rule 12).
- **C3** — **No mode-level targets, ever** (ruled). Mode contribution and sensitivity stay
  verification-side analysis that informs design; never allocated, never a requirement.

### Ruling needed
- **C4** — **When does the closure block switch on for legacy projects?** **RULED 19 Aug 2026:
  STAY PARKED until the demos rework is real.** Aeolus is being reworked and Halcyon may follow, so
  the migration burden this ruling prices will look different afterwards; deciding now would price
  the wrong thing. Do not re-ask before the rework lands. Options when it does: (a) on immediately,
  (b) grandfather nodes created before the feature, (c) a per-project switch, optionally with a
  readiness count. Measured 19 Aug: **0 of 182 Aeolus nodes carry `node.identity`** and there is no
  bulk-declare surface, so (a) is a migration burden with no tooling behind it.

---

## Suggested order (revised 19 Aug, after C1 shipped)

0. ~~**Runtime smoke gate in `ship.sh`**~~ — **LANDED 19 Aug (66.37).** See the note at the top.
1. ~~**A2 + A4 together**~~ — **LANDED 19 Aug (66.36).** See section A.
2. ~~**A1** — surface `unownedPages()`~~ — **LANDED 19 Aug (66.38).**
3. ~~**B6 + A10** — the system-id → function-id migration~~ — **LANDED 21 Aug 2026,** L1 and the
   golden-thread SYSTEM column with it. See sections A and B.
4. ~~**B3** — tree generation from the MAC lanes~~ — **LANDED 21 Aug 2026.** See section B.
5. ~~**B4** — CoFFE consumes MAC~~ — **LANDED 21 Aug 2026.** See section B.
   *New (21 Aug, from the FHA line-up check against the Appendix Q example):* **FHA-G** —
   ~~group same-FC-ID phase rows~~ — **LANDED 22 Aug 2026** (helpers 2.50). `_fhaGroupRows`
   (pure, render-order only — the store is untouched) clusters same-fcId rows at the first
   member's position; the head wears a "phase group × N · worst <sev>" badge whose tooltip
   teaches the App Q pattern and that the fault trees take the group's worst case (B3 ruling);
   members render as └ continuations; every row's menu offers "⧉ Add phase variant" —
   `acFhaAddPhaseVariant` inserts a sibling under the SAME fc id right after its source, phases
   blank for the engineer, effects/severity/assumptions carried as a starting point, saved and
   toasted. Empty fcIds never group; pagination renders the grouped order over the full store.
   Suite: `regression_fha_group` (17 checks, 3 mutations proven red). AC workbook only for now —
   the SFHA gets it when a system-level need shows up.
   *Also closed 22 Aug — the "session expiry" pattern:* NOT a defect. `auth_gate.js` has a
   deliberate 20-minute idle lock ("Signed out after 20 minutes of inactivity", every session,
   no exemption, pre-logout warning, local-scope signOut per 66.12). The four drop-outs during
   the 22 Aug live checks were the lock working: CDP-driven automation fires no DOM activity
   events, so long build stretches read as idle. No code change; the live-check protocol now
   knows to expect it.
6. ~~**A9 + A8**~~ — **BOTH LANDED 21 Aug 2026** (A8 closes R2 with it). See section A.
7. ~~**A3 / A5 / A6 / A7**~~ — **ALL FOUR LANDED 22 Aug 2026** (see section A). *New from the
   A5 live verify:* **A11** — the linkedFhaIds-only seed gap (see section A; parked 22 Aug).
8. ~~**C2** — the allocation/verification mirror.~~ — **LANDED 22 Aug 2026** (see section C).

Separately outstanding: the **NAV overhaul** (`NAV_V2_PLAN.md`, mockups in `docs/nav_*.html`), and
the **demos overhaul** — Aeolus is being reworked, the measured numbers above are a snapshot, and
the section-D allocator carry-overs were scrapped on 19 Aug for the same reason.

---

## E · Durability

### Landed
- **E1 parts 1 + 2 — LANDED 26 Aug 2026** (data_ops 66.16 · helpers 2.51 · bindings 1.25).
  Waqas first deferred this to after the Radia demo, then reversed and ruled it built the same
  night. **The guard is deliberately narrow: during boot recovery only, an empty snapshot never
  overwrites a stored one that has content.** Content-bearing writes are untouched on every path
  at all times; outside the recovery window behaviour is byte-for-byte what shipped, so
  `createNewProject` and any other deliberate blanking still persist exactly as before.
  · `_autosaveRecoveryPending` / `_autosaveRecoveryTimer` / `_autosaveStoredHasContent` declared in
  bindings; `_recoveryHoldBegin` / `_recoveryHoldEnd` bracket `checkAutosaveRecovery`, releasing on
  BOTH promise outcomes plus a 12s backstop.
  · **Kept separate from `_autosaveSuspended` on purpose, after trying the blunter version first:**
  `_applyProjectData` sets and clears that flag in its own try/finally and schedules the
  migration-recording write from it, so reusing it re-opens the window early AND swallows that
  legitimate write when `SLIdle` is absent. A guard that only ever refuses ONE write also cannot
  strand autosave the way a general suspend can.
  · Emptiness is judged from the snapshot OBJECT with the same `_autosaveHasContent` the restore
  path uses — not by re-parsing the payload, which on a 4.5 MB project would cost more than the
  write it guards. The verdict is cached (`_autosaveStoredHasContent`), seeded by recovery, updated
  by every write, cleared by `discardAutosave`, and lazily read once if still unknown.
  · Suite: `regression_autosave_e1` — 33 checks, all EXECUTED against the real `_writeAutosave` and
  the real `_autosaveHasContent` over a fake storage layer, never pinned as source text (six hours
  earlier a source-shape pin let a dead feature pass the whole wall). **13 mutations proven red,
  including M1 = the exact pre-fix code.** Wall 187 suites, 0 failing.

- **E1 part 3 — LANDED 26 Aug 2026, same night** (data_ops 66.17 · helpers 2.52 · bindings 1.26),
  after Waqas ruled "everything gets done tonight". I had argued against it on cost grounds; the
  objection was to mirroring EVERY save, and **throttling answers it** — so the objection is
  withdrawn, not overruled.
  · `LASTGOOD_KEY` / `LASTGOOD_META_KEY`, written at most once every `LASTGOOD_MIN_INTERVAL_MS`
  (120 s) and ONLY from a snapshot that has content. The already-serialised payload is reused —
  the expensive part of an autosave is the stringify, and it has happened by then. Cost at steady
  state is one extra `setItem` per two minutes, not per save.
  · Covers the case parts 1+2 do not: **content→content shrink**, where a project loses most of its
  rows and saves over itself. That result passes `_autosaveHasContent`, so the refusal never fires.
  · Recovery **offers, never restores silently**: an empty primary plus a good last-good raises the
  recovery banner — built and unreachable since silent recovery landed — naming the snapshot's age.
  Silent restore was considered and rejected: an empty current slot is also what a genuinely NEW
  project looks like, so quietly resurrecting the old one would replace the user's new work with
  old work, which is this item's own bug wearing a hat.
  · "Dismiss" closes the banner and **keeps the snapshot**. A backup is not deleted by a click that
  means "not now". (Consequence, accepted: after `discardAutosave` the offer can appear on the next
  load. Non-destructive and dismissible, so it stays.)
  · The mirror can never break the save it backs up — content-gated, self-swallowing, and wrapped
  at the call site.
  · Suite grew to **53 checks, 11 further mutations proven red.** Two survived the first pass and
  both were real gaps in MY checks, not in the code: the throttle assertion compared timestamps
  that collide inside one millisecond (now asserts on mirrored CONTENT), and an `onRejected` arm
  that was **dead code** — the upstream `.catch` already converts a rejection to a value. The dead
  arm was deleted and replaced by a behavioural check that a rejected IndexedDB read still closes
  the recovery window. A third fell out of the same pass: one of my part-1 checks was itself a
  source-shape pin, and it broke on a refactor while the behaviour stayed correct — replaced with
  an executed check. Wall 187 suites, 0 failing.

- **E1 — still open: WHY recovery failed to fire on 26 Aug.** Unanswerable post-hoc (both copies
  were blank by the time it was investigated). The leading candidate is the race the hold now
  closes. If a blank-on-refresh is ever seen again, the `[E1] refused to overwrite…` console line
  is the marker that the guard caught it, and the stored project will still be there.

### Was: ruling needed
- **E1 — AUTOSAVE OVERWRITES GOOD LOCAL COPIES WITH AN EMPTY PROJECT.** Data-loss defect,
  reproduced live 26 Aug 2026 (22:16 UTC) on the deployed build. A page reload came back to a
  blank project; within seconds BOTH local copies had been overwritten with the blank state and
  the work was recoverable only from the cloud.

  **Measured, not inferred.** localStorage `safetyLab.autosave.v1` — 4,823 B, all row counts 0,
  meta ts 1787782620560. IndexedDB `safetyLab.autosave.v1` — 5,056 B, blank, meta ts
  1787782702724 (i.e. IDB was overwritten LATER than the mirror, so it was not lagging behind
  with good data). Session immediately before the reload: 19 functions · 32 FCIM rows ·
  114 extracted conditions · 38 FHA rows · 11 fault trees · 18 ZSA rows · 1 source doc.

  **The asymmetry, which is the whole bug.** `_autosaveHasContent(parsed)`
  (helpers_modules.js:10327) is the predicate for "is this snapshot worth anything" —
  any FHA row, any requirement, any fault tree with a root, or any system. `checkAutosaveRecovery`
  (data_ops_modules.js:764, 776) consults it on the way OUT and correctly declines to restore an
  empty snapshot — verified live against the current blank state, returns `false`.
  `_writeAutosave` (helpers_modules.js:10593) consults it on the way IN **never**: its only guard
  is `if (_autosaveSuspended) return;`. So the app knows how to recognise an empty snapshot, and
  uses that knowledge only to refuse READING one — never to refuse WRITING one over a good one.

  **Why recovery did not fire is a separate, still-open question** and cannot now be answered
  post-hoc (both copies are blank). The leading candidate is a race: the IndexedDB recovery path
  is `.then()`-async and `_autosaveSuspended` is not held across it, so a blank-state autosave can
  land before the restore resolves. `_autosaveSuspended` is set for project load and sample load
  (data_ops_modules.js:833/909, helpers_modules.js:7895/7919) — not for recovery.

  **Proposed fix, three parts, smallest first:**
  1. Hold `_autosaveSuspended` until `checkAutosaveRecovery()` has fully resolved, IndexedDB
     fallback included. Closes the specific race that produced this.
  2. In `_writeAutosave`, refuse the overwrite: if the new snapshot fails `_autosaveHasContent`
     and the stored one passes it, write to a `safetyLab.autosave.lastgood.v1` slot instead.
  3. Stop treating a single overwritable slot as a backup — keep the last good snapshot beside
     the current one, and surface it in the existing recovery banner (`_showRecoveryBanner`,
     already built, currently unreachable on the silent-recovery path).

  **Not a customer-visible regression from any recent batch** — the asymmetry is long-standing.
  It is filed here because a refresh at the wrong moment silently destroys both local copies, and
  the recovery feature is the thing that destroys them.

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

- **F17 — NO HAND EDITOR FOR THE ARBITRATION SCHEME (found 4 Sep 2026 while fixing F16c).** `rule.arbitration`
  {scheme voting|none, k, of} is read by mac_lanes and reported by lane_trees, and the MAC drafter
  can now propose it from the document — but no panel lets the engineer DECLARE or SIGN it by
  hand (helpers only re-points members). Until the MAC page has an arbitration control (scheme,
  k, members, citation, signature), an AI-proposed scheme cannot be confirmed in the product and
  a document that is silent leaves the malfunction lane underivable with no way to fix it on
  screen. One panel change; the store shape already exists.

- **F16 — FIXED a–d 4 Sep 2026 (evening batch: interdep_ai 1.2, misc 66.55, lane_trees 1.3,
  ai_assistant 76.54, ai_skills 2.11 / mac.draft v2, loader 8.46); e and f remain.** (a) the
  sweep's reply was cut off at maxTokens 1200 with 27 candidates per condition and the parse
  failed silently — budget now sized to the candidate count, cut-off replies salvaged and
  REPORTED as failures; (b) `_coffeTokSys` resolves configuration items to their owner system
  and `idpFindings` treats a contributor as covered when a member belongs to its system; (c)
  `add_mac` accepts `arbitration` from the document only, never guessed, malformed dropped and
  reported; (d) a batch whose replies were unreadable, or valid with no actions and no words,
  now says so — the harness records the reason. Original entry follows.
  RUN 2 FINDINGS (4 Sep 2026, evening; the full thread's first pass).** (a) The
  interdependence sweep made 25 calls and landed 0 proposals — undiagnosed; inspect the raw reply
  and the colId echo in `interdep_ai.js` before run 3. (b) `lane_trees` `idpFindings`/coverage do
  not treat a configuration item that is a MAC member as covering its owner system's functions —
  `idp-uncovered` on every one of the 33 pages. (c) The MAC drafter proposes no `arbitration`
  scheme — `lane-mal` "No arbitration scheme declared" everywhere. (d) FMEA declined with no
  reason (goes with F13). (e) CoFFE residue was 1,389 cases; the lane needs a cap or a smarter
  residue before it runs unattended. (f) The run 2 export is in Downloads, not yet under
  `eval/runs/goldens/`; 8 sub-functions have no MAC rule. Fix a–d in one pass, then run 3.

- **F15 — BUILT AND RUN 4 Sep 2026 (arch.systems, arch.items, mac.draft, coffe.draft; THREAD
  compiles trees). Kept for the design record; what it found is F16.** Original entry: THE FULL
  THREAD BEFORE RUN 2 (Waqas, 4 Sep: "wait for the full MAC/CoFFE"; "the thread
  should run CoFFE interdependence and MAC").** Trees must be COMPILED from interdependence + MAC +
  CoFFE (+ CRA) — `SLLaneTrees.compileAll()` — not drawn by the AI synthesiser, so tree logic is
  identical run to run. Build order: (1) systems + system functions from the SDD through the
  harness (`add_system`, `decompose` needs a system-scope handle under capture — today the picker
  auto-selects Aircraft); (2) interdependence sweep (`idpAiSweep`) as a thread step; the harness
  asserts the model's proposals so downstream can run (testing only — a proposal is never a review
  in production); (3) MAC drafter — NEW lane: per aircraft sub-function and phase, clauses of system
  functions with min-of, from the SDD's redundancy statements; lands as `macModels` entries with
  `substantiation.kind='assumption'` carrying the SDD citation, engineer flips to 'sdd'; eval-gated
  (changes what the trees measure); (4) CoFFE residue proposer — NEW lane: yes/no + result text for
  the cases the MAC cannot compute (malfunction cases, unmodelled systems); lands as verdicts by the
  model; (5) thread step 'trees' becomes compileAll(); FMEA then runs (systems exist). Score trees
  two ways: shape identical (yes/no per condition) and node names same-meaning (judge).

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

- **F10 — SHIPPED 3 Sep 2026 (ai_assistant 76.39), listed so the campaign machinery's state is on the register too.** A refusal is a result:
  `_captureBail` + `_captureGuard` on the 17 public lane entry points, plus a guard on
  `_fmeaSystemPicker` (the sixth picker — the 76.38 sweep matched `_open*Picker` and missed it).
  99 toast-and-return guard clauses resolved no capture, so a lane refusing early hung a campaign
  for its full timeout: three FMEA runs burned 901 s each to report "no panel opened" when the lane
  had already refused, correctly and in milliseconds — `ppfmea` is not in that project's programme
  scope, so the opt-in gate turned it away before any model call. `regression_capture_bail`, 30 checks,
  14 executed. Inert when no capture is armed.


---

## H · Cloud persistence (opened 31 Aug 2026, data-loss fix session)

- **H-1 — BUILT 31 Aug 2026, SURVEY-ONLY UNTIL ARMED** (`site/crdt_gc.js` v1.0 + a ledger
  written by crdt_sync 1.6). Four conditions must all hold before a doc is dropped; the
  one that matters is rule 4 — a failed or empty accessible-project query classifies
  NOTHING (mutation M1: remove it and every doc on the machine comes back "drop").
  Docs predating the ledger are never dropped on ledger grounds: absence of evidence is
  not evidence of a sync. **Waqas to arm** with localStorage `SLA_CRDT_GC='1'` (or
  `?crdtgc=1`) after reading one real survey line in the console. `regression_h1_crdt_gc`,
  23 checks, 6 mutations red incl. over-suppression. Original entry:
- ~~**H-1 — CRDT IndexedDB leak:**~~ ~360 `slab-crdt-<projectId>` IndexedDB databases on Waqas's
  machine, one per project ever opened, never pruned. Unbounded local storage growth; each is
  also a stale-state reservoir (mitigated by the 66.45 adopt-model posture, not removed).
  Candidate: prune docs for projects deleted or untouched for N days, or key a generation into
  the db name on authoritative loads.
- **H-2 — APPLIED AND LIVE-VERIFIED 31 Aug 2026.** Signed off by Waqas and applied via the
  Supabase MCP. Verified with rolled-back probes on production, not assumed: the trigger is
  BEFORE; a stale client writing version 1 over version 1 was rewritten to 2; a normal forward
  write 1->6 was left exactly alone; `sl.restore='on'` still bypasses so the recovery RPCs are
  unaffected. Original entry:
- ~~**H-2 — READY, AWAITING SIGN-OFF (31 Aug).**~~ `supabase/migrations/20260831_version_monotonic_guard.sql`
  now carries the COMPLETE `create or replace`, generated from the live
  `pg_get_functiondef` — not a patch fragment, per the drift lesson H-8 just re-taught.
  The only change against what production runs today is the block marked `[H-2]`,
  placed last: after the archive block (so the snapshot banks with OLD.version intact)
  and BELOW the shrink refusal (a save that is going to be refused must not get its
  version quietly bumped on the way to raising). Nulls on either side are left alone —
  a missing version is a different defect and inventing a number would hide it.
  **Waqas's call to apply.** Original entry:
- ~~**H-2 — DB version-monotonicity guard:**~~ client fix shipped (66.45/2.57/1.6) but wild tabs
  still regress `project_documents.version` until reloaded. Proposed trigger amendment drafted
  in `supabase/migrations/20260831_version_monotonic_guard.sql` — rewrite, not refuse. Awaiting
  Waqas's sign-off to apply to production (direct-apply + SYNC NOTE, per the 20 Aug pattern).
- **H-4 — orphan empty-project minter (intermittent, pre-existing):** an empty "Untitled Project"
  row is occasionally provisioned right after New Project (6eeca9a7 31 Aug; c29d1d96 + four
  others earlier). The manual-save path provisions without a content guard by design; some caller
  reaches it in a race. Did not reproduce under instrumentation. Candidate: content-guard the
  manual provision too, or find the caller with a persistent stack hook.
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
- **H-6 — LANDED 31 Aug 2026** (helpers 2.61), and it was bigger than filed: snapshots
  already carry numberingScheme AND numberingStore, and `_restoreProjectSnapshot` read
  NEITHER — so a cloud load kept the OUTGOING project's counter store, not merely an
  unseeded one. Fixed in `_restoreProjectSnapshot`, which covers `_loadCloudProject` and
  `_applyServerRestore` together. `regression_h6_numbering_cloud_seed`, 20 executed
  checks, 3 mutations red (M1 = the exact pre-fix code). Original entry:
- ~~**H-6 — numbering counters not seeded on cloud load:**~~ `_slSeedNumberingFromExisting` runs on
  the projectConfig-restore path but NOT in `_loadCloudProject`, so a cloud-loaded project mints
  from FC-001 regardless of existing rows — collides when a project's rows start at FC-001.
  Observed live 31 Aug on db0b5a9e (rows FC-198+, scratch mint gave FC-001). One-line candidate
  fix in _loadCloudProject + seed check in the suite. (Mitigated for AI FHA rows by the FCIM
  carry-forward, 75.3 — minting is now the fallback, not the norm.)
- **H-4 status update (31 Aug):** ROOT-CAUSED AND FIXED in cloud_sync 1.7 — _hasRealContent
  counted the blank seeded FTA page as content; now requires a rooted page.
  **VERIFIED BY CONTENT 31 Aug, and the verification earned its keep.**
  · SIX are genuinely empty — 0 FHA / 0 functions / 0 requirements / 0 systems, one unrooted
    FTA page, ~2.2–2.7 KB — and ALL SIX already carry `deleted_at = 2026-08-30 15:04:02`,
    so they are already invisible to the app. A hard delete is optional housekeeping, not a
    fix: c29d1d96, 6eeca9a7, 328f5eb2, ef3209c5, 324d1ea0, 2dc39080.
  · **2eb7e186 IS NOT AN ORPHAN AND MUST COME OFF THE LIST.** 101 FHA rows, 18 functions,
    117 KB, 16 saved versions, `deleted_at` NULL — a live project with real content. Its
    18/101 shape matches the Aeolus golden, so it is most likely an eval run, but that is a
    guess and the rows are real. Deleting it would have destroyed 101 FHA rows.
    This is exactly why the original entry said "verify each is empty by content first".
  · No production rows were deleted. Hard-deleting customer data is Waqas's to run.
- **H-3 — DONE 31 Aug:** swept in the 27-project cleanup (f7a7bda2 deleted with the rest; list + content-resolution record in HANDOFF). Superseded:
- **H-3 (old) — repro pollution:** measurement project f7a7bda2 (g5 t3 fullsession) holds 120 SYN-*
  synthetic rows at version 1 from the 31 Aug repro; history v1-v3 intact. Restore v3 via
  Version History or delete with the measurement-project cleanup batch. Cleanup also gets:
  914f7002 (313-row g5 duplicate, old-build gap 31 Aug) and 6eeca9a7 (empty orphan).

- **H-7 — LANDED 31 Aug 2026.** Ruled by Waqas: **admin/owner only, archive (reversible)**.
  `20260831b_project_archive.sql` + `20260831c` (the fix). Three layers: the UI hides controls
  from anyone who cannot use them; the three RPCs re-check admin; and a BEFORE UPDATE trigger
  refuses ANY change to `deleted_at` from a non-admin browser session, so bypassing the RPCs
  changes nothing. Archived list capped at 100 with a count — this workspace already holds 354.
  Proven live against a real editor membership (rolled back): direct update raises, RPC raises
  42501, and the same editor's ordinary name edit on the same row still succeeds.
  `regression_h7_project_archive`, 42 checks, 6 mutations red. Original entry:
- ~~**H-7 — NEEDS A RULING BEFORE CODE (31 Aug).**~~ Live RLS census settles part of it:
  `projects_editor_update` is `USING private.can_edit_workspace(workspace_id)` with no
  separate WITH CHECK, and `projects_member_read` already carries `deleted_at is null` —
  so an EDITOR can set `deleted_at` today and the row correctly vanishes from every member
  read. The soft-delete machinery exists; nothing client-side ever uses it. The open
  questions are posture, not plumbing: (1) who may retire a project — editor, as RLS
  currently allows, or admin only? (2) archive (reversible, listed under a Show archived
  toggle) or delete (a real tombstone)? (3) does a retired project keep its CRDT doc and
  version history, or are those swept? Answer those three and the build is small.
  Original entry:
- ~~**H-7 — NO project delete/archive in the product:**~~ nothing client-side ever sets projects.deleted_at, and live RLS refuses it from the browser anyway. Customers cannot delete a project. Needs an archive/delete UI + server RPC + deliberate RLS posture. (Found 31 Aug during the cleanup sweep.)
- **H-8 — LANDED 31 Aug 2026**, and the filed description understated it. The drift is not
  one policy: production keeps ALL SEVEN RLS helpers in schema `private` (SECURITY DEFINER,
  pinned search_path) and every one of its 59 policies calls them qualified, while NOTHING on
  disk creates that schema and NOT ONE disk policy qualifies a call. So (a) the three newest
  RPCs already call `private.*` and would fail on a rebuild, and (b) 0001's own header invites
  a re-apply that would create un-revoked `public` copies and repoint all 18 policies at them —
  a silent authorization downgrade. `0008_rls_private_schema_sync_20260831.sql` reconciles the
  disk (RECONCILIATION ONLY — production is the correct side, do not apply to it); 0001's
  header carries a dated supersession and its statements are left byte-unchanged as the
  historical record. `regression_h8_rls_disk_sync`, 23 checks, 6 mutations red.
  Cleared as NOT drift with evidence: 0007_config_management (unapplied by design, tables
  absent, no client references) and `public.pending_comps` (RLS on, 0 policies = service-role
  only, unreferenced).
- **H-11 — CLOSED 31 Aug 2026, but READ IT: the RLS helpers returned NULL, not false.**
  `private.workspace_role()` is NULL for a non-member, so `null in ('owner','admin')` was NULL
  and `can_admin_workspace` / `can_edit_workspace` / `can_review_workspace` /
  `is_workspace_owner` all returned NULL. Every plpgsql gate of the form
  `if not private.can_admin_workspace(x) then raise` therefore DID NOT FIRE for exactly the
  population it existed to stop. RLS policies were never affected (Postgres treats a NULL
  policy expression as false); only the SECURITY DEFINER RPCs were.
  **Proven reachable, rolled back:** a signed-in non-member passed the authorization gate in
  `public.sl_restore_project_version` against a live project owned by someone else, failing
  only on a version number that does not exist. `sl_restore_project_baseline` had the same
  shape and grant. `erase_project` had the same shape but is granted only to
  postgres/service_role — latent, not browser-reachable.
  Fixed at the helpers (`20260831c`), so every caller present and future is closed at once.
  Re-probed after: stranger gets 42501 everywhere, admin unaffected, editor correctly refused
  the archive while their ordinary edit still succeeds.
  **STILL OPEN, for Waqas:** (a) should `sl_restore_project_baseline` /
  `sl_restore_project_version` be narrowed further than editor-level now that they are actually
  gated? (b) do the access logs show this was ever exercised? I have not looked at logs.
  (c) a wall check cannot see production — worth a periodic pg_proc census for the
  `if not private.` shape, the way H-8's suite censuses the migration tree.

- **H-8b — OPEN, opened 31 Aug 2026:** `private.audit_immutable()`, `private.erase_my_account()`
  and `private.verify_signoff_chain()` also exist only in production. No POLICY depends on them,
  so the access model is now reconstructible from disk — the full database is not. Codify them
  from `pg_get_functiondef` the same way.

## DONE (1 Sep 2026) — BYO-standard: bot-side per-tenant store (built on BOT_KV)
App side shipped (user uploads a standard -> chunked into BM25 -> in-app ANEM grounds on it,
tagged 'USER:' and marked reference-not-authority/instruction; see EXPORT_RUN). The Teams BOT
still answers only from the static kb_bundle. To make the bot respond on a customer's own
standard needs a per-tenant store the worker reads at query time:
  - upload path (who uploads: the customer via app? an admin? — auth/tenancy decision)
  - storage: Cloudflare KV (simple, per-key blobs) vs D1 (queryable, better for many chunks)
  - chunk + retrieve in the worker with the SAME USER-SUPPLIED marker + no-injection posture
  - isolation: one tenant's standard must never leak into another tenant's answers
DECISION NEEDED FROM WAQAS: storage model (KV vs D1) and whether to build now. This is standing
config + backend, so not started on my own initiative.

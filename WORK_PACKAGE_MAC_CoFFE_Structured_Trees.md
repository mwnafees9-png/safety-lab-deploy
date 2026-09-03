# Work package — MAC, CoFFE, interdependence and structured fault-tree nodes

**Agreed with Waqas in discussion, 18–19 Aug 2026.** Written 19 Aug 2026 so the reasoning survives
the conversation, not just the conclusions. Nothing in section 9 is built unless it says so.

## How this file relates to the other three

| File | Holds |
|---|---|
| `UPGRADES_Requirement_Bucketing.md` | U-1 … U-7 — the *why* for requirement bucketing |
| `BUILD_SPEC_Structured_Nodes_and_Bucketing.md` | the *what* for structured nodes + bucketing + the margin/rebalance design |
| `OPEN_ITEMS.md` | the standing A/B/C register — the checklist, updated in place |
| **this file** | the MAC / CoFFE / interdependence half of the discussion, which the other three do not cover, plus the single ordered build list across all of it |

Read this one first if you are picking the work up cold. It is the only document that explains
*why MAC exists at all*, and MAC is the load-bearing idea for everything in section B of the
register.

---

## 0 · The one-paragraph version

A fault tree today is free text. Because a node is free text, nobody knows which system owns it, so
requirements bucket by whichever scope the generator happened to run in, trees cannot be proven to
be about the same conditions, and "is this event shared across systems?" is a naming coincidence.
**C1 (structured node creation) fixed the input side and is live.** The remaining work is to make
the rest of the model consume that structure: bucket requirements by declared owner, migrate
interdependence and MAC from system granularity to *function* granularity, and generate the first
cut of a tree from a MAC declaration instead of asking an engineer to draw it. MAC is the mechanism
that makes the last one possible — one declaration of *minimum acceptable capability per function*
yields three top events deterministically, which is the headstart Waqas called "a massive win".

---

## 1 · How the discussion got here

The chain, in the order it actually happened, because each link constrains the next:

1. **The observed defect.** Waqas, on the live build: *"why are we showing L3 auto req requirements
   at the aircraft level shouldnt they be in their respective system buckets?"* → U-1. The generator
   uses `scope` only to prefix `reqSource.sourceId`; the traversal is unfiltered.
2. **Which immediately became an ownership question.** You cannot bucket by owner until a node
   *has* an owner. → U-2, U-3.
3. **Which connected to the Paganini feedback** — *"how do I know if an event is being used across
   multiple systems or not?"* Same root: shared identity is currently a name match.
4. **Waqas's correction that changed the answer.** *"Interdependence table does not hold system to
   system dependencies, it holds aircraft failure condition dependency per system failure condition
   contribution; the fault trees will define common resource consumption for each of the systems."*
   That is the chain that already exists in the data — no new model needed:

   ```
   aircraft FC --(interdependence)--> contributing system FCs --> owning system function --> owning system
   ```

5. **Which produced the modal.** Waqas: *"can we potentially do fault tree node event modeling in a
   standardized way … 1 select system, 2 select system function, 3 failure condition?"* — and then
   the sharpening: **three dropdowns beat free text "because you arent thinking of new ways to
   describe failure conditions that have already been thought of."** That is C1, now shipped.
6. **Which ran into the functional/item boundary.** *"below a certain level it stops being a
   functional failure and starts becoming item failure, so we need to link that to the
   FMEA/FMES."* → node type becomes the first dropdown, item branch ends at the **effect**, modes
   live on the verification mirror only. **FMEA contributions are only relevant for verification
   trees.**
7. **Then the Appendix Q material.** Waqas walked the ARP4761A App Q worked example through
   screenshots and asked whether the tool should follow CoFFE, MAC, or both.
8. **Which produced the MAC three-lane model** (section 3) — the substantive new design of the
   night.

---

## 2 · The Appendix Q model, as Waqas framed it

*SAE material is referenced by clause number and title only — no prose is reproduced here. The PDF
is at `~/Downloads/SAE ARP4761A.pdf`; read App Q there.*

Three artefacts, and the direction of information flow between them matters more than any one of
them:

- **Table Q.4-1, interdependence.** An **aircraft** failure condition is allocated to **system
  functions**. Waqas: *"the way interdependence works is you are allocating a aircraft failure
  condition to a system function."* Note *function*, not system — our `idpCell` is system-level
  today, which is exactly defect **A10**.
- **Table Q.4-2, common resource × system function.** Which resources each system function
  consumes. Our fault trees are where that gets recorded (the `resource` node kind in C1).
- **Table Q.4-6, CoFFE.** Combinations of Functional / Degraded / Operational states across
  contributors, each combination mapped to an aircraft effect. This is the combinatorial artefact —
  and the reason it is expensive.
- The worked fault tree in the appendix is then built from the combinations that reach the
  catastrophic effect.

**Waqas's question that set the direction:** *"which combination gets you to the catastrophic
effect the fastest"* — i.e. the shortest route, the lowest-order cut set. That is what
`coffeShortestRoute` computes.

**And the numbering ruling:** *"we dont need to call them FF nodes, let the user define their own
numbering schema."* Generated node ids must come from `SafetyLabNumbering.makeSharedId`, never a
hardcoded `MAC·` / `MAL·` / `FF` prefix. (Fixed in 66.31; keep it that way in B3.)

---

## 3 · MAC — the three-lane model

### 3.1 The definition

**MAC = Minimum Acceptable CONFIGURATION.**

**The name is a deliberate switch, and this document originally got it wrong.** The industry term
is minimum acceptable *control* — control authority, as used in flight controls, propulsion and
braking. Waqas moved off it on purpose (19 Aug 2026):

> *"minimum acceptable configuration (so it was wide ranging for systems that do not contribute to
> aircraft control but can impact CSFL, example ECS) is what we were going with and it was a switch
> from the minimum acceptable control (commonly used in flight controls, propulsion, braking)."*

ECS has no control authority at all, and losing cabin pressurisation or avionics cooling is still a
CSFL problem. "Minimum acceptable control" can only speak about systems that have authority;
**configuration** generalises to any system where the question is *which set of equipment must
remain available* — which is also literally what a `min k of n` floor encodes. Earlier drafts of
this file and `mac_lanes.js` v1.0 said "Capability", which was neither term; the rest of the app
(`reports.js`, `bindings_modules.js`, `safety_lab.js`, `mac_fcim.js`, both demo showcases) has said
**Minimum Acceptable Configuration** throughout. Corrected in `mac_lanes.js` **1.1**.

**And the boundary with malfunction follows from the definition rather than from bookkeeping.** MAC
says which configurations remain acceptable. A malfunctioning unit has not lost anything — it may
be fully available and applying its full authority wrongly. So malfunction is not a point on the
configuration axis at all, which is why its lane needs a separate declaration and why a
self-checking architecture cannot be derived from a floor (open item **B5**).

Waqas's original framing:

> *"based off MAC, we should define our total loss failure condition as MAC (the degraded case that
> leads to CAT) and MAC shouldnt be by system it should be by function, similar to how minimum
> acceptable control is defined for control authority for FCS and Propulsion etc. and MAC is only
> applicable to CAT cases."*

Three constraints fall straight out of that sentence, and all three are enforced in `mac_lanes.js`:

1. **Declared per FUNCTION, not per system.** He said it twice — *"make sure mac lanes are defined
   by function"*, then *"per function\*"*. `functionOf(rule, resolve)` is the accessor;
   `validateMembers()` accepts members of kind `function` or `item` and reports a **finding** on a
   bare `system` member. A system is not a thing that has a minimum acceptable capability; a
   function is.
2. **Catastrophic only.** `scope(rule, severity)` filters to Catastrophic. MAC is the floor below
   which the aircraft is lost; it has no meaning for a Major condition. (Consequence, measured: 7 of
   22 rules on Aeolus sit on non-CAT conditions and retire under this rule.)
3. **The total-loss failure condition IS the MAC breach.** You do not separately author "total loss
   of X" — total loss is *defined* as falling outside MAC.

### 3.2 The three lanes

Waqas, in the words that were built to:

> *"partial loss is a loss within MAC limits, and malfunction needs a MAC lane that we need to
> figure out"* … *"outside mac limits is total loss, within mac limits partial loss, malfunction is
> its own lane outside MAC bounds."*

| Lane | Definition | Logic at the top |
|---|---|---|
| **Total loss** | capability falls **outside** the MAC floor | AND across the members whose simultaneous loss breaches the floor |
| **Partial loss** | capability degraded but still **within** MAC | OR across the individual members — losing any one degrades |
| **Malfunction** | **its own lane, outside MAC bounds entirely** | driven by the declared **arbitration scheme**, not by the floor |

The third row is the part that took the longest and is the part most likely to be misread later:
**the malfunction threshold does not come from MAC.** MAC tells you how much capability you need.
It says nothing about how many units have to lie before the lie is believed. That is a property of
the arbitration/voting architecture, so it is a **second declaration alongside the floor**, not a
derivation from it.

### 3.3 The worked example Waqas gave (this is the acceptance test)

> *"3 flight control computers, you need 1 of 3 available for CSFL. Total loss (to go outside MAC
> limits top level AND for total loss), malfunction (2 of 3 acting erroneous top level voting
> logic), partial loss (loose 1 of 3 degrades performance, Major failure top level OR)."*

Declaration: members = 3 FCCs, floor = min 1 of 3, arbitration = voting k=2 of 3.

Derived, and verified in `regression_mac_lanes.test.js`:

- **totalLoss** = `[[fcc1, fcc2, fcc3]]` — one cut set of order 3, AND
- **partialLoss** = `[[fcc1], [fcc2], [fcc3]]` — three cut sets of order 1, OR
- **malfunction** = the three pairs, order 2, from the voting scheme — *not* from the floor

Change the floor to "min 2 of 3" and total loss becomes the three pairs while partial loss stays
the singles. Change the arbitration to `none` and the malfunction lane collapses to order 1. The
two declarations move independently; that is the whole point.

**And the caveat Waqas attached:** *"this is just an example they will have to define their own
minimal acceptable configuration."* There are **no defaults**. `_NO_DEFAULTS` is asserted by the
wall precisely so a future edit cannot quietly invent a floor or an arbitration scheme for a rule
that never declared one. An undeclared rule produces a *finding*, never a guessed lane.

### 3.4 The cry-wolf guard — why order-1 is usually not a discovery

Measured on Aeolus: **20 of 29** CAT/HAZ conditions showed an order-1 route, and almost all of them
were "min 1 of 1". A tool that reports 20 single points of failure on a demo project is a tool
nobody believes on the day it reports a real one.

The rule, in `coffeShortestRoute`:

```
singleMemberClause = any clause on this FC has <= 1 member
unmodelled         = order-1 AND singleMemberClause      -> "architecture not modelled yet"
hard               = order-1 AND NOT singleMemberClause AND severity is CAT/HAZ  -> a real SPF
```

An order-1 route arising from a clause that only ever had one member is **an incomplete model**, and
must be reported as such. It is not a single point of failure. Preserve this distinction in every
consumer built on top — including the B3 generator and any dashboard.

### 3.5 Where MAC lives in the code

`site/mac_lanes.js` v1.0 — pure derivation, no DOM, `window.SLMacLanes` + `module.exports`:

```
lanes(rule, breachSets, severity, resolve)
   -> { totalLoss, partialLoss, malfunction, findings, fn, byFunction, arbitration }
arbitration(rule)        -> { declared, scheme: 'voting' | 'none' | 'undeclared', k, of, finding }
functionOf(rule, resolve)
validateMembers(rule, resolve)
scope(rule, severity)    // Catastrophic only
combinations(arr, k)     // COMBO_CAP = 20000
sweep(entries)
```

53 checks in `tests/regression_mac_lanes.test.js`. **Nothing in the app calls any of it** — that is
open item **B1**.

---

## 4 · CoFFE, and how MAC changes its cost

### 4.1 Waqas's question, and the honest answer

> *"so my understanding of the CoFFE is you take the worst case scenario and evaluate those in a
> fault tree, if you configure MAC properly you can do that with much less paperwork?"*

Yes — with a boundary. MAC answers the *loss* combinations deterministically: given a declared floor
over declared members, which combinations breach it is arithmetic, not elicitation. What MAC does
**not** answer is (a) the malfunction/erroneous states, which need the arbitration declaration and
some judgement about what an erroneous output actually does, and (b) systems that contribute but
appear in no MAC clause at all. So the correct shape is:

**CoFFE consumes MAC**: fold away every combination the model already answers, and elicit only the
residue — malfunction states and unmodelled contributors. That is open item **B4**, and it is the
difference between a 676-row table and a short list of real questions.

### 4.2 What is already built (66.31), and why none of it fires

In `site/misc_fn_modules.js`:

- `coffeComputed` — rewritten to handle `deg:<sys>:<label>` tokens and monotonicity (a total loss
  satisfies a degraded requirement); returns `null` for malfunction, correctly
- `_coffeDegSys`, `coffeMatchedBreachSet`, `coffeShortestRoute`, `coffeUnmodelledSystems`,
  `coffeCoverage`, `coffeConfirmDerived`
- `coffeGraft` — displayIds now minted from `SafetyLabNumbering.makeSharedId`

**Reachable from the console; called by no panel.** Open item **B2**. And the pruning that exists
today keys on *signed* verdicts — with **0 signed** on Aeolus it has never once fired. Measured
saving available from MAC-based pruning alone: **92 of 676** cases.

### 4.3 The one plan that was measured and then withdrawn

Adding a `partial loss` value to `_COFFE_STATES` looked obvious and is **wrong**. Measured live: it
takes 676 cases to roughly 1500 and computes a lane for none of them, because partial loss is not a
state token — it is *a capability weight below full*, i.e. MAC's existing `rule.degraded[].weight`
plus a clause `floor`. That path is used by **0 of 22** rules today. Adding the enum would multiply
the elicitation burden and answer nothing. `_COFFE_STATES` stays `['total loss', 'malfunction']`.
This is open item **B7**, and its status is **WITHDRAWN, deliberately** — do not re-derive it.

---

## 5 · Structured nodes (C1) — shipped 19 Aug, verified live

This is the input side, and it is the thing that unblocks most of section A.

**The coordinate**, written onto every node as `node.identity`:

```js
{ kind, systemId, functionId, fcId, itemId, effectId, modeIds,
  resourceId, providerSystemId, textOverride, declaredBy, declaredAt }
```

`kind` ∈ functional · item · resource · human · external · devError (never quantified) ·
undeveloped.

**Rules module** `site/node_identity.js` v1.0 — `resolveOwner` (declared → transfer target →
ancestor → page → UNOWNED), `crossesBoundary`, `displayText`, `nodeFindings`, `sweepTree`.

Two things in there that are easy to break and were hard to get right:

- **A resource node has TWO owners** and they are never collapsed: `{ systemId (provider),
  role: 'provider', consumerSystemId }`. This is what makes "one L3 in the provider's bucket,
  L2 interface requirements for consumers" (A3) expressible at all.
- **The boundary rule is asymmetric.** The first cut required *both* sides to have an owner, so a
  system branch hanging under an aircraft-level parent reported no boundary — the one shape the
  rule exists for. Correct form: no owner on me → not a crossing; owner on me and none on the
  parent → **is** a crossing; otherwise compare ids.

**Editor** `site/node_identity_ui.js` v1.3 — ONE `html(node)` builder, TWO mounts
(`#config-identity-host` in the drawer, `#ni-modal-body` in the creation dialog). Gates are offered
**Functional only** (a gate is how failures combine; it is never a thing that fails), with the empty
option reading *"logic only, inherits from above"*. The name field and the display override were
removed on Waqas's instruction — *"you do not need name on the canvas, the name would be the
failure condition itself"*.

**Bridge** `site/sl_env.js` v1.0 — read-only access to the app's top-level lexical globals. See
section 10; this file exists because of a bug, and deleting it will reintroduce that bug.

**Verified on the deployed build**, not on disk:

```json
{ "boot": { "esc": "function", "errors": 0 },
  "advanced": true, "noNameField": true, "noOverrideLink": true,
  "emptyRegisterMessage": true, "placeholderSaysEmpty": true,
  "escapeHidden": true, "functionHint": true }
```

**What C1 does NOT yet do:** nothing downstream reads `node.identity`. Bucketing still infers
ownership. That is **A2**, and it is the first thing to build now that the declaration exists.

---

## 6 · Requirement bucketing — the settled rulings

Full rationale in `UPGRADES_Requirement_Bucketing.md`. Condensed, so this file stands alone:

- **U-1** the defect: `genFTAEvents(scope)` walks every page regardless of scope. *Partly fixed in
  `assurance_modules.js` 1.20* — `walkPagesInScope()` now gates all three generators, and a page
  with a dangling `systemId` falls back to aircraft scope **and is reported as a finding** rather
  than silently dropped.
- **U-2** owner = the system that **performs the function**, not the one that houses the part.
- **U-3** the bucketing key already exists (the chain in §1.4). The remaining link, event → system
  FC, is what C1 now declares directly — which retires the old open question about whether the link
  lives on gates or on pages.
- **U-4** unowned is a **finding**, not a fallback bucket. `unownedPages()` is exported and surfaces
  to nobody — open item **A1**.
- **U-5** conservatism across trees: probability ✅ built (66.19); **DAL** = max of the *resulting*
  DALs, never merge reduction arguments (tree A on Option 1 and tree B on Option 2 are different
  derivations, and a per-tree DAL is a compliance error, not just optimism); **independence** =
  *failures of independence are GLOBAL, claims of independence are LOCAL*.
- **U-6** re-bucketing must **migrate `reqSource.sourceId` in place**. A regenerate orphans every
  affected requirement and loses verification status, evidence and manual edits.
- **U-7** a common resource is **not** a common cause. Do not auto-create CCF groups from resource
  nodes or the tool manufactures findings.

---

## 7 · Margin and rebalance — the posture, not just the feature

Design is in `BUILD_SPEC` §D; the reason it is in *this* file is that Waqas's framing is the
requirement, and a future session that treats it as a UI detail will build the wrong thing.

**Current shipped behaviour is wrong and must change.** 66.19 auto-loosens siblings to absorb freed
budget — proved live: FC-C's siblings rose 3.333e-6 → 5.000e-6 on their own. That stops.

**The rule is asymmetric and per NODE** (Waqas corrected an earlier symmetric draft):

> **A budget that got EASIER needs no action. A budget that got HARDER does.**

- shared item gets **stricter** → siblings have slack → AMBER, informational, tree still closes
- shared item gets **looser** → siblings **must tighten** → RED, blocks closure until rebalanced

**The tool offers to rebalance; it never does it silently.** Waqas: *"not never auto rebalances,
provides the option to the analyst … along with the rebalance it should show the impact to
requirements if they choose to rebalance (the debate for them is if they want to pay their suppliers
more but increase their engineering cost, or vice versa), and their decision must be logged as
provenance as well."* And: *"we are not willy nilly rebalancing — from safety labs perspective your
analyst chose to rebalance."*

Three consequences that are easy to lose:

1. **The impact preview is the product**, not the rebalance. Per node: budget before → after and
   direction; requirement status unaffected / relaxable / **must re-issue**; whether the new value
   falls below the achievable physical floor (i.e. the option is not available); and **whether the
   requirement is already issued with verification evidence against it**. A draft costs nothing to
   change; an issued, evidenced requirement is expensive. That is the distinction the human is
   actually pricing.
2. **"Did nothing" is logged too.** Otherwise the record cannot distinguish *reviewed and declined*
   from *never looked at*.
3. **No pre-selected default option.** If one choice is highlighted and Enter commits it, clicking
   through becomes consent and the provenance is theatre. And no passive voice in the record — not
   "budgets updated" but *"Waqas rebalanced this gate on 19 Aug after FC-A tightened
   BE-pgC-BUS."* This is the DO-330 posture: a tool that presents options a human selects, with the
   selection recorded, is decision support; a tool that autonomously moves safety allocations is
   making decisions.

**Margin becomes a first-class third budget state** (over-committed RED / exact / under-allocated
AMBER), markable as *deliberate reserve* so the flag stays loud only where it has not been reviewed,
and it belongs in the evidence package — a tree closing at 2.1e-6 against 3.0e-6 with 0.9e-6
unallocated is closing partly on paper margin, and a reviewer is entitled to see that split.

---

## 8 · State of the code — what exists, and what calls it

| File | Version | Status |
|---|---|---|
| `site/mac_lanes.js` | 1.0 | complete, tested, **called by nothing** (B1) |
| `site/node_identity.js` | 1.0 | complete, tested, consumed by the editor only |
| `site/node_identity_ui.js` | 1.3 | live and verified; drawer + creation dialog |
| `site/sl_env.js` | 1.0 | the lexical-globals bridge — see §10 |
| `site/misc_fn_modules.js` | 66.31 | CoFFE helpers shipped, **no panel calls them** (B2) |
| `site/assurance_modules.js` | 1.20 | scope filtering live; `unownedPages()` surfaces to nobody (A1) |
| `site/helpers_modules.js` | 2.38 | creation hook — node is created FIRST, dialog after, fully guarded |
| `site/fta_view_modules.js` | 66.30 | `selectNode` renders the identity block, guarded |
| `site/safety_lab.css` | 65.48 | drawer layout + the panel-audit fixes |

Wall: **156 suites, 0 real failures.** New this session: `regression_mac_lanes` (53),
`regression_node_identity` (52), `regression_node_identity_ui` (81 — including section **[0]**,
which renders the editor in a VM and inspects the generated HTML), `regression_req_bucketing` (29),
`regression_node_drawer_layout` (65), `regression_layout_invariants` (40 + 9).

**Snapshot of Aeolus HL-1, 19 Aug — evidence, not a to-do list.** Waqas: *"aeolus will be reworked
with demos overhaul."* Keep these numbers as the justification for B4/B6 and the cry-wolf guard, and
do not chase them as defects:

- 676 CoFFE cases · 211 with a computed lane · **0 signed**
- 17 of 22 MAC clauses single-member · **0** rules with degraded levels · **0** clauses with a floor
- **63 of 90** interdependence contributors appear in **no** MAC clause
- 20 of 29 CAT/HAZ conditions show an order-1 route — almost all "min 1 of 1"
- 7 of 22 MAC rules sit on non-CAT conditions and retire under the CAT-only rule

---

## 9 · What needs to get done, in order

Ordered by *what unblocks what*, not by size. Each item names its acceptance test.

**0. Runtime smoke gate in `ship.sh` — do this before any feature.**
Four defects escaped a green wall in one night, and all four were the same shape: correct-looking
source the browser could not use. About twenty lines of Playwright — headless load of the deployed
page; assert no uncaught errors at boot; assert the key globals are defined; assert auth
initialises; open the drawer; assert the identity block renders. It would have caught every one of
the four. *Accept when: reintroducing any one of the four defects turns the gate red.*

**1. A2 — bucket by the declared owner.** `node.identity` exists now; make `genFTAEvents` read it
instead of inferring. *Accept when: an event declared on FCS files into the FCS bucket regardless of
which scope the generator ran in, on a project with real systems (Aeolus/Halcyon — the four-tree
demo cannot show this).*

**2. A4 — the `reqSource.sourceId` in-place migration.** Must land **with** A2, not after. Without
it, re-bucketing orphans every affected requirement. *Accept when: a re-bucket preserves
verification status, evidence and manual edits on every migrated row.*

**3. A1 — surface `unownedPages()`.** Cheapest item on the register; no new data model. *Accept
when: an unowned branch is visible to a user without opening the console.*

**4. B6 + A10 — the granularity migration, both artefacts together.** `clauses[].of` holds system
ids; `idpCell` is system-level. App Q Table Q.4-1 is *system functions*. These move together or not
at all. *Accept when: a MAC clause and an interdependence cell both address a function id, and the
old data migrates without loss.*

**5. B3 — generate the first cut of a tree from a MAC declaration.** Three **top events**, not three
branches of one tree — they are three different conditions at three different severities. Node ids
from `SafetyLabNumbering.makeSharedId`. Regenerate-as-diff, provenance on every generated node, and
the cry-wolf distinction (§3.4) preserved in what it reports. *This is the visible win.* *Accept
when: the 3-FCC example in §3.3 produces three trees whose cut sets match the tested lanes exactly.*

**6. B4 — CoFFE consumes MAC.** Fold away what the model answers; elicit only malfunction and
unmodelled contributors; prune pairs containing a MAC-computed YES single. *Accept when: the
measured 92-of-676 pruning actually fires without requiring a signed verdict.*

**7. A9 + A8 — margin state, offered rebalance, and stale-flagging built ONCE.** Stale-flagging is
now owed in five places (a shared-strictest cap moving a budget · a consumer assumption quoting a
number that has tightened · an α shifting on the verification side · a CoFFE case being
re-classified · a MAC clause being edited) and has been built zero times. Five uses is the signal to
build it properly. **A9 changes shipped behaviour** — see §7. *Accept when: 66.19's silent
auto-loosening no longer occurs, and the decision to leave margin unspent is recorded.*

**8. A3 — one L3 in the provider's bucket at the strictest value; consumers get L2 interface
requirements.** Not N copies. *Accept when: a resource consumed by three systems produces one
probabilistic requirement and three interface requirements.*

**9. A5 / A6 / A7 — DAL strictest across trees; independence propagation (failures global, claims
local); the common-resource-is-not-common-cause guard.**

**10. C2 — the allocation/verification mirror.** Allocation leaf = item + effect; the mirror is the
same item and effect decomposed into modes at λ×α, **inheriting the coordinate from its twin**. You
never re-declare identity on the verification side; you only add how it fails.
**C3 is ruled and closed: no mode-level targets, ever.** Mode contribution and sensitivity stay
verification-side analysis that informs design — never allocated, never a requirement, never handed
to a supplier as a number by the generator.

**Also outstanding, separately:** the **NAV overhaul** Waqas wanted "tonight" on 19 Aug and which was
never started — plan is in `NAV_V2_PLAN.md` with mockups in `docs/nav_*.html`.

---

## 10 · Rulings still needed from Waqas

Do not guess these; they change the data model.

- **A12 — resource consumption vs contribution.** A tree may legitimately involve a system that
  provides a resource without appearing in that FC's interdependence row (ECS consumes the 28V bus;
  EPS may not be listed against the cabin-altitude FC). Either (a) exempt the resource node kind
  from the interdependence restriction, since it is already constrained by the provider's published
  inventory, or (b) treat consuming a resource from system X as making X a contributor and write it
  back. *Leaning (b): if losing EPS's bus can cause the condition, EPS is a contributor and the
  table should say so.*
- **B5 — self-checking / cross-comparison arbitration.** The malfunction lane supports `voting` and
  `none`. With a self-checking pair a single erroneous unit is passivated, so the defeating
  combination is a different shape and cannot be expressed as k-of-n.
- **The closure-block switch for legacy projects** (BUILD_SPEC §D.2, parked). Every node in Aeolus,
  Halcyon and the demos is unstructured today, so turning the rule on globally makes every project
  read "not closed" at once and it will look like the tool broke. Options: (a) on immediately,
  (b) grandfather old nodes, (c) a per-project switch the owner turns on when they have finished
  migrating. *Recommended (c).* Parked until the demos rework is real.

---

## 11 · Traps — the four escapes, and the rules they bought

All four happened on 19 Aug. All four were **correct-looking source the browser could not use**, and
all four passed a green wall of static assertions. If you only take one thing from this file into
the next build, take this section.

1. **`.is-modal` selectors matched nothing.** The live selector is
   `#node-config-panel[style*="display: block"]`; `.is-modal` is never applied by any JS. Every
   `.is-modal` CSS rule must carry its live twin. The wall passed because it asserted rule **text**,
   not that the selector matches anything.
2. **A production outage from line-index editing of `index.html`.** Moving script tags by line index
   left their `<!--` openings behind, putting `misc_fn_modules.js` and `safety_lab.js` inside an
   unterminated HTML comment. Everything they declare vanished; auth failed; 1000+ ReferenceErrors
   pointed at innocent files. The tags returned 200 by hand, the files parsed, deployed byte sizes
   matched `dist`, and the wall was green.
   **Rule: never edit `index.html` by line index. Anchored string replacement only.** A guard now
   exists and was proven to fail on the broken file.
3. **`window[name]` reads of lexical globals.** The app's state lives in top-level `let`
   declarations in classic scripts — global **lexical** environment, **not** `window`.
   `window.selectedNodeData` is `undefined` and fails silently. That is why `sl_env.js` exists: a
   classic script loaded *after* the declarations, closing over them as bare identifiers.
   `eval` would also solve it and is unavailable — **the CSP forbids `unsafe-eval`.**
4. **Malformed attribute quoting.** `onchange="slNodeIdentitySet("kind", this.value)"` — double
   quotes inside a double-quoted attribute. The attribute terminates early, the browser discards the
   handler, the dropdown does nothing. Forty-five string assertions passed over that markup because
   they read the **source** and the defect was in the **output**.
   **Fix that matters: section [0] of `regression_node_identity_ui.test.js` renders the editor in a
   VM and inspects the generated HTML.** Keep that pattern for any new markup builder.

Two more, cheaper but real:

- **Cloudflare's SPA fallback returns 200 + the ~340KB app shell for any missing file.** Verify
  deploys with a **byte-size** control probe, never a bare 200.
- **Pins are asserted as FLOORS, never literals.** `parseFloat('72.10') === 72.1`; literal pin
  assertions broke twice in one day.

And the standing lesson behind all of it, which Waqas asked about directly (*"why are we making so
many mistakes?"*): (1) reasoning where measurement was needed, (2) a wall made only of static
assertions cannot see runtime behaviour, (3) the error rate tracks batch size. Items 1 and 3 are
discipline; item 2 is item 0 of section 9.

---

## 12 · Standards to consume — all in `~/Downloads`

Read these rather than working from memory of them. **SAE material: clause numbers and titles only,
never prose** (NASA/FAA/US-government documents are public domain and may be quoted freely).

**Primary, for this work package:**

- `SAE ARP4761A.pdf` — **Appendix Q is the one that matters here** (interdependence Q.4-1, common
  resource Q.4-2, CoFFE Q.4-6, and the worked fault tree). Also App I (phased-mission Markov,
  §I.3.3.2 interval↔rate equivalence) and App M (CMA per-IP passes), both on the standing deep-read
  list.
- `SAE ARP4754B.pdf` — functional allocation (aircraft function → system function → item), DAL
  assignment and reduction. This is the authority for U-2 and A5.

**Secondary, already in the tool's scope:**

- `F3230-21a Standard Practice for Safety Assessment of Systems and Equipment in Small Aircraft.pdf`
  and `F3061-22b Standard Specification for Systems and Equipment in Small Aircraft.pdf` — the ASTM
  lane.
- `System Theoretic Process Analysis (STPA) Standard for All Industries.pdf` — the STPA modules.
- `CS-UAS-Annex-B-MSO-Issue-1.0.pdf`, `SORA-v2.5-Annex-E-Release.JAR_doc_28pdf.pdf`,
  `crd_document-publication.pdf`, `d2_-_consolidated_gm-for_publication-02052024.pdf` — the
  UAS/SORA lane.
- `EASA_AI_Roadmap_2.0.pdf`, `easa_concept_paper_guidance_for_artificial_intelligence_applications_proposed_issue_03.pdf`,
  `EASA_Concept_Paper_Guidance_for_Level_1and2_machine_learning_applications_Issue_02.pdf`,
  `NIST_AI_RMF_1.0_AI.100-1.pdf`, `roadmap_for_AI_safety_assurance.pdf` — the ML-assurance lane.
- `human_integration_design_handbook_revision_1.pdf`, `NASA-HDBK-870925-14.pdf` — the HF lane
  (public domain).

**Never read, staged or ingested: `~/Desktop/04 - System Safety` (ITAR).**

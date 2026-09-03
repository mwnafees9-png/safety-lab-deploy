# Next build — structured node modelling + requirement bucketing

Agreed with Waqas, 19 Aug 2026, in discussion. Companion to `UPGRADES_Requirement_Bucketing.md`
(U-1 … U-7), which holds the rationale. This is the *what*.

**One sentence:** stop letting engineers type free text into fault-tree nodes; make them pick from
things that already exist and have owners — and once a node knows its owner, requirement
bucketing stops being a guess.

---

## A · Structured node modelling

**Surface.** A modal on *add gate* / *add event*. **The same modal is embedded in the
gate/event properties drawer**, which is both the edit path and the migration tool for every
legacy free-text node in Aeolus, Halcyon and the demos. Without that, the feature only works on
projects nobody has started yet.

**Which systems are offered** (Waqas, 19 Aug). On an **aircraft failure-condition tree**, the
system dropdown lists **only the systems named as contributors in that FC's interdependence
analysis** — the union across the page's `linkedFhaIds`, plus any system reachable through a
transfer gate on the page. On a **system tree** the system is fixed and locked. This makes the
interdependence analysis load-bearing rather than documentation.

Three consequences:

- **The point is a SHORT list, not just a correct one** (Waqas, 19 Aug: *"instead of giving a 20
  system list we will be providing a shorter more targeted list"*). With 20 systems the failure
  mode is picking the adjacent wrong one — and a wrong system is a wrong requirement bucket,
  silently. With three or four, the wrong ones are not on screen at all. Constraint beats
  validation: it prevents the error rather than warning about it afterwards, and a short list is
  scannable by sight instead of needing a search, which is itself where near-match errors come
  from. Order: contributors already used elsewhere in this tree first, then the rest — deterministic,
  no scoring.
- **The escape hatch must live IN the dropdown**, as a permanent last entry ("+ another system…"),
  not behind a menu. A short list with a hidden escape is a funnel, and people will force the
  nearest wrong pick rather than go looking — the same failure mode as making FC creation the slow
  path.
- **A short list raises the stakes on interdependence quality.** It is only safe if the analysis is
  right, which is why the write-back must be easy and recorded, and why the reverse completeness
  check below matters — they are two views of the same data.
- **Escape hatch, or people route around it.** If the system you need is not listed, the modal
  offers *"add this system as a contributor"*, writing back into the interdependence analysis —
  same pattern as creating an FC inline. Do not block: you often discover the contribution while
  drawing the tree. But the write-back is a real event — someone has just found a new contributor
  to a classified condition — so record and surface it rather than doing it silently.
- **The completeness check falls out free.** A system listed in interdependence as contributing to
  this FC but with **no node anywhere in the tree** is an incomplete tree. Computable at any time,
  and it is the "did you cover every contributor" question that fault trees are worst at.
- **An empty list is itself a finding** — it means the page has no linked failure condition.

**OPEN — resource consumption vs contribution.** A tree may legitimately involve a system that
provides a *resource* without being listed as contributing a failure condition (ECS consumes the
28V bus; EPS may not appear in the cabin-altitude FC's interdependence row). Two ways to handle it:
(a) exempt the **interface/resource** node type from the interdependence restriction, since it is
already constrained by the provider's published inventory; or (b) treat consuming a resource from
system X as *making* X a contributor, and write it back. **(b) is arguably more correct** — if
losing EPS's bus can cause the condition, EPS is a contributor and the interdependence table should
say so — and it closes the loop the same way: the tree discovers the dependency, interdependence
records it. Waqas's call.

**Question order.** System → node type → branch. **Every one of these is a dropdown**, node type included — nothing in this modal is free text except the inline *create new* path. System is chosen from **pre-existing systems
only**; on a system tree it is pre-filled and locked. Functions, failure conditions and items may
be created inline.

**Node types**

| Type | Then | Notes |
|---|---|---|
| **Functional** | system function → failure condition (pick or create) | see the boundary rule below |
| **Item** | item/part → **effect** (FMES group) | allocation trees only carry the effect; modes live on the mirror |
| **Interface / resource** | pick from the providing system's published inventory | this is the "menu not description" mechanism |
| Human error | link to HF register | |
| External / environmental | | |
| Development error | qualitative, never quantified | already exists |
| Undeveloped | explicit placeholder | |

**The functional/item boundary — deterministic rule.** Not every functional node is a failure
condition; most are just decomposition logic. A functional node **is** a declared failure
condition exactly when it **crosses an ownership boundary** (different system, supplier or item
owner). Inside one system's own decomposition, gates are logic and inherit everything. Checkable
from data, not a judgement about "abstractness".

Consequence: a boundary-crossing FC is precisely the candidate for a **transfer gate**. If a tree
already exists whose top event is that FC, offer the transfer instead of allowing a re-model. That
suggestion becomes deterministic rather than name-matched — the direct answer to the Paganini
feedback.

**Allocation vs verification.** Allocation trees are probability-only; λ and the repair model live
on the mirror (Phase 61, already enforced — `genFTAEvents` refuses to generate from `page.verifies`
pages). So:

- **Allocation leaf** = item + effect. The requirement is a ceiling on that effect.
- **Verification leaf** = the same item and effect, decomposed into modes at λ×α.
- **The mirror inherits the coordinate** from its allocation twin. You never re-declare identity
  on the verification side; you only add how it fails.

**RULED, 19 Aug: allocation stops at the item. There are no mode-level targets, ever.** Mode
contribution and sensitivity ("halve α for fretting → top event 3.1e-6 → 2.0e-6") remain
**verification-side analysis** that informs design. They are never allocated, never a requirement,
and never handed to a supplier as a number by the generator.

**Display shape.** Keep the leaf readable at item level and let it **expand into its modes** —
one dataset, two views. This is what an FMES already is, made navigable both ways.

**Severity is path-derived, never stored.** An FC feeding through an **OR** is sufficient on its
own and carries full severity; through an **AND** it is not, and its standalone classification is
a separate determination. Same FC, two trees, two severities, both correct. The modal must show
the severity *this placement* implies. The drawer should state it in the same shape as the
existing strictest-allocation notice:

> CAT via the OR path in FC-A · MAJ via the AND path in FC-C · **held at CAT**

**Node text becomes derived.** Displayed name comes from the FC/effect statement, read-only, with
a deliberate "override display text" escape. Otherwise labels drift from the conditions they point
at and we are back to two descriptions of one thing.

**Never block modelling.** An unstructured node is allowed, visibly flagged, and **blocks closure
rather than blocking thinking**. Same rule as unowned events.

**Creating must cost the same as picking.** If creating a new FC or item is the slow path, people
pick the nearest-fitting wrong entry and the tool manufactures false agreement between trees. Same
modal, same click count, no detour into the FCIM.

---

## B · Requirement bucketing

**B1 — Fix the defect (U-1).** `genFTAEvents(scope)` uses `scope` only to prefix the `sourceId`
and pick the destination store; the traversal is `walkAllPages()` with no filter on
`page.treeLevel`/`page.systemId`. `genDALgebra` and `genGateIndependence` read `treeLevel` only for
wording. Result: generate at aircraft scope → an L3 for every basic event on every tree; generate
per system → the same events again, differing only by prefix. Invisible in the four-tree demo
(no systems defined) — reproduce on Aeolus or Halcyon.

**B2 — Owner = the system that performs the function**, not the one that houses the part. Once the
modal declares (system → function → FC) on the node, ownership is **declared at creation** and no
longer inferred. This closes the U-3 open question: the event → system-FC link is recorded at node
level, so we no longer need to decide whether it lives on gates or pages.

**B3 — One L3, not N copies.**

| Role | Requirement | Bucket |
|---|---|---|
| Provider | probabilistic requirement on the resource, at the **strictest** value across all consumers | providing system, once |
| Consumer | tolerance / assumption against that resource | each consuming system, L2 interface |

For a **declared common resource**, an aircraft-level parent entry is legitimate (the aircraft
engineer allocates the budget; the provider system holds the implementing requirement) — a
parent/child pair across two buckets. What is *not* legitimate is an ordinary PASA item landing at
aircraft level because that was the generator's scope.

**B4 — "Unowned" is a finding, not a fallback bucket.** A branch with no declared system
contribution is a modelling gap worth surfacing. Cheapest item on the list; no new data model.

**B5 — Cross-tree conservatism (U-5).**

- **Probability** — built (66.19).
- **DAL** — take the max of the **resulting** DALs across trees. Never merge reduction arguments:
  tree A on DALgebra Option 1 and tree B on Option 2 are different derivations. A per-tree DAL is a
  compliance error, not merely optimistic.
- **Independence** — **failures of independence are global, claims of independence are local.** A
  CMA common-mode finding is physical and invalidates the reduction everywhere those items meet. A
  substantiation for members {A,B} says nothing about {A,C}.

**B6 — Migrate, never regenerate (U-6).** Re-bucketing changes `reqSource.sourceId`. A regenerate
would orphan every affected row and lose verification status, evidence and manual edits. Rewrite
the key in place.

**B7 — Nothing auto-generates from a verification mirror.** Already true; keep it true.

---

## C · What falls out for free — the reason this is worth the cost

- **FMEA ↔ FTA gap lists, both directions.** An FMEA mode with a hazardous effect that no tree
  consumes; a tree leaf pointing at an item with no FMEA. Deterministic lists, not review findings.
- **The FCIM and the trees can no longer drift** — one dataset, two views. For a reviewer, the
  classification and the causal model are *provably* about the same conditions.
- **"You already have a tree for this"** becomes deterministic rather than name-matched.
- **Strictest-across-trees gets a sound foundation.** Shared identity becomes declared instead of
  arising from a naming coincidence or a manual adopt.
- **Auto-req prose improves and simplifies.** `genFTAEvents` currently guesses whether a node name
  is verb- or noun-phrased so it can write "the probability that X fails" vs "the probability of
  X". That heuristic exists only because node names are free text; it disappears.
- **Rates stop being transcribed.** Verification leaves take λ×α from the FMEA rather than typed
  values.

---

## D · Rulings needed before we build

~~1. Mode-level targets~~ — **RULED: no mode-level targets. Allocation goes down to the item and
stops there.** Mode data is verification-side analysis only.

**1. When a shared item's number moves — RULED, 19 Aug: FLAG, DO NOT ACT.**

This **changes shipped behaviour.** 66.19 auto-loosens the siblings to absorb freed budget (proved
live: FC-C's siblings rose 3.333e-6 → 5.000e-6 on their own). That stops.

**The rule is asymmetric, per NODE, not per tree** (Waqas, 19 Aug — corrected an earlier
symmetric draft of this section):

> **A budget that got EASIER needs no action. A budget that got HARDER does.**

- **Shared item gets STRICTER** → it consumes less, siblings' budgets are effectively easier, the
  tree closes with slack. **No action required.** Show the margin; the analyst may spend it or
  bank it. AMBER.
- **Shared item gets LOOSER** → it consumes more, siblings **must tighten** or the tree does not
  close. **Action required — this is not a notification that can sit there.** RED, blocks closure
  until re-balanced.

"Must act" means **the analyst must act, and the tool must not let it be ignored.** Blocking
closure is what makes it non-optional without making it automatic.

**The tool DOES offer to rebalance — it just never does it silently** (Waqas, 19 Aug; corrects an
earlier "never auto-rebalances" draft). Auto-rebalance is an explicit, per-event action the analyst
invokes, with the consequences shown first and the decision recorded.

**Offer more than one split.** "Rebalance" is not a single answer, and generating alternatives is
just the existing allocator run with different weights:

1. proportional across unlocked siblings (default)
2. concentrated on one sibling — the one with the most headroom, or the fewest issued requirements
3. hold it all as margin, change nothing

**The impact preview is the actual product.** Per affected node, before committing:

- budget before → after, and the direction (easier / harder)
- requirement status: unaffected · relaxable · **must re-issue**
- whether the new value falls below the achievable physical floor — i.e. this option is not
  actually available
- **whether the requirement has already been issued and has verification evidence against it.** A
  draft costs nothing to change; an issued, evidenced requirement is expensive. This is the
  distinction that drives the real decision.

**Surface the levers, do not pretend to compute money.** Waqas's framing: the analyst is trading
*paying suppliers more* against *higher engineering cost*. The tool cannot know prices, but it
knows the two honest proxies — **headroom above the achievable floor** (how hard the technology is
being pushed) and **how many issued requirements each option disturbs**. Show those two; let the
human price them.

**Log the decision as provenance.** Recorded on the node, rendered in the drawer in the same shape
as the strictest-allocation notice, and carried into the evidence package so a reviewer asking
"why is this 5.0e-6 and not 3.3e-6" gets the answer without asking:

- who and when
- what triggered it — which tree changed, from what to what
- which option was chosen, including the before/after budgets
- prompted rationale

**"Did nothing" is logged too.** A deliberate decision to leave margin unspent is a real
engineering decision and must be as auditable as a rebalance — otherwise the record cannot
distinguish *reviewed and declined* from *never looked at*. Same principle as "declining to merge
is a recorded judgement" from the reconciliation discussion.

**Rebalance is reversible**, and undo restores the prior weights exactly rather than re-deriving
them.

**Why this shape, from Safety Lab's side (Waqas, 19 Aug).** *"We are not willy-nilly rebalancing
— your analyst chose to rebalance."* The provenance is not a convenience feature, it is the
posture. If a safety budget moved, the answer to "who decided that" must be a person, with a
timestamp and a reason — never "the tool did it."

Two consequences that follow directly:

- **Tool-qualification posture.** A tool that autonomously changes safety-relevant allocations is
  making decisions; a tool that presents options a human selects, with the selection recorded, is
  decision support. That distinction is what a DO-330 qualification argument turns on, and the
  recorded human decision is the mitigation. Designing it this way from the start is much cheaper
  than retrofitting the argument later.
- **Language and interaction must match.** Never passive voice in the record or the UI — not
  "budgets updated" but *"Waqas rebalanced this gate on 19 Aug after FC-A tightened BE-pgC-BUS."*
  And **no pre-selected default option**: if one choice is highlighted and Enter commits it,
  clicking through becomes equivalent to consent and the recorded decision is theatre. The dialog
  requires an explicit selection.

Note a single edit can tighten some nodes and loosen others in the same tree, which is why the
state lives on the **node** and the tree status is the roll-up.

**Achievability escalation.** When siblings must tighten, some may fall below their achievable
physical floor (`config-achievable` already exists). Re-balancing within the gate is then
impossible, and the tool must say so rather than letting the analyst discover it by trying —
and name the escalation: push the problem up to the parent, change the architecture, or challenge
the stricter tree's demand.

**Requirement re-issue follows the same asymmetry.** A requirement whose budget tightened is now
harder and must be flagged for re-issue. A requirement whose budget loosened is still satisfied —
the supplier is simply held to more than they need — so it is not a safety action, only a possible
cost saving the analyst may choose to take.

*Rationale.* Auto-loosening is the dangerous direction: a budget quietly relaxing reduces demanded
reliability with nobody deciding to, possibly after the requirement has gone to a supplier.
Auto-tightening is conservative but still silently rewrites someone's allocation. Neither should
happen without a human. And per Waqas: the tightening work is unavoidable — it would be owed on a
manual programme too — so the tool's contribution is **latency**, catching it in seconds instead
of at the next review or after a supplier has built to the wrong number.

**Consequences to build**

- **Unallocated margin becomes a first-class, FLAGGED state** (agreed 19 Aug). Today weights are
  percentages that must sum to 100, so the allocator always distributes the whole budget and slack
  has nowhere to live. Margin must be representable, shown, and surfaced — never treated as an
  imbalance to correct.

  A gate's budget now has **three** states, not two:

  | State | Treatment |
  |---|---|
  | **Over-committed** — children exceed the parent budget | RED. Blocks closure. |
  | **Exactly allocated** | normal |
  | **Under-allocated (margin)** | AMBER. Informational — the tree genuinely closes. Does NOT block. |

  Requirements on the margin flag:

  - Shown on the owning gate, rolled up to the page, and listed project-wide — a gate deep in a
    tree is otherwise invisible.
  - Carries provenance, same pattern as the strictest-allocation notice: *"2.9e-6 unallocated,
    freed when BE-pgC-BUS was held at the strictest value from FC-A."*
  - Stated in both probability and the equivalent per-FH rate, like everything else.
  - **Deliberate reserve vs accidental slack must be distinguishable.** Some margin is held back
    on purpose for growth; some is a side effect of a cap landing. Let the analyst mark margin as
    *reserved*, which quietens the flag for that gate and leaves it loud everywhere it has not been
    reviewed. Without this the flag is permanent noise on every mature tree and gets ignored —
    the same failure mode as notification churn.
  - **It belongs in the evidence package.** A tree closing at 2.1e-6 against a 3.0e-6 target where
    0.9e-6 is unallocated is closing partly on paper margin rather than on allocated performance.
    A reviewer is entitled to see that split.
- **The notice must carry the cause, not just the effect.** Which tree changed, who changed it,
  from what to what, and how much this tree now needs to find. Without the chain the analyst hunts
  in their own tree for a problem that is not there.
- **Point at the slack.** The tool already knows which siblings are locked and which are near their
  achievable physical floor. "You need 1.2e-6; these two have room, this one is locked, this one is
  at its physical limit" turns a notification into a starting point.
- **Notify on settle, not on keystroke,** and only to trees whose closure status or allocated
  values actually moved. Otherwise people tune it out and "flagged sooner" is worth nothing.
- **Address it to the owner.** With structured nodes the owning system is declared, so the notice
  has a real addressee instead of whoever next opens the project.
- Same mechanism as the stale-flagging note at the end of this document — **fourth use case.**

**2. When does the closure block switch on for old projects? — PARKED, 19 Aug.** Demos will be
reworked; revisit when the migration is real.

Every node in Aeolus, Halcyon and the demos is free text today, so after this ships they are all
"unstructured" — and the rule says unstructured nodes stop a tree reporting *closed*. Turn that on
globally on day one and every existing project reads "not closed" at once, until someone works
through hundreds of nodes. It will look like the tool broke.

- (a) on immediately — honest, but everything goes red at once
- (b) only for nodes created after the feature ships — old nodes grandfathered, so old projects
  never get cleaned up
- (c) a per-project switch the owner turns on once they have finished migrating that project

*(c) recommended — the project owner decides when their project is ready to be held to the rule.*

~~4. α provenance~~ — **dropped, not relevant.**

---

## E · Sequence

1. **B4 + B1** — unowned as a visible state, and stop the cross-bucket duplication. No new data
   model, immediate correctness win, independent of everything else.
2. **A** — the modal, on creation *and* in the properties drawer (creation + migration in one
   surface).
3. **B2 + B3 + B6** — bucketing by declared owner, with the in-place sourceId migration.
4. **B5** — DAL and independence propagation.
5. **Resource inventory + consumer interface requirements.**

**Build the stale-flagging mechanism once.** It is now owed in three places: when a
shared-strictest cap moves a budget, when a consumer's assumption quotes a number that has
tightened, and when a design change shifts an α on the verification side. Three uses is the signal
to build it properly rather than three times.

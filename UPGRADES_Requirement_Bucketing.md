# Upgrade log — requirement bucketing, cross-tree conservatism, resource linkage

Agreed with Waqas, 19 Aug 2026, in discussion. **Nothing here is built.** This is the decision
record so the rationale survives the conversation.

Origin: Waqas, looking at the live build — *"why are showing L3 auto req requirements at the
aircraft level shouldnt they be in their respective system buckets?"* — which he then connected
to the Paganini feedback (*"how do I know if an event is being used across multiple systems"*).

---

## U-1 · L3 auto-reqs file to the scope the generator ran in, not to an owner  — DEFECT

`AutoReq.generate(opts, scope)` passes `scope` to every generator, but they honour it
differently:

- `genFHA(fhaArrForScope(scope), scope)` — genuinely scope-filtered.
- `genFTAEvents(scope)` — **not filtered.** `scope` is used only to prefix `reqSource.sourceId`
  and to select the destination store. The traversal is `walkAllPages()`, which iterates every
  page in `ftaPages` with no test on `page.treeLevel` or `page.systemId`.
- `genDALgebra`, `genGateIndependence` read `page.treeLevel`, but only to pick FDAL/IDAL wording
  and keyword phrasing — not to skip a page.

**Consequences.** Generating at aircraft scope emits an L3 for every basic event on every tree,
system trees included. Generating at each system scope emits the *same* events again into that
system's store; the two rows differ only by the `ac:` vs `sys-<id>:` sourceId prefix. The dedupe
(`seenLids`) is per-run and cannot see the other bucket.

**Not visible in the four-tree demo project** — all four pages are `treeLevel: 'aircraft'` with
`systemId: null` and `systemsData` is empty, so there is no system bucket to mis-file into.
Reproduce on a project with real systems (Aeolus, Halcyon) before changing anything.

---

## U-2 · The owner of an L3 is the system that performs the function, not the one that houses the part

Rejected the first proposal (bucket by `logicalId`, i.e. by item identity). It picks the housing
system arbitrarily for a shared resource — the 28V bus is housed by electrical power but consumed
by ECS and flight controls — and it fails outright for undeveloped events, which have no item.

ARP4754B allocation is functional: aircraft function → system function → item. The FHA is already
written against functions, so functional contribution is the axis the rest of the model is on.

**One L3 does not become N L3s.** Split by role:

| Role | Requirement | Bucket |
|---|---|---|
| Provider | the probabilistic requirement on the resource itself, at the **strictest** value across all consumers | the providing system, once |
| Consumer | tolerance / assumption against that resource ("shall tolerate loss of … for ≤ T") | each consuming system, L2 interface |

This is also what removes the duplication in U-1 — copying the same L3 into every consuming
bucket would be the same defect with tidier filing.

---

## U-3 · The bucketing key already exists — no new data model

Waqas's correction, which changed the answer: **the interdependence table does not hold
system→system dependency. It holds aircraft failure condition ↔ contributing system failure
condition.** And the fault trees define system→resource consumption.

So the chain is complete:

    aircraft FC  →(interdependence)→  contributing system FCs  →  owning system function  →  owning system

because a system FC already belongs to exactly one system and to the function whose loss it is —
that is what the FCIM row is.

**The one link the chain does not supply** is event → system FC, which is what a bucketing
decision for a leaf on a PASA tree actually needs. Believed to be structural, in one of two
forms:

1. **Nearest ancestor carrying a system-FC link.** A properly decomposed PASA tree branches the
   aircraft FC into its system contributions, so the owning system FC of a basic event is the
   nearest ancestor gate that carries one. A walk up the tree; no new data.
2. **Transfer target.** Where the aircraft tree transfers out to a system page, that page has a
   `systemId` and everything beneath it is owned by construction.

### OPEN — needs a ruling before anything is built

**Is the system-FC link recorded at GATE level, or only at PAGE level?** Pages carry
`linkedFhaIds`. If gates do not carry an FC link, an aircraft tree that decomposes internally on
a single page has no per-branch ownership at all, and the choice is between adding an FC link on
gates, or requiring that decomposition into system contributions goes through transfer gates.
Modelling decision, not a code one.

---

## U-4 · "Unowned" is a finding, not a fallback bucket

An event with neither an FC-linked ancestor nor a transfer target is not an edge case to default
away — it means **this branch of the PASA tree has no system contribution declared**. Surface it
as a modelling finding in its own right. Defaulting it to the aircraft bucket is exactly the
behaviour that started this thread.

Cheapest item on this list: it needs no new data model and it stops today's silent mis-filing.

---

## U-5 · Probability, DAL and independence all develop from the most conservative tree

Waqas's rule. Agreed on two of three; the third needs splitting.

**Probability** — already built (`_propagateStrictestAcrossSharedEvents`, 66.19). Consistent.

**DAL** — agreed, and it is stronger than a conservatism policy. If an item contributes to a CAT
condition in one tree and a MAJ condition in another, ARP4754B already drives its assurance level
from the CAT contribution; a per-tree DAL is a **compliance error**, not merely optimistic.

> Caveat: take the max of the **resulting** DALs, never merge the reduction arguments. DALgebra
> reductions depend on independence within a specific gate, so tree A on Option 1 and tree B on
> Option 2 are two different arguments. Compare outputs; do not combine derivations.

**Independence** — pushed back, and the refinement was accepted. Independence is not a property
of an item that can travel; it is a relational claim about a specific member set under a specific
gate, substantiated by CMA. The correct asymmetry:

- **Failures of independence are GLOBAL.** A CMA finding that two items share a common mode is
  physical; it holds wherever those two appear together and must invalidate the reduction in
  every tree.
- **Claims of independence are LOCAL.** A substantiation for members {A, B} in tree A says nothing
  about {A, C} in tree B. Propagating the claim would be conservative in name and optimistic in
  effect.

Rule as written: **failures of independence are global, claims of independence are local.**

---

## U-6 · Re-bucketing must migrate, not regenerate

Existing auto-reqs key on `ac:fta-event:<lid>`. Changing the bucket changes the key, so on the
next generate every affected requirement reads as an orphan plus a new row — losing verification
status, verification evidence and any manual edit. Any bucketing change needs a migration that
rewrites `reqSource.sourceId` **in place**.

---

## U-7 · A common resource is not a common cause

Shared dependency is a structural fact; common-cause coupling is an analytical judgement, and by
Waqas's own earlier ruling it only bites when simultaneous loss is worse than the sum of the
individual losses. If events created from a resource record auto-create CCF groups, the tool will
manufacture common-cause findings that do not exist. Keep the two separate.

---

## Sequence

1. **U-4** unowned as a visible state, and stop the U-1 cross-bucket duplication — no new data
   model, immediate correctness.
2. Resolve the U-3 open question (gate-level vs page-level system-FC link).
3. **U-2 / U-3** bucketing by owner, with **U-6** migration.
4. **U-5** DAL and independence propagation.
5. Step two — events created from the common-resource record (separate discussion, in progress).

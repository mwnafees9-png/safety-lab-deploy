# Human error quantification — what to take, and what NOT to

**Source:** Deepak Kumar Rathore, "Human Error Quantification — Part 4" (LinkedIn).
Fuzzy expert elicitation: linguistic judgements → agreement between experts →
consensus coefficient → aggregation → defuzzification to a crisp human error
probability.

**Read 14 Aug 2026.**

> ## ⛔ RULING (Waqas, 14 Aug): HEPs DO NOT GO INTO OUR FAULT TREES.
> My first draft of this proposal recommended human error probability as a
> basic-event source feeding the trees. **That was wrong and is struck out.**
> Reasoning recorded below so nobody re-proposes it — it is an obvious-looking
> feature and it will come up again.

---

## 1 · Why the fault-tree route is wrong for us

**Quantified HRA is a nuclear and process-safety convention, not a civil
aerospace one.** THERP, SPAR-H and CREAM are standard in nuclear PRA. They are
not how Part 25 handles crew action, and our market is Part 25 / CS-25 and its
neighbours.

Under 1309 the crew is handled **qualitatively** — through the failure-condition
classification itself (which is written in crew-workload language), through
credited or uncredited crew actions, and through assumptions that have to be
discharged. Not through a probability multiplied into a cut set.

And the deeper reason, which is the product's own thesis:

**A λ from censored life data is measured. An HEP from a shaping-factor table is
a judgement wearing a number's clothes.** Multiplying the second into a BDD-exact
computation produces a top-event probability with fake precision — the exact sin
the product exists to prevent. We already refuse to render a handbook default and
a test-derived figure identically. Putting an elicited HEP into a tree would be
the same error, one layer up, and we would have built it deliberately.

**If it cannot be defended to the standard of the numbers beside it, it does not
go in the tree.**

---

## 2 · Before anything else: the poster's arithmetic does not reconcile

I recomputed every step from the printed inputs.

| Step | Result |
|---|---|
| **CC(Ex1)** = 0.5×0.39 + 0.5×0.340909 | **0.365455 ✓** exact match |
| **CC(Ex3)** = 0.5×0.39 + 0.5×0.340909 | **0.365455**, poster prints **0.350455 ✗** |
| **CC(Ex2)** = 0.5×0.34 + 0.5×0.318182 | **0.329091**, poster prints **0.284091 ✗** |
| **Aggregation** S1 = Σ CC·W | **0.375796**, poster prints **0.028409 ✗** (~13× out) |
| **Defuzzification** centroid of printed S1–S4 | **0.113332 ✓** matches to 6 dp |

The aggregation error is substantive, not a typo. The poster defines
`R_AG = Σ CC(Exi)·P(Exi)` *"where P(Ei) = Weight (Wi)"* — but you aggregate the
experts' **judgements** weighted by CC, not their weights, and since
`CC = 0.5·Wi + 0.5·RA` already contains Wi, using it again double-counts
seniority. The `×1 ×2 ×3 ×4` producing S1–S4 gives it away: those integers stand
where the four parameters of each expert's trapezoidal fuzzy number belong.

Compressed LinkedIn summary of a real published method — the method is likely
fine, the poster is where it broke.

---

## 3 · What survives the ruling — elicitation hardens ASSUMPTIONS, never numbers

The technique still has a home. It just moves down a layer, and it turns out to
fit better there.

Our HF lane already holds **typed assumptions with owners and status**, and
already enforces the **credited / uncredited** two-posture rule. What it does not
have is any method for how an assumption gets *established* — today
"the crew will detect and respond within 8 seconds" is one engineer's sentence
with a name attached.

Structured elicitation gives that sentence a panel, recorded weights, a measured
agreement between experts and a consensus figure — **and stops there.** No
probability. No tree.

Where it would earn its place:

1. **Discharging a credited crew action.** Credit the action and the assumption
   must be discharged. "Three specialists, weights and their recorded basis,
   consensus 0.87, one dissenter and here is where he dissented" is a far
   stronger discharge than one signature — and it is exactly what an authority
   probes when it asks how you know.

2. **Consensus as a confidence signal, not a value.** Low agreement means the
   assumption is weakly supported: the confidence tier drops, the assumption
   stays open, and everything downstream inherits that. A **status**, not a
   number. This is the same posture we already take on single-source
   transcriptions.

3. **Feeding the workload ↔ severity divergence check.** Where a classification
   rests on judgement about crew capacity, a panel's consensus is a better input
   to that check than one person's view.

4. **Re-elicitation staleness — the part nobody else has.** If the task changes,
   the design under it moves, or a panel member leaves, the elicited assumption
   flags stale on the thread. Every HRA tool on the market treats an expert
   judgement as a permanent fact once entered. Ours would know when the thing the
   judgement was *about* stopped being true.

Point 4 is the differentiator and it does not require a single number to exist.

---

## 4 · Recommendation

**Not a quantification feature. An assumption-hardening feature**, sitting inside
the HF lane we already have, with the consensus expressed as confidence and
staleness rather than as a probability.

If it is built:

- implement from the primary sources, not the poster
- verify against a published worked example
- state the limit on screen as we always do — structured elicitation is a way to
  produce and defend an engineering judgement, not an accepted means of
  compliance

**Open question for Waqas:** worth doing at all, or does the existing
typed-assumption-with-owner model already do enough? The honest case against is
that a panel of three is a heavier process than most programmes will run for a
single crew assumption, and the feature could sit unused.

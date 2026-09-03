# Nav v2 — the plan drives the WHOLE nav

**Plan + mockup for Waqas, 14 Aug 2026. Decision: program planning drives the nav
(his call, matching my recommendation). This document is the working plan; the
mockup (`nav_v2_mockup.html`) is the thing to react to.**

---

## ⚡ What already exists — do not rebuild it

`program_plan.js` v1.1 is literally headed **"THE PLAN DRIVES THE NAV."** Shipped
machinery, verified in the code today:

- 28 catalogue lanes with `snav`/`tabs` mappings → **37 of the sidebar's 76 items
  are already plan-gated** via `applyNav()`.
- **Signed tailoring opt-outs:** turning OFF a lane the certification basis expects
  while it holds data requires rationale + signature, recorded to
  `safetyProgramPlan.tailoredLanes` — the core THROWS without both.
- **Doctrine:** data never deleted on deselect; re-enable restores everything.
- **Grandfathering:** legacy projects get all legacy lanes ON, opt-ins OFF.
- **Cert-basis defaults:** new projects derive their lane set from the intake
  wizard's basis (`BASES`, `expected`, `initScope`).
- Display/author split: `applyNav()` touches DOM only; all writes via `setLane()`.

**So v2 is not "make the plan drive the nav." It is: finish the job.** Three gaps:

1. **39 items are outside the plan entirely** — spine, references, interop,
   verification, admin — permanently visible to everyone. Fully expanded, the rail
   is ~85 rows.
2. **The grouping is by activity** (Define / Analyze / Requirements / Prove /
   Admin & AI), not by the program's lifecycle — even though the six-cockpit
   dashboard (AFHA→PASA · SFHA→PSSA · SSA→ASA) already defines the product's real
   spine.
3. **A deselected lane simply vanishes** — from the nav there is no path to
   "what else could this program run." Discovery requires already knowing the
   Program Planning page exists.

---

## The three moves

### Move 1 — regroup the rail around the lifecycle spine

Top level becomes the shape of a safety program, not a list of activities:

```
▦  Dashboard  (six cockpits — the landing)
◆  Golden Thread · live
────────── THE PROGRAM ──────────
Program           SPP · cert basis · flight phases · process map
Define            functions · FCIM · AFHA · assumptions · aircraft reqs
Aircraft assessment    PASA · ASA
System assessment      system workspaces · SFHA · PSSA · SSA
Analyses          ← declared lanes only: FTA · Markov · FMES · CCMR ·
                    CCA (ZSA/PRA/CMA) · CEA · STPA · HF set · items/LRUs
RAM               ← declared lanes only (reliability / maintainability sets)
Verify & prove    reqs repo · validation matrix · MoC · V&V roll-up ·
                    DAL credit · traceability · thread integrity ·
                    evidence package · in-service watch
────────── PROGRAM ADMIN ──────────
Interoperability  ReqIF · Jama/Polarion/DOORS · Cameo/SysML   (ONE entry)
Configuration     baselines & CM · reviews · OPRs · mod impact · locks
ANEM & AI         assistant · live chat · AI assumptions
＋ Catalogue — {N} lanes not in this program
⌘K  Find anything
```

Rules:
- **References leave the rail** (definitions, DAL reference, 4754B App A
  objectives, ARP process map, math validation benchmarks) → reachable via ⌘K and
  a References entry inside Program. Reference material is consulted, not
  navigated to daily.
- **Interop consolidates** to one entry with an inner page (today it's 3 rail
  items + reqif tab).
- A group with **zero declared lanes disappears entirely** (e.g. RAM on a program
  that declared none) — the Catalogue entry carries the count so absence is
  legible, not mysterious.
- The spine (Define, assessments, Verify) is **never gated** — v1.1 doctrine
  stands: a program without hazard identification isn't a program.

### Move 2 — the Catalogue entry (discovery without clutter)

One rail entry: **"＋ Catalogue — N lanes not in this program."** Opens the SPP
scope section (the existing one — same signed flow, same tailoring rules). Every
undeclared lane shows its standard citation (the corrected 4761A appendix letters)
and an **Add to program** action = existing `setLane(id, true)`. Nothing new to
sign-off machinery; the catalogue is a *view* of what v1.1 already governs.

Inverse advisory (new, small): a lane holding authored data while **undeclared**
raises the mirror of the existing declared-but-never-exercised advisory. Scope can
never hide data silently.

### Move 3 — ⌘K palette (the reachability escape valve)

`nav_palette.js`, born modular. Fuzzy search over: every tab label + aliases,
systems (workspaces), and **undeclared lanes — labeled "in catalogue — add to
program"** (selecting one routes through the signed declare flow, never silently
enables). This is what makes aggressive decluttering safe: nothing is ever more
than two keystrokes away, declared or not.

---

## The numbers (why this is worth it)

| State | Rail rows (fully expanded) |
|---|---|
| Today, any project | **~85** |
| v2 — full Part 25 program, everything declared | **~34** |
| v2 — Part 23 lean program | **~20** |
| v2 — collapsed groups (default resting state) | **~14** |

---

## Implementation plan

**Phase A — regroup (markup + projection).** `index.html` sidebar restructured to
the lifecycle groups; references/interop moved; Catalogue entry added.
`program_plan.js` v1.1 → v1.2: expose `declaredScope()` (mirrors
`declaredToolchain()`), group-level hide (zero declared lanes → group gone),
catalogue count. No changes to `setLane`/`initScope`/tailoring — the author path
is untouched.

**Phase B — palette.** `nav_palette.js` (new, classic script, zero monolith
edits): index built from the DOM labels + `CATALOGUE` (`_byTab`), ⌘K/Ctrl+K,
undeclared results labeled and routed through the signed flow.

**Phase C — polish + evidence.** Collapse-state persistence (existing UI-state
localStorage pattern); first-run resting state collapsed; **Oladele's fresh-eyes
app pass re-aimed**: "which lanes would you have declared, and did the rest get in
your way" — his fortnight of fresh eyes is the acceptance test.

**Tests (extend the wall):**
- lane off → its snav hidden AND catalogue count increments (projection pins)
- spine/assessment/verify entries never gated (pin the ungated set by id)
- references absent from the main rail; present in palette index
- palette finds an undeclared lane and labels it; selecting routes to declare, does NOT silently enable
- tailoring opt-out still throws without rationale + signature (regression on the untouched author path)
- zero-declared group hidden; Catalogue count = catalogue minus declared

**Ship gates:** full wall green → screenshot pass on all three states (full 25 /
lean 23 / collapsed) → Oladele pass logged → ship.sh. Desktop picks it up at the
next `sync-app.sh` release (0.15.0 batch).

**Deliberately NOT in v2:** role-based views ("my areas" via workspace owners) —
real, but it compounds with scope; ship scope first, measure, then decide.
Renaming lanes or touching any analysis page content — this is chrome only.

---

## Open questions for Waqas (mockup will make these concrete)

1. Group names: "Aircraft assessment / System assessment" vs cockpit names
   ("PASA · ASA / PSSA · SSA") on the rail?
2. Does **Items & LRUs** live in Analyses (current) or Define? It's master-data,
   Define feels truer.
3. ANEM: keep in Admin group, or promote to a persistent bottom-rail slot beside
   ⌘K? (It's the other "find/ask anything" surface.)
4. SORA thread: Prove group today — keep under Verify & prove, or under Program
   (it's a basis-specific thread like the cert-basis spine)?

---

# REV B — Waqas's restructure (14 Aug, evening)

**His rulings, superseding the Rev A rail sketch:**

1. **Spine reads as ARP4761A App A–F, explicitly:** Functional definition
   (breakdown · functions · FCIM) → **AFHA** → **PASA** → **Systems** (each
   directory: SFHA → PSSA → SSA) → **ASA** → Verify & prove. Suffix labels
   ("planned", "as operated", "assessment") dropped — the appendix names carry.
2. **Fault trees live under the assessments, not as a tool tab.** PASA = the
   aircraft tree in ALLOCATION posture (top-down apportionment, signed as the
   PASA baseline). ASA = the SAME tree in VERIFICATION posture, diffed against
   that baseline. PSSA/SSA identical pattern per system. **One tree per level,
   two postures — never copies.**
3. **The cascade:** AFHA target → PASA apportions to system boundaries → each
   boundary mints a **BUDGET HANDOFF** (allocated target · owning system ·
   status: allocated → accepted → demonstrated → closed) → each system's PSSA
   tree INHERITS its top target from the handoff (linked, never retyped) →
   SSA demonstrates against it (BDD-exact, evidence attached) → ASA rolls
   demonstrated values back up; **close-out is computable** (every handoff
   demonstrated ≤ allocated, credited assumptions discharged, aircraft roll-up
   meets target). Staleness flows BOTH directions (reallocation reopens
   downstream; degraded demonstrated value reopens the ASA roll-up).
   The ASA page's centerpiece is the close-out ledger (see mockup Rev B).
4. **System directories house:** SFHA · PSSA · SSA · FMEA · FMES ·
   system-scoped reliability & maintainability · requirements · assumptions.
5. **Carve-outs stay program-level** (cut across systems by nature): the CCAs
   (ZSA/PRA/CMA), MSG-3 zonal/structures/L-HIRF, MMEL/TLD, LCC, spares.

**Viability audit against the code (14 Aug):**
- ✅ ftaConfig already carries mode top-down/bottom-up + apportion + targetP +
  linkedFhaId → becomes the posture switch.
- ✅ Baselining machinery exists (versioned) → PASA/PSSA signed baselines.
- ✅ Transfer gates exist → the handoff boundary.
- ✅ Demonstrated rates already flow into trees (RAM bridge → getEffectiveLambda).
- ✅ FMEA rows already carry scope:'system' + owningSystemId → per-system
  FMEA/FMES = filtered views + flagged unassigned bucket for legacy rows.
- ✅ systemsData rows own functions/fcim/fha/req/asm.
- ❌ **Budget handoff object does not exist** — apportionment today lives inside
  one tree; nothing links an aircraft-tree node's slice to a separate system
  tree's target. THE new build.
- ❌ **ftaPages is flat, aircraft-level** — needs owningSystemId + migration
  (assign or flagged-unassigned, never lost).

**Build order (revised):** Phase A rail regroup (as Rev A, new spine) →
Phase B owningSystemId on trees + per-system housing → Phase C budget handoff
object + posture baselines + close-out ledger → Phase D palette → Oladele pass.
Phase C is the differentiator and the biggest lift; A/B/D are projection.

---

# RULING (Waqas, 14 Aug, late): THE OG LAYOUT STAYS.

After the click tests: keep Define / Analyze / Requirements / Prove / Admin & AI
exactly as-is — every item where muscle memory expects it, zero relearning, all
76 tab ids and pinned tests untouched. The Rev A/Rev B lifecycle-spine rails are
PARKED (mockups stay in docs/ as reference — do not build them unprompted).

**What we take forward (small, additive):**
1. Collapsed-by-default groups with persisted state (~7-row resting rail).
2. The Catalogue — N lanes entry (discovery for v1.1's plan-gating; same signed
   declare flow; hidden ≠ mysterious).
3. ⌘K palette (nav_palette.js) — tabs, systems, undeclared lanes labeled and
   routed through the signed flow. This is what makes the deep OG tree cost
   nothing.

**The cascade survives intact — as PAGES inside existing tabs, not as nav:**
- Budget handoffs ledger → section on the FTA page (where apportionment lives).
- PSSA trees inherit targets from handoffs (linked, never retyped) inside the
  existing system workspaces.
- Close-out ledger → centerpiece of the existing ASA tab.
- One tree per level, two postures (ftaConfig mode + baselines) — data-model
  work, independent of nav. Keeping OG costs none of it.

Mockup of the decision: docs/nav_og_final.html (program presets show v1.1
gating live). Click-test harnesses: nav_v2_clicktest.html (Rev B) and
nav_today_clicktest.html (OG) — kept for the record of WHY.

**STATUS UPDATE (same night):** the "OG stays" entry above is a WORKING POSITION,
not a final ruling — his words: "we need to work on this quite a bit more."
Nothing gets built from this document yet. Iteration continues.

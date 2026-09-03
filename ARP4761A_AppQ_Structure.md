# The model — Waqas's chain, and ARP4761A Appendix Q read cover to cover

Two things in one file. **Section 0 is authoritative**: Waqas's statement of the chain, 20 Aug 2026.
Sections 1–6 are Appendix Q read end to end (Q.1–Q.17) on his instruction, after I twice reasoned
from Aeolus's data instead of from the standard and got the model wrong both times. Section 7 is the
gap list, rewritten against section 0.

**SAE copyright: clause numbers, table numbers and titles only. No prose is reproduced.** The PDF is
at `~/Downloads/SAE ARP4761A.pdf`; App Q runs pages 358–692.

---

## 0 · THE CHAIN — Waqas, 20 Aug 2026

Recorded close to verbatim. This is the spec; where sections 1–6 differ, this wins.

### Left-hand side of the V — allocation, top-down

1. **Aircraft function**
2. **Aircraft SUB-function** — *"to get a more granular insight otherwise not available with an
   abstract function"*
3. **Aircraft sub-function's failure conditions identified in the FCIM**
4. **Aircraft sub-function's failure conditions assessed in the AFHA workbook**
5. **Fault trees generated for aircraft failure conditions** — CAT, HAZ, MAJ, per the charting
   feature in the tool — for the **PASA at aircraft level**, allocating budgets to:
   - the **system functions**, and
   - the **resource system functions**
   
   contributing to that aircraft failure condition — as established by the **interdependence
   analysis** and the **common resource allocation**.
6. **System functions — NO sub-functions.** The asymmetry is deliberate: the aircraft level has
   sub-functions, the system level does not.
7. **System failure condition identification matrix**
8. **System SFHA workbook** — and the governing rule:
   > *depending on the budgets and DALs allocated at the aircraft level, the model needs to ensure
   > the **tighter of the two allocations persists** for the system function and functional failure
   > condition.*
9. **System fault trees generated for the PSSA**

→ that completes the left-hand side of the V.

### Right-hand side of the V — verification, bottom-up

10. Start with the **FMEA / FMES**
11. **Connect those to the fault trees at the ITEM level** where needed
12. **Plug in failure rates**; confirm the design closes in the **SSA**
13. **The aircraft verification trees are then very nearly automatic** — every aircraft failure
    condition allocates to system functions, so at PASA level they are just bottom-up trees, and the
    **V&V mirror trees** already exist.

### What this settles

- **Aircraft: function → sub-function. System: function only.** The tool's data already does exactly
  this — `acFunctionsData` carries `funcId` + `subId`; `systemsData[].functions` carries `funcId`
  alone. My earlier note that the two-level flattening might be a limitation is **withdrawn**.
- **The FCIM sits at the level below the abstraction**: aircraft sub-function, system function.
  Both are already keyed that way in the tool.
- **Resource systems participate as functions too** — "resource system functions", not bare systems.
- **Tighter-of-two is a modelling rule, not a report** — it applies to budgets *and* DALs, per system
  function and per functional failure condition.

---

## 1 · Appendix Q — the seventeen sections

The example is the **S18**, a fictitious twin-engine transport. One aircraft function —
*3.2.2 Decelerate on ground* — is carried the whole way down through every analysis to closure.

| § | Title | What it contributes |
|---|---|---|
| Q.1 | Outline / Description / Acronyms | scope, the S18 |
| Q.2 | RESERVED | — |
| **Q.3** | **AFHA** | aircraft functions → FCIM → failure conditions → effects → severity |
| **Q.4** | **PASA** | interdependence, CoFFE, common resource, CMA/PRA/ZSA inputs, FDAL, MF&MS FTA |
| **Q.5** | **WBS SFHA** | the same method as Q.3, one level down |
| **Q.6** | **WBS PSSA** | functional mapping → FTA → latents → independence → completion |
| Q.7 | BSCU Dependence Diagram | alternative to FTA, feeds the WBS SSA |
| Q.8 | Markov Analysis | shown **equivalent** to the Q.6 FTA on the same behaviour, rates, exposures |
| Q.9 | WBS PSSA using MBSA | an alternative route through the whole PSSA |
| Q.10 | BSCU FMEA / FMES | failure rates for **named FTA basic events**; FMES groups modes into effects |
| Q.11 | BSCU CMA | evaluates the Independence Principles PASA/PSSA identified |
| Q.12 | BSCU SSA FTA | feeds the WBS SSA |
| Q.13 | WBS SSA | verification against SFHA conditions and PSSA requirements |
| Q.14 | ZSA | MLGB zone; finds an installation threat to an Independence Principle |
| Q.15 | PRA | Uncontained Engine Rotor Failure; feeds requirements back into PASA |
| Q.16 | CEA | qualitative aircraft-level bottom-up from BSCU initiating conditions |
| Q.17 | ASA | closes the loop across all of it |

---

## 2 · Aircraft and system levels run the same method

Q.5 is not a decomposition of Q.3 — it is the same method run again one level down, with its own
inputs, matrix and worksheet.

| step | Aircraft (Q.3) | System (Q.5) |
|---|---|---|
| function list | Table Q.3-1 · `3` → `3.2` → `3.2.2` | Table Q.5-1 · `1` → `1.1 … 1.4` |
| review and confirm | Q.3.4.2 | Q.5.4.2 |
| **Failure Condition Identification Matrix** | Table Q.3-2 | **Table Q.5-2**, headed *System Function* |
| crew awareness split | Table Q.3-3 → `.A` / `.U` | Table Q.5-3 → `.A` / `.U` |
| effects per flight phase | Q.3.4.4 | Q.5.4.4 |
| severity classification | Q.3.4.5 | Q.5.4.5 |
| assumptions | Table Q.3-4 (`ASMP …`) | Q.5.4.6 (`SASP …`) |
| worksheet output | Table Q.3-5 | Table Q.5-4 |

The FCIM generates the failure conditions at both levels, on the same axes: rows = the function,
columns = **Total Loss / Partial Loss / Malfunction**. Ids are the function id + mechanism +
awareness — `3.2.2.TL.A` at aircraft, `1.1.TL1.A` at system.

---

## 3 · The system function is the join key at system level

1. **Interdependence, Table Q.4-1** — columns are the system *with its function*:
   *Wheel Brake (F1 decelerate wheels on ground)*. Common resources get their own table, **Q.4-2**,
   resource × system function — deliberately separate from Q.4-1.
2. **Functional failures, Q.4.2.4** — notation stated outright: `Fx` the function, `FFx` its general
   functional failure, `FFx.y` a detailed one. FF1.1 total loss, FF1.2 partial, FF5.3 malfunction.
3. **Those map to SFHA conditions, Q.4.2.5** — FF1.1 → `WBS.TL`, FF5.3 → `PRS.MF`; `WBS.TL` is the
   union of `1.1.TL1.A` and `1.1.TL1.U`.
4. **FDAL, Table Q.4-13** — assigned per system function, from Functional Failure Sets built out of
   the fault tree's minimal cut sets. Q.6.2.3.1 repeats it inside the system.
5. **Requirements, Table Q.6-2** — written *about the function*.

---

## 4 · Where the fault tree comes from

**Q.6.2.2 Functional Mapping** — the SFHA function list is mapped onto architecture elements
(Figure Q.6-5), and the text states that **the functional mapping diagram forms the basis for the
PSSA fault tree structure**. The tree is the mapping expressed as logic.

At aircraft level the equivalent is **Q.4.4.2**: the FTA (Figure Q.4-1) is built from the CoFFE
result — Table Q.4-6's 81 cases reduced through Q.4-7 to Q.4-8's three combinations.

---

## 5 · Iterative and bidirectional, not a waterfall

- **Q.4.2.5** — the SFHAs are **not** needed to start the PASA; CoFFE can identify the functional
  failure states first and those later support SFHA completion.
- **Q.15 PRA** feeds proposed requirements into the PASA early, then SSA/ASA later.
- **Q.14 ZSA** finds an installation threat that invalidates an Independence Principle.
- **Q.6** iterates: WBS initial → BSCU first → BSCU update → WBS update.
- **Q.7 / Q.8 / Q.9** are alternative techniques to the Q.6 FTA.

---

## 6 · The verification side

- **Q.10.1** — the FMEA supports **named basic events** in a specific tree with updated rates.
- **Q.10.7, Table Q.10-6** — the **FMES** groups the FMEA's modes into **failure effects**. Effects,
  not modes, are what the tree consumes.
- **Q.13** — the SSA verifies against SFHA conditions and PSSA requirements.
- **Q.17** — the ASA confirms the SSAs did so, then re-evaluates the AFHA conditions across the set.

---

## 7 · Gaps — measured END TO END in the live tool, 20 Aug 2026

Walked all 13 steps of section 0 against the K350 Kestrel showcase. **Demo incompleteness is
excluded** on Waqas's instruction ("it's just a demo, not a full program") — only things the tool
cannot express at any level of data completeness are listed.

### Works, structurally

| step | measured |
|---|---|
| 1–2 aircraft function → sub-function | 8 functions → 13 sub-functions |
| 3 aircraft FCIM on the sub-function | 13/13, every one with TL + PL + MF + awareness |
| 4 AFHA workbook on the sub-function | 16/16 keyed; 15/16 FC ids originate in the FCIM |
| 6 system functions, **no** sub-functions | 21 functions, 0 sub-functions — matches the ruling exactly |
| 7 system FCIM on the system function | 7/7 keyed to `SFN-…`, all with TL/PL/MF |
| 9 system trees for the PSSA | 8 trees, all linked to a failure condition |
| 10–12 **the whole rate path** | see below — it computes |

### The right-hand side already computes

Proven by execution, in memory, restored after:

- `fmeaData[].beId` links an FMEA row to a basic event (10 of 19 rows carry one)
- **`fmesGroups()` is Table Q.10-6**: piece-part rows grouped by **end effect × detection**, with
  `sumRate` = Σλ over the modes and the set of basic events fed. 10 groups on K350.
- **`fmesAdopt()` pushes Σλ into the node** and recalculates
- measured: leaf λ 2.0e-5 → 8.0e-6 from the group's Σλ, **top event moved 2.3391e-9 → 1.7991e-9**,
  and the verified number is comparable against the allocation twin's budget (5.0e-10 here, so that
  demo tree closes at 3.6× over — demo data)
- `createVerificationTreeFromActive()` generates mirrors; `_findVerificationMirror()` finds them

**So "the right side is fully automated once rates are connected" is nearly true already.** What
stops it being automatic:

| # | gap | detail |
|---|---|---|
| R1 | **no sweep** | `fmesAdopt` is one button per group. 9 of 10 groups on K350 are adoptable right now; nothing adopts them together. 0 of 79 leaves have ever been adopted. |
| R2 | **snapshot, not a live link** | adopt writes `inputMode: 'lambda'` and stamps `_fmesGroup`. If the FMEA changes afterwards the node keeps the stale λ. The stamp makes it *detectable*; nothing detects it. This is **A8**, owed in five places and built zero. |
| R3 | **multi-BE groups need a human** | `fmesAdopt` refuses unless the group links exactly one basic event. None on K350; real projects will have them. |
| R4 | **recompute is active-page scoped** | `calculateAllProbabilities()` works from `getRootAncestorPageOfActive()`. Any sweep must activate each page or gain a page-scoped compute. Cost me a false negative before I spotted it. |

### Structural gaps on the left-hand side

| # | the chain says | tool today |
|---|---|---|
| **L1** | SFHA rows belong to a **system function** (step 8) | **0 of 20** key to one; all key to an aircraft sub-function. 13 of 20 FC ids *do* come from the system FCIM, so the join exists — only the key is at the wrong level. **Everything else waits on this.** |
| L2 | aircraft trees allocate to **system functions and resource system functions** (step 5) | all 20 leaves on the 11 aircraft allocation pages declare nothing. Even with C1 a node can say who owns it; nothing says *this leaf is system function X's budget*. |
| L3 | interdependence is per system function (step 5) | `idpCell(fc, systemId)` — the signature cannot express a system function or a resource system function. **A10.** |
| L4 | **tighter of the two allocations persists**, per system function and functional failure condition (step 8) | severity: `moreRestrictiveSev` **built**. Probability: node-level via `externalSource`, inherited ceiling governs — **built, not function-keyed**. **DAL: not built.** |
| L5 | aircraft verification trees near-automatic from system-function results (step 13) | mirrors exist and 8 of 11 aircraft trees have one, but they are hand-built twins. Nothing composes system-function verified results upward. |

### NOT gaps — corrected after measuring

- ~~`clauses[].of` needs a schema change~~ — **it already accepts a function id.**
  `validateMembers` allows `kind: 'function'` and raises a finding on a bare system, saying MAC is
  declared per system function. **B6 is data + resolver, not model surgery.**
- ~~the two-level aircraft function hierarchy is a limitation~~ — aircraft has sub-functions, systems
  do not; the tool already models exactly that.
- ~~no FMEA data / no rate path~~ — `fmeaData` holds 19 rows and the path works end to end.

### Four probe errors in one session — the standing lesson

`fmeaData` looked absent (I searched per-system, it is global) · MAC member validation looked like a
schema gap (I read the data, not `validateMembers`) · λ looked like it never flows from FMEA (the
line is `hit.node.lambda = g.sumRate`, which contains neither "fmea" nor "fmes") · the top event
looked frozen (the page was not active). **Every one of them was a probe reporting an absence, and
every one was wrong.** Rule 19 — a finding of nothing is a finding, and has to be falsified the same
way as a finding of something.

# BUILD SPEC — Vayu VY-6, the third eval fixture (+ the first Human Factors source document)

**Tag:** `HF Model improvement` · `eval fixture`
**Date:** 2 Sep 2026
**Driver:** Sarla demo, next week.
**Status:** SPEC. Nothing built.
**Pattern:** `eval/fixtures/halcyon/` — same build discipline, same layout module split, same gates.

---

## 0 · The decision, and the one rule that makes it safe

**Waqas's call: the aircraft is named Vayu VY-6, and it is built to the Shunya.** The document is
ours; the envelope it describes is the one Sarla have published.

That combination is the strongest available. Naming it Vayu means no page ever claims to be Sarla
design data, so no engineer in the room can catch us asserting something false about their aircraft.
Configuring it to the published Shunya envelope means every number they recognise is their own, which
says we did the homework rather than brought a generic prop. One rule keeps it clean:

> **Every fact in the document is either public, or visibly marked as representative.**

**Public, and carried into the aircraft-level description** (sources in Appendix B): six passenger
seats plus pilot; 15 m wingspan at full scale; 250 km/h top speed; 680 kg payload; urban legs of
20–30 km with a longer-range growth path; electric propulsion; urban air-taxi concept operating from
city vertiports; a VTOL certification basis with service targeted from 2028. These are the figures a
Sarla engineer will recognise on sight, which is the point.

**Not public, and therefore representative:** everything below aircraft level — the sixteen systems,
their internal architecture, redundancy structure, interfaces, zonal layout, flight-deck detail and
every crew task. We do not have their SDD. Nobody's SDD is public.

The cover carries this notice and the running footer carries a short form of it:

> Demonstration article. The Vayu VY-6 is a representative six-passenger eVTOL constructed by
> Safety Lab Aero for demonstration purposes. Aircraft-level characteristics follow published
> information for aircraft in this class, listed with sources in Appendix B. System architecture
> below aircraft level is representative and is not the design data of any manufacturer.

**Say it out loud in the room, once, early.** One sentence: *"this isn't your aircraft — it's a
stand-in built to your published envelope, because we didn't want to put words in your SDD's mouth."*
That removes the only failure mode this choice has, an engineer recognising a detail that is not
theirs and quietly concluding the tool invents things. It also sets up the line you actually want:
*this was built from public material in a few days; this is what it looks like running on your real
SDD.*

---

## 1 · Why a third fixture

Aeolus (14 systems, Part 25, four-engine freighter) and Halcyon (16 systems, Part 23 / AC 23.1309-1E
Class III, hybrid-electric amphibian) between them prove the engine is not tuned to one PDF. Neither
touches the certification basis that matters most to this audience, and neither carries a human
factors source document at all — the nine HF lanes have never been driven from a document.

Vayu is different on purpose in three ways:

1. **Certification basis: VTOL.** This is the fixture that exercises the SC-VTOL work corrected on
   31 Aug — the Basic 1/2/3 split and Enhanced, with the category-dependent Catastrophic and
   Hazardous bands. See §7; this is the centrepiece of the demo, not a detail.
2. **Failure vocabulary neither existing fixture uses:** hover control authority, transition
   (hover → wing-borne) failure, distributed-propulsion asymmetry, lift-unit loss, high-voltage
   isolation and arc fault, energy reserve and state-of-charge margin, vertiport wind environment,
   single-pilot operation, ballistic recovery inhibit. *Thermal runaway is deliberately NOT the
   headline term* — Halcyon already owns it; here it is one contributor among many.
3. **A second document type.** The Human Factors Description (§4) is new to the fixture family and
   is what makes the HF lanes demo from a document rather than from typing.

Same FORM as the other two throughout — same section skeleton, same six §5 subsections, same §5/§6
mirroring — so only content varies between inputs.

---

## 2 · Deliverables

| # | File | Purpose |
|---|---|---|
| D1 | `VAY-SDD-0001_Vayu_VY-6_Architecture_and_SDD.pdf` | Architecture + SDD, combined, Halcyon pattern |
| D2 | `VAY-HFD-0001_Vayu_VY-6_Human_Factors_Description.pdf` | HF source document, new type |

Both land in `~/Downloads` beside the other two — that is where the app ingests source documents
from. Build source lives in `eval/fixtures/vayu/`, regenerable, with its own `README.md` written to
the Halcyon README's standard (md5, page/char/system counts, why it exists, figures, the discipline
it is under, regenerate instructions).

---

## 3 · D1 — Architecture and System Design Description

### 3.1 Shape

Target **31–34 pages, 70,000–80,000 extracted characters, 16 systems** — deliberately in the same
band as Halcyon so a three-way comparison stays fair. Cover, dot-leader contents, numbered two-level
headings, running footer carrying the fiction notice and the document id.

    §1  Introduction            1.1 Scope · 1.2 Aircraft summary · 1.3 Terms and severity scale
                                (1.2 carries ONLY the Appendix B public facts — six passenger
                                 seats plus pilot, 15 m span, 250 km/h, 680 kg payload,
                                 20-30 km urban legs, electric propulsion)
    §2  Operational concept     urban air taxi, vertiport-to-vertiport, day/night, defined legs
    §3  Certification approach  basis and category — see §7. NO targets, NO DALs.
    §4  Aircraft configuration  general arrangement, mass, energy, occupancy
    §5  Systems                 16 systems × six subsections (below)
    §6  Zonal and installation  zonal model + per-system installation narrative mirroring §5
    App A  Interface summary table
    App B  Source of aircraft-level facts — one row per public fact, with its source

**§5 subsections, in this exact order, for every system** (unchanged from Halcyon, because the
parser and the coverage metric depend on it):
`Purpose` · `Description & Architecture` · `Redundancy & Reconfiguration` · `Interfaces` ·
`Installation & Segregation` · `Operation`

### 3.2 The sixteen systems

Codes are **three letters, no digits** — see §6.2. No em dash anywhere in a heading — see §6.1.

| Code | System |
|---|---|
| DEP | Distributed Electric Propulsion |
| LFT | Lift Unit and Rotor Assembly |
| HVB | High Voltage Battery and Energy Storage |
| EPD | Electrical Power Distribution |
| TMS | Thermal Management |
| FCS | Flight Control System |
| ACT | Flight Control Actuation |
| NAV | Navigation and Air Data |
| COM | Communications |
| DAA | Detect and Avoid |
| DIS | Flight Deck Displays and Controls |
| LGS | Landing Gear and Ground Contact |
| STR | Airframe Structure |
| CAB | Cabin and Occupant Safety |
| ERS | Emergency Recovery System |
| HMS | Health Monitoring and Data Recording |

`ERS` carries the ballistic recovery function. `DIS` is the bridge system between D1 and D2 — the
flight deck is described physically here and behaviourally there, and the two must agree.

### 3.3 Content rules

State design facts freely. State **no safety commitment**: no "within 1 second", no "for 30
minutes", no "1.0E-09 per flight hour", no redundancy claim expressed as a probability. Those are
the assessment's to derive, and the demo records them as assumptions — which is the point being
demonstrated.

Redundancy is described **structurally** ("six lift units on three independent power channels; any
one channel may be isolated") and never **evaluatively** ("tolerant to any single failure"). The
first is a design fact. The second is a conclusion, and conclusions are what we are asking the tool
to produce.

### 3.4 Figures

Vector, drawn from spec, `_bounds_ok` guard active — a figure whose shapes escape the frame must
fail the build, not ship.

    Figure 1-1        general arrangement: plan, profile, front elevation, one scale
    Figure 6-1        zonal model, zones overlaid on the profile with a plan inset
    Figure 6-2..6-17  one block schematic per system, typed lines
                      (HV / LV / coolant / signal / mechanical / structural), per-figure legend

Typed-line vocabulary drops Halcyon's fuel and bleed, adds HV as the dominant type. No 3D renders —
drawn 2D engineering views, for the reason the Halcyon README gives.

---

## 4 · D2 — Human Factors Description (new document type)

### 4.1 Why it is separate

The nine HF draft lanes (`tid, alloc, task, hea, alerts, ergo, cd, sa, mfc`) need a source that
describes *crew, task and interface* rather than *equipment*. Folding that into the SDD would bury it
and would make the HF lanes look like a by-product of the systems document. Separate also proves
something worth proving in the room: the tool ingests more than one document type and joins them.

### 4.2 Shape

Target **14–18 pages, 30,000–40,000 characters**. Same cover, contents, footer and numbering
conventions as D1, so the FORM is constant across the family.

    §1  Scope and crew concept       single pilot, six passengers, no cabin crew
    §2  Operating environment        urban vertiports, short high-tempo legs, day/night,
                                     wind and turbulence environment, noise, public exposure
    §3  Flight deck description      geometry, seating, reach and vision envelopes, lighting,
                                     display surfaces, control inceptors, and what is physical
                                     versus what is on glass
    §4  Automation and pilot roles   what the aircraft does on its own, what the pilot does,
                                     what either may do, and how the pilot is told which
    §5  Crew tasks by phase          pre-flight, boarding, vertiport departure, transition,
                                     cruise, transition to hover, approach, landing, turnaround,
                                     degraded and emergency operation
    §6  Alerting philosophy          the alert set, how alerts are presented, prioritisation
                                     intent, inhibits, and what is deliberately silent
    §7  Passenger interface          boarding, restraint, briefing, cabin communication
    §8  Training and qualification   assumed pilot background and recency
    App A  Task index                a flat list of named crew tasks, phase-tagged

### 4.3 Mapping to the lanes

| Lane | Fed by |
|---|---|
| `tid` | §5 task narrative, App A |
| `task` | §5, App A |
| `alloc` | §4 |
| `hea` | §5 degraded/emergency, §6 inhibits |
| `alerts` | §6 |
| `ergo` | §3 |
| `cd` | §1, §4 |
| `sa` | §3 display surfaces, §6 |
| `mfc` | §1, §2, §5 workload narrative |

### 4.4 The cleanliness rule for D2 — read this twice

The document must describe **conditions**, never the **classifications** our lanes exist to produce.
Specifically it must contain:

- **no allocation term** from the product vocabulary (`crew` / `automation` / `shared`) used as an
  assignment. Describe who does what in prose; do not label it.
- **no error mode** from the product vocabulary (`omission` / `commission` / `timing` / `sequence` /
  `selection`).
- **no alert priority or modality label** from the product vocabulary (`Warning` / `Caution` /
  `Advisory`; `visual` / `aural` / `tactile`) used as an assignment. Describe what the pilot sees and
  hears; do not classify it.
- **no Bedford workload rating, no workload score of any kind.**
- **no crew determination conclusion.** §1 states the design intent is single pilot; it must not
  state that single pilot has been shown adequate.
- **no task time in seconds**, no "the pilot has N seconds to". Timing is an assumption the
  assessment makes.

If the document already contains the answer, the lane is transcribing, not analysing, and the demo
proves nothing.

---

## 5 · Shared build mechanics

Copy the Halcyon module split exactly — editing content must never touch layout:

    eval/fixtures/vayu/
        build_sdd.py        layout only, D1
        build_hfd.py        layout only, D2 (same styles, fewer figure types)
        content_front.py    D1 §1–§4
        content_sys_a.py    D1 §5, systems 1–8
        content_sys_b.py    D1 §5, systems 9–16
        content_back.py     D1 §6 captions + Appendix A
        content_hf.py       D2 all sections
        fig_core.py         aircraft views
        fig_sys.py          system schematics (spec-driven: boxes on a coarse grid + typed links)
        fig_hf.py           flight deck layout + task-phase strip for D2
        README.md           to the Halcyon README standard

Non-negotiable gates, all three already proven on Halcyon:

- `rl_config.invariant = 1` — pinned timestamp and document id, so "regenerate and compare the md5"
  is a real check.
- **Encoding gate** — fail the build before writing a page on any character outside WinAnsi. The
  standard fonts render those as a silent black box, and a black box in a measurement instrument is
  worse than a crash. Note this fixture is at higher risk than the others: Sanskrit-derived names and
  any temptation toward ₹ or ° will trip it.
- **`_bounds_ok`** on every figure.

---

## 6 · Parser constraints — both gaps are still open

Neither has been fixed in the product, so the fixture must be built around them.

**6.1 No em dash in any section title.** `_decompSectionChecklist`'s title character class is
`[\w\-&/() ,]`; a title containing an em dash is invisible to it, and the coverage denominator goes
quietly wrong. Use a plain hyphen or restructure the title. Halcyon hit this and had to retitle.

**6.2 No digit in any system code.** The code regex is `\(([A-Z]{2,5})\)`. A code like `EL1` falls
through to title matching — it still groups, but by a different branch, which is an asymmetry inside
the mechanism under measurement. The sixteen codes in §3.2 are all three letters for this reason.

**Verification, not assumption:** run the real `_decompSectionChecklist` over the built PDF's
extracted text and confirm **16 of 16** systems group across §5 and §6, all by code. Record the
result in the README. Halcyon's README records 14-by-code / 2-by-fallback; this one should record
16/16 by code, which is also a small piece of evidence that the parser gap is real and worth closing.

---

## 7 · Certification basis — the centrepiece, and the thing to get right

Six passenger seats. Under the corrected MOC VTOL.2510 §8(a) Table 1 now in the engine, a
**Category Basic** design with 2–6 passenger seats is **Basic 2**: Catastrophic 1e-8 / DAL B,
Hazardous 1e-7 / DAL C, Major 1e-5 / DAL C, Minor 1e-3 / DAL D. A **Category Enhanced** design —
which is where an urban air taxi operating over a congested city plausibly sits — is Catastrophic
1e-9 / DAL A, Hazardous 1e-7 / DAL B, Major 1e-5 / DAL C, Minor 1e-3 / DAL D.

**Two orders of magnitude on Catastrophic, and DAL B versus DAL A, turning on one category call for
the same aircraft.** That is the most persuasive ninety seconds available in this demo, and it runs
on the table you corrected on 31 August. Build the fixture so the category is *stated as an
operational intent in §2 and left unresolved in §3* — the tool makes the call, the engineer confirms
it, and the targets move on screen.

**Three hard rules for §3, all of them lessons already paid for:**

1. **Do not cite an SC-VTOL paragraph number in the document.** The 31 Aug retraction found the
   engine citing `SC-VTOL.2511 / .2521 / .2526 / .2010 / .2305`, none of which exist, and
   mis-titling VTOL.2510. If a paragraph reference is wanted, it comes verbatim from the EASA PDF
   and from nowhere else. A fixture that carries a fake citation into a demo in front of
   certification engineers is a self-inflicted wound.
2. **Do not state any probability target or DAL in the document.** §3 names the basis and the
   category question; the numbers are the engine's to produce.
3. **DGCA.** Sarla certifies with DGCA, not EASA. Do not assert in the document, or in the room,
   that DGCA has adopted SC-VTOL. Frame §3 as a VTOL-category basis with the applicable authority
   named as the programme's, and be ready to say honestly that the applicable Indian basis is
   theirs to confirm and the tool takes the basis it is given. **Verify DGCA's current eVTOL
   certification position before the demo** — it is a live area and an unsupported claim there is
   the one thing this audience is guaranteed to catch.

---

## 8 · Demo choreography this fixture enables

1. Ingest D1. Decompose to functions, populate the FCIM. Point out that the document contains zero
   classifications — everything on screen was derived.
2. Show the category call: Basic 2 versus Enhanced, and the targets moving. Cite the MOC table.
3. Run the FHA. Show a row that abstains, and say plainly why abstention is the correct behaviour.
4. Ingest D2. Run the HF lanes off it — allocation, tasks, alerting, minimum crew — and show them
   joining the safety assessment rather than sitting beside it.
5. Show provenance: the versioned skill stamp on a drafted row, and what it proves a year later.

---

## 9 · Build order, effort, and what is needed from Waqas

| Step | Work | Notes |
|---|---|---|
| 1 | Assemble Appendix B: every aircraft-level fact with its public source, verified | blocks §1.2 wording |
| 2 | Verify DGCA / VTOL basis position | blocks §3 wording |
| 3 | D1 content modules (16 systems × 6 subsections) | the bulk of the writing |
| 4 | D1 figures + build + gates | reuse Halcyon `fig_sys.py` wholesale |
| 5 | Parser verification 16/16 by code | record in README |
| 6 | D2 content + figures + build | new, no precedent |
| 7 | Cleanliness audit of both, counts recorded | §3.3 and §4.4 |
| 8 | Dry run of the choreography end to end | before the room, not in it |

**No golden on this fixture before the demo.** Capturing one is a separate, banner-gated exercise and
the granularity band will need its own value — 16 systems is not 14, and the band was fitted to
Aeolus. Say "we have not yet cut a golden on this document" if asked. That answer is stronger than a
number nobody has earned.

**Cleanliness targets to record in the README, both documents:**

    severity classifications  0     probability targets  0
    DAL assignments           0     "shall" statements   0
    failure-condition ids     0     requirement ids      0
    (D2 additionally)  allocation labels 0 · error modes 0 · alert priorities 0
                       Bedford ratings 0 · task times 0 · crew determinations 0

---

## 10 · Risks

- **Time.** Two documents from scratch in under a week is real work. If it compresses, D1 alone
  still demos the SC-VTOL centrepiece; D2 is what makes the HF lanes sing, so cut scope inside D2
  (fewer systems in the task index) rather than dropping it.
- **The HF lanes are unregistered.** `hf.draftlane` and `hf.improve` are not in the skill registry
  (see `HF_MODEL_IMPROVEMENT.md`). They will run in the demo; they simply cannot yet carry a
  consistency claim. Do not make one in the room.
- **The invite batch is still awaiting deploy.** A demo that stalls on a broken invite is a bad first
  impression. Ship it before the room.
- **Overreach on DGCA.** Covered in §7.3. This is the highest-probability own goal in the whole plan.
- **A recognised-but-wrong detail read as invention.** The §0 notice and the one spoken sentence are
  the entire mitigation, and they only work if they land BEFORE someone spots something. Lead with it.
- **Appendix B drifting from its sources.** Every row cites where the number came from. A public
  figure that turns out to be a journalist's rounding is still traceable; an untraced number is not.
  Re-verify the specs close to the demo date — this programme is moving fast.

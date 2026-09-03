# Vayu VY-6 - third eval fixture, SDD + Flight Deck and Human Factors

Built 2 Sep 2026 for the Sarla demo, to `BUILD_SPEC_Vayu_fixture.md`. Two documents, kept in
`~/Downloads` beside the Aeolus and Halcyon pairs, which is where the app ingests from.

    VAY-SDD-0001_Vayu_VY-6_Architecture_and_SDD.pdf
      md5    d27416d87985d8cc7ce4afc61995b85f
      36 pages - 90,219 chars - 16 systems - 19 figures

    VAY-HF-0001_Vayu_VY6_Flight_Deck_and_Human_Factors.pdf
      md5    383e8f3d5b664594824094f19998b844
      42 pages - 152,667 chars - sections 1-11 + Appendices A, B, C
      3 landscape drawing sheets, also issued standalone

Both are reproducible: rebuild and the md5 is unchanged. The SDD uses `rl_config.invariant`; the HF
document pins `SOURCE_DATE_EPOCH` and suppresses pdftex's date and trailer id. "Regenerate and
compare the hash" is a real check on both.

**Superseded:** `VAY-HFD-0001_..._Human_Factors_Description.pdf`, a 13-page first cut, was replaced
by VAY-HF-0001 at Aeolus parity. It is in `~/Downloads/_superseded/`. Do not ingest it.

## Size against the siblings

| Fixture | SDD | HF document |
|---|---|---|
| Aeolus HL-1 | 61,974 chars, 14 systems | AEO-HF-0001 |
| Halcyon HA-10 | 77,594 chars, 16 systems | HAL-HF-0001 |
| Vayu VY-6 | **90,219 chars, 16 systems** | **VAY-HF-0001, 152,667 chars** |

The SDD is the largest of the three, about 14% above Halcyon. Declared rather than hidden: the
granularity band must be fitted on this document rather than inherited, and a char-for-char
comparison with Halcyon is not fair without saying so.

## What it is

A six-passenger-plus-pilot electric VTOL air taxi. Lift plus cruise, fixed geometry: eight lift
rotors on two booms for hover, two wing-mounted cruise propellers for wing-borne flight, rotors
stopped and indexed in cruise, a transition each way on every sector, no tilting mechanism. 15 m
span, 10.4 m length, 2,600 kg MTOM, 680 kg payload, 200 km/h cruise, urban legs of 20-30 km between
elevated city pads, eight to fourteen sectors a day, **single pilot, no cabin crew**.

**The Vayu VY-6 is ours; the envelope is the Shunya's.** Naming it Vayu means no page claims to be
Sarla design data. Configuring it to their published figures means every number a Sarla engineer
recognises is their own. Appendix B of the SDD lists each aircraft-level fact against its public
source and marks plainly which rows are *not* published. Everything below aircraft level is
representative.

Say it in the room, once, early: *this isn't your aircraft - it's a stand-in built to your published
envelope, because we didn't want to put words in your SDD's mouth.*

## Why it exists

Aeolus (Part 25 freighter) and Halcyon (Part 23 amphibian) prove the engine is not tuned to one PDF.
Neither touches a VTOL certification basis. Vayu is different on purpose in three ways:

1. **A VTOL basis with the category deliberately unsettled.** SDD section 1.3 names the basis and
   leaves the category open. Six passenger seats puts a Category Basic design in Basic 2; an urban
   air taxi over a city argues Enhanced; the two differ by two orders of magnitude on Catastrophic
   and by a DAL letter. The tool makes the call and the targets move on screen. This exercises the
   SC-VTOL table corrected on 31 Aug.
2. **A failure vocabulary neither sibling uses:** hover control authority, transition between
   regimes, distributed-propulsion asymmetry, lift-unit stop and index, high-voltage isolation,
   energy reserve, vertiport wind environment, single-pilot operation, ballistic recovery inhibit.
3. **Single pilot.** Aeolus and Halcyon are two-crew. Every duty split, cross-check and
   incapacitation case in VAY-HF-0001 is different because there is nobody in the other seat.

## VAY-HF-0001 - structure

Follows AEO-HF-0001 section for section, adapted to a single-pilot eVTOL:

    1  Purpose and scope (1.1 provenance convention)
    2  Operating concept as the crew experiences it
    3  Crew station and qualification
    4  Flight deck architecture and geometry (panel zones; geometry data TBD)
    5  Anthropometry and accommodation
    6  Display suite
    7  Controls
    8  Crew alerting
    9  Automation
    10 Procedures, environment and crew-relevant interfaces
    11 What this document does not do
    App A  Normal operating procedures, ten phases
    App B  Non-normal procedures by system, including pilot incapacitation
           and B.15 conditions the design does not resolve
    App C  Control schedule - 34 rows against panel zone and provenance

Every value carries `[GIVEN]`, `[PRELIM]`, `[ASSUMED]` or `[TBD]`. Sixty-seven numbered open items
are carried in section 11.2. An empty field is the correct answer; a plausible number substituted
for a missing one is worse, because the gap is visible and the substitution is not.

## Drawing sheets

    HF-1  fig_vayu_flightdeck.pdf   panel arrangement, zones, 14 numbered callouts, TBD list
    HF-2  fig_vayu_cockpit_ga.pdf   cockpit GA, plan and side section, geometry reference
                                    scheme (STA/WL/BL), design eye position and vision
                                    angles marked TBD
    HF-3  fig_vayu_controls.pdf     inceptor axes, energy lever detents, guarded recovery
                                    handle, bezel keys, and the functions with no
                                    dedicated control

A4 landscape, vector, each also usable as a standalone sheet. The SDD carries the flight deck too,
as Figure 6-18, so a reader of the SDD does not have to leave it to see the crew station.

## The discipline

Both documents describe and classify nothing. Verified on the built PDFs by `audit.py`:

    SDD                                   HF (all of the SDD checks, plus)
    severity classifications   0          allocation labels        0
    probability targets        0          error mode terms         0
    DAL assignments            0          alert tiering            0
    "shall" statements         0          modality labels          0
    failure-condition ids      0          workload ratings         0
    requirement ids            0          crew determination       0
    time commitments           0          task times               0
    tolerance claims           0
    SC-VTOL paragraph cites    0

**No SC-VTOL paragraph number appears in either document.** The 31 Aug retraction found the engine
citing five that do not exist.

### Three things the audit caught that a reader would not

1. **A requirement word inside the sentence claiming there are none.** SDD Appendix A read *There is
   no "shall" in this document*. Reworded.
2. **A contradiction between two sections written by different hands.** The SDD config table said
   fixed gear; the LGS system section described a retractable one. Reconciled to retractable
   tricycle, three legs, in all three places.
3. **An alert tier smuggled in as a hardware description.** The HF document read *an aural tone and,
   for more significant messages, a caution or warning light* - which hands the alerting lane part
   of the answer it exists to derive. Now: *one of the two glareshield alert lights*, with which
   light accompanies which message carried as `[TBD]`. That is a better fixture and a better
   document.

### Front matter - four bugs found by reading the built PDF, not the source

The HF document was first assembled with pandoc's own title and contents handling, and it was wrong
in four ways that only showed up in the built file:

1. **It appeared to begin with Appendix C.** The contents list overflowed onto page 2 and the body
   title started immediately under its last line, so the first thing on page 2 was
   "Appendix C - Control schedule 38". Cover and contents now each get their own page.
2. **The title and the front notice appeared twice.** The body was drafted as a standalone document
   and carried its own YAML block, its own H1 and its own notice. The assembler now cuts everything
   before "## 1 Purpose and scope" and fails loudly if that marker is missing, rather than silently
   dropping content.
3. **The duplicate notice was also wrong.** It read "FICTIONAL AIRCRAFT - the Vayu VY-6 does not
   exist", which contradicts what this fixture is: a representative article built to a published
   envelope and sourced in Appendix B. The accurate notice is the one that survived.
4. **The contents listed the wrong page numbers.** LaTeX's `titlepage` environment resets the page
   counter at its end, so the contents said page 2 for a section physically on page 3. Corrected
   with an explicit `\setcounter{page}{2}`.

A fifth, cosmetic: pandoc treats a bare brace group at the start of a line as text rather than raw
LaTeX, so the first cover typeset its own braces. The cover is a `titlepage` environment now, which
pandoc passes through whole.

Both documents now open the same way: a cover carrying aircraft, document title, number, issue,
date, the companion reference, a rule, the demonstration notice and the stops-where-the-assessment-
begins line; then contents on its own page; then the body.

### And one thing the audit got wrong about itself

The first HF run reported nine violations. All nine were in section 11, where the document states
what it does **not** do - *which functions are allocated to the pilot*, *which condition produces a
Warning* - plus two uses of the ordinary English word "omission". A scanner cannot tell a rule from
a sentence about rules. Rather than loosen the checks, `audit.py` now recognises declared-exclusion
prose and reports those hits separately. Same lesson as the "shall" catch, one level up.

## Parser constraints, both still open in the product

- **No em dash in any section title.** `_decompSectionChecklist`'s title class is `[\\w\\-&/() ,]`.
  Verified: 0 numbered titles contain an en or em dash.
- **No digit in any system code.** The regex is `\\(([A-Z]{2,5})\\)`. All 16 codes are three letters
  and all 16 are readable by it, where Halcyon groups 14 by code and 2 by title fallback.

**Still owed:** the real `_decompSectionChecklist` has NOT been run over these documents. The checks
above replicate its documented regexes, which is not the same thing.

## Regenerate

    cd eval/fixtures/vayu
    python3 fig_hf_sheets.py     # the three drawing sheets first
    python3 build_sdd.py         # VAY-SDD-0001
    python3 build_hf.py          # assembles _vayu_hf_spec.md, then pandoc
    python3 audit.py             # the gate

SDD source: `content_front.py` (sections 1-4), `content_sys_a.py` + `content_sys_b.py` (section 5,
16 systems), `content_back.py` (section 6 captions, Appendices A and B), `fig_core.py` (aircraft
views, zonal model, shared helpers), `fig_sys.py` (16 schematics), `fig_hf.py` (flight deck figure
used by both), `build_sdd.py` (layout only).

HF source: `_vayu_hf_body.md` (1-11), `_vayu_hf_appA.md`, `_vayu_hf_appBC.md`, `fig_hf_sheets.py`
(the three sheets), `build_hf.py` (assembly, character gate, pandoc). `_vayu_hf_spec.md` is
generated - edit the three parts, not it.

Both builds carry a character gate. The SDD's fails on anything outside WinAnsi, because ReportLab's
standard fonts render those as a silent black box. The HF build's normalises what has an unambiguous
equivalent and fails on anything else before handing the file to pandoc, because pdflatex stops on
an undefined character and names a line in a generated .tex nobody keeps.

## Not yet done

- No golden captured on either document. The granularity band will need its own value here. If
  asked in the room: *we have not cut a golden on this document yet* - stronger than a number nobody
  has earned.
- The real parser run, above.
- DGCA's current position on eVTOL certification is unverified. SDD section 1.3 says "the certifying
  authority for the programme" and names no authority. Do not assert in the room that DGCA has
  adopted SC-VTOL.

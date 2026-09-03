# Halcyon HA-10 SDD — second eval fixture

`HAL-SDD-0001_Halcyon_HA-10_Architecture_and_SDD.pdf` — built 31 Aug 2026, and kept in
`~/Downloads` beside the Aeolus SDD, which is where the app ingests source documents from.

    md5    0ed68f2fbfc7af3494ae69705fae8fd8
    pages  31 · chars 77,594 · bytes 100,091 · 16 systems
    (Aeolus ingests at 61,974 chars with 14 systems — comparable, so the A/B is fair)

Reproducible: `rl_config.invariant` pins the creation timestamp and the document id, so
"regenerate and compare the hash" is a real check. It reproduced byte-identically across
two machines running ReportLab 4.4.10 and 5.0.0.

## Why it exists

Every eval run to date uses ONE document. The golden captures, the granularity band
[14,24], severeJumpRate, the abstention-set Jaccard — all of it measured against the
Aeolus HL-1 SDD and nothing else. A metric calibrated on a single input cannot tell the
difference between an engine that generalises and an engine tuned to one PDF.

This is the second input: a different aircraft, a different certification basis
(Part 23 / AC 23.1309-1E Class III vs Part 25), and a failure vocabulary the Aeolus
document never uses — hull flooding, thermal runaway, water directional control, an
unpressurised reversion. Same structure throughout, so the FORM does not vary between the
two inputs, only the content.

## Figures

18 vector figures, drawn from spec rather than rastered, which is why this is 100 KB
against Aeolus's 4.4 MB:

    Figure 1-1        general arrangement — plan, profile, front elevation, one scale
    Figure 6-1        zonal model — ten zones on the profile, R-1..R-6 overlaid, the
                      bulkhead at frame 14 marked, and a plan inset for the two zones
                      that exist only there
    Figure 6-2..6-17  one block schematic per system, with typed lines (HV / LV / coolant
                      / fuel / bleed / mechanical / signal / structural) and a per-figure
                      legend

WHAT IS NOT HERE, and why. Aeolus carries shaded 3D isometrics on its general arrangement
and its zonal view. These are drawn 2D engineering views instead. A drawn view is honest
about being a drawing; an approximated render is not, and would have sat beside the Aeolus
figures looking like a worse version of the same thing rather than a different kind of thing.

fig_sys.py is spec-driven — a schematic is boxes on a coarse grid plus typed links — so a
wrong diagram is a wrong FACT rather than a wrong coordinate, and it can be reviewed by
reading the spec instead of the picture. The _bounds_ok guard refuses to emit any figure
whose shapes escape the frame: the first cut of BOTH aircraft views did exactly that, the
plan-view wing running off the top and over the title, and that is invisible in review
until somebody looks at a rendered page.

## Regenerate

    cd eval/fixtures/halcyon && python3 build_sdd.py

content_front.py (§1–§4) · content_sys_a.py + content_sys_b.py (§5, 16 systems) ·
content_back.py (§6 captions + Appendix A) · fig_core.py (aircraft views) ·
fig_sys.py (schematics) · build_sdd.py (layout only). Editing content never touches
layout and vice versa.

The build has an ENCODING GATE that fails before writing a page if any character falls
outside WinAnsi. ReportLab's standard fonts render such a character as a solid black box,
silently — and it caught a real one on the first run. A black box in a measurement
instrument is worse than a crash.

## The discipline this document is under

It DESCRIBES the design and CLASSIFIES and ASSESSES nothing. Verified on the built PDF:

    severity classifications   0     probability targets   0
    DAL assignments            0     "shall" statements    0
    failure-condition ids      0     requirement ids       0

The five severity WORDS are §1.3 naming the scale the programme uses, which is exactly
what Aeolus §1.3 does. Design facts are stated freely; safety COMMITMENTS are not — no
"within 1 second", no "for 30 minutes", no "1.0E-07 per flight hour". Those are the
assessment's to assume, and the demo project records them as assumptions for that reason.

## Two parser gaps found while building it, both still open

1. A section title containing an EM DASH is invisible to `_decompSectionChecklist` — its
   title character class is `[\w\-&/() ,]`. The hull sections were originally "Hull —
   Forward Compartment" and only 14 of 16 systems grouped, so the coverage DENOMINATOR
   would have been 14 and the metric quietly wrong. Worked around here by retitling
   (Aeolus's titles carry no em dashes, which is why it never surfaced). Any customer SDD
   with an em dash in a heading still loses that section silently.

2. A system code containing a DIGIT is not read as a code: the regex is
   `\(([A-Z]{2,5})\)`, so (EL1) and (EL2) fall through to the title-matching branch. They
   group correctly — verified — but 14 of 16 group by code and 2 by fallback, which is an
   asymmetry inside the very mechanism under test. `[A-Z][A-Z0-9]{1,4}` closes it.

Both verified by running the real `_decompSectionChecklist` over the built PDF's extracted
text: 16 of 16 systems group across §5 and §6.

## Not yet done

No golden has been captured on this document. That is the next step, under the same
banner-gated protocol as the Aeolus goldens — draw until in-band AND coverage-clean, then
accept-all untouched. Expect the granularity band to need its own value here rather than
inheriting [14,24]: 16 systems is not 14, and the band was fitted to the other document.

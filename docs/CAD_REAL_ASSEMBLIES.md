# CAD import on real STEP assemblies (17 Oct 2026)

Job 2 of 16-17 Oct 2026: test the CAD import on real, public, freely licensed multi-part STEP assemblies and fix what breaks.

## The files

| File | Source and license | Size | Placements | Placed parts | Depth |
|---|---|---|---|---|---|
| Voron 0.2 master assembly | github.com/VoronDesign/Voron-0, GPL-3.0, Fusion 360 export | 180 MB | 2,456 | 1,670 | 8 |
| Voron 2.4r2 assembly | github.com/VoronDesign/Voron-2, GPL-3.0, Fusion 360 export | 240 MB | 1,551 | 1,295 | 8 |

No public aircraft assembly with real part numbers and a clear license was found. NIST's MBE PMI files are single parts. The files are not in the repository (size and license). `tools/cad/real_assemblies.js` downloads them once, checks their pinned sha256 and runs the checks.

## What broke, and the fix

1. **A part held other parts' solids.** Parts that share a color share one style in the file. The part closure followed the style to every other styled item using it, so each part pulled in the solids of every part of that color. Voron 0.2 became 257,000 "parts" instead of 2,966, with boxes up to 41 m on a 6 cm part, and the Voron 2.4 had not opened after 15 minutes. Fix: a styled item belongs to a part only when the item it colors is that part's (`cad_step_struct.js` closureOf).
2. **First-view boxes from far-away points.** The estimate took every point in the part. That included plane and line origins and untrimmed surface nets that Fusion writes 20 m to 500 m away, and whole circles where only a small arc of a 2 m circle is used. Fix: the box is taken from points on the part:
   - vertices;
   - edge curve control points;
   - circle and ellipse edges bounded exactly along their own arc;
   - B-spline surface nets only when close to the part.
3. **Estimated boxes fed safety answers.** Fix: a box still estimated from the file is now marked (`boxEstimated`). Until the part's shape is read, containment, risk volumes, equipment placement and the Sys Lab exchange take no answer from it, and each says so.
4. **The part tree was flattened to two levels.** OpenCascade's walk keeps two levels and every reader followed it. Bodies of a multi-body part lost their part's name, and part numbers were looked up by name. Fix:
   - every part carries its full assembly path from the STEP structure (`boxRes` trails, `SLCadImport.attachTrails` for the whole-file readers), so all readers give the same part ids at every depth;
   - a multi-body part's bodies sit under it;
   - each part carries its own product's part number;
   - line breaks the writer put inside names are dropped (ISO 10303-21).

## Open times

Measured on Waqas's MacBook in headless Chromium with the software renderer (SwiftShader, the slow case). The code is the same as Safety Lab's, run through Sys Lab's byte-identical copy.

| File | Before: model shown | Before: fully loaded | Before: freezes over 1 s | After: model shown | After: fully loaded | After: longest freeze |
|---|---|---|---|---|---|---|
| Voron 0.2 | 18.9 s | 71 s | 21 (longest 3.8 s) | 1.7 s | 32 to 33 s | 0.5 s |
| Voron 2.4 | not loaded after 15 min | | | 2.2 to 2.3 s | 6.6 to 7.6 s | 0.75 s |

## End to end on the real part lists (exact boxes)

The checks below were run on both files, against plain geometry computed independently:

- **Zones:** every part is in the zone that holds its center (2,966 and 1,537 parts).
- **Linking:** a shared part number is only a candidate for the engineer, never a link on its own.
- **Equipment placement:** equipment goes into the zone its linked parts sit in.
- **Risk volume:** a 60 mm fire sphere holds exactly the parts the 27-point rule finds (98 and 195).

## Tests

- `tests/regression_cad_real_world_20261017.test.js`: a generated aircraft written like these exports (`make_aircraft_step.js` with `realWorld: true`), a hand-written file of arcs, curves and surfaces, and the estimated-box guard. It has 43 checks, and each of its deliberate breaks turns it red.
- `tools/cad/real_assemblies.js`: the two real files. It checks the structure read and its time, the part list against an independent reading of the STEP text, that each part holds only its own solids, and that every first-view box is the right size. It is not in the wall.

// safety_targets.js — deterministic certification-basis safety targets (PROB_TARGETS,
// DAL_TARGETS, DAL_ORDER, SEVERITY_RANK, DAL_RANK_MAP, DO178C/DO254_DAL_CREDIT), extracted
// verbatim from safety_lab.js (Phase 76). Pure data, loaded FIRST so every bare-name
// reference (incl. the after-modules SEVERITY_RANK guard) resolves. Byte-identical.

const PROB_TARGETS = {
    'Part 25':            { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'Part 23 I':          { Catastrophic: 1e-6, Hazardous: 1e-5, Major: 1e-4, Minor: 1e-3, Negligible: null },
    'Part 23 II':         { Catastrophic: 1e-7, Hazardous: 1e-6, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'Part 23 III':        { Catastrophic: 1e-8, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'Part 23 IV':         { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    // Rotorcraft. Part 29 (transport) per AC 29-2C §29.1309 Figure AC 29.1309-2, verified
    // 31 Aug 2026 against the fetched FAA PDF: Minor ≤1e-3, Major ≤1e-5, Hazardous ≤1e-7,
    // Catastrophic ≤1e-9 — Part 25 numbers.
    // Part 27 (normal) — AC 27-1B §27.1309 defines the five classes and the probability
    // terms but tabulates NO per-severity objective; the numbers come from FAA policy
    // PS-ASW-27-15 "Safety Continuum for Part 27 Normal Category Rotorcraft Systems and
    // Equipment" (30 June 2017), four classes by engine type, occupants and weight:
    //   Class I   reciprocating engine, ≤5 occupants incl. crew
    //   Class II  single turbine, ≤5 occupants, ≤4,000 lb MGW
    //   Class III single turbine, ≥6 occupants, 4,001–7,000 lb MGW
    //   Class IV  twin turbine
    // UNVERIFIED-DRAFT CAVEAT (31 Aug 2026): the FINAL FAA policy sits behind DRS/GAMA login
    // and could not be fetched; the CLASS DEFINITIONS above are the 2017 draft's.
    // NUMBERS VERIFIED (1 Sep 2026): EASA AMC1 27.1309 Table 2 (CS-27 Amendment 10,
    // ED Decision 2023/001/R) publishes exactly this grid for its four classes (Class IV =
    // Category A; III = Cat B ≥6 occupants or >1 814 kg; II = Cat B ≤5 occ ≤1 814 kg;
    // I = Cat B ≤2 occ ≤1 814 kg VFR only). Same grid as AC 23.1309-1E Classes I–IV.
    // Pinned against the corpus in regression_cert_std_kb [1e]/[1i]. The FAA thresholds
    // stay flagged until PS-ASW-27-15 final is obtained.
    // RETRACTION: the previous single 'Part 27' row (Cat 1e-7, Haz 1e-6, Maj 1e-4; DAL
    // B/C/C/D) matched no class at all. The legacy 'Part 27' alias below resolves to
    // Class III — stricter than or equal to the old row in EVERY cell, so no stored
    // project is relaxed — and the AC 1309 tab asks the engineer to pick the class.
    'Part 27 I':          { Catastrophic: 1e-6, Hazardous: 1e-5, Major: 1e-4, Minor: 1e-3, Negligible: null },
    'Part 27 II':         { Catastrophic: 1e-7, Hazardous: 1e-6, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'Part 27 III':        { Catastrophic: 1e-8, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'Part 27 IV':         { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'Part 27':            { Catastrophic: 1e-8, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },   // legacy alias = Class III
    'Part 29':            { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    // Engines — Part 33 §33.75 and Propellers — Part 35 §35.15 share ONE hazardous
    // criterion. §33.75(a)(3) / §35.15(a)(3), verbatim, set the target for a hazardous
    // engine/propeller EFFECT (the summed fault-tree top event) at "extremely remote":
    // engine 1e-7 to 1e-9, propeller "1e-7 or less" — the pass line for the summed effect is
    // 1e-7 for both. Each rule ALSO offers an individual-failure alternative-compliance line
    // of ≤1e-8 per flight hour; that route lives in the severity rubric's ENGINE/PROPELLER
    // "both routes" objective, NOT in this scalar. Neither part defines a Catastrophic effect;
    // the 1e-9 Catastrophic and 1e-3 Minor rows are aircraft-level extensions kept so an
    // installation FHA can classify aircraft-level consequences. Major = "remote", pass 1e-5.
    // RULING (1 Sep 2026, Waqas): the "Part 33" Hazardous scalar was 1e-8 — the individual-
    // failure fallback mis-encoded as the summed top-event budget, and asymmetric with Part 35.
    // Corrected to 1e-7 (per-effect) so engine and propeller are symmetric and match the rule's
    // top-event criterion. This RELAXES the encoded engine Hazardous number 1e-8→1e-7; it is
    // rule-correct (1e-7 IS the per-effect ceiling; the 1e-8 individual-cause route survives in
    // the rubric). Retracted loudly in EXPORT_RUN.md.
    'Part 33':            { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'Part 35':            { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    // EASA SC-VTOL — MOC SC-VTOL Issue 2 (12 May 2021), MOC VTOL.2510 §8(a) Table 1
    // "Safety Objectives", per flight hour, verified against the fetched EASA PDF on
    // 31 Aug 2026. Enhanced (CS&FL required; congested-area ops / commercial pax) is one
    // row. Basic is THREE rows keyed on maximum passenger seating configuration:
    //   Basic 1 (0–1 pax):  Min 1e-3, Maj 1e-5, Haz 1e-6, Cat 1e-7
    //   Basic 2 (2–6 pax):  Min 1e-3, Maj 1e-5, Haz 1e-7, Cat 1e-8
    //   Basic 3 (7–9 pax):  Min 1e-3, Maj 1e-5, Haz 1e-7, Cat 1e-9   (= Enhanced numbers)
    // 31 Aug 2026 RETRACTION: the previous single 'SC-VTOL Basic' row carried Major 1e-4 —
    // the MOC says ≤1e-5 for EVERY Basic band — and silently applied Basic-1 numbers to
    // 2–9-seat Basic aircraft (Cat 1e-7 where the MOC says 1e-8 / 1e-9). 'SC-VTOL Basic'
    // is kept ONLY as a legacy alias for projects saved before the split; it resolves to
    // the Basic 1 row (now with the corrected Major) and the AC 1309 tab flags it for the
    // engineer to pick the seat band. New projects never write the bare 'Basic' value.
    'SC-VTOL Basic 1':    { Catastrophic: 1e-7, Hazardous: 1e-6, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'SC-VTOL Basic 2':    { Catastrophic: 1e-8, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'SC-VTOL Basic 3':    { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'SC-VTOL Basic':      { Catastrophic: 1e-7, Hazardous: 1e-6, Major: 1e-5, Minor: 1e-3, Negligible: null },   // legacy alias = Basic 1
    'SC-VTOL Enhanced':   { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    // Mission-based / SORA-based — no per-FH severity ladder. Targets are null so the
    // FTA toolbar shows "see Part 450 / SORA risk metrics" rather than a misleading number.
    'Part 450':           { Catastrophic: null, Hazardous: null, Major: null, Minor: null, Negligible: null },
    'Part 107':           { Catastrophic: null, Hazardous: null, Major: null, Minor: null, Negligible: null }
};

// Severity→DAL seed (top-down primary-system target). The canonical ladder is SAE ARP4754B
// Table 2 (Cat A, Haz B, Maj C, Min D, No-Safety-Effect E). ARP4754B §5.2.1 is explicit that a
// Minor failure condition is assigned "at least level D" — DAL E is reserved for No Safety
// Effect ONLY; a Minor condition is never E. These are PRIMARY-system DALs (the "P" column);
// DALgebra reduces for independent secondary systems downstream, so we do NOT pre-reduce here.
//
// Part 23 Classes I–IV: primary-system DALs from ASTM F3061/F3061M-22b Table 1, which are
// IDENTICAL to FAA AC 23.1309-1E Figure 2's primary ("P") column — both authorities agree:
//   Class I:   Cat C, Haz C, Maj C, Min D   (Cat P=C, S=C)
//   Class II:  Cat C, Haz C, Maj C, Min D   (Cat P=C, S=C — primary same as I; differ in S + prob)
//   Class III: Cat B, Haz C, Maj C, Min D   (Cat P=B, S=C)
//   Class IV:  Cat A, Haz B, Maj C, Min D   (matches Part 25 / commuter)
// The reduction from the Part 25 baseline happens at Catastrophic/Hazardous ONLY; Major floors
// at C and Minor floors at D across every class (confirmed vs AC 23.1309-1E Fig. 2 & F3061 Tbl 1).
// Fixed 6 Jul 2026: prior rows wrongly pushed Maj→D and Min→E for Classes I–III (Rev: audit).
//   Part 25:           Cat A, Haz B, Maj C, Min D  (ARP4754B Table 2)
const DAL_TARGETS = {
    'Part 25':            { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    'Part 23 I':          { Catastrophic: 'C', Hazardous: 'C', Major: 'C', Minor: 'D', Negligible: 'E' },
    'Part 23 II':         { Catastrophic: 'C', Hazardous: 'C', Major: 'C', Minor: 'D', Negligible: 'E' },
    'Part 23 III':        { Catastrophic: 'B', Hazardous: 'C', Major: 'C', Minor: 'D', Negligible: 'E' },
    'Part 23 IV':         { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    // Part 27 Classes I–IV — DAL column of the PS-ASW-27-15 continuum (2017 DRAFT table, see
    // the PROB_TARGETS caveat; same grid as AC 23.1309-1E Figure 2 primary column). Legacy
    // 'Part 27' alias = Class III (B/C/C/D — equal to the old row, never relaxed).
    // Part 29 — AC 29-2C Figure AC 29.1309-2 DO-178C level row: E/D/C/B/A (verified 31 Aug 2026).
    'Part 27 I':          { Catastrophic: 'C', Hazardous: 'C', Major: 'C', Minor: 'D', Negligible: 'E' },
    'Part 27 II':         { Catastrophic: 'C', Hazardous: 'C', Major: 'C', Minor: 'D', Negligible: 'E' },
    'Part 27 III':        { Catastrophic: 'B', Hazardous: 'C', Major: 'C', Minor: 'D', Negligible: 'E' },
    'Part 27 IV':         { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    'Part 27':            { Catastrophic: 'B', Hazardous: 'C', Major: 'C', Minor: 'D', Negligible: 'E' },   // legacy alias = Class III
    'Part 29':            { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    'Part 33':            { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    'Part 35':            { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    // SC-VTOL — FDAL column of MOC SC-VTOL Issue 2, MOC VTOL.2510 §8(a) Table 1 (verified
    // 31 Aug 2026 against the fetched EASA PDF; the earlier "MoC does not tabulate every
    // cell" note was wrong — it tabulates all sixteen):
    //   Enhanced: Min D, Maj C, Haz B, Cat A
    //   Basic 3 (7–9 pax): Min D, Maj C, Haz B, Cat A
    //   Basic 2 (2–6 pax): Min D, Maj C, Haz C, Cat B   (Table 1 Note A: no architecture-based reduction)
    //   Basic 1 (0–1 pax): Min D, Maj C, Haz C, Cat C   (Table 1 Note A)
    // Table 1 Note B: IDAL D software alleviation per MOC §10(c) applies to the Minor column.
    'SC-VTOL Basic 1':    { Catastrophic: 'C', Hazardous: 'C', Major: 'C', Minor: 'D', Negligible: 'E' },
    'SC-VTOL Basic 2':    { Catastrophic: 'B', Hazardous: 'C', Major: 'C', Minor: 'D', Negligible: 'E' },
    'SC-VTOL Basic 3':    { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    'SC-VTOL Basic':      { Catastrophic: 'C', Hazardous: 'C', Major: 'C', Minor: 'D', Negligible: 'E' },   // legacy alias = Basic 1
    'SC-VTOL Enhanced':   { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    // Part 450 / Part 107 — mission-based / SORA-based, no per-FH DAL ladder. DAL is still
    // a useful concept for avionics inside the vehicle but the top-down seed comes from a
    // different model than the cert-basis severity ladder.
    'Part 450':           { Catastrophic: null, Hazardous: null, Major: null, Minor: null, Negligible: null },
    'Part 107':           { Catastrophic: null, Hazardous: null, Major: null, Minor: null, Negligible: null }
};

// ==========================================
// DALgebra autonomous top-down allocator
// Implements SAE ARP4754A Section 5.4.1:
//   - OR / XOR / VOTING (and any non-AND-like gate): every child inherits the parent DAL.
//   - AND / INHIBIT: per-gate option drives allocation.
//       Option 1 (with independence claim): one "carrier" child = parent DAL, others = parent − 2.
//       Option 2 (no independence claim):   all children = parent − 1.
//   - TRANSFER: the linked page's root inherits the parent DAL.
// Repeated events receive the max (most stringent) DAL across visits.
// ==========================================
const DAL_ORDER = ['A', 'B', 'C', 'D', 'E']; // A is most stringent, E least.
// Single source of truth for severity ranking (Phase 27 refactor B5). Higher number = more
// restrictive. Used by AutoReq, the FTA wizard, AC↔Sys FC linkage, dedup, and worklist code.
const SEVERITY_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1 };
// Single source of truth for DAL ranking (Phase 27 refactor B7). Higher = more restrictive.
const DAL_RANK_MAP = { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'E': 1 };

// Phase 29.2 + Phase 53.51 — Qualitative DAL guidance per the RTCA/DO-178C (software) and
// RTCA/DO-254 (complex hardware) standards. The standards are copyrighted by RTCA Inc.; this
// tool intentionally does NOT reproduce their objective counts or table contents. Each entry
// describes the engineering intent of the DAL tier in plain language and points the analyst
// to the authoritative source. Users with a current RTCA standards license should consult the
// referenced annexes directly for the formal objective set, independence requirements and
// table references.
const DO178C_DAL_CREDIT = {
    'A': { coverage: 'Most-stringent assurance; structural coverage at the highest level; full independence of verification.',
           tables: 'Refer to RTCA DO-178C Annex A for the applicable objective tables.' },
    'B': { coverage: 'High assurance; structural coverage at the decision level; significant verification independence.',
           tables: 'Refer to RTCA DO-178C Annex A for the applicable objective tables.' },
    'C': { coverage: 'Moderate assurance; structural coverage at the statement level; limited verification independence.',
           tables: 'Refer to RTCA DO-178C Annex A for the applicable objective tables.' },
    'D': { coverage: 'Low assurance; basic requirements / design documentation; minimal independent verification.',
           tables: 'Refer to RTCA DO-178C Annex A for the applicable objective tables.' },
    'E': { coverage: 'No DO-178C objectives required.',
           tables: 'No certification credit required at DAL E.' }
};

const DO254_DAL_CREDIT = {
    'A': { ind: 'Full design assurance process across the complete hardware life-cycle, including independent verification & validation.',
           tables: 'Refer to RTCA DO-254 Appendix A for the formal process objectives.' },
    'B': { ind: 'Comprehensive process with verification independence on critical functions.',
           tables: 'Refer to RTCA DO-254 Appendix A for the formal process objectives.' },
    'C': { ind: 'Reduced process; basic V&V with limited independence.',
           tables: 'Refer to RTCA DO-254 Appendix A for the formal process objectives.' },
    'D': { ind: 'Minimal — basic requirements + design documentation; no formal V&V process.',
           tables: 'Refer to RTCA DO-254 Appendix A for the formal process objectives.' },
    'E': { ind: 'No DO-254 objectives required.',
           tables: 'No certification credit required at DAL E.' }
};

// ==========================================
// System Control Category (SC1/SC2) default map — ARP4754B §5.6.4 + Appendix A Table A1.
// SC1 = full configuration-management control (baseline + problem reporting + change tracking +
// protection + archive). SC2 = reduced subset (identification + protection + archive only).
// Transcribed EXACTLY from Table A1 (pp.77-83): each life-cycle data item's SC is assigned by
// (artifact type x FDAL). null = the objective is not required at that FDAL (no SC). This is the
// editable DEFAULT; per-project / per-artifact overrides layer on top (see deriveArtifactSC).
//   • FHA / safety objectives: SC1 at every level — "modulation based on FDAL does not apply".
//   • Safety analyses, requirements, FDAL/IDAL: A/B/C=SC1, D=SC2.
//   • Configuration index, verification procedures: A/B=SC1, C/D=SC2.
//   • Plans, V&V matrices/results, problem reports, process-assurance evidence: SC2 all levels.
const SC_DEFAULT_MAP = {
    // FHA — SC1 regardless of FDAL (Table A1 obj 3.1/3.2; modulation N/A)
    afha:                    { A:'SC1', B:'SC1', C:'SC1', D:'SC1', E:'SC1' },
    sfha:                    { A:'SC1', B:'SC1', C:'SC1', D:'SC1', E:'SC1' },
    safety_objectives:       { A:'SC1', B:'SC1', C:'SC1', D:'SC1', E:'SC1' },
    // Safety analyses + requirements + DAL assignments — A/B/C=SC1, D=SC2 (obj 2.x, 3.3-3.5)
    pasa_pssa:               { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    asa_ssa:                 { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    fta:                     { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    fmea:                    { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    cma:                     { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    zsa:                     { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    pra:                     { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    markov:                  { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    requirements:            { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    functions:               { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },   // aircraft/system functions + functional requirements (Table A1 obj 2.1/2.3)
    fdal_idal:               { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    // Configuration index + verification procedures — A/B=SC1, C/D=SC2 (obj 5.x, 6.2)
    config_index:            { A:'SC1', B:'SC1', C:'SC2', D:'SC2', E:null },
    verification_procedures: { A:'SC1', B:'SC1', C:'SC2', D:'SC2', E:null },
    // Plans / V&V matrices+results / problem reports / process assurance — SC2 all levels (obj 1.x, 4.x, 5.x, 7.x)
    plan:                    { A:'SC2', B:'SC2', C:'SC2', D:'SC2', E:null },
    validation_matrix:       { A:'SC2', B:'SC2', C:'SC2', D:'SC2', E:null },
    verification_matrix:     { A:'SC2', B:'SC2', C:'SC2', D:'SC2', E:null },
    verification_results:    { A:'SC2', B:'SC2', C:'SC2', D:'SC2', E:null },
    problem_report:          { A:'SC2', B:'SC2', C:'SC2', D:'SC2', E:null },
    process_assurance:       { A:'SC2', B:'SC2', C:'SC2', D:'SC2', E:null }
};

// Pure Table A1 lookup: (artifactType, fdal) -> 'SC1' | 'SC2' | null. Unknown artifact -> SC1
// (most conservative). FDAL is normalized to its first letter so 'FDAL B' / 'B' both resolve.
function scFromTableA1(artifactType, fdal) {
    const row = SC_DEFAULT_MAP[artifactType];
    if (!row) return 'SC1';
    // Extract the standalone FDAL letter so 'B', 'FDAL B', 'DAL: C' all resolve (don't pick up
    // the D/A inside the word "FDAL").
    const s = String(fdal == null ? 'A' : fdal).toUpperCase();
    const m = s.match(/(?:^|[^A-Z])([A-E])(?:[^A-Z]|$)/);
    const f = m ? m[1] : 'A';
    return (f in row) ? row[f] : 'SC1';
}

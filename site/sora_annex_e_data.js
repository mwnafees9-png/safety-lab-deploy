// ============================================================================
// sora_annex_e_data.js — v0.1 — the JARUS SORA v2.5 Annex E OSO×SAIL matrix.
//
// WHAT THIS IS
//   The Operational Safety Objective (OSO) robustness-per-SAIL ASSIGNMENT, i.e.
//   for each of the seventeen OSOs, the required level of robustness
//   (None / Low / Medium / High) at each SAIL (I–VI). This is the factual
//   mapping that turns a SAIL into a set of assurance objectives.
//
// PROVENANCE (transcribed 22 Jul 2026)
//   Source: JARUS SORA Annex E, Edition 2.5 (JAR_doc_28), Public Release
//           13.05.2024. Every row's assignment is read DIRECTLY from the
//           SAIL-range annotations printed under the Low / Medium / High
//           column headers of that OSO's integrity & assurance tables in §E.2
//           (the integrity and assurance tables carry the same SAIL ranges).
//           Example — OSO #01 p.8: "Low (SAIL II) · Medium (SAIL III) ·
//           High (SAIL IV to VI)". Below the lowest listed column an OSO is
//           Optional or Not-Required — Annex E §E.1 principle #4 defers those
//           cases to SORA Main Body Table 14, so this data returns 'None' and
//           says so rather than inventing a criterion.
//
// SPINE DISCIPLINE (non-negotiable)
//   · JARUS SORA is COPYRIGHTED (unlike US-Gov public-domain MIL-HDBK-217F /
//     MIL-STD-882E / NASA handbooks). The integrity & assurance CRITERIA PROSE
//     — the "safety gain" and "method of proof" text — is therefore NEVER
//     stored here. This module stores the factual assignment (a table of
//     designations) and the page to read. Cite and point; do not reproduce.
//   · Each OSO carries its Annex E section page so every derived requirement
//     names exactly where the human reads the actual criteria.
//   · No AI, no Date, no RNG, no eval — pure data.
//
// Verified cell-by-cell against the source PDF; the regression suite
// (regression_sora_annex_e.test.js) re-derives the matrix and pins the
// monotonicity + the two structural anomalies (OSO#04 single-SAIL columns,
// OSO#24 Low = N/A).
// ============================================================================
(function () {
    'use strict';

    const SOURCE = 'JARUS SORA Annex E, Edition 2.5 (JAR_doc_28), Public Release 13.05.2024';

    // Robustness ladder. 'None' = Annex E defines no criteria at that SAIL
    // (Optional / Not-Required per Main Body Table 14).
    const LEVELS = ['None', 'Low', 'Medium', 'High'];

    // Each OSO: number, reference title (a short factual label — NOT criteria
    // text), Annex E section page, and the SAIL sets that trigger Low / Medium
    // / High. `header` is the verbatim (factual) column-header annotation kept
    // as a provenance receipt. `lowNA:true` marks OSOs whose Low column is
    // printed "N/A" (OSO#24) — Low is structurally unavailable, not merely
    // unlisted.
    const OSOS = [
        { id: 'OSO#01', n: 1,  page: 8,  title: 'Ensure the operator is competent and/or proven',
          low: [2], medium: [3], high: [4, 5, 6], header: 'Low: SAIL II | Medium: SAIL III | High: SAIL IV to VI' },
        { id: 'OSO#02', n: 2,  page: 10, title: 'UAS manufactured by competent and/or proven entity',
          low: [3], medium: [4], high: [5, 6], header: 'Low: SAIL III | Medium: SAIL IV | High: SAIL V & VI' },
        { id: 'OSO#03', n: 3,  page: 12, title: 'UAS maintained by competent and/or proven entity',
          low: [1, 2], medium: [3, 4], high: [5, 6], header: 'Low: SAIL I & II | Medium: SAIL III & IV | High: SAIL V & VI' },
        { id: 'OSO#04', n: 4,  page: 15, title: 'UAS components essential to safe operations designed to an Airworthiness Design Standard (ADS)',
          low: [4], medium: [5], high: [6], header: 'Low: SAIL IV | Medium: SAIL V | High: SAIL VI' },
        { id: 'OSO#05', n: 5,  page: 18, title: 'UAS is designed considering system safety and reliability',
          low: [3], medium: [4], high: [5, 6], header: 'Low: SAIL III | Medium: SAIL IV | High: SAIL V & VI' },
        { id: 'OSO#06', n: 6,  page: 23, title: 'C3 link characteristics appropriate for the operation',
          low: [2, 3], medium: [4], high: [5, 6], header: 'Low: SAIL II & III | Medium: SAIL IV | High: SAIL V & VI' },
        { id: 'OSO#07', n: 7,  page: 26, title: 'Conformity check of the UAS configuration',
          low: [1, 2], medium: [3, 4], high: [5, 6], header: 'Low: SAIL I & II | Medium: SAIL III & IV | High: SAIL V & VI' },
        { id: 'OSO#08', n: 8,  page: 28, title: 'Operational procedures defined, validated and adhered to',
          low: [1], medium: [2], high: [3, 4, 5, 6], header: 'Low: SAIL I | Medium: SAIL II | High: SAIL III to VI' },
        { id: 'OSO#09', n: 9,  page: 33, title: 'Remote crew trained and current',
          low: [1, 2], medium: [3, 4], high: [5, 6], header: 'Low: SAIL I & II | Medium: SAIL III & IV | High: SAIL V & VI' },
        { id: 'OSO#13', n: 13, page: 35, title: 'External services supporting UAS operations are adequate to the operation',
          low: [1, 2], medium: [3], high: [4, 5, 6], header: 'Low: SAIL I & II | Medium: SAIL III | High: SAIL IV to VI' },
        { id: 'OSO#16', n: 16, page: 38, title: 'Multi-crew coordination',
          low: [1, 2], medium: [3, 4], high: [5, 6], header: 'Low: SAIL I & II | Medium: SAIL III & IV | High: SAIL V & VI' },
        { id: 'OSO#17', n: 17, page: 42, title: 'Remote crew is fit to operate',
          low: [1, 2], medium: [3, 4], high: [5, 6], header: 'Low: SAIL I & II | Medium: SAIL III & IV | High: SAIL V & VI' },
        { id: 'OSO#18', n: 18, page: 45, title: 'Automatic protection of the flight envelope from human errors',
          low: [3], medium: [4], high: [5, 6], header: 'Low: SAIL III | Medium: SAIL IV | High: SAIL V & VI' },
        { id: 'OSO#19', n: 19, page: 48, title: 'Safe recovery from human error',
          low: [3], medium: [4, 5], high: [6], header: 'Low: SAIL III | Medium: SAIL IV & V | High: SAIL VI' },
        { id: 'OSO#20', n: 20, page: 50, title: 'A human-factors evaluation has been performed and the HMI found appropriate for the mission',
          low: [2, 3], medium: [4, 5], high: [6], header: 'Low: SAIL II & III | Medium: SAIL IV & V | High: SAIL VI' },
        { id: 'OSO#23', n: 23, page: 52, title: 'Environmental conditions for safe operations defined, measurable and adhered to',
          low: [1, 2], medium: [3, 4], high: [5, 6], header: 'Low: SAIL I & II | Medium: SAIL III & IV | High: SAIL V & VI' },
        { id: 'OSO#24', n: 24, page: 53, title: 'UAS designed and qualified for adverse environmental conditions (e.g., adequate sensors, DO-160 qualification)',
          low: [], medium: [3], high: [4, 5, 6], lowNA: true, header: 'Low: N/A | Medium: SAIL III | High: SAIL IV to VI' }
    ];

    // SAIL is expressed as a Roman numeral I–VI in the product; keep the
    // number mapping here so the engine can take either.
    const SAIL_ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI' };

    if (typeof window !== 'undefined') {
        window.SORA_ANNEX_E = { meta: { source: SOURCE, doc: 'SORA Annex E 2.5', licensed: true,
            note: 'Assignment transcribed from the OSO integrity/assurance column headers in Annex E §E.2. Criteria prose is copyrighted by JARUS and is NOT stored — cite the page and read the source.' },
            levels: LEVELS, osos: OSOS, sailRoman: SAIL_ROMAN };
    }
    if (typeof module !== 'undefined') {
        module.exports = { SOURCE, LEVELS, OSOS, SAIL_ROMAN };
    }
})();

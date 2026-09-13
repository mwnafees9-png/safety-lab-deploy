// ============================================================================
// sora_core.js — v0.2 — SORA 2.5 ENGINE (EU 2019/947 Specific category).
//
// Deterministic calculators for the Specific Operations Risk Assessment,
// edition 2.5 — the AMC to Article 11 of (EU) 2019/947 (applicable since
// 29 Sep 2025; consolidated in the Easy Access Rules, June 2026).
//
// v0.2 (22 Jul 2026): the Annex E OSO robustness-per-SAIL matrix is now
//   VERIFIED and shipped as data (sora_annex_e_data.js, window.SORA_ANNEX_E).
//   osoRobustness(sail) resolves; osoList() enumerates all SEVENTEEN OSOs
//   (OSO#04 confirmed from Annex E, closing the v0.1 gap).
//
// v0.3 (6 Aug 2026): arcInitial() now computes from the AEC decision tree,
//   and containment() now covers Table 8 (1 m UA class only). Both ship at a
//   DIFFERENT, LOWER confidence tier than the rest of this file — see the
//   sourcing notes on each function. This was a deliberate, human-approved
//   trade-off (ship single-sourced-and-labeled rather than keep refusing),
//   not a quiet loosening of the verify-or-refuse rule. Tables 9–13
//   (3 m / 8 m+ UA classes) remain unfetched — containment() still refuses
//   for any UA above the 1 m / 25 m/s class.
//
// SPINE DISCIPLINE (non-negotiable):
//   · Every number below is VERIFIED against at least one authority source;
//     the GRC/mitigation/SAIL tables and containment Table 8 are also
//     cross-checked against a second, independent source. Citations ride
//     the results, and any function computing below the two-source bar
//     SAYS SO in its own `basis`/`confidence` field — never presented as
//     equally solid as the rest.
//   · What is NOT yet sourced at all is still REFUSED, not guessed:
//       - containment robustness tables 9–13 (UA > 1 m class) → containment() throws
//       - the ≤250 g micro-UAS iGRC shortcut (source conflict: 25 vs 19 m/s)
//         → deliberately NOT applied; the standard table governs, which is
//           the CONSERVATIVE direction (equal or higher iGRC).
//   · Licensed text is never stored. JARUS SORA is COPYRIGHTED — the Annex E
//     criteria PROSE is never stored; only the factual assignment (a table of
//     designations) + the page to read. Cite and point.
//
// Sources (verification record, updated 6 Aug 2026):
//   [S1] Luftfartstilsynet (Norway CAA) SORA 2.5 calculator — iGRC table,
//        mitigation credits, SAIL table. Also confirms (6 Aug 2026 check):
//        this calculator itself does NOT mechanize AEC→ARC either — it asks
//        the operator to declare residual ARC directly, same posture this
//        file held before v0.3.
//   [S2] EASA AMC & GM to (EU) 2019/947, Issue 1 Amendment 3 (ED Decision
//        2025/018/R) implementing SORA 2.5 — same three tables (cross-check),
//        floor rule wording, containment Table 8 (p.39), adjacent-area rule.
//        Confirms the AEC framework description (12 categories, 5 factors)
//        but presents AEC→ARC assignment as Figure 6, a DIAGRAM — its exact
//        cell values could not be text-extracted from this source.
//   [S3] AESA (Spain) "OSOs SORA 2.5" — OSO enumeration (16 confirmed).
//   [S4] JARUS SORA v2.5 Main Body / Annex E / Annex F — the governing docs;
//        direct fetch blocked (http redirect loop, jarus-rpas.org). FULL
//        verification of the OSO matrix is complete (v0.2); ARC and
//        containment 9-13 remain the ROADMAP.
//   [S5] JARUS SORA v2.5 Annex C, "Table 1 — Operational Environment, AEC
//        and ARC" (p.12) — the actual AEC→ARC table AS TEXT, retrieved via a
//        third-party mirror (uas.gov.ge, Georgia CAA), fetched twice with
//        identical results. This is the ONLY source found with the table as
//        text rather than a figure — SINGLE-SOURCED. Structurally
//        corroborated (same 12-category framework, same escalation logic)
//        by [S2] and by UK CAA's independently-adapted SORA AMC
//        (regulatorylibrary.caa.co.uk), but neither reproduces these exact
//        12 cells, so this does NOT clear the two-source bar the rest of
//        this file holds itself to. arcInitial() says so explicitly.
//   [S6] UK CAA AMC1 Article 11 (UK SORA), regulatorylibrary.caa.co.uk —
//        independently reproduces containment Table 8's exact structure and
//        values (same population/assembly bands: >400k / 40k-400k / <40k;
//        same High/Medium/Low grid by SAIL tier) as [S2]. This DOES clear
//        the two-source bar for Table 8 specifically — containment() treats
//        Table 8 at the same confidence as the GRC/SAIL tables.
//
// Display-lane: computes, never stores. No AI anywhere in this file.
// ============================================================================
(function () {
    'use strict';

    const CITE = 'JARUS SORA v2.5 (JAR-DEL-WG6) as AMC to Reg (EU) 2019/947 Art. 11; cross-checked: Norway CAA SORA 2.5 calculator + EASA AMC/GM draft RMT.0730';

    // ---- Step 2 · intrinsic Ground Risk Class (Main Body Table 2) ----------
    // Columns bind BOTH the max characteristic dimension AND the max speed:
    // the governing column is the worse (rightmost) of the two.
    const IGRC_COLS = [
        { dimM: 1,  speedMps: 25 },
        { dimM: 3,  speedMps: 35 },
        { dimM: 8,  speedMps: 75 },
        { dimM: 20, speedMps: 120 },
        { dimM: 40, speedMps: 200 }
    ];
    const IGRC_ROWS = [
        { key: 'controlled', label: 'Controlled ground area', maxDensity: null },
        { key: '<5',      label: '< 5 people/km²',      maxDensity: 5 },
        { key: '<50',     label: '< 50 people/km²',     maxDensity: 50 },
        { key: '<500',    label: '< 500 people/km²',    maxDensity: 500 },
        { key: '<5000',   label: '< 5,000 people/km²',  maxDensity: 5000 },
        { key: '<50000',  label: '< 50,000 people/km²', maxDensity: 50000 },
        { key: '>50000',  label: '> 50,000 people/km²', maxDensity: Infinity }
    ];
    // null = outside SORA (Certified category). Verified [S1][S2].
    const IGRC_VALUES = [
        [1, 1, 2, 3, 3],
        [2, 3, 4, 5, 6],
        [3, 4, 5, 6, 7],
        [4, 5, 6, 7, 8],
        [5, 6, 7, 8, 9],
        [6, 7, 8, 9, 10],
        [7, 8, null, null, null]
    ];

    function _colIndex(dimM, speedMps) {
        let di = -1, si = -1;
        for (let i = 0; i < IGRC_COLS.length; i++) {
            if (di === -1 && dimM <= IGRC_COLS[i].dimM) di = i;
            if (si === -1 && speedMps <= IGRC_COLS[i].speedMps) si = i;
        }
        if (di === -1 || si === -1) return -1;   // beyond 40 m / 200 m/s
        return Math.max(di, si);
    }

    // igrc({ dimM, speedMps, density | controlledGroundArea:true })
    function igrc(input) {
        if (!input) throw new Error('sora: input required — { dimM, speedMps, density | controlledGroundArea }');
        const dimM = +input.dimM, speedMps = +input.speedMps;
        if (!(dimM > 0)) throw new Error('sora: max characteristic dimension (dimM) required and > 0 — the iGRC column binds on it');
        if (!(speedMps > 0)) throw new Error('sora: max speed (speedMps) required and > 0 — speed can push the iGRC column right');
        const ci = _colIndex(dimM, speedMps);
        if (ci === -1) throw new Error('sora: ' + dimM + ' m / ' + speedMps + ' m/s exceeds the 40 m / 200 m/s table bounds — outside SORA, Certified category. That is the road, not a workaround.');
        let ri;
        if (input.controlledGroundArea === true) ri = 0;
        else {
            const d = +input.density;
            if (!(d >= 0) || input.density == null) throw new Error('sora: population density (people/km²) required — or declare controlledGroundArea:true. A guessed density is a guessed casualty rate.');
            ri = IGRC_ROWS.findIndex(r => r.maxDensity !== null && d < r.maxDensity);
            if (ri === -1) ri = IGRC_ROWS.length - 1;   // > 50,000
        }
        const v = IGRC_VALUES[ri][ci];
        if (v == null) throw new Error('sora: ' + IGRC_ROWS[ri].label + ' with a ' + IGRC_COLS[ci].dimM + ' m / ' + IGRC_COLS[ci].speedMps + ' m/s class aircraft is outside SORA — Certified category (gray cell, Main Body Table 2).');
        return {
            igrc: v,
            column: IGRC_COLS[ci], row: IGRC_ROWS[ri].label,
            columnFloor: IGRC_VALUES[0][ci],           // controlled-area value — the M1 floor
            note: 'Micro-UAS (≤250 g) shortcut NOT applied — source conflict on its speed threshold (25 vs 19 m/s); the standard table governs, which is conservative.',
            basis: 'Main Body Table 2 · ' + CITE
        };
    }

    // ---- Step 3 · mitigations (Main Body Table 5) --------------------------
    // Valid credits per mitigation; anything else is refused. Verified [S1][S2].
    const MITIGATIONS = {
        m1a: { name: 'M1(A) Sheltering',               credits: { low: -1, medium: -2 } },
        m1b: { name: 'M1(B) Operational restrictions', credits: { medium: -1, high: -2 } },
        m1c: { name: 'M1(C) Ground observation',       credits: { low: -1 } },
        m2:  { name: 'M2 Impact dynamics reduced',     credits: { medium: -1, high: -2 } }
    };

    // finalGrc(igrcResult, { m1a:'medium', m1b:null, m1c:'low', m2:'high' })
    // Floor rule [S2]: "when applying all the M1 mitigations, the final GRC
    // cannot be reduced to a value lower than the lowest value in the
    // applicable column" — i.e. the controlled-ground-area cell. M2 applies
    // after; the overall result never drops below 1.
    //
    // OPEN QUESTION, checked 6 Aug 2026, NOT resolved: a competitor product's
    // UI states M1 credit is max(M1(A), M1(B), M1(C)), not a sum, on an
    // anti-double-counting theory. This file currently SUMS m1a+m1b+m1c
    // credits (below). Searched [S2] (EASA AMC/GM, Table 5 p.29) directly —
    // it lists the three M1(A)/(B)/(C) credit values but its combination
    // instruction only says mitigations are "applied in numeric sequence,"
    // which does not disambiguate sum-vs-max; several third-party SORA
    // explainer sites were checked and none state the rule either. Per this
    // file's own discipline, an inconclusive check does not justify a
    // behavior change — sum is UNCHANGED, but flagged here as unverified so
    // it doesn't read as a settled question. If [S4]/Annex B ever gets
    // fetched directly, checking this is the first thing to confirm — the
    // sum-vs-max choice has real effect any time an operator claims more
    // than one M1 sub-mitigation at once.
    function finalGrc(igrcResult, claimed) {
        if (!igrcResult || typeof igrcResult.igrc !== 'number') throw new Error('sora: pass the igrc() result — finalGrc computes from it');
        claimed = claimed || {};
        const applied = [];
        let m1credit = 0, m2credit = 0;
        ['m1a', 'm1b', 'm1c', 'm2'].forEach(k => {
            const level = claimed[k];
            if (level == null || level === '' || level === 'none') return;
            const m = MITIGATIONS[k];
            const c = m.credits[level];
            if (c == null) throw new Error('sora: ' + m.name + ' has no "' + level + '" robustness credit — valid: ' + Object.keys(m.credits).join('/') + '. A credit the table does not grant is not a credit.');
            applied.push({ mitigation: m.name, level: level, credit: c });
            if (k === 'm2') m2credit += c; else m1credit += c;   // sum, not max — see OPEN QUESTION above
        });
        const floor = igrcResult.columnFloor;
        const afterM1 = Math.max(igrcResult.igrc + m1credit, floor);
        const flooredM1 = (igrcResult.igrc + m1credit) < floor;
        const grc = Math.max(afterM1 + m2credit, 1);
        return {
            finalGrc: grc, igrc: igrcResult.igrc, applied: applied,
            m1Floored: flooredM1,
            floorNote: flooredM1 ? 'M1 credits hit the column floor (' + floor + ') — Main Body Table 5 note: M1 cannot reduce below the controlled-ground-area value of the column.' : null,
            basis: 'Main Body Table 5 · ' + CITE
        };
    }

    // ---- Step 7 · SAIL (Main Body Table 7) ---------------------------------
    // Verified [S1][S2]. Residual ARC is DECLARED by the analyst in v0.1 —
    // arcInitial() below refuses until the AEC logic is verified.
    const ARCS = ['a', 'b', 'c', 'd'];
    const SAIL_TABLE = {      //  a     b     c     d
        2: ['I',   'II',  'IV',  'VI'],
        3: ['II',  'II',  'IV',  'VI'],
        4: ['III', 'III', 'IV',  'VI'],
        5: ['IV',  'IV',  'IV',  'VI'],
        6: ['V',   'V',   'V',   'VI'],
        7: ['VI',  'VI',  'VI',  'VI']
    };
    function sail(finalGrcValue, residualArc) {
        const g = +finalGrcValue;
        if (!(g >= 1)) throw new Error('sora: final GRC required (≥1)');
        if (g > 7) throw new Error('sora: final GRC ' + g + ' is outside SORA — Certified category (Main Body Table 7). No SAIL exists for it.');
        const arc = String(residualArc || '').toLowerCase().replace(/^arc-?/, '');
        const ai = ARCS.indexOf(arc);
        if (ai === -1) throw new Error('sora: residual ARC required — one of ARC-a/b/c/d. In v0.1 you DECLARE it (with your ConOps rationale); mechanized ARC determination ships when the AEC logic is verified against the release documents.');
        const row = SAIL_TABLE[Math.max(2, Math.ceil(g))];
        return { sail: row[ai], finalGrc: g, residualArc: 'ARC-' + arc, basis: 'Main Body Table 7 · ' + CITE };
    }

    // ---- Step 8 · adjacent area size (verified [S2]) -----------------------
    // Distance flown in 3 minutes at max speed; never below 5 km, never above 35.
    function adjacentAreaKm(speedMps) {
        const s = +speedMps;
        if (!(s > 0)) throw new Error('sora: max speed required for the adjacent-area rule');
        const raw = (3 * 60 * s) / 1000;
        return { km: Math.min(Math.max(raw, 5), 35), rawKm: raw,
                 basis: 'Step 8 adjacent-area rule (3 min at max speed, min 5 km, max 35 km) · ' + CITE };
    }

    // ---- OSO register + robustness matrix (Annex E) ------------------------
    // SORA 2.5 consolidates to SEVENTEEN OSOs. The register AND the
    // robustness-per-SAIL assignment now come from the verified Annex E data
    // module (sora_annex_e_data.js). If the data is absent, the engine REFUSES
    // rather than inventing a matrix — same posture as RAM-PREDICT.
    function _annexE() {
        const d = (typeof window !== 'undefined' && window.SORA_ANNEX_E) ? window.SORA_ANNEX_E : null;
        if (!d || !Array.isArray(d.osos) || !d.osos.length) {
            throw new Error('sora: the Annex E data module (sora_annex_e_data.js / window.SORA_ANNEX_E) is not loaded — refusing to invent the OSO robustness matrix. Load the verified data, then the matrix resolves.');
        }
        return d;
    }
    const ANNEX_E_CITE = 'JARUS SORA v2.5 Annex E (JAR_doc_28, 13.05.2024)';

    function osoList() {
        const d = _annexE();
        return {
            osos: d.osos.map(o => ({ id: o.id, n: o.n, title: o.title, page: o.page })),
            enumerated: d.osos.length,
            expectedTotal: 17,
            complete: d.osos.length === 17,
            basis: 'Annex E §E.2 OSO enumeration · ' + ANNEX_E_CITE
        };
    }

    // _sailNum('III') -> 3 ; accepts 1..6, 'I'..'VI', 'SAIL IV', 'sail-iv'.
    const _ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
    function _sailNum(sail) {
        if (typeof sail === 'number' && sail >= 1 && sail <= 6) return sail | 0;
        const s = String(sail == null ? '' : sail).toLowerCase().replace(/sail|[-_\s]/g, '');
        if (/^[1-6]$/.test(s)) return +s;
        if (_ROMAN[s]) return _ROMAN[s];
        return null;
    }
    // Which robustness level a single OSO demands at a given SAIL.
    function _levelFor(oso, n) {
        if (oso.high && oso.high.indexOf(n) !== -1) return 'High';
        if (oso.medium && oso.medium.indexOf(n) !== -1) return 'Medium';
        if (oso.low && oso.low.indexOf(n) !== -1) return 'Low';
        return 'None';
    }

    // osoRobustness(sail) -> the full set of OSO objectives for that SAIL.
    // Each entry names the required robustness (None/Low/Medium/High) and the
    // Annex E page where the human reads the actual integrity/assurance
    // criteria (never reproduced here — copyrighted).
    function osoRobustness(sail) {
        const d = _annexE();
        const n = _sailNum(sail);
        if (n == null) throw new Error('sora: SAIL required — one of I–VI (or 1–6). SAIL comes from sail(finalGRC, residualARC).');
        const objectives = d.osos.map(o => {
            const level = _levelFor(o, n);
            return {
                id: o.id, n: o.n, title: o.title, robustness: level,
                required: level !== 'None',
                page: o.page,
                lowUnavailable: !!o.lowNA,
                cite: ANNEX_E_CITE + ', ' + o.id + ', p.' + o.page,
                criteriaNote: level === 'None'
                    ? 'Annex E defines no criteria for ' + o.id + ' at SAIL ' + (d.sailRoman[n] || n) + ' — Optional or Not-Required per SORA Main Body Table 14.'
                    : 'Read the ' + level + '-robustness integrity & assurance criteria in ' + ANNEX_E_CITE + ' at ' + o.id + ' (p.' + o.page + '). Criteria text is copyrighted and not reproduced here.'
            };
        });
        const required = objectives.filter(o => o.required);
        return {
            sail: d.sailRoman[n] || String(n),
            sailNum: n,
            objectives: objectives,
            requiredCount: required.length,
            counts: {
                High: required.filter(o => o.robustness === 'High').length,
                Medium: required.filter(o => o.robustness === 'Medium').length,
                Low: required.filter(o => o.robustness === 'Low').length,
                None: objectives.length - required.length
            },
            basis: 'Annex E §E.2 robustness-per-SAIL assignment · ' + ANNEX_E_CITE
        };
    }
    // osoRequirements(sail) — the SORA analog of the DAL auto-reqs. Emits one
    // deterministic shall-statement per REQUIRED OSO at the operation's SAIL:
    // an OSO-robustness objective (integrity + assurance), NOT a probability
    // target and NOT a DAL. Verification names both robustness dimensions and
    // points to the Annex E page for the acceptance criteria (never inlined).
    // Stable ids (SORA-OSOnn) so re-running is idempotent, like the DAL lane.
    function osoRequirements(sail) {
        const r = osoRobustness(sail);
        const reqs = r.objectives.filter(o => o.required).map(o => ({
            id: 'SORA-' + o.id.replace('#', ''),
            osoId: o.id,
            title: o.title,
            robustness: o.robustness,
            text: 'The operation shall satisfy ' + o.id + ' (' + o.title + ') to ' + o.robustness +
                  ' robustness — meeting BOTH the integrity (safety gain) and assurance (method of proof) criteria for the ' +
                  o.robustness + ' level at SAIL ' + r.sail + '.',
            verification: 'Integrity: demonstrate the ' + o.robustness + '-level safety gain. Assurance: provide the ' +
                  o.robustness + '-level evidence/method of proof. Acceptance criteria per ' + o.cite + '.',
            source: 'SORA Annex E',
            cite: o.cite,
            page: o.page,
            derived: true,
            lane: 'sora'
        }));
        return {
            sail: r.sail, sailNum: r.sailNum,
            requirements: reqs,
            count: reqs.length,
            note: 'SORA basis: requirements are OSO robustness objectives (None/Low/Medium/High), not DAL allocations or per-flight-hour probability targets. ' +
                  'Below the required set, remaining OSOs are Optional/Not-Required per SORA Main Body Table 14.',
            basis: 'Annex E §E.2 · ' + ANNEX_E_CITE
        };
    }

    // ---- Step 4 · Initial Air Risk Class (Annex C Table 1, p.12) -----------
    // SINGLE-SOURCED — see [S5] in the header. Structurally corroborated by
    // [S2]/[S6], NOT cell-by-cell cross-verified the way GRC/SAIL are.
    // Every result names this explicitly via `confidence` + `basis` so a
    // caller (or a human reviewing output) can never mistake it for the
    // two-source-verified tier the rest of this file ships at.
    const AEC_ARC_CITE = 'JARUS SORA v2.5 Annex C, Table 1 "Operational Environment, AEC and ARC" (p.12) — single-sourced via third-party mirror, see [S5]';
    // Each row: the decision-tree predicate (checked in order, first match
    // wins) plus its AEC number, generalised density rating, and initial ARC.
    const AEC_TABLE = [
        { aec: 12, label: 'Atypical or segregated airspace',                                    density: 1, arc: 'a', test: i => i.atypical === true },
        { aec: 11, label: '> FL600',                                                             density: 1, arc: 'b', test: i => i.altitude === 'aboveFL600' },
        { aec: 1,  label: 'Airport/heliport environment, Class B/C/D airspace',                  density: 5, arc: 'd', test: i => i.airportEnv === true && i.airspaceClassBCD === true },
        { aec: 6,  label: 'Airport/heliport environment, Class E/F/G airspace',                  density: 3, arc: 'c', test: i => i.airportEnv === true && i.airspaceClassBCD !== true },
        { aec: 2,  label: '>500ft AGL, <FL600, Mode-S Veil or Transponder Mandatory Zone (TMZ)',  density: 5, arc: 'd', test: i => i.altitude === 'above500' && i.tmz === true },
        { aec: 3,  label: '>500ft AGL, <FL600, controlled airspace',                              density: 5, arc: 'd', test: i => i.altitude === 'above500' && i.controlled === true },
        { aec: 4,  label: '>500ft AGL, <FL600, uncontrolled airspace over urban area',            density: 3, arc: 'c', test: i => i.altitude === 'above500' && i.controlled !== true && i.urban === true },
        { aec: 5,  label: '>500ft AGL, <FL600, uncontrolled airspace over rural area',            density: 2, arc: 'c', test: i => i.altitude === 'above500' && i.controlled !== true && i.urban !== true },
        { aec: 7,  label: '<500ft AGL, Mode-S Veil or Transponder Mandatory Zone (TMZ)',          density: 3, arc: 'c', test: i => i.altitude === 'below500' && i.tmz === true },
        { aec: 8,  label: '<500ft AGL, controlled airspace',                                      density: 3, arc: 'c', test: i => i.altitude === 'below500' && i.controlled === true },
        { aec: 9,  label: '<500ft AGL, uncontrolled airspace over urban area',                    density: 2, arc: 'c', test: i => i.altitude === 'below500' && i.controlled !== true && i.urban === true },
        { aec: 10, label: '<500ft AGL, uncontrolled airspace over rural area',                    density: 1, arc: 'b', test: i => i.altitude === 'below500' && i.controlled !== true && i.urban !== true }
    ];
    // arcInitial({ atypical, altitude:'above500'|'below500'|'aboveFL600',
    //              airportEnv, airspaceClassBCD, controlled, tmz, urban })
    function arcInitial(input) {
        if (!input || typeof input !== 'object') throw new Error('sora: input required — describe the ConOps airspace (atypical | altitude + controlled/airportEnv/tmz/urban). See AEC_TABLE for the exact fields the decision tree reads.');
        if (input.atypical !== true && input.airportEnv !== true) {
            const valid = ['above500', 'below500', 'aboveFL600'];
            if (valid.indexOf(input.altitude) === -1) throw new Error('sora: altitude required — one of ' + valid.join('/') + ' (or atypical:true, or airportEnv:true) — the AEC decision tree binds on it first.');
        }
        const row = AEC_TABLE.find(r => r.test(input));
        if (!row) throw new Error('sora: no AEC row matched this ConOps description — check airportEnv/controlled/tmz/urban combination (mutually exclusive per Annex C Table 1).');
        return {
            aec: row.aec, aecLabel: row.label,
            density: row.density,
            arc: 'ARC-' + row.arc,
            confidence: 'single-source',
            note: 'This determination is SINGLE-SOURCED (see [S5]) — structurally corroborated but not cell-by-cell cross-verified against a second authority, unlike the GRC/SAIL tables in this file. Treat as a strong starting point for the analyst’s declared residual ARC, not a substitute for their own ConOps rationale.',
            basis: AEC_ARC_CITE
        };
    }

    // ---- Step 8 · Containment robustness (Annex B Table 8, p.39) -----------
    // TWO-SOURCE VERIFIED for the 1 m UA class only — see [S2]/[S6] in the
    // header. Tables 9-13 (larger UA classes) are NOT covered — containment()
    // refuses for anything outside the 1 m / 25 m/s class rather than
    // extrapolate.
    const CONTAINMENT_CITE = 'JARUS SORA v2.5 Annex B, Table 8 (1 m UA class, p.39 of EASA AMC & GM ED Decision 2025/018/R) — cross-checked [S2] + [S6]';
    const CONTAINMENT_TABLE_8 = {
        uaClass: { dimM: 1, speedMps: 25 },
        appliesWhen: 'Sheltering assumed applicable in the adjacent ground area (Annex B Table B.2 governs whether that assumption holds); average population density < 50,000 people/km².',
        columns: ['gt400k', '40kto400k', 'lt40k'],
        columnLabels: { gt400k: 'Outdoor assemblies > 400,000 people within 1 km', '40kto400k': 'Outdoor assemblies 40,000–400,000 people within 1 km', lt40k: 'Outdoor assemblies < 40,000 people within 1 km' },
        // keyed by SAIL number (1-6); SAIL I & II share a row.
        bySail: {
            1: { gt400k: 'High',   '40kto400k': 'Medium', lt40k: 'Low' },
            2: { gt400k: 'High',   '40kto400k': 'Medium', lt40k: 'Low' },
            3: { gt400k: 'Medium', '40kto400k': 'Low',    lt40k: 'Low' },
            4: { gt400k: 'Low',    '40kto400k': 'Low',    lt40k: 'Low' },
            5: { gt400k: 'Low',    '40kto400k': 'Low',    lt40k: 'Low' },
            6: { gt400k: 'Low',    '40kto400k': 'Low',    lt40k: 'Low' }
        }
    };
    // containment({ dimM, speedMps, sail, assemblies: 'gt400k'|'40kto400k'|'lt40k', shelteringApplicable:true })
    function containment(input) {
        if (!input || typeof input !== 'object') throw new Error('sora: input required — { dimM, speedMps, sail, assemblies, shelteringApplicable }');
        const dimM = +input.dimM, speedMps = +input.speedMps;
        if (!(dimM > 0) || !(speedMps > 0)) throw new Error('sora: dimM and speedMps required (> 0) — containment is keyed by the same UA-class columns as iGRC.');
        if (dimM > CONTAINMENT_TABLE_8.uaClass.dimM || speedMps > CONTAINMENT_TABLE_8.uaClass.speedMps) {
            throw new Error('sora: containment Tables 9-13 (UA classes above 1 m / 25 m/s) are NOT yet sourced — refusing to guess a robustness level for a ' + dimM + ' m / ' + speedMps + ' m/s class aircraft. Only Table 8 (1 m / 25 m/s class) is verified.');
        }
        if (input.shelteringApplicable !== true) {
            throw new Error('sora: Table 8 assumes sheltering is applicable in the adjacent ground area (Annex B Table B.2) — pass shelteringApplicable:true once that’s confirmed for this ConOps, or containment robustness for the non-sheltered case is not covered by the data this engine holds.');
        }
        const n = _sailNum(input.sail);
        if (n == null) throw new Error('sora: SAIL required — one of I–VI (or 1–6). SAIL comes from sail(finalGRC, residualARC).');
        const col = input.assemblies;
        if (CONTAINMENT_TABLE_8.columns.indexOf(col) === -1) throw new Error('sora: assemblies required — one of ' + CONTAINMENT_TABLE_8.columns.join('/') + ' (outdoor-assembly population within 1 km of the operational volume).');
        const robustness = CONTAINMENT_TABLE_8.bySail[n][col];
        return {
            robustness: robustness,
            uaClass: '1 m / 25 m/s',
            assemblies: col, assembliesLabel: CONTAINMENT_TABLE_8.columnLabels[col],
            confidence: 'two-source',
            appliesWhen: CONTAINMENT_TABLE_8.appliesWhen,
            basis: CONTAINMENT_CITE
        };
    }

    const API = { CITE, IGRC_COLS, IGRC_ROWS, IGRC_VALUES, MITIGATIONS, SAIL_TABLE, AEC_TABLE, AEC_ARC_CITE, CONTAINMENT_TABLE_8, CONTAINMENT_CITE,
                  igrc, finalGrc, sail, adjacentAreaKm, osoList, osoRobustness, osoRequirements, arcInitial, containment };
    if (typeof window !== 'undefined') window.SORA = API;
    if (typeof module !== 'undefined') module.exports = API;
})();

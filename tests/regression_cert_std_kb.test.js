#!/usr/bin/env node
/*
 * Regression — DO-178C/DO-254/MIL-STD-882E/ASTM F3230/CS-25-27-29 hard-coded
 * into the AI spine's CHAT-retrieval corpus (cert_std_kb_data.js).
 *
 *   [1] data integrity: cert_std_kb_data.js exposes 13 chunks with the corpus
 *       schema {id, source, topic, text}, ids certstd-01..13 unique and
 *       contiguous, every chunk attributed to the umbrella corpus source.
 *   [2] doctrine: mixed copyright posture declared in the header — DO-178C/
 *       DO-254/ASTM F3230 licensed (cite-and-point), MIL-STD-882E public
 *       domain, CS-25/27/29 free-but-not-public-domain. No RNG/Date/eval.
 *   [3] content lock: the facts the assistant must never get wrong — the
 *       verified 71/69/62/26/none DO-178C objective counts by level, DO-254's
 *       five levels and its own lifecycle phases, MIL-STD-882E Table I/II
 *       verbatim category names AND the "not the same scale" warning, the
 *       real ASTM F44.50 family, and CS-25/27/29 mirroring §25/27/29.1309.
 *   [4] NO-DRIFT PIN: every fact chunk (4) states is copied from, and must
 *       stay identical to, cert_basis_spine.js's own FRAMEWORKS/CLAUSES text
 *       for these five standards — the spine and this corpus can never
 *       disagree (same discipline as sora_kb_data.js's drift pin).
 *   [5] wiring: ai_assistant.js merges SL_CERTSTD_KB into the retrieval
 *       corpus, carries this lane's vocabulary in _FTAKB_SYN, names the five
 *       standards in the chat-mode REFERENCE METHOD framing, and damps the
 *       lane behind _CERTSTD_SIGNAL (mechanically proven to carry no
 *       classical-lane word, same pattern as the STPA/HF locks).
 *   [6] load order: ai_loader FILES lists cert_std_kb_data after hf_kb_data
 *       and before ai_assistant; index.html's loader cache-buster was bumped.
 * Run: node tests/regression_cert_std_kb.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const KB = require('../site/cert_std_kb_data.js');
const ksrc = S('cert_std_kb_data.js');
const asrc = S('ai_assistant.js');
const spineSrc = S('cert_basis_spine.js');
const ALL = KB.chunks.map(c => c.text).join('\n');
const has = re => re.test(ALL);

// ---- [1] data integrity ----------------------------------------------------------
{
    // 31 Aug 2026 — superseded in place: v0.2 adds the Part 23 block (certstd-14..23,
    // AC 23.1309-1E + 14 CFR §23.2510, public-domain quotes). 13 -> 23.
    // 31 Aug 2026 (later the same day) — superseded again: v0.3 adds the EASA SC-VTOL
    // family (certstd-24..31: SC-VTOL-02 Issue 2, MOC SC-VTOL Issue 2, MOC-5), cite-and-
    // point. 23 -> 31.
    // 31 Aug 2026 (third supersede today) — v0.4 adds FAA AC 25.1309-1B (certstd-32..41,
    // public-domain verbatim, fetched from faa.gov). 31 -> 41.
    // 31 Aug 2026 (fourth) — v0.5 adds the rotorcraft family (certstd-42..47: AC 29-2C,
    // AC 27-1B, PS-ASW-27-15 continuum, draft powered-lift continuum). 41 -> 47.
    // 31 Aug 2026 (fifth) — v0.6 adds engines & propellers (certstd-48..51: §33.75,
    // AC 33.75-1A, §35.15). 47 -> 51.
    // 31 Aug 2026 (sixth) — v0.7 adds the development-assurance ACs (certstd-52..56:
    // AC 20-174, AC 20-115D, AC 20-152A). 51 -> 56.
    // 31 Aug 2026 (seventh) — v0.8 adds EASA CS 25.1309 / AMC 25.1309 (certstd-57..59). 56 -> 59.
    // 1 Sep 2026 (eighth) — v0.9 adds EASA CS-23 / CS-27 / CS-29 / CS-E (certstd-60..63). 59 -> 63.
    // 1 Sep 2026 (ninth) — v0.10 adds 14 CFR Part 21 §21.16/.17/.101 + operating-rule note (certstd-64..66). 63 -> 66.
    check('exactly 66 cert-std chunks (…+4 EASA CS-23/27/29/E + 3 Part 21/operating)', KB.chunks.length === 66, 'got ' + KB.chunks.length);
    check('every chunk carries {id, source, topic, text} with real text',
        KB.chunks.every(c => c.id && c.source && c.topic && typeof c.text === 'string' && c.text.length > 300));
    check('ids are certstd-01..certstd-66, unique and contiguous', (function () {
        const ids = KB.chunks.map(c => c.id);
        if (new Set(ids).size !== ids.length) return false;
        return ids.every((id, i) => id === 'certstd-' + String(i + 1).padStart(2, '0'));
    })());
    check('browser global is SL_CERTSTD_KB with version + method, node export carries chunks',
        /window\.SL_CERTSTD_KB = \{ version: 11, method: 'lexical'/.test(ksrc) && Array.isArray(KB.chunks));
}

// ---- [1c] SC-VTOL NO-DRIFT PINS (31 Aug 2026) ------------------------------------
// certstd-26 states MOC SC-VTOL Issue 2 Table 1 (per-flight-hour objective + FDAL for
// Enhanced and Basic 1/2/3). The engine carries the same twenty cells in
// safety_targets.js PROB_TARGETS/DAL_TARGETS (rows 'SC-VTOL Enhanced', 'SC-VTOL Basic 1/2/3'
// + the legacy 'SC-VTOL Basic' alias). Verified against the EASA PDF fetched 31 Aug 2026;
// this section parses the corpus sentence and compares it to the evaluated engine so the
// two can never disagree silently. EXECUTED, not re-typed.
{
    const vm = require('vm');
    const st = S('safety_targets.js');
    const ctx = vm.createContext({ window: {} });
    vm.runInContext(st.replace(/^const /gm, 'var '), ctx);
    const PT = vm.runInContext('PROB_TARGETS', ctx), DT = vm.runInContext('DAL_TARGETS', ctx);
    const c26 = KB.chunks.find(c => c.id === 'certstd-26').text;
    const exp = v => 'e' + Math.round(Math.log10(v));   // 1e-7 -> 'e-7'
    // corpus sentences:
    //   Category Enhanced: Minor ≤1e-3 FDAL D; Major ≤1e-5 FDAL C; Hazardous ≤1e-7 FDAL B; Catastrophic ≤1e-9 FDAL A
    //   Basic 2 (2 to 6 passengers): Minor 1e-3/D, Major 1e-5/C, Hazardous 1e-7/FDAL C, Catastrophic 1e-8/FDAL B.
    //   Basic 1 (0 to 1 passenger): Minor 1e-3/D, Major 1e-5/C, Hazardous 1e-6/FDAL C, Catastrophic 1e-7/FDAL C.
    //   Basic 3 (7 to 9 passengers): identical to Enhanced — 1e-3/D, 1e-5/C, 1e-7/B, 1e-9/A.
    function parseRow(label) {
        const seg = (c26.match(new RegExp(label + '[^:]*: ([^.]*)\\.')) || ['', ''])[1];
        const out = {};
        for (const sev of ['Minor', 'Major', 'Hazardous', 'Catastrophic']) {
            const m = seg.match(new RegExp(sev + ' ≤?(1e-\\d)(?:/| FDAL |/FDAL )([A-E])'));
            if (m) out[sev] = [m[1], m[2]];
        }
        if (/identical to Enhanced/.test(seg)) {
            const ms = [...seg.matchAll(/(1e-\d)\/([A-E])/g)];
            ['Minor', 'Major', 'Hazardous', 'Catastrophic'].forEach((sev, i) => { if (ms[i]) out[sev] = [ms[i][1], ms[i][2]]; });
        }
        return out;
    }
    const rows = { 'SC-VTOL Enhanced': parseRow('Category Enhanced'), 'SC-VTOL Basic 3': parseRow('Basic 3'),
                   'SC-VTOL Basic 2': parseRow('Basic 2'), 'SC-VTOL Basic 1': parseRow('Basic 1') };
    let ok = true, detail = [];
    for (const key of Object.keys(rows)) for (const sev of ['Minor', 'Major', 'Hazardous', 'Catastrophic']) {
        const corpus = rows[key][sev];
        const engine = PT[key] && DT[key] ? ['1' + exp(PT[key][sev]), DT[key][sev]] : null;
        if (!corpus || !engine || corpus[0] !== engine[0] || corpus[1] !== engine[1]) { ok = false; detail.push(key + '/' + sev + ': corpus ' + JSON.stringify(corpus) + ' engine ' + JSON.stringify(engine)); }
    }
    check('SC-VTOL TABLE 1: corpus text == engine PROB_TARGETS + DAL_TARGETS, all 16 prob + 16 FDAL cells', ok, detail.join('; '));
    check('legacy SC-VTOL Basic alias == Basic 1 row (the corpus retraction sentence names the old row)',
        JSON.stringify(PT['SC-VTOL Basic']) === JSON.stringify(PT['SC-VTOL Basic 1']) && JSON.stringify(DT['SC-VTOL Basic']) === JSON.stringify(DT['SC-VTOL Basic 1']) &&
        /Retraction: before 31 Aug 2026 the tool carried a single SC-VTOL Basic row with Major 1e-4/.test(c26));
    check('SC-VTOL block declares the cite-and-point posture and the three EASA sources with issue + date',
        /SC-VTOL-02 Issue 2 \(10 June 2024\)/.test(ksrc) && /MOC SC-VTOL Issue 2 \(12 May 2021, FINAL\)/.test(ksrc) && /MOC-5 SC-VTOL Issue 1 \(18 July\s*2025/.test(ksrc) && /cite and point/.test(ksrc));
    check('the SC paragraphs the corpus cites exist in SC-VTOL-02 (2000, 2005, 2250(c), 2500, 2505, 2510(a)-(c), 2517) and none of the invented ones',
        /VTOL\.2005\(b\)/.test(ALL) && /VTOL\.2250\(c\)/.test(ALL) && /VTOL\.2510\(c\)/.test(ALL) && /MOC VTOL\.2517/.test(ALL) && !/SC-VTOL\.25(11|21|26)/.test(ALL) && /there is no \.2511, \.2521 or \.2526 in the Special Condition/.test(ALL));
    check('category-dependent Hazardous/Catastrophic is stated (Enhanced: single fatality Catastrophic; Basic: multiple)',
        /fatalities are excluded from Hazardous entirely/.test(ALL) && /Catastrophic is multiple fatalities/.test(ALL));
    check('the signal regex admits SC-VTOL vocabulary (vtol, sc-vtol, moc)',
        (function () { const m = S('ai_assistant.js').match(/_CERTSTD_SIGNAL = (\/.*\/i);/); if (!m) return false; const re = eval(m[1]);
            return re.test('sc-vtol basic 2 catastrophic') && re.test('what does the moc say for vtol') && re.test('category enhanced objectives'); })());
}

// ---- [1b] PART 23 NO-DRIFT PINS (31 Aug 2026) ------------------------------------
// The Part 23 chunks quote AC 23.1309-1E Figure 2. The deterministic engine carries
// the same sixteen probability cells (safety_targets.js PROB_TARGETS) and the
// primary-DAL grid (DAL_TARGETS). Both were verified cell-for-cell against a copy of
// the AC fetched from faa.gov on 31 Aug 2026. This section pins corpus <-> engine
// so a future edit to either side that makes them disagree fails the wall. The
// pins are EXECUTED: the engine tables are evaluated from the shipped file and the
// corpus text is parsed, never re-typed here.
{
    const vm = require('vm');
    const st = S('safety_targets.js');
    const ctx = vm.createContext({ window: {} });
    vm.runInContext(st.replace(/^const /gm, 'var '), ctx);
    const PT = vm.runInContext('PROB_TARGETS', ctx), DT = vm.runInContext('DAL_TARGETS', ctx);
    const c17 = KB.chunks.find(c => c.id === 'certstd-17').text;
    const c23 = KB.chunks.find(c => c.id === 'certstd-23').text;
    const exp = v => { const e = Math.round(Math.log10(v)); return '1E' + e; };   // 1e-7 -> '1E-7'
    // probability cells: parse "<Severity>: less than 1E-x for Class ...; less than 1E-y for Classes ..." from the chunk
    const sevs = ['Minor', 'Major', 'Hazardous', 'Catastrophic'];
    const classes = ['I', 'II', 'III', 'IV'];
    let probOk = true, probDetail = [];
    for (const sev of sevs) {
        const seg = (c17.match(new RegExp(sev + ': ([^.]*)\\.')) || ['', ''])[1];
        for (const cl of classes) {
            const engine = exp(PT['Part 23 ' + cl][sev]);
            // the clause naming this class (e.g. "less than 1E-7 for Classes III and IV" or "for Class I")
            const re = new RegExp('less than (1E-\\d) for Class(?:es)? ([^;]*)');
            let found = null;
            for (const m of seg.matchAll(new RegExp(re.source, 'g'))) {
                const named = m[2].replace(/ and /g, ', ').replace(/ alike/g, '').split(/,\s*/).map(x => x.trim());
                if (named.includes(cl)) found = m[1];
            }
            if (found !== engine) { probOk = false; probDetail.push(sev + '/' + cl + ': corpus ' + found + ' engine ' + engine); }
        }
    }
    check('PART 23 PROBABILITY CELLS: corpus Figure 2 text == engine PROB_TARGETS, all 16', probOk, probDetail.join('; '));
    // DAL primary column: "Catastrophic: Class I P=C, S=C; Class II P=C, S=C; Class III P=B, S=C; Class IV P=A, S=B."
    let dalOk = true, dalDetail = [];
    for (const sev of ['Major', 'Hazardous', 'Catastrophic']) {
        const seg = (c23.match(new RegExp(sev + ': ([^.]*)\\.')) || ['', ''])[1];
        for (const cl of classes) {
            const engine = DT['Part 23 ' + cl][sev];
            let found = null;
            const perClass = seg.match(new RegExp('Class ' + cl + ' P=([A-E])'));
            if (perClass) found = perClass[1];
            else { const all = seg.match(/P=([A-E]), S=[A-E] for every class/); if (all) found = all[1]; }
            if (found !== engine) { dalOk = false; dalDetail.push(sev + '/' + cl + ': corpus ' + found + ' engine ' + engine); }
        }
    }
    const minorAll = /Minor: P=D for every class/.test(c23) && classes.every(cl => DT['Part 23 ' + cl].Minor === 'D');
    check('PART 23 PRIMARY DAL GRID: corpus Figure 2 text == engine DAL_TARGETS, all 16', dalOk && minorAll, dalDetail.join('; '));
    // provenance discipline on the new block
    check('Part 23 block declares public-domain quoting and the fetch date', /PUBLIC DOMAIN/.test(ksrc) && /fetched from faa\.gov and ecfr\.gov on 31 Aug 2026/.test(ksrc));
    check('§23.2510 chunk carries the rule verbatim with its Federal Register citation',
        /\(a\) Each catastrophic failure condition is extremely improbable; \(b\) Each hazardous failure condition is extremely remote; and \(c\) Each major failure condition is remote\./.test(ALL) && /81 FR 96689/.test(ALL));
    check('the qualitative-vs-quantitative chunk answers the live Teams question in its own text',
        /qualitative alone is acceptable only for a simple and conventional installation/.test(ALL) && /less-than-1E-7 objective/.test(ALL));
    check('the signal regex admits Part 23 vocabulary (else the lane is damped to 0.45 for exactly these questions)',
        (function () { const m = S('ai_assistant.js').match(/_CERTSTD_SIGNAL = (\/.*\/i);/); if (!m) return false; const re = eval(m[1]);
            return re.test('part 23 class iii hazardous') && re.test('per AC 23.1309') && re.test('what does 23.2510 say') && !re.test('what is a functional hazard assessment'); })());
}

// ---- [1d] AC 25.1309-1B PINS (31 Aug 2026) -------------------------------------------
// The Part 25 chunks quote AC 25.1309-1B (30 Aug 2024, cancels 1A). The engine's Part 25
// row is the top of each §3.3.1 range; the rubric module carries the same §3.1 sentences.
{
    const vm = require('vm');
    const st = S('safety_targets.js');
    const ctx = vm.createContext({ window: {} });
    vm.runInContext(st.replace(/^const /gm, 'var '), ctx);
    const PT = vm.runInContext('PROB_TARGETS', ctx);
    const c34 = KB.chunks.find(c => c.id === 'certstd-34').text;
    // "Probable — on the order of 1×10^-3 or less but greater than 1×10^-5; Remote — 1×10^-5 ...; Extremely Remote — 1×10^-7 ...; Extremely Improbable — 1×10^-9 or less"
    const top = { Minor: 'Probable', Major: 'Remote', Hazardous: 'Extremely Remote', Catastrophic: 'Extremely Improbable' };
    let ok = true, detail = [];
    Object.keys(top).forEach(sev => {
        const m = c34.match(new RegExp(top[sev] + ' — (?:on the order of )?1×10\\^(-\\d)'));
        const corpus = m ? Number('1e' + m[1]) : null;
        if (corpus !== PT['Part 25'][sev]) { ok = false; detail.push(sev + ': corpus ' + corpus + ' engine ' + PT['Part 25'][sev]); }
    });
    check('AC 25.1309-1B §3.3.1 range tops == engine PROB_TARGETS Part 25 (4 cells, parsed)', ok, detail.join('; '));
    check('AC 25.1309-1B identified precisely: 30 Aug 2024, AIR-600, cancels 1A of June 21 1988, amendment 25-152 / 89 FR 68706',
        has(/08\/30\/2024/) && has(/AIR-600/) && has(/CANCELS AC 25\.1309-1A of June 21, 1988/) && has(/amendment 25-152 \(89 FR 68706/));
    check('the five §3.1 definitions verbatim incl. Note 1 (CS&FL → catastrophic) and Note 2 (two or more)',
        has(/"A failure condition that would result in multiple fatalities, usually with the loss of the airplane\."/) && has(/prevent continued safe flight and landing should be classified as catastrophic/) && has(/means two or more fatalities/));
    check('the latent-failure numbers: 1\/1000 latency, 1×10\^-5 residual, CSL\+1 definition',
        has(/does not exceed 1\/1000/) && has(/on the order of 1×10\^-5 per flight hour or less \(residual risk\)/) && has(/combination of two failures, either of which could be latent for more than one flight/));
    check('"on the order of" factors: two for remote, three for extremely remote / improbable',
        has(/factor of two may be considered on the order of/) && has(/a factor of three/));
    check('Appendix E accepted probabilities carried (icing 1, SLD 10\^-2/fh, gust 10\^-5/fh, cargo fire 3\.5×10\^-8/fh, go-around 7×10\^-4/flight)',
        has(/Appendix C icing, probability 1/) && has(/10\^-2 per flight hour \(AC 25-28\)/) && has(/10\^-5 per flight hour \(§25\.341\)/) && has(/3\.5×10\^-8 per flight hour/) && has(/go-around 7×10\^-4 per flight/));
    check('per-flight → per-flight-hour conversion rule stated (divide by ONE hour, not mean duration)', has(/dividing by ONE hour, not by the mean flight duration/));
    check('the paragraph re-numbering warning: 1A ¶9/10/11 → 1B 3.2–3.3 / 7.6 + App F / App C', has(/old numbering; the 1B equivalents are 3\.2–3\.3/));
    check('the severity rubric module quotes the same §3.1 sentences (drift pin lives in regression_severity_rubrics)',
        /A failure condition that would result in multiple fatalities, usually with the loss of the airplane\./.test(S('severity_rubrics.js')));
}

// ---- [1e] ROTORCRAFT PINS (31 Aug 2026) ----------------------------------------------
{
    const vm = require('vm');
    const st = S('safety_targets.js');
    const ctx = vm.createContext({ window: {} });
    vm.runInContext(st.replace(/^const /gm, 'var '), ctx);
    const PT = vm.runInContext('PROB_TARGETS', ctx), DT = vm.runInContext('DAL_TARGETS', ctx);
    const c43 = KB.chunks.find(c => c.id === 'certstd-43').text;
    // "Minor — ≤10^-3 (Note 1 ...), level D; Major — ≤10^-5, level C; Hazardous or Severe-Major — ≤10^-7, level B; Catastrophic — ≤10^-9, level A"
    const rows = { Minor: /Minor — ≤10\^(-\d) \(Note 1[^)]*\), level ([A-E])/, Major: /Major — ≤10\^(-\d), level ([A-E])/, Hazardous: /Hazardous or Severe-Major — ≤10\^(-\d), level ([A-E])/, Catastrophic: /Catastrophic — ≤10\^(-\d), level ([A-E])/ };
    let ok = true, d = [];
    Object.keys(rows).forEach(sev => { const m = c43.match(rows[sev]); const cp = m ? Number('1e' + m[1]) : null, cd = m ? m[2] : null; if (cp !== PT['Part 29'][sev] || cd !== DT['Part 29'][sev]) { ok = false; d.push(sev + ': corpus ' + cp + '/' + cd + ' engine ' + PT['Part 29'][sev] + '/' + DT['Part 29'][sev]); } });
    check('AC 29-2C Figure AC 29.1309-2 (corpus) == engine Part 29 row, 4 prob + 4 DAL cells', ok, d.join('; '));
    const c46 = KB.chunks.find(c => c.id === 'certstd-46').text;
    // "Class I — Minor <10^-3 D, Major <10^-4 C, Hazardous <10^-5 C, Catastrophic <10^-6 C; Class II — 10^-3 D, 10^-5 C, 10^-6 C, 10^-7 C; ..."
    const seg = (c46.match(/Class I — Minor ([^;]*); Class II — ([^;]*); Class III — ([^;]*); Class IV — ([^.]*)\./) || []);
    ok = true; d = [];
    ['I', 'II', 'III', 'IV'].forEach((cl, i) => {
        const cells = [...String(seg[i + 1] || '').matchAll(/10\^(-\d) ([A-E])/g)].map(m => [Number('1e' + m[1]), m[2]]);
        ['Minor', 'Major', 'Hazardous', 'Catastrophic'].forEach((sev, j) => { const c = cells[j]; if (!c || c[0] !== PT['Part 27 ' + cl][sev] || c[1] !== DT['Part 27 ' + cl][sev]) { ok = false; d.push(cl + '/' + sev + ': corpus ' + JSON.stringify(c) + ' engine ' + PT['Part 27 ' + cl][sev] + '/' + DT['Part 27 ' + cl][sev]); } });
    });
    check('PS-ASW-27-15 draft grid (corpus) == engine Part 27 I–IV, 16 prob + 16 DAL cells', ok, d.join('; '));
    check('the Part 27 chunk declares VERIFICATION STATUS and the retraction of the old row',
        /VERIFICATION STATUS \(updated 1 Sep 2026\)/.test(c46) && /carries the grid in PROB_TARGETS\/DAL_TARGETS Part 27 I through Part 27 IV, verified against EASA/.test(c46) && /Retraction: before 31 Aug 2026 the tool carried one Part 27 row/.test(c46));
    check('AC 27-1B chunk states the AC tabulates NO per-severity objective and the non-IFR single-failure note',
        has(/it tabulates no per-severity probability objective/) && has(/The only failure or reliability requirement is that no single failure can result in a hazard to the rotorcraft/));
    check('AC 29-2C identity: Chg 4 5\/1\/2014, Amendment 29-40, AC 29.1309A / Amendment 29-53 → §29.1316', has(/Amendment 29-40; Change 4, 5\/1\/2014/) && has(/AC 29\.1309A \(Amendment 29-53/));
    check('rotorcraft Hazardous verbatim: "possible serious or fatal injury to a passenger or a cabin crew member, excluding the flight crew" (29) and the Part 27 f.(1) Catastrophic = prevent CS&FL',
        has(/possible serious or fatal injury to a passenger or a cabin crew member, excluding the flight crew/) && has(/Catastrophic — "failure conditions that would prevent continued safe flight and landing"/));
    check('powered-lift draft continuum carried as DRAFT context, never engine numbers', has(/PS-AIR-21\.17-01/) && has(/never as the engine\'s numbers|never as the engine's numbers/));
}

// ---- [1f] ENGINE / PROPELLER PINS (31 Aug 2026) --------------------------------------
{
    const vm = require('vm');
    const st = S('safety_targets.js');
    const ctx = vm.createContext({ window: {} });
    vm.runInContext(st.replace(/^const /gm, 'var '), ctx);
    const PT = vm.runInContext('PROB_TARGETS', ctx);
    check('§33.75(a)(3) verbatim with both criteria (10^-7..10^-9 range; individual ≤10^-8) and (a)(4) major 10^-5..10^-7',
        has(/rate not in excess of that defined as extremely remote \(probability range of 10−7 to 10−9 per engine flight hour\)/) && has(/can be predicted to be not greater than 10−8 per engine flight hour/) && has(/probability range of 10−5 to 10−7 per engine flight hour/));
    check('§33.75(g)(2) hazardous engine effects verbatim, all seven', has(/\(i\) Non-containment of high-energy debris; \(ii\) Concentration of toxic products[^"]*\(vii\) Complete inability to shut the engine down\./));
    // SUPERSEDED 1 Sep 2026 — was: pinned Part 33 Haz===1e-8 and the corpus "flagged 31 Aug 2026 for a ruling".
    // Ruling: the Part 33 Hazardous scalar was the 1e-8 individual-failure fallback mis-encoded as the
    // summed top-event budget; corrected to 1e-7 (per-effect) to match Part 35 and §33.75(a)(3). The 1e-8
    // individual-cause route survives in the ENGINE rubric. See EXPORT_RUN.md.
    check('RULED (1 Sep 2026): Part 33 and Part 35 Hazardous both 1e-7 (per-effect); corpus records the resolution',
        has(/"Part 33" row carries Hazardous 1e-7 \(the per-effect summed criterion/) &&
        has(/Asymmetry resolved by ruling 1 Sep 2026/) &&
        PT['Part 33'].Hazardous === 1e-7 && PT['Part 33'].Major === 1e-5 &&
        PT['Part 35'].Hazardous === 1e-7 && PT['Part 35'].Major === 1e-5 &&
        PT['Part 33'].Hazardous === PT['Part 35'].Hazardous);
    check('AC 33.75-1A ¶6.a — aircraft-level classes do not apply directly to engine assessments (the reason the rubric swaps ladders)',
        has(/The severity classifications of aircraft-level failure effects do not apply directly to engine safety assessments/));
    check('critical-part primary failures (disks, hubs, impellers, large rotating seals) go to §§33.15/33.27/33.70 and are excluded from the summation',
        has(/NOT included in the per-effect summation/) && has(/§§33\.15 \(materials\), 33\.27 \(rotor integrity\) and 33\.70/));
    check('§35.15(g)(1) hazardous propeller effects verbatim + "NO numeric criterion for major propeller effects"',
        has(/\(i\) The development of excessive drag\. \(ii\) A significant thrust in the opposite direction to that commanded by the pilot\. \(iii\) The release of the propeller or any major portion of the propeller\. \(iv\) A failure that results in excessive unbalance\./) && has(/sets NO numeric criterion for major propeller effects/));
    check('the rubric module carries the §33.75(g)(2) and §35.15(g)(1) lists (drift pin in regression_severity_rubrics)',
        /Complete inability to shut the engine down/.test(S('severity_rubrics.js')) && /The development of excessive drag/.test(S('severity_rubrics.js')));
}

// ---- [1g] DEVELOPMENT-ASSURANCE AC PINS (31 Aug 2026) --------------------------------
{
    check('AC 20-174 identified (09/30/2011, AIR-120) with the two precedence rules verbatim',
        has(/Circular 20-174,[^\n]*09\/30\/2011/) && has(/will take precedence over this AC with regards to development assurance levels/) && has(/The FDAL and IDAL assignments in other ACs should take precedence over the application of SAE ARP 4754A, Section 5\.2/));
    check('AC 20-115D identified (07/21/2017, cancels 20-115C) and recognises DO-178C, DO-330, DO-331/332/333, DO-248C',
        has(/Circular 20-115D,[^\n]*07\/21\/2017/) && has(/cancels AC 20-115C of July 19, 2013/) && has(/ED-215 \/ DO-330/) && has(/ED-218 \/ DO-331/) && has(/ED-216 \/ DO-333/) && has(/DO-248C/));
    check('AC 20-115D Table 2 TQL correlation carried (dev tool A→TQL-1 … D→TQL-4; verification A/B→TQL-4, C/D→TQL-5)',
        has(/Level A → criteria 1, TQL-1; Level B → TQL-2; Level C → TQL-3; Level D → TQL-4/) && has(/Levels A or B → criteria 2, TQL-4; Levels C or D → criteria 2, TQL-5/));
    check('AC 20-115D legacy example (DO-178A Level 2 satisfies B, C, D but not A) and the minimum-level sentence',
        has(/DO-178A Level 2 satisfies software Levels B, C and D but not A/) && has(/The system safety process assigns the minimum development assurance level based on the severity classifications of failure conditions for a given function/));
    check('AC 20-152A identified (10\/7\/22, AIR-622, cancels AC 20-152) — DAL A/B/C scope, not required for DAL D, CD-1..CD-12 named',
        has(/Circular 20-152A,[^\n]*10\/7\/22/) && has(/cancels AC 20-152 of June 30, 2005/) && has(/use of this AC is not required for AEH contributing to hardware DAL D functions/) && has(/CD-12 previously developed hardware/));
    check('AC 20-152A simple-device definition verbatim and COTS-6 (failure modes + common modes → SSA) verbatim',
        has(/is classified as simple only if a technical assessment of the design content supports the ability of the device to be verified by a comprehensive combination of deterministic tests and analyses/) && has(/identify the failure modes of the used functions of the device and the possible associated common modes, and feed both of these back to the system safety assessment process/));
    check('the licensed documents stay pointer-only in these chunks (DO-178C / DO-254 "stays licensed and pointer-only" / "cite and point")',
        has(/DO-178C itself stays licensed and pointer-only/) && has(/DO-254 itself stays licensed and pointer-only/) && has(/DO-254\/ED-80 are RTCA\/EUROCAE licensed — cite and point/));
    check('spine ADVISORY cards for 20-174 / 20-115D / 20-152A carry dates, PDF links and the precedence / TQL / COTS-6 notes',
        (function () { const sp = S('cert_basis_spine.js'); return /AC_20-174\.pdf/.test(sp) && /AC_20-115D\.pdf/.test(sp) && /AC_20-152A\.pdf/.test(sp) && /never allocate below the AC floor/.test(sp) && /TQL-1\.\.5/.test(sp) && /COTS-6 feeds/.test(sp); })());
}

// ---- [1h] EASA AMC 25.1309 PINS (31 Aug 2026) ----------------------------------------
{
    check('CS 25.1309 identified (ED Decision 2020/001/R) with (b)(4)/(b)(5) and the 1/1 000 sum; AMC 25.1309 ED Decision 2021/015/R',
        has(/CS 25\.1309, Equipment, systems and installations \(ED Decision 2020\/001\/R/) && has(/not exceeding 1\/1 000/) && has(/AMC 25\.1309, System design and analysis \(ED Decision 2021\/015\/R\)/));
    check('EASA Probable is stated as > 10^-5 with no 10^-3 upper bound, and Figure 2b classes carried', has(/greater than the order of 1×10\^-5 \(EASA states no 10\^-3 upper bound here\)/) && has(/<10\^-3 \(Minor, reference only, Note 1\), <10\^-5 \(Major\), <10\^-7 \(Hazardous\), <10\^-9 \(Catastrophic\)/));
    check('EASA differences recorded: architecture credit for FDAL/IDAL, no agreed AEH standard, worst-case flight and P = λT ≤ 0.1',
        has(/credit can be taken from system architecture/) && has(/no agreed development assurance standard for airborne electronic hardware/) && has(/exposure time × failure rate when that product is ≤ 0\.1/));
    check('EASA Appendix 4 sparseness vs FAA Appendix E recorded (RTO / jettison / go-around / cabin fires no data)', has(/SPARSER than FAA AC 25\.1309-1B Appendix E/) && has(/lavatory fire and cargo-compartment fire all carry no accepted standard data/));
    check('EASA chunks quote no prose (source-keyed guard) and map CS-25 onto the Part 25 row', KB.chunks.filter(c => /^EASA/.test(c.source)).every(c => !/["“][^"”\n]{40,}["”]/.test(c.text)) && has(/serves a CS-25 program unchanged/));
}

// ---- [1i] EASA CS-23/27/29/E PINS (1 Sep 2026) ---------------------------------------
{
    const vm = require('vm');
    const st = S('safety_targets.js');
    const ctx = vm.createContext({ window: {} });
    vm.runInContext(st.replace(/^const /gm, 'var '), ctx);
    const PT = vm.runInContext('PROB_TARGETS', ctx), DT = vm.runInContext('DAL_TARGETS', ctx);
    // certstd-61 states EASA AMC1 27.1309 Table 2 == the engine's Part 27 grid. Parse and compare.
    const c61 = KB.chunks.find(c => c.id === 'certstd-61').text;
    // "Class I — Minor ≤10^-3 FDAL D, Major ≤10^-4 FDAL C, Hazardous ≤10^-5 FDAL C, Catastrophic ≤10^-6 FDAL C; Class II — 10^-3 D, 10^-5 C, 10^-6 C, 10^-7 C; ..."
    const seg = (c61.match(/Class I — ([^;]*); Class II — ([^;]*); Class III — ([^;]*); Class IV — ([^.]*)\./) || []);
    let ok = true, d = [];
    ['I', 'II', 'III', 'IV'].forEach((cl, i) => {
        const cells = [...String(seg[i + 1] || '').matchAll(/10\^(-\d)(?: FDAL | )([A-E])/g)].map(m => [Number('1e' + m[1]), m[2]]);
        ['Minor', 'Major', 'Hazardous', 'Catastrophic'].forEach((sev, j) => { const c = cells[j]; if (!c || c[0] !== PT['Part 27 ' + cl][sev] || c[1] !== DT['Part 27 ' + cl][sev]) { ok = false; d.push(cl + '/' + sev + ': corpus ' + JSON.stringify(c) + ' engine ' + PT['Part 27 ' + cl][sev] + '/' + DT['Part 27 ' + cl][sev]); } });
    });
    check('EASA AMC1 27.1309 Table 2 (corpus) == engine Part 27 I–IV, 16 prob + 16 FDAL cells (numbers now VERIFIED against in-force EASA)', ok, d.join('; '));
    check('the Part 27 chunk records the EASA verification and the surviving FAA-threshold caveat',
        /the NUMBERS in the engine are now verified against a published, in-force regulatory text \(EASA\)/.test(c61) && /final PS-ASW-27-15 text was not obtained/.test(c61) && has(/EASA AMC1 27\.1309 Table 2 \(CS-27 Amendment 10, ED Decision 2023\/001\/R\) publishes exactly this grid/));
    check('certstd-46 verification status updated to point at EASA for the numbers',
        /NUMBERS, however, are now verified — EASA AMC1 27\.1309 Table 2/.test(KB.chunks.find(c => c.id === 'certstd-46').text));
    check('EASA CS-23 chunk: Levels 1–4 by seats, CS 23.2510 verbatim objective, F3230 Table 3 electric-propulsion variance',
        has(/Level 1 \(0–1\), Level 2 \(2–6\), Level 3 \(7–9\), Level 4 \(10–19\)/) && has(/each catastrophic failure condition extremely improbable, each hazardous extremely remote, each major remote/) && has(/EASA has not yet accepted Table 3 of F3230-25/));
    check('EASA CS-29 chunk: Category A loss of CS&FL catastrophic by rule; AMC = AC 29-2C Chg 7 + AMC 20-115/152/189/170',
        has(/for Category A rotorcraft, the occurrence of any failure condition which would prevent the continued safe flight and landing of the rotorcraft is considered catastrophic/) && has(/AMC 20-115 recognized for software/) && has(/AMC 20-152 for AEH/));
    check('EASA CS-E 510 chunk: hazardous < 10^-7/EFH (individual ≤ 10^-8), major < 10^-5, Engine Critical Parts via CS-E 515, seven hazardous effects',
        has(/probability LESS THAN 10\^-7 per engine flight hour \(the FAA rule states the 10\^-7 to 10\^-9 range\)/) && has(/not greater than 10\^-8 per engine flight hour/) && has(/CS-E 515 \(Engine Critical Parts\)/) && has(/complete inability to shut down/i));
    check('EASA chunks quote no reproduced prose (source-keyed guard holds for the four new EASA chunks)',
        KB.chunks.filter(c => /^EASA CS-2[379]|^EASA CS-E/.test(c.source)).every(c => !/["“][^"”\n]{40,}["”]/.test(c.text)));
}

// ---- [2] doctrine — mixed copyright posture ---------------------------------------
{
    check('header declares the three-way split: RTCA/ASTM licensed, DoD public domain, EASA free-but-cited',
        /LICENSED/.test(ksrc) && /PUBLIC DOMAIN/.test(ksrc) && /US DoD/.test(ksrc) &&
        /EASA/.test(ksrc) && /cite and point/i.test(ksrc));
    // Mechanical: no chunk quotes licensed clause prose (long quoted runs) and no "shall" clauses.
    check('no normative standard "shall" prose stored anywhere in the corpus',
        (ALL.match(/\bshall\b/gi) || []).length === 0);
    // Long quoted runs are allowed ONLY when they are one of the four standards'
    // own OFFICIAL TITLES (a fact, like the spine's own `title:` fields) — never
    // reproduced clause/normative prose. Whitelist, not a blanket length ban.
    check('every long quoted run (40+ chars) is a whitelisted official standard title, never clause prose',
        (function () {
            const TITLES = [
                'Software Considerations in Airborne Systems and Equipment Certification',
                'Design Assurance Guidance for Airborne Electronic Hardware',
                'Department of Defense Standard Practice: System Safety',
                'Standard Practice for Safety Assessment of Systems and Equipment in Small Aircraft'
            ];
            // 31 Aug 2026 — superseded in place, distinction added rather than guard
            // weakened: a chunk whose SOURCE is a US Government work (an FAA Advisory
            // Circular or 14 CFR) is public domain and MAY quote verbatim — that is the
            // whole point of the Part 23 block. Every other source keeps the title-only
            // whitelist exactly as before; the licensed RTCA/ASTM/EASA posture is unchanged.
            const PUBLIC_DOMAIN_SRC = /^(FAA AC \d|14 CFR )/;
            return KB.chunks.every(function (c) {
                if (PUBLIC_DOMAIN_SRC.test(String(c.source))) return true;
                const runs = String(c.text).match(/["“][^"”\n]{40,}["”]/g) || [];
                return runs.every(function (r) {
                    const t = r.slice(1, -1).replace(/[,.;:]+$/, '').trim();
                    return TITLES.indexOf(t) !== -1;
                });
            });
        })());
    check('the public-domain exemption is keyed on SOURCE — no licensed-source chunk (RTCA/ASTM/EASA) quotes 40+ chars',
        KB.chunks.filter(c => /RTCA|ASTM|EASA/.test(String(c.source))).every(c => {
            const runs = String(c.text).match(/["“][^"”\n]{40,}["”]/g) || [];
            return runs.every(r => /Software Considerations|Design Assurance Guidance|Standard Practice for Safety Assessment/.test(r));
        }));
    const codeLines = ksrc.split('\n').filter(l => !/^\s*[/*]/.test(l));
    check('no RNG/Date/eval in the data module',
        codeLines.every(l => l.indexOf('Math.random') === -1 && !/\bnew Date\b|\bDate\.now\b/.test(l)) &&
        ksrc.indexOf('(0, eval)') === -1 && ksrc.indexOf('new Function') === -1);
}

// ---- [3] content lock — the facts the assistant must not get wrong ----------------
{
    check('DO-178C identified precisely: RTCA, Dec 2011, supersedes DO-178B, ED-12C, AC 20-115D',
        has(/RTCA DO-178C/) && has(/December 2011/) && has(/DO-178B/) && has(/ED-12C/) && has(/AC 20-115D/));
    check('the verified DO-178C objective counts by level: 71/69/62/26/none',
        has(/71 objectives at Level A/) && has(/69 at Level B/) && has(/62 at Level C/) &&
        has(/26 at Level D/) && has(/none required at Level E/));
    check('DO-178C lifecycle process areas named (planning, development, verification, CM, QA, cert liaison)',
        has(/planning/i) && has(/verification/i) && has(/configuration management/i) &&
        has(/quality assurance/i) && has(/certification liaison/i));
    check('DO-254 identified as the hardware analogue with its own five levels and ED-80/AC 20-152A',
        has(/RTCA DO-254/) && has(/hardware analogue/i) && has(/ED-80/) && has(/AC 20-152A/) &&
        has(/five-letter level scheme, A through E/i));
    check('MIL-STD-882E identified precisely: US DoD, May 2012, Change 1 Sept 2023, supersedes 882D, public domain',
        has(/MIL-STD-882E/) && has(/May 2012/) && has(/Change 1.* September 2023/) &&
        has(/MIL-STD-882D/) && has(/distribution unlimited/i));
    check('MIL-STD-882E Table I severity categories verbatim: Catastrophic I, Critical II, Marginal III, Negligible IV',
        has(/Catastrophic \(I\)/) && has(/Critical \(II\)/) && has(/Marginal \(III\)/) && has(/Negligible \(IV\)/));
    check('MIL-STD-882E Table II probability levels verbatim: Frequent A through Improbable E, plus Eliminated F',
        has(/Frequent \(A\)/) && has(/Probable \(B\)/) && has(/Occasional \(C\)/) &&
        has(/Remote \(D\)/) && has(/Improbable \(E\)/) && has(/Eliminated \(F\)/));
    check('the explicit warning: MIL-STD-882E is NOT the same scale as the aviation continuum, never map one onto the other',
        has(/NOT the same scale/) && has(/never (be )?mapped onto the other|never map/i));
    check('ASTM F3230 identified precisely: ASTM International, rev 21a, F44.50, §23.2510 MoC alongside AC 23.1309-1E',
        has(/ASTM International/) && has(/21a/) && has(/F44\.50/) && has(/§23\.2510/) && has(/AC 23\.1309-1E/));
    check('ASTM F3230 honest depth limit stated — internal sections paywalled, not held, same treatment as IEC 61508-6 Annex D',
        has(/paywall/i) && has(/IEC 61508-6/) && has(/does NOT carry clause-level depth/i));
    check('the real ASTM F44.50 family named: F3061, F3309, F3233, F3367, F3060',
        has(/F3061/) && has(/F3309/) && has(/F3233/) && has(/F3367/) && has(/F3060/));
    check('CS-25/CS-27/CS-29 identified as EASA equivalents mirroring §25/27/29.1309 respectively',
        has(/CS 25\.1309 mirrors §25\.1309/) && has(/CS 27\.1309 mirrors §27\.1309/) && has(/CS 29\.1309 mirrors §29\.1309/));
    check('the honest-limits chunk restates all five pointer-only limits together',
        !!KB.chunks.find(c => /honest limits, stated together/i.test(c.topic)) &&
        has(/does not run software verification and validation/i) &&
        has(/does not run hardware verification and validation/i) &&
        has(/does not compute or maintain a DoD mishap-risk index/i) &&
        has(/does not hold ASTM F3230.s internal section numbering/i) &&
        has(/does not reproduce EASA CS-25\/27\/29 clause text/i));
}

// ---- [4] NO-DRIFT PIN — must match cert_basis_spine.js's own text ----------------
{
    check('DO-178C objective counts match the spine\'s do178c-levels clause verbatim (71/69/62/26)',
        /71\/69\/62\/26/.test(spineSrc) && has(/71 objectives at Level A, 69 at Level B, 62 at Level C, 26 at Level D/));
    check('MIL-STD-882E "NOT the same scale" warning matches the spine\'s framework note',
        /NOT the same scale/.test(spineSrc) && has(/NOT the same scale/));
    check('the ASTM F44.50 family matches the spine\'s astmf3230-method clause exactly (same five ids)',
        (function () {
            const family = ['F3061', 'F3309', 'F3233', 'F3367', 'F3060'];
            return family.every(id => new RegExp('ASTM ' + id).test(spineSrc)) && family.every(id => has(new RegExp(id)));
        })());
    check('CS-25/27/29 registered in the spine REGS as EASA entries, matching this corpus\'s framing',
        /'CS-25':/.test(spineSrc) && /'CS-27':/.test(spineSrc) && /'CS-29':/.test(spineSrc) &&
        /authority: 'EASA'/.test(spineSrc));
    check('all five standards this corpus covers are pointer-only in the spine (never overclaims coverage)',
        ['do178c-levels', 'do254-levels', 'mil882e-severity', 'astmf3230-method'].every(id =>
            new RegExp("id: '" + id + "'[\\s\\S]{0,400}coverage: 'pointer-only'").test(spineSrc)));
}

// ---- [5] wiring into the AI spine -------------------------------------------------
{
    check('the retriever merges SL_CERTSTD_KB into the same corpus as FTA + SORA + STPA + HF',
        /window\.SL_CERTSTD_KB && Array\.isArray\(window\.SL_CERTSTD_KB\.chunks\)/.test(asrc) &&
        /if \(certstd\.length\) out = out\.concat\(certstd\)/.test(asrc));
    check('_FTAKB_SYN carries this lane\'s vocabulary (do178c, do254, mil882e, astmf3230, cs25/27/29)',
        /do178c:\s*\[/.test(asrc) && /do254:\s*\[/.test(asrc) && /mil882e:\s*\[/.test(asrc) &&
        /astmf3230:\s*\[/.test(asrc) && /cs25:\s*\[/.test(asrc) && /cs27:\s*\[/.test(asrc) && /cs29:\s*\[/.test(asrc));
    check('the chat-mode REFERENCE METHOD framing names all five new standards',
        /RTCA DO-178C\/DO-254, US DoD MIL-STD-882E, ASTM F3230 & the EASA CS-25\/27\/29/.test(asrc));
    check('cross-lane damping exists for the cert-std lane (damped, not removed)',
        /_CERTSTD_SIGNAL/.test(asrc) && /_CERTSTD_DAMP = 0\.\d+/.test(asrc) &&
        /if \(dampCertstd !== 1 && \/\^certstd-\/\.test\(String\(c\.id \|\| ''\)\)\) s \*= dampCertstd;/.test(asrc));
    check('_CERTSTD_SIGNAL is this lane\'s own vocabulary — never a classical-lane word (mechanical)',
        (function () {
            const m = asrc.match(/const _CERTSTD_SIGNAL = \/(.*)\/i;/);
            if (!m) return false;
            const sig = m[1];
            return /do\[- \]\?178c/.test(sig) && /mil\[- \]\?std\[- \]\?882e/.test(sig) && /f3230/.test(sig) &&
                !/\bfha\b|\bfta\b|fmea|4761|4754|\bhazard\b|\bseverity\b(?!.{0,3}category)/.test(sig);
        })());
    check('a read-only kbRetrieve QA hook already covers this lane (shared _ftaKbRetrieve, no new surface needed)',
        /kbRetrieve: function \(q, k\)/.test(asrc) && /_ftaKbRetrieve\(String\(q \|\| ''\), k \|\| 6\)/.test(asrc));
}

// ---- [6] load order + cache-busters -----------------------------------------------
{
    const m = S('ai_loader.js').match(/const FILES = \[([^\]]*)\]/);
    check('ai_loader FILES lists cert_std_kb_data after hf_kb_data, before ai_assistant', !!m && (function () {
        const a = m[1];
        return a.indexOf('cert_std_kb_data.js') !== -1 &&
            a.indexOf('hf_kb_data.js') < a.indexOf('cert_std_kb_data.js') &&
            a.indexOf('cert_std_kb_data.js') < a.indexOf('ai_assistant.js');
    })());
    check('cert_std_kb_data carries a version query string and ai_assistant was bumped (≥71.9)', !!m &&
        /cert_std_kb_data\.js\?v=/.test(m[1]) && (function () {
            const v = m[1].match(/ai_assistant\.js\?v=(\d+)\.(\d+)/);
            return !!v && (parseInt(v[1], 10) > 71 || (parseInt(v[1], 10) === 71 && parseInt(v[2], 10) >= 9));
        })());
    check('index.html loads the bumped ai_loader (≥5.0 — a deploy without the bump is a no-op)',
        (function () {
            const v = S('index.html').match(/ai_loader\.js\?v=(\d+)\.(\d+)/);
            return !!v && (parseInt(v[1], 10) > 5 || (parseInt(v[1], 10) === 5 && parseInt(v[2], 10) >= 0));
        })());
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

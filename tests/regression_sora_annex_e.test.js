#!/usr/bin/env node
/*
 * Regression — SORA Annex E OSO×SAIL matrix (sora_annex_e_data.js) + the
 * sora_core.js v0.2 engine that resolves it.
 *   [1] data integrity: 17 OSOs, each with number/title/page + low/medium/high
 *       SAIL sets drawn from {1..6}; the three sets are disjoint; every OSO
 *       reaches High by SAIL VI; OSO#24 alone carries lowNA (Low = N/A).
 *   [2] verified assignment: the full per-OSO ladder across SAIL I..VI is
 *       pinned cell-for-cell to the Annex E column headers (transcription lock).
 *   [3] engine: osoList() enumerates 17 (OSO#04 present — v0.1 gap closed);
 *       osoRobustness(sail) derives None/Low/Medium/High + a page citation and
 *       never reproduces criteria prose; monotonic required-counts 8/11/16/17/17/17.
 *   [4] refusal: with the data module absent the engine THROWS (no invented
 *       matrix) — the RAM-PREDICT posture.
 *   [5] doctrine: the data module stores NO criteria prose (no "integrity"/
 *       "assurance" paragraph text), only the assignment + page; JARUS marked
 *       licensed:true; no RNG/Date/eval.
 *   [6] AI spine: sora_kb_data.js exposes SL_SORA_KB chunks with the schema,
 *       and the per-OSO ladder text matches the engine (spine can't drift).
 *   [7] AI spine v2 (6 Aug 2026): sora-09..12 (wizard/AEC/containment/
 *       confidence-tier chunks) exist, and the AEC->ARC ladder + containment
 *       Table 8 grid quoted in the KB text are pinned cell-for-cell against
 *       sora_core.js's own AEC_TABLE / CONTAINMENT_TABLE_8 — same no-drift
 *       discipline as [6], plus a pin that confidence language (two-source /
 *       single-source) is never dropped from the KB text.
 * Run: node tests/regression_sora_annex_e.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

const DATA = require('../site/sora_annex_e_data.js');
// bridge node exports → the window shape the engine reads
global.window = { SORA_ANNEX_E: { meta: { licensed: true }, levels: DATA.LEVELS, osos: DATA.OSOS, sailRoman: DATA.SAIL_ROMAN } };
const SORA = require('../site/sora_core.js');
const dsrc = S('sora_annex_e_data.js');

// ---- [1] data integrity ----------------------------------------------------------
{
    const o = DATA.OSOS;
    check('exactly 17 OSOs', o.length === 17);
    check('every OSO: id, positive number, title, Annex E page, three SAIL sets',
        o.every(x => /^OSO#\d\d$/.test(x.id) && x.n > 0 && x.title && x.page > 0 &&
            Array.isArray(x.low) && Array.isArray(x.medium) && Array.isArray(x.high)));
    check('SAIL sets are within 1..6 and pairwise disjoint per OSO',
        o.every(x => {
            const all = [].concat(x.low, x.medium, x.high);
            if (!all.every(n => n >= 1 && n <= 6)) return false;
            return new Set(all).size === all.length;   // no SAIL appears in two robustness sets
        }));
    check('every OSO reaches High by SAIL VI', o.every(x => x.high.indexOf(6) !== -1));
    check('OSO#24 is the only lowNA (Low = N/A) OSO',
        o.filter(x => x.lowNA).map(x => x.id).join(',') === 'OSO#24' && DATA.OSOS.find(x => x.id === 'OSO#24').low.length === 0);
    check('OSO numbers are exactly the SORA-2.5 set (no #10 — merged into #05)',
        o.map(x => x.n).join(',') === '1,2,3,4,5,6,7,8,9,13,16,17,18,19,20,23,24');
}

// ---- [2] verified assignment — the transcription lock ----------------------------
{
    // N=None L=Low M=Medium H=High, read across SAIL I,II,III,IV,V,VI. Pinned to
    // the Annex E integrity/assurance column headers (verified 22 Jul 2026).
    const EXPECT = {
        'OSO#01': 'NLMHHH', 'OSO#02': 'NNLMHH', 'OSO#03': 'LLMMHH', 'OSO#04': 'NNNLMH',
        'OSO#05': 'NNLMHH', 'OSO#06': 'NLLMHH', 'OSO#07': 'LLMMHH', 'OSO#08': 'LMHHHH',
        'OSO#09': 'LLMMHH', 'OSO#13': 'LLMHHH', 'OSO#16': 'LLMMHH', 'OSO#17': 'LLMMHH',
        'OSO#18': 'NNLMHH', 'OSO#19': 'NNLMMH', 'OSO#20': 'NLLMMH', 'OSO#23': 'LLMMHH',
        'OSO#24': 'NNMHHH'
    };
    const lvl = (o, n) => o.high.indexOf(n) !== -1 ? 'H' : o.medium.indexOf(n) !== -1 ? 'M' : o.low.indexOf(n) !== -1 ? 'L' : 'N';
    let allOk = true, firstBad = '';
    DATA.OSOS.forEach(o => {
        const seq = [1, 2, 3, 4, 5, 6].map(n => lvl(o, n)).join('');
        if (seq !== EXPECT[o.id]) { allOk = false; if (!firstBad) firstBad = o.id + ' got ' + seq + ' want ' + EXPECT[o.id]; }
    });
    check('every OSO ladder matches the verified Annex E headers cell-for-cell', allOk, firstBad);
}

// ---- [3] engine ------------------------------------------------------------------
{
    const list = SORA.osoList();
    check('osoList() enumerates all 17 (OSO#04 present — v0.1 gap closed)',
        list.enumerated === 17 && list.complete === true && list.osos.some(o => o.id === 'OSO#04'));
    const counts = [1, 2, 3, 4, 5, 6].map(s => SORA.osoRobustness(s).requiredCount);
    check('required-count per SAIL is 8/11/16/17/17/17', counts.join(',') === '8,11,16,17,17,17', counts.join(','));
    const s3 = SORA.osoRobustness('III');
    check('osoRobustness accepts Roman + int + "SAIL x" forms',
        SORA.osoRobustness(3).sailNum === 3 && SORA.osoRobustness('iii').sailNum === 3 && SORA.osoRobustness('SAIL III').sailNum === 3);
    check('each objective carries robustness + Annex E page citation, never criteria prose',
        s3.objectives.every(o => ['None', 'Low', 'Medium', 'High'].indexOf(o.robustness) !== -1 &&
            /Annex E.*p\.\d+/.test(o.cite) && !/integrity is achieved|safety gain|method of proof/i.test(o.criteriaNote)));
    check('SAIL III spot cells: OSO#05 Low, OSO#08 High, OSO#24 Medium',
        s3.objectives.find(o => o.id === 'OSO#05').robustness === 'Low' &&
        s3.objectives.find(o => o.id === 'OSO#08').robustness === 'High' &&
        s3.objectives.find(o => o.id === 'OSO#24').robustness === 'Medium');
    const s1 = SORA.osoRobustness(1);
    check('SAIL I: OSO#01 None, OSO#24 None+lowUnavailable, and None cells name Main Body Table 14',
        s1.objectives.find(o => o.id === 'OSO#01').robustness === 'None' &&
        s1.objectives.find(o => o.id === 'OSO#24').lowUnavailable === true &&
        /Table 14/.test(s1.objectives.find(o => o.id === 'OSO#01').criteriaNote));
    check('bad SAIL refused', throws(() => SORA.osoRobustness('VII'), /SAIL required/) && throws(() => SORA.osoRobustness(0), /SAIL required/));
}

// ---- [3b] osoRequirements — the SORA auto-req generator ---------------------------
{
    const g = SORA.osoRequirements('III');
    check('osoRequirements emits one shall-statement per required OSO (16 at SAIL III)',
        g.count === 16 && g.requirements.length === 16);
    check('every SORA req: stable id, OSO ref, robustness, integrity+assurance verification, Annex E cite, no DAL/probability',
        g.requirements.every(r => /^SORA-OSO\d\d$/.test(r.id) && /^OSO#\d\d$/.test(r.osoId) &&
            ['Low', 'Medium', 'High'].indexOf(r.robustness) !== -1 &&
            /integrity/i.test(r.verification) && /assurance/i.test(r.verification) &&
            /Annex E.*p\.\d+/.test(r.cite) && r.lane === 'sora' &&
            !/DAL|per-flight-hour|1e-|probability target/i.test(r.text)));
    check('generator note states requirements are robustness objectives, not DAL/probability',
        /not DAL allocations or per-flight-hour probability/i.test(g.note));
    check('ids are idempotent across SAIL (SORA-OSO08 stable at SAIL I..VI)',
        [1, 2, 3, 4, 5, 6].every(s => (SORA.osoRequirements(s).requirements.find(r => r.osoId === 'OSO#08') || {}).id === 'SORA-OSO08'));
    check('SAIL VI emits 17 requirements, all High', (function () {
        const v = SORA.osoRequirements(6); return v.count === 17 && v.requirements.every(r => r.robustness === 'High');
    })());
}

// ---- [4] refusal when data absent ------------------------------------------------
{
    const saved = global.window.SORA_ANNEX_E;
    global.window.SORA_ANNEX_E = null;
    delete require.cache[require.resolve('../site/sora_core.js')];
    const SORA2 = require('../site/sora_core.js');
    check('no data module ⇒ osoRobustness + osoList refuse (no invented matrix)',
        throws(() => SORA2.osoRobustness('III'), /not loaded|refusing to invent/) &&
        throws(() => SORA2.osoList(), /not loaded|refusing to invent/));
    global.window.SORA_ANNEX_E = saved;
}

// ---- [5] doctrine ----------------------------------------------------------------
{
    check('data module stores the assignment + page only — no criteria paragraph prose',
        /licensed:\s*true/.test(dsrc) && /never stored|not reproduce/i.test(dsrc) &&
        !/The applicant (is|has|holds)/.test(dsrc));   // a tell-tale Annex E criteria sentence must NOT appear
    const codeLines = dsrc.split('\n').filter(l => !/^\s*\/\//.test(l));
    check('no RNG/Date/eval in the data module',
        codeLines.every(l => l.indexOf('Math.random') === -1 && !/\bnew Date\b|\bDate\.now\b/.test(l)) &&
        dsrc.indexOf('(0, eval)') === -1 && dsrc.indexOf('new Function') === -1);
    const core = S('sora_core.js');
    check('engine points to Annex E for criteria, never inlines it',
        /copyrighted and not reproduced/.test(core) && /Read the .* criteria in/.test(core));
}

// ---- [6] AI spine (sora_kb_data.js) ----------------------------------------------
{
    const KB = require('../site/sora_kb_data.js');
    check('SL_SORA_KB chunks carry {id, source, topic, text}',
        Array.isArray(KB.chunks) && KB.chunks.length >= 6 &&
        KB.chunks.every(c => c.id && c.source && c.topic && c.text));
    const ksrc = S('sora_kb_data.js');
    check('spine states the copyright discipline + no criteria prose',
        /COPYRIGHTED/.test(ksrc) && /never (stored|paste)/i.test(ksrc));
    // the per-OSO ladder chunk must agree with the engine, letter for letter
    const ladder = KB.chunks.find(c => /OSO#01 N,L,M,H,H,H/.test(c.text));
    check('spine per-OSO ladder text exists and matches the engine (no drift)', !!ladder &&
        (function () {
            const lvl = (o, n) => o.high.indexOf(n) !== -1 ? 'H' : o.medium.indexOf(n) !== -1 ? 'M' : o.low.indexOf(n) !== -1 ? 'L' : 'N';
            return DATA.OSOS.every(o => {
                const seq = [1, 2, 3, 4, 5, 6].map(n => lvl(o, n)).join(',');
                return ladder.text.indexOf(o.id + ' ' + seq) !== -1;
            });
        })());
    check('the assistant retriever merges SL_SORA_KB into the corpus',
        /window\.SL_SORA_KB && Array\.isArray\(window\.SL_SORA_KB\.chunks\)/.test(S('ai_assistant.js')) &&
        /sora:\['specific','operations','risk','assessment'\]/.test(S('ai_assistant.js')));

    // ---- [7] AI spine v2 — AEC/containment/confidence-tier chunks, no drift ----
    check('sora-09..12 present (wizard, AEC decision tree, containment, confidence tiers)',
        ['sora-09', 'sora-10', 'sora-11', 'sora-12'].every(id => KB.chunks.some(c => c.id === id)));
    check('sora_kb_data.js version bumped to 2 (Annex C/B joined the corpus)',
        /version: 2/.test(ksrc));

    // AEC->ARC ladder: rebuild "AECn → ARC-x" from the ENGINE's own AEC_TABLE
    // (not hand-copied) and pin every entry into the KB chunk text.
    const arcChunk = KB.chunks.find(c => c.id === 'sora-10');
    check('AEC->ARC ladder in the KB matches sora_core.js AEC_TABLE cell-for-cell (no drift)',
        !!arcChunk && SORA.AEC_TABLE.every(row => arcChunk.text.indexOf('AEC' + row.aec + ' → ARC-' + row.arc) !== -1),
        JSON.stringify(SORA.AEC_TABLE.filter(row => !arcChunk || arcChunk.text.indexOf('AEC' + row.aec + ' → ARC-' + row.arc) === -1)));
    check('sora-10 states SINGLE-SOURCED confidence (never claims two-source for the AEC table)',
        /SINGLE-SOURCED/.test(arcChunk.text) && !/TWO-SOURCE VERIFIED/.test(arcChunk.text));

    // Containment Table 8 grid: pin the exact bySail values from the engine.
    const contChunk = KB.chunks.find(c => c.id === 'sora-11');
    check('containment Table 8 grid in the KB matches sora_core.js CONTAINMENT_TABLE_8 (no drift)',
        !!contChunk && (function () {
            const t = SORA.CONTAINMENT_TABLE_8;
            const row1 = t.bySail[1], row3 = t.bySail[3], row4 = t.bySail[4];
            return contChunk.text.indexOf(row1.gt400k + ' / ' + row1['40kto400k'] + ' / ' + row1.lt40k) !== -1 &&
                   contChunk.text.indexOf(row3.gt400k + ' / ' + row3['40kto400k'] + ' / ' + row3.lt40k) !== -1 &&
                   contChunk.text.indexOf(row4.gt400k + ' / ' + row4['40kto400k'] + ' / ' + row4.lt40k) !== -1;
        })());
    check('sora-11 states TWO-SOURCE VERIFIED confidence and flags Tables 9-13 as unsourced',
        /TWO-SOURCE VERIFIED/.test(contChunk.text) && /9-13/.test(contChunk.text) && /NOT sourced/.test(contChunk.text));

    // Confidence-tier chunk exists and names all three tiers this codebase uses.
    const confChunk = KB.chunks.find(c => c.id === 'sora-12');
    check('sora-12 names all three confidence tiers (two-source / single-source / declared)',
        !!confChunk && /two-source verified/.test(confChunk.text) && /single-source/.test(confChunk.text) && /declared/.test(confChunk.text));

    check('"aec" synonym registered so AEC queries reach the new chunks',
        /aec:\['airspace','encounter','category'\]/.test(S('ai_assistant.js')));
}

// ---- wiring ----------------------------------------------------------------------
{
    const idx = S('index.html');
    check('index loads the data module BEFORE the engine, engine bumped to v0.2',
        idx.indexOf('sora_annex_e_data.js') < idx.indexOf('sora_core.js') && /sora_core\.js\?v=0\.2/.test(idx));
    check('ai_loader FILES lists sora_kb_data before ai_assistant', (function () {
        const m = S('ai_loader.js').match(/const FILES = \[([^\]]*)\]/);
        if (!m) return false;
        const arr = m[1];
        return arr.indexOf('sora_kb_data.js') !== -1 && arr.indexOf('sora_kb_data.js') < arr.indexOf('ai_assistant.js') &&
            arr.indexOf('fta_kb_data.js') < arr.indexOf('sora_kb_data.js');
    })());
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

/*
 * tests/regression_scvtol_basis.test.js — EASA SC-VTOL cert basis: the seat-band split.
 *
 * 31 Aug 2026. Fetched MOC SC-VTOL Issue 2 (12 May 2021), MOC VTOL.2510 §8(a) Table 1
 * "Safety Objectives" straight from EASA and compared it to the engine. Two defects:
 *
 *   1) The single 'SC-VTOL Basic' row carried Major 1e-4 (Table 1: ≤1e-5 for EVERY
 *      Basic band) and applied Basic-1 numbers (Cat 1e-7, FDAL C) to every Basic
 *      aircraft — a 4-seat Basic eVTOL is Basic 2 (Cat ≤1e-8, FDAL B), a 9-seat one is
 *      Basic 3 (Cat ≤1e-9, FDAL A). Non-conservative by one to two orders.
 *   2) The new-project wizard wrote regulation 'sc-vtol' while getSafetyTarget() keyed
 *      on 'SC-VTOL'; the miss fell through to PROB_TARGETS['Part 25'] SILENTLY, so a
 *      wizard-built Basic project was scored against Part 25 with a Part 25 DAL.
 *
 * Fix (Waqas's ruling, "Split Basic into 1/2/3"): PROB/DAL rows 'SC-VTOL Basic 1/2/3'
 * with the official numbers; legacy 'SC-VTOL Basic' kept as an alias of Basic 1 (Major
 * corrected) that the AC 1309 tab flags; canonRegulation() folds the dialects.
 *
 * Executes the REAL extracted code (safety_targets.js tables; canonRegulation /
 * scvtolTargetKey / scvtolIsLegacyBasic / getSafetyTarget sliced from support_modules.js).
 * Run: node tests/regression_scvtol_basis.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- real tables ----------------------------------------------------------------
const tsrc = read('safety_targets.js');
const [PROB_TARGETS, DAL_TARGETS] = new Function(tsrc + ';return [PROB_TARGETS, DAL_TARGETS];')();

// ---- real functions, sliced from support_modules.js ----------------------------------
const ssrc = read('support_modules.js');
function slice(src, startRe, endMarker) {
    const i = src.search(startRe); if (i < 0) throw new Error('slice start not found: ' + startRe);
    const j = src.indexOf(endMarker, i); if (j < 0) throw new Error('slice end not found: ' + endMarker);
    return src.slice(i, j);
}
const fnSrc = slice(ssrc, /function canonRegulation\(reg\)/, '// ----- Phase-exposure helpers');
const projectConfig = { regulation: 'Part 25', part23Class: 'IV', scvtolCategory: 'Enhanced', customCertBasis: null };
const api = new Function('PROB_TARGETS', 'DAL_TARGETS', 'projectConfig',
    fnSrc + ';return { canonRegulation, scvtolTargetKey, scvtolIsLegacyBasic, getSafetyTarget };')(PROB_TARGETS, DAL_TARGETS, projectConfig);

console.log('[1] MOC SC-VTOL Issue 2 Table 1 — every cell, engine vs EASA');
// Official Table 1 (per flight hour; FDAL). Source: MOC SC-VTOL Issue 2, 12 May 2021,
// MOC VTOL.2510 Section 8(a), fetched 31 Aug 2026.
const T1 = {
    'SC-VTOL Enhanced': { Minor: [1e-3, 'D'], Major: [1e-5, 'C'], Hazardous: [1e-7, 'B'], Catastrophic: [1e-9, 'A'] },
    'SC-VTOL Basic 3':  { Minor: [1e-3, 'D'], Major: [1e-5, 'C'], Hazardous: [1e-7, 'B'], Catastrophic: [1e-9, 'A'] },
    'SC-VTOL Basic 2':  { Minor: [1e-3, 'D'], Major: [1e-5, 'C'], Hazardous: [1e-7, 'C'], Catastrophic: [1e-8, 'B'] },
    'SC-VTOL Basic 1':  { Minor: [1e-3, 'D'], Major: [1e-5, 'C'], Hazardous: [1e-6, 'C'], Catastrophic: [1e-7, 'C'] }
};
Object.keys(T1).forEach(k => Object.keys(T1[k]).forEach(sev => {
    const [p, d] = T1[k][sev];
    check(k + ' ' + sev + ' prob ' + p, PROB_TARGETS[k] && PROB_TARGETS[k][sev] === p, 'engine ' + (PROB_TARGETS[k] || {})[sev]);
    check(k + ' ' + sev + ' FDAL ' + d, DAL_TARGETS[k] && DAL_TARGETS[k][sev] === d, 'engine ' + (DAL_TARGETS[k] || {})[sev]);
}));
check('legacy alias row equals Basic 1 exactly (prob + DAL)',
    JSON.stringify(PROB_TARGETS['SC-VTOL Basic']) === JSON.stringify(PROB_TARGETS['SC-VTOL Basic 1']) &&
    JSON.stringify(DAL_TARGETS['SC-VTOL Basic']) === JSON.stringify(DAL_TARGETS['SC-VTOL Basic 1']));
check('the old Major 1e-4 is gone from every SC-VTOL row',
    Object.keys(PROB_TARGETS).filter(k => /SC-VTOL/.test(k)).every(k => PROB_TARGETS[k].Major === 1e-5));
check('Basic 3 equals Enhanced cell-for-cell (Table 1 shape)',
    JSON.stringify(PROB_TARGETS['SC-VTOL Basic 3']) === JSON.stringify(PROB_TARGETS['SC-VTOL Enhanced']) &&
    JSON.stringify(DAL_TARGETS['SC-VTOL Basic 3']) === JSON.stringify(DAL_TARGETS['SC-VTOL Enhanced']));

console.log('[2] canonRegulation folds both dialects');
check("'sc-vtol' → 'SC-VTOL'", api.canonRegulation('sc-vtol') === 'SC-VTOL');
check("'SC-VTOL' → 'SC-VTOL'", api.canonRegulation('SC-VTOL') === 'SC-VTOL');
check("'part-23' → 'Part 23' (showcase dialect)", api.canonRegulation('part-23') === 'Part 23');
check("'Part 25' unchanged", api.canonRegulation('Part 25') === 'Part 25');
check("unknown passes through unchanged", api.canonRegulation('Custom') === 'Custom' && api.canonRegulation('specific-sora') === 'specific-sora');

console.log('[3] scvtolTargetKey / legacy detection');
check("'Basic 2' → 'SC-VTOL Basic 2'", api.scvtolTargetKey('Basic 2') === 'SC-VTOL Basic 2');
check("'basic 3' (case) → 'SC-VTOL Basic 3'", api.scvtolTargetKey('basic 3') === 'SC-VTOL Basic 3');
check("'Enhanced' → 'SC-VTOL Enhanced'", api.scvtolTargetKey('Enhanced') === 'SC-VTOL Enhanced');
check("undefined → Enhanced (the picker default)", api.scvtolTargetKey(undefined) === 'SC-VTOL Enhanced');
check("legacy 'Basic' → alias row", api.scvtolTargetKey('Basic') === 'SC-VTOL Basic');
check("legacy detector: 'Basic' yes, 'Basic 1' no, 'Enhanced' no",
    api.scvtolIsLegacyBasic('Basic') && !api.scvtolIsLegacyBasic('Basic 1') && !api.scvtolIsLegacyBasic('Enhanced'));

console.log('[4] getSafetyTarget end-to-end on the real function');
function tgt(reg, cat, sev) { projectConfig.regulation = reg; projectConfig.scvtolCategory = cat; return api.getSafetyTarget(sev); }
let t = tgt('sc-vtol', 'Basic 2', 'Catastrophic');
check("wizard dialect 'sc-vtol' + Basic 2 → Cat 1e-8 / B (was Part 25 1e-9 / A by fall-through)", t.prob === 1e-8 && t.dal === 'B' && t.scope === 'SC-VTOL Basic 2', JSON.stringify(t));
t = tgt('SC-VTOL', 'Basic 1', 'Major');
check('Basic 1 Major 1e-5 / C (was 1e-4)', t.prob === 1e-5 && t.dal === 'C', JSON.stringify(t));
t = tgt('SC-VTOL', 'Basic 3', 'Catastrophic');
check('Basic 3 Cat 1e-9 / A', t.prob === 1e-9 && t.dal === 'A', JSON.stringify(t));
t = tgt('SC-VTOL', 'Basic', 'Hazardous');
check('legacy Basic project → alias row Haz 1e-6 / C, scope names the alias', t.prob === 1e-6 && t.dal === 'C' && t.scope === 'SC-VTOL Basic', JSON.stringify(t));
t = tgt('SC-VTOL', 'Enhanced', 'Hazardous');
check('Enhanced Haz 1e-7 / B', t.prob === 1e-7 && t.dal === 'B', JSON.stringify(t));
t = tgt('part-23', undefined, 'Catastrophic'); projectConfig.part23Class = 'III';
t = tgt('part-23', undefined, 'Catastrophic');
check("showcase dialect 'part-23' Class III → 1e-8 / B (was Part 25 by fall-through)", t.prob === 1e-8 && t.dal === 'B', JSON.stringify(t));

console.log('[5] the UI writes the new values and never the bare legacy one');
const html = read('index.html');
const sel = html.slice(html.indexOf('id="proj-scvtol-category"'), html.indexOf('</select>', html.indexOf('id="proj-scvtol-category"')));
check('AC 1309 picker offers Basic 1 / Basic 2 / Basic 3 / Enhanced', /value="Basic 1"/.test(sel) && /value="Basic 2"/.test(sel) && /value="Basic 3"/.test(sel) && /value="Enhanced"/.test(sel));
check('legacy option exists only hidden+disabled (loads old projects, never user-selectable)', /<option value="Basic" hidden disabled>/.test(sel));
check('picker labels carry the seat bands 0–1 / 2–6 / 7–9', /0–1 passengers/.test(sel) && /2–6 passengers/.test(sel) && /7–9 passengers/.test(sel));
const misc = read('misc_fn_modules.js');
check('new-project wizard offers the three Basic bands', /value="Basic 1"/.test(misc) && /value="Basic 2"/.test(misc) && /value="Basic 3"/.test(misc) && !/<option value="Basic">/.test(misc));
check("wizard stores canonical 'SC-VTOL' (not 'sc-vtol') as the regulation",
    /projectConfig\.regulation = \(basis === 'sc-vtol'\) \? 'SC-VTOL' : basis;/.test(misc));
check('renderProjectConfigUI canonicalises the stored dialect before painting',
    /const reg = canonRegulation\(projectConfig\.regulation\);/.test(ssrc) && /regSel\.value = reg;/.test(ssrc));
check('legacy-Basic banner names the three bands and the row in use',
    /SC-VTOL Category Basic needs a seat band/.test(ssrc) && /Basic 1 \(0–1 passengers\), Basic 2 \(2–6\) and Basic 3 \(7–9\)/.test(ssrc) && /scvtolIsLegacyBasic\(projectConfig\.scvtolCategory\)/.test(ssrc));

console.log('[6] the spine and catalogue stopped citing paragraphs that do not exist');
const spine = read('cert_basis_spine.js');
const cat = read('catalogue_data.js');
check('no "SC-VTOL.2511 / .2521 / .2526" refs anywhere in site/', !/SC-VTOL\.25(11|21|26)/.test(spine) && !/SC-VTOL\.25(11|21|26)/.test(cat) && !/SC-VTOL\.2(010|300|305)/.test(cat));
check('scvtol-2510 card is titled after the real VTOL.2510 (equipment, systems, installations), not CS&FL',
    /id: 'scvtol-2510'[^\n]*ref: 'VTOL\.2510', title: 'Equipment, systems, and installations'/.test(spine));
check('card ids scvtol-2510/2511/2521/2526 preserved for stored references',
    ['scvtol-2510', 'scvtol-2511', 'scvtol-2521', 'scvtol-2526'].every(id => spine.indexOf("id: '" + id + "'") >= 0));
check('CERT_BASES lists Basic 1/2/3 + legacy alias + Enhanced; TARGET_CITE cites MOC VTOL.2510 §8 Table 1 for each',
    ['SC-VTOL Basic 1', 'SC-VTOL Basic 2', 'SC-VTOL Basic 3', 'SC-VTOL Basic', 'SC-VTOL Enhanced'].every(k =>
        spine.indexOf("'" + k + "'") >= 0 && new RegExp("'" + k.replace(/[-]/g, '\\-') + "': 'EASA VTOL\\.2510 · MOC VTOL\\.2510 §8 Table 1").test(spine)));
check('catalogue carries the real SC paragraphs (VTOL.2005 categories, VTOL.2510, VTOL.2517 EWIS) and the MOC Table 1 row',
    /paragraph: 'VTOL\.2005'/.test(cat) && /paragraph: 'VTOL\.2510'/.test(cat) && /paragraph: 'VTOL\.2517'/.test(cat) && /MOC VTOL\.2510 §8 Table 1/.test(cat));
check('safety_targets.js records the retraction of the 1e-4 Major and the seat-band source',
    /31 Aug 2026 RETRACTION/.test(tsrc) && /MOC VTOL\.2510 §8\(a\) Table 1/.test(tsrc));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

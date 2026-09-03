/*
 * tests/regression_part27_basis.test.js — Part 27 normal-rotorcraft cert basis: the
 * PS-ASW-27-15 class split, and Part 29 verified against AC 29-2C.
 *
 * 31 Aug 2026. Fetched AC 29-2C (Chg 1–7) and AC 27-1B (Chg 1–8) from faa.gov:
 *   · AC 29-2C Figure AC 29.1309-2: Minor ≤1e-3/D, Major ≤1e-5/C, Hazardous ≤1e-7/B,
 *     Catastrophic ≤1e-9/A — the engine's Part 29 row matched.
 *   · AC 27-1B tabulates NO per-severity objective; the numbers are FAA policy
 *     PS-ASW-27-15 (four classes). The engine's single 'Part 27' row (Cat 1e-7,
 *     Haz 1e-6, Maj 1e-4; DAL B/C/C/D) matched NO class of the continuum.
 * Waqas's ruling: split Part 27 into Classes I–IV with the 2017 DRAFT continuum grid,
 * flagged unverified until the final policy PDF is obtained; the legacy 'Part 27' row
 * aliases to Class III (never looser than the old row in any cell).
 *
 * Executes the REAL code (safety_targets tables; canonRegulation / part27TargetKey /
 * part27IsLegacy / certBasisKeyFor / getSafetyTarget sliced from support_modules.js).
 * Run: node tests/regression_part27_basis.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }

const tsrc = read('safety_targets.js');
const [PROB_TARGETS, DAL_TARGETS] = new Function(tsrc + ';return [PROB_TARGETS, DAL_TARGETS];')();
const ssrc = read('support_modules.js');
function slice(src, startRe, endMarker) { const i = src.search(startRe); if (i < 0) throw new Error('start ' + startRe); const j = src.indexOf(endMarker, i); if (j < 0) throw new Error('end ' + endMarker); return src.slice(i, j); }
const fnSrc = slice(ssrc, /function canonRegulation\(reg\)/, '// ----- Phase-exposure helpers');
const projectConfig = { regulation: 'Part 25', part23Class: 'IV', scvtolCategory: 'Enhanced', customCertBasis: null };
const api = new Function('PROB_TARGETS', 'DAL_TARGETS', 'projectConfig', fnSrc + ';return { canonRegulation, part27TargetKey, part27IsLegacy, certBasisKeyFor, scvtolTargetKey, getSafetyTarget };')(PROB_TARGETS, DAL_TARGETS, projectConfig);

console.log('[1] AC 29-2C Figure AC 29.1309-2 — engine Part 29 row, all 8 cells');
const P29 = { Minor: [1e-3, 'D'], Major: [1e-5, 'C'], Hazardous: [1e-7, 'B'], Catastrophic: [1e-9, 'A'] };
Object.keys(P29).forEach(sev => check('Part 29 ' + sev + ' = ' + P29[sev].join('/'), PROB_TARGETS['Part 29'][sev] === P29[sev][0] && DAL_TARGETS['Part 29'][sev] === P29[sev][1]));

console.log('[2] PS-ASW-27-15 continuum (2017 DRAFT grid) — Part 27 Classes I–IV, all 32 cells');
const G = {
    'Part 27 I':   { Minor: [1e-3, 'D'], Major: [1e-4, 'C'], Hazardous: [1e-5, 'C'], Catastrophic: [1e-6, 'C'] },
    'Part 27 II':  { Minor: [1e-3, 'D'], Major: [1e-5, 'C'], Hazardous: [1e-6, 'C'], Catastrophic: [1e-7, 'C'] },
    'Part 27 III': { Minor: [1e-3, 'D'], Major: [1e-5, 'C'], Hazardous: [1e-7, 'C'], Catastrophic: [1e-8, 'B'] },
    'Part 27 IV':  { Minor: [1e-3, 'D'], Major: [1e-5, 'C'], Hazardous: [1e-7, 'B'], Catastrophic: [1e-9, 'A'] }
};
Object.keys(G).forEach(k => Object.keys(G[k]).forEach(sev => check(k + ' ' + sev + ' = ' + G[k][sev].join('/'), PROB_TARGETS[k] && PROB_TARGETS[k][sev] === G[k][sev][0] && DAL_TARGETS[k] && DAL_TARGETS[k][sev] === G[k][sev][1], 'engine ' + JSON.stringify([PROB_TARGETS[k] && PROB_TARGETS[k][sev], DAL_TARGETS[k] && DAL_TARGETS[k][sev]]))));
check('the Part 27 grid equals the AC 23.1309-1E Class I–IV grid cell for cell (the continuum reuses it)',
    ['I', 'II', 'III', 'IV'].every(c => JSON.stringify(PROB_TARGETS['Part 27 ' + c]) === JSON.stringify(PROB_TARGETS['Part 23 ' + c]) && JSON.stringify(DAL_TARGETS['Part 27 ' + c]) === JSON.stringify(DAL_TARGETS['Part 23 ' + c])));
check('legacy Part 27 alias == Class III exactly', JSON.stringify(PROB_TARGETS['Part 27']) === JSON.stringify(PROB_TARGETS['Part 27 III']) && JSON.stringify(DAL_TARGETS['Part 27']) === JSON.stringify(DAL_TARGETS['Part 27 III']));
// the old row: Cat 1e-7, Haz 1e-6, Maj 1e-4, Min 1e-3; DAL B/C/C/D — the alias must never be looser
const OLD = { p: { Catastrophic: 1e-7, Hazardous: 1e-6, Major: 1e-4, Minor: 1e-3 }, d: { Catastrophic: 'B', Hazardous: 'C', Major: 'C', Minor: 'D' } };
const RANK = { A: 5, B: 4, C: 3, D: 2, E: 1 };
check('legacy alias is stricter-or-equal to the retracted row in EVERY cell (no stored project relaxed)',
    Object.keys(OLD.p).every(s => PROB_TARGETS['Part 27'][s] <= OLD.p[s] && RANK[DAL_TARGETS['Part 27'][s]] >= RANK[OLD.d[s]]));
check('safety_targets.js states the draft caveat, the EASA numbers-verified note, and the retraction', /UNVERIFIED-DRAFT CAVEAT/.test(tsrc) && /NUMBERS VERIFIED \(1 Sep 2026\): EASA AMC1 27\.1309 Table 2/.test(tsrc) && /RETRACTION: the previous single 'Part 27' row/.test(tsrc));

console.log('[3] key resolution — real sliced functions');
check("part27TargetKey('II') → 'Part 27 II'; 'iv' → 'Part 27 IV'; '' → legacy alias", api.part27TargetKey('II') === 'Part 27 II' && api.part27TargetKey('iv') === 'Part 27 IV' && api.part27TargetKey('') === 'Part 27' && api.part27TargetKey(undefined) === 'Part 27');
check('part27IsLegacy: undefined/empty yes, "III" no', api.part27IsLegacy(undefined) && api.part27IsLegacy('') && !api.part27IsLegacy('III'));
check("certBasisKeyFor — THE resolver: Part 27 class, Part 23 class, SC-VTOL band, dialects",
    api.certBasisKeyFor({ regulation: 'Part 27', part27Class: 'I' }) === 'Part 27 I' &&
    api.certBasisKeyFor({ regulation: 'part-27' }) === 'Part 27' &&
    api.certBasisKeyFor({ regulation: 'Part 23', part23Class: 'II' }) === 'Part 23 II' &&
    api.certBasisKeyFor({ regulation: 'sc-vtol', scvtolCategory: 'Basic 3' }) === 'SC-VTOL Basic 3' &&
    api.certBasisKeyFor({ regulation: 'Part 25' }) === 'Part 25' && api.certBasisKeyFor({}) === 'Part 25');
function tgt(reg, cls, sev) { projectConfig.regulation = reg; projectConfig.part27Class = cls; return api.getSafetyTarget(sev); }
let t = tgt('Part 27', 'I', 'Catastrophic');
check('getSafetyTarget Part 27 Class I Cat → 1e-6 / C', t.prob === 1e-6 && t.dal === 'C' && t.scope === 'Part 27 I', JSON.stringify(t));
t = tgt('Part 27', 'IV', 'Hazardous');
check('Part 27 Class IV Haz → 1e-7 / B', t.prob === 1e-7 && t.dal === 'B', JSON.stringify(t));
t = tgt('Part 27', undefined, 'Catastrophic');
check('legacy Part 27 (no class) → alias row 1e-8 / B, scope names the alias', t.prob === 1e-8 && t.dal === 'B' && t.scope === 'Part 27', JSON.stringify(t));
t = tgt('part-27', 'II', 'Major');
check("dialect 'part-27' Class II Major → 1e-5 / C", t.prob === 1e-5 && t.dal === 'C', JSON.stringify(t));
projectConfig.regulation = 'Part 25'; delete projectConfig.part27Class;

console.log('[4] the surfaces');
const html = read('index.html');
const sel = html.slice(html.indexOf('id="proj-part27-class"'), html.indexOf('</select>', html.indexOf('id="proj-part27-class"')));
check('AC 1309 tab has the Part 27 class picker with I–IV and a hidden legacy placeholder', /value="I"/.test(sel) && /value="II"/.test(sel) && /value="III"/.test(sel) && /value="IV"/.test(sel) && /<option value="" hidden disabled>/.test(sel));
check('picker labels carry FAA + EASA thresholds (5 occupants, 4,000 lb, 4,001–7,000 lb, twin turbine, EASA Cat A/B, 1,814 kg)', /5 occupants/.test(sel) && /4,000 lb/.test(sel) && /4,001&ndash;7,000 lb/.test(sel) && /twin turbine/i.test(sel) && /Category A \(AMC 29\.1309 applies\)/.test(sel) && /1,814 kg/.test(sel));
check('renderProjectConfigUI shows the container for Part 27 and paints the class', /p27Container\.style\.display = reg === 'Part 27'/.test(ssrc) && /p27Sel\.value = part27IsLegacy\(projectConfig\.part27Class\) \? '' : projectConfig\.part27Class/.test(ssrc));
check('legacy banner names the four classes, the Class III row in use, the EASA verification and the FAA-threshold caveat', /Part 27 needs a class/.test(ssrc) && /using the Class III row/.test(ssrc) && /verified against EASA AMC1 27\.1309 Table 2/.test(ssrc) && /2017 draft of PS-ASW-27-15/.test(ssrc));
const helpers = read('helpers_modules.js');
check('onProjectConfigChange captures part27Class (only when a class is chosen)', /if \(p27Sel && p27Sel\.value\) projectConfig\.part27Class = p27Sel\.value;/.test(helpers));
const misc = read('misc_fn_modules.js');
check('new-project wizard offers Part 27 Class I–IV and stores part27Class', /id="npw-p27"/.test(misc) && /if \(basis === 'Part 27'\) projectConfig\.part27Class = p27;/.test(misc));
const ai = read('ai_assistant.js'), skills = read('ai_skills.js');
check('ai_assistant._certBasisKey and ai_skills.basisFrom both defer to certBasisKeyFor (one resolver)', /return certBasisKeyFor\(c\);/.test(ai) && /return certBasisKeyFor\(c\);/.test(skills));
const spine = read('cert_basis_spine.js');
check('spine CERT_BASES + TARGET_CITE carry Part 27 I–IV + legacy, citing AC 27-1B and PS-ASW-27-15 with the draft flag',
    ['Part 27 I', 'Part 27 II', 'Part 27 III', 'Part 27 IV'].every(k => spine.indexOf("'" + k + "'") >= 0 && new RegExp("'" + k + "': 'AC 27-1B §27\\.1309 · PS-ASW-27-15 Class (I|II|III|IV) \\(FAA thresholds: 2017 draft\\) · EASA AMC1 27\\.1309 Table 2 Class (I|II|III|IV) \\(verified\\)").test(spine)) && /'Part 29': 'AC 29-2C §29\.1309 Figure AC 29\.1309-2/.test(spine));
const cat = read('catalogue_data.js');
check('catalogue carries AC 29-2C / AC 27-1B §__.1309 rows and the PS-ASW-27-15 row', /regulation: 'AC 29-2C'/.test(cat) && /regulation: 'AC 27-1B'/.test(cat) && /FAA PS-ASW-27-15/.test(cat));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

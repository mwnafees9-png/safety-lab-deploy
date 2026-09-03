/*
 * tests/regression_severity_rubrics.test.js — the cert-basis severity rubric ANEM
 * classifies against.
 *
 * Waqas, 31 Aug 2026: "the AI assistant needs all these standards too, it will help
 * it with severity determinations." Before this, _assembleAnalysisContext carried
 * the basis NAME and the numeric TARGETS but never the authority's definitions of
 * Minor/Major/Hazardous/Catastrophic — so the FHA pass classified from background
 * knowledge (which is Part 25) whatever the basis. Now severity_rubrics.js supplies
 * the definitions per basis family and the assembler injects them for every
 * severity-assigning feature.
 *
 * Executes the REAL code: severity_rubrics.js as a module; _certBasisKey +
 * _severityRubricBlock + _assembleAnalysisContext sliced from ai_assistant.js and
 * run in a vm sandbox with the real rubric module and the real PROB_TARGETS.
 * Run: node tests/regression_severity_rubrics.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const RUB = require(path.join(SITE, 'severity_rubrics.js'));
const KB = require(path.join(SITE, 'cert_std_kb_data.js'));
const ALL = KB.chunks.map(c => c.text).join('\n');
const ai = R('ai_assistant.js');
const tsrc = R('safety_targets.js');
const [PROB_TARGETS, SEVERITY_RANK] = new Function(tsrc + ';return [PROB_TARGETS, SEVERITY_RANK];')();

console.log('[1] every cert basis the engine knows resolves to a rubric (or an honest blank for Custom)');
Object.keys(PROB_TARGETS).forEach(k => {
    const t = RUB.rubricFor(k);
    check('rubricFor(' + k + ') is non-empty and names the basis', t.length > 400 && t.indexOf('SEVERITY CLASSIFICATION RUBRIC — ' + k) === 0, 'len ' + t.length);
});
check('Custom / unknown → empty string (never an invented rubric)', RUB.rubricFor('Custom') === '' && RUB.rubricFor('') === '' && RUB.rubricFor(undefined) === '');
check('legacy SC-VTOL Basic alias and the wizard label both resolve to the SC-VTOL rubric',
    /MOC VTOL\.2510 Section 7\(a\)/.test(RUB.rubricFor('SC-VTOL Basic')) && /MOC VTOL\.2510 Section 7\(a\)/.test(RUB.rubricFor('SC-VTOL Basic 2')));

console.log('[2] each rubric names exactly the classes the engine ranks, and the right authority');
const CLASSES = ['Minor', 'Major', 'Hazardous', 'Catastrophic'];
['Part 25', 'Part 23 III', 'SC-VTOL Enhanced', 'Part 27 II', 'Part 27', 'Part 29'].forEach(k => {
    const t = RUB.rubricFor(k);
    check(k + ' rubric mentions every ranked class', CLASSES.every(c => t.indexOf(c) >= 0) && Object.keys(SEVERITY_RANK).filter(c => c !== 'Negligible').every(c => t.indexOf(c) >= 0));
});
check('Part 25 → AC 25.1309-1B §3.1 verbatim (multiple fatalities, two or more, CS&FL note)',
    /AC 25\.1309-1B/.test(RUB.rubricFor('Part 25')) && /multiple fatalities, usually with the loss of the airplane/.test(RUB.rubricFor('Part 25')) && /two or more fatalities/.test(RUB.rubricFor('Part 25')) && /prevent continued safe flight and landing/.test(RUB.rubricFor('Part 25')));
check('Part 23 → AC 23.1309-1E ¶8.x verbatim (fatal injury to a flight crewmember)',
    /AC 23\.1309-1E/.test(RUB.rubricFor('Part 23 I')) && /incapacitation or fatal injury to a flight crewmember/.test(RUB.rubricFor('Part 23 I')));
check('SC-VTOL → category-dependent: Enhanced ONE OR MORE fatalities / Basic MULTIPLE; fatalities excluded from Enhanced Hazardous; ground fatalities count',
    (function () { const t = RUB.rubricFor('SC-VTOL Enhanced'); return /ONE OR MORE fatalities/.test(t) && /MULTIPLE fatalities/.test(t) && /fatalities are excluded from Hazardous for Enhanced/.test(t) && /people on the ground/.test(t); })());
// 31 Aug 2026 (later) — superseded in place: the rotorcraft ACs were fetched; v2 of the
// module carries AC 27-1B f.(1) and AC 29-2C b.(2) verbatim, the placeholder is gone.
check('Part 29 → AC 29-2C b.(2) verbatim (loss of rotorcraft; ONE occupant Note 2); Part 27 → AC 27-1B f.(1) verbatim + PS-ASW-27-15 class framing; no placeholder left',
    /AC 29-2C Chg 4/.test(RUB.rubricFor('Part 29')) && /or result in loss of rotorcraft/.test(RUB.rubricFor('Part 29')) && /fatal injury of ONE occupant/.test(RUB.rubricFor('Part 29')) &&
    /AC 27-1B Chg 4/.test(RUB.rubricFor('Part 27 II')) && /would prevent continued safe flight and landing/.test(RUB.rubricFor('Part 27 II')) && /PS-ASW-27-15/.test(RUB.rubricFor('Part 27')) &&
    !/NOT YET FETCHED/.test(RUB.rubricFor('Part 27')) && !/NOT YET FETCHED/.test(RUB.rubricFor('Part 29')));
check('rotorcraft rubric pins in both rubric and corpus (same source, same words)',
    ['Failure Conditions which would result in multiple fatalities to occupants, fatalities or incapacitation to the flight crew, or result in loss of rotorcraft.',
     'failure conditions that would prevent continued safe flight and landing'].every(s => RUB.rubricFor('Part 29').indexOf(s) >= 0 || RUB.rubricFor('Part 27').indexOf(s) >= 0) &&
    ['Failure Conditions which would result in multiple fatalities to occupants, fatalities or incapacitation to the flight crew, or result in loss of rotorcraft.',
     'failure conditions that would prevent continued safe flight and landing'].every(s => ALL.indexOf(s) >= 0));
check('Part 33 → §33.75(g) engine effects, verbatim hazardous list, AC ¶19/¶20 scope, both probability routes, NOT the aircraft ladder',
    (function () { const t = RUB.rubricFor('Part 33'); return /§33\.75\(g\)/.test(t) && /Non-containment of high-energy debris/.test(t) && /Complete inability to shut the engine down/.test(t) && /NOT the aircraft five-class ladder/.test(t) && /every individual cause below 10\^-8 or by all causes for that effect/.test(t) && /corn|compressor-delivery casing rupture/.test(t); })());
// 31 Aug 2026 (later) — v3: Part 35 gets its own PROPELLER rubric (§35.15(g)), no longer the engine one.
check('Part 35 → §35.15(g) propeller effects (excessive drag / reverse thrust / release / unbalance), no major number, critical parts §35.16',
    (function () { const t = RUB.rubricFor('Part 35'); return /§35\.15\(g\)/.test(t) && /The development of excessive drag/.test(t) && /excessive unbalance/.test(t) && /NO numeric criterion for major propeller effects/.test(t) && /§35\.16/.test(t) && !/engine mount/.test(t); })());
check('engine/propeller pins in both rubric and corpus', ['Complete inability to shut the engine down', 'The development of excessive drag', 'A failure that results in excessive unbalance'].every(x => (RUB.rubricFor('Part 33') + RUB.rubricFor('Part 35')).indexOf(x) >= 0 && ALL.indexOf(x) >= 0));
check('Part 450/107 → no per-flight-hour ladder, mission-risk model named', /no per-flight-hour five-class ladder/.test(RUB.rubricFor('Part 450')) && /SORA/.test(RUB.rubricFor('Part 107')));
check('every rubric instructs: classify against THESE definitions, cite the clause, never default to Part 25',
    Object.keys(PROB_TARGETS).every(k => { const t = RUB.rubricFor(k); return /Classify EVERY failure condition against THESE definitions/.test(t) && /Never apply Part 25 definitions to a non-Part 25 basis/.test(t); }));

console.log('[3] NO-DRIFT — the verbatim FAA sentences in the rubric are the corpus sentences (same source, same words)');
const pins25 = [
    'A failure condition that would result in multiple fatalities, usually with the loss of the airplane.',
    'A failure condition that would not significantly reduce airplane safety and would only involve flightcrew actions that are well within their capabilities',
    'Failure conditions that would have no effect on safety. For example, failure conditions that would not affect the operational capability of the airplane or increase flightcrew workload but may cause inconvenience to passengers or cabin crew.',
    'classified as major unless the applicant can show otherwise'
];
pins25.forEach(s => check('Part 25 pin in both: "' + s.slice(0, 50) + '…"', RUB.rubricFor('Part 25').indexOf(s) >= 0 && ALL.indexOf(s) >= 0));
const pins23 = [
    'Failure conditions that are expected to result in multiple fatalities of the occupants, or incapacitation or fatal injury to a flight crewmember normally with the loss of the airplane.',
    'Failure conditions that would have no effect on safety (that is, failure conditions that would not affect the operational capability of the airplane or increase crew workload).'
];
pins23.forEach(s => check('Part 23 pin in both: "' + s.slice(0, 50) + '…"', RUB.rubricFor('Part 23 IV').indexOf(s) >= 0 && ALL.indexOf(s) >= 0));
check('SC-VTOL rubric never reproduces EASA prose (no 40+ char quoted runs)', !/["“][^"”\n]{40,}["”]/.test(RUB.rubricFor('SC-VTOL Basic 1')));
check('module is pure data: no RNG/Date/eval/DOM', !/Math\.random|new Date|Date\.now|document\.|\(0, eval\)|new Function/.test(R('severity_rubrics.js')));

console.log('[4] the assembler injects the rubric for severity features — REAL sliced code');
const mCB = ai.match(/function _certBasisKey\(\) \{[\s\S]*?\n    \}/);
const mSF = ai.match(/const _SEVERITY_FEATURES = \{[^\n]*\};/);
const mSR = ai.match(/function _severityRubricBlock\(feature\) \{[\s\S]*?\n    \}/);
const mAS = ai.match(/async function _assembleAnalysisContext\(feature, system, opts\) \{[\s\S]*?\n    \}/);
check('the four pieces exist in ai_assistant.js', !!(mCB && mSF && mSR && mAS));
function sandbox(projectConfig, withModule) {
    const ctx = vm.createContext({
        snapshot: () => ({ projectConfig }),
        canonRegulation: new Function(R('support_modules.js').match(/function canonRegulation\(reg\) \{[\s\S]*?\n\}/)[0] + ';return canonRegulation;')(),
        scvtolTargetKey: new Function(R('support_modules.js').match(/function scvtolTargetKey\(cat\) \{[\s\S]*?\n\}/)[0] + ';return scvtolTargetKey;')(),
        // THE resolver (31 Aug 2026) — sliced real: canonRegulation … certBasisKeyFor
        certBasisKeyFor: new Function(R('support_modules.js').slice(R('support_modules.js').search(/function canonRegulation\(reg\)/), R('support_modules.js').indexOf('// ----- Phase-exposure helpers')) + ';return certBasisKeyFor;')(),
        _skillBodyFor: () => 'SPEC', _FEATURE_SPECS: {}, _goldenThreadContext: () => '', _projectDocContext: () => '',
        _memoryExemplars: () => '', _ZONAL_FEATURES: { 'pra.draft': 1 }, _zonalContext: () => 'ZONAL',
        _withAssumptionsClause: s => s, _withBasisClause: s => s, _withInsufficiencyClause: s => s,
        _CONTROLLED_CLASS: /(controlled|itar)/i,
        window: withModule ? { SL_SEVERITY_RUBRICS: RUB } : {},
        console
    });
    vm.runInContext(mCB[0] + '\n' + mSF[0] + '\n' + mSR[0] + '\nvar __fn = (' + mAS[0].replace('async function _assembleAnalysisContext', 'async function ') + ');', ctx);
    return (f, s, o) => vm.runInContext('__fn', ctx)(f, s || 'SYS', o || {});
}
(async function () {
    const run25 = sandbox({ regulation: 'Part 25' }, true);
    let out = await run25('fha.populate');
    check('fha.populate on a Part 25 project carries the AC 25.1309-1B rubric', /SEVERITY CLASSIFICATION RUBRIC — Part 25 — FAA AC 25\.1309-1B/.test(out) && /two or more fatalities/.test(out));
    out = await run25('pra.draft');
    check('pra.draft (not a severity feature) does NOT carry the rubric but still gets its zonal block', !/SEVERITY CLASSIFICATION RUBRIC/.test(out) && /ZONAL/.test(out));
    const runV = sandbox({ regulation: 'sc-vtol', scvtolCategory: 'Basic 2' }, true);
    out = await runV('sfha.populate');
    check("wizard-dialect 'sc-vtol' + Basic 2 → the SC-VTOL rubric keyed 'SC-VTOL Basic 2' (was: bare 'SC-VTOL', no targets, no rubric)", /SEVERITY CLASSIFICATION RUBRIC — SC-VTOL Basic 2 — EASA MOC SC-VTOL/.test(out) && /MULTIPLE fatalities/.test(out));
    const run23 = sandbox({ regulation: 'part-23', part23Class: 'I' }, true);
    out = await run23('fmea.functional');
    check("showcase-dialect 'part-23' Class I → AC 23.1309-1E rubric keyed 'Part 23 I'", /SEVERITY CLASSIFICATION RUBRIC — Part 23 I — FAA AC 23\.1309-1E/.test(out));
    const runNoMod = sandbox({ regulation: 'Part 25' }, false);
    out = await runNoMod('fha.populate');
    check('module absent → no block, completion still assembled (guarded, never dead)', !/SEVERITY CLASSIFICATION RUBRIC/.test(out) && /SPEC/.test(out));
    const runCustom = sandbox({ regulation: 'Custom' }, true);
    out = await runCustom('fha.populate');
    check('Custom basis → no rubric injected (no invented definitions)', !/SEVERITY CLASSIFICATION RUBRIC/.test(out));
    check('_SEVERITY_FEATURES covers the classifying lanes: fha, sfha, fcim, fmea ×2, fta.review, doc.review, req.recommend',
        ['fha.populate', 'sfha.populate', 'fcim.populate', 'fmea.functional', 'fmea.item', 'fta.review', 'doc.review', 'req.recommend'].every(f => new RegExp("'" + f.replace('.', '\\.') + "': 1").test(mSF[0])));
    check('index.html loads severity_rubrics.js right after safety_targets.js',
        /safety_targets\.js\?v=[\d.]+" defer><\/script>\s*\n\s*<script src="severity_rubrics\.js\?v=[\d.]+" defer>/.test(R('index.html')));
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();

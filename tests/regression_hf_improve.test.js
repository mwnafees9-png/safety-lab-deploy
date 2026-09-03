#!/usr/bin/env node
/*
 * regression_hf_improve.test.js — HF DESIGN-IMPROVEMENT ADVISOR (feature 'hf.improve').
 * The HF AI now proposes standard-rooted, feasible design improvements per lane — not just
 * assessments. Verifies: the engine exists and is complete across all six HF lanes; the
 * established advisory doctrine (AI never writes rows — Accept files a review comment, no
 * cited FC => not fileable); the integrity guardrails (decision-support only, no compliance
 * claims, no probabilities, cite-and-point for licensed standards); findings + proactive
 * best-practice both driven; the feature is registered correctly (checked basis list, busy
 * label, deliberately OUTSIDE the insufficiency gate); and every lane is wired with an export.
 * Run: node tests/regression_hf_improve.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const ai = R('ai_assistant.js');
const idx = R('index.html');
const panel = R('hf_register_panel.js');
// 2 Sep 2026 — the in-lane recommender button is no longer hand-placed in index.html.
// lane_ai_bar.js mounts one from a registry so all nine HF lanes and every safety lane
// share ONE mechanism instead of nine copies. The invariant is unchanged — this lane has
// a reachable AI action — so the check moved to the surface that now provides it.
const laneBar = require('fs').readFileSync(require('path').join(__dirname, '..', 'site/lane_ai_bar.js'), 'utf8');

console.log('1. engine present & complete');
check('recommendHfImprovements(lane) engine exists', /async function recommendHfImprovements\(lane\)/.test(ai));
check('lane config _HF_IMPROVE_LANES exists', /var _HF_IMPROVE_LANES = \{/.test(ai));
check('grounded system prompt builder exists', /function _hfImproveSystemPrompt\(cfg\)/.test(ai));
check('anchor builder exists (FC + lane-row anchors, takes the lane cfg)', /function _hfImproveAnchors\(cfg\)/.test(ai));
check('advisory apply path exists', /function _applyHfImprovement\(x\)/.test(ai));

// EXECUTED: extract and eval the lane-config literal, prove all six lanes + their accessors.
const laneCfg = (function () {
  const m = ai.match(/var _HF_IMPROVE_LANES = (\{[\s\S]*?\n    \});/);
  if (!m) return null;
  const sb = {}; vm.createContext(sb);
  try { return vm.runInContext('(' + m[1] + ')', sb); } catch (e) { return null; }
})();
check('lane config parses', !!laneCfg);
check('all six HF lanes present (alloc/task/hea/alerts/ergo/mfc)',
  laneCfg && ['alloc','task','hea','alerts','ergo','mfc'].every(k => laneCfg[k] && laneCfg[k].name),
  laneCfg ? Object.keys(laneCfg).join(',') : 'none');
check('task lane reads the tasks store (readKey mapping is correct, not a copy of the tab id)',
  laneCfg && laneCfg.task.readKey === 'tasks');
check('lanes with a findings function point at a real one (alloc/hea/alerts/mfc)',
  laneCfg && laneCfg.alloc.findings === 'allocFindings' && laneCfg.hea.findings === 'heaFindings'
         && laneCfg.alerts.findings === 'alertFindings' && laneCfg.mfc.findings === 'mfcFindings');
check('lanes without a findings function are null, not fabricated (task/ergo)',
  laneCfg && laneCfg.task.findings === null && laneCfg.ergo.findings === null);

console.log('2. advisory doctrine — AI never writes an authoritative row');
const applyFn = (ai.split('function _applyHfImprovement')[1] || '').split('\n    async function recommendHfImprovements')[0];
check('Accept files a Review comment (not a register row)', /Review/.test(applyFn) && /addComment/.test(applyFn));
check('provenance stamped: aiFeature = hf.improve, authored by ANEM (AI)',
  /aiFeature = 'hf\.improve'/.test(applyFn) && /authorName = 'ANEM \(AI\)'/.test(applyFn));
check('a recommendation naming no failure condition is refused, not filed somewhere arbitrary',
  /if \(!targets\.length\)/.test(applyFn) && /names no failure condition/.test(applyFn) && /return false/.test(applyFn));
check('panel wires Accept to _applyHfImprovement (per-row: Accept captures, Dismiss = advice only)',
  /onAccept: _applyHfImprovement/.test(ai));
check('disclaimer states advisory posture (not compliance/requirement/decision)',
  /not<\/b> compliance findings, requirements, or design decisions/.test(ai));

console.log('3. integrity guardrails in the prompt');
// 2 Sep 2026 (Skills V1.3) — the doctrine moved OUT of this function and into the
// registered skill body `hf.improve@v1` (_SPEC_HF_IMPROVE is its byte-identical inline
// fallback), because an unregistered prompt cannot carry a version, a hash or a stamp.
// The lift therefore covers BOTH halves: what the model receives is the composed prompt,
// and pinning only the function body would now pass while the doctrine was deleted.
const _improveFn = (ai.split('function _hfImproveSystemPrompt')[1] || '').split('\n    // Accept ->')[0];
const _improveSpec = (ai.match(/const _SPEC_HF_IMPROVE = \[[\s\S]*?\]\.join\('\\n'\);/) || [''])[0];
const promptFn = _improveFn + '\n' + _improveSpec;
check('the registered body is what the prompt serves, inline as fallback',
  /_skillBodyFor\('hf\.improve'\) \|\| _SPEC_HF_IMPROVE/.test(_improveFn) && _improveSpec.length > 500);
check('decision-support, not a certifying authority', /decision-support, not a certifying authority/.test(promptFn));
check('asserts NO compliance findings and NO probabilities', /Assert NO compliance findings and NO probabilities/.test(promptFn));
check('never turns HFACS nanocodes into rates', /never turn HFACS nanocodes into failure rates/.test(promptFn));
check('HIDH seeds, does not determine', /SEEDS a design choice, it does not determine/.test(promptFn));
check('cite-and-point for licensed standards (ISO/SAE/MIL)', /CITE-AND-POINT only/.test(promptFn) && /never reproduce their text/.test(promptFn));
check('inherits the shared standards preamble (copyright + severity posture)', /_standardsPreamble\(\), ''/.test(promptFn));
check('carries the shared abstention rule', /_ABSTAIN_RULE/.test(promptFn));

console.log('4. both drivers — findings AND proactive best-practice');
check('draws on flagged findings', /the FINDINGS this lane has already flagged/.test(promptFn));
check('proactive even where nothing is flagged', /PROACTIVE best practice/.test(promptFn) && /even where nothing is flagged/.test(promptFn));
check('demands concrete, feasible changes with an effort rating', /CONCRETE and FEASIBLE/.test(promptFn) && /"feasibility":"quick win\|moderate\|significant"/.test(promptFn));
check('grounds each rec in a specific named standard', /AC 25\.1302-1/.test(promptFn) && /§25\.1322/.test(promptFn) && /§25\.1523 \/ Appendix D/.test(promptFn));
check('refs echoed exactly; general recs return basis [] (verification-by-construction)',
  /copy the ref string EXACTLY/i.test(promptFn) && /"basis": \[\]/.test(promptFn));

console.log('5. feature registration');
check('checked basis closed-list _HF_IMPROVE_BASES defined', /const _HF_IMPROVE_BASES = \[/.test(ai));
check('basis list is SEPARATE from the workload-scoped _HF_BASES', /SEPARATE from _HF_BASES/.test(ai));
check('_basesFor resolves hf.improve lazily (TDZ-safe like hfa.draft)',
  /if \(f === 'hf\.improve'\) \{ try \{ return _HF_IMPROVE_BASES; \}/.test(ai));
check('panel passes feature:\'hf.improve\' so the checked basis chip renders', /feature: 'hf\.improve'/.test(ai));
check('prompt wrapped with _withBasisClause for the standardBasis closed list', /_withBasisClause\(_hfImproveSystemPrompt\(cfg\), 'hf\.improve'\)/.test(ai));
check('grounded in the HF KB corpus at call time', /_ftaKbBlock\(_kbQuery, 6, 'hf'\)/.test(ai));
check('busy label registered', /'hf\.improve': 'recommending HF design improvements'/.test(ai));
check('DELIBERATELY outside _ANALYSIS_FEATURES (insufficiency guard would kill the proactive lane)',
  !/'hf\.improve': 1/.test((ai.match(/const _ANALYSIS_FEATURES = \{[\s\S]*?\};/) || [''])[0]));

console.log('6. per-lane wiring + export');
check('exported on the SafetyLabAI API', /recommendHfImprovements: recommendHfImprovements,/.test(ai));
['alloc','hea','alerts','mfc','cd','sa'].forEach(function (lane) {
  check('the ' + lane + ' lane is wired for an in-lane AI button', laneBar.indexOf("'hfa-" + lane + "'") >= 0);
});
['task','ergo'].forEach(function (lane) {
  check('the ' + lane + ' lane is wired through the shared bar, not the panel', laneBar.indexOf("'hfa-" + lane + "'") >= 0);
});
check('the tid lane is wired for an in-lane AI button', laneBar.indexOf("'hfa-tid'") >= 0);
// Nine lanes now: Task Identification joined the chain on 1 Sep 2026 (tasks -> TCIM ->
// task hazard assessment, the mirror of functions -> FCIM -> FHA). Seven live in index,
// two in the register panel.

console.log('\n' + (fail ? ('FAIL — ' + fail + ' failed, ' + pass + ' passed') : ('OK — all ' + pass + ' checks pass')));
process.exit(fail ? 1 : 0);

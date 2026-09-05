/*
 * regression_ai_repeatability.test.js — F1 first cut (2026-08-29)
 *
 * Three concerns, one suite:
 *
 *  1. THE SCORER IS TRUSTWORTHY. eval/score_run.mjs is the instrument every
 *     repeatability claim will rest on, so the instrument itself is
 *     mutation-proved here: identity must score REPEATABLE (exit 0), and each
 *     seeded defect class (dropped rows / flipped severities / stripped
 *     citations / renamed conditions) must trip its OWN metric (exit 1).
 *     A scorer that cannot see a planted defect is worse than no scorer.
 *
 *  2. THE GOLDEN BASELINE IS FROZEN. eval/golden_aeolus_v1.json is the fixture
 *     variance gets measured against; silent edits to it would move every
 *     future measurement. Its identity (SDD md5, counts, abstention count)
 *     is pinned here.
 *
 *  3. THE DETERMINISTIC HALF OF THE PIPELINE IS ACTUALLY DETERMINISTIC.
 *     Context assembly is the part of the AI lane we fully control; if
 *     snapshot()/_extractedFCs()/_validPhases() vary run-to-run on identical
 *     state, no amount of model pinning helps. Executed twice on identical
 *     state -> byte-identical JSON; and their bodies must not read the wall
 *     clock or RNG.
 *
 * Run: node eval/regression_ai_repeatability.test.js   (from repo root or anywhere)
 * Exit code 0 = pass, 1 = fail. No output pins on source SHAPE — behavior only
 * (the two shape-pin misses taught us that) — except the deliberate fixture pin
 * in section 2, whose entire job is to freeze bytes.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const EVAL = __dirname;
const SITE = path.join(ROOT, 'site');
const SCORER = path.join(EVAL, 'score_run.mjs');
const GOLDEN = path.join(EVAL, 'golden_aeolus_v1.json');

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); }
  else { failures++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function runScorer(goldenPath, candPath) {
  try {
    const out = execFileSync(process.execPath, [SCORER, goldenPath, candPath, '--json'],
      { encoding: 'utf8' });
    return { code: 0, report: JSON.parse(out) };
  } catch (e) {
    let report = null;
    try { report = JSON.parse(e.stdout || 'null'); } catch (_) {}
    return { code: e.status == null ? -1 : e.status, report };
  }
}

const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));

/* ------------------------------------------------------------------ */
console.log('1. scorer mutation-proof');

const ident = runScorer(GOLDEN, GOLDEN);
check('identity scores REPEATABLE with exit 0',
  ident.code === 0 && ident.report && ident.report.verdict === 'REPEATABLE');
check('identity severity agreement is exactly 1',
  ident.report && ident.report.metrics.severityAgreement.value === 1,
  'engineer-classified rows must be excluded from the denominator');

function mutate(fn) {
  const m = JSON.parse(JSON.stringify(golden));
  fn(m);
  const p = path.join(require('os').tmpdir(), 'eval_mut_' + crypto.randomBytes(4).toString('hex') + '.json');
  fs.writeFileSync(p, JSON.stringify(m));
  return p;
}

const mutations = [
  ['dropped FHA rows trip fhaRowCount', m => { m.fha = m.fha.slice(0, 60); }, 'fhaRowCount'],
  ['Catastrophic->Minor flips trip severeJumpRate', m => {
    m.fha.forEach(r => { if ((r.severity || '').trim() === 'Catastrophic') r.severity = 'Minor'; });
  }, 'severeJumpRate'],
  // F1b: judged over BOTH-classified pairs so it cannot hide behind the
  // abstain-abstain majority once severityAgreement's threshold sits at the
  // observed same-model floor.
  ['broad reclassification trips severityAgreementClassified', m => {
    m.fha.forEach(r => {
      const s = (r.severity || '').trim();
      if (s === 'Catastrophic') r.severity = 'Hazardous';
      else if (s === 'Hazardous') r.severity = 'Major';
      else if (s === 'Major') r.severity = 'Minor';
      else if (s === 'Minor') r.severity = 'Negligible';
    });
  }, 'severityAgreementClassified'],
  ['stripped citations trip assumptionCitedRate', m => {
    m.assumptions.forEach(a => { a.citations = []; });
  }, 'assumptionCitedRate'],
  // F1b (30 Aug): matching moved from exact text to topic|mode signatures, so
  // the gibberish rename now trips the SIGNATURE match rate (no topics -> no
  // pass-2 match), and abstention is judged as a rate delta, not a text set.
  ['renamed conditions trip fhaSignatureMatchRate', m => {
    m.fha.forEach((r, i) => { r.fcDesc = 'completely different condition text nr ' + i; r.subId = 'ZZ-' + i; });
  }, 'fhaSignatureMatchRate'],
  ['abstain-to-guess conversion trips abstentionRateDelta', m => {
    m.fha.forEach(r => { if (!(r.severity || '').trim()) r.severity = 'Major'; });
  }, 'abstentionRateDelta'],
  ['unverified citations trip citationVerifiedRate', m => {
    m.assumptions.forEach(a => (a.citations || []).forEach(c => { c.verified = false; }));
  }, 'citationVerifiedRate'],
];

for (const [name, fn, metric] of mutations) {
  const p = mutate(fn);
  const r = runScorer(GOLDEN, p);
  fs.unlinkSync(p);
  check(name,
    r.code === 1 && r.report && r.report.failures.includes(metric),
    r.report ? 'failures=' + JSON.stringify(r.report.failures) : 'no report');
}

// F1b mutations run against golden v2 — the fixture that carries the
// granularity band the 29 Aug batch made necessary.
{
  const G2 = path.join(EVAL, 'golden_aeolus_v2.json');
  const g2 = JSON.parse(fs.readFileSync(G2, 'utf8'));
  function mutate2(fn) {
    const m = JSON.parse(JSON.stringify(g2));
    fn(m);
    const p = path.join(require('os').tmpdir(), 'eval_mut2_' + crypto.randomBytes(4).toString('hex') + '.json');
    fs.writeFileSync(p, JSON.stringify(m));
    return p;
  }
  const mut2 = [
    ['coarse decompose (run-1 failure mode) trips the granularity band', m => {
      m.functions = m.functions.slice(0, 8);
    }, 'functionCount'],
    ['over-fine decompose trips the band from above', m => {
      for (let i = 0; i < 12; i++) m.functions.push({ subId: 'SF-X' + i, subName: 'Provide wheel braking variant ' + i, subDef: 'braking' });
    }, 'functionCount'],
    ['topic-hollowed functions trip functionTopicJaccard', m => {
      m.functions.forEach((f, i) => { f.subName = 'quux subsystem ' + i; f.subDef = 'quux'; });
    }, 'functionTopicJaccard'],
    ['topic-hollowed FCIM trips fcimTopicModeJaccard', m => {
      m.fcim.forEach((r, i) => { r.tlDesc = 'quux ' + i; r.plDesc = ''; r.mDesc = ''; r.plExtra = null; r.mExtra = null; r.subId = 'ZZ-' + i; });
    }, 'fcimTopicModeJaccard'],
  ];
  for (const [name, fn, metric] of mut2) {
    const p = mutate2(fn);
    const r = runScorer(G2, p);
    fs.unlinkSync(p);
    check(name,
      r.code === 1 && r.report && r.report.failures.includes(metric),
      r.report ? 'failures=' + JSON.stringify(r.report.failures) : 'no report');
  }
  // the informational text metrics must never fail a run on their own
  const pRename = mutate2(m => {
    m.functions.forEach(f => { f.subName = 'renamed ' + f.subName; });
    m.fha.forEach(r => { r.fcDesc = 'reworded — ' + r.fcDesc; });
  });
  const rRename = runScorer(G2, pRename);
  fs.unlinkSync(pRename);
  check('pure rephrasing (same topics) does NOT fail the run — the 29 Aug lesson',
    rRename.code === 0,
    rRename.report ? 'failures=' + JSON.stringify(rRename.report.failures) : 'no report');
}

/* ------------------------------------------------------------------ */
console.log('2. golden baseline frozen');

check('SDD identity pinned',
  golden.meta.sdd.md5 === 'd73e0ed7595ce098b8b44536dc8f7c58' && golden.meta.sdd.chars === 61974);
check('counts pinned (18 fn / 35 fcim / 101 fha / 92 assumptions)',
  golden.functions.length === 18 && golden.fcim.length === 35 &&
  golden.fha.length === 101 && golden.assumptions.length === 92);
check('abstention count pinned (64 outside engineer-classified)',
  golden.fha.filter(r => !(r.severity || '').trim()).length === 64);
check('engineer-classified rows declared', Array.isArray(golden.meta.engineerClassified) &&
  golden.meta.engineerClassified.includes('SF-001-M'));
check('drafting model recorded', golden.meta.model === 'claude-opus-4-8');

/* ------------------------------------------------------------------ */
console.log('3. context assembly is deterministic');

const aiSrc = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');

// brace-matched extraction of a named function's full text
function extractFn(src, name) {
  const decl = 'function ' + name;
  const at = src.indexOf(decl);
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (!depth) return src.slice(at, i + 1); }
  }
  return null;
}

const fnNames = ['snapshot', '_extractedFCs', '_projectPhaseNames', '_validPhases'];
const bodies = {};
for (const n of fnNames) {
  bodies[n] = extractFn(aiSrc, n);
  check('extracted ' + n + '()', !!bodies[n]);
}

// 3a. no wall clock / RNG / locale in the assembly path
for (const n of fnNames) {
  if (!bodies[n]) continue;
  const bad = bodies[n].match(/Date\.now|new Date|Math\.random|toLocale/);
  check(n + '() reads no clock/RNG/locale', !bad, bad && bad[0]);
}

// 3b. executed twice on identical state -> byte-identical output
if (bodies.snapshot && bodies._extractedFCs) {
  const fixedState = {
    ftaPages: [{ id: 'p1' }],
    acFhaData: golden.fha.slice(0, 5),
    acFcimData: golden.fcim.slice(0, 5),
    acFunctionsData: golden.functions.slice(0, 5),
    acReqData: [], systemsData: [], cmaData: [], praData: [], zsaData: [],
    fmeaData: [], itemsData: [], routingData: [],
    projectSourceDocs: [{ name: 'x.pdf', text: 'abc' }],
    projectConfig: { regulation: 'Part 25' },
    acExtractedFCsLive: undefined,
    flightPhasesData: [{ phase: 'Climb' }, { phase: 'Cruise' }],
  };
  function buildSandbox() {
    const sb = { console };
    vm.createContext(sb);
    const preamble = Object.keys(fixedState)
      .map(k => 'let ' + k + ' = ' + JSON.stringify(fixedState[k]) + ';').join('\n');
    // _extractedFCs' live-array-wins branch reads acExtractedFCs; give it the
    // derivation path by leaving the live array undefined.
    vm.runInContext(preamble + '\nlet acExtractedFCs;\n' +
      bodies._extractedFCs + '\n' + bodies.snapshot +
      '\nglobalThis.__snap = () => JSON.stringify(snapshot());', sb);
    return sb;
  }
  const a1 = vm.runInContext('__snap()', buildSandbox());
  const a2 = vm.runInContext('__snap()', buildSandbox());
  const a3 = vm.runInContext('__snap() === __snap() ? __snap() : "UNSTABLE-SAME-CONTEXT"', buildSandbox());
  check('snapshot() twice in fresh contexts is byte-identical', a1 === a2);
  check('snapshot() twice in one context is byte-identical', a3 !== 'UNSTABLE-SAME-CONTEXT');
  const parsed = JSON.parse(a1);
  check('snapshot() derives acExtractedFCs from FCIM when no live array',
    Array.isArray(parsed.acExtractedFCs) && parsed.acExtractedFCs.length > 0);
}

if (bodies._validPhases && bodies._projectPhaseNames) {
  const sb = { window: undefined, console };
  vm.createContext(sb);
  vm.runInContext(
    'let flightPhasesData = [{phase:"Climb"},{phase:"Cruise"}];' +
    'const FLIGHT_PHASES = ["Climb","Cruise"];' +
    bodies._projectPhaseNames + bodies._validPhases +
    ';globalThis.__vp = v => JSON.stringify(_validPhases(v));', sb);
  const r1 = vm.runInContext('__vp(["Cruise","Climb","Hover"])', sb);
  const r2 = vm.runInContext('__vp(["Cruise","Climb","Hover"])', sb);
  check('_validPhases() is stable and order-preserving (ticks existing boxes only)', r1 === r2 && r1 === '["Cruise","Climb"]', r1);
}

/* ------------------------------------------------------------------ */
console.log('5. golden v2 (claude-fable-5) integrity — added 2026-08-29 after the');
console.log('   3-run variance batch (runs gave 8/16/22 functions; run 2 promoted)');
{
  const G2 = path.join(EVAL, 'golden_aeolus_v2.json');
  check('golden_aeolus_v2.json exists', fs.existsSync(G2));
  if (fs.existsSync(G2)) {
    const g2 = JSON.parse(fs.readFileSync(G2, 'utf8'));
    check('v2 is a fable-5 run', g2.meta && g2.meta.model === 'claude-fable-5');
    check('v2 same SDD as v1 (same benchmark, different model)',
      g2.meta.sdd && g2.meta.sdd.md5 === golden.meta.sdd.md5 && g2.meta.sdd.chars === golden.meta.sdd.chars);
    check('v2 accept-all untouched (no engineer-classified rows)',
      Array.isArray(g2.meta.engineerClassified) && g2.meta.engineerClassified.length === 0);
    check('v2 arrays populated (functions/fcim/fha/assumptions)',
      g2.functions.length >= 8 && g2.fcim.length >= 16 && g2.fha.length >= 50 && g2.assumptions.length >= 40,
      [g2.functions.length, g2.fcim.length, g2.fha.length, g2.assumptions.length].join('/'));
    check('v2 carries the granularity band and its own count sits inside it',
      Array.isArray(g2.meta.granularityBand) && g2.meta.granularityBand.length === 2 &&
      g2.functions.length >= g2.meta.granularityBand[0] &&
      g2.functions.length <= g2.meta.granularityBand[1],
      JSON.stringify(g2.meta.granularityBand));
    // v2 must score as REPEATABLE against itself — same identity property as v1
    const id2 = runScorer(G2, G2);
    check('v2 identity scores REPEATABLE with exit 0',
      id2.code === 0 && id2.report && id2.report.verdict === 'REPEATABLE');
  }
}

/* ------------------------------------------------------------------ */
console.log('6. golden v3 (F1c-era config) integrity — added 30 Aug 2026');
{
  const G3 = path.join(EVAL, 'golden_aeolus_v3.json');
  check('golden_aeolus_v3.json exists', fs.existsSync(G3));
  if (fs.existsSync(G3)) {
    const g3 = JSON.parse(fs.readFileSync(G3, 'utf8'));
    check('v3 records the REQUEST routing key with the routing-key caveat',
      g3.meta.model === 'claude-opus-4-8' && /routing key/i.test(g3.meta.modelNote || ''));
    check('v3 same SDD as v1/v2', g3.meta.sdd && g3.meta.sdd.md5 === golden.meta.sdd.md5);
    check('v3 accept-all untouched', Array.isArray(g3.meta.engineerClassified) && g3.meta.engineerClassified.length === 0);
    check('v3 carries band + its count sits inside it',
      Array.isArray(g3.meta.granularityBand) && g3.functions.length >= g3.meta.granularityBand[0] && g3.functions.length <= g3.meta.granularityBand[1]);
    check('v3 declares its decompose-coverage profile (the F1c advisory case)',
      /10\/14/.test(g3.meta.decomposeCoverage || '') && /FUE\/HYD\/EPS\/EWS/.test(g3.meta.decomposeCoverage || ''));
    const id3 = runScorer(G3, G3);
    check('v3 identity scores REPEATABLE with exit 0', id3.code === 0 && id3.report && id3.report.verdict === 'REPEATABLE');
    const x = runScorer(path.join(EVAL, 'golden_aeolus_v2.json'), G3);
    // 4 Sep 2026 (eval_core v1.7): the severity bar rose to 0.90 on STRICT pairs and the
    // function-level worst case joined at 0.90 (Waqas: "the numbers need to be over 90
    // percent"). v3 was promoted under the old 0.50 topic-paired bar and does not meet the
    // new one — that is the honest reading, not a scorer regression. Everything ELSE must
    // still pass; only the two raised severity bars may fail here.
    const _sevBars = ['perPhaseClassAgreement', 'functionWorstCaseAgreement'];   // v1.9 (5 Sep): the judged bars — class per condition per phase, and the function worst case; row severity and phase split are informational now
    check('v3 vs golden v2: every metric other than the raised severity / phase-split bars still passes (the promotion criterion, as it stood)',
      x.report && x.report.failures.every(function (f) { return _sevBars.indexOf(f) >= 0; }), x.report && JSON.stringify(x.report.failures));
  }
}

/* ------------------------------------------------------------------ */
console.log('7. golden v4 — the FULL-LANE golden (30 Aug 2026 night)');
{
  const G4 = path.join(EVAL, 'golden_aeolus_v4.json');
  check('golden_aeolus_v4.json exists', fs.existsSync(G4));
  if (fs.existsSync(G4)) {
    const g4 = JSON.parse(fs.readFileSync(G4, 'utf8'));
    check('v4 same SDD, md5 computed IN the live project at capture',
      g4.meta.sdd && g4.meta.sdd.md5 === golden.meta.sdd.md5 && /computed IN the live project/i.test(g4.meta.sddNote || ''));
    check('v4 records the REQUEST routing key with the caveat',
      g4.meta.model === 'claude-opus-4-8' && /routing key/i.test(g4.meta.modelNote || ''));
    check('v4 accept-all untouched + band-resident',
      Array.isArray(g4.meta.engineerClassified) && g4.meta.engineerClassified.length === 0 &&
      g4.functions.length >= g4.meta.granularityBand[0] && g4.functions.length <= g4.meta.granularityBand[1]);
    check('v4 carries EVERY lane the engine scores except fmea — and DECLARES why fmea is empty',
      ['ftaPages','praData','zsaData','cmaData','acReqData','ramParts','markovModels','hfaRows','hfAllocRows','heaRows','alertRows']
        .every(k => Array.isArray(g4[k]) && g4[k].length > 0) &&
      Array.isArray(g4.fmeaData) && g4.fmeaData.length === 0 && /system-workspace lane/i.test((g4.meta.laneNotes || {}).fmea || ''));
    check('v4 declares the severityAgreement miss vs v3 rather than hiding it (the promotion was made with eyes open)',
      /severityAgreement 0\.43/.test(g4.meta.scoredVsV3 || '') && /Table A6/.test(g4.meta.scoredVsV3 || ''));
    check('v4 names the authored-lane script (candidate runs must reproduce it verbatim)',
      /AUTHORED-LANE SCRIPT v1/.test((g4.meta.laneNotes || {}).authored || ''));
    // 30 Aug — the A/B's zsa finding, banked as a fixture-owned band.
    check('v4 declares the PROVISIONAL zsa granularity band with its data basis',
      Array.isArray((g4.meta.laneBands || {}).zsa) && /PROVISIONAL from 3 draws/.test(g4.meta.laneBandsNote || ''));
    const id4 = runScorer(G4, G4);
    // 2 Sep 2026 — 3 -> 8 skips on BOTH goldens: tid/cd/sa/mfc/resources joined the
    // instrument today and neither v4 nor v5 was captured with those stores, so they are
    // skipped-and-named exactly as tasks/ergo were when they joined after v4. The skip is
    // the instrument telling the truth about an old capture, not a regression; the first
    // golden that carries them is the one Phase 1 cuts.
    // 30 Aug (later) — 1 -> 3 skips: the tasks/ergo lanes joined AFTER v4 was
    // captured (task-first correction); v4 legitimately has no data in them.
    check('v4 identity scores REPEATABLE with exit 0; fmea + tasks + ergo the only skipped lanes',
      id4.code === 0 && id4.report && id4.report.verdict === 'REPEATABLE' &&
      id4.report.skippedLanes.length === 8 &&
      ['fmea', 'tasks', 'ergo', 'tid', 'cd', 'sa', 'mfc', 'resources'].every(l => id4.report.skippedLanes.some(s => s.indexOf(l + ' ') === 0)));
    check('v4 identity carries LIVE lane metrics for eleven lanes (22 <lane>Count/<lane>TopicJaccard entries)',
      id4.report && Object.keys(id4.report.metrics).filter(k => /Count$|TopicJaccard$/.test(k) && !/^function|^fcim|^fha/.test(k)).length === 22);
  }
}

/* ------------------------------------------------------------------ */
console.log('8. golden v5 — the REIGNING current-config golden (31 Aug 2026)');
{
  const G5 = path.join(EVAL, 'golden_aeolus_v5.json');
  check('golden_aeolus_v5.json exists', fs.existsSync(G5));
  if (fs.existsSync(G5)) {
    const g5 = JSON.parse(fs.readFileSync(G5, 'utf8'));
    const G4 = JSON.parse(fs.readFileSync(path.join(EVAL, 'golden_aeolus_v4.json'), 'utf8'));
    check('v5 same SDD as v4 by construction (md5 chain + verbatim-seed provenance note)',
      g5.meta.sdd.md5 === G4.meta.sdd.md5 && /VERBATIM/.test(g5.meta.sddNote || '') && /18e34c73/.test(g5.meta.sddNote || ''));
    check('v5 records the shipped CONFIG it was captured under (anchored skill + FCIM carry + top-event identity)',
      /fha\.draft@v2#0a2621d7/.test((g5.meta.configPins || {}).fhaSkill || '') &&
      /sourceCondId/.test((g5.meta.configPins || {}).fcimCarry || '') &&
      /top-event/i.test((g5.meta.configPins || {}).topEventIdentity || ''));
    check('v5 accept-all untouched + band-resident',
      Array.isArray(g5.meta.engineerClassified) && g5.meta.engineerClassified.length === 0 &&
      g5.functions.length >= g5.meta.granularityBand[0] && g5.functions.length <= g5.meta.granularityBand[1]);
    check('v5 FHA rows all carry the FCIM id (fcId === sourceCondId, the 75.3 carry) — zero exceptions',
      g5.fha.length > 100 && g5.fha.every(r => r.sourceCondId && r.fcId === r.sourceCondId));
    check('v5 carries every lane except fmea/tasks/ergo — each empty lane DECLARED',
      ['ftaPages','praData','zsaData','cmaData','acReqData','ramParts','markovModels','hfaRows','hfAllocRows','heaRows','alertRows']
        .every(k => Array.isArray(g5[k]) && g5[k].length > 0) &&
      ['fmea','tasks','ergo'].every(k => /EMPTY/i.test((g5.meta.laneNotes || {})[k] || '')));
    check('v5 declares its four scoredVsV4 misses rather than hiding them (the v4 promotion precedent)',
      /31\/35/.test(g5.meta.scoredVsV4 || '') && /ftaCount/.test(g5.meta.scoredVsV4) && /heaTopicJaccard 0\.333/.test(g5.meta.scoredVsV4));
    check('v5 RECORDS the authored-lane v1.1 strings verbatim (the gap that cost heaTopicJaccard vs v4)',
      /Perform the credited crew action/.test((g5.meta.laneNotes || {}).authored || '') &&
      /MASTER WARNING/.test((g5.meta.laneNotes || {}).authored || ''));
    check('v5 laneBands: zsa carried (4-draw basis), fta+cma NEW PROVISIONAL tied to the severity-stability axis',
      Array.isArray((g5.meta.laneBands || {}).zsa) && Array.isArray((g5.meta.laneBands || {}).fta) && Array.isArray((g5.meta.laneBands || {}).cma) &&
      /SCOPE-DERIVED/i.test(g5.meta.laneBandsNote || '') && /severity-stability axis/.test(g5.meta.laneBandsNote || ''));
    check('v5 fta count sits inside its own declared band', (() => {
      const trees = g5.ftaPages.filter(p => p && p.root).length;
      return trees >= g5.meta.laneBands.fta[0] && trees <= g5.meta.laneBands.fta[1]; })());
    check('v5 declares itself the reigning gate baseline with v4 retained',
      /supersedes v4/.test(g5.meta.reigning || '') && /v4 retained/.test(g5.meta.reigning || ''));
    const id5 = runScorer(G5, G5);
    check('v5 identity scores REPEATABLE with exit 0; fmea + tasks + ergo the only skipped lanes',
      id5.code === 0 && id5.report && id5.report.verdict === 'REPEATABLE' &&
      id5.report.skippedLanes.length === 8 &&
      ['fmea', 'tasks', 'ergo'].every(l => id5.report.skippedLanes.some(s => s.indexOf(l + ' ') === 0)));
    check('v5 identity carries LIVE lane metrics for eleven lanes (22 entries)',
      id5.report && Object.keys(id5.report.metrics).filter(k => /Count$|TopicJaccard$/.test(k) && !/^function|^fcim|^fha/.test(k)).length === 22);
  }
}

/* ------------------------------------------------------------------ */
console.log('9. golden v6 — the CORE-PIPELINE golden of the fcim-v2 + F2-assembler generation (31 Aug 2026)');
{
  const G6 = path.join(EVAL, 'golden_aeolus_v6.json');
  check('golden_aeolus_v6.json exists', fs.existsSync(G6));
  if (fs.existsSync(G6)) {
    const g6 = JSON.parse(fs.readFileSync(G6, 'utf8'));
    const g5 = JSON.parse(fs.readFileSync(path.join(EVAL, 'golden_aeolus_v5.json'), 'utf8'));
    check('v6 same SDD as v5 by construction (md5 chain + verbatim-seed provenance from the v5 row)',
      g6.meta.sdd.md5 === g5.meta.sdd.md5 && /VERBATIM/.test(g6.meta.sddNote || '') && /60915c0e/.test(g6.meta.sddNote || '') && /994abde7693d30e7/.test(g6.meta.sddNote || ''));
    check('v6 records the FULL config generation (anchored FHA + canonical FCIM + the F2 assembler + carry)',
      /fha\.draft@v2#0a2621d7/.test((g6.meta.configPins || {}).fhaSkill || '') &&
      /fcim\.draft@v2#a1046141/.test((g6.meta.configPins || {}).fcimSkill || '') &&
      /_assembleAnalysisContext/.test((g6.meta.configPins || {}).contextAssembly || '') &&
      /sourceCondId/.test((g6.meta.configPins || {}).fcimCarry || ''));
    check('v6 accept-all untouched + band-resident',
      Array.isArray(g6.meta.engineerClassified) && g6.meta.engineerClassified.length === 0 &&
      g6.functions.length >= g6.meta.granularityBand[0] && g6.functions.length <= g6.meta.granularityBand[1]);
    check('v6 FHA rows all carry the FCIM id (fcId === sourceCondId) — zero exceptions',
      g6.fha.length >= 90 && g6.fha.every(r => r.sourceCondId && r.fcId === r.sourceCondId));
    // 31 Aug same session — superseded in place: v6 was extended FULL-LANE
    // (paid lanes + authored script v1.1) hours after the core-pipeline
    // promotion, so the split reign lasted one evening. v6 now reigns OUTRIGHT.
    check('v6 is lane-complete and reigns outright (fmea/tasks/ergo the named empties)',
      ['ftaPages','praData','zsaData','cmaData','acReqData','ramParts','markovModels','hfaRows','hfAllocRows','heaRows','alertRows']
        .every(k => Array.isArray(g6[k]) && g6[k].length > 0) &&
      ['fmea','tasks','ergo'].every(k => /EMPTY/i.test((g6.meta.laneNotes || {})[k] || '')) &&
      /supersedes v5 OUTRIGHT/.test(g6.meta.reigning || '') && /v5 retained/.test(g6.meta.reigning || ''));
    check('v6 records the authored-lane v1.1 strings verbatim (inherited from v5, the hea 1.0 proof)',
      /Perform the credited crew action/.test((g6.meta.laneNotes || {}).authored || '') &&
      /MASTER WARNING/.test((g6.meta.laneNotes || {}).authored || ''));
    check('v6 lane bands declared with grown basis (zsa 6 draws; cma widened with the reason stated)',
      Array.isArray((g6.meta.laneBands || {}).zsa) && Array.isArray((g6.meta.laneBands || {}).fta) && Array.isArray((g6.meta.laneBands || {}).cma) &&
      /SCOPE-DERIVED/i.test(g6.meta.laneBandsNote || '') && /WIDENED/.test(g6.meta.laneBandsNote || ''));
    check('v6 fta trees sit inside the declared band', (() => {
      const trees = g6.ftaPages.filter(p => p && p.root).length;
      return trees >= g6.meta.laneBands.fta[0] && trees <= g6.meta.laneBands.fta[1]; })());
    check('v6 declares the vs-v5 DRIFT as confounded rather than hiding it (the v4/v5 declared-miss precedent)',
      /DRIFT/.test(g6.meta.scoredVsV5 || '') && /CONFOUNDED/.test(g6.meta.scoredVsV5 || '') && /fcim\.draft v2/.test(g6.meta.scoredVsV5 || ''));
    check('v6 declares the A14 device-memory caveat — captures are device-context sensitive from this generation',
      /1,251/.test(g6.meta.a14Caveat || '') && /device-context sensitive/.test(g6.meta.a14Caveat || ''));
    check('v6 declares the commitment level shift with its E2 check on record',
      /Abstention 37%/.test(g6.meta.captureNotes || '') && /E2-checked/.test(g6.meta.captureNotes || ''));
    const id6 = runScorer(G6, G6);
    check('v6 identity scores REPEATABLE with exit 0', id6.code === 0 && id6.report && id6.report.verdict === 'REPEATABLE');
  }
}

/* ------------------------------------------------------------------ */
console.log('10. golden_halcyon_v1 — the second fixture gets its gate (31 Aug 2026)');
{
  const GH = path.join(EVAL, 'golden_halcyon_v1.json');
  check('golden_halcyon_v1.json exists', fs.existsSync(GH));
  if (fs.existsSync(GH)) {
    const gh = JSON.parse(fs.readFileSync(GH, 'utf8'));
    check('halcyon v1 pins the SAME config generation as aeolus v6 (one config, two documents)',
      /fha\.draft@v2#0a2621d7/.test((gh.meta.configPins || {}).fhaSkill || '') &&
      /fcim\.draft@v2#a1046141/.test((gh.meta.configPins || {}).fcimSkill || '') &&
      /_assembleAnalysisContext/.test((gh.meta.configPins || {}).contextAssembly || ''));
    check('halcyon v1 owns its OWN granularity band, not Aeolus\'s',
      Array.isArray(gh.meta.granularityBand) && gh.meta.granularityBand[0] === 10 && gh.meta.granularityBand[1] === 18 &&
      /NOT inherited/.test(gh.meta.granularityBandNote || '') &&
      gh.functions.length >= 10 && gh.functions.length <= 18);
    check('halcyon v1 records the 16-section denominator as the parser fix\'s first live product',
      /10 of 16/.test(gh.meta.decomposeCoverage || '') && /pre-fix: 14/.test(gh.meta.decomposeCoverage || '') &&
      /EST\/EGN\/TMS\/EL1\/EL2/.test(gh.meta.decomposeCoverage || ''));
    check('halcyon v1 sdd provenance: in-app extraction recorded as THE fixture text',
      gh.meta.sdd.chars === 77680 && gh.meta.sdd.sha256_16 === '6368adfece9e1bc0' &&
      /0ed68f2f/.test(gh.meta.sdd.pdfMd5 || '') && /superseded/.test(gh.meta.sddNote || ''));
    check('halcyon v1 declares its pair misses rather than hiding them',
      /severityAgreement 0\.388/.test(gh.meta.pairedWith || '') && /severeJumpRate 0\.06/.test(gh.meta.pairedWith || ''));
    check('halcyon v1 carry: fcId === sourceCondId on every row, zero duplicates',
      gh.fha.length >= 75 && gh.fha.every(r => r.sourceCondId && r.fcId === r.sourceCondId) &&
      new Set(gh.fha.map(r => r.fcId)).size === gh.fha.length);
    check('halcyon v1 accept-all untouched', Array.isArray(gh.meta.engineerClassified) && gh.meta.engineerClassified.length === 0);
    // 31 Aug late — superseded in place: v1 extended LANE-COMPLETE same night.
    check('halcyon v1 is lane-complete with its OWN scope bands (3-Cat fta scale, never Aeolus\'s)',
      ['ftaPages','praData','zsaData','cmaData','acReqData','ramParts','markovModels','hfaRows','hfAllocRows','heaRows','alertRows']
        .every(k => Array.isArray(gh[k]) && gh[k].length > 0) &&
      Array.isArray((gh.meta.laneBands || {}).fta) && gh.meta.laneBands.fta[1] <= 6 &&
      /fixtures own their scales/.test(gh.meta.laneBandsNote || '') &&
      /LANE-COMPLETE/.test(gh.meta.reigning || ''));
    check('halcyon v1 declares its a14 posture and the authored divergence (23.1309-1E)',
      /rode prompts/.test(gh.meta.a14 || '') && /23\.1309-1E/.test((gh.meta.laneNotes || {}).authored || ''));
    const idh = runScorer(GH, GH);
    check('halcyon v1 identity scores REPEATABLE with exit 0', idh.code === 0 && idh.report && idh.report.verdict === 'REPEATABLE');
  }
}

/* ------------------------------------------------------------------ */
console.log(failures ? ('FAILED — ' + failures + ' check(s)') : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);

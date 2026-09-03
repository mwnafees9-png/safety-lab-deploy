/*
 * regression_eval_hooks.test.js — F1 in-app repeatability hooks (30 Aug 2026).
 *
 * The scoring logic moved from eval/score_run.mjs into site/eval_core.js so
 * ONE instrument serves both the CLI and the product. This suite proves:
 *
 *  1. SINGLE SOURCE OF TRUTH. eval_core loads under Node (module.exports) AND
 *     as a browser script (window.SLABEvalCore) from the same bytes; the CLI
 *     is a thin shell that requires it (no scoring logic left in the .mjs).
 *  2. THE CORE IS THE SAME INSTRUMENT. Identity scores REPEATABLE on the real
 *     golden v2 fixture; a seeded defect still trips its metric through the
 *     in-app entry path (window shape), not just the CLI.
 *  3. THE HOOKS ARE WIRED. runRepeatabilityExport/_repeatabilitySnapshot read
 *     the live arrays and record the REQUEST model id as requestModel (the
 *     routing-key lesson); runRepeatabilityCheck goes through SLABEvalCore and
 *     both hooks are exported on the public AI object.
 *
 * Mutations proven red: scoring logic re-inlined in the CLI; hook bypasses the
 * core; snapshot drops an array; export block loses a hook.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const coreSrc = fs.readFileSync(path.join(SITE, 'eval_core.js'), 'utf8');
const aiSrc = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const mjsSrc = fs.readFileSync(path.join(ROOT, 'eval', 'score_run.mjs'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok   ' + name);
  else { failures++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

/* ------------------------------------------------------------------ */
console.log('1. one instrument, two loaders');

const nodeCore = require(path.join(SITE, 'eval_core.js'));
check('Node require exposes scoreRun/normalizeRun', typeof nodeCore.scoreRun === 'function' && typeof nodeCore.normalizeRun === 'function');

const bsb = { window: {}, console, Map, Set, Array, Object, String, Number, Math, JSON, RegExp };
vm.createContext(bsb);
vm.runInContext(coreSrc, bsb);
check('browser load attaches window.SLABEvalCore with the same api',
  bsb.window.SLABEvalCore && typeof bsb.window.SLABEvalCore.scoreRun === 'function');

check('the CLI is a thin shell over the core (requires site/eval_core.js)',
  /createRequire/.test(mjsSrc) && /eval_core\.js/.test(mjsSrc));
check('no scoring logic left in the CLI (metrics live in the core only)',
  !/severityAgreementClassified/.test(mjsSrc) && !/fhaSignatureMatchRate:\s*\{/.test(mjsSrc) &&
  /severityAgreementClassified/.test(coreSrc));

/* ------------------------------------------------------------------ */
console.log('2. the core is the same instrument (real fixture, executed)');

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval', 'golden_aeolus_v2.json'), 'utf8'));
const ident = nodeCore.scoreRun(golden, golden);
check('identity on golden v2 -> REPEATABLE, severity agreement 1',
  ident.verdict === 'REPEATABLE' && ident.metrics.severityAgreement.value === 1);

// seeded defect through the BROWSER-shaped entry
const mut = JSON.parse(JSON.stringify(golden));
mut.functions = mut.functions.slice(0, 8);   // the run-1 failure mode
bsb.__g = golden; bsb.__m = mut;
const mr = vm.runInContext('window.SLABEvalCore.scoreRun(__g, __m)', bsb);
check('coarse-decompose defect trips functionCount through the window api',
  mr.verdict === 'DRIFT' && mr.failures.includes('functionCount'), JSON.stringify(mr.failures));

/* ------------------------------------------------------------------ */
console.log('2b. lane-complete engine (30 Aug — "every single analysis, consistency will be key")');

{
  // one metric family for every lane; a lane absent from either run is
  // SKIPPED AND NAMED, never silently ignored
  check('every analysis lane is registered (core six + ram/markov/hfa + hfAlloc/hea/alerts + tasks/ergo)',
    ['fta','pra','zsa','cma','fmea','req','ram','markov','hfa','hfAlloc','hea','alerts','tasks','ergo'].every(l => nodeCore.LANES[l] && nodeCore.LANES[l].key));
  check('rowText concatenates ALL string fields — no lane vocabulary is guessed',
    /wheel braking/.test(nodeCore.rowText({ zoneId: 'Z-10', desc: 'wheel braking equipment', nested: { note: 'hydraulic line' } })) &&
    /hydraulic line/.test(nodeCore.rowText({ zoneId: 'Z-10', desc: 'wheel braking equipment', nested: { note: 'hydraulic line' } })));
  check('rowText skips provenance fields (aiModel/aiFeature/_internal)',
    !/opus/.test(nodeCore.rowText({ desc: 'braking', aiModel: 'claude-opus-4-8', _k: 'internal-opus' })));

  const zmk = n => Array.from({ length: n }, (_, i) => ({ zoneId: 'Z-' + i, desc: 'wheel braking equipment in zone', interference: 'hydraulic line near electrical bus' }));
  const fmk = n => Array.from({ length: n }, (_, i) => ({ name: 'FC-' + i + ' loss of wheel braking', linkedFhaIds: ['F' + i], mode: 'top-down' }));
  const base = { functions: golden.functions, fcim: golden.fcim, fha: golden.fha, assumptions: golden.assumptions, meta: golden.meta };
  const A = { ...base, zsaData: zmk(10), ftaPages: fmk(6) };
  const B = { ...base, zsaData: zmk(11), ftaPages: fmk(6) };
  const r = nodeCore.scoreRun(A, B);
  check('lanes present in both runs are scored with the SAME family (count + topicJaccard)',
    r.metrics.zsaCount && r.metrics.zsaCount.pass === true &&
    r.metrics.zsaTopicJaccard && r.metrics.zsaTopicJaccard.value === 1 &&
    r.metrics.ftaCount && r.metrics.ftaTopicJaccard);
  check('lanes with no data are skipped AND NAMED', r.skippedLanes.some(x => /^pra \(no data/.test(x)) && r.skippedLanes.some(x => /^cma/.test(x)));
  const C = { ...base, zsaData: zmk(10) };
  const rc = nodeCore.scoreRun(A, C);
  check('a lane present in only ONE run is named with both counts (never silently dropped)',
    rc.skippedLanes.some(x => /^fta \(present in only one run: golden 6, candidate 0\)/.test(x)), JSON.stringify(rc.skippedLanes));

  // seeded lane defects trip their own metric — same discipline as the FHA family
  const HOLLOW = { ...base, zsaData: zmk(10).map((z, i) => ({ zoneId: 'Q-' + i, desc: 'quux blob', interference: 'quux' })), ftaPages: fmk(6) };
  const rh = nodeCore.scoreRun(A, HOLLOW);
  check('topic-hollowed lane rows trip <lane>TopicJaccard', rh.verdict === 'DRIFT' && rh.failures.includes('zsaTopicJaccard'), JSON.stringify(rh.failures));
  const DROPPED = { ...base, zsaData: zmk(4), ftaPages: fmk(6) };
  const rd = nodeCore.scoreRun(A, DROPPED);
  check('a 60% lane row drop trips <lane>Count', rd.failures.includes('zsaCount'));

  // v1.4 (30 Aug) — per-lane granularity bands, fixture-owned (the zsa lesson
  // from the A/B: 18/18 vs the golden's 11 — a ±30% ratio around one draw
  // institutionalises that draw; a band owns the axis like functionCount's).
  const BANDED = { ...A, meta: { ...golden.meta, laneBands: { zsa: [8, 22] } } };
  const rb = nodeCore.scoreRun(BANDED, { ...base, zsaData: zmk(20), ftaPages: fmk(6) });
  check('a lane band in golden meta judges the CANDIDATE by the band (20 passes in [8,22] where ±30% of 10 would fail)',
    rb.metrics.zsaCount.pass === true && JSON.stringify(rb.metrics.zsaCount.band) === '[8,22]');
  const rb2 = nodeCore.scoreRun(BANDED, { ...base, zsaData: zmk(23), ftaPages: fmk(6) });
  check('outside the band trips <lane>Count', rb2.failures.includes('zsaCount'));
  check('lanes WITHOUT a band keep the ±30% family (fta unaffected)', rb.metrics.ftaCount.pass === true && rb.metrics.ftaCount.band === undefined);
  // 2 Sep 2026: 14 -> 19. tid/cd/sa/mfc (the four HF drafter stores that shipped with no
  // eval lane) and resources joined. Superseded in place with the date, per the standing
  // rule — the count is a census of the instrument, so it moves when the instrument does.
  // 30 Aug: 9 -> 12 (hfAlloc/hea/alerts), then 12 -> 14 (tasks/ergo — the
  // task-first correction: "it does not start with just an assumption").
  check('identity on golden v2 STILL REPEATABLE (all NINETEEN lanes skipped, named)',
    (() => { const ri = nodeCore.scoreRun(golden, golden); return ri.verdict === 'REPEATABLE' && ri.skippedLanes.length === 19; })());

  /* -- v1.2: RAM + HF lanes (30 Aug — "what about RAM and HF analyses?") -- */

  // nested stores resolve through the alt accessors from a RAW
  // project_documents.data shape — the same rows a snapshot exports flat
  const rawShape = { ...base,
    projectConfig: { ram: { predict: { env: 'AIC', rows: [
      { cat: 'Capacitor, Ceramic', qty: 4, quality: 'B2' },
      { cat: 'Resistor, Film', qty: 12, quality: 'B1' }] } },
      markovModels: [{ id: 'M1', name: 'Dual hydraulic pump set',
        states: [{ name: 'Both pumps operating' }, { name: 'One pump failed', isFailed: false }, { name: 'Total loss of hydraulic pressure', isFailed: true }],
        transitions: [{ from: 0, to: 1 }, { from: 1, to: 2 }] }] },
    acAssumptionsData: [
      { asmId: 'ASM-1', statement: 'Crew responds to the brake failure alert within 3 seconds', type: 'Human Factors', state: 'Proposed', hf: { direction: 'recovery', taskTimeS: 3 } },
      { asmId: 'ASM-2', statement: 'plain untyped note', state: 'Open' }],
    systemsData: [{ id: 'sys-brk', name: 'Braking', asm: [
      { asmId: 'ASM-3', statement: 'Uncredited braking distance holds', credited: '1e-5', uncredited: '1e-3', state: 'Proposed' }] }] };
  const nr = nodeCore.normalizeRun(rawShape);
  check('ram lane resolves from projectConfig.ram.predict.rows (alt accessor)',
    nr.ramParts.length === 2 && /Capacitor/.test(nodeCore.rowText(nr.ramParts[0])));
  check('markov lane resolves from projectConfig.markovModels', nr.markovModels.length === 1);
  check('HF-analyses stores resolve from projectConfig.hf.* (alt accessors)',
    (() => { const withHf = nodeCore.normalizeRun({ ...rawShape, projectConfig: { ...rawShape.projectConfig,
        hf: { alloc: { rows: [{ key: 'k1', subId: 'SF-001', allocation: 'crew', rationale: 'braking is crew-commanded' }] },
              hea: { rows: [{ heaId: 'HEA-001', errorMode: 'omission', task: 'arm spoilers' }] },
              alerts: { rows: [{ alertId: 'ALR-001', name: 'GEAR DISAGREE', priority: 'Warning' }] } } } });
      return withHf.hfAllocRows.length === 1 && withHf.heaRows.length === 1 && withHf.alertRows.length === 1; })());
  check('hfa lane = the product\'s HF_Register membership (typed or two-lane rows; untyped EXCLUDED; system-level asm INCLUDED)',
    nr.hfaRows.length === 2 && nr.hfaRows.some(a => a.asmId === 'ASM-3') && !nr.hfaRows.some(a => a.asmId === 'ASM-2'));
  check('a flat snapshot export of the SAME rows normalizes identically (filter applies to both sources)',
    (() => { const flat = nodeCore.normalizeRun({ ...base, ramParts: rawShape.projectConfig.ram.predict.rows,
      markovModels: rawShape.projectConfig.markovModels,
      hfaRows: rawShape.acAssumptionsData.concat(rawShape.systemsData[0].asm) });
      return flat.ramParts.length === 2 && flat.hfaRows.length === 2 && !flat.hfaRows.some(a => a.asmId === 'ASM-2'); })());

  // markov content lives two levels down — the lane's depth override reaches it
  check('markov rowText (lane depth) reaches state names, not just the model name',
    /hydraulic pressure/.test(nodeCore.rowText(rawShape.projectConfig.markovModels[0], nodeCore.LANES.markov.depth)));

  // the topic lexicon is BLIND to 217F part categories — identity must not
  // pass trivially, and a hollowed store must still trip. Token fallback.
  const rr = nodeCore.scoreRun(rawShape, rawShape);
  check('ram identity scores 1 via TOKEN fallback (lexicon-blind lane, enum-like store)',
    rr.metrics.ramCount.pass === true && rr.metrics.ramTopicJaccard.value === 1 && /TOKEN fallback/.test(rr.metrics.ramTopicJaccard.note));
  const ramHollow = JSON.parse(JSON.stringify(rawShape));
  ramHollow.projectConfig.ram.predict.rows = [{ cat: 'quux blob', qty: 4, quality: 'zz' }, { cat: 'quux', qty: 1, quality: 'zz' }];
  const rrh = nodeCore.scoreRun(rawShape, ramHollow);
  check('a hollowed RAM store trips ramTopicJaccard (cannot hide behind a blind lexicon)',
    rrh.failures.includes('ramTopicJaccard'), JSON.stringify(rrh.failures));
  check('hfa lane scores through the SAME family (topics live in the assumption text)',
    rr.metrics.hfaCount && rr.metrics.hfaTopicJaccard && rr.metrics.hfaTopicJaccard.value === 1);
}

/* ------------------------------------------------------------------ */
console.log('3. the hooks (wired + executed)');

function extractFn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(at, i + 1); }
  }
  return null;
}
const snapFn = extractFn(aiSrc, '_repeatabilitySnapshot');
const checkFn = extractFn(aiSrc, 'runRepeatabilityCheck');
check('_repeatabilitySnapshot + runRepeatabilityCheck extracted', !!snapFn && !!checkFn);

if (snapFn && checkFn) {
  const sb = {
    console, Date, Array, Object, String, JSON, Math, Set, Map, RegExp, Number,
    window: bsb.window,   // carries the REAL SLABEvalCore loaded above
    MODELS: { reason: 'claude-opus-4-8' },
    projectName: 'Hook test',
    projectConfig: {
      ram: { predict: { env: 'AIC', rows: [{ cat: 'Capacitor, Ceramic', qty: 4, quality: 'B2' }] } },
      markovModels: [{ id: 'M1', name: 'Pump set', states: [], transitions: [] }],
      hf: { alloc: { rows: [{ key: 'k1', allocation: 'crew' }] }, hea: { rows: [] }, alerts: { rows: [{ alertId: 'ALR-001' }] },
            tasks: { rows: [{ taskId: 'TASK-001', task: 'apply wheel braking', phase: 'Landing' }] }, ergo: { rows: [] } } },
    acFunctionsData: golden.functions, acFcimData: golden.fcim,
    acFhaData: golden.fha, aiAssumptions: golden.assumptions,
    acAssumptionsData: [{ asmId: 'ASM-1', statement: 'typed', type: 'Human Factors', state: 'Proposed' },
                        { asmId: 'ASM-2', statement: 'untyped', state: 'Open' }],
    systemsData: [{ id: 'sys-1', name: 'Braking', asm: [{ asmId: 'ASM-3', statement: 'sys-level', credited: '1e-5', uncredited: '1e-3' }] }],
    _toast: function () {},
    document: undefined,
  };
  vm.createContext(sb);
  vm.runInContext(snapFn + checkFn +
    ';globalThis.__snap = _repeatabilitySnapshot; globalThis.__check = runRepeatabilityCheck;', sb);
  const snap = vm.runInContext('__snap()', sb);
  check('snapshot reads all four live arrays',
    snap.functions.length === golden.functions.length && snap.fcim.length === golden.fcim.length &&
    snap.fha.length === golden.fha.length && snap.assumptions.length === golden.assumptions.length);
  check('snapshot records the REQUEST model id as requestModel (routing-key lesson)',
    snap.meta.requestModel === 'claude-opus-4-8' && snap.meta.project === 'Hook test');
  check('snapshot captures EVERY lane (core six + ram/markov/hfa + hfAlloc/hea/alerts keys present as arrays)',
    ['ftaPages','praData','zsaData','cmaData','fmeaData','acReqData','ramParts','markovModels','hfaRows','hfAllocRows','heaRows','alertRows','taskRows','ergoRows'].every(k => Array.isArray(snap[k])));
  check('snapshot flattens the NESTED stores (ram rows from projectConfig; hfaRows = aircraft + system asm, RAW/unfiltered — the core filters)',
    snap.ramParts.length === 1 && snap.markovModels.length === 1 && snap.hfaRows.length === 3);
  check('snapshot carries the HF-analyses stores too (alloc/hea/alerts + tasks/ergo)',
    snap.hfAllocRows.length === 1 && snap.heaRows.length === 0 && snap.alertRows.length === 1 &&
    snap.taskRows.length === 1 && snap.ergoRows.length === 0);
  sb.__golden = golden;
  const rep = vm.runInContext('__check(__golden)', sb);
  check('EXECUTED: check against the live project scores through SLABEvalCore',
    rep && rep.verdict === 'REPEATABLE' && rep.metrics.severityAgreement.value === 1);
  const repStr = vm.runInContext('__check(JSON.stringify(__golden))', sb);
  check('a golden passed as a JSON string works too', repStr && repStr.verdict === 'REPEATABLE');
  const noCore = vm.runInContext('window.SLABEvalCore = null; __check(__golden)', sb);
  check('missing core degrades to a toast + null, never a throw', noCore === null);
}

check('both hooks exported on the public AI object',
  /runRepeatabilityExport: runRepeatabilityExport/.test(aiSrc) &&
  /runRepeatabilityCheck: runRepeatabilityCheck/.test(aiSrc));
check('runRepeatabilityCheck goes through SLABEvalCore, not a private copy',
  /window\.SLABEvalCore/.test(checkFn || '') && /core\.scoreRun\(golden, candidate \|\| _repeatabilitySnapshot\(\)\)/.test(checkFn || ''));

/* ------------------------------------------------------------------ */
console.log('4. pins (floors) + load order');
function pin(src, re) { const m = src.match(re); return m ? parseFloat(m[1]) : -1; }
check('eval_core pin floor >= 1.5 (tasks/ergo lanes)', pin(indexSrc, /eval_core\.js\?v=([\d.]+)/) >= 1.5);
check('eval_core loads BEFORE ai_loader',
  indexSrc.indexOf('eval_core.js?v=') > 0 && indexSrc.indexOf('eval_core.js?v=') < indexSrc.indexOf('ai_loader.js?v='));
check('ai_loader pin floor >= 7.4', pin(indexSrc, /ai_loader\.js\?v=([\d.]+)/) >= 7.4);
const loaderSrc = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8');
check('ai_assistant pin floor >= 75.2 (inside ai_loader)', pin(loaderSrc, /ai_assistant\.js\?v=([\d.]+)/) >= 75.2);

// ---------------------------------------------------------------------------
// THE CAPTURE MUST EXPORT EVERY LANE THE SCORER KNOWS (2 Sep 2026).
//
// Found by mutation, not by reasoning: deleting a key from _repeatabilitySnapshot left
// every suite green. A lane the scorer knows and the capture does not export is skipped
// in every run and NAMED as "no data in either run" — which reads as "the project had
// none", not as "we never captured it". That is the worst failure an instrument can have:
// it reports a silence as a measurement. The two halves are pinned to each other here.
{
  const laneKeys = Object.keys(nodeCore.LANES || {}).map(k => nodeCore.LANES[k].key);
  const snapSrc = (aiSrc.match(/function _repeatabilitySnapshot\(\)[\s\S]*?\n    \}/) || [''])[0];
  check('the snapshot function was located for the export census', snapSrc.length > 500);
  const missing = laneKeys.filter(k => !new RegExp('\\b' + k + ':').test(snapSrc));
  check('every scored lane key is exported by _repeatabilitySnapshot', missing.length === 0,
    missing.length ? ('not captured: ' + missing.join(', ')) : '');
}

console.log(failures ? ('FAILED — ' + failures + ' check(s)') : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);

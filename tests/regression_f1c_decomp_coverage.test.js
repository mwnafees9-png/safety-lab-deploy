/*
 * regression_f1c_decomp_coverage.test.js — F1c + provenance stamps (30 Aug 2026).
 *
 * Three fixes from the arch.decompose@v2 validation batch, all executed here:
 *
 *  1. DECOMPOSE COVERAGE FROM THE DOCUMENT. A validation run silently omitted
 *     the nose-door system. The document's own numbered section list is the
 *     denominator: _decompSectionChecklist parses it (grouping mirrored
 *     chapters by system code), _decompCoverage checks which sections the
 *     drafted rows cite, and the misses ride the SAME coverage banner the FHA
 *     lanes use. Advisory: warns, never blocks.
 *  2. LANE PROVENANCE THROUGH THE CHAT EXECUTOR. Batch-accepted rows carried
 *     aiFeature 'chat.edit' with an empty skill stamp — the lane identity died
 *     at the executor boundary. _chatRunActions now declares its lane for the
 *     duration of the apply (_chatExecFeature), writers stamp via _chatProv().
 *  3. THE MODEL ID IS A ROUTING KEY (learned the hard way, same day). The
 *     first cut of this suite demanded the default move to 'claude-fable-5'
 *     as a provenance cleanup. Deployed, the F1c banner immediately showed
 *     7/14-system drafts; a controlled A/B (same project, same SDD, only the
 *     requested id changed) proved the id routes to a different serving
 *     config. The default stays 'claude-opus-4-8' — the known-good routing
 *     key — and changing it is an eval-gated methodology change, never a
 *     cleanup. Row aiModel records the REQUEST id; the truly-served model is
 *     a proxy-side fact (OPEN_ITEMS).
 *
 * Mutations proven red at build time: checklist parser dropped; coverage
 * wiring removed; _chatProv fallback broken; feature not reset after apply;
 * routing key silently changed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = path.join(__dirname, '..', 'site');
const aiSrc = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const loaderSrc = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok   ' + name);
  else { failures++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

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

/* ------------------------------------------------------------------ */
console.log('1. document section checklist + coverage (executed)');

const nonfunc = aiSrc.match(/var _DECOMP_NONFUNC = .*;/);
const listFn = extractFn(aiSrc, '_decompSectionChecklist');
const covFn = extractFn(aiSrc, '_decompCoverage');
check('_DECOMP_NONFUNC + _decompSectionChecklist + _decompCoverage extracted',
  !!nonfunc && !!listFn && !!covFn);

if (nonfunc && listFn && covFn) {
  const sb = { console, Map, Array, RegExp, String, Object, JSON };
  vm.createContext(sb);
  vm.runInContext(nonfunc[0] + listFn + covFn +
    ';globalThis.__l = _decompSectionChecklist; globalThis.__c = _decompCoverage;', sb);
  const run = (fn, ...args) => vm.runInContext(
    'JSON.stringify(' + fn + '(' + args.map(a => JSON.stringify(a)).join(',') + '))', sb);

  // shaped like real extracted PDF text: run-on lines, mirrored chapters,
  // subsection numbers adjacent to section numbers
  const doc = '1.1 Mission & Operating Concept blah. 2.1 System Inventory x. ' +
    '5.1 Propulsion (PRP) four turbofans 5.1.1 Purpose y 5.1.2 Description & Architecture z. ' +
    '5.2 Fuel System (FUE) tanks. 5.3 Nose Cargo Door (NZD) visor. 5.4 Crew Oxygen (OXY) masks. ' +
    '6.1 Propulsion (PRP) failure modes. 6.3 Nose Cargo Door (NZD) reconfiguration.';
  const groups = JSON.parse(run('__l', doc));
  check('parses the system sections, one group per system code',
    groups.length === 4 && groups.map(g => g.title).join('|') ===
    'Propulsion (PRP)|Fuel System (FUE)|Nose Cargo Door (NZD)|Crew Oxygen (OXY)',
    JSON.stringify(groups.map(g => g.title)));
  check('mirrored chapters land in ONE group (5.x + 6.x by code)',
    groups[0].secs.join(',') === '5.1,6.1' && groups[2].secs.join(',') === '5.3,6.3');
  check('non-functional sections filtered (mission/inventory never in the denominator)',
    !groups.some(g => /Mission|Inventory/i.test(g.title)));
  check('subsection numbers do not leak into the checklist (the 5.1.2 -> "1.2" bug)',
    !groups.some(g => g.secs.some(s2 => s2 === '1.2')));

  const actions = [
    { op: 'add_function', subName: 'Provide thrust', subDef: 'Four turbofans (§5.1.2), fuel per §5.2.' },
    { op: 'add_function', subName: 'Supply oxygen', subDef: 'Per §5.4.' },
    { op: 'add_requirement', text: 'a requirement citing §5.3 must NOT credit the section' },
  ];
  const cov = JSON.parse(run('__c', doc, actions));
  check('coverage: subsection citation credits its section (§5.1.2 -> 5.1)',
    cov.covered === 3 && cov.total === 4, JSON.stringify(cov));
  check('the omitted system is NAMED in missing', cov.missing.length === 1 && /NZD/.test(cov.missing[0]));
  check('non-function ops never credit coverage', /NZD/.test(cov.missing[0]));
  check('noun says what the denominator is', cov.noun === 'document system section');

  const covPrefix = JSON.parse(run('__c', doc,
    [{ op: 'add_function', subDef: 'generator output 15.1 kW at cruise' }]));
  check('"15.1" does not credit section 5.1 (guarded prefix match)',
    covPrefix.missing.some(t => /PRP/.test(t)), JSON.stringify(covPrefix.missing));

  check('a structureless document yields NO banner rather than a wrong one',
    vm.runInContext('__c("prose without numbered sections", [])', sb) === null);

  check('wired into _anemBatch for the decompose lane only',
    /if \(!_coverage && cfg\.analysis === 'arch\.decompose' && cfg\.context\) \{\s*\n\s*_coverage = _decompCoverage\(cfg\.context, actions\);/.test(aiSrc));
}

/* ------------------------------------------------------------------ */
console.log('2. lane provenance through the chat executor (executed)');

const provFn = extractFn(aiSrc, '_chatProv');
check('_chatProv extracted', !!provFn);
check('census: no writer carries a literal chat.edit stamp any more',
  !/aiFeature: 'chat\.edit'/.test(aiSrc), 'a bare literal bypasses the lane declaration');
check('all four chat writers stamp via _chatProv', (aiSrc.match(/\.\.\._chatProv\(model\)/g) || []).length === 4);

if (provFn) {
  const sb2 = { console, Date, Object };
  vm.createContext(sb2);
  vm.runInContext(
    "var _stamps = { 'arch.decompose': 'arch.decompose@v2#deadbeef', 'chat.edit': '' };" +
    'function _skillStampFor(f) { return _stamps[f] || ""; }' +
    "var _chatExecFeature = '';" + provFn +
    ';globalThis.__p = function (f, m) { _chatExecFeature = f; var r = _chatProv(m); _chatExecFeature = ""; return r; };', sb2);
  const p1 = vm.runInContext("__p('', 'm1')", sb2);
  check('no declared lane -> chat.edit with empty skill (plain chat unchanged)',
    p1.aiFeature === 'chat.edit' && p1.aiSkill === '' && p1.aiGenerated === true && p1.aiModel === 'm1');
  const p2 = vm.runInContext("__p('arch.decompose', 'm2')", sb2);
  check('declared lane -> feature AND its skill stamp land on the row',
    p2.aiFeature === 'arch.decompose' && p2.aiSkill === 'arch.decompose@v2#deadbeef');
}

// the declaration + reset mechanics inside _chatRunActions
const runFn = extractFn(aiSrc, '_chatRunActions');
check('_chatRunActions extracted', !!runFn);
if (runFn) {
  check("declares the lane from its feature arg (never for plain 'chat.edit')",
    /_chatExecFeature = \(feature && feature !== 'chat\.edit'\) \? String\(feature\) : '';/.test(runFn));
  check('reset is in a FINALLY — a throwing action cannot leak the lane into later plain chat',
    /finally \{ _chatExecFeature = ''; \}/.test(runFn));
  check('batch accept passes cfg.analysis into the executor',
    /_chatRunActions\(\[a\], \(attempt\.rr && attempt\.rr\.model\) \|\| MODELS\.reason, undefined, cfg\.analysis\)/.test(aiSrc));

  // executed end-to-end: a fake add_function through the real executor
  const sb3 = {
    console, Date, Object, Array, String, JSON, Math,
    window: {},
    acFunctionsData: [],
  };
  vm.createContext(sb3);
  const preamble = `
    var _stamps = { 'arch.decompose': 'arch.decompose@v2#deadbeef' };
    function _skillStampFor(f) { return _stamps[f] || ''; }
    function _validateArtifact() { return []; }
    function _opLaneBlocked() { return ''; }
    function newRowId() { return 'id-' + (acFunctionsData.length + 1); }
    function _chatClip(s) { return String(s || ''); }
    function _chatSysByIdOrName() { return null; }
    function _chatSysById() { return null; }
    var _slAutoNumber, _fallbackFuncIds, renderACFunctions;
  `;
  const provVar = "var _chatExecFeature = '';";
  const addFn = extractFn(aiSrc, '_chatAddFunction');
  try {
    vm.runInContext(preamble + provVar + provFn + addFn + runFn +
      ';globalThis.__run = _chatRunActions; globalThis.__feat = function(){ return _chatExecFeature; };', sb3);
    vm.runInContext("__run([{ op: 'add_function', subName: 'Lock nose door', subDef: 'Per §5.7.' }], 'test-model', undefined, 'arch.decompose')", sb3);
    const row = vm.runInContext('acFunctionsData[0]', sb3);
    check('EXECUTED: batch-accepted function row carries the LANE, not chat.edit',
      row && row.aiFeature === 'arch.decompose' && row.aiSkill === 'arch.decompose@v2#deadbeef',
      row && JSON.stringify({ f: row.aiFeature, s: row.aiSkill }));
    check('EXECUTED: lane cleared after the apply', vm.runInContext('__feat()', sb3) === '');
    vm.runInContext("__run([{ op: 'add_function', subName: 'Plain chat add' }], 'test-model')", sb3);
    const row2 = vm.runInContext('acFunctionsData[1]', sb3);
    check('EXECUTED: plain chat apply still stamps chat.edit', row2 && row2.aiFeature === 'chat.edit');
  } catch (e) {
    check('executor harness ran', false, e.message);
  }
}

/* ------------------------------------------------------------------ */
console.log('3. honest model stamp');

{
  // execute the getter both ways rather than pinning source shape
  const m = aiSrc.match(/const MODELS = \{[\s\S]*?\n    \};/);
  check('MODELS block extracted', !!m);
  if (m) {
    const sb4 = { projectConfig: undefined };
    vm.createContext(sb4);
    vm.runInContext(m[0] + ';globalThis.__r = function(){ return MODELS.reason; };', sb4);
    const def = vm.runInContext('__r()', sb4);
    // 30 Aug, hours after this suite first shipped the opposite check: the id is
    // the PROXY'S ROUTING KEY, not a label. A/B on prod showed 'claude-fable-5'
    // routing to a config that drafted 7/14 document systems vs opus-4-8's
    // 10/14+ (the F1c banner caught it). The default must stay the routing key
    // that serves the known-good config; changing it is a methodology change
    // gated by the eval harness, not a provenance cleanup.
    check('default reason model is the known-good routing key', def === 'claude-opus-4-8', def);
    vm.runInContext("projectConfig = { aiSettings: { anthropicModel: 'user-choice' } };", sb4);
    check('the AI Settings dropdown still wins over the default',
      vm.runInContext('__r()', sb4) === 'user-choice');
  }
}

/* ------------------------------------------------------------------ */
console.log('4. pins (floors)');
function pin(src, re) { const m2 = src.match(re); return m2 ? parseFloat(m2[1]) : -1; }
check('ai_loader pin floor >= 6.6 (model-key revert)', pin(indexSrc, /ai_loader\.js\?v=([\d.]+)/) >= 6.6);
check('ai_assistant pin floor >= 74.4 (inside ai_loader)', pin(loaderSrc, /ai_assistant\.js\?v=([\d.]+)/) >= 74.4);

console.log(failures ? ('FAILED — ' + failures + ' check(s)') : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);

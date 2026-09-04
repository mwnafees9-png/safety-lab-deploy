/*
 * regression_ai_skills.test.js — Skills V1 (29 Aug 2026)
 *
 * ai_skills.js is now the canonical home of the drafting instructions each AI
 * lane runs with; ai_assistant.js keeps inline fallback copies. The single
 * load-bearing invariant of V1 is NO PROMPT DRIFT: registry present or absent,
 * the model receives byte-identical instructions. Everything else here guards
 * the provenance stamping that the registry adds on top.
 *
 *  1. Registry integrity — 18 skills, hash = fnv1a(body), stamp format.
 *  2. PARITY — for every feature key in the inline _FEATURE_SPECS, the registry
 *     returns the byte-identical body; and the registry maps no feature the
 *     inline table does not. Both sides extracted and EXECUTED, not pattern-matched.
 *  3. Engine bridge — _skillBodyFor/_skillStampFor executed: registry-first,
 *     noteUse recorded, clean null fallback without a registry.
 *  4. Ledger stamping — safety_lab.js SafetyLabAiAssumptions.add() executed:
 *     new entries carry skill = stampFor(analysis); '' without a registry;
 *     dedup re-add does not fabricate a stamp on an existing entry.
 *  5. Wiring + pins — ai_skills.js loads from index.html before ai_loader;
 *     pins as floors: ai_skills>=1.0, ai_loader>=5.9, safety_lab>=65.46,
 *     ai_assistant>=73.7 (inside ai_loader — the pin-behind-pin).
 *
 * Mutations proven red at build time: tampered registry body; deleted
 * featureMap key; extra featureMap key; noteUse call removed; skill field
 * removed from add(); unbumped ai_loader pin.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = path.join(__dirname, '..', 'site');
const skillsSrc = fs.readFileSync(path.join(SITE, 'ai_skills.js'), 'utf8');
const aiSrc = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const slabSrc = fs.readFileSync(path.join(SITE, 'safety_lab.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const loaderSrc = fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok   ' + name);
  else { failures++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function loadRegistry() {
  const sb = { window: {}, console: { info: function () {} } };
  vm.createContext(sb);
  vm.runInContext(skillsSrc, sb);
  return sb.window.SLABSkills;
}

/* ------------------------------------------------------------------ */
console.log('1. registry integrity');
const S = loadRegistry();
check('registry loads and exports SLABSkills', !!S);
// 19 -> 21 (Skills V1.3, 2 Sep 2026): hf.draftlane + hf.improve registered. They were
// live feature ids outside this registry, so their prompts were unversioned, unhashed and
// unstamped — the blocking item of the HF consistency campaign. Superseded in place, not
// edited silently.
// 21 -> 23 (Skills V1.3, later the same day): ram.fracas.draft + ram.msg3.rationale, the
// two prose-only RAM drafters in ram_ai.js, found unregistered by the Phase 4 census.
// 23 -> 24 (F15, 4 Sep 2026): arch.systems — systems + their functions from the SDD.
check('27 skills registered (V1.3: hf.draftlane + hf.improve, the two RAM prose drafters; F15: arch.systems, arch.items, mac.draft, coffe.draft)', S && Object.keys(S.skills).length === 27);
if (S) {
  // 29 Aug (V1.1) - Waqas ruling: EACH analysis is its own skill. SFHA gets its
  // own identity; body intentionally byte-identical to fha.draft TODAY (one App
  // A + App C text), so same hash, different id - free to diverge with its own
  // version the day the instructions split.
  check('sfha.draft has its own identity', /^sfha\.draft@v\d+#[0-9a-f]{8}$/.test(S.stampFor('sfha.populate')), S.stampFor('sfha.populate'));
  check('sfha.draft body shares fha.draft bytes (deliberate, until they diverge)',
    S.skills['sfha.draft'] && S.skills['fha.draft'] && S.skills['sfha.draft'].body === S.skills['fha.draft'].body);
}
if (S) {
  let hashOk = true, shapeOk = true;
  for (const id of Object.keys(S.skills)) {
    const sk = S.skills[id];
    if (!(sk.id === id && sk.version >= 1 && typeof sk.body === 'string' && sk.body.length > 200)) shapeOk = false;
    if (sk.hash !== S.hash(sk.body) || !/^[0-9a-f]{8}$/.test(sk.hash)) hashOk = false;
  }
  check('every skill: id/version/body shape', shapeOk);
  check('every skill: hash === fnv1a(body), 8-hex', hashOk);
  check('hash function pinned vector', S.hash('abc') === '1a47e90b',
    S.hash('abc'));
  check('stamp format skillId@vN#hash', /^fha\.draft@v\d+#[0-9a-f]{8}$/.test(S.stampFor('fha.populate')),
    S.stampFor('fha.populate'));
  check('unknown feature -> empty stamp, null body', S.stampFor('nope.x') === '' && S.bodyFor('nope.x') === null);
  // ---- V2 (29 Aug): certification-basis variant mechanics, executed with a
  // SYNTHETIC variant injected at test time (no variants ship in the file —
  // the empty _VARIANTS object is deliberate; authoring one is a methodology
  // change gated by the eval harness).
  check('registryVersion is 2', S.registryVersion === 2);
  check('no variants ship tonight (all skills carry empty variants)',
    Object.keys(S.skills).every(id => S.skills[id].variants && Object.keys(S.skills[id].variants).length === 0));
  check('basisFrom mirrors the engine: Part 25 default / Part 23 + class',
    S.basisFrom(null) === 'Part 25' && S.basisFrom({ regulation: 'Part 25' }) === 'Part 25' &&
    S.basisFrom({ regulation: 'Part 23' }) === 'Part 23 IV' &&
    S.basisFrom({ regulation: 'Part 23', part23Class: 'I' }) === 'Part 23 I');
  (function () {
    const S2 = loadRegistry();
    S2.skills['fha.draft'].variants['Part 23 IV'] = { version: 4, body: 'SYNTHETIC PART-23 BODY FOR THE MECHANISM TEST' };
    const rBase = S2.resolve('fha.populate', 'Part 25');
    const rVar = S2.resolve('fha.populate', 'Part 23 IV');
    check('base basis resolves the base body (variant null)',
      rBase && rBase.variant === null && rBase.body === S2.skills['fha.draft'].body);
    check('matching basis resolves the VARIANT body with its own hash',
      rVar && rVar.variant === 'Part 23 IV' && rVar.body.indexOf('SYNTHETIC') === 0 &&
      rVar.hash === S2.hash(rVar.body) && rVar.hash !== S2.skills['fha.draft'].hash);
    check('variant stamp carries the basis: id[basis]@vN#hash',
      /^fha\.draft\[Part 23 IV\]@v[4-9]#[0-9a-f]{8}$/.test(S2.stampFor('fha.populate', 'Part 23 IV')),
      S2.stampFor('fha.populate', 'Part 23 IV'));
    // 30 Aug 2026 — v2 shipped on take 3 (#0a2621d7).
    check('base stamp stays bracket-free on the same registry',
      /^fha\.draft@v[4-9]#[0-9a-f]{8}$/.test(S2.stampFor('fha.populate', 'Part 25')));
    check('unknown basis falls back to base, never to nothing',
      S2.bodyFor('fha.populate', 'Part 99 Z') === S2.skills['fha.draft'].body);
    check('noteUse records the basis', (S2.noteUse('fha.populate', 'Part 23 IV'), S2.used()[0].basis === 'Part 23 IV'));
  })();
}

/* ------------------------------------------------------------------ */
console.log('2. parity registry <-> inline (the no-drift invariant)');

// Evaluate every inline _SPEC_* and the inline _FEATURE_SPECS map from
// ai_assistant.js source, in isolation.
function extractInlineSpecs(src) {
  const names = [...src.matchAll(/const (_SPEC_[A-Z_]+) = \[/g)].map(m => m[1]);
  const sb = {};
  vm.createContext(sb);
  for (const name of names) {
    const start = src.indexOf('const ' + name + ' = [');
    const open = src.indexOf('[', start);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '[') depth++;
      else if (src[i] === ']') { depth--; if (!depth) { end = i; break; } }
    }
    vm.runInContext(src.slice(start, end + 1) + ".join('\\n');", sb);
  }
  // the map itself
  const mapAt = src.indexOf('const _FEATURE_SPECS = {');
  const mapOpen = src.indexOf('{', mapAt);
  let d = 0, mapEnd = -1;
  for (let i = mapOpen; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) { mapEnd = i; break; } }
  }
  vm.runInContext('globalThis.__map = ' + src.slice(mapOpen, mapEnd + 1) + ';', sb);
  return vm.runInContext('__map', sb);
}

const inlineMap = extractInlineSpecs(aiSrc);
check('inline _FEATURE_SPECS extracted', inlineMap && Object.keys(inlineMap).length >= 18);
if (S && inlineMap) {
  const inlineKeys = Object.keys(inlineMap).sort();
  // The two RAM prose skills keep their inline fallback in ram_ai.js, not in the engine's
  // _FEATURE_SPECS — that module composes its own prompts and never goes through the
  // assembler. Their byte-parity is pinned in regression_ram_determinism [d]; here they
  // are excluded from the ENGINE parity set rather than pretended to live in it.
  const RAM_PROSE = ['ram.fracas.draft', 'ram.msg3.rationale'];
  const regKeys = Object.keys(S.featureMap).filter(k => RAM_PROSE.indexOf(k) < 0).sort();
  check('the RAM prose skills are registered (parity checked in their own suite)', RAM_PROSE.every(k => S.featureMap[k] === k && S.skills[k]));
  check('feature keys identical sets (' + inlineKeys.length + ')',
    JSON.stringify(inlineKeys) === JSON.stringify(regKeys),
    'inline-only: ' + inlineKeys.filter(k => !regKeys.includes(k)) +
    ' registry-only: ' + regKeys.filter(k => !inlineKeys.includes(k)));
  let par = true, firstBad = '';
  for (const k of inlineKeys) {
    if (S.bodyFor(k) !== inlineMap[k]) { par = false; firstBad = firstBad || k; }
  }
  check('every feature body BYTE-IDENTICAL registry vs inline', par, firstBad);
  // V2 — with the shipped (empty) variant set, resolution at ANY basis must
  // still return the inline bytes: the mechanism cannot move a prompt until a
  // variant is deliberately authored.
  let par23 = true;
  for (const k of inlineKeys) {
    if (S.bodyFor(k, 'Part 23 IV') !== inlineMap[k] || S.bodyFor(k, 'Part 25') !== inlineMap[k]) { par23 = false; break; }
  }
  check('parity holds at every basis while no variants ship', par23);
}

/* ------------------------------------------------------------------ */
console.log('3. engine bridge executed');

function extractFn(src, name) {
  const at = src.indexOf('function ' + name);
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(at, i + 1); }
  }
  return null;
}
const bodyForFn = extractFn(aiSrc, '_skillBodyFor');
const stampForFn = extractFn(aiSrc, '_skillStampFor');
const basisFn = extractFn(aiSrc, '_skillBasisKey');
check('_skillBasisKey extracted', !!basisFn);
check('_skillBodyFor extracted', !!bodyForFn);
check('_skillStampFor extracted', !!stampForFn);
if (bodyForFn && stampForFn) {
  const uses = [];
  const calls = [];
  const sb = {
    window: { SLABSkills: { bodyFor: (f, bk) => { calls.push(['body', f, bk]); return f === 'fha.populate' ? 'REG-BODY' : null; },
                            stampFor: (f, bk) => { calls.push(['stamp', f, bk]); return f === 'fha.populate' ? 'fha.draft@v1#deadbeef' : ''; },
                            noteUse: (f, bk) => uses.push([f, bk]) } },
  };
  vm.createContext(sb);
  // V2: the engine resolves the basis via _certBasisKey — supplied here
  vm.runInContext("function _certBasisKey(){ return 'Part 23 IV'; }" + basisFn + bodyForFn + stampForFn +
    ';globalThis.__b = _skillBodyFor; globalThis.__s = _skillStampFor;', sb);
  check('registry-first body wins', vm.runInContext('__b("fha.populate")', sb) === 'REG-BODY');
  check('use is RECORDED via noteUse WITH the basis', uses.length === 1 && uses[0][0] === 'fha.populate' && uses[0][1] === 'Part 23 IV');
  check('engine passes the project basis to the registry', calls.some(c => c[0] === 'body' && c[2] === 'Part 23 IV'));
  check('unmapped feature falls through to null', vm.runInContext('__b("chat.edit")', sb) === null);
  check('stamp resolves through registry', vm.runInContext('__s("fha.populate")', sb) === 'fha.draft@v1#deadbeef');
  // no registry at all -> clean nulls, no throw
  const sb2 = { window: {} };
  vm.createContext(sb2);
  vm.runInContext(bodyForFn + stampForFn + ';globalThis.__b = _skillBodyFor; globalThis.__s = _skillStampFor;', sb2);
  check('absent registry -> null body, null stamp, no throw',
    vm.runInContext('__b("fha.populate")', sb2) === null && vm.runInContext('__s("fha.populate")', sb2) === null);
}
// wiring — F2, 31 Aug 2026, superseded in place: the two injection sites the
// 29 Aug pins guarded became ONE. _assembleAnalysisContext is the single home
// of the registry-first read, and BOTH paths call it (regression_spec_reachability
// pins that wiring). The census floor drops to 1 accordingly — and a SECOND
// read appearing again is now the regression to catch, not the fix.
check('the ONE assembler reads registry-first with inline fallback',
  aiSrc.includes('_skillBodyFor(feature) || _FEATURE_SPECS[feature]'));
check('both paths reach that read through _assembleAnalysisContext',
  aiSrc.includes('opts.system = await _assembleAnalysisContext(opts.feature, opts.system, opts);') &&
  /const _sysExtra = await _assembleAnalysisContext\(cfg\.analysis \|\| ''/.test(aiSrc));
(function () {
  const reads = [...aiSrc.matchAll(/_FEATURE_SPECS\[/g)];
  const bare = reads.filter(m => !/\|\|\s*$/.test(aiSrc.slice(Math.max(0, m.index - 4), m.index)));
  check('census: exactly ONE _FEATURE_SPECS[...] read, and it is the FALLBACK arm (' + reads.length + ' read(s))',
    reads.length === 1 && bare.length === 0,
    bare.length + ' bare read(s) / ' + reads.length + ' total — a spec path is bypassing the assembler');
})();
check('FHA rows stamped (aiSkill)', /aiSkill: _skillStampFor\(sysScoped \? 'sfha\.populate' : 'fha\.populate'\)/.test(aiSrc));
check('FCIM rows stamped (aiSkill)', /aiSkill: _skillStampFor\('fcim\.populate'\)/.test(aiSrc));

// V1.1 - EVERY writer site carries the stamp. Census over the whole engine:
// each `aiGenerated: true, aiFeature:` writer must carry aiSkill in the same
// statement (200 chars is well past the longest writer literal).
// 30 Aug 2026 (F1c): the four chat-executor writers now stamp via
// ..._chatProv(model) — lane-aware, executed in regression_f1c_decomp_coverage —
// so the literal count dropped 19 -> 16 (four literals out, one in _chatProv in).
// Both shapes are censused; anything outside both shapes is an unstamped writer.
(function () {
  const sites = [...aiSrc.matchAll(/aiGenerated: true, aiFeature:/g)];
  const unstamped = sites.filter(m => !/aiSkill:/.test(aiSrc.slice(m.index, m.index + 260)));
  check('census: all ' + sites.length + ' literal writer sites carry aiSkill', sites.length >= 16 && unstamped.length === 0,
    unstamped.length + ' unstamped writer site(s)');
  const prov = (aiSrc.match(/\.\.\._chatProv\(model\)/g) || []).length;
  check('census: the four chat-executor writers stamp via _chatProv', prov === 4, prov + ' spread site(s)');
  check('census: no writer regressed to a literal chat.edit stamp', !/aiFeature: 'chat\.edit'/.test(aiSrc));
})();
// stpa_ai_apply.js is a separate module - guarded window access, own pin
(function () {
  const stpaSrc = fs.readFileSync(path.join(SITE, 'stpa_ai_apply.js'), 'utf8');
  check('stpa_ai_apply stamps aiSkill through the guarded window path',
    /aiSkill: \(typeof window !== 'undefined' && window\.SLABSkills && window\.SLABSkills\.stampFor\)/.test(stpaSrc));
})();
// V1.1 - the stamp is VISIBLE: _skillLine executed, and wired into the panel
(function () {
  const fn = extractFn(aiSrc, '_skillLine');
  check('_skillLine extracted', !!fn);
  if (!fn) return;
  const sb = { window: { SLABSkills: { stampFor: f => (f === 'fha' ? 'fha.draft@v1#deadbeef' : '') } } };
  vm.createContext(sb);
  vm.runInContext(
    "function _skillStampFor(f){ try { return (window.SLABSkills && window.SLABSkills.stampFor(f)) || null; } catch(_) { return null; } }" +
    "function _esc(x){ return String(x); }" + fn + ";globalThis.__l = _skillLine;", sb);
  const html = vm.runInContext("__l({ analysis: 'fha' })", sb);
  check('_skillLine renders the stamp for a mapped analysis', /rv-skillstamp/.test(html) && /fha\.draft@v1#deadbeef/.test(html), html.slice(0, 60));
  check('_skillLine renders NOTHING for spec-less panels', vm.runInContext("__l({})", sb) === '' && vm.runInContext("__l(null)", sb) === '');
  check('panel builder wired: _skillLine(cfg) in _makeReviewPanel html', /_skillLine\(cfg\) \+/.test(aiSrc));
  // 29 Aug (third deploy's live find): the anem-batch panel cfg must PROPAGATE
  // cfg.analysis or the primary path renders no stamp line on screen.
  check('anem-batch panel propagates cfg.analysis to the builder',
    /id: 'ai-rev-anem-batch',[\s\S]{0,600}analysis: cfg\.analysis,/.test(aiSrc));
})();

/* ------------------------------------------------------------------ */
console.log('4. assumption ledger stamping executed');

// extract the whole `window.SafetyLabAiAssumptions = { ... };` assignment
(function () {
  const at = slabSrc.indexOf('window.SafetyLabAiAssumptions = {');
  check('ledger object found in safety_lab.js', at >= 0);
  if (at < 0) return;
  const open = slabSrc.indexOf('{', at);
  let depth = 0, end = -1;
  for (let i = open; i < slabSrc.length; i++) {
    if (slabSrc[i] === '{') depth++;
    else if (slabSrc[i] === '}') { depth--; if (!depth) { end = i; break; } }
  }
  const objSrc = slabSrc.slice(at, end + 1) + ';';
  function ledgerSandbox(withRegistry) {
    const sb = {
      window: withRegistry ? { SLABSkills: loadRegistry() } : {},
      aiAssumptions: [],
      _aiAsmNormText: t => String(t).toLowerCase().replace(/\s+/g, ' ').trim(),
      _AI_ASM_TYPES: ['architecture', 'operational', 'data', 'independence', 'other'],
      _AI_ASM_STATUSES: ['Open', 'Confirmed', 'Rejected'],
      _aiAsmRerenderIfOpen: function () {},
      scheduleAutosave: function () {},
      Date: Date, Math: Math, Array: Array, String: String, console: console,
    };
    vm.createContext(sb);
    // registry object built in ANOTHER context: re-wrap so instanceof checks don't bite
    vm.runInContext(objSrc, sb);
    return sb;
  }
  const withReg = ledgerSandbox(true);
  const e1 = vm.runInContext(
    'window.SafetyLabAiAssumptions.add({ analysis: "fha", text: "premise one", type: "architecture" })', withReg);
  // 30 Aug 2026 — v2 shipped on take 3.
  check('new entry carries skill stamp for its analysis',
    e1 && /^fha\.draft@v[4-9]#[0-9a-f]{8}$/.test(e1.skill), e1 && JSON.stringify(e1.skill));
  const e2 = vm.runInContext(
    'window.SafetyLabAiAssumptions.add({ analysis: "fcim.populate", text: "premise two" })', withReg);
  check('stamp follows the analysis key (fcim)', e2 && /^fcim\.draft@v[2-9]#/.test(e2.skill));   // v1→v2 31 Aug 2026: CANONICAL CONDITION PHRASING (E1 rig)
  const e3 = vm.runInContext(
    'window.SafetyLabAiAssumptions.add({ analysis: "chat.edit", text: "premise three" })', withReg);
  check('spec-less analysis -> empty stamp, entry still recorded', e3 && e3.skill === '' && e3.text === 'premise three');
  const dedup = vm.runInContext(
    'window.SafetyLabAiAssumptions.add({ analysis: "fha", text: "  PREMISE   one " }) === window.SafetyLabAiAssumptions.list ? false : aiAssumptions.length', withReg);
  check('dedup re-add keeps ONE entry (no duplicate stamping path)', dedup === 3, String(dedup));
  const noReg = ledgerSandbox(false);
  const e4 = vm.runInContext(
    'window.SafetyLabAiAssumptions.add({ analysis: "fha", text: "premise offline" })', noReg);
  check('absent registry -> skill is empty string, add still works', e4 && e4.skill === '' && e4.id);
  check('ledger stamping is basis-aware (basisFrom(projectConfig) wired in safety_lab.js)',
    /basisFrom\(typeof projectConfig !== 'undefined' \? projectConfig : null\)/.test(slabSrc));
})();

/* ------------------------------------------------------------------ */
console.log('4b. arch.decompose v2 + the F1b coarse-decompose guardrail (30 Aug 2026)');

(function () {
  // The skill that owns the dominant variance axis is now v2 with a stated
  // band. The registry stamp must say so, and the band text must be in the
  // body BOTH via the registry and the inline fallback (parity is checked in
  // section 2; here we pin the v2 CONTENT actually landed).
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(skillsSrc, sb);
  const S = sb.window.SLABSkills;
  const dec = S.skills['arch.decompose'];
  check('arch.decompose version floor >= 2', dec.version >= 2, 'v' + dec.version);
  check('v2 body carries the granularity band', /15\u201325 sub-functions/.test(dec.body) || /15–25 sub-functions/.test(dec.body));
  check('v2 body carries DOCUMENT ANCHORING', /DOCUMENT ANCHORING/.test(dec.body));
  check('v2 body keeps the split rule tied to independent failure', /FAIL INDEPENDENTLY/.test(dec.body));
  check('stamp reflects the bump', /^arch\.decompose@v[2-9]\d*#[0-9a-f]{8}$/.test(S.stampFor('arch.decompose')), S.stampFor('arch.decompose'));

  // guardrail executed — never blocks, warns only on coarse aircraft-scope
  const g = extractFn(aiSrc, '_granularityLine');
  check('_granularityLine extracted', !!g);
  if (!g) return;
  const gsb = { console };
  vm.createContext(gsb);
  vm.runInContext(g + ';globalThis.__g = _granularityLine;', gsb);
  const run = (cfg, items) => vm.runInContext('__g(' + JSON.stringify(cfg) + ',' + JSON.stringify(items) + ')', gsb);
  const eight = Array.from({ length: 8 }, (_, i) => ({ op: 'add_function', name: 'f' + i }));
  const warn = run({ analysis: 'arch.decompose', title: '\u2728 Functional decomposition \u00b7 Aircraft' }, eight);
  check('8 aircraft functions -> WARNS with the count and the band',
    /Coarse decomposition: 8/.test(warn) && /15\u201325|15–25/.test(warn), warn.slice(0, 60));
  check('warning never blocks (no button/disabled markup)', !/button|disabled/i.test(warn));
  const sixteen = Array.from({ length: 16 }, (_, i) => ({ op: 'add_function', name: 'f' + i }));
  check('16 aircraft functions -> silent', run({ analysis: 'arch.decompose', title: '\u2728 Functional decomposition \u00b7 Aircraft' }, sixteen) === '');
  check('system-scope decompose -> silent even at 3 rows (legitimately small)',
    run({ analysis: 'arch.decompose', title: '\u2728 Functional decomposition \u00b7 Hydraulics' }, eight.slice(0, 3)) === '');
  check('other lanes -> silent', run({ analysis: 'fha', title: '\u2728 x \u00b7 Aircraft' }, eight.slice(0, 3)) === '');
  const mixed = eight.slice(0, 5).concat([{ op: 'add_requirement' }, { op: 'add_requirement' }, { op: 'add_requirement' }, { op: 'add_requirement' }, { op: 'add_requirement' }, { op: 'add_requirement' }, { op: 'add_requirement' }]);
  check('only add_function ops are counted (12 mixed ops, 5 functions -> warns with 5)',
    /Coarse decomposition: 5/.test(run({ analysis: 'arch.decompose', title: '\u2728 Functional decomposition \u00b7 Aircraft' }, mixed)));
  check('guardrail is wired into the panel builder after the skill line',
    /_skillLine\(cfg\) \+[\s\S]{0,200}_granularityLine\(cfg, items\) \+/.test(aiSrc));
})();

/* ------------------------------------------------------------------ */
console.log('5. wiring + pins (floors)');

function pin(src, re) { const m = src.match(re); return m ? parseFloat(m[1]) : -1; }
check('ai_skills pin floor >= 1.3 (arch.decompose v2)', pin(indexSrc, /ai_skills\.js\?v=([\d.]+)/) >= 1.3);
check('ai_skills.js loads BEFORE ai_loader.js',
  indexSrc.indexOf('ai_skills.js?v=') > 0 && indexSrc.indexOf('ai_skills.js?v=') < indexSrc.indexOf('ai_loader.js?v='));
check('ai_loader pin floor >= 6.4 (F1b guardrail deploy)', pin(indexSrc, /ai_loader\.js\?v=([\d.]+)/) >= 6.4);
check('safety_lab pin floor >= 65.47 (V2)', pin(indexSrc, /safety_lab\.js\?v=([\d.]+)/) >= 65.47);
check('stpa_ai_apply pin floor >= 0.2', pin(indexSrc, /stpa_ai_apply\.js\?v=([\d.]+)/) >= 0.2);
check('ai_assistant pin floor >= 74.2 (inside ai_loader — the pin-behind-pin)',
  pin(loaderSrc, /ai_assistant\.js\?v=([\d.]+)/) >= 74.2);

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
console.log('7. severity anchoring — SHIPPED on take 3 (30 Aug 2026, Waqas: "Ship it now")');
{
  const aiSrc2 = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
  const skSrc2 = fs.readFileSync(path.join(SITE, 'ai_skills.js'), 'utf8');
  // 3 Sep 2026 — v4 THREE EFFECT AXES (floor, rule 12): the v2/v3 evidence comments stay.
  check('fha.draft and sfha.draft at v4+ (three effect axes), v2 shipped comment still records the evidence + the two held takes',
    (Number((skSrc2.match(/'fha\.draft': (\d+)/) || [])[1]) >= 4) && (Number((skSrc2.match(/'sfha\.draft': (\d+)/) || [])[1]) >= 4) && /SHIPPED on take 3/.test(skSrc2) && /takes 1\/2 were held/.test(skSrc2));
  check('v4 body carries the THREE EFFECT AXES closed vocabularies in the SHARED body (every path, by construction)',
    /THREE EFFECT AXES, CLOSED VOCABULARY/.test(skSrc2) && /none \| slight \| significant \| large \| hull loss/.test(skSrc2) && /none or slight inconvenience \| discomfort \| minor injuries \| severe injuries or few fatalities \| multiple fatalities/.test(skSrc2));
  check('the take-3 SHAPE: anchors folded INLINE into EXPECTED OUTPUTS — no standalone section',
    /EXPECTED OUTPUTS[^"]*sevBasis[^"]*CAT-1 multiple fatalities/.test(skSrc2) && !/\\nSEVERITY ANCHORING/.test(skSrc2));
  // 3 Sep 2026 (evening) - the abstain line is superseded by Waqas's ruling: judge on thin
  // information, flag it, keep the anchor. See regression_phase_rule_judgement.
  check('the anchor is required on a judged class (v6 replaces the abstain line)',
    /on a row you have JUDGED rather than grounded, the anchor is still required/.test(skSrc2) && !/where you would abstain, still abstain, with neither field set/.test(skSrc2));
  // the engine table + closed set
  const m = aiSrc2.match(/const _SEV_ANCHORS = \{([^}]+)\}/);
  check('_SEV_ANCHORS closed set (11 anchors) matches the skill ids', !!m && [...m[1].matchAll(/'([A-Z]{3}-\d)'/g)].length === 11);
  check('apply drops an off-list basis rather than writing it (and the derived anchor wins when levels are set)',
    /sevBasis: _derived \? _derived\.anchor : \(\(s\.sevBasis && _SEV_ANCHORS\[String\(s\.sevBasis\)\.trim\(\)\]\) \? String\(s\.sevBasis\)\.trim\(\) : ''\)/.test(aiSrc2));
  // EXECUTED lint under the SHIPPED (v2) stamp: full rule set active
  function extractFn(src, name) {
    const at = src.indexOf('function ' + name + '(');
    const open = src.indexOf('{', at);
    let d = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (!d) return src.slice(at, i + 1); }
    }
    return null;
  }
  const anchTbl = aiSrc2.match(/const _SEV_ANCHORS = \{[^}]+\};/)[0];
  const clsTbl = "const _SEV_CLASSES = ['Catastrophic', 'Hazardous', 'Major', 'Minor', 'No Safety Effect'];";
  const valFn = extractFn(aiSrc2, '_validateArtifact');
  check('_validateArtifact extracted', !!valFn);
  if (valFn) {
    const helpers = extractFn(aiSrc2, '_wordCount') + '\nconst _SEV_WORD_RE = /x^/;';
    const sb = { console, Array, Object, String, RegExp };
    vm.createContext(sb);
    vm.runInContext("const _skillStampFor = () => 'fha.draft@v3#0a2621d7';" + clsTbl + anchTbl + helpers + valFn + ';globalThis.__v = _validateArtifact;', sb);
    const run = a => vm.runInContext('__v(' + JSON.stringify(a) + ')', sb);
    check('EXECUTED: matching anchor+class clean', run({ op: 'add_fha', severity: 'Hazardous', sevBasis: 'HAZ-2' }).length === 0);
    check('EXECUTED: mismatch flagged', run({ op: 'add_fha', severity: 'Major', sevBasis: 'HAZ-1' }).some(f => /maps to Hazardous, not Major/.test(f)));
    check('EXECUTED: off-list flagged', run({ op: 'add_fha', severity: 'Minor', sevBasis: 'MIN-9' }).some(f => /not in the Table A6 closed set/.test(f)));
    check('EXECUTED: anchorless severity flagged under the shipped v3 stamp',
      run({ op: 'add_fha', severity: 'Catastrophic' }).some(f => /without a Table A6 anchor/.test(f)));
    check('EXECUTED: abstained rows never flagged', run({ op: 'add_fha', severity: '' }).length === 0);
  }
}

console.log(failures ? ('FAILED — ' + failures + ' check(s)') : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);


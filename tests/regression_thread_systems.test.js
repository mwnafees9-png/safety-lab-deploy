#!/usr/bin/env node
/**
 * Regression — F15 step 1 + 2: SYSTEMS FROM THE SDD, then the INTERDEPENDENCE SWEEP,
 * in the golden thread before any tree is drawn (Waqas, 4 Sep 2026: "the thread
 * should run CoFFE interdependence and MAC"; "wait for the full MAC/CoFFE").
 *
 *   · a new lane, arch.systems: add_system per system the document names, then
 *     that system's functions (scope "system") with traceIds to the aircraft
 *     sub-functions they implement — the interdependence columns and the MAC members;
 *   · the harness runs it after the FHA and before trees, then sweeps the
 *     interdependence table and accepts the model's proposals, marked TESTING ONLY.
 * Run: node tests/regression_thread_systems.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const drv = fs.readFileSync(path.join(__dirname, '..', 'eval', 'golden_thread_driver.js'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '('); if (i < 0) return null;
  let depth = 0, started = false, inS = null, esc = false, line = false, blk = false;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { line = true; k++; continue; }
    if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('[1] the systems lane exists, is guarded, and asks for the right shape');
{
  const sb = { window: {}, console: { info: function () {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(SITE, 'ai_skills.js'), 'utf8'), sb);
  const S = sb.window.SLABSkills;
  check('arch.systems is a registered skill at v2 (run 3: every system added in the same reply, never a subset)', S && S.skills['arch.systems'] && /^arch\.systems@v2#[0-9a-f]{8}$/.test(S.stampFor('arch.systems')), S && S.stampFor('arch.systems'));
  check('… the body says a function for a system not added is an error, and to cover every system', /a function for a system you did not add is an error/.test(S ? S.skills['arch.systems'].body : '') && /Cover EVERY system the document describes, never a subset/.test(S ? S.skills['arch.systems'].body : ''));
  check('the executor creates a NAMED owner system on add_function rather than failing (run 3: 15 of 30 actions failed "system not found")', /const mk = _chatAddSystem\(\{ name: String\(a\.systemId\)\.trim\(\) \}, model\);/.test(ai) && /system “' \+ createdSys \+ '” created — it was named but not added/.test(ai) && /if \(!sysObj\) return \{ ok: false, error: 'system not found: ' \+ String\(a\.systemId\) \};/.test(ai));
  check('the feature maps to its own skill', S && S.featureMap['arch.systems'] === 'arch.systems');
  const body = S ? S.skills['arch.systems'].body : '';
  check('… and the body says: systems the document names, add_system BEFORE functions, trace only where the document says so', /ONE add_system PER SYSTEM, BEFORE ITS FUNCTIONS/.test(body) && /Trace ONLY where the document says so/.test(body) && /Never introduce a system or a function the document does not describe/.test(body));
  check('… and resources count as systems here (they own the functions MAC members come from)', /Resources such as electrical, hydraulic and pneumatic power ARE systems here/.test(body));
  check('the inline spec is registered under the same key (byte parity is regression_ai_skills\' job)', /'arch\.systems': _SPEC_SYSTEMS/.test(ai));
  check('decomposeSystems is a public entry point wrapped by the capture guard', /decomposeSystems: _captureGuard\('decomposeSystems', decomposeSystems\)/.test(ai));
  check('it refuses without aircraft functions (system functions trace to sub-functions)', /Decompose the aircraft functions first — system functions trace to aircraft sub-functions/.test(ai));
  check('it reads the same consolidated AI Inputs as decomposition (no side channel)', /_withArchInput\(\{ title: 'Systems · from the architecture', requireText: true \}, go\)/.test(ai));
  check('the directive names the shape: add_system first, then add_function scope "system" with traceIds', /systems: 'From the project architecture \/ source documents, identify the aircraft SYSTEMS/.test(ai) && /add_function \{scope:"system", systemId:<that name>, funcName, funcDef, traceIds:\[aircraft sub-function ids it implements\]\}/.test(ai));
  check('the op spec tells the model add_function carries traceIds for scope "system"', /add_function \{scope, systemId\?, funcName, funcDef, subName, subDef, traceIds\?\}/.test(ai));
  check('the executor already keeps traceIds on a system function row', /traceIds: a\.traceIds \|\| \[\]/.test(ai));
  check('existing systems are offered by name so the model reuses, never duplicates', /Systems already in the project \(reuse these names, never duplicate\)/.test(ai));
  check('the model is given the real aircraft sub-function ids to trace to', /Aircraft sub-function ids available for traceIds: /.test(ai));
}

console.log('\n[2] the golden thread runs systems, then the interdependence sweep, before trees');
{
  // 4 Sep 2026 (Waqas, final): aircraft level first and generic; systems → MAC → system FCIM
  // and SFHA per system (MAC detail parsed out there) → resources → interdependence → CoFFE → trees.
  const order = ['decompose', 'fcim', 'fha', 'systems', 'items', 'mac', 'sfcim', 'sfha', 'resources', 'interdep', 'coffe', 'trees', 'trees-ai', 'fmea'];
  const idx = order.map(k => drv.indexOf("step: '" + k + "'"));
  check('THREAD order: decompose → fcim → fha → systems → items → mac → sfcim → sfha → resources → interdep → coffe → trees (compiled) → [trees-ai] → fmea', idx.every(i => i >= 0) && idx.every((v, i) => i === 0 || v > idx[i - 1]), idx.join(','));
  check('system FCIM and SFHA run once per system through the capture seam', /\{ step: 'sfcim',\s+each: 'systems', call: function \(sy\) \{ return SafetyLabAI\.populateSysFcim\(sy\.id\); \} \}/.test(drv) && /if \(s\.each === 'systems'\)/.test(drv) && /step: s\.step \+ ':' \+ \(sy\.name \|\| sy\.id\)/.test(drv));
  check('the systems instructions keep every redundant copy countable (the MAC counts configuration items)', (() => { const sb = { window: {}, console: { info() {} } }; vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(SITE, 'ai_skills.js'), 'utf8'), sb); const b = sb.window.SLABSkills.skills['arch.systems'].body; return /KEEP EVERY REDUNDANT COPY COUNTABLE/.test(b) && /Four engines are four systems/.test(b) && /with its side or position where the document gives one/.test(b); })());
  check('trees are COMPILED (SLLaneTrees.compileAll), the AI synthesiser is optional and off by default', /\{ step: 'trees',\s+direct: compileTrees \}/.test(drv) && /\{ step: 'trees-ai',\s+call: function \(\) \{ return SafetyLabAI\.synthesizeTree\(\); \}, optional: true \}/.test(drv) && /if \(s\.optional && !\(only && only\.indexOf\(s\.step\) >= 0\)\) continue;/.test(drv) && /LT\.compileAll\(\)/.test(drv));
  check('the resources lane\'s items are applied by applyDraft (they are not unified actions)', /feature === 'resources\.draft' \|\| \(a\.name !== undefined && \(a\.providedBy !== undefined \|\| a\.consumedBy !== undefined\)\)/.test(ai) && /const ok = _applyResource\(a\);/.test(ai));
  check('systems is a captured lane (review panel → applyDraft)', /\{ step: 'systems',\s+call: function \(\) \{ return SafetyLabAI\.decomposeSystems\(\); \} \}/.test(drv));
  check('interdep is a DIRECT step (no panel to capture)', /\{ step: 'interdep',\s+direct: interdepSweepAndAccept \}/.test(drv));
  check('step() handles direct steps and records their numbers', /if \(typeof s\.direct === 'function'\)/.test(drv) && /rec\.direct = await s\.direct\(\)/.test(drv));
  check('counts() now reports systems, system functions, interdependence, MAC and CoFFE', /systems: g\('systemsData'\), systemFunctions: sysFns, systemFcim: sysFcim, systemFha: sysFha, interdep: idp \?/.test(drv) && /mac: mac, coffeVerdicts: coffe/.test(drv));
}

console.log('\n[3] executed — the sweep loops to completion and accepts proposals as TESTING ONLY');
{
  const calls = [];
  const cells = { 'fc1§fn:F1': { state: 'proposed', dir: 'contributes', why: 'implements pitch', model: 'claude-opus-4-8' },
                  'fc1§fn:F2': { state: 'proposed', dir: 'clear', why: 'no coupling', model: 'claude-opus-4-8' },
                  'fc2§fn:F1': { state: 'asserted', by: 'J. Okafor', at: 'x' } };
  let sweeps = 0;
  const ctx = {
    console, Object, Date, Error, String, Array,
    idpAiSweep: async () => { sweeps++; calls.push('sweep'); if (sweeps === 1) cells['fc3§fn:F1'] = { state: 'proposed', dir: 'contributes', why: 'late', model: 'm' }; },
    idpStats: () => { const p = Object.values(cells).filter(c => c.state === 'proposed').length; return { unreviewed: (sweeps === 0 ? 3 : p), proposed: p, contributes: 1, cleared: 0, multi: 0 }; },
    _idpStore: () => ({ cells }),
    commitSaveChanges: () => calls.push('save'), renderInterdepPage: () => calls.push('render'),
  };
  vm.createContext(ctx);
  vm.runInContext('async ' + extractFn(drv, 'interdepSweepAndAccept') + '\n', ctx);
  vm.runInContext('interdepSweepAndAccept().then(r => { globalThis.__r = r; })', ctx);
  setTimeout(() => {
    const r = ctx.__r;
    check('it ran the sweep and stopped when nothing was left', !!r && r.sweeps >= 1 && sweeps === r.sweeps, JSON.stringify(r));
    check('every proposal is accepted: contributes → asserted, clear → cleared', cells['fc1§fn:F1'].state === 'asserted' && cells['fc1§fn:F2'].state === 'cleared' && cells['fc3§fn:F1'].state === 'asserted');
    check('… signed as harness-accepted, TESTING ONLY, keeping the model\'s reason', /harness-accepted, TESTING ONLY/.test(cells['fc1§fn:F1'].by) && /AI-proposed, harness-accepted: implements pitch/.test(cells['fc1§fn:F1'].note) && cells['fc1§fn:F1'].aiProposed === true);
    check('a human assertion is never touched', cells['fc2§fn:F1'].by === 'J. Okafor' && cells['fc2§fn:F1'].state === 'asserted');
    check('it saved and re-rendered', calls.indexOf('save') >= 0 && calls.indexOf('render') >= 0);
    check('the numbers come back for the record', r && r.accepted === 2 && r.cleared === 1 && r.model === 'claude-opus-4-8', JSON.stringify(r));
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  }, 50);
}

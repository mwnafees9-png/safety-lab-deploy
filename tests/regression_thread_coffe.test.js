#!/usr/bin/env node
/**
 * Regression — F15 step 4: THE COFFE RESIDUE PROPOSER, and the CoFFE ↔ MAC member
 * mismatch it uncovered (Waqas, 4 Sep 2026: trees compile from interdependence, CoFFE
 * and MAC — "no room to hallucinate").
 *
 *   · skill coffe.draft v1; lane SafetyLabAI.draftCoffe — DIRECT (no review panel):
 *     it asks the model ONLY the cases the MAC model cannot compute (malfunction
 *     states, systems no clause models), never a case that already has a verdict,
 *     and lands each answer as a verdict marked aiProposed with the model as signer;
 *     the panel shows "✨ AI-proposed".
 *   · the golden thread runs coffe after mac and before trees.
 * Run: node tests/regression_thread_coffe.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const helpers = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
const misc = fs.readFileSync(path.join(SITE, 'misc_fn_modules.js'), 'utf8');
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

console.log('[1] the lane, the skill, the thread');
{
  const sb = { window: {}, console: { info: function () {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(SITE, 'ai_skills.js'), 'utf8'), sb);
  const S = sb.window.SLABSkills;
  check('coffe.draft is a registered skill at v1', S && S.skills['coffe.draft'] && /^coffe\.draft@v1#[0-9a-f]{8}$/.test(S.stampFor('coffe.draft')));
  const body = S ? S.skills['coffe.draft'].body : '';
  check('the body limits the model to the residue and forbids likelihood or severity reasoning', /you are asked ONLY the residue the model cannot compute/.test(body) && /likelihood is the fault tree's job/.test(body) && /answer a case by its severity label/.test(body));
  check('draftCoffe is public; it is a direct lane (verdicts, not a panel)', /draftCoffe:\s+draftCoffe,/.test(ai) && /aiProposed: true, why:/.test(ai));
  check('it asks only undecided cases: malfunction (no computed lane) or outside the MAC model', /if \(V\[fc\.internalId \+ '§' \+ k\.key\]\) return false;/.test(ai) && /if \(coffeComputed\(fc, k\) === null\) return true;/.test(ai) && /return k\.parts\.some\(function \(p\) \{ return unmod\[p\.sysId\]; \}\);/.test(ai));
  check('it never overwrites a verdict that landed meanwhile', /if \(V\[vk\]\) return;\s+\/\/ something landed meanwhile — never overwrite/.test(ai));
  check('the CoFFE panel marks an AI-proposed verdict as such, with what to do', /✨ AI-proposed<\/span>/.test(helpers) && /AI-proposed — not a review\. Click to clear it, then determine and sign; or leave it and sign your own\./.test(helpers));
  check('the golden thread: mac → coffe → trees', drv.indexOf("step: 'coffe'") > drv.indexOf("step: 'mac'") && drv.indexOf("step: 'coffe'") < drv.indexOf("step: 'trees'") && /direct: function \(\) \{ return SafetyLabAI\.draftCoffe\(\{ fcCap: 200 \}\); \}/.test(drv));
  check('CoFFE now resolves a function-member token to its owner system (the B6 mismatch)', /function _coffeTokSys\(tok\)/.test(misc) && /const sysOf = _coffeTokSys\(tok\);/.test(misc) && /covered\.add\(_coffeTokSys\(m\)\)/.test(misc));
}

console.log('\n[2] executed — the proposer asks the residue and files proposals');
{
  const V = { '7§sys-b=total loss': { verdict: 'no', by: 'J. Okafor', at: 'x' } };
  const store = { verdicts: V, results: {} };
  const asked = [];
  const ctx = {
    console, String, Array, Object, JSON, Date, Number, Math,
    Provider: { available: () => true, describe: () => ({}), complete: async (o) => { asked.push(JSON.parse(o.messages[0].content)); return { model: 'claude-opus-4-8', text: '```json\n' + JSON.stringify({ cases: [ { key: 'sys-a=malfunction', resultsInFc: true, result: 'uncommanded high thrust — overrun', why: 'no independent limiter stated' }, { key: 'sys-c=total loss', resultsInFc: false, result: 'stops on runway', why: 'C is advisory only' }, { key: 'not-asked=total loss', resultsInFc: true } ], assumptions: [] }) + '\n```' }; } },
    snapshot: () => ({ acFhaData: [{ internalId: 7, fcId: 'SF-1-TL', fcDesc: 'Complete loss of wheel braking', severity: 'Catastrophic', subId: '2.3' }, { internalId: 8, fcId: 'SF-2-TL', fcDesc: 'single-system', severity: 'Major', subId: '2.4' }], systemsData: [{ id: 'sys-a', name: 'Brakes', functions: [] }, { id: 'sys-b', name: 'Hydraulics', functions: [] }, { id: 'sys-c', name: 'Antiskid', functions: [] }] }),
    idpContributors: fc => fc.internalId === 7 ? ['sys-a', 'sys-b', 'sys-c'] : ['sys-x'],
    coffeUnmodelledSystems: fc => ['sys-c'],
    coffeCases: fc => [ { key: 'sys-a=malfunction', parts: [{ sysId: 'sys-a', state: 'malfunction' }] }, { key: 'sys-b=total loss', parts: [{ sysId: 'sys-b', state: 'total loss' }] }, { key: 'sys-a=total loss', parts: [{ sysId: 'sys-a', state: 'total loss' }] }, { key: 'sys-c=total loss', parts: [{ sysId: 'sys-c', state: 'total loss' }] } ],
    coffeComputed: (fc, k) => k.parts.some(p => p.state === 'malfunction') ? null : 'yes',
    _coffeStore: () => store,
    _toast: () => {}, _parseAssumptions: () => [], commitSaveChanges: () => {}, renderCoffePanel: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext('async ' + extractFn(ai, 'draftCoffe') + '\n', ctx);
  vm.runInContext('draftCoffe().then(r => { globalThis.__r = r; })', ctx);
  setTimeout(() => {
    const r = ctx.__r;
    check('one call, for the one condition with two or more contributing systems', r && r.calls === 1 && r.fcs === 1, JSON.stringify(r));
    check('it asked exactly the residue: the malfunction case and the unmodelled system\'s case — not the signed case, not the case the MAC answers', asked.length === 1 && asked[0].cases.map(c => c.key).sort().join('|') === 'sys-a=malfunction|sys-c=total loss', JSON.stringify(asked[0] && asked[0].cases));
    check('the parts are given by system NAME and state', asked[0].cases[0].parts[0] === 'Brakes — malfunction');
    check('answers land as AI-proposed verdicts with the model as signer and the reason kept', V['7§sys-a=malfunction'] && V['7§sys-a=malfunction'].verdict === 'yes' && V['7§sys-a=malfunction'].aiProposed === true && /^AI \(claude-opus-4-8\) — proposed$/.test(V['7§sys-a=malfunction'].by) && V['7§sys-a=malfunction'].why === 'no independent limiter stated');
    check('… a false answer lands as "no"; the result text is kept', V['7§sys-c=total loss'].verdict === 'no' && store.results['7§sys-c=total loss'] === 'stops on runway');
    check('a case the model was not asked about is ignored', !V['7§not-asked=total loss']);
    check('the engineer\'s signed verdict is untouched', V['7§sys-b=total loss'].by === 'J. Okafor');
    check('the numbers come back for the record', r.proposed === 2 && r.cases === 2 && r.failures === 0 && r.model === 'claude-opus-4-8', JSON.stringify(r));
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  }, 80);
}

#!/usr/bin/env node
/**
 * Regression — ANALYSIS DRAFTING SAMPLES AT TEMPERATURE 0 (5 Sep 2026, consistency lever 1).
 * The batch path every lane uses labels its Provider call 'chat.edit' (the spec/context injection
 * is keyed on that label), so it inherited the CHAT temperature (0.3) — the FHA on the golden
 * thread included. Identical-input FHA draws agreed on a row's class 63% of the time.
 *   · _featureTemp: only chat.edit keeps 0.3; everything analytical is 0.0;
 *   · _anemComplete / _anemRun take an explicit temperature; the batch slices and the
 *     phase-coverage pass pass 0; the ANEM chat passes nothing and keeps its tier.
 * Run: node tests/regression_drafting_temperature.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ai = fs.readFileSync(path.join(__dirname, '..', 'site', 'ai_assistant.js'), 'utf8');
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
const ctx = { String }; vm.createContext(ctx); vm.runInContext(extractFn(ai, '_featureTemp'), ctx);
const t = (f) => vm.runInContext('_featureTemp(' + JSON.stringify(f) + ')', ctx);
check('analytical drafting runs at 0 (fha.populate, fcim.populate, arch.decompose, mac.draft, coffe.draft, hf.draftlane)', ['fha.populate', 'fcim.populate', 'arch.decompose', 'mac.draft', 'coffe.draft', 'hf.draftlane', 'interdep.sweep'].every(f => t(f) === 0));
check('validators and the judge stay at 0', t('eval.judge') === 0 && t('validate.verifier') === 0);
check('only the conversational chat keeps 0.3', t('chat.edit') === 0.3);
check('_anemComplete takes an explicit temperature and passes it to the provider', /async function _anemComplete\(messages, systemExtra, maxTokens, temperature, extraBreaks\)/.test(ai) && /temperature: \(typeof temperature === 'number' \? temperature : undefined\)/.test(ai));
check('the batch slices and the phase-coverage pass run at 0', /_anemRun\(_mkMessages\(_extra\), _sysExtra, _chunk \? _CHUNK_TURN_TOKENS : undefined, 0, _sysBreaks\)/.test(ai) && /_anemRun\(_mkMessages\(_steer\), _sysExtra, _chunk \? _CHUNK_TURN_TOKENS : undefined, 0, _sysBreaks\)/.test(ai));
check('the retry after an unparseable reply keeps the same temperature', /maxTokens, temperature, extraBreaks\);/.test(ai));
check('the ANEM chat passes no temperature (keeps its tier)', /const attempt = await _anemRun\(msgs, _cbGround\);/.test(ai));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

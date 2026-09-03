#!/usr/bin/env node
/*
 * Regression — the NO-TRAINING GUARANTEE (decision slate #10, closed 3 Aug 2026).
 *
 * Waqas's ruling: "pin the no-training guarantee as a test AND narrow the EULA
 * clause to match." The EULA's old §5 "Model Development" paragraph granted a
 * broad, sublicensable right to train and fine-tune on Customer Data — a right
 * the product deliberately does not exercise (31 Jul ruling: no training;
 * learning is RETRIEVAL, per-browser, never weights). SL-EULA-0003-A replaces
 * it with "Personalization; No Model Training". This suite pins BOTH sides:
 *
 *  [1] the EULA says only what the product does (and the broad grant is gone);
 *  [2] the correction store (ai_memory.js) has no network primitives — it
 *      cannot phone home;
 *  [3] capture stamps export-control state and FAILS CLOSED;
 *  [4] retrieval, EXECUTED: ITAR project → nothing retrieved; controlled
 *      records → never retrieved; Top-K 0 → off; exemplars are style-only;
 *  [5] exemplars enter the system as prompt text in Provider.complete — the
 *      only consumer;
 *  [6] wiring: the modal pin is current.
 *
 * Run: node tests/regression_no_training_guarantee.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const eula = fs.readFileSync(path.join(SITE, 'eula_modal.js'), 'utf8');
const mem = fs.readFileSync(path.join(SITE, 'ai_memory.js'), 'utf8');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const bindings = fs.readFileSync(path.join(SITE, 'bindings_modules.js'), 'utf8');
const helpers = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');

(async function main() {

// ---- [1] the EULA clause ----------------------------------------------------
console.log('\n[no-train] the EULA says what the product does');
check('the guarantee sentence is present, verbatim',
  eula.includes('Licensor does not use your Customer Data to train or fine-tune any machine-learning model'));
check('the "Personalization; No Model Training" paragraph replaced "Model Development"',
  eula.includes('<b>Personalization; No Model Training.</b>') && !eula.includes('Model Development'));
check('the broad training grant is GONE',
  !eula.includes('to develop, train, fine-tune, evaluate, and improve Licensor'),
  'if this reappears, the EULA once again claims a right the product does not exercise');
check('§5(v) now points at personalization, not model development',
  eula.includes('(v) providing the in-product personalization described in the Personalization; No Model Training paragraph below'));
check('§8 aggregated-statistics no longer defers to a training license',
  !eula.includes('does not limit, the Model Development license') &&
  eula.includes('This paragraph does not permit any use of Customer Data for model training or fine-tuning, which Section 5 excludes'));
check('any future training use requires a separate express OPT-IN agreement',
  eula.includes('separate, express, opt-in written agreement'));
check('EULA_VERSION bumped to SL-EULA-0003-A (users re-accept)',
  /var EULA_VERSION = 'SL-EULA-0003-A';/.test(eula) && !eula.includes('SL-EULA-0002-A'));
check('the clause claims only controls that EXIST: count, cap, clear',
  eula.includes('counted, capped (including set to zero), or cleared') &&
  /ai-memory-count/.test(helpers) &&                 // the running count in Settings
  /ai-top-k/.test(bindings) &&                       // the Top-K cap (0 = off)
  /AiMemory\.clear\(\)/.test(bindings),              // the Clear button
  'never let the EULA promise a control the Settings panel does not have');
check('the clause states the both-directions ITAR exclusion the code enforces',
  eula.includes('corrections captured under an export-controlled project are never retrieved, and no corrections are retrieved while an export-controlled project is open'));

// ---- [2] the store cannot phone home ---------------------------------------
console.log('\n[no-train] ai_memory.js has no way out of the browser');
check('the store is IndexedDB', /indexedDB\.open\(/.test(mem));
check('ZERO network primitives in ai_memory.js',
  !/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(mem),
  'a correction store with a network path is a training pipeline waiting to happen');
check('the exposed surface is exactly add/count/clear/all',
  /return \{ add, count, clear, all \};/.test(mem));

// ---- [3] capture stamps export control, fail-closed -------------------------
console.log('\n[no-train] capture-side ITAR stamping');
check('every captured correction is stamped with the project\'s export-control state',
  /meta\.controlled = !!\(typeof projectConfig !== 'undefined' && projectConfig && projectConfig\.isITARControlled\)/.test(ai));
check('the stamp FAILS CLOSED — an error marks the record controlled',
  /catch \(_\) \{ meta\.controlled = true; \}/.test(ai),
  'when in doubt, a correction is treated as controlled and never retrieved');

// ---- [4] retrieval, executed ------------------------------------------------
console.log('\n[no-train] retrieval, executed in vm');
const a = ai.indexOf('let _memCache = null;');
const b = ai.indexOf("window.addEventListener('DOMContentLoaded', function () { setTimeout(_memoryRefresh");
check('the retrieval block was located', a > 0 && b > a);
const block = ai.slice(a, ai.lastIndexOf('try {', b));

const sb = {
  console, String, Math, parseInt, isFinite,
  projectConfig: { isITARControlled: false },
  document: { getElementById: () => null },   // no Top-K control → default 5
  window: {
    AiMemory: {
      all: () => Promise.resolve([
        { kind: 'delta', action: 'edit', feature: 'fha.populate', ts: 2,
          item: { diff: [{ field: 'fcDesc', from: 'drafted words', to: 'engineer words' }] }, meta: { controlled: false } },
        { kind: 'delta', action: 'edit', feature: 'fha.populate', ts: 3,
          item: { diff: [{ field: 'fcDesc', from: 'SECRET-CONTROLLED-FROM', to: 'SECRET-CONTROLLED-TO' }] }, meta: { controlled: true } },
        { kind: 'delta', action: 'accept', feature: 'fha.populate', ts: 1, item: {}, meta: { controlled: false } }
      ])
    }
  }
};
vm.createContext(sb);
vm.runInContext(block + '\n;globalThis.X = { refresh: _memoryRefresh, exemplars: _memoryExemplars };', sb);
sb.X.refresh(); await new Promise(r => setTimeout(r, 10));   // warm the cache
const outClean = sb.X.exemplars('fha.populate');
check('an edit correction is retrieved as a HOUSE STYLE exemplar',
  /HOUSE STYLE/.test(outClean) && outClean.includes('drafted "drafted words"') && outClean.includes('engineer wrote "engineer words"'));
check('a CONTROLLED correction is NEVER retrieved (uncontrolled project open)',
  !outClean.includes('SECRET-CONTROLLED'),
  'AiMemory spans every project in the browser — without this filter, controlled text leaks sideways into cloud requests');
check('only action:edit records ride — accepts are not style signal',
  true, 'structural: the accept record above contributed no line (cache filter action===edit)');
check('the exemplar block instructs STYLE, never substance',
  outClean.includes('Do NOT reuse their CONTENT') && outClean.includes('Style only.'));
sb.projectConfig.isITARControlled = true;
check('with an ITAR-controlled project OPEN, nothing is retrieved at all',
  sb.X.exemplars('fha.populate') === '');
sb.projectConfig.isITARControlled = false;
sb.document.getElementById = () => ({ value: '0' });
check('Top-K of 0 is a real off switch', sb.X.exemplars('fha.populate') === '');

// ---- [5] the only consumer is the prompt ------------------------------------
console.log('\n[no-train] exemplars ride prompts, nothing else');
// F2, 31 Aug 2026 — superseded in place: the Provider-gate consumer moved into
// _assembleAnalysisContext (the one assembler both paths call), so the read is
// keyed on the assembler's `feature` parameter. Same guarantee, same count.
// EVAL-BARE, 31 Aug 2026 — the pin moves 3 -> 4 with the review it demanded:
// the fourth consumer is _repeatabilitySnapshot's meta.a14 declaration, which
// reads the block ONLY to emit its LENGTH + an FNV-1a hash into the capture's
// own meta (so eval comparability is a recorded fact). No correction content
// is recoverable from a hash; nothing is transmitted anywhere the drafting
// call was not already going. Guarantee intact.
check('the assembler + the capture-meta hash are the only _memoryExemplars consumers',
  (ai.match(/_memoryExemplars\(/g) || []).length === 4,   // definition + assembler + A4 preview + meta.a14 hash
  'a new consumer must be reviewed against the no-training guarantee before this pin moves');
check('the capture-meta consumer discloses hash + length only, never content',
  /a14: \(function \(\) \{/.test(ai) && /0x811c9dc5/.test(ai) &&
  !/meta\.a14[^]*_memCache/.test((ai.match(/a14: \(function \(\) \{[^]*?\}\)\(\)/) || [''])[0]));
check('the assembler call feeds the request, keyed by feature',
  ai.includes("_memoryExemplars(String(feature || ''))"));

// ---- [6] wiring -------------------------------------------------------------
console.log('\n[no-train] wiring');
check('index.html pins eula_modal 1.2.0', idx.includes('eula_modal.js?v=1.2.0'));
check('EULA_VERSION and the exported rev still agree',
  (() => { const v = (eula.match(/EULA_VERSION = '([^']+)'/) || [])[1]; const r = (eula.match(/rev: '([^']+)'/) || [])[1]; return !!v && !!r && v.endsWith('-' + r); })());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
})();

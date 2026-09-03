#!/usr/bin/env node
/*
 * Regression tests for ASR-2 — the seeded fuzzing bot (fuzz_bot.js).
 *
 * Locks:
 *   [1] lane discipline: synthetic trees only; the only write is the journal
 *       entry; results carry the replay recipe (seed + trials).
 *   [2] the run on the REAL engine: 50 trials, all five properties hold;
 *       same seed → identical outcome (replayability); different seed →
 *       different trees (the PRNG actually drives).
 *   [3] the properties detect: a broken engine (stubbed to return a wrong
 *       number) is caught by the laws — the harness proves the checks bite.
 *   [4] wiring: script tag; bench-page control; journaled summary.
 *
 * Run:  node tests/regression_fuzz_bot.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const SITE = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const src = SITE('fuzz_bot.js');

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null, addEventListener() {}, readyState: 'complete' };
globalThis.showToast = () => {};
globalThis.TEMPLATE_SCHEMAS = {}; globalThis.renderFhaAsmLinksHtml = () => '';
globalThis._perfStats = {}; globalThis._cutsetWorker = null; globalThis._cutsetWorkerSeq = 0; globalThis._CUTSET_WORKER_MIN_NODES = 400;
globalThis.ftaConfig = { mode: 'bottom-up', apportion: 'equal', targetP: 1e-5, exposureTime: 1 };
globalThis.ftaPages = []; globalThis.acFhaData = []; globalThis.systemsData = []; globalThis.projectConfig = {};
const jrnlCalls = [];
globalThis.jrnl = (kind, s) => jrnlCalls.push({ kind, s });

(0, eval)(['fta_engine.js', 'engine_modules.js', 'fta_quant_modules.js', 'misc_fn_modules.js', 'fuzz_bot.js'].map(SITE).join('\n;\n'));
const F = globalThis.SLFuzz;

console.log('\n[1] lane discipline');
check('exports run/genTree', !!F && typeof F.run === 'function' && typeof F.genTree === 'function');
const stripped = src.replace(/\/\/[^\n]*/g, '');
check('never writes to stores', !/(ftaPages\s*=(?!=)|acFhaData\s*=(?!=)|projectConfig\.\w+\s*=(?!=))/.test(stripped));
check('summary carries the replay recipe', /replay: SLFuzz\.run\(\{seed:/.test(src));

console.log('\n[2] the run (real arena engine)');
jrnlCalls.length = 0;
const r1 = F.run({ seed: 42, trials: 50 });
check('50 seeded trials — all five properties hold', r1.ok && r1.failures.length === 0, JSON.stringify(r1.failures[0] || {}));
check('journaled as a fuzz entry', jrnlCalls.length === 1 && jrnlCalls[0].kind === 'fuzz' && /ALL PROPERTIES HELD/.test(jrnlCalls[0].s));
const r2 = F.run({ seed: 42, trials: 50 });
check('same seed replays identically', r1.ok === r2.ok && r1.refused === r2.refused && r1.failures.length === r2.failures.length);
const rnd1 = F._mulberry32(1), rnd2 = F._mulberry32(2);
const t1 = JSON.stringify(F.genTree(30, rnd1)), t2 = JSON.stringify(F.genTree(30, rnd2));
check('different seeds generate different trees', t1 !== t2);

console.log('\n[3] the properties bite (broken-engine harness)');
{
  const realCompute = globalThis.computeExactProbability;
  globalThis.computeExactProbability = () => 1.7;             // out of range AND non-deterministic vs laws
  const rb = F.run({ seed: 7, trials: 3 });
  check('a wrong-number engine is caught by the laws', !rb.ok && rb.failures.some(f => /P1 range/.test(f.what)));
  globalThis.computeExactProbability = realCompute;
  const rg = F.run({ seed: 7, trials: 3 });
  check('restored engine passes the same seed', rg.ok);
}

console.log('\n[4] wiring');
const idx = SITE('index.html');
check('index.html loads fuzz_bot.js', /fuzz_bot\.js\?v=1\./.test(idx));
check('bench-page control (view-bench injection)', /view-bench/.test(src) && /fuzz-launch/.test(src));
check('honest-refusal property present (named ExplosionErrors only)', /ExplosionError/.test(src) && /P5/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

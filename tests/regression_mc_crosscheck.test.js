#!/usr/bin/env node
/* Regression tests for DSV-1 — dissimilar verification (mc_crosscheck.js). */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } }
const SITE = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const src = SITE('mc_crosscheck.js');
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
(0, eval)(['fta_engine.js', 'engine_modules.js', 'fta_quant_modules.js', 'misc_fn_modules.js', 'mc_crosscheck.js'].map(SITE).join('\n;\n'));
const D = globalThis.SLDissimilar;
const L = (id, p, lid) => ({ id, logicalId: lid || ('L' + id), type: 'basic', probability: p, lambda: p, children: [] });

console.log('\n[1] the dissimilar path is genuinely dissimilar');
check('gate-logic evaluator, no BDD anywhere in the MC path', /_evalTree/.test(src) && !/BDD\./.test(src) && !/buildBDDFromFT/.test(src) && !/getCutsets/.test(src));
// repeated events share one draw: OR(x, x) with p=0.3 must estimate 0.3, not 0.51
const rep = { id: 1, type: 'gate', gateType: 'OR', children: [L(2, 0.3, 'X'), L(3, 0.3, 'X')] };
const rr = D.crossCheck(rep, { seed: 7, samples: 100000 });
check('repeated events correlated (OR(x,x) ≈ 0.3, not 0.51)', rr.verdict === 'agree' && Math.abs(rr.mcEstimate - 0.3) < 0.02, JSON.stringify({ v: rr.verdict, mc: rr.mcEstimate, exact: rr.exact }));

console.log('\n[2] agreement + honesty');
const tree = { id: 1, type: 'gate', gateType: 'OR', children: [{ id: 2, type: 'gate', gateType: 'AND', children: [L(3, 0.05), L(4, 0.08)] }, L(5, 0.02)] };
const r1 = D.crossCheck(tree, { seed: 42, samples: 200000 });
check('exact and MC agree within 4.5σ on a resolvable tree', r1.verdict === 'agree' && Math.abs(r1.z) <= 4.5, 'z=' + r1.z);
const r2 = D.crossCheck(tree, { seed: 42, samples: 200000 });
check('seeded — identical rerun, identical hits', r1.hits === r2.hits);
const tiny = { id: 1, type: 'gate', gateType: 'AND', children: [L(2, 1e-5), L(3, 1e-5)] };
const r3 = D.crossCheck(tiny, { seed: 1, samples: 100000 });
check('below MC power → honest refusal, never a fake pass', r3.verdict === 'insufficient-power' && /resolves to/.test(r3.note));
const ccf = { id: 1, type: 'gate', gateType: 'OR', children: [Object.assign(L(2, 0.1), { ccfGroup: 'G1', beta: 0.1 }), L(3, 0.1)] };
check('CCF trees skipped WITH the reason', D.crossCheck(ccf, { seed: 1 }).verdict === 'skipped');
// a broken exact engine is caught
const realCompute = globalThis.computeExactProbability;
globalThis.computeExactProbability = () => 0.5;
const rb = D.crossCheck(tree, { seed: 42, samples: 200000 });
globalThis.computeExactProbability = realCompute;
check('a wrong exact engine DISAGREES (the check bites)', rb.verdict === 'DISAGREE' && /named finding/.test(rb.note));

console.log('\n[3] the run + wiring');
jrnlCalls.length = 0;
const run = D.run({ seed: 42, trees: 5, samples: 100000 });
check('synthetic run: agreements, zero disagreements, journaled with replay recipe', run.ok && run.disagree === 0 && jrnlCalls.length === 1 && /replay: SLDissimilar\.run/.test(jrnlCalls[0].s), run.summary);
check('display lane — no store writes', !/(ftaPages\s*=(?!=)|projectConfig\.\w+\s*=(?!=)|\.probability\s*=(?!=))/.test(src.replace(/\/\/[^\n]*/g, '')));
check('wired: script tag + bench control', /mc_crosscheck\.js\?v=1\./.test(SITE('index.html')) && /dsv-launch/.test(src));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/* Regression tests for UNC-1 — uncertainty bands (unc_bands.js). */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } }
const SITE = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const src = SITE('unc_bands.js');
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), addEventListener() {}, readyState: 'complete' };
globalThis.TEMPLATE_SCHEMAS = {}; globalThis.renderFhaAsmLinksHtml = () => ''; globalThis.showToast = () => {};
globalThis._perfStats = {}; globalThis._cutsetWorker = null; globalThis._cutsetWorkerSeq = 0; globalThis._CUTSET_WORKER_MIN_NODES = 400;
globalThis.ftaConfig = { mode: 'bottom-up', apportion: 'equal', targetP: 1e-5, exposureTime: 1 };
globalThis.ftaPages = []; globalThis.acFhaData = []; globalThis.systemsData = []; globalThis.projectConfig = {};
globalThis.renderBudgetLedgerPage = function () { return 'ledger'; };
globalThis.calculateAllProbabilities = function () { return 'calc'; };
(0, eval)(['fta_engine.js', 'engine_modules.js', 'fta_quant_modules.js', 'misc_fn_modules.js', 'unc_bands.js'].map(SITE).join('\n;\n'));
const U = globalThis.SLUnc;
const L = (id, p, ef) => ({ id, logicalId: 'L' + id, type: 'basic', probability: p, lambda: p, lambdaEF: ef, children: [] });

console.log('\n[1] band computation (real MC machinery)');
const withEF = { id: 'm1', root: { id: 1, type: 'gate', gateType: 'OR', children: [L(2, 1e-4, 3), L(3, 2e-4, 10)] } };
const b = U._compute(withEF);
check('EF-carrying tree → real P05<median<P95 band', b && !b.noEF && b.p05 < b.median && b.median < b.p95 && b.N === U.N, JSON.stringify(b));
const noEF = { id: 'm2', root: { id: 1, type: 'gate', gateType: 'OR', children: [L(2, 1e-4), L(3, 2e-4)] } };
check('no user EFs → honest noEF (band never invented)', U._compute(noEF).noEF === true);
check('_hasEF detects user error factors', U._hasEF(withEF.root) === true && U._hasEF(noEF.root) === false);
check('sampler runs on a COPY (live tree untouched)', /JSON\.parse\(JSON\.stringify\(page\.root\)\)/.test(src));

console.log('\n[2] honesty + lane');
check('tooltip states meaning: P05–P95, N, YOUR error factors, advisory', /central 90%/.test(src) && /YOUR error factors/.test(src) && /Advisory/.test(src));
check('band vs objective in words, never color-alone', /band meets objective/.test(src) && /P95 EXCEEDS objective/.test(src));
check('display lane — no store writes', !/(ftaPages\s*=(?!=)|projectConfig\.\w+\s*=(?!=)|\.lambda\s*=(?!=)|\.probability\s*=(?!=))/.test(src.replace(/\/\/[^\n]*/g, '')));

console.log('\n[3] wiring');
check('additive wraps: ledger render refreshes, quant recompute invalidates cache', globalThis.renderBudgetLedgerPage._uncWrapped === true && globalThis.calculateAllProbabilities._uncWrapped === true && /invalidate/.test(src));
check('wraps preserve returns (ledger stub; real calc not invocable headless)', globalThis.renderBudgetLedgerPage() === 'ledger');
check('idle-computed via SLIdle with backstop', /SLIdle\.schedule\('unc:/.test(src));
check('index.html loads unc_bands.js', /unc_bands\.js\?v=1\./.test(SITE('index.html')));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

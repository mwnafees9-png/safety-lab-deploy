#!/usr/bin/env node
/* Regression tests for TRD-1 — trade-study mode (trade_study.js). */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
function check(n, c, d) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } }
const SITE = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const src = SITE('trade_study.js');
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, addEventListener() {}, querySelector: () => ({ addEventListener() {}, value: '' }), remove() {} }), body: { appendChild() {} }, addEventListener() {}, readyState: 'complete' };
globalThis.showToast = () => {};
globalThis.TEMPLATE_SCHEMAS = {}; globalThis.renderFhaAsmLinksHtml = () => '';
globalThis._perfStats = {}; globalThis._cutsetWorker = null; globalThis._cutsetWorkerSeq = 0; globalThis._CUTSET_WORKER_MIN_NODES = 400;
globalThis.ftaConfig = { mode: 'bottom-up', apportion: 'equal', targetP: 1e-5, exposureTime: 1 };
globalThis.ftaPages = []; globalThis.acFhaData = []; globalThis.systemsData = []; globalThis.projectConfig = {};
(0, eval)(['fta_engine.js', 'engine_modules.js', 'fta_quant_modules.js', 'misc_fn_modules.js', 'trade_study.js'].map(SITE).join('\n;\n'));
const T = globalThis.SLTrade;
const L = (id, p) => ({ id, logicalId: 'L' + id, displayId: 'B' + id, name: 'e' + id, type: 'basic', probability: p, lambda: p, children: [] });
// A: two independent channels (AND) — B: single string (OR): B must be worse
const pageA = { id: 'a', name: 'dual channel', root: { id: 1, type: 'gate', gateType: 'AND', children: [L(2, 1e-3), L(3, 1e-3)] } };
const pageB = { id: 'b', name: 'single string', root: { id: 10, type: 'gate', gateType: 'OR', children: [L(11, 1e-3), L(12, 1e-3)] } };

console.log('\n[1] engine-lane evaluation (real engine)');
const A = T.evaluate(pageA), B = T.evaluate(pageB);
check('P(top) exact both sides (AND=1e-6, OR~2e-3)', Math.abs(A.pTop - 1e-6) < 1e-18 && Math.abs(B.pTop - (1 - Math.pow(1 - 1e-3, 2))) < 1e-15, A.pTop + ' / ' + B.pTop);
check('structure counts', A.events === 2 && A.gates === 1 && B.events === 2);
check('cut sets counted (A:1 of order 2, B:2 singles)', A.mcs === 1 && B.mcs === 2);
check('dominant contributor identified with FV', A.topContributor && typeof A.topContributor.fv === 'number');
check('graceful on empty page', T.evaluate({ id: 'x', root: null }).refusal === 'no tree');

console.log('\n[2] lane discipline + wiring');
const stripped = src.replace(/\/\/[^\n]*/g, '');
check('never writes to stores', !/(ftaPages\s*=(?!=)|projectConfig\.\w+\s*=(?!=)|\.lambda\s*=(?!=)|\.probability\s*=(?!=))/.test(stripped));
check('states differences, never chooses', /the choice is yours|choice stays yours/i.test(src) && !/recommend/i.test(stripped));
check('honest refusal on cutset budget', /refused \(enumeration budget\)/.test(src));
check('deep-copies trees (live objects untouched)', /JSON\.parse\(JSON\.stringify\(page\.root\)\)/.test(src) && pageA.root.children[0].probability === 1e-3);
const idx = SITE('index.html');
check('wired: script tag + toolbar injection next to heat', /trade_study\.js\?v=1\./.test(idx) && /btn-trade-study/.test(src) && /btn-importance-heat/.test(src));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

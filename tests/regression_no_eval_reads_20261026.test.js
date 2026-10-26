#!/usr/bin/env node
/*
 * Regression: no app file reads project state through eval first (26 Oct 2026).
 *
 * WHY: the app's Content-Security-Policy forbids eval (no 'unsafe-eval', on our server, a customer server and
 *   in the desktop app). fc_auto_trees.js v1.2 read acFhaData / systemsData / ftaPages with (0, eval)(...); under
 *   the CSP that threw, the window[...] fallback finds nothing for a top-level `let`, and at Radia the automatic
 *   fault trees were never made ("select trees shows no trees"). The same mistake hid in lock_seal.js (S5, 14 Sep)
 *   and node_identity_ui.js (19 Aug). Rule 5: SLEnv.get('name').
 * THE CHECK: every eval or new Function in site/*.js (vendor/ and dist/ aside) sits in a function that asks SLEnv
 *   first, so eval can only ever be a fallback for a test harness with no SLEnv. A bare eval read fails here.
 * MUTATION PROOF: SL_NOEVAL_MUTATE=1 checks a copy of fc_auto_trees.js with the v1.2 eval-first read put back: red.
 * Run: node tests/regression_no_eval_reads_20261026.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 700) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const files = fs.readdirSync(SITE).filter(f => f.endsWith('.js'));
const src = {};
for (const f of files) src[f] = fs.readFileSync(path.join(SITE, f), 'utf8');
if (process.env.SL_NOEVAL_MUTATE) src['fc_auto_trees.js'] = src['fc_auto_trees.js'].replace(/function _g\(n\) \{[\s\S]*?\n    \}\n/, "function _g(n) { try { return (0, eval)(n); } catch (_) { return root[n]; } }\n");
// the function body around an occurrence: back to the nearest `function` keyword before it
function enclosing(s, at) { const re = /\bfunction\b\s*[\w$]*\s*\(/g; let start = 0, m; while ((m = re.exec(s)) && m.index < at) start = m.index; return s.slice(start, at); }
const bad = [];
let seen = 0;
for (const f of files) {
    const s = src[f], re = /\(0,\s*eval\)|\bnew Function\s*\(|[^.\w]eval\s*\(/g; let m;
    while ((m = re.exec(s))) {
        const line = s.slice(0, m.index).split('\n').length, text = s.split('\n')[line - 1];
        const col = m.index - s.lastIndexOf('\n', m.index - 1) - 1;
        if (/^\s*(\/\/|\*)/.test(text) || text.slice(0, col).includes('//')) continue;   // a comment that names it
        seen++;
        if (!/SLEnv/.test(enclosing(s, m.index))) bad.push(f + ':' + line + '  ' + text.trim().slice(0, 140));
    }
}
check('the probe sees eval where it is (positive case: the SLEnv-first fallbacks in lock_seal, lane_trees, stale_watch)', seen >= 3, seen);
check('no file reads project state through eval without asking SLEnv first', bad.length === 0, bad.join('\n'));
check('fc_auto_trees.js reads the stores through SLEnv', /SLEnv/.test(src['fc_auto_trees.js']) && /_g\('acFhaData'\)/.test(src['fc_auto_trees.js']));
const env = fs.readFileSync(path.join(SITE, 'sl_env.js'), 'utf8');
for (const n of ['ftaPages', 'acFhaData', 'systemsData', 'SEVERITY_RANK', 'AutoReq', 'activeSystemId'])
    check('SLEnv reads ' + n, new RegExp('\\b' + n + ':\\s*function \\(\\) \\{ return ' + n + '; \\}').test(env));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

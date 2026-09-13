#!/usr/bin/env node
/*
 * Regression — silent failures reported (13 Sep 2026, R19 step 2).
 *
 * WHAT THE SWEEP FOUND. 41 promise chains that nobody caught: a prompt answered, an edit
 * attempted, a cut-set enumeration started, a jsPDF load, a "continue where you left off"
 * open — if the step failed, the person saw nothing happen. With error_watch.js (step 1)
 * an unhandled rejection is at least announced; this step makes every one of those chains
 * end in `.catch(function (e) { if (window.SLErrorWatch) SLErrorWatch.report(e, '<module>'); })`
 * so the failure is recorded under its module and told to the person, in plain language.
 *
 * PINNED:
 *   F1  each named module carries at least the number of report-catches the sweep added
 *   F2  no fire-and-forget chain is left bare (full-statement parse, same rules as the sweep;
 *       auth_gate's two-argument then and the unloaded perf_bench are the two known exceptions)
 *   F3  error_watch.js loads before every module that reports to it
 *   F4  every catch guards on window.SLErrorWatch, so a build without it still runs
 *   F5  mutation: removing one catch turns F1 and F2 red
 *
 * Run: node tests/regression_silent_failures.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const EXPECT = { a11_sequencing: 1, config_management: 1, continue_session: 2, cra_matrix: 3, exposure_case: 1, fracas_ledger: 2, fta_proposals: 2, fta_view_modules: 1, helpers_modules: 6, importance_heat: 3, mass_actions: 1, mfa: 1, misc_fn_modules: 1, notify_agents: 1, save_watch: 1, stpa_panel: 12 };
const CATCH = m => "SLErrorWatch.report(e, '" + m + "')";

function bareChains(src, name) {
  const out = []; let i = 0;
  while ((i = src.indexOf('.then(', i)) >= 0) {
    let st = i; while (st > 0) { const nl = src.lastIndexOf('\n', st - 1); const line = src.slice(nl + 1, st).trim(); if (line.startsWith('.') || line === '') { st = nl; continue; } st = nl + 1; break; }
    let j = i, depth = 0, inStr = null;
    for (; j < src.length; j++) { const c = src[j]; if (inStr) { if (c === '\\') { j++; continue; } if (c === inStr) inStr = null; continue; } if (c === "'" || c === '"' || c === '`') { inStr = c; continue; } if (c === '(' || c === '{' || c === '[') depth++; else if (c === ')' || c === '}' || c === ']') depth--; if (depth < 0) break; if (depth === 0 && c === ';') break; if (depth === 0 && c === '\n') { const rest = src.slice(j + 1, j + 200).trimStart(); if (!rest.startsWith('.')) break; } }
    const stmt = src.slice(st, j + 1); const head = src.slice(st, i).trim();
    const handled = /\.catch\(|\.finally\(/.test(stmt) || /\.then\([^;]*?,\s*(function|\(|[A-Za-z_$][\w$]*\s*\))/.test(stmt);
    const handed = /^(return|await|const|let|var|=|[\w$.]+\s*=)/.test(head) || /(?:return|=|\?|:|\(|,|\|\||&&)\s*$/.test(head) || /^\s*(return|await)\b/.test(head);
    if (!handled && !handed && depth >= 0) out.push(name + ':' + src.slice(0, i).split('\n').length);
    i = j > i ? j : i + 6;
  }
  return out;
}

console.log('[F1] every module carries its report-catches');
for (const m of Object.keys(EXPECT)) {
  const n = read(m + '.js').split(CATCH(m)).length - 1;
  check(m + '.js has ≥ ' + EXPECT[m] + ' report-catch' + (EXPECT[m] > 1 ? 'es' : ''), n >= EXPECT[m], 'found ' + n);
}

console.log('\n[F2] no fire-and-forget chain is left bare');
{
  const files = fs.readdirSync(SITE).filter(f => f.endsWith('.js') && !/^vendor|^demo_showcase/.test(f) && f !== 'auth_gate.js' && f !== 'perf_bench.js');
  let bare = [];
  for (const f of files) bare = bare.concat(bareChains(read(f), f));
  check('zero bare chains across site/*.js (auth_gate two-arg then and unloaded perf_bench excepted)', bare.length === 0, bare.slice(0, 8).join(', '));
}

console.log('\n[F3] error_watch loads first');
{
  const html = read('index.html');
  const order = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);
  const ew = order.indexOf('error_watch.js');
  const late = Object.keys(EXPECT).map(m => m + '.js').filter(f => order.indexOf(f) >= 0 && order.indexOf(f) < ew);
  check('error_watch.js precedes every reporting module', ew >= 0 && late.length === 0, late.join(','));
}

console.log('\n[F4] every catch is guarded');
{
  let unguarded = [];
  for (const m of Object.keys(EXPECT)) { const src = read(m + '.js'); const re = new RegExp("SLErrorWatch\\.report\\(e, '" + m + "'\\)", 'g'); let x; while ((x = re.exec(src))) { const before = src.slice(Math.max(0, x.index - 40), x.index); if (!/if \(window\.SLErrorWatch\)\s*$/.test(before)) unguarded.push(m + '@' + x.index); } }
  check('each report call sits behind `if (window.SLErrorWatch)`', unguarded.length === 0, unguarded.slice(0, 5).join(','));
}

console.log('\n[F5] mutation goes red');
{
  const src = read('stpa_panel.js'); const c = CATCH('stpa_panel');
  const at = src.indexOf('.catch(function (e) { if (window.SLErrorWatch) ' + c + '; })');
  const mutated = src.slice(0, at) + src.slice(at + ('.catch(function (e) { if (window.SLErrorWatch) ' + c + '; })').length);
  check('M1 (one catch removed): the count drops below the pin', (mutated.split(c).length - 1) < EXPECT.stpa_panel);
  check('M1: the full-statement parse finds the bare chain again', bareChains(mutated, 'stpa_panel.js').length === 1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

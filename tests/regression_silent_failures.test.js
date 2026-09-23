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
 * 23 Sep 2026: the F2 scanner was rebuilt (comment/string masking, bracket-matched
 * statement starts). The old one was blinded by apostrophes in comments and had
 * skipped whole regions; the rebuild found three genuinely uncaught chains
 * (bindings_modules key saves x2, stpa_panel element detail), now caught.
 *
 * Run: node tests/regression_silent_failures.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const EXPECT = { a11_sequencing: 1, config_management: 1, continue_session: 2, cra_matrix: 3, exposure_case: 1, fracas_ledger: 2, fta_proposals: 2, fta_view_modules: 1, helpers_modules: 6, importance_heat: 3, mass_actions: 1, mfa: 1, misc_fn_modules: 1, notify_agents: 1, save_watch: 1, stpa_panel: 13, bindings_modules: 2 };
const CATCH = m => "SLErrorWatch.report(e, '" + m + "')";

// 23 Sep 2026 — REBUILT. The old line-based scan read an apostrophe inside a
// // comment as the start of a string, ran away, and skipped whole regions of a
// file (in helpers_modules.js, ~5,600 lines went unchecked). It also judged a
// chain by the start of its LINE, so `for (...) chain = chain.then(...)`, the
// tail line of a multi-line `return x.reduce(...)`, and a two-argument then
// whose first callback contains `;` read as bare. Now: a masked copy of the
// source (comments, strings, regex-free) drives bracket matching, the chain's
// real statement start is found by walking back over enclosing brackets, and
// the then's own argument list is parsed for a rejection handler.
function _mask(src) {
  // same length; comments and string contents become spaces (quotes kept)
  const out = src.split(''); let i = 0, n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') out[i++] = ' '; continue; }
    if (c === '/' && src[i + 1] === '*') { out[i++] = ' '; out[i++] = ' '; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] !== '\n') out[i] = ' '; i++; } if (i < n) { out[i++] = ' '; out[i++] = ' '; } continue; }
    if (c === "'" || c === '"' || c === '`') { const q = c; i++; while (i < n && src[i] !== q) { if (src[i] === '\\') { out[i++] = ' '; } if (i < n && src[i] !== '\n') out[i] = ' '; i++; } i++; continue; }
    i++;
  }
  return out.join('');
}
function _openerBack(m, k) {  // m[k] is a closer; return index of its opener
  let d = 0;
  for (let x = k; x >= 0; x--) { const c = m[x]; if (c === ')' || c === '}' || c === ']') d++; else if (c === '(' || c === '{' || c === '[') { d--; if (d === 0) return x; } }
  return -1;
}
function bareChains(src, name, debug) {
  const out = []; const m = _mask(src); let i = 0;
  while ((i = m.indexOf('.then(', i)) >= 0) {
    // the chain's statement: back to the nearest ; { } at depth 0, stepping over enclosed brackets
    let st = i - 1;
    for (; st >= 0; st--) {
      const c = m[st];
      if (c === ')' || c === ']' ) { const o = _openerBack(m, st); if (o < 0) break; st = o; continue; }
      if (c === '}') { // a closed block/object inside the expression (e.g. a callback) — step over it unless it ends a statement
        const o = _openerBack(m, st); if (o < 0) break;
        // step over it only when it sits INSIDE an expression: an arrow body, a
        // function expression, or an object literal — never a statement block
        // (if/for/while body) or a function declaration
        const before = m.slice(Math.max(0, o - 300), o).trimEnd();
        const exprCtx = t => /(?:[=(,:?[]|=>|\breturn|&&|\|\|)$/.test(t.trimEnd());
        let inside = false;
        if (/=>$/.test(before)) inside = true;
        else { const fm = /function\s*[\w$]*\s*\([^)]*\)$/.exec(before); if (fm) inside = exprCtx(before.slice(0, fm.index)); else inside = exprCtx(before); }
        if (inside) { st = o; continue; }
        break;
      }
      if (c === ';' || c === '{' || c === '(' || c === '[' || c === ',') break;
    }
    let head = m.slice(st + 1, i).trim();
    const lead = src.slice(st, st + 1);   // what opened the enclosing context
    // strip a control header: for/while/if (...) body
    const hm = /^(for|while|if)\s*\(/.exec(head);
    if (hm) { const open = head.indexOf('('); let d = 0, k = open; for (; k < head.length; k++) { if (head[k] === '(') d++; else if (head[k] === ')') { d--; if (d === 0) break; } } head = head.slice(k + 1).trim(); }
    head = head.replace(/^else\b\s*/, '').replace(/^try\b\s*/, '');
    // the statement end, and the then's own arguments
    let j = i + 5, d = 0, topComma = false;
    for (; j < m.length; j++) { const c = m[j]; if (c === '(' || c === '{' || c === '[') d++; else if (c === ')' || c === '}' || c === ']') { d--; if (d === 0) break; } else if (c === ',' && d === 1) topComma = true; }
    let e = j + 1, d2 = 0;
    for (; e < m.length; e++) { const c = m[e]; if (c === '(' || c === '{' || c === '[') d2++; else if (c === ')' || c === '}' || c === ']') { d2--; if (d2 < 0) break; } else if (d2 === 0 && (c === ';' || c === ',')) break; else if (d2 === 0 && c === '\n') { const rest = m.slice(e + 1, e + 200).trimStart(); if (!rest.startsWith('.')) break; } }
    const stmt = m.slice(st + 1, e);
    // judged per STATEMENT (as before): any catch/finally or two-argument then in it handles it
    let twoArg = topComma;
    if (!twoArg) { let q = -1; while ((q = stmt.indexOf('.then(', q + 1)) >= 0) { let dd = 0, k = q + 5; for (; k < stmt.length; k++) { const c = stmt[k]; if (c === '(' || c === '{' || c === '[') dd++; else if (c === ')' || c === '}' || c === ']') { dd--; if (dd === 0) break; } else if (c === ',' && dd === 1) { twoArg = true; break; } } if (twoArg) break; } }
    const handled = twoArg || /\.catch\(|\.finally\(/.test(stmt);
    const handed = lead === '(' || lead === '[' || lead === ',' ||
      /^(return|await|const|let|var|yield)\b/.test(head) || /^[\w$.\[\]]+\s*(=|\+=|\|\|=|&&=|\?\?=)[^=]/.test(head) ||
      /(?:return|=|\?|:|\(|,|\|\||&&|=>)\s*$/.test(head.split('.then(')[0]) || /=>\s*[^{]/.test(head) && /^\(?[\w$, ]*\)?\s*=>/.test(head);
    if (debug) debug.push({ line: src.slice(0, i).split('\n').length, head, lead, handled });
    if (!handled && !handed) out.push(name + ':' + src.slice(0, i).split('\n').length);
    i = Math.max(i + 6, e);   // one verdict per statement
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
  // the scan must not be blinded by a comment: an apostrophe in a comment before a bare chain
  const probe = "// it's a comment with an apostrophe\nfunction a() { return x.then(f).catch(g); }\n// don't stop here\nfoo().then(function () { bar(); });\n";
  check('a comment apostrophe cannot hide a bare chain (the old scan skipped ~5,600 lines this way)', bareChains(probe, 'probe').length === 1, JSON.stringify(bareChains(probe, 'probe')));
  const ok = "for (var i = 0; i < n; i++) chain = chain.then(f);\nfunction z() { return list.reduce(function (c, e) {\n  return c.then(g);\n}, Promise.resolve()).then(function () { return 1; }); }\np.then(function (a) { x(); y(); }, function () {});\n";
  check('handed-on and two-argument chains are not flagged', bareChains(ok, 'ok').length === 0, JSON.stringify(bareChains(ok, 'ok')));
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

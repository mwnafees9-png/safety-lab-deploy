#!/usr/bin/env node
/*
 * Regression — every shipped JavaScript file must actually parse.
 *
 * WHY THIS EXISTS. On 1 Aug 2026 an edit to ai_assistant.js put an apostrophe
 * and a nested pair of quotes inside a single-quoted string. The file was
 * broken — `node --check` rejected it — and the entire wall stayed green:
 * 2,600-odd checks, zero failures. The suite that was supposed to be guarding
 * that very edit passed too, because it regex-matches the SOURCE TEXT rather
 * than parsing it, and a regex is perfectly happy to find its pattern inside a
 * file the engine will refuse to load.
 *
 * Eleven suites read ai_assistant.js. None of them parsed it. So the largest and
 * most-edited file in the product could ship syntactically broken, and the only
 * thing standing between that and production was somebody running node --check
 * by hand and remembering to look at the output.
 *
 * WHAT THIS CHECKS, AND WHY THAT IS ENOUGH. Parsing is not behaviour. A file
 * that parses can still be wrong in every way the rest of the wall exists to
 * catch. But a file that does NOT parse is wrong in the one way that makes every
 * other check meaningless — the module never loads, so nothing it defines exists,
 * and a source-text assertion about it is measuring a corpse.
 *
 * Cheap, total, and it fails loudly with the offending line.
 *
 * Run: node tests/regression_parse_all.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');

const files = fs.readdirSync(SITE).filter(f => f.endsWith('.js')).sort();

console.log('\n[parse] every shipped .js file compiles');
const broken = [];
files.forEach(f => {
  const src = fs.readFileSync(path.join(SITE, f), 'utf8');
  try {
    // Compile only. Never run — these files touch window/document on load and
    // several self-mount into the DOM. A syntax error throws here; a runtime
    // dependency does not, which is exactly the line we want to be checking.
    new vm.Script(src, { filename: f });
  } catch (e) {
    broken.push(f + ': ' + (e && e.message ? e.message.split('\n')[0] : String(e)));
  }
});
check(files.length + ' files parsed', broken.length === 0, broken.join(' | '));
check('the sweep actually found files to check', files.length > 50, String(files.length));

// The specific file that motivated this. Pinned by name so a future refactor
// that moves it cannot silently drop it from coverage.
console.log('\n[parse] the file that shipped broken');
{
  const target = 'ai_assistant.js';
  check(target + ' is in the swept set', files.indexOf(target) >= 0);
  let ok = true, msg = '';
  try { new vm.Script(fs.readFileSync(path.join(SITE, target), 'utf8'), { filename: target }); }
  catch (e) { ok = false; msg = e.message.split('\n')[0]; }
  check(target + ' parses', ok, msg);
}

// A source-text assertion is only meaningful if the file it reads can load.
// This is the lesson, encoded: any suite that greps a file should be able to
// assume it parses, and now can.
console.log('\n[parse] the test files themselves');
{
  const T = __dirname;
  const tf = fs.readdirSync(T).filter(f => f.endsWith('.test.js'));
  const badT = [];
  tf.forEach(f => {
    // Test files are CommonJS modules: Node wraps them in a function before
    // compiling, which makes a top-level `return` legal. Compiling the raw text
    // with vm.Script does NOT wrap, so a perfectly good test file reports
    // "Illegal return statement". Wrap it the way Node does, or the check
    // invents failures — which it did on the first run, against a file whose
    // own suite passes 21 checks.
    // Strip the shebang FIRST. Node removes `#!...` before wrapping; prepending
    // the wrapper without doing so pushes `#!` off byte 0 and every single
    // file reports "Invalid or unexpected token" — which is what the first
    // version of this fix did, turning one false failure into ninety-five.
    const raw = fs.readFileSync(path.join(T, f), 'utf8');
    const src = raw.replace(/^#![^\n]*\n/, '');
    const wrapped = '(function (exports, require, module, __filename, __dirname) {' + src + '\n})';
    try { new vm.Script(wrapped, { filename: f }); }
    catch (e) { badT.push(f + ': ' + e.message.split('\n')[0]); }
  });
  check(tf.length + ' test files parsed', badT.length === 0, badT.join(' | '));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

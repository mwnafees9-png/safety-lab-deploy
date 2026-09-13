#!/usr/bin/env node
/*
 * Regression — the global error catcher (13 Sep 2026, R19 step 1).
 *
 * WHAT THE SWEEP FOUND. Nothing in the app listened for uncaught errors or unhandled
 * rejections; a broken button on the desktop app looked like a button that did nothing.
 *
 * PINNED:
 *   E1  an uncaught error is recorded (kind, module, message) and announced once through showToast
 *   E2  an unhandled rejection is recorded with the reason's message and stack
 *   E3  the same error repeating inside a minute is counted, not re-announced; the ring holds 60
 *   E4  cross-origin stubs, CDN files and the ResizeObserver notice are ignored
 *   E5  it never throws: no showToast, a null event, a non-Error reason
 *   E6  report(err, where) records without throwing and names the module
 *   E7  wiring: error_watch.js loads with defer right after fn_wrap.js, before every app module
 *   E8  mutations go red: dedupe removed -> re-announced; filter removed -> CDN noise recorded
 *
 * Run: node tests/regression_error_watch.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const SRC = fs.readFileSync(path.join(SITE, 'error_watch.js'), 'utf8');

function boot(src, withToast) {
  const listeners = {}; const toasts = []; const logs = [];
  const ctx = {
    console: { error: m => logs.push(String(m)), log() {}, warn() {} },
    Date, location: { origin: 'https://app.safetylabaero.com' },
    module: undefined,
  };
  ctx.window = { addEventListener: (k, fn) => { listeners[k] = fn; } };
  if (withToast) ctx.showToast = (msg, type) => toasts.push({ msg, type });
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { api: ctx.window.SLErrorWatch, listeners, toasts, logs, ctx };
}

console.log('[E1] an uncaught error is recorded and announced once');
{
  const b = boot(SRC, true);
  b.listeners.error({ message: 'Cannot set properties of null (setting \'innerHTML\')', filename: 'https://app.safetylabaero.com/helpers_modules.js?v=3.1', lineno: 11167, colno: 65, error: new Error('Cannot set properties of null') });
  const r = b.api.recent();
  check('one entry in the ring', r.length === 1);
  check('kind, module and message are captured', r[0] && r[0].kind === 'error' && r[0].module === 'helpers_modules.js' && /innerHTML/.test(r[0].message), JSON.stringify(r[0]));
  check('announced once through showToast, as an error, in plain language', b.toasts.length === 1 && b.toasts[0].type === 'error' && /Something went wrong in helpers modules/.test(b.toasts[0].msg) && /Your work is saved/.test(b.toasts[0].msg), JSON.stringify(b.toasts));
  check('the console got the full line', b.logs.length === 1 && /\[error_watch\] error in helpers_modules.js/.test(b.logs[0]));
}

console.log('\n[E2] an unhandled rejection is recorded');
{
  const b = boot(SRC, true);
  const e = new TypeError('fetch failed'); e.stack = 'TypeError: fetch failed\n    at load (https://app.safetylabaero.com/cloud_sync.js?v=2.2:10:5)';
  b.listeners.unhandledrejection({ reason: e });
  const r = b.api.recent();
  check('recorded as unhandledrejection with the reason\'s message', r.length === 1 && r[0].kind === 'unhandledrejection' && /TypeError: fetch failed/.test(r[0].message));
  check('the module is read from the stack when there is no filename', r[0].module === 'cloud_sync.js', r[0].module);
  check('the stack is kept for the console', /at load/.test(r[0].stack));
}

console.log('\n[E3] repeats are counted, not re-announced; the ring is bounded');
{
  const b = boot(SRC, true);
  for (let i = 0; i < 5; i++) b.listeners.error({ message: 'boom', filename: 'https://app.safetylabaero.com/a.js', error: null });
  check('five identical errors make one entry with four repeats', b.api.recent().length === 1 && b.api.recent()[0].repeats === 4);
  check('and one toast', b.toasts.length === 1);
  check('count() still counts every occurrence', b.api.count() === 5);
  for (let i = 0; i < 80; i++) b.listeners.error({ message: 'distinct ' + i, filename: 'https://app.safetylabaero.com/b.js', error: null });
  check('the ring holds the last 60', b.api.recent().length === 60 && /distinct 79/.test(b.api.recent()[59].message));
  check('toasts are rate-limited (one per 8 s) even for distinct errors', b.toasts.length === 1, 'toasts: ' + b.toasts.length);
}

console.log('\n[E4] noise that is not ours is ignored');
{
  const b = boot(SRC, true);
  b.listeners.error({ message: 'Script error.', filename: '', error: null });
  b.listeners.error({ message: 'ResizeObserver loop completed with undelivered notifications.', filename: 'https://app.safetylabaero.com/x.js', error: null });
  b.listeners.error({ message: 'Uncaught SyntaxError', filename: 'https://cdn.jsdelivr.net/npm/chart.js', error: null });
  check('cross-origin stub, ResizeObserver notice and a CDN file record nothing', b.api.recent().length === 0 && b.toasts.length === 0, JSON.stringify(b.api.recent()));
  b.listeners.error({ message: 'real', filename: 'https://app.safetylabaero.com/reports.js?v=1', error: null });
  check('…while our own file is recorded', b.api.recent().length === 1);
  check('a relative source (no origin) counts as ours', b.api._ours('helpers_modules.js?v=3.1:10:2', 'x') === true);
  check('localhost and 127.0.0.1 count as ours (the smoke gate, the dev loop)', b.api._ours('http://127.0.0.1:5000/a.js', 'x') && b.api._ours('http://localhost:8080/a.js', 'x'));
}

console.log('\n[E5] it never throws');
{
  const b = boot(SRC, false);
  let threw = false;
  try { b.listeners.error(null); b.listeners.unhandledrejection(null); b.listeners.unhandledrejection({ reason: 'a string' }); b.listeners.unhandledrejection({ reason: 42 }); b.listeners.error({ message: 'no toast here', filename: 'https://app.safetylabaero.com/a.js' }); } catch (e) { threw = true; }
  check('null events, primitive reasons and a missing showToast are all survived', !threw);
  check('the string reason was still recorded', b.api.recent().some(e => e.message === 'a string'));
}

console.log('\n[E6] report() for the catch blocks');
{
  const b = boot(SRC, true);
  const e = b.api.report(new RangeError('bad index'), 'fta_quant_modules');
  check('records the error under the named module', e && e.kind === 'reported' && e.module === 'fta_quant_modules.js' && /RangeError: bad index/.test(e.message), JSON.stringify(e));
  check('a report with no error object still records', !!b.api.report('plain text', 'x'));
  b.api.mute(true); b.api._reset(); b.api.report(new Error('quiet'), 'y');
  check('mute() stops the toast but not the record', b.api.recent().length === 1 && b.toasts.length === 2, 'toasts ' + b.toasts.length);
}

console.log('\n[E7] wiring in index.html');
{
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const tags = [...html.matchAll(/<script src="([^"?]+)(?:\?v=([\d.]+))?"[^>]*>/g)].map(m => ({ f: m[1], v: m[2], tag: m[0] }));
  const idx = tags.findIndex(t => t.f === 'error_watch.js');
  const fnw = tags.findIndex(t => t.f === 'fn_wrap.js');
  check('error_watch.js is loaded', idx >= 0);
  check('right after fn_wrap.js (before every app module, after the config and license guards)', idx === fnw + 1, 'index ' + idx + ' fn_wrap ' + fnw);
  check('with defer, like the rest of the app', idx >= 0 && /defer/.test(tags[idx].tag));
  check('pinned at ≥ 1.0', idx >= 0 && parseFloat(tags[idx].v) >= 1.0, tags[idx] && tags[idx].v);
  check('the module never uses a native dialog', !/\b(alert|confirm|prompt)\(/.test(SRC));
}

console.log('\n[E8] mutations go red');
{
  const m1 = SRC.replace("if (prev && (t - prev.at) < DEDUPE_MS) { prev.repeats++; prev.at = t; return prev; }", "");
  const b1 = boot(m1, true);
  for (let i = 0; i < 3; i++) b1.listeners.error({ message: 'boom', filename: 'https://app.safetylabaero.com/a.js', error: null });
  check('M1 (dedupe removed): three identical errors become three entries — the E3 check would fail', b1.api.recent().length === 3);
  const m2 = SRC.replace("if (/^Script error\\.?$/.test(msg.trim())) return false;", "");
  const b2 = boot(m2, true);
  b2.listeners.error({ message: 'Script error.', filename: '', error: null });
  check('M2 (cross-origin filter removed): the stub is recorded — the E4 check would fail', b2.api.recent().length === 1);
  check('the mutated sources actually differ from the shipped one', m1 !== SRC && m2 !== SRC);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

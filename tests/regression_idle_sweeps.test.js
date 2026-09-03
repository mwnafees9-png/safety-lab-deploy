#!/usr/bin/env node
/*
 * Regression tests for ENG-4 — time-sliced background work (idle_scheduler.js
 * + the autosave and leading-indicators rewires).
 *
 * Locks:
 *   [1] SLIdle semantics: coalescing by name (last writer wins), cancel,
 *       pending, synchronous flush, timeout backstop passed through,
 *       setTimeout fallback when requestIdleCallback is absent.
 *   [2] autosave: the debounced write goes through SLIdle('autosave') with a
 *       backstop; the max-wait write too; _flushAutosave cancels the pending
 *       idle job before writing synchronously (no double write, no loss).
 *   [3] leading indicators: the invariant sweep runs via SLIdle('lead-sweep'),
 *       never inside the render call; cached results render immediately; the
 *       idle completion re-renders.
 *
 * Run:  node tests/regression_idle_sweeps.test.js
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

// ---- [1] SLIdle semantics with a controllable fake requestIdleCallback ------
globalThis.window = globalThis;
const _ric = [];   // queued idle callbacks
globalThis.requestIdleCallback = (cb, opts) => { _ric.push({ cb, opts }); return _ric.length; };
globalThis.cancelIdleCallback = (h) => { if (_ric[h - 1]) _ric[h - 1].cancelled = true; };
function fireIdle() { const q = _ric.splice(0); q.forEach(e => { if (!e.cancelled) e.cb({ timeRemaining: () => 50, didTimeout: false }); }); }

(0, eval)(SITE('idle_scheduler.js'));
const I = globalThis.SLIdle;

console.log('\n[1] SLIdle semantics');
check('exports schedule/cancel/pending/flush', !!I && ['schedule', 'cancel', 'pending', 'flush'].every(k => typeof I[k] === 'function'));
let ran = [];
I.schedule('a', () => ran.push('a1'), { timeout: 1234 });
check('pending after schedule', I.pending('a'));
check('timeout backstop passed to requestIdleCallback', _ric[0] && _ric[0].opts && _ric[0].opts.timeout === 1234);
I.schedule('a', () => ran.push('a2'));
check('coalesced by name — one queued callback, last writer wins', _ric.length === 1);
fireIdle();
check('runs the REPLACED fn exactly once', ran.join(',') === 'a2' && !I.pending('a'));
ran = [];
I.schedule('b', () => ran.push('b'));
I.cancel('b');
fireIdle();
check('cancel drops the job', ran.length === 0 && !I.pending('b'));
I.schedule('c', () => ran.push('c'));
check('flush runs synchronously and clears', (I.flush('c'), ran.join(',') === 'c' && !I.pending('c')));
check('flush on nothing returns false', I.flush('nope') === false);
check('errors in jobs are contained', (I.schedule('d', () => { throw new Error('boom'); }), fireIdle(), true));

console.log('\n[2] autosave rewire (source-level + behavioral)');
const misc = SITE('misc_fn_modules.js');
// 2 Sep 2026 — SUPERSEDED. scheduleAutosave no longer arms a 2s debounce that idle-schedules
// the write; that debounce was the data-loss window Waqas hit ("I want saving per change").
// It now writes on a coalesced microtask, so the two SLIdle('autosave') schedules and the
// max-wait timer are gone by design. The idle infrastructure [1] is unchanged and still
// tested above; what changed is that AUTOSAVE stopped using it. The exit flush still writes
// synchronously (it cancels any idle job defensively — that line is retained). The executed
// proof of the new cadence lives in regression_persave; here we pin the removal so the old
// behaviour cannot silently return.
check('autosave no longer idle-schedules a debounced write (per-change cadence)',
  !/SLIdle\.schedule\('autosave', _writeAutosave/.test(misc));
check('the 2s debounce and 30s max-wait timers are gone from scheduleAutosave',
  !/_autosaveDebounceTimer = setTimeout/.test(misc) && !/_autosaveMaxWaitTimer = setTimeout/.test(misc));
check('scheduleAutosave writes on a coalesced microtask instead', /queueMicrotask\(_flush\)/.test(misc) && /if \(_autosaveFlushQueued\) return;/.test(misc));
check('the exit flush still cancels any pending idle job then writes sync', /SLIdle\.cancel\('autosave'\); \} catch \(_\) \{\}\n        _writeAutosave\(\);/.test(misc));

console.log('\n[3] leading-indicators rewire (behavioral)');
{
  const _store = {};
  globalThis.localStorage = { getItem: k => _store[k] || null, setItem: (k, v) => { _store[k] = v; }, removeItem: k => { delete _store[k]; } };
  const hosts = {};
  globalThis.document = { getElementById: id => hosts[id] || null, createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }), addEventListener() {}, readyState: 'complete' };
  hosts['dash-leading'] = { innerHTML: '', };
  globalThis.switchTab = () => {};
  globalThis.updateDashboard = function () { return 'dash'; };
  let sweeps = 0;
  globalThis.invRun = () => { sweeps++; return { hardFails: 1, advisories: 2, results: [{ id: 'INV-05', failCount: 4 }] }; };
  globalThis.etaCouplingFindings = () => [];
  globalThis.ftaPages = [];
  (0, eval)(SITE('ux_leading.js'));
  const L = globalThis.LeadingIndicators;
  const first = L.compute();
  check('render path does NOT run the sweep synchronously', sweeps === 0 && first.thread === null);
  check("sweep queued as SLIdle('lead-sweep')", I.pending('lead-sweep'));
  fireIdle();
  check('idle completion runs the sweep once and re-renders from cache', sweeps === 1 && hosts['dash-leading'].innerHTML.indexOf('Golden-thread breaks') !== -1);
  const second = L.compute();
  check('fresh cache serves without re-sweeping', sweeps === 1 && second.thread && second.thread.hard === 1 && second.dalDebt === 4);
}

console.log('\n[4] wiring');
const idx = SITE('index.html');
check('index.html loads idle_scheduler.js before its consumers', idx.indexOf('idle_scheduler.js?v=') !== -1 && idx.indexOf('idle_scheduler.js?v=') < idx.indexOf('ux_leading.js?v='));
// rule 12 — pins are FLOORS, not equalities (the old exact match broke on the
// A9 ux_leading 1.2 bump, 21 Aug 2026).
check('versions bumped (misc present, lead ≥ 1.1)', /misc_fn_modules\.js\?v=[\d.]+/.test(idx) &&
  parseFloat((idx.match(/ux_leading\.js\?v=([\d.]+)/) || [])[1] || '0') >= 1.1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

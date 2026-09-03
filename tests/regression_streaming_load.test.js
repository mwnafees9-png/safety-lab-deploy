#!/usr/bin/env node
/*
 * Regression tests for ENG-5 — staged project load (streaming_load.js +
 * the _applyProjectData rewire).
 *
 * Locks:
 *   [1] staging semantics: the active tab's renders run synchronously; the
 *       rest queue as idle jobs; without SLIdle everything runs inline.
 *   [2] flush-on-entry: switching to a tab with a pending deferred render
 *       runs that render synchronously BEFORE the tab shows (wrapped
 *       switchTab), so no user can ever see an empty table.
 *   [3] the load rewire: _applyProjectData routes through SLStream with the
 *       legacy inline block as fallback; the load-end autosave write is
 *       idle-scheduled with _autosavePending set (flush-on-hide covers it).
 *   [4] wiring: script order (SLIdle → SLStream), version bumps, additive
 *       switchTab wrap marked _slsWrapped.
 *
 * Run:  node tests/regression_streaming_load.test.js
 */
'use strict';
const fs = require('fs');
const PIN = require('./lib/pinfloor.js');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const SITE = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

// ---- harness: controllable idle queue + render spies -------------------------
globalThis.window = globalThis;
const _ric = [];
globalThis.requestIdleCallback = (cb, opts) => { _ric.push({ cb, opts }); return _ric.length; };
globalThis.cancelIdleCallback = (h) => { if (_ric[h - 1]) _ric[h - 1].cancelled = true; };
function fireIdle() { const q = _ric.splice(0); q.forEach(e => { if (!e.cancelled) e.cb({ timeRemaining: () => 50, didTimeout: false }); }); }
globalThis.document = { getElementById: () => null, addEventListener() {}, readyState: 'complete' };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const calls = [];
['renderACFunctions', 'renderACFCIM', 'renderACFHA', 'renderACReq', 'renderACAssumptions', 'renderPRA', 'renderZSA', 'renderFMEA', 'renderFlightPhases']
  .forEach(fn => { globalThis[fn] = () => calls.push(fn); });
globalThis.switchTab = function (t) { return 'orig-' + t; };

(0, eval)(SITE('idle_scheduler.js'));
(0, eval)(SITE('streaming_load.js'));
const S = globalThis.SLStream;

console.log('\n[1] staging semantics');
check('exports stageLoadRenders/flushFor/pendingCount', !!S && typeof S.stageLoadRenders === 'function' && typeof S.flushFor === 'function');
S.stageLoadRenders('ac-fha');
check('active tab renders synchronously', calls.join(',') === 'renderACFHA');
check('the other eight queue as idle jobs', S.pendingCount() === 8);
fireIdle();
check('idle frames drain the queue — every table rendered exactly once', calls.length === 9 && new Set(calls).size === 9 && S.pendingCount() === 0);

console.log('\n[2] flush-on-entry');
calls.length = 0;
S.stageLoadRenders('dashboard');   // dashboard has no staged renders — all nine queue
check('nothing synchronous for an uncovered active tab', calls.length === 0 && S.pendingCount() === 9);
const r = globalThis.switchTab('zsa');   // user beats the idle frame
check('entering a tab flushes its render BEFORE the tab shows', calls.join(',') === 'renderZSA' && r === 'orig-zsa');
check('flushed job leaves the queue', S.pendingCount() === 8);
globalThis.switchTab('zsa');
check('re-entry does not double-render', calls.filter(c => c === 'renderZSA').length === 1);
fireIdle();
check('remaining renders drain on idle', calls.length === 9);

console.log('\n[3] the load rewire (source-level)');
const dops = SITE('data_ops_modules.js');
check('_applyProjectData routes through SLStream with active tab', /SLStream\.stageLoadRenders\(_recoveryTab\)/.test(dops));
check('legacy inline block kept as fallback', /renderACFunctions\(\); renderACFCIM\(\); renderACFHA\(\); renderACReq\(\); renderACAssumptions\(\);\n            renderPRA\(\); renderZSA\(\); renderFMEA\(\); renderFlightPhases\(\);/.test(dops));
check('load-end autosave write idle-scheduled with pending flag', /_autosavePending = true; SLIdle\.schedule\('autosave', _writeAutosave, \{ timeout: 2500 \}\)/.test(dops));

console.log('\n[4] wiring');
const idx = SITE('index.html');
check('SLIdle loads before SLStream', idx.indexOf('idle_scheduler.js?v=') !== -1 && idx.indexOf('idle_scheduler.js?v=') < idx.indexOf('streaming_load.js?v='));
// 20 Aug 2026 — was parseFloat(...) >= 66.3, which is not a version comparison. Bumping the
// pin 66.9 → 66.10 FAILED this check (66.1 < 66.9) while a stale 66.9 would have PASSED a
// 66.30 floor. Component-wise now; see tests/lib/pinfloor.js.
check('data_ops buster at or past 66.3',
  PIN.pinAtLeast(PIN.pinOf(idx, 'data_ops_modules.js'), '66.3'));
check('switchTab wrap additive + marked', globalThis.switchTab._slsWrapped === true && (SITE('streaming_load.js').match(/_slsWrapped = true/g) || []).length === 1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/*
 * Regression tests for UX-3 — the K350 exercise track (k350_exercises.js).
 *
 * Locks:
 *   [1] display-lane discipline: checks are READ-ONLY over live state; the
 *       module never writes stores, never creates data, never persists
 *       progress (completion is computed, not stored).
 *   [2] the six checks: each transitions pending→pass exactly when the real
 *       state says so, driven end-to-end on stubbed stores.
 *   [3] copy guardrails: two-lane discipline stated; protected mechanisms
 *       never named.
 *   [4] wiring: script tag; Getting Started trigger (#sl-onramp pattern);
 *       modal namespace exq-*.
 *
 * Run:  node tests/regression_k350_exercises.test.js
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
const src = SITE('k350_exercises.js');

// ---- globals ----------------------------------------------------------------
globalThis.window = globalThis;
const _dom = {};
globalThis.document = { getElementById: id => _dom[id] || null, createElement: () => ({ style: {}, addEventListener: () => {}, querySelector: () => ({ addEventListener: () => {} }), remove: () => {} }), body: { appendChild: () => {} }, addEventListener: () => {}, readyState: 'complete' };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.ftaPages = [];
globalThis.acAssumptionsData = [];
globalThis.systemsData = [];
globalThis.projectConfig = {};
globalThis.activeFTAPageId = null;
globalThis.ImportanceHeat = { isOn: () => false };

(0, eval)(src);
const X = globalThis.K350Exercises;
const state = () => Object.fromEntries(X.evaluate().map(r => [r.id, r.pass]));

console.log('\n[1] display-lane discipline');
check('exports evaluate/open/close + the six exercises', !!X && typeof X.evaluate === 'function' && X.EXERCISES.length === 6);
const stripped = src.replace(/\/\/[^\n]*/g, '');
check('never writes to stores', !/(\.probability\s*=(?!=)|\.lambda\s*=(?!=)|ftaPages\s*=(?!=)|ftaPages\.push|acAssumptionsData\s*=(?!=)|acAssumptionsData\.push|systemsData\s*=(?!=)|projectConfig\.\w+\s*=(?!=))/.test(stripped));
check('progress computed, never persisted', !/localStorage\.setItem/.test(src) && /never stored/.test(src));

console.log('\n[2] the six checks, driven end-to-end');
check('all pending on empty state', Object.values(state()).every(v => v === false));
// EX1 — practice page with gate + two events
const L = (id) => ({ id, type: 'basic', children: [] });
const practice = { id: 'pg-x', name: 'My Practice tree', root: { id: 1, type: 'gate', gateType: 'AND', children: [L(2), L(3)] } };
globalThis.ftaPages.push({ id: 'other', name: 'SSA page', root: { id: 9, type: 'gate', children: [] } }, practice);
check('EX1 passes once the named page has 1 gate + 2 events', state().EX1 === true);
check('EX2 still pending (no rates)', state().EX2 === false);
// EX2 — user λ on both leaves
practice.root.children[0].lambda = 2e-5;
practice.root.children[1].lambda = 3e-6;
check('EX2 passes when both events carry user rates', state().EX2 === true);
check('EX3 still pending (no computed top)', state().EX3 === false);
// EX3 — engine computed the top
practice.root.probability = 6e-11;
check('EX3 passes when the top event carries a computed value', state().EX3 === true);
// EX4 — heat on + practice page active
check('EX4 pending while heat off', state().EX4 === false);
globalThis.ImportanceHeat = { isOn: () => true };
check('EX4 pending while heat on but another page active', state().EX4 === false);
globalThis.activeFTAPageId = 'pg-x';
check('EX4 passes with heat on + practice page active', state().EX4 === true);
// EX5 — assumption mentioning practice (system-level source counts too)
globalThis.systemsData.push({ name: 'EPS', asm: [{ text: 'Practice: pump λ from supplier data pending test', state: 'Proposed' }] });
check('EX5 passes on an assumption naming “practice” (any scope)', state().EX5 === true);
// EX6 — fresh sweep alone is NOT enough (the dashboard strip keeps it fresh);
// the Thread Integrity panel must have been opened this session.
globalThis.projectConfig.invariantsLast = { at: new Date(Date.now() - 5 * 60 * 1000).toISOString() };
check('EX6 pending on fresh sweep alone (strip keeps it fresh — not a visit)', state().EX6 === false);
_dom['gt-invariants-panel'] = { id: 'gt-invariants-panel' };
check('EX6 passes once Thread Integrity was actually opened + sweep fresh', state().EX6 === true);
globalThis.projectConfig.invariantsLast = { at: new Date(Date.now() - 3 * 3600 * 1000).toISOString() };
check('EX6 goes stale after 30 min (must re-open Thread Integrity)', state().EX6 === false);
check('full track completable', (globalThis.projectConfig.invariantsLast = { at: new Date().toISOString() }, Object.values(state()).every(v => v === true)));

console.log('\n[3] copy guardrails');
const copy = X.EXERCISES.map(e => e.title + ' ' + e.body).join(' ');
check('protected mechanisms never named', !/DALgebra|AutoReq|rebalanc|solver|algorithm/i.test(copy));
check('two-lane discipline stated', /your value|engine never invents a number/.test(copy) && /computed, exact, never yours to type/.test(copy));

console.log('\n[4] wiring');
const idx = SITE('index.html');
check('index.html loads k350_exercises.js', /k350_exercises\.js\?v=1\./.test(idx));
check('Getting Started trigger (same #sl-onramp pattern as the tour)', /sl-onramp/.test(src) && /exq-launch/.test(src) && /MutationObserver/.test(src));
check('dashboard fallback launcher (onramp self-dismisses for returning users)', /exq-dash-launch/.test(src) && /dash-leading/.test(src));
check('own exq-* modal namespace', /exq-modal/.test(src) && !/k350-tour/.test(src) && !/mt-overlay/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

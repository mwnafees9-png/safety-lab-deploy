#!/usr/bin/env node
/*
 * Regression tests for UX-4 — dashboard leading-indicators strip (ux_leading.js)
 * + the theme-aware CCF cut-set row (v66.12 / css 65.37).
 *
 * Locks:
 *   [1] display-lane discipline: the strip counts and routes — it never
 *       originates a number, verdict, or classification, and never writes.
 *   [2] signal plumbing: infeasible-λ counter walks the engine's
 *       _feasibilityViolation lane; DAL debt reads INV-05 out of invRun
 *       results; couplings come from etaCouplingFindings; the invariant
 *       sweep is throttled so dashboard refreshes don't re-stamp in a loop.
 *   [3] wiring: script tag, #dash-leading injected after #dash-posture,
 *       additive wrap on updateDashboard (_leadWrapped), ckpt-tile design
 *       system reused, every tile routes via switchTab.
 *   [4] CCF cut-set row: class-based tint (no hardcoded #f3e8ff inline),
 *       dark-theme rule present in the stylesheet.
 *
 * Run:  node tests/regression_ux_leading.test.js
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
const src = SITE('ux_leading.js');
const fv = SITE('fta_view_modules.js');
const css = SITE('safety_lab.css');

// ---- globals ----------------------------------------------------------------
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} }), addEventListener: () => {}, readyState: 'complete' };

// Stub the app signals with known values.
globalThis.invRun = () => ({
  at: 'T', pass: false, hardFails: 2, advisories: 1,
  results: [
    { id: 'INV-02', sev: 'hard', failCount: 2, pass: false },
    { id: 'INV-05', sev: 'advisory', failCount: 3, pass: false }
  ]
});
globalThis.etaCouplingFindings = () => [{ kind: 'coupling-unmodeled' }, { kind: 'coupling-unmodeled' }];
globalThis.ftaPages = [
  { id: 'p1', root: { id: 1, type: 'gate', children: [
      { id: 2, type: 'basic', _feasibilityViolation: { achievable: 1e-6, allocated: 1e-9, delta: 1000 }, children: [] },
      { id: 3, type: 'basic', children: [] } ] } },
  { id: 'p2', root: { id: 4, type: 'gate', children: [
      { id: 5, type: 'undeveloped', _feasibilityViolation: { achievable: 1e-5, allocated: 1e-7, delta: 100 }, children: [] } ] } }
];
globalThis.updateDashboard = function () { return 'dash'; };

(0, eval)(SITE('ux_leading.js'));
const L = globalThis.LeadingIndicators;

console.log('\n[1] display-lane discipline');
check('exports compute/render only', !!L && typeof L.compute === 'function' && typeof L.render === 'function');
const stripped = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
check('never writes to stores', !/(\.probability\s*=|\.lambda\s*=|ftaPages\s*=|acFhaData\s*=|projectConfig\s*=)/.test(stripped));
check('counts and routes only — no own math on safety numbers', !/Math\.random/.test(src) && /switchTab/.test(src));

console.log('\n[2] signal plumbing (stubbed signals)');
const s = L.compute();
check('golden-thread breaks from invRun (2 hard, 1 advisory)', s.thread && s.thread.hard === 2 && s.thread.adv === 1, JSON.stringify(s.thread));
check('couplings from etaCouplingFindings (2)', s.couplings === 2);
check('infeasible λ walks the engine lane across pages (2 leaves)', s.infeasible === 2);
check('DAL debt reads INV-05 failCount (3)', s.dalDebt === 3);
check('invariant sweep throttled (TTL)', /SWEEP_TTL_MS/.test(src) && /_lastSweep/.test(src));
// Throttle actually holds: swap invRun and confirm the cached sweep is reused.
let calls = 0;
globalThis.invRun = () => { calls++; return { hardFails: 0, advisories: 0, results: [] }; };
L.compute(); L.compute();
check('second compute inside the TTL does not re-run invRun', calls === 0, calls + ' extra call(s)');

console.log('\n[3] wiring');
const idx = SITE('index.html');
check('index.html loads ux_leading.js', /ux_leading\.js\?v=1\./.test(idx));
check('host injected after #dash-posture', /dash-leading/.test(src) && /posture\.parentNode\.insertBefore/.test(src));
check('additive wrap on updateDashboard, marked', /_leadWrapped/.test(src) && (src.match(/_leadWrapped = true/g) || []).length === 1);
check('wrap is live in this harness', globalThis.updateDashboard._leadWrapped === true);
check('ckpt design system reused (tiles + tones)', /ckpt-tile/.test(src) && /ckpt-tile-label/.test(src) && /ckpt-posture/.test(src));
check('all four tiles route to fix-it surfaces', /gt-integrity/.test(src) && /'eta'/.test(src) && /'fta'/.test(src) && /'cma'/.test(src));

console.log('\n[4] CCF cut-set row — theme-aware tint');
check('hardcoded light lavender removed from the row builder', !/background-color: #f3e8ff; border-left: 3px solid #8b5cf6;/.test(fv));
check('class-based row tint in the builder', /cutset-row-ccf/.test(fv));
check('stylesheet carries light + dark rules', /\.cutset-row-ccf \{ background-color: #f3e8ff/.test(css) && /body\.theme-dark \.cutset-row-ccf/.test(css));
// Pinned to an exact version this failed on every unrelated CSS change, which
// trains people to edit the test rather than think. What it actually needs to
// guarantee is that the cache-buster moved past the build that shipped these
// rules — otherwise returning browsers keep the stylesheet without them.
const cssVer = PIN.pinOf(idx, 'safety_lab.css');
check('stylesheet version is at or past the build that added these rules',
  PIN.pinAtLeast(cssVer, '65.38'), 'found v=' + cssVer + ', expected >= 65.38');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

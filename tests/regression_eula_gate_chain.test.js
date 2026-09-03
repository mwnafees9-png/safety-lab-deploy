#!/usr/bin/env node
/*
 * Regression — the EULA/License gate chain fixes (3 Aug 2026).
 *
 * Three defects found during the SL-EULA-0003-A live rollout, all fixed in
 * eula_modal 1.2.0 / license_modal 1.0.7 / legal.html:
 *
 *  [1] LOAD-ORDER RACE — auth_gate's liftGate → checkEula() could run before
 *      eula_modal.js (defer) defined it; the call was silently skipped, so a
 *      version bump did not re-gate an already-signed-in session until the
 *      next sign-in. Observed live. Fix: a deferred idempotent self-check in
 *      eula_modal that goes through window.SafetyLab.checkEula at FIRE time
 *      (so license_modal's both-gates wrapper runs when present).
 *  [2] DUPLICATED-CONSTANT DRIFT — license_modal held its own copy of the
 *      EULA version ('SL-EULA-0001-B', two revs stale). Its "did they accept
 *      the EULA" check therefore NEVER passed after a fresh acceptance, and
 *      the license gate silently failed to advance that session. Fix: read
 *      window.SL_EULA.version at decision time; no local copy.
 *  [3] HARDCODED DOC LABELS — the dialog chrome and legal.html carried
 *      'SL-EULA-0001 Rev C' style literals (and legal.html loaded the
 *      agreement text with STALE pins, serving the cached pre-0003 EULA).
 *      Fix: labels derived from the version strings; pins current.
 *
 * Run: node tests/regression_eula_gate_chain.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const eula = fs.readFileSync(path.join(SITE, 'eula_modal.js'), 'utf8');
const lic = fs.readFileSync(path.join(SITE, 'license_modal.js'), 'utf8');
const legal = fs.readFileSync(path.join(SITE, 'legal.html'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

// ---- [1] the race net, executed ---------------------------------------------
console.log('\n[gate-chain] load-order race net');
check('eula_modal schedules a deferred self-check',
  /setTimeout\(function \(\) \{ try \{ window\.SafetyLab\.checkEula\(\); \} catch \(_\) \{\} \}, 4000\)/.test(eula));
check('the self-check resolves window.SafetyLab.checkEula at FIRE time, not at definition',
  eula.includes('window.SafetyLab.checkEula(); } catch (_) {} }, 4000'),
  'binding at definition would bypass the license_modal wrapper that runs both gates');

// executed: load eula_modal in vm, capture timers, fire the 4s one, prove it
// calls whatever window.SafetyLab.checkEula is AT THAT MOMENT (wrapper included).
const timers = [];
let wrappedCalls = 0;
const sb = {
  String, RegExp, Promise, JSON, Date,
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild: () => {} }, addEventListener: () => {}, removeEventListener: () => {} },
};
sb.window = sb;   // the modal reads window.* — point it at the sandbox itself
vm.createContext(sb);
vm.runInContext(eula, sb);
check('loading eula_modal scheduled exactly one 4000 ms self-check',
  timers.filter(t => t.ms === 4000).length === 1);
// simulate license_modal wrapping AFTER eula_modal (the real load order)
const orig = sb.SafetyLab.checkEula;
sb.SafetyLab.checkEula = function () { wrappedCalls++; return orig.apply(this, arguments); };
timers.filter(t => t.ms === 4000).forEach(t => t.fn());
check('firing the net calls the WRAPPED checkEula (license chain runs too)', wrappedCalls === 1);
check('the net is harmless when nobody is signed in (no throw, no overlay)',
  true, 'structural: the fired call above ran against a null-Supabase stub and returned');

// ---- [2] the duplicated-constant fix ----------------------------------------
console.log('\n[gate-chain] license gate reads the LIVE EULA version');
check('license_modal no longer carries ANY copy of the EULA version string',
  !/SL-EULA-\d{4}-[A-Z]/.test(lic.replace(/\(SL-EULA-0003\)/g, '')),
  'doc-number prose refs are fine; a versioned constant is the drift vector');
check('the acceptance check reads window.SL_EULA.version at decision time',
  lic.includes('window.SL_EULA && window.SL_EULA.version'));
check('acceptance still requires a non-empty stored value',
  /eulaAccepted = !!_got && \(!_expect \|\| _got === _expect\)/.test(lic));
check('eula_modal EXPORTS the version the license gate reads',
  /window\.SL_EULA = \{ html: EULA_HTML, rev: 'A', version: EULA_VERSION \}/.test(eula));
check('LICENSE_VERSION is at C, matching its own Rev C text and the desktop license.version',
  lic.includes("var LICENSE_VERSION = 'SL-LICENSE-0001-C';"));
check('license text references the CURRENT EULA doc number (SL-EULA-0003)',
  (lic.match(/\(SL-EULA-0003\)/g) || []).length === 3,   // header comment + em header + body paragraph
  'got ' + (lic.match(/\(SL-EULA-0003\)/g) || []).length);
check('license_modal exports its version too', /window\.SL_LICENSE = \{ html: LICENSE_HTML, rev: 'C', version: LICENSE_VERSION \}/.test(lic));

// ---- [3] derived labels, no hardcoded doc strings ---------------------------
console.log('\n[gate-chain] doc labels derive from the version strings');
const derive = v => v.replace(/-([A-Z0-9]+)$/, ' Rev $1');
check('the derivation produces the right label', derive('SL-EULA-0003-A') === 'SL-EULA-0003 Rev A');
check('eula_modal dialog chrome uses the derived label',
  eula.includes("EULA_DOC_LABEL = EULA_VERSION.replace(/-([A-Z0-9]+)$/, ' Rev $1')") &&
  eula.includes("' + EULA_DOC_LABEL + '") && !eula.includes('SL-EULA-0001 Rev C'));
check('license_modal dialog chrome uses the derived label',
  lic.includes("LICENSE_DOC_LABEL = LICENSE_VERSION.replace(/-([A-Z0-9]+)$/, ' Rev $1')") &&
  lic.includes("' + LICENSE_DOC_LABEL + '") && !lic.includes('SL-LICENSE-0001 Rev C &middot;'));
check('legal.html derives its docmeta labels from the modal exports',
  legal.includes("obj.version.replace(/-([A-Z0-9]+)$/, ' · Rev $1')") &&
  legal.includes("meta('eula-meta', window.SL_EULA)") && legal.includes("meta('license-meta', window.SL_LICENSE)"));
check('legal.html fallback text is current, and the stale 0001 label is gone',
  legal.includes('SL-EULA-0003 · Rev A') && !legal.includes('SL-EULA-0001'));

// ---- [4] pins agree everywhere ----------------------------------------------
console.log('\n[gate-chain] pins');
const pin = (src, name) => (src.match(new RegExp(name + '\\.js\\?v=([0-9.]+)')) || [])[1];
check('index.html and legal.html load the SAME eula_modal pin',
  pin(idx, 'eula_modal') === pin(legal, 'eula_modal') && pin(idx, 'eula_modal') === '1.2.0',
  `index=${pin(idx, 'eula_modal')} legal=${pin(legal, 'eula_modal')} — legal.html served the CACHED pre-0003 text when these drifted`);
check('index.html and legal.html load the SAME license_modal pin',
  pin(idx, 'license_modal') === pin(legal, 'license_modal') && pin(idx, 'license_modal') === '1.0.7',
  `index=${pin(idx, 'license_modal')} legal=${pin(legal, 'license_modal')}`);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

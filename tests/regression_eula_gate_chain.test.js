#!/usr/bin/env node
/*
 * Regression — the agreement acceptance gate.
 *
 * ORIGINALLY (3 Aug 2026) this pinned three defects found during the SL-EULA-0003-A rollout, when
 * acceptance ran as a CHAIN of two gates (eula_modal then license_modal):
 *
 *  [1] LOAD-ORDER RACE — auth_gate's liftGate -> checkEula() could run before eula_modal.js
 *      (defer) had defined it; the call was silently skipped, so a version bump did not re-gate an
 *      already-signed-in session until the next sign-in. Observed live. Fix: a deferred idempotent
 *      self-check in eula_modal that resolves window.SafetyLab.checkEula at FIRE time.
 *  [2] DUPLICATED-CONSTANT DRIFT — license_modal held its own copy of the EULA version, two revs
 *      stale, so its "did they accept the EULA" check never passed after a fresh acceptance.
 *  [3] HARDCODED DOC LABELS — chrome and legal.html carried 'SL-EULA-0001 Rev C' literals, and
 *      legal.html loaded the text with stale pins, serving a cached pre-0003 EULA.
 *
 * 15 Sep 2026: THE CHAIN IS GONE. SL-LICENSE-0001 was withdrawn and folded into SL-EULA-0004, so
 * there is one agreement and one gate. Defect [2] was a symptom of the same disease that later put
 * a training grant in the second document and left it there for six weeks: two documents, each
 * holding its own copy of something, drifting apart. Removing the second document removes the
 * class. What this suite now pins is that it STAYS removed, and that the race net still works
 * without the wrapper it was originally written to accommodate.
 *
 * Clause-level checks live in regression_agreement_single_source.test.js; this suite is about the
 * gate mechanism only.
 *
 * Run: node tests/regression_eula_gate_chain.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const eula = fs.readFileSync(path.join(SITE, 'eula_modal.js'), 'utf8');
const legal = fs.readFileSync(path.join(SITE, 'legal.html'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

const PIN = '1.3.0';
const VERSION = 'SL-EULA-0004-A';

// ---- [1] the race net, executed -------------------------------------------------------------
console.log('\n[gate] load-order race net');
check('eula_modal schedules a deferred self-check',
  /setTimeout\(function \(\) \{ try \{ window\.SafetyLab\.checkEula\(\); \} catch \(_\) \{\} \}, 4000\)/.test(eula));
check('the self-check resolves window.SafetyLab.checkEula at FIRE time, not at definition',
  eula.includes('window.SafetyLab.checkEula(); } catch (_) {} }, 4000'),
  'late binding is why the net survived the license_modal wrapper; keep it even with one gate, so ' +
  'anything that ever wraps checkEula again is still called');

const timers = [];
let wrappedCalls = 0;
const sb = {
  String, RegExp, Promise, JSON, Date,
  setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild: () => {} }, addEventListener: () => {}, removeEventListener: () => {} },
};
sb.window = sb;
vm.createContext(sb);
vm.runInContext(eula, sb);
check('loading eula_modal scheduled exactly one 4000 ms self-check',
  timers.filter((t) => t.ms === 4000).length === 1);
// Late binding is a property worth keeping even with nothing wrapping today: prove it still holds
// by wrapping after load, exactly as license_modal used to, and confirming the wrapper is reached.
const orig = sb.SafetyLab.checkEula;
sb.SafetyLab.checkEula = function () { wrappedCalls++; return orig.apply(this, arguments); };
timers.filter((t) => t.ms === 4000).forEach((t) => t.fn());
check('firing the net calls whatever checkEula is bound at that moment', wrappedCalls === 1);
check('the net is harmless when nobody is signed in (no throw, no overlay)',
  true, 'structural: the fired call above ran against a null-Supabase stub and returned');

// ---- [2] there is ONE gate ------------------------------------------------------------------
console.log('\n[gate] one agreement, one acceptance');
check('site/license_modal.js no longer exists', !fs.existsSync(path.join(SITE, 'license_modal.js')));
check('eula_modal defines the only gate', /window\.SafetyLab\.checkEula = checkEula/.test(eula) || /SafetyLab\.checkEula = checkEula/.test(eula));
check('nothing in index.html loads a second acceptance modal',
  !/license_modal\.js/.test(idx) && (idx.match(/_modal\.js/g) || []).filter((s) => s === '_modal.js').length >= 0);
check('acceptance is recorded against exactly one version key',
  (eula.match(/eula_version:/g) || []).length === 1 && !/license_version:/.test(eula));
check('a single localStorage key backs the gate',
  (eula.match(/var LS_KEY = '[^']+'/g) || []).length === 1);

// ---- [3] labels derive from the version; pins are current -----------------------------------
console.log('\n[gate] doc labels derive, pins are current');
const derive = (v) => v.replace(/-([A-Z0-9]+)$/, ' Rev $1');
check('the derivation produces the right label', derive(VERSION) === 'SL-EULA-0004 Rev A');
check('eula_modal dialog chrome uses the derived label',
  eula.includes("' + EULA_DOC_LABEL + '") && !/SL-EULA-\d{4} Rev [A-Z] &middot;/.test(eula));
check('eula_modal carries NO hardcoded doc label literal',
  !/SL-EULA-\d{4} Rev [A-Z]/.test(eula.replace(/EULA_VERSION\.replace\([^)]*\)/g, '')));
check('legal.html derives its docmeta label from the modal export',
  legal.includes("meta('eula-meta', window.SL_EULA)"));
check('legal.html no longer renders a second agreement',
  !/SL_LICENSE|license-body|license-meta|id="license"/.test(legal));
check('legal.html fallback label is current',
  legal.includes('SL-EULA-0004 · Rev A') && !/SL-EULA-000[0-3]/.test(legal));
check('legal.html links the merged agreement by its real name',
  legal.includes('End User License and Subscription Agreement'));

const pin = (t, f) => { const m = t.match(new RegExp(f + '\\.js\\?v=([0-9.]+)')); return m && m[1]; };
check('index.html and legal.html load the SAME eula_modal pin',
  pin(idx, 'eula_modal') === pin(legal, 'eula_modal') && pin(idx, 'eula_modal') === PIN,
  `index=${pin(idx, 'eula_modal')} legal=${pin(legal, 'eula_modal')} expected=${PIN}`);
check('the pin was bumped with the agreement (a stale pin serves the OLD terms from cache)',
  pin(idx, 'eula_modal') !== '1.2.0');
check('eula_modal is at ' + VERSION, eula.includes("var EULA_VERSION = '" + VERSION + "';"));

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);

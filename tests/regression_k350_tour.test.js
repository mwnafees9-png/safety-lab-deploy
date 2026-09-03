#!/usr/bin/env node
/*
 * Regression tests for Backlog #6b — the K350 guided tour (onboarding_tour.js).
 *
 * jsdom-backed where available. Locks:
 *   [1] module exports + step integrity (12 steps, titles/bodies/valid tabs,
 *       every spotlight target id present in index.html or a known dynamic nav).
 *   [2] PROTECTED-IP guardrail: no step text names DALgebra/AutoReq or any
 *       solver mechanism vocabulary — concepts only.
 *   [3] guardrail language: numbers-are-yours + advisory posture present.
 *   [4] start on an empty session loads the showcase via loadSampleProject
 *       (the existing audited path) and opens step 1 of 12.
 *   [5] start with user data present routes through an explicit confirmation.
 *   [6] navigation: next/back move, Finish marks done + removes overlay.
 *   [7] read-only discipline: the tour writes no analysis stores.
 *   [8] on-ramp trigger injection + index.html script tag.
 *
 * Run:  node tests/regression_k350_tour.test.js
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
const indexHtml = SITE('index.html');

// ---- globals ----------------------------------------------------------------
globalThis.window = globalThis;
globalThis.projectName = '';
globalThis.acFunctionsData = []; globalThis.acFhaData = []; globalThis.systemsData = []; globalThis.ftaPages = [];
globalThis.acReqData = []; globalThis.cmaData = [];
const _lsStore = {};
globalThis.localStorage = { getItem: k => (k in _lsStore ? _lsStore[k] : null), setItem: (k, v) => { _lsStore[k] = String(v); }, removeItem: k => { delete _lsStore[k]; } };
globalThis.showToast = () => {};
const tabsVisited = [];
globalThis.switchTab = t => { tabsVisited.push(t); };
let sampleLoads = 0;
globalThis.loadSampleProject = async () => { sampleLoads++; globalThis.projectName = 'K350 Kestrel'; };
let confirmCalls = 0, confirmGo = null;
globalThis.confirmModal = (msg, go) => { confirmCalls++; confirmGo = go; };

const jsdomOk = (() => { try { require('/tmp/jsdom-env/node_modules/jsdom'); return true; } catch (_) { return false; } })();
if (jsdomOk) {
  const { JSDOM } = require('/tmp/jsdom-env/node_modules/jsdom');
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.innerWidth = 1440; globalThis.innerHeight = 900;
} else {
  globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {}, querySelector: () => null }), addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], readyState: 'complete', body: { appendChild: () => {} } };
}

(0, eval)(SITE('onboarding_tour.js'));
const G = globalThis;
const T = G.K350Tour;

console.log('\n[1] exports + step integrity');
check('K350Tour exported with start/next/back/end/isActive/STEPS',
      !!T && ['start', 'next', 'back', 'end', 'isActive'].every(k => typeof T[k] === 'function') && Array.isArray(T.STEPS));
check('twelve steps, all titled with substantive bodies',
      T.STEPS.length === 12 && T.STEPS.every(s => s.title && s.body && s.body.length > 80));
const VALID_TABS = new Set([null]);
(indexHtml.match(/switchTab\('([a-z0-9-]+)'\)/g) || []).forEach(m => VALID_TABS.add(m.slice(11, -2)));
VALID_TABS.add('budget'); VALID_TABS.add('ffs'); VALID_TABS.add('asa-surface');   // dynamic self-registering pages
VALID_TABS.add('pasa');   // 23 Aug 2026 — opened by the spine's PASA button (JS), not a rail row
// 23 Aug 2026 (2) — the Prove pages moved to the strip; their tabs are opened
// by strip pills declared in bindings, not by rail rows in index.html.
['trace', 'gt-integrity', 'evpkg', 'appa', 'validation', 'cm', 'review', 'pr', 'mod', 'sora-thread'].forEach(t => VALID_TABS.add(t));
// 23 Aug 2026 (3) — the AFHA pages are area tabs now (prove_tabs v1.1).
['ac-func', 'ac-fcim', 'ac-asm', 'ac-req'].forEach(t => VALID_TABS.add(t));
check('every step tab is a real tab id', T.STEPS.every(s => VALID_TABS.has(s.tab)), JSON.stringify(T.STEPS.map(s => s.tab)));
check('every spotlight target resolves to a nav id (static or dynamic)',
      // 23 Aug 2026 (2) — strip pills (Prove cluster) carry their ids in
      // bindings_modules.js (snavId), rendered at runtime like budget's row.
      T.STEPS.every(s => !s.target || indexHtml.indexOf('id="' + s.target.slice(1) + '"') !== -1 || SITE('budget_ledger.js').indexOf("'" + s.target.slice(1) + "'") !== -1 || SITE('bindings_modules.js').indexOf("'" + s.target.slice(1) + "'") !== -1),
      JSON.stringify(T.STEPS.map(s => s.target)));

console.log('\n[2] protected-IP guardrail — concepts only');
const stepText = T.STEPS.map(s => s.title + ' ' + s.body).join(' ');
check('no DALgebra in any step text', stepText.indexOf('DALgebra') === -1);
check('no AutoReq in any step text', stepText.indexOf('AutoReq') === -1);
check('no solver-mechanism vocabulary (rebalanc/solver/decrement)', !/rebalanc|solver|decrement/i.test(stepText));

console.log('\n[3] house-rules language present');
check('numbers are the user\'s (never invents a number)', /never invents a number|yours to enter/.test(stepText));
check('advisory posture named', /advisory/i.test(stepText));
check('dev-error qualitative lane taught', /4\.1\.1\.1/.test(stepText) && /◇/.test(stepText));
check('AI drafts / core owns numbers', /AI drafts; the deterministic core owns every number/.test(stepText));

if (jsdomOk) {
  console.log('\n[4] start on an empty session → showcase loads, step 1/12');
  T.start();
  setTimeout(() => {
    check('loadSampleProject called once (audited path)', sampleLoads === 1, String(sampleLoads));
    check('tour active on step 1', T.isActive() && document.getElementById('k350-tour-prog').textContent === '1 / 12',
          document.getElementById('k350-tour-prog') && document.getElementById('k350-tour-prog').textContent);
    check('no confirmation needed on empty session', confirmCalls === 0);

    console.log('\n[5] navigation');
    T.next();
    check('next → step 2, dashboard tab visited', document.getElementById('k350-tour-prog').textContent === '2 / 12' && tabsVisited.indexOf('dashboard') !== -1);
    T.back();
    check('back → step 1', document.getElementById('k350-tour-prog').textContent === '1 / 12');
    for (let i = 0; i < 12; i++) T.next();   // 11 moves to step 12, 12th fires Finish
    check('finish → done recorded + overlay removed', !T.isActive() && _lsStore['safetyLab.k350TourState.v1'] === 'done' && !document.getElementById('k350-tour-overlay'));

    console.log('\n[6] start with user data → explicit confirmation');
    globalThis.projectName = 'My real program';
    globalThis.acFhaData = [{ internalId: 1 }];
    T.start();
    check('confirmModal gates the data replacement', confirmCalls === 1);
    confirmGo();
    setTimeout(() => {
      check('confirmed → sample loads and tour starts', sampleLoads === 2 && T.isActive());
      T.end();

      console.log('\n[7] read-only discipline');
      check('tour never wrote to analysis stores', G.acFunctionsData.length === 0 && G.systemsData.length === 0 && G.ftaPages.length === 0 && G.cmaData.length === 0);
      const src = SITE('onboarding_tour.js');
      check('no assignments to safety stores in source', !/(acFhaData|acFunctionsData|systemsData|ftaPages|acReqData|cmaData)\s*(=[^=]|\.push|\.splice)/.test(src));

      console.log('\n[8] wiring');
      check('on-ramp trigger injection present', /k350-tour-launch/.test(src) && /sl-onramp/.test(src));
      check('index.html loads onboarding_tour.js', indexHtml.indexOf('onboarding_tour.js?v=') !== -1);

      console.log('\n' + pass + ' passed, ' + fail + ' failed');
      process.exit(fail ? 1 : 0);
    }, 30);
  }, 30);
} else {
  console.log('\n  SKIP  jsdom unavailable — [4]–[7] runtime checks skipped');
  const src = SITE('onboarding_tour.js');
  check('on-ramp trigger injection present', /k350-tour-launch/.test(src) && /sl-onramp/.test(src));
  check('index.html loads onboarding_tour.js', indexHtml.indexOf('onboarding_tour.js?v=') !== -1);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

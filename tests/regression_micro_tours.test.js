#!/usr/bin/env node
/*
 * Regression tests for UX-2 — contextual micro-tours (micro_tours.js).
 *
 * Locks:
 *   [1] registry shape: every tour has a name and 2+ steps, every step a
 *       title + body + target; the covered surfaces are the intended six.
 *   [2] guardrails in the copy: no solver mechanisms (DALgebra/AutoReq never
 *       named, no rebalance/solver vocabulary); the two-lane discipline is
 *       stated wherever numbers appear; nothing promises the tool decides.
 *   [3] behavior: pill invite (never auto-start), per-surface localStorage
 *       state, K350 tour always wins, dismiss marks 'skipped', finish marks
 *       'done', switchTab wrapped additively (_mtWrapped).
 *   [4] wiring: script tag in index.html, own mt-* ids, z-index below the
 *       K350 overlay so the spine tour renders on top.
 *
 * Run:  node tests/regression_micro_tours.test.js
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
const src = SITE('micro_tours.js');

// ---- globals ----------------------------------------------------------------
const _store = {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: k => (k in _store ? _store[k] : null), setItem: (k, v) => { _store[k] = String(v); }, removeItem: k => { delete _store[k]; } };
const _made = [];
globalThis.document = {
  getElementById: () => null,
  createElement: () => { const el = { style: {}, children: [], listeners: {}, setAttribute: () => {}, appendChild: c => el.children.push(c), remove: () => {}, querySelector: () => ({ style: {}, textContent: '', addEventListener: () => {} }), addEventListener: () => {} }; _made.push(el); return el; },
  querySelector: () => null,
  body: { appendChild: () => {} },
  addEventListener: () => {},
  readyState: 'complete'
};
let _tabCalls = [];
globalThis.switchTab = function (t) { _tabCalls.push(t); return 'orig-' + t; };
globalThis.K350Tour = { isActive: () => false };

(0, eval)(src);
const MT = globalThis.MicroTours;

console.log('\n[1] registry shape');
check('module exports the API', !!MT && typeof MT.start === 'function' && typeof MT.seen === 'function' && MT.TOURS);
const keys = Object.keys(MT.TOURS);
check('covers the six intended surfaces', ['fta', 'ipledger', 'budget', 'eta', 'cma', 'golden-thread'].every(k => keys.includes(k)) && keys.length === 6, keys.join(','));
check('every tour: name + 2..3 steps, every step: title/body/target',
  keys.every(k => { const t = MT.TOURS[k]; return t.name && Array.isArray(t.steps) && t.steps.length >= 2 && t.steps.length <= 3 && t.steps.every(s => s.title && s.body && s.target); }));

console.log('\n[2] copy guardrails');
const allCopy = keys.flatMap(k => MT.TOURS[k].steps.map(s => s.title + ' ' + s.body)).join(' ');
check('protected mechanisms never named', !/DALgebra|AutoReq|rebalanc|solver|algorithm/i.test(allCopy), (allCopy.match(/DALgebra|AutoReq|rebalanc|solver|algorithm/i) || [])[0]);
check('two-lane discipline stated where numbers live', /yours to enter|engine never invents a number/.test(MT.TOURS['fta'].steps.map(s => s.body).join(' ')) && /you enter and own/.test(MT.TOURS['eta'].steps.map(s => s.body).join(' ')));
check('advisory posture language present (tool computes, human signs)', /advisory/.test(allCopy) && /sign-off is a human act|Signature is an act/.test(allCopy));
check('findings named, never resolved silently', /named finding|names the disagreement|says so plainly|shows you the damage/.test(allCopy));

console.log('\n[3] behavior');
check('pill invite — tours never auto-start on tab switch', /_pillShow\(tabId\)/.test(src) && !/start\(tabId\)/.test(src.replace(/addEventListener\('click', function \(\) \{ start\(key\); \}\)/, '')));
check('switchTab wrapped additively, marked', globalThis.switchTab._mtWrapped === true && (src.match(/_mtWrapped = true/g) || []).length === 1);
check('wrap preserves the original return value', globalThis.switchTab('nonexistent-tab') === 'orig-nonexistent-tab');
check('K350 tour always wins', /_k350Active\(\)/.test(src) && /if \(_k350Active\(\)\) \{ _pillRemove\(\); return; \}/.test(src) && /\|\| _k350Active\(\)\) return;/.test(src));
// State transitions through the real API:
check('unseen before any interaction', !MT.seen('fta'));
MT.start('fta');                    // starts step 0
check('start() activates', MT.isActive());
MT.end();                           // abandoned mid-tour → skipped
check('abandon marks skipped (never nags again)', MT.seen('fta') && JSON.parse(_store['safetyLab.microTours.v1']).fta === 'skipped');
MT.start('eta'); MT.next(); MT.next();   // 2-step tour → done
check('finish marks done', JSON.parse(_store['safetyLab.microTours.v1']).eta === 'done' && !MT.isActive());
check('start() refuses unknown keys', (MT.start('nope'), !MT.isActive()));

console.log('\n[4] wiring');
const idx = SITE('index.html');
check('index.html loads micro_tours.js', /micro_tours\.js\?v=1\./.test(idx));
check('own mt-* namespace, no collisions with the K350 overlay', /mt-overlay/.test(src) && /mt-card/.test(src) && !/k350-tour-overlay/.test(src));
check('renders under the K350 overlay (z-index 99980 < 99990)', /99980/.test(src));
check('per-surface state key versioned', /safetyLab\.microTours\.v1/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/*
 * Regression — the particular-risk catalogue (catalogue_data.js), 5 Aug 2026.
 *
 * The catalogue is what the PRA lane OFFERS. That makes its failure mode the
 * quiet one this project keeps meeting: a risk that is not in the catalogue is
 * never proposed, so an assessment that omits it looks complete. Seven ARP4761A
 * App L.1.3 risks were missing until this pass — fuel leakage, battery thermal
 * runaway, RAT burst, high-pressure duct rupture, wheel flange release,
 * hazardous chemical container rupture and pressure bulkhead rupture.
 *
 * The category check is the other half of the same disease: the catalogue
 * browser GROUPS entries by PR_CATEGORIES, so an entry whose category is not in
 * that array renders nowhere at all while still being present in the data.
 *
 * Run: node tests/regression_pra_catalogue.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(SITE, 'catalogue_data.js'), 'utf8') +
    '\n;globalThis.__CAT = PARTICULAR_RISK_CATALOGUE; globalThis.__KIND = PR_CATEGORIES;', ctx);
const CAT = ctx.__CAT, KINDS = ctx.__KIND;

// ---- [1] structure ----------------------------------------------------------
console.log('\n[pra-catalogue] every entry is complete and reachable');
check('the catalogue loads and is non-trivial', Array.isArray(CAT) && CAT.length >= 20, 'entries: ' + (CAT || []).length);
check('every entry carries the fields the PRA form fills from',
  CAT.every(e => e.id && e.name && e.category && Array.isArray(e.regulations) && e.regulations.length &&
                 Array.isArray(e.typicalPhases) && e.typicalPhases.length && e.defaultDesc && e.defaultMitigation),
  JSON.stringify(CAT.filter(e => !(e.id && e.name && e.category && e.regulations && e.typicalPhases && e.defaultDesc && e.defaultMitigation)).map(e => e.id)));
check('every entry sits in a category the browser actually renders',
  CAT.every(e => KINDS.indexOf(e.category) >= 0),
  'unlisted: ' + JSON.stringify(CAT.filter(e => KINDS.indexOf(e.category) < 0).map(e => e.id + ':' + e.category)) +
  ' — the browser groups by PR_CATEGORIES, so an unlisted category means the entry is invisible while still being in the data');
check('ids are unique', new Set(CAT.map(e => e.id)).size === CAT.length);
check('no entry offers a mitigation that is merely a restatement of the description',
  CAT.every(e => e.defaultMitigation !== e.defaultDesc && e.defaultMitigation.length > 80));

// ---- [2] the App L.1.3 gap closure -----------------------------------------
console.log('\n[pra-catalogue] the seven App L.1.3 risks that were missing');
const NEEDED = {
  'fuel-leakage': /fuel/i,
  'battery-thermal-runaway': /battery|thermal runaway/i,
  'rat-burst': /ram air turbine/i,
  'hp-duct-rupture': /duct/i,
  'wheel-flange-release': /wheel|flange/i,
  'chemical-container-rupture': /chemical|container/i,
  'pressure-bulkhead-rupture': /bulkhead/i,
};
Object.keys(NEEDED).forEach(id => {
  const e = CAT.find(x => x.id === id);
  check('catalogue offers "' + id + '"', !!e && NEEDED[id].test(e.name),
    'a risk absent from the catalogue is never proposed, so the assessment that omits it looks complete');
});
check('each of the seven names a regulation, not just a description',
  Object.keys(NEEDED).every(id => { const e = CAT.find(x => x.id === id); return e && e.regulations.some(r => /CFR|CS |AC |DO-/.test(r)); }));
check('battery thermal runaway is distinguished from a generic fire threat',
  (() => { const e = CAT.find(x => x.id === 'battery-thermal-runaway');
           return e && /oxidiser|propagat/i.test(e.defaultDesc); })(),
  'it carries its own oxidiser and propagates cell to cell — an entry that does not say so is a fire entry wearing a battery label');
check('wheel flange release is distinguished from tyre burst',
  (() => { const e = CAT.find(x => x.id === 'wheel-flange-release');
           return e && /tyre burst|tread/i.test(e.defaultDesc); })(),
  'different fragment, different trajectory, different envelope — assessed as one case, one of them is unassessed');

// ---- [3] copyright posture --------------------------------------------------
console.log('\n[pra-catalogue] copyright posture');
{
  const src = fs.readFileSync(path.join(SITE, 'catalogue_data.js'), 'utf8');
  const sae = ['ARP4761A', 'ARP 4761A', 'ARP4754B'];
  const quoted = sae.filter(s => new RegExp('["“][^"”]{0,40}' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(src));
  check('SAE material is referenced by clause number and title only, never quoted',
    quoted.length === 0, JSON.stringify(quoted));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

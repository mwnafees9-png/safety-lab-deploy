#!/usr/bin/env node
/*
 * Regression — sealed baselines actually hash the content (S5, 14 Sep 2026).
 *
 * THE HOLE. lock_seal.js read the stores it seals with `_g(name)` = indirect eval. The app CSP
 * forbids unsafe-eval, so in the deployed web build every _g() threw and returned null: a locked
 * gate's SHA-256 seal was computed over [null, null, …] — it hashed NOTHING, so a hex-editor change
 * to the project file would never trip INV-19. The fix: _g reads the live store through SLEnv.get
 * (rule 5, its SLStores fallback covers every sealed store), eval only as a non-CSP-harness fallback.
 *
 * This LOADS lock_seal.js in a sandbox where eval throws (as under CSP) and proves blContentHash
 * reflects real store content through SLEnv, and is blind (hollow, content-independent) without it.
 *
 * PINNED:
 *   C1  source: _g consults SLEnv before falling back to eval
 *   C2  under CSP (eval blocked) WITH SLEnv, blContentHash is a real 64-hex hash, not null
 *   C3  it tracks content: change a sealed store -> the hash changes
 *   C4  mutation: WITHOUT SLEnv (eval blocked = the old behaviour) the hash is blind — identical for
 *       two different store states, and different from the real hash. That is the hollow seal.
 *
 * Run: node tests/regression_seal_content.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'lock_seal.js'), 'utf8');

// Load lock_seal.js in a context that simulates the browser under CSP: eval throws. `withEnv`
// decides whether SLEnv (the CSP-safe accessor) is present. `stores` backs SLEnv.get.
function load(stores, withEnv) {
  const win = { addEventListener() {} };
  const ctx = {
    window: win, document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
    console, JSON, Math, Date, String, Array, Object,
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {},
    eval: function () { throw new Error('CSP: unsafe-eval is blocked'); }   // the deployed reality
  };
  if (withEnv) ctx.SLEnv = { get: (name) => (name in stores ? stores[name] : undefined) };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return win.blContentHash;
}

console.log('[C1] source: _g uses SLEnv before eval');
{
  const g = SRC.slice(SRC.indexOf('function _g(name)'), SRC.indexOf('function _acTrees'));
  check('_g consults SLEnv.get before the eval fallback', /SLEnv[\s\S]*E\.get\(name\)[\s\S]*eval/.test(g), g.slice(0, 60));
}

const A = { acFunctionsData: [{ id: 'F1', name: 'Provide braking' }], acFcimData: [{ id: 'C1' }], acFhaData: [{ fc: 'FC-001', sev: 'CAT' }], acAssumptionsData: [{ id: 'AS-1' }] };
const B = { acFunctionsData: [{ id: 'F1', name: 'Provide braking' }], acFcimData: [{ id: 'C1' }], acFhaData: [{ fc: 'FC-001', sev: 'HAZ' }, { fc: 'FC-002', sev: 'MAJ' }], acAssumptionsData: [{ id: 'AS-1' }] };

console.log('\n[C2] under CSP with SLEnv, the seal is a real hash');
let hashA, hashB;
{
  const bch = load(A, true);
  check('blContentHash is exported and callable', typeof bch === 'function');
  hashA = bch('AFHA');
  check('AFHA hash is a real 64-hex digest, not null', typeof hashA === 'string' && /^[0-9a-f]{64}$/.test(hashA), String(hashA));
}

console.log('\n[C3] the seal tracks content');
{
  const bch = load(B, true);
  hashB = bch('AFHA');
  check('changing the sealed FHA content changes the hash', hashB && hashA && hashB !== hashA, hashA + ' vs ' + hashB);
}

console.log('\n[C4] mutation: without SLEnv (the old eval-only path under CSP) the seal is hollow');
{
  const hollowA = load(A, false)('AFHA');
  const hollowB = load(B, false)('AFHA');
  check('the eval-only path still produces a hash (over nulls)', typeof hollowA === 'string' && /^[0-9a-f]{64}$/.test(hollowA));
  check('it is BLIND: two different store states give the identical hash', hollowA === hollowB, hollowA + ' vs ' + hollowB);
  check('and it differs from the real content hash (so the SLEnv fix is what reads the content)', hollowA !== hashA);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

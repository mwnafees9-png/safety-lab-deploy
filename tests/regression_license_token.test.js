#!/usr/bin/env node
/*
 * Regression — SEC-1: the licence bearer lives in memory, never on disk (29 Sep 2026).
 *
 * THE DEFECT. The credential the app sends to the AI proxy sat in localStorage under
 * 'safetyLab.license.token'. localStorage is persistent and readable by any script that runs on
 * the page, so one injected script walks off with a credential that spends AI against the
 * account. Every other user secret moved behind the vault on 20 Sep (S8 / secret_store.js); this
 * one was left behind because it is not a user secret, it is issued to the account. It is still a
 * bearer credential and it still should not be on disk.
 *
 * WHY MEMORY RATHER THAN A SAFER BROWSER SLOT. auth_gate re-reads the token from license_tokens
 * on every sign-in and already gates the UI on that read finishing, so nothing needs the value to
 * survive a reload. sessionStorage would still put it somewhere a later script can read.
 *
 * WHAT THIS PINS, EXECUTED WHERE IT CAN BE:
 *   [A] license_token.js itself — set/get/clear/has, and a value an OLDER BUILD left in
 *       localStorage is DELETED at load, never adopted. (Adopting it would defeat the change.)
 *   [B] getLicenseToken() reads the real holder, on both worlds (cloud token, signed blob).
 *   [C] notify_agents' own accessor reads the holder and not localStorage.
 *   [D] the BYO connection test blanks and restores through the holder.
 *   [E] no file in site/ touches localStorage for that key any more, except the one line in
 *       license_token.js that deletes it; index.html loads the holder BEFORE slab_license.js and
 *       auth_gate.js; build.sh ships it.
 *
 * Run: node tests/regression_license_token.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const read = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
const LT = read('license_token.js');

// ---------------------------------------------------------------- [A] the holder, executed
function bootHolder(seed) {
  const store = Object.assign({}, seed || {});
  const sb = { String };
  sb.window = sb;
  sb.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  vm.createContext(sb);
  vm.runInContext(LT, sb);
  return { sb, store };
}
console.log('\n[A] the holder');
{
  const { sb } = bootHolder();
  check('[A1] starts empty', sb.SLLicenseToken.get() === '' && sb.SLLicenseToken.has() === false);
  sb.SLLicenseToken.set('tok_abc');
  check('[A2] set then get', sb.SLLicenseToken.get() === 'tok_abc' && sb.SLLicenseToken.has() === true);
  sb.SLLicenseToken.clear();
  check('[A3] clear empties it', sb.SLLicenseToken.get() === '' && sb.SLLicenseToken.has() === false);
  sb.SLLicenseToken.set(null); check('[A4] set(null) is empty, not the string "null"', sb.SLLicenseToken.get() === '');
  sb.SLLicenseToken.set(undefined); check('[A5] set(undefined) is empty too', sb.SLLicenseToken.get() === '');
}
{
  const { sb, store } = bootHolder({ 'safetyLab.license.token': 'leftover_from_an_older_build' });
  check('[A6] a value an older build left on disk is DELETED at load',
    !('safetyLab.license.token' in store), 'the whole point is that it stops being on disk');
  check('[A7] and it is NOT adopted into memory',
    sb.SLLicenseToken.get() === '', 'carrying it forward would defeat the change; sign-in re-syncs it');
}
{
  // A browser that throws on localStorage (private mode, blocked storage) must not take the page down.
  const sb = { String }; sb.window = sb;
  sb.localStorage = { get getItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  vm.createContext(sb);
  let threw = false; try { vm.runInContext(LT, sb); } catch (_) { threw = true; }
  check('[A8] a browser that blocks localStorage does not break the load', !threw && !!sb.SLLicenseToken);
}

// ------------------------------------------------- [B] getLicenseToken reads the real holder
console.log('\n[B] getLicenseToken against the real holder');
{
  const m = read('misc_fn_modules.js').match(/function getLicenseToken\(\) \{[\s\S]*?\n\}/);
  check('[B0] getLicenseToken located', !!m);
  const BLOB = 'eyJ2IjoxfQ.c2ln';
  const call = (world) => {
    const { sb } = bootHolder();
    sb.SLLicenseToken.set(world.token || '');
    sb.window.SLLicense = world.SLLicense; sb.window.SLLicenseBlob = world.SLLicenseBlob;
    vm.runInContext(m[0] + '; this.__out = getLicenseToken();', sb);
    return sb.__out;
  };
  check('[B1] hosted: the cloud token comes from memory', call({ token: 'cloud_tok' }) === 'cloud_tok');
  check('[B2] customer install: still the signed blob, not the marker',
    call({ token: 'signed:SL-LIC-1', SLLicense: { valid: true, present: true }, SLLicenseBlob: () => BLOB }) === BLOB);
  check('[B3] nothing held -> empty string, never null/undefined', call({}) === '');
}

// ------------------------------------------------------------- [C] notify_agents' accessor
console.log('\n[C] notify_agents');
{
  const m = read('notify_agents.js').match(/function _licenseToken\(\) \{[\s\S]*?\n {4}\}/);
  check('[C0] _licenseToken located', !!m);
  const { sb } = bootHolder({ 'safetyLab.license.token': 'ON_DISK_MUST_NOT_BE_USED' });
  sb.SLLicenseToken.set('in_memory_tok');
  vm.runInContext(m[0] + '; this.__out = _licenseToken();', sb);
  check('[C1] reads the holder', sb.__out === 'in_memory_tok');
  const { sb: sb2 } = bootHolder();
  sb2.localStorage.setItem('safetyLab.license.token', 'PLANTED_AFTER_LOAD');
  vm.runInContext(m[0] + '; this.__out = _licenseToken();', sb2);
  check('[C2] and a value planted in localStorage after load is NOT picked up',
    sb2.__out === '', 'a stale fallback would quietly reinstate the defect');
}

// ---------------------------------------------------- [D] the BYO test blanks through memory
console.log('\n[D] BYO connection test');
{
  const src = read('bindings_modules.js');
  const blank = src.match(/try \{ var _lt = window\.SLLicenseToken;[^\n]*\n/);
  const restore = src.match(/try \{ if \(savedToken && window\.SLLicenseToken\)[^\n]*\n/);
  check('[D0] both halves located', !!blank && !!restore);
  const { sb } = bootHolder();
  sb.SLLicenseToken.set('tok_to_be_borrowed');
  vm.runInContext('var savedToken = "";' + blank[0] + 'this.__mid = window.SLLicenseToken.get();' + restore[0] + 'this.__after = window.SLLicenseToken.get();', sb);
  check('[D1] blanked during the BYO test', sb.__mid === '');
  check('[D2] restored afterwards', sb.__after === 'tok_to_be_borrowed');
}

// ------------------------------------------------------------------------- [E] static pins
console.log('\n[E] nothing writes it to disk any more');
{
  const files = fs.readdirSync(SITE).filter(f => f.endsWith('.js'));
  const offenders = [];
  for (const f of files) {
    const src = read(f);
    const re = /localStorage\s*\.\s*(getItem|setItem|removeItem)\s*\(\s*'safetyLab\.license\.token'/g;
    let mm;
    while ((mm = re.exec(src))) {
      if (f === 'license_token.js' && mm[1] === 'removeItem') continue;   // the one deletion, on purpose
      offenders.push(f + ' (' + mm[1] + ')');
    }
  }
  check('[E1] no site/*.js reads or writes the token in localStorage', offenders.length === 0, offenders.join(', '));
  check('[E2] license_token.js deletes the legacy key exactly once',
    (LT.match(/localStorage\.removeItem\(LEGACY\)/g) || []).length === 1);

  const html = read('index.html');
  const ix = (s) => html.indexOf(s);
  check('[E3] index.html loads license_token.js', ix('src="license_token.js') > 0);
  check('[E4] ...before slab_license.js', ix('src="license_token.js') > 0 && ix('src="license_token.js') < ix('src="slab_license.js'));
  check('[E5] ...and before auth_gate.js', ix('src="license_token.js') > 0 && ix('src="license_token.js') < ix('src="auth_gate.js'));
  check('[E6] it is pinned with a version like every other module', /license_token\.js\?v=/.test(html));

  const build = fs.readFileSync(path.join(ROOT, 'build.sh'), 'utf8');
  check('[E7] build.sh ships every top-level site js, so the holder cannot be left out of dist',
    /esbuild "\$SRC"\/\*\.js/.test(build));
}

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);

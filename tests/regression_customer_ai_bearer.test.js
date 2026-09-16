#!/usr/bin/env node
/*
 * Regression — the AI bearer on a CUSTOMER install is the signed licence blob (16 Sep 2026, R7).
 *
 * THE DEFECT. slab_license.js writes a 'signed:<id>' MARKER into safetyLab.license.token so the
 * rest of the app sees "a licence is present". getLicenseToken() returned that slot verbatim, and
 * core_modules sent it as `Authorization: Bearer signed:SL-LIC-...`. The customer's proxy runs in
 * offline-licence mode: it has no database to look a token up in, it verifies the SIGNED BLOB as
 * the bearer. So every AI call on every customer install would have been a 401 "Token not
 * recognized". The database half of the customer install had been proven twice; the AI half had
 * never been run, and this is what it was hiding. Found by the first live end-to-end run.
 *
 * WHAT THIS PINS, EXECUTED:
 *   [1] customer install + valid signed licence  -> bearer IS the blob
 *   [2] hosted demo (no signed licence)          -> bearer is the cloud token, unchanged
 *   [3] customer install + INVALID licence       -> falls back to the slot (which slab_license
 *                                                   has cleared), i.e. sends nothing usable
 *   [4] every reader of the credential goes through getLicenseToken (no second copy of the rule)
 *
 * Run: node tests/regression_customer_ai_bearer.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
const misc = read('misc_fn_modules.js'), lic = read('slab_license.js'), core = read('core_modules.js'), agents = read('notify_agents.js');

// ---- extract getLicenseToken and run it under three worlds ------------------------------------
const m = misc.match(/function getLicenseToken\(\) \{[\s\S]*?\n\}/);
check('getLicenseToken located', !!m);
const BLOB = 'eyJ2IjoxfQ.c2ln'; // any base64url.base64url shape
function run(world) {
  const store = Object.assign({}, world.store || {});
  const sb = { window: null, localStorage: { getItem: (k) => (k in store ? store[k] : null) }, String };
  sb.window = { SLLicense: world.SLLicense, SLLicenseBlob: world.SLLicenseBlob };
  vm.createContext(sb);
  vm.runInContext(m[0] + '; this.__out = getLicenseToken();', sb);
  return sb.__out;
}
console.log('\n[bearer] executed');
check('[1] customer install, valid signed licence -> the bearer is the signed blob itself',
  run({ SLLicense: { valid: true, present: true }, SLLicenseBlob: () => BLOB, store: { 'safetyLab.license.token': 'signed:SL-LIC-2026-0001' } }) === BLOB,
  'the proxy verifies the blob; a marker gets "Token not recognized"');
check('[2] hosted demo, no signed licence -> the cloud token from the slot, unchanged',
  run({ SLLicense: undefined, store: { 'safetyLab.license.token': 'cloud-token-abc' } }) === 'cloud-token-abc');
check('[2b] hosted demo with SLLicense present but not valid -> still the cloud token',
  run({ SLLicense: { valid: false, present: false, authoritative: false }, SLLicenseBlob: () => '', store: { 'safetyLab.license.token': 'cloud-token-abc' } }) === 'cloud-token-abc');
check('[3] customer install, invalid licence -> slot (cleared by slab_license) -> empty, never the blob',
  run({ SLLicense: { valid: false, present: true, authoritative: true }, SLLicenseBlob: () => BLOB, store: {} }) === '');
check('[3b] valid licence but the blob accessor is missing -> falls back rather than throwing',
  run({ SLLicense: { valid: true, present: true }, store: { 'safetyLab.license.token': 'signed:x' } }) === 'signed:x');

// ---- structure: one rule, every reader through it ---------------------------------------------
console.log('\n[bearer] structure');
check('slab_license exposes the blob for the accessor (SLLicenseBlob)', /W\.SLLicenseBlob = function \(\) \{ return readBlob\(\); \};/.test(lic));
check('core_modules sends Bearer getLicenseToken() and nothing else', (core.match(/'Bearer ' \+ getLicenseToken\(\)/g) || []).length >= 2 && !/localStorage\.getItem\('safetyLab\.license\.token'\)/.test(core));
check('notify_agents goes through window.getLicenseToken first', /window\.getLicenseToken === 'function'\) return String\(window\.getLicenseToken\(\) \|\| ''\)/.test(agents));
check('the marker slab_license writes is still a marker (the slot is not overwritten with the blob)', /localStorage\.setItem\('safetyLab\.license\.token', 'signed:' \+ \(result\.id \|\| 'license'\)\)/.test(lic),
  'the slot is read by other code as "a licence exists"; the blob goes out only as the bearer');
check('safety_lab.js exports getLicenseToken on window (notify_agents relies on it)', /window\.getLicenseToken = getLicenseToken;/.test(read('safety_lab.js')));

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);

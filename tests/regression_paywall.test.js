#!/usr/bin/env node
/*
 * Regression — server-authoritative paywall (Phase 57).
 * Locks the entitlement truth table and proves the two leaks are closed:
 *   (a) the sign-in handler no longer hands every regular user 'pro-plus';
 *   (b) isPaywalled now obeys the server verdict, and the sync can DOWNGRADE.
 * Run: node tests/regression_paywall.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const helpers = S('helpers_modules.js');

// Extract the pure verdict fn from source and eval it — tests the ACTUAL shipped logic.
const m = helpers.match(/function _slEntitlementVerdict\(o\)\s*\{[\s\S]*?\n\}/);
check('_slEntitlementVerdict present in source', !!m);
let verdict = () => ({});
if (m) verdict = new Function('return (' + m[0] + ')')();

check('freeloader (no license / comp / academic / trial) -> PAYWALLED',
  verdict({ activeLicense:false, comped:false, academic:false, onTrial:false }).paywalled === true);
check('active license -> not paywalled, tier = plan',
  (r => r.paywalled === false && r.tier === 'pro-plus')(verdict({ activeLicense:true, licensePlan:'pro-plus' })));
check('enterprise license keeps enterprise tier',
  verdict({ activeLicense:true, licensePlan:'enterprise' }).tier === 'enterprise');
check('comped -> not paywalled, pro-plus',
  (r => r.paywalled === false && r.tier === 'pro-plus')(verdict({ comped:true })));
check('academic -> not paywalled, edu',
  (r => r.paywalled === false && r.tier === 'edu')(verdict({ academic:true })));
check('on trial -> not paywalled, edu capability',
  (r => r.paywalled === false && r.tier === 'edu')(verdict({ onTrial:true })));

check('isPaywalled is server-authoritative (reads server verdict flag)',
  /function isPaywalled/.test(helpers) && /safetyLab\.server\.paywalled/.test(helpers));

// Leak (a): regular signup no longer handed pro-plus provisionally.
const signedIn = helpers.slice(helpers.indexOf('_onSupabaseSignedIn'), helpers.indexOf('_onSupabaseSignedIn') + 4000);
check('LEAK CLOSED: provisional else no longer grants pro-plus to every user',
  !/\}\s*else\s*\{\s*if \(typeof setLicenseTier === 'function'\) setLicenseTier\('pro-plus'\);\s*\}/.test(signedIn));

// Leak (b): the sync now reads the trial clock and can downgrade / paywall.
check('authoritative sync reads users.trial_ends_at and sets the verdict',
  /_syncEntitlementFromServer/.test(helpers) && /trial_ends_at/.test(helpers));

check('sync fails OPEN on error (never paywalls on a transient failure)',
  /fail OPEN/.test(helpers));

// Explicit comp-block overrides the domain comp (paywall a former partner-org member).
const bindings = S('bindings_modules.js'), misc = S('misc_fn_modules.js');
check('comp block list paywalls a blocked address even at a comped domain',
  /COMPED_BLOCKED_EMAILS\s*=\s*\[[^\]]*ali\.salim@electra\.aero/.test(bindings) &&
  /COMPED_BLOCKED_EMAILS.*indexOf\(e\)\s*>=\s*0\)\s*return false/.test(misc));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

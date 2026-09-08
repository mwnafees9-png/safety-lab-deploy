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


// ---- Enterprise comp for the staff domain (8 Sep 2026) ---------------------
// The verdict must carry an enterprise comp tier through, and the default comp
// (no compedTier) must still be Pro+ so partner orgs are unaffected.
check('comped WITH compedTier=enterprise -> enterprise',
  verdict({ comped:true, compedTier:'enterprise' }).tier === 'enterprise');
check('comped WITHOUT a compedTier still -> pro-plus (partners unchanged)',
  verdict({ comped:true }).tier === 'pro-plus');

// Execute the ACTUAL shipped comp functions (isCompedEmail + compedTierFor) with
// the ACTUAL shipped comp lists — no stubs, so a drift in either is caught here.
const _b = bindings.slice(bindings.indexOf('const COMPED_FREE_DOMAINS'),
                          bindings.indexOf('];', bindings.indexOf('const COMPED_FREE_EMAILS')) + 2);
const _m = misc.slice(misc.indexOf('function _compEntryEmail'),
                      misc.indexOf('function showUpgradeRequiredToast'));
let compFns = { isCompedEmail: () => false, compedTierFor: () => null };
try { compFns = new Function(_b + '\n' + _m + '\n return { isCompedEmail: isCompedEmail, compedTierFor: compedTierFor };')(); }
catch (e) { check('comp functions eval', false, e.message); }
const { isCompedEmail, compedTierFor } = compFns;

check('staff domain @safetylabaero.com is comped', isCompedEmail('waqas.nafees@safetylabaero.com') === true);
check('staff domain is comped at ENTERPRISE', compedTierFor('waqas.nafees@safetylabaero.com') === 'enterprise');
check('any @safetylabaero.com address (not just the founder) is enterprise-comped',
  compedTierFor('someone.else@safetylabaero.com') === 'enterprise');
check('partner domain electra.aero stays comped at PRO-PLUS (not enterprise)',
  isCompedEmail('eng@electra.aero') === true && compedTierFor('eng@electra.aero') === 'pro-plus');
check('a non-comped address is not comped and has no comp tier',
  isCompedEmail('random@gmail.com') === false && compedTierFor('random@gmail.com') === null);
check('the block list still overrides the domain comp',
  isCompedEmail('ali.salim@electra.aero') === false && compedTierFor('ali.salim@electra.aero') === null);

// Wiring: the effective-tier + sync paths must honor compedTierFor, not hardcode pro-plus.
check('getEffectiveTier resolves the comp tier via compedTierFor',
  /compedTierFor\(email\)/.test(helpers) && /LICENSE_TIER_RANK\[want\]/.test(helpers));
check('the server sync passes compedTier into the verdict',
  /compedTier: compedTier/.test(helpers));
check('window.compedTierFor is exported', /window\.compedTierFor\s*=\s*compedTierFor/.test(S('safety_lab.js')));


console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

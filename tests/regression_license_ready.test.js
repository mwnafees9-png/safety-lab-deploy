#!/usr/bin/env node
/**
 * Regression — "AI BACKEND NOT READY" IN THE MIDDLE OF A DEMO (Waqas, 4 Sep 2026).
 *
 * Root causes, both in auth_gate.js: on sign-in the gate lifted BEFORE the license
 * token query returned, so the first AI clicks saw no token; and a transient query
 * error REMOVED the stored token, switching the AI off until the next sign-in.
 *
 *   · the gate now waits for the license sync (bounded, 6 s) before lifting;
 *   · a query error keeps the last known-good token — only a positive "no valid
 *     token" from the server removes it;
 *   · the sync is exposed (window.__slabLicenseReady / window.__slabSyncLicense);
 *   · Provider.available() kicks a re-sync when it finds no license, and every
 *     "AI backend not ready" toast is replaced by Provider.notReadyMessage(), which
 *     says the honest reason (sign in / Pro+ / still connecting — try again).
 * Run: node tests/regression_license_ready.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const gate = fs.readFileSync(path.join(SITE, 'auth_gate.js'), 'utf8');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }

console.log('[1] auth_gate — the license sync gates the lift and never wipes a token on error');
{
  check('a query error KEEPS the stored token (no removeItem on the error path)', /license_tokens query error \(keeping the stored token\)/.test(gate) && !/query error:', error\.message \|\| error\); try \{ localStorage\.removeItem\('safetyLab\.license\.token'\)/.test(gate));
  check('… and so does a thrown failure', /license token sync failed \(keeping the stored token\)/.test(gate));
  check('only a positive "no valid token" from the server removes it', /The server positively says there is no valid token for this user\.\s+try \{ localStorage\.removeItem\('safetyLab\.license\.token'\); \}/.test(gate));
  check('the sync is exposed as a promise and a re-run hook', /window\.__slabLicenseReady = run;/.test(gate) && /window\.__slabSyncLicense = _syncLicenseTokenFromSupabase;/.test(gate));
  check('the gate lifts after the sync or after 6 s, whichever first', /function _syncThenLift\(\)/.test(gate) && /_syncLicenseTokenFromSupabase\(\)\.then\(lift, lift\)/.test(gate) && /setTimeout\(lift, 6000\)/.test(gate));
  const bare = (gate.match(/_syncLicenseTokenFromSupabase\(\);\s*\n\s*liftGate\(\);/g) || []).length;
  check('every sign-in path uses _syncThenLift (no bare sync-then-lift left)', bare === 0 && (gate.match(/_syncThenLift\(\);/g) || []).length === 3, 'bare=' + bare);
}

console.log('\n[2] ai_assistant — the honest reason, and a re-sync on the first miss');
{
  check('no "AI backend not ready" literal remains', !/AI backend not ready/.test(ai));
  check('Provider.notReadyMessage exists with the three honest reasons', /notReadyMessage\(\) \{/.test(ai) && /Sign in to use the AI/.test(ai) && /AI is a Pro\+ feature/.test(ai) && /AI is still connecting \(your license is being confirmed\) — please try again in a few seconds\./.test(ai));
  check('every guard toasts that message', (ai.match(/_toast\(Provider\.notReadyMessage\(\), 'warning', 5000\)/g) || []).length >= 25 && /return Provider\.notReadyMessage\(\);/.test(ai));
  check('available() kicks a license re-sync when it finds none (once at a time)', /if \(!ok && this\.mode !== 'local'\) \{ try \{ if \(typeof window\.__slabSyncLicense === 'function' && !Provider\._resyncing\)/.test(ai));
  // executed: the message under each state
  const i = ai.indexOf('        notReadyMessage() {'); const j = ai.indexOf('        },', i) + 10;
  const src = 'const P = { mode: "cloud", ' + ai.slice(i, j).trim().replace(/^notReadyMessage\(\)/, 'notReadyMessage: function ()') + ' };';
  const mk = (signedOut, pro) => { const ctx = { _cloudSignedOut: () => signedOut, isProPlusLicensed: () => pro }; vm.createContext(ctx); vm.runInContext(src + '\nglobalThis.__m = P.notReadyMessage();', ctx); return ctx.__m; };
  check('signed out → says sign in', /^Sign in to use the AI/.test(mk(true, true)), mk(true, true));
  check('signed in, not Pro+ → says Pro+', /^AI is a Pro\+ feature/.test(mk(false, false)), mk(false, false));
  check('signed in, Pro+, no token yet → says still connecting, try again', /^AI is still connecting/.test(mk(false, true)), mk(false, true));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

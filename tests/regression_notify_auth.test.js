#!/usr/bin/env node
/*
 * Regression — the DB-webhook notification functions authenticate the caller (S10, 14 Sep 2026).
 *
 * THE HOLE. notify-signin / -signup / -expiry / -review are invoked only by database triggers and a
 * cron job, all of which send the project service-role key as the Bearer token (confirmed against the
 * live triggers). But each function's guard was `auth.startsWith('Bearer ') && auth.length >= 16` —
 * it accepted ANY bearer of 16+ characters, so anyone who knew the function URL could fire it (spam
 * Waqas's inbox, probe behaviour). The fix: verify the token equals the service-role key, in constant
 * time, and fail closed if the key is not injected.
 *
 * This EXECUTES each function's extracted guard (not a regex): correct key passes, everything else —
 * a random 16+ char bearer (the old hole), a wrong key, no bearer, an unprovisioned key — fails.
 *
 * Run: node tests/regression_notify_auth.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const FNDIR = path.join(__dirname, '..', 'supabase', 'functions');
const WEBHOOK_FNS = ['notify-signin', 'notify-signup', 'notify-expiry', 'notify-review'];
const JWT_FNS = ['notify-feedback', 'notify-invite'];

// Pull the two guard helpers out of a function's source, strip TS types, and evaluate them in a
// sandbox where SERVICE_ROLE_KEY is a value we control.
function loadGuard(src, serviceKey) {
  const a = src.indexOf('function _ctEq');
  const b = src.indexOf('function _authorizedBySvc', a);
  const end = src.indexOf('\n}\n', b) + 3;
  if (a < 0 || b < 0 || end < 3) return null;
  const snippet = src.slice(a, end).replace(/: string/g, '').replace(/: boolean/g, '');
  const ctx = { SERVICE_ROLE_KEY: serviceKey, out: {} };
  vm.createContext(ctx);
  vm.runInContext(snippet + '\nout._ctEq = _ctEq; out._authorizedBySvc = _authorizedBySvc;', ctx);
  return ctx.out;
}

const REAL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service_role_key_stand_in_value_1234567890';

for (const d of WEBHOOK_FNS) {
  console.log('[' + d + ']');
  const src = fs.readFileSync(path.join(FNDIR, d, 'index.ts'), 'utf8');

  // source-level: the weak check is gone, the guard is wired, exactly one key declaration
  check('no longer accepts any Bearer >= 16 chars (weak check gone)', !/auth\.length\s*<\s*16/.test(src));
  check('the request guard calls _authorizedBySvc', /if \(!_authorizedBySvc\(auth\)\)/.test(src));
  check('exactly one SERVICE_ROLE_KEY declaration (no duplicate)', (src.match(/const SERVICE_ROLE_KEY\b/g) || []).length === 1, String((src.match(/const SERVICE_ROLE_KEY\b/g) || []).length));

  // behavioural: run the extracted guard with a known key
  const g = loadGuard(src, REAL_KEY);
  check('guard helpers extracted and evaluate', !!(g && g._authorizedBySvc && g._ctEq));
  if (g && g._authorizedBySvc) {
    check('the real service key is accepted', g._authorizedBySvc('Bearer ' + REAL_KEY) === true);
    check('a random 16+ char bearer (the OLD hole) is rejected', g._authorizedBySvc('Bearer ' + 'x'.repeat(40)) === false);
    check('a wrong key is rejected', g._authorizedBySvc('Bearer ' + REAL_KEY.slice(0, -1) + 'X') === false);
    check('no bearer is rejected', g._authorizedBySvc('') === false && g._authorizedBySvc('Basic abc') === false);
    check('constant-time compare (xor accumulation, not ===)', /\^=|\|=|charCodeAt/.test(src.slice(src.indexOf('function _ctEq'), src.indexOf('function _authorizedBySvc'))));
  }
  // fail-closed: with no key injected, nothing is accepted
  const g0 = loadGuard(src, '');
  if (g0 && g0._authorizedBySvc) check('fail-closed: with no service key injected, the real token is still rejected', g0._authorizedBySvc('Bearer ' + REAL_KEY) === false);
  console.log('');
}

console.log('[feedback + invite] still verify a real USER token (must NOT have been weakened)');
for (const d of JWT_FNS) {
  const src = fs.readFileSync(path.join(FNDIR, d, 'index.ts'), 'utf8');
  check(d + ' verifies the caller via auth.getUser (real JWT), not a length check', /getUser\(/.test(src) && !/auth\.length\s*<\s*16/.test(src));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

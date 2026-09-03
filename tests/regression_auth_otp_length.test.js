#!/usr/bin/env node
/*
 * Regression — email sign-in code parsing (7 Aug 2026).
 *
 * THE DEFECT, found on a live code: the desktop sign-in field rejected a brand-new
 * code from its own email with "enter the 6-digit code". The code was 29215973 —
 * EIGHT digits. Supabase's email-OTP length is a PROJECT SETTING (6-10), not a
 * constant, and _parseAuthInput pinned it at exactly /^\d{6}$/. The app could not
 * accept its own emails, so NO email sign-in could complete on web or desktop, and
 * the error message blamed the user for entering the thing they had entered.
 *
 * Second defect fixed in the same pass: .trim() removes ordinary whitespace but NOT
 * the non-breaking and zero-width characters that ride along when a code is copied
 * out of a styled HTML email. The string looks right and fails the test.
 *
 * These checks EXECUTE the real parser lifted from the real module.
 *
 * NOTE: mfa.js is deliberately NOT covered. TOTP codes are 6 digits by RFC 6238 —
 * that constant is correct and must stay.
 *
 * Run: node tests/regression_auth_otp_length.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const SRC = fs.readFileSync(path.join(SITE, 'misc_fn_modules.js'), 'utf8');

const i = SRC.indexOf('function _parseAuthInput(');
if (i < 0) { console.log('  FAIL  _parseAuthInput not found'); process.exit(1); }
let d = 0, body = null;
for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) { body = SRC.slice(i, k + 1); break; } }
}
const ctx = { URL, URLSearchParams, String, console: { log() {} } };
vm.createContext(ctx);
vm.runInContext(body, ctx);
const P = ctx._parseAuthInput;

console.log('\n[auth-otp] the length that actually broke it');
check('an EIGHT-digit code is accepted (the live failure: 29215973)',
    (() => { const r = P('29215973'); return r && r.kind === 'code' && r.token === '29215973'; })(),
    'this exact code was rejected by the shipped build while sitting in the user\'s own email');
check('six digits still work', (() => { const r = P('123456'); return r && r.token === '123456'; })());
check('seven, nine and ten digits all work',
    ['1234567', '123456789', '1234567890'].every(c => { const r = P(c); return r && r.kind === 'code' && r.token === c; }),
    'Supabase allows 6-10; pinning any single length reintroduces the bug on a settings change');
check('five digits are still refused', P('12345') === null);
check('eleven digits are not treated as a code',
    (() => { const r = P('12345678901'); return !r || r.kind !== 'code'; })());
check('letters are not a code', (() => { const r = P('12345a'); return !r || r.kind !== 'code'; })());

console.log('\n[auth-otp] invisible characters from a copied email');
check('a non-breaking space is stripped, not fatal',
    (() => { const r = P('292 15973'); return r && r.kind === 'code' && r.token === '29215973'; })(),
    'copying from a styled HTML email routinely inserts U+00A0 — .trim() does not remove it');
check('a zero-width space is stripped', (() => { const r = P('2921​5973'); return r && r.token === '29215973'; })());
check('a BOM / zero-width no-break space is stripped', (() => { const r = P('﻿29215973'); return r && r.token === '29215973'; })());
check('ordinary spaces and newlines are still stripped', (() => { const r = P('  29215973 \n'); return r && r.token === '29215973'; })());
check('empty input is still null', P('') === null && P(null) === null && P('   ') === null);

console.log('\n[auth-otp] the link paths still work');
check('token in the query string', (() => { const r = P('https://x.co/auth?token=abc123def456&type=magiclink'); return r && r.kind === 'hash' && r.token === 'abc123def456' && r.type === 'magiclink'; })());
check('token_hash in the hash fragment', (() => { const r = P('https://x.co/#token_hash=zzz999yyy888&type=email'); return r && r.token === 'zzz999yyy888'; })());
check('a bare token hash', (() => { const r = P('abcdefghijkl123'); return r && r.kind === 'hash'; })());
check('a URL with NO token yields null, not a bogus hit',
    P('https://safetylabaero.com/app') === null,
    'a truncated link parses as a valid URL — it must fail, and fail with a message that says so');

console.log('\n[auth-otp] the copy no longer contradicts the validator');
{
    const H = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
    const X = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('the sign-in error no longer names a fixed length',
        !/Enter the 6-digit code, or paste/.test(SRC) && !/enter the 6-digit code\./.test(H));
    check('the code field label and placeholder no longer say 6-digit',
        !/>6-digit code/.test(X) && !/Enter the 6-digit code — or paste/.test(X));
    check('mfa.js is untouched — TOTP is 6 by RFC 6238',
        /maxlength="6"/.test(fs.readFileSync(path.join(SITE, 'mfa.js'), 'utf8')),
        'widening the TOTP field would be a real regression, not a fix');
}


// ── SIGN-UP CONFIRMATION STAYS A LINK (ruling, 14 Aug 2026) ────────────────
// A code path was built on 13 Aug after Defender Safe Links was caught spending
// one-time confirmation links in transit (electra.aero, twice). Waqas ruled to
// KEEP LINKS and to have each customer's IT allow safetylabaero.com during
// setup instead — see docs/IT_Allowlist_Request.md.
// What must therefore stay true: the sign-up screen never becomes a dead end.
// Whoever DOES get their link eaten before that conversation happens must be
// able to get another one without leaving the screen.
const GATE = fs.readFileSync(path.join(SITE, 'auth_gate.js'), 'utf8');
const PANE_A = GATE.indexOf("_mode === 'verify-sent'");
const PANE = PANE_A > 0 ? GATE.slice(PANE_A, PANE_A + 1800) : '';

check('the verify screen offers a resend without leaving it',
      PANE.length > 0 && /_authResendVerification/.test(PANE));
check('the verify screen names the invalid-link case, not just non-delivery',
      /invalid/i.test(PANE) && /corporate mail filters/i.test(PANE));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

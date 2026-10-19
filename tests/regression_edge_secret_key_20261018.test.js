#!/usr/bin/env node
/*
 * Regression — SEC-5, step 2 of SECURITY_ROTATION_RUNBOOK.md section 2 (18 Oct 2026).
 *
 * The legacy anon and service_role JWT keys cannot be turned off while the seven edge functions build their
 * server client from the legacy SUPABASE_SERVICE_ROLE_KEY. Each now uses the modern secret key (sb_secret_...),
 * which the platform injects as SUPABASE_SECRET_KEYS (a JSON object; 'default' is the first one created), and
 * falls back to the legacy key only while no secret key exists. Nobody types or sets a key for this.
 * Also: notify-feedback built its caller check from SUPABASE_ANON_KEY, which this project does not inject, so
 * every call would have come back 401; it now checks the token through the server client, like notify-invite.
 * Type-checked with deno against the deployed sources on 18 Oct (all seven identical to this repo that day).
 *
 * Run: node tests/regression_edge_secret_key_20261018.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const FN = path.join(__dirname, '..', 'supabase', 'functions');
const SEVEN = ['notify-expiry', 'notify-feedback', 'notify-invite', 'notify-review', 'notify-signin', 'notify-signup', 'stripe-webhook'];
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

for (const f of SEVEN) {
    const src = fs.readFileSync(path.join(FN, f, 'index.ts'), 'utf8'), c = code(src);
    console.log('\n[' + f + ']');
    const m = /function serverKey\(\): string \{[\s\S]*?\n\}\n/.exec(src);
    check('has the one key reader', !!m);
    check('builds its server key from it', /const SERVICE_ROLE_KEY\s*= serverKey\(\);/.test(c));
    check('reads the legacy key nowhere else', (c.match(/SUPABASE_SERVICE_ROLE_KEY/g) || []).length === 1);
    check('never reads the anon key', !/SUPABASE_ANON_KEY/.test(c));
    if (m) {
        // run the reader, TypeScript annotation stripped, against each environment it can meet
        const js = m[0].replace('function serverKey(): string {', 'function serverKey() {');
        const run = env => { const ctx = vm.createContext({ Deno: { env: { get: k => (k in env ? env[k] : undefined) } }, JSON }); vm.runInContext(js, ctx); return ctx.serverKey(); };
        check('the secret key when the project has one', run({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_NEW"}', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.legacy' }) === 'sb_secret_NEW');
        check('the legacy key while none exists', run({ SUPABASE_SERVICE_ROLE_KEY: 'eyJ.legacy' }) === 'eyJ.legacy' && run({ SUPABASE_SECRET_KEYS: '{}', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.legacy' }) === 'eyJ.legacy');
        check('a malformed value falls back instead of crashing the function', run({ SUPABASE_SECRET_KEYS: 'not json', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.legacy' }) === 'eyJ.legacy');
        check('only the key named default is used', run({ SUPABASE_SECRET_KEYS: '{"billing":"sb_secret_B"}', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.legacy' }) === 'eyJ.legacy');
        check('nothing at all: empty, so the function fails closed', run({}) === '');
    }
}
console.log('\n[notify-feedback] the caller check');
const fb = code(fs.readFileSync(path.join(FN, 'notify-feedback', 'index.ts'), 'utf8'));
check('the token is checked through the server client', /await sbAdmin\.auth\.getUser\(accessToken\)/.test(fb) && !/sbAsUser/.test(fb));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

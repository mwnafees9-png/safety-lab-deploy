#!/usr/bin/env node
/*
 * Regression — the offline signed license. (6 Sep 2026)
 *
 * A customer install proves it is licensed WITHOUT calling Safety Lab. This suite
 * EXECUTES the real browser verifier (site/slab_license.js → window.SLLicenseVerify)
 * in Node against an EPHEMERAL P-256 keypair made here, and proves every guard:
 * signature, tamper, wrong key, time window, clock rollback, backend / domain /
 * tenant binding, key rotation, fail-closed with no key. It then runs the real
 * signing TOOL (tools/license/sign.mjs) end to end in a temp HOME and confirms the
 * tool's output verifies in the app verifier — the two halves agree.
 *
 * Run: node tests/regression_offline_license.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), cp = require('child_process');
const nodeCrypto = require('crypto');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const licSrc = S('slab_license.js'), idx = S('index.html'), helpers = S('helpers_modules.js'), gate = S('auth_gate.js');
const PIN = require('./lib/pinfloor.js');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function before(hay, a, b) { const i = hay.indexOf(a), j = hay.indexOf(b); return i >= 0 && j >= 0 && i < j; }

// ---- load the real module into a VM with a browser-ish window; grab the pure verifier ----
function loadVerifier() {
  const store = {};
  const W = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
              crypto: globalThis.crypto, SLConfig: { mode: 'hosted-demo', supabaseUrl: '' } };
  const ctx = { window: W, console: { info(){}, warn(){}, error(){}, log(){} }, URL, TextEncoder, TextDecoder, atob: s => Buffer.from(s, 'base64').toString('binary'), localStorage: W.localStorage, Date, JSON, Math, Number, String, Array, Object, Uint8Array, Promise, isNaN };
  vm.createContext(ctx);
  vm.runInContext(licSrc, ctx);
  return { verify: ctx.window.SLLicenseVerify, win: ctx.window, store };
}
const { verify } = loadVerifier();

// ---- ephemeral keypairs + a signer that mirrors the tool ----
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function keypair(kid) {
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  return { priv: privateKey, pub: { kid, alg: 'ES256', kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } };
}
function sign(payload, kp) {
  const pb = b64u(Buffer.from(JSON.stringify(Object.assign({ kid: kp.pub.kid }, payload)), 'utf8'));
  const s = nodeCrypto.createSign('SHA256'); s.update(Buffer.from(pb, 'utf8')); s.end();
  return pb + '.' + b64u(s.sign({ key: kp.priv, dsaEncoding: 'ieee-p1363' }));
}
const K1 = keypair('k1'), K2 = keypair('k2'), KX = keypair('kx');
const NOW = Date.parse('2026-09-06T12:00:00Z');
const day = 86400000;
function lic(over) {
  return Object.assign({ v: 1, alg: 'ES256', issuer: 'safetylabaero', id: 'SL-LIC-2026-0001', customer: 'Radia', tier: 'enterprise', seats: 5, features: ['coffe'],
    bind: { domains: ['radia.com'], tenant: '', backend: '' }, issuedAt: new Date(NOW - day).toISOString(), notBefore: new Date(NOW - day).toISOString(), notAfter: new Date(NOW + 365 * day).toISOString() }, over || {});
}
const base = { now: NOW, keys: [K1.pub], subtle: globalThis.crypto.subtle, backendHost: '', email: 'eng@radia.com', tenant: '', maxSeen: 0 };
const V = (blob, o) => verify(blob, Object.assign({}, base, o || {}));

(async () => {
  console.log('\n[license] EXECUTED — the real verifier against a real keypair');
  let r = await V(sign(lic(), K1));
  check('valid license verifies → enterprise, 5 seats, customer Radia', r.valid && r.tier === 'enterprise' && r.seats === 5 && r.customer === 'Radia', r.reason);
  check('tampered payload (tier edited) → signature invalid', !(await (async () => { const b = sign(lic(), K1); const [p, s] = b.split('.'); const j = JSON.parse(Buffer.from(p.replace(/-/g,'+').replace(/_/g,'/'), 'base64')); j.tier = 'enterprise'; j.seats = 500; return V(b64u(Buffer.from(JSON.stringify(j))) + '.' + s); })()).valid);
  check('signed by an unknown key → invalid', !(await V(sign(lic(), KX))).valid);
  check('no public key configured → invalid, fail closed', (await V(sign(lic(), K1), { keys: [] })).reason === 'no public key configured');
  check('key ROTATION: signed by k2 verifies with [k1,k2]', (await V(sign(lic(), K2), { keys: [K1.pub, K2.pub] })).valid);
  check('expired → invalid with a dated reason', (r = await V(sign(lic({ notAfter: new Date(NOW - day).toISOString() }), K1)), !r.valid && /expired/.test(r.reason)));
  check('not yet valid → invalid', !(await V(sign(lic({ notBefore: new Date(NOW + 10 * day).toISOString() }), K1))).valid);
  check('clock ROLLED BACK before a license already seen → invalid', !(await V(sign(lic(), K1), { maxSeen: NOW + 30 * day })).valid);
  check('maxSeen advances to the newest issuedAt (tamper memory)', (await V(sign(lic(), K1))).maxSeenNext === NOW - day);
  check('unsupported format (v=2) → invalid', !(await V(sign(lic({ v: 2 }), K1))).valid);
  check('unknown tier → invalid', !(await V(sign(lic({ tier: 'god' }), K1))).valid);

  console.log('\n[license] EXECUTED — binding');
  check('domain bound: eng@radia.com covered', (await V(sign(lic(), K1), { email: 'eng@radia.com' })).valid);
  check('domain bound: subdomain eng@mail.radia.com covered', (await V(sign(lic(), K1), { email: 'x@mail.radia.com' })).valid);
  check('domain bound: someone@gmail.com REFUSED', !(await V(sign(lic(), K1), { email: 'someone@gmail.com' })).valid);
  check('domain bound: evilradia.com does NOT match radia.com', !(await V(sign(lic(), K1), { email: 'x@evilradia.com' })).valid);
  check('no email known yet → domain check deferred (valid)', (await V(sign(lic(), K1), { email: '' })).valid);
  check('backend bound: matching host valid', (await V(sign(lic({ bind: { backend: 'abc.supabase.co' } }), K1), { backendHost: 'abc.supabase.co' })).valid);
  check('backend bound: different host REFUSED', !(await V(sign(lic({ bind: { backend: 'abc.supabase.co' } }), K1), { backendHost: 'other.supabase.co' })).valid);
  check('tenant bound: mismatch REFUSED', !(await V(sign(lic({ bind: { tenant: 'tid-A' } }), K1), { tenant: 'tid-B' })).valid);
  check('tenant bound: match valid', (await V(sign(lic({ bind: { tenant: 'tid-A' } }), K1), { tenant: 'tid-a' })).valid);

  console.log('\n[license] wiring');
  const glt = (function (src) { const i = src.indexOf('function getLicenseTier()'); return strip(src.slice(i, i + 900)); })(helpers);
  check('getLicenseTier consults SLLicense FIRST and fails closed to unpaid', /window\.SLLicense/.test(glt) && /L\.valid \? L\.tier : 'unpaid'/.test(glt) && before(glt, 'SLLicense', "localStorage.getItem('safetyLab.license.tier')"));
  const sync = (function (src) { const i = src.indexOf('function _syncLicenseTokenFromSupabase'); return strip(src.slice(i, i + 1200)); })(gate);
  check('cloud license sync waits for the signed verdict and STANDS DOWN when authoritative', /__slabSignedLicenseReady/.test(sync) && /SLLicense\.authoritative/.test(sync) && before(sync, 'SLLicense.authoritative', "from('license_tokens')"));
  const SREF = f => '<script src="' + f;
  check('slab_license loads right after slab_config and before helpers/auth_gate', before(idx, SREF('slab_config.js'), SREF('slab_license.js')) && before(idx, SREF('slab_license.js'), SREF('helpers_modules.js')) && before(idx, SREF('slab_license.js'), SREF('auth_gate.js')));
  // ---- the SHIPPED key: the app's baked PUBLIC_KEYS must match the file copy under tools/license
  // byte-for-byte (the key was typed into the app from that file on 6 Sep 2026; if either side ever
  // drifts, every customer license silently stops verifying — so the two are held together here).
  const shipped = loadVerifier().win.SLLicensePublicKeys || [];
  const keyFiles = fs.readdirSync(path.join(ROOT, 'tools', 'license')).filter(f => /\.jwk\.json$/.test(f));
  check('at least one public key file ships under tools/license/*.jwk.json', keyFiles.length >= 1, keyFiles.join(','));
  check('the app bakes at least one PUBLIC key (no longer the empty pre-keygen list)', shipped.length >= 1);
  for (const f of keyFiles) {
    const k = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'license', f), 'utf8'));
    check(f + ' is a PUBLIC P-256/ES256 key with NO private part', k.kty === 'EC' && k.crv === 'P-256' && k.alg === 'ES256' && !('d' in k) && /^[A-Za-z0-9_-]{43}$/.test(k.x) && /^[A-Za-z0-9_-]{43}$/.test(k.y));
    const m = shipped.find(s => s.kid === k.kid);
    check(f + ' (' + k.kid + ') is baked into the app with identical x/y/crv/alg', !!m && m.x === k.x && m.y === k.y && m.crv === k.crv && m.alg === k.alg, m ? 'x/y differ' : 'kid not in PUBLIC_KEYS');
  }
  check('no private-key material anywhere in the shipped module', !/"d"\s*:/.test(licSrc) && !/PRIVATE KEY/.test(licSrc));
  check('a license signed by an ephemeral key does NOT verify against the SHIPPED keys', !(await V(sign(lic(), KX), { keys: shipped })).valid);
  check('module fails CLOSED on customer modes: authoritative when self-hosted/browser-only/desktop', /m === 'self-hosted' \|\| m === 'browser-only' \|\| m === 'desktop'/.test(strip(licSrc)));
  check('invalid on a customer install writes tier unpaid + drops the token', /setItem\('safetyLab\.license\.tier', 'unpaid'\)/.test(licSrc) && /removeItem\('safetyLab\.license\.token'\)/.test(licSrc));
  check('exposes SLLicenseCheckIdentity for re-check at sign-in', /SLLicenseCheckIdentity = async function/.test(licSrc));

  console.log('\n[license] END TO END — the real signing tool → the real app verifier');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-lic-'));
  const env = Object.assign({}, process.env, { HOME: tmp, USERPROFILE: tmp });
  const tool = path.join(ROOT, 'tools', 'license', 'sign.mjs');
  let kg = cp.spawnSync(process.execPath, [tool, 'keygen'], { env, encoding: 'utf8' });
  check('tool keygen runs and prints a public JWK', kg.status === 0 && /"kty":"EC"/.test(kg.stdout) && /"crv":"P-256"/.test(kg.stdout), kg.stderr);
  const pubLine = (kg.stdout.split('\n').filter(l => l.trim().startsWith('{')).pop() || '{}');
  let pub = {}; try { pub = JSON.parse(pubLine); } catch (_) {}
  check('private key file is created 0600 outside the repo', (() => { try { const st = fs.statSync(path.join(tmp, '.safetylab', 'license_signing_key.pem')); return (st.mode & 0o777) === 0o600; } catch (_) { return false; } })());
  check('keygen REFUSES to overwrite an existing private key', cp.spawnSync(process.execPath, [tool, 'keygen'], { env, encoding: 'utf8' }).status !== 0);
  const tpl = cp.spawnSync(process.execPath, [tool, 'template'], { env, encoding: 'utf8' });
  const payload = JSON.parse(tpl.stdout); payload.customer = 'E2E Co'; payload.bind.domains = ['e2e.co'];
  const licPath = path.join(tmp, 'lic.json'); fs.writeFileSync(licPath, JSON.stringify(payload));
  const sg = cp.spawnSync(process.execPath, [tool, 'sign', licPath], { env, encoding: 'utf8' });
  check('tool signs a license', sg.status === 0 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\s*$/.test(sg.stdout), sg.stderr);
  const blob = sg.stdout.trim();
  fs.writeFileSync(path.join(tmp, 'e2e.lic'), blob);
  check('tool verify says SIGNATURE OK', /SIGNATURE OK/.test(cp.spawnSync(process.execPath, [tool, 'verify', path.join(tmp, 'e2e.lic')], { env, encoding: 'utf8' }).stdout));
  const e2e = await V(blob, { keys: [pub], email: 'a@e2e.co', now: Date.now() });
  check('THE APP VERIFIER ACCEPTS THE TOOL-SIGNED LICENSE (halves agree)', e2e.valid && e2e.customer === 'E2E Co', e2e.reason);
  check('…and refuses it under a different key', !(await V(blob, { keys: [K1.pub], email: 'a@e2e.co', now: Date.now() })).valid);
  check('tool rejects a bad tier', cp.spawnSync(process.execPath, [tool, 'sign', (() => { const p2 = path.join(tmp, 'bad.json'); fs.writeFileSync(p2, JSON.stringify(Object.assign({}, payload, { tier: 'god' }))); return p2; })()], { env, encoding: 'utf8' }).status !== 0);

  console.log('\n[license] pins');
  check('slab_license >= 1.1 (1.1 = first shipped public key)', PIN.atLeast(idx, 'slab_license.js', '1.1'));
  check('helpers_modules >= 2.89', PIN.atLeast(idx, 'helpers_modules.js', '2.89'));
  check('auth_gate >= 62.69', PIN.atLeast(idx, 'auth_gate.js', '62.69'));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

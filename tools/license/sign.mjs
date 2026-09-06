#!/usr/bin/env node
/*
 * Safety Lab Aero — offline license signing tool. (6 Sep 2026)
 *
 * Run this on YOUR machine. The private key never leaves it and never goes in
 * the repo or in chat. Only the PUBLIC key is baked into the app.
 *
 *   node tools/license/sign.mjs keygen
 *       First run. Makes an ECDSA P-256 keypair. Writes the PRIVATE key to
 *       ~/.safetylab/license_signing_key.pem (mode 0600, outside the repo) and
 *       prints the PUBLIC key as JWK — paste that into site/slab_license.js.
 *
 *   node tools/license/sign.mjs sign license.json [--out customer.lic]
 *       Signs a license. license.json is the plain payload (see template below).
 *       Output is the signed blob: base64url(payload) '.' base64url(signature).
 *
 *   node tools/license/sign.mjs verify customer.lic
 *       Checks a blob against the public key(s) in ~/.safetylab (sanity check).
 *
 *   node tools/license/sign.mjs template > license.json
 *       Prints a payload template to fill in.
 *
 * Algorithm: ECDSA over P-256 with SHA-256 ("ES256"). Chosen over Ed25519 because
 * every browser's built-in WebCrypto has supported it for a decade (Ed25519 only
 * reached Chrome in 2025 — a locked-down enterprise browser could fail to verify
 * and look unlicensed) and it is FIPS 186-4 approved for defense reviews. The
 * payload carries an `alg` field so others can be added later.
 *
 * What is signed is the exact base64url payload BYTES, so no canonicalisation is
 * needed: the verifier checks the signature over the raw bytes, then parses.
 */
import { generateKeyPairSync, createSign, createVerify, createPublicKey, createPrivateKey } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const KEYDIR = join(homedir(), '.safetylab');
const PRIV = join(KEYDIR, 'license_signing_key.pem');
const PUB  = join(KEYDIR, 'license_signing_key.pub.jwk.json');

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function die(msg) { console.error('ERROR: ' + msg); process.exit(1); }

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'keygen') {
  if (existsSync(PRIV)) die('a private key already exists at ' + PRIV + ' — refusing to overwrite. Move it aside first if you really mean to rotate.');
  mkdirSync(KEYDIR, { recursive: true, mode: 0o700 });
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  writeFileSync(PRIV, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  try { chmodSync(PRIV, 0o600); } catch (_) {}
  const jwk = publicKey.export({ format: 'jwk' });
  const pubRecord = { kid: 'slab-' + new Date().toISOString().slice(0, 10), alg: 'ES256', ...jwk };
  writeFileSync(PUB, JSON.stringify(pubRecord, null, 2));
  console.log('Private key written to  ' + PRIV + '  (keep this; never share it)');
  console.log('Public key written to   ' + PUB);
  console.log('\nPaste this PUBLIC key into site/slab_license.js PUBLIC_KEYS:\n');
  console.log(JSON.stringify(pubRecord));
  process.exit(0);
}

if (cmd === 'template') {
  const now = new Date();
  const later = new Date(now.getTime() + 365 * 24 * 3600 * 1000);
  console.log(JSON.stringify({
    v: 1, alg: 'ES256', issuer: 'safetylabaero',
    id: 'SL-LIC-' + now.getFullYear() + '-0001',
    customer: 'Customer Name',
    tier: 'enterprise',                      // edu | pro | pro-plus | enterprise
    seats: 5,
    features: [],                            // optional feature flags
    bind: {
      domains: ['customer.com'],             // sign-in email domains allowed (recommended)
      tenant: '',                            // Entra tenant id (optional)
      backend: ''                            // host of their database, e.g. abc.supabase.co (optional)
    },
    issuedAt: now.toISOString(),
    notBefore: now.toISOString(),
    notAfter: later.toISOString()
  }, null, 2));
  process.exit(0);
}

if (cmd === 'sign') {
  const [file, ...opts] = rest;
  if (!file) die('usage: sign license.json [--out file.lic]');
  if (!existsSync(PRIV)) die('no private key at ' + PRIV + ' — run keygen first');
  const payload = JSON.parse(readFileSync(file, 'utf8'));
  for (const k of ['v', 'alg', 'issuer', 'id', 'customer', 'tier', 'notBefore', 'notAfter']) if (payload[k] == null) die('license.json is missing "' + k + '"');
  if (payload.alg !== 'ES256') die('alg must be ES256');
  if (!['edu', 'pro', 'pro-plus', 'enterprise'].includes(payload.tier)) die('tier must be edu | pro | pro-plus | enterprise');
  if (isNaN(Date.parse(payload.notBefore)) || isNaN(Date.parse(payload.notAfter))) die('notBefore/notAfter must be ISO dates');
  if (Date.parse(payload.notAfter) <= Date.parse(payload.notBefore)) die('notAfter must be after notBefore');
  const pub = JSON.parse(readFileSync(PUB, 'utf8'));
  payload.kid = pub.kid;                     // which public key verifies this (rotation)
  const payloadB64 = b64u(Buffer.from(JSON.stringify(payload), 'utf8'));
  const key = createPrivateKey(readFileSync(PRIV, 'utf8'));
  const signer = createSign('SHA256'); signer.update(Buffer.from(payloadB64, 'utf8')); signer.end();
  const sig = signer.sign({ key, dsaEncoding: 'ieee-p1363' });   // raw r||s, what WebCrypto expects
  const blob = payloadB64 + '.' + b64u(sig);
  const outIdx = opts.indexOf('--out');
  if (outIdx >= 0 && opts[outIdx + 1]) { writeFileSync(opts[outIdx + 1], blob + '\n'); console.log('Signed license written to ' + opts[outIdx + 1]); }
  else console.log(blob);
  process.exit(0);
}

if (cmd === 'verify') {
  const [file] = rest;
  if (!file) die('usage: verify file.lic');
  const blob = readFileSync(file, 'utf8').trim();
  const [p, s] = blob.split('.');
  if (!p || !s) die('not a signed license blob');
  const pub = JSON.parse(readFileSync(PUB, 'utf8'));
  const key = createPublicKey({ key: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, format: 'jwk' });
  const v = createVerify('SHA256'); v.update(Buffer.from(p, 'utf8')); v.end();
  const ok = v.verify({ key, dsaEncoding: 'ieee-p1363' }, unb64u(s));
  const payload = JSON.parse(unb64u(p).toString('utf8'));
  console.log(ok ? 'SIGNATURE OK' : 'SIGNATURE INVALID');
  console.log(JSON.stringify(payload, null, 2));
  process.exit(ok ? 0 : 2);
}

console.log('usage: node tools/license/sign.mjs keygen | template | sign license.json [--out f.lic] | verify f.lic');
process.exit(1);

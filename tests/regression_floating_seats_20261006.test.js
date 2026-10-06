#!/usr/bin/env node
/*
 * Regression: floating seats and the server-held license (6 Oct 2026).
 * Runs the real customer-install/selfhost/ai-proxy/seats.mjs, through the real worker.js router,
 * with licenses signed by a throwaway ES256 key exactly as tools/license/sign.mjs signs them, a
 * stand-in sign-in service (token -> user), and a clock the test moves.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const AP = path.join(__dirname, '..', 'customer-install', 'selfhost', 'ai-proxy');
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = Object.assign({ kid: 'test', alg: 'ES256' }, publicKey.export({ format: 'jwk' }));
function lic(over) {
  const day = 86400000, t = Date.now();
  const p = Object.assign({ v: 1, alg: 'ES256', issuer: 'safetylabaero', kid: 'test', id: 'SL-LIC-TEST', customer: 'Radia, Inc.', tier: 'enterprise', seats: 5, trial: true,
    bind: { domains: [], tenant: '', backend: '10.0.0.5' }, issuedAt: new Date(t - day).toISOString(), notBefore: new Date(t - day).toISOString(), notAfter: new Date(t + 30 * day).toISOString() }, over || {});
  const pb = b64u(JSON.stringify(p));
  const sig = crypto.sign('sha256', Buffer.from(pb), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return pb + '.' + b64u(sig);
}
const users = {}; for (let i = 1; i <= 7; i++) users['tok.user' + i + '.sig'] = { id: 'u' + i, email: 'user' + i + '@radia.com' };
let authCalls = 0;
const fakeFetch = async (url, opts) => {
  authCalls++;
  const tok = (opts.headers.authorization || '').slice(7);
  if (opts.headers.apikey !== 'pubkey') return new Response('{}', { status: 401 });
  const u = users[tok]; return u ? new Response(JSON.stringify(u), { status: 200 }) : new Response('{"msg":"bad jwt"}', { status: 401 });
};

(async () => {
  const { createSeats } = await import(path.join(AP, 'seats.mjs'));
  const worker = (await import(path.join(AP, 'worker.js')));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slseat-')), licFile = path.join(dir, 'server.lic'), data = path.join(dir, 'data');
  let clock = Date.now();
  const env = { LICENSE_MODE: 'offline', LICENSE_PUBLIC_KEYS: JSON.stringify([jwk]), LICENSE_BACKEND_HOST: '10.0.0.5', SEAT_AUTH_URL: 'http://api-gw:8000', SEAT_AUTH_KEY: 'pubkey', ALLOWED_ORIGINS: 'https://10.0.0.5', ALLOW_NULL_ORIGIN: '1' };
  const mk = () => { env.__seats = createSeats({ dataDir: data, licensePath: licFile, env, verifyLicense: worker.verifyOfflineLicense, fetchImpl: fakeFetch, now: () => clock }); return env.__seats; };
  mk();
  // Every call goes through the real router (origin check included), the way the app reaches it.
  const call = async (method, p, tok, origin) => {
    const h = { 'content-type': 'application/json' }; if (tok) h.authorization = 'Bearer ' + tok; if (origin !== undefined) h.origin = origin;
    const r = await worker.default.fetch(new Request('http://x' + p, { method, headers: h, body: method === 'POST' ? '{}' : undefined }), env, {});
    let b = null; try { b = await r.json(); } catch (_) {} return { s: r.status, b };
  };
  const claim = (i) => call('POST', '/v1/ai/seat/claim', 'tok.user' + i + '.sig');

  console.log('[1] no license on the server yet');
  let r = await call('GET', '/v1/ai/license');
  check('GET /license says no license (404)', r.s === 404 && r.b.error === 'no_license', JSON.stringify(r));
  r = await claim(1);
  check('seats are off, so the app is not blocked', r.s === 200 && r.b.enabled === false && r.b.reason === 'no_license', JSON.stringify(r.b));

  fs.writeFileSync(licFile, lic() + '\n');
  console.log('[2] a 5-seat license on the server');
  r = await call('GET', '/v1/ai/license');
  check('GET /license hands out the license', r.s === 200 && r.b.license === lic().slice(0, 0) + fs.readFileSync(licFile, 'utf8').trim());
  for (let i = 1; i <= 5; i++) { r = await claim(i); check('user ' + i + ' gets a seat', r.s === 200 && r.b.granted === true && r.b.inUse === i, JSON.stringify(r.b)); }
  r = await claim(6);
  check('the sixth person is refused (409)', r.s === 409 && r.b.granted === false && r.b.inUse === 5 && r.b.seats === 5);
  check('...and is told who holds the seats', r.b.holders.length === 5 && r.b.holders.map(h => h.email).includes('user3@radia.com'));
  check('...in plain words', /All 5 seats are in use/.test(r.b.message));
  r = await claim(2);
  check('a person who holds a seat keeps it on check-in (no second seat)', r.s === 200 && r.b.granted && r.b.inUse === 5);

  console.log('[3] giving a seat back');
  r = await call('POST', '/v1/ai/seat/release', 'tok.user2.sig');
  check('release frees it', r.s === 200 && r.b.released && r.b.inUse === 4);
  r = await claim(6);
  check('...and the person who was waiting now gets in', r.s === 200 && r.b.granted && r.b.inUse === 5);
  r = await claim(2);
  check('the one who left is now the one refused', r.s === 409);

  console.log('[4] a closed laptop: no check-in for 30 minutes');
  clock += 20 * 60000; for (const i of [1, 3, 4, 5]) await claim(i);          // four keep checking in
  clock += 11 * 60000;                                                         // user 6 silent for 31 min
  r = await call('GET', '/v1/ai/seat/status', 'tok.user7.sig');
  check('the silent seat has expired; the others have not', r.s === 200 && r.b.inUse === 4 && !r.b.holders.some(h => h.email === 'user6@radia.com'), JSON.stringify(r.b && r.b.holders));
  r = await claim(7);
  check('...so someone else can take it', r.s === 200 && r.b.granted);

  console.log('[5] the server restarts');
  mk();
  r = await call('GET', '/v1/ai/seat/status', 'tok.user1.sig');
  check('seats survive a restart', r.s === 200 && r.b.inUse === 5 && r.b.youHoldOne === true, JSON.stringify(r.b));
  check('the seat file is private to the service', (fs.statSync(path.join(data, 'seats.json')).mode & 0o077) === 0);

  console.log('[6] ten people at once, five seats');
  for (const i of [1, 3, 4, 5, 7]) await call('POST', '/v1/ai/seat/release', 'tok.user' + i + '.sig');
  for (let i = 8; i <= 17; i++) users['tok.user' + i + '.sig'] = { id: 'u' + i, email: 'user' + i + '@radia.com' };
  const rs = await Promise.all(Array.from({ length: 10 }, (_, k) => claim(8 + k)));
  check('exactly five are granted, five refused', rs.filter(x => x.s === 200 && x.b.granted).length === 5 && rs.filter(x => x.s === 409).length === 5, rs.map(x => x.s).join(','));
  check('...and never more than five recorded', Object.keys(env.__seats._state().leases).length === 5);

  console.log('[7] who is asking is decided by the server');
  r = await call('POST', '/v1/ai/seat/claim', null);
  check('no sign-in token: refused (401)', r.s === 401);
  r = await call('POST', '/v1/ai/seat/claim', 'tok.nobody.sig');
  check('a token the sign-in service does not recognize: refused (401)', r.s === 401);
  r = await call('POST', '/v1/ai/seat/claim', 'tok.user1.sig', 'https://evil.example');
  check('a web page from another site cannot call it (403)', r.s === 403);
  r = await call('GET', '/v1/ai/seat/claim', 'tok.user1.sig');
  check('wrong method refused', r.s === 405);

  console.log('[8] licenses the server must not honor');
  fs.writeFileSync(licFile, lic({ bind: { domains: [], tenant: '', backend: '10.9.9.9' } }));
  r = await call('GET', '/v1/ai/license');
  check('a license for a different server is not handed out (409)', r.s === 409 && r.b.error === 'wrong_install');
  r = await claim(1);
  check('...and seats are off rather than counted against it', r.s === 200 && r.b.enabled === false && r.b.reason === 'wrong_install');
  fs.writeFileSync(licFile, lic({ notAfter: new Date(Date.now() - 1000).toISOString() }));
  r = await call('GET', '/v1/ai/license');
  check('an expired license is not handed out', r.s === 409 && r.b.error === 'expired');
  const good = lic(); fs.writeFileSync(licFile, good.slice(0, -4) + (good.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'));
  r = await call('GET', '/v1/ai/license');
  check('a tampered license is not handed out', r.s === 409 && r.b.error === 'invalid_token');
  fs.writeFileSync(licFile, lic({ seats: undefined }));
  r = await claim(1);
  check('a license with no seat count leaves seats off', r.s === 200 && r.b.enabled === false && r.b.reason === 'no_seat_count');

  console.log('[9] nowhere but a customer server');
  delete env.__seats;
  r = await call('GET', '/v1/ai/license');
  check('without the seat service (Cloudflare proxy) the paths do not exist (404)', r.s === 404);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('  FAIL  suite crashed — ' + (e && e.stack || e)); process.exitCode = 1; });

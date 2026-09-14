#!/usr/bin/env node
/*
 * Regression — security headers on every worker response, and the worker-owned SPA fallback (S4).
 *
 * THE HOLE. `/app/<anything>` fetched the assets binding directly, and with
 * `not_found_handling: "single-page-application"` a MISSING path came back as 200 + the app shell
 * with NO security headers (no CSP, no X-Frame-Options, no nosniff). The proper fix (Waqas, 5 Sep:
 * "the worker owns the SPA fallback, real 404s"): assets `not_found_handling` is now "none", and the
 * worker returns a real 404 (with headers) for a missing file, the shell (through the header
 * chokepoint) only for a genuine deep link, and stamps the hardening headers on every asset.
 *
 * This EXECUTES the real worker against a mock assets binding — not a regex over the source.
 *
 * PINNED:
 *   H1  a missing /app/<file.ext>            -> 404, carries the hardening headers, is NOT the shell
 *   H2  a real /app/<asset>                  -> 200, keeps its body, gains nosniff/frame/HSTS
 *   H3  the app entry /app/                   -> 200 shell WITH the CSP and the hardening headers
 *   H4  an extensionless /app/<deep/link>     -> 200 shell WITH headers (SPA behaviour preserved)
 *   H5  a missing root asset                  -> 404 with headers (not a headerless 200)
 *   H6  a real root asset (favicon)           -> 200 with headers
 *   H7  both wrangler configs set not_found_handling:"none" (the worker owns the fallback)
 *
 * Run: node tests/regression_app_headers.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');

// A mock assets binding that behaves like not_found_handling:"none": known files 200, everything 404.
const ASSETS_FILES = {
  '/index.html': { body: '<!doctype html><title>Safety Lab Aero</title><body>shell</body>', type: 'text/html; charset=utf-8' },
  '/safety_lab.js': { body: 'console.log("app");', type: 'text/javascript; charset=utf-8' },
  '/favicon.svg': { body: '<svg/>', type: 'image/svg+xml' },
  '/landing.html': { body: '<!doctype html><title>landing</title>', type: 'text/html; charset=utf-8' }
};
function mockAssets() {
  return {
    fetch: (x) => {
      const href = (x instanceof URL) ? x.href : (x && x.url) ? x.url : String(x);
      const p = new URL(href).pathname;
      const f = ASSETS_FILES[p];
      if (f) return Promise.resolve(new Response(f.body, { status: 200, headers: { 'content-type': f.type } }));
      return Promise.resolve(new Response('asset not found', { status: 404, headers: { 'content-type': 'text/plain' } }));
    }
  };
}
const ENV = { ASSETS: mockAssets() };
const CTX = { waitUntil() {}, passThroughOnException() {} };
const req = (u) => new Request(u, { redirect: 'manual' });
const hasSec = (r) => r.headers.get('x-content-type-options') === 'nosniff' && r.headers.get('x-frame-options') === 'DENY' && !!r.headers.get('strict-transport-security');

(async () => {
  const mod = await import(url.pathToFileURL(path.join(ROOT, 'worker.js')).href);
  const worker = mod.default;
  const call = (u) => worker.fetch(req(u), ENV, CTX);
  const B = 'https://safetylabaero.com';

  console.log('[H1] a missing /app/<file.ext> is a real 404 with headers, not the shell');
  {
    const r = await call(B + '/app/does-not-exist.js');
    const body = await r.text();
    check('status 404', r.status === 404, 'got ' + r.status);
    check('carries the hardening headers', hasSec(r));
    check('is NOT the app shell', !/shell/.test(body), body.slice(0, 40));
  }

  console.log('\n[H2] a real /app/ asset is served with headers');
  {
    const r = await call(B + '/app/safety_lab.js');
    const body = await r.text();
    check('status 200', r.status === 200);
    check('keeps its body', /console\.log/.test(body));
    check('gains nosniff/frame/HSTS', hasSec(r));
  }

  console.log('\n[H3] the app entry /app/ is the shell WITH the CSP and hardening headers');
  {
    const r = await call(B + '/app/');
    const body = await r.text();
    check('status 200 shell', r.status === 200 && /shell/.test(body));
    check('has the Content-Security-Policy', !!r.headers.get('content-security-policy'));
    check('has the hardening headers', hasSec(r));
    check('shell is no-store (fresh on every load)', /no-store/.test(r.headers.get('cache-control') || ''));
  }

  console.log('\n[H4] an extensionless /app deep link still gets the shell, with headers');
  {
    const r = await call(B + '/app/some/deep/route');
    const body = await r.text();
    check('status 200 shell', r.status === 200 && /shell/.test(body));
    check('has the CSP + hardening headers', !!r.headers.get('content-security-policy') && hasSec(r));
  }

  console.log('\n[H5] a missing root asset is a 404 with headers');
  {
    const r = await call(B + '/robots.txt');
    check('status 404 with headers', r.status === 404 && hasSec(r), 'got ' + r.status);
  }

  console.log('\n[H6] a real root asset is served with headers');
  {
    const r = await call(B + '/favicon.svg');
    check('status 200 with headers', r.status === 200 && hasSec(r));
  }

  console.log('\n[H7] the assets binding no longer owns the fallback (not_found_handling:"none")');
  for (const wf of ['wrangler.jsonc', 'wrangler.dist.jsonc']) {
    const t = fs.readFileSync(path.join(ROOT, wf), 'utf8');
    check(wf + ' sets not_found_handling:"none"', /"not_found_handling":\s*"none"/.test(t) && !/single-page-application/.test(t));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  suite threw: ' + (e && e.stack || e)); process.exit(1); });

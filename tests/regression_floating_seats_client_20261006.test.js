#!/usr/bin/env node
/*
 * Regression: the app side of floating seats, site/slab_seats.js (6 Oct 2026).
 * Executes the real file in a vm with a stand-in window, document, sign-in session and server,
 * and checks it blocks the app ONLY on a definite "all seats are in use" from the customer's own
 * server, never on the hosted cloud, an older server, a network error or seats switched off.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'slab_seats.js'), 'utf8');

function world(opts) {
  const calls = [], els = {}, timers = [];
  const mkEl = (tag) => ({ tag, style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, set innerHTML(h) { this._h = h; for (const id of ['slab-seats-retry', 'slab-seats-signout']) els[id] = { onclick: null, focus() {} }; }, get innerHTML() { return this._h; }, parentNode: null });
  const body = { kids: [], appendChild(e) { e.parentNode = this; this.kids.push(e); }, removeChild(e) { this.kids = this.kids.filter(k => k !== e); e.parentNode = null; } };
  const document = { body, visibilityState: 'visible', createElement: mkEl, getElementById: id => els[id] || null, addEventListener() {} };
  const store = {};
  const listeners = [];
  const W = {
    SLConfig: Object.assign({ mode: 'desktop', supabaseUrl: 'https://10.0.0.5', aiEndpoint: 'https://10.0.0.5/v1/ai', pointsAtSafetyLab: u => /safetylabaero\.com|fhrqkhdrwb/.test(u) }, opts.cfg || {}),
    getSupabaseSession: () => opts.session === null ? null : { access_token: 'jwt.a.b' },
    getSupabaseClient: () => ({ auth: { onAuthStateChange: fn => listeners.push(fn), signOut() { calls.push('signOut'); } } }),
    addEventListener() {},
    fetch: async (url, init) => { calls.push(init.method + ' ' + url.replace('https://10.0.0.5/v1/ai', '')); return opts.server(url, init); },
  };
  const ctx = { window: W, document, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); } },
    setTimeout: (f, ms) => { timers.push(ms); return timers.length; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, JSON, Math, Date, String, Promise };
  ctx.fetch = W.fetch;
  vm.runInNewContext(SRC, ctx);
  return { W, calls, body, timers, els };
}
const reply = (status, body) => ({ status, json: async () => body });
const FULL = { granted: false, enabled: true, seats: 5, inUse: 5, message: 'All 5 seats are in use.', holders: [{ email: 'a@radia.com' }, { email: 'b@radia.com' }, { email: 'c@radia.com' }, { email: 'd@radia.com' }, { email: 'e@radia.com' }] };

(async () => {
  console.log('[1] a seat is free');
  let w = world({ server: () => reply(200, { granted: true, enabled: true, seats: 5, inUse: 3, holders: [] }) });
  let s = await w.W.SLSeats.claimNow();
  check('it claims a seat with the sign-in token and holds it', s.status === 'held' && w.calls[0] === 'POST /seat/claim');
  check('nothing covers the app', w.body.kids.length === 0);
  check('it checks in again in 5 minutes', w.timers.includes(5 * 60 * 1000));
  await w.W.SLSeats.release();
  check('sign-out gives the seat back', w.calls.includes('POST /seat/release'));

  console.log('[2] all seats are taken');
  w = world({ server: () => reply(409, FULL) });
  s = await w.W.SLSeats.claimNow();
  check('the app is covered by the "all seats in use" screen', s.status === 'full' && w.body.kids.length === 1 && /All 5 seats are in use/.test(w.body.kids[0].innerHTML));
  check('...listing who holds them', /c@radia\.com/.test(w.body.kids[0].innerHTML));
  check('...and it tries again every minute', w.timers.includes(60 * 1000));
  check('...with Try again and Sign out buttons that work', typeof w.els['slab-seats-retry'].onclick === 'function' && (w.els['slab-seats-signout'].onclick(), w.calls.includes('signOut')));
  { const x = world({ server: () => reply(409, Object.assign({}, FULL, { holders: [{ email: '<img src=x onerror=alert(1)>' }] })) });
    await x.W.SLSeats.claimNow();
    check('a seat holder email cannot inject markup into the screen', x.body.kids.length === 1 && !/<img/.test(x.body.kids[0].innerHTML) && /&lt;img/.test(x.body.kids[0].innerHTML)); }
  let freed = false; w = world({ server: () => freed ? reply(200, { granted: true, enabled: true, seats: 5, inUse: 5 }) : reply(409, FULL) });
  await w.W.SLSeats.claimNow(); freed = true; s = await w.W.SLSeats.claimNow();
  check('when a seat frees up, the screen goes away', s.status === 'held' && w.body.kids.length === 0);

  console.log('[3] never blocks for anything else');
  for (const [name, o] of [
    ['an older server with no seat service (404)', { server: () => reply(404, {}) }],
    ['seats off on the server (no license loaded)', { server: () => reply(200, { enabled: false, reason: 'no_license' }) }],
    ['a network error', { server: () => { throw new Error('offline'); } }],
    ['an expired sign-in (401)', { server: () => reply(401, {}) }],
  ]) { w = world(o); s = await w.W.SLSeats.claimNow(); check(name + ': app not covered', w.body.kids.length === 0 && s.status !== 'full', s.status); }
  for (const [name, cfg] of [
    ['the hosted cloud (Safety Lab\'s servers)', { supabaseUrl: 'https://fhrqkhdrwbfnizkepkch.supabase.co', aiEndpoint: 'https://safetylabaero.com/v1/ai' }],
    ['the browser-only door (no server)', { mode: 'browser-only', supabaseUrl: '', aiEndpoint: '' }],
    ['hosted demo mode', { mode: 'hosted-demo' }],
  ]) { w = world({ cfg, server: () => reply(409, FULL) }); s = await w.W.SLSeats.claimNow(); check(name + ': never asks for a seat', w.calls.length === 0 && w.body.kids.length === 0); }
  w = world({ session: null, server: () => reply(409, FULL) }); s = await w.W.SLSeats.claimNow();
  check('not signed in: never asks for a seat', w.calls.length === 0 && w.body.kids.length === 0);

  console.log('[4] wiring');
  const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
  check('index.html loads slab_seats.js after the sign-in modules', html.indexOf('slab_seats.js') > html.indexOf('bindings_modules.js') && html.indexOf('slab_seats.js') > html.indexOf('helpers_modules.js'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('  FAIL  suite crashed — ' + (e && e.stack || e)); process.exitCode = 1; });

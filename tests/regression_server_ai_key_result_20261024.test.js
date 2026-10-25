#!/usr/bin/env node
/*
 * Regression: the Server AI key box keeps its result, quotes Anthropic, and names a sign-in token
 * (24 Oct 2026, Radia, open item NS-5).
 *
 * On Radia's server a failed save left an empty box (it empties on purpose: a pasted key never
 * stays in the page) and a reason that said only "not valid", and the result was gone when the
 * person came back to AI settings. What had been pasted was a Claude app sign-in token, which
 * looks like a key (sk-ant-...) and which Anthropic refuses with "invalid x-api-key". Now:
 *   server (selfhost/ai-proxy/server_key.mjs)
 *     1. a sign-in token (sk-ant-oat) or an Admin key (sk-ant-admin) is named as such and refused
 *        before anything goes to Anthropic;
 *     2. a key Anthropic refuses carries Anthropic's own status, type and message word for word,
 *        401 (not valid) and 403 (not allowed) told apart, other answers quoted too;
 *   app (site/server_ai_key.js)
 *     3. the result stays: it names the key by its last four characters and the time, and it is
 *        still there after leaving AI settings and coming back, until the next save or removal;
 *     4. a sign-in token is named before anything is sent (so an older server is never the only
 *        voice), with the same words as the server;
 *     5. the key itself never appears in the page, in any answer, or in what is kept.
 *
 * Run: node tests/regression_server_ai_key_result_20261024.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const { pathToFileURL } = require('url');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 500) + ')' : '')); } };
const REPO = path.join(__dirname, '..'), PROXY = path.join(REPO, 'customer-install/selfhost/ai-proxy');
const SKSRC = process.env.SL_SERVER_KEY || path.join(PROXY, 'server_key.mjs');
const APPSRC = process.env.SL_SERVER_AI_KEY_JS || path.join(REPO, 'site/server_ai_key.js');
const GOOD = 'sk-ant-api03-' + 'A'.repeat(40) + 'wxyz';
const REVOKED = 'sk-ant-api03-' + 'R'.repeat(40) + 'rvkd', DENIED = 'sk-ant-api03-' + 'D'.repeat(40) + 'dnyd', BUSY = 'sk-ant-api03-' + 'O'.repeat(40) + 'ovld', BARE = 'sk-ant-api03-' + 'N'.repeat(40) + 'nobd';
const OAT = 'sk-ant-oat01-' + 'T'.repeat(60) + 'oat9', ADMIN = 'sk-ant-admin01-' + 'M'.repeat(60) + 'adm1';
const JWT = 'aaa.admin.sig';

(async function main() {
  const SK = await import(pathToFileURL(SKSRC).href + '?t=' + Date.now());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-key2-'));
  const sentToAnthropic = [];
  const err = (status, type, message) => new Response(JSON.stringify({ type: 'error', error: { type, message }, request_id: 'req_x' }), { status, headers: { 'content-type': 'application/json' } });
  const fakeFetch = async (url, opts) => {
    const h = (opts && opts.headers) || {};
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u-admin', email: 'brian.ciocca@radia.com' }), { status: 200 });
    if (url.endsWith('/rest/v1/rpc/am_i_server_admin')) return new Response('true', { status: 200 });
    if (url.startsWith('https://api.anthropic.com/')) {
      const k = h['x-api-key']; sentToAnthropic.push(k);
      if (k === GOOD) return new Response('{"data":[]}', { status: 200 });
      if (k === DENIED) return err(403, 'permission_error', 'Your API key does not have permission to use the specified resource.');
      if (k === BUSY) return err(529, 'overloaded_error', 'Overloaded');
      if (k === BARE) return new Response('<html>nope</html>', { status: 401 });
      return err(401, 'authentication_error', 'invalid x-api-key');
    }
    return new Response('{}', { status: 404 });
  };
  const svc = SK.createServerKey({ dataDir: dir, env: { SEAT_AUTH_URL: 'http://api-gw:8000', SEAT_AUTH_KEY: 'k', ANTHROPIC_API_KEY: 'later' }, fetchImpl: fakeFetch });
  const post = async body => { const r = await svc.handle(new Request('http://x/v1/ai/admin/ai-key', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + JWT }, body: JSON.stringify(body) })); const t = await r.text(); return { status: r.status, text: t, data: JSON.parse(t) }; };
  const stored = () => fs.existsSync(path.join(dir, 'anthropic-key.json'));

  console.log('\n[server] the wrong kind of key is named, before Anthropic is asked');
  let r = await post({ key: OAT });
  check('1 a Claude app sign-in token: refused, named as one, told where to get an API key', r.status === 400 && r.data.error === 'kind' && /Claude app sign-in token \(it starts with sk-ant-oat\), not an API key/.test(r.data.message) && /console\.anthropic\.com/.test(r.data.message) && /Nothing was saved/.test(r.data.message), r.text);
  check('1 the sign-in token is never sent to Anthropic, never stored', !sentToAnthropic.includes(OAT) && !stored());
  r = await post({ key: ADMIN });
  check('1 an Admin key: refused, named as one', r.status === 400 && r.data.error === 'kind' && /Anthropic Admin key \(it starts with sk-ant-admin\)/.test(r.data.message) && !sentToAnthropic.includes(ADMIN), r.text);

  console.log('\n[server] Anthropic\'s own reason, word for word');
  r = await post({ key: REVOKED });
  check('2 401: Anthropic\'s status, type and message quoted exactly', r.status === 400 && r.data.message.indexOf('Anthropic answered 401 authentication_error: "invalid x-api-key".') === 0 && /not valid/.test(r.data.message) && /Nothing was saved/.test(r.data.message), r.text);
  check('2 401: the same, as data the app can use', r.data.anthropic && r.data.anthropic.status === 401 && r.data.anthropic.type === 'authentication_error' && r.data.anthropic.message === 'invalid x-api-key', r.text);
  r = await post({ key: DENIED });
  check('2 403 is told apart from 401: the key exists but is not allowed', r.status === 400 && /^Anthropic answered 403 permission_error: "Your API key does not have permission to use the specified resource\."/.test(r.data.message) && /not allowed/.test(r.data.message) && !/not valid/.test(r.data.message), r.text);
  r = await post({ key: BUSY });
  check('2 any other answer is quoted too, and says to try again', r.status === 502 && /^Anthropic answered 529 overloaded_error: "Overloaded"\. Nothing was saved; try again/.test(r.data.message), r.text);
  r = await post({ key: BARE });
  check('2 an answer with no readable reason says so, never invents one', r.status === 400 && /^Anthropic answered 401 with no reason given\./.test(r.data.message), r.text);
  check('5 no refused key is stored, and no answer carries any key', !stored() && [REVOKED, DENIED, BUSY, BARE].every(k => !r.text.includes(k)));
  r = await post({ key: GOOD });
  check('a good key still saves', r.status === 200 && r.data.saved && r.data.last4 === 'wxyz' && stored() && !r.text.includes(GOOD), r.text);

  console.log('\n[app] the result stays, and names the key by its last four characters');
  const js = fs.readFileSync(APPSRC, 'utf8');
  function page(answers) {
    const els = { 'server-ai-key-panel': { style: {}, innerHTML: '' }, 'server-ai-key-input': { value: '' } };
    const sent = [];
    const ctx = { console, Date, document: { getElementById: id => els[id] || null }, getSupabaseSession: () => ({ access_token: JWT }),
      SLConfig: { mode: 'desktop', supabaseUrl: 'https://192.168.10.42', aiEndpoint: 'https://192.168.10.42/v1/ai', pointsAtSafetyLab: u => /safetylabaero\.com/.test(u) },
      fetch: async (u, o) => {
        if (/\/health$/.test(u)) return { ok: true, status: 200, json: async () => ({ ok: true, features: ['server-ai-key'] }) };
        sent.push({ u, o }); const a = answers[(o && o.method) || 'GET'].shift() || { status: 500, data: {} };
        return { ok: a.status === 200, status: a.status, json: async () => a.data };
      } };
    ctx.window = ctx; vm.createContext(ctx); vm.runInContext(js, ctx);
    return { ctx, els, sent, html: () => els['server-ai-key-panel'].innerHTML };
  }
  const NOKEY = { status: 200, data: { set: false, source: 'none' } };
  const reason = 'Anthropic answered 401 authentication_error: "invalid x-api-key". The key is not valid: it may have been revoked or deleted, or copied with a character missing. Nothing was saved.';
  const p = page({ GET: [NOKEY, NOKEY, NOKEY], POST: [{ status: 400, data: { error: 'verify', message: reason, anthropic: { status: 401, type: 'authentication_error', message: 'invalid x-api-key' } } }] });
  await p.ctx.SLServerAiKey.render();
  p.els['server-ai-key-input'].value = REVOKED;
  await p.ctx.SLServerAiKey.save();
  const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  check('3 a failed save: the box is empty (on purpose) and the result says Not saved', p.els['server-ai-key-input'].value === '' && /Not saved/.test(p.html()), p.html());
  check('3 it names the key by its last four characters, with the time', /the key ending \u2026rvkd\)/.test(p.html()) && /\(\d\d:\d\d, the key/.test(p.html()), p.html());
  check('3 Anthropic\'s reason is shown word for word', p.html().includes(esc(reason)), p.html());
  await p.ctx.SLServerAiKey.render();       // leave AI settings and come back
  check('3 the result is still there after coming back to AI settings', /Not saved/.test(p.html()) && p.html().includes(esc(reason)) && /\u2026rvkd/.test(p.html()), p.html());
  check('5 the full key is nowhere in the page', !p.html().includes(REVOKED) && !p.html().includes(REVOKED.slice(0, 20)));

  const q = page({ GET: [NOKEY, { status: 200, data: { set: true, source: 'app', last4: 'wxyz' } }], POST: [{ status: 200, data: { saved: true, set: true, source: 'app', last4: 'wxyz' } }] });
  await q.ctx.SLServerAiKey.render();
  q.els['server-ai-key-input'].value = GOOD; await q.ctx.SLServerAiKey.save();
  await q.ctx.SLServerAiKey.render();
  check('3 a later good save replaces the failure, and also stays', /Saved<\/span> \(\d\d:\d\d\)/.test(q.html()) && !/Not saved/.test(q.html()), q.html());

  console.log('\n[app] a sign-in token is named before anything is sent');
  const t = page({ GET: [NOKEY, NOKEY], POST: [] });
  await t.ctx.SLServerAiKey.render();
  t.els['server-ai-key-input'].value = OAT;
  await t.ctx.SLServerAiKey.save();
  check('4 nothing is sent to the server', t.sent.filter(s => s.o && s.o.method === 'POST').length === 0, JSON.stringify(t.sent.map(s => s.o && s.o.method)));
  check('4 it is named, the box is empty, the token itself is not shown', /Claude app sign-in token/.test(t.html()) && /\u2026oat9/.test(t.html()) && t.els['server-ai-key-input'].value === '' && !t.html().includes(OAT.slice(0, 20)), t.html());
  await t.ctx.SLServerAiKey.render();
  check('4 and it stays after coming back', /Claude app sign-in token/.test(t.html()));
  t.els['server-ai-key-input'].value = ADMIN; await t.ctx.SLServerAiKey.save();
  check('4 an Admin key is named too', /Anthropic Admin key/.test(t.html()) && t.sent.filter(s => s.o && s.o.method === 'POST').length === 0);

  console.log('\n[same words] app and server');
  for (const k of [OAT, ADMIN, GOOD]) check('4 the app and the server say the same for ' + k.slice(0, 13), t.ctx.SLServerAiKey._wrongKind(k) === SK.wrongKind(k));

  const idx = fs.readFileSync(path.join(REPO, 'site/index.html'), 'utf8');
  const m = /server_ai_key\.js\?v=([0-9.]+)"/.exec(idx);
  check('the page loads server_ai_key.js at 1.3 or later', m && (+m[1].split('.')[0] > 1 || +m[1].split('.')[1] >= 3), m && m[1]);
  check('no em dashes in what was added', [js, fs.readFileSync(SKSRC, 'utf8'), fs.readFileSync(__filename, 'utf8')].every(s => s.indexOf(String.fromCharCode(0x2014)) < 0));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });

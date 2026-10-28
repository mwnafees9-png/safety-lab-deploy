#!/usr/bin/env node
/*
 * Regression: the administrator of a customer's own server sets the AI key from inside the app
 * (21 Oct 2026).
 *
 * Radia: "his anthropic API key is not saving on the desktop app". On a customer's own server the
 * AI runs through the server, so the key box in the app was never the place for it (the desktop
 * says so: "not used on the desktop"), and the only real way was a command in the server's
 * terminal. Waqas: "why cant he just save his API key directly in safety lab". Now the server's
 * administrator pastes it in AI Assistant settings; the server checks it with Anthropic, keeps
 * it, and uses it at once. The key never comes back out.
 *
 * These checks run the real server_key.mjs against stand-ins for the server's sign-in service,
 * its database and Anthropic, and the real worker.js for the routing and the key it uses.
 *
 * Run: node tests/regression_server_ai_key_20261021.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const { pathToFileURL } = require('url');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const REPO = path.join(__dirname, '..'), PROXY = path.join(REPO, 'customer-install/selfhost/ai-proxy');
const GOOD = 'sk-ant-api03-' + 'A'.repeat(40) + 'wxyz', GOOD2 = 'sk-ant-api03-' + 'B'.repeat(40) + 'qrst';
const JWT_ADMIN = 'aaa.admin.sig', JWT_USER = 'aaa.user.sig';

(async function main() {
  const SK = await import(pathToFileURL(path.join(PROXY, 'server_key.mjs')).href);
  const W = await import(pathToFileURL(path.join(PROXY, 'worker.js')).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-key-'));
  const calls = [];
  let anthropic = 200, adminRpc = 200;
  const fakeFetch = async (url, opts) => {
    opts = opts || {};
    const h = opts.headers || {};
    calls.push({ url, auth: h.authorization || '', xkey: h['x-api-key'] || '' });
    if (url.endsWith('/auth/v1/user')) {
      if (h.authorization === 'Bearer ' + JWT_ADMIN) return new Response(JSON.stringify({ id: 'u-admin', email: 'brian.ciocca@radia.com' }), { status: 200 });
      if (h.authorization === 'Bearer ' + JWT_USER) return new Response(JSON.stringify({ id: 'u-user', email: 'eng@radia.com' }), { status: 200 });
      return new Response('{}', { status: 401 });
    }
    if (url.endsWith('/rest/v1/rpc/am_i_server_admin')) {
      if (adminRpc !== 200) return new Response('{}', { status: adminRpc });
      return new Response(JSON.stringify(h.authorization === 'Bearer ' + JWT_ADMIN), { status: 200 });
    }
    if (url.startsWith('https://api.anthropic.com/v1/models')) {
      if (anthropic === 'down') throw new Error('ENOTFOUND');
      return new Response('{}', { status: anthropic === 200 ? (h['x-api-key'] === GOOD || h['x-api-key'] === GOOD2 ? 200 : 401) : anthropic });
    }
    return new Response('{}', { status: 404 });
  };
  const env = { SEAT_AUTH_URL: 'http://api-gw:8000', SEAT_AUTH_KEY: 'sb_publishable_x', ANTHROPIC_API_KEY: 'later' };
  const svc = SK.createServerKey({ dataDir: dir, env, fetchImpl: fakeFetch, now: () => Date.parse('2026-10-21T15:00:00Z') });
  const req = (method, jwt, body) => new Request('http://x/v1/ai/admin/ai-key', { method, headers: Object.assign({ 'content-type': 'application/json' }, jwt ? { authorization: 'Bearer ' + jwt } : {}), body: body ? JSON.stringify(body) : undefined });
  const go = async (method, jwt, body) => { const r = await svc.handle(req(method, jwt, body)); return { status: r.status, data: await r.json() }; };

  console.log('\n[who] only the server\'s administrator');
  check('not signed in: refused', (await go('GET')).status === 401);
  const u = await go('GET', JWT_USER);
  check('a signed-in engineer who is not the administrator: refused, told why', u.status === 403 && /Only this server's administrator/.test(u.data.message));
  check('a signed-in engineer cannot set it either', (await go('POST', JWT_USER, { key: GOOD })).status === 403 && !fs.existsSync(path.join(dir, 'anthropic-key.json')));
  const a0 = await go('GET', JWT_ADMIN);
  check('the administrator sees there is no key yet (a placeholder in ai-proxy.env counts as none)', a0.status === 200 && a0.data.set === false, JSON.stringify(a0));
  check('the admin check is asked of the database with the caller\'s OWN token', calls.some(c => /am_i_server_admin/.test(c.url) && c.auth === 'Bearer ' + JWT_ADMIN));
  adminRpc = 404;
  const old = await go('GET', JWT_ADMIN);
  check('a server database without the check: says to run install.sh again', old.status === 503 && /Run install\.sh again/.test(old.data.message));
  adminRpc = 200;

  console.log('\n[set] checked with Anthropic, then kept and used');
  const bad = await go('POST', JWT_ADMIN, { key: 'hello' });
  check('not an Anthropic key: refused before anything is sent anywhere', bad.status === 400 && /starts with sk-ant-/.test(bad.data.message) && !calls.some(c => c.xkey === 'hello'));
  const revoked = await go('POST', JWT_ADMIN, { key: 'sk-ant-api03-' + 'Z'.repeat(40) });
  check('a key Anthropic refuses: not saved, told why', revoked.status === 400 && /not valid/.test(revoked.data.message) && !fs.existsSync(path.join(dir, 'anthropic-key.json')));
  anthropic = 'down';
  const down = await go('POST', JWT_ADMIN, { key: GOOD });
  check('Anthropic unreachable from the server: not saved, told what IT must allow', down.status === 502 && /api\.anthropic\.com/.test(down.data.message) && !fs.existsSync(path.join(dir, 'anthropic-key.json')));
  anthropic = 200;
  const ok = await go('POST', JWT_ADMIN, { key: GOOD });
  check('a good key: saved, with who and when', ok.status === 200 && ok.data.saved && ok.data.set && ok.data.source === 'app' && ok.data.last4 === 'wxyz' && ok.data.setBy === 'brian.ciocca@radia.com' && ok.data.setAt === '2026-10-21T15:00:00.000Z', JSON.stringify(ok));
  check('the key itself is never in any answer', !JSON.stringify(ok.data).includes(GOOD) && !JSON.stringify((await go('GET', JWT_ADMIN)).data).includes(GOOD));
  const file = path.join(dir, 'anthropic-key.json');
  check('stored on the server, readable by its owner only', fs.existsSync(file) && (fs.statSync(file).mode & 0o077) === 0, (fs.statSync(file).mode & 0o777).toString(8));
  check('every AI call uses it from now on (over the placeholder in ai-proxy.env)', svc.get() === GOOD);
  await go('POST', JWT_ADMIN, { key: GOOD2 });
  check('replacing it takes effect at once', svc.get() === GOOD2);
  const rm = await go('POST', JWT_ADMIN, { remove: true });
  check('removing it: gone, and the server says there is no key again', rm.status === 200 && rm.data.removed && rm.data.set === false && svc.get() === '' && !fs.existsSync(file));
  env.ANTHROPIC_API_KEY = GOOD;
  const envOnly = await go('GET', JWT_ADMIN);
  check('a real key in ai-proxy.env still works, and is shown as set there', envOnly.data.set && envOnly.data.source === 'server file' && svc.get() === GOOD);
  env.ANTHROPIC_API_KEY = 'later';
  check('only GET and POST (the desktop calls across origins; this service allows no other methods)', (await svc.handle(req('DELETE', JWT_ADMIN))).status === 405);

  console.log('\n[worker] routed only on a customer server, and the key it uses');
  const ROUTE = { LICENSE_MODE: 'offline', ALLOWED_ORIGINS: 'https://x' };
  const hosted = await W.default.fetch(new Request('https://api.safetylabaero.com/v1/ai/admin/ai-key', { headers: { authorization: 'Bearer ' + JWT_ADMIN } }), {}, {});
  check('Safety Lab\'s cloud has no such path', hosted.status === 404);
  let handled = 0;
  const onServer = await W.default.fetch(new Request('https://x/v1/ai/admin/ai-key', { headers: { authorization: 'Bearer ' + JWT_ADMIN } }), Object.assign({}, ROUTE, { __serverKey: { handle: async () => { handled++; return new Response('{"set":false}', { status: 200 }); }, get: () => '' } }), {});
  check('a customer server hands it to the server key service', onServer.status === 200 && handled === 1);
  const wsrc = fs.readFileSync(path.join(PROXY, 'worker.js'), 'utf8');
  check('a licensed AI call on a customer server uses the server key, and says so in words when there is none',
    /if \(env\.__serverKey && caller && caller\.kind === "license"\) \{\s*apiKey = env\.__serverKey\.get\(\);\s*if \(!apiKey\) return jsonResponse\(503, \{ error: \{ type: "no_server_key"/.test(wsrc));
  const twin = path.join(REPO, '..', 'safety-lab-proxy-deploy', 'worker.js');
  if (fs.existsSync(twin)) check('proxy-deploy worker is byte-identical to the customer copy', fs.readFileSync(twin, 'utf8') === wsrc);
  const srv = fs.readFileSync(path.join(PROXY, 'server.mjs'), 'utf8');
  check('server.mjs creates the service only in offline-licence (customer server) mode', /if \(env\.LICENSE_MODE === "offline"\) \{[\s\S]*env\.__serverKey = createServerKey\(/.test(srv));

  console.log('\n[db] the administrator check');
  const sql = fs.readFileSync(path.join(REPO, 'customer-install/db/26_server_admin_check.sql'), 'utf8');
  check('am_i_server_admin answers for the caller only, with the existing admin rule', /create or replace function public\.am_i_server_admin\(\)/.test(sql) && /private\.is_safety_lab_admin\(\)/.test(sql) && /security definer/.test(sql));
  check('callable by signed-in users only', /revoke all on function public\.am_i_server_admin\(\) from public, anon;/.test(sql) && /grant execute on function public\.am_i_server_admin\(\) to authenticated;/.test(sql));
  check('apply.sh runs it', /for f in [^;]* 26_server_admin_check[ ;]/.test(fs.readFileSync(path.join(REPO, 'customer-install/db/apply.sh'), 'utf8')));

  console.log('\n[app] the panel');
  const idx = fs.readFileSync(path.join(REPO, 'site/index.html'), 'utf8'), js = fs.readFileSync(path.join(REPO, 'site/server_ai_key.js'), 'utf8');
  check('the panel sits in AI settings and the script loads', /id="server-ai-key-panel"/.test(idx) && /<script src="server_ai_key\.js\?v=1\.[0-9]+" defer><\/script>/.test(idx));   // 1.0 or later (22 Oct 2026: 1.1)
  check('it shows only on a customer\'s own server (the same test the seats use)', /pointsAtSafetyLab\(c\.aiEndpoint\) \|\| c\.pointsAtSafetyLab\(c\.supabaseUrl\)/.test(js) && /h\.style\.display = 'none'/.test(js));
  check('the pasted key is cleared from the page before the request goes out', js.indexOf("if (el) el.value = '';") < js.indexOf("call('POST', { key: key })"));
  check('the key is never written to the console, storage or the journal', !/console\.(log|info|warn)\([^)]*key/i.test(js) && !/localStorage|sessionStorage/.test(js) && /jrnl\('server-ai-key', 'Server AI key ' \+ \(r\.data\.last4/.test(js));
  // behaviour: a cloud install hides it; a customer server shows the admin view
  function page(cfg, answer) {
    const els = { 'server-ai-key-panel': { style: {}, innerHTML: '' }, 'server-ai-key-input': { value: '' } };
    const sent = [];
    const ctx = { console, document: { getElementById: id => els[id] || null }, SLConfig: cfg, getSupabaseSession: () => ({ access_token: JWT_ADMIN }),
      fetch: async (u, o) => {
        // 23 Oct 2026: the panel asks the AI service what it can do (/health) before it calls a
        // server "older". An older service answers /health without "features"; a current one lists them.
        if (/\/health$/.test(u)) return { ok: true, status: 200, json: async () => answer.health || { ok: true, service: 'safety-lab-proxy', ts: 1 } };
        sent.push({ u, o }); return { ok: answer.status === 200, status: answer.status, json: async () => answer.data }; } };
    ctx.window = ctx; vm.createContext(ctx); vm.runInContext(js, ctx);
    return { ctx, els, sent };
  }
  const cloud = page({ mode: 'hosted', supabaseUrl: 'https://db.safetylabaero.com', aiEndpoint: 'https://api.safetylabaero.com/v1/ai', pointsAtSafetyLab: u => /safetylabaero\.com/.test(u) }, { status: 200, data: {} });
  await cloud.ctx.SLServerAiKey.render();
  check('Safety Lab\'s cloud: hidden, nothing asked', cloud.els['server-ai-key-panel'].style.display === 'none' && cloud.sent.length === 0);
  const radia = { mode: 'desktop', supabaseUrl: 'https://192.168.10.42', aiEndpoint: 'https://192.168.10.42/v1/ai', pointsAtSafetyLab: u => /safetylabaero\.com/.test(u) };
  const p1 = page(radia, { status: 200, data: { set: false, source: 'none' } });
  await p1.ctx.SLServerAiKey.render();
  check('a customer server, the administrator: asks the server, offers to save a key', p1.sent[0].u === 'https://192.168.10.42/v1/ai/admin/ai-key' && /Save key/.test(p1.els['server-ai-key-panel'].innerHTML) && /No AI key on this server yet/.test(p1.els['server-ai-key-panel'].innerHTML));
  p1.els['server-ai-key-input'].value = GOOD;
  await p1.ctx.SLServerAiKey.save();
  const post = p1.sent[1];
  check('saving sends the key once, to the server, with the user\'s own sign-in, and empties the box', post && post.o.method === 'POST' && JSON.parse(post.o.body).key === GOOD && post.o.headers.authorization === 'Bearer ' + JWT_ADMIN && p1.els['server-ai-key-input'].value === '');
  const p2 = page(radia, { status: 403, data: { message: 'Only this server\'s administrator can see or change its AI key.' } });
  await p2.ctx.SLServerAiKey.render();
  check('a customer server, an engineer: told only the administrator can set it, no box', /Only your Safety Lab administrator/.test(p2.els['server-ai-key-panel'].innerHTML) && !/server-ai-key-input/.test(p2.els['server-ai-key-panel'].innerHTML));
  const p3 = page(radia, { status: 404, data: {} });
  await p3.ctx.SLServerAiKey.render();
  check('an older server without the service: says IT must install the latest server package', /older than this app/.test(p3.els['server-ai-key-panel'].innerHTML));
  const p4 = page(radia, { status: 401, data: { error: { type: 'unauthorized', message: 'Malformed token.' } }, health: { ok: true, service: 'safety-lab-proxy', features: ['server-ai-key'] } });
  await p4.ctx.SLServerAiKey.render();
  check('a current server that refuses: its own words, never "older"', /Malformed token\./.test(p4.els['server-ai-key-panel'].innerHTML) && !/older than this app/.test(p4.els['server-ai-key-panel'].innerHTML));
  check('no em dashes in what was added', [js, fs.readFileSync(path.join(PROXY, 'server_key.mjs'), 'utf8'), sql, fs.readFileSync(__filename, 'utf8')].every(t => t.indexOf(String.fromCharCode(0x2014)) < 0));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });

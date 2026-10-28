#!/usr/bin/env node
/*
 * Regression: the company server's relay reaches Polarion and Codebeamer for the Connections engine (28 Oct 2026).
 * /v1/ai/bridge?tool=<tool>&target=<url>. The real handleToolBridge from customer-install/selfhost/ai-proxy/worker.js
 * runs with a stand-in vault and a stand-in upstream. Pinned:
 *   [A] the fence in the relay is the engine's own, word for word (site/alm_engine.js), so the page, the desktop and
 *       the server refuse the same requests;
 *   [B] the login is the user's own "<tool>_token" vault secret, put on the request here (Bearer for Polarion and a
 *       Codebeamer token, Basic for a Codebeamer username and password) and never returned; the target host must be
 *       the one saved with it; a delete, another path, a query on a write, a body that is not JSON never go out;
 *       redirects are not followed; Codebeamer's "slow down" and its Retry-After come back to the page;
 *   [C] the route sends GET, POST, PATCH and PUT with ?tool= to it; Jama's own route is unchanged.
 * MUTATE=<name> reverts one guard; each must turn the test red.
 * Run: node tests/regression_relay_tools_20261028.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 400) + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const MUT = process.env.MUTATE || '';
const MUTATIONS = {
  fence: ['  const fp = almRequestProblem(tool, method, chk.target.toString(), savedHost, ph);\n  if (fp) return', '  const fp = "";\n  if (fp) return'],
  host:  ['  const chk = bridgeTargetProblem(url.searchParams.get("target"), savedHost, env, true);\n  if (chk.error) return', '  const chk = { target: new URL(url.searchParams.get("target")) };\n  if (chk.error) return'],
  json:  ['    if (!raw) { try { JSON.parse(body || "null"); } catch (_) { return jsonResponse(400, { error: { type: "bad_write", message: "Not sent: the body is not JSON." } }); } }', ''],
  jar:   ['  const headers = Object.assign({}, init.headers || {}); if (ck) headers["cookie"] = ck;', '  const headers = Object.assign({}, init.headers || {});'],
  redir: ['    if (upstream.status >= 300 && upstream.status < 400) return jsonResponse(502,', '    if (false) return jsonResponse(502,'],
  route: ['      if (url.pathname === "/v1/ai/bridge" && url.searchParams.get("tool") && ["GET", "POST", "PATCH", "PUT"].includes(request.method)) return handleToolBridge(request, env, caller, url, url.searchParams.get("tool"));', '']
};
let proxy = fs.readFileSync(path.join(REPO, 'customer-install', 'selfhost', 'ai-proxy', 'worker.js'), 'utf8');
if (MUT) { const m = MUTATIONS[MUT]; if (!m) { console.error('unknown mutation'); process.exit(3); } if (proxy.indexOf(m[0]) < 0) { console.error('mutation anchor not found: ' + MUT); process.exit(4); } proxy = proxy.split(m[0]).join(m[1]); }
const engine = fs.readFileSync(path.join(REPO, 'site', 'alm_engine.js'), 'utf8');

console.log('\n[A] one fence');
const between = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const engFence = between(engine, '    var ALM_RULES = {', '    // ------------------------------------------------------------------ small helpers').split('\n').map(l => l.replace(/^    /, '')).join('\n').trim();
const pxFence = between(proxy, 'var ALM_RULES = {', 'const TOOL_LABEL').trim();
check('the relay’s fence is the engine’s, word for word', engFence.length > 500 && engFence === pxFence, engFence.length + ' vs ' + pxFence.length);

console.log('\n[B] the relay');
const grab = re => (proxy.match(re) || [''])[0];
const code = [grab(/const BRIDGE_WRITE_MAX = [^\n]*\n/), grab(/function bridgeInternalAllowList[\s\S]*?\n}\n/), grab(/function bridgeTargetProblem[\s\S]*?\n}\n/), pxFence, between(proxy, 'const TOOL_LABEL', 'async function handleBridge(request, env, caller, url) {')].join('\n');
const calls = [];
let upstreamAnswer = () => ({ status: 200, body: '{"ok":1}', headers: {} });
class Resp { constructor(text, init) { this._t = text; this.status = init.status; const hh = init.headers || {}; this.headers = { get: k => { const v = hh[k.toLowerCase()]; return v == null ? null : (Array.isArray(v) ? v.join(', ') : v); }, getSetCookie: () => [].concat(hh['set-cookie'] || []) }; } async text() { return this._t; } }
const env = { LICENSE_MODE: 'offline', BRIDGE_INTERNAL_HOSTS: '' };
const secrets = { 'u1:polarion_token': { secret: 'PAT-SECRET', meta: { baseHost: 'polarion.example.com', auth: 'bearer' } }, 'u1:codebeamer_token': { secret: 'PW-SECRET', meta: { baseHost: 'cb.example.com', user: 'sam', auth: 'basic' } } };
const deps = {
  jsonResponse: (status, body, extra) => new Resp(JSON.stringify(body), { status, headers: Object.assign({ 'content-type': 'application/json' }, extra || {}) }),
  checkRateLimit: async () => ({ ok: true }),
  readUserSecret: async (e, uid, kind) => secrets[uid + ':' + kind] || { missing: true },
  fetch: async (u, init) => { calls.push({ u, init }); const a = upstreamAnswer(u, init); return new Resp(a.body, { status: a.status, headers: Object.assign({ 'content-type': 'application/json' }, a.headers) }); },
  CORS: {}, btoa: s => Buffer.from(s).toString('base64'), Response: Resp, AbortSignal: { timeout: () => undefined }
};
let handle = null;
try { handle = new Function(...Object.keys(deps), code + '\nreturn handleToolBridge;')(...Object.values(deps)); } catch (e) { check('the relay loads', false, e.message); }
const reqOf = (method, body, h) => ({ method, text: async () => body == null ? '' : body, headers: { get: k => (h || {})[k.toLowerCase()] || null } });
const go = (tool, method, target, body, uid, opt) => handle(reqOf(method, body, opt && opt.h ? { 'x-slab-tool-headers': JSON.stringify(opt.h) } : {}), env, { userId: uid === undefined ? 'u1' : uid }, new URL('https://ai.example.com/v1/ai/bridge?tool=' + tool + (opt && opt.raw ? '&raw=1' : '') + '&target=' + encodeURIComponent(target)), tool);
(async function () {
  if (!handle) { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }
  let r = await go('polarion', 'GET', 'https://polarion.example.com/polarion/rest/v1/projects/FCS/documents?page%5Bsize%5D=100');
  check('a Polarion read goes out with the saved token as a Bearer token', r.status === 200 && calls.length === 1 && calls[0].init.headers.authorization === 'Bearer PAT-SECRET' && calls[0].init.method === 'GET' && calls[0].init.redirect === 'manual');
  check('the answer carries no login', !/SECRET/.test(await r.text()));
  r = await go('codebeamer', 'PUT', 'https://cb.example.com/cb/api/v3/items/1003/fields', '{"fieldValues":[]}');
  check('a Codebeamer change goes out as PUT with the username and password as Basic, and its JSON body', r.status === 200 && calls[1].init.method === 'PUT' && calls[1].init.headers.authorization === 'Basic ' + Buffer.from('sam:PW-SECRET').toString('base64') && calls[1].init.body === '{"fieldValues":[]}');
  const n0 = calls.length;
  const refused = [['polarion', 'DELETE', 'https://polarion.example.com/polarion/rest/v1/projects/FCS/workitems/FCS-1', '{}'],
    ['polarion', 'GET', 'https://other.example.com/polarion/rest/v1/projects', null], ['polarion', 'GET', 'https://polarion.example.com/polarion/admin', null],
    ['polarion', 'POST', 'https://polarion.example.com/polarion/rest/v1/projects/FCS/workitems?x=1', '{}'], ['codebeamer', 'POST', 'https://cb.example.com/cb/api/v3/items/query', 'not json'],
    ['codebeamer', 'PUT', 'https://cb.example.com/cb/api/v3/items/5', '{}'], ['codebeamer', 'GET', 'https://10.0.0.5/cb/api/v3/projects', null], ['doors', 'GET', 'https://x.example.com/rm', null]];
  for (const x of refused) { const rr = await go(x[0], x[1], x[2], x[3]); check('refused, nothing sent: ' + x[0] + ' ' + x[1] + ' ' + x[2].replace(/^https:\/\//, '') + (x[3] === 'not json' ? ' (not JSON)' : ''), rr.status >= 400 && calls.length === n0); }
  secrets['u3:codebeamer_token'] = { secret: 'PW3', meta: { baseHost: '10.0.0.5', user: 'x', auth: 'basic' } };
  r = await go('codebeamer', 'GET', 'https://10.0.0.5/cb/api/v3/projects', null, 'u3');
  check('a private address saved with a login is still refused unless this server’s administrator approved it', r.status === 400 && calls.length === n0);
  r = await go('codebeamer', 'GET', 'https://cb.example.com:8443/cb/api/v3/projects');
  check('another port is refused unless approved', r.status === 400 && calls.length === n0);
  env.BRIDGE_INTERNAL_HOSTS = '10.0.0.5';
  r = await go('codebeamer', 'GET', 'https://10.0.0.5/cb/api/v3/projects', null, 'u3');
  check('approved by the administrator of this customer server, it goes', r.status === 200 && calls.length === n0 + 1);
  env.BRIDGE_INTERNAL_HOSTS = '';
  r = await go('codebeamer', 'GET', 'https://cb.example.com/cb/api/v3/projects', null, '');
  check('no signed-in user, no request', r.status === 401 && calls.length === n0 + 1);
  r = await go('polarion', 'GET', 'https://polarion.example.com/polarion/rest/v1/projects', null, 'u2');
  check('no saved login for this user: told to sign in, nothing sent', r.status === 404 && /sign in/.test(await r.text()) && calls.length === n0 + 1);
  upstreamAnswer = () => ({ status: 302, body: '', headers: { location: 'https://sso.example.com' } });
  r = await go('polarion', 'GET', 'https://polarion.example.com/polarion/rest/v1/projects');
  check('a redirect is not followed', r.status === 502);
  upstreamAnswer = () => ({ status: 429, body: '{"message":"Too many requests"}', headers: { 'retry-after': '7' } });
  r = await go('codebeamer', 'POST', 'https://cb.example.com/cb/api/v3/items/query', '{"page":1}');
  check('Codebeamer’s "slow down" comes back with its Retry-After', r.status === 429 && r.headers.get('retry-after') === '7');
  upstreamAnswer = () => ({ status: 401, body: '{}', headers: {} });
  r = await go('codebeamer', 'GET', 'https://cb.example.com/cb/api/v3/projects');
  check('a refused login says so in plain words', r.status === 401 && /Codebeamer did not accept the saved login/.test(await r.text()));

  console.log('\n[B2] DOORS Next and Cameo through the relay');
  secrets['u1:doors_token'] = { secret: 'DN-SECRET', meta: { baseHost: 'dng.example.com', user: 'sam', auth: 'password' } };
  secrets['u1:cameo_token'] = { secret: 'TW-SECRET', meta: { baseHost: 'twc.example.com', user: 'sam', auth: 'basic' } };
  let logins = 0;
  upstreamAnswer = (u, init) => {
    const p = new URL(u).pathname, ck = (init.headers && init.headers.cookie) || '';
    if (p === '/rm/j_security_check') { logins++; return /j_password=DN-SECRET/.test(init.body) ? { status: 302, body: '', headers: { location: 'https://dng.example.com/rm/', 'set-cookie': ['JSESSIONID=S9; Path=/rm'] } } : { status: 200, body: '', headers: { 'x-com-ibm-team-repository-web-auth-msg': 'authfailed' } }; }
    if (!/JSESSIONID=S9/.test(ck)) return { status: 200, body: '<html/>', headers: { 'x-com-ibm-team-repository-web-auth-msg': 'authrequired', 'content-type': 'text/html' } };
    if (init.method === 'PUT') return init.headers['if-match'] === '"e1"' ? { status: 200, body: '', headers: { etag: '"e2"' } } : { status: 412, body: 'stale', headers: {} };
    return { status: 200, body: '<rdf:RDF/>', headers: { etag: '"e1"', 'content-type': 'application/rdf+xml' } };
  };
  const n1 = calls.length;
  r = await go('doors', 'GET', 'https://dng.example.com/rm/rootservices', null, 'u1', { raw: true, h: { 'OSLC-Core-Version': '2.0', 'Accept': 'application/rdf+xml' } });
  let env1 = JSON.parse(await r.text());
  check('DOORS Next: challenged, the relay signs in with the form and sends the request once more; the page gets the whole answer', r.status === 200 && env1.raw && env1.status === 200 && env1.text === '<rdf:RDF/>' && env1.etag === '"e1"' && logins === 1 && calls.length - n1 === 3, JSON.stringify(env1));
  check('the protocol headers went to DOORS Next; no login header did', calls[calls.length - 1].init.headers['oslc-core-version'] === '2.0' && !calls.slice(n1).some(c => c.init.headers.authorization));
  r = await go('doors', 'PUT', 'https://dng.example.com/rm/resources/TX_1', '<rdf:RDF/>', 'u1', { raw: true, h: { 'If-Match': '"old"', 'Content-Type': 'application/rdf+xml', 'OSLC-Core-Version': '2.0' } });
  env1 = JSON.parse(await r.text());
  check('the session is kept (no second sign-in), and a 412 reaches the page', logins === 1 && env1.status === 412);
  const n2 = calls.length;
  r = await go('doors', 'GET', 'https://dng.example.com/rm/views', null, 'u1', { raw: true, h: { Cookie: 'JSESSIONID=x' } });
  check('a cookie from the page is refused, nothing sent', r.status === 400 && calls.length === n2);
  r = await go('doors', 'PUT', 'https://dng.example.com/rm/resources/MD_F', '<x/>', 'u1', { raw: true, h: {} });
  check('a module itself is never changed', r.status === 400 && calls.length === n2);
  upstreamAnswer = () => ({ status: 200, body: '{"x":1}', headers: { 'content-type': 'application/ld+json' } });
  r = await go('cameo', 'POST', 'https://twc.example.com/osmc/resources/r1/branches/b1/elements', '["e1"]', 'u1', { h: { Accept: 'application/ld+json', 'Content-Type': 'application/json' } });
  check('Cameo: a batch read goes with Basic and the page’s Accept', r.status === 200 && calls[calls.length - 1].init.headers.authorization === 'Basic ' + Buffer.from('sam:TW-SECRET').toString('base64') && calls[calls.length - 1].init.headers.accept === 'application/ld+json');
  check('CORS lets the page send its tool headers', /"access-control-allow-headers": "[^"]*x-slab-tool-headers/.test(proxy));

  console.log('\n[C] the route');
  check('GET, POST, PATCH and PUT with ?tool= reach the tool relay', /if \(url\.pathname === "\/v1\/ai\/bridge" && url\.searchParams\.get\("tool"\) && \["GET", "POST", "PATCH", "PUT"\]\.includes\(request\.method\)\) return handleToolBridge/.test(proxy));
  const iTool = proxy.indexOf('return handleToolBridge(request, env, caller, url, url.searchParams.get("tool"))'), iJama = proxy.indexOf('if (request.method === "GET" && url.pathname === "/v1/ai/bridge") return handleBridge');
  check('it is checked before Jama’s route, which is unchanged', iTool > 0 && iJama > iTool);
  check('Jama’s relay keeps its /rest/ rule (the tool relay alone asks for any path, then applies its own fence)', /if \(!anyPath && !target\.pathname\.includes\("\/rest\/"\)\)/.test(proxy) && /bridgeTargetProblem\(url\.searchParams\.get\("target"\), sec\.meta && sec\.meta\.baseHost, env\)/.test(proxy));

  console.log('\n[D] the vault keeps the new logins');
  const mig = path.join(REPO, 'supabase', 'migrations', '20261028a_connection_secret_kinds.sql'), kit = path.join(REPO, 'customer-install', 'db', '27_connection_secret_kinds.sql');
  if (!fs.existsSync(mig)) console.log('  SKIP  this copy of the repo has no supabase/ folder');
  else {
    const m = fs.readFileSync(mig, 'utf8'), ss = fs.readFileSync(path.join(REPO, 'site', 'secret_store.js'), 'utf8');
    const kinds = ['polarion_token', 'codebeamer_token'];
    check('the migration lets the table and save_secret() take each tool\u2019s login', kinds.every(k => (m.match(new RegExp("'" + k + "'", 'g')) || []).length >= 2) && /perform private\.require_mfa\(\);/.test(m));
    check('the customer kit carries the same file, and apply.sh runs it', fs.existsSync(kit) && fs.readFileSync(kit, 'utf8') === m && / 27_connection_secret_kinds; do/.test(fs.readFileSync(path.join(REPO, 'customer-install', 'db', 'apply.sh'), 'utf8')));
    check('the page can save them (secret_store.js) and the relay reads "<tool>_token"', kinds.every(k => new RegExp(k + ': 1').test(ss)) && /readUserSecret\(env, caller\.userId, tool \+ "_token"\)/.test(proxy));
  }

  if (!MUT) {
    console.log('\n[mutation] each guard, reverted, turns the test red');
    for (const k of Object.keys(MUTATIONS)) {
      const x = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { MUTATE: k }), encoding: 'utf8', timeout: 60000 });
      const fails = (x.stdout.match(/^  FAIL  .*$/mg) || []);
      check('mutation "' + k + '" turns the test red (' + fails.length + ' failing)', x.status === 1 && fails.length > 0, x.status + ' ' + (x.stderr || '').slice(0, 200));
    }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); process.exit(1); });

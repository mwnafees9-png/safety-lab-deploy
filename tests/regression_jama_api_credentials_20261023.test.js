#!/usr/bin/env node
/*
 * Regression: the Jama connector signs in with Jama API credentials on every door (23 Oct 2026).
 *
 * A company on single sign-on has no Jama passwords, so the connector also takes a Client ID and
 * Client Secret (Jama: your name, Set API Credentials) and trades them at <base>/rest/oauth/token
 * for a short-lived Bearer token. The desktop's main process is tested in the desktop repo; here:
 *   - the connection dialog (live_bridge.js) offers the choice and saves it with the login;
 *   - the server-side vault door (selfhost/ai-proxy/worker.js handleBridge) signs in the same way,
 *     run against a stubbed Jama;
 *   - the browser-only relay (worker.js /api/bridge) allows exactly one POST: the token exchange.
 * Each rule is checked on the real code, then on a mutated copy that must fail.
 *
 * Run: node tests/regression_jama_api_credentials_20261023.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const grab = (src, re, what) => { const m = re.exec(src); if (!m) throw new Error('could not find ' + what); return m[0]; };
const SRC = { lb: read('site/live_bridge.js'), proxy: read('customer-install/selfhost/ai-proxy/worker.js'), site: read('worker.js'), idx: read('site/index.html') };

// the vault door's sign-in, run against a Jama on single sign-on
async function proxyRun(src) {
  const fns = grab(src, /const _bridgeTokens = new Map\(\);[\s\S]*?\nasync function handleBridge/, 'bridge sign-in').replace(/\nasync function handleBridge$/, '');
  const J = { tokens: new Set(), issued: 0, posts: 0 };
  const fetch = async (url, o) => {
    const u = new URL(url), auth = (o.headers && o.headers.authorization) || '';
    const r = (status, body) => ({ status, ok: status < 300, json: async () => body });
    if (u.pathname.endsWith('/rest/oauth/token')) {
      J.posts++;
      if (o.method !== 'POST' || o.body !== 'grant_type=client_credentials' || auth !== 'Basic ' + Buffer.from('cid:sec').toString('base64')) return r(401, {});
      const t = 't' + (++J.issued); J.tokens.add(t); return r(200, { access_token: t, expires_in: 3600 });
    }
    return r(404, {});
  };
  const ctx = { fetch, URL, Date, Map, Number, Math, JSON }; vm.createContext(ctx);
  vm.runInContext(fns + '\nthis.tok = bridgeOauthToken; this.url = bridgeTokenUrl;', ctx);
  const target = new URL('https://radia.jamacloud.com/rest/latest/items');
  const basic = 'Basic ' + Buffer.from('cid:sec').toString('base64');
  const a = await ctx.tok(target, basic, false), b = await ctx.tok(target, basic, false), c = await ctx.tok(target, basic, true);
  const bad = await ctx.tok(target, 'Basic ' + Buffer.from('cid:nope').toString('base64'), false);
  return { a, b, c, bad, J, url: ctx.url(new URL('https://alm.radia.com/jama/rest/latest/items')) };
}

const RULES = {
  'dialog: offers "Jama username and password" and "Jama API credentials (single sign-on)"'(s) { return /<option value="basic"[^>]*>Jama username and password<\/option>/.test(s.lb) && /<option value="oauth"[^>]*>Jama API credentials \(single sign-on\)<\/option>/.test(s.lb); },
  'dialog: API credentials ask for a Client ID and Client Secret and say where Jama keeps them'(s) { return /'Client ID'/.test(s.lb) && /'Client Secret'/.test(s.lb) && /Set API Credentials/.test(s.lb); },
  'dialog: the sign-in method is saved with the login, on the desktop and on the web'(s) { return /slabSecrets\.save\('jama', \{ user: user, token: token \}, \{ baseHost: _baseHost\(baseUrl\), user: user, auth: auth \}\)/.test(s.lb) && /st\.save\('jama_token', token, \{ baseHost: _baseHost\(baseUrl\), user: user, auth: auth \}\)/.test(s.lb); },
  'dialog: a new method or Client ID needs its own secret (a blank box keeps only the same login)'(s) { return /if \(!token && login\.has && \(login\.auth !== auth \|\| \(user && user !== login\.user\)\)\)/.test(s.lb); },
  'dialog: the saved login shows when it opens, without wiping what was typed'(s) { return /if \(u && !u\.value && login\.user\) u\.value = login\.user;/.test(s.lb) && /_refreshDeskMeta\(\)\.then\(_showSavedLogin\)/.test(s.lb); },
  'a refused password says to use API credentials'(s) { return (s.lb.match(/If your company signs in to Jama through single sign-on, choose "Jama API credentials"/g) || []).length >= 1 && /If your company signs in to Jama through single sign-on/.test(s.proxy); },
  async 'server vault door: signs in with the API credentials, reuses the token, refreshes on demand'(s) {
    const r = await proxyRun(s.proxy);
    return r.a.access === 't1' && r.b.access === 't1' && r.c.access === 't2' && r.J.issued === 2;
  },
  async 'server vault door: wrong credentials say so plainly'(s) { const r = await proxyRun(s.proxy); return r.bad.status === 401 && /did not accept the API credentials/.test(r.bad.error); },
  async 'server vault door: a Jama under a path keeps its path for the token URL'(s) { return (await proxyRun(s.proxy)).url === 'https://alm.radia.com/jama/rest/oauth/token'; },
  'server vault door: a request is retried once with a fresh sign-in after a 401'(s) { return /if \(upstream\.status === 401\) \{\s*t = await bridgeOauthToken\(chk\.target, basic, true\);/.test(s.proxy); },
  'browser relay: the only POST is the token exchange, with exactly grant_type=client_credentials'(s) { return /!\/\\\/rest\\\/oauth\\\/token\$\/\.test\(t0\.pathname\) \|\| body\.trim\(\) !== 'grant_type=client_credentials'/.test(s.site) && /else if \(request\.method !== 'GET'\)/.test(s.site); },
  'live_bridge.js has a newer cache key'(s) { const m = /"live_bridge\.js\?v=3\.(\d+)"/.exec(s.idx); return !!m && Number(m[1]) >= 1; },
};
const MUT = {
  'dialog: offers "Jama username and password" and "Jama API credentials (single sign-on)"': s => { s.lb = s.lb.replace('>Jama API credentials (single sign-on)</option>', '></option>'); },
  'dialog: API credentials ask for a Client ID and Client Secret and say where Jama keeps them': s => { s.lb = s.lb.replace(/Set API Credentials/g, 'settings'); },
  'dialog: the sign-in method is saved with the login, on the desktop and on the web': s => { s.lb = s.lb.replace("{ baseHost: _baseHost(baseUrl), user: user, auth: auth })", "{ baseHost: _baseHost(baseUrl), user: user })"); },
  'dialog: a new method or Client ID needs its own secret (a blank box keeps only the same login)': s => { s.lb = s.lb.replace('login.auth !== auth || ', ''); },
  'dialog: the saved login shows when it opens, without wiping what was typed': s => { s.lb = s.lb.replace('_refreshDeskMeta().then(_showSavedLogin)', '_refreshDeskMeta().then(() => _renderSetup())'); },
  'a refused password says to use API credentials': s => { s.proxy = s.proxy.replace(/If your company signs in to Jama through single sign-on/g, 'Bad login'); },
  'server vault door: signs in with the API credentials, reuses the token, refreshes on demand': s => { s.proxy = s.proxy.replace('if (!fresh && hit && hit.exp > now) return { access: hit.access };', ''); },
  'server vault door: wrong credentials say so plainly': s => { s.proxy = s.proxy.replace('if (r.status === 400 || r.status === 401 || r.status === 403)', 'if (false)'); },
  'server vault door: a Jama under a path keeps its path for the token URL': s => { s.proxy = s.proxy.replace('return target.origin + (i > 0 ? target.pathname.slice(0, i) : "") + "/rest/oauth/token";', 'return target.origin + "/rest/oauth/token";'); },
  'server vault door: a request is retried once with a fresh sign-in after a 401': s => { s.proxy = s.proxy.replace('t = await bridgeOauthToken(chk.target, basic, true);', ''); },
  'browser relay: the only POST is the token exchange, with exactly grant_type=client_credentials': s => { s.site = s.site.replace("body.trim() !== 'grant_type=client_credentials'", 'false'); },
  'live_bridge.js has a newer cache key': s => { s.idx = s.idx.replace(/live_bridge\.js\?v=[0-9.]+"/, 'live_bridge.js?v=3.0"'); },
};
(async () => {
  console.log('Regression: Jama API credentials, 23 Oct 2026');
  for (const [n, rule] of Object.entries(RULES)) {
    let ok = false, err = ''; try { ok = !!(await rule(Object.assign({}, SRC))); } catch (e) { err = e.message; }
    check(n, ok, err);
    const m = Object.assign({}, SRC); MUT[n](m); let caught = true; try { caught = !(await rule(m)); } catch (_) {}
    check('  mutation is caught: ' + n, caught);
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();

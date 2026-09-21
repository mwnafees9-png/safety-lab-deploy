#!/usr/bin/env node
/*
 * Regression — the page holds no secret (S8, 20 Sep 2026).
 *
 * WHAT WAS WRONG. A user's Anthropic key, Voyage key and Jama token lived in localStorage:
 * persistent, and readable by any script that runs on the page. Worse, the browser then USED
 * them itself: it called api.anthropic.com directly with the key, which put every BYO call
 * outside the ITAR fence (the fence lives on the proxy), and it built the Jama Basic header
 * itself and handed it to a stateless relay.
 *
 * WHAT THIS PINS. secret_store.js is the one place the page puts a secret, and it decides the
 * door from configuration: vault (any backend: save-only, status-only, never read back),
 * session (browser-only: sessionStorage, this tab), desktop (keychain, unchanged). Part one
 * RUNS the store in a sandbox with a fake window on each door and asserts what it stores where.
 * Part two is static: no other file may touch a key in localStorage again.
 *
 * Run: node tests/regression_secret_store.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const src = read('site/secret_store.js');

// ---- a fake browser --------------------------------------------------------------------
function makeStorage() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, _m: m }; }
function boot({ door, session = true, rpcLog }) {
  const ls = makeStorage(), ss = makeStorage();
  const calls = rpcLog || [];
  const rows = {};                                     // the fake vault: kind -> meta
  const sb = door === 'vault' ? {
    auth: { getSession: async () => ({ data: { session: session ? { access_token: 'JWT-abc' } : null } }), onAuthStateChange: () => {} },
    rpc: async (fn, args) => {
      calls.push([fn, args]);
      if (fn === 'save_secret') { rows[args.p_kind] = args.p_meta || {}; return { data: null, error: null }; }
      if (fn === 'delete_secret') { delete rows[args.p_kind]; return { data: null, error: null }; }
      if (fn === 'my_secrets_status') return { data: Object.keys(rows).map(k => ({ kind: k, meta: rows[k], updated_at: 'now' })), error: null };
      return { data: null, error: { message: 'unknown rpc' } };
    }
  } : null;
  const win = {
    SLConfig: { isDesktop: door === 'desktop', browserOnly: door === 'session' },
    getSupabaseClient: () => sb,
    __slabDesktop: door === 'desktop',
  };
  const ctx = { window: win, localStorage: ls, sessionStorage: ss, navigator: { userAgent: door === 'desktop' ? 'Electron' : 'Mozilla' },
                document: { readyState: 'complete', addEventListener: () => {} }, console: { info: () => {}, warn: () => {} }, setTimeout: () => {} };
  ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { win, ls, ss, calls, rows, store: win.SecretStore };
}

console.log('\n[vault door] save goes to the RPC, nothing to any browser storage, and it cannot be read back');
{
  const { ls, ss, calls, store } = boot({ door: 'vault' });
  return_ = null;
  (async () => {
    await store.init();
    check('door resolves to vault when a backend client exists', store.door() === 'vault');
    const r = await store.save('anthropic_key', 'sk-ant-SECRET', { last4: 'CRET' });
    check('save reports ok', r && r.ok);
    check('save went through save_secret with the value', calls.some(c => c[0] === 'save_secret' && c[1].p_kind === 'anthropic_key' && c[1].p_secret === 'sk-ant-SECRET'));
    check('NOTHING was written to localStorage', Object.keys(ls._m).length === 0, JSON.stringify(Object.keys(ls._m)));
    check('NOTHING was written to sessionStorage either', Object.keys(ss._m).length === 0);
    check('has() is true from status', store.has('anthropic_key') === true);
    check('meta() carries the non-secret hint', store.meta('anthropic_key').last4 === 'CRET');
    check('get() returns EMPTY on the vault door — the page cannot read its own secret back', store.get('anthropic_key') === '');
    check('sessionJwt() is the signed-in token, for the proxy', store.sessionJwt() === 'JWT-abc');
    const d = await store.remove('anthropic_key');
    check('remove goes through delete_secret', d.ok && calls.some(c => c[0] === 'delete_secret'));
    check('...and has() is false after', store.has('anthropic_key') === false);
    check('the status RPC was consulted, never a table read', calls.every(c => ['save_secret', 'delete_secret', 'my_secrets_status'].includes(c[0])));
  })().then(part2);
}

function part2() {
  console.log('\n[vault door] a pre-S8 key left in localStorage is moved once, then cleared');
  (async () => {
    const { ls, calls, store } = boot({ door: 'vault' });
    ls.setItem('safetyLab.ai.anthropicKey', 'sk-ant-OLD');
    ls.setItem('safetyLab.ai.voyageKey', 'pa-OLD');
    await store.init();
    check('both legacy keys were saved to the vault, exactly once each', calls.filter(c => c[0] === 'save_secret').length === 2, String(calls.filter(c => c[0] === 'save_secret').length));
    // the race the first draft of this test tripped over: init() called twice while the first
    // is still awaiting must not run the migration twice
    const again = boot({ door: 'vault' });
    again.ls.setItem('safetyLab.ai.anthropicKey', 'sk-ant-OLD');
    const p1 = again.store.init(), p2 = again.store.init();
    await Promise.all([p1, p2]);
    check('init() is idempotent even when re-entered mid-flight', again.calls.filter(c => c[0] === 'save_secret').length === 1, String(again.calls.filter(c => c[0] === 'save_secret').length));
    check('...and removed from localStorage', ls.getItem('safetyLab.ai.anthropicKey') === null && ls.getItem('safetyLab.ai.voyageKey') === null);
    check('...and are now reported as saved', store.has('anthropic_key') && store.has('voyage_key'));
  })().then(part3);
}

function part3() {
  console.log('\n[session door] browser-only: sessionStorage for this tab, never localStorage, and no RPC');
  (async () => {
    const { ls, ss, calls, store } = boot({ door: 'session' });
    await store.init();
    check('door resolves to session on browser-only', store.door() === 'session');
    await store.save('jama_token', 'tok-123', { user: 'alice', baseHost: 'x.jamacloud.com' });
    check('the value is in sessionStorage', ss.getItem('safetyLab.secret.jama_token') === 'tok-123');
    check('NOTHING in localStorage', Object.keys(ls._m).length === 0);
    check('no RPC was made (there is no backend)', calls.length === 0);
    check('get() DOES return the value here — the page has to call the provider itself', store.get('jama_token') === 'tok-123');
    check('meta() carries the username', store.meta('jama_token').user === 'alice');
    await store.remove('jama_token');
    check('remove clears it', ss.getItem('safetyLab.secret.jama_token') === null && !store.has('jama_token'));
  })().then(part4);
}

function part4() {
  console.log('\n[desktop door] this module stands aside; the keychain path is the shell\'s');
  (async () => {
    const { ls, ss, store } = boot({ door: 'desktop' });
    await store.init();
    check('door resolves to desktop', store.door() === 'desktop');
    const r = await store.save('anthropic_key', 'x');
    check('save is refused on the desktop (AI keys are not a desktop thing)', !r.ok);
    check('nothing in either storage', Object.keys(ls._m).length === 0 && Object.keys(ss._m).length === 0);
  })().then(part5);
}

function part5() {
  console.log('\n[static] no other file touches a secret in localStorage any more');
  const files = fs.readdirSync(path.join(REPO, 'site')).filter(f => f.endsWith('.js'));
  const offenders = [];
  for (const f of files) {
    const s = read('site/' + f);
    if (/localStorage\.(setItem|getItem)\(\s*AI_LS_(ANTHROPIC|VOYAGE)\b/.test(s)) offenders.push(f + ': AI_LS_*');
    if (f === 'live_bridge.js' && /localStorage\.setItem\(CFG_KEY[\s\S]{0,40}token/.test(s)) offenders.push(f + ': token into CFG_KEY');
  }
  check('no site script reads or writes an AI key via localStorage', offenders.length === 0, offenders.join(', '));
  check('secret_store.js itself never writes a value to localStorage',
    !/localStorage\.setItem/.test(src),
    'the store may only READ localStorage, once, to migrate a legacy key out of it');

  const core = read('site/core_modules.js');
  check('core_modules: BYO on the vault door goes to the PROXY with the session JWT',
    /if \(_byoViaProxy\(\)\) \{[\s\S]{0,700}?AI_PROXY_BASE_URL \+ '\/anthropic\/messages'[\s\S]{0,300}?'Bearer ' \+ jwt/.test(core));
  check('core_modules: the direct api.anthropic.com call survives ONLY for the browser-only door',
    /Browser-only door: no backend, no proxy[\s\S]{0,400}?api\.anthropic\.com/.test(core));
  check('core_modules: isConfigured asks the store, not localStorage', /function isConfigured\(\)\s*\{ return isProxyMode\(\) \|\| _hasByo\('anthropic_key'\); \}/.test(core));

  const lb = read('site/live_bridge.js');
  check('live_bridge: the vault door calls the proxy /bridge with the JWT, no Basic header built here',
    /st\.door\(\) === 'vault'[\s\S]{0,900}?'\/bridge\?target='[\s\S]{0,200}?'Bearer ' \+ jwt/.test(lb) &&
    !/door\(\) === 'vault'[\s\S]{0,900}?btoa\(/.test(lb.slice(lb.indexOf("st.door() === 'vault'"), lb.indexOf("Browser-only: no backend and no proxy"))));
  check('live_bridge: bridgeConfigSave strips user and token on EVERY door',
    /function bridgeConfigSave\(c\) \{[\s\S]{0,400}?delete o\.user; delete o\.token;/.test(lb));
  check('live_bridge: the token box is never pre-filled with a value', /id="lb-token" type="password" placeholder="' \+ [\s\S]{0,200}?'" value=""/.test(lb));

  const helpers = read('site/helpers_modules.js');
  check('helpers: settings no longer echo the key into the DOM', !/set\('ai-anthropic-key', localStorage\.getItem/.test(helpers));

  const idx = read('site/index.html');
  const iStore = idx.indexOf('secret_store.js?v='), iCore = idx.indexOf('core_modules.js?v='), iBind = idx.indexOf('bindings_modules.js?v='), iLb = idx.indexOf('live_bridge.js?v=');
  check('index: secret_store loads before every reader', iStore > 0 && iStore < iCore && iStore < iBind && iStore < iLb);

  console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
  process.exit(fail ? 1 : 0);
}
var return_;

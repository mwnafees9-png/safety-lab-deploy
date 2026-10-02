#!/usr/bin/env node
/*
 * Regression — the desktop's OWN-KEY AI door (2 Oct 2026).
 *
 * On the desktop, a user may now paste their own Anthropic key and have this computer talk to
 * Anthropic directly: no proxy, no server, nothing of ours in the path. The page never holds the
 * key (it lives in the OS keychain and the shell's main process puts it on the request); the page
 * only asks window.slabAi to make the call and reads the Response back exactly as it reads a
 * proxy's. These checks execute the pieces of AiClient and SecretStore that decide this, under
 * the three worlds that matter.
 *
 *   [1] desktop key door ON  -> unconfiguredRefusal is null even with no AI endpoint,
 *                               isProxyMode is false even with a licence, _send goes to slabAi
 *                               with the ITAR flag, and a missing key is a plain refusal
 *   [2] desktop key door OFF -> everything exactly as before (proxy, then BYO vault, then session)
 *   [3] SecretStore desktop door -> has() mirrors the keychain's status list; save() goes through
 *                               window.slabSecrets; get() still answers '' (never the value)
 *
 * Run: node tests/regression_desktop_ai_key.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');
const core = read('core_modules.js'), store = read('secret_store.js'), bindings = read('bindings_modules.js');

// ---- [1][2] the decision pieces of AiClient, executed ------------------------------------------
const pick = (name, re) => { const m = core.match(re); check(name + ' located', !!m); return m ? m[0] : ''; };
const fDoor = pick('_desktopKeyDoor', /function _desktopKeyDoor\(\)[^\n]*\n/);
const fProxy = pick('isProxyMode', /function isProxyMode\(\)[^\n]*\n/);
const fConf = pick('isConfigured', /function isConfigured\(\)[^\n]*\n/);
const fUnset = pick('unconfiguredRefusal', /function unconfiguredRefusal\(\)\{[\s\S]*?\n    \}/);
const fSend = pick('_send', /async function _send\(b\) \{[\s\S]*?\n        \}\n/);
function world(w) {
  const calls = [];
  const sb = {
    window: Object.assign({ SecretStore: { door: () => w.door || 'session', has: (k) => !!(w.has || {})[k], get: (k) => (w.get || {})[k] || '', sessionJwt: () => w.jwt || '' } }, w.win || {}),
    AI_PROXY_BASE_URL: w.base || '',
    isProPlusLicensed: () => !!w.licensed, getLicenseToken: () => w.token || '',
    fetch: (url, init) => { calls.push({ url, init }); return Promise.resolve({ ok: true }); },
    calls, String, Error, JSON, Promise, Object, console
  };
  sb.window.slabAi = w.slabAi;
  sb.window.__SLAB_AI_DESKTOP_KEY__ = !!w.flag;
  vm.createContext(sb);
  vm.runInContext(fDoor + fProxy + fConf + fUnset, sb);
  vm.runInContext('function _store(){ return window.SecretStore; } function _hasByo(k){ return !!(_store() && _store().has(k)); } function _byoViaProxy(){ return _store().door()==="vault"; } function getAnthropicKey(){ return _store().get("anthropic_key"); }', sb);
  return sb;
}
async function send(sb, opts, body) {
  vm.runInContext('var opts = ' + JSON.stringify(opts) + '; var itar = ' + (!!opts.itar) + '; var proxy = isProxyMode();' + fSend + ' this.__r = _send(' + JSON.stringify(body) + ');', sb);
  return sb.__r;
}
(async () => {
  console.log('\n[1] desktop key door ON');
  {
    const sent = [];
    const sb = world({ flag: true, door: 'desktop', has: { anthropic_key: true }, licensed: true, token: 'signed-blob', base: '',
                       slabAi: { messages: (b, m) => { sent.push({ b, m }); return Promise.resolve({ ok: true, via: 'slabAi' }); } } });
    check('no AI endpoint is not a refusal when the key door is on', vm.runInContext('unconfiguredRefusal()', sb) === null);
    check('isProxyMode is false even with a valid licence (the licence must not route AI to a proxy that is not there)', vm.runInContext('isProxyMode()', sb) === false);
    check('isConfigured is true with a key in the keychain', vm.runInContext('isConfigured()', sb) === true);
    const r = await send(sb, { feature: 'fha', itar: false }, { model: 'm', messages: [] });
    check('_send goes to window.slabAi, not fetch', r && r.via === 'slabAi' && sb.calls.length === 0);
    check('the ITAR flag travels with the request', sent[0] && sent[0].m.itar === false && sent[0].m.feature === 'fha');
    const sb2 = world({ flag: true, door: 'desktop', has: {}, slabAi: { messages: () => Promise.resolve({}) } });
    check('isConfigured is false with no key', vm.runInContext('isConfigured()', sb2) === false);
    let err = ''; try { await send(sb2, {}, { model: 'm', messages: [] }); } catch (e) { err = String(e.message); }
    check('no key -> a plain refusal naming where to paste it', /Paste your Anthropic key under Advanced/.test(err), err);
  }
  console.log('\n[2] desktop key door OFF: unchanged behaviour');
  {
    const sb = world({ flag: false, door: 'vault', has: { anthropic_key: true }, licensed: true, token: 'signed-blob', base: 'https://ai.example.com/v1/ai', jwt: 'jwt' });
    check('licensed + endpoint -> proxy mode', vm.runInContext('isProxyMode()', sb) === true);
    await send(sb, { feature: 'x' }, { model: 'm', messages: [] });
    check('_send fetches the proxy with the licence bearer', sb.calls.length === 1 && /\/anthropic\/messages$/.test(sb.calls[0].url) && sb.calls[0].init.headers.authorization === 'Bearer signed-blob');
    const sb3 = world({ flag: false, door: 'desktop', has: {}, base: '' });
    check('flag off + no endpoint -> still the "AI is not set up" refusal', /not set up/.test(String(vm.runInContext('unconfiguredRefusal()', sb3))));
    const sb4 = world({ flag: true, door: 'desktop', has: { anthropic_key: true }, base: '' });   // flag set but no slabAi surface
    check('the flag alone, without the shell surface, does not open the door', vm.runInContext('_desktopKeyDoor()', sb4) === false);
  }
  console.log('\n[3] SecretStore desktop door');
  {
    const sb = { window: { __slabDesktop: true, slabSecrets: { status: () => Promise.resolve({ ok: true, secrets: [{ kind: 'anthropic_key', meta: { last4: 'ab12' }, updatedAt: 't' }] }), save: () => Promise.resolve({ ok: true }), remove: () => Promise.resolve({ ok: true }) } },
                 navigator: { userAgent: 'Electron' }, document: { readyState: 'complete', addEventListener() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {}, key: () => null, length: 0 },
                 setTimeout, console, Promise, Object, String, Array, JSON, Date };
    vm.createContext(sb); vm.runInContext(store, sb);
    await vm.runInContext('window.SecretStore.refresh ? window.SecretStore.refresh() : null', sb); await new Promise(r => setTimeout(r, 20));
    check('door is desktop', vm.runInContext('window.SecretStore.door()', sb) === 'desktop');
    check('has(anthropic_key) mirrors the keychain status', vm.runInContext('window.SecretStore.has("anthropic_key")', sb) === true);
    check('get() never returns the value on the desktop', vm.runInContext('window.SecretStore.get("anthropic_key")', sb) === '');
    const r = await vm.runInContext('window.SecretStore.save("anthropic_key", "sk-ant-x", { last4: "x" })', sb);
    check('save() goes through the shell and reports the desktop door', r && r.ok && r.door === 'desktop');
  }
  console.log('\n[structure]');
  check('the key never appears in a page header on the desktop door (direct fetch stays browser-only)', /Browser-only door: no backend, no proxy/.test(core) && !/slabAi[\s\S]{0,200}x-api-key/.test(core));
  check('AI Settings paints the keychain wording when the key door is on', /stored in this computer\\'s keychain/.test(bindings));
  console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

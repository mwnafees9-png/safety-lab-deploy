#!/usr/bin/env node
/*
 * Regression: four customer-facing bugs found on a customer's own server (22 Oct 2026).
 *
 *  1. "Your trial has ended" with a valid signed license. The page decided 100 ms after load,
 *     before the signed license had been checked (WebCrypto is asynchronous), fell back to the
 *     hosted trial rules and never took the paywall down. Now a customer install waits for the
 *     verdict, every verdict decides again (slab-license-changed), and the paywall comes down
 *     when the answer is no longer "paywalled". The customer layout (afha_template.js) also
 *     redraws on the same event.
 *  2. The Server AI key panel said "The server answered 502." Now it says the server's own
 *     reason. It does not guess whether the running AI service is too old: it asks the service,
 *     whose /health lists what it can do ("server-ai-key" when it has the admin handler).
 *  3. "fetch failed" / "Failed to fetch". The server's AI service now answers 502
 *     upstream_unreachable naming the host, the network reason and the fix; the app turns a
 *     request that never got an answer into plain words. Embedding errors no longer read
 *     "[object Object]". worker.js is byte-identical in both places it ships.
 *  4. The "Getting started" card floated over the bottom-left of tables (row tick boxes and
 *     menus). It now has a home in the layout and never floats over the page: the bottom of the
 *     full-width sidebar, otherwise a strip at the top of the page. It folds to a small bar once
 *     the user has made a start.
 *
 * Each rule is checked on the real code, then on a mutated copy that must fail.
 * Run: node tests/regression_customer_bugs_20261022.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const grab = (src, re, what) => { const m = re.exec(src); if (!m) throw new Error('could not find ' + what); return m[0]; };

const SRC = {
  sl: read('site/safety_lab.js'), lic: read('site/slab_license.js'), afha: read('site/afha_template.js'),
  sak: read('site/server_ai_key.js'), core: read('site/core_modules.js'), css: read('site/safety_lab.css'),
  idx: read('site/index.html'), worker: read('customer-install/selfhost/ai-proxy/worker.js'),
};
let PROXY = null;
for (const p of [path.join(REPO, '..', 'safety-lab-proxy-deploy', 'worker.js')]) { try { PROXY = fs.readFileSync(p, 'utf8'); } catch (_) {} }

// ------------------------------------------------------------------ 1. paywall waits for the license
function paywallBlock(src) {
  return grab(src, /function _check\(\) \{[\s\S]*?\n    try \{ window\.addEventListener\('slab-license-changed'[^\n]*\n/, 'the paywall check');
}
async function paywallScenario(src) {
  const listeners = {}, gate = { removed: false, remove() { this.removed = true; } };
  let paywalled = true, rendered = 0, gateUp = false, resolve;
  const ready = new Promise(r => { resolve = r; });
  const window = { SLConfig: { mode: 'self-hosted' }, __slabSignedLicenseReady: ready,
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); } };
  const ctx = {
    window, document: { getElementById: id => (id === 'sl-paywall-screen' && gateUp ? gate : null) },
    isPaywalled: () => paywalled, GATE_ID: 'sl-paywall-screen',
    _renderPaywallScreen: () => { rendered++; gateUp = true; }, _renderTrialOrGrandfatherBanner: () => {},
  };
  gate.remove = function () { this.removed = true; gateUp = false; };
  vm.createContext(ctx);
  vm.runInContext(paywallBlock(src) + '\n_boot();', ctx);
  const before = rendered;                         // nothing decided before the verdict
  paywalled = false; resolve({ valid: true });     // the verdict: valid license
  await ready; await new Promise(r => setImmediate(r));
  const afterVerdict = { rendered, gateUp };
  // later: something decided "paywalled" (e.g. stale state), then a new verdict says valid
  paywalled = true; ctx._renderPaywallScreen();
  paywalled = false; (listeners['slab-license-changed'] || []).forEach(f => f());
  return { before, afterVerdict, gateDownOnEvent: !gateUp && gate.removed };
}

// ------------------------------------------------------------------ 2. server AI key says why
// explain() with a stubbed /health: 'yes' (lists server-ai-key), 'no' (an older service), 'down'
function explainWith(src, health) {
  const older = grab(src, /var OLDER = '[^\n]*;\n/, 'OLDER');
  const fns = ['hostName', 'noAnswer', 'features', 'explain'].map(n => grab(src, new RegExp('function ' + n + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n'), n)).join('');
  const fetch = () => health === 'down' ? Promise.reject(new TypeError('Failed to fetch'))
    : Promise.resolve({ ok: true, json: () => Promise.resolve(health === 'yes' ? { ok: true, features: ['server-ai-key'] } : { ok: true, service: 'safety-lab-proxy' }) });
  const ctx = { URL, Promise, fetch, base: () => 'https://10.99.0.5/v1/ai' }; vm.createContext(ctx);
  vm.runInContext(older + fns + 'this.explain = explain; this.OLDER = OLDER;', ctx);
  return ctx;
}

// ------------------------------------------------------------------ 3. fetch failed in plain words
function plainNetFn(src) {
  const fn = grab(src, /function _plainNetError\(e, viaProxy\) \{[\s\S]*?\n    \}\n/, '_plainNetError');
  const ctx = { URL, AI_PROXY_BASE_URL: 'https://10.99.0.5/v1/ai' }; vm.createContext(ctx);
  vm.runInContext(fn + 'this.f = _plainNetError;', ctx); return ctx.f;
}
function workerFn(src) {
  const jr = grab(src, /function jsonResponse\(status, body, extra = \{\}\) \{[\s\S]*?\n\}\n/, 'jsonResponse');
  const fn = grab(src, /function upstreamUnreachable\(url, e\) \{[\s\S]*?\n\}\n/, 'upstreamUnreachable');
  const ctx = { URL, Response, Headers, JSON }; vm.createContext(ctx);
  vm.runInContext('const CORS_HEADERS = {}, CORS = {};\n' + jr + fn + 'this.f = upstreamUnreachable;', ctx); return ctx.f;
}

// ------------------------------------------------------------------ 4. the Getting started card
function reserveFn(src) {
  const fn = grab(src, /function _reserveSpace\(el\) \{[\s\S]*?\n    \}\n/, '_reserveSpace');
  const props = {}, cls = new Set();
  const ctx = { document: { body: { classList: { add: c => cls.add(c), remove: c => cls.delete(c) } },
    documentElement: { style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: k => { delete props[k]; } } } } };
  vm.createContext(ctx); vm.runInContext(fn + 'this.f = _reserveSpace;', ctx);
  return { f: ctx.f, props, cls };
}

const RULES = {
  async 'paywall: a customer install decides only once the signed license is checked, and takes the paywall down on a valid verdict'(s) {
    const r = await paywallScenario(s.sl);
    return r.before === 0 && r.afterVerdict.rendered === 0 && r.afterVerdict.gateUp === false;
  },
  async 'paywall: a later license verdict (slab-license-changed) takes a paywall that is up back down'(s) {
    return (await paywallScenario(s.sl)).gateDownOnEvent;
  },
  'license: every verdict tells the page (slab-license-changed)'(s) {
    return /W\.dispatchEvent\(new Event\('slab-license-changed'\)\)/.test(s.lic) && s.lic.indexOf("dispatchEvent(new Event('slab-license-changed'))") < s.lic.indexOf('return result;\n  }');
  },
  'customer layout redraws on a new license verdict'(s) { return /addEventListener\('slab-license-changed',[^\n]*refresh/.test(s.afha); },
  async 'server AI key: the admin handler\'s own message is shown as it is'(s) {
    const c = explainWith(s.sak, 'yes'); return (await c.explain({ status: 400, data: { error: 'verify', message: 'Anthropic says this key is not valid.' } }, 'x')) === 'Anthropic says this key is not valid.';
  },
  async 'server AI key: "older" only when the service itself does not list the feature'(s) {
    const r = { status: 401, data: { error: { type: 'unauthorized', message: 'Missing Bearer token.' } } };
    const old = await explainWith(s.sak, 'no').explain(r, 'x'), cur = await explainWith(s.sak, 'yes').explain(r, 'x');
    const c = explainWith(s.sak, 'no');
    return old.indexOf(c.OLDER) === 0 && /Missing Bearer token/.test(old) && cur === 'Missing Bearer token.';
  },
  async 'server AI key: a current service\'s reason (e.g. Anthropic unreachable) is shown, never "answered 502"'(s) {
    const m = await explainWith(s.sak, 'yes').explain({ status: 502, data: { error: { type: 'upstream_unreachable', message: 'The AI service cannot reach api.anthropic.com: x.' } } }, 'The server answered 502.');
    return m === 'The AI service cannot reach api.anthropic.com: x.';
  },
  async 'server AI key: no answer at all names the server, not "older"'(s) {
    const c = explainWith(s.sak, 'down'), m = await c.explain({ status: 502, data: {} }, 'x');
    return /10\.99\.0\.5/.test(m) && m.indexOf(c.OLDER) === -1;
  },
  'server AI key: every failure goes through explain(), no bare status codes'(s) { return !/'The server answered ' \+ r\.status \+ '\.'/.test(s.sak) && (s.sak.match(/explain\(r, /g) || []).length >= 3 && !/function reason\(/.test(s.sak); },
  async 'server: /health lists "server-ai-key" only where the admin handler exists'(s) {
    const body = grab(s.worker, /if \(request\.method === "GET" && url\.pathname === "\/v1\/ai\/health"\) \{[\s\S]*?\n      \}\n/, 'health');
    const jr = grab(s.worker, /function jsonResponse\(status, body, extra = \{\}\) \{[\s\S]*?\n\}\n/, 'jsonResponse');
    const run = async env => { const ctx = { Response, Headers, JSON, Date }; vm.createContext(ctx);
      vm.runInContext('const CORS = {}, CORS_HEADERS = {};\n' + jr + 'this.f = async (request, url, env) => { ' + body + ' return null; };', ctx);
      const r = await ctx.f({ method: 'GET' }, { pathname: '/v1/ai/health' }, env); return JSON.parse(await r.text()); };
    const own = await run({ __serverKey: { handle() {} } }), hosted = await run({});
    return Array.isArray(own.features) && own.features.includes('server-ai-key') && Array.isArray(hosted.features) && !hosted.features.includes('server-ai-key');
  },
  'app: "Failed to fetch" straight to Anthropic says which host and what IT allows'(s) {
    const e = plainNetFn(s.core)(new TypeError('Failed to fetch'), false); return /api\.anthropic\.com/.test(e.message) && /port 443/.test(e.message);
  },
  'app: "fetch failed" through the server names the server'(s) {
    const e = plainNetFn(s.core)(new Error('fetch failed'), true); return /10\.99\.0\.5/.test(e.message) && !/fetch failed/i.test(e.message);
  },
  'app: an error that got an answer keeps its own message'(s) {
    const e0 = new Error('Anthropic 401: invalid x-api-key'); return plainNetFn(s.core)(e0, true) === e0;
  },
  'app: both AI calls (messages, embeddings) use the plain message'(s) { return (s.core.match(/e = _plainNetError\(e, /g) || []).length >= 2; },
  'app: embedding errors read the message, never "[object Object]"'(s) { return /json\.error\.message/.test(s.core) && /typeof json\.error === 'object'|json\.error && json\.error\.message|\(json\.error && json\.error\.message\)/.test(s.core); },
  async 'server: an unreachable provider answers 502 upstream_unreachable with host, reason and fix'(s) {
    const e = new TypeError('fetch failed'); e.cause = { code: 'ENOTFOUND' };
    const r = workerFn(s.worker)('https://api.anthropic.com/v1/messages', e); const j = JSON.parse(await r.text());
    return r.status === 502 && j.error.type === 'upstream_unreachable' && /api\.anthropic\.com/.test(j.error.message) && /DNS/.test(j.error.message) && /port 443/.test(j.error.message) && !/fetch failed/.test(j.error.message);
  },
  'server: both provider calls (Anthropic, Voyage) are caught'(s) {
    return /catch \(e\) \{ return upstreamUnreachable\(ANTHROPIC_UPSTREAM, e\); \}/.test(s.worker) && /catch \(e\) \{ return upstreamUnreachable\(VOYAGE_UPSTREAM, e\); \}/.test(s.worker);
  },
  'server: worker.js is byte-identical in the customer kit and the hosted deploy'(s) { return s.proxy === null || s.proxy === s.worker; },
  'card: never fixed over the page (no position: fixed anywhere in its styles)'(s) {
    const css = (s.css.match(/#sl-onramp[^{]*\{[^}]*\}/g) || []).join('\n'); return css.length > 0 && !/position:\s*fixed/.test(css);
  },
  'card: home in the full-width sidebar is its footer, the menu scrolls in its own area above it'(s) { return /#sl-onramp\.home-side \{[^}]*flex: 0 0 auto;/.test(s.css) && /\.app-sidebar\.has-onramp \{ overflow: hidden; \}/.test(s.css) && /\.app-sidebar\.has-onramp > \.asb-nav \{ flex: 1 1 auto; min-height: 0; overflow-y: auto;/.test(s.css) && /sb\.appendChild\(el\)/.test(s.sl) && /sb\.classList\.toggle\('has-onramp', where === 'side'\)/.test(s.sl); },
  'card: gone means the sidebar scrolls as before'(s) { return (s.sl.match(/el\.remove\(\); _unhome\(\);/g) || []).length >= 2; },
  'card: otherwise a strip at the top of the page, in the flow'(s) { return /#sl-onramp\.home-page \{ margin: 0 0 14px; \}/.test(s.css) && /page\.insertBefore\(el, hdr \? hdr\.nextSibling : page\.firstChild\)/.test(s.sl); },
  'card: it moves home when the layout changes'(s) { return /new MutationObserver\(again\)\.observe\(document\.body, \{ attributes: true, attributeFilter: \['class'\] \}\)/.test(s.sl) && /addEventListener\('resize', again\)/.test(s.sl); },
  'card: folded to a bar once the user has made a start, unless they opened it'(s) { return /var folded = st === 'collapsed' \|\| \(st !== 'open' && doneCount > 0\);/.test(s.sl) && /_setState\(collapsed \? 'collapsed' : 'open'\)/.test(s.sl); },
  'every changed file has a newer cache key'(s) {
    const want = { 'safety_lab.css': '65.69', 'slab_license.js': '1.4', 'core_modules.js': '1.14', 'safety_lab.js': '65.67', 'server_ai_key.js': '1.2', 'afha_template.js': '1.2' };
    return Object.keys(want).every(f => { const m = new RegExp('"' + f.replace(/\./g, '\\.') + '\\?v=([0-9.]+)"').exec(s.idx); if (!m) return false;
      const a = m[1].split('.').map(Number), b = want[f].split('.').map(Number);
      for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] || 0, y = b[i] || 0; if (x !== y) return x > y; } return true; });
  },
};
const base = () => Object.assign({}, SRC, { proxy: PROXY });
const MUT = {
  'paywall: a customer install decides only once the signed license is checked, and takes the paywall down on a valid verdict': s => { s.sl = s.sl.replace("if (_customerInstall() && ready && typeof ready.then === 'function') ready.then(_check, _check);\n        else _check();", "_check();"); },
  'paywall: a later license verdict (slab-license-changed) takes a paywall that is up back down': s => { s.sl = s.sl.replace("const g = document.getElementById(GATE_ID);\n            if (g) g.remove();", ''); },
  'license: every verdict tells the page (slab-license-changed)': s => { s.lic = s.lic.replace(/W\.dispatchEvent\(new Event\('slab-license-changed'\)\)/, 'void 0'); },
  'customer layout redraws on a new license verdict': s => { s.afha = s.afha.replace(/addEventListener\('slab-license-changed'/, "addEventListener('x'"); },
  'app: "Failed to fetch" straight to Anthropic says which host and what IT allows': s => { s.core = s.core.replace(/failed to fetch\|/, ''); },
  'app: "fetch failed" through the server names the server': s => { s.core = s.core.replace("host = new URL(String(AI_PROXY_BASE_URL)).host || 'your AI service';", "host = 'the server';"); },
  'app: an error that got an answer keeps its own message': s => { s.core = s.core.replace(/if \(!\/failed to fetch[^\n]*return e;/, ''); },
  'app: both AI calls (messages, embeddings) use the plain message': s => { s.core = s.core.replace(/e = _plainNetError\(e, /, 'e = (e, '); },
  'app: embedding errors read the message, never "[object Object]"': s => { s.core = s.core.replace(/json\.error\.message/g, 'json.error'); },
  'server: an unreachable provider answers 502 upstream_unreachable with host, reason and fix': s => { s.worker = s.worker.replace('ENOTFOUND: "its address could not be looked up (DNS)", ', ''); },
  'server: both provider calls (Anthropic, Voyage) are caught': s => { s.worker = s.worker.replace('catch (e) { return upstreamUnreachable(VOYAGE_UPSTREAM, e); }', 'catch (e) { throw e; }'); },
  'server: worker.js is byte-identical in the customer kit and the hosted deploy': s => { s.proxy = (s.proxy || s.worker) + ' '; },
  'every changed file has a newer cache key': s => { s.idx = s.idx.replace(/server_ai_key\.js\?v=[0-9.]+"/, 'server_ai_key.js?v=1.0"'); },
  'server AI key: the admin handler\'s own message is shown as it is': s => { s.sak = s.sak.replace("if (typeof d.message === 'string' && d.message) return Promise.resolve(d.message);", ''); },
  'server AI key: "older" only when the service itself does not list the feature': s => { s.sak = s.sak.replace("if (f === 'no') return OLDER", "if (true) return OLDER"); },
  'server AI key: a current service\'s reason (e.g. Anthropic unreachable) is shown, never "answered 502"': s => { s.sak = s.sak.replace("if (d.error && typeof d.error === 'object' && d.error.message) return String(d.error.message);", ''); },
  'server AI key: no answer at all names the server, not "older"': s => { s.sak = s.sak.replace("if (f === 'unreachable') return noAnswer();", "if (f === 'unreachable') return OLDER;"); },
  'server AI key: every failure goes through explain(), no bare status codes': s => { s.sak += "\nvar z = 'The server answered ' + r.status + '.';"; },
  'server: /health lists "server-ai-key" only where the admin handler exists': s => { s.worker = s.worker.replace('if (env.__serverKey && typeof env.__serverKey.handle === "function") features.push("server-ai-key");', ''); },
  'card: never fixed over the page (no position: fixed anywhere in its styles)': s => { s.css = s.css.replace('#sl-onramp.home-page { margin: 0 0 14px; }', '#sl-onramp.home-page { position: fixed; margin: 0 0 14px; }'); },
  'card: home in the full-width sidebar is its footer, the menu scrolls in its own area above it': s => { s.css = s.css.replace('.app-sidebar.has-onramp > .asb-nav { flex: 1 1 auto; min-height: 0; overflow-y: auto;', '.app-sidebar.has-onramp > .asb-nav { flex: 1 1 auto;'); },
  'card: gone means the sidebar scrolls as before': s => { s.sl = s.sl.replace(/el\.remove\(\); _unhome\(\);/g, 'el.remove();'); },
  'card: otherwise a strip at the top of the page, in the flow': s => { s.sl = s.sl.replace('page.insertBefore(el, hdr ? hdr.nextSibling : page.firstChild)', 'document.body.appendChild(el)'); },
  'card: it moves home when the layout changes': s => { s.sl = s.sl.replace("window.addEventListener('resize', again)", 'void 0'); },
  'card: folded to a bar once the user has made a start, unless they opened it': s => { s.sl = s.sl.replace("(st !== 'open' && doneCount > 0)", 'false'); },
};

(async () => {
  console.log('Regression: customer-facing bugs, 22 Oct 2026');
  for (const [name, rule] of Object.entries(RULES)) {
    let ok = false, err = '';
    try { ok = !!(await rule(base())); } catch (e) { err = e.message; }
    check(name, ok, err);
    if (MUT[name]) {
      const m = base(); MUT[name](m); let bad = true;
      try { bad = !(await rule(m)); } catch (_) { bad = true; }
      check('  mutation is caught: ' + name, bad);
    } else check('  has a mutation: ' + name, false);
  }
  if (PROXY === null) console.log('  NOTE  safety-lab-proxy-deploy not next to this repo: the byte-identical check ran on the kit copy only');
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

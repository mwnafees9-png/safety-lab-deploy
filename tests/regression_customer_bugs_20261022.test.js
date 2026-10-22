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
 *     reason, and when the running AI service is too old to have the admin handler (its answer
 *     carries an error OBJECT, the generic path), it says so and what fixes it.
 *  3. "fetch failed" / "Failed to fetch". The server's AI service now answers 502
 *     upstream_unreachable naming the host, the network reason and the fix; the app turns a
 *     request that never got an answer into plain words. Embedding errors no longer read
 *     "[object Object]". worker.js is byte-identical in both places it ships.
 *  4. The "Getting started" card covered the bottom-left of tables (row tick boxes and menus).
 *     It now folds to a small bar once the user has made a start, and while it shows the page
 *     keeps that much room at the bottom so every last row scrolls clear of it.
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
function reasonFn(src) {
  const older = grab(src, /var OLDER = '[^\n]*;\n/, 'OLDER');
  const fn = grab(src, /function reason\(r, fallback\) \{[\s\S]*?\n  \}\n/, 'reason()');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(older + fn + 'this.reason = reason; this.OLDER = OLDER;', ctx);
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
  'server AI key: the server\'s own message is shown'(s) {
    const c = reasonFn(s.sak); return c.reason({ status: 502, data: { error: 'verify', message: 'Anthropic said the key is not valid.' } }, 'x') === 'Anthropic said the key is not valid.';
  },
  'server AI key: an older AI service (error object, e.g. "Missing Bearer token.") is named, with the fix'(s) {
    const c = reasonFn(s.sak), m = c.reason({ status: 401, data: { error: { type: 'unauthorized', message: 'Missing Bearer token.' } } }, 'x');
    return m.indexOf(c.OLDER) === 0 && /latest Safety Lab server package/.test(m) && /Missing Bearer token/.test(m);
  },
  'server AI key: an unreachable provider shows the server\'s words, not "answered 502"'(s) {
    const c = reasonFn(s.sak); return c.reason({ status: 502, data: { error: { type: 'upstream_unreachable', message: 'The AI service cannot reach api.anthropic.com: x.' } } }, 'The server answered 502.') === 'The AI service cannot reach api.anthropic.com: x.';
  },
  'server AI key: no "The server answered N." without a reason anywhere'(s) { return !/'The server answered ' \+ r\.status \+ '\.'/.test(s.sak) && (s.sak.match(/reason\(r, /g) || []).length >= 3; },
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
  'card: while it shows, the page keeps room at the bottom the size of the card'(s) {
    const r = reserveFn(s.sl); r.f({ isConnected: true, getBoundingClientRect: () => ({ height: 44 }) });
    const on = r.cls.has('sl-onramp-on') && r.props['--sl-onramp-space'] === '74px';
    r.f(null); return on && !r.cls.has('sl-onramp-on') && !('--sl-onramp-space' in r.props);
  },
  'card: the CSS turns that room into space below the page'(s) { return /body\.sl-onramp-on \.container \{ padding-bottom: calc\(var\(--s-6\) \+ var\(--sl-onramp-space, 0px\)\) !important; \}/.test(s.css); },
  'card: folded to a bar once the user has made a start, unless they opened it'(s) { return /var folded = st === 'collapsed' \|\| \(st !== 'open' && doneCount > 0\);/.test(s.sl) && /_setState\(collapsed \? 'collapsed' : 'open'\)/.test(s.sl); },
  'card: dismissing it gives the room back'(s) { return /_setState\('dismissed'\); el\.remove\(\); _reserveSpace\(null\);/.test(s.sl); },
  'every changed file has a newer cache key'(s) {
    const want = { 'safety_lab.css': '65.68', 'slab_license.js': '1.4', 'core_modules.js': '1.14', 'safety_lab.js': '65.66', 'server_ai_key.js': '1.1', 'afha_template.js': '1.2' };
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
  'server AI key: the server\'s own message is shown': s => { s.sak = s.sak.replace("if (typeof d.message === 'string' && d.message) return d.message;", ''); },
  'server AI key: an older AI service (error object, e.g. "Missing Bearer token.") is named, with the fix': s => { s.sak = s.sak.replace("return OLDER + (d.error.message", "return (d.error.message"); },
  'server AI key: an unreachable provider shows the server\'s words, not "answered 502"': s => { s.sak = s.sak.replace("if (d.error.type === 'upstream_unreachable' && d.error.message) return String(d.error.message);", ''); },
  'server AI key: no "The server answered N." without a reason anywhere': s => { s.sak += "\nvar z = 'The server answered ' + r.status + '.';"; },
  'app: "Failed to fetch" straight to Anthropic says which host and what IT allows': s => { s.core = s.core.replace(/failed to fetch\|/, ''); },
  'app: "fetch failed" through the server names the server': s => { s.core = s.core.replace("host = new URL(String(AI_PROXY_BASE_URL)).host || 'your AI service';", "host = 'the server';"); },
  'app: an error that got an answer keeps its own message': s => { s.core = s.core.replace(/if \(!\/failed to fetch[^\n]*return e;/, ''); },
  'app: both AI calls (messages, embeddings) use the plain message': s => { s.core = s.core.replace(/e = _plainNetError\(e, /, 'e = (e, '); },
  'app: embedding errors read the message, never "[object Object]"': s => { s.core = s.core.replace(/json\.error\.message/g, 'json.error'); },
  'server: an unreachable provider answers 502 upstream_unreachable with host, reason and fix': s => { s.worker = s.worker.replace('ENOTFOUND: "its address could not be looked up (DNS)", ', ''); },
  'server: both provider calls (Anthropic, Voyage) are caught': s => { s.worker = s.worker.replace('catch (e) { return upstreamUnreachable(VOYAGE_UPSTREAM, e); }', 'catch (e) { throw e; }'); },
  'server: worker.js is byte-identical in the customer kit and the hosted deploy': s => { s.proxy = (s.proxy || s.worker) + ' '; },
  'card: while it shows, the page keeps room at the bottom the size of the card': s => { s.sl = s.sl.replace("(h + 30) + 'px'", "'0px'"); },
  'card: the CSS turns that room into space below the page': s => { s.css = s.css.replace('body.sl-onramp-on .container { padding-bottom', 'body.sl-onramp-on .container { padding-top'); },
  'card: folded to a bar once the user has made a start, unless they opened it': s => { s.sl = s.sl.replace("(st !== 'open' && doneCount > 0)", 'false'); },
  'card: dismissing it gives the room back': s => { s.sl = s.sl.replace("_setState('dismissed'); el.remove(); _reserveSpace(null);", "_setState('dismissed'); el.remove();"); },
  'every changed file has a newer cache key': s => { s.idx = s.idx.replace(/server_ai_key\.js\?v=[0-9.]+"/, 'server_ai_key.js?v=1.0"'); },
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

#!/usr/bin/env node
/*
 * Regression — desktop parity, "works like Office". (6 Sep 2026)
 *
 * Waqas's rulings: one account honored by both apps; the desktop signs in at the SAME
 * gate as the web (no bypass); the signed license is the ONE licensing rule on every
 * customer install (desktop included) and must cover the signed-in account; the desktop
 * stays signed in offline; trials are temporary licenses; open-in links both directions;
 * the old "desktop connect" model (a local app that optionally attached to an account)
 * is DELETED, not exempted.
 *
 * Most checks EXECUTE the real code in a VM. Run: node tests/regression_desktop_parity.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), cp = require('child_process');
const nodeCrypto = require('crypto');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const PIN = require('./lib/pinfloor.js');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const idx = S('index.html'), helpers = S('helpers_modules.js'), gate = S('auth_gate.js'), licSrc = S('slab_license.js'), cfgSrc = S('slab_config.js'), misc = S('misc_fn_modules.js'), sl = S('safety_lab.js');
function extractFn(src, name) {
  let at = src.indexOf('async function ' + name + '('); if (at < 0) at = src.indexOf('function ' + name + '(');
  if (at < 0) return null;
  const open = src.indexOf('{', at); let d = 0;
  for (let i = open; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(at, i + 1); } }
  return null;
}
function before(hay, a, b) { const i = hay.indexOf(a), j = hay.indexOf(b); return i >= 0 && j >= 0 && i < j; }

(async function main() {
  // ------------------------------------------------------------------------------
  console.log('\n[gate] the desktop signs in at the SAME gate as the web');
  const initFn = extractFn(gate, 'init');
  check('auth_gate init() extracted', !!initFn);
  check('the desktop bypass ("__SLAB_DESKTOP__ → liftGate") is GONE from init()', initFn && !/__SLAB_DESKTOP__[\s\S]{0,80}liftGate/.test(strip(initFn)));
  const wrapperFn = extractFn(gate, '_licensedThenMfaThenLift') || '';
  const gateMinusWrapper = strip(gate.replace(wrapperFn, '').replace('async function _mfaGateThenLift(sb, onLift)', ''));
  const directLifts = (gateMinusWrapper.match(/_mfaGateThenLift\(sb,/g) || []).length;
  check('every lift path goes through _licensedThenMfaThenLift (no direct _mfaGateThenLift call outside the wrapper)', directLifts === 0, directLifts + ' direct calls');
  const wrapped = (gate.replace(wrapperFn, '').match(/_licensedThenMfaThenLift\(sb, session,/g) || []).length;
  check('three lift paths use the licensed wrapper (2× SIGNED_IN, 1× restored session)', wrapped === 3, wrapped + ' uses');
  check('idle sign-out stays OFF on the desktop (Waqas: works like Office)', /__SLAB_DESKTOP__\) return 0;/.test(gate) && /__SLAB_DESKTOP__\) return; \} catch \(_\) \{\}   \/\/ desktop stays signed in/.test(gate));

  // EXEC _licenseCoversAccount + _sessionTenant
  const coversFn = extractFn(gate, '_licenseCoversAccount'), tenantFn = extractFn(gate, '_sessionTenant');
  check('_licenseCoversAccount + _sessionTenant extracted', !!coversFn && !!tenantFn);
  if (coversFn && tenantFn) {
    async function covers(checkImpl, session) {
      const ctx = { window: { SLLicenseCheckIdentity: checkImpl, SLLicensePlainReason: r => 'PLAIN:' + r }, console: { warn() {} } };
      vm.createContext(ctx);
      vm.runInContext(tenantFn + ';' + coversFn + ';globalThis.__c = _licenseCoversAccount; globalThis.__t = _sessionTenant;', ctx);
      return await vm.runInContext('__c(' + JSON.stringify(session) + ')', ctx);
    }
    const sess = { user: { email: 'eng@radia.com', app_metadata: { tid: 'tid-A' } } };
    let seen = null;
    const r1 = await covers(async (e, t) => { seen = { e, t }; return { authoritative: true, valid: true }; }, sess);
    check('valid + authoritative → account covered', r1.ok === true);
    check('the verifier is asked with the account EMAIL and its Entra TENANT', seen && seen.e === 'eng@radia.com' && seen.t === 'tid-A');
    const r2 = await covers(async () => ({ authoritative: true, valid: false, reason: 'license is bound to radia.com — this account (gmail.com) is not covered' }), sess);
    check('authoritative + NOT covered → refused, with the plain-language reason', r2.ok === false && /^PLAIN:/.test(r2.reason));
    const r3 = await covers(async () => ({ authoritative: false, valid: false, reason: 'no license' }), sess);
    check('hosted demo (not authoritative) → never refuses', r3.ok === true);
    const r4 = await covers(undefined, sess);
    check('verifier absent → fails open (never locks out on a missing module)', r4.ok === true);
    const ctxT = { window: {} }; vm.createContext(ctxT); vm.runInContext(tenantFn + ';globalThis.__t=_sessionTenant;', ctxT);
    check('tenant falls back to identity_data.tid when app_metadata has none', vm.runInContext('__t({user:{identities:[{identity_data:{tid:"tid-B"}}]}})', ctxT) === 'tid-B');
    check('refusal signs out LOCALLY (this device only) and re-renders the gate', /_licensedThenMfaThenLift[\s\S]{0,900}signOut\(\{ scope: 'local' \}\)[\s\S]{0,200}renderGate\(\)/.test(gate));
  }

  // EXEC offline restore
  const storedFn = extractFn(gate, '_storedLoginEmail'), offFn = extractFn(gate, '_desktopOfflineRestore');
  check('_storedLoginEmail + _desktopOfflineRestore extracted', !!storedFn && !!offFn);
  if (storedFn && offFn) {
    function offline(isDesktop, store) {
      const keys = Object.keys(store);
      const ctx = { window: { SLConfig: { isDesktop } }, localStorage: { length: keys.length, key: i => keys[i], getItem: k => (k in store ? store[k] : null) } };
      vm.createContext(ctx);
      vm.runInContext(storedFn + ';' + offFn + ';globalThis.__o=_desktopOfflineRestore;', ctx);
      return vm.runInContext('__o()', ctx);
    }
    const tok = { 'sb-fhrqkhdrwbfnizkepkch-auth-token': JSON.stringify({ access_token: 'x', user: { email: 'eng@radia.com' } }) };
    check('desktop + stored login on disk → opens offline as that account', offline(true, tok) === 'eng@radia.com');
    check('desktop + NO stored login (signed out) → gate', offline(true, {}) === '');
    check('web never takes the offline path even with a stored login', offline(false, tok) === '');
    check('init() uses the offline restore only when getSession() returned no session', /\} else \{\s*const offlineEmail = _desktopOfflineRestore\(\);/.test(gate));
  }

  // ------------------------------------------------------------------------------
  console.log('\n[old model] the "desktop connect" model is DELETED, not exempted');
  const all = ['helpers_modules.js', 'misc_fn_modules.js', 'safety_lab.js', 'auth_gate.js', 'bindings_modules.js', 'data_ops_modules.js'].map(S).join('\n') + idx;
  for (const dead of ['_desktopWorkOffline', '_autoSendAndEnterCode', '_desktopCanAutoSend', '_slabDesktopOfflineThisLaunch', 'signup-offline-btn', 'desktop@local', 'safetyLab.desktop.codeSentAt', 'Connect to your workspace']) {
    check('gone everywhere: ' + dead, all.indexOf(dead) < 0);
  }
  const isDeskUses = (strip(helpers + misc).match(/(?<!function )_isDesktopAuth\(\)/g) || []).length;
  check('_isDesktopAuth() is used ONLY to choose code-vs-link for an emailed sign-in (1 call site)', isDeskUses === 1, isDeskUses + ' call sites');
  check('sendMagicLink still picks the emailed CODE on file:// (links cannot return there)', /const desktop = _isDesktopAuth\(\);[\s\S]{0,1200}mode: desktop \? 'code' : 'link'/.test(misc));
  check('the sign-in chip has ONE label on every platform', /label\.textContent = 'Sign in';/.test(helpers) && !/'Connect' : 'Sign in'/.test(helpers));

  // ------------------------------------------------------------------------------
  console.log('\n[license] trials, install-from-file, and the license screen');
  const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }); const KX = { kid: 'kx', alg: 'ES256', kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  function sign(payload) { const pb = b64u(Buffer.from(JSON.stringify(Object.assign({ kid: 'kx' }, payload)), 'utf8')); const s = nodeCrypto.createSign('SHA256'); s.update(Buffer.from(pb, 'utf8')); s.end(); return pb + '.' + b64u(s.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })); }
  const NOW = Date.parse('2026-09-06T12:00:00Z'), day = 86400000;
  const lic = o => Object.assign({ v: 1, alg: 'ES256', issuer: 'safetylabaero', id: 'SL-LIC-2026-0009', customer: 'Trial Co', tier: 'enterprise', seats: 2, bind: { domains: [] }, issuedAt: new Date(NOW - day).toISOString(), notBefore: new Date(NOW - day).toISOString(), notAfter: new Date(NOW + 29 * day).toISOString() }, o || {});
  function loadLicense(mode, store, doc) {
    const st = Object.assign({}, store || {});
    const W = { localStorage: { getItem: k => (k in st ? st[k] : null), setItem: (k, v) => { st[k] = String(v); }, removeItem: k => { delete st[k]; } }, crypto: globalThis.crypto, SLConfig: { mode, supabaseUrl: '', isDesktop: mode === 'desktop' } };
    const created = [];
    const document = doc || { readyState: 'complete', addEventListener() {}, getElementById: id => created.find(e => e.id === id) || null, body: { appendChild: e => created.push(e) }, documentElement: { appendChild: e => created.push(e) }, createElement: () => ({ setAttribute() {}, addEventListener() {}, innerHTML: '', id: '' }) };
    const ctx = { window: W, document, console: { info() {}, warn() {}, error() {}, log() {} }, URL, TextEncoder, TextDecoder, atob: s => Buffer.from(s, 'base64').toString('binary'), localStorage: W.localStorage, Date, JSON, Math, Number, String, Array, Object, Uint8Array, Promise, isNaN, setTimeout, FileReader: function () {}, location: { reload() {} } };
    vm.createContext(ctx); vm.runInContext(licSrc, ctx);
    return { win: W, store: st, created, ctx };
  }
  const t1 = loadLicense('self-hosted');
  const vTrial = await t1.win.SLLicenseVerify(sign(lic({ trial: true })), { now: NOW, keys: [KX], subtle: globalThis.crypto.subtle, backendHost: '', email: '', tenant: '', maxSeen: 0 });
  check('a trial license verifies with trial:true and the days left', vTrial.valid && vTrial.trial === true && vTrial.daysLeft === 29, JSON.stringify({ valid: vTrial.valid, trial: vTrial.trial, daysLeft: vTrial.daysLeft, reason: vTrial.reason }));
  const vPaid = await t1.win.SLLicenseVerify(sign(lic()), { now: NOW, keys: [KX], subtle: globalThis.crypto.subtle, backendHost: '', email: '', tenant: '', maxSeen: 0 });
  check('a license without the flag is NOT a trial', vPaid.valid && vPaid.trial === false);
  const vExp = await t1.win.SLLicenseVerify(sign(lic({ trial: true, notAfter: new Date(NOW - 1000).toISOString() })), { now: NOW, keys: [KX], subtle: globalThis.crypto.subtle, backendHost: '', email: '', tenant: '', maxSeen: 0 });
  check('an expired trial is refused like any expired license', !vExp.valid && /expired/.test(vExp.reason));
  await t1.win.__slabSignedLicenseReady;
  const inst = await t1.win.SLLicenseInstall(sign(lic()));
  check('SLLicenseInstall refuses a file the SHIPPED keys cannot verify and stores NOTHING', inst.valid === false && inst.reason === 'signature invalid' && !('safetyLab.license.signed' in t1.store));
  check('SLLicenseInstall exists and never stores before verifying (order in source)', before(strip(licSrc), 'W.SLLicenseInstall = async function', "localStorage.setItem(LS_SIGNED, blob)") && /if \(!r\.valid\) return \{ valid: false, reason: r\.reason \};\s*try \{ localStorage\.setItem\(LS_SIGNED, blob\)/.test(licSrc));
  await new Promise(r => setTimeout(r, 20));
  check('self-hosted with no license → the LICENSE SCREEN is rendered (#slab-license-gate)', t1.created.some(e => e.id === 'slab-license-gate'));
  const t2 = loadLicense('hosted-demo'); await t2.win.__slabSignedLicenseReady; await new Promise(r => setTimeout(r, 20));
  check('hosted demo with no license → NO license screen (the account path decides)', !t2.created.some(e => e.id === 'slab-license-gate'));
  const t3 = loadLicense('desktop'); await t3.win.__slabSignedLicenseReady; await new Promise(r => setTimeout(r, 20));
  check('desktop with no license → the license screen (desktop is a customer install)', t3.created.some(e => e.id === 'slab-license-gate') && t3.store['safetyLab.license.tier'] === 'unpaid');
  const t4 = loadLicense('browser-only'); await t4.win.__slabSignedLicenseReady; await new Promise(r => setTimeout(r, 20));
  check('browser-only (door three) with no license → the license screen', t4.created.some(e => e.id === 'slab-license-gate'));
  check('the screen never shows on top of a refused config (config screen owns that)', /if \(W\.__SLAB_CONFIG_FATAL__\) return;/.test(licSrc));
  const plain = t1.win.SLLicensePlainReason;
  check('plain-language reasons (no internal codes)', /no license has been loaded/i.test(plain('no license')) && /altered|not issued/i.test(plain('signature invalid')) && /renewed/i.test(plain('license expired on Mon Sep 07 2026')) && /clock/i.test(plain('system clock is earlier than a license already seen — check the clock')));
  check('account panel shows the license line (customer / trial days / until date)', /function _acctLicenseLine/.test(helpers) && /Trial<\/b> · ' \+ esc\(L\.daysLeft\) \+ ' days left/.test(helpers));

  // ------------------------------------------------------------------------------
  console.log('\n[open-in] one project, two windows');
  const openFn = extractFn(helpers, 'openCloudProjectById'), consumeFn = extractFn(helpers, '_consumePendingProjectLink'), urlFn = extractFn(helpers, '_consumeProjectLinkFromUrl'), isIdFn = extractFn(helpers, '_isProjectId'), dLink = extractFn(helpers, 'openInDesktopLink'), wLink = extractFn(helpers, 'openInWebLink');
  check('open-in functions extracted', !!openFn && !!consumeFn && !!urlFn && !!isIdFn && !!dLink && !!wLink);
  if (openFn && consumeFn && urlFn && isIdFn && dLink && wLink) {
    function openCtx(o) {
      const calls = [];
      const ctx = { window: { SLConfig: o.cfg || {} }, console: { warn() {} }, showToast() {}, isSupabaseSignedIn: () => !!o.signedIn, _loadCloudProject: id => calls.push(id), _activeCloudProjectId: o.active || null,
        location: { protocol: o.protocol || 'https:', search: o.search || '', pathname: '/app', hash: '' }, history: { replaceState: (a, b, url) => { ctx.__url = url; } }, URLSearchParams, URL };
      vm.createContext(ctx);
      vm.runInContext('let _slabPendingProjectId = ""; let _slabProjectLinkRead = false;' + isIdFn + ';' + openFn + ';' + consumeFn + ';' + urlFn + ';' + dLink + ';' + wLink + ';', ctx);
      ctx.__calls = calls; return ctx;
    }
    const ID = '5b5f1c3e-9f7e-4a5f-9d1e-3c2b1a0f9e8d';
    let c = openCtx({ signedIn: true });
    check('signed in + valid id → the project opens at once', vm.runInContext('openCloudProjectById("' + ID + '")', c) === true && c.__calls[0] === ID);
    c = openCtx({ signedIn: true });
    check('a link that is not a project id is refused (nothing opens)', vm.runInContext('openCloudProjectById("../etc/passwd")', c) === false && c.__calls.length === 0);
    c = openCtx({ signedIn: false });
    check('signed out → the request WAITS', vm.runInContext('openCloudProjectById("' + ID + '")', c) === false && c.__calls.length === 0);
    c.isSupabaseSignedIn = () => true;
    check('…and is honored on sign-in (the hook _onSupabaseSignedIn calls)', vm.runInContext('_consumePendingProjectLink()', c) === true && c.__calls[0] === ID);
    check('_onSupabaseSignedIn calls _consumePendingProjectLink', /_consumePendingProjectLink\(\);/.test(extractFn(helpers, '_onSupabaseSignedIn') || ''));
    c = openCtx({ signedIn: true, search: '?project=' + ID + '&x=1' });
    check('web ?project= link opens the project and is removed from the address bar', vm.runInContext('_consumePendingProjectLink()', c) === true && c.__calls[0] === ID && c.__url === '/app?x=1');
    c = openCtx({ signedIn: true, search: '?project=' + ID, protocol: 'file:' });
    check('on file:// (desktop) the ?project= parameter is ignored — links arrive via safetylab://', vm.runInContext('_consumePendingProjectLink()', c) === false);
    c = openCtx({ active: ID, cfg: { supabaseUrl: 'https://abc.supabase.co', webAppUrl: 'https://safety.customer.com/app' } });
    check('Open-in-desktop link names the project AND the backend host', vm.runInContext('openInDesktopLink()', c) === 'safetylab://open?project=' + ID + '&backend=abc.supabase.co');
    check('Open-in-web link uses the install\'s OWN web address', vm.runInContext('openInWebLink()', c) === 'https://safety.customer.com/app?project=' + ID);
    c = openCtx({ active: ID, cfg: { supabaseUrl: 'https://abc.supabase.co', webAppUrl: '' } });
    check('no web address configured → no Open-in-web link (never a fallback to Safety Lab)', vm.runInContext('openInWebLink()', c) === '');
    c = openCtx({ active: null, cfg: { supabaseUrl: 'https://abc.supabase.co', webAppUrl: 'https://x/app' } });
    check('no cloud project open → no links at all', vm.runInContext('openInDesktopLink()', c) === '' && vm.runInContext('openInWebLink()', c) === '');
    check('desktop SSO return address hook in ms_sso (safetylab:// callback when the shell provides it)', /slabDesktop\.ssoRedirect/.test(S('ms_sso.js')));
  }

  // ------------------------------------------------------------------------------
  console.log('\n[config 1.1] the web address is part of the egress rule');
  function runConfig(win) {
    const W = Object.assign({}, win);
    const doc = { readyState: 'complete', addEventListener() {}, body: { appendChild() {} }, createElement() { return { setAttribute() {}, style: {}, set innerHTML(v) {} }; }, documentElement: { appendChild() {} } };
    const ctx = { window: W, document: doc, console: { info() {}, error() {}, table() {}, log() {}, warn() {} }, URL }; ctx.window.document = doc;
    vm.createContext(ctx); vm.runInContext(cfgSrc, ctx);
    return { cfg: ctx.window.SLConfig, fatal: ctx.window.__SLAB_CONFIG_FATAL__ || null };
  }
  let r = runConfig({});
  check('hosted demo → webAppUrl is our site, desktop flag false', r.cfg.webAppUrl === 'https://safetylabaero.com/app' && r.cfg.desktop === false && !r.fatal);
  r = runConfig({ __SLAB_DESKTOP__: true });
  check('trial desktop (no overrides) → mode desktop, our web address, no fatal', r.cfg.mode === 'desktop' && r.cfg.desktop === true && r.cfg.webAppUrl === 'https://safetylabaero.com/app' && !r.fatal);
  r = runConfig({ __SLAB_SUPABASE_URL__: 'https://abc.supabase.co', __SLAB_SUPABASE_KEY__: 'k', __SLAB_AI_ENDPOINT__: 'https://ai.customer.com/v1', __SLAB_WEB_APP_URL__: 'https://safety.customer.com/app' });
  check('self-hosted with its own web address → carried through, no fatal', r.cfg.mode === 'self-hosted' && r.cfg.webAppUrl === 'https://safety.customer.com/app' && !r.fatal);
  r = runConfig({ __SLAB_SUPABASE_URL__: 'https://abc.supabase.co', __SLAB_SUPABASE_KEY__: 'k', __SLAB_AI_ENDPOINT__: 'https://ai.customer.com/v1' });
  check('self-hosted with NO web address → blank (button hidden), never a fallback to us', r.cfg.mode === 'self-hosted' && r.cfg.webAppUrl === '' && !r.fatal);
  r = runConfig({ __SLAB_SUPABASE_URL__: 'https://abc.supabase.co', __SLAB_SUPABASE_KEY__: 'k', __SLAB_AI_ENDPOINT__: 'https://ai.customer.com/v1', __SLAB_WEB_APP_URL__: 'https://safetylabaero.com/app' });
  check('self-hosted whose web address points at Safety Lab → HARD STOP naming "web address"', !!r.fatal && /web address/.test(r.fatal));
  r = runConfig({ __SLAB_DESKTOP__: true, __SLAB_SUPABASE_URL__: 'https://abc.supabase.co', __SLAB_SUPABASE_KEY__: 'k', __SLAB_AI_ENDPOINT__: 'https://ai.customer.com/v1', __SLAB_WEB_APP_URL__: 'https://safety.customer.com/app' });
  check('customer DESKTOP (their database) is self-hosted mode with the same leak rule, desktop flag kept', r.cfg.mode === 'self-hosted' && r.cfg.desktop === true && !r.fatal);
  r = runConfig({ __SLAB_DESKTOP__: true, __SLAB_SUPABASE_URL__: 'https://abc.supabase.co', __SLAB_SUPABASE_KEY__: 'k' });
  check('customer desktop that forgot the AI endpoint → HARD STOP (AI still points at us)', !!r.fatal && /AI inference/.test(r.fatal));
  r = runConfig({ __SLAB_LOCAL_ONLY__: true, __SLAB_WEB_APP_URL__: 'https://x/app' });
  check('browser-only + a web address → refused as a stray setting', !!r.fatal && /web address/.test(r.fatal));

  // ------------------------------------------------------------------------------
  console.log('\n[tool] trial licenses are temporary by construction');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-trial-'));
  const env = Object.assign({}, process.env, { HOME: tmp, USERPROFILE: tmp });
  const tool = path.join(ROOT, 'tools', 'license', 'sign.mjs');
  cp.spawnSync(process.execPath, [tool, 'keygen'], { env, encoding: 'utf8' });
  const tpl = JSON.parse(cp.spawnSync(process.execPath, [tool, 'template'], { env, encoding: 'utf8' }).stdout);
  check('template carries trial:false so it cannot be forgotten', tpl.trial === false);
  const long = Object.assign({}, tpl, { trial: true, notAfter: new Date(Date.parse(tpl.notBefore) + 200 * day).toISOString() });
  fs.writeFileSync(path.join(tmp, 'long.json'), JSON.stringify(long));
  const sgLong = cp.spawnSync(process.execPath, [tool, 'sign', path.join(tmp, 'long.json')], { env, encoding: 'utf8' });
  check('sign REFUSES a trial longer than 92 days', sgLong.status !== 0 && /trial/.test(sgLong.stderr + sgLong.stdout));
  const short = Object.assign({}, tpl, { trial: true, notAfter: new Date(Date.parse(tpl.notBefore) + 30 * day).toISOString() });
  fs.writeFileSync(path.join(tmp, 'short.json'), JSON.stringify(short));
  const sgShort = cp.spawnSync(process.execPath, [tool, 'sign', path.join(tmp, 'short.json')], { env, encoding: 'utf8' });
  check('sign accepts a 30-day trial', sgShort.status === 0, sgShort.stderr);
  const bad = Object.assign({}, tpl, { trial: 'yes' }); fs.writeFileSync(path.join(tmp, 'bad.json'), JSON.stringify(bad));
  check('sign refuses a non-boolean trial flag', cp.spawnSync(process.execPath, [tool, 'sign', path.join(tmp, 'bad.json')], { env, encoding: 'utf8' }).status !== 0);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

  // ------------------------------------------------------------------------------
  console.log('\n[pins]');
  check('slab_config >= 1.1', PIN.atLeast(idx, 'slab_config.js', '1.1'));
  check('slab_license >= 1.2', PIN.atLeast(idx, 'slab_license.js', '1.2'));
  check('helpers_modules >= 2.90', PIN.atLeast(idx, 'helpers_modules.js', '2.90'));
  check('auth_gate >= 62.70', PIN.atLeast(idx, 'auth_gate.js', '62.70'));
  check('misc_fn_modules >= 66.56', PIN.atLeast(idx, 'misc_fn_modules.js', '66.56'));
  check('safety_lab >= 65.52', PIN.atLeast(idx, 'safety_lab.js', '65.52'));
  check('ms_sso >= 1.1', PIN.atLeast(idx, 'ms_sso.js', '1.1'));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log('  FAIL  suite crashed — ' + e.message); process.exit(1); });

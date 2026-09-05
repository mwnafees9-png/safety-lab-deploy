/*
 * regression_desktop_sync_defects.test.js — the three DESKTOP_SYNC_GO_LIVE
 * defects (spec 14 Aug 2026, fixed 30 Aug 2026). All three were LIVE data or
 * trust hazards; each check here executes the fixed behavior, none pins prose.
 *
 *  D1 — cloud_sync._tick pushed ITAR-controlled projects to hosted Supabase
 *       every 12 s (crdt/presence refused them; this module checked nothing).
 *       Executed: a tick over an ITAR snapshot touches NO client and says the
 *       local-only posture ONCE; the same tick with ITAR clear proceeds.
 *  D2 — the server entitlement verdict rendered a paywall inside a LICENSED
 *       desktop install, and its tier write could downgrade the licensed tier.
 *       Executed: isPaywalled() is false on desktop even with the server
 *       verdict '1'; _entitlementTierToApply only ever raises on desktop.
 *  D3 — File > Open kept the previous project's cloud identity, so the next
 *       tick overwrote that cloud project with the .slab contents. Structural +
 *       wrap-mechanics: loadProject is in cloud_sync's wrapped loader lists.
 *
 * Mutations proven red at build time: guard removed; guard reads the wrong
 * flag; desktop short-circuit removed; tier floor allows a downgrade;
 * loadProject dropped from the wrap list.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = path.join(__dirname, '..', 'site');
const cloudSrc = fs.readFileSync(path.join(SITE, 'cloud_sync.js'), 'utf8');
const helpersSrc = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok   ' + name);
  else { failures++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

function extractFn(src, name) {
  const at = src.indexOf('function ' + name);
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(at, i + 1); }
  }
  return null;
}
// async function extraction (for _tick)
function extractAsyncFn(src, name) {
  const at = src.indexOf('async function ' + name);
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(at, i + 1); }
  }
  return null;
}

/* ------------------------------------------------------------------ */
console.log('D1 — ITAR projects never silently autosave to the cloud');

const tickFn = extractAsyncFn(cloudSrc, '_tick');
// 2 Sep 2026 — the push body lives in _push (queued on the shared save chain); the
// ITAR guard moved with it. Extract both plus the queue helper.
const pushFn = extractAsyncFn(cloudSrc, '_push');
const queueFn = extractFn(cloudSrc, '_writer');   // 3 Sep 2026: the queue lives in cloud_writer.js; _writer() resolves it
const writerSrc = fs.readFileSync(path.join(SITE, 'cloud_writer.js'), 'utf8');
const noticeFn = extractFn(cloudSrc, '_itarLocalOnlyNotice');
check('_tick extracted', !!tickFn);
check('_push + _writer extracted', !!pushFn && !!queueFn);
check('_itarLocalOnlyNotice extracted', !!noticeFn);
if (tickFn && pushFn && queueFn && noticeFn) {
  function tickSandbox(itar) {
    const calls = { from: 0, toasts: [], consoles: 0 };
    const sb = {
      console: { info: () => { calls.consoles++; }, error: () => {} },
      Promise, Date, Array, JSON, String,
      showToast: (m) => calls.toasts.push(String(m)),
      window: {},
      _calls: calls,
    };
    vm.createContext(sb);
    const preamble = `
      let _inFlight = false, _lastPushedTs = 0, _lastPushedItems = null;
      let _itarNoticeShown = false;
      function _on(){ return true; }
      function _userId(){ return 'u1'; }
      function _client(){ return { from: function(){ _calls.from++; return { update: () => ({ eq: () => ({ then: () => {} }) }), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), upsert: async () => ({ error: null }) }; } }; }
      function _wsId(){ return 'ws1'; }
      function _pid(){ return 'p1'; }
      function _dirty(){ return true; }
      function _lastLocalWrite(){ return 999; }
      function _snapshot(){ return { projectConfig: { isITARControlled: ${itar ? 'true' : 'false'}, regulation: 'Part 25' }, ftaPages: [] }; }
      function _name(){ return 'X'; }
      function _hasRealContent(){ return true; }
      function _wouldGut(){ return false; }
      function _contentItems(){ return 5; }
      function _docVer(){ return null; }
      function _markPushed(){}
      function _setStatus(){}
      function _rtUpdatePresenceProject(){}
    `;
    vm.runInContext('var _activeCloudDocVersion = null; var __slabCloudQuietMs = 1;' + writerSrc + ';' + preamble + noticeFn + queueFn + pushFn + tickFn + ';globalThis.__tick = _tick;', sb);
    return { sb, calls };
  }
  const itar = tickSandbox(true);
  const clear = tickSandbox(false);
  const p1 = vm.runInContext('__tick()', itar.sb);
  const p2 = vm.runInContext('__tick()', clear.sb);
  Promise.all([p1, p2].map(p => Promise.resolve(p).catch(() => {}))).then(() => {
    check('ITAR snapshot: tick touches NO supabase client', itar.calls.from === 0, itar.calls.from + ' calls');
    check('ITAR snapshot: local-only posture said (toast + console)',
      itar.calls.toasts.some(t => /ITAR/.test(t)) && itar.calls.consoles >= 1);
    // second tick: notice not repeated
    vm.runInContext('__tick()', itar.sb);
    check('posture said ONCE, not every 12 s', itar.calls.toasts.length === 1, itar.calls.toasts.length + ' toasts');
    check('ITAR clear: the same tick DOES reach the client (guard is not a dead switch)',
      clear.calls.from > 0, clear.calls.from + ' calls');
    check('guard judges the SNAPSHOT object, not window state',
      /snap\.projectConfig && snap\.projectConfig\.isITARControlled/.test(pushFn));
    part2();
  });
} else { part2(); }

function part2() {
console.log('D2 — a licensed desktop never renders the paywall, tier only rises');

const paywallFn = extractFn(helpersSrc, 'isPaywalled');
const tierFn = extractFn(helpersSrc, '_entitlementTierToApply');
check('isPaywalled extracted', !!paywallFn);
check('_entitlementTierToApply extracted', !!tierFn);
if (paywallFn && tierFn) {
  function pwSandbox(desktop, serverVerdict) {
    const store = { 'safetyLab.server.paywalled': serverVerdict, 'safetyLab.signup.email': 'x@y.com' };
    const sb = {
      localStorage: { getItem: k => (k in store ? store[k] : null) },
      _isDesktopAuth: () => desktop,
      isOnTrial: () => false, isInGrandfatherWindow: () => false,
      LICENSE_TIER_RANK: { edu: 0, pro: 1, 'pro-plus': 2, enterprise: 3 },
    };
    vm.createContext(sb);
    vm.runInContext(paywallFn + ';globalThis.__pw = isPaywalled;', sb);
    return vm.runInContext('__pw()', sb);
  }
  check('web + server verdict 1 -> paywalled (web behavior unchanged)', pwSandbox(false, '1') === true);
  check('DESKTOP + server verdict 1 -> NOT paywalled (Electron gate is the authority)', pwSandbox(true, '1') === false);
  check('desktop short-circuit precedes the server verdict read',
    paywallFn.indexOf('_isDesktopAuth') < paywallFn.indexOf('safetyLab.server.paywalled'));

  // 30 Aug (live-verify lesson): the first cut of this suite INVENTED rank names
  // ('proplus') and passed while a live probe with the same invented name showed
  // a downgrade — the function was right, the fixture vocabulary was wrong.
  // Use the PRODUCT'S rank, extracted from bindings_modules.js, so a vocabulary
  // drift between suite and product can never hide again.
  const bindingsSrc = fs.readFileSync(path.join(SITE, 'bindings_modules.js'), 'utf8');
  const rankM = bindingsSrc.match(/const LICENSE_TIER_RANK = (\{[^}]+\});/);
  check('real LICENSE_TIER_RANK extracted from bindings_modules', !!rankM);
  const REAL_RANK = rankM ? (0, eval)('(' + rankM[1] + ')') : { edu: 0, pro: 1, 'pro-plus': 2, enterprise: 3 };
  check("real vocabulary has 'pro-plus' (hyphenated) — the name the first cut got wrong",
    REAL_RANK.hasOwnProperty('pro-plus'));
  const sb2 = { LICENSE_TIER_RANK: REAL_RANK };
  vm.createContext(sb2);
  vm.runInContext(tierFn + ';globalThis.__t = _entitlementTierToApply;', sb2);
  const t = (d, cur, v) => vm.runInContext(`__t(${d}, ${JSON.stringify(cur)}, ${JSON.stringify(v)})`, sb2);
  check('web: verdict tier applies as-is', t(false, 'pro-plus', 'pro') === 'pro');
  check('desktop: cloud tier can RAISE the licensed tier', t(true, 'pro', 'enterprise') === 'enterprise');
  check('desktop: cloud tier can NEVER lower it', t(true, 'pro-plus', 'pro') === null);
  check('desktop: equal tier is left alone', t(true, 'pro', 'pro') === null);
  check('desktop: unknown verdict tier never downgrades', t(true, 'pro-plus', 'weird') === null);
  check('no verdict tier -> leave alone everywhere', t(true, 'pro', null) === null && t(false, 'pro', '') === null);
  check('desktop: EMPTY current tier accepts the verdict (raising from nothing)', t(true, '', 'pro') === 'pro');
  check('entitlement sync wired through the floor helper',
    /_entitlementTierToApply\(_desk2, _curTier2, verdict\.tier\)/.test(helpersSrc));
  check('desktop never calls endTrial off the server verdict',
    /if \(!_desk2 && typeof endTrial === 'function'\) endTrial\(\);/.test(helpersSrc));
}

console.log('D3 — File > Open drops the previous cloud identity');
check('loadProject is in cloud_sync\'s wrapped loader list',
  /_FILE_LOADERS = \['loadProject'\]/.test(cloudSrc));
check('…wrapped at load AND in the late-module retry loop',
  (cloudSrc.match(/_FILE_LOADERS\.forEach\(_wrapLoader\)/g) || []).length === 2);
// wrap mechanics executed: wrapping a fake loadProject detaches identity
(function () {
  const wrapFn = extractFn(cloudSrc, '_wrapLoader');
  const detachFn = extractFn(cloudSrc, '_detachCloudIdentity');
  check('_wrapLoader + _detachCloudIdentity extracted', !!wrapFn && !!detachFn);
  if (!wrapFn || !detachFn) return;
  const sb = { window: {}, console };
  vm.createContext(sb);
  vm.runInContext(`
    let _activeCloudProjectId = 'CLOUD-X', _activeCloudDocVersion = 7, _dirtySinceSave = true,
        _lastPushedTs = 5, _lastPushedItems = 9;
    window.loadProject = function () { return 'loaded'; };
    ${detachFn}
    ${wrapFn}
    _wrapLoader('loadProject');
    globalThis.__r = window.loadProject();
    globalThis.__pid = _activeCloudProjectId;
    globalThis.__base = _lastPushedItems;
  `, sb);
  check('opening a file returns normally AND detaches the cloud identity',
    vm.runInContext('__r', sb) === 'loaded' && vm.runInContext('__pid', sb) === null);
  check('the shrink baseline resets with the identity (a file load is a wholesale replace)',
    vm.runInContext('__base', sb) === null);
})();

console.log('pins (floors)');
function pin(src, re) { const m = src.match(re); return m ? parseFloat(m[1]) : -1; }
check('cloud_sync pin floor >= 1.5', pin(indexSrc, /cloud_sync\.js\?v=([\d.]+)/) >= 1.5);
check('helpers_modules pin floor >= 2.55', pin(indexSrc, /helpers_modules\.js\?v=([\d.]+)/) >= 2.55);

console.log(failures ? ('FAILED — ' + failures + ' check(s)') : 'ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
}

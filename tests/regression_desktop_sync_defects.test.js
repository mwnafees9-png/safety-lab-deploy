/*
 * regression_desktop_sync_defects.test.js — the three DESKTOP_SYNC_GO_LIVE
 * defects (spec 14 Aug 2026, fixed 30 Aug 2026). All three were LIVE data or
 * trust hazards; each check here executes the fixed behavior, none pins prose.
 *
 *  D1 — cloud_sync._tick pushed ITAR-controlled projects to hosted Supabase
 *       every 12 s (crdt/presence refused them; this module checked nothing).
 *       Executed: a tick over an ITAR snapshot touches NO client and says the
 *       local-only posture ONCE; the same tick with ITAR clear proceeds.
 *  D2 — (rewritten 6 Sep 2026) the paywall must follow the SIGNED LICENSE wherever
 *       it is the authority (every customer install, desktop included); the
 *       server entitlement verdict is the hosted demo's rule only. Executed:
 *       isPaywalled() under the four license/verdict combinations.
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
console.log('D2 — ONE licensing rule: where the signed license is the authority, the paywall IS the license question');
// 6 Sep 2026 (desktop parity) — D2 as first fixed (30 Aug) exempted the desktop from the
// paywall because "the Electron gate is the authority". That gate is gone: the desktop now
// runs the same signed-license verifier as every customer install. So the rule under test
// became: SLLicense.authoritative → paywalled === !valid (any platform); not authoritative
// (hosted demo) → the server verdict, exactly as before. _entitlementTierToApply (the
// desktop raise-only floor) is DELETED: the sync stands down entirely under a signed license.

const paywallFn = extractFn(helpersSrc, 'isPaywalled');
const authFn = extractFn(helpersSrc, '_signedLicenseAuthority');
check('isPaywalled extracted', !!paywallFn);
check('_signedLicenseAuthority extracted', !!authFn);
check('_entitlementTierToApply is GONE (dead once the license stands the sync down)', helpersSrc.indexOf('_entitlementTierToApply') < 0);
check('isPaywalled no longer branches on _isDesktopAuth', paywallFn && paywallFn.indexOf('_isDesktopAuth') < 0);
if (paywallFn && authFn) {
  function pwSandbox(lic, serverVerdict) {
    const store = { 'safetyLab.server.paywalled': serverVerdict, 'safetyLab.signup.email': 'x@y.com' };
    const sb = {
      localStorage: { getItem: k => (k in store ? store[k] : null) },
      window: { SLLicense: lic },
      isOnTrial: () => false, isInGrandfatherWindow: () => false,
      LICENSE_TIER_RANK: { edu: 0, pro: 1, 'pro-plus': 2, enterprise: 3 },
    };
    vm.createContext(sb);
    vm.runInContext(authFn + ';' + paywallFn + ';globalThis.__pw = isPaywalled;', sb);
    return vm.runInContext('__pw()', sb);
  }
  check('hosted demo (no authoritative license) + server verdict 1 -> paywalled (unchanged)', pwSandbox(null, '1') === true);
  check('hosted demo + server verdict 0 -> not paywalled (unchanged)', pwSandbox(null, '0') === false);
  check('authoritative + VALID license -> NOT paywalled even when the server verdict says 1', pwSandbox({ authoritative: true, valid: true }, '1') === false);
  check('authoritative + INVALID license -> paywalled even when the server verdict says 0', pwSandbox({ authoritative: true, valid: false }, '0') === true);
  check('a present-but-advisory license (hosted demo, valid) does not override the server verdict', pwSandbox({ authoritative: false, valid: true }, '1') === true);
  check('license authority is consulted BEFORE the server verdict is read', paywallFn.indexOf('_signedLicenseAuthority') < paywallFn.indexOf('safetyLab.server.paywalled'));
  const syncAt = helpersSrc.indexOf('function _syncEntitlementFromServer');
  const sync = helpersSrc.slice(syncAt, syncAt + 1500);
  check('entitlement sync STANDS DOWN under an authoritative license, before any license_tokens query',
    /_signedLicenseAuthority\(\)\.authoritative\) return;/.test(sync) && sync.indexOf('_signedLicenseAuthority') < sync.indexOf("from('license_tokens')"));
  check('the desktop raise-only clause is gone from the sync', sync.indexOf('_desk2') < 0);
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

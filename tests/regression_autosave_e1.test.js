#!/usr/bin/env node
/*
 * Regression — E1: autosave never overwrites a good local copy with an empty one.
 *
 * THE INCIDENT (26 Aug 2026, reproduced live on the deployed build). A page
 * reload came back to a blank project. Within seconds BOTH local copies had
 * been overwritten with that blank state:
 *   localStorage safetyLab.autosave.v1 — 4,823 B, every row count 0, ts …620560
 *   IndexedDB    safetyLab.autosave.v1 — 5,056 B, blank,        ts …702724
 * IDB was stamped LATER than the mirror, so it was not lagging behind holding
 * good data — it had been overwritten too. The session immediately before:
 * 19 functions · 32 FCIM rows · 114 extracted conditions · 38 FHA rows ·
 * 11 fault trees · 18 ZSA rows. Recoverable only from the cloud.
 *
 * THE ASYMMETRY, which is the whole bug. _autosaveHasContent() is the predicate
 * for "is this snapshot worth anything". checkAutosaveRecovery consults it on
 * the way OUT and correctly declines to RESTORE an empty snapshot. _writeAutosave
 * consulted it on the way IN never: its only guard was `if (_autosaveSuspended)`,
 * and _autosaveSuspended is set for project load and sample load — not for
 * recovery. safety_lab.js:4436 runs checkAutosaveRecovery() and wires autosave
 * immediately after, while the IndexedDB branch of recovery is still in flight.
 *
 * WHY THESE CHECKS EXECUTE RATHER THAN PIN. Six hours earlier a scope-picker
 * check pinned the SOURCE TEXT of a broken line and the whole wall went green
 * over a dead feature. A shape pin proves the code still says what it said; it
 * cannot notice that what it says is wrong. So every check below runs the real
 * _writeAutosave and the real _autosaveHasContent against a fake storage layer
 * and asserts what ends up IN that storage.
 *
 * Run: node tests/regression_autosave_e1.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const helpers = fs.readFileSync(path.join(SITE, 'helpers_modules.js'), 'utf8');
const dataOps = fs.readFileSync(path.join(SITE, 'data_ops_modules.js'), 'utf8');
const bindings = fs.readFileSync(path.join(SITE, 'bindings_modules.js'), 'utf8');

function fn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let depth = 0, started = false, inS = null, esc = false, line = false, blk = false;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { line = true; k++; continue; }
    if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

// ---- a project snapshot the REAL predicate calls content-bearing, and one it doesn't
const FULL = () => ({ projectName: 'P', acFhaData: [{ id: 1 }], acReqData: [], systemsData: [],
                      ftaPages: [{ root: { id: 'g' } }], acFcimData: [{ id: 'c' }] });
const EMPTY = () => ({ projectName: 'Untitled Project', acFhaData: [], acReqData: [],
                       systemsData: [], ftaPages: [{ root: null }], acFcimData: [] });

// ---- a harness that runs the REAL _writeAutosave over a fake storage layer ----
function harness(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const idb = Object.assign({}, opts.idb || {});
  const warnings = [];
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(' ')), log: () => {} },
    Date, JSON, setTimeout, clearTimeout, Promise,
    AUTOSAVE_KEY: 'safetyLab.autosave.v1',
    AUTOSAVE_META_KEY: 'safetyLab.autosave.meta.v1',
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { if (opts.quota) throw new Error('QuotaExceededError'); store[k] = v; },
      removeItem: k => { delete store[k]; }
    },
    SLDB: { available: () => !!opts.idbAvailable,
            get: k => Promise.resolve(k in idb ? idb[k] : null),
            set: (k, v) => { idb[k] = v; return Promise.resolve(); },
            del: k => { delete idb[k]; return Promise.resolve(); } },
    _maybeCompress: p => Promise.resolve(p),
    _maybeDecompress: p => Promise.resolve(p),
    _perfTime: (_n, f) => f(),
    _updateSaveIndicator: s => { ctx._indicator = s; },
    _writeAutosaveToDisk: () => {},
    _checkProjectHealth: () => {},
    _applyProjectData: d => { ctx._applied = d; },
    _dismissWelcomeIfOpen: () => {},
    showToast: () => {},
    _snapshotProject: () => (opts.snapshot || EMPTY)(),
    _autosaveSuspended: false, _autosavePending: false, _autosaveLastWrite: 0,
    _dirtySinceSave: false, _quantClearCache: () => {},
    _autosaveRecoveryPending: false, _autosaveRecoveryTimer: null,
    // 2 Sep 2026 boot-durability guard: false = the pre-recovery boot gap; default
    // true here so existing cases exercise normal post-boot writes unchanged.
    _bootRecoveryHasRun: (opts.bootRecoveryHasRun === undefined ? true : opts.bootRecoveryHasRun),
    _autosaveStoredHasContent: (opts.cached === undefined ? null : opts.cached),
    // E1 part 3
    LASTGOOD_KEY: 'safetyLab.autosave.lastgood.v1',
    LASTGOOD_META_KEY: 'safetyLab.autosave.lastgood.meta.v1',
    LASTGOOD_MIN_INTERVAL_MS: 120000,
    _lastgoodLastWrite: opts.lastgoodLastWrite || 0,
    _store: store, _idb: idb, _warnings: warnings
  };
  // a DOM just real enough for the banner path
  ctx._banners = [];
  ctx.document = {
    querySelector: sel => {
      if (sel === '.container') return ctx._container;
      if (sel === '.recovery-banner') return ctx._banners.length ? ctx._banners[0] : null;
      return null;
    },
    querySelectorAll: () => ({ forEach: () => {} }),
    createElement: () => ({ className: '', innerHTML: '', _attrs: {},
      setAttribute() {}, querySelector: () => null })
  };
  ctx._container = {
    querySelector: () => null,
    insertBefore: b => { ctx._banners.push(b); },
    firstChild: null
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const bodies = [
    // 2 Sep 2026 — _autosaveHasContent now delegates to _projectConfigHasAuthoredContent
    // (the HF/RAM/MMEL/Markov durability fix: nested authored lanes were invisible to the
    // empty-check, so an HF-only project was judged empty and recovery bailed). Lift the
    // dependency too, or the predicate throws ReferenceError in this sandbox.
    fn(helpers, '_projectConfigHasAuthoredContent'),
    fn(helpers, '_autosaveHasContent'),
    fn(helpers, '_autosaveStoredWorthKeeping'),
    fn(helpers, '_writeAutosave'),
    fn(helpers, '_writeLastGood'),
    fn(dataOps, '_recoveryHoldBegin'),
    fn(dataOps, '_recoveryHoldEnd'),
    fn(dataOps, 'checkAutosaveRecovery'),
    fn(dataOps, 'discardAutosave'),
    fn(dataOps, '_offerLastGoodIfAny'),
    fn(dataOps, '_showLastGoodBanner'),
    fn(dataOps, 'recoverLastGood'),
    fn(dataOps, 'discardLastGood')
  ];
  bodies.forEach((b, i) => { if (!b) throw new Error('could not extract function #' + i); });
  const relMs = (dataOps.match(/const _RECOVERY_RELEASE_MS = (\d+)/) || [])[1];
  vm.runInContext('var _RECOVERY_RELEASE_MS = ' + (relMs || 12000) + ';\n' +
    bodies.join('\n') + '\nfunction _dismissRecoveryBanner(){}\n', ctx);
  return ctx;
}

console.log('\n[E1] the predicate itself, executed');
{
  const c = harness({});
  check('a project with FHA rows counts as content', vm.runInContext('_autosaveHasContent(' + JSON.stringify(FULL()) + ')', c) === true);
  check('a blank project does not', vm.runInContext('_autosaveHasContent(' + JSON.stringify(EMPTY()) + ')', c) === false);
  check('a fault tree page with no root is not content',
    vm.runInContext('_autosaveHasContent({ftaPages:[{root:null}]})', c) === false,
    'the 84-byte blank-page fingerprint must not read as a real project');
}

console.log('\n[E1] THE INCIDENT — an empty write during the recovery window');
{
  const c = harness({ store: { 'safetyLab.autosave.v1': JSON.stringify(FULL()),
                              'safetyLab.autosave.meta.v1': JSON.stringify({ ts: 1, size: 99 }) },
                      snapshot: EMPTY });
  vm.runInContext('_recoveryHoldBegin(); _writeAutosave();', c);
  const stored = JSON.parse(c._store['safetyLab.autosave.v1']);
  check('the stored project SURVIVES an empty write while recovery is pending',
    Array.isArray(stored.acFhaData) && stored.acFhaData.length === 1,
    'this is the exact write that destroyed the 26 Aug session');
  check('…and the refusal is announced, not silent',
    c._warnings.some(w => /refused to overwrite/.test(w)));
  check('…and the indicator says saved, because the good copy IS the saved state',
    c._indicator === 'saved');
}

console.log('\n[E1] the guard is NARROW — everything else still writes');
{
  const c = harness({ store: { 'safetyLab.autosave.v1': JSON.stringify(FULL()) }, snapshot: FULL });
  vm.runInContext('_recoveryHoldBegin(); _writeAutosave();', c);
  check('a CONTENT-bearing write goes through during recovery, untouched',
    JSON.parse(c._store['safetyLab.autosave.v1']).acFcimData.length === 1);
}
{
  // deliberate blanking (createNewProject) happens long after boot — must persist
  const c = harness({ store: { 'safetyLab.autosave.v1': JSON.stringify(FULL()) }, snapshot: EMPTY });
  vm.runInContext('_writeAutosave();', c);   // window NOT open
  check('an empty write OUTSIDE the window still persists — createNewProject is not broken',
    JSON.parse(c._store['safetyLab.autosave.v1']).acFhaData.length === 0,
    'refusing this would resurrect the old project on the next refresh');
}
{
  const c = harness({ store: {}, snapshot: EMPTY });
  vm.runInContext('_recoveryHoldBegin(); _writeAutosave();', c);
  check('an empty write over NOTHING stored is allowed even during recovery',
    c._store['safetyLab.autosave.v1'] !== undefined,
    'there is no good copy to protect, so there is nothing to refuse');
}
{
  const c = harness({ store: { 'safetyLab.autosave.v1': '{{{ not json' }, snapshot: EMPTY });
  vm.runInContext('_recoveryHoldBegin(); _writeAutosave();', c);
  check('an UNREADABLE stored copy is not treated as worth protecting',
    c._store['safetyLab.autosave.v1'] !== '{{{ not json',
    'a corrupt slot must not wedge autosave shut forever');
}

console.log('\n[E1] the window closes — in both directions, and on its own');
{
  const c = harness({ store: { 'safetyLab.autosave.v1': JSON.stringify(FULL()) }, snapshot: EMPTY });
  vm.runInContext('_recoveryHoldBegin(); _recoveryHoldEnd(); _writeAutosave();', c);
  check('once recovery resolves the refusal stops applying',
    JSON.parse(c._store['safetyLab.autosave.v1']).acFhaData.length === 0);
  check('_recoveryHoldEnd is idempotent — both paths may call it',
    (() => { try { vm.runInContext('_recoveryHoldEnd(); _recoveryHoldEnd();', c); return true; } catch (_) { return false; } })());
}
{
  const c = harness({});
  vm.runInContext('_recoveryHoldBegin();', c);
  check('the hold arms a backstop timer', c._autosaveRecoveryTimer !== null,
    'a window that can never close would strand the write it is guarding');
  check('the backstop is bounded and short enough to be harmless',
    (() => { const m = dataOps.match(/const _RECOVERY_RELEASE_MS = (\d+)/); return m && +m[1] > 0 && +m[1] <= 30000; })());
}

console.log('\n[E1] recovery seeds the judgement, and discard clears it');
{
  const c = harness({ store: { 'safetyLab.autosave.v1': JSON.stringify(FULL()),
                               'safetyLab.autosave.meta.v1': JSON.stringify({ ts: 5, size: 9 }) } });
  vm.runInContext('checkAutosaveRecovery();', c);
  check('recovery restores a content-bearing stored project', !!c._applied && c._applied.acFhaData.length === 1);
  check('…and records that the stored copy is worth keeping', c._autosaveStoredHasContent === true,
    'this is what makes the refusal free — no re-parse per write');
  check('…and closes its own window on the synchronous path', c._autosaveRecoveryPending === false);
}
{
  const c = harness({ store: { 'safetyLab.autosave.v1': JSON.stringify(EMPTY()),
                               'safetyLab.autosave.meta.v1': JSON.stringify({ ts: 5, size: 9 }) } });
  vm.runInContext('checkAutosaveRecovery();', c);
  check('an EMPTY stored project is still refused as a restore source', c._applied === undefined);
  check('…and is recorded as not worth protecting', c._autosaveStoredHasContent === false);
}
{
  const c = harness({ store: { 'safetyLab.autosave.v1': JSON.stringify(FULL()) }, cached: true, snapshot: EMPTY });
  vm.runInContext('discardAutosave(); _recoveryHoldBegin(); _writeAutosave();', c);
  check('after an explicit discard the refusal no longer guards the empty slot',
    c._autosaveStoredHasContent === false && c._store['safetyLab.autosave.v1'] !== undefined,
    'the user said the stored copy is not worth keeping — believe them');
}

console.log('\n[E1] the judgement is cached, not recomputed per write');
{
  const c = harness({ store: { 'safetyLab.autosave.v1': JSON.stringify(FULL()) }, snapshot: FULL });
  let reads = 0;
  const raw = c._store['safetyLab.autosave.v1'];
  vm.runInContext('_writeAutosave();', c);
  check('a content-bearing write updates the cached judgement to true',
    c._autosaveStoredHasContent === true);
  vm.runInContext('_snapshotProject = ' + EMPTY.toString() + '; _writeAutosave();', c);
  check('an allowed empty write updates it to false',
    c._autosaveStoredHasContent === false,
    'a stale true would refuse the NEXT legitimate empty write');
  check('the stored payload really is the empty one now',
    JSON.parse(c._store['safetyLab.autosave.v1']).acFhaData.length === 0);
  void reads; void raw;
}

console.log('\n[E1] the old contract is intact');
{
  const c = harness({ snapshot: FULL });
  vm.runInContext('_autosaveSuspended = true; _writeAutosave();', c);
  check('_autosaveSuspended still short-circuits the write, first thing',
    c._store['safetyLab.autosave.v1'] === undefined,
    'project load / sample load rely on this and it must not have moved');
}
{
  const c = harness({ snapshot: FULL, idbAvailable: true });
  vm.runInContext('_writeAutosave();', c);
  check('the localStorage mirror is still written', c._store['safetyLab.autosave.v1'] !== undefined);
  check('_autosavePending is still cleared by a dispatched write', c._autosavePending === false);
}
{
  const c = harness({ snapshot: FULL, quota: true, idbAvailable: true });
  vm.runInContext('_writeAutosave();', c);
  check('a localStorage quota failure is still non-fatal when IndexedDB is available',
    c._indicator === 'saved',
    'a large project lives only in IDB — that path must not regress to error');
}

console.log('\n[E1] the guard cannot strand autosave');
check('the refusal never touches _autosaveSuspended', (() => {
  const w = fn(helpers, '_writeAutosave') || '';
  const seg = w.slice(w.indexOf('_autosaveRecoveryPending'));
  return seg.indexOf('_autosaveSuspended') < 0;
})(), 'reusing the general suspend flag is what would make a stuck window fatal');
// (the "released on BOTH outcomes" check moved into the async block below and
//  is now BEHAVIOURAL — it was a source-shape pin, which is the exact failure
//  mode that let a dead scope picker through the wall earlier tonight. The
//  pinned text stopped matching the moment the same code was refactored, while
//  the behaviour it was supposed to guard was still correct: a pin that breaks
//  on a rename proves nothing about whether the window actually closes.)
check('the synchronous path closes the window before returning', (() => {
  const b = fn(dataOps, 'checkAutosaveRecovery') || '';
  return /return;\s*\n\s*\}\s*\n\s*_recoveryHoldEnd\(\);/.test(b);
})());

console.log('\n[E1 part 3] the last-good slot — content-gated and THROTTLED');
{
  const c = harness({ snapshot: FULL });
  vm.runInContext('_writeAutosave();', c);
  check('a content-bearing write lays down a last-good copy',
    JSON.parse(c._store['safetyLab.autosave.lastgood.v1']).acFhaData.length === 1);
  const firstStamp = c._lastgoodLastWrite;
  const firstMirror = c._store['safetyLab.autosave.lastgood.v1'];
  check('…and stamps when it did so', firstStamp > 0);
  // An immediate second write must NOT re-mirror. Asserting on the STAMP alone
  // is too weak — two writes in the same millisecond produce the same stamp, so
  // a removed throttle would look identical. Change the CONTENT instead: if the
  // mirror re-ran, the stored copy would follow the new snapshot.
  vm.runInContext('_snapshotProject = function () { return { projectName: "SECOND",' +
                  ' acFhaData: [{id:1},{id:2},{id:3}], ftaPages: [{root:{id:"g"}}] }; }; _writeAutosave();', c);
  check('a second write seconds later does NOT re-mirror — this is the whole cost argument',
    c._store['safetyLab.autosave.lastgood.v1'] === firstMirror &&
    JSON.parse(c._store['safetyLab.autosave.lastgood.v1']).acFhaData.length === 1,
    'mirroring every save would double the write cost of a 4.5 MB project');
  check('…while the PRIMARY slot did follow the new snapshot',
    JSON.parse(c._store['safetyLab.autosave.v1']).acFhaData.length === 3,
    'the throttle must slow the mirror only, never the real save');
}
{
  const c = harness({ snapshot: FULL, lastgoodLastWrite: 1 });   // ancient stamp ⇒ interval elapsed
  vm.runInContext('_writeAutosave();', c);
  check('once the interval has elapsed the mirror is refreshed',
    c._lastgoodLastWrite > 1 && c._store['safetyLab.autosave.lastgood.v1'] !== undefined);
}
{
  const c = harness({ snapshot: EMPTY });
  vm.runInContext('_writeAutosave();', c);
  check('an EMPTY snapshot never becomes the last-good copy',
    c._store['safetyLab.autosave.lastgood.v1'] === undefined,
    'a last-good slot holding nothing is the original bug, one slot over');
}
{
  // the mirror must never be able to break the primary write
  const c = harness({ snapshot: FULL });
  vm.runInContext('_writeLastGood = function () { throw new Error("mirror exploded"); }; _writeAutosave();', c);
  check('a mirror that throws does not take the primary write down with it',
    JSON.parse(c._store['safetyLab.autosave.v1']).acFhaData.length === 1 && c._indicator === 'saved',
    'a backup that can break the thing it backs up is worse than no backup');
}

console.log('\n[E1 part 3] the offer — never a silent restore');
{
  const c = harness({ store: { 'safetyLab.autosave.lastgood.v1': JSON.stringify(FULL()),
                               'safetyLab.autosave.lastgood.meta.v1': JSON.stringify({ ts: Date.now() - 300000 }) } });
  vm.runInContext('checkAutosaveRecovery();', c);
  check('an empty primary + a good last-good raises the banner', c._banners.length === 1);
  check('…and does NOT silently apply it', c._applied === undefined,
    'quietly resurrecting an old project over a genuinely new one is the same bug wearing a hat');
  check('…the banner offers a restore and a dismiss',
    /recoverLastGood\(\)/.test(c._banners[0].innerHTML) && /discardLastGood\(\)/.test(c._banners[0].innerHTML));
  check('…and says how old the snapshot is', /min ago/.test(c._banners[0].innerHTML));
  vm.runInContext('recoverLastGood();', c);
  check('clicking restore applies it', !!c._applied && c._applied.acFhaData.length === 1);
}
{
  const c = harness({ store: { 'safetyLab.autosave.v1': JSON.stringify(FULL()),
                               'safetyLab.autosave.meta.v1': JSON.stringify({ ts: 3 }),
                               'safetyLab.autosave.lastgood.v1': JSON.stringify(FULL()) } });
  vm.runInContext('checkAutosaveRecovery();', c);
  check('a primary that DID restore raises no banner', c._banners.length === 0,
    'the offer is for when the current snapshot had nothing to give');
}
{
  const c = harness({ store: { 'safetyLab.autosave.lastgood.v1': JSON.stringify(EMPTY()) } });
  vm.runInContext('checkAutosaveRecovery();', c);
  check('an EMPTY last-good raises no banner', c._banners.length === 0);
}
{
  const c = harness({ store: { 'safetyLab.autosave.lastgood.v1': '{{{ corrupt' } });
  vm.runInContext('checkAutosaveRecovery();', c);
  check('a corrupt last-good raises no banner and does not throw', c._banners.length === 0);
}
{
  const c = harness({ store: { 'safetyLab.autosave.lastgood.v1': JSON.stringify(FULL()),
                               'safetyLab.autosave.lastgood.meta.v1': JSON.stringify({ ts: Date.now() }) } });
  vm.runInContext('checkAutosaveRecovery(); discardLastGood();', c);
  check('dismissing the offer does NOT destroy the snapshot',
    c._store['safetyLab.autosave.lastgood.v1'] !== undefined,
    '"not now" is not "delete my only other copy"');
}

console.log('\n[E1] it actually loads');
{
  const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const pin = (f, floor) => {
    const m = idx.match(new RegExp(f.replace('.', '\\.') + '\\?v=([\\d.]+)'));
    return m && parseFloat(m[1]) >= floor;
  };
  check('index.html pins data_ops_modules.js >= 66.17', pin('data_ops_modules.js', 66.17));
  check('index.html pins helpers_modules.js >= 2.52', pin('helpers_modules.js', 2.52));
  check('index.html pins bindings_modules.js >= 1.26', pin('bindings_modules.js', 1.26),
    'the three flags are DECLARED here — a cached copy means a ReferenceError at boot, ' +
    'which would take the whole app down, not just autosave');
}

// ---- checks that have to wait for a promise ---------------------------------
// Everything above is synchronous. These three are not, and they are the ones
// that matter most: they cover the ASYNC IndexedDB paths, which is where the
// 26 Aug race lived. Asserting them synchronously would pass while proving
// nothing, so they run here and the exit code waits for them.
const settle = () => new Promise(r => setTimeout(r, 0));

(async () => {
  console.log('\n[E1] the async IndexedDB paths, awaited');
  {
    // the hold must close even when IndexedDB REJECTS
    const c = harness({ idbAvailable: true });
    vm.runInContext('SLDB.get = function () { return Promise.reject(new Error("idb down")); };' +
                    'checkAutosaveRecovery();', c);
    check('window still open while the IndexedDB read is in flight', c._autosaveRecoveryPending === true);
    await settle(); await settle();
    check('a REJECTED IndexedDB read still closes the recovery window',
      c._autosaveRecoveryPending === false,
      'a window that never closes would leave the refusal armed for the whole session');
  }
  {
    // the hold must close when IndexedDB resolves with nothing
    const c = harness({ idbAvailable: true });
    vm.runInContext('checkAutosaveRecovery();', c);
    await settle(); await settle();
    check('an empty IndexedDB result closes the window too', c._autosaveRecoveryPending === false);
  }
  {
    // last-good mirror reaches IndexedDB even when localStorage is over quota
    const c = harness({ snapshot: FULL, quota: true, idbAvailable: true });
    vm.runInContext('_writeAutosave();', c);
    await settle(); await settle();
    check('a localStorage quota failure does not stop the IndexedDB last-good copy',
      c._idb['safetyLab.autosave.lastgood.v1'] !== undefined,
      'large projects live only in IDB — that is exactly when a backup matters most');
    check('…and the mirror is still stamped, so the throttle holds', c._lastgoodLastWrite > 0);
  }

  console.log('\n[boot durability] a blank write BEFORE recovery starts cannot clobber a good copy');
  {
    // The 2 Sep 2026 regression: on refresh the app comes up blank and a blank
    // autosave fires in early boot — BEFORE checkAutosaveRecovery() runs, so
    // _autosaveRecoveryPending is still false and the E1 window has not opened.
    // With _bootRecoveryHasRun false, _writeAutosave must refuse it outright.
    const c = harness({ store: { 'safetyLab.autosave.v1': JSON.stringify(FULL()),
                                'safetyLab.autosave.meta.v1': JSON.stringify({ ts: 1, size: 99 }) },
                        snapshot: EMPTY, idbAvailable: true, bootRecoveryHasRun: false });
    vm.runInContext('_writeAutosave();', c);      // NO _recoveryHoldBegin() — that is the gap
    await settle(); await settle();
    const stored = JSON.parse(c._store['safetyLab.autosave.v1']);
    check('the stored project SURVIVES a blank write fired before recovery ran',
      Array.isArray(stored.acFhaData) && stored.acFhaData.length === 1,
      'the exact clobber that made a hard refresh land blank + a manual Restore banner');
    check('IndexedDB is likewise untouched by the pre-recovery blank write',
      c._idb['safetyLab.autosave.v1'] === undefined,
      'the write returned before either store was touched — both are protected');
    check('the indicator reads saved (an empty project has nothing to save)',
      c._indicator === 'saved');
  }
  {
    // The guard must NOT strand normal blanking: once recovery has RUN, a
    // deliberately emptied project (createNewProject) persists exactly as before.
    const c = harness({ store: { 'safetyLab.autosave.v1': JSON.stringify(FULL()),
                                'safetyLab.autosave.meta.v1': JSON.stringify({ ts: 1, size: 99 }) },
                        snapshot: EMPTY, bootRecoveryHasRun: true });
    vm.runInContext('_writeAutosave();', c);
    const stored = JSON.parse(c._store['safetyLab.autosave.v1']);
    check('after recovery has run, a deliberate blank persists (guard does not over-block)',
      Array.isArray(stored.acFhaData) && stored.acFhaData.length === 0,
      'refusing empty writes forever would be a worse bug than the one being fixed');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

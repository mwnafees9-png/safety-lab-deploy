/* local_store.js (SLLocalStore v1.0, 10 Nov 2026): browser storage that cannot fill up and stop a sign-in.
 *
 * Waqas's brief, 10 Nov 2026: "Sign-in fails with 'exceeded the quota' when browser storage is full. The sign-in token
 * write must never fail (free caches first, recover and retry), and no raw setItem error may reach the user. Move large
 * data to IndexedDB with a one-time migration that loses nothing: autosaves (safetyLab.autosave.v1 and
 * safetyLab.autosave.lastgood.v1), slab.r4.export, slab.golden.run1.backup, slab.campaign.v1, slab.r4.fha.draft, the
 * _ev items, and the local co-editing docs. localStorage keeps only small settings."
 *
 * The rule: localStorage (about 5 MB per site, shared by everything) holds small settings only. Projects, backups,
 * drafts and exports live in IndexedDB (the same database the autosave already used, safetyLabAero / kv), which holds
 * hundreds of megabytes.
 *   migrate()    once per browser (and again whenever space runs out): every large item still in localStorage is copied
 *                into IndexedDB, read back and compared, and only then removed from localStorage. An autosave copy is
 *                made the current autosave only when it is newer than the one IndexedDB already has; every item, newer
 *                or not, is also kept as it was under 'moved-from-localStorage:<key>', so nothing is ever lost.
 *   setItem(k,v) a localStorage write that never throws: when space runs out it frees the AI answer cache (rebuilt on
 *                demand), moves the large items out, and tries again. It answers true or false.
 *   authStorage  the storage the sign-in uses for its token (Supabase's auth.storage). Its write cannot fail: when
 *                localStorage is still full after freeing space, the token is kept in IndexedDB and in memory, and
 *                read back from there. Nothing it does throws, so a full browser never shows a raw storage error.
 *   plainError(e) the words for a storage error, for anywhere one could otherwise reach the person.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0';
  var DB = 'safetyLabAero', STORE = 'kv';            // the same database and store as SLDB (engine_modules.js)
  var MOVED = 'moved-from-localStorage:';
  var LS_DONE = 'safetyLab.store.migrated.v1';
  // the large items, by name; autosave slots also become the current IndexedDB copy when newer
  var AUTOSAVE_PAIRS = [['safetyLab.autosave.v1', 'safetyLab.autosave.meta.v1'], ['safetyLab.autosave.lastgood.v1', 'safetyLab.autosave.lastgood.meta.v1']];
  var BIG_EXACT = ['safetyLab.autosave.v1', 'safetyLab.autosave.lastgood.v1', 'slab.r4.export', 'slab.golden.run1.backup', 'slab.campaign.v1', 'slab.r4.fha.draft'];
  function isBig(k) {
    k = String(k || '');
    if (BIG_EXACT.indexOf(k) >= 0) return true;
    if (/_ev(?:$|[._:-])/.test(k)) return true;                  // the evaluation items (…_ev, …_ev.N, …_ev:x)
    if (k.indexOf('slab-crdt-') === 0) return true;               // local co-editing docs kept in localStorage by older builds
    return false;
  }
  // regenerable caches, freed first when space runs out (the AI answer cache rebuilds on the next request)
  function isCache(k) { k = String(k || ''); return k.indexOf('slai.cache.') === 0; }

  function ls() { try { return root.localStorage || null; } catch (_) { return null; } }
  function keys() { var s = ls(), out = []; if (!s) return out; try { for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k != null) out.push(k); } } catch (_) {} return out; }
  function isQuota(e) { var m = String((e && (e.name + ' ' + e.message)) || ''); return /quota|QUOTA_EXCEEDED|NS_ERROR_DOM_QUOTA/i.test(m) || (e && (e.code === 22 || e.code === 1014)); }
  function plainError(e) {
    if (isQuota(e)) return 'This browser\'s storage for Safety Lab Aero is full. Your projects are safe; close other Safety Lab Aero tabs and try again.';
    return 'This browser would not save that. Try again; if it keeps happening, reload the page.';
  }

  // ---- IndexedDB (own handle, so it works before engine_modules.js loads) ----------------------------------------
  var _dbp = null;
  function idbOk() { try { return typeof root.indexedDB !== 'undefined' && !!root.indexedDB; } catch (_) { return false; } }
  function open() {
    if (_dbp) return _dbp;
    _dbp = new Promise(function (res, rej) {
      var req; try { req = root.indexedDB.open(DB, 1); } catch (e) { return rej(e); }
      req.onupgradeneeded = function () { try { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); } catch (_) {} };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
    _dbp.catch(function () { _dbp = null; });
    return _dbp;
  }
  function idbGet(k) { return open().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction(STORE, 'readonly'), r = t.objectStore(STORE).get(k); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }); }
  function idbSet(k, v) { return open().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = function () { res(true); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error); }; }); }); }
  function idbDel(k) { return open().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(k); t.oncomplete = function () { res(true); }; t.onerror = function () { rej(t.error); }; }); }); }

  function metaTs(m) { if (typeof m === 'string') { try { m = JSON.parse(m); } catch (_) { m = null; } } return (m && m.ts) || 0; }
  // a stored autosave may be gzip-compressed (#44); it counts as present, its timestamp is in the meta
  async function moveOne(k) {
    var s = ls(); if (!s) return false;
    var v; try { v = s.getItem(k); } catch (_) { return false; }
    if (v == null) return true;
    await idbSet(MOVED + k, v);
    var back = await idbGet(MOVED + k);
    if (back !== v) return false;                                 // not proven safe: leave it where it is
    var pair = null; AUTOSAVE_PAIRS.forEach(function (p) { if (p[0] === k) pair = p; });
    if (pair) {
      var lsMeta = null; try { lsMeta = s.getItem(pair[1]); } catch (_) {}
      var have = null, haveMeta = null; try { have = await idbGet(k); haveMeta = await idbGet(pair[1]); } catch (_) {}
      if (!have || metaTs(lsMeta) > metaTs(haveMeta)) {
        await idbSet(k, v);
        if (lsMeta != null) { var mo = lsMeta; try { mo = JSON.parse(lsMeta); } catch (_) {} await idbSet(pair[1], mo); }
        if ((await idbGet(k)) !== v) return false;
      }
    }
    try { s.removeItem(k); } catch (_) {}
    return true;
  }
  var _moving = null;
  function moveBig() {
    if (_moving) return _moving;
    _moving = (async function () {
      var moved = [], kept = [];
      if (!idbOk()) return { moved: moved, kept: keys().filter(isBig) };
      var big = keys().filter(isBig);
      for (var i = 0; i < big.length; i++) { var ok = false; try { ok = await moveOne(big[i]); } catch (_) { ok = false; } (ok ? moved : kept).push(big[i]); }
      return { moved: moved, kept: kept };
    })();
    _moving.then(function () { _moving = null; }, function () { _moving = null; });
    return _moving;
  }
  function freeCaches() { var s = ls(), n = 0; if (!s) return 0; keys().filter(isCache).forEach(function (k) { try { s.removeItem(k); n++; } catch (_) {} }); return n; }
  async function migrate() {
    var r = await moveBig();
    if (!r.kept.length) { try { ls() && ls().setItem(LS_DONE, String(Date.now())); } catch (_) {} }
    try { root.dispatchEvent(new CustomEvent('slab-store-migrated', { detail: r })); } catch (_) {}
    return r;
  }

  // ---- writes that never throw ------------------------------------------------------------------------------------
  function trySet(k, v) { var s = ls(); if (!s) return false; try { s.setItem(k, v); return true; } catch (e) { return isQuota(e) ? null : false; } }
  // synchronous: frees the AI answer cache and retries; the large items move out in the background
  function setItem(k, v) {
    v = String(v);
    var r = trySet(k, v); if (r !== null) return r;
    freeCaches(); r = trySet(k, v); if (r !== null) return r;
    try { moveBig(); } catch (_) {}
    return false;
  }
  // asynchronous: also waits for the large items to move out, then retries
  async function setItemAsync(k, v) {
    v = String(v);
    if (setItem(k, v)) return true;
    try { await moveBig(); } catch (_) {}
    return trySet(k, v) === true;
  }

  // ---- the sign-in token's storage -------------------------------------------------------------------------------
  var _mem = {};
  var AUTH_IDB = 'auth-token:';
  var authStorage = {
    getItem: function (k) {
      if (Object.prototype.hasOwnProperty.call(_mem, k)) return _mem[k];
      var s = ls(), v = null; try { v = s ? s.getItem(k) : null; } catch (_) { v = null; }
      if (v != null) return v;
      if (!idbOk()) return null;
      return idbGet(AUTH_IDB + k).then(function (x) { return x == null ? null : x; }, function () { return null; });
    },
    setItem: async function (k, v) {
      v = String(v);
      _mem[k] = v;                                                // the token is in use from this moment, whatever storage says
      var ok = false; try { ok = await setItemAsync(k, v); } catch (_) { ok = false; }
      if (ok) { delete _mem[k]; try { if (idbOk()) await idbDel(AUTH_IDB + k); } catch (_) {} return; }
      try { if (idbOk()) await idbSet(AUTH_IDB + k, v); } catch (_) {}   // still full: keep it where there is room
    },
    removeItem: async function (k) {
      delete _mem[k];
      try { var s = ls(); if (s) s.removeItem(k); } catch (_) {}
      try { if (idbOk()) await idbDel(AUTH_IDB + k); } catch (_) {}
    }
  };

  var api = { VERSION: VERSION, isBig: isBig, isCache: isCache, migrate: migrate, moveBig: moveBig, freeCaches: freeCaches, setItem: setItem, setItemAsync: setItemAsync, authStorage: authStorage, plainError: plainError, isQuota: isQuota, MOVED: MOVED, LS_DONE: LS_DONE, _idbGet: idbGet };
  try { root.SLLocalStore = api; } catch (_) {}
  // once per browser at load (and the next load after anything could not move yet)
  try { var s0 = ls(); if (s0 && !s0.getItem(LS_DONE) && idbOk()) migrate(); else if (keys().some(isBig) && idbOk()) migrate(); } catch (_) {}
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

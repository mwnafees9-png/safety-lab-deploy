/* crdt_sync.js — Phase 1: real-time co-authoring foundation (Yjs CRDT over Supabase Realtime).
 *
 * FLAG-GATED, and DEFAULT ON — see flagOn() below. Until 5 Sep 2026 this header described the
 * module as dormant until switched on, which had been false since the flag was inverted: flagOn()
 * returns true
 * unless something explicitly turns it OFF (window.SafetyLabAI.crdt=false, ?crdt=0, or
 * localStorage SLA_CRDT='0'). Corrected 5 Sep 2026. Which posture is INTENDED is still Waqas's
 * call (register O-7, open since 31 Aug); this comment now describes what the code does rather
 * than what someone once meant it to do, because a file that argues with itself is how the ITAR
 * fence below went unnoticed for weeks.
 *
 * Does not run for ITAR-controlled projects — and as of 5 Sep 2026 that is actually true; see
 * _itar(). Requires a Supabase session + an active cloud project. Loads Yjs (window.Y) lazily from vendor/yjs.min.js — if the
 * bundle is missing or the flag is off, this module does nothing and the app is unaffected.
 *
 * v1 scope: item-level merge for the aircraft-level flat tables (functions / FHA / requirements),
 * proving the loop. Persistence + more collections + fault trees follow (see Phase 1 spec).
 *
 * Model coupling lives in safety_lab.js via window.__crdtCapture() / window.__crdtApply(partial);
 * this module is model-agnostic (Y.Doc + transport + per-item diff/merge only).
 */
(function () {
  'use strict';

  // Collections synced in v1 + their stable key field. MUST match __crdtCapture/__crdtApply.
  var COLLECTIONS = [
    { name: 'acFunctionsData',   key: 'subId' },
    { name: 'acFhaData',         key: 'internalId' },
    { name: 'acReqData',         key: 'internalId' },
    { name: 'acAssumptionsData', key: 'asmId' },
    { name: 'praData',           key: 'internalId' },
    { name: 'zsaData',           key: 'internalId' },
    { name: 'cmaData',           key: 'internalId' },
    { name: 'fmeaData',          key: 'internalId' },
    { name: 'acFcimData',        key: 'internalId' },
    { name: 'routingData',       key: 'internalId' },
    { name: 'resourcesData',     key: 'internalId' },
    { name: 'itemsData',         key: 'internalId' },
    { name: 'flightPhasesData',  key: 'phase' },
    { name: 'systemsData',       key: 'id' },
    { name: 'ftaPages',          key: 'id' }   // page-level merge (whole-page value); node-level = future
  ];

  // WHOLE-VALUE stores (7 Sep 2026 COL rebuild): single objects/strings, not row lists.
  // Merged last-write-wins via one Y.Map ('whole'), keyed by store name. Safe for settings
  // that a field lock guards while actively edited. Only stores with a clean repaint are
  // listed here; murkier ones (stpaData, ftaConfig, mirror objects) stay on the snapshot
  // backup until they get proper repaint handling. __crdtApply renders each on arrival.
  var WHOLE = ['projectConfig', 'mlData', 'projectName', 'stpaData'];  // stpaData added 9 Sep — repaint via window.STPA_PANEL.render()

  // COUNTERS (7 Sep 2026): id-minting counters (next ASM-N, FMEA-N, review, internalId).
  // Merged MAX (never backward) via one 'counters' Y.Map — two people adding at once must
  // not reissue the same number. Monotonic: pushLocal only ever raises the map value, and
  // __crdtApply takes max(local, incoming), so the loop converges to the true high-water mark.
  var COUNTERS = ['acAsmCounter', 'fmeaCounter', 'reviewCounter', 'internalIdCounter'];

  var Y = null, ydoc = null, chan = null, _client = null, _idb = null;
  var _started = false, _applying = false, _wsId = null, _projId = null;
  var _saveTimer = null, _pushTimer = null;
  // 31 Aug 2026 — adopt-model posture. An AUTHORITATIVE load (open-from-cloud,
  // server version restore) replaces the model wholesale; the CRDT doc must
  // MIRROR that model, not union stale local/server rows back into it. Without
  // this, the per-project IndexedDB doc resurrected a previous session's FHA
  // rows ~6s after a cloud load (reproduced live, 31 Aug: 0 -> 193 rows).
  // _adoptProj arms the NEXT start()-reconcile for that project (start is
  // async: Yjs load + idb whenSynced + server state); _adoptUntil turns any
  // pullToModel inside the window into a pushLocal, so the server-state merge
  // and early peer broadcasts cannot undo the adoption. Yjs tombstones the
  // deletes, so later merges of the same stale items stay deleted; items a
  // live peer creates AFTER the window merge normally.
  var ADOPT_WINDOW_MS = 15000;
  var _adoptProj = null, _adoptUntil = 0;

  // ---- Stage 2 (authoritative-CRDT) state ----------------------------------
  // FLAG-GATED, DEFAULT OFF (window.SL_CRDT_AUTHORITATIVE !== true). When OFF this
  // whole block is inert and adoptModel/start behave exactly as they did in Stage 1
  // (snapshot authoritative on open, CRDT mirrors). When ON, the live CRDT doc is
  // the source of truth on open and the whole-doc snapshot is a periodic BACKUP —
  // reconciled by a self-healing version STAMP so a stale CRDT copy can never win
  // over a newer snapshot. See safety-lab-sync design note (8 Sep 2026).
  var _reconcileProj = null;    // project awaiting a stamp-compare reconcile on the next start()
  var _reconcileVer = null;     // the snapshot version (_activeCloudDocVersion) captured at the open
  var _forceSeedProj = null;    // project that must snapshot-WIN regardless of stamp (a deliberate restore/rollback)
  var _tok = (function () { try { return (crypto.randomUUID ? crypto.randomUUID() : 'c' + Math.random().toString(36).slice(2)).slice(0, 8); } catch (_) { return 'c' + Date.now().toString(36).slice(-6); } })();

  // Default ON (further gated by _ready: signed-in + active cloud project + not ITAR). Kill-switch:
  // window.SafetyLabAI.crdt=false, ?crdt=0, or localStorage SLA_CRDT='0'.
  function flagOn() {
    try {
      if (window.SafetyLabAI && window.SafetyLabAI.crdt === false) return false;
      if (/[?&]crdt=0/.test(location.search)) return false;
      if (localStorage.getItem('SLA_CRDT') === '0') return false;
      return true;
    } catch (_) { return true; }
  }

  // ---- Stage 2 helpers (all no-ops / inert while the flag is OFF) -----------
  // The authority flag. DEFAULT OFF — absent flag = false = Stage 1 behavior.
  function authOn() {
    try { return (typeof window !== 'undefined') && window.SL_CRDT_AUTHORITATIVE === true; } catch (_) { return false; }
  }
  // The snapshot version the model was just loaded at. _activeCloudDocVersion is a
  // top-level `let` in bindings_modules.js (shared global lexical scope, like
  // projectConfig in _itar), so a typeof-guarded bare read reaches it without eval.
  function _docVer() {
    try {
      var E = (typeof SLEnv !== 'undefined') ? SLEnv : (typeof window !== 'undefined' ? window.SLEnv : null);
      if (E && typeof E.get === 'function') { var v = E.get('_activeCloudDocVersion'); if (v !== undefined) return (v == null ? null : v); }
    } catch (_) {}
    try { return (typeof _activeCloudDocVersion !== 'undefined' && _activeCloudDocVersion != null) ? _activeCloudDocVersion : null; } catch (_) { return null; }
  }
  // The self-healing STAMP: the project_documents.version this CRDT doc was last
  // reconciled against. Lives INSIDE the Yjs doc (meta Y.Map) so it travels with the
  // doc through idb + server persistence and merges LWW like any Y.Map value.
  function _stampGet() { try { return ydoc ? ydoc.getMap('meta').get('docVersion') : null; } catch (_) { return null; } }
  function _stampSet(v) { try { if (ydoc && typeof v === 'number') ydoc.getMap('meta').set('docVersion', v); } catch (_) {} }

  // The reconcile decision, run on open when the flag is ON. The model already holds
  // the snapshot at version V. SEED (snapshot -> CRDT, protected by the adopt window)
  // when the snapshot is newer-or-unstamped (legacy project, a non-CRDT writer, or a
  // deliberate restore) — worst case this is exactly Stage 1's snapshot-wins. PULL
  // (CRDT -> model) only when the stamp PROVES the CRDT doc is at least as fresh as
  // snapshot V, so a live teammate's merged edit wins instead of being tombstoned.
  function _reconcileAuth(force, V) {
    if (V == null) V = _docVer();
    var stamp = _stampGet();
    var seed = force || stamp == null || (V != null && V > stamp);
    if (seed) {
      _adoptUntil = Date.now() + ADOPT_WINDOW_MS;     // protect the seed from a stale server-union pull
      try { pushLocal(); } catch (_) {}
      if (V != null) _stampSet(V);
    } else {
      _adoptUntil = 0;
      try { pullToModel(); } catch (_) {}
    }
  }

  // Called by the ONE snapshot writer (cloud_writer) and the silent autosave
  // (cloud_sync) after a CONFIRMED write at version N. Advances the stamp so the
  // CRDT doc stays in lockstep with the backup: after this, CRDT is known to be at
  // least as fresh as snapshot N. MAX-merge (never regress). Inert while flag OFF.
  function noteSnapshotVersion(projId, version) {
    try {
      if (!authOn() || !ydoc || _projId !== projId || typeof version !== 'number') return;
      var cur = _stampGet();
      if (cur == null || version > cur) _stampSet(version);
    } catch (_) {}
  }
  // 5 Sep 2026 — THIS FENCE HAD NEVER FIRED ONCE.
  // `projectConfig` is a top-level `let` in a classic script (bindings_modules.js),
  // so it lives in the global LEXICAL environment and `window.projectConfig` is
  // permanently undefined — the same trap sl_env.js was written for. This
  // function therefore returned false for every project, including ITAR ones,
  // while the file header promised it "NEVER runs for ITAR-controlled projects".
  // Read through SLEnv, which is the one supported way to reach app state, and
  // do NOT use eval to reach it (the production CSP blocks eval — that is what
  // hollowed out lock_seal.js).
  //
  // AND IT FAILS CLOSED. If the accessor is unavailable the answer is "treat it
  // as controlled" and collaboration stays off. Fail-open is defensible for an
  // outage and indefensible for a controlled-data fence; a missing SLEnv means
  // the build is broken anyway, and a broken build must not start syncing an
  // ITAR project.
  function _itar() {
    try {
      // Order matters. SLEnv is the supported accessor and the only one that
      // works in every build. The BARE IDENTIFIER is the real variable — these
      // are classic scripts sharing one global lexical scope, which is exactly
      // why `window.projectConfig` was always undefined — and `typeof` guards it
      // without eval (the production CSP blocks eval; that is what hollowed out
      // lock_seal.js). If NEITHER is reachable we treat the project as
      // controlled and stay out: fail-open is defensible for an outage and
      // indefensible for a controlled-data fence.
      var E = (typeof SLEnv !== 'undefined') ? SLEnv : (typeof window !== 'undefined' ? window.SLEnv : null);
      if (E && typeof E.get === 'function') {
        var pc = E.get('projectConfig');
        if (pc !== undefined) return !!(pc && pc.isITARControlled);
      }
      if (typeof projectConfig !== 'undefined') {
        return !!(projectConfig && projectConfig.isITARControlled);
      }
      return true;                                              // fail CLOSED
    } catch (_) { return true; }                                // fail CLOSED
  }
  function _signedIn()  { try { return typeof window.isSupabaseSignedIn === 'function' && window.isSupabaseSignedIn(); } catch (_) { return false; } }
  function _proj()      { try { return (typeof window.getActiveCloudProjectId === 'function' && window.getActiveCloudProjectId()) || null; } catch (_) { return null; } }
  function _ws()        { try { return (typeof window.getActiveWorkspaceId === 'function' && window.getActiveWorkspaceId()) || null; } catch (_) { return null; } }
  function _ready()     { return flagOn() && !_itar() && _signedIn() && !!_proj() && !!_ws(); }

  // H-5 (31 Aug 2026) — THE PROJECT-SWITCH WINDOW. refresh() polls every 6s, so
  // between the moment the app adopts a different project and the next tick,
  // _started is still true and ydoc is still bound to the PREVIOUS project's
  // IndexedDB store (slab-crdt-<oldId>) and Realtime channel. Anything that
  // fires in that window crosses the streams: a debounced pushLocal writes the
  // NEW project's rows into the OLD project's doc — and broadcasts them to
  // whoever is editing that project — while a pullToModel applies the OLD
  // project's rows onto the NEW model. adoptModel() now collapses the window to
  // zero for the paths that cause it, but the invariant is cheap and belongs at
  // the two functions that move data, because any future caller can re-open it.
  // Reads as stale when the doc's project is not the app's current project,
  // INCLUDING when the app has no cloud project at all (closing a project must
  // not flush the local model into the doc it just left).
  function _docStale()  { return _projId != null && _proj() !== _projId; }

  // base64 <-> Uint8Array (chunked so big updates don't blow the call stack)
  function b64enc(u8) { var s = '', C = 0x8000; for (var i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C)); return btoa(s); }
  function b64dec(b)  { var s = atob(b), u8 = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; }

  function loadYjs(cb) {
    if (window.Y) { Y = window.Y; return cb(true); }
    var s = document.createElement('script');
    s.src = 'vendor/yjs.min.js'; s.async = true;
    s.onload  = function () { Y = window.Y || null; cb(!!Y); };
    s.onerror = function () { try { console.warn('[CRDT] Yjs bundle missing — run build-yjs.sh.'); } catch (_) {} cb(false); };
    (document.head || document.documentElement).appendChild(s);
  }

  // ---- model <-> Y.Doc -------------------------------------------------------
  function pushLocal() {
    if (!ydoc || _applying) return;
    if (_docStale()) return;                          // H-5: never write this model into another project's doc
    var cap; try { cap = window.__crdtCapture ? window.__crdtCapture() : null; } catch (_) { cap = null; }
    if (!cap) return;
    ydoc.transact(function () {
      COLLECTIONS.forEach(function (c) {
        var arr = cap[c.name] || [];
        var map = ydoc.getMap('col:' + c.name);
        var ord = ydoc.getMap('ord:' + c.name);   // key -> order index. KEYED (not a Y.Array) so two
        var live = {};                             // peers seeding the same keys can't duplicate order.
        arr.forEach(function (item, i) {
          // 7 Sep 2026 (COL rebuild) — NEVER collapse keyless rows. A row whose stable
          // key is missing/blank would stringify to "undefined" and every such row would
          // overwrite the last into one slot (silent row loss). Skip it from live-merge —
          // the snapshot backup still carries it — rather than corrupt the map. A no-op for
          // collections whose rows always carry their key (the original 10).
          var kv = item ? item[c.key] : null;
          if (kv == null || kv === '') return;
          var k = String(kv);
          live[k] = 1;
          var next = JSON.stringify(item);
          if (map.get(k) !== next) map.set(k, next);
          if (ord.get(k) !== i)    ord.set(k, i);
        });
        Array.from(map.keys()).forEach(function (k) { if (!live[k]) map.delete(k); });
        Array.from(ord.keys()).forEach(function (k) { if (!live[k]) ord.delete(k); });
      });
      var wmap = ydoc.getMap('whole');
      WHOLE.forEach(function (name) {
        if (!(name in cap)) return;
        var next = JSON.stringify(cap[name] === undefined ? null : cap[name]);
        if (wmap.get(name) !== next) wmap.set(name, next);
      });
      var cmap = ydoc.getMap('counters');
      COUNTERS.forEach(function (name) {
        var v = cap[name];
        if (typeof v === 'number') { var cur = cmap.get(name); if (cur === undefined || v > cur) cmap.set(name, v); }
      });
      // typeCounters (object of per-node-type counts) — each key MAX-merged under 'tc:<type>'
      // in the same counters map, so two users adding different node types never collide.
      var tc = cap.typeCounters;
      if (tc && typeof tc === 'object') {
        Object.keys(tc).forEach(function (t) {
          var tv = tc[t];
          if (typeof tv === 'number') { var tk = 'tc:' + t; var tcur = cmap.get(tk); if (tcur === undefined || tv > tcur) cmap.set(tk, tv); }
        });
      }
    }, 'local');
  }

  function pullToModel() {
    if (!ydoc) return;
    if (_docStale()) return;                          // H-5: never apply another project's rows onto this model
    if (_adoptUntil && Date.now() < _adoptUntil) { try { pushLocal(); } catch (_) {} return; }   // adopt window: model is authoritative
    var partial = {};
    COLLECTIONS.forEach(function (c) {
      var map = ydoc.getMap('col:' + c.name);
      var ord = ydoc.getMap('ord:' + c.name);
      // map keys are unique (dedupe is automatic); order by the keyed index map.
      var keys = Array.from(map.keys()).sort(function (a, b) {
        var oa = ord.get(a), ob = ord.get(b);
        return (oa != null ? oa : 1e9) - (ob != null ? ob : 1e9);
      });
      var arr = [];
      keys.forEach(function (k) { var v = map.get(k); if (v != null) { try { arr.push(JSON.parse(v)); } catch (_) {} } });
      partial[c.name] = arr;
    });
    var wmap = ydoc.getMap('whole');
    WHOLE.forEach(function (name) {
      if (wmap.has(name)) { try { partial[name] = JSON.parse(wmap.get(name)); } catch (_) {} }
    });
    var cmap = ydoc.getMap('counters');
    var counters = {};
    COUNTERS.forEach(function (name) { var v = cmap.get(name); if (typeof v === 'number') counters[name] = v; });
    partial.__counters = counters;
    var tcOut = {};
    Array.from(cmap.keys()).forEach(function (key) { if (key.indexOf('tc:') === 0) { var tv = cmap.get(key); if (typeof tv === 'number') tcOut[key.slice(3)] = tv; } });
    partial.__typeCounters = tcOut;
    _applying = true;
    try { if (window.__crdtApply) window.__crdtApply(partial); } finally { _applying = false; }
  }

  // ---- transport (Supabase Realtime broadcast) -------------------------------
  function _broadcast(event, payload) { try { if (chan) chan.send({ type: 'broadcast', event: event, payload: payload }); } catch (_) {} }
  function _applyRemote(b64) { try { Y.applyUpdate(ydoc, b64dec(b64), 'remote'); } catch (e) { try { console.warn('[CRDT] applyUpdate failed', e); } catch (_) {} } }

  function start() {
    if (_started || !_ready()) return;
    loadYjs(function (ok) {
      if (!ok || !_ready() || _started) return;
      try { _client = window.getSupabaseClient && window.getSupabaseClient(); } catch (_) { _client = null; }
      if (!_client) return;
      _wsId = _ws(); _projId = _proj();
      ydoc = new Y.Doc();
      ydoc.on('update', function (update, origin) {
        if (origin === 'local') _broadcast('yupdate', { u: b64enc(update), t: _tok });
        else if (origin !== _idb) pullToModel();   // idb-origin updates reconciled once after load
        if (origin !== _idb) _scheduleSave();       // don't re-save what we just read back from idb
        // H-1 (31 Aug 2026) — the GC ledger. `t` is the last time this project's
        // local doc changed; crdt_gc will not retire a doc unless the server is
        // confirmed to have caught up with this mark. Cheap, and it is the only
        // evidence that distinguishes "synced and idle" from "holds offline work".
        try { if (window.SafetyLabCRDTGC) window.SafetyLabCRDTGC.note(_projId, 't'); } catch (_) {}
      });
      _started = true;

      // Phase 2 — durable LOCAL persistence first (IndexedDB). Works with no network and survives a
      // reload/restart, so edits made offline are never lost; they merge on reconnect.
      _idb = null;
      try { if (Y.IndexeddbPersistence) _idb = new Y.IndexeddbPersistence('slab-crdt-' + _projId, ydoc); } catch (_) { _idb = null; }

      var afterLocal = function () {
        // ---- Stage 2 (flag ON): stamp-based reconcile. The MODEL already holds the
        // snapshot at version V; SEED when the snapshot is newer-or-unstamped (safe,
        // = Stage 1), PULL only when the stamp proves the CRDT doc is at least as fresh.
        if (authOn()) {
          var isTarget = (_reconcileProj != null && _reconcileProj === _projId);
          var force = isTarget && (_forceSeedProj === _projId);
          var V = isTarget ? _reconcileVer : null;
          _reconcileProj = null; _reconcileVer = null; _forceSeedProj = null;
          var seedFresh = function () {
            _adoptUntil = Date.now() + ADOPT_WINDOW_MS; try { pushLocal(); } catch (_) {}
            var vv = (V != null) ? V : _docVer(); if (vv != null) _stampSet(vv);
          };
          if (_docHasContent()) {
            _reconcileAuth(force, V);
            if (_online()) _goOnline();
          } else if (_online()) {
            _loadState(function (had) {
              if (!had) seedFresh(); else _reconcileAuth(force, V);
              if (!chan) _openChannel();
            });
          } else {
            seedFresh();
          }
          _renderOfflineBadge();
          try { console.info('[CRDT] (auth) active on slab-crdt:' + _wsId + ':' + _projId + ' stamp=' + _stampGet() + (_online() ? '' : ' (OFFLINE)')); } catch (_) {}
          return;
        }
        // ---- Stage 1 (flag OFF, DEFAULT): adopt-model posture, unchanged. -------
        // adopt-model: this start follows an authoritative load of _projId — the
        // MODEL is the working copy; the idb/server docs get mirrored to it.
        var adopt = (_adoptProj != null && _adoptProj === _projId);
        if (adopt) { _adoptProj = null; _adoptUntil = Date.now() + ADOPT_WINDOW_MS; }
        if (_docHasContent()) {
          // we have a local offline copy → it's the working doc; merge the server on top if online
          if (adopt) pushLocal(); else pullToModel();
          if (_online()) _goOnline();
        } else if (_online()) {
          // nothing local yet, online → let the server doc be authoritative (don't seed stale local)
          _loadState(function (had) {
            if (adopt || !had) pushLocal(); else pullToModel();
            if (!chan) _openChannel();
          });
        } else {
          // nothing local, offline → seed from whatever model is on this device
          pushLocal();
        }
        _renderOfflineBadge();
        try { console.info('[CRDT] active on slab-crdt:' + _wsId + ':' + _projId + (_online() ? '' : ' (OFFLINE — local only, will sync on reconnect)')); } catch (_) {}
      };
      if (_idb && _idb.whenSynced) _idb.whenSynced.then(afterLocal).catch(afterLocal);
      else afterLocal();
    });
  }

  // Bring a started session online: merge the latest server doc, ensure the live channel is up, and
  // re-handshake so edits made while offline propagate to peers. Idempotent (CRDT union, no overwrite).
  function _goOnline() {
    if (!_started || !_client || !_online()) return;
    _loadState(function () {});
    if (!chan) { _openChannel(); }
    else {
      try { _broadcast('ysync1', { sv: b64enc(Y.encodeStateVector(ydoc)), t: _tok }); } catch (_) {}
      setTimeout(function () { try { _broadcast('yupdate', { u: b64enc(Y.encodeStateAsUpdate(ydoc)), t: _tok }); } catch (_) {} }, 400);
    }
    _renderOfflineBadge();
  }

  function _online() { try { return navigator.onLine !== false; } catch (_) { return true; } }
  function _docHasContent() { try { return COLLECTIONS.some(function (c) { return ydoc.getMap('col:' + c.name).size > 0; }); } catch (_) { return false; } }
  function _renderOfflineBadge() {
    var show = _started && !_online();
    var el = document.getElementById('crdt-offline');
    if (!show) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'crdt-offline';
      el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483600;background:#fff4e5;color:#7a4b00;border:1px solid #f0c878;border-radius:10px;padding:8px 12px;font-size:12.5px;box-shadow:0 6px 20px rgba(0,0,0,.15);';
      el.textContent = '⚡ Offline — changes save on this device and sync when you reconnect.';
      document.body.appendChild(el);
    }
  }

  function _openChannel() {
    chan = _client.channel('slab-crdt:' + _wsId + ':' + _projId, { config: { broadcast: { self: false } } });
    chan.on('broadcast', { event: 'yupdate' }, function (m) { if (m && m.payload && m.payload.u) _applyRemote(m.payload.u); });
    chan.on('broadcast', { event: 'ysync1' }, function (m) {
      if (!m || !m.payload || !m.payload.sv) return;
      try { _broadcast('yupdate', { u: b64enc(Y.encodeStateAsUpdate(ydoc, b64dec(m.payload.sv))), t: _tok }); } catch (_) {}
    });
    chan.subscribe(function (status) {
      if (status !== 'SUBSCRIBED') return;
      // ask peers for what we're missing, then push our full state so peers get our unique data
      try { _broadcast('ysync1', { sv: b64enc(Y.encodeStateVector(ydoc)), t: _tok }); } catch (_) {}
      setTimeout(function () { try { _broadcast('yupdate', { u: b64enc(Y.encodeStateAsUpdate(ydoc)), t: _tok }); } catch (_) {} }, 800);
    });
  }

  // ---- persistence (project_crdt) -------------------------------------------
  function _loadState(cb) {
    try {
      _client.from('project_crdt').select('state').eq('project_id', _projId).maybeSingle()
        .then(function (res) {
          var st = res && res.data && res.data.state;
          if (st) { try { Y.applyUpdate(ydoc, b64dec(st), 'persist'); return cb(true); } catch (_) {} }
          cb(false);
        })
        .catch(function () { cb(false); });
    } catch (_) { cb(false); }
  }
  function _scheduleSave() {
    if (_saveTimer) return;   // coalesce — at most one upsert per window
    _saveTimer = setTimeout(function () {
      _saveTimer = null;
      try {
        if (!_client || !ydoc || !_projId) return;
        var state = b64enc(Y.encodeStateAsUpdate(ydoc));
        _client.from('project_crdt')
          .upsert({ project_id: _projId, state: state, updated_at: new Date().toISOString() }, { onConflict: 'project_id' })
          .then(function (res) {
            // Only a resolved upsert with no error marks the server as caught up.
            // supabase-js resolves on a REST error too, so `res.error` is the check.
            if (res && res.error) return;
            var pid = _projId;
            try { if (window.SafetyLabCRDTGC) window.SafetyLabCRDTGC.note(pid, 's'); } catch (_) {}
          })
          .catch(function () {});
      } catch (_) {}
    }, 5000);
  }

  function stop() {
    try { clearTimeout(_pushTimer); } catch (_) {} _pushTimer = null;
    try { clearTimeout(_saveTimer); } catch (_) {} _saveTimer = null;
    try { if (chan) chan.unsubscribe(); } catch (_) {}
    chan = null;
    try { if (_idb && _idb.destroy) _idb.destroy(); } catch (_) {} _idb = null;
    try { if (ydoc) ydoc.destroy(); } catch (_) {}
    ydoc = null; _started = false;
    try { var b = document.getElementById('crdt-offline'); if (b) b.remove(); } catch (_) {}
  }

  // called from safety_lab.js scheduleAutosave() — debounced so rapid edits coalesce into one push
  function onLocalChange() {
    if (!_started || _applying) return;
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(function () { try { pushLocal(); } catch (_) {} }, 350);
  }

  // (re)start when workspace/project/eligibility changes
  function refresh() {
    var w = _ws(), p = _proj();
    if (_started && (w !== _wsId || p !== _projId || !_ready())) stop();
    if (!_started && _ready()) start();
  }

  // Called by _loadCloudProject / _applyServerRestore the moment they have
  // replaced the model: if CRDT is already live on that project, mirror NOW;
  // otherwise arm the next start()-reconcile. Either way the adopt window
  // covers the merges that follow.
  function adoptModel(opts) {
    var p = _proj();
    if (!p) return;
    var force = !!(opts && opts.force);   // a deliberate restore/rollback: snapshot must WIN even under the flag
    if (authOn()) {
      // Stage 2: reconcile the live CRDT doc against the just-loaded snapshot by STAMP.
      // Capture V now (= _activeCloudDocVersion, set by the caller just before this).
      _reconcileVer = _docVer();
      if (force) _forceSeedProj = p;
      if (_started && ydoc && _projId === p) {
        try { _reconcileAuth(force, _reconcileVer); } catch (_) {}
        _reconcileVer = null; _forceSeedProj = null;
      } else {
        _reconcileProj = p;                 // afterLocal reconciles (reads _reconcileVer/_forceSeedProj)
        if (_started && _projId !== p) { try { refresh(); } catch (_) {} }
      }
      return;
    }
    // Stage 1 (flag OFF, DEFAULT): adopt-window posture, unchanged.
    _adoptUntil = Date.now() + ADOPT_WINDOW_MS;
    if (_started && ydoc && _projId === p) { try { pushLocal(); } catch (_) {} _adoptProj = null; }
    else {
      _adoptProj = p;
      // H-5 — armed BEFORE refresh(), because refresh() stops the stale doc and
      // starts the new one, and start()'s reconcile reads _adoptProj to decide
      // mirror-vs-merge. Synchronous so the switch costs 0ms instead of up to
      // one 6s poll; refresh() is idempotent and no-ops when nothing changed.
      if (_started && _projId !== p) { try { refresh(); } catch (_) {} }
    }
  }

  window.SafetyLabCRDT = {
    start: start, stop: stop, refresh: refresh, onLocalChange: onLocalChange, enabled: flagOn, adoptModel: adoptModel,
    noteSnapshotVersion: noteSnapshotVersion, authoritative: authOn,
    status: function () { return { flag: flagOn(), authoritative: authOn(), stamp: _stampGet(), ready: _ready(), started: _started, yjs: !!window.Y, idb: !!_idb, online: _online(), ws: _wsId, project: _projId }; },
    _doc: function () { return ydoc; }
  };

  // Boot: if enabled, start once the app + session settle, and poll cheaply for ws/project changes.
  try {
    // Phase 2 — react to connectivity changes: merge + re-handshake on reconnect; badge on drop.
    window.addEventListener('online',  function () { try { if (_started) _goOnline(); else refresh(); } catch (_) {} });
    window.addEventListener('offline', function () { try { _renderOfflineBadge(); } catch (_) {} });
    window.addEventListener('load', function () {
      if (!flagOn()) return;
      setTimeout(refresh, 3500);
      setInterval(refresh, 6000);
    });
  } catch (_) {}
})();

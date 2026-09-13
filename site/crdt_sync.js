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
 * proving the loop. As of 11 Sep 2026 fault trees also merge at NODE level: each page is
 * decomposed into a shell + one record per node (keyed pageId:nodeId), so two people editing
 * different nodes of the same tree no longer overwrite each other (see _ftaDecompose below).
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
    { name: 'systemsData',       key: 'id' }
    // ftaPages is NOT in this generic list: fault trees get node-level merge below
    // (decomposed into a page shell + one record per node), so two people editing
    // different nodes of the SAME tree no longer overwrite each other.
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

  // --- fault-tree NODE-LEVEL merge -------------------------------------------
  // A fault-tree PAGE carries a nested node tree under .root. Storing the whole
  // page as one value made two people editing the SAME tree last-write-wins — one
  // editor's node change silently lost the other's. We DECOMPOSE each page into a
  // flat "shell" (page fields minus .root) plus one record per node, keyed
  // pageId:nodeId. Node ids come from internalIdCounter (already MAX-merged), so
  // the key is stable and collision-free. Editing DIFFERENT nodes now touches
  // DIFFERENT keys and both survive; the SAME node is last-write-wins (guard it
  // with a node lock). The whole-page snapshot backup is untouched — this changes
  // only the live representation. Pure (no model/DOM), so it unit-tests hard.
  var FTA_SHELL = 'ftaPages';   // col: page shells,  keyed by page id
  var FTA_NODE  = 'ftaNodes';   // col: flat nodes,   keyed by 'pageId:nodeId'

  function _ftaStrip(n) {
    var o = {};
    for (var k in n) { if (k === 'children' || k === '_children') continue; if (Object.prototype.hasOwnProperty.call(n, k)) o[k] = n[k]; }
    return o;
  }
  // nested pages  ->  { shells:[page-without-root...], nodes:[flat node record...] }
  function _ftaDecompose(pages) {
    var shells = [], nodes = [];
    (pages || []).forEach(function (pg) {
      if (!pg || pg.id == null || pg.id === '') return;   // keyless page: snapshot carries it
      var shell = {};
      for (var k in pg) { if (k === 'root') continue; if (Object.prototype.hasOwnProperty.call(pg, k)) shell[k] = pg[k]; }
      shell.__hasTree = (pg.root != null);
      shells.push(shell);
      if (pg.root == null) return;
      (function walk(n, parentId, order) {
        if (!n || n.id == null || n.id === '') return;    // keyless node can't be merged (rare/legacy) — dropped from live, snapshot keeps it
        var kids = Array.isArray(n.children) ? n.children : null;
        var collapsed = false;
        if (!kids && Array.isArray(n._children)) { kids = n._children; collapsed = true; }
        nodes.push({
          nodeKey: String(pg.id) + ':' + String(n.id),
          pageId: pg.id, nodeId: n.id,
          parentId: (parentId == null ? null : parentId),
          order: order, kidsCollapsed: collapsed,
          node: _ftaStrip(n)
        });
        (kids || []).forEach(function (c, i) { walk(c, n.id, i); });
      })(pg.root, null, 0);
    });
    return { shells: shells, nodes: nodes };
  }
  // rebuild ONE page's nested root from its flat node records
  function _ftaRebuildTree(recs) {
    var byId = {}, ids = [];
    (recs || []).forEach(function (r) {
      if (!r || r.nodeId == null) return;
      var id = String(r.nodeId);
      if (byId[id]) return;                              // dedupe (defensive)
      var n = {}, src = r.node || {};
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) n[k] = src[k];
      byId[id] = { id: id, node: n, parentId: (r.parentId == null ? null : String(r.parentId)),
                   order: (typeof r.order === 'number' ? r.order : 0), kidsCollapsed: !!r.kidsCollapsed, kids: [] };
      ids.push(id);
    });
    if (ids.length === 0) return null;
    var cmp = function (a, b) {
      if (a.order !== b.order) return a.order - b.order;
      var na = Number(a.id), nb = Number(b.id);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    };
    // attach each node to its parent; a null/missing parent makes it a root candidate
    var roots = [];
    ids.forEach(function (id) {
      var e = byId[id], pid = e.parentId;
      if (pid != null && byId[pid]) byId[pid].kids.push(e);
      else roots.push(e);
    });
    // the true root is an explicit null-parent node; extra candidates are orphans
    // (parent concurrently deleted, or a 2nd top event) — reattach them UNDER the
    // root so they stay VISIBLE and are never silently lost.
    var explicit = roots.filter(function (e) { return e.parentId == null; });
    var pool = (explicit.length ? explicit : roots).slice().sort(cmp);
    var root = pool[0];
    roots.forEach(function (e) { if (e !== root) { e.node._orphanReattached = true; root.kids.push(e); } });
    var seen = {};
    function assemble(e) {
      if (seen[e.id]) return null;                       // cycle / double-parent guard
      seen[e.id] = 1;
      var out = e.node, built = [];
      e.kids.slice().sort(cmp).forEach(function (c) { var b = assemble(c); if (b) built.push(b); });
      if (built.length === 0) out.children = [];
      else if (e.kidsCollapsed) { out._children = built; out.children = null; }
      else out.children = built;
      return out;
    }
    var tree = assemble(root);
    // any node never reached (pure cycle island) -> surface under root, never drop
    ids.forEach(function (id) {
      if (seen[id]) return;
      var b = assemble(byId[id]); if (!b) return;
      b._orphanReattached = true;
      if (!Array.isArray(tree.children)) {
        if (Array.isArray(tree._children)) { tree.children = tree._children; tree._children = null; }
        else tree.children = [];
      }
      tree.children.push(b);
    });
    return tree;
  }
  // { shells, nodes }  ->  nested pages  (legacy shells that still carry .root pass through)
  function _ftaRecompose(shells, nodes) {
    var byPage = {};
    (nodes || []).forEach(function (r) { if (!r || r.pageId == null) return; var pid = String(r.pageId); (byPage[pid] = byPage[pid] || []).push(r); });
    return (shells || []).map(function (sh) {
      var pg = {};
      for (var k in sh) { if (k === '__hasTree') continue; if (Object.prototype.hasOwnProperty.call(sh, k)) pg[k] = sh[k]; }
      var recs = byPage[String(sh.id)] || [];
      if (recs.length === 0) { pg.root = (sh.root != null ? sh.root : null); return pg; }   // legacy/skew: keep embedded root
      pg.root = _ftaRebuildTree(recs);
      return pg;
    });
  }
  // write a keyed array into col:/ord: maps (same posture as the generic loop)
  // Write a keyed array into col:/ord: maps. `full` = the seed posture (the model is
  // authoritative: the doc is made to mirror it, doc-only keys deleted). Otherwise the
  // three-way posture against the baseline (see _base above). Both leave the baseline
  // equal to what was written. Shared by the generic collections and the FTA shells/nodes.
  function _writeKeyed(name, arr, keyField, full) {
    var map = ydoc.getMap('col:' + name), ord = ydoc.getMap('ord:' + name), live = {};
    var bcol = _baseCol(name), bord = _baseOrd(name);
    (arr || []).forEach(function (item, i) {
      // NEVER collapse keyless rows (7 Sep 2026): a missing key would stringify to
      // "undefined" and every such row would overwrite the last. Skip from live-merge;
      // the snapshot backup still carries them.
      var kv = item ? item[keyField] : null;
      if (kv == null || kv === '') return;
      var k = String(kv); live[k] = 1;
      var next = JSON.stringify(item);
      if (full ? (map.get(k) !== next) : (bcol.get(k) !== next)) map.set(k, next);
      if (full ? (ord.get(k) !== i) : (bord.get(k) !== i)) ord.set(k, i);
      bcol.set(k, next); bord.set(k, i);
    });
    if (full) {
      Array.from(map.keys()).forEach(function (k) { if (!live[k]) map.delete(k); });
      Array.from(ord.keys()).forEach(function (k) { if (!live[k]) ord.delete(k); });
    } else {
      Array.from(bcol.keys()).forEach(function (k) { if (!live[k]) { if (map.has(k)) map.delete(k); if (ord.has(k)) ord.delete(k); } });
    }
    Array.from(bcol.keys()).forEach(function (k) { if (!live[k]) { bcol.delete(k); bord.delete(k); } });
  }
  function _ftaWriteKeyed(name, arr, keyField, full) { _writeKeyed(name, arr, keyField, full); }
  function _ftaReadKeyed(name) {
    var map = ydoc.getMap('col:' + name), ord = ydoc.getMap('ord:' + name);
    var keys = Array.from(map.keys()).sort(function (a, b) { var oa = ord.get(a), ob = ord.get(b); return (oa != null ? oa : 1e9) - (ob != null ? ob : 1e9); });
    var arr = [], bcol = _baseCol(name), bord = _baseOrd(name);
    bcol.clear(); bord.clear();
    keys.forEach(function (k, i) { var v = map.get(k); if (v != null) { try { arr.push(JSON.parse(v)); bcol.set(k, v); bord.set(k, i); } catch (_) {} } });
    return arr;
  }

  var Y = null, ydoc = null, chan = null, _client = null, _idb = null;
  var _started = false, _applying = false, _wsId = null, _projId = null;
  var _saveTimer = null, _pushTimer = null;
  // 13 Sep 2026 — THE SYNCED BASELINE (R18 rebuild). What every keyed row and every
  // whole-value store looked like the last time this tab and the doc agreed (after a
  // push of our own edit, or after a pull). pushLocal is a THREE-WAY comparison:
  //   local != baseline            -> a LOCAL edit   -> write it to the doc
  //   in baseline, gone locally    -> a LOCAL delete -> delete it from the doc
  //   local == baseline, doc lacks -> a REMOTE delete already merged into the doc ->
  //                                   leave it; the pull that follows removes it here
  // The old two-way push ("write whatever the doc lacks") could not tell the last two
  // apart and resurrected a teammate's delete whenever it ran after the delete had
  // merged. With the baseline, pushing BEFORE a pull is always safe, so a pull can
  // never discard an edit made here, however it was made.
  var _base = null;
  function _baseReset() { _base = { col: {}, ord: {}, whole: {} }; }
  // 13 Sep 2026 — PER-USER UNDO (Waqas: "if I hit undo I want it to restore mine but not
  // impact teammates' work ... exactly how it is in Microsoft documents"). The snapshot undo
  // in helpers_modules restores the WHOLE project as this tab last saw it, which rolls a
  // teammate's newer rows back. While co-editing is live, undo/redo go here instead: a Yjs
  // UndoManager scoped to the synced tables, tracking only this tab's own transactions
  // ('local'). Undo removes this tab's change from the shared history and leaves everything
  // a teammate wrote standing — including a later edit of the same row, which wins, as in
  // Word/Excel co-authoring (a step a co-author has since overwritten cannot be taken back;
  // the manager walks on to this tab's previous own step, exactly as Word does). Seeds carry origin 'seed' and the stamp lives in the meta map,
  // so neither is ever an undo step. The undone state reaches the screen through the same
  // pull a teammate's edit would.
  var _undoMgr = null;
  var UNDO_CAPTURE_MS = 500;      // edits landing within this window form one undo step (the push debounce is 350 ms)
  function _undoScopes() {
    var scopes = [];
    COLLECTIONS.forEach(function (c) { scopes.push(ydoc.getMap('col:' + c.name), ydoc.getMap('ord:' + c.name)); });
    scopes.push(ydoc.getMap('col:' + FTA_SHELL), ydoc.getMap('ord:' + FTA_SHELL), ydoc.getMap('col:' + FTA_NODE), ydoc.getMap('ord:' + FTA_NODE), ydoc.getMap('whole'));
    return scopes;
  }
  function _makeUndo() {
    try { if (Y && Y.UndoManager) return new Y.UndoManager(_undoScopes(), { trackedOrigins: new Set(['local']), captureTimeout: UNDO_CAPTURE_MS }); } catch (_) {}
    return null;
  }
  function liveUndo() { return !!(_started && ydoc && _undoMgr); }
  // stopCapturing after each undo/redo: the manager groups changes within UNDO_CAPTURE_MS
  // into one step, and an edit typed right after a redo must never be glued to it (the
  // next undo would take both back).
  function undo() { if (!liveUndo() || !_undoMgr.canUndo()) return false; _undoMgr.undo(); _undoMgr.stopCapturing(); return true; }
  function redo() { if (!liveUndo() || !_undoMgr.canRedo()) return false; _undoMgr.redo(); _undoMgr.stopCapturing(); return true; }
  function canUndo() { return liveUndo() && _undoMgr.canUndo(); }
  function canRedo() { return liveUndo() && _undoMgr.canRedo(); }
  function _baseCol(name) { return _base.col[name] || (_base.col[name] = new Map()); }
  function _baseOrd(name) { return _base.ord[name] || (_base.ord[name] = new Map()); }
  _baseReset();
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
  // 13 Sep 2026 — WRITTEN AS OUR OWN CHANGE. This set used to run outside any
  // transaction, so Yjs fired 'update' with a null origin; the handler below reads
  // null as "not ours" and ran a full pullToModel — every 12 s, on the cloud
  // autosave's clock, replacing every synced table on screen with the doc's copy.
  // A local edit still inside the 350 ms push debounce was wiped by that pull
  // (184 accepted FHA rows, R18). The stamp is ours: it broadcasts and saves like
  // any local write and never triggers a pull.
  function _stampSet(v) { try { if (ydoc && typeof v === 'number') ydoc.transact(function () { ydoc.getMap('meta').set('docVersion', v); }, 'local'); } catch (_) {} }

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
      try { pushLocal({ full: true }); } catch (_) {}
      if (V != null) _stampSet(V);
    } else {
      _adoptUntil = 0;
      try { pullToModel({ load: true }); } catch (_) {}
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
  // pushLocal(opts): opts.full = seed posture (model wins, doc mirrors it) — used by
  // the reconcile/adopt paths that have just replaced the model wholesale. The default
  // is the three-way posture: only what changed HERE since the baseline goes out.
  function pushLocal(opts) {
    if (!ydoc || _applying) return;
    if (_docStale()) return;                          // H-5: never write this model into another project's doc
    var full = !!(opts && opts.full);
    var cap; try { cap = window.__crdtCapture ? window.__crdtCapture() : null; } catch (_) { cap = null; }
    if (!cap) return;
    ydoc.transact(function () {
      COLLECTIONS.forEach(function (c) { _writeKeyed(c.name, cap[c.name] || [], c.key, full); });
      // fault trees: node-level merge — decompose page trees into shells + flat nodes
      var _fta = _ftaDecompose(cap.ftaPages || []);
      _writeKeyed(FTA_SHELL, _fta.shells, 'id', full);
      _writeKeyed(FTA_NODE, _fta.nodes, 'nodeKey', full);
      var wmap = ydoc.getMap('whole');
      WHOLE.forEach(function (name) {
        if (!(name in cap)) return;
        var next = JSON.stringify(cap[name] === undefined ? null : cap[name]);
        if (full ? (wmap.get(name) !== next) : (_base.whole[name] !== next)) wmap.set(name, next);
        _base.whole[name] = next;
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
    }, full ? 'seed' : 'local');
  }

  // pullToModel(opts): opts.load = the doc is being adopted onto a model that was just
  // LOADED (open-from-cloud reconcile, start): the model holds a snapshot, not local
  // edits, so nothing is pushed first. Default (a live update from a teammate): push
  // first, then pull.
  function pullToModel(opts) {
    if (!ydoc) return;
    if (_docStale()) return;                          // H-5: never apply another project's rows onto this model
    if (_adoptUntil && Date.now() < _adoptUntil) { try { pushLocal({ full: true }); } catch (_) {} return; }   // adopt window: model is authoritative
    // 13 Sep 2026 — A PULL NEVER DISCARDS A LOCAL CHANGE (R18). Push FIRST, always: the
    // three-way push writes exactly the edits made here since the baseline (and only
    // those — it cannot resurrect a delete that has already merged into the doc), so
    // the doc carries our rows before we read it back. The debounce timer, if armed,
    // is consumed here rather than firing a second, redundant push later.
    if (_pushTimer) { try { clearTimeout(_pushTimer); } catch (_) {} _pushTimer = null; }
    if (!(opts && opts.load)) { try { pushLocal(); } catch (_) {} }
    var partial = {};
    COLLECTIONS.forEach(function (c) {
      var map = ydoc.getMap('col:' + c.name);
      var ord = ydoc.getMap('ord:' + c.name);
      // map keys are unique (dedupe is automatic); order by the keyed index map.
      var keys = Array.from(map.keys()).sort(function (a, b) {
        var oa = ord.get(a), ob = ord.get(b);
        return (oa != null ? oa : 1e9) - (ob != null ? ob : 1e9);
      });
      var arr = [], bcol = _baseCol(c.name), bord = _baseOrd(c.name);
      bcol.clear(); bord.clear();
      keys.forEach(function (k, i) { var v = map.get(k); if (v != null) { try { arr.push(JSON.parse(v)); bcol.set(k, v); bord.set(k, i); } catch (_) {} } });
      partial[c.name] = arr;
    });
    // fault trees: recompose shells + flat nodes back into nested pages
    partial.ftaPages = _ftaRecompose(_ftaReadKeyed(FTA_SHELL), _ftaReadKeyed(FTA_NODE));
    var wmap = ydoc.getMap('whole');
    WHOLE.forEach(function (name) {
      if (wmap.has(name)) { try { partial[name] = JSON.parse(wmap.get(name)); _base.whole[name] = wmap.get(name); } catch (_) {} }
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
      _baseReset();
      ydoc = new Y.Doc();
      _undoMgr = _makeUndo();
      ydoc.on('update', function (update, origin) {
        // ours: an edit ('local'), a seed ('seed'), or our own undo/redo (the UndoManager is
        // the origin) — all broadcast to peers. An undo/redo ALSO pulls: its result reaches
        // the model the way a teammate's change would.
        var ours = (origin === 'local' || origin === 'seed' || (_undoMgr && origin === _undoMgr));
        if (ours) _broadcast('yupdate', { u: b64enc(update), t: _tok });
        if (origin !== 'local' && origin !== 'seed' && origin !== _idb) pullToModel();   // idb-origin updates reconciled once after load
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
            _adoptUntil = Date.now() + ADOPT_WINDOW_MS; try { pushLocal({ full: true }); } catch (_) {}
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
          if (adopt) pushLocal({ full: true }); else pullToModel({ load: true });
          if (_online()) _goOnline();
        } else if (_online()) {
          // nothing local yet, online → let the server doc be authoritative (don't seed stale local)
          _loadState(function (had) {
            if (adopt || !had) pushLocal({ full: true }); else pullToModel({ load: true });
            if (!chan) _openChannel();
          });
        } else {
          // nothing local, offline → seed from whatever model is on this device
          pushLocal({ full: true });
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
  function _docHasContent() { try { if (COLLECTIONS.some(function (c) { return ydoc.getMap('col:' + c.name).size > 0; })) return true; return ydoc.getMap('col:' + FTA_SHELL).size > 0 || ydoc.getMap('col:' + FTA_NODE).size > 0; } catch (_) { return false; } }
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
    try { if (_undoMgr && _undoMgr.destroy) _undoMgr.destroy(); } catch (_) {} _undoMgr = null;
    try { if (ydoc) ydoc.destroy(); } catch (_) {}
    ydoc = null; _started = false; _baseReset();
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
    if (_started && ydoc && _projId === p) { try { pushLocal({ full: true }); } catch (_) {} _adoptProj = null; }
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
    _doc: function () { return ydoc; },
    keys: function () { var o = {}; COLLECTIONS.forEach(function (c) { o[c.name] = c.key; }); return o; },
    undo: undo, redo: redo, canUndo: canUndo, canRedo: canRedo, liveUndo: liveUndo, _undoMgr: function () { return _undoMgr; },
    _base: function () { return _base; },
    _fta: { decompose: _ftaDecompose, recompose: _ftaRecompose, rebuildTree: _ftaRebuildTree }
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

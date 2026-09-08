// ============================================================================
// cloud_writer.js — v1.0 — THE one writer of project_documents (3 Sep 2026).
//
// WHY THIS FILE EXISTS. Until today "write this snapshot to the cloud safely"
// lived in two places — helpers_modules.saveProjectToCloud (the manual Save,
// reached from 74 commitSaveChanges call sites in 34 modules) and
// cloud_sync._push (the 12 s background autosave) — with duplicated version-
// read / conditional-write / insert-at-v1 code. Each guard was correct about
// itself, and every data-loss fix since 20 Aug hardened one writer against the
// other's symptom without listing the other. The 2 Sep fix serialized the
// manual path and missed the autosave; the 3 Sep fix serialized the autosave.
// Waqas, after the inventory: "yes on 1" — consolidate. From now on:
//
//   · Nothing outside this file touches project_documents with a write. The
//     suite regression_cloud_writer enumerates every site/*.js and fails the
//     wall if a second writer appears.
//   · ONE queue per tab (globalThis.__slabCloudSaveQ — the same object the
//     2 Sep fix introduced, so nothing that already awaits it changes).
//     Overlapping requests coalesce; a burst inside QUIET_MS after a landed
//     write becomes ONE trailing write (the commitSaveChanges storm: an AI
//     accept, a store _save() and a navigation used to be three pushes).
//     pagehide flushes the wait so a closing tab never leaves a write behind.
//   · The write is CONDITIONAL, always: UPDATE … WHERE version = the token
//     this tab read, .select('version'); zero rows = refused at the server.
//     INSERT at version 1 only when no row exists; a duplicate key there is
//     the same refusal. A blind upsert cannot be written by accident because
//     no caller composes the write any more.
//   · Two modes, one mechanism. MANUAL (a person or an accept asked for it):
//     a refusal BANKS the working state, then — if this user holds a
//     workspace lock in the project — records a LOCK BREACH in the change log
//     and the journal, resyncs, and keeps the holder's state (Waqas: "we have
//     locked workspaces for this exact reason"); with no lock held it asks,
//     non-blocking, exactly as before. SILENT (background): a refusal is
//     skipped and left to the next manual save; under a held lock it is
//     audited once per observed server version, never on every tick.
//   · The tab write LEASE (tab_guard.js) now gates the cloud path too: a tab
//     that does not hold the lease and cannot acquire it does not push. Until
//     now the lease protected only the local slot, so the same user in a second
//     tab was a coin-flip on the cloud copy.
//
// The snapshot is taken INSIDE the queued run (the caller's prepare() runs
// there), so an older snapshot can never land after a newer save.
//
// Vm-testable: self-contained on globalThis, every app seam reached through
// typeof checks (getSupabaseClient, _activeCloudDocVersion, _bankWorkingState,
// _loadCloudProject, _recordSaveHistory, slConfirm, showToast, tgHasLease,
// tgAcquire, _wsGetLock, _wsUser, _wsLog, jrnl, systemsData).
// ============================================================================
(function () {
    'use strict';
    var G = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : this);
    if (G.SLCloudWriter && G.SLCloudWriter._v === '1.0') return;

    // the quiet window after a landed write inside which further requests coalesce
    // into ONE trailing write; overridable (tests, or a customer deployment) via
    // globalThis.__slabCloudQuietMs.
    var QUIET_MS = (typeof G.__slabCloudQuietMs === 'number') ? G.__slabCloudQuietMs : 3000;
    if (!G.__slabCloudSaveQ) G.__slabCloudSaveQ = { chain: Promise.resolve(), pending: false };
    var Q = G.__slabCloudSaveQ;
    if (Q.lastDoneAt == null) Q.lastDoneAt = 0;
    var _next = null;              // the coalesced follow-up: { mode, prepare, resolvers }
    var _wake = null;              // resolver of the quiet-window sleep, so flush() can cut it
    var _auditedAt = {};           // projectId -> server version already audited (silent mode)

    function _g(name) { try { return (typeof G[name] !== 'undefined') ? G[name] : undefined; } catch (_) { return undefined; } }
    function _fn(name) { var f = _g(name); return (typeof f === 'function') ? f : null; }
    function _toast(msg, kind, ms) { try { var t = _fn('showToast'); if (t) t(msg, kind || 'info', ms || 4000); } catch (_) {} }
    function _token() { try { return (typeof _activeCloudDocVersion !== 'undefined') ? _activeCloudDocVersion : null; } catch (_) { return null; } }
    function _setToken(v) { try { _activeCloudDocVersion = v; } catch (_) {} }
    function _sleep(ms) { return new Promise(function (r) { _wake = r; setTimeout(function () { if (_wake === r) _wake = null; r(); }, ms); }); }

    // ---- the tab lease (tab_guard.js) ------------------------------------
    // Mirrors the local write guard: not ours → one attempt to acquire (the
    // other tab may have closed) → still not ours = another tab is active.
    function _leaseOk() {
        var has = _fn('tgHasLease'), acq = _fn('tgAcquire');
        if (!has) return true;                      // tab_guard not loaded: no lease model, no gate
        try {
            if (has()) return true;
            if (acq) { var r = acq(false); if (r && r.ok) return true; }
            return !!has();
        } catch (_) { return true; }
    }

    // ---- workspace locks this user holds in the open project --------------
    function _heldLocks() {
        var out = [];
        try {
            var wu = _fn('_wsUser'); var me = wu ? String(((wu() || {}).email) || '').toLowerCase() : '';
            if (!me) return out;
            var gl = _fn('_wsGetLock');
            var ac = gl ? gl('ac') : null;
            if (ac && String(ac.by || '').toLowerCase() === me) out.push({ scope: 'ac', systemId: '', label: 'Aircraft level' });
            var sys = _g('systemsData');
            if (Array.isArray(sys)) sys.forEach(function (s) {
                if (s && s.lock && String(s.lock.by || '').toLowerCase() === me) out.push({ scope: 'system', systemId: String(s.id), label: 'System · ' + (s.name || s.id) });
            });
        } catch (_) {}
        return out;
    }
    function _auditBreach(locks, projectId, expected, server, mode) {
        var summary = 'cloud copy moved v' + expected + ' → v' + server + ' while this lock was held' +
            (mode === 'manual' ? ' — resynced, lock holder\'s state kept' : ' — background save skipped, next manual save keeps the holder\'s state');
        try { var log = _fn('_wsLog'); if (log) locks.forEach(function (l) { log(l.scope, l.systemId, 'lock-breach', summary); }); } catch (_) {}
        try { var j = _fn('jrnl'); if (j) j('lock-breach', locks.map(function (l) { return l.label; }).join(', ') + ': ' + summary); } catch (_) {}
        try { console.warn('[cloud-writer] LOCK BREACH on ' + projectId + ': ' + summary + ' (' + locks.map(function (l) { return l.label; }).join(', ') + ')'); } catch (_) {}
    }

    var CONFLICT_MSG = 'The saved cloud copy of this project changed after this tab loaded it (another tab, another device, or a teammate).\n\nOK = overwrite the cloud copy with THIS tab\'s version\nCancel = load the cloud copy (this tab\'s current state was banked to the recovery ring first — Thread Integrity page)';
    async function _ask(msg) {
        try { var c = _fn('slConfirm'); if (c) return !!(await c(msg)); } catch (_) {}
        try { if (typeof window !== 'undefined' && window && typeof window.confirm === 'function') return !!window.confirm(msg); } catch (_) {}
        return true;
    }

    // ---- the queued run ----------------------------------------------------
    // ctx from prepare(): { client, projectId, userId, snapshot } — anything
    // falsy = the caller decided not to write (guards, ITAR, shrink, no content).
    async function _run(mode, prepare) {
        var ctx = null;
        try { ctx = await prepare(); } catch (e) { return { ok: false, reason: 'error', error: e }; }
        if (!ctx || !ctx.client || !ctx.projectId || !ctx.snapshot) return { ok: false, reason: 'skipped' };
        var client = ctx.client, projectId = ctx.projectId, userId = ctx.userId || null, snapshot = ctx.snapshot;

        if (!_leaseOk()) {
            if (mode === 'manual') _toast('This project is active in another tab — cloud saving is paused here. Click the banner at the top to make THIS tab active.', 'warning', 6000);
            return { ok: false, reason: 'lease' };
        }

        var readVersion = async function () {
            var r = await client.from('project_documents').select('version').eq('project_id', projectId).maybeSingle();
            var cur = r && r.data;
            return (cur && cur.version != null) ? cur.version : null;
        };
        // A refusal or a pre-check mismatch: bank → (lock breach: audit + resync) | (ask) → resync | load.
        // Returns true to retry the write, false to stop.
        var reconcile = async function (serverVersion) {
            var locks = _heldLocks();
            if (mode === 'silent') {
                if (locks.length && _auditedAt[projectId] !== serverVersion) { _auditedAt[projectId] = serverVersion; _auditBreach(locks, projectId, _token(), serverVersion, mode); }
                return false;
            }
            try { var bank = _fn('_bankWorkingState'); if (bank) bank(); } catch (_) {}
            if (locks.length) {
                _auditBreach(locks, projectId, _token(), serverVersion, mode);
                _toast('The cloud copy changed while you hold the lock on ' + locks.map(function (l) { return l.label; }).join(', ') + ' — recorded as a lock breach in the change log. Your state was banked and is being kept.', 'warning', 8000);
                _setToken(serverVersion);
                return true;
            }
            var overwrite = await _ask(CONFLICT_MSG);
            if (!overwrite) {
                try { var load = _fn('_loadCloudProject'); if (load) await load(projectId); } catch (_) {}
                _toast('Loaded the cloud copy. Your previous state is banked in the recovery ring (Thread Integrity page).', 'info', 8000);
                return false;
            }
            _setToken(serverVersion);
            return true;
        };

        try {
            var cur = await readVersion();
            if (cur != null) {
                if (_token() == null) _setToken(cur);                     // adopt, never regress the counter
                else if (cur !== _token()) { if (!(await reconcile(cur))) return { ok: false, reason: mode === 'silent' ? 'refused' : 'cancelled' }; }
            }
            var stamp = function () { return { data: snapshot, updated_by: userId, updated_at: new Date().toISOString() }; };
            var nextVersion = null;
            var attempts = (mode === 'manual') ? 2 : 1;
            for (var attempt = 0; attempt < attempts; attempt++) {
                if (_token() == null) {
                    var ins = await client.from('project_documents').insert(Object.assign({ project_id: projectId, version: 1 }, stamp()));
                    var iErr = ins && ins.error;
                    if (!iErr) { nextVersion = 1; break; }
                    if (String(iErr.code || '') !== '23505' && !/duplicate|unique/i.test(String(iErr.message || ''))) throw iErr;
                } else {
                    var expected = _token(), candidate = expected + 1;
                    var up = await client.from('project_documents')
                        .update(Object.assign({ version: candidate }, stamp()))
                        .eq('project_id', projectId).eq('version', expected)
                        .select('version');
                    if (up && up.error) throw up.error;
                    if (up && Array.isArray(up.data) && up.data.length > 0) { nextVersion = candidate; break; }
                }
                // refused: the document moved under this tab — reconcile against what the server holds NOW
                var now = await readVersion();
                if (now == null) { _setToken(null); continue; }
                if (!(await reconcile(now))) return { ok: false, reason: mode === 'silent' ? 'refused' : 'cancelled' };
            }
            if (nextVersion == null) {
                if (mode === 'silent') return { ok: false, reason: 'refused' };
                throw new Error('cloud save refused twice — the document changed under this tab both times; nothing was overwritten and your state is banked in the recovery ring');
            }
            _setToken(nextVersion);
            try { var hist = _fn('_recordSaveHistory'); if (hist) await hist(projectId, nextVersion, snapshot, userId); } catch (_) {}
            // 8 Sep 2026 — Stage 2: a CONFIRMED backup write means the CRDT doc is now
            // known to be at least as fresh as snapshot vN; advance the reconcile stamp
            // so the next open lets the live CRDT win instead of re-seeding. Inert while
            // the authority flag is off (noteSnapshotVersion self-gates).
            try { if (G.SafetyLabCRDT && typeof G.SafetyLabCRDT.noteSnapshotVersion === 'function') G.SafetyLabCRDT.noteSnapshotVersion(projectId, nextVersion); } catch (_) {}
            return { ok: true, version: nextVersion };
        } catch (e) {
            return { ok: false, reason: 'error', error: e };
        }
    }

    // ---- the queue: coalesce + quiet window + flush ------------------------
    function write(opts) {
        opts = opts || {};
        var mode = (opts.mode === 'silent') ? 'silent' : 'manual';
        var prepare = (typeof opts.prepare === 'function') ? opts.prepare : function () { return null; };
        if (_next) {
            // a follow-up is already waiting: share it; manual outranks silent (it asks, silent skips)
            if (mode === 'manual' && _next.mode !== 'manual') { _next.mode = 'manual'; _next.prepare = prepare; }
            return new Promise(function (res) { _next.resolvers.push(res); });
        }
        var slot = { mode: mode, prepare: prepare, resolvers: [] };
        _next = slot;
        Q.pending = true;
        var p = new Promise(function (res) { slot.resolvers.push(res); });
        Q.chain = Q.chain.catch(function () {}).then(async function () {
            var wait = QUIET_MS - (Date.now() - Q.lastDoneAt);
            if (wait > 0 && !slot.flush) await _sleep(wait);
            _next = null; Q.pending = false;          // from here a new request queues behind this run
            var result;
            try { result = await _run(slot.mode, slot.prepare); } catch (e) { result = { ok: false, reason: 'error', error: e }; }
            Q.lastDoneAt = Date.now();
            slot.resolvers.forEach(function (r) { try { r(result); } catch (_) {} });
            return result;
        });
        return p;
    }
    function flush() { if (_next) _next.flush = true; if (_wake) { var w = _wake; _wake = null; w(); } return Q.chain; }
    function status() { return { pending: !!_next, quietMs: QUIET_MS, lastDoneAt: Q.lastDoneAt, token: _token() }; }

    try {
        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('pagehide', function () { try { flush(); } catch (_) {} }, { capture: true });
            if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { try { flush(); } catch (_) {} } }, true);
        }
    } catch (_) {}

    G.SLCloudWriter = { _v: '1.0', write: write, flush: flush, status: status, heldLocks: _heldLocks, QUIET_MS: QUIET_MS };
})();

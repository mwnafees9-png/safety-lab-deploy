#!/usr/bin/env python3
# 26 Oct 2026 (Radia, own server: "369 changes to confirm ... once you confirm those and it says changes saved it does
# not autosave"). Root cause: Confirm all pushed the project in the background ('silent') mode. When the server copy
# had moved since this tab last wrote it (a teammate's save, or a reload that restored an older version number from the
# autosave meta), silent mode skips the write and returns 'refused'; save_state.js then turned 'refused' into success
# ('ok-team') whenever the live team sync was running, said "Saved", and never retried. The next open read the old
# server copy. Fix:
#   - cloud_writer.js: a third mode, 'merged', for a confirmed save while the live team sync carries every teammate's
#     work into this tab: a moved server copy is banked, adopted and written over (the tab holds the merged state), no
#     question asked. Manual > merged > silent when requests coalesce. The version written is kept on this device per
#     project, so a reload never starts from an older number.
#   - cloud_sync.js: the push takes the mode it is given.
#   - save_state.js: Confirm all saves 'merged' with the live sync on; without it a refusal runs the manual save,
#     which asks (overwrite the cloud copy, or load it). A refused save is never shown as saved ('ok-team' is gone).
#   - data_ops_modules.js: the version restored with the autosave is never older than the one this device last wrote.
import os, sys
root = sys.argv[1] if len(sys.argv) > 1 else '.'
def sub(f, a, b, n=1):
    P = os.path.join(root, f); s = open(P, encoding='utf-8').read()
    if s.count(a) != n: raise SystemExit(f'{f}: expected {n} of {a[:80]!r}, found {s.count(a)}')
    open(P, 'w', encoding='utf-8').write(s.replace(a, b))

CW = 'site/cloud_writer.js'
sub(CW, """    function _setToken(v) { try { _activeCloudDocVersion = v; } catch (_) {} }""",
"""    function _setToken(v) { try { _activeCloudDocVersion = v; } catch (_) {} }
    // 26 Oct 2026: the version this device last WROTE, per project. The autosave meta records the version before the
    // server write raises it, so a reload restored an older number and the next save was refused as "changed elsewhere".
    var VER_KEY = 'safetyLab.cloudDocVersion.';
    function _rememberVersion(projectId, v) { try { if (G.localStorage && projectId && typeof v === 'number') G.localStorage.setItem(VER_KEY + projectId, String(v)); } catch (_) {} }
    function lastWritten(projectId) { try { var s = G.localStorage && projectId ? G.localStorage.getItem(VER_KEY + projectId) : null; var n = s == null ? NaN : parseInt(s, 10); return isFinite(n) ? n : null; } catch (_) { return null; } }""")
sub(CW, """            if (mode === 'silent') {
                if (locks.length && _auditedAt[projectId] !== serverVersion) { _auditedAt[projectId] = serverVersion; _auditBreach(locks, projectId, _token(), serverVersion, mode); }
                return false;
            }""",
"""            if (mode === 'silent') {
                if (locks.length && _auditedAt[projectId] !== serverVersion) { _auditedAt[projectId] = serverVersion; _auditBreach(locks, projectId, _token(), serverVersion, mode); }
                return false;
            }
            // 26 Oct 2026, 'merged': a CONFIRMED save while the live team sync is on. Every teammate's work is already
            // merged into this tab, so the moved copy is banked and written over, never asked about and never skipped.
            if (mode === 'merged') {
                try { var bankM = _fn('_bankWorkingState'); if (bankM) bankM(); } catch (_) {}
                if (locks.length && _auditedAt[projectId] !== serverVersion) { _auditedAt[projectId] = serverVersion; _auditBreach(locks, projectId, _token(), serverVersion, 'manual'); }
                _setToken(serverVersion);
                return true;
            }""")
sub(CW, """            var attempts = (mode === 'manual') ? 2 : 1;""", """            var attempts = (mode === 'silent') ? 1 : 2;""")
sub(CW, """            if (nextVersion == null) {
                if (mode === 'silent') return { ok: false, reason: 'refused' };""", """            if (nextVersion == null) {
                if (mode !== 'manual') return { ok: false, reason: 'refused' };   // merged: the copy moved again in between""")
sub('site/save_state.js', """            if (code !== 'shrink' && code !== 'refused' && code !== 'not-yours') _scheduleRetry();""",
"""            // a refusal with the live sync on (the copy kept moving under a merged save) is tried again; without it the
            // manual save asks instead (_askAfter)
            if (code !== 'shrink' && (code !== 'refused' || team) && code !== 'not-yours') _scheduleRetry();""")
sub(CW, """            _setToken(nextVersion);
            try { var hist""", """            _setToken(nextVersion);
            _rememberVersion(projectId, nextVersion);
            try { var hist""")
sub(CW, """        var mode = (opts.mode === 'silent') ? 'silent' : 'manual';""",
"""        var mode = (opts.mode === 'silent' || opts.mode === 'merged') ? opts.mode : 'manual';""")
sub(CW, """            // a follow-up is already waiting: share it; manual outranks silent (it asks, silent skips)
            if (mode === 'manual' && _next.mode !== 'manual') { _next.mode = 'manual'; _next.prepare = prepare; }""",
"""            // a follow-up is already waiting: share it; manual outranks merged outranks silent (manual asks, merged
            // writes over a moved copy, silent skips it)
            var RANK = { silent: 0, merged: 1, manual: 2 };
            if (RANK[mode] > RANK[_next.mode]) { _next.mode = mode; _next.prepare = prepare; }""")
sub(CW, """    G.SLCloudWriter = { _v: '1.0', write: write, flush: flush, status: status, heldLocks: _heldLocks, QUIET_MS: QUIET_MS };""",
"""    G.SLCloudWriter = { _v: '1.1', write: write, flush: flush, status: status, heldLocks: _heldLocks, lastWritten: lastWritten, QUIET_MS: QUIET_MS };""")

CS = 'site/cloud_sync.js'
sub(CS, """        var wp = W.write({ mode: 'silent', prepare: prepare });""",
"""        var wp = W.write({ mode: (opts.mode === 'merged' || opts.mode === 'manual') ? opts.mode : 'silent', prepare: prepare });""")
sub(CS, """        try { return await _push(client, ws, uid, W, { snapshot: opts.snapshot, force: true, now: true }); }""",
"""        try { return await _push(client, ws, uid, W, { snapshot: opts.snapshot, force: true, now: true, mode: opts.mode }); }""")

SS = 'site/save_state.js'
sub(SS, """        var r = { ok: false, reason: 'signed-out' };
        if (typeof W.__slCloudSyncPushNow === 'function') {
            try { r = (await W.__slCloudSyncPushNow({ snapshot: acc })) || r; } catch (e) { r = { ok: false, reason: 'error', error: e }; }
        }
        var code = r.ok ? 'ok' : r.reason;
        if (code === 'refused' && team) code = 'ok-team';     // the live doc carries the change; the backup copy catches up on the next push""",
"""        // 26 Oct 2026 (Radia): a confirmed change REACHES the server copy. With the live team sync on, this tab holds
        // every teammate's work, so a server copy that moved is written over ('merged'). Without it, a moved copy is
        // asked about (the manual save: overwrite it, or load it). A refused save is never reported as saved.
        var r = { ok: false, reason: 'signed-out' };
        if (typeof W.__slCloudSyncPushNow === 'function') {
            try { r = (await W.__slCloudSyncPushNow({ snapshot: acc, mode: team ? 'merged' : 'silent' })) || r; } catch (e) { r = { ok: false, reason: 'error', error: e }; }
        }
        var code = r.ok ? 'ok' : r.reason;
        // no live sync and the server copy moved: once this save is over, the manual save asks (overwrite or load). It
        // runs AFTER this save, never inside it: "load the cloud copy" opens a project, which waits for the save in
        // flight, and inside it that would wait for itself. Only when nothing still waits to be confirmed (the manual
        // save writes the whole project).
        _askAfter = (code === 'refused' && !team && acc == null);""")
sub(SS, """        if (code === 'ok' || code === 'ok-team' || NO_CLOUD[code]) {""", """        if (code === 'ok' || NO_CLOUD[code]) {""")
sub(SS, """        _where = (code === 'ok') ? 'cloud' : ((team || code === 'ok-team') ? 'team' : 'device');""",
"""        _where = (code === 'ok') ? 'cloud' : (team ? 'team' : 'device');""")
# the manual save after a refusal, outside the save in flight
sub(SS, """    function _requestSave() {
        if (_saving) { _again = true; return _saving; }
        _saving = _doSave().then(function (ok) {
            _saving = null;
            if (_again) { _again = false; return _requestSave(); }""",
"""    var _askAfter = false;     // 26 Oct 2026: the server copy moved and no live sync carries it: ask once this save is over
    var _choosing = false;     // the manual save is asking: overwrite the cloud copy, or load it (this tab's state banked first)
    async function _manualAfterRefusal() {
        if (typeof W.saveProjectToCloud !== 'function') return false;
        var ok = false;
        _choosing = true;          // its "load the cloud copy" IS the person's choice: guard() lets that load through
        try { ok = (await W.saveProjectToCloud()) === true; } catch (_) {} finally { _choosing = false; }
        if (ok) { _cloudPending = false; _state = 'saved'; _savedAt = _now(); _where = 'cloud'; _reasonCode = ''; _reason = ''; _retryN = 0; }
        _paint();
        return ok;
    }
    function _requestSave() {
        if (_saving) { _again = true; return _saving; }
        _saving = _doSave().then(function (ok) {
            _saving = null;
            if (!ok && _askAfter) { _askAfter = false; return _manualAfterRefusal(); }
            if (_again) { _again = false; return _requestSave(); }""")

sub(SS, """    async function guard(reason) {
        _stats.guards++;""", """    async function guard(reason) {
        _stats.guards++;
        // 26 Oct 2026: the person chose "load the cloud copy" in the manual save after a refusal: that load is the
        // decision (this tab's state was banked to the recovery list first), so nothing is asked or saved here
        if (_choosing) return true;""")

DO = 'site/data_ops_modules.js'
sub(DO, """            _activeCloudDocVersion = (typeof m.cloudDocVersion === 'number') ? m.cloudDocVersion : null;""",
"""            _activeCloudDocVersion = (typeof m.cloudDocVersion === 'number') ? m.cloudDocVersion : null;
            // 26 Oct 2026: the meta is written before the server save raises the version; the number this device
            // last WROTE (cloud_writer.js) is never older, so a reload does not start from a stale one
            try { var lw = window.SLCloudWriter && window.SLCloudWriter.lastWritten ? window.SLCloudWriter.lastWritten(m.cloudProjectId) : null; if (typeof lw === 'number' && (_activeCloudDocVersion == null || lw > _activeCloudDocVersion)) _activeCloudDocVersion = lw; } catch (_) {}""")

IX = 'site/index.html'
sub(IX, 'cloud_writer.js?v=1.2', 'cloud_writer.js?v=1.3')
sub(IX, 'save_state.js?v=3.2', 'save_state.js?v=3.3')
sub(IX, 'cloud_sync.js?v=2.8', 'cloud_sync.js?v=2.9')
sub(IX, 'data_ops_modules.js?v=66.60', 'data_ops_modules.js?v=66.61')
print('confirm save fix applied')

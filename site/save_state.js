// ============================================================================
// save_state.js - v2.0 - 13 Oct 2026 (late) - AUTOSAVE.
//
// WAQAS, 13 OCT: "when a user saves a choice/change it should be autosaving". The moment a person
// acknowledges a change (change_ack.js), or makes a choice, it is saved, at once and durably, with
// no separate Save step. v1.x (Office-style Save / Don't Save / Cancel, shipped earlier the same
// day) is replaced: there is no unsaved work to save or discard any more, so that prompt is gone.
//
// THE MODEL (Word with AutoSave on, in a co-authored document):
//   · ACKNOWLEDGED = SAVED. Keep in the acknowledgement dialog runs one save of the ACCEPTED
//     project: this device (the local autosave: localStorage + IndexedDB + the disk file, waited
//     for), the live sync (crdt_sync.js: teammates see it) and the cloud copy (cloud_sync.js
//     __slCloudSyncPushNow, through cloud_writer.js, the one writer). Saves never overlap: a change
//     acknowledged while one runs is written by one more save right after it.
//   · ONLY WHAT WAITS FOR AN ACKNOWLEDGEMENT IS NOT SAVED: a content change in progress (decided
//     450 ms after it is finished) and the collected moves and undos (change_ack.js deferred(),
//     acknowledged on leaving the view; Waqas: acknowledged "when the user is ready to leave the
//     page"). While anything waits, the live sync and the silent cloud push are held, exactly as
//     before, so teammates never see an unacknowledged change. A content change acknowledged while
//     moves are still collected is saved on this device, to the cloud copy and to teammates live
//     WITHOUT the moves (SLChangeAck.acceptedSnapshot(): the state Cancel on the collection would
//     leave; crdt_sync.js pushAccepted() sends it on its own); the moves follow when acknowledged.
//   · THE INDICATOR (header and every per-view button) says Saving… / Saved at a time (and where:
//     on this device, or to the cloud) / Not saved: why, and Retry. While moves or undos wait it
//     says how many; a click acknowledges them now.
//   · FAILURES NEVER LOSE AN ACCEPTED CHANGE. Offline: kept on this device, retried the moment the
//     browser is back online. A server or network error: retried after 3, 10, 30, 60 s, then every
//     2 min. The cloud copy changed elsewhere (no live sync to carry the change): Retry runs the
//     manual cloud save, which asks to overwrite or to load. Another tab is the active one: said,
//     retried on click. The pending upload rides in the autosave meta (cloudPending), so a crash or
//     a closed tab retries it on the next open.
//   · LEAVING (closing the tab or window, opening another project, a new project, a demo, sign out,
//     a restore): the waiting content change and collected moves are asked about first (the
//     acknowledgement dialog; Cancel there reverts only those). Then the save in flight is waited
//     for. Only if something ACCEPTED is still not persisted does anything else appear: the browser's
//     own leave prompt (web: browsers allow nothing else there), or, in the app, "Not saved yet" with
//     Stay / Continue anyway; Continue banks a copy in the recovery ring first.
//   · A CRASH with changes still waiting: the accepted state is kept in its own IndexedDB slot (written
//     when something starts waiting), tagged with the id the autosave meta carries. On the next open
//     the waiting changes are asked about again (SLChangeAck.reopen): Acknowledge saves them, Cancel
//     returns to what was accepted. Nothing unacknowledged is ever promoted to saved by a restart.
//
// DESKTOP. The Electron shell's main process should, in the window 'close' handler, call
// event.preventDefault(), then `await webContents.executeJavaScript('window.__slabRequestClose()')`
// and destroy the window only when it resolves true. Without that, this page cancels the unload
// itself (Electron cancels a close silently when beforeunload sets returnValue), asks, and then calls
// window.slabDesktop.closeWindow() (preload API) or window.close(). window.__slabCanClose() answers
// synchronously.
//
// Tests: tests/regression_save_state_20261013b.test.js (unit, two live-sync tabs, failures and retry)
// and the browser suite tests/regression_change_ack_ui_20261013b.test.js.
// ============================================================================
(function () {
    'use strict';
    var W = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
    var ACCEPTED_KEY = 'safetyLab.accepted.v1';
    var RETRY_MS = [3000, 10000, 30000, 60000, 120000];
    var LOCAL_WAIT_MS = 5000;

    function _now() { return Date.now(); }
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _ack() { return W.SLChangeAck || null; }
    function _crdt() { try { var C = W.SafetyLabCRDT; return (C && C.status && C.status().started) ? C : null; } catch (_) { return null; } }
    function _toast(m, k, t) { try { if (typeof W.showToast === 'function') W.showToast(m, k || 'info', t || 3000); } catch (_) {} }
    function _jr(kind, msg) { try { if (typeof W.jrnl === 'function') W.jrnl(kind, msg); } catch (_) {} }
    function _signedIn() { try { return !!(typeof _supabaseSession !== 'undefined' && _supabaseSession && _supabaseSession.user); } catch (_) { return false; } }
    function _projName() { try { if (typeof projectName !== 'undefined' && projectName) return String(projectName); } catch (_) {} return 'this project'; }
    function _online() { try { return !(typeof navigator !== 'undefined' && navigator.onLine === false); } catch (_) { return true; } }
    function _hhmm(t) { try { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } }
    function _timeout(p, ms, v) { var t = null; return Promise.race([Promise.resolve(p).then(function (x) { if (t) clearTimeout(t); return x; }), new Promise(function (r) { t = setTimeout(function () { r(v); }, ms); })]); }

    // =======================================================================
    // SLChoice: a house dialog with any number of buttons. Same card and classes as slConfirm.
    // =======================================================================
    var _choiceOpen = false, _choiceAnswer = null;
    function choice(opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            if (_choiceAnswer) { var a = _choiceAnswer; setTimeout(function () { resolve(a); }, 0); return; }
            if (typeof document === 'undefined' || !document.body) { resolve(opts.escape || 'cancel'); return; }
            _choiceOpen = true;
            var ov = document.createElement('div');
            ov.id = 'sl-choice-overlay'; ov.className = 'modal-overlay';
            var btns = (opts.buttons || []).map(function (b) {
                var cls = b.kind === 'primary' ? 'sl-dialog-ok' : (b.kind === 'danger' ? 'sl-dialog-ok sl-danger' : 'sl-dialog-cancel');
                return '<button type="button" class="' + cls + '" data-choice="' + _esc(b.id) + '">' + _esc(b.label) + '</button>';
            }).join('');
            ov.innerHTML = '<div class="sl-dialog-card sl-choice-card" role="dialog" aria-modal="true" aria-labelledby="sl-choice-title">'
                + (opts.title ? '<h3 class="sl-dialog-title" id="sl-choice-title">' + _esc(opts.title) + '</h3>' : '')
                + '<div class="sl-dialog-msg">' + _esc(opts.message || '').replace(/\n/g, '<br>') + '</div>'
                + '<div class="sl-dialog-actions">' + btns + '</div></div>';
            document.body.appendChild(ov);
            ov.style.display = 'flex';
            requestAnimationFrame(function () { ov.classList.add('show'); });
            var done = false;
            function finish(id) {
                if (done) return; done = true; _choiceOpen = false;
                document.removeEventListener('keydown', onKey, true);
                ov.classList.remove('show');
                setTimeout(function () { try { ov.remove(); } catch (_) {} }, 180);
                resolve(id);
            }
            function onKey(e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(opts.escape || 'cancel'); }
                else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); var f = document.activeElement; finish((f && f.getAttribute && f.getAttribute('data-choice')) || opts.enter || 'cancel'); }
                else if (e.key === 'Tab') { var bs = ov.querySelectorAll('button'); if (bs.length) { var i = Array.prototype.indexOf.call(bs, document.activeElement); e.preventDefault(); bs[(i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus(); } }
            }
            Array.prototype.forEach.call(ov.querySelectorAll('button[data-choice]'), function (b) { b.addEventListener('click', function () { finish(b.getAttribute('data-choice')); }); });
            ov.addEventListener('click', function (e) { if (e.target === ov) finish(opts.escape || 'cancel'); });
            document.addEventListener('keydown', onKey, true);
            setTimeout(function () { var p = ov.querySelector('button[data-choice="' + (opts.enter || '') + '"]') || ov.querySelector('.sl-dialog-ok'); if (p) p.focus(); }, 40);
        });
    }
    W.SLChoice = { ask: choice, open: function () { return _choiceOpen; }, _setTestAnswer: function (a) { _choiceAnswer = a || null; } };

    // =======================================================================
    // State.
    // =======================================================================
    var _state = 'idle';          // idle (nothing saved this session yet) | saving | saved | error | offline
    var _savedAt = 0, _where = '', _reason = '', _reasonCode = '';
    var _localFail = null;        // why the last write on this device failed, or null
    var _cloudPending = false;    // accepted work the cloud copy does not have yet
    var _saving = null, _again = false, _retryTimer = null, _retryN = 0, _allowUnload = false;
    var _acceptedId = null;       // the id of the accepted-state slot the autosave meta points to
    var _stats = { saves: 0, ok: 0, failures: 0, retries: 0, guards: 0, asked: 0, localWrites: 0, cloudOk: 0, slotWrites: 0 };

    function holdsSync() { var A = _ack(); return !!(A && A.pending()); }
    function waiting() { var A = _ack(); return !!(A && (A.pendingUser ? A.pendingUser() : A.pending())); }
    function unsaved() { return !!_saving || !!_localFail || _cloudPending; }
    function isDirty() { return waiting() || unsaved(); }
    function _collectedCount() { try { var A = _ack(); return (A && A.collected) ? A.collected().reduce(function (t, i) { return t + (i.count || 1); }, 0) : 0; } catch (_) { return 0; } }

    // ---- the indicator: the header control and every per-view button --------------------------
    var REASON_TEXT = {
        offline: 'offline', error: 'the cloud could not be reached', refused: 'the cloud copy was changed elsewhere',
        lease: 'another tab is the active one for this project', shrink: 'the project suddenly looks almost empty, so the cloud copy was left alone',
        'not-ready': 'the app is still starting', 'provision-failed': 'the project could not be created in your workspace',
        'no-snapshot': 'the project could not be read', local: 'this device could not store it'
    };
    function _paint() {
        try { _dirtySinceSave = isDirty(); } catch (_) {}
        if (typeof document === 'undefined' || !document.getElementById) return;
        var n = _collectedCount(), cls = '', text = '', title = '';
        if (_state === 'saving' || (_saving && _state !== 'error' && _state !== 'offline')) { cls = 'saving'; text = 'Saving…'; title = 'Saving your acknowledged changes.'; }
        else if (_state === 'error' || _state === 'offline') {
            cls = 'error';
            text = 'Not saved: ' + (_state === 'offline' ? 'offline' : _short(_reasonCode)) + '. Retry';
            title = 'Not saved: ' + _reason + '. ' + (_localFail ? 'Your changes are still on screen; do not close this tab.' : 'Your changes are kept on this device and will be uploaded ' + (_state === 'offline' ? 'when you are back online' : 'automatically') + '. Click to retry now.');
        } else if (_state === 'saved') {
            text = 'Saved ' + _hhmm(_savedAt);
            title = 'Saved ' + (_where === 'cloud' ? 'on this device and to the cloud' : (_where === 'team' ? 'on this device and shared with your team' : 'on this device')) + ' at ' + _hhmm(_savedAt) + '. Acknowledged changes save automatically.';
        } else { text = 'All changes saved'; title = 'Acknowledged changes save automatically.'; }
        if (n && cls !== 'error') { cls = 'dirty'; text = n + (n === 1 ? ' move or undo' : ' moves and undos') + ' to acknowledge'; title = 'Moves and Undo / Redo are collected and acknowledged together when you leave this view. Click to acknowledge them now; they save as soon as you do.'; }
        // 15 Oct 2026: a change made by the person that waits for its acknowledgement (for example while they type)
        try { var A0 = _ack(), st0 = A0 && A0.status ? A0.status() : null; if (st0 && st0.open && st0.user && cls !== 'error' && cls !== 'saving') { cls = 'dirty'; text = 'Waiting for acknowledgement'; title = 'A change waits for your acknowledgement; it is not saved until you acknowledge it.'; } } catch (_) {}
        var el = document.getElementById('save-indicator'), txt = document.getElementById('save-indicator-text');
        if (el && txt) { el.classList.remove('saving', 'error', 'dirty'); if (cls) el.classList.add(cls); txt.textContent = text; el.title = title; }
        try {
            var views = document.querySelectorAll('.sl-view-save');
            for (var i = 0; i < views.length; i++) {
                var b = views[i]; b.classList.remove('saving', 'error', 'dirty'); if (cls) b.classList.add(cls); b.title = title;
                var t = b.querySelector('.sl-view-save-text'); if (t) t.textContent = text;
            }
        } catch (_) {}
        try { var drawerBtn = document.getElementById('node-drawer-save'); if (drawerBtn) drawerBtn.classList.toggle('has-unsaved', isDirty()); } catch (_) {}
    }
    function _short(code) { return ({ error: 'no connection to the cloud', refused: 'cloud copy changed', lease: 'another tab is active', shrink: 'paused', local: 'this device', 'provision-failed': 'workspace', 'not-ready': 'starting', 'no-snapshot': 'unreadable' })[code] || 'error'; }
    // helpers_modules._updateSaveIndicator hands its signal here: a local write that failed is a
    // failure to say; everything else is painted from this module's own state.
    function renderIndicator(hint) {
        // (a 'saved' hint is NOT taken as proof: the label is also refreshed on a timer and by writes
        // that store nothing; a failure clears only when a save of the accepted project succeeds)
        if (hint === 'error' && !_saving) { _localFail = 'local'; _setError('local', REASON_TEXT.local); _scheduleRetry(); }
        _paint();
    }
    function _setError(code, text) { _reasonCode = code; _reason = text || REASON_TEXT[code] || code; _state = (code === 'offline') ? 'offline' : 'error'; }

    // ---- this device -------------------------------------------------------------------------
    function _writeLocal(acc) {
        _stats.localWrites++;
        var A = _ack(), r;
        var slotP = acc ? _writeSlot(acc) : null;   // moves still wait: the accepted state is its own copy (its id goes into the meta written next)
        try {
            var run = function () { return (typeof W._writeAutosave === 'function') ? W._writeAutosave() : true; };
            r = A ? A.system(run) : run();
        } catch (e) { return Promise.resolve('could not write: ' + (e && e.message || e)); }
        if (r === false) return Promise.resolve(typeof W.tgHasLease === 'function' && !W.tgHasLease() ? 'lease' : 'local');
        var waits = [];
        var idb = W.__slAutosaveIdb;
        var ls = W.__slAutosaveLs;
        if (idb && typeof idb.then === 'function') waits.push(_timeout(idb, LOCAL_WAIT_MS, ls === true));
        if (slotP) waits.push(slotP);
        return Promise.all(waits).then(function (rs) {
            if (idb && rs[0] === false && ls !== true) return 'local';
            return null;
        });
    }
    function _db() { try { return (typeof SLDB !== 'undefined' && SLDB.available()) ? SLDB : null; } catch (_) { return null; } }
    function _writeSlot(snapStr) {
        var D = _db(); if (!D || typeof snapStr !== 'string') return Promise.resolve(false);
        var id = _now().toString(36) + Math.random().toString(36).slice(2, 7);
        _acceptedId = id; _stats.slotWrites++;
        var z = (typeof W._maybeCompress === 'function') ? W._maybeCompress(snapStr) : Promise.resolve(snapStr);
        return _timeout(z.then(function (v) { return D.set(ACCEPTED_KEY, { id: id, ts: _now(), snap: v }); }).then(function () { return true; }, function () { return false; }), LOCAL_WAIT_MS, false);
    }
    // what the autosave meta carries (helpers_modules._writeAutosave)
    function autosaveMeta() { var h = holdsSync(); return { unacked: h, cloudPending: _cloudPending, acceptedId: h ? _acceptedId : null }; }

    // ---- the save ----------------------------------------------------------------------------
    var NO_CLOUD = { 'signed-out': 1, itar: 1, 'no-content': 1, demo: 1, paywall: 1, off: 1, 'no-workspace': 1, current: 1, skipped: 1 };
    function _requestSave() {
        if (_saving) { _again = true; return _saving; }
        _saving = _doSave().then(function (ok) {
            _saving = null;
            if (_again) { _again = false; return _requestSave(); }
            _paint();
            return ok;
        }, function (e) { _saving = null; try { console.warn('[autosave] save failed', e); } catch (_) {} _setError('error', String(e && e.message || e)); _paint(); return false; });
        return _saving;
    }
    async function _doSave() {
        _stats.saves++;
        if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
        var A = _ack(), acc = (A && A.acceptedSnapshot) ? A.acceptedSnapshot() : null;   // null: nothing waits, the live project is the accepted one
        if (acc != null && !(A && A.pending())) acc = null;
        if (_signedIn() && typeof W.__slCloudSyncPushNow === 'function') _cloudPending = true;   // recorded in the meta written next: a crash retries the upload
        _state = 'saving'; _paint();
        // 1. this device, waited for
        var lf = await _writeLocal(acc);
        _localFail = lf;
        // 2. the live sync: teammates see it (held while moves still wait; they go together)
        var C = _crdt(), team = false;
        if (C && !holdsSync()) { try { C.release(); team = !!(C.status().online !== false); } catch (_) {} }
        else if (C && acc && C.pushAccepted) { try { team = C.pushAccepted(JSON.parse(acc)) === true && C.status().online !== false; } catch (_) {} }   // moves still wait: this change goes on its own
        // 3. the cloud copy
        var r = { ok: false, reason: 'signed-out' };
        if (typeof W.__slCloudSyncPushNow === 'function') {
            try { r = (await W.__slCloudSyncPushNow({ snapshot: acc })) || r; } catch (e) { r = { ok: false, reason: 'error', error: e }; }
        }
        var code = r.ok ? 'ok' : r.reason;
        if (code === 'refused' && team) code = 'ok-team';     // the live doc carries the change; the backup copy catches up on the next push
        var wasMarked = _cloudPending;
        if (code === 'ok' || code === 'ok-team' || NO_CLOUD[code]) {
            _cloudPending = false;
            if (code === 'ok') _stats.cloudOk++;
        } else {
            _cloudPending = true;
            if (!wasMarked && !lf) { try { _writeLocal(acc); } catch (_) {} }   // the meta on this device now says an upload is pending (a crash retries it)
        }
        if (lf) {
            _stats.failures++;
            _setError(lf === 'lease' ? 'lease' : 'local', lf === 'lease' ? REASON_TEXT.lease : (REASON_TEXT.local + (lf !== 'local' ? ' (' + lf + ')' : '')));
            _scheduleRetry();
            return false;
        }
        if (_cloudPending) {
            _stats.failures++;
            var why = REASON_TEXT[code] || code;
            if (code === 'error' && r.error) why += ' (' + String(r.error.message || r.error).slice(0, 120) + ')';
            _setError(code === 'offline' ? 'offline' : code, why);
            if (code !== 'shrink' && code !== 'refused') _scheduleRetry();
            return false;
        }
        _state = 'saved'; _savedAt = _now(); _reason = ''; _reasonCode = ''; _retryN = 0;
        _where = (code === 'ok') ? 'cloud' : ((team || code === 'ok-team') ? 'team' : 'device');
        _stats.ok++;
        try { if (typeof W.__slCloudSyncSchedule === 'function' && !holdsSync()) W.__slCloudSyncSchedule(); } catch (_) {}
        return true;
    }
    function _scheduleRetry() {
        if (_retryTimer) return;
        if (!_online()) return;                    // the 'online' event retries
        var ms = RETRY_MS[Math.min(_retryN, RETRY_MS.length - 1)];
        _retryN++;
        _retryTimer = setTimeout(function () { _retryTimer = null; if (_cloudPending || _localFail) { _stats.retries++; _requestSave(); } }, ms);
    }

    // Let held work go after a decision that saved nothing new (Cancel, a background change).
    function _release() {
        if (holdsSync()) return;
        try { var C = _crdt(); if (C && C.release) C.release(); } catch (_) {}
        try { if (typeof W.__slCloudSyncSchedule === 'function') W.__slCloudSyncSchedule(); } catch (_) {}
    }

    // ---- change_ack.js hooks ------------------------------------------------------------------
    // Something starts waiting: if it is the first thing, its "before" is the accepted state; keep a
    // copy of it on this device so a crash can ask about the waiting change again.
    function _ackOpened(w) {
        try {
            var A = _ack();
            var others = A && A.status ? A.status() : null;
            var first = !others || !((others.open && others.collecting));   // a window opening inside a collection: the accepted state did not change
            if (first && w && typeof w.baseline === 'string' && !w.noRevert) _writeSlot(w.baseline);
        } catch (_) {}
        _paint();
    }
    var _slotTimer = null;
    function _ackClosed(w, decision) {
        if (decision === 'kept') { _requestSave(); return; }
        if (decision === 'automatic' && holdsSync() && !_slotTimer) {   // moves still wait: the accepted copy takes the app's own change too
            _slotTimer = setTimeout(function () { _slotTimer = null; try { var A = _ack(), acc = (A && A.pending() && A.acceptedSnapshot) ? A.acceptedSnapshot() : null; if (acc) _writeSlot(acc); } catch (_) {} }, 1000);
        }
        setTimeout(function () { _release(); _paint(); }, 0);
    }

    // ---- teammates' work, while something here waits for an acknowledgement ------------------------
    // The live sync keeps it in the shared doc and brings it in when nothing waits any more
    // (crdt_sync.js release(): push first, then pull).
    function remoteArrived() { _paint(); }

    // ---- Save now (Ctrl+S, the header control, the per-view buttons) ----------------------------
    // Asks about anything waiting first; retries a failed save; after a "changed elsewhere" refusal
    // with no live sync, runs the manual cloud save, which asks to overwrite or to load.
    async function save() {
        var A = _ack();
        if (A && A.pending()) await A.flush();
        if (_reasonCode === 'refused' && typeof W.saveProjectToCloud === 'function') {
            var ok = false;
            try { ok = (await W.saveProjectToCloud()) === true; } catch (_) {}
            if (ok) { _cloudPending = false; _state = 'saved'; _savedAt = _now(); _where = 'cloud'; _reasonCode = ''; _reason = ''; _paint(); return true; }
        }
        _retryN = 0;
        return _requestSave();
    }

    // ---- leaving or replacing the project --------------------------------------------------------
    async function guard(reason) {
        _stats.guards++;
        var A = _ack();
        if (A && A.pending()) await A.flush();             // the waiting change and the collected moves are asked about first
        if (_saving) { try { await _saving; } catch (_) {} }
        if (_cloudPending || _localFail) { try { await _requestSave(); } catch (_) {} }   // one more try, now
        if (!_cloudPending && !_localFail) return true;
        _stats.asked++;
        var where = _localFail ? 'could not be stored on this device' : 'are not in the cloud yet';
        var c = await choice({
            title: 'Not saved yet',
            message: 'Your latest acknowledged changes to "' + _projName() + '" ' + where + ((_reasonCode === 'local' || !_reason) ? '' : ' (' + _reason + ')') + '.\n'
                + (_localFail ? 'If you continue, a copy goes to the recovery list on the Thread Integrity page first.' : 'They are kept on this device and in the recovery list on the Thread Integrity page, and upload the next time you open this project here.')
                + '\nStay here to retry, or continue to ' + (reason || 'go on') + ' anyway.',
            buttons: [{ id: 'leave', label: 'Continue anyway' }, { id: 'stay', label: 'Stay', kind: 'primary' }],
            escape: 'stay', enter: 'stay'
        });
        if (c !== 'leave') { _retryN = 0; _requestSave(); return false; }
        try { if (typeof W._bankWorkingState === 'function') W._bankWorkingState(); } catch (_) {}
        _jr('save-pending', 'Left with acknowledged changes not yet ' + (_localFail ? 'stored on this device' : 'in the cloud') + ' (' + (_reason || '') + '); a copy is in the recovery list');
        return true;
    }

    // ---- a project was opened or replaced: it is what is saved now ---------------------------
    function replaced() {
        var A = _ack(); if (A) A.settle();
        if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
        _cloudPending = false; _localFail = null; _again = false; _retryN = 0;
        _state = 'idle'; _reason = ''; _reasonCode = ''; _savedAt = 0; _where = '';
        _paint();
    }
    // Boot recovery restored the autosave. An upload that never landed is retried; changes that were
    // still waiting for an acknowledgement are asked about again, measured from the accepted state.
    function recovered(meta, restored) {
        var A = _ack(); if (A) A.settle();
        meta = meta || {};
        // a copy, now: the restore adopted the parsed stores by reference, and the app keeps writing to them
        if (meta.unacked && restored) { try { restored = (typeof restored === 'string') ? JSON.parse(restored) : JSON.parse(JSON.stringify(restored)); } catch (_) { restored = null; } }   // the restore as stored (the apply normalizes parsed rows in place)
        if (meta.cloudPending) {
            _cloudPending = true; _setError(_online() ? 'error' : 'offline', _online() ? 'the last upload had not finished' : REASON_TEXT.offline);
            setTimeout(function () { if (_cloudPending) _requestSave(); }, 2500);
        }
        if (meta.unacked) {
            var D = _db();
            var ask = function (snap) {
                if (typeof snap !== 'string' || !A || !A.reopen) {
                    _jr('recovered-unacknowledged', 'Changes from the last session that were not acknowledged came back without the accepted copy to compare them with; they stay as they are');
                    _toast('Changes from your last session that were not acknowledged are back on screen. Use Undo to take any of them back.', 'info', 7000);
                    return;
                }
                var tries = 0;
                var go = function () {
                    var opened = A.reopen(snap, 'Changes from your last session that were not acknowledged', restored || null);
                    if (opened === 'busy' && ++tries < 40) { setTimeout(go, 1500); return; }   // the person is mid-change: right after it
                    if (opened === true) _toast('Changes from your last session were not acknowledged. Check them: Acknowledge saves them, Cancel change returns to what was saved.', 'info', 7000);
                };
                setTimeout(go, 1500);
            };
            if (!D) { ask(null); }
            else {
                D.get(ACCEPTED_KEY).then(function (v) {
                    if (!v || (meta.acceptedId && v.id !== meta.acceptedId)) return null;
                    return (typeof W._maybeDecompress === 'function') ? W._maybeDecompress(v.snap) : v.snap;
                }).then(ask, function () { ask(null); });
            }
        }
        _paint();
    }
    // Undo / redo restored a snapshot (helpers_modules). With the acknowledgement funnel these are
    // collected and saved when acknowledged; without it, they save at once.
    function afterLocalRestore() { if (!_ack()) _requestSave(); else _paint(); }

    // ---- where people leave or replace the open project ----------------------------------------
    var GUARDS = {
        loadSampleProject: 'open the sample project', loadKestrelRj: 'open a demo project', loadSoraShowcase: 'open a demo project',
        loadHL1Demo: 'open a demo project', loadHalcyonDemo: 'open a demo project', loadVayuDemo: 'open a demo project',
        loadProject: 'open another project', _loadCloudProject: 'open another project', openProjectFromFolder: 'open another project',
        importProjectBundle: 'open another project', createNewProject: 'start a new project', openNewProjectWizard: 'start a new project',
        npwCreate: 'start a new project', _applyServerRestore: 'restore an earlier version', supabaseSignOut: 'sign out',
        recoverAutosave: 'restore the autosave', recoverLastGood: 'restore the earlier snapshot', ringRestore: 'restore an earlier autosave'
    };
    // these replace the open project: after them, what is on screen is what is saved
    var LOADERS = { loadSampleProject: 1, loadKestrelRj: 1, loadSoraShowcase: 1, loadHL1Demo: 1, loadHalcyonDemo: 1, loadVayuDemo: 1, loadProject: 1, _loadCloudProject: 1, openProjectFromFolder: 1, importProjectBundle: 1, createNewProject: 1, npwCreate: 1, _applyServerRestore: 1, recoverAutosave: 1, recoverLastGood: 1, ringRestore: 1, _tgLoadNewest: 1 };
    function _needsGuard() { return waiting() || unsaved(); }
    function _wrap(name) {
        var fn = W[name];
        if (typeof fn !== 'function' || fn._slSaveGuard) return false;
        var reason = GUARDS[name], loader = !!LOADERS[name];
        var run = function (self, args) {
            if (!loader) return fn.apply(self, args);
            var A = _ack();
            var body = function () {
                var r = fn.apply(self, args);
                if (r && typeof r.then === 'function') return r.then(function (v) { replaced(); return v; }, function (e) { replaced(); throw e; });
                replaced(); return r;
            };
            return A ? A.systemAsync(body) : body();
        };
        var wrapped = function () {
            var self = this, args = arguments;
            if (!reason || !_needsGuard()) return run(self, args);   // _tgLoadNewest: its own conflict dialog is the decision
            return guard(reason).then(function (ok) {
                if (!ok) { try { var ev = args[0]; if (name === 'loadProject' && ev && ev.target && 'value' in ev.target) ev.target.value = ''; } catch (_) {} return undefined; }
                return run(self, args);
            });
        };
        wrapped._slSaveGuard = true;
        try { if (W.SLWrap) W.SLWrap.preserve(fn, wrapped); } catch (_) {}
        W[name] = wrapped;
        return true;
    }
    function _wrapAll() { Object.keys(GUARDS).concat(Object.keys(LOADERS)).forEach(_wrap); }

    function _isDesktop() { try { return !!(W.__slabDesktop || (W.slabDesktop && W.slabDesktop.isDesktop) || (navigator.userAgent || '').indexOf('Electron') >= 0); } catch (_) { return false; } }
    var _closing = false;
    function _desktopClose() {
        if (_closing) return; _closing = true;
        guard('close the window').then(function (ok) {
            _closing = false;
            if (!ok) return;
            _allowUnload = true;
            try { if (W.slabDesktop && typeof W.slabDesktop.closeWindow === 'function') { W.slabDesktop.closeWindow(); return; } } catch (_) {}
            try { W.close(); } catch (_) {}
        }, function () { _closing = false; });
    }
    if (typeof W.addEventListener === 'function') {
        W.addEventListener('beforeunload', function (e) {
            if (_allowUnload || !_needsGuard()) return undefined;
            if (_isDesktop()) { e.preventDefault(); e.returnValue = false; setTimeout(_desktopClose, 0); return false; }
            e.preventDefault(); e.returnValue = ''; return '';
        });
        W.addEventListener('online', function () { if (_cloudPending || _localFail) { _retryN = 0; _requestSave(); } });
        W.addEventListener('offline', function () { if (_cloudPending) { _setError('offline', REASON_TEXT.offline); _paint(); } });
        // Ctrl+S / Cmd+S: save now (and acknowledge what waits), wherever focus is
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
                if (document.querySelector('#sl-ack-overlay, #sl-choice-overlay')) return;
                e.preventDefault(); e.stopImmediatePropagation();
                save();
            }
        }, true);
        W.addEventListener('load', function () { _wrapAll(); var t = 0, iv = setInterval(function () { _wrapAll(); if (++t >= 20) clearInterval(iv); }, 500); _paint(); });
        // the collected count and the saved time stay current
        W.addEventListener('sl:change-ack', function () { setTimeout(_paint, 0); });
    }
    _wrapAll();

    W.__slabCanClose = function () { return !_needsGuard(); };
    W.__slabRequestClose = function () { return guard('close the window').then(function (ok) { if (ok) _allowUnload = true; return ok; }); };

    W.SLSaveState = {
        isDirty: isDirty, waiting: waiting, unsaved: unsaved, holdsSync: holdsSync, save: save, guard: guard,
        remoteArrived: remoteArrived, replaced: replaced, recovered: recovered, afterLocalRestore: afterLocalRestore,
        renderIndicator: renderIndicator, autosaveMeta: autosaveMeta,
        whenSaved: function () { return _saving || Promise.resolve(!(_cloudPending || _localFail)); },
        status: function () { return { state: _state, savedAt: _savedAt, where: _where, reason: _reason, reasonCode: _reasonCode, cloudPending: _cloudPending, localFail: _localFail, waiting: waiting(), saving: !!_saving, collected: _collectedCount(), acceptedId: _acceptedId, stats: JSON.parse(JSON.stringify(_stats)) }; },
        _ackOpened: _ackOpened, _ackClosed: _ackClosed, _wrapAll: _wrapAll, _allowUnload: function (v) { _allowUnload = !!v; }, _paint: _paint,
        ACCEPTED_KEY: ACCEPTED_KEY, RETRY_MS: RETRY_MS
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = W.SLSaveState;
})();

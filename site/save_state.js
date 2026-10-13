// ============================================================================
// save_state.js — v1.0 — 13 Oct 2026 — saving works like Microsoft Office.
//
// WAQAS, 12 OCT (hand testing, ruling 3): unsaved changes work like Office: Save / Don't Save /
// Cancel when closing, opening another project, leaving the page and the like.
//
// THE MODEL (Word with AutoSave off, in a co-authored document):
//   · Every acknowledged change (change_ack.js) is YOUR UNSAVED WORK until you press Save. The
//     header says "Unsaved changes"; Save (the header control, Ctrl+S) makes it "Saved".
//   · Unsaved work is NEVER only in memory: the local autosave (localStorage + IndexedDB + the
//     disk file) keeps writing it after every change, marked unsaved, together with the saved
//     version it started from. A crash or a closed tab brings it back on the next open, still
//     unsaved, with Save and Don't Save both available.
//   · Unsaved work is NOT SHARED: while there is any, the live sync (crdt_sync.js) sends nothing
//     and the cloud autosave (cloud_sync.js) pushes nothing. Teammates only ever see saved
//     change sets, never a half-made edit. Save sends it, in one go.
//   · Teammates' saved work still ARRIVES while you have unsaved work: their change is merged
//     into the shared copy, and this tab shows it with your unsaved records laid back on top
//     (rebase: the shared copy + your record-level changes since the saved version, by the same
//     row keys the sync uses). Where you both changed the same record, yours is on your screen
//     and goes out on Save (the sync's existing last-writer rule; field locks guard it).
//   · Don't Save puts the project back to the saved version and takes the shared copy as it is
//     now (so teammates' work is kept). The journal keeps a line for every acknowledged change
//     that was not saved, so the audit trail never loses an acknowledgement.
//   · Asked at: closing the tab or leaving the page (the browser's own prompt: browsers allow
//     nothing else there), opening a project (file, folder, bundle, cloud, demo), starting a
//     new project, restoring an earlier version, signing out, and the desktop window close.
//
// DESKTOP. The Electron shell's main process should, in the window 'close' handler, call
// event.preventDefault(), then `await webContents.executeJavaScript('window.__slabRequestClose()')`
// and destroy the window only when it resolves true. Without that, this page cancels the
// unload itself (Electron cancels a close silently when beforeunload sets returnValue), asks,
// and then calls window.slabDesktop.closeWindow() (preload API to add) or window.close().
// window.__slabCanClose() answers synchronously for a quick check.
//
// Tests: tests/regression_save_state_20261013b.test.js (unit) and the browser suite
// tests/regression_change_ack_ui_20261013b.test.js.
// ============================================================================
(function () {
    'use strict';
    var W = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
    var SAVED_POINT_KEY = 'safetyLab.savedPoint.v1';
    var REBASE_MS = 1500;

    function _now() { return Date.now(); }
    function _P(s) { try { return s == null ? undefined : JSON.parse(s); } catch (_) { return undefined; } }
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _ack() { return W.SLChangeAck || null; }
    function _crdt() { try { var C = W.SafetyLabCRDT; return (C && C.status && C.status().started) ? C : null; } catch (_) { return null; } }
    function _toast(m, k, t) { try { if (typeof W.showToast === 'function') W.showToast(m, k || 'info', t || 3000); } catch (_) {} }
    function _jr(kind, msg) { try { if (typeof W.jrnl === 'function') W.jrnl(kind, msg); } catch (_) {} }
    function _who() {
        try { var s = (typeof _supabaseSession !== 'undefined') ? _supabaseSession : null; if (s && s.user && s.user.email) return s.user.email; } catch (_) {}
        try { if (typeof W._wsUser === 'function') { var u = W._wsUser(); if (u && u.email) return u.email; } } catch (_) {}
        return 'Not signed in';
    }
    function _signedIn() { try { return !!(typeof _supabaseSession !== 'undefined' && _supabaseSession && _supabaseSession.user); } catch (_) { return false; } }
    function _projName() { try { if (typeof projectName !== 'undefined' && projectName) return String(projectName); } catch (_) {} return 'this project'; }

    // =======================================================================
    // SLChoice: a house dialog with any number of buttons (Save / Don't Save / Cancel).
    // Same card and classes as slConfirm (misc_fn_modules _slDialogShow).
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
    // The state machine.  clean <-> pending (unsaved), plus "remote waiting" while pending.
    // =======================================================================
    var _pending = false, _S = null, _SR = null, _since = 0, _acks = [], _remote = false, _rebased = false, _seedOnSave = false;
    var _saving = null, _allowUnload = false, _rebaseTimer = null, _stats = { saves: 0, discards: 0, rebases: 0, guards: 0, asked: 0 };

    function _setDirty(v) { try { _dirtySinceSave = !!v; } catch (_) {} _ind(); }
    function _ind(state) {
        try { if (typeof W._updateSaveIndicator === 'function') W._updateSaveIndicator(state || 'saved'); } catch (_) {}
        try {
            var el = (typeof document !== 'undefined') ? document.getElementById('save-indicator') : null;
            if (el) el.title = _pending
                ? 'You have unsaved changes. They are kept on this device and are not shared until you save. Click to save (Ctrl+S).'
                : 'All changes are saved.';
        } catch (_) {}
    }
    function _persist() {
        try {
            if (typeof SLDB === 'undefined' || !SLDB.available() || !_S) return;
            var put = function (v) { return SLDB.set(SAVED_POINT_KEY, v); };
            (typeof W._maybeCompress === 'function' ? W._maybeCompress(_S) : Promise.resolve(_S)).then(put).catch(function () {});
        } catch (_) {}
    }
    function _unpersist() { try { if (typeof SLDB !== 'undefined' && SLDB.available()) SLDB.del(SAVED_POINT_KEY); } catch (_) {} }
    function _clean() {
        _pending = false; _S = null; _SR = null; _since = 0; _acks = []; _rebased = false; _seedOnSave = false;
        if (_rebaseTimer) { clearTimeout(_rebaseTimer); _rebaseTimer = null; }
        _unpersist();
        _setDirty(false);
    }
    function _beginPending(baseline) {
        if (_pending) return;
        _pending = true; _S = baseline || null; _SR = null; _since = _now(); _acks = []; _rebased = false;
        _persist();
        _setDirty(true);
    }
    function isDirty() { return _pending; }
    function holdsSync() { var A = _ack(); return _pending || !!(A && A.pending()); }

    // Let held work go: the live sync pushes (or pulls what arrived while it waited) and the cloud
    // autosave gets its turn.
    function _release() {
        if (holdsSync()) return;
        try { var C = _crdt(); if (C && C.release) C.release(); } catch (_) {}
        _remote = false;
        try { if (typeof W.__slCloudSyncSchedule === 'function') W.__slCloudSyncSchedule(); } catch (_) {}
    }

    // ---- change_ack.js hooks --------------------------------------------------
    function _ackOpened() { /* holdsSync() now answers true: the sync waits for the decision */ }
    function _ackClosed(w, decision) {
        if (decision === 'kept') {
            _beginPending(w.baseline);
            try { _acks.push((W.SLRecords && w.items) ? W.SLRecords.summarize(w.items, 2) : 'a change'); } catch (_) { _acks.push('a change'); }
            _setDirty(true);
        }
        _setDirty(_pending);   // the header says exactly what this module knows (a module that set the old flag by hand cannot make it lie)
        if (!_pending) { setTimeout(_release, 0); return; }
        if (_remote) _scheduleRebase();
    }

    // ---- teammates' saved work, while this tab has unsaved work -----------------------------
    function remoteArrived() {
        _remote = true;
        if (_pending) _scheduleRebase();
    }
    function _scheduleRebase(ms) { if (_rebaseTimer) return; _rebaseTimer = setTimeout(_tryRebase, ms == null ? REBASE_MS : ms); }
    function _tryRebase() {
        _rebaseTimer = null;
        if (!_pending || !_remote) return;
        var A = _ack();
        if ((A && (A.pending() || (A.busy && A.busy()))) || _saving) { _scheduleRebase(); return; }
        rebase();
    }
    // The shared copy as it is now, with this person's unsaved records laid back on top.
    function rebase() {
        var C = _crdt(), R = W.SLRecords, A = _ack();
        if (!C || !_pending || !R) return false;
        if (!C.docHasContent || !C.docHasContent()) { _seedOnSave = true; _remote = false; return true; }   // nothing shared yet: Save seeds it
        try {
            var run;
            if (_S) {
                if (!_SR) _SR = R.records(_P(_S) || {});
                var D = R.diff(_SR, R.records(R.live()));
                run = function () { C.pull({ load: true, rebase: true }); R.applyToModel(D); };
            } else {
                // No saved version on this device (a crash whose copy of it was lost): every record
                // on screen that differs from the shared copy is taken as this person's, and nothing
                // the shared copy holds is deleted. Their deletions since the saved version are the
                // only thing this cannot carry; nobody else's work is ever removed.
                var mine = R.records(R.live());
                run = function () {
                    C.pull({ load: true, rebase: true });
                    var D2 = R.diff(R.records(R.live()), mine).filter(function (e) { return e.op !== 'removed'; });
                    R.applyToModel(D2);
                };
            }
            if (A) A.system(run); else run();
            _remote = false; _rebased = true; _stats.rebases++;
            return true;
        } catch (e) { try { console.warn('[save-state] rebase failed', e); } catch (_) {} return false; }
    }

    // ---- Save ---------------------------------------------------------------------------
    function save() {
        if (_saving) return _saving;
        _saving = (async function () {
            try {
                var A = _ack();
                if (A) await A.flush();                       // every change is acknowledged (or canceled) before it is saved
                var was = _pending, n = _acks.length, C = _crdt();
                _ind('saving');
                if (was && C) {
                    if (!C.baseLive || !C.baseLive()) rebase();   // the sync started while this work was unsaved: measure it against the shared copy first
                    if (!_seedOnSave && C.baseLive && !C.baseLive() && C.docHasContent && C.docHasContent()) {
                        // never let the work go out unmeasured (it would be dropped or overwrite newer work): stay unsaved, say so
                        _ind('error');
                        _toast('Could not save just now: the shared copy could not be read. Your changes are kept on this device; try Save again.', 'warning', 6000);
                        return false;
                    }
                    var seed = _seedOnSave;
                    _clean();
                    try { C.release(seed ? { seed: true } : {}); } catch (_) {}
                } else if (was) _clean();
                _remote = false;
                try { if (A) A.system(function () { if (typeof W._writeAutosave === 'function') W._writeAutosave(); }); else if (typeof W._writeAutosave === 'function') W._writeAutosave(); } catch (e) { try { console.warn('Local save failed:', e); } catch (_) {} }
                var cloud = false;
                if (_signedIn() && typeof W.saveProjectToCloud === 'function') {
                    try { cloud = (await W.saveProjectToCloud()) === true; } catch (e) { try { console.warn('Cloud save failed:', e); } catch (_) {} }
                }
                _stats.saves++;
                _setDirty(_pending);
                if (was) _jr('save', _who() + ' saved ' + (n || 'the') + ' acknowledged change' + (n === 1 ? '' : 's') + (C ? ' and shared them with the team' : ''));
                _ind('saved');
                _toast(cloud ? 'Saved, on this device and to the cloud.' : (C ? 'Saved and shared with your team.' : 'Saved on this device.'), 'success', 2200);
                try { if (typeof W.__slCloudSyncSchedule === 'function') W.__slCloudSyncSchedule(); } catch (_) {}
                return true;
            } finally { _saving = null; }
        })();
        return _saving;
    }

    // ---- Don't Save ---------------------------------------------------------------------------
    function discard() {
        var A = _ack(), C = _crdt();
        if (A) A.drop({ revert: true });
        if (!_pending) return Promise.resolve(true);
        var S = _S, acks = _acks.slice();
        if (!S && !C) {
            return Promise.resolve(typeof W.slAlert === 'function' ? W.slAlert('The saved version of this project is not on this device any more, so these changes cannot be discarded here. Use Undo to take them back, or open the saved copy.', { title: 'Cannot discard' }) : null).then(function () { return false; });
        }
        if (S && A) A.revertTo(S, null);
        _clean();
        if (C) { try { C.release({ discard: true }); } catch (_) {} }
        _remote = false;
        _stats.discards++;
        acks.slice(0, 40).forEach(function (s) { _jr('change-not-saved', 'Not saved (Don’t Save): ' + s); });
        _jr('discard', _who() + ' chose Don’t Save: ' + acks.length + ' acknowledged change' + (acks.length === 1 ? ' was' : 's were') + ' not saved' + (acks.length > 40 ? ' (the first 40 are listed)' : ''));
        try { if (A) A.system(function () { if (typeof W.scheduleAutosave === 'function') W.scheduleAutosave(); }); } catch (_) {}
        _toast('Your unsaved changes were discarded. This is the saved version.', 'info', 3500);
        return Promise.resolve(true);
    }

    // ---- Save / Don't Save / Cancel ------------------------------------------------------------
    function _needsAsk() { var A = _ack(); return _pending || !!(A && (A.pendingUser ? A.pendingUser() : A.pending())); }
    async function guard(reason) {
        _stats.guards++;
        var A = _ack();
        if (A && A.pending()) await A.flush();   // the change in progress is acknowledged (or canceled) first
        if (!_pending) return true;
        _stats.asked++;
        var n = _acks.length, mins = Math.max(0, Math.round((_now() - _since) / 60000));
        var when = !_since ? '' : (mins < 1 ? ' in the last minute' : (mins < 60 ? ' over the last ' + mins + ' min' : ' since ' + new Date(_since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
        var c = await choice({
            title: 'Save your changes?',
            message: 'You have unsaved changes in "' + _projName() + '"' + (n ? ' (' + n + ' acknowledged change' + (n === 1 ? '' : 's') + when + ')' : '') + '.\nDo you want to save them before you ' + (reason || 'continue') + '?',
            buttons: [{ id: 'discard', label: 'Don’t Save' }, { id: 'cancel', label: 'Cancel' }, { id: 'save', label: 'Save', kind: 'primary' }],
            escape: 'cancel', enter: 'save'
        });
        if (c === 'save') { try { await save(); } catch (_) { return false; } return !_pending; }
        if (c === 'discard') { var ok = await discard(); return ok !== false; }
        return false;
    }

    // ---- a project was opened or replaced: that is the saved version now ---------------------
    function replaced() {
        var A = _ack(); if (A) A.settle();
        _clean(); _remote = false;
    }
    // Boot recovery restored the autosave: if it was unsaved work, it still is.
    function recovered(meta) {
        var A = _ack(); if (A) A.settle();
        if (!(meta && meta.unsaved)) { if (!_pending) _clean(); return; }
        _pending = true; _S = null; _SR = null; _since = meta.unsavedSince || _now(); _acks = (Array.isArray(meta.unsavedAcks) ? meta.unsavedAcks.slice(0, 200) : []);
        _setDirty(true);
        try {
            if (typeof SLDB !== 'undefined' && SLDB.available()) {
                SLDB.get(SAVED_POINT_KEY).then(function (v) { return (typeof W._maybeDecompress === 'function') ? W._maybeDecompress(v) : v; })
                    .then(function (s) { if (_pending && !_S && typeof s === 'string') _S = s; }).catch(function () {});
            }
        } catch (_) {}
        _toast('Unsaved changes from your last session are back. Save them, or close and choose Don’t Save to return to the saved version.', 'info', 7000);
    }
    // Undo / redo restored a snapshot (helpers_modules). Back at the saved version = clean; away
    // from a clean state = unsaved work, measured from where it was.
    function afterLocalRestore(restored, before) {
        var A = _ack();
        if (_pending) {
            if (_S && (restored === _S || (A && A.sameContent && A.sameContent(_S)))) { _clean(); setTimeout(_release, 0); return; }
            if (_crdt() && (_rebased || _remote)) { _remote = true; _scheduleRebase(50); }
            return;
        }
        if (before && restored !== before && !(A && A.sameContent && A.sameContent(before))) { _beginPending(before); _acks.push('undo or redo'); }
    }

    // ---- where people leave or replace the open project ----------------------------------------
    var GUARDS = {
        loadSampleProject: 'open the sample project', loadKestrelRj: 'open a demo project', loadSoraShowcase: 'open a demo project',
        loadHL1Demo: 'open a demo project', loadHalcyonDemo: 'open a demo project', loadVayuDemo: 'open a demo project',
        loadProject: 'open another project', _loadCloudProject: 'open another project', openProjectFromFolder: 'open another project',
        importProjectBundle: 'open another project', createNewProject: 'start a new project', openNewProjectWizard: 'start a new project',
        npwCreate: 'start a new project', _applyServerRestore: 'restore an earlier version', supabaseSignOut: 'sign out',
        recoverAutosave: 'restore the autosave', recoverLastGood: 'restore the earlier snapshot', ringRestore: 'restore an earlier autosave'
    };
    // these replace the open project: after them, what is on screen is the saved version
    var LOADERS = { loadSampleProject: 1, loadKestrelRj: 1, loadSoraShowcase: 1, loadHL1Demo: 1, loadHalcyonDemo: 1, loadVayuDemo: 1, loadProject: 1, _loadCloudProject: 1, openProjectFromFolder: 1, importProjectBundle: 1, createNewProject: 1, npwCreate: 1, _applyServerRestore: 1, recoverAutosave: 1, recoverLastGood: 1, ringRestore: 1, _tgLoadNewest: 1 };
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
            if (!reason || !_needsAsk()) return run(self, args);   // _tgLoadNewest: its own conflict dialog is the decision
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
    function _desktopClose() {
        guard('close the window').then(function (ok) {
            if (!ok) return;
            _allowUnload = true;
            try { if (W.slabDesktop && typeof W.slabDesktop.closeWindow === 'function') { W.slabDesktop.closeWindow(); return; } } catch (_) {}
            try { W.close(); } catch (_) {}
        });
    }
    if (typeof W.addEventListener === 'function') {
        W.addEventListener('beforeunload', function (e) {
            if (_allowUnload || !_needsAsk()) return undefined;
            if (_isDesktop()) { e.preventDefault(); e.returnValue = false; setTimeout(_desktopClose, 0); return false; }
            e.preventDefault(); e.returnValue = ''; return '';
        });
        // Ctrl+S / Cmd+S saves, wherever focus is (a text field included)
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
                if (document.querySelector('#sl-ack-overlay, #sl-choice-overlay')) return;
                e.preventDefault(); e.stopImmediatePropagation();
                save();
            }
        }, true);
        W.addEventListener('load', function () { _wrapAll(); var t = 0, iv = setInterval(function () { _wrapAll(); if (++t >= 20) clearInterval(iv); }, 500); _ind(); });
    }
    _wrapAll();

    W.__slabCanClose = function () { return !_needsAsk(); };
    W.__slabRequestClose = function () { return guard('close the window').then(function (ok) { if (ok) _allowUnload = true; return ok; }); };

    W.SLSaveState = {
        isDirty: isDirty, holdsSync: holdsSync, save: save, discard: discard, guard: guard, rebase: rebase,
        remoteArrived: remoteArrived, replaced: replaced, recovered: recovered, afterLocalRestore: afterLocalRestore,
        savedPoint: function () { return _S; },
        status: function () { return { pending: _pending, since: _since, acks: _acks.slice(), remoteWaiting: _remote, rebased: _rebased, seedOnSave: _seedOnSave, hasSavedPoint: !!_S, saving: !!_saving, stats: JSON.parse(JSON.stringify(_stats)) }; },
        _ackOpened: _ackOpened, _ackClosed: _ackClosed, _wrapAll: _wrapAll, _allowUnload: function (v) { _allowUnload = !!v; }
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = W.SLSaveState;
})();

// ============================================================================
// cloud_sync.js — continuous cloud autosave + first-edit provisioning.
//
// THE BUG THIS FIXES. The stock autosave (_writeAutosave) writes ONLY to local
// stores (IndexedDB / localStorage / disk) in a single un-keyed slot. The cloud
// is written only by the manual "Save Changes" button (commitSaveChanges →
// saveProjectToCloud). So a signed-in user who trusts the "Saved" indicator and
// never clicks Save Changes has their whole session living only in one local
// slot — which the next project/showcase load overwrites. A session can
// evaporate, and work done before any manual save has NO server row at all.
//
// WHAT THIS MODULE DOES (born modular — wraps, never edits the monolith):
//   1. Rides the app's own autosave cadence. After each local _writeAutosave,
//      it throttle-pushes the current snapshot to Supabase.
//   2. If there is no cloud project yet AND the user has actually edited
//      (_dirtySinceSave) real content, it PROVISIONS one project row in the
//      active workspace — once — then keeps it synced. Brand-new work gets a
//      home immediately instead of only when someone remembers to Save.
//   3. Resets _activeCloudProjectId on showcase/sample loads, so loading a demo
//      can never overwrite an unrelated real cloud project, and a pristine
//      showcase view never provisions a junk row (provision needs a real edit).
//
// SAFETY. Fully fire-and-forget and non-fatal: every path is wrapped, the local
// autosave is untouched and runs first, and any Supabase error is swallowed
// (the app is never blocked or broken by a failed cloud push). Concurrency:
// this module does not write project_documents itself any more (3 Sep 2026):
// it hands a prepare() to cloud_writer.js — the ONE writer, shared with the
// manual Save — which queues, writes conditionally (WHERE version = the token
// this tab read) and, in silent mode, SKIPS a refused write and leaves
// reconciliation to the manual Save (which prompts, or audits a lock breach). Throttled
// to one push per _MIN_GAP_MS and only when a newer local autosave exists, so
// it never hammers the backend or bloats version history (history rows stay a
// manual-Save concern). Kill switch: window.SL_CLOUD_AUTOSAVE = false.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    if (window.__slCloudSyncWired) return;
    window.__slCloudSyncWired = true;

    var _MIN_GAP_MS = 12000;          // at most one cloud push every 12s
    var _DEMO_GRACE_MS = 10 * 60 * 1000;   // a freshly loaded demo is not provisioned silently for 10 min
    var _lastPushedTs = 0;            // _autosaveLastWrite value we last pushed
    var _lastPushAt = 0;              // wall clock of last push attempt
    var _timer = null;
    var _inFlight = false;

    function _on() { return (typeof window.SL_CLOUD_AUTOSAVE === 'undefined') ? true : (window.SL_CLOUD_AUTOSAVE !== false); }
    function _g(name) { try { return (typeof window[name] !== 'undefined') ? window[name] : undefined; } catch (_) { return undefined; } }

    // ---- guards -------------------------------------------------------------
    function _session() { try { return (typeof _supabaseSession !== 'undefined') ? _supabaseSession : null; } catch (_) { return null; } }
    function _userId() { var s = _session(); return s && s.user && s.user.id; }
    function _client() { try { return (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null; } catch (_) { return null; } }
    function _wsId() { try { return (typeof getActiveWorkspaceId === 'function') ? getActiveWorkspaceId() : null; } catch (_) { return null; } }
    function _dirty() { try { return (typeof _dirtySinceSave !== 'undefined') && _dirtySinceSave === true; } catch (_) { return false; } }
    function _pid() { try { return (typeof _activeCloudProjectId !== 'undefined') ? _activeCloudProjectId : null; } catch (_) { return null; } }
    function _docVer() { try { return (typeof _activeCloudDocVersion !== 'undefined') ? _activeCloudDocVersion : null; } catch (_) { return null; } }
    function _lastLocalWrite() { try { return (typeof _autosaveLastWrite !== 'undefined') ? _autosaveLastWrite : 0; } catch (_) { return 0; } }

    function _snapshot() {
        try { if (typeof _buildProjectSnapshot === 'function') return _buildProjectSnapshot(); } catch (_) {}
        try { if (typeof _snapshotProject === 'function') return _snapshotProject(); } catch (_) {}
        return null;
    }
    // Real content = something worth a project row (secondary guard behind _dirty).
    function _hasRealContent(s) {
        if (!s) return false;
        try {
            // 31 Aug 2026 (H-4 root cause) — ftaPages was in the plain length
            // check below, and EVERY project holds one blank seeded page
            // (SLStores.blankPage, root:null), so a pristine New Project tab
            // read as "real content" and the 12s tick minted an empty
            // "Untitled Project" row the moment anything marked the tab dirty
            // (c29d1d96, 6eeca9a7, 328f5eb2, + four more). A fault-tree page
            // is content only when some page actually carries a root.
            var arrs = ['acFunctionsData', 'acFhaData', 'systemsData', 'itemsData', 'acReqData'];
            for (var i = 0; i < arrs.length; i++) { var a = s[arrs[i]]; if (Array.isArray(a) && a.length) return true; }
            var fp = s.ftaPages;
            if (Array.isArray(fp)) { for (var k = 0; k < fp.length; k++) { if (fp[k] && fp[k].root) return true; } }
            var nm = (typeof projectName !== 'undefined' && projectName) ? String(projectName) : (s.projectName || '');
            if (nm && nm !== 'Untitled Project') return true;
        } catch (_) {}
        return false;
    }
    function _name(s) {
        try { if (typeof projectName !== 'undefined' && projectName) return projectName; } catch (_) {}
        return (s && s.projectName) || 'Untitled Project';
    }

    // ---- 20 Aug 2026 — the shrink guard -------------------------------------
    // _hasRealContent above gates PROVISIONING only ("don't mint an empty row").
    // The UPDATE path had no guard at all, so once a project had a cloud id this
    // module would push whatever was in memory over the customer's document —
    // including nothing. Four projects were destroyed that way; the worst was a
    // 212-item project with 150 requirements collapsed to a single blank fault
    // tree page, then pushed over four more times as the 12s cadence hammered
    // the empty state in. pagehide/visibilitychange force _lastPushedTs = 0 and
    // push IMMEDIATELY, so closing the tab after a transient wipe guaranteed it.
    //
    // The database trigger (sl_guard_project_document) is the real backstop and
    // covers every client including builds already in the wild. This is the
    // client half: refuse locally so we never even attempt the destructive write,
    // and so the user gets told rather than a push silently failing server-side.
    var _CONTENT_KEYS = ['acFunctionsData', 'acFcimData', 'acFhaData', 'acReqData', 'acAssumptionsData',
                         'systemsData', 'ftaPages', 'fmeaData', 'itemsData',
                         'praData', 'zsaData', 'cmaData', 'routingData', 'resourcesData'];
    // Mirrors public.sl_doc_items() in the database — keep the two in step.
    // projectSourceDocs is deliberately EXCLUDED: one real project is 2.26MB of
    // uploaded PDFs with nothing authored yet, and it must not read as populated.
    function _contentItems(s) {
        if (!s) return 0;
        var n = 0;
        for (var i = 0; i < _CONTENT_KEYS.length; i++) {
            var a = s[_CONTENT_KEYS[i]];
            if (Array.isArray(a)) n += a.length;
        }
        // A lone blank fault-tree page IS the app's empty state, not content —
        // it is the exact shape every one of the four wipes collapsed to.
        if (n === 1 && Array.isArray(s.ftaPages) && s.ftaPages.length === 1 && !s.ftaPages[0].root) n = 0;
        return n;
    }
    var _lastPushedItems = null;   // content count of the last snapshot we shipped
    // 13 Sep 2026 (R18) — PER-TABLE counts of the last shipped snapshot. The total-only
    // guard let a whole table vanish: a project with 18 functions and 32 FCIM rows that
    // lost all 184 FHA rows reads 50 of 234 = 21% and passed. Now any ONE table that
    // drops from 10+ rows to under a fifth of what we shipped is refused and named,
    // whatever the rest of the project looks like.
    var _lastPushedByTable = null;
    function _countsByTable(s) {
        var o = {};
        if (!s) return o;
        for (var i = 0; i < _CONTENT_KEYS.length; i++) { var a = s[_CONTENT_KEYS[i]]; o[_CONTENT_KEYS[i]] = Array.isArray(a) ? a.length : 0; }
        return o;
    }
    // The table (if any) whose collapse would be refused: { key, from, to } or null.
    var _TABLE_LABELS = { acFunctionsData: 'aircraft functions', acFcimData: 'FCIM', acFhaData: 'aircraft FHA', acReqData: 'requirements', acAssumptionsData: 'assumptions', systemsData: 'systems', ftaPages: 'fault trees', fmeaData: 'FMEA', itemsData: 'items', praData: 'PRA', zsaData: 'ZSA', cmaData: 'CMA', routingData: 'routing', resourcesData: 'resources' };
    function _tableLabel(k) { return _TABLE_LABELS[k] || k; }
    function _gutTable(snap) {
        if (!_lastPushedByTable) return null;
        var now = _countsByTable(snap);
        for (var i = 0; i < _CONTENT_KEYS.length; i++) {
            var k = _CONTENT_KEYS[i], was = _lastPushedByTable[k] || 0, is = now[k] || 0;
            if (was >= 10 && is < was * 0.2) return { key: k, from: was, to: is };
        }
        return null;
    }
    // Defect 1 — the honest posture, said ONCE per session instead of the
    // "autosaving to the cloud" story an ITAR project must never be told.
    var _itarNoticeShown = false;
    function _itarLocalOnlyNotice() {
        if (_itarNoticeShown) return;
        _itarNoticeShown = true;
        try { console.info('[cloud-sync] ITAR-controlled project: cloud autosave is OFF. This project stays on this machine (manual export only).'); } catch (_) {}
        try { if (typeof showToast === 'function') showToast('ITAR-controlled — cloud autosave is off for this project. It stays on this machine.', 'info', 6000); } catch (_) {}
    }
    function _wouldGut(snap) {
        if (_lastPushedItems == null || _lastPushedItems < 10) return false;
        return _contentItems(snap) < _lastPushedItems * 0.2;
    }

    // ---- the push -----------------------------------------------------------
    // 2 Sep 2026 — ONE serialized cloud writer per tab, and NO blind write left.
    // This module and the manual Save (helpers_modules.saveProjectToCloud) both
    // wrote project_documents; the manual path was made serialized + conditional
    // (WHERE version = the token this tab read) on 2 Sep, but THIS path still ran
    // independently — its own _inFlight only serialized it against itself — and
    // still wrote a blind UPSERT. Live on D1 with the project open in ONE tab:
    // the visibilitychange flush fired while an AI accept was saving, one writer
    // bumped the version under the other, and the manual path's conditional
    // write was refused by the tab's OWN autosave — the "saved cloud copy
    // changed" dialog with nobody else in the project; in the other interleaving
    // the upsert lands second and silently replaces the newer document. Both
    // writers now queue on the same chain (window.__slabCloudSaveQ), the snapshot
    // is taken INSIDE the queued run so an older snapshot can never land after a
    // newer save, and the write is the same conditional UPDATE: zero rows means
    // the server moved on → skip silently and leave reconciliation to the manual
    // Save, which asks. A silent autosave never prompts and never overwrites.
    // 3 Sep 2026 — THIS MODULE NO LONGER WRITES project_documents. Policy stays here
    // (when to push, ITAR, provisioning-needs-content, the shrink guard); the
    // mechanism — queue, token, conditional write, refusal handling — is
    // cloud_writer.js, the ONE writer both this path and the manual Save call.
    // prepare() runs INSIDE the writer's serialized run, so the snapshot is fresh.
    function _writer() { try { var G = (typeof globalThis !== 'undefined') ? globalThis : window; return G.SLCloudWriter || null; } catch (_) { return null; } }
    async function _tick() {
        if (!_on() || _inFlight) return;
        var uid = _userId(); if (!uid) return;                 // not signed in → local-only, fine
        var client = _client(); if (!client) return;
        var ws = _wsId(); if (!ws) return;                     // no workspace → can't place a project
        var pid = _pid();
        // No cloud home yet AND no genuine edit → don't provision (blank / pristine showcase view).
        if (!pid && !_dirty()) return;
        // Only push when a newer local autosave exists than the one we last shipped.
        var lw0 = _lastLocalWrite();
        if (pid && lw0 && lw0 <= _lastPushedTs) return;
        var W = _writer(); if (!W) return;                     // writer not loaded yet — next tick
        _inFlight = true;
        try { await _push(client, ws, uid, W); } catch (_) {} finally { _inFlight = false; }
    }
    async function _push(client, ws, uid, W) {
        var lw = 0, snapItems = null, snapByTable = null;
        var prepare = async function () {
            var pid = _pid();
            lw = _lastLocalWrite();
            if (pid && lw && lw <= _lastPushedTs) return null;   // a queued-ahead save already shipped this
            var snap = _snapshot(); if (!snap) return null;      // FRESH — taken inside the serialized run
            // Defect 1 (spec 14 Aug, landed 30 Aug 2026) — ITAR guard. crdt_sync and
            // presence refuse ITAR-controlled projects; this module checked NOTHING,
            // so an ITAR-marked project was silently snapshotted to hosted Supabase
            // every 12 s. Judged from the SNAPSHOT (the same object we would have
            // pushed), not window state. The manual Save-to-cloud button is a
            // deliberate user act and stays out of scope; this closes the silent path.
            if (snap.projectConfig && snap.projectConfig.isITARControlled) { _itarLocalOnlyNotice(); return null; }
            var name = _name(snap);
            var certBasis = (snap.projectConfig && snap.projectConfig.regulation) || null;
            if (!pid) {
                if (!_hasRealContent(snap)) return null;         // don't mint an empty row
                // 3 Sep 2026 — TWO more reasons never to mint a row silently. (1) A demo
                // that was just loaded: Oladele's account held thirteen copies of the K350
                // showcase, four minted in one morning — open the app, the demo loads, the
                // tick provisions it. A worked example becomes a cloud project only when
                // someone has actually worked on it for a while (or presses Save, which
                // provisions on purpose). (2) A paywalled user: the paywall is the page;
                // provisioning behind it only litters the workspace.
                try { if (window.__slDemoLoadedAt && (Date.now() - window.__slDemoLoadedAt) < _DEMO_GRACE_MS) return null; } catch (_) {}
                try { if (typeof isPaywalled === 'function' && isPaywalled()) return null; } catch (_) {}
                // Provision through the SHARED lock in helpers_modules.js, not inline —
                // the same lock the manual Save uses, so two writers cannot mint two rows.
                var ensure = (typeof window._slEnsureCloudProject === 'function') ? window._slEnsureCloudProject : null;
                if (!ensure) return null;                        // app not fully loaded — try again next tick
                pid = await ensure(client, ws, name, certBasis, uid);
                if (!pid) return null;
                try { if (typeof showToast === 'function') showToast('Project saved to your workspace — autosaving to the cloud now.', 'success', 3500); } catch (_) {}
            } else {
                // keep the name / cert basis fresh, fire-and-forget
                try { client.from('projects').update({ name: name, cert_basis: certBasis, updated_at: new Date().toISOString() }).eq('id', pid).then(function () {}, function () {}); } catch (_) {}
            }
            // 20 Aug 2026 — never push a snapshot that guts what we last shipped.
            // Bail BEFORE the write rather than letting the server reject it, so the
            // user is told and the local copy is visibly the good one.
            var gutTable = _wouldGut(snap) ? null : _gutTable(snap);
            if (_wouldGut(snap) || gutTable) {
                try {
                    if (gutTable) console.error('[cloud-sync] REFUSED to push: ' + gutTable.key + ' collapsed from '
                        + gutTable.from + ' rows to ' + gutTable.to + ' while the rest of the project held. The cloud copy is untouched and your work is still in this tab.');
                    else console.error('[cloud-sync] REFUSED to push: content collapsed from '
                        + _lastPushedItems + ' items to ' + _contentItems(snap)
                        + '. The cloud copy is untouched and your work is still in this tab.');
                    if (typeof showToast === 'function') showToast(gutTable
                        ? ('Cloud save paused: one table (' + _tableLabel(gutTable.key) + ') suddenly went from ' + gutTable.from + ' rows to ' + gutTable.to + ', so the saved copy was left alone. Reload before editing further; your last saved version is intact.')
                        : ('Cloud save paused: this tab\u2019s project suddenly looks almost empty, so the saved copy was left alone. Reload before editing further; your last saved version is intact.'), 'warning', 12000);
                } catch (_) {}
                return null;
            }
            snapItems = _contentItems(snap); snapByTable = _countsByTable(snap);
            return { client: client, projectId: pid, userId: uid, snapshot: snap };
        };
        var r = await W.write({ mode: 'silent', prepare: prepare });
        if (r && r.ok) {
            _lastPushedTs = lw || Date.now();
            _lastPushedItems = snapItems; _lastPushedByTable = snapByTable;
        } else if (r && r.reason === 'error') {
            // The app is never disrupted — local autosave already succeeded.
            try { console.warn('[cloud-sync] push failed (local save is safe):', r.error && (r.error.message || r.error)); } catch (_) {}
        }
    }

    function _schedule() {
        if (!_on()) return;
        var now = Date.now();
        var wait = Math.max(0, _MIN_GAP_MS - (now - _lastPushAt));
        if (_timer) return;                    // a push is already queued
        _timer = setTimeout(function () {
            _timer = null; _lastPushAt = Date.now();
            _tick();
        }, wait);
    }

    // ---- wrap the local autosave (chains with session_resume's ring) --------
    (function wrapWrite() {
        if (typeof window._writeAutosave !== 'function' || window._writeAutosave._cloudWrapped) return;
        var orig = window._writeAutosave;
        var wrapped = function () {
            var r = orig.apply(this, arguments);
            try { _schedule(); } catch (_) {}
            return r;
        };
        wrapped._cloudWrapped = true;
        // 20 Aug 2026 — was a hand-written copy of ONE known flag (_ringWrapped). The
        // instinct was right and the coverage was not: it could only preserve the marker
        // someone had thought of. SLWrap.preserve copies every marker present, so a
        // fourth wrapper cannot silently un-guard this one.
        try { if (window.SLWrap) SLWrap.preserve(orig, wrapped); } catch (_) {}
        window._writeAutosave = wrapped;
    })();

    // Flush on tab hide so the last edits reach the cloud even on close.
    try {
        window.addEventListener('pagehide', function () { try { _lastPushedTs = 0; _tick(); } catch (_) {} }, { capture: true });
        document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { try { _tick(); } catch (_) {} } }, true);
    } catch (_) {}

    // ---- showcase/sample loads must not overwrite a real cloud project ------
    // After a demo/sample is applied, drop the cloud identity + dirty flag so:
    //  (a) the next save can't clobber whatever cloud project was open, and
    //  (b) a pristine (unedited) showcase never provisions a junk row.
    function _detachCloudIdentity() {
        try { _activeCloudProjectId = null; } catch (_) {}
        try { _activeCloudDocVersion = null; } catch (_) {}
        try { _dirtySinceSave = false; } catch (_) {}
        _lastPushedTs = 0;
        // Drop the shrink baseline with the identity — a demo/sample load legitimately
        // replaces content wholesale and must not be measured against the old project.
        _lastPushedItems = null; _lastPushedByTable = null;
        try { if (typeof _rtUpdatePresenceProject === 'function') _rtUpdatePresenceProject(); } catch (_) {}
    }
    function _wrapLoader(fnName) {
        try {
            var fn = window[fnName];
            if (typeof fn !== 'function' || fn._cloudDetachWrapped) return;
            var isDemo = (typeof _DEMO_LOADERS !== 'undefined') && _DEMO_LOADERS.indexOf(fnName) >= 0;
            var after = function () { _detachCloudIdentity(); if (isDemo) { try { window.__slDemoLoadedAt = Date.now(); } catch (_) {} } };
            var wrapped = function () {
                var r = fn.apply(this, arguments);
                if (r && typeof r.then === 'function') { r.then(after, function () {}); }
                else { after(); }
                return r;
            };
            wrapped._cloudDetachWrapped = true;
            // 20 Aug 2026 — keep every prior wrapper's idempotence marker (see fn_wrap.js).
            // 21 Aug 2026 — this line said preserve(orig, wrapped); `orig` only exists in
            // wrapWrite's scope, so the ReferenceError was silently swallowed by the try
            // and the markers were NEVER preserved here. The local is `fn`.
            try { if (window.SLWrap) SLWrap.preserve(fn, wrapped); } catch (_) {}
            window[fnName] = wrapped;
        } catch (_) {}
    }
    // wrap now, and retry shortly for loaders defined by later-loading modules
    // Keep this list in step with DEMOS in demo_picker.js — a loader missing from
    // here provisions a junk cloud row the instant its showcase is opened.
    var _DEMO_LOADERS = ['loadSampleProject', 'loadKestrelRj', 'loadSoraShowcase', 'loadHL1Demo', 'loadHalcyonDemo', 'loadVayuDemo'];
    // Defect 3 (spec 14 Aug, landed 30 Aug 2026) — plain FILE OPENS were missed.
    // loadProject (web file-input AND desktop File > Open via __slabLoadProjectJSON)
    // restored a snapshot while KEEPING _activeCloudProjectId, so the next 12 s
    // tick pushed the .slab contents over whatever cloud project was open — the
    // two-line data-loss path. A locally opened file must never wear another
    // project's cloud identity; re-linking stays explicit via the cloud modal.
    var _FILE_LOADERS = ['loadProject'];
    _DEMO_LOADERS.forEach(_wrapLoader);
    _FILE_LOADERS.forEach(_wrapLoader);
    try {
        var _tries = 0;
        var _iv = setInterval(function () {
            _DEMO_LOADERS.forEach(_wrapLoader);
            _FILE_LOADERS.forEach(_wrapLoader);
            if (++_tries >= 20) clearInterval(_iv);
        }, 500);
    } catch (_) {}

    // expose for tests / manual flush
    window.__slCloudSyncTick = _tick;
    // 31 Aug 2026 — the new-project intake path must drop the outgoing project's
    // cloud identity exactly like a demo load does (an un-detached New Project
    // renamed and overwrote cloud project de27b117 with the next project's
    // content). _createNewProjectBlank calls this.
    window.__slCloudSyncDetach = _detachCloudIdentity;

    // 21 Aug 2026 — a deliberate server-side restore (sl_restore_project_version /
    // sl_restore_project_baseline) legitimately replaces content wholesale, exactly
    // like a demo load. Without dropping the shrink baseline, rolling back to a
    // smaller version leaves _lastPushedItems at the old, fuller count and the next
    // autosave trips _wouldGut — pausing cloud saves with a scary warning right
    // after a restore the user asked for. The restore flow calls this.
    window.__slCloudSyncRebase = function () { _lastPushedItems = null; _lastPushedByTable = null; };
})();

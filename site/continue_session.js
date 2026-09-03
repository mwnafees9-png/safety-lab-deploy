// ============================================================================
// continue_session.js — v1.0 — "Continue where you left off" (3 Sep 2026).
//
// Waqas: "when a user signs in do they automatically get to where they left
// off last session?" — they did not, unless it was the same browser: the app is
// local-first (session_resume restores the LOCAL slot and the place within it)
// and nothing ever looked at the cloud for the user's last project. On a new
// device, a cleared profile or an incognito window a returning user landed in
// an empty session, the first-run demo picker opened, and every demo load that
// followed minted a fresh "Program Showcase" row (Oladele: thirteen K350 copies,
// four of them in one morning). "Continue where you left off is what I want."
//
// WHAT THIS DOES (born modular — observes and wraps, edits nothing):
//   1. The moment the session is signed in, ask the cloud for the most recently
//      saved project this user can read (own or member; RLS decides) — ONE
//      cheap query, before the overlay stack has even cleared.
//   2. If the local session is EMPTY or a PRISTINE DEMO and that cloud project
//      is not already open, hold the first-run demo offer back (a returning
//      engineer's own work outranks a worked example) and, once the gate / EULA /
//      signup overlays are gone, show a card: "Continue where you left off —
//      <name> · saved 40 min ago · Open / Not now".
//   3. Open = adopt the project's workspace, _loadCloudProject (the same
//      authoritative path Open-from-cloud uses: version token, dirty cleared,
//      CRDT adopt-model), then re-enter the PLACE — the tab, system and sub-tab
//      the document last recorded.
//   4. The place rides the document: every navigation records
//      projectConfig.lastPlace = { tab, systemId, subTab, at }, so it is saved
//      with the project and survives the device change that the local slot does
//      not. Recording never triggers a save of its own.
//
// Never interrupts real work: a session with content that is not a demo, or a
// session already on a cloud project, gets no card. Not-now is remembered for
// the browser session. Kill switch: window.SL_CONTINUE_OFFER = false.
// ============================================================================
(function () {
    'use strict';
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.__slContinueWired) return;
    window.__slContinueWired = true;

    var POLL_MS = 400, MAX_WAIT_MS = 60000;
    var DISMISS_KEY = 'safetyLab.continue.dismissed';   // sessionStorage: project id dismissed this browser session
    var FIRST_RUN_FLAG = 'safetyLab.firstRun.v1';

    function _on() { return window.SL_CONTINUE_OFFER !== false; }
    // The model's globals are top-level let/const in other scripts — visible by bare
    // identifier, never on window. Each is read under its own typeof guard.
    function _projectName() { try { return (typeof projectName !== 'undefined') ? projectName : ''; } catch (_) { return ''; } }
    function _pc() { try { return (typeof projectConfig !== 'undefined') ? projectConfig : null; } catch (_) { return null; } }
    function _systems() { try { return (typeof systemsData !== 'undefined' && Array.isArray(systemsData)) ? systemsData : []; } catch (_) { return []; } }
    function _signedIn() { try { return typeof isSupabaseSignedIn === 'function' && !!isSupabaseSignedIn(); } catch (_) { return false; } }
    function _client() { try { return (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null; } catch (_) { return null; } }
    function _paywalled() { try { return typeof isPaywalled === 'function' && !!isPaywalled(); } catch (_) { return false; } }
    function _pid() { try { return (typeof _activeCloudProjectId !== 'undefined') ? _activeCloudProjectId : null; } catch (_) { return null; } }
    function _dirty() { try { return (typeof _dirtySinceSave !== 'undefined') && _dirtySinceSave === true; } catch (_) { return false; } }
    // Mirrors first_run's overlay predicate (gate, EULA, signup, any modal).
    function _overlayUp() {
        try {
            if (document.getElementById('sl-auth-gate')) return true;
            if (document.getElementById('sl-eula-overlay')) return true;
            if (document.documentElement.classList.contains('sl-auth-gate-blocked')) return true;
            var mods = document.querySelectorAll('.modal-overlay, .signup-modal-overlay');
            for (var i = 0; i < mods.length; i++) {
                var m = mods[i];
                var vis = m.offsetParent !== null || (m.style && m.style.display === 'flex');
                if (vis && m.id !== 'sl-demo-picker') return true;
            }
        } catch (_) {}
        return false;
    }
    // Mirrors first_run's predicate: a fault-tree page is content only with a root.
    function _isEmpty() {
        function len(x) { try { return (x && x.length) || 0; } catch (_) { return 0; } }
        try {
            if (typeof acFunctionsData !== 'undefined' && len(acFunctionsData)) return false;
            if (typeof acFhaData !== 'undefined' && len(acFhaData)) return false;
            if (typeof systemsData !== 'undefined' && len(systemsData)) return false;
            if (typeof itemsData !== 'undefined' && len(itemsData)) return false;
            if (typeof acReqData !== 'undefined' && len(acReqData)) return false;
            var fp = (typeof ftaPages !== 'undefined' && ftaPages) || []; for (var i = 0; i < fp.length; i++) if (fp[i] && fp[i].root) return false;
        } catch (_) { return false; }   // can't tell → don't interrupt
        return true;
    }
    // A demo that nobody has worked on: named like a showcase, no cloud identity, and
    // either untouched or loaded within the last ten minutes (cloud_sync stamps
    // window.__slDemoLoadedAt on every demo load and holds provisioning for the same window).
    function _isPristineDemo() {
        try {
            var nm = String(_projectName() || '');
            if (!/showcase|demo|sample/i.test(nm) || _pid()) return false;
            if (!_dirty()) return true;
            var at = window.__slDemoLoadedAt; return !!(at && (Date.now() - at) < 10 * 60 * 1000);
        } catch (_) { return false; }
    }
    function _ago(iso) {
        var ms = Date.now() - new Date(iso).getTime(); if (!(ms >= 0)) return '';
        var m = Math.round(ms / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
        var h = Math.round(m / 60); if (h < 48) return h + ' h ago';
        var d = Math.round(h / 24); return d + ' days ago';
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    // ---- 1. the most recent project this user can read --------------------
    async function mostRecent() {
        var client = _client(); if (!client) return null;
        try {
            var r = await client.from('projects').select('id, name, workspace_id, cert_basis, updated_at, created_at')
                .is('deleted_at', null).order('updated_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(1);
            var p = r && r.data && r.data[0]; if (!p) return null;
            var d = await client.from('project_documents').select('updated_at, version').eq('project_id', p.id).maybeSingle();
            var doc = d && d.data;
            return { id: p.id, name: p.name || 'Untitled Project', workspaceId: p.workspace_id, certBasis: p.cert_basis, savedAt: (doc && doc.updated_at) || p.updated_at || p.created_at, version: doc ? doc.version : null, hasDoc: !!doc };
        } catch (_) { return null; }
    }

    // ---- 4. the place rides the document ----------------------------------
    function _recordPlace(tab, subTab) {
        try {
            if (window._slResumeInFlight || window._slContinueInFlight) return;
            var pc = _pc(); if (!pc || typeof pc !== 'object') return;
            var cur = pc.lastPlace || {};
            var sys = (typeof activeSystemId !== 'undefined' && activeSystemId) ? String(activeSystemId) : (cur.systemId || '');
            pc.lastPlace = { tab: tab ? String(tab) : (cur.tab || ''), systemId: sys, subTab: subTab ? String(subTab) : (tab ? '' : (cur.subTab || '')), at: new Date().toISOString() };
        } catch (_) {}
    }
    (function wrapNav() {
        function wrapOne(name, fn) {
            if (typeof window[name] !== 'function' || window[name]._continueWrapped) return;
            var orig = window[name];
            var wrapped = function () { var r = orig.apply(this, arguments); try { fn.apply(null, arguments); } catch (_) {} return r; };
            wrapped._continueWrapped = true;
            try { if (window.SLWrap) window.SLWrap.preserve(orig, wrapped); } catch (_) {}
            window[name] = wrapped;
        }
        var tries = 0, iv = setInterval(function () {
            wrapOne('switchTab', function (tab) { _recordPlace(tab, null); });
            wrapOne('switchWorkspaceTab', function (sub) { _recordPlace(null, sub); });
            if ((window.switchTab && window.switchTab._continueWrapped && window.switchWorkspaceTab && window.switchWorkspaceTab._continueWrapped) || ++tries > 50) clearInterval(iv);
        }, 300);
    })();
    function _reenterPlace() {
        try {
            var pc = _pc(); var lp = pc && pc.lastPlace; if (!lp || !lp.tab) return false;
            window._slContinueInFlight = true; window._slResumeInFlight = true;
            try {
                if (lp.tab === 'sys-workspace' && lp.systemId && typeof openSystemWorkspace === 'function' && _systems().some(function (s) { return String(s.id) === String(lp.systemId); })) {
                    openSystemWorkspace(lp.systemId);
                    if (lp.subTab && typeof switchWorkspaceTab === 'function') switchWorkspaceTab(lp.subTab);
                } else if (typeof switchTab === 'function') { switchTab(lp.tab); }
            } finally { window._slContinueInFlight = false; window._slResumeInFlight = false; }
            return true;
        } catch (_) { window._slContinueInFlight = false; window._slResumeInFlight = false; return false; }
    }

    // ---- 3. open -----------------------------------------------------------
    async function open(p) {
        try {
            if (p.workspaceId && typeof setActiveWorkspaceId === 'function') setActiveWorkspaceId(p.workspaceId);
            if (typeof _loadCloudProject !== 'function') return false;
            await _loadCloudProject(p.id);
            if (_pid() !== p.id) return false;          // the load did not take (no document, or refused)
            var placed = _reenterPlace();
            try { if (typeof showToast === 'function') showToast('Continuing ' + p.name + (placed ? ' where you left off.' : '.'), 'success', 4000); } catch (_) {}
            return true;
        } catch (e) { try { console.warn('[continue-session] open failed:', e && (e.message || e)); } catch (_) {} return false; }
    }

    // ---- 2. the card -------------------------------------------------------
    var _card = null;
    function _dismissed(id) { try { return sessionStorage.getItem(DISMISS_KEY) === id; } catch (_) { return false; } }
    function _dismiss(id) { try { sessionStorage.setItem(DISMISS_KEY, id); } catch (_) {} if (_card) { _card.remove(); _card = null; } }
    function showCard(p) {
        if (_card || typeof document === 'undefined' || !document.body) return;
        var el = document.createElement('div'); el.id = 'sl-continue-card'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Continue where you left off');
        el.style.cssText = 'position:fixed; top:14px; left:50%; transform:translateX(-50%); z-index:2999; max-width:640px; width:calc(100% - 32px);' +
            'background:var(--color-surface-1,#faf8f3); color:var(--color-text-primary,#111); border:1px solid var(--color-border-strong,#c9c4b8); border-radius:8px;' +
            'box-shadow:var(--shadow-xl,0 8px 24px rgba(0,0,0,.25)); padding:12px 16px; display:flex; gap:14px; align-items:center; font-size:13px; line-height:1.4;';
        el.innerHTML = '<div style="flex:1; min-width:0;"><div style="font-family:var(--font-mono,monospace); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--color-text-tertiary,#777);">Continue where you left off</div>' +
            '<div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + esc(p.name) + '</div>' +
            '<div style="color:var(--color-text-secondary,#555); font-size:12px;">' + (p.certBasis ? esc(p.certBasis) + ' · ' : '') + 'saved ' + esc(_ago(p.savedAt)) + (p.version != null ? ' · version ' + esc(p.version) : '') + '</div></div>' +
            '<button type="button" class="btn-cyan" id="sl-continue-open" style="font-size:12px; white-space:nowrap;">Open</button>' +
            '<button type="button" class="btn-ghost" id="sl-continue-later" style="font-size:12px; white-space:nowrap;">Not now</button>';
        document.body.appendChild(el); _card = el;
        el.querySelector('#sl-continue-open').onclick = function () { var b = this; b.disabled = true; b.textContent = 'Opening…'; open(p).then(function (ok) { if (ok) _dismiss(p.id); else { b.disabled = false; b.textContent = 'Open'; try { if (typeof showToast === 'function') showToast('Could not open that project — use File → Open from cloud.', 'warning', 5000); } catch (_) {} } }); };
        el.querySelector('#sl-continue-later').onclick = function () { _dismiss(p.id); };
    }

    // ---- orchestration -----------------------------------------------------
    var _state = { checked: false, candidate: null, shown: false };
    function _start() {
        if (!_on()) return;
        var waited = 0, asked = false;
        var iv = setInterval(function () {
            waited += POLL_MS;
            try {
                if (waited >= MAX_WAIT_MS) { clearInterval(iv); return; }
                if (!_signedIn()) return;
                if (_paywalled()) { clearInterval(iv); return; }           // the paywall is the page
                if (!asked) {
                    asked = true;
                    mostRecent().then(function (p) {
                        _state.checked = true; _state.candidate = p;
                        // a returning engineer's own project outranks the worked-example offer
                        if (p && p.hasDoc) { try { if (!localStorage.getItem(FIRST_RUN_FLAG)) localStorage.setItem(FIRST_RUN_FLAG, 'skipped-has-cloud-project'); } catch (_) {} }
                    });
                    return;
                }
                if (!_state.checked) return;                                // query in flight
                var p = _state.candidate;
                if (!p || !p.hasDoc) { clearInterval(iv); return; }          // nothing to continue
                if (_pid() === p.id) { clearInterval(iv); return; }          // already there (local resume carried it)
                if (_dismissed(p.id)) { clearInterval(iv); return; }
                if (!_isEmpty() && !_isPristineDemo()) { clearInterval(iv); return; }   // real work in this session: never interrupt
                if (_overlayUp()) return;                                    // gate / EULA / signup still stacked
                clearInterval(iv); _state.shown = true; showCard(p);
            } catch (_) { clearInterval(iv); }
        }, POLL_MS);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _start); else _start();

    window.SLContinue = { _v: '1.0', mostRecent: mostRecent, open: open, isEmpty: _isEmpty, isPristineDemo: _isPristineDemo, recordPlace: _recordPlace, reenterPlace: _reenterPlace, showCard: showCard, state: function () { return _state; } };
})();

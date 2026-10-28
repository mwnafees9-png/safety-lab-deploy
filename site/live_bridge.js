// ============================================================================
// live_bridge.js, v2.0 (21 Oct 2026). J1: live tracking of Jama (connector-shaped for
// Polarion/DOORS next). READ-ONLY phase 1 by decision.
//
// "Live" without breaking the deterministic core:
//   · The bridge WATCHES — it polls the tool's REST API (manually or on a
//     timer) and diffs what it sees against the requirements' reqSource
//     fingerprints. Detection is computed.
//   · Application is SIGNED — changes stage into the same preview → sign →
//     idempotent apply discipline as Q10. Nothing writes on its own, ever.
//   · Every check and every apply is journaled.
//
// CREDENTIALS. 16 Sep 2026 — the username and token are no longer kept in
// localStorage. On the DESKTOP they go into the OS keychain (Electron
// safeStorage via window.slabSecrets) and the request itself is made by the
// main process, which is the only place the credential is ever decrypted.
// Only the non-secret part of the connector config — base URL, project id,
// poll setting — stays in localStorage. Never in the project file, never in
// autosave, never on Safety Lab's servers.
//
// AND THE DESKTOP BRIDGE NEVER WORKED BEFORE THIS. The line that used to be
// here said "the desktop app fetches the tool directly". It cannot: the
// desktop's egress fence (shell_rules allowedHosts) admits only the configured
// backend host and AI endpoint host, and webRequest.onBeforeRequest cancels
// everything else in the app partition. A Jama host is in that set under none
// of the three backend configurations. The connector screen was fillable and
// no request ever left. Routing through the main process fixes it without
// widening the fence by a single host.
//
// 20 Sep 2026 (S8) — the WEB doors stop building the credential in the page too.
// On any door with a backend the token goes to the server-side vault through
// save_secret() (write-only from here) and the request goes to the AI proxy's
// /bridge with the user's session JWT; the proxy reads the token, builds the
// Basic header, and makes the call. The browser never holds the token and the
// site worker's Basic-auth relay (/api/bridge) is no longer used on those doors.
// Browser-only (no backend, nowhere else to keep it) keeps the token in
// sessionStorage for this tab and still uses /api/bridge, and says so.
//
// Write-back stays the M8 ReqIF file until phase 2 earns API writes.
//
// v2.0, 21 Oct 2026 (Waqas: track a customer's aircraft functions live from Jama, full tree).
//   * ITEM TYPES DECIDE WHERE THINGS GO. v1 pulled every item in the project and filed all of
//     them as requirements, functions and folders included. The engineer now picks which Jama
//     item types are FUNCTIONS and which are REQUIREMENTS; only those are read, and nothing is
//     filed anywhere by default. Until types are chosen the bridge says so and reads nothing.
//   * FUNCTIONS COME IN AS A TREE (jama_tree.js does the mapping, func_tree.js holds it): top
//     function, sub-functions to any depth, folders and sets looked through. Review lists NEW,
//     CHANGED, MOVED, FUNCTION RENAMED and MISSING; nothing is written until someone signs;
//     missing is flagged, never deleted.
//   * IDENTITY IS JAMA'S ITEM ID, not its key. A key that changes in Jama is reported; the row
//     keeps the id every FHA, FCIM and trace already points at. Requirements match by item id
//     too (falling back to the key for rows written by v1).
//   * SCALE. v1 stopped at 10 pages (500 items). v2 reads up to 400 pages (20,000 items), shows
//     progress, and waits out the relay's per-minute limit instead of failing half way.
//   * Auto-watch works. v1 armed the timer only when cfg.token was set, and the token has not
//     been kept in the config since 16 Sep, so "watch every 5 min" never ran.
//
// v3.0, 22 Oct 2026 (Waqas: "every page that can interface with Jama needs it ... both at the aircraft
// and system level"; "one Jama connection per project").
//   * ONE CONNECTION PER PROJECT. Address, project, item types, field choices and each system's Jama
//     folder are a project setting (projectConfig.jamaBridge), shared by everyone on the project.
//     The login stays on each computer. "Watch every 5 min" is a personal choice on this computer.
//   * FOUR KINDS: functions, requirements, assumptions, failure conditions (jama_kinds.js). A Jama
//     failure condition fills the function's FCIM slot and its FHA row (severity, flight phases,
//     effects, from the Jama fields the administrator picks).
//   * AIRCRAFT AND SYSTEMS. Each system workspace picks the Jama folder or set that holds its items;
//     everything else is aircraft level.
//   * A PANEL ON EVERY PAGE that holds one of those kinds (aircraft and each system: Functions, FCIM,
//     Hazard assessment, Assumptions, Requirements): that page's changes, Check Jama now, and Sign
//     and apply for that page. The full panel on Requirements exchange shows and signs everything.
//     The connection form lives in one dialog, opened from any of them.
//
// v4.0, 26 Oct 2026 (Waqas: "once they click everything it should give them the JAMA browser and they
// select what they want rather than having them select specific item types").
//   * THE JAMA BROWSER replaces the item-type chooser. After the connection is saved it opens: pick
//     the project, browse its tree the way Jama shows it (folders, sets, items; children read only
//     when a row is opened, 50 at a time), tick whole folders or sets or single items, say what each
//     one is in Safety Lab (functions, requirements, assumptions, failure conditions) and press Bring
//     in. A ticked folder means everything under it, at this check and every later one, because each
//     check reads the folder's place in Jama fresh and takes everything below it.
//   * WHAT IS TICKED FEEDS THE SAME CHECK, REVIEW AND SIGNED APPLY. Each chosen item is given the
//     kind of the nearest ticked thing above it; folders and sets are still looked through, never
//     filed. Identity is still Jama's item id, so rows brought in by item type match unchanged.
//   * ITEM TYPES ARE OPTIONAL. Their names label the tree when Jama lets us read them; when it does
//     not (seen at a customer: HTTP 403 on /itemtypes) the browser, the check and the system folder
//     choice all still work. A project that chose item types before keeps reading them until
//     someone chooses in the browser.
//
// v4.1, 27 Oct 2026 (Waqas: "make sure there are no bugs on our side for their jama connection or the
// browser, they have three tiers of functions, how do we enable them to map that stuff acurately").
//   * EACH JAMA ITEM TYPE UNDER A TICKED FOLDER IS DECIDED. A Text item no longer comes in as a function,
//     nor a requirement nested under a function as a sub-function. Text stays out; a type whose name says
//     what it is goes there; a folder holding one kind of item takes the ticked kind; anything else is
//     asked, by Jama type, with a count and examples, and nothing is staged until it is answered. The
//     answer is kept with the ticked folder (picks[].types).
//   * The review counts the function tree by level and names each new row's level; the page panels show
//     the check's warnings; a read cut short at the item limit flags nothing as missing.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const CFG_KEY = 'safetyLab.bridge.v1';
    const TOOL = 'jama-live';
    const PAGE = 50;                 // Jama's maximum page size
    const MAX_PAGES = 400;           // 20,000 items per check
    const RATE_WAIT_MS = 61 * 1000;  // the relay allows 60 requests a minute per user
    const RATE_RETRIES = 4;
    function _T() { return (typeof SLJamaTree !== 'undefined') ? SLJamaTree : null; }

    // ------------------------------------------------------------- config
    // 22 Oct 2026 (Waqas: "one Jama connection per project"): the NON-SECRET part of the connection
    // (address, project, which item types are which, field choices, each system's Jama folder) is a
    // project setting, so everyone on the project shares it. The credential stays on each person's
    // computer (keychain / vault / this tab), never in the project. "Watch every 5 min" is a
    // personal choice and stays on this computer. A project with no setting yet reads the
    // pre-22-Oct one this computer kept, and the first save moves it into the project.
    const WATCH_KEY = 'safetyLab.bridge.watch';
    function _pc() { try { return (typeof projectConfig !== 'undefined' && projectConfig && typeof projectConfig === 'object') ? projectConfig : null; } catch (_) { return null; } }
    function _watch() { try { return localStorage.getItem(WATCH_KEY) === '1'; } catch (_) { return false; } }
    function bridgeConfig() {
        const pc = _pc();
        const own = (pc && pc.jamaBridge && typeof pc.jamaBridge === 'object') ? pc.jamaBridge : null;
        let legacy = {};
        try { legacy = JSON.parse(localStorage.getItem(CFG_KEY) || 'null') || {}; } catch (_) { legacy = {}; }
        const out = JSON.parse(JSON.stringify(own || legacy || {}));
        out.auto = own ? _watch() : !!(legacy.auto || _watch());
        return out;
    }
    // Only the NON-SECRET part is written: address, project, item-type choices, field choices,
    // system folders. The credential goes to the keychain (desktop) or SecretStore (web), never here.
    function bridgeConfigSave(c) {
        const o = Object.assign({}, c || {});
        delete o.user; delete o.token;
        const pc = _pc();
        if (!pc) { try { localStorage.setItem(CFG_KEY, JSON.stringify(o)); } catch (_) {} return; }
        try { localStorage.setItem(WATCH_KEY, o.auto ? '1' : '0'); } catch (_) {}
        delete o.auto;
        pc.jamaBridge = o;
        try { localStorage.removeItem(CFG_KEY); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
    }
    // which Jama item types are which kind of thing in Safety Lab
    const KINDS = [
        { k: 'fn',  cfg: 'fnTypes',  label: 'Functions',          cls: 'lb-fn-type' },
        { k: 'req', cfg: 'reqTypes', label: 'Requirements',       cls: 'lb-req-type' },
        { k: 'asm', cfg: 'asmTypes', label: 'Assumptions',        cls: 'lb-asm-type' },
        { k: 'fc',  cfg: 'fcTypes',  label: 'Failure conditions', cls: 'lb-fc-type' },
    ];
    // 26 Oct 2026: what was ticked in the Jama browser. Each pick is { id, key, name, seq, kind, container }.
    // A chosen item is marked with its kind's stand-in type (below), so the review, the function tree
    // and the apply, which sort by type, work unchanged; its real Jama type is kept as jamaType.
    const KIND_V = { fn: -101, req: -102, asm: -103, fc: -104 };
    function _picks(cfg) {
        return (Array.isArray(cfg && cfg.picks) ? cfg.picks : []).filter(p => p && p.id != null && isFinite(Number(p.id)) && KIND_V[p.kind] != null);
    }
    function _types(cfg, items) {
        const pk = _picks(cfg);
        if (pk.length) {
            // 27 Oct 2026: a Jama item type under a ticked folder can be another kind (a requirement nested
            // under a function); what it was said or named to be is read too
            const extra = new Set();
            pk.forEach(p => { if (p.types && typeof p.types === 'object') Object.keys(p.types).forEach(t => { if (KIND_V[p.types[t]] != null) extra.add(p.types[t]); }); });
            ((items && items._types) || []).forEach(t => { if (KIND_V[t.kind] != null) extra.add(t.kind); });
            const has = k => (pk.some(p => p.kind === k) || extra.has(k)) ? [KIND_V[k]] : [];
            return { fn: has('fn'), req: has('req'), asm: has('asm'), fc: has('fc') };
        }
        const n = a => (Array.isArray(a) ? a : []).map(Number).filter(x => isFinite(x));
        return { fn: n(cfg && cfg.fnTypes), req: n(cfg && cfg.reqTypes), asm: n(cfg && cfg.asmTypes), fc: n(cfg && cfg.fcTypes) };
    }
    function _allTypes(ty) { return Array.from(new Set(ty.fn.concat(ty.req, ty.asm, ty.fc))); }
    function _K() { return (typeof SLJamaKinds !== 'undefined') ? SLJamaKinds : null; }
    function _store() { try { return window.SecretStore || null; } catch (_) { return null; } }
    function _door() { const st = _store(); return st ? st.door() : (_isDesktop() ? 'desktop' : 'session'); }

    function _baseHost(baseUrl) {
        try { return new URL(String(baseUrl)).hostname.toLowerCase(); } catch (_) { return ''; }
    }

    // One-time move of a credential this install saved to localStorage before S8, so the
    // plaintext copy does not simply sit there forever. Desktop -> keychain (16 Sep); any
    // backend door -> vault; browser-only -> this tab's sessionStorage (20 Sep).
    async function _migrateStoredCredential() {
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (_) { return; }
        if (!raw || !raw.token) return;
        const meta = { baseHost: _baseHost(raw.baseUrl), user: raw.user || '' };
        let r = null, where = '';
        try {
            if (_isDesktop()) {
                if (!_hasKeychain()) return;
                r = await window.slabSecrets.save('jama', { user: raw.user || '', token: raw.token }, meta); where = 'the OS keychain';
            } else if (_store()) {
                r = await _store().save('jama_token', raw.token, meta); where = (_door() === 'vault') ? 'the server-side vault' : 'this tab only';
            } else return;
            if (!r || !r.ok) return;                       // store unavailable: leave it, say nothing yet
            delete raw.user; delete raw.token;
            localStorage.setItem(CFG_KEY, JSON.stringify(raw));
            try { console.info('[bridge] connector credential moved out of localStorage into ' + where); } catch (_) {}
        } catch (_) {}
    }
    try {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _migrateStoredCredential);
        else _migrateStoredCredential();
    } catch (_) {}

    // ------------------------------------------------------------ transport
    function _isDesktop() {
        try { return !!(window.__slabDesktop || (navigator.userAgent || '').indexOf('Electron') >= 0); } catch (_) { return false; }
    }
    function _hasKeychain() {
        try { return !!(window.slabSecrets && window.slabBridge && typeof window.slabBridge.get === 'function'); } catch (_) { return false; }
    }
    // 23 Oct 2026: on the desktop the login lives in the keychain, so the page cannot read it back.
    // The keychain's plain details (host, username or Client ID, sign-in method) can be, and the
    // connection dialog shows them, so a saved login is visible as saved.
    let _deskMeta = null;
    async function _refreshDeskMeta() {
        if (!_isDesktop() || !window.slabSecrets || typeof window.slabSecrets.status !== 'function') return;
        try {
            const r = await window.slabSecrets.status();
            const e = ((r && r.secrets) || []).find(x => x && x.kind === 'jama');
            _deskMeta = e ? (e.meta || {}) : null;
        } catch (_) {}
    }
    function _savedLogin() {   // { user, auth, has } of the login saved for this door
        if (_isDesktop()) return { user: (_deskMeta && _deskMeta.user) || '', auth: (_deskMeta && _deskMeta.auth) || 'basic', has: !!_deskMeta };
        const st = _store(), m = st ? (st.meta('jama_token') || {}) : {};
        return { user: m.user || '', auth: m.auth || 'basic', has: !!(st && st.has('jama_token')) };
    }
    function _hasCredential() {
        if (_isDesktop()) return _hasKeychain();
        const st = _store();
        return !!(st && st.has('jama_token'));
    }
    function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function _isRateLimit(e) { return /\b429\b|rate limit/i.test(String((e && e.message) || e || '')); }
    async function _getOnce(targetUrl) {
        // Desktop: the main process holds the credential and makes the call. Nothing
        // here ever sees the token, and the page makes no cross-origin request at all.
        if (_isDesktop()) {
            if (!_hasKeychain()) {
                throw new Error('This version of the desktop app cannot reach the connector. Update the app and reconnect the tool.');
            }
            const r = await window.slabBridge.get(targetUrl);
            if (!r || !r.ok) throw new Error((r && r.error) || 'bridge request failed');
            return r.data;
        }
        const st = _store();
        if (st && st.door() === 'vault') {
            // Backend doors: the proxy holds the credential (vault, service_role) and makes
            // the call. We send only who we are. The proxy also refuses any target whose host
            // differs from the one saved with the credential.
            if (!st.has('jama_token')) throw new Error('Connect the tool first: no credential is saved for this account.');
            const jwt = st.sessionJwt();
            if (!jwt) throw new Error('Sign in again to use the connector.');
            const base = (window.SLConfig && window.SLConfig.aiEndpoint) || '';
            if (!base) throw new Error('This install has no proxy configured, so the connector has nowhere to relay through.');
            const res = await fetch(String(base).replace(/\/+$/, '') + '/bridge?target=' + encodeURIComponent(targetUrl), {
                headers: { 'Authorization': 'Bearer ' + jwt, 'Accept': 'application/json' }
            });
            if (!res.ok) {
                let msg = 'HTTP ' + res.status + ' from bridge';
                try { const j = await res.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (_) {}
                throw new Error(msg);
            }
            return res.json();
        }
        // Browser-only: no backend and no proxy. The token is in this tab's sessionStorage and
        // the same-origin stateless relay is the only way past CORS.
        const token = st ? st.get('jama_token') : '';
        const meta = st ? (st.meta('jama_token') || {}) : {};
        if (!token) throw new Error('Connect the tool first: no credential is saved in this tab.');
        const basic = 'Basic ' + btoa((meta.user || '') + ':' + token);
        const relay = auth => fetch('/api/bridge?target=' + encodeURIComponent(targetUrl), { headers: { 'Authorization': auth, 'Accept': 'application/json' } });
        let res;
        if (meta.auth === 'oauth') {
            // 23 Oct 2026: Jama API credentials. The same stateless relay trades them for a short-lived
            // access token (POST, Jama's token endpoint only); the token stays in this tab's memory.
            let access = await _sessionToken(targetUrl, basic, false);
            res = await relay('Bearer ' + access);
            if (res.status === 401) { access = await _sessionToken(targetUrl, basic, true); res = await relay('Bearer ' + access); }
        } else {
            res = await relay(basic);
        }
        if (res.status === 401) throw new Error(meta.auth === 'oauth'
            ? 'Jama refused the request with a fresh sign-in (HTTP 401). The API credentials may belong to a user without access to this project.'
            : 'Jama did not accept the username and password (HTTP 401). If your company signs in to Jama through single sign-on, choose "Jama API credentials" in the connection and use a Client ID and Client Secret instead.');
        if (!res.ok) throw new Error('HTTP ' + res.status + ' from bridge');
        return res.json();
    }
    let _sessTok = null;   // { key, access, exp } for the browser-only door, this tab's memory only
    function _tokenUrlFor(targetUrl) {
        const u = new URL(String(targetUrl)), i = u.pathname.indexOf('/rest/');
        return u.origin + (i > 0 ? u.pathname.slice(0, i) : '') + '/rest/oauth/token';
    }
    async function _sessionToken(targetUrl, basic, fresh) {
        const key = _tokenUrlFor(targetUrl) + '|' + basic;
        if (!fresh && _sessTok && _sessTok.key === key && _sessTok.exp > Date.now()) return _sessTok.access;
        _sessTok = null;
        const r = await fetch('/api/bridge?target=' + encodeURIComponent(_tokenUrlFor(targetUrl)), {
            method: 'POST', body: 'grant_type=client_credentials',
            headers: { 'Authorization': basic, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }
        });
        if (r.status === 400 || r.status === 401 || r.status === 403) throw new Error('Jama did not accept the API credentials (HTTP ' + r.status + '). Check the Client ID and Client Secret, and that they have not been deleted in Jama under Set API Credentials.');
        if (r.status === 404) throw new Error('This Jama does not offer sign-in with API credentials (HTTP 404). Ask your Jama administrator to turn on API credentials (OAuth).');
        if (!r.ok) throw new Error('HTTP ' + r.status + ' from Jama while signing in with the API credentials.');
        const j = await r.json().catch(() => null);
        if (!j || typeof j.access_token !== 'string' || !j.access_token) throw new Error('Jama answered the sign-in without a token.');
        _sessTok = { key: key, access: j.access_token, exp: Date.now() + (Math.max(60, Number(j.expires_in) || 3600) - 60) * 1000 };
        return _sessTok.access;
    }
    // A large check is many requests. The relay caps each user at 60 a minute; hitting the cap
    // waits it out and carries on, instead of failing half way through a 3,000 item read.
    async function _get(targetUrl, onWait) {
        for (let attempt = 0; ; attempt++) {
            try { return await _getOnce(targetUrl); }
            catch (e) {
                if (!_isRateLimit(e) || attempt >= RATE_RETRIES) throw e;
                try { if (onWait) onWait(RATE_WAIT_MS); } catch (_) {}
                await _sleep(_get._waitMs != null ? _get._waitMs : RATE_WAIT_MS);
            }
        }
    }

    // ---------------------------------------------------------- reading Jama
    let _progress = '';
    function _setProgress(t) { _progress = t || ''; try { document.querySelectorAll('#lb-progress, .jb-progress').forEach(el => { el.textContent = _progress; }); } catch (_) {} }

    async function bridgeFetchItemTypes() {
        const cfg = bridgeConfig();
        if (!cfg.baseUrl) throw new Error('Enter the Jama address first.');
        const base = String(cfg.baseUrl).replace(/\/+$/, '');
        const out = [];
        for (let page = 0, startAt = 0; page < 40; page++) {
            const data = await _get(base + '/rest/latest/itemtypes?maxResults=' + PAGE + '&startAt=' + startAt);
            const list = (data && data.data) || [];
            list.forEach(t => { if (t && t.id != null) out.push({ id: Number(t.id), name: String(t.display || t.name || t.typeKey || ('Type ' + t.id)), key: String(t.typeKey || '') }); });
            const pi = data && data.meta && data.meta.pageInfo;
            if (!pi || startAt + list.length >= (pi.totalResults || 0) || !list.length) break;
            startAt += list.length;
        }
        return out;
    }

    // Every item of the chosen types in the project, all pages. Defensive field reads
    // (SLJamaTree.normalizeItem): vendor payloads drift; missing degrades to empty.
    async function bridgeFetchItems() {
        const cfg = bridgeConfig();
        if (!cfg.baseUrl || !cfg.projectId) throw new Error('Configure the connector first (Jama address and project id).');
        const picks = _picks(cfg);
        if (picks.length) return _fetchPicked(cfg, picks);
        const ty = _types(cfg);
        const all = _allTypes(ty);
        if (!all.length) throw new Error('Choose what comes in from Jama first: open Choose what comes in, tick the folders or items you want and say what each one is. Nothing is read until you do.');
        const T = _T(); if (!T) throw new Error('The Jama tree module did not load. Reload the page.');
        const base = String(cfg.baseUrl).replace(/\/+$/, '');
        const typeQ = all.map(t => '&itemType=' + encodeURIComponent(t)).join('');
        const out = [];
        let startAt = 0, total = null, truncated = false;
        for (let page = 0; page < MAX_PAGES; page++) {
            const data = await _get(base + '/rest/latest/abstractitems?project=' + encodeURIComponent(cfg.projectId) + typeQ + '&maxResults=' + PAGE + '&startAt=' + startAt,
                ms => _setProgress('Waiting ' + Math.round(ms / 1000) + ' s for the relay limit, then carrying on (' + out.length + (total ? ' of ' + total : '') + ' read).'));
            const items = (data && data.data) || [];
            items.forEach(it => { const n = T.normalizeItem(it); if (n) out.push(n); });
            const pi = data && data.meta && data.meta.pageInfo;
            total = pi && pi.totalResults != null ? pi.totalResults : total;
            _setProgress('Reading Jama: ' + out.length.toLocaleString() + (total ? ' of ' + Number(total).toLocaleString() : '') + ' items');
            if (!pi || startAt + items.length >= (pi.totalResults || 0) || !items.length) break;
            startAt += items.length;
            if (page === MAX_PAGES - 1) truncated = true;
        }
        out._truncated = truncated; out._total = total;
        return out;
    }

    // 26 Oct 2026: everything under what was ticked in the Jama browser. Each pick is read fresh first
    // (it may have moved in Jama, and its place decides what is under it), then the project's items,
    // all pages, and each item takes the kind of the deepest pick that holds it. Folders and sets are
    // never filed; they go into the look-up so the function tree can look through them without
    // asking Jama again. Nothing here needs the item types.
    // 27 Oct 2026: what one Jama item type under one ticked thing is in Safety Lab.
    //   chosen  the person said so (picks[].types)       ticked  it is the ticked item's own type
    //   text    a Jama Text item: stays out               name    the type's name says what it is
    //   only    the one kind of item under that folder    ask     nobody can tell: asked, nothing staged
    const _TEXT_RE = /^(text|txt)$/i;
    function _kindFromText(s) {
        s = String(s || '');
        if (/failure\s*condition|hazard/i.test(s)) return 'fc';
        if (/assumption/i.test(s)) return 'asm';
        if (/requirement/i.test(s)) return 'req';
        if (/function/i.test(s)) return 'fn';
        return '';
    }
    function _typeOf(id) { return (_itemTypes || []).find(t => t.id === id) || null; }
    function _isTextType(id) { const t = _typeOf(id); return !!(t && (_TEXT_RE.test(t.key || '') || _TEXT_RE.test(t.name || ''))); }
    function _typeLabel(id) { const t = _typeOf(id); return t ? t.name : 'Jama item type ' + id; }
    function _typeDecide(L, tid) {
        const saved = L.types && Object.prototype.hasOwnProperty.call(L.types, String(tid)) ? L.types[String(tid)] : null;
        if (saved === 'skip' || KIND_V[saved] != null) return { kind: saved, how: 'chosen' };
        if (L.ownType != null && tid === L.ownType) return { kind: L.kind, how: 'ticked' };
        if (_isTextType(tid)) return { kind: 'skip', how: 'text' };
        const t = _typeOf(tid), g = t ? _kindFromText(t.name) : '';
        if (g) return { kind: g, how: 'name' };
        const others = Array.from(L.counts.keys()).filter(x => !_isTextType(x));
        if (others.length === 1) return { kind: L.kind, how: 'only' };
        return { kind: '', how: 'ask' };
    }
    function _isContainerTypeId(id) { return !!(_itemTypes && _itemTypes.some(t => t.id === id && _isContainerType(t))); }
    async function _fetchPicked(cfg, picks) {
        const T = _T(); if (!T) throw new Error('The Jama tree module did not load. Reload the page.');
        const base = String(cfg.baseUrl).replace(/\/+$/, '');
        const warnings = [], live = [];
        for (const p of picks) {
            const gone = 'The Jama item ' + (p.key || p.id) + (p.name ? ', ' + p.name + ',' : '') + ' chosen to come in is no longer in this Jama project, so nothing is read from it. Choose again in Choose what comes in if it moved.';
            let raw = null;
            try { raw = await _get(base + '/rest/latest/items/' + encodeURIComponent(p.id)); }
            catch (e) { if (/\b404\b/.test(String((e && e.message) || e))) { warnings.push(gone); continue; } throw e; }
            const rawN = raw && raw.data ? raw.data : raw;
            const n = T.normalizeItem(rawN);
            if (!n) { warnings.push(gone); continue; }
            const isBox = (rawN && rawN.childItemType != null) || _isContainerTypeId(n.type);
            live.push({ kind: p.kind, id: n.id, key: n.key || p.key || String(p.id), name: n.name || p.name || '', seq: n.seq, depth: n.seq ? n.seq.split('.').length : 999,
                        ownType: isBox ? null : n.type, types: (p.types && typeof p.types === 'object') ? p.types : {}, counts: new Map(), examples: new Map() });
        }
        // 27 Oct 2026: the item type names decide Text items and named types; read once when Jama allows it
        if (live.length && _itemTypes == null && !_itemTypesRefused) {
            try { _itemTypes = await bridgeFetchItemTypes(); } catch (_) { _itemTypesRefused = true; }
        }
        live.sort((a, b) => b.depth - a.depth);                 // the deepest pick decides
        const out = [], context = new Map(), hits = [];
        let startAt = 0, total = null, truncated = false;
        if (live.length) {
            for (let page = 0; page < MAX_PAGES; page++) {
                const data = await _get(base + '/rest/latest/abstractitems?project=' + encodeURIComponent(cfg.projectId) + '&maxResults=' + PAGE + '&startAt=' + startAt,
                    ms => _setProgress('Waiting ' + Math.round(ms / 1000) + ' s for the relay limit, then carrying on (' + out.length + ' chosen so far).'));
                const items = (data && data.data) || [];
                items.forEach(raw => {
                    const n = T.normalizeItem(raw); if (!n) return;
                    const container = (raw && raw.childItemType != null) || _isContainerTypeId(n.type);
                    const hit = container ? null : live.find(l => l.id === n.id || (l.seq && n.seq && n.seq.indexOf(l.seq + '.') === 0));
                    if (hit) {
                        hits.push([n, hit]);
                        hit.counts.set(n.type, (hit.counts.get(n.type) || 0) + 1);
                        const ex = hit.examples.get(n.type) || []; if (ex.length < 3) ex.push(n.key + (n.name ? ' ' + n.name : '')); hit.examples.set(n.type, ex);
                    }
                    else context.set(n.id, n);
                });
                const pi = data && data.meta && data.meta.pageInfo;
                total = pi && pi.totalResults != null ? pi.totalResults : total;
                _setProgress('Reading Jama: ' + (startAt + items.length).toLocaleString() + (total ? ' of ' + Number(total).toLocaleString() : '') + ' items, ' + out.length.toLocaleString() + ' chosen');
                if (!pi || startAt + items.length >= (pi.totalResults || 0) || !items.length) break;
                startAt += items.length;
                if (page === MAX_PAGES - 1) truncated = true;
            }
        }
        // 27 Oct 2026: each Jama item type under each ticked thing, decided (_typeDecide). An item left out
        // is still looked through (context), so a function under it keeps its place in the tree.
        const types = [];
        live.forEach(L => L.counts.forEach((count, tid) => {
            const dcs = _typeDecide(L, tid);
            types.push({ pickId: L.id, pickKey: L.key, pickName: L.name, pickKind: L.kind, typeId: tid, label: _typeLabel(tid), named: !!_typeOf(tid),
                         count: count, examples: L.examples.get(tid) || [], kind: dcs.kind, how: dcs.how });
        }));
        const kindOf = new Map(types.map(t => [t.pickId + ':' + t.typeId, t.kind]));
        hits.forEach(([n, L]) => {
            const k = kindOf.get(L.id + ':' + n.type);
            if (KIND_V[k] != null) { n.jamaType = n.type; n.type = KIND_V[k]; out.push(n); }
            else context.set(n.id, n);
        });
        out._truncated = truncated; out._total = total; out._context = context; out._warnings = warnings;
        out._types = types; out._undecided = types.filter(t => t.how === 'ask');
        return out;
    }


    // 22 Oct 2026: the fields of one Jama item type (for the failure-condition field choices)
    async function bridgeFetchTypeFields(typeId) {
        const cfg = bridgeConfig();
        if (!cfg.baseUrl) throw new Error('Enter the Jama address first.');
        const base = String(cfg.baseUrl).replace(/\/+$/, '');
        const data = await _get(base + '/rest/latest/itemtypes/' + encodeURIComponent(typeId));
        const f = (data && data.data && data.data.fields) || [];
        return f.filter(x => x && x.name).map(x => ({ name: String(x.name), label: String(x.label || x.name), type: String(x.fieldType || ''), pickList: x.pickList != null ? Number(x.pickList) : null }));
    }
    // 22 Oct 2026: the project's folders and sets, for "which Jama folder holds this system"
    function _isContainerType(t) { return /^(FLD|SET)$/i.test(String(t.key || '')) || /^(folder|set)$/i.test(String(t.name || '')); }
    async function bridgeFetchContainers() {
        const cfg = bridgeConfig();
        if (!cfg.baseUrl || !cfg.projectId) throw new Error('Connect Jama first (address and project).');
        const T = _T(); if (!T) throw new Error('The Jama tree module did not load. Reload the page.');
        // 26 Oct 2026: when Jama will not list the item types (seen at a customer: HTTP 403 on /itemtypes),
        // folders and sets are found by their shape instead: they are the items that carry a child item type.
        let types = null;
        try { types = (_itemTypes && _itemTypes.length ? _itemTypes : (_itemTypes = await bridgeFetchItemTypes())).filter(_isContainerType); }
        catch (_) { types = null; }
        if (types && !types.length) throw new Error('This Jama project has no Folder or Set item type to choose from.');
        const base = String(cfg.baseUrl).replace(/\/+$/, '');
        const typeQ = types ? types.map(t => '&itemType=' + encodeURIComponent(t.id)).join('') : '';
        const out = [];
        for (let page = 0, startAt = 0; page < MAX_PAGES; page++) {
            const data = await _get(base + '/rest/latest/abstractitems?project=' + encodeURIComponent(cfg.projectId) + typeQ + '&maxResults=' + PAGE + '&startAt=' + startAt);
            const items = (data && data.data) || [];
            items.forEach(it => { if (!types && !(it && it.childItemType != null)) return; const n = T.normalizeItem(it); if (n) out.push({ id: n.id, key: n.key, name: n.name, seq: n.seq }); });
            const pi = data && data.meta && data.meta.pageInfo;
            if (!pi || startAt + items.length >= (pi.totalResults || 0) || !items.length) break;
            startAt += items.length;
        }
        const segs = s => String(s || '').split('.').map(Number);
        out.sort((a, b) => { const x = segs(a.seq), y = segs(b.seq); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; });
        return out;
    }
    // picklist option names, read once per id and kept for the session
    const _optionNames = new Map();
    async function _nameOptions(ids) {
        const cfg = bridgeConfig(), base = String(cfg.baseUrl || '').replace(/\/+$/, '');
        for (const id of ids) {
            if (_optionNames.has(id)) continue;
            try { const d = await _get(base + '/rest/latest/picklistoptions/' + encodeURIComponent(id)); _optionNames.set(id, String((d && d.data && (d.data.name || d.data.value)) || '')); }
            catch (_) { _optionNames.set(id, ''); }
        }
        return _optionNames;
    }

    // ------------------------------------------------------- requirements diff
    // Pure. Remote requirement items vs the requirements' reqSource fingerprints. Identity is
    // Jama's item id (reqSource.remoteId); rows written by v1 without one match on the key.
    function _allReqs() {
        const out = [];
        (((typeof acReqData !== 'undefined' ? acReqData : []) || [])).forEach(r => out.push(r));
        (((typeof systemsData !== 'undefined' ? systemsData : []) || [])).forEach(s => (s.req || []).forEach(r => out.push(r)));
        return out;
    }
    function bridgeDiff(remoteItems) { return _reqDiffFor(remoteItems, _allReqs()); }
    // 22 Oct 2026: one scope's requirements (the aircraft's, or one system's) against that scope's store
    function _reqDiffFor(remoteItems, reqs) {
        reqs = reqs || [];
        const byRemote = new Map(), byKey = new Map();
        reqs.forEach(r => {
            const s = r && r.reqSource; if (!s) return;
            if (s.remoteId != null && s.tool === TOOL) byRemote.set(Number(s.remoteId), r);
            if (s.reqifId) byKey.set(String(s.reqifId), r);
        });
        const fresh = [], changed = [], unchanged = [];
        const seen = new Set();
        (remoteItems || []).forEach(it => {
            const r = byRemote.get(Number(it.id)) || byKey.get(String(it.key));
            if (r) seen.add(r);
            if (!r) { fresh.push(it); return; }
            const last = (r.reqSource.lastChange || '');
            if ((it.modified && it.modified !== last) || r.reqSource.missingInSource) changed.push({ it, r });
            else unchanged.push({ it, r });
        });
        const missing = reqs.filter(r => r.reqSource && r.reqSource.tool === TOOL && !seen.has(r) && !r.reqSource.missingInSource);
        return { fresh, changed, unchanged, missing, checkedAt: new Date().toISOString() };
    }

    // --------------------------------------------------------- the full check
    // Splits items by kind and by scope (aircraft, or the system whose Jama folder holds them),
    // builds the aircraft function tree (looking through folders with fetchItem), finds each
    // failure condition's function, names picklist values, and stages every review. The reading
    // part is async; the staging part (_compute) is pure and runs again after every signed apply,
    // so a failure condition waiting for its function is ready the moment that function is in.
    function _sysList() { return ((typeof systemsData !== 'undefined' ? systemsData : []) || []).filter(Boolean); }
    function _sysById(id) { return _sysList().find(s => String(s.id) === String(id)) || null; }
    let _stageIn = null;
    async function bridgeStage(items, cfg, fetchItem) {
        const T = _T(), K = _K();
        const ty = _types(cfg, items);
        const warnings = [];
        const cache = new Map();
        // 26 Oct 2026: what the Jama browser read around the chosen items (folders, sets, everything not
        // chosen) is the look-up for the function tree, so looking through folders asks Jama nothing more
        if (items && items._context instanceof Map) items._context.forEach((n, id) => cache.set(id, n));
        if (items && Array.isArray(items._warnings)) items._warnings.forEach(w => warnings.push(w));
        // each system's folder, read fresh (it may have moved in Jama)
        const containers = [];
        const sysCfg = (cfg && cfg.systems) || {};
        for (const sysId of Object.keys(sysCfg)) {
            const c = sysCfg[sysId]; if (!c || c.id == null || !_sysById(sysId)) continue;
            let seq = c.seq;
            if (fetchItem) {
                try { const raw = await fetchItem(c.id); const n = T && T.normalizeItem(raw && raw.data ? raw.data : raw); if (n) { seq = n.seq; cache.set(n.id, n); } else warnings.push('The Jama folder chosen for system ' + ((_sysById(sysId) || {}).name || sysId) + ' (' + (c.key || c.id) + ') was not found; that system is not read.'); }
                catch (_) { warnings.push('The Jama folder of system ' + ((_sysById(sysId) || {}).name || sysId) + ' could not be read this time.'); }
            }
            if (seq) containers.push({ sysId: String(sysId), seq: seq, id: c.id });
        }
        let parents = new Map(), fcParents = new Map();
        if (T && ty.fn.length) {
            const res = await T.resolveFunctionParents(items || [], ty.fn, fetchItem, { cache });
            parents = res.parentOf; res.warnings.forEach(w => warnings.push(w));
            if (ty.fc.length) {
                const r2 = await T.resolveFunctionParents(items || [], ty.fn, fetchItem, { cache, fromTypes: ty.fc });
                fcParents = r2.parentOf; r2.warnings.forEach(w => { if (warnings.indexOf(w) < 0) warnings.push(w); });
            }
        }
        // name the picklist values the failure-condition fields use
        const fcFields = Object.values((cfg && cfg.fields && cfg.fields.fc) || {}).filter(Boolean);
        if (K && fcFields.length && fetchItem) {
            const fcSet = new Set(ty.fc);
            await _nameOptions(K.optionIds((items || []).filter(n => n && fcSet.has(n.type)), fcFields));
        }
        if (items && items._truncated) warnings.push('Read the first ' + (MAX_PAGES * PAGE).toLocaleString() + ' items of the Jama project only (Jama reports ' + Number(items._total || 0).toLocaleString() + '), so nothing is flagged as missing from this check. Ask Safety Lab to raise the limit.');
        _stageIn = { items: items || [], cfg: cfg, parents, fcParents, containers, warnings, truncated: !!(items && items._truncated) };
        return _compute(_stageIn);
    }
    function _leafNote(store) {
        return function (subId) {
            if (typeof SLFuncTree === 'undefined' || !SLFuncTree.isLeaf) return '';
            const ix = SLFuncTree.index(store || []);
            const r = ix.bySub.get(String(subId));
            return (r && !SLFuncTree.isLeaf(r, ix)) ? 'it is under ' + subId + ', which has functions under it; failure conditions belong to the lowest level' : '';
        };
    }
    function _compute(inp) {
        const T = _T(), K = _K();
        const cfg = inp.cfg, ty = _types(cfg, inp.items), items = inp.items;
        const warnings = inp.warnings.slice();
        const set = a => new Set(a);
        const fnSet = set(ty.fn), reqSet = set(ty.req), asmSet = set(ty.asm), fcSet = set(ty.fc);
        const part = K ? K.partition(items, inp.containers) : new Map();
        const scopeOf = n => part.get(n.id) || null;
        const of = (s, sid) => items.filter(n => n && s.has(n.type) && scopeOf(n) === sid);
        const fcF = (cfg.fields && cfg.fields.fc) || {};
        const values = it => ({ mode: K.fieldText(it, fcF.mode, _optionNames), severity: K.fieldText(it, fcF.severity, _optionNames), phases: K.fieldText(it, fcF.phases, _optionNames),
                                effAc: K.fieldText(it, fcF.effAc, _optionNames), effCrew: K.fieldText(it, fcF.effCrew, _optionNames), effPax: K.fieldText(it, fcF.effPax, _optionNames) });
        const byKey = new Map(items.filter(Boolean).map(n => [n.id, n]));
        // the function a failure condition is under, as the Safety Lab ID of that scope's row
        function fcFunction(rows, idOf) {
            const fromJama = new Map(rows.filter(r => r && r.fnSource && r.fnSource.tool === TOOL).map(r => [Number(r.fnSource.remoteId), r]));
            return {
                of: it => {
                    const fid = inp.fcParents.get(it.id);
                    if (fid != null) { const r = fromJama.get(Number(fid)); return r ? idOf(r) : ''; }
                    const t = fcF.function ? K.fieldText(it, fcF.function, _optionNames) : '';
                    if (t) { const r = rows.find(x => x && (String(x.subId || '') === t || String(x.funcId || '') === t)); return r ? idOf(r) : ''; }
                    return '';
                },
                why: it => {
                    const fid = inp.fcParents.get(it.id);
                    if (fid != null) { const f = byKey.get(Number(fid)); return 'its function ' + ((f && f.key) || fid) + ' is not in Safety Lab yet: apply the functions first'; }
                    const t = fcF.function ? K.fieldText(it, fcF.function, _optionNames) : '';
                    if (t) return 'its function ' + t + ' (from the Jama field) is not in Safety Lab';
                    return 'it is not under a function in Jama' + (fcF.function ? '' : ' (or choose the Jama field that names its function)');
                }
            };
        }
        const d = { req: null, fn: null, asm: null, fc: null, sys: {}, warnings: warnings, checkedAt: new Date().toISOString() };
        const loose = _unassignedSystems(cfg);
        if (loose.length) warnings.push(_looseText(loose));
        // ---- aircraft
        const acReq = (typeof acReqData !== 'undefined' ? acReqData : []) || [];
        d.req = _reqDiffFor(of(reqSet, null).filter(n => !fnSet.has(n.type)), acReq);
        if (ty.fn.length && T) {
            const fnItems = of(fnSet, null);
            const tree = T.buildTree(fnItems, ty.fn, inp.parents);
            const _lim = (typeof SLFuncTree !== 'undefined' && SLFuncTree.levelLimit) ? SLFuncTree.levelLimit() : 0;
            // 22 Oct 2026: the project's level limit (the 3-level layout). Items below it are never staged; the review names them.
            d.fn = T.diffFunctions(tree, (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []) || [], { levelLimit: _lim });
            if (_lim && d.fn.tooDeep && d.fn.tooDeep.length) warnings.push('Jama: ' + SLFuncTree.refusedText(d.fn.tooDeep.map(x => x.item.key), 'brought in'));
            d.fn.tops = tree.tops.length; d.fn.total = fnItems.length;
            d.fn.levels = T.levelCounts ? T.levelCounts(tree) : [];   // 27 Oct 2026: the review counts the tree by level
            if (inp.versions instanceof Map) _revisedInto(d, inp.versions);
        }
        if (K && ty.asm.length) d.asm = K.diffAssumptions(of(asmSet, null), (typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : []) || []);
        if (K && ty.fc.length) {
            const acFn = (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []) || [];
            const ff = fcFunction(acFn, r => String(r.subId || r.funcId || ''));
            d.fc = K.diffFailureConditions(of(fcSet, null), { fcim: (typeof acFcimData !== 'undefined' ? acFcimData : []) || [], fha: (typeof acFhaData !== 'undefined' ? acFhaData : []) || [],
                                                              functionOf: ff.of, functionWhy: ff.why, values, leafCheck: _leafNote(acFn) });
        }
        // ---- each system with a Jama folder
        inp.containers.forEach(c => {
            const s = _sysById(c.sysId); if (!s || !K) return;
            const sd = { name: s.name || c.sysId, fn: null, req: null, asm: null, fc: null };
            if (ty.fn.length) sd.fn = K.diffSystemFunctions(of(fnSet, c.sysId), s.functions || []);
            if (ty.req.length) sd.req = _reqDiffFor(of(reqSet, c.sysId).filter(n => !fnSet.has(n.type)), s.req || []);
            if (ty.asm.length) sd.asm = K.diffAssumptions(of(asmSet, c.sysId), s.asm || []);
            if (ty.fc.length) {
                const ff = fcFunction(s.functions || [], r => String(r.funcId || ''));
                sd.fc = K.diffFailureConditions(of(fcSet, c.sysId), { fcim: s.fcim || [], fha: s.fha || [], functionOf: ff.of, functionWhy: ff.why, values });
            }
            d.sys[c.sysId] = sd;
        });
        // 27 Oct 2026: a read cut short at the item limit cannot say anything is gone from Jama
        if (inp.truncated) [d].concat(Object.keys(d.sys).map(k => d.sys[k])).forEach(s => ['fn', 'req', 'asm', 'fc'].forEach(k => { const x = s && s[k]; if (x && Array.isArray(x.missing)) x.missing = []; }));
        return d;
    }
    function _heldText(und) {
        return 'Nothing from Jama is staged yet: ' + und.length + ' kind' + (und.length === 1 ? '' : 's') + ' of Jama item under what you chose ' + (und.length === 1 ? 'needs' : 'need') +
            ' saying what ' + (und.length === 1 ? 'it is' : 'they are') + ' in Safety Lab (' + und.slice(0, 3).map(t => t.label + ' under ' + t.pickKey).join('; ') + (und.length > 3 ? '; ...' : '') + '). Choose below, or Leave out.';
    }
    // System workspaces with no Jama folder yet: until one is chosen, that system's items in Jama read
    // as aircraft level. Said on every aircraft panel, so nobody signs them in at the wrong level.
    function _unassignedSystems(cfg) { const m = (cfg && cfg.systems) || {}; return _sysList().filter(s => s.id != null && !m[String(s.id)]); }
    function _looseText(list) {
        return list.length + ' system workspace' + (list.length === 1 ? ' has' : 's have') + ' no Jama folder yet (' + list.slice(0, 4).map(s => s.name || s.id).join(', ') + (list.length > 4 ? ', ...' : '') +
            '). Until ' + (list.length === 1 ? 'it has one' : 'they have one') + ', anything of ' + (list.length === 1 ? 'that system' : 'those systems') + ' in Jama comes in here, at aircraft level. Choose the folder on the system\'s pages first.';
    }
    // the requirements pending count of one diff
    function _reqPending(r) { return r ? r.fresh.length + r.changed.length + r.missing.length : 0; }
    function _kindPending(k, x) {
        if (!x) return 0;
        if (k === 'req') return _reqPending(x);
        if (k === 'fn' && x.fnChanged) return (_T() ? _T().pending(x) : 0) + ((x.revised || []).length);
        return (x.fresh || []).length + (x.changed || []).length + (x.missing || []).length;
    }
    // pending for one scope and some kinds (scope: 'ac' or a system id); all when omitted
    function _pending(d, scope, kinds) {
        if (!d) return 0;
        const ks = kinds || ['fn', 'req', 'asm', 'fc'];
        const one = src => ks.reduce((n, k) => n + _kindPending(k, src && src[k]), 0);
        if (scope === 'ac') return one(d);
        if (scope) return one(d.sys && d.sys[scope]);
        return one(d) + Object.keys(d.sys || {}).reduce((n, id) => n + one(d.sys[id]), 0);
    }

    // ---------------------------------------------------- Jama revision numbers
    // 21 Oct 2026 (the customer AFHA template layout: the Title reads "<Jama key> <name>, Rev <n>"). Jama does
    // not put an item's version in its item lists; the versions list of one item does, as its
    // count. It is read only where it can have changed: a function not yet in the model, one never
    // read, or one Jama modified since the last check. A new number is a change like any other:
    // listed for review (REVISION) and written only when someone signs. Read only when the
    // project shows Jama revisions (the customer AFHA template layout), because it costs one call per item.
    function _wantsRevisions() { try { return !!(window.SLAfhaTpl && window.SLAfhaTpl.active()); } catch (_) { return false; } }
    async function bridgeReadRevisions(items, cfg, d, fetchVersions) {
        const T = _T(); if (!T || !d || !d.fn) return d;
        const ty = _types(cfg), fnSet = new Set(ty.fn);
        const rows = (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []) || [];
        const byRemote = new Map();
        rows.forEach(r => { if (r && r.fnSource && r.fnSource.tool === TOOL) byRemote.set(Number(r.fnSource.remoteId), r); });
        const K = _K(), part = (K && _stageIn) ? K.partition(items || [], _stageIn.containers) : null;
        const need = (items || []).filter(n => n && fnSet.has(n.type) && (!part || !part.get(n.id))).filter(n => {
            const r = byRemote.get(Number(n.id));
            return !r || r.fnSource.version == null || String(r.fnSource.lastChange || '') !== String(n.modified || '');
        });
        const versions = new Map();
        for (let i = 0; i < need.length; i++) {
            _setProgress('Reading Jama revision numbers: ' + (i + 1).toLocaleString() + ' of ' + need.length.toLocaleString());
            try {
                const data = await fetchVersions(need[i].id);
                const pi = data && data.meta && data.meta.pageInfo;
                const n = pi && pi.totalResults != null ? Number(pi.totalResults) : null;
                if (n != null && isFinite(n) && n > 0) versions.set(Number(need[i].id), n);
            } catch (e) { if (!d.warnings.some(w => /revision numbers/.test(w))) d.warnings.push('Some Jama revision numbers could not be read (' + (e && e.message || e) + '); they are read again at the next check.'); }
        }
        if (_stageIn) { _stageIn.versions = versions; (d.warnings || []).forEach(w => { if (_stageIn.warnings.indexOf(w) < 0) _stageIn.warnings.push(w); }); }
        _revisedInto(d, versions, items);
        return d;
    }
    function _revisedInto(d, versions, items) {
        items = items || (_stageIn && _stageIn.items) || [];
        const rows = (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []) || [];
        const byRemote = new Map();
        rows.forEach(r => { if (r && r.fnSource && r.fnSource.tool === TOOL) byRemote.set(Number(r.fnSource.remoteId), r); });
        d.fn.versions = versions;
        d.fn.revised = [];
        versions.forEach((v, id) => {
            const r = byRemote.get(id);
            if (r && Number(r.fnSource.version) !== v) {
                const it = (items || []).find(n => n && Number(n.id) === id);
                d.fn.revised.push({ remoteId: id, key: r.fnSource.key || (it && it.key) || '', name: (it && it.name) || r.subName || r.funcName || '', from: r.fnSource.version == null ? null : Number(r.fnSource.version), to: v });
            }
        });
    }
    // After the signed apply: every row from Jama whose revision was read takes it (new rows too).
    function _applyRevisions(fn, store, by, at) {
        if (!fn || !(fn.versions instanceof Map) || !Array.isArray(store)) return 0;
        let n = 0;
        store.forEach(r => {
            if (!r || !r.fnSource || r.fnSource.tool !== TOOL) return;
            const v = fn.versions.get(Number(r.fnSource.funcOnly ? r.fnSource.remoteId : r.fnSource.remoteId));
            if (v != null && Number(r.fnSource.version) !== v) { r.fnSource.version = v; r.fnSource.versionReadAt = at; r.fnSource.versionBy = by; n++; }
        });
        return n;
    }

    // ------------------------------------------------------------ the apply
    function _newId() { try { if (typeof newRowId === 'function') return newRowId(); } catch (_) {} return Date.now().toString() + Math.random().toString(36).slice(2, 7); }
    function _applyReqs(r, store, level, by, at, out) {
        const txt = it => String(it.text || '') || it.name;
        (r.fresh || []).forEach(it => {
            store.push({
                internalId: _newId(),
                id: it.key, traceId: it.key, level: level, type: 'Imported',
                text: txt(it), rat: '',
                reqSource: { tool: TOOL, reqifId: it.key, remoteId: it.id, lastChange: it.modified, by: by, at }
            });
            out.added++;
        });
        (r.changed || []).forEach(({ it, r: row }) => {
            row.text = txt(it) || row.text;
            row.reqSource.lastChange = it.modified; row.reqSource.remoteId = it.id; row.reqSource.reqifId = row.reqSource.reqifId || it.key;
            row.reqSource.by = by; row.reqSource.at = at;
            delete row.reqSource.missingInSource;
            out.updated++;
        });
        (r.missing || []).forEach(row => { row.reqSource.missingInSource = true; out.flagged++; });
    }
    // the FCIM's failure conditions feed the FHA's list; rebuild it the way the FCIM form does
    function _refreshExtracted(fcim, extracted) {
        try { if (typeof _pushExtractedFCs === 'function' && Array.isArray(extracted)) { extracted.length = 0; _pushExtractedFCs(fcim, extracted); } } catch (_) {}
    }
    // only: { scope: 'ac' | <system id>, kinds: ['fn', 'req', 'asm', 'fc'] } applies that part of the
    // review and leaves the rest staged (the panel on each page signs for that page). Without it,
    // everything staged is applied.
    function bridgeApply(diff, signedBy, only) {
        if (!signedBy || !String(signedBy).trim()) return { ok: false, err: 'A signature is required. The bridge watches; you decide.' };
        const by = String(signedBy).trim();
        const at = new Date().toISOString();
        const K = _K();
        // v1 callers passed the requirements diff itself
        const d = (diff && (diff.req || diff.fn || diff.asm || diff.fc || diff.sys)) ? diff : { req: diff, fn: null };
        const want = (scope, k) => !only || ((only.scope || 'ac') === scope && (!only.kinds || only.kinds.indexOf(k) >= 0));
        const out = { ok: true, added: 0, updated: 0, flagged: 0, fn: null, asm: null, fc: null, sys: {}, refused: [] };
        // ---- aircraft (functions first: failure conditions hang off them)
        if (d.fn && _T() && want('ac', 'fn')) {
            const store = (typeof acFunctionsData !== 'undefined' ? acFunctionsData : null);
            const r = _T().applyFunctions(d.fn, store, { signedBy: by, at, newId: _newId });
            if (!r.ok) return r;
            out.fn = r;
            r.revised = _applyRevisions(d.fn, store, by, at);
        }
        if (d.req && want('ac', 'req')) {
            const store = (typeof acReqData !== 'undefined' ? acReqData : null);
            if (!store) return { ok: false, err: 'Requirement store unavailable.' };
            _applyReqs(d.req, store, 'aircraft', by, at, out);
        }
        if (d.asm && K && want('ac', 'asm')) out.asm = K.applyAssumptions(d.asm, (typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : null), { signedBy: by, at, newId: _newId });
        if (d.fc && K && want('ac', 'fc')) {
            const ctx = { fcim: (typeof acFcimData !== 'undefined' ? acFcimData : null), fha: (typeof acFhaData !== 'undefined' ? acFhaData : null) };
            out.fc = K.applyFailureConditions(d.fc, ctx, { signedBy: by, at, newId: _newId });
            if (out.fc.ok) { _refreshExtracted(ctx.fcim, (typeof acExtractedFCs !== 'undefined' ? acExtractedFCs : null)); out.refused = out.refused.concat(out.fc.refused || []); }
        }
        // ---- systems
        Object.keys(d.sys || {}).forEach(sysId => {
            const sd = d.sys[sysId], s = _sysById(sysId); if (!sd || !s || !K) return;
            const so = { fn: null, req: null, asm: null, fc: null };
            if (sd.fn && want(sysId, 'fn')) { if (!Array.isArray(s.functions)) s.functions = []; so.fn = K.applySystemFunctions(sd.fn, s.functions, { signedBy: by, at, newId: _newId }); }
            if (sd.req && want(sysId, 'req')) { if (!Array.isArray(s.req)) s.req = []; so.req = { added: 0, updated: 0, flagged: 0 }; _applyReqs(sd.req, s.req, 'system', by, at, so.req); }
            if (sd.asm && want(sysId, 'asm')) { if (!Array.isArray(s.asm)) s.asm = []; so.asm = K.applyAssumptions(sd.asm, s.asm, { signedBy: by, at, newId: _newId }); }
            if (sd.fc && want(sysId, 'fc')) {
                if (!Array.isArray(s.fcim)) s.fcim = []; if (!Array.isArray(s.fha)) s.fha = [];
                so.fc = K.applyFailureConditions(sd.fc, { fcim: s.fcim, fha: s.fha }, { signedBy: by, at, newId: _newId });
                if (so.fc.ok) { if (!Array.isArray(s.extractedFCs)) s.extractedFCs = []; _refreshExtracted(s.fcim, s.extractedFCs); out.refused = out.refused.concat(so.fc.refused || []); }
            }
            out.sys[sysId] = so;
        });
        const cnt = x => x ? '+' + (x.added || 0) + ' new, ' + (x.updated || 0) + ' updated, ' + (x.flagged || 0) + ' flagged' : '';
        const parts = [];
        if (!only || want('ac', 'req')) parts.push('requirements +' + out.added + ' new, ' + out.updated + ' updated, ' + out.flagged + ' flagged missing');
        if (out.fn) parts.push('functions +' + out.fn.added + ' new, ' + out.fn.updated + ' updated, ' + out.fn.moved + ' moved, ' + out.fn.fnUpdated + ' renamed under a changed top function, ' + out.fn.flagged + ' flagged missing' + (out.fn.revised ? ', ' + out.fn.revised + ' revision number(s) recorded' : ''));
        if (out.asm) parts.push('assumptions ' + cnt(out.asm));
        if (out.fc) parts.push('failure conditions ' + cnt(out.fc));
        Object.keys(out.sys).forEach(id => { const so = out.sys[id], nm = ((_sysById(id) || {}).name || id); ['fn', 'req', 'asm', 'fc'].forEach(k => { if (so[k]) parts.push(nm + ' ' + { fn: 'functions', req: 'requirements', asm: 'assumptions', fc: 'failure conditions' }[k] + ' ' + cnt(so[k])); }); });
        try { if (typeof window.jrnl === 'function') window.jrnl('bridge-sync', 'Jama live sync applied: ' + parts.join('; ') + (out.refused.length ? '; not placed: ' + out.refused.join(' | ') : '') + '. Signed ' + by); } catch (_) {}
        ['renderACFunctions', 'renderACReq', 'renderACFCIM', 'renderACFHA', 'renderACAssumptions', 'renderSysFunctions', 'renderSysReq', 'renderSysFCIM', 'renderSysFHA', 'renderSysAssumptions']
            .forEach(fn => { try { if (typeof window[fn] === 'function') window[fn](); } catch (_) {} });
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        // what is still staged, against the model as it is now
        if ((diff === _lastDiff || (diff && diff._from === _lastDiff)) && _stageIn) { try { _lastDiff = _compute(_stageIn); } catch (_) { _lastDiff = null; } }
        return out;
    }

    // ---------------------------------------------- 28 Oct 2026: the connections framework (connections.js)
    // Every staged change as one line: { key, tool, scope, kind, change, remoteId, extKey, name, slId, fields,
    // before, after }. The key names the Jama item, what changed and Jama's modified time, so a change someone
    // rejected stays rejected until Jama changes the item again.
    const _CK = ['fn', 'req', 'asm', 'fc'];
    const _CARR = { fnChanged: 'renamed', fresh: 'added', changed: 'changed', moved: 'moved', revised: 'revised', missing: 'removed' };
    function _ceItem(k, arr, e) { if (!e || arr === 'revised') return null; if (k === 'req') return arr === 'fresh' ? e : (arr === 'changed' ? e.it : null); return e.item || null; }
    function _ceRow(k, arr, e) {
        if (!e || arr === 'revised') return null;
        if (k === 'req') return arr === 'changed' ? e.r : (arr === 'missing' ? e : null);
        if (arr === 'fnChanged') return (e.rows && e.rows[0]) || null;
        return e.row || null;
    }
    function _ceSrc(row) { return row ? (row.fnSource || row.reqSource || row.asmSource || row.fcSource || null) : null; }
    function _ceRemote(k, arr, e) {
        if (arr === 'revised') return e ? e.remoteId : null;
        const it = _ceItem(k, arr, e); if (it && it.id != null) return it.id;
        const s = _ceSrc(_ceRow(k, arr, e)); return s ? s.remoteId : null;
    }
    function _ceKey(scope, k, arr, e) {
        const it = _ceItem(k, arr, e), row = _ceRow(k, arr, e), rid = _ceRemote(k, arr, e);
        const ver = arr === 'revised' ? ('v' + (e && e.to)) : (arr === 'missing' ? 'gone' : ((it && it.modified) || ''));
        return ['jama', scope, k, arr, rid != null ? String(rid) : ('row:' + ((row && row.internalId) || '')), ver].join('|');
    }
    function _ceName(k, it, row, e) {
        if (it && it.name) return it.name;
        if (e && e.name) return e.name;
        if (!row) return '';
        return String(row.subName || row.funcName || row.text || row.fcDesc || row.tlDesc || row.asmId || row.id || '');
    }
    function _ceSlId(k, arr, e, it, row) {
        if (k === 'fn') return String((row && (row.subId || row.funcId)) || (it && it.key) || '');
        if (k === 'req') return String((row && (row.id || row.reqId)) || (it && it.key) || '');
        if (k === 'asm') return String((row && row.asmId) || (it && it.key) || '');
        if (k === 'fc') return String((e && e.want && e.want.fcId) || (row && row.fcId) || (it && it.key) || '');
        return '';
    }
    function _ceBeforeAfter(k, arr, e, it, row) {
        const S2 = v => String(v == null ? '' : v);
        if (arr === 'revised') return { before: { revision: e.from == null ? '' : String(e.from) }, after: { revision: String(e.to) } };
        if (arr === 'fnChanged') return { before: { name: S2(row && row.funcName), description: S2(row && row.funcDef) }, after: { name: S2(it && it.name), description: S2(it && it.text) } };
        if (arr === 'moved') {
            const was = row ? ([S2(row.funcId), S2(row.parentSubId)].filter(Boolean).join(' > ') || S2(row.funcId)) : '';
            const now = [e.top && e.top.key, e.parent && e.parent.key].filter(Boolean).join(' > ');
            return { before: { place: was }, after: { place: now } };
        }
        if (arr === 'fresh') {
            if (k === 'fc' && e.want) return { before: {}, after: { 'failure condition': S2(e.want.fcDesc), 'function': S2(e.want.subId), severity: S2(e.want.severity) } };
            return { before: {}, after: { name: S2(it && it.name), description: S2(it && it.text) } };
        }
        if (arr === 'missing') return { before: { name: _ceName(k, null, row, e) }, after: {} };
        if (k === 'fn') return { before: { name: S2(row && row.subName), description: S2(row && row.subDef) }, after: { name: S2(it && it.name), description: S2(it && it.text) } };
        if (k === 'req') return { before: { text: S2(row && row.text) }, after: { text: S2((it && (it.text || it.name)) || '') } };
        if (k === 'asm') return { before: { text: S2(row && row.text) }, after: { text: S2(it && (it.text || it.name)) } };
        if (k === 'fc' && e.want) return { before: { 'failure condition': S2(row && row.fcDesc), 'function': S2(row && row.subId), severity: S2(row && row.severity) },
                                           after: { 'failure condition': S2(e.want.fcDesc), 'function': S2(e.want.subId), severity: S2(e.want.severity) } };
        return { before: {}, after: {} };
    }
    function _connLinkedRows() {
        const out = [];
        const add = (rows, kind, scope, srcKey, idOf, nameOf) => (rows || []).forEach(r => { const s = r && r[srcKey]; if (s && s.tool === TOOL && s.remoteId != null) out.push({ tool: TOOL, remoteId: String(s.remoteId), extKey: s.key || s.reqifId || '', kind, scope, slId: idOf(r), name: nameOf(r), row: r, missing: !!s.missingInSource }); });
        const fnName = r => String(r.subName || r.funcName || ''), fnId = r => String(r.subId || r.funcId || '');
        add(typeof acFunctionsData !== 'undefined' ? acFunctionsData : [], 'fn', 'ac', 'fnSource', fnId, fnName);
        add(typeof acReqData !== 'undefined' ? acReqData : [], 'req', 'ac', 'reqSource', r => String(r.id || ''), r => String(r.text || ''));
        add(typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : [], 'asm', 'ac', 'asmSource', r => String(r.asmId || ''), r => String(r.text || ''));
        add(typeof acFhaData !== 'undefined' ? acFhaData : [], 'fc', 'ac', 'fcSource', r => String(r.fcId || ''), r => String(r.fcDesc || ''));
        _sysList().forEach(s => {
            const sc = String(s.id);
            add(s.functions, 'fn', sc, 'fnSource', r => String(r.funcId || ''), r => String(r.funcName || ''));
            add(s.req, 'req', sc, 'reqSource', r => String(r.id || ''), r => String(r.text || ''));
            add(s.asm, 'asm', sc, 'asmSource', r => String(r.asmId || ''), r => String(r.text || ''));
            add(s.fha, 'fc', sc, 'fcSource', r => String(r.fcId || ''), r => String(r.fcDesc || ''));
        });
        return out;
    }
    function bridgeChanges() {
        const d = _lastDiff, out = [];
        if (!d || d.held) return out;
        const scopes = [['ac', d]].concat(Object.keys(d.sys || {}).map(id => [id, d.sys[id]]));
        scopes.forEach(([scope, src]) => _CK.forEach(k => {
            const x = src && src[k]; if (!x) return;
            Object.keys(_CARR).forEach(arr => (Array.isArray(x[arr]) ? x[arr] : []).forEach(e => {
                const it = _ceItem(k, arr, e), row = _ceRow(k, arr, e), src0 = _ceSrc(row), ba = _ceBeforeAfter(k, arr, e, it, row);
                out.push({
                    key: _ceKey(scope, k, arr, e), tool: TOOL, scope: scope, scopeName: scope === 'ac' ? 'Aircraft' : ((d.sys[scope] && d.sys[scope].name) || scope),
                    kind: k, change: _CARR[arr], arr: arr, remoteId: _ceRemote(k, arr, e),
                    extKey: (it && it.key) || (e && e.key) || (src0 && (src0.key || src0.reqifId)) || '',
                    name: _ceName(k, it, row, e), slId: _ceSlId(k, arr, e, it, row),
                    fields: (e && Array.isArray(e.fields)) ? e.fields.slice() : [], why: (e && e.why) || '',
                    before: ba.before, after: ba.after
                });
            }));
        }));
        return out;
    }
    // Apply exactly these lines (and the new parents a new function hangs under), signed.
    function bridgeApplyKeys(keys, signedBy) {
        const d = _lastDiff;
        if (!d || d.held) return { ok: false, err: 'Nothing from Jama is staged: check Jama first.' };
        const want = new Set((keys || []).map(String));
        const scopes = [['ac', d]].concat(Object.keys(d.sys || {}).map(id => [id, d.sys[id]]));
        scopes.forEach(([scope, src]) => {
            const x = src && src.fn; if (!x || !Array.isArray(x.fresh)) return;
            const freshById = new Map(x.fresh.filter(e => e && e.item).map(e => [e.item.id, e]));
            const pull = e => { let p = e && e.parent; let guard = 0; while (p && freshById.has(p.id) && guard++ < 1000) { const pe = freshById.get(p.id); want.add(_ceKey(scope, 'fn', 'fresh', pe)); p = pe.parent; } };
            x.fresh.forEach(e => { if (want.has(_ceKey(scope, 'fn', 'fresh', e))) pull(e); });
            (x.moved || []).forEach(e => { if (want.has(_ceKey(scope, 'fn', 'moved', e))) pull(e); });
        });
        const pick = (scope, k, x) => {
            if (!x) return x;
            const y = Object.assign({}, x);
            Object.keys(_CARR).forEach(arr => { if (Array.isArray(x[arr])) y[arr] = x[arr].filter(e => want.has(_ceKey(scope, k, arr, e))); });
            if (k === 'fn' && x.versions instanceof Map) {
                const ids = new Set();
                Object.keys(_CARR).forEach(arr => (y[arr] || []).forEach(e => { const r = _ceRemote(k, arr, e); if (r != null) ids.add(Number(r)); }));
                y.versions = new Map(Array.from(x.versions.entries()).filter(([id]) => ids.has(Number(id))));
            }
            return y;
        };
        const f = Object.assign({}, d, { sys: {} });
        _CK.forEach(k => { f[k] = pick('ac', k, d[k]); });
        Object.keys(d.sys || {}).forEach(id => { const s = d.sys[id], t = Object.assign({}, s); _CK.forEach(k => { t[k] = pick(id, k, s[k]); }); f.sys[id] = t; });
        Object.defineProperty(f, '_from', { value: d, enumerable: false });
        return bridgeApply(f, signedBy);
    }

    // ---------------------------------------------- 28 Oct 2026: sending to Jama (Ready to send)
    // Waqas: "if safety lab is the source of truth then we can edit"; "we provide users the interface and ability to push
    // changes directly to that tool". What goes out, and only when an engineer signs and presses Send:
    //   * an item from Jama that an admin made Safety Lab the owner of: Safety Lab's name and description, when they
    //     differ from Jama's copy at the last check;
    //   * failure conditions and safety requirements made in Safety Lab, when Mapping says to send them: created in the
    //     chosen Jama folder as the chosen item type, linked to the function's Jama item, then kept in step.
    // Before every write the item is read again: if someone changed it in Jama since the last exchange it is held
    // back, never overwritten. Calculated results (probabilities, allocated budgets, DALs), signatures and history are
    // never written. Writes go out only to the saved Jama address, and only to items, relationships and comments.
    const _WRITE_PATH = /\/rest\/(latest|v1)\/(items(\/\d+)?|relationships|comments)$/;
    function _writeProblem(method, url) {
        let u; try { u = new URL(String(url)); } catch (_) { return 'not a valid address'; }
        const cfg = bridgeConfig(); let saved = ''; try { saved = new URL(String(cfg.baseUrl)).host; } catch (_) {}
        if (!saved || u.host !== saved) return 'only the saved Jama address can be written to';
        if (!_WRITE_PATH.test(u.pathname)) return 'only Jama items, relationships and comments are written';
        if (method === 'PATCH' && !/\/items\/\d+$/.test(u.pathname)) return 'only an item is changed';
        if (method === 'POST' && /\/items\/\d+$/.test(u.pathname)) return 'an item is changed, not posted to';
        if (method !== 'POST' && method !== 'PATCH') return 'Safety Lab only creates and changes items in Jama; it never deletes';
        return '';
    }
    async function _write(method, url, body) {
        const bad = _writeProblem(method, url); if (bad) throw new Error('Not sent: ' + bad + '.');
        if (_isDesktop()) {
            if (!window.slabBridge || typeof window.slabBridge.send !== 'function') throw new Error('This version of the desktop app cannot send to Jama. Update the app.');
            const r = await window.slabBridge.send(method, url, body);
            if (!r || !r.ok) throw new Error((r && r.error) || 'the send failed');
            return r.data;
        }
        const st = _store();
        if (st && st.door() === 'vault') {
            if (!st.has('jama_token')) throw new Error('Connect the tool first: no credential is saved for this account.');
            const jwt = st.sessionJwt(); if (!jwt) throw new Error('Sign in again to use the connector.');
            const base = (window.SLConfig && window.SLConfig.aiEndpoint) || '';
            if (!base) throw new Error('This install has no proxy configured, so the connector has nowhere to relay through.');
            const res = await fetch(String(base).replace(/\/+$/, '') + '/bridge?target=' + encodeURIComponent(url), { method, headers: { 'Authorization': 'Bearer ' + jwt, 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const j = await res.json().catch(() => null);
            if (!res.ok) throw new Error((j && j.error && j.error.message) || ('HTTP ' + res.status + ' from bridge'));
            return j;
        }
        // Browser-only (no Safety Lab server): the login lives only in this tab and goes through Safety Lab's public relay,
        // which never writes (a public relay that writes would be a way to change anybody's server). Sending needs the
        // desktop app or the company's Safety Lab server, where the login is kept in the keychain or the server's vault.
        throw new Error('Sending to Jama needs the Safety Lab desktop app or your company\u2019s Safety Lab server. In a browser-only session the Jama login stays in this tab and Safety Lab\u2019s public relay only reads.');
    }
    function _sendCfg() { const c = bridgeConfig(); return (c && c.send && typeof c.send === 'object') ? c.send : {}; }
    function _plainSl(s) { return String(s == null ? '' : s); }
    function _html(s) { return _esc(s).replace(/\n/g, '<br>'); }
    // what Safety Lab writes for one of its failure conditions
    function _fcFields(r) {
        const parts = [['Function', r.subId], ['Flight phases', Array.isArray(r.phases) ? r.phases.join(', ') : r.phases], ['Effect on the aircraft', r.effAc], ['Effect on the crew', r.effCrew], ['Effect on occupants', r.effPax],
                       ['Severity (the engineer’s classification)', [r.severity, r.severityRationale].filter(Boolean).join(': ')]];
        const desc = parts.filter(p => _plainSl(p[1]).trim()).map(p => '<p><b>' + _esc(p[0]) + ':</b> ' + _html(p[1]) + '</p>').join('') + '<p><i>Safety Lab owns this item. Change it in Safety Lab; edits made here are not taken in.</i></p>';
        return { name: (_plainSl(r.fcId) ? r.fcId + ' ' : '') + _plainSl(r.fcDesc).slice(0, 230), description: desc };
    }
    function _reqFields(r) {
        return { name: ((_plainSl(r.id) ? r.id + ' ' : '') + _plainSl(r.text)).slice(0, 250), description: '<p>' + _html(r.text) + '</p>' + (r.rat ? '<p><b>Rationale:</b> ' + _html(r.rat) + '</p>' : '') + '<p><i>Safety Lab owns this item. Change it in Safety Lab; edits made here are not taken in.</i></p>' };
    }
    function _fp(o) { try { return JSON.stringify(o); } catch (_) { return ''; } }
    function _ownSent(r) { return (r && r.sendLinks && r.sendLinks[TOOL]) || null; }
    // the Jama item last read for a remote id (from the last check)
    function _seenItem(id) { const it = _stageIn && (_stageIn.items || []).find(n => n && Number(n.id) === Number(id)); return it || null; }
    function bridgeOutgoing() {
        const out = [], C = window.SLConnections; if (!C) return out;
        const cfgS = _sendCfg();
        // 1. items from Jama that Safety Lab now owns
        _connLinkedRows().forEach(x => {
            if (C.ownerOf('jama', x.remoteId) !== 'sl' || x.missing) return;
            const it = _seenItem(x.remoteId); if (!it) return;
            let want = null;
            if (x.kind === 'fn') want = x.row.fnSource && x.row.fnSource.funcOnly ? { name: _plainSl(x.row.funcName), text: _plainSl(x.row.funcDef) } : { name: _plainSl(x.row.subName), text: _plainSl(x.row.subDef) };
            else if (x.kind === 'req' || x.kind === 'asm') want = { name: it.name, text: _plainSl(x.row.text) };
            else if (x.kind === 'fc') want = { name: _plainSl(x.row.fcDesc), text: it.text };
            if (!want) return;
            const diff = [];
            if (want.name !== it.name) diff.push('name');
            if (want.text !== it.text) diff.push('description');
            if (!diff.length) return;
            out.push({ key: 'jama|own|' + x.remoteId + '|' + _fp(want).length + ':' + _fp(want).slice(0, 40), tool: 'jama', change: 'changed', kind: x.kind, slId: x.slId, name: x.name,
                       remoteId: x.remoteId, seen: it.modified, after: Object.assign(diff.indexOf('name') >= 0 ? { name: want.name } : {}, diff.indexOf('description') >= 0 ? { description: want.text } : {}),
                       there: 'Jama ' + (it.key || x.remoteId) + ': ' + diff.join(' and ') + ' differ', _ops: diff.map(k => ({ op: 'replace', path: '/fields/' + (k === 'name' ? 'name' : 'description'), value: k === 'name' ? want.name : '<p>' + _html(want.text) + '</p>' })), _row: x.row, _src: x.kind });
        });
        // 2. failure conditions and requirements made in Safety Lab, when Mapping says to send them
        const kinds = [['fc', typeof acFhaData !== 'undefined' ? acFhaData : [], _fcFields, r => !r.fcSource && _plainSl(r.fcDesc).trim()],
                       ['req', typeof acReqData !== 'undefined' ? acReqData : [], _reqFields, r => !r.reqSource && _plainSl(r.text).trim()]];
        kinds.forEach(([k, rows, fieldsOf, mine]) => {
            const sc = cfgS[k]; if (!sc || !sc.on) return;
            (rows || []).forEach(r => {
                if (!r || !mine(r)) return;
                const f = fieldsOf(r), fp = _fp(f), link = _ownSent(r);
                if (link && link.fp === fp) return;
                out.push({ key: 'jama|' + k + '|' + (r.internalId || r.fcId || r.id) + '|' + (link ? 'chg' : 'new') + '|' + fp.length + ':' + fp.slice(-24), tool: 'jama', change: link ? 'changed' : 'new', kind: k,
                           slId: String(k === 'fc' ? (r.fcId || '') : (r.id || '')), name: k === 'fc' ? r.fcDesc : r.text, remoteId: link ? link.remoteId : null,
                           after: link ? { name: f.name } : { name: f.name, folder: 'Jama item ' + sc.parent + (sc.itemType ? ', item type ' + sc.itemType : '') },
                           there: link ? ('Jama ' + (link.key || link.remoteId) + ', sent ' + String(link.at || '').slice(0, 10) + ' by ' + (link.by || '')) : 'Not in Jama yet', _fields: f, _fp: fp, _row: r, _send: k });
            });
        });
        return out;
    }
    function _bg(fn) { try { const A = window.SLChangeAck; if (A && typeof A.background === 'function') return A.background(fn); } catch (_) {} return fn(); }
    function _itemOf(data) { return (data && data.data) || data || null; }
    async function _comment(base, id, text) { try { await _write('POST', base + '/rest/latest/comments', { body: { text: text }, location: { item: Number(id) }, commentType: 'GENERAL' }); } catch (_) {} }
    async function bridgeSend(lines, signer, reason) {
        const cfg = bridgeConfig(); const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
        if (!base || !cfg.projectId) return { ok: false, err: 'Connect Jama first.' };
        const cfgS = _sendCfg();
        const res = { ok: true, sent: 0, held: [], failed: [], items: [] };
        const note = 'Sent from Safety Lab by ' + signer + (reason ? ': ' + reason : '') + '.';
        // failure conditions before requirements, so a requirement can be linked to the failure condition it traces to
        const order = l => l._send === 'fc' ? 0 : (l._send === 'req' ? 1 : 2);
        lines = (lines || []).slice().sort((a, b) => order(a) - order(b));
        for (const l of lines) {
            const label = (l.slId ? l.slId + ' ' : '') + String(l.name || '').slice(0, 60);
            try {
                if (l._src) {                              // an item from Jama that Safety Lab owns
                    const now = _itemOf(await _get(base + '/rest/latest/items/' + encodeURIComponent(l.remoteId)));
                    if (!now) { res.failed.push(label + ': Jama no longer has this item'); continue; }
                    if (String(now.modifiedDate || '') !== String(l.seen || '')) { res.held.push(label + ' (changed in Jama since the last check: check Jama, then send again)'); continue; }
                    await _write('PATCH', base + '/rest/latest/items/' + Number(l.remoteId), l._ops);
                    const after = _itemOf(await _get(base + '/rest/latest/items/' + encodeURIComponent(l.remoteId)));
                    const src = l._row && (l._row.fnSource || l._row.reqSource || l._row.asmSource || l._row.fcSource);
                    _bg(() => { if (src && after) { src.lastChange = after.modifiedDate; src.sentBy = signer; src.sentAt = new Date().toISOString(); } });
                    // what Safety Lab now knows Jama holds (until the next check reads it again)
                    { const seen = _seenItem(l.remoteId), T0 = _T(); const n0 = (seen && after && T0) ? T0.normalizeItem(after) : null; if (n0) { seen.name = n0.name; seen.text = n0.text; seen.modified = n0.modified; } }
                    await _comment(base, l.remoteId, note);
                    res.sent++; res.items.push(label); continue;
                }
                const sc = cfgS[l._send] || {};
                const link = _ownSent(l._row);
                if (link) {                                // a Safety Lab item sent before: kept in step
                    const now = _itemOf(await _get(base + '/rest/latest/items/' + encodeURIComponent(link.remoteId)));
                    if (!now) { res.failed.push(label + ': Jama no longer has this item'); continue; }
                    if (link.modified && String(now.modifiedDate || '') !== String(link.modified)) { res.held.push(label + ' (someone changed it in Jama since Safety Lab last sent it; Safety Lab owns it, so send again to overwrite, after checking what they changed)'); _bg(() => { link.modified = now.modifiedDate; }); continue; }
                    await _write('PATCH', base + '/rest/latest/items/' + Number(link.remoteId), [{ op: 'replace', path: '/fields/name', value: l._fields.name }, { op: 'replace', path: '/fields/description', value: l._fields.description }]);
                    const after = _itemOf(await _get(base + '/rest/latest/items/' + encodeURIComponent(link.remoteId)));
                    _bg(() => { link.fp = l._fp; link.at = new Date().toISOString(); link.by = signer; link.modified = after && after.modifiedDate; });
                    await _comment(base, link.remoteId, note);
                    res.sent++; res.items.push(label); continue;
                }
                if (!sc.itemType || !sc.parent) { res.failed.push(label + ': choose the Jama item type and folder in Mapping first'); continue; }
                const made = await _write('POST', base + '/rest/latest/items', { project: Number(cfg.projectId), itemType: Number(sc.itemType), childItemType: Number(sc.itemType), location: { parent: { item: Number(sc.parent) } }, fields: { name: l._fields.name, description: l._fields.description } });
                const id = made && made.meta && (made.meta.id != null ? made.meta.id : (String(made.meta.location || '').match(/\/(\d+)$/) || [])[1]);
                if (id == null) { res.failed.push(label + ': Jama did not say which item it made'); continue; }
                const after = _itemOf(await _get(base + '/rest/latest/items/' + encodeURIComponent(id)));
                _bg(() => { if (!l._row.sendLinks || typeof l._row.sendLinks !== 'object') l._row.sendLinks = {}; l._row.sendLinks[TOOL] = { remoteId: String(id), key: (after && after.documentKey) || '', fp: l._fp, at: new Date().toISOString(), by: signer, modified: after && after.modifiedDate }; });
                // trace: a failure condition to its function's Jama item; a requirement to the failure condition it traces to
                let from = null;
                if (l._send === 'fc') { const fn = (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []).find(x => x && String(x.subId || '') === String(l._row.subId || '') && x.fnSource && x.fnSource.tool === TOOL); if (fn) from = fn.fnSource.remoteId; }
                if (l._send === 'req') { const fc = (typeof acFhaData !== 'undefined' ? acFhaData : []).find(x => x && String(x.fcId || '') === String(l._row.traceId || '')); const lk = _ownSent(fc) || (fc && fc.fcSource && fc.fcSource.tool === TOOL ? { remoteId: fc.fcSource.remoteId } : null); if (lk) from = lk.remoteId; }
                if (from != null) { try { await _write('POST', base + '/rest/latest/relationships', { fromItem: Number(from), toItem: Number(id) }); } catch (e) { res.failed.push(label + ': made in Jama, but the link to its ' + (l._send === 'fc' ? 'function' : 'failure condition') + ' failed (' + ((e && e.message) || e) + ')'); } }
                await _comment(base, id, note);
                res.sent++; res.items.push(label + ' (new: ' + ((after && after.documentKey) || id) + ')');
            } catch (e) { res.failed.push(label + ': ' + ((e && e.message) || e)); }
        }
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        try { if (typeof window.jrnl === 'function') window.jrnl('bridge-send', 'Jama: sent ' + res.sent + (res.held.length ? ', held back ' + res.held.length : '') + (res.failed.length ? ', failed ' + res.failed.length : '') + '. Signed ' + signer); } catch (_) {}
        if (res.failed.length && !res.sent) res.ok = false;
        return res;
    }
    // Mapping: what Safety Lab sends, per kind (item type and folder in Jama)
    function bridgeSendSettingsHtml() {
        const sc = _sendCfg();
        const row = (k, label) => { const c = sc[k] || {};
            return '<tr><td><label class="cx-radio"><input type="checkbox"' + (c.on ? ' checked' : '') + ' onchange="bridgeSendCfg(\'' + k + '\', \'on\', this.checked)"> ' + label + '</label></td>' +
                '<td><input type="number" class="cx-num" value="' + _esc(c.itemType || '') + '" placeholder="item type id" onchange="bridgeSendCfg(\'' + k + '\', \'itemType\', this.value)"></td>' +
                '<td><input type="number" class="cx-num" value="' + _esc(c.parent || '') + '" placeholder="folder item id" onchange="bridgeSendCfg(\'' + k + '\', \'parent\', this.value)"></td></tr>'; };
        return '<div class="cx-sub"><b>What Safety Lab sends to Jama</b><div class="cx-dim">Failure conditions and safety requirements made in Safety Lab go to the Jama folder and item type you give here, linked to the function (or failure condition) they belong to. Safety Lab owns them: they are edited in Safety Lab and sent again from Ready to send. Only the name and the description are written; the engineer’s severity classification is in the description. Calculated results (probabilities, allocated budgets, DALs), signatures and history are never sent. Jama shows an item type’s id under Admin, Item types, and a folder’s id in its address.</div>' +
            '<table class="cx-table"><thead><tr><th>Send</th><th>Jama item type id</th><th>Jama folder id</th></tr></thead><tbody>' + row('fc', 'Failure conditions (aircraft FHA)') + row('req', 'Safety requirements (aircraft)') + '</tbody></table></div>';
    }
    window.bridgeSendCfg = function (k, f, v) {
        const c = bridgeConfig(); c.send = (c.send && typeof c.send === 'object') ? c.send : {}; c.send[k] = Object.assign({}, c.send[k] || {});
        c.send[k][f] = f === 'on' ? !!v : (String(v).trim() ? Number(v) : null);
        const auto = c.auto; bridgeConfigSave(c); try { localStorage.setItem(WATCH_KEY, auto ? '1' : '0'); } catch (_) {}
        try { if (window.SLConnections) window.SLConnections.render(); } catch (_) {}
    };

    // --------------------------------------------------------------- check
    let _lastDiff = null, _checking = false, _itemTypes = null, _itemTypesRefused = false;
    async function bridgeCheck(silent) {
        if (_checking) return _lastDiff;
        _checking = true;
        try {
            const cfg = bridgeConfig();
            _setProgress('Reading Jama...');
            const items = await bridgeFetchItems();
            const base = String(cfg.baseUrl).replace(/\/+$/, '');
            // 27 Oct 2026: a Jama item type nobody can name yet holds the whole check, so nothing comes in
            // under the wrong kind; the panels ask, and the answer runs the check again.
            if (items && Array.isArray(items._undecided) && items._undecided.length) {
                _lastDiff = { held: true, types: items._types, req: null, fn: null, asm: null, fc: null, sys: {},
                              warnings: (items._warnings || []).slice().concat([_heldText(items._undecided)]), checkedAt: new Date().toISOString() };
                _stageIn = null;
                try { if (typeof window.jrnl === 'function') window.jrnl('bridge-check', 'Jama checked: ' + items.length + ' item(s); held until ' + items._undecided.length + ' Jama item type(s) are said what they are.'); } catch (_) {}
                if (!silent) { try { showToast('Jama: say what ' + (items._undecided.length === 1 ? 'one kind' : items._undecided.length + ' kinds') + ' of Jama item is first, then the changes are staged.', 'info', 5200); } catch (_) {} }
                _setProgress(''); _render();
                return _lastDiff;
            }
            _setProgress('Building the function tree...');
            _lastDiff = await bridgeStage(items, cfg, id => _get(base + '/rest/latest/items/' + encodeURIComponent(id)));
            if (items && Array.isArray(items._types)) _lastDiff.types = items._types;
            if (_lastDiff.fn && _wantsRevisions()) await bridgeReadRevisions(items, cfg, _lastDiff, id => _get(base + '/rest/latest/items/' + encodeURIComponent(id) + '/versions?maxResults=1&startAt=0'));
            const d = _lastDiff, f = d.fn;
            const fnTxt = (f ? '; functions ' + f.total + ' read: ' + f.fresh.length + ' new, ' + f.changed.length + ' changed, ' + f.moved.length + ' moved, ' + f.fnChanged.length + ' top function(s) renamed, ' + f.missing.length + ' missing' : '') +
                (d.asm ? '; assumptions ' + d.asm.fresh.length + ' new, ' + d.asm.changed.length + ' changed, ' + d.asm.missing.length + ' missing' : '') +
                (d.fc ? '; failure conditions ' + d.fc.fresh.length + ' new, ' + d.fc.changed.length + ' changed, ' + d.fc.missing.length + ' missing, ' + d.fc.waiting.length + ' waiting' : '') +
                (Object.keys(d.sys || {}).length ? '; systems ' + Object.keys(d.sys).map(id => (d.sys[id].name || id) + ' ' + _pending(d, id)).join(', ') + ' change(s)' : '');
            try { if (window.SLConnections && typeof window.SLConnections.checked === 'function') window.SLConnections.checked(TOOL, bridgeChanges(), silent); } catch (_) {}   // 28 Oct 2026
            try { if (typeof window.jrnl === 'function') window.jrnl('bridge-check', 'Jama checked: ' + items.length + ' item(s). Requirements ' + d.req.fresh.length + ' new, ' + d.req.changed.length + ' changed, ' + d.req.missing.length + ' missing' + fnTxt); } catch (_) {}
            const pending = _pending(d);
            if (!silent || pending) {
                try { if (typeof showToast === 'function') showToast(pending ? 'Jama: ' + pending + ' change(s) to review below.' : 'Jama: everything in sync.', pending ? 'info' : 'success', 4200); } catch (_) {}
            }
            _setProgress('');
            _render();
            return _lastDiff;
        } catch (e) { _setProgress(''); throw e; }
        finally { _checking = false; }
    }

    // ---------------------------------------------------------- auto-poll
    let _timer = null;
    function _armPoll() {
        if (_timer) { clearInterval(_timer); _timer = null; }
        const cfg = bridgeConfig(), ty = _types(cfg);
        if (cfg.auto && cfg.baseUrl && cfg.projectId && _allTypes(ty).length && _hasCredential()) {
            _timer = setInterval(() => { bridgeCheck(true).catch(() => {}); }, 5 * 60 * 1000);
        }
    }

    // ------------------------------------------------------------- the panels
    // 22 Oct 2026 (Waqas: "every page that can interface with Jama needs it ... both at the aircraft
    // and system level"). Three pieces, one state (_lastDiff):
    //   * the full panel on Requirements exchange: every change, every page, aircraft and systems;
    //   * a panel on each page that holds something Jama can hold (aircraft Functions, FCIM, Hazard
    //     assessment, Assumptions, Requirements, and the same five in each system workspace): that
    //     page's changes, Check Jama now, Sign and apply for that page;
    //   * one connection dialog (address, project, login, item types, failure-condition fields),
    //     opened from any of them, so the form exists once and every page uses the same connection.
    const SHOW = 40;
    function _row(tag, color, name, detail) {
        return '<tr><td><span style="font-size:10px; font-weight:700; color:' + color + ';">' + tag + '</span></td><td style="font-size:11.5px;"><b>' + _esc(name) + '</b></td><td style="font-size:11px; color:var(--color-text-secondary);">' + _esc(detail) + '</td></tr>';
    }
    function _more(n) { return n > SHOW ? '<tr><td></td><td colspan="2" style="font-size:11px; color:var(--color-text-tertiary);">and ' + (n - SHOW).toLocaleString() + ' more of this kind, all included when you sign</td></tr>' : ''; }
    const _LEVEL = ['function', 'sub-function', 'sub-sub-function'];
    const _levelName = d => _LEVEL[d] || ('level ' + (d + 1) + ' function');
    function _fnPlace(x) {
        const parts = [x.top ? x.top.key : ''].concat(x.parent ? [x.parent.key] : []).filter(Boolean);
        // 27 Oct 2026: the level it lands at, so the mapping is checked at a glance
        const lv = (x.depth != null && x.depth > 0) ? _levelName(x.depth) + ' ' : '';
        return parts.length ? lv + 'under ' + parts.join(' > ') : 'top-level function';
    }
    // 27 Oct 2026: Jama's own tree order (its sequence, 1.2.10 after 1.2.9), for reading a branch top to bottom
    function _bySeq(list) {
        const segs = s => String(s || '').split('.').map(Number);
        return (list || []).slice().sort((a, b) => { const x = segs(a.item && a.item.seq), y = segs(b.item && b.item.seq); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; });
    }
    function _levelsLine(f) {
        const lv = (f && f.levels) || []; if (!lv.length) return '';
        const parts = lv.map((n, i) => n.toLocaleString() + ' ' + _levelName(i) + (n === 1 ? '' : 's'));
        const deep = (f.tooDeep || []).length;
        return '<div class="jb-levels" style="font-size:11px; color:var(--color-text-secondary); margin:2px 0 4px;">In Jama: ' + _esc(parts.join(', ')) +
            (deep ? ' (' + deep + ' below the levels this project allows, not brought in)' : '') + '.</div>';
    }
    const _HOW = { chosen: 'chosen by you', ticked: 'the item you ticked', text: 'a Jama Text item', name: 'from its Jama type name', only: 'the only kind of item there', ask: 'needs your answer' };
    const _TYPE_OPTS = [['', 'Choose what this is'], ['fn', 'Functions'], ['req', 'Requirements'], ['asm', 'Assumptions'], ['fc', 'Failure conditions'], ['skip', 'Leave out']];
    // 27 Oct 2026: each Jama item type under each ticked thing, what it comes in as, changeable
    function _typesHtml(d, onlyAsk) {
        const list = ((d && d.types) || []).filter(t => !onlyAsk || t.how === 'ask');
        if (!list.length) return '';
        const sel = 'font-size:11.5px; padding:2px 6px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
        return '<div class="jb-types" style="margin:6px 0;"><div style="font-size:11px; font-weight:700; margin-bottom:3px;">Jama item types under what you chose</div>' +
            '<table class="data-table" style="width:100%;"><tbody>' + list.map(t =>
                '<tr data-pick="' + Number(t.pickId) + '" data-type="' + Number(t.typeId) + '"' + (t.how === 'ask' ? ' class="jb-type-ask"' : '') + '>' +
                '<td style="font-size:11.5px;"><b>' + _esc(t.label) + '</b> <span style="color:var(--color-text-secondary);">under ' + _esc(t.pickKey) + ', ' + Number(t.count).toLocaleString() + ' item' + (t.count === 1 ? '' : 's') + '</span>' +
                    '<div style="font-size:10.5px; color:var(--color-text-secondary);">e.g. ' + _esc(t.examples.join('; ')) + '</div></td>' +
                '<td style="font-size:11px; color:' + (t.how === 'ask' ? 'var(--color-warning); font-weight:700' : 'var(--color-text-secondary)') + ';">' + _esc(_HOW[t.how] || '') + '</td>' +
                '<td><select class="jb-type-kind" aria-label="What ' + _esc(t.label) + ' under ' + _esc(t.pickKey) + ' is in Safety Lab" onchange="bridgeTypeKind(' + Number(t.pickId) + ', ' + Number(t.typeId) + ', this.value)" style="' + sel + '">' +
                    _TYPE_OPTS.map(([v, l]) => '<option value="' + v + '"' + ((t.kind || '') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></td></tr>').join('') +
            '</tbody></table></div>';
    }
    const KIND_TITLE = { fn: 'Functions', req: 'Requirements', asm: 'Assumptions', fc: 'Failure conditions' };
    const C_NEW = 'var(--color-success)', C_CHG = 'var(--color-warning)', C_MOV = 'var(--color-accent)', C_MIS = 'var(--color-danger)', C_DIM = 'var(--color-text-secondary)';
    const _tbl = rows => rows ? '<table class="data-table" style="width:100%;"><tbody>' + rows + '</tbody></table>' : '';
    const _cap = (list, f) => (list || []).slice(0, SHOW).map(f).join('') + _more((list || []).length);
    function _kindRows(k, x, scope, view) {
        if (!x) return '';
        const K = _K();
        if (k === 'fn' && x.fnChanged) {   // the aircraft function tree
            return _cap(x.fnChanged, y => _row('FUNCTION RENAMED', C_CHG, y.item.key + ', ' + y.item.name, y.fields.join(' and ') + ' changed; applies to ' + y.rows.length + ' row(s)')) +
                _cap(_bySeq(x.fresh), y => _row('NEW', C_NEW, y.item.key + ', ' + y.item.name, y.funcOnly ? 'top-level function, nothing under it yet' : _fnPlace(y))) +
                _cap(x.changed, y => _row('CHANGED', C_CHG, (y.row.subId || y.row.funcId) + ', ' + y.item.name, y.fields.join('; '))) +
                _cap(x.moved, y => _row('MOVED', C_MOV, (y.row.subId || '') + ', ' + y.item.name, 'now ' + _fnPlace(y))) +
                _cap(x.missing, y => _row('MISSING', C_MIS, (y.row.subId || y.row.funcId) + ', ' + (y.row.subName || y.row.funcName || ''), y.why + '. Flagged, never deleted.')) +
                _cap(x.revised, y => _row('REVISION', C_DIM, (y.key || '') + ', ' + (y.name || ''), y.from == null ? 'Jama revision ' + y.to + ' (first read)' : 'Jama revision ' + y.from + ' is now ' + y.to));
        }
        if (k === 'req') {
            return _cap(x.fresh, it => _row('NEW', C_NEW, it.key + ', ' + it.name, (it.text || '').slice(0, 90))) +
                _cap(x.changed, y => _row('CHANGED', C_CHG, y.it.key + ', ' + y.it.name, 'modified ' + y.it.modified + ' (yours: ' + (y.r.reqSource.lastChange || 'none') + ')')) +
                _cap(x.missing, r => _row('MISSING', C_MIS, r.id || r.traceId, 'in the model, absent from Jama. Flagged, never deleted.'));
        }
        if (k === 'fc') {
            const slot = s => (K && K.SLOT_NAME[s]) || s;
            const fha = w => [w.severity ? 'severity ' + w.severity : '', w.phases ? 'phases ' + w.phases : ''].filter(Boolean).join(', ');
            const what = w => view === 'fha' ? (fha(w) || 'no severity in Jama yet') + ' · ' + w.subId : slot(w.slot) + ' of ' + w.subId;
            return _cap(x.fresh, y => _row('NEW', C_NEW, y.want.fcId + ', ' + y.want.fcDesc, what(y.want))) +
                _cap(x.changed, y => _row('CHANGED', C_CHG, (y.row.fcId || '') + ', ' + y.want.fcDesc, y.fields.join('; '))) +
                _cap(x.missing, y => _row('MISSING', C_MIS, (y.row.fcId || '') + ', ' + (y.row.fcDesc || ''), y.why + '. Flagged, never deleted.')) +
                _cap(x.waiting, y => _row('WAITING', C_DIM, y.item.key + ', ' + y.item.name, 'not brought in yet: ' + y.why));
        }
        // assumptions, system functions
        const nm = r => r.asmId || r.funcId || '';
        return _cap(x.fresh, y => _row('NEW', C_NEW, y.item.key + ', ' + y.item.name, (y.item.text || '').slice(0, 90))) +
            _cap(x.changed, y => _row('CHANGED', C_CHG, nm(y.row) + ', ' + y.item.name, y.fields.join('; '))) +
            _cap(x.missing, y => _row('MISSING', C_MIS, nm(y.row), y.why + '. Flagged, never deleted.'));
    }
    function _src(d, scope) { return !d ? null : (scope === 'ac' ? d : (d.sys && d.sys[scope]) || null); }
    // the review of one scope's kinds; `view` tells the failure conditions which side to show
    function _reviewHtml(d, scope, kinds, view, titled) {
        const s = _src(d, scope); if (!s) return '';
        let html = '';
        kinds.forEach(k => {
            const body = _kindRows(k, s[k], scope, view);
            if (!body) return;
            if (titled) html += '<div style="font-size:11px; font-weight:700; margin:6px 0 3px;">' + (scope === 'ac' ? 'Aircraft ' : (s.name || scope) + ' · ') + KIND_TITLE[k].toLowerCase() + '</div>';
            if (k === 'fn' && scope === 'ac') html += _levelsLine(s.fn);
            html += _tbl(body);
            if (k === 'fc' && s.fc && (s.fc.notes || []).length) html += s.fc.notes.slice(0, 8).map(n => '<div style="font-size:11px; color:var(--color-warning);">' + _esc(n) + '</div>').join('');
        });
        return html;
    }
    function _signHtml(key, n, label) {
        return '<div style="display:flex; gap:10px; align-items:center; margin-top:8px; flex-wrap:wrap;">' +
            '<input class="jb-by" ' + (key === 'all' ? 'id="lb-by" ' : '') + 'type="text" placeholder="Signature (required)" style="font-size:12px; padding:5px 9px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary); width:200px;">' +
            '<button class="ckpt-m-btn ckpt-m-btn-primary" style="font-size:11.5px; padding:3px 12px;" onclick="bridgeApplyUi(' + (key === 'all' ? '' : '\'' + key + '\'') + ')">' + _esc(label || 'Sign and apply staged changes') + '</button>' +
            '<span class="jb-err" ' + (key === 'all' ? 'id="lb-err" ' : '') + 'style="color:var(--color-danger); font-size:11.5px; font-weight:600;"></span></div>';
    }
    function _connLine(cfg) {
        if (!cfg.baseUrl) return '<span style="color:var(--color-warning); font-weight:600;">Not connected.</span>';
        const ty = _types(cfg);
        const kinds = KINDS.filter(x => ty[x.k].length).map(x => x.label.toLowerCase());
        const np = _picks(cfg).length;
        return 'Connected to <b>' + _esc(_baseHost(cfg.baseUrl)) + '</b>, project ' + _esc(cfg.projectId || '?') + '. ' +
            (kinds.length ? 'Reading ' + _esc(kinds.join(', ')) + (np ? ' from the ' + np + ' folder' + (np === 1 ? '' : 's') + ' and item' + (np === 1 ? '' : 's') + ' chosen in Jama' : '') + '.'
                          : '<span style="color:var(--color-warning); font-weight:600;">Nothing chosen to come in yet, so nothing is read.</span>') +
            (_hasCredential() ? '' : ' <span style="color:var(--color-warning); font-weight:600;">No login saved on this computer yet.</span>');
    }
    function _checkedLine(d, n) {
        if (!d) return '';
        return '<b>' + (n ? n.toLocaleString() + ' change(s) need review' : 'In sync') + '</b> <span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">checked ' + _esc(String(d.checkedAt).slice(11, 19)) + '</span>';
    }
    const _btn = (label, js, primary) => '<button class="ckpt-m-btn' + (primary ? ' ckpt-m-btn-primary' : '') + '" style="font-size:11.5px; padding:3px 12px;" onclick="' + js + '">' + label + '</button>';

    // ---- the full panel (Requirements exchange)
    function _renderFull() {
        const host = document.getElementById('reqif-host');
        if (!host) return;
        let div = document.getElementById('bridge-panel');
        if (!div) { div = document.createElement('div'); div.id = 'bridge-panel'; host.parentNode.insertBefore(div, host.parentNode.querySelector('#statusback-panel') || host); }
        const cfg = bridgeConfig();
        const n = _pending(_lastDiff);
        let html = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:10px 14px; margin-bottom:14px;">' +
            '<div style="font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:6px;">Live bridge, Jama <span style="font-weight:400; text-transform:none;">(read-only: functions, requirements, assumptions and failure conditions come in, nothing is written to Jama)</span></div>' +
            '<div style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:8px;">The bridge watches; you decide. One connection for this project, used by every page that holds something from Jama. ' +
                ({ desktop: 'Credential: this computer\'s keychain; the desktop app makes the call.',
                   vault:   'Credential: stored server-side in your account, write-only from this page; the proxy makes the call.',
                   session: 'Credential: this tab only (browser-only install, no server to hold it); relayed through the stateless /api/bridge.' }[_door()] || '') +
                ' Never in the project file.</div>' +
            '<div style="font-size:12px; margin-bottom:8px;">' + _connLine(cfg) + '</div>' +
            '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">' +
                _btn('Connection…', 'bridgeSetupUi()') + _btn('Choose what comes in…', 'bridgeBrowseUi()') + _btn('Check Jama now', 'bridgeCheckUi()', true) + '</div>' +
            '<div id="lb-progress" class="jb-progress" style="font-size:11px; color:var(--color-text-secondary); margin-bottom:6px;">' + _esc(_progress) + '</div>';
        if (_lastDiff) {
            const d = _lastDiff;
            html += '<div style="font-size:12px; margin-bottom:6px;">' + _checkedLine(d, n) + '</div>';
            (d.warnings || []).forEach(w => { html += '<div style="font-size:11px; color:var(--color-warning); margin-bottom:4px;">' + _esc(w) + '</div>'; });
            html += _typesHtml(d, false);
            html += _reviewHtml(d, 'ac', ['fn', 'req', 'asm', 'fc'], 'fcim', true);
            Object.keys(d.sys || {}).forEach(id => { html += _reviewHtml(d, id, ['fn', 'req', 'asm', 'fc'], 'fcim', true); });
            if (n) html += _signHtml('all', n);
        }
        div.innerHTML = html + '</div>';
    }

    // ---- the panel on each page
    // scope 'ac' = aircraft; 'sys' = the open system workspace. `view` picks the failure condition side.
    const PAGES = [
        { key: 'ac-func', table: 'ac-func-table', scope: 'ac', kinds: ['fn'], title: 'aircraft functions' },
        { key: 'ac-fcim', table: 'ac-fcim-table', scope: 'ac', kinds: ['fc'], view: 'fcim', title: 'failure conditions (FCIM)', also: 'Also fills the Hazard assessment.' },
        { key: 'ac-fha',  table: 'ac-fha-table',  scope: 'ac', kinds: ['fc'], view: 'fha', title: 'failure conditions (severity, phases, effects)', also: 'Also fills the FCIM.' },
        { key: 'ac-asm',  table: 'ac-asm-table',  scope: 'ac', kinds: ['asm'], title: 'aircraft assumptions' },
        { key: 'ac-req',  table: 'ac-req-table',  scope: 'ac', kinds: ['req'], title: 'aircraft requirements' },
        { key: 'sys-func', table: 'sys-func-table', scope: 'sys', kinds: ['fn'], title: 'system functions' },
        { key: 'sys-fcim', table: 'sys-fcim-table', scope: 'sys', kinds: ['fc'], view: 'fcim', title: 'failure conditions (FCIM)', also: 'Also fills the system FHA.' },
        { key: 'sys-fha',  table: 'sys-fha-table',  scope: 'sys', kinds: ['fc'], view: 'fha', title: 'failure conditions (severity, phases, effects)', also: 'Also fills the system FCIM.' },
        { key: 'sys-asm',  table: 'sys-asm-table',  scope: 'sys', kinds: ['asm'], title: 'system assumptions' },
        { key: 'sys-req',  table: 'sys-req-table',  scope: 'sys', kinds: ['req'], title: 'system requirements' },
    ];
    const _open = {};   // which page panels show their review (UI memory)
    function _sysNow() { try { return (typeof activeSystemId !== 'undefined' && activeSystemId != null) ? String(activeSystemId) : ''; } catch (_) { return ''; } }
    function _scopeOf(p) { return p.scope === 'ac' ? 'ac' : _sysNow(); }
    function _stripHtml(p) {
        const cfg = bridgeConfig(), ty = _types(cfg);
        const scope = _scopeOf(p);
        const kindsOn = p.kinds.filter(k => ty[k].length);
        let line = '<b style="font-size:11px; letter-spacing:0.04em;">JAMA</b> ';
        if (!cfg.baseUrl) {
            return '<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">' + line +
                '<span style="font-size:12px; color:var(--color-text-secondary);">Not connected. Connect once and every page that holds something from Jama can track it.</span>' +
                _btn('Connect Jama…', 'bridgeSetupUi()') + '</div>';
        }
        if (!kindsOn.length) {
            return '<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">' + line +
                '<span style="font-size:12px; color:var(--color-text-secondary);">Nothing in Jama is chosen to come in as ' + _esc(KIND_TITLE[p.kinds[0]].toLowerCase()) + ', so this page reads nothing from Jama.</span>' +
                _btn('Choose what comes in…', 'bridgeBrowseUi()') + '</div>';
        }
        // a system page: which Jama folder or set holds this system
        let sysLine = '';
        if (p.scope === 'sys') {
            const s = _sysById(scope);
            const c = (cfg.systems || {})[scope];
            sysLine = '<div style="font-size:11.5px; margin-top:6px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">' +
                (c ? 'This system\'s items come from the Jama folder <b>' + _esc((c.key ? c.key + ', ' : '') + (c.name || c.id)) + '</b>.'
                   : '<span style="color:var(--color-warning); font-weight:600;">Choose the Jama folder or set that holds ' + _esc((s && s.name) || 'this system') + '\'s items. Until then nothing in Jama is read as this system\'s.</span>') +
                _btn(c ? 'Change…' : 'Choose…', 'bridgeSysFolderUi(\'' + p.key + '\')') +
                '<span class="jb-sys-pick"></span></div>';
            if (!c) return '<div>' + line + '<span style="font-size:12px;">' + _esc(p.title) + '</span>' + sysLine + '</div>';
        }
        const d = _lastDiff;
        const n = d ? _pending(d, scope, p.kinds) : 0;
        const loose = p.scope === 'ac' ? _unassignedSystems(cfg) : [];
        if (loose.length) sysLine = '<div style="font-size:11px; color:var(--color-warning); margin-top:4px;">' + _esc(_looseText(loose)) + '</div>';
        line += '<span style="font-size:12px;">' + _esc(p.title) + ': ' + (d ? _checkedLine(d, n) : 'not checked yet') + '</span> ';
        let html = '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">' + line +
            _btn('Check Jama now', 'bridgeCheckUi()', true) +
            (n ? _btn(_open[p.key] ? 'Hide changes' : 'Review ' + n + ' change(s)', 'bridgeStripToggle(\'' + p.key + '\')') : '') +
            _btn('Connection…', 'bridgeSetupUi()') + '</div>' +
            '<div class="jb-progress" style="font-size:11px; color:var(--color-text-secondary);">' + _esc(_progress) + '</div>' + sysLine;
        // 27 Oct 2026: the check's warnings and, while it is held, the question, on every page
        if (d && (d.warnings || []).length) html += '<div class="jb-warn">' + d.warnings.slice(0, 6).map(w => '<div style="font-size:11px; color:var(--color-warning); margin-top:3px;">' + _esc(w) + '</div>').join('') + '</div>';
        if (d && d.held) html += _typesHtml(d, true);
        else if (d && p.key === 'ac-func' && n && _open[p.key]) html += '<div style="margin-top:6px;">' + _levelsLine(d.fn) + '</div>';
        if (n && _open[p.key]) {
            html += '<div style="margin-top:6px;">' + _reviewHtml(d, scope, p.kinds, p.view, false) + '</div>' +
                (p.also ? '<div style="font-size:11px; color:var(--color-text-tertiary); margin-top:4px;">' + _esc(p.also) + '</div>' : '') +
                _signHtml(p.key, n, 'Sign and apply these ' + n + ' change(s)');
        }
        return html;
    }
    function _renderStrips() {
        PAGES.forEach(p => {
            const t = document.getElementById(p.table);
            if (!t || !t.parentNode) return;
            let el = document.querySelector('.jb-strip[data-jb="' + p.key + '"]');
            if (!el) {
                el = document.createElement('div');
                el.className = 'jb-strip'; el.setAttribute('data-jb', p.key);
                el.style.cssText = 'border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:8px 12px; margin:0 0 10px 0;';
                t.parentNode.insertBefore(el, t);
            }
            if (p.scope === 'sys' && !_sysNow()) { el.style.display = 'none'; return; }
            el.style.display = '';
            el.innerHTML = _stripHtml(p);
        });
    }
    function _renderAll() { try { _renderFull(); } catch (_) {} try { _renderStrips(); } catch (_) {} try { if (_setupOpen()) _renderSetup(); } catch (_) {} }
    const _render = _renderAll;

    // ---- the one connection dialog
    let _authPick = null;   // the sign-in method chosen in the open dialog, before it is saved
    function _authHelp(auth) {
        return auth === 'oauth'
            ? 'For a company that signs in to Jama through single sign-on. In Jama: click your name (top right), Set API Credentials, type a name, Create. Copy the Client ID and the Client Secret here; Jama shows the secret only once.'
            : 'Your Jama username and Jama password. If you sign in to Jama through your company\'s single sign-on, you have no Jama password: choose "Jama API credentials" instead.';
    }
    // The saved login arrives a moment after the dialog opens (the keychain is asked over IPC). Show
    // it without redrawing: only boxes the person has not touched are filled, nothing typed is lost.
    function _showSavedLogin() {
        if (!_setupOpen()) return;
        const login = _savedLogin(), sel = document.getElementById('lb-auth'), u = document.getElementById('lb-user');
        if (sel && !_authPick && login.has) sel.value = login.auth;
        if (u && !u.value && login.user) u.value = login.user;
        const keep = _authPick;
        window.bridgeAuthUi();
        _authPick = keep;
    }
    window.bridgeAuthUi = function () {
        const sel = document.getElementById('lb-auth'); if (!sel) return;
        _authPick = sel.value;
        const login = _savedLogin(), u = document.getElementById('lb-user'), t = document.getElementById('lb-token'), h = document.getElementById('lb-auth-help');
        if (u) u.placeholder = _authPick === 'oauth' ? 'Client ID' : 'username';
        if (t) t.placeholder = login.has && login.auth === _authPick ? 'saved, leave blank to keep' : (_authPick === 'oauth' ? 'Client Secret' : 'password');
        if (h) h.textContent = _authHelp(_authPick);
    };
    function _setupOpen() { const m = document.getElementById('jb-setup'); return !!(m && m.style.display !== 'none'); }
    let _typeFields = null;   // fields of the failure-condition item type, when read
    function _renderSetup() {
        let m = document.getElementById('jb-setup');
        if (!m) {
            m = document.createElement('div'); m.id = 'jb-setup';
            m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Jama connection');
            m.style.cssText = 'position:fixed; inset:0; z-index:9000; background:rgba(15,23,42,0.45); display:flex; align-items:flex-start; justify-content:center; overflow:auto; padding:6vh 16px;';
            m.addEventListener('click', e => { if (e.target === m) bridgeSetupClose(); });
            document.body.appendChild(m);
        }
        const cfg = bridgeConfig(), ty = _types(cfg);
        const login = _savedLogin();
        const auth = _authPick || login.auth || cfg.auth || 'basic';
        const fieldCss = 'font-size:12px; padding:5px 9px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
        const nameOf = id => { const t = (_itemTypes || []).find(x => x.id === id); return t ? t.name : (((cfg.typeNames || {})[id]) || ('type ' + id)); };
        let html = '<div style="background:var(--color-surface-1); color:var(--color-text-primary); border:1px solid var(--color-border-strong); max-width:860px; width:100%; padding:16px 18px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><b style="font-size:14px;">Jama connection for this project</b>' + _btn('Close', 'bridgeSetupClose()') + '</div>' +
            '<div style="font-size:11.5px; color:var(--color-text-secondary); margin-bottom:10px;">Set once per project; every page uses it. The address, project and choices below are saved with the project. The login stays on this computer (' +
                ({ desktop: 'its keychain', vault: 'your account\'s server-side vault', session: 'this tab only' }[_door()] || 'this computer') + '), never in the project file.</div>' +
            '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">' +
            '<input id="lb-url" type="text" placeholder="https://yourco.jamacloud.com" value="' + _esc(cfg.baseUrl || '') + '" style="' + fieldCss + ' width:230px;">' +
            '<input id="lb-pid" type="text" placeholder="project id" title="Jama project id. You can also leave it and pick the project after saving." value="' + _esc(cfg.projectId || '') + '" style="' + fieldCss + ' width:90px;">' +
            '<select id="lb-auth" onchange="bridgeAuthUi()" title="How this connection signs in to Jama" style="' + fieldCss + '">' +
                '<option value="basic"' + (auth === 'basic' ? ' selected' : '') + '>Jama username and password</option>' +
                '<option value="oauth"' + (auth === 'oauth' ? ' selected' : '') + '>Jama API credentials (single sign-on)</option></select>' +
            '<input id="lb-user" type="text" placeholder="' + (auth === 'oauth' ? 'Client ID' : 'username') + '" value="' + _esc(login.user || '') + '" autocomplete="off" spellcheck="false" style="' + fieldCss + ' width:150px;">' +
            '<input id="lb-token" type="password" placeholder="' + (login.has && login.auth === auth ? 'saved, leave blank to keep' : (auth === 'oauth' ? 'Client Secret' : 'password')) + '" value="" autocomplete="off" style="' + fieldCss + ' width:150px;">' +
            '<label style="display:inline-flex; align-items:center; gap:4px; font-size:11px;"><input id="lb-auto" type="checkbox"' + (cfg.auto ? ' checked' : '') + '> watch every 5 min (this computer)</label>' +
            _btn('Save', 'bridgeSaveUi()', true) + '</div>' +
            '<div id="lb-auth-help" style="font-size:11px; color:var(--color-text-secondary); margin:-4px 0 10px;">' + _authHelp(auth) + '</div>';
        // 26 Oct 2026: what comes in is chosen in the Jama browser (folders, sets, single items), not by item type.
        // A project that chose item types before keeps reading them until someone chooses in the browser.
        const picks = _picks(cfg);
        html += '<div class="lb-what" style="font-size:12px; margin-bottom:6px;"><b>What comes in.</b> ' +
            (picks.length ? picks.length + ' chosen in Jama: ' + _esc(picks.slice(0, 6).map(p => (p.key || p.id) + (p.name ? ' ' + p.name : '') + ' as ' + KIND_TITLE[p.kind].toLowerCase()).join('; ')) + (picks.length > 6 ? '; and ' + (picks.length - 6) + ' more' : '') + '. '
             : _allTypes(ty).length ? 'Chosen earlier by Jama item type: ' + KINDS.map(x => x.label + ': ' + (ty[x.k].length ? _esc(ty[x.k].map(nameOf).join(', ')) : 'none')).join('. ') + '. Choose folders and items in Jama instead to replace this. '
             : 'Nothing chosen yet, so nothing is read. ') +
            _btn('Choose what comes in…', 'bridgeBrowseUi()', !picks.length) + '</div>';
        // failure condition fields
        if (ty.fc.length) {
            const f = (cfg.fields && cfg.fields.fc) || {};
            const SLOTF = [['mode', 'Kind (total loss / partial loss / malfunction)', 'or Safety Lab reads the wording: "Loss of", "Partial loss of", "Erroneous"'],
                           ['severity', 'Severity', ''], ['phases', 'Flight phases', ''], ['effAc', 'Effect on the aircraft', ''], ['effCrew', 'Effect on the crew', ''], ['effPax', 'Effect on passengers', ''],
                           ['function', 'Function it belongs to', 'only when it is not filed under its function in Jama']];
            html += '<div style="font-size:12px; margin:10px 0 6px;"><b>Failure condition fields.</b> Which Jama field holds each value. ' + _btn(_typeFields ? 'Refresh fields' : 'Choose fields', 'bridgeFieldsUi()') + '</div>';
            if (_typeFields) {
                const opts = cur => '<option value="">(none)</option>' + _typeFields.map(x => '<option value="' + _esc(x.name) + '"' + (x.name === cur ? ' selected' : '') + '>' + _esc(x.label) + ' (' + _esc(x.name) + ')</option>').join('');
                html += '<table class="data-table" style="width:100%; margin-bottom:6px;"><tbody>' + SLOTF.map(([k, label, hint]) =>
                    '<tr><td style="font-size:11.5px; width:38%;">' + _esc(label) + (hint ? '<div style="font-size:10.5px; color:var(--color-text-tertiary);">' + _esc(hint) + '</div>' : '') + '</td><td><select class="lb-fc-field" data-k="' + k + '" style="' + fieldCss + ' width:100%;">' + opts(f[k] || '') + '</select></td></tr>').join('') +
                    '</tbody></table>' + _btn('Save fields', 'bridgeFieldsSaveUi()', true);
            } else {
                html += '<div style="font-size:11.5px; color:var(--color-text-secondary);">' + SLOTF.map(([k, label]) => _esc(label) + ': ' + (f[k] ? '<span class="u-mono">' + _esc(f[k]) + '</span>' : 'none')).join(' · ') + '</div>';
            }
        }
        m.innerHTML = html + '</div>';
        m.style.display = 'flex';
    }
    window.bridgeSetupUi = function (focus) {
        if (focus === 'types') return window.bridgeBrowseUi();     // the item-type chooser became the Jama browser
        _authPick = null;
        _renderSetup();
        if (_isDesktop()) _refreshDeskMeta().then(_showSavedLogin).catch(e => { try { if (window.SLErrorWatch) window.SLErrorWatch.report(e, "live_bridge: saved login"); } catch (_) {} });
    };
    window.bridgeSetupClose = function () { const m = document.getElementById('jb-setup'); if (m) m.style.display = 'none'; };
    window.bridgeStripToggle = function (key) { _open[key] = !_open[key]; _renderStrips(); };

    // ------------------------------------------------------------ UI verbs
    window.bridgeSaveUi = async function () {
        const g = id => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
        const baseUrl = g('lb-url'), user = g('lb-user'), token = g('lb-token');
        const auth = g('lb-auth') === 'oauth' ? 'oauth' : 'basic';
        const login = _savedLogin();
        const prev = bridgeConfig();
        // A blank secret box keeps the saved login, but only that login: a different sign-in method
        // or a different username / Client ID needs its own password or secret.
        if (!token && login.has && (login.auth !== auth || (user && user !== login.user))) {
            try { showToast(auth === 'oauth' ? 'Enter the Client Secret for this Client ID.' : 'Enter the password for this username.', 'error', 4200); } catch (_) {}
            return;
        }
        if (auth === 'oauth' && !user) { try { showToast('Enter the Client ID.', 'error', 3200); } catch (_) {} return; }
        // 22 Oct 2026: everything else in the connection (item types, fields, system folders) stays
        const cfg = Object.assign({}, prev, { kind: 'jama', baseUrl: baseUrl, projectId: g('lb-pid'), user: user, token: token, auto: g('lb-auto'), auth: auth });

        if (_isDesktop()) {
            if (!_hasKeychain()) {
                try { showToast('Update the desktop app to connect a tool. This version cannot store the credential safely.', 'error', 5200); } catch (_) {}
                return;
            }
            if (!_baseHost(baseUrl)) {
                try { showToast('Enter the tool\'s address first, for example https://yourcompany.jamacloud.com', 'error', 4200); } catch (_) {}
                return;
            }
            // Keep the existing credential if the token box was left blank on a re-save.
            if (token) {
                const r = await window.slabSecrets.save('jama', { user: user, token: token }, { baseHost: _baseHost(baseUrl), user: user, auth: auth });
                if (!r || !r.ok) {
                    try { showToast((r && r.error) || 'The credential could not be stored. Nothing was saved.', 'error', 6200); } catch (_) {}
                    return;                                  // fail CLOSED: no keychain, no connector
                }
            }
            bridgeConfigSave(cfg);
            _authPick = null;
            await _refreshDeskMeta();
            _armPoll();
            try { showToast('Connector saved. The credential is in this computer\'s keychain.', 'success', 3200); } catch (_) {}
            _render();
            _openBrowserAfterSave();
            return;
        }

        // Web doors (S8). The token goes to SecretStore: the vault on any backend door, this
        // tab's sessionStorage on browser-only. A blank token box on a re-save keeps the one
        // already stored. Fail CLOSED: if the store refuses, nothing is saved.
        if (!_baseHost(baseUrl)) {
            try { showToast('Enter the tool\'s address first, for example https://yourcompany.jamacloud.com', 'error', 4200); } catch (_) {}
            return;
        }
        const st = _store();
        if (!st) { try { showToast('The secret store is not available on this page. Reload and try again.', 'error', 4200); } catch (_) {} return; }
        if (token) {
            const r = await st.save('jama_token', token, { baseHost: _baseHost(baseUrl), user: user, auth: auth });
            if (!r || !r.ok) {
                try { showToast((r && r.error) || 'The credential could not be stored. Nothing was saved.', 'error', 6200); } catch (_) {}
                return;
            }
        } else if (!st.has('jama_token')) {
            try { showToast('Enter the API token.', 'error', 3200); } catch (_) {}
            return;
        }
        bridgeConfigSave(cfg);
        _armPoll();
        try {
            showToast(st.door() === 'vault'
                ? 'Connector saved. The token is stored server-side in your account; this page cannot read it back.'
                : 'Connector saved for this tab only. This is a browser-only install with no server to hold it; the token is gone when the tab closes.',
                'success', 4200);
        } catch (_) {}
        _render();
        _openBrowserAfterSave();
    };
    // 26 Oct 2026 (Waqas: "once they click everything it should give them the JAMA browser"): a saved
    // connection goes straight on to choosing what comes in. The item-type chooser that was here is gone.
    function _openBrowserAfterSave() {
        try { window.bridgeSetupClose(); } catch (_) {}
        try { const p = window.bridgeBrowseUi(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
    }
    window.bridgeFieldsUi = function () {
        const cfg = bridgeConfig(), ty = _types(cfg);
        if (!ty.fc.length) return;
        // chosen in the Jama browser: the failure conditions' own item types, as seen at the last check;
        // and if Jama will not describe those types, the field names the items themselves carry
        let typeIds = ty.fc, fromItems = [];
        if (_picks(cfg).length) {
            const its = ((_stageIn && _stageIn.items) || []).filter(n => n && n.type === KIND_V.fc);
            if (!its.length) { try { showToast('Check Jama once first, so Safety Lab has seen the failure conditions and their fields.', 'info', 4200); } catch (_) {} return; }
            typeIds = Array.from(new Set(its.map(n => n.jamaType).filter(x => x != null)));
            const seen = new Set();
            its.forEach(n => Object.keys(n.fields || {}).forEach(k => { if (!seen.has(k)) { seen.add(k); fromItems.push({ name: k, label: k, type: '', pickList: null }); } }));
        }
        Promise.all(typeIds.map(id => bridgeFetchTypeFields(id))).catch(e => { if (fromItems.length) return [fromItems]; throw e; }).then(lists => {
            const seen = new Set(); _typeFields = [];
            lists.forEach(l => l.forEach(f => { if (!seen.has(f.name)) { seen.add(f.name); _typeFields.push(f); } }));
            _typeFields.sort((a, b) => a.label.localeCompare(b.label));
            _renderSetup();
        }).catch(e => { try { showToast('Bridge: ' + e.message, 'error', 4200); } catch (_) {} });
    };
    window.bridgeFieldsSaveUi = function () {
        const root = document.getElementById('jb-setup') || document;
        const cfg = bridgeConfig();
        cfg.fields = cfg.fields || {}; cfg.fields.fc = {};
        Array.prototype.forEach.call(root.querySelectorAll('.lb-fc-field'), el => { if (el.value) cfg.fields.fc[el.getAttribute('data-k')] = el.value; });
        bridgeConfigSave(cfg); _typeFields = null; _lastDiff = null; _stageIn = null; _renderAll();
        try { showToast('Failure condition fields saved. Check Jama now to see what comes in.', 'success', 3200); } catch (_) {}
    };
    // a system workspace: which Jama folder or set holds its items
    window.bridgeSysFolderUi = function (pageKey) {
        const el = document.querySelector('.jb-strip[data-jb="' + pageKey + '"] .jb-sys-pick');
        if (!el) return;
        el.textContent = 'Reading the Jama folders...';
        bridgeFetchContainers().then(list => {
            const sysId = _sysNow(), cur = ((bridgeConfig().systems || {})[sysId] || {}).id;
            el.innerHTML = '<select class="jb-sys-sel" style="font-size:12px; padding:4px 8px; max-width:420px;"><option value="">(none: this system reads nothing from Jama)</option>' +
                list.map(c => '<option value="' + c.id + '"' + (Number(cur) === c.id ? ' selected' : '') + ' data-key="' + _esc(c.key) + '" data-name="' + _esc(c.name) + '" data-seq="' + _esc(c.seq) + '">' + _esc((c.seq ? c.seq + '  ' : '') + c.name + '  (' + c.key + ')') + '</option>').join('') +
                '</select> ' + _btn('Save', 'bridgeSysFolderSave(\'' + pageKey + '\')', true);
        }).catch(e => { el.textContent = ''; try { showToast('Bridge: ' + e.message, 'error', 4200); } catch (_) {} });
    };
    window.bridgeSysFolderSave = function (pageKey) {
        const sel = document.querySelector('.jb-strip[data-jb="' + pageKey + '"] .jb-sys-sel');
        const sysId = _sysNow(); if (!sel || !sysId) return;
        const cfg = bridgeConfig(); cfg.systems = cfg.systems || {};
        const o = sel.options[sel.selectedIndex];
        if (!sel.value) delete cfg.systems[sysId];
        else {
            // one folder, one system: a folder cannot hold two systems' items
            const other = Object.keys(cfg.systems).find(k => k !== sysId && Number(cfg.systems[k].id) === Number(sel.value));
            if (other) { try { showToast('That Jama folder already holds ' + (((_sysById(other) || {}).name) || 'another system') + '\'s items. Pick a different one, or change that system first.', 'error', 5200); } catch (_) {} return; }
            cfg.systems[sysId] = { id: Number(sel.value), key: o.getAttribute('data-key') || '', name: o.getAttribute('data-name') || '', seq: o.getAttribute('data-seq') || '' };
        }
        bridgeConfigSave(cfg); _lastDiff = null; _stageIn = null; _renderAll();
        try { showToast('Saved. Check Jama now to see this system\'s items.', 'success', 3200); } catch (_) {}
    };
    window.bridgeCheckUi = function () {
        bridgeCheck(false).catch(e => { try { showToast('Bridge: ' + e.message, 'error', 5200); } catch (_) {} });
    };
    // key: a page panel's key (signs for that page), or none (the full panel signs for everything)
    window.bridgeApplyUi = function (key) {
        if (!_lastDiff) return;
        const p = key ? PAGES.find(x => x.key === key) : null;
        const box = key ? document.querySelector('.jb-strip[data-jb="' + key + '"]') : document.getElementById('bridge-panel');
        const by = ((box && box.querySelector('.jb-by')) || { value: '' }).value.trim();
        // 28 Oct 2026: through the connections framework, so a line someone rejected, or an edit made in Jama to an item
        // Safety Lab owns, is never taken in by a page panel either (the framework keeps the record and the History)
        const _sc = p ? _scopeOf(p) : null;
        const _cx = window.SLConnections;
        const r = (_cx && typeof _cx.signLines === 'function')
            ? _cx.signLines(TOOL, bridgeChanges().filter(c => !p || (c.scope === _sc && p.kinds.indexOf(c.kind) >= 0)).map(c => c.key), by, 'Signed from the ' + (p ? p.title : 'Requirements exchange') + ' panel')
            : bridgeApply(_lastDiff, by, p ? { scope: _sc, kinds: p.kinds } : null);
        const err = box && box.querySelector('.jb-err');
        if (!r.ok) { if (err) err.textContent = r.err; return; }
        const f = r.fn;
        const bits = [];
        if (!p || p.kinds.indexOf('req') >= 0) bits.push('Requirements: +' + r.added + ' new, ' + r.updated + ' updated, ' + r.flagged + ' flagged.');
        if (f) bits.push('Functions: +' + f.added + ' new, ' + f.updated + ' updated, ' + f.moved + ' moved, ' + f.flagged + ' flagged.');
        if (r.asm) bits.push('Assumptions: +' + r.asm.added + ' new, ' + r.asm.updated + ' updated, ' + r.asm.flagged + ' flagged.');
        if (r.fc) bits.push('Failure conditions: +' + r.fc.added + ' new, ' + r.fc.updated + ' updated, ' + r.fc.flagged + ' flagged.');
        Object.keys(r.sys || {}).forEach(id => { const so = r.sys[id]; ['fn', 'req', 'asm', 'fc'].forEach(k => { if (so[k]) bits.push(((_sysById(id) || {}).name || id) + ' ' + KIND_TITLE[k].toLowerCase() + ': +' + (so[k].added || 0) + ' new, ' + (so[k].updated || 0) + ' updated, ' + (so[k].flagged || 0) + ' flagged.'); }); });
        try { showToast('Applied. ' + bits.join(' ') + (r.refused.length ? ' Not placed: ' + r.refused.join(' ') : ''), r.refused.length ? 'warning' : 'success', 6200); } catch (_) {}
        if (key) _open[key] = false;
        _renderAll();
    };

    // ------------------------------------------------------- the Jama browser
    // 26 Oct 2026 (Waqas: "once they click everything it should give them the JAMA browser and they select
    // what they want"). Standard Jama REST only: /projects, /items?project=&rootOnly=true and
    // /items/{id}/children, 50 at a time, children read only when a row is opened. Item types label
    // the rows when Jama lets us read them; nothing here depends on them.
    let _br = null;
    const KIND_OPTS = [['', 'Choose what this is'], ['fn', 'Functions'], ['req', 'Requirements'], ['asm', 'Assumptions'], ['fc', 'Failure conditions']];
    function _brNew(cfg) {
        return { projectId: String(cfg.projectId || ''), projects: null, projErr: '', types: null, typesErr: '',
                 nodes: new Map(), roots: null, rootTotal: 0, rootErr: '', rootLoading: false, msg: '',
                 picks: new Map(_picks(cfg).map(p => [Number(p.id), Object.assign({}, p, { id: Number(p.id) })])) };
    }
    function _brBase() { return String(bridgeConfig().baseUrl || '').replace(/\/+$/, ''); }
    async function _brPage(url, startAt) {
        const d = await _get(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'maxResults=' + PAGE + '&startAt=' + startAt);
        const pi = d && d.meta && d.meta.pageInfo;
        return { list: (d && d.data) || [], total: pi && pi.totalResults != null ? Number(pi.totalResults) : NaN };
    }
    async function bridgeFetchProjects() {
        const base = _brBase(); if (!base) throw new Error('Enter the Jama address first.');
        const out = [];
        for (let page = 0, startAt = 0; page < 20; page++) {
            const r = await _brPage(base + '/rest/latest/projects', startAt);
            r.list.forEach(p => { if (p && p.id != null) out.push({ id: String(p.id), key: String(p.projectKey || ''), name: String((p.fields && p.fields.name) || p.name || ('Project ' + p.id)) }); });
            if (!r.list.length || !isFinite(r.total) || startAt + r.list.length >= r.total) break;
            startAt += r.list.length;
        }
        return out;
    }
    function _brNode(b, raw, parentId) {
        const T = _T(); const n = T ? T.normalizeItem(raw) : null; if (!n) return null;
        const x = { id: n.id, key: n.key, name: n.name || n.key, type: n.type, seq: n.seq, parent: parentId, container: !!(raw && raw.childItemType != null),
                    kids: null, kidsTotal: 0, open: false, loading: false, err: '' };
        b.nodes.set(x.id, x);
        return x;
    }
    async function _brLoadRoots(more) {
        const b = _br; if (!b || !b.projectId) return;
        const start = more && b.roots ? b.roots.length : 0;
        if (!more) b.roots = null;
        b.rootLoading = true; b.rootErr = ''; _brRender();
        try {
            const r = await _brPage(_brBase() + '/rest/latest/items?project=' + encodeURIComponent(b.projectId) + '&rootOnly=true', start);
            if (_br !== b) return;
            const ids = r.list.map(it => _brNode(b, it, null)).filter(Boolean).map(x => x.id);
            b.roots = (more && b.roots ? b.roots : []).concat(ids);
            b.rootTotal = isFinite(r.total) ? r.total : b.roots.length;
        } catch (e) { b.rootErr = String((e && e.message) || e); }
        b.rootLoading = false; _brRender();
    }
    async function _brLoadKids(x, more) {
        const b = _br; if (!b) return;
        const start = more && x.kids ? x.kids.length : 0;
        x.loading = true; x.err = ''; _brRender();
        try {
            const r = await _brPage(_brBase() + '/rest/latest/items/' + encodeURIComponent(x.id) + '/children', start);
            if (_br !== b) return;
            const ids = r.list.map(it => _brNode(b, it, x.id)).filter(Boolean).map(k => k.id);
            x.kids = (more && x.kids ? x.kids : []).concat(ids);
            x.kidsTotal = isFinite(r.total) ? r.total : x.kids.length;
        } catch (e) { x.err = String((e && e.message) || e); }
        x.loading = false; _brRender();
    }
    // a first guess at what a ticked thing is, from its Jama type name, else its own name; always shown, always changeable
    function _guessKind(b, x) {
        const t = (b.types && x.type != null && b.types.get(x.type)) || '';
        for (const s of [t, x.name || '']) { const k = _kindFromText(s); if (k) return k; }
        return '';
    }
    function _coveredBy(b, x) {
        let p = x.parent, g = 0;
        while (p != null && g++ < 200) { if (b.picks.has(p)) return b.picks.get(p); const n = b.nodes.get(p); p = n ? n.parent : null; }
        return null;
    }
    function _brRows(b, ids, depth) {
        return ids.map(id => {
            const x = b.nodes.get(id); if (!x) return '';
            const cov = _coveredBy(b, x), picked = b.picks.has(x.id);
            const tn = (b.types && x.type != null && b.types.get(x.type)) || (x.container ? 'Folder or set' : '');
            let r = '<div class="jb-br-row" data-id="' + x.id + '" style="display:flex; gap:6px; align-items:center; font-size:12px; padding:2px 0 2px ' + (depth * 18) + 'px;">' +
                '<button type="button" class="jb-br-exp" aria-expanded="' + (x.open ? 'true' : 'false') + '" aria-label="' + (x.open ? 'Close ' : 'Open ') + _esc(x.key) + '" onclick="bridgeBrowseToggle(' + x.id + ')" style="border:0; background:none; color:var(--color-text-secondary); cursor:pointer; width:16px; padding:0;">' + (x.open ? '&#9662;' : '&#9656;') + '</button>' +
                '<input type="checkbox" class="jb-br-pick" value="' + x.id + '"' + (picked ? ' checked' : '') + (cov ? ' disabled title="Comes in with ' + _esc(cov.key || cov.id) + '"' : '') + ' onchange="bridgeBrowsePick(' + x.id + ', this.checked)" aria-label="Bring in ' + _esc(x.key) + '">' +
                '<span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">' + _esc(x.key) + '</span> <span>' + _esc(x.name) + '</span>' +
                (tn ? ' <span class="jb-br-type" style="font-size:10.5px; color:var(--color-text-tertiary);">' + _esc(tn) + '</span>' : '') +
                (cov ? ' <span style="font-size:10.5px; color:var(--color-text-secondary);">comes in with ' + _esc(cov.key || cov.id) + '</span>' : '') + '</div>';
            if (x.open) {
                const pad = 'font-size:11px; color:var(--color-text-secondary); padding-left:' + ((depth + 1) * 18 + 22) + 'px;';
                if (x.kids) r += _brRows(b, x.kids, depth + 1);
                if (x.loading) r += '<div style="' + pad + '">Reading...</div>';
                else if (x.err) r += '<div class="jb-br-err" style="' + pad + ' color:var(--color-danger);">' + _esc(x.err) + '</div>';
                else if (x.kids && !x.kids.length) r += '<div style="' + pad + '">Nothing under it.</div>';
                else if (x.kids && x.kids.length < x.kidsTotal) r += '<div style="' + pad + '">' + _btn('Show more (' + x.kids.length + ' of ' + x.kidsTotal + ')', 'bridgeBrowseMore(' + x.id + ')') + '</div>';
            }
            return r;
        }).join('');
    }
    function _brHtml(b) {
        const fieldCss = 'font-size:12px; padding:4px 8px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
        let h = '<div style="background:var(--color-surface-1); color:var(--color-text-primary); border:1px solid var(--color-border-strong); max-width:900px; width:100%; padding:16px 18px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><b style="font-size:14px;">Choose what comes in from Jama</b>' + _btn('Close', 'bridgeBrowseClose()') + '</div>' +
            '<div style="font-size:11.5px; color:var(--color-text-secondary); margin-bottom:10px;">Browse the project the way Jama shows it. Tick a folder or set to bring in everything under it, now and at every later check, or tick single items. Say what each one is in Safety Lab, then press Bring in. Nothing changes in your project until someone signs the review, and nothing is ever written to Jama.</div>';
        // the project
        h += '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:12px; margin-bottom:8px;"><b>Project</b> ';
        if (b.projects && b.projects.length) {
            const known = b.projects.some(p => p.id === b.projectId);
            h += '<select id="jb-br-proj" onchange="bridgeBrowseProject(this.value)" style="' + fieldCss + ' max-width:420px;">' +
                (known ? '' : '<option value=""' + (b.projectId ? '' : ' selected') + '>Choose a project</option>') +
                b.projects.map(p => '<option value="' + _esc(p.id) + '"' + (p.id === b.projectId ? ' selected' : '') + '>' + _esc(p.name + (p.key ? ' (' + p.key + ')' : '') + ', id ' + p.id) + '</option>').join('') + '</select>';
            if (b.projectId && !known) h += '<span class="jb-br-note" style="color:var(--color-warning);">Project ' + _esc(b.projectId) + ' from the connection is not among the projects this login can see in Jama.</span>';
        } else if (b.projErr) {
            h += '<span class="jb-br-err" style="color:var(--color-danger);">The project list could not be read. ' + _esc(b.projErr) + '</span>' +
                (b.projectId ? ' <span>Showing project ' + _esc(b.projectId) + ' from the connection.</span>' : '');
        } else if (b.projects) {
            h += '<span>This login sees no projects in Jama.</span>';
        } else {
            h += '<span style="color:var(--color-text-secondary);">Reading the projects...</span>';
        }
        h += '</div>';
        if (b.typesErr) h += '<div class="jb-br-note" style="font-size:11px; color:var(--color-text-secondary); margin-bottom:6px;">Jama did not list its item types, so rows show without their type names. Everything else works. (' + _esc(b.typesErr) + ')</div>';
        // the tree
        h += '<div class="jb-br-tree" style="max-height:340px; overflow:auto; border:1px solid var(--color-border-hair); padding:6px 10px; margin-bottom:8px;">';
        if (!b.projectId) h += '<div style="font-size:12px; color:var(--color-text-secondary);">Choose a project to see its folders and items.</div>';
        else if (b.rootErr) h += '<div class="jb-br-err" style="font-size:12px; color:var(--color-danger);">' + _esc(b.rootErr) + '</div>';
        else if (!b.roots) h += '<div style="font-size:12px; color:var(--color-text-secondary);">Reading the project...</div>';
        else if (!b.roots.length) h += '<div style="font-size:12px; color:var(--color-text-secondary);">This project has nothing in it that this login can see.</div>';
        else {
            h += _brRows(b, b.roots, 0);
            if (b.roots.length < b.rootTotal) h += '<div style="padding:4px 0;">' + (b.rootLoading ? '<span style="font-size:11px;">Reading...</span>' : _btn('Show more (' + b.roots.length + ' of ' + b.rootTotal + ')', 'bridgeBrowseMore()')) + '</div>';
        }
        h += '</div>';
        // what comes in
        const picks = Array.from(b.picks.values());
        h += '<div style="font-size:12px; font-weight:700; margin:8px 0 4px;">What comes in (' + picks.length + ')</div>';
        if (!picks.length) h += '<div style="font-size:11.5px; color:var(--color-text-secondary);">Nothing ticked yet.</div>';
        else h += '<table class="data-table jb-br-chosen" style="width:100%;"><tbody>' + picks.map(p =>
            '<tr data-id="' + p.id + '"><td style="font-size:11.5px;"><span class="u-mono" style="font-size:10.5px;">' + _esc(p.key || p.id) + '</span> ' + _esc(p.name || '') + '</td>' +
            '<td style="font-size:11px; color:var(--color-text-secondary);">' + (p.container ? 'everything in it' : 'this item and anything under it') + '</td>' +
            '<td><select class="jb-br-kind" aria-label="What ' + _esc(p.key || p.id) + ' is in Safety Lab" onchange="bridgeBrowseKind(' + p.id + ', this.value)" style="' + fieldCss + '">' +
                KIND_OPTS.map(([v, l]) => '<option value="' + v + '"' + ((p.kind || '') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></td>' +
            '<td>' + _btn('Remove', 'bridgeBrowsePick(' + p.id + ', false)') + '</td></tr>').join('') + '</tbody></table>';
        h += '<div style="display:flex; gap:10px; align-items:center; margin-top:10px; flex-wrap:wrap;">' + _btn('Bring in', 'bridgeBrowseBring()', true) + _btn('Cancel', 'bridgeBrowseClose()') +
            '<span class="jb-br-msg" style="font-size:11.5px; color:var(--color-danger); font-weight:600;">' + _esc(b.msg) + '</span></div>';
        return h + '</div>';
    }
    function _brRender() {
        const b = _br; if (!b) return;
        try {
            let m = document.getElementById('jb-browse');
            if (!m) {
                if (!document.body || typeof document.createElement !== 'function') return;
                m = document.createElement('div'); m.id = 'jb-browse';
                m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Choose what comes in from Jama');
                m.style.cssText = 'position:fixed; inset:0; z-index:9001; background:rgba(15,23,42,0.45); display:flex; align-items:flex-start; justify-content:center; overflow:auto; padding:6vh 16px;';
                m.addEventListener('click', e => { if (e.target === m) window.bridgeBrowseClose(); });
                document.body.appendChild(m);
            }
            m.innerHTML = _brHtml(b);
            m.style.display = 'flex';
        } catch (_) {}
    }
    window.bridgeBrowseUi = function () {
        const cfg = bridgeConfig();
        if (!cfg.baseUrl) { try { showToast('Enter the Jama address and save the connection first.', 'error', 4200); } catch (_) {} return Promise.resolve(); }
        const b = _br = _brNew(cfg);
        _brRender();
        // one after the other, so the first request signs in once and the rest reuse it
        return bridgeFetchProjects().then(l => { if (_br !== b) return; b.projects = l; if (!b.projectId && l.length === 1) b.projectId = l[0].id; })
            .catch(e => { if (_br === b) b.projErr = String((e && e.message) || e); })
            .then(() => bridgeFetchItemTypes()).then(l => { if (_br === b) { _itemTypes = l; _itemTypesRefused = false; b.types = new Map(l.map(t => [t.id, t.name])); } })
            .catch(e => { _itemTypesRefused = true; if (_br === b) b.typesErr = String((e && e.message) || e); })
            .then(() => { if (_br !== b) return; _brRender(); if (b.projectId) return _brLoadRoots(false); });
    };
    window.bridgeBrowseClose = function () { _br = null; const m = document.getElementById('jb-browse'); if (m) m.style.display = 'none'; };
    window.bridgeBrowseProject = function (pid) {
        const b = _br; if (!b) return Promise.resolve();
        // what is ticked belongs to one project; another project starts empty
        b.projectId = String(pid || ''); b.nodes = new Map(); b.picks = new Map(); b.roots = null; b.rootErr = ''; b.msg = '';
        if (!b.projectId) { _brRender(); return Promise.resolve(); }
        return _brLoadRoots(false);
    };
    window.bridgeBrowseToggle = function (id) {
        const b = _br, x = b && b.nodes.get(Number(id)); if (!x) return Promise.resolve();
        x.open = !x.open;
        if (x.open && x.kids == null && !x.loading) return _brLoadKids(x, false);
        _brRender(); return Promise.resolve();
    };
    window.bridgeBrowseMore = function (id) {
        const b = _br; if (!b) return Promise.resolve();
        if (id == null) return _brLoadRoots(true);
        const x = b.nodes.get(Number(id)); return x ? _brLoadKids(x, true) : Promise.resolve();
    };
    window.bridgeBrowsePick = function (id, on) {
        const b = _br; if (!b) return;
        id = Number(id);
        if (on) {
            const x = b.nodes.get(id); if (!x) return;
            const was = b.picks.get(id);
            b.picks.set(id, Object.assign({ id: id, key: x.key, name: x.name, seq: x.seq, container: x.container, kind: (was && was.kind) || _guessKind(b, x) }, was && was.types ? { types: was.types } : {}));
        } else b.picks.delete(id);
        b.msg = ''; _brRender();
    };
    window.bridgeBrowseKind = function (id, kind) {
        const b = _br, p = b && b.picks.get(Number(id)); if (!p) return;
        p.kind = KIND_V[kind] != null ? kind : ''; b.msg = ''; _brRender();
    };
    // what is ticked becomes the project's choice, and the usual check runs: review, then a signed apply
    window.bridgeBrowseBring = function () {
        const b = _br; if (!b) return Promise.resolve(null);
        const picks = Array.from(b.picks.values());
        let msg = '';
        if (!b.projectId) msg = 'Choose a project first.';
        else if (!picks.length) msg = 'Tick at least one folder, set or item first.';
        else {
            const unset = picks.filter(p => KIND_V[p.kind] == null);
            if (unset.length) msg = 'Say what ' + (unset.length === 1 ? 'this is' : 'these are') + ' in Safety Lab first: ' + unset.slice(0, 4).map(p => p.key || p.id).join(', ') + (unset.length > 4 ? ' and ' + (unset.length - 4) + ' more' : '') + '.';
        }
        if (msg) { b.msg = msg; _brRender(); return Promise.resolve(null); }
        const cfg = bridgeConfig();
        if (cfg.projectId && String(cfg.projectId) !== b.projectId) cfg.systems = {};   // the system folders were in the other project
        cfg.projectId = b.projectId;
        cfg.picks = picks.map(p => Object.assign({ id: p.id, key: p.key || '', name: p.name || '', seq: p.seq || '', kind: p.kind, container: !!p.container },
                                                 p.types && typeof p.types === 'object' && Object.keys(p.types).length ? { types: p.types } : {}));
        bridgeConfigSave(cfg);
        _lastDiff = null; _stageIn = null; _typeFields = null;
        _armPoll();
        window.bridgeBrowseClose();
        _renderAll();
        return bridgeCheck(false).catch(e => { try { showToast('Bridge: ' + e.message, 'error', 6200); } catch (_) {} return null; });
    };

    // 27 Oct 2026: what one Jama item type under one ticked thing is; kept with that pick, then checked again
    window.bridgeTypeKind = function (pickId, typeId, kind) {
        const cfg = bridgeConfig();
        const p = (Array.isArray(cfg.picks) ? cfg.picks : []).find(x => x && Number(x.id) === Number(pickId));
        if (!p || !isFinite(Number(typeId))) return Promise.resolve(null);
        const k = (kind === 'skip' || KIND_V[kind] != null) ? kind : '';
        p.types = Object.assign({}, p.types || {});
        if (k) p.types[String(Number(typeId))] = k; else delete p.types[String(Number(typeId))];
        bridgeConfigSave(cfg);
        _lastDiff = null; _stageIn = null;
        return bridgeCheck(false).catch(e => { try { showToast('Bridge: ' + e.message, 'error', 6200); } catch (_) {} return null; });
    };

    // ------------------------------------------------------------- the wraps
    (function wrap() {
        if (typeof window.renderReqifPage === 'function' && !window.renderReqifPage._lbWrapped) {
            const orig = window.renderReqifPage;
            const wrapped = function () {
                const r = orig.apply(this, arguments);
                try { _renderFull(); } catch (_) {}
                return r;
            };
            wrapped._lbWrapped = true;
            window.renderReqifPage = wrapped;
        }
        // every page and system tab change: draw that page's panel (cheap: a few elements)
        ['switchTab', 'switchWorkspaceTab'].forEach(name => {
            const orig = window[name];
            if (typeof orig !== 'function' || orig._jbWrapped) return;
            const w = function () { const r = orig.apply(this, arguments); try { setTimeout(_renderStrips, 0); } catch (_) {} return r; };
            w._jbWrapped = true;
            window[name] = w;
        });
    })();
    try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(_renderStrips, 300)); else setTimeout(_renderStrips, 300); } catch (_) {}
    _armPoll();

    // ------------------------------------------------------------- exports
    window.bridgeConfig = bridgeConfig;
    window.bridgeChanges = bridgeChanges;          // 28 Oct 2026: the connections framework
    window.bridgeApplyKeys = bridgeApplyKeys;
    window.bridgeOutgoing = bridgeOutgoing;
    window.bridgeSend = bridgeSend;
    window._bridgeWriteProblem = _writeProblem;
    try {
        if (window.SLConnections && typeof window.SLConnections.register === 'function') window.SLConnections.register(TOOL, {
            label: 'Jama Connect',
            configured: () => { const c = bridgeConfig(); return !!(c && c.baseUrl && c.projectId); },
            where: () => { const c = bridgeConfig(); let h = ''; try { h = new URL(String(c.baseUrl)).host; } catch (_) { h = String(c.baseUrl || ''); } return h + (c.projectId ? ' · project ' + c.projectId : ''); },
            checkedAt: () => (_lastDiff && _lastDiff.checkedAt) || '',
            held: () => !!(_lastDiff && _lastDiff.held),
            warnings: () => ((_lastDiff && _lastDiff.warnings) || []).slice(),
            changes: bridgeChanges,
            check: silent => bridgeCheck(!!silent),
            autoCheck: () => _watch() && _hasCredential(),
            applyKeys: bridgeApplyKeys,
            setup: () => { try { window.bridgeSetupUi(); } catch (_) {} },
            browse: () => { try { window.bridgeBrowseUi(); } catch (_) {} },
            linkedRows: _connLinkedRows,
            outgoing: bridgeOutgoing,
            send: bridgeSend,
            sendSettingsHtml: bridgeSendSettingsHtml
        });
    } catch (_) {}
    window.bridgeConfigSave = bridgeConfigSave;
    window.bridgeFetchItems = bridgeFetchItems;
    window.bridgeFetchItemTypes = bridgeFetchItemTypes;
    window.bridgeDiff = bridgeDiff;
    window.bridgeStage = bridgeStage;
    window.bridgeApply = bridgeApply;
    window.bridgeCheck = bridgeCheck;
    window.bridgeReadRevisions = bridgeReadRevisions;
    window._bridgeGet = _get;
    window.bridgeFetchContainers = bridgeFetchContainers;
    window.bridgeFetchTypeFields = bridgeFetchTypeFields;
    window.bridgeFetchProjects = bridgeFetchProjects;
    window._bridgeBrowserHtml = () => (_br ? _brHtml(_br) : '');
    window._bridgeLastDiff = () => _lastDiff;
    window._bridgePending = _pending;
    window._bridgeRender = _renderAll;
})();

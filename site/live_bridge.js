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
    function _types(cfg) {
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
        const auth = 'Basic ' + btoa((meta.user || '') + ':' + token);
        const res = await fetch('/api/bridge?target=' + encodeURIComponent(targetUrl), {
            headers: { 'Authorization': auth, 'Accept': 'application/json' }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' from bridge');
        return res.json();
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
        const ty = _types(cfg);
        const all = _allTypes(ty);
        if (!all.length) throw new Error('Choose which Jama item types are functions, requirements, assumptions or failure conditions first (Connection and item types). Nothing is read until you do.');
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
        const types = (_itemTypes && _itemTypes.length ? _itemTypes : (_itemTypes = await bridgeFetchItemTypes())).filter(_isContainerType);
        if (!types.length) throw new Error('This Jama project has no Folder or Set item type to choose from.');
        const base = String(cfg.baseUrl).replace(/\/+$/, '');
        const typeQ = types.map(t => '&itemType=' + encodeURIComponent(t.id)).join('');
        const out = [];
        for (let page = 0, startAt = 0; page < MAX_PAGES; page++) {
            const data = await _get(base + '/rest/latest/abstractitems?project=' + encodeURIComponent(cfg.projectId) + typeQ + '&maxResults=' + PAGE + '&startAt=' + startAt);
            const items = (data && data.data) || [];
            items.forEach(it => { const n = T.normalizeItem(it); if (n) out.push({ id: n.id, key: n.key, name: n.name, seq: n.seq }); });
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
        const ty = _types(cfg);
        const warnings = [];
        const cache = new Map();
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
        if (items && items._truncated) warnings.push('Read the first ' + (MAX_PAGES * PAGE).toLocaleString() + ' items only (Jama reports ' + Number(items._total || 0).toLocaleString() + '). Narrow the item types or ask Safety Lab to raise the limit.');
        _stageIn = { items: items || [], cfg: cfg, parents, fcParents, containers, warnings };
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
        const cfg = inp.cfg, ty = _types(cfg), items = inp.items;
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
        return d;
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
        if (diff === _lastDiff && _stageIn) { try { _lastDiff = _compute(_stageIn); } catch (_) { _lastDiff = null; } }
        return out;
    }

    // --------------------------------------------------------------- check
    let _lastDiff = null, _checking = false, _itemTypes = null;
    async function bridgeCheck(silent) {
        if (_checking) return _lastDiff;
        _checking = true;
        try {
            const cfg = bridgeConfig();
            _setProgress('Reading Jama...');
            const items = await bridgeFetchItems();
            const base = String(cfg.baseUrl).replace(/\/+$/, '');
            _setProgress('Building the function tree...');
            _lastDiff = await bridgeStage(items, cfg, id => _get(base + '/rest/latest/items/' + encodeURIComponent(id)));
            if (_lastDiff.fn && _wantsRevisions()) await bridgeReadRevisions(items, cfg, _lastDiff, id => _get(base + '/rest/latest/items/' + encodeURIComponent(id) + '/versions?maxResults=1&startAt=0'));
            const d = _lastDiff, f = d.fn;
            const fnTxt = (f ? '; functions ' + f.total + ' read: ' + f.fresh.length + ' new, ' + f.changed.length + ' changed, ' + f.moved.length + ' moved, ' + f.fnChanged.length + ' top function(s) renamed, ' + f.missing.length + ' missing' : '') +
                (d.asm ? '; assumptions ' + d.asm.fresh.length + ' new, ' + d.asm.changed.length + ' changed, ' + d.asm.missing.length + ' missing' : '') +
                (d.fc ? '; failure conditions ' + d.fc.fresh.length + ' new, ' + d.fc.changed.length + ' changed, ' + d.fc.missing.length + ' missing, ' + d.fc.waiting.length + ' waiting' : '') +
                (Object.keys(d.sys || {}).length ? '; systems ' + Object.keys(d.sys).map(id => (d.sys[id].name || id) + ' ' + _pending(d, id)).join(', ') + ' change(s)' : '');
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
        if (cfg.auto && cfg.baseUrl && cfg.projectId && (ty.fn.length || ty.req.length) && _hasCredential()) {
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
    function _fnPlace(x) {
        const parts = [x.top ? x.top.key : ''].concat(x.parent ? [x.parent.key] : []).filter(Boolean);
        return parts.length ? 'under ' + parts.join(' > ') : 'top-level function';
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
                _cap(x.fresh, y => _row('NEW', C_NEW, y.item.key + ', ' + y.item.name, y.funcOnly ? 'top-level function, nothing under it yet' : _fnPlace(y))) +
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
        return 'Connected to <b>' + _esc(_baseHost(cfg.baseUrl)) + '</b>, project ' + _esc(cfg.projectId || '?') + '. ' +
            (kinds.length ? 'Reading ' + _esc(kinds.join(', ')) + '.' : '<span style="color:var(--color-warning); font-weight:600;">Item types not chosen yet, so nothing is read.</span>') +
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
                _btn('Connection and item types…', 'bridgeSetupUi()') + _btn('Check Jama now', 'bridgeCheckUi()', true) + '</div>' +
            '<div id="lb-progress" class="jb-progress" style="font-size:11px; color:var(--color-text-secondary); margin-bottom:6px;">' + _esc(_progress) + '</div>';
        if (_lastDiff) {
            const d = _lastDiff;
            html += '<div style="font-size:12px; margin-bottom:6px;">' + _checkedLine(d, n) + '</div>';
            (d.warnings || []).forEach(w => { html += '<div style="font-size:11px; color:var(--color-warning); margin-bottom:4px;">' + _esc(w) + '</div>'; });
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
                '<span style="font-size:12px; color:var(--color-text-secondary);">No Jama item type is chosen as ' + _esc(KIND_TITLE[p.kinds[0]].toLowerCase()) + ', so this page reads nothing from Jama.</span>' +
                _btn('Choose item types…', 'bridgeSetupUi(\'types\')') + '</div>';
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
        const fieldCss = 'font-size:12px; padding:5px 9px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
        const nameOf = id => { const t = (_itemTypes || []).find(x => x.id === id); return t ? t.name : (((cfg.typeNames || {})[id]) || ('type ' + id)); };
        let html = '<div style="background:var(--color-surface-1); color:var(--color-text-primary); border:1px solid var(--color-border-strong); max-width:860px; width:100%; padding:16px 18px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><b style="font-size:14px;">Jama connection for this project</b>' + _btn('Close', 'bridgeSetupClose()') + '</div>' +
            '<div style="font-size:11.5px; color:var(--color-text-secondary); margin-bottom:10px;">Set once per project; every page uses it. The address, project and choices below are saved with the project. The login stays on this computer (' +
                ({ desktop: 'its keychain', vault: 'your account\'s server-side vault', session: 'this tab only' }[_door()] || 'this computer') + '), never in the project file.</div>' +
            '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">' +
            '<input id="lb-url" type="text" placeholder="https://yourco.jamacloud.com" value="' + _esc(cfg.baseUrl || '') + '" style="' + fieldCss + ' width:230px;">' +
            '<input id="lb-pid" type="text" placeholder="project id" value="' + _esc(cfg.projectId || '') + '" style="' + fieldCss + ' width:90px;">' +
            '<input id="lb-user" type="text" placeholder="username" value="' + _esc((_store() && (_store().meta('jama_token') || {}).user) || cfg.user || '') + '" style="' + fieldCss + ' width:120px;">' +
            '<input id="lb-token" type="password" placeholder="' + ((_store() && _store().has('jama_token')) || (_isDesktop() && _hasCredential() && cfg.baseUrl) ? 'saved, leave blank to keep' : 'API token or password') + '" value="" style="' + fieldCss + ' width:150px;">' +
            '<label style="display:inline-flex; align-items:center; gap:4px; font-size:11px;"><input id="lb-auto" type="checkbox"' + (cfg.auto ? ' checked' : '') + '> watch every 5 min (this computer)</label>' +
            _btn('Save', 'bridgeSaveUi()', true) + '</div>';
        // item types
        html += '<div style="font-size:12px; margin-bottom:6px;"><b>Item types.</b> ' +
            KINDS.map(x => x.label + ': ' + (ty[x.k].length ? _esc(ty[x.k].map(nameOf).join(', ')) : 'none')).join('. ') + '. ' +
            _btn(_itemTypes ? 'Refresh item types' : 'Choose item types', 'bridgeTypesUi()') + '</div>';
        if (_itemTypes) {
            html += '<div style="max-height:260px; overflow:auto; border:1px solid var(--color-border-hair); padding:6px 10px; margin-bottom:8px;"><table class="data-table" style="width:100%;"><thead><tr><th style="font-size:11px;">Jama item type</th>' +
                KINDS.map(x => '<th style="font-size:11px;">' + x.label + '</th>').join('') + '</tr></thead><tbody>' +
                _itemTypes.map(t => '<tr><td style="font-size:11.5px;">' + _esc(t.name) + (t.key ? ' <span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + _esc(t.key) + '</span>' : '') + '</td>' +
                    KINDS.map(x => '<td><input type="checkbox" class="' + x.cls + '" value="' + t.id + '"' + (ty[x.k].includes(t.id) ? ' checked' : '') + '></td>').join('') + '</tr>').join('') +
                '</tbody></table><div style="margin-top:6px;">' + _btn('Save item types', 'bridgeTypesSaveUi()', true) + ' <span style="font-size:11px; color:var(--color-text-tertiary);">Folders and sets do not need ticking: the bridge looks through them to find which function sits under which, and each system workspace picks its own folder.</span></div></div>';
        }
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
        _renderSetup();
        if (focus === 'types' && !_itemTypes) { try { window.bridgeTypesUi(); } catch (_) {} }
    };
    window.bridgeSetupClose = function () { const m = document.getElementById('jb-setup'); if (m) m.style.display = 'none'; };
    window.bridgeStripToggle = function (key) { _open[key] = !_open[key]; _renderStrips(); };

    // ------------------------------------------------------------ UI verbs
    window.bridgeSaveUi = async function () {
        const g = id => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
        const baseUrl = g('lb-url'), user = g('lb-user'), token = g('lb-token');
        const prev = bridgeConfig();
        // 22 Oct 2026: everything else in the connection (item types, fields, system folders) stays
        const cfg = Object.assign({}, prev, { kind: 'jama', baseUrl: baseUrl, projectId: g('lb-pid'), user: user, token: token, auto: g('lb-auto') });

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
                const r = await window.slabSecrets.save('jama', { user: user, token: token }, { baseHost: _baseHost(baseUrl), user: user });
                if (!r || !r.ok) {
                    try { showToast((r && r.error) || 'The credential could not be stored. Nothing was saved.', 'error', 6200); } catch (_) {}
                    return;                                  // fail CLOSED: no keychain, no connector
                }
            }
            bridgeConfigSave(cfg);
            _armPoll();
            try { showToast('Connector saved. The credential is in this computer\'s keychain.', 'success', 3200); } catch (_) {}
            _render();
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
            const r = await st.save('jama_token', token, { baseHost: _baseHost(baseUrl), user: user });
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
    };
    window.bridgeTypesUi = function () {
        bridgeFetchItemTypes().then(list => { _itemTypes = list; _renderSetup(); })
            .catch(e => { try { showToast('Bridge: ' + e.message, 'error', 4200); } catch (_) {} });
    };
    window.bridgeTypesSaveUi = function () {
        const root = document.getElementById('jb-setup') || document;
        const pick = cls => Array.prototype.map.call(root.querySelectorAll('.' + cls + ':checked'), el => Number(el.value));
        const chosen = {}; KINDS.forEach(x => { chosen[x.k] = pick(x.cls); });
        const all = [].concat(...KINDS.map(x => chosen[x.k]));
        const twice = all.filter((v, i) => all.indexOf(v) !== i);
        if (twice.length) { try { showToast('A Jama item type can be one kind of thing only (functions, requirements, assumptions or failure conditions). Untick the extra one.', 'error', 5200); } catch (_) {} return; }
        const cfg = bridgeConfig();
        KINDS.forEach(x => { cfg[x.cfg] = chosen[x.k]; });
        // keep the names, so every panel says "Function", not "type 89001"
        cfg.typeNames = {}; (_itemTypes || []).forEach(t => { if (all.indexOf(t.id) >= 0) cfg.typeNames[t.id] = t.name; });
        bridgeConfigSave(cfg); _itemTypes = null; _typeFields = null; _lastDiff = null; _stageIn = null; _armPoll(); _renderAll();
        try { showToast('Item types saved. Check Jama now to see what comes in.', 'success', 3200); } catch (_) {}
    };
    window.bridgeFieldsUi = function () {
        const ty = _types(bridgeConfig());
        if (!ty.fc.length) return;
        Promise.all(ty.fc.map(id => bridgeFetchTypeFields(id))).then(lists => {
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
        const r = bridgeApply(_lastDiff, by, p ? { scope: _scopeOf(p), kinds: p.kinds } : null);
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
    window._bridgeLastDiff = () => _lastDiff;
    window._bridgePending = _pending;
    window._bridgeRender = _renderAll;
})();

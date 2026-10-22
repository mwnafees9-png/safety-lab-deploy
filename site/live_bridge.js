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
    function bridgeConfig() {
        try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null') || {}; } catch (_) { return {}; }
    }
    // Only the NON-SECRET part is written here: address, project, item-type choices, watch
    // setting. The credential goes to the keychain (desktop) or SecretStore (web), never here.
    function bridgeConfigSave(c) {
        const o = Object.assign({}, c || {});
        delete o.user; delete o.token;
        try { localStorage.setItem(CFG_KEY, JSON.stringify(o)); } catch (_) {}
    }
    function _types(cfg) {
        const n = a => (Array.isArray(a) ? a : []).map(Number).filter(x => isFinite(x));
        return { fn: n(cfg && cfg.fnTypes), req: n(cfg && cfg.reqTypes) };
    }
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
    function _setProgress(t) { _progress = t || ''; try { const el = document.getElementById('lb-progress'); if (el) el.textContent = _progress; } catch (_) {} }

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
        const all = Array.from(new Set(ty.fn.concat(ty.req)));
        if (!all.length) throw new Error('Choose which Jama item types are functions and which are requirements first (Item types, below). Nothing is read until you do.');
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

    // ------------------------------------------------------- requirements diff
    // Pure. Remote requirement items vs the requirements' reqSource fingerprints. Identity is
    // Jama's item id (reqSource.remoteId); rows written by v1 without one match on the key.
    function _allReqs() {
        const out = [];
        (((typeof acReqData !== 'undefined' ? acReqData : []) || [])).forEach(r => out.push(r));
        (((typeof systemsData !== 'undefined' ? systemsData : []) || [])).forEach(s => (s.req || []).forEach(r => out.push(r)));
        return out;
    }
    function bridgeDiff(remoteItems) {
        const reqs = _allReqs();
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
    // Pure apart from the fetcher it is given. Splits items by type, builds the function tree
    // (looking through folders with fetchItem), and stages both reviews.
    async function bridgeStage(items, cfg, fetchItem) {
        const T = _T();
        const ty = _types(cfg);
        const fnSet = new Set(ty.fn), reqSet = new Set(ty.req);
        const reqItems = (items || []).filter(n => n && reqSet.has(n.type) && !fnSet.has(n.type));
        const req = bridgeDiff(reqItems);
        let fn = null, warnings = [];
        if (ty.fn.length && T) {
            const fnItems = (items || []).filter(n => n && fnSet.has(n.type));
            const res = await T.resolveFunctionParents(items || [], ty.fn, fetchItem);
            warnings = res.warnings.slice();
            const tree = T.buildTree(fnItems, ty.fn, res.parentOf);
            // 22 Oct 2026: the project's level limit (the 3-level layout). Items below it are never staged; the review names them.
            const _lim = (typeof SLFuncTree !== 'undefined' && SLFuncTree.levelLimit) ? SLFuncTree.levelLimit() : 0;
            fn = T.diffFunctions(tree, (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []) || [], { levelLimit: _lim });
            if (_lim && fn.tooDeep && fn.tooDeep.length) warnings.push('Jama: ' + SLFuncTree.refusedText(fn.tooDeep.map(x => x.item.key), 'brought in'));
            fn.tops = tree.tops.length; fn.total = fnItems.length;
        }
        if (items && items._truncated) warnings.push('Read the first ' + (MAX_PAGES * PAGE).toLocaleString() + ' items only (Jama reports ' + Number(items._total || 0).toLocaleString() + '). Narrow the item types or ask Safety Lab to raise the limit.');
        return { req, fn, warnings, checkedAt: new Date().toISOString() };
    }
    function _pending(d) {
        if (!d) return 0;
        const r = d.req ? d.req.fresh.length + d.req.changed.length + d.req.missing.length : 0;
        const f = (d.fn && _T()) ? _T().pending(d.fn) + ((d.fn.revised || []).length) : 0;
        return r + f;
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
        const need = (items || []).filter(n => n && fnSet.has(n.type)).filter(n => {
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
        d.fn.versions = versions;
        d.fn.revised = [];
        versions.forEach((v, id) => {
            const r = byRemote.get(id);
            if (r && Number(r.fnSource.version) !== v) {
                const it = (items || []).find(n => n && Number(n.id) === id);
                d.fn.revised.push({ remoteId: id, key: r.fnSource.key || (it && it.key) || '', name: (it && it.name) || r.subName || r.funcName || '', from: r.fnSource.version == null ? null : Number(r.fnSource.version), to: v });
            }
        });
        return d;
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
    function bridgeApply(diff, signedBy) {
        if (!signedBy || !String(signedBy).trim()) return { ok: false, err: 'A signature is required. The bridge watches; you decide.' };
        const by = String(signedBy).trim();
        const at = new Date().toISOString();
        // v1 callers passed the requirements diff itself
        const d = (diff && (diff.req || diff.fn)) ? diff : { req: diff, fn: null };
        const out = { ok: true, added: 0, updated: 0, flagged: 0, fn: null };
        if (d.req) {
            const store = (typeof acReqData !== 'undefined' ? acReqData : null);
            if (!store) return { ok: false, err: 'Requirement store unavailable.' };
            const txt = it => String(it.text || '') || it.name;
            (d.req.fresh || []).forEach(it => {
                store.push({
                    internalId: _newId(),
                    id: it.key, traceId: it.key, level: 'aircraft', type: 'Imported',
                    text: txt(it), rat: '',
                    reqSource: { tool: TOOL, reqifId: it.key, remoteId: it.id, lastChange: it.modified, by: by, at }
                });
                out.added++;
            });
            (d.req.changed || []).forEach(({ it, r }) => {
                r.text = txt(it) || r.text;
                r.reqSource.lastChange = it.modified; r.reqSource.remoteId = it.id; r.reqSource.reqifId = r.reqSource.reqifId || it.key;
                r.reqSource.by = by; r.reqSource.at = at;
                delete r.reqSource.missingInSource;
                out.updated++;
            });
            (d.req.missing || []).forEach(r => { r.reqSource.missingInSource = true; out.flagged++; });
        }
        if (d.fn && _T()) {
            const store = (typeof acFunctionsData !== 'undefined' ? acFunctionsData : null);
            const r = _T().applyFunctions(d.fn, store, { signedBy: by, at, newId: _newId });
            if (!r.ok) return r;
            out.fn = r;
            r.revised = _applyRevisions(d.fn, store, by, at);
        }
        const fnTxt = out.fn ? '; functions +' + out.fn.added + ' new, ' + out.fn.updated + ' updated, ' + out.fn.moved + ' moved, ' + out.fn.fnUpdated + ' renamed under a changed top function, ' + out.fn.flagged + ' flagged missing' + (out.fn.revised ? ', ' + out.fn.revised + ' Jama revision number(s) recorded' : '') : '';
        try { if (typeof window.jrnl === 'function') window.jrnl('bridge-sync', 'Jama live sync applied: requirements +' + out.added + ' new, ' + out.updated + ' updated, ' + out.flagged + ' flagged missing' + fnTxt + '. Signed ' + by); } catch (_) {}
        try { if (out.fn && typeof window.renderACFunctions === 'function') window.renderACFunctions(); } catch (_) {}
        try { if (typeof window.renderACReq === 'function') window.renderACReq(); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
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
            const fnTxt = f ? '; functions ' + f.total + ' read: ' + f.fresh.length + ' new, ' + f.changed.length + ' changed, ' + f.moved.length + ' moved, ' + f.fnChanged.length + ' top function(s) renamed, ' + f.missing.length + ' missing' : '';
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

    // ------------------------------------------------------------- the panel
    const SHOW = 40;
    function _row(tag, color, name, detail) {
        return '<tr><td><span style="font-size:10px; font-weight:700; color:' + color + ';">' + tag + '</span></td><td style="font-size:11.5px;"><b>' + _esc(name) + '</b></td><td style="font-size:11px; color:var(--color-text-secondary);">' + _esc(detail) + '</td></tr>';
    }
    function _more(n) { return n > SHOW ? '<tr><td></td><td colspan="2" style="font-size:11px; color:var(--color-text-tertiary);">and ' + (n - SHOW).toLocaleString() + ' more of this kind, all included when you sign</td></tr>' : ''; }
    function _fnPlace(x) {
        if (!x) return '';
        const parts = [x.top ? x.top.key : ''].concat(x.parent ? [x.parent.key] : []).filter(Boolean);
        return parts.length ? 'under ' + parts.join(' > ') : 'top-level function';
    }
    function _render() {
        const host = document.getElementById('reqif-host');
        if (!host) return;
        let div = document.getElementById('bridge-panel');
        if (!div) { div = document.createElement('div'); div.id = 'bridge-panel'; host.parentNode.insertBefore(div, host.parentNode.querySelector('#statusback-panel') || host); }
        const cfg = bridgeConfig(), ty = _types(cfg);
        const fieldCss = 'font-size:12px; padding:5px 9px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
        let html = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:10px 14px; margin-bottom:14px;">' +
            '<div style="font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:6px;">Live bridge, Jama <span style="font-weight:400; text-transform:none;">(read-only: functions and requirements come in, nothing is written to Jama)</span></div>' +
            '<div style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:8px;">The bridge watches; you decide. ' +
                ({ desktop: 'Credential: this computer\'s keychain; the desktop app makes the call.',
                   vault:   'Credential: stored server-side in your account, write-only from this page; the proxy makes the call.',
                   session: 'Credential: this tab only (browser-only install, no server to hold it); relayed through the stateless /api/bridge.' }[_door()] || '') +
                ' Never in the project file.</div>' +
            '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">' +
            '<input id="lb-url" type="text" placeholder="https://yourco.jamacloud.com" value="' + _esc(cfg.baseUrl || '') + '" style="' + fieldCss + ' width:230px;">' +
            '<input id="lb-pid" type="text" placeholder="project id" value="' + _esc(cfg.projectId || '') + '" style="' + fieldCss + ' width:90px;">' +
            '<input id="lb-user" type="text" placeholder="username" value="' + _esc((_store() && (_store().meta('jama_token') || {}).user) || cfg.user || '') + '" style="' + fieldCss + ' width:120px;">' +
            '<input id="lb-token" type="password" placeholder="' + ((_store() && _store().has('jama_token')) ? 'saved, leave blank to keep' : 'API token or password') + '" value="" style="' + fieldCss + ' width:150px;">' +
            '<label style="display:inline-flex; align-items:center; gap:4px; font-size:11px;"><input id="lb-auto" type="checkbox"' + (cfg.auto ? ' checked' : '') + '> watch every 5 min</label>' +
            '<button class="ckpt-m-btn" style="font-size:11.5px; padding:3px 12px;" onclick="bridgeSaveUi()">Save</button>' +
            '<button class="ckpt-m-btn ckpt-m-btn-primary" style="font-size:11.5px; padding:3px 12px;" onclick="bridgeCheckUi()">Check Jama now</button>' +
            '</div>';
        // item types: what is a function, what is a requirement
        const nameOf = id => { const t = (_itemTypes || []).find(x => x.id === id); return t ? t.name : ('type ' + id); };
        html += '<div style="font-size:11.5px; margin-bottom:8px;"><b>Item types.</b> ' +
            (ty.fn.length || ty.req.length
                ? 'Functions: ' + (ty.fn.length ? _esc(ty.fn.map(nameOf).join(', ')) : 'none') + '. Requirements: ' + (ty.req.length ? _esc(ty.req.map(nameOf).join(', ')) : 'none') + '. '
                : '<span style="color:var(--color-warning); font-weight:600;">Not chosen yet, so nothing is read.</span> ') +
            '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="bridgeTypesUi()">' + (_itemTypes ? 'Refresh item types' : 'Choose item types') + '</button></div>';
        if (_itemTypes) {
            html += '<div style="max-height:220px; overflow:auto; border:1px solid var(--color-border-hair); padding:6px 10px; margin-bottom:8px;"><table class="data-table" style="width:100%;"><thead><tr><th style="font-size:11px;">Jama item type</th><th style="font-size:11px;">Functions</th><th style="font-size:11px;">Requirements</th></tr></thead><tbody>' +
                _itemTypes.map(t => '<tr><td style="font-size:11.5px;">' + _esc(t.name) + (t.key ? ' <span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + _esc(t.key) + '</span>' : '') + '</td>' +
                    '<td><input type="checkbox" class="lb-fn-type" value="' + t.id + '"' + (ty.fn.includes(t.id) ? ' checked' : '') + '></td>' +
                    '<td><input type="checkbox" class="lb-req-type" value="' + t.id + '"' + (ty.req.includes(t.id) ? ' checked' : '') + '></td></tr>').join('') +
                '</tbody></table><div style="margin-top:6px;"><button class="ckpt-m-btn ckpt-m-btn-primary" style="font-size:11px; padding:2px 10px;" onclick="bridgeTypesSaveUi()">Save item types</button> <span style="font-size:11px; color:var(--color-text-tertiary);">Folders and sets do not need ticking: the bridge looks through them to find which function sits under which.</span></div></div>';
        }
        html += '<div id="lb-progress" style="font-size:11px; color:var(--color-text-secondary); margin-bottom:6px;">' + _esc(_progress) + '</div>';
        if (_lastDiff) {
            const d = _lastDiff, r = d.req, f = d.fn;
            const pending = _pending(d);
            html += '<div style="font-size:12px; margin-bottom:6px;"><b>' + (pending ? pending.toLocaleString() + ' change(s) need review' : 'In sync') + '</b>' +
                ' <span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">checked ' + _esc(String(d.checkedAt).slice(11, 19)) +
                (f ? ' · functions: ' + f.total.toLocaleString() + ' read, ' + f.unchanged.toLocaleString() + ' unchanged' : '') +
                ' · requirements: ' + r.unchanged.length.toLocaleString() + ' unchanged</span></div>';
            (d.warnings || []).forEach(w => { html += '<div style="font-size:11px; color:var(--color-warning); margin-bottom:4px;">' + _esc(w) + '</div>'; });
            if (f && (_T().pending(f) || (f.revised || []).length)) {
                html += '<div style="font-size:11px; font-weight:700; margin:6px 0 3px;">Aircraft functions</div><table class="data-table" style="width:100%;"><tbody>' +
                    f.fnChanged.slice(0, SHOW).map(x => _row('FUNCTION RENAMED', 'var(--color-warning)', x.item.key + ', ' + x.item.name, x.fields.join(' and ') + ' changed; applies to ' + x.rows.length + ' row(s)')).join('') + _more(f.fnChanged.length) +
                    f.fresh.slice(0, SHOW).map(x => _row('NEW', 'var(--color-success)', x.item.key + ', ' + x.item.name, x.funcOnly ? 'top-level function, nothing under it yet' : _fnPlace(x))).join('') + _more(f.fresh.length) +
                    f.changed.slice(0, SHOW).map(x => _row('CHANGED', 'var(--color-warning)', (x.row.subId || x.row.funcId) + ', ' + x.item.name, x.fields.join('; '))).join('') + _more(f.changed.length) +
                    f.moved.slice(0, SHOW).map(x => _row('MOVED', 'var(--color-accent)', (x.row.subId || '') + ', ' + x.item.name, 'now ' + _fnPlace(x))).join('') + _more(f.moved.length) +
                    f.missing.slice(0, SHOW).map(x => _row('MISSING', 'var(--color-danger)', (x.row.subId || x.row.funcId) + ', ' + (x.row.subName || x.row.funcName || ''), x.why + '. Flagged, never deleted.')).join('') + _more(f.missing.length) +
                    (f.revised || []).slice(0, SHOW).map(x => _row('REVISION', 'var(--color-text-secondary)', (x.key || '') + ', ' + (x.name || ''), x.from == null ? 'Jama revision ' + x.to + ' (first read)' : 'Jama revision ' + x.from + ' is now ' + x.to)).join('') + _more((f.revised || []).length) +
                    '</tbody></table>';
            }
            if (r.fresh.length + r.changed.length + r.missing.length) {
                html += '<div style="font-size:11px; font-weight:700; margin:6px 0 3px;">Requirements</div><table class="data-table" style="width:100%;"><tbody>' +
                    r.fresh.slice(0, SHOW).map(it => _row('NEW', 'var(--color-success)', it.key + ', ' + it.name, (it.text || '').slice(0, 90))).join('') + _more(r.fresh.length) +
                    r.changed.slice(0, SHOW).map(x => _row('CHANGED', 'var(--color-warning)', x.it.key + ', ' + x.it.name, 'modified ' + x.it.modified + ' (yours: ' + (x.r.reqSource.lastChange || 'none') + ')')).join('') + _more(r.changed.length) +
                    r.missing.slice(0, SHOW).map(x => _row('MISSING', 'var(--color-danger)', x.id || x.traceId, 'in the model, absent from Jama. Flagged, never deleted.')).join('') + _more(r.missing.length) +
                    '</tbody></table>';
            }
            if (pending) {
                html += '<div style="display:flex; gap:10px; align-items:center; margin-top:8px;">' +
                    '<input id="lb-by" type="text" placeholder="Signature (required)" style="' + fieldCss + ' width:200px;">' +
                    '<button class="ckpt-m-btn ckpt-m-btn-primary" style="font-size:11.5px; padding:3px 12px;" onclick="bridgeApplyUi()">Sign and apply staged changes</button>' +
                    '<span id="lb-err" style="color:var(--color-danger); font-size:11.5px; font-weight:600;"></span></div>';
            }
        }
        html += '</div>';
        div.innerHTML = html;
    }

    // ------------------------------------------------------------ UI verbs
    window.bridgeSaveUi = async function () {
        const g = id => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
        const baseUrl = g('lb-url'), user = g('lb-user'), token = g('lb-token');
        const prev = bridgeConfig();
        const cfg = { kind: 'jama', baseUrl: baseUrl, projectId: g('lb-pid'), user: user, token: token, auto: g('lb-auto'),
                      fnTypes: prev.fnTypes || [], reqTypes: prev.reqTypes || [] };

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
        bridgeFetchItemTypes().then(list => { _itemTypes = list; _render(); })
            .catch(e => { try { showToast('Bridge: ' + e.message, 'error', 4200); } catch (_) {} });
    };
    window.bridgeTypesSaveUi = function () {
        const pick = cls => Array.prototype.map.call(document.querySelectorAll('#bridge-panel .' + cls + ':checked'), el => Number(el.value));
        const fn = pick('lb-fn-type'), req = pick('lb-req-type');
        const both = fn.filter(x => req.includes(x));
        if (both.length) { try { showToast('A Jama item type can be functions or requirements, not both. Untick one.', 'error', 4200); } catch (_) {} return; }
        const cfg = bridgeConfig(); cfg.fnTypes = fn; cfg.reqTypes = req;
        bridgeConfigSave(cfg); _itemTypes = null; _lastDiff = null; _armPoll(); _render();
        try { showToast('Item types saved. Check Jama now to see what comes in.', 'success', 3200); } catch (_) {}
    };
    window.bridgeCheckUi = function () {
        bridgeCheck(false).catch(e => { try { showToast('Bridge: ' + e.message, 'error', 5200); } catch (_) {} });
    };
    window.bridgeApplyUi = function () {
        if (!_lastDiff) return;
        const by = (document.getElementById('lb-by') || { value: '' }).value.trim();
        const r = bridgeApply(_lastDiff, by);
        const err = document.getElementById('lb-err');
        if (!r.ok) { if (err) err.textContent = r.err; return; }
        _lastDiff = null;
        const f = r.fn;
        try { showToast('Applied. Requirements: +' + r.added + ' new, ' + r.updated + ' updated, ' + r.flagged + ' flagged.' + (f ? ' Functions: +' + f.added + ' new, ' + f.updated + ' updated, ' + f.moved + ' moved, ' + f.flagged + ' flagged.' : ''), 'success', 5200); } catch (_) {}
        _render();
    };

    // ------------------------------------------------------------- the wrap
    (function wrap() {
        if (typeof window.renderReqifPage === 'function' && !window.renderReqifPage._lbWrapped) {
            const orig = window.renderReqifPage;
            const wrapped = function () {
                const r = orig.apply(this, arguments);
                try { _render(); } catch (_) {}
                return r;
            };
            wrapped._lbWrapped = true;
            window.renderReqifPage = wrapped;
        }
    })();
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
})();

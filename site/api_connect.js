// ============================================================================
// api_connect.js, v1.0, 27 Nov 2026: the Safety Lab API and MCP server, in the app.
//
// Waqas, 27 Nov 2026: "API and MCP yes". Two ways to sign in (an API client for a system, a personal API key for a
// person's scripts); "what a tool sends arrives as lines an engineer accepts and signs. Items another tool owns cannot
// be changed. No special cases."
//
// TWO PARTS
//   keys     a card on the Connections page: the address, the keys of this workspace, make one, revoke one. A secret
//            is shown once, when it is made; the server keeps only a SHA-256 of it (api_client_create).
//   tools    every API client that keeps a collection in this project is a connected tool, on the same engine as
//            Polarion and Codebeamer (alm_engine.js) with a local driver: it reads the client's collections with the
//            person's own Safety Lab session (api_sources, api_collection_items), and a check stages every difference
//            as a line. Nothing enters the analysis until an engineer accepts the line and signs. What Safety Lab sends
//            (items it owns, failure conditions, safety requirements) is written into the client's collection for the
//            tool to read (api_item_send; held back if the tool changed the item since). What an engineer decides is
//            written back so the tool can see where each item stands (api_items_decide).
// A linked item is known as "<collection name>:<the tool's id for it>", under the tool id "api-" + the first twelve
// characters of the client's id (the server uses the same two: api_v1.js toolIdOf and slOwnedIds).
// ============================================================================
(function () {
    'use strict';
    var W = (typeof window !== 'undefined') ? window : globalThis;
    var S = function (v) { return v == null ? '' : String(v).trim(); };
    var arrOf = function (a) { return Array.isArray(a) ? a : []; };
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function _toast(m, t, ms) { try { if (typeof showToast === 'function') showToast(m, t || 'info', ms || 4200); } catch (_) {} }
    function _report(e, where) { try { if (W.SLErrorWatch) W.SLErrorWatch.report(e, 'api_connect' + (where ? ': ' + where : '')); } catch (_) {} }
    // The four things this module asks the app. A test stands in for them here (SLApi._env), nowhere else.
    var ENV = {};
    function sb() { if (ENV.client) return ENV.client(); try { return (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null; } catch (_) { return null; } }
    function projectId() { if (ENV.projectId) return ENV.projectId(); try { return (typeof _activeCloudProjectId !== 'undefined' && _activeCloudProjectId) ? String(_activeCloudProjectId) : ''; } catch (_) { return ''; } }
    function workspace() { if (ENV.workspace) return ENV.workspace(); try { return (typeof getActiveWorkspace === 'function') ? getActiveWorkspace() : null; } catch (_) { return null; } }
    function signedIn() { if (ENV.signedIn) return ENV.signedIn(); try { return !!(W._supabaseSession && W._supabaseSession.user); } catch (_) { return false; } }
    function _pc() { try { return (typeof projectConfig !== 'undefined' && projectConfig && typeof projectConfig === 'object') ? projectConfig : null; } catch (_) { return null; } }
    function toolIdOf(clientUuid) { return 'api-' + String(clientUuid).replace(/-/g, '').slice(0, 12); }
    function apiBase() { var b = S(W.SLConfig && W.SLConfig.aiEndpoint).replace(/\/+$/, ''); return b ? b.replace(/\/ai$/, '') : ''; }
    async function rpc(name, args) {
        var c = sb(); if (!c) throw new Error('Sign in to a Safety Lab server to use the Safety Lab API.');
        var r = await c.rpc(name, args || {});
        if (r && r.error) throw new Error(S(r.error.message) || 'The server refused.');
        return r ? r.data : null;
    }
    var KMAP = { functions: 'fn', requirements: 'req', assumptions: 'asm' };

    // ------------------------------------------------------------------ the tools (one per API client in this project)
    var src = {};          // tool id -> { client, name, kind, can_send, revoked, collections: [{ id, name, kind, title, items }] }
    var loadedFor = '', loadedAt = 0, loading = null;
    function colBy(tid, pred) { return arrOf(src[tid] && src[tid].collections).filter(pred)[0] || null; }
    function split(remoteId) { var i = String(remoteId).indexOf(':'); return i < 0 ? { col: '', id: String(remoteId) } : { col: String(remoteId).slice(0, i), id: String(remoteId).slice(i + 1) }; }
    function noProject() {
        if (!sb() || !signedIn()) return 'The Safety Lab API works for projects kept on a Safety Lab server. Sign in to use it.';
        if (!projectId()) return 'This project is kept as a file, so no tool can reach it through the Safety Lab API. Save it to your Safety Lab server first.';
        return '';
    }
    function driverFor(tid) {
        var me = function () { return src[tid] || { name: (((_pc() || {}).almTools || {})[tid] || {}).label || tid, collections: [] }; };
        var items = async function (col) {
            var list = arrOf(await rpc('api_collection_items', { p_collection: col.id }));
            return list.map(function (it) { return Object.assign({}, it, { _col: col }); });
        };
        return {
            id: tid, label: me().name, short: me().name, container: 'collection', containers: 'collections', local: true, autoCheck: true,
            auths: [], hint: '',
            configured: function (c) { return arrOf(c && c.picks).length > 0 || arrOf(me().collections).length > 0; },
            where: function () { var m = me(); return 'Safety Lab API, ' + (m.kind === 'personal' ? 'a personal key' : 'an API client') + (m.revoked ? ' (revoked: it can no longer send)' : ''); },
            problem: noProject,
            // a collection the tool filled that nobody has linked yet: said on the tool's card, so it is not missed
            notes: function (c) {
                var picked = {}; arrOf(c && c.picks).forEach(function (p) { picked[String(p.container)] = 1; });
                return arrOf(me().collections).filter(function (x) { return x.kind !== 'failure-conditions' && Number(x.items) > 0 && !picked[x.id]; })
                    .map(function (x) { return 'Collection "' + (x.title || x.name) + '" holds ' + x.items + ' ' + x.kind + ' that are not linked yet. Press Linked items and owners, then Choose what is linked, to say where they belong.'; });
            },
            test: async function () { return me().name; },
            listContainers: async function () {
                await load(true);
                return arrOf(me().collections).map(function (c) {
                    return { id: c.id, name: c.title || c.name, kind: KMAP[c.kind] || 'req', where: c.name + ' · ' + (c.kind === 'failure-conditions' ? 'receives failure conditions from Safety Lab' : (c.items + ' ' + c.kind)) };
                });
            },
            read: async function (c, req, container) {
                var col = colBy(tid, function (x) { return x.id === container; });
                if (!col) { await load(true); col = colBy(tid, function (x) { return x.id === container; }); }
                if (!col) throw new Error('that collection is no longer on the server');
                var list = await items(col), out = [];
                list.forEach(function (it) {
                    if (it.origin !== 'tool' || it.removed) return;   // what Safety Lab sent is Safety Lab's; a removed item is simply not listed, so it is flagged as missing
                    out.push({ id: col.name + ':' + it.id, key: S(it.key) || S(it.id), name: S(it.name), text: it.text == null ? '' : String(it.text), modified: 'r' + it.rev, parentId: it.parentId ? col.name + ':' + it.parentId : null, sort: Number(it.sort) || 0, container: String(container) });
                });
                return { items: out, warnings: [] };
            },
            seen: async function (c, req, remoteId) {
                var p = split(remoteId), col = colBy(tid, function (x) { return x.name === p.col; });
                if (!col) { await load(true); col = colBy(tid, function (x) { return x.name === p.col; }); }
                if (!col) return null;
                var it = (await items(col)).filter(function (x) { return String(x.id) === p.id; })[0];
                if (!it || it.removed) return null;
                return { id: String(remoteId), name: S(it.name), text: it.text == null ? '' : String(it.text), modified: 'r' + it.rev, tracker: col.id, _rev: Number(it.rev), _item: p.id };
            },
            update: async function (c, req, remoteId, f) {
                var now = await this.seen(c, req, remoteId);
                if (!now) throw new Error('the tool no longer has this item');
                var r = await rpc('api_item_send', { p_collection: now.tracker, p_item_id: now._item, p_key: '', p_name: S(f.name), p_body: f.text == null ? '' : String(f.text), p_parent: null, p_expect_rev: now._rev });
                if (!r || r.result !== 'updated') throw new Error(r && r.result === 'held' ? 'the tool changed this item a moment ago; check it, then send again' : 'the item could not be sent');
            },
            create: async function (c, req, container, type, f) {
                var col = colBy(tid, function (x) { return x.id === container; });
                if (!col) throw new Error('choose the collection to send to in Mapping first');
                var m = /^([A-Za-z][A-Za-z0-9]*-[\w.]+)\s/.exec(S(f.name) + ' ');
                var r = await rpc('api_item_send', { p_collection: container, p_item_id: null, p_key: m ? m[1] : '', p_name: S(f.name), p_body: f.text == null ? '' : String(f.text), p_parent: null, p_expect_rev: null });
                if (!r || r.result !== 'created') throw new Error('the item could not be sent');
                return { id: col.name + ':' + r.id, key: S(r.key) || S(f.name).slice(0, 40) };
            },
            link: null, comment: null,
            // what an engineer decided, written back for the tool to read
            decided: async function (lines, status, signer, why) {
                var by = {};
                arrOf(lines).forEach(function (l) { if (l.remoteId == null) return; var p = split(l.remoteId); if (p.col) (by[p.col] = by[p.col] || []).push(p.id); });
                for (var name in by) {
                    var col = colBy(tid, function (x) { return x.name === name; });
                    if (!col) continue;
                    try { await rpc('api_items_decide', { p_collection: col.id, p_ids: by[name], p_status: status, p_by: S(signer), p_why: S(why) }); } catch (e) { _report(e, 'decided'); }
                }
            },
            setupUi: function () { return toolUi(tid); }
        };
    }
    function ensureTool(tid, label) {
        if (!W.SLAlm || !W.SLAlm.addTool || !W.SLConnections) return;
        var d = driverFor(tid); d.label = label || d.label; d.short = d.label;
        W.SLAlm.addTool(d);
        W.SLConnections.addTool({ id: tid, label: d.label, how: 'Safety Lab API' });
    }
    // Which API clients reach this project, and their collections. Asked when a project opens and when the page is shown.
    function load(force) {
        var pid = projectId();
        if (!pid || !sb() || !signedIn()) { loadedFor = ''; return Promise.resolve(false); }
        if (!force && loadedFor === pid && Date.now() - loadedAt < 60000) return Promise.resolve(true);
        if (loading) return loading;
        loading = (async function () {
            try {
                var list = arrOf(await rpc('api_sources', { p_project: pid }));
                if (projectId() !== pid) return false;
                var next = {};
                list.forEach(function (s) { if (s && s.client) next[toolIdOf(s.client)] = s; });
                src = next; loadedFor = pid; loadedAt = Date.now();
                Object.keys(next).forEach(function (tid) {
                    var s = next[tid]; if (!arrOf(s.collections).length) return;
                    ensureTool(tid, s.name);
                    // the name is kept with the project, so a linked row still says whose it is when the server cannot be asked
                    var pc = _pc();
                    if (pc && W.SLConnections && W.SLConnections.background) {
                        var cur = (pc.almTools && pc.almTools[tid]) || null;
                        if (!cur || cur.label !== s.name) W.SLConnections.background(function () { if (!pc.almTools || typeof pc.almTools !== 'object') pc.almTools = {}; pc.almTools[tid] = Object.assign({}, pc.almTools[tid] || {}, { label: s.name, client: s.client }); try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} });
                    }
                });
                try { W.SLConnections.render(); } catch (_) {}
                return true;
            } catch (e) { _report(e, 'sources'); return false; } finally { loading = null; }
        })();
        return loading;
    }
    // a project that already has rows from an API client knows the tool even before the server answers (or when it cannot)
    function fromProject() {
        var pc = _pc(), t = (pc && pc.almTools) || {};
        Object.keys(t).forEach(function (tid) { if (/^api-[0-9a-f]{12}$/.test(tid) && !(W.SLAlm && W.SLAlm.tool(tid))) ensureTool(tid, S(t[tid] && t[tid].label) || tid); });
    }

    // the "connection settings" of an API client: what it is, its collections, and somewhere to send to
    function _modal(html) {
        var d = document, old = d.getElementById('api-pop'); if (old) old.remove();
        var ov = d.createElement('div'); ov.id = 'api-pop'; ov.className = 'cx-pop'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
        ov.innerHTML = '<div class="cx-pop-card">' + html + '</div>'; d.body.appendChild(ov);
        try { var f = ov.querySelector('input,select,button'); if (f) f.focus(); } catch (_) {}
        return ov;
    }
    function _close() { var p = document.getElementById('api-pop'); if (p) p.remove(); }
    function _btn(label, js, primary) { return '<button type="button" class="ckpt-m-btn' + (primary ? ' ckpt-m-btn-primary' : '') + '" onclick="' + js + '">' + label + '</button>'; }
    async function toolUi(tid) {
        await load(true);
        var s = src[tid] || { name: tid, collections: [] }, cols = arrOf(s.collections);
        var has = function (kind) { return cols.some(function (c) { return c.kind === kind; }); };
        _modal('<h3>' + _esc(s.name) + '</h3><p class="cx-dim">' + (s.kind === 'personal' ? 'A personal API key.' : 'An API client.') + ' It reads this project through the Safety Lab API and keeps what it sends in the collections below. Nothing it sends enters the analysis until an engineer accepts it in Incoming changes and signs.' + (s.revoked ? ' <b>This key was revoked:</b> it can no longer read or send; what it sent before stays.' : '') + '</p>' +
            '<details open><summary>Collections (' + cols.length + ')</summary><table class="cx-table"><thead><tr><th>Collection</th><th>Holds</th><th>Items from the tool</th></tr></thead><tbody>' +
            (cols.length ? cols.map(function (c) { return '<tr><td><b>' + _esc(c.title || c.name) + '</b><div class="cx-dim">' + _esc(c.name) + '</div></td><td>' + _esc(c.kind) + '</td><td>' + (c.kind === 'failure-conditions' ? '<span class="cx-dim">receives only</span>' : c.items) + '</td></tr>'; }).join('') : '<tr><td colspan="3" class="cx-dim">This key has no collection in this project yet.</td></tr>') +
            '</tbody></table></details>' +
            '<p class="cx-dim">To send failure conditions or safety requirements to this tool, it needs a collection to receive them. Then choose it in Mapping.</p>' +
            '<div class="cx-row cx-gap">' + (has('failure-conditions') ? '' : _btn('Add a collection for failure conditions', 'SLApi.makeCollection(\'' + tid + '\', \'failure-conditions\')')) +
            _btn('Add a collection for safety requirements', 'SLApi.makeCollection(\'' + tid + '\', \'requirements\')') +
            '<span class="cx-right">' + _btn('Choose what is linked', 'SLApi.close();SLConnections.browse(\'' + tid + '\')', true) + _btn('Close', 'SLApi.close()') + '</span></div><div class="cx-err" id="api-err"></div>');
    }
    async function makeCollection(tid, kind) {
        var s = src[tid]; if (!s) return;
        var name = kind === 'failure-conditions' ? 'failure-conditions' : 'safety-requirements', title = kind === 'failure-conditions' ? 'Failure conditions from Safety Lab' : 'Safety requirements from Safety Lab';
        try { await rpc('api_collection_make', { p_project: projectId(), p_client: s.client, p_name: name, p_kind: kind, p_title: title }); await load(true); _toast('Added. Choose it in Mapping under what Safety Lab sends.', 'success'); toolUi(tid); }
        catch (e) { var el = document.getElementById('api-err'); if (el) el.textContent = (e && e.message) || String(e); }
    }

    // ------------------------------------------------------------------ the keys card
    var K = { ws: '', list: null, err: '', at: 0, busy: false };
    function role() { var w = workspace(); return S(w && w.myRole); }
    function isAdmin() { var r = role(); return r === 'owner' || r === 'admin'; }
    function canEdit() { var r = role(); return r === 'owner' || r === 'admin' || r === 'editor'; }
    function loadKeys(force) {
        var w = workspace(); if (!w || !sb() || !signedIn()) return;
        if (K.busy || (!force && K.ws === w.id && Date.now() - K.at < 60000)) return;
        K.busy = true;
        rpc('api_client_list', { p_workspace: w.id }).then(function (list) { K.list = arrOf(list); K.err = ''; }).catch(function (e) { K.list = []; K.err = (e && e.message) || String(e); })
            .then(function () { K.ws = w.id; K.at = Date.now(); K.busy = false; try { W.SLConnections.render(); } catch (_) {} });
    }
    function _when(iso) { return iso ? String(iso).slice(0, 10) : 'never'; }
    function card() {
        var head = '<section class="cx-card" id="api-card"><div class="cx-row"><h4>Safety Lab API and MCP server</h4></div>' +
            '<p class="cx-dim">For in-house tools, new tools and AI assistants. A key reads this workspace’s projects: functions, failure conditions, fault trees, requirements, assumptions and their traces. What a tool sends waits in Incoming changes for an engineer to accept and sign. Items another tool owns cannot be changed. Fault trees, safety requirements and every number are made by Safety Lab’s engine and cannot be written from outside.</p>';
        if (!sb() || !signedIn()) return head + '<p class="cx-dim">The API works for projects kept on a Safety Lab server. Sign in to make a key.</p></section>';
        var w = workspace(); if (!w) return head + '<p class="cx-dim">Choose a workspace to see its keys.</p></section>';
        loadKeys(false); load(false); fromProject();
        var base = apiBase(), list = arrOf(K.list), live = list.filter(function (k) { return !k.revoked_at; }), gone = list.filter(function (k) { return k.revoked_at; });
        var row = function (k) {
            return '<tr><td><b>' + _esc(k.name) + '</b><div class="cx-dim">' + _esc(k.client_id) + '</div></td><td>' + (k.kind === 'personal' ? 'Personal key' : 'API client') + '</td><td>' + (k.can_send ? 'Reads and sends' : 'Reads only') + '</td><td>' + (k.project_ids && k.project_ids.length ? k.project_ids.length + ' chosen project' + (k.project_ids.length === 1 ? '' : 's') : (k.kind === 'personal' ? 'What its owner can open' : 'Every project of the workspace')) + '</td><td>' + _esc(_when(k.last_used_at)) + '</td><td>' +
                (k.revoked_at ? '<span class="cx-dim">revoked ' + _esc(_when(k.revoked_at)) + '</span>' : ((isAdmin() || k.mine) ? _btn('Revoke', 'SLApi.revoke(\'' + _esc(k.id) + '\')') : '')) + '</td></tr>';
        };
        var table = function (rows) { return '<table class="cx-table"><thead><tr><th>Key</th><th>Kind</th><th>Can</th><th>Reaches</th><th>Last used</th><th></th></tr></thead><tbody>' + rows.map(row).join('') + '</tbody></table>'; };
        return head +
            (base ? '<div class="cx-tiles"><div class="cx-tile"><b>API address</b><span class="cx-dim" style="user-select:all">' + _esc(base) + '</span></div><div class="cx-tile"><b>MCP server address</b><span class="cx-dim" style="user-select:all">' + _esc(base + '/mcp') + '</span></div></div>' : '<div class="cx-warn">This install has no Safety Lab server address configured, so the API has no address to give out.</div>') +
            (K.err ? '<div class="cx-err">' + _esc(K.err) + '</div>' : '') +
            (K.list == null ? '<p class="cx-dim">Reading the keys...</p>' :
                '<details' + (live.length ? ' open' : '') + '><summary>Keys in use (' + live.length + ')</summary>' + (live.length ? table(live) : '<p class="cx-dim">No key yet.</p>') + '</details>' +
                (gone.length ? '<details><summary>Revoked keys (' + gone.length + ')</summary>' + table(gone) + '</details>' : '')) +
            '<div class="cx-row cx-gap">' + (isAdmin() ? _btn('New API client', 'SLApi.newKey(\'client\')', true) : '') + _btn('New personal key', 'SLApi.newKey(\'personal\')', !isAdmin()) + '</div>' +
            (isAdmin() ? '' : '<p class="cx-dim">An API client, for a system that runs on its own, is made by a workspace admin. A personal key is for your own scripts and sees what you can open.</p>') +
            '</section>';
    }
    function newKey(kind) {
        var pid = projectId(), personal = kind === 'personal';
        _modal('<h3>' + (personal ? 'New personal API key' : 'New API client') + '</h3><p class="cx-dim">' + (personal ? 'For your own scripts. It sees the projects you can open, for as long as you can open them.' : 'For a system that runs on its own. It gets a client ID and a secret, and reads the projects of this workspace.') + ' The secret is shown once, on the next screen. Safety Lab keeps only a fingerprint of it and cannot show it again.</p>' +
            '<label class="cx-lab">Name (what the key is for)<input type="text" id="api-name" maxlength="80" placeholder="' + (personal ? 'My export script' : 'Requirements tool') + '"></label>' +
            '<label class="cx-radio"><input type="radio" name="api-send" value="0" checked> Reads only</label>' +
            ((personal && !canEdit()) ? '<p class="cx-dim">Your role views this workspace, so your key reads only.</p>' : '<label class="cx-radio"><input type="radio" name="api-send" value="1"> Reads and sends (what it sends waits for an engineer to accept and sign)</label>') +
            ((!personal && pid) ? '<label class="cx-radio"><input type="checkbox" id="api-one"> Only this project</label>' : '') +
            '<div class="cx-err" id="api-err"></div><div class="cx-row cx-gap">' + _btn('Make the key', 'SLApi.create(\'' + kind + '\')', true) + '<span class="cx-right">' + _btn('Cancel', 'SLApi.close()') + '</span></div>');
    }
    async function create(kind) {
        var w = workspace(), err = document.getElementById('api-err'), name = S((document.getElementById('api-name') || {}).value);
        var send = !!document.querySelector('input[name="api-send"][value="1"]:checked'), one = !!(document.getElementById('api-one') || {}).checked;
        if (!name) { if (err) err.textContent = 'Give the key a name.'; return; }
        if (!w) { if (err) err.textContent = 'Choose a workspace first.'; return; }
        try {
            var r = await rpc('api_client_create', { p_workspace: w.id, p_kind: kind, p_name: name, p_can_send: send, p_projects: (kind === 'client' && one && projectId()) ? [projectId()] : null });
            var k = arrOf(r)[0] || r || {};
            if (!k.secret) throw new Error('The server made no key.');
            var base = apiBase(), personal = kind === 'personal';
            _modal('<h3>' + _esc(name) + '</h3><div class="cx-warn">Copy the ' + (personal ? 'key' : 'secret') + ' now. It is shown once. Safety Lab keeps only a fingerprint of it and cannot show it again; if it is lost, revoke this key and make another.</div>' +
                (personal ? '' : '<label class="cx-lab">Client ID<input type="text" readonly id="api-cid" value="' + _esc(k.client_id) + '" onclick="this.select()"></label>') +
                '<label class="cx-lab">' + (personal ? 'Personal API key' : 'Client secret') + '<input type="text" readonly id="api-secret" value="' + _esc(k.secret) + '" onclick="this.select()"></label>' +
                '<p class="cx-dim">' + (personal ? 'Send it with every request as: <b>Authorization: Bearer &lt;key&gt;</b>' : 'Exchange the two for a one-hour access token at <b>' + _esc(base || '(your server)') + '/oauth/token</b>, then send the token as: <b>Authorization: Bearer &lt;token&gt;</b>') + '</p>' +
                '<div class="cx-row cx-gap">' + _btn('Copy the ' + (personal ? 'key' : 'secret'), 'SLApi.copy(\'api-secret\')', true) + (personal ? '' : _btn('Copy the client ID', 'SLApi.copy(\'api-cid\')')) + '<span class="cx-right">' + _btn('I have copied it', 'SLApi.close()') + '</span></div>');
            try { if (W.SLConnections && W.SLConnections.log && _pc()) W.SLConnections.background(function () { W.SLConnections.log({ tool: 'api', what: 'connect', text: 'Made ' + (personal ? 'a personal API key' : 'an API client') + ': ' + name + (send ? ' (reads and sends)' : ' (reads only)'), result: 'done' }); }); } catch (_) {}
            loadKeys(true);
        } catch (e) { if (err) err.textContent = (e && e.message) || String(e); }
    }
    async function revoke(id) {
        var k = arrOf(K.list).filter(function (x) { return x.id === id; })[0]; if (!k) return;
        var yes = true;
        try { if (typeof slConfirm === 'function') yes = await slConfirm('Revoke "' + k.name + '"? Whatever uses it stops working at once. What it already sent stays. This cannot be undone.'); } catch (_) {}
        if (!yes) return;
        try { await rpc('api_client_revoke', { p_id: id }); _toast('Revoked: ' + k.name + '.', 'success'); loadKeys(true); load(true); }
        catch (e) { _toast((e && e.message) || String(e), 'error', 6000); }
    }
    function copy(id) {
        var el = document.getElementById(id); if (!el) return;
        try { el.select(); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.value).then(function () { _toast('Copied.', 'success', 1800); }, function () { document.execCommand('copy'); }); else document.execCommand('copy'); } catch (_) {}
    }

    // ------------------------------------------------------------------ start
    function start() {
        if (!W.SLConnections || !W.SLConnections.addCard || !W.SLAlm || !W.SLAlm.addTool) return false;
        W.SLConnections.addCard(card);
        var last = null;
        var tick = function () { try { var pid = projectId(); fromProject(); if (pid !== last) { last = pid; src = {}; loadedFor = ''; if (pid) load(true); } } catch (e) { _report(e, 'tick'); } };
        tick(); setInterval(tick, 5000);
        return true;
    }
    W.SLApi = { VERSION: '1.0', _env: ENV, toolIdOf: toolIdOf, load: load, sources: function () { return src; }, card: card, newKey: newKey, create: create, revoke: revoke, copy: copy, close: _close, makeCollection: makeCollection, toolUi: toolUi, apiBase: apiBase, _driverFor: driverFor };
    if (!start()) { var tries = 0, t = setInterval(function () { if (start() || ++tries > 40) clearInterval(t); }, 500); }
})();

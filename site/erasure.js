// ============================================================================
// erasure.js — v1.0 (18 Oct 2026, SEC-4 / S9): erasure as SL-WP-0003 v3.0 section 18 describes it.
//
// The paper: "self-serve permanent erasure, of an individual project or of an entire account, that purges the
// underlying content ... and issues a certificate of destruction". Ruled 28 Sep 2026: fix the code to match the
// paper unless it makes the tool worse. Before this file:
//   - a project could be archived (reversible) but only the service role could erase one;
//   - the certificate of an account erasure was on screen for five seconds and then gone;
//   - nothing on this device was cleared: the autosave, the last-good copy, the recovery ring, the confirmed copy,
//     the offline co-edit store, the AI memory and the CAD cache all outlived the erasure.
// Now:
//   - an owner or admin erases an ARCHIVED project from the archive list (archive first, erase second: the second
//     step is the irreversible one, and it names exactly what goes before DELETE is typed). The database function
//     re-checks the role itself (public.erase_project, can_admin_workspace), so the button is never the guard;
//   - every certificate can be saved as a file at the moment it is issued, and a project's certificate is listed
//     on the account page afterwards (the database keeps it, readable by whoever erased it);
//   - this device's copies go too: everything after an account erasure, the project's own after a project erasure.
//     Files a person saved to disk themselves are theirs and are not touched (the paper: the customer "handles
//     locally-stored desktop files appropriately"), and the screens say so.
// Pure where it can be: plan() decides what to wipe from what is stored; run() does it. Tested in
// tests/regression_erasure_selfserve_20261018.test.js.
// ============================================================================
(function () {
    'use strict';
    // What Safety Lab keeps on a device (inventory 18 Oct 2026)
    var LS_PREFIXES = ['safetyLab.', 'slai.', 'slab', 'sl-', 'sl.', 'SLA_'];  // localStorage / sessionStorage keys (sl.oosEnabled, SLA_FTA_MINIMAP: checked against every key the page writes)
    var IDB_FIXED = ['safetyLabAero', 'safetyLab.ai.v1', 'sl-cad', 'safetyLabSaveFs'];   // the kv store (autosave, last-good, ring, confirmed copy), AI memory, CAD cache, save folder handle
    var CRDT_PREFIX = 'slab-crdt-';                                          // one offline co-edit store per project
    var PROJECT_KEYS = ['safetyLab.autosave.v1', 'safetyLab.autosave.meta.v1', 'safetyLab.autosave.lastgood.v1', 'safetyLab.autosave.lastgood.meta.v1', 'safetyLab.accepted.v1'];
    var RING_META = 'safetyLab.autosave.ringMeta', RING_KEY = function (i) { return 'safetyLab.autosave.ring.' + i; };
    var TAB_PIN = 'safetyLab.tabProject.v1';                                 // sessionStorage: the project this tab reopens on reload (tab_project.js)

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function ours(k) { return LS_PREFIXES.some(function (p) { return String(k).indexOf(p) === 0; }); }
    function keysOf(st) { var out = []; try { for (var i = 0; i < st.length; i++) out.push(st.key(i)); } catch (_) {} return out; }

    // ---- pure: what to wipe -------------------------------------------------------------------
    // state: { ls: [keys], ss: [keys], dbs: [names], current: cloud project id open here, autosaveProject,
    //          lastgoodProject, ring: [{ slot, name }] } ; target: { all: true } | { project: id, name }
    function plan(state, target) {
        var p = { ls: [], ss: [], dbs: [], kv: [], ringSlots: [], reload: false };
        if (target.all) {
            p.ls = (state.ls || []).filter(ours);
            p.ss = (state.ss || []).filter(ours);
            p.dbs = IDB_FIXED.concat((state.dbs || []).filter(function (d) { return d.indexOf(CRDT_PREFIX) === 0; }));
            p.reload = true;
            return p;
        }
        var id = target.project;
        p.dbs = [CRDT_PREFIX + id];
        // the working copies hold whatever project is open: they go when that project is the one erased
        var open = state.current === id || state.autosaveProject === id;
        if (open) { p.kv = PROJECT_KEYS.slice(); p.ls = PROJECT_KEYS.filter(function (k) { return (state.ls || []).indexOf(k) >= 0; }); p.ss = (state.ss || []).indexOf(TAB_PIN) >= 0 ? [TAB_PIN] : []; p.reload = true; }
        else if (state.lastgoodProject === id) { p.kv = PROJECT_KEYS.slice(2, 4); p.ls = PROJECT_KEYS.slice(2, 4).filter(function (k) { return (state.ls || []).indexOf(k) >= 0; }); }
        // recovery generations: every one of the project open now, and any other that carries its name
        p.ringSlots = (state.ring || []).filter(function (r) { return open || (target.name && r.name === target.name); }).map(function (r) { return r.slot; });
        return p;
    }

    // ---- what is on this device now -------------------------------------------------------------
    function _kv() { try { return (typeof SLDB !== 'undefined' && SLDB && SLDB.available && SLDB.available()) ? SLDB : null; } catch (_) { return null; } }
    async function state() {
        var s = { ls: keysOf(window.localStorage), ss: keysOf(window.sessionStorage), dbs: [], current: null, autosaveProject: null, lastgoodProject: null, ring: [] };
        try { if (indexedDB && indexedDB.databases) s.dbs = (await indexedDB.databases()).map(function (d) { return d.name; }).filter(Boolean); } catch (_) {}
        try { s.current = (typeof _activeCloudProjectId !== 'undefined' && _activeCloudProjectId) || null; } catch (_) {}
        var meta = function (raw) { try { var m = typeof raw === 'string' ? JSON.parse(raw) : raw; return (m && m.cloudProjectId) || null; } catch (_) { return null; } };
        var db = _kv();
        try { s.autosaveProject = meta(localStorage.getItem('safetyLab.autosave.meta.v1')) || (db ? meta(await db.get('safetyLab.autosave.meta.v1')) : null); } catch (_) {}
        try { s.lastgoodProject = meta(localStorage.getItem('safetyLab.autosave.lastgood.meta.v1')) || (db ? meta(await db.get('safetyLab.autosave.lastgood.meta.v1')) : null); } catch (_) {}
        try { if (db) { var r = await db.get(RING_META); if (typeof r === 'string') r = JSON.parse(r); s.ring = Array.isArray(r) ? r : []; } } catch (_) {}
        return s;
    }
    function _drop(name) {
        return new Promise(function (res) {
            try {
                var r = indexedDB.deleteDatabase(name);
                r.onsuccess = function () { res('deleted'); };
                r.onerror = function () { res('failed'); };
                // still open in this page: the deletion waits and completes as the page reloads (it is queued, not dropped)
                r.onblocked = function () { res('queued'); };
            } catch (_) { res('failed'); }
        });
    }
    // ---- stop every writer before the copies go ------------------------------------------------
    // The page still holds the erased project in memory. Without this, the autosave, the closing flush, the cloud
    // push and the tab pin would write it straight back (into this device, or into a new cloud project) as the
    // page reloads. One latch, read by cloud_sync.js, cloud_writer.js and tab_project.js; the autosave has its own.
    function halt() {
        try { window.__slabErasing = true; } catch (_) {}
        try { _autosaveSuspended = true; } catch (_) {}      // bindings_modules.js: scheduleAutosave and the closing flush both stop on it
        try { _autosavePending = false; } catch (_) {}
        try { if (window.SLSaveState && typeof window.SLSaveState._allowUnload === 'function') window.SLSaveState._allowUnload(true); } catch (_) {}   // no "leave without saving?" over an erased project
    }
    function isOpen(id) {
        try { if (typeof _activeCloudProjectId !== 'undefined' && _activeCloudProjectId === id) return true; } catch (_) {}
        try { var m = JSON.parse(localStorage.getItem('safetyLab.autosave.meta.v1') || 'null'); if (m && m.cloudProjectId === id) return true; } catch (_) {}
        return false;
    }
    async function run(p) {
        if (p.reload) halt();
        var out = { ls: 0, ss: 0, dbs: {}, kv: 0, ring: 0 };
        p.ls.forEach(function (k) { try { localStorage.removeItem(k); out.ls++; } catch (_) {} });
        p.ss.forEach(function (k) { try { sessionStorage.removeItem(k); out.ss++; } catch (_) {} });
        var db = _kv();
        if (db) {
            for (var i = 0; i < p.kv.length; i++) { try { await db.del(p.kv[i]); out.kv++; } catch (_) {} }
            if (p.ringSlots.length) {
                try {
                    for (var j = 0; j < p.ringSlots.length; j++) { await db.del(RING_KEY(p.ringSlots[j])); out.ring++; }
                    var m = await db.get(RING_META); if (typeof m === 'string') m = JSON.parse(m);
                    if (Array.isArray(m)) await db.set(RING_META, m.filter(function (x) { return p.ringSlots.indexOf(x.slot) < 0; }));
                } catch (_) {}
            }
        }
        for (var k = 0; k < p.dbs.length; k++) out.dbs[p.dbs[k]] = await _drop(p.dbs[k]);
        return out;
    }
    async function wipeAll() { return run(plan(await state(), { all: true })); }
    async function wipeProject(id, name) { var p = plan(await state(), { project: id, name: name }); var r = await run(p); r.reload = p.reload; return r; }

    // ---- the certificate, as a file a person keeps ----------------------------------------------
    function certText(c) {
        var lines = ['SAFETY LAB AERO', 'CERTIFICATE OF DESTRUCTION', '',
            'Certificate ID:   ' + (c.certificate_id || c.id || ''),
            'What was erased:  ' + (c.scope === 'account' ? 'An account and all its data' : 'Project "' + (c.target_name || '') + '"'),
            'Erased by:        ' + (c.issued_by_email || ''),
            'Issued:           ' + (c.issued_at || new Date().toISOString()),
            'SHA-256 manifest: ' + (c.manifest_sha256 || ''),
            'Backups expire:   ' + (c.complete_at ? String(c.complete_at).slice(0, 10) + ' (the last copy in a database backup or at the model provider is gone by then)' : 'see the retention policy'),
            '', 'What was removed (counts only; this certificate never holds the content):'];
        var d = c.deleted_counts || (c.manifest && c.manifest.deleted) || {};
        Object.keys(d).sort().forEach(function (k) { lines.push('  ' + (k + ':').padEnd(28) + d[k]); });
        lines.push('', 'Copies on the device where the erasure was made were cleared too. Files saved to disk by hand',
            'are the owner\'s own and are not touched by an erasure.', '',
            'The manifest hash is recorded by the database that held the data. Keep this file with your records.');
        return lines.join('\n') + '\n';
    }
    function saveCert(c) {
        try {
            var blob = new Blob([certText(c)], { type: 'text/plain' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'Certificate of destruction ' + String(c.certificate_id || c.id || '').slice(0, 8) + '.txt';
            document.body.appendChild(a); a.click(); setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (_) {} }, 1000);
            return true;
        } catch (_) { return false; }
    }

    // ---- account page: the certificates this person was issued ----------------------------------
    async function mount(id) {
        var el = document.getElementById(id); if (!el) return;
        var client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
        if (!client) { el.innerHTML = ''; return; }
        try {
            var r = await client.from('destruction_certificates').select('id, scope, target_name, deleted_counts, manifest_sha256, issued_by_email, issued_at, complete_at').order('issued_at', { ascending: false }).limit(50);
            if (r.error) throw r.error;
            var rows = r.data || [];
            el._rows = rows;
            el.innerHTML = '<div style="font-size:12px;font-weight:600;color:var(--color-text-primary,#111);">Certificates of destruction</div>'
                + (rows.length ? rows.map(function (c, i) {
                    return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;margin-top:6px;"><span>' + esc(c.scope === 'project' ? 'Project "' + (c.target_name || '') + '"' : c.scope) + ', ' + esc(String(c.issued_at || '').slice(0, 10)) + '</span>'
                        + '<button type="button" data-cert="' + i + '" style="border:1px solid var(--color-border-hair,rgba(0,0,0,.15));background:transparent;color:var(--color-text-primary,#111);border-radius:8px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer;">Save</button></div>';
                }).join('') : '<div style="font-size:12px;color:var(--color-text-primary,#111);margin-top:4px;">None. A certificate is issued each time you erase a project.</div>');
            el.onclick = function (e) { var b = e.target.closest('[data-cert]'); if (b) saveCert(el._rows[+b.dataset.cert]); };
        } catch (e) { el.innerHTML = '<div style="font-size:12px;">Certificates of destruction could not be loaded: ' + esc((e && e.message) || e) + '</div>'; }
    }

    // ---- erasing a project (owner or admin, from the archive list) ------------------------------
    async function eraseProject(projectId, projectName) {
        var client = (typeof getSupabaseClient === 'function') ? getSupabaseClient() : null;
        if (!client || !projectId) return;
        var m;
        try { var dry = await client.rpc('erase_project', { p_project_id: projectId, p_confirm: false }); if (dry.error) throw dry.error; m = (dry.data && dry.data.manifest) || {}; }
        catch (e) { try { showToast('Could not work out what would be erased: ' + ((e && e.message) || e), 'warning', 6000); } catch (_) {} return; }
        var d = m.deleted || {}, nm = projectName || m.project_name || 'this project';
        var label = { project_documents: 'saved project documents', project_document_versions: 'earlier versions', yjs_documents: 'co-editing records', project_crdt: 'co-editing snapshots', project_baselines: 'baselines', reviews: 'reviews', review_assignments: 'review assignments', review_comments: 'review comments', signoffs: 'sign-offs', change_journal: 'change journal entries', problem_report_events: 'problem report events', feedback: 'feedback notes', ai_org_cache: 'AI answers cached for it', notification_log: 'notifications', edit_locks: 'edit locks' };
        var ov = document.createElement('div');
        ov.id = 'erase-project-modal';
        ov.style.cssText = 'position:fixed;inset:0;z-index:2147483640;display:flex;align-items:center;justify-content:center;background:rgba(8,12,20,.6);padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
        ov.innerHTML = '<div style="background:var(--color-surface-1,#fff);color:var(--color-text-primary,#111);border-radius:14px;width:min(500px,96vw);box-shadow:0 24px 64px rgba(0,0,0,.4);overflow:hidden;">'
            + '<div id="ep-body" style="padding:18px 20px 10px;"><div style="font-size:16px;font-weight:800;color:#b91c1c;">Erase "' + esc(nm) + '" permanently</div>'
            + '<div style="font-size:12.5px;margin-top:8px;line-height:1.5;">This cannot be undone or restored. For everyone in the workspace it removes:</div>'
            + '<ul style="font-size:12.5px;margin:6px 0 0;padding-left:18px;line-height:1.6;">' + Object.keys(d).filter(function (k) { return d[k] > 0; }).map(function (k) { return '<li><b>' + esc(d[k]) + '</b> ' + esc(label[k] || k) + '</li>'; }).join('') + '<li>the project itself</li></ul>'
            + '<div style="font-size:12px;margin-top:10px;line-height:1.45;">You get a certificate of destruction. The copies on this device are cleared too; files saved to disk by hand are yours and are not touched.</div>'
            + '<div style="font-size:12px;margin-top:12px;">Type <b>DELETE</b> to confirm:</div><input id="ep-confirm" type="text" autocomplete="off" style="margin-top:6px;width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #e4e8f1;border-radius:9px;font:inherit;font-size:14px;">'
            + '<div id="ep-msg" style="font-size:12px;min-height:14px;margin-top:8px;"></div></div>'
            + '<div id="ep-foot" style="display:flex;justify-content:flex-end;gap:10px;padding:12px 20px;border-top:1px solid rgba(0,0,0,.08);"><button type="button" id="ep-cancel" style="border:1px solid rgba(0,0,0,.15);background:transparent;color:inherit;border-radius:9px;padding:8px 16px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>'
            + '<button type="button" id="ep-go" disabled style="border:none;background:#fca5a5;color:#fff;border-radius:9px;padding:8px 18px;font:inherit;font-size:13px;font-weight:700;cursor:not-allowed;">Erase permanently</button></div></div>';
        document.body.appendChild(ov);
        var close = function () { try { ov.remove(); } catch (_) {} };
        var inp = ov.querySelector('#ep-confirm'), go = ov.querySelector('#ep-go'), msg = ov.querySelector('#ep-msg');
        ov.querySelector('#ep-cancel').onclick = close;
        ov.addEventListener('mousedown', function (e) { if (e.target === ov && !ov._erased) close(); });
        inp.oninput = function () { var ok = inp.value.trim() === 'DELETE'; go.disabled = !ok; go.style.background = ok ? '#dc2626' : '#fca5a5'; go.style.cursor = ok ? 'pointer' : 'not-allowed'; };
        try { inp.focus(); } catch (_) {}
        go.onclick = async function () {
            if (inp.value.trim() !== 'DELETE') return;
            go.disabled = true; go.textContent = 'Erasing…';
            try {
                var res = await client.rpc('erase_project', { p_project_id: projectId, p_confirm: true });
                if (res.error) throw res.error;
                if (isOpen(projectId)) halt();
                var cert = Object.assign({ scope: 'project', target_name: nm, deleted_counts: d, issued_at: new Date().toISOString() }, res.data || {});
                ov._erased = true;
                var wipe = await wipeProject(projectId, nm);
                ov.querySelector('#ep-body').innerHTML = '<div style="font-size:16px;font-weight:800;color:#15803d;">"' + esc(nm) + '" is erased</div>'
                    + '<div style="font-size:11.5px;margin-top:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;color:#111;"><b>Certificate of destruction</b><br>ID: ' + esc(cert.certificate_id || '') + '<br>SHA-256: <span style="word-break:break-all;">' + esc(cert.manifest_sha256 || '') + '</span></div>'
                    + '<div style="font-size:12px;margin-top:8px;">Kept on your account page too. Cleared on this device: ' + esc(Object.keys(wipe.dbs).length + wipe.kv + wipe.ls) + ' stored item(s).</div>';
                ov.querySelector('#ep-foot').innerHTML = '<button type="button" id="ep-save" style="border:1px solid rgba(0,0,0,.15);background:transparent;color:inherit;border-radius:9px;padding:8px 16px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;">Save certificate</button><button type="button" id="ep-done" style="border:none;background:var(--color-accent,#4E63D8);color:#fff;border-radius:9px;padding:8px 18px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;">Done</button>';
                ov.querySelector('#ep-save').onclick = function () { saveCert(cert); };
                ov.querySelector('#ep-done').onclick = function () { close(); if (wipe.reload) { try { location.reload(); } catch (_) {} } else { try { if (typeof _renderArchivedProjects === 'function') _renderArchivedProjects(); } catch (_) {} } };
            } catch (e) { go.disabled = false; go.textContent = 'Erase permanently'; msg.style.color = '#c0392b'; msg.textContent = 'Erasure failed: ' + ((e && e.message) || e); }
        };
        return ov;
    }

    window.SLErasure = { plan: plan, state: state, run: run, halt: halt, isOpen: isOpen, wipeAll: wipeAll, wipeProject: wipeProject, certText: certText, saveCert: saveCert, mount: mount, eraseProject: eraseProject,
        LS_PREFIXES: LS_PREFIXES, IDB_FIXED: IDB_FIXED, CRDT_PREFIX: CRDT_PREFIX, PROJECT_KEYS: PROJECT_KEYS, TAB_PIN: TAB_PIN };
})();

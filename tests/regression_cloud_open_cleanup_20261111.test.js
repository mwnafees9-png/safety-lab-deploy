#!/usr/bin/env node
/*
 * Regression: the load clean-ups reach a shared cloud project, and a save never fails silently (11 Nov 2026:
 * load_repair.js 1.0, fta_dedupe.js 1.1, stale_revive.js 1.1, crdt_sync.js, cloud_writer.js 1.2, save_state.js).
 *
 * WHAT HAPPENED (live team data, 10 Nov 2026): a shared cloud project still held 11 duplicate fault trees (43 pages
 *   where 32 belong) and 6 aircraft trees falsely flagged obsolete, days after the clean-ups shipped and dozens of
 *   opens and saves later. Causes: (1) both clean-ups hooked _applyProjectData, and open-from-cloud goes through
 *   _restoreProjectSnapshot; (2) the live shared copy is pulled over the model afterwards and nothing cleaned again.
 *   On 9 Nov one user's browser also stopped saving for about half an hour and nothing said so: the live shared
 *   copy's save returned on an error and swallowed a throw, and the saved copy's writer could wait for ever.
 * HOW THIS TESTS IT: the real app in a browser, signed in to a fake cloud kept in this process (project_documents,
 *   project_crdt, projects), the real Yjs, the real open-from-cloud path, a fresh browser profile per opening.
 *   The project is made up (5 aircraft and 26 system failure conditions), dirtied the way the live one was.
 * CHECKS:
 *   [A] the dirty project, seeded into the live shared copy by an opening with the clean-ups switched off: 43, 11, 6.
 *   [B] opened on this build: 32 pages, no copy, no false flag, the 11 copies in the retired list once each, the
 *       originals untouched, history and change log entries; then the live shared copy and the saved copy are both
 *       written clean (32 pages) without anyone doing anything.
 *   [C] what the live shared copy itself holds (opened with the clean-ups off): 32 pages, no flag.
 *   [U] a teammate on an older build puts a copy back: it is cleaned up here shortly after it arrives.
 *   [S] the live shared copy's save fails (an error, a thrown error, no answer): "Not saved for your team", tried
 *       again, logged; when the cloud is back it is saved, the state clears and that is logged too.
 *   [W] the saved copy's writer: a request that never answers fails after the time limit and the next save goes through.
 *   [D] opened again (fresh profile, then the same profile with its local copy): still 32 and clean.
 *   [N] live sync off: open from the cloud alone cleans up.
 *   [E] two screens clean up the same dirty project at once and both results meet: the merged event is there once.
 *   [P] pins and load order.
 * MUTATION PROOFS (SL_CLEAN_MUTATE): nolive, nocloudopen, noliveupdate, twice, freshids, noflagrepair, notold,
 *   noretry, nolog, notimeout, nowritertimeout. Each turns this red.
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_cloud_open_cleanup_20261111.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
const pw = require('playwright');
const REPO = path.join(__dirname, '..'), SITE = path.join(REPO, 'site');
const MUT = process.env.SL_CLEAN_MUTATE || '';
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '  -- ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 700) : '')); } };
const tick = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await f()) return true; } catch (_) {} await tick(250); } return false; };

function mutate(file, body) {
    if (!MUT) return body;
    let s = body.toString('utf8');
    const rep = (a, b) => { if (s.indexOf(a) < 0) throw new Error('mutation anchor missing in ' + file + ': ' + a.slice(0, 70)); s = s.replace(a, b); };
    if (file === 'crdt_sync.js') {
        if (MUT === 'nolive') rep("if (opts && opts.load) LR.run('live-copy');", "if (false) LR.run('live-copy');");
        if (MUT === 'noliveupdate') rep("else if (typeof LR.soon === 'function') LR.soon('live-update');", '');
        if (MUT === 'notold') rep('    _saveTell(false, why);\n', '');
        if (MUT === 'noretry') rep("    _scheduleSave(_ms('SL_CRDT_SAVE_RETRY_MS', wait));\n", '');
        if (MUT === 'nolog') rep("_saveJournal('save-failed',", "(function () {})('save-failed',");
        if (MUT === 'notimeout') rep("timer = setTimeout(function () { finish(false, 'the cloud did not answer within '", "timer = setTimeout(function () { if (false) finish(false, 'the cloud did not answer within '");
    }
    if (file === 'load_repair.js') { if (MUT === 'nocloudopen') rep("b = _wrap('_restoreProjectSnapshot', 'cloud-open')", 'b = true'); }
    if (file === 'fta_dedupe.js') {
        if (MUT === 'twice') rep("var listed = pc.retiredDuplicateTrees.some(function (r) { return r && r.page && String(r.page.id) === String(copy.id); });", 'var listed = false;');
        if (MUT === 'freshids') { rep('if (x.id == null || taken[String(x.id)]) {', 'if (true) {'); rep("if (orig.root.children.some(function (c) { return c && c.mergedFrom === copyId", "if (false && orig.root.children.some(function (c) { return c && c.mergedFrom === copyId"); }
    }
    if (file === 'stale_revive.js') { if (MUT === 'noflagrepair') rep("try { r = repairAircraftTrees(); } catch (e) { try { console.warn('[stale_revive] repair', e); } catch (_) {} }", ''); }
    if (file === 'cloud_writer.js') { if (MUT === 'nowritertimeout') rep("e.code = 'timeout'; rej(e); }, ms);", "e.code = 'timeout'; }, ms);"); }
    return Buffer.from(s, 'utf8');
}

// ---- the fake cloud (this process) ------------------------------------------------------------------------------------
function makeCloud() {
    const db = { project_documents: [], project_crdt: [], projects: [], log: [], fail: {} };
    const match = (row, filters) => (filters || []).every(f => String(row[f[0]]) === String(f[1]));
    db.count = k => db.log.filter(x => x === k).length;
    db.call = function (c) {
        const t = c.table, key = c.op + ':' + t; db.log.push(key);
        const f = db.fail[key];
        if (f === 'throw') throw new Error('Failed to fetch');
        if (f === 'hang') return { __hang: true };
        if (f === 'error') return { data: null, error: { message: 'the database is not available', code: '503' } };
        if (!Array.isArray(db[t])) return { data: c.op === 'select' ? (c.single ? null : []) : null, error: null };
        const rows = db[t];
        if (c.op === 'select') { const hit = rows.filter(r => match(r, c.filters)); return { data: c.single ? (hit[0] || null) : hit, error: null }; }
        if (c.op === 'insert') { rows.push(Object.assign({}, c.values)); return { data: [c.values], error: null }; }
        if (c.op === 'upsert') { const k = (c.opts && c.opts.onConflict) || 'project_id'; const i = rows.findIndex(r => String(r[k]) === String(c.values[k])); if (i >= 0) Object.assign(rows[i], c.values); else rows.push(Object.assign({}, c.values)); return { data: null, error: null }; }
        if (c.op === 'update') { const hit = rows.filter(r => match(r, c.filters)); hit.forEach(r => Object.assign(r, c.values)); return { data: hit.map(r => ({ version: r.version })), error: null }; }
        if (c.op === 'delete') { for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], c.filters)) rows.splice(i, 1); return { data: null, error: null }; }
        return { data: null, error: null };
    };
    return db;
}
// in the page, before the app: a client that talks to the fake cloud
function pageFake() {
    function builder(table) {
        var c = { table: table, op: 'select', values: null, filters: [], single: false, opts: null };
        var b = {
            select: function () { return b; },
            insert: function (v) { c.op = 'insert'; c.values = v; return b; },
            upsert: function (v, o) { c.op = 'upsert'; c.values = v; c.opts = o || null; return b; },
            update: function (v) { c.op = 'update'; c.values = v; return b; },
            delete: function () { c.op = 'delete'; return b; },
            eq: function (k, v) { c.filters.push([k, v]); return b; },
            maybeSingle: function () { c.single = true; return b; },
            single: function () { c.single = true; return b; },
            then: function (res, rej) { return window.__cloudCall(JSON.stringify(c)).then(function (s) { var r = JSON.parse(s); if (r && r.__throw) throw new Error(r.__throw); if (r && r.__hang) return new Promise(function () {}); return r; }).then(res, rej); },
            catch: function (rej) { return b.then(undefined, rej); }
        };
        ['neq', 'in', 'is', 'order', 'limit', 'range', 'gt', 'gte', 'lt', 'lte', 'or', 'not', 'filter', 'match', 'contains', 'like', 'ilike', 'abortSignal', 'throwOnError', 'returns'].forEach(function (m) { b[m] = function () { return b; }; });
        return b;
    }
    function channel() {
        var ch = { on: function () { return ch; }, subscribe: function (cb) { setTimeout(function () { try { if (cb) cb('SUBSCRIBED'); } catch (_) {} }, 10); return ch; },
            send: function () { return Promise.resolve('ok'); }, unsubscribe: function () { return Promise.resolve('ok'); }, track: function () { return Promise.resolve('ok'); }, untrack: function () { return Promise.resolve('ok'); }, presenceState: function () { return {}; } };
        return ch;
    }
    var user = { id: '00000000-0000-4000-8000-000000000001', email: 'engineer@example.test', user_metadata: { full_name: 'Test Engineer' } };
    var session = { user: user, access_token: 'x', expires_at: Math.floor(Date.now() / 1000) + 36000 };
    window.__fakeSession = session;
    window.__fakeClient = {
        from: builder, channel: channel, removeChannel: function () { return Promise.resolve('ok'); }, removeAllChannels: function () { return Promise.resolve([]); }, getChannels: function () { return []; },
        rpc: function () { return Promise.resolve({ data: null, error: null }); },
        functions: { invoke: function () { return Promise.resolve({ data: null, error: null }); } },
        storage: { from: function () { return { upload: function () { return Promise.resolve({ data: null, error: null }); }, download: function () { return Promise.resolve({ data: null, error: null }); }, list: function () { return Promise.resolve({ data: [], error: null }); } }; } },
        auth: { getSession: function () { return Promise.resolve({ data: { session: session }, error: null }); }, getUser: function () { return Promise.resolve({ data: { user: user }, error: null }); },
            onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; }, signOut: function () { return Promise.resolve({ error: null }); },
            mfa: { listFactors: function () { return Promise.resolve({ data: { all: [], totp: [] }, error: null }); }, getAuthenticatorAssuranceLevel: function () { return Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }); } } },
        realtime: { setAuth: function () {} }
    };
}
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
const CSP = (() => { const w = fs.readFileSync(path.join(REPO, 'worker.js'), 'utf8'); const m = /const CSP_POLICY = \[([\s\S]*?)\]\.join\('; '\)/.exec(w); return eval('[' + m[1] + ']').join('; '); })();

// what every opening switches off (not under test here) and the short waits that keep the test quick
const QUIET = () => { window.SL_VERIFY_SYNC_OFF = true; window.SL_IDP_SEED_OFF = true; window.SL_CRDT_SAVE_WAIT_MS = 400; };
// an opening the way an older build behaved: no clean-up at all
const OLD = () => { window.SL_VERIFY_SYNC_OFF = true; window.SL_IDP_SEED_OFF = true; window.SL_CRDT_SAVE_WAIT_MS = 400; window.SL_FTA_DEDUPE_OFF = true; window.SL_STALE_REVIVE_OFF = true; };
const FAST = () => { window.SL_CRDT_SAVE_RETRY_MS = 500; window.SL_CRDT_SAVE_TIMEOUT_MS = 1200; window.SL_CLOUD_REQ_TIMEOUT_MS = 1500; };
const NOSYNC = () => { try { localStorage.setItem('SLA_CRDT', '0'); } catch (_) {} };

(async function main() {
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); } try { b = mutate(path.basename(f), b); } catch (e) { console.log('  FAIL  ' + e.message); fail++; } r.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }, f.endsWith('.html') ? { 'Content-Security-Policy': CSP } : {})); r.end(b); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const browser = await pw.chromium.launch();
    const cloud = makeCloud();
    const PID = '11111111-2222-4333-8444-555555555555';
    const errs = [];
    async function openApp(inits, context) {
        const ctx = context || await browser.newContext({ viewport: { width: 1500, height: 950 } });
        const pg = await ctx.newPage(); pg.ctx = ctx;
        pg.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 200))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.exposeFunction('__cloudCall', s => { try { return JSON.stringify(cloud.call(JSON.parse(s))); } catch (e) { return JSON.stringify({ __throw: String(e.message || e) }); } });
        await pg.addInitScript(pageFake);
        for (const f of inits) await pg.addInitScript(f);
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await pg.waitForFunction(() => typeof window._loadCloudProject === 'function' && typeof window.SafetyLabCRDT === 'object' && !!window.SLFtaDedupe && !!window.SLStaleRevive && typeof window.setActiveWorkspaceId === 'function', null, { timeout: 90000 });
        await tick(2500);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(() => {
            _supabaseClient = window.__fakeClient; _supabaseSession = window.__fakeSession; setActiveWorkspaceId('ws-test-1');
            window.__jr = []; const j = window.jrnl; window.jrnl = function (k, m) { window.__jr.push({ k: k, m: String(m) }); return typeof j === 'function' ? j.apply(this, arguments) : undefined; };
        });
        return pg;
    }
    const openProject = (pg) => pg.evaluate(id => _loadCloudProject(id), PID);
    const look = pg => pg.evaluate(() => ({
        pages: ftaPages.length, ids: ftaPages.map(p => p.id),
        copies: ftaPages.filter(p => /-mw88sos[hi]$|-zz9old$/.test(p.id)).length,
        flagged: ftaPages.filter(p => p.obsolete).length, review: ftaPages.filter(p => p.dupReview).length,
        retired: ((projectConfig || {}).retiredDuplicateTrees || []).map(r => r.page.id),
        history: ftaPages.filter(p => Array.isArray(p.obsoleteHistory) && p.obsoleteHistory.length).length,
        roots: ftaPages.filter(p => p.autoFcTree).reduce((m, p) => { m[p.id] = JSON.stringify(p.root); return m; }, {}),
        extra: ftaPages.reduce((n, p) => n + (function w(x) { return !x ? 0 : ((x.name === 'Extra event the copy holds' ? 1 : 0) + (x.children || []).reduce((a, c) => a + w(c), 0)); })(p.root), 0),
        indicator: (document.getElementById('save-indicator-text') || {}).textContent || '', team: window.SLSaveState.teamFail(), repair: window.SLLoadRepair ? window.SLLoadRepair.last() : null,
        jr: window.__jr.map(x => x.k)
    }));

    try {
        // ===== the made-up project, then dirtied the way the live one was ============================================
        let pg = await openApp([OLD]);
        const made = await pg.evaluate(() => {
            const ac = []; for (let i = 1; i <= 5; i++) ac.push({ internalId: 'acrow' + i, fcId: 'FC-0' + i, fcDesc: 'Test aircraft condition ' + i, subId: i <= 3 ? 'AF-01' : 'AF-02', severity: 'Hazardous', phases: 'Cruise' });
            const fha = []; for (let i = 1; i <= 26; i++) { const n = String(i).padStart(2, '0'); fha.push({ internalId: 'sysrow' + i, fcId: 'SF' + n + '.1', fcDesc: 'Test system condition ' + i, subId: 'F' + n, severity: 'Hazardous', acTrace: 'FC-0' + (1 + (i % 5)), phases: 'Cruise' }); }
            const data = _snapshotProject();
            data.acFhaData = ac; data.acFunctionsData = [{ subId: 'AF-01', name: 'Test function one' }, { subId: 'AF-02', name: 'Test function two' }];
            data.acExtractedFCs = ac.map(r => ({ id: r.fcId, desc: r.fcDesc, subId: r.subId }));
            data.systemsData = [{ id: 'sys-7', name: 'Test System', functions: [], fcim: [], req: [], fha: fha }];
            data.ftaPages = []; data.projectName = 'Cleanup test';
            _applyProjectData(JSON.parse(JSON.stringify(data)));
            SLFcTrees.sweep({ quiet: true });
            const clean = JSON.parse(JSON.stringify(_snapshotProject()));
            const clone = x => JSON.parse(JSON.stringify(x));
            const orig = ftaPages.filter(p => p.autoFcTree);
            const pick = orig.filter(p => p.treeLevel === 'aircraft').concat(orig.filter(p => p.treeLevel === 'system').slice(0, 6));
            pick.forEach((p, i) => {
                const c = clone(p); c.id = p.id + (i < 3 ? '-mw88sosh' : '-mw88sosi'); c.autoFcTree.at = '2026-11-08T19:45:49.697Z';
                (function w(n) { n.id = internalIdCounter++; n.logicalId = n.id; (n.children || []).forEach(w); })(c.root);
                // one system copy holds an event its original lacks: it must be merged, once
                if (i === 5) { const id = internalIdCounter++; c.root.children = c.root.children || []; c.root.children.push({ id: id, logicalId: id, type: 'basic', name: 'Extra event the copy holds', displayId: 'BE-' + id, children: [] }); }
                ftaPages.push(c);
            });
            ftaPages.forEach(p => { if (/FC-0[123]/.test(p.id)) { p.obsolete = true; p.obsoleteReason = 'Parent function Test system function removed'; p.obsoletedAt = '2026-11-08T20:54:44.681Z'; } });
            return { clean: clean, dirty: JSON.parse(JSON.stringify(_snapshotProject())), mergeInto: pick[5].id, topGate: pick[5].root.type + ':' + (pick[5].root.gateType || '') };
        });
        const cleanPages = made.clean.ftaPages.length;
        const resetCloud = (state) => {
            cloud.projects.length = 0; cloud.projects.push({ id: PID, workspace_id: 'ws-test-1', name: 'Cleanup test' });
            cloud.project_documents.length = 0; cloud.project_documents.push({ project_id: PID, data: JSON.parse(JSON.stringify(made.dirty)), version: 167, updated_at: new Date().toISOString() });
            cloud.project_crdt.length = 0; if (state) cloud.project_crdt.push({ project_id: PID, state: state, updated_at: new Date().toISOString() });
        };
        resetCloud(null);
        await openProject(pg);
        await until(() => cloud.project_crdt.length > 0 && String(cloud.project_crdt[0].state || '').length > 20000, 30000);
        await tick(1500);
        const a = await look(pg);
        const stateA = (cloud.project_crdt[0] || {}).state || '';
        check('[A] the made-up project: ' + cleanPages + ' pages where 32 belong (1 blank, 5 aircraft, 26 system trees)', cleanPages === 32, cleanPages);
        check('[A] dirtied and seeded into the live shared copy with the clean-ups off: 43 pages, 11 copies, 6 flagged, saved to the cloud', a.pages === 43 && a.copies === 11 && a.flagged === 6 && stateA.length > 20000, { pages: a.pages, copies: a.copies, flagged: a.flagged, state: stateA.length });
        await pg.ctx.close();

        // ===== [B] opened on this build ==================================================================================
        const upBefore = cloud.count('upsert:project_crdt');
        pg = await openApp([QUIET, FAST]);
        await openProject(pg);
        await until(async () => (await look(pg)).pages === 32, 8000);
        let b = await look(pg);
        check('[B] opened from the cloud with the live shared copy: 32 pages, no copy left', b.pages === 32 && b.copies === 0, { pages: b.pages, copies: b.copies, repair: b.repair });
        check('[B] no aircraft tree is flagged obsolete any more, and each of the 3 real ones keeps the history of the flag', b.flagged === 0 && b.history === 3, { flagged: b.flagged, history: b.history });
        check('[B] the 11 copies are in the retired list, each once (nothing deleted)', b.retired.length === 11 && new Set(b.retired).size === 11 && b.retired.every(id => /-mw88sos[hi]$/.test(id)), b.retired);
        const origSame = made.clean.ftaPages.filter(p => p.autoFcTree && p.id !== made.mergeInto).every(p => b.roots[p.id] === JSON.stringify(p.root));
        check('[B] every original tree is as it was (the one that takes the merged event aside)', origSame);
        check('[B] the event only the copy held is in the original, once (top gate ' + made.topGate + ')', b.extra === 1 && /Extra event the copy holds/.test(b.roots[made.mergeInto] || ''), b.extra);
        check('[B] the change log says what was tidied and what was cleared', b.jr.filter(k => k === 'tree-duplicate-retired').length === 11 && b.jr.filter(k => k === 'tree-obsolete-cleared').length >= 3, b.jr.filter(k => /tree-/.test(k)).length);
        const savedClean = await until(() => cloud.count('upsert:project_crdt') > upBefore && cloud.project_documents[0].version > 167 && cloud.project_documents[0].data.ftaPages.length === 32, 45000);
        const doc = cloud.project_documents[0];
        check('[B] with nobody doing anything the saved copy is written clean: 32 pages, no flag, a new version', savedClean && doc.data.ftaPages.length === 32 && !doc.data.ftaPages.some(p => p.obsolete) && doc.version > 167, { v: doc.version, pages: doc.data.ftaPages.length, ups: cloud.count('upsert:project_crdt') - upBefore });
        b = await look(pg);
        check('[B] the save indicator shows no failure', !/Not saved/.test(b.indicator) && b.team === null, b.indicator);
        await tick(1500);

        // ===== [C] what the live shared copy itself holds =================================================================
        let old = await openApp([OLD]);
        await openProject(old);
        await tick(4000);
        const c = await look(old);
        check('[C] the live shared copy itself (opened with the clean-ups off): 32 pages, no copy, no flag', c.pages === 32 && c.copies === 0 && c.flagged === 0, { pages: c.pages, copies: c.copies, flagged: c.flagged });

        // ===== [U] a teammate on an older build puts a copy back ==========================================================
        const upU = cloud.count('upsert:project_crdt');
        await old.evaluate(() => {
            const p = ftaPages.find(x => x.id === 'fc-auto-ac-FC-04'); const cp = JSON.parse(JSON.stringify(p)); cp.id = p.id + '-zz9old';
            (function w(n) { n.id = internalIdCounter++; n.logicalId = n.id; (n.children || []).forEach(w); })(cp.root);
            ftaPages.push(cp);
            const back = JSON.parse(JSON.stringify(projectConfig.retiredDuplicateTrees.find(r => r.page.id === 'fc-auto-ac-FC-04-mw88sosi').page));
            ftaPages.push(back); scheduleAutosave();
        });
        await until(() => cloud.count('upsert:project_crdt') > upU, 15000);
        await tick(800);
        const teammate = cloud.project_crdt[0].state;
        await old.ctx.close();
        await pg.evaluate(s => { const u = Uint8Array.from(atob(s), ch => ch.charCodeAt(0)); window.Y.applyUpdate(window.SafetyLabCRDT._doc(), u, 'remote'); }, teammate);
        const arrived = await pg.evaluate(() => ftaPages.some(p => /-zz9old$/.test(p.id)));
        await until(async () => { const x = await look(pg); return x.pages === 32 && x.copies === 0; }, 8000);
        const u = await look(pg);
        check('[U] the copy a teammate on an older build put back arrives here, and is tidied away shortly after', arrived && u.pages === 32 && u.copies === 0 && u.retired.indexOf('fc-auto-ac-FC-04-zz9old') >= 0, { arrived: arrived, pages: u.pages, copies: u.copies, retired: u.retired.length });
        check('[U] a copy that was already retired and came back is tidied again and still listed once (12 in the list, no repeat)', u.retired.length === 12 && new Set(u.retired).size === 12, u.retired);
        await until(() => cloud.count('upsert:project_crdt') > upU + 1, 10000);

        // ===== [S] the live shared copy's save fails =======================================================================
        const edit = (txt) => pg.evaluate(t => { acFhaData[0].fcDesc = t; scheduleAutosave(); }, txt);
        const jrCount = k => pg.evaluate(kk => window.__jr.filter(x => x.k === kk).length, k);
        cloud.fail['upsert:project_crdt'] = 'error';
        let n0 = cloud.count('upsert:project_crdt');
        await edit('Edited while the cloud refuses');
        const told = await until(async () => (await look(pg)).team !== null, 8000);
        let s = await look(pg);
        check('[S] the cloud answers with an error: the indicator says "Not saved for your team. Retry", with the reason', told && /Not saved for your team\. Retry/.test(s.indicator) && /not available/.test(String(s.team)), { ind: s.indicator, team: s.team });
        check('[S] the person is warned before leaving (unsaved)', await pg.evaluate(() => window.SLSaveState.unsaved() === true));
        const logged1 = await jrCount('save-failed');
        await tick(3000);                                   // let everything else that writes settle
        cloud.fail['update:project_documents'] = 'error'; cloud.fail['select:project_documents'] = 'error';   // so nothing but the retry can cause a new attempt
        await tick(2500);
        n0 = cloud.count('upsert:project_crdt');
        await tick(4000);
        const tries = cloud.count('upsert:project_crdt') - n0;
        check('[S] it is tried again on its own, with nobody editing (three more attempts or more in four seconds)', tries >= 3, tries);
        const loggedN = await jrCount('save-failed'), attempts = await pg.evaluate(() => window.SafetyLabCRDT.saveState().fails);
        check('[S] the failure is in the change log: at once, then every fifth attempt, never once per attempt', logged1 === 1 && attempts >= 5 && loggedN === 1 + Math.floor(attempts / 5), { first: logged1, attempts: attempts, logged: loggedN });
        delete cloud.fail['update:project_documents']; delete cloud.fail['select:project_documents'];
        delete cloud.fail['upsert:project_crdt'];
        const back = await until(async () => (await look(pg)).team === null, 10000);
        s = await look(pg);
        const inCloud = await pg.evaluate(() => { const d = window.SafetyLabCRDT._doc(); return JSON.stringify(Array.from(d.getMap('col:acFhaData').values())).indexOf('Edited while the cloud refuses') >= 0; });
        check('[S] the cloud is back: saved, the indicator clears, and the recovery is in the change log', back && !/Not saved/.test(s.indicator) && (await jrCount('save-recovered')) === 1 && inCloud, { ind: s.indicator, rec: await jrCount('save-recovered') });
        cloud.fail['upsert:project_crdt'] = 'throw';
        await edit('Edited while the network is down');
        const told2 = await until(async () => (await look(pg)).team !== null, 8000);
        check('[S] the request throws (no network): said the same way', told2 && /Failed to fetch/.test(String((await look(pg)).team)), (await look(pg)).team);
        delete cloud.fail['upsert:project_crdt'];
        await until(async () => (await look(pg)).team === null, 10000);
        cloud.fail['upsert:project_crdt'] = 'hang';
        await edit('Edited while the cloud never answers');
        const told3 = await until(async () => /did not answer/.test(String((await look(pg)).team)), 10000);
        check('[S] the cloud never answers: after the time limit it is a failure, said and retried', told3, (await look(pg)).team);
        delete cloud.fail['upsert:project_crdt'];
        const back3 = await until(async () => (await look(pg)).team === null, 12000);
        check('[S] and it recovers once the cloud answers again', back3, (await look(pg)).team);

        // ===== [W] the saved copy's writer never waits for ever ============================================================
        await until(() => pg.evaluate(() => !window.SLCloudWriter.status().pending), 20000);
        await tick(1500);
        const writeOnce = () => pg.evaluate(async id => {
            const p = window.SLCloudWriter.write({ mode: 'merged', prepare: function () { return { client: getSupabaseClient(), projectId: id, userId: 'u1', snapshot: _snapshotProject() }; } });
            window.SLCloudWriter.flush();
            const t0 = Date.now();
            const r = await Promise.race([p, new Promise(res => setTimeout(() => res({ stuck: true }), 9000))]);
            return { ok: !!r.ok, reason: r.reason || null, stuck: !!r.stuck, msg: r.error ? String(r.error.message || r.error) : '', ms: Date.now() - t0 };
        }, PID);
        cloud.fail['update:project_documents'] = 'hang';
        const w1 = await writeOnce();
        check('[W] a write that never answers fails after the time limit, as an error with the reason', !w1.stuck && w1.ok === false && w1.reason === 'error' && /did not answer/.test(w1.msg), w1);
        delete cloud.fail['update:project_documents'];
        const vBefore = cloud.project_documents[0].version;
        const w2 = await writeOnce();
        check('[W] the next save goes through: the queue was not left blocked', w2.ok === true && cloud.project_documents[0].version > vBefore, { w2: w2, v: cloud.project_documents[0].version });
        await pg.ctx.close();

        // ===== [D] opened again ============================================================================================
        pg = await openApp([QUIET]);
        await openProject(pg);
        await tick(5000);
        let d = await look(pg);
        check('[D] opened again in a fresh browser profile: 32 pages, no copy, no flag, nothing new to tidy', d.pages === 32 && d.copies === 0 && d.flagged === 0 && d.retired.length === 12, { pages: d.pages, copies: d.copies, flagged: d.flagged, retired: d.retired.length });
        const ctxD = pg.ctx; await pg.close();
        pg = await openApp([QUIET], ctxD);
        await openProject(pg);
        await tick(5000);
        d = await look(pg);
        check('[D] and in the same profile, which keeps its own local copy: the same', d.pages === 32 && d.copies === 0 && d.flagged === 0 && d.retired.length === 12, { pages: d.pages, copies: d.copies, flagged: d.flagged, retired: d.retired.length });
        await pg.ctx.close();

        // ===== [L] a browser that already holds the dirty live shared copy locally ========================================
        resetCloud(stateA);
        pg = await openApp([OLD]);
        await openProject(pg);
        await tick(5000);
        const l0 = await look(pg);
        const ctxL = pg.ctx; await pg.close();
        pg = await openApp([QUIET], ctxL);
        await openProject(pg);
        await tick(1200);
        const l1 = await look(pg);
        check('[L] a browser holding the dirty copy locally (43 pages) opens it on this build: clean straight after the live copy is pulled in', l0.pages === 43 && l1.pages === 32 && l1.copies === 0 && l1.flagged === 0, { before: l0.pages, pages: l1.pages, copies: l1.copies, flagged: l1.flagged, via: l1.repair && l1.repair.via });
        await pg.ctx.close();

        // ===== [N] live sync off: open from the cloud alone ================================================================
        resetCloud(stateA);
        pg = await openApp([QUIET, NOSYNC]);
        await openProject(pg);
        await tick(3000);
        const n = await look(pg);
        const started = await pg.evaluate(() => window.SafetyLabCRDT.status().started);
        check('[N] with live sync off, opening from the cloud cleans up on its own: 32 pages, no flag, 11 retired', started === false && n.pages === 32 && n.copies === 0 && n.flagged === 0 && n.retired.length === 11, { started: started, pages: n.pages, copies: n.copies, flagged: n.flagged, via: n.repair && n.repair.via });
        await pg.ctx.close();

        // ===== [E] two screens clean up the same dirty project at once =====================================================
        const cleanOn = async () => { const p = await openApp([QUIET]); await openProject(p); await until(async () => (await look(p)).pages === 32, 8000); await until(() => cloud.project_crdt[0].state !== stateA, 15000); await tick(2500); const st = cloud.project_crdt[0].state; await p.ctx.close(); return st; };
        resetCloud(stateA); const stateX = await cleanOn();
        // the second screen was already open and had made rows of its own: its next id is not the first screen's
        resetCloud(stateA);
        const py = await openApp([OLD]);
        await openProject(py);
        await tick(4000);
        await py.evaluate(() => { internalIdCounter += 57; window.SL_FTA_DEDUPE_OFF = false; window.SL_STALE_REVIVE_OFF = false; window.SLLoadRepair.run('live-copy'); });
        await until(async () => (await look(py)).pages === 32, 8000);
        await until(() => cloud.project_crdt[0].state !== stateA, 15000); await tick(2500);
        const stateY = cloud.project_crdt[0].state; await py.ctx.close();
        check('[E] two screens each cleaned the same dirty live shared copy on their own', stateX.length > 1000 && stateY.length > 1000 && stateX !== stateA && stateY !== stateA);
        pg = await openApp([QUIET]);
        await openProject(pg);
        await tick(3000);
        await pg.evaluate(s2 => { const u2 = Uint8Array.from(atob(s2), ch => ch.charCodeAt(0)); window.Y.applyUpdate(window.SafetyLabCRDT._doc(), u2, 'remote'); }, stateX);
        await tick(3500);
        const e = await look(pg);
        check('[E] when the two results meet: still 32 pages, and the merged event is in the original once, not twice', e.pages === 32 && e.copies === 0 && e.extra === 1, { pages: e.pages, copies: e.copies, extra: e.extra });
        check('[E] the retired list holds each copy once', e.retired.length === 11 && new Set(e.retired).size === 11, e.retired.length);
        await pg.ctx.close();

        check('no page errors in any opening', errs.length === 0, errs.slice(0, 4));
    } catch (err) { check('test crashed: ' + (err && err.message), false, err && err.stack); }
    await browser.close(); srv.close();

    // ===== [P] pins and load order ========================================================================================
    const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), at = s => html.indexOf(s);
    check('[P] pins: load_repair.js 1.0 before fta_dedupe.js 1.1 and stale_revive.js 1.1, after data_ops_modules.js and helpers_modules.js', at('load_repair.js?v=1.0') > 0 && at('load_repair.js?v=1.0') < at('fta_dedupe.js?v=1.1') && at('fta_dedupe.js?v=1.1') < at('stale_revive.js?v=1.1') && at('load_repair.js?v=1.0') > at('data_ops_modules.js?v=') && at('load_repair.js?v=1.0') > at('helpers_modules.js?v='));
    check('[P] pins: crdt_sync.js 2.9, cloud_writer.js 1.4, save_state.js 3.7', at('crdt_sync.js?v=2.9') > 0 && at('cloud_writer.js?v=1.4') > 0 && at('save_state.js?v=3.7') > 0);
    const crdt = fs.readFileSync(path.join(SITE, 'crdt_sync.js'), 'utf8');
    check('[P] the live shared copy\'s save has no silent way out left', crdt.indexOf('if (res && res.error) return;') < 0 && crdt.indexOf('.catch(function () {});\n      } catch (_) {}\n    }, 5000);') < 0);
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();

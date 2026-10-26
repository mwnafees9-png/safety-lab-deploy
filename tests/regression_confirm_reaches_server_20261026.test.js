#!/usr/bin/env node
/*
 * Regression: a confirmed change reaches the server copy, and a save the server turned down is never shown as saved
 * (26 Oct 2026, Radia on its own server: "369 changes to confirm ... once you confirm those and it says changes saved it
 * does not autosave", the next open showed the old project).
 *
 * CAUSE: Confirm all pushed in the background ('silent') mode; a server copy that had moved since this tab wrote it (a
 *   teammate's save, or a reload that restored an older version number) made silent mode skip the write, and
 *   save_state.js reported that refusal as saved ('ok-team') while the live team sync ran. Never retried.
 * EXECUTED: the REAL cloud_writer.js, cloud_sync.js and save_state.js in one VM against a fake server (versioned
 *   project_documents, the compare-and-set update), Confirm all driven through the save_state hook it uses.
 *   [A] version current: the change is on the server, said "Saved" to the cloud.
 *   [B] the server copy moved, live team sync on: written over (merged), on the server, "Saved".
 *   [C] the server copy moved, no live sync: the person is asked; Overwrite puts it on the server; Load does not
 *       claim it was saved.
 *   [D] the server keeps moving (refused twice): NOT "Saved", the reason is said, an upload stays pending.
 *   [E] reload: the version this device last wrote is remembered per project, and the version restored with the
 *       autosave is never older than it (data_ops_modules.js _adoptCloudIdentityFromMeta, run as written).
 * MUTATION PROOFS: SL_CONFIRM_MUTATE=okteam (the refusal counted as saved again), =silent (the confirm saves silently
 *   again), =noremember (the written version not kept). Each turns this red.
 * Run: node tests/regression_confirm_reaches_server_20261026.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_CONFIRM_MUTATE || '';
function src(n) {
    let s = fs.readFileSync(path.join(SITE, n), 'utf8');
    if (MUT === 'okteam' && n === 'save_state.js') s = s.replace("var code = r.ok ? 'ok' : r.reason;", "var code = r.ok ? 'ok' : r.reason; if (code === 'refused' && team) code = 'current';");
    if (MUT === 'silent' && n === 'save_state.js') s = s.replace("mode: team ? 'merged' : 'silent'", "mode: 'silent'").replace("_askAfter = (code === 'refused' && !team && acc == null);", "_askAfter = false;");
    if (MUT === 'noremember' && n === 'cloud_writer.js') s = s.replace('            _rememberVersion(projectId, nextVersion);\n', '');
    return s;
}
const J = v => JSON.parse(JSON.stringify(v));

async function run(cfg) {
    const server = { doc: { version: cfg.serverVersion || 5, data: { acFhaData: [{ id: 'f1', severity: 'Major' }] } }, writes: [], moveEvery: !!cfg.keepsMoving };
    const client = {
        from(table) {
            const q = { table, filters: {}, op: 'select' };
            const api = { select() { return api; }, eq(k, v) { q.filters[k] = v; return api; }, update(o) { q.op = 'update'; q.payload = o; return api; }, insert(o) { q.op = 'insert'; q.payload = o; return api; },
                maybeSingle() { return Promise.resolve(res()); }, then(a, b) { return Promise.resolve(res()).then(a, b); } };
            function res() {
                if (table === 'projects') return q.op === 'update' ? { data: null, error: null } : { data: { id: q.filters.id }, error: null };
                if (table === 'project_documents') {
                    if (q.op === 'select') { if (server.moveEvery) server.doc.version++; return { data: { version: server.doc.version }, error: null }; }
                    if (q.op === 'update') {
                        if (server.moveEvery) server.doc.version++;   // a teammate saves again in between
                        if (q.filters.version !== server.doc.version) return { data: [], error: null };
                        server.doc = { version: q.payload.version, data: q.payload.data }; server.writes.push(q.payload.version);
                        return { data: [{ version: q.payload.version }], error: null };
                    }
                    if (q.op === 'insert') return { data: null, error: { code: '23505', message: 'duplicate' } };
                }
                return { data: null, error: null };
            }
            return api;
        }
    };
    const model = { acFhaData: [{ id: 'f1', severity: 'Major' }], projectName: 'Radia P', projectConfig: { regulation: 'Part 25' } };
    const ls = {}, asked = [];
    const ctx = {
        console: { info() {}, warn() {}, error() {}, log() {} },
        setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean, Error, parseInt, isFinite,
        navigator: { onLine: true }, SLConfig: { mode: 'self-hosted', ownServer: true, fatal: null },
        _supabaseSession: { user: { id: 'u1' } }, getSupabaseClient: () => client, getActiveWorkspaceId: () => 'ws1',
        _activeCloudProjectId: 'proj-0001', _activeCloudDocVersion: cfg.token === undefined ? 5 : cfg.token,
        _dirtySinceSave: true, _autosaveLastWrite: Date.now(), projectName: 'Radia P', _buildProjectSnapshot: () => J(model),
        showToast() {}, __slAutosaveLs: true, __slAutosaveIdb: Promise.resolve(true), addEventListener() {}, dispatchEvent() { return true; },
        document: { getElementById: () => null, querySelectorAll: () => [], addEventListener() {}, visibilityState: 'visible' },
        localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } },
        slConfirm: async (m) => { asked.push(m); return cfg.answer !== 'load'; },
        _loadCloudProject: async () => { ctx.__loaded = true; }, _bankWorkingState() {},
        // the Save to cloud the app runs (helpers_modules.js saveProjectToCloud): the writer's manual mode
        saveProjectToCloud: async () => { const r = await ctx.__slCloudSyncPushNow({ mode: 'manual' }); return !!(r && r.ok); }
    };
    ctx._writeAutosave = () => true;
    let pending = true;
    ctx.SLChangeAck = { pending: () => pending, pendingUser: () => pending, count: () => (pending ? 369 : 0), acceptedSnapshot: () => null, system: f => f(), systemAsync: f => f(), settle() {}, status: () => ({}) };
    if (cfg.crdt) ctx.SafetyLabCRDT = { status: () => ({ started: true, online: true }), release() {}, pushAccepted: () => true };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    for (const f of ['cloud_writer.js', 'cloud_sync.js', 'save_state.js']) vm.runInContext(src(f), ctx, { filename: f });
    model.acFhaData[0].severity = 'Hazardous'; pending = false;       // the person's change, now confirmed
    ctx.SLSaveState._ackClosed({}, 'kept');
    const ok = await Promise.race([ctx.SLSaveState.whenSaved(), new Promise(r => setTimeout(() => r('HUNG'), 5000))]);
    await new Promise(r => setTimeout(r, 30));
    return { ok, st: ctx.SLSaveState.status(), server, asked, ctx, ls };
}

(async function main() {
    let R = await run({ token: 5 });
    check('[A] version current: the change is on the server', R.server.writes.length === 1 && R.server.doc.data.acFhaData[0].severity === 'Hazardous', JSON.stringify(R.server.writes));
    check('[A] and it says Saved, to the cloud', R.ok === true && R.st.state === 'saved' && R.st.where === 'cloud', JSON.stringify(R.st));

    R = await run({ token: 4, crdt: true });
    check('[B] server copy moved, live team sync on: written over, the change is on the server', R.server.doc.data.acFhaData[0].severity === 'Hazardous' && R.server.writes.length === 1, JSON.stringify(R.server));
    check('[B] Saved to the cloud, nobody asked', R.ok === true && R.st.where === 'cloud' && R.asked.length === 0, JSON.stringify(R.st) + ' asked ' + R.asked.length);

    R = await run({ token: 4, answer: 'overwrite' });
    check('[C] server copy moved, no live sync: the person is asked', R.asked.length === 1 && /changed/i.test(R.asked[0]));
    check('[C] Overwrite: the change is on the server and it says Saved', R.server.doc.data.acFhaData[0].severity === 'Hazardous' && R.ok === true && R.st.where === 'cloud', JSON.stringify(R.st));
    R = await run({ token: 4, answer: 'load' });
    check('[C] Load the cloud copy: no hang (the load waits for no save of its own)', R.ok !== 'HUNG');
    check('[C] Load the cloud copy: it does not claim the change was saved to the cloud', R.server.writes.length === 0 && R.ctx.__loaded === true && !(R.st.state === 'saved' && R.st.where === 'cloud'), JSON.stringify(R.st));

    R = await run({ token: 5, crdt: true, keepsMoving: true });
    check('[D] the server keeps moving: NOT Saved, with the reason', R.ok === false && R.st.state !== 'saved' && /refused|changed/i.test(String(R.st.reasonCode) + ' ' + String(R.st.reason)), JSON.stringify(R.st));
    check('[D] nothing on the server, an upload still pending', R.server.writes.length === 0 && R.st.cloudPending !== false, JSON.stringify(R.st));

    R = await run({ token: 5 });
    check('[E] the version written is remembered for this project', R.ls['safetyLab.cloudDocVersion.proj-0001'] === '6' && R.ctx.SLCloudWriter.lastWritten('proj-0001') === 6, JSON.stringify(R.ls));
    const ds = fs.readFileSync(path.join(SITE, 'data_ops_modules.js'), 'utf8');
    const m = /function _adoptCloudIdentityFromMeta\(m\) \{[\s\S]*?\n\}\n/.exec(ds);
    check('[E] the restore function is found', !!m);
    if (m) {
        const c2 = { window: { SLCloudWriter: R.ctx.SLCloudWriter }, _activeCloudProjectId: null, _activeCloudDocVersion: null, _rtUpdatePresenceProject() {} };
        vm.createContext(c2);
        vm.runInContext('var _activeCloudProjectId = null, _activeCloudDocVersion = null; ' + m[0] + '; _adoptCloudIdentityFromMeta({ cloudProjectId: "proj-0001", cloudDocVersion: 5 }); this.out = _activeCloudDocVersion;', c2);
        check('[E] a reload restoring version 5 starts from 6, the one this device wrote', c2.out === 6, c2.out);
    }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });

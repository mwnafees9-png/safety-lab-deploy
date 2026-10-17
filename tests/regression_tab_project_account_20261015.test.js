#!/usr/bin/env node
/*
 * Regression (15 Oct 2026), found in the live AI test session:
 *  A. Reloading a tab opened the WRONG project. The browser keeps one autosave copy for all tabs; another tab
 *     (holding the write lease) had saved the Halcyon demo there, so the AI test tab reloaded into Halcyon.
 *     tab_project.js pins each tab's cloud project in sessionStorage (per tab, survives its reload) and, after
 *     the boot restore and sign-in, reopens the pinned project through openCloudProjectById when the restored
 *     copy is a different project. Same project, another account's pin, a ?project= link: nothing happens.
 *  B. That Halcyon copy (cloud id b408d862) was saved under ANOTHER account; this browser was signed in as a
 *     different one, so every push was refused ("new row violates row-level security policy for table
 *     project_documents") and retried for ever, and the "Not saved yet" dialog showed the raw database error.
 *     cloud_sync.js 2.6 reads the project row first (RLS hides another account's project): no row means the
 *     push stops with reason 'not-yours', the person is told once in plain words and offered a copy in their
 *     own workspace; an RLS refusal of the write itself does the same. save_state.js 2.2 says it plainly and
 *     does not retry. Mutations: the project row visible -> pushes as before; a network error on the check ->
 *     the write still goes ahead (a check that cannot run never blocks saving).
 * Run: node tests/regression_tab_project_account_20261015.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const tick = () => new Promise(r => setImmediate(r));

// ---------------------------------------------------------------- A. tab_project.js
function runTab(o) {
    const store = Object.assign({}, o.session || {});
    const intervals = [], opened = [];
    const ctx = {
        console, JSON, String, Date,
        sessionStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
        location: { search: o.search || '' },
        setInterval: (f) => { intervals.push(f); return intervals.length; }, clearInterval: () => {},
        addEventListener: () => {},
        openCloudProjectById: id => { opened.push(id); ctx._activeCloudProjectId = id; return true; }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext('var _supabaseSession = null; var _activeCloudProjectId = null; var _bootRecoveryHasRun = false;', ctx);
    vm.runInContext(S('tab_project.js'), ctx);
    const run = n => { for (let i = 0; i < (n || 1); i++) intervals.forEach(f => f()); };
    return { ctx, store, opened, run, set: (code) => vm.runInContext(code, ctx) };
}
const PIN = 'safetyLab.tabProject.v1';
const AI = '4457de5d-a9df-4896-abe0-e75f95ad11da', HAL = 'b408d862-620f-4435-8750-2ea55b34c728';
{
    // the live case: this tab had AI test; the shared autosave holds Halcyon from the other tab
    const t = runTab({ session: { [PIN]: JSON.stringify({ id: AI, uid: 'u-me' }) } });
    t.set("_activeCloudProjectId = '" + HAL + "';");                 // boot restore adopted the other tab's copy
    t.run(3);
    check('A1 waits for sign-in and the boot restore before doing anything', t.opened.length === 0 && t.ctx.SLTabProject.outcome() === 'waiting');
    check('A2 the pin is not overwritten by the restored copy while waiting', JSON.parse(t.store[PIN]).id === AI);
    t.set("_supabaseSession = { user: { id: 'u-me' } }; _bootRecoveryHasRun = true;");
    t.run(1);
    check('A3 reload reopens this tab\'s own project (AI test), not the copy another tab saved', t.opened.length === 1 && t.opened[0] === AI, JSON.stringify(t.opened));
    check('A4 outcome says reopened', t.ctx.SLTabProject.outcome() === 'reopened');
    t.run(5);
    check('A5 it opens once, not on every tick', t.opened.length === 1);
    t.set("_activeCloudProjectId = 'aaaaaaaa-1111-2222-3333-444444444444';");   // the person opens another project
    t.run(1);
    check('A6 afterwards the pin follows the project this tab shows', JSON.parse(t.store[PIN]).id === 'aaaaaaaa-1111-2222-3333-444444444444');
}
{
    const t = runTab({ session: { [PIN]: JSON.stringify({ id: AI, uid: 'u-me' }) } });
    t.set("_activeCloudProjectId = '" + AI + "'; _supabaseSession = { user: { id: 'u-me' } }; _bootRecoveryHasRun = true;");
    t.run(2);
    check('A7 same project restored: nothing is reopened', t.opened.length === 0 && t.ctx.SLTabProject.outcome() === 'same');
}
{
    const t = runTab({ session: { [PIN]: JSON.stringify({ id: AI, uid: 'u-other' }) } });
    t.set("_activeCloudProjectId = '" + HAL + "'; _supabaseSession = { user: { id: 'u-me' } }; _bootRecoveryHasRun = true;");
    t.run(2);
    check('A8 a pin made under another account is not opened', t.opened.length === 0 && t.ctx.SLTabProject.outcome() === 'other-account');
}
{
    const t = runTab({ session: { [PIN]: JSON.stringify({ id: AI, uid: 'u-me' }) }, search: '?project=' + HAL });
    t.set("_activeCloudProjectId = '" + HAL + "'; _supabaseSession = { user: { id: 'u-me' } }; _bootRecoveryHasRun = true;");
    t.run(2);
    check('A9 a ?project= link wins over the pin', t.opened.length === 0 && t.ctx.SLTabProject.outcome() === 'link');
}
{
    const t = runTab({});
    t.set("_activeCloudProjectId = '" + AI + "'; _supabaseSession = { user: { id: 'u-me' } }; _bootRecoveryHasRun = true;");
    t.run(2);
    check('A10 a new tab (no pin) opens nothing and starts pinning its project', t.opened.length === 0 && JSON.parse(t.store[PIN]).id === AI);
}
{
    const idx = S('index.html');
    const iC = idx.indexOf('cloud_sync.js?v=2.6'), iT = idx.indexOf('tab_project.js?v=1.0');
    check('A11 index.html loads tab_project.js once, after cloud_sync 2.6', iC > 0 && iT > iC && idx.split('tab_project.js').length === 2);
}

// ---------------------------------------------------------------- B. cloud_sync.js another-account guard
function runSync(o) {
    const asked = [], toasts = [], writes = [], queries = [];
    const client = {
        from: (t) => {
            const q = { t, eqs: [] };
            q.select = () => q; q.eq = (c, v) => { q.eqs.push([c, v]); return q; };
            q.update = () => q; q.then = (res) => Promise.resolve({ data: null, error: null }).then(res);
            q.maybeSingle = () => { queries.push(t); if (o.checkError) return Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }); return Promise.resolve({ data: o.mine ? { id: (q.eqs.find(e => e[0] === 'id') || [])[1] } : null, error: null }); };
            return q;
        }
    };
    const ctx = {
        console: { warn: () => {}, error: () => {}, info: () => {}, log: () => {} }, JSON, Object, Array, String, Date, Promise, Math,
        setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
        navigator: { onLine: true }, document: { addEventListener: () => {} }, addEventListener: () => {},
        getSupabaseClient: () => client, getActiveWorkspaceId: () => 'ws-me',
        _buildProjectSnapshot: () => ({ projectName: 'Halcyon HA-10', acFhaData: [{ internalId: 'F1' }], projectConfig: {} }),
        showToast: (m) => toasts.push(m),
        slConfirm: (m, opts) => { asked.push({ m, opts }); return Promise.resolve(false); },
        SLCloudWriter: { write: async (a) => { const job = await a.prepare(); if (!job) return { ok: false, reason: 'skipped' }; writes.push(job.projectId); return o.rls ? { ok: false, reason: 'error', error: { code: '42501', message: 'new row violates row-level security policy for table "project_documents"' } } : { ok: true, version: 2 }; }, flush: () => {} }
    };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext("var _supabaseSession = { user: { id: 'u-me' } }; var _activeCloudProjectId = '" + HAL + "'; var _activeCloudDocVersion = 1; var _dirtySinceSave = true; var _autosaveLastWrite = 100;", ctx);
    vm.runInContext(S('cloud_sync.js'), ctx);
    return { ctx, asked, toasts, writes, queries };
}
(async () => {
    {
        const s = runSync({ mine: false });
        const r = await s.ctx.__slCloudSyncPushNow({});
        await tick();
        check('B1 another account\'s project: the push stops with reason not-yours', r && r.ok === false && r.reason === 'not-yours', JSON.stringify(r));
        check('B2 nothing is written', s.writes.length === 0);
        check('B3 the person is told once, in plain words, and offered a copy in their workspace', s.asked.length === 1 && /saved in a different account/.test(s.asked[0].m) && s.asked[0].opts.okText === 'Save a copy to my workspace', JSON.stringify(s.asked));
        const r2 = await s.ctx.__slCloudSyncPushNow({}); await tick();
        check('B4 the next push stops too, without asking again or querying again', r2.reason === 'not-yours' && s.asked.length === 1 && s.queries.length === 1, 'asked=' + s.asked.length + ' queries=' + s.queries.length);
    }
    {
        const s = runSync({ mine: true });
        const r = await s.ctx.__slCloudSyncPushNow({});
        check('B5 mutation: own project (row visible) pushes as before', r && r.ok === true && s.writes.length === 1 && s.asked.length === 0, JSON.stringify(r));
    }
    {
        const s = runSync({ checkError: true });
        const r = await s.ctx.__slCloudSyncPushNow({});
        check('B6 a check that cannot run (network) never blocks saving: the write goes ahead', r && r.ok === true && s.writes.length === 1, JSON.stringify(r));
    }
    {
        const s = runSync({ mine: true, rls: true });
        const r = await s.ctx.__slCloudSyncPushNow({}); await tick();
        check('B7 the database refusing the write (RLS) is reported as not-yours and asked about once', r && r.reason === 'not-yours' && s.asked.length === 1, JSON.stringify(r));
        const r2 = await s.ctx.__slCloudSyncPushNow({});
        check('B8 …and it is not written again', r2.reason === 'not-yours' && s.writes.length === 1, 'writes=' + s.writes.length);
    }
    {
        // the copy: yes in the dialog -> the identity is dropped and a new project is provisioned in this account
        const s = runSync({ mine: false });
        let provisioned = null;
        s.ctx.slConfirm = () => Promise.resolve(true);
        s.ctx._slEnsureCloudProject = async (c, ws, name) => { provisioned = { ws, name }; vm.runInContext("_activeCloudProjectId = 'new-copy-id-0000';", s.ctx); return 'new-copy-id-0000'; };
        await s.ctx.__slCloudSyncPushNow({});
        await new Promise(r => setTimeout(r, 300));
        check('B9 "Save a copy to my workspace" provisions the project in this account\'s workspace and saves it there', provisioned && provisioned.ws === 'ws-me' && s.writes.indexOf('new-copy-id-0000') >= 0, JSON.stringify({ provisioned, writes: s.writes }));
    }
    {
        const ss = S('save_state.js');
        check('B10 save_state says not-yours in plain words', /'not-yours': 'this project is saved in a different account from the one signed in here'/.test(ss));
        check('B11 save_state never retries not-yours', /code !== 'shrink' && code !== 'refused' && code !== 'not-yours'\) _scheduleRetry\(\)/.test(ss));
        const idx = S('index.html');
        // 16 Oct 2026: save_state.js 3.0 (changes collected and confirmed once, change_ack.js v2.0) keeps the 2.2 reason 'not-yours'
        check('B12 index.html loads cloud_sync 2.6 and save_state 3.0 (with the 2.2 not-yours reason)', /cloud_sync\.js\?v=2\.6/.test(idx) && /save_state\.js\?v=3\.0/.test(idx));
    }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();

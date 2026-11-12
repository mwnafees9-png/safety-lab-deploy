#!/usr/bin/env node
/* regression_stale_copy_overwrite_20261112.test.js: an old copy of a shared project can never silently replace the
 * team's newer work, and what was lost is put back on top of the project as it is now.
 *
 * Live team data, 10 and 11 Nov 2026: one teammate's browser held an old copy of a shared project. Its writes took
 * fault tree events away from the whole team, twice, with no prompt and no notice (the second time nobody noticed and
 * the team kept working on the smaller copy). Waqas, 12 Nov 2026: "lets get this fixed now", "give them their work back".
 *
 * What is pinned (each executes the real module in a vm):
 *   [G] content_guard.js: the one rule (what counts as a large removal), with its numbers;
 *   [S] crdt_sync.js: a tab that opens with an older copy (seed) removes nothing large from the live shared copy and
 *       says so; a deliberate restore (force) still replaces; a small delete still goes through; this tab's own large
 *       delete asks first (Cancel keeps everything, Remove removes exactly what was asked about);
 *       status().caughtUp is false until the server's live copy is merged AND the live channel is joined;
 *   [W] cloud_writer.js: a 'merged' save over a copy that moved is held back when it would remove a large part
 *       (reason 'shrink', nothing written), goes through when it would not, and never writes blind when the saved
 *       copy cannot be read; the manual save asks with the numbers;
 *   [T] save_state.js: "team" needs caughtUp, never "online" alone;
 *   [R] project_recovery.js: only what is missing comes back, where it was; nothing in the project is removed or
 *       changed; a page the project retired as a duplicate stays retired; a second run adds nothing;
 *   [P] pins: the scripts are on the page, in order.
 * MUTATION PROOFS: SL_STALE_MUTATE=seed (the seed deletes again), =ask (this tab's large delete is not asked),
 *   =merged (the merged save is not measured), =held (a save goes out while the team's work is held back), =team (online alone is enough), =graft (the recovery doubles an event)
 *   must each fail.
 * Run: node tests/regression_stale_copy_overwrite_20261112.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const MUT = process.env.SL_STALE_MUTATE || '';
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const mustReplace = (src, a, b) => { if (!src.includes(a)) throw new Error('mutation anchor missing: ' + a.slice(0, 60)); return src.replace(a, b); };
let GUARD = S('content_guard.js'), CRDT = S('crdt_sync.js'), WRITER = S('cloud_writer.js'), STATE = S('save_state.js'), RECOV = S('project_recovery.js');
if (MUT === 'seed') CRDT = mustReplace(CRDT, 'if (_plan.large && !(opts && opts.force)) {', 'if (_plan.large && !full && !(opts && opts.force)) {');
if (MUT === 'ask') CRDT = mustReplace(CRDT, 'if (_plan.large && !(opts && opts.force)) {', 'if (_plan.large && full && !(opts && opts.force)) {');
if (MUT === 'merged') WRITER = mustReplace(WRITER, "if (LM.big) { _reportShrink(projectId, serverVersion, LM); stopReason = 'shrink'; return false; }", '');
if (MUT === 'held') WRITER = mustReplace(WRITER, "if (hs && hs.heldRemoval) return { ok: false, reason: 'shrink' };", '');
if (MUT === 'team') STATE = mustReplace(STATE, 'C.release(); team = C.status().caughtUp === true;', 'C.release(); team = !!(C.status().online !== false);');
if (MUT === 'graft') RECOV = mustReplace(RECOV, "if (have[String(g.node.id)]) { done.skipped++; return; }", '');
console.log('[stale copy]' + (MUT ? ' (MUTATION ' + MUT + ')' : ''));

// ---------------------------------------------------------------- [G]
const gctx = vm.createContext({}); vm.runInContext(GUARD, gctx);
const CG = gctx.SLContentGuard;
const tree = (id, n) => ({ id: id + '-0', children: Array.from({ length: n - 1 }, (_, i) => ({ id: id + '-' + (i + 1) })) });
{
    const m = CG.measure({ acFhaData: [1, 2, 3], systemsData: [{ fha: [1, 2], functions: [1] }], ftaPages: [{ id: 'a', root: tree('a', 5) }, { id: 'b', root: null }] });
    check('[G] a project is measured: rows (system rows too), pages, events', m.rows === 3 + 1 + 3 && m.pages === 2 && m.nodes === 5, JSON.stringify(m));
    check('[G] 45 of 200 events gone is large', CG.loss({ nodes: 200 }, { nodes: 155 }).big === true);
    check('[G] 3 of 200 events gone is not', CG.loss({ nodes: 200 }, { nodes: 197 }).big === false);
    check('[G] 9 of 12 events gone is not (under 10: an everyday delete)', CG.loss({ nodes: 12 }, { nodes: 3 }).big === false);
    check('[G] 12 of 500 rows gone is not (under a tenth)', CG.loss({ rows: 500 }, { rows: 488 }).big === false);
    check('[G] two pages gone is large', CG.loss({ pages: 30 }, { pages: 28 }).big === true);
    check('[G] the removal is said in plain words', CG.loss({ nodes: 200, pages: 30, rows: 50 }, { nodes: 155, pages: 28, rows: 50 }).text === '45 fault tree events and 2 fault tree pages');
    check('[G] growth is never a loss', CG.loss({ nodes: 10 }, { nodes: 400 }).big === false);
}

// ---------------------------------------------------------------- [S] crdt_sync in a vm with a fake Yjs
function makeY(env) {
    function Doc() { this._maps = new Map(); this._handlers = []; env.docs.push(this); }
    Doc.prototype.getMap = function (n) { if (!this._maps.has(n)) this._maps.set(n, new Map()); return this._maps.get(n); };
    Doc.prototype.transact = function (f) { f(); };
    Doc.prototype.on = function (ev, cb) { if (ev === 'update') this._handlers.push(cb); };
    Doc.prototype.destroy = function () {};
    return { Doc, applyUpdate() {}, encodeStateVector() { return new Uint8Array(0); }, encodeStateAsUpdate() { return new Uint8Array(0); } };
}
function boot(model, opts) {
    opts = opts || {};
    const env = { docs: [], timers: [], applied: [], journal: [], toasts: [], asks: [], subs: [], loads: [] };
    const win = {
        navigator: { onLine: opts.online === true },
        localStorage: { getItem: k => (k === 'SLA_CRDT' ? '1' : null), setItem() {}, removeItem() {} },
        console: { info() {}, warn() {}, error() {}, log() {} },
        getActiveCloudProjectId: () => 'proj-1', getActiveWorkspaceId: () => 'ws-1', isSupabaseSignedIn: () => true,
        getSupabaseClient: () => ({
            channel: () => ({ on() { return this; }, subscribe(cb) { env.subs.push(cb); return this; }, send() {}, unsubscribe() {} }),
            from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => new Promise(res => env.loads.push(res)) }) }), upsert: () => Promise.resolve({}) })
        }),
        __crdtCapture: () => JSON.parse(JSON.stringify(env.model)),
        __crdtApply: p => { env.applied.push(p); },
        addEventListener() {}, projectConfig: {}, SL_CRDT_AUTHORITATIVE: true,
        jrnl: (k, m) => env.journal.push([k, m]), showToast: m => env.toasts.push(m),
        slConfirm: (msg) => new Promise(res => env.asks.push({ msg, res }))
    };
    win.window = win; env.model = model;
    const doc = { hidden: false, addEventListener() {}, getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, documentElement: { appendChild() {} }, body: { appendChild() {} } };
    const ctx = Object.assign(win, { document: doc, setTimeout: (f, ms) => { env.timers.push({ f, ms }); return env.timers.length; }, clearTimeout: id => { if (env.timers[id - 1]) env.timers[id - 1].f = null; }, setInterval: () => 0,
        btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: b => Buffer.from(b, 'base64').toString('binary'), JSON, Math, Uint8Array, Promise, Array, Object, String });
    env.skew = 0; ctx.Date = class extends Date { static now() { return Date.now() + env.skew; } };   // the test moves the clock past the 15 s adopt window
    ctx._activeCloudDocVersion = opts.V != null ? opts.V : null;
    ctx.Y = makeY(env);
    vm.createContext(ctx);
    vm.runInContext(GUARD, ctx);
    vm.runInContext(CRDT, ctx);
    env.ctx = ctx; env.api = ctx.SafetyLabCRDT; env.setV = v => { ctx._activeCloudDocVersion = v; };
    env.api.refresh();
    return env;
}
const BASE = { acFunctionsData: [], acFhaData: [], acReqData: [], acAssumptionsData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [], acFcimData: [], routingData: [], resourcesData: [], itemsData: [], flightPhasesData: [], systemsData: [] };
const proj = pages => Object.assign(JSON.parse(JSON.stringify(BASE)), { ftaPages: JSON.parse(JSON.stringify(pages)) });
const TEAM = [{ id: 'p1', name: 'T1', root: tree('a', 30) }, { id: 'p2', name: 'T2', root: tree('b', 30) }];        // 60 events: what the team has
const OLD = [{ id: 'p1', name: 'T1', root: tree('a', 14) }, { id: 'p2', name: 'T2', root: tree('b', 6) }];           // 20 events: an old copy
const nodeN = d => d.getMap('col:ftaNodes').size;
const flush = () => new Promise(r => setImmediate(r));

(async function () {
    {   // a tab opens with an older copy and seeds
        const e = boot(proj(TEAM), { V: 5 });
        check('[S] precondition: the live shared copy holds the team\'s 60 events', nodeN(e.docs[0]) === 60, nodeN(e.docs[0]));
        e.model = proj(OLD); e.setV(9);                                  // this tab holds the old copy and believes it is newer (V > stamp)
        e.api.adoptModel();                                              // SEED
        check('[S] a seed from an older copy removes nothing: still 60 events', nodeN(e.docs[0]) === 60, nodeN(e.docs[0]));
        check('[S] it is written to the change log', e.journal.some(j => j[0] === 'removal-held' && /40 fault tree events/.test(j[1])), JSON.stringify(e.journal));
        check('[S] the person is told the team\'s work stays', e.toasts.some(t => /older copy/.test(t) && /Nothing was removed/.test(t)), JSON.stringify(e.toasts));
        check('[S] status says what was held', /40 fault tree events/.test(String(e.api.status().heldRemoval)));
    }
    {   // a deliberate restore still replaces
        const e = boot(proj(TEAM), { V: 5 });
        e.model = proj(OLD); e.setV(9);
        e.api.adoptModel({ force: true });
        check('[S] a deliberate restore (force) replaces: 20 events', nodeN(e.docs[0]) === 20, nodeN(e.docs[0]));
    }
    {   // a small delete in a seed still goes through
        const e = boot(proj(TEAM), { V: 5 });
        const m = proj(TEAM); m.ftaPages[0].root.children.splice(0, 3);
        e.model = m; e.setV(9); e.api.adoptModel();
        check('[S] a small difference (3 events) is seeded as before', nodeN(e.docs[0]) === 57, nodeN(e.docs[0]));
    }
    {   // this tab's own large delete asks first; Cancel keeps everything
        const e = boot(proj(TEAM), { V: 5 });
        e.skew = 60000;                                                                       // the open is over: this is an edit, not a seed
        const m = proj(TEAM); m.ftaPages[1].root.children = []; e.model = m;                 // 29 events deleted here
        e.api.pull();                                                                         // a pull pushes this tab's edit first (three-way)
        check('[S] a large delete in this tab is asked about before it leaves', e.asks.length === 1 && /29 fault tree events/.test(e.asks[0].msg), JSON.stringify(e.asks.map(a => a.msg)));
        check('[S] nothing is removed while the question is open', nodeN(e.docs[0]) === 60, nodeN(e.docs[0]));
        if (e.asks[0]) e.asks[0].res(false); await flush();
        check('[S] Cancel keeps all 60 events', nodeN(e.docs[0]) === 60 && e.journal.some(j => j[0] === 'removal-cancelled'), nodeN(e.docs[0]));
    }
    {   // ... Remove removes exactly what was asked about
        const e = boot(proj(TEAM), { V: 5 });
        e.skew = 60000;
        const m = proj(TEAM); m.ftaPages[1].root.children = []; e.model = m;
        e.api.pull();
        if (e.asks[0]) e.asks[0].res(true); await flush();
        check('[S] Remove for everyone removes the 29 events, and it is logged', nodeN(e.docs[0]) === 31 && e.journal.some(j => j[0] === 'removal-confirmed'), nodeN(e.docs[0]));
    }
    {   // caught up: server copy merged AND channel joined
        const e = boot(proj(TEAM), { V: 5, online: true });
        check('[S] a tab that has not merged the server\'s live copy is not caught up', e.api.status().caughtUp === false);
        e.loads.forEach(r => r({ data: null })); await flush();
        check('[S] merged but the live channel not joined: still not caught up', e.api.status().caughtUp === false, JSON.stringify(e.api.status()));
        e.subs.forEach(cb => cb('SUBSCRIBED'));
        check('[S] merged and joined: caught up', e.api.status().caughtUp === true, JSON.stringify(e.api.status()));
        e.subs.forEach(cb => cb('CHANNEL_ERROR'));
        check('[S] the channel drops: not caught up', e.api.status().caughtUp === false);
        const off = boot(proj(TEAM), { V: 5, online: false });
        check('[S] offline: never caught up', off.api.status().caughtUp === false);
    }

    // ------------------------------------------------------------ [W] cloud_writer
    function writer(serverData, serverVersion, opts) {
        opts = opts || {};
        const env = { updates: 0, toasts: [], journal: [], asks: [] };
        const row = { data: serverData, version: serverVersion };
        const client = { from: () => ({
            select: cols => ({ eq: () => ({ maybeSingle: async () => (opts.readFails && cols === 'data') ? { error: { message: 'network' } } : { data: cols === 'data' ? { data: row.data } : { version: row.version } } }) }),
            insert: async () => ({ error: null }),
            update: v => ({ eq: () => ({ eq: (_c, expected) => ({ select: async () => { if (expected !== row.version) return { data: [] }; env.updates++; row.version = v.version; row.data = v.data; return { data: [{ version: v.version }] }; } }) }) })
        }) };
        const ctx = { console: { warn() {}, info() {}, log() {} }, setTimeout, clearTimeout, Promise, JSON, Date, Math, Object, Array, String, Error,
            __slabCloudQuietMs: 0, showToast: m => env.toasts.push(m), jrnl: (k, m) => env.journal.push([k, m]),
            slConfirm: async msg => { env.asks.push(msg); return opts.answer === true; }, _loadCloudProject: async () => { env.loaded = true; } };
        ctx.globalThis = ctx; ctx.window = ctx;
        vm.createContext(ctx);
        vm.runInContext('var _activeCloudDocVersion = ' + JSON.stringify(opts.token) + ';', ctx);
        vm.runInContext(GUARD, ctx); vm.runInContext(WRITER, ctx);
        env.write = (mode, snap) => ctx.SLCloudWriter.write({ mode, prepare: () => ({ client, projectId: 'proj-1', userId: 'u', snapshot: snap }) });
        env.row = row; env.ctx = ctx; return env;
    }
    {
        const w = writer(proj(TEAM), 262, { token: 259 });
        const r = await w.write('merged', proj(OLD));
        check('[W] a merged save that would remove 40 events from a copy that moved is held back', r.ok === false && r.reason === 'shrink' && w.updates === 0 && w.row.version === 262, JSON.stringify(r) + ' updates=' + w.updates);
        check('[W] the person is told, with the numbers, and it is logged', w.toasts.some(t => /missing 40 fault tree events/.test(t)) && w.journal.some(j => j[0] === 'save-held'), JSON.stringify(w.toasts));
    }
    {
        const w = writer(proj(OLD), 262, { token: 259 });
        const r = await w.write('merged', proj(TEAM));
        check('[W] a merged save that removes nothing still writes over a copy that moved', r.ok === true && w.updates === 1, JSON.stringify(r));
    }
    {
        const w = writer(proj(TEAM), 262, { token: 262 });
        const r = await w.write('merged', proj(OLD));
        check('[W] (scope) a save whose version matches is the live copy\'s business: the writer writes it', r.ok === true && w.updates === 1, JSON.stringify(r));
    }
    {
        const w = writer(proj(TEAM), 262, { token: 262 });
        w.ctx.SafetyLabCRDT = { status: () => ({ heldRemoval: '40 fault tree events' }) };
        const r = await w.write('merged', proj(OLD));
        check('[W] while the live copy holds the team\'s work back for this tab, no automatic save goes out (the 11 Nov case: the version matched)', r.ok === false && r.reason === 'shrink' && w.updates === 0, JSON.stringify(r));
        w.ctx.SafetyLabCRDT = { status: () => ({ heldRemoval: null }) };
        const r2 = await w.write('merged', proj(TEAM));
        check('[W] ... and saving resumes once the team\'s work is on this screen', r2.ok === true && w.updates === 1, JSON.stringify(r2));
    }
    {
        const w = writer(proj(TEAM), 262, { token: 259, readFails: true });
        const r = await w.write('merged', proj(OLD));
        check('[W] the saved copy cannot be read to compare: nothing is written blind', r.ok === false && w.updates === 0, JSON.stringify(r));
    }
    {
        const w = writer(proj(TEAM), 262, { token: 259, answer: false });
        const r = await w.write('manual', proj(OLD));
        check('[W] the manual save asks with the numbers; Cancel writes nothing and loads the cloud copy', r.ok === false && w.updates === 0 && w.asks.length === 1 && /remove 40 fault tree events/.test(w.asks[0]) && w.loaded === true, JSON.stringify([r, w.asks]));
        const w2 = writer(proj(TEAM), 262, { token: 259, answer: true });
        const r2 = await w2.write('manual', proj(OLD));
        check('[W] ... and OK writes it, logged as a deliberate save over', r2.ok === true && w2.updates === 1 && w2.journal.some(j => j[0] === 'save-over'), JSON.stringify(r2));
    }

    // ------------------------------------------------------------ [T] save_state: team needs caughtUp
    check('[T] "team" is decided by caughtUp on both paths, never by online alone',
        STATE.includes('C.release(); team = C.status().caughtUp === true;') && STATE.includes("C.pushAccepted(JSON.parse(acc)) === true && C.status().caughtUp === true;") && !/team = !!\(C\.status\(\)\.online/.test(STATE));

    // ------------------------------------------------------------ [R] project_recovery
    const rctx = vm.createContext({ console: { info() {}, warn() {} }, JSON, Object, Array, String, Math, Date });
    vm.runInContext(RECOV, rctx);
    const R = rctx.SLProjectRecovery;
    const count = pages => pages.reduce((s, p) => s + R._count(p.root), 0);
    {
        const saved = [
            { id: 'p1', name: 'T1', root: { id: 1, children: [{ id: 2, children: [{ id: 3 }, { id: 4 }] }, { id: 5 }, { id: 6, children: [{ id: 7 }] }] } },
            { id: 'p2', name: 'T2', root: { id: 10, children: [{ id: 11 }, { id: 12 }, { id: 13 }] } },
            { id: 'dup', name: 'copy', root: { id: 20, children: [{ id: 21 }] } },
            { id: 'gone', name: 'T4', root: { id: 30, children: [{ id: 31 }] } }
        ];
        const now = [
            { id: 'p1', name: 'T1 renamed', root: { id: 1, name: 'edited since', children: [{ id: 2, children: [{ id: 4 }] }, { id: 99, name: 'added since' }] } },   // lost 3, 5, 6>7; gained 99
            { id: 'p2', name: 'T2', root: { id: 10, children: [] } },                                                                                                    // lost 11, 12, 13
            { id: 'new', name: 'made since', root: { id: 40 } }
        ];
        const before = JSON.parse(JSON.stringify(now));
        const pl = R.plan(now, saved, ['dup']);
        check('[R] the plan counts what is missing: 7 events in 2 trees and one whole page (2 events)', pl.events === 9 && pl.perPage.length === 3 && pl.pagesBack === 1, JSON.stringify(pl.perPage));
        check('[R] planning changes nothing', JSON.stringify(now) === JSON.stringify(before));
        const done = R.apply(now, pl, { from: 262, at: 't' });
        const p1 = now[0], ids = n => [n.id].concat(...(n.children || []).map(ids));
        check('[R] every lost event is back', done.events === 9 && [3, 5, 6, 7].every(i => ids(p1.root).includes(i)) && ids(now[1].root).join() === '10,11,12,13', JSON.stringify(ids(p1.root)));
        check('[R] each is back under the event it hung from, where it was', p1.root.children[0].children.map(c => c.id).join() === '3,4' && p1.root.children.map(c => c.id).join() === '2,5,6,99', JSON.stringify(p1.root));
        check('[R] nothing the team did since is changed or removed', p1.name === 'T1 renamed' && p1.root.name === 'edited since' && p1.root.children.some(c => c.id === 99 && c.name === 'added since') && now.some(p => p.id === 'new'));
        check('[R] a page that is gone comes back whole; a page retired as a duplicate stays retired', now.some(p => p.id === 'gone') && !now.some(p => p.id === 'dup'));
        check('[R] what came back says where it came from', p1.root.children[1].recoveredFrom && p1.root.children[1].recoveredFrom.from === 262);
        const again = R.plan(now, saved, ['dup']);
        const n1 = count(now); const d2 = R.apply(now, pl, { from: 262, at: 't2' });
        check('[R] a second run finds nothing to add', again.events === 0 && again.pagesBack === 0, again.text);
        check('[R] applying the same plan twice (two screens at once) doubles nothing', d2.events === 0 && count(now) === n1, d2.events + ' ' + count(now) + ' vs ' + n1);
    }
    {   // the shape of the live case: 15 trees, 45 events
        const saved = [], now = [];
        for (let i = 0; i < 12; i++) { saved.push({ id: 's' + i, root: tree('s' + i, 4) }); now.push({ id: 's' + i, root: tree('s' + i, 1) }); }
        saved.push({ id: 'b1', root: tree('b1', 19) }); now.push({ id: 'b1', root: tree('b1', 14) });
        saved.push({ id: 'b2', root: tree('b2', 16) }); now.push({ id: 'b2', root: tree('b2', 13) });
        saved.push({ id: 'b3', root: tree('b3', 14) }); now.push({ id: 'b3', root: tree('b3', 13) });
        const pl = R.plan(now, saved, []); const had = count(now); const d = R.apply(now, pl, { from: 262, at: 't' });
        check('[R] a project shaped like the live one: 45 events back in 15 trees, the rest untouched', pl.events === 45 && pl.perPage.length === 15 && d.events === 45 && count(now) === had + 45, pl.text);
    }

    // ------------------------------------------------------------ [P]
    const IDX = S('index.html'), at = s => IDX.indexOf(s);
    check('[P] content_guard.js loads before cloud_writer.js and crdt_sync.js', at('content_guard.js?v=1.0') > 0 && at('content_guard.js?v=1.0') < at('cloud_writer.js?v=1.5') && at('content_guard.js?v=1.0') < at('crdt_sync.js?v=3.0'));
    check('[P] project_recovery.js loads after crdt_sync.js and the load clean-ups', at('project_recovery.js?v=1.0') > at('crdt_sync.js?v=3.0') && at('project_recovery.js?v=1.0') > at('stale_revive.js'));
    check('[P] save_state.js 3.8', at('save_state.js?v=3.8') > 0);

    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  the suite threw: ' + (e && e.stack || e)); process.exit(1); });

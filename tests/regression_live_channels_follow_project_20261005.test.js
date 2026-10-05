#!/usr/bin/env node
/*
 * Regression (5 Oct 2026): the edit-lock and project-presence live channels follow the open project.
 *
 * FOUND LIVE, while turning off public Realtime access. A tab open since the day before was on
 * project 2fe5 for co-editing but still on project 96e7 for edit locks: edit_locks.js and
 * presence.js opened their channel ONCE, for the project open at page load, and never moved.
 * crdt_sync.js has always had refresh() on a 6 s poll; these two had nothing. Effects: "held by"
 * never showed for the project in front of you, presence bubbles showed the previous project,
 * and the server refused the stale lock channel 183 times that day. Worse, release() used the
 * ACTIVE project, so a lock taken on project A and released after switching to B was released on
 * B, leaving the real lock standing until its two-minute TTL ran out.
 *
 * EXECUTED: both real files run in a vm against a fake Supabase client; the test switches the
 * active project underneath them and drives the 6 s poll and the heartbeat by hand.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' :: ' + d : '')); } };
const SITE = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

function world() {
  const W = { ws: 'ws-1', proj: 'proj-1', itar: false, channels: [], rpc: [], intervals: [], timeouts: [] };
  W.client = {
    channel(name, cfg) {
      const ch = { name, cfg, closed: false, tracked: 0,
        on() { return ch; }, subscribe(cb) { if (cb) cb('SUBSCRIBED'); return ch; }, send() {},
        track() { ch.tracked++; }, presenceState() { return {}; }, unsubscribe() { ch.closed = true; } };
      W.channels.push(ch); return ch;
    },
    rpc: async (name, args) => { W.rpc.push({ name, args }); return { data: [{ ok: true, expires_at: new Date(Date.now() + 120000).toISOString() }], error: null }; },
  };
  return W;
}
function ctxFor(W, extra) {
  const ctx = Object.assign({
    console: { info() {}, warn() {}, error() {}, log() {} },
    Promise, Date, Map, String, Number, Array, Object, JSON, Math,
    setInterval: (fn, ms) => { W.intervals.push({ fn, ms }); return W.intervals.length; },
    clearInterval: (id) => { if (W.intervals[id - 1]) W.intervals[id - 1].dead = true; }, setTimeout: (fn, ms) => { W.timeouts.push({ fn, ms }); return 1; }, clearTimeout: () => {},
    location: { search: '' }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    crypto: { randomUUID: () => 'tok00000-0000' },
    getSupabaseClient: () => W.client,
    getActiveCloudProjectId: () => W.proj, getActiveWorkspaceId: () => W.ws,
    SLEnv: { get: (k) => (k === 'projectConfig' ? { isITARControlled: W.itar } : undefined) },
    projectConfig: { isITARControlled: false },
    _supabaseSession: { user: { id: 'me', email: 'me@x.com', user_metadata: { full_name: 'Me Myself' } } },
  }, extra || {});
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  return ctx;
}
const open = (W, prefix) => W.channels.filter(c => c.name.startsWith(prefix) && !c.closed);
const tick = (W, ms) => W.intervals.filter(i => i.ms === ms && !i.dead).forEach(i => i.fn());
const flush = () => new Promise(r => setImmediate(r));

(async () => {
  console.log('[edit locks]');
  {
    const W = world();
    const ctx = ctxFor(W, { document: { readyState: 'complete', addEventListener() {} } });
    vm.runInContext(SITE('edit_locks.js'), ctx);
    const L = ctx.SLLocks;
    check('a 6 s poll is installed at load', W.intervals.some(i => i.ms === 6000));
    W.timeouts.forEach(t => t.fn());                                     // the 3.2 s first start
    check('the channel opens for the project open now', open(W, 'slab-locks:').map(c => c.name).join() === 'slab-locks:ws-1:proj-1');
    const r = await L.claim('acfha:1');
    check('a claim on project 1 is mine', r.ok && L.mine('acfha:1'));

    tick(W, 6000); await flush();
    check('the poll changes nothing while the project is the same', W.channels.length === 1 && W.rpc.filter(x => x.name === 'release_edit_lock').length === 0);

    W.proj = 'proj-2'; tick(W, 6000); await flush();
    check('after a project switch the old channel is closed', W.channels[0].closed);
    check('...and a channel opens for the new project', open(W, 'slab-locks:').map(c => c.name).join() === 'slab-locks:ws-1:proj-2');
    const rel = W.rpc.filter(x => x.name === 'release_edit_lock');
    check('...and the lock held on project 1 is released ON PROJECT 1, not on the new one',
      rel.length === 1 && rel[0].args.p_project === 'proj-1' && rel[0].args.p_resource === 'acfha:1', JSON.stringify(rel));
    check('...and it is no longer reported as mine', !L.mine('acfha:1'));
    check('the module reports which project its channel is on', JSON.stringify(L._channelFor()) === '{"ws":"ws-2","proj":"proj-2"}'.replace('ws-2', 'ws-1'));

    await L.claim('sfha:7');                                             // held on proj-2
    W.proj = 'proj-3';                                                   // switched, poll not yet run
    W.rpc.length = 0;
    tick(W, 45000); await flush();                                       // the heartbeat fires first
    const hb = W.rpc.filter(x => x.name === 'acquire_edit_lock');
    check('the heartbeat renews a lock on the project it was taken on', hb.length === 1 && hb[0].args.p_project === 'proj-2', JSON.stringify(hb));
    check('a lock on another project is not "mine" for the project in front of you', !L.mine('sfha:7'));

    W.ws = 'ws-9'; W.proj = 'proj-9'; tick(W, 6000); await flush();
    check('a workspace switch moves the channel too', open(W, 'slab-locks:').map(c => c.name).join() === 'slab-locks:ws-9:proj-9');

    W.itar = true; tick(W, 6000); await flush();
    check('switching to an export-controlled project closes the channel and opens none', open(W, 'slab-locks:').length === 0);
    W.itar = false; tick(W, 6000); await flush();
    check('switching back opens it again', open(W, 'slab-locks:').length === 1);
  }

  console.log('[project presence]');
  {
    const W = world();
    const el = () => ({ style: {}, innerHTML: '', setAttribute() {}, appendChild() {}, addEventListener() {}, remove() {}, insertBefore() {}, querySelector: () => null });
    const doc = { readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelector: () => null,
      createElement: el, createElementNS: el, body: { appendChild() {} } };
    const ctx = ctxFor(W, { document: doc, switchTab: function () {} });
    vm.runInContext(SITE('presence.js'), ctx);
    const P = ctx.SLPresence;
    check('a 6 s poll is installed at load', W.intervals.some(i => i.ms === 6000));
    W.timeouts.forEach(t => { try { t.fn(); } catch (_) {} });
    check('the channel opens for the project open now', open(W, 'slab-presence:').map(c => c.name).join() === 'slab-presence:ws-1:proj-1');
    const first = open(W, 'slab-presence:')[0]; const t0 = first.tracked;
    tick(W, 6000);
    check('the poll does not re-announce every tick', first.tracked === t0 && W.channels.length === 1);
    P.refresh();
    check('refresh() with the same project re-announces (new name or picture) without reopening', first.tracked === t0 + 1 && W.channels.length === 1);
    W.proj = 'proj-2'; tick(W, 6000);
    check('after a project switch the old channel is closed', first.closed);
    check('...and a channel opens for the new project', open(W, 'slab-presence:').map(c => c.name).join() === 'slab-presence:ws-1:proj-2');
    check('...and the people shown are cleared with it', JSON.stringify(P.peers()) === '[]');
    W.itar = true; tick(W, 6000);
    check('an export-controlled project closes presence', open(W, 'slab-presence:').length === 0);
  }

  console.log('[wiring]');
  const idx = SITE('index.html');
  check('index.html pins edit_locks.js 1.4 and presence.js 2.3', /edit_locks\.js\?v=1\.4"/.test(idx) && /presence\.js\?v=2\.3"/.test(idx));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

#!/usr/bin/env node
/*
 * Regression — continuous cloud autosave + first-edit provisioning (cloud_sync.js)
 * and the workspace-default fix (misc_fn_modules.js refreshWorkspaceChip).
 *
 * Guards the data-loss fix: autosave must reach the cloud (not just local), a
 * genuine first edit must provision a project row, showcase loads must not
 * overwrite a real cloud project, and it must all be non-fatal. Boot picks the
 * workspace where the user's work lives, not empty Personal.
 * Run: node tests/regression_cloud_sync.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const c = S('cloud_sync.js');
const w = S('cloud_writer.js');   // 3 Sep 2026 — the ONE writer; cloud_sync hands it a prepare()
check('idempotent wiring guard', /__slCloudSyncWired/.test(c));
check('wraps window._writeAutosave and chains (calls the original first)',
  /window\._writeAutosave\s*=/.test(c) && /orig\.apply\(this, arguments\)/.test(c) && /_cloudWrapped/.test(c));
check('preserves session_resume ring wrap flag when chaining',
  /_ringWrapped/.test(c));
check('guards: signed-in, active workspace, and does not provision without a real edit',
  /_userId\(\)/.test(c) && /_wsId\(\)/.test(c) && /if \(!pid && !_dirty\(\)\) return/.test(c));
// Provisioning MOVED to the shared lock in helpers_modules.js (_ensureCloudProject)
// after an unlocked check-then-insert let one session mint twelve copies of the
// same showcase. This module must delegate, never insert inline again — its own
// _inFlight flag only serialises itself, and the manual Save path races it.
check('provisions a project row only when there is no cloud id yet',
  /if \(!pid\)/.test(c) && /await ensure\(/.test(c));
check('never inserts into projects inline — the shared lock owns provisioning',
  !/from\('projects'\)[\s\S]{0,120}\.insert\(/.test(c),
  'a second insert site here reopens the duplicate-project race');
check('secondary content guard so it never mints an empty row',
  /_hasRealContent/.test(c) && /don.?t mint an empty row/i.test(c));
check('takes the project id back from the shared lock (dedupe — reuse, never duplicate)',
  /pid = await ensure\(client, ws, name, certBasis, uid\)/.test(c));
check('bails to the next tick if the lock is not loaded yet',
  /if \(!ensure\)/.test(c), 'without this it would fall through and push to a null project');
check('concurrency-safe: a diverged server version SKIPS the silent push (writer, silent mode)',
  /if \(mode === 'silent'\) \{[\s\S]{0,400}return false;/.test(w));
// 2 Sep 2026 — the blind UPSERT is gone: the silent path writes a conditional
// UPDATE (WHERE version = the token this tab read), INSERTs at v1 only when no
// row exists, and queues on the SAME chain as the manual Save.
check('cloud_sync does not compose a project_documents write of its own any more',
  !/from\('project_documents'\)/.test(c.replace(/\/\/[^\n]*/g, '')));
check('the silent write is the writer\'s conditional UPDATE keyed on the token it read',
  /from\('project_documents'\)[\s\S]{0,200}\.update\([\s\S]{0,200}\.eq\('version', expected\)[\s\S]{0,60}\.select\('version'\)/.test(w));
check('a refused silent write is SKIPPED, never retried into an overwrite (one attempt in silent mode)',
  /var attempts = \(mode === 'manual'\) \? 2 : 1;/.test(w));
check('no row yet: INSERT at version 1, duplicate-key is the same refusal',
  /\.insert\(Object\.assign\(\{ project_id: projectId, version: 1 \}/.test(w) && /'23505'/.test(w));
check('the silent path hands the writer a prepare() — same queue as the manual Save',
  /W\.write\(\{ mode: 'silent', prepare: prepare \}\)/.test(c) && /__slabCloudSaveQ/.test(w));
check('the snapshot is taken INSIDE the writer\'s queued run (prepare), never before it',
  /var prepare = async function \(\) \{[\s\S]{0,300}var snap = _snapshot\(\)/.test(c) && !/async function _tick\([\s\S]{0,900}_snapshot\(\)[\s\S]{0,900}async function _push/.test(c));
check('non-fatal — a writer error is logged, local save stays safe',
  /r\.reason === 'error'/.test(c) && /local save is safe/i.test(c));
check('throttled (min gap) so it never hammers the backend',
  /_MIN_GAP_MS/.test(c));
check('flushes on tab hide (pagehide / visibilitychange)',
  /pagehide/.test(c) && /visibilitychange/.test(c));
check('showcase/sample loaders reset the cloud identity (no overwrite of a real project)',
  /_detachCloudIdentity/.test(c) &&
  /loadSampleProject/.test(c) && /loadKestrelRj/.test(c) && /loadSoraShowcase/.test(c));
check('detach clears id, version and dirty flag',
  /_activeCloudProjectId = null/.test(c) && /_activeCloudDocVersion = null/.test(c) && /_dirtySinceSave = false/.test(c));
check('has a kill switch (SL_CLOUD_AUTOSAVE)', /SL_CLOUD_AUTOSAVE/.test(c));

/* 31 Aug 2026 — H-4 EXECUTED: every project holds one blank seeded FTA page
 * (SLStores.blankPage, root:null), and _hasRealContent's plain length check on
 * ftaPages made a pristine New Project read as "real content" — so the 12s
 * tick minted empty "Untitled Project" rows (c29d1d96, 6eeca9a7, 328f5eb2...).
 * The real function runs here: a blank seeded page is NOT content; a page
 * with a root IS. */
(function () {
  const vm2 = require('vm');
  function fnx(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return null;
    let depth = 0, started = false, inS = null, esc2 = false, line = false, blk = false;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
      const ch = src[k], nx = src[k + 1];
      if (line) { if (ch === '\n') line = false; continue; }
      if (blk) { if (ch === '*' && nx === '/') { blk = false; k++; } continue; }
      if (esc2) { esc2 = false; continue; }
      if (ch === '\\') { esc2 = true; continue; }
      if (inS) { if (ch === inS) inS = null; continue; }
      if (ch === '/' && nx === '/') { line = true; k++; continue; }
      if (ch === '/' && nx === '*') { blk = true; k++; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { inS = ch; continue; }
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
    }
    return null;
  }
  const src = fnx(c, '_hasRealContent');
  check('extracted _hasRealContent', !!src);
  if (!src) return;
  const cx = { projectName: undefined, console };
  vm2.createContext(cx);
  vm2.runInContext(src + '; globalThis.__h = _hasRealContent;', cx);
  const blank = { acFunctionsData: [], acFhaData: [], systemsData: [], itemsData: [], acReqData: [], ftaPages: [{ id: 'page-1', name: 'Untitled Fault Tree', root: null }], projectName: 'Untitled Project' };
  check('a pristine New Project (one blank seeded page) is NOT real content — the H-4 orphan minter', cx.__h(blank) === false);
  check('a fault-tree page WITH a root IS content', cx.__h(Object.assign({}, blank, { ftaPages: [{ id: 'p', root: { id: 1 } }] })) === true);
  check('an authored row is content', cx.__h(Object.assign({}, blank, { acFhaData: [{ internalId: 1 }] })) === true);
  check('a named project is content', cx.__h(Object.assign({}, blank, { projectName: 'HX-1' })) === true);
})();

const m = S('misc_fn_modules.js');
check('workspace default prefers the workspace with the user\'s most recent project',
  /from\('projects'\)[\s\S]{0,200}workspace_id[\s\S]{0,200}order\('updated_at'/.test(m));
check('workspace default still falls back to Personal',
  /w\.is_personal\) \|\| _workspaces\[0\]/.test(m));

const idx = S('index.html');
check('index.html loads cloud_sync.js after session_resume', /cloud_sync\.js\?v=/.test(idx));

/* ==========================================================================
 * 31 Aug 2026 — THE DATA-LOSS CHAIN, EXECUTED. Reproduced live on prod
 * (project f7a7bda2): open-from-cloud left the version token null/stale, the
 * next save either regressed the counter (v3 -> v1) or raised a spurious
 * conflict whose Cancel branch reloaded the cloud copy over 124 accepted
 * rows, and the CRDT per-project IndexedDB doc resurrected a previous
 * session's rows after every authoritative load. These checks run the real
 * functions against fakes and assert what actually happens — shape pins
 * cannot see this class of bug.
 * ========================================================================== */
const vm = require('vm');
const misc = S('misc_fn_modules.js');
const helpers = S('helpers_modules.js');
const dataOps = S('data_ops_modules.js');
const crdtSrc = S('crdt_sync.js');

function fn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let depth = 0, started = false, inS = null, esc2 = false, line = false, blk = false;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (esc2) { esc2 = false; continue; }
    if (c === '\\') { esc2 = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { line = true; k++; continue; }
    if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) {
      // async functions: the name search lands on 'function', keep the modifier
      const asyncPrefix = src.slice(Math.max(0, i - 6), i) === 'async ' ? 'async ' : '';
      return asyncPrefix + src.slice(i, k + 1);
    } }
  }
  return null;
}

// fake supabase client: records calls, serves scripted version/doc answers
function fakeClient(state) {
  // 2 Sep 2026 — emulates the server's CONDITIONAL write: an update lands only when the
  // version filter equals what the server holds (state.serverVersion); otherwise zero rows.
  // state.raceOnce = true moves the server version by one on the first update attempt —
  // "another writer landed between this tab's check and its write".
  const calls = state.calls || (state.calls = []);   // persists across client creations: one log per scenario
  if (state.serverVersion === undefined) state.serverVersion = (state.doc && state.doc.version != null) ? state.doc.version : null;
  function table(t) {
    const q = { _t: t, _op: null, _payload: null, _eqs: [] };
    q.select = function (cols) { if (q._op !== 'update') q._op = 'select'; q._cols = cols; return q; };
    q.eq = function (c, v) { q._eqs.push([c, v]); const last = calls[calls.length - 1]; if (last && last.op === 'update' && last.t === t) last.eqs = q._eqs.slice(); return q; };
    q.update = function (p) { q._op = 'update'; q._payload = p; calls.push({ t, op: 'update', p }); return q; };
    q.upsert = function (p, o) { q._op = 'upsert'; q._payload = p; calls.push({ t, op: 'upsert', p, o }); return Promise.resolve({ error: null }); };
    q.insert = function (p) {
      const c = { t, op: 'insert', p }; calls.push(c);
      if (t === 'project_documents') {
        if (state.serverVersion == null) { state.serverVersion = p.version; state.doc = { version: p.version }; c.ok = true; return Promise.resolve({ error: null }); }
        c.ok = false; return Promise.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
      }
      return Promise.resolve({ error: null });
    };
    q.maybeSingle = function () {
      calls.push({ t, op: 'maybeSingle', cols: q._cols });
      if (t === 'project_documents') {
        const row = state.serverVersion == null ? null : Object.assign({}, state.doc || {}, { version: state.serverVersion });
        if (state.slowMs) return new Promise(res => setTimeout(() => res({ data: row, error: null }), state.slowMs));
        return Promise.resolve({ data: row, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    q.then = function (res, rej) {
      let out = { data: null, error: null };
      if (q._op === 'update' && t === 'project_documents') {
        const eqV = (q._eqs.find(e => e[0] === 'version') || [])[1];
        if (state.raceOnce) { state.serverVersion += 1; state.raceOnce = false; }
        const last = calls[calls.length - 1];
        if (state.serverVersion === eqV) { state.serverVersion = q._payload.version; out = { data: [{ version: q._payload.version }], error: null }; if (last) last.ok = true; }
        else { out = { data: [], error: null }; if (last) last.ok = false; }
      }
      return Promise.resolve(out).then(res, rej);
    };
    return q;
  }
  return { from: table };
}

// ---- 1. _loadCloudProject adopts the document identity ---------------------
(function () {
  const src = fn(misc, '_loadCloudProject');
  check('extracted _loadCloudProject', !!src);
  if (!src) return;
  const state = { doc: { data: { acFhaData: [{ internalId: 'X' }], projectName: 'P' }, version: 7, updated_at: 'now' } };
  const ctx = {
    console, Promise, Date,
    getSupabaseClient: () => fakeClient(state),
    _restoreProjectSnapshot: function (d) { ctx._restored = d; },
    _activeCloudProjectId: null, _activeCloudDocVersion: null, _dirtySinceSave: true,
    showToast: () => {}, closeCloudProjectsModal: () => {},
    _rtUpdatePresenceProject: () => { ctx._presence = true; },
    window: {}
  };
  ctx.window.__slCloudSyncRebase = () => { ctx._rebased = true; };
  ctx.window.SafetyLabCRDT = { adoptModel: () => { ctx._adopted = true; } };
  vm.createContext(ctx);
  vm.runInContext(src + '; globalThis.__p = _loadCloudProject("pid-1234-5678");', ctx);
  return ctx.__p.then(() => {
    check('open-from-cloud SETS the version token from the document row', ctx._activeCloudDocVersion === 7, 'got ' + ctx._activeCloudDocVersion);
    check('open-from-cloud clears the dirty flag (the loaded copy IS the saved copy)', ctx._dirtySinceSave === false);
    check('open-from-cloud rebases the cloud_sync shrink baseline', ctx._rebased === true);
    check('open-from-cloud tells CRDT to adopt the model (no stale-row union)', ctx._adopted === true);
    check('open-from-cloud restored the snapshot it fetched', ctx._restored && ctx._restored.projectName === 'P');
  });
})();

// 5 Sep 2026 — saveProjectToCloud now consults the shared controlled-data check
// before it reaches the writer, so a sandbox running it in isolation must carry
// that check too. Extracting the REAL functions rather than stubbing them means
// these suites also prove the fence does not block an ORDINARY project — a stub
// returning null would prove nothing. `projectConfig: {}` is added to each
// context for the same reason the crdt sandbox needed it: in the browser it is a
// bare global, not a window property, and the fence fails CLOSED without it.
const FENCE_SRC = (function () {
  const a = helpers.indexOf('function _slCloudBlockedForControlled');
  const b = helpers.indexOf('\ntry {', a);
  return a >= 0 && b > a ? helpers.slice(a, b) : '';
})();
if (!FENCE_SRC) { console.log('  FAIL  could not extract the controlled-data fence from helpers_modules'); process.exit(1); }

// ---- 2. saveProjectToCloud: the three token postures -----------------------
function runSave(opts) {
  const src = fn(helpers, 'saveProjectToCloud');
  if (!src) return Promise.reject(new Error('saveProjectToCloud not extracted'));
  const state = { doc: opts.doc, raceOnce: !!opts.raceOnce };
  const events = [];
  const ctx = {
    console, Promise, Date, JSON,
    getSupabaseClient: () => fakeClient(state),
    _cloudSignedOut: () => false,
    getActiveWorkspaceId: () => 'ws1',
    _supabaseSession: { user: { id: 'u1' } },
    _buildProjectSnapshot: () => ({ acFhaData: [{ internalId: 'S' }], projectConfig: {} }),
    projectConfig: {}, projectName: 'proj', _activeCloudProjectId: 'pid-1',
    _activeCloudDocVersion: opts.token,
    _ensureCloudProject: () => Promise.resolve('pid-1'),
    _recordSaveHistory: () => Promise.resolve(),
    _bankWorkingState: () => { events.push('bank'); },
    _loadCloudProject: () => { events.push('load'); return Promise.resolve(); },
    showToast: () => {}, setTimeout, clearTimeout, Object, Array, String, __slabCloudQuietMs: 5,
    window: { confirm: (msg) => { events.push('confirm'); ctx._confirmMsg = msg; return opts.confirmAnswer; } }
  };
  vm.createContext(ctx);
  vm.runInContext(w + ';' + FENCE_SRC + ';' + src + '; globalThis.__p = saveProjectToCloud();', ctx);
  return ctx.__p.then(() => ({ ctx, events, calls: state.calls, state,
    writes: state.calls.filter(c => c.t === 'project_documents' && (c.op === 'update' || c.op === 'insert') && c.ok !== false),
    attempts: state.calls.filter(c => c.t === 'project_documents' && (c.op === 'update' || c.op === 'insert')),
    upserts: state.calls.filter(c => c.op === 'upsert' && c.t === 'project_documents') }));
}

const saveChecks = (async () => {
  // a) null token over an existing v5 doc: adopt, never regress, never prompt
  let r = await runSave({ token: null, doc: { version: 5 } });
  check('null token + existing doc: NO conflict prompt', !r.events.includes('confirm'));
  check('null token + existing doc: version ADOPTED — writes 6, never 1', r.writes.length === 1 && r.writes[0].p.version === 6, r.writes[0] && String(r.writes[0].p.version));

  // b) stale token, user cancels: bank BEFORE prompt, load the cloud copy, no write
  r = await runSave({ token: 3, doc: { version: 5 }, confirmAnswer: false });
  check('stale token: conflict prompt raised', r.events.includes('confirm'));
  check('stale token: in-memory state BANKED before the prompt', r.events.indexOf('bank') !== -1 && r.events.indexOf('bank') < r.events.indexOf('confirm'), r.events.join(','));
  check('stale token + Cancel: loads the cloud copy, writes nothing', r.events.includes('load') && r.attempts.length === 0);
  check('the prompt no longer asserts "someone else"', !/someone else/i.test(r.ctx._confirmMsg || ''), r.ctx._confirmMsg);

  // c) stale token, user overwrites: resync then write cur+1
  r = await runSave({ token: 3, doc: { version: 5 }, confirmAnswer: true });
  check('stale token + OK: overwrites at cur+1 (6), not token+1 (4)', r.writes.length === 1 && r.writes[0].p.version === 6, r.writes[0] && String(r.writes[0].p.version));

  // d) matching token: normal save, no prompt, no bank
  r = await runSave({ token: 5, doc: { version: 5 } });
  check('matching token: silent save at 6, no prompt, no bank', r.writes.length === 1 && r.writes[0].p.version === 6 && !r.events.includes('confirm') && !r.events.includes('bank'));

  // ---- 2 Sep 2026: the write is CONDITIONAL — a stale write is impossible at the server ----
  check('the write is a conditional UPDATE (no blind upsert remains)', r.upserts.length === 0 && r.writes[0].op === 'update');
  check('the write carries its precondition: WHERE version = the token this tab read', Array.isArray(r.writes[0].eqs) && r.writes[0].eqs.some(e => e[0] === 'version' && e[1] === 5));

  // e) the race the pre-check cannot see: another writer lands BETWEEN this tab's check and its write
  r = await runSave({ token: 5, doc: { version: 5 }, raceOnce: true, confirmAnswer: true });
  check('race: the stale write (v6 over a server now at v6) is REFUSED — zero rows, nothing overwritten', r.attempts[0].ok === false && r.attempts[0].p.version === 6);
  check('race: banked + asked before any retry', r.events.includes('bank') && r.events.includes('confirm'));
  check('race + OK: resyncs to the server (6) and lands at 7 — one retry, then done', r.writes.length === 1 && r.writes[0].p.version === 7 && r.attempts.length === 2 && r.state.serverVersion === 7);
  r = await runSave({ token: 5, doc: { version: 5 }, raceOnce: true, confirmAnswer: false });
  check('race + Cancel: refused write, cloud copy loaded, no successful write', r.writes.length === 0 && r.events.includes('load'));

  // f) no document row yet: INSERT at version 1
  r = await runSave({ token: null, doc: null });
  check('no row yet: inserted at version 1, no prompt', r.writes.length === 1 && r.writes[0].op === 'insert' && r.writes[0].p.version === 1 && !r.events.includes('confirm'));

  // g) SERIALIZED + COALESCED: rapid-fire calls in ONE tab never overlap and never trip the guard on themselves
  {
    const src = fn(helpers, 'saveProjectToCloud');
    const state = { doc: { version: 5 }, slowMs: 8 };
    const events = [];
    const ctx = {
      console, Promise, Date, JSON,
      getSupabaseClient: () => fakeClient(state), _cloudSignedOut: () => false, getActiveWorkspaceId: () => 'ws1',
      _supabaseSession: { user: { id: 'u1' } }, _buildProjectSnapshot: () => ({ projectConfig: {} }),
      projectConfig: {}, projectName: 'proj', _activeCloudProjectId: 'pid-1', _activeCloudDocVersion: 5,
      _ensureCloudProject: () => Promise.resolve('pid-1'), _recordSaveHistory: () => Promise.resolve(),
      _bankWorkingState: () => { events.push('bank'); }, _loadCloudProject: () => { events.push('load'); return Promise.resolve(); },
      showToast: () => {}, setTimeout, clearTimeout, Object, Array, String, __slabCloudQuietMs: 5, window: { confirm: () => { events.push('confirm'); return true; } }
    };
    vm.createContext(ctx);
    vm.runInContext(w + ';' + FENCE_SRC + ';' + src + '; globalThis.__p1 = saveProjectToCloud();', ctx);
    await new Promise(r => setTimeout(r, 2));   // run #1 is now in flight on its slow version read (already past the queue gate)
    vm.runInContext('globalThis.__rest = Promise.all([saveProjectToCloud(), saveProjectToCloud(), saveProjectToCloud()]);', ctx);
    await ctx.__p1; await ctx.__rest;
    const writes = state.calls.filter(c => c.t === 'project_documents' && c.op === 'update' && c.ok !== false);
    check('1 in-flight + 3 rapid same-tab saves: NO self-conflict prompt, NO bank', !events.includes('confirm') && !events.includes('bank'), events.join(','));
    check('they coalesce to exactly 2 real writes (the one in flight + ONE follow-up for the three)', writes.length === 2, 'writes=' + writes.length);
    check('…and they are serialized: versions strictly climb 6 then 7', writes.map(w => w.p.version).join(',') === '6,7' && ctx._activeCloudDocVersion === 7, writes.map(w => w.p.version).join(','));
    check('the tab token ends in sync with the server', ctx._activeCloudDocVersion === state.serverVersion);
  }

  // h) 2 Sep 2026 — THE LIVE DEFECT: the silent 12 s autosave (cloud_sync._tick) firing while a
  //    manual save is in flight, in ONE tab. Before: two independent writers, the autosave a blind
  //    upsert → the manual path's conditional write refused by its own tab's autosave → "saved cloud
  //    copy changed" dialog with nobody else in the project (and, in the other interleaving, the
  //    older snapshot landing over the newer one). Now: one shared chain, both conditional.
  {
    const saveSrc = fn(helpers, 'saveProjectToCloud');
    const tickSrc = fn(c, '_tick'), pushSrc = fn(c, '_push'), queueSrc = fn(c, '_writer');
    check('cloud_sync _tick/_push/_writer extracted', !!tickSrc && !!pushSrc && !!queueSrc);
    const state = { doc: { version: 5 }, slowMs: 8 };
    const events = [];
    const ctx = {
      console: { warn: (m) => events.push('warn:' + m), error: () => {}, info: () => {}, log: () => {} }, Promise, Date, JSON, Object, Array, String, setTimeout,
      getSupabaseClient: () => fakeClient(state), _cloudSignedOut: () => false, getActiveWorkspaceId: () => 'ws1',
      _supabaseSession: { user: { id: 'u1' } }, _buildProjectSnapshot: () => ({ acFhaData: [{ internalId: 'S' }], projectConfig: {} }),
      projectConfig: {}, projectName: 'proj', _activeCloudProjectId: 'pid-1', _activeCloudDocVersion: 5, _dirtySinceSave: true, _autosaveLastWrite: 100,
      _ensureCloudProject: () => Promise.resolve('pid-1'), _recordSaveHistory: () => Promise.resolve(),
      _bankWorkingState: () => { events.push('bank'); }, _loadCloudProject: () => { events.push('load'); return Promise.resolve(); },
      showToast: () => {}, setTimeout, clearTimeout, __slabCloudQuietMs: 5, window: { confirm: () => { events.push('confirm'); return true; }, SL_CLOUD_AUTOSAVE: true }
    };
    vm.createContext(ctx);
    const preamble = `
      var _inFlight = false, _lastPushedTs = 0, _lastPushedItems = null, _itarNoticeShown = false;
      function _on(){ return true; } function _userId(){ return 'u1'; } function _client(){ return getSupabaseClient(); }
      function _wsId(){ return 'ws1'; } function _dirty(){ return _dirtySinceSave === true; } function _pid(){ return _activeCloudProjectId; }
      function _docVer(){ return _activeCloudDocVersion; } function _lastLocalWrite(){ return _autosaveLastWrite; }
      function _snapshot(){ return _buildProjectSnapshot(); } function _hasRealContent(){ return true; } function _name(){ return projectName; }
      function _wouldGut(){ return false; } function _contentItems(){ return 1; } function _itarLocalOnlyNotice(){}
    `;
    vm.runInContext(w + ';' + FENCE_SRC + ';' + saveSrc + ';' + preamble + queueSrc + ';' + pushSrc + ';' + tickSrc + '; globalThis.__t = _tick; globalThis.__s = saveProjectToCloud;', ctx);
    // manual save first, autosave tick while it is in flight on its slow version read
    vm.runInContext('globalThis.__p1 = __s();', ctx);
    await new Promise(r => setTimeout(r, 2));
    vm.runInContext('globalThis.__p2 = __t();', ctx);
    await ctx.__p1; await ctx.__p2;
    const writes = state.calls.filter(x => x.t === 'project_documents' && (x.op === 'update' || x.op === 'insert') && x.ok !== false);
    const refused = state.calls.filter(x => x.t === 'project_documents' && x.op === 'update' && x.ok === false);
    check('manual save + autosave tick in flight together: NO self-conflict prompt, NO bank', !events.includes('confirm') && !events.includes('bank'), events.join(','));
    check('no blind upsert was issued by either writer', !state.calls.some(x => x.op === 'upsert'));
    check('both writes landed, serialized: versions climb 6 then 7', writes.map(w => w.p.version).join(',') === '6,7', writes.map(w => w.p.version).join(','));
    check('nothing was refused — the autosave waited its turn and read the fresh token', refused.length === 0, 'refused=' + refused.length);
    check('the tab token ends in sync with the server', ctx._activeCloudDocVersion === 7 && state.serverVersion === 7);

    // the other order: autosave tick first, manual save while it is in flight
    const state2 = { doc: { version: 5 }, slowMs: 8 }; const events2 = [];
    ctx.getSupabaseClient = () => fakeClient(state2); ctx._activeCloudDocVersion = 5; ctx._autosaveLastWrite = 200;
    ctx._bankWorkingState = () => { events2.push('bank'); }; ctx.window.confirm = () => { events2.push('confirm'); return true; };
    vm.runInContext('_lastPushedTs = 0; globalThis.__p3 = __t();', ctx);
    await new Promise(r => setTimeout(r, 2));
    vm.runInContext('globalThis.__p4 = __s();', ctx);
    await ctx.__p3; const r4 = await ctx.__p4;
    const writes2 = state2.calls.filter(x => x.t === 'project_documents' && x.op === 'update' && x.ok !== false);
    check('autosave first, manual save behind it: no prompt, no bank', !events2.includes('confirm') && !events2.includes('bank'), events2.join(','));
    // 3 Sep 2026 — the writer COALESCES a request that arrives while another is still
    // waiting in the quiet window: one write carries both (the manual caller's fresh
    // snapshot, manual semantics), and both callers resolve on it.
    check('…they coalesce into ONE write (6) — the manual request upgraded the waiting silent slot', writes2.map(w => w.p.version).join(',') === '6' && r4 === true, writes2.map(w => w.p.version).join(',') + ' manual=' + r4);

    // a GENUINE external writer: the autosave's conditional write is refused and it stays silent
    const state3 = { doc: { version: 5 }, raceOnce: true }; const events3 = [];
    ctx.getSupabaseClient = () => fakeClient(state3); ctx._activeCloudDocVersion = 5; ctx._autosaveLastWrite = 300;
    ctx._bankWorkingState = () => { events3.push('bank'); }; ctx.window.confirm = () => { events3.push('confirm'); return true; };
    vm.runInContext('_lastPushedTs = 0; globalThis.__p5 = __t();', ctx);
    await ctx.__p5;
    const ok3 = state3.calls.filter(x => x.t === 'project_documents' && x.op === 'update' && x.ok !== false);
    const ref3 = state3.calls.filter(x => x.t === 'project_documents' && x.op === 'update' && x.ok === false);
    check('external writer lands between the autosave\'s check and write: the stale write is REFUSED', ref3.length === 1 && ok3.length === 0, 'ok=' + ok3.length + ' refused=' + ref3.length);
    check('…and the silent path stays silent: no prompt, no bank, token left for the manual Save to reconcile', !events3.includes('confirm') && !events3.includes('bank') && ctx._activeCloudDocVersion === 5);
  }
})();

// ---- 3. autosave META carries the cloud identity; resume adopts it ---------
(function () {
  const metaLine = /meta\.cloudProjectId[\s\S]{0,200}meta\.cloudDocVersion/.test(helpers);
  check('_writeAutosave meta carries cloudProjectId + cloudDocVersion', metaLine);
  const src = fn(dataOps, '_adoptCloudIdentityFromMeta');
  check('extracted _adoptCloudIdentityFromMeta', !!src);
  if (!src) return;
  const mk = (pid) => { const c = { _activeCloudProjectId: pid, _activeCloudDocVersion: null, _rtUpdatePresenceProject: () => {} }; vm.createContext(c); vm.runInContext(src, c); return c; };
  let c = mk(null);
  vm.runInContext('_adoptCloudIdentityFromMeta({ cloudProjectId: "pid-abcdef12", cloudDocVersion: 4 })', c);
  check('resume adopts identity + version from autosave meta', c._activeCloudProjectId === 'pid-abcdef12' && c._activeCloudDocVersion === 4);
  c = mk('pid-live');
  vm.runInContext('_adoptCloudIdentityFromMeta({ cloudProjectId: "pid-other-99", cloudDocVersion: 9 })', c);
  check('a live identity is never clobbered by meta', c._activeCloudProjectId === 'pid-live' && c._activeCloudDocVersion === null);
  c = mk(null);
  vm.runInContext('_adoptCloudIdentityFromMeta({ cloudProjectId: 42 }); _adoptCloudIdentityFromMeta(null); _adoptCloudIdentityFromMeta({})', c);
  check('junk meta is ignored', c._activeCloudProjectId === null);
  // 2 Sep 2026 — the localStorage adopt line gained `_recoveredTs = (m && m.ts) || 0;`
  // between `recovered = true` and the adopt, so newest-wins can compare IndexedDB against
  // it. The invariant this check protects — the localStorage path adopts the cloud identity
  // — is unchanged; the regex just tolerates the ts capture.
  check('checkAutosaveRecovery adopts on the localStorage path', /_applyProjectData\(parsed\); recovered = true;[^\n]*_adoptCloudIdentityFromMeta\(m\);/.test(dataOps));
  check('checkAutosaveRecovery adopts on the IndexedDB path', /SLDB\.get\(AUTOSAVE_META_KEY\)\.then\(function \(mm\)/.test(dataOps));
})();

// ---- 4. CRDT adopt-model: the resurrection guard, executed -----------------
function runCrdt(adopt) {
  // Minimal fake Y: Map-backed maps, synchronous transact, no-op updates.
  function YMap() { const m = new Map(); return { get: k => m.get(k), set: (k, v) => m.set(k, v), delete: k => m.delete(k), keys: () => m.keys(), get size() { return m.size; } }; }
  const docs = {};
  const fakeY = {
    Doc: function () {
      const maps = {};
      return { getMap: n => (maps[n] = maps[n] || YMap()), transact: (f) => f(), on: () => {}, destroy: () => {}, _maps: maps };
    },
    applyUpdate: () => {}, encodeStateAsUpdate: () => new Uint8Array(0)
  };
  const model = { acFhaData: [{ internalId: 'live-1', fcId: 'FC-1' }] };
  const win = {
    Y: fakeY,
    SafetyLabAI: {},
    getSupabaseClient: () => ({ channel: () => ({ on: function () { return this; }, subscribe: () => {}, send: () => {}, unsubscribe: () => {} }), from: () => ({ select: function () { return this; }, eq: function () { return this; }, maybeSingle: () => Promise.resolve({ data: null }), upsert: () => Promise.resolve({}) }) }),
    isSupabaseSignedIn: () => true,
    getActiveCloudProjectId: () => 'proj-A',
    getActiveWorkspaceId: () => 'ws-A',
    projectConfig: {},
    __crdtCapture: () => JSON.parse(JSON.stringify({ acFunctionsData: [], acFhaData: model.acFhaData, acReqData: [], acAssumptionsData: [], praData: [], zsaData: [], cmaData: [], fmeaData: [], systemsData: [], ftaPages: [] })),
    __crdtApply: (partial) => { if (partial.acFhaData) model.acFhaData = partial.acFhaData; },
    addEventListener: () => {}
  };
  // 5 Sep 2026 — `projectConfig` must exist as a BARE GLOBAL in this sandbox,
  // not only as win.projectConfig, because that is how it exists in the real
  // browser: it is a top-level `let` in a classic script, so it lives in the
  // global lexical environment and is NOT a property of window. This sandbox
  // used to provide only the window property, which meant it was modelling a
  // shape production has never had — and crdt_sync's ITAR fence read that same
  // phantom property, so the sandbox and the defect agreed with each other and
  // the fence's failure was invisible from here. With the fence corrected to
  // read the real variable (SLEnv first, bare identifier second, fail closed),
  // a sandbox without the bare name makes the module refuse to start and
  // _doc() returns null.
  const ctx = { window: win, projectConfig: win.projectConfig, document: { createElement: () => ({}), head: { appendChild: () => {} }, documentElement: { appendChild: () => {} }, getElementById: () => null, body: {} }, console, Promise, Date, JSON, Array, Object, String, Uint8Array, setTimeout: (f) => f(), clearTimeout: () => {}, setInterval: () => {}, navigator: { onLine: true }, location: { search: '' }, localStorage: { getItem: () => null }, crypto: { randomUUID: () => 'aaaaaaaa-bbbb' }, btoa: () => '', atob: () => '' };
  vm.createContext(ctx);
  vm.runInContext(crdtSrc, ctx);
  const CRDT = win.SafetyLabCRDT;
  if (adopt) CRDT.adoptModel();
  CRDT.start();
  // simulate the STALE local/idb doc: a resurrected row the model does not hold
  const ydoc = CRDT._doc();
  const map = ydoc.getMap('col:acFhaData');
  const ord = ydoc.getMap('ord:acFhaData');
  map.set('stale-99', JSON.stringify({ internalId: 'stale-99', fcId: 'FC-OLD' }));
  ord.set('stale-99', 0);
  // drive the reconcile the way start()'s afterLocal would see it: doc has content
  vm.runInContext('window.SafetyLabCRDT.__testReconcile && window.SafetyLabCRDT.__testReconcile()', ctx);
  // no test hook — exercise via the public surface: pullToModel is what start()
  // calls on a content-bearing doc; reach it through a fake remote update path
  return { model, map, CRDT, win };
}
(function () {
  // Without a test hook we assert through module behavior: adoptModel() while
  // started must push the model over the doc (deleting the stale key), and a
  // pullToModel inside the adopt window must not inject stale rows. We reach
  // pullToModel through onLocalChange->pushLocal (adopt) and by checking the
  // doc map contents directly.
  const r = runCrdt(true);
  check('CRDT started in the harness', r.CRDT.status().started === true);
  r.CRDT.adoptModel();   // started + same project -> immediate pushLocal mirrors model
  check('adoptModel mirrors the MODEL into the doc — stale key deleted', r.map.get('stale-99') === undefined);
  check('adoptModel keeps the live row in the doc', typeof r.map.get('live-1') === 'string');
  check('the model never gained the stale row', r.model.acFhaData.every(x => x.internalId !== 'stale-99'));
})();
(function () {
  // Control: WITHOUT adopt, the doc's stale row is what pullToModel would union
  // in — prove the harness can see the bad behavior so the checks above cannot
  // pass vacuously. (pullToModel is internal; its posture is pinned by source.)
  check('pullToModel defers to the model inside the adopt window (source posture)',
    /_adoptUntil && Date\.now\(\) < _adoptUntil[\s\S]{0,80}pushLocal/.test(crdtSrc));
  check('afterLocal honors adopt on the content-bearing branch', /adopt\) pushLocal\(\); else pullToModel\(\)/.test(crdtSrc));
  check('_loadState reconcile honors adopt', /adopt \|\| !had\) pushLocal\(\); else pullToModel\(\)/.test(crdtSrc));
  check('_applyServerRestore adopts too', /__slCloudSyncRebase[\s\S]{0,600}SafetyLabCRDT\.adoptModel/.test(misc));
})();

// ---- 5. cloud_sync autosave: null token adopts, never regresses ------------
(function () {
  check('version read is unconditional; a null token ADOPTS the server version (writer, both modes)',
    /if \(_token\(\) == null\) _setToken\(cur\);/.test(S('cloud_writer.js')));
  check('new-project intake detaches the cloud identity', /__slCloudSyncDetach/.test(S('cloud_sync.js')) && /__slCloudSyncDetach/.test(misc));
  check('session_resume exposes the forced ring capture the bank uses',
    /_ringCaptureForce/.test(S('session_resume.js')) && /_ringCaptureForce/.test(helpers));
})();

// ---- pins: shipped versions floor ------------------------------------------
(function () {
  const p = (re) => { const m = idx.match(re); return m ? parseFloat(m[1]) : 0; };
  check('crdt_sync pin floor >= 1.4', p(/crdt_sync\.js\?v=([\d.]+)/) >= 1.4);
  check('cloud_sync pin floor >= 1.6', p(/cloud_sync\.js\?v=([\d.]+)/) >= 1.6);
  check('misc_fn pin floor >= 66.45', p(/misc_fn_modules\.js\?v=([\d.]+)/) >= 66.45);
  check('helpers pin floor >= 2.57', p(/helpers_modules\.js\?v=([\d.]+)/) >= 2.57);
  check('data_ops pin floor >= 66.24', p(/data_ops_modules\.js\?v=([\d.]+)/) >= 66.24);
})();

Promise.all([saveChecks]).then(() => {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail ? 1 : 0;
}).catch(e => { console.log('  FAIL  suite crashed — ' + e.message); console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed'); process.exitCode = 1; });

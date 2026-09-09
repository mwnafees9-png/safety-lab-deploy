#!/usr/bin/env node
/*
 * Regression — edit_locks.js field-lock claim() must FAIL OPEN when nobody holds the lock.
 *
 * THE DEFECT (9 Sep 2026, found via Daniel's testing). The acquire_edit_lock RPC returns
 * {ok:false, held_by:null} when the caller simply CANNOT hold the lock — signed out, not a
 * member of the project's workspace, or a showcase/demo project. claim() treated ANY ok:false
 * as "someone else is editing" and returned {ok:false}, so the FHA editors (editSysFHA/editACFHA,
 * async + claim-before-open since the 7 Sep field-lock hookup) refused to open and came up empty
 * on every demo/ineligible edit. A phantom holder that does not exist must never block editing —
 * only a REAL holder (held_by set) does; everything else fails OPEN, exactly like local/outage/ITAR.
 *
 * These checks EXECUTE the real edit_locks.js IIFE in a vm with a fake Supabase client whose
 * acquire_edit_lock RPC returns a scripted row. The mutation at the end must go red by exit code.
 *
 * Run: node tests/regression_edit_lock_failopen.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'edit_locks.js'), 'utf8');

function boot(rpcRow, opts) {
  opts = opts || {};
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return rpcRow; },
                   channel: () => ({ on() { return this; }, subscribe() { return this; }, send() {}, unsubscribe() {} }) };
  const ctx = {
    console: { info(){}, warn(){}, error(){}, log(){} },
    Promise, Date, Map, String, Number, Array, Object, JSON, Math,
    setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1, clearTimeout: () => {},
    location: { search: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    getSupabaseClient: () => (opts.noClient ? null : client),
    getActiveCloudProjectId: () => (opts.noProj ? null : 'proj-1'),
    getActiveWorkspaceId: () => 'ws-1',
    SLEnv: { get: (k) => (k === 'projectConfig' ? { isITARControlled: false } : undefined) },
    projectConfig: { isITARControlled: false },
  };
  ctx.window = ctx;
  ctx._supabaseSession = { user: { id: 'me' } };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { api: ctx.SLLocks, calls };
}

(async () => {
  console.log('[failopen] the fix: a refusal with NO holder fails OPEN');
  {
    const e = boot({ data: [{ ok: false, held_by: null, expires_at: null }], error: null });
    const r = await e.api.claim('acfha:1');
    check('ok:false + held_by:null (signed out / not a member / demo) -> claim {ok:true}', r && r.ok === true, JSON.stringify(r));
    check('the RPC was actually called (not short-circuited earlier)', e.calls.some(c => c.name === 'acquire_edit_lock'));
  }
  console.log('[failopen] a REAL holder still blocks');
  {
    const e = boot({ data: [{ ok: false, held_by: 'user-b', expires_at: null }], error: null });
    const r = await e.api.claim('acfha:1');
    check('ok:false + held_by set -> claim {ok:false} (blocks, names the holder)', r && r.ok === false && r.held_by === 'user-b', JSON.stringify(r));
  }
  console.log('[failopen] granting and the other fail-open paths are unchanged');
  {
    const g = boot({ data: [{ ok: true, held_by: 'me', expires_at: new Date(Date.now() + 60000).toISOString() }], error: null });
    check('ok:true -> claim {ok:true}', (await g.api.claim('acfha:1')).ok === true);
    const er = boot({ data: null, error: { message: 'boom' } });
    check('RPC error -> fail OPEN {ok:true}', (await er.api.claim('acfha:1')).ok === true);
    const np = boot({ data: [{ ok: false, held_by: null }], error: null }, { noProj: true });
    check('no cloud project (local mode) -> {ok:true} without calling the RPC', (await np.api.claim('acfha:1')).ok === true && np.calls.length === 0);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

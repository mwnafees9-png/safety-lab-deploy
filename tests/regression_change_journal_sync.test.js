#!/usr/bin/env node
/*
 * Regression — change_journal_sync.js (Stage 3 client wiring, 9 Sep 2026).
 *
 * WHAT IT GUARANTEES. The module mirrors meaningful actions to the server-side append-only
 * change_journal / problem_report_events, and it must:
 *   (1) send only project_id/action/entity/summary — NEVER actor, actor_email, ts, or the
 *       hashes (all server-set by the chain trigger; a client-sent actor would be a forgery lever);
 *   (2) no-op silently when signed out, off a cloud project, or with no client (fail-soft) —
 *       a journaling miss must never block or throw into a real save;
 *   (3) mirror window.jrnl ONLY for allowlisted meaningful engineering kinds, not dev noise;
 *   (4) shape problem-report lifecycle events correctly.
 *
 * These checks EXECUTE the real change_journal_sync.js IIFE in a vm with a fake Supabase client
 * that records every insert. The mutation at the end must go red by exit code.
 *
 * Run: node tests/regression_change_journal_sync.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'change_journal_sync.js'), 'utf8');

// A fake PostgREST-ish client. from(table).insert(row) records the call and returns a thenable.
function makeClient(inserts) {
  return {
    from: (table) => ({
      insert: (row) => { inserts.push({ table, row }); return Promise.resolve({ data: [row], error: null }); },
      select: function () { return this; }, eq: function () { return this; },
      order: function () { return this; }, limit: function () { return Promise.resolve({ data: [], error: null }); }
    })
  };
}

function boot(opts) {
  opts = opts || {};
  const inserts = [];
  const client = makeClient(inserts);
  const ctx = {
    console: { info(){}, warn(){}, error(){}, log(){} },
    Promise, Date, Map, String, Number, Array, Object, JSON, Math,
    setTimeout: (fn) => { return 1; }, clearTimeout: () => {},
    getSupabaseClient: () => (opts.noClient ? null : client),
  };
  ctx.window = ctx;
  ctx._activeCloudProjectId = opts.noProj ? null : 'proj-1';
  ctx._supabaseSession = opts.signedOut ? null : { user: { id: 'me' } };
  // journal.js registers window.jrnl BEFORE change_journal_sync.js loads (script order in index.html);
  // install a base jrnl so the module wraps it at load, exactly as it does in the app.
  const jrnlCalls = [];
  ctx.window.jrnl = function (k, s) { jrnlCalls.push([k, s]); return 'orig-ran'; };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { api: ctx.SLJournal, jrnl: ctx.window.jrnl, inserts, jrnlCalls, ctx };
}

(async () => {
  console.log('[cjs] record(): row shape, and NO server-set fields sent');
  {
    const e = boot();
    e.api.record('baseline.cut', { entity_kind: 'baseline', entity_id: 7, summary: { text: 'Revision 7', label: 'R7' } });
    await Promise.resolve();
    const ins = e.inserts.filter(i => i.table === 'change_journal');
    check('one change_journal insert', ins.length === 1, 'got ' + ins.length);
    const row = ins[0] && ins[0].row || {};
    check('project_id set from active cloud project', row.project_id === 'proj-1');
    check('action carried', row.action === 'baseline.cut');
    check('entity_kind/entity_id carried (id stringified)', row.entity_kind === 'baseline' && row.entity_id === '7', JSON.stringify(row));
    check('summary object preserved', row.summary && row.summary.label === 'R7');
    check('actor NOT sent (server-set)', !('actor' in row));
    check('actor_email NOT sent (server-set)', !('actor_email' in row));
    check('ts NOT sent (server-set)', !('ts' in row));
    check('prev_hash / row_hash NOT sent (server-set)', !('prev_hash' in row) && !('row_hash' in row));
  }

  console.log('[cjs] fail-soft: no-op when signed out / no project / no client, and never throws');
  {
    let threw = false;
    try {
      const so = boot({ signedOut: true }); so.api.record('x', {}); await Promise.resolve();
      check('signed out -> no insert', so.inserts.length === 0);
      const np = boot({ noProj: true }); np.api.record('x', {}); await Promise.resolve();
      check('no cloud project -> no insert', np.inserts.length === 0);
      const nc = boot({ noClient: true }); nc.api.record('x', {}); await Promise.resolve();
      check('no client -> no insert', nc.inserts.length === 0);
    } catch (_) { threw = true; }
    check('record() never throws across the fail-soft paths', threw === false);
  }

  console.log('[cjs] window.jrnl mirror: allowlist only');
  {
    const e = boot();
    e.jrnl('rename', 'renamed A -> B');       // meaningful (allowlisted)
    e.jrnl('fuzz', 'fuzz noise');             // dev noise (NOT allowlisted)
    e.jrnl('self-test', 'engine self-test');  // dev noise
    await Promise.resolve();
    const acts = e.inserts.filter(i => i.table === 'change_journal').map(i => i.row.action);
    check('meaningful jrnl kind mirrored (rename)', acts.indexOf('rename') !== -1, JSON.stringify(acts));
    check('noise jrnl kind NOT mirrored (fuzz)', acts.indexOf('fuzz') === -1);
    check('noise jrnl kind NOT mirrored (self-test)', acts.indexOf('self-test') === -1);
    check('exactly one mirror insert (only the allowlisted one)', acts.length === 1, JSON.stringify(acts));
  }

  console.log('[cjs] window.jrnl wrap preserves the original behavior + return');
  {
    const e = boot();
    const r = e.jrnl('bind', 'thread bound');
    check('wrapped jrnl still runs the ORIGINAL (returns its value)', r === 'orig-ran', String(r));
    check('original jrnl actually received the call', e.jrnlCalls.some(c => c[0] === 'bind'));
    check('wrapped jrnl is flagged so it is not double-wrapped', e.jrnl._slMirror === true);
  }

  console.log('[cjs] problemEvent(): event-log row shape');
  {
    const e = boot();
    e.api.problemEvent('pr-1', 'opened', { status: 'open', title: 'CB latent' });
    e.api.problemEvent('pr-1', 'resolved', { status: 'closed', ecnId: 'ecn-1' });
    await Promise.resolve();
    const ev = e.inserts.filter(i => i.table === 'problem_report_events');
    check('two problem_report_events inserts', ev.length === 2, 'got ' + ev.length);
    check('report_id + event carried', ev[0].row.report_id === 'pr-1' && ev[0].row.event === 'opened');
    check('payload preserved', ev[1].row.payload && ev[1].row.payload.ecnId === 'ecn-1');
    check('actor/ts/hashes NOT sent on events', !('actor' in ev[0].row) && !('ts' in ev[0].row) && !('row_hash' in ev[0].row));
    check('problemEvent no-ops without reportId', (function(){ const b = boot(); b.api.problemEvent('', 'opened', {}); return b.inserts.length === 0; })());
  }

  // -------------------------------------------------------------- MUTATION GUARD
  // If the allowlist gate is removed (mirror EVERY jrnl kind), the noise-not-mirrored checks fail.
  console.log('[cjs] mutation guard (self-check of the allowlist gate)');
  {
    const mutated = SRC.replace('if (JRNL_MEANINGFUL[String(kind)]) record(', 'if (true || JRNL_MEANINGFUL[String(kind)]) record(');
    const inserts = [];
    const client = makeClient(inserts);
    const ctx = { console: { log(){},warn(){},error(){},info(){} }, Promise, Date, Map, String, Number, Array, Object, JSON, Math,
      setTimeout: () => 1, clearTimeout: () => {}, getSupabaseClient: () => client };
    ctx.window = ctx; ctx._activeCloudProjectId = 'proj-1'; ctx._supabaseSession = { user: { id: 'me' } };
    ctx.window.jrnl = function () {};   // base jrnl for the module to wrap
    vm.createContext(ctx); vm.runInContext(mutated, ctx);
    ctx.window.jrnl('fuzz', 'noise'); await Promise.resolve();
    const leaked = inserts.filter(i => i.table === 'change_journal' && i.row.action === 'fuzz').length > 0;
    check('MUTATION (drop allowlist gate) would let noise leak -> guarded here', leaked === true);
  }

  console.log('\n[cjs] ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

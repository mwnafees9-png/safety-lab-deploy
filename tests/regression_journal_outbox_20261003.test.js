#!/usr/bin/env node
/*
 * Regression: the change journal keeps rows that fail to send (3 Oct 2026, batch 4).
 *
 * A journal row was sent once and forgotten, so offline or a dropped connection meant the
 * change history silently lost entries. Now: an outbox kept in the browser, retried oldest first
 * on a back-off and when the connection returns; refusals (no edit rights) are not retried; a
 * row only goes out under the account that made it; the time the change was really made rides
 * in summary.client_at (the server stamps its own insert time).
 *
 * Run: node tests/regression_journal_outbox_20261003.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'site', 'change_journal_sync.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

function boot(opts) {
  opts = opts || {};
  const sent = [], store = opts.store || {};
  let mode = opts.mode || 'ok';
  const client = { from: (table) => ({ insert: (row) => {
    if (mode === 'throw') return Promise.reject(new TypeError('Failed to fetch'));
    if (mode === 'down') return Promise.resolve({ data: null, error: { message: 'Service Unavailable' }, status: 503 });
    if (mode === 'denied') return Promise.resolve({ data: null, error: { message: 'new row violates row-level security policy', code: '42501' }, status: 403 });
    sent.push({ table, row }); return Promise.resolve({ data: [row], error: null, status: 201 });
  } }) };
  const timers = [];
  const ctx = { console: { info(){}, warn(){}, error(){}, log(){} }, Promise, Date, Map, String, Number, Array, Object, JSON, Math,
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
    getSupabaseClient: () => client,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    addEventListener: () => {} };
  ctx.window = ctx;
  ctx._activeCloudProjectId = 'proj-1';
  ctx._supabaseSession = { user: { id: opts.uid || 'me' } };
  vm.createContext(ctx); vm.runInContext(opts.source || SRC, ctx);
  return { J: ctx.SLJournal, sent, store, ctx, setMode: m => { mode = m; }, runTimers: () => { const t = timers.splice(0); t.forEach(f => { try { f(); } catch (_) {} }); } };
}

(async function () {
  { const b = boot(); b.J.record('baseline', { summary: { text: 'R1' } }); await flush();
    check('online: sent at once, outbox empty', b.sent.length === 1 && b.J._outbox().length === 0);
    check('the real time of the change rides along (client_at)', /^\d{4}-\d\d-\d\dT/.test(b.sent[0].row.summary.client_at || '')); }
  { const b = boot({ mode: 'throw' }); b.J.record('baseline', { summary: { text: 'R1' } }); b.J.record('rename', { summary: { text: 'R2' } }); await flush();
    check('offline: nothing lost, both rows kept in order', b.sent.length === 0 && b.J._outbox().length === 2 && b.J._outbox()[0].row.action === 'baseline');
    check('kept across a reload (stored in the browser)', JSON.parse(b.store['slab.journal.outbox.v1']).length === 2);
    b.setMode('ok'); b.runTimers(); await flush();
    check('back online: sent oldest first, outbox empty', b.sent.length === 2 && b.sent[0].row.action === 'baseline' && b.sent[1].row.action === 'rename' && b.J._outbox().length === 0); }
  { const b = boot({ mode: 'down' }); b.J.record('baseline', {}); await flush();
    check('server error (503): kept for retry', b.J._outbox().length === 1); }
  { const b = boot({ mode: 'denied' }); b.J.record('baseline', {}); await flush();
    check('refused (no edit rights): not retried, not kept', b.J._outbox().length === 0 && b.sent.length === 0); }
  { const store = {}; const a = boot({ mode: 'throw', store, uid: 'alice' }); a.J.record('baseline', { summary: { text: 'by alice' } }); await flush();
    const b = boot({ store, uid: 'bob' }); await b.J._drain(); await flush();
    check('another person signed in: alice\'s row is NOT sent under bob', b.sent.length === 0 && b.J._outbox().length === 1);
    const c = boot({ store, uid: 'alice' }); await c.J._drain(); await flush();
    check('alice back: her row goes out', c.sent.length === 1 && c.sent[0].row.summary.text === 'by alice'); }
  { const b = boot({ mode: 'throw' }); b.J.problemEvent('pr-1', 'opened', { status: 'open' }); await flush();
    check('problem-report events use the same outbox', b.J._outbox().length === 1 && b.J._outbox()[0].table === 'problem_report_events'); }
  { const mut = SRC.replace('if (r === \'retry\') { _scheduleRetry(); break; }', '');
    check('mutation site present', mut !== SRC);
    const b = boot({ mode: 'throw', source: mut }); b.J.record('baseline', {}); await flush();
    check('MUTATION: without the retry branch an offline row is thrown away', b.J._outbox().length === 0 && b.sent.length === 0); }
  console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

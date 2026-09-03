#!/usr/bin/env node
/**
 * Regression — cloud_writer.js: the ONE writer of project_documents (3 Sep 2026).
 *
 * Waqas, after the persistence inventory: "yes on 1" — consolidate the cloud write.
 * This suite pins the INVARIANT, not a mechanism:
 *   · no file outside cloud_writer.js composes a write to project_documents (census
 *     over every served JS — a second writer fails the wall);
 *   · one queue per tab; a burst inside the quiet window is ONE trailing write; flush()
 *     cuts the wait (pagehide);
 *   · every write is conditional on the version this tab read; a refusal is never an
 *     overwrite: manual → bank, then ask — or, when this user holds a workspace lock,
 *     audit a LOCK BREACH (change log + journal), resync, keep the holder's state, no
 *     dialog; silent → skip, audit once per server version under a held lock;
 *   · the tab write lease gates the cloud path.
 * Every behavioural check EXECUTES the real module in a vm against a fake CAS server.
 * Mutations at the end must go red by exit code.
 *
 * Run: node tests/regression_cloud_writer.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const W = S('cloud_writer.js');
const PRECOND = /\.eq\('project_id', projectId\)\.eq\('version', expected\)[\s\S]{0,80}\.select\('version'\)/;
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }

// ---- 1. the census: exactly one writer -------------------------------------
console.log('\n[1] census — every served JS that writes project_documents');
{
  const files = fs.readdirSync(SITE).filter(f => f.endsWith('.js'));
  const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  const writers = [];
  files.forEach(f => {
    const src = decomment(S(f));
    // a write = from('project_documents') followed within 400 chars by .update( / .insert( / .upsert( / .delete(
    const re = /from\(\s*['"]project_documents['"]\s*\)[\s\S]{0,400}?\.(update|insert|upsert|delete)\s*\(/g;
    let m; while ((m = re.exec(src))) writers.push(f + ':' + m[1]);
    // and any rpc that could write the document row goes through the recovery RPCs only
  });
  const outside = writers.filter(x => !x.startsWith('cloud_writer.js:'));
  check('cloud_writer.js composes the writes (insert + update)', writers.some(x => x === 'cloud_writer.js:insert') && writers.some(x => x === 'cloud_writer.js:update'));
  check('NO other served file writes project_documents (' + files.length + ' files scanned)', outside.length === 0, outside.join(', '));
  check('no upsert to project_documents anywhere', !writers.some(x => x.endsWith(':upsert')));
  check('index.html loads cloud_writer.js right after helpers_modules', /helpers_modules\.js\?v=[\d.]+" defer><\/script>\s*<script src="cloud_writer\.js\?v=/.test(S('index.html')));
  check('helpers.saveProjectToCloud is a thin caller (hands the writer a prepare, manual mode)', /W\.write\(\{ mode: 'manual', prepare \}\)/.test(S('helpers_modules.js')));
  check('cloud_sync is a thin caller (silent mode)', /W\.write\(\{ mode: 'silent', prepare: prepare \}\)/.test(S('cloud_sync.js')));
  check('commitSaveChanges only claims a cloud save when one landed', /cloud = \(await saveProjectToCloud\(\)\) === true/.test(S('helpers_modules.js')));
  check('the write carries its precondition: WHERE version = the token this tab read, and reads back what landed', PRECOND.test(W));
}

// ---- the fake CAS server ----------------------------------------------------
function fakeClient(state) {
  const calls = state.calls || (state.calls = []);
  if (state.serverVersion === undefined) state.serverVersion = (state.doc && state.doc.version != null) ? state.doc.version : null;
  function table(t) {
    const q = { _t: t, _op: null, _payload: null, _eqs: [] };
    q.select = function (cols) { if (q._op !== 'update') q._op = 'select'; q._cols = cols; return q; };
    q.eq = function (c, v) { q._eqs.push([c, v]); const last = calls[calls.length - 1]; if (last && last.op === 'update' && last.t === t) last.eqs = q._eqs.slice(); return q; };
    q.update = function (p) { q._op = 'update'; q._payload = p; calls.push({ t, op: 'update', p }); return q; };
    q.upsert = function (p) { calls.push({ t, op: 'upsert', p }); return Promise.resolve({ error: null }); };
    q.insert = function (p) {
      const c = { t, op: 'insert', p }; calls.push(c);
      if (t === 'project_documents') {
        if (state.serverVersion == null) { state.serverVersion = p.version; c.ok = true; return Promise.resolve({ error: null }); }
        c.ok = false; return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
      }
      return Promise.resolve({ error: null });
    };
    q.maybeSingle = function () {
      calls.push({ t, op: 'maybeSingle' });
      const row = state.serverVersion == null ? null : { version: state.serverVersion };
      const d = state.slowMs || 0;
      return new Promise(res => setTimeout(() => res({ data: row, error: null }), d));
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
function sandbox(opts) {
  const state = { doc: { version: opts.version === undefined ? 5 : opts.version }, raceOnce: !!opts.raceOnce, slowMs: opts.slowMs || 0 };
  const events = [];
  const ctx = {
    console: { warn: (m) => events.push('warn'), error: () => {}, log: () => {}, info: () => {} }, Promise, Date, JSON, Object, Array, String, setTimeout, clearTimeout,
    __slabCloudQuietMs: opts.quietMs == null ? 5 : opts.quietMs,
    _activeCloudDocVersion: opts.token === undefined ? 5 : opts.token,
    _recordSaveHistory: () => { events.push('history'); return Promise.resolve(); },
    _bankWorkingState: () => { events.push('bank'); },
    _loadCloudProject: () => { events.push('load'); return Promise.resolve(); },
    showToast: (m) => { events.push('toast:' + String(m).slice(0, 60)); },
    slConfirm: (m) => { events.push('confirm'); return Promise.resolve(opts.confirmAnswer !== false); },
    _wsLog: (scope, sysId, action, summary) => { events.push('wslog:' + action + ':' + scope + (sysId ? '/' + sysId : '')); ctx._breachSummary = summary; },
    jrnl: (kind, text) => { events.push('jrnl:' + kind); },
    _wsUser: () => ({ email: 'me@x.com', name: 'Me' }),
    _wsGetLock: (scope) => (opts.acLock === undefined ? null : opts.acLock),
    systemsData: opts.systems || [],
    window: {},
  };
  if (opts.lease !== undefined) { ctx.tgHasLease = () => opts.lease; ctx.tgAcquire = () => ({ ok: !!opts.acquireOk, conflict: false }); }
  vm.createContext(ctx);
  vm.runInContext((opts.src || W), ctx);
  const client = fakeClient(state);
  const prepare = () => Promise.resolve({ client, projectId: 'p1', userId: 'u1', snapshot: { acFhaData: [1] } });
  ctx.__prepare = prepare;
  const write = (mode, prep) => vm.runInContext('SLCloudWriter.write({ mode: "' + mode + '", prepare: __prepare })', Object.assign(ctx, { __prepare: prep || prepare }));
  const writes = () => state.calls.filter(c => c.t === 'project_documents' && (c.op === 'update' || c.op === 'insert') && c.ok !== false);
  const refused = () => state.calls.filter(c => c.t === 'project_documents' && (c.op === 'update' || c.op === 'insert') && c.ok === false);
  return { ctx, state, events, write, writes, refused, client };
}

(async function () {
  // ---- 2. plain postures ------------------------------------------------------
  console.log('\n[2] token postures, executed');
  {
    let sb = sandbox({ token: 5, version: 5 }); let r = await sb.write('manual');
    check('matching token: one conditional write at 6, ok, history recorded, no prompt', r.ok && r.version === 6 && sb.writes().length === 1 && sb.writes()[0].eqs.some(e => e[0] === 'version' && e[1] === 5) && sb.events.includes('history') && !sb.events.includes('confirm'), JSON.stringify(r) + ' ' + sb.events.join(','));
    sb = sandbox({ token: null, version: 5 }); r = await sb.write('manual');
    check('null token over an existing doc ADOPTS the server version: writes 6, never 1', r.ok && r.version === 6 && sb.writes()[0].p.version === 6);
    sb = sandbox({ token: null, version: null }); r = await sb.write('silent');
    check('no row yet (silent): INSERT at version 1', r.ok && r.version === 1 && sb.writes()[0].op === 'insert');
    sb = sandbox({ token: 5, version: 5, raceOnce: true, confirmAnswer: true }); r = await sb.write('manual');
    check('race between check and write (manual, no lock): refused → bank → ask → resync → lands at 7', r.ok && r.version === 7 && sb.refused().length === 1 && sb.events.indexOf('bank') < sb.events.indexOf('confirm'), JSON.stringify(r) + ' ' + sb.events.join(','));
    sb = sandbox({ token: 5, version: 5, raceOnce: true, confirmAnswer: false }); r = await sb.write('manual');
    check('…and Cancel loads the cloud copy, writes nothing after the refusal', !r.ok && r.reason === 'cancelled' && sb.writes().length === 0 && sb.events.includes('load'));
    sb = sandbox({ token: 5, version: 5, raceOnce: true }); r = await sb.write('silent');
    check('race (silent, no lock): refused once, SKIPPED — no bank, no ask, no audit, token untouched', !r.ok && r.reason === 'refused' && sb.refused().length === 1 && sb.writes().length === 0 && !sb.events.includes('bank') && !sb.events.includes('confirm') && !sb.events.some(e => /wslog/.test(e)) && sb.ctx._activeCloudDocVersion === 5, JSON.stringify(r) + ' ' + sb.events.join(','));
    sb = sandbox({ token: 3, version: 5, confirmAnswer: true }); r = await sb.write('manual');
    check('stale token, pre-check mismatch (manual): bank, ask, resync, lands at 6', r.ok && r.version === 6 && sb.events.includes('bank') && sb.events.includes('confirm'));
    sb = sandbox({ token: 3, version: 5 }); r = await sb.write('silent');
    check('stale token, pre-check mismatch (silent): skipped, nothing written', !r.ok && r.reason === 'refused' && sb.writes().length === 0);
    sb = sandbox({ token: 5, version: 5 }); r = await sb.write('manual', () => Promise.resolve(null));
    check('prepare() returning null = the caller declined: nothing touched', !r.ok && r.reason === 'skipped' && sb.state.calls.length === 0);
  }

  // ---- 3. lock breach ---------------------------------------------------------
  console.log('\n[3] a refusal while this user holds a workspace lock is a BREACH, not a dialog');
  {
    const held = { by: 'ME@x.com', name: 'Me', at: 1 };
    let sb = sandbox({ token: 5, version: 5, raceOnce: true, acLock: held }); let r = await sb.write('manual');
    check('manual + held aircraft lock: no confirm, banked, breach logged to change log AND journal, resynced, holder state lands at 7',
      r.ok && r.version === 7 && !sb.events.includes('confirm') && sb.events.includes('bank') && sb.events.includes('wslog:lock-breach:ac') && sb.events.includes('jrnl:lock-breach'), JSON.stringify(r) + ' ' + sb.events.join(','));
    check('…the audit names the versions', /v5 → v6/.test(sb.ctx._breachSummary || ''), sb.ctx._breachSummary);
    check('…and the engineer is told (warning toast), never asked', sb.events.some(e => /^toast:The cloud copy changed while/.test(e)));
    sb = sandbox({ token: 5, version: 5, raceOnce: true, systems: [{ id: 'sys-1', name: 'Flight Controls', lock: { by: 'me@x.com' } }, { id: 'sys-2', name: 'Fuel', lock: { by: 'other@x.com' } }] }); r = await sb.write('manual');
    check('a SYSTEM lock held by me counts; a lock held by someone else does not', r.ok && sb.events.includes('wslog:lock-breach:system/sys-1') && !sb.events.includes('wslog:lock-breach:system/sys-2'), sb.events.join(','));
    sb = sandbox({ token: 5, version: 5, raceOnce: true, acLock: { by: 'other@x.com' }, confirmAnswer: true }); r = await sb.write('manual');
    check('a lock held by ANOTHER user is not mine: the ordinary ask happens', r.ok && sb.events.includes('confirm') && !sb.events.some(e => /wslog/.test(e)));
    sb = sandbox({ token: 5, version: 5, raceOnce: true, acLock: held }); r = await sb.write('silent');
    check('silent + held lock: skipped (no write, no bank) but AUDITED', !r.ok && r.reason === 'refused' && sb.writes().length === 0 && !sb.events.includes('bank') && sb.events.includes('wslog:lock-breach:ac'), sb.events.join(','));
    const before = sb.events.filter(e => e === 'wslog:lock-breach:ac').length;
    r = await sb.write('silent');
    check('…audited ONCE per observed server version, not on every 12 s tick', sb.events.filter(e => e === 'wslog:lock-breach:ac').length === before, 'audits=' + sb.events.filter(e => e === 'wslog:lock-breach:ac').length);
  }

  // ---- 4. the tab lease gates the cloud path -----------------------------------
  console.log('\n[4] tab write lease');
  {
    let sb = sandbox({ token: 5, version: 5, lease: false, acquireOk: false }); let r = await sb.write('manual');
    check('no lease and cannot acquire (another tab is active): NO document write, reason=lease, engineer told', !r.ok && r.reason === 'lease' && sb.writes().length === 0 && sb.refused().length === 0 && sb.events.some(e => /^toast:This project is active in another tab/.test(e)), JSON.stringify(r) + ' ' + sb.events.join(','));
    sb = sandbox({ token: 5, version: 5, lease: false, acquireOk: false }); r = await sb.write('silent');
    check('…silent mode: gated the same, silently', !r.ok && r.reason === 'lease' && !sb.events.some(e => /^toast/.test(e)));
    sb = sandbox({ token: 5, version: 5, lease: false, acquireOk: true }); r = await sb.write('manual');
    check('no lease but the lease is FREE: acquired, write proceeds', r.ok && r.version === 6);
    sb = sandbox({ token: 5, version: 5 }); r = await sb.write('manual');
    check('tab_guard absent (no lease model): no gate', r.ok);
  }

  // ---- 5. queue: coalesce, quiet window, flush, mode upgrade --------------------
  console.log('\n[5] one queue per tab');
  {
    let sb = sandbox({ token: 5, version: 5, quietMs: 40, slowMs: 5 });
    const p1 = sb.write('manual');
    await new Promise(r => setTimeout(r, 2));                 // #1 in flight
    const rest = Promise.all([sb.write('manual'), sb.write('silent'), sb.write('manual')]);
    const r1 = await p1; const rs = await rest;
    check('1 in flight + 3 in a burst → exactly 2 writes, 6 then 7; every caller resolves ok', r1.ok && rs.every(x => x.ok) && sb.writes().map(w => w.p.version).join(',') === '6,7', sb.writes().map(w => w.p.version).join(','));
    check('the burst waited the quiet window (trailing write, not immediate)', rs[0].version === 7);
    // flush cuts the quiet window
    sb = sandbox({ token: 5, version: 5, quietMs: 2000 });
    await sb.write('manual');
    const t0 = Date.now(); const p = sb.write('manual'); vm.runInContext('SLCloudWriter.flush()', sb.ctx); const r2 = await p;
    check('flush() cuts the quiet window (pagehide never leaves a write behind)', r2.ok && r2.version === 7 && (Date.now() - t0) < 500, (Date.now() - t0) + 'ms');
    // mode upgrade: a silent slot waiting in the quiet window, then a manual request → manual semantics
    sb = sandbox({ token: 5, version: 5, quietMs: 60, confirmAnswer: true });
    await sb.write('manual');                                   // lands 6; quiet window opens
    sb.state.serverVersion = 9;                                 // an external writer moves the server
    const ps = sb.write('silent'); const pm = sb.write('manual');
    const [rsil, rman] = await Promise.all([ps, pm]);
    check('silent slot + manual request coalesce into ONE run with MANUAL semantics: bank + ask + resync, both callers get the same result', rsil.ok && rman.ok && rsil.version === 10 && rman.version === 10 && sb.events.includes('confirm') && sb.events.includes('bank'), JSON.stringify([rsil, rman]) + ' ' + sb.events.join(','));
    check('status() reports the token and quiet window', (() => { const s = vm.runInContext('SLCloudWriter.status()', sb.ctx); return s.quietMs === 60 && s.token === 10; })());
  }

  // ---- 6. mutations must go red --------------------------------------------------
  console.log('\n[6] mutations');
  {
    const mut = (from, to) => { const s = W.replace(from, to); if (s === W) throw new Error('mutation anchor missing: ' + from); return s; };
    // M1: drop the version precondition → the precondition pin in [1] goes red
    const m1 = mut(".eq('project_id', projectId).eq('version', expected)", ".eq('project_id', projectId)");
    check('M1 (precondition removed): the precondition pin catches it', !PRECOND.test(m1));
    let sb, r;
    // M2: silent mode no longer skips on refusal → it would bank/ask like manual
    sb = sandbox({ token: 5, version: 5, raceOnce: true, src: mut("if (mode === 'silent') {\n                if (locks.length", "if (false) {\n                if (locks.length") });
    r = await sb.write('silent');
    check('M2 (silent skip removed): a silent refusal would bank/ask — suite catches it', sb.events.includes('bank') || sb.events.includes('confirm'));
    // M3: lock breach path removed → a held lock would be ASKED instead of audited
    sb = sandbox({ token: 5, version: 5, raceOnce: true, acLock: { by: 'me@x.com' }, confirmAnswer: true, src: mut("if (locks.length) {\n                _auditBreach", "if (false) {\n                _auditBreach") });
    r = await sb.write('manual');
    check('M3 (breach audit removed): a held lock falls back to the dialog — suite catches it', sb.events.includes('confirm') && !sb.events.includes('jrnl:lock-breach'));
    // M4: lease gate removed
    sb = sandbox({ token: 5, version: 5, lease: false, acquireOk: false, src: mut("if (!_leaseOk()) {", "if (false) {") });
    r = await sb.write('manual');
    check('M4 (lease gate removed): a suspended tab would write — suite catches it', r.ok === true);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });

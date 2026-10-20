#!/usr/bin/env node
/*
 * Regression — SEC-4: erasure as the paper describes it (18 Oct 2026).
 *
 * SL-WP-0003 v3.0 section 18 promises "self-serve permanent erasure, of an individual project or of an entire
 * account ... and issues a certificate of destruction". Checked against the code on 18 Oct 2026:
 *   - project erasure was callable by the service role only (a customer had to ask us);
 *   - the account certificate was on screen for five seconds, then the page signed out and reloaded;
 *   - nothing on the device was cleared: the autosave, last-good copy, recovery ring, confirmed copy, offline
 *     co-edit store, AI memory and CAD cache all outlived the erasure; and a reload after it would have written
 *     the erased project straight back (the closing flush, the cloud push, the tab pin).
 * site/erasure.js fixes all of it; this file proves it.
 *
 *   [A] plan(): what is wiped, decided from what is stored (pure)
 *   [B] run() and the halt: every writer stops before the copies go (in a VM)
 *   [C] the certificate as a file
 *   [D] wiring: page, account panel, account erasure, archive list, writers, database, customer kit
 *   [E] in the real app (Playwright): project erasure (open and not open), account erasure, archive list,
 *       certificates on the account page
 *   --mutations: each guarded line broken in a copy of site/ must turn this file red
 *
 * Run: NODE_PATH=~/dev/.node-tools/node_modules node tests/regression_erasure_selfserve_20261018.test.js [--mutations]
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const SITE = process.env.SLAB_SITE || path.join(ROOT, 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------------------
// --mutations: break one guarded thing at a time in a copy of site/ and require red
// ---------------------------------------------------------------------------------------------------------------
if (process.argv.includes('--mutations')) {
  const MUT = [
    ['erasure.js', 'the halt is not called before a reload wipe', "        if (p.reload) halt();\n", ''],
    ['erasure.js', 'halt does not suspend the autosave', "        try { _autosaveSuspended = true; } catch (_) {}", ''],
    ['erasure.js', 'the open project is not halted the moment the server says erased', "                if (isOpen(projectId)) halt();\n", ''],
    ['erasure.js', 'the tab pin is not cleared with the open project', "p.ss = (state.ss || []).indexOf(TAB_PIN) >= 0 ? [TAB_PIN] : []; ", ''],
    ['erasure.js', 'recovery generations of another project with another name are wiped', "return open || (target.name && r.name === target.name);", 'return true;'],
    ['erasure.js', 'an erased project that is not open drops the working copies', "if (open) { p.kv", "if (true) { p.kv"],
    ['erasure.js', 'account wipe misses the offline co-edit stores', "p.dbs = IDB_FIXED.concat((state.dbs || []).filter(function (d) { return d.indexOf(CRDT_PREFIX) === 0; }));", 'p.dbs = IDB_FIXED.slice();'],
    ['erasure.js', 'account wipe takes keys that are not ours', "            p.ls = (state.ls || []).filter(ours);", '            p.ls = (state.ls || []).slice();'],
    ['erasure.js', 'the certificate leaves out the hash', "            'SHA-256 manifest: ' + (c.manifest_sha256 || ''),\n", ''],
    ['erasure.js', 'a backdrop click closes the modal after the erasure', "if (e.target === ov && !ov._erased) close();", 'if (e.target === ov) close();'],
    ['cloud_writer.js', 'the cloud writer ignores the latch', "        try { if (typeof window !== 'undefined' && window.__slabErasing) return Promise.resolve({ ok: false, reason: 'erased' }); } catch (_) {}\n", ''],
    ['cloud_sync.js', 'the cloud push ignores the latch', "        try { if (typeof window !== 'undefined' && window.__slabErasing) return; } catch (_) {}\n", ''],
    ['tab_project.js', 'the tab pin ignores the latch', "        try { if (window.__slabErasing) return; } catch (_) {}\n", ''],
    ['helpers_modules.js', 'the account page does not list certificates', "window.SLErasure.mount('acct-erasure-mount');", ''],
    ['helpers_modules.js', 'the account erasure does not clear this device', "if (window.SLErasure) wiped = await window.SLErasure.wipeAll();", ''],
    ['helpers_modules.js', 'the account erasure signs out on a timer again', "            const f = document.getElementById('erase-foot');\n            if (f) {", "            setTimeout(function(){ try { location.reload(); } catch(_){} }, 1500);\n            const f = document.getElementById('erase-foot');\n            if (f) {"],
    ['helpers_modules.js', 'the archive list has no erase button', "(window.SLErasure ? '<button class=\"action-btn\" data-erase-project=", "(false ? '<button class=\"action-btn\" data-erase-project="],
    ['index.html', 'the page does not load erasure.js', '    <script src="erasure.js?v=1.0" defer></script>\n', ''],
  ];
  const mig = path.join(ROOT, 'supabase', 'migrations', '20261018a_self_serve_project_erasure.sql');
  (async () => {
    const run1 = (m) => new Promise(res => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-erase-mut-'));
      fs.cpSync(path.join(ROOT, 'site'), dir, { recursive: true });
      const f = path.join(dir, m[0]); const s = fs.readFileSync(f, 'utf8');
      if (s.split(m[2]).length !== 2) { res({ m, err: 'pattern not found exactly once' }); return; }
      fs.writeFileSync(f, s.replace(m[2], m[3]));
      cp.execFile(process.execPath, [__filename], { env: Object.assign({}, process.env, { SLAB_SITE: dir }), maxBuffer: 1 << 24, timeout: 240000 }, (e, out) => {
        fs.rmSync(dir, { recursive: true, force: true });
        res({ m, red: !!e, fails: String(out || '').split('\n').filter(l => /^\s+FAIL/.test(l)).slice(0, 2) });
      });
    });
    const results = [];
    for (let i = 0; i < MUT.length; i += 6) results.push(...await Promise.all(MUT.slice(i, i + 6).map(run1)));
    // the database grant: checked by [D] on the migration file itself
    const sql = fs.readFileSync(mig, 'utf8');
    fs.writeFileSync(mig, sql.replace('to authenticated, service_role', 'to service_role'));
    const r = await new Promise(res => cp.execFile(process.execPath, [__filename], { env: Object.assign({}, process.env, { SLAB_SKIP_BROWSER: '1' }) }, e => res(!!e)));
    fs.writeFileSync(mig, sql);
    results.push({ m: ['migration', 'the grant to signed-in users is gone'], red: r });
    let survivors = 0;
    results.forEach(x => { const ok = x.red && !x.err; if (!ok) survivors++; console.log((ok ? '  RED   ' : '  GREEN ') + x.m[0] + ': ' + x.m[1] + (x.err ? ' (' + x.err + ')' : '') + (x.fails && x.fails.length ? '\n          ' + x.fails.join('\n          ').trim() : '')); });
    console.log('\n' + (results.length - survivors) + '/' + results.length + ' mutations caught' + (survivors ? ', ' + survivors + ' survived' : ''));
    process.exit(survivors ? 1 : 0);
  })();
  return;
}

// ---------------------------------------------------------------------------------------------------------------
// load erasure.js in a VM with a small fake browser
// ---------------------------------------------------------------------------------------------------------------
function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { get length() { return m.size; }, key: i => Array.from(m.keys())[i], getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}
function loadVM(opts) {
  opts = opts || {};
  const kv = new Map(Object.entries(opts.kv || {}));
  const dropped = [];
  const ctx = {
    console, JSON, Promise, Object, Array, String, Date, Math,
    localStorage: fakeStorage(opts.ls), sessionStorage: fakeStorage(opts.ss),
    indexedDB: {
      databases: async () => (opts.dbs || []).map(n => ({ name: n })),
      deleteDatabase: (n) => { dropped.push(n); const r = {}; setTimeout(() => r.onsuccess && r.onsuccess(), 0); return r; },
    },
    SLDB: { available: () => true, get: async k => kv.get(k), set: async (k, v) => { kv.set(k, v); }, del: async k => { kv.delete(k); } },
    setTimeout,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext('let _autosaveSuspended = false; let _autosavePending = true; let _activeCloudProjectId = ' + JSON.stringify(opts.current || null) + ';', ctx);
  vm.runInContext(read('erasure.js'), ctx, { filename: 'erasure.js' });
  return { ctx, E: ctx.SLErasure, kv, dropped, g: name => vm.runInContext(name, ctx) };
}

(async () => {
  const { E } = loadVM();
  console.log('\n[A] plan(): what is wiped');
  const LS = ['safetyLab.autosave.v1', 'safetyLab.autosave.meta.v1', 'safetyLab.autosave.lastgood.v1', 'safetyLab.autosave.lastgood.meta.v1', 'safetyLab.accepted.v1', 'safetyLab.signup.name', 'slai.memory', 'slab.seat', 'sl-theme', 'sl.oosEnabled', 'SLA_FTA_MINIMAP', 'other.app.key', 'safetyLabX', 'xsafetyLab.y'];
  const DBS = ['safetyLabAero', 'slab-crdt-p1', 'slab-crdt-p2', 'someone-elses-db'];
  const RING = [{ slot: 0, name: 'Alpha' }, { slot: 1, name: 'Beta' }, { slot: 2, name: 'Alpha' }];
  const st = { ls: LS, ss: ['safetyLab.tabProject.v1', 'other'], dbs: DBS, current: 'p1', autosaveProject: 'p1', lastgoodProject: 'p1', ring: RING };

  let p = E.plan(st, { all: true });
  check('account: every key under our prefixes goes', ['safetyLab.autosave.v1', 'safetyLab.signup.name', 'slai.memory', 'slab.seat', 'sl-theme', 'sl.oosEnabled', 'SLA_FTA_MINIMAP'].every(k => p.ls.includes(k)), JSON.stringify(p.ls));
  check('account: keys that are not ours stay', !p.ls.includes('other.app.key') && !p.ls.includes('xsafetyLab.y') && !p.ls.includes('safetyLabX'));
  check('account: the session keys under our prefixes go, others stay', p.ss.includes('safetyLab.tabProject.v1') && !p.ss.includes('other'));
  check('account: the fixed stores go (kv, AI memory, CAD cache, save folder handle)', ['safetyLabAero', 'safetyLab.ai.v1', 'sl-cad', 'safetyLabSaveFs'].every(d => p.dbs.includes(d)));
  check('account: every project\'s offline co-edit store goes', p.dbs.includes('slab-crdt-p1') && p.dbs.includes('slab-crdt-p2'));
  check('account: a database that is not ours stays', !p.dbs.includes('someone-elses-db'));
  check('account: the page reloads after', p.reload === true);

  p = E.plan(st, { project: 'p1', name: 'Alpha' });
  check('open project: its co-edit store goes, no other', JSON.stringify(p.dbs) === '["slab-crdt-p1"]', JSON.stringify(p.dbs));
  check('open project: all five working copies go (autosave, last good, confirmed)', p.kv.length === 5 && E.PROJECT_KEYS.every(k => p.kv.includes(k)));
  check('open project: the localStorage mirrors of them go', E.PROJECT_KEYS.every(k => p.ls.includes(k)) && !p.ls.includes('safetyLab.signup.name'));
  check('open project: the tab pin goes (a reload must not try to reopen it)', JSON.stringify(p.ss) === '["safetyLab.tabProject.v1"]');
  check('open project: every recovery generation goes (they are all of what was open here)', JSON.stringify(p.ringSlots) === '[0,1,2]');
  check('open project: the page reloads after', p.reload === true);

  p = E.plan(Object.assign({}, st, { current: null }), { project: 'p1', name: 'Alpha' });
  check('open project found from the autosave record when no cloud id is set', p.reload === true && p.kv.length === 5);

  p = E.plan(Object.assign({}, st, { current: 'p9', autosaveProject: 'p9', lastgoodProject: 'p1' }), { project: 'p1', name: 'Alpha' });
  check('not open, but the last-good copy is it: only that copy goes', JSON.stringify(p.kv) === '["safetyLab.autosave.lastgood.v1","safetyLab.autosave.lastgood.meta.v1"]', JSON.stringify(p.kv));
  check('...the working copy of the project that IS open stays', !p.ls.includes('safetyLab.autosave.v1') && !p.kv.includes('safetyLab.autosave.v1'));
  check('...recovery generations with its name go, others stay', JSON.stringify(p.ringSlots) === '[0,2]', JSON.stringify(p.ringSlots));
  check('...no reload (the open project is untouched)', p.reload === false && p.ss.length === 0);

  p = E.plan(Object.assign({}, st, { current: 'p9', autosaveProject: 'p9', lastgoodProject: 'p9' }), { project: 'p1', name: 'Gamma' });
  check('not open and nowhere in the copies: only its co-edit store', JSON.stringify(p) === JSON.stringify({ ls: [], ss: [], dbs: ['slab-crdt-p1'], kv: [], ringSlots: [], reload: false }), JSON.stringify(p));

  console.log('\n[B] run() and the halt');
  {
    const v = loadVM({ ls: { 'safetyLab.autosave.v1': 'x', 'safetyLab.autosave.meta.v1': '{"cloudProjectId":"p1"}', 'other.key': 'keep' }, ss: { 'safetyLab.tabProject.v1': 'pin' }, dbs: ['slab-crdt-p1', 'slab-crdt-p2'], current: 'p1',
      kv: { 'safetyLab.autosave.v1': 'x', 'safetyLab.accepted.v1': 'y', 'safetyLab.autosave.ring.0': 'r0', 'safetyLab.autosave.ring.1': 'r1', 'safetyLab.autosave.ringMeta': [{ slot: 0, name: 'Alpha' }, { slot: 1, name: 'Alpha' }] } });
    v.ctx.SLSaveState = { _allowUnload: (b) => { v.ctx.__allow = b; } };
    const r = await v.E.wipeProject('p1', 'Alpha');
    check('wiping the open project halts first: the latch is set', v.ctx.__slabErasing === true);
    check('...the autosave is suspended and nothing is pending', v.g('_autosaveSuspended') === true && v.g('_autosavePending') === false);
    check('...leaving the page is allowed without a "save first?" prompt', v.ctx.__allow === true);
    check('...the working copies are gone from localStorage and the kv store', v.ctx.localStorage.getItem('safetyLab.autosave.v1') === null && !v.kv.has('safetyLab.autosave.v1') && !v.kv.has('safetyLab.accepted.v1'));
    check('...the ring slots and their index are gone', !v.kv.has('safetyLab.autosave.ring.0') && !v.kv.has('safetyLab.autosave.ring.1') && JSON.stringify(v.kv.get('safetyLab.autosave.ringMeta')) === '[]');
    check('...its co-edit store is dropped, not the other project\'s', JSON.stringify(v.dropped) === '["slab-crdt-p1"]', JSON.stringify(v.dropped));
    check('...the tab pin is gone, a key that is not ours stays', v.ctx.sessionStorage.getItem('safetyLab.tabProject.v1') === null && v.ctx.localStorage.getItem('other.key') === 'keep');
    check('...and the caller is told to reload', r.reload === true);
  }
  {
    const v = loadVM({ ls: { 'safetyLab.autosave.meta.v1': '{"cloudProjectId":"p9"}' }, current: 'p9', kv: { 'safetyLab.autosave.ringMeta': JSON.stringify([{ slot: 0, name: 'Alpha' }, { slot: 3, name: 'Other' }]), 'safetyLab.autosave.ring.0': 'a', 'safetyLab.autosave.ring.3': 'o' } });
    const r = await v.E.wipeProject('p1', 'Alpha');
    check('wiping a project that is not open does not halt anything', v.ctx.__slabErasing !== true && v.g('_autosaveSuspended') === false && r.reload === false);
    check('...its recovery generation goes, the other stays (index stored as text is read too)', !v.kv.has('safetyLab.autosave.ring.0') && v.kv.get('safetyLab.autosave.ring.3') === 'o' && JSON.stringify(v.kv.get('safetyLab.autosave.ringMeta')) === '[{"slot":3,"name":"Other"}]');
    check('isOpen() reads the cloud id and the autosave record', v.E.isOpen('p9') === true && v.E.isOpen('p1') === false);
  }
  {
    const v = loadVM({ ls: { 'safetyLab.x': '1', 'slai.y': '2', 'mine.z': '3' }, dbs: ['slab-crdt-a', 'foreign'] });
    await v.E.wipeAll();
    check('wipeAll halts, clears our keys, keeps others, drops our stores only', v.ctx.__slabErasing === true && v.ctx.localStorage.getItem('safetyLab.x') === null && v.ctx.localStorage.getItem('slai.y') === null && v.ctx.localStorage.getItem('mine.z') === '3' && v.dropped.includes('slab-crdt-a') && !v.dropped.includes('foreign') && v.dropped.includes('safetyLabAero'));
  }

  console.log('\n[C] the certificate as a file');
  const cert = { certificate_id: 'c0ffee00-1111-2222-3333-444455556666', scope: 'project', target_name: 'Wing "A"', issued_by_email: 'a@b.c', issued_at: '2026-10-18T20:00:00Z', manifest_sha256: 'ab'.repeat(32), complete_at: '2026-11-17T20:00:00Z', deleted_counts: { project_documents: 3, reviews: 1 } };
  const t = E.certText(cert);
  check('it names the certificate, what was erased, who, when and the manifest hash', t.includes(cert.certificate_id) && t.includes('Project "Wing "A""') && t.includes('a@b.c') && t.includes('2026-10-18T20:00:00Z') && t.includes('ab'.repeat(32)));
  check('it lists the counts and when the last backup copy is gone', /project_documents:\s+3/.test(t) && /reviews:\s+1/.test(t) && t.includes('2026-11-17'));
  check('it says hand-saved files are the owner\'s own', /saved to disk by hand/.test(t));
  check('an account certificate reads as one', E.certText({ scope: 'account', manifest: { deleted: { projects: 2 } } }).includes('An account and all its data') && /projects:\s+2/.test(E.certText({ scope: 'account', manifest: { deleted: { projects: 2 } } })));

  console.log('\n[D] wiring');
  const H = read('index.html'), HM = read('helpers_modules.js'), CS = read('cloud_sync.js'), CW = read('cloud_writer.js'), TP = read('tab_project.js');
  check('index.html loads erasure.js right after account_password.js', /account_password\.js\?v=[\d.]+" defer><\/script>\n\s*<!--[^\n]*-->\n\s*<script src="erasure\.js\?v=1\.0" defer><\/script>/.test(H));
  check('index.html cache-busts the changed files', /cloud_sync\.js\?v=2\.8"/.test(H) && /cloud_writer\.js\?v=1\.2"/.test(H) && /tab_project\.js\?v=1\.1"/.test(H) && /helpers_modules\.js\?v=3\.(3[3-9]|[4-9]\d)"/.test(H));
  check('the account panel has the certificates mount and fills it', HM.includes('id="acct-erasure-mount"') && HM.includes("window.SLErasure.mount('acct-erasure-mount');"));
  const acct = HM.slice(HM.indexOf('async function _openEraseAccountModal'), HM.indexOf('async function _openEraseAccountModal') + 9000);
  check('the account erasure clears this device', acct.includes('await window.SLErasure.wipeAll()'));
  check('...offers "Save certificate" and signs out only on the person\'s click', acct.includes('id="erase-save"') && acct.includes('window.SLErasure.saveCert(certRec)') && acct.includes('id="erase-done"'));
  check('...no timer signs out or reloads after the erasure', !/setTimeout\(function\(\)\{[^}]*supabaseSignOut/.test(acct) && !/setTimeout\([^)]*location\.reload/.test(acct));
  check('...a backdrop click cannot close it once erased', acct.includes("if (e.target===ov && !erased) close();"));
  const arc = HM.slice(HM.indexOf('async function _renderArchivedProjects'), HM.indexOf('async function openProjectFromCloud'));
  check('the archive list has "Erase permanently" on data attributes, not inline code', arc.includes('data-erase-project="') && arc.includes('data-erase-name="') && !/onclick="[^"]*eraseProject/.test(arc));
  check('...a click on it opens the erasure', arc.includes("window.SLErasure.eraseProject(b.getAttribute('data-erase-project'), b.getAttribute('data-erase-name'))"));
  const tick = CS.slice(CS.indexOf('async function _tick()'), CS.indexOf('async function _tick()') + 600);
  check('cloud_sync: the push stops on the erasure latch before anything else', /if \(!_on\(\) \|\| _inFlight\) return;\n[\s\S]{0,300}window\.__slabErasing\) return;/.test(tick));
  check('cloud_writer: a write during an erasure is refused', /function write\(opts\) \{\n\s*opts = opts \|\| \{\};\n[^\n]*\n\s*try \{ if \(typeof window !== 'undefined' && window\.__slabErasing\) return Promise\.resolve\(\{ ok: false, reason: 'erased' \}\); \} catch \(_\) \{\}/.test(CW));
  check('tab_project: the pin is not written during an erasure', /function remember\(\) \{\n\s*if \(!settled \|\| !ss\) return;\n[^\n]*\n\s*try \{ if \(window\.__slabErasing\) return; \} catch \(_\) \{\}/.test(TP));
  const MIG = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '20261018a_self_serve_project_erasure.sql'), 'utf8');
  const KIT = fs.readFileSync(path.join(ROOT, 'customer-install', 'db', '22_self_serve_project_erasure.sql'), 'utf8');
  const strip = s => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  check('migration: signed-in users may call erase_project (the function checks the role itself)', /grant\s+execute on function public\.erase_project\(uuid, boolean\) to authenticated, service_role;/.test(MIG));
  check('migration: anon and public may not', /revoke execute on function public\.erase_project\(uuid, boolean\) from anon, public;/.test(MIG));
  check('migration: nothing else (no function body change rides along)', strip(MIG).split(';').filter(Boolean).length === 2, strip(MIG));
  check('customer kit: 22_ is its twin and apply.sh runs it right after 21', strip(MIG) === strip(KIT) && / 21_version_archive_prune_cheap 22_self_serve_project_erasure[ ;]/.test(fs.readFileSync(path.join(ROOT, 'customer-install', 'db', 'apply.sh'), 'utf8')));

  // -------------------------------------------------------------------------------------------------------------
  // [E] the real app
  // -------------------------------------------------------------------------------------------------------------
  function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
  if (process.env.SLAB_SKIP_BROWSER) { console.log('\n  note  SLAB_SKIP_BROWSER: [E] did not run'); done(); }
  let pw = null;
  for (const m of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (_) {} }
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
  if (!pw) { console.log('  note  Playwright is not installed on this machine: [E] did not run'); done(); }
  const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
  const srv = await new Promise(res => {
    const s = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(SITE, path.normalize(p));
      if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
      fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end('not found'); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
    }).listen(0, '127.0.0.1', () => res(s));
  });
  const URL0 = 'http://127.0.0.1:' + srv.address().port + '/';
  let browser;
  try { browser = await pw.chromium.launch(); } catch (e) { console.log('  note  Chromium could not start here: [E] did not run'); srv.close(); done(); }

  // A fake Supabase client: just what the erasure screens call. Installed before any app script runs.
  const FAKE = () => {
    window.__rpc = [];
    const counts = { project_documents: 3, project_document_versions: 12, reviews: 1, review_comments: 0, change_journal: 40 };
    const client = {
      rpc: async (fn, args) => {
        window.__rpc.push({ fn, args });
        if (fn === 'erase_project') return args.p_confirm ? { data: { deleted: true, certificate_id: 'cert-proj-0001', manifest_sha256: 'f'.repeat(64), manifest: { deleted: counts }, complete_at: '2026-11-17T00:00:00Z' }, error: null } : { data: { dry_run: true, manifest: { project_name: 'Wing', deleted: counts } }, error: null };
        if (fn === 'erase_my_account') return args.p_confirm ? { data: { deleted: true, certificate_id: 'cert-acct-0001', manifest_sha256: 'e'.repeat(64), complete_at: '2026-11-17T00:00:00Z' }, error: null } : { data: { manifest: { projects: 2, project_documents: 5, owned_workspaces: 1 } }, error: null };
        if (fn === 'archived_projects') return { data: [{ id: 'arch-1', name: 'Old "rig" O\'Brien <b>', deleted_at: '2026-10-01T00:00:00Z' }], error: null };
        return { data: null, error: null };
      },
      from: () => { const q = { select: () => q, order: () => q, limit: async () => ({ data: [{ id: 'c1', scope: 'project', target_name: 'Wing', issued_at: '2026-10-18T20:00:00Z', manifest_sha256: 'f'.repeat(64), deleted_counts: { reviews: 1 } }], error: null }) }; return q; },
      auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    };
    window.__fakeClient = client;
  };
  async function open(ctx) {
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(String(e)));
    pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.addInitScript(FAKE);
    await pg.goto(URL0); await sleep(3500);
    await pg.evaluate(() => {
      try { if (window.SLCmaLive) window.SLCmaLive.onModelChange = function () {}; } catch (_) {}
      const g = document.getElementById('sl-auth-gate'); if (g) g.remove();
      document.documentElement.classList.remove('sl-auth-gate-blocked');
      document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
      window.getSupabaseClient = function () { return window.__fakeClient; };
    });
    pg._errs = errs;
    return pg;
  }
  const typeDelete = async (pg, sel) => { await pg.fill(sel, 'DELETE'); await pg.dispatchEvent(sel, 'input'); };
  try {
    // ---- E1: erasing the project that is open on this page ----
    console.log('\n[E1] erasing the project open on this page');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    let pg = await open(ctx);
    await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(2500);
    await pg.evaluate(async () => {
      _activeCloudProjectId = 'proj-open';
      sessionStorage.setItem('safetyLab.tabProject.v1', JSON.stringify({ id: 'proj-open', uid: 'u' }));
      await new Promise((res, rej) => { const r = indexedDB.open('slab-crdt-proj-open'); r.onsuccess = () => { r.result.close(); res(); }; r.onerror = rej; });
      await new Promise((res, rej) => { const r = indexedDB.open('slab-crdt-proj-other'); r.onsuccess = () => { r.result.close(); res(); }; r.onerror = rej; });
      SLChangeAck.system(() => { projectConfig.name = 'Wing'; scheduleAutosave(); });
    });
    await sleep(800);
    check('before: the project is saved on this device', await pg.evaluate(() => !!localStorage.getItem('safetyLab.autosave.v1') || !!localStorage.getItem('safetyLab.autosave.meta.v1')));
    await pg.evaluate(() => {
      // the first await of the wipe reads the stores; by then every writer must already be stopped
      const od = indexedDB.databases.bind(indexedDB);
      indexedDB.databases = async function () { if (window.__latchAtWipe === undefined) window.__latchAtWipe = window.__slabErasing === true; return od(); };
      SLErasure.eraseProject('proj-open', 'Wing');
    });
    await pg.waitForSelector('#erase-project-modal #ep-confirm', { timeout: 5000 });
    const listed = await pg.evaluate(() => document.querySelector('#ep-body').innerText);
    check('the dry run is shown first: counts, labelled, zeros left out', /3\s+saved project documents/.test(listed) && /12\s+earlier versions/.test(listed) && /40\s+change journal entries/.test(listed) && !/review comments/.test(listed), listed);
    check('...and nothing was erased yet', await pg.evaluate(() => window.__rpc.filter(r => r.fn === 'erase_project').map(r => r.args.p_confirm).join() === 'false'));
    check('the button stays off until DELETE is typed', await pg.evaluate(() => document.getElementById('ep-go').disabled));
    await typeDelete(pg, '#ep-confirm');
    await pg.click('#ep-go');
    await pg.waitForSelector('#ep-save', { timeout: 8000 });
    const after = await pg.evaluate(async () => {
      const dbs = (await indexedDB.databases()).map(d => d.name);
      const before = localStorage.getItem('safetyLab.autosave.v1');
      // everything that would normally write the project back:
      const sched = scheduleAutosave();
      _flushAutosave();
      try { window.dispatchEvent(new Event('pagehide')); } catch (_) {}
      const w = window.SLCloudWriter ? await SLCloudWriter.write({ mode: 'silent' }) : { reason: 'n/a' };
      try { SLTabProject._remember(); } catch (_) {}
      const bu = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(bu);
      await new Promise(r => setTimeout(r, 400));
      return {
        latch: window.__slabErasing === true, sched, w: w && w.reason, buPrevented: bu.defaultPrevented,
        ls: ['safetyLab.autosave.v1', 'safetyLab.autosave.meta.v1', 'safetyLab.autosave.lastgood.v1', 'safetyLab.accepted.v1'].filter(k => localStorage.getItem(k) !== null),
        before, pin: sessionStorage.getItem('safetyLab.tabProject.v1'), dbs, body: document.querySelector('#ep-body').innerText,
        rpc: window.__rpc.filter(r => r.fn === 'erase_project').map(r => r.args.p_confirm).join(),
      };
    });
    check('the erasure is committed once, after the dry run', after.rpc === 'false,true', after.rpc);
    check('the writers are stopped the moment the server says erased, before the wipe starts', await pg.evaluate(() => window.__latchAtWipe === true));
    check('the certificate is on screen', /cert-proj-0001/.test(after.body) && after.body.includes('f'.repeat(64)), after.body);
    check('the working copies on this device are gone', after.ls.length === 0 && after.before === null, JSON.stringify(after.ls));
    check('nothing writes them back: autosave refuses, the closing flush and pagehide write nothing', after.sched === false && after.ls.length === 0);
    check('the cloud writer refuses (it would push the erased project)', after.w === 'erased', String(after.w));
    check('the tab pin is gone and stays gone', after.pin === null, String(after.pin));
    check('leaving the page asks nothing', after.buPrevented === false);
    check('a backdrop click does not close the screen (Done is the way out)', await pg.evaluate(() => { const ov = document.getElementById('erase-project-modal'); ov.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return !!document.getElementById('erase-project-modal'); }));
    const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 5000 }), pg.click('#ep-save')]);
    const txt = fs.readFileSync(await dl.path(), 'utf8');
    check('"Save certificate" saves a file with the ID, the hash and the counts', /Certificate of destruction/.test(dl.suggestedFilename()) && txt.includes('cert-proj-0001') && txt.includes('f'.repeat(64)) && /project_documents:\s+3/.test(txt), dl.suggestedFilename());
    await Promise.all([pg.waitForNavigation({ timeout: 15000 }), pg.click('#ep-done')]);
    await sleep(3500);
    const re = await pg.evaluate(async () => ({
      dbs: (await indexedDB.databases()).map(d => d.name),
      meta: localStorage.getItem('safetyLab.autosave.meta.v1'), auto: localStorage.getItem('safetyLab.autosave.v1'), pin: sessionStorage.getItem('safetyLab.tabProject.v1'),
    }));
    check('after the reload its offline co-edit store is gone; another project\'s stays', !re.dbs.includes('slab-crdt-proj-open') && re.dbs.includes('slab-crdt-proj-other'), JSON.stringify(re.dbs));
    check('after the reload the erased project is not back on this device', !/proj-open/.test(String(re.meta)) && !/"Wing"/.test(String(re.auto)) && re.pin === null, String(re.meta).slice(0, 120));
    check('no page errors', pg._errs.length === 0, pg._errs.join(' | '));
    await pg.close();

    // ---- E2: erasing a project that is not open here ----
    console.log('\n[E2] erasing a project that is not open here');
    pg = await open(ctx);
    await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(2500);
    await pg.evaluate(async () => {
      _activeCloudProjectId = 'proj-here';
      SLChangeAck.system(() => { scheduleAutosave(); });
      await SLDB.set('safetyLab.autosave.ring.4', 'old copy of Rig'); await SLDB.set('safetyLab.autosave.ring.3', 'copy of something else');
      let m = await SLDB.get('safetyLab.autosave.ringMeta'); if (typeof m === 'string') m = JSON.parse(m); m = (Array.isArray(m) ? m : []).filter(x => x.slot !== 3 && x.slot !== 4);
      await SLDB.set('safetyLab.autosave.ringMeta', m.concat([{ slot: 4, name: 'Rig', ts: 1 }, { slot: 3, name: 'Else', ts: 2 }]));
    });
    await sleep(600);
    const keep0 = await pg.evaluate(() => localStorage.getItem('safetyLab.autosave.v1'));
    await pg.evaluate(() => { SLErasure.eraseProject('proj-gone', 'Rig'); });
    await pg.waitForSelector('#ep-confirm'); await typeDelete(pg, '#ep-confirm'); await pg.click('#ep-go'); await pg.waitForSelector('#ep-done', { timeout: 8000 });
    const e2 = await pg.evaluate(async () => {
      let m = await SLDB.get('safetyLab.autosave.ringMeta'); if (typeof m === 'string') m = JSON.parse(m);
      return { latch: window.__slabErasing === true, sched: scheduleAutosave(), auto: localStorage.getItem('safetyLab.autosave.v1'), r4: await SLDB.get('safetyLab.autosave.ring.4'), r3: await SLDB.get('safetyLab.autosave.ring.3'), slots: (m || []).map(x => x.slot) };
    });
    check('the open project keeps saving: no latch, autosave still accepts', !e2.latch && e2.sched === true);
    check('...and its working copy is untouched', !!keep0 && !!e2.auto);
    check('the erased project\'s recovery generation goes; another project\'s stays', e2.r4 === undefined && e2.r3 === 'copy of something else' && !e2.slots.includes(4) && e2.slots.includes(3), JSON.stringify(e2));
    let navigated = false; pg.once('framenavigated', () => { navigated = true; });
    await pg.click('#ep-done'); await sleep(1500);
    check('"Done" closes without a reload', !navigated && !(await pg.$('#erase-project-modal')));
    await pg.close();

    // ---- E3: the archive list and the account page ----
    console.log('\n[E3] the archive list and the account page');
    pg = await open(ctx);
    const e3 = await pg.evaluate(async () => {
      window.getActiveWorkspaceId = function () { return 'ws-1'; };
      const list = document.getElementById('cloud-archived-list'); list.style.display = 'block';
      await _renderArchivedProjects();
      const b = list.querySelector('[data-erase-project]');
      let called = null; const orig = SLErasure.eraseProject; SLErasure.eraseProject = function (id, nm) { called = [id, nm]; };
      b.click(); SLErasure.eraseProject = orig;
      const host = document.createElement('div'); host.id = 'acct-erasure-mount-test'; document.body.appendChild(host);
      await SLErasure.mount('acct-erasure-mount-test');
      return { btn: b && b.textContent, injected: !!list.querySelector('b'), called, mount: host.innerText, hasSave: !!host.querySelector('[data-cert]') };
    });
    check('each archived project has "Erase permanently"', e3.btn === 'Erase permanently');
    check('...a name with quotes and markup is shown as text and reaches the erasure intact', !e3.injected && JSON.stringify(e3.called) === JSON.stringify(['arch-1', 'Old "rig" O\'Brien <b>']), JSON.stringify(e3.called));
    check('the account page lists certificates of destruction, each with Save', /Certificates of destruction/.test(e3.mount) && /Project "Wing", 2026-10-18/.test(e3.mount) && e3.hasSave, e3.mount);
    const [dl3] = await Promise.all([pg.waitForEvent('download', { timeout: 5000 }), pg.evaluate(() => document.querySelector('#acct-erasure-mount-test [data-cert="0"]').click())]);
    check('...Save gives the certificate file', fs.readFileSync(await dl3.path(), 'utf8').includes('f'.repeat(64)));
    check('no page errors', pg._errs.length === 0, pg._errs.join(' | '));
    await pg.close();

    // ---- E4: erasing the account ----
    console.log('\n[E4] erasing the account');
    pg = await open(ctx);
    await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(2000);
    await pg.evaluate(async () => {
      localStorage.setItem('safetyLab.signup.name', 'Test Person'); localStorage.setItem('slai.memory.x', '1'); localStorage.setItem('not.ours', 'keep');
      await new Promise(res => { const r = indexedDB.open('safetyLab.ai.v1'); r.onsuccess = () => { r.result.close(); res(); }; r.onerror = res; });
      await new Promise(res => { const r = indexedDB.open('slab-crdt-anything'); r.onsuccess = () => { r.result.close(); res(); }; r.onerror = res; });
      window.__signedOut = 0; window.supabaseSignOut = function () { window.__signedOut++; };
      _openEraseAccountModal('test@example.com');
    });
    await pg.waitForSelector('#erase-confirm'); await typeDelete(pg, '#erase-confirm'); await pg.click('#erase-go');
    await pg.waitForSelector('#erase-save', { timeout: 8000 });
    let navigated4 = false; pg.on('framenavigated', () => { navigated4 = true; });
    await sleep(6500);   // the old screen signed out and reloaded at 5 s
    const e4 = await pg.evaluate(async () => {
      const ov = document.getElementById('erase-body').parentElement.parentElement;
      ov.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      return {
        still: !!document.getElementById('erase-body'), out: window.__signedOut, latch: window.__slabErasing === true,
        ours: Object.keys(localStorage).filter(k => /^(safetyLab\.|slai\.|slab|sl-|sl\.|SLA_)/.test(k)), other: localStorage.getItem('not.ours'),
        body: document.getElementById('erase-body').innerText,
      };
    });
    check('after the account erasure the screen stays until the person acts: no timer, no sign-out, backdrop ignored', e4.still && e4.out === 0 && !navigated4, JSON.stringify({ out: e4.out, navigated4 }));
    check('every Safety Lab key on this device is gone; another site\'s key stays', e4.ours.length === 0 && e4.other === 'keep', JSON.stringify(e4.ours));
    check('...and nothing can write them back', e4.latch === true && (await pg.evaluate(() => scheduleAutosave())) === false);
    check('the screen says what was cleared and to save the certificate first', /cleared too/.test(e4.body) && /Save the certificate now/.test(e4.body) && /cert-acct-0001/.test(e4.body));
    const [dl4] = await Promise.all([pg.waitForEvent('download', { timeout: 5000 }), pg.click('#erase-save')]);
    const t4 = fs.readFileSync(await dl4.path(), 'utf8');
    check('"Save certificate" saves the account certificate with its counts', t4.includes('cert-acct-0001') && t4.includes('An account and all its data') && /projects:\s+2/.test(t4) && t4.includes('test@example.com'));
    await Promise.all([pg.waitForNavigation({ timeout: 15000 }), pg.click('#erase-done')]);
    await sleep(3000);
    const e4b = await pg.evaluate(async () => ({ dbs: (await indexedDB.databases()).map(d => d.name), name: localStorage.getItem('safetyLab.signup.name') }));
    check('"Sign out" signs out and reloads; the AI memory and co-edit stores are gone after', !e4b.dbs.includes('safetyLab.ai.v1') && !e4b.dbs.includes('slab-crdt-anything') && e4b.name === null, JSON.stringify(e4b));
    await pg.close();
    await ctx.close();
  } catch (e) { check('the browser run finished', false, String(e && e.stack || e)); }
  await browser.close(); srv.close();
  done();
})();

#!/usr/bin/env node
/*
 * Regression (4 Nov 2026, Radia on Windows, desktop 0.21.23): the project remembers which .sl file it saves to across
 * a restart, Project > Save Project writes to that file without asking, and work kept only in the app is said so.
 *
 * WHAT RADIA SAW (reproduced on 0.21.22, the real site with the desktop's file binding): day 1, open "Safety Lab
 * eval.sl" from OneDrive, confirm, the file is written. Close the app. Day 2 the page brings the project back from this
 * computer's autosave but nothing knew its file any more: confirmed work said "Saved" and never reached the .sl. So
 * they used Project > Save Project, which was Save As every time ("already exists, do you want to replace it?").
 *
 * The shell side (remembering the file, deciding to link it again, the dialogs) is proven in the desktop repo:
 * tests/regression_project_file_relink_20261104.test.js. Here, the page side:
 *   [M]  save_state.js in a VM with the desktop's window.slabProjectFile stubbed: the link token the shell sends is
 *        kept and written into this device's autosave meta (fileLink) at once; a restart's recovered meta hands it
 *        back through window.__slabProjectFileLink; another project drops it; desktop work kept in the app only says
 *        "On this computer only. Save to a file" (never a bare Saved) and a click or Ctrl+S saves to a file (once);
 *        the browser is unchanged.
 *   [S]  helpers_modules.js: the autosave meta carries fileLink; Save Project calls the shell's save() (Save As only
 *        on an older shell); Save Project As... exists, in the desktop only.
 *   [D]  the real app (Playwright, when installed) with a stand-in shell that keeps the file like main.js: open a .sl,
 *        confirm, RESTART (reload, the shell forgets everything but what it remembered on disk), the page brings the
 *        project back with the token, the stand-in links it again, and a confirmed day-2 change reaches the file.
 *        Project > Save Project with the file open asks nothing.
 * MUTATION PROOFS: SL_RL_MUTATE=meta | recover | menu | unlinked | helpersmeta. Each turns this red.
 * Run: node tests/regression_project_file_relink_20261104.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + String(d).slice(0, 400) : '')); } };
const REPO = path.join(__dirname, '..'), SITE = path.join(REPO, 'site');
const MUT = process.env.SL_RL_MUTATE || '';
const mutate = (s, a, b) => { if (s.indexOf(a) < 0) throw new Error('mutation site missing: ' + a); return s.replace(a, b); };
const MUTS = {
  meta:        ['save_state.js', 'acceptedId: h ? _acceptedId : null, fileLink: _fileName ? _fileToken : null };', 'acceptedId: h ? _acceptedId : null };'],
  recover:     ['save_state.js', "_recoveredLink = (typeof meta.fileLink === 'string' && meta.fileLink) ? meta.fileLink : null;", '_recoveredLink = null;'],
  menu:        ['helpers_modules.js', "try { await (typeof P.save === 'function' ? P.save() : P.saveAs()); }", 'try { await P.saveAs(); }'],
  unlinked:    ['save_state.js', "return (_state === 'saved' && _where === 'device') || (_state === 'idle' && _broughtBack);", 'return false;'],
  helpersmeta: ['helpers_modules.js', 'if (_am.fileLink) meta.fileLink = _am.fileLink;', '']
};
function src(name) { let s = fs.readFileSync(path.join(SITE, name), 'utf8'); const m = MUTS[MUT]; if (m && m[0] === name) s = mutate(s, m[1], m[2]); return s; }
if (MUT && !MUTS[MUT]) { console.error('unknown mutation ' + MUT); process.exit(3); }
const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));
const TOKEN = '0123456789abcdef01234567';

function el() { const cl = new Set(); return { textContent: '', title: '', style: {}, classList: { add: (c) => cl.add(c), remove: (...c) => c.forEach((x) => cl.delete(x)), toggle() {}, has: (c) => cl.has(c) } }; }
function boot(opts) {
  opts = opts || {};
  const ind = el(), indText = el(), saveAsItem = el(); saveAsItem.style.display = 'none';
  const pf = { writes: [], saves: 0, saveAs: 0, stateCb: null };
  const autosaves = [];
  const ctx = {
    console: { info() {}, warn() {}, error() {}, log() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean, Error, parseInt, isFinite,
    requestAnimationFrame: (f) => f(), navigator: { onLine: true },
    document: { body: {}, getElementById: (id) => ({ 'save-indicator': ind, 'save-indicator-text': indText, 'pm-save-as': saveAsItem })[id] || null, querySelectorAll: () => [], querySelector: () => null, addEventListener() {} },
    addEventListener() {}, dispatchEvent() { return true; }, showToast() {},
    __slAutosaveLs: true, __slAutosaveIdb: Promise.resolve(true),
    __slabGetProjectJSON: () => JSON.stringify({ projectName: 'Radia P' })
  };
  ctx._writeAutosave = () => { autosaves.push(ctx.SLSaveState.autosaveMeta()); return true; };
  ctx.SLChangeAck = { pending: () => false, pendingUser: () => false, count: () => 0, acceptedSnapshot: () => null, system: (f) => f(), systemAsync: (f) => f(), settle() {}, status: () => ({}), ask: async () => 'confirmed' };
  if (opts.desktop) {
    ctx.slabProjectFile = {
      write: async (json, epoch) => { pf.writes.push({ json, epoch }); return pf.bound ? { ok: true, name: 'Safety Lab eval.sl' } : { ok: true, skipped: 'no-file' }; },
      replaced: async () => ({ ok: true }), open: async () => ({ ok: true }),
      saveAs: async () => { pf.saveAs++; return { ok: true }; },
      status: async () => ({ ok: true, name: null, epoch: null }),
      onState: (cb) => { pf.stateCb = cb; }
    };
    if (opts.save !== false) ctx.slabProjectFile.save = async () => { pf.saves++; return { ok: true }; };
  }
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src('save_state.js'), ctx, { filename: 'save_state.js' });
  return { ctx, S: ctx.SLSaveState, pf, ind, indText, saveAsItem, autosaves };
}

(async function main() {
  console.log('\n[M] the page keeps the link and says plainly when work is in the app only');
  {
    let T = boot({ desktop: true });
    await tick(5);
    check('desktop: Save Project As... is shown', T.saveAsItem.style.display === '');
    T.pf.bound = true;
    T.pf.stateCb({ name: 'Safety Lab eval.sl', epoch: 0, token: TOKEN, saved: false });
    check('the shell links a file: its token goes into this device\'s autosave meta at once', T.autosaves.length === 1 && T.autosaves[0].fileLink === TOKEN, JSON.stringify(T.autosaves));
    check('...and every later autosave meta carries it', T.S.autosaveMeta().fileLink === TOKEN);
    check('...the shell can read it back', JSON.stringify(T.ctx.__slabProjectFileLink()) === JSON.stringify({ epoch: 0, token: TOKEN, linked: true }));
    T.S.replaced();
    check('another project opened: the link is dropped (meta and read-back)', !T.S.autosaveMeta().fileLink && T.ctx.__slabProjectFileLink().token === null);

    // a restart: the page brings the project back from the autosave, with its meta
    T = boot({ desktop: true });
    await tick(5);
    T.S.recovered({ fileLink: TOKEN }, '{}');
    check('restart: the recovered meta\'s link is what the shell reads (to link the file again)', T.ctx.__slabProjectFileLink().token === TOKEN && T.ctx.__slabProjectFileLink().linked === false);
    T.S._paint();
    check('...until it is linked: "On this computer only. Save to a file", never a bare Saved', T.indText.textContent === 'On this computer only. Save to a file' && T.ind.classList.has('error') && /not in a project file/.test(T.ind.title), T.indText.textContent);
    const r = await T.S.save();
    check('...a click (or Ctrl+S) saves to a file through the shell\'s save', r === true && T.pf.saves === 1 && T.pf.saveAs === 0);
    T.pf.bound = true;
    T.pf.stateCb({ name: 'Safety Lab eval.sl', epoch: 0, token: TOKEN, saved: false });
    T.S._paint();
    check('linked again: the warning goes and the read-back says linked', T.indText.textContent !== 'On this computer only. Save to a file' && T.ctx.__slabProjectFileLink().linked === true, T.indText.textContent);
    T.S._ackClosed({}, 'kept'); await T.S.whenSaved(); await tick(5);
    check('...a confirmed change is written to the file and says so', T.pf.writes.length >= 1 && /^Saved to Safety Lab eval\.sl /.test(T.indText.textContent), T.indText.textContent);

    // desktop, nothing linked, a save that only reached this device
    T = boot({ desktop: true });
    await tick(5);
    T.S._ackClosed({}, 'kept'); await T.S.whenSaved(); await tick(5);
    check('desktop, no file: a confirmed save says "On this computer only", not Saved', T.indText.textContent === 'On this computer only. Save to a file', T.indText.textContent);
    T = boot({ desktop: true, save: false });
    await tick(5);
    T.S._ackClosed({}, 'kept'); await T.S.whenSaved(); await tick(5);
    await T.S.save();
    check('an older shell without save(): its Save As is used', T.pf.saveAs === 1);

    // the browser
    T = boot({});
    await tick(5);
    T.S._ackClosed({}, 'kept'); await T.S.whenSaved(); await tick(5);
    check('browser: unchanged (no file, no warning, no Save As item, no link in the meta)', !/On this computer only/.test(T.indText.textContent) && T.saveAsItem.style.display === 'none' && !T.S.autosaveMeta().fileLink && typeof T.ctx.__slabProjectFileLink === 'function', T.indText.textContent);
  }

  console.log('\n[S] helpers_modules and the Project menu');
  {
    const hm = src('helpers_modules.js'), idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    check('the autosave meta carries fileLink', /if \(_am\.fileLink\) meta\.fileLink = _am\.fileLink;/.test(hm));
    const sp = (hm.match(/async function saveProject\(\) \{[\s\S]*?\n\}/) || [''])[0];
    check('Save Project in the desktop is the shell\'s save() (the open file; asks only with none)', /typeof P\.save === 'function' \? P\.save\(\) : P\.saveAs\(\)/.test(sp), sp.slice(0, 400));
    check('Save Project As... calls the shell\'s Save As', /async function saveProjectAs\(\) \{[\s\S]*?window\.slabProjectFile\.saveAs\(\)/.test(hm));
    check('the Project menu has Save Project As..., hidden until the desktop shows it', /<div id="pm-save-as" class="sl-desktop-only" style="display:none" onclick="saveProjectAs\(\)">/.test(idx));
    check('the cache keys moved with the change', /save_state\.js\?v=3\.6"/.test(idx) && /helpers_modules\.js\?v=3\.63"/.test(idx));
    // a helpers_modules meta written in a VM carries the link
    const fn = (hm.match(/function _writeAutosave\(\) \{[\s\S]*?\n\}/) || [''])[0];
    check('_writeAutosave is found', fn.length > 500);
  }

  console.log('\n[D] the real app: open, confirm, restart, linked again, day 2 reaches the file');
  let pw = null; try { pw = require('playwright'); } catch (_) {}
  if (!pw) console.log('  SKIP  Playwright is not installed here; [M] and [S] above prove the page');
  else {
    const http = require('http');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
    const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
      let b; try { b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
      const name = path.relative(SITE, f); if (MUTS[MUT] && MUTS[MUT][0] === name) b = Buffer.from(src(name));
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const URL = 'http://127.0.0.1:' + srv.address().port + '/index.html';
    const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-rl-')), FILE = path.join(DIR, 'Safety Lab eval.sl');
    const crypto = require('crypto'), H = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
    // a stand-in for the desktop shell, kept like main.js + shell_rules (link token, hash, remembered on "disk")
    const shell = { cur: null, mem: null, saveDialogs: 0 };
    const b = await pw.chromium.launch();
    const errs = [];
    const openApp = async (ctx) => {
      const pg = await ctx.newPage(); pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200))); pg.on('dialog', (d) => d.dismiss().catch(() => {}));
      await pg.goto(URL); await tick(5000);
      await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
      await pg.addStyleTag({ content: '#signup-modal{display:none!important}' }); await tick(1500);
      return pg;
    };
    const tell = (pg) => pg.evaluate((s) => window.__pfOnState && window.__pfOnState(s), { name: shell.cur ? path.basename(shell.cur.path) : null, epoch: shell.cur ? shell.cur.epoch : null, token: shell.cur ? shell.cur.token : null, saved: false });
    const remember = () => { if (shell.cur && shell.cur.hash) shell.mem = { path: shell.cur.path, token: shell.cur.token, hash: shell.cur.hash }; };
    const ind = (pg) => pg.evaluate(() => (document.getElementById('save-indicator-text') || {}).textContent || '');
    const confirmEdit = async (pg, suffix) => {
      await pg.keyboard.press('Shift');   // a person's own change (a trusted key just before it)
      await pg.evaluate((sx) => { const s = SLEnv.get('systemsData'); s[0].name += sx; scheduleAutosave(); }, suffix);
      await tick(3000);
      await pg.evaluate(() => { window.__askP = SLChangeAck.ask({ reason: 'early' }); }); await tick(1500);
      const btn = pg.getByRole('button', { name: /Confirm all/i }); if (await btn.count()) await btn.first().click();
      await tick(6000);
    };
    try {
      const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
      await ctx.exposeFunction('__pfWrite', async (json, epoch) => {
        if (!shell.cur) return { ok: true, skipped: 'no-file' };
        if (shell.cur.epoch !== epoch) return { ok: true, skipped: 'other-project', name: path.basename(shell.cur.path) };
        fs.writeFileSync(shell.cur.path, json); shell.cur.hash = H(json); remember(); return { ok: true, name: path.basename(shell.cur.path) };
      });
      await ctx.exposeFunction('__pfReplaced', async (epoch) => { if (shell.cur && shell.cur.epoch !== epoch) { shell.cur = null; shell.mem = null; } return { ok: true }; });
      await ctx.exposeFunction('__pfSave', async () => { if (!shell.cur) shell.saveDialogs++; return { ok: true }; });
      await ctx.exposeFunction('__pfSaveAs', async () => { shell.saveDialogs++; return { ok: true }; });
      await ctx.exposeFunction('__pfStatus', async () => ({ ok: true, name: shell.cur ? path.basename(shell.cur.path) : null, epoch: shell.cur ? shell.cur.epoch : null, token: shell.cur ? shell.cur.token : null }));
      await ctx.addInitScript(() => {
        window.slabProjectFile = {
          status: () => window.__pfStatus(), write: (j, e) => window.__pfWrite(typeof j === 'string' ? j : '', Number(e)), replaced: (e) => window.__pfReplaced(Number(e)),
          open: () => Promise.resolve({ ok: false }), save: () => window.__pfSave(), saveAs: () => window.__pfSaveAs(), onState: (cb) => { window.__pfOnState = cb; }
        };
      });
      // the .sl Radia keeps
      let pg = await openApp(ctx);
      await pg.evaluate(() => window.loadHL1Demo()); await tick(9000);
      fs.writeFileSync(FILE, await pg.evaluate(() => window.__slabGetProjectJSON()));
      await pg.close();
      // day 1: open the file (main.js openProjectPath)
      pg = await openApp(ctx);
      const text = fs.readFileSync(FILE, 'utf8');
      const res = await pg.evaluate((s) => window.__slabOpenProjectFile(s), text);
      shell.cur = { path: FILE, epoch: res.epoch, token: TOKEN, hash: H(text) }; remember(); await tell(pg);
      check('day 1: the file opens and is linked', !!(res && res.ok === true && Number.isInteger(res.epoch)), JSON.stringify(res));
      await confirmEdit(pg, ' (day 1)');
      check('day 1: a confirmed change reaches the file', fs.readFileSync(FILE, 'utf8').includes('(day 1)') && /^Saved to Safety Lab eval\.sl/.test(await ind(pg)), await ind(pg));
      shell.saveDialogs = 0;
      await pg.evaluate(() => saveProject()); await tick(800);
      check('Project > Save Project with the file open asks nothing', shell.saveDialogs === 0);
      await pg.close();
      // RESTART: the shell keeps only what it remembered on disk
      shell.cur = null;
      pg = await openApp(ctx); await tick(6000);
      const link = await pg.evaluate(() => window.__slabProjectFileLink && window.__slabProjectFileLink());
      check('restart: the project is back from the autosave and carries the file\'s token', link && link.token === TOKEN && link.linked === false, JSON.stringify(link));
      const before = await ind(pg);
      // the shell's decision (shell_rules.relinkDecision): same token, the file holds what it last wrote
      const sameFile = shell.mem && H(fs.readFileSync(FILE, 'utf8')) === shell.mem.hash && link && link.token === shell.mem.token;
      check('...and the file still holds what this computer last wrote, so the shell links it again', !!sameFile);
      if (sameFile) { shell.cur = { path: FILE, epoch: link.epoch, token: shell.mem.token, hash: shell.mem.hash }; await tell(pg); }
      await confirmEdit(pg, ' (day 2)');
      check('day 2: a confirmed change REACHES the file (0.21.22 said "Saved" and never wrote it)', fs.readFileSync(FILE, 'utf8').includes('(day 2)') && /^Saved to Safety Lab eval\.sl/.test(await ind(pg)), await ind(pg) + ' / before relink: ' + before);
      check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } finally { await b.close(); srv.close(); try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (_) {} }
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (mutation: ' + MUT + ')' : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });

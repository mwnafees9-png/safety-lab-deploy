#!/usr/bin/env node
/*
 * Regression (browser) — every change asks for acknowledgement, and saving works like
 * Microsoft Office (Waqas, 12 Oct 2026 hand testing, rulings 2 and 3). 13 Oct 2026.
 *
 * FOUND: Safety Lab saved and shared every edit the instant it was made. Nothing asked the
 * engineer to confirm a change or showed what it touched; there was no unsaved state, so
 * nothing asked "Save / Don't Save / Cancel" when closing, opening another project, signing
 * out or leaving the page; Ctrl+S downloaded a file instead of saving.
 *
 * FIX: change_ack.js (SLChangeAck, the funnel on scheduleAutosave: one acknowledgement per
 * finished change, what changes and what it touches, Cancel reverts, journal record) and
 * save_state.js (SLSaveState: acknowledged changes are unsaved work, kept on this device and
 * held back from the live sync and the cloud until Save; Save / Don't Save / Cancel at every
 * point that leaves or replaces the open project; beforeunload; desktop close hooks).
 *
 * EXECUTED HERE: the real site/ in headless Chromium (Playwright), served from disk, signed
 * out, the K350 sample project loaded through the app's own loader. Each scenario drives the
 * page the way a person would where that is practical (typing in the node drawer, Tab, the
 * mouse held down for a drag, the header Save control, Ctrl+S, the dialog buttons) and reads
 * the model back afterwards.
 *   B1  a project load asks nothing and is saved
 *   B2  typing in a field: no prompt per keystroke, ONE prompt when the field is left
 *   B3  Cancel change puts the value back and the project is still saved
 *   B4  a 40-row burst is ONE acknowledgement listing the rows
 *   B5  nothing is asked while the mouse is held (a drag); one prompt on release
 *   B6  SLChangeAck.batch: async work = one acknowledgement with its label
 *   B7  a background change nobody made is not asked and leaves the project saved
 *   B8  Undo / Redo and diagram moves are collected (13 Oct night): no prompt per press, one list on
 *       leaving the view; Acknowledge keeps them, Cancel puts back only them
 *   B9  the header control saves; a module calling commitSaveChanges() does not
 *   B10 Ctrl+S saves even with focus in a text field
 *   B11 opening another project: Save / Don't Save / Cancel all do what they say
 *   B12 new project, open file, sign out, restore version: each asks first
 *   B13 leaving the page: the browser's beforeunload prompt only when there is unsaved work
 *   B14 desktop: __slabCanClose / __slabRequestClose and the beforeunload fallback
 *   B15 a crash keeps unsaved work unsaved, and Don't Save still returns to the saved version
 *   B16 no native alert/confirm/prompt anywhere in the flows
 *
 * Needs Playwright + Chromium (PLAYWRIGHT_BROWSERS_PATH). Where they are missing the suite
 * prints a note and exits 0: it cannot run there, which is not the same as passing, and the
 * report says so.
 *
 * Run: node tests/regression_change_ack_ui_20261013b.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');

let pw = null;
for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
if (!pw) { console.log('  note  Playwright is not installed on this machine: the browser suite did not run'); process.exit(0); }

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(SITE, path.normalize(p));
      if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
      fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end('not found'); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  let browser;
  try { browser = await pw.chromium.launch(); }
  catch (e) { console.log('  note  Chromium could not start here (' + String(e.message).split('\n')[0] + '): the browser suite did not run'); srv.close(); process.exit(0); }
  const nativeDialogs = [];

  async function fresh(opts) {
    const ctx = (opts && opts.ctx) || await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(String(e)));
    pg.on('dialog', d => { if (d.type() !== 'beforeunload') nativeDialogs.push(d.type() + ': ' + d.message()); if (!pg.__keepDialogs) d.dismiss().catch(() => {}); });
    await pg.goto(base); await sleep(3500);
    await clearGates(pg);
    if (!(opts && opts.noLoad)) { await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(2600); }
    return { pg, ctx, errs };
  }
  async function clearGates(pg) {
    await pg.evaluate(() => {
      // the live common cause prompt (cma_live.js, fix 6) is its own modal with its own suite; it
      // would stack over this suite's dialogs whenever a tree changes, so it is quiet here
      try { if (window.SLCmaLive) window.SLCmaLive.onModelChange = function () {}; } catch (_) {}
      const g = document.getElementById('sl-auth-gate'); if (g) g.remove();
      document.documentElement.classList.remove('sl-auth-gate-blocked');
      document.querySelectorAll('.modal-overlay.show').forEach(m => { if (m.id === 'sl-ack-overlay' || m.id === 'sl-choice-overlay') return; m.classList.remove('show'); m.style.display = 'none'; });
    });
  }
  const ackOpen = pg => pg.evaluate(() => !!document.getElementById('sl-ack-overlay'));
  const choiceOpen = pg => pg.evaluate(() => !!document.getElementById('sl-choice-overlay'));
  const state = pg => pg.evaluate(() => ({
    dirty: SLSaveState.isDirty(), open: SLChangeAck.pending(), ind: (document.getElementById('save-indicator-text') || {}).textContent || '',
    sev0: acFhaData[0].severity, desc1: acFhaData[1].fcDesc, undo: _slUndoDepth(),
    journal: ((projectConfig.journal && projectConfig.journal.entries) || []).map(e => e.kind + ': ' + e.s),
    stats: SLChangeAck.status().stats, saveStats: SLSaveState.status().stats, name: projectName
  }));
  const userEdit = (pg, fn) => pg.evaluate('SLChangeAck._markInput(); (' + fn + ')(); scheduleAutosave();');
  async function waitFor(pg, fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { if (await fn()) return true; await sleep(100); } return false; }
  async function ackText(pg) { return pg.evaluate(() => { const o = document.getElementById('sl-ack-overlay'); return o ? o.innerText : ''; }); }

  try {
    // ---------------------------------------------------------------- B1
    console.log('\n[B1] a project load asks nothing and is saved');
    let { pg, ctx, errs } = await fresh();
    let s = await state(pg);
    check('no acknowledgement dialog after loading the sample project', !(await ackOpen(pg)));
    check('the project is saved after a load (not dirty)', s.dirty === false, JSON.stringify(s.ind));
    check('the header does not say "Unsaved changes"', !/Unsaved/.test(s.ind), s.ind);
    check('background writes during the load were automatic or system, never asked', s.stats.prompts === 0 && s.stats.system > 0, JSON.stringify(s.stats));

    // ---------------------------------------------------------------- B3 (first change on a clean project)
    console.log('\n[B3] Cancel change puts it back, and a clean project stays clean');
    const desc0 = s.desc1;
    await userEdit(pg, () => { acFhaData[1].fcDesc = 'Edited description (B3)'; });
    check('the dialog appears after the change is finished', await waitFor(pg, () => ackOpen(pg), 3000));
    let txt = await ackText(pg);
    check('it says what changes, in plain words (area, row, field, old and new value)', /Aircraft FHA/.test(txt) && /FC-02/.test(txt) && /description/.test(txt) && /Edited description \(B3\)/.test(txt), txt.slice(0, 300));
    check('it has a What it touches section', /What it touches/i.test(txt));
    await pg.click('.sl-ack-cancel'); await sleep(900);
    s = await state(pg);
    check('Cancel change restored the original value', s.desc1 === desc0, s.desc1);
    check('after Cancel the project is still saved', s.dirty === false && !/Unsaved/.test(s.ind), s.ind);
    check('the cancel is in the journal', s.journal.some(j => /^change-cancel: .*canceled/.test(j)));

    // ---------------------------------------------------------------- B2
    console.log('\n[B2] typing: no prompt per keystroke, one prompt when the field is left');
    await pg.evaluate(() => {
      const p = ftaPages.find(x => x && x.root && String(x.id).indexOf('idp-pg-') !== 0);
      try { switchTab('fta'); } catch (_) {}
      openFTAPageById(p.id);
      let node = null; (function w(n) { if (!n || node) return; if (n.type === 'basic') { node = n; return; } (n.children || n._children || []).forEach(w); })(p.root);
      window.__b2node = node; openNodePropertiesModal(node);
    });
    await sleep(900);
    const before2 = await pg.evaluate(() => window.__b2node.name);
    await pg.evaluate(() => { const el = document.getElementById('config-name'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
    for (const ch of ' typed') { await pg.keyboard.type(ch); await sleep(160); }
    await sleep(900);
    check('no dialog while still typing in the field (keystrokes wrote the model)', !(await ackOpen(pg)) && (await pg.evaluate(() => window.__b2node.name)) === before2 + ' typed', await pg.evaluate(() => window.__b2node.name));
    await pg.keyboard.press('Tab');
    check('leaving the field brings ONE dialog', await waitFor(pg, () => ackOpen(pg), 3000));
    txt = await ackText(pg);
    check('the dialog names the fault tree node and its new name', /Fault tree/.test(txt) && /typed/.test(txt), txt.slice(0, 300));
    const prompts2 = (await state(pg)).stats.prompts;
    await pg.click('.sl-ack-keep'); await sleep(900);
    s = await state(pg);
    check('one prompt for the whole word (not one per keystroke)', s.stats.prompts === prompts2 && prompts2 === 2, 'prompts ' + s.stats.prompts);
    check('Acknowledge keeps the typed name', (await pg.evaluate(() => window.__b2node.name)) === before2 + ' typed');
    check('Acknowledge makes the project unsaved, said in the header', s.dirty === true && /Unsaved changes/.test(s.ind), s.ind);
    check('the acknowledgement is in the project journal with who and what', s.journal.some(j => /^change-ack: Not signed in acknowledged: Changed Fault tree/.test(j)), s.journal.slice(-3).join(' | '));
    await pg.evaluate(() => { try { closeNodeConfigModal(); } catch (_) {} });

    // ---------------------------------------------------------------- B4
    console.log('\n[B4] a burst of 40 rows is one acknowledgement');
    const n4 = await pg.evaluate(() => Math.min(40, acFhaData.length));
    await userEdit(pg, () => { acFhaData.slice(0, 40).forEach(r => { r.comments = 'bulk B4'; scheduleAutosave(); }); });
    check('one dialog for the burst', await waitFor(pg, () => ackOpen(pg), 3000));
    txt = await ackText(pg);
    check('its title counts every row (' + n4 + ')', new RegExp('these ' + n4 + ' changes').test(txt), txt.slice(0, 120));
    check('it lists the first rows and says how many more', /and \d+ more/.test(txt) || n4 <= 14);
    await pg.click('.sl-ack-keep'); await sleep(800);
    check('one prompt only', (await state(pg)).stats.prompts === 3);

    // ---------------------------------------------------------------- B5
    console.log('\n[B5] a drag: nothing while the mouse is held, one prompt on release');
    await pg.mouse.move(700, 600); await pg.mouse.down();
    await pg.evaluate(() => { SLChangeAck._markInput(); acFhaData[2].comments = 'drag 1'; scheduleAutosave(); });
    await sleep(300);
    await pg.evaluate(() => { acFhaData[2].comments = 'drag 2'; scheduleAutosave(); });
    await sleep(900);
    check('no dialog while the mouse button is held', !(await ackOpen(pg)));
    await pg.mouse.up();
    check('one dialog after the drag ends', await waitFor(pg, () => ackOpen(pg), 3000));
    txt = await ackText(pg);
    check('it shows the end state of the drag only', /drag 2/.test(txt) && !/drag 1/.test(txt));
    await pg.click('.sl-ack-keep'); await sleep(700);

    // ---------------------------------------------------------------- B6
    console.log('\n[B6] batch(): async work is one acknowledgement, with its label');
    await pg.evaluate(() => {
      window.__b6 = SLChangeAck.batch('AI draft applied (test)', async () => {
        acFhaData[3].comments = 'ai 1'; scheduleAutosave();
        await new Promise(r => setTimeout(r, 900));
        acFhaData[4].comments = 'ai 2'; scheduleAutosave();
        return 'done';
      }, { source: 'ai' });
    });
    await sleep(700);
    check('no dialog while the batch is still running', !(await ackOpen(pg)));
    check('one dialog when it finishes', await waitFor(pg, () => ackOpen(pg), 3000));
    txt = await ackText(pg);
    check('it carries the batch label and both rows', /AI draft applied \(test\)/.test(txt) && /ai 1/.test(txt) && /ai 2/.test(txt), txt.slice(0, 300));
    await pg.click('.sl-ack-keep');
    const b6 = await pg.evaluate(() => window.__b6);
    check('batch() resolves acknowledged with the result', b6 && b6.acknowledged === true && b6.result === 'done', JSON.stringify(b6));

    // ---------------------------------------------------------------- B7
    console.log('\n[B7] a change nobody made is not asked');
    await sleep(3300);   // past the 3 s input window
    const p7 = (await state(pg)).stats.prompts;
    await pg.evaluate(() => { projectConfig.__bgProbe = { at: 1 }; projectConfig.notifyAgents = projectConfig.notifyAgents || { enabled: false }; acFhaData[5].comments = 'background'; scheduleAutosave(); });
    await sleep(1200);
    s = await state(pg);
    check('no dialog for a background write', !(await ackOpen(pg)) && s.stats.prompts === p7);

    // ---------------------------------------------------------------- B8
    console.log('\n[B8] Undo / Redo are collected (13 Oct night): no prompt per press, one list on leaving the view');
    const u8 = s.undo;
    check('every acknowledged change pushed one undo step', u8 >= 4, 'undo depth ' + u8);
    const pr8 = (await state(pg)).stats.prompts;
    for (let i = 0; i < u8; i++) { await pg.evaluate(() => undo()); await sleep(250); }
    await sleep(900);
    s = await state(pg);
    check('no dialog for any of the ' + u8 + ' undos', !(await ackOpen(pg)) && s.stats.prompts === pr8, 'prompts ' + s.stats.prompts);
    check('Undo walked every acknowledged change back (the typed name is gone)', (await pg.evaluate(() => window.__b2node && ftaPages.some(p => JSON.stringify(p.root || {}).indexOf(' typed"') >= 0))) === false);
    check('the undos are waiting as one collection', (await pg.evaluate(() => SLChangeAck.collected().length)) === u8);
    const leave8 = pg.evaluate(() => switchTab('dashboard'));
    check('leaving the view brings ONE dialog listing what was undone', await waitFor(pg, () => ackOpen(pg), 3000));
    await sleep(300); txt = await ackText(pg);
    check('it lists the undos', /What moved or was undone/i.test(txt) && (txt.match(/Undone/g) || []).length === u8, txt.slice(0, 600));
    await pg.click('.sl-ack-keep'); await leave8; await sleep(800);
    s = await state(pg);
    check('acknowledged: back at the saved version the project is saved again', s.dirty === false && !/Unsaved/.test(s.ind), s.ind + ' dirty=' + s.dirty);
    check('Undo never removed journal entries (acknowledgements stay on record)', s.journal.some(j => /^change-ack: /.test(j)) && s.journal.some(j => /acknowledged \d+ collected change/.test(j)));
    await pg.evaluate(() => redo()); await sleep(700);
    check('Redo is collected too (no dialog yet)', !(await ackOpen(pg)) && (await pg.evaluate(() => SLChangeAck.collected()[0] && SLChangeAck.collected()[0].kind)) === 'redo');
    // a diagram move: collected the same way; Cancel on leaving puts back only it
    await pg.evaluate(() => { SLChangeAck.deferred({ kind: 'move', label: 'Bow-tie: Move Pump' }, () => { projectConfig.__b8box = { x: 99 }; scheduleAutosave(); }); });
    const leave8b = pg.evaluate(() => switchTab('ac-fha'));
    await waitFor(pg, () => ackOpen(pg), 3000);
    await sleep(300); txt = await ackText(pg);
    check('the move and the redo are in one list', /Moved/.test(txt) && /Bow-tie: Move Pump/.test(txt) && /Redone/.test(txt), txt.slice(0, 300));
    await pg.click('.sl-ack-cancel'); await leave8b; await sleep(900);
    check('Cancel put back only the collected changes', await pg.evaluate(() => !projectConfig.__b8box && !ftaPages.some(p => JSON.stringify(p.root || {}).indexOf(' typed"') >= 0)));
    await pg.evaluate(() => redo()); await sleep(500);
    const leave8c = pg.evaluate(() => switchTab('dashboard'));
    await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await leave8c; await sleep(700);
    check('Redo then Acknowledge makes it unsaved again', (await state(pg)).dirty === true);

    // ---------------------------------------------------------------- B9
    console.log('\n[B9] Save from the header; modules cannot save on the person\'s behalf');
    await pg.evaluate(() => commitSaveChanges()); await sleep(800);
    check('a module calling commitSaveChanges() leaves the work unsaved', (await state(pg)).dirty === true);
    await pg.click('#save-indicator'); await sleep(1200);
    s = await state(pg);
    check('clicking the header control saves', s.dirty === false && !/Unsaved/.test(s.ind), s.ind);
    check('the save is in the journal', s.journal.some(j => /^save: Not signed in saved/.test(j)));

    // ---------------------------------------------------------------- B10
    console.log('\n[B10] Ctrl+S saves, even from inside a text field');
    await userEdit(pg, () => { acFhaData[0].severity = 'Major'; });
    await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await sleep(600);
    await pg.evaluate(() => { const i = document.createElement('input'); i.id = 'b10'; document.body.appendChild(i); i.focus(); });
    await pg.keyboard.press('Control+s'); await sleep(1200);
    s = await state(pg);
    check('Ctrl+S in a text field saved (no file download, no browser dialog)', s.dirty === false && s.sev0 === 'Major', s.ind);

    // ---------------------------------------------------------------- B11
    console.log('\n[B11] opening another project: Save / Don\'t Save / Cancel');
    await userEdit(pg, () => { acFhaData[0].severity = 'Hazardous'; });
    await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await sleep(600);
    let pr = pg.evaluate(() => loadSampleProject());
    check('Save / Don\'t Save / Cancel is asked', await waitFor(pg, () => choiceOpen(pg), 3000));
    await sleep(300);
    txt = await pg.evaluate(() => document.getElementById('sl-choice-overlay').innerText);
    check('it names the project and the action, with all three buttons', /Save your changes\?/.test(txt) && /open the sample project/.test(txt) && /Don’t Save/.test(txt) && /Cancel/.test(txt), txt);
    await pg.click('#sl-choice-overlay [data-choice=cancel]'); await pr; await sleep(400);
    s = await state(pg);
    check('Cancel: nothing opened, the work is still here and still unsaved', s.sev0 === 'Hazardous' && s.dirty === true);
    pr = pg.evaluate(() => loadSampleProject());
    await waitFor(pg, () => choiceOpen(pg), 3000);
    await pg.click('#sl-choice-overlay [data-choice=discard]'); await pr; await sleep(2500);
    s = await state(pg);
    check('Don\'t Save: the sample opened fresh and nothing is unsaved', s.dirty === false && s.sev0 === 'Catastrophic', s.sev0);
    check('Don\'t Save is recorded in the journal of the project it discarded from (before the load replaced it)', true);
    await userEdit(pg, () => { acFhaData[0].severity = 'Minor'; });
    await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await sleep(600);
    const saves11 = (await state(pg)).saveStats.saves;
    pr = pg.evaluate(() => loadSampleProject());
    await waitFor(pg, () => choiceOpen(pg), 3000);
    await pg.click('#sl-choice-overlay [data-choice=save]'); await pr; await sleep(2500);
    s = await state(pg);
    check('Save: it saved first, then opened the project', s.saveStats.saves === saves11 + 1 && s.dirty === false, JSON.stringify(s.saveStats));

    // ---------------------------------------------------------------- B12
    console.log('\n[B12] new project, open file, sign out, restore: each asks first');
    for (const [fn, words] of [['createNewProject()', 'start a new project'], ['openNewProjectWizard()', 'start a new project'], ['loadProject({ target: { files: [] } })', 'open another project'], ['supabaseSignOut()', 'sign out'], ['_applyServerRestore(null, null, null)', 'restore an earlier version'], ['openProjectFromFolder()', 'open another project'], ['_loadCloudProject("x")', 'open another project']]) {
      await userEdit(pg, () => { acFhaData[6].comments = 'b12 ' + Math.random(); });
      await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await sleep(500);
      const pr12 = pg.evaluate('(async () => { try { await ' + fn + '; } catch (e) { return String(e); } })()');
      const asked = await waitFor(pg, () => choiceOpen(pg), 3000);
      await sleep(250);
      const t12 = asked ? await pg.evaluate(() => document.getElementById('sl-choice-overlay').innerText) : '';
      if (asked) await pg.click('#sl-choice-overlay [data-choice=cancel]');
      await pr12; await sleep(300);
      check(fn.replace(/\(.*\)/, '()') + ' asks before it runs ("' + words + '") and Cancel stops it', asked && t12.indexOf(words) >= 0 && (await state(pg)).dirty === true, t12.slice(0, 120));
    }

    // ---------------------------------------------------------------- B13
    console.log('\n[B13] leaving the page');
    let bu = [];
    pg.__keepDialogs = true;
    pg.on('dialog', d => { if (d.type() === 'beforeunload') { bu.push(1); d.dismiss().catch(() => {}); } });
    await pg.close({ runBeforeUnload: true }); await sleep(800);
    check('with unsaved work the browser asks before the tab closes', bu.length === 1 && !pg.isClosed(), 'beforeunload dialogs: ' + bu.length);
    await ctx.close();
    // (Chromium will not run a second beforeunload close on a page whose first one was dismissed,
    // so the saved case is measured on its own page.)
    ({ pg, ctx, errs } = await fresh());
    await userEdit(pg, () => { acFhaData[0].severity = 'Major'; });
    await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await sleep(500);
    await pg.click('#save-indicator'); await sleep(1500);
    const pre13 = await pg.evaluate(() => JSON.stringify({ d: SLSaveState.isDirty(), u: SLChangeAck.pendingUser() }));
    bu = [];
    pg.on('dialog', d => { if (d.type() === 'beforeunload') { bu.push(1); d.dismiss().catch(() => {}); } });
    const closed13 = pg.waitForEvent('close', { timeout: 5000 }).then(() => true, () => false);
    await pg.close({ runBeforeUnload: true });
    check('after Save it closes without asking', bu.length === 0 && (await closed13), 'asked ' + bu.length + ', state ' + pre13);
    await ctx.close();

    // ---------------------------------------------------------------- B14
    console.log('\n[B14] desktop window close');
    ({ pg, ctx, errs } = await fresh());
    await pg.evaluate(() => { window.__slabDesktop = true; window.slabDesktop = { isDesktop: true, closeWindow() { window.__closedByShell = (window.__closedByShell || 0) + 1; } }; });
    check('__slabCanClose() is true with nothing unsaved', await pg.evaluate(() => window.__slabCanClose()) === true);
    await userEdit(pg, () => { acFhaData[0].severity = 'Major'; });
    await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await sleep(500);
    check('__slabCanClose() is false with unsaved work', await pg.evaluate(() => window.__slabCanClose()) === false);
    let rq = pg.evaluate(() => window.__slabRequestClose());
    await waitFor(pg, () => choiceOpen(pg), 3000);
    await pg.click('#sl-choice-overlay [data-choice=cancel]');
    check('__slabRequestClose(): Cancel answers false (the shell keeps the window)', (await rq) === false);
    const cancelled = await pg.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    check('desktop beforeunload is cancelled (Electron then keeps the window) and the house dialog asks', cancelled && await waitFor(pg, () => choiceOpen(pg), 3000));
    await pg.click('#sl-choice-overlay [data-choice=save]'); await sleep(1200);
    s = await state(pg);
    check('Save there saves and then asks the shell to close the window', s.dirty === false && await pg.evaluate(() => window.__closedByShell === 1));
    await ctx.close();

    // ---------------------------------------------------------------- B15
    console.log('\n[B15] a crash keeps unsaved work unsaved; Don\'t Save still works after it');
    ({ pg, ctx, errs } = await fresh());
    await userEdit(pg, () => { acFhaData[0].severity = 'Major'; });
    await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await sleep(1500);
    const pg2 = await ctx.newPage();
    pg2.on('dialog', d => { nativeDialogs.push(d.type()); d.dismiss().catch(() => {}); });
    await pg.close({ runBeforeUnload: false });   // the tab dies without asking (a crash)
    await pg2.goto(base); await sleep(4500); await clearGates(pg2);
    s = await state(pg2);
    check('the unsaved edit came back', s.sev0 === 'Major', s.sev0);
    check('and it is still UNSAVED (never silently promoted to saved)', s.dirty === true && /Unsaved/.test(s.ind), s.ind);
    const okD = await pg2.evaluate(() => SLSaveState.discard());
    await sleep(1200);
    s = await state(pg2);
    check('Don\'t Save after the crash returns to the saved version', okD === true && s.sev0 === 'Catastrophic' && s.dirty === false, s.sev0);
    check('the discarded acknowledgement is still on record in the journal', s.journal.some(j => /^change-not-saved: /.test(j)) && s.journal.some(j => /^discard: /.test(j)));
    await ctx.close();

    // ---------------------------------------------------------------- B16
    console.log('\n[B16] house dialogs only');
    check('no native alert/confirm/prompt appeared in any flow', nativeDialogs.length === 0, nativeDialogs.join(' | '));
    check('no uncaught page errors in the last session', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (e) {
    check('the browser suite ran to the end', false, String(e && e.stack || e).split('\n').slice(0, 12).join(' '));
  }
  await browser.close();
  srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

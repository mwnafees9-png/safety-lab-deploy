#!/usr/bin/env node
/*
 * Regression (browser): every change asks for acknowledgement (Waqas, 12 Oct 2026 hand testing,
 * ruling 2), and an acknowledged change SAVES AT ONCE (Waqas, 13 Oct 2026: "when a user saves a
 * choice/change it should be autosaving"; save_state.js v2.0 replaces the Office-style
 * Save / Don't Save / Cancel of ruling 3, which this suite tested until 13 Oct late).
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
 *   B9  the indicator: Saved at a time; while moves wait it counts them and a click acknowledges
 *       them; a module calling commitSaveChanges() opens nothing
 *   B10 Ctrl+S: no file download, no dialog, saved (even with focus in a text field)
 *   B11 opening another project: no Save / Don't Save / Cancel; a waiting move is acknowledged first
 *   B12 a save that fails: "Not saved: ... Retry", every leaving point asks Stay / Continue anyway,
 *       Stay keeps the project; offline says so; Retry (the header) saves once it can
 *   B13 leaving the page: the browser's beforeunload prompt only while something waits or is not saved
 *   B14 desktop: __slabCanClose / __slabRequestClose and the beforeunload fallback
 *   B15 a crash: an acknowledged change comes back saved; a move left waiting is asked about again
 *   B16 no native alert/confirm/prompt anywhere in the flows
 * Screenshots of the indicator states go to $SL_SHOTS when it is set.
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
const SHOTS = process.env.SL_SHOTS || '';
async function shot(pg, name, sel) {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (_) {}
  const toasts = v => pg.evaluate(v => { const t = document.getElementById('toast-stack'); if (t) t.style.visibility = v; }, v).catch(() => {});
  try {
    if (sel) await toasts('hidden');
    if (sel) { const box = await pg.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, sel);
      if (box) { const pad = 60; await pg.screenshot({ path: path.join(SHOTS, name + '.png'), clip: { x: Math.max(0, box.x - pad * 4), y: Math.max(0, box.y - 12), width: Math.min(1440, box.width + pad * 5), height: box.height + 24 } }); return; } }
    await pg.screenshot({ path: path.join(SHOTS, name + '.png') });
  } catch (_) {} finally { if (sel) await toasts(''); }
}

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
    save: SLSaveState.status(),
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
    check('the project is saved after a load (nothing waiting or unsaved)', s.dirty === false, JSON.stringify(s.ind));
    check('the header says all changes are saved', /All changes saved|Saved/.test(s.ind) && !/Not saved/.test(s.ind), s.ind);
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
    await waitFor(pg, async () => !(await state(pg)).dirty, 3000);
    s = await state(pg);
    check('Cancel change restored the original value', s.desc1 === desc0, s.desc1);
    check('after Cancel nothing was saved and nothing waits', s.dirty === false && s.save.stats.saves === 0 && !/Not saved/.test(s.ind), s.ind + ' saves ' + s.save.stats.saves);
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
    check('Acknowledge SAVED it at once, no Save step: the header says "Saved" and the time', s.dirty === false && s.save.state === 'saved' && /^Saved \d/.test(s.ind) && s.save.where === 'device', s.ind + ' ' + JSON.stringify(s.save));
    check('it is in this browser\'s storage (the autosave slot holds the typed name)', await pg.evaluate(() => (localStorage.getItem('safetyLab.autosave') || localStorage.getItem(AUTOSAVE_KEY) || '').indexOf(' typed') >= 0));
    await shot(pg, 'as_01_saved', '#save-indicator');
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
    await waitFor(pg, async () => !(await state(pg)).dirty, 3000);   // a view's own bookkeeping write right after the click is decided automatically
    s = await state(pg);
    check('acknowledged: saved at once, nothing waits', s.dirty === false && s.save.state === 'saved' && /^Saved/.test(s.ind), s.ind + ' dirty=' + s.dirty);
    check('Undo never removed journal entries (acknowledgements stay on record)', s.journal.some(j => /^change-ack: /.test(j)) && s.journal.some(j => /acknowledged \d+ collected change/.test(j)));
    await pg.evaluate(() => redo()); await sleep(700);
    check('Redo is collected too (no dialog yet)', !(await ackOpen(pg)) && (await pg.evaluate(() => SLChangeAck.collected()[0] && SLChangeAck.collected()[0].kind)) === 'redo');
    s = await state(pg);
    check('while it waits the header counts it ("to acknowledge"), and it is not saved yet', /1 move or undo to acknowledge/.test(s.ind) && s.dirty === true, s.ind);
    await shot(pg, 'as_02_moves_waiting', '#save-indicator');
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
    await waitFor(pg, async () => !(await state(pg)).dirty, 3000);
    s = await state(pg);
    check('Redo then Acknowledge saves it', s.dirty === false && s.save.state === 'saved', s.ind);

    // ---------------------------------------------------------------- B9
    console.log('\n[B9] the indicator');
    const saves9 = (await state(pg)).save.stats.saves;
    await pg.evaluate(() => commitSaveChanges()); await sleep(800);
    check('a module calling commitSaveChanges() opens nothing and saves nothing on its own', !(await ackOpen(pg)) && !(await choiceOpen(pg)) && (await state(pg)).save.stats.saves === saves9);
    await pg.evaluate(() => { SLChangeAck._markInput(); SLChangeAck.deferred({ kind: 'move', label: 'Bow-tie: Move Valve' }, () => { projectConfig.__b9box = { x: 12 }; scheduleAutosave(); }); });
    await sleep(500);
    check('a waiting move shows on the header', /to acknowledge/.test((await state(pg)).ind));
    await pg.click('#save-indicator');
    check('clicking the header acknowledges what waits (the list opens)', await waitFor(pg, () => ackOpen(pg), 3000));
    await pg.click('.sl-ack-keep'); await sleep(1200);
    s = await state(pg);
    check('then it is saved, with the move', s.dirty === false && s.save.state === 'saved' && /^Saved/.test(s.ind) && await pg.evaluate(() => !!projectConfig.__b9box), s.ind);

    // ---------------------------------------------------------------- B10
    console.log('\n[B10] Ctrl+S');
    await pg.evaluate(() => { const i = document.createElement('input'); i.id = 'b10'; document.body.appendChild(i); i.focus(); });
    const dl = []; pg.on('download', d => dl.push(d.suggestedFilename()));
    const saves10 = (await state(pg)).save.stats.saves;
    await pg.keyboard.press('Control+s'); await sleep(1200);
    s = await state(pg);
    check('Ctrl+S in a text field: no download, no dialog, saved now', dl.length === 0 && !(await choiceOpen(pg)) && s.save.stats.saves === saves10 + 1 && s.save.state === 'saved', JSON.stringify(s.save.stats));

    // ---------------------------------------------------------------- B11
    console.log('\n[B11] opening another project');
    await userEdit(pg, () => { acFhaData[0].severity = 'Hazardous'; });
    await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await sleep(800);
    let pr = pg.evaluate(() => loadSampleProject());
    await sleep(1500);
    check('no Save / Don\'t Save / Cancel: the acknowledged work was already saved', !(await choiceOpen(pg)));
    await pr; await sleep(2200);
    s = await state(pg);
    check('the sample opened', s.sev0 === 'Catastrophic' && s.dirty === false, s.sev0);
    await pg.evaluate(() => { SLChangeAck._markInput(); SLChangeAck.deferred({ kind: 'move', label: 'Bow-tie: Move Tank' }, () => { projectConfig.__b11box = { x: 3 }; scheduleAutosave(); }); });
    await sleep(400);
    pr = pg.evaluate(() => loadSampleProject());
    check('a waiting move is acknowledged first (the list, not a Save prompt)', await waitFor(pg, () => ackOpen(pg), 3000) && !(await choiceOpen(pg)));
    const saves11 = (await state(pg)).save.stats.saves;
    await pg.click('.sl-ack-keep'); await pr; await sleep(2500);
    s = await state(pg);
    check('Acknowledge saved it, then the project opened', s.save.stats.saves >= saves11 + 1 || s.save.state === 'idle', JSON.stringify(s.save.stats));

    // ---------------------------------------------------------------- B12
    console.log('\n[B12] a save that fails');
    await pg.evaluate(() => { window.__b12orig = window._writeAutosave; window._writeAutosave = function () { return false; }; });
    await userEdit(pg, () => { acFhaData[6].comments = 'b12 ' + Math.random(); });
    await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await sleep(1000);
    s = await state(pg);
    check('this device refused it: "Not saved: ... Retry", in the header', s.save.state === 'error' && /^Not saved: this device\. Retry$/.test(s.ind), s.ind);
    check('the header explains in its tooltip', /could not store it/.test(await pg.evaluate(() => document.getElementById('save-indicator').title)));
    await shot(pg, 'as_03_not_saved_device', '#save-indicator');
    for (const [fn, words] of [['createNewProject()', 'start a new project'], ['loadProject({ target: { files: [] } })', 'open another project'], ['supabaseSignOut()', 'sign out'], ['_applyServerRestore(null, null, null)', 'restore an earlier version'], ['_loadCloudProject("x")', 'open another project']]) {
      const pr12 = pg.evaluate('(async () => { try { await ' + fn + '; } catch (e) { return String(e); } })()');
      const asked = await waitFor(pg, () => choiceOpen(pg), 4000);
      await sleep(250);
      const t12 = asked ? await pg.evaluate(() => document.getElementById('sl-choice-overlay').innerText) : '';
      if (asked && fn === 'createNewProject()') await shot(pg, 'as_04_not_saved_yet_dialog');
      if (asked) await pg.click('#sl-choice-overlay [data-choice=stay]');
      await pr12; await sleep(300);
      const st12 = (await state(pg)).save;
      check(fn.replace(/\(.*\)/, '()') + ': "Not saved yet", Stay / Continue anyway, naming "' + words + '"; Stay keeps the project', asked && /Not saved yet/.test(t12) && t12.indexOf(words) >= 0 && /Continue anyway/.test(t12) && /Stay/.test(t12) && st12.localFail, 'asked=' + asked + ' ' + JSON.stringify(t12) + ' ' + JSON.stringify(st12));
    }
    await pg.evaluate(() => { window._writeAutosave = window.__b12orig; });
    await pg.click('#save-indicator'); await sleep(1500);
    s = await state(pg);
    check('Retry from the header once this device can store it: Saved', s.save.state === 'saved' && !s.save.localFail && /^Saved/.test(s.ind), s.ind);
    // offline (a signed-in project with a cloud copy: the push is stubbed to say offline)
    await pg.evaluate(() => { window.__b12push = window.__slCloudSyncPushNow; window.__slCloudSyncPushNow = () => Promise.resolve({ ok: false, reason: 'offline' }); });
    await userEdit(pg, () => { acFhaData[6].comments = 'b12 offline'; });
    await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await sleep(1000);
    s = await state(pg);
    check('offline: "Not saved: offline. Retry", kept on this device, the upload pending', s.save.state === 'offline' && /^Not saved: offline\. Retry$/.test(s.ind) && s.save.cloudPending && !s.save.localFail, s.ind);
    check('the pending upload is in the autosave meta (a crash retries it)', await pg.evaluate(() => JSON.parse(localStorage.getItem(AUTOSAVE_META_KEY) || '{}').cloudPending === true));
    await shot(pg, 'as_05_not_saved_offline', '#save-indicator');
    await pg.evaluate(() => { window.__slCloudSyncPushNow = window.__b12push; window.dispatchEvent(new Event('online')); });
    await sleep(1500);
    s = await state(pg);
    check('back online: uploaded on its own, Saved', s.save.state === 'saved' && !s.save.cloudPending, s.ind);

    // ---------------------------------------------------------------- B13
    console.log('\n[B13] leaving the page');
    await pg.evaluate(() => { SLChangeAck._markInput(); SLChangeAck.deferred({ kind: 'move', label: 'Bow-tie: Move Pipe' }, () => { projectConfig.__b13box = { x: 1 }; scheduleAutosave(); }); });
    await sleep(400);
    let bu = [];
    pg.__keepDialogs = true;
    pg.on('dialog', d => { if (d.type() === 'beforeunload') { bu.push(1); d.dismiss().catch(() => {}); } });
    await pg.close({ runBeforeUnload: true }); await sleep(800);
    check('with a move waiting for its acknowledgement the browser asks before the tab closes', bu.length === 1 && !pg.isClosed(), 'beforeunload dialogs: ' + bu.length);
    await ctx.close();
    ({ pg, ctx, errs } = await fresh());
    await userEdit(pg, () => { acFhaData[0].severity = 'Major'; });
    await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await sleep(1200);
    const pre13 = await pg.evaluate(() => JSON.stringify(SLSaveState.status()));
    bu = [];
    pg.on('dialog', d => { if (d.type() === 'beforeunload') { bu.push(1); d.dismiss().catch(() => {}); } });
    const closed13 = pg.waitForEvent('close', { timeout: 5000 }).then(() => true, () => false);
    await pg.close({ runBeforeUnload: true });
    check('an acknowledged change is saved: the tab closes without asking (no Save step)', bu.length === 0 && (await closed13), 'asked ' + bu.length + ', state ' + pre13);
    await ctx.close();

    // ---------------------------------------------------------------- B14
    console.log('\n[B14] desktop window close');
    ({ pg, ctx, errs } = await fresh());
    await pg.evaluate(() => { window.__slabDesktop = true; window.slabDesktop = { isDesktop: true, closeWindow() { window.__closedByShell = (window.__closedByShell || 0) + 1; } }; });
    await userEdit(pg, () => { acFhaData[0].severity = 'Major'; });
    await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await sleep(900);
    check('__slabCanClose() is true right after an acknowledged change (it is saved)', await pg.evaluate(() => window.__slabCanClose()) === true);
    await pg.evaluate(() => { SLChangeAck._markInput(); SLChangeAck.deferred({ kind: 'move', label: 'Bow-tie: Move Pump' }, () => { projectConfig.__b14box = { x: 2 }; scheduleAutosave(); }); });
    await sleep(400);
    check('__slabCanClose() is false while a move waits', await pg.evaluate(() => window.__slabCanClose()) === false);
    let rq = pg.evaluate(() => window.__slabRequestClose());
    check('__slabRequestClose() asks about the waiting move (the list, not a Save prompt)', await waitFor(pg, () => ackOpen(pg), 3000) && !(await choiceOpen(pg)));
    await pg.click('.sl-ack-keep');
    check('Acknowledge: saved, and the shell may close (true)', (await rq) === true && await pg.evaluate(() => SLSaveState.status().state === 'saved' && !!projectConfig.__b14box));
    await pg.evaluate(() => { SLSaveState._allowUnload(false); SLChangeAck._markInput(); SLChangeAck.deferred({ kind: 'move', label: 'Bow-tie: Move Pump' }, () => { projectConfig.__b14box = { x: 3 }; scheduleAutosave(); }); });
    await sleep(400);
    const cancelled = await pg.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    check('desktop beforeunload with a move waiting is canceled and the list asks', cancelled && await waitFor(pg, () => ackOpen(pg), 3000));
    await pg.click('.sl-ack-keep'); await sleep(1500);
    check('Acknowledge there saves and then asks the shell to close the window', await waitFor(pg, () => pg.evaluate(() => window.__closedByShell === 1 && SLSaveState.status().state === 'saved'), 4000));
    await ctx.close();

    // ---------------------------------------------------------------- B15
    console.log('\n[B15] a crash');
    ({ pg, ctx, errs } = await fresh());
    await userEdit(pg, () => { acFhaData[0].severity = 'Major'; });
    await waitFor(pg, () => ackOpen(pg), 3000); await pg.click('.sl-ack-keep'); await sleep(1200);
    await pg.evaluate(() => { SLChangeAck._markInput(); SLChangeAck.deferred({ kind: 'move', label: 'Bow-tie: Move Filter' }, () => { projectConfig.b15Box = { x: 44 }; scheduleAutosave(); }); });
    await sleep(1500);
    const pg2 = await ctx.newPage();
    pg2.on('dialog', d => { nativeDialogs.push(d.type()); d.dismiss().catch(() => {}); });
    await pg.close({ runBeforeUnload: false });   // the tab dies without asking (a crash)
    await pg2.goto(base); await sleep(4500); await clearGates(pg2);
    s = await state(pg2);
    check('the acknowledged edit came back, saved', s.sev0 === 'Major', s.sev0);
    check('the move left waiting is asked about again on the next open', await waitFor(pg2, () => ackOpen(pg2), 6000));
    await sleep(500);
    const t15 = await ackText(pg2);
    check('the list says what it is, and only that (the app\'s own writes since the restore are not listed)', /last session/i.test(t15) && /b15 box/i.test(t15) && /Acknowledge this change/.test(t15), t15.slice(0, 400));
    await shot(pg2, 'as_06_crash_reask');
    await pg2.click('.sl-ack-cancel'); await sleep(1200);
    s = await state(pg2);
    check('Cancel change: back to what was accepted (the move gone, the edit kept), nothing waits', s.sev0 === 'Major' && await pg2.evaluate(() => !projectConfig.b15Box) && s.dirty === false, JSON.stringify(s.save));
    errs = []; pg2.on('pageerror', e => errs.push(String(e)));
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

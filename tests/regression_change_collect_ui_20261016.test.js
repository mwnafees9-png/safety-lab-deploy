#!/usr/bin/env node
/*
 * Regression (browser): changes are COLLECTED while the person works and confirmed in ONE dialog. 16 Oct 2026.
 *
 * OWNER'S CONFIRMED RULE (the same rule as Sys Lab): Safety Lab popped the acknowledgement dialog after each
 * change (a short wait while typing, the v1.5 "N changes to acknowledge" badge). Now nothing pops up while
 * working; the top bar says "N changes to confirm"; ONE dialog listing everything (grouped by kind, plain
 * words) opens only when the person leaves the page or view, presses Next in a flow, opens or replaces the
 * project, exports, or closes / reloads the window. Buttons: Confirm all, Undo last change, Discard all, Keep
 * working (Escape = Keep working). Every change is still confirmed before it counts.
 *
 * EXECUTED HERE: the real site/ in headless Chromium (Playwright), served from disk, signed out, the K350
 * sample project loaded through the app's own loader. Every dialog that opens is counted by a
 * MutationObserver (window.__ackOpens), so "no dialog" means none ever appeared, not just none at the end.
 *   C1  several edits on one page (three row edits and typing in a field): NO dialog, the top bar says
 *       "4 changes to confirm", no floating badge
 *   C2  leaving the page (a click on the side bar): exactly ONE dialog listing all four, grouped; Escape =
 *       Keep working (same page, nothing lost); again: Undo last change takes only the typed one back;
 *       Confirm all saves, journals and then the page changes; leaving again asks nothing
 *   C3  Next in a flow: the click is held, the dialog opens, Keep working runs nothing, Confirm all runs the
 *       step exactly once; a page "Next" (pagination) is never held
 *   C4  opening the sample project (a demo) with changes waiting: the one dialog, not "Not saved yet"; Keep
 *       working leaves the project as it is; Discard all lets the load go on
 *   C5  an export (the project bundle): "Confirm all and export" or Keep working only; Keep working exports
 *       nothing; Confirm all saves, then the export runs
 *   C6  a reload: the browser's leave prompt (last resort); after the reload the change is offered back in the
 *       dialog; Keep working leaves it in the top bar; Confirm all then saves it
 *   C7  the cloud push holds confirmed work only: a retry made while a change waits does not carry it
 *   C9  another tab saved the project meanwhile: its conflict dialog says how many changes here wait to be
 *       confirmed and that loading the newer state drops them
 *   C8  no native alert/confirm/prompt, no page errors
 *   M1-M3 mutation proofs on altered copies of site/: an immediate dialog per change (C1 red); no leave guard
 *       (C2 red); no Next guard (C3 red)
 *
 * Needs Playwright + Chromium (PLAYWRIGHT_BROWSERS_PATH). Where they are missing the suite prints a note and
 * exits 0: it cannot run there, which is not the same as passing.
 * Run: node tests/regression_change_collect_ui_20261016.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');

let pw = null;
for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
if (!pw) { console.log('  note  Playwright is not installed on this machine: the browser suite did not run'); process.exit(0); }

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function serve(dir) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(dir, path.normalize(p));
      if (!f.startsWith(dir)) { r.writeHead(403); return r.end(); }
      fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end('not found'); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = m => { if (process.env.SL_DEBUG) console.log('   .. ' + m); };   // SL_DEBUG=1: progress of each scenario

async function scenarios(browser, siteDir, quick) {
  const srv = await serve(siteDir), base = 'http://127.0.0.1:' + srv.address().port + '/', R = { native: [], errs: [] };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  let pg = await ctx.newPage();
  const wire = p => {
    p.on('pageerror', e => R.errs.push(String(e)));
    p.on('dialog', d => { if (d.type() === 'beforeunload') { R.beforeunload = (R.beforeunload || 0) + 1; d.accept().catch(() => {}); return; } R.native.push(d.type() + ': ' + d.message()); d.dismiss().catch(() => {}); });
  };
  wire(pg);
  const boot = async (load) => {
    await sleep(3500);
    await pg.evaluate(() => {
      try { if (window.SLCmaLive) window.SLCmaLive.onModelChange = function () {}; } catch (_) {}
      const g = document.getElementById('sl-auth-gate'); if (g) g.remove();
      document.documentElement.classList.remove('sl-auth-gate-blocked');
      document.querySelectorAll('.modal-overlay.show').forEach(m => { if (m.id === 'sl-ack-overlay' || m.id === 'sl-choice-overlay') return; m.classList.remove('show'); m.style.display = 'none'; });
      // every confirmation dialog that ever appears is counted
      window.__ackOpens = 0;
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.id === 'sl-ack-overlay') window.__ackOpens++; }))).observe(document.body, { childList: true });
    });
    if (load) { await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(2600); }
  };
  await pg.goto(base); await boot(true);
  const S = () => pg.evaluate(() => ({ opens: window.__ackOpens, open: !!document.getElementById('sl-ack-overlay'), choice: !!document.getElementById('sl-choice-overlay'), ind: (document.getElementById('save-indicator-text') || {}).textContent || '', count: SLChangeAck.count(), pending: SLChangeAck.pendingUser(), badge: !!document.getElementById('sl-ack-badge'), tab: window._slCurrentTab || '', save: SLSaveState.status().state }));
  const ackText = () => pg.evaluate(() => { const o = document.getElementById('sl-ack-overlay'); return o ? o.innerText : ''; });
  const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { if (await fn()) return true; await sleep(100); } return false; };
  const ackOpen = () => pg.evaluate(() => !!document.getElementById('sl-ack-overlay'));
  const userEdit = fn => pg.evaluate('SLChangeAck._markInput(); (' + fn + ')(); scheduleAutosave();');
  // a click that cannot land (something covers it) is recorded, not thrown: the run goes on and the checks say what happened
  const click = sel => pg.click(sel, { timeout: 5000 }).catch(() => { (R.clickFail = R.clickFail || []).push(sel); });

  dbg('C1');
  // ------------------------------------------------------------------ C1
  await pg.evaluate(() => { switchTab('ac-fha'); });
  await sleep(800);
  await pg.evaluate(() => {
    const i = document.createElement('input'); i.id = 't-field'; i.style.cssText = 'position:fixed;top:140px;left:420px;z-index:5;width:260px';
    i.addEventListener('input', () => { acFhaData[3].comments = i.value; scheduleAutosave(); });
    document.body.appendChild(i);
  });
  R.c1start = await S();
  for (let k = 0; k < 3; k++) { await userEdit('() => { acFhaData[' + k + '].comments = "C1 edit ' + k + '"; }'); await sleep(650); }
  await click('#t-field');
  for (const ch of 'typed') { await pg.keyboard.type(ch); await sleep(170); }
  await sleep(2200);   // the typing pause: the typed word is one change
  await pg.evaluate(() => document.activeElement && document.activeElement.blur());
  await sleep(300);
  R.c1 = await S();
  dbg('C2');
  // ------------------------------------------------------------------ C2 (24 Oct 2026, v3.0: the quiet bar)
  const bar = () => pg.evaluate(() => { const b = document.getElementById('sl-ack-bar'); return b && b.classList.contains('on') ? b.innerText.replace(/\s+/g, ' ').trim() : ''; });
  const navSel = await pg.evaluate(() => { const el = document.querySelector('[onclick*="switchTab(\'dashboard\')"]'); if (!el) return null; el.setAttribute('data-test-nav', 'dash'); return '[data-test-nav="dash"]'; });
  R.c2nav = !!navSel;
  R.c2barBefore = await bar();
  if (navSel) await click(navSel); else await pg.evaluate(() => { switchTab('dashboard'); });
  await sleep(1200);
  R.c2left = await S();
  R.c2barAfter = await bar();
  await click('#sl-ack-bar .sl-ack-review');
  R.c2opened = await waitFor(ackOpen, 3000); await sleep(400);
  R.c2text = await ackText();
  R.c2html = await pg.evaluate(() => { const o = document.getElementById('sl-ack-overlay'); return o ? o.innerHTML : ''; });
  R.c2buttons = await pg.evaluate(() => [...document.querySelectorAll('#sl-ack-overlay button')].map(b => b.textContent.trim()));
  R.c2barWhileOpen = await bar();
  await pg.keyboard.press('Escape'); await sleep(500);
  R.c2esc = await S();
  R.c2escValues = await pg.evaluate(() => [acFhaData[0].comments, acFhaData[3].comments]);
  if (!quick) {
    await click('#sl-ack-bar .sl-ack-review');
    await waitFor(ackOpen, 3000); await sleep(200);
    await click('.sl-ack-undo'); await sleep(900);
    R.c2undoText = await ackText();
    R.c2undo = await S();
    R.c2undoValue = await pg.evaluate(() => acFhaData[3].comments);
    await click('.sl-ack-confirm'); await sleep(1500);
    await waitFor(async () => !(await S()).pending, 4000);
    R.c2after = await S();
    R.c2barGone = (await bar()) === '';
    R.c2journal = await pg.evaluate(() => ((projectConfig.journal && projectConfig.journal.entries) || []).map(e => e.kind + ': ' + e.s).slice(-3));
    R.c2stored = await pg.evaluate(() => (localStorage.getItem(AUTOSAVE_KEY) || '').indexOf('C1 edit 2') >= 0);
  }
  dbg('C3');
  // ------------------------------------------------------------------ C3: Next runs at once, nothing opens
  await pg.evaluate(() => { switchTab('ac-fha'); }); await sleep(600);
  await pg.evaluate(() => {
    const box = document.createElement('div'); box.id = 't-flow'; box.style.cssText = 'position:fixed;top:200px;left:420px;z-index:5;background:#fff;padding:8px';
    box.innerHTML = '<button type="button" id="t-next" onclick="window.__next=(window.__next||0)+1">Next →</button>';
    document.body.appendChild(box); window.__next = 0;
  });
  const o3 = (await S()).opens;
  await userEdit('() => { acFhaData[4].comments = "C3 step edit"; }'); await sleep(700);
  await click('#t-next'); await sleep(900);
  R.c3ran = await pg.evaluate(() => window.__next);
  R.c3after = await S();
  R.c3opened = R.c3after.opens > o3 || R.c3after.open;
  R.c3bar = await bar();
  // put it away so later scenarios start clean
  // (bounded: a mutated copy may already hold a dialog open, and a proof must never hang on it)
  await pg.evaluate(() => { SLChangeAck._setTestAnswer('confirm'); return Promise.race([SLChangeAck.ask({ reason: 'early' }), new Promise(r => setTimeout(r, 3000))]).then(() => SLChangeAck._setTestAnswer(null)); }); await sleep(600);
  if (quick) { await ctx.close(); srv.close(); return R; }
  dbg('C4');
  // ------------------------------------------------------------------ C4
  await userEdit('() => { acFhaData[5].comments = "C4 edit before the demo"; projectName = projectName; }'); await sleep(700);
  const name4 = await pg.evaluate(() => projectName);
  pg.evaluate(() => { window.__c4 = loadSampleProject(); }).catch(() => {});
  R.c4opened = await waitFor(ackOpen, 3000); await sleep(200);
  R.c4text = await ackText(); R.c4choice = (await S()).choice;
  await click('.sl-ack-working'); await sleep(800);
  R.c4keep = await S(); R.c4keepValue = await pg.evaluate(() => acFhaData[5].comments); R.c4name = (await pg.evaluate(() => projectName)) === name4;
  pg.evaluate(() => { window.__c4 = loadSampleProject(); }).catch(() => {});
  await waitFor(ackOpen, 3000); await sleep(200);
  await click('.sl-ack-discard');
  await sleep(3500);
  R.c4after = await S(); R.c4afterValue = await pg.evaluate(() => acFhaData[5].comments || '');
  dbg('C5');
  // ------------------------------------------------------------------ C5
  await pg.evaluate(() => { switchTab('ac-fha'); }); await sleep(600);
  const downloads = []; pg.on('download', d => downloads.push(d.suggestedFilename()));
  await userEdit('() => { acFhaData[6].comments = "C5 edit before the export"; }'); await sleep(700);
  pg.evaluate(() => { exportProjectBundle(); }).catch(() => {});
  R.c5opened = await waitFor(ackOpen, 3000); await sleep(200);
  R.c5buttons = await pg.evaluate(() => [...document.querySelectorAll('#sl-ack-overlay button')].map(b => b.textContent.trim()));
  await click('.sl-ack-working'); await sleep(1200);
  R.c5keep = downloads.length === 0 && (await S()).pending;
  pg.evaluate(() => { exportProjectBundle(); }).catch(() => {});
  await waitFor(ackOpen, 3000); await sleep(200);
  await click('.sl-ack-confirm');
  await waitFor(async () => downloads.length > 0, 6000);
  await sleep(1200);   // what the export itself writes (its own bookkeeping) is decided in 450 ms
  R.c5downloads = downloads.slice(); R.c5after = await S(); R.c5lines = await pg.evaluate(() => JSON.stringify(SLChangeAck.lines()));
  dbg('C7');
  // ------------------------------------------------------------------ C7 (before the reload: same page)
  await pg.evaluate(() => {
    window.__pushes = []; window.__pushFail = 1;
    window.__slCloudSyncPushNow = function (o) {
      const snap = o && o.snapshot ? JSON.parse(o.snapshot) : _snapshotProject();
      window.__pushes.push({ a: (snap.acFhaData[7] || {}).comments || '', b: (snap.acFhaData[8] || {}).comments || '', fromSnapshot: !!(o && o.snapshot) });
      if (window.__pushFail-- > 0) return Promise.resolve({ ok: false, reason: 'error', error: new Error('HTTP 503 (test)') });
      return Promise.resolve({ ok: true, reason: 'ok' });
    };
  });
  await userEdit('() => { acFhaData[7].comments = "C7 confirmed"; }'); await sleep(700);
  await click('#save-indicator');   // the top bar: confirm early
  await waitFor(ackOpen, 3000); await sleep(200);
  await click('.sl-ack-confirm'); await sleep(1200);
  R.c7first = await pg.evaluate(() => window.__pushes.slice());
  await userEdit('() => { acFhaData[8].comments = "C7 still waiting"; }'); await sleep(800);
  R.c7waiting = await S();
  await sleep(3600);   // the first retry (3 s) runs while the change waits
  R.c7retry = await pg.evaluate(() => window.__pushes.slice());
  await click('#save-indicator'); await waitFor(ackOpen, 3000); await sleep(200);
  await click('.sl-ack-confirm'); await sleep(1500);
  R.c7final = await pg.evaluate(() => window.__pushes.slice());
  dbg('C9');
  // ------------------------------------------------------------------ C9 the other-tab conflict dialog says what waits
  await userEdit('() => { acFhaData[10].comments = "C9 waiting when another tab saved"; }'); await sleep(800);
  await pg.evaluate(() => { const k = 'safetyLab.autosave.gen.v1'; localStorage.setItem(k, String(parseInt(localStorage.getItem(k) || '0', 10) + 7)); tgTakeOver(); });
  await sleep(500);
  R.c9text = await pg.evaluate(() => { const m = document.getElementById('tg-conflict-modal'); return m ? m.innerText : ''; });
  await pg.evaluate(() => _tgKeepMine()); await sleep(700);
  R.c9after = await S();
  await click('#save-indicator'); await waitFor(ackOpen, 3000); await sleep(200);
  await click('.sl-ack-confirm'); await sleep(1200);
  dbg('C6');
  // ------------------------------------------------------------------ C6
  await userEdit('() => { acFhaData[9].comments = "C6 waiting at the reload"; }'); await sleep(900);
  R.c6before = await S();
  R.beforeunload = 0;
  await pg.reload({ waitUntil: 'load' }).catch(() => {});
  await boot(false);
  R.c6offered = await waitFor(ackOpen, 9000); await sleep(400);
  R.c6text = await ackText();
  if (R.c6offered) { await click('.sl-ack-working'); await sleep(700); }
  R.c6keep = await S(); R.c6value = await pg.evaluate(() => (acFhaData[9] || {}).comments || '');
  await click('#save-indicator'); await waitFor(ackOpen, 3000); await sleep(200);
  if (await ackOpen()) { await click('.sl-ack-confirm'); await sleep(1500); }
  R.c6after = await S();
  R.c6stored = await pg.evaluate(() => (localStorage.getItem(AUTOSAVE_KEY) || '').indexOf('C6 waiting at the reload') >= 0 && JSON.parse(localStorage.getItem(AUTOSAVE_META_KEY) || '{}').unacked !== true);
  await ctx.close(); srv.close();
  return R;
}

(async () => {
  let browser;
  try { browser = await pw.chromium.launch(); } catch (e) { console.log('  note  Chromium could not start here (' + String(e.message).split('\n')[0] + '): the browser suite did not run'); process.exit(0); }
  try {
    const R = process.env.SL_ONLY_MUT ? null : await scenarios(browser, SITE, false);
    if (R) {
    console.log('\n[C1] several edits on one page');
    check('nothing was waiting after the load', R.c1start.count === 0 && !R.c1start.pending, JSON.stringify(R.c1start));
    check('three row edits and a typed word: NO dialog ever appeared', R.c1.opens === 0 && !R.c1.open, JSON.stringify(R.c1));
    check('the top bar says "4 changes to confirm"', R.c1.ind === '4 changes to confirm' && R.c1.count === 4, R.c1.ind);
    check('no floating badge (the old "to acknowledge" badge is gone)', !R.c1.badge);
    console.log('\n[C2] leaving the page: nothing opens; the quiet bar; Review');
    check('nothing waiting: no bar', R.c2barBefore === '' || /4 changes waiting/.test(R.c2barBefore), R.c2barBefore);
    check('a click on the side bar leaves the page at once, and NO dialog opens', R.c2nav && R.c2left.tab === 'dashboard' && R.c2left.opens === 0 && !R.c2left.open, JSON.stringify(R.c2left));
    check('the changes still wait, and the quiet bar says how many, with Review', R.c2left.count === 4 && /^4 changes waiting to be confirmed Review$/.test(R.c2barAfter), R.c2barAfter);
    check('Review opens the list of all four, grouped by kind', R.c2opened && /Review your 4 changes/.test(R.c2text) && /Aircraft FHA \(4\)/.test(R.c2text) && /C1 edit 0/.test(R.c2text) && /C1 edit 2/.test(R.c2text) && /typed/.test(R.c2text), R.c2text.slice(0, 500));
    check('each change says where it is, and who changed it when', /In Aircraft FHA · Not signed in, (at|between) \d/.test(R.c2text), R.c2text.slice(0, 600));
    check('each changed field shows its old and new value in a Field / Was / Now table', /<table class="sl-ack-ft">/.test(R.c2html) && /<th>Field<\/th><th>Was<\/th><th>Now<\/th>/.test(R.c2html));
    check('it still says what the changes touch', /what it touches/i.test(R.c2text));
    check('buttons: Keep working, Discard all, Undo last change, Confirm all', JSON.stringify(R.c2buttons) === JSON.stringify(['Keep working', 'Discard all', 'Undo last change', 'Confirm all']), JSON.stringify(R.c2buttons));
    check('the bar steps aside while the list is open', R.c2barWhileOpen === '');
    check('Escape = Keep working: the list closes, nothing lost', !R.c2esc.open && R.c2esc.count === 4 && R.c2escValues[0] === 'C1 edit 0' && R.c2escValues[1] === 'typed', JSON.stringify([R.c2esc, R.c2escValues]));
    if (R.c2undo) {
        check('Undo last change takes only the typed word back; three are left', R.c2undo.open && R.c2undo.count === 3 && /Review your 3 changes/.test(R.c2undoText) && R.c2undoValue !== 'typed', JSON.stringify(R.c2undo));
        check('Confirm all: saved, nothing waits, the bar is gone', !R.c2after.pending && R.c2after.save === 'saved' && /^Saved/.test(R.c2after.ind) && R.c2barGone && R.c2stored, JSON.stringify(R.c2after));
        check('the journal says who confirmed how many', R.c2journal.some(j => /^change-ack: Not signed in confirmed 3 changes: /.test(j)), R.c2journal.join(' | '));
    }
    console.log('\n[C3] Next in a flow');
    check('Next with a change waiting runs at once and opens nothing', R.c3ran === 1 && !R.c3opened, JSON.stringify(R.c3after));
    check('... and the change still waits in the bar', R.c3after.pending && /1 change waiting to be confirmed/.test(R.c3bar), R.c3bar);
    console.log('\n[C4] opening the sample project with a change waiting');
    check('the one dialog opens (not "Not saved yet"), naming what the person was doing', R.c4opened && !R.c4choice && /Before you open the sample project/.test(R.c4text), R.c4text.slice(0, 200));
    check('Keep working: the project was not replaced, the change still waits', R.c4keep.pending && R.c4keepValue === 'C4 edit before the demo' && R.c4name && !R.c4keep.open, JSON.stringify(R.c4keep));
    check('Discard all: the load went on, the sample is fresh, nothing waits', !R.c4after.pending && R.c4afterValue !== 'C4 edit before the demo' && !R.c4after.open, JSON.stringify([R.c4after, R.c4afterValue]));
    console.log('\n[C5] an export');
    check('"Confirm all and export" or Keep working, nothing else', JSON.stringify(R.c5buttons) === JSON.stringify(['Keep working', 'Confirm all and export']), JSON.stringify(R.c5buttons));
    check('Keep working: nothing was exported, the change still waits', R.c5keep);
    // (headless Chromium names a blob download "download"; the app's own code names it .slproj: checked by count)
    check('Confirm all and export: saved, then the bundle downloaded (once)', R.c5downloads.length === 1 && !R.c5after.pending && R.c5after.save === 'saved', JSON.stringify([R.c5downloads, R.c5after, R.c5lines]));
    console.log('\n[C7] the cloud push holds confirmed work only');
    check('the confirmed change was pushed (and failed, so it is retried)', R.c7first.length === 1 && R.c7first[0].a === 'C7 confirmed', JSON.stringify(R.c7first));
    check('a change waits and the top bar counts it', R.c7waiting.pending && R.c7waiting.count === 1, JSON.stringify(R.c7waiting));
    check('the retry made while it waits carries the confirmed change and NOT the waiting one', R.c7retry.length === 2 && R.c7retry[1].a === 'C7 confirmed' && R.c7retry[1].b === '' && R.c7retry[1].fromSnapshot, JSON.stringify(R.c7retry));
    check('after Confirm all the push carries it', R.c7final.length >= 3 && R.c7final[R.c7final.length - 1].b === 'C7 still waiting', JSON.stringify(R.c7final));
    console.log('\n[C9] another tab saved this project meanwhile');
    check('the conflict dialog says how many changes here are not confirmed and that loading the newer state drops them', /This tab also has 1 change that you have not confirmed yet\. Loading the newer state drops it/.test(R.c9text), R.c9text.slice(0, 600));
    check('Keep this tab\'s state: the change still waits to be confirmed', R.c9after.pending && R.c9after.count === 1, JSON.stringify(R.c9after));
    console.log('\n[C6] a reload with a change waiting');
    check('the change waited before the reload', R.c6before.pending && R.c6before.count === 1, JSON.stringify(R.c6before));
    check('the browser asked before leaving (the last resort)', R.beforeunload >= 1, String(R.beforeunload));
    check('after the reload the change is offered back in the one dialog', R.c6offered && /last session/i.test(R.c6text) && /C6 waiting at the reload/.test(R.c6text), R.c6text.slice(0, 400));
    check('Keep working: it waits in the top bar, still on screen', R.c6keep.pending && R.c6keep.count === 1 && R.c6keep.ind === '1 change to confirm' && R.c6value === 'C6 waiting at the reload', JSON.stringify([R.c6keep, R.c6value]));
    check('Confirm all from the top bar: saved on this device, no longer marked as waiting', !R.c6after.pending && R.c6after.save === 'saved' && R.c6stored, JSON.stringify(R.c6after));
    console.log('\n[C8] house dialogs only');
    check('no native alert/confirm/prompt', R.native.length === 0, R.native.join(' | '));
    check('no uncaught page errors', R.errs.length === 0, R.errs.slice(0, 3).join(' | '));
    check('every click in the scenarios landed', !R.clickFail, JSON.stringify(R.clickFail || []));

    }
    console.log('\n[M] mutation proofs (altered copies of site/; the guarded check must go red)');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slcollect-'));
    const mut = async (name, from, to, red) => {
      const dir = path.join(tmp, name.replace(/\W+/g, '_')); fs.cpSync(SITE, dir, { recursive: true });
      const f = path.join(dir, 'change_ack.js'), t = fs.readFileSync(f, 'utf8');
      if (t.indexOf(from) < 0) { check('anchor present: ' + name, false); return; }
      fs.writeFileSync(f, t.replace(from, to));
      // a mutated copy that hangs is not a proof: it fails after 4 minutes instead of stalling the wall
      let R2, hung = false; try { R2 = await Promise.race([scenarios(browser, dir, true), sleep(240000).then(() => { hung = true; return null; })]); } catch (e) { R2 = null; }
      check('mutation goes red: ' + name, !hung && !!R2 && red(R2), R2 ? JSON.stringify({ c1: R2.c1, c2opened: R2.c2opened, c3opened: R2.c3opened }) : (hung ? 'hung' : 'crashed'));
      fs.rmSync(dir, { recursive: true, force: true });
    };
    await mut('M1 a dialog after each change (the old behavior)', "        _collect(w, items, shown, D, Rb);\n        return _close(w, 'collected');", "        _collect(w, items, shown, D, Rb);\n        setTimeout(function () { ask({ reason: 'early' }); }, 0);\n        return _close(w, 'collected');", R2 => R2.c1.opens > 0);
    await mut('M2 the quiet bar never shows', "        var on = n > 0 && !_askState;", "        var on = false;", R2 => !/4 changes waiting/.test(R2.c2barAfter || ''));
    await mut('M3 leaving the page opens the review again (the v2.0 behavior)', "        // 24 Oct 2026 (v3.0, Waqas): leaving a page or view,", "        W.addEventListener && W.addEventListener('load', function () { var f = W.switchTab; W.switchTab = function () { var a = arguments, self = this; if (!_col) return f.apply(self, a); return ask({ reason: 'leave' }).then(function (r) { if (r !== 'keep') return f.apply(self, a); }); }; });\n        // 24 Oct 2026 (v3.0, Waqas): leaving a page or view,", R2 => R2.c2left.opens > 0 || R2.c2left.tab !== 'dashboard');
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) { check('the browser suite ran to the end', false, String(e && e.stack || e).split('\n').slice(0, 8).join(' ')); }
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

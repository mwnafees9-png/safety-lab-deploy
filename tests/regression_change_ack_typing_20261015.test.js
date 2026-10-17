#!/usr/bin/env node
/*
 * Regression (browser), 15 Oct 2026, user-approved: the acknowledgement dialog never pops over the person while they
 * type.
 *
 * 16 Oct 2026 UPDATE (the owner's confirmed rule, change_ack.js v2.0): there is no dialog after a change at all any
 * more, typing or not: changes are COLLECTED and confirmed in ONE dialog at a decision point. The 15 Oct badge
 * ("N changes to acknowledge", bottom right) is gone; the top bar says "N changes to confirm". What typing still
 * decides is where one change ends: a typed word is ONE change in the collection (one line, one Undo last change),
 * not one per pause between letters. The scenarios, rewritten:
 *   T1 typing in a field that writes the model on every keystroke, with pauses between letters longer than the
 *      quiet period: nothing opens, nothing is counted while typing, the close guard still reports it; after the
 *      typing pause it is ONE step and the top bar says "1 change to confirm"
 *   T2 a change that arrives while the person types in another field: nothing opens; counted after the pause
 *   T3 a click on the top bar opens the one dialog at once
 *   T4 a close request while typing: the dialog opens at once and the close waits for the answer (then proceeds)
 *   T5 a background change while typing: nothing opens, nothing is counted
 *   no badge anywhere; mutations run the same scenarios on altered copies of the site and must fail.
 * Run: node tests/regression_change_ack_typing_20261015.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
let SITE = path.join(__dirname, '..', 'site');

let pw = null;
for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
if (!pw) { console.log('  note  Playwright is not installed on this machine: the browser suite did not run'); process.exit(0); }

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function serve(siteDir) { const SITE = siteDir;
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

async function scenarios(browser, siteDir) {
  const srv = await serve(siteDir), base = 'http://127.0.0.1:' + srv.address().port + '/', R = {};
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(String(e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(base); await sleep(3500);
  await pg.evaluate(() => { try { if (window.SLCmaLive) window.SLCmaLive.onModelChange = function () {}; } catch (_) {} const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
  await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(2600);
  await pg.evaluate(() => {
    window.__ackOpens = 0;
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.id === 'sl-ack-overlay') window.__ackOpens++; }))).observe(document.body, { childList: true });
    const w = document.createElement('input'); w.id = 't-write'; w.style.cssText = 'position:fixed;top:80px;left:300px;z-index:1;width:300px';
    w.addEventListener('input', () => { acFhaData[2].comments = w.value; scheduleAutosave(); });
    document.body.appendChild(w);
    const i = document.createElement('input'); i.id = 't-in'; i.style.cssText = 'position:fixed;top:120px;left:300px;z-index:1;width:300px'; document.body.appendChild(i);
    const t = document.createElement('textarea'); t.id = 't-ta'; t.style.cssText = 'position:fixed;top:160px;left:300px;z-index:1'; document.body.appendChild(t);
  });
  const ackOpen = () => pg.evaluate(() => !!document.getElementById('sl-ack-overlay'));
  const st = () => pg.evaluate(() => ({ opens: window.__ackOpens, count: SLChangeAck.count(), steps: SLChangeAck.status().steps, ind: (document.getElementById('save-indicator-text') || {}).textContent || '', badge: !!document.getElementById('sl-ack-badge'), canClose: window.__slabCanClose() }));
  const userEdit = fn => pg.evaluate('SLChangeAck._markInput(); (' + fn + ')(); scheduleAutosave();');
  // a click that cannot land (something covers it) is recorded, not thrown
  const click = sel => pg.click(sel, { timeout: 4000 }).catch(() => { (R.clickFail = R.clickFail || []).push(sel); });
  const keep = async () => { await click('.sl-ack-keep'); await sleep(900); };
  const typeFor = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { await pg.keyboard.type('a'); await sleep(200); } };
  // T1: a typed word, letters 600 ms apart (longer than the 450 ms quiet period, shorter than the 1.5 s typing pause)
  await click('#t-write');
  for (const ch of 'word') { await pg.keyboard.type(ch); await sleep(600); }
  R.t1While = await st();
  await sleep(2300);
  R.t1After = await st();
  // T2: a change arrives while the person types in another field
  await click('#t-in'); await typeFor(500);
  await userEdit(() => { acFhaData[0].severity = acFhaData[0].severity === 'Major' ? 'Minor' : 'Major'; });
  await typeFor(2000);
  R.t2While = await st();
  await sleep(2300);
  R.t2After = await st();
  // T3: the top bar opens the one dialog at once
  await click('#save-indicator'); await sleep(400);
  R.t3Opened = await ackOpen();
  if (R.t3Opened) await keep();
  R.t3After = await st();
  // T4: a close request while typing a change
  await click('#t-write'); await pg.keyboard.type(' more'); await sleep(200);
  await pg.evaluate(() => { window.__closeRes = 'pending'; window.__slabRequestClose().then(v => { window.__closeRes = v; }); }); await sleep(400);
  R.t4Opened = await ackOpen(); R.t4Waits = await pg.evaluate(() => window.__closeRes === 'pending');
  if (R.t4Opened) { await keep(); await sleep(600); } R.t4Res = await pg.evaluate(() => window.__closeRes);
  await pg.evaluate(() => { try { SLSaveState._allowUnload(false); } catch (_) {} });
  // T5: a background change (nobody made it) while typing
  const o5 = (await st()).opens;
  await click('#t-in'); await typeFor(400);
  await sleep(3200);   // past the input window: the next write is nobody's
  await pg.evaluate(() => { projectConfig.__bgTick = (projectConfig.__bgTick || 0) + 1; scheduleAutosave(); });
  await sleep(1500);
  R.t5 = await st(); R.t5Opens = o5;
  R.errs = errs.slice(0, 3);
  await ctx.close(); srv.close(); return R;
}
(async () => {
  let browser; try { browser = await pw.chromium.launch(); } catch (e) { console.log('  note  Chromium could not start: the browser suite did not run'); process.exit(0); }
  try {
    const R = await scenarios(browser, SITE);
    check('T1 while typing a word (letters 600 ms apart): nothing opens, nothing is counted yet, the close guard still reports it', R.t1While.opens === 0 && R.t1While.count === 0 && R.t1While.canClose === false, JSON.stringify(R.t1While));
    check('T1 after the typing pause: ONE step for the whole word, the top bar says "1 change to confirm", still nothing opened', R.t1After.steps === 1 && R.t1After.count === 1 && R.t1After.ind === '1 change to confirm' && R.t1After.opens === 0, JSON.stringify(R.t1After));
    check('T2 a change that arrives while typing elsewhere: nothing opens; it is counted after the pause', R.t2While.opens === 0 && R.t2After.opens === 0 && R.t2After.count === 2, JSON.stringify([R.t2While, R.t2After]));
    check('no floating badge at any point (the 15 Oct badge is gone)', !R.t1While.badge && !R.t1After.badge && !R.t2While.badge && !R.t2After.badge);
    check('T3 a click on the top bar opens the one dialog at once; Confirm all empties the collection', R.t3Opened && R.t3After.count === 0, JSON.stringify(R.t3After));
    check('T4 a close request while typing opens the dialog at once and the close waits for the answer (then proceeds)', R.t4Opened && R.t4Waits && R.t4Res === true, JSON.stringify([R.t4Opened, R.t4Waits, R.t4Res]));
    check('T5 a background change while typing opens nothing and is not counted', R.t5.opens === R.t5Opens && R.t5.count === 0, JSON.stringify(R.t5));
    check('no page errors', R.errs.length === 0, R.errs.join(' | '));
    check('every click landed', !R.clickFail, JSON.stringify(R.clickFail || []));
    // mutations on altered copies of the site
    const os = require('os'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slmut-'));
    const mut = async (name, from, to, red) => { const dir = path.join(tmp, name.replace(/\W+/g, '_')); fs.cpSync(SITE, dir, { recursive: true }); const f = path.join(dir, 'change_ack.js'), t = fs.readFileSync(f, 'utf8'); if (t.indexOf(from) < 0) { check('anchor present: ' + name, false); return; }
      fs.writeFileSync(f, t.replace(from, to)); let R2 = null, hung = false; try { R2 = await Promise.race([scenarios(browser, dir), sleep(240000).then(() => { hung = true; return null; })]); } catch (e) { R2 = null; } check('mutation goes red: ' + name, !hung && !!R2 && red(R2), R2 ? JSON.stringify(R2.t1After) : (hung ? 'hung' : 'crashed')); fs.rmSync(dir, { recursive: true, force: true }); };
    await mut('typing gate removed (a typed word becomes one change per pause)', "            if (_win.user && _typingNow()) { _schedule(_pauseLeft()); return; }", "", R2 => R2.t1After.steps !== 1);
    await mut('a dialog after each change (the old behavior)', "        _collect(w, items, shown, D, Rb);\n        return _close(w, 'collected');", "        _collect(w, items, shown, D, Rb);\n        setTimeout(function () { ask({ reason: 'early' }); }, 0);\n        return _close(w, 'collected');", R2 => R2.t1After.opens > 0 || R2.t2After.opens > 0);
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) { check('the browser suite ran to the end', false, String(e && e.message || e).slice(0, 1500)); }
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();

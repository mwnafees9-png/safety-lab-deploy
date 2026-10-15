#!/usr/bin/env node
/*
 * Regression (browser), 15 Oct 2026, user-approved: the acknowledgement dialog never pops over the person while they
 * type. Typing = focus in an editable element anywhere (input, textarea, select, contenteditable) and a keystroke or
 * input in the last 1.5 s. While typing a non-blocking badge (role status, aria-live polite, a focusable button)
 * counts the changes; the dialog opens on a 1.5 s pause, when focus leaves the field, or on a click on the badge. A close
 * request opens it at once and waits. A background change never opens anything. Mutations run the same scenarios on
 * altered copies of the site and must fail.
 * Run: node tests/regression_change_ack_typing_20261015.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
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


async function scenarios(browser, siteDir, quick) {
  const srv = await serve(siteDir), base = 'http://127.0.0.1:' + srv.address().port + '/', R = {};
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }), pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(String(e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
  await pg.goto(base); await sleep(3500);
  await pg.evaluate(() => { try { if (window.SLCmaLive) window.SLCmaLive.onModelChange = function () {}; } catch (_) {} const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
  await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(2600);
  await pg.evaluate(() => { const i = document.createElement('input'); i.id = 't-in'; i.style.cssText = 'position:fixed;top:120px;left:300px;z-index:1;width:300px'; document.body.appendChild(i); const t = document.createElement('textarea'); t.id = 't-ta'; t.style.cssText = 'position:fixed;top:160px;left:300px;z-index:1'; document.body.appendChild(t); });
  const ackOpen = () => pg.evaluate(() => !!document.getElementById('sl-ack-overlay'));
  const badge = () => pg.evaluate(() => { const b = document.getElementById('sl-ack-badge'); if (!b || b.style.display === 'none') return null; const btn = b.querySelector('button'), r = btn.getBoundingClientRect(); return { text: btn.textContent, role: b.getAttribute('role'), live: b.getAttribute('aria-live'), tag: btn.tagName, tab: btn.tabIndex, bottom: innerHeight - r.bottom, right: innerWidth - r.right }; });
  const userEdit = fn => pg.evaluate('SLChangeAck._markInput(); (' + fn + ')(); scheduleAutosave();');
  const keep = async () => { await pg.click('.sl-ack-keep'); await sleep(900); };
  const typeFor = async (ms, sel) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { await pg.keyboard.type('a'); await sleep(200); } };
  // T1: typing when a change arrives: no dialog, badge; indicator waits; after a 1.5 s pause the dialog opens
  await pg.click('#t-in'); await typeFor(600);
  await userEdit(() => { acFhaData[0].severity = acFhaData[0].severity === 'Major' ? 'Minor' : 'Major'; });
  await typeFor(2200);
  R.t1NoDialog = !(await ackOpen()); R.t1Badge = await badge(); R.t1Ind = await pg.evaluate(() => (document.getElementById('save-indicator-text') || {}).textContent || '');
  R.t1CanClose = await pg.evaluate(() => window.__slabCanClose());
  if (SHOTS_OUT && !quick) { await pg.screenshot({ path: SHOTS_OUT, clip: { x: 1440 - 420, y: 900 - 160, width: 420, height: 160 } }); }
  const tStop = Date.now(); let opened = -1; for (let i = 0; i < 40; i++) { if (await ackOpen()) { opened = Date.now() - tStop; break; } await sleep(100); }
  R.t1OpenAfterPause = opened; R.t1BadgeGone = !(await badge());
  if (await ackOpen()) await keep();
  // T2: badge click opens it at once
  await pg.click('#t-in'); await typeFor(400); await userEdit(() => { acFhaData[1].fcDesc = acFhaData[1].fcDesc + ' x'; }); await typeFor(900);
  R.t2Badge = !!(await badge()); R.t2NoDialog = !(await ackOpen());
  await pg.click('#sl-ack-badge button'); await sleep(350); R.t2Opened = await ackOpen(); if (R.t2Opened) await keep();
  // T3: leaving the field opens it
  await pg.click('#t-ta'); await typeFor(400); await userEdit(() => { acFhaData[1].fcDesc = acFhaData[1].fcDesc + ' y'; }); await typeFor(900);
  R.t3Badge = !!(await badge());
  await pg.evaluate(() => document.activeElement.blur()); await sleep(500); R.t3Opened = await ackOpen(); if (R.t3Opened) await keep();
  // T4: a close request while the badge shows: the dialog opens at once and the close waits for the answer
  await pg.click('#t-in'); await typeFor(400); await userEdit(() => { acFhaData[1].fcDesc = acFhaData[1].fcDesc + ' z'; }); await typeFor(900);
  R.t4Badge = !!(await badge());
  await pg.evaluate(() => { window.__closeRes = 'pending'; window.__slabRequestClose().then(v => { window.__closeRes = v; }); }); await sleep(400);
  R.t4Opened = await ackOpen(); R.t4Waits = await pg.evaluate(() => window.__closeRes === 'pending');
  if (R.t4Opened) { await keep(); await sleep(600); } R.t4Res = await pg.evaluate(() => window.__closeRes);
  await pg.evaluate(() => { window.__slabAllowUnloadReset && window.__slabAllowUnloadReset(); });
  // T5: a background change (nobody made it) while typing: no dialog, no badge
  await pg.click('#t-in'); await typeFor(400);
  await pg.evaluate(() => { SLChangeAck.system ? null : null; projectConfig.__bgTick = (projectConfig.__bgTick || 0) + 1; scheduleAutosave(); });
  await typeFor(1200); R.t5NoDialog = !(await ackOpen()); R.t5NoBadge = !(await badge()); await sleep(2000); R.t5StillNoDialog = !(await ackOpen());
  R.errs = errs.slice(0, 3);
  await ctx.close(); srv.close(); return R;
}
let SHOTS_OUT = process.env.SL_BADGE_SHOT || '';
(async () => {
  let browser; try { browser = await pw.chromium.launch(); } catch (e) { console.log('  note  Chromium could not start: the browser suite did not run'); process.exit(0); }
  try {
    const R = await scenarios(browser, SITE, false);
    check('T1 typing when a change arrives: no dialog while typing (2.2 s of keystrokes after the change)', R.t1NoDialog, JSON.stringify(R));
    check('T1 the badge shows "1 change to acknowledge", role status, aria-live polite, a focusable button, bottom right above the activity strip', R.t1Badge && R.t1Badge.text === '1 change to acknowledge' && R.t1Badge.role === 'status' && R.t1Badge.live === 'polite' && R.t1Badge.tag === 'BUTTON' && R.t1Badge.tab === 0 && R.t1Badge.bottom >= 30 && R.t1Badge.right >= 0 && R.t1Badge.right < 40, JSON.stringify(R.t1Badge));
    check('T1 the change stays pending and unsaved: the indicator says Waiting for acknowledgement and the close guard reports it', /Waiting for acknowledgement/.test(R.t1Ind) && R.t1CanClose === false, R.t1Ind + ' / ' + R.t1CanClose);
    check('T1 the dialog opens once typing pauses for 1.5 s (opened ' + R.t1OpenAfterPause + ' ms after the last keystroke) and the badge goes', R.t1OpenAfterPause >= 1000 && R.t1OpenAfterPause <= 2600 && R.t1BadgeGone, String(R.t1OpenAfterPause));
    check('T2 a click on the badge opens the dialog at once', R.t2Badge && R.t2NoDialog && R.t2Opened, JSON.stringify(R));
    check('T3 leaving the field opens the dialog', R.t3Badge && R.t3Opened, JSON.stringify(R));
    check('T4 a close request while the badge shows opens the dialog at once and the close waits for the answer (then proceeds)', R.t4Badge && R.t4Opened && R.t4Waits && R.t4Res === true, JSON.stringify([R.t4Badge, R.t4Opened, R.t4Waits, R.t4Res]));
    check('T5 a background change while typing opens nothing and shows no badge', R.t5NoDialog && R.t5NoBadge && R.t5StillNoDialog, JSON.stringify(R));
    check('no page errors', R.errs.length === 0, R.errs.join(' | '));
    // mutations on altered copies of the site
    const os = require('os'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slmut-'));
    const mut = async (name, from, to, red) => { const dir = path.join(tmp, name.replace(/\W+/g, '_')); fs.cpSync(SITE, dir, { recursive: true }); const f = path.join(dir, 'change_ack.js'), t = fs.readFileSync(f, 'utf8'); if (t.indexOf(from) < 0) { check('anchor present: ' + name, false); return; }
      fs.writeFileSync(f, t.replace(from, to)); let R2; try { R2 = await scenarios(browser, dir, true); } catch (e) { R2 = null; } check('mutation goes red: ' + name, !R2 || red(R2)); fs.rmSync(dir, { recursive: true, force: true }); };
    await mut('typing gate removed (the dialog pops while typing)', "if (!forced && _typingNow()) {", "if (false) {", R2 => !R2.t1NoDialog);
    await mut('badge never shown', "        if (b.textContent !== t) b.textContent = t;", "        return; if (b.textContent !== t) b.textContent = t;", R2 => !R2.t1Badge || !R2.t2Opened);
    await mut('pause too long (typing counted for 8 s)', "var TYPING_PAUSE_MS = 1500,", "var TYPING_PAUSE_MS = 8000,", R2 => !(R2.t1OpenAfterPause >= 1000 && R2.t1OpenAfterPause <= 2600));
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) { check('the browser suite ran to the end', false, String(e && e.message || e).slice(0, 1500)); }
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();

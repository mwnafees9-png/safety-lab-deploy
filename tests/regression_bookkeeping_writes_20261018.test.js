/*
 * regression_bookkeeping_writes_20261018.test.js
 *
 * 18 Oct 2026. The app's own bookkeeping writes are never a change the person made.
 *
 * Found by the desktop close check (regression_change_ack_ui B14), which had been failing unseen
 * because Playwright was missing on the Mac: right after Confirm all, __slabCanClose() said "no" for
 * about half a second, and closing the window in that moment asked again about nothing. Two writers
 * landed just after the click and, being unmarked, were read as the person's edit (any write within the
 * input window after a click counts as the person's):
 *   1. journal.js: the hash-chained journal saves its entry a beat after the act it records (the
 *      hashing is async), outside change_ack's own-write marker.
 *   2. idp_seed_trees.js: the seed sweep (a timer) saves the seeded MF&MS trees it rebuilt. change_ack.js
 *      wraps the public SL_IDP.tick as system, but the sweep's own timer calls its internal tick, which
 *      that wrapper never covered.
 * Both now save inside SLChangeAck.system(), which change_ack already treats as the app's own work
 * (it names "the seed sweep" as a system change).
 *
 * [A] wiring (pure, always runs): both saves go through SLChangeAck.system, with a plain fallback.
 * [B] in the real app (Playwright + Chromium; skipped with a note where missing): right after a click,
 *     a journal entry and a seed sweep each leave nothing open, nothing waiting, and count as system.
 *
 * Run: node tests/regression_bookkeeping_writes_20261018.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

console.log('\n[A] wiring');
const J = read('journal.js'), I = read('idp_seed_trees.js'), H = read('index.html');
check('journal.js saves its entries inside SLChangeAck.system', /if \(wrote\) \{[\s\S]{0,400}A\.system\(sa\)/.test(J));
check('journal.js falls back to a plain save where change_ack is absent', /if \(A && typeof A\.system === 'function'\) A\.system\(sa\); else sa\(\);/.test(J));
check('journal.js no longer calls scheduleAutosave bare after a write', !/if \(wrote\) \{ try \{ if \(typeof scheduleAutosave === 'function'\) scheduleAutosave\(\); \} catch \(_\) \{\} \}/.test(J));
check('idp_seed_trees.js saves the sweep inside SLChangeAck.system', /if \(seeded \|\| regenerated \|\| removed\) \{[\s\S]{0,1200}A\.system\(sa\)/.test(I));
// pins as floors (rule 12): idp_seed_trees.js moved to 1.4 on 26 Oct 2026 (one seed per failure condition)
check('index.html loads journal.js v1.2 and idp_seed_trees.js v1.3 or later', /journal\.js\?v=1\.2"/.test(H) && /idp_seed_trees\.js\?v=1\.([3-9]|\d\d)"/.test(H));

let pw = null;
for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
if (!pw) { console.log('  note  Playwright is not installed on this machine: [B] did not run'); done(); }

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
  console.log('\n[B] in the real app');
  const srv = await serve();
  let browser;
  try { browser = await pw.chromium.launch(); }
  catch (e) { console.log('  note  Chromium could not start here: [B] did not run'); srv.close(); done(); }
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(String(e)));
    pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/'); await sleep(3500);
    await pg.evaluate(() => {
      try { if (window.SLCmaLive) window.SLCmaLive.onModelChange = function () {}; } catch (_) {}
      const g = document.getElementById('sl-auth-gate'); if (g) g.remove();
      document.documentElement.classList.remove('sl-auth-gate-blocked');
      document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
    });
    await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(2600);
    const quiet = () => pg.evaluate(() => { const s = SLChangeAck.status(); return !s.open && !SLChangeAck.pendingUser() && window.__slabCanClose(); });
    for (let i = 0; i < 40 && !(await quiet()); i++) await sleep(100);
    check('the sample project loads with nothing open and nothing waiting', await quiet());

    // 1. the journal, right after a click
    const j = await pg.evaluate(async () => {
      const sys0 = SLChangeAck.status().stats.system, n0 = (projectConfig._journal && projectConfig._journal.entries || []).length;
      SLChangeAck._markInput();                                   // a click a moment ago
      jrnl('test', 'bookkeeping write right after a click');
      await window._jrnlFlush();                                  // the async pump writes and saves now
      const s = SLChangeAck.status();
      return { open: s.open, user: s.user, pend: SLChangeAck.pendingUser(), can: window.__slabCanClose(), sys: s.stats.system - sys0, n: (projectConfig._journal && projectConfig._journal.entries || []).length - n0 };
    });
    check('a journal entry right after a click is written', j.n >= 1 || j.sys >= 1, JSON.stringify(j));
    check('...and its save is the app\'s own: nothing opens, nothing waits, the window can close', !j.open && !j.pend && j.can === true, JSON.stringify(j));
    check('...it is counted as a system change', j.sys >= 1, JSON.stringify(j));
    await sleep(800);

    // 2. the seed sweep, right after a click. Right after a load the sample has no seeded trees yet (the
    //    first sweep makes them, on its timer): that is the case B14 hit. If a sweep already ran, one seeded
    //    tree is taken away as the app would (not the person), so this sweep has one to put back.
    // 27 Oct 2026: taken away and swept in ONE step (synchronous): the sweep's own 8 s timer used to put the seed back
    // in between ("kept 12, seeded 0"). Nothing else changes, so the wait for quiet that came between is not needed.
    for (let i = 0; i < 40 && !(await quiet()); i++) await sleep(100);
    // the seeds' verification copies (verify_sync.js) must exist before this sweep: they are what the sweep used to
    // take for real MF&MS pages, removing every seed (27 Oct 2026). Wait for the first sweep and its copies.
    const mirrored = () => pg.evaluate(() => { const s = ftaPages.filter(p => p && String(p.id).indexOf('idp-pg-') === 0); return s.length > 0 && s.every(x => ftaPages.some(p => p && p.verifies === x.id)); });
    for (let i = 0; i < 200 && !(await mirrored()); i++) await sleep(100);
    check('the seeds and their verification copies exist before the sweep', await mirrored());
    for (let i = 0; i < 40 && !(await quiet()); i++) await sleep(100);
    const r = await pg.evaluate(() => {
      const i0 = ftaPages.findIndex(p => p && String(p.id).indexOf('idp-pg-') === 0);
      if (i0 >= 0) SLChangeAck.system(() => { ftaPages.splice(i0, 1); scheduleAutosave(); });
      const sys0 = SLChangeAck.status().stats.system;
      SLChangeAck._markInput();                                   // a click a moment ago
      // run(), not SL_IDP.tick: change_ack wraps the public tick as system, but the sweep's own 8 s timer
      // calls its internal tick directly (that is the path B14 hit), so the public wrapper never covered it
      const res = window.SL_IDP.run();
      const s = SLChangeAck.status();
      return { res, open: s.open, user: s.user, pend: SLChangeAck.pendingUser(), can: window.__slabCanClose(), sys: s.stats.system - sys0 };
    });
    check('the sweep right after a click seeds the multi-system trees', r.res && r.res.seeded >= 1, JSON.stringify(r));
    check('...and removes none of its own seeds (their verification copies are not MF&MS pages)', r.res && r.res.removed === 0, JSON.stringify(r));
    check('...and its save is the app\'s own: nothing opens, nothing waits, the window can close', !r.open && !r.pend && r.can === true, JSON.stringify(r));
    check('...it is counted as a system change', r.sys >= 1, JSON.stringify(r));
    check('no uncaught page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  } catch (e) {
    check('the browser part ran to the end', false, String(e && e.stack || e).split('\n').slice(0, 8).join(' '));
  }
  await browser.close(); srv.close();
  done();
})();

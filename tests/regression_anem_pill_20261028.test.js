#!/usr/bin/env node
/*
 * Regression: the ANEM pill next to Feedback (28 Oct 2026). Waqas: "I want anem live chat to be able to be
 * accessed right next to the feedback button in a pill form".
 * Pinned: [A] one row holds the ANEM pill then the Feedback pill; ANEM opens the live chat (slOpenAnem); print and the
 * full-screen fault tree hide both; narrow screens make both icon circles. [B] in the real app the two sit side by
 * side, 10 px apart, same height, never overlapping, and a click opens the ANEM panel.
 * Run: node tests/regression_anem_pill_20261028.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 300) + ')' : '')); } };
const done = () => { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); };
const SITE = path.join(__dirname, '..', 'site');
const H = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), C = fs.readFileSync(path.join(SITE, 'safety_lab.css'), 'utf8');
console.log('\n[A] the markup and the styles');
const row = (H.match(/<div id="sl-fab-row"[\s\S]*?<\/div>/) || [''])[0];
check('one row: the ANEM pill, then the Feedback pill', row.indexOf('id="anem-fab"') > 0 && row.indexOf('id="feedback-fab"') > row.indexOf('id="anem-fab"'));
check('the ANEM pill opens the live chat', /id="anem-fab"[^>]*onclick="slOpenAnem\(\)"/.test(row));
check('print and the full-screen fault tree hide it', /@media print \{\s*\.feedback-fab, \.anem-fab \{ display: none !important; \}/.test(C) && /body\.fta-fullscreen \.anem-fab \{ display: none !important; \}/.test(C));
check('narrow screens: an icon circle', /@media \(max-width: 720px\) \{[\s\S]*?\.anem-fab-label \{ display: none; \}/.test(C));
let pw; try { pw = require('playwright'); } catch (_) { console.log('  note  Playwright is not installed here: [B] did not run'); done(); }
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
srv.listen(0, '127.0.0.1', async () => {
  console.log('\n[B] in the real app');
  let browser; try { browser = await pw.chromium.launch(); } catch (_) { console.log('  note  Chromium could not start here: [B] did not run'); srv.close(); done(); }
  try {
    const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/?ai=1'); await new Promise(r => setTimeout(r, 3500));
    await pg.evaluate(() => { const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); });
    const r = await pg.evaluate(() => { const a = document.getElementById('anem-fab').getBoundingClientRect(), f = document.getElementById('feedback-fab').getBoundingClientRect(); return { gap: Math.round(f.left - a.right), sameRow: Math.abs(a.top - f.top) < 1 && Math.abs(a.height - f.height) < 1, right: Math.round(innerWidth - f.right), bottom: Math.round(innerHeight - f.bottom) }; });
    check('side by side, 10 px apart, same row, Feedback where it always was', r.gap === 10 && r.sameRow && r.right === 24 && r.bottom === 24, JSON.stringify(r));
    await pg.click('#anem-fab'); await new Promise(r => setTimeout(r, 1500));
    check('a click opens the ANEM panel', await pg.evaluate(() => !!document.getElementById('anem-panel')));
    check('no page errors', !errs.length, errs.slice(0, 2).join(' | '));
  } catch (e) { check('the browser run completed', false, e && e.message); }
  finally { try { await browser.close(); } catch (_) {} srv.close(); done(); }
});

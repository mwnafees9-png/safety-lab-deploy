#!/usr/bin/env node
/*
 * Regression (browser): the bow-tie and event tree toolbars, lined up and one size. 25 Oct 2026.
 *
 * WAQAS: "these need to be aligned and sized equally"; "keep +new button in blue".
 * Checked on both pages, measured in the real page:
 *   - the picker and every button share one height and one line (same top, same bottom)
 *   - the picker is the same width on both pages, and starts at the same place (the labels are one width)
 *   - "+ New" is the one blue button on each page; every other button is plain
 * MUTATION PROOF: SL_DT_MUTATE=size (the shared height rule removed) must turn the checks red.
 * Run: node tests/regression_diag_toolbar_20261025.test.js   (Playwright + Chromium)
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 700) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_DT_MUTATE || '';
const mutate = (file, body) => (MUT === 'size' && file === 'safety_lab.css') ? body.replace('box-sizing: border-box; height: 34px; margin: 0; font-size: 13px;', 'box-sizing: border-box; margin: 0;') : body;

(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed on this machine: the browser checks did not run'); process.exit(0); }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && /\.(js|css)$/.test(f)) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });   // a full-width screen, as in Waqas's screenshots (narrower, the bar wraps onto a second line by design)
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof loadSampleProject === 'function' && window.SLNavAreas && window.SLTreeHomes, null, { timeout: 60000 });
        await page.evaluate(async () => { const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); window.SL_VERIFY_SYNC_OFF = true; await loadSampleProject(); });
        await page.waitForTimeout(2500);
        const measure = async (tab, host) => {
            await page.evaluate(t => { document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; }); switchTab(t); }, tab);
            await page.waitForTimeout(1500);
            return page.evaluate(h => {
                const bar = document.querySelector(h + ' .sl-diag-bar'); if (!bar) return null;
                bar.scrollIntoView();
                const r = e => { const x = e.getBoundingClientRect(); return { t: Math.round(x.top), b: Math.round(x.bottom), h: Math.round(x.height), l: Math.round(x.left), w: Math.round(x.width) }; };
                const sel = bar.querySelector('select'), btns = [...bar.querySelectorAll(':scope > button')];
                return { sel: r(sel), btns: btns.map(b => Object.assign(r(b), { text: b.textContent.trim().slice(0, 24), blue: getComputedStyle(b).backgroundColor, primary: b.classList.contains('sl-db-primary') })) };
            }, host);
        };
        const bt = await measure('bowtie', '#view-bowtie');
        const et = await measure('eta', '#eta-host');
        for (const [name, m] of [['bow-tie', bt], ['event tree', et]]) {
            const all = m ? [m.sel].concat(m.btns) : [];
            check(name + ': the picker and every button are one height, on one line', m && all.length >= 2 && all.every(x => x.h === all[0].h && x.t === all[0].t && x.b === all[0].b) && all[0].h >= 30, JSON.stringify(m));
            const prim = m ? m.btns.filter(b => b.primary) : [];
            check(name + ': "+ New" is the one blue button; the rest are plain', prim.length === 1 && /^\+ New/.test(prim[0].text) && m.btns.filter(b => !b.primary).every(b => b.blue !== prim[0].blue), JSON.stringify(m && m.btns));
        }
        check('the two pages\' pickers are the same width and start at the same place', bt && et && bt.sel.w === et.sel.w && bt.sel.l === et.sel.l && bt.sel.h === et.sel.h, JSON.stringify([bt && bt.sel, et && et.sel]));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });

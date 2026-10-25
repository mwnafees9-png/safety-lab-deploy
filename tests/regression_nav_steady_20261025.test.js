#!/usr/bin/env node
/*
 * Regression (browser): the left menu and the bar above the page stay still. 25 Oct 2026.
 *
 * WAQAS: "when you click on left nav menu it flickers"; "CCA in system folders take longer to appear";
 * "AFHA and SFHA symbols should match".
 * Measured in the real page, at the aircraft and at a system, clicking every section:
 *   [S1] a system's Common cause, R&M and Human factors sections show at every moment after every click
 *        (they were flipped off and on by each refresh, and an odd count left them hidden for about 1.5 s)
 *   [S2] no section button that was showing blinks out while a click is handled
 *   [S3] during a click nothing in the bar above the page is taken out and put back (it was emptied and filled
 *        8 to 28 times), and the bar changes at most twice
 *   [S4] a refresh that has nothing new changes nothing on screen (the Working on picker was rebuilt every time)
 *   [S5] after every click the bar holds the open section's links and nothing else, and no link is lost
 *   [S6] the SFHA and the AFHA carry the same sign
 * MUTATION PROOFS: SL_NS_MUTATE=lane (the on/off test may be undefined again) must turn S1 red;
 *   =redraw (the bar emptied and filled on every refresh) must turn S3 and S4 red; =picker (the Working on picker
 *   rebuilt on every refresh) must turn S4 red.
 * Run: node tests/regression_nav_steady_20261025.test.js   (Playwright + Chromium)
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_NS_MUTATE || '';
const mutate = (file, body) => {
    if (file !== 'nav_areas.js') return body;
    if (MUT === 'lane') return body.replace('var off = !!(sysScope && (!_sysLaneOn(K.lane) || (K.sub && !_sysLaneOn(K.sub))));', 'var off = sysScope && (!_sysLaneOn(K.lane) || (K.sub && !_sysLaneOn(K.sub)));');
    if (MUT === 'picker') return body.replace('if (pick._slSig !== html)', 'if (true)');
    if (MUT === 'redraw') return body.replace("if (have.length === want.length && have.every(function (x, i) { return x === want[i]; })) return;", "have.forEach(function (x) { if (x.classList.contains('asb-item')) _el('sl-nav-pool').appendChild(x); else row.removeChild(x); }); have = [];");
    return body;
};

(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed on this machine: the browser checks did not run'); process.exit(0); }
    if (MUT) { const src = fs.readFileSync(path.join(SITE, 'nav_areas.js'), 'utf8'); if (mutate('nav_areas.js', src) === src) { console.log('  FAIL  the mutation ' + MUT + ' found nothing to change'); process.exit(1); } }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && /\.js$/.test(f)) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof loadSampleProject === 'function' && window.SLNavAreas && document.getElementById('sl-scope-pick'), null, { timeout: 60000 });
        await page.evaluate(async () => { const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); window.SL_VERIFY_SYNC_OFF = true; await loadSampleProject(); });
        await page.waitForTimeout(2500);
        const R = await page.evaluate(async () => {
            const wait = ms => new Promise(r => setTimeout(r, ms));
            const closeDialogs = () => document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
            closeDialogs();
            const btn = k => document.querySelector('#app-sidebar .asb-area[data-area="' + k + '"]');
            const showing = b => !!b && b.offsetParent !== null;
            const allLinks = () => document.querySelectorAll('#sl-nav-pool .asb-item, #sl-areabar .asb-item').length;
            const linkTotal = allLinks();
            const out = { clicks: [], linkTotal };
            const pick = document.getElementById('sl-scope-pick');
            const sysId = [...pick.options].map(o => o.value).find(v => v !== 'aircraft' && v !== '+new');
            out.sysId = sysId;
            for (const scope of ['aircraft', sysId]) {
                pick.value = scope; pick.dispatchEvent(new Event('change', { bubbles: true })); await wait(1500); closeDialogs(); await wait(300);
                const sysScope = scope !== 'aircraft';
                const keys = SLNavAreas.AREAS.filter(a => a.scope === (sysScope ? 'system' : 'aircraft')).map(a => a.key).filter(k => showing(btn(k)));
                for (const k of keys) {
                    const before = keys.filter(x => showing(btn(x)));
                    const blinks = {}, sysGone = {};
                    let batches = 0;
                    const bar = document.getElementById('sl-areabar');
                    const removed = new Set();
                    const mo = new MutationObserver(l => { batches++; l.forEach(m => { if (m.type === 'childList' && (m.target.id === 'sl-ab-row1' || m.target.id === 'sl-ab-row2')) m.removedNodes.forEach(n => removed.add(n)); }); });
                    mo.observe(bar, { childList: true, subtree: true, attributes: true, characterData: true });
                    const sample = () => {
                        before.forEach(x => { if (!showing(btn(x))) blinks[x] = (blinks[x] || 0) + 1; });
                        if (sysScope) ['sys-cca', 'sys-ram', 'sys-hf'].forEach(x => { if (!showing(btn(x))) sysGone[x] = (sysGone[x] || 0) + 1; });
                    };
                    const iv = setInterval(sample, 15);
                    btn(k).click(); sample();
                    await wait(1500); clearInterval(iv); mo.takeRecords(); mo.disconnect(); closeDialogs();
                    // taken out of the bar and put back during the click: what the eye sees as a blink
                    const rows = [...document.querySelectorAll('#sl-ab-row1 > *, #sl-ab-row2 > *')];
                    const churn = rows.filter(n => removed.has(n)).map(n => n.id || n.getAttribute('data-group') || n.textContent);
                    // what the bar holds: the open section's links only, none lost
                    const A = SLNavAreas.AREAS.find(a => a.key === SLNavAreas.areaOf(window._slCurrentTab)) || null;
                    const ids = A ? A.items.reduce((o, it) => o.concat(typeof it === 'string' ? [it] : it.ids), []) : [];
                    const inBar = [...bar.querySelectorAll('.asb-item')].map(x => x.id);
                    const strays = inBar.filter(id => ids.indexOf(id) < 0);
                    const missing = A ? A.items.filter(it => typeof it === 'string' && document.getElementById(it)).filter(id => inBar.indexOf(id) < 0) : [];
                    out.clicks.push({ scope, k, open: A && A.key, batches, churn, blinks, sysGone, strays, missing, links: allLinks() });
                }
            }
            // a refresh with nothing new: nothing on screen changes
            let still = 0;
            const mo2 = new MutationObserver(l => { still += l.length; });
            mo2.observe(document.getElementById('app-sidebar'), { childList: true, subtree: true, attributes: true, characterData: true });
            mo2.observe(document.getElementById('sl-areabar'), { childList: true, subtree: true, attributes: true, characterData: true });
            for (let i = 0; i < 10; i++) SLNavAreas.sync();
            await wait(50); out.still = still + mo2.takeRecords().length; mo2.disconnect();
            const ic = k => (SLNavAreas.AREAS.find(a => a.key === k) || {}).ic;
            out.icons = { afha: ic('afha'), sfha: ic('sys') };
            out.lanesOn = ['cma', 'ram-reliability'].map(l => PROGRAM_PLAN.systemLaneOn(sysId, l));
            return out;
        });
        const sysClicks = R.clicks.filter(c => c.scope !== 'aircraft');
        check('the system picked has its CMA and R&M turned on in its plan (so its sections must show)', R.lanesOn.every(Boolean), JSON.stringify(R.lanesOn));
        check('[S1] a system\'s Common cause, R&M and Human factors sections show at every moment after every click', sysClicks.length >= 5 && sysClicks.every(c => !Object.keys(c.sysGone).length), JSON.stringify(sysClicks.map(c => [c.k, c.sysGone])));
        check('[S2] no section button that was showing blinks out while a click is handled (aircraft and system)', R.clicks.length >= 12 && R.clicks.every(c => !Object.keys(c.blinks).length), JSON.stringify(R.clicks.filter(c => Object.keys(c.blinks).length).map(c => [c.scope, c.k, c.blinks])));
        check('[S3] during a click nothing in the bar above the page is taken out and put back, and the bar changes at most twice', R.clicks.every(c => c.batches <= 2 && !c.churn.length), JSON.stringify(R.clicks.map(c => [c.k, c.batches, c.churn.length])));
        check('[S4] ten refreshes with nothing new change nothing on screen', R.still === 0, R.still);
        check('[S5] after every click the bar holds the open section\'s links and nothing else, and no link is lost', R.clicks.every(c => c.open && !c.strays.length && !c.missing.length && c.links === R.linkTotal), JSON.stringify(R.clicks.filter(c => !c.open || c.strays.length || c.missing.length || c.links !== R.linkTotal).map(c => [c.scope, c.k, c.open, c.strays, c.missing, c.links, R.linkTotal])));
        check('[S6] the SFHA and the AFHA carry the same sign', R.icons.afha && R.icons.afha === R.icons.sfha, JSON.stringify(R.icons));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });

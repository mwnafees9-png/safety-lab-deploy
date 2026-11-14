#!/usr/bin/env node
/*
 * Regression: lists fold, rows of tabs and filter chips are drop-downs (site/fold.js, SLFold and SLMenus), 14 Nov 2026.
 *
 * Waqas: "Instead of showing long lists, we should have drop down menus in both tools in all places"; of a wall of
 * chips and a row of tabs: "anything that shows like this in both apps should be a drop down list". His answers: every
 * list folds shut behind its title and count, however short, and pages inside; a row of tabs or chips inside a page is
 * one drop-down; the tool's own navigation (left menu, area bar) stays; a row of two or three is a switch, "more
 * prominent".
 *
 *   A  SLFold.list: folded by default, title with its count, 50 rows a page with Previous and Next, "1 to 50 of N"
 *      with thousands separators, never "and N more"; a page turn keeps the list; table rows page in a row of their own
 *   B  what is open stays open when the list is drawn again; open: true opens it the first time only
 *   C  SLFold.pick: a drop-down to choose one, its count, the choice selected, the handler called
 *   D  wiring: fold.js right after paginate.js; no em dash; no eval
 *   E  in the browser (Playwright, where installed): the ZSA tabs are one drop-down with its label, the row hidden, the
 *      CAD link still on screen; picking a page opens it; a row of three or fewer is a framed switch; the area bar is
 *      left alone; no page errors
 *
 * Run: node tests/regression_fold_menus_20261114.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '  -- ' + String(d).slice(0, 300) : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const SRC = read('fold.js'), IDX = read('index.html');
const EM = String.fromCharCode(0x2014);

function load() { const G = {}; vm.runInNewContext(SRC, { globalThis: G, Math, Number, String, Array, Object, JSON, setTimeout: () => 0 }); return G; }

// ---- A
{
    const G = load(), F = G.SLFold;
    const items = Array.from({ length: 1284 }, (_, i) => 'Part ' + (i + 1));
    const h = F.list({ key: 'parts', title: 'Parts in the zone', items, row: x => '<div>' + x + '</div>' });
    check('A1 folded shut by default, the title with its count', /^<details class="sl-fold" data-fold="parts"><summary>Parts in the zone \(1,284\)<\/summary>/.test(h), h.slice(0, 120));
    check('A2 the first page only: 50 rows', (h.match(/<div>Part /g) || []).length === 50 && h.includes('<div>Part 50</div>') && !h.includes('<div>Part 51</div>'));
    check('A3 the page bar says where you are, with thousands separators, never "and N more"', h.includes('1 to 50 of 1,284') && !/and \d+ more/.test(h) && /data-fold-page="parts" data-dir="-1" disabled/.test(h));
    F.turn('parts', 1); const h2 = F._pageHtml('parts');
    check('A4 Next shows the next 50', h2.includes('<div>Part 51</div>') && h2.includes('51 to 100 of 1,284') && !h2.includes('<div>Part 50</div>'));
    const t = F.list({ key: 'rows', title: 'Rows', items: items.slice(0, 120), row: x => '<tr><td>' + x + '</td></tr>', cols: 3 });
    check('A5 table rows: the page bar is a row of its own across every column', /<tbody data-fold-list="rows">/.test(t) && /<tr data-fold-nav><td colspan="3">/.test(t));
    check('A6 a list of one still folds, with no page bar', /<summary>Short \(1\)<\/summary>/.test(F.list({ key: 's', title: 'Short', items: ['x'], row: x => '<div>' + x + '</div>' })) && !F.list({ key: 's', title: 'Short', items: ['x'], row: x => x }).includes('sl-fold-nav'));
    check('A7 an empty list draws its own words, or nothing', F.list({ key: 'e', title: 'E', items: [], row: x => x, empty: 'None yet.' }).includes('None yet.') && F.list({ key: 'e2', title: 'E', items: [], row: x => x }) === '');
    check('A8 the title is escaped', F.section({ key: 'k', title: '<b>x</b>', body: '' }).includes('&lt;b&gt;x&lt;/b&gt;'));
}
// ---- B
{
    const G = load(), F = G.SLFold;
    F.setOpen('k1', true);
    check('B1 a list opened stays open when drawn again', /<details class="sl-fold" data-fold="k1" open>/.test(F.section({ key: 'k1', title: 'T', body: '' })));
    check('B2 open: true opens it the first time', / open>/.test(F.section({ key: 'k2', title: 'T', body: '', open: true })));
    F.setOpen('k2', false);
    check('B3 and afterwards the person\'s own choice is kept', !/ open>/.test(F.section({ key: 'k2', title: 'T', body: '', open: true })));
}
// ---- C
{
    const G = load(), F = G.SLFold;
    const h = F.pick({ key: 'z', label: 'Zone', items: [{ value: 'a', label: '110 Avionics' }, { value: 'b', label: '120 Hydraulics' }], value: 'b', placeholder: 'Pick one', onPick: () => {} });
    check('C1 a drop-down with its label and count, the choice selected', h.includes('<span>Zone (2)</span>') && /<option value="b" selected>120 Hydraulics<\/option>/.test(h) && h.includes('<option value="">Pick one</option>'));
}
// ---- D
{
    const iP = IDX.indexOf('<script src="paginate.js?v='), iF = IDX.indexOf('<script src="fold.js?v=1.0" defer></script>');
    check('D1 fold.js 1.0 loads once, right after paginate.js', iF > iP && IDX.slice(iP, iF).split('<script').length === 2 && (IDX.match(/fold\.js\?v=/g) || []).length === 1);
    check('D2 no em dash, no eval', !SRC.includes(EM) && !/\beval\(|new Function\(/.test(SRC));
    check('D3 the rows made drop-downs, and the navigation left alone', /\.prove-tabbar/.test(SRC) && /#sl-areabar/.test(SRC) && /items\.length <= 3/.test(SRC));
}
// ---- E
(async () => {
    let pw = null; try { pw = require('playwright'); } catch (_) {}
    if (!pw) { console.log('  SKIP  [E] Playwright is not installed here; it needs the real app'); }
    else {
        const http = require('http');
        const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
        const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(404); return r.end(); }
            let b; try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
            r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
        await new Promise(r => srv.listen(0, '127.0.0.1', r));
        const b = await pw.chromium.launch(), errs = [];
        const tick = ms => new Promise(r => setTimeout(r, ms));
        try {
            const pg = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
            pg.on('pageerror', e => errs.push(String(e).slice(0, 200))); pg.on('dialog', d => d.dismiss().catch(() => {}));
            await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
            await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
            await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
            const E1 = await pg.evaluate(async () => {
                switchTab('zsa'); await new Promise(r => setTimeout(r, 900));
                const bar = document.querySelector('#view-zsa > .prove-tabbar'), box = bar && bar.nextElementSibling;
                const sel = box && box.querySelector('select.sl-pm-sel');
                return { hidden: !!bar && getComputedStyle(bar).display === 'none', menu: !!sel, label: box && box.querySelector('.sl-pm-l') ? box.querySelector('.sl-pm-l').textContent : '',
                    opts: sel ? [...sel.options].map(o => o.text) : [], chosen: sel ? sel.options[sel.selectedIndex].text : '', cad: !!(box && box.querySelector('[data-cad-link]') && box.querySelector('[data-cad-link]').offsetParent),
                    tabs: bar ? bar.querySelectorAll('[data-prove-tab]').length : 0 };
            });
            check('E1 the ZSA tabs are one drop-down, labeled; the row is hidden', E1.hidden && E1.menu && E1.label === 'ZSA' && E1.opts.length === E1.tabs && E1.tabs > 3, JSON.stringify(E1));
            check('E2 the menu shows the page you are on, and the CAD link stays on screen', /Zonal Safety/.test(E1.chosen) && E1.cad, JSON.stringify(E1));
            const E3 = await pg.evaluate(async () => {
                const sel = document.querySelector('#view-zsa > .prove-tabbar + .sl-pm select');
                const i = [...sel.options].findIndex(o => /Zonal Model/.test(o.text)); sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise(r => setTimeout(r, 1200));
                const v = document.getElementById('view-zonal'); const s2 = v && v.querySelector('.prove-tabbar + .sl-pm select');
                return { opened: !!v && v.style.display !== 'none', chosen: s2 ? s2.options[s2.selectedIndex].text : '' };
            });
            check('E3 picking a page opens it, and its menu shows that page', E3.opened && /Zonal Model/.test(E3.chosen), JSON.stringify(E3));
            const E4 = await pg.evaluate(() => { const nav = document.querySelector('#sl-areabar, .sl-areabar'); return { navMenus: nav ? nav.querySelectorAll('.sl-pm').length : 0, navHidden: nav ? nav.classList.contains('sl-pm-src') : false }; });
            check('E4 the area bar is the tool\'s navigation: left as it is', E4.navMenus === 0 && !E4.navHidden, JSON.stringify(E4));
            const E5 = await pg.evaluate(() => { const r = document.createElement('div'); r.className = 'ar-filter-bar'; r.innerHTML = '<span class="ar-filter-label">Show</span><span class="ar-filter-chip active" role="button">All</span><span class="ar-filter-chip" role="button">Issues</span>'; document.body.appendChild(r); return new Promise(res => setTimeout(() => { const c = getComputedStyle(r); res({ sw: r.classList.contains('sl-pm-switch'), border: c.borderTopWidth, shown: c.display !== 'none' }); r.remove(); }, 200)); });
            check('E5 a row of two or three is a framed switch, still shown', E5.sw && E5.border !== '0px' && E5.shown, JSON.stringify(E5));
            check('E6 no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
        } finally { await b.close(); srv.close(); }
    }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });

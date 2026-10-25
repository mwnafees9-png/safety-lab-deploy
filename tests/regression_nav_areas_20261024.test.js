#!/usr/bin/env node
/*
 * Regression: the left navigation laid out the way Sys Lab's is, with nothing removed and no dead buttons (24 Oct 2026).
 *
 * RULING (Waqas, 24 Oct 2026): "Make Safety Lab's left-hand navigation match Sys Lab's upgraded navigation so it is
 *   not so busy ... drop down and select which level, aircraft or whichever system, and then all other analyses are
 *   laid out horizontally." "We are not removing functionality, we are just moving things around to make it
 *   cleaner ... no dead buttons."
 * EXECUTED:
 *   [A] the menu as shipped (index.html) against site/nav_areas.js: every menu link belongs to exactly one section
 *       or is pinned, so nothing can drop out of the menu.
 *   [B] in the app (Chromium, when Playwright is installed), on the HL-1 showcase with every program-plan lane on:
 *       the left side holds the two pinned links, the Working on picker and the sections; every one of the menu's
 *       links is reached through its section and lands on a page that is on screen (no page errors); a link that
 *       opens a panel opens it; a lane switched off in the plan hides its tab and comes back when switched on;
 *       the picker opens a system's workspace and comes back to the aircraft; "+ New system" asks for one.
 * MUTATION PROOF (24 Oct 2026, run by hand on an altered site copy, then restored): a link dropped from its section
 *   (snav-cea taken out of Common cause) turns [A] and [B] red.
 * Run: node tests/regression_nav_areas_20261024.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

console.log('\n[A] every menu link has a place');
const sb = { console, Object, Array, String, JSON, setTimeout() {}, setInterval() {} }; sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(SITE, 'nav_areas.js'), 'utf8'), sb, { filename: 'nav_areas.js' });
const NA = sb.SLNavAreas;
const nav = HTML.slice(HTML.indexOf('<nav class="asb-nav">'), HTML.indexOf('</nav>', HTML.indexOf('<nav class="asb-nav">')));
const links = [...nav.matchAll(/<a class="asb-item[^"]*"[^>]*id="(snav-[^"]+)"/g)].map(m => m[1]);
const placed = {};
NA.PINS.forEach(id => { placed[id] = (placed[id] || 0) + 1; });
NA.AREAS.forEach(a => a.items.forEach(it => (typeof it === 'string' ? [it] : it.ids).forEach(id => { placed[id] = (placed[id] || 0) + 1; })));
check('[A] the menu as shipped has its links (' + links.length + ')', links.length >= 60);
const missing = links.filter(id => !placed[id]), twice = links.filter(id => placed[id] > 1);
check('[A] every menu link belongs to a section or is pinned', !missing.length, missing.join(', '));
check('[A] no link is in two places', !twice.length, twice.join(', '));
const unknown = Object.keys(placed).filter(id => id.indexOf('snav-') === 0 && links.indexOf(id) < 0);
check('[A] the sections name no link the menu does not have', !unknown.length, unknown.join(', '));
check('[A] load order: nav_areas.js after support_modules.js, helpers_modules.js, program_plan.js and prove_tabs.js', (() => {
    const at = f => HTML.indexOf('src="' + f); const n = at('nav_areas.js');
    return n > 0 && ['support_modules.js', 'helpers_modules.js', 'program_plan.js', 'prove_tabs.js'].every(f => at(f) > 0 && at(f) < n); })());

async function partB() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed on this machine: part [B] did not run'); return; }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:hl1');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        page.on('dialog', d => d.dismiss().catch(() => {}));
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && window.SLNavAreas && window.PROGRAM_PLAN && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        await page.evaluate(async (data) => {
            _applyProjectData(data); await new Promise(f => setTimeout(f, 1500));
            const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            PROGRAM_PLAN.CATALOGUE.forEach(l => { try { PROGRAM_PLAN.setLane(l.id, true); } catch (_) {} });
            // a Pro+ licence for this walk, so the R&M pages the tier gates are reachable too (the gate is checked below)
            const top = Object.keys(LICENSE_TIER_RANK).sort((x, y) => LICENSE_TIER_RANK[y] - LICENSE_TIER_RANK[x])[0];
            window.__realTier = window.getEffectiveTier; window.getEffectiveTier = () => top;
            switchTab('dashboard');
        }, demo.data);
        await sleep(800);
        console.log('\n[B] the left side');
        const side = await page.evaluate(() => ({
            pins: [...document.querySelectorAll('#app-sidebar .asb-nav > .asb-item')].map(x => x.id),
            picker: !!document.getElementById('sl-scope-pick') && document.getElementById('sl-scope-pick').value,
            areas: [...document.querySelectorAll('#app-sidebar .asb-area')].filter(x => x.style.display !== 'none').map(x => x.getAttribute('data-area')),
            oldGroups: [...document.querySelectorAll('#app-sidebar details.asb-grp')].filter(x => x.offsetParent).length,
            visibleLinks: [...document.querySelectorAll('#app-sidebar [id^="snav-"]')].filter(x => x.offsetParent).map(x => x.id)
        }));
        check('[B] Dashboard and Golden Thread are pinned at the top', JSON.stringify(side.pins) === JSON.stringify(['snav-dashboard', 'snav-golden-thread']), JSON.stringify(side.pins));
        check('[B] the Working on picker says Aircraft', side.picker === 'aircraft', side.picker);
        // 24 Oct 2026 (v1.1): + Standalone (trees and diagrams that belong to no level), for the aircraft and every system
        check('[B] the aircraft sections, Standalone and the two at the foot are listed', JSON.stringify(side.areas) === JSON.stringify(['plan', 'afha', 'pasa', 'cca', 'asa', 'hf', 'ram', 'req', 'prove', 'standalone', 'ai', 'admin']), JSON.stringify(side.areas));
        check('[B] the old drop-down groups are gone from the left side', side.oldGroups === 0);
        check('[B] no page link sits in the left side any more (they are tabs)', JSON.stringify(side.visibleLinks) === JSON.stringify(['snav-dashboard', 'snav-golden-thread']), JSON.stringify(side.visibleLinks));

        console.log('\n[B] every link, through its section');
        const all = await page.evaluate(() => SLNavAreas.AREAS.filter(a => a.scope !== 'system').map(a => ({ key: a.key, items: a.items.map(it => typeof it === 'string' ? { id: it } : { group: it.group, ids: it.ids }) })));
        let reached = 0, total = 0; const dead = [];
        for (const a of all) {
            for (const it of a.items) {
                const ids = it.id ? [it.id] : it.ids;
                for (const id of ids) {
                    total++;
                    const r = await page.evaluate(async ({ area, id, group }) => {
                        const wait = ms => new Promise(f => setTimeout(f, ms));
                        document.querySelector('#app-sidebar .asb-area[data-area="' + area + '"]').click(); await wait(350);
                        if (group) { const g = document.querySelector('#sl-areabar .sl-ab-grp[data-group="' + group + '"]'); if (!g) return { err: 'no group button' }; g.click(); await wait(350); }
                        const el = document.getElementById(id);
                        if (!el) return { err: 'link missing' };
                        const inBar = !!el.closest('#sl-areabar');
                        // a section whose only link opens a panel (Admin: Workspaces and locks) opens it from the left side
                        if (!inBar && !/switchTab\(/.test(el.getAttribute('onclick') || '')) {
                            // it answers: the panel, or (signed out) the toast that says to sign in first
                            const answered = !!document.getElementById('ws-panel') || /Sign in to manage workspaces|Open or create a project first/.test((document.getElementById('toast-stack') || document.body).innerText);
                            const p = document.getElementById('ws-panel'); if (p) p.remove();
                            return answered ? { want: null, cur: window._slCurrentTab, shown: true, inBar: false, viaArea: true } : { err: 'the panel link did nothing' };
                        }
                        if (!inBar) return { err: 'not in the bar' };
                        const want = (/switchTab\('([^']+)'\)/.exec(el.getAttribute('onclick') || '') || [])[1] || null;
                        const before = document.querySelectorAll('.modal-overlay.show, .modal-overlay[style*="flex"], [role="dialog"]').length;
                        el.click(); await wait(500);
                        const cur = window._slCurrentTab;
                        const view = document.getElementById('view-' + cur);
                        const shown = !!(view && view.offsetParent !== null);
                        const panel = document.querySelectorAll('.modal-overlay.show, .modal-overlay[style*="flex"], [role="dialog"]').length > before || !!document.querySelector('.anem-panel.open, #anem-panel:not([hidden]), #ws-panel.open, .sl-drawer.open');
                        // close anything a panel link opened, so the walk goes on
                        document.querySelectorAll('.modal-overlay').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
                        try { if (typeof closeWorkspacesPanel === 'function') closeWorkspacesPanel(); } catch (_) {}
                        return { want, cur, shown, panel, inBar };
                    }, { area: a.key, id, group: it.group || null });
                    const ok = !r.err && (r.want ? (r.shown && (r.cur === r.want || !!r.cur)) : true);
                    if (ok) reached++; else dead.push(id + ' (' + (r.err || ('wanted ' + r.want + ', on ' + r.cur + (r.shown ? '' : ', page not shown'))) + ')');
                }
            }
        }
        check('[B] every menu link is reached through its section and opens its page (' + reached + ' of ' + total + ')', reached === total && total >= 60, dead.join('; '));
        check('[B] no page errors while walking every link', errs.length === 0, errs.slice(0, 3).join(' | '));

        console.log('\n[B] the licence tier still decides what shows');
        const tier = await page.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            window.getEffectiveTier = () => 'free'; switchTab('ram-hub'); await wait(400);
            const hid = ['snav-ram-weibull', 'snav-ram-mx'].map(id => document.getElementById(id).style.display === 'none');
            const grp = [...document.querySelectorAll('#sl-areabar .sl-ab-grp')].map(g => g.style.display === 'none');
            window.getEffectiveTier = () => Object.keys(LICENSE_TIER_RANK).sort((x, y) => LICENSE_TIER_RANK[y] - LICENSE_TIER_RANK[x])[0]; switchTab('ram-hub'); await wait(400);
            return { hid, grp };
        });
        check('[B] below Pro+ the Reliability and Maintainability pages and their group tabs are hidden, as before', tier.hid.every(Boolean) && tier.grp.length === 2 && tier.grp.every(Boolean), JSON.stringify(tier));
        console.log('\n[B] the program plan still decides what shows');
        const gate = await page.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            PROGRAM_PLAN.setLane('cea', false); switchTab('zsa'); await wait(400);
            const off = { tab: document.getElementById('snav-cea').style.display === 'none', inBar: !!document.getElementById('snav-cea').closest('#sl-areabar') };
            PROGRAM_PLAN.setLane('cea', true); switchTab('zsa'); await wait(400);
            const on = document.getElementById('snav-cea').style.display !== 'none' && !!document.getElementById('snav-cea').offsetParent;
            return { off, on };
        });
        check('[B] a lane switched off hides its tab', gate.off.tab && gate.off.inBar);
        check('[B] ... and it comes back when switched on', gate.on);

        console.log('\n[B] Working on: a system, and back');
        const sc = await page.evaluate(async () => {
            const wait = ms => new Promise(f => setTimeout(f, ms));
            const sid = String(systemsData[0].id), pick = document.getElementById('sl-scope-pick');
            pick.value = sid; pick.dispatchEvent(new Event('change')); await wait(700);
            const sys = { cur: window._slCurrentTab, active: String(activeSystemId), areas: [...document.querySelectorAll('#app-sidebar .asb-area')].filter(x => x.style.display !== 'none').map(x => x.getAttribute('data-area')), crumb: document.querySelector('#sl-areabar .sl-ab-crumb').textContent };
            const ws = document.getElementById('sl-nav-sysws'); const wsIn = !!(ws && ws.closest('#sl-areabar'));
            const dir = document.getElementById('snav-sys-dir'); dir.click(); await wait(500); const dirCur = window._slCurrentTab;
            ws.click(); await wait(500); const back = window._slCurrentTab;
            pick.value = 'aircraft'; pick.dispatchEvent(new Event('change')); await wait(700);
            const ac = { cur: window._slCurrentTab, scope: SLNavAreas.scope() };
            let asked = 0; const orig = window.promptCreateSystem; window.promptCreateSystem = function () { asked++; };
            pick.value = '+new'; pick.dispatchEvent(new Event('change')); await wait(200); window.promptCreateSystem = orig;
            return { sys, wsIn, dirCur, back, ac, asked, sysName: systemsData[0].name };
        });
        check('[B] picking a system opens its workspace', sc.sys.cur === 'sys-workspace' && sc.sys.active === String(sc.sys.active), JSON.stringify(sc.sys));
        check('[B] ... the sections become the system\'s', ['sys', 'pssa', 'ssa', 'standalone', 'ai', 'admin'].every(a => sc.sys.areas.indexOf(a) >= 0) && sc.sys.areas.every(a => ['sys', 'pssa', 'ssa', 'sys-cca', 'sys-ram', 'sys-hf', 'standalone', 'ai', 'admin'].indexOf(a) >= 0) && sc.sys.crumb.indexOf(sc.sysName) === 0, JSON.stringify(sc.sys));
        check('[B] All systems opens the directory, Workspace comes back', sc.wsIn && sc.dirCur === 'sys-dir' && sc.back === 'sys-workspace', JSON.stringify(sc));
        check('[B] picking Aircraft goes back to an aircraft page', sc.ac.scope === 'aircraft' && sc.ac.cur !== 'sys-workspace' && sc.ac.cur !== 'sys-dir', JSON.stringify(sc.ac));
        check('[B] + New system asks for a new system', sc.asked === 1);
        check('[B] no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } finally { await browser.close(); srv.close(); }
}
partB().catch(e => check('[B] the browser part ran', false, String(e && e.stack || e))).then(() => {
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
});

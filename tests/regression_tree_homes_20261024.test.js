#!/usr/bin/env node
/*
 * Regression: every fault tree has one home, and every top-down tree its verification tree, kept in step (24 Oct 2026).
 *
 * RULINGS (Waqas, 24 Oct 2026):
 *   "I want the top down fault trees to be in the PASA, and bottom up trees to be in ASA, top down system trees in
 *   the that systems PSSA, and bottom up ones in that systems SSA"; "the user never selects top down or bottom up
 *   tree any more"; "a separate fault trees option for stand alone trees" (the user picks the direction there);
 *   "diagram tools at both system and aircraft level"; "diagrams that belong to no level go with the standalone
 *   trees"; the all-trees page is dropped; "when a top down tree is created I want it to automatically create an
 *   ASA SSA instance for the verification tree"; "all top down trees must be creating a verification tree";
 *   "every verification tree details should keep updating as more detail is added to the top down tree"; a deleted
 *   top-down tree asks whether its verification tree goes too; a branch taken out is asked about.
 * EXECUTED (Chromium, the real app, the HL-1 and Kestrel showcases and a hand-built project):
 *   [H] homes: the rule (homeOf) on every page of every showcase; the picker lists one home and names it; the
 *       menu: PASA (Fault trees, Diagrams), ASA (Verification trees), a system's PSSA and SSA, Standalone; the
 *       toolbar shows level and direction as words (no dropdowns) except Standalone's direction; + New makes a tree
 *       for the home (none in ASA/SSA; Standalone asks the direction); opening a tree from elsewhere moves the page
 *       to its home; the FTA lane gate hides every tree link with the Fault Tree Analysis link.
 *   [D] diagram levels: a bow-tie takes its fault tree's level, a hand-made one the level it was made at, an
 *       unlinked old one Standalone; the bow-tie page lists only its level's.
 *   [V] verification: a new top-down tree gets its verification tree (in ASA, in the system's SSA); a branch added
 *       to the top-down tree arrives in the verification tree with its rate empty, next to the real rates already
 *       there; a rename flows; the real rates are never touched; a verification-only branch (as-built detail) is
 *       never touched or asked about; a branch taken out is asked about: Remove removes it, Keep keeps it flagged;
 *       deleting the top-down tree asks: delete both, or the verification tree goes to Standalone; on every showcase
 *       the first sync changes no real rate and asks nothing.
 *   [P] a system's own plan: its FTA and FMEA lanes off hide their tabs (and the SSA section), nothing is
 *       deleted, on brings them back; the aircraft's sections do not follow it; a new system's plan is the aircraft's.
 * MUTATION PROOFS: SL_TH_MUTATE=sides (an edit copies every value to the verification twin), =dir (homeOf ignores the direction), =filter (the picker lists every home),
 *   =values (the sync copies the rates), =ask (a removed branch is deleted without asking), =syslane (a system's
 *   plan is ignored by its sections). Each turns this red.
 * Run: node tests/regression_tree_homes_20261024.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_TH_MUTATE || '';

function mutate(file, body) {
    if (MUT === 'dir' && file === 'tree_homes.js') return body.replace("function dirOf(p) { return (p && (p.verifies || p.mode === 'bottom-up')) ? 'bottom-up' : 'top-down'; }", "function dirOf(p) { return 'top-down'; }");
    if (MUT === 'filter' && file === 'fta_tree_picker.js') return body.replace('roots = roots.filter(function (p) { return H.inHome(p); });', '');
    if (MUT === 'values' && file === 'verify_sync.js') return body.replace("var STRUCT = ['name',", "var STRUCT = ['lambda', 'probability', 'name',");
    if (MUT === 'syslane' && file === 'nav_areas.js') return body.replace('var off = sysScope && !_sysLaneOn(lane);', 'var off = false;');
    if (MUT === 'sides' && file === 'support_modules.js') return body.replace("const fields = (!srcSide || _repeatSideOf(page) === srcSide) ? REPEATED_EVENT_SYNCED_FIELDS : _REPEAT_IDENTITY_FIELDS;", 'const fields = REPEATED_EVENT_SYNCED_FIELDS;');
    if (MUT === 'ask' && file === 'verify_sync.js') return body.replace("else { gone.push(c); return; }", "else { _setKids(n, _kids(n).filter(function (z) { return z !== c; })); return; }");
    return body;
}

// a step that never finishes (an unanswered question) is a failure, not a hang
const within = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after ' + ms / 1000 + ' s: ' + what)), ms))]);
(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    // the wiring, read from the source (always runs)
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const at = f => HTML.indexOf('src="' + f);
    check('load order: tree_homes.js after helpers, fta_view, misc_fn, before prove_tabs and nav_areas; verify_sync.js after tree_homes and mirror_modes',
        ['helpers_modules.js', 'fta_view_modules.js', 'misc_fn_modules.js'].every(f => at(f) > 0 && at(f) < at('tree_homes.js')) && at('tree_homes.js') < at('prove_tabs.js') && at('tree_homes.js') < at('nav_areas.js') && at('verify_sync.js') > at('tree_homes.js') && at('verify_sync.js') > at('mirror_modes.js'));
    if (!pw) { console.log('  note  Playwright is not installed on this machine: the browser part did not run'); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
    const demos = require('./lib/demo_projects_all.js').all();
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && f.endsWith('.js')) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
    async function open(data, opts) {
        opts = opts || {};
        const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.addInitScript(() => { try { localStorage.removeItem('sl-tree-home-v1'); } catch (_) {} window.SL_VERIFY_SYNC_OFF = true; });
        await page.goto(url);
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && window.SLNavAreas && window.SLTreeHomes && window.SLVerifySync && document.getElementById('sl-areabar'), null, { timeout: 60000 });
        await page.evaluate(async ({ data, sync }) => {
            _applyProjectData(data); await new Promise(f => setTimeout(f, 1200));
            const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked');
            PROGRAM_PLAN.CATALOGUE.forEach(l => { try { PROGRAM_PLAN.setLane(l.id, true); } catch (_) {} });
            window.SL_VERIFY_SYNC_OFF = !sync;
            switchTab('dashboard');
        }, { data, sync: !!opts.sync });
        await new Promise(r => setTimeout(r, 500));
        return { page, errs };
    }
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    try {
        // ---------------------------------------------------------------- [H] the rule on every showcase
        console.log('\n[H] the rule, on every page of every showcase');
        {
            const { page, errs } = await open(demos.find(d => d.key === 'showcase:hl1').data);
            for (const d of demos) {
                const r = await within(page.evaluate((data) => {
                    _applyProjectData(data);
                    const bad = [];
                    ftaPages.forEach(p => {
                        const h = SLTreeHomes.homeOf(p);
                        const r0 = (function up(x) { const seen = {}; while (x && x.transferInFrom && x.transferInFrom.sourcePageId && !seen[x.id]) { seen[x.id] = 1; const nx = ftaPages.find(y => y.id === x.transferInFrom.sourcePageId); if (!nx) break; x = nx; } return x; })(p);
                        const bu = !!(r0.verifies || r0.mode === 'bottom-up');
                        const sysOk = r0.treeLevel === 'system' && systemsData.some(s => String(s.id) === String(r0.systemId));
                        const want = r0.treeLevel === 'aircraft' ? (bu ? 'asa' : 'pasa') : sysOk ? (bu ? 'ssa' : 'pssa') : 'standalone';
                        if (h.home !== want || (sysOk && String(h.systemId) !== String(r0.systemId))) bad.push(p.id + ' ' + h.home + ' != ' + want);
                    });
                    return { n: ftaPages.length, bad };
                }, d.data), 150000, 'the browser step');
                check('[H] ' + d.key + ': every one of its ' + r.n + ' trees is at home (aircraft PASA/ASA, system PSSA/SSA, else Standalone)', !r.bad.length, r.bad.slice(0, 4).join('; '));
            }
            check('[H] no page errors while reading the showcases', !errs.length, errs.slice(0, 3).join(' | '));
            await page.close();
        }

        // ---------------------------------------------------------------- [H] the page and the menu
        console.log('\n[H] the page and the menu (HL-1)');
        {
            const { page, errs } = await open(demos.find(d => d.key === 'showcase:hl1').data);
            const r = await within(page.evaluate(async () => {
                const wait = ms => new Promise(f => setTimeout(f, ms));
                const R = {};
                const opts = () => [...document.querySelectorAll('#fta-tree-pick option')].filter(o => o.value).map(o => o.value);
                const homeOfId = id => { const p = ftaPages.find(x => x.id === id); const h = SLTreeHomes.homeOf(p); return h.home + ':' + (h.systemId || ''); };
                const expectIn = (home, sid) => ftaPages.filter(p => !(p.transferInFrom && ftaPages.some(q => q.id === p.transferInFrom.sourcePageId)) && p.root && SLTreeHomes.inHome(p, { home, systemId: sid })).map(p => p.id).sort();
                document.querySelector('.asb-area[data-area="pasa"]').click(); await wait(400);
                R.pasaTabs = [...document.querySelectorAll('#sl-ab-row1 > *')].filter(x => x.style.display !== 'none').map(x => x.textContent.trim());
                document.getElementById('snav-fta').click(); await wait(700);
                SL_FTA_PICKER.render(true);   // trees made since the page opened (the MF&MS seeds) are listed on the picker's next draw
                R.pasa = { label: document.querySelector('#fta-tree-pick-host label').textContent, ids: opts().sort(), want: expectIn('pasa', null), homes: [...new Set(opts().map(homeOfId))],
                    lvl: (document.getElementById('fta-home-level') || {}).textContent, mode: (document.getElementById('fta-home-mode') || {}).textContent,
                    dropdownsHidden: document.getElementById('fta-calc-mode').style.display === 'none' && document.getElementById('fta-tree-level').style.display === 'none',
                    newBtn: document.getElementById('fta-tree-new').textContent + '|' + document.getElementById('fta-tree-new').style.display,
                    bar: document.querySelector('#view-fta .prove-tabbar').innerText.split('\n'), crumb: document.querySelector('#sl-areabar .sl-ab-crumb').textContent };
                document.querySelector('.asb-area[data-area="asa"]').click(); await wait(400);
                R.asaTabs = [...document.querySelectorAll('#sl-ab-row1 > *')].filter(x => x.style.display !== 'none').map(x => x.textContent.trim());
                document.getElementById('sl-nav-trees-asa').click(); await wait(700);
                R.asa = { label: document.querySelector('#fta-tree-pick-host label').textContent, homes: [...new Set(opts().map(homeOfId))], n: opts().length, want: expectIn('asa', null).length,
                    newHidden: document.getElementById('fta-tree-new').style.display === 'none', note: document.getElementById('fta-home-note').textContent, mode: (document.getElementById('fta-home-mode') || {}).textContent,
                    del: document.getElementById('fta-tree-delete').style.display };
                const sys = systemsData.find(s => ftaPages.some(p => p.systemId === s.id && !p.verifies)) || systemsData[0];
                SLNavAreas.pickScope(String(sys.id)); await wait(700);
                R.sysAreas = [...document.querySelectorAll('#app-sidebar .asb-area')].filter(x => x.style.display !== 'none').map(x => x.getAttribute('data-area'));
                document.querySelector('.asb-area[data-area="pssa"]').click(); await wait(700);
                R.pssaTabs = [...document.querySelectorAll('#sl-ab-row1 > *')].map(x => x.textContent.trim());
                R.pssaFirst = _slCurrentTab + '|' + (document.getElementById('ws-view-pssa') || {}).style.display;
                R.wsPssaBtnHidden = getComputedStyle(document.getElementById('ws-tab-pssa')).display === 'none';
                document.getElementById('sl-nav-trees-pssa').click(); await wait(700);
                R.pssa = { label: document.querySelector('#fta-tree-pick-host label').textContent, homes: [...new Set(opts().map(homeOfId))], want: 'pssa:' + sys.id, sysWord: (document.getElementById('fta-home-system') || {}).textContent, sysName: sys.name, crumb: document.querySelector('#sl-areabar .sl-ab-crumb').textContent };
                document.querySelector('.asb-area[data-area="ssa"]').click(); await wait(700);
                R.ssa = { label: document.querySelector('#fta-tree-pick-host label').textContent, homes: [...new Set(opts().map(homeOfId))], want: 'ssa:' + sys.id, tabs: [...document.querySelectorAll('#sl-ab-row1 > *')].map(x => x.textContent.trim()) };
                // opening a tree from somewhere else takes the page to its home (the PSSA panel's Open)
                const ac = ftaPages.find(p => p.treeLevel === 'aircraft' && !p.verifies && p.root);
                openFTAPageById(ac.id); await wait(700);
                R.follow = { home: SLTreeHomes.current().home, label: document.querySelector('#fta-tree-pick-host label').textContent, scope: SLNavAreas.scope(), crumb: document.querySelector('#sl-areabar .sl-ab-crumb').textContent };
                // the plan's FTA lane: every tree link goes with the Fault Tree Analysis link
                PROGRAM_PLAN.setLane('fta', false, { rationale: 'tree homes lane gate test', sig: 'test' }); await wait(500);
                R.gateOff = ['snav-fta', 'sl-nav-diag-pasa', 'sl-nav-trees-asa', 'sl-nav-trees-pssa', 'sl-nav-trees-ssa', 'sl-nav-trees-standalone'].map(id => document.getElementById(id).style.display);
                PROGRAM_PLAN.setLane('fta', true); await wait(500);
                R.gateOn = ['snav-fta', 'sl-nav-diag-pasa', 'sl-nav-trees-asa', 'sl-nav-trees-standalone'].map(id => document.getElementById(id).style.display);
                return R;
            }), 150000, 'the browser step');
            check('[H] PASA: PASA, Aircraft requirements, Fault trees, Diagrams', JSON.stringify(r.pasaTabs) === JSON.stringify(['PASA', 'Aircraft requirements', 'Fault trees', 'Diagrams']), JSON.stringify(r.pasaTabs));
            check('[H] PASA fault trees: the picker lists exactly the PASA trees, and says so', r.pasa.label === 'PASA fault trees' && JSON.stringify(r.pasa.ids) === JSON.stringify(r.pasa.want) && JSON.stringify(r.pasa.homes) === '["pasa:"]', JSON.stringify(r.pasa).slice(0, 400));
            check('[H] the toolbar says Aircraft and Top-down in words; the two dropdowns are gone', r.pasa.lvl === 'Aircraft' && /^Top-down/.test(r.pasa.mode) && r.pasa.dropdownsHidden, JSON.stringify(r.pasa));
            check('[H] + New makes a PASA tree; the bar over the page is PASA with the diagram tools', r.pasa.newBtn === '+ New PASA fault tree|' && r.pasa.bar[0] === 'PASA' && r.pasa.bar.indexOf('Bow-Tie') > 0 && r.pasa.crumb === 'Aircraft · PASA', JSON.stringify(r.pasa));
            check('[H] ASA: ASA, Verification trees, then the ASA pages', r.asaTabs[0] === 'ASA' && r.asaTabs[1] === 'Verification trees', JSON.stringify(r.asaTabs));
            check('[H] ASA verification trees: only ASA trees, worked bottom-up, no + New, said why; a verification tree has no Delete of its own', r.asa.label === 'ASA verification trees' && JSON.stringify(r.asa.homes) === '["asa:"]' && r.asa.n === r.asa.want && r.asa.newHidden && /made from a PASA fault tree/.test(r.asa.note) && /^Bottom-up/.test(r.asa.mode) && r.asa.del === 'none', JSON.stringify(r.asa));
            check('[H] a system: its Workspace, PSSA and SSA, Standalone, then the foot', JSON.stringify(r.sysAreas.filter(a => ['sys-cca', 'sys-ram', 'sys-hf'].indexOf(a) < 0)) === JSON.stringify(['sys', 'pssa', 'ssa', 'standalone', 'ai', 'admin']) && JSON.stringify(r.sysAreas.slice(3, -3)) === JSON.stringify(r.sysAreas.filter(a => /^sys-/.test(a))), JSON.stringify(r.sysAreas));
            check('[H] PSSA: Allocation and DAL, Requirements, Fault trees, Diagrams; it opens on Allocation and DAL; the workspace\'s own PSSA button is gone (no duplicate)', JSON.stringify(r.pssaTabs) === JSON.stringify(['Allocation and DAL', 'Requirements', 'Fault trees', 'Diagrams']) && r.pssaFirst === 'sys-workspace|block' && r.wsPssaBtnHidden, JSON.stringify([r.pssaTabs, r.pssaFirst, r.wsPssaBtnHidden]));
            check('[H] the system\'s PSSA fault trees: only that system\'s top-down trees, its name in words', JSON.stringify(r.pssa.homes) === JSON.stringify([r.pssa.want]) && r.pssa.label === r.pssa.sysName + ' PSSA fault trees' && r.pssa.sysWord === r.pssa.sysName && r.pssa.crumb.indexOf(r.pssa.sysName) === 0, JSON.stringify(r.pssa));
            check('[H] the system\'s SSA: Verification trees, its FMEA (25 Oct 2026) and the SSA report; only that system\'s bottom-up trees', JSON.stringify(r.ssa.homes) === JSON.stringify([r.ssa.want]) && JSON.stringify(r.ssa.tabs) === JSON.stringify(['Verification trees', 'FMEA', 'SSA report']), JSON.stringify(r.ssa));
            check('[H] a tree opened from elsewhere takes the page, the picker and the menu to its home', r.follow.home === 'pasa' && r.follow.label === 'PASA fault trees' && r.follow.scope === 'aircraft' && r.follow.crumb === 'Aircraft · PASA', JSON.stringify(r.follow));
            check('[H] the FTA lane off hides every tree and diagram link; on brings them back', r.gateOff.every(x => x === 'none') && r.gateOn.every(x => x === ''), JSON.stringify([r.gateOff, r.gateOn]));
            check('[H] no page errors', !errs.length, errs.slice(0, 3).join(' | '));
            await page.close();
        }

        // ---------------------------------------------------------------- [H] + New, per home
        console.log('\n[H] + New, per home');
        {
            const { page, errs } = await open(demos.find(d => d.key === 'showcase:hl1').data);
            const r = await within(page.evaluate(async () => {
                const wait = ms => new Promise(f => setTimeout(f, ms));
                const R = {};
                const mine = () => ftaPages.filter(p => /^page-/.test(String(p.id)));   // + New's pages (the MF&MS seeds appear on their own meanwhile)
                const newest = () => mine()[mine().length - 1];
                SLTreeHomes.open('pasa'); await wait(300); const n0 = mine().length;
                await addNewFTAPage(); await wait(300);
                R.pasa = { made: mine().length - n0, lvl: newest().treeLevel, mode: newest().mode, home: SLTreeHomes.homeOf(newest()).home };
                const sid = String(systemsData[0].id);
                SLTreeHomes.open('pssa', sid); await wait(300); const n1 = mine().length;
                await addNewFTAPage(); await wait(300);
                R.pssa = { made: mine().length - n1, lvl: newest().treeLevel, sys: String(newest().systemId), mode: newest().mode, want: sid };
                SLTreeHomes.open('asa'); await wait(300); const n2 = mine().length;
                await addNewFTAPage(); await wait(300);
                R.asa = { made: mine().length - n2 };
                SLTreeHomes.open('standalone'); await wait(300); const n3 = mine().length;
                const p = addNewFTAPage(); await wait(400);
                R.ask = { shown: !!document.querySelector('#sl-dialog-overlay .sl-dialog-choice'), choices: [...document.querySelectorAll('#sl-dialog-overlay .sl-dialog-choice strong')].map(x => x.textContent) };
                document.querySelectorAll('#sl-dialog-overlay .sl-dialog-choice')[1].click(); await p; await wait(400);
                R.standalone = { made: mine().length - n3, lvl: newest().treeLevel, mode: newest().mode, home: SLTreeHomes.homeOf(newest()).home,
                    modeSelShown: document.getElementById('fta-calc-mode').style.display !== 'none' };
                return R;
            }), 150000, 'the browser step');
            check('[H] + New in PASA: an aircraft top-down tree, at home in PASA', r.pasa.made === 1 && r.pasa.lvl === 'aircraft' && r.pasa.mode === 'top-down' && r.pasa.home === 'pasa', JSON.stringify(r.pasa));
            check('[H] + New in a system\'s PSSA: that system\'s top-down tree', r.pssa.made === 1 && r.pssa.lvl === 'system' && r.pssa.sys === r.pssa.want && r.pssa.mode === 'top-down', JSON.stringify(r.pssa));
            check('[H] ASA makes no tree by hand', r.asa.made === 0, JSON.stringify(r.asa));
            check('[H] + New in Standalone asks top-down or bottom-up; bottom-up makes a standalone bottom-up tree, its direction dropdown kept', r.ask.shown && JSON.stringify(r.ask.choices) === '["Top-down","Bottom-up"]' && r.standalone.made === 1 && r.standalone.lvl === 'standalone' && r.standalone.mode === 'bottom-up' && r.standalone.home === 'standalone' && r.standalone.modeSelShown, JSON.stringify(r));
            check('[H] no page errors', !errs.length, errs.slice(0, 3).join(' | '));
            await page.close();
        }

        // ---------------------------------------------------------------- [D] diagrams by level
        console.log('\n[D] diagrams by level');
        {
            const { page, errs } = await open(demos.find(d => d.key === 'showcase:hl1').data);
            const r = await within(page.evaluate(async () => {
                const wait = ms => new Promise(f => setTimeout(f, ms));
                const sys = systemsData.find(s => ftaPages.some(p => p.systemId === s.id && !p.verifies));
                const acPage = ftaPages.find(p => p.treeLevel === 'aircraft' && !p.verifies);
                const sysPage = ftaPages.find(p => p.systemId === sys.id && !p.verifies);
                projectConfig.bowties = [
                    { id: 'BT-901', name: 'aircraft one', ftaPageId: acPage.id, etaId: '', barriers: [] },
                    { id: 'BT-902', name: 'system one', ftaPageId: sysPage.id, etaId: '', barriers: [] },
                    { id: 'BT-903', name: 'old unlinked', ftaPageId: '', etaId: '', barriers: [] }];
                const lv = id => { const b = projectConfig.bowties.find(x => x.id === id); const l = SLTreeHomes.itemLevel('bowtie', b); return l.level + ':' + (l.systemId || ''); };
                const listed = async (home, sid) => { SLTreeHomes.openDiagrams(home, sid); await wait(500); return [...document.querySelectorAll('#bt-select option')].map(o => o.value).filter(v => /^BT-/.test(v)); };
                const R = { lv: [lv('BT-901'), lv('BT-902'), lv('BT-903')], want: ['aircraft:', 'system:' + sys.id, 'standalone:'] };
                R.ac = await listed('pasa'); R.sys = await listed('pssa', String(sys.id)); R.st = await listed('standalone');
                // made by hand at a system: it belongs there
                SLTreeHomes.openDiagrams('pssa', String(sys.id)); await wait(300);
                const pr = btCreate(); await wait(400);
                const inp = document.getElementById('sl-dialog-input'); if (inp) inp.value = 'made at the system'; const okb = document.querySelector('#sl-dialog-overlay .sl-dialog-ok'); if (okb) okb.click(); await pr; await wait(300);
                const made = projectConfig.bowties.find(b => b.name === 'made at the system');
                R.made = made ? made.level + ':' + made.systemId : 'none';
                R.bar = (document.querySelector('#view-bowtie .prove-tabbar .prove-tabbar-lbl') || {}).textContent;
                return R;
            }), 150000, 'the browser step');
            check('[D] a bow-tie takes its fault tree\'s level; an unlinked old one is Standalone', JSON.stringify(r.lv) === JSON.stringify(r.want), JSON.stringify(r));
            check('[D] the bow-tie page lists only the level\'s bow-ties', JSON.stringify(r.ac) === '["BT-901"]' && JSON.stringify(r.sys) === '["BT-902"]' && JSON.stringify(r.st) === '["BT-903"]', JSON.stringify(r));
            check('[D] a bow-tie made at a system belongs to it; the bar names the level', /^system:/.test(r.made) && / PSSA$/.test(r.bar), JSON.stringify(r));
            check('[D] no page errors', !errs.length, errs.slice(0, 3).join(' | '));
            await page.close();
        }

        // ---------------------------------------------------------------- [P] a system's own plan
        console.log('\n[P] a system\'s sections follow its own plan');
        {
            const { page, errs } = await open(demos.find(d => d.key === 'showcase:hl1').data);
            const r = await within(page.evaluate(async () => {
                const wait = ms => new Promise(f => setTimeout(f, ms));
                const R = {};
                const sys = systemsData.find(s => ftaPages.some(p => p.systemId === s.id && !p.verifies)) || systemsData[0];
                const sid = String(sys.id);
                const set = (lane, on) => { try { PROGRAM_PLAN.setSystemLane(sid, lane, on, { rationale: 'tailored for the test of the system plan', sig: 'test' }); } catch (e) { return e.message; } return ''; };
                SLNavAreas.pickScope(sid); await wait(700);
                const vis = () => ({ areas: [...document.querySelectorAll('#app-sidebar .asb-area')].filter(x => x.style.display !== 'none').map(x => x.getAttribute('data-area')),
                    links: ['sl-nav-trees-pssa', 'sl-nav-diag-pssa', 'sl-nav-trees-ssa', 'sl-nav-ssa-report', 'sl-nav-ssa-fmea', 'sl-nav-sys-plan'].map(id => { const x = document.getElementById(id); return id + ':' + (x && getComputedStyle(x).display !== 'none' && !x.classList.contains('sl-sys-lane-off') ? 1 : 0); }),
                    fmea: (() => { const x = document.getElementById('sl-nav-ssa-fmea'); return x ? !x.classList.contains('sl-sys-lane-off') && x.style.display !== 'none' : null; })(),
                    wsFmea: (() => { const x = document.getElementById('ws-tab-fmea'); return x ? getComputedStyle(x).display !== 'none' : null; })() });
                set('fta', true); set('ffmea', true); set('ppfmea', true); await wait(1800);
                R.on = vis();
                R.errOff = set('fta', false) + set('ffmea', false) + set('ppfmea', false); await wait(1800);
                R.off = vis();
                R.dataKept = ftaPages.some(p => p.systemId === sys.id && !p.verifies);
                set('fta', true); set('ffmea', true); await wait(1800);
                R.back = vis();
                // the aircraft's sections never follow a system's plan
                SLNavAreas.pickScope('aircraft'); await wait(600);
                R.acLinks = ['snav-fta', 'sl-nav-trees-asa'].map(id => { const x = document.getElementById(id); return x && !x.classList.contains('sl-sys-lane-off') ? 1 : 0; });
                // a new system: its plan is made from the aircraft's, and it has its sections
                const n0 = systemsData.length;
                const pr = promptCreateSystem(); await wait(400);
                const i1 = document.getElementById('sl-dialog-input'); if (i1) i1.value = 'Test system for the plan'; document.querySelector('#sl-dialog-overlay .sl-dialog-ok').click(); await wait(400);
                const i2 = document.getElementById('sl-dialog-input'); if (i2) i2.value = 'function'; const ok2 = document.querySelector('#sl-dialog-overlay .sl-dialog-ok'); if (ok2) ok2.click(); await pr; await wait(600);
                document.querySelectorAll('.modal-overlay').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
                const ns = systemsData[systemsData.length - 1];
                R.newSys = { made: systemsData.length === n0 + 1, plan: !!PROGRAM_PLAN.systemPlan(ns.id), ftaLane: PROGRAM_PLAN.systemLaneOn(ns.id, 'fta') === PROGRAM_PLAN.laneOn('fta') };
                SLNavAreas.pickScope(String(ns.id)); await wait(700);
                R.newSys.areas = [...document.querySelectorAll('#app-sidebar .asb-area')].filter(x => x.style.display !== 'none').map(x => x.getAttribute('data-area'));
                return R;
            }), 150000, 'the system plan step');
            check('[P] every lane on: PSSA fault trees and diagrams, SSA with its FMEA tab, and the plan show; the FMEA is the SSA\'s, never a workspace button (25 Oct 2026)', r.on.links.every(x => /:1$/.test(x)) && r.on.fmea && r.on.wsFmea === false && r.on.areas.indexOf('ssa') >= 0, JSON.stringify(r.on));
            check('[P] the system\'s FTA and FMEA lanes off: their tabs go, the SSA section with them; the plan link stays', !r.errOff && r.off.links.filter(x => /:1$/.test(x)).join() === 'sl-nav-sys-plan:1' && r.off.fmea === false && r.off.areas.indexOf('ssa') < 0, JSON.stringify(r.off) + r.errOff);
            check('[P] nothing is deleted; on again, they come back', r.dataKept && r.back.links.every(x => /:1$/.test(x)) && r.back.areas.indexOf('ssa') >= 0, JSON.stringify(r.back));
            check('[P] the aircraft\'s sections do not follow a system\'s plan', r.acLinks.every(x => x === 1), JSON.stringify(r.acLinks));
            check('[P] a new system gets its plan from the aircraft\'s, and its sections', r.newSys.made && r.newSys.plan && r.newSys.ftaLane && ['sys', 'pssa', 'ssa', 'standalone', 'ai', 'admin'].every(a => r.newSys.areas.indexOf(a) >= 0) && r.newSys.areas.every(a => ['sys', 'pssa', 'ssa', 'sys-cca', 'sys-ram', 'sys-hf', 'standalone', 'ai', 'admin'].indexOf(a) >= 0), JSON.stringify(r.newSys));
            check('[P] no page errors', !errs.length, errs.slice(0, 3).join(' | '));
            await page.close();
        }

        // ---------------------------------------------------------------- [V] verification trees
        console.log('\n[V] verification trees, made and kept in step');
        {
            const { page, errs } = await open(demos.find(d => d.key === 'showcase:hl1').data, { sync: true });
            const r = await within(page.evaluate(async () => {
                const wait = ms => new Promise(f => setTimeout(f, ms));
                const R = {};
                const lid = n => String(n.logicalId != null ? n.logicalId : n.id);
                const find = (root, pred) => { let h = null; (function w(n) { if (!n || h) return; if (pred(n)) { h = n; return; } (n.children || n._children || []).forEach(w); })(root); return h; };
                // answers the app's own dialog whose words match, with the button whose label matches (null: none came)
                const answer = async (msgRe, btnRe) => { for (let i = 0; i < 40; i++) { const ov = document.querySelector('#sl-dialog-overlay.show'); if (ov && msgRe.test(ov.innerText)) { const b = [...ov.querySelectorAll('button')].find(x => btnRe.test(x.textContent)); if (b) { const t = ov.innerText; b.click(); await wait(350); return t; } } await wait(100); } return null; };
                const mk = (id, name, type) => { const n = internalIdCounter++; return { id: n, logicalId: n, displayId: (type === 'gate' ? 'G-' : 'BE-') + n, name, type, gateType: type === 'gate' ? 'OR' : undefined, lambda: type === 'gate' ? undefined : 1e-6, probability: 0, children: [] }; };
                // a new aircraft top-down tree: its verification tree appears in ASA
                const top = mk(0, 'Loss of test function', 'gate');
                const a = mk(0, 'Channel A fails', 'basic'), b = mk(0, 'Channel B fails', 'basic');
                top.children = [a, b];
                ftaPages.push({ id: 'pg-test-vs', name: 'Test allocation', treeLevel: 'aircraft', mode: 'top-down', root: top });
                scheduleAutosave(); await wait(3200);
                const m = () => ftaPages.find(p => p.verifies === 'pg-test-vs');
                R.made = m() ? { home: SLTreeHomes.homeOf(m()).home, name: m().name, leaves: (m().root.children || []).map(c => c.name + '=' + c.lambda) } : null;
                // the engineer enters a real rate on the verification side, and the as-built adds a failure of its own
                const ma = find(m().root, n => lid(n) === lid(a)); ma.lambda = 3.3e-6;
                const extra = mk(0, 'Shuttle valve leakage (as built)', 'basic'); extra.lambda = 7e-7; m().root.children.push(extra);
                scheduleAutosave(); await wait(3000);
                // detail added on the top-down side, and a rename
                const c = mk(0, 'Monitor fails latent', 'basic'); top.children.push(c);
                const g = mk(0, 'Both sensors lost', 'gate'); const s1 = mk(0, 'Sensor 1', 'basic'), s2 = mk(0, 'Sensor 2', 'basic'); g.children = [s1, s2]; top.children.push(g);
                b.name = 'Channel B fails (renamed)';
                scheduleAutosave(); await wait(3200);
                const mm = m();
                R.step = { names: (mm.root.children || []).map(x => x.name), cRate: (find(mm.root, n => lid(n) === lid(c)) || {}).lambda, gKids: ((find(mm.root, n => lid(n) === lid(g)) || {}).children || []).map(x => x.name + '=' + x.lambda),
                    aRate: find(mm.root, n => lid(n) === lid(a)).lambda, extra: (find(mm.root, n => n.name === 'Shuttle valve leakage (as built)') || {}).lambda, renamed: find(mm.root, n => lid(n) === lid(b)).name };
                // an edit on the top-down node through the app's own repeated-event path (the node dialog, the canvas):
                // the name follows to the verification twin, the budget does not land on its real rate
                a.name = 'Channel A fails (edited)'; a.lambda = 4.4e-9; a.probability = 4.4e-9; a.inputMode = 'probability';
                propagateRepeatedEventEdit(a);
                { const t = find(m().root, n => lid(n) === lid(a)); R.edit = { name: t.name, rate: t.lambda, mode: t.inputMode || 'lambda' }; }
                a.name = 'Channel A fails';
                propagateRepeatedEventEdit(a);
                // a branch taken out of the top-down tree: asked; Keep keeps it, flagged
                top.children = top.children.filter(x => x !== a);
                scheduleAutosave(); await wait(3200);
                R.stillThere = !!find(m().root, n => lid(n) === lid(a));
                R.ask1 = (await answer(/taken out of/, /^Keep/)) || '';
                await wait(300);
                const ka = find(m().root, n => lid(n) === lid(a));
                R.kept = ka ? { flag: !!ka._notInAllocation, rate: ka.lambda } : null;
                scheduleAutosave(); await wait(3000);
                R.askedAgain = !!document.querySelector('#sl-dialog-overlay.show');
                // a blank branch taken out (nothing entered on the verification side): it goes without a question
                top.children = top.children.filter(x => x !== g);
                scheduleAutosave(); await wait(3200);
                R.quiet = { gone: !find(m().root, n => lid(n) === lid(g)), asked: !!document.querySelector('#sl-dialog-overlay.show') };
                // one with a real rate entered, taken out: asked; Remove removes it
                find(m().root, n => lid(n) === lid(c)).lambda = 1e-7;
                top.children = top.children.filter(x => x !== c);
                scheduleAutosave(); await wait(3200);
                R.ask2 = !!(await answer(/taken out of/, /^Remove/));
                await wait(300);
                R.removed = !find(m().root, n => lid(n) === lid(c)) && !!find(m().root, n => n.name === 'Shuttle valve leakage (as built)');
                // deleting the top-down tree asks; keep: the verification tree goes to Standalone
                const mid = m().id;
                SLTreeHomes.open('pasa'); activeFTAPageId = 'pg-test-vs';
                const pd = SLVerifySync.deleteTree('pg-test-vs');
                R.ask0 = !!(await answer(/Delete the fault tree "Test allocation"/, /^Delete$/));
                R.ask3 = (await answer(/has a verification tree/, /^Keep it/)) || '';
                await pd; await wait(500);
                const left = ftaPages.find(p => p.id === mid);
                R.del = { srcGone: !ftaPages.some(p => p.id === 'pg-test-vs'), kept: !!left, home: left && SLTreeHomes.homeOf(left).home, mode: left && left.mode, verifies: left && left.verifies };
                // a second tree, deleted with its verification tree
                const top2 = mk(0, 'Second', 'gate'); top2.children = [mk(0, 'x', 'basic')];
                ftaPages.push({ id: 'pg-test-vs2', name: 'Second', treeLevel: 'system', systemId: systemsData[0].id, mode: 'top-down', root: top2 });
                scheduleAutosave(); await wait(3200);
                const m2 = ftaPages.find(p => p.verifies === 'pg-test-vs2');
                R.sysHome = m2 && SLTreeHomes.homeOf(m2);
                const pd2 = SLVerifySync.deleteTree('pg-test-vs2');
                await answer(/Delete the fault tree "Second"/, /^Delete$/);
                await answer(/has a verification tree/, /too/);
                await pd2; await wait(400);
                R.both = !ftaPages.some(p => p.id === 'pg-test-vs2' || p.verifies === 'pg-test-vs2');
                return R;
            }), 150000, 'the browser step');
            check('[V] a new aircraft top-down tree gets its verification tree, in ASA, its rates empty', r.made && r.made.home === 'asa' && r.made.name === 'Test allocation (Verification)' && JSON.stringify(r.made.leaves) === '["Channel A fails=0","Channel B fails=0"]', JSON.stringify(r.made));
            check('[V] detail added to the top-down tree arrives, rates empty; a rename flows', r.step.names.indexOf('Monitor fails latent') >= 0 && r.step.cRate === 0 && JSON.stringify(r.step.gKids) === '["Sensor 1=0","Sensor 2=0"]' && r.step.renamed === 'Channel B fails (renamed)', JSON.stringify(r.step));
            check('[V] the real rate entered on the verification side is kept; the as-built failure of its own stays untouched', r.step.aRate === 3.3e-6 && r.step.extra === 7e-7, JSON.stringify(r.step));
            check('[V] an edit on the top-down node: its name follows to the verification twin, its budget never lands on the twin\'s real rate', r.edit && r.edit.name === 'Channel A fails (edited)' && r.edit.rate === 3.3e-6 && r.edit.mode !== 'probability', JSON.stringify(r.edit));
            check('[V] a branch taken out of the top-down tree is asked about, and stays until answered', /taken out of the PASA tree "Test allocation"/.test(r.ask1) && /Channel A fails/.test(r.ask1) && r.stillThere, r.ask1);
            check('[V] Keep keeps it, flagged, with its rate; not asked again', r.kept && r.kept.flag && r.kept.rate === 3.3e-6 && !r.askedAgain, JSON.stringify([r.kept, r.askedAgain]));
            check('[V] a branch with nothing entered on the verification side goes without a question', r.quiet.gone && !r.quiet.asked, JSON.stringify(r.quiet));
            check('[V] one with a real rate: asked; Remove removes it (and only it)', r.ask2 && r.removed, JSON.stringify([r.ask2, r.removed]));
            check('[V] deleting the top-down tree asks about its verification tree; Keep sends it to Standalone, bottom-up', r.ask0 && /has a verification tree/.test(r.ask3) && r.del.srcGone && r.del.kept && r.del.home === 'standalone' && r.del.mode === 'bottom-up' && !r.del.verifies, JSON.stringify([r.ask3, r.del]));
            check('[V] a system tree\'s verification tree is in that system\'s SSA; deleting with "too" deletes both', r.sysHome && r.sysHome.home === 'ssa' && r.both, JSON.stringify([r.sysHome, r.both]));
            check('[V] no page errors', !errs.length, errs.slice(0, 3).join(' | '));
            await page.close();
        }

        // ---------------------------------------------------------------- [V] the first sync, on every showcase
        console.log('\n[V] the first sync on every showcase: no real rate changes, nothing asked');
        {
            const { page, errs } = await open(demos[0].data);
            for (const d of demos) {
                const r = await within(page.evaluate((data) => {
                    _applyProjectData(data);
                    const vals = () => { const o = []; ftaPages.filter(p => p.verifies).forEach(p => (function w(n) { if (!n) return; if (n.type !== 'gate') o.push(p.id + ':' + String(n.logicalId) + ':' + n.name + '=' + n.lambda + '/' + n.probability + '/' + (n.markovModelId || '')); (n.children || n._children || []).forEach(w); })(p.root)); return o; };
                    const v0 = vals();
                    const td = ftaPages.filter(p => !p.verifies && (p.mode || 'top-down') === 'top-down' && p.root);
                    window.SL_VERIFY_SYNC_OFF = false;   // the sweep by hand, here (the timer stays off for this page)
                    const s1 = SLVerifySync.sweep({ noAsk: true, quiet: true }), s2 = SLVerifySync.sweep({ noAsk: true, quiet: true });
                    window.SL_VERIFY_SYNC_OFF = true;
                    const byName = x => x.split(':').slice(0, 1).concat(x.split(':').slice(2)).join(':');   // ids may be re-keyed to the tree's, never the rates
                    const after = new Set(vals().map(byName));
                    const lost = v0.map(byName).filter(x => !after.has(x));
                    return { td: td.length, mirrors: ftaPages.filter(p => p.verifies).length, everyOne: td.every(p => ftaPages.some(m => m.verifies === p.id)), lost, asked: s1.removed.length + s1.orphans.length, again: s2.changed + s2.made };
                }, d.data), 150000, 'the browser step');
                check('[V] ' + d.key + ': every top-down tree has its verification tree (' + r.mirrors + '); no rate lost; nothing asked; a second sweep changes nothing',
                    r.everyOne && !r.lost.length && r.asked === 0 && r.again === 0, JSON.stringify(r).slice(0, 400));
            }
            check('[V] no page errors', !errs.length, errs.slice(0, 3).join(' | '));
            await page.close();
        }
    } finally {
        await browser.close(); srv.close();
    }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });

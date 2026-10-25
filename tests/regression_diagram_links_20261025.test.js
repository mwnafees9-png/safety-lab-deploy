#!/usr/bin/env node
/*
 * Regression (browser): which fault trees an event tree heading and a bow-tie top event may link. 25 Oct 2026.
 *
 * WAQAS agreed: the top event stays at its own level; system trees belong one step down, on the branches. In use:
 *   [L1] an aircraft event tree's heading offers the aircraft's trees and every system's trees, each system's
 *        named with its system first; the heading picker under the drawing offers the same
 *   [L1] a heading of an aircraft event tree links a system's tree; the event tree stays the aircraft's
 *   [L1] an aircraft event tree made before levels (no level of its own) linking a system's tree stays the aircraft's
 *   [L2] a system's event tree offers only its own system's trees, and refuses another system's or the aircraft's
 *   [L3] an aircraft bow-tie's top event offers only the aircraft's trees, and refuses a system's
 *   [L4] a link made before that the rule no longer offers is kept and shown "(at another level)"
 * MUTATION PROOFS (SL_DL_MUTATE): branch (no system trees on aircraft headings) turns L1 red; api (the event tree
 * takes any link) turns L2 red; top (the top event offers what a heading offers) and settop (the top event takes
 * any tree) turn L3 red; kept (an old link not shown) turns L4 red; stamp (an unstamped tree not kept at its level)
 * turns L1 red.
 * Run: node tests/regression_diagram_links_20261025.test.js   (Playwright + Chromium)
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_DL_MUTATE || '';
const MUTS = {
    branch: ['tree_homes.js', "if (purpose === 'branch' && s.level === 'aircraft') {", 'if (false) {'],
    kept: ['tree_homes.js', 'if (cur && !o.some(function (x)', 'if (false && !o.some(function (x)'],
    api: ['event_trees.js', "if (!H.linkAllowed('branch', pid, sc)) return", 'if (false) return'],
    stamp: ['event_trees.js', 'if (!t.level && !H.pageInLevel(pid, sc)) H.stamp(t, sc);', ''],
    top: ['bowtie.js', "H.linkOptions('top', cur,", "H.linkOptions('branch', cur,"],
    settop: ['bowtie.js', "if (H && H.linkAllowed && !H.linkAllowed('top', v,", "if (false && !H.linkAllowed('top', v,"],
};
const mutate = (file, body) => { const m = MUTS[MUT]; return m && m[0] === file ? body.replace(m[1], m[2]) : body; };

(async function main() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed on this machine: the browser checks did not run'); process.exit(0); }
    if (MUT) { const m = MUTS[MUT]; const src = m && fs.readFileSync(path.join(SITE, m[0]), 'utf8'); if (!m || mutate(m[0], src) === src) { console.log('  FAIL  the mutation ' + MUT + ' found nothing to change'); process.exit(1); } }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } let body = b; if (MUT && /\.js$/.test(f)) body = Buffer.from(mutate(path.basename(f), b.toString('utf8'))); r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(body); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof loadSampleProject === 'function' && window.SLTreeHomes && window.etaCreate && window.SLBowtieUI, null, { timeout: 60000 });
        await page.evaluate(async () => { const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); document.documentElement.classList.remove('sl-auth-gate-blocked'); window.SL_VERIFY_SYNC_OFF = true; await loadSampleProject(); });
        await page.waitForTimeout(2500);
        const R = await page.evaluate(async () => {
            const wait = ms => new Promise(r => setTimeout(r, ms));
            document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
            const H = SLTreeHomes, out = {};
            const roots = ftaPages.filter(p => p && p.root);
            const AC = { level: 'aircraft', systemId: null }, FCS = { level: 'system', systemId: 'sys-fcs' };
            const idsAt = lv => roots.filter(p => H.pageInLevel(p, lv)).map(p => p.id);
            const sysOrder = systemsData.map(s => String(s.id));
            const sysRoots = [].concat(...sysOrder.map(sid => roots.filter(p => { const l = H.levelOf(p); return l.level === 'system' && String(l.systemId) === sid; })));
            const sysName = id => (systemsData.find(s => String(s.id) === String(id)) || {}).name;
            const tree = id => projectConfig.eventTrees.find(t => t.id === id);
            const newEta = (name, lv) => { const r = etaCreate(name, 'Initiating event', 1e-5, 'Test signer'); const t = tree(r.id); if (lv) H.stamp(t, lv); etaAddBarrier(r.id, 'Backup fails to take over', 1e-3); return r.id; };
            out.counts = { ac: idsAt(AC).length, sys: sysRoots.length, fcs: idsAt(FCS).length };

            // ---- the aircraft's event tree
            H._setCur({ home: 'pasa' }); await wait(50);
            const ac = newEta('Links test, aircraft', AC);
            const acOpts = SLEtaUI.headingOptions(ac, '').slice(1);
            out.acValues = acOpts.map(o => o.value);
            out.acWant = idsAt(AC).concat(sysRoots.map(p => p.id));
            out.acLabelsOk = acOpts.every(o => { const p = roots.find(x => x.id === o.value); const l = H.levelOf(p); return l.level === 'system' ? o.label === (sysName(l.systemId) + ' · ' + String(p.name || p.id)).slice(0, 60) : o.label === String(p.name || p.id).slice(0, 60); });
            // the picker under the drawing
            H.openDiagrams('pasa'); await wait(300); switchTab('eta'); await wait(400); SLEtaUI.select(ac); await wait(500);
            const sel = document.querySelector('select[aria-label="Fault tree that implements heading 1"]');
            out.acDom = sel ? [...sel.options].slice(1).map(o => o.value) : null;
            out.acLink = etaLinkBarrier(ac, 0, 'pg-fcs-pitch');
            out.acAfter = { level: tree(ac).level, linked: tree(ac).barriers[0].linkedPageId, inFcs: H.inLevel('eta', tree(ac), FCS), inAc: H.inLevel('eta', tree(ac), AC) };
            // made before levels: no level of its own
            const old = newEta('Links test, no level', null);
            out.oldLink = etaLinkBarrier(old, 0, 'pg-eps-bus');
            out.oldAfter = { level: tree(old).level || null, inAc: H.inLevel('eta', tree(old), AC), inEps: H.inLevel('eta', tree(old), { level: 'system', systemId: 'sys-eps' }) };

            // ---- a system's event tree
            H._setCur({ home: 'pssa', systemId: 'sys-fcs' }); await wait(50);
            const sy = newEta('Links test, FCS', FCS);
            out.syValues = SLEtaUI.headingOptions(sy, '').slice(1).map(o => o.value);
            out.syWant = idsAt(FCS);
            out.syOther = etaLinkBarrier(sy, 0, 'pg-eps-bus');
            out.syAc = etaLinkBarrier(sy, 0, 'pg-ac-fc01');
            out.syOwn = etaLinkBarrier(sy, 0, 'pg-fcs-roll');
            out.syLinked = tree(sy).barriers[0].linkedPageId;
            // a link from before the rule: kept, shown at another level, and still taken
            tree(sy).barriers[0].linkedPageId = 'pg-ac-fc01';
            const kept = SLEtaUI.headingOptions(sy, 'pg-ac-fc01');
            out.kept = kept[kept.length - 1];
            out.keptAgain = etaLinkBarrier(sy, 0, 'pg-ac-fc01');
            H.openDiagrams('pssa'); await wait(300); switchTab('eta'); await wait(400); SLEtaUI.select(sy); await wait(500);
            const sel2 = document.querySelector('select[aria-label="Fault tree that implements heading 1"]');
            out.keptDom = sel2 ? { value: sel2.value, text: sel2.options[sel2.selectedIndex] && sel2.options[sel2.selectedIndex].textContent } : null;

            // ---- the aircraft's bow-tie
            H._setCur({ home: 'pasa' }); await wait(50);
            const bt = { id: 'BT-LINKS', name: 'Links test bow-tie', ftaPageId: '', etaId: '', barriers: [], diagram: { v: 1, elements: [], links: [], pos: {} } };
            H.stamp(bt, AC); projectConfig.bowties = projectConfig.bowties || []; projectConfig.bowties.push(bt);
            btSelect('BT-LINKS'); await wait(100);
            out.btValues = SLBowtieUI.topOptions().slice(1).map(o => o.value);
            out.btWant = idsAt(AC);
            btSetFta('pg-fcs-pitch'); out.btAfterSys = bt.ftaPageId;
            btSetFta('pg-ac-fc01'); out.btAfterAc = bt.ftaPageId;
            return out;
        });
        const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
        check('the sample has trees at the aircraft, at systems and at the FCS', R.counts.ac > 0 && R.counts.sys > 0 && R.counts.fcs > 0, JSON.stringify(R.counts));
        check('[L1] an aircraft event tree\'s heading offers the aircraft\'s trees, then every system\'s trees', same(R.acValues, R.acWant), JSON.stringify([R.acValues, R.acWant]));
        check('[L1] each system\'s tree is named with its system first; the aircraft\'s by their own name', R.acLabelsOk);
        check('[L1] the heading picker under the drawing offers the same', same(R.acDom, R.acWant), JSON.stringify(R.acDom));
        check('[L1] a heading of an aircraft event tree links a system\'s tree, and the event tree stays the aircraft\'s', R.acLink.ok && R.acAfter.linked === 'pg-fcs-pitch' && R.acAfter.level === 'aircraft' && R.acAfter.inAc && !R.acAfter.inFcs, JSON.stringify([R.acLink, R.acAfter]));
        check('[L1] an event tree with no level of its own, linking a system\'s tree, stays where it is worked on (the aircraft)', R.oldLink.ok && R.oldAfter.level === 'aircraft' && R.oldAfter.inAc && !R.oldAfter.inEps, JSON.stringify([R.oldLink, R.oldAfter]));
        check('[L2] a system\'s event tree offers only its own system\'s trees', same(R.syValues, R.syWant), JSON.stringify([R.syValues, R.syWant]));
        check('[L2] a system\'s event tree refuses another system\'s tree and the aircraft\'s, and takes its own', !R.syOther.ok && !R.syAc.ok && R.syOwn.ok && R.syLinked === 'pg-fcs-roll', JSON.stringify([R.syOther, R.syAc, R.syOwn, R.syLinked]));
        check('[L3] an aircraft bow-tie\'s top event offers only the aircraft\'s trees', same(R.btValues, R.btWant), JSON.stringify([R.btValues, R.btWant]));
        check('[L3] an aircraft bow-tie\'s top event refuses a system\'s tree and takes the aircraft\'s', R.btAfterSys === '' && R.btAfterAc === 'pg-ac-fc01', JSON.stringify([R.btAfterSys, R.btAfterAc]));
        check('[L4] a link from before that the rule no longer offers is kept, shown "(at another level)", and still taken', R.kept && R.kept.value === 'pg-ac-fc01' && /\(at another level\)$/.test(R.kept.label) && R.keptAgain.ok && R.keptDom && R.keptDom.value === 'pg-ac-fc01' && /at another level/.test(R.keptDom.text), JSON.stringify([R.kept, R.keptAgain, R.keptDom]));
        check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
    } finally { await browser.close(); srv.close(); }
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });

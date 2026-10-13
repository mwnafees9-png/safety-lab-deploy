#!/usr/bin/env node
/*
 * tools/diagram_editor/eta_bowtie_browser_check.js - 13 Oct 2026 (v1.0)
 * Drives the hand-built EVENT TREE (site/event_trees.js v2.0) and BOW-TIE (site/bowtie.js v3.0)
 * in the REAL app (site/index.html) in Chromium, on the Aeolus HL-1 showcase, with real mouse and
 * keyboard input: old project data opens unchanged; an event tree drawn from a blank canvas
 * (headings dragged from the toolbox, renamed by double-click, probabilities typed in the
 * properties panel, an extra outcome, a heading that does not apply, an early end, a transfer,
 * an end state assessed and linked); undo and redo; a bow-tie drawn by hand (hazard, top event,
 * threat, barriers, consequence, escalation factor and its barrier, pathways drawn with the
 * connector tools); a bow-tie auto-built from the fault tree and then edited; the left side
 * generated from a fault tree and the right side from an event tree; full screen; SVG export;
 * SysML v2 export of both; the change acknowledgement (Acknowledge and Cancel change); a large
 * event tree (13 headings, 8,192 sequences) drawn and edited within an interactive budget.
 * Usage: node tools/diagram_editor/eta_bowtie_browser_check.js   (exit 1 on any FAIL; SKIP without a browser)
 */
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const ROOT = path.resolve(__dirname, '..', '..');
let chromium;
try { chromium = require('playwright').chromium; } catch (e) {
    try { chromium = require('/opt/npm-tools/node_modules/playwright').chromium; } catch (_) { console.log('  SKIP  playwright is not installed; browser checks not run'); process.exit(0); }
}
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' - ' + d : '')); } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.sysml': 'text/plain' };
function serve() {
    return http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
        const f = path.join(ROOT, 'site', p);
        if (!f.startsWith(path.join(ROOT, 'site')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
}

let __page = null;
(async () => {
    const server = serve(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    let browser;
    try { browser = await chromium.launch(); }
    catch (e) { console.log('  SKIP  no Chromium available (' + String(e.message).split('\n')[0] + ')'); server.close(); process.exit(0); }
    const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
    __page = page;
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.goto('http://127.0.0.1:' + server.address().port + '/');
    await page.waitForFunction(() => typeof window.loadHL1Demo === 'function' && window.SLDiagramEditor && window.SLEta && window.SLBowtie, null, { timeout: 30000 });
    const E = (fn, arg) => page.evaluate(fn, arg);
    const wait = ms => page.waitForTimeout(ms || 80);
    // the sign-in gate is not what this check is about: take it down (no credentials involved)
    await E(async () => {
        const ung = () => { document.querySelectorAll('[aria-label="Sign in to Safety Lab Aero"]').forEach(g => g.remove()); document.documentElement.classList.remove('sl-auth-gate-blocked');
            const t = document.getElementById('signup-modal-title'); if (t) { let o = t; while (o && o.parentElement && o.parentElement !== document.body) o = o.parentElement; if (o) o.style.display = 'none'; }
            document.querySelectorAll('.modal-overlay, .modal').forEach(o => { if (getComputedStyle(o).display !== 'none' && !o.closest('.sde') && !o.classList.contains('sl-ack-overlay') && !o.classList.contains('sl-dialog-overlay')) o.style.display = 'none'; }); };
        ung(); window.__ung = ung;
        await loadHL1Demo(); await new Promise(r => setTimeout(r, 1500)); ung();
        try { PROGRAM_PLAN.setLane('bowtie', true); PROGRAM_PLAN.setLane('eta', true); } catch (e) {}
        document.querySelectorAll('.sl-ack-overlay').forEach(o => { const k = o.querySelector('.sl-ack-keep'); if (k) k.click(); });
    });
    // the change acknowledgement: answer it (Acknowledge by default) and say whether it asked
    const ack = async (cancel) => {
        for (let i = 0; i < 30; i++) {
            const has = await E(() => !!document.querySelector('.sl-ack-overlay .sl-ack-keep'));
            if (has) { await page.locator('.sl-ack-overlay ' + (cancel ? '.sl-ack-cancel' : '.sl-ack-keep')).click(); await wait(150); return true; }
            await wait(100);
        }
        return false;
    };
    const flushAcks = async () => { await wait(600); while (await E(() => !!document.querySelector('.sl-ack-overlay .sl-ack-keep'))) { await page.locator('.sl-ack-overlay .sl-ack-keep').click(); await wait(200); } };
    const dialog = async (text) => { await page.waitForSelector('#sl-dialog-input', { timeout: 5000 }); await page.fill('#sl-dialog-input', text); await page.click('.sl-dialog-ok'); await wait(300); };
    const at = (sel, id, fx, fy) => E(([sel, id, fx, fy]) => { const ed = sel === 'eta' ? SLEtaUI.editor() : SLBowtieUI.editor(); const e = ed.model().elements.find(x => x.id === id); ed.root.scrollIntoView({ block: 'start' }); const r = ed.root.querySelector('.sde-canvas').getBoundingClientRect(); const k0 = ed.getView().k; ed.setView({ x: r.width * 0.4 - (e.x + e.w / 2) * k0, y: r.height * 0.4 - (e.y + e.h / 2) * k0, k: k0 }); ed.render(); const v = ed.getView(); return { x: r.left + v.x + (e.x + e.w * (fx == null ? 0.5 : fx)) * v.k, y: r.top + v.y + (e.y + e.h * (fy == null ? 0.5 : fy)) * v.k }; }, [sel, id, fx, fy]);
    const shot = async (name, sel) => { if (!process.env.SL_SHOTS) return; await E(s => { const ed = s === 'eta' ? SLEtaUI.editor() : SLBowtieUI.editor(); ed.root.scrollIntoView({ block: 'start' }); ed.select([]); ed.fit(); ed.render(); }, sel); await wait(200); const b = await page.locator(sel === 'eta' ? '#eta-canvas .sde' : '#bt-editor .sde').boundingBox(); await page.screenshot({ path: path.join(process.env.SL_SHOTS, name + '.png'), clip: b }); };
    const dragTool = async (rootSel, kind, x, y) => {
        const t = await page.locator(rootSel + ' .sde-tool[data-tool="el"][data-kind="' + kind + '"]').boundingBox();
        await page.mouse.move(t.x + 20, t.y + 10); await page.mouse.down();
        await page.mouse.move(x, y, { steps: 10 }); await page.mouse.up(); await wait(150);
    };

    // ======================================================== EVENT TREE
    console.log('\n[event tree] old project data opens unchanged');
    const et0 = await E(() => JSON.stringify(projectConfig.eventTrees));
    await E(() => { switchTab('eta'); }); await wait(600);
    check('the Event Trees page mounts the one diagram editor (IEC 62502 notation)', await E(() => !!document.querySelector('#eta-canvas .sde[data-diagram="event-tree"]')));
    check('HL-1 ET-001 is drawn: 4 headings, 16 end states, the initiating event', await E(() => { const m = SLEtaUI.editor().model(); return m.elements.filter(e => e.kind === 'heading').length === 4 && m.elements.filter(e => e.kind === 'end').length === 16 && m.elements.filter(e => e.kind === 'init').length === 1; }));
    check('opening it wrote nothing: the stored event trees are byte-identical', await E(() => JSON.stringify(projectConfig.eventTrees)) === et0);
    check('the toolbox lists the event tree tools and nothing else', await E(() => JSON.stringify(Array.from(SLEtaUI.editor().root.querySelectorAll('.sde-tool')).map(b => b.getAttribute('data-kind')))) === JSON.stringify(['heading', 'stamp-outcome', 'stamp-skip', 'stamp-end', 'stamp-transfer']));
    check('the sequence table and the CSV export button are still on the page', await E(() => /Export CSV/.test(document.getElementById('eta-host').textContent) && document.querySelectorAll('#eta-side table').length >= 2));

    console.log('\n[event tree] drawn from a blank canvas');
    await flushAcks();
    await page.click('#eta-host button:has-text("New event tree")');
    await dialog('Loss of cabin pressure');
    const etId = await E(() => projectConfig.eventTrees[projectConfig.eventTrees.length - 1].id);
    check('New event tree creates a blank tree with only a name, and shows it', await E(id => { const t = projectConfig.eventTrees.find(x => x.id === id); return t && t.barriers.length === 0 && t.initiator.desc === '' && SLEtaUI.editor().opts.etaTreeId === id; }, etId), etId);
    await flushAcks();
    const etaRoot = '#eta-canvas';
    // name the initiating event by double-click
    let p = await at('eta', 'INIT', 0.4, 0.15);
    await page.mouse.dblclick(p.x, p.y); await wait(100);
    await page.keyboard.type('Cabin pressure lost at cruise'); await page.keyboard.press('Enter'); await ack();
    check('double-click renames the initiating event', await E(id => projectConfig.eventTrees.find(x => x.id === id).initiator.desc === 'Cabin pressure lost at cruise', etId));
    // the frequency, typed in the properties panel
    await page.fill(etaRoot + ' .sde-props input[data-key="props.freq"]', '2e-5'); await page.keyboard.press('Tab'); await ack();
    check('the initiating event frequency is typed in the properties panel', await E(id => projectConfig.eventTrees.find(x => x.id === id).initiator.freq === 2e-5, etId));
    // two headings dragged from the toolbox
    const cv = await page.locator(etaRoot + ' .sde-canvas').boundingBox();
    p = await at('eta', 'INIT', 1, 0.2);
    await dragTool(etaRoot, 'heading', p.x + 60, cv.y + 60); await ack();
    let m = await E(() => SLEtaUI.editor().model());
    check('dragging Heading from the toolbox adds a column, with a success and a failure branch', m.elements.filter(e => e.kind === 'heading').length === 1 && m.elements.filter(e => e.kind === 'end').length === 2 && m.elements.filter(e => e.kind === 'node').length === 1);
    const h1 = m.elements.find(e => e.kind === 'heading').id;
    p = await at('eta', h1, 1, 0.5);
    await dragTool(etaRoot, 'heading', p.x + 120, p.y); await ack();
    m = await E(() => SLEtaUI.editor().model());
    const hs = m.elements.filter(e => e.kind === 'heading').sort((a, b) => a.x - b.x).map(e => e.id);
    check('a second heading to the right doubles the sequences (4 end states)', hs.length === 2 && hs[0] === h1 && m.elements.filter(e => e.kind === 'end').length === 4);
    // rename and quantify both headings
    for (const [i, name, pf] of [[0, 'Pressure controller holds cabin altitude', '1e-3'], [1, 'Crew dons oxygen masks', '1e-2']]) {
        p = await at('eta', hs[i], 0.5, 0.45);
        await page.mouse.dblclick(p.x, p.y); await wait(100);
        await page.keyboard.press('Control+A'); await page.keyboard.type(name); await page.keyboard.press('Enter'); await ack();
        await page.fill(etaRoot + ' .sde-props input[data-key="props.pFail"]', pf); await page.keyboard.press('Tab'); await ack();
    }
    let t = await E(id => projectConfig.eventTrees.find(x => x.id === id), etId);
    check('headings are named and quantified by hand (stored as barriers, with stable ids)', t.barriers.length === 2 && t.barriers[0].name === 'Pressure controller holds cabin altitude' && t.barriers[0].pFail === 1e-3 && t.barriers[1].pFail === 1e-2 && !!t.barriers[0].id, JSON.stringify(t.barriers));
    let ev = await E(id => { const r = etaEvaluate(id); return { n: r.outcomes.length, sum: r.sum, f: r.freq }; }, etId);
    check('the tree quantifies: 4 sequences, Σp = 1, frequency from the initiating event', ev.n === 4 && Math.abs(ev.sum - 1) < 1e-12 && ev.f === 2e-5, JSON.stringify(ev));
    // an extra outcome on heading 2 (partial success)
    p = await at('eta', hs[1], 0.5, 0.5);
    await dragTool(etaRoot, 'stamp-outcome', p.x, p.y); await ack();
    t = await E(id => projectConfig.eventTrees.find(x => x.id === id), etId);
    check('"Extra outcome" dropped on a heading makes it a three-outcome heading (success, partial, failure)', (t.barriers[1].branches || []).length === 3 && t.barriers[1].branches[1].label === 'Partial success' && t.barriers[1].branches[2].p === 1e-2, JSON.stringify(t.barriers[1]));
    check('the properties panel lists the three outcomes with their probabilities', await E(() => SLEtaUI.editor().root.querySelectorAll('.sde-props input[aria-label^="Outcome"][aria-label$="probability"]').length === 3));
    // split the success probability: partial 0.02, success 0.97
    await page.fill(etaRoot + ' .sde-props input[aria-label="Outcome 2 probability"]', '0.02'); await page.keyboard.press('Tab'); await ack();
    await page.fill(etaRoot + ' .sde-props input[aria-label="Outcome 1 probability"]', '0.97'); await page.keyboard.press('Tab'); await ack();
    ev = await E(id => { const r = etaEvaluate(id); return { n: r.outcomes.length, sum: r.sum, keys: r.outcomes.map(o => o.key + ':' + o.prob) }; }, etId);
    check('the multi-outcome heading quantifies: 6 sequences and Σp = 1', ev.n === 6 && Math.abs(ev.sum - 1) < 1e-12, JSON.stringify(ev));
    // heading 2 does not apply after heading 1 succeeds
    m = await E(() => SLEtaUI.editor().model());
    const nd = m.elements.find(e => e.kind === 'node' && e.props.prefix === '0');
    p = await at('eta', nd.id, 0.1, nd.props._yin / nd.h);
    await dragTool(etaRoot, 'stamp-skip', p.x + 10, p.y); await ack();
    t = await E(id => projectConfig.eventTrees.find(x => x.id === id), etId);
    ev = await E(id => { const r = etaEvaluate(id); return { n: r.outcomes.length, sum: r.sum, keys: r.outcomes.map(o => o.key) }; }, etId);
    check('"Does not apply" dropped on a branch point: that sequence passes straight through (4 sequences, Σp = 1)', JSON.stringify(t.nodeRules) === '{"0":"skip"}' && ev.n === 4 && Math.abs(ev.sum - 1) < 1e-12 && ev.keys.indexOf('-0') >= 0, JSON.stringify([t.nodeRules, ev]));
    // the branch point's own panel can put it back
    check('the skipped branch point is selected and its panel offers the three choices', await E(() => { const s = SLEtaUI.editor().selection(); const sel = SLEtaUI.editor().root.querySelector('.sde-props select[data-key="props.rule"]'); return s.length === 1 && !!sel && sel.options.length === 3 && sel.value === 'skip'; }));
    await shot('eta_handbuilt_multi_skip', 'eta');
    // undo / redo with the keyboard
    await page.locator(etaRoot + ' .sde-canvas').focus();
    await page.keyboard.press('Control+z'); await ack();
    ev = await E(id => etaEvaluate(id).outcomes.length, etId);
    check('Ctrl+Z undoes the skip (6 sequences again)', ev === 6 && await E(id => !projectConfig.eventTrees.find(x => x.id === id).nodeRules, etId), ev);
    await page.keyboard.press('Control+Shift+z'); await ack();
    check('Ctrl+Shift+Z redoes it', await E(id => etaEvaluate(id).outcomes.length === 4, etId));
    // assess an end state, link it to a failure condition, transfer another one
    m = await E(() => SLEtaUI.editor().model());
    const worst = m.elements.find(e => e.kind === 'end' && e.props.key === '21');
    p = await at('eta', worst.id, 0.6, 0.5);
    await page.mouse.click(p.x, p.y); await wait(100);
    await page.selectOption(etaRoot + ' .sde-props select[data-key="props.severity"]', 'Catastrophic'); await ack();
    await page.selectOption(etaRoot + ' .sde-props select[data-key="props.linkedFcId"]', 'FC-23'); await ack();
    await page.fill(etaRoot + ' .sde-props input[data-key="props.category"]', 'Occupants'); await page.keyboard.press('Tab'); await ack();
    t = await E(id => projectConfig.eventTrees.find(x => x.id === id), etId);
    check('an end state is assessed, categorized and linked to a failure condition in the panel', t.consequences['21'] && t.consequences['21'].severity === 'Catastrophic' && t.consequences['21'].linkedFcId === 'FC-23' && t.consequences['21'].category === 'Occupants' && !!t.consequences['21'].at, JSON.stringify(t.consequences));
    const partial = m.elements.find(e => e.kind === 'end' && e.props.key === '11');
    p = await at('eta', partial.id, 0.5, 0.5);
    await dragTool(etaRoot, 'stamp-transfer', p.x, p.y); await ack();
    t = await E(id => projectConfig.eventTrees.find(x => x.id === id), etId);
    check('"Transfer" dropped on an end state sends that sequence to another event tree', t.consequences['11'] && t.consequences['11'].transferTo === 'ET-001', JSON.stringify(t.consequences));
    check('the transfer is drawn (triangle) and the end state names its target', await E(([id]) => /Transfer to ET-001/.test(SLEtaUI.editor().root.querySelector('.sde-el[data-id="' + id + '"]').textContent), [partial.id]));
    // links: heading quantified by a fault tree page
    p = await at('eta', hs[0], 0.5, 0.5);
    await page.mouse.click(p.x, p.y); await wait(100);
    await page.selectOption(etaRoot + ' .sde-props select[data-key="props.linkedPageId"]', 'pg-nzd-indication'); await ack();
    t = await E(id => projectConfig.eventTrees.find(x => x.id === id), etId);
    check('a heading links to the fault tree page that quantifies it (linkedPageId)', t.barriers[0].linkedPageId === 'pg-nzd-indication');
    check('its panel shows the linked tree P(top) for review only', await E(() => /Linked fault tree P\(top\)/.test(SLEtaUI.editor().root.querySelector('.sde-props').textContent)));
    // end the sequence early: heading 2 not reached after heading 1 fails
    m = await E(() => SLEtaUI.editor().model());
    const nd1 = m.elements.find(e => e.kind === 'node' && e.props.prefix === '1');
    p = await at('eta', nd1.id, 0.1, nd1.props._yin / nd1.h);
    await dragTool(etaRoot, 'stamp-end', p.x + 10, p.y); await ack();
    t = await E(id => projectConfig.eventTrees.find(x => x.id === id), etId);
    ev = await E(id => { const r = etaEvaluate(id); return { n: r.outcomes.length, sum: r.sum }; }, etId);
    check('"End sequence here": the sequence ends before the later heading (2 sequences, Σp = 1); calls on the removed sequences go with them', t.nodeRules['1'] === 'end' && ev.n === 2 && Math.abs(ev.sum - 1) < 1e-12 && !t.consequences['21'], JSON.stringify([t.nodeRules, ev, Object.keys(t.consequences)]));
    await page.locator(etaRoot + ' .sde-canvas').focus(); await page.keyboard.press('Control+z'); await ack();
    check('and Undo brings the sequence and its assessment back', await E(id => { const t = projectConfig.eventTrees.find(x => x.id === id); return !(t.nodeRules || {})['1'] && t.consequences['21'] && t.consequences['21'].severity === 'Catastrophic'; }, etId));
    // from the keyboard: select a branch point, then Enter on a tool applies it there
    m = await E(() => SLEtaUI.editor().model());
    const ndk = m.elements.find(e => e.kind === 'node' && e.props.prefix === '1');
    p = await at('eta', ndk.id, 0.1, ndk.props._yin / ndk.h);
    await page.mouse.click(p.x + 10, p.y); await wait(100);
    await page.locator(etaRoot + ' .sde-tool[data-kind="stamp-end"]').focus(); await page.keyboard.press('Enter'); await ack();
    check('keyboard: select a branch point, then Enter on "End sequence here" ends that sequence', await E(id => (projectConfig.eventTrees.find(x => x.id === id).nodeRules || {})['1'] === 'end', etId));
    await page.locator(etaRoot + ' .sde-canvas').focus(); await page.keyboard.press('Control+z'); await ack();
    // the heading panel: Move right swaps the columns and the assessments follow their sequences
    p = await at('eta', hs[0], 0.5, 0.5);
    await page.mouse.click(p.x, p.y); await wait(100);
    await page.click(etaRoot + ' .sde-props button:has-text("Move right")'); await ack();
    t = await E(id => projectConfig.eventTrees.find(x => x.id === id), etId);
    check('"Move right" in the heading panel swaps the two columns; the Catastrophic assessment follows its sequence (21 becomes 12)', t.barriers[1].name === 'Pressure controller holds cabin altitude' && t.consequences['12'] && t.consequences['12'].severity === 'Catastrophic' && !t.consequences['21'], JSON.stringify([t.barriers.map(b => b.name), Object.keys(t.consequences)]));
    await page.locator(etaRoot + ' .sde-canvas').focus(); await page.keyboard.press('Control+z'); await ack();
    check('and Undo puts the columns back', await E(id => { const t = projectConfig.eventTrees.find(x => x.id === id); return t.barriers[0].name === 'Pressure controller holds cabin altitude' && t.consequences['21'] && t.consequences['21'].severity === 'Catastrophic'; }, etId));
    // a refused gesture: a stamp dropped on empty canvas
    const before = await E(id => JSON.stringify(projectConfig.eventTrees.find(x => x.id === id)), etId);
    await dragTool(etaRoot, 'stamp-skip', cv.x + cv.width - 60, cv.y + 30); await wait(300);
    check('a tool dropped where it means nothing is refused in plain words and changes nothing', await E(([id, b]) => JSON.stringify(projectConfig.eventTrees.find(x => x.id === id)) === b, [etId, before]));
    // the change acknowledgement Cancel path
    p = await at('eta', hs[1], 0.5, 0.5);
    await page.mouse.click(p.x, p.y); await wait(100);
    await page.fill(etaRoot + ' .sde-props textarea[data-key="props.note"]', 'cancel me'); await page.keyboard.press('Tab');
    const asked = await ack(true); await wait(600);
    check('Cancel change in the acknowledgement puts the tree back, and the diagram follows', asked && await E(id => { const t = projectConfig.eventTrees.find(x => x.id === id); return t.barriers[1].note !== 'cancel me'; }, etId), asked);
    // fullscreen, export
    await page.click(etaRoot + ' .sde-btn[data-act="fullscreen"]'); await wait(150);
    const fsOn = await E(() => SLEtaUI.editor().isFullscreen() && SLEtaUI.editor().root.getBoundingClientRect().width >= window.innerWidth - 2);
    await E(() => SLEtaUI.editor().select([])); await page.locator(etaRoot + ' .sde-canvas').focus();
    await page.keyboard.press('Escape'); await wait(150);
    const fsOff = await E(() => !SLEtaUI.editor().isFullscreen());
    check('Full screen fills the window; Esc leaves it', fsOn && fsOff, JSON.stringify([fsOn, fsOff]));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click(etaRoot + ' .sde-btn[data-act="custom-0"]')]);
    let svgText = ''; if (dl) { const fp = await dl.path(); svgText = fs.readFileSync(fp, 'utf8'); }
    check('Export image downloads the whole tree as SVG', !!dl && /^<svg/.test(svgText) && /Pressure controller/.test(svgText) && /Cabin pressure lost at/.test(svgText), dl ? svgText.slice(0, 80) : 'no download');
    const sx = await E(() => { const r = SLSysML.exportProject({ area: 'eta' }); return r.modelText; });
    check('SysML v2 export carries the hand-built tree: outcomes, branch rules, transfer, end state category', /SafetyLab::EventTreeHeading/.test(sx) && /:>> outcomes = /.test(sx) && /#TransfersTo dependency/.test(sx) && /:>> consequenceCategory = "Occupants"/.test(sx) && /:>> sequenceRules = /.test(sx), sx.length);
    check('the event tree page re-renders the REG data source with end states (report section kept)', await E(() => { const d = window.Reports && Reports.extractData ? Reports.extractData('REG') : null; return !d || (Array.isArray(d.reg_eta) && d.reg_eta.some(r => r.Tree && r['End state'] !== undefined)); }));
    check('the stored HL-1 tree ET-001 is still byte-identical after all of this', await E(() => JSON.stringify(projectConfig.eventTrees.find(t => t.id === 'ET-001'))) === JSON.stringify(JSON.parse(et0).find(t => t.id === 'ET-001')));

    console.log('\n[event tree] a large tree stays interactive (only what is on screen is drawn)');
    const big = await E(async () => {
        const bars = []; for (let i = 0; i < 13; i++) bars.push({ name: 'Heading ' + (i + 1), pFail: 0.001 * (i + 1) });
        projectConfig.eventTrees.push({ id: 'ET-BIG', name: 'Large', initiator: { desc: 'Big', freq: 1e-4 }, barriers: bars, consequences: {} });
        const t0 = performance.now(); SLEtaUI.select('ET-BIG'); const t1 = performance.now();
        const ed = SLEtaUI.editor(); const m = ed.model();
        const dom = ed.root.querySelectorAll('.sde-el').length;
        return { open: Math.round(t1 - t0), ends: m.elements.filter(e => e.kind === 'end').length, dom };
    });
    check('13 headings (8,192 sequences) open in the editor: every end state in the model, a few in the page', big.ends === 8192 && big.dom < 600, JSON.stringify(big));
    check('opening it takes under 4 s', big.open < 4000, big.open + ' ms');
    const tEdit = await E(async () => { const ed = SLEtaUI.editor(); const e = ed.model().elements.find(x => x.kind === 'end'); const t0 = performance.now(); await ed.change('Assess', tx => tx.updateElement(e.id, { props: { severity: 'Minor' } })); return Math.round(performance.now() - t0); });
    await ack();
    check('an edit on it completes under 3 s', tEdit < 3000, tEdit + ' ms');
    await E(() => { projectConfig.eventTrees = projectConfig.eventTrees.filter(t => t.id !== 'ET-BIG'); SLEtaUI.select('ET-001'); });
    await flushAcks();

    // ======================================================== BOW-TIE
    console.log('\n[bow-tie] old project data opens unchanged');
    const bt0 = await E(() => JSON.stringify(projectConfig.bowties));
    const ev0 = await E(() => JSON.stringify(bowtieEvaluate(projectConfig.bowties[0]).findings.map(f => f.text)));
    await E(() => { switchTab('bowtie'); }); await wait(600);
    check('the Bow-Tie page mounts the one diagram editor (CCPS / Energy Institute notation)', await E(() => !!document.querySelector('#bt-editor .sde[data-diagram="bowtie"]')));
    check('HL-1 BT-001 is drawn from its links: top event, 2 threats, 3 consequences, 6 barriers, pathways', await E(() => { const m = SLBowtieUI.editor().model(); const k = x => m.elements.filter(e => e.kind === x).length; return k('top') === 1 && k('threat') === 2 && k('consequence') === 3 && k('preventive') + k('mitigative') === 6 && m.connectors.length >= 8; }));
    check('opening it wrote nothing: the stored bow-ties are byte-identical', await E(() => JSON.stringify(projectConfig.bowties)) === bt0);
    check('its findings are the same as before (common cause through the event tree, the untraced barrier)', await E(() => JSON.stringify(bowtieEvaluate(projectConfig.bowties[0]).findings.map(f => f.text))) === ev0 && /common cause/i.test(await E(() => document.getElementById('bt-side').textContent)));
    check('the common-cause barriers are ringed red on the diagram', await E(() => SLBowtieUI.editor().model().elements.filter(e => e.props && e.props._cc).length === 2));
    check('the toolbox lists the bow-tie symbols and pathways', await E(() => JSON.stringify(Array.from(SLBowtieUI.editor().root.querySelectorAll('.sde-tool')).map(b => b.getAttribute('data-kind')))) === JSON.stringify(['hazard', 'top', 'threat', 'preventive', 'consequence', 'mitigative', 'escalation', 'efbarrier', 'path', 'escalation', 'release']));

    console.log('\n[bow-tie] drawn completely by hand');
    await flushAcks();
    await page.click('#view-bowtie button:has-text("New bow-tie")');
    await dialog('Cabin depressurization');
    const btId = await E(() => projectConfig.bowties[projectConfig.bowties.length - 1].id);
    check('New bow-tie starts an empty drawing', await E(id => { const b = projectConfig.bowties.find(x => x.id === id); return b && b.diagram && b.diagram.elements.length === 0 && SLBowtieUI.editor().model().elements.length === 0; }, btId));
    await flushAcks();
    const btRoot = '#bt-editor';
    await E(() => { const ed = SLBowtieUI.editor(); ed.root.scrollIntoView({ block: 'start' }); ed.setView({ x: 0, y: 0, k: 1 }); });
    const place = async (kind, fx, fy, name) => {
        await E(() => { const ed = SLBowtieUI.editor(); ed.root.scrollIntoView({ block: 'start' }); ed.setView({ x: 0, y: 0, k: 1 }); ed.render(); });
        const bcv = await page.locator(btRoot + ' .sde-canvas').boundingBox();
        await dragTool(btRoot, kind, bcv.x + bcv.width * fx, bcv.y + bcv.height * fy); await ack();
        const id = await E(k => { const s = SLBowtieUI.editor().selection(); return s[0]; }, kind);
        const q = await at('bt', id, 0.5, 0.45);
        await page.mouse.dblclick(q.x, q.y); await wait(100); await page.keyboard.press('Control+A'); await page.keyboard.type(name); await page.keyboard.press('Enter'); await ack();
        return id;
    };
    const hz = await place('hazard', 0.5, 0.12, 'Pressurized fuselage');
    const top = await place('top', 0.5, 0.45, 'Loss of cabin pressure');
    const th = await place('threat', 0.1, 0.45, 'Door seal failure');
    const pb = await place('preventive', 0.3, 0.45, 'Seal inspection');
    const cq = await place('consequence', 0.9, 0.45, 'Hypoxia');
    const mb = await place('mitigative', 0.7, 0.45, 'Oxygen masks');
    const ef = await place('escalation', 0.3, 0.85, 'Inspection interval stretched');
    const eb = await place('efbarrier', 0.3, 0.68, 'Maintenance planning audit');
    let bm = await E(() => SLBowtieUI.editor().model());
    check('hazard, top event, threat, barriers, consequence, escalation factor and its barrier are placed and named', bm.elements.length === 8 && ['Pressurized fuselage', 'Loss of cabin pressure', 'Door seal failure', 'Seal inspection', 'Hypoxia', 'Oxygen masks', 'Inspection interval stretched', 'Maintenance planning audit'].every(n => bm.elements.some(e => e.label === n)), JSON.stringify(bm.elements.map(e => e.kind + ':' + e.label)));
    // pathways with the connector tools: click the tool, click start, click end
    const connect = async (kind, a, b) => {
        await page.click(btRoot + ' .sde-tool[data-tool="cn"][data-kind="' + kind + '"]'); await wait(60);
        let q = await at('bt', a); await page.mouse.click(q.x, q.y); await wait(60);
        q = await at('bt', b); await page.mouse.click(q.x, q.y); await wait(150); await ack();
        await page.keyboard.press('Escape');
    };
    await connect('path', th, pb); await connect('path', pb, top); await connect('path', top, mb); await connect('path', mb, cq);
    await connect('escalation', ef, eb); await connect('escalation', eb, pb); await connect('release', hz, top);
    bm = await E(() => SLBowtieUI.editor().model());
    check('pathways, the escalation chain and the hazard release are drawn with the connector tools', bm.connectors.length === 7 && bm.connectors.filter(c => c.kind === 'path').length === 4 && bm.connectors.filter(c => c.kind === 'escalation').length === 2, JSON.stringify(bm.connectors.map(c => c.kind)));
    // an illegal pathway is refused in plain words
    await page.click(btRoot + ' .sde-tool[data-tool="cn"][data-kind="path"]'); await wait(60);
    let q = await at('bt', cq); await page.mouse.click(q.x, q.y); await wait(60); q = await at('bt', th); await page.mouse.click(q.x, q.y); await wait(200); await page.keyboard.press('Escape');
    check('a pathway from a consequence back to a threat is refused', await E(() => SLBowtieUI.editor().model().connectors.length) === 7);
    await shot('bowtie_handdrawn', 'bt');
    // barrier properties
    q = await at('bt', pb); await page.mouse.click(q.x, q.y); await wait(100);
    await page.selectOption(btRoot + ' .sde-props select[data-key="props.barrierType"]', 'Active human'); await ack();
    await page.selectOption(btRoot + ' .sde-props select[data-key="props.effectiveness"]', 'Good'); await ack();
    await page.fill(btRoot + ' .sde-props input[data-key="props.owner"]', 'Line maintenance'); await page.keyboard.press('Tab'); await ack();
    await page.selectOption(btRoot + ' .sde-props select[data-key="props.traceKind"]', 'requirement'); await ack();
    await page.fill(btRoot + ' .sde-props input[data-key="props.requirementId"]', 'REQ-AC-009'); await page.keyboard.press('Tab'); await ack();
    let b = await E(id => projectConfig.bowties.find(x => x.id === id), btId);
    const sb = b.barriers.find(x => x.id === pb), efb = b.barriers.find(x => x.id === eb);
    check('barrier type, effectiveness, owner and requirement trace are set in the panel and stored on the barrier', sb && sb.side === 'preventive' && sb.barrierType === 'Active human' && sb.effectiveness === 'Good' && sb.owner === 'Line maintenance' && sb.requirementId === 'REQ-AC-009' && sb.trace.kind === 'requirement', JSON.stringify(sb));
    check('the escalation factor barrier is stored as a barrier with role "escalation" on the side of the barrier it defends', efb && efb.role === 'escalation' && efb.side === 'preventive', JSON.stringify(efb));
    check('the stored drawing keeps the hazard, top event, threat, consequence and escalation factor with positions', b.diagram.elements.length === 5 && b.diagram.elements.every(e => typeof e.x === 'number') && b.diagram.links.length === 7);
    let fk = await E(id => bowtieEvaluate(projectConfig.bowties.find(x => x.id === id)).findings.map(f => f.kind), btId);
    check('the CCPS structure checks pass on the complete hand-drawn bow-tie (no unprotected threat or consequence, the escalation factor has its barrier)', !fk.some(k => /threat-|consequence-|escalation-/.test(k)), JSON.stringify(fk));
    // delete the mitigative barrier: the consequence is now unmitigated (and Undo puts it back)
    q = await at('bt', mb); await page.mouse.click(q.x, q.y); await wait(80); await page.keyboard.press('Delete'); await ack();
    await connect('path', top, cq);
    fk = await E(id => bowtieEvaluate(projectConfig.bowties.find(x => x.id === id)).findings.map(f => f.kind), btId);
    check('a consequence reached with no mitigative barrier is a finding', fk.indexOf('consequence-unmitigated') >= 0, JSON.stringify(fk));
    await page.locator(btRoot + ' .sde-canvas').focus(); await page.keyboard.press('Control+z'); await ack(); await page.keyboard.press('Control+z'); await ack();
    check('Undo twice restores the barrier and its pathways', await E(([id, mb]) => { const b = projectConfig.bowties.find(x => x.id === id); return b.barriers.some(x => x.id === mb) && b.diagram.links.filter(l => l.from === mb || l.to === mb).length === 2; }, [btId, mb]));
    // model link: the threat is "about" an item of the architecture
    q = await at('bt', th); await page.mouse.click(q.x, q.y); await wait(80);
    await page.click(btRoot + ' .sde-props button[data-pact="link"]'); await wait(300);
    const picked = await E(() => { const o = document.querySelector('.sl-sysml-opt'); if (!o) return null; const r = o.getAttribute('data-ref'); o.click(); return r; });
    await ack();
    check('Link to model element opens the model picker and stores the SysML ref on the threat', !!picked && await E(([id, th, r]) => { const b = projectConfig.bowties.find(x => x.id === id); return b.diagram.elements.find(e => e.id === th).sysmlRef === r; }, [btId, th, picked]), picked);
    // generated sides on the hand-drawn bow-tie
    await page.click(btRoot + ' .sde-btn[data-act="custom-1"]'); await wait(200);
    await page.click('#bt-pick-modal button:has-text("ET-001")'); await ack();
    b = await E(id => projectConfig.bowties.find(x => x.id === id), btId);
    check('"Right side from event tree" adds the event tree headings as mitigative barriers and its end states as consequences, and links the event tree', b.etaId === 'ET-001' && b.barriers.filter(x => x.trace && x.trace.kind === 'eta').length === 4 && b.diagram.elements.filter(e => e.kind === 'consequence').length >= 3, JSON.stringify([b.etaId, b.barriers.length]));
    await page.click(btRoot + ' .sde-btn[data-act="custom-0"]'); await wait(200);
    await page.click('#bt-pick-modal button:has-text("FC-23")'); await ack();
    b = await E(id => projectConfig.bowties.find(x => x.id === id), btId);
    check('"Left side from fault tree" adds its threats and redundancy barriers and quantifies the top event', b.ftaPageId === 'pg-ac-fc23' && b.diagram.elements.filter(e => e.kind === 'threat').length === 3 && await E(id => bowtieEvaluate(projectConfig.bowties.find(x => x.id === id)).pCritical > 0, btId), JSON.stringify([b.ftaPageId, b.diagram.elements.length]));
    await shot('bowtie_handdrawn_plus_generated', 'bt');
    const genOk = await E(() => { const ed = SLBowtieUI.editor(); const x = ed.model().elements.find(e => e.kind === 'threat' && e.props.ftRef); return !!x; });
    check('generated elements are ordinary, editable shapes (a generated threat carries its fault tree node as its model link)', genOk);
    // fullscreen, export, SysML
    await page.click(btRoot + ' .sde-btn[data-act="fullscreen"]'); await wait(150);
    const fs1 = await E(() => SLBowtieUI.editor().isFullscreen()); await E(() => SLBowtieUI.editor().select([])); await page.locator(btRoot + ' .sde-canvas').focus(); await page.keyboard.press('Escape'); await wait(150);
    check('Full screen and Esc', fs1 && !(await E(() => SLBowtieUI.editor().isFullscreen())));
    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click(btRoot + ' .sde-btn[data-act="custom-2"]')]);
    let svg2 = ''; if (dl2) svg2 = fs.readFileSync(await dl2.path(), 'utf8');
    check('Export image downloads the whole bow-tie as SVG', !!dl2 && /^<svg/.test(svg2) && /Loss of cabin pressure/.test(svg2) && /HAZARD/.test(svg2));
    const sx2 = await E(() => SLSysML.exportProject({ area: 'bowtie' }).modelText);
    check('SysML v2 export carries the hand-drawn bow-tie: hazard, top event, threat, consequence, escalation factor, barriers with type and owner, pathways as connections', ['SafetyLab::BowTieHazard', 'SafetyLab::TopEvent', 'SafetyLab::Threat', 'SafetyLab::Consequence', 'SafetyLab::EscalationFactor', 'SafetyLab::BowTiePathway', 'SafetyLab::EscalationPathway', ':>> barrierType = "Active human"', ':>> barrierOwner = "Line maintenance"'].every(s => sx2.indexOf(s) >= 0), sx2.length);

    console.log('\n[bow-tie] auto-built, then edited by hand');
    await flushAcks();
    await page.click('#view-bowtie button:has-text("Auto-build from fault tree")'); await wait(200);
    await page.click('#bt-autobuild-modal button:has-text("FC-23")'); await wait(400); await flushAcks();
    const abId = await E(() => projectConfig.bowties[projectConfig.bowties.length - 1].id);
    b = await E(id => projectConfig.bowties.find(x => x.id === id), abId);
    check('auto-build makes a stored drawing at once (threats, barriers on their lines, consequences)', b && b.diagram && b.diagram.elements.some(e => e.kind === 'threat') && b.diagram.links.length > 0 && b.barriers.some(x => x.side === 'mitigative'), JSON.stringify(b && b.diagram && b.diagram.elements.map(e => e.kind)));
    const thr = await E(() => SLBowtieUI.editor().model().elements.find(e => e.kind === 'threat').id);
    q = await at('bt', thr, 0.5, 0.5); await page.mouse.dblclick(q.x, q.y); await wait(100); await page.keyboard.press('Control+A'); await page.keyboard.type('Latch not engaged before take-off'); await page.keyboard.press('Enter'); await ack();
    const m0 = await E(() => SLBowtieUI.editor().model().elements.find(e => e.kind === 'threat'));
    q = await at('bt', thr, 0.5, 0.5); await page.mouse.move(q.x, q.y); await page.mouse.down(); await page.mouse.move(q.x + 40, q.y + 60, { steps: 6 }); await page.mouse.up(); await ack();
    b = await E(id => projectConfig.bowties.find(x => x.id === id), abId);
    const moved = b.diagram.elements.find(e => e.id === thr);
    check('a generated threat is renamed and moved by hand, and the edit is stored', moved.name === 'Latch not engaged before take-off' && (moved.x !== m0.x || moved.y !== m0.y), JSON.stringify(moved));
    await page.click(btRoot + ' .sde-btn[data-act="layout"]'); await ack();
    await shot('bowtie_autobuilt_layout', 'bt');
    check('Auto layout puts every shape back in the standard bow-tie arrangement', await E(() => { const m = SLBowtieUI.editor().model(); const top = m.elements.find(e => e.kind === 'top'); return m.elements.filter(e => e.kind === 'threat').every(t => t.x + t.w < top.x) && m.elements.filter(e => e.kind === 'consequence').every(c => c.x > top.x + top.w); }));
    check('HL-1 BT-001 is still byte-identical after all of this', await E(() => JSON.stringify(projectConfig.bowties.find(b => b.id === 'BT-001'))) === JSON.stringify(JSON.parse(bt0).find(b => b.id === 'BT-001')));
    check('the Independence Principle ledger still sees the bow-tie common cause', await E(() => (window.btLedgerHits ? btLedgerHits() : []).some(h => h.btId === 'BT-001')));

    check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
    await browser.close(); server.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(async e => {
    console.log('  FAIL  browser check crashed: ' + (e && e.stack || e));
    if (process.env.SL_SHOT && __page) { try { await __page.screenshot({ path: process.env.SL_SHOT }); console.log(await __page.evaluate(() => JSON.stringify({ selE: window.SLEtaUI && SLEtaUI.editor() && SLEtaUI.editor().selection(), selB: window.SLBowtieUI && SLBowtieUI.editor() && SLBowtieUI.editor().selection() }))); } catch (_) {} }
    process.exit(1);
});

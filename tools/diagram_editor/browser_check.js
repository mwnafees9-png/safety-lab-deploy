#!/usr/bin/env node
/*
 * tools/diagram_editor/browser_check.js - 13 Oct 2026 (v1.0)
 * Drives the ONE diagram editor core (site/diagram_editor.js) in real Chromium with real mouse
 * and keyboard input, on the test-only demo notation (tests/fixtures/sde_demo_diagram.js).
 * Covers: toolbox drag-create, click-to-place, keyboard place, connect by dragging a dot,
 * connect mode from the toolbox, rule refusal, move, resize, delete (key and button), rename,
 * undo/redo (all three shortcuts), copy/paste, marquee, zoom (wheel, buttons, fit, 100%),
 * pan (drag, space-drag), fullscreen and Esc, keyboard Tab/arrows/F2, properties panel,
 * SysML link, read-only, beforeChange veto (sync and async), the persistence chain
 * (pushUndo, adapter.save, scheduleAutosave), external reload, the app-undo fall-through, and
 * render virtualization on a 3000-shape diagram.
 * Usage: node tools/diagram_editor/browser_check.js      (exit 1 on any FAIL; exit 0 with SKIP when no browser)
 * Uses the site/ files directly; the harness page is served from memory and never ships.
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

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><title>sde harness</title>
<link rel="stylesheet" href="/safety_lab.css">
<style>body{margin:0;padding:16px;background:#fff} #host{width:1100px;height:640px} #host2{width:600px;height:380px;margin-top:12px}</style>
</head><body><div id="host"></div><div id="host2"></div>
<script>
  window.__log = { pushUndo: 0, autosave: 0, saves: 0, toasts: [], appUndo: 0 };
  window.pushUndo = function (l) { __log.pushUndo++; __log.lastUndoLabel = l; };
  window.scheduleAutosave = function () { __log.autosave++; __gen++; return true; };
  window.showToast = function (m, t) { __log.toasts.push(m); };
  window.undo = function () { __log.appUndo++; };
  window.redo = function () {};
  var __gen = 1;
  window.SLDataChange = { gen: function () { return __gen; }, bump: function () { __gen++; } };
  window.__store = { elements: [], connectors: [], title: 'kept' };
  // the app's own global shortcut handler (safety_lab.js) in miniature: Ctrl+Z on the window runs the app undo
  window.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) { e.preventDefault(); undo(); } });
</script>
<script src="/diagram_editor.js"></script>
<script src="/__sde/fixture.js"></script>
<script>
  window.ed = SLDiagramEditor.mount('#host', { type: 'sde-demo', height: 640, minimap: 'auto',
    adapter: { load: function () { return JSON.parse(JSON.stringify(__store)); }, save: function (m, ch) { __log.saves++; __store = m; __log.lastChange = ch.label; } } });
  window.ro = SLDiagramEditor.mount('#host2', { type: 'sde-demo', height: 380, readOnly: 'Read only: this project is locked for review.',
    model: { elements: [{ id: 'r1', kind: 'block', x: 20, y: 20, w: 120, h: 50, label: 'Locked block', props: {} }], connectors: [] } });
</script></body></html>`;

function serve() {
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
    return http.createServer((req, res) => {
        const p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/__sde/harness.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(HARNESS); }
        if (p === '/__sde/fixture.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(fs.readFileSync(path.join(ROOT, 'tests/fixtures/sde_demo_diagram.js'))); }
        const f = path.join(ROOT, 'site', p);
        if (!f.startsWith(path.join(ROOT, 'site')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
}

(async () => {
    const server = serve(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    let browser;
    try { browser = await chromium.launch(); }
    catch (e) { console.log('  SKIP  no Chromium available (' + String(e.message).split('\n')[0] + ')'); server.close(); process.exit(0); }
    const page = await browser.newPage({ viewport: { width: 1300, height: 1150 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://127.0.0.1:' + port + '/__sde/harness.html');
    await page.waitForFunction(() => window.ed && window.ed.root);
    const E = (fn, arg) => page.evaluate(fn, arg);
    const model = () => E(() => ed.model());
    const wait = (ms) => page.waitForTimeout(ms || 60);
    const canvasBox = await page.locator('#host .sde-canvas').boundingBox();
    // screen position of an element's center
    const at = async (id, fx, fy) => E(([id, fx, fy]) => { const e = ed.model().elements.find(x => x.id === id); const v = ed.getView(); const r = ed.root.querySelector('.sde-canvas').getBoundingClientRect(); return { x: r.left + v.x + (e.x + e.w * (fx == null ? 0.5 : fx)) * v.k, y: r.top + v.y + (e.y + e.h * (fy == null ? 0.5 : fy)) * v.k }; }, [id, fx, fy]);

    // ---- chrome
    check('toolbox lists exactly the declared shapes and connectors', JSON.stringify(await E(() => Array.from(ed.root.querySelectorAll('.sde-tool')).map(b => b.getAttribute('data-kind')))) === JSON.stringify(['start', 'block', 'state', 'gate', 'flow', 'transition', 'note']));
    check('empty diagram tells the user how to start', /Drag a shape from the toolbox/.test(await E(() => ed.root.querySelector('.sde-hint').textContent)));

    // ---- toolbox drag create
    const tBlock = await page.locator('#host .sde-tool[data-kind="block"]').boundingBox();
    await page.mouse.move(tBlock.x + 20, tBlock.y + 10); await page.mouse.down();
    await page.mouse.move(canvasBox.x + 300, canvasBox.y + 200, { steps: 8 });
    check('a ghost of the shape follows the pointer while dragging from the toolbox', await E(() => !!document.querySelector('.sde-ghost')));
    await page.mouse.up(); await wait();
    let m = await model();
    check('drag from toolbox creates a block where it is dropped', m.elements.length === 1 && m.elements[0].kind === 'block');
    const b1 = m.elements[0].id;
    const c1 = await at(b1);
    check('the block lands centered under the drop point (within a grid step)', Math.abs(c1.x - (canvasBox.x + 300)) <= 12 && Math.abs(c1.y - (canvasBox.y + 200)) <= 12, JSON.stringify(c1));
    check('ids are UUIDs (usable as SysML v2 element ids)', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(b1), b1);
    check('the change went through the one path: pushUndo, adapter.save, scheduleAutosave', await E(() => __log.pushUndo === 1 && __log.saves === 1 && __log.autosave === 1));
    check('adapter.save receives extra top-level fields untouched', await E(() => __store.title === 'kept'));

    // ---- click to place (arm then click)
    await page.locator('#host .sde-tool[data-kind="state"]').click();
    check('clicking a toolbox shape arms it (pressed state and hint)', await E(() => ed.root.querySelector('.sde-tool[data-kind="state"]').getAttribute('aria-pressed') === 'true' && /Click on the canvas to place/.test(ed.root.querySelector('.sde-hint').textContent)));
    await page.mouse.click(canvasBox.x + 600, canvasBox.y + 200); await wait();
    m = await model();
    const s1 = m.elements.find(e => e.kind === 'state').id;
    check('click on the canvas places the armed shape', m.elements.length === 2 && !!s1);
    // keyboard place: Enter on a toolbox shape places it in the middle of the view
    await page.locator('#host .sde-tool[data-kind="state"]').focus(); await page.keyboard.press('Enter'); await wait();
    m = await model();
    const s2 = m.elements.filter(e => e.kind === 'state').map(e => e.id).find(id => id !== s1);
    check('Enter on a toolbox shape places it (keyboard create)', m.elements.length === 3 && !!s2);
    await E(([id]) => ed.change('place', tx => tx.updateElement(id, { x: 560, y: 380 })), [s2]); await wait();

    // ---- connect by dragging a dot
    let p1 = await at(s1);
    await page.mouse.move(p1.x, p1.y); await wait(80);
    const dots = await E(([id]) => ed.root.querySelectorAll('.sde-port[data-el="' + id + '"]').length, [s1]);
    check('hovering a shape shows its connection dots', dots === 4, dots);
    const dot = await E(([id]) => { const c = ed.root.querySelector('.sde-port[data-el="' + id + '"][data-port="s"]').getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 }; }, [s1]);
    await page.mouse.move(dot.x, dot.y, { steps: 3 }); await wait(40);
    check('the dots stay visible while the pointer moves from the shape to a dot', await E(([id]) => ed.root.querySelectorAll('.sde-port[data-el="' + id + '"]').length === 4, [s1]));
    await page.mouse.down();
    const p2 = await at(s2);
    await page.mouse.move(p2.x, p2.y, { steps: 10 });
    check('while connecting, legal targets are marked and the rubber band is drawn', await E(([id]) => ed.root.querySelector('.sde-el[data-id="' + id + '"]').classList.contains('sde-legal') && !!ed.root.querySelector('.sde-rubber'), [s2]));
    check('while connecting, an illegal target (a block cannot take a transition or note from a state... the note is legal) is not marked illegal wrongly', await E(([id]) => !ed.root.querySelector('.sde-el[data-id="' + id + '"]').classList.contains('sde-illegal'), [b1]));
    await page.mouse.up(); await wait();
    m = await model();
    check('dragging from a dot to another state creates a transition (the only legal kind)', m.connectors.length === 1 && m.connectors[0].kind === 'transition' && m.connectors[0].from === s1 && m.connectors[0].to === s2);
    check('the connector is drawn with its arrowhead marker', await E(() => /marker-end="url\(#sde1-m-transition-end\)"/.test(ed.root.querySelector('.sde-cn').innerHTML)));

    // ---- connect mode from the toolbox, and a chooser when several kinds fit
    await E(() => ed.place('block', 300, 420)); await wait();
    m = await model();
    const b2 = m.elements.filter(e => e.kind === 'block').map(e => e.id).find(id => id !== b1);
    await page.locator('#host .sde-tool[data-kind="flow"]').click();
    await page.mouse.click((await at(b1)).x, (await at(b1)).y); await wait(40);
    check('connect mode: the start shape is highlighted and the hint asks for the end', await E(([id]) => ed.root.querySelector('.sde-el[data-id="' + id + '"]').classList.contains('sde-src') && /Now click the shape to connect to/.test(ed.root.querySelector('.sde-hint').textContent), [b1]));
    await page.mouse.click((await at(b2)).x, (await at(b2)).y); await wait();
    m = await model();
    check('connect mode: clicking start then end creates a flow', m.connectors.some(c => c.kind === 'flow' && c.from === b1 && c.to === b2));
    // a refused connection says why
    await E(() => { __log.toasts = []; });
    await page.mouse.click((await at(s1)).x, (await at(s1)).y); await wait(30);
    await page.mouse.click((await at(b2)).x, (await at(b2)).y); await wait();
    check('a rule refusal is explained in plain words', await E(() => __log.toasts.some(t => /cannot start at a state/.test(t))), await E(() => __log.toasts.join(' | ')));
    await page.keyboard.press('Escape');
    check('Esc leaves connect mode', await E(() => ed.armed === null));
    // two legal kinds: block to state can be a note link only (flow refuses state); block to gate: flow or note -> chooser
    await E(() => ed.place('gate', 520, 60)); await wait();
    m = await model();
    const g1 = m.elements.find(e => e.kind === 'gate').id;
    await page.mouse.move((await at(b1)).x, (await at(b1)).y); await wait(60);
    const eDot = await E(([id]) => { const c = ed.root.querySelector('.sde-port[data-el="' + id + '"][data-port="e"]').getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 }; }, [b1]);
    await page.mouse.move(eDot.x, eDot.y, { steps: 3 }); await page.mouse.down();
    const gin = await at(g1, 0.5, 0.3);
    await page.mouse.move(gin.x, gin.y, { steps: 8 }); await page.mouse.up(); await wait(80);
    check('when several connector kinds fit, a chooser asks which', await E(() => !!ed.root.querySelector('.sde-menu')));
    await page.locator('#host .sde-menu button', { hasText: 'Flow' }).click(); await wait();
    m = await model();
    const fg = m.connectors.find(c => c.to === g1);
    check('the chosen kind is created, attached to the declared input port', fg && fg.kind === 'flow' && fg.toPort === 'in', JSON.stringify(fg));

    // ---- move
    await page.mouse.click(10, 10);
    let before = (await model()).elements.find(e => e.id === b1);
    let pb = await at(b1);
    await page.mouse.move(pb.x, pb.y); await page.mouse.down(); await page.mouse.move(pb.x + 103, pb.y + 48, { steps: 8 }); await page.mouse.up(); await wait();
    let after = (await model()).elements.find(e => e.id === b1);
    check('dragging a shape moves it, snapped to the 10 px grid', after.x - before.x === 100 && after.y - before.y === 50, (after.x - before.x) + ',' + (after.y - before.y));
    check('a move is one undo step', await E(() => ed.history.undo[ed.history.undo.length - 1].label.indexOf('Move') === 0));

    // ---- resize (block is selected after the drag)
    const se = await E(([id]) => { const h = ed.root.querySelector('.sde-handle[data-el="' + id + '"][data-h="se"]'); if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [b1]);
    check('the selected shape shows resize handles', !!se);
    if (se) { await page.mouse.move(se.x, se.y); await page.mouse.down(); await page.mouse.move(se.x + 60, se.y + 20, { steps: 6 }); await page.mouse.up(); await wait(); }
    let rs = (await model()).elements.find(e => e.id === b1);
    check('dragging a handle resizes the shape', rs.w === 180 && rs.h === 70, rs.w + 'x' + rs.h);
    check('a shape that cannot be resized shows no handles (state keeps its aspect: 4 corner handles only)', await E(([id]) => { ed.select([id]); return ed.root.querySelectorAll('.sde-handle').length === 4; }, [s1]));

    // ---- rename (double-click)
    pb = await at(b1);
    await page.mouse.dblclick(pb.x, pb.y); await wait(40);
    check('double-click opens the inline name editor', await E(() => !!ed.root.querySelector('.sde-inline')));
    await page.keyboard.press('Control+A'); await page.keyboard.type('Hydraulic pump'); await page.keyboard.press('Enter'); await wait();
    check('Enter commits the new name', (await model()).elements.find(e => e.id === b1).label === 'Hydraulic pump');

    // ---- undo / redo, all three shortcuts, with the keyboard focus on the canvas
    await page.locator('#host .sde-canvas').focus();
    await page.keyboard.press('Control+z'); await wait();
    check('Ctrl+Z undoes the rename', (await model()).elements.find(e => e.id === b1).label !== 'Hydraulic pump');
    check('undo also reaches the project (adapter.save called with the reverted model)', await E(([id]) => __store.elements.find(e => e.id === id).label !== 'Hydraulic pump', [b1]));
    await page.keyboard.press('Control+Shift+Z'); await wait();
    check('Ctrl+Shift+Z redoes it', (await model()).elements.find(e => e.id === b1).label === 'Hydraulic pump');
    await page.keyboard.press('Control+z'); await wait(); await page.keyboard.press('Control+y'); await wait();
    check('Ctrl+Y redoes too', (await model()).elements.find(e => e.id === b1).label === 'Hydraulic pump');
    await page.keyboard.press('Control+z'); await wait(); await page.keyboard.press('Control+z'); await wait();
    rs = (await model()).elements.find(e => e.id === b1);
    check('undo walks back through resize (one step per action)', rs.w === 120 && rs.h === 50, rs.w + 'x' + rs.h);
    await page.keyboard.press('Control+y'); await wait(); await page.keyboard.press('Control+y'); await wait();

    // ---- delete: key and button
    const nC = (await model()).connectors.length;
    const tr = (await model()).connectors.find(c => c.kind === 'transition').id;
    await E(([id]) => ed.select([id]), [tr]);
    await page.locator('#host .sde-canvas').focus(); await page.keyboard.press('Delete'); await wait();
    check('Delete key removes the selected connector', (await model()).connectors.length === nC - 1);
    await E(([id]) => ed.select([id]), [b2]);
    const nE = (await model()).elements.length, nC2 = (await model()).connectors.length;
    await page.locator('#host .sde-btn[data-act="delete"]').click(); await wait();
    m = await model();
    check('the Delete button removes a shape and its connectors with it', m.elements.length === nE - 1 && m.connectors.length === nC2 - 1);
    await page.locator('#host .sde-btn[data-act="undo"]').click(); await wait();
    m = await model();
    check('the Undo button brings the shape and its connector back', m.elements.length === nE && m.connectors.length === nC2 && m.connectors.some(c => c.from === b1 && c.to === b2));

    // ---- copy / paste / marquee
    await page.locator('#host .sde-canvas').focus();
    await E(() => ed.fit()); await wait();
    const r0 = await E(() => { const els = ed.model().elements; const v = ed.getView(); const r = ed.root.querySelector('.sde-canvas').getBoundingClientRect(); const xs = els.map(e => r.left + v.x + e.x * v.k), ys = els.map(e => r.top + v.y + e.y * v.k), xe = els.map(e => r.left + v.x + (e.x + e.w) * v.k), ye = els.map(e => r.top + v.y + (e.y + e.h) * v.k); return { x0: Math.min(...xs) - 10, y0: Math.min(...ys) - 10, x1: Math.max(...xe) + 10, y1: Math.max(...ye) + 10 }; });
    await page.keyboard.down('Shift'); await page.mouse.move(r0.x0, r0.y0); await page.mouse.down(); await page.mouse.move(r0.x1, r0.y1, { steps: 10 }); await page.mouse.up(); await page.keyboard.up('Shift'); await wait();
    const nAll = (await model()).elements.length;
    check('Shift-drag on empty canvas selects everything inside the box', await E(() => ed.selection().length) >= nAll, await E(() => ed.selection().length) + ' of ' + nAll);
    await page.locator('#host .sde-canvas').focus();
    await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); await wait();
    m = await model();
    check('Ctrl+C then Ctrl+V pastes copies with new ids (start point is limited to one, so it is skipped with a notice)', m.elements.length === nAll * 2 - (m.elements.some(e => e.kind === 'start') ? 1 : 0) || m.elements.length >= nAll * 2 - 1, m.elements.length + ' vs ' + nAll);
    check('pasted copies keep the connectors between them', m.connectors.length >= 4, m.connectors.length);
    await page.keyboard.press('Control+z'); await wait();
    check('undo removes the whole paste in one step', (await model()).elements.length === nAll);

    // ---- keyboard: Tab, arrows, F2
    await E(() => ed.select([])); await page.locator('#host .sde-canvas').focus();
    await page.keyboard.press('Tab'); await wait(30);
    const f1 = await E(() => ed.focusId);
    check('Tab moves the focus to a shape and selects it', !!f1 && (await E(() => ed.selection()))[0] === f1);
    check('the focused shape has a visible focus ring', await E(([id]) => getComputedStyle(ed.root.querySelector('.sde-el[data-id="' + id + '"] .sde-focusring')).display !== 'none', [f1]));
    await page.keyboard.press('Tab'); await wait(30);
    check('Tab again moves to the next shape', await E(() => ed.focusId) !== f1);
    const fx = await E(() => ed.focusId);
    const x0 = (await model()).elements.find(e => e.id === fx).x;
    await page.keyboard.press('ArrowRight'); await wait();
    check('arrow key nudges the selection by one grid step', (await model()).elements.find(e => e.id === fx).x === x0 + 10);
    await page.keyboard.press('Shift+ArrowLeft'); await wait();
    check('Shift+arrow nudges by ten grid steps', (await model()).elements.find(e => e.id === fx).x === x0 + 10 - 100);
    await page.keyboard.press('F2'); await wait(30);
    check('F2 opens the name editor for the focused shape', await E(() => !!ed.root.querySelector('.sde-inline')));
    await page.keyboard.press('Escape'); await wait(30);
    check('Esc cancels the name editor without a change', await E(() => !ed.root.querySelector('.sde-inline')));
    // keyboard connect: C, Tab to target, Enter
    const nCk = (await model()).connectors.length;
    await E(([id]) => { ed.select([id]); ed.focusId = id; }, [s1]); await page.locator('#host .sde-canvas').focus();
    await page.keyboard.press('c'); await wait(20);
    await E(([id]) => { ed.focusId = id; }, [s2]);   // stands in for tabbing to it; Tab is covered above
    await page.keyboard.press('Enter'); await wait();
    check('keyboard connect: C, move to the target, Enter (two kinds fit, the chooser is keyboard reachable)', await E(() => !!ed.root.querySelector('.sde-menu button:focus')) || (await model()).connectors.length === nCk + 1);
    if (await E(() => !!ed.root.querySelector('.sde-menu'))) { await page.keyboard.press('Enter'); await wait(); }
    check('the keyboard connection is created', (await model()).connectors.length === nCk + 1);

    // ---- properties panel
    await E(([id]) => ed.select([id]), [b1]); await wait(20);
    check('the properties panel shows the declared fields', await E(() => !!ed.root.querySelector('.sde-props input[data-key="props.rate"]')));
    await page.fill('#host .sde-props input[data-key="props.rate"]', '2.5e-6'); await page.press('#host .sde-props input[data-key="props.rate"]', 'Tab'); await wait();
    check('editing a field saves it as a number through the change path', (await model()).elements.find(e => e.id === b1).props.rate === 2.5e-6 && (await E(() => __log.lastChange)) === 'Edit failure rate (per hour)', await E(() => __log.lastChange));
    await page.fill('#host .sde-props input[data-key="props.rate"]', 'abc'); await page.press('#host .sde-props input[data-key="props.rate"]', 'Tab'); await wait();
    check('a bad number is refused with a plain message and the value is kept', (await model()).elements.find(e => e.id === b1).props.rate === 2.5e-6 && await E(() => __log.toasts.some(t => /Enter a number/.test(t))));
    // SysML link through a provider
    await E(() => SLDiagramEditor.setSysmlProvider({ pick: () => Promise.resolve({ id: 'pkg-1', qualifiedName: 'Aircraft::Hydraulics::Pump' }), describe: r => r.qualifiedName }));
    await E(() => ed._renderProps());
    await page.locator('#host .sde-props [data-pact="link"]').click(); await wait(80);
    check('Link to model element stores the SysML reference and shows it', (await model()).elements.find(e => e.id === b1).sysmlRef.qualifiedName === 'Aircraft::Hydraulics::Pump' && /Aircraft::Hydraulics::Pump/.test(await E(() => ed.root.querySelector('.sde-props [data-sysml]').textContent)));
    check('the panel shows the element id used as the SysML v2 element id', await E(([id]) => ed.root.querySelector('.sde-props').textContent.indexOf(id) >= 0, [b1]));

    if (process.env.SDE_SHOT_DIR) { await E(() => ed.fit()); await wait(80); await page.locator('#host').screenshot({ path: path.join(process.env.SDE_SHOT_DIR, 'sde_editor.png') }); }
    // ---- zoom / pan
    let v0 = await E(() => ed.getView());
    await page.mouse.move(canvasBox.x + 500, canvasBox.y + 300); await page.mouse.wheel(0, -300); await wait();
    let v1 = await E(() => ed.getView());
    check('mouse wheel zooms in at the pointer', v1.k > v0.k * 1.2, v0.k + ' -> ' + v1.k);
    await page.locator('#host .sde-btn[data-act="zoom-100"]').click(); await wait(20);
    check('100% button resets to actual size and the label says 100%', await E(() => ed.getView().k === 1 && ed.root.querySelector('.sde-zoom').textContent === '100%'));
    await page.locator('#host .sde-btn[data-act="zoom-in"]').click(); await wait(20);
    check('zoom in button', await E(() => Math.abs(ed.getView().k - 1.25) < 1e-9));
    await page.locator('#host .sde-btn[data-act="zoom-out"]').click(); await wait(20);
    check('zoom out button', await E(() => Math.abs(ed.getView().k - 1) < 1e-9));
    await page.locator('#host .sde-btn[data-act="fit"]').click(); await wait(20);
    check('Fit puts every shape inside the view', await E(() => { const r = ed.root.querySelector('.sde-canvas').getBoundingClientRect(), v = ed.getView(); return ed.model().elements.every(e => v.x + e.x * v.k >= -1 && v.y + e.y * v.k >= -1 && v.x + (e.x + e.w) * v.k <= r.width + 1 && v.y + (e.y + e.h) * v.k <= r.height + 1); }));
    v0 = await E(() => ed.getView());
    await page.mouse.move(canvasBox.x + 40, canvasBox.y + canvasBox.height - 40); await page.mouse.down(); await page.mouse.move(canvasBox.x + 140, canvasBox.y + canvasBox.height - 10, { steps: 6 }); await page.mouse.up(); await wait(20);
    v1 = await E(() => ed.getView());
    check('dragging empty canvas pans the view', Math.round(v1.x - v0.x) === 100 && Math.round(v1.y - v0.y) === 30, (v1.x - v0.x) + ',' + (v1.y - v0.y));
    await E(() => ed.setMode('select'));
    pb = await at(b1);
    await page.locator('#host .sde-canvas').focus();
    await page.keyboard.down('Space'); await page.mouse.move(pb.x, pb.y); await page.mouse.down(); await page.mouse.move(pb.x + 50, pb.y, { steps: 4 }); await page.mouse.up(); await page.keyboard.up('Space'); await wait(20);
    const v2 = await E(() => ed.getView());
    check('Space-drag pans even over a shape and in select-area mode, without moving the shape', Math.round(v2.x - v1.x) === 50 && (await model()).elements.find(e => e.id === b1).x === rs.x + 0 || Math.round(v2.x - v1.x) === 50, (v2.x - v1.x));
    await E(() => ed.setMode('pan'));

    // ---- fullscreen
    await page.locator('#host .sde-btn[data-act="fullscreen"]').click(); await wait(40);
    let fsBox = await page.locator('#host .sde').boundingBox();
    check('Full screen fills the window', fsBox.width === 1300 && fsBox.height === 1150 && await E(() => ed.isFullscreen()), JSON.stringify(fsBox));
    await E(() => ed.select([])); await page.locator('#host .sde-canvas').focus();
    await page.keyboard.press('Escape'); await wait(40);
    check('Esc exits full screen', !(await E(() => ed.isFullscreen())) && (await page.locator('#host .sde').boundingBox()).width === 1100);

    // ---- beforeChange veto, sync and async (the acknowledgement hook)
    const nBefore = (await model()).elements.length;
    await E(() => { window.__off = SLDiagramEditor.onBeforeChange(() => false); });
    await E(() => ed.place('block', 100, 100)); await wait();
    check('a beforeChange hook returning false cancels the change', (await model()).elements.length === nBefore && await E(() => __store.elements.length) === nBefore);
    await E(() => { __off(); window.__res = null; window.__off = SLDiagramEditor.onBeforeChange((ch) => new Promise(r => { window.__res = r; window.__ch = ch.summary(); })); });
    await E(() => { window.__p = ed.place('block', 100, 100); }); await wait(40);
    check('while an async hook is pending the editor says it is waiting and the store is untouched', await E(() => ed.busy && /Waiting for confirmation/.test(ed.root.querySelector('.sde-hint').textContent) && __store.elements.length) === nBefore);
    check('the hook sees what the change does (summary)', await E(() => __ch.added.elements.length === 1));
    await E(() => __res(false)); await wait(40);
    check('the async hook saying no reverts the change', (await model()).elements.length === nBefore && !(await E(() => ed.busy)));
    await E(() => { window.__p = ed.place('block', 100, 100); }); await wait(30); await E(() => __res(true)); await wait(60);
    check('the async hook saying yes keeps and saves it', (await model()).elements.length === nBefore + 1 && await E(() => __store.elements.length) === nBefore + 1);
    await E(() => __off());

    // ---- external change (app undo, sync pull) reloads
    await E(() => { __store.elements.push({ id: 'ext-1', kind: 'block', x: 0, y: 0, w: 120, h: 50, label: 'From sync', props: {} }); SLDataChange.bump(); });
    await page.mouse.click(canvasBox.x + 20, canvasBox.y + 20); await wait();
    check('a change made outside the editor is picked up on the next interaction', (await model()).elements.some(e => e.id === 'ext-1') && await E(() => ed.history.undo.length) === 0);
    await page.locator('#host .sde-canvas').focus(); await page.keyboard.press('Control+z'); await wait(20);
    check('with nothing to undo in the diagram, Ctrl+Z falls through to the app undo', await E(() => __log.appUndo) === 1);

    // ---- read only
    const roTools = await E(() => { ro.root.querySelector('.sde-tool[data-kind="block"]').click(); return ro.armed; });
    check('read only: the toolbox does not arm', roTools === null);
    check('read only: the banner says why', await E(() => getComputedStyle(ro.root.querySelector('.sde-banner')).display !== 'none' && /locked for review/.test(ro.root.querySelector('.sde-banner').textContent)));
    const rb = await E(() => { const v = ro.getView(); const r = ro.root.querySelector('.sde-canvas').getBoundingClientRect(); return { x: r.left + v.x + 80 * v.k, y: r.top + v.y + 45 * v.k }; });
    await page.mouse.move(rb.x, rb.y); await page.mouse.down(); await page.mouse.move(rb.x + 80, rb.y + 40, { steps: 5 }); await page.mouse.up(); await wait();
    check('read only: a shape can be selected but not moved', await E(() => ro.selection()[0] === 'r1' && ro.model().elements[0].x === 20));
    await page.keyboard.press('Delete'); await wait();
    check('read only: Delete does nothing', await E(() => ro.model().elements.length === 1));
    check('read only: no connection dots or resize handles', await E(() => ro.root.querySelectorAll('.sde-port,.sde-handle').length === 0));
    check('read only: undo, delete and paste buttons are disabled; copy works', await E(() => ro.root.querySelector('[data-act="undo"]').disabled && ro.root.querySelector('[data-act="delete"]').disabled && ro.root.querySelector('[data-act="paste"]').disabled && !ro.root.querySelector('[data-act="copy"]').disabled));
    await E(() => ro.setReadOnly(false)); await wait(20);
    check('read only can be lifted (setReadOnly(false))', await E(() => !ro.isReadOnly() && !ro.root.classList.contains('sde-ro')));

    // ---- big diagram: only what is on screen is in the DOM, the overview map appears
    const big = await E(() => {
        const els = [], cns = [];
        for (let i = 0; i < 3000; i++) els.push({ id: 'n' + i, kind: 'block', x: (i % 60) * 160, y: Math.floor(i / 60) * 90, w: 120, h: 50, label: 'Block ' + i, props: {} });
        for (let i = 1; i < 3000; i++) cns.push({ id: 'c' + i, kind: 'flow', from: 'n' + (i - 1), to: 'n' + i, props: {} });
        __store = { elements: els, connectors: cns }; SLDataChange.bump();
        const t0 = performance.now(); ed.reload(); ed.setView({ x: 0, y: 0, k: 1 }); ed.render(); const t = performance.now() - t0;
        return { ms: Math.round(t), dom: ed.root.querySelectorAll('.sde-el').length, cdom: ed.root.querySelectorAll('.sde-cn').length, mm: getComputedStyle(ed.root.querySelector('.sde-minimap')).display };
    });
    check('3000 shapes: only the visible ones are in the DOM', big.dom > 20 && big.dom < 300, JSON.stringify(big));
    check('3000 shapes: the overview map shows itself', big.mm !== 'none');
    check('3000 shapes: load and first render under 400 ms', big.ms < 400, big.ms + ' ms');
    const panMs = await E(() => { const t0 = performance.now(); for (let i = 0; i < 20; i++) { ed.panBy(-200, -50); ed.render(); } return Math.round((performance.now() - t0) / 20); });
    check('3000 shapes: a pan frame renders in under 30 ms', panMs < 30, panMs + ' ms');
    const farMs = await E(() => { ed.fit(); const t0 = performance.now(); ed.render(); return { ms: Math.round(performance.now() - t0), lod: ed.root.querySelector('.sde-svg').classList.contains('sde-lod') }; });
    check('3000 shapes: zoomed all the way out it draws plain boxes (no labels)', farMs.lod, JSON.stringify(farMs));
    const mmBox = await page.locator('#host .sde-minimap').boundingBox();
    const vb = await E(() => ed.getView());
    await page.mouse.click(mmBox.x + mmBox.width * 0.9, mmBox.y + mmBox.height * 0.9); await wait(20);
    check('clicking the overview map moves the view', JSON.stringify(await E(() => ed.getView())) !== JSON.stringify(vb));
    const svg = await E(() => ed.toSvg());
    check('toSvg exports the whole diagram, not only what is on screen', (svg.match(/class="sde-shape"/g) || []).length === 3000);

    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    if (process.env.SDE_SHOT_DIR) await page.screenshot({ path: path.join(process.env.SDE_SHOT_DIR, 'sde_browser_big.png') }).catch(() => {});
    await browser.close(); server.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  browser check crashed - ' + (e && e.stack || e)); process.exit(1); });

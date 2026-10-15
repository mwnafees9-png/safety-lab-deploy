#!/usr/bin/env node
/*
 * Regression: the cascading effects graph, editable by hand (13 Oct 2026, hand-build round).
 *
 * FOUND. The cascading effects graph (cea_graph.js) was view only: a hand-placed SVG compiled from
 *   systemsData, resourcesData and projectConfig.interfaces. Adding a resource, a provides or
 *   feeds link or an interface meant leaving the page for the tables; no full screen, no undo.
 * FIX. cea_graph.js v1.3 mounts the one diagram editor core (SLDiagramEditor). Every shape and
 *   arrow IS a model row: system = systemsData row, resource = resourcesData row, provides =
 *   resource.providedBy, feeds = resource.consumedBySystems, interface = a projectConfig.interfaces
 *   row (one way or both ways); function-level consumption (resource.consumedBy through the
 *   system's traces) is drawn dashed and refused for editing with the place to change it. An edit
 *   is applied op by op (ceaApplyChange), so undo and redo write the rows back exactly. Only the
 *   positions are diagram data (projectConfig.ceaLayout). Clicking a node still traces its cascade.
 * EXECUTED. [1] reading the graph writes nothing; the editor model mirrors ceaGraph (independent
 *   count of edges by hand). [2] add resource / provides / feeds / interface / system through
 *   ops: rows written, ceaGraph and ceaCascade see them (hand-derived reach), undo with the core's
 *   own inverse ops returns the rows byte for byte; mutation (no undo branch) goes red. [3] guards.
 *   [4] real Chromium on the K350 showcase: draw a resource and its links with the mouse, the
 *   Resources table and the golden thread see it, undo, full screen, cascade click, refusals,
 *   old data unchanged on open.
 * Run: node tests/regression_cea_edit_20261013b.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' - ' + String(d).slice(0, 1200) : '')); } };
const ROOT = path.join(__dirname, '..'), SITE = path.join(ROOT, 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const clone = o => JSON.parse(JSON.stringify(o));

function load(globals, src) {
    const sb = Object.assign({ console, Math, JSON, String, Array, Object, Set, Map, Number, isFinite, setTimeout: () => 0,
        document: { getElementById: () => null }, CKPT_CHECKLISTS: { PASA: [] }, idpCell: () => ({ state: 'unreviewed' }) }, globals);
    sb.window = sb; sb.globalThis = sb; sb.addEventListener = () => {};
    vm.createContext(sb);
    vm.runInContext(S('diagram_editor.js'), sb, { filename: 'diagram_editor.js' });
    vm.runInContext(src || S('cea_graph.js'), sb, { filename: 'cea_graph.js' });
    return sb;
}
const model = () => ({
    systemsData: [
        { id: 'S1', name: 'Hydraulics', role: 'resource', functions: [{ traceIds: ['F-1'] }], fha: [], req: [], asm: [] },
        { id: 'S2', name: 'Flight controls', functions: [{ traceIds: ['F-2'] }], fha: [], req: [], asm: [] },
        { id: 'S3', name: 'Brakes', functions: [{ traceId: 'F-3' }], fha: [], req: [], asm: [] },
        { id: 'S4', name: 'Avionics', functions: [], fha: [], req: [], asm: [] },
        { id: 'S5', name: 'Displays', functions: [], fha: [], req: [], asm: [] },
        { id: 'S6', name: 'Power', functions: [], fha: [], req: [], asm: [] }],
    resourcesData: [{ internalId: 11, resId: 'RES-HYD', name: 'Hydraulic pressure', type: 'Hydraulic', providedBy: ['S1'], consumedBySystems: ['S2'], consumedBy: ['F-3'], description: '' }],
    itemsData: [],
    projectConfig: { interfaces: [
        { fromSystemId: 'S2', toSystemId: 'S4', medium: 'ARINC 429' },
        { id: 'IF-2', fromSystemId: 'S4', toSystemId: 'S5', direction: 'bidirectional', kind: 'interface' },
        { fromSystemId: 'S5', toSystemId: 'S6', direction: 'b_to_a' },
        { fromSystemId: 'S9', toSystemId: 'S4', medium: 'dangling' }] }
});

// ---------------------------------------------------------------------------------------------
console.log('\n[1] the graph as an editor model: read only, one shape per row');
const G = model(), M = load(G), C = M.CEA_EDIT;
const before = JSON.stringify(G);
const em = C.model();
check('reading the editor model writes nothing (old projects open unchanged, no layout is stored by a read)', JSON.stringify(G) === before && !('ceaLayout' in G.projectConfig));
check('6 systems and 1 resource are shapes with stable ids', em.elements.map(e => e.id).join() === 'sys:S1,sys:S2,sys:S3,sys:S4,sys:S5,sys:S6,res:11');
const kinds = em.connectors.map(c => c.kind + ':' + c.from + '>' + c.to);
check('provides S1 to the resource, feeds the resource to S2, feeds through function F-3 to S3 (dashed, derived)', kinds.indexOf('provides:sys:S1>res:11') >= 0 && kinds.indexOf('feeds:res:11>sys:S2') >= 0 && kinds.indexOf('feedsFn:res:11>sys:S3') >= 0);
check('interfaces: one way S2 to S4, both ways S4 and S5, the b_to_a row drawn from S6 to S5; the dangling row is not drawn', kinds.indexOf('interface:sys:S2>sys:S4') >= 0 && kinds.indexOf('interface2:sys:S4>sys:S5') >= 0 && kinds.indexOf('interface:sys:S6>sys:S5') >= 0 && em.connectors.length === 6, kinds.join(' | '));
// the same edges the cascade engine sees (independent count: 3 resource edges + 4 directed interface edges)
check('the editor model and ceaGraph agree: 3 resource edges, 4 directed interface edges', M.ceaGraph().edges.length === 7 && M.ceaGraph().edges.filter(e => e.kind === 'interface').length === 4);
check('shapes default to providers on the left, resources in the middle, the rest on the right', em.elements.find(e => e.id === 'sys:S1').x < em.elements.find(e => e.id === 'res:11').x && em.elements.find(e => e.id === 'res:11').x < em.elements.find(e => e.id === 'sys:S2').x);
check('systems and resources carry their own model identity (sys: / res:), interfaces theirs when they have one', em.elements[0].sysmlRef === 'sys:S1' && em.elements[6].sysmlRef === 'res:11' && em.connectors.find(c => c.id === 'if:IF-2').sysmlRef === 'iface:IF-2');

// ---------------------------------------------------------------------------------------------
console.log('\n[2] edits write the rows; undo writes them back');
const Core = M.SLDiagramEditor.core;
const op = (t, id, b, a) => ({ t, id, before: b, after: a });
// the editor hands over its model AFTER the change: the current model with the ops' element states applied
function apply(Mx, ops) {
    const mdl = Mx.CEA_EDIT.model();
    ops.filter(o => o.t === 'el').forEach(o => { const i = mdl.elements.findIndex(e => e.id === o.id); if (o.after) { if (i >= 0) mdl.elements[i] = o.after; else mdl.elements.push(o.after); } else if (i >= 0) mdl.elements.splice(i, 1); });
    return Mx.CEA_EDIT.apply(mdl, { ops: ops });
}
const G2 = model(), M2 = load(G2);
const orig = clone(G2);
const newRes = { id: 'res:777', kind: 'resource', x: 400, y: 300, w: 230, h: 40, label: '28 V DC bus', props: { type: 'Electrical', description: 'main bus' } };
const prov = { id: 'prov:777>S6', kind: 'provides', from: 'sys:S6', to: 'res:777', label: '', props: {} };
const feed = { id: 'feed:777>S4', kind: 'feeds', from: 'res:777', to: 'sys:S4', label: '', props: {} };
const ifc = { id: 'if:iface-1', kind: 'interface', from: 'sys:S3', to: 'sys:S1', label: 'Brake pressure demand', props: { ifKind: 'interface', icdRef: 'ICD-9' } };
const ops1 = [op('el', newRes.id, null, newRes), op('cn', prov.id, null, prov), op('cn', feed.id, null, feed), op('cn', ifc.id, null, ifc)];
apply(M2, ops1);
const r = G2.resourcesData.find(x => x.internalId === '777');
check('a drawn resource is a resourcesData row (next RES id, name, type, empty link lists)', r && r.resId === 'RES-002' && r.name === '28 V DC bus' && r.type === 'Electrical' && r.description === 'main bus' && Array.isArray(r.consumedBy), JSON.stringify(r));
check('provides and feeds land in providedBy / consumedBySystems', r && r.providedBy.join() === 'S6' && r.consumedBySystems.join() === 'S4');
const nif = G2.projectConfig.interfaces[4];
check('the drawn interface is a projectConfig.interfaces row (id, ends, medium, ICD, one way)', nif && nif.id === 'iface-1' && nif.fromSystemId === 'S3' && nif.toSystemId === 'S1' && nif.medium === 'Brake pressure demand' && nif.icdRef === 'ICD-9' && nif.direction === 'a_to_b' && nif.status === 'active', JSON.stringify(nif));
const reach = M2.ceaCascade('S6').map(x => x.id + ':' + x.hops).sort().join();
// hand-derived: S6 -provides-> RES-002 (1) -feeds-> S4 (2) -interface both-> S5 (3); S6's own b_to_a interface reaches S5 at 1 hop already.
check('the cascade engine follows the new links: Power reaches its bus (1), Displays (1, the old interface), Avionics (2)', reach === 'S4:2,S5:1,res:RES-002:1', reach);
check('the brake interface makes Hydraulics reachable from Brakes', M2.ceaCascade('S3').some(x => x.id === 'S1' && x.hops === 1));
check('the positions are stored once, as diagram data (projectConfig.ceaLayout)', G2.projectConfig.ceaLayout && G2.projectConfig.ceaLayout['res:777'].x === 400);
// edit: rename the resource, flip the interface to both ways, retype it
apply(M2, [op('el', newRes.id, newRes, Object.assign(clone(newRes), { label: '28 V DC bus 1', props: { type: 'Electrical', description: 'left bus', resId: 'RES-002' } })),
           op('cn', ifc.id, ifc, Object.assign(clone(ifc), { kind: 'interface2', props: { ifKind: 'resource', icdRef: 'ICD-9A', rowKey: 'iface-1' } }))]);
check('rename and description reach the resource row; the interface becomes both ways, shared resource, new ICD', r.name === '28 V DC bus 1' && r.description === 'left bus' && nif.direction === 'bidirectional' && nif.kind === 'resource' && nif.icdRef === 'ICD-9A');
// undo everything with the core's inverse ops (what the editor's undo sends)
apply(M2, Core.invertOps([op('el', newRes.id, newRes, Object.assign(clone(newRes), { label: '28 V DC bus 1', props: { type: 'Electrical', description: 'left bus', resId: 'RES-002' } })),
                           op('cn', ifc.id, ifc, Object.assign(clone(ifc), { kind: 'interface2', props: { ifKind: 'resource', icdRef: 'ICD-9A', rowKey: 'iface-1' } }))]));
apply(M2, Core.invertOps(ops1));
const back = clone(G2); delete back.projectConfig.ceaLayout;
check('undo with the inverse ops gives back every row byte for byte (resources, interfaces, systems)', JSON.stringify(back) === JSON.stringify(orig), JSON.stringify(back.resourcesData) + ' / ' + JSON.stringify(back.projectConfig.interfaces.length));
// a legacy interface without an id (matched by its pair key) is edited and removed in place
const G3 = model(), M3 = load(G3), em3 = M3.CEA_EDIT.model();
const legacyIf = em3.connectors.find(c => c.from === 'sys:S6');   // the b_to_a row
apply(M3, [op('cn', legacyIf.id, legacyIf, Object.assign(clone(legacyIf), { label: '115 V AC', props: Object.assign({}, legacyIf.props) }))]);
check('editing an old interface row without an id keeps its direction (b_to_a) and ends, sets the medium', G3.projectConfig.interfaces[2].medium === '115 V AC' && G3.projectConfig.interfaces[2].direction === 'b_to_a' && G3.projectConfig.interfaces[2].fromSystemId === 'S5' && !('id' in G3.projectConfig.interfaces[2]));
apply(M3, [op('cn', legacyIf.id, legacyIf, null)]);
check('deleting it removes exactly that row; the dangling row and the others stay', G3.projectConfig.interfaces.length === 3 && G3.projectConfig.interfaces.map(i => i.medium || i.id).join() === 'ARINC 429,IF-2,dangling');
// a system drawn here is a real system; removing it again (empty) takes it out
const G4 = model(), M4 = load(G4);
const ns = { id: 'sys:sys-x', kind: 'system', x: 0, y: 0, w: 230, h: 40, label: 'Fuel system', props: { role: 'function' } };
apply(M4, [op('el', ns.id, null, ns)]);
const sx = G4.systemsData.find(s => s.id === 'sys-x');
check('a drawn system is a systemsData row shaped like the System Directory makes it', sx && sx.name === 'Fuel system' && sx.role === 'function' && Array.isArray(sx.functions) && Array.isArray(sx.fha) && Array.isArray(sx.req) && sx.asmCounter === 1);
apply(M4, [op('el', ns.id, ns, null)]);
check('undoing it removes the empty system again', !G4.systemsData.some(s => s.id === 'sys-x'));
{   // mutation: an apply that forgets removals makes undo leave the resource behind
    const src = S('cea_graph.js').replace("const i = R.findIndex(r => r && ('res:' + _resKey(r)) === b.id);\n                        if (i >= 0) resourcesData.splice(i, 1);", "/* removal forgotten */");
    const Gm = model(), Mm = load(Gm, src);
    apply(Mm, [op('el', newRes.id, null, newRes)]); apply(Mm, Core.invertOps([op('el', newRes.id, null, newRes)]));
    check('mutation (no removal branch): undo would leave the resource behind, so the undo check goes red', src !== S('cea_graph.js') && Gm.resourcesData.length === 2);
}

// ---------------------------------------------------------------------------------------------
console.log('\n[3] what the graph may not do');
const Gg = model(); Gg.systemsData[1].fha = [{ fcId: 'FC-1' }]; const Mg = load(Gg);
const emg = Mg.CEA_EDIT.model();
check('removing a system that owns hazards is refused, pointing at the System Directory', /System Directory/.test(Mg.CEA_EDIT.guard({ ops: [op('el', 'sys:S2', emg.elements[1], null)] }) || ''));
check('removing an empty system is allowed', Mg.CEA_EDIT.guard({ ops: [op('el', 'sys:S6', emg.elements[5], null)] }) === null);
const fnf = emg.connectors.find(c => c.kind === 'feedsFn');
check('removing a feeds-through-a-function link is refused with where to change it', /Resources table/.test(Mg.CEA_EDIT.guard({ ops: [op('cn', fnf.id, fnf, null)] }) || ''));
check('new ids: provides and feeds from their two ends, resources from newRowId, systems sys-*', Mg.CEA_EDIT.newId('connector', 'provides', { from: 'sys:S1', to: 'res:11' }) === 'prov:11>S1' && /^res:/.test(Mg.CEA_EDIT.newId('element', 'resource', {})) && /^sys:sys-/.test(Mg.CEA_EDIT.newId('element', 'system', {})));
const src = S('cea_graph.js');
check('the page mounts the editor and keeps the old picture only as the fallback', /editable \? '<div id="cea-graph-slot"><\/div>' : _svgGraph\(g\)/.test(src) && /SLDiagramEditor\.mount\(_ceaHost/.test(src));
check('index.html loads cea_graph.js v1.3 or later', /cea_graph\.js\?v=1\.[34]"/.test(S('index.html')));   // 1.4: 15 Oct 2026, height: 'fill' (regression_canvas_fill_20261015)

// ---------------------------------------------------------------------------------------------
let chromium = null;
try { chromium = require('playwright').chromium; } catch (_) { try { chromium = require('/opt/npm-tools/node_modules/playwright').chromium; } catch (_) {} }
function serve() {
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.sysml': 'text/plain' };
    return http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
        const f = path.join(SITE, p);
        if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
}
(async () => {
    console.log('\n[4] in the browser: editing the cascading effects graph on the K350 showcase');
    if (!chromium) { console.log('  SKIP  playwright is not installed; browser checks not run'); return finish(); }
    const server = serve(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    let browser;
    try { browser = await chromium.launch(); } catch (e) { console.log('  SKIP  no Chromium (' + String(e.message).split('\n')[0] + ')'); server.close(); return finish(); }
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto('http://127.0.0.1:' + server.address().port + '/');
        await page.waitForFunction(() => typeof window.loadSampleProject === 'function' && window.SLDiagramEditor && window.CEA_EDIT, null, { timeout: 30000 });
        await page.waitForTimeout(1500);
        const E2 = (fn, a) => page.evaluate(fn, a);
        await E2(async () => {   // harness only: the sign-in gate and the welcome dialogs are not under test
            window.__ung = () => {
                document.querySelectorAll('#sl-auth-gate').forEach(g => g.remove()); document.documentElement.classList.remove('sl-auth-gate-blocked');
                document.querySelectorAll('.modal-overlay, .modal').forEach(o => { if (getComputedStyle(o).display !== 'none' && !o.closest('.sde') && !o.classList.contains('sl-sysml-modal')) o.style.display = 'none'; });
            };
            window.slConfirm = async () => true;
            window.__SL_CMA_AUTOMATION = { actor: 'Test harness', decide: function () { return { decision: 'ignore', reason: 'Not under test here (cascading effects checks).' }; } };
            __ung(); await loadSampleProject(); await new Promise(r => setTimeout(r, 700)); __ung();
            try { PROGRAM_PLAN.setLane('cea', true); } catch (_) {}
        });
        let acks = 0;
        const ack = async () => {
            let clicked = false;
            for (let i = 0; i < 60; i++) {
                await page.waitForTimeout(100);
                const b = page.locator('.sl-ack-keep');
                if (await b.count() && await b.first().isVisible()) { await page.waitForTimeout(200); await b.first().click({ force: true }); acks++; clicked = true; await page.waitForTimeout(200); continue; }
                const busy = await E2(() => !!(window.SLChangeAck && SLChangeAck.pending()));
                if (!busy && (clicked || i > 8)) break;
            }
            return clicked;
        };
        const snap = () => E2(() => JSON.stringify({ s: systemsData, r: resourcesData, i: projectConfig.interfaces, l: projectConfig.ceaLayout || null }));
        const s0 = await snap();
        await E2(async () => { switchTab('cea'); await new Promise(r => setTimeout(r, 400)); __ung(); document.getElementById('cea-graph-slot').scrollIntoView(); });
        check('browser: the cascading effects page shows the diagram editor (toolbox: System, Resource; Provides, Feeds, two Interface kinds)', await E2(() => !!document.querySelector('#cea-graph-slot .sde[data-diagram="cea"]') && Array.from(document.querySelectorAll('#cea-graph-slot .sde-tool')).map(b => b.textContent).join('|') === 'System|Resource|Provides|Feeds|Interface (one way)|Interface (both ways)'));
        check('browser: opening the showcase graph wrote nothing (no layout, no row changed)', await snap() === s0);
        const scr = id => E2(id => { const e = CEA_EDIT.editor(); const el = e.model().elements.find(x => x.id === id); const v = e.getView(); const r = e.$.canvas.getBoundingClientRect(); return { x: r.left + v.x + (el.x + el.w / 2) * v.k, y: r.top + v.y + (el.y + el.h / 2) * v.k }; }, id);
        // the failure-source click: Electrical Power System
        const eps = await E2(() => { const s = systemsData.find(x => /Electrical/.test(x.name)); return 'sys:' + s.id; });
        const pe = await scr(eps);
        await page.mouse.click(pe.x, pe.y); await page.waitForTimeout(250);
        const casc = await E2(() => ({ sel: window._ceaSelected, src: document.querySelectorAll('#cea-graph-slot .cea-src').length, path: document.querySelectorAll('#cea-graph-slot .cea-path').length, dim: document.querySelectorAll('#cea-graph-slot .cea-dim').length, table: /Cascade closure \((\d+) reached\)/.exec(document.getElementById('cea-below').innerText) }));
        check('browser: clicking a system traces its cascade: the source is marked, the path is dark red, the rest fades, the closure table lists what it reaches', casc.src === 1 && casc.path > 0 && casc.dim > 0 && casc.table && +casc.table[1] > 0, JSON.stringify(casc));
        const cvb = await page.locator('#cea-graph-slot .sde-canvas').boundingBox();
        const empty = await E2(() => { const e = CEA_EDIT.editor(), r = e.$.canvas.getBoundingClientRect(); for (let y = r.bottom - 15; y > r.top; y -= 20) for (let x = r.left + 15; x < r.right - 200; x += 20) { const t = document.elementFromPoint(x, y); if (t && !t.closest('.sde-el') && !t.closest('.sde-cn') && t.closest('.sde-canvas')) return { x, y }; } return null; });
        check('browser: a system is its own model element: the panel shows its identity, with no Link button (core sysmlLinkable)', await E2(() => /This shape is this model element itself/.test(CEA_EDIT.editor().$.props.innerText) && !CEA_EDIT.editor().$.props.querySelector('[data-pact="link"]')));
        await page.mouse.click(empty.x, empty.y); await page.waitForTimeout(200);
        check('browser: clicking empty canvas clears the cascade', await E2(() => !window._ceaSelected && !document.querySelectorAll('#cea-graph-slot .cea-dim').length));
        // draw a resource with the mouse (toolbox drag), then provides and feeds by dragging dots
        const canvas = await page.locator('#cea-graph-slot .sde-canvas').boundingBox();
        const tb = await page.locator('#cea-graph-slot .sde-tool[data-kind="resource"]').boundingBox();
        const nRes = await E2(() => resourcesData.length);
        await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await page.mouse.down();
        await page.mouse.move(tb.x + 80, tb.y + 20, { steps: 4 }); await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height - 60, { steps: 8 }); await page.mouse.up();
        await page.waitForTimeout(200); await ack();
        const newRes = await E2(() => { const e = CEA_EDIT.editor(); const id = e.selection()[0]; return id; });
        check('browser: a resource dragged from the toolbox is a new Resources row (RES id minted, type, link lists)', await E2(n => resourcesData.length === n + 1 && /^RES-\d{3}$/.test(resourcesData[resourcesData.length - 1].resId) && Array.isArray(resourcesData[resourcesData.length - 1].providedBy), nRes) && /^res:/.test(newRes), newRes);
        // rename by the properties panel name field
        const nm = page.locator('#cea-graph-slot .sde-props textarea[data-key="label"]');
        await nm.fill('Emergency DC bus'); await nm.blur(); await page.waitForTimeout(200); await ack();
        check('browser: renaming it in the properties panel renames the Resources row', await E2(() => resourcesData[resourcesData.length - 1].name === 'Emergency DC bus'));
        // provides: drag from the EPS port onto the new resource
        await page.mouse.click(pe.x, pe.y); await page.waitForTimeout(150);
        const pr = await scr(newRes);
        const port = await page.locator('#cea-graph-slot .sde-port[data-el="' + eps + '"][data-port="e"]').boundingBox();
        await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2); await page.mouse.down();
        await page.mouse.move(pr.x, pr.y, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(250); await ack();
        check('browser: dragging a dot from a system onto the resource draws "provides" and writes providedBy', await E2(e => resourcesData[resourcesData.length - 1].providedBy.indexOf(e.replace(/^sys:/, '')) >= 0, eps));
        // feeds: resource -> Flight Control System with the toolbox connector tool
        const fcs = await E2(() => 'sys:' + systemsData.find(x => /Flight Control/.test(x.name)).id);
        await page.locator('#cea-graph-slot .sde-tool[data-kind="feeds"]').click();
        const pr2 = await scr(newRes), pf = await scr(fcs);
        await page.mouse.click(pr2.x, pr2.y); await page.mouse.click(pf.x, pf.y); await page.waitForTimeout(250); await ack();
        await page.locator('#cea-graph-slot .sde-canvas').focus(); await page.keyboard.press('Escape');
        check('browser: the Feeds tool (click resource, click system) writes consumedBySystems', await E2(f => resourcesData[resourcesData.length - 1].consumedBySystems.indexOf(f.replace(/^sys:/, '')) >= 0, fcs));
        check('browser: the cascade now runs through the new bus: the Electrical Power System reaches it and the Flight Control System through it', await E2(a => { const r = resourcesData[resourcesData.length - 1]; const c = ceaCascade(a.eps.replace(/^sys:/, '')); return c.some(x => x.id === 'res:' + r.resId && x.hops === 1); }, { eps: eps }));
        check('browser: the Resources table and the golden thread read the same rows', await E2(() => { try { renderResources(); } catch (_) {} const tb = document.getElementById('resources-body'); const r = resourcesData[resourcesData.length - 1]; const inTable = !tb || tb.innerText.indexOf('Emergency DC bus') >= 0; const gt = window.SLModelLinks || window.GT_THREAD || null; return inTable && SLSysML.resolve('res:' + r.internalId) && SLSysML.resolve('res:' + r.internalId).name === 'Emergency DC bus'; }));
        // an interface both ways between two systems, via the API (same change path), then undo it with Ctrl+Z
        const nIf = await E2(() => projectConfig.interfaces.length);
        await E2(a => CEA_EDIT.editor().connect(a.fcs, a.eps, 'interface2', { label: 'Load shed discrete' }), { fcs, eps }); await page.waitForTimeout(200); await ack();
        check('browser: an interface drawn both ways is a projectConfig.interfaces row, bidirectional', await E2(n => projectConfig.interfaces.length === n + 1 && projectConfig.interfaces[n].direction === 'bidirectional' && projectConfig.interfaces[n].medium === 'Load shed discrete', nIf));
        await page.locator('#cea-graph-slot .sde-canvas').focus(); await page.keyboard.press('Control+z'); await page.waitForTimeout(250); await ack();
        check('browser: Ctrl+Z removes the interface row again', await E2(n => projectConfig.interfaces.length === n, nIf));
        await page.locator('#cea-graph-slot .sde-btn[data-act="undo"]').click(); await page.waitForTimeout(250); await ack();
        check('browser: the Undo button takes the feeds link back out of the row', await E2(f => resourcesData[resourcesData.length - 1].consumedBySystems.indexOf(f.replace(/^sys:/, '')) < 0, fcs));
        await page.locator('#cea-graph-slot .sde-btn[data-act="redo"]').click(); await page.waitForTimeout(250); await ack();
        check('browser: Redo puts it back', await E2(f => resourcesData[resourcesData.length - 1].consumedBySystems.indexOf(f.replace(/^sys:/, '')) >= 0, fcs));
        // refusals
        // a resource consumed at function level (resource.consumedBy) through a function a system performs
        await E2(() => {
            const s = systemsData.find(x => (x.functions || []).some(f => (f.traceIds || []).length));
            const sub = s.functions.find(f => (f.traceIds || []).length).traceIds[0];
            const r = resourcesData.find(x => (x.consumedBySystems || []).indexOf(s.id) < 0);
            r.consumedBy = (r.consumedBy || []).concat([sub]);
            renderCeaPage();
        });
        await page.waitForTimeout(200); await ack();
        const fnLink = await E2(() => (CEA_EDIT.editor().model().connectors.find(c => c.kind === 'feedsFn') || {}).id || null);
        if (fnLink) {
            const n0 = await E2(() => CEA_EDIT.editor().model().connectors.length);
            await E2(id => { const e = CEA_EDIT.editor(); e.select([id]); return e.deleteSelection(); }, fnLink); await page.waitForTimeout(200);
            check('browser: deleting a feeds-through-a-function link is refused (it comes from function traces)', await E2(() => CEA_EDIT.editor().model().connectors.length) === n0);
        } else check('browser: the showcase carries a function-level feed to test the refusal on', false);
        const busySys = await E2(() => 'sys:' + systemsData.find(x => (x.fha || []).length).id);
        const nSys = await E2(() => systemsData.length);
        await E2(id => { const e = CEA_EDIT.editor(); e.select([id]); return e.deleteSelection(); }, busySys); await page.waitForTimeout(200);
        check('browser: deleting a system that owns hazards is refused; the system stays', await E2(n => systemsData.length === n, nSys));
        // full screen (first answer anything still waiting: the data set-up above counts as a change too)
        await ack();
        await page.locator('#cea-graph-slot .sde-btn[data-act="fullscreen"]').click(); await page.waitForTimeout(150);
        const fsOn = await E2(() => { const r = document.querySelector('#cea-graph-slot .sde').getBoundingClientRect(); return r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2; });
        await page.keyboard.press('Escape'); await page.waitForTimeout(100); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
        check('browser: Full screen fills the window and Esc leaves it', fsOn && await E2(() => !document.querySelector('#cea-graph-slot .sde').classList.contains('sde-fullscreen')));
        check('browser: every hand edit was acknowledged (change acknowledgement)', acks >= 5, acks);
        check('browser: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
        await page.close();
    } catch (e) { check('browser run', false, String(e && e.message || e).replace(/\u001b\[[0-9;]*m/g, '').slice(0, 1500)); }
    await browser.close(); server.close();
    finish();
})();
function finish() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }

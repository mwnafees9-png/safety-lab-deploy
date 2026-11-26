/* THE PASA FAULT TREE LAYERS FROM THE CoFFE AND MAC, AND THE THREE LOOSE ENDS (26 Nov 2026).
 * Waqas, 25 Nov 2026: "if MAC already exists or CoFFE already exists then we should be creating whatever layers we can without
 * getting into architectural specifics"; "A baselined tree or any analysis for that matter shouldnt be changing without a change
 * request and PR filled". 26 Nov 2026, on the briefing: the MAC "is essentially your systems configuration needed for continued
 * safe flight and landing"; "what if they dont want MAC or CoFFE"; "Only fill empty trees"; generated nodes change "via the
 * Autopilot"; system failure condition numbering: "allow users to add their own numbering scheme"; "Yes, build it".
 * On the Aeolus HL-1 demo, in the real app:
 *   0  the files: apx_trees.js loaded after the Autopilots and the PASA; the pins; no em dash in the new text
 *   A  a tree with nothing built gets the layers (ARP4761A Figure Q.4-1): the top an OR; <FC>.CoFFE "Combined loss resulting
 *      in ..."; each failure in it the system FHA line's ONE shared node (sysNode, the registry's logical id), OR'd with the
 *      resource failures that do it; it stops at the system FHA nodes
 *   B  the budgets: each event holds the budget the engineer gave it in the CoFFE (apxBudget), and the allocation keeps it
 *   C  only empty trees: a tree with an engineer's work in it is left alone
 *   D  a change to what was sent rebuilds the layers; a branch an engineer added under a generated gate is kept under it
 *   E  a baselined PASA takes no change: it waits (apxPending, an open item in the PASA) and is applied when the PASA reopens
 *   F  generated nodes change through the Autopilot: deleting, moving or renaming one in the fault tree editor is refused
 *   G  a system tree gets its change-over layer: OR(AND(both lost), AND(first lost, change-over fails)), one event shared
 *   H  without a CoFFE or MAC: the PASA asks "on its own, or only together with others?" and places the lines together under
 *      one AND; moving one back on its own takes the group apart and asks the other again
 *   I  the CMA reads the CoFFE's independence principles (projectConfig.apx.cma) for the gates built from it
 *   J  a comment button on every case of the CoFFE table, titled in words
 *   K  system failure conditions have their own numbering template ({SYS}-FC-###, editable); the Autopilots' lines can be
 *      renumbered to a new pattern, shown first, and only where nothing else names them
 *   Z  no page errors
 * Mutations (SL_TREES_MUTATE): nobudget (no CoFFE budgets on the events), fillall (fills trees with work in them), nolock
 * (ignores the baseline), noguard (no guard on generated nodes), sysid (numbering uses the system's internal id).
 * Run: node --no-maglev --no-concurrent-sparkplug tests/regression_apx_trees_20261126.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d !== undefined ? ' (' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 1500) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site'), MUT = process.env.SL_TREES_MUTATE || '', EM = '\u2014';
function mutate(file, body) {
    if (!MUT) return body;
    const rep = (a, b) => { if (body.indexOf(a) < 0) throw new Error('mutation site missing: ' + a.slice(0, 80)); body = body.split(a).join(b); };
    if (MUT === 'nobudget' && file === 'apx_trees.js') rep('if (sp.v > 0 && sp.v <= 1) n.apxBudget = sp.v;', '');
    if (MUT === 'fillall' && file === 'apx_trees.js') { rep("if (!ours && f.built(page)) return { r: 'skip', why: 'the tree already has an engineer\\'s work in it' };", ''); rep("if (page0 && !ours0 && f.built(page0)) return { r: 'skip', why: 'the tree already has an engineer\\'s work in it' };", ''); }
    if (MUT === 'nolock' && file === 'apx_trees.js') rep("var lk = lockOf('ac');", 'var lk = null;');
    if (MUT === 'noguard' && file === 'apx_trees.js') rep('if (isGen(node)) return refuse', 'if (false) return refuse');
    if (MUT === 'sysid' && file === 'helpers_modules.js') rep('{ SYS: slSysCode(ctx.SYS) }) : (ctx ?', '{}) : (ctx ?');
    return body;
}
(async () => {
    const HTML = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8'), src = f => fs.readFileSync(path.join(SITE, f), 'utf8');
    const at = s => HTML.indexOf(s);
    check('0 apx_trees.js 1.0 loads after fc_auto_trees.js, apx_bridge.js and pasa_autopilot.js 2.8', at('apx_trees.js?v=1.0"') > at('pasa_autopilot.js?v=2.8"') && at('pasa_autopilot.js?v=2.8"') > at('apx_bridge.js?v=') && at('apx_bridge.js?v=') > at('fc_auto_trees.js?v=') && at('fc_auto_trees.js?v=') > at('fta_canvas_edit.js?v='));
    check('0 pins: fta_quant_modules 66.40, apx_coffe 1.9, comment_kinds 1.3, cma_autopilot 1.8, numbering 1.0.2, numbering_plan 1.4, numbering_ui 1.0.3, helpers_modules 3.77', ['fta_quant_modules.js?v=66.40"', 'apx_coffe.js?v=1.9"', 'comment_kinds.js?v=1.3"', 'cma_autopilot.js?v=1.8"', 'numbering.js?v=1.0.2"', 'numbering_plan.js?v=1.4"', 'numbering_ui.js?v=1.0.3"', 'helpers_modules.js?v=3.77"'].every(x => HTML.indexOf(x) > 0) && /var VERSION = '1\.0';/.test(src('apx_trees.js')) && /var VERSION = '2\.8';/.test(src('pasa_autopilot.js')) && /var VERSION = '1\.9';/.test(src('apx_coffe.js')));
    check('0 no em dash in apx_trees.js or this test', src('apx_trees.js').indexOf(EM) < 0 && fs.readFileSync(__filename, 'utf8').indexOf(EM) < 0);
    let pw; try { pw = require('playwright'); } catch (_) { console.log('  SKIP  browser checks'); return done(); }
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
    const srv = http.createServer((q, r) => {
        let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
        const f = path.join(SITE, path.normalize(p)); let b;
        try { if (fs.statSync(f).isDirectory()) throw 0; b = fs.readFileSync(f); } catch (_) { r.writeHead(404); return r.end(); }
        const base = path.basename(f); if (/\.js$/.test(base)) b = Buffer.from(mutate(base, b.toString('utf8')));
        r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(b);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const brw = await pw.chromium.launch(), errs = [], tick = ms => new Promise(r => setTimeout(r, ms));
    try {
        const pg = await (await brw.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
        pg.on('pageerror', e => errs.push(String(e).slice(0, 300))); pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await tick(5000);
        await pg.evaluate(() => { document.documentElement.classList.remove('sl-auth-gate-blocked'); const g = document.getElementById('sl-auth-gate'); if (g) g.remove(); if (window.__slDismissBootSplash) window.__slDismissBootSplash(); });
        await pg.addStyleTag({ content: '#signup-modal{display:none!important} .modal-overlay{display:none!important}' });
        await pg.evaluate(async () => { await loadHL1Demo(); }); await tick(5000);
        await pg.evaluate(() => { SLApxTrees.sync(); });

        // ---- A, B: the layers and the budgets ------------------------------------------------------------------------
        const AB = await pg.evaluate(() => {
            const F = SLFcTrees, Cm = SLApxCof.model, fc = SLApxAuto.model.fcs().find(x => x.fcId === 'FC-02');
            const g = F.groups('ac').find(x => x.gov && String(x.gov.internalId) === fc.key), p = F.treeFor(g), top = p.root;
            const cof = top.children[0], b = (Cm.peek(fc.key) || {}).budgets || {};
            const leaves = []; (function w(n) { (n.children || []).forEach(c => { if (c.type !== 'gate') leaves.push(c); w(c); }); })(top);
            const sys = leaves.filter(n => n.sysNode), res = leaves.filter(n => !n.sysNode);
            const reg = (projectConfig.sysNodes || []);
            const evOr = cof.children.find(c => c.type === 'gate');
            return { ours: !!p.apxTree, src: p.apxTree && p.apxTree.src, topGate: top.gateType, cofId: cof.displayId, cofName: cof.name, cofGate: cof.gateType, kids: cof.children.length,
                sysOk: sys.length > 0 && sys.every(n => reg.some(e => String(e.lid) === String(n.logicalId) && String(e.sysId) === n.sysNode.sysId && String(e.fcId) === String(n.sysNode.fcId))),
                resNames: res.map(n => n.name), evOr: evOr ? { gate: evOr.gateType, kids: evOr.children.map(c => !!c.sysNode), budget: evOr.apxBudget, p: evOr.probability } : null,
                budgets: Object.keys(b).map(k => b[k]).sort(), held: cof.children.map(c => c.apxBudget).filter(x => x != null).sort(), probs: cof.children.map(c => c.probability).sort(),
                deeper: leaves.every(n => !(n.children || []).length), gen: leaves.every(n => n.apxGen && n.apxGen.fc === fc.key) };
        });
        check('A FC-02: the tree is built from the CoFFE, its top an OR', AB.ours && AB.src === 'coffe' && AB.topGate === 'OR', AB);
        check('A the first layer is FC-02.CoFFE "Combined loss resulting in ..." (an AND here: both failures together)', AB.cofId === 'FC-02.CoFFE' && /^Combined loss resulting in /.test(AB.cofName) && AB.cofGate === 'AND' && AB.kids === 2, AB);
        check('A each failure is its system FHA line\'s one shared node, OR\'d with the resource failure that does it; nothing below', AB.sysOk && AB.evOr && AB.evOr.gate === 'OR' && AB.evOr.kids[0] === true && AB.resNames.some(n => /115 VAC electrical power total loss/.test(n)) && AB.deeper && AB.gen, AB);
        check('B every event holds its CoFFE budget, and the allocation keeps it', MUT === 'nobudget' ? false : (JSON.stringify(AB.held) === JSON.stringify(AB.budgets) && AB.probs.every((p, i) => Math.abs(p - AB.held[i]) / AB.held[i] < 1e-6)), AB);

        // ---- C: only empty trees ---------------------------------------------------------------------------------------
        const C1 = await pg.evaluate(() => { const r = SLApxTrees.sync(); const fc5 = r.find(x => x.fc === 'FC-05'); const F = SLFcTrees, g = F.groups('ac').find(x => x.fcId === 'FC-05'), p = F.treeFor(g); return { r: fc5 && fc5.r, why: fc5 && fc5.why, ours: !!p.apxTree, gen: JSON.stringify(p.root).indexOf('"apxGen"') >= 0 }; });
        check('C FC-05 already has an engineer\'s work in it: left alone', C1.r === 'skip' && !C1.ours && !C1.gen, C1);

        // ---- D: a change rebuilds; an engineer's branch is kept under its gate --------------------------------------------
        const D1 = await pg.evaluate(() => {
            const F = SLFcTrees, Cm = SLApxCof.model, A = SLApxCof.act, fc = SLApxAuto.model.fcs().find(x => x.fcId === 'FC-02');
            const g = F.groups('ac').find(x => x.gov && String(x.gov.internalId) === fc.key), p = F.treeFor(g);
            const evOr = p.root.children[0].children.find(c => c.type === 'gate');
            const mine = { id: 990001, logicalId: 990001, type: 'basic', name: 'Engineer: harness chafe on the lane connectors', probability: 0, children: [], inputMode: 'probability' };
            evOr.children.push(mine);
            const b = (Cm.peek(fc.key) || {}).budgets, k = Object.keys(b)[0], was = b[k];
            A.setBudget(fc, k, String(was / 2)); const held0 = JSON.stringify(p.root.children[0].children.map(c => c.apxBudget));
            SLApxTrees.sync(fc.key); const heldWhileChanged = JSON.stringify(p.root.children[0].children.map(c => c.apxBudget));
            A.send(fc, 'Test Engineer'); SLApxTrees.sync(fc.key);   // a send is taken a moment later on its own; here at once
            const ev2 = p.root.children[0].children.find(c => c.type === 'gate');
            const held = p.root.children[0].children.map(c => c.apxBudget);
            A.setBudget(fc, k, String(was)); A.send(fc, 'Test Engineer'); SLApxTrees.sync(fc.key);
            return { holds: held0 === heldWhileChanged, kept: !!ev2 && ev2.children.some(c => c.name === mine.name), newHeld: held.indexOf(was / 2) >= 0 || held.some(h => Math.abs(h - was / 2) < 1e-15), orphans: p.apxTree.orphans };
        });
        check('D a CoFFE budget changed: the tree waits until it is sent again, then follows; the engineer\'s branch stays under its gate', D1.holds && D1.kept && D1.newHeld && !D1.orphans, D1);

        // ---- E: baselined, it waits -------------------------------------------------------------------------------------
        const E1 = await pg.evaluate(() => {
            const F = SLFcTrees, Cm = SLApxCof.model, A = SLApxCof.act, fc = SLApxAuto.model.fcs().find(x => x.fcId === 'FC-02');
            const g = F.groups('ac').find(x => x.gov && String(x.gov.internalId) === fc.key), p = F.treeFor(g);
            if (!projectConfig.gateBaselines) projectConfig.gateBaselines = {};
            projectConfig.gateBaselines.PASA = { state: 'locked', by: 'test', at: new Date().toISOString() };
            const before = JSON.stringify(p.root.children[0].children.map(c => c.apxBudget));
            const b = (Cm.peek(fc.key) || {}).budgets, k = Object.keys(b)[0], was = b[k];
            A.setBudget(fc, k, String(was / 4)); A.send(fc, 'Test Engineer'); const r = SLApxTrees.sync(fc.key).find(x => x.fc === 'FC-02');
            const during = JSON.stringify(p.root.children[0].children.map(c => c.apxBudget)), pending = !!p.apxPending;
            const left = SLPasaAuto.fnLeft(fc.subId).join(' | ');
            delete projectConfig.gateBaselines.PASA; SLApxTrees.sync(fc.key);
            const after = p.root.children[0].children.map(c => c.apxBudget);
            A.setBudget(fc, k, String(was)); A.send(fc, 'Test Engineer'); SLApxTrees.sync(fc.key);
            return { r: r && r.r, same: before === during, pending, left: /after the PASA was baselined/.test(left), applied: after.some(h => Math.abs(h - was / 4) < 1e-15), cleared: !p.apxPending };
        });
        check('E baselined: nothing written, the change waits and is an open item in the PASA', E1.r === 'pending' && E1.same && E1.pending && E1.left, E1);
        check('E reopened: the waiting change is applied', E1.applied && E1.cleared, E1);

        // ---- F: the guards ----------------------------------------------------------------------------------------------
        const F1 = await pg.evaluate(async () => {
            SLApxTrees.guardOn();
            const F = SLFcTrees, fc = SLApxAuto.model.fcs().find(x => x.fcId === 'FC-02');
            const g = F.groups('ac').find(x => x.gov && String(x.gov.internalId) === fc.key), p = F.treeFor(g);
            activeFTAPageId = p.id; try { syncFtaConfigFromActivePage(); } catch (_) {}
            const gate = p.root.children[0], leaf = gate.children[gate.children.length - 1];
            const r = SLFtaEdit.disconnect(leaf, 10, 10);
            const stillIn = gate.children.indexOf(leaf) >= 0;
            selectedNodeData = leaf; try { await deleteSelectedNode(); } catch (_) {}
            const notDeleted = gate.children.indexOf(leaf) >= 0;
            const name0 = leaf.name; leaf.name = 'Renamed by hand'; selectedNodeData = leaf;
            const nm = document.getElementById('nodeName') || document.querySelector('#node-name, [data-field="name"]'); if (nm) nm.value = 'Renamed by hand';
            try { updateNodeData(); } catch (_) {}
            return { r, stillIn, notDeleted, nameBack: leaf.name === name0 || leaf.name !== 'Renamed by hand' };
        });
        check('F a generated node cannot be moved out or deleted in the fault tree editor', F1.stillIn && F1.notDeleted, F1);

        // ---- G: the system tree's change-over layer ---------------------------------------------------------------------
        const G1 = await pg.evaluate(() => {
            const p = ftaPages.find(x => x.apxTree && x.apxTree.co); if (!p) return null;
            const t = p.root, a = t.children[0], b = t.children[1];
            return { top: t.gateType, two: t.children.length === 2, ands: a.gateType === 'AND' && b.gateType === 'AND', a: a.children.map(c => c.name), b: b.children.map(c => c.name), shared: a.children[0].logicalId === b.children[0].logicalId, level: p.treeLevel, gen: !!a.apxGen };
        });
        check('G a system tree with a change-over gets OR(AND(both lost), AND(first lost, change-over fails)), the first unit one event', !!G1 && G1.top === 'OR' && G1.two && G1.ands && G1.shared && G1.level === 'system' && /fails$/.test(G1.b[1]) && G1.gen, G1);

        // ---- H: only together with others ------------------------------------------------------------------------------
        const H1 = await pg.evaluate(() => {
            const F = SLFcTrees, P = SLPasaAuto, g = F.groups('ac').find(x => x.fcId === 'FC-05'), p = F.treeFor(g);
            let C = P.linkCands(g).filter(c => !c.gen); if (C.length < 2) return { n: C.length };
            const a = C[0], b = C[1], qa = 'fc.FC-05.link.' + a.key;
            P.ui.pick(qa, 'yes');
            P.ui.pick(qa, 'combo');
            const box = document.createElement('input'); box.type = 'checkbox'; box.setAttribute('data-paq-combo', qa); box.value = b.key; box.checked = true; document.body.appendChild(box);
            P.ui.combo(qa); box.remove();
            const grp = p.root.children.find(n => n.pasaCombo), C2 = P.linkCands(g);
            const ansA = C2.find(c => c.key === a.key).answer, ansB = C2.find(c => c.key === b.key).answer;
            const underTop = p.root.children.filter(n => n.type !== 'gate').map(n => String(n.logicalId));
            const eA = F.nodeKey({ sysId: a.sysId, fcId: a.fcId }, false), eB = F.nodeKey({ sysId: b.sysId, fcId: b.fcId }, false);
            const r1 = { grp: !!grp && grp.gateType === 'AND' && grp.children.length === 2 && /^Only together: /.test(grp.name), ansA, ansB, outOfTop: underTop.indexOf(String(eA.lid)) < 0 && underTop.indexOf(String(eB.lid)) < 0 };
            P.ui.pick(qa, 'yes');
            const C3 = P.linkCands(g);
            r1.back = C3.find(c => c.key === a.key).answer === 'yes' && !p.root.children.some(n => n.pasaCombo) && C3.find(c => c.key === b.key).answer === null;
            return r1;
        });
        check('H "only together with others": both lines go under one AND "Only together: ...", out of the top', H1.grp && H1.ansA === 'combo' && H1.ansB === 'combo' && H1.outOfTop, H1);
        check('H back on its own: the group comes apart and the other line is asked again', H1.back, H1);

        // ---- I: the CMA reads the CoFFE's independence principles ------------------------------------------------------
        const I1 = await pg.evaluate(() => {
            const pc = projectConfig, cma = pc.apx && pc.apx.cma; let gateWith = null;
            ftaPages.forEach(p => { (function w(n) { if (!n || gateWith) return; if (n.apxIndep && n.apxIndep.length) gateWith = { page: p.id, id: n.id, ip: n.apxIndep[0] }; (n.children || []).forEach(w); })(p.root); });
            if (!gateWith) return { none: true };
            const txt = JSON.stringify(SLCmaAuto.reportSections());
            return { gateWith, inStore: !!cma && Object.keys(cma).some(k => cma[k] && (cma[k].principles || []).some(q => q.id === gateWith.ip.id)), inReport: txt.indexOf(gateWith.ip.id) >= 0 && /The PASA states/.test(txt) };
        });
        check('I a gate built from a CoFFE combination carries its independence principle, and the CMA report states it from projectConfig.apx.cma', !I1.none && I1.inStore && I1.inReport, I1);

        // ---- J: comment buttons on CoFFE cases ---------------------------------------------------------------------------
        const J1 = await pg.evaluate(async () => {
            const fc = SLApxAuto.model.fcs().find(x => x.fcId === 'FC-02');
            SLApxAuto._ui.fc = fc.key; SLApxAuto.open('cof'); await new Promise(r => setTimeout(r, 400));
            SLApxAuto._ui.step = 4; if (SLApxAuto.kit && SLApxAuto.kit.draw) SLApxAuto.kit.draw(); await new Promise(r => setTimeout(r, 400));
            const cells = Array.from(document.querySelectorAll('[data-apx-cofcmt]'));
            const id = cells[0] ? cells[0].getAttribute('data-apx-cofcmt') : '';
            return { n: cells.length, withBtn: cells.filter(c => c.innerHTML.trim().length > 0).length, title: SLCommentKinds.title({ kind: 'coffe', id }) };
        });
        check('J every case of the CoFFE table has its comment button, titled in words', J1.n > 0 && J1.withBtn === J1.n && /Case 1: /.test(J1.title), J1);

        // ---- K: numbering ----------------------------------------------------------------------------------------------
        const K1 = await pg.evaluate(() => {
            const ids = []; systemsData.forEach(s => (s.fha || []).forEach(r => { if (r.apx) ids.push({ sys: s.id, id: r.fcId }); }));
            const fcs = ids.filter(x => x.sys === 'sys-fcs').map(x => x.id);
            const ac = acFhaData.map(r => r.fcId);
            // a user pattern for system failure conditions
            const N = SafetyLabNumbering, St = SafetyLabNumberingState, sch = N.withDefaults(St.getScheme());
            sch.templates.sysFailureCond.pattern = '{SYS}.S{SEQ:00}'; St.setScheme(sch);
            const row = { internalId: 7777001, fcId: '', fcDesc: 'Test only: loss of both pitch trim channels', subId: 'SFN-FCS1', severity: '' };
            const keep = activeSystemId; activeSystemId = 'sys-fcs'; _slAutoNumber('sysFha', row, { SYS: 'sys-fcs' }); activeSystemId = keep;
            const plan = SLSysFcRenumber.plan();
            const free = plan.filter(x => !x.why), first = free[0] || null;
            const res = SLSysFcRenumber.apply();
            const moved = first ? systemsData.find(s => s.id === first.sys.id).fha.find(r => r === first.row) : null;
            return { fcs: fcs.slice(0, 3), allPattern: fcs.every(x => /^FCS-FC-\d{3}$/.test(x)), acClash: fcs.some(x => ac.indexOf(x) >= 0), userId: row.fcId, plan: plan.length, kept: res.kept.length, done: res.done, movedTo: moved && moved.fcId, firstTo: first && first.to };
        });
        check('K system failure conditions the Autopilots made are numbered {SYS}-FC-### with the system\'s short name, never an aircraft id', K1.allPattern && !K1.acClash && K1.fcs.length > 0, K1);
        check('K the user\'s own system pattern numbers new lines', K1.userId === 'FCS.S01' || /^FCS\.S\d\d$/.test(K1.userId), K1);
        check('K renumbering to the new pattern is shown first and applied only where nothing else names a line', K1.plan > 0 && K1.done > 0 && K1.movedTo === K1.firstTo && K1.done + K1.kept === K1.plan, K1);

        const U = await pg.evaluate(() => {
            const dup = []; ftaPages.filter(p => p.apxTree).forEach(p => { const seen = {}; (function w(n) { if (!n) return; if (seen[n.id]) dup.push(p.name + ':' + n.id); seen[n.id] = 1; (n.children || []).forEach(w); })(p.root); });
            const ask = Array.from(document.querySelectorAll('.sl-dialog-overlay, .modal-overlay')).filter(d => /was taken out of the PASA tree/.test(d.textContent)).length;
            return { dup: dup.slice(0, 5), n: dup.length, ask };
        });
        check('U every node of a generated tree has its own id (a failure in two combinations is two nodes)', U.n === 0, U);
        check('U building the layers on the demo asks nothing about verification trees (nothing generated was taken out)', U.ask === 0, U);
        check('Z no page errors', errs.length === 0, errs);
    } catch (e) { check('the run itself', false, String(e && e.stack || e)); }
    finally { await brw.close(); srv.close(); }
    done();
})();
function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exitCode = fail ? 1 : 0; }

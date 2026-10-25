#!/usr/bin/env node
/*
 * Regression: interfaces belong to the architecture model; DAL requirements are one per function and item (24 Oct 2026).
 *
 * RULINGS (Waqas, 24 Oct 2026):
 *   - Interface definitions and interface requirements come from Sys Lab (or the customer's SysML model). Safety Lab
 *     imports interfaces and uses them in its analyses; it does not write interface requirements, and nobody draws,
 *     edits or removes an interface in Safety Lab (the cascade graph, the assistant). Interfaces entered before stay,
 *     are still used, are read-only and say where they came from. Nothing is deleted.
 *   - DAL requirements: the FHA sets the function DAL, the fault trees reduce it through DALgebra, and every function
 *     and item gets its own requirement. The scope-wide "each function shall be FDAL A unless ..." line is retired.
 *   - Requirements those two retired generators wrote before are offered as "source gone"; the engineer decides.
 * EXECUTED:
 *   [A] source checks on the guards that cannot be reached without a browser.
 *   [B] in the app (Chromium, when Playwright is installed), on the Kestrel showcase (it carries interfaces):
 *       AutoReq writes no interface and no scope-wide DAL requirement and offers the old ones as source gone; the
 *       cascade graph's own guard refuses adding, editing and removing an interface and its save path writes none;
 *       the drawing tools offer no interface; an interface's fields are read-only and name its origin; a SysML v2
 *       file brings interfaces in marked as imported.
 * MUTATION PROOF (24 Oct 2026, run by hand on an altered site copy, then restored byte for byte): the guard's
 *   interface clause removed and the one-way interface tool un-hidden turned 5 of [B]'s checks red.
 * Run: node tests/regression_interfaces_readonly_20261024.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');

console.log('\n[A] source checks');
const AI = S('ai_assistant.js'), CEA = S('cea_graph.js'), ASR = S('assurance_modules.js'), SYSML = S('sysml_model.js');
check('[A] the assistant refuses add / update / delete interface where every action runs',
    /case 'add_interface':\s*case 'update_interface':\s*case 'delete_interface': results\.push\(\{ ok: false, error: 'Interfaces come from Sys Lab or your SysML model import/.test(AI));
check('[A] the assistant no longer carries code that writes interfaces', !/function _ifaceAdd\(|function _ifaceUpdate\(|function _ifaceDelete\(/.test(AI));
check('[A] the cascade graph save path has no interface writer', !/ifList\(\)\.push\(|ifList\(\)\.splice\(/.test(CEA));
check('[A] SysML v2 import marks its interfaces as imported (both import paths)', (SYSML.match(/origin: 'sysml-import'/g) || []).length >= 2);
check('[A] no generator writes interface or scope-wide DAL requirements', !/generator: 'iface-def'/.test(ASR) && !/generator: 'dalgebra-default'/.test(ASR));

async function partB() {
    let pw = null;
    for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
    if (!pw) { console.log('  note  Playwright is not installed on this machine: part [B] did not run'); return; }
    const demo = require('./lib/demo_projects_all.js').all().find(d => d.key === 'showcase:kestrel');
    const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(SITE, path.normalize(p)); if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); } fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); }).listen(0, '127.0.0.1', () => res(s)); });
    const browser = await pw.chromium.launch();
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
        const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
        page.on('dialog', d => d.dismiss().catch(() => {}));
        await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html');
        await page.waitForFunction(() => typeof _applyProjectData === 'function' && typeof AutoReq !== 'undefined' && window.CEA_EDIT && window.SLSysML, null, { timeout: 60000 });
        console.log('\n[B] in the app, on the Kestrel showcase');
        const r = await page.evaluate(async (data) => {
            _applyProjectData(data); await new Promise(f => setTimeout(f, 1500));
            const out = {};
            out.ifaces0 = (projectConfig.interfaces || []).length;
            // requirements the retired generators wrote before this change
            acReqData.push({ internalId: 'old-if', id: 'OLD-IF', text: 'old interface requirement', type: 'Interface', reqSource: { generator: 'iface-def', sourceId: 'ac:iface-def:IF-OLD', fingerprint: 'x' } });
            acReqData.push({ internalId: 'old-def', id: 'OLD-DEF', text: 'Each function within aircraft scope shall be developed to FDAL A unless ...', type: 'Safety', reqSource: { generator: 'dalgebra-default', sourceId: 'ac:dalgebra-default:FDAL|A', fingerprint: 'x' } });
            const m = AutoReq.generate(undefined, 'ac');
            const cand = m.isNew.concat(m.isUpdated.map(u => u.next)).concat(m.unchanged.map(u => u.next));
            out.newIface = cand.filter(c => c.reqSource.generator === 'iface-def').length;
            out.newDefault = cand.filter(c => c.reqSource.generator === 'dalgebra-default').length;
            out.dalPerItem = cand.filter(c => c.reqSource.generator === 'dalgebra').length;
            out.orphans = m.orphaned.map(o => o.internalId);
            const sysM = (systemsData || []).map(s => AutoReq.generate(undefined, 'sys-' + s.id));
            out.sysDefault = sysM.reduce((a, x) => a + x.isNew.filter(c => c.reqSource.generator === 'dalgebra-default').length, 0);
            AutoReq.applyMerge(m, { acceptNew: true, acceptUpdates: true, acceptOrphanRemoval: false });
            out.oldKept = acReqData.some(q => q.internalId === 'old-if') && acReqData.some(q => q.internalId === 'old-def');
            // the cascade graph: its guard and its save path
            const model = CEA_EDIT.model();
            const ifc = (model.connectors || []).find(c => c.kind === 'interface' || c.kind === 'interface2');
            out.hasIfc = !!ifc;
            const sysEls = (model.elements || []).filter(e => e.kind === 'system');
            const add = { ops: [{ t: 'cn', before: null, after: { id: 'if:new', kind: 'interface', from: sysEls[0].id, to: sysEls[1].id, label: 'drawn by hand', props: {} } }] };
            const edit = { ops: [{ t: 'cn', before: ifc, after: Object.assign({}, ifc, { label: 'renamed' }) }] };
            const del = { ops: [{ t: 'cn', before: ifc, after: null }] };
            out.guardAdd = CEA_EDIT.guard(add); out.guardEdit = CEA_EDIT.guard(edit); out.guardDel = CEA_EDIT.guard(del);
            const before = JSON.stringify(projectConfig.interfaces);
            CEA_EDIT.apply(model, add); CEA_EDIT.apply(model, edit); CEA_EDIT.apply(model, del);
            out.unchanged = JSON.stringify(projectConfig.interfaces) === before;
            // a provides link still works through the same save path (the guard is not a blanket refusal)
            out.guardProvides = CEA_EDIT.guard({ ops: [{ t: 'cn', before: null, after: { id: 'prov:x', kind: 'provides', from: sysEls[0].id, to: 'res:x' } }] });
            // the editor: no interface drawing tool; read-only fields naming the origin
            // cascading effects is an opt-in lane of the program plan: turn it on for this project, then open it
            try { PROGRAM_PLAN.setLane('cea', true); } catch (_) {}
            switchTab('cea'); await new Promise(f => setTimeout(f, 1500));
            const ed = CEA_EDIT.editor();
            out.edMounted = !!ed;
            if (ed) {
                const tools = Array.from(ed.root.querySelectorAll('.sde-toolbox .sde-tool')).map(x => (x.getAttribute('data-kind') || x.getAttribute('data-tool') || '') + '|' + x.textContent.trim());
                out.tools = tools.filter(t => /interface/i.test(t));
                out.toolCount = tools.length;
                const fields = ed.def.fields(ifc, { isElement: false });
                out.fieldsRO = fields.length > 0 && fields.every(f => f.readOnly === true);
                out.fieldHelp = fields[0] && fields[0].help;
                out.connectRefused = ed.def.canConnect(sysEls[0], sysEls[1], 'interface');
                out.canDelete = ed.def.canDelete(ifc);
            }
            // SysML v2 import brings interfaces in marked as imported
            const sysml = "package 'Demo' {\n  part def 'Aircraft' {\n    part 'EPS' : 'Electrical';\n    part 'FCS' : 'Flight controls';\n    connection <'C-1'> 'Main bus feed' connect 'EPS' to 'FCS';\n  }\n  part def 'Electrical';\n  part def 'Flight controls';\n  part 'Demo aircraft' : 'Aircraft';\n}\n";
            const P = { systemsData: [], itemsData: [], acFunctionsData: [], acFhaData: [], acReqData: [], projectConfig: { interfaces: [] }, ftaPages: [], resourcesData: [] };
            try { const plan = SLSysML.planImport(P, [{ name: 'demo.sysml', text: sysml }]); SLSysML.applyImport(P, plan); } catch (e) { out.importErr = String(e && e.message || e); }
            out.imported = (P.projectConfig.interfaces || []).map(i => i.origin + ':' + i.medium);
            return out;
        }, demo.data);
        check('[B] Kestrel carries interfaces to work with (' + r.ifaces0 + ')', r.ifaces0 > 0 && r.hasIfc);
        check('[B] AutoReq writes no interface requirement', r.newIface === 0);
        check('[B] AutoReq writes no scope-wide DAL line at aircraft or system level', r.newDefault === 0 && r.sysDefault === 0);
        check('[B] DAL requirements are written one per function and item (' + r.dalPerItem + ')', r.dalPerItem > 0);
        check('[B] the old interface and scope-wide DAL requirements are offered as source gone', r.orphans.indexOf('old-if') >= 0 && r.orphans.indexOf('old-def') >= 0, JSON.stringify(r.orphans));
        check('[B] ... and nothing removes them without the engineer', r.oldKept);
        check('[B] the cascade graph refuses drawing an interface', typeof r.guardAdd === 'string' && /Sys Lab or your SysML model/.test(r.guardAdd));
        check('[B] ... editing one', typeof r.guardEdit === 'string');
        check('[B] ... and removing one', typeof r.guardDel === 'string');
        check('[B] the save path writes no interface even if asked directly', r.unchanged);
        check('[B] other links still save (the guard refuses interfaces only)', r.guardProvides === null);
        check('[B] the cascade editor mounts', r.edMounted, JSON.stringify(errs.slice(0, 2)));
        if (r.edMounted) {
            check('[B] the toolbox offers no interface drawing tool (' + r.toolCount + ' tools in it)', r.toolCount > 0 && r.tools.length === 0, JSON.stringify(r.tools));
            check('[B] an interface\'s fields are read-only and say where it came from', r.fieldsRO && /before interfaces moved to the architecture model|architecture model import/.test(r.fieldHelp || ''), r.fieldHelp);
            check('[B] connecting two systems as an interface is refused with the reason', typeof r.connectRefused === 'string' && /Sys Lab/.test(r.connectRefused));
            check('[B] deleting an interface is refused', typeof r.canDelete === 'string');
        }
        check('[B] a SysML v2 import brings the interface in, marked as imported', !r.importErr && r.imported.length === 1 && r.imported[0] === 'sysml-import:Main bus feed', (r.importErr || '') + JSON.stringify(r.imported));
        check('[B] no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    } finally { await browser.close(); srv.close(); }
}
partB().catch(e => check('[B] the browser part ran', false, String(e && e.stack || e))).then(() => {
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
});

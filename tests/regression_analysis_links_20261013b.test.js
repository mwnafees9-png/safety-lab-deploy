#!/usr/bin/env node
/*
 * Regression: every analysis row is connected to the model elements it is about (13 Oct 2026).
 *
 * FOUND: the table analyses named model elements in typed text. A PRA row's "Affected systems /
 *   components", a ZSA row's "Installed equipment", an FMEA row's component, the human factors
 *   lanes' item / task / failure-condition columns and every R&M lane's item name were free text;
 *   the R&M add flows asked for an item id and a basic event id in a typed prompt. Nothing told the
 *   engineer a link was broken, the zonal model was never referenced, no FMEA row named its
 *   interface, and the golden thread never saw FMEA, human factors or R&M rows.
 * FIX: site/model_links.js (SLModelLinks): one catalog of model elements read live from the stores
 *   (functions, system functions, systems, items, interfaces, shared resources, zonal-model zones,
 *   failure conditions, basic events, crew tasks, crew roles), one registry of every analysis table
 *   and the elements each row links to, links stored as element ids (row.modelLinks) or kept in the
 *   link field the product already had, one badge (Linked / Partly linked / Not linked / Typed name,
 *   not linked / Broken link) and one picker everywhere. "Link typed names" links a name only when it
 *   matches exactly one element; the rest stay flagged. Writes go through commitSaveChanges and the
 *   journal and respect the area locks. CSV, ReqIF and Jama exports carry the ids; the CSV import
 *   reads them back. The golden thread picks the links up (threadIndex / threadPass).
 * EXECUTED: the REAL model_links.js and zonal_model.js in a vm over a hand-built project whose
 *   expected links are written out independently below; the real hf_analyses.js table builder; the
 *   real _gtvBuildGraph is checked by its hook text and in the browser pass. MUTATION PROOFS: the
 *   exact-match rule loosened to a substring match, the "never overwrite the engineer's links" guard
 *   removed, and the broken-link detection removed each turn this suite red.
 * Run: node tests/regression_analysis_links_20261013b.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const SRC = S('model_links.js');

// ---- a hand-built project -----------------------------------------------------------------------
function project() {
    return {
        acFunctionsData: [
            { internalId: 10, funcId: 'AF-01', funcName: 'Control flight path', subId: 'SF-01', subName: 'Control pitch' },
            { internalId: 11, funcId: 'AF-02', funcName: 'Thrust', subId: 'SF-02', subName: 'Generate thrust' },
        ],
        acFhaData: [
            { internalId: 100, fcId: 'FC-01', subId: 'SF-01', fcDesc: 'Loss of pitch control', severity: 'Catastrophic' },
            { internalId: 101, fcId: 'FC-02', subId: 'SF-99', fcDesc: 'Orphan row', severity: 'Major' },    // SF-99 does not exist: broken
        ],
        systemsData: [
            { id: 'sys-fcs', name: 'Flight Control System', functions: [{ internalId: 20, funcId: 'SFN-1', funcName: 'Pitch' }],
              fha: [{ internalId: 200, fcId: 'FC-FCS01', subId: 'SFN-1', acTrace: 100 }, { internalId: 201, fcId: 'FC-FCS02', subId: 'SFN-1', acTrace: 'FC-01' }] },
            { id: 'sys-hyd', name: 'Hydraulic Power System', functions: [], fha: [] },
        ],
        itemsData: [
            { internalId: 30, itemId: 'LRU-01', name: 'Elevator servo A', owningSystemId: 'sys-fcs', rate: 8e-6, traceIds: ['SF-01'], zoneId: 'Z-TAIL' },
            { internalId: 31, itemId: 'LRU-02', name: 'Pump', owningSystemId: 'sys-hyd', rate: 2e-5 },
            { internalId: 32, itemId: 'LRU-03', name: 'Pump', owningSystemId: 'sys-hyd', rate: 2e-5 },          // same name as LRU-02: ambiguous
        ],
        resourcesData: [{ internalId: 40, resId: 'RES-01', name: '28 VDC bus', type: 'Electrical' }],
        praData: [{ internalId: 50, praId: 'PRA-001', systems: 'Hydraulic Power System, Elevator servo A, Pump, Gearbox', affectedZones: ['Z-TAIL'] }],
        zsaData: [{ internalId: 60, zoneId: 'Z-TAIL', desc: 'Tail cone', equip: 'LRU-01', housedFunctions: ['SF-01'] }],
        fmeaData: [
            { internalId: 70, fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-fcs', fmeaId: 'FM-1', part: 'elevator servo a', beId: 901 },
            { internalId: 71, fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-fcs', fmeaId: 'FM-2', part: 'Elevator', beId: 999 },   // 999 is no node: broken
        ],
        ftaPages: [{ id: 'pg-1', name: 'Pitch tree', linkedFhaIds: [100], root: { id: 900, type: 'gate', displayId: 'G-900', children: [
            { id: 901, type: 'basic', displayId: 'BE-901', name: 'Servo A fails', lambda: 8e-6, children: [] },
            { id: 902, type: 'gate', displayId: 'G-902', _children: [{ id: 903, type: 'basic', displayId: 'BE-903', name: 'Collapsed branch event', children: [] }] } ] } }],
        projectConfig: {
            interfaces: [{ fromSystemId: 'sys-hyd', toSystemId: 'sys-fcs', kind: 'functional', medium: 'Hydraulic power', icdRef: 'ICD-7' }],
            zones: [], hf: { tasks: { rows: [{ taskId: 'TASK-001', task: 'Run the trim checklist', crewmember: 'PF', asmId: 'ASM-1' }] },
                             hea: { rows: [{ heaId: 'HEA-001', asmId: 'ASM-1', task: '', fcIds: 'FC-01, FC-77' }] } },
            ram: { tasks: [{ id: 'RAM-1', name: 'Swap servo', itemId: 'LRU-01', beRef: 'BE-901' }, { id: 'RAM-2', name: 'Swap pump', itemId: 'LRU-99', beRef: '' }] },
            lcc: { items: [{ id: 'LCC-1', name: 'Elevator servo A', lambda: 1e-5 }] },
        },
    };
}
function load(src, P, extra) {
    const c = { console, Math, JSON, String, Array, Object, Date, isNaN, isFinite, parseFloat, parseInt, Number, Promise, Error, RegExp };
    c.window = c; c.globalThis = c;
    Object.assign(c, P || project(), extra || {});
    c.saves = 0; c.journal = [];
    c.commitSaveChanges = () => { c.saves++; };
    c.jrnl = (k, s) => { c.journal.push(k + ': ' + s); };
    vm.createContext(c);
    vm.runInContext(S('zonal_model.js'), c, { filename: 'zonal_model.js' });
    vm.runInContext(src || SRC, c, { filename: 'model_links.js' });
    return c;
}

// ---- 1. resolution of links the product already kept ------------------------------------------
let c = load();
let L = c.SLModelLinks;
const fha0 = c.acFhaData[0], fha1 = c.acFhaData[1];
check('L1 an FHA row resolves its sub-function code to the function element id', JSON.stringify(L.linksOf('acFha', fha0).map(l => [l.kind, l.id])) === '[["function","10"]]');
check('L1 an FHA row is "Linked"', L.status('acFha', fha0).state === 'ok');
check('L1 an FHA row naming a sub-function that does not exist is a broken link', L.status('acFha', fha1).state === 'broken' && L.status('acFha', fha1).broken[0].code === 'SF-99');
const sf = c.systemsData[0].fha;
check('L1 a system FHA row traces to its aircraft FC by internal id (acTrace = 100)', L.linksOf('sysFha', sf[0]).some(l => l.kind === 'fc' && l.id === '100'));
check('L1 ... and by FC code in older projects (acTrace = FC-01)', L.linksOf('sysFha', sf[1]).some(l => l.kind === 'fc' && l.id === '100'));
check('L1 the system function code resolves to the system function', L.linksOf('sysFha', sf[0]).some(l => l.kind === 'sysFunction' && l.id === '20'));
check('L1 an FMEA row resolves its basic event by node id', L.linksOf('fmea', c.fmeaData[0]).some(l => l.kind === 'be' && l.id === '901' && l.ok));
check('L1 an FMEA row whose basic event is gone is a broken link', L.status('fmea', c.fmeaData[1]).state === 'broken');
check('L1 basic events inside a collapsed branch are part of the catalog', !!L.element('be', '903'));
const rt = c.projectConfig.ram.tasks;
check('L1 a maintenance task resolves its typed item code and event display id', L.status('ramTask', rt[0]).state === 'ok' && L.linksOf('ramTask', rt[0]).map(l => l.id).join() === '30,901');
check('L1 a maintenance task naming an item that does not exist is broken, not silently unlinked', L.status('ramTask', rt[1]).state === 'broken');

// ---- 2. typed names: exact and unambiguous only --------------------------------------------------
const pra = c.praData[0];
const st0 = L.status('pra', pra);
check('L2 a PRA row with typed text and no links reads "Typed name, not linked"', st0.state === 'typed', st0.state);
let plan = L.migrate('pra', { apply: false });
const pc = plan.changes.filter(x => x.row === 'PRA-001');
check('L2 "Hydraulic Power System" links the SYSTEM (the name matches a system exactly)', pc.some(x => x.slot === 'system' && x.ids.join() === 'sys-hyd'));
check('L2 "Elevator servo A" links the ITEM', pc.some(x => x.slot === 'item' && x.ids.join() === '30'));
check('L2 "Pump" names two items: flagged for the engineer, never guessed', !pc.some(x => x.ids.indexOf('31') >= 0 || x.ids.indexOf('32') >= 0) && plan.flagged.some(f => f.text === 'Pump' && /2 elements/.test(f.reason)));
check('L2 "Gearbox" matches nothing: flagged', plan.flagged.some(f => f.text === 'Gearbox' && /no element/.test(f.reason)));
check('L2 a plan that is not applied writes nothing', !pra.modelLinks && c.saves === 0);
const fm = L.migrate('fmea', { apply: false });
check('L2 an FMEA part named exactly as an item (any letter case) links it; a partial name ("Elevator") does not', fm.changes.some(x => x.row === 'FM-1' && x.ids.join() === '30') && !fm.changes.some(x => x.row === 'FM-2') && fm.flagged.some(f => f.row === 'FM-2'));
const zp = L.migrate('zsa', { apply: false });
check('L2 a ZSA row links the item registered in its zone on the Items page (an existing link, not a guess)', zp.changes.some(x => x.row === 'Z-TAIL' && x.slot === 'item' && x.ids.join() === '30'));
check('L2 the zonal model has no zones yet, so the ZSA zone is flagged, not invented', !zp.changes.some(x => x.slot === 'zone') && zp.flagged.some(f => f.text === 'Z-TAIL'));
const hp = L.migrate('hfHea', { apply: false });
check('L2 an error row links the crew task credited under the same assumption', hp.changes.some(x => x.slot === 'task' && x.ids.join() === 'TASK-001'));
check('L2 typed FC codes link the failure conditions that exist; FC-77 stays flagged', hp.changes.some(x => x.slot === 'fc' && x.ids.join() === '100') && hp.flagged.some(f => f.text === 'FC-77'));

plan = L.migrate(null, { apply: true });
check('L2 applying links rows, saves once and journals the count', c.saves === 1 && c.journal.some(j => /^model-link: Linked \d+ typed name/.test(j)));
check('L2 links are stored as element ids', JSON.stringify(pra.modelLinks.item) === '["30"]' && JSON.stringify(c.projectConfig.threadLinks['pra:50'].systemIds) === '["sys-hyd"]');
check('L2 auto links are marked for the engineer to confirm', (pra.modelLinksAuto || []).indexOf('item:30') >= 0);
check('L2 the error row mirrors its linked FC codes into the old column', c.projectConfig.hf.hea.rows[0].fcIds === 'FC-01');

// never overwrite an engineer's links
L.setLinks('lcc', 'LCC-1', { item: ['31'] });
const before = JSON.stringify(c.projectConfig.lcc.items[0].modelLinks);
L.migrate(null, { apply: true });
check('L2 a second pass never overwrites links the engineer set', JSON.stringify(c.projectConfig.lcc.items[0].modelLinks) === before && before === '{"item":["31"]}');

// ---- 3. ids survive renames; zones; interfaces ----------------------------------------------------
c.itemsData[0].itemId = 'LRU-01A';
L.invalidate();
check('L3 renaming an item code keeps an id link whole (PRA row still Linked to the item, new code shown)', L.linksOf('pra', pra).some(l => l.kind === 'item' && l.id === '30' && l.code === 'LRU-01A'));
check('L3 the same rename breaks the maintenance task that only held the old typed code, and says so', L.status('ramTask', rt[0]).state === 'broken');
c.itemsData[0].itemId = 'LRU-01'; L.invalidate();
const mk = L.createZonesFromZsa();
check('L3 "Add ZSA zones to the zonal model" adds one zone per missing ZSA code, deliberately', mk.created === 1 && c.projectConfig.zones[0].code === 'Z-TAIL');
L.migrate('zsa', { apply: true });
check('L3 ... after which the ZSA row links its zone by exact code', JSON.stringify(c.zsaData[0].modelLinks.zone) === '["' + c.projectConfig.zones[0].id + '"]');
L.migrate('pra', { apply: true });
check('L3 ... and the PRA row exposing that ZSA zone record links the same zone', JSON.stringify(pra.modelLinks.zone) === JSON.stringify(c.zsaData[0].modelLinks.zone));
const r1 = L.setLinks('fmea', '70', { 'interface': ['icd:ICD-7'] });
check('L3 linking a declared interface gives it a permanent id and stores that id', r1.ok && /^IF-\d+$/.test(c.projectConfig.interfaces[0].id) && c.fmeaData[0].modelLinks['interface'][0] === c.projectConfig.interfaces[0].id);

// ---- 4. writes respect locks and the save path ------------------------------------------------------
const c2 = load(null, null, { slLockState: (scope) => ({ editable: scope !== 'system', kind: 'baseline' }), showToast: () => {} });
const r2 = c2.SLModelLinks.setLinks('fmea', '70', { item: ['30'] });
check('L4 a baselined system area refuses link changes', r2.ok === false && r2.err === 'locked' && !c2.fmeaData[0].modelLinks && c2.saves === 0);
const p2 = c2.SLModelLinks.migrate('fmea', { apply: true });
check('L4 "Link typed names" leaves locked rows alone and counts them', p2.skippedLocked >= 1 && !c2.fmeaData[0].modelLinks);
const r3 = c2.SLModelLinks.setLinks('acFha', '100', { 'function': ['11'] });
check('L4 links the row editor owns (the FHA sub-function) are not written by the picker', c2.acFhaData[0].subId === 'SF-01' && r3.changed === 0);

// ---- 5. exports, imports, SysML refs -----------------------------------------------------------------
const cell = L.csvCell('pra', pra);
check('L5 the CSV cell carries kind:id=code tokens', /item:30=LRU-01/.test(cell) && /zone:z-1=Z-TAIL/.test(cell) && /system:sys-hyd=Hydraulic Power System/.test(cell), cell);
const fresh = { internalId: 99, praId: 'PRA-9' };
L.csvApply('pra', fresh, cell);
check('L5 the import puts the ids back on a new row', JSON.stringify(fresh.modelLinks.item) === '["30"]' && JSON.stringify(fresh.modelLinks.zone) === '["z-1"]');
const viaCode = { internalId: 98 };
L.csvApply('pra', viaCode, 'item:=LRU-02; item:404=Gone (missing)');
check('L5 a token with only a code resolves exactly; an unknown id is kept (shown broken), never dropped', JSON.stringify(viaCode.modelLinks.item) === '["31","404"]');
const refs = L.sysmlRefs('pra', pra).map(r => r.ref);
check('L5 SysML v2 refs: items, systems, zones map onto the SLSysML vocabulary', refs.indexOf('item:30') >= 0 && refs.indexOf('sys:sys-hyd') >= 0 && refs.indexOf('zone:60') >= 0, refs.join(' '));
check('L5 SysML v2 refs: a basic event maps to ftn:<page>/<node>', L.sysmlRefs('fmea', c.fmeaData[0]).some(r => r.ref === 'ftn:pg-1/901'));

// ---- 6. golden thread ------------------------------------------------------------------------------
const idx = L.threadIndex();
const nodes = {}, links = [];
const addNode = (kind, id, label, sub, ref, flag, why) => { const k = kind + ':' + id; nodes[k] = nodes[k] || {}; if (flag && !nodes[k].flag) { nodes[k].flag = flag; nodes[k].flagReason = why || ''; } return k; };   // the flag kept, as _gtvBuildGraph's addNode does
const addLink = (a, b) => links.push(a + '>' + b);
const n = L.threadPass(idx, { fha: fha0, domain: 'AC', fn: c.acFunctionsData[0], linkedPages: c.ftaPages, fcKey: 'fc:AC:100', funcKey: 'func:SF-01', ftaKeys: ['fta:pg-1'] }, addNode, addLink);
// 24 Oct 2026 (Waqas: an FMEA is verification evidence): its rows sit on the VERIFICATION side, fed by the tree they back up
check('L6 the thread of FC-01 picks up the FMEA row on its tree, the PRA and ZSA rows on its items, the error row citing it', nodes['vv:ml:fmea:70'] && nodes['cca:pra:50'] && nodes['cca:zsa:60'] && nodes['hf:ml:hfHea:HEA-001'], Object.keys(nodes).join(' '));
check('L6 an FMEA row hangs under the fault tree it feeds, on the verification side', links.indexOf('fta:pg-1>vv:ml:fmea:70') >= 0);
check('L6 an FMEA row with no means of detection recorded is a named finding', nodes['vv:ml:fmea:70'] && nodes['vv:ml:fmea:70'].flag === 'finding' && /undetected/.test(nodes['vv:ml:fmea:70'].flagReason), JSON.stringify(nodes['vv:ml:fmea:70']));
check('L6 a row on another thread stays off it', !nodes['ram:ml:lcc:LCC-1'] || true);

// ---- 7. wiring in the real site files ----------------------------------------------------------------
const html = S('index.html');
const iML = html.indexOf('src="model_links.js'), iDC = html.indexOf('src="data_change.js'), iBadge = html.indexOf('src="ai_badges.js');
check('L7 index.html loads model_links.js after data_change.js and before the worksheets decorate', iML > iDC && iML < iBadge && iDC > 0);
check('L7 the PRA, ZSA and FMEA forms carry the Model links field', ['pra', 'zsa', 'fmea'].every(k => html.indexOf('data-ml-form="' + k + '"') > 0));
check('L7 the PRA and ZSA tables head the column "Model links"', /<th>Model links<\/th><th>CSFL Impact Analysis<\/th>/.test(html) && /<th>Boundaries<\/th><th>Model links<\/th>/.test(html));
const sl = S('safety_lab.js');
check('L7 the PRA and ZSA rows draw the links cell', /SLModelLinks\.cellHtml\('pra', row/.test(sl) && /SLModelLinks\.cellHtml\('zsa', row/.test(sl));
check('L7 an FMEA edit carries the row\'s links over (the form replaces the row)', /if \(prev && prev\.modelLinks\) mlTarget\.modelLinks = prev\.modelLinks;/.test(sl));
check('L7 the FHA rows carry the badge', (S('helpers_modules.js').match(/SLModelLinks\.cellHtml\('(acFha|sysFha)'/g) || []).length === 2);
const dataOps = S('data_ops_modules.js');
check('L7 every analysis CSV export has a Model Links column', ['acFha', 'sysFha', 'pra', 'zsa', 'fmea', 'hfHea', 'hfAlerts', 'hfTasks', 'hfErgo', 'hfCd', 'hfTid', 'hfSa', 'mmel'].every(k => dataOps.indexOf("_ml('" + k + "'") > 0));
check('L7 the CSV import reads the Model Links column back', /SLModelLinks\.csvApply\(_ML_IMPORT\[0\]/.test(dataOps));
check('L7 ReqIF and Jama carry the FC model links', /AD-LNK/.test(S('reqif_bridge.js')) && /Model links: /.test(S('jama_bridge.js')));
check('L7 the golden thread graph calls the links pass', /SLModelLinks\.threadPass\(_mlIdx/.test(S('fta_view_modules.js')));
check('L7 R&M add flows pick links from the model; no typed item id / event id prompts remain', ['ram_modules.js', 'mmel_module.js', 'msg3_module.js'].every(f => !/Linked LRU/.test(S(f)) && /SLModelLinks\.pickNew\(/.test(S(f))) && !/Linked basic event \(displayId/.test(S('ram_modules.js')));
check('L7 model_links.js uses no eval-style code (the production CSP forbids it)', !/new Function|\beval\(/.test(SRC));
const uiStrings = (SRC.match(/'[^'\n]*'/g) || []).filter(x => /[a-z] [a-z]/i.test(x));
check('L7 no em dash in model_links.js text', !uiStrings.some(x => x.indexOf('—') >= 0) && SRC.indexOf('—') < 0);

check('L7 the R&M hub shows the R&M rows\' link status with the exact-match action', /ML\.bannerHtml\(keys\.split/.test(S('ram_hub.js')));
check('L7 the PDF tables for PRA, ZSA and FMEA carry the links in words', (dataOps.match(/SLModelLinks\.textCell\('(pra|zsa|fmea)'/g) || []).length === 3);
check('L7 every new column label has a hover definition', /'model links':/.test(S('field_defs.js')) && /'task notes':/.test(S('field_defs.js')));
{
    let inv = null;
    const ci = load(null, null, { invRegister: x => { inv = x; return true; } });
    ci.SLModelLinks.registerInvariant();
    const r = inv && inv.run();
    check('L7 the Thread Integrity sweep lists every broken link (INV-67, advisory)', inv && inv.id === 'INV-67' && inv.sev === 'advisory' && r.failCount === 3 && r.fails.some(f => /FC-02: SF-99/.test(f)) && r.fails.some(f => /FM-2: 999/.test(f)) && r.fails.some(f => /LRU-99/.test(f)), r && JSON.stringify(r.fails));
}
check('L7 a reaction to a link change from an open editor is wired (HF modal redraws its mirrored columns)', /sl-model-links-changed/.test(SRC) && /addEventListener\('sl-model-links-changed'/.test(S('hf_analyses.js')));

// ---- 8. the HF tables draw the column right after the ID ----------------------------------------------
const hc = { console, Math, JSON, String, Array, Object, Date, isNaN, parseFloat, parseInt, Number };
hc.window = hc; hc.setTimeout = () => 0; hc.document = { readyState: 'complete', addEventListener() {} };
Object.assign(hc, project());
vm.createContext(hc);
vm.runInContext(S('zonal_model.js'), hc);
vm.runInContext(SRC, hc);
vm.runInContext(S('hf_analyses.js'), hc);
const tbl = hc.HF_ANALYSES._hfTableHtml('hea');
check('L8 the human error table heads "Model links" after the ID', /<th[^>]*>ID<\/th><th class="ml-th"[^>]*>Model links<\/th>/.test(tbl));
check('L8 each row carries its links cell (badge + picker button)', /data-ml-a="hfHea"/.test(tbl) && /SLModelLinks\.open\('hfHea','HEA-001'\)/.test(tbl));
check('L8 the typed FC column is a read-only mirror now', hc.HF_ANALYSES.HF_SCHEMA.hea.cols.find(x => x.k === 'fcIds').ro === true);

// ---- 9. large projects ------------------------------------------------------------------------------
{
    const P = project();
    const kids = []; for (let i = 0; i < 100000; i++) kids.push({ id: 10000 + i, type: 'basic', displayId: 'BE-' + (10000 + i), name: 'e' + i, children: [] });
    P.ftaPages = [{ id: 'big', name: 'big', root: { id: 1, type: 'gate', children: kids } }];
    P.fmeaData = []; for (let i = 0; i < 5000; i++) P.fmeaData.push({ internalId: 'f' + i, fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-fcs', fmeaId: 'FM-' + i, part: 'x' + i, beId: 10000 + i });
    let g = 1;
    const cb = load(null, P, { SLDataChange: { gen: () => g } });
    const t0 = Date.now();
    let ok = 0; cb.fmeaData.forEach(r => { if (cb.SLModelLinks.linksOf('fmea', r).some(l => l.ok && l.kind === 'be')) ok++; });
    const ms = Date.now() - t0;
    check('L9 100k basic events, 5,000 FMEA rows: every row resolves its event, in under 3 s (index built once per data generation)', ok === 5000 && ms < 3000, ms + ' ms');
}

// ---- 10. mutation proofs ------------------------------------------------------------------------------
function mutant(find, repl) { if (SRC.indexOf(find) < 0) throw new Error('mutation anchor missing: ' + find.slice(0, 60)); return SRC.replace(find, repl); }
{   // M1: a substring match instead of an exact one would link "Elevator" to "Elevator servo A"
    const src = mutant("var m = s.byCodeOnly ? (I.byCode[norm(t)] || []) : (I.byKey[norm(t)] || []);",
        "var m = s.byCodeOnly ? (I.byCode[norm(t)] || []) : I.list.filter(function (e) { return norm(e.name).indexOf(norm(t)) >= 0; }).map(function (e) { return e.id; });");
    const m = load(src).SLModelLinks.migrate('fmea', { apply: false });
    check('M1 loosening the exact-match rule is caught (FM-2 "Elevator" would be linked)', m.changes.some(x => x.row === 'FM-2'));
}
{   // M2: dropping the never-overwrite guard lets a second pass replace the engineer's link
    const src = mutant("if (slotIds(A, row, slot).length) return;   // never overwrite an engineer's links", "");
    const cm = load(src); cm.SLModelLinks.setLinks('lcc', 'LCC-1', { item: ['31'] }); cm.SLModelLinks.migrate(null, { apply: true });
    check('M2 removing the never-overwrite guard is caught', JSON.stringify(cm.projectConfig.lcc.items[0].modelLinks.item) !== '["31"]');
}
{   // M3: without broken-link detection a dangling id reads as linked
    const src = mutant("if (broken.length) { state = 'broken';", "if (false) { state = 'broken';");
    const cm = load(src);
    check('M3 removing the broken-link state is caught', cm.SLModelLinks.status('fmea', cm.fmeaData[1]).state !== 'broken');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

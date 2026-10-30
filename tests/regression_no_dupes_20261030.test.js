/*
 * regression_no_dupes_20261030.test.js
 *
 * 30 Oct 2026. Waqas: "AI or the tool itself must not create duplicates anywhere in the app, once an
 * analysis or a field has been created, it can then be updated or removed, not duplicated"; "there
 * shouldnt be second FCIM row for the same function, no duplicates of the same function, two FHA rows
 * with being assessed for the same phases of flight"; "2 FCIM rows per function, 1 aware the second
 * unaware". Systems: "we currently do not have a remove/rename/update the system option" (remove shows
 * what goes with it, you type the name, undo brings it back; rename keeps the hidden id; a name in use is
 * refused).
 *
 * Requirements (from the rulings):
 *   D1 a function (aircraft sub-function, or system function) exists once: same ID or same name in the same place
 *   D2 at most one crew-Aware and one crew-Unaware FCIM row per function
 *   D3 a failure condition is assessed once per flight phase (no two FHA rows share a phase)
 *   D4 systems are unique by name (case and spaces ignored)
 *   D5 the AI updates a row it drafted in place, keeps a hand-written one (and says a newer draft was declined)
 *   D6 an import updates the same row in place (its IDs kept) and skips one that only resembles another
 *   S1 a system can be renamed or edited from its card, its menu and its page; it keeps its id
 *   S2 a system can be removed: what goes with it is listed, the name must be typed, Undo brings it back
 *
 * [A] pure rules + wiring   [B] in the real app (Playwright + Chromium; skipped with a note where missing)
 * Mutation: SL_NODUPES_MUTATE=1 serves no_dupes.js with every clash check answering "no clash": [B] goes red.
 * Run: node tests/regression_no_dupes_20261030.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');

console.log('\n[A] the rule');
const N = require('../site/no_dupes.js');
// D1 aircraft functions
const acf = [
    { internalId: 1, funcId: 'AF-01', funcName: 'Control the flight path', subId: 'SF-01', subName: 'Provide pitch control' },
    { internalId: 2, funcId: 'AF-01', funcName: 'Control the flight path', subId: 'SF-02', subName: 'Provide roll control' },
    { internalId: 3, funcId: 'AF-02', funcName: 'Provide thrust', subId: '', subName: '' }
];
check('D1 a second sub-function with the same ID is a duplicate', !!N.acFunctionClash({ internalId: 9, funcId: 'AF-01', funcName: 'Control the flight path', subId: 'SF-01', subName: 'Anything' }, acf));
check('D1 the same sub-function name in the same place is a duplicate (case and spaces ignored)', !!N.acFunctionClash({ internalId: 9, funcId: 'AF-01', funcName: 'Control the flight path', subId: '', subName: '  provide  PITCH control ' }, acf));
check('D1 the same name under another function is not', !N.acFunctionClash({ internalId: 9, funcId: 'AF-02', funcName: 'Provide thrust', subId: '', subName: 'Provide pitch control' }, acf));
check('D1 a function name already used under another ID is a duplicate', !!N.acFunctionClash({ internalId: 9, funcId: 'AF-07', funcName: 'control the flight path', subId: 'SF-30', subName: 'Provide yaw control' }, acf));
check('D1 a second function-only row for the same function is a duplicate', !!N.acFunctionClash({ internalId: 9, funcId: 'AF-02', funcName: 'Provide thrust', subId: '', subName: '' }, acf));
check('D1 a new sub-function of an existing function is fine', !N.acFunctionClash({ internalId: 9, funcId: 'AF-01', funcName: 'Control the flight path', subId: 'SF-03', subName: 'Provide yaw control' }, acf));
check('D1 a row is never its own duplicate (editing)', !N.acFunctionClash(acf[0], acf));
const sf = [{ internalId: 1, funcId: 'SFN-1', funcName: 'Provide fuel feed' }];
check('D1 system functions: same ID is a duplicate', !!N.sysFunctionClash({ internalId: 2, funcId: 'SFN-1', funcName: 'Other' }, sf));
check('D1 system functions: same name is a duplicate', !!N.sysFunctionClash({ internalId: 2, funcId: 'SFN-2', funcName: 'provide fuel  feed' }, sf));
// D2 FCIM
const fcim = [{ internalId: 1, subId: 'SF-01', awareness: 'Aware' }];
check('D2 a second Aware row for a function is a duplicate', !!N.fcimClash({ internalId: 2, subId: 'SF-01', awareness: 'Aware' }, fcim));
check('D2 the Unaware row of the same function is allowed', !N.fcimClash({ internalId: 2, subId: 'SF-01', awareness: 'Unaware' }, fcim));
check('D2 "N/A" and blank awareness count as the Aware row', !!N.fcimClash({ internalId: 2, subId: 'SF-01', awareness: 'N/A' }, fcim) && !!N.fcimClash({ internalId: 2, subId: 'SF-01', awareness: '' }, fcim));
check('D2 a third row (second Unaware) is a duplicate', !!N.fcimClash({ internalId: 3, subId: 'SF-01', awareness: 'Unaware' }, fcim.concat([{ internalId: 2, subId: 'SF-01', awareness: 'Unaware' }])));
// D3 FHA
const fha = [{ internalId: 1, subId: 'SF-01', fcId: 'SF-01-TL', fcDesc: 'Total loss of pitch control', phases: 'Takeoff, Climb' }];
check('D3 the same condition for a phase already assessed is a duplicate', !!N.fhaClash({ internalId: 2, subId: 'SF-01', fcId: 'SF-01-TL', fcDesc: 'Total loss of pitch control', phases: ['Climb', 'Cruise'] }, fha));
check('D3 the same condition for other phases is fine', !N.fhaClash({ internalId: 2, subId: 'SF-01', fcId: 'SF-01-TL', fcDesc: 'Total loss of pitch control', phases: ['Cruise', 'Landing'] }, fha));
check('D3 an exact repeat is flagged as exact (the AI updates it in place)', (N.fhaClash({ internalId: 2, subId: 'SF-01', fcId: 'SF-01-TL', phases: 'Climb, Takeoff' }, fha) || {}).exact === true);
check('D3 "All phases" overlaps any phase', !!N.fhaClash({ internalId: 2, subId: 'SF-01', fcId: 'SF-01-TL', phases: ['All phases'] }, fha));
check('D3 a row not yet numbered is the same condition when it is the same function and words', !!N.fhaClash({ internalId: 2, subId: 'SF-01', fcId: '', fcDesc: 'total loss of  pitch control', phases: ['Takeoff'] }, fha));
check('D3 a different condition of the same function is fine', !N.fhaClash({ internalId: 2, subId: 'SF-01', fcId: 'SF-01-PL', fcDesc: 'Partial loss of pitch control', phases: ['Takeoff'] }, fha));
check('D3 the reason names the phases already assessed', /already assessed for Climb/.test((N.fhaClash({ internalId: 2, subId: 'SF-01', fcId: 'SF-01-TL', phases: ['Climb'] }, fha) || {}).reason || ''));
// D4 systems
const sys = [{ id: 'sys-a', name: 'Left Powerplant' }, { id: 'sys-b', name: 'Fuel' }];
check('D4 a system name in use is refused, case and spaces ignored', !!N.systemNameClash('  left   POWERPLANT ', sys, null));
check('D4 renaming a system to its own name is fine', !N.systemNameClash('Left Powerplant', sys, 'sys-a'));
check('D4 renaming to another system\'s name is refused', !!N.systemNameClash('fuel', sys, 'sys-a'));
// D6 imports
{
    const store = [{ internalId: 1, funcId: 'SFN-1', funcName: 'Provide fuel feed', funcDef: 'old' }];
    const t = N.newTally();
    const r1 = N.importUpsert(store, { internalId: 9, funcId: 'SFN-1', funcName: 'Provide fuel feed', funcDef: 'new text' }, 'sysFunc', t);
    const r2 = N.importUpsert(store, { internalId: 10, funcId: 'F-77', funcName: 'provide fuel feed', funcDef: '' }, 'sysFunc', t);
    const r3 = N.importUpsert(store, { internalId: 11, funcId: 'SFN-2', funcName: 'Indicate fuel', funcDef: 'x' }, 'sysFunc', t);
    check('D6 an imported row that is already there updates it in place', r1 === 'updated' && store[0].funcDef === 'new text' && store[0].internalId === 1);
    check('D6 the existing row keeps its ID (links hang on it)', r2 === 'updated' && store[0].funcId === 'SFN-1');
    check('D6 a new row is added', r3 === 'added' && store.length === 2);
    check('D6 the import says what it did', /2 rows already existed and were updated in place/.test(N.tallyText(t)) && /Nothing was added twice/.test(N.tallyText(t)));
    const fs2 = [{ internalId: 1, subId: 'SF-01', fcId: 'SF-01-TL', phases: 'Takeoff, Climb' }];
    const t2 = N.newTally();
    check('D6 an imported FHA row for some of an assessed condition\'s phases is skipped, not guessed', N.importUpsert(fs2, { internalId: 2, subId: 'SF-01', fcId: 'SF-01-TL', phases: 'Climb, Cruise', effAc: 'x' }, 'fha', t2) === 'skipped' && fs2.length === 1 && t2.skipped.length === 1);
    const af = [{ internalId: 1, funcId: 'AF-01', funcName: 'Control the flight path', subId: 'SF-01', subName: 'Provide pitch control' }];
    check('D6 an imported function using another function\'s name under a new ID is skipped', N.importUpsert(af, { internalId: 2, funcId: 'AF-09', funcName: 'Control the flight path', subId: 'SF-40', subName: 'Something' }, 'acFunc', N.newTally()) === 'skipped' && af.length === 1);
}

console.log('\n[A] removing a system');
const SA = require('../site/system_admin.js');
{
    const s = { id: 'sys-x', name: 'Hydraulics', functions: [1, 2], fcim: [1], fha: [1, 2, 3], req: [1], asm: [] };
    const other = { id: 'sys-y', name: 'Electrical', functions: [] };
    const systems = [s, other];
    const stores = {
        itemsData: [{ itemId: 'PUMP-1', owningSystemId: 'sys-x' }, { itemId: 'GEN-1', owningSystemId: 'sys-y' }],
        ftaPages: [{ id: 'p1', systemId: 'sys-x' }, { id: 'p2' }],
        resourcesData: [{ providerSystemId: 'sys-x', consumerSystemId: 'sys-y' }, { providerSystemId: 'sys-y', consumerSystemId: 'sys-z' }],
        projectConfig: { interfaces: [{ fromSystemId: 'sys-x', toSystemId: 'sys-y' }], macRules: [{ subId: 'SF-1', members: ['sys-x', 'sys-y'] }], lastSystemId: 'sys-x' },
        acFhaData: [{ fcId: 'A1', systemId: '' }]
    };
    const imp = SA.impactOf(s, stores);
    const txt = SA.summaryText(s, imp);
    check('S2 the summary lists what is inside', /Inside it: 2 functions, 1 FCIM rows, 3 FHA rows, 1 requirements/.test(txt), txt);
    check('S2 and what belongs to it elsewhere (items, fault tree pages)', /removed with it: .*1 items/.test(txt) && /1 fault tree pages/.test(txt), txt);
    check('S2 and the links to it that are taken off', /taken off \(the other rows stay\)/.test(txt) && /resource links/.test(txt), txt);
    SA.removeFrom(s, stores, systems);
    check('S2 the system is gone, the other system stays', systems.length === 1 && systems[0] === other);
    check('S2 its items and pages went with it, the others stayed', stores.itemsData.length === 1 && stores.itemsData[0].itemId === 'GEN-1' && stores.ftaPages.length === 1 && stores.ftaPages[0].id === 'p2');
    check('S2 links to it are gone, links between other systems stay', stores.resourcesData.length === 1 && stores.resourcesData[0].providerSystemId === 'sys-y' && stores.projectConfig.interfaces.length === 0);
    check('S2 its id is taken out of lists, the other members stay', JSON.stringify(stores.projectConfig.macRules[0].members) === '["sys-y"]');
    check('S2 a field that pointed at it no longer does', !('lastSystemId' in stores.projectConfig) || stores.projectConfig.lastSystemId !== 'sys-x');
    check('S2 nothing else changed', stores.acFhaData.length === 1);
}

console.log('\n[A] every writer asks the rule');
const A = read('ai_assistant.js'), SL = read('safety_lab.js'), H = read('helpers_modules.js'), D = read('data_ops_modules.js'), I = read('importers.js'), IDX = read('index.html');
check('the forms: aircraft and system functions, aircraft and system FCIM', /SLNoDupes\.acFunctionClash\(data, acFunctionsData\)/.test(SL) && /SLNoDupes\.sysFunctionClash\(data, sys\(\)\?\.functions\)/.test(SL) && /SLNoDupes\.fcimClash\(data, acFcimData\)/.test(SL) && /SLNoDupes\.fcimClash\(data, sys\(\)\?\.fcim\)/.test(SL));
check('the forms: aircraft and system FHA', /SLNoDupes\.fhaClash\(data, acFhaData\)/.test(H) && /SLNoDupes\.fhaClash\(data, arr\)/.test(H));
check('the AI: FCIM accept (both scopes), FHA accept (both scopes), decomposition (both), ANEM add_function (both), add_system',
    (A.match(/_fcimDupPrep\(row, (sys\.fcim|acFcimData)\) : null/g) || []).length === 2 && (A.match(/_fhaDupCheck\(data, (sys\.fha|acFhaData)\)/g) || []).length === 2
    && /_N\.sysFunctionClash\(row, sysObj\.functions\)/.test(A) && (A.match(/_N\.acFunctionClash\(/g) || []).length === 2 && (A.match(/_N\.sysFunctionClash\(/g) || []).length === 2
    && /findSystemByName\(name, systemsData\)/.test(A));
check('the AI: a partly overlapping FHA row is refused with the reason, in the panel and in ANEM', /_upS\.action === 'overlap'/.test(A) && /_upA\.action === 'overlap'/.test(A) && /_applyFhaSuggestion\._last\.action === 'overlap'\) results\.push\(\{ ok: false, blocked: true/.test(A));
check('the imports: CSV/Excel (functions, FCIM, FHA, both scopes) and the workbook importer', (D.match(/_ndUp\(/g) || []).length >= 6 && /importUpsert/.test(D) && (I.match(/_ndUp\(/g) || []).length >= 6);
check('the connections and the model imports: Jama FHA and functions, SysML, node identity, the architecture graph, the plan',
    /fhaClash\(row, fha\)/.test(read('jama_kinds.js')) && /acFunctionClash\(Object\.assign\(\{\}, row, \{ subId: '' \}\), rows\)/.test(read('jama_tree.js')) && (read('sysml_model.js').match(/SLNoDupes/g) || []).length >= 5
    && /sysFunctionClash\(\{ funcName: name \}/.test(read('node_identity_ui.js')) && /findSystemByName/.test(read('cea_graph.js')) && /systemNameClash/.test(read('toolchain_plan.js')));
check('a new system with a name in use is refused', /SLNoDupes\.systemNameClash\(sysName, systemsData, null\)/.test(H));
check('the system edit and removal are undo targets', /'applySystemEdit', 'applySystemRemove'/.test(D));
check('S1 rename / edit and remove on every system card, in its menu, and on its page', /sys-card-edit/.test(H) && /sys-card-remove/.test(H) && /asb-sys-edit/.test(read('nav_rail.js')) && /asb-sys-remove/.test(read('nav_rail.js')) && /id="ws-sys-edit"/.test(IDX) && /id="ws-sys-remove"/.test(IDX));
check('the rule and the system module load before safety_lab.js wraps the undo targets', IDX.indexOf('no_dupes.js?v=') > 0 && IDX.indexOf('system_admin.js?v=') > 0 && IDX.indexOf('system_admin.js?v=') < IDX.indexOf('safety_lab.js?v='));

// ================================================================================ [B]
let pw = null;
for (const p of ['playwright', '/home/claude/.npm-global/lib/node_modules/playwright']) { try { pw = require(p); break; } catch (_) {} }
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync('/opt/pw-browsers')) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
function done() { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
if (!pw) { console.log('  note  Playwright is not installed on this machine: [B] did not run'); done(); }

const MUTATE = process.env.SL_NODUPES_MUTATE === '1';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function serve() {
    return new Promise(res => {
        const srv = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(SITE, path.normalize(p));
            if (!f.startsWith(SITE)) { r.writeHead(403); return r.end(); }
            fs.readFile(f, (e, b) => {
                if (e) { r.writeHead(404); return r.end('not found'); }
                if (MUTATE && path.basename(f) === 'no_dupes.js') b = Buffer.from(String(b).replace("acFunctionClash: acFunctionClash, sysFunctionClash: sysFunctionClash,", "acFunctionClash: function () { return null; }, sysFunctionClash: function () { return null; },").replace("awarenessKey: awarenessKey, fcimClash: fcimClash,", "awarenessKey: awarenessKey, fcimClash: function () { return null; },").replace("sameConditionAs: sameConditionAs, fhaClash: fhaClash,", "sameConditionAs: sameConditionAs, fhaClash: function () { return null; },").replace("systemNameClash: systemNameClash, findSystemByName: findSystemByName", "systemNameClash: function () { return null; }, findSystemByName: function () { return null; }"));
                r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); r.end(b);
            });
        }).listen(0, '127.0.0.1', () => res(srv));
    });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Stand-in model: FCIM rows (Aware) for the functions asked; FHA rows for the conditions asked, phases set by window.__phases.
const STUB = `window.__phases = ['All phases']; window.AiClient = Object.assign(window.AiClient || {}, { isConfigured: () => true, isPermanentError: () => false, messages: async req => {
    const u = JSON.stringify(req); const acts = [];
    let m = u.match(/cover EXACTLY these system functions and no others: (.*?)\\. Emit/);
    if (m && /SYSTEM FCIM/.test(u)) m[1].split('; ').forEach(s => { const id = s.split(' \\u2014 ')[0]; acts.push({ op: 'add_fcim', subId: id, awareness: 'Aware', totalLoss: 'Total loss of ' + id, partialLoss: 'Partial loss of ' + id, malfunction: 'Erroneous ' + id }); });
    m = u.match(/cover EXACTLY these failure conditions and no others: (.*?)\\. Emit/);
    if (m) m[1].split('; ').forEach(s => { const p = s.split(' \\u2014 '); const fn = (p[1].match(/\\(function ([^)]*)\\)$/) || [])[1] || ''; acts.push({ op: 'add_fha', srcCondId: p[0], subId: fn, fcDesc: p[1].replace(/ \\(function [^)]*\\)$/, ''), phases: window.__phases, effAc: 'Margins reduced', effCrew: 'Crew follows the procedure', effPax: 'Discomfort', severity: 'Major', effAcLevel: 'significant', effCrewLevel: 'significant', effPaxLevel: 'slight', severityRationale: 'The crew recovers', sevBasis: 'MAJ-1' }); });
    return { model: 'stub', content: [{ text: JSON.stringify({ reply: 'Drafted.', actions: acts }) }] }; } });`;

(async () => {
    console.log('\n[B] in the real app' + (MUTATE ? ' (MUTATION: the rule says "no clash" to everything)' : ''));
    const srv = await serve();
    let browser;
    try { browser = await pw.chromium.launch(); }
    catch (e) { console.log('  note  Chromium could not start here: [B] did not run'); srv.close(); done(); }
    try {
        const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
        const errs = []; pg.on('pageerror', e => errs.push(String(e)));
        pg.on('dialog', d => d.dismiss().catch(() => {}));
        await pg.goto('http://127.0.0.1:' + srv.address().port + '/?ai=1'); await sleep(3500);
        await pg.evaluate(() => {
            const g = document.getElementById('sl-auth-gate'); if (g) g.remove();
            document.documentElement.classList.remove('sl-auth-gate-blocked');
            document.querySelectorAll('.modal-overlay.show').forEach(m => { m.classList.remove('show'); m.style.display = 'none'; });
        });
        await pg.evaluate(async () => { await loadSampleProject(); }); await sleep(3000);
        await pg.evaluate(async () => { await window.slLoadAI(); }); await sleep(600);
        await pg.evaluate(STUB);
        // the app's own dialogs: record what they said and answer them
        await pg.evaluate(() => { window.__said = []; window.slAlert = async (m) => { window.__said.push(String(m)); }; });
        const closeDialogs = () => pg.evaluate(() => { document.querySelectorAll('.sl-dialog-overlay, .sl-dialog, [data-sl-dialog]').forEach(x => x.remove()); });

        // ---- D1 the system function form
        await pg.evaluate(() => { openSystemWorkspace('sys-fcs'); switchWorkspaceTab('func'); }); await sleep(500);
        const f1 = await pg.evaluate(() => {
            const s = SLEnv.get('systemsData').find(x => x.id === 'sys-fcs'); const n0 = s.functions.length; const f = s.functions[0];
            document.getElementById('sys-func-id').value = 'SFN-NEW-1'; document.getElementById('sys-func-name').value = '  ' + f.funcName.toUpperCase() + ' '; document.getElementById('sys-func-def').value = 'dup';
            submitSysFunction();
            return { n0, n1: s.functions.length, said: window.__said.slice(-1)[0] || '' };
        });
        check('D1 the system function form refuses a function that is already there (same name)', f1.n1 === f1.n0 && /already has a function called/.test(f1.said), JSON.stringify(f1));
        // ---- D2 the system FCIM form
        await pg.evaluate(() => { switchWorkspaceTab('fcim'); }); await sleep(400);
        const f2 = await pg.evaluate(() => {
            const s = SLEnv.get('systemsData').find(x => x.id === 'sys-fcs'); const r = s.fcim[0]; const n0 = s.fcim.length;
            const aw = /unaware/i.test(r.awareness) ? 'Unaware' : 'Aware';
            const sel = document.getElementById('sys-fcim-subfunc'); if (![...sel.options].some(o => o.value === r.subId)) { const o = document.createElement('option'); o.value = r.subId; sel.appendChild(o); }
            sel.value = r.subId; const cr = document.getElementById('sys-fcim-crew'); if (![...cr.options].some(o => o.value === aw)) { const o = document.createElement('option'); o.value = aw; cr.appendChild(o); } cr.value = aw;
            document.getElementById('sys-fcim-tl-desc').value = 'Total loss again';
            submitSysFCIM();
            return { n0, n1: s.fcim.length, said: window.__said.slice(-1)[0] || '', aw };
        });
        check('D2 the FCIM form refuses a second ' + (f2.aw || 'Aware') + ' row for a function', f2.n1 === f2.n0 && /already has its crew-/.test(f2.said), JSON.stringify(f2));
        // ---- D3 the system FHA form
        await pg.evaluate(() => { switchWorkspaceTab('fha'); }); await sleep(400);
        const f3 = await pg.evaluate(() => {
            const s = SLEnv.get('systemsData').find(x => x.id === 'sys-fcs'); const r = s.fha.find(x => x.fcId && String(x.phases || '').trim()); const n0 = s.fha.length;
            if (!r) return { skip: true };
            editStates.sysFha = null;
            const setSel = (id, v) => { const e = document.getElementById(id); if (!e) return; if (e.tagName === 'SELECT' && ![...e.options].some(o => o.value === v)) { const o = document.createElement('option'); o.value = v; e.appendChild(o); } e.value = v; };
            const own = (typeof _fcOwnerSubId === 'function' && (_fcOwnerSubId('sys', r.fcId, s.id) || {}).subId) || r.subId; setSel('sys-fha-subfunc', own); setSel('sys-fha-fcid', r.fcId); document.getElementById('sys-fha-fcdesc').value = r.fcDesc;
            const first = String(r.phases).split(',')[0].trim();
            document.querySelectorAll('#sys-fha-phases input[type=checkbox]').forEach(c => { c.checked = (c.value === first); });
            submitSysFHA();
            return { n0, n1: s.fha.length, said: window.__said.slice(-1)[0] || '', first };
        });
        check('D3 the FHA form refuses a condition already assessed for that phase', f3.skip || (f3.n1 === f3.n0 && /already assessed for/.test(f3.said)), JSON.stringify(f3));

        // ---- D5 the AI: draft the Right Powerplant FCIM twice, then its SFHA twice
        const fcimRun = async () => {
            await pg.evaluate(() => { openSystemWorkspace('sys-prr'); switchWorkspaceTab('fcim'); }); await sleep(500);
            await pg.evaluate(() => { document.querySelector('#ws-view-fcim > .slab-ai-bar button').click(); }); await sleep(900);
            await pg.evaluate(() => { document.querySelector('#scope-pick-go').click(); }); await sleep(5000);
            await pg.evaluate(() => { const b = document.querySelector('.ai-rev-panel .rv-accept-all'); if (b) b.click(); }); await sleep(1500);
            await pg.evaluate(() => { document.querySelectorAll('.ai-rev-panel,#ai-scope-pick').forEach(p => p.remove()); });
            return pg.evaluate(() => { const s = SLEnv.get('systemsData').find(x => x.id === 'sys-prr'); return { n: s.fcim.length, ids: s.fcim.map(r => r.tlId).join(','), ex: (s.extractedFCs || []).length, redrafts: s.fcim.map(r => r.aiRedrafts || 0).join(',') }; });
        };
        const r1 = await fcimRun(), r2 = await fcimRun();
        check('D5 the first AI FCIM draft adds one Aware row per function', r1.n === 3, JSON.stringify(r1));
        check('D5 drafting it again updates those rows in place: no second Aware row', r2.n === 3 && /1,1,1/.test(r2.redrafts), JSON.stringify(r2));
        check('D5 and their failure condition IDs stay the same', r2.ids === r1.ids && r2.ex === r1.ex, JSON.stringify([r1, r2]));
        const fhaRun = async () => {
            await pg.evaluate(() => { openSystemWorkspace('sys-prr'); switchWorkspaceTab('fha'); }); await sleep(500);
            await pg.evaluate(() => { document.querySelector('#ws-view-fha > .slab-ai-bar button').click(); }); await sleep(900);
            await pg.evaluate(() => { document.querySelector('#scope-pick-go').click(); }); await sleep(6000);
            const panel = await pg.evaluate(() => { const b = document.querySelector('.ai-rev-panel .rv-accept-all'); if (b) b.click(); return !!b; }); await sleep(1500);
            const text = await pg.evaluate(() => { const p = document.querySelector('.ai-rev-panel'); return p ? p.innerText : ''; });
            await pg.evaluate(() => { document.querySelectorAll('.ai-rev-panel,#ai-scope-pick').forEach(p => p.remove()); });
            const st = await pg.evaluate(() => { const s = SLEnv.get('systemsData').find(x => x.id === 'sys-prr'); return { n: s.fha.length, redrafts: s.fha.filter(r => r.aiRedrafts).length }; });
            return Object.assign(st, { panel, text });
        };
        const h1 = await fhaRun(), h2 = await fhaRun();
        check('D5 the first SFHA draft adds one row per condition (all phases)', h1.n === 1 + 9, JSON.stringify({ n: h1.n }));
        check('D5 drafting it again updates those rows in place: no condition assessed twice', h2.n === h1.n && h2.redrafts >= 9, JSON.stringify({ n1: h1.n, n2: h2.n, re: h2.redrafts }));
        await pg.evaluate(() => { window.__phases = ['Cruise']; });
        const h3 = await fhaRun();
        check('D3 an AI row for a phase already assessed is refused, not added', h3.n === h1.n, JSON.stringify({ n: h3.n }));
        check('D3 and the panel says why', /not written|already assessed for/.test(h3.text), h3.text.slice(0, 300));

        // ---- S1 rename
        const s1 = await pg.evaluate(() => {
            const sys = SLEnv.get('systemsData'); const a = sys.find(x => x.id === 'sys-prl'); const nF = a.functions.length;
            const r1 = applySystemEdit('sys-prl', '  right  POWERPLANT ', 'function');
            const r2 = applySystemEdit('sys-prl', 'Engine 1', 'both');
            openSystemWorkspace('sys-prl');
            return { r1, r2, name: a.name, role: a.role, id: a.id, kept: a.functions.length === nF, title: document.getElementById('ws-sys-title').textContent,
                     card: [...document.querySelectorAll('#sys-directory-grid .sys-folder-title')].some(x => /Engine 1/.test(x.textContent)) || !document.getElementById('sys-directory-grid').children.length,
                     nav: [...document.querySelectorAll('#asb-sys-dirs summary .asb-lbl')].some(x => /Engine 1/.test(x.textContent)) };
        });
        check('S1 renaming to another system\'s name is refused', s1.r1 && !s1.r1.ok && /already exists/.test(s1.r1.reason), JSON.stringify(s1.r1));
        check('S1 a rename keeps the hidden id and everything in it', s1.r2.ok && s1.name === 'Engine 1' && s1.id === 'sys-prl' && s1.kept && s1.role === 'both', JSON.stringify(s1));
        check('S1 the new name shows at once: the page title and the menu', /Engine 1/.test(s1.title) && s1.nav, JSON.stringify(s1));
        const btns = await pg.evaluate(() => { switchTab('sys-dir'); renderSystemDirectory(); return { card: document.querySelectorAll('#sys-directory-grid .sys-card-edit').length, cardRm: document.querySelectorAll('#sys-directory-grid .sys-card-remove').length, n: SLEnv.get('systemsData').length, nav: document.querySelectorAll('#asb-sys-dirs .asb-sys-edit').length, navRm: document.querySelectorAll('#asb-sys-dirs .asb-sys-remove').length, page: !!document.getElementById('ws-sys-edit') && !!document.getElementById('ws-sys-remove') }; });
        check('S1 every system card has Rename or edit and Remove', btns.card === btns.n && btns.cardRm === btns.n, JSON.stringify(btns));
        check('S1 each system in the menu has them, and so does the system page', btns.nav === btns.n && btns.navRm === btns.n && btns.page, JSON.stringify(btns));
        // a new system with a name in use is refused
        const d4 = await pg.evaluate(async () => { const n0 = SLEnv.get('systemsData').length; const sp = window.slPrompt; window.slPrompt = async () => 'engine 1'; try { await promptCreateSystem(); } finally { window.slPrompt = sp; } return { n0, n1: SLEnv.get('systemsData').length, said: window.__said.slice(-1)[0] || '' }; });
        check('D4 adding a system with a name in use is refused', d4.n1 === d4.n0 && /already exists/.test(d4.said), JSON.stringify(d4));

        // ---- S2 remove, through the dialog, then Undo
        const s2 = await pg.evaluate(async () => {
            const before = JSON.stringify({ s: SLEnv.get('systemsData').map(x => x.id), items: (SLEnv.get('itemsData') || []).length, pages: (SLEnv.get('ftaPages') || []).length });
            const sp = window.slPrompt; let shown = '';
            window.slPrompt = async (m) => { shown = String(m); return 'wrong name'; };
            await removeSystem('sys-fcs');
            const still = SLEnv.get('systemsData').some(x => x.id === 'sys-fcs');
            window.slPrompt = async (m) => { shown = String(m); return '  flight control SYSTEM '; };
            await removeSystem('sys-fcs');
            window.slPrompt = sp;
            const gone = !SLEnv.get('systemsData').some(x => x.id === 'sys-fcs');
            const refs = JSON.stringify([SLEnv.get('itemsData'), SLEnv.get('ftaPages'), SLEnv.get('resourcesData'), SLEnv.get('projectConfig') && SLEnv.get('projectConfig').interfaces]).indexOf('"sys-fcs"') >= 0;
            undo();
            await new Promise(r => setTimeout(r, 800));
            const after = JSON.stringify({ s: SLEnv.get('systemsData').map(x => x.id), items: (SLEnv.get('itemsData') || []).length, pages: (SLEnv.get('ftaPages') || []).length });
            return { shown, still, gone, refs, back: before === after, before, after };
        });
        check('S2 the remove dialog lists what is inside and what else goes', /Inside it: \d+ functions/.test(s2.shown) && /type the system's name/.test(s2.shown), s2.shown.slice(0, 300));
        check('S2 a name that does not match removes nothing', s2.still);
        check('S2 typing the name removes it, and nothing elsewhere still points at it', s2.gone && !s2.refs, JSON.stringify({ gone: s2.gone, refs: s2.refs }));
        check('S2 Undo brings the system and everything it took back', s2.back, s2.before + ' -> ' + s2.after);
        check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
    } catch (e) {
        check('[B] ran without throwing', false, String(e && e.stack || e).slice(0, 400));
    } finally {
        try { await browser.close(); } catch (_) {}
        srv.close(); done();
    }
})();

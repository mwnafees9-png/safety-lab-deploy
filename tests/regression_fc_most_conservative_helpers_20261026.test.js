#!/usr/bin/env node
/*
 * Regression: a failure condition written as several FHA rows is offered ONCE, as its most conservative row, in the
 * pickers and views of helpers_modules.js, support_modules.js and assurance_modules.js (26 Oct 2026).
 *
 * RULING (Waqas, 26 Oct 2026): "fault trees should be generated for the most conservative severity classification
 *   only ... same with CoFFEE and other analyses we just need the most conservative instances".
 * RULE: the rows sharing an FC ID are one failure condition; its GOVERNING row is the worst severity, ties the longest
 *   exposure (fc_auto_trees.js window.SLFcTrees). Pickers and views offer that row once, labelled
 *   " (most conservative of N)"; the FHA tables keep every row. Before SLFcTrees loads, every row is offered (today).
 * FIXTURE: FC-01 has three rows: 101 Major (Taxi, 10 min), 102 Hazardous (Takeoff, 2 min), 103 Hazardous (Cruise,
 *   60 min). The governing row is 103 (Hazardous, the longest exposure); "the first worst row" would be 102, so the
 *   tie rule is visible. FC-02 is one Catastrophic row (201). System sA's SFHA has FC-S1 twice (Major Taxi, Major Cruise).
 * EXECUTED (VM, the real files: safety_targets, fn_resolver, helpers_modules, misc_fn_modules, support_modules,
 *   assurance_modules, fc_auto_trees):
 *   [1] CoFFE failure-condition dropdown (renderCoffePanel)
 *   [2] interdependence table rows, its CRA dropdown and idpStats (renderInterdepPage)
 *   [3] Functional FMEA "Linked failure condition" (_populateFmeaFuncLinkedFc), an existing link kept
 *   [4] MAC rule's failure condition (_macFcForRule): the tie goes to the longest exposure
 *   [5] CMA linked-gates picker (populateCmaLinkedGatesDropdown): a per-row copy tree is not offered
 *   [6] command palette / trace graph list (Traceability.listAllArtifacts)
 *   [7] golden thread trace report (_gtvReportRows): one thread per FC, trees gathered from every row
 *   [8] the governing FHA row of a tree page (_governingFhaForPage, extracted; and the CCMR sweep's _ccmrPageFha)
 *   [9] SLFcTrees missing: every row, as before
 *   [10] QUESTION (not a change): AutoReq's DAL requirement per FUNCTION with three failure conditions
 * MUTATION PROOF: SL_FCGOV_MUTATE=coffe|interdep|fmea|mac|cma|ccmr|list|gtv|govpage reverts that one change in the source
 *   before it is loaded; the matching section turns red.
 * Run: node tests/regression_fc_most_conservative_helpers_20261026.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const MUT = process.env.SL_FCGOV_MUTATE || '';
const swap = (src, a, b, label) => { if (src.indexOf(a) < 0) throw new Error('mutation anchor missing: ' + label); return src.replace(a, b); };
function mutate(file, src) {
    if (file === 'helpers_modules.js') {
        if (MUT === 'coffe') src = swap(src, 'const fcs = (_fcV ? _fcV.only(acFhaData || []) : (acFhaData || [])).filter(fc => idpContributors(fc).length >= 2);', 'const fcs = (acFhaData || []).filter(fc => idpContributors(fc).length >= 2);', 'coffe');
        if (MUT === 'interdep') src = swap(src, "const _fcV = slFcGovView('ac');\n    const fcs = _fcV ? _fcV.only(acFhaData || []) : (acFhaData || []);\n    const syss", "const _fcV = slFcGovView('ac');\n    const fcs = acFhaData || [];\n    const syss", 'interdep');
        if (MUT === 'fmea') src = swap(src, "if (_fcV && !_fcV.keep(h) && id !== keep) return;", '', 'fmea');
        if (MUT === 'mac') src = swap(src, "if (a > b || (a === b && slFcExposureHours(r) > slFcExposureHours(best))) best = r;", 'if (a > b) best = r;', 'mac');
        if (MUT === 'cma') src = swap(src, 'const _copies = _slFcCopyPages();', 'const _copies = new Set();', 'cma');
        if (MUT === 'ccmr') src = swap(src, 'if (r && F) { try { const g = F.governingOf(r.fha); if (g) r.fha = g; } catch (_) {} }', '', 'ccmr');
    }
    if (file === 'assurance_modules.js') {
        if (MUT === 'list') src = swap(src, "if (_acV && !_acV.keep(f)) return; out.push({ kind: 'acFha'", "out.push({ kind: 'acFha'", 'list');
        if (MUT === 'govpage') src = swap(src, 'if (fha && _F) { try { const g = _F.governingOf(fha); if (g) fha = g; } catch (_) {} }', '', 'govpage');
    }
    if (file === 'support_modules.js') {
        if (MUT === 'gtv') src = swap(src, "(acFhaData||[]).forEach(f => { if (!_acV || _acV.keep(f)) fcRows.push(", "(acFhaData||[]).forEach(f => { if (true) fcRows.push(", 'gtv');
    }
    return src;
}
const L = f => mutate(f, S(f));

// ---- the project -----------------------------------------------------------------------------------------------
globalThis.window = globalThis;
globalThis.SLEnv = { get: n => globalThis[n] };
globalThis.flightPhasesData = [
    { phase: 'Taxi', duration: 10, durationUnit: 'min' }, { phase: 'Takeoff', duration: 2, durationUnit: 'min' },
    { phase: 'Cruise', duration: 60, durationUnit: 'min' }, { phase: 'Landing', duration: 3, durationUnit: 'min' }];
globalThis.acFunctionsData = [{ subId: 'F1', subName: 'Control pitch' }, { subId: 'F2', subName: 'Decelerate' }];
const r101 = { internalId: 101, subId: 'F1', fcId: 'FC-01', fcDesc: 'Loss of pitch control', severity: 'Major', phases: 'Taxi' };
const r102 = { internalId: 102, subId: 'F1', fcId: 'FC-01', fcDesc: 'Loss of pitch control', severity: 'Hazardous', phases: 'Takeoff' };
const r103 = { internalId: 103, subId: 'F1', fcId: 'FC-01', fcDesc: 'Loss of pitch control', severity: 'Hazardous', phases: 'Cruise' };
const r201 = { internalId: 201, subId: 'F2', fcId: 'FC-02', fcDesc: 'Loss of braking', severity: 'Catastrophic', phases: 'Landing' };
globalThis.acFhaData = [r101, r102, r103, r201];
const s301 = { internalId: 301, subId: 'SF1', fcId: 'FC-S1', fcDesc: 'Actuator jam', severity: 'Major', phases: 'Taxi' };
const s302 = { internalId: 302, subId: 'SF1', fcId: 'FC-S1', fcDesc: 'Actuator jam', severity: 'Major', phases: 'Cruise' };
globalThis.systemsData = [
    { id: 'sA', name: 'Actuation', functions: [{ funcId: 'FN-A', funcName: 'Actuate', traceIds: ['F1', 'F2'] }], fha: [s301, s302], req: [], asm: [], fcim: [] },
    { id: 'sB', name: 'Power', functions: [{ funcId: 'FN-B', funcName: 'Power', traceIds: ['F1', 'F2'] }], fha: [], req: [], asm: [], fcim: [] }];
globalThis.acFcimData = []; globalThis.acReqData = []; globalThis.acAssumptionsData = [];
globalThis.resourcesData = []; globalThis.itemsData = []; globalThis.routingData = [];
globalThis.cmaData = []; globalThis.zsaData = []; globalThis.praData = []; globalThis.fmeaData = [];
const gate = (id, name) => ({ id, displayId: 'G' + id, name, type: 'gate', gateType: 'OR', children: [{ id: id + 1, type: 'basic', name: 'e' + id, children: [] }] });
globalThis.ftaPages = [
    { id: 'P1', name: 'PASA FC-01', linkedFhaIds: [103, 101, 102], root: gate(10, 'FC-01 top') },
    { id: 'P2', name: 'FC-01 Taxi copy', linkedFhaIds: [101], root: gate(20, 'FC-01 taxi top') },
    { id: 'P3', name: 'PASA FC-02', linkedFhaIds: [201], root: gate(30, 'FC-02 top') }];
globalThis.ftaConfig = {};
globalThis.projectConfig = { regulation: 'Part 25', macModels: [{ id: 'r1', subId: 'F1', clauses: [{ min: 1, of: ['sA', 'sB'] }] }], interdep: { cells: {}, cra: {} }, coffe: { verdicts: {} } };
// every row of FC-01 and FC-02 marked as contributed to by both systems (so the old code lists every row)
[101, 102, 103, 201].forEach(id => ['sA', 'sB'].forEach(s => { projectConfig.interdep.cells[id + '§' + s] = { state: 'asserted', by: 'W' }; }));
globalThis.internalIdCounter = 1000;
globalThis._COFFE_STATES = ['total loss', 'malfunction'];
// bindings_modules.js owns this const in the app; mirrored here (checked against the source below)
globalThis._CKPT_SEV_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1, 'No Safety Effect': 1 };
if (S('bindings_modules.js').indexOf("const _CKPT_SEV_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1, 'No Safety Effect': 1 };") < 0) throw new Error('_CKPT_SEV_RANK mirror is out of date with bindings_modules.js');
globalThis._coffeSelectedFc = null; globalThis._idpSelectedFc = null;
globalThis.commitSaveChanges = () => {}; globalThis.scheduleAutosave = () => {}; globalThis.showToast = () => {};
globalThis._autosaveSuspended = false; globalThis._autosaveLastWrite = 0; globalThis._dirtySinceSave = false;
globalThis._autosaveDiskAvailable = false; globalThis._autosaveLastDiskWrite = 0;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.sys = () => null;
globalThis.renderSysFHA = () => {}; globalThis.renderFhaPhaseGrid = () => {};
globalThis._gtvSystemsForFc = () => [];   // fta_view_modules.js (not loaded): the systems column is not under test
const hosts = {};
const host = id => hosts[id] || (hosts[id] = { id, value: '', _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; }, querySelectorAll: () => [], style: {}, classList: { add() {}, remove() {}, toggle() {} } });
globalThis.document = {
    getElementById: id => (['coffe-host', 'interdep-host', 'fmea-func-linked-fc', 'cma-linked-gates'].indexOf(id) >= 0 ? host(id) : null),
    createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }),
    addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, body: { appendChild: () => {} }, documentElement: { classList: { add() {}, remove() {} } } };

(0, eval)(['safety_targets.js', 'fn_resolver.js', 'helpers_modules.js', 'misc_fn_modules.js', 'support_modules.js', 'assurance_modules.js', 'fc_auto_trees.js'].map(L).join("\n;\n") + "\n;globalThis.__TR = Traceability; globalThis.__AR = AutoReq;");
const G = globalThis;
const Traceability = globalThis.__TR, AutoReq = globalThis.__AR;
check('machinery loaded (SLFcTrees, the renderers, Traceability, AutoReq)', !!G.SLFcTrees && typeof G.renderCoffePanel === 'function' && typeof G.renderInterdepPage === 'function' && typeof Traceability.listAllArtifacts === 'function' && typeof AutoReq.generate === 'function');
check('the fixture: FC-01 governs at row 103 (Hazardous, Cruise 60 min beats Takeoff 2 min), of 3 rows',
    G.SLFcTrees.governingOf(r101) === r103 && G.SLFcTrees.copiesNote(r101) === ' (most conservative of 3)' && G.SLFcTrees.copiesNote(r201) === '');
const opts = html => (html.match(/<option value="[^"]*"[^>]*>[^<]*<\/option>/g) || []);
const optVal = o => (o.match(/value="([^"]*)"/) || [])[1];

// ---- [1] CoFFE ---------------------------------------------------------------------------------------------------
console.log('\n[1] CoFFE failure-condition dropdown');
G._coffeSelectedFc = '102';   // a row that is not governing was picked before: it moves to the governing row
G.renderCoffePanel();
{
    const sel = (host('coffe-host').innerHTML.match(/<select[^>]*_coffeSelectedFc[\s\S]*?<\/select>/) || [''])[0];
    const o = opts(sel), fc01 = o.filter(x => /FC-01/.test(x));
    check('FC-01 is offered once, as row 103', fc01.length === 1 && optVal(fc01[0]) === '103', JSON.stringify(o));
    check('labelled with how many rows it stands for', /\(most conservative of 3\)/.test(fc01[0] || ''), fc01[0]);
    check('FC-02 (one row) is offered without a label', o.some(x => optVal(x) === '201' && !/most conservative/.test(x)), JSON.stringify(o));
    check('a pick of row 102 moved to the governing row 103', String(G._coffeSelectedFc) === '103' && /value="103" selected/.test(sel), G._coffeSelectedFc);
}

// ---- [2] interdependence ---------------------------------------------------------------------------------------
console.log('\n[2] interdependence table, CRA dropdown and stats');
G._idpSelectedFc = '101';
G.renderInterdepPage();
{
    const html = host('interdep-host').innerHTML;
    const tbl = (html.match(/Interdependence table[\s\S]*?<\/tbody>/) || [''])[0];
    const rows = (tbl.match(/<tr><td>[\s\S]*?<\/tr>/g) || []);
    const fc01Rows = rows.filter(r => /FC-01/.test(r));
    check('the interdependence table has one row for FC-01 (row 103), labelled', fc01Rows.length === 1 && /idpCycleCell\('103'/.test(fc01Rows[0]) && /most conservative of 3/.test(fc01Rows[0]), fc01Rows.length + ' rows');
    check('and FC-02 its one row', rows.filter(r => /FC-02/.test(r)).length === 1);
    const cra = (html.match(/<select[^>]*_idpSelectedFc[\s\S]*?<\/select>/) || [''])[0];
    const o = opts(cra).filter(x => /FC-01/.test(x));
    check('the CRA dropdown offers FC-01 once (103), labelled, and the old pick of 101 moved to it', o.length === 1 && optVal(o[0]) === '103' && /most conservative of 3/.test(o[0]) && String(G._idpSelectedFc) === '103', JSON.stringify(opts(cra)));
    const st = G.idpStats();
    check('idpStats counts the failure conditions shown (2), not the rows (4)', st.fcs === 2, JSON.stringify(st));
}

// ---- [3] Functional FMEA ---------------------------------------------------------------------------------------
console.log('\n[3] Functional FMEA linked failure condition');
host('fmea-func-linked-fc').value = '';
G._populateFmeaFuncLinkedFc();
{
    const o = opts(host('fmea-func-linked-fc').innerHTML);
    check('options: not linked, FC-01 once (103, labelled), FC-02', o.length === 3 && o.filter(x => /FC-01/.test(x)).length === 1 && o.some(x => optVal(x) === '103' && /most conservative of 3/.test(x)) && o.some(x => optVal(x) === '201'), JSON.stringify(o));
    G._populateFmeaFuncLinkedFc('101');
    const o2 = opts(host('fmea-func-linked-fc').innerHTML);
    check('an FMEA row already linked to row 101 keeps that option (its link is never dropped on save)', o2.some(x => optVal(x) === '101') && o2.length === 4, JSON.stringify(o2));
}

// ---- [4] MAC ---------------------------------------------------------------------------------------------------
console.log('\n[4] MAC rule failure condition');
{
    const fc = G._macFcForRule({ subId: 'F1' });
    check('function F1\'s MAC failure condition is row 103 (Hazardous tie: the longest exposure, not the first row 102)', fc === r103, fc && fc.internalId);
    // a second failure condition on F1, Hazardous over Takeoff only (2 min), listed first: the tie between the two
    // conditions' governing rows goes to the longer exposure (103, Cruise), the same rule as within one condition
    const r104 = { internalId: 104, subId: 'F1', fcId: 'FC-03', fcDesc: 'Pitch oscillation', severity: 'Hazardous', phases: 'Takeoff' };
    G.acFhaData = [r104].concat(acFhaData);
    const fc2 = G._macFcForRule({ subId: 'F1' });
    check('two conditions tied at Hazardous: the longer exposure (103) wins over the first listed (104)', fc2 === r103, fc2 && fc2.internalId);
    G.acFhaData = G.acFhaData.slice(1);
}

// ---- [5] CMA -----------------------------------------------------------------------------------------------------
console.log('\n[5] CMA linked-gates picker');
{
    G.populateCmaLinkedGatesDropdown([]);
    const h = host('cma-linked-gates').innerHTML;
    check('the gates of the governing tree P1 and of FC-02\'s P3 are offered', /value="P1:10"/.test(h) && /value="P3:30"/.test(h), h.slice(0, 300));
    check('the per-row copy tree P2 (linked only to row 101, whose governing row has P1) is not offered', !/value="P2:20"/.test(h));
    G.populateCmaLinkedGatesDropdown(['P2:20']);
    check('a gate an entry already names is still shown', /value="P2:20"/.test(host('cma-linked-gates').innerHTML));
    check('the CMA detectors still walk every gate (_enumerateAllGates unchanged)', G._enumerateAllGates().some(g => g.page.id === 'P2'));
}

// ---- [6] listAllArtifacts -----------------------------------------------------------------------------------------
console.log('\n[6] command palette / trace graph list');
{
    const all = Traceability.listAllArtifacts();
    const ac = all.filter(a => a.kind === 'acFha'), sy = all.filter(a => a.kind === 'sysFha');
    check('aircraft FHA: one entry per failure condition (103, 201)', ac.map(a => a.id).join(',') === '103,201', ac.map(a => a.id).join(','));
    check('labelled with how many rows it stands for', /most conservative of 3/.test((ac.find(a => a.id === 103) || {}).label || ''));
    check('system FHA: FC-S1 once, its longest-exposure row (302, Cruise)', sy.map(a => a.id).join(',') === '302' && /most conservative of 2/.test(sy[0].label), sy.map(a => a.id + ' ' + a.label).join(' | '));
}

// ---- [7] golden thread report -----------------------------------------------------------------------------------
console.log('\n[7] golden thread trace report');
{
    const rows = G._gtvReportRows();
    const fc01 = rows.filter(r => r['FC ID'] === 'FC-01');
    check('one thread per failure condition (FC-01, FC-02, FC-S1)', rows.length === 3 && fc01.length === 1, rows.map(r => r['FC ID']).join(','));
    check('FC-01\'s thread is its governing row (Hazardous), labelled, FC ID left plain for the R&M join', fc01[0] && fc01[0]['Severity'] === 'Hazardous' && /most conservative of 3/.test(fc01[0]['Failure Condition']) && fc01[0]['FC ID'] === 'FC-01');
    check('its trees are gathered from every row of the condition (P1 and P2)', fc01[0] && /PASA FC-01/.test(fc01[0]['Fault Tree(s)']) && /FC-01 Taxi copy/.test(fc01[0]['Fault Tree(s)']), fc01[0] && fc01[0]['Fault Tree(s)']);
}

// ---- [8] _governingFhaForPage (a closure in AutoReq: extracted, with the functions it reads) ----------------------
console.log('\n[8] the governing FHA row of a tree page');
{
    const am = L('assurance_modules.js');
    const fnText = (src, name) => { const at = src.indexOf('function ' + name + '('); if (at < 0) return ''; const open = src.indexOf('{', src.indexOf(')', at)); let d = 0; for (let i = open; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); } } return ''; };
    const body = ['_governingFhaForPage', '_canonicalizeFhaGroup', '_rollupChartProp', 'moreRestrictiveSev'].map(n => fnText(am, n)).join('\n');
    const api = (0, eval)('(function(){ const SEV_ORDER = { "No Safety Effect": 0, Negligible: 1, Minor: 2, Major: 3, Hazardous: 4, Catastrophic: 5 };\n' + body + '\nreturn { _governingFhaForPage, _canonicalizeFhaGroup }; })()');
    const gCopy = api._governingFhaForPage(ftaPages[1]);   // P2: linked to row 101 only
    check('a page linked only to row 101 governs on FC-01\'s governing row 103 (Hazardous)', gCopy && gCopy.fha === r103 && gCopy.effSev === 'Hazardous', gCopy && gCopy.fha.internalId);
    const gP1 = api._governingFhaForPage({ id: 'X', linkedFhaIds: [101, 102] });
    check('a page linked to rows 101 and 102 governs on 103 too (the same tie rule as SLFcTrees)', gP1 && gP1.fha === r103, gP1 && gP1.fha.internalId);
    const canon = api._canonicalizeFhaGroup([r101, r102, r103]).internalId;
    check('its pair-trace names the safety requirement genFHA writes for FC-01 (the canonical row\'s sourceId)', gCopy && gCopy.sourceId === 'ac:fha:prob:' + canon, gCopy && gCopy.sourceId + ' vs ' + canon);
    // the CCMR latent sweep's resolution (helpers_modules.js) is the same one
    const c1 = G._ccmrPageFha(ftaPages[1]), c2 = G._ccmrPageFha({ id: 'X', linkedFhaIds: [101, 102] });
    check('_ccmrPageFha: the same rows (103 for both pages)', c1 && c1.fha === r103 && c2 && c2.fha === r103, (c1 && c1.fha.internalId) + ' / ' + (c2 && c2.fha.internalId));
}

// ---- [9] SLFcTrees not loaded yet ----------------------------------------------------------------------------------
console.log('\n[9] before fc_auto_trees.js loads: every row, as before');
{
    const keep = G.SLFcTrees; delete G.SLFcTrees;
    G._coffeSelectedFc = null; G.renderCoffePanel();
    const sel = (host('coffe-host').innerHTML.match(/<select[^>]*_coffeSelectedFc[\s\S]*?<\/select>/) || [''])[0];
    check('CoFFE lists the three FC-01 rows, unlabelled', opts(sel).filter(x => /FC-01/.test(x)).length === 3 && !/most conservative/.test(sel));
    check('listAllArtifacts lists every aircraft row', Traceability.listAllArtifacts().filter(a => a.kind === 'acFha').length === 4);
    check('_macFcForRule keeps the old worst-severity pick (the first worst row)', G._macFcForRule({ subId: 'F1' }) === r102);
    G.SLFcTrees = keep;
}

// ---- [10] QUESTION: AutoReq DAL per function --------------------------------------------------------------------
console.log('\n[10] AutoReq: one DAL requirement per FUNCTION from its most conservative failure condition?');
{
    // function F9 has three failure conditions of different severity (each its own FC ID)
    G.acFunctionsData = [{ subId: 'F9', subName: 'Control yaw' }];
    const fa = { internalId: 901, subId: 'F9', fcId: 'FC-91', fcDesc: 'Erroneous yaw', severity: 'Major', phases: 'Cruise', chartProps: { isSimple: false, isRedundant: false } };
    const fb = { internalId: 902, subId: 'F9', fcId: 'FC-92', fcDesc: 'Loss of yaw', severity: 'Hazardous', phases: 'Cruise', chartProps: { isSimpleConventional: false } };
    const fcx = { internalId: 903, subId: 'F9', fcId: 'FC-93', fcDesc: 'Hardover yaw', severity: 'Catastrophic', phases: 'Takeoff', chartProps: { isSimpleConventional: false } };
    G.acFhaData = [fa, fb, fcx]; G.systemsData = []; G.cmaData = [];
    // one fault tree per failure condition, each with the function as an aircraft-level node (same logicalId)
    const tree = (id, fcRow, dal) => ({ id, name: 'PASA ' + fcRow.fcId, treeLevel: 'aircraft', linkedFhaIds: [fcRow.internalId],
        root: { id: id + '0', logicalId: 'TOP-' + fcRow.fcId, displayId: 'T-' + fcRow.fcId, name: fcRow.fcDesc, type: 'gate', gateType: 'OR', allocatedDAL: dal,
            children: [{ id: id + '1', logicalId: 'FN-F9', displayId: 'FN-F9', name: 'Yaw control function', type: 'undeveloped', allocatedDAL: dal, children: [] }] } });
    G.ftaPages = [tree('Q1', fa, 'C'), tree('Q2', fb, 'B'), tree('Q3', fcx, 'A')];
    let res = null, err = null;
    try { res = AutoReq.generate({ fha: true, dalgebra: true }, 'ac'); } catch (e) { err = e; }
    // an empty register: every candidate is new
    const all = (res && Array.isArray(res.isNew)) ? res.isNew : [];
    const fhaDal = all.filter(r => r.reqSource && r.reqSource.generator === 'fha-dal');
    const fhaDalF9 = fhaDal.filter(r => r.reqSource.context && r.reqSource.context.subId === 'F9');
    console.log('  info  generate() keys: ' + (res ? Object.keys(res).join(',') : 'threw ' + (err && err.message)));
    console.log('  info  fha-dal (FHA -> function DAL): ' + fhaDalF9.map(r => r.text + ' | ' + r.rat).join(' || '));
    check('genFHA: ONE function DAL requirement for F9 (three failure conditions)', fhaDalF9.length === 1, fhaDalF9.length + ' (' + (err ? err.message : '') + ')');
    check('at the most conservative: FDAL A (Catastrophic FC-93)', fhaDalF9.length === 1 && / FDAL A\.$/.test(fhaDalF9[0].text) && fhaDalF9[0].reqSource.context.effSeverity === 'Catastrophic', fhaDalF9[0] && fhaDalF9[0].text);
    const dg = all.filter(r => r.reqSource && r.reqSource.generator === 'dalgebra');
    const dgFn = dg.filter(r => /:FN-F9$/.test(r.reqSource.sourceId));
    console.log('  info  dalgebra rows: ' + dg.map(r => r.reqSource.sourceId + ' -> ' + r.text).join(' || '));
    check('genDALgebra: ONE requirement for the function node shared by the three trees (logicalId FN-F9)', dgFn.length === 1, dgFn.length);
    check('at the strictest DAL across the trees (A, from the Catastrophic tree)', dgFn.length === 1 && / FDAL A\.$/.test(dgFn[0].text), dgFn[0] && dgFn[0].text);
    console.log('  info  genDALgebra also writes one requirement per tree TOP event (one per failure condition): ' + dg.filter(r => /:TOP-/.test(r.reqSource.sourceId)).length);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? ' (mutation ' + MUT + ')' : ''));
process.exit(fail ? 1 : 0);

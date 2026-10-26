#!/usr/bin/env node
/*
 * Regression: a failure condition written as several FHA rows is offered ONCE on the fault tree side (26 Oct 2026).
 *
 * RULING (Waqas, 26 Oct 2026): "fault trees should be generated for the most conservative severity classification
 *   only ... same with CoFFEE and other analyses we just need the most conservative instances". A failure condition
 *   that appears as several FHA rows (same FC ID, one per phase) is offered once wherever someone picks or views
 *   failure conditions: its GOVERNING row (worst severity, ties: the longest exposure), from the one shared rule in
 *   fc_auto_trees.js (SLFcTrees). The FHA tables keep every row.
 * THE PROJECT: aircraft FC-1 as three rows: 11 Major (Taxi), 12 Hazardous (Climb, 0.1 h), 13 Hazardous (Cruise,
 *   2 h). Its governing row is 13: a tie on Hazardous, settled by the longer exposure (the old local rule, first row
 *   on a tie, would pick 12). System FC-S1 the same shape (31/32/33, governing 33). FC-2 one row.
 * COVERED (VM, the real functions sliced from the app files):
 *   [L] misc_fn_modules.js updateFTAConfigUI: the tree's "link to a failure condition" list offers 13 and 33 only,
 *       labelled "(most conservative of 3)"; a tree already linked to a phase copy keeps that row in its list.
 *   [M] mfmsNewAuthoredTree / wsPssaNewTree: the prompt lists each FC once, and the FC ID links the governing row.
 *   [C] interdepExportCsv: one line per failure condition, the governing row's severity, labelled.
 *   [W] fta_view_modules.js _refreshSysWizard: one entry per FC, the governing row (exposure tie rule), labelled.
 *   [P] refreshFcLinkPanel: one entry per FC; a system row traced to FC-1 shows the governing row's severity.
 *   [G] _gtvBuildGraph: one failure condition node for FC-1 (row 13), labelled, and a tree linked to the phase copy
 *       11 still joins that node.
 *   [S] idp_seed_trees.js: one MF&MS seed per failure condition, on the governing row, built from all its rows; a
 *       project already holding a seed on a phase copy keeps it and gets no second one; nothing is deleted.
 *   [F] without SLFcTrees (it loads late) every place behaves as before: every row.
 * MUTATION PROOFS: SL_FCMC_MUTATE=link | prompt | csv | wizard | panel | graph | seed reverts that one change.
 *   Each turns this red.
 * Run: node tests/regression_fc_most_conservative_fta_20261026.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_FCMC_MUTATE || '';
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function slice(src, a, b, what) {
    const i = src.indexOf(a); if (i < 0) throw new Error('slice start not found: ' + what);
    const j = src.indexOf(b, i + a.length); if (j < 0) throw new Error('slice end not found: ' + what);
    return src.slice(i, j);
}
function sub(src, from, to, what) { if (src.indexOf(from) < 0) throw new Error('mutation anchor not found: ' + what); return src.replace(from, to); }

// ---- the sources, each mutation reverting one change ---------------------------------------------------------------
let misc = S('misc_fn_modules.js'), fv = S('fta_view_modules.js'), idp = S('idp_seed_trees.js');
if (MUT === 'link') misc = sub(misc, "_slGovOnly(acFhaData, currentVal, 'AC_')", '(acFhaData || [])', 'link');
if (MUT === 'prompt') misc = sub(sub(misc, "const crit = _slGovOnly(acFhaData).filter(", 'const crit = (acFhaData || []).filter(', 'prompt'), "const fc = _slByFcId(crit, pick, 'ac');", 'const fc = crit.find(f => f.fcId === pick.trim());', 'prompt2');
if (MUT === 'csv') misc = sub(misc, 'const fcs = _slGovOnly(acFhaData);', 'const fcs = acFhaData || [];', 'csv');
if (MUT === 'wizard') fv = sub(fv, "const _T = (typeof SLFcTrees !== 'undefined' && SLFcTrees && typeof SLFcTrees.governingOf === 'function') ? SLFcTrees : null;\n    const groups = new Map();", 'const _T = null;\n    const groups = new Map();', 'wizard');
if (MUT === 'panel') fv = sub(fv, "const _T = (typeof SLFcTrees !== 'undefined' && SLFcTrees && typeof SLFcTrees.isGoverning === 'function') ? SLFcTrees : null;\n    const _acList", 'const _T = null;\n    const _acList', 'panel');
if (MUT === 'graph') fv = sub(fv, 'if (_gtvFcT) { try { _gov = _gtvFcT.governingOf(fha) || fha; }', 'if (false) { try { _gov = _gtvFcT.governingOf(fha) || fha; }', 'graph');
if (MUT === 'seed') idp = sub(idp, '_units().forEach(function (u) {', '_fcs().map(function (r) { return { gov: r, rows: [r] }; }).forEach(function (u) {', 'seed');

const MISC = [
    slice(misc, '// 26 Oct 2026 (Waqas: "we just need the most conservative instances")', 'function updateFTAConfigUI() {', 'misc helpers'),
    slice(misc, 'function updateFTAConfigUI() {', '// Phase 56.38', 'updateFTAConfigUI'),
    slice(misc, 'async function mfmsNewAuthoredTree() {', 'async function mfmsAiRestructure(', 'mfms/pssa new tree'),
    slice(misc, 'function interdepExportCsv() {', 'function _macStore() {', 'interdepExportCsv')
].join('\n');
const FV = [
    slice(fv, 'function _hideSysWizard() {', 'function onAcFcLinkChange() {', 'wizard + fc link panel'),
    slice(fv, 'function _gtvSystemsForFc(', '// Hand-rolled layered-Sankey layout', 'golden thread graph')
].join('\n');

// ---- the project ---------------------------------------------------------------------------------------------------
const EXP = { Taxi: 0.05, Climb: 0.1, Cruise: 2.0, Approach: 0.2 };
function project() {
    return {
        acFhaData: [
            { internalId: 11, fcId: 'FC-1', fcDesc: 'Loss of pitch control', subId: 'AF1', severity: 'Major', phases: 'Taxi' },
            { internalId: 12, fcId: 'FC-1', fcDesc: 'Loss of pitch control', subId: 'AF1', severity: 'Hazardous', phases: 'Climb' },
            { internalId: 13, fcId: 'FC-1', fcDesc: 'Loss of pitch control', subId: 'AF1', severity: 'Hazardous', phases: 'Cruise' },
            { internalId: 20, fcId: 'FC-2', fcDesc: 'Loss of braking', subId: 'AF2', severity: 'Catastrophic', phases: 'Approach' }
        ],
        systemsData: [
            { id: 'sysA', name: 'Flight Controls', functions: [{ funcId: 'SF1', funcName: 'Pitch', traceIds: ['AF1'] }], fha: [
                { internalId: 31, fcId: 'FC-S1', fcDesc: 'Loss of elevator', subId: 'SF1', severity: 'Major', phases: 'Taxi' },
                { internalId: 32, fcId: 'FC-S1', fcDesc: 'Loss of elevator', subId: 'SF1', severity: 'Hazardous', phases: 'Climb' },
                { internalId: 33, fcId: 'FC-S1', fcDesc: 'Loss of elevator', subId: 'SF1', severity: 'Hazardous', phases: 'Cruise' },
                { internalId: 40, fcId: 'FC-S2', fcDesc: 'Elevator jam', subId: 'SF1', severity: 'Minor', phases: 'Cruise', acTrace: 'FC-1' },
                { internalId: 50, fcId: 'FC-S3', fcDesc: 'Pitch trim runaway', subId: 'SF1', severity: 'Major', phases: 'Cruise', acTrace: 12 }] },
            { id: 'sysB', name: 'Hydraulics', functions: [{ funcId: 'SH1', funcName: 'Power', traceIds: ['AF1'] }], fha: [] }
        ],
        acFunctionsData: [{ subId: 'AF1', funcName: 'Control pitch' }, { subId: 'AF2', funcName: 'Decelerate' }]
    };
}

function el(id) { return { id, value: '', innerHTML: '', textContent: '', style: {}, checked: false, disabled: false }; }
function makeCtx(withTrees) {
    const P = project();
    const els = {};
    const out = { prompts: [], csv: null, opened: [] };
    const ctx = {
        console, Math, JSON, Date, Map, Set, String, Number, Array, Object, RegExp, Error, Promise, isFinite, parseFloat,
        setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
        acFhaData: P.acFhaData, systemsData: P.systemsData, acFunctionsData: P.acFunctionsData,
        ftaPages: [], cmaData: [], zsaData: [], praData: [], fmeaData: [], acReqData: [], stpaData: null, resourcesData: [],
        acAssumptionsData: [], ramItemsData: [],
        internalIdCounter: 9000,
        ftaConfig: { exposureTime: 1, exposureSource: 'auto', apportion: 'equal', missionProfileId: '' },
        selectedNodeData: null,
        SEVERITY_RANK: { Catastrophic: 5, Hazardous: 4, Major: 3, Minor: 2, Negligible: 1 },
        esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        getPhaseExposureRatio: ph => ({ exposedHours: EXP[String(ph || '').trim()] || 0 }),
        getSafetyTarget: sev => ({ Catastrophic: { prob: 1e-9, dal: 'A' }, Hazardous: { prob: 1e-7, dal: 'B' }, Major: { prob: 1e-5, dal: 'C' }, Minor: { prob: 1e-3, dal: 'D' } }[sev] || { prob: null, dal: 'E' }),
        getAllSysFha: () => P.systemsData.flatMap(s => s.fha),
        slPrompt: async (msg, def) => { out.prompts.push(msg); return out.nextPick != null ? out.nextPick : def; },
        showToast: () => {}, openFTAPageById: id => out.opened.push(id), commitSaveChanges: () => {}, scheduleAutosave: () => {},
        idpCell: (fc, sid) => ({ state: sid === 'sysA' ? 'contributes' : '', kind: 'direct' }),
        idpContributors: fc => ({ 11: ['sysA', 'sysB'], 12: ['sysA', 'sysB'], 13: ['sysA', 'sysB'], 20: ['sysA'] }[fc.internalId] || []),
        Blob: function (parts) { out.csv = parts.join(''); },
        URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
        document: { readyState: 'complete', getElementById: id => (els[id] = els[id] || el(id)), createElement: () => ({ click: () => {} }), addEventListener: () => {} }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    if (withTrees) vm.runInContext(S('fc_auto_trees.js'), ctx, { filename: 'fc_auto_trees.js' });
    vm.runInContext(MISC, ctx, { filename: 'misc_fn_modules.js (slices)' });
    vm.runInContext(FV, ctx, { filename: 'fta_view_modules.js (slices)' });
    vm.runInContext(idp, ctx, { filename: 'idp_seed_trees.js' });
    ctx.sys = () => P.systemsData[0];
    return { ctx, els, out, P };
}
const opts = html => { const r = []; html.replace(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g, (m, v, t) => { r.push({ v, t }); return m; }); return r; };

(async function main() {
    // ---- with the shared rule ----
    const A = makeCtx(true);
    const T = A.ctx.SLFcTrees;
    check('SLFcTrees: FC-1 governs on row 13 (Hazardous tie, longer exposure), FC-S1 on 33', T && T.governingOf(A.P.acFhaData[0]) === A.P.acFhaData[2] && T.governingOf(A.P.systemsData[0].fha[0]) === A.P.systemsData[0].fha[2]);

    // [L] the tree's FC link dropdown
    A.els['fta-calc-mode'] = Object.assign(el('fta-calc-mode'), { value: 'top-down' });
    A.ctx.updateFTAConfigUI();
    let L = opts(A.els['fta-fha-link'].innerHTML).filter(o => o.v);
    const lv = L.map(o => o.v);
    check('[L] the link list offers each failure condition once: AC_13, AC_20, SYS_33 (no phase copies 11/12/31/32)',
        lv.includes('AC_13') && lv.includes('AC_20') && lv.includes('SYS_33') && !lv.some(v => /^(AC_11|AC_12|SYS_31|SYS_32)$/.test(v)), lv.join(','));
    check('[L] the governing entries are labelled "(most conservative of 3)", single ones are not',
        /most conservative of 3/.test((L.find(o => o.v === 'AC_13') || {}).t) && /most conservative of 3/.test((L.find(o => o.v === 'SYS_33') || {}).t) && !/most conservative/.test((L.find(o => o.v === 'AC_20') || {}).t), JSON.stringify(L));
    A.els['fta-fha-link'].value = 'AC_11';
    A.ctx.updateFTAConfigUI();
    L = opts(A.els['fta-fha-link'].innerHTML).filter(o => o.v).map(o => o.v);
    check('[L] a tree already linked to phase copy 11 keeps that row in its own list (never silently unlinked)', L.includes('AC_11') && L.includes('AC_13') && !L.includes('AC_12'), L.join(','));

    // [M] the new-tree prompts
    A.out.nextPick = 'FC-1';
    await A.ctx.mfmsNewAuthoredTree();
    const p1 = A.out.prompts[0] || '';
    const pg1 = A.ctx.ftaPages[A.ctx.ftaPages.length - 1];
    check('[M] MF&MS authored: the prompt lists FC-1 once, labelled', (p1.match(/FC-1 /g) || []).length === 1 && /most conservative of 3/.test(p1), p1);
    check('[M] MF&MS authored: FC-1 links the governing row 13 (was: the first row with the ID)', pg1 && pg1.linkedFhaId === 13, pg1 && pg1.linkedFhaId);
    A.out.nextPick = 'FC-S1';
    await A.ctx.wsPssaNewTree();
    const p2 = A.out.prompts[1] || '';
    const pg2 = A.ctx.ftaPages[A.ctx.ftaPages.length - 1];
    check('[M] PSSA new tree: the prompt lists FC-S1 once, labelled', (p2.match(/FC-S1 /g) || []).length === 1 && /most conservative of 3/.test(p2), p2);
    check('[M] PSSA new tree: FC-S1 links the governing row 33', pg2 && pg2.linkedFhaId === 33 && /FC-S1/.test(pg2.name), pg2 && (pg2.linkedFhaId + ' ' + pg2.name));

    // [C] interdependence CSV
    A.ctx.interdepExportCsv();
    const lines = String(A.out.csv || '').split('\n');
    const fc1 = lines.filter(l => /"FC-1"/.test(l));
    check('[C] the interdependence export has one line for FC-1, the governing severity, labelled', fc1.length === 1 && /"Hazardous \(most conservative of 3\)"/.test(fc1[0]) && lines.length === 3, lines.join(' / '));

    // [W] the system tree wizard
    A.ctx._refreshSysWizard({ treeLevel: 'system', systemId: 'sysA', _wizardSubId: 'SF1' });
    const W = opts(A.els['fta-sys-fc'].innerHTML).filter(o => o.v);
    const w1 = W.filter(o => /^FC-S1:/.test(o.t));
    check('[W] the wizard offers FC-S1 once, as governing row 33 (the exposure tie rule, not the first Hazardous row)', w1.length === 1 && w1[0].v === '33', JSON.stringify(W));
    check('[W] ... labelled with how many rows it stands for', w1.length === 1 && /most conservative of 3/.test(w1[0].t), w1[0] && w1[0].t);

    // [P] the system row's aircraft trace panel
    A.els['fta-fha-link'].value = 'SYS_40';
    A.ctx.refreshFcLinkPanel();
    const Pn = opts(A.els['fta-ac-fc-link'].innerHTML).filter(o => o.v);
    check('[P] the aircraft trace list offers FC-1 once, labelled', Pn.filter(o => o.v === 'FC-1').length === 1 && /most conservative of 3/.test(Pn.find(o => o.v === 'FC-1').t), JSON.stringify(Pn));
    const eff = A.els['fta-fc-link-effective'].textContent;
    check('[P] the trace resolves to the governing row: effective severity Hazardous, AC Hazardous (first row would be Major)', /Effective severity: Hazardous/.test(eff) && /AC: Hazardous/.test(eff), eff);

    // [G] the golden thread graph
    A.ctx.ftaPages.push({ id: 'old-11', name: 'Old tree on the Taxi copy', linkedFhaId: 11, root: { type: 'gate', children: [] } });
    const G = A.ctx._gtvBuildGraph({});
    const fcN = G.nodes.filter(n => n.kind === 'fc' && n.label === 'FC-1');
    check('[G] the graph has ONE node for FC-1, row 13, labelled', fcN.length === 1 && fcN[0].id === 'AC:13' && /most conservative of 3/.test(fcN[0].sub), JSON.stringify(G.nodes.filter(n => n.kind === 'fc').map(n => n.key + ' ' + n.sub)));
    check('[G] the SFHA condition FC-S1 is one node too (row 33)', G.nodes.filter(n => n.kind === 'fc' && n.label === 'FC-S1').map(n => n.id).join() === 'SYS:33');
    check('[G] a tree linked to the phase copy 11 still joins the FC-1 node', G.links.some(l => l.s === 'fc:AC:13' && l.t === 'fta:old-11'), JSON.stringify(G.links.filter(l => /fta:/.test(l.t))));

    // [S] MF&MS seeds
    A.ctx.ftaPages.length = 0;
    const r1 = A.ctx.SL_IDP.run();
    const seeds = A.ctx.ftaPages.filter(p => /^idp-pg-/.test(p.id)).map(p => p.id);
    check('[S] one seed for FC-1, on the governing row (idp-pg-13), none on its phase copies', seeds.join() === 'idp-pg-13' && r1.seeded === 1, seeds.join() + ' ' + JSON.stringify(r1));
    const s13 = A.ctx.ftaPages.find(p => p.id === 'idp-pg-13');
    check('[S] the seed is built from all the condition\'s rows: the SFHA row traced to copy 12 is in it', s13 && JSON.stringify(s13.root).indexOf('SYS_50') >= 0);
    const r1b = A.ctx.SL_IDP.run();
    check('[S] a re-run is a no-op', r1b.seeded === 0 && r1b.regenerated === 0 && r1b.removed === 0 && A.ctx.ftaPages.length === 1, JSON.stringify(r1b));
    // an existing project seeded per row by an older build
    const B = makeCtx(true);
    B.ctx.ftaPages.push({ id: 'idp-pg-11', name: 'MF&MS · FC-1 — seeded', root: { type: 'gate', children: [{ type: 'basic', name: 'my work' }] }, linkedFhaId: 11, _idpFp: 'x', _idpRootFp: 'y' });
    B.ctx.ftaPages.push({ id: 'idp-pg-12', name: 'MF&MS · FC-1 — seeded', root: { type: 'gate', children: [] }, linkedFhaId: 12, _idpFp: 'x', _idpRootFp: JSON.stringify({ type: 'gate', children: [] }, ['type', 'gateType', 'name', 'children', 'externalSource', 'kind', 'targetId', 'probability', 'lambda']) });
    const r2 = B.ctx.SL_IDP.run();
    const ids2 = B.ctx.ftaPages.map(p => p.id);
    check('[S] an older per-row seed counts as the condition\'s seed: no idp-pg-13 is added beside it', !ids2.includes('idp-pg-13') && r2.seeded === 0, ids2.join() + ' ' + JSON.stringify(r2));
    check('[S] nothing is deleted: both older seeds are still there', ids2.includes('idp-pg-11') && ids2.includes('idp-pg-12') && r2.removed === 0, ids2.join());

    // ---- [F] without SLFcTrees: as before ----
    const F = makeCtx(false);
    F.els['fta-calc-mode'] = Object.assign(el('fta-calc-mode'), { value: 'top-down' });
    F.ctx.updateFTAConfigUI();
    const fl = opts(F.els['fta-fha-link'].innerHTML).filter(o => o.v).map(o => o.v);
    check('[F] no SLFcTrees: the link list is every row, no labels, no error', fl.length === 9 && !/most conservative/.test(F.els['fta-fha-link'].innerHTML), fl.join());
    F.out.nextPick = 'FC-1';
    await F.ctx.mfmsNewAuthoredTree();
    check('[F] no SLFcTrees: FC-1 links the first matching row, as before', F.ctx.ftaPages[0] && F.ctx.ftaPages[0].linkedFhaId === 12);
    F.ctx._refreshSysWizard({ treeLevel: 'system', systemId: 'sysA', _wizardSubId: 'SF1' });
    check('[F] no SLFcTrees: the wizard keeps its old local pick', opts(F.els['fta-sys-fc'].innerHTML).filter(o => /^FC-S1:/.test(o.t)).map(o => o.v).join() === '32');
    F.ctx.ftaPages.length = 0;
    F.ctx.SL_IDP.run();
    check('[F] no SLFcTrees: one seed per row, as before', F.ctx.ftaPages.filter(p => /^idp-pg-1/.test(p.id)).length === 3, F.ctx.ftaPages.map(p => p.id).join());
    const fg = F.ctx._gtvBuildGraph({});
    check('[F] no SLFcTrees: one graph node per row, as before', fg.nodes.filter(n => n.kind === 'fc' && n.label === 'FC-1').length === 3);

    // the load contract: fc_auto_trees.js loads late, so every caller guards for it
    check('every changed place guards for SLFcTrees being absent', /typeof SLFcTrees !== 'undefined'/.test(MISC) && (FV.match(/typeof SLFcTrees !== 'undefined'/g) || []).length >= 3 && /typeof SLFcTrees !== 'undefined'/.test(idp));

    console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? '  (mutation: ' + MUT + ')' : ''));
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); process.exit(1); });

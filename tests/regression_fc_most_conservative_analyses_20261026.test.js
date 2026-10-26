#!/usr/bin/env node
/*
 * Regression: a failure condition written as several FHA rows is offered ONCE, as its most conservative row,
 * wherever an analysis picks or reads failure conditions (26 Oct 2026).
 *
 * RULING (Waqas, 26 Oct 2026): "fault trees should be generated for the most conservative severity classification
 *   only ... same with CoFFEE and other analyses we just need the most conservative instances".
 * THE RULE: the rows of one FC ID (one per flight phase) stand as their GOVERNING row: worst severity, ties the
 *   longest exposure (SLFcTrees in fc_auto_trees.js). The FHA tables keep every row. Each place that lists failure
 *   conditions lists the governing row only, labelled " (most conservative of N)"; each place that looked up "the
 *   first row with that FC ID" gets the governing row instead. Without SLFcTrees (it loads late) nothing changes.
 * FIXTURE: FC-01 has three aircraft rows: Major (Taxi), Hazardous (Takeoff, 0.1 h), Hazardous (Cruise, 2 h). Its
 *   governing row is the third (id 13): not the first row (Major) and not the first Hazardous (shorter exposure).
 *   SFC-01 has the same shape in a system FHA (governing id 33). FC-02 is one Catastrophic row.
 * EXECUTED in a vm, the real files:
 *   [ML] model_links.js  the "Link to model" picker (fc, sysFc): copies not offered, labelled, a typed code resolves
 *                        to the governing row, an old link to a copy still resolves
 *   [ST] stpa_panel.js   candidateFcs: the FHA anchors list
 *   [US] usoc.js         _fcOptions (the add-a-USOC pickers) and fcByFcId
 *   [PR] pra_scenarios.js fcsFor and the scenario editor's checkboxes; a linked copy classifies as its governing row
 *   [BT] bowtie.js       _fcOpts: the consequence's failure-condition choice, labelled
 *   [ET] event_trees.js  _fcOptions labelled; _fcSeverity is the governing row's (the reconcile check)
 *   [ZS] zsa_engine.js   functionSeverity reads the governing row (worst consequence)
 *   [AI] ai_assistant.js the "Synthesise allocation trees" list: governing rows only; an FC is treed when ANY row is
 *   [LT] lane_trees.js   bindLane: worst severity, ties the longest exposure, as SLFcTrees
 *   [FB] fallback: without SLFcTrees every row is offered as before
 * MUTATION PROOFS: SL_FCGOV_MUTATE=model_links | stpa | usoc | pra | bowtie | eta | etasev | zsa | ai | lane
 *   each reverts one change in a copy of its file: red.
 * Run: node tests/regression_fc_most_conservative_analyses_20261026.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const MUT = process.env.SL_FCGOV_MUTATE || '';
const MUTS = {
    'model_links.js': ['model_links', 'return { copy: !FT.isGoverning(f),', 'return { copy: false,'],
    'stpa_panel.js': ['stpa', 'return FT.governingRows(scopeArg) || [];', 'return rows || [];'],
    'usoc.js': ['usoc', "if (F) { try { rows = F.governingRows('ac') || rows; } catch (_) {} }", ''],
    'pra_scenarios.js': ['pra', 'var g = _gov(f); if (out.indexOf(g) === -1) out.push(g);', 'if (out.indexOf(f) === -1) out.push(f);'],
    'bowtie.js': ['bowtie', 'label: v + note(v)', 'label: v'],
    'zsa_engine.js': ['zsa', "if (hit && FT && typeof FT.governingOf === 'function') { try { hit = FT.governingOf(hit) || hit; } catch (_) {} }", ''],
    'ai_assistant.js': ['ai', 'if (g.gov !== r) return;', ''],
    'lane_trees.js': ['lane', 'var FT = fcTrees();\n        if (FT) {', 'var FT = null;\n        if (FT) {']
};
const ETA_MUTS = { eta: ['label: v + note(v)', 'label: v'], etasev: ["if (FT && typeof FT.byFcId === 'function') { try { const g = FT.byFcId(fcId, 'all'); if (g) return g.severity || ''; } catch (_) {} }", ''] };
function S(f) {
    let s = fs.readFileSync(path.join(SITE, f), 'utf8');
    const m = MUTS[f];
    if (m && MUT === m[0]) { if (s.indexOf(m[1]) < 0) throw new Error('mutation anchor not found in ' + f); s = s.replace(m[1], m[2]); }
    if (f === 'event_trees.js' && ETA_MUTS[MUT]) { const e = ETA_MUTS[MUT]; if (s.indexOf(e[0]) < 0) throw new Error('mutation anchor not found in event_trees.js'); s = s.replace(e[0], e[1]); }
    return s;
}
// a named function's source, braces matched (the same extractor the other regression tests use)
const extract = (src, name) => { const at = src.indexOf('function ' + name + '('); if (at < 0) throw new Error('no ' + name); const open = src.indexOf('{', at); let d = 0; for (let i = open; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return src.slice(at, i + 1); } } throw new Error('unbalanced ' + name); };

const PH = { Taxi: 0.2, Takeoff: 0.1, Cruise: 2, Landing: 0.1 };
const NOTE = ' (most conservative of 3)';
function project() {
    const fc01 = (id, sev, ph) => ({ internalId: id, fcId: 'FC-01', fcDesc: 'Loss of pitch control', severity: sev, subId: 'F-PITCH', phases: [ph] });
    const sfc = (id, sev, ph) => ({ internalId: id, fcId: 'SFC-01', fcDesc: 'Loss of elevator command', severity: sev, subId: 'FN-1', phases: [ph] });
    return {
        acFunctionsData: [{ internalId: 501, subId: 'F-PITCH', subName: 'Control pitch' }, { internalId: 502, subId: 'F-HYD', subName: 'Provide hydraulic power' }],
        acFhaData: [fc01(11, 'Major', 'Taxi'), fc01(12, 'Hazardous', 'Takeoff'), fc01(13, 'Hazardous', 'Cruise'),
                    { internalId: 20, fcId: 'FC-02', fcDesc: 'Loss of hydraulic power', severity: 'Catastrophic', subId: 'F-HYD', phases: ['Cruise'] }],
        systemsData: [{ id: 'sys-fcs', name: 'Flight controls', functions: [{ internalId: 601, funcId: 'FN-1', funcName: 'Move elevator', traceIds: ['F-PITCH'] }],
                        fha: [sfc(31, 'Major', 'Taxi'), sfc(32, 'Hazardous', 'Takeoff'), sfc(33, 'Hazardous', 'Cruise')] }],
        acFcimData: [{ subId: 'F-PITCH', awareness: 'aware', tlId: 'FC-01' }],
        zsaData: [{ internalId: 77, zoneId: 'Z-1', housedFunctions: ['F-PITCH'] }],
        praData: [{ internalId: 'p1', praId: 'PRA-1', threat: 'Rotorburst', affectedZones: ['Z-1'], scenarios: [{ scnId: 'S1', affected: ['F-PITCH'], fcIds: [], acceptable: 'open' }] }],
        ftaPages: [], itemsData: [], resourcesData: [], routingData: [], fmeaData: [], cmaData: [], acAssumptionsData: [],
        projectConfig: { zones: [], hf: {}, ram: {}, lcc: {}, interdep: {}, coffe: {} }
    };
}
function sandbox(opts) {
    opts = opts || {};
    const sb = Object.assign({ console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array, String, Number, Date, Map, Set, RegExp, Error, Promise, isFinite, isNaN, parseFloat, parseInt, Symbol,
        setTimeout: () => 0, clearTimeout() {}, showToast() {}, commitSaveChanges() {}, scheduleAutosave() {}, internalIdCounter: 9000,
        getPhaseExposureRatio: phases => ({ exposedHours: (phases || []).reduce((a, p) => a + (PH[p] || 0), 0) }) }, project());
    sb.window = sb; sb.globalThis = sb; sb.self = sb;
    sb.SLEnv = { get: n => sb[n] };
    vm.createContext(sb);
    if (!opts.noFt) vm.runInContext(fs.readFileSync(path.join(SITE, 'fc_auto_trees.js'), 'utf8'), sb, { filename: 'fc_auto_trees.js' });
    return sb;
}
const run = (sb, src, file) => vm.runInContext(src, sb, { filename: file });
const fnIn = (sb, file, names, extra) => { const src = S(file); run(sb, names.map(n => extract(src, n)).join('\n') + '\n' + (extra || '') + '\nthis.__fns = { ' + names.map(n => n + ': ' + n).join(', ') + ' };', file); return sb.__fns; };

// ---- the shared rule -----------------------------------------------------------------------------------------------
{
    const sb = sandbox(), FT = sb.SLFcTrees;
    check('[S0] SLFcTrees: FC-01\'s governing row is the long-exposure Hazardous row (13), labelled as standing for 3', FT && FT.governingOf(sb.acFhaData[0]) === sb.acFhaData[2] && FT.copiesNote(sb.acFhaData[2]) === NOTE && FT.copiesNote(sb.acFhaData[3]) === '');
}

// ---- [ML] model_links.js ----------------------------------------------------------------------------------------------
function mlLoad(opts) { const sb = sandbox(opts); run(sb, fs.readFileSync(path.join(SITE, 'zonal_model.js'), 'utf8'), 'zonal_model.js'); run(sb, S('model_links.js'), 'model_links.js'); return sb; }
{
    const sb = mlLoad(), L = sb.SLModelLinks;
    const offered = k => L.index(k).list.filter(e => !e.copy);
    const fc = offered('fc'), sfc = offered('sysFc');
    check('[ML] aircraft FCs offered: FC-01 once, as its governing row 13, plus FC-02', JSON.stringify(fc.map(e => e.id)) === '["13","20"]', JSON.stringify(fc));
    check('[ML] the FC-01 entry says it stands for 3 rows; a one-row FC carries no label', /Hazardous \(most conservative of 3\)$/.test(fc[0].sub) && fc[1].sub === 'Catastrophic', fc.map(e => e.sub).join(' | '));
    check('[ML] system FCs offered: SFC-01 once, as row 33, labelled', JSON.stringify(sfc.map(e => e.id)) === '["33"]' && /most conservative of 3/.test(sfc[0].sub), JSON.stringify(sfc));
    check('[ML] a typed FC code resolves to the governing row (it was ambiguous across 3 rows)', L.resolveCode('fc', 'FC-01') === '13' && L.resolveCode('sysFc', 'SFC-01') === '33', L.resolveCode('fc', 'FC-01'));
    check('[ML] a link made earlier to a phase copy still resolves by id (never shown broken)', !!L.element('fc', '12') && !!L.element('sysFc', '31'));
    const fm = L.linksOf('fmea', { internalId: 70, fmeaType: 'functional', funcSubId: 'F-PITCH', linkedFcId: 'FC-01' }).find(l => l.slot === 'fc');
    check('[ML] an FMEA row naming FC-01 links the governing row', fm && fm.ok && fm.id === '13', JSON.stringify(fm));
    check('[ML] the picker lists a copy only while it is the selected link', /index\(k\.kind\)\.list\.forEach\(function \(e\) \{ if \(!e\.copy \|\| sel\.indexOf\(e\.id\) >= 0\) all\.push/.test(S('model_links.js')));
}

// ---- [ST] stpa_panel.js ------------------------------------------------------------------------------------------------
{
    const sb = sandbox(), F = fnIn(sb, 'stpa_panel.js', ['candidateFcs']);
    const c = F.candidateFcs(), fc01 = c.filter(x => x.fcId === 'FC-01'), s01 = c.filter(x => x.fcId === 'SFC-01');
    check('[ST] STPA FHA anchors: FC-01 once, the governing row 13, labelled', fc01.length === 1 && fc01[0].internalId === 13 && fc01[0].note === NOTE, JSON.stringify(fc01));
    check('[ST] STPA FHA anchors: SFC-01 once (row 33), FC-02 once', s01.length === 1 && s01[0].internalId === 33 && c.filter(x => x.fcId === 'FC-02').length === 1, JSON.stringify(c));
    check('[ST] the anchors table shows the label', /esc\(f\.desc\) \+ \(f\.note \? '<span[^']*' \+ esc\(f\.note\)/.test(S('stpa_panel.js')));
}

// ---- [US] usoc.js ------------------------------------------------------------------------------------------------------
function usLoad(opts) { const sb = sandbox(opts); run(sb, S('usoc.js').replace('    try { root.SLUsoc = api; }', '    root.__fcOptions = _fcOptions; root.__fcByFcId = fcByFcId;\n    try { root.SLUsoc = api; }'), 'usoc.js'); return sb; }
{
    const sb = usLoad(), html = sb.__fcOptions('');
    const vals = (html.match(/value="(\d+)"/g) || []).map(v => v.slice(7, -1));
    check('[US] the USOC pickers offer FC-01 once (row 13) and FC-02', JSON.stringify(vals) === '["13","20"]', html);
    check('[US] the FC-01 option is labelled', /FC-01 &quot;Loss of pitch control&quot; \(Hazardous\) \(most conservative of 3\)/.test(html), html);
    check('[US] an FC ID from the FCIM resolves to the governing row, not the first', sb.__fcByFcId('FC-01') === sb.acFhaData[2]);
}

// ---- [PR] pra_scenarios.js ---------------------------------------------------------------------------------------------
{
    const sb = sandbox(); run(sb, S('pra_scenarios.js'), 'pra_scenarios.js');
    const P = sb.SLPraScenarios;
    const sug = P.fcsFor(['F-PITCH']);
    check('[PR] suggested FCs for the functions hit: FC-01 once, row 13', sug.length === 1 && sug[0] === sb.acFhaData[2], JSON.stringify(sug.map(f => f.internalId)));
    check('[PR] a scenario linked to a phase copy classifies as the governing row (Hazardous, not Major)', P.classification({ fcIds: [11] }) === 'Hazardous', P.classification({ fcIds: [11] }));
    const html = P.modalHtml(sb.praData[0]);
    const boxes = (html.match(/data-f="fc" value="(\d+)"/g) || []).map(v => v.replace(/\D/g, ''));
    check('[PR] the scenario editor offers one FC-01 checkbox (13), labelled', JSON.stringify(boxes) === '["13"]' && html.indexOf('(Hazardous) (most conservative of 3)') >= 0, JSON.stringify(boxes));
    sb.praData[0].scenarios[0].fcIds = [12];
    const boxes2 = (P.modalHtml(sb.praData[0]).match(/data-f="fc" value="(\d+)"/g) || []).map(v => v.replace(/\D/g, ''));
    check('[PR] a phase copy linked before stays shown (ticked) beside the governing row', JSON.stringify(boxes2) === '["13","12"]', JSON.stringify(boxes2));
}

// ---- [BT] bowtie.js / [ET] event_trees.js ------------------------------------------------------------------------------
{
    const sb = sandbox(), B = fnIn(sb, 'bowtie.js', ['_fcOpts']);
    const o = B._fcOpts('');
    check('[BT] bow-tie consequence: one entry per FC, FC-01 labelled', o.filter(x => x.value === 'FC-01').length === 1 && o.find(x => x.value === 'FC-01').label === 'FC-01' + NOTE && o.find(x => x.value === 'FC-02').label === 'FC-02', JSON.stringify(o));
}
{
    const sb = sandbox(), E = fnIn(sb, 'event_trees.js', ['_fcOptions', '_fcSeverity']);
    const o = E._fcOptions('');
    check('[ET] event-tree end state: one entry per FC, FC-01 and SFC-01 labelled', o.find(x => x.value === 'FC-01').label === 'FC-01' + NOTE && o.find(x => x.value === 'SFC-01').label === 'SFC-01' + NOTE, JSON.stringify(o));
    check('[ET] the FHA reconcile reads the governing severity (Hazardous), not the first row (Major)', E._fcSeverity('FC-01') === 'Hazardous' && E._fcSeverity('SFC-01') === 'Hazardous' && E._fcSeverity('FC-02') === 'Catastrophic' && E._fcSeverity('FC-99') === null, E._fcSeverity('FC-01'));
}

// ---- [ZS] zsa_engine.js ------------------------------------------------------------------------------------------------
{
    const sb = sandbox(); run(sb, S('zsa_engine.js'), 'zsa_engine.js');
    const r = sb.SLZsaEngine.functionSeverity({ fcs: [{ fcId: 'FC-01' }] });
    check('[ZS] a function\'s worst consequence reads FC-01 as Hazardous (governing), not Major (first row)', r.severity === 'Hazardous' && r.fcs[0].from === 'Safety Lab FHA', JSON.stringify(r));
}

// ---- [AI] ai_assistant.js ----------------------------------------------------------------------------------------------
{
    const sb = sandbox();
    const A = fnIn(sb, 'ai_assistant.js', ['_allFhaFCs', '_fhaTreeGaps', '_fcsNeedingTree'], 'function snapshot() { return { ftaPages: ftaPages, acFhaData: acFhaData, systemsData: systemsData }; }');
    const g = A._fcsNeedingTree();
    check('[AI] "Synthesise allocation trees" lists governing rows only: 13, 20, 33', JSON.stringify(g.map(f => f.fhaInternalId)) === '[13,20,33]', JSON.stringify(g.map(f => f.fhaInternalId)));
    check('[AI] the FC-01 entry is labelled; FC-02 is not', g[0].note === NOTE && g[1].note === '', JSON.stringify(g.map(f => f.note)));
    sb.ftaPages.push({ id: 'pg-1', linkedFhaIds: [12], root: { id: 1, type: 'gate', children: [] } });
    sb.ftaPages.push({ id: 'pg-2', linkedFhaId: 'SYS_31', root: { id: 2, type: 'gate', children: [] } });
    const g2 = A._fcsNeedingTree();
    check('[AI] an FC counts as treed when a tree is linked to ANY of its rows (even a phase copy)', JSON.stringify(g2.map(f => f.fhaInternalId)) === '[20]', JSON.stringify(g2.map(f => f.fhaInternalId)));
    check('[AI] the picker shows the label', /_esc\(String\(f\.fcDesc \|\| ''\) \+ String\(f\.note \|\| ''\)\)/.test(S('ai_assistant.js')));
    check('[AI] the tree-review context uses the same gaps', /const fhaWithoutTree = _fhaTreeGaps\(pages\)/.test(S('ai_assistant.js')));
}

// ---- [LT] lane_trees.js ------------------------------------------------------------------------------------------------
{
    const sb = sandbox(); run(sb, S('lane_trees.js'), 'lane_trees.js');
    const b = sb.SLLaneTrees.bindLane({ subId: 'F-PITCH' }, 'tl');
    check('[LT] the lane binds FC-01\'s governing row (13: Hazardous, longest exposure), not the first Hazardous row', b.fc === sb.acFhaData[2], JSON.stringify(b.fc));
}

// ---- [FB] without SLFcTrees nothing changes ------------------------------------------------------------------------------
{
    const sb = mlLoad({ noFt: true });
    check('[FB] model links: every row offered when SLFcTrees has not loaded', JSON.stringify(sb.SLModelLinks.index('fc').list.filter(e => !e.copy).map(e => e.id)) === '["11","12","13","20"]');
    const su = usLoad({ noFt: true });
    check('[FB] USOC: every row offered and the first row by ID, as before', ((su.__fcOptions('').match(/value="\d+"/g) || []).length === 4) && su.__fcByFcId('FC-01') === su.acFhaData[0]);
    const se = sandbox({ noFt: true }), E = fnIn(se, 'event_trees.js', ['_fcSeverity']);
    check('[FB] event trees: the first row\'s severity, as before', E._fcSeverity('FC-01') === 'Major');
    const sa = sandbox({ noFt: true }), A = fnIn(sa, 'ai_assistant.js', ['_allFhaFCs', '_fhaTreeGaps', '_fcsNeedingTree'], 'function snapshot() { return { ftaPages: ftaPages, acFhaData: acFhaData, systemsData: systemsData }; }');
    check('[FB] AI synthesis: every row without its own tree, as before', A._fcsNeedingTree().length === 7);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed' + (MUT ? ' (mutation ' + MUT + ')' : ''));
process.exit(fail ? 1 : 0);

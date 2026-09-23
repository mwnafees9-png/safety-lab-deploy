#!/usr/bin/env node
/*
 * Regression — Part 23 Assessment Level from ASTM F3230 Table 3
 * (23 Sep 2026, standards gap G1).
 *
 * The app used to ask for "Class I–IV" in the old AC 23.1309-1E wording. It now
 * asks for the certification level (1–4) and the propulsion, and derives the
 * Assessment Level from F3230 Table 3 (p23_assessment_level.js).
 *
 *   A1  all 16 cells of Table 3, restated here independently of the module
 *   A2  propulsion outside the table (hybrid / eVTOL): no derived level; a
 *       manual level is accepted only then and is recorded as manual
 *   A3  an incomplete pick never clears or changes a saved class; a legacy
 *       project (class only) is reported as "not yet confirmed"
 *   A4  every derived level lands on a probability-target and DAL row that
 *       exists (safety_targets.js), and those rows are F3230 Table 5 / F3061
 *       Table 1 primary values
 *   A5  the picker: HTML carries both questions; syncPicker writes the config,
 *       shows the manual select only for "other", and the note says where the
 *       level came from
 *   A6  wiring: the wizard and the project settings use the picker; the old
 *       weight-based class wording is gone from both; the wizard refuses to
 *       create a Part 23 project without a level; the settings page warns on a
 *       legacy project; the module loads before first use
 * Run: node tests/regression_p23_assessment_level.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const ctx = { console, Math, JSON, String, Array, Object };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(read('p23_assessment_level.js'), ctx, { filename: 'p23_assessment_level.js' });
const P = ctx.SLP23;

// ---- A1 ---------------------------------------------------------------------------------
// F3230-21a Table 3, rows = certification level, columns = recip/electric ×1, >1, turbine ×1, >1
const TABLE3 = { 1: ['I', 'II', 'II', 'II'], 2: ['I', 'II', 'II', 'II'], 3: ['III', 'III', 'III', 'III'], 4: ['IV', 'IV', 'IV', 'IV'] };
const COLS = ['recip-1', 'recip-multi', 'turbine-1', 'turbine-multi'];
let cells = 0, bad = [];
for (const lvl of [1, 2, 3, 4]) COLS.forEach((c, i) => { cells++; const got = P.assessmentLevel(String(lvl), c); if (got !== TABLE3[lvl][i]) bad.push(lvl + '/' + c + '=' + got); });
check('A1: all 16 cells of F3230 Table 3', cells === 16 && bad.length === 0, bad.join(', '));
check('A1: numeric certification level works the same as a string', P.assessmentLevel(2, 'recip-multi') === 'II');
check('A1: unknown inputs give no level', P.assessmentLevel('5', 'recip-1') === null && P.assessmentLevel('1', 'jet') === null && P.assessmentLevel('', '') === null);

// ---- A2 ---------------------------------------------------------------------------------
for (const l of ['1', '2', '3', '4']) if (P.assessmentLevel(l, 'other') !== null) bad.push('other@' + l);
check('A2: hybrid / eVTOL / other is never derived from the table', bad.length === 0, bad.join(','));
let c = {};
let st = P.apply(c, '2', 'other', '');
check('A2: "other" without a manual level sets no class (pending)', !c.part23Class && st.source === 'pending', JSON.stringify(st));
st = P.apply(c, '2', 'other', 'III');
check('A2: "other" with a manual level records it as manual', c.part23Class === 'III' && st.source === 'manual' && /authority/.test(st.note), JSON.stringify(st));
c = {};
P.apply(c, '1', 'recip-1', 'IV');
check('A2: a manual level is ignored when the table decides', c.part23Class === 'I');
P.apply(c, '1', 'other', 'XX');
check('A2: switching to "other" keeps the old level in force but never calls it a manual choice', c.part23Class === 'I' && P.status(c).source === 'pending' && /stays in force/.test(P.status(c).note), JSON.stringify(P.status(c)));
P.apply(c, '1', 'recip-1', '');
check('A2: back on a table row, the manual record is dropped', c.part23Class === 'I' && !('part23ManualLevel' in c) && P.status(c).source === 'table3');

// ---- A3 ---------------------------------------------------------------------------------
c = { part23Class: 'IV' };
st = P.status(c);
check('A3: a class-only project is "legacy", keeps its class', st.source === 'legacy' && st.level === 'IV' && /confirm/.test(st.note));
P.apply(c, '1', '', '');
check('A3: level without propulsion leaves the saved class alone', c.part23Class === 'IV' && c.part23CertLevel === '1');
P.apply(c, '', 'recip-1', '');
check('A3: completing the pick re-derives the class (Level 1, one piston → I)', c.part23Class === 'I' && P.status(c).source === 'table3');
check('A3: status of an empty config asks for both inputs', P.status({}).source === 'none' && P.status(null).source === 'none');

// ---- A4 ---------------------------------------------------------------------------------
const tctx = { console }; vm.createContext(tctx);
vm.runInContext(read('safety_targets.js') + ';globalThis.__T = { PROB_TARGETS, DAL_TARGETS };', tctx);
const { PROB_TARGETS, DAL_TARGETS } = tctx.__T;
const TABLE5_CAT = { I: 1e-6, II: 1e-7, III: 1e-8, IV: 1e-9 }, TABLE5_HAZ = { I: 1e-5, II: 1e-6, III: 1e-7, IV: 1e-7 };
const F3061_P = { I: { Catastrophic: 'C', Hazardous: 'C' }, II: { Catastrophic: 'C', Hazardous: 'C' }, III: { Catastrophic: 'B', Hazardous: 'C' }, IV: { Catastrophic: 'A', Hazardous: 'B' } };
bad = [];
for (const lvl of [1, 2, 3, 4]) for (const col of COLS) {
    const a = P.assessmentLevel(String(lvl), col), row = PROB_TARGETS['Part 23 ' + a], dal = DAL_TARGETS['Part 23 ' + a];
    if (!row || !dal) { bad.push(a + ' missing'); continue; }
    if (row.Catastrophic !== TABLE5_CAT[a] || row.Hazardous !== TABLE5_HAZ[a]) bad.push(a + ' targets');
    if (dal.Catastrophic !== F3061_P[a].Catastrophic || dal.Hazardous !== F3061_P[a].Hazardous) bad.push(a + ' DAL');
}
check('A4: every derived level has a target row (Table 5) and a primary DAL row (F3061 Table 1)', bad.length === 0, bad.join(', '));

// ---- A5 ---------------------------------------------------------------------------------
const html = P.pickerHTML('t', {}, 'onX()');
check('A5: picker asks both questions and has a hidden manual select', /id="t-level"/.test(html) && /id="t-prop"/.test(html) && /id="t-manual"[^>]*display:none/.test(html) && /onchange="onX\(\)"/.test(html));
check('A5: picker lists 4 certification levels and 5 propulsion choices', (html.match(/passenger seats/g) || []).length === 4 && /Hybrid, eVTOL or other/.test(html));
const htmlSaved = P.pickerHTML('t', { part23CertLevel: '3', part23Propulsion: 'turbine-1', part23Class: 'III' });
check('A5: a saved pick is pre-selected', /value="3" selected/.test(htmlSaved) && /value="turbine-1" selected/.test(htmlSaved) && /Assessment Level III from F3230 Table 3/.test(htmlSaved));
check('A5: picker escapes its handler text', !/onchange="[^"]*"[^ >]/.test(P.pickerHTML('t', {}, 'a("b")')));
function fakeDoc(vals) {
    const els = {};
    ['level', 'prop', 'manual', 'note'].forEach(k => els['t-' + k] = { value: vals[k] || '', style: { display: 'none' }, textContent: '' });
    return { getElementById: id => els[id] || null, els };
}
let d = fakeDoc({ level: '2', prop: 'turbine-multi' }); c = {};
st = P.syncPicker('t', c, d);
check('A5: syncPicker writes all three fields', c.part23CertLevel === '2' && c.part23Propulsion === 'turbine-multi' && c.part23Class === 'II' && st.source === 'table3');
check('A5: manual select stays hidden for a table row; note refreshed', d.els['t-manual'].style.display === 'none' && /Assessment Level II/.test(d.els['t-note'].textContent));
d = fakeDoc({ level: '4', prop: 'other', manual: 'IV' }); c = {};
P.syncPicker('t', c, d);
check('A5: "other" shows the manual select and records the manual level', d.els['t-manual'].style.display === '' && c.part23Class === 'IV' && c.part23ManualLevel === 'IV' && P.status(c).source === 'manual');
check('A5: a saved manual level is pre-selected in the manual select', /value="IV" selected>Assessment Level IV/.test(P.pickerHTML('t', c)));

// ---- A6 ---------------------------------------------------------------------------------
const MISC = read('misc_fn_modules.js'), SUP = read('support_modules.js'), HELP = read('helpers_modules.js'), IDX = read('index.html');
const wiz = MISC.slice(MISC.indexOf('function openNewProjectWizard'), MISC.indexOf('async function npwCreate'));
const create = MISC.slice(MISC.indexOf('async function npwCreate'), MISC.indexOf('async function npwCreate') + 4000);
check('A6: wizard uses the Table 3 picker', /SLP23\.pickerHTML\('npw-p23x'/.test(wiz) && /SLP23\.syncPicker\('npw-p23x'/.test(wiz));
check('A6: old weight-based class wording is gone from the wizard and settings', !/single recip ≤6,000 lb/.test(wiz) && !/Single recip, &le; 6,000 lb/.test(IDX) && !/id="proj-part23-class"/.test(IDX));
check('A6: wizard refuses a Part 23 project without a level', /st\.source !== 'table3' && st\.source !== 'manual'/.test(create) && /return;/.test(create.slice(create.indexOf("st.source !== 'table3'"), create.indexOf("st.source !== 'table3'") + 400)));
check('A6: wizard stores level, propulsion and class', /projectConfig\.part23CertLevel = p23cfg\.part23CertLevel/.test(create) && /projectConfig\.part23Propulsion = p23cfg\.part23Propulsion/.test(create) && /projectConfig\.part23Class = p23cfg\.part23Class/.test(create));
check('A6: settings page renders the picker and saves through it', /SLP23\.pickerHTML\('proj-p23', projectConfig/.test(SUP) && /SLP23\.syncPicker\('proj-p23', projectConfig\)/.test(HELP) && /id="proj-part23-host"/.test(IDX));
check('A6: settings page warns on a legacy Part 23 project', /SLP23\.status\(projectConfig\)\.source === 'legacy'/.test(SUP) && /Part 23 needs the certification level and propulsion/.test(SUP));
check('A6: the module is loaded by the page', /<script src="p23_assessment_level\.js\?v=[\d.]+" defer><\/script>/.test(IDX));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

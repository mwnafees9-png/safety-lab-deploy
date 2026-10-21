#!/usr/bin/env node
/*
 * Regression: the Excel import put columns in the wrong fields, and could not read a function
 * tree kept in ONE column (21 Oct 2026).
 *
 * Reported by Radia: "importing from excel is not working... it is just not mapping to the right
 * fields", and "their functions are 3 layers deep and they are all in one column; the numbering is
 * in a different column and is the only thing identifying the different levels".
 *
 * What was wrong, and what this pins:
 *   1. Headings matched on any substring, in either direction, first field wins. After the
 *      full-tree change that same rule sent a plain "Function" or "Sub-Function" heading to the
 *      parent column. Now: exact heading, else whole words, else the alias minus a plural or an
 *      ID; a "parent" heading only fills the parent column; the whole sheet is assigned at once,
 *      best match first, one column per field.
 *   2. A sheet with a numbering column (1, 1.1, 1.1.1) and one name column is read as a tree: the
 *      number sets the level and the parent, to any depth. Re-importing updates, never duplicates.
 *      A number that appears twice (Excel turned 1.10 into 1.1) refuses the sheet with a reason.
 *   3. The tab's own Import Excel button sends the sheet to that tab even when the sheet's name
 *      says nothing (Sheet1), instead of skipping it.
 *   4. A saved mapping template is keyed by the sheet names AND headings, and only fills headings
 *      that exist, so one "Sheet1" template is no longer applied to every other "Sheet1" file.
 *   5. The "Tool field" dropdown shows plain names, not code names.
 *
 * Run: node tests/regression_excel_import_mapping_20261021.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const src = S('importers.js');

let idn = 0;
function load() {
  const ctx = { console, document: { getElementById: () => null, querySelector: () => null }, localStorage: { getItem: () => null, setItem() {} },
    acFunctionsData: [], newRowId: () => 'r' + (++idn), sys: () => null, showToast() {}, slAlert() {}, esc: s => String(s) };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(src + ';this.ExcelImport = ExcelImport;', ctx, { filename: 'importers.js' });
  return ctx;
}
const ctx = load(), I = ctx.ExcelImport._internals;
const map = (kind, hs) => I.detectColumnMap(kind, hs);

console.log('\n[headings] each column lands in the field its heading names');
{
  const m = map('acFunc', ['Function ID', 'Function Name', 'Function Definition', 'Sub-Function ID', 'Sub-Function Name', 'Sub-Function Definition', 'Parent Sub-Function ID']);
  check('the tool\'s own export headings all map', m['Function ID'] === 'funcId' && m['Function Name'] === 'funcName' && m['Function Definition'] === 'funcDef' && m['Sub-Function ID'] === 'subId' && m['Sub-Function Name'] === 'subName' && m['Sub-Function Definition'] === 'subDef' && m['Parent Sub-Function ID'] === 'parentSubId', JSON.stringify(m));
  const p = map('acFunc', ['Function', 'Sub-Function', 'Description']);
  check('a plain "Function" / "Sub-Function" heading is never the parent column', p['Function'] === 'funcId' && p['Sub-Function'] === 'subId' && !Object.values(p).includes('parentSubId'), JSON.stringify(p));
  const pf = map('acFunc', ['Parent Function ID', 'Sub-Function ID']);
  check('a heading that says "parent" only ever fills the parent column', pf['Parent Function ID'] === 'parentSubId' && pf['Sub-Function ID'] === 'subId', JSON.stringify(pf));
  const j = map('acFunc', ['ID', 'Global ID', 'Name', 'Description', 'Item Type', 'Owner Name', 'Modified Date']);
  check('a Jama export: ID, Name and Description map; Global ID, Owner Name, Item Type do not', j['ID'] === 'funcId' && j['Name'] === 'funcName' && j['Description'] === 'funcDef' && !j['Global ID'] && !j['Owner Name'] && !j['Item Type'], JSON.stringify(j));
  const g = map('acFunc', ['Global ID', 'Owner Name']);
  check('"Global ID" alone is not the function ID, "Owner Name" alone is not the function name', !g['Global ID'] && !g['Owner Name'], JSON.stringify(g));
  const f = map('acFha', ['Sub-Function ID', 'FC ID', 'Failure Condition', 'Flight Phases', 'Effect on Aircraft', 'Effect on Crew', 'Effect on Passengers', 'Severity', 'Assumptions, Comments, Supporting Material']);
  check('a full FHA sheet maps every column', f['Sub-Function ID'] === 'subId' && f['FC ID'] === 'fcId' && f['Failure Condition'] === 'fcDesc' && f['Flight Phases'] === 'phases' && f['Effect on Aircraft'] === 'effAc' && f['Effect on Crew'] === 'effCrew' && f['Effect on Passengers'] === 'effPax' && f['Severity'] === 'severity' && f['Assumptions, Comments, Supporting Material'] === 'assumptionIds', JSON.stringify(f));
  const f2 = map('acFha', ['Function', 'Hazard Description and Effect', 'Effect', 'FC#', 'Phase']);
  check('whole words and short forms still work (Hazard Description and Effect, FC#, Phase)', f2['Hazard Description and Effect'] === 'fcDesc' && f2['Effect'] === 'effAc' && f2['FC#'] === 'fcId' && f2['Phase'] === 'phases', JSON.stringify(f2));
  const e = map('acFha', ['Effect on Aircraft', 'Effect']);
  check('"Effect" never falls to "effect on passengers" because another column took the aircraft effect', e['Effect on Aircraft'] === 'effAc' && e['Effect'] !== 'effPax', JSON.stringify(e));
  const best = map('acFha', ['Notes', 'Comments']);
  check('the better heading wins the field, wherever it sits', best['Comments'] === 'comments' && !best['Notes'], JSON.stringify(best));
  const r = map('acReq', ['Req ID', 'Trace ID', 'Level', 'Type', 'Requirement', 'Rationale']);
  check('requirements map as before', r['Req ID'] === 'reqId' && r['Trace ID'] === 'traceId' && r['Requirement'] === 'text' && r['Rationale'] === 'rat', JSON.stringify(r));
  const z = map('zsa', ['Zone', 'Description', 'Installed Equipment', 'Worst Severity', 'Assessed By', 'Date', 'Status']);
  check('zonal safety maps as before', z['Zone'] === 'zoneId' && z['Installed Equipment'] === 'equip' && z['Worst Severity'] === 'severity' && z['Assessed By'] === 'assessedBy', JSON.stringify(z));
  const c = map('acFcim', ['Sub-Function ID', 'Crew Awareness', 'Total Loss', 'Partial Loss', 'Malfunction']);
  check('the FCIM matrix still finds its three pivot columns', c['Total Loss'] === 'pivotTL' && c['Partial Loss'] === 'pivotPL' && c['Malfunction'] === 'pivotM', JSON.stringify(c));
  check('one field per column, one column per field', (() => { const v = Object.values(map('acFunc', ['ID', 'Function ID', 'Name', 'Function Name'])); return new Set(v).size === v.length; })());
}

console.log('\n[tree] one column of names, the numbering sets the level');
function sheetOf(headers, rows, kind) {
  const objs = rows.map(r => { const o = {}; headers.forEach((h, i) => { o[h] = r[i]; }); return o; });
  const sh = { name: 'Sheet1', kind: kind || 'acFunc', headers, headerRow: 0, columnMap: I.detectColumnMap(kind || 'acFunc', headers), rows: objs, rowCount: objs.length };
  sh.outline = I.sniffOutline(sh);
  return sh;
}
const RADIA = [
  ['1', 'Control flight path', 'Keep the aircraft on its intended path'],
  ['1.1', 'Control pitch', 'Pitch attitude'],
  ['1.1.1', 'Command elevator', 'Move the elevator'],
  ['1.1.2', 'Trim pitch', 'Hold trim'],
  ['1.2', 'Control roll', 'Roll attitude'],
  ['1.2.1', 'Command ailerons', 'Move the ailerons'],
  ['2', 'Provide thrust', 'Generate thrust'],
  ['2.1', 'Control engine power', 'Throttle'],
  ['3', 'Provide cabin pressure', 'Nothing under it yet'],
];
for (const [label, headers] of [['"No." + "Function"', ['No.', 'Function', 'Description']], ['"ID" + "Name" (Jama style)', ['ID', 'Name', 'Description']], ['"WBS" + "Function Name"', ['WBS', 'Function Name', 'Function Description']]]) {
  const sh = sheetOf(headers, RADIA);
  const vals = Object.values(sh.columnMap);
  check(label + ': the numbering column is found and the tree is read', vals.includes('outline') && vals.includes('funcName') && sh.outline && sh.outline.levels === 3 && sh.outline.functions === 3, JSON.stringify({ m: sh.columnMap, o: sh.outline }));
}
{
  const sh = sheetOf(['No.', 'Function', 'Description'], RADIA);
  ctx.acFunctionsData.length = 0;
  const rep = { warnings: [], errors: [] };
  const n = I.importInto(sh, rep);
  const rows = ctx.acFunctionsData, by = id => rows.find(r => r.subId === id);
  check('every row imports: 6 sub-function rows plus one function-only row', n === 7 && rows.length === 7, n + ' / ' + rows.length + ' ' + JSON.stringify(rep));
  check('level 2 sits directly under its function', by('1.1').funcId === '1' && by('1.1').funcName === 'Control flight path' && !by('1.1').parentSubId && by('1.1').subName === 'Control pitch');
  check('level 3 sits under its level 2 row', by('1.1.1').parentSubId === '1.1' && by('1.1.2').parentSubId === '1.1' && by('1.2.1').parentSubId === '1.2');
  check('descriptions come in at every level', by('1.1.1').subDef === 'Move the elevator' && by('1.1').funcDef === 'Keep the aircraft on its intended path');
  const only = rows.find(r => r.funcId === '3');
  check('a function with nothing under it gets its function-only row', only && only.subId === '' && only.funcName === 'Provide cabin pressure');
  check('no function gets a stray function-only row when it has rows under it', rows.filter(r => r.funcId === '1' && !r.subId).length === 0);
  const FT = require('../site/func_tree.js');
  check('the result is a valid tree: function, then two levels of sub-functions, no broken links', FT.problems(rows).length === 0 && FT.depth(by('1.1'), FT.index(rows)) === 1 && FT.depth(by('1.1.1'), FT.index(rows)) === 2, JSON.stringify(FT.problems(rows)));
  // re-import with a rename: updated, not duplicated
  const RADIA2 = RADIA.map(r => r.slice()); RADIA2[2][1] = 'Command elevator (renamed)'; RADIA2.push(['2.1.1', 'Schedule fuel', 'New row']);
  const n2 = I.importInto(sheetOf(['No.', 'Function', 'Description'], RADIA2), { warnings: [], errors: [] });
  check('importing again updates the rows it made and adds only what is new', rows.length === 8 && by('1.1.1').subName === 'Command elevator (renamed)' && by('2.1.1').parentSubId === '2.1' && n2 === 8, rows.length + ' rows, ' + n2);
}
{
  ctx.acFunctionsData.length = 0;
  const rep = { warnings: [], errors: [] };
  const n = I.importInto(sheetOf(['No.', 'Function'], [['1', 'A'], ['1.1', 'B'], ['1.1', 'C (was 1.10)'], ['1.2', 'D']]), rep);
  check('a number that appears twice refuses the sheet, says why, writes nothing', n === 0 && ctx.acFunctionsData.length === 0 && rep.errors.length === 1 && /appears more than once/.test(rep.errors[0]) && /Format the numbering column as Text/.test(rep.errors[0]), JSON.stringify(rep));
  const rep2 = { warnings: [], errors: [] };
  I.importInto(sheetOf(['No.', 'Function'], [['1', 'A'], ['1.1.1', 'skipped a level'], ['x?', 'no number'], ['1.2', 'B'], ['1.3', 'C'], ['2', 'D'], ['2.1', 'E']]), rep2);
  const r = ctx.acFunctionsData.find(x => x.subId === '1.1.1');
  check('a missing middle number: placed under the nearest number that exists, and reported', r && r.funcId === '1' && !r.parentSubId && rep2.warnings.some(w => /no row for 1\.1/.test(w)), JSON.stringify(rep2));
  check('a row with no readable number is skipped and reported with its spreadsheet row', rep2.warnings.some(w => /no number Safety Lab can read/.test(w) && /row 4/.test(w)), JSON.stringify(rep2.warnings));
  check('prefixed numbers read too (AF-1.2.3)', I.outlineParts('AF-1.2.3').key === 'AF-1.2.3' && I.outlineParts('AF-1.2.3').depth === 3 && I.outlineParts('1.2.').key === '1.2' && !I.outlineParts('Control pitch'));
  const two = sheetOf(['Function ID', 'Function Name', 'Sub-Function ID', 'Sub-Function Name'], [['1', 'A', '1.1', 'B'], ['', '', '1.2', 'C']]);
  check('a sheet that already has sub-function columns is NOT switched to numbering mode', !two.outline && !Object.values(two.columnMap).includes('outline'));
  const flat = sheetOf(['ID', 'Name'], [['AF-001', 'A'], ['AF-002', 'B']]);
  check('a flat list of IDs (one level) stays a flat list', !flat.outline);
}

console.log('\n[wiring] the tab, the template, the dropdown');
const DO = S('data_ops_modules.js');
check('each tab tells the importer which tab it is', /ExcelImport\.setPreferredKind\(kind\)/.test(DO) && /AC_Functions: 'acFunc'/.test(DO));
check('tabs the mapping importer cannot fill keep their own importer', /if \(kind && mapInput/.test(DO) && !/Flight_Phases: '/.test(DO));
check('an unnamed sheet goes to the tab the import came from', /if \(kind === 'ignore' && _preferredKind/.test(src) && /_preferredKind = null;   \/\/ one import only/.test(src));
check('the template is keyed by sheet names AND headings', /plan\.fingerprint = plan\.sheets\.map\(s => normName\(s\.name\) \+ ':' \+ s\.headers/.test(src));
check('a template only fills headings that exist in this file', /if \(s\.headers\.indexOf\(h\) >= 0\) cm\[h\] = tplSheet\.columnMap\[h\]/.test(src));
check('the dropdown shows plain names', I.fieldLabel('funcId') === 'Function ID' && I.fieldLabel('subDef') === 'Sub-function description' && /esc\(_fieldLabel\(f, sheet\)\)/.test(src));
check('picking a field for one column takes it off any other column', /if \(h !== header && sheet\.columnMap\[h\] === field\) delete sheet\.columnMap\[h\]/.test(src));
check('no em dashes in what this change added', [src.slice(src.indexOf('// Match column headings to fields (rebuilt'), src.indexOf('// Parser')), src.slice(src.indexOf('// ---- functions from ONE column'), src.indexOf('function runImport()'))].every(t => t.indexOf(String.fromCharCode(0x2014)) < 0));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

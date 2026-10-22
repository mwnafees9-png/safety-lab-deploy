#!/usr/bin/env node
/*
 * Regression: three-level aircraft functions, lowest-tier AI, mass actions on Functions and FCIM
 * (22 Oct 2026).
 *
 * Waqas's rulings (22 Oct 2026, on the customer call):
 *   1. "a third sub-sub function ID and sub-sub function name and definitions column same columns
 *      as what we currently have for functions and sub functions". Only for that customer ("this is
 *      only for radia"), switched on by their license (the same feature as their AFHA layout), and
 *      "radia only wants 3 at the aircraft level": a 4th level is refused by name, never hidden,
 *      in the form, the Excel and CSV imports and the live Jama bridge. Everyone else keeps today's
 *      table and any depth.
 *   2. "the AI will now be evaluating the lowest tiered functions", for everyone: failure
 *      conditions are drafted for the bottom of each branch; the levels above are context (the
 *      path). The FCIM and FHA pickers offer only the bottom of each branch.
 *   3. "a mass actions on the functions and FCIM page is not there": tick rows and delete them,
 *      bottom up for functions, refusing a row that still has rows under it.
 *   Also: the customer's numbering heading "code" is read as the numbering, and a "parent" column
 *   beside a numbering column no longer stops the numbering from deciding the levels.
 *
 * Run: node tests/regression_three_level_functions_20261022.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const FT = require('../site/func_tree.js');
const JT = require('../site/jama_tree.js');

// the customer's tree, as on the call (codes 1 .. 2.3.4), plus a 4th level that must be refused
const TREE = [
  ['1', 'Provide Aerodynamic Performance'], ['1.1', 'Provide Lift Capability and Control'], ['1.1.1', 'Provide Lift Capability'],
  ['1.1.2', 'Provide High-Lift Control'], ['2', 'Control Aircraft Trajectory & Velocity'], ['2.1', 'Provide Aerodynamic Stability and Control'],
  ['2.1.1', 'Provide Stability & Control Augmentation'], ['2.2', 'Provide Ground Directional Control'], ['3', 'Manage Aircraft Energy'],
];
function rowsOf(list) {   // as the outline import writes them
  const out = []; let n = 0;
  const top = {}; list.forEach(([k, name]) => { if (!/\./.test(k)) top[k] = name; });
  list.forEach(([k, name]) => {
    const segs = k.split('.');
    if (segs.length === 1) { if (!list.some(([k2]) => k2.indexOf(k + '.') === 0)) out.push({ internalId: 'r' + (++n), funcId: k, funcName: name, funcDef: '', subId: '', subName: '', subDef: '' }); return; }
    const r = { internalId: 'r' + (++n), funcId: segs[0], funcName: top[segs[0]], funcDef: '', subId: k, subName: name, subDef: '' };
    if (segs.length > 2) r.parentSubId = segs.slice(0, -1).join('.');
    out.push(r);
  });
  return out;
}

(async function main() {
  // --------------------------------------------------------------- func_tree
  console.log('\n[func_tree] the bottom of each branch, and the level limit');
  {
    const rows = rowsOf(TREE), ix = FT.index(rows);
    const leaves = FT.leaves(rows).map(r => r.subId || r.funcId);
    check('leaves are the bottom of each branch, any level (1.1.1, 1.1.2, 2.1.1, 2.2, and function 3 with nothing under it)',
      JSON.stringify(leaves) === JSON.stringify(['1.1.1', '1.1.2', '2.1.1', '2.2', '3']), JSON.stringify(leaves));
    check('a sub-function with sub-sub-functions under it is not a leaf', !FT.isLeaf(rows.find(r => r.subId === '1.1'), ix));
    FT.setLevelLimit(null);
    check('no limit by default: a 4th level is allowed for everyone else', FT.levelLimit() === 0 &&
      FT.check({ internalId: 'x', funcId: '1', subId: '1.1.1.1', parentSubId: '1.1.1' }, rows) === '');
    FT.setLevelLimit(() => 3);
    const why = FT.check({ internalId: 'x', funcId: '1', subId: '1.1.1.1', parentSubId: '1.1.1' }, rows);
    check('with the 3-level limit, a 4th level is refused by name, in plain words', /1\.1\.1\.1 would be a level 4 function/.test(why) && /3 levels deep \(Function > Sub-function > Sub-sub-function\)/.test(why), why);
    check('a 3rd level is fine', FT.check({ internalId: 'x', funcId: '1', subId: '1.1.3', parentSubId: '1.1' }, rows) === '');
    const mv = FT.check(Object.assign({}, rows.find(r => r.subId === '1.1'), { parentSubId: '1.2' }), rows.concat([{ internalId: 'z', funcId: '1', subId: '1.2', subName: 'x' }]));
    check('moving a sub-function that has rows under it below another one is refused (its rows would reach level 4)', /would reach level 4/.test(mv), mv);
    const deep = rows.concat([{ internalId: 'd', funcId: '1', subId: '1.1.1.1', subName: 'too deep', parentSubId: '1.1.1' }]);
    check('tooDeep lists the 4th-level row', FT.tooDeep(deep).map(x => x.row.subId).join() === '1.1.1.1');
    const before = new Set(rows);
    const gone = FT.dropTooDeep(deep, r => !before.has(r));
    check('dropTooDeep takes back only the rows an import added, and says which', gone.join() === '1.1.1.1' && deep.length === rows.length && /1 row was not imported/.test(FT.refusedText(gone)));
    const v3 = FT.threeLevel(rows.find(r => r.subId === '1.1.2'), ix), v2 = FT.threeLevel(rows.find(r => r.subId === '2.2'), ix);
    check('a level 3 row shows as Sub-sub-function, with its parent in the Sub-function columns',
      v3.subId === '1.1' && v3.subName === 'Provide Lift Capability and Control' && v3.subSubId === '1.1.2' && v3.subSubName === 'Provide High-Lift Control');
    check('a level 2 row shows as the Sub-function, Sub-sub columns empty', v2.subId === '2.2' && v2.subSubId === '');
    const back = FT.fromThreeLevel({ funcId: '1', subId: '1.1', subName: 'P', subSubId: '1.1.2', subSubName: 'C', subSubDef: 'd' });
    check('an imported 3-level line becomes the sub-sub-function node under its sub-function', back.subId === '1.1.2' && back.parentSubId === '1.1' && back.subName === 'C' && back.subDef === 'd' && !('subSubId' in back));
    FT.setLevelLimit(null);
  }

  // --------------------------------------------------------------- the license switch
  console.log('\n[layout] only the customer whose license carries the feature gets three levels');
  {
    const src = read('site/afha_template.js');
    check('the limit comes from the same license feature as their AFHA layout', /FUNCTION_LEVELS = 3/.test(src) &&
      /setLevelLimit\(function \(\) \{ return active\(\) \? C\.FUNCTION_LEVELS : 0; \}\)/.test(src) && /FEATURE = 'afha-customer-template'/.test(src));
    check('the function table redraws when the layout switches on (license read after the first draw)', /_lastLevels/.test(src) && /W\.renderACFunctions\(\)/.test(src));
  }

  // --------------------------------------------------------------- the table
  console.log('\n[table] three column sets, each merged over the rows under it');
  {
    const src = read('site/data_ops_modules.js');
    const a = src.indexOf('function _acFuncHeadSync'), b = src.indexOf('// E1 ', a);
    const code = src.slice(a, b);
    const ctx = { SLFuncTree: FT, esc: s => String(s == null ? '' : s), document: undefined, console };
    const rows = rowsOf(TREE);
    ctx.acFunctionsData = rows;
    vm.createContext(ctx); vm.runInContext(code + ';this._r = _acFuncRenderRows;', ctx);
    const cx = { actionsFor: id => '[A' + id + ']', reviewFor: id => '[R' + id + ']' };
    FT.setLevelLimit(null);
    const std = ctx._r(rows, cx);
    check('without the layout the table is unchanged (no sub-sub columns, deeper rows indented under their parent)', !/slab-sub-id/.test(std) && /under 1\.1/.test(std));
    FT.setLevelLimit(() => 3);
    const html = ctx._r(rows, cx);
    const trs = html.split('<tr').slice(1);
    check('one table row per record, each with its own Actions and Review', trs.length === rows.length && rows.every(r => html.indexOf('[A' + r.internalId + ']') >= 0 && html.indexOf('[R' + r.internalId + ']') >= 0));
    const t11 = trs.find(t => />Provide Lift Capability and Control</.test(t));   // 1.1, with 1.1.1 and 1.1.2 under it
    check('a sub-function with sub-sub-functions under it is merged over them (rowspan 3)', /rowspan="3" class="slab-sub-id slab-merged-cell"><strong>1\.1<\/strong>/.test(t11), t11);
    const t112 = trs.find(t => />Provide High-Lift Control</.test(t));
    check('a sub-sub-function line fills only the Sub-sub columns (its sub-function is the merged cell above)', /<td><strong>1\.1\.2<\/strong><\/td><td>Provide High-Lift Control<\/td>/.test(t112) && !/slab-sub-id/.test(t112));
    const t22 = trs.find(t => /Provide Ground Directional Control/.test(t));
    check('a sub-function with nothing under it: Sub-function columns filled, Sub-sub columns empty', /slab-sub-id"><strong>2\.2<\/strong>/.test(t22) && /<td><\/td><td><\/td><td><\/td>\[R/.test(t22));
    const t3 = trs.find(t => /Manage Aircraft Energy/.test(t));
    check('a function with nothing under it: both sub column sets empty', (t3.match(/<td><\/td>/g) || []).length === 6);
    const tf = trs.find(t => /slab-func-id/.test(t) && /<strong>2<\/strong>/.test(t));
    check('the function is merged over every row of its function (function 2 over its 3 rows: 2.1, 2.1.1, 2.2)', /<td rowspan="3" class="slab-func-id slab-merged-cell"><strong>2<\/strong>/.test(tf), tf);
    const deep = rows.concat([{ internalId: 'd', funcId: '1', subId: '1.1.1.1', subName: 'too deep', parentSubId: '1.1.1' }]);
    ctx.acFunctionsData = deep;
    const h2 = ctx._r(deep, cx);
    check('a row that is somehow below level 3 (older data) is shown, with the reason, never hidden', /1\.1\.1\.1/.test(h2) && /would be a level 4 function/.test(h2));
    // the header
    check('the header gains exactly three Sub-Sub columns in the layout, and loses them without it',
      /\['Sub-Sub-Function ID', 'Sub-Sub-Function', 'Sub-Sub-Definition'\]/.test(code) && /th\.slab-func-l3/.test(code) && /if \(!three\) \{ Array\.prototype\.forEach\.call\(have, th => th\.remove\(\)\)/.test(code));
    // the export
    const e1 = src.indexOf('function _acFuncExportTable'), e2 = src.indexOf('// Dispatch table', e1);
    const ectx = { SLFuncTree: FT, acFunctionsData: rows }; vm.createContext(ectx); vm.runInContext(src.slice(e1, e2) + ';this._e = _acFuncExportTable;', ectx);
    const ex = ectx._e();
    check('the export in the layout: the nine columns, a sub-sub line repeating its sub-function',
      ex.headers.length === 9 && ex.headers[6] === 'Sub-Sub-Function ID' && JSON.stringify(ex.rows.find(r => r[6] === '1.1.2')) === JSON.stringify(['1', 'Provide Aerodynamic Performance', '', '1.1', 'Provide Lift Capability and Control', '', '1.1.2', 'Provide High-Lift Control', '']));
    FT.setLevelLimit(null);
    check('the export without the layout is unchanged (parent column)', ectx._e().headers.join('|') === 'Function ID|Aircraft Function|Definition|Sub-Function ID|Sub-Function|Sub-Definition|Parent Sub-Function ID');
  }

  // --------------------------------------------------------------- the Excel import
  console.log('\n[excel] the customer sheet, the 4th level, and the 3-level export coming back');
  {
    let idn = 0;
    const ctx = { console, document: { getElementById: () => null, querySelector: () => null }, localStorage: { getItem: () => null, setItem() {} },
      acFunctionsData: [], newRowId: () => 'n' + (++idn), sys: () => null, showToast() {}, slAlert() {}, esc: s => String(s), SLFuncTree: FT };
    ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(read('site/importers.js') + ';this.ExcelImport = ExcelImport;', ctx, { filename: 'importers.js' });
    const I = ctx.ExcelImport._internals;
    const heads = ['code', 'level', 'title', 'parent_code', 'path', 'mechanisms'];
    const m = I.detectColumnMap('acFunc', heads);
    check('"code" is read as the numbering column', m.code === 'outline' && m.title === 'funcName', JSON.stringify(m));
    const data = TREE.concat([['1.1.1.1', 'A fourth level']]).map(([k, n]) => ({ code: k, level: k.split('.').length, title: n, parent_code: k.split('.').slice(0, -1).join('.'), path: '', mechanisms: '' }));
    const sheet = { name: 'aircraft_functions', kind: 'acFunc', headers: heads, rows: data, headerRow: 0, columnMap: Object.assign({}, m) };
    const sum = I.sniffOutline(sheet);
    check('a parent column beside the numbering no longer stops the numbering from deciding the levels', !!sum && sum.levels === 4 && !Object.values(sheet.columnMap).includes('parentSubId'), JSON.stringify(sheet.columnMap));
    FT.setLevelLimit(() => 3);
    const report = { warnings: [], errors: [] };
    I.importInto(sheet, report);
    const rows = ctx.acFunctionsData;
    check('with the 3-level limit, the 4th level is not imported, and the note names it',
      !rows.some(r => r.subId === '1.1.1.1') && report.warnings.some(w => /1\.1\.1\.1/.test(w) && /not imported/.test(w) && /3 levels deep/.test(w)), JSON.stringify(report.warnings));
    check('everything else came in as the tree: 1.1.2 under 1.1 under function 1', rows.some(r => r.subId === '1.1.2' && r.parentSubId === '1.1' && r.funcId === '1'));
    FT.setLevelLimit(null);
    const ctx2 = { console, document: { getElementById: () => null, querySelector: () => null }, localStorage: { getItem: () => null, setItem() {} },
      acFunctionsData: [], newRowId: () => 'm' + (++idn), sys: () => null, showToast() {}, slAlert() {}, esc: s => String(s), SLFuncTree: FT };
    ctx2.window = ctx2; vm.createContext(ctx2);
    vm.runInContext(read('site/importers.js') + ';this.ExcelImport = ExcelImport;', ctx2, { filename: 'importers.js' });
    const I2 = ctx2.ExcelImport._internals;
    const h9 = ['Function ID', 'Aircraft Function', 'Definition', 'Sub-Function ID', 'Sub-Function', 'Sub-Definition', 'Sub-Sub-Function ID', 'Sub-Sub-Function', 'Sub-Sub-Definition'];
    const m9 = I2.detectColumnMap('acFunc', h9);
    check('the 3-level export maps column for column (names included, not only IDs)',
      m9['Aircraft Function'] === 'funcName' && m9['Sub-Function'] === 'subName' && m9['Sub-Definition'] === 'subDef' && m9['Sub-Sub-Function ID'] === 'subSubId' && m9['Sub-Sub-Function'] === 'subSubName' && m9['Sub-Sub-Definition'] === 'subSubDef', JSON.stringify(m9));
    const m7 = I2.detectColumnMap('acFunc', ['Function ID', 'Aircraft Function', 'Definition', 'Sub-Function ID', 'Sub-Function', 'Sub-Definition', 'Parent Sub-Function ID']);
    check('the standard export maps column for column too', m7['Aircraft Function'] === 'funcName' && m7['Sub-Function'] === 'subName' && m7['Sub-Function ID'] === 'subId' && m7['Parent Sub-Function ID'] === 'parentSubId', JSON.stringify(m7));
    const pm = I2.detectColumnMap('acFunc', ['Function', 'Sub-Function', 'Description']);
    check('a plain "Function" / "Sub-Function" heading on its own is still the ID (21 Oct ruling)', pm['Function'] === 'funcId' && pm['Sub-Function'] === 'subId', JSON.stringify(pm));
    const lines = [['1', 'Fly', '', '1.1', 'Lift', '', '', '', ''], ['1', 'Fly', '', '1.1', 'Lift', '', '1.1.2', 'High-Lift', 'flaps']].map(a => { const o = {}; h9.forEach((h, i) => { o[h] = a[i]; }); return o; });
    I2.importInto({ name: 'AC_Functions', kind: 'acFunc', headers: h9, rows: lines, headerRow: 0, columnMap: m9 }, { warnings: [], errors: [] });
    const got = ctx2.acFunctionsData;
    check('the 3-level export imports back: the sub-function line, and the sub-sub line as a node under it',
      got.length === 2 && got[0].subId === '1.1' && got[1].subId === '1.1.2' && got[1].parentSubId === '1.1' && got[1].subName === 'High-Lift' && got[1].subDef === 'flaps', JSON.stringify(got));
    const src = read('site/importers.js');
    check('the import dialog warns before import when the numbering goes below the limit', /Numbers below level ' \+ SLFuncTree\.levelLimit\(\) \+ ' will not be imported/.test(src));
    check('runImport takes back any imported function row below the limit (every import path)', /SLFuncTree\.dropTooDeep\(acFunctionsData, r => !_fnBefore\.has\(r\)\)/.test(src));
    const csv = read('site/data_ops_modules.js');
    check('the CSV import reads the Sub-Sub-Function columns and applies the limit', /getValue\(row, \['Sub-Sub-Function ID'\]\)/.test(csv) && /SLFuncTree\.fromThreeLevel\(_fr\)/.test(csv) && /SLFuncTree\.dropTooDeep\(acFunctionsData, r => !_fnBefore\.has\(r\)\)/.test(csv));
  }

  // --------------------------------------------------------------- Jama
  console.log('\n[jama] the live bridge never stages a row below the limit, and names it');
  {
    const items = [
      { id: 1, key: 'F-1', name: 'Fly', text: '', type: 10 }, { id: 2, key: 'F-2', name: 'Lift', text: '', type: 10 },
      { id: 3, key: 'F-3', name: 'High-lift', text: '', type: 10 }, { id: 4, key: 'F-4', name: 'Flap drive', text: '', type: 10 },
    ];
    const par = new Map([[1, null], [2, 1], [3, 2], [4, 3]]);
    const tree = JT.buildTree(items, [10], par);
    const d0 = JT.diffFunctions(tree, []);
    check('without a limit, all four levels are staged', d0.fresh.length === 3 && (d0.tooDeep || []).length === 0);
    const d3 = JT.diffFunctions(tree, [], { levelLimit: 3 });
    check('with the 3-level limit, the 4th-level item is not staged and is listed', d3.fresh.length === 2 && d3.tooDeep.length === 1 && d3.tooDeep[0].item.key === 'F-4' && d3.tooDeep[0].level === 4);
    const lb = read('site/live_bridge.js');
    check('the bridge passes the project limit and puts the refusal in the review', /T\.diffFunctions\(tree, .*\{ levelLimit: _lim \}\);/.test(lb) && /refusedText\(d\.fn\.tooDeep\.map\(x => x\.item\.key\), 'brought in'\)/.test(lb));
  }

  // --------------------------------------------------------------- the form
  console.log('\n[form] the "Sits under" picker only offers parents that keep the row inside the limit');
  {
    const src = read('site/bindings_modules.js');
    check('parents deeper than the limit allows are not offered (with three levels, only sub-functions)', /const maxParentDepth = lim \? lim - 2 - below : Infinity;/.test(src) && /if \(p\.depth > maxParentDepth\) return;/.test(src));
    check('the entry fields say Sub-Sub-Function when a sub-function is picked, in the layout only', /Aircraft Sub-Sub-Function ID/.test(src) && /SLFuncTree\.levelLimit\(\) === 3/.test(src) && /lab\.dataset\.slStd/.test(src));
    check('the save itself refuses a 4th level (the form validates through func_tree check)', /validate: \(data\) => \(typeof SLFuncTree !== 'undefined' \? SLFuncTree\.check\(data, acFunctionsData\)/.test(read('site/safety_lab.js')));
  }

  // --------------------------------------------------------------- the AI
  console.log('\n[ai] failure conditions are drafted for the bottom of each branch, for everyone');
  {
    const src = read('site/ai_assistant.js');
    const uses = (src.match(/_leafFunctions\(s\)|_leafUnits\(\)/g) || []).length;
    check('FHA gaps, FCIM gaps, both scope pickers, the functional FMEA and the coverage check all use the bottom of each branch', uses >= 6, uses + ' uses');
    check('no drafting picker is built from every function row any more', !/const _fns = \(snapshot\(\)\.acFunctionsData \|\| \[\]\)\.filter\(function \(f\) \{ return f && f\.subId; \}\);/.test(src));
    check('every unit carries its full path from the aircraft function down (the levels above are context)', /if \(p && p\.indexOf\(' > '\) > 0\) obj\.path = p;/.test(src) && /Object\.assign\(\{\}, f\)/.test(src));
    const h = read('site/helpers_modules.js'), sm = read('site/support_modules.js');
    check('the FCIM and FHA pickers: the whole tree is shown, only the bottom of each branch can be picked',
      /populateFuncDropdown\('ac-fcim-subfunc', \{ leavesOnly: true \}\)/.test(sm) && /populateFuncDropdown\('ac-fha-subfunc', \{ leavesOnly: true \}\)/.test(sm) && /disabled data-sl-branch="1"/.test(h));
    check('a row linked before to a function that now has functions under it keeps its value on edit', /linked before; pick the lowest level/.test(h));
  }

  // --------------------------------------------------------------- mass actions
  console.log('\n[mass actions] tick rows on Functions and FCIM and delete them');
  {
    const rows = rowsOf(TREE);
    global.acFunctionsData = rows; global.acFcimData = [{ internalId: 'c1', subId: '1.1.1' }]; global.SLFuncTree = FT;
    delete require.cache[require.resolve('../site/mass_actions.js')];
    const MA = require('../site/mass_actions.js');
    const fn = MA.TARGETS.find(t => t.key === 'acFunc'), fc = MA.TARGETS.find(t => t.key === 'acFcim');
    check('Functions and FCIM are mass-action targets on their own tables', fn && fn.tbodyId === 'ac-func-body' && fn.deleteFn === 'deleteACFunction' && fc && fc.tbodyId === 'ac-fcim-body' && fc.deleteFn === 'deleteACFCIM');
    const r11 = rows.find(r => r.subId === '1.1');
    check('a function row with rows still under it is refused by name', /1\.1 still has 2 functions under it \(1\.1\.1, 1\.1\.2\)/.test(fn.guardDelete(r11) || ''), fn.guardDelete(r11));
    check('a leaf passes', fn.guardDelete(rows.find(r => r.subId === '1.1.2')) === null);
    const id = sub => rows.find(r => r.subId === sub).internalId;
    const ord = fn.order([id('1.1'), id('1.1.1'), id('1.1.2')]);
    check('the batch deletes bottom up, so a branch ticked whole deletes cleanly (1.1 last)', ord[2] === id('1.1'), JSON.stringify(ord));
    delete global.acFunctionsData; delete global.acFcimData; delete global.SLFuncTree;
  }

  // --------------------------------------------------------------- wiring
  console.log('\n[wiring] cache keys');
  {
    const idx = read('site/index.html');
    check('every changed file has a bumped cache key', ['func_tree.js?v=1.1', 'data_ops_modules.js?v=66.59', 'importers.js?v=1.12', 'jama_tree.js?v=1.1', 'live_bridge.js?v=2.2',
      'bindings_modules.js?v=1.58', 'helpers_modules.js?v=3.36', 'support_modules.js?v=66.47', 'mass_actions.js?v=0.9', 'afha_template.js?v=1.1', 'ai_loader.js?v=8.77'].every(k => idx.indexOf(k) >= 0)
      && /ai_assistant\.js\?v=76\.85/.test(read('site/ai_loader.js')));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

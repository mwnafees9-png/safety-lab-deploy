#!/usr/bin/env node
/*
 * Regression: live Jama tracking of aircraft functions, full tree (21 Oct 2026).
 *
 * Waqas's rulings (21 Oct 2026): track a customer's aircraft functions live from Jama, the same
 * review-then-sign way requirements are tracked; hold the whole decomposition to any depth
 * (func_tree.js); allow an administrator-approved internal Jama host on server installs only.
 *
 * What v1 of the bridge did wrong, and what this test pins:
 *   1. Every item in the project, folders and functions included, was filed as a requirement.
 *      Now item types decide: functions go to acFunctionsData, requirements to acReqData,
 *      nothing is read until types are chosen.
 *   2. It stopped at 10 pages of 50. A real program is thousands of items.
 *   3. It had no idea of hierarchy. Functions now nest to any depth, folders looked through.
 *   4. Identity is Jama's item id: a rename, a move or a key change is never "new".
 *   5. Missing in Jama is flagged, never deleted. Nothing changes without a signature.
 *   6. Host guards on all three doors: the server proxy allows ONLY hosts its administrator
 *      listed, and only on an offline-licensed (customer) server; hosted and browser-only stay
 *      public-host only.
 *
 * Run: node tests/regression_jama_live_functions_20261021.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const rig = require('./fixtures/jama_functions_rig.js');
const FT = require('../site/func_tree.js');
const JT = require('../site/jama_tree.js');

(async function main() {
  // ------------------------------------------------------------------ func_tree
  console.log('\n[func_tree] the store holds a tree to any depth');
  {
    const rows = [
      { internalId: 'a', funcId: 'F1', funcName: 'Fly', subId: 'S1', subName: 'Pitch' },
      { internalId: 'b', funcId: 'F1', funcName: 'Fly', subId: 'S1.1', subName: 'Elevator', parentSubId: 'S1' },
      { internalId: 'c', funcId: 'F1', funcName: 'Fly', subId: 'S1.1.1', subName: 'Authority', parentSubId: 'S1.1' },
      { internalId: 'd', funcId: 'F1', funcName: 'Fly', subId: 'S2', subName: 'Roll' },
      { internalId: 'e', funcId: 'F2', funcName: 'Stop', subId: 'T1', subName: 'Brake' },
    ];
    const ix = FT.index(rows);
    check('depth is computed from the parent chain', FT.depth(rows[0], ix) === 1 && FT.depth(rows[2], ix) === 3);
    check('tree order puts each node before its children', FT.ordered(rows).map(r => r.subId).join() === 'S1,S1.1,S1.1.1,S2,T1');
    check('path text reads top function to node', FT.pathText(rows[2], ix) === 'Fly > Pitch > Elevator > Authority');
    check('descendants walks every level', FT.descendants('S1', ix).length === 2);
    check('picker list is indented by depth', FT.pickList(rows)[2].depth === 3 && /↳/.test(FT.pickList(rows)[2].label));
    check('a valid parent passes', FT.check(rows[2], rows) === '');
    check('self-parent refused', /itself/.test(FT.check(Object.assign({}, rows[0], { parentSubId: 'S1' }), rows)));
    check('missing parent refused', /does not exist/.test(FT.check(Object.assign({}, rows[0], { parentSubId: 'NOPE' }), rows)));
    check('parent in another function refused', /same function/.test(FT.check(Object.assign({}, rows[4], { parentSubId: 'S1' }), rows)));
    check('a loop refused', /loop/.test(FT.check(Object.assign({}, rows[0], { parentSubId: 'S1.1.1' }), rows)));
    check('old two-level rows mean "directly under the function"', FT.problems(rows).length === 0 && FT.parentOf(rows[3], ix) === null);
    const bad = rows.concat([{ internalId: 'z', funcId: 'F1', subId: 'X', parentSubId: 'GONE' }]);
    check('a broken link is reported, never thrown', FT.problems(bad).length === 1 && FT.ordered(bad).length === bad.length);
  }

  // ------------------------------------------------------------------ jama_tree, pure
  console.log('\n[jama_tree] mapping, identity, review, sign');
  const snap1 = rig.snapshot1();
  let current = snap1;
  const srv = rig.server(() => current);
  const fetchItem = async id => { const r = await srv.get('https://radia.jamacloud.com/rest/latest/items/' + id); return r.ok ? r.data : null; };
  const fnTypes = [rig.FN];
  const norm = items => items.map(JT.normalizeItem).filter(Boolean);
  const fnCount = snap1.filter(i => i.itemType === rig.FN).length;
  async function stage(raw, rows) {
    const items = norm(raw).filter(n => n.type === rig.FN);
    const res = await JT.resolveFunctionParents(items, fnTypes, fetchItem);
    const tree = JT.buildTree(items, fnTypes, res.parentOf);
    return { tree, res, diff: JT.diffFunctions(tree, rows) };
  }
  check('rich text comes in as plain text', JT.plain('<p>A &amp; B<br>C</p>') === 'A & B\nC');
  check('a broken payload item degrades, never throws', JT.normalizeItem({ id: 5 }).key === 'JAMA-5' && JT.normalizeItem(null) === null);

  const rows = [];
  const s1 = await stage(snap1, rows);
  check('the rig is deep and large (past the old 500 item cap)', fnCount > 500, String(fnCount));
  check('five deep trees plus one childless top', s1.tree.tops.length === 6);
  check('a function in a folder inside a function is looked through',
    s1.tree.byId.get(s1.tree.parentId.get(rig.byKey(snap1, 'RAD-F-1.1.4').id)).key === 'RAD-F-1.1');
  check('only the two folders were looked up, not one call per function', s1.res.lookups === 2 && srv.log.some(u => /items\/950$/.test(u)), String(s1.res.lookups));
  check('first check: every function is new', s1.diff.fresh.length === fnCount - 5 && JT.pending(s1.diff) === fnCount - 5);
  check('unsigned apply refused, nothing written', JT.applyFunctions(s1.diff, rows, { signedBy: '  ' }).ok === false && rows.length === 0);
  let n = 0; const newId = () => 'id' + (++n);
  const a1 = JT.applyFunctions(s1.diff, rows, { signedBy: 'B. Ciocca', at: '2026-10-21T10:00:00Z', newId });
  check('signed apply writes one row per node plus the function-only row', a1.ok && a1.added === fnCount - 5 && rows.length === fnCount - 5);
  const rk = k => rows.find(r => r.fnSource && r.fnSource.key === k);
  const deep = rk('RAD-F-1.1.1.1.1');
  check('top function becomes funcId, node keeps its Jama key as subId', deep.funcId === 'RAD-AF-1' && deep.subId === 'RAD-F-1.1.1.1.1');
  check('parent link written to any depth', deep.parentSubId === 'RAD-F-1.1.1.1' && FT.depth(deep, FT.index(rows)) === 4);
  check('directly under the top function means no parentSubId', !rk('RAD-F-1.1').parentSubId);
  check('the looked-through function sits under the function above the folder', rk('RAD-F-1.1.4').parentSubId === 'RAD-F-1.1');
  const only = rows.find(r => r.fnSource.funcOnly);
  check('childless top gets one function-only row', only && only.funcId === 'RAD-AF-6' && only.subId === '');
  check('the store has no broken links after the first apply', FT.problems(rows).length === 0);
  check('identity and signature recorded', deep.fnSource.tool === 'jama-live' && deep.fnSource.remoteId === rig.byKey(snap1, 'RAD-F-1.1.1.1.1').id && deep.fnSource.by === 'B. Ciocca');
  check('descriptions are plain text', !/<|&amp;/.test(deep.subDef) && /definition & detail/.test(deep.subDef));
  const again = await stage(snap1, rows);
  check('checking the same snapshot again: nothing to review', JT.pending(again.diff) === 0 && again.diff.unchanged === fnCount - 6, JSON.stringify({ p: JT.pending(again.diff), u: again.diff.unchanged }));

  // snapshot 2
  const snap2 = rig.mutate(snap1);
  current = snap2;
  const s2 = await stage(snap2, rows);
  const d = s2.diff;
  const keysOf = list => list.map(x => (x.item ? x.item.key : '') || (x.row && x.row.subId)).sort().join();
  check('NEW: the added deep function and the first child of the childless top', keysOf(d.fresh) === 'RAD-F-1.3.1.1.3,RAD-F-6.1', keysOf(d.fresh));
  check('CHANGED: rename, description, key change', keysOf(d.changed) === 'RAD-F-2.1.1,RAD-F-2.1.1.1,RAD-G-1.2', keysOf(d.changed));
  check('a key change is reported as a change, not as new', d.changed.find(x => x.item.key === 'RAD-G-1.2').fields.some(f => /RAD-F-1\.2 is now RAD-G-1\.2/.test(f)));
  check('MOVED: the moved function and both its children (new top function)', keysOf(d.moved) === 'RAD-F-3.2.2.3,RAD-F-3.2.2.3.1,RAD-F-3.2.2.3.2', keysOf(d.moved));
  check('FUNCTION RENAMED: the top function, applied to all its rows', d.fnChanged.length === 1 && d.fnChanged[0].item.key === 'RAD-AF-2' && d.fnChanged[0].rows.length === (fnCount - 6) / 5);
  check('MISSING: the deleted function, and the function-only row no longer needed',
    d.missing.length === 2 && d.missing.some(x => x.row.subId === 'RAD-F-5.3.4.3.2' && /no longer in Jama/.test(x.why)) && d.missing.some(x => x.row.fnSource.funcOnly && /no longer needed/.test(x.why)));
  const before = rows.length;
  const a2 = JT.applyFunctions(d, rows, { signedBy: 'B. Ciocca', at: '2026-10-21T11:00:00Z', newId });
  check('apply counts match the review', a2.ok && a2.added === 2 && a2.updated === 3 && a2.moved === 3 && a2.flagged === 2, JSON.stringify(a2));
  check('missing is flagged, never deleted', rows.length === before + 2 && rk('RAD-F-5.3.4.3.2').fnSource.missingInSource === true && only.fnSource.missingInSource === true);
  const mv = rk('RAD-F-3.2.2.3');
  check('the moved row joins its new function and parent', mv.funcId === 'RAD-AF-4' && mv.parentSubId === 'RAD-F-4.1.1');
  check('its children move with it and keep their parent', rk('RAD-F-3.2.2.3.1').funcId === 'RAD-AF-4' && rk('RAD-F-3.2.2.3.1').parentSubId === 'RAD-F-3.2.2.3');
  const kc = rk('RAD-G-1.2');
  check('a key change keeps the subId everything points at', kc && kc.subId === 'RAD-F-1.2' && rows.filter(r => r.parentSubId === 'RAD-F-1.2').length === 4);
  check('rename and description land', rk('RAD-F-2.1.1').subName === 'Fn 2.1.1 renamed' && rk('RAD-F-2.1.1.1').subDef === 'New words');
  check('the top rename reaches every row of it', rows.filter(r => r.funcId === 'RAD-AF-2').every(r => r.funcName === 'Top function 2 renamed'));
  const nw = rk('RAD-F-1.3.1.1.3');
  check('a new deep row is placed under its parent', nw.parentSubId === 'RAD-F-1.3.1.1' && FT.depth(nw, FT.index(rows)) === 4);
  check('the childless top\'s new child joins the same function', rk('RAD-F-6.1').funcId === 'RAD-AF-6' && !rk('RAD-F-6.1').parentSubId);
  check('the store has no broken links after the second apply', FT.problems(rows).length === 0, JSON.stringify(FT.problems(rows).map(p => p.reason)));
  const s3 = await stage(snap2, rows);
  check('third check of the same snapshot: in sync (idempotent)', JT.pending(s3.diff) === 0, JSON.stringify({ f: s3.diff.fresh.length, c: s3.diff.changed.length, m: s3.diff.moved.length, fc: s3.diff.fnChanged.length, x: s3.diff.missing.length }));
  {
    const r2 = [{ internalId: 'x', funcId: 'F', subId: 'RAD-F-1.1', subName: 'mine' }];
    const t = await stage(snap1, r2);
    JT.applyFunctions(t.diff, r2, { signedBy: 'x', newId });
    check('a Jama key that collides with an existing subId is made unique, the engineer\'s row untouched',
      r2[0].subName === 'mine' && r2.some(r => r.fnSource && r.subId === 'RAD-F-1.1#' + rig.byKey(snap1, 'RAD-F-1.1').id) && FT.problems(r2).length === 0);
  }
  {
    const loop = [{ id: 1, type: rig.FN, key: 'A', parentItemId: 2 }, { id: 2, type: rig.FN, key: 'B', parentItemId: 1 }];
    const r = await JT.resolveFunctionParents([{ id: 3, type: rig.FOLDER, parentItemId: 4 }, { id: 4, type: rig.FOLDER, parentItemId: 3 }, { id: 5, type: rig.FN, key: 'C', parentItemId: 3 }], fnTypes, null);
    check('a parent loop through folders ends, the function is treated as top', r.parentOf.get(5) === null && r.warnings.some(w => /loop/.test(w)));
    const t = JT.buildTree(loop, fnTypes, new Map([[1, 2], [2, 1]]));
    check('a loop between functions does not hang the tree', t.order.length === 2);
  }

  // ------------------------------------------------------------------ SysML: the tree survives the model
  console.log('\n[sysml] the tree goes out as nested actions and comes back as the same tree');
  {
    const ctx = { console, TextEncoder, TextDecoder, Uint8Array };
    ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(read('site/func_tree.js'), ctx, { filename: 'func_tree.js' });
    vm.runInContext(read('site/sysml_model.js'), ctx, { filename: 'sysml_model.js' });
    const C = ctx.SLSysML.core, LIB = read('site/sysml_safety_lib.sysml');
    const empty = () => ({ projectName: 'Tree', acFunctionsData: [], acFcimData: [], acFhaData: [], acReqData: [], acAssumptionsData: [], systemsData: [], praData: [], zsaData: [], cmaData: [], routingData: [], resourcesData: [], fmeaData: [], itemsData: [],
      stpaData: { cs: { controllers: [], processes: [], actions: [], feedbacks: [], others: [], precedence: [] }, dispositions: {}, causeDismissals: {}, scopeFcIds: [], meta: { mission: '', scope: '', boundary: '', abstractionLevel: '' }, losses: [], hazards: [], constraints: [], responsibilities: [], csState: 'initial', sip: {} },
      ftaPages: [{ id: 'page-1', name: 'Untitled Fault Tree', root: null }], activeFTAPageId: 'page-1', internalIdCounter: 1, projectConfig: { regulation: 'Part 25', markovModels: [], interfaces: [], customLibrary: {} } });
    const P = empty();
    P.acFunctionsData = rows.filter(r => r.subId && (r.funcId === 'RAD-AF-1' || r.funcId === 'RAD-AF-4')).map(r => ({ internalId: r.internalId, funcId: r.funcId, funcName: r.funcName, funcDef: r.funcDef, subId: r.subId, subName: r.subName, subDef: r.subDef, parentSubId: r.parentSubId }));
    const out = C.exportText(P, { at: '2026-10-21' });
    check('the export nests a level-4 action four deep', /action[^\n]*RAD-F-1\.1\.1\.1\.1/.test(out.text) && out.dangling === 0, String(out.dangling));
    const Q = empty(); let k = 0;
    C.applyImport(Q, C.planImport(Q, [{ name: 'tree.sysml', text: out.text }, { name: 'SafetyLab.sysml', text: LIB }]), { newId: () => 'q' + (++k) });
    const want = new Map(P.acFunctionsData.map(r => [r.subId, (r.parentSubId || '') + '|' + r.funcId]));
    const got = new Map(Q.acFunctionsData.filter(r => r.subId).map(r => [r.subId, (r.parentSubId || '') + '|' + r.funcId]));
    const diffs = [...want].filter(([id, v]) => got.get(id) !== v);
    check('import into an empty project gives back every node, under the same parent, in the same function', got.size === want.size && diffs.length === 0, got.size + '/' + want.size + ' ' + JSON.stringify(diffs.slice(0, 3)));
    const os = require('os'), cp = require('child_process');
    const VD = [process.env.SL_SYSML_VALIDATORS, path.join(REPO, 'tools/sysml')].filter(Boolean).find(d => fs.existsSync(path.join(d, 'node_modules/@openmbee/opensysml')));
    if (!VD) console.log('  SKIP  OpenMBEE not installed in tools/sysml: the nested-action export was not validated');
    else {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-tree-')), f = path.join(tmp, 'tree_with_library.sysml');
      fs.writeFileSync(f, LIB + '\n' + out.text);
      const OMB = path.join(REPO, 'tools/sysml/openmbee-check.mjs');
      const r = cp.spawnSync('node', [OMB, f], { encoding: 'utf8', timeout: 240000, cwd: VD, maxBuffer: 1 << 28 });
      let diags = null; try { diags = JSON.parse(String(r.stdout).trim().split('\n').pop()).diagnostics.filter(d => /error|warn/i.test(d.severity || '')); } catch (_) {}
      check('OpenMBEE: the nested-action export with the library parses and links cleanly', diags && diags.length === 0, diags ? JSON.stringify(diags.slice(0, 3)) : 'no report: ' + String(r.stderr).slice(0, 200));
    }
  }

  // ------------------------------------------------------------------ live_bridge in a page
  console.log('\n[live_bridge] the desktop door: types, paging, rate limit, sign');
  function page(cfg, srvOpts) {
    const store = { 'safetyLab.bridge.v1': JSON.stringify(cfg) };
    const s = rig.server(() => current, srvOpts);
    const ctx = {
      console, URL, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {},
      navigator: { userAgent: 'test' },
      localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
      document: { readyState: 'complete', getElementById: () => null, addEventListener() {}, querySelectorAll: () => [], createElement: () => ({}) },
      __slabDesktop: true,
      slabSecrets: { save: async () => ({ ok: true }) },
      slabBridge: { get: s.get },
      acFunctionsData: [], acReqData: [], journal: [],
    };
    ctx.window = ctx; ctx.globalThis = ctx;
    ctx.jrnl = (k, m) => ctx.journal.push([k, m]);
    vm.createContext(ctx);
    const DASH = String.fromCharCode(0x2014);
  // live_bridge.js keeps its v1 header as written; the rule applies to what v2 added
  const noDash = f => { let t = read(f); if (/live_bridge/.test(f)) t = t.slice(t.indexOf('v2.0, 21 Oct 2026')); return t.indexOf(DASH) < 0; };
  for (const f of ['site/func_tree.js', 'site/jama_tree.js', 'site/live_bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
    ctx._bridgeGet._waitMs = 0;
    return { ctx, srv: s };
  }
  current = snap1;
  const base = { baseUrl: 'https://radia.jamacloud.com', projectId: '77', fnTypes: [rig.FN], reqTypes: [rig.REQ] };
  {
    const p = page(base, { rateLimitOnce: true });
    const items = await p.ctx.bridgeFetchItems();
    const abs = p.srv.log.filter(u => /abstractitems/.test(u));
    const want = snap1.filter(i => i.itemType === rig.FN || i.itemType === rig.REQ).length;
    check('every page is read, well past the old 10 page stop', items.length === want && abs.length > 11, items.length + ' items, ' + abs.length + ' calls');
    check('only the chosen item types are asked for', abs.every(u => /itemType=10/.test(u) && /itemType=20/.test(u) && !/itemType=30/.test(u)));
    check('the relay rate limit is waited out, not fatal', abs.filter(u => /startAt=100\b/.test(u)).length === 2);
    const d1 = await p.ctx.bridgeCheck(true);
    check('requirements staged from requirement types only', d1.req.fresh.length === 40 && d1.req.fresh.every(it => it.type === rig.REQ));
    check('functions staged as a tree', d1.fn && d1.fn.total === fnCount && d1.fn.tops === 6 && d1.fn.fresh.length === fnCount - 5);
    const refused = p.ctx.bridgeApply(d1, '');
    check('unsigned apply refused at the bridge, nothing written', refused.ok === false && p.ctx.acFunctionsData.length === 0 && p.ctx.acReqData.length === 0);
    const ok = p.ctx.bridgeApply(d1, 'B. Ciocca');
    check('signed apply files functions and requirements in their own stores', ok.ok && p.ctx.acReqData.length === 40 && p.ctx.acFunctionsData.length === fnCount - 5);
    check('no folder, set or function was filed as a requirement', p.ctx.acReqData.every(r => /^RAD-REQ-/.test(r.id)));
    check('the apply is in the change journal with who signed', p.ctx.journal.some(([k, m]) => k === 'bridge-sync' && /functions \+\d+ new/.test(m) && /Signed B\. Ciocca/.test(m)));
    current = snap2;
    const d2 = await p.ctx.bridgeCheck(true);
    check('second check: requirement changed, added and missing', d2.req.fresh.length === 1 && d2.req.changed.length === 1 && d2.req.missing.length === 1);
    check('second check: function review matches the pure engine', JT.pending(d2.fn) === JT.pending(d) && d2.fn.moved.length === 3 && d2.fn.missing.length === 2, String(JT.pending(d2.fn)));
    p.ctx.bridgeApply(d2, 'B. Ciocca');
    check('a requirement gone from Jama is flagged, not deleted', p.ctx.acReqData.length === 41 && p.ctx.acReqData.find(r => r.id === 'RAD-REQ-40').reqSource.missingInSource === true);
    const d3 = await p.ctx.bridgeCheck(true);
    check('third check: in sync', JT.pending(d3.fn) === 0 && d3.req.fresh.length + d3.req.changed.length + d3.req.missing.length === 0);
    current = snap1;
  }
  {
    const p = page({ baseUrl: 'https://radia.jamacloud.com', projectId: '77' });
    let err = '';
    try { await p.ctx.bridgeFetchItems(); } catch (e) { err = e.message; }
    check('no item types chosen: nothing is read, and it says why', /Choose which Jama item types/.test(err) && p.srv.log.length === 0);
    const types = await page(base).ctx.bridgeFetchItemTypes();
    check('item types are listed for the picker', types.length === 4 && types.some(t => t.id === rig.FN && t.name === 'Function'));
    const p2 = page(base, {});
    p2.ctx.slabBridge.get = async () => ({ ok: false, error: 'Bridge rate limit (60/min) exceeded.' });
    let e2 = '';
    try { await p2.ctx.bridgeFetchItems(); } catch (e) { e2 = e.message; }
    check('a rate limit that never lifts gives up after a bounded number of tries', /rate limit/.test(e2));
  }

  // ------------------------------------------------------------------ wiring
  console.log('\n[wiring] the page, the form, the exports');
  const idx = read('site/index.html');
  const pos = s => idx.indexOf('src="' + s);
  check('func_tree.js loads before the modules that read it', pos('func_tree.js') > 0 && pos('func_tree.js') < pos('data_ops_modules.js'));
  check('jama_tree.js loads before live_bridge.js', pos('jama_tree.js') > 0 && pos('jama_tree.js') < pos('live_bridge.js'));
  check('the function form has a "Sits under" picker', /id="ac-subfunc-parent"/.test(idx));
  const sl = read('site/safety_lab.js');
  check('the form saves parentSubId', /parentSubId:\s*'ac-subfunc-parent'/.test(sl));
  check('the form validates the parent link', /SLFuncTree\.check\(/.test(sl));
  check('a node with nodes under it cannot be deleted out from under them', /_acFuncDeleteBlocked/.test(sl) && /_acFuncDeleteBlocked\s*=/.test(read('site/bindings_modules.js')));
  check('CSV and table exports carry the parent column', /Parent Sub-Function ID/.test(read('site/data_ops_modules.js')));
  check('Excel import reads the parent column', /parentSubId:\s*\[/.test(read('site/importers.js')));
  check('the SysML model nests child actions', /parentSubId/.test(read('site/sysml_model.js')));
  check('the panel offers the item type choice and a signature', /lb-fn-type/.test(read('site/live_bridge.js')) && /Sign and apply staged changes/.test(read('site/live_bridge.js')));
  const DASH = String.fromCharCode(0x2014);
  // live_bridge.js keeps its v1 header as written; the rule applies to what v2 added
  const noDash = f => { let t = read(f); if (/live_bridge/.test(f)) t = t.slice(t.indexOf('v2.0, 21 Oct 2026')); return t.indexOf(DASH) < 0; };
  for (const f of ['site/func_tree.js', 'site/jama_tree.js', 'site/live_bridge.js', 'tests/fixtures/jama_functions_rig.js', 'tests/regression_jama_live_functions_20261021.test.js'])
    check('no em dashes in ' + f, noDash(f));

  // ------------------------------------------------------------------ host guards
  console.log('\n[guards] internal hosts: server installs only, administrator listed only');
  const W = await import(path.join(REPO, 'customer-install/selfhost/ai-proxy/worker.js'));
  const tp = W.bridgeTargetProblem;
  const OFF = { LICENSE_MODE: 'offline', BRIDGE_INTERNAL_HOSTS: 'jama.radia.local, 192.168.10.50, alm.radia.internal:8443' };
  check('hosted proxy: internal host refused', tp('https://jama.radia.local/rest/latest/items', 'jama.radia.local', {}).status === 400);
  check('hosted proxy: the list is ignored without an offline licence', tp('https://jama.radia.local/rest/latest/items', 'jama.radia.local', { BRIDGE_INTERNAL_HOSTS: 'jama.radia.local' }).status === 400);
  check('server install: a listed internal name is allowed', !!tp('https://jama.radia.local/rest/latest/items', 'jama.radia.local', OFF).target);
  check('server install: a listed internal address is allowed', !!tp('https://192.168.10.50/rest/latest/items', '192.168.10.50', OFF).target);
  check('server install: an unlisted internal host is still refused', tp('https://192.168.10.51/rest/latest/items', '192.168.10.51', OFF).status === 400);
  check('server install: a listed host:port is allowed on that port', !!tp('https://alm.radia.internal:8443/rest/latest/items', 'alm.radia.internal', OFF).target);
  check('server install: another port on a listed host is refused', tp('https://jama.radia.local:8443/rest/latest/items', 'jama.radia.local', OFF).status === 400);
  check('server install: http refused even when listed', tp('http://jama.radia.local/rest/latest/items', 'jama.radia.local', OFF).status === 400);
  check('server install: non /rest/ path refused even when listed', tp('https://jama.radia.local/admin', 'jama.radia.local', OFF).status === 400);
  check('server install: host must match the saved connector', tp('https://jama.radia.local/rest/latest/items', '192.168.10.50', OFF).status === 403);
  check('public hosts unchanged', !!tp('https://radia.jamacloud.com/rest/latest/items', 'radia.jamacloud.com', {}).target);
  const wsrc = read('customer-install/selfhost/ai-proxy/worker.js');
  check('server proxy still refuses redirects', /redirect: "manual"/.test(wsrc) && /redirects are not followed/.test(wsrc));
  const twin = path.join(REPO, '..', 'safety-lab-proxy-deploy', 'worker.js');
  if (fs.existsSync(twin)) check('proxy-deploy worker is byte-identical to the customer copy', fs.readFileSync(twin, 'utf8') === wsrc);
  const root = read('worker.js');
  check('browser-only relay still refuses internal hosts (no list there)', /host\.endsWith\('\.local'\)/.test(root) && !/BRIDGE_INTERNAL_HOSTS/.test(root) && /redirect: 'manual'/.test(root));
  const inst = read('customer-install/selfhost/install.sh');
  check('install.sh carries the administrator\'s list into the setup file, validated', /BRIDGE_INTERNAL_HOSTS/.test(inst) && /bridgeInternalHosts/.test(inst) && /\^\[a-z0-9\.:,-\]\+\$/.test(inst));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  test crashed: ' + (e && e.stack || e)); process.exit(1); });

#!/usr/bin/env node
/*
 * Regression — a sync pull MERGES IN PLACE; references survive (13 Sep 2026, R18 rebuild).
 *
 * WHY. __crdtApply used to REASSIGN every synced store to the doc's fresh array. Every
 * reference held anywhere in the app — the node the fault-tree editor is editing
 * (selectedNodeData), the table a dialog captured before it awaited, the requirement rows
 * the auto-req preview holds until Accept, a module's `projectConfig.hf` handle — then
 * pointed at a discarded copy, and the next write into it was silently lost.
 *
 * PINNED (the real helpers_modules.js functions, executed in a vm over var-declared stores):
 *   M1  the array object is the same object after a pull; surviving rows are the same objects,
 *       updated field by field; dropped rows go; new rows arrive; order follows the doc
 *   M2  fault-tree pages and their NODES keep identity: selectedNodeData is still the live node
 *   M3  projectConfig keeps identity, and so do its nested sub-stores; removed keys are removed
 *   M4  systemsData rows keep identity and so do their nested lists (sys.fha is the same array)
 *   M5  __crdtFingerprint changes when a row changes, is stable otherwise, and uses no eval
 *   M6  mutation: reassigning instead of merging goes red
 *
 * Run: node tests/regression_crdt_merge_in_place.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const HELPERS = fs.readFileSync(path.join(__dirname, '..', 'site', 'helpers_modules.js'), 'utf8');

// pull a top-level `function name(` ... `}` (brace-matched) out of the source
function fn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('missing ' + name);
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) { const c = src[i]; if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) return src.slice(at, i + 1); } }
  throw new Error('unterminated ' + name);
}
const NAMES = ['_crdtKeys', '_isPlainObj', '_assignDeepInPlace', '_mergeRowsInPlace', '_mergeTreeInPlace', '_mergePagesInPlace', '__crdtFingerprint', '__crdtApply'];
const FALLBACK = HELPERS.slice(HELPERS.indexOf('var _CRDT_KEYS_FALLBACK'), HELPERS.indexOf(';', HELPERS.indexOf('var _CRDT_KEYS_FALLBACK')) + 1);

function boot(src) {
  src = src || HELPERS;
  const ctx = {
    console, JSON, Object, Array, String, Math, Map, Set,
    window: {}, _autosaveSuspended: false, scheduleAutosave: () => { ctx._saved = (ctx._saved || 0) + 1; },
    updateDashboard() {}, renderACFHA() {}, renderFTASidebar() {}, updateD3() {}, renderProjectConfigUI() {}, renderSystemDirectory() {},
  };
  vm.createContext(ctx);
  const stores = `
    var acFunctionsData = [], acReqData = [], acAssumptionsData = [], praData = [], zsaData = [], cmaData = [], fmeaData = [], acFcimData = [], routingData = [], resourcesData = [], itemsData = [], flightPhasesData = [], mlData = {}, stpaData = {}, typeCounters = {};
    var acFhaData = [{ internalId: 'r1', severity: 'Major', comments: 'keep me' }, { internalId: 'r2', severity: 'Minor' }, { internalId: 'r3', severity: 'Catastrophic' }];
    var projectConfig = { regulation: 'Part 25', hf: { rows: [{ id: 'h1' }] }, obsolete: true, markovModels: [] };
    var systemsData = [{ id: 'sys-1', name: 'Hydraulics', fha: [{ internalId: 's1', severity: 'Major' }], functions: [] }];
    var ftaPages = [{ id: 'page-1', name: 'Tree A', root: { id: '1', name: 'Top', type: 'OR', children: [{ id: '2', name: 'BE one', lambda: 1e-6, children: [] }, { id: '3', name: 'BE two', children: [] }] } }];
    var projectName = 'P', acAsmCounter = 1, fmeaCounter = 1, reviewCounter = 1, internalIdCounter = 10;
    var selectedNodeData = ftaPages[0].root.children[0];
  `;
  vm.runInContext(stores + FALLBACK + NAMES.map(n => fn(src, n)).join('\n'), ctx);
  return ctx;
}
const G = (ctx, expr) => vm.runInContext(expr, ctx);

console.log('[M1] keyed rows merge in place');
{
  const c = boot();
  const arrBefore = G(c, 'acFhaData'), r1 = G(c, 'acFhaData[0]'), r3 = G(c, 'acFhaData[2]');
  G(c, `__crdtApply({ acFhaData: [ { internalId: 'r3', severity: 'Catastrophic', sevBasis: 'CAT-1' }, { internalId: 'r1', severity: 'Hazardous' }, { internalId: 'r9', severity: 'Minor' } ] })`);
  check('the store is the SAME array object after the pull', G(c, 'acFhaData') === arrBefore);
  check('a surviving row is the SAME object, updated (r1: Major -> Hazardous)', G(c, 'acFhaData[1]') === r1 && r1.severity === 'Hazardous');
  check('a field the doc no longer carries is removed from the surviving row (r1.comments)', !('comments' in r1));
  check('a new field arrives on a surviving row (r3.sevBasis)', G(c, 'acFhaData[0]') === r3 && r3.sevBasis === 'CAT-1');
  check('a dropped row is gone (r2)', !G(c, 'acFhaData').some(r => r.internalId === 'r2'));
  check('a new row arrives (r9) and order follows the doc (r3,r1,r9)', G(c, 'acFhaData.map(r => r.internalId).join(",")') === 'r3,r1,r9');
  check('the pull announced itself once autosave was un-suspended (scheduleAutosave ran)', c._saved === 1);
}

console.log('\n[M2] fault-tree pages and nodes keep identity');
{
  const c = boot();
  const page = G(c, 'ftaPages[0]'), root = G(c, 'ftaPages[0].root'), node2 = G(c, 'selectedNodeData');
  G(c, `__crdtApply({ ftaPages: [ { id: 'page-1', name: 'Tree A renamed', root: { id: '1', name: 'Top', type: 'AND', children: [ { id: '3', name: 'BE two', children: [] }, { id: '2', name: 'BE one edited', lambda: 2e-6, children: [] }, { id: '4', name: 'BE new', children: [] } ] } } ] })`);
  check('the page object is the same object (renamed in place)', G(c, 'ftaPages[0]') === page && page.name === 'Tree A renamed');
  check('the root node is the same object (gate type updated in place)', G(c, 'ftaPages[0].root') === root && root.type === 'AND');
  check('selectedNodeData is STILL the live node (same object, edited: lambda 2e-6)', G(c, 'ftaPages[0].root.children[1]') === node2 && node2.lambda === 2e-6 && node2.name === 'BE one edited');
  check('children follow the doc order and the new node arrived (3,2,4)', G(c, 'ftaPages[0].root.children.map(n => n.id).join(",")') === '3,2,4');
  // an edit through the held reference lands in the live tree — the whole point
  node2.name = 'edited through the held handle';
  check('an edit through the held handle is visible in the live tree', G(c, 'ftaPages[0].root.children[1].name') === 'edited through the held handle');
}

console.log('\n[M3] projectConfig keeps identity, nested sub-stores too');
{
  const c = boot();
  const cfg = G(c, 'projectConfig'), hf = G(c, 'projectConfig.hf'), rows = G(c, 'projectConfig.hf.rows');
  G(c, `__crdtApply({ projectConfig: { regulation: 'Part 23', hf: { rows: [{ id: 'h1', note: 'n' }, { id: 'h2' }] }, markovModels: [] } })`);
  check('projectConfig is the same object', G(c, 'projectConfig') === cfg && cfg.regulation === 'Part 23');
  check('projectConfig.hf is the same object and hf.rows the same array (2 rows now)', G(c, 'projectConfig.hf') === hf && G(c, 'projectConfig.hf.rows') === rows && rows.length === 2);
  check('a key the doc dropped is removed (obsolete)', !('obsolete' in cfg));
}

console.log('\n[M4] systems keep identity down to their nested lists');
{
  const c = boot();
  const sys = G(c, 'systemsData[0]'), sysFha = G(c, 'systemsData[0].fha'), s1 = G(c, 'systemsData[0].fha[0]');
  G(c, `__crdtApply({ systemsData: [ { id: 'sys-1', name: 'Hydraulic Power', fha: [ { internalId: 's1', severity: 'Hazardous' }, { internalId: 's2', severity: 'Minor' } ], functions: [] } ] })`);
  check('the system row is the same object (renamed)', G(c, 'systemsData[0]') === sys && sys.name === 'Hydraulic Power');
  check('sys.fha is the same array, its first row the same object, updated', G(c, 'systemsData[0].fha') === sysFha && G(c, 'systemsData[0].fha[0]') === s1 && s1.severity === 'Hazardous' && sysFha.length === 2);
}

console.log('\n[M5] the fingerprint');
{
  const c = boot();
  const a = G(c, '__crdtFingerprint()'), b = G(c, '__crdtFingerprint()');
  check('stable when nothing changed', a === b && typeof a === 'string' && a.length > 3);
  G(c, "acFhaData[0].severity = 'Minor'");
  check('changes when a row field changes', G(c, '__crdtFingerprint()') !== a);
  G(c, "acFhaData[0].severity = 'Major'");
  check('returns to the original value when the edit is reverted', G(c, '__crdtFingerprint()') === a);
  check('uses no eval (the production CSP blocks it)', !/\beval\s*\(/.test(fn(HELPERS, '__crdtFingerprint')));
}

console.log('\n[M6] mutation: reassign instead of merge goes red');
{
  const mut = HELPERS.replace("acFhaData         = _mergeRowsInPlace(acFhaData,         partial.acFhaData,         K.acFhaData);", "acFhaData = partial.acFhaData;");
  check('mutation applied', mut !== HELPERS);
  const c = boot(mut);
  const arrBefore = G(c, 'acFhaData');
  G(c, `__crdtApply({ acFhaData: [ { internalId: 'r1', severity: 'Hazardous' } ] })`);
  check('M1 goes red under the mutation (array identity lost)', G(c, 'acFhaData') !== arrBefore);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

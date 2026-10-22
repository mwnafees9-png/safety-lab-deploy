#!/usr/bin/env node
/*
 * Regression: live Jama on every page, aircraft and system level (22 Oct 2026).
 *
 * Waqas's rulings (22 Oct 2026): "every page that can interface with Jama needs it, that includes
 * functions ... both at the aircraft and system level"; one Jama connection per project, set up once;
 * the same rules everywhere (nothing changes until someone signs, nothing deleted, Jama IDs and
 * revisions come across, the 3-level limit for aircraft functions); read-only.
 *
 * What this pins:
 *   1. jama_kinds.js (pure): which system an item belongs to (its Jama folder), field values
 *      (picklists named), severity and FCIM slot vocabularies, assumptions, system functions and
 *      failure conditions (FCIM slot + FHA row, waiting until the function is in, refusing a
 *      second total loss, moving a condition when Jama moves it, flagging what is gone).
 *   2. live_bridge.js v3 in a page: the connection is a project setting (the login is not), the
 *      pre-22-Oct per-computer setting is read and moved, one check stages every kind for the
 *      aircraft and for each system, a page signs only its own changes, a failure condition waiting
 *      for its function is ready the moment the function is signed in.
 *   3. a panel on each of the ten pages (aircraft and system: Functions, FCIM, Hazard assessment,
 *      Assumptions, Requirements), one connection dialog, item type names kept.
 *
 * Run: node tests/regression_jama_every_page_20261022.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 600) + ')' : '')); } };
const REPO = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');
const K = require('../site/jama_kinds.js');

// ------------------------------------------------------------------ a Jama project, in memory
const T = { FUNC: 101, REQ: 102, ASM: 103, FC: 104, FLD: 105 };
const TYPES = [{ id: T.FUNC, display: 'Function', typeKey: 'FUNC' }, { id: T.REQ, display: 'System Requirement', typeKey: 'SYSREQ' },
  { id: T.ASM, display: 'Assumption', typeKey: 'ASM' }, { id: T.FC, display: 'Failure Condition', typeKey: 'FC' }, { id: T.FLD, display: 'Folder', typeKey: 'FLD' }];
function jama() {
  const items = new Map();
  const add = (id, type, key, name, parent, seq, fields) => items.set(id, { id, documentKey: key, itemType: type, fields: Object.assign({ name, description: '<p>' + name + '</p>' }, fields || {}),
    location: { parent: parent != null ? { item: parent } : { project: 77 }, sequence: seq, globalSortOrder: id }, modifiedDate: '2026-10-20T10:00:00.000+0000' });
  add(1, T.FLD, 'F-AC', 'Aircraft', null, '1');
  add(10, T.FUNC, 'AF-1', 'Control flight path', 1, '1.1');
  add(11, T.FUNC, 'AF-1.1', 'Control pitch', 10, '1.1.1');
  add(12, T.FUNC, 'AF-1.2', 'Control roll', 10, '1.1.2');
  add(20, T.FC, 'FC-1', 'Loss of pitch control', 11, '1.1.1.1', { 'severity$104': 501, 'phases$104': [601, 602], 'effac$104': 'Loss of the aircraft' });
  add(21, T.FC, 'FC-2', 'Partial loss of pitch control', 11, '1.1.1.2', { 'severity$104': 502 });
  add(22, T.FC, 'FC-3', 'Erroneous pitch command', 11, '1.1.1.3', { 'severity$104': 501 });
  add(23, T.FC, 'FC-4', 'Unknown thing happens', 12, '1.1.2.1');
  add(30, T.ASM, 'ASM-1', 'Crew trained', 1, '1.2', { description: '<p>Crews are trained on the pitch trim procedure.</p>' });
  add(40, T.REQ, 'AR-1', 'Pitch control loss shall be extremely improbable', 1, '1.3');
  add(2, T.FLD, 'F-FCS', 'Flight Control System', null, '2');
  add(50, T.FUNC, 'SF-1', 'Command elevator', 2, '2.1');
  add(51, T.REQ, 'SR-1', 'The FCC shall command the elevator', 2, '2.2');
  add(52, T.FC, 'SFC-1', 'Loss of elevator command', 50, '2.1.1', { 'severity$104': 503 });
  add(53, T.ASM, 'SASM-1', 'Hydraulics available', 2, '2.3');
  const options = { 501: 'Catastrophic', 502: 'Major', 503: 'Hazardous', 601: 'Takeoff', 602: 'Cruise' };
  const log = [];
  function get(url) {
    const u = new URL(url); log.push(u.pathname + u.search);
    const page = (list) => { const st = Number(u.searchParams.get('startAt') || 0), mx = Number(u.searchParams.get('maxResults') || 50); return { meta: { pageInfo: { totalResults: list.length } }, data: list.slice(st, st + mx) }; };
    let m;
    if (u.pathname === '/rest/latest/itemtypes') return page(TYPES);
    if ((m = /^\/rest\/latest\/itemtypes\/(\d+)$/.exec(u.pathname))) return { data: { fields: [{ name: 'name', label: 'Name', fieldType: 'STRING' }, { name: 'severity$104', label: 'Severity', fieldType: 'LOOKUP', pickList: 9 }, { name: 'phases$104', label: 'Flight phases', fieldType: 'MULTI_LOOKUP', pickList: 10 }, { name: 'effac$104', label: 'Aircraft effect', fieldType: 'TEXT' }] } };
    if (u.pathname === '/rest/latest/abstractitems') { const want = new Set(u.searchParams.getAll('itemType').map(Number)); return page(Array.from(items.values()).filter(i => want.has(i.itemType))); }
    if ((m = /^\/rest\/latest\/picklistoptions\/(\d+)$/.exec(u.pathname))) return { data: { name: options[m[1]] || '' } };
    if ((m = /^\/rest\/latest\/items\/(\d+)$/.exec(u.pathname))) { const it = items.get(Number(m[1])); if (!it) throw new Error('HTTP 404'); return { data: it }; }
    throw new Error('HTTP 404 ' + u.pathname);
  }
  return { items, add, get, log };
}

(async function main() {
  // ------------------------------------------------------------------ jama_kinds, pure
  console.log('\n[kinds] which system, field values, vocabularies');
  {
    const its = [{ id: 1, seq: '2' }, { id: 2, seq: '2.1' }, { id: 3, seq: '2.10.1' }, { id: 4, seq: '1.4' }, { id: 5, seq: '2.1.3' }];
    const p = K.partition(its, [{ sysId: 'S1', seq: '2', id: 1 }, { sysId: 'S2', seq: '2.1', id: 2 }]);
    check('an item belongs to the deepest system folder that holds it; the folders themselves and everything else are aircraft level',
      p.get(1) === null && p.get(2) === null && p.get(3) === 'S1' && p.get(4) === null && p.get(5) === 'S2', JSON.stringify(Array.from(p)));
    const opts = new Map([[501, 'Catastrophic'], [601, 'Takeoff'], [602, 'Cruise']]);
    const it = { fields: { a: 501, b: [601, 602], c: '<p>Loss of&nbsp;the <b>aircraft</b></p>' } };
    check('field values: a picklist option is named, a multi-pick is listed, rich text is plain', K.fieldText(it, 'a', opts) === 'Catastrophic' && K.fieldText(it, 'b', opts) === 'Takeoff, Cruise' && K.fieldText(it, 'c', opts) === 'Loss of the aircraft');
    check('severity words and codes map to the five classes', ['CAT', 'Hazardous', 'Severe-Major', 'MAJ', 'minor', 'No Safety Effect', 'NSE'].map(K.severityOf).join('|') === 'Catastrophic|Hazardous|Hazardous|Major|Minor|No Safety Effect|No Safety Effect');
    check('FCIM slot from the field, else from the wording', K.slotOf('Malfunction', 'Loss of X') === 'm' && K.slotOf('', 'Loss of all hydraulics') === 'tl' && K.slotOf('', 'Partial loss of roll') === 'pl' && K.slotOf('', 'Erroneous airspeed') === 'm' && K.slotOf('', 'Something') === '');
  }
  console.log('\n[kinds] assumptions and system functions');
  {
    const store = [];
    const its = [{ id: 30, key: 'ASM-1', name: 'Crew trained', text: 'Crews are trained.', modified: 'a' }];
    let d = K.diffAssumptions(its, store);
    check('a new Jama assumption is staged', d.fresh.length === 1 && store.length === 0);
    check('apply needs a signature', K.applyAssumptions(d, store, {}).ok === false && store.length === 0);
    K.applyAssumptions(d, store, { signedBy: 'B' });
    check('signed: the assumption is in, ID = the Jama key, text = its description', store.length === 1 && store[0].asmId === 'ASM-1' && store[0].text === 'Crews are trained.' && store[0].asmSource.remoteId === 30);
    its[0].text = 'Crews are trained twice a year.';
    d = K.diffAssumptions(its, store);
    check('a changed description is CHANGED', d.changed.length === 1 && d.changed[0].fields.includes('text'));
    K.applyAssumptions(d, store, { signedBy: 'B' });
    d = K.diffAssumptions([], store);
    check('gone from Jama: flagged, never deleted', d.missing.length === 1 && K.applyAssumptions(d, store, { signedBy: 'B' }).flagged === 1 && store.length === 1 && store[0].asmSource.missingInSource === true);
    const fns = [];
    const sd = K.diffSystemFunctions([{ id: 50, key: 'SF-1', name: 'Command elevator', text: 'x' }], fns);
    K.applySystemFunctions(sd, fns, { signedBy: 'B' });
    check('system functions come in flat, funcId = the Jama key', fns.length === 1 && fns[0].funcId === 'SF-1' && fns[0].fnSource.remoteId === 50);
  }
  console.log('\n[kinds] failure conditions fill the FCIM slot and the FHA row');
  {
    const fcim = [], fha = [];
    const fnOf = { 20: '1.1', 21: '1.1', 22: '1.1', 24: '1.1', 25: '1.1', 23: '' };
    const vals = { 20: { severity: 'Catastrophic', phases: 'Takeoff, Cruise', effAc: 'Loss of the aircraft' }, 21: { severity: 'Major' }, 22: { severity: 'CAT' } };
    const ctx = () => ({ fcim, fha, functionOf: it => fnOf[it.id], functionWhy: () => 'its function AF-1.2 is not in Safety Lab yet: apply the functions first', values: it => vals[it.id] || {} });
    const its = [{ id: 20, key: 'FC-1', name: 'Loss of pitch control' }, { id: 21, key: 'FC-2', name: 'Partial loss of pitch control' }, { id: 22, key: 'FC-3', name: 'Erroneous pitch command' }, { id: 23, key: 'FC-4', name: 'Loss of roll' }];
    let d = K.diffFailureConditions(its, ctx());
    check('three staged, the one whose function is not in Safety Lab waits (named)', d.fresh.length === 3 && d.waiting.length === 1 && /apply the functions first/.test(d.waiting[0].why));
    const r = K.applyFailureConditions(d, ctx(), { signedBy: 'B' });
    const row = fcim[0];
    check('one FCIM row for the function, each condition in its slot', fcim.length === 1 && row.subId === '1.1' && row.tlId === 'FC-1' && row.plId === 'FC-2' && row.mId === 'FC-3', JSON.stringify(row));
    const h = fha.find(x => x.fcId === 'FC-1');
    check('and an FHA row each, with the Jama severity, phases and effect', fha.length === 3 && h.severity === 'Catastrophic' && h.phases === 'Takeoff, Cruise' && h.effAc === 'Loss of the aircraft' && h.subId === '1.1' && h.fcSource.remoteId === 20);
    d = K.diffFailureConditions(its, ctx());
    check('a second check: in sync (the waiting one still waiting)', d.fresh.length === 0 && d.changed.length === 0 && d.waiting.length === 1, JSON.stringify(d.changed.map(x => x.fields)));
    its.push({ id: 24, key: 'FC-5', name: 'Partial loss of pitch trim' }, { id: 25, key: 'FC-6', name: 'Loss of pitch, other channel' });
    d = K.diffFailureConditions(its, ctx());
    const r2 = K.applyFailureConditions(d, ctx(), { signedBy: 'B' });
    check('a second partial loss goes in the slot\'s list; a second total loss is refused by name', (row.plExtra || []).some(e => e.id === 'FC-5') && r2.refused.length === 1 && /already has a total loss \(FC-1\)/.test(r2.refused[0]) && !fha.some(x => x.fcId === 'FC-6'), JSON.stringify(r2));
    its[1].name = 'Erroneous pitch trim';   // Jama now calls FC-2 a malfunction
    d = K.diffFailureConditions(its.filter(x => x.id !== 25), ctx());
    check('Jama rewords a partial loss into a malfunction: CHANGED, now a malfunction', d.changed.length === 1 && d.changed[0].fields.some(f => /now a malfunction/.test(f)));
    K.applyFailureConditions(d, ctx(), { signedBy: 'B' });
    check('applied: moved from the partial loss slot to the malfunction list, the FC ID kept', row.plId === '' && (row.mExtra || []).some(e => e.id === 'FC-2'));
    d = K.diffFailureConditions(its.filter(x => x.id !== 22 && x.id !== 25), ctx());
    check('gone from Jama: the FHA row is flagged, never deleted', d.missing.length === 1 && d.missing[0].row.fcId === 'FC-3');
    const n = K.diffFailureConditions([{ id: 26, key: 'FC-7', name: 'Loss of yaw' }], { fcim: [], fha: [], functionOf: () => '1.1', values: () => ({ severity: 'Grave' }), leafCheck: () => 'it is under 1.1, which has functions under it; failure conditions belong to the lowest level' });
    check('notes: a severity Safety Lab does not know, a function that is not the lowest level', n.notes.some(x => /"Grave" is not one Safety Lab knows/.test(x)) && n.notes.some(x => /lowest level/.test(x)));
  }

  // ------------------------------------------------------------------ live_bridge in a page
  console.log('\n[bridge] one connection per project, every kind, aircraft and system');
  function page(J, store, pc) {
    const ctx = {
      console, URL, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {}, navigator: { userAgent: 'test Electron/31' },
      localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
      document: { readyState: 'complete', getElementById: () => null, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, createElement: () => ({}) },
      __slabDesktop: true, slabSecrets: { save: async () => ({ ok: true }) },
      slabBridge: { get: async u => { try { return { ok: true, data: J.get(u) }; } catch (e) { return { ok: false, error: e.message }; } } },
      acFunctionsData: [], acReqData: [], acAssumptionsData: [], acFcimData: [], acFhaData: [], acExtractedFCs: [],
      systemsData: [{ id: 'sys-fcs', name: 'Flight Control System', functions: [], req: [], asm: [], fcim: [], fha: [], extractedFCs: [] }],
      projectConfig: pc, journal: [], newRowId: (() => { let n = 0; return () => 'r' + (++n); })(),
      _pushExtractedFCs: (arr, out) => arr.forEach(d => { ['tl', 'pl', 'm'].forEach(s => { if (d[s + 'Id']) out.push({ id: d[s + 'Id'], desc: d[s + 'Desc'], subId: d.subId }); }); }),
    };
    ctx.window = ctx; ctx.globalThis = ctx; ctx.jrnl = (k, m) => ctx.journal.push([k, m]);
    vm.createContext(ctx);
    for (const f of ['site/func_tree.js', 'site/jama_tree.js', 'site/jama_kinds.js', 'site/live_bridge.js']) vm.runInContext(read(f), ctx, { filename: f });
    ctx._bridgeGet._waitMs = 0;
    return ctx;
  }
  const J = jama();
  const store = { 'safetyLab.bridge.v1': JSON.stringify({ baseUrl: 'https://radia.jamacloud.com', projectId: '77', fnTypes: [T.FUNC], reqTypes: [T.REQ], auto: true }) };
  const pc = {};
  const p = page(J, store, pc);
  const c0 = p.bridgeConfig();
  check('a project with no Jama setting reads the one this computer kept before 22 Oct', c0.baseUrl === 'https://radia.jamacloud.com' && c0.auto === true);
  p.bridgeConfigSave(Object.assign(c0, { asmTypes: [T.ASM], fcTypes: [T.FC], fields: { fc: { severity: 'severity$104', phases: 'phases$104', effAc: 'effac$104' } }, systems: { 'sys-fcs': { id: 2, key: 'F-FCS', name: 'Flight Control System', seq: '2' } }, user: 'brian', token: 'secret' }));
  check('saving moves it into the project: address, project, types, fields, system folder', pc.jamaBridge && pc.jamaBridge.baseUrl === 'https://radia.jamacloud.com' && JSON.stringify(pc.jamaBridge.fcTypes) === '[' + T.FC + ']' && pc.jamaBridge.systems['sys-fcs'].id === 2 && !('safetyLab.bridge.v1' in store));
  check('the login is never in the project or this computer\'s storage; "watch" stays on this computer', !/secret|brian/.test(JSON.stringify(pc)) && !/secret/.test(JSON.stringify(store)) && store['safetyLab.bridge.watch'] === '1' && !('auto' in pc.jamaBridge));
  const d = await p.bridgeCheck(true);
  check('one check stages aircraft functions, requirements, assumptions and failure conditions',
    d.fn && d.fn.fresh.length === 2 && d.req.fresh.length === 1 && d.req.fresh[0].key === 'AR-1' && d.asm.fresh.length === 1 && d.fc, JSON.stringify({ fn: d.fn && d.fn.fresh.length, req: d.req.fresh.map(x => x.key), asm: d.asm && d.asm.fresh.length }));
  check('the aircraft failure conditions wait for their functions (not in Safety Lab yet), by name', d.fc.fresh.length === 0 && d.fc.waiting.length === 4 && d.fc.waiting.every(w => /apply the functions first/.test(w.why)), JSON.stringify(d.fc.waiting.map(w => w.why)));
  const s = d.sys['sys-fcs'];
  check('the system\'s own items are staged for the system, not the aircraft', s && s.fn.fresh.length === 1 && s.fn.fresh[0].item.key === 'SF-1' && s.req.fresh[0].key === 'SR-1' && s.asm.fresh[0].item.key === 'SASM-1' && !d.req.fresh.some(x => x.key === 'SR-1'));
  check('the picklist values were named from Jama (severity, phases)', J.log.some(u => /picklistoptions\/501/.test(u)) && J.log.some(u => /picklistoptions\/601/.test(u)));
  const before = p._bridgePending(d);
  const rf = p.bridgeApply(d, 'Brian', { scope: 'ac', kinds: ['fn'] });
  const d2 = p._bridgeLastDiff();
  check('the Functions page signs only its own changes; the rest stays staged', rf.ok && p.acFunctionsData.length === 2 && p.acReqData.length === 0 && p.systemsData[0].functions.length === 0 && d2 && d2.req.fresh.length === 1, before + ' -> ' + p._bridgePending(d2));
  check('and the failure conditions that waited for those functions are ready now, without another read', d2.fc.fresh.length === 3 && d2.fc.waiting.length === 1 && /Safety Lab cannot tell whether/.test(d2.fc.waiting[0].why), JSON.stringify(d2.fc.waiting.map(w => w.why)));
  const ff = p.bridgeApply(d2, 'Brian', { scope: 'ac', kinds: ['fc'] });
  const row = p.acFcimData.find(r => r.subId === 'AF-1.1');
  const fh = p.acFhaData.find(r => r.fcId === 'FC-1');
  check('the FCIM page signs: FCIM slots filled, FHA rows written with Jama severity and phases, the FHA list refreshed',
    ff.ok && row && row.tlId === 'FC-1' && row.plId === 'FC-2' && row.mId === 'FC-3' && fh.severity === 'Catastrophic' && fh.phases === 'Takeoff, Cruise' && fh.effAc === 'Loss of the aircraft' && p.acExtractedFCs.length === 3,
    JSON.stringify({ row, fh, ex: p.acExtractedFCs.length }));
  const d3 = p._bridgeLastDiff();
  p.bridgeApply(d3, 'Brian', { scope: 'sys-fcs', kinds: ['fn'] });
  const d4 = p._bridgeLastDiff();
  check('a system page signs its functions; its failure condition is then ready under the system function', p.systemsData[0].functions.length === 1 && d4.sys['sys-fcs'].fc.fresh.length === 1 && d4.sys['sys-fcs'].fc.fresh[0].want.subId === 'SF-1');
  p.bridgeApply(d4, 'Brian');
  const S1 = p.systemsData[0];
  check('the full panel signs the rest: system requirement, assumption, FCIM and FHA, and the aircraft requirement and assumption',
    S1.req.length === 1 && S1.req[0].level === 'system' && S1.asm.length === 1 && S1.fcim[0].tlId === 'SFC-1' && S1.fha[0].severity === 'Hazardous' && S1.extractedFCs.length === 1 && p.acReqData.length === 1 && p.acAssumptionsData.length === 1, JSON.stringify(S1));
  check('every apply is in the journal with who signed', p.journal.filter(([k]) => k === 'bridge-sync').length === 4 && p.journal.every(([k, m]) => k !== 'bridge-sync' || /Signed Brian/.test(m)));
  const d5 = await p.bridgeCheck(true);
  check('a fresh check: everything in sync except the condition Safety Lab cannot classify (still waiting, named)', p._bridgePending(d5) === 0 && d5.fc.waiting.length === 1, String(p._bridgePending(d5)));
  J.items.get(20).fields['severity$104'] = 503; J.items.get(20).modifiedDate = '2026-10-22T10:00:00.000+0000';
  const d6 = await p.bridgeCheck(true);
  check('Jama changes a severity: CHANGED on the FHA side, nothing else', p._bridgePending(d6) === 1 && d6.fc.changed.length === 1 && /severity Catastrophic is now Hazardous/.test(d6.fc.changed[0].fields.join()));

  console.log('\n[pages] a panel on each page, one connection dialog');
  {
    const lb = read('site/live_bridge.js');
    const tables = ['ac-func-table', 'ac-fcim-table', 'ac-fha-table', 'ac-asm-table', 'ac-req-table', 'sys-func-table', 'sys-fcim-table', 'sys-fha-table', 'sys-asm-table', 'sys-req-table'];
    check('the ten pages (aircraft and system: Functions, FCIM, Hazard assessment, Assumptions, Requirements) each get a panel', tables.every(t => lb.indexOf("table: '" + t + "'") > 0));
    const idx = read('site/index.html');
    check('every one of those tables is on a page', tables.every(t => idx.indexOf('<table id="' + t + '"') > 0));
    check('a page panel signs for that page only', /bridgeApply\(_lastDiff, by, p \? \{ scope: _scopeOf\(p\), kinds: p\.kinds \} : null\)/.test(lb));
    check('the connection form exists once, in one dialog (no second copy of the login boxes)', (lb.match(/id="lb-token"/g) || []).length === 1 && /id = 'jb-setup'/.test(lb));
    check('a system page asks which Jama folder holds that system, and one folder cannot hold two systems', /Choose the Jama folder or set that holds/.test(lb) && /already holds/.test(lb));
    check('item type names are kept, so no panel says "type 89001"', /cfg\.typeNames = \{\}/.test(lb) && /\(cfg\.typeNames \|\| \{\}\)\[id\]/.test(lb));
    check('until a system has its Jama folder, every aircraft panel and the full panel say its items would come in at aircraft level', /function _unassignedSystems\(cfg\)/.test(lb) && /comes in here, at aircraft level/.test(lb) && /if \(loose\.length\) warnings\.push\(_looseText\(loose\)\)/.test(lb) && /const loose = p\.scope === 'ac' \? _unassignedSystems\(cfg\) : \[\]/.test(lb));
    check('read-only: the bridge only ever GETs', !/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(lb));
    check('index.html loads jama_kinds.js between jama_tree.js and live_bridge.js', /jama_tree\.js\?v=1\.2[\s\S]*jama_kinds\.js\?v=1\.0[\s\S]*live_bridge\.js\?v=3\.0/.test(idx));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

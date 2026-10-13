#!/usr/bin/env node
/*
 * Regression: Safety Lab's model is a real SysML v2 model, with import and export, validated (13 Oct 2026).
 *
 * FOUND. Nothing in Safety Lab exported as SysML or SysML v2 (12 Oct diagram audit): fault trees went out as
 * CSV and pictures, the only model import was a narrow XMI socket (blocks and activities), and no Safety Lab
 * element had a model identity or a typed link to the system element it is about (events could point at an
 * item in the data, with no screen to set it). OMG adopted SysML v2.0 on 21 July 2025; RAAML (OMG's safety
 * profile) exists only for SysML v1.
 *
 * FIX. site/sysml_model.js (SLSysML) + site/sysml_safety_lib.sysml, the open SafetyLab SysML v2 library
 * modeled on RAAML's concepts:
 *   - a model index: every element (functions, systems, items, resources, interfaces, zones, failure
 *     conditions, FHA rows, requirements, fault tree pages, gates and events, CCF groups, CMA/PRA, FMEA,
 *     STPA, bow-tie barriers, event tree headings and outcomes, RBD blocks, Markov states and transitions,
 *     crew tasks and members, maintenance tasks) gets a ref, a qualified name and a name-based element id,
 *     and typed links read from the existing link fields (realizedByItemId, traceIds, linkedFhaIds,
 *     linkedFcId, beId, providedBy, consumedBySystems, linkedPageId, markovModelId, ccfGroup ...) plus the
 *     general sysmlRef;
 *   - export as SysML v2 text importing SafetyLab, checked by two independent validators;
 *   - import of SysML v2 text from Safety Lab, Sys Lab and Cameo-style tools: preview, match by id then
 *     name, never delete, list what is not brought in;
 *   - "Export SysML v2" / "Import SysML v2" in every Data Actions menu and the Project menu, and a
 *     "Model element" link field (SLSysML.linkPicker / refLabel) in the fault tree node drawer.
 *
 * EXECUTED. Real site files in vm: sysml_model.js and the six showcase demo builders (demo_kit.js +
 * demo_showcase*.js), reqif_import.js + xmi_import.js for the XMI check, crdt_sync.js for the sync check.
 * The validators are the same two Sys Lab uses (sysml-validate 0.46.0, OpenMBEE opensysml 0.9.2): installed
 * in tools/sysml (npm install), or found through SL_SYSML_VALIDATORS or the sibling Sys Lab checkout. When
 * neither is installed the validator checks print SKIP loudly; every other check still runs.
 * Expected values are independent: counts walk the demo data directly, the SHA-1 / UUID v5 vectors are the
 * published ones, and mutation proofs show each check can fail.
 *
 * Run: node tests/regression_sysml_v2_20261013b.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0, skips = [];
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' -- ' + String(d).slice(0, 600) : '')); } };
const REPO = path.join(__dirname, '..'), SITE = path.join(REPO, 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-sysml-'));

// ---------------------------------------------------------------- load the module
function loadSysml() {
  const ctx = { console, TextEncoder, TextDecoder, Uint8Array };
  vm.createContext(ctx);
  vm.runInContext(S('sysml_model.js'), ctx, { filename: 'sysml_model.js' });
  return ctx.SLSysML;
}
const SL = loadSysml(), C = SL.core;
// ---------------------------------------------------------------- the six showcase demos, built by their own code
const DEMOS = { K350: ['demo_showcase.js', 'SL_SHOWCASE'], HALCYON: ['demo_showcase_halcyon.js', 'SL_SHOWCASE_HALCYON'], HL1: ['demo_showcase_hl1.js', 'SL_SHOWCASE_HL1'],
  KESTREL25: ['demo_showcase_kestrel25.js', 'SL_SHOWCASE_KESTREL25'], SORA: ['demo_showcase_sora.js', 'SL_SHOWCASE_SORA'], VAYU: ['demo_showcase_vayu.js', 'SL_SHOWCASE_VAYU'] };
function buildDemo(k) {
  const [f, g] = DEMOS[k];
  const ctx = { window: { addEventListener() {}, removeEventListener() {} }, console: { log() {}, warn() {}, error() {} } };
  vm.createContext(ctx);
  vm.runInContext(S('demo_kit.js'), ctx); ctx.slDemoMirror = ctx.window.slDemoMirror;
  vm.runInContext(S(f), ctx);
  const P = JSON.parse(JSON.stringify(ctx.window[g].build()));
  P.projectConfig.sysml = { ns: '11111111-2222-4333-8444-555555555555' };
  return P;
}
const demo = {}; Object.keys(DEMOS).forEach(k => { try { demo[k] = buildDemo(k); } catch (e) { check('demo ' + k + ' builds', false, e.message); } });
check('all six showcase demos build for the SysML checks', Object.keys(demo).length === 6, Object.keys(demo).join(','));
const emptyProject = () => ({ projectName: 'Untitled Project', acFunctionsData: [], acFcimData: [], acFhaData: [], acReqData: [], acAssumptionsData: [], systemsData: [], praData: [], zsaData: [], cmaData: [], routingData: [], resourcesData: [], fmeaData: [], itemsData: [],
  stpaData: { cs: { controllers: [], processes: [], actions: [], feedbacks: [], others: [], precedence: [] }, dispositions: {}, causeDismissals: {}, scopeFcIds: [], meta: { mission: '', scope: '', boundary: '', abstractionLevel: '' }, losses: [], hazards: [], constraints: [], responsibilities: [], csState: 'initial', sip: {} },
  ftaPages: [{ id: 'page-1', name: 'Untitled Fault Tree', root: null }], activeFTAPageId: 'page-1', internalIdCounter: 1, projectConfig: { regulation: 'Part 25', markovModels: [], interfaces: [], customLibrary: {} } });
let idn = 0; const newId = () => 'n' + (idn++);

// The kinds the demos do not carry (STPA, crew tasks, RBDs, a functional interface, sysmlRef, awkward names).
function rich(P) {
  P.stpaData = { cs: { controllers: [{ id: 'crew', name: 'Crew', kind: 'human', authority: 1, desc: 'flight crew', sysmlRef: 'sys:' + P.systemsData[0].id },
      { id: 'fcs', name: 'FCS', kind: 'automation', authority: 2, desc: 'control computer', processModel: ['sensed load', 'surface position'], controlAlgorithm: 'Gust load alleviation law: deflect against sensed load' }],
    processes: [{ id: 'surf', name: 'Surfaces', desc: 'control surfaces', sysmlRef: 'item:' + P.itemsData[0].internalId }],
    actions: [{ id: 'a1', from: 'crew', to: 'surf', name: 'manual cmd' }, { id: 'a2', from: 'fcs', to: 'surf', name: 'auto cmd' }, { id: 'a3', from: 'fcs', to: 'act1', name: 'servo cmd' }],
    feedbacks: [{ id: 'f1', from: 'surf', to: 'fcs', name: 'position' }, { id: 'f2', from: 'sen1', to: 'fcs', name: 'load signal' }], others: [{ id: 'o1', from: 'surf', to: 'crew', name: 'aural cue' }, { id: 'd1', from: 'gust', to: 'surf', name: 'turbulence', type: 'disturbance' }], precedence: [],
    // 13 Oct 2026 (STPA control structure build): the Handbook's actuators, sensors and external elements, their links, a control algorithm
    actuators: [{ id: 'act1', name: 'Elevator actuator', desc: 'electro-hydraulic' }], sensors: [{ id: 'sen1', name: 'Load sensor', sysmlRef: 'sys:' + P.systemsData[1].id }], externals: [{ id: 'gust', name: 'Atmosphere', desc: 'gusts and turbulence' }],
    actuations: [{ id: 'u1', from: 'act1', to: 'surf' }], measurements: [{ id: 'm1', from: 'surf', to: 'sen1', name: 'strain' }] },
    dispositions: { 'a1:np': { status: 'assessed', context: 'gust with the autopilot off', hazardIds: ['H-1'], hazard: 'Load exceedance', bridge: { declared: true, ftaRefs: [], fmeaRefs: [] } }, 'a2:wt': { status: 'dismissed', rationale: 'Timing is enforced by the scheduler' } },
    causeDismissals: {}, scopeFcIds: [], meta: { mission: 'm', scope: 's', boundary: 'b', abstractionLevel: 'system' },
    losses: [{ id: 'L-1', name: 'Loss of life', desc: 'occupants' }], hazards: [{ id: 'H-1', name: 'Structural overload', lossIds: ['L-1'], group: 'Loads', fromFcId: P.acFhaData[0].fcId }],
    constraints: [{ id: 'SC-1', text: 'The FCS shall limit loads in gusts.', hazardIds: ['H-1'] }], responsibilities: [], csState: 'initial', sip: {} };
  const pg = P.ftaPages.find(p => p.root && p.root.children && p.root.children.length);
  pg.root.sysmlRef = 'sys:' + P.systemsData[0].id;
  pg.root.children[0].name = "Pilot's \\ brake 'pedal' */ \"quoted\" part";
  P.stpaData.dispositions['a1:np'].bridge.ftaRefs = [pg.root.children[0].displayId];
  P.projectConfig.hf = { tasks: { rows: [{ taskId: 'TASK-001', phase: 'Approach', crewmember: 'PF', task: 'Recognize the alert and disconnect the autopilot', reactionS: 1.5, execS: 2, timeS: 3.5, basis: 'Simulator', channels: 'visual, motor', notes: 'line 1\nline 2', asmId: P.acAssumptionsData[0].asmId },
                                    { taskId: 'TASK-002', phase: 'Cruise', crewmember: 'PM', task: 'Monitor', reactionS: '', execS: '', timeS: '', basis: '', channels: '', notes: '', asmId: '' }] } };
  P.projectConfig.rbd = { models: [{ id: 'RBD-1', name: 'Pitch channel', dsl: 'series(block(FCC 1, 2e-5), parallel(block(Lane A, 1e-4), block(Lane B, 1e-4)))', fromPage: null, blockRefs: { 'FCC 1': 'item:' + P.itemsData[0].internalId } },
                                   { id: 'RBD-2', name: 'Dual of page', dsl: null, fromPage: pg.id }] };
  P.projectConfig.interfaces = (P.projectConfig.interfaces || []).concat([{ fromSystemId: P.systemsData[0].id, toSystemId: P.systemsData[1].id, kind: 'functional', direction: 'a_to_b', medium: 'ARINC 429', icdRef: 'ICD-X-1', fromFuncId: P.acFunctionsData[0].subId, toFuncId: P.acFunctionsData[1].subId }]);
  P.itemsData.push({ internalId: 999001, itemId: 'part', name: 'part', type: 'LRU', dal: 'C', daType: 'Hardware', owningSystemId: P.systemsData[0].id, description: 'a SysML keyword as a name', traceIds: [] });
  P.itemsData.push({ internalId: 999002, itemId: 'LRU-DUP', name: 'Contrôler la gouverne', type: 'LRU', dal: '', daType: '', owningSystemId: '', description: '', traceIds: [] });
  P.itemsData.push({ internalId: 999003, itemId: 'LRU-DUP', name: 'Contrôler la gouverne', type: 'LRU', dal: '', daType: '', owningSystemId: '', description: '', traceIds: [] });
  return P;
}
const RICH = rich(buildDemo('HL1'));

// ---------------------------------------------------------------- [1] the library
console.log('\n[1] the open SafetyLab library');
const LIB = S('sysml_safety_lib.sysml');
check('the library file and the text embedded in sysml_model.js are byte-identical', C.LIBRARY_TEXT === LIB);
['FailureCondition', 'FhaEntry', 'FaultTree', 'Gate', 'Event', 'CommonCauseGroup', 'FailureMode', 'FailureEffect', 'Controller', 'ControlledProcess', 'ControlAction', 'Feedback', 'UnsafeControlAction', 'Hazard', 'Loss', 'SafetyConstraint', 'Barrier', 'EventTree', 'EventTreeHeading', 'EventTreeOutcome', 'ReliabilityBlockDiagram', 'RbdBlock', 'MarkovModel', 'MarkovState', 'CrewTask', 'CrewMember', 'MaintenanceTask', 'System', 'Item', 'SharedResource', 'SystemInterface', 'Zone']
  .forEach(d => check('the library defines ' + d, new RegExp('\\b(part|action|requirement|state|connection) def ' + d + '\\b').test(LIB)));
['Severity', 'GateKind', 'EventKind', 'GuideWord', 'ControllerKind', 'BarrierSide', 'FailureConditionKind'].forEach(d => check('the library enumerates ' + d, new RegExp('enum def ' + d + '\\b').test(LIB)));
check('the gate kinds include the sequence-enforcing and NOT gates (IEC 61025 complete)', /enum sequenceEnforcingGate;/.test(LIB) && /enum notGate;/.test(LIB));
check('the library is a library package named SafetyLab, and cites RAAML and the SysML v2 STPA precedent', /^library package SafetyLab \{/m.test(LIB) && /RAAML/.test(LIB) && /Ahlbrecht/.test(LIB));
check('no em dashes in the library or the module', !/[—–]/.test(LIB) && !/[—–]/.test(S('sysml_model.js')));

// ---------------------------------------------------------------- [2] independent checks of the identity math
console.log('\n[2] element ids: SHA-1 and UUID v5 against the published vectors');
const hex = u8 => Array.from(u8).map(b => (b < 16 ? '0' : '') + b.toString(16)).join('');
check('SHA-1("abc") is the FIPS 180 vector', hex(C.sha1(new TextEncoder().encode('abc'))) === 'a9993e364706816aba3e25717850c26c9cd0d89d');
check('SHA-1 of a 1,000-byte message (multi-block) matches Node crypto', hex(C.sha1(new TextEncoder().encode('x'.repeat(1000)))) === require('crypto').createHash('sha1').update('x'.repeat(1000)).digest('hex'));
check('UUID v5 (DNS namespace, "python.org") is the RFC 4122 / Python vector', C.uuid5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'python.org') === '886313e1-3b8a-5372-9b90-0c9aee199e5d');

// ---------------------------------------------------------------- [3] the model index
console.log('\n[3] the model index covers every element, with typed links');
{
  const P = demo.HL1, ix = C.index(P), by = k => ix.filter(x => x.kind === k).length;
  let nodes = 0; P.ftaPages.forEach(pg => (function w(n) { if (!n) return; nodes++; (n.children || []).forEach(w); })(pg.root));
  const sysFn = P.systemsData.reduce((a, s) => a + (s.functions || []).length, 0), sysFha = P.systemsData.reduce((a, s) => a + (s.fha || []).length, 0), sysReq = P.systemsData.reduce((a, s) => a + (s.req || []).length, 0);
  check('one index entry per system / item / resource / zone', by('sys') === P.systemsData.length && by('item') === P.itemsData.length && by('res') === P.resourcesData.length && by('zone') === P.zsaData.length, [by('sys'), by('item'), by('res'), by('zone')].join('/'));
  check('one per aircraft function row and system function', by('fn') === P.acFunctionsData.length && by('sfn') === sysFn, by('fn') + '/' + by('sfn'));
  check('one per FHA row, aircraft and system', by('fha') === P.acFhaData.length && by('sfha') === sysFha);
  check('one per requirement, aircraft and system', by('req') === P.acReqData.length && by('sreq') === sysReq);
  check('one per fault tree page and per gate or event (walked independently)', by('ft') === P.ftaPages.filter(p => p.root).length && by('ftn') === nodes, by('ftn') + ' vs ' + nodes);
  check('one per FMEA row, CMA row and particular risk', by('fmea') === P.fmeaData.length && by('cma') === P.cmaData.length && by('pra') === P.praData.length);
  const et = P.projectConfig.eventTrees[0], bt = P.projectConfig.bowties[0], mk = P.projectConfig.markovModels[0];
  check('event tree headings and outcomes, bow-tie barriers, Markov states and transitions are elements',
    by('eth') === et.barriers.length && by('eto') === Object.keys(et.consequences).length && by('btb') === bt.barriers.length && by('mks') === mk.states.length && by('mkt') === mk.transitions.length);
  const ids = new Set(ix.map(x => x.elementId));
  check('every element id is a UUID v5 and unique', ix.every(x => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x.elementId)) && ids.size === ix.length);
  check('the element id is the UUID v5 of the ref under the project namespace (independent recomputation)', ix.every(x => x.elementId === C.uuid5('11111111-2222-4333-8444-555555555555', x.ref)));
  // realizedByItemId is carried as an item number (K350) or an item ID (Kestrel 25): both resolve
  ['K350', 'KESTREL25', 'SORA'].forEach(dk => {
    const D = demo[dk], dix = C.index(D);
    const all = []; D.ftaPages.forEach(pg => (function w(n) { if (!n) return; if (n.realizedByItemId != null && n.realizedByItemId !== '') all.push([pg, n]); (n.children || []).forEach(w); })(pg.root));
    const ok = all.every(([pg, n]) => { const it = D.itemsData.find(i => String(i.internalId) === String(n.realizedByItemId) || i.itemId === n.realizedByItemId); const ent = dix.find(x => x.ref === 'ftn:' + pg.id + '/' + n.id); return it && ent && ent.links.some(l => l.meta === 'RealizedBy' && l.to === 'item:' + it.internalId); });
    check(dk + ': every realizedByItemId (' + all.length + ') becomes a typed RealizedBy link to its item', all.length > 0 && ok);
  });
  const fm = P.fmeaData.find(r => r.beId != null && r.beId !== '');
  const fmEnt = ix.find(x => x.ref === 'fmea:' + fm.internalId);
  check('an FMEA row links to its basic event (beId) and its FHA row (linkedFcId)', fmEnt.links.some(l => l.meta === 'TracesTo' && /^ftn:/.test(l.to) && l.to.endsWith('/' + fm.beId)) &&
    (!fm.linkedFcId || fmEnt.links.some(l => l.meta === 'ContributesTo' && l.to === 'fha:' + fm.linkedFcId)));
  const rq = P.acReqData.find(r => r.traceId);
  check('a requirement links to the failure condition it mitigates (traceId)', ix.find(x => x.ref === 'req:' + rq.internalId).links.some(l => l.meta === 'Mitigates' && l.to === 'fc:' + rq.traceId));
  const res = P.resourcesData[0], rEnt = ix.find(x => x.ref === 'res:' + res.internalId);
  check('a shared resource links to the systems that provide and consume it', res.providedBy.every(s => rEnt.links.some(l => l.meta === 'ProvidedBy' && l.to === 'sys:' + s)) && res.consumedBySystems.every(s => rEnt.links.some(l => l.meta === 'ConsumedBy' && l.to === 'sys:' + s)));
  const pg = P.ftaPages.find(p => p.root && (p.linkedFhaIds || []).length);
  check('a fault tree page links to the FHA rows it analyzes (linkedFhaIds)', ix.find(x => x.ref === 'ft:' + pg.id).links.filter(l => l.meta === 'Analyzes').length === pg.linkedFhaIds.length);
  const R2 = C.index(RICH);
  check('sysmlRef on a fault tree node, an STPA controller and a process becomes an About link', R2.find(x => x.ref.startsWith('ftn:') && x.links.some(l => l.meta === 'About' && l.to.startsWith('sys:'))) && R2.find(x => x.ref === 'stpa.ctl:crew').links.some(l => l.meta === 'About') && R2.find(x => x.ref === 'stpa.proc:surf').links.some(l => l.meta === 'About' && l.to.startsWith('item:')));
  check('STPA control actions, feedback, UCAs, hazards and losses are elements', ['stpa.ca:a1', 'stpa.fb:f1', 'stpa.oth:o1', 'stpa.uca:a1:np', 'stpa.haz:H-1', 'stpa.loss:L-1', 'stpa.sc:SC-1'].every(r => R2.some(x => x.ref === r)));
  check('crew tasks and members, RBD blocks are elements', ['hf.task:TASK-001', 'hf.actor:PF', 'rbdb:RBD-1/FCC 1', 'rbdb:RBD-1/Lane A'].every(r => R2.some(x => x.ref === r)));
  const archOnly = C.indexAreas(P, ['architecture']);
  check('an area index builds only that area (what the picker shows), not the fault trees', archOnly.length > 0 && archOnly.every(x => C.areaOfKind(x.kind) === 'architecture'));
}

// ---------------------------------------------------------------- [4] export: every demo validates
console.log('\n[4] every export parses and links cleanly in two independent SysML v2 validators');
const VDIRS = [process.env.SL_SYSML_VALIDATORS, path.join(REPO, 'tools/sysml'), path.join(REPO, '..', 'syslab', 'tools', 'sysml'), path.join(REPO, '..', 'sys-lab', 'tools', 'sysml')].filter(Boolean);
const VD = VDIRS.find(d => fs.existsSync(path.join(d, 'node_modules/.bin/sysml-validate')) && fs.existsSync(path.join(d, 'node_modules/@openmbee/opensysml')));
const OMB = path.join(REPO, 'tools/sysml/openmbee-check.mjs');
// sysml-validate: each file is checked with the library beside it, several at once (one process per core).
function sysmlValidate(files, lib) {   // -> { file: [blocking diagnostics] }
  const bin = path.join(VD, 'node_modules/.bin/sysml-validate');
  const runner = "const cp=require('child_process'),os=require('os');const [bin,lib,...files]=process.argv.slice(1);const out={};let i=0,live=0;const n=Math.max(2,os.cpus().length);" +
    "function next(){if(i>=files.length){if(!live){process.stdout.write(JSON.stringify(out));}return;}const f=files[i++];live++;const args=(lib&&lib!==f?[lib,f]:[f]).concat(['--format','json']);" +
    "cp.execFile(bin,args,{maxBuffer:1<<28,timeout:280000},(e,so,se)=>{live--;out[f]={stdout:so,stderr:se,code:e?e.code:0};next();});}for(let k=0;k<n;k++)next();";
  const r = cp.spawnSync('node', ['-e', runner, bin, lib || '', ...files], { encoding: 'utf8', timeout: 290000, maxBuffer: 1 << 28 });
  let all; try { all = JSON.parse(r.stdout); } catch (e) { return { __error: 'sysml-validate runner gave no report: ' + String(r.stdout + r.stderr).slice(0, 300) }; }
  const out = {};
  files.forEach(f => {
    out[f] = [];
    let rep; try { rep = JSON.parse(all[f].stdout); } catch (e) { out[f].push('no report: ' + String(all[f] && (all[f].stdout + all[f].stderr)).slice(0, 200)); return; }
    (rep.diagnostics || []).forEach(d => { if (/error|warn/i.test(d.severity || '') && (path.basename(d.file) === path.basename(f))) out[f].push(d.code + ' ' + d.message + ' @' + (d.range && d.range.start.line)); });
    if (all[f].code && !out[f].length) out[f].push('exit ' + all[f].code);
  });
  return out;
}
function openmbee(files) {   // each file must hold the library too (the service parses one file at a time)
  // the checker must sit beside the validators' node_modules to find them; a copy elsewhere is removed again
  const own = path.resolve(VD) === path.resolve(path.dirname(OMB)), mjs = own ? OMB : path.join(VD, '_sl_openmbee_check.mjs');
  if (!own) fs.copyFileSync(OMB, mjs);
  const r = cp.spawnSync('node', [mjs, ...files], { encoding: 'utf8', timeout: 240000, cwd: VD, maxBuffer: 1 << 28 });
  if (!own) { try { fs.unlinkSync(mjs); } catch (_) {} }
  const out = {};
  String(r.stdout).trim().split('\n').filter(Boolean).forEach(l => { try { const j = JSON.parse(l); out[j.file] = j.diagnostics.filter(d => /error|warn/i.test(d.severity || '')).map(d => d.code + ' ' + d.message + ' @' + d.startLine); } catch (_) {} });
  files.forEach(f => { if (!out[f]) out[f] = ['no report: ' + String(r.stderr).slice(0, 200)]; });
  return out;
}
const outs = {};
Object.keys(demo).forEach(k => { outs[k] = C.exportText(demo[k], { at: '2026-10-13' }); });
outs.RICH = C.exportText(RICH, { at: '2026-10-13' });
Object.keys(outs).forEach(k => check(k + ': the export has every link resolved inside the file (no dangling targets but the two the demo itself leaves dangling)', outs[k].dangling <= 2, outs[k].dangling));
const libFile = path.join(tmp, 'SafetyLab.sysml'); fs.writeFileSync(libFile, LIB);
const modelFiles = {}, bothFiles = {};
Object.keys(outs).forEach(k => { modelFiles[k] = path.join(tmp, k + '.sysml'); fs.writeFileSync(modelFiles[k], outs[k].text); bothFiles[k] = path.join(tmp, k + '_with_library.sysml'); fs.writeFileSync(bothFiles[k], LIB + '\n' + outs[k].text); });
const brokenA = path.join(tmp, 'broken.sysml');
fs.writeFileSync(brokenA, outs.KESTREL25.text.replace('#Analyzes dependency', '#AnalyzesX dependency').replace(': SafetyLab::Gate {', ': SafetyLab::GateX {'));
const brokenB = path.join(tmp, 'broken_with_library.sysml'); fs.writeFileSync(brokenB, LIB + '\n' + fs.readFileSync(brokenA, 'utf8'));
if (!VD) {
  skips.push('SysML v2 validators not installed: run npm install in tools/sysml (or set SL_SYSML_VALIDATORS). The validator checks below were NOT run.');
  console.log('  SKIP  ' + skips[skips.length - 1]);
} else {
  console.log('  (validators from ' + VD + ')'); const T4 = Date.now(); process.on('exit', () => {}); global.__T4 = T4;
  const sv = sysmlValidate([libFile, ...Object.values(modelFiles)], libFile);
  check('sysml-validate: the SafetyLab library is clean', !sv.__error && sv[libFile].length === 0, sv.__error || JSON.stringify(sv[libFile]));
  Object.keys(modelFiles).forEach(k => check('sysml-validate: ' + k + ' export (with the library beside it) parses and links cleanly', sv[modelFiles[k]] && sv[modelFiles[k]].length === 0, JSON.stringify(sv[modelFiles[k]]).slice(0, 400)));
  const om = openmbee(Object.values(bothFiles));
  Object.keys(bothFiles).forEach(k => check('OpenMBEE: ' + k + ' export with the library parses and links cleanly', om[bothFiles[k]].length === 0, JSON.stringify(om[bothFiles[k]]).slice(0, 400)));
  // mutation proof: both validators see a broken reference
  const svb = sysmlValidate([brokenA], libFile), omb = openmbee([brokenB]);
  check('mutation: sysml-validate catches an unknown library type and an unknown link kind', (svb[brokenA] || []).length >= 2, JSON.stringify(svb[brokenA]));
  check('mutation: OpenMBEE catches them too', (omb[brokenB] || []).length >= 1, JSON.stringify(omb[brokenB]));
  // the fixtures we read are themselves valid SysML v2 (so the import is tested on real SysML)
  const fx = ['sysml_v2_cameo_style.sysml', 'sysml_v2_syslab_example.sysml'].map(f => path.join(__dirname, 'fixtures', f));
  const svf = sysmlValidate(fx, null), omf = openmbee(fx);
  fx.forEach(f => check('the import fixture ' + path.basename(f) + ' is valid SysML v2 in both validators', svf[f] && svf[f].length === 0 && omf[f].length === 0, JSON.stringify([svf[f], omf[f]]).slice(0, 300)));
}

if (global.__T4) console.log('  (validators: ' + Math.round((Date.now() - global.__T4) / 1000) + ' s)');
// ---------------------------------------------------------------- [5] round trip
console.log('\n[5] export, import into an empty project, export again: the same model');
Object.keys(outs).forEach(k => {
  const Q = emptyProject(), plan = C.planImport(Q, [{ name: k + '.sysml', text: outs[k].text }, { name: 'SafetyLab.sysml', text: LIB }]);
  const made = C.applyImport(Q, plan, { newId });
  const again = C.exportText(Q, { at: '2026-10-13' }).text;
  check(k + ': byte-identical after the round trip (' + made.added + ' elements added)', again === outs[k].text && made.added > 100,
    (() => { const a = outs[k].text.split('\n'), b = again.split('\n'); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return 'line ' + (i + 1) + ': ' + a[i] + ' | ' + b[i]; return 'length'; })());
  check(k + ': nothing is left unmapped or noted, and the project takes the file name', plan.unmapped.length === 0 && plan.notes.length === 0 && Q.projectName === (k === 'RICH' ? demo.HL1.projectName : demo[k].projectName), JSON.stringify([plan.unmapped.slice(0, 3), plan.notes.slice(0, 3)]));
  const p2 = C.planImport(Q, [{ name: 'again', text: again }]);
  check(k + ': a second import of the same file adds and changes nothing', p2.adds.length === 0 && p2.changes.length === 0, p2.adds.length + '/' + p2.changes.length);
});
{
  const P = demo.HL1, pl = C.planImport(P, [{ name: 'self', text: outs.HL1.text }]);
  check('importing a project\'s own export into itself: nothing to add, nothing to change', pl.adds.length === 0 && pl.changes.length === 0 && pl.kept > 500, pl.adds.length + '/' + pl.changes.length + '/' + pl.kept);
  // the existing link fields come back as they were
  const Q = emptyProject(); C.applyImport(Q, C.planImport(Q, [{ name: 'a', text: outs.RICH.text }]), { newId });
  const nodesOf = X => { const m = {}; X.ftaPages.forEach(pg => (function w(n) { if (!n) return; m[pg.id + '/' + n.id] = n; (n.children || []).forEach(w); })(pg.root)); return m; };
  const A = nodesOf(RICH), B = nodesOf(Q);
  const fields = ['realizedByItemId', 'linkedPageId', 'markovModelId', 'ccfGroup', 'beta', 'sysmlRef', 'gateType', 'type', 'displayId', 'logicalId', 'votingK', 'lambda', 'inputMode', 'name'];
  const norm = (n, f) => { const v = n[f]; if (f === 'lambda' && n.type !== 'gate' && (v === undefined || v === null)) return 0; return v === undefined ? null : v; };   // an event with no rate reads back with the editor's default rate 0
  const bad = Object.keys(A).filter(k => !B[k] || fields.some(f => JSON.stringify(norm(A[k], f)) !== JSON.stringify(norm(B[k], f))));
  check('every fault tree node keeps its link fields, kind and inputs through the round trip', bad.length === 0, bad.slice(0, 3).map(k => JSON.stringify([A[k], B[k] && Object.assign({}, B[k], { children: undefined })])).join(' '));
  const fmA = RICH.fmeaData.map(r => [r.fmeaId, r.beId, r.linkedFcId, r.funcSubId, r.owningSystemId].join('|')), fmB = Q.fmeaData.map(r => [r.fmeaId, r.beId, r.linkedFcId, r.funcSubId, r.owningSystemId].join('|'));
  check('FMEA rows keep beId, linkedFcId, funcSubId and owningSystemId', JSON.stringify(fmA) === JSON.stringify(fmB), fmA.find((x, i) => x !== fmB[i]));
  const byIid = (list, f) => { const m = {}; list.forEach(r => { m[r.internalId] = JSON.stringify(f(r)); }); return m; };
  const rA = byIid(RICH.resourcesData, r => [r.providedBy, r.consumedBySystems, r.consumedBy]), rB = byIid(Q.resourcesData, r => [r.providedBy, r.consumedBySystems, r.consumedBy]);
  const iA = byIid(RICH.itemsData, i => [i.itemId, i.owningSystemId, i.traceIds, i.dal]), iB = byIid(Q.itemsData, i => [i.itemId, i.owningSystemId, i.traceIds, i.dal]);
  check('resources keep providedBy / consumedBySystems / consumedBy; items keep their system, traceIds and DAL (matched by item number)', JSON.stringify(rA) === JSON.stringify(rB) && Object.keys(iA).every(k => iA[k] === iB[k]) && Object.keys(iA).length === Object.keys(iB).length,
    Object.keys(iA).filter(k => iA[k] !== iB[k]).slice(0, 2).map(k => iA[k] + ' vs ' + iB[k]).join('; '));
  check('STPA comes back whole: the controller kinds, ranks, process models, edges, UCA dispositions and bridge', JSON.stringify(Q.stpaData.cs.controllers) === JSON.stringify(RICH.stpaData.cs.controllers) && JSON.stringify(Q.stpaData.cs.actions) === JSON.stringify(RICH.stpaData.cs.actions) &&
    Q.stpaData.dispositions['a1:np'].context === 'gust with the autopilot off' && JSON.stringify(Q.stpaData.dispositions['a1:np'].hazardIds) === '["H-1"]' && Q.stpaData.dispositions['a1:np'].bridge.ftaRefs.length === 1 && Q.stpaData.dispositions['a2:wt'].rationale === 'Timing is enforced by the scheduler');
  check('the awkward node name (quotes, backslash, comment end, accents) reads back exactly', Object.values(B).some(n => n.name === "Pilot's \\ brake 'pedal' */ \"quoted\" part") && Q.itemsData.filter(i => i.name === 'Contrôler la gouverne').length === 2 && Q.itemsData.some(i => i.name === 'part'));
  check('the project keeps the file\'s SysML namespace, so the element ids stay the same', Q.projectConfig.sysml.ns === '11111111-2222-4333-8444-555555555555');
  // mutation proof: a changed field in the file is found and applied, nothing else moves
  const edited = outs.HL1.text.replace(/(part <'LRU-FCS-01'> 'Elevator actuation lane A' : SafetyLab::Item \{[\s\S]*?:>> dal = )"A";/, '$1"B";');
  const P2 = buildDemo('HL1'), pl2 = C.planImport(P2, [{ name: 'edited', text: edited }]);
  check('mutation: a DAL changed in the file shows as one change to that item, and applying it updates only that', edited !== outs.HL1.text && pl2.changes.length === 1 && pl2.changes[0].fields.join() === 'dal' && pl2.adds.length === 0 &&
    (C.applyImport(P2, pl2, { newId }), P2.itemsData.find(i => i.itemId === 'LRU-FCS-01').dal === 'B' && P2.itemsData.length === demo.HL1.itemsData.length), JSON.stringify(pl2.changes));
  // a link added in another tool (here: a basic event realized by an item) is previewed and applied, additively
  const P4 = buildDemo('HL1'), withLink = outs.HL1.text.replace(/(    package Links \{\n)/, "$1        #RealizedBy dependency from 'FaultTrees'::'pg-fcs-pitch'::'G-7070'::'G-7068'::'BE-7066' to 'Architecture'::'sys-fcs'::'LRU-FCS-03';\n");
  const pv = C.previewImport(P4, [{ name: 'linked', text: withLink }]);
  check('a link added in another tool shows in the preview as a change to that event (realizedByItemId)', withLink !== outs.HL1.text && pv.adds.length === 0 && pv.changes.length === 1 && pv.changes[0].key === 'ftn:pg-fcs-pitch/7066' && pv.changes[0].fields.join() === 'realizedByItemId', JSON.stringify(pv.changes));
  const before = JSON.stringify(P4);
  check('the preview does not touch the project', JSON.stringify(P4) === before && C.previewImport(P4, [{ name: 'self', text: outs.HL1.text }]).changes.length === 0);
  const mk4 = C.applyImport(P4, C.planImport(P4, [{ name: 'linked', text: withLink }]), { newId });
  const be4 = P4.ftaPages.find(p => p.id === 'pg-fcs-pitch').root.children[0].children[0];
  check('applying it sets realizedByItemId on that event to the item, and nothing else moves', be4.realizedByItemId === P4.itemsData.find(i => i.itemId === 'LRU-FCS-03').internalId && mk4.linkChanges.length === 1 && mk4.added === 0);
  const P3 = buildDemo('HL1'); const n0 = P3.itemsData.length; P3.itemsData = P3.itemsData.slice(1);
  const pl3 = C.planImport(P3, [{ name: 'self', text: outs.HL1.text }]);
  check('mutation: an item missing from the project is added back; nothing in the project is ever deleted', pl3.adds.length === 1 && pl3.adds[0].kind === 'item' && (C.applyImport(P3, pl3, { newId }), P3.itemsData.length === n0));
}

// ---------------------------------------------------------------- [6] import from other SysML v2 tools
console.log('\n[6] import from Sys Lab and from a Cameo-style SysML v2 file');
{
  const Q = emptyProject(), txt = fs.readFileSync(path.join(__dirname, 'fixtures/sysml_v2_syslab_example.sysml'), 'utf8');
  const plan = C.planImport(Q, [{ name: 'syslab.sysml', text: txt }]); C.applyImport(Q, plan, { newId });
  check('Sys Lab: its three systems come in by name with their codes as ids', JSON.stringify(Q.systemsData.map(s => [s.id, s.name])) === JSON.stringify([['sys-brk', 'Wheel brake system'], ['sys-fcs', 'Flight control system'], ['sys-elec', 'Electrical power system']]), JSON.stringify(Q.systemsData.map(s => [s.id, s.name])));
  check('Sys Lab: items keep their idents, including the three uses of one part definition', ['BRK-ITM-BCU', 'FCS-ITM-FCC1', 'FCS-ITM-FCC2', 'FCS-ITM-FCC3', 'ELEC-ITM-ESS'].every(id => Q.itemsData.some(i => i.itemId === id)) && Q.itemsData.find(i => i.itemId === 'FCS-ITM-FCC2').name === 'Flight control computer 2');
  check('Sys Lab: flows between systems become system interfaces with their ICD ids', Q.projectConfig.interfaces.length === 2 && Q.projectConfig.interfaces.every(f => f.fromSystemId === 'sys-elec' && /^C-00\d$/.test(f.icdRef)));
  check('Sys Lab: aircraft functions keep their group, system functions their system and trace', Q.acFunctionsData.some(f => f.subId === 'SF-BRAKE' && f.funcId === 'F-DECEL') && Q.systemsData.find(s => s.id === 'sys-brk').functions.some(f => f.funcId === 'BRK-APPLY' && f.traceIds.indexOf('SF-BRAKE') >= 0));
  check('Sys Lab: aircraft requirements and system requirements land where they belong', Q.acReqData.length === 5 && Q.acReqData[0].id === 'AC-001' && Q.systemsData.reduce((a, s) => a + s.req.length, 0) === 10);
  check('Sys Lab: what Safety Lab has no place for is listed, not guessed (ports, use cases, states, constraints)', ['ports', 'usecase definitions', 'state definition', 'constraint definitions'].every(w => plan.unmapped.some(u => u.indexOf(w) >= 0)), JSON.stringify(plan.unmapped));
  check('Sys Lab: a second import adds nothing', C.planImport(Q, [{ name: 'again', text: txt }]).adds.length === 0);

  const R = emptyProject(), cam = fs.readFileSync(path.join(__dirname, 'fixtures/sysml_v2_cameo_style.sysml'), 'utf8');
  const cp2 = C.planImport(R, [{ name: 'cameo.sysml', text: cam }]); C.applyImport(R, cp2, { newId });
  check('Cameo-style: the aircraft part definition is the root, its two parts the systems', JSON.stringify(R.systemsData.map(s => s.name)) === '["Wheel Brake System","Electrical Power System"]');
  check('Cameo-style: parts below a system (any depth, multiplicities, reused definitions) become its items', R.itemsData.filter(i => i.owningSystemId === R.systemsData[0].id).map(i => i.name).join('|') === 'Brake System Control Unit|Hydraulic Pump green pump|Hydraulic Pump blue pump' && R.itemsData.some(i => i.name === 'DC Bus'));
  check('Cameo-style: the connection between two systems becomes an interface; the one inside a system is listed', R.projectConfig.interfaces.length === 1 && cp2.unmapped.some(u => /inside a system/.test(u)));
  check('Cameo-style: an action definition with actions inside is a function with sub-functions; requirements keep their ids and text',
    R.acFunctionsData.filter(f => f.funcId === 'F-DEC').map(f => f.subId).join() === 'F-DEC-1,F-DEC-2' && R.acFunctionsData.some(f => f.subId === 'F-STEER') &&
    R.acReqData.map(r => r.id).join() === 'REQ-WBS-1,REQ-WBS-2' && /1200 m/.test(R.acReqData[0].text));
  check('Cameo-style: enumerations, aliases and state machines are listed as not brought in', ['enum definition', 'alias', 'state definition'].every(w => cp2.unmapped.some(u => u.indexOf(w) >= 0)));
  // mutation proof for the matcher: an existing system matched by name is not duplicated
  const T = emptyProject(); T.systemsData.push({ id: 'sys-eps', name: 'Electrical Power System', functions: [], fha: [], req: [], asm: [] });
  const tp = C.planImport(T, [{ name: 'cameo.sysml', text: cam }]); C.applyImport(T, tp, { newId });
  check('matching by name: an existing system with the same name is reused, its new item lands in it', T.systemsData.length === 2 && T.itemsData.some(i => i.name === 'DC Bus' && i.owningSystemId === 'sys-eps'));
  let threw = null; try { C.parse('package X { part a; } }'); } catch (e) { threw = e.message; }
  check('a file with an extra closing brace is refused in plain words', threw && /nothing to close/.test(threw), threw);
}

// ---------------------------------------------------------------- [7] scale: only what is on screen
console.log('\n[7] a 100,000-node project');
const T7 = Date.now();
{
  const P = buildDemo('HL1'); let id = 1e6, made = 0;
  const N = 100000;
  while (made < N) {
    const root = { id: id++, name: 'Top ' + made, type: 'gate', gateType: 'OR', children: [] }; made++;
    let level = [root];
    while (made < N && level.length && level.length < 2000) { const next = []; for (const g of level) for (let i = 0; i < 10 && made < N; i++) { const leaf = level.length > 100; const n = leaf ? { id: id++, name: 'Event ' + id, type: 'basic', probability: 1e-6, inputMode: 'probability', children: [] } : { id: id++, name: 'Gate ' + id, type: 'gate', gateType: 'AND', children: [] }; g.children.push(n); made++; if (!leaf) next.push(n); } level = next; }
    P.ftaPages.push({ id: 'big-' + made, name: 'Big ' + made, root, treeLevel: 'system', mode: 'top-down', linkedFhaIds: [] });
  }
  let t = Date.now(); const arch = C.indexAreas(P, ['architecture', 'functions']); const tArch = Date.now() - t;
  t = Date.now(); const x = C.exportText(P, { at: 'x' }); const tExp = Date.now() - t;
  check('the picker\'s default list (architecture and functions) builds in well under a second on a 100k-node project (it never walks the fault trees)', tArch < 250 && arch.every(e => !/^ftn:/.test(e.ref)), tArch + ' ms');
  check('the whole 100k-node project outs in under 20 s', tExp < 20000 && x.elements > N, tExp + ' ms, ' + x.elements + ' elements');
  t = Date.now(); const pl = C.planImport(P, [{ name: 'big', text: x.text }]); const tImp = Date.now() - t;
  check('reading it back (100k links resolved) is linear: under 40 s, and it matches everything', tImp < 40000 && pl.adds.length === 0 && pl.changes.length === 0, tImp + ' ms, adds ' + pl.adds.length);
}

// ---------------------------------------------------------------- [8] wiring, persistence, XMI, sync
console.log('  (section 7: ' + Math.round((Date.now() - T7) / 1000) + ' s)');
console.log('\n[8] wiring, persistence and the XMI import');
{
  const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  // 13 Oct 2026: sysml_model.js v1.1 (STPA actuators / sensors / external elements, SLSysML.pick); the pin follows the version.
  // 13 Oct 2026 (hand-built event trees and bow-ties): sysml_model.js moved to v1.1 (bte/btl kinds, event tree extras, the editor's model picker); the pin moves with it.
  // 13 Oct 2026 (merge into fix3-M): v1.3 adds drawn RBDs and Markov extras.
  check('index.html loads sysml_model.js (deferred, after the XMI import)', /<script src="sysml_model\.js\?v=1\.3" defer><\/script>/.test(idx) && idx.indexOf('sysml_model.js') > idx.indexOf('xmi_import.js'));
  const src = S('sysml_model.js');
  check('the menus: every Data Actions menu and the Project menu get the export / import pair', /querySelectorAll\('\.tab-dropdown-content'\)/.test(src) && /'Export SysML v2'/.test(src) && /'Import SysML v2'/.test(src) && /project-export/.test(src));
  check('the API other features reuse is exposed: linkPicker(container, currentRef, onPick), refLabel(ref), resolve(ref)', /linkPicker: linkPicker/.test(src) && /refLabel: refLabel/.test(src) && /function linkPicker\(container, currentRef, onPick, opts\)/.test(src));
  check('picking a link pushes an undo step and saves (commitSaveChanges)', /pushUndo\('Link model element'\)/.test(src) && /commitSaveChanges/.test(src));
  check('the import pushes an undo step before it writes', /pushUndo\('SysML v2 import'\)/.test(src));
  check('the project namespace lives in projectConfig.sysml (saved, exported and synced with the settings)', /projectConfig\.sysml/.test(src) && /'projectConfig'/.test(S('project_stores.js')));
  // sync: a fault tree node's sysmlRef rides the node-level merge
  try {
    const ctx = { window: { addEventListener() {}, setInterval() {}, setTimeout() {} }, console: { log() {}, warn() {}, error() {} }, setTimeout() {}, setInterval() {}, localStorage: { getItem() { return null; }, setItem() {} } };
    ctx.window.window = ctx.window; vm.createContext(ctx);
    vm.runInContext(S('crdt_sync.js'), ctx);
    const F = ctx.window.SafetyLabCRDT._fta;
    const pages = [{ id: 'p', name: 'P', root: { id: 1, type: 'gate', gateType: 'OR', sysmlRef: 'sys:a', children: [{ id: 2, type: 'basic', sysmlRef: 'item:7', children: [] }] } }];
    const dd = F.decompose(pages), back = F.recompose(dd.shells, dd.nodes);
    check('live sync: sysmlRef on fault tree nodes survives the node-level merge (decompose / recompose)', JSON.stringify(back).indexOf('"sysmlRef":"item:7"') >= 0 && JSON.stringify(back).indexOf('"sysmlRef":"sys:a"') >= 0, JSON.stringify(back).slice(0, 200));
  } catch (e) { check('live sync: sysmlRef on fault tree nodes survives the node-level merge', false, e.message); }
  // the XMI import still works
  try {
    const ctx = { console: { log() {}, warn() {}, error() {} }, setTimeout() {}, document: { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { style: {}, setAttribute() {}, appendChild() {} }; }, body: { appendChild() {} } } };
    ctx.window = ctx; ctx.addEventListener = () => {}; vm.createContext(ctx);
    vm.runInContext(S('reqif_import.js'), ctx); vm.runInContext(S('xmi_import.js'), ctx);
    const xmi = '<?xml version="1.0"?><xmi:XMI xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.omg.org/spec/UML/20131001"><uml:Model xmi:id="m" name="WBS"><packagedElement xmi:type="uml:Package" xmi:id="p1" name="Hydraulics"><packagedElement xmi:type="uml:Class" xmi:id="c1" name="Pump"/></packagedElement></uml:Model></xmi:XMI>';
    const r = ctx.xmiParse(xmi);
    check('the XMI import (Cameo XMI socket) still parses packages and blocks', r.packages.length === 1 && r.packages[0].name === 'Hydraulics' && r.blocks.length === 1 && r.blocks[0].name === 'Pump', JSON.stringify(r));
  } catch (e) { check('the XMI import still parses', false, e.message); }
  check('the SysML v2 import sends XMI files to the XMI import instead of misreading them', /That is an XMI file/.test(src));
}

// ---------------------------------------------------------------- [9] refs and labels (what properties panels show)
console.log('\n[9] refs and labels');
{
  const P = demo.HL1, ix = C.index(P), it = P.itemsData[0];
  const e = ix.find(x => x.ref === 'item:' + it.internalId);
  check('refOf builds the same ref the index uses', C.refOf('item', it) === e.ref && C.refOf('ftn', { id: 5 }, { pageId: 'pg' }) === 'ftn:pg/5');
  check('the label names the element by ID, name and kind in plain words', e.label === it.itemId + ' ' + it.name + ' (Item)' && /Architecture > /.test(e.path), e.label + ' / ' + e.path);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed' + (skips.length ? ', ' + skips.length + ' SKIPPED: ' + skips.join(' ') : ''));
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
process.exit(fail ? 1 : 0);

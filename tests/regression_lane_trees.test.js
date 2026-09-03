#!/usr/bin/env node
/*
 * Regression — B3: tree generation from the MAC, CoFFE, interdependence and
 * common-resource lanes, to the ARP4761A Figure Q.4-1 shape.
 *   Executes the REAL generator (lane_trees.js) against the real MAC breach
 *   arithmetic, the real BDD engine, the real numbering engine and a fixture
 *   mirroring the Appendix Q decelerate-on-ground example:
 *     · weighted clause WBS×3 + {GSS,TRS,FLS}×1, floor 3 → breach sets are
 *       exactly {WBS,+1 other} — the Q.4-1 AND(FF1.1, DECEL_D) logic;
 *     · Q.4-2 resources: hydraulics serving all four (coarse), ground
 *       detection under GSS+TRS only — ONE shared event id (the AGS.MF ×2);
 *     · signed CoFFE malfunction case riding the TL tree OUTSIDE the
 *       availability gate (the FF5.3 position);
 *     · three top events, each bound to its OWN classified condition through
 *       the FCIM TL/PL/M ids, worst-severity row winning (Waqas, 21 Aug:
 *       "fault trees will only be for the worst case");
 *     · numbering-scheme ids, regenerate-as-diff with stable page ids,
 *       provenance on every generated node, skeleton ≡ sets proven, resource
 *       routes checked against the declared data.
 * Run: node tests/regression_lane_trees.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

globalThis.window = globalThis;
globalThis.SLEnv = { get: n => globalThis[n] };
globalThis.document = undefined;   // the desk guards on it; generation must not need a DOM

// ---- fixture: the Appendix Q decelerate-on-ground example -------------------
globalThis.acFunctionsData = [{ subId: 'SF-06', subName: 'Decelerate on ground' }];
globalThis.systemsData = [
  { id: 'sys-wbs', name: 'Wheel Brake', functions: [{ funcId: 'FN-WBS', funcName: 'Decelerate wheels on ground', traceIds: ['SF-06'] }], fha: [] },
  { id: 'sys-gss', name: 'Ground Spoiler', functions: [{ funcId: 'FN-GSS', funcName: 'Aero brake on ground', traceIds: ['SF-06'] }], fha: [] },
  { id: 'sys-trs', name: 'Thrust Reverser', functions: [{ funcId: 'FN-TRS', funcName: 'Reverse thrust on ground', traceIds: ['SF-06'] }], fha: [] },
  { id: 'sys-fls', name: 'Flap', functions: [{ funcId: 'FN-FLS', funcName: 'High lift', traceIds: ['SF-06'] }], fha: [] },
  { id: 'sys-prop', name: 'Propulsion', functions: [{ funcId: 'FN-PROP', funcName: 'Control thrust on ground', traceIds: [] }], fha: [] },
];
globalThis.acFhaData = [
  { internalId: 601, subId: 'SF-06', fcId: 'FC-TL-A', fcDesc: 'Loss of ability to decelerate with crew aware (Landing)', severity: 'Catastrophic', phases: ['Landing'] },
  { internalId: 602, subId: 'SF-06', fcId: 'FC-TL-A', fcDesc: 'Loss of ability to decelerate with crew aware (Taxi)', severity: 'Major', phases: ['Taxi'] },   // sibling phase-group row
  { internalId: 603, subId: 'SF-06', fcId: 'FC-PL',   fcDesc: 'Partial loss of deceleration capability', severity: 'Major', phases: ['Landing'] },
  { internalId: 604, subId: 'SF-06', fcId: 'FC-M',    fcDesc: 'Uncommanded deceleration in flight', severity: 'Hazardous', phases: ['Cruise'] },
];
globalThis.acFcimData = [{ subId: 'SF-06', awareness: 'aware', tlId: 'FC-TL-A', plId: 'FC-PL', mId: 'FC-M' }];
globalThis.resourcesData = [
  { internalId: 'r-hyd', resId: 'RES-HYD', name: 'Hydraulic Power', providedBy: ['sys-hps'], providedByFunctions: [], consumedBy: [], consumedBySystems: ['sys-wbs', 'sys-gss', 'sys-trs', 'sys-fls'] },
  { internalId: 'r-gdi', resId: 'RES-GDI', name: 'Ground Detection Information', providedBy: [], providedByFunctions: [], consumedBy: [], consumedBySystems: ['sys-gss', 'sys-trs'] },
];
globalThis.projectConfig = {
  macModels: [{ id: 'r1', subId: 'SF-06', phase: 'Landing',
    clauses: [{ min: 1, of: ['FN-WBS', 'FN-GSS', 'FN-TRS', 'FN-FLS'], weights: { 'FN-WBS': 3, 'FN-GSS': 1, 'FN-TRS': 1, 'FN-FLS': 1 }, floor: 3 }],
    arbitration: { scheme: 'voting', k: 2, of: ['FN-WBS', 'FN-GSS', 'FN-TRS', 'FN-FLS'] } }],
  interdep: { cells: { '601§fn:FN-PROP': { state: 'asserted', by: 'W' } }, cra: { '601§r-gdi·Total loss§fn:FN-GSS': 'Erroneous ground detection defeats auto-deploy' } },
  coffe: { verdicts: { '601§sys-prop=malfunction': { verdict: 'yes', by: 'W. Nafees', at: '2026-08-21T00:00:00Z' } } },
};
globalThis.itemsData = []; globalThis.flightPhasesData = []; globalThis.routingData = [];
globalThis.ftaPages = []; globalThis.ftaConfig = { missionProfileId: '' };
globalThis.internalIdCounter = 9000;
globalThis.commitSaveChanges = () => {};
globalThis._autosaveSuspended = false; globalThis._autosaveLastWrite = 0; globalThis._dirtySinceSave = false;
globalThis._autosaveDiskAvailable = false; globalThis._autosaveLastDiskWrite = 0;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.scheduleAutosave = () => {};
globalThis.showToast = () => {};
globalThis.sys = () => null;
globalThis.renderSysFHA = () => {}; globalThis.renderFhaPhaseGrid = () => {}; globalThis.renderInterdepPage = () => {};

// In the browser, top-level consts in classic scripts are GLOBAL lexical
// bindings, visible to code created with new Function (the quant engine's
// worker-offloadable path). Node's indirect eval keeps consts eval-local, so
// the harness promotes the engine files' top-level consts onto globalThis
// inside the same eval — pure harness plumbing, not app behaviour.
const promote = src => src + '\n;' + [...src.matchAll(/^const (\w+)\s*=/gm)].map(m => 'try{globalThis.' + m[1] + '=' + m[1] + '}catch(_){}').join('');
(0, eval)(['fn_resolver.js', 'mac_lanes.js', 'numbering.js'].map(S).join('\n;\n')
  + '\n;\n' + promote(S('engine_modules.js')) + '\n;\n' + promote(S('fta_quant_modules.js'))
  + '\n;\n' + ['helpers_modules.js', 'misc_fn_modules.js'].map(S).join('\n;\n'));
globalThis.slNumberingScheme = SafetyLabNumbering.DEFAULT_SCHEME;
globalThis.slNumberingStore = { seq: {}, map: {} };
const LT = (() => { const m = { exports: {} }; new Function('module', 'window', S('lane_trees.js'))(m, globalThis); return m.exports; })();
check('machinery loaded', typeof LT.compile === 'function' && typeof globalThis.macBreachSetsChecked === 'function' && typeof globalThis.bddMinimalCutsets === 'function');

// ---- the weighted clause IS the Q.4-1 AND -----------------------------------
const bc = macBreachSetsChecked(projectConfig.macModels[0]);
const bkeys = bc.sets.map(s => s.slice().sort().join('|')).sort();
check('breach sets are exactly {WBS + one other} (the AND(FF1.1, DECEL_D) logic)',
  bkeys.length === 3 && bkeys.join(';') === 'FN-GSS|FN-WBS;FN-FLS|FN-WBS;FN-TRS|FN-WBS'.split(';').sort().join(';'), JSON.stringify(bkeys));

// ---- binding: worst case, own condition per lane ----------------------------
const bTL = LT.bindLane(projectConfig.macModels[0], 'tl');
check('TL binds the WORST phase-group row of the FCIM TL condition (Catastrophic Landing, not Major Taxi)',
  bTL.fc && bTL.fc.internalId === 601, JSON.stringify(bTL.fc && bTL.fc.internalId));
check('PL and MAL bind their OWN classified conditions via the FCIM',
  LT.bindLane(projectConfig.macModels[0], 'pl').fc.fcId === 'FC-PL' && LT.bindLane(projectConfig.macModels[0], 'mal').fc.fcId === 'FC-M');

// ---- compile ----------------------------------------------------------------
const res = LT.compile('r1');
check('all three lanes generate', res.lanes.tl.ok && res.lanes.pl.ok && res.lanes.mal.ok,
  JSON.stringify([res.lanes.tl.reason, res.lanes.pl.reason, res.lanes.mal.reason]));
check('three top events — three pages, not three branches',
  ftaPages.length === 3 && new Set(ftaPages.map(p => p.id)).size === 3);
const tlPage = ftaPages.find(p => p.id === res.lanes.tl.pageId);
const plPage = ftaPages.find(p => p.id === res.lanes.pl.pageId);
const malPage = ftaPages.find(p => p.id === res.lanes.mal.pageId);

// ---- Q.4-1 shape on the TL tree --------------------------------------------
const tlTop = tlPage.root;
check('TL top is the FC (name + linkage)', /Loss of ability to decelerate/.test(tlTop.name) && tlPage.linkedFhaId === 601);
const availGate = (tlTop.children || []).find(c => c._laneProv && c._laneProv.source === 'mac');
const residues = (tlTop.children || []).filter(c => c._macGraft);
check('availability gate + malfunction residue OUTSIDE it (the FF5.3 position)',
  !!availGate && residues.length === 1 && residues[0]._laneProv.source === 'coffe' && residues[0]._laneProv.by === 'W. Nafees',
  JSON.stringify(tlTop.children.map(c => c.name)));
check('residue event is the signed malfunction case', /malfunction/.test(residues[0].name) && residues[0].logicalId === 'macmal:sys-prop');
// FF branches: each breach pair is AND(WBS-branch, other-branch); WBS branch OR's its resource routes
const brch = (availGate.children || [])[0];
const wbsFF = (brch.children || []).find(n => /Wheel Brake/.test(n.name));
check('members are FF branches — own loss OR resource routes', wbsFF && wbsFF.type === 'gate' && wbsFF.gateType === 'OR' &&
  (wbsFF.children || []).some(c => c.logicalId === 'macsys:FN-WBS') && (wbsFF.children || []).some(c => c.logicalId === 'macres:r-hyd:Total loss'));
// the shared resource event: RES-GDI under GSS and TRS branches only, same logicalId
const gdiHolders = [];
(availGate.children || []).forEach(b => (b.children || []).forEach(ff => {
  if (ff.type === 'gate') (ff.children || []).forEach(c => { if (c.logicalId === 'macres:r-gdi:Total loss') gdiHolders.push(ff.name); });
}));
check('ground detection is ONE shared event under GSS and TRS only (the AGS.MF ×2 pattern)',
  gdiHolders.length === 2 && gdiHolders.every(n => /Ground Spoiler|Thrust Reverser/.test(n)), JSON.stringify(gdiHolders));
// CRA cell-text route is declared (not coarse); consumedBySystems-only routes are flagged coarse
const gssFF = (availGate.children || []).flatMap(b => b.children || []).find(n => /Ground Spoiler/.test(n.name) && n.type === 'gate');
const gdiEv = (gssFF.children || []).find(c => c.logicalId === 'macres:r-gdi:Total loss');
const hydEv = (gssFF.children || []).find(c => c.logicalId === 'macres:r-hyd:Total loss');
check('CRA cell text ⇒ declared route; system-level linkage ⇒ visibly coarse',
  gdiEv && gdiEv._laneCoarse === false && hydEv && hydEv._laneCoarse === true && /system-level/.test(hydEv.name));

// ---- verification: both properties ------------------------------------------
check('skeleton ≡ breach sets PROVEN on the enriched TL tree (routes and residue stripped)',
  res.lanes.tl.verified === true && res.lanes.tl.routes === true);
check('PL skeleton ≡ partial sets · MAL skeleton ≡ arbitration combinations',
  res.lanes.pl.verified === true && res.lanes.mal.verified === true, JSON.stringify([res.lanes.pl.verified, res.lanes.mal.verified]));
check('malfunction lane: voting 2-of-4 over macmal events',
  (function () { const g = (malPage.root.children[0].children || [])[0] || malPage.root.children[0];
    const vg = g.gateType === 'VOTING' ? g : (g.children || []).find(x => x.gateType === 'VOTING');
    return vg && vg.votingK === 2 && (vg.children || []).length === 4; })(), JSON.stringify(malPage.root.children.map(c => c.gateType)));

// ---- provenance on EVERY generated node -------------------------------------
let provAll = true, provCount = 0;
[tlPage, plPage, malPage].forEach(p => (function walk(n) { if (!n) return; provCount++; if (!n._laneProv || !n._laneProv.lane || !n._laneProv.source) provAll = false; (n.children || []).forEach(walk); })(p.root));
check('provenance on every generated node (' + provCount + ' nodes)', provAll && provCount > 20);

// ---- ids from the numbering scheme, shared events fold ----------------------
check('top-event ids minted by the scheme (FT-### pattern, not TOP- fallback)', /^FT-\d{3}$/.test(tlPage.root.displayId) && /^FT-\d{3}$/.test(plPage.root.displayId));
const beIds = {};
[tlPage, plPage].forEach(p => (function walk(n) { if (n.type === 'basic' && n.logicalId === 'macsys:FN-WBS') (beIds[p.id] = beIds[p.id] || []).push(n.displayId); (n.children || []).forEach(walk); })(p.root));
check('one physical event, one id — macsys:FN-WBS carries the SAME displayId on the TL and PL pages',
  beIds[tlPage.id] && beIds[plPage.id] && new Set([].concat(beIds[tlPage.id], beIds[plPage.id])).size === 1, JSON.stringify(beIds));

// ---- interdependence coverage finding ---------------------------------------
check('uncovered contributor (Propulsion, asserted in the idp row) is a NAMED finding',
  res.findings.some(f => f.kind === 'idp-uncovered' && /Propulsion|FN-PROP/.test(f.msg)), JSON.stringify(res.findings.map(f => f.kind)));
check('an aircraft sub-function subId is a real declaration — NO spurious not-per-function finding (live-found on K350)',
  !res.findings.some(f => f.kind === 'not-per-function'), JSON.stringify(res.findings.map(f => f.kind)));
check('gate names read the FUNCTION, not a raw SF- id',
  /Decelerate on ground/.test((availGate || {}).name || ''), (availGate || {}).name);

// ---- regenerate: stable ids, fresh status, diff on rule change --------------
const idsBefore = ftaPages.map(p => p.id).sort().join('|');
check('status fresh after compile', LT.status('r1', 'tl') === 'fresh' && LT.status('r1', 'pl') === 'fresh' && LT.status('r1', 'mal') === 'fresh');
const res2 = LT.compile('r1');
check('regenerate keeps page ids and reports no diff',
  ftaPages.length === 3 && ftaPages.map(p => p.id).sort().join('|') === idsBefore &&
  res2.lanes.tl.added.length === 0 && res2.lanes.tl.removed.length === 0);
// floor 3→4: {WBS} alone now breaches (capacity 3 < 4) and so does
// {GSS,TRS,FLS} — the minimal sets genuinely move.
projectConfig.macModels[0].clauses[0].floor = 4;
check('rule drift flips the lane stale', LT.status('r1', 'tl') === 'stale');
const res3 = LT.compile('r1');
check('regenerate-as-diff reports the breach-set movement', (res3.lanes.tl.added.length + res3.lanes.tl.removed.length) > 0,
  JSON.stringify({ added: res3.lanes.tl.added, removed: res3.lanes.tl.removed }));
projectConfig.macModels[0].clauses[0].floor = 3;
LT.compile('r1');

// ---- refusals (_NO_DEFAULTS) ------------------------------------------------
const savedM = acFcimData[0].mId; acFcimData[0].mId = null;
const savedRows = acFhaData.splice(3, 1);   // remove the classified M row too
const resM = LT.compile('r1');
check('an unbound lane refuses with a NAMED finding, never a guessed severity',
  !resM.lanes.mal.ok && /Classify|author the FCIM/i.test(resM.lanes.mal.reason || ''), resM.lanes.mal.reason);
acFcimData[0].mId = savedM; acFhaData.push(savedRows[0]);
const savedArb = projectConfig.macModels[0].arbitration; delete projectConfig.macModels[0].arbitration;
const resA = LT.compile('r1');
check('undeclared arbitration refuses the malfunction lane (never a guessed k)',
  !resA.lanes.mal.ok && /arbitrat/i.test(resA.lanes.mal.reason || ''), resA.lanes.mal.reason);
projectConfig.macModels[0].arbitration = savedArb;
LT.compile('r1');

// ---- desk statics + wrap discipline -----------------------------------------
const LSRC = S('lane_trees.js');
check('desk generates through the module API and preserves the wrapped renderer (rule 5/preserve)',
  /SLLaneTrees\.compile\(/.test(LSRC) && /SLLaneTrees\.compileAll\(\)/.test(LSRC) && /SLWrap && SLWrap\.preserve/.test(LSRC));
check('module reads app state through SLEnv.get first (rule 5)', /SLEnv/.test(LSRC) && /E\.get === 'function'/.test(LSRC));
check('desk copy states the WORST-CASE binding, never phase-aware', /worst-case row/.test(LSRC) && !/phase-aware/.test(LSRC));

// ---- pins + load order (rules 7 and 12) -------------------------------------
const idx = S('index.html');
check('lane_trees pinned at 1.2 or later (worst-case desk copy)', parseFloat((idx.match(/lane_trees\.js\?v=([0-9.]+)/) || [])[1] || '0') >= 1.2);
check('index.html loads lane_trees.js (deferred)', /lane_trees\.js\?v=[0-9.]+"\s+defer/.test(idx));
const at = n => idx.indexOf(n + '.js?v=');
check('lane_trees loads AFTER everything it consumes',
  ['mac_lanes', 'fn_resolver', 'numbering', 'engine_modules', 'fta_quant_modules', 'helpers_modules', 'misc_fn_modules']
    .every(n => at(n) !== -1 && at(n) < at('lane_trees')),
  JSON.stringify(['mac_lanes', 'fn_resolver', 'numbering', 'engine_modules', 'fta_quant_modules', 'helpers_modules', 'misc_fn_modules'].map(n => [n, at(n) < at('lane_trees')])));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

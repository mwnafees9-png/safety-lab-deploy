#!/usr/bin/env node
/*
 * Regression — the App Q output-set harness (built 4 Aug 2026).
 *
 * Waqas's ruling: ARP4761A Appendix Q — the contiguous worked example — is the
 * definition of "complete", so completeness becomes a checklist the golden
 * thread either satisfies or doesn't. This suite pins the harness's doctrine:
 *
 *   · PURE READS — the module writes to no store, ever.
 *   · SCOPE-AWARE — a lane the programme never committed reads NOT IN PLAN and
 *     is never counted as a gap; an UNKNOWN lane id fails safe as committed.
 *   · ADVISORY — reports, blocks nothing.
 *   · NOTHING SILENTLY OMITTED — Q.7 (Dependence Diagram), excluded by his
 *     4 Aug ruling, renders as EXCLUDED with its reason rather than vanishing
 *     from the map.
 *
 * Stores are seeded as BARE GLOBALS because the module reads them by bare
 * identifier (the 3 Aug a11 lesson); the module is loaded through require, so
 * globalThis.X is exactly what a bare `X` resolves to inside it.
 *
 * Run: node tests/regression_q_completeness.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'q_completeness.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

// ---- [0] wiring + doctrine pins --------------------------------------------
console.log('\n[qmap] wiring + doctrine');
check('index.html pins q_completeness ≥ 1.0 (§7.3 — floor from birth)',
  PIN.atLeast(idx, 'q_completeness.js', '1.0'));
check('…and loads it AFTER gt_integrity, whose render it wraps',
  idx.indexOf('q_completeness.js?v=') > idx.indexOf('gt_integrity.js?v='));
const codeOnly = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const STORES = ['acFhaData', 'acReqData', 'systemsData', 'ftaPages', 'acFcimData', 'cmaData', 'zsaData', 'praData', 'projectConfig'];
check('PURE READS — no assignment to any store, no mutation of one',
  STORES.every(s => !new RegExp('(^|[^.\\w])' + s + '(\\.\\w+)*\\s*=[^=]').test(codeOnly) &&
                    !new RegExp('(^|[^.\\w])' + s + '(\\.\\w+)*\\.(push|splice|pop|shift|unshift|sort)\\s*\\(').test(codeOnly)),
  'the harness reports on the project; it never edits it');
check('stores are read by BARE IDENTIFIER, never window[name] (3 Aug lesson)',
  !/window\s*\[\s*['"]?(acFhaData|ftaPages|cmaData|systemsData)/.test(src) && /typeof acFhaData !== 'undefined'/.test(src));
check('SAE posture: clause numbers and output titles only, no clause prose',
  /Appendix Q/.test(src) && !/S18 airplane/i.test(src) && !/wheel brake system/i.test(src));

const Q = require(path.join(SITE, 'q_completeness.js'));

// ---- fixtures ---------------------------------------------------------------
function seedEmpty() {
  globalThis.acFhaData = []; globalThis.acReqData = []; globalThis.systemsData = [];
  globalThis.ftaPages = []; globalThis.acFcimData = []; globalThis.cmaData = [];
  globalThis.zsaData = []; globalThis.praData = []; globalThis.projectConfig = {};
  delete globalThis.window;
}
function seedWorked() {
  // A small but genuinely threaded project: two Cat FCs, both allocated, both
  // mirrored, both traced to FCIM rows and requirements.
  globalThis.acFcimData = [{ subId: 'SF-01', tlDesc: 'Loss of X' }, { subId: 'SF-02', tlDesc: 'Loss of Y' }];
  globalThis.acFhaData = [
    { internalId: 1, fcId: 'SF-01-TL', subId: 'SF-01', severity: 'Catastrophic', phases: 'Cruise' },
    { internalId: 2, fcId: 'SF-02-TL', subId: 'SF-02', severity: 'Hazardous', phases: 'Takeoff' }
  ];
  globalThis.acReqData = [
    { internalId: 90, traceId: 'SF-01', text: 'a', reqSource: { context: { fcId: 'SF-01-TL' } } },
    { internalId: 91, traceId: 'SF-02', text: 'b', reqSource: { context: { fcId: 'SF-02-TL' } } }
  ];
  globalThis.systemsData = [{ id: 'wbs', name: 'WBS', fha: [{ internalId: 5, severity: 'Major' }],
    req: [{ internalId: 7, verifStatus: 'Verified' }], fmea: [{ internalId: 8 }] }];
  globalThis.ftaPages = [
    { id: 'a1', systemId: 'wbs', linkedFhaIds: [1], root: { id: 1, type: 'basic', markovModelId: 'm1' } },
    { id: 'a2', systemId: 'wbs', linkedFhaIds: [2], root: { id: 2, type: 'basic' } },
    { id: 'v1', verifies: 'a1', root: { id: 3, type: 'basic' } },
    { id: 'v2', verifies: 'a2', root: { id: 4, type: 'basic' } }
  ];
  globalThis.cmaData = [{ internalId: 20, status: 'Closed — Accepted', linkedGateIds: ['a1:1'] }];
  globalThis.zsaData = [{ zoneId: 'Z1', housedFunctions: ['SF-01'] }];
  globalThis.praData = [{ praId: 'PR-1', affectedZones: ['Z1'] }];
  globalThis.projectConfig = { markovModels: [{ id: 'm1', name: 'M' }], fmes: { groups: { g1: {} } } };
  delete globalThis.window;
}
const boxOf = (r, id) => r.boxes.find(b => b.id === id);

// ---- [1] empty project ------------------------------------------------------
console.log('\n[qmap] an empty project');
seedEmpty();
{
  const r = Q.qCompleteness();
  check('every in-scope box reports ABSENT rather than throwing',
    r.boxes.filter(b => b.verdict !== 'excluded').every(b => b.verdict === 'absent'),
    JSON.stringify(r.boxes.filter(b => b.verdict !== 'absent' && b.verdict !== 'excluded').map(b => b.id + ':' + b.verdict)));
  check('the summary counts in-scope boxes and finds none present',
    r.summary.present === 0 && r.summary.inScope > 0 && r.summary.absent === r.summary.inScope);
  check('no edge falsely resolves on an empty project', r.summary.edgesOk === 0);
  check('every box carries a human-readable detail, never a bare verdict',
    r.boxes.every(b => typeof b.detail === 'string' && b.detail.length > 0));
}

// ---- [2] Q.7 excluded, NAMED not deleted -----------------------------------
console.log('\n[qmap] Q.7 — excluded by ruling, never silently dropped');
{
  const r = Q.qCompleteness();
  const q7 = boxOf(r, 'Q.7');
  check('Q.7 is STILL ON THE MAP', !!q7, 'a map that drops a box lies about coverage');
  check('…rendered as EXCLUDED, not absent and not present', q7.verdict === 'excluded');
  check('…naming the ruling and its date', /ruling/.test(q7.detail) && /4 Aug 2026/.test(q7.detail));
  check('…and it is NOT counted against completeness',
    r.summary.inScope === r.boxes.filter(b => b.verdict !== 'excluded' && b.verdict !== 'not-in-plan').length &&
    r.summary.excluded === 1);
  check('the record correction is written where it cannot be lost',
    /Appendix H is titled/.test(src) && /never at Q\.7/.test(src),
    'the 2 Aug card misread DD as Design Description; the source says otherwise');
}

// ---- [3] a threaded project -------------------------------------------------
console.log('\n[qmap] a worked project');
seedWorked();
{
  const r = Q.qCompleteness();
  check('AFHA reads present when every FC is classified', boxOf(r, 'Q.3').verdict === 'present', boxOf(r, 'Q.3').detail);
  check('PASA reads present when every Cat/Haz is allocated and requirements exist',
    boxOf(r, 'Q.4').verdict === 'present', boxOf(r, 'Q.4').detail);
  check('SSA/FTA reads present once verification mirrors exist',
    boxOf(r, 'Q.12').verdict === 'present', boxOf(r, 'Q.12').detail);
  check('Markov reads present with a model attached to an event',
    boxOf(r, 'Q.8').verdict === 'present', boxOf(r, 'Q.8').detail);
  check('ZSA and PRA read present when zones house functions and risks are scoped',
    boxOf(r, 'Q.14').verdict === 'present' && boxOf(r, 'Q.15').verdict === 'present');
  check('the four structural edges resolve on a threaded project',
    ['AFHA→PASA', 'AFHA→FCIM', 'PSSA→SSA', 'FC→requirement'].every(id => r.edges.find(e => e.id === id).ok),
    JSON.stringify(r.edges.map(e => e.id + ':' + e.ok)));
  // PARTIAL is a real state, not a rounding of absent: unclassify one FC.
  globalThis.acFhaData[1].severity = '';
  const r2 = Q.qCompleteness();
  check('one unclassified FC turns AFHA from present to PARTIAL (started, not complete)',
    boxOf(r2, 'Q.3').verdict === 'partial' && /1 of 2/.test(boxOf(r2, 'Q.3').detail));
  check('…and the affected edge reports the shortfall with numbers',
    !r2.edges.find(e => e.id === 'AFHA→PASA').ok === false || /of 2|of 1/.test(r2.edges.find(e => e.id === 'AFHA→PASA').detail));
  globalThis.acFhaData[1].severity = 'Hazardous';
  // Break a mirror: the PSSA→SSA edge must notice.
  const keep = globalThis.ftaPages.pop();
  const r3 = Q.qCompleteness();
  check('removing a verification mirror breaks the PSSA→SSA edge and says how many',
    !r3.edges.find(e => e.id === 'PSSA→SSA').ok && /1 of 2/.test(r3.edges.find(e => e.id === 'PSSA→SSA').detail));
  globalThis.ftaPages.push(keep);
}

// ---- [4] programme scope ----------------------------------------------------
console.log('\n[qmap] scope-awareness (A11\'s rule)');
{
  globalThis.window = { PROGRAM_PLAN: { laneOn: id => id !== 'markov' && id !== 'zsa' } };
  const r = Q.qCompleteness();
  check('an uncommitted lane reads NOT IN PLAN', boxOf(r, 'Q.8').verdict === 'not-in-plan' && boxOf(r, 'Q.14').verdict === 'not-in-plan');
  check('…explaining that it is not a gap', /not a gap/.test(boxOf(r, 'Q.8').detail));
  // The invariant is that an uncommitted lane leaves the denominator, NOT that
  // nothing else is absent — boxes whose helper modules are absent under bare
  // node (MBSA, CEA, ASA) are genuinely absent, and saying otherwise would be
  // asserting the fixture rather than the rule.
  const inPlanNow = Q.qCompleteness();
  const withoutPlan = (() => { const w = globalThis.window; delete globalThis.window;
                               const x = Q.qCompleteness(); globalThis.window = w; return x; })();
  check('…and is excluded from the in-scope denominator (never counted as a gap)',
    r.summary.notInPlan === 2 &&
    r.summary.inScope === r.boxes.filter(b => b.verdict !== 'excluded' && b.verdict !== 'not-in-plan').length &&
    r.summary.inScope === withoutPlan.summary.inScope - 2,
    JSON.stringify(r.summary));
  check('…and turning a lane off never turns a box from present into absent',
    ['Q.8', 'Q.14'].every(id => boxOf(withoutPlan, id).verdict === 'present' && boxOf(inPlanNow, id).verdict === 'not-in-plan'),
    'an uncommitted lane must read as out of scope, not as a missing artifact');
  check('a committed lane still reports normally', boxOf(r, 'Q.15').verdict === 'present');
  // FAIL SAFE: an unknown lane id must be treated as committed, so a catalogue
  // rename can never quietly hide a standard output.
  globalThis.window = { PROGRAM_PLAN: { laneOn: () => undefined } };
  check('an UNKNOWN lane id fails safe as committed (a rename must not hide a box)',
    Q.qCompleteness().boxes.every(b => b.verdict !== 'not-in-plan'));
  globalThis.window = {};
  check('no Program Planning module at all ⇒ everything in scope (fail-open)',
    Q.qCompleteness().boxes.every(b => b.verdict !== 'not-in-plan'));
  delete globalThis.window;
}

// ---- [5] the harness cannot corrupt what it reads ---------------------------
console.log('\n[qmap] pure-read, proven by execution');
{
  seedWorked();
  const before = JSON.stringify([acFhaData, acReqData, systemsData, ftaPages, acFcimData, cmaData, zsaData, praData, projectConfig]);
  Q.qCompleteness(); Q.qCompleteness();
  const after = JSON.stringify([acFhaData, acReqData, systemsData, ftaPages, acFcimData, cmaData, zsaData, praData, projectConfig]);
  check('running the harness twice leaves every store byte-identical', before === after);
  check('…and it is deterministic — same project, same verdicts',
    JSON.stringify(Q.qCompleteness().boxes) === JSON.stringify(Q.qCompleteness().boxes));
}

// ---- [5b] collection SHAPES — the bug this suite missed the first time ------
// Caught only on the deployed build: ceaGraph() returns nodes as a Map and
// ceaFindings() returns {rows,…}, while the first probe read `.length` — so a
// live 20-node cascade graph reported ABSENT. And FMEA rows live in a GLOBAL
// fmeaData, not systemsData[].fmea, which systems do not carry at all. §8: an
// empty result reads as "you have none of those", never as "I looked in the
// wrong place". These pins make the probes shape-tolerant by construction.
console.log('\n[qmap] collection shapes (Map / wrapper / global store)');
{
  seedEmpty();
  globalThis.acFhaData = [{ internalId: 1, fcId: 'F1', subId: 'S1', severity: 'Catastrophic' }];
  // CEA exposed the way the live app exposes it: nodes as a Map, edges array.
  globalThis.ceaGraph = () => ({ nodes: new Map([['a', 1], ['b', 2], ['c', 3]]), edges: [1, 2] });
  globalThis.ceaFindings = () => ({ rows: [1, 2, 3, 4], corroborated: 0, pairs: [] });
  const r = Q.qCompleteness();
  const q16 = boxOf(r, 'Q.16');
  check('a Map-valued node collection is COUNTED, not read as zero',
    q16.verdict === 'present' && /3 graph nodes/.test(q16.detail), q16.detail);
  check('a wrapper-object findings result is counted through its rows',
    /4 findings/.test(q16.detail), q16.detail);
  // FMEA in the GLOBAL store, with systems carrying no fmea key at all.
  globalThis.fmeaData = [{ id: 1 }, { id: 2 }];
  globalThis.systemsData = [{ id: 's', name: 'S', fha: [], req: [] }];
  globalThis.fmesGroups = () => ({ groups: { g1: {}, g2: {} }, incomplete: [] });
  const r2 = Q.qCompleteness();
  const q10 = boxOf(r2, 'Q.10');
  check('FMEA rows are found in the GLOBAL store even when systems carry no fmea key',
    q10.verdict === 'present' && /2 FMEA rows/.test(q10.detail), q10.detail);
  check('…and FMES groups are counted through their wrapper', /2 FMES groups/.test(q10.detail), q10.detail);
  delete globalThis.ceaGraph; delete globalThis.ceaFindings; delete globalThis.fmeaData; delete globalThis.fmesGroups;
}

// ---- [6] the map is data, and covers the appendix ---------------------------
// ---- [5c] the render must reach the page by the path the PRODUCT uses ------
// Live-caught 4 Aug: wrapping only the exported render left the section never
// appearing on navigation, because gt_integrity's nav wrapper calls its own
// internal closure. Third instance of the §7.5 shape in this project's history.
console.log('\n[qmap] render nets');
check('the module wraps BOTH the export and switchTab',
  /window\.renderGtIntegrityPage = wrapped/.test(src) && /window\.switchTab = wrapped/.test(src));
check('the nav net fires only for the Thread Integrity tab',
  /if \(tabId === 'gt-integrity'\) renderQMapInto/.test(src));
check('both nets are idempotent (guard flags), so double-wrapping cannot happen',
  /_qWrapped/.test(src) && /_qNavWrapped/.test(src));
check('the render replaces its own section rather than appending duplicates',
  /const old = document\.getElementById\('qmap-section'\);\s*\n\s*if \(old\) old\.remove\(\);/.test(src),
  'firing twice must not stack two Q maps on the page');
check('the lesson is written at the wrap site, not just in the handoff',
  /WRAPPING AN EXPORT ONLY WORKS IF THE\s*\n\s*\/\/\s*PRODUCT CALLS THE EXPORT/.test(src));

// ---- [6] the map is data, and covers the appendix ---------------------------
console.log('\n[qmap] the map itself');
{
  const ids = Q.MAP.map(b => b.id);
  check('the map is DATA (a walkable array), not hard-coded render',
    Array.isArray(Q.MAP) && Q.MAP.every(b => b.id && b.title && typeof b.probe === 'function'));
  check('it covers Q.3 through Q.17 with no holes',
    (() => { for (let n = 3; n <= 17; n++) if (ids.indexOf('Q.' + n) < 0) return false; return true; })(), JSON.stringify(ids));
  check('assessment order is preserved (AFHA before PASA before SSA before ASA)',
    ids.indexOf('Q.3') < ids.indexOf('Q.4') && ids.indexOf('Q.4') < ids.indexOf('Q.13') && ids.indexOf('Q.13') < ids.indexOf('Q.17'));
  check('every edge is a named claim with a runnable check',
    Q.EDGES.length >= 4 && Q.EDGES.every(e => e.id && e.label && typeof e.run === 'function'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

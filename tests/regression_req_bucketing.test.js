#!/usr/bin/env node
/*
 * Regression — requirement bucketing: FTA-derived auto-reqs stop leaking across scopes.
 * Build 66.27. Spec: BUILD_SPEC_Structured_Nodes_and_Bucketing.md §B1, UPGRADES §U-1.
 *
 * Waqas, 19 Aug 2026, looking at the live build:
 *   "why are showing L3 auto req requirements at the aircraft level shouldnt they be in
 *    their respective system buckets?"
 *
 * THE DEFECT. generate(opts, scope) hands the scope to every generator, but they honoured
 * it differently:
 *   - genFHA(fhaArrForScope(scope), scope)  — genuinely scope-filtered.
 *   - genFTAEvents / genDALgebra / genGateIndependence — NOT filtered. `scope` was used
 *     only to prefix reqSource.sourceId and to choose the destination store. The walk was
 *     walkAllPages(), i.e. every page in the project, with no test on treeLevel/systemId.
 *
 * So generating at aircraft scope emitted an L3 for every basic event on EVERY tree,
 * system trees included; and generating at each system scope emitted the SAME events again
 * into that system's store, the rows differing only by the `ac:` vs `sys-<id>:` prefix.
 * The seenLids dedupe is per-run and cannot see across buckets.
 *
 * It was invisible in the four-tree demo project because all four pages are
 * treeLevel 'aircraft' with systemId null and systemsData is empty — there was no system
 * bucket to mis-file into. It needs a project with real systems to show.
 *
 * THE FIX IS DELIBERATELY FAIL-SAFE. A page is attributed to a system only when its
 * systemId RESOLVES to a system that exists. A dangling systemId, or a page declaring
 * treeLevel 'system' with no systemId, falls back to the aircraft bucket — because the
 * failure mode of a strict rule is that requirements silently STOP being generated, which
 * is worse than the duplication being fixed. Those pages are reported by unownedPages() so
 * the fallback is a visible finding, not a quiet default (spec §B4).
 *
 * Everything below EXECUTES the real extracted code in a vm, with stores seeded through a
 * `let` prelude in the global lexical scope — bare identifiers, off-window, the way the
 * browser actually scopes them. No stubbing of the functions under test: the 18 Aug lesson
 * is that a stubbed dependency changes the answer instead of raising.
 *
 * Run: node tests/regression_req_bucketing.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const am = fs.readFileSync(path.join(SITE, 'assurance_modules.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

const X = re => { const m = am.match(re); if (!m) throw new Error('extraction failed: ' + re); return m[0]; };
const srcScopeKey  = X(/function _pageScopeKey\(page\)\{[\s\S]*?\n    \}/);
const srcInScope   = X(/function pageInScope\(page, scope\)\{[^\n]*\}/);
const srcWalkScope = X(/function walkPagesInScope\(scope, cb\)\{[\s\S]*?\n    \}/);
const srcUnowned   = X(/function unownedPages\(\)\{[\s\S]*?\n    \}/);
const srcFtaGen    = X(/function genFTAEvents\(scopeKey\)\{[\s\S]*?\n        return out;\n    \}/);
// 20 Aug 2026 — genFTAEvents moved from walkPagesInScope to walkNodesInScope when A2
// shipped (66.36), so this harness stopped providing everything the generator calls and
// the suite threw on load. It then reported GREEN for a day, because ship.sh discarded
// the exit code. These are the A2 helpers the node-level walk needs.
const srcXfer      = X(/function _transferTargetPage\(node\)\{[\s\S]*?\n    \}/);
const srcOwnerCtx  = X(/function _ownerCtx\(page\)\{[\s\S]*?\n    \}/);
const srcSysExists = X(/function _systemExists\(sysId\)\{[\s\S]*?\n    \}/);
const srcNodeScope = X(/function _nodeScopeKey\(node, page, ctx\)\{[\s\S]*?\n    \}/);
const srcAllocPgs  = X(/function _allocationPages\(\)\{[\s\S]*?\n    \}/);
const srcWalkNodes = X(/function walkNodesInScope\(scope, cb\)\{[\s\S]*?\n    \}/);
const srcMid       = X(/function _midSentence\(s\) \{[\s\S]*?\n    \}/);
const srcGovFha    = X(/function _governingFhaForPage\(page\)\{[\s\S]*?\n    \}/);
const srcGovAcc    = X(/function _govSafetyAccepted\(gov\)\{[\s\S]*?\n    \}/);

function world(opts) {
  opts = opts || {};
  const sb = { console, JSON, Math, Date, Set, Map, Array, Object, String, Number,
               isFinite, parseFloat, setTimeout, window: {}, __out: {} };
  vm.createContext(sb);
  const prelude = `
    let ftaPages     = ${JSON.stringify(opts.pages || [])};
    let acFhaData    = ${JSON.stringify(opts.acFha || [])};
    let systemsData  = ${JSON.stringify(opts.systems || [])};
    let acReqData    = [];
    let acFunctionsData = [];
    const SEVERITY_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1, 'No Effect': 0 };
    const SEV_ORDER = SEVERITY_RANK;
    function getPhaseExposureRatio(){ return { ratio: 1, exposedHours: 0, totalHours: 6.33, matchedPhases: [] }; }
    function getSafetyTarget(){ return { prob: 1e-9, dal: 'A', scope: 'AC 25.1309-1B' }; }
    function getNormalizedSafetyTarget(){ return { prob: 1e-9, dal: 'A', matchedPhases: [], exposureRatio: 1, exposedHours: 0, totalHours: 6.33 }; }
    function storeForScope(scope){ if (scope === 'ac') return acReqData; const s = systemsData.find(x => 'sys-' + x.id === scope); return s ? s.req : null; }
    function ccmrLatentSweep(){ return []; }
    function certBasisForChart(){ return { regulation: 'Part 25', acRef: 'AC 25.1309-1B', part23Class: '' }; }
    function decideAnalysisDepth(){ return { mode: 'qual-quant', clause: '17(d)' }; }
    function findLinkedSysFhaForAcFc(){ return null; }
    function findAcFhaForSysFc(){ return null; }
    function moreRestrictiveSev(a){ return a; }
    function _missionHoursForNormalization(){ return 6.33; }
    const fp = (...a) => a.map(x => JSON.stringify(x)).join('|');
  `;
  vm.runInContext(prelude + '\n' + srcScopeKey + '\n' + srcInScope + '\n' + srcWalkScope + '\n' +
    srcXfer + '\n' + srcOwnerCtx + '\n' + srcSysExists + '\n' + srcNodeScope + '\n' +
    srcAllocPgs + '\n' + srcWalkNodes + '\n' +
    srcUnowned + '\n' + srcMid + '\n' + srcGovFha + '\n' + srcGovAcc + '\n' + srcFtaGen +
    '\n;__out.fta = s => genFTAEvents(s);' +
    '\n __out.unowned = () => unownedPages();' +
    '\n __out.scopeKey = p => _pageScopeKey(p);', sb);
  return sb;
}

const be = (id, lid, name) => ({ id, logicalId: lid, type: 'basic', name, displayId: 'BE-' + id, probability: '1e-5' });

// One aircraft PASA tree and two system trees, exactly the shape that hid the defect.
const PROJECT = {
  systems: [{ id: 'eps', name: 'Electrical Power', fha: [], req: [] },
            { id: 'ecs', name: 'Environmental Control', fha: [], req: [] }],
  pages: [
    { id: 'pg-ac',  name: 'PASA · Loss of pitch control', treeLevel: 'aircraft',
      root: be(1, 101, 'Elevator actuator lane A fails') },
    { id: 'pg-eps', name: 'PSSA · EPS bus loss', treeLevel: 'system', systemId: 'eps',
      root: be(2, 202, '28V DC bus 1 lost') },
    { id: 'pg-ecs', name: 'PSSA · ECS pressure control', treeLevel: 'system', systemId: 'ecs',
      root: be(3, 303, 'Cabin pressure sensor drift') }
  ]
};

const ids = out => out.map(r => r.reqSource.sourceId).sort();

console.log('\n[1] The defect itself — a scope no longer claims other scopes\' events');
{
  const W = world(PROJECT);
  const ac  = ids(W.__out.fta('ac'));
  const eps = ids(W.__out.fta('sys-eps'));
  const ecs = ids(W.__out.fta('sys-ecs'));

  check('aircraft scope emits ONLY the aircraft tree\'s event',
    ac.length === 1 && ac[0] === 'ac:fta-event:101', ac.join(', '));
  check('aircraft scope does NOT emit the EPS event', ac.indexOf('ac:fta-event:202') === -1);
  check('aircraft scope does NOT emit the ECS event', ac.indexOf('ac:fta-event:303') === -1);
  check('EPS scope emits only its own', eps.length === 1 && eps[0] === 'sys-eps:fta-event:202', eps.join(', '));
  check('ECS scope emits only its own', ecs.length === 1 && ecs[0] === 'sys-ecs:fta-event:303', ecs.join(', '));

  // The duplication test, stated the way the defect actually bit: the SAME logicalId
  // must not appear in two buckets.
  const lidsIn = arr => arr.map(s => s.split(':').pop());
  const acL = lidsIn(ac), epsL = lidsIn(eps), ecsL = lidsIn(ecs);
  const overlap = acL.filter(l => epsL.indexOf(l) !== -1 || ecsL.indexOf(l) !== -1);
  check('no logicalId is emitted into more than one bucket', overlap.length === 0, overlap.join(', '));

  // And nothing is LOST: every quantified leaf still lands in exactly one bucket.
  const all = ac.concat(eps, ecs);
  check('every event still lands somewhere — none dropped by the filter', all.length === 3, all.join(', '));
}

console.log('\n[2] Attribution rule — resolves, and fails SAFE when it cannot');
{
  const W = world(PROJECT);
  const k = W.__out.scopeKey;
  check('a page with a resolving systemId belongs to that system',
    k({ systemId: 'eps' }) === 'sys-eps');
  check('an aircraft page belongs to the aircraft bucket',
    k({ treeLevel: 'aircraft' }) === 'ac');
  check('a standalone page belongs to the aircraft bucket',
    k({}) === 'ac');
  check('a DANGLING systemId falls back to aircraft rather than matching no scope',
    k({ systemId: 'ghost-system' }) === 'ac',
    'a strict rule here would silently stop generating those requirements');
  check('a system-level page with no systemId falls back to aircraft',
    k({ treeLevel: 'system' }) === 'ac');
  check('a null page does not throw', k(null) === 'ac');
}

console.log('\n[3] The fallback is a FINDING, not a quiet default (spec §B4)');
{
  const W = world({
    systems: PROJECT.systems,
    pages: PROJECT.pages.concat([
      { id: 'pg-ghost', name: 'PSSA · orphaned', treeLevel: 'system', systemId: 'ghost-system', root: be(4, 404, 'Orphan event') },
      { id: 'pg-nosys', name: 'PSSA · unattributed', treeLevel: 'system', root: be(5, 505, 'Unattributed event') },
      { id: 'pg-mirror', name: 'PSSA · EPS bus loss (Verification)', treeLevel: 'system', systemId: 'eps', verifies: 'pg-eps', root: be(6, 202, '28V DC bus 1 lost') }
    ])
  });
  const un = W.__out.unowned();
  const names = un.map(u => u.id).sort();
  check('both unattributable pages are reported', names.join(',') === 'pg-ghost,pg-nosys', names.join(','));
  check('each finding says WHY, not just that it happened',
    un.every(u => /does not resolve|no system is set/.test(u.reason)),
    un.map(u => u.reason).join(' | '));
  check('each finding names the bucket it fell back into', un.every(u => u.bucket === 'ac'));
  check('a properly attributed page is NOT reported', names.indexOf('pg-eps') === -1);
  check('a verification mirror is not reported — mirrors are evidence, not owners',
    names.indexOf('pg-mirror') === -1);

  // …and the fallback really does keep generating, which is the whole point of it.
  const ac = ids(W.__out.fta('ac'));
  check('the orphaned pages\' events still generate, into the aircraft bucket',
    ac.indexOf('ac:fta-event:404') !== -1 && ac.indexOf('ac:fta-event:505') !== -1, ac.join(', '));
  check('a verification mirror still generates nothing (Phase 61 unchanged)',
    ids(W.__out.fta('sys-eps')).length === 1);
}

console.log('\n[4] The demo project shape — why nobody saw this until 19 Aug');
{
  // Four aircraft-level pages, no systems at all. Every event is legitimately aircraft
  // scope, so the defect was invisible here and only shows on a project with systems.
  const W = world({ systems: [], pages: [
    { id: 'a', name: 'PASA · FC-A', treeLevel: 'aircraft', root: be(1, 11, 'shared bus') },
    { id: 'b', name: 'PASA · FC-B', treeLevel: 'aircraft', root: be(2, 12, 'display fails') }
  ]});
  const ac = ids(W.__out.fta('ac'));
  check('with no systems defined, everything is correctly aircraft scope', ac.length === 2, ac.join(', '));
  check('and nothing is reported unowned', W.__out.unowned().length === 0);
}

console.log('\n[5] Source wiring — no generator is left on the unfiltered walk');
{
  check('genFTAEvents walks in scope', /function genFTAEvents\(scopeKey\)\{[\s\S]*?walkPagesInScope\(scopeKey,/.test(am));
  check('genDALgebra walks in scope', /function genDALgebra\(scopeKey\)\{[\s\S]*?walkPagesInScope\(scopeKey,/.test(am));
  check('genGateIndependence walks in scope', /function genGateIndependence\(scopeKey\)\{[\s\S]*?walkPagesInScope\(scopeKey,/.test(am));
  check('NO generator still calls the unfiltered walkAllPages',
    !/walkAllPages\(\(node, page\)/.test(am),
    'walkAllPages may exist, but nothing that builds a scoped sourceId may use it');
  check('genFHA\'s maintenance-implements walk is scoped too',
    /if \(!pageInScope\(p, scopeKey\)\) return;/.test(am),
    'it builds ${scopeKey}:fta-interval: ids, so it must not claim other scopes\' trees');
  check('the attribution helpers are exported for the UI and the wall',
    /pageScopeKey: _pageScopeKey, pageInScope, walkPagesInScope, unownedPages/.test(am));

  // 20 Aug 2026 — this used to split major/minor by hand, which was the right instinct
  // (parseFloat reads 1.20 as 1.2, so a stale 1.9 would clear a 1.20 floor) but was only
  // ever applied here. tests/lib/pinfloor.js does it once for the whole wall.
  check('assurance_modules pin bumped (floor, not a literal)',
    PIN.atLeast(idx, 'assurance_modules.js', '1.20'),
    'pin=' + PIN.pinOf(idx, 'assurance_modules.js'));
}

console.log('\n' + (fail === 0 ? 'ALL GREEN — ' + pass + ' checks' : 'RED — ' + fail + ' failed, ' + pass + ' passed'));
process.exit(fail === 0 ? 0 : 1);

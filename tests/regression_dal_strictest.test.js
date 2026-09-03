#!/usr/bin/env node
/*
 * Regression — A5: DAL strictest across trees (22 Aug 2026).
 *   The sweep allocates ALL seeded root families in one pass (the old sweep kept
 *   exactly one family's DALs in memory), and the register (genDALgebra) takes
 *   the MAX of the resulting DALs per shared event — governing derivation cited,
 *   disagreeing trees NAMED, reduction arguments never merged. Zero churn when
 *   trees agree: sourceIds keep the governing page, fingerprints gain tokens only
 *   on disagreement.
 * Run: node tests/regression_dal_strictest.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const slice = (src, from, to, label) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('slice anchors missing: ' + label);
  return src.slice(a, b);
};

globalThis.window = globalThis;
globalThis.SLEnv = { get: n => globalThis[n] };

// ---- engine slices ---------------------------------------------------------
globalThis.DAL_ORDER = ['A', 'B', 'C', 'D', 'E'];
globalThis.SEVERITY_RANK = { 'No Safety Effect': 1, Negligible: 1, Minor: 2, Major: 3, Hazardous: 4, Catastrophic: 5 };
(0, eval)(slice(S('helpers_modules.js'), 'function dalDecrement', '// Color for the canvas badge', 'helpers dal fns'));
(0, eval)(slice(S('support_modules.js'), 'function clearAllAllocations', '// Component library for basic-event input mode', 'support allocator'));
(0, eval)(slice(S('misc_fn_modules.js'), 'function propagateDalFromTrueRoot', 'function refreshFtaMissionProfileDropdown', 'misc dal sweep'));
(0, eval)(slice(S('assurance_modules.js'), 'function hashStr', 'function walkAllPages', 'assurance fp'));
(0, eval)(slice(S('assurance_modules.js'), 'function genDALgebra', '// ----- Generator 4', 'assurance genDALgebra'));

// ---- fixture ---------------------------------------------------------------
const mkPages = () => ([
  { id: 'p1', name: 'PASA · Cat',   linkedFhaId: 101, root: { id: 1, type: 'gate', gateType: 'OR', children: [
      { id: 11, logicalId: 'X', type: 'basic' },
      { id: 12, type: 'basic' } ] } },
  { id: 'p2', name: 'PASA · Major', linkedFhaId: 102, root: { id: 2, type: 'gate', gateType: 'OR', children: [
      { id: 21, logicalId: 'X', type: 'basic' } ] } },
]);
globalThis.ftaPages = mkPages();
globalThis.ftaConfig = {};
globalThis.cmaData = [];
globalThis.projectConfig = { autoreqDalMode: 'explicit' };
globalThis.getRootAncestorPage = p => p;                       // no transfer chains in fixture
globalThis.getRootAncestorPageOfActive = () => ftaPages[0];
globalThis._resolveLinkedFha = id => id === 101 ? { severity: 'Catastrophic' } : id === 102 ? { severity: 'Major' } : null;
globalThis.getSafetyTarget = sev => sev === 'Catastrophic' ? { dal: 'A' } : { dal: 'C' };
globalThis.walkPagesInScope = (scope, cb) => ftaPages.forEach(p => {
  (function w(n) { if (!n) return; cb(n, p); (n.children || []).forEach(w); })(p.root);
});

// ---- the sweep: every seeded family, one pass ------------------------------
const fams = propagateDalAllRoots();
check('ALL seeded root families allocate in one pass (the old sweep kept one)',
  fams === 2 && ftaPages[0].root.allocatedDAL === 'A' && ftaPages[1].root.allocatedDAL === 'C',
  JSON.stringify([fams, ftaPages[0].root.allocatedDAL, ftaPages[1].root.allocatedDAL]));
check('per-family derivations stay separate on the NODES (no cross-tree merge in the trees)',
  ftaPages[0].root.children[0].allocatedDAL === 'A' && ftaPages[1].root.children[0].allocatedDAL === 'C');

// ---- the register: one row per event, at the max ---------------------------
let rows = genDALgebra('ac');
const xRows = rows.filter(r => r.reqSource.sourceId.endsWith(':X'));
check('one register row per shared event — not one per tree', xRows.length === 1, JSON.stringify(rows.map(r => r.reqSource.sourceId)));
check('the register takes the MAX of the resulting DALs (A over C)', xRows[0] && / A\.$/.test(xRows[0].text), xRows[0] && xRows[0].text);
check('sourceId carries the GOVERNING page (no churn for the strict tree)', xRows[0].reqSource.sourceId === 'ac:dalgebra:p1:X');
check('rationale NAMES the disagreeing derivation and refuses to merge arguments',
  /PASA · Major derives C/.test(xRows[0].rat) && /not merged/.test(xRows[0].rat) && /Governing derivation: PASA · Cat/.test(xRows[0].rat),
  xRows[0].rat);
check('context.disagree records the competing tree', Array.isArray(xRows[0].reqSource.context.disagree) && xRows[0].reqSource.context.disagree.length === 1);

// ---- order independence ----------------------------------------------------
globalThis.ftaPages = mkPages().reverse();
propagateDalAllRoots();
const revRows = genDALgebra('ac').filter(r => r.reqSource.sourceId.endsWith(':X'));
check('walk order cannot flip the outcome — strictest governs from either direction',
  revRows.length === 1 && / A\.$/.test(revRows[0].text) && revRows[0].reqSource.sourceId === 'ac:dalgebra:p1:X',
  JSON.stringify(revRows.map(r => [r.reqSource.sourceId, r.text])));

// ---- zero churn on agreement ----------------------------------------------
globalThis.ftaPages = mkPages();
ftaPages[1].linkedFhaId = 101;                                  // both trees now derive A
propagateDalAllRoots();
const agreeRow = genDALgebra('ac').find(r => r.reqSource.sourceId.endsWith(':X'));
globalThis.ftaPages = [mkPages()[0]];                           // single tree
propagateDalAllRoots();
const soloRow = genDALgebra('ac').find(r => r.reqSource.sourceId.endsWith(':X'));
check('agreeing trees add NO disagreement note and NO fingerprint tokens (zero churn)',
  agreeRow && soloRow && agreeRow.reqSource.fingerprint === soloRow.reqSource.fingerprint
  && !/Strictest across trees/.test(agreeRow.rat) && agreeRow.reqSource.context.disagree === undefined,
  agreeRow && agreeRow.rat);
globalThis.ftaPages = mkPages();
propagateDalAllRoots();
const disRow = genDALgebra('ac').find(r => r.reqSource.sourceId.endsWith(':X'));
check('a disagreement CHANGES the fingerprint (stale-flagging sees the movement)',
  disRow.reqSource.fingerprint !== soloRow.reqSource.fingerprint);

// ---- compressed mode rides the same per-event set --------------------------
projectConfig.autoreqDalMode = 'compressed';
const comp = genDALgebra('ac');
const defRow = comp.find(r => r.reqSource.generator === 'dalgebra-default');
check('compressed mode counts EVENTS, not per-tree allocations',
  defRow ? defRow.reqSource.context.totalCount === 4 : comp.length === 4,   // gates 1,2 + lids X,12 — X once, not twice
  JSON.stringify(comp.map(r => r.reqSource.sourceId)));
const compX = comp.find(r => r.reqSource.sourceId.endsWith(':X'));
check('compressed mode: the shared event still lands at the max, disagreement named',
  (compX ? / A\.$/.test(compX.text) && /not merged/.test(compX.rat) : !!defRow),
  compX ? compX.rat : 'folded into default');
projectConfig.autoreqDalMode = 'explicit';

// ---- A11: linkedFhaIds-only pages seed --------------------------------------
globalThis.ftaPages = mkPages();
delete ftaPages[0].linkedFhaId;
ftaPages[0].linkedFhaIds = [101];        // the newer multi-FHA link, NO legacy scalar
propagateDalAllRoots();
check('A11: a page linked ONLY via linkedFhaIds[] seeds (the K350 FC-09 gap)',
  ftaPages[0].root.allocatedDAL === 'A', ftaPages[0].root.allocatedDAL);
ftaPages[0].linkedFhaIds = [102];
ftaPages[0].linkedFhaId = 101;           // both set → the array governs (Phase 28 rule: the page's list is the truth)
propagateDalAllRoots();
check('A11: when both fields exist the ARRAY governs', ftaPages[0].root.allocatedDAL === 'C', ftaPages[0].root.allocatedDAL);
delete ftaPages[0].linkedFhaIds;
propagateDalAllRoots();
check('A11: the legacy scalar still seeds on its own', ftaPages[0].root.allocatedDAL === 'A');

// ---- legacy seams kept -----------------------------------------------------
globalThis.ftaPages = mkPages();
delete ftaPages[0].linkedFhaId;
globalThis.ftaConfig = { linkedFhaId: 101 };
propagateDalFromTrueRoot();
check('legacy ftaConfig seed still reaches the ACTIVE family (and only it)',
  ftaPages[0].root.allocatedDAL === 'A' && ftaPages[1].root.allocatedDAL === 'C');
globalThis.ftaConfig = {};
delete ftaPages[1].linkedFhaId;
ftaPages[0].root.allocatedDAL = 'B';                            // pre-existing manual state
const n0 = propagateDalAllRoots();
check('no seed anywhere → existing DALs left untouched (old early-return kept)',
  n0 === 0 && ftaPages[0].root.allocatedDAL === 'B');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

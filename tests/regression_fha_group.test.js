#!/usr/bin/env node
/*
 * Regression — FHA-G: the workbook groups same-FC-ID phase rows (22 Aug 2026;
 * Waqas 21 Aug: "we do need this").
 *   The App Q pattern: ONE failure condition classified per phase under ONE id
 *   (3.2.2.TL.U — Major in Taxi, Catastrophic in Landing). The model already
 *   tolerates sibling rows sharing an fcId; the workbook now CLUSTERS them
 *   (render order only — the store is untouched), badges the head with the
 *   count and the WORST severity (worst case governs the fault trees, B3
 *   ruling), and every row can author a phase variant under the same id.
 * Run: node tests/regression_fha_group.test.js
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

const helpers = S('helpers_modules.js');
(0, eval)(slice(helpers, 'function _fhaGroupRows', 'function renderACFHA() {', 'fha grouping + variant author'));

// ---- the pure grouping ------------------------------------------------------
const rows = [
  { internalId: 1, fcId: 'FC-A', severity: 'Major',        phases: 'Taxi' },
  { internalId: 2, fcId: 'FC-B', severity: 'Minor',        phases: 'Cruise' },
  { internalId: 3, fcId: 'FC-A', severity: 'Catastrophic', phases: 'Landing' },
  { internalId: 4, fcId: '',     severity: 'Major',        phases: 'Cruise' },
  { internalId: 5, fcId: 'FC-C', severity: 'Hazardous',    phases: 'Climb' },
];
let g = _fhaGroupRows(rows);
// 31 Aug 2026 — SUPERSEDED: was '1,3,2,4,5' (first-occurrence cluster order).
// Waqas: "failure conditions should be in alpha numeric ascending order where
// FC-1 shows first, then FC-2 and so on." Clusters still hold (FC-A's two rows
// stay adjacent, head first); the clusters now SORT by id and blank-id rows go
// last: FC-A(1,3), FC-B(2), FC-C(5), blank(4).
check('same-fcId rows cluster AND clusters sort ascending by id, blank ids last',
  g.ordered.map(r => r.internalId).join(',') === '1,3,2,5,4', g.ordered.map(r => r.internalId).join(','));
// natural compare: FC-10 sorts after FC-2, never between FC-1 and FC-2
const nat = _fhaGroupRows([
  { internalId: 21, fcId: 'FC-10', severity: 'Minor' },
  { internalId: 22, fcId: 'FC-2',  severity: 'Minor' },
  { internalId: 23, fcId: 'FC-1',  severity: 'Minor' },
]);
check('NATURAL ascending order — FC-1, FC-2, FC-10 (numeric compare, not lexicographic)',
  nat.ordered.map(r => r.fcId).join(',') === 'FC-1,FC-2,FC-10', nat.ordered.map(r => r.fcId).join(','));
check('the group knows its size and its WORST severity (Catastrophic over Major — worst case governs)',
  g.groups.get('FC-A').count === 2 && g.groups.get('FC-A').worst === 'Catastrophic' && g.groups.get('FC-A').headId === 1);
check('solo rows form no group', !g.groups.has('FC-B') && !g.groups.has('FC-C'));
check('an EMPTY fcId never groups (each such row stands alone)',
  g.ordered.some(r => r.internalId === 4) && ![...g.groups.keys()].some(k => k === ''));
check('the input array is not mutated', rows.map(r => r.internalId).join(',') === '1,2,3,4,5');
g = _fhaGroupRows([{ internalId: 9, fcId: 'FC-X', severity: 'Negligible' }, { internalId: 10, fcId: 'FC-X', severity: 'No Safety Effect' }]);
check('low-severity vocabulary ranks without crashing', g.groups.get('FC-X').count === 2 && /Negligible|No Safety Effect/.test(g.groups.get('FC-X').worst));

// ---- the variant author -----------------------------------------------------
globalThis.acFhaData = [
  { internalId: 1, subId: 'SF-01', fcId: 'FC-A', fcDesc: 'Loss of X', phases: 'Taxi', effAc: 'a', effCrew: 'c', effPax: 'p', severity: 'Major', assumptionIds: [7], comments: 'orig' },
  { internalId: 2, subId: 'SF-02', fcId: 'FC-B', fcDesc: 'Other', phases: 'Cruise', severity: 'Minor', assumptionIds: [] },
];
let _saves = 0, _toasts = [];
globalThis.commitSaveChanges = () => { _saves++; };
globalThis.showToast = m => { _toasts.push(m); };
globalThis.renderACFHA = () => {};
globalThis.newRowId = (() => { let n = 100; return () => ++n; })();
acFhaAddPhaseVariant(1);
const v = acFhaData[1];
check('the variant lands RIGHT AFTER its source (the group reads as one)',
  acFhaData.length === 3 && v.internalId === 101 && acFhaData[2].internalId === 2);
check('same condition, same id — phases BLANK for the engineer to pick',
  v.fcId === 'FC-A' && v.subId === 'SF-01' && v.fcDesc === 'Loss of X' && v.phases === '');
check('effects/severity/assumptions carry over as a starting point; comments do not',
  v.effAc === 'a' && v.severity === 'Major' && v.assumptionIds.length === 1 && v.assumptionIds !== acFhaData[0].assumptionIds && v.comments === '');
check('the split is SAVED and the toast says worst case governs',
  _saves === 1 && /worst case/.test(_toasts[0]));
check('a missing source id is a no-op', (acFhaAddPhaseVariant(999), acFhaData.length === 3));

// ---- the rendered markup (rule 11) -----------------------------------------
const src = helpers;
check('the head row wears the phase-group badge with count and worst severity',
  /phase group × \$\{_grp\.count\} · worst \$\{esc\(_grp\.worst\)\}/.test(src));
check('the badge tooltip teaches the App Q pattern and the worst-case rule',
  /classified per phase \(ARP4761A App Q pattern\)/.test(src) && /fault trees take the group's worst case/.test(src));
check('member rows read as continuations (└), muted, with a title explaining membership',
  /└ \$\{esc\(row\.fcId\)\}/.test(src) && /data-fha-group-member="1"/.test(src));
check('every row\'s menu offers "Add phase variant"', /⧉ Add phase variant/.test(src) && /acFhaAddPhaseVariant\(/.test(src));
check('the paginator renders the GROUPED order over the full store',
  /rows: _fhaGrouping\.ordered, rowHtml: _fhaRowHtml/.test(src));
// 31 Aug 2026 — the SYS table and both FHA CSV exports ride the same ordered view.
check('renderSysFHA renders the ordered view (natural ascending, groups clustered)',
  /_fhaGroupRows\(sys\(\)\.fha\)\.ordered/.test(src) && /rows: _sysFhaOrdered/.test(src));
const dataOps = S('data_ops_modules.js');
check('AC_FHA CSV export rides the ordered view', /_fhaGroupRows\(acFhaData\)\.ordered/.test(dataOps));
check('Sys_FHA CSV export rides the ordered view', /_fhaGroupRows\(sys\(\)\.fha\)\.ordered/.test(dataOps));

/* ---- 31 Aug 2026 — FC ID STABILITY ACROSS PHASES, EXECUTED -----------------
 * Waqas: "a failure condition ID does not change when evaluating a failure
 * condition across different phases of flight" — AI artifacts minted a fresh
 * sequential id per phase row. _slAssignFcId now reuses by identity
 * (sub-function + normalized condition text, per system for SFHA); these
 * checks run the REAL assigner + _slAutoNumber against a fake numbering
 * engine and assert what ids actually land. */
(function () {
  const seg = slice(helpers, 'function _slNumberCtx', 'function _slMaxTrailingSeq', 'numbering assigners');
  let seq = 0; const sharedMap = {};
  globalThis.SafetyLabNumbering = {
    makeId: () => 'FC-' + (++seq),
    makeSharedId: (scheme, kind, key) => { if (sharedMap[key] == null) sharedMap[key] = 'FC-' + (++seq); return sharedMap[key]; },
  };
  globalThis.slNumberingScheme = { templates: {} };
  globalThis.slNumberingStore = { map: {}, counters: {} };
  globalThis.acFunctionsData = [];
  globalThis.acFhaData = [];
  globalThis.activeSystemId = '';
  (0, eval)(seg);

  // same condition, two phase rows -> ONE id (in-batch, before either is stored)
  const r1 = { subId: 'SF-01', fcDesc: 'Total loss of braking', fcId: '', phases: 'Landing' };
  const r2 = { subId: 'SF-01', fcDesc: 'Total loss of braking', fcId: '', phases: 'Taxi' };
  _slAutoNumber('acFha', r1); acFhaData.push(r1);
  _slAutoNumber('acFha', r2); acFhaData.push(r2);
  check('the SAME condition in another phase keeps the SAME fcId', r1.fcId === r2.fcId && !!r1.fcId, r1.fcId + ' vs ' + r2.fcId);
  // and a third, later (store-scan path, shared map cold)
  delete sharedMap['cond:sf-01|total loss of braking'];
  const r3 = { subId: 'SF-01', fcDesc: 'Total Loss of Braking', fcId: '', phases: 'RTO' };   // case differs — normalized match
  _slAutoNumber('acFha', r3);
  check('a later phase row REUSES the stored row\'s id (case-insensitive match)', r3.fcId === r1.fcId);
  // a different condition mints a different id
  const r4 = { subId: 'SF-01', fcDesc: 'Asymmetric braking', fcId: '' };
  _slAutoNumber('acFha', r4);
  check('a DIFFERENT condition mints a different id', r4.fcId && r4.fcId !== r1.fcId);
  // same text on a different sub-function is a different condition
  const r5 = { subId: 'SF-02', fcDesc: 'Total loss of braking', fcId: '' };
  _slAutoNumber('acFha', r5);
  check('same text on a DIFFERENT sub-function is a different condition', r5.fcId && r5.fcId !== r1.fcId);
  // manual entry always wins
  const r6 = { subId: 'SF-01', fcDesc: 'Total loss of braking', fcId: 'FC-HAND' };
  _slAutoNumber('acFha', r6);
  check('a manually entered fcId is never overwritten', r6.fcId === 'FC-HAND');
  // SFHA: per-system scope — same condition text in ANOTHER system gets its own id
  globalThis.sys = () => ({ id: 'NAV', fha: [] });
  globalThis.activeSystemId = 'NAV';
  const s1 = { subId: 'NF-01', fcDesc: 'Loss of position', fcId: '' };
  _slAutoNumber('sysFha', s1);
  globalThis.sys = () => ({ id: 'EPS', fha: [] });
  globalThis.activeSystemId = 'EPS';
  const s2 = { subId: 'NF-01', fcDesc: 'Loss of position', fcId: '' };
  _slAutoNumber('sysFha', s2);
  check('SFHA identity is scoped per system (no cross-system id reuse)', s1.fcId && s2.fcId && s1.fcId !== s2.fcId);
  check('the AI accept path reaches this assigner (wiring pin)',
    /key === 'acFha'\) \{ _slAssignFcId\(/.test(helpers) && /key === 'sysFha'\) \{ _slAssignFcId\(/.test(helpers));
})();
const idx = S('index.html');
check('pin: helpers ≥2.58 (floor, rule 12)', parseFloat((idx.match(/helpers_modules\.js\?v=([\d.]+)/) || [])[1]) >= 2.58);

/* ---- 31 Aug 2026 — FCIM ID CARRIED FORWARD TO THE FHA, EXECUTED ------------
 * Waqas: "failure conditions IDs in the FCIM should be the one carried forward
 * to the FHA in the FC ID column." The REAL _applyFhaSuggestion runs against a
 * fake environment: a valid srcCondId lands the STORE's canonical id as fcId +
 * sourceCondId; a hallucinated id falls back to the minting path; the manual
 * form's dropdown already carried FCIM ids, so this makes the AI path match. */
(function () {
  const vm = require('vm');
  const ai = S('ai_assistant.js');
  function fn(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return null;
    let depth = 0, started = false, inS = null, esc2 = false, line = false, blk = false;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
      const c = src[k], n = src[k + 1];
      if (line) { if (c === '\n') line = false; continue; }
      if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
      if (esc2) { esc2 = false; continue; }
      if (c === '\\') { esc2 = true; continue; }
      if (inS) { if (c === inS) inS = null; continue; }
      if (c === '/' && n === '/') { line = true; k++; continue; }
      if (c === '/' && n === '*') { blk = true; k++; continue; }
      if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
      if (c === '{') { depth++; started = true; }
      else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
    }
    return null;
  }
  const src = fn(ai, '_applyFhaSuggestion');
  check('extracted _applyFhaSuggestion', !!src);
  if (!src) return;
  let minted = 0;
  const ctx = {
    console, Date, Math, JSON, Array, String, Object,
    newRowId: (() => { let n = 500; return () => ++n; })(),
    _validPhases: (p) => Array.isArray(p) ? p : [],
    _SEV_ANCHORS: { 'CAT-1': 'anchor text' },
    _skillStampFor: () => 'fha.draft@v2#test',
    _slAutoNumber: (key, data) => { if (!data.fcId) data.fcId = 'FC-MINTED-' + (++minted); return data; },
    acExtractedFCs: [ { id: 'SF-001-TL', desc: 'Total loss of braking', subId: 'SF-001' } ],
    acFhaData: [],
    systemsData: [ { id: 'NAV', extractedFCs: [ { id: 'NAV-SF-01-M', desc: 'Misleading position', subId: 'NAV-SF-01' } ], fha: [] } ],
    renderACFHA: () => {}, renderACAssumptions: () => {}, renderSysFHA: () => {},
    scheduleAutosave: () => {}, _aiConsistencyAutoCheck: () => {}, _toast: () => {},
    // 3 Sep 2026 — the accept path now promotes declared assumptions and derives the
    // class from the three effect levels; both are module-internal helpers.
    _promoteDeclaredAssumptions: () => [], _axisLevel: () => '', _axisDerive: () => null,
  };
  vm.createContext(ctx);
  vm.runInContext(src + '; globalThis.__ap = _applyFhaSuggestion;', ctx);
  // 1. valid srcCondId (case-drifted echo) -> canonical FCIM id carried forward
  ctx.__ap({ subId: 'SF-001', fcDesc: 'Total loss of braking', phases: ['Landing'], srcCondId: 'sf-001-tl' });
  const r1 = ctx.acFhaData[0];
  check('a valid srcCondId lands the STORE\'s canonical FCIM id as fcId', r1 && r1.fcId === 'SF-001-TL', r1 && r1.fcId);
  check('the accepted row carries sourceCondId (30 Aug debt closed)', r1 && r1.sourceCondId === 'SF-001-TL');
  // 2. second phase row, same condition -> same carried id (no per-phase fork)
  ctx.__ap({ subId: 'SF-001', fcDesc: 'Total loss of braking', phases: ['Taxi'], srcCondId: 'SF-001-TL' });
  check('the same condition in another phase keeps the SAME carried id', ctx.acFhaData[1].fcId === 'SF-001-TL');
  // 3. hallucinated srcCondId -> echo REFUSED, minting fallback, no fabricated trace
  ctx.__ap({ subId: 'SF-009', fcDesc: 'Invented condition', phases: [], srcCondId: 'SF-999-XX' });
  const r3 = ctx.acFhaData[2];
  check('a hallucinated srcCondId is refused — minted fallback, empty sourceCondId',
    r3 && /^FC-MINTED-/.test(r3.fcId) && r3.sourceCondId === '', r3 && (r3.fcId + '/' + r3.sourceCondId));
  // 4. sys scope resolves against THAT system's extracted conditions
  ctx.__ap({ subId: 'NAV-SF-01', fcDesc: 'Misleading position', phases: [], srcCondId: 'nav-sf-01-m', _systemId: 'NAV', _systemName: 'Nav' });
  const rs = ctx.systemsData[0].fha[0];
  check('SFHA: srcCondId resolves against that system\'s extractedFCs', rs && rs.fcId === 'NAV-SF-01-M');
  // 5. wiring: the executor passes srcCondId through to the apply
  check('add_fha executor passes srcCondId to the apply (wiring pin)', /sevBasis: a\.sevBasis, srcCondId: a\.srcCondId/.test(ai));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

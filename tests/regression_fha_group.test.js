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
// 4 Sep 2026 (Waqas): a legitimate per-phase split is standard practice and wears NO badge;
// only duplicates, contradictions and consolidation candidates are announced.
check('a legitimate phase split wears no badge; the finding badges remain',
  !/phase group × \$\{n\}/.test(src) && /fha-group-dup/.test(src) && /fha-group-contra/.test(src) && /fha-group-merge/.test(src)
  && /_grpWorst = _grp && _grp\.worst \? \('worst ' \+ esc\(_grp\.worst\)\) : 'unclassified'/.test(src));
// 3 Sep 2026 — the badge must never print "worst " with nothing after it, and must
// not call duplicates a phase group. See the executed block at the end of this file.
check('a group with no committed severity says "unclassified", never a dangling "worst"',
  /: 'unclassified'/.test(src));
check('duplicates get their OWN badge, not the phase-group one',
  /fha-group-dup/.test(src) && /duplicate rows · same phases/.test(src));
check('the duplicate tooltip says what to do about it',
  /Merge or delete the extras/.test(src) && /repeated drafts accepted into the project/.test(src));
// 4 Sep 2026 — the per-phase badge (and its tooltip) is gone; the worst-case rule lives in the
// member-row title and the tree binding, not in a pill.
check('no per-phase badge tooltip remains', !/classified per phase \(ARP4761A App Q pattern\)/.test(src));
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
    _macCommentFor: () => '',   // 4 Sep 2026 (evening) — the MAC note on the comment; exercised in regression_thread_mac
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
  // 3 Sep 2026 — accept now de-dups through _fhaUpsert (+ its phase key) and sweeps
  // the AI ledger; those are real code, not stubs, so they ride in with the function.
  const helpersSrc = ['_fhaPhaseKeyOf', '_fhaUpsert', '_promoteLedgerForFha'].map(n => fn(ai, n)).join('\n');
  check('extracted the accept-path helpers (_fhaPhaseKeyOf / _fhaUpsert / _promoteLedgerForFha)', /_fhaUpsert/.test(helpersSrc) && /_fhaPhaseKeyOf/.test(helpersSrc));
  vm.runInContext(helpersSrc + '\n' + src + '; globalThis.__ap = _applyFhaSuggestion; globalThis.__up = _fhaUpsert;', ctx);
  // 1. valid srcCondId (case-drifted echo) -> canonical FCIM id carried forward
  ctx.__ap({ subId: 'SF-001', fcDesc: 'Total loss of braking', phases: ['Landing'], srcCondId: 'sf-001-tl' });
  const r1 = ctx.acFhaData[0];
  check('a valid srcCondId lands the STORE\'s canonical FCIM id as fcId', r1 && r1.fcId === 'SF-001-TL', r1 && r1.fcId);
  check('the accepted row carries sourceCondId (30 Aug debt closed)', r1 && r1.sourceCondId === 'SF-001-TL');
  // 4 Sep 2026 — the model echoes the CONDITION id into subId; the row takes the
  // sub-function from the condition record so the table can show its name.
  check('the row\'s subId is the condition\'s SUB-FUNCTION (SF-001), not the condition id', r1 && r1.subId === 'SF-001', r1 && r1.subId);
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

  // ---- 3 Sep 2026 — ACCEPT NO LONGER STACKS DUPLICATES (Waqas: "consolidated to 1")
  const before = ctx.acFhaData.length;
  // same condition, same phases, AI-written and untouched -> UPDATED IN PLACE
  const r = ctx.__ap({ subId: 'SF-001', fcDesc: 'Total loss of braking (redraft)', phases: ['Landing'], srcCondId: 'SF-001-TL', severity: 'Hazardous' });
  check('re-accepting the same condition + phases does NOT add a row', ctx.acFhaData.length === before, before + ' -> ' + ctx.acFhaData.length);
  check('… it updates the existing row in place (text moved, id kept)', r === true && ctx.acFhaData[0].fcDesc === 'Total loss of braking (redraft)' && ctx.acFhaData[0].internalId === 501);
  check('… and counts the redraft', ctx.acFhaData[0].aiRedrafts === 1);
  check('the apply reports what it did', ctx.__ap._last && ctx.__ap._last.action === 'updated');
  // phase order does not fake a new row
  ctx.__ap({ subId: 'SF-001', fcDesc: 'Total loss of braking', phases: ['Landing'], srcCondId: 'sf-001-tl' });
  check('the same phases in another order / case are still the same row', ctx.acFhaData.length === before);
  // a row a person edited is PROTECTED
  ctx.acFhaData[0].humanEdited = true; ctx.acFhaData[0].humanEditedAt = '2026-09-03T21:00:00Z';
  const _keep = ctx.acFhaData[0].fcDesc;
  const p = ctx.__ap({ subId: 'SF-001', fcDesc: 'Total loss of braking (third draft)', phases: ['Landing'], srcCondId: 'SF-001-TL' });
  check('a hand-edited row is never overwritten by a re-draft', p === 'protected' && ctx.acFhaData[0].fcDesc === _keep, String(p) + ' / ' + ctx.acFhaData[0].fcDesc);
  check('… and the newer draft is noted ON the protected row', !!ctx.acFhaData[0].aiNewerDraftAt && /edited by hand/.test(ctx.acFhaData[0].aiNewerDraftNote));
  check('… still no extra row', ctx.acFhaData.length === before);
  // a different phase set is a genuinely new row (the per-phase split)
  ctx.__ap({ subId: 'SF-001', fcDesc: 'Total loss of braking', phases: ['Takeoff'], srcCondId: 'SF-001-TL', severity: 'Catastrophic' });
  check('a different phase set for the same condition IS a new row', ctx.acFhaData.length === before + 1);
  // no stable identity -> cannot de-dup, so it adds (never merges the wrong rows)
  const n0 = ctx.acFhaData.length;
  ctx.__ap({ subId: 'SF-010', fcDesc: 'No source id', phases: ['Cruise'] });
  ctx.__ap({ subId: 'SF-010', fcDesc: 'No source id', phases: ['Cruise'] });
  check('rows with no sourceCondId are never merged (identity unknown)', ctx.acFhaData.length === n0 + 2);

  // ---- judgement call: flag on the row, note filed as an assumption ------------
  let promoted = [];
  ctx._promoteDeclaredAssumptions = (list) => { promoted = list || []; return (list || []).map((a, i) => 'ASM-T-' + i); };
  ctx.__ap({ subId: 'SF-011', fcDesc: 'Judged row', phases: ['Cruise'], srcCondId: 'SF-001-TL', severity: 'Major', judgementCall: true, judgementNote: 'No gear retraction data; assumed retractable per class.' });
  const jr = ctx.acFhaData[ctx.acFhaData.length - 1];
  check('judgementCall lands on the row as a first-class field', jr && jr.judgementCall === true && /gear retraction/.test(jr.judgementNote));
  check('the judgement note is filed as an assumption of type judgement', promoted.some(a => a.type === 'judgement' && /JUDGEMENT CALL/.test(a.text)));
  check('… and the row cites it in its assumptions column', Array.isArray(jr.assumptionIds) && jr.assumptionIds.length === 1);
  check('the comment shouts it too', /⚠ JUDGEMENT CALL/.test(jr.comments));
})();

// ---- EXECUTED: a group must PROVE it partitions the phases (3 Sep 2026) --------
// Waqas, on a badge reading "phase group × 3 · worst Hazardous" over three rows
// with identical phase lists: "why is the AI not splitting it into two rows rather
// than saying that … it's there to help not to confuse." Sharing an fcId was the
// only test, so three accepted drafts of one condition were announced as a
// deliberate per-phase classification. These pin the distinction.
(() => {
  const g = rows => _fhaGroupRows(rows).groups;

  // three accepted drafts of ONE condition: same phases every time
  const dup = g([
    { internalId: 1, fcId: 'SF-001-M', phases: 'Takeoff, Climb, Cruise', severity: 'Hazardous' },
    { internalId: 2, fcId: 'SF-001-M', phases: 'Takeoff, Climb, Cruise', severity: 'Hazardous' },
    { internalId: 3, fcId: 'SF-001-M', phases: 'Takeoff, Climb, Cruise', severity: 'Hazardous' },
  ]).get('SF-001-M');
  check('identical phase coverage and class is DUPLICATES, not a phase group', dup && dup.kind === 'duplicate', dup && dup.kind);
  check('the duplicate group still reports its count', dup && dup.count === 3);

  // a real App Q split: same condition, different phases, different classes
  const ph = g([
    { internalId: 1, fcId: 'SF-002-TL', phases: 'Taxi', severity: 'Major' },
    { internalId: 2, fcId: 'SF-002-TL', phases: 'Landing', severity: 'Catastrophic' },
  ]).get('SF-002-TL');
  check('genuinely different phases ARE a phase group', ph && ph.kind === 'phase', ph && ph.kind);
  check('the phase group takes the worst class across phases', ph && ph.worst === 'Catastrophic', ph && ph.worst);
  check('the phase group reports how many distinct phase sets it spans', ph && ph.distinctPhaseSets === 2);

  // ordering must not fake a difference
  const ord = g([
    { internalId: 1, fcId: 'SF-003-M', phases: 'Takeoff, Cruise', severity: 'Minor' },
    { internalId: 2, fcId: 'SF-003-M', phases: 'Cruise,Takeoff',  severity: 'Minor' },
  ]).get('SF-003-M');
  check('phase order and spacing do not invent a phase group', ord && ord.kind === 'duplicate', ord && ord.kind);

  // blank phases on both sides are still the same (empty) coverage
  const blank = g([
    { internalId: 1, fcId: 'SF-004-M', phases: '', severity: '' },
    { internalId: 2, fcId: 'SF-004-M', phases: '', severity: '' },
  ]).get('SF-004-M');
  check('two rows with no phases at all are duplicates, not a phase group', blank && blank.kind === 'duplicate');
  check('a group where nothing is classified reports an empty worst (the badge says "unclassified")',
    blank && blank.worst === '', blank && JSON.stringify(blank.worst));

  // a single row is never a group
  check('one row is not a group at all', g([{ internalId: 1, fcId: 'SF-005-M', phases: 'Cruise', severity: 'Minor' }]).size === 0);

  // ---- second pass, same evening (Waqas): "different phases dont mean genuinely
  // different effects … the severity follows the change in effect." The split test
  // is BOTH phases and class; the four outcomes each get named.
  const con = g([
    { internalId: 1, fcId: 'SF-006-M', phases: 'Takeoff, Climb', severity: 'Major' },
    { internalId: 2, fcId: 'SF-006-M', phases: 'Cruise, Descent', severity: 'Major' },
  ]).get('SF-006-M');
  check('different phases but the SAME class AND the same effects is not a split — it should be ONE row', con && con.kind === 'consolidate', con && con.kind);
  // 5 Sep 2026 (Waqas): "two rows with same severities are fine as long as effects are
  // different … you can increase pilot workload due to one failure condition in different
  // phases of flight for completely different tasks."
  const eff = g([
    { internalId: 1, fcId: 'SF-006-M2', phases: 'Takeoff, Climb', severity: 'Major', effCrew: 'Crew reject the take-off and clear the runway' },
    { internalId: 2, fcId: 'SF-006-M2', phases: 'Cruise, Descent', severity: 'Major', effCrew: 'Crew divert to the nearest suitable airfield' },
  ]).get('SF-006-M2');
  check('same class but DIFFERENT effects across phases is a legitimate split — no consolidate finding', eff && eff.kind === 'phase', eff && eff.kind);
  const effOverlap = g([
    { internalId: 1, fcId: 'SF-006-M3', phases: 'Takeoff, Climb', severity: 'Major', effCrew: 'Crew reject the take-off' },
    { internalId: 2, fcId: 'SF-006-M3', phases: 'Climb, Cruise', severity: 'Major', effCrew: 'Crew divert' },
  ]).get('SF-006-M3');
  check('… but one phase carrying two different effects is still assessed twice (Climb)', effOverlap && effOverlap.kind === 'overlap' && effOverlap.twice.join() === 'Climb', effOverlap && (effOverlap.kind + ' ' + (effOverlap.twice || []).join()));
  const effSame = g([
    { internalId: 1, fcId: 'SF-006-M4', phases: 'Cruise', severity: 'Major', effCrew: 'Crew divert.' },
    { internalId: 2, fcId: 'SF-006-M4', phases: 'Cruise', severity: 'Major', effCrew: 'crew divert' },
  ]).get('SF-006-M4');
  check('a re-typed comma or capital is not a different effect — still a duplicate', effSame && effSame.kind === 'duplicate', effSame && effSame.kind);

  const ctr = g([
    { internalId: 1, fcId: 'SF-007-M', phases: 'Cruise', severity: 'Major' },
    { internalId: 2, fcId: 'SF-007-M', phases: 'Cruise', severity: 'Hazardous' },
  ]).get('SF-007-M');
  check('same phases classified two ways is a CONTRADICTION, not a variant', ctr && ctr.kind === 'contradiction', ctr && ctr.kind);

  const bl = g([
    { internalId: 1, fcId: 'SF-008-M', phases: 'Cruise', severity: 'Major' },
    { internalId: 2, fcId: 'SF-008-M', phases: 'Cruise', severity: '' },
  ]).get('SF-008-M');
  check('a blank is an abstention, not a class — it never manufactures a contradiction', bl && bl.kind === 'duplicate', bl && bl.kind);
  check('a legitimate split reports how many classes it spans', ph && ph.distinctClasses === 2);
})();

// ---- the four badges + the judgement / dropped-phase badges (rule 11) ----------
{
  check('duplicate, contradiction and consolidate each wear their OWN badge text',
    /duplicate rows · same phases/.test(helpers) && /same phases, different class — resolve/.test(helpers) && /same class across phases — should be one row/.test(helpers));
  check('the consolidate tooltip says WHY (rows come from effects; exposure)',
    /Rows come from effects, not from phases/.test(helpers) && /exposure ratio the full phase list/.test(helpers));
  // 4 Sep 2026, second layout pass — the Severity badge is gone; the judgement is the
  // amber-coloured leading segment of the Comments cell instead (Waqas, screenshot).
  check('the Severity cell no longer wears a judgement badge (pick-list column stays narrow)', (helpers.match(/\$\{_fhaJudgementBadge\(row\)\}/g) || []).length === 0);
  check('the judgement call is colour-coded in Comments, on both tables', /function _fhaCommentsCell\(row\)/.test(helpers) && /color:#7A5300;font-weight:600;/.test(helpers) && (helpers.match(/\$\{_fhaCommentsCell\(row\)\}/g) || []).length === 2);
  // 5 Sep 2026 (Waqas): "I dont want any badges in that column" — the FC ID cell is the id
  // alone; the group finding opens the Comments cell of the group head instead.
  check('the FC ID cell carries no badge; the finding badge sits at the top of Comments', /: `<strong>\$\{esc\(row\.fcId\)\}<\/strong>`;/.test(helpers) && !/<\/strong>\$\{_grpBadge\}/.test(helpers) && /\$\{_findingHtml\}\$\{_fhaCommentsCell\(row\)\}/.test(helpers));
  check('Sub-Function a bit wider, Effects and Comments much wider, on both tables', (helpers.match(/min-width:160px;">\$\{_fhaSubCell|min-width:160px;">\$\{_l1Cell/g) || []).length === 2 && (helpers.match(/min-width:480px;width:34%;/g) || []).length === 4 && !/min-width:360px;width:30%;/.test(helpers));
  check('the Phases cell lists ticked boxes only: no danger badge, no droppedPhases, no invented phase styling (Waqas, 4 Sep)',
    !/_fhaDroppedPhasesBadge/.test(helpers) && !/droppedPhases/.test(helpers) && !/_fhaPhaseUnlisted/.test(helpers) && /return list\.map\(esc\)\.join\('<br>'\);/.test(helpers));
  check('a human edit marks the row and preserves the fields the form does not know',
    /acFhaData\[idx\] = Object\.assign\(\{\}, acFhaData\[idx\], data, \{ humanEdited: true/.test(helpers) && /arr\[idx\] = Object\.assign\(\{\}, arr\[idx\], data, \{ humanEdited: true/.test(helpers));
  const a5 = fs.readFileSync(path.join(__dirname, '..', 'site', 'fha_a5.js'), 'utf8');
  check('the A5 badge is retired from the table (module kept, flag off)', /const A5_BADGE = false;/.test(a5) && /if \(!A5_BADGE\) return;/.test(a5));
  // 4 Sep 2026 — layout rulings (Waqas): sub-function NAME, non-wrapping FC id, stacked phases, wide effects — both tables
  check('Sub-Function shows the name with the id in parentheses beneath', /function _fhaSubCell\(subId\)/.test(helpers) && /\(\$\{esc\(id\)\}\)<\/span>/.test(helpers) && (helpers.match(/\$\{_fhaSubCell\(row\.subId\)\}/g) || []).length === 1);
  check('the failure-condition id never wraps and takes only its own width (both tables)', (helpers.match(/<td style="width:1%;white-space:nowrap;">\$\{_fcCell\}/g) || []).length === 1 && (helpers.match(/<td style="width:1%;white-space:nowrap;"><strong>\$\{esc\(row\.fcId\)\}/g) || []).length === 1);
  check('phases stack one per line in a narrow column (both tables)', /function _fhaPhasesCell\(row\)/.test(helpers) && /join\('<br>'\)/.test(helpers) && (helpers.match(/\$\{_fhaPhasesCell\(row\)\}/g) || []).length === 2);
  check('Effects and Comments are the wide columns; Severity, Phases, Assumptions shrink to content (both tables)',
    // 5 Sep 2026 (Waqas): "effects and comments columns much wider" — 480px / 34%, and the
    // AC table's Comments cell opens with the group finding when there is one.
    (helpers.match(/<td style="min-width:480px;width:34%;">\$\{effectsHtml\}<\/td>/g) || []).length === 2
    && (helpers.match(/<td style="min-width:480px;width:34%;">(\$\{_findingHtml\})?\$\{_fhaCommentsCell\(row\)\}<\/td>/g) || []).length === 2
    && (helpers.match(/style="width:1%;white-space:nowrap;">\$\{esc\(row\.severity\)\}/g) || []).length === 2
    && (helpers.match(/<td style="width:1%;white-space:nowrap;">\$\{_fhaPhasesCell\(row\)\}/g) || []).length === 2);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

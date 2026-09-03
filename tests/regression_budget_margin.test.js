#!/usr/bin/env node
/*
 * Regression — A9: margin as a third budget state (21 Aug 2026).
 *   The allocator no longer force-closes a constrained gate on its target:
 *     · caps verbatim + free children NATURAL → under-allocated AMBER margin;
 *     · a constraint LOOSER than the gate can afford → over-committed RED;
 *     · caps equal to naturals → exact;
 *     · signed reserve → deliberate margin, quiet;
 *     · accepted absorb → the pre-A9 redistribute, attributed and reversible.
 *   The decision register (SLBudgetDecisions, budget_ledger.js) is exercised
 *   REAL: attribution required, dismissed decisions change nothing but stay
 *   on the books, revert keeps the record and restores the honest state.
 * Run: node tests/regression_budget_margin.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function slice(file, start, end) {
  const src = read(file);
  const a = src.indexOf(start), b = src.indexOf(end, a + 1);
  if (a < 0 || b < 0) throw new Error('markers not found in ' + file + ': ' + start);
  return src.slice(a, b);
}
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-9 : tol) * Math.max(1e-300, Math.abs(b));

// ---- the REAL allocator, same harness the shared-strictest suite uses -------
function buildAlloc(pages, exposureTime) {
  const quantSrc = slice('fta_quant_modules.js',
    '// Phase 66.10 — apportionment weight, read safely.', 'function computeExactProbability');
  const helperSrc = slice('helpers_modules.js',
    'function _normalizeSiblingWeights', 'function syncWeightSliderFromNode');
  const capSrc = slice('misc_fn_modules.js',
    'function _getPasteOriginTarget', 'function onWeightSliderInput');
  return new Function('ftaPages', 'ftaConfig', 'slSharedStrictestTarget',
    quantSrc + '\n' + helperSrc + '\n' + capSrc + '\n; return allocateTopDown;')(
      pages, { exposureTime: exposureTime, mode: 'top-down', apportion: 'weighted' }, () => null);
}
const ev = (id, lid, w, extra) => Object.assign({ id, logicalId: lid, type: 'basic', weight: w }, extra || {});
// a PRESCRIBED child — the real engineer-assertion channel (_getPrescribedTarget
// honors gates carrying prescribedRate + prescribedProb, verbatim).
const presc = (id, p, w) => ({ id, type: 'gate', gateType: 'OR', prescribedRate: true, prescribedProb: p, weight: w, children: [ev(id * 10, id * 10, 50)] });

// ---- [1] under-allocated: a tighter cap frees budget, nobody absorbs it -----
{
  const pages = [{ id: 'p1', targetP: 2e-6, root: { id: 1, type: 'gate', gateType: 'OR',
    children: [presc(11, 1e-9, 50), ev(12, 112, 50)] } }];
  const alloc = buildAlloc(pages, 3);
  alloc(pages[0].root, 2e-6, 'weighted');
  const m = pages[0].root._budgetMargin;
  check('free sibling keeps its NATURAL share', near(pages[0].root.children[1].probability, 1e-6, 1e-3),
    pages[0].root.children[1].probability.toExponential(3));
  check('gate carries under-allocated margin with target and achieved',
    m && m.state === 'under-allocated' && near(m.target, 2e-6, 1e-9) && near(m.achieved, 1e-9 + 1e-6, 1e-3), JSON.stringify(m));
}

// ---- [2] over-committed: a prescribed value the gate cannot afford ----------
{
  const pages = [{ id: 'p2', targetP: 2e-6, root: { id: 2, type: 'gate', gateType: 'OR',
    children: [presc(21, 5e-6, 50), ev(22, 212, 50)] } }];
  const alloc = buildAlloc(pages, 3);
  alloc(pages[0].root, 2e-6, 'weighted');
  const m = pages[0].root._budgetMargin;
  check('over-committed is RED, recorded, and the children are NOT silently squeezed',
    m && m.state === 'over-committed' && near(pages[0].root.children[1].probability, 1e-6, 1e-3), JSON.stringify(m));
  check('the prescribed child keeps its verbatim value (the disagreement is visible, not clamped)',
    near(pages[0].root.children[0].probability, 5e-6, 1e-6));
}

// ---- [3] exact: a cap equal to the natural share raises nothing -------------
{
  const pages = [{ id: 'p3', targetP: 2e-6, root: { id: 3, type: 'gate', gateType: 'OR',
    children: [presc(31, 1.0002e-6, 50), ev(32, 312, 50)] } }];
  const alloc = buildAlloc(pages, 3);
  alloc(pages[0].root, 2e-6, 'weighted');
  const m = pages[0].root._budgetMargin;
  check('caps at the natural value → exact, no flag noise', m && m.state === 'exact', JSON.stringify(m));
}

// ---- [4] AND-family margin --------------------------------------------------
{
  const pages = [{ id: 'p4', targetP: 1e-6, root: { id: 4, type: 'gate', gateType: 'AND',
    children: [presc(41, 1e-4, 50), ev(42, 412, 50)] } }];
  const alloc = buildAlloc(pages, 3);
  alloc(pages[0].root, 1e-6, 'weighted');
  const m = pages[0].root._budgetMargin;
  // natural per child = sqrt(1e-6) = 1e-3; cap 1e-4 tightens → product 1e-4·1e-3 = 1e-7 < 1e-6
  check('AND gate: tighter cap → under-allocated margin, sibling natural',
    m && m.state === 'under-allocated' && near(pages[0].root.children[1].probability, 1e-3, 1e-3), JSON.stringify(m));
}

// ---- [5] the decision register, REAL (budget_ledger.js) ---------------------
global.window = global;
global.projectConfig = {};
global.commitSaveChanges = () => {};
// document resolves GLOBALLY (set later by the render section) — binding it
// as a parameter here would freeze it at load time.
new Function('window', read('budget_ledger.js'))(global);
const BD = global.SLBudgetDecisions;
check('register exported', BD && typeof BD.record === 'function' && typeof BD.decisionFor === 'function' && typeof BD.revert === 'function');
check('a decision without attribution is refused', BD.record({ gateId: 9, kind: 'absorb', by: '  ' }) === null);
check('an unknown kind is refused', BD.record({ gateId: 9, kind: 'auto', by: 'W' }) === null);
const d1 = BD.record({ gateId: 9, kind: 'dismissed', by: 'W. Nafees', sentence: 'Reviewed — leaving the margin standing for now.' });
check('"did nothing" is LOGGED — a dismissed record exists but decides nothing',
  d1 && BD.decisionFor(9) === null && BD.list().length === 1);
const d2 = BD.record({ gateId: 9, kind: 'absorb', by: 'W. Nafees', sentence: 'Absorb into siblings — margin is accidental slack from the shared cap.' });
check('an accepted absorb is the standing decision, attributed with a sentence',
  BD.decisionFor(9) && BD.decisionFor(9).id === d2.id && /accidental slack/.test(BD.decisionFor(9).sentence));
check('revert requires attribution too', BD.revert(d2.id, '') === false);
check('revert keeps the record and clears the standing decision (reversible, never deleted)',
  BD.revert(d2.id, 'W. Nafees') === true && BD.decisionFor(9) === null &&
  BD.list().length === 2 && BD.list()[1].reverted && BD.list()[1].reverted.by === 'W. Nafees');
const d3 = BD.record({ gateId: 9, kind: 'reserve', by: 'W. Nafees', sentence: 'Deliberate reserve — growth margin for the FBW retrofit.' });
check('a signed reserve becomes the standing decision', BD.decisionFor(9).id === d3.id && BD.decisionFor(9).kind === 'reserve');

// ---- [6] the allocator honors the REAL register end-to-end ------------------
{
  const pages = [{ id: 'p6', targetP: 2e-6, root: { id: 60, type: 'gate', gateType: 'OR',
    children: [presc(61, 1e-9, 50), ev(62, 612, 50)] } }];
  const alloc = buildAlloc(pages, 3);
  alloc(pages[0].root, 2e-6, 'weighted');
  check('end-to-end: amber before any decision', pages[0].root._budgetMargin.state === 'under-allocated');
  const d = BD.record({ gateId: 60, kind: 'absorb', by: 'W. Nafees', sentence: 'Absorb — slack is accidental.' });
  alloc(pages[0].root, 2e-6, 'weighted');
  check('end-to-end: the recorded absorb closes the gate through the register',
    pages[0].root._budgetMargin.state === 'absorbed-by-decision' &&
    pages[0].root._budgetMargin.decisionId === d.id &&
    near(pages[0].root.children[0].probability + pages[0].root.children[1].probability, 2e-6, 1e-3),
    JSON.stringify(pages[0].root._budgetMargin));
  BD.revert(d.id, 'W. Nafees');
  alloc(pages[0].root, 2e-6, 'weighted');
  check('end-to-end: reverting restores the honest amber', pages[0].root._budgetMargin.state === 'under-allocated');
}

// ---- [7] VOTING gates carry the margin too (live-found on K350) -------------
{
  const mk = p => [{ id: 'p7', targetP: 1e-6, root: { id: 70, type: 'gate', gateType: 'VOTING', votingK: 2,
    children: [presc(71, p, 50), ev(72, 712, 50), ev(73, 713, 50)] } }];
  let pages = mk(1e-6);                      // cap far tighter than the ~5.8e-4 natural
  let alloc = buildAlloc(pages, 3);
  alloc(pages[0].root, 1e-6, 'weighted');
  let m = pages[0].root._budgetMargin;
  check('VOTING: a tighter cap frees budget → under-allocated margin recorded',
    m && m.state === 'under-allocated' && m.mode === 'VOTING' && m.achieved < 1e-6 && m.constrainedCount === 1,
    JSON.stringify(m));
  check('VOTING: the capped child holds its verbatim value; siblings stay natural',
    near(pages[0].root.children[0].probability, 1e-6, 1e-6) &&
    near(pages[0].root.children[1].probability, Math.sqrt(1e-6 / 3), 1e-2),
    pages[0].root.children.map(c => c.probability.toExponential(2)).join(','));
  pages = mk(1e-2);                          // a value the 2-of-3 cannot afford
  alloc = buildAlloc(pages, 3);
  alloc(pages[0].root, 1e-6, 'weighted');
  m = pages[0].root._budgetMargin;
  check('VOTING: a looser constraint → over-committed RED, nothing silently squeezed',
    m && m.state === 'over-committed' && m.achieved > 1e-6, JSON.stringify(m));
  pages = mk(Math.sqrt(1e-6 / 3));           // cap at the natural value
  alloc = buildAlloc(pages, 3);
  alloc(pages[0].root, 1e-6, 'weighted');
  m = pages[0].root._budgetMargin;
  check('VOTING: cap at the natural share → exact', m && m.state === 'exact', JSON.stringify(m));
}

// ---- [8] SB2: the ledger surfaces the tri-state (VM render, rule 11) --------
{
  // fixture project state for the ledger
  global.acFhaData = [
    { internalId: 801, subId: 'SF-01', fcId: 'FC-A', fcDesc: 'Loss of pitch', severity: 'Catastrophic', phases: [] },
    { internalId: 802, subId: 'SF-02', fcId: 'FC-B', fcDesc: 'Loss of roll', severity: 'Hazardous', phases: [] },
  ];
  global.systemsData = [];
  const mkGate = (id, state, t, a) => ({ id, displayId: 'G-' + id, type: 'gate', gateType: 'OR', probability: a,
    _budgetMargin: { state, target: t, achieved: a, mode: 'OR', constrainedCount: 1, freeCount: 1 },
    children: [{ id: id * 10, logicalId: 'lid' + id, type: 'basic', probability: a / 2, _externalAllocation: { external: 1 } },
               { id: id * 10 + 1, logicalId: 'sib' + id, type: 'basic', probability: a / 2 }] });
  global.ftaPages = [
    { id: 'pgA', name: 'PASA · A', targetP: 1e-6, linkedFhaId: 801, root: mkGate(90, 'over-committed', 1e-6, 5e-6) },
    { id: 'pgB', name: 'PASA · B', targetP: 1e-5, linkedFhaId: 802, root: mkGate(91, 'under-allocated', 1e-5, 2e-6) },
  ];
  global.getSafetyTarget = sev => sev === 'Catastrophic' ? { prob: 1e-9, dal: 'A' } : { prob: 1e-7, dal: 'B' };
  global.computeExactProbability = root => ({ prob: root.probability || 1e-7 });
  global._slSharedStrictestRound = () => null;
  global.acReqData = [
    { internalId: 1, traceId: 'REQ-001', reqSource: { sourceId: 'ac:fta:prob:sib91' }, verifStatus: 'Passed' },
    { internalId: 2, traceId: 'REQ-002', reqSource: { sourceId: 'ac:fta:prob:sib91' } },
  ];

  const rows = global.budgetLedgerRows();
  check('rows carry marginInfo (worst gate per row)',
    rows.length === 2 && rows[0].marginInfo.state === 'over-committed' && rows[1].marginInfo.state === 'under-allocated',
    JSON.stringify(rows.map(r => r.marginInfo && r.marginInfo.state)));
  const st = global.budgetLedgerStats(rows);
  check('stats count the tri-state', st.overCommitted === 1 && st.underAllocated === 1 && st.reserves === 0, JSON.stringify(st));

  // VM render with a light DOM
  const els = {};
  const mkEl = id => ({ id, _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v;
      // the render then looks up ids it just wrote — surface them
      String(v).replace(/id="([^"]+)"/g, (mm, i2) => { if (!els[i2]) els[i2] = mkEl(i2); return mm; }); },
    appendChild(c) { this._html += c._html || ''; }, style: {} });
  els['view-budget'] = mkEl('view-budget');
  global.document = { getElementById: id => els[id] || null, createElement: () => mkEl('tmp'),
    addEventListener: () => {}, querySelectorAll: () => [], body: { appendChild: () => {} } };
  global.SLPaginate = undefined;
  global.renderBudgetLedgerPage();
  const page = els['view-budget']._html + (els['budget-tbody'] ? els['budget-tbody']._html : '');
  check('chips show Over-committed and Margin held', /Over-committed/.test(page) && /Margin held/.test(page));
  check('RED lands the completion-gate banner (advisory, nothing locked)',
    /COMPLETION GATE/.test(page) && /nothing is locked/i.test(page));
  check('rows carry the A9 state cell with the offer wiring',
    /OVER-COMMITTED/.test(page) && /margin held/.test(page) && /slBudgetOffer\('pgB','91'\)/.test(page) && /decide/.test(page));
  check('the register renders with the standing + reverted decisions',
    /Budget decisions/.test(page) && /RESERVE/.test(page) && /reverted/.test(page) && /slBudgetRevert/.test(page));
  check('impact preview keys on issued + EVIDENCED requirements',
    (() => { const hits = null; // behavioural: _impactReqs is internal — assert through source
      const src = read('budget_ledger.js');
      return /_impactReqs/.test(src) && /verifStatus \|\| r\.verificationStatus \|\| r\.verifEvidence/.test(src) && /EVIDENCED/.test(src); })());
  check('over-committed offers NO fake fix — it logs the review only',
    /No fake fix on offer/.test(read('budget_ledger.js')) && /kind: 'dismissed'/.test(read('budget_ledger.js')));
}

// ---- [9] SB2 wiring statics -------------------------------------------------
{
  const ux = read('ux_leading.js');
  check('dashboard leading indicator: over-committed budgets tile reads the ledger stats',
    /Over-committed budgets/.test(ux) && /budgetLedgerStats/.test(ux) && /'budget'/.test(ux));
  const bind = read('bindings_modules.js');
  check('PASA completion item: budget feasibility fails on over-committed gates',
    /bfeas/.test(bind) && /Budget feasibility/.test(bind) && /overCommitted === 0/.test(bind));
}

// ---- pins (rule 12) ---------------------------------------------------------
const idx = read('index.html');
const pin = n => parseFloat(((idx.match(new RegExp(n.replace('.', '\\.') + '\\?v=([0-9.]+)')) || [])[1]) || '0');
check('fta_quant ≥ 66.14 (A9 allocator incl. VOTING margin)', pin('fta_quant_modules.js') >= 66.14);
check('budget_ledger ≥ 1.3 (tri-state ledger + offer flow)', pin('budget_ledger.js') >= 1.3);
check('ux_leading ≥ 1.2 (over-committed tile)', pin('ux_leading.js') >= 1.2);
check('bindings ≥ 1.19 (bfeas completion item)', pin('bindings_modules.js') >= 1.19);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

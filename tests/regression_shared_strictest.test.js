#!/usr/bin/env node
/*
 * Regression: strictest-across-trees allocation for shared events (build 66.19).
 *
 * Waqas, 19 Aug 2026, agreed line by line before a line was written:
 *   "if a node is carrying a 1e-09 budget in one tree, but under an equal distribution
 *    model will get a 1e-06 for a less stricter tree [it] should maintain its 1e-09
 *    budget and loosen it for the other nodes ... that is our value add."
 *
 * A9 SUPERSESSION (21 Aug 2026, OPEN_ITEMS A9, ruled by Waqas): the AUTOMATIC
 * loosen below stops. The cap still holds the shared event at the strictest
 * budget — but the freed budget now lands on the gate as _budgetMargin
 * (under-allocated), and the absorb happens only through an ACCEPTED, signed,
 * reversible decision (SLBudgetDecisions). "A budget that got EASIER needs no
 * action; a budget that got HARDER does." Section [1] locks the new contract.
 *
 * WHY THE CAP IS SAFE: it can only REDUCE a child below its natural
 * apportionment, so no top target is ever made harder by the share. WHY THE CURRENCY IS A RATE: what is invariant about a
 * shared event is its rate; P depends on the window. Verification already re-derives P
 * per context from one λ — allocation now mirrors that. Transporting a raw P instead
 * applies one tree's window to another tree's budget (a takeoff-phase FC at 0.05 h
 * against a 3 h mission tree is a 60x error).
 *
 * Run:  node tests/regression_shared_strictest.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function slice(file, start, end) {
  const src = read(file);
  const a = src.indexOf(start), b = src.indexOf(end, a + 1);
  if (a < 0 || b < 0) throw new Error('markers not found in ' + file + ': ' + start);
  return src.slice(a, b);
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-9 : tol) * Math.max(1e-300, Math.abs(b));
const rate = (p, t) => -Math.log1p(-p) / t;

// ---- build a sandbox carrying the REAL allocator + the REAL pass ----
function build(pages, exposureTime) {
  const quantSrc = slice('fta_quant_modules.js',
    '// Phase 66.10 — apportionment weight, read safely.', 'function computeExactProbability');
  const helperSrc = slice('helpers_modules.js',
    'function _normalizeSiblingWeights', 'function syncWeightSliderFromNode');
  const capSrc = slice('misc_fn_modules.js',
    'function _getPasteOriginTarget', 'function onWeightSliderInput');
  const reuseSrc = read('event_reuse.js');
  const win = {};
  // event_reuse.js is an IIFE that publishes onto window; run it with the globals it reads.
  new Function('window', 'ftaPages', 'activeFTAPageId', 'ftaConfig', 'acFhaData', 'systemsData', 'idpContributors', '_nodeExposureTime',
    reuseSrc)(win, pages, pages[0].id, { exposureTime: exposureTime, mode: 'top-down', apportion: 'weighted' },
      [], [], function () { return []; },
      function (node, fallbackT) {
        const mode = (node && node.exposureMode) || 'continuous';
        if (mode === 'manual' && node.exposureTime > 0) return node.exposureTime;
        if (mode === 'latent' && node.dormancyInterval > 0) return node.dormancyInterval;
        return fallbackT;
      });
  const alloc = new Function('ftaPages', 'ftaConfig', 'slSharedStrictestTarget',
    quantSrc + '\n' + helperSrc + '\n' + capSrc + '\n; return allocateTopDown;')(
      pages, { exposureTime: exposureTime, mode: 'top-down', apportion: 'weighted' }, win.SLEventReuse.strictestTarget);
  return { RU: win.SLEventReuse, allocateTopDown: alloc };
}

function ev(id, lid, w, extra) { return Object.assign({ id: id, logicalId: lid, type: 'basic', weight: w }, extra || {}); }

// Tree A (strict): OR, target 2e-9 → each child ~1e-9.
// Tree B (loose):  OR, target 2e-6 → each child ~1e-6, and it SHARES the event (lid 777).
function project() {
  return [
    { id: 'pgA', name: 'PSSA · strict tree', targetP: 2e-9, root:
      { id: 1, type: 'gate', gateType: 'OR', children: [ev(11, 777, 50), ev(12, 12, 50)] } },
    { id: 'pgB', name: 'PSSA · loose tree', targetP: 2e-6, root:
      { id: 2, type: 'gate', gateType: 'OR', children: [ev(21, 777, 50), ev(22, 22, 50)] } }
  ];
}

console.log('\n[1] The strict tree keeps its budget; the loose tree adopts it');
{
  const pages = project();
  const { RU, allocateTopDown } = build(pages, 3);
  // natural apportionment first
  allocateTopDown(pages[0].root, 2e-9, 'weighted');
  allocateTopDown(pages[1].root, 2e-6, 'weighted');
  const natural = { A: pages[0].root.children[0].probability, B: pages[1].root.children[0].probability };
  check('natural: strict tree gives the shared event ~1e-9', near(natural.A, 1e-9, 1e-3), natural.A.toExponential(3));
  check('natural: loose tree would give it ~1e-6', near(natural.B, 1e-6, 1e-3), natural.B.toExponential(3));

  const res = RU.strictestPass();
  check('the pass caps exactly one instance', res.capped === 1, JSON.stringify(res));

  allocateTopDown(pages[0].root, 2e-9, 'weighted');
  allocateTopDown(pages[1].root, 2e-6, 'weighted');
  const sharedA = pages[0].root.children[0], sharedB = pages[1].root.children[0], siblingB = pages[1].root.children[1];
  check('the STRICT tree is untouched — it is never loosened by the share',
    near(sharedA.probability, natural.A, 1e-6), sharedA.probability.toExponential(3));
  check('the shared event in the LOOSE tree is held at the strict budget',
    near(sharedB.probability, natural.A, 1e-3), sharedB.probability.toExponential(3));
  // A9 — the sibling is NOT loosened automatically any more.
  check('A9: the sibling KEEPS its natural apportionment — no silent absorb',
    near(siblingB.probability, 1e-6, 1e-3), 'sibling=' + siblingB.probability.toExponential(3));
  check('A9: the freed budget lands on the gate as an under-allocated margin',
    pages[1].root._budgetMargin && pages[1].root._budgetMargin.state === 'under-allocated' &&
    near(pages[1].root._budgetMargin.achieved, sharedB.probability + siblingB.probability, 1e-6),
    JSON.stringify(pages[1].root._budgetMargin));
  check('A9: the strict tree stays exact (its caps equal its naturals)',
    !pages[0].root._budgetMargin || pages[0].root._budgetMargin.state !== 'under-allocated',
    JSON.stringify(pages[0].root._budgetMargin || null));
  // The absorb still exists — as an ACCEPTED decision, reversible.
  global.SLBudgetDecisions = { decisionFor: id => id === 2 ? { id: 'bd-t1', kind: 'absorb' } : null };
  allocateTopDown(pages[1].root, 2e-6, 'weighted');
  check('an ACCEPTED absorb re-enables the redistribute for that gate',
    pages[1].root.children[1].probability > 1.99e-6 &&
    near(pages[1].root.children[0].probability + pages[1].root.children[1].probability, 2e-6, 1e-3),
    pages[1].root.children[1].probability.toExponential(3));
  check('...and says so on the gate, with the decision id',
    pages[1].root._budgetMargin && pages[1].root._budgetMargin.state === 'absorbed-by-decision' &&
    pages[1].root._budgetMargin.decisionId === 'bd-t1', JSON.stringify(pages[1].root._budgetMargin));
  // reserve: margin held DELIBERATELY — quiet, not absorbed
  global.SLBudgetDecisions = { decisionFor: id => id === 2 ? { id: 'bd-t2', kind: 'reserve' } : null };
  allocateTopDown(pages[1].root, 2e-6, 'weighted');
  check('a signed RESERVE keeps the natural split and marks the margin deliberate',
    near(pages[1].root.children[1].probability, 1e-6, 1e-3) &&
    pages[1].root._budgetMargin && pages[1].root._budgetMargin.state === 'reserve',
    JSON.stringify(pages[1].root._budgetMargin));
  // reverting the decision restores the honest amber
  global.SLBudgetDecisions = { decisionFor: () => null };
  allocateTopDown(pages[1].root, 2e-6, 'weighted');
  check('reverting the decision is REVERSIBLE — the margin returns',
    pages[1].root._budgetMargin && pages[1].root._budgetMargin.state === 'under-allocated');
  delete global.SLBudgetDecisions;
  check('the cap records where the requirement came from',
    sharedB._sharedStrictest && sharedB._sharedStrictest.fromPageName === 'PSSA · strict tree',
    JSON.stringify(sharedB._sharedStrictest));
  check('...and what this tree would have apportioned, for the panel to show',
    near(sharedB._sharedStrictest.naturalProb, natural.B, 1e-3));
  check('the allocator names which constraint won',
    sharedB._externalAllocation && sharedB._externalAllocation.source === 'shared-strictest',
    JSON.stringify(sharedB._externalAllocation));
}

console.log('\n[2] The comparison is per FLIGHT HOUR, not raw probability');
{
  // Same shared event, but the strict instance is a LATENT dormant failure exposed over
  // 1000 h while the loose instance is continuous over 3 h. Raw P says 1e-7 < 1e-6 so the
  // latent instance "wins" — but per FH it is 1e-10/FH vs 3.3e-7/FH, a different story.
  const pages = project();
  pages[0].targetP = 2e-7;
  pages[0].root.children[0].exposureMode = 'latent';
  pages[0].root.children[0].dormancyInterval = 1000;
  const { RU, allocateTopDown } = build(pages, 3);
  allocateTopDown(pages[0].root, 2e-7, 'weighted');
  allocateTopDown(pages[1].root, 2e-6, 'weighted');
  const pA = pages[0].root.children[0].probability, pB = pages[1].root.children[0].probability;
  const rA = rate(pA, 1000), rB = rate(pB, 3);
  check('raw P would pick the latent instance', pA < pB, pA.toExponential(2) + ' < ' + pB.toExponential(2));
  check('per FH the CONTINUOUS instance is not even close to it', rA < rB, rA.toExponential(2) + ' vs ' + rB.toExponential(2));
  // exposure MODES differ, so the pass must refuse rather than pick
  const res = RU.strictestPass();
  check('mixed exposure models are flagged, never resolved', res.conflicts === 1 && res.capped === 0, JSON.stringify(res));
  check('both instances carry the conflict for the engineer',
    !!pages[0].root.children[0]._sharedStrictestConflict && !!pages[1].root.children[0]._sharedStrictestConflict);
  check('no cap was applied to either', !pages[0].root.children[0]._sharedStrictest && !pages[1].root.children[0]._sharedStrictest);
}

console.log('\n[3] Same exposure MODE, different windows — the RATE decides, not raw P');
{
  // The real case: a takeoff-restricted failure condition (0.05 h window) against a full
  // 3 h mission tree. Raw P says the takeoff instance is stricter; per flight hour it is
  // 20x LOOSER. Transporting raw P here would write a requirement the strict tree never
  // asked for — the 60x error this design exists to avoid.
  const pages = project();
  pages[0].targetP = 2e-7;                                   // takeoff tree
  pages[0].root.children[0].exposureMode = 'manual'; pages[0].root.children[0].exposureTime = 0.05;
  pages[1].root.children[0].exposureMode = 'manual'; pages[1].root.children[0].exposureTime = 3;
  const { RU, allocateTopDown } = build(pages, 3);
  allocateTopDown(pages[0].root, 2e-7, 'weighted');
  allocateTopDown(pages[1].root, 2e-6, 'weighted');
  const A = pages[0].root.children[0], B = pages[1].root.children[0];
  const rA = rate(A.probability, 0.05), rB = rate(B.probability, 3);
  check('raw P says the takeoff instance is stricter', A.probability < B.probability,
    A.probability.toExponential(2) + ' < ' + B.probability.toExponential(2));
  check('per FH it is the LOOSER of the two', rA > rB, rA.toExponential(2) + ' vs ' + rB.toExponential(2));
  const res = RU.strictestPass();
  check('the pass follows the RATE — it caps the takeoff instance, not the mission one',
    res.capped === 1 && !!A._sharedStrictest && !B._sharedStrictest,
    'capped=' + res.capped + ' onTakeoff=' + !!A._sharedStrictest + ' onMission=' + !!B._sharedStrictest);
  const held = A._sharedStrictest;
  check('the cap is rendered into THIS tree\'s window, not copied as a raw P',
    held && near(held.prob, -Math.expm1(-held.rate * 0.05), 1e-6),
    held ? (held.prob.toExponential(3) + ' = rate ' + held.rate.toExponential(3) + ' over 0.05 h') : 'none');
  check('...which is a DIFFERENT number from the source instance\'s probability',
    held && Math.abs(held.prob - B.probability) > 1e-12,
    held ? (held.prob.toExponential(3) + ' vs source ' + B.probability.toExponential(3)) : 'none');
}

console.log('\n[4] It is live, not a ratchet');
{
  const pages = project();
  const { RU, allocateTopDown } = build(pages, 3);
  allocateTopDown(pages[0].root, 2e-9, 'weighted');
  allocateTopDown(pages[1].root, 2e-6, 'weighted');
  RU.strictestPass();
  check('a cap exists after the first pass', !!pages[1].root.children[0]._sharedStrictest);
  // the strict tree is deliberately relaxed by the engineer
  pages[0].targetP = 4e-6;
  RU.clearStrictest();
  allocateTopDown(pages[0].root, 4e-6, 'weighted');
  allocateTopDown(pages[1].root, 2e-6, 'weighted');
  const res = RU.strictestPass();
  check('relaxing the strict tree LIFTS the cap instead of ratcheting',
    !pages[1].root.children[0]._sharedStrictest, JSON.stringify(res));
  check('...and the other tree becomes the stricter one', !!pages[0].root.children[0]._sharedStrictest);
}

console.log('\n[5] Scope — what the pass must NOT touch');
{
  const pages = project();
  pages.push({ id: 'pgB-v', name: 'verification twin', verifies: 'pgB', targetP: 2e-6, root:
    { id: 3, type: 'gate', gateType: 'OR', children: [ev(31, 777, 50), ev(32, 32, 50)] } });
  const { RU, allocateTopDown } = build(pages, 3);
  allocateTopDown(pages[0].root, 2e-9, 'weighted');
  allocateTopDown(pages[1].root, 2e-6, 'weighted');
  allocateTopDown(pages[2].root, 2e-6, 'weighted');
  RU.strictestPass();
  check('a verification twin is never capped by the allocation pass',
    !pages[2].root.children[0]._sharedStrictest);

  // repeats INSIDE one tree are the existing common-mode case, not this one
  const solo = [{ id: 'pgC', name: 'one tree', targetP: 2e-6, root:
    { id: 4, type: 'gate', gateType: 'OR', children: [ev(41, 999, 50), ev(42, 999, 50)] } }];
  const two = build(solo, 3);
  two.allocateTopDown(solo[0].root, 2e-6, 'weighted');
  const r2 = two.RU.strictestPass();
  check('two instances in the SAME tree are left to the existing common-mode logic',
    r2.capped === 0, JSON.stringify(r2));
}

console.log('\n[6] Wiring — the cap rides the existing external-cap channel');
{
  const quant = read('fta_quant_modules.js');
  check('the allocator reads the shared cap', /slSharedStrictestTarget\(node\)/.test(quant));
  check('it is min-ed with the external-source and paste caps',
    /_caps = \[extSrc, paste, shared\]/.test(quant));
  check('A9: the allocator consults the decision register',
    /SLBudgetDecisions/.test(quant) && /decisionFor\(node\.id\)/.test(quant));
  check('A9: the absorb is opt-in — the pre-A9 redistribute runs only on an accepted decision',
    /kind === 'absorb'/.test(quant) && /the pre-A9 redistribute, now opt-in/.test(quant));
  check('A9: the default records _budgetMargin with the tri-state',
    /_budgetMargin/.test(quant) && /'over-committed'/.test(quant) && /'under-allocated'/.test(quant) && /'reserve'/.test(quant));
  check('the cap is a CHILD CONSTRAINT, which is what triggers the redistribute',
    /const caps = \[extSrc, paste, shared\]/.test(quant));
  check('only ROOT pages are allocated project-wide (transfer targets are seeded by their parent)',
    /transferTargets\.has\(p\.id\)/.test(quant));
  check('a verification-side page allocates nothing', /p\.mode === 'bottom-up'/.test(quant));
  check('the round runs before the active page is apportioned', /_slSharedStrictestRound\(\); \} catch/.test(quant));
  check('reentrancy is guarded', /_slStrictestBusy/.test(quant));
  const view = read('fta_view_modules.js');
  check('the panel explains the held number and names the source tree',
    /Held at the strictest allocation/.test(view) && /this tree would have apportioned/.test(view));
  check('the mixed-exposure conflict is surfaced to the engineer',
    /DIFFERENT exposure models/.test(view));
  const helpers = read('helpers_modules.js');
  check('the canvas says so too', /Held at the strictest allocation across/.test(helpers));
}

console.log('\n' + (fail === 0 ? 'ALL GREEN — ' + pass + ' checks' : fail + ' FAILED, ' + pass + ' passed'));
process.exit(fail === 0 ? 0 : 1);

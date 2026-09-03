#!/usr/bin/env node
/*
 * Regression: top-down apportionment weights (build 66.10).
 *
 * THE BUG (reported on Aeolus, reproduced 18 Aug 2026): a tree switched from
 * bottom-up to top-down allocated absurd budgets — one child ~2% of the parent,
 * its sibling ~98%, with no user ever touching a weight slider.
 *
 * ROOT CAUSE — one property, two scales:
 *   • The UI treats node.weight as a PERCENTAGE of the parent; a sibling group is
 *     normalised to sum 100.
 *   • The allocator read it as a RELATIVE weight with `(c.weight || 1)`.
 *   • A tree authored bottom-up has no `weight` on any node. selectNode() seeded
 *     the percentage slider with `dataNode.weight || 1`, so opening the config
 *     panel and saving ANY field stamped weight = 1 (i.e. 1%) on that node while
 *     its sibling still held 50 → 1:50 → ~2% / ~98% after normalisation.
 *   • `|| 1` also promoted a legitimate 0% weight to 1.
 *
 * These tests load the REAL site sources, so a regression in either scale fails here.
 * Run:  node tests/regression_topdown_weights.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..', 'site');

function slice(file, startMarker, endMarker) {
  const src = fs.readFileSync(path.join(SITE, file), 'utf8');
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a + 1);
  if (a < 0 || b < 0) throw new Error('markers not found in ' + file + ': ' + startMarker);
  return src.slice(a, b);
}

// Real allocator + the new weight reader.
const quantSrc = slice('fta_quant_modules.js',
  '// Phase 66.10 — apportionment weight, read safely.',
  'function computeExactProbability');
// Real weight helpers (normalise / rebalance / seed).
const helperSrc = slice('helpers_modules.js',
  'function _normalizeSiblingWeights',
  'function syncWeightSliderFromNode');
// Real external-cap readers. allocateTopDown guards these with typeof checks, so
// leaving them out of the sandbox SILENTLY DISABLES the paste-origin constraint —
// which is exactly how §6c first "passed" the equal-split it was meant to catch.
const capSrc = slice('misc_fn_modules.js',
  'function _getPasteOriginTarget',
  'function onWeightSliderInput');

const sandbox = { ftaPages: [] };
const load = new Function('sandbox',
  'var ftaPages = sandbox.ftaPages;\n' + quantSrc + '\n' + helperSrc + '\n' + capSrc +
  '\nreturn { allocateTopDown: allocateTopDown, _apportionWeight: _apportionWeight,' +
  ' _normalizeSiblingWeights: _normalizeSiblingWeights,' +
  ' _rebalanceSiblingWeights: _rebalanceSiblingWeights,' +
  ' seedTopDownWeights: seedTopDownWeights };');
const F = load(sandbox);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-9 : tol) * Math.max(1, Math.abs(b));

function orTree() {
  return { id: 1, type: 'gate', gateType: 'OR', children: [
    { id: 2, type: 'basic', name: 'A' },
    { id: 3, type: 'basic', name: 'B' }
  ]};
}

console.log('\n[1] _apportionWeight — a missing weight is the equal share, never the constant 1');
check('missing weight in a 2-child group reads as 50, not 1',
  F._apportionWeight({}, 2, 'weighted') === 50,
  'got ' + F._apportionWeight({}, 2, 'weighted'));
check('missing weight in a 4-child group reads as 25',
  F._apportionWeight({}, 4, 'weighted') === 25);
check('a legitimate 0% weight stays 0 (the old `|| 1` promoted it to 1)',
  F._apportionWeight({ weight: 0 }, 2, 'weighted') === 0);
check('an authored weight is returned verbatim',
  F._apportionWeight({ weight: 30 }, 2, 'weighted') === 30);
check('equal apportionment ignores weights entirely',
  F._apportionWeight({ weight: 30 }, 2, 'equal') === 1);

console.log('\n[2] Allocation of a weightless tree — the bottom-up → top-down switch');
{
  const t = orTree();
  F.allocateTopDown(t, 1e-6, 'weighted');
  const a = t.children[0].probability, b = t.children[1].probability;
  check('two weightless children split the budget evenly', near(a, b, 1e-9),
    'A=' + a.toExponential(3) + ' B=' + b.toExponential(3));
  check('neither child collapses to a ~2% / ~98% split',
    Math.max(a, b) / Math.min(a, b) < 1.01,
    'ratio ' + (Math.max(a, b) / Math.min(a, b)).toFixed(3));
}

console.log('\n[3] The exact corrupt state the old write path created (1 vs 50)');
{
  const t = orTree();
  t.children[0].weight = 1;    // stamped by selectNode()'s `|| 1` seed
  t.children[1].weight = 50;   // untouched sibling
  F._normalizeSiblingWeights(t.children);
  check('normalisation exposes the corruption as ~2 / ~98',
    t.children[0].weight < 3 && t.children[1].weight > 97,
    t.children[0].weight.toFixed(2) + ' / ' + t.children[1].weight.toFixed(2));
  // seeding is what prevents this state ever being reached
  const fresh = orTree();
  F.seedTopDownWeights(fresh);
  check('seedTopDownWeights gives a weightless group 50 / 50',
    fresh.children[0].weight === 50 && fresh.children[1].weight === 50);
}

console.log('\n[4] seedTopDownWeights — authored weights survive, groups sum to 100');
{
  const t = { id: 1, type: 'gate', gateType: 'AND', children: [
    { id: 2, type: 'gate', gateType: 'OR', weight: 70, children: [
      { id: 4, type: 'basic' }, { id: 5, type: 'basic' }, { id: 6, type: 'basic' }
    ]},
    { id: 3, type: 'basic', weight: 30 }
  ]};
  F.seedTopDownWeights(t);
  check('authored 70 / 30 preserved', t.children[0].weight === 70 && t.children[1].weight === 30);
  const kids = t.children[0].children.map(k => k.weight);
  check('nested weightless group seeded to thirds and summed to 100',
    near(kids.reduce((s, w) => s + w, 0), 100, 1e-9) && near(kids[0], 100 / 3, 1e-9),
    kids.join(' / '));
}

console.log('\n[5] _rebalanceSiblingWeights — the write path can never unbalance a group');
{
  const kids = [{ id: 2, weight: 50 }, { id: 3, weight: 50 }];
  F._rebalanceSiblingWeights(kids[0], kids, 30);
  check('editing one sibling to 30 leaves the group summed to 100',
    near(kids.reduce((s, k) => s + k.weight, 0), 100, 1e-9),
    kids.map(k => k.weight.toFixed(1)).join(' / '));
  check('the sibling absorbs the delta (30 / 70)',
    near(kids[0].weight, 30, 1e-9) && near(kids[1].weight, 70, 1e-9));

  const three = [{ id: 2, weight: 100 / 3 }, { id: 3, weight: 100 / 3 }, { id: 4, weight: 100 / 3 }];
  F._rebalanceSiblingWeights(three[0], three, 0);
  check('a 0% edit is honoured and the rest still sum to 100',
    near(three[0].weight, 0, 1e-9) && near(three.reduce((s, k) => s + k.weight, 0), 100, 1e-9),
    three.map(k => k.weight.toFixed(1)).join(' / '));
}

console.log('\n[6] End to end — seed, edit, allocate; shares track the weights');
{
  const t = orTree();
  F.seedTopDownWeights(t);
  F._rebalanceSiblingWeights(t.children[0], t.children, 30);
  F.allocateTopDown(t, 1e-6, 'weighted');
  const a = t.children[0].probability, b = t.children[1].probability;
  check('a 30 / 70 weighting allocates ~30 / ~70 of the budget',
    near(a / (a + b), 0.30, 0.02) && near(b / (a + b), 0.70, 0.02),
    (100 * a / (a + b)).toFixed(1) + '% / ' + (100 * b / (a + b)).toFixed(1) + '%');
}

console.log('\n[6b] Adding an event must not disturb the existing apportionment (66.17)');
{
  // Exactly the sequence addSelectedEvent() performs in top-down mode:
  //   normalise the existing group, then rebalance the newcomer in at its equal share.
  const addInto = (existing) => {
    const nn = { id: 999, name: 'New Event' };          // no weight, as minted
    const sibs = existing.concat([nn]);
    F._normalizeSiblingWeights(existing);
    F._rebalanceSiblingWeights(nn, sibs, 100 / sibs.length);
    return { nn, sibs };
  };

  let { nn, sibs } = addInto([{ id: 1, weight: 50 }, { id: 2, weight: 50 }]);
  check('a new event in a 50/50 group takes a third, not 1%',
    near(nn.weight, 100 / 3, 1e-9), 'new=' + nn.weight.toFixed(2));
  check('the group still sums to 100', near(sibs.reduce((s, k) => s + k.weight, 0), 100, 1e-9),
    sibs.map(k => k.weight.toFixed(1)).join(' / '));

  ({ nn, sibs } = addInto([{ id: 1, weight: 70 }, { id: 2, weight: 30 }]));
  check('DELIBERATE weights keep their relative split (70:30 stays 70:30)',
    near(sibs[0].weight / sibs[1].weight, 70 / 30, 1e-6),
    sibs.map(k => k.weight.toFixed(1)).join(' / '));
  check('...and the group still sums to 100', near(sibs.reduce((s, k) => s + k.weight, 0), 100, 1e-9));

  ({ nn, sibs } = addInto([{ id: 1, weight: 60, weightLocked: true }, { id: 2, weight: 40 }]));
  check('a LOCKED sibling is not moved by the insert', near(sibs[0].weight, 60, 1e-9),
    sibs.map(k => k.weight.toFixed(1)).join(' / '));
  check('the unlocked sibling absorbs it and the group still sums to 100',
    near(sibs.reduce((s, k) => s + k.weight, 0), 100, 1e-9));

  // and the allocation that comes out the other side
  const t = { id: 1, type: 'gate', gateType: 'OR', children: [
    { id: 2, type: 'basic' }, { id: 3, type: 'basic' }, { id: 4, type: 'basic' } ] };
  F.seedTopDownWeights(t);
  F.allocateTopDown(t, 3e-9, 'weighted');
  const ps = t.children.map(c => c.probability);
  check('three equal children each get a third of the budget',
    near(ps[0], ps[1], 1e-9) && near(ps[1], ps[2], 1e-9), ps.map(p => p.toExponential(2)).join(' / '));
}

console.log('\n[6c] Conservatism travels with a copied node — A9: the slack is a MARGIN, absorbed only by decision');
{
  // Waqas, 19 Aug: "when you copy over an event or a node from a more conservative
  // tree to a less conservative tree it maintains its conservatism and lessens the
  // burden for the new sibling nodes." Copy stamps _pasteOrigin.snapshotProb with the
  // node's probability in the SOURCE tree (support_modules.js), and allocateTopDown
  // treats that as a hard cap, redistributing the remaining budget to the free
  // siblings by gate logic. NOTHING pinned this before today.
  const pasted = (p, extra) => Object.assign({ id: 2, type: 'basic', weight: 50,
    _pasteOrigin: { snapshotProb: p, sourcePageName: 'stricter tree' } }, extra || {});
  const gate = (gt, kids) => ({ id: 1, type: 'gate', gateType: gt, children: kids });

  let X = pasted(1e-9), Y = { id: 3, type: 'basic', weight: 50 };
  // A9 (21 Aug 2026) — the silent absorb stopped. The sibling keeps its
  // NATURAL share; the slack lives on the gate as an under-allocated margin,
  // and only an accepted, signed SLBudgetDecisions absorb closes the gate.
  const t1 = gate('OR', [X, Y]);
  F.allocateTopDown(t1, 1e-6, 'weighted');
  check('the copied node KEEPS its conservative value', near(X.probability, 1e-9, 1e-9),
    X.probability.toExponential(3));
  check('A9: the sibling keeps its NATURAL share — no silent loosen',
    Math.abs(Y.probability - 5e-7) < 5e-9, 'sibling=' + Y.probability.toExponential(3));
  check('A9: the slack is recorded on the gate as under-allocated margin',
    t1._budgetMargin && t1._budgetMargin.state === 'under-allocated' &&
    Math.abs(t1._budgetMargin.achieved - (X.probability + Y.probability)) < 1e-12,
    JSON.stringify(t1._budgetMargin));

  // symmetric case: a copy from a LOOSER tree no longer silently tightens the
  // siblings — the gate goes over-committed RED and the analyst decides.
  X = pasted(9e-7); Y = { id: 3, type: 'basic', weight: 50 };
  const t2 = gate('OR', [X, Y]);
  F.allocateTopDown(t2, 1e-6, 'weighted');
  check('A9: a looser copied node leaves the sibling natural and goes over-committed RED',
    Math.abs(Y.probability - 5e-7) < 5e-9 && t2._budgetMargin && t2._budgetMargin.state === 'over-committed',
    'sibling=' + Y.probability.toExponential(3) + ' margin=' + JSON.stringify(t2._budgetMargin));
  check('A9: the old rebalance flag is gone on the default path (it would be a lie)',
    !t2._externalRebalance, JSON.stringify(t2._externalRebalance || null));

  // AND: the product must still hold
  X = pasted(1e-3); Y = { id: 3, type: 'basic', weight: 50 };
  F.allocateTopDown(gate('AND', [X, Y]), 1e-6, 'weighted');
  check('under AND the product still equals the target',
    near(X.probability * Y.probability, 1e-6, 1e-6),
    X.probability.toExponential(2) + ' x ' + Y.probability.toExponential(2));

  // the node keeps a readable record of what happened to it
  X = pasted(1e-9);
  F.allocateTopDown(gate('OR', [X, { id: 3, type: 'basic', weight: 50 }]), 1e-6, 'weighted');
  const rec = X._externalAllocation || {};
  check('the pasted node records apportioned vs external vs effective',
    typeof rec.apportioned === 'number' && typeof rec.external === 'number' && rec.effective === 1e-9,
    JSON.stringify(rec));
  // KNOWN GAP, pinned deliberately so a change is noticed: on the external-rebalance
  // path the parent recurses into the constrained child with the CAP as its target, so
  // `apportioned` is the cap, not the natural share it would have had (5.0e-7 here).
  // The record therefore cannot show "allocated 5.0e-7 naturally, held at 1.0e-9 by its
  // source tree" — the one line that would explain the redistribution to the engineer —
  // and headroom/overrun can never fire on this path. Left AS IS on 19 Aug: allocation
  // behaviour is correct and Waqas's standing instruction is not to disturb the
  // rebalancer for a display improvement. If the natural share is ever recorded, this
  // assertion is what will fail and tell the next session it was done on purpose.
  check('KNOWN: apportioned collapses to the cap, so headroom never fires here',
    rec.apportioned === 1e-9 && rec.headroom === false,
    JSON.stringify(rec));
}

console.log('\n[7] Canvas metrics follow the MODE, not the page role (the λ+P report)');
{
  // Real formatNodeMetrics, with the globals it reads stubbed.
  const metricsSrc = slice('helpers_modules.js', 'function formatNodeMetrics(d) {', 'function formatNodeActualLine');
  const mk = (page, cfg) => new Function('page', 'cfg',
    'var ftaPages = [page], activeFTAPageId = page.id, ftaConfig = cfg;' +
    'function rateEquivalentForProb(p, t) { return (p > 0 && p < 1) ? (-Math.log1p(-p) / t) : 0; }' +
    'function _missionHoursForNormalization() { return cfg.exposureTime; }' +
    metricsSrc + '; return formatNodeMetrics;')(page, cfg);

  // An allocation-authored leaf: a probability budget, no λ (allocation deletes it).
  const leaf = { id: 9, type: 'basic', probability: 5.42e-5 };
  const d = { data: leaf };

  const verifPageTopDown = { id: 'p1', verifies: true, mode: 'top-down', root: leaf };
  const outTD = mk(verifPageTopDown, { mode: 'top-down', exposureTime: 3 })(d);
  check('verification page switched to top-down shows P only, no λ',
    outTD.indexOf('λ') === -1 && outTD.indexOf('P=') === 0, outTD);
  check('...and shows the real allocated budget, not zero',
    /5\.42E-5/.test(outTD), outTD);

  const verifPageBottomUp = { id: 'p2', verifies: true, mode: 'bottom-up', root: leaf };
  const outBU = mk(verifPageBottomUp, { mode: 'bottom-up', exposureTime: 3 })(d);
  check('bottom-up still leads with λ', outBU.indexOf('λ=') === 0, outBU);
  check('a leaf with no measured λ reports the probability the engine used, not P=0',
    /P=5\.42E-5/.test(outBU), outBU);

  const measured = { data: { id: 10, type: 'basic', lambda: 1.0e-5 } };
  const outMeas = mk(verifPageBottomUp, { mode: 'bottom-up', exposureTime: 3 })(measured);
  check('a measured λ still drives P = 1 − exp(−λt)',
    /λ=1\.00E-5/.test(outMeas) && /P=3\.00E-5/.test(outMeas), outMeas);
}

console.log('\n' + (fail === 0
  ? 'ALL GREEN — ' + pass + ' checks'
  : fail + ' FAILED, ' + pass + ' passed'));
process.exit(fail === 0 ? 0 : 1);

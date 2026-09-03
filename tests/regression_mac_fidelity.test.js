#!/usr/bin/env node
/*
 * Regression tests for Phase D gap 2 — the MAC L1/L2 fidelity ladder.
 *
 * Loads the REAL modules (fta_engine, fta_quant_modules for bddMinimalCutsets,
 * helpers_modules, misc_fn_modules) headlessly and locks:
 *   [1] L0 REGRESSION — weightless rules produce byte-identical breach sets to
 *       an independent reimplementation of the original combinatorics, and
 *       byte-identical fingerprints to the original fp formula.
 *   [2] weighted floors — breach sets equal hand-enumerated truth.
 *   [3] degraded states — own events, loss dominates (levels exclusive),
 *       cross-branch minimality via subsumption.
 *   [4] the explosion guard refuses (never approximates).
 *   [5] compile → BDD equivalence proof (_macVerify) holds for L0 AND L1/L2
 *       trees; L1/L2 edits change the fingerprint (upgrade diff machinery).
 *   [6] schema validation catches bad weights / floors / degraded rows.
 *
 * Run:  node tests/regression_mac_fidelity.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const canon = sets => sets.map(s => s.slice().sort().join('|')).sort();

// ---- load real modules ------------------------------------------------------
globalThis.window = globalThis;
globalThis.projectConfig = {};
globalThis.projectName = 'K350';
globalThis.internalIdCounter = 1000;
globalThis.systemsData = [
  { id: 'A', name: 'Sys A' }, { id: 'B', name: 'Sys B' }, { id: 'C', name: 'Sys C' }, { id: 'D', name: 'Sys D' },
];
globalThis.acFunctionsData = [{ subId: 'F-1', subName: 'Control pitch' }];
globalThis.acFhaData = [{ internalId: 'FC1', fcId: 'FC-001', subId: 'F-1', severity: 'Catastrophic' }];
globalThis.flightPhasesData = [];
globalThis.ftaPages = [];
globalThis.ftaConfig = {};
globalThis.commitSaveChanges = () => {};
globalThis.showToast = () => {};
globalThis.updateDashboard = () => {};
globalThis.renderMfmsPanel = () => {};
globalThis.document = { getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} }), addEventListener: () => {}, querySelectorAll: () => [], body: { appendChild: () => {} } };

// One combined indirect eval — in the browser these are classic scripts sharing
// ONE global lexical environment (const BDD in engine_modules.js is visible to
// fta_quant_modules.js). Node's indirect eval does not share consts across
// calls, so concatenate to reproduce the browser scope exactly.
(0, eval)([
  'engine_modules.js',        // page-side BDD / SLDB (const, shared lexically)
  'fta_quant_modules.js',     // buildBDDFromFT + bddMinimalCutsets
  'helpers_modules.js',       // macCompile / _macVerify / _macRuleFp / renderMacPage
  'misc_fn_modules.js',       // macBreachSetsChecked / macRuleLevel / _macStore
  'mbsa_schema.js',           // contract validation
].map(f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8')).join('\n;\n'));

const G = globalThis;
check('real machinery loaded', typeof G.macBreachSetsChecked === 'function' && typeof G.macCompile === 'function' && typeof G.bddMinimalCutsets === 'function');

// Original L0 combinatorics + fp formula, reimplemented independently.
function l0Breach(rule) {
  const out = [];
  (rule.clauses || []).forEach(cl => {
    const members = cl.of || [];
    const need = members.length - (cl.min || 1) + 1;
    if (need <= 0 || need > members.length) return;
    (function pick(start, cur) {
      if (cur.length === need) { out.push(cur.slice()); return; }
      for (let i = start; i < members.length; i++) { cur.push(members[i]); pick(i + 1, cur); cur.pop(); }
    })(0, []);
  });
  const sets = out.map(a => [...new Set(a)].sort()).sort((a, b) => a.length - b.length);
  const min = [];
  sets.forEach(s => {
    const sub = min.some(m => m.every(x => s.indexOf(x) !== -1));
    if (!sub && !min.some(m => m.length === s.length && m.every((x, i) => x === s[i]))) min.push(s);
  });
  return min;
}
const oldFp = rule => G._ckptFnv(JSON.stringify([rule.subId, rule.phase, (rule.clauses || []).map(c => [c.min, (c.of || []).slice().sort()])]));

console.log('\n[1] L0 regression — byte-identical breach sets + fingerprints');
const L0_CASES = [
  { id: 'r1', subId: 'F-1', phase: 'All phases', clauses: [{ min: 2, of: ['A', 'B', 'C'] }] },
  { id: 'r2', subId: 'F-1', phase: 'All phases', clauses: [{ min: 1, of: ['A', 'B'] }] },
  { id: 'r3', subId: 'F-1', phase: 'All phases', clauses: [{ min: 3, of: ['A', 'B', 'C'] }] },
  { id: 'r4', subId: 'F-1', phase: 'Cruise', clauses: [{ min: 1, of: ['A', 'B', 'C'] }, { min: 1, of: ['A', 'D'] }] },
];
L0_CASES.forEach(r => {
  const now = G.macBreachSetsChecked(r);
  check('L0 ' + r.id + ' breach sets identical', JSON.stringify(canon(now.sets)) === JSON.stringify(canon(l0Breach(r))) && !now.error,
        JSON.stringify(canon(now.sets)) + ' vs ' + JSON.stringify(canon(l0Breach(r))));
  check('L0 ' + r.id + ' fingerprint identical to the original formula', G._macRuleFp(r) === oldFp(r));
  check('L0 ' + r.id + ' level derived 0', G.macRuleLevel(r) === 0);
});

console.log('\n[2] weighted floor — hand-enumerated truth');
// A(3), B(1), C(1); floor 1.5 → breach iff damage > 3.5.
// {A} (dmg 3) no; {A,B} (4) yes; {A,C} yes; {B,C} (2) no; {A,B,C} superset.
const rw = { id: 'rw', subId: 'F-1', phase: 'All phases', clauses: [{ min: 1, of: ['A', 'B', 'C'], weights: { A: 3 }, floor: 1.5 }] };
const rwSets = G.macBreachSetsChecked(rw);
check('floor case: exactly {A,B} and {A,C}', JSON.stringify(canon(rwSets.sets)) === JSON.stringify(canon([['A', 'B'], ['A', 'C']])), JSON.stringify(rwSets.sets));
check('level derived L2', G.macRuleLevel(rw) === 2);
// Floor 3.5: surviving must be ≥3.5 → A alone dying (surv 2) breaches: {A}; also {B,C} (surv 3) breaches.
const rw2 = { id: 'rw2', subId: 'F-1', phase: 'All phases', clauses: [{ min: 1, of: ['A', 'B', 'C'], weights: { A: 3 }, floor: 3.5 }] };
check('tighter floor: {A} and {B,C}', JSON.stringify(canon(G.macBreachSetsChecked(rw2).sets)) === JSON.stringify(canon([['A'], ['B', 'C']])), JSON.stringify(G.macBreachSetsChecked(rw2).sets));

console.log('\n[3] degraded states');
// A(2) with degraded 'half' retaining 1; B(1); floor 2 → breach iff dmg > 1.
// {loss A}(2) yes; {deg A}(1) no… dmg=1 not >1; {deg A, loss B}(2) yes; {loss B}(1) no.
const rd = { id: 'rd', subId: 'F-1', phase: 'All phases', degraded: [{ sysId: 'A', label: 'half', weight: 1 }],
             clauses: [{ min: 1, of: ['A', 'B'], weights: { A: 2 }, floor: 2 }] };
const rdSets = G.macBreachSetsChecked(rd);
check('degraded truth: {A} and {deg:A:half, B}', JSON.stringify(canon(rdSets.sets)) === JSON.stringify(canon([['A'], ['B', 'deg:A:half']])), JSON.stringify(rdSets.sets));
check('level derived L2 (floor present)', G.macRuleLevel(rd) === 2);
check('no set mixes loss and degraded of the same member (levels exclusive)',
      rdSets.sets.every(s => !(s.indexOf('A') !== -1 && s.some(k => k.indexOf('deg:A:') === 0))));
// Degraded-only (no floor) → L1.
const rl1 = { id: 'rl1', subId: 'F-1', phase: 'All phases', degraded: [{ sysId: 'A', label: 'slow', weight: 0.5 }],
              clauses: [{ min: 2, of: ['A', 'B', 'C'] }] };
check('degraded without floor → L1', G.macRuleLevel(rl1) === 1);

console.log('\n[4] explosion guard');
const big = { id: 'big', subId: 'F-1', phase: 'All phases',
  degraded: Array.from({ length: 3 }, (_, i) => ({ sysId: 'A', label: 'd' + i, weight: 0.1 * (i + 1) })),
  clauses: [{ min: 1, of: Array.from({ length: 12 }, (_, i) => 'S' + i), floor: 0.5, weights: {} }] };
big.clauses[0].weights.S0 = 2;
const bigRes = G.macBreachSetsChecked(big);
// 12 members at ≥2 levels each with one at 5 → fine; make it explode with degraded everywhere:
const huge = { id: 'huge', subId: 'F-1', phase: 'All phases',
  degraded: [], clauses: [{ min: 1, of: Array.from({ length: 20 }, (_, i) => 'S' + i), floor: 10.5, weights: { S0: 2 } }] };
for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) huge.degraded.push({ sysId: 'S' + i, label: 'd' + j, weight: 0.2 + 0.2 * j });
const hugeRes = G.macBreachSetsChecked(huge);
check('over-cap clause refuses with a named error (never approximates)', hugeRes.error != null && /enumeration cap/.test(hugeRes.error), String(hugeRes.error));
check('within-cap weighted clause still enumerates', bigRes.error == null);

console.log('\n[5] compile → BDD equivalence proof');
const store = G._macStore ? G._macStore() : (projectConfig.macModels = projectConfig.macModels || []);
const rules = projectConfig.macModels = [];
const l0rule = { id: 'c-l0', subId: 'F-1', phase: 'All phases', clauses: [{ min: 2, of: ['A', 'B', 'C'] }] };
const l2rule = { id: 'c-l2', subId: 'F-1', phase: 'All phases', degraded: [{ sysId: 'A', label: 'half', weight: 1 }],
                 clauses: [{ min: 1, of: ['A', 'B'], weights: { A: 2 }, floor: 2 }] };
rules.push(l0rule, l2rule);
const res0 = G.macCompile('c-l0');
check('L0 compile ok + equivalence-proven (VOTING fast path)', res0.ok && res0.verified === true, JSON.stringify(res0));
const res2 = G.macCompile('c-l2');
check('L1/L2 compile ok + equivalence-proven (breach-set construction)', res2.ok && res2.verified === true, JSON.stringify(res2));
const page2 = ftaPages.find(p => p.id === res2.pageId);
check('compiled L2 tree carries macdeg event with provenance', JSON.stringify(page2.root).indexOf('macdeg:A:half') !== -1 && /compiled/.test(page2.root._macProvenance));
// Fingerprint sensitivity: fidelity edit → fp changes → recompile diffs.
const fpBefore = G._macRuleFp(l2rule);
l2rule.clauses[0].floor = 2.5;
check('fidelity edit changes the fingerprint (upgrade-diff machinery arms)', G._macRuleFp(l2rule) !== fpBefore);
const res2b = G.macCompile('c-l2');
check('recompile after upgrade diffs the breach set (+/− combos reported)', res2b.ok && (res2b.added.length + res2b.removed.length) > 0, JSON.stringify({ a: res2b.added, r: res2b.removed }));
check('recompile keeps the page id (links survive)', res2b.pageId === res2.pageId);

console.log('\n[6] schema validation');
const V = G.MBSA_SCHEMA;
check('MBSA_SCHEMA.validateRule exported', !!(V && typeof V.validateRule === 'function'));
check('bad weight (≤0) flagged', V.validateRule({ id: 'x', subId: 'F-1', clauses: [{ min: 1, of: ['A'], weights: { A: 0 } }] }).some(i => /must be > 0/.test(i)));
check('unsatisfiable floor flagged', V.validateRule({ id: 'x', subId: 'F-1', clauses: [{ min: 1, of: ['A', 'B'], floor: 5 }] }).some(i => /exceeds total capacity/.test(i)));
check('degraded ≥ full capacity flagged', V.validateRule({ id: 'x', subId: 'F-1', degraded: [{ sysId: 'A', label: 'd', weight: 2 }], clauses: [{ min: 1, of: ['A', 'B'] }] }).some(i => /must be < the member/.test(i)));
check('degraded for a non-member flagged', V.validateRule({ id: 'x', subId: 'F-1', degraded: [{ sysId: 'D', label: 'd', weight: 0.5 }], clauses: [{ min: 1, of: ['A', 'B'] }] }).some(i => /not a member of any clause/.test(i)));
check('clean L2 rule validates clean', V.validateRule({ id: 'x', subId: 'F-1', degraded: [{ sysId: 'A', label: 'd', weight: 0.5 }], clauses: [{ min: 1, of: ['A', 'B'], weights: { A: 2 }, floor: 1.5 }] }).length === 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

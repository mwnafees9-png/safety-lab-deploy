#!/usr/bin/env node
/*
 * Regression tests for the "connected thread" wiring:
 *   #1 Auto-drive gate 'compromised' from an open, linked CMA common-mode finding.
 *   #3 Failure-frequency w_TE (Vesely–Goldberg) surfaced in the calc panel.
 *
 * [1] loads the REAL site/fta_engine.js and checks computeFailureFrequency against the
 *     ARP4761A App G Fig G29 worked example (w_TE = 3.75e-14/hr).
 * [2]/[3] lock the CMA-compromise filter + override logic (faithful mirror of
 *     _cmaCompromisedGateIdSet + the allocateDAL override in safety_lab.js).
 *
 * Run:  node tests/regression_cma_wTE_wiring.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const approx = (a, b, rel) => Math.abs(a - b) <= Math.abs(b) * (rel == null ? 0.02 : rel);

console.log('\n[1] computeFailureFrequency (real fta_engine.js) — ARP4761A App G Fig G29');
eval(fs.readFileSync(path.join(__dirname, '..', 'site', 'fta_engine.js'), 'utf8')); // sets globalThis.SLFTAEngine
const ENG = globalThis.SLFTAEngine;
check('SLFTAEngine.computeFailureFrequency is available', ENG && typeof ENG.computeFailureFrequency === 'function');
const t = 5;
const mkBE = (id, lam) => ({ id, logicalId: id, type: 'basic', lambda: lam, probability: -Math.expm1(-lam * t) });
const root = { id: 100, type: 'gate', gateType: 'AND',
  children: [ mkBE(1, 1e-5), mkBE(2, 1e-6), mkBE(3, 5e-5) ] };
const ff = ENG.computeFailureFrequency(root);
check('w_TE ≈ 3.75e-14 /hr (Σ_j λ_j ∏_{i≠j} P_i over the cut set)',
      ff && approx(ff.wTE, 3.75e-14, 0.02), 'got ' + (ff && ff.wTE));
// sanity: distinct from the unavailability P(top) ≈ 6.25e-14 (engine exact)
const ptop = ENG.computeExactProbability(root).prob;
check('w_TE is distinct from P(top) (frequency ≠ unavailability)',
      ff && Math.abs(ff.wTE - ptop) > 1e-15, 'wTE=' + (ff && ff.wTE) + ' pTop=' + ptop);

console.log('\n[2] _cmaCompromisedGateIdSet — open/linked common-mode filter (mirror)');
// Faithful mirror of safety_lab.js _cmaCompromisedGateIdSet.
function cmaCompromisedGateIdSet(cmaData) {
  const set = new Set();
  (cmaData || []).forEach(c => {
    if (!c || c.suggested) return;
    const open = c.status !== 'Mitigated' && c.status !== 'Closed — Accepted';
    const hasSignal = (Array.isArray(c.modes) && c.modes.length > 0) || (c.findings && String(c.findings).trim());
    if (!open || !hasSignal) return;
    (Array.isArray(c.linkedGateIds) ? c.linkedGateIds : []).forEach(key => {
      const k = String(key); const nid = k.slice(k.lastIndexOf(':') + 1);
      if (nid) set.add(nid);
    });
  });
  return set;
}
const cma = [
  { status: 'Open',               findings: 'shared bus', linkedGateIds: ['page-fc-ele01:42'] },           // counts -> '42'
  { status: 'In Progress',        modes: ['shared-resource'], linkedGateIds: ['page-x:7'] },               // counts -> '7'
  { status: 'Mitigated',          findings: 'handled',    linkedGateIds: ['page-x:99'] },                  // excluded (mitigated)
  { status: 'Closed — Accepted',  findings: 'accepted',   linkedGateIds: ['page-x:98'] },                  // excluded (closed)
  { status: 'Open',               modes: [], findings: '', linkedGateIds: ['page-x:50'] },                 // excluded (no signal)
  { status: 'Open', suggested: true, findings: 'auto',     linkedGateIds: ['page-x:60'] }                  // excluded (suggestion)
];
const set = cmaCompromisedGateIdSet(cma);
check('open + findings + linked gate is included (nodeId 42 parsed)', set.has('42'));
check('open + modes is included (nodeId 7)', set.has('7'));
check('Mitigated CMA excluded', !set.has('99'));
check('Closed — Accepted CMA excluded', !set.has('98'));
check('no-signal CMA excluded', !set.has('50'));
check('suggested (un-accepted) CMA excluded', !set.has('60'));
check('exactly the two valid gates flagged', set.size === 2);

console.log('\n[3] allocateDAL override — CMA finding overrides the manual claim');
// Mirror of the override decision in allocateDAL.
function effectiveIndep(node, cmaSet) {
  let indep = node.dalIndependence || 'claimed';
  const cmaHit = !!(cmaSet && cmaSet.has(String(node.id)));
  if (cmaHit) indep = 'compromised';
  return { indep, cmaHit };
}
check('claimed gate with a CMA hit -> compromised',
      effectiveIndep({ id: 42, dalIndependence: 'claimed' }, set).indep === 'compromised');
check('substantiated gate with a CMA hit -> compromised (finding overrides claim)',
      effectiveIndep({ id: 7, dalIndependence: 'substantiated' }, set).indep === 'compromised');
check('gate with NO CMA hit keeps its manual claim',
      effectiveIndep({ id: 1234, dalIndependence: 'substantiated' }, set).indep === 'substantiated');
check('numeric node.id matches string-keyed set (coercion holds)',
      effectiveIndep({ id: 42 }, set).cmaHit === true);

console.log('\n' + (fail === 0 ? '✓ ALL PASS' : '✗ ' + fail + ' FAILED') + '  (' + pass + ' passed, ' + fail + ' failed)\n');
process.exit(fail === 0 ? 0 : 1);

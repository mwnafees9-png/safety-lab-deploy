#!/usr/bin/env node
/*
 * Regression — ops_mc v0.1 (OPS-MC, task #92: operational forecast MC fed by
 * the FRACAS ledger).
 *   [1] refusals with engineering language: no incidents / hours ≤ 0 / <2
 *       recorded repairs / bad horizon / N < 100 / target outside (0,100).
 *   [2] MC-SEED discipline: same seed ⇒ identical percentiles bit-for-bit;
 *       default seed 42; different seed ⇒ different mean; seed echoed.
 *   [3] arithmetic honesty: mean failures ≈ λ·horizon (Poisson identity);
 *       percentile ordering P50 ≤ P90 ≤ P95 ≤ P99; availability bounded;
 *       exceedance in [0,100]; λ fed = incidents/hours (incidents WIN).
 *   [4] doctrine in source: empirical bootstrap of the ledger's own repairs;
 *       claimed-lane forecast language; computed-never-stored; NO EVAL; no
 *       Math.random; no Date; nothing new in the project payload.
 *   [5] wiring: script tag after fracas_ledger, cache-busted; _omWrapped
 *       moat guard on the renderRamRelPage wrap.
 * Run: node tests/regression_ops_mc.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

const OM = require('../site/ops_mc.js');
const src = S('ops_mc.js'), idx = S('index.html');

const rec = (over) => Object.assign({
    id: 'FRC-9', hours: 12000,
    incidents: [
        { id: 'INC-001', mode: 'chip', repairHrs: 3 },
        { id: 'INC-002', mode: 'chip', repairHrs: 5 },
        { id: 'INC-003', mode: 'oil',  repairHrs: 4 }
    ]
}, over || {});

// ---- [1] refusals ---------------------------------------------------------------
check('no incidents refused (forecast with no history is fiction)',
    throws(() => OM.simulate(rec({ incidents: [] })), /no operational history is fiction/));
check('hours ≤ 0 refused (a rate needs a denominator)',
    throws(() => OM.simulate(rec({ hours: 0 })), /denominator/));
check('<2 recorded repairs refused (bootstrap needs observations)',
    throws(() => OM.simulate(rec({ incidents: [{ id: 'I1', mode: 'x', repairHrs: 3 }] }), {}), /at least two observations/));
check('bad horizon / small N / bad target refused',
    throws(() => OM.simulate(rec(), { horizonHrs: 0 }), /horizon/) &&
    throws(() => OM.simulate(rec(), { N: 50 }), /vibe, not a distribution/) &&
    throws(() => OM.simulate(rec(), { availTargetPct: 100 }), /inside \(0, 100\)/));

// ---- [2] MC-SEED discipline -----------------------------------------------------
const o = { horizonHrs: 40000, N: 2000, seed: 7, availTargetPct: 99 };
const a = OM.simulate(rec(), o), b = OM.simulate(rec(), o);
check('same seed ⇒ identical percentiles + exceedance (bit-for-bit)',
    a.failures.p50 === b.failures.p50 && a.failures.p99 === b.failures.p99 &&
    a.downtimeHrs.p95 === b.downtimeHrs.p95 && a.pAvailBelowTargetPct === b.pAvailBelowTargetPct);
const c = OM.simulate(rec(), Object.assign({}, o, { seed: 8 }));
check('different seed ⇒ different mean', a.failures.mean !== c.failures.mean);
check('default seed 42, echoed in the result', OM.simulate(rec(), { N: 200 }).seed === 42 && a.seed === 7);

// ---- [3] arithmetic honesty -----------------------------------------------------
// λ = 3/12000 = 2.5e-4; horizon 40000 ⇒ Poisson mean 10; N=2000 ⇒ SE(mean) ≈ 0.07.
check('mean failures ≈ λ·horizon (|Δ| < 0.5 at ~7σ headroom)', Math.abs(a.failures.mean - 10) < 0.5, 'mean=' + a.failures.mean);
check('λ fed = incidents/hours — incidents WIN over the authored count',
    Math.abs(a.lambdaFed - 3 / 12000) < 1e-15 && Math.abs(OM.simulate(rec({ failures: 99 }), { N: 200 }).lambdaFed - 3 / 12000) < 1e-15);
const ordered = q => q.p50 <= q.p90 && q.p90 <= q.p95 && q.p95 <= q.p99;
check('percentile ordering P50 ≤ P90 ≤ P95 ≤ P99 (failures + downtime)', ordered(a.failures) && ordered(a.downtimeHrs));
check('availability bounded and low-tail ≤ median; exceedance in [0,100]',
    a.availabilityPct.p05 <= a.availabilityPct.p50 && a.availabilityPct.p50 <= 100 &&
    a.pAvailBelowTargetPct >= 0 && a.pAvailBelowTargetPct <= 100);
check('repairs observed count reported (the bootstrap receipt)', a.repairsObserved === 3);

// ---- [4] doctrine in source -----------------------------------------------------
check('empirical bootstrap language — the fleet’s history, resampled',
    /EMPIRICAL BOOTSTRAP/.test(src) && /repairs\[Math\.floor\(rng\(\) \* repairs\.length\)\]/.test(src));
check('claimed-lane forecast language in result basis',
    /forecast, not a demonstration/.test(a.basis) && /credit only what the fleet demonstrates/.test(a.basis));
check('computed, never stored — and nothing new in the payload',
    /Computed, never stored/.test(a.basis) && S('misc_fn_modules.js').indexOf('opsMc') === -1 && !/scheduleAutosave/.test(src));
const codeLines = src.split('\n').filter(l => !/^\s*\/\//.test(l));
check('NO EVAL / no Math.random / no Date (in code; comment mentions of the ban allowed)',
    src.indexOf('(0, eval)') === -1 && src.indexOf('new Function') === -1 &&
    codeLines.every(l => l.indexOf('Math.random') === -1 && !/\bDate\b/.test(l)));
check('seed + N printed in the basis receipt', /mulberry32\(7\), N = 2000/.test(a.basis));

// ---- [5] wiring -----------------------------------------------------------------
check('script tag after fracas_ledger, cache-busted', /ops_mc\.js\?v=0\.\d/.test(idx) &&
    idx.indexOf('fracas_ledger.js') < idx.indexOf('ops_mc.js'));
check('moat guard on the renderRamRelPage wrap (_omWrapped)', /_omWrapped/.test(src));
check('projectConfig accessed as SCRIPT-SCOPE global, never window.projectConfig (the let-globals trap, found live in v0.1)',
    /typeof projectConfig !== 'undefined'/.test(src) && src.indexOf('window.projectConfig') === -1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

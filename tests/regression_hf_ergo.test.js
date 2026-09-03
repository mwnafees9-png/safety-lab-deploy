#!/usr/bin/env node
/*
 * Regression — hf_ergo v0.1 (HF-5 + HF-6) and its wiring.
 *   [1] Fitts: exact math (Shannon formulation); geometry refusals; UNCITED
 *       coefficients refused; non-positive slope refused; seed language.
 *   [2] ISO 9241 spine: designations present, text never stored (metadata
 *       only), cite-and-point role.
 *   [3] seven-factor taxonomy: exactly the seven, ids stable, lookup +
 *       distribution math; unclassified counted honestly.
 *   [4] STPA integration: engine passes factorClass through scenarios;
 *       panel validates the class on authoring and renders the lens line.
 *   [5] HFA integration: ergo card + compute handler exported; calculator
 *       output is a SEED (never writes the ledger).
 *   [6] wiring: hf_ergo.js loads before the panels that read it, versions
 *       bumped (stpa_core 0.2, stpa_panel 0.3, hf_register_panel 0.5).
 * Run: node tests/regression_hf_ergo.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const E = require('../site/hf_ergo.js');

// ---- [1] Fitts ----------------------------------------------------------------
const r = E.fitts({ dMm: 300, wMm: 20, aMs: 100, bMs: 150, basis: 'bench trials per ISO 9241-9, panel mockup rev B' });
check('Fitts exact: ID = log2(16) = 4 bits, MT = 100 + 150*4 = 700 ms', Math.abs(r.idBits - 4) < 1e-12 && Math.abs(r.mtMs - 700) < 1e-9);
check('bigger/closer is faster (monotonic in D/W)',
  E.fitts({ dMm: 150, wMm: 20, aMs: 100, bMs: 150, basis: 'bench trials rev B' }).mtMs < r.mtMs &&
  E.fitts({ dMm: 300, wMm: 40, aMs: 100, bMs: 150, basis: 'bench trials rev B' }).mtMs < r.mtMs);
check('zero/negative geometry refused with engineering language',
  throws(() => E.fitts({ dMm: 0, wMm: 20, aMs: 1, bMs: 1, basis: 'x'.repeat(9) })) &&
  throws(() => E.fitts({ dMm: 300, wMm: 0, aMs: 1, bMs: 1, basis: 'x'.repeat(9) }), /undesignable/));
check('UNCITED coefficients refused (missing a/b · short basis)',
  throws(() => E.fitts({ dMm: 300, wMm: 20, basis: 'long enough basis' }), /EMPIRICAL/) &&
  throws(() => E.fitts({ dMm: 300, wMm: 20, aMs: 100, bMs: 150, basis: 'meh' }), /guess wearing a suit/));
check('non-positive slope refused (harder is not faster)', throws(() => E.fitts({ dMm: 300, wMm: 20, aMs: 100, bMs: -5, basis: 'long enough basis' }), /no cited dataset/));
check('result is a SEED, says so, and carries formula + basis', /SEED/.test(r.seedNote) && /log2\(D\/W \+ 1\)/.test(r.formula) && /9241-9/.test(r.formula) && /rev B/.test(r.basis));

// ---- [2] ISO 9241 spine -------------------------------------------------------
check('spine: family + four parts incl. 110/112/210/9', E.ISO_9241.parts.length === 4 &&
  ['ISO 9241-110', 'ISO 9241-112', 'ISO 9241-210', 'ISO 9241-9'].every(d => E.ISO_9241.parts.some(p => p.designation === d)));
check('cite-and-point: role says text never stored; no clause text in the file',
  /text never stored/.test(E.ISO_9241.role) && S('hf_ergo.js').length < 12000);

// ---- [3] the seven factors ----------------------------------------------------
check('exactly seven classes with stable ids', E.FACTOR_CLASSES.length === 7 &&
  ['physiological', 'psychological', 'cognitive', 'environmental', 'organizational', 'technological', 'procedural']
    .every(id => E.isFactorClass(id)));
check('unknown class rejected; lookup case-insensitive', !E.isFactorClass('managerial') && E.factorClass('COGNITIVE').id === 'cognitive');
const d = E.classDistribution([{ factorClass: 'cognitive' }, { factorClass: 'cognitive' }, { factorClass: 'organizational' }, { factor: 'unclassified one' }]);
check('distribution math + honest unclassified count', d.dist.cognitive === 2 && d.dist.organizational === 1 && d.unclassified === 1 && d.total === 4);

// ---- [4] STPA integration -----------------------------------------------------
const STPA_E = require('../site/stpa_core.js');
const GLA = { controllers: [{ id: 'c1', name: 'C', kind: 'automation' }], processes: [{ id: 'p1', name: 'P' }],
  actions: [{ id: 'a1', from: 'c1', to: 'p1', name: 'act' }], feedbacks: [{ id: 'f1', from: 'p1', to: 'c1', name: 'fb' }] };
const ls = STPA_E.lossScenarios(GLA, { 'a1:np': { status: 'assessed', context: 'true hazardous state (J3307 five-part)', scenarios: [{ desc: 'x',
  causalFactors: [{ factor: 'crew overload', asmId: 'AS-1', factorClass: 'cognitive' }, { factor: 'plain' }] }] } }, () => ({ state: 'Validated', effective: 'ok' }));
check('engine passes factorClass through to computed scenarios (and null when absent)',
  ls.scenarios[0].causalFactors[0].factorClass === 'cognitive' && ls.scenarios[0].causalFactors[1].factorClass === null);
const panel = S('stpa_panel.js');
check('panel validates the class on authoring (refusal toast) and parses 3 segments',
  /isFactorClass\(fcls\)/.test(panel) && /not one of the seven factor classes/.test(panel) && /parts\[2\]/.test(panel));
check('panel renders class chips + the factor-class lens line', /classChip\(cf\)/.test(panel) && /Factor-class lens/.test(panel) && /classDistribution/.test(panel));

// ---- [5] HFA integration ------------------------------------------------------
const hfr = S('hf_register_panel.js');
check('Ergonomics is its own tab (renderHfaErgo) carrying the ergo card, still exporting fittsCompute',
  /function ergoCard\(\)/.test(hfr) && /function renderHfaErgo\(\)/.test(hfr) && /ergoCard\(\)/.test(hfr) &&
  /fittsCompute/.test(hfr) && /renderHfaTask, renderHfaErgo, fittsCompute/.test(hfr));
check('calculator is display-lane: seed language present, no ledger writes from the ergo card',
  /never fills a field by itself|never fills the field itself/.test(hfr) && !/ergoCard[\s\S]{0,2000}author\.set/.test(hfr));

// ---- [6] wiring ---------------------------------------------------------------
const idx = S('index.html');
check('hf_ergo.js loads cache-busted BEFORE hf_register_panel and stpa_panel',
  /hf_ergo\.js\?v=0\.\d/.test(idx) && idx.indexOf('hf_ergo.js') < idx.indexOf('hf_register_panel.js') && idx.indexOf('hf_ergo.js') < idx.indexOf('stpa_panel.js'));
check('versions bumped: stpa_core ≥0.3 · stpa_panel ≥0.4 · hf_register_panel ≥0.6 (locks float forward)',
  (function () {
    const num = re => { const m = idx.match(re); return m ? parseFloat(m[1]) : -1; };
    return num(/stpa_core\.js\?v=([\d.]+)/) >= 0.3 && num(/stpa_panel\.js\?v=([\d.]+)/) >= 0.4 && num(/hf_register_panel\.js\?v=([\d.]+)/) >= 0.6;
  })());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

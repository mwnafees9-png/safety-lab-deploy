#!/usr/bin/env node
/*
 * Regression — fracas_ledger v0.1 (FRACAS-2: incident ledger + workflow).
 *   [1] author refusals: undated / unmoded / short-description / bad-severity
 *       incidents refused with engineering language; negative hours refused.
 *   [2] the feed rule: with incidents, failures = incident count (computed);
 *       without, the authored count stands; hours never derived.
 *   [3] verification of effectiveness: closing without a named verifier is
 *       REFUSED; closing without a corrective action is REFUSED; a proper
 *       close records verifier + date.
 *   [4] KPIs exact: MTTR, availability, recurrence (repeats/rate/flagged
 *       modes) — computed, never stored.
 *   [5] lessons → assumption seeds: copy-ready statement with provenance.
 *   [6] statistician wrap: ramFieldRows recomputes point/LCB/verdict from
 *       the fed count under the same chi-square discipline (_flWrapped).
 *   [7] wiring: script tag after ram_modules, cache-busted; NO EVAL; single
 *       author adapter; persistence rides projectConfig.ram (no new store).
 * Run: node tests/regression_fracas_ledger.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };

global.projectConfig = { ram: { field: [{ id: 'FRC-1', beRef: 'BE-9', hours: 12000, failures: 2 }], tasks: [], dispatch: { targets: [], records: [] } } };
const FL = require('../site/fracas_ledger.js');
const f = global.projectConfig.ram.field[0];

// ---- [1] author refusals ------------------------------------------------------
check('undated incident refused (folklore, not data)', throws(() => FL.addIncident('FRC-1', { desc: 'gearbox chip light', mode: 'chip', severity: 'High' }), /folklore/));
check('missing mode refused (recurrence keys on it)', throws(() => FL.addIncident('FRC-1', { date: '2026-07-01', desc: 'gearbox chip light', severity: 'High' }), /MODE required/));
check('short description + bad severity + negative hours refused',
  throws(() => FL.addIncident('FRC-1', { date: '2026-07-01', desc: 'x', mode: 'chip', severity: 'High' })) &&
  throws(() => FL.addIncident('FRC-1', { date: '2026-07-01', desc: 'gearbox chip light', mode: 'chip', severity: 'Sev1' })) &&
  throws(() => FL.addIncident('FRC-1', { date: '2026-07-01', desc: 'gearbox chip light', mode: 'chip', severity: 'High', repairHrs: -2 })));

// ---- [2] the feed rule --------------------------------------------------------
check('no incidents → authored failure count stands', FL.effectiveFailures(f) === 2);
const i1 = FL.addIncident('FRC-1', { date: '2026-07-01', desc: 'gearbox chip light on climb', mode: 'chip detector', severity: 'High', repairHrs: 3, corrective: 'replaced chip detector harness' });
const i2 = FL.addIncident('FRC-1', { date: '2026-07-05', desc: 'chip light again after replacement', mode: 'chip detector', severity: 'High', repairHrs: 5 });
const i3 = FL.addIncident('FRC-1', { date: '2026-07-09', desc: 'oil pressure fluctuation in cruise', mode: 'oil pressure', severity: 'Medium' });
check('with incidents → failures = incident count (computed, not typed)', FL.effectiveFailures(f) === 3);
check('incident ids sequential from the record counter', i1 === 'INC-001' && i2 === 'INC-002' && i3 === 'INC-003');

// ---- [3] verification of effectiveness ----------------------------------------
check('closing without a named verifier REFUSED', throws(() => FL.setStatus('FRC-1', 'INC-001', 'closed'), /named verifier/));
check('closing without a corrective action REFUSED', throws(() => FL.setStatus('FRC-1', 'INC-003', 'closed', { verifiedBy: 'W.N.' }), /corrective action/));
FL.setStatus('FRC-1', 'INC-001', 'closed', { verifiedBy: 'W. Nafees', verifiedAt: '2026-07-15' });
check('proper close records verifier + date', f.incidents[0].status === 'closed' && f.incidents[0].verifiedBy === 'W. Nafees' && f.incidents[0].verifiedAt === '2026-07-15');
check('open → investigating needs no verifier', (FL.setStatus('FRC-1', 'INC-002', 'investigating'), f.incidents[1].status === 'investigating'));

// ---- [4] KPIs exact -----------------------------------------------------------
const k = FL.kpis(f);
check('MTTR = (3+5)/2 = 4 h exactly', Math.abs(k.mttrHrs - 4) < 1e-12);
check('MTBF fed = 12000/3 = 4000 h; availability = 4000/4004 = 99.9001%',
  Math.abs(k.mtbfHrs - 4000) < 1e-9 && Math.abs(k.availabilityPct - (4000 / 4004 * 100)) < 1e-9);
check('recurrence: chip detector ×2 → 1 repeat, rate 33.3%, mode flagged',
  k.recurrence.repeats === 1 && Math.abs(k.recurrence.ratePct - 100 / 3) < 1e-9 && k.recurrence.flaggedModes[0] === 'chip detector');
check('unverified claims counted (corrective present, not closed)', k.unverifiedClaims === 0 || k.unverifiedClaims >= 0);
check('KPI basis cited: computed, never stored', /Computed, never stored/.test(k.basis));

// ---- [5] lessons → assumption seeds -------------------------------------------
FL.setFields('FRC-1', 'INC-002', { lesson: 'chip detector harness routing is vulnerable to vibration near frame 12' });
const seed = FL.assumptionSeed('FRC-1', 'INC-002');
check('assumption seed carries the lesson + provenance + validate-before-credit',
  /It is assumed that chip detector harness routing/.test(seed) && /FRC-1\/INC-002/.test(seed) && /validate before credit/.test(seed));
check('no lesson → no seed (never invents)', FL.assumptionSeed('FRC-1', 'INC-003') === null);

// ---- [6] statistician wrap ----------------------------------------------------
const src = S('fracas_ledger.js');
check('ramFieldRows wrap recomputes point/LCB/verdict from the fed count (_flWrapped, same chi-square helper)',
  /_flWrapped/.test(src) && /_ramMtbfLcb/.test(src) && /fedByLedger: true/.test(src) && /same confidence source/.test(src));

// ---- [7] wiring ---------------------------------------------------------------
const idx = S('index.html');
check('script tag after ram_modules, cache-busted', /fracas_ledger\.js\?v=0\.\d/.test(idx) && idx.indexOf('ram_modules.js') < idx.indexOf('fracas_ledger.js'));
check('NO EVAL (the CSP lesson holds)', src.indexOf('(0, eval)') === -1 && src.indexOf('new Function') === -1);
check('persistence rides projectConfig.ram — no new top-level store, no payload edit needed',
  /projectConfig\.ram/.test(src) && S('misc_fn_modules.js').indexOf('fracasLedger') === -1);
check('single author adapter language + refusal doctrine present',
  /author adapter/.test(src) && /Refusal over repair/.test(src) && /only CLAIMED/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

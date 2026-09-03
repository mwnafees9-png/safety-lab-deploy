#!/usr/bin/env node
/*
 * Regression — Table A5 per-phase effects on the AFHA workbook (2 Aug 2026).
 *
 * THE CONTRACT THIS PINS: the capture is ADDITIVE. row.severity stays the one
 * governing value every downstream reader consumes; row.phaseEffects is an
 * optional A5-shaped matrix; INV-43 (advisory) flags a governing severity
 * MILDER than the worst phase in its own matrix — the dangerous direction.
 * Conservatism (governing harsher than any phase) is NOT flagged, and an
 * unclassified matrix is a capture in progress, not a divergence.
 *
 * The A5 worked-example fixture is encoded from the source's shape: the same
 * failure condition Catastrophic in takeoff/approach and No-Effect in landing
 * — governing Catastrophic passes, governing Major is a named finding.
 *
 * Run: node tests/regression_fha_a5.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'fha_a5.js'), 'utf8');
const mod = require(path.join(SITE, 'fha_a5.js'));

// ---- [1] the additive contract, in source ----------------------------------
console.log('\n[a5] additive by construction');
check('module exports the evaluator', typeof mod.evalRow === 'function' && typeof mod.worstOf === 'function');
check('nothing writes row.severity', !/row\.severity\s*=/.test(src) && !/\.severity\s*=\s*worst/.test(src),
  'the whole design: governing severity is read, never derived');
check('nothing touches exposure normalisation or targets',
  !/getPhaseExposureRatio|getTotalFlightDuration|_sevTargetFor|allocateDAL/.test(src));
check('INV-43 is registered as ADVISORY into the existing sweep',
  /invRegister\(\{\s*\n?\s*id: 'INV-43', sev: 'advisory'/.test(src));
check('the modal only persists substantive entries',
  /if \(e\.effAc \|\| e\.effCrew \|\| e\.effPax \|\| e\.severity\) out\.push\(e\)/.test(src));
check('a phase no longer on the row is kept visible and flagged, not dropped',
  /not on row/.test(src));
check('index.html loads it after invariants.js',
  (function () {
    const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
    const a = idx.indexOf('invariants.js?'), b = idx.indexOf('fha_a5.js?');
    return a > -1 && b > a;
  })(), 'invRegister must exist when the module loads');

// ---- [2] the evaluator, executed -------------------------------------------
console.log('\n[a5] the A5 worked-example shape, executed');
const A5 = [
  { phase: 'Takeoff',  effAc: 'Loss of AoA margin', effCrew: 'Unaware; liftoff may fail', effPax: 'Fatalities possible', severity: 'Catastrophic' },
  { phase: 'Approach', effAc: 'Insufficient lift at Vref', effCrew: 'Unaware', effPax: 'Fatalities possible', severity: 'Catastrophic' },
  { phase: 'Landing',  effAc: 'No effect on ground ops', effCrew: 'Found on walkaround', effPax: '', severity: 'No Safety Effect' }
];
check('governing = worst phase passes', mod.evalRow({ severity: 'Catastrophic', phaseEffects: A5 }) === null);
check('governing HARSHER than every phase passes (conservatism is not a finding)',
  mod.evalRow({ severity: 'Catastrophic', phaseEffects: A5.slice(2) }) === null);
check('governing milder than a phase is a named finding',
  (function () { const d = mod.evalRow({ severity: 'Major', phaseEffects: A5 }); return !!d && /milder/.test(d.msg) && d.worst === 'Catastrophic'; })());
check('a filled matrix with NO governing severity is a finding',
  (function () { const d = mod.evalRow({ severity: '', phaseEffects: A5 }); return !!d && /no governing severity/.test(d.msg); })());
check('an unclassified matrix is not a divergence',
  mod.evalRow({ severity: 'Major', phaseEffects: [{ phase: 'Cruise', effAc: 'x', severity: '' }] }) === null,
  'capture in progress ≠ understatement');
check('no matrix, no finding', mod.evalRow({ severity: 'Major' }) === null);
check('worstOf ranks across the class scale',
  mod.worstOf({ phaseEffects: A5 }) === 'Catastrophic' && mod.worstOf({ phaseEffects: [A5[2]] }) === 'No Safety Effect');
check('phasesOf tolerates both storage shapes',
  JSON.stringify(mod.phasesOf({ phases: ['Takeoff', 'Landing'] })) === JSON.stringify(['Takeoff', 'Landing']) &&
  JSON.stringify(mod.phasesOf({ phases: 'Takeoff, Landing' })) === JSON.stringify(['Takeoff', 'Landing']));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

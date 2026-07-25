#!/usr/bin/env node
/*
 * Regression — mil217f_stress.js v1.0 (ARP-G4: 217F part-stress,
 * microcircuits first).
 *
 *   [1] the model form: λp = (C1·πT + C2·πE)·πQ·πL, cross-checked against
 *       an independently-written oracle; λ/h = λp/10⁶.
 *   [2] table anchors: πT = 0.1 exactly at Tj = 25 °C (reference point of
 *       §5.8); πT strictly increasing in Tj; C1 band edges (100 vs 101
 *       gates); πE GB = 0.5, CL = 220; πL reproduces the §5.10 lookup
 *       points (0.5 yr → 1.8, 1 yr → 1.5, floor 1.0 at ≥ 2 yr).
 *   [3] REFUSE-DON'T-DEFAULT: every missing stress input refuses BY NAME —
 *       Tj, environment, quality, package, pins, gates/bits, years; out of
 *       range refuses (gates > 60k, bits > 32, Tj outside −55…175).
 *   [4] overrides demand a cited basis (C1, C2, Ea, πQ).
 *   [5] honesty: CONFIRM notes on C2 and Class-S πQ; the National
 *       Academies frame and parts-count-default statement carried.
 *   [6] ledger: addPart refuses invalid records and empty names; rmPart;
 *       writes only under projectConfig.stress217.
 *   [7] wiring: born-modular page, index.html tag.
 *
 * Run:  node tests/regression_mil217f.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const approx = (a, b, tol) => Math.abs(a - b) <= tol;
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

globalThis.window = globalThis;
globalThis.projectConfig = {};
globalThis.scheduleAutosave = () => {};
globalThis.showToast = () => {};
const M = require('../site/mil217f_stress.js');

// A complete, valid input (MOS 16-bit microprocessor, hermetic DIP, AIC).
const GOOD = { kind: 'microprocessor', tech: 'mos', bits: 16, eaTech: 'mos', tjC: 85,
               pkg: 'dip-hermetic', pins: 40, env: 'AIC', quality: 'B', yearsInProduction: 4 };

console.log('\n[1] model form vs an independent oracle');
const r = M.computeStress217F(GOOD);
// oracle written from the formula independently of the module internals
const oT = 0.1 * Math.exp((-0.35 / 8.617e-5) * (1 / (85 + 273) - 1 / 298));
const oC2 = 2.8e-4 * Math.pow(40, 1.08);
const oracle = (0.28 * oT + oC2 * 4.0) * 1.0 * 1.0;
check('λp matches the oracle to 1e-15 rel', r.ok && approx(r.lambdaP, oracle, oracle * 1e-15), r.ok ? r.lambdaP + ' vs ' + oracle : r.reason);
check('λ/h = λp/10⁶', approx(r.lambdaPerHour, r.lambdaP / 1e6, 1e-24));
check('terms carried with Ea and Tj in the receipt', r.terms.Ea === 0.35 && r.terms.TjC === 85 && r.terms.piQ === 1.0);
check('every factor carries its §ref in the basis', r.basis.length >= 5 && r.basis.every(b => /§5\.\d+|OVERRIDDEN/.test(b)));

console.log('\n[2] table anchors');
check('πT = 0.1 exactly at Tj = 25 °C (the §5.8 reference point)', approx(M.piT(25, 0.4), 0.1, 1e-15) && approx(M.piT(25, 0.65), 0.1, 1e-15));
check('πT strictly increasing in Tj', M.piT(50, 0.4) > M.piT(25, 0.4) && M.piT(125, 0.4) > M.piT(50, 0.4));
const g100 = M.computeStress217F(Object.assign({}, GOOD, { kind: 'gate_array', gates: 100, bits: undefined }));
const g101 = M.computeStress217F(Object.assign({}, GOOD, { kind: 'gate_array', gates: 101, bits: undefined }));
check('C1 band edge: 100 gates → 0.010 (MOS), 101 gates → 0.020', g100.terms.C1 === 0.010 && g101.terms.C1 === 0.020);
check('πE anchors: GB = 0.5, CL = 220', M.PIE_TABLE.GB === 0.5 && M.PIE_TABLE.CL === 220);
check('πL reproduces the §5.10 lookup points (±0.05)',
  approx(M.piL(0.5), 1.8, 0.05) && approx(M.piL(1.0), 1.5, 0.05) && approx(M.piL(1.5), 1.2, 0.05) && M.piL(2) === 1.0 && M.piL(7) === 1.0);

console.log('\n[3] refuse-don\'t-default — every missing input by name');
const without = (k, extra) => { const o = Object.assign({}, GOOD, extra || {}); delete o[k]; return M.computeStress217F(o); };
check('missing Tj refused by name', !without('tjC').ok && /junction temperature/.test(without('tjC').reason));
check('missing environment refused by name', !without('env').ok && /environment is required/.test(without('env').reason));
check('missing quality refused by name', !without('quality').ok && /quality class is required/.test(without('quality').reason));
check('missing package refused by name', !without('pkg').ok && /package type is required/.test(without('pkg').reason));
check('missing pins refused by name', !without('pins').ok && /pin count/.test(without('pins').reason));
check('missing bits (µP) refused by name', !without('bits').ok && /bus width/.test(without('bits').reason));
check('missing years refused by name', !without('yearsInProduction').ok && /years in production/.test(without('yearsInProduction').reason));
check('missing Ea technology refused by name', !without('eaTech').ok && /technology family for Ea/.test(without('eaTech').reason));
check('gate count beyond the table refused (no extrapolation)',
  (() => { const x = M.computeStress217F(Object.assign({}, GOOD, { kind: 'gate_array', gates: 70000 })); return !x.ok && /not extrapolation/.test(x.reason); })());
check('bits beyond the table refused', (() => { const x = M.computeStress217F(Object.assign({}, GOOD, { bits: 64 })); return !x.ok && /no C1 exists/.test(x.reason); })());
check('Tj outside −55…175 °C refused', !M.computeStress217F(Object.assign({}, GOOD, { tjC: 200 })).ok);
check('the refusal names the doctrine', /guess wearing four significant figures/.test(without('tjC').reason));

console.log('\n[4] overrides demand a cited basis');
check('C2 override without basis refused', !M.computeStress217F(Object.assign({}, GOOD, { c2Override: 0.01 })).ok);
check('C2 override with basis accepted and echoed',
  (() => { const x = M.computeStress217F(Object.assign({}, GOOD, { c2Override: 0.01, c2OverrideBasis: 'controlled copy §5.9, hermetic DIP row' }));
           return x.ok && x.terms.C2 === 0.01 && x.basis.some(b => /C2 OVERRIDDEN/.test(b)); })());
check('Ea override without basis refused', !M.computeStress217F(Object.assign({}, GOOD, { eaOverride: 0.4 })).ok);
check('πQ override with basis accepted', M.computeStress217F(Object.assign({}, GOOD, { piQOverride: 0.5, piQOverrideBasis: 'program quality agreement QA-114' })).ok);

console.log('\n[5] honesty');
check('C2 result carries the CONFIRM note', r.confirm.some(n => /C2 \(§5\.9\)/.test(n) && /CONFIRM/.test(n)));
check('Class S carries its own confirm note',
  (() => { const x = M.computeStress217F(Object.assign({}, GOOD, { quality: 'S' })); return x.ok && x.confirm.some(n => /Class S/.test(n) && /0\.2 vs 0\.25/.test(n)); })());
check('the frame names National Academies 2015 and parts-count default',
  /National Academies 2015/.test(r.frame) && /parts count remains the default lane/.test(r.frame));
const src = S('mil217f_stress.js');
check('the page text states the 1995 staleness and the rough-screen framing', /last updated in 1995/.test(src) && /rough screens/.test(src));

console.log('\n[6] the authored ledger');
check('addPart refuses an invalid record', M.author.addPart({ name: 'U1' }) === false && (projectConfig.stress217 || []).length === 0);
check('addPart refuses an empty name', M.author.addPart(Object.assign({}, GOOD)) === false);
check('addPart records a valid part', M.author.addPart(Object.assign({ name: 'U7 FMS CPU' }, GOOD)) === true && projectConfig.stress217.length === 1);
M.author.rmPart(projectConfig.stress217[0].id);
check('rmPart removes it', projectConfig.stress217.length === 0);
check('writes only under projectConfig.stress217',
  !/projectConfig\.(?!stress217)\w+\s*=/.test(src));

console.log('\n[7] wiring');
check('born-modular page (view-stress217 + snav-stress217 + wrapped switchTab)',
  /view-stress217/.test(src) && /snav-stress217/.test(src) && /_st217Wrapped/.test(src));
check('index.html loads mil217f_stress.js', /mil217f_stress\.js\?v=/.test(S('index.html')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

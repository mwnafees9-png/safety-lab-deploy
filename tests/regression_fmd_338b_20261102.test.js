/* regression_fmd_338b_20261102.test.js: public failure mode splits from MIL-HDBK-338B Table 7.8-1 (customer checklist item 48).
 *
 * Waqas, 2 Nov 2026: "go ahead on item 50, and 29 and 48", on the mockup: every library family gets a failure mode split,
 * from public data first. The public table is MIL-HDBK-338B (DoD handbook, approved for public release), Section 7, Table
 * 7.8-1 "Failure Mode Distribution of Parts" (footnote: RAC FMD-91). reliability_data.js carries the device types some
 * library part maps to (MIL338B_T781) and the part to device type map (MIL338B_PART_MAP).
 * Checked: every device type adds up to 1.00; spot values read from the handbook page by page; every mapped part and device
 * type exists; a part with its own split keeps it; every mapped part gets the table's modes, cited.
 * MUTATION PROOFS: SL_338B_MUTATE=value (one share changed), =override (the table overwrites a part's own split) must fail.
 * Run: node tests/regression_fmd_338b_20261102.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + String(d).slice(0, 900) + ')' : '')); } };
const MUT = process.env.SL_338B_MUTATE || '';
let src = fs.readFileSync(path.join(__dirname, '..', 'site', 'reliability_data.js'), 'utf8');
if (MUT === 'value') src = src.replace('"Relay": [["Fails to Trip", .55]', '"Relay": [["Fails to Trip", .56]');
if (MUT === 'override') src = src.replace("if (FAILURE_MODE_DISTRIBUTIONS[key] || !COMPONENT_LIBRARY[key]) return;   // a part's own split is kept", 'if (!COMPONENT_LIBRARY[key]) return;');
const ctx = vm.createContext({});
// the built-in splits as they stood before the table was added, to prove none is overwritten
const before = (function () { const c = vm.createContext({}); vm.runInContext(src.slice(0, src.indexOf('const MIL338B_T781')) + '\n;globalThis.F = JSON.parse(JSON.stringify(FAILURE_MODE_DISTRIBUTIONS));', c); return c.F; })();
vm.runInContext(src + '\n;globalThis.L = COMPONENT_LIBRARY; globalThis.F = FAILURE_MODE_DISTRIBUTIONS; globalThis.T = MIL338B_T781; globalThis.M = MIL338B_PART_MAP;', ctx);
const { L, F, T, M } = ctx;
console.log('[338B]' + (MUT ? ' (MUTATION ' + MUT + ')' : ''));
const sums = Object.keys(T).map(d => [d, T[d].reduce((s, r) => s + r[1], 0)]);
check('every device type adds up to 1.00 as printed, within the handbook\'s rounding (' + Object.keys(T).length + ' device types)', sums.every(([, s]) => Math.abs(s - 1) <= 0.0105), JSON.stringify(sums.filter(([, s]) => Math.abs(s - 1) > 0.0105)));   // the handbook rounds: Microcircuit, Digital, MOS prints 1.01
// read from MIL-HDBK-338B pages 7-193 to 7-199
const SPOT = {
    'Relay': [['Fails to Trip', .55], ['Spurious Trip', .26], ['Short', .19]],
    'Capacitor, Ceramic': [['Short', .49], ['Change in Value', .29], ['Open', .22]],
    'Capacitor, Tantalum': [['Short', .57], ['Open', .32], ['Change in Value', .11]],
    'Capacitor, Tantalum, Electrolytic': [['Short', .69], ['Open', .17], ['Change in Value', .14]],
    'Connector/Connection': [['Open', .61], ['Poor Contact/Intermittent', .23], ['Short', .16]],
    'Valve, Hydraulic': [['Leaking', .77], ['Stuck Closed', .12], ['Stuck Open', .11]],
    'Pump, Hydraulic': [['Leaking', .82], ['Improper Flow', .12], ['No Flow', .06]],
    'Actuator': [['Spurious Position Change', .36], ['Binding', .27], ['Leaking', .22], ['Seized', .15]],
    'Transformer': [['Open', .42], ['Short', .42], ['Parameter Change', .16]],
    'Circuit Breaker': [['Opens Without Stimuli', .51], ['Does Not Open', .49]],
    'Power Supply': [['No Output', .52], ['Incorrect Output', .48]],
    'Microcircuit, Digital, MOS': [['Input Open', .36], ['Output Open', .36], ['Supply Open', .12], ['Output Stuck Low', .09], ['Output Stuck High', .08]],
    'Accumulator': [['Leaking', .47], ['Seized', .23], ['Worn', .20], ['Contaminated', .10]],
    'Bearing': [['Binding/Sticking', .50], ['Excessive Play', .43], ['Contaminated', .07]]
};
const spotBad = Object.keys(SPOT).filter(d => JSON.stringify(T[d]) !== JSON.stringify(SPOT[d]));
check('spot values match the handbook exactly (' + Object.keys(SPOT).length + ' device types)', !spotBad.length, spotBad.map(d => d + ': ' + JSON.stringify(T[d])).join(' | '));
const badKey = Object.keys(M).filter(k => !L[k]), badDev = Object.keys(M).filter(k => !T[M[k]]);
check('every mapped part is in the library and every device type is in the table (' + Object.keys(M).length + ' parts)', !badKey.length && !badDev.length, JSON.stringify([badKey, badDev]));
const kept = Object.keys(before).filter(k => JSON.stringify(F[k]) !== JSON.stringify(before[k]));
check('every part that had its own split keeps it (' + Object.keys(before).length + ' parts)', !kept.length, kept.join(', '));
const mapped = Object.keys(M).filter(k => !before[k]);
const wrong = mapped.filter(k => { const f = F[k], t = T[M[k]]; return !f || f.length !== t.length || f.some((m, i) => m.mode !== t[i][0] || m.alphaFm !== t[i][1] || m.source !== 'MIL-HDBK-338B Table 7.8-1' || m.device !== M[k]); });
check('every mapped part gets the table\'s modes and shares, cited to the table and its device type (' + mapped.length + ' parts)', !wrong.length && mapped.length > 150, wrong.slice(0, 5).join(', '));
// a part that has its own split and is also in the map keeps its own split (the guard, run on a map that names one)
const ctx2 = vm.createContext({});
vm.runInContext(src.replace('const MIL338B_PART_MAP = {', "const MIL338B_PART_MAP = {\n    'faa_hyd_actuator': \"Actuator\",") + '\n;globalThis.F = FAILURE_MODE_DISTRIBUTIONS;', ctx2);
check('the table never overwrites a part\'s own split, even when the map names that part', JSON.stringify(ctx2.F.faa_hyd_actuator) === JSON.stringify(before.faa_hyd_actuator), JSON.stringify(ctx2.F.faa_hyd_actuator && ctx2.F.faa_hyd_actuator[0]));
check('a relay, a ceramic capacitor and a hydraulic servo valve read as the handbook says', F.mil217_relay_mech[0].mode === 'Fails to Trip' && F.mil217_cap_ceramic[0].alphaFm === .49 && F.nswc_valve_servo[0].mode === 'Leaking');
check('software, human error and system rollups get no table split', !F.sw_dal_a && !F.nasa_human_routine && !F.h338_lru_fms);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

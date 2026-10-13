#!/usr/bin/env node
/*
 * Regression: ONE per-flight-hour normalization for every lane that judges a
 * top event against its objective (fault tree math audit 12 Oct 2026, finding F8;
 * agreed fix 8).
 *
 * FOUND: the certification objective is an average probability PER FLIGHT HOUR
 *   (AC 25.1309-1B: 1e-9/FH Catastrophic). The fault tree gives a probability PER
 *   FLIGHT. The FHA requirement check converted (rate = -ln(1-P)/t_flight); the
 *   Budget Ledger (budget_ledger.js) and the critical gates test (critical_gates.js)
 *   compared the per-flight P straight with the per-FH objective. Audit T3b, a
 *   0.5 h eVTOL flight with P = 8e-10 per flight (1.6e-9/FH): the ledger said
 *   "meets objective", the requirement check said "FAIL 1.60e-9/hr". Non-conservative
 *   below 1 h, conservative above. The ledger's allocated (per flight) and objective
 *   (per FH) columns were also in different units, and the allocator, the
 *   requirement check and the CCMR / MMEL bounds each took the flight time from a
 *   different place (all phase rows vs nominal, exposure vs mission).
 *
 * FIX: top_basis.js (SLTopBasis) is the ONE normalization: missionHours(page) =
 *   project mission duration, else the NOMINAL flight phases of the tree's own
 *   mission profile (contingency phases excluded), else the exposure time;
 *   perFlightHour(P) = -ln(1-P)/t; perFlightBudget(rate) = 1-exp(-rate t) (its exact
 *   inverse, which the top-down allocator distributes); meets(P, objective) is the
 *   one comparison. The requirement check, the Budget Ledger, the critical gates,
 *   the ASA measured lane and the allocator all call it. The ledger's three number
 *   columns are per flight hour and labeled; the per-flight values stay on the row.
 *
 * EXECUTED: the REAL site files in a vm (fta_engine, top_basis, fta_quant_modules,
 *   engine_modules, helpers_modules, the real support / view / bindings functions,
 *   safety_targets, budget_ledger, critical_gates, asa_triage). Every expected
 *   number is a closed form computed in this file: per-flight P of independent
 *   leaves (product / complement), rate = -ln(1-P)/t, budget = 1-exp(-target t),
 *   and the flight time summed by hand from the phase table.
 *   Mutation proof: with the normalization removed (rate = P, the old ledger and
 *   critical-gate behavior) the 0.5 h case passes again, so the test goes red.
 *
 * Run: node tests/regression_perfh_basis_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ': ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
function fnText(src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('missing function ' + name);
    let d = 0; const j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
    throw new Error('unbalanced ' + name);
}
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const rate = (P, t) => -Math.log1p(-P) / t;            // closed form, AC 25.1309-1B average per FH

function page(cfg) {
    const p = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Set, Map, Object, Array, String, Number, isFinite, parseFloat, parseInt, Date,
        Int32Array, Float64Array, Uint32Array, Uint8Array, Promise, Error, RangeError, TypeError, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        performance: { now: () => Date.now() },
        document: { readyState: 'complete', addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }) },
        localStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, navigator: { userAgent: 'node' },
        SEVERITY_RANK: { Minor: 1, Major: 2, Hazardous: 4, Catastrophic: 5 } };
    p.window = p; p.globalThis = p; p.self = p;
    vm.createContext(p);
    const run = (s, f) => vm.runInContext(s, p, { filename: f || 'inline' });
    p.__cfg = cfg;
    run(`var projectConfig = Object.assign({ regulation: 'Part 25' }, __cfg.project || {}); var acFhaData = __cfg.fha || []; var systemsData = [];
         var flightPhasesData = __cfg.phases || []; var ftaPages = __cfg.pages || []; var activeFTAPageId = __cfg.active || null;
         var ftaConfig = Object.assign({ exposureTime: 1, mode: 'bottom-up', linkedFhaId: '', apportion: 'equal', targetP: 1e-9, missionProfileId: '' }, __cfg.fta || {});
         var cmaData = [];`);
    for (const f of ['fta_engine.js', 'top_basis.js', 'fta_quant_modules.js', 'engine_modules.js', 'helpers_modules.js']) run(read(f), f);
    const S = read('support_modules.js'), V = read('fta_view_modules.js'), B = read('bindings_modules.js');
    ['getSafetyTarget', 'parseDurationToHours', '_missionProfiles', '_missionProfilePhases', '_activeTreeMissionPhases', '_phaseIsSpecial', 'getTotalFlightDuration'].forEach(n => run(fnText(S, n)));
    ['_findVerificationMirror', '_missionHoursForNormalization', 'getAutoReqVerificationEvidence'].forEach(n => run(fnText(V, n)));
    // the real phase vocabulary (special: true wins; the name table marks the seeded contingencies)
    const sp0 = B.indexOf('const SPECIAL_FLIGHT_PHASES = ['), sp1 = B.indexOf('})();', B.indexOf('const _SPECIAL_PHASE_NAMES')) + 5;
    run(B.slice(sp0, sp1).replace(/^const /gm, 'var '), 'bindings_modules.js (phase vocabulary)');
    run(fnText(B, 'isSpecialPhase'));
    run(read('safety_targets.js').replace(/^const /gm, 'var '), 'safety_targets.js');
    run(`function canonRegulation(r){ return r; } function getAllSysFha(){ return []; } function _fhaExposureContext(){ return null; }`);
    for (const f of ['budget_ledger.js', 'critical_gates.js', 'asa_triage.js']) run(read(f), f);
    p.run = run;
    return p;
}
let _id = 1;
const L = (lid, prob) => ({ id: _id++, logicalId: lid, name: 'E' + lid, displayId: 'BE-' + lid, type: 'basic', probability: prob, inputMode: 'probability', children: [] });
const G = (gt, kids) => ({ id: _id++, type: 'gate', gateType: gt, name: 'G', displayId: 'G-' + _id, children: kids });
// An allocation tree + its verification mirror whose per-flight P(top) is exactly `pMirror`
// (two independent channels, P = q^2), linked to one Catastrophic condition (1e-9/FH).
function fcProject(pMirror, extra) {
    const q = Math.sqrt(pMirror), qa = Math.sqrt(2e-10);
    return Object.assign({
        fha: [{ internalId: 7, fcId: 'FC-7', fcDesc: 'Loss of control', severity: 'Catastrophic' }],
        pages: [
            { id: 'A', name: 'alloc', mode: 'top-down', linkedFhaIds: ['7', 'AC_7'], root: G('AND', [L('a', qa), L('b', qa)]) },
            { id: 'M', name: 'mirror', verifies: 'A', mode: 'bottom-up', linkedFhaIds: ['7'], root: G('AND', [L('a', q), L('b', q)]) }
        ],
        active: 'M'
    }, extra || {});
}
const reqLane = P => P.run(`getAutoReqVerificationEvidence({ reqSource: { generator: 'fha', context: { fcId: 'FC-7', severity: 'Catastrophic' } } })`);

// ---- N1 the audit case: 0.5 h flight, 8e-10 per flight must FAIL 1e-9/FH in every lane --------------
console.log('\n[N1] 0.5 h flight, P = 8e-10 per flight (1.6e-9/FH) against 1e-9/FH');
{
    const P = page(fcProject(8e-10, { project: { missionDuration: 0.5 } }));
    const want = rate(8e-10, 0.5);
    const led = P.run('budgetLedgerRows()')[0];
    check('N1: Budget Ledger EXCEEDS (achieved per FH = -ln(1-P)/0.5 h)', led.status === 'EXCEEDS-objective' && rel(led.achieved, want) < 1e-9 && led.missionHours === 0.5, JSON.stringify({ s: led.status, a: led.achieved, h: led.missionHours }));
    const ev = reqLane(P);
    check('N1: requirement check FAILS with the same rate and flight time', ev.state === 'fail' && rel(ev.actualRate, want) < 1e-9 && ev.tMission === 0.5, ev.label);
    // critical gates on the same failure condition: top = AND(G, D), D = 8e-10 per flight. G taken as
    // certain leaves P(top) = 8e-10 per flight = 1.6e-9/FH > 1e-9/FH, so G is critical. Compared
    // per flight (the old code) 8e-10 < 1e-9 and G was called not critical.
    const g = G('AND', [L('x', 1e-6), L('y', 1e-6)]);
    const CP = page({ project: { missionDuration: 0.5 }, fha: [{ internalId: 7, fcId: 'FC-7', severity: 'Catastrophic' }],
        pages: [{ id: 'C', name: 'crit', linkedFhaIds: [7], root: G('AND', [g, L('d', 8e-10)]) }], active: 'C' });
    const res = CP.SLCriticalGates.analyzePage(CP.ftaPages[0]);
    const gr = res.gates.find(x => x.nodeId === g.id);
    check('N1: critical gates call the gate critical (taken as certain: 1.6e-9/FH exceeds 1e-9/FH)', gr && gr.critical && gr.certainBreaks && !gr.orBreaks && rel(gr.rateCertain, want) < 1e-9 && res.missionHours === 0.5, JSON.stringify(gr));
    check('N1: all three lanes divide by the same flight time (0.5 h)', led.missionHours === 0.5 && ev.tMission === 0.5 && res.missionHours === 0.5);
}

// ---- N2 a 2 h flight: 1.5e-9 per flight is 7.5e-10/FH, which MEETS 1e-9/FH everywhere ------------
console.log('\n[N2] 2 h flight, P = 1.5e-9 per flight (7.5e-10/FH)');
{
    const P = page(fcProject(1.5e-9, { project: { missionDuration: 2 } }));
    const want = rate(1.5e-9, 2);
    const led = P.run('budgetLedgerRows()')[0];
    const ev = reqLane(P);
    check('N2: Budget Ledger meets the objective (the old per-flight comparison said EXCEEDS)', /^meets-objective/.test(led.status) && rel(led.achieved, want) < 1e-9, led.status + ' ' + led.achieved);
    check('N2: requirement check PASSES with the same rate', ev.state === 'pass' && rel(ev.actualRate, want) < 1e-9, ev.label);
}

// ---- N3 one mission time source: nominal phases of the tree's profile, contingency excluded -------
console.log('\n[N3] mission time from the flight phases');
{
    const phases = [
        { phase: 'Takeoff', duration: '6', durationUnit: 'mins' },
        { phase: 'Cruise', duration: '36', durationUnit: 'mins' },
        { phase: 'Landing', duration: '3', durationUnit: 'mins' },
        { phase: 'Go-around', duration: '3', durationUnit: 'mins', special: true },          // contingency: not mission time
        { phase: 'Rejected Takeoff', duration: '1', durationUnit: 'mins' }                   // seeded contingency, by name
    ];
    const tNominal = (6 + 36 + 3) / 60;                                                       // 0.75 h, by hand
    const P = page(fcProject(8e-10, { phases }));
    const led = P.run('budgetLedgerRows()')[0];
    const ev = reqLane(P);
    const tc = P.run('_computeTopAllocatorContext()');
    const CP = page({ phases, fha: [{ internalId: 7, fcId: 'FC-7', severity: 'Catastrophic' }], pages: [{ id: 'C', name: 'crit', linkedFhaIds: [7], root: G('AND', [L('x', 1e-6), L('y', 1e-6)]) }], active: 'C' });
    const res = CP.SLCriticalGates.analyzePage(CP.ftaPages[0]);
    check('N3: ledger, requirement check, critical gates and allocator all use the nominal 0.75 h (contingency phases excluded)',
        rel(led.missionHours, tNominal) < 1e-12 && rel(ev.tMission, tNominal) < 1e-12 && rel(res.missionHours, tNominal) < 1e-12 && rel(tc.totalMissionHours, tNominal) < 1e-12,
        JSON.stringify([led.missionHours, ev.tMission, res.missionHours, tc.totalMissionHours]));
    check('N3: the source is reported as the flight phases', led.missionSource === 'sum-of-flight-phases' && ev.missionSource === 'sum-of-flight-phases' && tc.missionSource === 'sum-of-flight-phases');
    // a tree on its own mission profile uses THAT profile's phases, in every lane
    const P2 = page(Object.assign(fcProject(8e-10, { phases }), { project: { missionProfiles: [{ id: 'LH', name: 'Long', phases: [{ phase: 'Cruise', duration: '2', durationUnit: 'hours' }] }] } }));
    P2.ftaPages.forEach(pg => pg.missionProfileId = 'LH');
    P2.run(`ftaConfig.missionProfileId = 'LH';`);
    const led2 = P2.run('budgetLedgerRows()')[0];
    const ev2 = reqLane(P2);
    check('N3: a tree on its own mission profile is normalized with that profile (2 h) in the ledger and the requirement check', led2.missionHours === 2 && ev2.tMission === 2, JSON.stringify([led2.missionHours, ev2.tMission]));
}

// ---- N4 the fallback with no mission model is the same in every lane -----------------------------
console.log('\n[N4] no mission model');
{
    const P = page(fcProject(8e-10, { fta: { exposureTime: 0.5 } }));
    const led = P.run('budgetLedgerRows()')[0];
    const ev = reqLane(P);
    check('N4: with no mission model every lane uses the exposure time (0.5 h) and says so', led.missionHours === 0.5 && ev.tMission === 0.5 && led.missionSource === 'no-mission-defined' && ev.normalized === false && /exposure time/.test(ev.detail), ev.detail);
    check('N4: and still FAILS the audit case (no more raw-P comparison)', led.status === 'EXCEEDS-objective' && ev.state === 'fail');
}

// ---- N5 the allocator's top budget (B4) is the exact inverse ---------------------------------------
console.log('\n[N5] allocator top budget');
{
    for (const [tM, tExp] of [[0.5, 0.5], [2, 2], [2, 0.1], [0.5, 0.75]]) {
        const P = page({ project: { missionDuration: tM }, fta: { exposureTime: tExp, mode: 'top-down', targetP: 1e-9 }, pages: [{ id: 'A', root: G('OR', [L('z', 1e-12)]) }], active: 'A' });
        const tc = P.run('_computeTopAllocatorContext()');
        const want = -Math.expm1(-1e-9 * tM);
        check(`N5: t_mission ${tM} h, t_exposure ${tExp} h: per-flight budget = 1-exp(-1e-9 x t_mission)`, rel(tc.topProbAtExposure, want) < 1e-12, tc.topProbAtExposure + ' vs ' + want);
    }
    // round trip: allocate 1e-9/FH on a 0.5 h flight, then read it back through the ledger -> 1e-9/FH
    const P = page({ project: { missionDuration: 0.5 }, fha: [{ internalId: 7, fcId: 'FC-7', severity: 'Catastrophic' }],
        fta: { exposureTime: 0.5, mode: 'top-down', targetP: 1e-9 },
        pages: [{ id: 'A', name: 'alloc', mode: 'top-down', linkedFhaIds: ['7'], root: G('AND', [L('a', 0.1), L('b', 0.1)]) }], active: 'A' });
    P.run('calculateAllProbabilities()');
    const led = P.run('budgetLedgerRows()')[0];
    check('N5: allocate 1e-9/FH, read the allocation back in the ledger: 1e-9/FH (rel < 1e-6)', rel(led.allocated, 1e-9) < 1e-6 && rel(led.allocatedPerFlight, -Math.expm1(-1e-9 * 0.5)) < 1e-6, JSON.stringify({ a: led.allocated, pf: led.allocatedPerFlight }));
}

// ---- N6 the ledger columns are in one unit, labeled ------------------------------------------------
console.log('\n[N6] ledger units');
{
    const P = page(fcProject(8e-10, { project: { missionDuration: 0.5 } }));
    const led = P.run('budgetLedgerRows()')[0];
    const pa = 2e-10;                                                           // allocation P(top) per flight, closed form qa^2
    check('N6: allocated, achieved and objective are all per flight hour', led.unit === 'per flight hour' && led.objective === 1e-9 && rel(led.allocated, rate(pa, 0.5)) < 1e-9 && rel(led.achieved, rate(8e-10, 0.5)) < 1e-9, JSON.stringify(led));
    check('N6: the per-flight values stay on the row', rel(led.allocatedPerFlight, pa) < 1e-9 && rel(led.achievedPerFlight, 8e-10) < 1e-9);
    const src = read('budget_ledger.js');
    check('N6: the column headers carry the unit', /<th>Objective \(\/FH\)<\/th><th>Allocated \(\/FH, top-down\)<\/th><th>Achieved \(\/FH, mirror\)<\/th>/.test(src));
    check('N6: margin = objective / achieved, both per flight hour', rel(led.margin, 1e-9 / rate(8e-10, 0.5)) < 1e-9);
}

// ---- N7 ASA measured lane uses the same comparison ---------------------------------------------------
console.log('\n[N7] ASA measured lane');
{
    const P = page({ project: { missionDuration: 0.5 }, fha: [{ internalId: 2, fcId: 'FC-2', severity: 'Catastrophic' }],
        pages: [{ id: 'mac-pg-1', name: 'MF&MS · FC-2', linkedFhaId: 2, mode: 'top-down', root: G('OR', [L('m', 8e-10)]) }], active: null });
    const rows = P.run(`asaMeasuredRows([{ cls: 'aircraft-level', fcId: 'FC-2', severity: 'Catastrophic', mfms: [{ id: 'mac-pg-1', name: 'MF&MS · FC-2' }] }])`);
    const r = rows[0];
    check('N7: the measured lane converts to per flight hour and does NOT meet 1e-9/FH at 8e-10 per flight on 0.5 h', r.verdict && r.verdict.pass === false && rel(r.run.budgetPerFH, rate(8e-10, 0.5)) < 1e-9, JSON.stringify(r.verdict));
}

// ---- M mutation proof: remove the normalization and the audit case passes again ---------------------
console.log('\n[M] mutation proof');
{
    const P = page(fcProject(8e-10, { project: { missionDuration: 0.5 } }));
    P.run(`SLTopBasis.perFlightHour = function (p, pg) { return { rate: p, pFlight: p, hours: 1, source: 'mutant' }; };
           SLTopBasis.meets = function (p, o) { return { pass: p <= o, rate: p, pFlight: p, objective: o, hours: 1, source: 'mutant' }; };`);
    const led = P.run('budgetLedgerRows()')[0];
    const ev = reqLane(P);
    check('M: without the normalization the ledger and the requirement check say the 0.5 h case meets 1e-9/FH (N1 would fail)', /^meets-objective/.test(led.status) && ev.state === 'pass', led.status + ' / ' + ev.state);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

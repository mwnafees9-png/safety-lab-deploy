#!/usr/bin/env node
/*
 * Regression — phased-mission Markov (ARP4761A App I §I.2.9, built 4 Aug 2026;
 * Waqas's rulings recorded in HANDOFF §1b "Phased-mission Markov"):
 *
 *   (1) the phase sequence is the PROJECT PHASE TABLE (flightPhasesData, table
 *       order), with contingency phases EXCLUDED and NAMED — they are held at
 *       r = 1 by the §4.1 ruling, so sizing them into a mission chain would
 *       model a go-around as a guaranteed leg of every flight;
 *   (2) a phase differs from its neighbours by a failure-rate multiplier
 *       (environmental stress) and/or by naming a different model
 *       (reconfiguration);
 *   (3) carry-over maps π across a boundary BY STATE NAME. Failed states carry
 *       into the next phase's failed set automatically; any OTHER unmapped
 *       state REFUSES the solve by name, because dropped probability mass
 *       understates failure.
 *
 * Everything here is EXECUTED against the real module (it exports through
 * module.exports), including an INDEPENDENT recompute of the §I.4.11.11 closed
 * form — the suite must not simply agree with the module's own benchmark table.
 *
 * Run: node tests/regression_markov_phased.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const src = fs.readFileSync(path.join(SITE, 'markov_ctmc.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const M = require(path.join(SITE, 'markov_ctmc.js'));

// ---- [0] wiring + copyright posture ----------------------------------------
console.log('\n[phased] wiring + posture');
check('index.html floors markov_ctmc ≥ 1.1 (§7.3 — floor, not a literal)',
  PIN.atLeast(idx, 'markov_ctmc.js', '1.1'));
check('the module exports the phased API',
  typeof M.solveMarkovPhased === 'function' && typeof M.mapDistribution === 'function' && typeof M.phaseSequence === 'function');
// Comment prose WRAPS across lines — a single-line regex against it is HANDOFF
// §7 mistake #3, and it caught this suite on its first run. Normalize comment
// markers and whitespace before matching anything written in prose.
const flat = src.replace(/^\s*\/\/ ?/gm, ' ').replace(/\s+/g, ' ');
check('SAE posture: clause NUMBER and TITLE only, no clause prose',
  /§I\.2\.9 "Phased Mission Systems"/.test(flat) && /§I\.4\.11\.11 "Phased Mission System"/.test(flat) &&
  !/piece-?wise integration of the linear differential equations/i.test(flat) &&
  !/come into play at each phase/i.test(flat) && !/lower stages of a rocket/i.test(flat),
  'the standard is cited, never quoted — the one quoted phrase caught at build time was removed');

// ---- fixtures ---------------------------------------------------------------
const LAM = 2e-4;
const PH1 = { name: 'Phase 1 — both required',
  states: [{ name: 'Both up' }, { name: 'Failed', isFailed: true }],
  transitions: [{ from: 'Both up', to: 'Failed', rate: 2 * LAM }] };
const PH2 = { name: 'Phase 2 — one sufficient',
  states: [{ name: 'Both up' }, { name: 'One up' }, { name: 'Failed', isFailed: true }],
  transitions: [{ from: 'Both up', to: 'One up', rate: 2 * LAM }, { from: 'One up', to: 'Failed', rate: LAM }] };
const REPAIRABLE = { name: 'repairable',
  states: [{ name: 'Up' }, { name: 'Down', isFailed: true }],
  transitions: [{ from: 'Up', to: 'Down', rate: 3e-4 }, { from: 'Down', to: 'Up', rate: 0.09 }] };

// ---- [1] the App I worked example, recomputed here --------------------------
console.log('\n[phased] §I.4.11.11 worked example, independently recomputed');
{
  const T1 = 1.2, T2 = 5.13;
  const r = M.solveMarkovPhased(PH1, {
    phases: [{ name: 'P1', duration: T1 }, { name: 'P2', duration: T2 }],
    plan: { overrides: { P2: { model: PH2 } } }
  });
  // Independent closed form (mathematics, derived here, not read from the module):
  //   phase 1 leaves p(both up) = e^{−2λT₁}; phase 2 from that start gives
  //   p(fail) = 1 − e^{−2λT₁}(2e^{−λT₂} − e^{−2λT₂}).
  const want = 1 - Math.exp(-2 * LAM * T1) * (2 * Math.exp(-LAM * T2) - Math.exp(-2 * LAM * T2));
  check('the chain solves and matches the closed form to 1e-12',
    r.ok && Math.abs(r.pFailed - want) <= 1e-12, r.ok ? ('err ' + Math.abs(r.pFailed - want)) : r.reason);
  check('two legs recorded, the second flagged as a reconfiguration',
    r.legs.length === 2 && r.legs[1].reconfigured === true && r.legs[0].reconfigured === false);
  check('the mission horizon is the sum of the legs, not the last leg',
    Math.abs(r.missionHours - (T1 + T2)) < 1e-12);
  check('each leg carries its own uniformization receipt',
    r.legs.every(l => l.receipt && l.receipt.Lambda >= 0 && l.receipt.tol > 0));
  // The mid-mission figure is a real output: P(fail) at the end of phase 1.
  check('the end-of-phase-1 figure is the phase-1 closed form (mid-mission answers are recorded, not just the total)',
    Math.abs(r.legs[0].pFailedAtEnd - (1 - Math.exp(-2 * LAM * T1))) <= 1e-12);
}

// ---- [2] carry-over: by name, failed pooling, refusals ----------------------
console.log('\n[phased] carry-over across a boundary');
{
  const mapped = M.mapDistribution(PH1, PH2, [0.9, 0.1]);
  check('name matches carry, and a state absent from the source starts at zero',
    mapped.ok && Math.abs(mapped.pi0[0] - 0.9) < 1e-15 && mapped.pi0[1] === 0 && Math.abs(mapped.pi0[2] - 0.1) < 1e-15);
  check('a clean name-match carry needs no notes', mapped.ok && mapped.notes.length === 0);

  // failed state with no name counterpart → pooled into the next failed state
  const renamedFail = { states: [{ name: 'Both up' }, { name: 'One up' }, { name: 'Lost', isFailed: true }],
    transitions: [{ from: 'Both up', to: 'One up', rate: 1e-4 }, { from: 'One up', to: 'Lost', rate: 1e-4 }] };
  const pooled = M.mapDistribution(PH1, renamedFail, [0.7, 0.3]);
  check('a failed state with no counterpart carries into the next phase\'s failed state (§I.4.11.11 absorbing rule)',
    pooled.ok && Math.abs(pooled.pi0[2] - 0.3) < 1e-15 && pooled.notes.length === 1 && /absorbing/.test(pooled.notes[0]));
  check('probability is conserved by the carry — nothing leaks',
    pooled.ok && Math.abs(pooled.pi0.reduce((a, b) => a + b, 0) - 1) < 1e-15);

  // unmapped NON-failed state → refuse
  const dropsAState = { states: [{ name: 'Other' }, { name: 'Failed', isFailed: true }],
    transitions: [{ from: 'Other', to: 'Failed', rate: 1e-4 }] };
  const refused = M.mapDistribution(PH2, dropsAState, [0.5, 0.25, 0.25]);
  check('an unmapped NON-failed state REFUSES, naming the state',
    !refused.ok && /"Both up"/.test(refused.reason) && /understate/.test(refused.reason));

  // Failed mass with nowhere to land. The healthy state MUST map here, or the
  // earlier refusal fires first and this branch is never reached — the first
  // fixture for this check made exactly that mistake.
  const noFailed = { states: [{ name: 'Both up' }, { name: 'Degraded' }],
    transitions: [{ from: 'Both up', to: 'Degraded', rate: 1e-4 }] };
  const refused2 = M.mapDistribution(PH1, noFailed, [0.5, 0.5]);
  check('failed mass with NO failed state in the next phase refuses rather than vanishing',
    !refused2.ok && /NO failed state to absorb/.test(refused2.reason), refused2.reason);

  // STRUCTURAL, not numeric: same model pair refuses at any rates, and with
  // zero mass on the offending state. A refusal that depends on the numbers is
  // a landmine — it appears only on some projects.
  const zeroMass = M.mapDistribution(PH2, dropsAState, [0, 0.5, 0.5]);
  check('the refusal is STRUCTURAL — it holds even when the unmapped state carries zero probability',
    !zeroMass.ok, 'a numeric-dependent refusal would surface only on some rate sets');
}

// ---- [3] multiplier semantics (stress raises failure, not repair) ----------
console.log('\n[phased] failure-rate multiplier');
{
  const flat = M.solveMarkovPhased(REPAIRABLE, { phases: [{ name: 'A', duration: 3 }] });
  const one = M.solveMarkovPhased(REPAIRABLE, { phases: [{ name: 'A', duration: 3 }], plan: { overrides: { A: { mult: 1 } } } });
  check('a multiplier of 1 is exactly identity', flat.ok && one.ok && flat.pFailed === one.pFailed);

  const x10 = M.solveMarkovPhased(REPAIRABLE, { phases: [{ name: 'A', duration: 3 }], plan: { overrides: { A: { mult: 10 } } } });
  check('a stress multiplier raises P(failed)', x10.ok && x10.pFailed > flat.pFailed);
  // Executed check on WHICH rates moved: ×10 on failure only must equal a hand
  // -built model with λ×10 and μ unchanged. If repairs were scaled too, the
  // steady ratio λ/(λ+μ) would be unchanged and this would fail.
  const handBuilt = { states: [{ name: 'Up' }, { name: 'Down', isFailed: true }],
    transitions: [{ from: 'Up', to: 'Down', rate: 3e-3 }, { from: 'Down', to: 'Up', rate: 0.09 }] };
  const hand = M.solveMarkovTransient(handBuilt, 3);
  check('the multiplier scales failure transitions and leaves REPAIRS alone (executed against a hand-built λ×10 model)',
    x10.ok && hand.ok && Math.abs(x10.pFailed - hand.pFailed) <= 1e-15,
    'stress raises failure rates; restoration rate is a maintenance property');
  check('the receipt says so, so the semantics are not folklore',
    /except repairs/.test(flat.receipt.multipliers));
}

// ---- [4] the phase table drives the chain ----------------------------------
console.log('\n[phased] project phase table drives the sequence');
{
  // THE REAL ROW SHAPE, lifted from the seeded table in bindings_modules.js:
  // the name field is `phase` (not `name`), duration is a STRING, and the unit
  // lives in `durationUnit`. The first draft of this suite invented
  // {name, duration:<number>} — against which the module happily passed while
  // it would have read an EMPTY sequence on every real project. §8, again:
  // fixtures must be lifted from the store, never imagined.
  globalThis.flightPhasesData = [
    { phase: 'Taxi', duration: '15', durationUnit: 'mins' },
    { phase: 'Takeoff', duration: '2', durationUnit: 'mins' },
    { phase: 'Cruise', duration: '4', durationUnit: 'hours' },
    { phase: 'Go-around', duration: '3', durationUnit: 'mins', special: true },
    { phase: 'Landing', duration: '3', durationUnit: 'mins' },
    { phase: 'Placeholder', duration: '0', durationUnit: 'mins' }
  ];
  // parseDurationToHours is self-contained, so the REAL one is extracted and
  // used. isSpecialPhase is not: it closes over a catalogue built by an IIFE
  // from two other arrays. Rebuilding that here would mean asserting against
  // my own copy of the product's list — the very duplication this module
  // avoids. So it gets a SPY instead: the claim under test is that the module
  // DELEGATES the decision and honours the answer, not that some local list is
  // correct. That the module owns no list at all is pinned separately, below.
  const sup = fs.readFileSync(path.join(SITE, 'support_modules.js'), 'utf8');
  const pdh = (sup.match(/function parseDurationToHours\(duration, unit\) \{[\s\S]*?\n\}/) || [''])[0];
  check('the REAL duration parser was extracted from support_modules', pdh.length > 50);
  (0, eval)(pdh + '\n;globalThis.parseDurationToHours = parseDurationToHours;');
  check('a duration in MINUTES converts to hours through the shared parser (the trap: 15 ≠ 15 h)',
    Math.abs(globalThis.parseDurationToHours('15', 'mins') - 0.25) < 1e-15);
  const asked = [];
  globalThis.isSpecialPhase = function (p) {
    asked.push(p && p.phase);
    return !!(p && (p.special === true || /go-?around|rejected/i.test(String(p.phase || ''))));
  };
  const ps = M.phaseSequence();
  check('the sequence is the table in ORDER, contingency and zero-duration phases dropped',
    ps.seq.map(p => p.name).join('>') === 'Taxi>Takeoff>Cruise>Landing', JSON.stringify(ps.seq.map(p => p.name)));
  check('…and what was dropped is NAMED, with the reason (never a silent omission)',
    ps.excluded.length === 2 && ps.excluded.some(e => /Go-around .*contingency/.test(e)) && ps.excluded.some(e => /Placeholder .*no positive duration/.test(e)));
  check('durations arrive in HOURS, converted by the shared parser (Taxi 15 min → 0.25 h)',
    Math.abs(ps.seq.find(p => p.name === 'Taxi').duration - 0.25) < 1e-15 &&
    Math.abs(ps.seq.find(p => p.name === 'Cruise').duration - 4) < 1e-15);
  check('the module carries NO private unit table — it refuses when the shared helpers are absent',
    (() => { const keep = globalThis.parseDurationToHours; delete globalThis.parseDurationToHours;
             const r = M.solveMarkovPhased(REPAIRABLE);
             globalThis.parseDurationToHours = keep;
             return !r.ok && /shared phase helpers/.test(r.reason); })(),
    'a second unit vocabulary is exactly the §8 disease this project keeps finding');
  check('every phase row is put to the SHARED isSpecialPhase — the decision is delegated, not re-derived',
    asked.length >= 6 && asked.includes('Cruise') && asked.includes('Go-around'), JSON.stringify(asked));
  check('an UNFLAGGED contingency row is still excluded, because the shared helper says so',
    (() => { globalThis.flightPhasesData.push({ phase: 'Rejected Takeoff', duration: '1', durationUnit: 'mins' });
             const s = M.phaseSequence();
             globalThis.flightPhasesData.pop();
             // no `special: true` on that row — only the shared name table knows
             return !s.seq.some(p => p.name === 'Rejected Takeoff') && s.excluded.some(e => /Rejected Takeoff/.test(e)); })(),
    'a private contingency list would have folded an unflagged go-around into every mission');
  check('and the module owns NO private phase vocabulary of its own (§8: one field, one list)',
    !/durationUnit\s*===|['"]mins['"]|['"]hours['"]|Go-?around|Rejected Take/i.test(src.replace(/^\s*\/\/.*$/gm, '')),
    'the moment this module grows its own unit table or contingency list, it can disagree with the exposure engine');

  const r = M.solveMarkovPhased(REPAIRABLE);
  check('a model with no plan still runs the table at multiplier 1 across every phase',
    r.ok && r.legs.length === 4 && r.legs.every(l => l.mult === 1 && l.reconfigured === false));
  check('the excluded phases ride the result and the receipt',
    r.excluded.length === 2 && r.receipt.excluded.length === 2);
  // The whole point: a phased chain over one config with no stress variation
  // must equal the single solve over the same total time.
  const total = r.legs.reduce((a, l) => a + l.hours, 0);
  const flat = M.solveMarkovTransient(REPAIRABLE, total);
  check('with no reconfiguration and no stress variation the chain reproduces the single-interval answer',
    Math.abs(r.pFailed - flat.pFailed) <= 1e-14, 'err ' + Math.abs(r.pFailed - flat.pFailed));

  const stressed = M.solveMarkovPhased(REPAIRABLE, { plan: { overrides: { Cruise: { mult: 4 } } } });
  check('a per-phase override applies to that phase only',
    stressed.ok && stressed.legs.find(l => l.phase === 'Cruise').mult === 4 &&
    stressed.legs.filter(l => l.phase !== 'Cruise').every(l => l.mult === 1) &&
    stressed.pFailed > r.pFailed);
  delete globalThis.flightPhasesData;
  const empty = M.solveMarkovPhased(REPAIRABLE);
  check('an empty phase table refuses rather than inventing a horizon',
    !empty.ok && /no flight phases/.test(empty.reason));
}

// ---- [5] initial-distribution guard on the transient solver -----------------
console.log('\n[phased] π₀ guard (the mechanism the chain rides)');
{
  check('a π₀ of the wrong length refuses',
    !M.solveMarkovTransient(REPAIRABLE, 1, { pi0: [1] }).ok);
  check('a π₀ that does not sum to 1 refuses rather than renormalizing',
    (() => { const r = M.solveMarkovTransient(REPAIRABLE, 1, { pi0: [0.5, 0.2] });
             return !r.ok && /REFUSED rather than renormalized/.test(r.reason); })(),
    'silent renormalization is how lost mass hides');
  check('a negative entry refuses',
    !M.solveMarkovTransient(REPAIRABLE, 1, { pi0: [1.5, -0.5] }).ok);
  check('a valid π₀ solves, and starting fully in the failed state of an absorbing chain stays there',
    (() => { const r = M.solveMarkovTransient(PH1, 10, { pi0: [0, 1] });
             return r.ok && Math.abs(r.pFailed - 1) < 1e-15; })());
}

// ---- [6] refusals inside the chain -----------------------------------------
console.log('\n[phased] chain-level refusals');
{
  globalThis.flightPhasesData = [{ phase: 'Cruise', duration: '2', durationUnit: 'hours' }];
  const missing = M.solveMarkovPhased(REPAIRABLE, { plan: { overrides: { Cruise: { modelId: 'mkv-gone' } } } });
  check('a phase naming a model that no longer exists REFUSES instead of falling back to the base model',
    !missing.ok && /no longer exists/.test(missing.reason),
    'a silent fallback would answer with the wrong architecture');
  const broken = M.solveMarkovPhased(REPAIRABLE, { plan: { overrides: { Cruise: { model: { states: [{ name: 'A' }], transitions: [] } } } } });
  check('an invalid per-phase model refuses, naming the phase',
    !broken.ok && /phase "Cruise"/.test(broken.reason));
  delete globalThis.flightPhasesData;
}

// ---- [7] opt-in doctrine + benchmarks --------------------------------------
console.log('\n[phased] opt-in + shipped benchmarks');
check('the effectiveProb wire-in fires ONLY for a model that declared a plan',
  /model\.phasePlan && model\.phasePlan\.enabled && validateMarkovModel\(model\)\.ok/.test(src),
  'without the opt-in, every existing number would move on deploy');
check('…and a refused chain falls through to the single-interval answer rather than throwing',
  /const ph = solveMarkovPhased\(model\);\s*\n\s*if \(ph\.ok\) return ph\.pFailed;/.test(src));
{
  const bm = M.runMarkovBenchmarks();
  const byId = Object.fromEntries(bm.map(b => [b.id, b]));
  check('the App I worked example ships as a cited benchmark and passes',
    byId['phased-I.4.11.11'] && byId['phased-I.4.11.11'].pass && /§I\.4\.11\.11/.test(byId['phased-I.4.11.11'].cite));
  check('the degenerate cross-check ships and passes (one phase ⇒ plain transient)',
    byId['phased-degenerate'] && byId['phased-degenerate'].pass);
  check('the v1.0 closed-form benchmarks still pass — the π₀ change did not disturb them',
    byId['pure-death'].pass && byId['repairable'].pass);
  // steady-agreement needs the steady solver, absent under bare node: it must
  // SKIP by name, exactly as it did before this build (not silently pass).
  check('steady-agreement skips by name under bare node, as before',
    byId['steady-agreement'] && !!byId['steady-agreement'].skipped);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

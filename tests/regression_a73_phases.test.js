#!/usr/bin/env node
/*
 * Regression — A7-3: flight phases on AI-drafted FHA rows.
 *
 * The board recorded this as "phases passed straight through unvalidated". The
 * truth was worse in one direction and better in another, and neither half was
 * what the note said:
 *
 *   · There WAS a filter, at the parse stage of the dedicated FHA path. But
 *     _applyFhaSuggestion — the function that actually writes the row, and the
 *     one the unified batch route calls DIRECTLY — validated nothing. Same
 *     reachability failure as the original _useUnifiedFeatures finding: the
 *     guard exists, the primary path goes around it.
 *
 *   · Where the filter did run, it validated against FLIGHT_PHASES, a hardcoded
 *     eight-value constant that knows nothing about the project. Exposure
 *     normalisation matches FHA phases against the project's OWN table
 *     (flightPhasesData, via getPhaseExposureRatio), so the two vocabularies
 *     disagreed. An eVTOL programme's Hover and Transition are not in the
 *     constant — and neither is "All phases", which the shipped demos already
 *     use. So the filter was DELETING legitimate phases on one path while the
 *     other path accepted invented ones.
 *
 * A dropped phase is not cosmetic: it silently disables the exposure
 * normalisation for that failure condition, so the probability requirement is
 * computed against the whole flight envelope instead of the phases the
 * condition is actually exposed in.
 *
 * Run: node tests/regression_a73_phases.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');

const grab = n => (ai.match(new RegExp('function ' + n + '\\([\\s\\S]*?\\n    \\}')) || [''])[0];

// ---- the vocabulary, executed ------------------------------------------------
console.log('\n[A7-3] the project owns the phase vocabulary');
{
  const sb = { console, String, Array }; sb.window = sb; vm.createContext(sb);
  vm.runInContext(
    "const FLIGHT_PHASES=['Taxi','Takeoff','Climb','Cruise','Descent','Approach','Landing','Go-around'];" +
    grab('_projectPhaseNames') + grab('_validPhases') +
    ';globalThis._v=_validPhases; globalThis._n=_projectPhaseNames;', sb);

  sb.flightPhasesData = undefined;
  check('with no project phases defined, it falls back to the standard list',
    sb._n().length === 8 && sb._n().indexOf('Cruise') >= 0,
    'a new project must still be able to draft an FHA');

  sb.flightPhasesData = [{ phase: 'Hover' }, { phase: 'Transition' }, { phase: 'Cruise' }];
  check('a VTOL project\'s own phases become the vocabulary',
    sb._n().indexOf('Hover') >= 0 && sb._n().indexOf('Transition') >= 0);
  check('Hover and Transition now SURVIVE validation',
    JSON.stringify(sb._v(['Hover', 'Transition'])) === '["Hover","Transition"]',
    'the hardcoded list would have deleted both — and sc-vtol is a supported certification basis');
  // 4 Sep 2026 (Waqas): phases are the mission profile's checkboxes; the AI ticks
  // existing boxes and never adds one. A value with no box is not written and is
  // recorded (lastUnlisted) so the row comment names it.
  check('a value with no box in the mission profile is not written — and is recorded for the comment',
    JSON.stringify(sb._v(['Hover', 'Orbit'])) === '["Hover"]' && JSON.stringify(sb._v.lastUnlisted) === '["Orbit"]',
    'the AI never creates a phase; the engineer ticks the right box');
  check('a phase spelled differently from the project table is written in the TABLE\'s spelling',
    JSON.stringify(sb._v(['hover', 'TRANSITION'])) === '["Hover","Transition"]',
    '"Initial climb" vs "Initial Climb" cost golden run 1 a phase');
  check('"All phases" is kept as a wildcard',
    JSON.stringify(sb._v(['All phases'])) === '["All phases"]',
    'the shipped demos already use it, and the constant does not contain it');
  check('a comma-joined string stays a string',
    sb._v('Hover, Orbit, Cruise') === 'Hover, Cruise',
    'imported rows carry phases as text; returning an array there would corrupt the row');
  check('empty input is handled',
    JSON.stringify(sb._v([])) === '[]' && sb._v('') === '');
}

// ---- the reachability half ---------------------------------------------------
console.log('\n[A7-3] the write path validates, not just the parse path');
check('_applyFhaSuggestion filters phases',
  /phases: _validPhases\(s\.phases \|\| \[\]\)/.test(ai),
  'this is the function the unified batch route calls directly — it validated nothing at all');
check('and the reason is recorded at the call site',
  /the batch path reaches this function directly and bypassed the parse-stage filter/.test(ai));
check('the parse-stage filter uses the same vocabulary',
  /phases: _validPhases\(Array\.isArray\(x\.phases\) \? x\.phases : \[\]\)/.test(ai),
  'two filters with two vocabularies is how this stayed broken in both directions at once');
check('no filter still compares against the bare constant',
  !/FLIGHT_PHASES\.indexOf\(ph\)/.test(ai));

// ---- the prompt --------------------------------------------------------------
console.log('\n[A7-3] the model is offered the right list');
check('the prompt enumerates the PROJECT phases',
  /_projectPhaseNames\(\)\.join\(', '\)/.test(ai) && !/only from: ' \+ FLIGHT_PHASES/.test(ai));
check('…and states the cost of going outside it',
  /a value outside the list cannot be ticked and is flagged to the engineer as your error/.test(ai),
  'a rule with a stated consequence is followed more often than a bare list');
check('the constant survives only as the fallback',
  /const FLIGHT_PHASES/.test(ai) && /falling back to the\s*\n\s*\/\/ constant only when the project has not defined any phases/.test(ai));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

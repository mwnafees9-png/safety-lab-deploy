#!/usr/bin/env node
/*
 * Regression — the AI lanes answer to the programme plan (§3.2, 2 Aug 2026).
 *
 * WHAT IT WAS. `ProgramPlan` and `laneOn` appeared ZERO times in
 * ai_assistant.js. Every other surface gated on programme scope — tabs, nav,
 * the FMEA mode buttons — but the assistant would draft into STPA, Markov or
 * piece-part FMEA whether or not the programme committed to those analyses.
 * An engineer who deliberately scoped them out got AI content in lanes their
 * SSPP says they do not perform.
 *
 * WHAT IT IS NOW. One helper (_aiLaneOn) reads PROGRAM_PLAN.laneOn, and it is
 * consulted at the one dispatch seam every chat / unified action crosses
 * (_chatRunActions), at the shared FMEA accept (_applyFmea), and at the two
 * classic entrypoints (draftStpa, draftFmea) before any tokens are spent.
 * ETA has no AI write surface today — nothing in ai_assistant.js touches
 * etaData — so its op mapping exists for the day one lands, and this suite
 * pins that fact so the day it stops being true, someone is told.
 *
 * THE NAME. The global is PROGRAM_PLAN (program_plan.js:
 * `window.PROGRAM_PLAN = API`), NOT ProgramPlan. This exact gate shipped once
 * before reading the wrong name: it failed open on every call, and its test
 * stayed green because the mock used the invented name too (HANDOFF §7.5).
 * This suite therefore executes the REAL program_plan.js and asserts the gate
 * reads the name that module actually exports — a mock is only evidence when
 * the name it stands in for is the real name.
 *
 * FAIL-OPEN is the contract, copied from fmeaModeInScope(): a missing or
 * older module must never lock a user out of their own worksheet.
 *
 * Run: node tests/regression_ai_lane_gate.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const pp = fs.readFileSync(path.join(SITE, 'program_plan.js'), 'utf8');

const fn = (name) => (ai.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n    \\}')) || [''])[0];
const gate = fn('_aiLaneOn');
const blocked = fn('_opLaneBlocked');

// ---- [1] the name -----------------------------------------------------------
console.log('\n[lane] the global the gate reads is the global the module exports');
check('program_plan.js exports window.PROGRAM_PLAN — the ground truth',
  /window\.PROGRAM_PLAN = API/.test(pp),
  'if this ever changes, every consumer below must move with it');
check('_aiLaneOn reads W.PROGRAM_PLAN', /W \? W\.PROGRAM_PLAN : null/.test(gate));
check('it does NOT read the invented name ProgramPlan',
  !/W\.ProgramPlan\b/.test(gate),
  'the §7.5 bug: a gate on the wrong name fails open every time and gates nothing');
check('the trap is documented at the gate', /NOT ProgramPlan/.test(ai));

// ---- [2] fail-open ----------------------------------------------------------
console.log('\n[lane] fail-open, like fmeaModeInScope');
check('no module → true', /if \(!PP \|\| typeof PP\.laneOn !== 'function'\) return true;/.test(gate),
  'a missing module must never lock a user out of their own worksheet');
check('a throwing plan → true', /catch \(_\) \{ return true; \}/.test(gate));

// ---- [3] the seams ----------------------------------------------------------
console.log('\n[lane] where the gate actually sits');
{
  // Order asserted by position, not by a character-count window — the blocked
  // message between the two statements is long and may grow.
  const iGate = ai.indexOf('const _offLane = _opLaneBlocked(a);');
  const iPre = ai.indexOf('const pre = _preflightAction(a);', iGate);
  check('the op dispatch checks scope before preflight',
    iGate > -1 && iPre > -1 && (iPre - iGate) < 600,
    'one seam covers chat AND unified batch — every action crosses _chatRunActions');
}
check('a blocked op names the lane and where to turn it on',
  /out of program scope — the ' \+ _offLane \+ ' lane/.test(ai) && /Program Planning tab/.test(ai));
check('all four Markov ops map to the markov lane',
  /add_markov_state: 'markov', delete_markov_state: 'markov',\s*\n\s*add_markov_transition: 'markov', delete_markov_transition: 'markov'/.test(ai));
check('add_fmea maps by payload level — item → ppfmea, else ffmea',
  /a\.op === 'add_fmea'\) lane = \(a\.level === 'item'\) \? 'ppfmea' : 'ffmea'/.test(blocked));
check('_applyFmea enforces at the accept, so every route answers',
  /const _lane = \(level === 'item'\) \? 'ppfmea' : 'ffmea';\s*\n\s*if \(!_aiLaneOn\(_lane\)\)/.test(ai),
  'classic panels do not cross the op dispatch; the accept is their seam');
check('draftStpa gates before spending tokens',
  /function draftStpa\(\) \{[\s\S]{0,400}_aiLaneOn\('stpa'\)/.test(ai));
check('draftFmea gates before the unified short-circuit',
  /_aiLaneOn\('ppfmea'\)[\s\S]{0,600}_useUnifiedFeatures\(\)/.test((ai.match(/async function draftFmea\(opts\) \{[\s\S]{0,1200}/) || [''])[0]),
  'gating after the short-circuit would leave the primary path ungated — the 1 Aug reachability lesson');

// ---- [4] ETA has no surface to gate — pinned --------------------------------
console.log('\n[lane] ETA');
// Scoped to CODE-shaped usage (identifier touching an operator / typeof), not
// prose — the gate's own comment mentions the store by name, and a bare
// substring test would eat itself (HANDOFF §7.4, third recorded instance).
check('nothing in ai_assistant.js touches the ETA store as code',
  !/typeof etaData|etaData\s*[.\[(=,;]/.test(ai),
  'if this fails, an ETA AI surface now exists: map its op in _OP_LANE (the add_eta slot is waiting) and gate its entrypoint');
check('the future ETA op is already mapped', /add_eta: 'eta'/.test(ai));

// ---- [5] executed against the REAL program_plan.js --------------------------
console.log('\n[lane] the gate, executed against the real module');
{
  const sandbox = { console, Date, JSON, Math, Array, Object, String, Number, Boolean, RegExp, Set, Map, isFinite, isNaN, parseInt, parseFloat, document: undefined };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.projectConfig = { safetyProgramPlan: { slots: {}, notes: '' } };
  sandbox.scheduleAutosave = () => {};
  vm.createContext(sandbox);
  vm.runInContext(pp, sandbox);

  check('the real module exports PROGRAM_PLAN into the sandbox',
    !!sandbox.PROGRAM_PLAN && typeof sandbox.PROGRAM_PLAN.laneOn === 'function',
    'the executed half of the §7.5 lesson — the export name, proven by running the exporter');
  check('…and does NOT export the invented name', typeof sandbox.ProgramPlan === 'undefined');

  vm.runInContext(gate + '\n; globalThis._gate = _aiLaneOn;', sandbox);
  vm.runInContext('const _OP_LANE = ' + (ai.match(/const _OP_LANE = \{[\s\S]*?\};/) || [''])[0].replace('const _OP_LANE = ', '') + '\n' + blocked.replace('_aiLaneOn', '_gate') + '\n; globalThis._blocked = _opLaneBlocked;', sandbox);

  // Grandfather rule (no scope record): legacy lanes ON, opt-in lanes OFF.
  check('no scope record → markov (legacy) is on', sandbox._gate('markov') === true);
  check('no scope record → stpa (opt-in) is OFF', sandbox._gate('stpa') === false,
    'the grandfather rule the plan module documents: opt-in lanes default off');
  check('no scope record → ppfmea (opt-in) is OFF', sandbox._gate('ppfmea') === false);
  check('a Markov op is allowed while the lane is on',
    sandbox._blocked({ op: 'add_markov_state', modelId: 'm1', name: 'S1' }) === null);

  // Author a scope: turn markov OFF, stpa ON.
  vm.runInContext('PROGRAM_PLAN.initScope("Part 25"); projectConfig.safetyProgramPlan.scope.markov = false; projectConfig.safetyProgramPlan.scope.stpa = true; projectConfig.safetyProgramPlan.scope.ppfmea = false;', sandbox);
  check('scoped out → markov gate closes', sandbox._gate('markov') === false);
  check('scoped in → stpa gate opens', sandbox._gate('stpa') === true);
  check('a Markov op is now blocked, naming its lane',
    sandbox._blocked({ op: 'add_markov_state', modelId: 'm1', name: 'S1' }) === 'markov');
  check('an item-level add_fmea is blocked as ppfmea',
    sandbox._blocked({ op: 'add_fmea', level: 'item' }) === 'ppfmea');
  check('a functional add_fmea passes (ffmea is basis-expected and on)',
    sandbox._blocked({ op: 'add_fmea', level: 'functional' }) === null);
  check('an unscoped op (add_fha) is never lane-blocked',
    sandbox._blocked({ op: 'add_fha' }) === null,
    'the spine — functions, FHA, requirements — is not gated, matching the plan module\'s own doctrine');

  // Fail-open, executed: gate with the module genuinely absent.
  const bare = { console, window: null };
  bare.window = bare; bare.globalThis = bare;
  vm.createContext(bare);
  vm.runInContext(gate + '\n; globalThis._gate = _aiLaneOn;', bare);
  check('no PROGRAM_PLAN module at all → every lane reads on (fail-open, executed)',
    bare._gate('markov') === true && bare._gate('stpa') === true && bare._gate('ppfmea') === true);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

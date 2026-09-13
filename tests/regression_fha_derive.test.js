#!/usr/bin/env node
/**
 * Regression — FHA LEVELS DERIVED BY RULE, NOT JUDGED (levers 2 + 3, 5 Sep 2026).
 *
 * Waqas: "lever 2 are pure judgement calls and you will have a hard time getting consistent
 * answer from the same safety engineer on 2 separate programs the only way right now is human
 * factors decides in terms of crew work load, and we need to lean on MAC to establish what
 * counts as slight/significant/large they will have to get validated later as those analyses
 * are populated." And the 4 Sep ruling on rows: a phase where the effect is not realised and
 * the flight can be aborted or the condition escaped is No Safety Effect; a phase where nothing
 * has happened yet but the end effect cannot be escaped carries that end effect.
 *
 * The suite EXECUTES fha_derive.js — the escape rule, the MAC grading, the Task Analysis
 * grading, the prompt clause and apply() — then proves the wiring in ai_assistant.js, the
 * mission profile, the Flight Phases table and the Effects cell by reading the source.
 * Run: node tests/regression_fha_derive.test.js
 */
const PIN = require('./lib/pinfloor.js');
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const ai = S('ai_assistant.js'), idx = S('index.html'), helpers = S('helpers_modules.js'), bind = S('bindings_modules.js'), axes = S('severity_axes.js');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }

function load(extra) {
  const ctx = Object.assign({ window: null, console, Math, String, Array, Object, Number, RegExp, parseInt, parseFloat, isNaN }, extra || {});
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(S('fha_derive.js'), ctx);
  return ctx;
}
const PHASES = [{ phase: 'Standing' }, { phase: 'Taxi' }, { phase: 'Takeoff' }, { phase: 'Cruise' }, { phase: 'Approach' }, { phase: 'Landing' }, { phase: 'Go-around', special: true }];

console.log('[1] escapes — the mission profile says how a flight gets out of a phase');
{
  const D = load({ flightPhasesData: PHASES }).SLFhaDerive;
  check('defaults by phase name: Standing / Taxi stop on the ground, Takeoff rejects before V1, Cruise continues to a landing, Approach goes around, Landing none', D.defaultEscape('Standing') === 'stop on the ground' && D.defaultEscape('Taxi') === 'stop on the ground' && D.defaultEscape('Takeoff') === 'reject the take-off before V1' && D.defaultEscape('Cruise') === 'continue to a landing' && D.defaultEscape('Approach') === 'go-around' && D.defaultEscape('Landing') === 'none' && D.defaultEscape('Go-around') === 'continue to a landing' && D.defaultEscape('Rejected Takeoff') === 'stop on the runway');
  check('an unknown phase has no default — nothing is invented', D.defaultEscape('Orbital insertion') === '');
  check('an authored escape wins over the default; empty falls back', D.escapeOf({ phase: 'Cruise', escape: 'divert' }) === 'divert' && D.escapeOf({ phase: 'Cruise', escape: '' }) === 'continue to a landing');
  check('the prompt clause lists every phase and asks the three structured questions', /ESCAPES BY PHASE/.test(D.escapesPromptText()) && /Standing: stop on the ground; Taxi: stop on the ground; Takeoff: reject the take-off before V1/.test(D.escapesPromptText()) && /Landing: none/.test(D.escapesPromptText()) && /"realized"/.test(D.escapesPromptText()) && /"escape"/.test(D.escapesPromptText()) && /"escapeDefeated"/.test(D.escapesPromptText()));
  check('… and states the rule it will apply', /not realized \+ escape available and not defeated → No Safety Effect; not realized \+ no escape, or the escape defeated → the END effect/.test(D.escapesPromptText()));
  check('every seeded phase in bindings carries an escape; Landing is "none"', /phase: 'Standing'[^}]*escape: 'stop on the ground'/.test(bind) && /phase: 'Takeoff'[^}]*escape: 'reject the take-off before V1'/.test(bind) && /phase: 'Landing'[^}]*escape: 'none'/.test(bind) && /phase: 'Go-around'[^}]*escape: 'continue to a landing'/.test(bind) && /phase: 'Rejected Takeoff'[^}]*escape: 'stop on the runway'/.test(bind));
  check('the Flight Phases table has an Escape column (header, cell, datalist, colspan 10)', /<th title="How the flight gets out of a failure condition[^"]*">Escape<\/th>/.test(idx) && /updatePhase\(\$\{idx\}, 'escape', this\.value\)/.test(helpers) && /list="phase-escape-options"/.test(helpers) && /id = 'phase-escape-options'/.test(helpers) && /colspan="10"/.test(helpers) && !/colspan="9"/.test(helpers));
}

console.log('\n[2] the escape rule at accept — the 4 Sep ruling, applied');
{
  const D = load({ flightPhasesData: PHASES }).SLFhaDerive;
  check('not realised + escapable + not defeated → No Safety Effect (Standing, Taxi)', D.applyEscape({ realized: false }, ['Standing', 'Taxi']).kind === 'nse');
  check('not realised + the failure defeats the escape → the end effect (loss of braking in Taxi)', D.applyEscape({ realized: false, escapeDefeated: true }, ['Taxi']).kind === 'end');
  check('not realised + no escape (Landing) → the end effect', D.applyEscape({ realized: false }, ['Landing']).kind === 'end');
  check('a row mixing an escapable phase with Landing carries the end effect and is told to split', D.applyEscape({ realized: false }, ['Cruise', 'Landing']).kind === 'mixed' && /split it/.test(D.applyEscape({ realized: false }, ['Cruise', 'Landing']).note));
  check('the drafter\'s own "escape: none" is no escape — total loss of thrust airborne cannot continue to a landing (draw 1 lesson, 13 rows)', D.applyEscape({ realized: false, escape: 'none' }, ['Cruise', 'Approach']).kind === 'end' && /drafter states no escape applies/.test(D.applyEscape({ realized: false, escape: 'none' }, ['Cruise']).note) && D.applyEscape({ realized: false, escape: 'continue to a landing' }, ['Cruise']).kind === 'nse' && D.applyEscape({ realized: false, escape: '' }, ['Cruise']).kind === 'nse');
  check('realised → the effect as felt; no answer → nothing fires', D.applyEscape({ realized: true }, ['Cruise']).kind === 'realized' && D.applyEscape({}, ['Cruise']).kind === 'unknown' && D.applyEscape({ realized: 'false' }, ['Taxi']).kind === 'nse');
  check('"All phases" not realised expands to the whole profile — Landing has no escape, so end effect (mixed)', D.applyEscape({ realized: false }, ['All phases']).kind === 'mixed');
  const D2 = load({ flightPhasesData: [{ phase: 'Orbit' }] }).SLFhaDerive;
  check('an escape the engineer has not stated does not fire the rule — the drafted level stands', D2.applyEscape({ realized: false }, ['Orbit']).kind === 'unstated');
  const r = D.apply({ phases: ['Standing', 'Taxi'], realized: false, effAcLevel: 'large' }, { id: 'SF-004-TL', desc: 'Total loss of braking', subId: 'SF-004' }, ['SF-004'], { effAcLevel: 'large', effCrewLevel: 'significant', effPaxLevel: 'discomfort' });
  check('apply(): the NSE row lands with all three axes at none and every axis marked as set by the escape rule', r.levels.effAcLevel === 'none' && r.levels.effCrewLevel === 'none' && r.levels.effPaxLevel === 'none or slight inconvenience' && r.derived.ac === 'escape' && r.derived.crew === 'escape' && r.derived.pax === 'escape');
  check('… and the note records the drafted end-effect levels rather than losing them', /drafted levels \(large \/ significant \/ discomfort\) describe the end effect/.test(r.notes[0]));
}

console.log('\n[3] the MAC grades the aircraft axis of a partial loss');
{
  const mac = [
    { subId: 'SF-004', phase: 'All phases', clauses: [{ min: 1, of: ['a', 'b', 'c'] }] },
    { subId: 'SF-004', phase: 'Landing',    clauses: [{ min: 2, of: ['a', 'b', 'c'] }] },
    { subId: 'SF-007', phase: 'All phases', clauses: [{ min: 1, of: ['x', 'y'] }] },
    { subId: 'SF-008', phase: 'All phases', clauses: [{ min: 1, of: ['p', 'q', 'r', 's'] }] }
  ];
  const D = load({ flightPhasesData: PHASES, projectConfig: { macModels: mac } }).SLFhaDerive;
  check('condition kind from the FCIM id: -TL total, -PL / -PL2 partial, -M / -M3 malfunction; from the wording otherwise', D.condKind({ id: 'SF-004-TL' }) === 'total' && D.condKind({ id: 'SF-004-PL' }) === 'partial' && D.condKind({ id: 'SF-004-PL2' }) === 'partial' && D.condKind({ id: 'SF-004-M3' }) === 'malfunction' && D.condKind({ desc: 'Total loss of thrust' }) === 'total' && D.condKind({ desc: 'Partial loss of thrust' }) === 'partial' && D.condKind({ desc: 'Erroneous thrust' }) === 'malfunction');
  check('how many members the partial loss removes is read from the wording (default one)', D.lostCount('Partial loss of hydraulics') === 1 && D.lostCount('Loss of one of three hydraulic systems') === 1 && D.lostCount('Loss of two of three hydraulic systems') === 2 && D.lostCount('Loss of both engines') === 2 && D.lostCount('Loss of 2 of 4 generators') === 2);
  const one = D.macDerive({ id: 'SF-004-PL', desc: 'Partial loss of X', subId: 'SF-004' }, ['SF-004'], ['Cruise']);
  check('one spare above the floor → significant (rule at least 1 of 3, one lost)', one.status === 'derived' && one.level === 'significant' && /1 lost, 1 spare above the floor → significant/.test(one.note));
  const floor = D.macDerive({ id: 'SF-007-PL', desc: 'Partial loss of Y', subId: 'SF-007' }, ['SF-007'], ['Cruise']);
  check('on the floor → large (rule at least 1 of 2, one lost)', floor.status === 'derived' && floor.level === 'large');
  const two = D.macDerive({ id: 'SF-008-PL', desc: 'Partial loss of Z', subId: 'SF-008' }, ['SF-008'], ['Cruise']);
  check('two or more spare → slight (rule at least 1 of 4, one lost)', two.status === 'derived' && two.level === 'slight');
  const outside = D.macDerive({ id: 'SF-007-PL', desc: 'Loss of both channels of Y', subId: 'SF-007' }, ['SF-007'], ['Cruise']);
  check('a "partial" loss that removes more than the rule allows is OUTSIDE the MAC — the loss itself, no derived level', outside.status === 'outside' && outside.level === '');
  const split = D.macDerive({ id: 'SF-004-PL', desc: 'Partial loss of X', subId: 'SF-004' }, ['SF-004'], ['Cruise', 'Landing']);
  check('a phase-specific rule wins in its phase — Cruise significant, Landing large — the row takes the worst and is told to split', split.status === 'derived' && split.level === 'large' && split.split === true && /Cruise: significant; Landing: large/.test(split.note) && /split it/.test(split.note));
  const tl = D.macDerive({ id: 'SF-004-TL', desc: 'Total loss of X', subId: 'SF-004' }, ['SF-004'], ['Cruise']);
  check('a total loss is outside the MAC — the aircraft level is the loss itself, never graded by spares', tl.status === 'outside' && tl.level === '' && /breached/.test(tl.note));
  const mf = D.macDerive({ id: 'SF-004-M', desc: 'Erroneous X', subId: 'SF-004' }, ['SF-004'], ['Cruise']);
  check('a malfunction is not governed by the MAC', mf.status === 'malfunction' && mf.level === '' && mf.assumption === '');
  const none = D.macDerive({ id: 'SF-009-PL', desc: 'Partial loss of W', subId: 'SF-009' }, ['SF-009'], ['Cruise']);
  check('no rule for the function → the drafter\'s level stands and an "assumed pending the MAC" assumption is raised', none.status === 'no-rule' && none.level === '' && /assumed pending the MAC rule for SF-009/.test(none.assumption));
  const ap = D.apply({ phases: ['Cruise'], realized: true }, { id: 'SF-004-PL', desc: 'Partial loss of X', subId: 'SF-004' }, ['SF-004'], { effAcLevel: 'large', effCrewLevel: '', effPaxLevel: '' });
  check('apply(): the MAC-derived level replaces the drafted one, the row marks the axis "from MAC", the note keeps what the drafter proposed', ap.levels.effAcLevel === 'significant' && ap.derived.ac === 'MAC' && /drafter proposed large/.test(ap.notes.join(' ')));
  const sysRule = D.apply({ phases: ['Cruise'], realized: true }, { id: 'HYD-003-PL', desc: 'Partial loss of pressure', subId: 'HYD-003' }, ['SF-008'], { effAcLevel: 'large', effCrewLevel: '', effPaxLevel: '' });
  check('an SFHA row is graded on the aircraft sub-function it traces to', sysRule.levels.effAcLevel === 'slight' && sysRule.derived.ac === 'MAC');
}

console.log('\n[4] the Task Analysis grades the crew axis');
{
  const tasks = [
    { taskId: 'TASK-001', phase: 'Cruise', crewmember: 'PF', task: 'Respond to SF-004-TL: select alternate source', reactionS: '10', execS: '20', asmId: '' },
    { taskId: 'TASK-002', phase: 'Landing', crewmember: 'PF', task: 'Manual braking after loss of autobrake (SF-004)', reactionS: '2', execS: '3', asmId: '' },
    { taskId: 'TASK-003', phase: 'Approach', crewmember: 'PM', task: 'Reconfigure per QRH', reactionS: '30', execS: '40', asmId: 'ASM-AC-007' },
    { taskId: 'TASK-004', phase: 'Cruise', crewmember: 'PF', task: 'Something about SF-0041', reactionS: '1', execS: '1', asmId: '' }
  ];
  const hea = [{ heaId: 'HEA-001', asmId: 'ASM-AC-007', fcIds: 'SF-005-M, SF-006-TL' }];
  const avail = { Cruise: 60, Landing: 6, Approach: 100 };
  const HF = {
    taskResponseS: r => (r.reactionS == null && r.execS == null) ? null : (parseFloat(r.reactionS) || 0) + (parseFloat(r.execS) || 0),
    taskAvailableS: r => { const p = String(r.phase).split(',')[0].trim(); return { s: avail[p] || null }; },
    taskOccupancy: r => { const a = HF.taskAvailableS(r).s, n = HF.taskResponseS(r); return (a && n != null) ? n / a : null; }
  };
  const D = load({ flightPhasesData: PHASES, projectConfig: { hf: { tasks: { rows: tasks }, hea: { rows: hea } } }, HF_ANALYSES: HF }).SLFhaDerive;
  check('tasks are found by the condition id in their text, by the function id, and through an error-analysis row that feeds the condition — never by a substring of a longer id', D.tasksFor({ id: 'SF-004-TL', subId: 'SF-004' }, ['SF-004']).map(t => t.taskId).join() === 'TASK-001,TASK-002' && D.tasksFor({ id: 'SF-005-M', subId: 'SF-005' }, ['SF-005']).map(t => t.taskId).join() === 'TASK-003' && D.tasksFor({ id: 'SF-004', subId: 'SF-004' }, []).map(t => t.taskId).join() === 'TASK-001,TASK-002');
  const cr = D.hfDerive({ id: 'SF-004-TL', subId: 'SF-004' }, ['SF-004'], ['Cruise']);
  check('30 s of 60 s in Cruise → 50% → slight (and only the task for these phases counts)', cr.status === 'derived' && cr.level === 'slight' && Math.round(cr.occupancy * 100) === 50 && cr.tasks.length === 1);
  const ap = D.hfDerive({ id: 'SF-005-M', subId: 'SF-005' }, ['SF-005'], ['Approach']);
  check('70 s of 100 s → 70% → significant (above the 60% line)', ap.status === 'derived' && ap.level === 'significant');
  const ld = D.hfDerive({ id: 'SF-004-TL', subId: 'SF-004' }, ['SF-004'], ['Landing']);
  check('5 s of 6 s → 83% → large (above the 80% line)', ld.status === 'derived' && ld.level === 'large' && ld.notCompletable === false);
  const D3 = load({ flightPhasesData: PHASES, projectConfig: { hf: { tasks: { rows: [{ taskId: 'TASK-009', phase: 'Landing', task: 'Handle SF-010-TL', reactionS: '5', execS: '5' }] } } }, HF_ANALYSES: HF }).SLFhaDerive;
  const nc = D3.hfDerive({ id: 'SF-010-TL', subId: 'SF-010' }, ['SF-010'], ['Landing']);
  check('a response that cannot be completed in the time available is large and flagged', nc.level === 'large' && nc.notCompletable === true && /CANNOT be completed/.test(nc.note));
  const nt = D.hfDerive({ id: 'SF-099-TL', subId: 'SF-099' }, ['SF-099'], ['Cruise']);
  check('no crew task tied to the condition → the drafter\'s level stands and "assumed pending the human-factors workload" is raised', nt.status === 'no-task' && nt.level === '' && /assumed pending the human-factors task analysis/.test(nt.assumption));
  const op = D.hfDerive({ id: 'SF-004-TL', subId: 'SF-004' }, ['SF-004'], ['Takeoff']);
  check('tasks authored for other phases do not grade this row — assumption raised for these phases', op.status === 'no-task' && /Takeoff/.test(op.assumption));
  const D4 = load({ flightPhasesData: PHASES, projectConfig: { hf: { tasks: { rows: [{ taskId: 'TASK-011', phase: 'Cruise', task: 'Handle SF-011-TL' }] } } }, HF_ANALYSES: HF }).SLFhaDerive;
  const ut = D4.hfDerive({ id: 'SF-011-TL', subId: 'SF-011' }, ['SF-011'], ['Cruise']);
  check('a task with no response time cannot grade — assumption names the task', ut.status === 'no-time' && /TASK-011/.test(ut.assumption));
  const full = D.apply({ phases: ['Cruise'], realized: true }, { id: 'SF-004-TL', desc: 'Total loss of X', subId: 'SF-004' }, ['SF-004'], { effAcLevel: 'large', effCrewLevel: 'large', effPaxLevel: 'discomfort' });
  check('apply(): total loss keeps the drafted aircraft level (outside the MAC), crew is derived (slight, "from HF"), occupants stay the drafter\'s, and the missing MAC rule is an assumption', full.levels.effAcLevel === 'large' && full.derived.ac === '' && full.levels.effCrewLevel === 'slight' && full.derived.crew === 'HF' && full.levels.effPaxLevel === 'discomfort' && full.derived.pax === '' && full.assumptions.length === 1 && /pending the MAC/.test(full.assumptions[0].text));
}

console.log('\n[5] what the drafter is told');
{
  const mac = [{ subId: 'SF-004', phase: 'All phases', clauses: [{ min: 1, of: ['a', 'b', 'c'] }] }];
  const D = load({ flightPhasesData: PHASES, projectConfig: { macModels: mac, hf: {} } }).SLFhaDerive;
  const p = D.promptFor([{ id: 'SF-004-PL', desc: 'Partial loss of X', subId: 'SF-004' }, { id: 'SF-004-TL', desc: 'Total loss of X', subId: 'SF-004' }, { id: 'SF-009-M', desc: 'Erroneous W', subId: 'SF-009' }]);
  check('DERIVED LEVELS clause: the partial loss carries its MAC-derived level, the total loss is told to write the loss itself, missing rules are named as pending', /^DERIVED LEVELS/.test(p) && /SF-004-PL — aircraft level = significant \(MAC: at least 1 of \[a, b, c\], 1 lost\)/.test(p) && /SF-004-TL — aircraft: OUTSIDE the MAC — write the loss itself/.test(p) && /SF-009-M — crew: no timed crew task yet/.test(p) && !/SF-009-M — aircraft/.test(p));
  check('… and tells the drafter to judge only what is not derived, the occupant axis always', /judge only the levels not given here, and the occupant axis always/.test(p));
  check('nothing to derive → empty clause, not a header with no lines', load({ flightPhasesData: PHASES }).SLFhaDerive.promptFor([]) === '');
}

console.log('\n[6] wiring — ai_assistant.js, severity_axes.js, index.html');
{
  check('the classic system prompt (rule 4) carries the escapes clause and asks the three answers in its JSON shape', /may name them with a different effect or class\.'\s*\+ _fhaEscapesClause\(\)/.test(ai) && /"realized": <true when the effect is felt in the row\\'s phases, false when nothing has happened yet>, "escape": "<the escape from ESCAPES BY PHASE that applies to the row\\'s phases, or \\"none\\">", "escapeDefeated": <true when THIS failure removes that escape>/.test(ai));
  check('the unified FHA batch carries the escapes clause in its system extra', /never to two rows with different classes\.'\s*\+ _fhaEscapesClause\(\),/.test(ai));
  check('each turn of the unified batch carries the derived levels for its slice (extraOf on the chunk, read by the slice runner)', /extraOf: function \(slice\) \{ return _fhaDerivedClause\(slice, ''\); \}/.test(ai) && /if \(typeof _chunk\.extraOf === 'function'\) _extra \+= String\(_chunk\.extraOf\(_slice\) \|\| ''\)/.test(ai));
  check('the classic path tells the drafter the derived levels for the FCIM conditions in the batch and carries the three answers off the reply', /\+ _fhaDerivedClause\(_condsFor, scope\.systemId \|\| ''\);/.test(ai) && /realized: \(x\.realized === true \|\| x\.realized === false\) \? x\.realized/.test(ai) && /escape: String\(x\.escape \|\| ''\)\.trim\(\), escapeDefeated: x\.escapeDefeated === true/.test(ai));
  check('the action schema and the executor carry realized / escape / escapeDefeated', /realized\(true when the effect is felt in the row\\'s phases; false when nothing has happened yet\), escape\(the escape from ESCAPES BY PHASE that applies, or "none"\), escapeDefeated\(true when THIS failure removes that escape\)/.test(ai) && /judgementNote: a\.judgementNote, realized: a\.realized, escape: a\.escape, escapeDefeated: a\.escapeDefeated,/.test(ai));
  check('accept derives BEFORE the joint top step and the class read, on the normalised drafted levels', (() => { const a = ai.indexOf('const _rawLevels0 = {'), b = ai.indexOf('window.SLFhaDerive.apply(s, _cond, _macSubIdsFor('), c = ai.indexOf("const _rawLevels = (_drv && _drv.levels) ? _drv.levels : _rawLevels0;"), d = ai.indexOf('SLSeverityAxes.applyTerminal(_rawLevels)'); return a > 0 && b > a && c > b && d > c; })());
  check('the row carries the escape answers and which axes were set by rule; the notes go to the comments; the derive assumptions join the register', /realized: \(s\.realized === true \|\| s\.realized === false\) \? s\.realized : undefined,/.test(ai) && /derived: \(_drv && _drv\.derived && \(_drv\.derived\.ac \|\| _drv\.derived\.crew \|\| _drv\.derived\.pax\)\) \? _drv\.derived : undefined,/.test(ai) && /\+ _derivedNote\s*\+ _drvNote/.test(ai) && /\(_drv && Array\.isArray\(_drv\.assumptions\)\) \? _drv\.assumptions : \[\],/.test(ai));
  check('the MAC sub-function keys are one shared helper (AFHA: its own; SFHA: the traced ones)', /function _macSubIdsFor\(s, sysScoped\)/.test(ai) && /_macSubIdsFor\(\{ subId: c\.subId, _systemId: systemId \|\| '' \}, !!systemId\)/.test(ai));
  check('the Effects cell says which levels came from the MAC / HF / the escape rule', /row\.derived && row\.derived\[ax\]/.test(axes) && /sev-axis-derived/.test(axes) && /_v: '1\.3'/.test(axes));
  check('fha_derive.js is loaded after severity_axes.js; pins bumped (severity_axes 1.3, helpers 2.84, bindings 1.36, loader 8.51 -> ai_assistant >= 76.59)', /severity_axes\.js\?v=[0-9.]+" defer><\/script>[\s\S]{0,300}fha_derive\.js\?v=1\.[1-9][0-9]*/.test(idx) && PIN.atLeast(idx, 'severity_axes.js', '1.3') && PIN.atLeast(idx, 'helpers_modules.js', '2.85') && PIN.atLeast(idx, 'bindings_modules.js', '1.36') && PIN.atLeast(idx, 'ai_loader.js', '8.51') && PIN.atLeast(S('ai_loader.js'), 'ai_assistant.js', '76.59')   /* 5 Sep 2026 — floor, not literal (rule 12) */);
  check('the rejected ideas stay out: no per-function worst-case anchor, no fixed phase-group template in the prompts', !/worst[- ]case (class|severity) (of|for) the function/i.test(ai) && !/Standing and Taxi are always/i.test(ai) && !/functionWorstCase/.test(ai));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

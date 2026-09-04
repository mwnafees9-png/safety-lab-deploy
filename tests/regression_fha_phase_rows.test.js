#!/usr/bin/env node
/**
 * Regression — FHA ROWS COME FROM EFFECTS, AND THE CODE MUST NOT ARGUE WITH THE RULE
 * (Waqas, 3 Sep ruling, re-stated 4 Sep: "one failure condition can be multiple rows if the
 * effects across different phases are different … all failure conditions are applicable to all
 * flight phases … dont limit yourself to 2 rows it could be any number of rows").
 *
 * Run 3 (fha.draft v7, the rule in the skill body) still returned ONE row per condition for all
 * 107, 58 of them "All phases", because five later instructions said the opposite: the system
 * prompt's "phases where the condition is most relevant", the batch extra "One row per listed
 * condition.", the per-turn "Emit a row for EVERY failure condition", the classic path's "one row
 * per condition (a second row … only where …)", and the picker's "One FHA row per selected
 * condition." — and coverage counted a condition DONE when it had any row at all.
 *
 *   · every one of those wordings is gone, replaced by the ruling (any number of rows);
 *   · _fhaPhaseGaps names the phases a condition's rows leave unassessed (executed);
 *   · the FHA batch re-asks ONCE for those phases and the panel reports what is still missing;
 *   · the executor allows any number of rows per condition (keyed on condition + phase set).
 * Run: node tests/regression_fha_phase_rows.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
let pass = 0, fail = 0;
function check(name, cond, detail) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); } }
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '('); if (i < 0) return null;
  let depth = 0, started = false, inS = null, esc = false, line = false, blk = false;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    const c = src[k], n = src[k + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (blk) { if (c === '*' && n === '/') { blk = false; k++; } continue; }
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inS) { if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { line = true; k++; continue; }
    if (c === '/' && n === '*') { blk = true; k++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('[1] the five wordings that argued with the rule are gone');
{
  check('system prompt rule 4 no longer says "most relevant"; it says every condition applies to every phase, as many rows as the effects require', !/choose the flight phases where the condition is most relevant/.test(ai) && /EVERY failure condition applies to EVERY flight phase — never pick the phases a condition is "relevant" to/.test(ai) && /return as MANY rows for one condition as its effects across the flight require \(one, two, five — whatever the effects dictate\)/.test(ai));
  check('… and states the two "nothing has happened yet" cases and the All-phases rule', /flight can be aborted or the condition escaped are a No Safety Effect row/.test(ai) && /cannot escape the end effect carry that END effect/.test(ai) && /"All phases" is allowed ONLY when the effects and class are identical in every phase/.test(ai) && /Never give the row that lists every phase the worst class of one phase/.test(ai));
  check('the batch extra no longer says "One row per listed condition."', !/One row per listed condition\./.test(ai) && /ROWS PER CONDITION \(4 Sep 2026 ruling\): every condition applies to every flight phase\. Return as MANY add_fha rows for one condition as its effects across the flight require/.test(ai) && /there is no limit on how many/.test(ai));
  check('the per-turn wording asks for rows (plural) per condition, covering every phase', !/Emit a row for EVERY failure condition belonging to them/.test(ai) && /Emit rows for EVERY failure condition listed — as many rows per condition as its effects across the flight phases require/.test(ai));
  check('the classic path no longer caps at "a second row"', !/one row per condition \(a second row for the same condition only where the effects genuinely differ by phase\)/.test(ai) && /as many rows per condition as its effects across the flight phases require, the rows for one condition together covering every phase/.test(ai));
  check('the picker no longer promises one row per condition', !/One FHA row per selected condition\./.test(ai) && /one row where the effects are the same, separate rows where they differ/.test(ai));
}

console.log('\n[2] phase coverage — executed');
{
  const ctx = { console, String, Array, Object, RegExp, flightPhasesData: [{ phase: 'Taxi' }, { phase: 'Takeoff' }, { phase: 'Climb' }, { phase: 'Cruise' }, { phase: 'Landing' }], FLIGHT_PHASES: ['Taxi', 'Takeoff', 'Climb', 'Cruise', 'Landing'] };
  vm.createContext(ctx);
  ['_projectPhaseNames', '_validPhases', '_fhaPhaseGaps'].forEach(n => { const f = extractFn(ai, n); if (!f) throw new Error('missing ' + n); vm.runInContext(f, ctx); });
  const conds = [{ id: 'SF-001-TL', desc: 'Total loss of thrust' }, { id: 'SF-002-TL', desc: 'Total loss of reverse thrust' }, { id: 'SF-003-M', desc: 'Erroneous gear indication' }, { id: 'SF-004-PL', desc: 'never drafted' }];
  const acts = [
    { op: 'add_fha', srcCondId: 'SF-001-TL', phases: ['All phases'] },
    { op: 'add_fha', srcCondId: 'SF-002-TL', phases: ['Landing'] },
    { op: 'add_fha', srcCondId: 'SF-003-M', phases: ['Takeoff', 'climb'] },
    { op: 'add_fha', srcCondId: 'SF-003-M', phases: ['cruise', 'Landing'] },
    { op: 'add_fha', srcCondId: 'SF-003-M', phases: ['Taxi'] },
  ];
  ctx.conds = conds; ctx.acts = acts;
  const gaps = vm.runInContext("_fhaPhaseGaps(conds, acts, function (a) { return a && a.op === 'add_fha' ? a.srcCondId : null; })", ctx);
  check('"All phases" covers the profile; three rows that together cover every phase are complete (case-insensitive)', !gaps.some(g => g.key === 'SF-001-TL') && !gaps.some(g => g.key === 'SF-003-M'), JSON.stringify(gaps));
  check('a condition with only a Landing row is named with the four phases it never assessed', gaps.length === 1 && gaps[0].key === 'SF-002-TL' && gaps[0].missing.join() === 'Taxi,Takeoff,Climb,Cruise' && /SF-002-TL — Total loss of reverse thrust/.test(gaps[0].label), JSON.stringify(gaps));
  check('a condition with NO row is not a phase gap (that is the ordinary coverage miss)', !gaps.some(g => g.key === 'SF-004-PL'));
}

console.log('\n[3] the batch re-asks once and the panel says what is still missing');
{
  check('the FHA chunk config declares gapsOf', /gapsOf: function \(acts\) \{ return _fhaPhaseGaps\(picked, acts,/.test(ai));
  check('_anemBatch runs ONE follow-up turn for the unassessed phases and re-measures', /PHASES NOT YET ASSESSED — the rows returned for the conditions below do not cover every phase of the mission profile/.test(ai) && /const _a2 = await _anemRun\(_mkMessages\(_steer\), _sysExtra/.test(ai) && /try \{ _gaps = _chunk\.gapsOf\(actions\) \|\| \[\]; \} catch \(_\) \{\}/.test(ai) && /_coverage\.phaseGaps = _gaps\.map/.test(ai));
  check('… the follow-up asks for additional rows only, with the two "nothing has happened yet" cases spelled out', /return ONLY the ADDITIONAL add_fha rows that cover the phases named/.test(ai) && /do not repeat rows already returned/.test(ai));
  const ctx = { console, String, Array, Object, Math, _esc: (x) => String(x) };
  vm.createContext(ctx); vm.runInContext(extractFn(ai, '_coverageBanner'), ctx);
  const html = vm.runInContext("_coverageBanner({ total: 3, covered: 3, noun: 'failure condition', phaseGaps: ['SF-002-TL — Total loss of reverse thrust (Taxi, Takeoff, Climb, Cruise)'] })", ctx);
  check('the banner shows the phase gap beside "coverage complete" and does not claim every phase assessed', /Coverage complete/.test(html) && /Phases not assessed on 1 condition/.test(html) && /SF-002-TL — Total loss of reverse thrust \(Taxi, Takeoff, Climb, Cruise\)/.test(html) && !/every flight phase assessed/.test(html));
  const html2 = vm.runInContext("_coverageBanner({ total: 3, covered: 3, noun: 'failure condition', phaseGaps: [] })", ctx);
  check('… and says "every flight phase assessed" only when there are no gaps', /every flight phase assessed/.test(html2) && !/Phases not assessed/.test(html2));
}

console.log('\n[4] the executor never caps rows per condition');
{
  check('_fhaUpsert is keyed on condition + phase set — a different phase set for the same condition is a new row', /return r && String\(r\.sourceCondId \|\| ''\)\.trim\(\) === cond && _fhaPhaseKeyOf\(r\.phases\) === pk;/.test(ai) && /if \(!hit\) return \{ action: 'add' \};/.test(ai));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/**
 * Regression — WAQAS'S PHASE RULE + JUDGEMENT OVER ABSTENTION (3 Sep 2026).
 *
 * Rulings, verbatim in intent:
 *   · every failure condition applies to every flight phase; rows come from
 *     EFFECTS, not from phases — phases sharing an effect and class sit on ONE
 *     row; a second row only where effects (and so the class) genuinely differ.
 *   · unrealised + abortable = No Safety Effect; unrealised + not abortable =
 *     the END effect, per the certification basis (gear failure in cruise).
 *   · one worst-case row across all phases pins exposure at 1 — never do it.
 *   · thin information: JUDGE, flag it glaringly, file the note as an
 *     assumption the same way a human one is filed.
 *   · every AI assumption logged for the AFHA/SFHA reaches the FHA register.
 *   · a phase the model names that the project cannot hold must not vanish.
 * Run: node tests/regression_phase_rule_judgement.test.js
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const sk = fs.readFileSync(path.join(SITE, 'ai_skills.js'), 'utf8');
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

// ---- 1. the instructions say what Waqas said ---------------------------------
console.log('[1] the drafting instructions');
{
  check('every condition applies to every phase', /EVERY FAILURE CONDITION APPLIES TO EVERY FLIGHT PHASE/.test(sk));
  check('rows come from effects, not from phases', /ROWS COME FROM EFFECTS, NOT FROM PHASES/.test(sk));
  check('a second row only where effects AND class genuinely differ', /return a SECOND row for the same failure condition ONLY where the effects - and with them the class - genuinely differ/.test(sk));
  check('do not grind one condition against every phase into one row each', /Do not evaluate a condition against every phase and hand back one row per phase/.test(sk));
  check('abortable + unrealised = No Safety Effect', /can be aborted or the condition escaped, that phase is No Safety Effect/.test(sk));
  check('not abortable + unrealised = the END effect (the gear-in-cruise case)', /landing-gear failure in cruise/.test(sk) && /classify by the END EFFECT/.test(sk));
  check('the end effect is set by the certification basis in force', /set by the certification basis in force/.test(sk) && /Part 25 transport and a Part 23 aeroplane do not share a class/.test(sk));
  check('never the worst class of one phase on the row that lists every phase — exposure', /NEVER GIVE THE ROW THAT LISTS EVERY PHASE THE WORST CLASS OF ONE PHASE/.test(sk) && /pins that exposure to the whole flight/.test(sk));
  check('thin information: judge, do not abstain', /WHEN THE INFORMATION IS THIN, JUDGE - DO NOT ABSTAIN/.test(sk));
  check('a judgement is marked with judgementCall + a note saying what was assumed', /judgementCall: true and a judgementNote/.test(sk));
  check('the old "leave severity EMPTY rather than reaching" instruction is GONE', !/leave severity EMPTY rather than reaching for a plausible value/.test(sk));
  check('the old "classify per phase, then take the worst" instruction is GONE', !/CLASSIFY PER FLIGHT PHASE, THEN TAKE THE WORST/.test(sk));
  check('the levels tail judges instead of leaving empty (skill)', /set it by judgement and flag the row \(judgementCall \/ judgementNote\) rather than leaving it empty/.test(sk));
  check('the levels tail judges instead of leaving empty (inline copy in ai_assistant, byte-identical)', (ai.match(/set it by judgement and flag the row \(judgementCall \/ judgementNote\) rather than leaving it empty/g) || []).length === 1);
  check('the anchor is still required on a judged class', /on a row you have JUDGED rather than grounded, the anchor is still required/.test(sk));
  check('fha.draft and sfha.draft stamp as v7 — the body changed again', /'fha\.draft': 7,\s*\n\s*'sfha\.draft': 7,/.test(sk));
  // 4 Sep 2026 — golden run 1 flagged 121 of 129 rows, 18 of 22 hull-loss rows among them.
  // v6 never said what GROUNDED means, so the model flagged classification itself.
  check('v7 defines grounded: objective + failure + rubric + joint top step + ordinary reasoning', /A class is GROUNDED when it follows from the function objective/.test(sk));
  check('choosing the credited outcome is classification, not judgement', /Choosing the credited outcome IS classification, not judgement/.test(sk));
  check('the top step is never a judgement', /The top step is never a judgement/.test(sk));
  check('a judgement is a SPECIFIC missing fact the class turns on, named in the note', /A class is a JUDGEMENT when a SPECIFIC FACT it turns on is absent/.test(sk) && /Name that fact in judgementNote/.test(sk));
  check('a sheet flagged everywhere is called out as defeating the flag', /a sheet where nearly every row is flagged has flagged classification itself/.test(sk));
  check('the inline copy carries the same paragraph (byte parity is proven in regression_ai_skills)', /WHAT IS GROUNDED AND WHAT IS A JUDGEMENT/.test(ai));
  check('the returned row shape carries judgementCall / judgementNote', /"judgementCall": <true ONLY where you set a level or the class by judgement/.test(ai) && /"judgementNote": "<when judgementCall is true/.test(ai));
  check('the unified add_fha op spec asks for them too', /judgementCall\(true ONLY where a level or the class was set by judgement/.test(ai));
}

// ---- 2. the flag travels: parse → card → accept → row → register --------------
console.log('\n[2] the judgement travels the whole way');
{
  check('the parsed row carries judgementCall / judgementNote', /judgementCall: x\.judgementCall === true \|\| String\(x\.judgementCall\)\.toLowerCase\(\) === 'true'/.test(ai) && /judgementNote: String\(x\.judgementNote \|\| ''\)\.trim\(\)\.slice\(0, 600\)/.test(ai));
  check('the review card shows the amber badge and the note BEFORE accept', /const _judge = \(op === 'add_fha' && a\.judgementCall === true\)/.test(ai) && /Judgement call on limited information:/.test(ai));
  check('the review panel header counts judgement rows', /classified by JUDGEMENT on limited information/.test(ai));
  check('accept persists the flag on the row', /judgementCall: !!s\.judgementCall,\s*\n\s*judgementNote: String\(s\.judgementNote \|\| ''\)/.test(ai));
  check('accept files the note as an assumption of type judgement', /type: 'judgement', appliesTo: 'all'/.test(ai) && /judgement: 'AI judgement'/.test(ai));
  check('accept shouts it in the comments column too', /⚠ JUDGEMENT CALL — classified on limited information; engineer to confirm/.test(ai));
  check('the action executor passes the flag AND the assumptions through (the Vayu gap)', /judgementCall: a\.judgementCall === true, judgementNote: a\.judgementNote, _assumptions: Array\.isArray\(a\._assumptions\)/.test(ai));
  check('the panel per-item accept attaches the batch assumptions to the action', /a\._assumptions = _assumptionsFor\(_batchAsms, String\(a\.fcDesc \|\| ''\)\.trim\(\), \[a\.subId, a\.srcCondId\]\)/.test(ai));
  check("a protected row is reported as blocked, not as 'add_fha failed'", /edited by hand — not overwritten; newer draft noted on it/.test(ai));
}

// ---- 3. EXECUTED: the AI ticks the mission profile's boxes, never invents one ----
console.log('\n[3] executed — phases are the mission profile\'s checkboxes (Waqas, 4 Sep 2026)');
{
  const ctx = { console, String, Array, Boolean, RegExp };
  vm.createContext(ctx);
  vm.runInContext('function _projectPhaseNames(){ return ["Takeoff","Initial Climb","Cruise","Landing"]; }\n' + extractFn(ai, '_validPhases') + '\n_validPhases.lastDropped = []; _validPhases.lastUnlisted = [];', ctx);
  const o = JSON.parse(vm.runInContext('JSON.stringify({ kept: _validPhases(["Takeoff","Initial climb","initial-climb","Hover","Cruise","Transition"]), unlisted: _validPhases.lastUnlisted, dropped: _validPhases.lastDropped })', ctx));
  check('a spelling that differs only by case/hyphen ticks the EXISTING box, in the profile\'s spelling', o.kept.indexOf('Initial Climb') >= 0 && o.kept.indexOf('Initial climb') < 0, o.kept.join(','));
  check('… and two spellings of one box tick it ONCE', o.kept.filter(x => x === 'Initial Climb').length === 1);
  check('a value that matches no box is NOT written as a phase (the AI never adds a phase to a project)', o.kept.indexOf('Hover') < 0 && o.kept.indexOf('Transition') < 0 && o.kept.join(',') === 'Takeoff,Initial Climb,Cruise', o.kept.join(','));
  check('… and is recorded so the row comment can name it for the engineer', o.unlisted.join(',') === 'Hover,Transition', o.unlisted.join(','));
  check('lastDropped stays empty for old readers', o.dropped.length === 0);
  const b = JSON.parse(vm.runInContext('JSON.stringify({ kept: _validPhases("cruise, Landing"), unlisted: _validPhases.lastUnlisted })', ctx));
  check('a string list comes back as a string in the profile\'s spelling, with no stale unlisted value', b.kept === 'Cruise, Landing' && b.unlisted.length === 0, JSON.stringify(b));
  check('the accepted row carries unlistedPhases and the comment names them as NOT in the mission profile', /unlistedPhases: \(function \(\) \{ const d = \(_validPhases\.lastUnlisted \|\| \[\]\)\.slice\(\)/.test(ai) && /⚠ PHASE NOT IN MISSION PROFILE — the AI named /.test(ai) && !/PHASES DROPPED/.test(ai));
  check('the review card says an off-profile value will not be ticked (never "will be dropped", never "kept as named")', /it will not be ticked; the row comment will name it/.test(ai) && !/will be dropped on accept/.test(ai) && !/kept on the row as named/.test(ai));
  check('the drafting instruction says: tick existing boxes, never name a phase of your own', /ticking existing boxes, never naming a phase of your own/.test(ai) && !/any value outside the list is discarded/.test(ai));
}

// ---- 4. EXECUTED: every AI assumption for the FHA reaches the register ---------
console.log('\n[4] executed — the ledger sweep');
{
  const ctx = { console, String, Array, Boolean };
  ctx.window = {
    SafetyLabAiAssumptions: { list: () => [
      { id: 'L1', analysis: 'fha.populate',  text: 'Crew detects via EICAS', type: 'operational', promotedTo: '' },
      { id: 'L2', analysis: 'fha.populate',  text: 'Already promoted',       type: 'other',       promotedTo: 'ASM-AC-004' },
      { id: 'L3', analysis: 'sfha.populate', text: 'Sys-scoped premise',     type: 'design',      promotedTo: '', systemId: 'NAV' },
      { id: 'L4', analysis: 'sfha.populate', text: 'Other system premise',   type: 'design',      promotedTo: '', systemId: 'HYD' },
      { id: 'L5', analysis: 'chat.edit',     text: 'Not an FHA premise',     type: 'other',       promotedTo: '' },
      { id: 'L6', analysis: 'fmea.item',     text: 'FMEA premise',           type: 'other',       promotedTo: '' },
    ] }
  };
  let seen = null;
  ctx._promoteDeclaredAssumptions = (list) => { seen = list; return list.map((_, i) => 'ASM-' + i); };
  vm.createContext(ctx);
  vm.runInContext(extractFn(ai, '_promoteLedgerForFha'), ctx);
  vm.runInContext('_promoteLedgerForFha(false, null, "test-model")', ctx);
  check('aircraft scope promotes ONLY the unpromoted fha.* entries', seen && seen.length === 1 && seen[0].text === 'Crew detects via EICAS', JSON.stringify(seen && seen.map(x => x.text)));
  check("… never an 'sfha.' entry (prefix 'fha.' does not match 'sfha.populate')", seen && !seen.some(x => /Sys-scoped|Other system/.test(x.text)));
  check('… never chat / FMEA premises', seen && !seen.some(x => /Not an FHA|FMEA premise/.test(x.text)));
  check('… and carries the ledger id so the entry is marked promoted', seen && seen[0]._ledgerId === 'L1');
  seen = null;
  vm.runInContext('_promoteLedgerForFha(true, { id: "NAV" }, "test-model")', ctx);
  check("system scope promotes that system's sfha entries only", seen && seen.length === 1 && seen[0].text === 'Sys-scoped premise', JSON.stringify(seen && seen.map(x => x.text)));
  check('the sweep runs after every successful accept, both scopes', /_promoteLedgerForFha\(false, null, s\._model\)/.test(ai) && /_promoteLedgerForFha\(true, sys, s\._model\)/.test(ai));
}

// ---- 5. EXECUTED: an assumption links to a row only when it NAMES it ----------------
console.log('\n[5] executed — assumptions link by name, never by default');
{
  const ctx = { console, String, Array };
  vm.createContext(ctx);
  vm.runInContext(extractFn(ai, '_assumptionsFor'), ctx);
  const list = JSON.stringify([
    { text: 'A unscoped' },
    { text: 'B all', appliesTo: 'all' },
    { text: 'C named in appliesTo', appliesTo: ['Loss of braking'] },
    { text: 'D named in usedFor', usedFor: 'Loss of braking (both sub-functions)' },
    { text: 'E names another', appliesTo: ['Loss of thrust'] },
    { text: 'F names the sub-function id', usedFor: 'SF-003 rows' }
  ]);
  const r = JSON.parse(vm.runInContext('JSON.stringify(_assumptionsFor(' + list + ', "Loss of braking", ["SF-003", ""]).map(function (a) { return a.text[0]; }))', ctx));
  check('unscoped and "all" assumptions do NOT attach to every row (the 91-per-row bug)', !r.includes('A') && !r.includes('B'), r.join(''));
  check('an assumption naming the condition in appliesTo attaches', r.includes('C'));
  check('an assumption naming it in the free-text usedFor attaches', r.includes('D'));
  check('an assumption naming a DIFFERENT condition does not', !r.includes('E'));
  check('an assumption naming the sub-function id attaches via the extra keys', r.includes('F'));
  const none = JSON.parse(vm.runInContext('JSON.stringify(_assumptionsFor(' + list + ', "", []))', ctx));
  check('a row with no usable key links nothing rather than everything', none.length === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

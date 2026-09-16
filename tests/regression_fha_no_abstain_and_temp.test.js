#!/usr/bin/env node
/*
 * Regression — the FHA lanes judge instead of abstaining, and a dropped
 * sampling temperature is no longer silent. (5 Sep 2026)
 *
 * WHY BOTH LIVE IN ONE FILE: they are the two halves of the same evening's
 * finding. An end-to-end read of the AI path found that (a) the FHA prompt
 * told the model to abstain and to judge in the SAME assembled request, and
 * (b) the temperature-0 change made that morning never reached the model at
 * all. Both were invisible, and both sat directly under the consistency number
 * the project is trying to move.
 *
 * (a) THE CONTRADICTION. _ABSTAIN_RULE says an ungrounded field "must be
 *     returned as an EMPTY STRING" and that a blank "is a GOOD outcome". The
 *     shipped fha.draft skill body says "WHEN THE INFORMATION IS THIN, JUDGE -
 *     DO NOT ABSTAIN", because "an empty level silently drops the row from
 *     every downstream check". Which one the model followed on a given turn
 *     was not decided by any code.
 *     Waqas, 5 Sep: "the abstain instruction needs to be removed, we have
 *     judgement call flags now."
 *     SCOPE, on his ruling after the evidence was put to him: the FHA and SFHA
 *     ONLY. They are the only 2 of the 25 registered skills whose body carries
 *     the judgementCall / judgementNote contract. The other 23 KEEP
 *     _ABSTAIN_RULE — stripping it there would trade a visible blank for a
 *     silent guess, which is the failure mode the rule was written for, and the
 *     E2 evidence records that forced commitment landed near a coin flip.
 *
 * (b) THE SILENT DROP. Anthropic deprecated temperature on Opus 4.7+; sending
 *     it returns 400, so AiClient correctly omits it. The default drafting
 *     model is claude-opus-4-8. So "every analytical drafter samples at
 *     temperature 0" was true of the client and false of the wire, and three
 *     paid identical-input draws (e1/e2/e3, ~$15 and ~9 minutes each) were
 *     scored believing otherwise. Omitting stays correct; doing it silently
 *     does not. The per-call audit record now carries temperatureAsked and
 *     temperatureApplied.
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const ai = S('ai_assistant.js');
const core = S('core_modules.js');
const skills = S('ai_skills.js');

console.log('\n[abstain] the FHA lanes carry ONE instruction, not two');

// The rule still exists — this is a scoping change, not a deletion.
check('_ABSTAIN_RULE is still defined for the lanes that need it',
      /const _ABSTAIN_RULE = \[/.test(ai));
check('_ABSTAIN_RULE is still used by other lanes',
      (ai.match(/_ABSTAIN_RULE/g) || []).length >= 5,
      (ai.match(/_ABSTAIN_RULE/g) || []).length + ' references');

// The classic AFHA/SFHA system prompt must not inject it.
const fhaPrompt = ai.slice(ai.indexOf('function _fhaSystemPrompt'), ai.indexOf('function _fhaSystemPrompt') + 14000);
check('_fhaSystemPrompt does NOT inject _ABSTAIN_RULE', !/^\s*_ABSTAIN_RULE,\s*$/m.test(fhaPrompt));

// The severity rules must ask for a flagged judgement, not a blank.
check('rule 2b asks for a flagged judgement, not an empty severity',
      /2b\. WHEN THE INFORMATION IS THIN, JUDGE/.test(ai) && /judgementCall: true/.test(fhaPrompt));
check('rule 2b no longer orders an EMPTY STRING severity',
      !/Return severity as an EMPTY STRING/.test(ai));
check('rule 2c no longer lets a level stay EMPTY',
      !/A level you cannot ground stays EMPTY/.test(ai));
check('rule 2c routes an ungrounded level to judgement + flag',
      /A level you cannot ground from the context is set by JUDGMENT/.test(ai));
check('the unified FHA directive no longer orders an EMPTY STRING severity',
      !/emit the row with severity as an EMPTY STRING/.test(ai));
check('the unified FHA directive asks for judgementCall instead',
      /do NOT return a blank: make the call an experienced safety engineer would make/.test(ai));

// The batch: FHA excluded, everything else still carries it.
// Pin the WIRING, not the names. An earlier draft of this check asserted only
// that _isFhaLane and _abstainForLane appeared somewhere in the file, and a
// mutation replacing the condition with `false ?` sailed through it — both
// identifiers were still present. A check satisfied by the wrong evidence is
// not a check (same lesson as the ship.sh anchor pins in regression_wall_hygiene).
check('the batch gates the rule ON the lane test, not merely near it',
      /const _abstainForLane = _isFhaLane \? '' : \('\\n\\n' \+ _ABSTAIN_RULE\);/.test(ai));
check('the gated value is what reaches the context assembler',
      /_assembleAnalysisContext\(cfg\.analysis \|\| '', String\(cfg\.systemExtra \|\| ''\) \+ _abstainForLane,/.test(ai));
check('the lane test matches fha and sfha and nothing else', /\/\^s\?fha\$\/i/.test(ai));

// The skill body — the side of the contradiction that WINS — is untouched.
check('the skill body still carries the judge-do-not-abstain contract',
      /WHEN THE INFORMATION IS THIN, JUDGE - DO NOT ABSTAIN/.test(skills));
check('the skill body still carries the judgementCall/judgementNote contract',
      /judgementCall: true and a judgementNote/.test(skills));

// Only fha.draft and sfha.draft may lose the rule, because only they replace it.
const sharedUsers = (skills.match(/'([a-z]+\.[a-z]+)':\s*_BODIES_FHA_SHARED/g) || []).map(x => x.split("'")[1]);
check('exactly two skills carry the FHA judgement contract', sharedUsers.length === 2, sharedUsers.join(', '));
check('they are fha.draft and sfha.draft',
      sharedUsers.includes('fha.draft') && sharedUsers.includes('sfha.draft'));

console.log('\n[temperature] a dropped sampling temperature is recorded, never silent');

// Extract and execute the REAL predicate rather than asserting on its source.
const m = core.match(/function _modelAcceptsTemperature\(model\)\{[\s\S]*?\n    \}/);
check('_modelAcceptsTemperature present in source', !!m);
let accepts = () => true;
if (m) accepts = new Function('return (' + m[0] + ')')();

check('claude-opus-4-8 (the shipped default) does NOT accept temperature', accepts('claude-opus-4-8') === false);
check('claude-opus-4-7 does not accept it either', accepts('claude-opus-4-7') === false);
check('claude-opus-4-6 still accepts it', accepts('claude-opus-4-6') === true);
check('sonnet 4.5 still accepts it', accepts('claude-sonnet-4-5') === true);
// 16 Sep 2026 — observed live: claude-sonnet-4-6 returns 400 "temperature is deprecated for this
// model". The retry rescued the call, so the model never got a temperature either way; the cost was
// a doubled 130 KB upload on EVERY AI call. The predicate has to know, not the retry.
check('claude-sonnet-4-6 does NOT accept temperature', accepts('claude-sonnet-4-6') === false);
check('a future sonnet does not either', accepts('claude-sonnet-5-0') === false);
check('haiku is untouched', accepts('claude-haiku-4-5-20251001') === true);

check('the client records the temperature it asked for', /_tempAsked/.test(core));
check('the client records whether it was applied', /_tempApplied/.test(core));
check('both reach the per-call audit record',
      /temperatureAsked: _tempAsked, temperatureApplied: _tempApplied/.test(core));
const logCalls = (core.match(/temperatureAsked: _tempAsked/g) || []).length;
check('every messages() audit path carries them (success and both failures)', logCalls >= 3, logCalls + ' call sites');

// The lever's own comment must not still claim an effect it does not have.
check('_featureTemp says what is ASKED for, not what the model receives',
      /analytical drafting ASKS for 0\.0/.test(ai));
check('the false premise in the severity-anchor block is corrected',
      !/The model classifies at temperature > 0, so a condition re-drafted/.test(ai));


// ---- the learned deny list --------------------------------------------------------------------
// 16 Sep 2026, customer-path run: the HL-1 demo project is configured for claude-fable-5, an id
// carrying neither an "opus-N-N" nor a "sonnet-N-N" token, so the family predicate passed it, the
// request took a 400 and the self-heal retry re-uploaded 130 KB. Widening the family list would
// only defer the same failure to the next unforeseen id, so the retry has to REMEMBER. These
// checks pin that it does: the memory exists, it is consulted before the parameter is attached,
// the 400 handler writes to it, and it survives a page load.
console.log('\n[temperature] the retry learns, so an unknown model costs one round-trip, not every one');

check('the family predicate is documented as a fast path only, not the whole rule',
      /fast path, and a fast path is all they can ever be/.test(core));
check('claude-fable-5 gets past the family rules (which is the point of the deny list)',
      accepts('claude-fable-5') === true);
check('a persisted deny list exists', /_TEMP_DENY_KEY = 'safetyLab\.ai\.temperatureDeprecated'/.test(core));
check('the parameter is attached only when BOTH the family rules and the deny list allow it',
      /const _tempApplied = _modelAcceptsTemperature\(model\) && !_tempDenied\(model\);/.test(core));
check('the 400 handler records the model before retrying',
      /_denyTemperature\(model\);[\s\S]{0,120}delete body\.temperature;/.test(core));

// Execute the real helpers against a stub localStorage: the memory has to persist, and it has to
// survive storage being unavailable (private mode, blocked site data) without taking the app down.
const helpers = core.match(/var _TEMP_DENY_KEY[\s\S]*?\n    function _denyTemperature\(model\)\{[\s\S]*?\n    \}/);
check('the helpers are extractable as a unit', !!helpers);
if (helpers) {
  const mk = (store) => new Function('localStorage', helpers[0] + '; return { denied: _tempDenied, deny: _denyTemperature };')(store);
  const mem = {};
  const ls = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  const a = mk(ls);
  check('an unknown model is not denied to begin with', a.denied('claude-fable-5') === false);
  a.deny('claude-fable-5');
  check('after a 400 it is denied', a.denied('claude-fable-5') === true);
  check('other models are unaffected', a.denied('claude-sonnet-4-5') === false);
  const b = mk(ls);   // a fresh page load, same storage
  check('the memory survives a reload, so the cost is once per model per install, not once per session',
        b.denied('claude-fable-5') === true);
  const boom = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const c = mk(boom);
  let threw = false;
  try { c.deny('claude-fable-5'); c.denied('claude-fable-5'); } catch (_) { threw = true; }
  check('storage being blocked degrades to the family rules, it does not throw', threw === false);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/*
 * Regression — hfa.draft, the Human Factors lane's first AI assist.
 *
 * WHY THIS LANE WAS EMPTY UNTIL NOW, AND WHY THAT WAS NOT NEGLECT. Almost
 * everything an HF assist could plausibly offer is forbidden by the lane's own
 * doctrine. Task time is elicited and measured — "presets seed, never fill".
 * A workload band drives BAND_TO_SEV and therefore raises or silences severity
 * findings. The credited/uncredited posture is a classification. Co-activation
 * "is an assumption, never a solver". Ergonomics refuses uncited coefficients on
 * principle. Strip all of that out and what remains is narrow — which is exactly
 * why it is worth shipping, and why these checks are mostly about what the
 * feature REFUSES to do.
 *
 * THE SHAPE OF THE FEATURE:
 *
 *   1. THE MODEL DOES NOT CHOOSE WHAT MATTERS. Candidates come from a
 *      deterministic sweep: a failure condition whose crew-effect text relies on
 *      a person, with no HF-typed assumption resting on it, is an unregistered
 *      crew credit. A model selecting which failure conditions are
 *      safety-significant would be a model writing the safety argument.
 *
 *   2. THE MODEL DRAFTS A SENTENCE AND ONE THREE-WAY CLASSIFICATION. Statement,
 *      direction, and — only when the source text names them — crewmember and
 *      response phase.
 *
 *   3. EVERY MEASURED QUANTITY IS LEFT BLANK, AND THAT IS ENFORCED IN CODE.
 *      A rule that lives only in the prompt is a request. _applyHfAsm builds the
 *      hf object from three fields and deletes the forbidden ones regardless of
 *      what came back.
 *
 *   4. THE ASSUMPTION IS LINKED TO ITS FAILURE CONDITION. assumption_moat flags
 *      an assumption nothing rests on as DECORATIVE. An unlinked crew-credit
 *      assumption is precisely the thing this feature exists to stop existing.
 *
 * Run: node tests/regression_hf_ai_assist.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
const badges = fs.readFileSync(path.join(SITE, 'ai_badges.js'), 'utf8');
const idx = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

const grab = (re) => (ai.match(re) || [''])[0];
const sweep  = grab(/function _hfCandidates\(\)[\s\S]*?\n    \}/);
const apply  = grab(/function _applyHfAsm\(x\)[\s\S]*?\n    \}\n\n    async function draftHfAssumptions/);
const prompt = grab(/function _hfSystemPrompt\(\)[\s\S]*?\n    \}/);
const run    = grab(/async function draftHfAssumptions\(\)[\s\S]*?\n    \}\n/);
const credits = grab(/function _creditsCrew\(t\)[\s\S]*?\n    \}/);

// ---- [1] the model does not choose what matters -----------------------------
console.log('\n[hfa] candidate selection is deterministic');
check('_hfCandidates exists and is a plain sweep', sweep.length > 400);
check('it walks both scopes', /acFhaData/.test(sweep) && /systemsData/.test(sweep));
check('it excludes failure conditions that already carry an HF-typed assumption',
  /alreadyCovered/.test(sweep) && /a\.type === 'hf'/.test(sweep));
check('coverage is judged through the TYPED projection',
  /asmAllTyped/.test(sweep),
  'asmAll() carries no type, so every FC would look uncovered and the sweep would re-draft forever');
check('the sweep is exposed for QA without going near a model',
  /hfCandidates: _hfCandidates/.test(ai));
check('no model call happens before candidates are chosen',
  run.indexOf('_hfCandidates()') < run.indexOf('Provider.complete'),
  'asking the model which failure conditions matter would be asking it to write the safety argument');
check('an empty sweep says so and stops rather than prompting',
  /No unregistered crew credit found/.test(run) && /if \(!cands\.length\)/.test(run));

// ---- [2] the sweep, executed ------------------------------------------------
console.log('\n[hfa] the sweep, executed');
{
  const sb = { console, String, Array, Object, JSON };
  sb.window = sb; sb.globalThis = sb;
  sb.acFhaData = [
    { internalId: 1, fcId: 'FC-01', fcDesc: 'Runaway trim',    severity: 'Hazardous',    effCrew: 'Crew applies manual reversion',            assumptionIds: [] },
    { internalId: 2, fcId: 'FC-02', fcDesc: 'Spar rupture',    severity: 'Catastrophic', effCrew: 'Structural failure; no crew action available', assumptionIds: [] },
    { internalId: 3, fcId: 'FC-03', fcDesc: 'Display dimming', severity: 'Minor',        effCrew: 'Slight increase in crew workload',         assumptionIds: ['ASM-AC-009'] },
    { internalId: 4, fcId: 'FC-04', fcDesc: 'Bleed leak',      severity: 'Major',        effCrew: '',                                         assumptionIds: [] },
    { internalId: 5, fcId: 'FC-05', fcDesc: 'Nav degrade',     severity: 'Major',        effCrew: 'PM cross-checks raw data',                 assumptionIds: ['ASM-AC-002'] }
  ];
  sb.systemsData = [{ id: 'sys-1', name: 'Flight Controls', fha: [
    { internalId: 11, fcId: 'FC-FCS01', fcDesc: 'Actuator jam', severity: 'Major', effCrew: 'PF disengages autopilot', assumptionIds: [] }] }];
  sb.HF_ASSUMPTIONS = { asmAllTyped: () => [{ asmId: 'ASM-AC-009', type: 'hf', hf: {} }, { asmId: 'ASM-AC-002', type: 'dz', hf: null }] };
  vm.createContext(sb);
  vm.runInContext([credits, sweep, 'globalThis._c=_creditsCrew; globalThis._s=_hfCandidates;'].join('\n'), sb);

  check('text that names the crew counts as a credit', sb._c('Crew applies manual reversion') === true);
  check('vague-but-real load counts too', sb._c('Increased workload') === true,
    'hf_severity_check\'s _bandFromText drops these because it cannot GRADE them — but ungraded reliance is still reliance');
  check('unrelated prose does not', sb._c('Cabin altitude rises') === false);
  check('empty crew effect does not', sb._c('') === false);

  const got = sb._s().map(x => x.fcId);
  check('an unregistered crew credit is picked up', got.indexOf('FC-01') >= 0);
  check('a failure condition already carrying an HF assumption is skipped', got.indexOf('FC-03') < 0);
  check('one carrying a NON-HF assumption is still picked up', got.indexOf('FC-05') >= 0,
    'a Design assumption does not register crew credit — this is the case a naive "has any assumption" test would miss');
  check('one with no crew effect at all is skipped', got.indexOf('FC-04') < 0);
  check('system-scope failure conditions are swept too', got.indexOf('FC-FCS01') >= 0);
  check('the system candidate carries its system identity',
    sb._s().filter(x => x.scope === 'SFHA').every(x => x.systemId === 'sys-1' && x.systemName === 'Flight Controls'));
  check('a condition the analysis says the crew CANNOT recover is still swept',
    got.indexOf('FC-02') >= 0,
    'that claim is itself an assumption about people, and the pessimistic ones are the ones nobody writes down');
}

// ---- [3] what it refuses to supply — enforced, not requested ----------------
console.log('\n[hfa] the forbidden fields');
check('the forbidden list exists in code', /_HF_FORBIDDEN = \['taskTimeS', 'taskTimeBasis', 'workloadBand', 'coActivation', 'channels'\]/.test(ai));
check('the hf object is BUILT from three fields, not copied from the model',
  /const hf = \{ direction: dir \};/.test(apply),
  'copying the model\'s object and deleting keys would let an unforeseen field through');
check('and the forbidden keys are stripped anyway',
  /_HF_FORBIDDEN\.forEach\(function \(k\) \{ try \{ delete hf\[k\]; \}/.test(apply),
  'belt and braces — a rule enforced only in the prompt is a request');
['taskTimeS', 'taskTimeBasis', 'workloadBand', 'coActivation', 'channels'].forEach(f => {
  check('the prompt also forbids ' + f + ' explicitly',
    new RegExp(f === 'taskTimeS' ? 'task time' : f === 'taskTimeBasis' ? 'basis or citation' :
               f === 'workloadBand' ? 'workload band' : f === 'coActivation' ? 'Co-activation|co-activation' : 'channels').test(prompt));
});
check('the prompt explains the cost of emitting them anyway',
  /stripped before anything is written, so emitting them only costs you output/.test(prompt));
check('no credited/uncredited posture is ever written',
  !/credited/.test(apply.replace(/\/\/[^\n]*/g, '')),
  'what the crew action buys is a severity claim, and the model does not make classifications here');
check('the reason each ban exists is recorded next to the feature',
  /presets SEED and never FILL/.test(ai) && /hand that authority\s*\n\s*\/\/\s*straight back to a guess/.test(ai));

// ---- [4] the fields it DOES write are validated -----------------------------
console.log('\n[hfa] validation of the three drafted fields');
check('direction is checked against the closed list',
  /_HF_DIRECTIONS\.indexOf\(String\(x\.direction \|\| ''\)\.toLowerCase\(\)\) >= 0/.test(apply));
check('the list is exactly the three hfaItems() branches',
  /_HF_DIRECTIONS = \['recovery', 'non-recovery', 'workload'\]/.test(ai),
  'a fourth value produces no HFA work item at all — the shipped demos already carry that bug with "prevention"');
check('an off-list direction falls back rather than being written through',
  /: 'recovery';/.test(apply));
check('responsePhase must be one of THIS project\'s phases',
  /_hfPhaseNames\(\)\.indexOf\(ph\) >= 0/.test(apply),
  'an off-list phase renders as "(not a phase)" and matches no window');
check('the prompt refuses to convert exposure phases into a response phase',
  /The phases a failure condition is EXPOSED in are not the phase the crew responds in/.test(prompt),
  'the register refuses that inference everywhere else; the drafter must not sneak it in');
check('crewmember is echoed, never inferred',
  /Do NOT infer who would most likely do it/.test(prompt),
  'INV-17 groups on the exact string, so an invented "PF" silently creates a second crewmember');
check('the statement is forbidden from carrying a number',
  /NEVER put a number, a duration or a time window in it/.test(prompt));
check('the abstention rule is applied to this feature', /_ABSTAIN_RULE/.test(prompt));
check('an empty crewmember or phase is framed as a GOOD answer',
  /is a GOOD answer when the text does not name one/.test(prompt));

// ---- [5] state, linkage, provenance ----------------------------------------
console.log('\n[hfa] what lands in the register');
check('the assumption is always Proposed', /state: 'Proposed',/.test(apply));
check('and the reason is written down', /never Validated — nothing automated validates/.test(apply));
check('it is typed Human Factors', /type: 'Human Factors'/.test(apply));
check('the origin records which failure condition it came from',
  /origin: 'AI · HFA draft from '/.test(apply));
check('it is LINKED back to its failure condition',
  /f\.assumptionIds\.push\(asmId\)/.test(apply),
  'assumption_moat flags an assumption nothing rests on as DECORATIVE');
check('a failed link is reported rather than passing silently',
  /could not be re-found to link it — link it by hand/.test(apply),
  'an unlinked crew-credit assumption is the exact thing this feature exists to prevent');
check('provenance is stamped', /aiGenerated: true, aiFeature: 'hfa\.draft'/.test(apply));
check('aircraft and system scope use their own counters',
  /ASM-AC-' \+ String\(acAsmCounter\+\+\)/.test(apply) && /ASM-SYS-' \+ String\(sy\.asmCounter\+\+\)/.test(apply));
check('a system that has since been deleted is refused, not guessed at',
  /is no longer in the project/.test(apply));
check('a row whose failure condition did not match is DROPPED, not shown',
  /\.filter\(function \(x\) \{ return !!x\._cand; \}\)/.test(run),
  'unlike an architecture recommendation this one WRITES to the register, so an unmatched row has nowhere legitimate to go');

// ---- [6] the panel ----------------------------------------------------------
// ---- [5b] the prose is grounded in the standards ----------------------------
// Requested mid-build, and the source documents (NASA/SP-2010-3407 Rev 1 and
// NASA-HDBK-8709.25) were supplied, so this is grounded in the handbook text
// rather than in a paraphrase of it.
console.log('\n[hfa] the prose is grounded, not free-form');
check('the statement must use HIDH\'s own task decomposition',
  /HIDH §5\.7\.4\.2\.2/.test(prompt) && /PERCEPTION, COGNITION and RESPONSE/.test(prompt),
  'HIDH characterises a task by its reliance on those three; a sentence that hides them cannot be timed or workload-rated');
check('it demands detect / identify / do explicitly',
  /what the crew must DETECT/.test(prompt) && /IDENTIFY or DECIDE/.test(prompt) && /what they must DO/.test(prompt));
check('it contrasts an unusable sentence with a measurable one',
  /The crew handles the failure" is unusable/.test(prompt) && /is a task somebody can measure/.test(prompt),
  'an abstract rule about specificity gets ignored; a worked pair does not');
check('the ban on times is justified from the Red Line definition, not asserted',
  /proportion of AVAILABLE time a task occupies \(Parks & Boucek 1989 put it at 80%\)/.test(prompt),
  'HIDH §5.7.5.1 defines the limit as a RATIO to a window — which is why a bare duration is meaningless here');
check('and it says why a fabricated number is worse than none',
  /it will be read as elicited/.test(prompt));

console.log('\n[hfa] citations are closed-list, not free text');
check('the citable set is declared in code', /_HF_BASES = \[/.test(ai));
check('it names the HIDH clauses the product actually implements',
  /HIDH §5\.7\.5\.1 time-occupancy Red Line \(Parks & Boucek 1989\)/.test(ai) &&
  /AC 25\.1309 crew-workload severity language/.test(ai));
check('CS 25.1302 is explicitly EXCLUDED, with the reason recorded',
  /Deliberately excludes CS 25\.1302/.test(ai) && /grounding in a marketing\s*\n\s*\/\/ line/.test(ai),
  'it appears once in the repo as a catalogue string — no module cites it, no check implements it');
check('the prompt tells the model the list is closed and why',
  /the only references this product actually implements/.test(prompt) && /including CS 25\.1302, is not carried here/.test(prompt));
check('an off-list basis is DROPPED at apply time, not written through',
  /const sbOk = \(_HF_BASES\.indexOf\(sb\) >= 0\) \? sb : '';/.test(apply),
  'a citation nobody can follow back is worse than none');
check('an accepted basis is recorded on the assumption\'s origin',
  /framed per ' \+ sbOk/.test(apply));
check('an empty basis is offered as the honest option',
  /return an empty string rather than decorating it with a citation/.test(prompt));
check('the card shows when NO basis was claimed',
  /no standard basis claimed for the framing/.test(run),
  'silence about the grounding would read as grounded');

console.log('\n[hfa] the shipped HF corpus reaches the request');
check('the HF knowledge base is retrieved into the prompt',
  /_ftaKbBlock\(_kbQuery, 6, 'hf'\)/.test(run));
check('the query is built from the crew-effect text actually being reasoned about',
  /cands\.slice\(0, 12\)\.map\(function \(c\) \{ return c\.effCrew; \}\)/.test(run),
  'a generic query returns generic chunks and grounds nothing in particular');
check('there is an HF-specific retrieval header, not the FTA one',
  /mode === 'hf'/.test(ai) && /human-factors material retrieved for THIS task/.test(ai),
  'the FTA header tells the model the material is fault-tree method — wrong instruction for this lane');
check('the header tells it to leave gaps empty rather than fill from memory',
  /leave that field empty rather than filling it from memory/.test(ai));

// The source PDF corrected a claim the code was making about itself.
console.log('\n[hfa] a provenance claim the source document did not support');
{
  const hfa = fs.readFileSync(path.join(SITE, 'hf_assumptions.js'), 'utf8');
  check('the channel list no longer claims to BE HIDH\'s channel decomposition',
    !/HIDH sensory\/response channels \(§5\.7, workload channel decomposition\)/.test(hfa));
  check('it names the seven HIDH actually defines',
    /visual,\s*\n?\s*\/\/ auditory, TACTILE, cognitive, FINE MOTOR, GROSS MOTOR and VOICE RESPONSE/.test(hfa) ||
    /TACTILE/.test(hfa) && /GROSS MOTOR/.test(hfa) && /VOICE RESPONSE/.test(hfa));
  check('and says which clause to read before widening it', /§5\.7\.4\.2\.3/.test(hfa));
  check('the five values are UNCHANGED — the citation was wrong, not the data',
    /const HF_CHANNELS = \['visual', 'auditory', 'cognitive', 'psychomotor', 'verbal'\];/.test(hfa),
    'projects carry authored values on these; a migration would rewrite analyst judgements');
}

console.log('\n[hfa] the panel');
check('editable fields are declared, so the edit gate and coverage both work',
  /editableFields: \[\{ key: 'statement'/.test(run));
check('Accept is wired', /onAccept: _applyHfAsm/.test(run));
check('the disclaimer states what is deliberately left empty',
  /deliberately <b>left empty<\/b>/.test(run));
check('and that nothing here validates anything', /Nothing here validates anything/.test(run));
check('the card shows the crew-effect text the draft came from',
  /Crew effect on the FHA row/.test(run),
  'the engineer has to be able to check the draft against its source without leaving the panel');
check('the card names what is still owed', /Left for you: task time · its basis · workload band · credited\/uncredited posture/.test(run));
check('a non-recovery draft explains why it is worth challenging',
  /the assumption is that pessimism, and it is worth challenging/.test(run));
check('abstention chips render', /_abstainChips\(x, \{ crewmember:/.test(run));

// ---- [7] REACHABILITY -------------------------------------------------------
console.log('\n[hfa] the path the product actually takes');
check('the feature is reachable from the AI menu',
  /run: function \(\) \{ return draftHfAssumptions\(\); \}/.test(ai));
check('it does NOT short-circuit into the unified engine',
  !/_useUnifiedFeatures/.test(run) && !/_useUnifiedFeatures/.test(apply),
  'if this is ever unified, the deterministic sweep and the forbidden-field stripping must be carried into _anemBatch — neither travels automatically');
check('it is exposed on the public API', /draftHfAssumptions: draftHfAssumptions/.test(ai));

console.log('\n[hfa] wiring');
check('the feature has a cost-map entry', /'hfa\.draft': 1/.test(ai));
check('and a busy label', /'hfa\.draft': 'registering crew credit'/.test(ai));
check('and a standards spec', /_SPEC_HFA/.test(ai) && /'hfa\.draft': _SPEC_HFA/.test(ai));
check('the spec repeats the ban where the model will actually read it',
  /NEVER supply a task time, a task-time basis, a workload band/.test(ai));
check('it is badged as grounded', /hfa\\\.draft/.test(badges));
check('the recommender no longer calls the HF lane MANUAL',
  /hfa: A\('ai'/.test(fs.readFileSync(path.join(SITE, 'next_step.js'), 'utf8')));
check('the ai_assistant cache-buster moved',
  PIN.atLeast(fs.readFileSync(path.join(SITE, 'ai_loader.js'), 'utf8'), 'ai_assistant.js', '69.1'),
  'returning browsers keep the old bundle otherwise, and this feature simply will not exist for them');
check('the ai_badges buster moved too',
  PIN.pinOf(idx, 'ai_badges.js') !== null);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

#!/usr/bin/env node
/*
 * Regression — the EULA must agree with what the product actually does.
 *
 * This suite exists because it didn't. On 31 Jul 2026 the live, binding EULA
 * that every user accepts at signup stated:
 *
 *   · Pro at $299 and Pro+ at $449 per seat per month — while Stripe charged
 *     $1,500 and $2,500. A five-fold discrepancy in a contract, which is
 *     exactly what a customer's procurement team finds and leans on.
 *   · EDU at $49/month — while the tier table and the pricing page both say free.
 *   · That the ten-day trial "converts automatically into a paid subscription" —
 *     while the implementation takes no payment method and simply locks the
 *     account at expiry.
 *
 * Nothing caught any of it, because prices live in three places and only one of
 * them was under test. This suite pins the EULA to the tier table in
 * safety_lab.js, which is the source the checkout actually reads.
 *
 * Run: node tests/regression_eula_terms.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const eula = S('eula_modal.js');
const app  = S('safety_lab.js');

// ---- the tier table is the source of truth (the checkout reads it) ----------
const tierBlock = (app.match(/edu:\s*\{[\s\S]*?enterprise:\s*\{[\s\S]*?\}/) || [''])[0];
check('the tier table is present in safety_lab.js', tierBlock.length > 100,
  'could not locate the edu/pro/pro-plus/enterprise price objects');

const priceOf = key => {
  const re = new RegExp("'?" + key + "'?\\s*:\\s*\\{[^}]*?price:\\s*(null|\\d+)", 's');
  const m = tierBlock.match(re);
  return m ? (m[1] === 'null' ? null : parseInt(m[1], 10)) : undefined;
};
const proPrice = priceOf('pro'), plusPrice = priceOf('pro-plus'), eduPrice = priceOf('edu');
check('tier prices are readable', proPrice !== undefined && plusPrice !== undefined && eduPrice !== undefined,
  `pro=${proPrice} pro-plus=${plusPrice} edu=${eduPrice}`);

// The EULA renders — escapes and comma-grouped figures.
const money = n => '$' + n.toLocaleString('en-US');

check('EULA states the same Pro price as the tier table',
  eula.indexOf(money(proPrice) + ' per seat per month') >= 0, 'expected ' + money(proPrice));
check('EULA states the same Pro+ price as the tier table',
  eula.indexOf(money(plusPrice) + ' per seat per month') >= 0, 'expected ' + money(plusPrice));
check('EULA does not quote a superseded Pro/Pro+ price',
  eula.indexOf('$299 per seat') < 0 && eula.indexOf('$449 per seat') < 0);

// EDU is free in the tier table; the EULA must not invoice for it.
if (eduPrice === 0) {
  check('EULA describes EDU as free, matching the tier table',
    /EDU \\u2014 free|EDU — free/.test(eula), 'EULA still prices EDU');
  check('EULA does not quote the withdrawn $49 EDU price', eula.indexOf('$49 per seat') < 0);
} else {
  check('EULA states the same EDU price as the tier table',
    eula.indexOf(money(eduPrice) + ' per seat per month') >= 0, 'expected ' + money(eduPrice));
}

// ---- trial behaviour must match the paywall --------------------------------
// handle_new_user() sets trial_ends_at; isPaywalled() locks at expiry. No charge
// is taken, so the EULA must not promise an automatic conversion.
check('EULA does not claim the trial auto-converts to a paid subscription',
  !/converts automatically into a paid subscription/i.test(eula),
  'the implementation locks the account and takes no payment');
check('EULA says access is suspended at trial end',
  /access to the Software is suspended until you subscribe/i.test(eula));
check('EULA still states the trial length used by the signup trigger',
  /ten-day free trial/i.test(eula));

// ---- claims that must stay true --------------------------------------------
// Section 12 says a US-sovereign hosted inference option is NOT yet available.
// The proxy's ITAR branch returns 503 rather than routing, so that is accurate.
// If someone wires Azure routing, this test fails and forces the EULA to follow.
// 5 Sep 2026 — repointed at the REAL proxy. This used to read
// `safety-lab-proxy_worker_SEC.js`, a copy sitting in THIS repo that was a
// 5 Jul fork, 184 lines behind the deployed worker and carrying no sovereign
// ITAR routing at all. So the check compared the EULA against a file nobody
// ships. The live proxy lives in the sibling repo safety-lab-proxy-deploy; the
// stale copy has been deleted, and the customer deployment guide no longer
// points at it either.
//
// It also used to SKIP SILENTLY when the file was missing (`if (proxy)`), which
// means a check about a published legal claim could vanish and take the wall's
// green with it. It now says so out loud, the same way regression_notify_agents
// does for the same repo — a finding of nothing is still a finding (rule 19).
const proxyPath = path.join(__dirname, '..', '..', 'safety-lab-proxy-deploy', 'worker.js');
let proxy = '', proxyErr = '';
try { proxy = fs.readFileSync(proxyPath, 'utf8'); }
catch (e) { proxyErr = String((e && e.code) || e); }
check('the proxy repo is checked out beside this one, so the EULA claim can be checked',
  !!proxy,
  'safety-lab-proxy-deploy/worker.js not found at ' + proxyPath + ' (' + proxyErr + ') — clone it beside safety-lab-deploy. Until then the EULA sovereign-inference claim is NOT being checked.');
if (proxy) {
  const itarStillRefused = /itar_not_implemented|itar_unconfigured/.test(proxy);
  const eulaSaysNotYet = /US-sovereign hosted inference option is planned but not yet available/i.test(eula);
  check('EULA sovereign-inference claim matches the proxy',
    itarStillRefused === eulaSaysNotYet,
    itarStillRefused
      ? 'proxy still refuses ITAR traffic, so the EULA must keep saying "not yet available"'
      : 'proxy now routes ITAR traffic — UPDATE the EULA, it still says the option is unavailable');
}

// ---- version discipline ----------------------------------------------------
// Acceptance is recorded per user against EULA_VERSION. Changing the terms
// without bumping it leaves users bound to text they never saw.
const ver = (eula.match(/EULA_VERSION\s*=\s*'([^']+)'/) || [])[1];
const rev = (eula.match(/rev:\s*'([^']+)'/) || [])[1];
check('EULA_VERSION is present', !!ver, 'no version string to record acceptance against');
check('EULA_VERSION and the exported rev agree',
  !!ver && !!rev && ver.endsWith('-' + rev), `EULA_VERSION=${ver} rev=${rev}`);
check('acceptance is gated on the version, not just localStorage',
  /user_metadata && user\.user_metadata\.eula_version/.test(eula) || /eula_version/.test(eula));

// ============================================================================
// EULA §6 — "forbids the AI from fabricating safety-critical claims"
//
// Added 1 Aug 2026 after the A7 audit found three live contradictions of this
// sentence. None was a hallucination; all three were DEFAULT VALUES, which is
// worse, because a default is silent and always plausible:
//
//   · _chatAddItem wrote  dal: a.dal || 'C'   — an assurance level nobody allocated
//   · four paths wrote    severity || 'Major' — mid-scale, considered-looking, invented
//   · the JSON schema example literally showed "severity": "Major", anchoring the
//     model on the same wrong answer the code then also defaulted to
//
// The point of these checks is that §6 stops being a promise in prose and
// becomes a claim the wall enforces. If the behaviour is ever deliberately
// changed, these fail first and force the terms question to the surface on
// purpose rather than by accident.
// ============================================================================
const ai = S('ai_assistant.js');
const strip = x => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const aiLogic = strip(ai);

check('§6 still makes the claim these checks defend',
  /forbids the AI from fabricating safety-critical claims/.test(eula) &&
  /severity classifications/.test(eula) && /Development Assurance Level allocations/.test(eula),
  'if this sentence goes, the checks below are defending nothing');

check('no AI path defaults a Development Assurance Level',
  !/\bdal:\s*[a-z]\w*\.\w+\s*\|\|\s*'[A-E]'/i.test(aiLogic),
  "EULA §6 names DAL allocations explicitly — the engine allocates from _SEV_DAL and the tree, never a literal");
check('no AI path defaults a severity classification',
  !/severity[^\n]{0,80}\|\|\s*'(Catastrophic|Hazardous|Major|Minor|Negligible|No Safety Effect)'/.test(aiLogic),
  'a default class is fabrication by default value — the row acquires a classification because a field needed filling');
check('an unrecognised severity becomes unclassified, not a class',
  /FHA_SEVERITIES\.indexOf\(x\.severity\) >= 0 \? x\.severity : ''/.test(ai));
check('the review card shows the absence rather than printing a class',
  /NOT CLASSIFIED/.test(ai) && /not classified/.test(ai),
  'printing Major while storing blank is the worse half of the original defect');

// SUPERSEDED 5 Sep 2026 — these two checked that the FHA prompt told the model
// to return an EMPTY STRING severity it could not ground. That instruction is
// gone, on Waqas's ruling ("the abstain instruction needs to be removed, we
// have judgement call flags now"), because the shipped fha.draft skill body in
// the SAME request said the opposite: "WHEN THE INFORMATION IS THIN, JUDGE - DO
// NOT ABSTAIN ... an empty level silently drops the row from every downstream
// check". Two opposite instructions, one request, and nothing in the code
// decided which won.
//
// The DEFECT these checks were written for is unchanged and still guarded: the
// model must not reach for a plausible middle value to look considered (the
// observed failure was Major specifically). What changed is the remedy — a
// FLAGGED judgement with a named missing fact, rather than a blank. The
// machinery for rendering declined fields stays and is still checked below;
// only the instruction moved.
// Full scope and mutation proofs: tests/regression_fha_no_abstain_and_temp.test.js
check('the FHA prompt no longer orders a blank severity',
  !/Return severity as an EMPTY STRING/.test(ai) && !/emit the row with severity as an EMPTY STRING/.test(ai));
check('it asks for a flagged judgement instead, naming the missing fact',
  /2b\. WHEN THE INFORMATION IS THIN, JUDGE/.test(ai) && /judgementCall: true/.test(ai));
check('the prompt still forbids reaching for the benign end of the scale',
  /Do NOT reach for the benign end of the scale/.test(ai),
  'the observed failure was Major specifically, because Major looks considered');
check('the prompt requires the class to be derived from the stated effects',
  /DERIVE the severity from the effects/.test(ai) && /25\.1309/.test(ai),
  'derivation against a published rubric is reasoning; a bare class is not');
// 2 Sep 2026 - FHA prose must TIE effects to the cert-basis rubric and QUOTE the
// governing definition phrase (Waqas: it gave context but did not tie effects to
// the screenshot definitions). Rule 2a is now basis-general, not hardcoded to 25.1309.
check('FHA prompt no longer hardcodes AC/AMC 25.1309 as the ONLY rubric',
  /SEVERITY CLASSIFICATION RUBRIC for the certification basis of this project/.test(ai),
  '2a used to say applying the classification definitions in AC/AMC 25.1309 for every basis');
check('FHA prompt ties effects to the definitions IN ADDITION to the plain effects',
  /TIE THE EFFECTS TO THE DEFINITIONS/.test(ai) && /IN ADDITION to the plain effects/.test(ai),
  'the tie is additive - plain effAc/effCrew/effPax stay, the rubric wording rides alongside');
check('FHA prompt makes the model QUOTE the governing definition phrase in severityRationale',
  /in severityRationale QUOTE[\s\S]{0,140}governing definition phrase/.test(ai) &&
  /clause exactly as the rubric cites it/.test(ai),
  'a quoted phrase plus its clause is the tangible anchor that improves run-to-run consistency');
check('the JSON schema example no longer anchors on a class',
  !/"severity":\s*"Major"/.test(ai),
  'the example value was itself teaching the model the default');

// A7-3, 1 Aug 2026 — this pinned the old expression, which filtered against a
// hardcoded eight-value constant. That constant disagreed with the project's own
// phase table, so it deleted legitimate phases (an eVTOL's Hover, the "All
// phases" value the demos use) on one path while the write path validated
// nothing at all. The PROPERTY this check defends is unchanged and now holds on
// both paths; only the expression moved.
check('drafted flight phases are filtered to the declared set',
  /phases: _validPhases\(Array\.isArray\(x\.phases\) \? x\.phases : \[\]\)/.test(ai),
  'an invented phase reads as scope, which is worse than an obviously missing one');
check('…and the WRITE path filters too, not just the parse path',
  /phases: _validPhases\(s\.phases \|\| \[\]\)/.test(ai),
  '_applyFhaSuggestion is what the unified batch route calls directly; it validated nothing');
check('…against the project vocabulary rather than a fixed list',
  /function _projectPhaseNames\(\)/.test(ai) && !/FLIGHT_PHASES\.indexOf\(ph\)/.test(ai),
  'exposure normalisation matches against flightPhasesData, so that table is the real vocabulary');

// The abstention only works because empty severity is already a first-class
// state downstream. If that ever stops being true, unclassified rows would go
// silently unreported — which is what the default was hiding in the first place.
const inv  = S('invariants.js');
const bind = S('bindings_modules.js');
check('an unclassified failure condition is still reported by the invariant registry',
  /has no severity classification/.test(inv));
check('and still fails the readiness checks',
  (bind.match(/filter\(f => !f\.severity\)/g) || []).length >= 2,
  'the default was suppressing a safety net that already existed');

// ---- the standing red-team battery (#261) ---------------------------------
// A live adversarial suite already existed and already graded deterministically.
// What it did NOT have was a case for either failure mode the A7 audit found in
// the field. Every one of its eight original cases tested the model INVENTING or
// INFLATING; nothing tested it classifying with no evidence, allocating a DAL it
// had no authority over, or DEFLATING a class on request — and deflation is the
// dangerous direction, because a looser class propagates into a looser DAL and a
// looser probability target and the whole argument relaxes underneath it.
const rt = (ai.match(/id: 'rt-[a-z-]+'/g) || []).map(x => x.replace(/id: '|'/g, ''));
check('the red-team corpus is still wired', rt.length >= 11, rt.join(', '));
check('it tests severity DEFLATION, not only inflation', rt.indexOf('rt-deflate') >= 0,
  'under-classification is the direction that quietly relaxes a safety argument');
check('it tests classifying with nothing to classify from', rt.indexOf('rt-abstain-sev') >= 0,
  'this is the A7-2 defect expressed as a prompt rather than a default value');
check('it tests unauthorised DAL allocation', rt.indexOf('rt-abstain-dal') >= 0,
  'EULA §6 names DAL allocations explicitly');
check('the new cases grade on the emitted ACTIONS, not on the reply prose',
  /rt-abstain-sev[\s\S]{0,900}p\.actions/.test(ai) && /rt-abstain-dal[\s\S]{0,900}p\.actions/.test(ai),
  'a model that says the right thing and does the wrong thing must still fail');
check('the deflation case rejects the whole benign end of the scale',
  /rt-deflate[\s\S]{0,900}Negligible/.test(ai) && /rt-deflate[\s\S]{0,900}No Safety Effect/.test(ai),
  'testing only for Minor would let No Safety Effect through');

// ---- A8.4 · the falsifier --------------------------------------------------
// The engine cannot compute a severity. It can contradict one, and that is what
// turns a model-proposed class from an assertion into a claim under challenge.
const cons = (ai.match(/function _aiConsistencyFindings[\s\S]*?\n    \}/) || [''])[0];
check('the consistency pass falsifies severity against the allocated budget',
  /sevBudget/.test(cons) && /_sevTargetFor/.test(cons));
check('it reads the tree allocation, not a severity-derived target',
  /pg\.targetP/.test(cons),
  'comparing the class target against itself would always pass');
check('it flags only the direction that cannot be true',
  /if \(alloc > Number\(classTgt\)\)/.test(cons),
  'a tree allocated TIGHTER than its class is normal — allocation splits a budget across contributors, and flagging that would fire on every healthy programme');
check('an unclassified failure condition is left alone here',
  /if \(!fc \|\| !fc\.severity\) return;/.test(cons),
  'that is A8.1’s finding to raise, not this one’s — two findings for one gap is noise');
check('the finding names both numbers so it can be acted on',
  /requires/.test(cons) && /allocated/.test(cons) && /toExponential/.test(cons));
check('it is raised at high severity', /sev: 'high', label: 'Severity/.test(cons));

// appended to tests/regression_eula_terms.test.js — A9 pins
const gvr = (ai.match(/async function _gvrRun\(opts\)[\s\S]*?\n    \}/) || [''])[0];
const ban = (ai.match(/function _gvrBanner\(rep\)[\s\S]*?\n    \}/) || [''])[0];

check('A9 · the generate-verify-repair loop exists', gvr.length > 400);
check('it verifies through the deterministic checker, not a second model',
  /AiFidelity\.reviewDraft/.test(gvr),
  'a model grading a model is not verification');
check('it FAILS OPEN when the verifier is missing or throws',
  /return null;\s*\}\s*\/\/ verifier threw/.test(gvr) || /catch \(_\) \{ return null; \}/.test(gvr),
  'losing an engineer’s draft because a linter crashed is worse than showing one unverified row');
check('a null verdict keeps the row', /if \(!v\) \{ keep\.push\(r\); return; \}/.test(gvr));
check('there is exactly ONE repair pass, not a loop',
  !/while\s*\(/.test(gvr) && (gvr.match(/opts\.repair\(/g) || []).length === 1,
  'a model that cannot ground a claim on the second attempt will reword until the checker stops matching');
check('repaired rows are re-verified before being shown',
  /fixed\.forEach\(function \(r\) \{[\s\S]{0,120}verify\(r\)/.test(gvr));
check('rows the repair pass did not return are counted as dropped',
  /notReturned = Math\.max\(0, bad\.length - fixed\.length\)/.test(gvr),
  'silently losing them would understate what was withheld');
check('the report records WHAT was dropped and WHY, not just how many',
  /dropped_detail\.push\(\{[\s\S]{0,200}why:/.test(gvr));

check('the withheld count is surfaced in the panel, not just returned',
  /_gvrBanner\(verifyReport\)/.test(ai) && /cfg\.verifyReport \? _gvrBanner/.test(ai));
check('the banner says withholding is not evidence of absence',
  /not<\/b> evidence that nothing exists there/.test(ban),
  'a shortened list reads as "the model found nothing", which is a different and more dangerous claim');
check('a clean run says so rather than showing nothing',
  /passed the deterministic checker/.test(ban));
check('the banner is not a toast', !/_toast/.test(ban),
  'a statement about what the engineer is NOT being shown must not vanish in four seconds');

const rp = (ai.match(/function _fhaRepairPrompt\(\)[\s\S]*?\n    \}/) || [''])[0];
check('the repair prompt never tells the model to make the flag go away',
  !/make (it|this) pass/i.test(rp) && /Do NOT try to make the flag go away/.test(rp),
  'optimising against your own checker destroys the thing that made it worth having');
check('the repair prompt offers dropping the row as a correct outcome',
  /_drop/.test(rp) && /correct and expected outcome/.test(rp));
check('the repair prompt forbids reclassifying severity',
  /leave it exactly as it is/.test(rp),
  'repair is prose work — reclassification would sneak past the A8.1 abstention');
check('the repair pass runs at temperature 0', /_fhaRepairPrompt\(\)[\s\S]{0,300}temperature: 0/.test(ai));
check('a total wipe-out is reported rather than shown as an empty panel',
  /Every drafted row was withheld by the checker/.test(ai));

// A10 pins — appended to tests/regression_eula_terms.test.js
const am = S('autonomy_metrics.js');
const rule = (ai.match(/const _ABSTAIN_RULE = \[[\s\S]*?\]\.join\('\\n'\);/) || [''])[0];

check('A10 · there is one shared abstention rule, not a per-lane copy', rule.length > 300);
check('the rule frames a blank as a GOOD outcome',
  /GOOD outcome/.test(rule),
  'base models fill because they are trained to be helpful — the permission has to be explicit and positive or it is ignored');
check('the rule forbids the specific failure that was observed',
  /mid-scale value chosen because it looks considered/.test(rule),
  'the FHA default was Major precisely because Major looks considered');
check('the rule permits a partial answer',
  /three fields out of six/.test(rule),
  'without this the model treats any blank as a failed response and pads the rest');
check('the rule is applied to more than one lane',
  (ai.match(/_ABSTAIN_RULE/g) || []).length >= 3);

check('declined fields are captured at parse time', /function _abstainedFields\(x, keys\)/.test(ai));
check('empty strings, nulls and empty arrays all count as declined',
  /v == null\) \|\| \(typeof v === 'string' && !v\.trim\(\)\) \|\| \(Array\.isArray\(v\) && !v\.length\)/.test(ai));
check('the FHA row records which fields were declined',
  /_abstained: _abstainedFields\(x, \['effAc', 'effCrew', 'effPax', 'effAcLevel', 'effCrewLevel', 'effPaxLevel', 'severity', 'severityRationale'\]\)/.test(ai));   // 3 Sep 2026 — the three effect levels are declinable too
check('the FCIM row does too', /_abstained: _abstainedFields\(x, \['totalLoss'/.test(ai));

check('declined fields are shown as chips on the card', /function _abstainChips\(row, labels\)/.test(ai));
check('the chips are rendered on the FHA card, not just computed',
  /_abstainChips\(s, \{ effAc:/.test(ai),
  'an abstention the engineer does not notice is functionally a silent blank');

// The FHA lane ran its own panel and never called _logDelta, so the highest-volume
// drafting surface in the product contributed nothing to the autonomy readout.
check('the FHA lane now logs its dispositions',
  /_logDelta\(_fhaFeatureId, _act, _fhaSuggestions\[idx\], _fhaCov/.test(ai),
  'without this the readout was blind to the busiest lane in the product');
check('the FHA lane logs a draft record too',
  /_logDelta\(_fhaFeatureId, 'draft', null/.test(ai));
check('the FHA feature id distinguishes aircraft from system scope',
  /_fhaFeatureId = scope\.systemId \? 'sfha\.populate' : 'fha\.populate'/.test(ai));
check('the shared panel carries abstentions in its coverage payload',
  /abstained: \(\(it && it\._abstained\) \|\| \[\]\)\.length/.test(ai));

check('the readout computes an abstention RATE', /abstentionRate:/.test(am));
check('it does NOT claim to compute abstention precision',
  /metric: 'abstention precision', blockedBy: 'A4'/.test(am),
  'the rate is measurable now; whether each abstention was RIGHT needs reference answers');
check('the reason given names what is actually missing',
  /needs reference answers to compare against/.test(am));
check('the rate is surfaced in the table', /Declined<\/th>/.test(am));
check('the UI says a declined field is not a fault',
  /Declined is not a fault/.test(am),
  'otherwise the number reads as a defect count and the engineer pressures it downward');

// ---- A13 · the sweep now sees human edits too ------------------------------
// #255 already ran the consistency finder after every AI write, at 13 call sites.
// What it never saw was the engineer editing by hand — so a contradiction they
// introduced sat until they happened to open the scorecard. The A8.4 falsifier
// lands in the same finder, which meant setting a tree target by hand was never
// checked against the classification either.
const sweep = (ai.match(/function _aiConsistencySweepOnEdit\(\)[\s\S]*?\n    \}/) || [''])[0];
check('A13 · a human-edit sweep exists', sweep.length > 200);
check('it runs the same finder as the AI-write sweep', /_aiConsistencyFindings\(snapshot\(\)\)/.test(sweep));
check('it debounces longer than the AI path', /\}, 6000\)/.test(sweep),
  'the AI path follows a write the engineer just watched; this one follows their own typing');
check('it speaks only when the count goes UP', /n > 0 && was >= 0 && n > was/.test(sweep),
  'a checker that talks when things improve gets muted');
check('it hooks scheduleAutosave, the universal edit signal',
  /window\.scheduleAutosave = wrapped/.test(ai) && /_consWrapped/.test(ai));
check('the wrap is guarded against double-wrapping', /scheduleAutosave\._consWrapped/.test(ai));

// ---- A14 · the review memory, actually read --------------------------------
const mem = (ai.match(/function _memoryExemplars\(feature\)[\s\S]*?\n    \}/) || [''])[0];
check('A14 · retrieval exists', mem.length > 300);
check('it retrieves CORRECTIONS, not just past rows',
  /action === 'edit'/.test(ai),
  'what the engineer changed is the signal; what the project contains is already covered by exemplarsFor');
check('the block tells the model style only, not content',
  /Do NOT reuse their CONTENT/.test(mem) && /Style only/.test(mem),
  'a model given example text reuses its content, and content from another row is fabrication in this one');
check('nothing is retrieved while the current project is export-controlled',
  /isITARControlled\) return ''/.test(mem));
check('corrections captured under export control are never retrieved',
  /!\(r\.meta && r\.meta\.controlled\)/.test(ai),
  'AiMemory spans every project in this browser — without this a controlled correction could ride into a cloud request for an uncontrolled one');
check('the export-control state is stamped at WRITE time, not read time',
  /meta\.controlled = !!\(typeof projectConfig/.test(ai),
  'reading it later would test the wrong project');
check('an unreadable control state fails CLOSED', /catch \(_\) \{ meta\.controlled = true; \}/.test(ai),
  'if we cannot tell, assume controlled — the opposite default leaks');
check('Top-K of 0 genuinely disables retrieval', /if \(!k\) return '';/.test(mem));
check('Top-K is clamped', /Math\.max\(0, Math\.min\(20, n\)\)/.test(ai));
check('the first call warms the cache rather than blocking the request',
  /if \(!_memCache\) \{ _memoryRefresh\(\); return ''; \}/.test(mem));
check('the cache is refreshed after each new correction',
  /window\.AiMemory\.add\(_rec\);\s*\n\s*try \{ _memoryRefresh\(\); \}/.test(ai));
// F2, 31 Aug 2026 — superseded in place: the injection site moved into
// _assembleAnalysisContext (the ONE assembler both paths call), keyed on its
// `feature` parameter. Same guarantee: retrieval rides the request.
check('retrieval is injected into the request, not just computed',
  /_memoryExemplars\(String\(feature \|\| ''\)\)/.test(ai) &&
  /opts\.system = await _assembleAnalysisContext\(opts\.feature, opts\.system, opts\);/.test(ai));

const idxs = S('index.html');
check('the settings copy no longer over-promises',
  /your most relevant past <b>corrections<\/b> are injected/.test(idxs));
check('and it states both limits',
  /style, never content/.test(idxs) && /never retrieved into any other project/.test(idxs),
  'the panel claimed retrieval worked for months while the store was write-only — it should not quietly over-promise again');

check('A14 · a read-only preview hook exists so retrieval is testable',
  /memoryPreview: function \(feature\)/.test(ai),
  'retrieval goes into a system prompt the tester never sees — without this, "is my controlled correction leaking?" is unanswerable from the UI');
check('the preview calls no model and sends nothing',
  /memoryPreview: function[\s\S]{0,240}_memoryExemplars/.test(ai) &&
  !/memoryPreview: function[\s\S]{0,240}Provider\.complete/.test(ai));

// ============================================================================
// REACHABILITY — added 1 Aug 2026 after a live run found the gap these close.
//
// Every check written before this one asked "does the rule exist in the file?".
// None asked "does the code path the product actually takes reach it?". Those
// are different questions, and on 1 Aug the answer to the second was NO:
//
//   _useUnifiedFeatures() defaults TRUE and short-circuits populateFha,
//   recommendRequirements, populateFcim and synthesizeTree into _anemBatch().
//   That function carried no _ABSTAIN_RULE, no _gvrRun and no editableFields —
//   so A1's edit gate, A8.1/A10's abstention and A9's verify-repair were all
//   inert on the primary path while 2,206 checks passed green.
//
//   Observed consequence: an aircraft function with a blank definition came
//   back classified "No Safety Effect" — the model stating in its own reply
//   that it "cannot classify its severity honestly", then reaching for the
//   most benign class on the scale because nothing offered it a way out.
//
// These checks assert the CHAIN, not the ingredients.
// ============================================================================
const anemBatch = (ai.match(/function _anemBatch\(taskDirective, cfg\)[\s\S]*?\n    \}/) || [''])[0];

check('REACH · _anemBatch was found', anemBatch.length > 800);

// --- every unified short-circuit must land somewhere that carries the rules --
// 26 Aug 2026 — pin widened in place. The evening scope-picker ruling ("which
// zone they wanna evaluate, which PRA they wanna perform and so on") turned the
// one-line `return _anemBatch(...)` short-circuits into picker callbacks: the
// lane opens _openScopePicker and the CALLBACK calls _anemBatch. The invariant is
// unchanged — every unified short-circuit still lands in _anemBatch, which is
// where the abstention rule, spec, documents and assumptions contract live — the
// call is just no longer on the same line as the `return`. Count both shapes.
const shortCircuits = (ai.match(/_useUnifiedFeatures\(\)[^\n]*return _anemBatch\(/g) || []).length
  + (ai.match(/_openScopePicker\([\s\S]{0,900}?_anemBatch\(_FEATURE_DIRECTIVE\./g) || []).length;
check('REACH · the unified short-circuits route into _anemBatch', shortCircuits >= 3,
  'if a feature ever short-circuits somewhere else, that path needs these same checks');

// 5 Sep 2026 — still true, and now lane-aware. _anemBatch carries the
// abstention rule for every lane EXCEPT the FHA/SFHA, the only two of the 25
// registered skills whose body supplies the judgementCall/judgementNote
// contract that replaces it. Stripping it from the other 23 would trade a
// visible blank for a silent guess, which is the failure mode A10 exists for.
check('REACH · _anemBatch still carries the abstention rule into the request',
  /_ABSTAIN_RULE/.test(anemBatch),
  'A10 lived only on the dedicated per-lane prompts, which this path routes around');
check('REACH · and it is gated on the lane, so the FHA does not get both instructions',
  /const _abstainForLane = _isFhaLane \? '' : \('\\n\\n' \+ _ABSTAIN_RULE\);/.test(anemBatch),
  'the FHA skill body already says JUDGE - DO NOT ABSTAIN; shipping both is the defect');
// Invariant, not the exact concatenation (2 Aug: the spec block now prefixes
// the same expression — HANDOFF §7.3, assert what must hold, not the literal):
// _ABSTAIN_RULE is part of _sysExtra, and _sysExtra is what reaches the model.
// 26 Aug 2026 — loosened from the literal `_anemRun(messages, _sysExtra)` to
// "whatever the turn's messages are, _sysExtra is the second argument". _anemBatch
// now builds its user turn per chunk (_mkMessages(extra)) so a multi-turn draft can
// name the slice of work it owns, which retired the single `messages` variable. The
// invariant this check exists for is unchanged, and the new check below extends it
// to every turn — a rule that rode only the first slice would be worse than none.
// 5 Sep 2026 — the concatenation is now lane-gated (_abstainForLane) rather
// than an unconditional + _ABSTAIN_RULE. The invariant is unchanged and is what
// this check is for: whatever the lane resolves to, it is APPENDED to
// systemExtra and systemExtra is what reaches the model. Computing it and not
// passing it would still look identical to a grep, which is why the second
// half pins the hand-off to _anemRun.
check('REACH · and it is appended to systemExtra, which actually reaches the model',
  /const _sysExtra = [^;]*\+ _abstainForLane/.test(ai) &&
  /_anemRun\([^;]*?, _sysExtra[,)]/.test(ai),
  'computing it and not passing it would look identical to a grep');
check('REACH · …on EVERY turn of a chunked draft, not just the first',
  /for \(let _ci = 0; _ci < _slices\.length; _ci\+\+\)/.test(ai) &&
  /_anemRun\(_mkMessages\(_extra\), _sysExtra[,)]/.test(ai),
  'later slices drafting without the abstention rule would guess severities the first slice left blank');

check('REACH · _anemBatch runs the verifier', /_gvrRun\(/.test(anemBatch));
check('REACH · on this path the verifier FLAGS rather than withholds',
  /keepFlagged: true/.test(anemBatch),
  'the batch is heterogeneous — withholding an arbitrary action could silently remove the tree node the engineer asked for');
check('REACH · the verify report is handed to the panel',
  /verifyReport: _gvr\.report/.test(anemBatch));
check('REACH · the panel is given the verified rows, not the raw ones',
  /items: _gvr\.rows/.test(anemBatch),
  'passing `items` here would run the verifier and then ignore it');

check('REACH · _anemBatch declares editable fields so the Edit gate renders',
  /editableFields: function \(it\)/.test(anemBatch));
check('REACH · the panel accepts a FUNCTION for editableFields',
  /typeof cfg\.editableFields === 'function'/.test(ai),
  'a heterogeneous batch cannot be described by one static field list');
check('REACH · per-card editability is resolved per item, not once for the panel',
  /const canEdit = _editableOf\(it\)\.length > 0 && hasAccept/.test(ai));
check('REACH · declined fields are captured on batch actions too',
  /_abstained = _abstainedFields\(a, fl\.map/.test(anemBatch));

// --- the directive itself ---------------------------------------------------
// SUPERSEDED 5 Sep 2026 — the directive no longer offers a blank as the way
// out; it offers a FLAGGED JUDGEMENT, because the skill body in the same
// request forbade the blank. The thing this check actually defends — that the
// directive gives the model a route other than "classify it anyway, benignly"
// — is unchanged, and the route is now judgementCall + judgementNote.
check('REACH · the FHA directive gives a route other than a benign guess',
  /_FEATURE_DIRECTIVE[\s\S]{0,1600}judgementCall: true/.test(ai) &&
  /do NOT return a blank: make the call an experienced safety engineer would make/.test(ai),
  'the old directive told the model to classify and handed it the benign end of the scale');
check('REACH · and it names the exact failure that was observed',
  /"No Safety Effect" is a finding about the aircraft, not a way of saying you do not know/.test(ai),
  'the model chose No Safety Effect for an undefined function — the benign end is not an abstention');

// --- the standing lesson ----------------------------------------------------
// A rule that exists but is not reached is worse than no rule: it reads as
// covered in review and in the wall, and it is not.
check('REACH · the dedicated per-lane prompts still carry the rule as well',
  (ai.match(/_ABSTAIN_RULE/g) || []).length >= 4,
  'the system-scope SFHA path still uses _fhaSystemPrompt — both paths need it');

// ---- the abstention has to be VISIBLE on the unified card too ---------------
// Behaviour was fixed on 68.8 and the presentation was not: a classified row read
// "· Catastrophic", an abstained one read nothing at all. Absence shown only by
// omission is easy to skim past on a stack of cards, and an abstention the
// engineer does not notice is functionally the silent blank A8.1 set out to remove.
const card = (ai.match(/function _anemActionCard\(a\)[\s\S]*?\n    \}/) || [''])[0];
check('CARD · an unclassified row says so where the class would have been',
  /NOT CLASSIFIED — you classify this/.test(card));
check('CARD · only for row types that are supposed to carry a severity',
  /_wantsSev = \(op === 'add_fha' \|\| op === 'add_fmea' \|\| op === 'add_zsa'\)/.test(card),
  'a requirement has no severity — marking it "not classified" would be noise');
check('CARD · the reason for declining is shown without opening the row',
  /_abReason/.test(card) && /severityRationale/.test(card));
check('CARD · declined fields are shown as chips here as well',
  /_abstainChips\(a, \{/.test(card),
  'the dedicated FHA panel had these from A10; the unified panel did not');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

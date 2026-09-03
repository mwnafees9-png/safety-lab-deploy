#!/usr/bin/env node
/*
 * Regression — the clause references this product prints are the clauses that
 * exist.
 *
 * WHAT WENT WRONG. On 1 Aug 2026 the source documents were read against the
 * code for the first time. Six lanes in the programme catalogue carried the
 * appendix letters of ARP4761 (1996) while labelling themselves ARP4761A (2023).
 * They had been correct for the superseded revision and were never moved when
 * the lane names were updated. Four of the eight spine references in
 * next_step.js were wrong too — and those had shipped that same day.
 *
 * WHY IT MATTERS MORE THAN A TYPO. These strings are not internal. They render
 * on the Program Planning page and print into the SSPP, which is a
 * certification artifact. A reviewer who follows "ARP4761A App D" expecting
 * Fault Tree Analysis lands on Preliminary System Safety Assessment. A citation
 * that is merely absent invites a question; a citation that is confidently wrong
 * survives review precisely because it looks checked.
 *
 * WHY A TEST AND NOT A ONE-TIME FIX. Nothing in the codebase knew what the
 * appendix letters were, so nothing could notice them going stale — and they
 * stayed wrong across a revision change. This file encodes the real map. It is
 * the only thing standing between the next edit and the same silence.
 *
 * SOURCES (read directly, not paraphrased):
 *   · SAE ARP4761A (2023), contents pages 2-3 of 692 — appendix letters.
 *   · SAE ARP4761A §3, §4 — safety assessment process and analysis methods.
 *   · SAE ARP4754B — §4 development process, §5 integral processes.
 * SAE material is copyright: this file records CLAUSE NUMBERS AND TITLES only,
 * which is what the product's own cite-and-point posture allows. No clause prose
 * is stored here or anywhere in the repo.
 *
 * Run: node tests/regression_standards_citations.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');

// ---------------------------------------------------------------------------
// THE MAP. ARP4761A (2023) appendices, verbatim from its own contents page.
// ---------------------------------------------------------------------------
const APP_4761A = {
  A: 'Aircraft Functional Hazard Assessment (AFHA)',
  B: 'Preliminary Aircraft Safety Assessment (PASA)',
  C: 'System Functional Hazard Assessment (SFHA)',
  D: 'Preliminary System Safety Assessment (PSSA)',
  E: 'System Safety Assessment (SSA)',
  F: 'Aircraft Safety Assessment (ASA)',
  G: 'Fault Tree Analysis (FTA)',
  H: 'Dependence Diagram (DD)',
  I: 'Markov Analysis (MA)',
  J: 'Failure Modes and Effects Analysis (FMEA)',
  K: 'Zonal Safety Analysis (ZSA)',
  L: 'Particular Risk Analysis (PRA)',
  M: 'Common Mode Analysis (CMA)',
  N: 'Model-Based Safety Analysis (MBSA)',
  O: 'Cascading Effects Analysis (CEA)',
  P: 'Function and Item Development Assurance Assignment (FDAL/IDAL)',
  Q: 'Contiguous Safety Assessment Process Example'
};
// The 1996 letters that were found in the code. Kept as an explicit blocklist so
// a reversion is named rather than merely failing an equality check.
const STALE_1996 = {
  'fta':    { was: 'App D',         reason: 'D is Preliminary System Safety Assessment in 4761A; FTA is App G' },
  'markov': { was: 'App D.7',       reason: 'Markov Analysis is App I in 4761A; 4761A has no App D.7' },
  'pra':    { was: 'App I',         reason: 'I is Markov Analysis in 4761A; PRA is App L' },
  'zsa':    { was: 'App H',         reason: 'H is Dependence Diagram in 4761A; ZSA is App K' },
  'cma':    { was: 'App K / App M', reason: 'K is Zonal Safety Analysis in 4761A; CMA is App M alone' }
};

console.log('\n[citations] the programme catalogue');
{
  global.projectConfig = { regulation: 'Part 25' };
  global.ftaPages = []; global.praData = []; global.zsaData = []; global.cmaData = [];
  const PP = require('../site/program_plan.js');
  const std = {}; PP.CATALOGUE.forEach(l => { std[l.id] = l.std || ''; });

  const expect = { fta: 'App G', markov: 'App I', pra: 'App L', zsa: 'App K', cma: 'App M' };
  Object.keys(expect).forEach(id => {
    check(id + ' cites ARP4761A ' + expect[id] + ' (' + APP_4761A[expect[id].slice(-1)] + ')',
      std[id] === 'ARP4761A ' + expect[id], 'found: ' + std[id]);
  });
  Object.keys(STALE_1996).forEach(id => {
    check(id + ' no longer carries the 1996 letter',
      std[id].indexOf(STALE_1996[id].was) < 0, STALE_1996[id].reason);
  });
  // "event tree" appears zero times in ARP4761A. The lane is a real method; it is
  // simply not one this document covers, and it must not claim a clause it has.
  check('the event-tree lane does not claim an ARP4761A clause',
    !/ARP4761A App/.test(std.eta) && /NOT an ARP4761A method/.test(std.eta),
    'found: ' + std.eta);
  check('no catalogue lane cites an appendix letter outside A-Q',
    PP.CATALOGUE.every(l => {
      const m = /ARP4761A App\.? ?([A-Z])/.exec(l.std || '');
      return !m || Object.prototype.hasOwnProperty.call(APP_4761A, m[1]);
    }));
  check('every ARP4761A appendix cited by a lane matches that lane\'s subject',
    std.fta.indexOf('G') >= 0 && std.markov.indexOf('I') >= 0 &&
    std.pra.indexOf('L') >= 0 && std.zsa.indexOf('K') >= 0 && std.cma.indexOf('M') >= 0);
}

console.log('\n[citations] the next-step spine');
{
  const ns = S('next_step.js');
  // ARP4754B §5 is INTEGRAL PROCESSES. The development work is §4:
  //   §4.2 aircraft function and requirement development
  //   §4.3 aircraft architecture / allocation of functions to systems
  //   §4.5 system architecture / allocation of system requirements to items
  // ARP4761A §3.1 is the process overview; AFHA is §3.2 and SFHA is §3.4.
  const want = [
    ["Aircraft functional breakdown", "ARP4754B §4.2"],
    ["Aircraft FHA",                  "ARP4761A §3.2 · App A"],
    ["System breakdown",              "ARP4754B §4.3"],
    ["System FHA (SFHA)",             "ARP4761A §3.4 · App C"],
    ["Item definition",               "ARP4754B §4.5"],
    ["FMEA (inside each System Folder)", "ARP4761A App J"]
  ];
  want.forEach(([name, std]) => {
    check(name + ' cites ' + std,
      ns.indexOf("name: '" + name + "', std: '" + std + "'") >= 0);
  });
  check('no spine lane still cites ARP4754B §5.2/§5.3/§5.4 for development work',
    !/ARP4754B §5\.[234]/.test(ns),
    '§5 is Integral Processes — function, architecture and item work all live in §4');
  check('the FMEA lane no longer cites App G',
    !/FMEA[^\n]*ARP4761A App G/.test(ns), 'App G is Fault Tree Analysis; FMEA is App J');
  check('the correction is explained in the file, not just applied',
    /§5 is INTEGRAL\s*\n\s*\/\/ PROCESSES/.test(ns) && /worse than\s*\n\s*\/\/ citing nothing/.test(ns));
}

console.log('\n[citations] ARP4761A §3.10 — the handoff the HF lane exists to close');
{
  const ai = S('ai_assistant.js');
  check('the HF assist cites §3.10 as its reason for existing',
    /ARP4761A §3\.10/.test(ai));
  check('and states what §3.10 actually says — crews are ASSUMED to follow procedure',
    /ASSUMES that flight, cabin and maintenance crews follow documented procedures/.test(ai));
  check('…and that deviation is explicitly NOT considered',
    /does NOT consider deviation from those procedures/.test(ai),
    'this is why an unregistered crew credit is a gap rather than a nicety');
  check('…and that crew error is handed to other techniques',
    /evaluated by different techniques/.test(ai) || /different analysis techniques/.test(ai));
  check('§3.10 is in the closed list of citable bases',
    /'ARP4761A §3\.10 crew-procedure assumption'/.test(ai));
  check('the feature header frames itself as closing that handoff',
    /closing a handoff the standard states explicitly and nothing was performing/.test(ai));
}

// ---------------------------------------------------------------------------
// THE STRUCTURAL SWEEP. The fixes above are specific; this is the invariant.
// ARP4761A (2023) has exactly:
//   §1 Scope · §2 References · §3 Safety Assessment Process (3.1-3.10)
//   §4 Safety Analysis Methods (4.1-4.6) · §5 Safety-Related Maintenance Tasks
//   and Intervals (5.1-5.2 ONLY) · §6 MMEL · §7 TLD · §8 In-Service Safety Assessment
// Nine citations across six files pointed into §5.1.2.3, §5.1.3, §5.3.3 and §5.4
// for fault trees, FMEA, particular risks, zonal and common mode. Those are the
// ARP4761 (1996) numbers, where §5 WAS the analysis-methods section. In 4761A
// that range is maintenance intervals — so each one sent a reviewer to the wrong
// chapter of the right document.
console.log('\n[citations] no reference points outside the document');
{
  const files = fs.readdirSync(SITE).filter(f => f.endsWith('.js'));
  const bad = [];
  files.forEach(f => {
    let src; try { src = S(f); } catch (_) { return; }
    // Capture the section from the citation. Stripping non-digits instead would
    // fold the DOCUMENT number into the section — "ARP 4761A §3" becomes "47613"
    // — which is how the first version of this check managed to fail every
    // correct citation in the repo at once.
    let m; const re = /ARP ?4761A? ?§(\d+)(?:\.(\d+))?(?:\.(\d+))?/g;
    while ((m = re.exec(src)) !== null) {
      const top = +m[1], sub = m[2] === undefined ? null : +m[2], sub2 = m[3] === undefined ? null : +m[3];
      const cite = m[0];
      let ok = true;
      if (top < 1 || top > 8) ok = false;
      else if (top === 3) ok = (sub === null) || (sub >= 1 && sub <= 10);
      else if (top === 4) ok = (sub === null) || (sub >= 1 && sub <= 6);
      // §5 exists — Safety-Related Maintenance Tasks — but only 5.1 and 5.2, and
      // neither is an analysis method. Anything deeper is a 1996 reference.
      else if (top === 5) ok = (sub === null) || ((sub === 1 || sub === 2) && sub2 === null);
      if (!ok) bad.push(f + ' → ' + cite);
    }
  });
  check('every ARP4761A section reference exists in ARP4761A', bad.length === 0, bad.join(' | '));
}
{
  const files = fs.readdirSync(SITE).filter(f => f.endsWith('.js'));
  const bad = [];
  files.forEach(f => {
    let src; try { src = S(f); } catch (_) { return; }
    (src.match(/ARP ?4761A? App(endix)?\.? ?[A-Z]\b/g) || []).forEach(cite => {
      const L = cite.trim().slice(-1);
      if (!Object.prototype.hasOwnProperty.call(APP_4761A, L)) bad.push(f + ' → ' + cite);
    });
  });
  check('every ARP4761A appendix letter cited is one that exists (A-Q)', bad.length === 0, bad.join(' | '));
}
{
  const ai = S('ai_assistant.js');
  check('fault-tree METHOD is cited as App G wherever it appears',
    !/(construction|synthesis|structures|ground rules)[^\n]{0,80}ARP ?4761A? §5/i.test(ai) &&
    /ARP4761A App G/.test(ai),
    '1996 put FTA method at §5.4; in 4761A §5.4 does not exist and §5 is maintenance intervals');
  check('FMEA is not cited to App G or Appendix B anywhere',
    !/FMEA[^\n]{0,60}ARP ?4761A? App(endix)? ?[GB]\b/.test([S('misc_fn_modules.js'), S('helpers_modules.js'), S('next_step.js')].join('\n')),
    'App G is Fault Tree Analysis and App B is the PASA — FMEA is App J');
}

// ---------------------------------------------------------------------------
// THE LANE TABLE. Fixing the strings in the code fixes the past; this is what
// governs the model's OUTPUT, which is where the next wrong citation would come
// from. A model asked for a clause will produce one fluently — and "ARP4761A
// §5.4" is exactly what it will reach for, because that was the correct answer
// throughout the 1996 revision's fifteen years in the training data.
console.log('\n[citations] the per-lane closed list');
{
  const ai = S('ai_assistant.js');
  const tbl = (ai.match(/const _LANE_BASES = \{[\s\S]*?\n    \};/) || [''])[0];
  check('the table exists', tbl.length > 400);

  // Every ARP string inside the table must survive the same structural check the
  // rest of the codebase just passed. A typo here becomes a citation the product
  // actively teaches the model to emit.
  const bad = [];
  let m; const re = /ARP ?4761A? ?§(\d+)(?:\.(\d+))?/g;
  while ((m = re.exec(tbl)) !== null) {
    const top = +m[1], sub = m[2] === undefined ? null : +m[2];
    let ok = true;
    if (top === 3) ok = sub === null || (sub >= 1 && sub <= 10);
    else if (top === 4) ok = sub === null || (sub >= 1 && sub <= 6);
    else if (top === 5) ok = sub === null || sub === 1 || sub === 2;
    else if (top > 8 || top < 1) ok = false;
    if (!ok) bad.push(m[0]);
  }
  check('every ARP4761A clause in the table exists in ARP4761A', bad.length === 0, bad.join(', '));

  const badApp = [];
  let a; const reA = /ARP ?4761A? App\.? ?([A-Z])\b/g;
  while ((a = reA.exec(tbl)) !== null) {
    if (!Object.prototype.hasOwnProperty.call(APP_4761A, a[1])) badApp.push(a[0]);
  }
  check('every ARP4761A appendix in the table exists', badApp.length === 0, badApp.join(', '));

  const bad4754 = [];
  let b; const re4 = /ARP ?4754B ?§(\d+)(?:\.(\d+))?/g;
  while ((b = re4.exec(tbl)) !== null) {
    const top = +b[1], sub = b[2] === undefined ? null : +b[2];
    let ok = true;
    // §4 Aircraft and System Development Process (4.1-4.7);
    // §5 Integral Processes (5.1-5.7); §3 planning; §6 modifications.
    if (top === 4) ok = sub === null || (sub >= 1 && sub <= 7);
    else if (top === 5) ok = sub === null || (sub >= 1 && sub <= 7);
    else if (top > 6 || top < 1) ok = false;
    if (!ok) bad4754.push(b[0]);
  }
  check('every ARP4754B clause in the table exists in ARP4754B', bad4754.length === 0, bad4754.join(', '));

  // Subject-matter spot checks — structure alone would accept a valid clause
  // pointing at the wrong analysis.
  check('the fault-tree lanes cite App G, not a section', /'fta\.synthesize':\s*\['ARP4761A App G'/.test(tbl));
  check('FMEA cites App J', /'fmea\.item':\s*\['ARP4761A App J'/.test(tbl));
  check('particular risks cite §4.5 / App L', /'pra\.draft':\s*\['ARP4761A §4\.5 · App L'/.test(tbl));
  check('zonal cites §4.4 / App K', /'zsa\.draft':\s*\['ARP4761A §4\.4 · App K'/.test(tbl));
  check('common mode cites §4.6 / App M', /'cma\.draft':\s*\['ARP4761A §4\.6 · App M'/.test(tbl));
  check('the AFHA lane cites §3.2 / App A', /'fha\.populate':\s*\['ARP4761A §3\.2 · App A'/.test(tbl));
  check('the SFHA lane cites §3.4 / App C', /'sfha\.populate':\s*\['ARP4761A §3\.4 · App C'/.test(tbl));
  check('DAL work cites §3.9 / App P and ARP4754B §5.2',
    /'arch\.recommend':[^\]]*ARP4761A §3\.9 · App P/.test(tbl) && /'arch\.recommend':[^\]]*ARP4754B §5\.2/.test(tbl));
  check('requirements cite ARP4754B §5.3, not §5.4',
    /'req\.recommend':\s*\['ARP4754B §5\.3'/.test(tbl),
    '§5.4 is Requirements Validation; capture is §5.3');

  // F2, 31 Aug 2026 — superseded in place: the standing clauses moved with the
  // gate's body into _assembleAnalysisContext; the basis clause sits between the
  // assumptions and insufficiency clauses there, and BOTH paths get it now.
  check('the table is injected centrally, next to the other standing clauses',
    /_withAssumptionsClause\(sys\)/.test(ai) && /_withBasisClause\(sys, feature\)/.test(ai) &&
    /_withInsufficiencyClause\(sys\)/.test(ai),
    'a per-feature copy is a per-feature chance to forget');
  check('the clause tells the model a superseded revision will be rejected',
    /ARP4761A \(2023\) renumbered the 1996 document/.test(ai),
    'this is the specific failure being defended against, so it is named');
  check('an empty basis is offered as the honest option',
    /An honest blank is correct; a citation that does not survive being looked up is worse than none/.test(ai));
  check('an off-list citation is DROPPED, not rendered',
    /function _basisOk\(feature, v\)/.test(ai) && /bases\.indexOf\(t\) >= 0 \? t : ''/.test(ai));
  check('and the drop is shown rather than hidden',
    /unrecognised citation, dropped/.test(ai),
    'silently removing it would hide that the model cited something imaginary');
  check('the chip renders once, centrally, in the shared panel',
    /cfg\.cardHtml\(it\) \+ _basisChip\(it, cfg\.feature\)/.test(ai));
  check('hfa.draft is resolved lazily to avoid a load-time TDZ',
    /if \(f === 'hfa\.draft'\) \{ try \{ return _HF_BASES; \}/.test(ai),
    '_HF_BASES is declared thousands of lines later; naming it in the table literal would throw at load and take every AI feature down');
}

// ---------------------------------------------------------------------------
// METHOD TEXT, not just clause numbers. Reading ARP4754B §5.2 and ARP4761A App P
// against _SPEC_ARCH found the independence CLAIM it made was correct, and three
// rules missing — each omission pointing the same way, toward advice that lowers
// assurance more cheaply than the standard permits.
console.log('\n[citations] the DAL method text matches the documents');
{
  const ai = S('ai_assistant.js');
  const spec = (ai.match(/const _SPEC_ARCH = \[[\s\S]*?\]\.join/) || [''])[0];
  check('_SPEC_ARCH cites App P as the PROCESS and 4754B §5.2 as the principles',
    /ARP4761A App P \(the FDAL\/IDAL assignment PROCESS, including Table P2 Option 1 \/ Option 2\)/.test(spec) &&
    /under the general principles of ARP4754B §5\.2/.test(spec),
    'ARP4754B defers the assignment process to ARP4761A/ED-135 — citing 4754B for the options table points at a document that does not carry it');
  check('and it says both options sit behind the independence step',
    /App P validates independence at step f, before assignment at step h, so neither option is the one that skips it/.test(spec));
  check('lowering still requires functional / item-development independence',
    /functional independence attribute is satisfied/.test(spec) && /item development independence for IDAL/.test(spec));
  check('physical or process separation alone still does not lower a level',
    /Physical or process separation alone does not lower a level/.test(spec));
  check('independence is confirmed through CMA, and App M is named',
    /CMA evaluation of the requirement sets and development processes \(ARP4761A App M\)/.test(spec));

  // The three that were missing.
  check('NEW — the independence argument keeps the TOP-LEVEL rigor',
    /commensurate with the TOP-LEVEL assignment, not with the lowered member levels/.test(spec),
    'ARP4761A App P step f and ARP4754B §5.2.3.2.2; omitting it is the commonest way this rule is misapplied');
  check('NEW — indeterminate common error sources invalidate the claim',
    /INDETERMINATE IS NOT INDEPENDENT/.test(spec) && /the independence claim is invalid/.test(spec),
    'App P: where common sources of error cannot be shown mitigated, members are grouped rather than credited');
  check('NEW — an item takes the most stringent level across ALL its failure conditions',
    /MOST STRINGENT WINS/.test(spec) && /Never recommend a level justified by one failure condition in isolation/.test(spec));
  check('NEW — the choice among options belongs to the applicant',
    /is the certification applicant.{0,3}s, not yours/.test(spec));
  check('and it still refuses to allocate a DAL at all',
    /NEVER allocate a DAL — the deterministic engine owns that allocation/.test(spec),
    'DALgebra is deterministic; the model advises on architecture, it does not assign levels');
}

console.log('\n[citations] the DALgebra self-tests name the governing revision');
{
  const b = S('bindings_modules.js');
  check('the historical ARP4754A numbering is kept as provenance, not as the claim',
    /was ARP4754A \(2010\) §5\.4\.1\.[12]\)/.test(b));
  // The Option-2 question was raised, then investigated, and the engine won.
  check('the Option 2 question is recorded as RESOLVED, in the engine\'s favour',
    /RESOLVED — the engine is correct; the LABEL was wrong/.test(b));
  check('the resolution names where the gating actually lives',
    /allocateDAL \(support_modules\.js\)/.test(b) && /'none' and 'compromised'/.test(b));
  check('the misleading self-test label is gone from the case titles and citations',
    !/\(one level down\) without independence claim/.test(b) &&
    /permitted only behind a functional-independence claim \(App P step f\)/.test(b),
    'a label that misstates the rule is how a correct engine gets "fixed" into a wrong one');
  check('both option tests now cite Table P2 in ARP4761A App P',
    (b.match(/ARP4761A App P Table P2 Option [12]/g) || []).length === 2,
    'ARP4754B defers the assignment process to 4761A — the options table is in App P, not in 4754B');
}

console.log('\n[citations] the allocator gates the reduction on independence');
{
  const sup = S('support_modules.js');
  check('OR-like gates get no reduction at all',
    /no reduction \(ARP4761A Table P2, single-member column\)/.test(sup),
    'any single member can cause the condition, so each carries the full level');
  check('AND-like reduction is conditioned on an independence state',
    /node\.dalIndependence/.test(sup) && /'substantiated'/.test(sup));
  check("'none' and 'compromised' revert every member to the top level",
    /if \(indep === 'none' \|\| indep === 'compromised'\)/.test(sup));
  check('a bare claim is applied but flagged PROVISIONAL until CMA substantiates it',
    /_dalProvisional = \(indep === 'claimed'\)/.test(sup));
  check('a compromised claim also invalidates the AND probability product',
    /_dalCompromised/.test(sup) && /common-cause \(β\) term/.test(sup),
    'independence bought both the DAL reduction and the multiplication — losing it costs both');
  check('the allocator cites the same clause this sweep verified',
    /ARP4761A Table P2 step f/.test(sup));
}

// ---------------------------------------------------------------------------
// FTA METHOD TEXT — checked against the NASA Fault Tree Handbook v1.1 (Aug 2002)
// and ARP4761A App G. The Handbook is NASA public domain, so unlike the SAE
// documents its rule statements may be quoted; the citations here are still
// clause-level because that is what the product needs.
//
// THE DEFECT FOUND: the prompts cited "NASA FTH ground rules" for four rules
// that are NOT in the Handbook's §5.7, which is literally titled "Fault Tree
// Construction Ground Rules" and contains a different list — resolution limits,
// do-not-model wiring/piping, model CCF on identical active redundant
// components. The four rules the product means live in §4.4 (immediate cause)
// and §4.5 (Basic Rules for Fault Tree Construction). Anyone following the
// citation landed in the wrong section of the right document — the same failure
// as ARP4761A App D for fault trees, and as Table C5 for the SFHA worksheet.
console.log('\n[citations] the fault-tree construction rules');
{
  const ai = S('ai_assistant.js');
  check('the FTH citation names §4.4 and §4.5, not the §5.7 scoping list',
    /NASA Fault Tree Handbook §4\.4-4\.5 \(basic construction rules\)/.test(ai),
    '§5.7 is titled "Ground Rules" but carries resolution/scoping rules, not these four');
  check('and §5.7 is named separately for what it actually is',
    /§5\.7 \(scoping ground rules\)/.test(ai) || /separate SCOPING list/.test(ai));
  check('immediate cause carries its operative qualifier',
    /immediate, NECESSARY AND SUFFICIENT causes/.test(ai) || /necessary-and-sufficient/.test(ai),
    'FTH §4.4: the immediate, necessary and sufficient causes — dropping that makes it a vague instruction to go one level at a time');
  check('No Gate-to-Gate is stated as the Handbook states it',
    /gate inputs are properly defined fault events, and no gate connects directly to another gate/i.test(ai));
  check('Complete-the-Gate is stated separately from No Miracles',
    /COMPLETE-THE-GATE: define ALL inputs to a gate before developing any one of them/.test(ai) &&
    /NO MIRACLES, which is a separate rule/.test(ai),
    'the synthesis prompt had fused the two — they are distinct rules in FTH §4.5 and mean different things');
  check('No Miracles is stated correctly — normal function must be DEFEATED by a fault',
    /must be DEFEATED by a modelled fault/.test(ai),
    'not "elements behave normally", which is only half of it');
  check('AND-independence is attributed to ARP4761A, not to the Handbook',
    /that is an independence requirement, not one of the Handbook construction rules/.test(ai),
    'it is an ARP4761A App G requirement; filing it under FTH misattributes it');
  check('the symbol notation still cites Figure G1',
    /NOTATION \(Fig G1\)/.test(ai),
    'verified: Figure G1 in ARP4761A is "Fault tree symbols"');
}

// ---------------------------------------------------------------------------
// FHA METHOD TEXT — ARP4761A App A (AFHA) and App C (SFHA), read directly.
// The notation rule was already right. Five rules in the appendix were absent,
// and each is a drift the model makes unprompted: it writes failure MODES into
// an FHA, it produces only loss conditions and no malfunctions, it collapses the
// aware/unaware split, it classifies once instead of per phase, and it anchors on
// a familiar severity before it has described the effects.
console.log('\n[citations] the FHA method text');
{
  const ai = S('ai_assistant.js');
  const spec = (ai.match(/const _SPEC_FHA = \[[\s\S]*?\]\.join/) || [''])[0];
  check('cites App A for the AFHA and App C for the SFHA',
    /§3\.2 and App A for an AFHA; §3\.4 and App C for an SFHA/.test(spec));
  check('the notation rule survives — abnormal state of a FUNCTION',
    /ABNORMAL STATE OF A FUNCTION, including the amount and type of impairment/.test(spec));

  check('NEW — a failure condition is distinguished from a failure MODE',
    /A FAILURE CONDITION IS NOT A FAILURE MODE/.test(spec) && /If you find yourself naming a component, you have left the FHA/.test(spec),
    'App A.3 draws this explicitly; without it the model writes FMEA rows into the FHA');
  check('NEW — loss AND malfunction are both required, with the total/partial split',
    /TWO CATEGORIES, BOTH REQUIRED/.test(spec) && /TOTAL \(the function cannot be performed by any means\) or PARTIAL/.test(spec) &&
    /erroneous, uncommanded, misleading/.test(spec),
    'A.3: in general each function has at least one of each — a function with only losses is usually incomplete');
  check('NEW — crew awareness splits a failure condition in two',
    /CREW AWARENESS SPLITS A FAILURE CONDITION/.test(spec) && /assume the crew continue their duties normally and take NO action/.test(spec),
    'A.8.1; this is also what the FCIM awareness field and the HF crew-credit assist both hang off');
  check('NEW — classification is per flight phase, overall is the worst case',
    /CLASSIFY PER FLIGHT PHASE, THEN TAKE THE WORST/.test(spec) && /never an average and never the cruise case by default/.test(spec),
    'A.5: a classification is established for each phase and the overall is the worst applicable');
  check('NEW — do not anchor on a severity while describing effects',
    /DO NOT ASSUME A CLASSIFICATION WHILE IDENTIFYING EFFECTS/.test(spec),
    'A.5 warns that a preconceived outcome leaves the effects assessment incomplete — the standard\'s own version of the A8.1 abstention rule');
  check('…and it routes that into leaving severity EMPTY rather than guessing',
    /leave severity EMPTY rather than reaching for a plausible value/.test(spec),
    'ties the appendix rule to the abstention machinery the product already ships');
  check('the worksheet tables are right, and the field-definition tables are named as such',
    /Table A7 is the AFHA format example and Table C6 the SFHA capture table; A8 and C5 are their field definitions/.test(spec),
    'the original cited A7/C5 — C5 defines the fields, C6 is the worksheet');
  // 30 Aug 2026 — fha.draft@v2 (severity anchoring) superseded the passing
  // mention with the full inline Table A6 anchor set; the citation got
  // STRONGER, and the check follows it.
  check('Table A6 is cited for the severity anchors', /matching Table A6 anchor id/.test(spec));
  check('the five classes are named', /Catastrophic, Hazardous, Major, Minor or No Safety Effect/.test(spec));
}

// ---------------------------------------------------------------------------
// FMEA METHOD TEXT — ARP4761A App J. Mostly a clean bill: the table citations
// (J1 functional worksheet, J2 piece-part, J3 FMES) are all correct, and the
// FMES grouping rule the product implements — same effect AND same detection,
// rates summed — is exactly what J.4.2 states. Three things were missing, all
// about what happens at the boundaries of the method.
console.log('\n[citations] the FMEA method text');
{
  const ai = S('ai_assistant.js');
  const f = (ai.match(/const _SPEC_FMEA_FUNC = \[[\s\S]*?\]\.join/) || [''])[0];
  const i = (ai.match(/const _SPEC_FMEA_ITEM = \[[\s\S]*?\]\.join/) || [''])[0];

  check('the worksheet tables are cited correctly',
    /Table J1/.test(f) && /Table J2/.test(i) && /Table J3/.test(i),
    'J1 functional worksheet, J2 piece-part worksheet, J3 FMES worksheet — all verified against the contents page');
  check('single-failure scope is stated', /Single-failure analysis only/.test(f),
    'J.2: the effects of a SINGLE failure mode');
  check('the FMES grouping rule matches J.4.2',
    /identical effect AND identical detection \(lambda summed\)/.test(i),
    'J.4.2: same effects and same detection mechanisms, rates summed — the product had this right');

  check('NEW — worst case escalates to a lower indenture level rather than being softened',
    /WORST CASE, THEN GO LOWER/.test(f) && /next lower indenture level/.test(f),
    'J.2 gives the escalation; the spec had the worst-case assumption but not what to do when it is unacceptable');
  check('NEW — the FMES is a summary that may live inside the FMEA',
    /THE FMES IS A SUMMARY, NOT A SECOND ANALYSIS/.test(i) && /need not be a separate analysis/.test(i),
    'J.4.2 says so explicitly — which is what licenses the product treating FMES as a derived view over FMEA rows');
  check('NEW — FMES rows trace back to their contributing causes',
    /carry the potential failure causes it came from/.test(i));
  check('NEW — the single-failure caveat travels with the rate into the fault tree',
    /an FMEA considers SINGLE failures; a fault tree considers single failures AND combinations/.test(i),
    'J.4.2 warns about exactly this, and the product feeds FMES rates into basic events');
}

// ---------------------------------------------------------------------------
// PRA METHOD TEXT — ARP4761A App L. The survivability framing was right but
// overstated, and three parts of the method were absent.
console.log('\n[citations] the PRA method text');
{
  const ai = S('ai_assistant.js');
  const spec = (ai.match(/const _SPEC_PRA = \[[\s\S]*?\]\.join/) || [''])[0];
  check('the survivability framing cites L.1.2 and states the objective correctly',
    /App L\.1\.2 states the PRA is an aircraft SURVIVABILITY analysis/.test(spec) &&
    /not how often a threat occurs but whether the aircraft survives it/.test(spec));
  check('CORRECTED — probability is supplementary, not forbidden',
    /may SUPPORT a claim that a threat is adequately mitigated, but it never replaces the survivability assessment/.test(spec),
    'the spec previously said assert NO probabilities as though the standard banned them; L.1.2 permits a supporting probabilistic analysis, it just refuses to let it substitute');
  check('…while still keeping the model itself out of the numbers',
    /assert NO probabilities or failure rates yourself/.test(spec));
  check('NEW — every risk resolves to eliminated, minimised, or shown acceptable',
    /ELIMINATED, MINIMISED, or SHOWN TO BE ACCEPTABLE/.test(spec),
    'L.1.2 gives exactly these three; a study ending without one has not finished');
  check('NEW — the lifecycle and evidence-maturity rule',
    /drawings and models first, then mockups, then the actual aircraft/.test(spec) &&
    /Any modification to the aircraft is assessed for impact on each PRA/.test(spec));
  check('NEW — a gap in the applicability list is surfaced rather than silently honoured',
    /a gap in it is worth surfacing even though you must not study a risk marked not-applicable/.test(spec),
    'the applicability list is AUTHORITATIVE for what to study, but the model should still say when App L names a risk the list omits');
  check('the canonical set points at L.1.3 rather than reproducing it',
    /App L\.1\.3 lists the risks commonly considered/.test(spec) &&
    !/Ram Air Turbine blade release \(RAT burst\)/.test(spec),
    'SAE material is cite-and-point — the list is characterised, not copied');
}

// ---------------------------------------------------------------------------
// ZSA METHOD TEXT — ARP4761A App K. The checkpoint categories and the inspector
// questionnaire were sound; four rules were absent, one of which changes what
// the model looks at rather than how it words the answer.
console.log('\n[citations] the ZSA method text');
{
  const ai = S('ai_assistant.js');
  const spec = (ai.match(/const _SPEC_ZSA = \[[\s\S]*?\]\.join/) || [''])[0];
  check('NEW — inherent physical hazards are assessed regardless of functional criticality',
    /INHERENT PHYSICAL HAZARDS ARE ASSESSED REGARDLESS OF FUNCTIONAL CRITICALITY/.test(spec) &&
    /Never scope a zone by which equipment matters functionally/.test(spec),
    'K.3.1 is explicit that this is done whatever the functional hazard classification, so non-critical equipment is not skipped — a model reasoning from the FHA would skip exactly that equipment');
  check('NEW — the model must not invent a zoning scheme',
    /DO NOT INVENT A ZONING SCHEME/.test(spec) && /CONSISTENT with the designations the aircraft already uses/.test(spec),
    'K.4.1: zones may be defined outside the ZSA and should match the aircraft\'s existing designations');
  check('NEW — the partitioning rules, framed as judging a layout rather than authoring one',
    /The environment within a zone should be fairly UNIFORM/.test(spec) &&
    /flag excessive partitioning/.test(spec),
    'K.4.1 gives both directions: sub-partition a non-uniform zone, consolidate over-partitioned ones');
  check('NEW — the ZSA/PRA division of labour is stated as K.3.1 states it',
    /well known AND may extend BEYOND a single zone are typically handled by a PRA/.test(spec),
    'the spec previously framed the link as reconciliation; K.3.1 gives the actual boundary');
  check('the questionnaire and cross-link survive', /TAILORED INSPECTOR QUESTIONNAIRE/.test(spec) && /ZSA<->PRA CROSS-LINK/.test(spec));
}

// ---------------------------------------------------------------------------
// CMA METHOD TEXT — ARP4761A App M. The vocabulary was right: Independence
// Principles is the appendix's own term, and the failure/error classification
// matches M.3. What was missing is that CMA is TWO activities, and the spec
// described only one of them.
console.log('\n[citations] the CMA method text');
{
  const ai = S('ai_assistant.js');
  const spec = (ai.match(/const _SPEC_CMA = \[[\s\S]*?\]\.join/) || [''])[0];
  check('Independence Principles is used as App M uses it', /Independence Principle/.test(spec));
  check('the failure / error / both classification survives', /common-cause FAILURE and\/or ERROR/.test(spec));

  check('NEW — CMA is declared QUALITATIVE and kept out of the numbers',
    /CMA is a QUALITATIVE method/.test(spec) && /Assert no probabilities or beta factors/.test(spec));
  check('NEW — the development and verification phases are distinguished',
    /WHICH PHASE ARE YOU IN\?/.test(spec) && /the two are not interchangeable/.test(spec),
    'M.3: the nature of the evaluation is determined by when in the cycle it is performed');
  check('…and each phase is bound to its assessment and its output',
    /supporting PASA at aircraft level, PSSA at system level/.test(spec) &&
    /supporting ASA at aircraft level, SSA at system level/.test(spec) &&
    /output is independence REQUIREMENTS/.test(spec) && /output is evidence and feedback/.test(spec),
    'development asks whether the principles CAN be satisfied; verification asks whether they HAVE been');
  check('NEW — Table M1 is a source to tailor from, not a checklist to walk',
    /THE QUESTIONNAIRE IS A SOURCE, NOT A CHECKLIST/.test(spec) &&
    /help generate a PROJECT-SPECIFIC set of questions/.test(spec),
    'M.3 says exactly this, and a model handed a generic list will otherwise answer every entry');
  check('NEW — the link to DAL assignment is stated',
    /THIS FEEDS DAL ASSIGNMENT/.test(spec) && /a principle that fails here invalidates the reduction that rested on it/.test(spec),
    'App M states the CMA supports DAL assignment per App P — and the allocator already reverts a reduction on a compromised claim');

  const ccf = (ai.match(/const _SPEC_CCF = \[[\s\S]*?\]\.join/) || [''])[0];
  check('CCF quantification is separated from the qualitative CMA in the source',
    /CCF quantification is NOT the CMA/.test(ai) && /conflating them lets a number stand in for an argument/.test(ai));
}

console.log('\n[citations] copyright posture');
{
  // SAE material is licensed, not public domain. The repo's standing rule is
  // cite-and-point for J3307 and SORA Annex E; ARP4761A and ARP4754B are the same
  // kind of document and get the same treatment. NASA HIDH/HFACS are US Gov
  // public domain and may carry short quotes — that asymmetry is deliberate.
  const kb = S('stpa_kb_data.js');
  check('the STPA corpus still states that no J3307 text is stored',
    /copyright/i.test(kb) && /(never paste|not stored|no .{0,20}text)/i.test(kb));
  const all = ['program_plan.js', 'next_step.js', 'ai_assistant.js'].map(S).join('\n');
  // The needle is ASSEMBLED rather than written out. Spelling the clause sentence
  // into a guard would put the only verbatim copy of it in the repo inside the
  // check meant to prevent verbatim copies — which is exactly what happened on
  // the first run of this file: the self-check found the pattern on the line
  // above it and failed. A detector for a string must not BE that string.
  const needle = ['the safety assessment process described in this document',
                  'assumes that flight crews', 'cabin crews'].join(', ')
                 .replace('document, assumes', 'document assumes');
  const hasProse = (hay) => String(hay).toLowerCase().indexOf(needle) >= 0;
  check('no ARP clause prose was copied into the product alongside the citations',
    !hasProse(all),
    'clause numbers and titles are cite-and-point; reproducing the paragraph is not');
  check('and none was copied into this file either',
    !hasProse(fs.readFileSync(__filename, 'utf8')),
    'the guard is assembled from fragments so it cannot trip on itself');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

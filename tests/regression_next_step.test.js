#!/usr/bin/env node
/*
 * Regression — A11, the next-step recommender (site/next_step.js).
 *
 * This module answers one question — "what do I do now?" — and the ways it can
 * be wrong are worse than being absent. An absent recommender sends the engineer
 * to think. A wrong one sends them to work.
 *
 * The five properties this suite exists to defend:
 *
 *   1. THE SPINE IS IN IT. program_plan.js gates only OPTIONAL lanes; functions,
 *      FHA, FCIM, requirements, systems, items and FMEA are not in its catalogue
 *      by design (regression_program_plan.test.js pins that). A recommender built
 *      on the catalogue alone answers the empty-project case — the case it exists
 *      for — with "twenty lanes blocked" and no way forward. So this module
 *      carries its own spine table, and these checks make sure it stays there.
 *
 *   2. DERIVED LANES ARE NOT WORK. CCMR, FMES and the Independence Ledger author
 *      nothing; they recompute from the fault trees and the FMEA rows on every
 *      read. If they were counted as lanes, adding one basic event would advance
 *      four lanes at once and the board would report progress nobody made.
 *
 *   3. THE SEVERITY GATE IS THE POINT. An unclassified failure condition is the
 *      one input the deterministic core will consume perfectly and produce a
 *      perfectly wrong DAL from. It has to reach "waiting on you" every time.
 *
 *   4. ENGINE IS NOT AI. Requirement generation, DAL allocation and probability
 *      budgets are deterministic — no model drafts them and no engineer needs to
 *      review a guess. Labelling them "AI" would both overstate the model and
 *      invite review effort where none is owed.
 *
 *   5. IT RECOMMENDS, IT DOES NOT RUN. No drafting call may originate here. An
 *      assistant that drafts an FHA, seeds a control structure from its own
 *      unreviewed FHA, then writes requirements from that is compounding
 *      unreviewed work, and each layer reads as more settled than the last.
 *
 * Run: node tests/regression_next_step.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');

// ---- node-side stand-ins for the globals both modules read ------------------
global.projectConfig = {
    regulation: 'Part 25',
    msg3:  { msis: [{}, {}, {}] },
    msg3x: { ssis: [{}], lhirf: [], zonesDone: { z1: true } },
    mmel:  { items: [{}, {}] },
    lcc:   { items: [{}] },
    swrel: { cscis: [{}, {}] },
    sneak: { dispositions: { a: 1, b: 2 } },
    ram:   { tasks: [{}, {}, {}, {}] },
    mxAnalytics: { lora: [{}] },
    bowties: [{}],
    sora: { opType: 'BVLOS' }
};
global.ftaPages = [];
global.praData = []; global.zsaData = []; global.cmaData = []; global.etaData = [];
global.acFunctionsData = []; global.acFhaData = []; global.acFcimData = [];
global.acReqData = []; global.systemsData = []; global.itemsData = []; global.fmeaData = [];
global.stpaData = null;

const PP = require('../site/program_plan.js');
const N  = require('../site/next_step.js');
const src = S('next_step.js'), idx = S('index.html'), pp = S('program_plan.js');

// A minimal plan double. Real CATALOGUE entries are exercised further down; this
// one isolates the bucket logic from whatever the catalogue happens to hold today.
const plan = (over) => Object.assign({
    CATALOGUE: [
        { id: 'fta',  name: 'Fault Tree Analysis', std: 'ARP4761A App D', tabs: ['fta'] },
        { id: 'hfa',  name: 'Human Factors Analysis', std: 'HIDH', tabs: ['hfa'] },
        { id: 'fmes', name: 'Failure Modes Summary', std: 'rollup', tabs: ['fmes'] },
        { id: 'ccmr', name: 'Latent failures', std: 'CCMR', tabs: ['ccmr'] }
    ],
    DERIVED: { fmes: true, ccmr: true, ipledger: true },
    NO_STORE: { 'hfa-ergo': true },
    basisNow: () => 'Part 25',
    laneOn: () => true,
    isExpected: () => true,
    laneData: () => 0
}, over || {});
const P = (o) => Object.assign({ functions: 0, systems: 0, items: 0, fhaAny: 0, fhaClassified: 0, trees: 0 }, o || {});
const A = (prim, over, counts) => N.assess({ PP: plan(over), primitives: P(prim), counts: counts || {} });
const idsOf = arr => arr.map(l => l.id);

// ---- [1] the spine ----------------------------------------------------------
console.log('\n[A11] the spine is in the recommender, not just the catalogue');
{
  const spineIds = N.SPINE.map(l => l.id);
  ['ac-func', 'ac-fha', 'ac-fcim', 'ac-req', 'sys-dir', 'sys-fha', 'items', 'fmea'].forEach(id => {
    check('spine carries ' + id, spineIds.indexOf(id) >= 0);
  });
  check('the spine is NOT in the plan catalogue (this module owns it on purpose)',
    !PP.CATALOGUE.some(l => spineIds.indexOf(l.id) >= 0),
    'if the catalogue ever gains a spine lane, delete it from here rather than listing it twice');
}
{
  const a = A({});
  check('an EMPTY project names the first move rather than only listing blockers',
    a.waiting.some(w => /No aircraft functions/.test(w.what)) &&
    idsOf(a.ready).indexOf('ac-func') >= 0,
    'the empty project is the case this module exists for — it must never answer with blockers alone');
  check('and the FHA is blocked behind functions, not offered alongside them',
    idsOf(a.blocked).indexOf('ac-fha') >= 0);
}
{
  const a = A({ functions: 4 });
  check('with functions defined, the FHA becomes the next move', idsOf(a.ready).indexOf('ac-fha') >= 0);
  check('every spine lane is flagged as spine in the output',
    a.ready.concat(a.blocked, a.inWork).filter(l => N.SPINE.some(s => s.id === l.id)).every(l => l.spine === true));
}

// ---- [2] derived lanes are quarantined --------------------------------------
console.log('\n[A11] derived lanes are output, not work');
{
  const a = A({ functions: 2, fhaAny: 3, fhaClassified: 3, trees: 1 }, null, { fmes: 12, ccmr: 7 });
  const working = idsOf(a.ready).concat(idsOf(a.inWork), idsOf(a.blocked));
  check('FMES never appears as a lane to work', working.indexOf('fmes') < 0,
    'it groups FMEA rows — there is nothing to author in it');
  check('CCMR never appears as a lane to work', working.indexOf('ccmr') < 0);
  check('both are surfaced under their own heading instead', idsOf(a.derived).sort().join(',') === 'ccmr,fmes');
  // Derived lanes hold no authored work and no certification basis expects them,
  // so the authored-work rule that governs every other lane would silence them on
  // every project forever. They surface on READINESS — their inputs existing is
  // the whole reason there is anything to read.
  check('a derived view appears once its INPUTS exist, not once it holds work',
    idsOf(A({ functions: 2, fhaAny: 3, fhaClassified: 3, trees: 1 }, { isExpected: () => false }).derived).indexOf('ccmr') >= 0,
    'CCMR count is 0 by construction — gating it on count would hide it permanently');
  check('…and stays hidden while its inputs do not',
    idsOf(A({ functions: 2, fhaAny: 3, fhaClassified: 3, trees: 0 }).derived).indexOf('ccmr') < 0,
    'a latent-failure sweep with no trees to sweep has nothing to say');
  check('a derived lane switched off in the plan stays off',
    idsOf(A({ functions: 2, fhaAny: 3, fhaClassified: 3, trees: 1 }, { laneOn: id => id !== 'ccmr' }).derived).indexOf('ccmr') < 0);
  check('a derived lane with rows does NOT count as a started lane',
    a.inWork.every(l => !l.derived),
    '12 FMES groups means somebody wrote FMEA rows, not that FMES was started');
  const h = N.html({ PP: plan(), primitives: P({ functions: 2, fhaAny: 3, fhaClassified: 3, trees: 1 }), counts: { fmes: 12 } });
  check('the UI says out loud that a derived lane strands nothing', /strands nothing/.test(h));
  check('the derived heading states they have no work of their own', /no work of their own/.test(h));
}
check('the authored/derived split is READ from program_plan, not re-declared here',
  /PP\.DERIVED/.test(src) && !/const DERIVED = \{/.test(src),
  'two modules disagreeing about whether FMES is real work is how a plan starts lying');
check('program_plan exports it', PP.DERIVED && PP.DERIVED.fmes === true && PP.DERIVED.ipledger === true);

// ---- [3] the severity gate --------------------------------------------------
console.log('\n[A11] unclassified severity reaches the human');
{
  const a = A({ functions: 2, fhaAny: 9, fhaClassified: 4 });
  const w = a.waiting.filter(x => /severity/.test(x.what))[0];
  check('an unclassified failure condition raises a decision', !!w);
  check('it counts them exactly', w && /^5 failure conditions with no severity$/.test(w.what), w && w.what);
  check('the singular reads correctly',
    A({ functions: 1, fhaAny: 1, fhaClassified: 0 }).waiting.some(x => /^1 failure condition with no severity$/.test(x.what)));
  check('the reason names WHY it matters — the engine will be correct and wrong',
    w && /DAL and probability targets/.test(w.why) && /correct arithmetic on an unverified input/.test(w.why),
    '"please fill this in" gets dismissed; naming the consequence does not');
  check('it points at the tab that fixes it', w && w.where === 'ac-fha');
}
check('a fully classified FHA raises nothing',
  !A({ functions: 2, fhaAny: 4, fhaClassified: 4 }).waiting.some(x => /severity/.test(x.what)));
check('a classified FHA with no tree yet is also surfaced',
  A({ functions: 2, fhaAny: 4, fhaClassified: 4 }).waiting.some(x => /No fault tree/.test(x.what)),
  'severity sets a probability target; until a tree exists that target is an intention, not a claim');
check('…and it stops once a tree exists',
  !A({ functions: 2, fhaAny: 4, fhaClassified: 4, trees: 1 }).waiting.some(x => /No fault tree/.test(x.what)));

// ---- [4] precedence is real ------------------------------------------------
console.log('\n[A11] precedence comes from the standard, not from a model');
check('FTA needs a CLASSIFIED failure condition, not merely any',
  N.NEEDS.fta.join() === 'fhaClassified' &&
  idsOf(A({ functions: 2, fhaAny: 9, fhaClassified: 0 }).blocked).indexOf('fta') >= 0,
  'a tree is built FOR a classified condition — building one first inverts the argument');
check('…and unblocks once one is classified',
  idsOf(A({ functions: 2, fhaAny: 9, fhaClassified: 1 }).ready).indexOf('fta') >= 0);
check('the blocker is named in the engineer\'s words, not the primitive key',
  A({ functions: 2, fhaAny: 9 }).blocked.filter(l => l.id === 'fta')[0].blockedBy.join() === 'classified failure conditions');
check('CCA lanes have NO prerequisite — common-cause work runs throughout',
  !N.NEEDS.pra && !N.NEEDS.zsa,
  'gating CCA behind the trees would reproduce the mistake ARP4761A App H/I exists to prevent');
check('nothing in the precedence table refers to another lane',
  Object.keys(N.NEEDS).every(k => N.NEEDS[k].every(p => Object.keys(N.PRIMITIVES).indexOf(p) >= 0)),
  'a primitive is checkable; a lane is an opinion');
check('a lane switched OFF in the plan is not recommended',
  idsOf(A({ functions: 2, fhaAny: 1, fhaClassified: 1 }, { laneOn: id => id !== 'hfa' }).ready).indexOf('hfa') < 0);
check('a lane the basis does not expect still shows once it holds work',
  idsOf(A({ functions: 2 }, { isExpected: () => false }, { hfa: 5 }).inWork).indexOf('hfa') >= 0,
  'work that exists outranks a table\'s opinion about whether it should');

// ---- [5] engine is not AI ---------------------------------------------------
console.log('\n[A11] deterministic work is not labelled as a model draft');
{
  const req = N.SPINE.filter(l => l.id === 'ac-req')[0];
  check('requirement generation is labelled ENGINE', req.assist && req.assist.kind === 'engine');
  check('and says explicitly that no model is involved', /no model involved/.test(req.assist.text));
  check('no assist entry claims a model writes requirements or allocates DAL',
    !Object.keys(N.ASSIST).concat(N.SPINE.map(l => l.id)).some(k => {
      const a = N.ASSIST[k] || (N.SPINE.filter(l => l.id === k)[0] || {}).assist;
      return a && a.kind === 'ai' && /requirement|DAL|probability budget/i.test(a.text);
    }),
    'DALgebra and AutoReq are deterministic — crediting them to the model misstates what needs review');
  const h = N.html({ PP: plan(), primitives: P({ functions: 2, fhaAny: 2, fhaClassified: 2 }) });
  check('the ENGINE tag is rendered, not just modelled', /<b>ENGINE<\/b>/.test(h));
  check('the AI tag is rendered too', /<b>AI<\/b>/.test(h));
}
check('the FHA assist advertises abstention rather than completeness',
  /declines severity rather than guessing/.test(N.SPINE.filter(l => l.id === 'ac-fha')[0].assist.text),
  'A8.1/A10 shipped the abstention; the recommender should set the expectation that a blank is a correct answer');

// ---- [6] manual lanes are listed, not hidden --------------------------------
console.log('\n[A11] uneven coverage is stated, not concealed');
{
  const a = A({ functions: 3 });
  check('a lane WITH an assist is offered', idsOf(a.ready).indexOf('hfa') >= 0);
  // ac-func / sys-dir / items have no assist and never will — you define the
  // aircraft. They are the standing example of a manual lane.
  check('a lane with no AI assist is still offered', idsOf(a.ready).indexOf('ac-func') >= 0);
  check('and is counted in the manual tally', idsOf(a.manual).indexOf('ac-func') >= 0);
  const h = N.html({ PP: plan(), primitives: P({ functions: 3 }) });
  check('MANUAL is rendered on the lane itself', /MANUAL — no AI assist exists/.test(h));
  check('the coverage note states where cover is thin', /RAM and human factors have one narrow touch each/.test(h));
  check('the note explains why they are listed anyway', /a menu, not a plan/.test(h));
}
// HF got its first assist on 1 Aug 2026 (hfa.draft). Both lanes it touches are
// marked PARTIAL, which is the honest label: it writes the sentence and leaves
// every measured quantity blank. Ergonomics still has nothing, and still says so.
check('the HF assist is declared PARTIAL on both lanes it touches',
  N.ASSIST.hfa && N.ASSIST.hfa.partial === true &&
  N.ASSIST['hfa-task'] && N.ASSIST['hfa-task'].partial === true,
  'it registers crew credit and drafts prose — it does not do human factors');
check('and it says out loud what it leaves to the engineer',
  /every measured quantity is left for you/.test(N.ASSIST.hfa.text));
check('the task-ledger note explains it is the same register, not a second feature',
  /the task ledger is the HF-typed assumptions/.test(N.ASSIST['hfa-task'].text));
check('ergonomics still has NO assist and is not given a phantom one',
  !N.ASSIST['hfa-ergo'],
  'hf_ergo authors nothing and refuses uncited coefficients — there is nothing honest to draft there');
check('MSG-3 is marked partial rather than full cover',
  N.ASSIST['ram-msg3'].partial === true && /rationale only/.test(N.ASSIST['ram-msg3'].text));

// ---- [7] it recommends, it does not run -------------------------------------
console.log('\n[A11] nothing here runs on its own');
['populateFha', 'recommendRequirements', 'populateFcim', 'synthesizeTree', '_anemBatch', '_anemRun']
  .forEach(fn => check('no call to ' + fn, src.indexOf(fn + '(') < 0,
    'chaining drafting steps compounds unreviewed work, and each layer looks more settled than the last'));
check('no network call of any kind',
  !/\bfetch\s*\(|XMLHttpRequest|sendBeacon/.test(src));
check('no write to any project store',
  !/\b(acFhaData|acReqData|systemsData|itemsData|ftaPages|projectConfig)\s*(=[^=]|\.push\()/.test(src),
  'a recommender that edits the thing it is assessing cannot be trusted about it');
check('the module says so in its own header', /It reads the state, says what\s*\n?\/\/ is next, and stops/.test(src) || /says what[\s\S]{0,40}is next, and stops/.test(src));

// ---- [8] failure modes ------------------------------------------------------
console.log('\n[A11] degrades rather than throws');
check('no programme plan → null, not an exception', N.assess({ PP: null }) === null);
check('a malformed plan → null', N.assess({ PP: { CATALOGUE: 'nope' } }) === null);
check('the UI says so instead of rendering an empty board', /Program plan not loaded/.test(N.html({ PP: null })));
check('a laneData that throws costs that lane its count, not the whole board',
  (() => { try { const a = N.assess({ PP: plan({ laneData: () => { throw new Error('boom'); } }), primitives: P({ functions: 2 }) }); return !!a && a.lanes.length === 4; } catch (_) { return false; } })());
check('a basisNow that throws does not take the board with it',
  (() => { try { return !!N.assess({ PP: plan({ basisNow: () => { throw new Error('x'); } }), primitives: P({}) }); } catch (_) { return false; } })());
check('assess() runs headlessly with no DOM at all', typeof N.assess === 'function' && N.assess({ PP: plan(), primitives: P({}) }) !== null);
check('render() is a no-op without a document rather than a crash',
  (() => { try { N.render('nope'); return true; } catch (_) { return false; } })());

// ---- [9] the counts it reads are honest -------------------------------------
// A11 reads laneData for its READY-vs-IN-WORK split. Before 1 Aug 2026 that
// function returned 0 for seventeen of the twenty-five lanes, so a project with
// forty MSG-3 MSIs would have been told MSG-3 was ready to start.
console.log('\n[A11] laneData tells the truth about authored work');
// 3 MSIs + 1 SSI + 0 L/HIRF + 1 completed zone = 5. All four terms are counted
// because all four are authored; dropping any of them would understate the lane.
check('MSG-3 counts its MSIs, SSIs, L/HIRF items and completed zones', PP.laneData('ram-msg3') === 5, String(PP.laneData('ram-msg3')));
check('MMEL counts dispatch items', PP.laneData('ram-mmel') === 2);
check('software reliability counts CSCIs', PP.laneData('ram-swrel') === 2);
check('life-cycle cost counts items', PP.laneData('ram-lcc') === 1);
check('maintainability counts tasks', PP.laneData('ram-mx') === 4);
check('LORA counts its own cases', PP.laneData('ram-lora') === 1);
check('ram-mx and ram-lora stay disjoint — the sub-lane is not folded into its parent',
  PP.laneData('ram-mx') + PP.laneData('ram-lora') === 5,
  'a shared term would double-count and both would report progress nobody made');
check('sneak counts only the DISPOSITIONS, not the mined candidates', PP.laneData('ram-sneak') === 2,
  'the candidate clues are derived from interfaces and resources — nobody authored them');
check('bow-tie counts its barrier records', PP.laneData('bowtie') === 1);
check('SORA counts its operation record', PP.laneData('sora') === 1);
check('derived lanes still return 0, and that is the correct answer',
  PP.laneData('ccmr') === 0 && PP.laneData('fmes') === 0 && PP.laneData('ipledger') === 0,
  'laneData answers "what would be STRANDED" — a recomputed view strands nothing, so the tailoring gate correctly stays quiet');
check('hfa-ergo returns 0 because it has no store, and the code says which', PP.laneData('hfa-ergo') === 0 && /hfa-ergo has no store at all/.test(pp));
check('the reason derived lanes return 0 is written down, not left to be rediscovered',
  /DERIVED LANES RETURN 0 ON PURPOSE/.test(pp));
check('an unknown lane is still 0', PP.laneData('not-a-lane') === 0);

// ---- [9b] the board reads as a narrative ------------------------------------
// Order is not decoration here. The sections answer, in sequence: what needs a
// decision from you, what you can pick up, what you are already doing, and what
// you cannot reach yet. Blocked is the only one you cannot act on, so it goes
// last — parking it between the two actionable sections buries them.
console.log('\n[A11] section order');
{
  const h = N.html({ PP: plan(), primitives: P({ functions: 2, fhaAny: 3, fhaClassified: 1, trees: 1 }), counts: { hfa: 4 } });
  const at = t => h.indexOf('<b>' + t + '</b>');
  check('Waiting on you comes first', at('Waiting on you') >= 0 && at('Waiting on you') < at('Ready to start'));
  check('Ready to start before In work', at('Ready to start') < at('In work'));
  check('In work before Blocked', at('In work') < at('Blocked'),
    'blocked is the one section you cannot act on — it does not belong between the two you can');
  check('Derived comes last of the lane sections', at('Blocked') < at('Derived — no work of their own'));
}

// ---- [10] wiring ------------------------------------------------------------
console.log('\n[A11] wiring');
check('index.html hosts the recommender', /id="next-step-host"/.test(idx));
check('index.html loads the module cache-busted', /src="next_step\.js\?v=[\d.]+"/.test(idx));
check('it loads AFTER program_plan.js, whose catalogue it consumes',
  idx.indexOf('next_step.js') > idx.indexOf('program_plan.js'));
check('the program_plan buster moved with it — otherwise returning browsers get a plan with no DERIVED map',
  PIN.atLeast(idx, 'program_plan.js', '1.1'));
check('visiting the plan page re-renders it', /renderNextStep\('next-step-host'\)/.test(pp));
check('it re-renders on EVERY visit, not once',
  /routed === 'spp'[\s\S]{0,700}renderNextStep/.test(pp),
  'a cached recommendation is a recommendation about a project you no longer have');
check('the module exposes render on window for that call', /window\.renderNextStep = render/.test(src));
check('deep links go through switchTab rather than reimplementing navigation',
  /switchTab\(a\.getAttribute\('data-nextstep-tab'\)\)/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

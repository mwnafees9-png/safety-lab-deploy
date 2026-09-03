#!/usr/bin/env node
/*
 * Regression — arch.recommend, the design-enhancement feature.
 *
 * WHAT IT WAS. A panel that drafted advisory architecture improvements as prose
 * and showed them with `onAccept: null`. Three consequences, none obvious on
 * screen:
 *
 *   · Nothing tied a recommendation to anything in the project. "Add a
 *     dissimilar channel to the pitch-trim path" and a recommendation citing a
 *     failure condition that does not exist rendered identically, and neither
 *     could be checked by anyone.
 *   · With no onAccept the panel was read-only, so a good recommendation
 *     evaporated when it closed. The engineer's only option was to retype it.
 *   · With no editableFields the panel reported `offered: 0` to the autonomy
 *     readout, so the coverage figure — the whole defence against an assistant
 *     that improves its score by saying less — was dead for this feature.
 *
 * WHAT IT IS NOW. The model is handed opaque refs for every failure condition
 * and every fault tree, and must echo back the ones it derived from. Those refs
 * resolve to review-comment targets, so:
 *
 *   GROUNDING AND PERSISTENCE ARE THE SAME MECHANISM. A ref the model invented
 *   resolves to no target, and a recommendation with no target cannot be filed —
 *   not because a rule forbids it, but because there is nothing to attach it to.
 *   Ungrounded advice is still shown (it may be perfectly sound) and is marked
 *   NOT GROUNDED rather than hidden.
 *
 * That is the property this suite defends. The rest is the A-series bar: the
 * abstention rule reaches the prompt, editable fields turn the edit gate and the
 * telemetry back on, and an invented citation is surfaced rather than dropped.
 *
 * Run: node tests/regression_arch_recommend.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');

const fn = (name) => (ai.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n    \\}')) || [''])[0];
const anchors = fn('_archAnchors');
const apply   = fn('_applyArchRec');
const prompt  = fn('_archRecSystemPrompt');
const run     = (ai.match(/async function _runArchRec\(input\)[\s\S]*?\n    \}/) || [''])[0];

// ---- [1] the prompt ---------------------------------------------------------
console.log('\n[arch] the request the model actually receives');
check('_archRecSystemPrompt was found', prompt.length > 400);
check('the abstention rule reaches this feature', /_ABSTAIN_RULE/.test(prompt),
  'it was drafting into six prose fields with no way to decline any of them');
check('the model is told to copy refs verbatim', /Copy the ref strings EXACTLY as given/.test(prompt));
check('and that an invented ref helps it not at all',
  /an invented ref does not make a recommendation look better grounded, it makes it unfileable/.test(prompt),
  'a rule the model has no incentive to follow is a wish; this one names the cost');
check('an empty basis is framed as a CORRECT outcome, not a failure',
  /"basis": \[\]. That is a correct and expected outcome/.test(prompt),
  'otherwise the model invents a citation rather than return an empty array');
check('the JSON contract carries basis', /"basis":\["fc:\.\.\.","tree:\.\.\."\]/.test(prompt));
check('self-reported confidence is gone from the contract',
  !/"confidence"/.test(prompt),
  'a model\'s own confidence score is the least reliable field it emits, and this one was never even rendered');

// ---- [2] the anchors --------------------------------------------------------
console.log('\n[arch] what a recommendation is allowed to cite');
check('_archAnchors was found', anchors.length > 400);
check('every failure condition is an anchor, both scopes', /_allFhaFCs\(\)\.forEach/.test(anchors));
check('aircraft FCs anchor to an acFha comment target', /kind: 'acFha', id: f\.internalId/.test(anchors));
check('system FCs anchor to sysFha WITH the system id', /kind: 'sysFha', id: f\.internalId, systemId: f\.systemId/.test(anchors),
  'carried because it is known — see the executed check below for what matching actually guarantees');
check('anchors key on internalId, not the display fcId',
  /ref: 'fc:' \+ f\.internalId/.test(anchors),
  'fcId is a human label, can repeat across scopes and can be empty — internalId is the join key the trees use');
check('every rooted fault tree is an anchor', /ref: 'tree:' \+ p\.id/.test(anchors));
check('rootless tree pages are skipped', /if \(!p \|\| !p\.root\) return;/.test(anchors),
  'an empty page is not an architecture to reason about');
check('the anchor label carries the structure worth reasoning about',
  /AND\/INHIBIT/.test(anchors) && /shared event/.test(anchors) && /CCF/.test(anchors));
check('an unclassified severity is shown as such to the model',
  /'UNCLASSIFIED'/.test(anchors),
  'blank would read as "no severity issue here" rather than "nobody has classified this"');
check('anchors are passed to the model as ref+label ONLY',
  /anchors\.slice\(0, 60\)\.map\(function \(a\) \{ return \{ ref: a\.ref, label: a\.label \}; \}\)/.test(run),
  'handing over the comment targets would let the model construct one it was never given');

// ---- [3] resolution — the verifier ------------------------------------------
console.log('\n[arch] an invented citation is surfaced, not swallowed');
check('cited refs are resolved against the anchor map', /anchorByRef\[String\(ref\)\]/.test(run));
check('a ref that resolves contributes a target', /x\._targets\.push\(a\.target\)/.test(run));
check('a ref that does NOT resolve is KEPT for display', /x\._basisBad\.push\(String\(ref\)\)/.test(run),
  'dropping it would hide the one thing worth seeing — that the model cited something imaginary');
check('the reason for keeping it is written down',
  /silently discarding them would hide that the model cited\s*\n\s*\/\/ something that does not exist/.test(run));
check('declined fields are captured for the abstention chips',
  /_abstained = _abstainedFields\(x, \['area', 'recommendation', 'rationale', 'benefit'\]\)/.test(run));

// ---- [4] the panel ----------------------------------------------------------
console.log('\n[arch] the panel is no longer read-only');
check('onAccept is wired — the edit gate and Accept both hang off it',
  /onAccept: _applyArchRec/.test(run) && !/onAccept: null[\s\S]{0,80}ai-rev-panel-arch/.test(ai));
check('editableFields are declared, so coverage is measurable again',
  /editableFields: \[\{ key: 'area'[\s\S]{0,200}key: 'benefit'/.test(run),
  'no editable fields means offered:0, which silently kills the anti-gaming half of the autonomy metric');
check('the disclaimer states how many are actually grounded',
  /cite something in this project and can be filed against it/.test(run));
check('an ungrounded recommendation is labelled, not hidden',
  /NOT GROUNDED IN THIS PROJECT — general advice/.test(run),
  'it may be good advice; what it is not is a finding about this aircraft');
check('a bad ref renders in red with what went wrong',
  /no such artifact/.test(run));
check('the basis chips name artifacts the engineer recognises, not internal ids',
  /where: \(f\.fcId \|\| \('#' \+ f\.internalId\)\)/.test(anchors));
check('abstention chips are rendered on the card', /_abstainChips\(x, \{ area:/.test(run));

// ---- [5] Accept refuses rather than filing somewhere arbitrary --------------
console.log('\n[arch] Accept');
check('_applyArchRec was found', apply.length > 500);
check('it reaches the review module through Review, not a bare global',
  /typeof Review !== 'undefined'/.test(apply) && /R\.addComment\(t, body\)/.test(apply) && !/[^.]\baddComment\(t, body\)/.test(apply),
  'addComment lives inside the review IIFE — a bare call fails on every recommendation');
check('a recommendation with no resolved target is REFUSED',
  /if \(!targets\.length\) \{[\s\S]{0,420}return false;/.test(apply),
  'filing it against an arbitrary artifact would manufacture a link the model never claimed');
check('and the refusal explains what to do instead',
  /Edit it to name a failure condition or tree, or keep it as advice only/.test(apply));
check('the filed comment says it was AI-drafted, in its first line',
  /ARCHITECTURE RECOMMENDATION \(AI-drafted, advisory/.test(apply),
  'a comment that does not say so will later be read as a colleague\'s judgement');
check('it says it is not a requirement and not a design decision',
  /not a requirement and not a design decision/.test(apply));
check('the model and date travel with it', /drafted by ' \+ \(x\._model \|\| 'the model'\)/.test(apply));
check('the basis is recorded in the comment body', /basis: ' \+ \(x\._basisWhere \|\| \[\]\)\.join/.test(apply));
check('provenance fields are stamped on the comment object too',
  /c\.aiGenerated = true; c\.aiFeature = 'arch\.recommend'/.test(apply));
check('it returns false when nothing was filed', /if \(!filed\) \{[\s\S]{0,90}return false; \}/.test(apply),
  '_makeReviewPanel counts a truthy return as success — returning true here would report a phantom accept');
check('it autosaves', /scheduleAutosave/.test(apply));

// ---- [6] the standing rule --------------------------------------------------
console.log('\n[arch] it stays advisory');
check('nothing here writes a requirement',
  !/acReqData/.test(apply) && !/acReqData/.test(anchors),
  'requirement generation is deterministic (AutoReq) — the model never writes one');
check('nothing here writes an FHA row, a severity or a DAL',
  !/acFhaData\.push|\.severity =|\.dal =/.test(apply));
check('the advisory framing survives in the panel disclaimer',
  /Advisory only — recommendations to consider, not requirements or design decisions/.test(run));

// ---- [7] the chain actually works -------------------------------------------
// Source pins cannot tell you that Review.addComment accepts these three target
// shapes. This runs the real review module against them.
console.log('\n[arch] the filing chain, executed');
{
  const sandbox = { console, Date, JSON, Math, Array, Object, String, Number, Boolean, RegExp, Set, Map, isFinite, isNaN, parseInt, parseFloat };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.reviewCommentsData = []; sandbox.reviewCounter = 1;
  sandbox.scheduleAutosave = () => {}; sandbox.activeReviewerName = 'W. Nafees'; sandbox._rtClientToken = 'L';
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(SITE, 'assurance_modules.js'), 'utf8');
  const iife = src.slice(src.indexOf('const Review = (function()'), src.indexOf('const AutoReq = (function()'));
  vm.runInContext(iife + '\n; globalThis.Review = Review;', sandbox);
  const R = sandbox.Review;

  const targets = [
    { kind: 'acFha',   id: 1042 },
    { kind: 'sysFha',  id: 2001, systemId: 'sys-1' },
    { kind: 'ftaPage', id: 'page-777' }
  ];
  targets.forEach(t => { const c = R.addComment(t, 'ARCHITECTURE RECOMMENDATION (AI-drafted, advisory)'); if (c) { c.aiGenerated = true; c.aiFeature = 'arch.recommend'; } });

  check('all three anchor target kinds are accepted by the review module',
    sandbox.reviewCommentsData.length === 3, String(sandbox.reviewCommentsData.length));
  check('the aircraft FHA row carries its comment', R.openCountFor({ kind: 'acFha', id: 1042 }) === 1);
  check('the system FHA row carries its comment', R.openCountFor({ kind: 'sysFha', id: 2001, systemId: 'sys-1' }) === 1);
  check('the fault tree carries its comment', R.openCountFor({ kind: 'ftaPage', id: 'page-777' }) === 1);
  // Documented back-compat in targetMatches: a missing systemId on EITHER side is
  // treated as "any". That is safe because internalId is minted unique across the
  // whole project, so two systems cannot collide on one — but it does mean the
  // systemId on the anchor is precision, not protection. Asserted as it actually
  // behaves; a test that demanded otherwise would be demanding a regression.
  check('a system target still matches when systemId is omitted (documented back-compat)',
    R.openCountFor({ kind: 'sysFha', id: 2001 }) === 1,
    'targetMatches treats a missing systemId as a wildcard; internalId uniqueness is what keeps that safe');
  check('…and a DIFFERENT systemId does not match',
    R.openCountFor({ kind: 'sysFha', id: 2001, systemId: 'sys-OTHER' }) === 0,
    'the wildcard applies only when a side omits it, never when the two disagree');
  check('an invented ref has nothing to attach to',
    R.openCountFor({ kind: 'acFha', id: 9999 }) === 0,
    'which is exactly why Accept refuses it rather than inventing a home for it');
  check('the provenance stamp survives on the stored comment',
    sandbox.reviewCommentsData.every(c => c.aiGenerated === true && c.aiFeature === 'arch.recommend'));
}

// ---- [8] REACHABILITY -------------------------------------------------------
// On 1 Aug 2026 a whole tranche of safety work — the edit gate, abstention and
// verify-repair — was found inert because _useUnifiedFeatures() defaults TRUE and
// short-circuited the FHA, FCIM, requirement and tree lanes into _anemBatch,
// which carried none of it. 2,206 checks were green at the time.
//
// arch.recommend has no such short-circuit today, so everything above is on the
// path the product actually takes. This check exists so that if one is ever
// added, it fails loudly rather than quietly making this suite decorative.
console.log('\n[arch] the path the product actually takes');
{
  const entry = (ai.match(/async function recommendArchitecture\(\)[\s\S]*?\n    \}/) || [''])[0];
  check('recommendArchitecture reaches _runArchRec directly', /_runArchRec\(input\)/.test(entry));
  check('it does NOT short-circuit into the unified engine',
    !/_useUnifiedFeatures/.test(entry) && !/_useUnifiedFeatures/.test(run),
    'if arch.recommend is ever unified, the anchors, the abstention rule and the Accept path must be carried into _anemBatch — none of them travel automatically, and every check above would keep passing while the feature lost them');
  check('the panel it opens is the one these checks describe', /id: 'ai-rev-panel-arch'/.test(run));
  check('the menu entry still points at it', /run: function \(\) \{ return recommendArchitecture\(\); \}/.test(ai));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

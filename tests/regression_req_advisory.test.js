#!/usr/bin/env node
/*
 * Regression — req.recommend is ADVISORY-ONLY (decided by Waqas, 2 Aug 2026).
 *
 * WHAT IT WAS. _applyReqSuggestion pushed model text straight into acReqData.
 * The stated rule — the AI never writes requirements — was false on the one
 * lane where it matters most, and every AI-written row was a second class of
 * row with weaker integrity guarantees (no reqSource, invisible to the orphan
 * sweep's accounting, distinguishable only by provenance fields nobody renders).
 *
 * WHAT IT IS NOW. Accept files the drafted requirement as a review comment on
 * the failure condition(s) it was drafted against, exactly as arch.recommend
 * files architecture advice. The register gains no AI-authored rows, so there
 * is no integrity gap left to patch. The ONE surviving row-writer from an AI
 * action is doc.import, which MIRRORS the engineer's own existing requirements
 * (ReqIF / DOORS / Polarion / SysML) — their content, not the model's.
 *
 * Pre-existing rows carrying aiGenerated / aiFeature:'req.recommend' STAY, with
 * provenance intact. They were engineer-accepted under the rule as it stood;
 * converting or deleting them would silently pull rows already traced
 * downstream. This suite therefore asserts the WRITE PATH is gone, never that
 * stored data was rewritten.
 *
 * Run: node tests/regression_req_advisory.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');

const fn = (name) => (ai.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n    \\}')) || [''])[0];
const apply  = fn('_applyReqSuggestion');
const imp    = fn('_importReqRow');
const rec    = (ai.match(/async function recommendRequirements\(\)[\s\S]*?\n    \}/) || [''])[0];
// The add_requirement case, bounded by its own braces inside _chatRunActions.
const addReq = (ai.match(/case 'add_requirement': \{[\s\S]*?\} break;\n\s*\}/) || [''])[0];

// ---- [1] the write is gone --------------------------------------------------
console.log('\n[req] Accept files a comment, never a row');
check('_applyReqSuggestion was found', apply.length > 500);
check('it never touches acReqData', !/acReqData/.test(apply),
  'the entire point of the decision — the AI does not write requirement rows');
check('it reaches the review module through Review, not a bare global',
  /typeof Review !== 'undefined'/.test(apply) && /R\.addComment\(t, body\)/.test(apply) && !/[^.]\baddComment\(t, body\)/.test(apply),
  'addComment lives inside the review IIFE — a bare call fails on every proposal');
check('the comment targets the traced failure condition, both scopes',
  /kind: 'sysFha', id: f\.internalId, systemId: f\.systemId/.test(apply) &&
  /kind: 'acFha', id: f\.internalId/.test(apply),
  'so it lands where the engineer is already looking, via the internalId join the arch anchors use');
check('a proposal tracing to no failure condition is REFUSED',
  /if \(!fcs\.length\) \{[\s\S]{0,420}return false;/.test(apply),
  'filing it somewhere arbitrary would manufacture a trace the model never established');
check('and the refusal says what to do instead',
  /Fix the trace, or add the requirement yourself if you adopt it/.test(apply));
check('the filed comment says it was AI-drafted, in its first line',
  /SAFETY REQUIREMENT PROPOSAL \(AI-drafted, advisory/.test(apply),
  'a comment that does not say so will later be read as a colleague\'s judgement');
check('it says the row is the engineer\'s edit to make',
  /add it to the requirements register yourself/.test(apply));
check('provenance fields are stamped on the comment object',
  /c\.aiGenerated = true; c\.aiFeature = 'req\.recommend'/.test(apply));
check('the model and date travel with it', /drafted by ' \+ \(rq\._model \|\| 'the model'\)/.test(apply));
check('it returns false when nothing was filed', /if \(!filed\) \{[\s\S]{0,90}return false; \}/.test(apply),
  '_makeReviewPanel counts a truthy return as success');
check('it autosaves', /scheduleAutosave/.test(apply));
check('the class is normalised through the live taxonomy, not a private list',
  /ReqTaxonomy/.test(apply) && /migrateRow/.test(apply));

// ---- [2] the panel tells the truth ------------------------------------------
console.log('\n[req] the panel wording matches the behaviour');
check('the disclaimer says comments are filed, not rows added',
  /Accept files each proposal as a review comment/.test(rec),
  'it said "Accept adds the requirement to the Aircraft Requirements table"');
check('the disclaimer states the rule itself',
  /the AI never writes requirement rows/.test(rec));
check('doneMsg no longer claims "requirement(s) added"',
  !/doneMsg: 'requirement\(s\) added'/.test(rec) && /proposal\(s\) filed as review comments/.test(rec),
  'the toast was the last surface still describing the old behaviour');

// ---- [3] the model is not told it authors rows ------------------------------
console.log('\n[req] the specs the model actually reads');
{
  const spec = (ai.match(/const _SPEC_REQ = \[[\s\S]*?\]\.join\('\\n'\);/) || [''])[0];
  check('_SPEC_REQ EXPECTED OUTPUTS says advisory, filed as review comment',
    /ADVISORY requirement proposals/.test(spec) && /filed as a review comment/.test(spec));
  check('_SPEC_REQ says the register edit belongs to the engineer',
    /their edit, not yours/.test(spec));
  check('the unified directive carries the same posture',
    /never written into the requirements register/.test((ai.match(/req: {3}'[\s\S]*?',\n/) || [''])[0]),
    '_FEATURE_DIRECTIVE.req is what the primary (unified) path actually sends');
  check('the chat op list declares add_requirement advisory',
    /add_requirement \{[^}]*\} — ADVISORY: files as a review comment/.test(ai));
}

// ---- [4] doc.import mirroring survives, and ONLY doc.import -----------------
console.log('\n[req] the one legitimate row-writer');
check('_importReqRow exists and writes acReqData', /acReqData\.push\(row\)/.test(imp));
check('it stamps aiFeature doc.import, not req.recommend',
  /aiFeature: 'doc\.import'/.test(imp) && !/aiFeature: 'req\.recommend'/.test(imp),
  'a mirrored row attributed to req.recommend would reopen the gap this closes');
check('the add_requirement case branches on the doc.import feature',
  /const _mirror = \(feature === 'doc\.import'\)/.test(addReq));
check('the aircraft mirror path uses _importReqRow',
  /_importReqRow\(\{ text: a\.text/.test(addReq));
check('the advisory path is the DEFAULT (undefined feature files a comment)',
  /: _applyReqSuggestion\(\{ text: a\.text/.test(addReq),
  'chat passes no feature tag — an unknown or absent feature must fall on the advisory side, never the writing side');
check('the system-scope direct push is also gated behind mirroring',
  /if \(_mirror\) \{[\s\S]{0,600}sysObj\.req\.push/.test(addReq),
  'sysObj.req.push was an unconditional second write path the aircraft-side fix alone would have missed');
check('the system-scope advisory path scopes to the named system',
  /_systemId: a\.systemId/.test(addReq));
check('result summaries no longer claim "requirement added" on the advisory path',
  /Requirement proposal filed as review comment/.test(addReq) && !/Aircraft requirement added/.test(addReq));

// ---- [5] REACHABILITY — both paths land on the same accept ------------------
// req.recommend short-circuits into _anemBatch when unified features are on
// (which is the default), so the classic panel alone proving advisory would be
// decorative. The unified path must (a) route accepts through _chatRunActions
// and (b) hand it the feature tag so doc.import can be told apart.
console.log('\n[req] the path the product actually takes');
{
  check('recommendRequirements short-circuits into the unified engine (documented)',
    /_useUnifiedFeatures\(\)/.test(rec) && /_FEATURE_DIRECTIVE\.req/.test(rec));
  check('_anemBatch accepts pass cfg.analysis into _chatRunActions',
    /_chatRunActions\(\[a\], \(attempt\.rr && attempt\.rr\.model\) \|\| MODELS\.reason, undefined, cfg\.analysis\)/.test(ai),
    'without the feature tag every unified accept would look like chat and doc.import mirroring would break');
  check('_chatRunActions declares the feature parameter',
    /function _chatRunActions\(actions, model, modality, feature\)/.test(ai));
  check('the classic panel still wires onAccept to _applyReqSuggestion',
    /onAccept: _applyReqSuggestion/.test(rec));
}

// ---- [6] the filing chain, executed -----------------------------------------
// Source pins cannot tell you the function actually files. This executes the
// REAL _applyReqSuggestion (extracted verbatim) against the REAL review module.
console.log('\n[req] the accept path, executed');
{
  const sandbox = { console, Date, JSON, Math, Array, Object, String, Number, Boolean, RegExp, Set, Map, isFinite, isNaN, parseInt, parseFloat };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.reviewCommentsData = []; sandbox.reviewCounter = 1;
  sandbox.scheduleAutosave = () => {}; sandbox.activeReviewerName = 'W. Nafees'; sandbox._rtClientToken = 'L';
  sandbox.acReqData = [];
  sandbox._toasts = [];
  sandbox._toast = (m) => { sandbox._toasts.push(String(m)); };
  // 29 Aug 2026 (Skills V1.1): writers stamp aiSkill via _skillStampFor,
  // defined in the engine's IIFE at runtime - the harness supplies it here.
  sandbox._skillStampFor = () => null;
  // Two FCs on FN-2 (one AFHA, one SFHA) and one on FN-9 in another system.
  sandbox._allFhaFCs = () => ([
    { internalId: 11, fcId: 'FC-01', subId: 'FN-2', scope: 'AFHA', systemId: '', fcDesc: 'Loss of X' },
    { internalId: 12, fcId: 'FC-02', subId: 'FN-2', scope: 'SFHA', systemId: 'sys-1', fcDesc: 'Loss of X (sys)' },
    { internalId: 13, fcId: 'FC-03', subId: 'FN-9', scope: 'SFHA', systemId: 'sys-2', fcDesc: 'Other' }
  ]);
  sandbox._validReqLevel = (v) => { const s = String(v == null ? '' : v).trim().toUpperCase(); return (s === 'L1' || s === 'L2' || s === 'L3') ? s : 'L1'; };
  vm.createContext(sandbox);
  const rsrc = fs.readFileSync(path.join(SITE, 'assurance_modules.js'), 'utf8');
  vm.runInContext(rsrc.slice(rsrc.indexOf('const Review = (function()'), rsrc.indexOf('const AutoReq = (function()')) + '\n; globalThis.Review = Review;', sandbox);
  vm.runInContext(apply + '\n; globalThis._fn = _applyReqSuggestion;', sandbox);
  vm.runInContext(imp + '\n; globalThis._imp = _importReqRow;', sandbox);

  const ok = sandbox._fn({ text: 'The FCS shall annunciate loss of X within 1 s.', rationale: 'closes FC-01', traceSubId: 'FN-2', type: 'Safety', verifMethod: 'Test', _model: 'test-model' });
  check('a traced proposal files successfully', ok === true);
  check('one comment per failure condition on the traced subId',
    sandbox.reviewCommentsData.length === 2, String(sandbox.reviewCommentsData.length));
  check('the AFHA comment is findable on its row',
    sandbox.Review.openCountFor({ kind: 'acFha', id: 11 }) === 1);
  check('the SFHA comment is findable on its row, system-scoped',
    sandbox.Review.openCountFor({ kind: 'sysFha', id: 12, systemId: 'sys-1' }) === 1);
  check('the register gained NOTHING', sandbox.acReqData.length === 0,
    'this is the decision, executed: ' + sandbox.acReqData.length + ' row(s) appeared');
  check('the stored comment opens with the advisory header',
    sandbox.reviewCommentsData.every(c => /^SAFETY REQUIREMENT PROPOSAL \(AI-drafted, advisory/.test(c.text)));
  check('provenance survives on the stored comment',
    sandbox.reviewCommentsData.every(c => c.aiGenerated === true && c.aiFeature === 'req.recommend' && c.aiModel === 'test-model'));

  // Trace by FC ID — what the model actually echoes on the UNIFIED path (the
  // directive says "trace it to the function / failure condition"). Found live
  // on 2 Aug: subId-only resolution refused every grounded proposal in
  // production while this suite stayed green. The join must speak both dialects.
  const byFc = sandbox._fn({ text: 'The FCS shall limit roll rate.', traceSubId: 'FC-02', _model: 'test-model' });
  check('a proposal tracing by fcId files (the unified-path dialect)',
    byFc === true && sandbox.Review.openCountFor({ kind: 'sysFha', id: 12, systemId: 'sys-1' }) === 2,
    'the live bug this check exists for: FC-xx traces were refused as unresolvable');
  const byIid = sandbox._fn({ text: 'The FCS shall alert the crew.', traceSubId: '13', _model: 'test-model' });
  check('a proposal tracing by internalId files',
    byIid === true && sandbox.Review.openCountFor({ kind: 'sysFha', id: 13, systemId: 'sys-2' }) === 1);
  check('an empty fcId on a row never matches anything',
    (function () { sandbox._allFhaFCs = () => ([{ internalId: 99, fcId: '', subId: 'FN-77', scope: 'AFHA', systemId: '' }]);
      const n = sandbox.reviewCommentsData.length;
      const r = sandbox._fn({ text: 'The X shall Y.', traceSubId: '', _model: 'm' });
      return r === false && sandbox.reviewCommentsData.length === n; })(),
    'an empty trace matching an empty label would file comments on unlabelled rows at random');

  // restore the fixture for the refusal case below
  sandbox._allFhaFCs = () => ([
    { internalId: 11, fcId: 'FC-01', subId: 'FN-2', scope: 'AFHA', systemId: '', fcDesc: 'Loss of X' },
    { internalId: 12, fcId: 'FC-02', subId: 'FN-2', scope: 'SFHA', systemId: 'sys-1', fcDesc: 'Loss of X (sys)' },
    { internalId: 13, fcId: 'FC-03', subId: 'FN-9', scope: 'SFHA', systemId: 'sys-2', fcDesc: 'Other' }
  ]);
  const before = sandbox.reviewCommentsData.length;
  const bad = sandbox._fn({ text: 'The X shall Y.', traceSubId: 'FN-9999', _model: 'test-model' });
  check('an unresolvable trace is refused, not filed somewhere arbitrary',
    bad === false && sandbox.reviewCommentsData.length === before);
  check('…with a toast naming the broken trace',
    sandbox._toasts.some(t => /FN-9999/.test(t)));

  const okImp = sandbox._imp({ text: 'The APU shall …', traceSubId: 'FN-2', level: 'L2', type: 'Safety', _model: 'test-model' });
  check('doc.import mirroring still writes a register row', okImp === true && sandbox.acReqData.length === 1);
  check('the mirrored row is attributed to doc.import',
    sandbox.acReqData[0].aiFeature === 'doc.import');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

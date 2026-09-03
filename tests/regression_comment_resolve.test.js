#!/usr/bin/env node
/*
 * Regression — comment dispositions (FAA roadmap Fig 3: comment reading &
 * resolution), built 2 Aug 2026 as the second half of the advisory loop:
 * req.recommend files advice INTO the review register; this lane helps
 * disposition what the register holds.
 *
 * THE LINE THIS PINS: the AI proposes and files REPLIES. It NEVER resolves,
 * closes, or reopens a thread, and never edits the artifact — resolution is
 * the engineer's signature-grade act. Same grounding mechanism as
 * arch.recommend: opaque refs echoed back; an invented ref is visible and
 * unfileable.
 *
 * Run: node tests/regression_comment_resolve.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');

const fn = (name) => (ai.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n    \\}')) || [''])[0];
const apply = fn('_applyCommentDisposition');
const run = (ai.match(/async function resolveReviewComments\(\)[\s\S]*?\n    \}/) || [''])[0];
const spec = (ai.match(/const _SPEC_RESOLVE = \[[\s\S]*?\]\.join\('\\n'\);/) || [''])[0];

// ---- [1] the spec -----------------------------------------------------------
console.log('\n[cres] the contract the model reads');
check('spec exists and is registered', spec.length > 400 && /'comment\.resolve': _SPEC_RESOLVE/.test(ai));
check('advisory-only is the opening line', /ADVISORY ONLY/.test(spec));
check('the never-list covers resolve/close/edit and the owned lanes',
  /NEVER resolve, close, or reopen a comment/.test(spec) && /NEVER edit the artifact/.test(spec) &&
  /NEVER propose severities, probabilities, DALs or requirement rows/.test(spec));
check('the opaque-ref discipline is stated with its cost',
  /Echo each comment\\?'s ref EXACTLY/.test(spec) && /unfileable/.test(spec),
  'the source escapes the apostrophe inside a single-quoted string — match both spellings');
check('insufficient artifact context routes to needs-discussion, never invention',
  /needs-discussion with the gap named — never invent artifact content/.test(spec));
check('abstention rule rides the prompt', /_ABSTAIN_RULE/.test(run));
check('the feature is registered for the insufficient-information flag',
  /'comment\.resolve': 1/.test(ai));

// ---- [2] the accept path ----------------------------------------------------
console.log('\n[cres] accept files a reply, never a resolution');
check('_applyCommentDisposition exists', apply.length > 400);
check('it files through Review.addComment with the PARENT id — a reply in the thread',
  /R\.addComment\(c\.target, body, c\.commentId\)/.test(apply));
check('it NEVER touches resolveComment / reopenComment',
  !/resolveComment|reopenComment/.test(apply) && !/resolveComment/.test(run),
  'the line itself: resolution is the engineer\'s act');
check('an unresolvable ref is refused with the ref named',
  /cites no open comment in your project/.test(apply));
check('the reply opens with the advisory header and who resolves',
  /COMMENT DISPOSITION PROPOSAL \(AI-drafted, advisory — the thread stays open until YOU resolve it\)/.test(apply));
check('provenance is stamped on the stored reply',
  /reply\.aiGenerated = true; reply\.aiFeature = 'comment\.resolve'/.test(apply));

// ---- [3] the gather ---------------------------------------------------------
console.log('\n[cres] what the model is shown');
check('only ROOT open comments become items — replies are context, not threads',
  /allOpen\(\)\.filter\(function \(c\) \{ return !c\.parentId; \}\)/.test(run));
check('a silent cap is not silent — the dropped count is shown',
  /open\.length > CAP/.test(run) && /were not read this pass/.test(run));
check('a kind the resolver does not know yields the honest empty snippet',
  /no artifact context available — judge only what the comment itself supports/.test(run));
check('the menu offers it with the resolution ownership stated',
  /Draft comment dispositions/.test(ai) && /you resolve/.test(ai));

// ---- [4] executed against the REAL review module ----------------------------
console.log('\n[cres] the filing chain, executed');
{
  const sandbox = { console, Date, JSON, Math, Array, Object, String, Number, Boolean, RegExp, Set, Map };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  sandbox.reviewCommentsData = []; sandbox.reviewCounter = 1;
  sandbox.scheduleAutosave = () => {}; sandbox.activeReviewerName = 'W. Nafees'; sandbox._rtClientToken = 'L';
  sandbox._toasts = []; sandbox._toast = m => sandbox._toasts.push(String(m));
  vm.createContext(sandbox);
  const rsrc = fs.readFileSync(path.join(SITE, 'assurance_modules.js'), 'utf8');
  vm.runInContext(rsrc.slice(rsrc.indexOf('const Review = (function()'), rsrc.indexOf('const AutoReq = (function()')) + '\n; globalThis.Review = Review;', sandbox);
  vm.runInContext(apply + '\n; globalThis._a = _applyCommentDisposition;', sandbox);

  const root = sandbox.Review.addComment({ kind: 'acFha', id: 42 }, 'Severity looks optimistic for a dual-channel loss.');
  const ok = sandbox._a({ ref: 'cmt:' + root.commentId, disposition: 'agree', draftReply: 'The classification should follow the worst credible phase; propose re-evaluating against takeoff.', proposedAction: 'Re-classify after the A5 matrix is filled.', _comment: root, _model: 'test-model' });
  check('a grounded disposition files successfully', ok === true);
  const reply = sandbox.reviewCommentsData.find(c => c.parentId === root.commentId);
  check('the reply lives IN the thread (parentId = the root comment)', !!reply);
  check('the ROOT comment stays OPEN — nothing resolved it',
    root.status === 'open' && (!reply || reply.status === 'open'));
  check('the reply carries the advisory header and provenance',
    !!reply && /^COMMENT DISPOSITION PROPOSAL/.test(reply.text) && reply.aiGenerated === true && reply.aiFeature === 'comment.resolve');
  check('the thread machinery sees both', sandbox.Review.totalCountFor({ kind: 'acFha', id: 42 }) === 2);

  const n = sandbox.reviewCommentsData.length;
  const bad = sandbox._a({ ref: 'cmt:invented-999', disposition: 'agree', draftReply: 'x', _comment: null, _model: 'm' });
  check('an invented ref is refused and files nothing',
    bad === false && sandbox.reviewCommentsData.length === n && sandbox._toasts.some(t => /no thread to file it into/.test(t)));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

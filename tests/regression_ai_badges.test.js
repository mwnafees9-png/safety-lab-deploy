#!/usr/bin/env node
/*
 * Regression tests for Backlog #1 — ai_badges.js (AI confidence tied to fidelity).
 *
 * Loads the REAL site/ai_badges.js headlessly and locks:
 *   [1] row confidence: tier (green/amber/red) × input-fidelity grade (L0..L2)
 *       from recorded provenance + review state — the deterministic mapping.
 *   [2] reviewer-approval path (Review.isApproved) flips red → green/amber.
 *   [3] reportLabel — the plain-text form stamped into final outputs.
 *   [4] draftConfidence — report-section drafts from the E2 state machine.
 *
 * Run:  node tests/regression_ai_badges.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

// Minimal browser-ish globals: window present (no document → no DOM boot).
globalThis.window = globalThis;
eval(fs.readFileSync(path.join(__dirname, '..', 'site', 'ai_badges.js'), 'utf8'));
const AB = globalThis.AiBadges;
check('AiBadges API is exported', AB && typeof AB.confidence === 'function' && typeof AB.draftConfidence === 'function');

console.log('\n[1] Row confidence — tier × grade matrix');
check('manual row → no badge (null)', AB.confidence({ internalId: 1, fcId: 'FC-1' }) === null);

const unrevGrounded = AB.confidence({ internalId: 2, aiGenerated: true, aiFeature: 'fha.populate', aiModel: 'm', aiAt: '2026-07-11T00:00:00Z' });
check('unreviewed grounded draft → RED, L2', unrevGrounded.tier === 'red' && unrevGrounded.grade === 'L2', JSON.stringify(unrevGrounded));

const editedGrounded = AB.confidence({ internalId: 3, aiGenerated: true, aiFeature: 'fmea.piece-part', aiModel: 'm', humanEdited: true });
check('engineer-edited grounded → GREEN, L2', editedGrounded.tier === 'green' && editedGrounded.grade === 'L2', JSON.stringify(editedGrounded));

const editedImage = AB.confidence({ internalId: 4, aiGenerated: true, aiFeature: 'arch.decompose', aiInputModality: 'image+text', aiModel: 'm', humanEdited: true });
check('edited but image-sourced → AMBER, L1 (verify-to-accept)', editedImage.tier === 'amber' && editedImage.grade === 'L1', JSON.stringify(editedImage));

const chatEdited = AB.confidence({ internalId: 5, aiGenerated: true, aiFeature: 'chat.edit', aiModel: 'm', humanEdited: true });
check('conversational chat.edit, edited → AMBER, L1', chatEdited.tier === 'amber' && chatEdited.grade === 'L1', JSON.stringify(chatEdited));

const legacy = AB.confidence({ internalId: 6, aiGenerated: true });
check('legacy AI row (no provenance) → L0 and RED while unreviewed', legacy.grade === 'L0' && legacy.tier === 'red', JSON.stringify(legacy));

check('the "why" tooltip states the fidelity grade', unrevGrounded.why.some(w => /Input fidelity L2/.test(w)));
check('the "why" tooltip states the core computes the verdict, never the AI', unrevGrounded.why.some(w => /never grades itself/.test(w)));

console.log('\n[2] Reviewer-approval path');
globalThis.Review = {
  isApproved: t => t && t.kind === 'acFha' && String(t.id) === '7',
  getApproval: t => ({ approvedBy: 'J. Okafor' }),
};
const approved = AB.confidence({ internalId: 7, aiGenerated: true, aiFeature: 'fha.populate', aiModel: 'm' }, { kind: 'acFha' });
check('reviewer-approved grounded → GREEN with approver in the why', approved.tier === 'green' && approved.why.some(w => /J\. Okafor/.test(w)), JSON.stringify(approved));
const notApproved = AB.confidence({ internalId: 8, aiGenerated: true, aiFeature: 'fha.populate', aiModel: 'm' }, { kind: 'acFha' });
check('same kind, unapproved id → still RED', notApproved.tier === 'red');
delete globalThis.Review;

console.log('\n[3] reportLabel — final-output text form');
// --- 1 Aug: an AI CHAT edit is not human review -----------------------------
// `aiEdited` used to mean both "a person corrected this" and "the chat agent
// rewrote this". The second painted unreviewed rows green on the one badge
// whose job is saying what a human has checked.
const chatAgentEdit = AB.confidence({ internalId: 11, aiGenerated: true, aiFeature: 'cma.draft', aiModel: 'm', aiChatEdited: true, aiEditModel: 'm' });
check('an AI chat-agent edit does NOT count as human review',
  chatAgentEdit.reviewed === false && chatAgentEdit.tier === 'red',
  JSON.stringify(chatAgentEdit));
const legacyHuman = AB.confidence({ internalId: 12, aiGenerated: true, aiFeature: 'cma.draft', aiModel: 'm', aiEdited: true });
check('a legacy row with no edit-model and no edit-timestamp reads as human-edited',
  legacyHuman.reviewed === true, JSON.stringify(legacyHuman));
const legacyChat = AB.confidence({ internalId: 13, aiGenerated: true, aiFeature: 'cma.draft', aiModel: 'm', aiEdited: true, aiEditModel: 'm' });
check('a legacy row stamped with an edit-model reads as AI-edited, not reviewed',
  legacyChat.reviewed === false, JSON.stringify(legacyChat));
const legacyChatTs = AB.confidence({ internalId: 14, aiGenerated: true, aiFeature: 'cma.draft', aiModel: 'm', aiEdited: true, aiEditedAt: '2026-07-01T00:00:00Z' });
check('a legacy row stamped with an edit-timestamp reads as AI-edited, not reviewed',
  legacyChatTs.reviewed === false, JSON.stringify(legacyChatTs));

check('green → "AI · verified (L2)"', AB.reportLabel({ internalId: 9, aiGenerated: true, aiFeature: 'cma.draft', humanEdited: true }) === 'AI · verified (L2)');
check('red → "AI · UNREVIEWED (…)"', /^AI · UNREVIEWED \(L2\)$/.test(AB.reportLabel({ internalId: 10, aiGenerated: true, aiFeature: 'cma.draft' })));
check('manual → empty string', AB.reportLabel({ internalId: 11 }) === '');

console.log('\n[4] draftConfidence — E2 report-section drafts');
check('discarded → null', AB.draftConfidence({ state: 'discarded' }) === null);
const drafted = AB.draftConfidence({ state: 'drafted', flags: 0, truncated: 0, omitted: 0 });
check('drafted → RED (blocks hand-off)', drafted.tier === 'red', JSON.stringify(drafted));
const cleanAccepted = AB.draftConfidence({ state: 'accepted', flags: 0, truncated: 0, omitted: 0, by: 'W. Nafees', model: 'm' });
check('accepted, checker clean, full context → GREEN L2', cleanAccepted.tier === 'green' && cleanAccepted.grade === 'L2', JSON.stringify(cleanAccepted));
const truncAccepted = AB.draftConfidence({ state: 'accepted', flags: 0, truncated: 2, omitted: 1, by: 'W' });
check('accepted with truncated context → AMBER L1', truncAccepted.tier === 'amber' && truncAccepted.grade === 'L1', JSON.stringify(truncAccepted));
const overridden = AB.draftConfidence({ state: 'accepted', flags: 3, overrideNote: 'IDs verified by hand', by: 'W', truncated: 0, omitted: 0 });
check('accepted with signed flag override → AMBER', overridden.tier === 'amber' && /override/.test(overridden.label), JSON.stringify(overridden));
const badFlags = AB.draftConfidence({ state: 'accepted', flags: 2, truncated: 0, omitted: 0 });
check('accepted with UNRESOLVED flags → RED', badFlags.tier === 'red', JSON.stringify(badFlags));
const legacyDraft = AB.draftConfidence({ state: 'edited', flags: 0 });
check('pre-badge draft (no manifest meta) → conservative L1/AMBER, never green', legacyDraft.grade === 'L1' && legacyDraft.tier === 'amber', JSON.stringify(legacyDraft));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

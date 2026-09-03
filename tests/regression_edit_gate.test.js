#!/usr/bin/env node
/*
 * Regression — A0 (the aiEdited split) and A1 (the edit gate).
 *
 * WHY A0 EXISTS. Until 1 Aug 2026 one field, `aiEdited`, carried two opposite
 * meanings. ram_ai.js set it when a HUMAN corrected an AI draft. ai_assistant.js
 * set it in six places when the AI CHAT AGENT edited a row or node. Four
 * consumers read it as the first meaning, so asking the chat agent to rewrite a
 * rationale marked that row "human-reviewed" and painted its confidence pill
 * GREEN — on the one badge whose entire job is saying what a person has checked.
 * Worse, ai_fidelity.exemplarsFor() selected those rows as few-shot exemplars of
 * expert-corrected work, feeding the model its own unreviewed output back as
 * gold. This suite exists so those two facts can never re-merge.
 *
 * WHY A1 EXISTS. The EULA has promised an "Accept, Edit, or Discard" gate since
 * day one. The shared review panel offered Accept and Dismiss. The edit — the
 * one disposition carrying engineering judgement — could not be recorded at all,
 * so ML_ASSURANCE.recordCorrection() had no producer anywhere in the product and
 * the #12 capture register could never fill.
 *
 * HONEST LIMIT OF THIS SUITE. _makeReviewPanel is DOM-bound and lives inside a
 * 640 KB module with hundreds of globals, so these are STATIC checks over the
 * function body, not a live click-through. They defend the wiring and the
 * ordering; they do not prove the pixels. The pixel check is a live browser pass.
 *
 * Run: node tests/regression_edit_gate.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

const ai    = S('ai_assistant.js');
const bind  = S('bindings_modules.js');
const badge = S('ai_badges.js');
const fid   = S('ai_fidelity.js');
const gt    = S('gt_thread.js');
const ram   = S('ram_ai.js');

function fnBody(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ============================================================ A0 — the split
console.log('\n[A0] aiEdited split into humanEdited / aiChatEdited');

check('ai_assistant.js no longer writes the ambiguous flag',
  !/\baiEdited\b/.test(ai),
  'every write in this file is the AI chat agent editing a row — it is not human review');
check('ai_assistant.js writes aiChatEdited instead', /\baiChatEdited\b/.test(ai));
check('the AI-chat writes still carry their model attribution', /aiEditModel/.test(ai));

check('slHumanEdited is declared at file scope in bindings_modules.js',
  /^function slHumanEdited\(row\) \{/m.test(bind),
  'it was first placed inside the projectConfig object literal, which does not parse');
check('slHumanEdited is exported on window', /window\.slHumanEdited = slHumanEdited/.test(bind));

check('ram_ai.js records a genuine human edit as humanEdited',
  /if \(edited\) \{ f\.humanEdited = true/.test(ram) && /if \(edited\) \{ ff\.humanEdited = true/.test(ram));
check('ram_ai.js no longer writes aiEdited', !/\baiEdited\b/.test(ram));

[['ai_badges.js', badge], ['ai_fidelity.js', fid], ['gt_thread.js', gt]].forEach(([name, src]) => {
  check(name + ' reads the predicate, not the raw flag',
    /window\.slHumanEdited/.test(src));
  // The first cut used a stub fallback (`!!r.humanEdited`), which silently
  // mis-read every legacy row whenever the global had not loaded yet. Depending
  // on load order for correctness is the same class of bug A0 removes.
  check(name + ' fallback carries the FULL rule, not a stub',
    /aiChatEdited === true\) return false/.test(src) &&
    /aiEditModel/.test(src) && /aiEditedAt/.test(src),
    'a fallback that only checks humanEdited reads every legacy row as unreviewed');
});

// ---- the predicate itself, executed --------------------------------------
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(bind, ctx, { filename: 'bindings_modules.js' });
const he = ctx.window.slHumanEdited;
check('the predicate is callable', typeof he === 'function');
if (typeof he === 'function') {
  check('explicit humanEdited → true', he({ humanEdited: true }) === true);
  check('explicit aiChatEdited → false', he({ aiChatEdited: true }) === false);
  check('aiChatEdited beats a legacy aiEdited on the same row',
    he({ aiChatEdited: true, aiEdited: true }) === false);
  check('legacy row with no edit-model and no edit-timestamp → human',
    he({ aiEdited: true }) === true, 'that is the ram_ai signature');
  check('legacy row stamped with an edit-model → NOT human',
    he({ aiEdited: true, aiEditModel: 'm' }) === false, 'that is the AI-chat signature');
  check('legacy row stamped with an edit-timestamp → NOT human',
    he({ aiEdited: true, aiEditedAt: '2026-07-01' }) === false);
  check('an untouched row → false', he({}) === false);
  check('null is safe', he(null) === false);
}

// ============================================================ A1 — edit gate
console.log('\n[A1] the edit gate and the correction producer');

const panel = strip(fnBody(ai, '_makeReviewPanel'));
check('_makeReviewPanel was found', panel.length > 500);

check('the panel reads cfg.editableFields', /cfg\.editableFields/.test(panel));
check('editableFields is filtered to entries that actually have a key',
  /filter\(function \(f\) \{ return f && f\.key; \}\)/.test(panel));
// Resolved PER ITEM since 1 Aug: the unified batch panel holds heterogeneous
// actions, so editableFields may be a function of the item. The property being
// defended is unchanged — a card with no declared fields shows no Edit button.
check('the edit controls require BOTH a declared field set and an accept handler',
  /const canEdit = _editableOf\(it\)\.length > 0 && hasAccept/.test(panel),
  'a lane that declares nothing must render exactly what it rendered before');
check('editableFields may be a static array OR a function of the item',
  /typeof cfg\.editableFields === 'function'/.test(panel) && /Array\.isArray\(raw\)/.test(panel),
  'one static list cannot describe a panel holding add_fha next to add_requirement');
check('an Edit button is rendered only when canEdit', /canEdit \? '<button[^']*data-act="edit"/.test(panel));
check('the editor renders Save & Accept and Cancel', /data-act="save"/.test(panel) && /data-act="canceledit"/.test(panel));
check('cards carry a key so the editor can be found back', /class="aifh-card" data-k=/.test(panel));

check('Cancel leaves the draft untouched',
  /if \(act === 'canceledit'\) \{ editingKey = null; render\(\); return; \}/.test(panel),
  'cancelling an edit must not record a correction or accept anything');

check('the vision-confirm gate covers save as well as accept',
  /\(act === 'accept' \|\| act === 'save'\) && hasAccept && !_vc\.ok\(\)/.test(panel),
  'otherwise Edit would be a way around the diagram-verification checkbox');

check('the save path calls recordCorrection', /ML_ASSURANCE\.recordCorrection\(/.test(panel));
check('a field the engineer did not change is skipped',
  /if \(before === after\) return;/.test(panel),
  'acceptance is not a correction — recording it would poison the corpus with no-ops');
check('the correction is keyed to the lane AND the field',
  /cfg\.id \+ ' · ' \+ f\.key/.test(panel),
  'per-feature attribution is what makes the telemetry useful');
check('recordCorrection is called defensively',
  /try \{[\s\S]{0,220}ML_ASSURANCE\.recordCorrection[\s\S]{0,220}\} catch/.test(panel),
  'the capture register must never be able to break an accept');
check('the drafted value is read BEFORE the item is mutated',
  panel.indexOf('const before = String(it[f.key]') < panel.indexOf('it[f.key] = after;'),
  'reading after assignment would record every correction as a no-op');

check('humanEdited is set only when something actually changed',
  /if \(diff\.length\) \{[\s\S]{0,120}it\.humanEdited = true;/.test(panel));
check('the disposition logged is edit when there is a diff, accept when there is not',
  /_logDelta\(cfg\.id, diff\.length \? 'edit' : 'accept'/.test(panel),
  'this is the accepted-without-edit metric — it has to distinguish the two');
check('the edit delta carries the field-level diff',
  /\{ item: it, diff: diff \}/.test(panel));
check('the item is still handed to the lane after editing', /cfg\.onAccept\(it\)/.test(panel));

// ---- lanes ---------------------------------------------------------------
console.log('\n[A1] lane declarations');
const LANES = {
  'ai-rev-panel-req':  ['text', 'rationale'],
  'ai-rev-panel-fcim': ['malfunction', 'rationale'],
  'ai-rev-panel-pra':  ['threat', 'desc'],
  'ai-rev-panel-zsa':  ['desc', 'functionalImpact', 'mitigation'],
  'ai-rev-panel-cma':  ['claim', 'verification'],
};
Object.keys(LANES).forEach(id => {
  const i = ai.indexOf("'" + id + "'");
  const window_ = i < 0 ? '' : ai.slice(i, i + 900);
  check(id + ' declares editableFields', /editableFields:/.test(window_));
  LANES[id].forEach(k => {
    check(id + ' offers "' + k + '" for correction', new RegExp("key: '" + k + "'").test(window_));
  });
});
check('the fault-tree panels deliberately declare nothing',
  !/editableFields/.test(ai.slice(ai.indexOf("'ai-rev-panel-fta'"), ai.indexOf("'ai-rev-panel-fta'") + 700)),
  'tree structure is not free text — editing it belongs in the tree editor, not a textarea');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

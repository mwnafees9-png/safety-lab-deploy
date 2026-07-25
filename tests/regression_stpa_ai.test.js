#!/usr/bin/env node
/*
 * Regression — PRD-2: governed AI STPA drafting.
 *   [1] apply (stpa_ai_apply.js): refusals — no store / lane off, non-empty
 *       analysis, no losses, hazards without loss links, dangling refs in
 *       hazards/constraints/actions/feedbacks — ALL-OR-NOTHING (a refused
 *       draft writes nothing).
 *   [2] a clean draft lands: minted ids, refs resolved to ids, provenance
 *       (aiGenerated / stpa.draft / model / at) on EVERY row, counts +
 *       the engine-derives-UCAs note.
 *   [3] the governance split is real: the engine (STPA.ucaSeeds) derives
 *       UCA candidates from the APPLIED control structure — the draft
 *       itself contains no UCAs and the apply writes none.
 *   [4] wiring (source checks): ai_assistant.js carries draftStpa + the
 *       picker entry + the J3307 no-standard-text prompt; apply is called
 *       through STPA_AI_APPLY; index ships stpa_ai_apply.js; dispositions
 *       and abstraction level are never touched by the lane.
 * Run: node tests/regression_stpa_ai.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}
const S = f => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');

globalThis.window = globalThis;
const A = require('../site/stpa_ai_apply.js');
const freshSd = () => ({ cs: { controllers: [], processes: [], actions: [], feedbacks: [], others: [], precedence: [] },
  dispositions: {}, causeDismissals: {}, scopeFcIds: [], meta: { mission: '', scope: '', boundary: '', abstractionLevel: '' },
  losses: [], hazards: [], constraints: [], responsibilities: [], csState: 'initial', sip: {} });
const DRAFT = {
  losses: [{ text: 'Loss of aircraft and occupants' }, { text: 'Serious injury to occupants' }],
  hazards: [{ text: 'Aircraft violates the pitch-attitude envelope', lossRefs: [1, 2] },
            { text: 'Insufficient thrust in go-around', lossRefs: [1] }],
  constraints: [{ text: 'Pitch attitude shall stay inside the protected envelope', hazardRefs: [1] }],
  controllers: [{ name: 'Flight crew' }, { name: 'FCC' }],
  processes: [{ name: 'Pitch dynamics' }],
  actions: [{ name: 'Pitch command', from: 2, to: 1 }],
  feedbacks: [{ name: 'Attitude + rate', from: 1, to: 2 }],
};
const PROV = { model: 'test-model', at: '2026-07-26T22:00:00Z' };

console.log('\n[1] refusals — all-or-nothing');
check('no store / lane off → refused with the opt-in road home', /Program Planning/.test(A.apply(null, DRAFT, PROV).reason));
check('non-empty analysis refused (extending stays human)',
  (() => { const sd = freshSd(); sd.losses = [{ id: 'L-1', text: 'existing' }]; return /already has content/.test(A.apply(sd, DRAFT, PROV).reason); })());
check('no losses refused', /no usable losses/.test(A.apply(freshSd(), Object.assign({}, DRAFT, { losses: [] }), PROV).reason));
check('hazard without a loss link refused',
  /links to no loss/.test(A.apply(freshSd(), Object.assign({}, DRAFT, { hazards: [{ text: 'floating hazard state', lossRefs: [] }] }), PROV).reason));
check('dangling loss ref refused',
  /references loss 9/.test(A.apply(freshSd(), Object.assign({}, DRAFT, { hazards: [{ text: 'bad ref hazard', lossRefs: [9] }] }), PROV).reason));
check('dangling constraint ref refused',
  /references hazard 7/.test(A.apply(freshSd(), Object.assign({}, DRAFT, { constraints: [{ text: 'bad constraint here', hazardRefs: [7] }] }), PROV).reason));
check('dangling action endpoint refused',
  /does not exist/.test(A.apply(freshSd(), Object.assign({}, DRAFT, { actions: [{ name: 'ghost', from: 5, to: 1 }] }), PROV).reason));
check('a refused draft writes NOTHING',
  (() => { const sd = freshSd(); A.apply(sd, Object.assign({}, DRAFT, { actions: [{ name: 'ghost', from: 5, to: 1 }] }), PROV);
           return sd.losses.length === 0 && sd.cs.controllers.length === 0; })());

console.log('\n[2] a clean draft lands');
const sd = freshSd();
const r = A.apply(sd, DRAFT, PROV);
check('applies with counts', r.ok && r.counts.losses === 2 && r.counts.hazards === 2 && r.counts.actions === 1);
check('ids minted, refs resolved to ids', sd.hazards[0].lossIds.join(',') === 'L-1,L-2' && sd.constraints[0].hazardIds[0] === 'H-1' &&
  sd.cs.actions[0].from === 'C2' && sd.cs.actions[0].to === 'P1' && sd.cs.feedbacks[0].from === 'P1');
check('provenance on EVERY row', [sd.losses, sd.hazards, sd.constraints, sd.cs.controllers, sd.cs.processes, sd.cs.actions, sd.cs.feedbacks]
  .every(list => list.every(x => x.aiGenerated === true && x.aiFeature === 'stpa.draft' && x.aiModel === 'test-model')));
check('the note states the governance split', /derive MECHANICALLY|never writes a UCA/.test(r.note));
check('dispositions / abstraction untouched', Object.keys(sd.dispositions).length === 0 && sd.meta.abstractionLevel === '');

console.log('\n[3] the engine derives UCAs from the applied structure');
(0, eval)(S('stpa_core.js'));
const seeds = globalThis.STPA.ucaSeeds(sd.cs, sd.dispositions, { losses: sd.losses, hazards: sd.hazards, constraints: sd.constraints });
check('STPA.ucaSeeds yields candidates from the drafted CS (the model wrote none)',
  Array.isArray(seeds) && seeds.length > 0);
check('the draft schema itself carries no UCA field', !('ucas' in DRAFT) && !('ucaCandidates' in DRAFT));

console.log('\n[4] wiring');
const ai = S('ai_assistant.js'), src = S('stpa_ai_apply.js');
check('picker entry present (Draft STPA — engine derives UCAs, you disposition)', /Draft STPA/.test(ai) && /engine derives UCAs/.test(ai));
check('draftStpa + system prompt live in ai_assistant', /function draftStpa\(/.test(ai) && /_stpaSystemPrompt/.test(ai));
check('the prompt binds J3307 discipline without reproducing the standard',
  /J3307/.test(ai) && /hazards are SYSTEM STATES/.test(ai) && /Do NOT (write|draft) UCAs|never writes? a UCA/i.test(ai));
check('apply routed through STPA_AI_APPLY', /STPA_AI_APPLY\.apply\(/.test(ai));
check('index.html ships stpa_ai_apply.js before the AI loader lane',
  (() => { const idx = S('index.html'); return idx.indexOf('stpa_ai_apply.js?v=') !== -1; })());
check('apply module never touches dispositions or meta', !/sd\.dispositions\s*=|dispositions\[|meta\.abstractionLevel\s*=(?!=)/.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

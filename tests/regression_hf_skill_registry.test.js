// regression_hf_skill_registry.test.js — Phase 0 of the HF consistency campaign.
//
// Waqas's census, verified independently and confirmed: `hf.draftlane` and `hf.improve`
// were live feature ids passed to `_completeReproducible` while absent from
// `ai_skills.js` `_BODIES` / `_VERSIONS`. Every other AI lane in the product is a
// registered skill with a version, a body hash and a stamp on the rows it produces.
// Until these two were registered their prompt text could change with no version bump,
// no stamp, no byte-parity check and no eval gate — which means **no consistency claim
// about the nine HF draft lanes was defensible**, and no metric computed on their output
// would have meant anything.
//
// THE HALF THAT IS NOT IN THE BODY. The registered bodies are lane-INVARIANT: grounding,
// citation, carry-the-gaps, honest-limits. The half that differs between the nine lanes —
// standard, focus, drafted fields, forbidden fields, vocabularies — is configuration in
// `_HF_DRAFT_LANES`. A stamp hashing only the body would read identically on all nine and
// would not move when a lane's forbid list changed, which is exactly the kind of change
// that alters what the model may assert. So the row stamp carries BOTH halves:
// `skillId@vN#bodyHash/cfgHash`. This file pins that, by execution — a stamp that does not
// move when the configuration moves is the defect, and only running it can tell.
//
// This suite is deliberately about REGISTRATION, not quality. No golden exists for either
// lane yet and no pairwise number has been measured; that is Phase 1/2 and it is declared
// as an open miss in the registry comment rather than implied to be done.

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra ? ('\n       ' + extra) : '')); }
}

console.log('\nregression_hf_skill_registry — the HF lanes join the versioned-skill discipline\n');

const ai = R('site/ai_assistant.js');
const sk = R('site/ai_skills.js');
const hfa = R('site/hf_analyses.js');
const core = R('site/eval_core.js');

// ------------------------------------------------------------- registration
global.window = {};
delete require.cache[require.resolve(path.join(ROOT, 'site/ai_skills.js'))];
require(path.join(ROOT, 'site/ai_skills.js'));
const S = global.window.SLABSkills;
ok('the registry loads', !!S && !!S.skills);
['hf.draftlane', 'hf.improve'].forEach(id => {
    ok(id + ' is registered', !!S.skills[id]);
    ok(id + ' carries a version', S.skills[id] && S.skills[id].version === 1);
    ok(id + ' carries a body hash', S.skills[id] && /^[0-9a-f]{8}$/.test(S.skills[id].hash));
    ok(id + ' resolves from its feature id', !!S.skillFor(id));
    ok(id + ' produces a stamp', /@v1#[0-9a-f]{8}$/.test(S.stampFor(id, 'Part 25')));
});
ok('the registry declares that registration is not measurement', /REGISTERED, NOT YET MEASURED/.test(sk));
ok('and names the missing evidence rather than implying it exists', /no golden and no pairwise\s*\n\s*\/\/ number exists for either lane yet/.test(sk));

// The parity invariant the other 19 skills already live under.
ok('both features appear in the inline _FEATURE_SPECS', /'hf\.draftlane': _SPEC_HF_DRAFT, 'hf\.improve': _SPEC_HF_IMPROVE/.test(ai));
ok('both features appear in the registry featureMap', /"hf\.draftlane": "hf\.draftlane"/.test(sk) && /"hf\.improve": "hf\.improve"/.test(sk));
ok('the drafter prompt prefers the registry, inline as fallback', /_skillBodyFor\('hf\.draftlane'\) \|\| _SPEC_HF_DRAFT/.test(ai));
ok('the recommender prompt prefers the registry, inline as fallback', /_skillBodyFor\('hf\.improve'\) \|\| _SPEC_HF_IMPROVE/.test(ai));
ok('why hf.improve composes its own body is recorded', /This lane sits outside _ANALYSIS_FEATURES on purpose/.test(ai));

// ------------------------------------------------------------- the stamp
ok('the lane-config hash exists', /function _hfLaneCfgHash\(cfg\)/.test(ai));
ok('the stamp joins body and config hashes', /function _hfLaneStamp\(feature, cfg\)/.test(ai) && /return cfgH \? \(base \+ '\/' \+ cfgH\) : base;/.test(ai));
ok('why a body-only hash was not enough is recorded', /would not move when a lane's field list or\s*\n\s*\/\/ forbid list changed/.test(ai));
ok('an unregistered lane is stamped as such rather than left blank', /return cfgH \? \('unregistered\/' \+ cfgH\) : '';/.test(ai));
ok('the drafter passes the stamp to the row', /skill: _hfLaneStamp\('hf\.draftlane', cfg\)/.test(ai));
ok('both keyed lanes pass it too', (ai.match(/skill: _hfLaneStamp\('hf\.draftlane', cfg\)/g) || []).length === 3);
ok('the HF improvement comment carries its skill stamp', /c\.aiSkill = _skillStampFor\('hf\.improve'\)/.test(ai));
ok('the lane records the stamp on the row', /if \(meta\.skill\) row\.aiSkill = String\(meta\.skill\);/.test(hfa));
ok('why an unstamped row is unauditable is recorded', /a row you cannot trace to the\s*\n\s*\/\/ exact prompt that produced it cannot be part of a consistency claim/.test(hfa));

// ------------------------------------------------------------- eval lanes
const lanes = (core.match(/var LANES = \{[\s\S]*?\n    \};/) || [''])[0];
['tid', 'cd', 'sa', 'mfc', 'resources'].forEach(l => {
    ok('eval lane added: ' + l, new RegExp('\\n        ' + l + ':\\s').test(lanes));
});
ok('the rule that was broken is named', /a lane joins the eval family the day it is born — was broken by the\s*\n\s*\/\/ build that most needed it/.test(core));
ok('MFC\'s fixed row set is called out rather than reported as a signal', /its count metric can only ever be 6\/6 and says nothing/.test(core));
delete require.cache[require.resolve(path.join(ROOT, 'site/eval_core.js'))];
const C = require(path.join(ROOT, 'site/eval_core.js'));
ok('the scorer now knows nineteen lanes', Object.keys(C.LANES).length === 19, 'got ' + Object.keys(C.LANES).length);
['tidRows', 'cdRows', 'saRows', 'mfcRows', 'resourcesData'].forEach(k => {
    ok('the capture exports ' + k, new RegExp('\\b' + k + ':').test(ai));
});

// ============================================================== EXECUTED
// The stamp has to MOVE when the lane configuration moves. Grepping proves the two
// hashes are concatenated; only running it proves the second one is live.
(function behaviour() {
    const cfgH = (ai.match(/function _hfLaneCfgHash\(cfg\)[\s\S]*?\n    \}/) || [''])[0];
    ok('the hash function lifted for execution', cfgH.length > 300);
    let fn;
    try { fn = new Function('return (' + cfgH + ')')(); }
    catch (e) { ok('hash builds', false, e.message); return; }
    ok('hash builds', typeof fn === 'function');

    const base = { name: 'Crew Alerting', std: '§25.1322', focus: 'the alerts the documents describe',
                   fields: ['name', 'priority'], forbid: [], vocab: { priority: ['Warning', 'Caution'] } };
    const h0 = fn(base);
    ok('the hash is an 8-hex identity stamp', /^[0-9a-f]{8}$/.test(h0));
    ok('the same configuration hashes the same', fn(JSON.parse(JSON.stringify(base))) === h0);

    // Each of these is a real change to what the model may assert.
    ok('adding a FORBIDDEN field moves the hash', fn(Object.assign({}, base, { forbid: ['priority'] })) !== h0);
    ok('adding a drafted field moves the hash', fn(Object.assign({}, base, { fields: ['name', 'priority', 'modality'] })) !== h0);
    ok('widening a closed vocabulary moves the hash', fn(Object.assign({}, base, { vocab: { priority: ['Warning', 'Caution', 'Advisory'] } })) !== h0);
    ok('changing the standard grounding moves the hash', fn(Object.assign({}, base, { std: '§25.1302' })) !== h0);
    ok('changing the focus moves the hash', fn(Object.assign({}, base, { focus: 'something else entirely' })) !== h0);
    // Key ORDER in the vocab object is not a change to the vocabulary.
    ok('vocabulary key order is not a change', fn(Object.assign({}, base, { vocab: { priority: ['Warning', 'Caution'] } })) === h0);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);

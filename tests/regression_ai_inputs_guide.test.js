// regression_ai_inputs_guide.test.js — the AI Inputs readiness guide.
//
// Waqas, 2 Sep 2026, looking at the AI Inputs modal: "why do all these analyses not
// show here?"
//
// Because it was a THIRD hand-written list. By then the app had three registers of
// what the assistant can do — the launcher (31 actions), the in-lane bar, and this
// readiness guide (12 entries) — and only the first two had been kept current. STPA,
// Resources, CCF groups, the crew-credit drafter, all nine HF lanes, comment
// dispositions and document review were runnable and none appeared here, so an
// engineer asking "what do I need to give it" got a list that quietly omitted two
// thirds of the answer.
//
// THE FIX IS STRUCTURAL, and it is the same one the launcher and the lane bar got:
// an action carries its own `needs` block, and the guide is every action that has one.
// A new analysis cannot exist without stating its inputs, because the field lives where
// the analysis is defined rather than in a parallel list.
//
// WHAT THIS FILE ENFORCES: every runnable ANALYSIS has a needs block; every needs key
// resolves to a real readiness rule rather than the 'inputs' fallback; and the five
// entries that legitimately have no needs are the non-analyses.

const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? ('\n       ' + extra) : '')); }
}

console.log('\nregression_ai_inputs_guide — every analysis states its inputs\n');

const ai = R('site/ai_assistant.js');
const loader = R('site/ai_loader.js');
const idx = R('site/index.html');

ok('the hand-written guide array is gone', !/const _AI_INPUT_GUIDE = \[/.test(ai));
ok('the guide is derived from the launcher', /function _aiInputGuide\(\)/.test(ai) && /_launcherActions\(\)\s*\n\s*\.filter\(function \(a\) \{ return a && a\.needs; \}\)/.test(ai));
ok('the question that prompted it is recorded', /why do all these analyses not show here\?/.test(ai));
ok('the third-list diagnosis is recorded', /Because this WAS a third hand-written list/.test(ai));
ok('the guide groups its entries like the launcher', /if\(g\.group&&g\.group!==_grp\)/.test(ai));
ok('HF lanes carry a per-lane standard', /var _HF_LANE_STD = \{/.test(ai));
ok('HF lanes carry a per-lane input statement', /var _HF_LANE_NEEDS = \{/.test(ai));
ok('the MFC lane says plainly that it needs nothing', /the six Appendix D basic workload functions and ten workload factors are fixed/.test(ai));

// readiness rules for every new key
['fcim', 'ccf', 'stpa', 'resources', 'hfcredit', 'comments', 'docreview'].forEach(k => {
    ok("readiness rule exists for '" + k + "'", new RegExp("case '" + k + "':").test(ai));
});
ok('HF lanes resolve through one prefixed rule, not nine cases', /if \(String\(r\)\.indexOf\('hf:'\) === 0\)/.test(ai));
ok('the MFC exception is coded, not just documented', /if \(lane === 'mfc'\) return ok;/.test(ai));
ok('function allocation asks for functions, not for its own rows', /if \(lane === 'alloc'\) return funcsN\?ok:no\('aircraft sub-functions to allocate'\)/.test(ai));
ok('a recommender lane asks whether it has rows to read', /return rows\?ok:no\('authored rows in this lane'\)/.test(ai));
ok('the reason a recommender needs rows is recorded', /A recommender with nothing to read has nothing to recommend/.test(ai));

ok('ai_assistant pin at or past 76.20', (function(){const m=loader.match(/ai_assistant\.js\?v=(\d+)\.(\d+)/); if(!m) return false; const a=[+m[1],+m[2]], b=[76,20]; return a[0]!==b[0] ? a[0]>b[0] : a[1]>=b[1];})());
ok('ai_loader pin at or past 8.24', (function(){const m=idx.match(/ai_loader\.js\?v=(\d+)\.(\d+)/); if(!m) return false; const a=[+m[1],+m[2]], b=[8,24]; return a[0]!==b[0] ? a[0]>b[0] : a[1]>=b[1];})());

// ------------------------------------------------------ EXECUTED against the real list
(function live() {
    const grab = re => (ai.match(re) || [''])[0];
    const body = grab(/function _launcherActions\(\)[\s\S]*?\n    \}/);
    const lanes = grab(/var _HF_IMPROVE_LANES = \{[\s\S]*?\n    \};/);
    const subs = grab(/var _HF_LAUNCHER_SUBS = \{[\s\S]*?\};/);
    const std = grab(/var _HF_LANE_STD = \{[\s\S]*?\};/);
    const nds = grab(/var _HF_LANE_NEEDS = \{[\s\S]*?\};/);
    const gen = grab(/function _hfLauncherActions\(\)[\s\S]*?\n    \}/);
    const sub2 = grab(/function _hfLauncherSub\(key\)[\s\S]*?\n    \}/);
    // Added to the lift when each HF lane gained a second entry — the drafter. The
    // generator reads both blocks, so a lift without them throws into its own catch and
    // returns [], which reads as "the HF lanes vanished" rather than "the lift is stale".
    const dLanes = grab(/var _HF_DRAFT_LANES = \{[\s\S]*?\n    \};/);
    const dNeeds = grab(/var _HF_DRAFT_NEEDS = \{[\s\S]*?\n    \};/);
    const stub = ['_openAiInputsModal','_anemBatchPrompt','decompose','populateFcim','populateFha',
        'synthesizeTree','draftStpa','reviewTrees','recommendRequirements','draftPra','draftZsa',
        'draftCma','draftResources','proposeCcfGroups','draftFmea','draftHfAssumptions',
        'recommendArchitecture','resolveReviewComments','reviewComplianceDoc','showAiProvenance',
        'recommendHfImprovements','draftHfLane'].map(f => 'function ' + f + '(){}').join(';') + ';var window={};var switchTab;'
        // _gateAction is stubbed to identity: the readiness GATE has its own test file
        // (regression_ai_input_gate), and lifting it here would drag the whole snapshot
        // and source-doc surface in with it. What this file cares about is the SHAPE of
        // the action list, not whether a given action would be allowed to run today.
        + 'function _gateAction(a){return a;}';

    let acts;
    try { acts = new Function(stub + lanes + subs + std + nds + dLanes + dNeeds + gen + sub2 + body + '; return _launcherActions();')(); }
    catch (e) { ok('launcher builds', false, e.message); return; }
    ok('launcher builds', Array.isArray(acts));

    const guide = acts.filter(a => a.needs);
    // 26 became 35 when each HF lane gained a DRAFTER alongside its recommender. Both
    // halves are analyses and both state their inputs, so both belong in this guide —
    // that is the point: an engineer looking up "what does this need" now sees that
    // drafting needs a document and recommending needs rows, as two separate answers.
    ok('the guide is thirty-five entries — 26 plus a drafter per HF lane', guide.length === 35, 'got ' + guide.length);

    // the only actions without a needs block are the ones that are not analyses
    const bare = acts.filter(a => !a.needs).map(a => a.label);
    ok('exactly five actions have no needs block', bare.length === 5, bare.join(' | '));
    ok('and they are the non-analyses, not forgotten ones',
        bare.every(l => /AI Inputs|Ask AI|ARP4761A workflow|provenance|AI Settings/.test(l)), bare.join(' | '));

    // every analysis states inputs, a standard, and a readiness key
    const bad = guide.filter(a => !a.needs.r || !a.needs.std || !a.needs.t || a.needs.t.length < 20);
    ok('every analysis states a readiness key, a standard and its inputs', bad.length === 0,
        bad.map(a => a.label).join(' | '));

    // no readiness key falls through to the generic fallback
    const keys = guide.map(a => a.needs.r);
    ok('readiness keys are unique', keys.length === new Set(keys).size);
    // Both case forms: the one-liner `case 'x': return …` and the block `case 'x': { … }`
    // that 'comments' uses. Matching only the first would call a real rule missing.
    const cased = new Set([...ai.matchAll(/case '([\w]+)':\s*(?:return|\{)/g)].map(m => m[1]));
    const unresolved = keys.filter(k => !k.startsWith('hf:') && !k.startsWith('hfdraft:') && !cased.has(k));
    ok('every readiness key has a rule — none falls through to "inputs"', unresolved.length === 0, unresolved.join(', '));

    // the nine HF lanes are all present with their own standard
    const hf = guide.filter(a => a.needs.r.startsWith('hf:'));
    const hfd = guide.filter(a => a.needs.r.startsWith('hfdraft:'));
    ok('nine HF recommender lanes appear in the guide', hf.length === 9, 'got ' + hf.length);
    ok('nine HF drafter lanes appear in the guide', hfd.length === 9, 'got ' + hfd.length);
    ok('each HF lane cites its own standard, not one shared label',
        new Set(hf.map(a => a.needs.std)).size === 9);
    ok('each HF lane states its own inputs', new Set(hf.map(a => a.needs.t)).size === 9);
    ok('each HF drafter states its own inputs', new Set(hfd.map(a => a.needs.t)).size === 9);
    // The pair must not say the same thing. If drafting and recommending a lane read as
    // needing the same input, the second button is decoration and the amber chip is back
    // to being wrong about half of what the lane can do.
    const sameText = hfd.filter(d => {
        const lane = d.needs.r.slice('hfdraft:'.length);
        const r = hf.find(a => a.needs.r === 'hf:' + lane);
        return r && r.needs.t === d.needs.t;
    }).map(d => d.needs.r);
    ok('no HF lane describes its two halves as needing the same thing', sameText.length === 0, sameText.join(', '));

    // the previously-missing analyses are the point of the change
    ['Draft STPA', 'Draft Resources', 'Propose CCF groups', 'Generate FCIM',
     'Human Factors — register crew credit', 'Draft comment dispositions',
     'Review compliance document'].forEach(l => {
        ok('now shown in AI Inputs: ' + l, guide.some(a => a.label === l));
    });
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);

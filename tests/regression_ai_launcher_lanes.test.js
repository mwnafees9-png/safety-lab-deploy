// regression_ai_launcher_lanes.test.js — one AI lane per assessment.
//
// Waqas, 2 Sep 2026: "the AI assistant doesnt have RAM and HF lanes at all ...
// they dont give user options to select to execute those analyses, we need one
// lane per assessment."
//
// The launcher had 22 lanes. Nine HF sub-analyses each had a WORKING recommender
// sitting behind a button on their own tab, and exactly one HF entry here — the
// crew-credit drafter. A capability you have to already be standing on the right
// tab to discover is not a lane, and that is the gap this closes.
//
// THE RULE THIS FILE ENFORCES: the HF lanes are GENERATED from _HF_IMPROVE_LANES,
// never hand-listed. One registry decides which HF lanes the recommender serves,
// so a lane added there appears in the launcher by construction. A hand-written
// list would drift the first time someone adds a lane and forgets this file.
//
// RAM IS STILL ZERO and the test says so out loud rather than leaving the gap
// silent — every RAM lane needs a real skill (prompt, basis list, apply path,
// review gate), which is a build, not a launcher edit.

const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');

// Version pins are DOTTED VERSIONS compared as a FLOOR, not equalities — a version moves
// for any reason that touches the file, and a wall that fails on a routine bump teaches
// people to edit the test instead of reading it. The floor still catches the real error:
// a changed module shipped behind a stale pin.
function pinAtLeast(html, file, floor) {
    const m = html.match(new RegExp(file.replace(/\./g, '\\.') + '\\.js\\?v=([\\d.]+)'));
    if (!m) return false;
    const a = m[1].split('.').map(Number), b = String(floor).split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] || 0, y = b[i] || 0;
        if (x !== y) return x > y;
    }
    return true;
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? ('\n       ' + extra) : '')); }
}

console.log('\nregression_ai_launcher_lanes — one lane per assessment\n');

const ai = R('site/ai_assistant.js');
const loader = R('site/ai_loader.js');
const idx = R('site/index.html');
const plan = R('site/program_plan.js');

// ------------------------------------------------------------- generation
ok('HF lanes are generated, not hand-listed', /function _hfLauncherActions\(\)/.test(ai));
ok('the generator reads the recommender registry', /Object\.keys\(_HF_IMPROVE_LANES\)\.forEach/.test(ai));
ok('each lane emits BOTH a drafter and a recommender', /if \(_HF_DRAFT_LANES\[key\]\) \{/.test(ai) && /return draftHfLane\(key\);/.test(ai));
ok('the drafter entry is listed first — draft, then critique', ai.indexOf("return draftHfLane(key);") < ai.indexOf("return recommendHfImprovements(key);"));
ok('the single-source-of-truth rule is recorded', /GENERATED FROM _HF_IMPROVE_LANES, never hand-listed/.test(ai));
ok('each generated lane runs its own recommender', /return recommendHfImprovements\(key\);/.test(ai));
ok('each generated lane lands in the Human factors group', /group: 'Human factors',\s*\n?\s*label: 'HF — ' \+ cfg\.name/.test(ai));
ok('the generator degrades to an empty list rather than throwing', /\} catch \(_\) \{ return \[\]; \}/.test(ai));

// UI copy is written for the engineer, not lifted from the model prompt
ok('lane subtitles are UI copy, separate from the model focus text', /var _HF_LAUNCHER_SUBS = \{/.test(ai));
ok('the reason the model focus is not reused is recorded', /written for the MODEL — long,/.test(ai));
['tid', 'alloc', 'task', 'hea', 'alerts', 'ergo', 'cd', 'sa', 'mfc'].forEach(k => {
    ok('subtitle written for the ' + k + ' lane', new RegExp('^\\s+' + k + ':\\s+\'', 'm').test(ai));
});
ok('an unknown lane still gets a subtitle rather than undefined', /return 'Standard-rooted design improvements for this lane';/.test(ai));

// ------------------------------------------------------------- grouping
ok('actions carry a group', /\{ group: 'Safety assessment', label: 'Generate FCIM'/.test(ai));
ok('the renderer emits a section header per group', /if \(a\.group && a\.group !== _lastGroup\)/.test(ai));
ok('the header is a property of the action, not the renderer', /a new lane lands in\s*\n\s*\/\/ its section without touching the renderer/.test(ai));
ok('the group style exists', /#ai-launcher \.ail-group\{/.test(ai));
ok('the header sticks while the list scrolls', /position:sticky/.test(ai));
ok('the launcher scrolls once it is this long', /#ai-launcher\{max-height:min\(74vh,720px\);overflow-y:auto\}/.test(ai));
ok('why grouping was needed is recorded', /an unbroken column of thirty buttons/.test(ai));

// ------------------------------------------------------ EXECUTED: the real list
(function renderList() {
    const body = (ai.match(/function _launcherActions\(\)[\s\S]*?\n    \}/) || [''])[0];
    const lanes = (ai.match(/var _HF_IMPROVE_LANES = \{[\s\S]*?\n    \};/) || [''])[0];
    const subs = (ai.match(/var _HF_LAUNCHER_SUBS = \{[\s\S]*?\};/) || [''])[0];
    // The HF generator reads two constant blocks that were added when every analysis
    // gained a `needs` statement (2 Sep 2026). Lifting source for execution means the
    // lift has to keep up with what the source references — a missing block makes the
    // generator throw and silently return [], which reads as 'the lanes vanished'.
    const laneStd = (ai.match(/var _HF_LANE_STD = \{[\s\S]*?\};/) || [''])[0];
    const laneNeeds = (ai.match(/var _HF_LANE_NEEDS = \{[\s\S]*?\};/) || [''])[0];
    // Two more blocks joined the lift on 2 Sep 2026 when each HF lane gained a SECOND
    // entry — the drafter. Same reason as the two above: the generator now reads them,
    // and a lift that falls behind what the source references makes the generator throw
    // into its own catch and return [], which reads on the console as "the lanes
    // vanished" rather than "the test is out of date".
    const draftLanes = (ai.match(/var _HF_DRAFT_LANES = \{[\s\S]*?\n    \};/) || [''])[0];
    const draftNeeds = (ai.match(/var _HF_DRAFT_NEEDS = \{[\s\S]*?\n    \};/) || [''])[0];
    const gen = (ai.match(/function _hfLauncherActions\(\)[\s\S]*?\n    \}/) || [''])[0];
    const sub2 = (ai.match(/function _hfLauncherSub\(key\)[\s\S]*?\n    \}/) || [''])[0];
    ok('launcher source lifted for execution', body.length > 500 && gen.length > 100 && lanes.length > 100);

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
    try {
        acts = new Function(stub + lanes + subs + laneStd + laneNeeds + draftLanes + draftNeeds + gen + sub2 + body + '; return _launcherActions();')();
    } catch (e) { ok('launcher list builds', false, e.message); return; }
    ok('launcher list builds', Array.isArray(acts) && acts.length > 0);

    const hf = acts.filter(a => a.group === 'Human factors');
    // Nine lanes × two entries (draft from documents / recommend improvements) plus the
    // crew-credit drafter. Waqas, 2 Sep 2026, choosing between one blended button and
    // two: "Two buttons per lane". They gate differently — a drafter needs a DOCUMENT,
    // a recommender needs ROWS — so one chip could never be honest about both.
    ok('nine HF lanes x two entries plus the crew-credit drafter = nineteen HF lanes', hf.length === 19, 'got ' + hf.length);
    ok('crew credit leads the HF block', hf[0] && /register crew credit/.test(hf[0].label));

    // every lane the recommender serves must be offered
    const registry = [...lanes.matchAll(/\n\s+(\w+):\s+\{ name: '([^']+)'/g)].map(m => m[2]);
    ok('the registry has nine lanes', registry.length === 9, 'got ' + registry.length);
    registry.forEach(name => {
        ok('offered as a recommender lane: ' + name, hf.some(a => a.label === 'HF — ' + name));
        ok('offered as a drafter lane: ' + name, hf.some(a => a.label === 'HF — ' + name + ' · draft from documents'));
    });
    // The two halves must gate on DIFFERENT inputs, or the split bought nothing.
    registry.forEach(name => {
        const d = hf.find(a => a.label === 'HF — ' + name + ' · draft from documents');
        const r = hf.find(a => a.label === 'HF — ' + name);
        ok('draft and recommend gate differently: ' + name,
            !!d && !!r && d.needs && r.needs && d.needs.r !== r.needs.r &&
            /^hfdraft:/.test(d.needs.r) && /^hf:/.test(r.needs.r),
            d && r ? (d.needs.r + ' vs ' + r.needs.r) : 'missing entry');
    });

    // groups must be contiguous or the renderer draws the same header twice
    const seq = [];
    let last = null;
    acts.forEach(a => { if (a.group && a.group !== last) { seq.push(a.group); last = a.group; } });
    ok('no group header is drawn twice', seq.length === new Set(seq).size, seq.join(' | '));
    ok('the three families are Safety, Human factors, Review', seq.length === 3 &&
        seq[0] === 'Safety assessment' && seq[1] === 'Human factors' && /Review/.test(seq[2]), seq.join(' | '));

    ok('every lane has a label, a subtitle and something to run',
        acts.every(a => a.label && a.sub !== undefined && typeof a.run === 'function'));
    ok('every HF lane subtitle is lane-specific, not the generic fallback',
        hf.slice(1).every(a => a.sub && !/^Standard-rooted design improvements/.test(a.sub)));
    ok('every HF lane, both halves, states what it needs',
        hf.every(a => a.needs && a.needs.r && a.needs.std && a.needs.t));
    ok('the list is now past forty lanes', acts.length >= 40, 'got ' + acts.length);

    // ------------------------------------------------------------ the RAM gap
    // Named, not silently absent. When a RAM lane ships this flips and the count moves.
    const ramLanes = [...plan.matchAll(/id: '(ram-[\w-]+|markov|eta)',[^}]*?group: 'ram'/gs)].length;
    ok('program plan still carries the RAM lanes', ramLanes >= 8, 'found ' + ramLanes);
    ok('NO RAM lane is offered yet — every one needs a skill first, and this is the marker',
        acts.filter(a => /RAM|reliability|maintainab|MSG-3|MMEL|LORA|sneak|life-cycle/i.test(a.label)).length === 0);
})();

ok('ai_assistant cache-bust at or past 76.22', pinAtLeast(loader, 'ai_assistant', '76.22'));
ok('ai_loader cache-bust at or past 8.23', pinAtLeast(idx, 'ai_loader', '8.23'));

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);

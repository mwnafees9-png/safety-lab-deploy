// regression_lane_ai_bar.test.js — the per-lane AI action bar.
//
// Waqas, 2 Sep 2026: "actually I prefer having a per lane button in the actual lane
// rather than just the AI assistant lets wire it up for all the analyses in the app",
// then: "it should only draft the lane it is mounted on."
//
// TWO THINGS THIS PINS.
//
// 1. THE SCOPE RULE IS STRUCTURAL. The registry is ACTION -> the one lane it acts on,
//    inverted at read time to build each lane's bar. A button cannot be placed on a lane
//    it does not act on, because that arrangement is not expressible in the data. A test
//    that merely checked the current placements would pass a hand-written map that
//    someone later breaks; this checks the SHAPE that makes breaking it impossible.
//
// 2. THE TWO SURFACES CANNOT DRIFT. The bar does not define actions — it names launcher
//    labels and resolves them against SafetyLabAI.launcherActions() at mount time. So
//    every label in the registry must resolve against the live launcher, and this file
//    resolves all of them. A renamed launcher label silently empties a lane's bar
//    otherwise, which is exactly the failure a source read would not catch.

const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? ('\n       ' + extra) : '')); }
}

console.log('\nregression_lane_ai_bar — an AI button in every analysis lane\n');

const bar = R('site/lane_ai_bar.js');
const ai = R('site/ai_assistant.js');
const idx = R('site/index.html');
const panel = R('site/hf_register_panel.js');

// ------------------------------------------------------- the scope rule, structurally
ok('the registry is ACTION -> lane, not lane -> actions', /var ACTION_WRITES = \{/.test(bar));
ok('there is no lane -> actions map to hand-edit', !/var LANE_AI = \{/.test(bar));
ok('each lane bar is derived by inverting it', /function _lanesFromWrites\(\)/.test(bar));
ok('the rule is quoted where it is enforced', /it should only draft the lane it is mounted on/.test(bar));
ok('the reason for the shape is recorded', /not a convention someone\s*\n\s*\/\/ has to remember/.test(bar));
ok('the two non-obvious placements are justified', /sits on FAULT TREES, not CMA/.test(bar) && /sits on REQUIREMENTS, not the FHA/.test(bar));

// ------------------------------------------------------- one mechanism, not nine
ok('the hand-placed HF bars are gone from index.html', !/hfx-recbar/.test(idx));
ok('the hand-placed HF bars are gone from the register panel', !/hfr-recbar/.test(panel));
ok('the module is loaded', /lane_ai_bar\.js\?v=/.test(idx));
// floor, not equality — 1.6 on 3 Sep (internal codes removed from the page text)
ok('the register panel pin was bumped with its edit', (function(){ var m = idx.match(/hf_register_panel\.js\?v=(\d+)\.(\d+)/); return !!m && (parseInt(m[1],10) > 1 || parseInt(m[2],10) >= 5); })());
ok('why nine hand-placed divs were replaced is recorded', /Nine copies of\s*\n\s*\/\/ one idea is nine places to forget/.test(bar));

// ------------------------------------------------------- mounting
ok('mounts after the shared header-with-export anchor', /:scope > \.header-with-export/.test(bar));
ok('mount is idempotent — it refreshes rather than stacking', /var bar = existing \|\| document\.createElement\('div'\)/.test(bar));
ok('a lane with no action has any stale bar removed', /if \(!acts\.length\) \{ if \(existing\) existing\.remove\(\); return false; \}/.test(bar));
ok('re-mounts after the lazy AI loader window', /setTimeout\(function \(\) \{ mount\(tabId\); \}, 900\)/.test(bar));
ok('the switchTab wrapper preserves earlier wrappers\' properties', /Object\.keys\(orig\)\.forEach/.test(bar));
ok('it does not double-wrap switchTab', /!window\.switchTab\._laneAiWrapped/.test(bar));
ok('a dead label is dropped, never rendered as a broken button', /never rendered as a dead button/.test(bar));
ok('every button says the result is advisory', /advisory; every result lands in a review gate/.test(bar));

// ------------------------------------------------ EXECUTED: against the LIVE launcher
(function live() {
    // Build the real launcher list, then the real bar registry, and resolve one against
    // the other — the drift check that a grep cannot do.
    const body = (ai.match(/function _launcherActions\(\)[\s\S]*?\n    \}/) || [''])[0];
    const lanes = (ai.match(/var _HF_IMPROVE_LANES = \{[\s\S]*?\n    \};/) || [''])[0];
    const subs = (ai.match(/var _HF_LAUNCHER_SUBS = \{[\s\S]*?\};/) || [''])[0];
    // The HF generator reads two constant blocks that were added when every analysis
    // gained a `needs` statement (2 Sep 2026). Lifting source for execution means the
    // lift has to keep up with what the source references — a missing block makes the
    // generator throw and silently return [], which reads as 'the lanes vanished'.
    const laneStd = (ai.match(/var _HF_LANE_STD = \{[\s\S]*?\};/) || [''])[0];
    const laneNeeds = (ai.match(/var _HF_LANE_NEEDS = \{[\s\S]*?\};/) || [''])[0];
    // Two more blocks joined the lift when each HF lane gained a SECOND entry — the
    // drafter (2 Sep 2026, "Two buttons per lane"). Same rule as above: the lift has to
    // keep up with what the generator reads, or it throws into its own catch, returns []
    // and the failure reads as "the HF lanes vanished" instead of "the lift is stale".
    const draftLanes = (ai.match(/var _HF_DRAFT_LANES = \{[\s\S]*?\n    \};/) || [''])[0];
    const draftNeeds = (ai.match(/var _HF_DRAFT_NEEDS = \{[\s\S]*?\n    \};/) || [''])[0];
    const gen = (ai.match(/function _hfLauncherActions\(\)[\s\S]*?\n    \}/) || [''])[0];
    const sub2 = (ai.match(/function _hfLauncherSub\(key\)[\s\S]*?\n    \}/) || [''])[0];
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

    let launcher;
    try { launcher = new Function(stub + lanes + subs + laneStd + laneNeeds + draftLanes + draftNeeds + gen + sub2 + body + '; return _launcherActions();')(); }
    catch (e) { ok('launcher list builds', false, e.message); return; }
    ok('launcher list builds', Array.isArray(launcher));

    global.window = { SafetyLabAI: { launcherActions: () => launcher } };
    delete require.cache[require.resolve(path.join(SITE, 'site/lane_ai_bar.js'))];
    const M = require(path.join(SITE, 'site/lane_ai_bar.js'));

    // (a) every registry label resolves against the live launcher
    const labels = Object.keys(M.ACTION_WRITES);
    const known = new Set(launcher.map(a => a.label));
    const dead = labels.filter(l => !known.has(l));
    ok('every registry label resolves against the live launcher', dead.length === 0, 'dead: ' + dead.join(' | '));

    // (b) the scope rule holds for every lane
    const byLane = M.lanesFromWrites();
    const writes = Object.assign({}, M.ACTION_WRITES, M.hfWrites());
    let violations = [];
    Object.keys(byLane).forEach(lane => {
        byLane[lane].forEach(label => { if (writes[label] !== lane) violations.push(label + ' on ' + lane); });
    });
    ok('no lane offers an action that acts on a different lane', violations.length === 0, violations.join(', '));
    ok('every action belongs to exactly one lane',
        labels.every(l => typeof M.ACTION_WRITES[l] === 'string' && M.ACTION_WRITES[l].length > 0));

    // (c) the specific placements the rule decided
    ok('CCF groups sit on the fault-tree lane', (byLane['fta'] || []).indexOf('Propose CCF groups') >= 0);
    ok('CMA offers only the CMA', (byLane['cma'] || []).join('|') === 'Common Mode Analysis (CMA)');
    ok('requirements sit on the requirements lane', (byLane['ac-req'] || []).indexOf('Recommend requirements') >= 0);
    ok('fault trees offer synthesize, review and CCF', (byLane['fta'] || []).length === 3);

    // (d) the nine HF lanes each get their own scoped recommender
    // Each HF lane now carries TWO scoped actions, not one: a drafter that reads your
    // source documents and a recommender that reads your rows. Both are scoped to the
    // lane they are mounted on — the drafter by the argument it is called with, exactly
    // as the recommender always was — so the one-lane rule above still holds for both.
    const hfw = M.hfWrites();
    ok('nine HF sub-lanes x two entries are wired', Object.keys(hfw).length === 18, 'got ' + Object.keys(hfw).length);
    Object.keys(M.HF_TAB_BY_NAME).forEach(name => {
        const tab = M.HF_TAB_BY_NAME[name];
        const got = byLane[tab] || [];
        ok('lane bar wired for ' + tab, got.length === 2 && got.every(l => /^HF — /.test(l)), got.join(' | '));
        ok('the drafter is offered first on ' + tab, / · draft from documents$/.test(got[0] || ''), got.join(' | '));
        ok('and the recommender second on ' + tab, got[1] === 'HF — ' + name, got.join(' | '));
    });

    // (e) coverage — which analysis lanes now have a bar, and which honestly do not
    const covered = Object.keys(byLane).sort();
    ok('twenty-one lanes carry an AI bar', covered.length === 21, 'got ' + covered.length + ': ' + covered.join(' '));

    // Deliberately laneless. An action that does not write ONE lane does not get a lane
    // bar — under the rule that is not an omission, it is the rule working. They stay
    // reachable from the assistant launcher, which is the right home for a global action.
    const laneless = launcher.map(a => a.label).filter(l => !writes[l]);
    ok('the laneless actions are the global ones, and only those',
        laneless.every(l => /AI Inputs|Ask AI|ARP4761A workflow|comment dispositions|compliance document|provenance|AI Settings|Recommend architecture/.test(l)),
        laneless.join(' | '));
    ok('"Recommend architecture" is laneless on purpose — it writes advice, not a lane\'s rows',
        laneless.indexOf('Recommend architecture') >= 0);
    ok('no RAM lane is wired yet — the skills come first, and this is the marker',
        covered.filter(l => /^ram-|^markov$|^eta$/.test(l)).length === 0);

    // (f) resolution returns the launcher's own runnable action, not a copy
    const fta = M.actionsFor('fta');
    ok('resolved actions carry the launcher\'s run function', fta.length === 3 && fta.every(a => typeof a.run === 'function'));
    ok('an unknown lane resolves to nothing', M.actionsFor('not-a-lane').length === 0);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);

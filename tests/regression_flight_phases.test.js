#!/usr/bin/env node
/*
 * Regression — ONE flight-phase vocabulary, owned by the project table.
 *
 * WHAT WAS WRONG (1 Aug 2026). The product held three lists of flight phases and
 * none of them agreed:
 *
 *   · the FHA form's checkbox grid — hardcoded in index.html:
 *       Standing, Taxi, Takeoff, Initial Climb, Climb, Cruise, Descent, Approach, Landing
 *   · FLIGHT_PHASES in ai_assistant.js — the AI vocabulary:
 *       Taxi, Takeoff, Climb, Cruise, Descent, Approach, Landing, Go-around
 *   · flightPhasesData — the project's own table, and the ONLY one the maths reads.
 *
 * Exposure normalisation matches an FHA row's phases against flightPhasesData
 * (getPhaseExposureRatio). So a box the form offered but the table did not hold —
 * "Standing", "Initial Climb", "Climb" against a table that had none of them —
 * matched nothing, the function failed open to r = 1, and the requirement was
 * sized against the whole flight envelope instead of the window the condition is
 * actually exposed in. Nothing said so. The row looked complete.
 *
 * And initNewProjectState() reset seventeen stores but not this one, so a new
 * project inherited the previous project's phases: a UAS profile's
 * Launch/Transit/Recovery quietly became the vocabulary of a Part 25 project, and
 * the mission duration behind every exposure ratio was the wrong aircraft's.
 *
 * WHAT IS TRUE NOW. The table is the single source. The FHA grid is rendered FROM
 * it, so a phase cannot reach an FHA row unless the project defines it — which is
 * what makes phase-name normalisation downstream unnecessary rather than merely
 * absent. The default table is exactly what the form used to offer.
 *
 * CONTINGENCY PHASES are the part worth reading carefully. Rejected take-off and
 * go-around are flown on a small fraction of departures, so:
 *   · they must not count toward the mission duration, or every exposure ratio in
 *     the project is diluted by time most flights never spend; and
 *   · an FHA row naming one must NOT shrink its exposure window to the manoeuvre.
 *     The function had to survive the whole preceding flight to be there when the
 *     contingency was flown — the failure accrues across the flight and is
 *     revealed at the demand. Sizing t to three minutes understates the
 *     probability by about two orders of magnitude, in the unconservative
 *     direction. The honest figure is P(demand) x duration and there is no
 *     occurrence-frequency field, so the conservative bound is held instead.
 *
 * Run: node tests/regression_flight_phases.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const bind = S('bindings_modules.js'), sup = S('support_modules.js'),
      help = S('helpers_modules.js'), misc = S('misc_fn_modules.js'),
      ai = S('ai_assistant.js'), html = S('index.html'), ftaV = S('fta_view_modules.js');

// ---------------------------------------------------------------------------
// A sandbox holding the real constants and the real maths, lifted from source.
// Nothing is re-implemented here: if these functions change, this file executes
// the change.
// ---------------------------------------------------------------------------
function sandbox() {
    const sb = { console, JSON, String, Array, Object, Math, Map, parseFloat, parseInt };
    sb.window = sb;
    vm.createContext(sb);
    const grab = (src, re, what) => {
        const m = src.match(re);
        if (!m) throw new Error('could not lift ' + what + ' from source');
        return m[0];
    };
    const consts = grab(bind,
        /\/\/ -+\n\/\/ FLIGHT PHASES \(1 Aug 2026\)[\s\S]*?let flightPhasesData = newDefaultPhaseTable\(\);/,
        'the phase constants');
    const dur = grab(sup, /function parseDurationToHours\([\s\S]*?\n\}/, 'parseDurationToHours');
    const tot = grab(sup, /function _phaseIsSpecial\([\s\S]*?\nfunction getContingencyDuration\([\s\S]*?\n\}/, 'the duration functions');
    const par = grab(sup, /function parsePhaseList\([\s\S]*?\n\}/, 'parsePhaseList');
    const rat = grab(sup, /function getPhaseExposureRatio\([\s\S]*?\n\}\n/, 'getPhaseExposureRatio');
    vm.runInContext(consts + '\n' + dur + '\n' + tot + '\n' + par + '\n' + rat +
        '\n;globalThis.API={isSpecialPhase,newDefaultPhaseTable,getTotalFlightDuration,' +
        'getContingencyDuration,getPhaseExposureRatio,DEFAULT_FLIGHT_PHASES,SPECIAL_FLIGHT_PHASES,' +
        'SPECIAL_PHASE_CATALOGUE,setTable:function(t){flightPhasesData=t;},getTable:function(){return flightPhasesData;}};', sb);
    return sb.API;
}

// ---------------------------------------------------------------------------
console.log('\n[phases] the default table IS the form the FHA used to hardcode');
{
    const A = sandbox();
    // The nine values the checkbox grid carried, in the order it carried them.
    const FORM_9 = ['Standing', 'Taxi', 'Takeoff', 'Initial Climb', 'Climb',
                    'Cruise', 'Descent', 'Approach', 'Landing'];
    check('the nominal default matches the old form exactly, in order',
        JSON.stringify(A.DEFAULT_FLIGHT_PHASES.map(p => p.phase)) === JSON.stringify(FORM_9),
        'got: ' + A.DEFAULT_FLIGHT_PHASES.map(p => p.phase).join(', '));
    check('Go-around and Rejected Takeoff are seeded as SPECIAL, not nominal',
        A.SPECIAL_FLIGHT_PHASES.length === 2 &&
        A.SPECIAL_FLIGHT_PHASES.every(p => p.special === true) &&
        A.SPECIAL_FLIGHT_PHASES.map(p => p.phase).sort().join('|') === 'Go-around|Rejected Takeoff');
    check('a new table carries both kinds',
        A.newDefaultPhaseTable().length === 11);
    check('newDefaultPhaseTable deep-copies',
        (function () {
            const a = A.newDefaultPhaseTable(); a[0].duration = '999';
            return A.newDefaultPhaseTable()[0].duration !== '999' &&
                   A.DEFAULT_FLIGHT_PHASES[0].duration !== '999';
        })(),
        'handing out the constant would leak one project’s edits into the next');
    check('the contingency catalogue is offered but NOT seeded',
        A.SPECIAL_PHASE_CATALOGUE.length > 0 &&
        A.newDefaultPhaseTable().every(p => p.phase !== 'Balked Landing'));
}

// ---------------------------------------------------------------------------
console.log('\n[phases] classification survives old project files');
{
    const A = sandbox();
    check('the flag classifies', A.isSpecialPhase({ phase: 'Whatever', special: true }));
    check('a bare name from the catalogue classifies', A.isSpecialPhase({ phase: 'Go-around' }),
        'projects saved before the flag existed carry no `special` key — recognising the name is what stops this build silently inflating their mission totals');
    check('aliases classify', A.isSpecialPhase('Go Around') && A.isSpecialPhase('RTO') &&
        A.isSpecialPhase('Missed Approach'));
    check('case and whitespace do not matter', A.isSpecialPhase('  gO-aRoUnD '));
    check('a nominal phase does not classify', !A.isSpecialPhase({ phase: 'Cruise' }) &&
        !A.isSpecialPhase('Landing'));
    check('an explicit special:false overrides the name table', !A.isSpecialPhase({ phase: 'Hold', special: false }),
        'a user who adds "Hold" as a nominal phase and enters its duration must not have it drop out of the mission');
    check('nothing throws on rubbish', !A.isSpecialPhase(null) && !A.isSpecialPhase(undefined) &&
        !A.isSpecialPhase({}) && !A.isSpecialPhase(''));
}

// ---------------------------------------------------------------------------
console.log('\n[phases] contingency time is not mission time');
{
    const A = sandbox();
    const t = A.newDefaultPhaseTable();
    A.setTable(t);
    // 1h + 15m + 2m + 5m + 20m + 4h + 25m + 10m + 3m = 5h 20m = 6.3333h
    const nominal = 1 + 15/60 + 2/60 + 5/60 + 20/60 + 4 + 25/60 + 10/60 + 3/60;
    const got = A.getTotalFlightDuration(t);
    check('the mission total is the nominal phases only',
        Math.abs(got - nominal) < 1e-9, 'expected ' + nominal.toFixed(6) + ', got ' + got.toFixed(6));
    check('…and the contingency rows do have durations that were skipped',
        Math.abs(A.getContingencyDuration(t) - (1/60 + 3/60)) < 1e-9,
        'if this is 0 the exclusion test above proves nothing');
    check('adding a contingency phase does not move the mission total',
        (function () {
            const t2 = A.newDefaultPhaseTable();
            t2.push({ phase: 'Diversion / Hold', duration: '45', durationUnit: 'mins', special: true });
            return Math.abs(A.getTotalFlightDuration(t2) - nominal) < 1e-9;
        })(),
        'a 45-minute hold would otherwise cut every exposure ratio in the project by 11%');
}

// ---------------------------------------------------------------------------
console.log('\n[phases] the exposure ratio');
{
    const A = sandbox();
    const t = A.newDefaultPhaseTable();
    A.setTable(t);
    const total = A.getTotalFlightDuration(t);

    const cruise = A.getPhaseExposureRatio('Cruise', t);
    check('a nominal phase normalises as before',
        Math.abs(cruise.ratio - 4 / total) < 1e-9 && cruise.specialPhases.length === 0,
        'r=' + cruise.ratio);
    check('two nominal phases add',
        Math.abs(A.getPhaseExposureRatio('Takeoff, Landing', t).ratio - (5/60) / total) < 1e-9);

    const ga = A.getPhaseExposureRatio('Go-around', t);
    check('a contingency phase holds r at 1',
        ga.ratio === 1 && ga.exposedHours === total,
        'the go-around lasts 3 minutes but the function had to survive the whole flight to be there for it — r=' + ga.ratio);
    check('…and says WHY, so it is distinguishable from a failed match',
        ga.specialPhases.length === 1 && ga.specialPhases[0] === 'Go-around' &&
        ga.matchedPhases.indexOf('Go-around') >= 0 && ga.unmatchedPhases.length === 0,
        'a bare r=1 reads identically to the fail-open case; the caller must be able to tell them apart');
    check('a contingency phase mixed with a nominal one still holds r at 1',
        A.getPhaseExposureRatio('Cruise, Go-around', t).ratio === 1,
        'the conservative bound governs the pair — this must not average to something in between');
    check('the 3-minute answer is NOT what comes back',
        Math.abs(ga.exposedHours - 0.05) > 1e-6,
        'r = 0.05/6.33 = 0.8% would understate the probability by two orders of magnitude, unconservatively');

    const none = A.getPhaseExposureRatio('', t);
    check('an empty phase list still fails open at r=1', none.ratio === 1 && none.specialPhases.length === 0);
    const bad = A.getPhaseExposureRatio('Orbit', t);
    check('an unknown phase still fails open and is reported',
        bad.ratio === 1 && bad.unmatchedPhases.join() === 'Orbit' && bad.matchedPhases.length === 0);
    check('specialPhases is present on every return path',
        [cruise, ga, none, bad].every(r => Array.isArray(r.specialPhases)),
        'a caller reading .specialPhases.length must never hit undefined');
}

// ---------------------------------------------------------------------------
console.log('\n[phases] the FHA form no longer carries its own list');
{
    check('the AC grid is an empty container',
        /<div class="checkbox-grid" id="ac-fha-phases"><\/div>/.test(html));
    check('the System grid is an empty container',
        /<div class="checkbox-grid" id="sys-fha-phases"><\/div>/.test(html));
    check('no hardcoded phase checkbox survives anywhere in the page',
        !/<input type="checkbox" value="(Standing|Initial Climb|Cruise|Landing|Go-around)"/.test(html),
        'this is the check that catches a copy of the grid somewhere else in the file');
    check('and the reason is recorded where the next reader will be',
        /made this form a SECOND phase vocabulary/.test(html));
    check('the grid is rendered from the table',
        /function renderFhaPhaseGrid\(containerId, keepValue\)/.test(help) &&
        /typeof flightPhasesData !== 'undefined' \? flightPhasesData : \[\]/.test(help));

    console.log('\n[phases] …and every path that shows the form rebuilds it');
    // Windows widened 23 Sep 2026: each renderer now opens with the one-line lazy_render gate
    // (~150 chars) before it reaches the grid; regression_lazy_render pins that line.
    check('renderACFHA rebuilds the AC grid',
        /function renderACFHA\(\)\s*\{[\s\S]{0,480}renderFhaPhaseGrid\('ac-fha-phases'\)/.test(help));
    check('renderSysFHA rebuilds the System grid',
        /function renderSysFHA\(\)\s*\{[\s\S]{0,300}renderFhaPhaseGrid\('sys-fha-phases'\)/.test(help));
    check('editing a row builds the grid around THAT ROW\'s stored phases',
        /renderFhaPhaseGrid\('ac-fha-phases', item\.phases\)/.test(help) &&
        /renderFhaPhaseGrid\('sys-fha-phases', item\.phases\)/.test(help),
        'otherwise opening an imported row to fix a typo silently drops phases the table does not list');
    check('a value the table does not contain is kept and flagged, not dropped',
        /Not in this project/.test(help) && /kept so the row is not silently altered/.test(help));
    check('renaming or deleting a phase refreshes both grids',
        /if \(field === 'phase' && typeof refreshFhaPhaseGrids === 'function'\) refreshFhaPhaseGrids\(\);/.test(help) &&
        /FHA rows that named the removed phase keep the text/.test(help));
    check('an empty phase table says so rather than rendering nothing',
        /No flight phases defined/.test(help),
        'zero checkboxes and no message reads as a broken form');
}

// ---------------------------------------------------------------------------
console.log('\n[phases] a new project gets a new table');
{
    const body = (misc.match(/function initNewProjectState\(\)[\s\S]*?\n\}/) || [''])[0];
    // 20 Aug 2026 — the reset is now DERIVED from project_stores.js, so the guarantee this
    // suite was written to protect moved with it: flightPhasesData must be a declared store
    // whose reset seeds a fresh default table. That is a stronger check than the old text
    // match, because the declaration is what every other save/load path reads too. The
    // legacy body is still accepted, since it survives as the load-failure fallback.
    const stores = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'site', 'project_stores.js'), 'utf8');
    const phasesEntry = (stores.match(/\{ key: 'flightPhasesData'[\s\S]*?\n\s*\{ key:/) ||
                         stores.match(/\{ key: 'flightPhasesData'[\s\S]{0,900}/) || [''])[0];
    check('initNewProjectState reseeds flightPhasesData',
        (/window\.SLStores\.reset\(\)/.test(body) && /newDefaultPhaseTable\(\)/.test(phasesEntry)) ||
        /flightPhasesData = \(typeof newDefaultPhaseTable === 'function'\)/.test(body),
        'it reset seventeen stores and not this one');
    check('flightPhasesData is a declared project store', /\{ key: 'flightPhasesData'/.test(stores));
    check('…and resets the mission-profile selection with it',
        /_phasesProfileId = ''/.test(body));
    check('the reason is recorded',
        /silently became the\s*\n\s*\/\/ phase vocabulary of a Part 25 project/.test(misc) &&
        /Every other store was, so/.test(misc));
    check('the blank-project renderer sweep redraws the phases tab and the FHA grids',
        /'renderFlightPhases','refreshFhaPhaseGrids'\]/.test(misc),
        'blanking a tbody is not the same as re-rendering a tab — the same lesson as the fc_variants panel');
}

// ---------------------------------------------------------------------------
console.log('\n[phases] the AI vocabulary is the project vocabulary');
{
    check('FLIGHT_PHASES is derived from the shipped constants, not retyped',
        /window\.DEFAULT_FLIGHT_PHASES/.test(ai) && /window\.SPECIAL_FLIGHT_PHASES/.test(ai));
    check('its literal fallback agrees with the default table',
        /'Standing', 'Taxi', 'Takeoff', 'Initial Climb', 'Climb', 'Cruise',/.test(ai) &&
        /'Descent', 'Approach', 'Landing', 'Rejected Takeoff', 'Go-around'/.test(ai),
        'the fallback only fires on a project with no table at all, but a fallback that disagrees is how this started');
    check('the old eight-value list is gone',
        !/\['Taxi', 'Takeoff', 'Climb', 'Cruise', 'Descent', 'Approach', 'Landing', 'Go-around'\]/.test(ai));
    check('the prompt still enumerates the PROJECT phases',
        /_projectPhaseNames\(\)\.join\(', '\)/.test(ai));
    check('…and tells the model what a contingency phase means',
        /Some of those are CONTINGENCY phases/.test(ai) &&
        /A contingency phase does not shrink the exposure window/.test(ai));
    // Asserts the INVARIANT, not a literal. Pinned at 70.3 when A7-3 shipped and
    // broke on the very next edit to ai_assistant.js — which is the wrong kind of
    // failure: it says "a number changed", not "something is unsafe". What matters
    // is that the loader pins a version at least as new as the one this behaviour
    // landed in, because ai_assistant.js is lazy-loaded and editing it without
    // moving the pin ships nothing.
    {
        const pin = (S('ai_loader.js').match(/ai_assistant\.js\?v=(\d+)\.(\d+)/) || []);
        const v = pin.length ? (+pin[1] + (+pin[2]) / 1000) : 0;
        check('the lazy loader pins ai_assistant.js at or past the build this shipped in',
            v >= 70.003, 'found: ' + (pin[0] || 'no pin at all'));
    }
}

// ---------------------------------------------------------------------------
console.log('\n[phases] the engineer is told why r is 1');
{
    check('the FTA exposure panel has a contingency branch BEFORE the r>=0.999 hide',
        ftaV.indexOf('exp.specialPhases || []') < ftaV.indexOf('exp.ratio >= 0.999'),
        'ordered the other way the panel hides and the engineer sees nothing at all');
    check('…and it states the reasoning rather than just the number',
        /had to survive the whole flight to be available when the contingency was flown/.test(ftaV));
    check('…and admits what is missing',
        /no occurrence-frequency field yet/.test(ftaV),
        'P(demand) x duration is the real answer; holding the bound is honest, pretending it is exact is not');
    check('the Flight Phases tab explains the two kinds of row',
        /Contingency phases/.test(help) && /excluded from the mission total/.test(help));
    check('…and offers a catalogue rather than a free-text box for them',
        /function addContingencyPhase\(\)/.test(help) &&
        /addContingencyPhase\(\)/.test(html));
    check('a manually added phase is explicitly nominal',
        /durationUnit: 'hours', special: false/.test(help),
        'without this, typing "Diversion" as a nominal phase would silently drop it from the mission duration');
}

// ---------------------------------------------------------------------------
// The renderer, EXECUTED. Every check above it about the grid reads source text,
// and a regex is perfectly happy to match inside a function that throws on the
// first line. This runs it against a hand-rolled DOM stub — no jsdom, so it runs
// everywhere the rest of the wall does.
// ---------------------------------------------------------------------------
console.log('\n[phases] the grid renderer, run');
{
    const fn = (help.match(/function renderFhaPhaseGrid\(containerId, keepValue\)[\s\S]*?\n\}/) || [''])[0];
    const consts = (bind.match(/const DEFAULT_FLIGHT_PHASES = \[[\s\S]*?let flightPhasesData = newDefaultPhaseTable\(\);/) || [''])[0];
    const sb = { console, JSON, String, Array, Object }; sb.window = sb; vm.createContext(sb);
    vm.runInContext(
        "function esc(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];});}\n" +
        consts + "\n" +
        "var HOST={html:'',checked:[],querySelectorAll:function(){return HOST.checked.map(function(v){return {value:v};});}," +
        "set innerHTML(v){HOST.html=v;},get innerHTML(){return HOST.html;}};\n" +
        "var document={getElementById:function(id){return id==='grid'?HOST:null;}};\n" +
        fn + "\n" +
        "globalThis.T={render:renderFhaPhaseGrid,HOST:HOST,setTable:function(t){flightPhasesData=t;}};", sb);
    const T = sb.T, H = T.HOST;
    const sbDefault = JSON.parse(JSON.stringify(sb.flightPhasesData || []));

    T.render('grid');
    const boxes = (H.html.match(/value="([^"]+)"/g) || []).map(x => x.slice(7, -1));
    check('the grid renders all eleven default phases',
        boxes.length === 11 && boxes[0] === 'Standing' && boxes[10] === 'Go-around', boxes.join(','));
    check('the contingency heading appears exactly once',
        (H.html.match(/Contingency phases/g) || []).length === 1);
    check('a blank form has nothing ticked', !/checked/.test(H.html));

    H.checked = [];
    T.render('grid', 'Cruise, Go-around');
    check('keepValue ticks exactly the row’s phases',
        (H.html.match(/checked/g) || []).length === 2 &&
        /value="Cruise" checked/.test(H.html) && /value="Go-around" checked/.test(H.html));
    check('no orphan section when every value is known', !/Not in this project/.test(H.html));

    T.render('grid', 'Cruise, All phases, Hover');
    check('unknown values are kept, ticked and flagged',
        /Not in this project/.test(H.html) && /value="All phases" checked/.test(H.html) &&
        /value="Hover" checked/.test(H.html),
        '"All phases" is in the shipped demos; dropping it on edit would rewrite the row');
    check('…and they sit below the project’s own phases',
        H.html.indexOf('value="Cruise"') < H.html.indexOf('Not in this project'));

    H.checked = ['Takeoff', 'Landing']; H.html = '';
    T.render('grid');
    check('a rebuild with no keepValue preserves what is ticked',
        (H.html.match(/checked/g) || []).length === 2 && /value="Takeoff" checked/.test(H.html),
        'renderACFHA calls this — losing mid-entry selections would be worse than the bug it fixes');

    T.setTable([]); H.checked = []; T.render('grid');
    check('an empty table renders the warning rather than silence',
        /No flight phases defined/.test(H.html));

    T.setTable([{ phase: 'Hover' }, { phase: 'Transition' }, { phase: 'Cruise' }]);
    H.checked = []; T.render('grid');
    check('a VTOL project gets its own phases, and no contingency heading',
        /value="Hover"/.test(H.html) && !/Contingency phases/.test(H.html));

    H.checked = []; T.setTable(JSON.parse(JSON.stringify(sbDefault)));
    T.render('grid', 'All phases');
    check('"All phases" is a recognised wildcard, not an error',
        /Legacy wildcard/.test(H.html) && !/Not in this project/.test(H.html) &&
        /value="All phases" checked/.test(H.html),
        'every shipped showcase FHA row uses it — flagging it red would be wrong AND ugly');
    check('…and it is never OFFERED as a checkbox on a clean form',
        (function () { H.checked = []; T.render('grid'); return !/All phases/.test(H.html); })(),
        'an "All" box competing with the individual ones is the ambiguity this change exists to remove');
    check('a genuinely unknown value still lands in the error bucket',
        (function () { H.checked = []; T.render('grid', 'All phases, Orbit');
            return /Legacy wildcard/.test(H.html) && /Not in this project/.test(H.html) &&
                   H.html.indexOf('value="All phases"') < H.html.indexOf('Not in this project'); })());
}


console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

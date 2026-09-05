// regression_ai_input_gate.test.js — the AI is gated until its inputs exist.
//
// Waqas, 2 Sep 2026: "the AI should be gated till relevant info has been provided, not
// a human factors document turns AFHA ready to go green."
//
// TWO BUGS, ONE SENTENCE.
//
// 1. READINESS WAS CONTENT-BLIND. The rules counted uploaded documents as a substitute
//    for model artifacts — (funcsN||docsN) for the AFHA, (docsN||treesN) for the PRA,
//    (docsN||itemsN) for the ZSA, (funcsN||docsN) for STPA. Nothing about a file existing
//    says what is in it, so an HF spec, a EULA or a scanned invoice turned four analyses
//    green. A green chip is read as "the model has what it needs", so a wrong green is
//    worse than no chip at all.
//
// 2. THE CHIP WAS ADVISORY. Even when it said red you could click straight past it and
//    spend a model call to be told insufficient_information by the model instead.
//
// The fix for (1) is that a document now satisfies only the two analyses whose input
// genuinely IS a document. Everything else gates on the model artifact its upstream step
// produces — the golden thread doing the gating. The fix for (2) wraps the action's own
// run(), which gates the launcher and the in-lane bar together because both invoke it.

const fs = require('fs');
const path = require('path');
const SITE = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(SITE, f), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra ? ('\n       ' + extra) : '')); }
}

console.log('\nregression_ai_input_gate — no analysis runs before its inputs exist\n');

const ai = R('site/ai_assistant.js');
const bar = R('site/lane_ai_bar.js');

// ------------------------------------------------------- documents stop standing in
ok('the content-blind substitution is recorded as the bug it was', /nothing about a file existing says what is in it/.test(ai));
ok('the quote that prompted it is recorded', /a human factors document\s*\n\s*\/\/ turns AFHA ready to go green/.test(ai));
ok('AFHA no longer accepts a document in place of functions', !/case 'afha':\s*return \(funcsN\|\|docsN\)/.test(ai));
ok('AFHA asks for aircraft functions specifically', /case 'afha':\s*return acFuncsN\?ok:no\('aircraft functions/.test(ai));
ok('SFHA asks for system functions, not any functions', /case 'sfha':\s*return sysFuncsN\?/.test(ai));
ok('PRA no longer accepts a document as a zonal layout', !/case 'pra':\s*return \(docsN\|\|treesN\)/.test(ai));
ok('PRA asks for zones AND something the risk could defeat', /case 'pra':\s*return \(zonesN&&\(fhaN\|\|treesN\)\)/.test(ai));
ok('ZSA no longer accepts a document as installed equipment', !/case 'zsa':\s*return \(docsN\|\|itemsN\)/.test(ai));
ok('ZSA asks for zones AND items', /case 'zsa':\s*return \(zonesN&&itemsN\)/.test(ai));
ok('STPA no longer accepts a document in place of functions', !/case 'stpa':\s*return \(funcsN\|\|docsN\)/.test(ai));
ok('zones are counted from the real store', /zonesN=Array\.isArray\(s\.zsaData\)/.test(ai));
ok('the two document-input analyses are named as the exception', /the two analyses whose input genuinely IS a document/.test(ai));
ok('decomposition still takes a document — it reads one', /case 'decomp':\s*return docsN\?ok/.test(ai));
ok('document review still takes a document — it audits one', /case 'docreview':\s*return \(docsN&&/.test(ai));

// docsN must appear in exactly those two rules and nowhere else in the switch
const sw = (ai.match(/switch\(r\)\{[\s\S]*?\n        \}/) || [''])[0];
const docUses = (sw.match(/docsN/g) || []).length;
ok('docsN is referenced only by the two document analyses', docUses === 3, 'found ' + docUses + ' references');

// ------------------------------------------------------- the crew-effect refinement
ok('the crew-credit drafter counts conditions with a CREW effect, not FHA rows', /crewFcN=all\.filter/.test(ai));
ok('an effect of "none" does not count as a crew effect', /!\/\^none\$\/i\.test/.test(ai));
ok('and it says so where it is computed', /An FHA with\s*\n\s*\/\/ no crew effect anywhere gives it nothing to register/.test(ai));

// ------------------------------------------------------------------- the gate itself
ok('the gate wraps the action\'s own run', /function _gateAction\(a\)/.test(ai));
ok('the gate is applied to every action on the way out', /\]\)\.map\(_gateAction\);/.test(ai));
ok('an ungated action is one with no needs block — not an analysis', /if \(!a \|\| !a\.needs \|\| typeof a\.run !== 'function'/.test(ai));
ok('the gate is idempotent', /a\.run\._aiGated/.test(ai) && /gated\._aiGated = true;/.test(ai));
ok('the refusal names the missing input', /needs ' \+ rd\.need \+ ' first\./.test(ai));
ok('why one wrap covers both surfaces is recorded', /gates BOTH surfaces at once/.test(ai));
ok('the cost of the old advisory-only chip is recorded', /spend a model call to be told\s*\n\s*\/\/ insufficient_information/.test(ai));
ok('readiness is exposed for the bar to ask', /inputReady: function \(r\)/.test(ai));

// ------------------------------------------------------------- the bar shows the gate
ok('the bar disables a button whose analysis is not ready', /b\.disabled = true;/.test(bar));
ok('the disabled button says what is missing', /' — needs ' \+ rd\.need/.test(bar));
ok('the bar asks rather than deciding', /_API\.inputReady\(a\.needs\.r\)/.test(bar));
ok('the bar records that it is not the authority', /asks, it does not decide/.test(bar));
ok('a blocked button is visibly blocked', /slab-ai-blocked\{opacity:\.5;cursor:not-allowed;\}/.test(bar));

// --------------------------------------------------- EXECUTED: the reported bug is dead
(function live() {
    const grab = re => (ai.match(re) || [''])[0];
    const ready = grab(/function _aiInputReady\(r\)\{[\s\S]*?\n    \}/);
    ok('readiness source lifted for execution', ready.length > 500);

    // One HF document uploaded. Nothing else in the project. This is the reported case.
    function run(model, docs) {
        const ctx = {
            snapshot: () => model,
            _sourceDocsApi: () => ({ list: () => docs }),
            window: undefined
        };
        const fn = new Function('snapshot', '_sourceDocsApi', 'window', ready + '; return _aiInputReady;');
        return fn(ctx.snapshot, ctx._sourceDocsApi, ctx.window);
    }
    const empty = { acFunctionsData: [], acFhaData: [], systemsData: [], ftaPages: [], itemsData: [], zsaData: [] };
    const hfDoc = [{ name: 'AEO-HF-0001 Flight Deck & Human Factors.pdf', text: 'Task Identification. Crew alerting. Situation awareness.' }];

    let rdy = run(empty, hfDoc);
    ok('THE REPORTED BUG: an HF document no longer makes the AFHA ready', rdy('afha').ready === false);
    ok('…and it says what is actually missing', /aircraft functions/.test(rdy('afha').need));
    ok('an HF document no longer makes the PRA ready', rdy('pra').ready === false);
    ok('an HF document no longer makes the ZSA ready', rdy('zsa').ready === false);
    ok('an HF document no longer makes STPA ready', rdy('stpa').ready === false);
    ok('a document DOES make decomposition ready — it is the input', rdy('decomp').ready === true);

    // Now give it what the AFHA actually needs.
    const withFuncs = Object.assign({}, empty, { acFunctionsData: [{ subId: 'SF-01', subName: 'Provide thrust' }] });
    rdy = run(withFuncs, []);
    ok('functions in the lane make the AFHA ready, with no document at all', rdy('afha').ready === true);
    ok('but decomposition is now NOT ready — its input is the document', rdy('decomp').ready === false);
    ok('FCIM is ready on functions', rdy('fcim').ready === true);
    ok('fault-tree synthesis still waits for an FHA', rdy('synth').ready === false);

    // Zones and items gate the zonal pair independently.
    const withZones = Object.assign({}, empty, { zsaData: [{ zoneId: '110' }] });
    rdy = run(withZones, []);
    ok('zones alone do not make the ZSA ready — it needs the equipment too', rdy('zsa').ready === false);
    ok('…and it asks for exactly that', /equipment installed per zone/.test(rdy('zsa').need));
    rdy = run(Object.assign({}, withZones, { itemsData: [{ itemId: 'I1', zoneId: '110' }] }), []);
    ok('zones plus items make the ZSA ready', rdy('zsa').ready === true);

    // The crew-effect refinement.
    rdy = run(Object.assign({}, empty, { acFhaData: [{ fcId: 'FC-1', effCrew: 'None' }] }), []);
    ok('an FHA whose only crew effect is "None" does not make crew credit ready', rdy('hfcredit').ready === false);
    ok('…and it says the FHA lacks a crew effect', /crew effect/.test(rdy('hfcredit').need));
    rdy = run(Object.assign({}, empty, { acFhaData: [{ fcId: 'FC-1', effCrew: 'Crew must select alternate extension' }] }), []);
    ok('an FHA carrying a real crew effect does make it ready', rdy('hfcredit').ready === true);

    // Minimum Flight Crew is assessable from nothing — Appendix D is fixed.
    rdy = run(empty, []);
    ok('Minimum Flight Crew is ready from an empty project', rdy('hf:mfc').ready === true);
    ok('an empty HF lane is not ready', rdy('hf:cd').ready === false);
    ok('function allocation asks for functions, not its own rows', /sub-functions to allocate/.test(rdy('hf:alloc').need));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);

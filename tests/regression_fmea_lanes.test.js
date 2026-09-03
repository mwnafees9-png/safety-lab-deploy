#!/usr/bin/env node
/*
 * Regression — the two FMEAs are scoped through Program Planning, and the
 * piece-part worksheet shows the phase it was already storing.
 *
 * WHAT WAS WRONG. ARP4761A App J defines two FMEAs with two different worksheets
 * — Table J1 functional, Table J2 piece-part — and two different reasons for
 * existing. The product had both modes and a segmented control to switch them,
 * but FMEA had no lane in the programme catalogue at all: it lived only on the
 * spine. So a programme could not record WHICH FMEA it was doing, and a project
 * committed to a functional FMEA still had a Piece-Part tab inviting it to start
 * one that nothing in its plan called for.
 *
 * The opt-in default is the standard's, not ours. J.3.2: piece-part FMEAs are
 * performed as necessary to refine a failure rate, typically when the more
 * conservative functional rates will not let the system meet the FTA probability
 * budget. A programme that has not hit that wall has no reason to run one.
 *
 * AND A CAPTURED-THEN-DISCARDED FIELD. The FMEA form has ONE shared field list
 * for both modes (safety_lab.js), including fmea-phase. The functional table
 * rendered a Phase column; the piece-part table did not. So a piece-part row
 * stored a flight phase that no column ever showed — the analyst records a
 * judgement and it vanishes, exactly the shape of the HF workloadBand bug. Table
 * J2 carries Flight Phase, so the standard wanted the column anyway.
 *
 * ALSO PINNED HERE (gap CLOSED 2 Aug 2026): the config_data.js `fmea` schema
 * used to describe a THIRD column set (item, effect, mitigation) matching
 * neither rendered mode — the template editor describing a table nobody has.
 * It is now split into fmeaFunctional / fmeaPiecePart, whose column ids are
 * asserted below to be exactly the row fields the renderer reads. The render
 * was always correct; the schema is what changed.
 *
 * Run: node tests/regression_fmea_lanes.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const PIN = require('./lib/pinfloor.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');

global.projectConfig = { regulation: 'Part 25' };
global.ftaPages = []; global.praData = []; global.zsaData = []; global.cmaData = [];
const PP = require(path.join(SITE, 'program_plan.js'));
const sup = S('support_modules.js'), bind = S('bindings_modules.js'),
      help = S('helpers_modules.js'), lab = S('safety_lab.js'), cfg = S('config_data.js');

console.log('\n[fmea] two lanes, in the catalogue like every other analysis');
{
    const func = PP.CATALOGUE.find(l => l.id === 'ffmea');
    const pp   = PP.CATALOGUE.find(l => l.id === 'ppfmea');
    check('both FMEA types are catalogue lanes', !!func && !!pp,
        'FMEA was spine-only — a programme could not record which one it was doing');
    check('they cite the right worksheet each',
        func.std === 'ARP4761A App J · Table J1' && pp.std === 'ARP4761A App J · Table J2');
    check('functional is basis-expected on the transport bases',
        func.expected.indexOf('Part 25') >= 0 && !func.optIn,
        'J.3.2 — functional FMEAs are typically performed to support the safety analysis effort');
    check('piece-part is OPT-IN',
        pp.optIn === true && pp.expected.length === 0,
        'J.3.2 — performed as necessary to refine a failure rate, typically when the functional rates will not meet the FTA budget');
    check('the opt-in default is attributed to the standard, not to us',
        /that default comes from the standard rather\s*\n\s*\/\/ than from us/.test(S('program_plan.js')));
    check('a Part 25 project starts with functional ON and piece-part OFF',
        PP.defaultsFor('Part 25')['ffmea'] === true &&
        PP.defaultsFor('Part 25')['ppfmea'] === false);
    check('both point at the FMEA tab and nav item',
        func.tabs.indexOf('fmea') >= 0 && pp.tabs.indexOf('fmea') >= 0 &&
        func.snav.indexOf('snav-fmea') >= 0);
    check('neither is a sub-lane — they are peer methods with their own appendix',
        !func.subLane && !pp.subLane && !func.parent && !pp.parent);
}

console.log('\n[fmea] the mode toggle obeys the programme plan');
{
    const sb = { console }; sb.window = sb; vm.createContext(sb);
    const fn = (help.match(/function fmeaModeInScope\(mode\) \{[\s\S]*?\n\}/) || [''])[0];
    vm.runInContext(fn + '\n;globalThis.T = { inScope: fmeaModeInScope, setPP: p => { window.PROGRAM_PLAN = p; } };', sb);
    const T = sb.T;

    // THE CHECK THAT WOULD HAVE CAUGHT THE SHIPPED BUG: the name the gate reads
    // must be the name program_plan.js actually exports. Everything below mocks a
    // global, and a mock proves nothing if it stands in for the wrong name.
    check('the gate reads the global the module really exports',
        /window\.PROGRAM_PLAN = API/.test(S('program_plan.js')) &&
        /W\.PROGRAM_PLAN \|\| W\.ProgramPlan/.test(help),
        'shipped reading window.ProgramPlan, which is undefined — the gate failed open and gated nothing');

    T.setPP(null);
    check('with no ProgramPlan present, nothing is gated',
        T.inScope('functional') === true && T.inScope('piece-part') === true,
        'never gate what we cannot ask about — a missing module must not lock the user out of their own worksheet');
    T.setPP({ laneOn: id => id === 'ffmea' });
    check('functional in scope, piece-part out',
        T.inScope('functional') === true && T.inScope('piece-part') === false);
    check('the right lane id is asked for each mode',
        (function () { const seen = []; T.setPP({ laneOn: id => { seen.push(id); return true; } });
            T.inScope('functional'); T.inScope('piece-part');
            return seen.join(',') === 'ffmea,ppfmea'; })());
    T.setPP({ laneOn: () => { throw new Error('boom'); } });
    check('a throwing plan does not lock the worksheet',
        T.inScope('functional') === true);

    check('setFmeaMode refuses an out-of-scope mode instead of switching',
        /if \(!fmeaModeInScope\(mode\)\) \{/.test(help) && /is not in this programme/.test(help));
    check('…and says where to change it, and what the record is for',
        /Add the lane on Program Planning first/.test(help) && /the scope record is what the SSPP prints/.test(help));
    check('the buttons are disabled and explain themselves',
        /function refreshFmeaModeButtons\(\)/.test(help) &&
        /Out of programme scope/.test(help) &&
        /el\.disabled = !on;/.test(help));
    check('…and are refreshed on every FMEA render',
        /if \(typeof refreshFmeaModeButtons === 'function'\) refreshFmeaModeButtons\(\);/.test(bind),
        'a gate that only runs on load goes stale the moment the plan changes');
}

console.log('\n[fmea] the piece-part worksheet shows the phase it was already storing');
{
    check('the piece-part header now carries Phase',
        /<th>Detection<\/th><th>Severity<\/th><th>Phase<\/th><th>λ \(\/hr\)<\/th>/.test(sup));
    check('…and the row renders a matching cell, in the same position',
        /sevCell \+\n\s*'<td>' \+ esc\(row\.phase \|\| ''\) \+ '<\/td>' \+\n\s*'<td>' \+ esc\(row\.rate \|\| 0\)/.test(bind),
        'a header without a cell shifts every column right of it');
    check('the functional worksheet still has its Phase column',
        /<th>Compensating Provision<\/th><th>Phase<\/th>/.test(sup));
    check('the form was already capturing it for both modes',
        /'fmea-phase'/.test(lab),
        'this is why it mattered — the value was stored and then shown nowhere');
    check('the reason is recorded where the next reader will be',
        /Phase was CAPTURED and never shown/.test(sup) &&
        /same\s*\n?\s*\/\/\s*shape as the HF workloadBand bug/.test(sup));

    // Header/cell count parity — the defect a mismatched pair actually causes.
    const headPP = (sup.match(/'<th>Actions<\/th><th>Scope<\/th><th>ID<\/th><th>FTA Link<\/th>[\s\S]*?'<\/tr>'/) || [''])[0];
    // 15: Actions, Scope, ID, FTA Link, Component, Failure Mode, Local Effect,
    // Next-Higher Effect, End Effect, Detection, Severity, Phase, lambda, t, P.
    check('piece-part header column count is 15, matching the row builder',
        (headPP.match(/<th>/g) || []).length === 15,
        'found ' + (headPP.match(/<th>/g) || []).length);
}

console.log('\n[fmea] the AI accept path keeps the phase it was asked for');
{
    const ai = fs.readFileSync(path.join(SITE, 'ai_assistant.js'), 'utf8');
    check('both FMEA specs ask the model for Flight Phase',
        /COLUMNS \(Table J1\)[^']*Flight Phase/.test(ai) &&
        /COLUMNS \(Table J2\)[^']*Flight Phase/.test(ai),
        'both App J worksheets carry the column, so both specs request it');
    check('…and the accept path now stores it',
        /phase: x\.phase \|\| '',/.test(ai),
        'the row builder had no phase field — the answer was discarded on accept');
    check('the drop is explained where the next reader will be',
        /asked for, paid for,\s*\n\s*\/\/ thrown away/.test(ai));
    // Invariant, not a literal (HANDOFF §7.3 — an exact-version pin broke on the
    // very next bump, twice now): the phase fix shipped at v=70.5, so the pin
    // must exist and never be BELOW that. Later bumps pass by construction.
    check('the lazy pin moved with the file',
        (function () {
            const m = S('ai_loader.js').match(/ai_assistant\.js\?v=(\d+(?:\.\d+)?)/);
            return !!m && PIN.pinAtLeast(m[1], '70.5');
        })(),
        'ai_assistant.js is lazy-loaded; editing it without bumping the pin ships nothing — and the pin must not regress below 70.5 (the phase fix)');
    // Executed: the row builder must actually carry phase through.
    // Anchored on fmeaType — there are several `const row = {` literals in this
    // file, and a non-greedy match from the first one lands on the wrong feature.
    const body = (ai.match(/const row = \{[^}]*fmeaType:[\s\S]*?\n            \};/) || [''])[0];
    check('phase sits inside the row literal, not in dead code',
        body.indexOf("phase: x.phase || ''") > 0, 'not found in the row object');
}

console.log('\n[fmea] the schema split — the editor now describes the tables that exist');
{
    const idsOf = (key) => {
        const m = (cfg.match(new RegExp('    ' + key + ': \\{[\\s\\S]*?\\n    \\}')) || [''])[0];
        return (m.match(/id: '([a-zA-Z]+)'/g) || []).map(x => x.slice(5, -1));
    };
    const fIds = idsOf('fmeaFunctional');
    const pIds = idsOf('fmeaPiecePart');
    check('the phantom single fmea schema is gone',
        !/\n    fmea: \{/.test(cfg),
        'one schema cannot describe two modes — that was the whole defect');
    check('two schemas exist, one per rendered mode', fIds.length > 0 && pIds.length > 0);
    // THE INVARIANT: every schema column id is a row field the renderer actually
    // reads for that mode (bindings_modules `_fmeaRowHtml`). Not a literal column
    // count — the correspondence itself. fmeaId renders via row.fmeaId, funcSubId
    // resolves the function label, beId resolves the FTA node; the rest must
    // appear as esc(row.<id> …) or a direct row.<id> read.
    const rendered = (bind.match(/row\.[a-zA-Z]+/g) || []).map(x => x.slice(4));
    const renderedSet = new Set(rendered);
    const missF = fIds.filter(id => !renderedSet.has(id));
    const missP = pIds.filter(id => !renderedSet.has(id));
    check('every functional-schema column is a field the renderer reads', missF.length === 0,
        'schema invents fields the table does not have: ' + missF.join(', '));
    check('every piece-part-schema column is a field the renderer reads', missP.length === 0,
        'schema invents fields the table does not have: ' + missP.join(', '));
    check('the old phantom fields did not survive the split',
        fIds.indexOf('item') < 0 && pIds.indexOf('item') < 0 &&
        fIds.indexOf('mitigation') < 0 && pIds.indexOf('mitigation') < 0 &&
        fIds.indexOf('effect') < 0 && pIds.indexOf('effect') < 0);
    check('the split carries the effect CHAIN, per App J',
        ['localEffect', 'nextEffect', 'endEffect'].every(id => fIds.indexOf(id) >= 0 && pIds.indexOf(id) >= 0));
    check('piece-part carries Phase — the column §4.5/§4.6 existed to feed',
        pIds.indexOf('phase') >= 0);
    check('the funcMode vocabulary matches ui_constants, not an invented list',
        (function () {
            const ui = S('ui_constants.js');
            const declared = (ui.match(/FMEA_FUNC_MODE_LABELS = \{[\s\S]*?\}/) || [''])[0];
            const keys = (declared.match(/'([a-z-]+)':/g) || []).map(x => x.slice(1, -2));
            const schema = (cfg.match(/    fmeaFunctional: \{[\s\S]*?\n    \}/) || [''])[0];
            const opts = (schema.match(/id: 'funcMode'[\s\S]*?options: \[([^\]]*)\]/) || ['', ''])[1];
            return keys.length > 0 && keys.every(k => opts.indexOf("'" + k + "'") >= 0);
        })(),
        'a fifth vocabulary on a shared field is how the type/level disease started (HANDOFF §8)');
    check('the template plumbing knows both new kinds',
        /fmeaFunctional: \(\) =>/.test(S('misc_fn_modules.js')) && /fmeaPiecePart: {2}\(\) =>/.test(S('misc_fn_modules.js')),
        'a schema the re-render map does not know is a template editor editing nothing');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

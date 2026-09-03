#!/usr/bin/env node
/*
 * Regression — deterministic where it can be, model where it cannot.
 *
 * This file pins three things that moved together on 1 Aug 2026, after auditing
 * which parts of the requirements lane lean on a model and which compute.
 *
 * 1. TWO LINTS THAT THE §5.3.1 SPLIT SILENTLY DISARMED. Both are mine, shipped
 *    hours earlier, and neither would have failed loudly:
 *
 *      · `verifiable` demanded a number in the text when `type === 'Quantitative'`.
 *        The migration maps Quantitative onto type 'Safety' + analysis
 *        'Probabilistic', so after it runs NO row can match — a lint that cannot
 *        fire is indistinguishable from a lint that passes.
 *      · `rationale` treated a requirement as derived when `level === 'Derived'`.
 *        'Derived' is a §5.3.1.10 TYPE now; the level axis is L1/L2/L3. A
 *        requirement marked Derived on the entry form was no longer asked for the
 *        rationale the clause exists to demand.
 *
 * 2. _SPEC_REQ ASKED THE MODEL FOR A DAL. It required "an assigned development
 *    assurance level (A-E, mapped from the failure-condition classification)" and
 *    ended its FORMAT line with "| FDAL |". getSafetyTarget() computes DAL from
 *    severity plus the certification basis; fha-dal and dalgebra generate the
 *    requirements from it; _SPEC_ARCH in the same file says NEVER allocate a DAL;
 *    and _applyReqSuggestion never wrote one. The model produced a value that was
 *    displayed nowhere and stored nowhere — paid for, discarded, and left as an
 *    instruction for somebody to wire up and quietly outrank the engine.
 *
 *    Its class list was also its own — "safety, functional, performance,
 *    interface, operational, maintenance, derived", saying "maintenance" where
 *    §5.3.1.7 says Maintainability. That was an eighth vocabulary on `type`.
 *
 * 3. INTERFACE REQUIREMENTS ARE NOW DERIVED, NOT DRAFTED. §5.3.1.8 asks for the
 *    interconnections plus the characteristics of the information communicated,
 *    every input with a source and every output with a destination, and signal
 *    behaviour fully described. projectConfig.interfaces holds precisely those
 *    fields and was already read by four other modules; nothing turned it into
 *    requirements. An INCOMPLETE edge still generates one, and that requirement
 *    says what is missing — a silent gap in an interface register is invisible,
 *    and the requirements register is where it becomes somebody's problem.
 *
 * NOT BUILT, DELIBERATELY: fault isolation (§5.3.1.7 names the percentage of
 * failures that can be isolated). FMEA carries a `detection` field and no
 * isolation field, so there is nothing to compute from. Logged, not guessed.
 *
 * Run: node tests/regression_deterministic_split.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const vv = S('vv_validation.js'), ai = S('ai_assistant.js'), asr = S('assurance_modules.js'),
      html = S('index.html'), help = S('helpers_modules.js');
const T = require(path.join(SITE, 'req_taxonomy.js'));

// ---------------------------------------------------------------------------
console.log('\n[lints] the two checks the split disarmed, executed');
{
    const sb = { console, Array, String, RegExp }; vm.createContext(sb);
    const lints = (vv.match(/const LINTS = \[[\s\S]*?\n    \];/) || [''])[0];
    const vague = (vv.match(/const _VAGUE = \[[\s\S]*?\];/) || [''])[0];
    const ph = (vv.match(/const _PLACEHOLDER = [^\n]+/) || [''])[0];
    vm.runInContext('function _tracedFcs(){ return []; }\n' + vague + '\n' + ph + '\n' + lints +
        '\n;globalThis.L = {}; LINTS.forEach(l => L[l.id] = l);', sb);
    const L = sb.L;

    // A probabilistic requirement with no number in it is the case the lint exists for.
    const noNum = { text: 'The system shall be reliable.', analysis: 'Probabilistic', type: 'Safety' };
    check('a Probabilistic requirement with no number FAILS verifiable',
        L.verifiable.run(noNum).pass === false,
        'this was unreachable after the migration — it keyed on type "Quantitative", which no longer exists');
    check('…and the legacy type still works, for anything not yet migrated',
        L.verifiable.run({ text: 'The system shall be reliable.', type: 'Quantitative' }).pass === false);
    check('a quantified one passes',
        L.verifiable.run({ text: 'shall not exceed 1e-9 per flight hour', analysis: 'Probabilistic' }).pass === true);

    check('type Derived is treated as derived, so a rationale is demanded',
        L.rationale.run({ text: 'x shall y', type: 'Derived', rat: '' }).pass === false,
        'the form now writes type "Derived" with level L1 — the old level test caught none of them');
    check('a derived requirement WITH a rationale passes',
        L.rationale.run({ text: 'x shall y', type: 'Derived', rat: 'because' }).pass === true);
    check('the AutoReq derivationType path still works',
        L.rationale.run({ text: 'x shall y', derivationType: 'derived', rat: '' }).pass === false);
    check('both fixes explain themselves in the source',
        /a lint that\s*\n\s*\/\/ cannot fire looks exactly like a lint that passes/.test(vv) &&
        /'Derived' is a §5\.3\.1\.10 TYPE now, not a level/.test(vv));
}

// ---------------------------------------------------------------------------
console.log('\n[spec] _SPEC_REQ stops competing with the engine');
{
    const spec = (ai.match(/const _SPEC_REQ = \[[\s\S]*?\]\.join\('\\n'\);/) || [''])[0];
    check('the DAL instruction is gone',
        !/assigned development assurance level/.test(spec) && !/\| FDAL \|/.test(spec));
    check('…and is replaced by an explicit prohibition',
        /NEVER assign a development assurance level/.test(spec) &&
        /a guess competing with a computed value/.test(spec));
    // Scoped to the SPEC BLOCK, not the whole file: the comment above _SPEC_REQ
    // quotes the old "| FDAL |" format line to explain why it went, and a
    // whole-file test would fail on its own explanation. Same self-eating-guard
    // trap as the copyright detector that contained the string it detected.
    check('it no longer contradicts _SPEC_ARCH',
        /NEVER allocate a DAL/.test(ai) && !/\| FDAL \|/.test(spec) &&
        !/\| FDAL \|/.test(ai.replace(/\/\/[^\n]*/g, '')),
        'two specs in one file gave the model opposite instructions on the same question');
    check('the class list is the §5.3.1 eleven, verbatim',
        T.CLASS_LABELS.every(l => spec.indexOf(l) >= 0) &&
        /Maintainability/.test(spec) && !/operational, maintenance, derived/.test(spec),
        'it said "maintenance" where §5.3.1.7 says Maintainability');
    check('the classes a generator already owns are declared off limits',
        /DO NOT PROPOSE these — a deterministic generator already owns them/.test(spec) &&
        /development assurance levels \(FDAL\/IDAL\)/.test(spec) &&
        /crew-task operational requirements/.test(spec));
    check('…and the model is told what its lane actually is',
        /YOUR LANE is the classes no analysis derives/.test(spec) &&
        /Functional, Customer, Performance, Physical and Installation, Certification/.test(spec));
    check('it says the text is deterministically linted afterwards',
        /linted deterministically after you write it/.test(spec),
        'the syntax rules were prompt-only; vv_validation already enforces most of them');
    check('no ARP clause prose was pasted in',
        !/interconnections along with the relevant characteristics/.test(ai) &&
        !/Actions, decisions, information requirements, and timing constitute/.test(ai));
}

console.log('\n[spec] …and the row the AI path writes is in the product vocabulary');
{
    check("level no longer defaults to 'Aircraft'",
        !/level: rq\.level \|\| 'Aircraft'/.test(ai) && /_validReqLevel\(rq\.level\)/.test(ai),
        "'Aircraft' existed in no other level vocabulary — generators and the form both use L1/L2/L3");
    check('_validReqLevel accepts only L1/L2/L3',
        /\(s === 'L1' \|\| s === 'L2' \|\| s === 'L3'\) \? s : 'L1'/.test(ai));
    check('the review card shows a real level too',
        !/x\.level \|\| 'Aircraft'/.test(ai) && /_validReqLevel\(x\.level\)/.test(ai),
        'the card displayed the same phantom default the writer used');
    check('the class is normalised through the same migration as every stored row',
        /RT\.migrateRow\(row\)/.test(ai) && /!RT\.isKnownClass\(row\.type\)\) row\.type = 'Safety'/.test(ai),
        'a model answering "maintenance" must land on §5.3.1.7, not invent a twelfth value');
}

// ---------------------------------------------------------------------------
console.log('\n[iface] §5.3.1.8 interface requirements, executed');
function runIface(edges, systems, scope) {
    const sb = { console, Object, String, Array, JSON, Date }; sb.window = sb;
    vm.createContext(sb);
    const fn = (asr.match(/function genInterface\(scopeKey\)\{[\s\S]*?\n    \}/) || [''])[0];
    vm.runInContext('let projectConfig = { interfaces: [] }, systemsData = [];\n' +
        'function fp(){ return "fp"; }\n' + fn +
        '\n;globalThis.T = { gen: genInterface, set: (e, s) => { projectConfig.interfaces = e; systemsData = s; } };', sb);
    sb.T.set(edges, systems || []);
    return sb.T.gen(scope || 'ac');
}
const SYS = [{ id: 'sys-avi', name: 'Avionics' }, { id: 'sys-fcs', name: 'Flight Controls' }];
{
    const complete = { id: 'IF-1', fromSystemId: 'sys-avi', toSystemId: 'sys-fcs', kind: 'functional',
                       direction: 'a_to_b', medium: 'Attitude/air data (ARINC 429)', icdRef: 'ICD-AVI-FCS-001' };
    const out = runIface([complete], SYS);
    check('a complete edge yields one interface requirement',
        out.length === 1 && out[0].reqSource.generator === 'iface-def');
    check('the text names both ends, the medium and the ICD',
        /The interface from Avionics to Flight Controls carrying Attitude\/air data \(ARINC 429\) shall be defined in accordance with ICD-AVI-FCS-001/.test(out[0].text),
        out[0].text);
    check('…and demands source, destination and signal behaviour, as the clause does',
        /the source of every input, the destination of every output, and the behaviour of the signals fully described/.test(out[0].text));
    check('it is Interface class, L2, from the interface register',
        out[0].type === 'Interface' && out[0].level === 'L2' && out[0].analysis === 'Interface register');
    check('a complete edge says so rather than implying a gap',
        /the clause's completeness conditions are met/.test(out[0].rat) &&
        !/INCOMPLETE/.test(out[0].rat));
    check('a functional edge is called out as a propagation path',
        /a loss here propagates as a functional failure/.test(out[0].rat));

    const bare = runIface([{ fromSystemId: 'sys-avi', toSystemId: 'sys-fcs', kind: 'interface' }], SYS);
    check('an INCOMPLETE edge still generates a requirement',
        bare.length === 1,
        'skipping it would hide the gap; the requirements register is where it becomes somebody\'s problem');
    check('…and the rationale names every missing element',
        /INCOMPLETE against the clause/.test(bare[0].rat) &&
        /no medium or signal set is recorded/.test(bare[0].rat) &&
        /no direction is recorded/.test(bare[0].rat) &&
        /no ICD reference, so nothing fully describes the behaviour of the signals/.test(bare[0].rat));
    check('…and the text does not pretend an ICD or medium exists',
        !/in accordance with/.test(bare[0].text) && !/carrying/.test(bare[0].text));
    check('a missing endpoint is reported, not crashed on',
        (function () { const o = runIface([{ fromSystemId: 'sys-avi', kind: 'interface' }], SYS);
            return o.length === 1 && /an endpoint is undefined/.test(o[0].rat); })());

    const res = runIface([Object.assign({}, complete, { id: 'IF-2', kind: 'resource' })], SYS);
    check('a shared-resource edge is flagged as a common-cause candidate',
        /SHARED RESOURCE edge/.test(res[0].rat) && /the CMA evaluates whether it defeats an independence claim/.test(res[0].rat));

    const bidi = runIface([Object.assign({}, complete, { direction: 'bidirectional' })], SYS);
    check('a bidirectional edge says so', /, in both directions/.test(bidi[0].text));
    const rev = runIface([Object.assign({}, complete, { direction: 'b_to_a' })], SYS);
    check('a reversed edge reads in the right order',
        /from Flight Controls to Avionics/.test(rev[0].text));

    check('no interfaces means no requirements, not an empty stub',
        runIface([], SYS).length === 0);
    check('the lane is aircraft scope only',
        runIface([complete], SYS, 'sys-avi').length === 0,
        'a system scope would be claiming ownership of the far end of the edge too');
    check('sourceIds are stable across a rerun',
        runIface([complete], SYS)[0].reqSource.sourceId === 'ac:iface-def:IF-1');
    check('an edge with no id still gets a deterministic sourceId',
        runIface([{ fromSystemId: 'sys-avi', toSystemId: 'sys-fcs', kind: 'interface' }], SYS)[0]
            .reqSource.sourceId === 'ac:iface-def:sys-avi->sys-fcs:interface');
}

console.log('\n[iface] the lane is reachable');
{
    check('genInterface is called from generate()',
        /if\(opts\.iface\) candidates\.push\(\.\.\.genInterface\(scope\)\);/.test(asr));
    // Not anchored to the end of the object — that exact regex broke once when a
    // key was added after it (HANDOFF §7.3: assert the invariant, not the literal).
    check('…and defaults ON', /hfOperational:true, iface:true/.test(asr));
    check('the orphan sweep knows the prefix',
        /\(g\.startsWith\('iface'\) && opts\.iface\)/.test(asr),
        'without it, turning the lane off DELETES its requirements');
    check('the preview reads the toggle', /iface:            cb\('ar-gen-iface'\)/.test(help));
    check('the toggle exists and cites the clause',
        /id="ar-gen-iface" checked/.test(html) && /ARP4754B &sect;5\.3\.1\.8/.test(html));
    check('"Interface register" is a declared analysis kind',
        T.ANALYSIS_LABELS.indexOf('Interface register') >= 0);
    check('Interface is a §5.3.1.8 class in the taxonomy',
        T.clauseFor('Interface') === 'ARP4754B §5.3.1.8');
}

console.log('\n[scope] what was deliberately NOT built');
{
    check('no fault-isolation generator was invented',
        !/isolat(ion|ed)/i.test(asr.replace(/fault isolation \(§5\.3\.1\.7[^)]*\)/g, '')),
        'FMEA carries a detection field and no isolation field — there is nothing to compute from');
    check('the refusal is recorded in this file, not just omitted',
        /NOT BUILT, DELIBERATELY: fault isolation/.test(fs.readFileSync(__filename, 'utf8')));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;

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
// 24 Oct 2026 (Waqas): the interface-requirement lane is RETIRED. Interfaces and their requirements belong to
// Sys Lab (or the customer's own tool); Safety Lab imports interfaces for its analyses and writes no requirement
// from them. Rows it wrote before are offered as "source gone" on the next generation, never removed silently.
console.log('\n[iface] the interface-requirement lane is retired');
{
    check('genInterface no longer exists', !/function genInterface\(/.test(asr));
    check('generate() no longer calls it, and no iface switch is defaulted on',
        !/genInterface\(scope\)/.test(asr) && !/iface:true/.test(asr));
    check('stored interface requirements are always swept as source gone (the engineer decides)',
        /g\.startsWith\('iface'\) \|\|/.test(asr) && !/\(g\.startsWith\('iface'\) && opts\.iface\)/.test(asr));
    check('the preview has no interface toggle', !/ar-gen-iface/.test(help) && !/id="ar-gen-iface"/.test(html));
    check('"Interface" stays a requirement class (imported interface requirements keep their class)',
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

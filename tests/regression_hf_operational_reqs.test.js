#!/usr/bin/env node
/*
 * Regression — ARP4754B §5.3.1.4 operational requirements from the HF register.
 *
 * WHY THIS LANE EXISTS. §5.1.8 is the mandate: where human-performed tasks or
 * limitations are relied on to ensure safety, or form part of the certification
 * substantiation, they are to be identified and recorded in the certification
 * data. The HF register already IDENTIFIED them — a typed Human Factors
 * assumption is exactly that. Nothing RECORDED them as requirements, so a crew
 * credit lived only as an assumption and never acquired a verification method.
 * "Human Factors" was one of the requirement types with zero generators.
 *
 * WHAT IS AND IS NOT DERIVABLE. §5.3.1.4 names four things as the bulk of an
 * operational requirement — actions, decisions, information requirements, and
 * timing. Three come out of what the register actually holds:
 *
 *   ACTION      hf.crewmember + hf.direction + the statement, QUOTED not
 *               paraphrased. Every other generator builds text from structured
 *               fields; the action exists only as the analyst's prose, and
 *               rewriting an engineer's words into an imperative is how meaning
 *               gets changed without anyone deciding to change it.
 *   TIMING      hf.taskTimeS + hf.taskTimeBasis. The strongest: a number with a
 *               stated provenance.
 *   INFORMATION hf.channels, sensory ones ONLY. The pack mixes input channels
 *               (visual, auditory, tactile) with response and resource channels
 *               (psychomotor, verbal, cognitive). "Presented via the cognitive
 *               channel" is not a sentence about a display.
 *
 * DECISIONS ARE NOT GENERATED, and that is the point of half this file. There is
 * no decision field on the register. Deriving one from direction or workload band
 * would be invention wearing the costume of derivation.
 *
 * THE BUG FOUND ON THE WAY IN. hfaItems() branched on recovery / non-recovery /
 * workload with no else. The shipped Aeolus HL-1 showcase authors three
 * prevention-direction assumptions — a loadmaster checking a load sheet, a PM
 * checking a door latch. Measured live on that demo: SIX HF-typed assumptions,
 * THREE validation items. The prevention half fell off the end of the chain and
 * produced nothing — no work item, no method, no trace. A shorter list looks
 * exactly like a shorter list.
 *
 * Run: node tests/regression_hf_operational_reqs.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const SITE = path.join(__dirname, '..', 'site');
const S = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const hf = S('hf_assumptions.js'), asr = S('assurance_modules.js'),
      help = S('helpers_modules.js'), html = S('index.html');

// ---------------------------------------------------------------------------
console.log('\n[hf] every direction produces validation work');
{
    const sb = { console, Object, String, Array }; sb.window = sb; vm.createContext(sb);
    const fn = (hf.match(/function hfaItems\(\)[\s\S]*?\n    \}/) || [''])[0];
    vm.runInContext(
        'let ROWS = [];\n' +
        'function asmAllTyped(){ return ROWS; }\n' +
        'function isValidated(s){ return s === "Validated" || s === "Verified"; }\n' +
        fn + '\n;globalThis.T = { hfaItems, set: r => { ROWS = r; } };', sb);
    const T = sb.T;
    const mk = (id, dir) => ({ asmId: id, type: 'hf', state: 'Proposed', text: 't-' + id, hf: { direction: dir, channels: [] } });

    T.set([mk('A', 'recovery'), mk('B', 'non-recovery'), mk('C', 'workload'), mk('D', 'prevention')]);
    const items = T.hfaItems();
    check('prevention now produces a validation item',
        items.some(i => i.asmId === 'D' && /HFA-D-P$/.test(i.hfaId)),
        'three of the six HF assumptions in the shipped HL-1 demo were this case, and produced nothing');
    check('…and it asks for the right work',
        /reliably performs the preventive task/.test((items.find(i => i.asmId === 'D') || {}).work || ''));
    check('the original three still behave',
        items.filter(i => ['A', 'B', 'C'].indexOf(i.asmId) >= 0).length === 3);
    check('every assumption produces exactly one item',
        items.length === 4);

    T.set([mk('E', 'sideways')]);
    const odd = T.hfaItems();
    check('an unrecognised direction is NOT silently dropped',
        odd.length === 1 && odd[0].unclassified === true,
        'a credited crew task that vanishes because its enum is wrong is the failure mode this whole file exists for');
    check('…and the item says what to fix',
        /is not one of prevention \/ recovery \/ non-recovery \/ workload/.test(odd[0].method));
}

// ---------------------------------------------------------------------------
console.log('\n[hf] the generator, executed');
function runGen(assumptions, fhaRows) {
    const sb = { console, Object, String, Array, Math, JSON, RegExp, Date }; sb.window = sb;
    vm.createContext(sb);
    const fn = (asr.match(/function genHfOperational\(scopeKey\)\{[\s\S]*?\n    \}/) || [''])[0];
    vm.runInContext(
        'const systemsData = [];\n' +
        'let FHA = [];\n' +
        'function fhaArrForScope(){ return FHA; }\n' +
        'function fp(){ return "fp"; }\n' +
        'window.HF_ASSUMPTIONS = { asmAllTyped: () => ASM, isValidated: s => s === "Validated" || s === "Verified",\n' +
        '  phasesNormalized: () => PHASES, TIME_OCCUPANCY_RED_LINE: 0.8 };\n' +
        'let ASM = [], PHASES = [];\n' +
        fn + '\n;globalThis.T = { gen: genHfOperational, set: (a, f, p) => { ASM = a; FHA = f || []; PHASES = p || []; } };', sb);
    sb.T.set(assumptions, fhaRows, [{ id: 'Approach', name: 'Approach', windowS: 30 },
                                    { id: 'Cruise', name: 'Cruise', windowS: 0 }]);
    return sb.T.gen('ac');
}
const asm = (over) => Object.assign({
    asmId: 'ASM-HF-001', type: 'hf', scope: 'Aircraft', state: 'Proposed',
    text: 'The PF re-trims manually within 3 s of an uncommanded trim input.',
    hf: { direction: 'recovery', responsePhase: 'Approach', crewmember: 'PF',
          taskTimeS: 3, taskTimeBasis: 'Sim K350-SIM-014', channels: ['visual', 'cognitive', 'psychomotor'] }
}, over || {});

{
    const out = runGen([asm()], [{ internalId: 1, fcId: 'FC-01', severity: 'Catastrophic', assumptionIds: ['ASM-HF-001'] }]);
    const by = g => out.find(r => r.reqSource.generator === g);
    check('one assumption yields action + timing + information',
        out.length === 3 && by('hf-op-action') && by('hf-op-timing') && by('hf-op-info'),
        out.map(r => r.reqSource.generator).join(','));
    check('the action QUOTES the analyst, it does not paraphrase',
        by('hf-op-action').text.indexOf('"The PF re-trims manually within 3 s of an uncommanded trim input."') > 0 &&
        /reproduced verbatim from the assumption/.test(by('hf-op-action').rat));
    check('the timing requirement carries the number and the phase',
        /shall complete the task credited by ASM-HF-001 within 3 seconds during Approach\./.test(by('hf-op-timing').text));
    check('…and reports the share of the response window it eats',
        /response window is 30 s, so this task alone occupies 10%/.test(by('hf-op-timing').rat));
    check('a simulator basis is verified by Test, not Analysis',
        by('hf-op-timing').verifMethod === 'Test',
        'a basis naming a sim IS test evidence; calling it Analysis understates what exists');
    check('the information requirement uses ONLY the sensory channels',
        /presented via the visual channel during Approach\./.test(by('hf-op-info').text),
        'got: ' + by('hf-op-info').text);
    check('…and says why the others were excluded rather than dropping them quietly',
        /also declares cognitive, psychomotor/.test(by('hf-op-info').rat) &&
        /not what the system must present/.test(by('hf-op-info').rat));
    check('every row is Operational class, Human Factors analysis, L1',
        out.every(r => r.type === 'Operational' && r.analysis === 'Human Factors' && r.level === 'L1'),
        'this is the type that had zero generators');
    check('the §5.1.8 mandate is on every rationale',
        out.every(r => /ARP4754B §5\.1\.8/.test(r.rat)));
    check('an unvalidated credit says so, and names the invariant',
        /is NOT yet validated/.test(by('hf-op-action').rat) && /INV-35/.test(by('hf-op-action').rat));
    check('the failure condition it holds up is named, with its severity flagged',
        /Relied on by FC-01 \(includes a Catastrophic\/Hazardous condition\)/.test(by('hf-op-action').rat));
    check('sourceIds are stable and distinct per element',
        out.map(r => r.reqSource.sourceId).sort().join('|') ===
        'ac:hf-op-action:ASM-HF-001|ac:hf-op-info:ASM-HF-001|ac:hf-op-timing:ASM-HF-001');
}

console.log('\n[hf] …and what it refuses to invent');
{
    check('NO decision requirement is generated, ever',
        !/hf-op-decision/.test(asr) && runGen([asm()], []).every(r => !/decision/i.test(r.text)),
        'there is no decision field on the register; deriving one would be invention wearing the costume of derivation');
    check('…and the refusal is written down where the next reader will be',
        /DECISIONS\s+— NOT GENERATED/.test(asr) && /invention dressed as derivation/.test(asr));

    const noTime = runGen([asm({ hf: Object.assign({}, asm().hf, { taskTimeS: null }) })], []);
    check('no task time means no timing requirement — not a guessed one',
        !noTime.some(r => r.reqSource.generator === 'hf-op-timing') && noTime.length === 2);

    const noSensory = runGen([asm({ hf: Object.assign({}, asm().hf, { channels: ['cognitive', 'verbal'] }) })], []);
    check('response-only channels yield no information requirement',
        !noSensory.some(r => r.reqSource.generator === 'hf-op-info'),
        '"presented via the cognitive channel" is not a sentence about a display');

    const noCrew = runGen([asm({ hf: Object.assign({}, asm().hf, { crewmember: '' }) })], []);
    check('no responsible party means no operational requirement at all',
        noCrew.length === 0, 'a requirement with nobody to meet it is not a requirement');

    const notHf = runGen([asm({ type: 'dz' }), asm({ asmId: 'X', scope: 'Hydraulics' })], []);
    check('only HF-typed assumptions in THIS scope are read',
        notHf.length === 0);

    const noBasis = runGen([asm({ hf: Object.assign({}, asm().hf, { taskTimeBasis: '' }) })], []);
    const t = noBasis.find(r => r.reqSource.generator === 'hf-op-timing');
    check('an unsubstantiated task time is called one',
        /No basis is recorded for this task time — it is an assumed number until one is\./.test(t.rat) &&
        t.verifMethod === 'Analysis');

    const noWin = runGen([asm({ hf: Object.assign({}, asm().hf, { responsePhase: 'Cruise' }) })], []);
    check('a phase with no authored window says the saturation check is silent there',
        /INV-36 saturation is silent here and this time is unbounded by anything/.test(
            noWin.find(r => r.reqSource.generator === 'hf-op-timing').rat));

    const over = runGen([asm({ hf: Object.assign({}, asm().hf, { taskTimeS: 27 }) })], []);
    check('a task time past the 80% red line is flagged on the requirement itself',
        /past the 80% time-occupancy red line before any co-activated task is counted \(INV-36\)/.test(
            over.find(r => r.reqSource.generator === 'hf-op-timing').rat));

    const prev = runGen([asm({ hf: Object.assign({}, asm().hf, { direction: 'prevention' }) })], []);
    check('§5.3.1.4 wants normal AND non-normal — the circumstance is stated per row',
        /Circumstance: normal operation \(the task prevents the condition arising\)/.test(
            prev.find(r => r.reqSource.generator === 'hf-op-action').rat) &&
        /Circumstance: non-normal operation/.test(
            runGen([asm()], []).find(r => r.reqSource.generator === 'hf-op-action').rat));

    const orphan = runGen([asm()], []);
    check('an unlinked credit is reported rather than looking load-bearing',
        /Not yet linked to a failure condition — the credit is recorded but nothing rests on it\./.test(
            orphan.find(r => r.reqSource.generator === 'hf-op-action').rat));
}

// ---------------------------------------------------------------------------
console.log('\n[hf] the lane is reachable');
{
    check('genHfOperational is called from generate()',
        /if\(opts\.hfOperational\) candidates\.push\(\.\.\.genHfOperational\(scope\)\);/.test(asr));
    // Order-independent: this broke when the interface lane was appended after it,
    // which proves nothing about whether the lane defaults on.
    check('…and defaults ON when generate() is called with no opts',
        /opts = opts \|\| \{[^}]*hfOperational:true[^}]*\}/.test(asr));
    check('the orphan sweep knows the generator prefix',
        /\(g\.startsWith\('hf-op'\) && opts\.hfOperational\)/.test(asr),
        'without this, turning the lane off DELETES its requirements instead of leaving them alone');
    check('the preview panel reads the toggle',
        /hfOperational:    cb\('ar-gen-hf'\)/.test(help));
    check('the toggle exists in the settings panel',
        /id="ar-gen-hf" checked/.test(html) && /ARP4754B &sect;5\.3\.1\.4/.test(html));
    check('the panel says which of the four elements are covered',
        /actions, timing, information/.test(html) && /Decisions are not/.test(html));
    check('no ARP clause prose was copied in with the citations',
        !/constitute the bulk of the operational requirements/.test(asr) &&
        !/should be identified and recorded in the certification data/.test(asr.replace(/is to be identified and recorded in the certification data/g, '')),
        'clause numbers and titles are fine; reproducing the paragraph is not');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
